// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM E ESTOQUE — correções da revisão adversarial de 22/09 (o puro e as
// rotas; a tela montada mora em triagem-estoque-tela-montada.test.ts).
//
//   1. RESERVA QUE SOBREVIVIA À TRIAGEM: descartar/mandar para manutenção uma
//      peça reservada deixava a reserva valendo sobre estoque que não existe.
//      Servidor: 409 com frase humana. Plano: reservadas vão primeiro ao
//      Galpão; se não couberem, viram `conflitos` (a tela avisa).
//   3. TEMPESTADE DE RECARGAS: awaiting-triage lia getAllItems() inteiro, e o
//      `inventory_triaged` de cada peça recarregava tudo em cada aba.
//   4. NOVA TENTATIVA: registro ×N que falhou volta com as N unidades; ×N que
//      não fecha não bloqueia mais um plano possível.
//   7. CONTAGENS em unidades; a origem não se repete.
//   8. GET /api/estoque/usos: só admin, com recorte obrigatório.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  agruparAtivos, distribuicaoDasFalhas, escolherIntocados, planoDeGravacao, tudoPara,
} from "../../client/src/components/triagem/grupos-da-triagem";
import { eventosDeUso, recusaPorReserva, usosDoAtivo } from "../../shared/estoque";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

const ativo = (id: string, extra: any = {}) => ({
  id, displayId: `#EST-${id}`, name: "2x1 Ministério", quantity: 1, condition: "PERFEITO", trackingStatus: "AGUARDANDO_TRIAGEM",
  location: null, notes: null, franchiseTags: [], sponsorIds: [], sponsors: [], approvalThumbUrl: null, autoAdded: true,
  originalItemId: "item-2x1", updatedAt: null, eventId: "ev", eventName: "Evento", eventDate: null, ...extra,
}) as any;

const RESERVA = { eventName: "Meia do Rio", itemDisplayId: "#0123" };

// ─── 1 · o plano com reservas ────────────────────────────────────────────────
describe("plano de gravação com peças RESERVADAS", () => {
  // 10 registros; os três últimos no código estão reservados.
  const grupo = agruparAtivos(Array.from({ length: 10 }, (_, i) => ativo(`0412-${i + 1}`)))[0];
  const reservadas = new Set(["0412-8", "0412-9", "0412-10"]);
  const reservaDe = (id: string) => (reservadas.has(id) ? RESERVA : undefined);
  const destinoDe = (passos: any[], id: string) => passos.find((p) => p.ativoId === id)?.corpo.trackingStatus;
  // `corpo` é união (gravação simples | divisão): o destino só existe no ramo
  // simples, e é dele que estes casos falam.
  const destino = (p: { corpo: Record<string, unknown> | { splits: Record<string, unknown>[] } }) =>
    (p.corpo as Record<string, unknown>).trackingStatus;

  it("as reservadas vão PRIMEIRO para o Galpão, mesmo sendo as últimas no código", () => {
    const { passos, conflitos } = planoDeGravacao(grupo, { galpao: 3, manutencao: 5, descartar: 2 }, "PERFEITO", reservaDe);
    expect(conflitos).toEqual([]);
    for (const id of reservadas) expect(destinoDe(passos, id)).toBe("NO_GALPAO");
    expect(passos.filter((p) => destino(p) === "DESCARTADO").map((p) => p.ativoId)).toEqual(["0412-6", "0412-7"]);
  });

  it("Galpão menor que as reservadas: as que sobram ficam SEM destino (aguardando) se der", () => {
    // 1 no Galpão, 2 descartar, 7 sem destino: 2 reservadas ficam intocadas.
    const { passos, conflitos } = planoDeGravacao(grupo, { galpao: 1, manutencao: 0, descartar: 2 }, "PERFEITO", reservaDe);
    expect(conflitos).toEqual([]);
    expect(passos.length).toBe(3);
    expect(passos.filter((p) => reservadas.has(p.ativoId)).map(destino)).toEqual(["NO_GALPAO"]);
  });

  it("não cabe de jeito nenhum → conflito com a frase do servidor (a tela avisa antes de salvar)", () => {
    const { conflitos } = planoDeGravacao(grupo, { galpao: 1, manutencao: 0, descartar: 9 }, "PERFEITO", reservaDe);
    expect(conflitos.map((c) => c.ativoId).sort()).toEqual(["0412-10", "0412-9"]);
    expect(recusaPorReserva(conflitos[0].displayId, conflitos[0].reserva)).toBe(
      `${conflitos[0].displayId} está reservado para #0123 (Meia do Rio) — libere a reserva ou mande para o Galpão`,
    );
  });

  it("registro ×N reservado dividido entre destinos também é conflito", () => {
    const g = agruparAtivos([ativo("M-7", { quantity: 10 })])[0];
    const { conflitos, passos } = planoDeGravacao(g, { galpao: 6, manutencao: 4, descartar: 0 }, "PERFEITO", () => RESERVA);
    expect(passos[0].tipo).toBe("divisao");
    expect(conflitos.map((c) => c.ativoId)).toEqual(["M-7"]);
  });

  it("sem reservas, a ordem é a de sempre (os primeiros no código vão primeiro)", () => {
    const { passos } = planoDeGravacao(grupo, { galpao: 2, manutencao: 0, descartar: 1 }, "PERFEITO");
    expect(passos.map((p) => [p.ativoId, destino(p)])).toEqual([["0412-1", "NO_GALPAO"], ["0412-2", "NO_GALPAO"], ["0412-3", "DESCARTADO"]]);
  });
});

