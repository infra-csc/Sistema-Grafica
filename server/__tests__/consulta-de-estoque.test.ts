// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE A PARTIR DA REVISÃO FINAL (dono, 21/09) — por dentro,
// "consulta de estoque".
//
// "Quando clicar [no Reaproveitamento] e selecionar as quantidades, lá no
// estoque deve aparecer uma SOLICITAÇÃO; ele pode ATENDER, ATENDER PARCIAL ou
// NÃO CONSEGUIR ATENDER." · "As respostas do reaproveitar têm que aparecer na
// REVISÃO, e é ELA que segue com o item." · "Tem que vir SUGERIDO de acordo com
// a resposta do estoque e ela só CONFIRMAR." O que este arquivo prende:
//   1. as REGRAS puras (pedido, atendimento, efeito na peça, proposta da
//      liberação, resumo do lote, frases);
//   2. as ROTAS de verdade, com o banco trocado por um repositório de mentira:
//      papéis, Kit, status da peça, uma aberta por peça, atender / parcial /
//      não consigo, quem é avisado e para onde, cancelar;
//   3. a LIBERAÇÃO (PATCH creator-review): aplica a sugestão do estoque na
//      mesma transação; "usar menos" nunca passa do atendido; sem resposta não
//      aplica nada; a resposta nunca libera a peça;
//   4. o que só se prende pela FONTE: reserva + efeito na peça já liberada na
//      mesma transação da resposta, índice único parcial, migração só aditiva,
//      sem coluna de local.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  validarPedido,
  validarAtendimento,
  efeitoDoAtendimento,
  propostaDaLiberacao,
  resumoDoLoteComEstoque,
  respostaEsperandoConfirmar,
  textoDaResposta,
  textoDoPedido,
  trilhaDoAtendimento,
  trilhaDaLiberacaoComEstoque,
  avisoParaAGrafica,
  avisoParaQuemPediu,
  ehFotoValida,
} from "@shared/consultas-de-estoque";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");

