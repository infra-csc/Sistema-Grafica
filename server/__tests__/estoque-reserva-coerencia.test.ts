// ─────────────────────────────────────────────────────────────────────────────
// ESTOQUE E RESERVAS — coerência (rotas executadas com o banco de mentira).
//
//   · reserva de peça MORTA (cancelada/excluída) não segura estoque: some das
//     reservas vigentes, é solta ao cancelar/excluir (a que já virou uso fica);
//   · peça do acervo RESERVADA não vai para manutenção/descarte nem é excluída
//     (409 com a reserva no corpo); reserva de peça morta não barra;
//   · a reserva trava a PEÇA de destino antes de contar (corrida) e recusa da
//     impressão em diante, com o motivo;
//   · toda escrita do acervo avisa as telas em tempo real.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>, db: {} as Record<string, any>,
  auditoria: [] as any[], broadcasts: [] as any[],
}));
vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../routes/shared", () => ({
  requireAuth: (_q: any, _s: any, n: any) => n(),
  requireRole: () => (_q: any, _s: any, n: any) => n(),
  broadcast: (m: any) => { H.broadcasts.push(m); },
  createAuditLog: async (...a: any[]) => { H.auditoria.push(a); },
  createAuditLogsEmLote: async (_req: any, linhas: any[]) => { H.auditoria.push(...linhas); },
}));

import { registerInventoryRoutes } from "../routes/inventory";
import {
  carregarReservasAtivas, liberarReservasDaPeca, liberarReservasDasPecas, reservarAtivosParaPeca, STATUS_SEM_ESTOQUE,
} from "../routes/estoque-reservas";
import { inventoryAssets, eventInventoryAllocations, items, events, itemSponsors } from "@shared/schema";

const nome = (t: any) =>
  t === inventoryAssets ? "ativos" : t === eventInventoryAllocations ? "reservas" : t === items ? "pecas"
    : t === events ? "eventos" : t === itemSponsors ? "vinculos" : "?";

/** Banco de mentira: cada SELECT devolve as linhas da tabela do FROM e registra se travou (FOR UPDATE). */
function bancoFalso(linhasDe: (tabela: string) => any[]) {
  const selects: { tabela: string; travou: boolean }[] = [];
  const apagou: string[] = [];
  const inseriu: any[] = [];
  const atualizou: any[] = [];
  const exec: any = {
    select: () => {
      const reg = { tabela: "?", travou: false };
      const c: any = {
        from: (t: any) => { reg.tabela = nome(t); selects.push(reg); return c; },
        innerJoin: () => c, leftJoin: () => c, where: () => c, orderBy: () => c,
        for: () => { reg.travou = true; return c; },
        then: (ok: any, erro: any) => Promise.resolve().then(() => linhasDe(reg.tabela)).then(ok, erro),
      };
      return c;
    },
    delete: (t: any) => ({ where: () => { apagou.push(nome(t)); return Promise.resolve([]); } }),
    insert: () => ({ values: (v: any) => { inseriu.push(v); return Promise.resolve([]); } }),
    update: () => ({ set: (v: any) => ({ where: () => ({ returning: async () => { atualizou.push(v); return [{ id: "a1", ...v }]; } }) }) }),
  };
  exec.transaction = async (fn: any) => fn(exec);
  return { exec, selects, apagou, inseriu, atualizou };
}

const FUTURO = "2099-01-10T00:00:00Z";
const AGORA = new Date("2026-09-22T12:00:00Z");

