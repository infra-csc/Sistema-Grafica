// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVAMENTO AUTOMÁTICO — evento 2 semanas depois da data (dono, 19/10).
//
// A regra pura (fuso de Brasília, borda do 14º dia, sem data, arquivado,
// reaberto, restaurado), a rodada (mesmo arquivar do botão Excluir, com a
// assinatura do automático) e o agendador (atraso na partida, 1x por dia,
// erro não derruba). O Exportar Excel ignorando arquivado e o fechamento do
// admin moram em fechamento-do-evento.test.ts; o DELETE da tela, em
// arquivar-evento-e-patrocinador.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
  };
});

const {
  deveArquivarAutomaticamente, eventosParaArquivar, diaDoArquivamento, fraseDoArquivamentoAutomatico,
  arquivarEventosVencidos, rodadaDoArquivamentoAutomatico, startArquivamentoAutomatico,
  arquivamentoAutomaticoLigado, ATRASO_NA_PARTIDA_MS, INTERVALO_MS,
} = await import("../services/arquivamento-automatico");
const { ARQUIVADO_POR_AUTOMATICO, DIAS_PARA_ARQUIVAR, foiArquivadoAutomaticamente } = await import("@shared/arquivamento-automatico");

// O evento de 01/10/2026 (start_date gravada à meia-noite UTC).
const DIA_DO_EVENTO = new Date("2026-10-01T00:00:00Z");
const ev = (over: Record<string, unknown> = {}) => ({ startDate: DIA_DO_EVENTO, arquivadoEm: null, reopenedAt: null, restauradoEm: null, ...over });

