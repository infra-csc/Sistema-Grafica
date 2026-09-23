// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE, RESERVAS E TRIAGEM — as ROTAS REAIS (routes/estoque-reservas.ts,
// routes/inventory.ts) e o ciclo do evento (storage) executados sobre o banco
// de mentira que avalia o WHERE (regras-estoque-banco-de-mentira.ts), com o
// requireRole DE VERDADE (é ele que os casos de papel exercitam).
//
// Vieram de casos que só liam o texto do servidor em:
//   · estoque-reserva.test.ts (rotas registradas, só admin, trava e reconfere,
//     caminhão que saiu, reserva que virou uso, ciclo do evento respeita a
//     reserva, escrita do acervo só admin, local opcional, lote dividido);
//   · triagem-reserva-e-recarga.test.ts (trava antes da consulta da reserva,
//     colunas mínimas da fila, lote sem local);
//   · estoque-agrupado-e-usos.test.ts (usos: leitura só do admin, recortada,
//     uma consulta; o campo location segue aceito).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import ts from "typescript";
import { criarBanco, type Banco } from "./regras-estoque-banco-de-mentira";

const H = vi.hoisted(() => ({ banco: null as any, auditoria: [] as any[], broadcasts: [] as any[] }));
vi.mock("../db", () => ({ db: new Proxy({}, { get: (_t, k) => H.banco.db[k] }), pool: {} }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real, // requireRole é o de VERDADE
    requireAuth: (_q: any, _s: any, n: any) => n(),
    broadcast: (m: any) => { H.broadcasts.push(m); },
    createAuditLog: async (...a: any[]) => { H.auditoria.push(a); },
    createAuditLogsEmLote: async (_req: any, linhas: any[]) => { H.auditoria.push(...linhas); },
  };
});

import { registerEstoqueReservasRoutes, reservarAtivosParaPeca, LIMITE_DO_RECORTE_DE_USOS } from "../routes/estoque-reservas";
import { registerInventoryRoutes } from "../routes/inventory";
import { storage } from "../storage";
import { getTableConfig } from "drizzle-orm/pg-core";
import { inventoryAssets } from "@shared/schema";

type Handler = (req: any, res: any, next: any) => unknown;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) app[v] = (c: string, ...hs: Handler[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return app; };
registerEstoqueReservasRoutes(app);
const DO_ESTOQUE = Array.from(rotas.keys());
registerInventoryRoutes(app);

type Quem = { papel: string | null; id?: string };
const ADMIN: Quem = { papel: "admin", id: "u-adm" };
async function chamar(chave: string, quem: Quem, ctx: { params?: any; body?: any; query?: any } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const session = quem.papel ? { userId: quem.id ?? `u-${quem.papel}`, userRole: quem.papel } : {};
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: ctx.query ?? {}, session, userRole: quem.papel, userId: (session as any).userId, userName: "Ana" };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body };
}

// ─── o mundo ────────────────────────────────────────────────────────────────
const dias = (n: number) => new Date(Date.now() + n * 864e5);
const evento = (id: string, inicio: number, over: Record<string, unknown> = {}) => ({ id, name: id.toUpperCase(), startDate: dias(inicio), truckDepartureDate: dias(inicio - 3), arquivadoEm: null, ...over });
const peca = (id: string, eventId: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, eventId, type: "2x1", description: "Nubank", visualWidth: "2.00", visualHeight: "1.00",
  quantity: 3, status: "awaiting_final_review", deletedAt: null, ...over,
});
const ativo = (id: string, origem: string, over: Record<string, unknown> = {}) => ({
  id, displayId: `#EST-${id}`, name: "2x1 Nubank", trackingStatus: "NO_GALPAO", condition: "PERFEITO", quantity: 1, sponsorIds: [],
  approvalThumbUrl: null, originalItemId: origem, location: null, notes: null,
  updatedAt: dias(-60), createdAt: dias(-60), ...over,
});