const H = vi.hoisted(() => ({
  repo: {} as Record<string, any>,
  liberacao: {} as Record<string, any>,
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  motivoEvento: null as string | null,
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../services/consultasDeEstoque", () => new Proxy({}, {
  get: (_t, nome: string) => (nome === "then" ? undefined : (...a: any[]) => H.repo[nome](...a)),
  has: () => true,
}));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: (...a: any[]) => H.liberacao.respostaDoEstoqueParaLiberar(...a),
  marcarRespostaAplicada: (...a: any[]) => H.liberacao.marcarRespostaAplicada(...a),
}));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real, // requireRole é o de VERDADE: é ele que os testes de papel exercitam
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: vi.fn(),
  };
});
vi.mock("../routes/eventoFinalizado", async () => {
  const real = await vi.importActual<any>("../routes/eventoFinalizado");
  return { ...real, motivoEventoDaPeca: async () => H.motivoEvento, barraEventoFinalizado: async () => false };
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

type Quem = { role: string; id?: string; nome?: string; kit?: boolean };
async function chamar(chave: string, quem: Quem, extra: { params?: any; body?: any; query?: any } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: extra.params ?? {}, body: extra.body ?? {}, query: extra.query ?? {},
    userRole: quem.role, userId: quem.id ?? "u-1", userName: quem.nome ?? "Fulana", userKit: quem.kit === true,
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

const peca = (over: any = {}) => ({
  id: "i-1", displayId: "#0123", type: "Lona 2x1", quantity: 6, reuseQty: 0, status: "awaiting_final_review", deletedAt: null,
  eventId: "ev-1", eventName: "Maratona X", kitRemessaId: null, criadoPorId: null, ...over,
});
const consulta = (over: any = {}) => ({
  id: "c-1", itemId: "i-1", eventId: "ev-1", status: "aberta", pedidoPor: "Sofia", pedidoPorId: "u-sol",
  pedidoEm: new Date("2026-09-21T12:00:00Z"), observacao: null, quantidadePedida: 5, quantidadeAtendida: null, ativosIds: [],
  observacaoResposta: null, fotoUrl: null, respondidoPor: null, respondidoPorId: null, respondidoEm: null, aplicadoEm: null, ...over,
});

let avisos: any[] = [];
beforeEach(() => {
  avisos = [];
  H.motivoEvento = null;
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async () => {});
  for (const k of Object.keys(H.storage)) delete H.storage[k];
  H.storage.createNotification = vi.fn(async (n: any) => { avisos.push(n); return { id: `n-${avisos.length}`, ...n }; });
  for (const k of Object.keys(H.repo)) delete H.repo[k];
  Object.assign(H.repo, {
    pecaDaConsulta: vi.fn(async () => peca()),
    consultaPorId: vi.fn(async () => consulta()),
    consultaAtualDaPeca: vi.fn(async () => null),
    criarConsulta: vi.fn(async (e: any) => consulta({ observacao: e.observacao, quantidadePedida: e.quantidadePedida, pedidoPor: e.quem.userName, pedidoPorId: e.quem.userId })),
    listarConsultas: vi.fn(async () => []),
    contarAbertas: vi.fn(async () => 3),
    abertasPorPeca: vi.fn(async () => [{ id: "c-1", itemId: "i-1", quantidadePedida: 5, pedidoPor: "Sofia" }]),
    consultasDaRevisao: vi.fn(async () => []),
    sugestoesParaPeca: vi.fn(async () => ({ semMedida: false, sugestoes: [] })),
    unidadesDosAtivos: vi.fn(async (ids: string[]) => ids.length),
    responderConsulta: vi.fn(async (e: any) => ({
      consulta: consulta({ status: e.status, quantidadeAtendida: e.atendida, ativosIds: e.ativosIds, respondidoPor: e.quem.userName }),
      codigos: e.ativosIds.map((id: string) => `#EST-${id}`),
      pecaAtualizada: null,
      aplicado: false,
    })),
    cancelarConsulta: vi.fn(async () => consulta({ status: "cancelada" })),
  });
  H.liberacao.respostaDoEstoqueParaLiberar = vi.fn(async () => null);
  H.liberacao.marcarRespostaAplicada = vi.fn(async () => {});
});

// ─── 1 · REGRAS ──────────────────────────────────────────────────────────────
describe("as regras", () => {
  it("o PEDIDO: de 1 até o que a peça ainda não tem reaproveitado", () => {
    expect(validarPedido({ quantidade: 5, quantidadeDaPeca: 6, jaReaproveitadas: 0 })).toEqual({ ok: true, quantidade: 5 });
    expect(validarPedido({ quantidade: 6, quantidadeDaPeca: 6, jaReaproveitadas: 0 })).toEqual({ ok: true, quantidade: 6 });
    for (const q of [0, 7, 2.5, undefined, "abc"]) expect(validarPedido({ quantidade: q, quantidadeDaPeca: 6, jaReaproveitadas: 0 }).ok, String(q)).toBe(false);
    expect(validarPedido({ quantidade: 5, quantidadeDaPeca: 6, jaReaproveitadas: 2 }).ok).toBe(false); // só cabem 4
    expect(validarPedido({ quantidade: 1, quantidadeDaPeca: 6, jaReaproveitadas: 6 }).ok).toBe(false);
  });

  it("o ATENDIMENTO: tudo = atendida; menos = atendida em parte; não consigo = zero", () => {
    expect(validarAtendimento({ resposta: "atender", quantidade: 5, quantidadePedida: 5, unidadesDosAtivos: 0 })).toEqual({ ok: true, atendida: 5, status: "atendida" });
    expect(validarAtendimento({ resposta: "atender", quantidade: 3, quantidadePedida: 5, unidadesDosAtivos: 3 })).toEqual({ ok: true, atendida: 3, status: "atendida_parcial" });
    // sem número, vale a soma das unidades dos ativos escolhidos
    expect(validarAtendimento({ resposta: "atender", quantidade: undefined, quantidadePedida: 5, unidadesDosAtivos: 4 })).toEqual({ ok: true, atendida: 4, status: "atendida_parcial" });
    expect(validarAtendimento({ resposta: "nao_atender", quantidade: 9, quantidadePedida: 5, unidadesDosAtivos: 0 })).toEqual({ ok: true, atendida: 0, status: "nao_atendida" });
    expect(validarAtendimento({ resposta: "atender", quantidade: 6, quantidadePedida: 5, unidadesDosAtivos: 0 }).ok).toBe(false); // mais que o pedido
    expect(validarAtendimento({ resposta: "atender", quantidade: 0, quantidadePedida: 5, unidadesDosAtivos: 0 }).ok).toBe(false);
    expect(validarAtendimento({ resposta: "atender", quantidade: undefined, quantidadePedida: 5, unidadesDosAtivos: 0 }).ok).toBe(false);
    expect(validarAtendimento({ resposta: "atender", quantidade: 2, quantidadePedida: 5, unidadesDosAtivos: 3 }).ok).toBe(false); // reservou mais do que atende
    expect(validarAtendimento({ resposta: "talvez", quantidade: 1, quantidadePedida: 5, unidadesDosAtivos: 0 }).ok).toBe(false);
  });

  it("o EFEITO na peça já liberada é a regra do mark-reuse: soma, não invade o produzido, fecha quando cobre", () => {
    expect(efeitoDoAtendimento({ quantity: 6, reuseQty: 0, quantityProduced: 0, status: "ready_for_production" }, 3))
      .toEqual({ ok: true, reuseQty: 3, isReuse: false, aProduzir: 3, fecha: false });
    expect(efeitoDoAtendimento({ quantity: 6, reuseQty: 0, quantityProduced: 0, status: "ready_for_production" }, 6))
      .toEqual({ ok: true, reuseQty: 6, isReuse: true, aProduzir: 0, fecha: true });
    // 2 já impressas: cabem 4; atender 4 fecha a peça (4 + 2 = 6)
    expect(efeitoDoAtendimento({ quantity: 6, reuseQty: 0, quantityProduced: 2, status: "inProduction" }, 4))
      .toEqual({ ok: true, reuseQty: 4, isReuse: false, aProduzir: 0, fecha: true });
    const naoCabe = efeitoDoAtendimento({ quantity: 6, reuseQty: 0, quantityProduced: 4, status: "inProduction" }, 3);
    expect(naoCabe.ok).toBe(false);
    expect((naoCabe as any).erro).toContain("Só cabem 2 un.");
    const impressa = efeitoDoAtendimento({ quantity: 6, reuseQty: 0, quantityProduced: 6, status: "produced" }, 1);
    expect((impressa as any).erro).toContain("já foi impressa");
    expect((efeitoDoAtendimento({ quantity: 6, status: "canceled" }, 1) as any).erro).toContain("cancelada");
    // peça ainda na revisão: só guarda o número — nunca fecha nem muda status
    expect(efeitoDoAtendimento({ quantity: 6, reuseQty: 0, quantityProduced: 0, status: "awaiting_final_review" }, 6))
      .toEqual({ ok: true, reuseQty: 6, isReuse: true, aProduzir: 0, fecha: false });
  });

  it("a PROPOSTA da liberação vem pronta: os três casos do dono, e o “usar menos” nunca passa do atendido", () => {
    expect(propostaDaLiberacao(6, { status: "atendida_parcial", quantidadeAtendida: 3 }).rotulo).toBe("Confirmar e liberar · 3 reaproveitadas + 3 a produzir");
    expect(propostaDaLiberacao(6, { status: "atendida", quantidadeAtendida: 6 })).toEqual({ reaproveitadas: 6, aProduzir: 0, pulaProducao: true, rotulo: "Confirmar e liberar · 6 reaproveitadas — pula produção" });
    expect(propostaDaLiberacao(6, { status: "nao_atendida", quantidadeAtendida: 0 }).rotulo).toBe("Confirmar e liberar · 6 a produzir");
    expect(propostaDaLiberacao(6, { status: "atendida_parcial", quantidadeAtendida: 3 }, 2).rotulo).toBe("Confirmar e liberar · 2 reaproveitadas + 4 a produzir");
    expect(propostaDaLiberacao(6, { status: "atendida_parcial", quantidadeAtendida: 3 }, 9).reaproveitadas).toBe(3); // nunca mais
    expect(propostaDaLiberacao(6, { status: "atendida_parcial", quantidadeAtendida: 1 }).rotulo).toBe("Confirmar e liberar · 1 reaproveitada + 5 a produzir");
    expect(resumoDoLoteComEstoque(12, [{ reaproveitadas: 5 }, { reaproveitadas: 3 }, { reaproveitadas: 3 }, { reaproveitadas: 0 }])).toBe("12 peças · 3 com reaproveitamento do estoque (11 un.)");
    expect(resumoDoLoteComEstoque(1, [])).toBe("1 peça");
  });

  it("as frases da tela, da trilha e dos avisos", () => {
    expect(textoDoPedido(5)).toBe("Pedido ao estoque: 5 un. · aguardando");
    expect(textoDaResposta({ status: "atendida_parcial", quantidadePedida: 5, quantidadeAtendida: 3 })).toBe("Estoque respondeu: atende 3 de 5");
    expect(textoDaResposta({ status: "nao_atendida", quantidadePedida: 5, quantidadeAtendida: 0 })).toContain("não tem");
    expect(trilhaDoAtendimento(3, 5, "Gil")).toBe("Reaproveitamento atendido pelo estoque: 3 de 5 pedidas (Gil)");
    expect(trilhaDaLiberacaoComEstoque(2, 3, 5, "Gil")).toBe("Reaproveitamento atendido pelo estoque: 3 de 5 pedidas (Gil) — a Revisão Final usou 2");
    expect(avisoParaAGrafica("#0123", 5, "Maratona X")).toBe("Solicitação ao estoque: #0123 · 5 un. (Maratona X)");
    expect(avisoParaQuemPediu(3, 5, "#0123")).toBe("Estoque atendeu 3 de 5 un. — #0123");
    expect(avisoParaQuemPediu(5, 5, "#0123")).toBe("Estoque atendeu as 5 un. pedidas — #0123");
    expect(avisoParaQuemPediu(0, 5, "#0123")).toContain("Estoque não tem");
    expect(respostaEsperandoConfirmar({ status: "atendida", aplicadoEm: null })).toBe(true);
    expect(respostaEsperandoConfirmar({ status: "nao_atendida", aplicadoEm: null })).toBe(true);
    expect(respostaEsperandoConfirmar({ status: "atendida", aplicadoEm: "2026-09-21" })).toBe(false);
    expect(respostaEsperandoConfirmar({ status: "aberta", aplicadoEm: null })).toBe(false);
    expect(ehFotoValida("/objects/uploads/a.jpg")).toBe(true);
    expect(ehFotoValida("https://fora.com/a.jpg")).toBe(false);
    expect(ehFotoValida("/objects/../etc/passwd")).toBe(false);
  });
});

// ─── 2 · ROTAS ───────────────────────────────────────────────────────────────
describe("POST /api/items/:id/consulta-de-estoque — a Revisão Final pede N un.", () => {
  const ROTA = "POST /api/items/:id/consulta-de-estoque";
  const pedir = (quem: Quem, body: any = { quantidade: 5 }) => chamar(ROTA, quem, { params: { id: "i-1" }, body });

  it("Solicitação e admin pedem; Gráfica, Arte e Atendimento não", async () => {
    expect((await pedir(SOLICITACAO)).status).toBe(201);
    expect((await pedir(ADMIN)).status).toBe(201);
    for (const role of ["grafica", "arte", "atendimento"]) expect((await pedir({ role })).status, role).toBe(403);
    expect(H.repo.criarConsulta).toHaveBeenCalledTimes(2);
  });

  it("nasce com a QUANTIDADE pedida e o recado; avisa a GRÁFICA (e o admin) e toca o WebSocket — a peça não muda", async () => {
    const r = await pedir(SOLICITACAO, { quantidade: 5, observacao: "  usamos em Manaus  " });
    expect(r.status).toBe(201);
    expect(H.repo.criarConsulta).toHaveBeenCalledWith({
      itemId: "i-1", eventId: "ev-1", quantidadePedida: 5, observacao: "usamos em Manaus", quem: { userName: "Sofia", userId: "u-sol" },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ type: "consultaDeEstoque", message: "Solicitação ao estoque: #0123 · 5 un. (Maratona X)", targetRoles: ["grafica", "admin"], itemId: "i-1" });
    expect(H.broadcast).toHaveBeenCalledWith({ type: "consultas_de_estoque", itemId: "i-1", eventId: "ev-1" });
    expect(H.broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "item_updated" }));
  });

  it("quantidade fora de 1..peça: 400; só peça na Revisão Final; só com o evento vivo", async () => {
    for (const quantidade of [0, 7, 1.5, undefined]) expect((await pedir(SOLICITACAO, { quantidade })).status, String(quantidade)).toBe(400);
    H.repo.pecaDaConsulta = vi.fn(async () => peca({ status: "ready_for_production" }));
    expect((await pedir(SOLICITACAO)).status).toBe(409);
    H.repo.pecaDaConsulta = vi.fn(async () => peca());
    H.motivoEvento = "closed";
    const r = await pedir(SOLICITACAO);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
    expect(H.repo.criarConsulta).not.toHaveBeenCalled();
  });

  it("filtro do Kit: Solicitação sem Kit não pede peça do Kit; o do Kit só as que ele criou; admin pede tudo", async () => {
    H.repo.pecaDaConsulta = vi.fn(async () => peca({ kitRemessaId: "rem-1", criadoPorId: "u-kit" }));
    expect((await pedir(SOLICITACAO)).status).toBe(404);
    expect((await pedir({ role: "solicitacao", id: "u-outro", kit: true })).status).toBe(404);
    expect((await pedir({ role: "solicitacao", id: "u-kit", kit: true })).status).toBe(201);
    expect((await pedir(ADMIN)).status).toBe(201);
    // e o usuário do Kit não pede peça da Arena
    H.repo.pecaDaConsulta = vi.fn(async () => peca());
    expect((await pedir({ role: "solicitacao", id: "u-kit", kit: true })).status).toBe(404);
  });

  it("UMA aberta por peça: a segunda recebe 409 (o índice único parcial é quem garante)", async () => {
    H.repo.criarConsulta = vi.fn(async () => { throw Object.assign(new Error("Já existe uma solicitação ao estoque aberta para esta peça."), { httpStatus: 409 }); });
    const r = await pedir(SOLICITACAO);
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Já existe uma solicitação ao estoque aberta");
    expect(avisos).toHaveLength(0);
    expect(ler("shared/schema.ts")).toContain('uniqueIndex("UQ_consultas_de_estoque_aberta_por_peca").on(table.itemId).where(sql`status = \'aberta\'`)');
    expect(ler("server/services/consultasDeEstoque.ts")).toContain('if (error?.code === "23505") throw erro(409,');
  });

  it("peça excluída ou inexistente: 404; recado gigante: 400", async () => {
    H.repo.pecaDaConsulta = vi.fn(async () => null);
    expect((await pedir(SOLICITACAO)).status).toBe(404);
    H.repo.pecaDaConsulta = vi.fn(async () => peca({ deletedAt: new Date() }));
    expect((await pedir(SOLICITACAO)).status).toBe(404);
    H.repo.pecaDaConsulta = vi.fn(async () => peca());
    expect((await pedir(SOLICITACAO, { quantidade: 5, observacao: "x".repeat(1001) })).status).toBe(400);
  });
});