describe("a regra (pura, recebe o agora)", () => {
  it("são 14 dias", () => {
    expect(DIAS_PARA_ARQUIVAR).toBe(14);
    expect(new Date(diaDoArquivamento(ev())!).toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });

  it("borda do 14º dia, no fuso de Brasília: 14/10 23:59 não; 15/10 00:00 sim", () => {
    expect(deveArquivarAutomaticamente(ev(), new Date("2026-10-15T02:59:59-00:00"))).toBe(false); // 14/10 23:59:59 BRT
    expect(deveArquivarAutomaticamente(ev(), new Date("2026-10-15T03:00:00Z"))).toBe(true); // 15/10 00:00 BRT
    expect(deveArquivarAutomaticamente(ev(), new Date("2026-12-01T12:00:00Z"))).toBe(true); // muito depois
  });

  it("o fuso manda: em UTC já é dia 15, em Brasília ainda é 14 → não arquiva", () => {
    expect(deveArquivarAutomaticamente(ev(), new Date("2026-10-15T01:00:00Z"))).toBe(false);
  });

  it("antes do 14º dia (no dia do evento, ou 13 dias depois) não arquiva", () => {
    expect(deveArquivarAutomaticamente(ev(), new Date("2026-10-01T15:00:00Z"))).toBe(false);
    expect(deveArquivarAutomaticamente(ev(), new Date("2026-10-14T15:00:00Z"))).toBe(false);
  });

  it("evento sem data, com data inválida ou ano absurdo: nunca", () => {
    const agora = new Date("2030-01-01T12:00:00Z");
    expect(deveArquivarAutomaticamente(ev({ startDate: null }), agora)).toBe(false);
    expect(deveArquivarAutomaticamente(ev({ startDate: "" }), agora)).toBe(false);
    expect(deveArquivarAutomaticamente(ev({ startDate: "lixo" }), agora)).toBe(false);
    expect(deveArquivarAutomaticamente(ev({ startDate: "0206-10-01T00:00:00Z" }), agora)).toBe(false);
  });

  it("já arquivado: não mexe (nem regrava quem/quando)", () => {
    expect(deveArquivarAutomaticamente(ev({ arquivadoEm: new Date("2026-10-02T12:00:00Z") }), new Date("2026-11-01T12:00:00Z"))).toBe(false);
  });

  it("reaberto à mão DEPOIS da data fica (há trabalho ali); reaberto antes da data não protege", () => {
    const agora = new Date("2026-11-01T12:00:00Z");
    expect(deveArquivarAutomaticamente(ev({ reopenedAt: new Date("2026-10-03T12:00:00Z") }), agora)).toBe(false);
    expect(deveArquivarAutomaticamente(ev({ reopenedAt: new Date("2026-09-20T12:00:00Z") }), agora)).toBe(true);
  });

  it("caso real (19/10): Eco Run Navegantes, data 11/10, reaberto pelo dono porque mudou de data — NÃO some em 25/10", () => {
    const ecoRun = { startDate: new Date("2026-10-11T00:00:00Z"), arquivadoEm: null, reopenedAt: new Date("2026-10-19T14:00:00Z"), restauradoEm: null };
    expect(deveArquivarAutomaticamente(ecoRun, new Date("2026-10-25T15:00:00Z"))).toBe(false);
    expect(deveArquivarAutomaticamente(ecoRun, new Date("2027-03-01T15:00:00Z"))).toBe(false);
    // Sem a reabertura, 25/10 seria o dia dele.
    expect(deveArquivarAutomaticamente({ ...ecoRun, reopenedAt: null }, new Date("2026-10-25T15:00:00Z"))).toBe(true);
  });

  it("data do evento mudada para o futuro: os 14 dias recomeçam pela data nova", () => {
    const remarcado = ev({ startDate: new Date("2026-11-08T00:00:00Z") }); // era 01/10
    expect(deveArquivarAutomaticamente(remarcado, new Date("2026-10-25T15:00:00Z"))).toBe(false);
    expect(deveArquivarAutomaticamente(remarcado, new Date("2026-11-22T02:59:00Z"))).toBe(false); // 21/11 23:59 BRT
    expect(deveArquivarAutomaticamente(remarcado, new Date("2026-11-22T03:00:00Z"))).toBe(true); // 22/11 00:00 BRT
    // Reaberto em 19/10 (antes da data NOVA): a licença não vale depois de 08/11, como em motivoEventoFinalizado.
    const remarcadoEReaberto = { ...remarcado, reopenedAt: new Date("2026-10-19T14:00:00Z") };
    expect(deveArquivarAutomaticamente(remarcadoEReaberto, new Date("2026-11-22T03:00:00Z"))).toBe(true);
  });

  it("restaurado pelo admin depois de vencido não volta a ser arquivado; restaurado antes do prazo, sim", () => {
    const agora = new Date("2026-11-01T12:00:00Z");
    expect(deveArquivarAutomaticamente(ev({ restauradoEm: new Date("2026-10-20T12:00:00Z") }), agora)).toBe(false);
    expect(deveArquivarAutomaticamente(ev({ restauradoEm: new Date("2026-10-15T03:00:00Z") }), agora)).toBe(false);
    expect(deveArquivarAutomaticamente(ev({ restauradoEm: new Date("2026-10-05T12:00:00Z") }), agora)).toBe(true);
  });

  it("eventosParaArquivar recorta a lista", () => {
    const lista = [
      { id: "a", ...ev() },
      { id: "b", ...ev({ startDate: new Date("2026-10-10T00:00:00Z") }) },
      { id: "c", ...ev({ startDate: null }) },
    ];
    expect(eventosParaArquivar(lista, new Date("2026-10-19T15:00:00Z")).map((e) => e.id)).toEqual(["a"]);
  });

  it("a frase da trilha diz o quê, quando e que restaurar devolve tudo", () => {
    const f = fraseDoArquivamentoAutomatico({ name: "Night Run", startDate: DIA_DO_EVENTO }, 12, 10);
    expect(f).toBe('Evento "Night Run" arquivado automaticamente 14 dias após a data do evento (01/10/2026) — 12 peças saíram de vista (10 já entregues). Nada foi apagado: restaurar devolve tudo como estava');
    expect(fraseDoArquivamentoAutomatico({ name: "X", startDate: DIA_DO_EVENTO }, 1, 1)).toContain("1 peça saiu de vista (1 já entregue)");
  });

  it("a assinatura do automático é reconhecível pela tela", () => {
    expect(ARQUIVADO_POR_AUTOMATICO).toBe("Automático — 2 semanas após o evento");
    expect(foiArquivadoAutomaticamente(ARQUIVADO_POR_AUTOMATICO)).toBe(true);
    expect(foiArquivadoAutomaticamente("Maria")).toBe(false);
    expect(foiArquivadoAutomaticamente(null)).toBe(false);
  });
});

// ── A rodada: mesmo arquivar do botão Excluir ─────────────────────────────────
let eventos: Record<string, any>;
let pecas: any[];
let trilha: Array<{ ator: unknown; acao: string; tipo: string; id: string; det: string }>;
let sinais: any[];

beforeEach(() => {
  eventos = {
    velho: { id: "velho", name: "Night Run Teresina", startDate: new Date("2026-09-20T00:00:00Z"), arquivadoEm: null, reopenedAt: null, restauradoEm: null },
    recente: { id: "recente", name: "Girl Power RJ", startDate: new Date("2026-10-12T00:00:00Z"), arquivadoEm: null, reopenedAt: null, restauradoEm: null },
    semPecas: { id: "semPecas", name: "Evento Vazio", startDate: new Date("2026-09-01T00:00:00Z"), arquivadoEm: null, reopenedAt: null, restauradoEm: null },
  };
  pecas = [
    { id: "p1", eventId: "velho", status: "delivered" },
    { id: "p2", eventId: "velho", status: "conferred" },
    { id: "p3", eventId: "recente", status: "draft" },
  ];
  trilha = [];
  sinais = [];
  H.broadcast = vi.fn((m: any) => { sinais.push(m); });
  H.createAuditLog = vi.fn(async (ator: unknown, acao: string, tipo: string, id: string, det: string) => { trilha.push({ ator, acao, tipo, id, det }); });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getAllEvents = vi.fn(async () => Object.values(eventos).filter((e: any) => !e.arquivadoEm));
  s.getItemsByEvent = vi.fn(async (id: string) => (eventos[id]?.arquivadoEm ? [] : pecas.filter((p) => p.eventId === id)));
  s.arquivarEvento = vi.fn(async (id: string, por: string | null) => {
    if (!eventos[id] || eventos[id].arquivadoEm) return undefined;
    return (eventos[id] = { ...eventos[id], arquivadoEm: new Date(), arquivadoPor: por });
  });
});

describe("arquivarEventosVencidos (a rodada)", () => {
  const HOJE = new Date("2026-10-19T15:00:00Z");

  it("arquiva só os vencidos, assinando como o automático, com a trilha e os avisos do Excluir", async () => {
    const r = await arquivarEventosVencidos(HOJE);
    expect(r).toEqual({ arquivados: 2, pecas: 2, falhas: 0 });
    expect(H.storage.arquivarEvento).toHaveBeenCalledWith("velho", ARQUIVADO_POR_AUTOMATICO);
    expect(H.storage.arquivarEvento).toHaveBeenCalledWith("semPecas", ARQUIVADO_POR_AUTOMATICO);
    expect(H.storage.arquivarEvento).not.toHaveBeenCalledWith("recente", expect.anything());
    expect(eventos.velho.arquivadoPor).toBe("Automático — 2 semanas após o evento");

    const doVelho = trilha.find((t) => t.id === "velho")!;
    expect(doVelho).toMatchObject({ ator: "Sistema", acao: "deleted", tipo: "event" });
    expect(doVelho.det).toContain('Evento "Night Run Teresina" arquivado automaticamente 14 dias após a data do evento (20/09/2026)');
    expect(doVelho.det).toContain("2 peças saíram de vista (1 já entregue)");
    expect(doVelho.det).toContain("restaurar devolve tudo");

    expect(sinais).toContainEqual({ type: "event_deleted", eventId: "velho" });
    expect(sinais).toContainEqual({ type: "items_bulk_updated", itemIds: ["p1", "p2"], eventId: "velho" });
    // Sem peças: tira o evento, não pede delta de peças.
    expect(sinais).toContainEqual({ type: "event_deleted", eventId: "semPecas" });
    expect(sinais.filter((m) => m.type === "items_bulk_updated" && m.eventId === "semPecas")).toEqual([]);
  });

  it("segunda rodada (ou outra cópia) não regrava nem avisa em dobro", async () => {
    await arquivarEventosVencidos(HOJE);
    const antes = { trilha: trilha.length, sinais: sinais.length };
    expect(await arquivarEventosVencidos(HOJE)).toEqual({ arquivados: 0, pecas: 0, falhas: 0 });
    expect({ trilha: trilha.length, sinais: sinais.length }).toEqual(antes);
  });

  it("arquivado por outro caminho no meio da rodada: pula sem trilha", async () => {
    H.storage.arquivarEvento = vi.fn(async () => undefined);
    expect(await arquivarEventosVencidos(HOJE)).toEqual({ arquivados: 0, pecas: 0, falhas: 0 });
    expect(trilha).toEqual([]);
    expect(sinais).toEqual([]);
  });

  it("a falha de um evento não para os outros", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const real = H.storage.arquivarEvento;
    H.storage.arquivarEvento = vi.fn(async (id: string, por: string | null) => {
      if (id === "velho") throw new Error("banco fora");
      return real(id, por);
    });
    expect(await arquivarEventosVencidos(HOJE)).toEqual({ arquivados: 1, pecas: 0, falhas: 1 });
    expect(eventos.semPecas.arquivadoEm).toBeInstanceOf(Date);
    vi.restoreAllMocks();
  });
});