let b: Banco;
function montar(t: Record<string, any[]> = {}) {
  b = criarBanco({
    events: [evento("velho", -30), evento("futuro", 20), evento("outro", 40)],
    items: [peca("orig", "velho", { status: "delivered" }), peca("dest", "futuro"), peca("outra", "outro")],
    inventory_assets: [], event_inventory_allocations: [], item_sponsors: [], audit_logs: [],
    ...t,
  });
  H.banco = b;
}
beforeEach(() => { H.auditoria = []; H.broadcasts = []; });

// ═════════════════════════════════════════════════════════════════════════════
describe("as rotas do estoque estão registradas", () => {
  it("resumo, semelhantes, reservar, liberar, usos e reservas ativas", () => {
    expect(DO_ESTOQUE.sort()).toEqual([
      "DELETE /api/items/:id/reservas/:reservaId",
      "GET /api/estoque/reservas-ativas",
      "GET /api/estoque/usos",
      "GET /api/events/:eventId/estoque-resumo",
      "GET /api/items/:id/estoque-semelhantes",
      "POST /api/items/:id/reservas",
    ]);
  });

  it("todo register*Routes de server/routes/ é chamado com o app em server/routes.ts", () => {
    // Varredura (AST): server/routes.ts importa o servidor inteiro (sessão, WebSocket, crons) — não dá para executar aqui.
    const RAIZ = path.resolve(__dirname, "../..");
    const exportadas = new Set<string>();
    for (const f of readdirSync(path.join(RAIZ, "server/routes")).filter((x) => x.endsWith(".ts"))) {
      const sf = ts.createSourceFile(f, readFileSync(path.join(RAIZ, "server/routes", f), "utf8"), ts.ScriptTarget.Latest, true);
      for (const st of sf.statements) {
        if (ts.isFunctionDeclaration(st) && st.name && /^register\w+Routes$/.test(st.name.text) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) exportadas.add(st.name.text);
      }
    }
    const chamadas = new Set<string>();
    const sf = ts.createSourceFile("routes.ts", readFileSync(path.join(RAIZ, "server/routes.ts"), "utf8"), ts.ScriptTarget.Latest, true);
    const visita = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.arguments[0] && ts.isIdentifier(n.arguments[0]) && n.arguments[0].text === "app") chamadas.add(n.expression.text);
      ts.forEachChild(n, visita);
    };
    visita(sf);
    expect(exportadas.has("registerEstoqueReservasRoutes")).toBe(true);
    expect(exportadas.has("registerInventoryRoutes")).toBe(true);
    expect(Array.from(exportadas).filter((f) => !chamadas.has(f))).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("reservar e liberar são só do admin (15/09: Estoque é só do admin)", () => {
  it("POST e DELETE de reserva: sem sessão 401; Solicitação, Gráfica, Arte e Atendimento 403 — e nada é gravado", async () => {
    montar({ inventory_assets: [ativo("a1", "orig")] });
    for (const papel of [null, "solicitacao", "grafica", "arte", "atendimento"]) {
      const r = await chamar("POST /api/items/:id/reservas", { papel }, { params: { id: "dest" }, body: { assetIds: ["a1"] } });
      expect(r.status, String(papel)).toBe(papel ? 403 : 401);
      const d = await chamar("DELETE /api/items/:id/reservas/:reservaId", { papel }, { params: { id: "dest", reservaId: "r1" } });
      expect(d.status, String(papel)).toBe(papel ? 403 : 401);
    }
    expect(b.gravacoes()).toEqual([]);
    const ok = await chamar("POST /api/items/:id/reservas", ADMIN, { params: { id: "dest" }, body: { assetIds: ["a1"] } });
    expect(ok).toEqual({ status: 201, body: { reservadas: 1 } });
    expect(b.mundo.event_inventory_allocations).toEqual([expect.objectContaining({ assetId: "a1", itemId: "dest", eventId: "futuro", reservadoPor: "Ana", reservadoPorId: "u-adm" })]);
  });
});

describe("reservar trava as peças e confere TUDO de novo no servidor", () => {
  it("trava a peça de destino e as do estoque (FOR UPDATE) antes de gravar", async () => {
    montar({ inventory_assets: [ativo("a1", "orig")] });
    await b.db.transaction((tx: any) => reservarAtivosParaPeca(tx, { itemId: "dest", assetIds: ["a1"], quem: { userName: "Ana" }, agora: new Date() }));
    const travas = b.ops.filter((o) => o.travou).map((o) => o.tabela);
    expect(travas).toEqual(["items", "inventory_assets"]);
    const insercao = b.ops.findIndex((o) => o.tipo === "insert");
    expect(b.ops.findIndex((o) => o.tabela === "inventory_assets" && o.travou)).toBeLessThan(insercao);
  });

  it("mais unidades do que a peça tem: 409 'dá para reservar mais N'", async () => {
    montar({
      inventory_assets: [ativo("a1", "orig", { quantity: 2 }), ativo("a2", "orig", { quantity: 2 })],
      event_inventory_allocations: [],
    });
    const r = await chamar("POST /api/items/:id/reservas", ADMIN, { params: { id: "dest" }, body: { assetIds: ["a1", "a2"] } });
    expect(r).toEqual({ status: 409, body: { error: "A peça tem 3 un. e já há 0 reservada(s) — dá para reservar mais 3." } });
    expect(b.gravacoes()).toEqual([]);
  });

  it("peça do estoque que não está livre (manutenção, reservada para outro): 409 'Não deu para reservar —' com o motivo", async () => {
    montar({
      inventory_assets: [ativo("a1", "orig", { trackingStatus: "EM_MANUTENCAO" }), ativo("a2", "orig")],
      event_inventory_allocations: [{ id: "r0", assetId: "a2", eventId: "outro", itemId: "outra", allocatedAt: dias(-1), reservadoPor: "Bia", reservadoPorId: null }],
    });
    const r = await chamar("POST /api/items/:id/reservas", ADMIN, { params: { id: "dest" }, body: { assetIds: ["a1", "a2"] } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Não deu para reservar — #EST-a1: Em manutenção; #EST-a2: Reservada para OUTRO.");
    expect(b.mundo.event_inventory_allocations).toHaveLength(1);
  });

  it("depois que o caminhão saiu: 409 e nada reservado", async () => {
    montar({
      events: [evento("velho", -30), evento("futuro", 1)], // saída 2 dias atrás
      items: [peca("orig", "velho", { status: "delivered" }), peca("dest", "futuro")],
      inventory_assets: [ativo("a1", "orig")],
    });
    const r = await chamar("POST /api/items/:id/reservas", ADMIN, { params: { id: "dest" }, body: { assetIds: ["a1"] } });
    expect(r).toEqual({ status: 409, body: { error: "O caminhão deste evento já saiu — não dá mais para reservar peça do estoque para ele." } });
    expect(b.gravacoes()).toEqual([]);
  });

  it("liberar a reserva que JÁ VIROU USO (EM_USO, caminhão saiu): 409; antes da saída, libera", async () => {
    const reserva = { id: "r1", assetId: "a1", eventId: "futuro", itemId: "dest", allocatedAt: dias(-5), reservadoPor: "Ana", reservadoPorId: null };
    montar({
      events: [evento("velho", -30), evento("futuro", 1)],
      items: [peca("orig", "velho", { status: "delivered" }), peca("dest", "futuro")],
      inventory_assets: [ativo("a1", "orig", { trackingStatus: "EM_USO" })],
      event_inventory_allocations: [reserva],
    });
    const r = await chamar("DELETE /api/items/:id/reservas/:reservaId", ADMIN, { params: { id: "dest", reservaId: "r1" } });
    expect(r).toEqual({ status: 409, body: { error: "Esta peça já saiu no caminhão deste evento — a reserva virou uso e não pode ser desfeita." } });
    expect(b.mundo.event_inventory_allocations).toHaveLength(1);

    montar({ inventory_assets: [ativo("a1", "orig")], event_inventory_allocations: [reserva] });
    const ok = await chamar("DELETE /api/items/:id/reservas/:reservaId", ADMIN, { params: { id: "dest", reservaId: "r1" } });
    expect(ok).toEqual({ status: 200, body: { ok: true } });
    expect(b.mundo.event_inventory_allocations).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a busca no estoque", () => {
  it("peças iguais com locais antigos diferentes caem no MESMO lote (o sistema não guarda o local)", async () => {
    montar({ inventory_assets: [ativo("a1", "orig", { location: "Setor A" }), ativo("a2", "orig", { location: "Galpão Central" })] });
    const r = await chamar("GET /api/items/:id/estoque-semelhantes", { papel: "solicitacao" }, { params: { id: "dest" } });
    expect(r.status).toBe(200);
    expect(r.body.lotes).toHaveLength(1);
    expect(r.body.lotes[0]).toMatchObject({ disponibilidade: "disponivel", quantidade: 2 });
    expect(r.body.lotes[0].ativos.map((a: any) => a.id)).toEqual(["a1", "a2"]);
    expect(JSON.stringify(r.body)).not.toMatch(/Setor A|Galpão Central|"local/);
  });
});

describe("GET /api/estoque/usos — LEITURA, só do admin, recortada, numa consulta", () => {
  const usos = () => montar({
    events: [evento("velho", -30), evento("futuro", 20), evento("arquivado", 10, { arquivadoEm: dias(-1) })],
    inventory_assets: [ativo("a1", "orig"), ativo("m1", "sem-origem", { originalItemId: null }), ativo("x1", "outra-origem", { originalItemId: "outra" })],
    event_inventory_allocations: [
      { id: "u1", assetId: "a1", eventId: "futuro", itemId: "dest", allocatedAt: dias(-2) },
      { id: "u2", assetId: "a1", eventId: "arquivado", itemId: null, allocatedAt: dias(-3) },
      { id: "u3", assetId: "m1", eventId: "futuro", itemId: null, allocatedAt: dias(-4) },
      { id: "u4", assetId: "x1", eventId: "futuro", itemId: null, allocatedAt: dias(-4) },
    ],
  });

  it("quem não é admin: 403 (sem sessão, 401)", async () => {
    usos();
    for (const papel of ["solicitacao", "grafica", "arte", "atendimento"]) expect((await chamar("GET /api/estoque/usos", { papel }, { query: { itens: "orig" } })).status, papel).toBe(403);
    expect((await chamar("GET /api/estoque/usos", { papel: null }, { query: { itens: "orig" } })).status).toBe(401);
  });

  it("sem recorte (itens=/ativos=) é 400; acima do teto também — nunca mais o acervo inteiro", async () => {
    usos();
    expect((await chamar("GET /api/estoque/usos", ADMIN)).status).toBe(400);
    const muitos = Array.from({ length: LIMITE_DO_RECORTE_DE_USOS + 1 }, (_, i) => `i${i}`).join(",");
    expect((await chamar("GET /api/estoque/usos", ADMIN, { query: { itens: muitos } })).status).toBe(400);
    expect(b.ops).toEqual([]);
  });

  it("devolve só os usos dos materiais pedidos (sem o de evento arquivado), com a peça de destino, num select só e sem escrever", async () => {
    usos();
    const r = await chamar("GET /api/estoque/usos", ADMIN, { query: { itens: "orig", ativos: "m1" } });
    expect(r.status).toBe(200);
    expect(r.body.map((u: any) => [u.id, u.itemDisplayId])).toEqual([["u1", "#dest"], ["u3", null]]);
    expect(b.ops.filter((o) => o.tipo === "select")).toHaveLength(1);
    expect(b.gravacoes()).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o ciclo do evento respeita a reserva de OUTRO evento", () => {
  // velho → a peça "orig" gerou a1 (livre) e a2 (reservada para o evento "outro", que ainda vai acontecer)
  const cenario = (situacao: string) => montar({
    inventory_assets: [ativo("a1", "orig", { trackingStatus: situacao }), ativo("a2", "orig", { trackingStatus: situacao })],
    event_inventory_allocations: [{ id: "r1", assetId: "a2", eventId: "outro", itemId: "outra", allocatedAt: dias(-1) }],
  });

  it("a saída do caminhão do evento de origem não despacha a reservada para outro evento", async () => {
    cenario("NO_GALPAO");
    await storage.markAssetsInUseForEvent("velho", dias(-33));
    expect(b.linha("inventory_assets", "a1")!.trackingStatus).toBe("EM_USO");
    expect(b.linha("inventory_assets", "a2")!.trackingStatus).toBe("NO_GALPAO");
  });

  it("a volta do evento de origem não manda a reservada para outro evento à triagem", async () => {
    cenario("EM_USO");
    await storage.markAssetsAwaitingTriageForEvent("velho");
    expect(b.linha("inventory_assets", "a1")!.trackingStatus).toBe("AGUARDANDO_TRIAGEM");
    expect(b.linha("inventory_assets", "a2")!.trackingStatus).toBe("EM_USO");
  });

  it("reserva de evento ARQUIVADO ou que já acabou não segura a peça", async () => {
    montar({
      events: [evento("velho", -30), evento("arq", 40, { arquivadoEm: dias(-1) }), evento("passado", -10)],
      inventory_assets: [ativo("a1", "orig"), ativo("a2", "orig")],
      event_inventory_allocations: [
        { id: "r1", assetId: "a1", eventId: "arq", itemId: null, allocatedAt: dias(-1) },
        { id: "r2", assetId: "a2", eventId: "passado", itemId: null, allocatedAt: dias(-12) },
      ],
    });
    await storage.markAssetsInUseForEvent("velho", dias(-33));
    expect(b.mundo.inventory_assets.map((a) => a.trackingStatus)).toEqual(["EM_USO", "EM_USO"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o acervo: escrita só do admin; triagem sem exigir local", () => {
  const ESCRITAS: Array<[string, any]> = [
    ["POST /api/inventory", {}],
    ["PATCH /api/inventory/:id", { params: { id: "a1" } }],
    ["DELETE /api/inventory/:id", { params: { id: "a1" } }],
    ["PATCH /api/inventory/:id/triage", { params: { id: "a1" } }],
    ["POST /api/inventory/:id/triage-split", { params: { id: "a1" } }],
    ["POST /api/events/:id/dispatch-inventory", { params: { id: "velho" } }],
    ["POST /api/events/:id/return-inventory", { params: { id: "velho" } }],
    ["POST /api/events/:id/allocations", { params: { id: "velho" } }],
    ["DELETE /api/allocations/:id", { params: { id: "r1" } }],
  ];

  it("toda escrita do acervo (inclusive excluir e saída/retorno à mão) é 403 para quem não é admin", async () => {
    montar({ inventory_assets: [ativo("a1", "orig", { trackingStatus: "AGUARDANDO_TRIAGEM" })] });
    for (const [rota, ctx] of ESCRITAS) {
      for (const papel of ["grafica", "solicitacao"]) expect((await chamar(rota, { papel }, ctx)).status, `${rota} ${papel}`).toBe(403);
    }
    expect(b.gravacoes()).toEqual([]);
  });

  it("voltar ao Galpão sem local passa; o local, se vier, é aceito e gravado; mais de 120 caracteres é 400", async () => {
    montar({ inventory_assets: [ativo("a1", "orig", { trackingStatus: "AGUARDANDO_TRIAGEM" }), ativo("a2", "orig", { trackingStatus: "AGUARDANDO_TRIAGEM" })] });
    expect((await chamar("PATCH /api/inventory/:id/triage", ADMIN, { params: { id: "a1" }, body: { condition: "PERFEITO", trackingStatus: "NO_GALPAO" } })).status).toBe(200);
    expect(b.linha("inventory_assets", "a1")).toMatchObject({ trackingStatus: "NO_GALPAO", location: null });
    expect((await chamar("PATCH /api/inventory/:id/triage", ADMIN, { params: { id: "a2" }, body: { trackingStatus: "NO_GALPAO", location: "x".repeat(121) } })).status).toBe(400);
    expect((await chamar("PATCH /api/inventory/:id/triage", ADMIN, { params: { id: "a2" }, body: { trackingStatus: "NO_GALPAO", location: "Setor B" } })).status).toBe(200);
    expect(b.linha("inventory_assets", "a2")!.location).toBe("Setor B");
    // a coluna continua no banco (nenhum dado muda)
    expect(getTableConfig(inventoryAssets).columns.find((c) => c.name === "location")?.columnType).toBe("PgText");
  });

  it("a triagem por quantidade também não exige local", async () => {
    montar({ inventory_assets: [ativo("a1", "orig", { trackingStatus: "AGUARDANDO_TRIAGEM", quantity: 3 })] });
    const r = await chamar("POST /api/inventory/:id/triage-split", ADMIN, { params: { id: "a1" }, body: { splits: [
      { qty: 2, condition: "PERFEITO", trackingStatus: "NO_GALPAO" }, { qty: 1, condition: "SUCATA", trackingStatus: "DESCARTADO" },
    ] } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    // o lote dividido diz de que peça saiu
    expect(b.mundo.inventory_assets.map((a) => a.displayId)).toEqual(["#EST-a1", "#EST-a1-L2"]);
  });

  it("descartar: a linha do ativo é TRAVADA antes de consultar a reserva, na mesma transação", async () => {
    montar({ inventory_assets: [ativo("a1", "orig", { trackingStatus: "AGUARDANDO_TRIAGEM" })] });
    const r = await chamar("PATCH /api/inventory/:id/triage", ADMIN, { params: { id: "a1" }, body: { condition: "SUCATA", trackingStatus: "DESCARTADO" } });
    expect(r.status).toBe(200);
    const trava = b.ops.findIndex((o) => o.tabela === "inventory_assets" && o.travou);
    const reserva = b.ops.findIndex((o) => o.tipo === "select" && o.tabela === "event_inventory_allocations");
    expect(trava).toBeGreaterThan(-1);
    expect(trava).toBeLessThan(reserva);
    expect(b.ops[trava].tx).not.toBeNull();
    expect(b.ops[reserva].tx).toBe(b.ops[trava].tx);
  });
});

describe("a fila da triagem lê só o que cita", () => {
  it("colunas mínimas (id/eventId da peça; id/nome/início do evento) e recorte por id", async () => {
    montar({
      inventory_assets: [ativo("a1", "orig", { trackingStatus: "AGUARDANDO_TRIAGEM", sponsorIds: ["sp1"] })],
      sponsors: [{ id: "sp1", name: "Nubank" }, { id: "sp2", name: "Itaú" }],
    });
    const r = await chamar("GET /api/inventory/awaiting-triage", ADMIN);
    expect(r.status).toBe(200);
    expect(r.body).toEqual([expect.objectContaining({ id: "a1", eventId: "velho", eventName: "VELHO", sponsors: [{ id: "sp1", name: "Nubank" }] })]);
    const sel = (t: string) => b.ops.find((o) => o.tipo === "select" && o.tabela === t)!;
    expect(sel("items").colunas).toEqual(["id", "eventId"]);
    expect(sel("events").colunas).toEqual(["id", "name", "startDate"]);
    expect(sel("sponsors").colunas).toEqual(["id", "name"]);
    for (const t of ["items", "events", "sponsors"]) expect(sel(t).where!.sql, t).toMatch(/"id" in \(\$1\)/);
  });
});
