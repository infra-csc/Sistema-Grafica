// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DO BOOK — as rotas e quem pode o quê.
//   · ler e marcar achado: Solicitação e admin; o usuário do Kit, a Arte, a
//     Gráfica e o Atendimento não;
//   · auditar de novo: só admin (custa uma chamada de IA);
//   · só evento em andamento aparece; erro e falta de chave só para o admin;
//   · o book publicado dispara a auditoria DEPOIS de responder, e uma falha
//     dela nunca derruba a publicação.
// Banco e fila de mentira; as regras são as de verdade.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { capturarRotas } from "./rotas-de-mentira";

const H = vi.hoisted(() => ({
  repo: {} as Record<string, any>,
  disparar: null as any,
  auditLog: null as any,
  broadcast: null as any,
}));
vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../services/auditoria-do-book/repo", () => Object.fromEntries(
  ["auditoriasAtuais", "buscarAuditoria", "gravarResolucao", "bookAtualDoEvento"].map((k) => [k, (...a: unknown[]) => H.repo[k](...a)]),
));
vi.mock("../services/auditoria-do-book/fila", () => ({ filaDoBook: () => ({ disparar: (...a: unknown[]) => H.disparar(...a) }) }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, createAuditLog: (...a: any[]) => H.auditLog(...a), broadcast: (...a: any[]) => H.broadcast(...a) };
});

const { registerAuditoriaDoBookRoutes } = await import("../routes/auditoria-do-book");
const { REGUA_DE_PAPEIS } = await import("@shared/permissoes");
const { chamar } = capturarRotas(registerAuditoriaDoBookRoutes);

const FUTURO = new Date(Date.now() + 30 * 86_400_000);
const PASSADO = new Date(Date.now() - 30 * 86_400_000);
const achados = {
  faltando: [
    { chave: "f0", pagina: 13, pecaNoBook: "Placas KM", detalhe: "x", confianca: "alta", candidata: null, candidataId: null },
    { chave: "f1", pagina: 2, pecaNoBook: "Saia do palco", detalhe: "y", confianca: "media", candidata: null, candidataId: null },
  ],
  canceladas: [{ chave: "c0", pagina: 4, pecaNoBook: "2x1 Bradesco", detalhe: "", ids: ["i8040"], rotulos: ["#8040 2x1 Bradesco Seguros"] }],
  divergencias: [{ chave: "d0", pagina: 5, ids: ["i1"], displayIds: ["#6524"], noBook: "a", noApp: "b" }],
  observacoes: null,
};
const linha = (over: Record<string, unknown> = {}) => ({
  id: "aud-1", eventId: "ev-1", bookUrl: "/objects/uploads/b1", status: "concluida", modelo: "claude-opus-5-5",
  achados, resolvidos: {}, pecasNoBook: 37, encontradasNoApp: 33, erro: null, tokensEntrada: 1, tokensSaida: 1,
  iniciadoEm: null, criadoEm: new Date("2026-10-19T12:00:00Z"), concluidoEm: new Date("2026-10-19T12:03:00Z"),
  evento: { id: "ev-1", name: "Night Run Vitória", status: "created", startDate: FUTURO, reopenedAt: null, arquivadoEm: null },
  bookPublicadoEm: new Date("2026-10-19T11:59:00Z"),
  bookMaisNovoEm: null,
  ...over,
});

const quem = (userRole: string, extra: Record<string, unknown> = {}) => ({ sessao: { userId: "u1", userRole, userName: "Maria", ...extra } });