// ─── reservas de peça morta ──────────────────────────────────────────────────
describe("reserva de peça cancelada/excluída não segura estoque", () => {
  const reserva = (id: string, extra: any) => ({
    id, assetId: `a-${id}`, itemId: `p-${id}`, eventId: "ev", eventName: "Meia do Rio", inicio: FUTURO, saida: FUTURO,
    reservadoPor: "Ana", allocatedAt: AGORA, quantidade: 1, pecaId: `p-${id}`, pecaStatus: "ready_for_production", pecaExcluidaEm: null, ...extra,
  });

  it("carregarReservasAtivas devolve só as de peça viva (e a alocação sem peça)", async () => {
    const { exec } = bancoFalso(() => [
      reserva("viva", {}),
      reserva("cancelada", { pecaStatus: "canceled" }),
      reserva("arquivada", { pecaStatus: "archived" }),
      reserva("excluida", { pecaExcluidaEm: new Date() }),
      reserva("manual", { itemId: null, pecaId: null, pecaStatus: null }),
    ]);
    const r = await carregarReservasAtivas(exec, AGORA);
    expect(r.map((x) => x.id)).toEqual(["viva", "manual"]);
    // O formato público não vaza as colunas de apoio.
    expect(Object.keys(r[0])).not.toContain("pecaStatus");
  });

  it("liberarReservasDaPeca solta a reserva e MANTÉM a que já virou uso (caminhão saiu com ela)", async () => {
    const { exec, apagou } = bancoFalso(() => [
      { id: "r1", itemId: "p1", assetId: "a1", eventId: "ev", displayId: "#EST-1", situacao: "NO_GALPAO", saida: FUTURO },
      { id: "r2", itemId: "p1", assetId: "a2", eventId: "ev", displayId: "#EST-2", situacao: "EM_USO", saida: "2026-09-01T00:00:00Z" },
    ]);
    const soltas = await liberarReservasDaPeca(exec, "p1", AGORA);
    expect(soltas.map((s) => s.id)).toEqual(["r1"]);
    expect(apagou).toEqual(["reservas"]);
  });

  it("nada a soltar → não apaga nada", async () => {
    const { exec, apagou } = bancoFalso(() => []);
    expect(await liberarReservasDaPeca(exec, ["p1", "p2"], AGORA)).toEqual([]);
    expect(apagou).toEqual([]);
  });

  it("liberarReservasDasPecas grava a trilha do ativo e avisa as telas; nunca derruba quem chamou", async () => {
    H.auditoria.length = 0; H.broadcasts.length = 0;
    const b = bancoFalso(() => [{ id: "r1", itemId: "p1", assetId: "a1", eventId: "ev-9", displayId: "#EST-1", situacao: "NO_GALPAO", saida: FUTURO }]);
    Object.assign(H.db, b.exec);
    await liberarReservasDasPecas({}, ["p1"], "cancelada");
    expect(H.auditoria).toEqual([expect.objectContaining({ action: "reserva_liberada", entityId: "a1" })]);
    expect(H.broadcasts).toEqual([{ type: "estoque_reservas", itemId: "p1", eventId: "ev-9" }]);

    H.db.select = () => { throw new Error("banco fora"); };
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(liberarReservasDasPecas({}, ["p1"], "excluída")).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

// ─── reservar: corrida e etapa ───────────────────────────────────────────────
describe("reservar trava a peça de destino e recusa da impressão em diante", () => {
  const peca = (status: string) => ({
    id: "p1", displayId: "#0062", type: "2x1", quantity: 2, status, deletedAt: null, largura: "2.00", altura: "1.00",
    eventId: "ev-novo", eventName: "Meia do Rio", inicio: FUTURO, saida: FUTURO,
  });
  const ativo = {
    id: "a1", displayId: "#EST-1", situacao: "NO_GALPAO", condicao: "PERFEITO", quantidade: 1, sponsorIds: [], thumb: null,
    origemItemId: "p-antiga", origemDisplayId: "#0001", origemTipo: "2x1", origemDescricao: null,
    origemLargura: "2", origemAltura: "1", origemEventId: "ev-velho", origemEventName: "Velho", origemInicio: "2026-01-01T00:00:00Z",
  };

  it("o PRIMEIRO select é a peça com FOR UPDATE (duas reservas simultâneas não passam da quantidade)", async () => {
    const b = bancoFalso((t) => (t === "pecas" ? [peca("ready_for_production")] : t === "ativos" ? [ativo] : []));
    await reservarAtivosParaPeca(b.exec, { itemId: "p1", assetIds: ["a1"], quem: { userName: "Ana" }, agora: AGORA });
    expect(b.selects[0]).toEqual({ tabela: "pecas", travou: true });
    expect(b.inseriu).toHaveLength(1);
  });

  it.each(["inProduction", "em_producao", "produced", "conferred", "packed"])("peça %s → 409 com o motivo, sem gravar", async (status) => {
    const b = bancoFalso((t) => (t === "pecas" ? [peca(status)] : t === "ativos" ? [ativo] : []));
    await expect(reservarAtivosParaPeca(b.exec, { itemId: "p1", assetIds: ["a1"], quem: {}, agora: AGORA }))
      .rejects.toMatchObject({ httpStatus: 409, message: expect.stringContaining("impressão") });
    expect(b.inseriu).toHaveLength(0);
  });

  it("cancelada e entregue dizem o motivo delas; liberada e aprovada seguem reserváveis", () => {
    for (const s of ["canceled", "archived", "delivered", "entregue", "inProduction"]) expect(STATUS_SEM_ESTOQUE.has(s), s).toBe(true);
    for (const s of ["draft", "awaiting_approval", "ready_for_production", "approved"]) expect(STATUS_SEM_ESTOQUE.has(s), s).toBe(false);
  });
});

// ─── rotas do acervo ─────────────────────────────────────────────────────────
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

describe("rotas do acervo · peça reservada e tempo real", () => {
  let alocacoes: any[];
  let banco: ReturnType<typeof bancoFalso>;
  beforeEach(() => {
    H.auditoria.length = 0; H.broadcasts.length = 0;
    alocacoes = [];
    banco = bancoFalso((t) => (t === "ativos" ? [{ situacao: "NO_GALPAO" }] : t === "reservas" ? alocacoes : []));
    for (const k of Object.keys(H.db)) delete H.db[k];
    Object.assign(H.db, banco.exec);
    H.storage.deleteInventoryAsset = vi.fn(async () => true);
    H.storage.createInventoryAsset = vi.fn(async (d: any) => ({ id: "novo", ...d }));
    H.storage.markAssetsInUseForEvent = vi.fn(async () => 3);
    H.storage.getEvent = vi.fn(async () => ({ id: "ev", truckDepartureDate: AGORA }));
  });
  const reservada = (extra: any = {}) => { alocacoes = [{ eventName: "Meia do Rio", inicio: FUTURO, itemDisplayId: "#0123", itemId: "p1", pecaStatus: "approved", pecaExcluidaEm: null, ...extra }]; };

  it.each(["EM_MANUTENCAO", "DESCARTADO"])("PATCH para %s com reserva vigente → 409 com a reserva, nada gravado", async (destino) => {
    reservada();
    const r = await chamar("PATCH /api/inventory/:id", { id: "a1" }, { trackingStatus: destino });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("ATIVO_RESERVADO");
    expect(r.body.error).toContain("reservada para #0123 (Meia do Rio)");
    expect(r.body.reserva).toMatchObject({ eventName: "Meia do Rio", itemDisplayId: "#0123" });
    expect(banco.atualizou).toHaveLength(0);
    expect(H.broadcasts).toHaveLength(0);
    // A trava do ativo vem antes da consulta da reserva.
    expect(banco.selects.slice(0, 2)).toEqual([{ tabela: "ativos", travou: true }, { tabela: "reservas", travou: false }]);
  });

  it("reserva de peça CANCELADA não barra; voltar ao galpão e mudar condição nem consultam reserva", async () => {
    reservada({ pecaStatus: "canceled" });
    expect((await chamar("PATCH /api/inventory/:id", { id: "a1" }, { trackingStatus: "DESCARTADO" })).status).toBe(200);
    reservada();
    banco.selects.length = 0;
    expect((await chamar("PATCH /api/inventory/:id", { id: "a1" }, { condition: "AVARIA_LEVE" })).status).toBe(200);
    expect((await chamar("PATCH /api/inventory/:id", { id: "a1" }, { trackingStatus: "NO_GALPAO" })).status).toBe(200);
    expect(banco.selects).toEqual([]);
    expect(H.broadcasts).toEqual([
      { type: "inventory_changed", assetId: "a1", acao: "atualizado" },
      { type: "inventory_changed", assetId: "a1", acao: "atualizado" },
      { type: "inventory_changed", assetId: "a1", acao: "atualizado" },
    ]);
  });

  it("DELETE de peça reservada → 409 e não exclui; sem reserva exclui e avisa", async () => {
    reservada();
    const r = await chamar("DELETE /api/inventory/:id", { id: "a1" });
    expect(r.status).toBe(409);
    expect(r.body.error).toContain("Libere a reserva antes de excluir");
    expect(H.storage.deleteInventoryAsset).not.toHaveBeenCalled();

    alocacoes = [];
    const ok = await chamar("DELETE /api/inventory/:id", { id: "a1" });
    expect(ok.status).toBe(200);
    expect(H.broadcasts).toEqual([{ type: "inventory_changed", assetId: "a1", acao: "excluido" }]);
  });

  it("POST e despacho manual avisam; 500 loga e responde em pt-BR", async () => {
    await chamar("POST /api/inventory", {}, { name: "Grade", displayId: "#EST-X" });
    await chamar("POST /api/events/:id/dispatch-inventory", { id: "ev" });
    expect(H.broadcasts).toEqual([
      { type: "inventory_changed", assetId: "novo", acao: "criado" },
      { type: "inventory_in_use", eventId: "ev", count: 3 },
    ]);
    H.storage.deleteInventoryAsset = vi.fn(async () => { throw new Error("pg: connection reset"); });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("DELETE /api/inventory/:id", { id: "a1" });
    expect(r.status).toBe(500);
    expect(r.body.error).not.toContain("pg:");
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});

// ─── cron: o dia seguinte é o de São Paulo ───────────────────────────────────
describe("triagem abre à meia-noite de São Paulo do dia seguinte ao evento", () => {
  it("evento no dia 20 → 21/09 00:00 em Brasília (03:00 UTC), não 00:00 UTC", async () => {
    const { meiaNoiteDoDiaSeguinteEmSaoPaulo } = await import("../services/inventoryLifecycle");
    expect(meiaNoiteDoDiaSeguinteEmSaoPaulo(new Date("2026-09-20T00:00:00Z")).toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(meiaNoiteDoDiaSeguinteEmSaoPaulo(new Date("2026-09-20T13:00:00Z")).toISOString()).toBe("2026-09-21T03:00:00.000Z");
    expect(meiaNoiteDoDiaSeguinteEmSaoPaulo(new Date("2026-12-31T00:00:00Z")).toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });
});
