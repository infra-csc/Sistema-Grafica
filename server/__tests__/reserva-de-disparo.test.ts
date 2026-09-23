// ─────────────────────────────────────────────────────────────────────────────
// UM AVISO, UM ENVIO — mesmo com o deploy em autoscale (dono, 01/09:
// "triplicando os emails", com o print de três "Aprovações pendentes · 372"
// às 15:00 e três "Revisão · 2 peças esperando").
//
// A causa: `deploymentTarget = "autoscale"` no .replit sobe VÁRIAS réplicas do
// processo, cada uma com o próprio relógio. A trava era ler a trilha antes de
// mandar — mas a trilha só é escrita DEPOIS do envio, então as três liam
// "ainda não mandei" no mesmo segundo e as três mandavam.
//
// A trava nova é uma reserva atômica no banco (INSERT ... ON CONFLICT DO
// NOTHING numa chave primária): exatamente uma réplica recebe a linha. Este
// arquivo EXECUTA o mecanismo (com o banco de mentira de
// regras-estoque-banco-de-mentira.ts) e as três decisões que o cercam:
//   · a reserva vem ANTES de qualquer envio (não adianta reservar depois);
//   · o disparo MANUAL continua passando por cima (alguém pediu e está
//     esperando o e-mail na tela);
//   · falha aberta: banco fora/tabela ausente NÃO cala o aviso — duplicado é
//     detectável, silêncio não é (foi o que aconteceu em agosto).
// A chave primária da tabela é conferida em regras-estoque-schema.test.ts; a
// disputa de verdade entre duas conexões é dos testes integracao-* (PGlite).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import ts from "typescript";
import { criarBanco, type Banco } from "./regras-estoque-banco-de-mentira";

const H = vi.hoisted(() => ({
  banco: null as any,
  storage: {} as Record<string, any>,
  reservar: (async () => true) as (chave: string) => Promise<boolean>,
  anotar: (async () => {}) as (chave: string, desfecho: string) => Promise<void>,
  enviados: [] as any[],
  broadcasts: [] as any[],
}));
vi.mock("../db", () => ({ db: new Proxy({}, { get: (_t, k) => H.banco.db[k] }), pool: {} }));
vi.mock("../storage", () => ({ storage: new Proxy({}, { get: (_t, k) => H.storage[k as string] }) }));
// Os avisos falam com a reserva por aqui; o mecanismo real é importado à parte (importActual).
vi.mock("../services/reservaDeDisparo", () => ({
  ID_DA_INSTANCIA: "teste",
  reservarDisparo: (c: string) => H.reservar(c),
  anotarDesfecho: (c: string, d: string) => H.anotar(c, d),
  desfazerReserva: async () => {},
  limparReservasAntigas: async () => {},
}));
vi.mock("../services/bookEmailNotification", async () => {
  const real = await vi.importActual<any>("../services/bookEmailNotification");
  return { ...real, entregarEmail: async (m: any) => { H.enviados.push(m); } };
});
vi.mock("../services/lideranca", () => ({ executarComoLider: async (_n: string, fn: () => Promise<unknown>) => { await fn(); return "rodou"; } }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, broadcast: (m: any) => { H.broadcasts.push(m); } };
});

import { enviarAvisoDaGestao } from "../services/gestaoDigest";
import { enviarAvisoDaRevisao, agoraNoFuso } from "../services/revisaoDigest";
import { startDeadlineAlerts } from "../services/deadlineAlerts";

const real = await vi.importActual<typeof import("../services/reservaDeDisparo")>("../services/reservaDeDisparo");

let b: Banco;
const PRODUCAO = { REPLIT_DEPLOYMENT: "1" };
const AGORA = new Date("2026-09-23T13:00:00Z"); // 10h em Brasília
const { dia, hora } = agoraNoFuso(AGORA);

