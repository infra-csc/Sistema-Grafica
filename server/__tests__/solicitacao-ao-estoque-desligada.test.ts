// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE — A CHAVE DESLIGADA, NO SERVIDOR (dono, 21/09).
//
// "O reaproveitar por solicitação, segurar: não vamos implementar agora; segue
// no fluxo NORMAL de reaproveitar." Com SOLICITACAO_AO_ESTOQUE_ATIVA = false:
//   1. a liberação da Revisão Final (PATCH creator-review, a rota mais usada da
//      tela, unitária e em lote) é a de ANTES: não lê a tabela
//      consultas_de_estoque, não grava nada nela, nada da feature roda dentro
//      da transação — e o corpo { reuseQty, peloEstoque } é tratado como o
//      reuseQty de sempre;
//   2. as rotas /api/consultas-de-estoque* seguem registradas (a régua de
//      papéis compara tabela × código), mas escrita → 404 "Recurso
//      desativado" e leitura → vazio, sem tocar no repositório.
// Os testes da feature (consulta-de-estoque*.test.ts) rodam com a chave ligada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

const H = vi.hoisted(() => ({
  repoChamado: [] as string[],
  liberacao: {} as Record<string, any>,
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
// Qualquer função do repositório chamada fica registrada: com a chave
// desligada, NENHUMA pode ser.
vi.mock("../services/consultasDeEstoque", () => new Proxy({}, {
  get: (_t, nome: string) => (nome === "then" ? undefined : async () => { H.repoChamado.push(nome); throw new Error(`repositório chamado: ${nome}`); }),
  has: () => true,
}));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: (...a: any[]) => H.liberacao.respostaDoEstoqueParaLiberar(...a),
  marcarRespostaAplicada: (...a: any[]) => H.liberacao.marcarRespostaAplicada(...a),
}));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: vi.fn(),
    createAuditLog: vi.fn(async () => {}),
    updateEventStatus: vi.fn(),
  };
});
vi.mock("../routes/eventoFinalizado", async () => {
  const real = await vi.importActual<any>("../routes/eventoFinalizado");
  return { ...real, motivoEventoDaPeca: async () => null, barraEventoFinalizado: async () => false };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

vi.setConfig({ testTimeout: 60_000 });

const { registerConsultasDeEstoqueRoutes } = await import("../routes/consultas-de-estoque");
const { registerItemRoutes } = await import("../routes/items");
const { auditLogs, consultasDeEstoque } = await import("@shared/schema");

type Handler = (req: any, res: any, next: any) => unknown;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const metodo of ["get", "post", "patch", "put", "delete"]) {
  app[metodo] = (rota: string, ...hs: Handler[]) => { rotas.set(`${metodo.toUpperCase()} ${rota}`, hs); return app; };
}
registerConsultasDeEstoqueRoutes(app);
registerItemRoutes(app);

type Quem = { role: string; id?: string; nome?: string };
async function chamar(chave: string, quem: Quem, extra: { params?: any; body?: any; query?: any } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: extra.params ?? {}, body: extra.body ?? {}, query: extra.query ?? {},
    userRole: quem.role, userId: quem.id ?? "u-1", userName: quem.nome ?? "Fulana", userKit: false,
    session: { userId: quem.id ?? "u-1", userRole: quem.role },
  };
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res.body !== undefined || !seguiu) break;
  }
  return { status: res.statusCode as number, body: res.body as any };
}

const SOLICITACAO: Quem = { role: "solicitacao", id: "u-sol", nome: "Sofia" };
const GRAFICA: Quem = { role: "grafica", id: "u-graf", nome: "Gil" };
const ADMIN: Quem = { role: "admin", id: "u-adm", nome: "Ada" };

