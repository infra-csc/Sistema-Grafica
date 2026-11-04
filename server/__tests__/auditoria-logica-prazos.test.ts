// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE LÓGICA — PRAZOS e tudo que conta a partir deles (28/10).
//
// Cada `it("ACHADO Px: ...")` prova um achado do logic-auditor: fica VERMELHO
// enquanto o defeito existir. Os de "regra a decidir" também ficam vermelhos,
// mas são decisão do dono, não bug — ver o relatório da rodada.
//
// Só a BORDA é de mentira (db, storage, configuração, liderança e reserva de
// disparo). As regras, os serviços e as rotas são os reais.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from "vitest";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => {
  const h: any = {
    dias: 7,
    storage: {} as Record<string, any>,
    /** tabela (objeto do schema) → linhas devolvidas por db.select().from(tabela) */
    linhas: new Map<any, (campos: any) => any[]>(),
    inserts: [] as { tabela: any; valores: any }[],
    notificacoes: [] as any[],
  };
  const cadeia = (campos: any) => {
    const c: any = { campos, tabela: null };
    c.from = (t: any) => { c.tabela = t; return c; };
    c.where = () => c; c.orderBy = () => c; c.limit = () => c; c.innerJoin = () => c; c.leftJoin = () => c;
    c.then = (ok: any, erro: any) => {
      try {
        const f = h.linhas.get(c.tabela);
        if (!f) throw new Error("tabela sem linhas no mock");
        return Promise.resolve(f(campos)).then(ok, erro);
      } catch (e) { return Promise.reject(e).then(ok, erro); }
    };
    return c;
  };
  h.db = {
    select: (campos?: any) => cadeia(campos),
    insert: (tabela: any) => ({
      values: (valores: any) => {
        h.inserts.push({ tabela, valores });
        const p: any = Promise.resolve([]);
        p.onConflictDoUpdate = () => Promise.resolve([]);
        p.onConflictDoNothing = () => Promise.resolve([]);
        p.returning = () => Promise.resolve([]);
        return p;
      },
    }),
    update: () => ({ set: () => ({ where: () => Promise.resolve([]) }) }),
  };
  return h;
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, broadcast: () => {}, createAuditLog: async () => {} };
});
vi.mock("../services/configuracoes", () => ({
  lerDiasDaAprovacao: async () => H.dias,
  lerConfiguracaoDePrazos: async () => ({ diasDaAprovacao: H.dias, atualizadoEm: null, atualizadoPor: null, padrao: 7 }),
  gravarDiasDaAprovacao: async () => ({ anterior: 7, novo: 7 }),
  esquecerConfiguracoesEmMemoria: () => {},
}));
vi.mock("../services/reservaDeDisparo", () => ({
  ID_DA_INSTANCIA: "teste",
  reservarDisparo: async () => true,
  desfazerReserva: async () => {},
  anotarDesfecho: async () => {},
  limparReservasAntigas: async () => {},
}));
vi.mock("../services/lideranca", () => ({
  executarComoLider: async (_n: string, fn: () => unknown) => { await fn(); return "rodou"; },
  rodarComTrava: async (_n: string, fn: () => unknown) => { await fn(); return "rodou"; },
}));

import { diaDoMarcoUTC } from "@shared/prazo-dates";
import { prazoDeLayoutAjustado, prazoDeLayoutDoEvento } from "@shared/prazo-sem-aprovacao";
import { prioridadePelaSaida } from "@shared/prioridade-do-evento";
import { montarPainelOperacional, pendenciasPorEvento } from "@shared/painel-operacional";
import { prazoSnapshots, prazoEventSnapshots, items as tabelaItems } from "@shared/schema";
import { computePecasAtrasadas } from "@/components/prazos/atrasadas";
import { STAGE_DEFS, buildEventPrazo, computeKpis, type DomainEvent, type DomainItem } from "../services/prazo-domain";
import { capturarRotas } from "./rotas-de-mentira";

const DIA = 86_400_000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number | Date) => new Date(t).toISOString().slice(0, 10);
/** Os seis prazos-padrão do evento ("YYYY-MM-DD"), pela MESMA função do servidor. */
const prazosPadrao = (saida: string) =>
  STAGE_DEFS.map((d) => iso(diaDoMarcoUTC(ms(saida), d.defaultOffset, d.fimDeSemana)));