// ─── 4 · nova tentativa e ×N que não bloqueia ────────────────────────────────
describe("plano possível não é barrado por registro ×N; falha volta inteira", () => {
  it("[×5, ×1, ×1] com 2 no Galpão: grava os dois unitários, o ×5 fica aguardando", () => {
    const g = agruparAtivos([ativo("A-1", { quantity: 5 }), ativo("A-2"), ativo("A-3")])[0];
    const { passos, incompletos } = planoDeGravacao(g, { galpao: 2, manutencao: 0, descartar: 0 }, "PERFEITO");
    expect(incompletos).toEqual([]);
    expect(passos.map((p) => p.ativoId).sort()).toEqual(["A-2", "A-3"]);
  });

  it("[×4, ×3] com 3 no Galpão: o ×3 inteiro (soma de subconjunto), não um ×4 cortado", () => {
    const g = agruparAtivos([ativo("B-1", { quantity: 4 }), ativo("B-2", { quantity: 3 })])[0];
    const { passos, incompletos } = planoDeGravacao(g, { galpao: 3, manutencao: 0, descartar: 0 }, "PERFEITO");
    expect(incompletos).toEqual([]);
    expect(passos).toMatchObject([{ ativoId: "B-2", tipo: "triagem", unidades: 3 }]);
  });

  it("só o impossível segue incompleto (um registro ×10 com 4 distribuídas)", () => {
    const g = agruparAtivos([ativo("M-7", { quantity: 10 })])[0];
    expect(planoDeGravacao(g, { galpao: 0, manutencao: 4, descartar: 0 }, "PERFEITO").incompletos).toEqual([{ ativoId: "M-7", displayId: "#EST-M-7", quantidade: 10, faltam: 6 }]);
  });

  it("escolherIntocados: guloso pelo fim, soma de subconjunto quando precisa, null quando não fecha", () => {
    expect(Array.from(escolherIntocados([1, 1, 1, 1], 2)!).sort()).toEqual([2, 3]);
    expect(Array.from(escolherIntocados([4, 3, 2], 6)!).sort()).toEqual([0, 2]);
    expect(escolherIntocados([10], 6)).toBeNull();
    expect(escolherIntocados([5, 5], 0)!.size).toBe(0);
  });

  it("a arrumação das falhas devolve TODAS as unidades do registro ×N (não 1)", () => {
    const g = agruparAtivos([ativo("M-7", { quantity: 10 }), ativo("A-2")])[0];
    const { passos } = planoDeGravacao(g, tudoPara(11, "galpao"), "PERFEITO");
    expect(distribuicaoDasFalhas(passos)).toEqual({ [g.chave]: { galpao: 11, manutencao: 0, descartar: 0 } });
    const div = planoDeGravacao(agruparAtivos([ativo("M-8", { quantity: 10 })])[0], { galpao: 6, manutencao: 0, descartar: 4 }, "PERFEITO").passos;
    expect(Object.values(distribuicaoDasFalhas(div))[0]).toEqual({ galpao: 6, manutencao: 0, descartar: 4 });
  });
});

