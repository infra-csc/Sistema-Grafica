// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE LÓGICA — GRÁFICA E ESTOQUE (logic-auditor, 28/10).
//
// Cada `it` prova UM achado contra o app de verdade (rotas reais + Postgres
// PGlite, migrações do zero). Os testes descrevem o comportamento ESPERADO:
// enquanto o achado existir, ficam VERMELHOS — é o objetivo. Quando a correção
// entrar, ficam verdes e passam a guardar a regra.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";

import { criarBanco } from "./regras-estoque-banco-de-mentira";

// O CICLO DO ESTOQUE (storage.markAssets*) consulta o banco por OUTRA conexão
// com a transação aberta — no PGlite (uma sessão só) isso trava (ver o
// cabeçalho de banco-pglite.ts). Para os achados do ciclo, `../db` vira uma
// PONTE: com H.mentira ligado, o storage de verdade roda sobre o banco de
// mentira que avalia o WHERE (regras-estoque-banco-de-mentira.ts); desligado,
// é o db real do PGlite.
const H = vi.hoisted(() => ({ mentira: null as null | { db: Record<string | symbol, unknown> } }));
vi.mock("../db", async () => {
  const real = await vi.importActual<Record<string, any>>("../db");
  const ponte = (alvo: () => any) => new Proxy({}, {
    get: (_t, k) => { const o = alvo(); const v = o[k]; return typeof v === "function" ? v.bind(o) : v; },
  });
  return { ...real, db: ponte(() => H.mentira?.db ?? real.db), pool: ponte(() => real.pool) };
});

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type Erro = { error?: string; code?: string };
const FOTO = "/objects/uploads/conferencia.jpg";