function evento(over: Partial<DomainEvent> & Record<string, any> = {}): DomainEvent & Record<string, any> {
  return {
    id: "ev-1", name: "EVENTO TESTE", status: "created", priority: null,
    startDate: new Date("2026-12-10T00:00:00Z"), truckDepartureDate: new Date("2026-12-04T00:00:00Z"),
    createdBy: null,
    deadlineListaImagens: null, deadlineEntregaLayouts: null, deadlineAprovacaoLayout: null,
    deadlineFinalizacao: null, deadlineRevisaoLista: null, deadlineProducaoGrafica: null,
    ...over,
  };
}
let seq = 0;
function peca(over: Partial<DomainItem> & Record<string, any> = {}): DomainItem & Record<string, any> {
  seq += 1;
  return { id: `it-${seq}`, displayId: `#${seq}`, eventId: "ev-1", status: "awaiting_submission", type: "2x1", quantity: 1, ...over };
}

afterEach(() => {
  vi.useRealTimers();
  H.linhas.clear();
  H.inserts.length = 0;
  H.notificacoes.length = 0;
  H.dias = 7;
  for (const k of Object.keys(H.storage)) delete H.storage[k];
});

// ═════════════════════════════════════════════════════════════════════════════
// P2 — ALERTAS DE PRAZO: o "fim do dia" é montado na hora LOCAL do processo.
// Produção roda com TZ=America/Sao_Paulo (infra/grafica/compose.app.yaml).
// ═════════════════════════════════════════════════════════════════════════════
describe("alertas de prazo × fuso", () => {
  it("ACHADO P2: fimDoDiaDoPrazo devolve o fim do dia do prazo no fuso do negócio (23:59:59 de Brasília)", async () => {
    const { fimDoDiaDoPrazo } = await import("../services/deadlineAlerts");
    // Saída gravada "04/12 00:00" (hora de parede como UTC — convenção do app).
    const saida = Date.UTC(2026, 11, 4);
    const dia = iso(diaDoMarcoUTC(saida, -20, "seg-sex")); // Entrega de Layouts
    const obtido = fimDoDiaDoPrazo(saida, -20, "deadlineEntregaLayouts");
    // Em TZ=UTC o processo devolve 3h ANTES; em TZ=America/Sao_Paulo, 24h antes
    // (23:59:59 do dia ANTERIOR). Esperado: o fim do dia do prazo em Brasília.
    expect(obtido.toISOString()).toBe(new Date(`${dia}T23:59:59-03:00`).toISOString());
  });

  it("ACHADO P2: o aviso de 24h do Layout AJUSTADO sai quando faltam 24h para o fim do dia (Brasília)", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout", "Date"] });
    const ev = evento({ truckDepartureDate: new Date("2026-12-04T12:00:00Z") });
    const ajustado = prazoDeLayoutAjustado(prazoDeLayoutDoEvento(ev)!, 7);
    const fimReal = Date.parse(`${ajustado}T23:59:59-03:00`);
    // O tique (a cada 30 min) cai 23h50 antes do fim real do dia.
    vi.setSystemTime(fimReal - 24 * 3600_000 + 10 * 60_000 - 30 * 60_000);
    H.storage.getAllEvents = async () => [ev];
    H.storage.getItemsParaPrazos = async () => [peca({ status: "awaiting_submission", skipApproval: true })];
    H.storage.createNotification = async (n: any) => { H.notificacoes.push(n); return { id: "n", ...n }; };
    const { startDeadlineAlerts } = await import("../services/deadlineAlerts");
    startDeadlineAlerts();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    vi.clearAllTimers();
    const msgs = H.notificacoes.map((n) => n.message);
    expect(msgs.some((m) => m.includes("sem aprovação") && m.includes("em 24h")), JSON.stringify(msgs)).toBe(true);
  });

  it("ACHADO P3: o alerta de 48h/24h cobre os seis marcos — falta a Finalização", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "setTimeout", "Date"] });
    // Todos os marcos no MESMO dia: se a Lista de Imagens avisa, a Finalização tem de avisar junto.
    const ev = evento({
      truckDepartureDate: new Date("2026-12-04T12:00:00Z"),
      deadlineListaImagens: -10, deadlineEntregaLayouts: -10, deadlineAprovacaoLayout: -10,
      deadlineFinalizacao: -10, deadlineRevisaoLista: -10, deadlineProducaoGrafica: -10,
    });
    const { fimDoDiaDoPrazo, startDeadlineAlerts } = await import("../services/deadlineAlerts");
    const fim = fimDoDiaDoPrazo(new Date(ev.truckDepartureDate).getTime(), -10, "deadlineListaImagens").getTime();
    vi.setSystemTime(fim - 24 * 3600_000 + 10 * 60_000 - 30 * 60_000);
    H.storage.getAllEvents = async () => [ev];
    H.storage.getItemsParaPrazos = async () => [];
    H.storage.createNotification = async (n: any) => { H.notificacoes.push(n); return { id: "n", ...n }; };
    startDeadlineAlerts();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    vi.clearAllTimers();
    const msgs = H.notificacoes.map((n) => n.message);
    expect(msgs.some((m) => m.includes("Lista de Imagens")), "sanidade: o tique caiu na janela").toBe(true);
    expect(msgs.some((m) => m.includes("Finalização")), JSON.stringify(msgs)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P2 — FECHO DIÁRIO conta BOOK COMPLETO; a tela não. Tendência e "desde ontem"
// comparam dois recortes diferentes.
// ═════════════════════════════════════════════════════════════════════════════
describe("fecho diário (prazoSnapshots) × GET /api/prazos", () => {
  it("ACHADO P2: o snapshot do dia conta as mesmas peças atrasadas que a tela (sem BOOK COMPLETO)", async () => {
    const saida = "2026-12-04";
    const pz = prazosPadrao(saida);
    const hoje = iso(ms(pz[2]) + DIA); // Aprovação venceu ontem
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(`${hoje}T15:00:00Z`));
    const ev = evento({ truckDepartureDate: new Date(`${saida}T00:00:00Z`) });
    const pecas = [
      peca({ type: "BOOK COMPLETO", status: "awaiting_approval" }), // trâmite do Atendimento, não é peça
      peca({ status: "ready_for_production" }),
    ];
    H.storage.getAllEvents = async () => [ev];
    H.storage.getItemsParaPrazos = async () => pecas;
    H.storage.getAllSponsors = async () => [];
    H.storage.getOpenItemSponsorApprovals = async () => [];
    H.storage.getAllUsers = async () => [];
    H.linhas.set(prazoSnapshots, () => []);
    H.linhas.set(prazoEventSnapshots, () => []);

    const { registerPrazoRoutes } = await import("../routes/prazos");
    const { chamar } = capturarRotas(registerPrazoRoutes);
    const tela = await chamar("GET /api/prazos", { sessao: { userId: "u1", userRole: "admin" } });
    expect(tela.status).toBe(200);

    const { runPrazoSnapshot } = await import("../services/prazoSnapshots");
    await runPrazoSnapshot();
    const fecho = H.inserts.find((i) => i.tabela === prazoSnapshots)!.valores;
    const porEvento = H.inserts.find((i) => i.tabela === prazoEventSnapshots)!.valores[0];

    expect(fecho.pecasAtrasadas).toBe((tela.body as any).kpis.pecasAtrasadas); // tela 0 × fecho 1
    expect(fecho.atrasados).toBe((tela.body as any).kpis.atrasados);
    expect(porEvento.hasOverdue).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P2 — USUÁRIO DO KIT: placar recortado nas peças dele, tendência e "desde
// ontem" comparados com o fecho GLOBAL.
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/prazos — usuário do Kit", () => {
  it("ACHADO P2: 'saíram do atraso' não lista evento que continua atrasado (só não tem peça do Kit)", async () => {
    const saida = "2026-12-04";
    const pz = prazosPadrao(saida);
    const hoje = iso(ms(pz[2]) + DIA);
    const ontem = iso(ms(hoje) - DIA);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse(`${hoje}T15:00:00Z`));
    const ev = evento({ truckDepartureDate: new Date(`${saida}T00:00:00Z`) });
    H.storage.getAllEvents = async () => [ev];
    H.storage.getItemsParaPrazos = async () => [peca({ status: "awaiting_approval" })]; // peça da Arena, atrasada
    H.storage.getAllSponsors = async () => [];
    H.storage.getOpenItemSponsorApprovals = async () => [];
    H.storage.getAllUsers = async () => [];
    H.linhas.set(prazoSnapshots, () => [{ day: ontem, atrasados: 1, saidas7d: 0, pecasAtrasadas: 1, emDia: 0 }]);
    H.linhas.set(prazoEventSnapshots, (campos: any) =>
      campos ? [{ day: ontem }] : [{ day: ontem, eventId: "ev-1", hasOverdue: true, pecasAtrasadas: 1 }]);

    const { registerPrazoRoutes } = await import("../routes/prazos");
    const { chamar } = capturarRotas(registerPrazoRoutes);
    const r = await chamar("GET /api/prazos", { sessao: { userId: "u-kit", userRole: "solicitacao", userKit: true } });
    expect(r.status).toBe(200);
    const body = r.body as any;
    // Nada mudou no evento: ele segue atrasado. O Kit vê "saiu do atraso" e ▼1.
    expect(body.desdeOntem?.sairamDoAtraso ?? []).toEqual([]);
    expect(body.trend?.atrasados ?? 0).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P2 — DURAÇÃO DA APROVAÇÃO ≥ 11 dias: o placar e a lista de atrasadas (e as
// Análises) discordam sobre a MESMA peça sem aprovação.
// ═════════════════════════════════════════════════════════════════════════════
describe("Layout ajustado maior que a folga até a Finalização", () => {
  it("ACHADO P2: kpis.pecasAtrasadas == linhas da lista de atrasadas == atrasadas das Análises (N=15)", () => {
    const saida = "2026-12-04";
    const pz = prazosPadrao(saida);
    const N = 15; // configuração aceita 1..30
    const hoje = iso(ms(pz[3]) + DIA); // Finalização venceu ontem
    const piso = prazoDeLayoutAjustado(pz[1], N);
    expect(piso > hoje, "cenário: o Layout ajustado ainda não venceu").toBe(true);

    const ev = evento({ truckDepartureDate: new Date(`${saida}T00:00:00Z`) });
    const pecas = [
      peca({ status: "awaiting_submission", skipApproval: true }), // sem patrocínio, ainda em Layout
      peca({ status: "awaiting_finalization" }),                   // peça comum, atrasada na Finalização
    ];
    const pe = buildEventPrazo(ev, pecas, { today: ms(hoje), diasDaAprovacao: N })!;
    const kpis = computeKpis([pe]);
    const lista = computePecasAtrasadas([pe]);
    const painel = montarPainelOperacional({
      pecas: pecas as any, prazos: [pe], kpis, hoje, geradoEm: new Date().toISOString(),
      nomeDoEvento: new Map([["ev-1", "EVENTO TESTE"]]), diasDaAprovacao: N,
    });
    // Obtido: placar 2 × lista 1 × Análises 1.
    expect({ placar: kpis.pecasAtrasadas, analises: painel.resumo.atrasadasAbertas })
      .toEqual({ placar: lista.length, analises: lista.length });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3 — CARD DO EVENTO (/api/events → nextMilestone) × Gestão de Prazos.
// ═════════════════════════════════════════════════════════════════════════════
describe("card do evento × Gestão de Prazos", () => {
  it("ACHADO P3: molde com skipApproval em Layout — o card usa o Layout AJUSTADO, a Gestão o normal", async () => {
    const saida = "2026-12-04";
    const pz = prazosPadrao(saida);
    const hoje = ms(pz[0]) - 2 * DIA;
    const ev = evento({ truckDepartureDate: new Date(`${saida}T00:00:00Z`) });
    const linhaDoBanco = {
      id: "m1", eventId: "ev-1", status: "awaiting_submission", skipApproval: true,
      arteDoCliente: false, arteRecebidaEm: null, kitRemessaId: null, producaoInterna: false, type: "Molde",
    };
    // A projeção REAL do storage (getItemsSlimForEvents) sobre a linha do banco.
    H.linhas.set(tabelaItems, () => [linhaDoBanco]);
    const real = await vi.importActual<any>("../storage");
    const slim = await real.storage.getItemsSlimForEvents();
    const { enrichEvent } = await import("../routes/events");
    const card = enrichEvent(ev as any, slim, [], hoje, 7);
    const gestao = buildEventPrazo(ev, [peca({ id: "m1", status: "awaiting_submission", skipApproval: true, type: "Molde" })], { today: hoje, diasDaAprovacao: 7 })!;
    const layout = gestao.stages.find((s) => s.key === "layouts")!;
    expect(card.nextMilestone?.key).toBe("layouts");
    expect(card.nextMilestone?.deadline).toBe(layout.prazoEfetivo); // card: Layout+7 × Gestão: Layout
  });

  it("ACHADO P3: peça 'cancelled' (grafia legada reconhecida pelo funil) não impede o evento de concluir no card", async () => {
    const { enrichEvent } = await import("../routes/events");
    const ev = evento();
    const pecas = [peca({ status: "delivered" }), peca({ status: "cancelled" })];
    const gestao = buildEventPrazo(ev, pecas, { today: ms("2026-11-01"), diasDaAprovacao: 7 });
    expect(gestao, "Gestão: tudo entregue, sai da gestão").toBeNull();
    const card = enrichEvent(ev as any, pecas, [], ms("2026-11-01"), 7);
    expect(card.allDelivered).toBe(true);   // obtido: false — "cancelled" conta como aberta
    expect(card.lifecycle).toBe("completed");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3 — CONTAGENS DE DIAS com o relógio cru × dia do negócio.
// ═════════════════════════════════════════════════════════════════════════════
describe("dias até a saída: prioridade automática e aviso da Gestão × Gestão de Prazos", () => {
  it("ACHADO P3: entre 21h e 24h de Brasília a prioridade automática conta um dia a menos que a Gestão de Prazos", () => {
    const agora = Date.parse("2026-11-03T01:00:00Z"); // 22h de 02/11 em Brasília
    const ev = evento({ truckDepartureDate: new Date("2026-11-10T00:00:00Z") }); // saída 10/11 00:00
    const pe = buildEventPrazo(ev, [peca()], { today: ms("2026-11-02"), diasDaAprovacao: 7 })!;
    expect(pe.diasParaSaida).toBe(8); // 8 dias → "media" pela régua (≤15)
    // Obtido: ceil((7d − 1h)/1d) = 7 → "alta".
    expect(prioridadePelaSaida(new Date(ev.truckDepartureDate).getTime(), agora)).toBe("media");
  });

  it("ACHADO P3: o aviso da Gestão diz 'sai em 4 dias' onde a Gestão de Prazos diz 3 (saída com hora > hora atual)", async () => {
    const { montarResumoDaGestao } = await import("../services/gestaoDigest");
    const agora = new Date("2026-11-02T13:00:00Z"); // 10h de 02/11
    const ev = evento({ startDate: new Date("2026-11-10T00:00:00Z"), truckDepartureDate: new Date("2026-11-05T15:00:00Z") });
    const pe = buildEventPrazo(ev, [peca({ status: "awaiting_approval" })], { today: ms("2026-11-02"), diasDaAprovacao: 7 })!;
    const r = montarResumoDaGestao(
      [{ id: "p1", eventId: "ev-1", status: "awaiting_sponsor_approval", createdAt: agora }],
      [{ itemId: "p1", sponsorId: "s1", status: "pending", createdAt: agora }],
      [{ id: "s1", name: "PATROCINADOR" }],
      [{ id: "ev-1", name: "EVENTO TESTE", startDate: ev.startDate, truckDepartureDate: ev.truckDepartureDate, status: "created" }],
      agora,
    );
    const bloco = (r as any).eventos?.[0] ?? (r as any).blocos?.[0];
    expect(bloco?.diasParaSaida).toBe(pe.diasParaSaida); // obtido 4 × 3
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3 — ANÁLISES: duas réguas de atraso para a peça na Lista de Imagens.
// ═════════════════════════════════════════════════════════════════════════════
describe("Análises — pendências de pré-produção × resumo × Gestão", () => {
  it("ACHADO P3: peça na Lista de Imagens vencida conta como atrasada nas Pendências como no resumo e na Gestão", () => {
    const saida = "2026-12-04";
    const pz = prazosPadrao(saida);
    const hoje = iso(ms(pz[0]) + DIA); // Lista venceu ontem; Layout ainda não
    expect(hoje < pz[1]).toBe(true);
    const ev = evento({ truckDepartureDate: new Date(`${saida}T00:00:00Z`) });
    const pecas = [peca({ status: "awaiting_linking" })];
    const pe = buildEventPrazo(ev, pecas, { today: ms(hoje), diasDaAprovacao: 7 })!;
    const kpis = computeKpis([pe]);
    const painel = montarPainelOperacional({
      pecas: pecas as any, prazos: [pe], kpis, hoje, geradoEm: new Date().toISOString(),
      nomeDoEvento: new Map([["ev-1", "EVENTO TESTE"]]), diasDaAprovacao: 7,
    });
    const pend = pendenciasPorEvento(painel);
    expect(kpis.pecasAtrasadas).toBe(1);
    expect(painel.resumo.atrasadasAbertas).toBe(1);
    expect(pend[0].totalAtrasados).toBe(1); // obtido 0: medida pelo prazo do Layout
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// P3 (REGRA A DECIDIR) — Layout ajustado com N curto engolido pelo fim de semana.
// ═════════════════════════════════════════════════════════════════════════════
describe("Layout ajustado × fim de semana", () => {
  it("ACHADO P3 (regra a decidir): Layout na sexta + 1 dia corrido não pode devolver a própria sexta", () => {
    const sexta = "2026-11-13";
    expect(new Date(`${sexta}T12:00:00Z`).getUTCDay()).toBe(5);
    // sábado → volta para sexta: a peça "sem aprovação" não ganha dia nenhum.
    expect(prazoDeLayoutAjustado(sexta, 1) > sexta).toBe(true);
  });
});