// ── O agendador ───────────────────────────────────────────────────────────────
describe("o agendador", () => {
  const ambiente = { ...process.env };
  afterEach(() => {
    process.env = { ...ambiente };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("roda pouco depois de subir e depois 1x por dia", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T15:00:00Z"));
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { parar } = startArquivamentoAutomatico();
    expect(H.storage.getAllEvents).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ATRASO_NA_PARTIDA_MS);
    expect(H.storage.getAllEvents).toHaveBeenCalledTimes(1);
    expect(eventos.velho.arquivadoPor).toBe(ARQUIVADO_POR_AUTOMATICO);
    await vi.advanceTimersByTimeAsync(INTERVALO_MS);
    expect(H.storage.getAllEvents).toHaveBeenCalledTimes(2);
    expect(INTERVALO_MS).toBe(24 * 60 * 60 * 1000);
    parar();
    await vi.advanceTimersByTimeAsync(INTERVALO_MS * 3);
    expect(H.storage.getAllEvents).toHaveBeenCalledTimes(2);
  });

  it("erro na rodada não derruba o servidor: vira log, e o próximo tique tenta de novo", async () => {
    vi.useFakeTimers();
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    H.storage.getAllEvents = vi.fn(async () => { throw new Error("banco fora do ar"); });
    const rejeicoes: unknown[] = [];
    const aoRejeitar = (e: unknown) => { rejeicoes.push(e); };
    process.on("unhandledRejection", aoRejeitar);
    try {
      const { parar } = startArquivamentoAutomatico();
      await vi.advanceTimersByTimeAsync(ATRASO_NA_PARTIDA_MS);
      await vi.advanceTimersByTimeAsync(INTERVALO_MS);
      parar();
      expect(H.storage.getAllEvents).toHaveBeenCalledTimes(2);
      expect(erro).toHaveBeenCalledWith("[arquivamento-automatico] a rodada falhou:", "banco fora do ar");
      await expect(rodadaDoArquivamentoAutomatico()).resolves.toBeUndefined();
    } finally {
      process.off("unhandledRejection", aoRejeitar);
    }
    expect(rejeicoes).toEqual([]);
  });

  it("ARQUIVAMENTO_AUTOMATICO_ENABLED=false desliga (nenhum relógio sobe)", () => {
    expect(arquivamentoAutomaticoLigado({})).toBe(true);
    expect(arquivamentoAutomaticoLigado({ ARQUIVAMENTO_AUTOMATICO_ENABLED: "FALSE" })).toBe(false);
    process.env.ARQUIVAMENTO_AUTOMATICO_ENABLED = "false";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const timeout = vi.spyOn(globalThis, "setTimeout");
    const intervalo = vi.spyOn(globalThis, "setInterval");
    startArquivamentoAutomatico().parar();
    expect(timeout).not.toHaveBeenCalled();
    expect(intervalo).not.toHaveBeenCalled();
  });
});