describe("GET — a caixa, o número do menu, a lista da Revisão Final e as sugestões", () => {
  it("a Solicitação vê só as DELA; Gráfica e admin veem todas; Arte e Atendimento não entram", async () => {
    await chamar("GET /api/consultas-de-estoque", SOLICITACAO, { query: { status: "aberta" } });
    expect(H.repo.listarConsultas).toHaveBeenLastCalledWith({ status: ["aberta"], pedidoPorId: "u-sol", limite: 200 });
    await chamar("GET /api/consultas-de-estoque", GRAFICA, { query: { status: "atendida,atendida_parcial,invalido" } });
    expect(H.repo.listarConsultas).toHaveBeenLastCalledWith({ status: ["atendida", "atendida_parcial"], pedidoPorId: undefined, limite: 200 });
    expect((await chamar("GET /api/consultas-de-estoque", { role: "arte" })).status).toBe(403);
    expect((await chamar("GET /api/consultas-de-estoque", { role: "atendimento" })).status).toBe(403);
  });

  it("o número do menu é de quem responde; a lista da Revisão é de quem revisa; o aviso das abertas é dos três", async () => {
    expect((await chamar("GET /api/consultas-de-estoque/abertas", GRAFICA)).body).toEqual({ total: 3 });
    expect((await chamar("GET /api/consultas-de-estoque/abertas", SOLICITACAO)).status).toBe(403);
    expect((await chamar("GET /api/consultas-de-estoque/da-revisao", SOLICITACAO)).status).toBe(200);
    expect((await chamar("GET /api/consultas-de-estoque/da-revisao", GRAFICA)).status).toBe(403);
    expect((await chamar("GET /api/consultas-de-estoque/abertas-por-peca", GRAFICA)).body).toEqual([{ id: "c-1", itemId: "i-1", quantidadePedida: 5, pedidoPor: "Sofia" }]);
    // a lista da Revisão respeita o Kit: Solicitação sem Kit não recebe linha de peça do Kit
    H.repo.consultasDaRevisao = vi.fn(async () => [
      { id: "c-1", itemId: "i-1", status: "aberta", kitRemessaId: null, criadoPorId: null },
      { id: "c-2", itemId: "i-2", status: "atendida", kitRemessaId: "rem-1", criadoPorId: "u-kit" },
    ]);
    expect((await chamar("GET /api/consultas-de-estoque/da-revisao", SOLICITACAO)).body).toEqual([{ id: "c-1", itemId: "i-1", status: "aberta" }]);
    expect((await chamar("GET /api/consultas-de-estoque/da-revisao", { role: "solicitacao", id: "u-kit", kit: true })).body).toEqual([{ id: "c-2", itemId: "i-2", status: "atendida" }]);
    expect((await chamar("GET /api/consultas-de-estoque/da-revisao", ADMIN)).body).toHaveLength(2);
    // rotas fixas registradas ANTES da rota com :id — senão "abertas" viraria um id
    const fonte = ler("server/routes/consultas-de-estoque.ts");
    expect(fonte.indexOf('"/api/consultas-de-estoque/da-revisao"')).toBeLessThan(fonte.indexOf('"/api/consultas-de-estoque/:id/sugestoes"'));
  });

  it("sugestões: usa a busca do acervo com a peça da solicitação; a Solicitação não lê a de outra pessoa", async () => {
    await chamar("GET /api/consultas-de-estoque/:id/sugestoes", GRAFICA, { params: { id: "c-1" }, query: { busca: "lona" } });
    expect(H.repo.sugestoesParaPeca).toHaveBeenCalledWith("i-1", "lona");
    const r = await chamar("GET /api/consultas-de-estoque/:id/sugestoes", { role: "solicitacao", id: "u-outra" }, { params: { id: "c-1" } });
    expect(r.status).toBe(404);
  });

  it("“o sistema sugere” é a busca de 14/09, só com o que está LIVRE — e sem local", () => {
    const repo = ler("server/services/consultasDeEstoque.ts");
    expect(repo).toContain('} from "../routes/estoque-reservas";');
    expect(repo).toContain("const s = avaliar(peca, a, reservaPorAtivo.get(a.id) ?? null, agora, !manual);");
    expect(repo).toContain('if (!s || s.disponibilidade !== "disponivel") continue;');
    // dono, 21/09: o sistema não guarda onde a peça fica no galpão
    const sugestao = repo.slice(repo.indexOf("export type SugestaoDoAcervo"), repo.indexOf("const ACENTOS"));
    expect(sugestao).not.toMatch(/\blocal\b/);
  });
});