describe.skipIf(!PGLITE_DISPONIVEL)("auditoria de lógica — Gráfica e estoque", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-aud";          // evento aberto (daqui a 60 dias)
  const EV_PASSADO = "ev-pas";  // começou há 5 dias; caminhão saiu há 10
  const EV_FUTURO = "ev-fut";   // começa daqui a 3 dias; caminhão saiu há 2

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await semearEvento(banco, EV, "COPA AUDITORIA", 60);
    await semearEvento(banco, EV_PASSADO, "CORRIDA QUE JÁ FOI", -5);
    await semearEvento(banco, EV_FUTURO, "CORRIDA DA SEMANA", 3);
    app = await montarApp();
  }, 180_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  const peca = async (id: string) =>
    (await banco.consultar<{ status: string; quantity: number; quantity_produced: number | null; reuse_qty: number | null; conferred_qty: number; print_machine: string | null }>(
      `SELECT status, quantity, quantity_produced, reuse_qty, conferred_qty, print_machine FROM items WHERE id = $1`, [id]))[0];
  const ativo = async (id: string) =>
    (await banco.consultar<{ tracking_status: string }>(`SELECT tracking_status FROM inventory_assets WHERE id = $1`, [id]))[0]?.tracking_status;
  const semearAtivo = (id: string, situacao: string, origem: string | null) =>
    banco.consultar(
      `INSERT INTO inventory_assets (id, display_id, name, quantity, original_item_id, tracking_status) VALUES ($1, $2, 'Pórtico', 1, $3, $4)`,
      [id, `#EST-${id}`, origem, situacao],
    );
  const semearAlocacao = (id: string, eventId: string, assetId: string, itemId: string | null, diasAtras = 0) =>
    banco.consultar(
      `INSERT INTO event_inventory_allocations (id, event_id, asset_id, item_id, allocated_at) VALUES ($1, $2, $3, $4, now() - make_interval(days => $5))`,
      [id, eventId, assetId, itemId, diasAtras],
    );

  // ── P2 ────────────────────────────────────────────────────────────────────
  it("ACHADO G1: informar impressas não pode REDUZIR o total abaixo do que já foi conferido", async () => {
    await semearPeca(banco, { id: "g1", eventId: EV, displayId: "#G001", status: "inProduction", quantity: 10, extra: { print_machine: "1", quantity_produced: 8 } });
    // CONFERIR_PARCIAL: as 8 que saíram são conferidas com a peça ainda na máquina.
    const conf = await app.chamar(USUARIOS.grafica, "POST", "/api/items/g1/confer", { conferencePhotoUrl: FOTO, qty: 8 });
    expect(conf.status, JSON.stringify(conf.corpo)).toBe(200);
    // O operador digita 3 (o campo é ABSOLUTO): o total cai de 8 para 3.
    const r = await app.chamar<Erro>(USUARIOS.grafica, "PATCH", "/api/items/g1/start-production", { quantityProduced: 3, expectedProduced: 8 });
    const depois = await peca("g1");
    // A conta protegida (shared/embalagem.ts): conferidas ≤ produzidas + reuso.
    expect(depois.conferred_qty, `status ${r.status}: conferidas ${depois.conferred_qty} > impressas ${depois.quantity_produced}`)
      .toBeLessThanOrEqual((depois.quantity_produced ?? 0) + (depois.reuse_qty ?? 0));
    expect(r.status).toBe(409);
  });

  it("ACHADO G2a: corrigir reaproveitamento (admin) não pode tirar peça CANCELADA do cancelamento", async () => {
    await semearPeca(banco, { id: "g2a", eventId: EV, displayId: "#G002", status: "canceled", quantity: 10, extra: { reuse_qty: 3, status_before_cancel: "ready_for_production" } });
    await semearPeca(banco, { id: "g2b", eventId: EV, displayId: "#G003", status: "canceled", quantity: 10, extra: { reuse_qty: 3, status_before_cancel: "ready_for_production" } });
    const paraAFila = await app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/g2a/correct-reuse", { correctedReuseQty: 1 });
    const total = await app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/g2b/correct-reuse", { correctedReuseQty: 10 });
    // O caminho de volta do cancelamento é o "descancelar" (com as guardas dele).
    expect([(await peca("g2a")).status, (await peca("g2b")).status], `respostas ${paraAFila.status}/${total.status}`).toEqual(["canceled", "canceled"]);
    expect([paraAFila.status, total.status]).toEqual([409, 409]);
  });

  it("ACHADO G2b: corrigir reaproveitamento (admin) não pode pular a Arte e a Revisão Final", async () => {
    // Liberada com 3 reaproveitadas, devolvida pela Gráfica à Revisão e pela
    // Solicitação à Arte: o reuse_qty viaja junto (camposDaDevolucaoDaRevisao não zera).
    await semearPeca(banco, { id: "g2c", eventId: EV, displayId: "#G004", status: "awaiting_finalization", quantity: 10, extra: { reuse_qty: 3 } });
    const r = await app.chamar<Erro>(USUARIOS.admin, "POST", "/api/items/g2c/correct-reuse", { correctedReuseQty: 2 });
    expect((await peca("g2c")).status, `status ${r.status}`).toBe("awaiting_finalization");
    expect(r.status).toBe(409);
  });

  // ── O ciclo do estoque, sobre o banco de mentira (ver a PONTE no topo) ───
  const dias = (n: number) => new Date(Date.now() + n * 864e5);
  const evM = (id: string, inicio: number, saida: number) => ({ id, name: id.toUpperCase(), startDate: dias(inicio), truckDepartureDate: dias(saida), arquivadoEm: null });
  const pecaM = (id: string, eventId: string, status = "produced") => ({ id, displayId: `#${id}`, eventId, type: "Pórtico", quantity: 1, status, deletedAt: null });
  const ativoM = (id: string, origem: string | null, over: Record<string, unknown>) => ({
    id, displayId: `#EST-${id}`, name: "Pórtico", trackingStatus: "NO_GALPAO", condition: "PERFEITO", quantity: 1, sponsorIds: [],
    approvalThumbUrl: null, originalItemId: origem, location: null, notes: null, ...over,
  });
  async function noBancoDeMentira<T>(mundo: Record<string, unknown[]>, fazer: (b: ReturnType<typeof criarBanco>) => Promise<T>): Promise<T> {
    const b = criarBanco({ events: [], items: [], inventory_assets: [], event_inventory_allocations: [], item_sponsors: [], audit_logs: [], ...mundo } as never);
    H.mentira = b as never;
    try { return await fazer(b); } finally { H.mentira = null; }
  }

  it("ACHADO G3: ativo criado DEPOIS da saída do caminhão, já triado, não volta para a triagem a cada hora", async () => {
    const { storage } = await import("../storage");
    // Evento realizado há 5 dias (caminhão saiu há 10). A peça foi impressa
    // DEPOIS da saída (complemento / impressas no evento realizado): o ativo
    // nasceu há 1 dia — e a triagem acabou de devolvê-lo ao galpão (agora).
    const fim = await noBancoDeMentira({
      events: [evM("pas", -5, -10)],
      items: [pecaM("p-g3", "pas")],
      inventory_assets: [
        ativoM("a-g3", "p-g3", { trackingStatus: "NO_GALPAO", createdAt: dias(-1), updatedAt: dias(0) }),
        // Controle: o irmão nascido ANTES da saída, triado agora — fica no galpão.
        ativoM("a-g3-ctrl", "p-g3", { trackingStatus: "NO_GALPAO", createdAt: dias(-60), updatedAt: dias(0) }),
      ],
    }, async (b) => {
      // A hora seguinte do ciclo (runInventoryCron → transicionarAtivosDoEvento):
      // o evento segue na janela de 45 dias, as duas transições rodam de novo.
      await storage.markAssetsInUseForEvent("pas", dias(-10));
      await storage.markAssetsAwaitingTriageForEvent("pas");
      return (b.mundo.inventory_assets as Array<{ trackingStatus: string }>).map((a) => a.trackingStatus);
    });
    // jaSaiu = updatedAt < saída OU createdAt ≥ saída — o 2º ramo vale PARA SEMPRE.
    expect(fim, "[nascido depois da saída, controle] — a peça triada voltou para Aguardando triagem").toEqual(["NO_GALPAO", "NO_GALPAO"]);
  });

  it("ACHADO G4: a volta de um evento antigo não puxa para a triagem a peça que está agora em OUTRO evento", async () => {
    const { storage } = await import("../storage");
    const fim = await noBancoDeMentira({
      // "pas" foi há 5 dias; "fut" começa em 3 e o caminhão já saiu.
      events: [evM("pas", -5, -10), evM("fut", 3, -1)],
      items: [pecaM("pa", "pas"), pecaM("pb", "fut", "ready_for_production")],
      // A peça do estoque foi usada em "pas" (a alocação fica como registro do
      // uso), foi triada e agora está reservada e NO CAMINHÃO de "fut".
      inventory_assets: [ativoM("a-g4", null, { trackingStatus: "EM_USO", createdAt: dias(-90), updatedAt: dias(-1) })],
      event_inventory_allocations: [
        { id: "al-velha", eventId: "pas", assetId: "a-g4", itemId: "pa", allocatedAt: dias(-20) },
        { id: "al-nova", eventId: "fut", assetId: "a-g4", itemId: "pb", allocatedAt: dias(-2) },
      ],
    }, async (b) => {
      await storage.markAssetsAwaitingTriageForEvent("pas"); // o cron de hora em hora de "pas"
      return (b.mundo.inventory_assets[0] as { trackingStatus: string }).trackingStatus;
    });
    // O ramo das peças da PRÓPRIA origem respeita a reserva de outro evento
    // (foraDeReservaDeOutroEvento); o ramo das ALOCAÇÕES (r2) não.
    expect(fim, "está no caminhão de outro evento").toBe("EM_USO");
  });

  it("ACHADO G5: DELETE /api/allocations/:id ignora a guarda da reserva e ressuscita/tira do caminhão", async () => {
    await semearPeca(banco, { id: "g5", eventId: EV_FUTURO, displayId: "#G008", status: "ready_for_production", quantity: 2 });
    await semearAtivo("a-g5", "EM_USO", null);
    await semearAlocacao("al-g5", EV_FUTURO, "a-g5", "g5", 1);
    // A rota da reserva recusa: o caminhão saiu, a reserva virou uso.
    const pelaReserva = await app.chamar<Erro>(USUARIOS.admin, "DELETE", "/api/items/g5/reservas/al-g5");
    expect(pelaReserva.status, JSON.stringify(pelaReserva.corpo)).toBe(409);
    // A rota genérica apaga a MESMA linha e manda a peça para o galpão.
    const pelaAlocacao = await app.chamar<Erro>(USUARIOS.admin, "DELETE", "/api/allocations/al-g5");
    expect(await ativo("a-g5"), `DELETE /api/allocations → ${pelaAlocacao.status}`).toBe("EM_USO");
    expect(pelaAlocacao.status).toBe(409);
  });

  it("ACHADO G6: POST /api/events/:id/allocations aloca peça DESCARTADA e a põe em uso", async () => {
    await semearAtivo("a-g6", "DESCARTADO", null);
    const r = await app.chamar<Erro>(USUARIOS.admin, "POST", `/api/events/${EV}/allocations`, { assetId: "a-g6" });
    expect(await ativo("a-g6"), `status ${r.status}`).toBe("DESCARTADO");
    expect(r.status).toBe(409);
  });

  // ── P3 ────────────────────────────────────────────────────────────────────
  it("ACHADO G7: informar impressas na peça antiga sem impressora não pode ocupar impressora já ocupada", async () => {
    await semearPeca(banco, { id: "g7-dona", eventId: EV, displayId: "#G009", status: "inProduction", quantity: 10, extra: { print_machine: "3", quantity_produced: 0 } });
    await semearPeca(banco, { id: "g7-antiga", eventId: EV, displayId: "#G010", status: "inProduction", quantity: 10, extra: { print_machine: null, quantity_produced: 0 } });
    const r = await app.chamar<Erro>(USUARIOS.grafica, "PATCH", "/api/items/g7-antiga/start-production", { quantityProduced: 2, printMachine: "3" });
    const ocupantes = await banco.consultar<{ id: string }>(
      `SELECT id FROM items WHERE status = 'inProduction' AND print_machine = '3' AND coalesce(quantity_produced, 0) < quantity`);
    // "Uma peça por vez por impressora": a 3 já é da g7-dona.
    expect(ocupantes.map((o) => o.id).sort(), `status ${r.status}`).toEqual(["g7-dona"]);
  });

  it("ACHADO G8: quantidade fracionária no corrigir reaproveitamento é 400, não 500", async () => {
    await semearPeca(banco, { id: "g8", eventId: EV, displayId: "#G011", status: "produced", quantity: 10, extra: { reuse_qty: 3, quantity_produced: 7 } });
    const r = await app.chamar<Erro>(USUARIOS.grafica, "POST", "/api/items/g8/correct-reuse", { correctedReuseQty: 2.5 });
    expect(r.status, JSON.stringify(r.corpo)).toBe(400);
  });

  it("ACHADO G9 (decisão): a Gráfica confere o reaproveitado de peça que voltou para a Arte", async () => {
    await semearPeca(banco, { id: "g9", eventId: EV, displayId: "#G012", status: "awaiting_finalization", quantity: 10, extra: { reuse_qty: 3 } });
    const r = await app.chamar<Erro>(USUARIOS.grafica, "POST", "/api/items/g9/confer", { conferencePhotoUrl: FOTO });
    // Esperado (recomendação): só confere depois da liberação, como na Revisão.
    expect((await peca("g9")).conferred_qty, `status ${r.status}`).toBe(0);
    expect(r.status).toBe(409);
  });
});
