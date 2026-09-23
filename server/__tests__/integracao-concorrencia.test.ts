// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO — DUAS PESSOAS NO MESMO SEGUNDO, contra um Postgres de verdade
// (PGlite, migrações do zero, rotas reais, duas conexões do Pool do app).
//
// As rotas de impressas, impressora e reserva de estoque leem e regravam a
// peça dentro de uma transação com `SELECT … FOR UPDATE` (e trava de
// impressora por advisory lock). Aqui duas requisições saem JUNTAS
// (Promise.all), cada uma pela sua conexão. O banco local executa uma
// transação por vez (ver o cabeçalho de banco-pglite.ts): o que se prova é que
// a SEGUNDA, ao reler a linha já gravada pela primeira, recusa ou soma — e
// nunca sobrescreve às cegas. A ordem entre as duas não importa: os testes
// conferem "uma venceu e a outra recebeu o 409 certo", seja qual for.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste, type Resposta } from "./app-com-banco";

// A planilha (exceljs) não entra aqui; o pacote nem carrega sem o jszip.
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type Erro = { error?: string; code?: string };

/** Uma deu `ok` e a outra `recusa` — em qualquer ordem. Devolve a recusada. */
function umaVenceuOutraRecusou(rs: Resposta<Erro>[], ok: number, recusa: number): Resposta<Erro> {
  const status = rs.map((r) => r.status).sort();
  expect(status, JSON.stringify(rs.map((r) => r.corpo))).toEqual([ok, recusa].sort());
  return rs.find((r) => r.status === recusa)!;
}