// ── A amarração ───────────────────────────────────────────────────────────────
describe("a amarração", () => {
  const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

  it("o servidor sobe o agendador junto com os outros trabalhos de fundo", () => {
    const rotas = ler("server/routes.ts");
    expect(rotas).toContain('import { startArquivamentoAutomatico } from "./services/arquivamento-automatico";');
    expect(rotas).toContain("startArquivamentoAutomatico();");
  });

  it("o Excluir da tela e o automático usam o MESMO passo a passo", () => {
    expect(ler("server/routes/events.ts")).toContain("await arquivarEventoEAvisar(");
    expect(ler("server/services/arquivamento-automatico.ts")).toContain("await arquivarEventoEAvisar(");
  });

  it("as Análises (painel operacional) não trazem peça de evento arquivado", () => {
    expect(ler("server/services/painel-operacional.ts")).toContain("doEventoNaoArquivado(items.eventId),");
  });

  it("a tela de Arquivados diz quem arquivou e oferece o fechamento", () => {
    const modal = ler("client/src/components/modal-de-arquivados.tsx");
    expect(modal).toContain("Arquivado automaticamente${quando} — 2 semanas após o evento");
    const tela = ler("client/src/components/eventos/eventos-arquivados.tsx");
    expect(tela).toContain("Baixar fechamento");
    expect(tela).toContain("data-testid={`eventos-arquivados-fechamento-${l.id}`}");
  });
});