beforeEach(() => {
  b = criarBanco({ reservas_de_disparo: [], audit_logs: [], kit_remessas: [] });
  H.banco = b;
  H.enviados = []; H.broadcasts = [];
  H.reservar = vi.fn(async () => true);
  H.anotar = vi.fn(async () => {});
  for (const k of Object.keys(H.storage)) delete H.storage[k];
  // fila vazia: o caminho mais curto que ainda passa pela reserva e pela anotação
  Object.assign(H.storage, {
    getAllItems: vi.fn(async () => []), getAllItemSponsorApprovals: vi.fn(async () => []),
    getAllSponsors: vi.fn(async () => []), getAllEvents: vi.fn(async () => []),
    createNotification: vi.fn(async (n: any) => ({ id: `n${Math.random()}`, ...n })),
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("o mecanismo", () => {
  it("é atômico no banco: a PRIMEIRA réplica fica com a edição; a segunda (mesma chave) desiste", async () => {
    expect(await real.reservarDisparo("gestao:2026-09-23:10")).toBe(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await real.reservarDisparo("gestao:2026-09-23:10")).toBe(false);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("já estava reservada por outra instância"));
    expect(b.mundo.reservas_de_disparo).toEqual([expect.objectContaining({ chave: "gestao:2026-09-23:10", instancia: real.ID_DA_INSTANCIA })]);
    // outra edição é outra chave
    expect(await real.reservarDisparo("gestao:2026-09-23:15")).toBe(true);
  });

  it("falha ABERTA: sem banco (ou sem a tabela) o aviso vai, e o log diz que a trava não valeu", async () => {
    b.db.insert = () => { throw new Error('relation "reservas_de_disparo" does not exist'); };
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await real.reservarDisparo("revisao:2026-09-23:10")).toBe(true);
    expect(aviso).toHaveBeenCalledWith(expect.stringContaining("a trava não valeu desta vez"), expect.anything());
  });

  it("o desfecho fica anotado na reserva (e anotar/desfazer nunca derrubam quem chamou)", async () => {
    await real.reservarDisparo("gestao:2026-09-23:10");
    await real.anotarDesfecho("gestao:2026-09-23:10", "enviado para dono@x");
    expect(b.mundo.reservas_de_disparo.find((r) => r.chave === "gestao:2026-09-23:10")).toMatchObject({ desfecho: "enviado para dono@x" });
    await real.desfazerReserva("gestao:2026-09-23:10");
    expect(b.mundo.reservas_de_disparo).toEqual([]);
    b.db.update = () => { throw new Error("fora do ar"); };
    b.db.delete = () => { throw new Error("fora do ar"); };
    await expect(real.anotarDesfecho("x", "y")).resolves.toBeUndefined();
    await expect(real.desfazerReserva("x")).resolves.toBeUndefined();
    await expect(real.limparReservasAntigas()).resolves.toBeUndefined();
  });

  it("a tabela não cresce para sempre: a faxina apaga só o que passou de 90 dias", async () => {
    const dias = (n: number) => new Date(Date.now() - n * 864e5);
    b.mundo.reservas_de_disparo.push({ chave: "velha", reservadoEm: dias(91) }, { chave: "recente", reservadoEm: dias(89) });
    await real.limparReservasAntigas();
    expect(b.mundo.reservas_de_disparo.map((r) => r.chave)).toEqual(["recente"]);
  });

  it("a faxina roda no boot do servidor", () => {
    // Varredura (AST): server/routes.ts sobe o servidor inteiro — não dá para executar aqui.
    const texto = readFileSync(path.resolve(__dirname, "../../server/routes.ts"), "utf8");
    const sf = ts.createSourceFile("routes.ts", texto, ts.ScriptTarget.Latest, true);
    let chamou = false;
    const visita = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "limparReservasAntigas") chamou = true;
      ts.forEachChild(n, visita);
    };
    visita(sf);
    expect(chamou).toBe(true);
  });
});

