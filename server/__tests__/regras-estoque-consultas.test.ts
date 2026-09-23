// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE — o REPOSITÓRIO (services/consultasDeEstoque.ts) e a
// leitura da liberação (services/consultaDeEstoqueNaLiberacao.ts) EXECUTADOS
// sobre o banco de mentira que avalia o WHERE (regras-estoque-banco-de-mentira.ts),
// com a reserva e a busca de 14/09 de verdade (routes/estoque-reservas.ts).
//
// Vieram de casos de consulta-de-estoque.test.ts que liam o texto do servidor:
// o 23505 vira 409; "o sistema sugere" só o que está LIVRE e sem local; a
// resposta (reserva + efeito na peça + fechamento) numa transação só; a
// leitura da liberação só traz atendida/atendida em parte não aplicada e nunca
// derruba a liberação. (Lá, a rota roda com o repositório de mentira; aqui é
// o repositório que roda.)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { criarBanco, type Banco } from "./regras-estoque-banco-de-mentira";

const H = vi.hoisted(() => ({ banco: null as any }));
vi.mock("../db", () => ({ db: new Proxy({}, { get: (_t, k) => H.banco.db[k] }), pool: {} }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, broadcast: () => {}, createAuditLog: async () => {}, createAuditLogsEmLote: async () => {} };
});

import { criarConsulta, sugestoesParaPeca, responderConsulta } from "../services/consultasDeEstoque";
import { respostaDoEstoqueParaLiberar, marcarRespostaAplicada } from "../services/consultaDeEstoqueNaLiberacao";

const RAIZ = path.resolve(__dirname, "../..");
const dias = (n: number) => new Date(Date.now() + n * 864e5);
const evento = (id: string, inicio: number, over: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), startDate: dias(inicio), truckDepartureDate: dias(inicio - 3), arquivadoEm: null, ...over });
const peca = (id: string, eventId: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, eventId, type: "2x1", description: "Nubank", visualWidth: "2.00", visualHeight: "1.00",
  quantity: 6, reuseQty: 0, isReuse: false, quantityProduced: 0, status: "awaiting_final_review", deletedAt: null,
  impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null, ...over,
});
const ativo = (id: string, origem: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#EST-${id}`, trackingStatus: "NO_GALPAO", condition: "PERFEITO", quantity: 1, sponsorIds: [],
  approvalThumbUrl: null, originalItemId: origem, location: null, ...over,
});
const consulta = (over: Record<string, unknown> = {}) => ({
  id: "c-1", itemId: "i-1", eventId: "futuro", status: "aberta", quantidadePedida: 5, quantidadeAtendida: null, ativosIds: [],
  pedidoEm: dias(-1), respondidoEm: null, respondidoPor: null, aplicadoEm: null, ...over,
});
const QUEM = { userName: "Gil", userId: "u-graf" };

let b: Banco;
function montar(t: Record<string, any[]> = {}, opcoes: Parameters<typeof criarBanco>[1] = {}) {
  b = criarBanco({
    events: [evento("velho", -30), evento("futuro", 20), evento("outro", 40)],
    items: [peca("orig", "velho", { status: "delivered" }), peca("i-1", "futuro")],
    inventory_assets: [], event_inventory_allocations: [], item_sponsors: [], audit_logs: [], consultas_de_estoque: [consulta()],
    ...t,
  }, opcoes);
  H.banco = b;
}
afterEach(() => { vi.restoreAllMocks(); });

