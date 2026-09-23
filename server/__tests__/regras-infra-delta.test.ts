// ─────────────────────────────────────────────────────────────────────────────
// O DELTA DE GET /api/items, RODANDO (veio de delta-sync-itens.test.ts, que
// lia o texto da rota; a parte do cliente continua lá).
//
// O que se prende aqui, pela resposta da rota com o storage de mentira:
//   · ?since= recente responde o DELTA: itens mudados, removidas (apagadas ou
//     fora do recorte), eventos e patrocinadores inteiros;
//   · o `agora` que o cliente guarda para o próximo delta vem 60 s ATRÁS — a
//     transação que confirma depois do carimbo não cai no vão (17/09: 2 s
//     deixava escapar);
//   · since velho (>24 h) ou ilegível cai no fetch cheio (array).
// O mesmo delta contra o Postgres de verdade (updated_at, lixeira) está em
// integracao-peca-do-rascunho-a-entrega.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ chamadas: [] as string[], mudadas: [] as Array<Record<string, unknown>>, todas: [] as Array<Record<string, unknown>> }));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<typeof import("../storage")>("../storage");
  // Todo método do storage que a rota pedir e o teste não definiu devolve lista vazia.
  const storage = new Proxy({} as Record<string, unknown>, {
    get: (_alvo, nome: string) => {
      if (nome === "getItemsChangedSince") return async (since: Date) => { H.chamadas.push(`since:${since.toISOString()}`); return H.mudadas; };
      if (nome === "getAllItems") return async () => { H.chamadas.push("todas"); return H.todas; };
      if (nome === "getAllEvents") return async () => [{ id: "ev-1", name: "COPA", status: "created" }];
      if (nome === "getAllSponsors") return async () => [{ id: "sp-1", name: "PATROCINADOR" }];
      if (nome === "then") return undefined;
      return async () => [];
    },
  });
  return { ...real, storage };
});
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";
import { capturarRotas } from "./rotas-de-mentira";

const { chamar } = capturarRotas(registerItemRoutes);
const ADMIN = { userId: "u-admin", userRole: "admin", userName: "Ana" };
const peca = (id: string, extra: Record<string, unknown> = {}) => ({ id, displayId: `#${id}`, eventId: "ev-1", status: "draft", type: "Pórtico", quantity: 1, deletedAt: null, ...extra });

beforeEach(() => {
  H.chamadas = [];
  H.mudadas = [peca("viva"), peca("apagada", { deletedAt: new Date() })];
  H.todas = [peca("viva")];
});

describe("GET /api/items?since=", () => {
  it("since recente: delta com itens, removidas (as apagadas), eventos e patrocinadores inteiros", async () => {
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const r = await chamar("GET /api/items", { sessao: ADMIN, query: { since } });
    expect(r.status).toBe(200);
    const corpo = r.body as { delta: boolean; itens: Array<{ id: string }>; removidas: string[]; eventos: unknown[]; patrocinadores: unknown[] };
    expect(corpo.delta).toBe(true);
    expect(corpo.itens.map((i) => i.id)).toEqual(["viva"]);
    expect(corpo.removidas).toEqual(["apagada"]);
    expect(corpo.eventos).toEqual([{ id: "ev-1", name: "COPA", status: "created" }]);
    expect(corpo.patrocinadores).toEqual([{ id: "sp-1", name: "PATROCINADOR" }]);
    // Quem pediu o delta foi o storage de "mudadas desde", com o since recebido.
    expect(H.chamadas).toEqual([`since:${since}`]);
  });

  it("o `agora` do próximo delta vem 60 s antes do relógio (sobreposição contra o commit atrasado)", async () => {
    const antes = Date.now();
    const r = await chamar("GET /api/items", { sessao: ADMIN, query: { since: new Date(antes - 1000).toISOString() } });
    const depois = Date.now();
    const agora = Date.parse((r.body as { agora: string }).agora);
    expect(agora).toBeGreaterThanOrEqual(antes - 60_000);
    expect(agora).toBeLessThanOrEqual(depois - 60_000);
  });

  it("since velho (>24 h) cai no fetch cheio — array, sem delta", async () => {
    const r = await chamar("GET /api/items", { sessao: ADMIN, query: { since: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() } });
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    expect(H.chamadas).toEqual(["todas"]);
  });

  it("since ilegível também cai no fetch cheio", async () => {
    const r = await chamar("GET /api/items", { sessao: ADMIN, query: { since: "ontem" } });
    expect(Array.isArray(r.body)).toBe(true);
    expect(H.chamadas).toEqual(["todas"]);
  });
});