describe("POST /api/consultas-de-estoque/:id/responder — atender, atender parcial, não conseguir", () => {
  const ROTA = "POST /api/consultas-de-estoque/:id/responder";
  const responder = (quem: Quem, body: any) => chamar(ROTA, quem, { params: { id: "c-1" }, body });

  it("Gráfica e admin respondem; a Solicitação não", async () => {
    expect((await responder(GRAFICA, { resposta: "nao_atender" })).status).toBe(200);
    expect((await responder(ADMIN, { resposta: "nao_atender" })).status).toBe(200);
    expect((await responder(SOLICITACAO, { resposta: "nao_atender" })).status).toBe(403);
  });

  it("ATENDER (5 de 5) com ativos: manda RESERVAR os escolhidos; com a peça na Revisão Final o aviso leva à FICHA — e nada libera a peça", async () => {
    const r = await responder(GRAFICA, { resposta: "atender", quantidade: 5, ativosIds: ["a1", "a2", "a2"], observacao: "todas perfeitas", fotoUrl: "/objects/uploads/f.jpg" });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(H.repo.unidadesDosAtivos).toHaveBeenCalledWith(["a1", "a2"]); // sem repetidos
    expect(H.repo.responderConsulta).toHaveBeenCalledWith({
      id: "c-1", status: "atendida", atendida: 5, ativosIds: ["a1", "a2"], observacao: "todas perfeitas",
      fotoUrl: "/objects/uploads/f.jpg", quem: { userName: "Gil", userId: "u-graf" },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ type: "consultaDeEstoqueRespondida", targetUserId: "u-sol", itemId: "i-1", message: "Estoque atendeu as 5 un. pedidas — #0123" });
    expect(H.broadcast).toHaveBeenCalledWith({ type: "consultas_de_estoque", itemId: "i-1", eventId: "ev-1" });
    expect(H.broadcast).toHaveBeenCalledWith({ type: "estoque_reservas", itemId: "i-1", eventId: "ev-1" });
    expect(H.broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "item_updated" }));
  });

  it("ATENDER PARCIAL (3 de 5): status atendida_parcial; sem ativo também vale — “sem vínculo com o acervo” na trilha", async () => {
    const r = await responder(GRAFICA, { resposta: "atender", quantidade: 3 });
    expect(r.status).toBe(200);
    expect(H.repo.responderConsulta.mock.calls[0][0]).toMatchObject({ status: "atendida_parcial", atendida: 3, ativosIds: [] });
    expect(avisos[0].message).toBe("Estoque atendeu 3 de 5 un. — #0123");
    expect(String(H.createAuditLog.mock.calls.at(-1)[4])).toContain("sem vínculo com o acervo");
    expect(String(H.createAuditLog.mock.calls.at(-1)[4])).toContain("a Revisão Final confirma ao liberar");
  });

  it("NÃO CONSIGO ATENDER: zero, não reserva nada, ignora ativos e avisa quem pediu", async () => {
    const r = await responder(GRAFICA, { resposta: "nao_atender", ativosIds: ["a1"], quantidade: 5, observacao: "rasgadas" });
    expect(r.status).toBe(200);
    expect(H.repo.unidadesDosAtivos).not.toHaveBeenCalled();
    expect(H.repo.responderConsulta.mock.calls[0][0]).toMatchObject({ status: "nao_atendida", atendida: 0, ativosIds: [], observacao: "rasgadas" });
    expect(avisos[0]).toMatchObject({ type: "consultaDeEstoqueRespondida", targetUserId: "u-sol" });
    expect(avisos[0].message).toContain("Estoque não tem");
    expect(H.broadcast).not.toHaveBeenCalledWith(expect.objectContaining({ type: "estoque_reservas" }));
  });

  it("mais que o pedido, zero, foto de fora e resposta inválida: 400, e nada é gravado", async () => {
    for (const body of [
      { resposta: "atender", quantidade: 6 }, { resposta: "atender", quantidade: 0 }, { resposta: "atender" },
      { resposta: "atender", quantidade: 2, fotoUrl: "https://fora.com/x.jpg" }, { resposta: "talvez" },
      { resposta: "atender", quantidade: 1, ativosIds: ["a1", "a2"] }, // reservou 2, atende 1
    ]) expect((await responder(GRAFICA, body)).status, JSON.stringify(body)).toBe(400);
    expect(H.repo.responderConsulta).not.toHaveBeenCalled();
    expect(avisos).toHaveLength(0);
  });

  it("peça JÁ LIBERADA: o reaproveitamento entra direto — aviso próprio (leva à caixa) e a fila recebe a peça atualizada", async () => {
    H.repo.pecaDaConsulta = vi.fn(async () => peca({ status: "ready_for_production" }));
    const atualizada = { id: "i-1", status: "ready_for_production", reuseQty: 3, isReuse: false };
    H.repo.responderConsulta = vi.fn(async (e: any) => ({ consulta: consulta({ status: e.status, quantidadeAtendida: 3, aplicadoEm: new Date() }), codigos: [], pecaAtualizada: atualizada, aplicado: true }));
    const r = await responder(GRAFICA, { resposta: "atender", quantidade: 3 });
    expect(r.status).toBe(200);
    expect(avisos[0].type).toBe("consultaDeEstoqueAplicada");
    expect(avisos[0].message).toContain("já entrou como reaproveitamento na peça liberada");
    expect(H.broadcast).toHaveBeenCalledWith({ type: "item_updated", item: atualizada });
  });

  it("não cabe mais (peça já impressa): 409 com frase de gente, ninguém é avisado e a solicitação segue aberta", async () => {
    H.repo.responderConsulta = vi.fn(async () => { throw Object.assign(new Error("Só cabem 2 un. de reaproveitamento agora (4 já impressa(s), 0 reaproveitada(s) de 6) — atenda até 2."), { httpStatus: 409 }); });
    const r = await responder(GRAFICA, { resposta: "atender", quantidade: 3 });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Só cabem 2 un.");
    expect(avisos).toHaveLength(0);
  });

  it("solicitação já respondida ou cancelada: 409", async () => {
    H.repo.consultaPorId = vi.fn(async () => consulta({ status: "atendida" }));
    expect((await responder(GRAFICA, { resposta: "nao_atender" })).status).toBe(409);
  });

  it("RESERVA + efeito na peça + fechamento da solicitação numa transação só, pelo mecanismo do Estoque e a regra do mark-reuse", () => {
    const repo = ler("server/services/consultasDeEstoque.ts");
    const responderFonte = repo.slice(repo.indexOf("export async function responderConsulta"), repo.indexOf("export async function cancelarConsulta"));
    expect(responderFonte).toContain("return db.transaction(async (tx) => {");
    expect(responderFonte).toContain("await reservarAtivosParaPeca(tx, {");
    // a peça é travada, e o teto vem da MESMA função pura que a tela e os testes usam
    expect(responderFonte).toContain('.where(eq(itemsTable.id, atual.itemId)).for("update");');
    expect(responderFonte).toContain("const efeito = efeitoDoAtendimento(peca, e.atendida);");
    expect(responderFonte).toContain("if (!efeito.ok) throw erro(409, efeito.erro);");
    // SÓ a peça já liberada é tocada; em revisão a resposta fica registrada
    expect(responderFonte).toContain("if (pecaJaLiberada(peca.status)) {");
    expect(responderFonte).toContain("reescalarReservaEPartes(peca as any, peca.quantity - efeito.reuseQty)");
    expect(responderFonte).toContain("details: trilhaDoAtendimento(e.atendida, atual.pedida, e.quem.userName),");
    expect(responderFonte).toContain("aplicadoEm: aplicado ? new Date() : null,");
    // fecha por último, condicional em 'aberta': a segunda pessoa recebe 409 e tudo dela desfaz
    expect(responderFonte).toContain('.where(and(eq(consultasDeEstoque.id, e.id), eq(consultasDeEstoque.status, "aberta")))');
    expect(responderFonte.indexOf("reservarAtivosParaPeca(tx")).toBeLessThan(responderFonte.indexOf("tx.update(consultasDeEstoque)"));
    expect(responderFonte).toContain('if (!respondida) throw erro(409,');
    // a resposta NUNCA manda a peça em revisão para a frente
    expect(responderFonte).not.toContain('"ready_for_production"');

    // e a rota de reservar do Estoque passa pela MESMA função (nada duplicado)
    const estoque = ler("server/routes/estoque-reservas.ts");
    expect(estoque).toContain("export async function reservarAtivosParaPeca(");
    expect(estoque).toContain("reservarAtivosParaPeca(tx, { itemId: req.params.id, assetIds: pedidos, quem, agora }));");
    expect(estoque.match(/tx\.insert\(eventInventoryAllocations\)/g)).toHaveLength(1);
  });
});