beforeEach(() => {
  H.repoChamado.length = 0;
  // Se a liberação chegasse a ler a resposta, "o estoque atendeu 3" viraria
  // reaproveitamento — é exatamente o que não pode acontecer.
  H.liberacao.respostaDoEstoqueParaLiberar = vi.fn(async () => ({ id: "c-1", pedida: 5, atendida: 3, respondidoPor: "Gil" }));
  H.liberacao.marcarRespostaAplicada = vi.fn(async () => {});
});

describe("a chave", () => {
  it("está DESLIGADA, num lugar só, com o recado de como religar", () => {
    expect(SOLICITACAO_AO_ESTOQUE_ATIVA).toBe(false);
    const fonte = ler("shared/consultas-de-estoque.ts");
    expect(fonte).toContain("export const SOLICITACAO_AO_ESTOQUE_ATIVA: boolean = false;");
    expect(fonte).toContain("Para religar: virar para true");
  });
});

describe("rotas /api/consultas-de-estoque* — registradas, mas sem efeito", () => {
  it("escrita → 404 “Recurso desativado”, sem tocar no repositório", async () => {
    const pedir = await chamar("POST /api/items/:id/consulta-de-estoque", SOLICITACAO, { params: { id: "i-1" }, body: { quantidade: 5 } });
    expect(pedir).toEqual({ status: 404, body: { error: "Recurso desativado" } });
    const responder = await chamar("POST /api/consultas-de-estoque/:id/responder", GRAFICA, { params: { id: "c-1" }, body: { resposta: "atender", quantidade: 5 } });
    expect(responder).toEqual({ status: 404, body: { error: "Recurso desativado" } });
    const cancelar = await chamar("POST /api/consultas-de-estoque/:id/cancelar", ADMIN, { params: { id: "c-1" } });
    expect(cancelar).toEqual({ status: 404, body: { error: "Recurso desativado" } });
    expect(H.repoChamado).toEqual([]);
  });

  it("a guarda de papel continua na frente: quem não podia recebe 403, como antes", async () => {
    expect((await chamar("POST /api/items/:id/consulta-de-estoque", GRAFICA, { params: { id: "i-1" } })).status).toBe(403);
    expect((await chamar("POST /api/consultas-de-estoque/:id/responder", SOLICITACAO, { params: { id: "c-1" } })).status).toBe(403);
    expect((await chamar("GET /api/consultas-de-estoque", { role: "arte" })).status).toBe(403);
  });

  it("leitura → vazio, no formato de sempre, sem tocar no repositório", async () => {
    expect((await chamar("GET /api/items/:id/consulta-de-estoque", SOLICITACAO, { params: { id: "i-1" } })).body).toEqual({ consulta: null });
    expect((await chamar("GET /api/consultas-de-estoque", GRAFICA)).body).toEqual([]);
    expect((await chamar("GET /api/consultas-de-estoque/abertas", GRAFICA)).body).toEqual({ total: 0 });
    expect((await chamar("GET /api/consultas-de-estoque/abertas-por-peca", GRAFICA)).body).toEqual([]);
    expect((await chamar("GET /api/consultas-de-estoque/da-revisao", SOLICITACAO)).body).toEqual([]);
    expect((await chamar("GET /api/consultas-de-estoque/:id/sugestoes", GRAFICA, { params: { id: "c-1" } })).body).toEqual({ semMedida: false, sugestoes: [] });
    expect(H.repoChamado).toEqual([]);
  });
});

