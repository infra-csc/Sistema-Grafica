// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL DE INVENTÁRIO — o SEGUNDO caminho que nomeia ativos.
//
// `start-production` cria os ativos quando a peça fecha; `backfillInventoryAssets`
// (roda no boot) cria os que faltaram. Os dois precisam gerar EXATAMENTE o mesmo
// prefixo, senão a mesma peça ganha dois padrões de ativo — e quem abre o
// Estoque vê "#EST-0062C1-1" ao lado de "#EST-00621-1" sem entender que são a
// mesma coisa. Foi por divergência assim que o `.replace(/[^0-9]/g,'')` sobreviveu
// tanto tempo: ele estava certo para 100% do acervo antigo e só passou a mentir
// quando nasceu o primeiro displayId com sufixo.
//
// O literal `#EST-0062C1-1` aqui é o MESMO afirmado em complemento-leitura.test.ts
// para a rota de produção. Se um dos dois caminhos mudar sozinho, um dos dois
// arquivos fica vermelho — que é o alarme que se quer.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));

vi.mock("../db", () => ({ db: {}, pool: {} }));

vi.mock("../storage", async () => {
  // assetPrefix / assetSeqOf REAIS — são o objeto do teste.
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, broadcast: vi.fn() };
});

import { backfillInventoryAssets } from "../services/inventoryLifecycle";

function peca(over: Partial<any> = {}) {
  return {
    id: "mae-1",
    displayId: "#0062",
    eventId: "ev-1",
    type: "Pórtico 6x3",
    description: "Entrada principal",
    status: "delivered",
    quantity: 10,
    quantityProduced: 10,
    parentItemId: null,
    approvalThumbUrl: "/objects/thumb.png",
    ...over,
  };
}

const filho = (over: Partial<any> = {}) => peca({
  id: "filho-1", displayId: "#0062-C1", parentItemId: "mae-1",
  quantity: 4, quantityProduced: 4, status: "produced", ...over,
});

let ativos: Record<string, any[]>;
let criados: any[][];

beforeEach(() => {
  ativos = {};
  criados = [];

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];

  s.getAllItems = vi.fn(async () => []);
  s.getAssetsByOriginalItemId = vi.fn(async (id: string) => ativos[id] ?? []);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "COPA NORTE 2026", franchise: "Norte Nordeste" }));
  s.getItemSponsors = vi.fn(async () => []);
  s.createInventoryAssets = vi.fn(async (rs: any[]) => { criados.push(rs); return rs.map((r, i) => ({ id: `at-${i}`, ...r })); });

  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const idsCriados = () => criados.flat().map((a) => a.displayId);

// ═════════════════════════════════════════════════════════════════════════════
describe("backfillInventoryAssets — o complemento no boot", () => {
  it("complemento produzido sem ativo nenhum vira #EST-0062C1-1..4", async () => {
    H.storage.getAllItems = vi.fn(async () => [filho()]);
    await backfillInventoryAssets();
    expect(idsCriados()).toEqual(["#EST-0062C1-1", "#EST-0062C1-2", "#EST-0062C1-3", "#EST-0062C1-4"]);
  });

  it("peça normal continua #EST-0062-N — o acervo antigo não muda de padrão", async () => {
    H.storage.getAllItems = vi.fn(async () => [peca({ quantityProduced: 3 })]);
    await backfillInventoryAssets();
    expect(idsCriados()).toEqual(["#EST-0062-1", "#EST-0062-2", "#EST-0062-3"]);
  });

  it("o bloco do complemento não invade o da peça #0621", async () => {
    H.storage.getAllItems = vi.fn(async () => [
      filho({ quantityProduced: 2 }),
      peca({ id: "p621", displayId: "#0621", quantity: 2, quantityProduced: 2 }),
    ]);
    await backfillInventoryAssets();
    expect(idsCriados()).toEqual(["#EST-0062C1-1", "#EST-0062C1-2", "#EST-0621-1", "#EST-0621-2"]);
    expect(new Set(idsCriados()).size).toBe(4); // nenhum id repetido
  });

  it("é idempotente: com o bloco completo, o boot não cria nada", async () => {
    H.storage.getAllItems = vi.fn(async () => [filho()]);
    ativos["filho-1"] = Array.from({ length: 4 }, (_, i) => ({ displayId: `#EST-0062C1-${i + 1}` }));
    await backfillInventoryAssets();
    expect(H.storage.createInventoryAssets).not.toHaveBeenCalled();
  });

  it("bloco parcial completa a partir do MAIOR sufixo, mesmo com um ativo excluído no meio", async () => {
    H.storage.getAllItems = vi.fn(async () => [filho({ quantityProduced: 4 })]);
    ativos["filho-1"] = [{ displayId: "#EST-0062C1-1" }, { displayId: "#EST-0062C1-3" }];
    await backfillInventoryAssets();
    // Faltam 2. Por CONTAGEM sairiam -3 e -4, e o -3 já existe → 23505 no boot.
    expect(idsCriados()).toEqual(["#EST-0062C1-4", "#EST-0062C1-5"]);
  });

  it("complemento ainda não produzido fica de fora (ativo só existe com peça impressa)", async () => {
    H.storage.getAllItems = vi.fn(async () => [
      filho({ status: "ready_for_production", quantityProduced: null }),
      filho({ id: "filho-2", displayId: "#0062-C2", status: "inProduction", quantityProduced: 0 }),
    ]);
    await backfillInventoryAssets();
    expect(H.storage.createInventoryAssets).not.toHaveBeenCalled();
  });

  it("o ativo do complemento aponta para o PRÓPRIO item, não para a mãe", async () => {
    H.storage.getAllItems = vi.fn(async () => [filho({ quantityProduced: 1 })]);
    await backfillInventoryAssets();
    expect(criados.flat()[0]).toMatchObject({ originalItemId: "filho-1", quantity: 1, trackingStatus: "NO_GALPAO" });
  });

  it("falha no meio do backfill não derruba o boot do servidor", async () => {
    H.storage.getAllItems = vi.fn(async () => { throw new Error("banco fora do ar"); });
    await expect(backfillInventoryAssets()).resolves.toBeUndefined();
  });
});