describe("POST /api/consultas-de-estoque/:id/cancelar", () => {
  const ROTA = "POST /api/consultas-de-estoque/:id/cancelar";
  it("cancela quem pediu, ou o admin — outra pessoa da Solicitação não, nem a Gráfica", async () => {
    expect((await chamar(ROTA, SOLICITACAO, { params: { id: "c-1" } })).status).toBe(200);
    expect((await chamar(ROTA, ADMIN, { params: { id: "c-1" } })).status).toBe(200);
    expect((await chamar(ROTA, { role: "solicitacao", id: "u-outra" }, { params: { id: "c-1" } })).status).toBe(403);
    expect((await chamar(ROTA, GRAFICA, { params: { id: "c-1" } })).status).toBe(403);
  });
  it("só enquanto aberta: depois da resposta, 409", async () => {
    H.repo.cancelarConsulta = vi.fn(async () => null);
    expect((await chamar(ROTA, SOLICITACAO, { params: { id: "c-1" } })).status).toBe(409);
  });
});

describe("a régua de papéis declara as três escritas", () => {
  it("pedir e cancelar: Solicitação + admin; responder: Gráfica + admin", () => {
    const de = (rota: string) => REGUA_DE_PAPEIS.find((r) => r.rota === rota)?.papeis;
    expect(de("/api/items/:id/consulta-de-estoque")).toEqual(["admin", "solicitacao"]);
    expect(de("/api/consultas-de-estoque/:id/cancelar")).toEqual(["admin", "solicitacao"]);
    expect(de("/api/consultas-de-estoque/:id/responder")).toEqual(["admin", "grafica"]);
  });
});