beforeEach(() => {
  H.repo = {
    auditoriasAtuais: vi.fn(async () => [
      linha(),
      linha({ id: "aud-2", eventId: "ev-2", status: "erro", erro: "falhou", achados: null, evento: { id: "ev-2", name: "Ação Boticário", status: "created", startDate: FUTURO, reopenedAt: null, arquivadoEm: null } }),
      linha({ id: "aud-3", eventId: "ev-3", evento: { id: "ev-3", name: "Já passou", status: "created", startDate: PASSADO, reopenedAt: null, arquivadoEm: null } }),
      linha({ id: "aud-4", eventId: "ev-4", evento: { id: "ev-4", name: "Arquivado", status: "created", startDate: FUTURO, reopenedAt: null, arquivadoEm: new Date() } }),
    ]),
    buscarAuditoria: vi.fn(async (id: string) => (id === "aud-1" ? linha() : id === "aud-p" ? linha({ id: "aud-p", status: "processando" }) : null)),
    gravarResolucao: vi.fn(async (id: string, chave: string, r: unknown) => ({ ...linha(), resolvidos: r ? { [chave]: r } : {} })),
    bookAtualDoEvento: vi.fn(async (eventId: string) => (eventId === "ev-1" ? { bookUrl: "/objects/uploads/b1", createdAt: new Date() } : null)),
  };
  H.disparar = vi.fn(async () => "aud-nova");
  H.auditLog = vi.fn(async () => {});
  H.broadcast = vi.fn();
});
afterEach(() => { delete process.env.ANTHROPIC_API_KEY; });

describe("GET /api/auditorias-do-book", () => {
  it("Solicitação vê só auditoria pronta de evento em andamento; sem erro, sem aviso de chave", async () => {
    const r = await chamar("GET /api/auditorias-do-book", quem("solicitacao"));
    expect(r.status).toBe(200);
    const body = r.body as any;
    expect(body.auditorias.map((a: any) => a.eventId)).toEqual(["ev-1"]);
    expect(body.auditorias[0]).toMatchObject({ eventName: "Night Run Vitória", status: "concluida", bookPublicadoEm: "2026-10-19T11:59:00.000Z" });
    expect(body.semChave).toBeUndefined();
  });

  it("admin vê também a que deu erro e sabe se falta a chave", async () => {
    const r = await chamar("GET /api/auditorias-do-book", quem("admin"));
    const body = r.body as any;
    expect(body.auditorias.map((a: any) => a.eventId).sort()).toEqual(["ev-1", "ev-2"]);
    expect(body.semChave).toBe(true);
    process.env.ANTHROPIC_API_KEY = "sk-x";
    expect(((await chamar("GET /api/auditorias-do-book", quem("admin"))).body as any).semChave).toBe(false);
  });

  it("Kit, Arte, Gráfica e Atendimento: 403; sem sessão: 401", async () => {
    expect((await chamar("GET /api/auditorias-do-book", quem("solicitacao", { userKit: true }))).status).toBe(403);
    for (const p of ["arte", "grafica", "atendimento"]) expect((await chamar("GET /api/auditorias-do-book", quem(p))).status, p).toBe(403);
    expect((await chamar("GET /api/auditorias-do-book", {})).status).toBe(401);
    expect(H.repo.auditoriasAtuais).toHaveBeenCalledTimes(0);
  });
});