// ═════════════════════════════════════════════════════════════════════════════
describe("pedir: UMA aberta por peça", () => {
  it("a segunda (índice único → 23505) vira 409 com frase de gente; outro erro sobe como veio", async () => {
    montar({}, { aoInserir: () => { throw Object.assign(new Error("duplicate key"), { code: "23505" }); } });
    await expect(criarConsulta({ itemId: "i-1", eventId: "futuro", quantidadePedida: 5, observacao: null, quem: QUEM }))
      .rejects.toMatchObject({ httpStatus: 409, message: "Já existe uma solicitação ao estoque aberta para esta peça." });
    montar({}, { aoInserir: () => { throw new Error("banco fora"); } });
    await expect(criarConsulta({ itemId: "i-1", eventId: "futuro", quantidadePedida: 5, observacao: null, quem: QUEM }))
      .rejects.toThrow("banco fora");
  });

  it("sem conflito, grava quem pediu, a quantidade e o recado", async () => {
    montar({ consultas_de_estoque: [] });
    const c = await criarConsulta({ itemId: "i-1", eventId: "futuro", quantidadePedida: 5, observacao: "de Manaus", quem: QUEM });
    expect(c).toMatchObject({ itemId: "i-1", quantidadePedida: 5, observacao: "de Manaus", pedidoPor: "Gil", pedidoPorId: "u-graf" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("“o sistema sugere” é a busca de 14/09, só com o que está LIVRE — e sem local", () => {
  const acervo = () => montar({
    inventory_assets: [
      ativo("livre", "orig", { location: "Setor A" }),
      ativo("reservada", "orig"),
      ativo("em-uso", "orig", { trackingStatus: "EM_USO" }),
      ativo("manut", "orig", { trackingStatus: "EM_MANUTENCAO" }),
      ativo("outro-tipo", "grade"),
    ],
    items: [peca("orig", "velho", { status: "delivered" }), peca("grade", "velho", { type: "Grade", status: "delivered" }), peca("i-1", "futuro"), peca("x", "outro")],
    event_inventory_allocations: [{ id: "r1", assetId: "reservada", eventId: "outro", itemId: "x", allocatedAt: dias(-1) }],
  });

  it("automática: mesmo tipo e medida, só o disponível; nada de local no que volta", async () => {
    acervo();
    const r = await sugestoesParaPeca("i-1");
    expect(r.semMedida).toBe(false);
    expect(r.sugestoes.flatMap((s) => s.ativos.map((a) => a.id))).toEqual(["livre"]);
    expect(JSON.stringify(r)).not.toMatch(/Setor A|"local|location/);
  });

  it("busca manual: acha fora da régua de tipo (quem procura com os olhos), mas continua só o LIVRE", async () => {
    acervo();
    const r = await sugestoesParaPeca("i-1", "est");
    expect(r.sugestoes.flatMap((s) => s.ativos.map((a) => a.id)).sort()).toEqual(["livre", "outro-tipo"]);
  });

  it("peça sem medida e sem busca: diz que falta a medida, sem varrer o acervo; peça excluída: 404", async () => {
    acervo();
    b.linha("items", "i-1")!.visualWidth = null;
    expect(await sugestoesParaPeca("i-1")).toEqual({ semMedida: true, sugestoes: [] });
    expect(b.ops.some((o) => o.tabela === "inventory_assets")).toBe(false);
    b.linha("items", "i-1")!.deletedAt = new Date();
    await expect(sugestoesParaPeca("i-1")).rejects.toMatchObject({ httpStatus: 404 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("responder: RESERVA + efeito na peça + fechamento numa transação só", () => {
  it("peça JÁ LIBERADA: reserva pelo mecanismo do Estoque, aplica o reaproveitamento (trilha própria) e fecha a solicitação com aplicadoEm", async () => {
    montar({
      items: [peca("orig", "velho", { status: "delivered" }), peca("i-1", "futuro", { status: "ready_for_production" })],
      inventory_assets: [ativo("a1", "orig"), ativo("a2", "orig")],
    });
    const r = await responderConsulta({ id: "c-1", status: "atendida_parcial", atendida: 2, ativosIds: ["a1", "a2"], observacao: null, fotoUrl: null, quem: QUEM });
    expect(r).toMatchObject({ aplicado: true, codigos: ["#EST-a1", "#EST-a2"] });
    expect(b.linha("items", "i-1")).toMatchObject({ reuseQty: 2, isReuse: false, status: "ready_for_production" });
    expect(b.mundo.event_inventory_allocations.map((x) => x.assetId)).toEqual(["a1", "a2"]);
    expect(b.mundo.audit_logs.map((a) => a.details)).toEqual(["Reaproveitamento atendido pelo estoque: 2 de 5 pedidas (Gil)"]);
    expect(b.linha("consultas_de_estoque", "c-1")).toMatchObject({ status: "atendida_parcial", quantidadeAtendida: 2, respondidoPor: "Gil" });
    expect(b.linha("consultas_de_estoque", "c-1")!.aplicadoEm).toBeInstanceOf(Date);
    // uma transação só; a peça é travada; a reserva vem antes de fechar a solicitação
    const escritas = b.gravacoes();
    expect(new Set(escritas.map((o) => o.tx)).size).toBe(1);
    expect(escritas[0].tx).not.toBeNull();
    expect(b.ops.some((o) => o.tabela === "items" && o.travou && (o.where?.params ?? []).includes("i-1"))).toBe(true);
    const iReserva = b.ops.findIndex((o) => o.tipo === "insert" && o.tabela === "event_inventory_allocations");
    const iFecha = b.ops.findIndex((o) => o.tipo === "update" && o.tabela === "consultas_de_estoque");
    expect(iReserva).toBeLessThan(iFecha);
  });

  it("cobrir a peça liberada inteira fecha como Produzido", async () => {
    montar({ items: [peca("orig", "velho", { status: "delivered" }), peca("i-1", "futuro", { status: "ready_for_production", quantity: 5 })] });
    await responderConsulta({ id: "c-1", status: "atendida", atendida: 5, ativosIds: [], observacao: null, fotoUrl: null, quem: QUEM });
    expect(b.linha("items", "i-1")).toMatchObject({ reuseQty: 5, isReuse: true, status: "produced" });
  });

  it("peça ainda NA REVISÃO: a resposta só fica registrada — a peça não muda (e NUNCA é liberada)", async () => {
    montar({ inventory_assets: [ativo("a1", "orig")] });
    const r = await responderConsulta({ id: "c-1", status: "atendida", atendida: 5, ativosIds: ["a1"], observacao: "ok", fotoUrl: null, quem: QUEM });
    expect(r.aplicado).toBe(false);
    expect(b.linha("items", "i-1")).toMatchObject({ status: "awaiting_final_review", reuseQty: 0 });
    expect(b.gravacoes().some((o) => o.tipo === "update" && o.tabela === "items")).toBe(false);
    expect(b.linha("consultas_de_estoque", "c-1")).toMatchObject({ status: "atendida", aplicadoEm: null, observacaoResposta: "ok" });
  });

  it("a Gráfica escolheu com os olhos: a régua de tipo/medida sugere, não proíbe a reserva", async () => {
    montar({
      items: [peca("grade", "velho", { type: "Grade", status: "delivered" }), peca("i-1", "futuro")],
      inventory_assets: [ativo("g1", "grade")],
    });
    await responderConsulta({ id: "c-1", status: "atendida_parcial", atendida: 1, ativosIds: ["g1"], observacao: null, fotoUrl: null, quem: QUEM });
    expect(b.mundo.event_inventory_allocations).toEqual([expect.objectContaining({ assetId: "g1", itemId: "i-1" })]);
  });

  it("não cabe mais (4 de 6 já impressas, atender 3): 409 com frase de gente — e a reserva feita antes é DESFEITA", async () => {
    montar({
      items: [peca("orig", "velho", { status: "delivered" }), peca("i-1", "futuro", { status: "ready_for_production", quantityProduced: 4 })],
      inventory_assets: [ativo("a1", "orig")],
    });
    await expect(responderConsulta({ id: "c-1", status: "atendida_parcial", atendida: 3, ativosIds: ["a1"], observacao: null, fotoUrl: null, quem: QUEM }))
      .rejects.toMatchObject({ httpStatus: 409, message: expect.stringContaining("Só cabem 2 un.") });
    expect(b.gravacoes()).toEqual([]);
    expect(b.mundo.event_inventory_allocations).toEqual([]);
    expect(b.linha("consultas_de_estoque", "c-1")!.status).toBe("aberta");
  });

  it("duas pessoas respondendo: o fechamento é condicional em 'aberta' — a segunda recebe 409 e tudo dela desfaz", async () => {
    montar({
      items: [peca("orig", "velho", { status: "delivered" }), peca("i-1", "futuro", { status: "ready_for_production" })],
      inventory_assets: [ativo("a1", "orig")],
      consultas_de_estoque: [consulta({ status: "atendida" })],
    });
    await expect(responderConsulta({ id: "c-1", status: "atendida_parcial", atendida: 1, ativosIds: ["a1"], observacao: null, fotoUrl: null, quem: QUEM }))
      .rejects.toMatchObject({ httpStatus: 409, message: "Esta solicitação não está mais aberta — atualize a tela." });
    expect(b.gravacoes()).toEqual([]);
    expect(b.linha("items", "i-1")!.reuseQty).toBe(0);
  });

  it("só a reserva do Estoque grava em event_inventory_allocations (fora a alocação à mão do evento, sem peça)", () => {
    // Varredura (AST): "nada duplicado" é uma regra de estrutura — toda escrita de reserva de peça passa por reservarAtivosParaPeca.
    const arquivos: string[] = [];
    const varre = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = path.join(dir, f);
        if (statSync(p).isDirectory()) { if (f !== "__tests__") varre(p); } else if (f.endsWith(".ts")) arquivos.push(p);
      }
    };
    varre(path.join(RAIZ, "server"));
    const donos: string[] = [];
    for (const arq of arquivos) {
      const sf = ts.createSourceFile(arq, readFileSync(arq, "utf8"), ts.ScriptTarget.Latest, true);
      const visita = (n: ts.Node, dono: string) => {
        let atual = dono;
        if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) atual = n.name.getText(sf);
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "insert"
          && n.arguments[0] && n.arguments[0].getText(sf) === "eventInventoryAllocations") {
          donos.push(`${path.relative(RAIZ, arq).replace(/\\/g, "/")}:${atual}`);
        }
        ts.forEachChild(n, (f) => visita(f, atual));
      };
      visita(sf, "");
    }
    expect(donos.sort()).toEqual(["server/routes/estoque-reservas.ts:reservarAtivosParaPeca", "server/storage.ts:allocateAssetToEvent"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a leitura da resposta na liberação da Revisão Final", () => {
  it("só atendida / atendida em parte, ainda NÃO aplicada, a mais recente; 'não atendida' não é resposta a aplicar", async () => {
    montar({ consultas_de_estoque: [
      consulta({ id: "nao", status: "nao_atendida", quantidadeAtendida: 0, respondidoEm: dias(0) }),
      consulta({ id: "aplicada", status: "atendida", quantidadeAtendida: 5, respondidoEm: dias(0), aplicadoEm: dias(0) }),
      consulta({ id: "velha", status: "atendida_parcial", quantidadeAtendida: 2, respondidoEm: dias(-3), respondidoPor: "Ana" }),
      consulta({ id: "nova", status: "atendida_parcial", quantidadeAtendida: 3, respondidoEm: dias(-1), respondidoPor: "Gil" }),
      consulta({ id: "de-outra", itemId: "i-2", status: "atendida", quantidadeAtendida: 5, respondidoEm: dias(0) }),
    ] });
    expect(await respostaDoEstoqueParaLiberar("i-1")).toEqual({ id: "nova", pedida: 5, atendida: 3, respondidoPor: "Gil" });
    montar({ consultas_de_estoque: [consulta({ status: "nao_atendida", quantidadeAtendida: 0 }), consulta({ id: "c-2", status: "cancelada", quantidadeAtendida: 4 })] });
    expect(await respostaDoEstoqueParaLiberar("i-1")).toBeNull();
  });

  it("ler a resposta nunca derruba a liberação (tabela ainda não criada em produção): null e o log", async () => {
    montar();
    b.db.select = () => { throw new Error('relation "consultas_de_estoque" does not exist'); };
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await respostaDoEstoqueParaLiberar("i-1")).toBeNull();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("a peça segue sem ela"), expect.any(Error));
  });

  it("marcar como aplicada só toca a que ainda não foi aplicada", async () => {
    const antes = dias(-2);
    montar({ consultas_de_estoque: [consulta({ status: "atendida" }), consulta({ id: "c-2", status: "atendida", aplicadoEm: antes })] });
    await b.db.transaction((tx: any) => marcarRespostaAplicada(tx, "c-1"));
    await b.db.transaction((tx: any) => marcarRespostaAplicada(tx, "c-2"));
    expect(b.linha("consultas_de_estoque", "c-1")!.aplicadoEm).toBeInstanceOf(Date);
    expect(b.linha("consultas_de_estoque", "c-2")!.aplicadoEm).toBe(antes);
  });

  it("o módulo não importa rota nenhuma (routes/items.ts o carrega com ../routes/shared de mentira em dezenas de testes)", () => {
    // Varredura (AST): regra de dependência entre módulos, não de comportamento.
    const arq = path.join(RAIZ, "server/services/consultaDeEstoqueNaLiberacao.ts");
    const sf = ts.createSourceFile(arq, readFileSync(arq, "utf8"), ts.ScriptTarget.Latest, true);
    const origens = sf.statements.filter(ts.isImportDeclaration).map((d) => (d.moduleSpecifier as ts.StringLiteral).text);
    expect(origens.length).toBeGreaterThan(0);
    expect(origens.filter((o) => /(^|\/)routes(\/|$)/.test(o))).toEqual([]);
  });
});