// ─── 3 · A LIBERAÇÃO ─────────────────────────────────────────────────────────
describe("PATCH /api/items/:id/creator-review — é a Revisão Final que segue com a peça", () => {
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
    // dentro da transação, marcar aplicado é um UPDATE de verdade na tabela da solicitação
    H.liberacao.marcarRespostaAplicada = vi.fn(async (t: any, id: string) => { await t.update(consultasDeEstoque).set({ aplicadoEm: new Date(), _id: id }).where(); });
  });

  const liberar = (body: any = {}) => chamar("PATCH /api/items/:id/creator-review", SOLICITACAO, { params: { id: "i-1" }, body });
  const trilhas = () => inserts.filter((i) => i.table === auditLogs).map((i) => i.vals.details as string);
  const atendeu = (atendida: number, pedida = 5) => { H.liberacao.respostaDoEstoqueParaLiberar = vi.fn(async () => ({ id: "c-1", pedida, atendida, respondidoPor: "Gil" })); };

  it("UM CLIQUE, corpo vazio: estoque atendeu 3 de 5 → 3 reaproveitadas + 3 a produzir, trilha própria e solicitação marcada, na mesma transação", async () => {
    atendeu(3);
    const r = await liberar();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ status: "ready_for_production", reuseQty: 3, isReuse: false });
    expect(trilhas()).toContain("Reaproveitamento atendido pelo estoque: 3 de 5 pedidas (Gil)");
    expect(trilhas().some((t) => t.includes("reaproveitamento parcial: 3 un. de 6, 3 a produzir"))).toBe(true);
    expect(H.liberacao.marcarRespostaAplicada).toHaveBeenCalledWith(expect.anything(), "c-1");
    expect(sets.some((s) => s.table === consultasDeEstoque && s.vals.aplicadoEm instanceof Date)).toBe(true);
    expect(H.db.transaction).toHaveBeenCalledTimes(1);
  });

  it("atendeu TUDO (6 de 6): reaproveitamento total — pula produção, mesmo sem arquivo final", async () => {
    itemEmFoco.finalFileUrl = null;
    atendeu(6, 6);
    const r = await liberar();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ status: "produced", reuseQty: 6, isReuse: true });
  });

  it("NÃO ATENDE (ou sem resposta): libera para produção normal, nada de reaproveitamento, nada marcado", async () => {
    const r = await liberar();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "ready_for_production" });
    expect(r.body.reuseQty ?? 0).toBe(0);
    expect(H.liberacao.marcarRespostaAplicada).not.toHaveBeenCalled();
    expect(trilhas().some((t) => t.includes("pelo estoque"))).toBe(false);
    // "não atendida" não é resposta a aplicar: a leitura só traz atendida / atendida em parte
    const fonte = ler("server/services/consultaDeEstoqueNaLiberacao.ts");
    expect(fonte).toContain('inArray(consultasDeEstoque.status, ["atendida", "atendida_parcial"]),');
    expect(fonte).toContain("isNull(consultasDeEstoque.aplicadoEm),");
  });

  it("USAR MENOS do que o estoque atendeu: 2 de 3 vale, e a trilha diz; MAIS do que o atendido é recusado", async () => {
    atendeu(3);
    const menos = await liberar({ reuseQty: 2, peloEstoque: true });
    expect(menos.body).toMatchObject({ reuseQty: 2, isReuse: false, status: "ready_for_production" });
    expect(trilhas()).toContain("Reaproveitamento atendido pelo estoque: 3 de 5 pedidas (Gil) — a Revisão Final usou 2");

    const mais = await liberar({ reuseQty: 4, peloEstoque: true });
    expect(mais.status).toBe(409);
    expect(mais.body.error).toContain("nunca mais");
    expect(H.db.transaction).toHaveBeenCalledTimes(1); // só a primeira liberou
  });

  it("“usar N do estoque” sem resposta disponível: 409 — nada vira reaproveitamento sem lastro", async () => {
    const r = await liberar({ reuseQty: 2, peloEstoque: true });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("não está mais disponível");
    expect(H.db.transaction).not.toHaveBeenCalled();
  });

  it("usar ZERO: libera para produção normal e a solicitação deixa de sugerir", async () => {
    atendeu(3);
    const r = await liberar({ reuseQty: 0, peloEstoque: true });
    expect(r.status).toBe(200);
    expect(r.body.reuseQty ?? 0).toBe(0);
    expect(H.liberacao.marcarRespostaAplicada).toHaveBeenCalled();
    expect(trilhas().some((t) => t.endsWith("— a Revisão Final usou 0"))).toBe(true);
  });

  it("o caminho antigo (“já conferi — aplicar agora”, reuseQty sem a marca) manda, e a solicitação é marcada sem a trilha do estoque", async () => {
    atendeu(3);
    const r = await liberar({ reuseQty: 5 });
    expect(r.body).toMatchObject({ reuseQty: 5, isReuse: false });
    expect(H.liberacao.marcarRespostaAplicada).toHaveBeenCalled();
    expect(trilhas().some((t) => t.includes("atendido pelo estoque"))).toBe(false);
  });

  it("peça já liberada: a rota é idempotente e nem lê a resposta — a liberação não aplica duas vezes", async () => {
    itemEmFoco.status = "ready_for_production";
    atendeu(3);
    const r = await liberar();
    expect(r.status).toBe(200);
    expect(H.liberacao.respostaDoEstoqueParaLiberar).not.toHaveBeenCalled();
    expect(H.db.transaction).not.toHaveBeenCalled();
  });

  it("ler a resposta nunca derruba a liberação (tabela ainda não criada em produção) — e o módulo não importa rota nenhuma", () => {
    const fonte = ler("server/services/consultaDeEstoqueNaLiberacao.ts");
    const leitura = fonte.slice(fonte.indexOf("export async function respostaDoEstoqueParaLiberar"), fonte.indexOf("export async function marcarRespostaAplicada"));
    expect(leitura).toContain("} catch (error) {");
    expect(leitura).toContain("return null;");
    expect(fonte).not.toMatch(/from "\.\.\/routes\//);
  });
});