describe("POST /api/auditorias-do-book/:id/resolver", () => {
  const resolver = (papel: string, body: unknown, extra: Record<string, unknown> = {}, id = "aud-1") =>
    chamar("POST /api/auditorias-do-book/:id/resolver", { ...quem(papel, extra), params: { id }, body });

  it("Solicitação e admin marcam: grava quem e quando, registra na trilha e avisa as telas", async () => {
    for (const papel of ["solicitacao", "admin"]) {
      const r = await resolver(papel, { chave: "f0", motivo: "cadastrada" });
      expect(r.status, papel).toBe(200);
    }
    expect(H.repo.gravarResolucao).toHaveBeenCalledWith("aud-1", "f0", expect.objectContaining({ motivo: "cadastrada", por: "Maria", porId: "u1" }));
    expect(H.auditLog).toHaveBeenCalledWith(expect.anything(), "updated", "event", "ev-1", 'Auditoria do book: "Placas KM" marcada como já cadastrada');
    expect(H.broadcast).toHaveBeenCalledWith({ type: "auditorias_do_book", eventId: "ev-1" });
  });

  it("desfazer (motivo null) e divergência conferida", async () => {
    expect((await resolver("solicitacao", { chave: "f1", motivo: null })).status).toBe(200);
    expect(H.repo.gravarResolucao).toHaveBeenLastCalledWith("aud-1", "f1", null);
    expect((await resolver("solicitacao", { chave: "d0", motivo: "conferida" })).status).toBe(200);
    expect((await resolver("solicitacao", { chave: "c0", motivo: "nao_precisa" })).status).toBe(200);
    expect(H.auditLog).toHaveBeenLastCalledWith(expect.anything(), "updated", "event", "ev-1",
      'Auditoria do book: "2x1 Bradesco" (cancelada no app: #8040 2x1 Bradesco Seguros) marcada como cancelada de propósito');
    expect((await resolver("solicitacao", { chave: "c0", motivo: "conferida" })).status).toBe(400);
  });

  it("Kit, Arte, Gráfica e Atendimento não marcam", async () => {
    expect((await resolver("solicitacao", { chave: "f0", motivo: "cadastrada" }, { userKit: true })).status).toBe(403);
    for (const p of ["arte", "grafica", "atendimento"]) expect((await resolver(p, { chave: "f0", motivo: "cadastrada" })).status, p).toBe(403);
    expect(H.repo.gravarResolucao).not.toHaveBeenCalled();
  });

  it("entrada inválida: 400; achado ou auditoria que não existe: 404; auditoria rodando: 409", async () => {
    expect((await resolver("admin", { chave: "x9", motivo: "cadastrada" })).status).toBe(400);
    expect((await resolver("admin", { chave: "f0", motivo: "talvez" })).status).toBe(400);
    expect((await resolver("admin", { chave: "f0", motivo: "conferida" })).status).toBe(400);
    expect((await resolver("admin", { chave: "d0", motivo: "cadastrada" })).status).toBe(400);
    expect((await resolver("admin", { chave: "f7", motivo: "cadastrada" })).status).toBe(404);
    expect((await resolver("admin", { chave: "f0", motivo: "cadastrada" }, {}, "nao-existe")).status).toBe(404);
    expect((await resolver("admin", { chave: "f0", motivo: "cadastrada" }, {}, "aud-p")).status).toBe(409);
    expect(H.repo.gravarResolucao).not.toHaveBeenCalled();
  });
});

describe("POST /api/events/:eventId/book/auditar", () => {
  it("só admin: enfileira o book atual e devolve 202", async () => {
    const r = await chamar("POST /api/events/:eventId/book/auditar", { ...quem("admin"), params: { eventId: "ev-1" } });
    expect(r.status).toBe(202);
    expect(r.body).toEqual({ id: "aud-nova", semChave: true });
    expect(H.disparar).toHaveBeenCalledWith("ev-1", "/objects/uploads/b1");
    for (const p of ["solicitacao", "arte", "grafica", "atendimento"]) {
      expect((await chamar("POST /api/events/:eventId/book/auditar", { ...quem(p), params: { eventId: "ev-1" } })).status, p).toBe(403);
    }
    expect(H.disparar).toHaveBeenCalledTimes(1);
  });

  it("evento sem book: 409", async () => {
    expect((await chamar("POST /api/events/:eventId/book/auditar", { ...quem("admin"), params: { eventId: "ev-sem" } })).status).toBe(409);
  });
});

describe("a régua declarada bate com as rotas", () => {
  it("auditar = admin; resolver = admin + Solicitação", () => {
    const papeis = (rota: string) => REGUA_DE_PAPEIS.find((r) => r.rota === rota)?.papeis.slice().sort();
    expect(papeis("/api/events/:eventId/book/auditar")).toEqual(["admin"]);
    expect(papeis("/api/auditorias-do-book/:id/resolver")).toEqual(["admin", "solicitacao"]);
  });
});