// ─── 7 · contagens ───────────────────────────────────────────────────────────
describe("onde já foi usado conta UNIDADES e não repete a origem", () => {
  const agora = new Date("2026-09-22T12:00:00Z");
  const origem = { id: "ev-o", name: "Primavera RJ", startDate: "2026-08-10T00:00:00Z", itemDisplayId: "#0396" };
  const aloc = (id: string, eventId: string, eventName: string, inicio: string) =>
    ({ id, assetId: "a1", eventId, eventName, inicio, itemId: null, itemDisplayId: null, em: inicio });

  it("alocação manual para o PRÓPRIO evento de origem não vira um segundo uso", () => {
    const usos = usosDoAtivo(origem, [aloc("1", "ev-o", "Primavera RJ", "2026-08-10T00:00:00Z"), aloc("2", "ev-x", "Meia", "2026-12-01T00:00:00Z")], agora);
    expect(usos.map((u) => [u.eventName, u.situacao])).toEqual([["Meia", "separada"], ["Primavera RJ", "origem"]]);
  });

  it("registro ×10 conta 10 unidades no evento", () => {
    const u = usosDoAtivo(origem, [], agora);
    expect(eventosDeUso([u, u], [10, 1])[0].unidades).toBe(11);
    // Sem as quantidades, o comportamento antigo (1 por registro) continua.
    expect(eventosDeUso([u, u])[0].unidades).toBe(2);
  });
});

// ─── 1 e 3 · as rotas ────────────────────────────────────────────────────────
const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>, db: {} as Record<string, any>, auditoria: [] as any[],
  broadcasts: [] as any[], consultas: [] as string[],
}));
vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../routes/shared", () => ({
  requireAuth: (_q: any, _s: any, n: any) => n(),
  requireRole: () => (_q: any, _s: any, n: any) => n(),
  broadcast: (m: any) => { H.broadcasts.push(m); },
  createAuditLog: async (...a: any[]) => { H.auditoria.push(a); },
}));

import { registerInventoryRoutes } from "../routes/inventory";
import { inventoryAssets, eventInventoryAllocations, items, events, sponsors } from "@shared/schema";