describe.skipIf(!PGLITE_DISPONIVEL)("integração: concorrência com duas conexões", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-conc";

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await semearEvento(banco, EV, "COPA CONCORRÊNCIA", 60);
    app = await montarApp();
  }, 120_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  const linha = async (id: string) =>
    (await banco.consultar<{ status: string; quantity_produced: number | null; print_machine: string | null }>(
      `SELECT status, quantity_produced, print_machine FROM items WHERE id = $1`, [id]))[0];

  it("impressas: dois lançamentos lidos da mesma foto — o segundo leva PRODUCTION_CONFLICT e nada se perde", async () => {
    await semearPeca(banco, { id: "imp-1", eventId: EV, displayId: "#0101", status: "inProduction", quantity: 10, extra: { print_machine: "1", quantity_produced: 0 } });
    // Os dois operadores leram "0 impressas" e lançam 3 e 4.
    const rs = await Promise.all([
      app.chamar<Erro>(USUARIOS.grafica, "PATCH", "/api/items/imp-1/start-production", { quantityProduced: 3, expectedProduced: 0 }),
      app.chamar<Erro>(USUARIOS.grafica2, "PATCH", "/api/items/imp-1/start-production", { quantityProduced: 4, expectedProduced: 0 }),
    ]);
    const recusada = umaVenceuOutraRecusou(rs, 200, 409);
    expect(recusada.corpo.code).toBe("PRODUCTION_CONFLICT");
    // O banco guarda o lançamento de quem venceu — nem somado às cegas, nem sobrescrito.
    const vencedora = rs.find((r) => r.status === 200)!;
    const [pedido] = [rs[0] === vencedora ? 3 : 4];
    expect((await linha("imp-1")).quantity_produced).toBe(pedido);
    // E a trilha tem UM lançamento, não dois.
    const trilha = await banco.consultar(`SELECT details FROM audit_logs WHERE entity_id = 'imp-1' AND action IN ('production','produced')`);
    expect(trilha).toHaveLength(1);
  });

  it("impressas: dois lançamentos em série do mesmo operador somam sobre o gravado (sem regressão)", async () => {
    await semearPeca(banco, { id: "imp-2", eventId: EV, displayId: "#0102", status: "inProduction", quantity: 5, extra: { print_machine: "2", quantity_produced: 0 } });
    const a = await app.chamar(USUARIOS.grafica, "PATCH", "/api/items/imp-2/start-production", { quantityProduced: 2, expectedProduced: 0 });
    expect(a.status, JSON.stringify(a.corpo)).toBe(200);
    // Quem leu "2" lança o total 5: fecha a peça.
    const b = await app.chamar(USUARIOS.grafica2, "PATCH", "/api/items/imp-2/start-production", { quantityProduced: 5, expectedProduced: 2 });
    expect(b.status, JSON.stringify(b.corpo)).toBe(200);
    expect(await linha("imp-2")).toMatchObject({ status: "produced", quantity_produced: 5 });
  });

  it("impressora: duas peças para a MESMA impressora no mesmo instante — uma entra, a outra leva PRINTER_BUSY", async () => {
    await semearPeca(banco, { id: "fila-1", eventId: EV, displayId: "#0201", status: "ready_for_production", quantity: 3 });
    await semearPeca(banco, { id: "fila-2", eventId: EV, displayId: "#0202", status: "ready_for_production", quantity: 3 });
    const rs = await Promise.all([
      app.chamar<Erro>(USUARIOS.grafica, "PATCH", "/api/items/fila-1/start-printing", { printMachine: "3" }),
      app.chamar<Erro>(USUARIOS.grafica2, "PATCH", "/api/items/fila-2/start-printing", { printMachine: "3" }),
    ]);
    const recusada = umaVenceuOutraRecusou(rs, 200, 409);
    expect(recusada.corpo.code).toBe("PRINTER_BUSY");
    const naMaquina = await banco.consultar<{ id: string }>(`SELECT id FROM items WHERE print_machine = '3' AND status = 'inProduction'`);
    expect(naMaquina).toHaveLength(1);
    // A perdedora continua na fila, intacta.
    const perdedora = rs[0] === recusada ? "fila-1" : "fila-2";
    expect(await linha(perdedora)).toMatchObject({ status: "ready_for_production", print_machine: null });
  });

  describe("reserva de estoque", () => {
    // Reservar do estoque é do admin (requireRole("admin") na rota).
    const ORIGEM = "ev-origem";
    beforeAll(async () => {
      // Um evento que já passou, com uma peça igual (Pórtico 3 × 1) que virou
      // DUAS unidades de estoque no galpão.
      await semearEvento(banco, ORIGEM, "COPA PASSADA", -40);
      await semearPeca(banco, { id: "origem-1", eventId: ORIGEM, displayId: "#0301", status: "delivered", quantity: 2 });
      for (const n of [1, 2]) {
        await banco.consultar(
          `INSERT INTO inventory_assets (id, original_item_id, display_id, name, quantity) VALUES ($1, 'origem-1', $2, 'Pórtico', 1)`,
          [`ativo-${n}`, `#EST-0301-${n}`],
        );
      }
    });

    it("duas peças disputam o MESMO ativo — uma reserva, a outra recebe 409 e não fica reserva dupla", async () => {
      await semearPeca(banco, { id: "res-a", eventId: EV, displayId: "#0401", status: "awaiting_submission", quantity: 1 });
      await semearPeca(banco, { id: "res-b", eventId: EV, displayId: "#0402", status: "awaiting_submission", quantity: 1 });
      const rs = await Promise.all([
        app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/res-a/reservas", { assetIds: ["ativo-1"] }),
        app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/res-b/reservas", { assetIds: ["ativo-1"] }),
      ]);
      const recusada = umaVenceuOutraRecusou(rs, 201, 409);
      expect(recusada.corpo.error).toMatch(/Reservada para COPA CONCORRÊNCIA/);
      expect(await banco.consultar(`SELECT item_id FROM event_inventory_allocations WHERE asset_id = 'ativo-1'`)).toHaveLength(1);
    });

    it("a mesma peça (1 un.) pede dois ativos ao mesmo tempo — só um cabe", async () => {
      await semearPeca(banco, { id: "res-c", eventId: EV, displayId: "#0403", status: "awaiting_submission", quantity: 1 });
      // Solta o ativo-1 do teste anterior para os dois estarem livres.
      await banco.consultar(`DELETE FROM event_inventory_allocations`);
      const rs = await Promise.all([
        app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/res-c/reservas", { assetIds: ["ativo-1"] }),
        app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/res-c/reservas", { assetIds: ["ativo-2"] }),
      ]);
      const recusada = umaVenceuOutraRecusou(rs, 201, 409);
      expect(recusada.corpo.error).toContain("A peça tem 1 un. e já há 1 reservada(s)");
      expect(await banco.consultar(`SELECT asset_id FROM event_inventory_allocations WHERE item_id = 'res-c'`)).toHaveLength(1);
    });
  });
});