// ─── 4 · BANCO ───────────────────────────────────────────────────────────────
describe("a migração é só aditiva — e sem local", () => {
  const SQL = ler("scripts/migracao-aditiva-producao.sql");
  const bloco = SQL.slice(SQL.indexOf("Solicitação ao estoque a partir da Revisão Final"), SQL.indexOf('21/09 · Etapa "Embalado"'));

  it("CREATE TABLE / INDEX IF NOT EXISTS, índice único parcial e FKs só se faltarem", () => {
    expect(bloco).toContain("CREATE TABLE IF NOT EXISTS consultas_de_estoque (");
    expect(bloco).toContain('CREATE INDEX IF NOT EXISTS "IDX_consultas_de_estoque_item" ON consultas_de_estoque (item_id);');
    expect(bloco).toContain('CREATE INDEX IF NOT EXISTS "IDX_consultas_de_estoque_status" ON consultas_de_estoque (status);');
    expect(bloco).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_consultas_de_estoque_aberta_por_peca" ON consultas_de_estoque (item_id) WHERE status = 'aberta';`);
    expect(bloco).toContain("IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = fk.nome)");
    // "ON DELETE CASCADE" da chave estrangeira não é um DELETE de dado.
    expect(bloco).not.toMatch(/\b(DROP|TRUNCATE|DELETE FROM|UPDATE \w+ SET)\b/);
    expect(bloco).not.toMatch(/ALTER TABLE \w+ (DROP|ALTER COLUMN)/);
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("(table_name='consultas_de_estoque' AND column_name IN ('status','quantidade_pedida','quantidade_atendida','ativos_ids','aplicado_em'))");
  });

  it("as colunas do SQL são as do schema — e nenhuma guarda o local da peça (dono, 21/09)", () => {
    const schema = ler("shared/schema.ts");
    const tabela = schema.slice(schema.indexOf('pgTable("consultas_de_estoque"'), schema.indexOf("UQ_consultas_de_estoque_aberta_por_peca"));
    const colunas = Array.from(tabela.matchAll(/(?:varchar|text|timestamp|integer)\("([a-z_]+)"\)/g), (m) => m[1]);
    expect(colunas).toEqual([
      "id", "item_id", "event_id", "pedido_por", "pedido_por_id", "pedido_em", "observacao", "status", "quantidade_pedida", "quantidade_atendida",
      "ativos_ids", "observacao_resposta", "foto_url", "respondido_por", "respondido_por_id", "respondido_em", "aplicado_em",
    ]);
    for (const c of colunas) expect(bloco, c).toMatch(new RegExp(`^\\s+${c} `, "m"));
    expect(colunas.some((c) => /local|location/.test(c))).toBe(false);
  });

  it("as rotas estão registradas e o WebSocket atualiza a caixa, o número, a lista e a ficha", () => {
    expect(ler("server/routes.ts")).toContain("registerConsultasDeEstoqueRoutes(app);");
    const ws = ler("client/src/hooks/use-websocket.ts");
    expect(ws).toContain("case 'consultas_de_estoque':");
    expect(ws).toContain("q.queryKey.includes('consulta-de-estoque')");
  });
});