const rotas = new Map<string, any[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) app[v] = (c: string, ...hs: any[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return app; };
registerInventoryRoutes(app);

async function chamar(chave: string, params: any, body: any = {}) {
  const res: any = { _status: 200, _body: undefined };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h({ params, body, query: {}, userName: "Ana" }, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body };
}

let linhas: Record<string, any>;
let alocacoes: { assetId: string; eventName: string; inicio: string; itemDisplayId: string | null }[];
let inseridos: any[];

const nomeDaTabela = (t: any) =>
  t === inventoryAssets ? "inventory_assets" : t === eventInventoryAllocations ? "allocations" : t === items ? "items" : t === events ? "events" : t === sponsors ? "sponsors" : "?";

/** SELECT encadeável: devolve as linhas da tabela do FROM (o WHERE fica por
 *  conta de cada teste montar só o que interessa). */
function select() {
  let tabela = "?";
  const c: any = {
    from: (t: any) => { tabela = nomeDaTabela(t); H.consultas.push(tabela); return c; },
    innerJoin: () => c, leftJoin: () => c, where: () => c, for: () => c, orderBy: () => c,
    then: (ok: any, erro: any) => Promise.resolve().then(() => {
      if (tabela === "allocations") return alocacoes;
      if (tabela === "inventory_assets") return Object.values(linhas).map((l) => ({ situacao: l.trackingStatus }));
      if (tabela === "items") return [{ id: "item-1", eventId: "ev-1" }];
      if (tabela === "events") return [{ id: "ev-1", name: "Primavera RJ", startDate: "2026-08-10T00:00:00Z" }];
      if (tabela === "sponsors") return [{ id: "sp1", name: "Nubank" }];
      return [];
    }).then(ok, erro),
  };
  return c;
}

beforeEach(() => {
  linhas = {
    a1: { id: "a1", displayId: "#EST-0396-1", name: "2x1 Nubank", quantity: 1, condition: "PERFEITO", trackingStatus: "AGUARDANDO_TRIAGEM", location: null, notes: null },
    a24: { id: "a24", displayId: "#EST-M-7", name: "Grade", quantity: 24, condition: "PERFEITO", trackingStatus: "AGUARDANDO_TRIAGEM", location: null, notes: null, franchiseTags: [], sponsorIds: [] },
  };
  alocacoes = [];
  inseridos = [];
  H.auditoria.length = 0; H.broadcasts.length = 0; H.consultas.length = 0;
  H.db.select = select;
  H.db.update = () => ({
    set: (dados: any) => ({
      where: () => {
        const aplicar = async () => {
          // Só o ativo do teste (a1 ou a24, o que ainda estiver aguardando).
          const linha = Object.values(linhas).find((l) => l.trackingStatus === "AGUARDANDO_TRIAGEM" && l._alvo);
          if (!linha) return [];
          Object.assign(linha, dados);
          return [{ ...linha }];
        };
        return { returning: () => aplicar(), then: (ok: any, erro: any) => aplicar().then(ok, erro) };
      },
    }),
  });
  H.db.insert = () => ({ values: (v: any) => { inseridos.push(v); const r: any = Promise.resolve([{ id: `novo-${inseridos.length}`, ...v }]); r.returning = () => Promise.resolve([{ id: `novo-${inseridos.length}`, ...v }]); return r; } });
  H.db.transaction = async (fn: any) => fn(H.db);
  H.storage.getInventoryAsset = async (id: string) => (linhas[id] ? { ...linhas[id] } : undefined);
});

describe("rota · reserva não sobrevive à triagem", () => {
  const reservaFutura = () => { alocacoes = [{ assetId: "a1", eventName: "Meia do Rio", inicio: "2099-01-10T00:00:00Z", itemDisplayId: "#0123" }]; };

  it("descartar peça RESERVADA → 409 com a frase, e nada muda", async () => {
    linhas.a1._alvo = true; reservaFutura();
    const r = await chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { condition: "SUCATA", trackingStatus: "DESCARTADO" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("#EST-0396-1 está reservado para #0123 (Meia do Rio) — libere a reserva ou mande para o Galpão");
    expect(linhas.a1.trackingStatus).toBe("AGUARDANDO_TRIAGEM");
    expect(H.auditoria.length).toBe(0);
    expect(H.broadcasts.length).toBe(0);
  });

  it("manutenção também recusa; o Galpão passa (a reserva continua verdadeira)", async () => {
    linhas.a1._alvo = true; reservaFutura();
    expect((await chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { trackingStatus: "EM_MANUTENCAO" })).status).toBe(409);
    const ok = await chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { condition: "PERFEITO", trackingStatus: "NO_GALPAO" });
    expect(ok.status).toBe(200);
    expect(linhas.a1.trackingStatus).toBe("NO_GALPAO");
  });

  it("reserva de evento que JÁ ACABOU é histórico: não barra o descarte", async () => {
    linhas.a1._alvo = true;
    alocacoes = [{ assetId: "a1", eventName: "Velho", inicio: "2020-01-10T00:00:00Z", itemDisplayId: null }];
    expect((await chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { trackingStatus: "DESCARTADO" })).status).toBe(200);
  });

  it("a trava vem ANTES da consulta: SELECT … FOR UPDATE no ativo, depois a reserva", () => {
    const fonte = ler("server/routes/inventory.ts");
    const patch = fonte.slice(fonte.indexOf('app.patch("/api/inventory/:id/triage"'), fonte.indexOf('app.post("/api/inventory/:id/triage-split"'));
    expect(patch.indexOf("travarAtivo(tx")).toBeGreaterThan(0);
    expect(patch.indexOf("travarAtivo(tx")).toBeLessThan(patch.indexOf("reservaVigenteDoAtivo(tx"));
    expect(fonte).toContain('.for("update")');
  });

  it("dividir peça reservada → 409 (a divisão encolheria a reserva); nenhum lote nasce", async () => {
    linhas.a24._alvo = true;
    alocacoes = [{ assetId: "a24", eventName: "Meia do Rio", inicio: "2099-01-10T00:00:00Z", itemDisplayId: "#0123" }];
    const r = await chamar("POST /api/inventory/:id/triage-split", { id: "a24" }, { splits: [
      { qty: 20, condition: "PERFEITO", trackingStatus: "NO_GALPAO" },
      { qty: 4, condition: "SUCATA", trackingStatus: "DESCARTADO" },
    ] });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("#EST-M-7 está reservado para #0123 (Meia do Rio) — libere a reserva ou mande o registro inteiro para o Galpão");
    expect(linhas.a24.quantity).toBe(24);
    expect(inseridos.length).toBe(0);
  });
});