describe("PATCH /api/items/:id/creator-review — a liberação de ANTES", () => {
  let inserts: Array<{ table: any; vals: any }> = [];
  let sets: Array<{ table: any; vals: any }> = [];
  let itemEmFoco: any;

  beforeEach(() => {
    inserts = []; sets = [];
    itemEmFoco = { id: "i-1", displayId: "#0123", eventId: "ev-1", type: "Lona 2x1", quantity: 6, reuseQty: 0, isReuse: false, status: "awaiting_final_review", finalFileUrl: "/objects/arte.pdf", deletedAt: null };
    const tx = {
      insert: (table: any) => ({ values: (vals: any) => { inserts.push({ table, vals }); const p: any = Promise.resolve([{ id: "l", ...vals }]); p.returning = async () => [{ id: "l", ...vals }]; return p; } }),
      update: (table: any) => ({ set: (vals: any) => ({ where: () => { sets.push({ table, vals }); const linha = { ...itemEmFoco, ...vals }; const p: any = Promise.resolve([linha]); p.returning = async () => [linha]; return p; } }) }),
    };
    H.db.transaction = vi.fn(async (cb: any) => await cb(tx));
    H.storage.getItem = vi.fn(async () => itemEmFoco);
    H.storage.getEvent = vi.fn(async () => ({ id: "ev-1", name: "Maratona X" }));
  });

  const liberar = (body: any = {}) => chamar("PATCH /api/items/:id/creator-review", SOLICITACAO, { params: { id: "i-1" }, body });
  const trilhas = () => inserts.filter((i) => i.table === auditLogs).map((i) => i.vals.details as string);
  const nadaDoEstoque = () => {
    expect(H.liberacao.respostaDoEstoqueParaLiberar).not.toHaveBeenCalled();
    expect(H.liberacao.marcarRespostaAplicada).not.toHaveBeenCalled();
    expect(sets.some((s) => s.table === consultasDeEstoque)).toBe(false);
    expect(inserts.some((i) => i.table === consultasDeEstoque)).toBe(false);
    expect(trilhas().some((t) => t.includes("pelo estoque"))).toBe(false);
  };

  it("corpo vazio (um clique, o lote): libera para produção normal — nem lê a tabela", async () => {
    const r = await liberar();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ status: "ready_for_production" });
    expect(r.body.reuseQty ?? 0).toBe(0);
    expect(trilhas()).toEqual(["Status alterado: Aguardando Revisão Final → Pronto para Produção (liberado para produção)"]);
    expect(H.db.transaction).toHaveBeenCalledTimes(1);
    nadaDoEstoque();
  });

  it("sem arquivo final: 409, como antes — o estoque não abre exceção", async () => {
    itemEmFoco.finalFileUrl = null;
    const r = await liberar();
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("ainda não tem arquivo final");
    expect(H.db.transaction).not.toHaveBeenCalled();
    nadaDoEstoque();
  });

  it("reuseQty de sempre (parcial e total) vale como antes", async () => {
    const parcial = await liberar({ reuseQty: 2 });
    expect(parcial.body).toMatchObject({ status: "ready_for_production", reuseQty: 2, isReuse: false });
    const total = await liberar({ reuseQty: 6 });
    expect(total.body).toMatchObject({ status: "produced", reuseQty: 6, isReuse: true });
    nadaDoEstoque();
  });

  it("a marca `peloEstoque` é ignorada (antes ela não existia): nada de 409 “não está mais disponível”", async () => {
    const r = await liberar({ reuseQty: 2, peloEstoque: true });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ status: "ready_for_production", reuseQty: 2, isReuse: false });
    nadaDoEstoque();
  });

  it("na fonte: a leitura da tabela só acontece com a chave ligada, e nada da feature entra na transação sem ela", () => {
    const fonte = ler("server/routes/items.ts");
    expect(fonte).toContain("const doEstoque = SOLICITACAO_AO_ESTOQUE_ATIVA && !currentItem.isReuse ? await respostaDoEstoqueParaLiberar(currentItem.id) : null;");
    expect(fonte).toContain("if (SOLICITACAO_AO_ESTOQUE_ATIVA && req.body?.peloEstoque === true && !doEstoque) {");
    // o único ponto dentro da transação depende de `doEstoque`, que é null
    expect((fonte.match(/marcarRespostaAplicada\(tx/g) ?? []).length).toBe(1);
    expect(fonte).toContain("        if (doEstoque) {\n          await marcarRespostaAplicada(tx, doEstoque.id);");
  });
});