describe("os dois avisos por e-mail", () => {
  const AVISOS = [
    ["gestão", "gestao", (manual: boolean) => enviarAvisoDaGestao(AGORA, PRODUCAO, { manual })],
    ["revisão", "revisao", (manual: boolean) => enviarAvisoDaRevisao(AGORA, PRODUCAO, { manual })],
  ] as const;

  it.each(AVISOS)("%s: reserva a EDIÇÃO (canal:dia:hora) ANTES de ler a fila e de enviar; perdeu → 'ja-enviado' e nada acontece", async (_n, canal, enviar) => {
    H.reservar = vi.fn(async () => false);
    expect(await enviar(false)).toEqual({ status: "ja-enviado" });
    expect(H.reservar).toHaveBeenCalledWith(`${canal}:${dia}:${hora}`);
    expect(H.storage.getAllItems).not.toHaveBeenCalled();
    expect(H.enviados).toEqual([]);
    expect(b.gravacoes()).toEqual([]);
  });

  it.each(AVISOS)("%s: ganhou a reserva → segue, e o desfecho fica anotado na MESMA chave", async (_n, canal, enviar) => {
    const r = await enviar(false);
    expect(r.status).toBe("sem-fila");
    expect(H.anotar).toHaveBeenCalledWith(`${canal}:${dia}:${hora}`, "fila vazia — nada a enviar; a edição desta hora fica registrada");
  });

  it.each(AVISOS)("%s: o disparo MANUAL passa por cima da reserva (nem reserva, nem anota)", async (_n, _c, enviar) => {
    H.reservar = vi.fn(async () => false);
    const r = await enviar(true);
    expect(r.status).toBe("sem-fila");
    expect(H.reservar).not.toHaveBeenCalled();
    expect(H.anotar).not.toHaveBeenCalled();
  });
});

describe("os alertas de prazo", () => {
  const MEIA_HORA = 30 * 60 * 1000;
  // A memória do processo (o Set) vive o arquivo inteiro: cada caso usa um evento próprio.
  const comEventoA = (horas: number, id = "ev-1") => {
    const agora = Date.now();
    H.storage.getAllEvents = vi.fn(async () => [{
      id, name: "COPA NORTE", status: "created", truckDepartureDate: new Date(agora + MEIA_HORA + horas * 36e5),
      deadlineListaImagens: null, deadlineEntregaLayouts: null, deadlineAprovacaoLayout: null, deadlineRevisaoLista: null, deadlineProducaoGrafica: null,
    }]);
  };

  it("não confiam só na memória do processo: cada alerta passa pela reserva 'alerta:<chave>' — perdeu, não notifica", async () => {
    vi.useFakeTimers();
    comEventoA(47.8);
    H.reservar = vi.fn(async () => false);
    startDeadlineAlerts();
    await vi.advanceTimersByTimeAsync(MEIA_HORA);
    expect(H.reservar).toHaveBeenCalledWith("alerta:ev-1-departure-47h");
    expect(H.storage.createNotification).not.toHaveBeenCalled();
  });

  it("ganhou a reserva: notifica UMA vez; o tique seguinte na mesma janela nem pergunta ao banco", async () => {
    vi.useFakeTimers();
    comEventoA(47.9, "ev-2");
    startDeadlineAlerts();
    await vi.advanceTimersByTimeAsync(MEIA_HORA);
    expect(H.storage.createNotification).toHaveBeenCalledTimes(1);
    expect(H.storage.createNotification.mock.calls[0][0]).toMatchObject({ type: "deadlineAlert", message: "ALERTA: Faltam 47h para saída do caminhão - COPA NORTE" });
    const perguntas = (H.reservar as any).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60 * 1000); // o relógio anda pouco: mesma chave de alerta
    H.storage.getAllEvents.mockClear();
    await vi.advanceTimersByTimeAsync(MEIA_HORA);
    expect(H.storage.createNotification).toHaveBeenCalledTimes(1);
    expect((H.reservar as any).mock.calls.length).toBe(perguntas);
  });
});