describe("rota · awaiting-triage lê só o que a fila cita", () => {
  it("não chama getAllItems/getAllEvents/getAllSponsors; enriquece com evento e patrocinador", async () => {
    const proibido = vi.fn(() => { throw new Error("leu a tabela inteira"); });
    H.storage.getAllItems = proibido; H.storage.getAllEvents = proibido; H.storage.getAllSponsors = proibido;
    H.storage.getAssetsAwaitingTriage = async () => [{ id: "a1", originalItemId: "item-1", sponsorIds: ["sp1"], displayId: "#EST-1" }];
    const r = await chamar("GET /api/inventory/awaiting-triage", {});
    expect(r.status).toBe(200);
    expect(proibido).not.toHaveBeenCalled();
    expect(r.body).toEqual([expect.objectContaining({ id: "a1", eventId: "ev-1", eventName: "Primavera RJ", sponsors: [{ id: "sp1", name: "Nubank" }] })]);
    expect(H.consultas).toEqual(["items", "events", "sponsors"]);
  });

  it("fila vazia não consulta nada além dela", async () => {
    H.storage.getAssetsAwaitingTriage = async () => [];
    expect((await chamar("GET /api/inventory/awaiting-triage", {})).body).toEqual([]);
    expect(H.consultas).toEqual([]);
  });

  it("as colunas lidas são as mínimas (id/eventId da peça; id/nome/início do evento) e em inArray", () => {
    const fonte = ler("server/routes/inventory.ts");
    const rota = fonte.slice(fonte.indexOf('app.get("/api/inventory/awaiting-triage"'), fonte.indexOf('app.get("/api/inventory/:id/allocations"'));
    expect(rota).toContain("db.select({ id: itemsTable.id, eventId: itemsTable.eventId })");
    expect(rota).toContain("inArray(itemsTable.id, ids)");
    expect(rota).not.toMatch(/getAll(Items|Events|Sponsors)\(/);
  });
});

describe("tempo real · inventory_triaged passa pelo coalescer", () => {
  it("as duas chaves vão para o coalescer (uma recarga por rajada, não uma por peça)", async () => {
    // Todo o mapa passa pelo coalescer no hook; as chaves estão no mapa.
    const { CHAVES_POR_MENSAGEM } = await import("../../client/src/lib/tempo-real-grafica");
    expect(CHAVES_POR_MENSAGEM.inventory_triaged).toEqual(["/api/inventory/awaiting-triage", "/api/inventory"]);
    const ws = ler("client/src/hooks/use-websocket.ts");
    expect(ws).toContain("for (const alvo of alvosDaMensagem(data)) agendarNoCoalescer(alvo);");
    expect(ws).not.toContain("case 'inventory_triaged':");
  });
});

describe("rota · GET /api/estoque/usos", () => {
  it("só admin, e sem recorte (itens=/ativos=) é 400 — nunca mais o acervo inteiro", () => {
    const fonte = ler("server/routes/estoque-reservas.ts");
    const rota = fonte.slice(fonte.indexOf('app.get("/api/estoque/usos"'), fonte.indexOf('app.get("/api/estoque/reservas-ativas"'));
    expect(rota).toContain('app.get("/api/estoque/usos", requireRole("admin")');
    expect(rota).toContain("if (itens.length === 0 && ativos.length === 0)");
    expect(rota).toContain(".where(recorte.length === 1 ? recorte[0] : or(...recorte))");
    // Quem chama é só o Estoque (só do admin).
    expect(ler("client/src/pages/estoque.tsx")).toContain('queryKey: ["/api/estoque/usos", qs]');
  });

  it("lote da busca no estoque não separa peças iguais por local antigo", () => {
    const fonte = ler("server/routes/estoque-reservas.ts");
    expect(fonte).not.toMatch(/a\.local|local: a\?\.local|inventoryAssets\.location/);
  });
});
