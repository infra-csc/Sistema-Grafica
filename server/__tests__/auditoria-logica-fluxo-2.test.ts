// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE LÓGICA — FLUXO DA PEÇA, RODADA 2 (28/10): complemento, criação,
// clonagem, aprovação (reinicializar), Kit.
//
// Cada teste "ACHADO Hx" descreve o comportamento ESPERADO pela regra declarada
// e FALHA enquanto o bug existir. Rodam contra o Postgres de verdade (PGlite)
// com as rotas reais e as barreiras globais (app-com-banco.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste, type Usuario } from "./app-com-banco";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type Linha = Record<string, unknown>;

const KIT: Usuario = { id: "u-kit", nome: "Kátia Kit", papel: "solicitacao", kit: true };

describe.skipIf(!PGLITE_DISPONIVEL)("auditoria de lógica: fluxo da peça (rodada 2)", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-audit-fluxo2";
  const EV_ORIGEM = "ev-audit-fluxo2-origem";
  const MOTIVO = "Faltaram unidades no evento";

  const peca = async (id: string): Promise<Linha> =>
    (await banco.consultar<Linha>(`SELECT * FROM items WHERE id = $1`, [id]))[0];

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await banco.consultar(
      `INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ($1, $2, 'kit@teste.local', 'x', 'solicitacao', true)`,
      [KIT.id, KIT.nome],
    );
    await semearEvento(banco, EV, "EVENTO AUDITORIA FLUXO 2", 40);
    await semearEvento(banco, EV_ORIGEM, "EVENTO ORIGEM DO CLONE", 60);
    await banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao, criado_por_id) VALUES ('kit-ev2', $1, 'KIT', $2)`, [EV, KIT.id]);
    await banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao, criado_por_id) VALUES ('kit-orig', $1, 'KIT', $2)`, [EV_ORIGEM, KIT.id]);
    await banco.consultar(`INSERT INTO sponsors (id, name) VALUES ('sp-a', 'PATROCINADOR A')`);
    await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id) VALUES ($1, 'sp-a')`, [EV]);
    app = await montarApp();
  }, 180_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  // ── H1 ─────────────────────────────────────────────────────────────────────
  it("ACHADO H1: complemento de peça do KIT nasce fora do Kit — o próprio usuário do Kit não consegue cancelá-lo", async () => {
    await semearPeca(banco, { id: "h1", eventId: EV, displayId: "#H1", status: "delivered", quantity: 4,
      extra: { kit_remessa_id: "kit-ev2", criado_por_id: KIT.id, delivered_qty: 4, conferred_qty: 4, quantity_produced: 4 } });
    const criar = await app.chamar<Linha>(KIT, "POST", "/api/items/h1/complement", { quantity: 2, reason: MOTIVO });
    expect(criar.status, JSON.stringify(criar.corpo)).toBe(201);
    const filho = await peca(String(criar.corpo.id));
    // O Kit desfaz o próprio engano (janela de arrependimento do complemento).
    const desfazer = await app.chamar(KIT, "DELETE", `/api/items/${filho.id}/complement`);
    // A Solicitação da Arena só visualiza peça do Kit — vale para o complemento dela.
    expect({ kit: filho.kit_remessa_id, criador: filho.criado_por_id, desfazer: desfazer.status })
      .toEqual({ kit: "kit-ev2", criador: KIT.id, desfazer: 200 });
  });

  // ── H2 ─────────────────────────────────────────────────────────────────────
  it("ACHADO H2: initialize-sponsor-approvals (Arte) zera a aprovação de peça JÁ LIBERADA para a Gráfica", async () => {
    await semearPeca(banco, { id: "h2", eventId: EV, displayId: "#H2", status: "ready_for_production", quantity: 1 });
    await banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ('h2', 'sp-a')`);
    await banco.consultar(
      `INSERT INTO item_sponsor_approvals (item_id, sponsor_id, status, approved_by, approved_at) VALUES ('h2', 'sp-a', 'approved', 'Atila', now())`,
    );
    const r = await app.chamar(USUARIOS.arte, "POST", "/api/items/h2/initialize-sponsor-approvals");
    const linha = (await banco.consultar<Linha>(`SELECT status, approved_by FROM item_sponsor_approvals WHERE item_id = 'h2'`))[0];
    const depois = await peca("h2");
    // Abrir rodada nova só cabe onde a peça ainda vai para a Aprovação; aqui
    // ela segue liberada com um patrocinador "pendente" por baixo e a prova de
    // quem aprovou (approved_by/approved_at) apagada.
    expect({ http: r.status, linha: linha.status, aprovador: linha.approved_by, status: depois.status })
      .toEqual({ http: 409, linha: "approved", aprovador: "Atila", status: "ready_for_production" });
  });

  // ── H3 ─────────────────────────────────────────────────────────────────────
  it("ACHADO H3: complemento de peça de PRODUÇÃO INTERNA sem arquivo chega à Gráfica sem arquivo E sem as instruções", async () => {
    const INSTRUCOES = "Cortar 3 placas de PS 2mm e aplicar o adesivo do estoque";
    await semearPeca(banco, { id: "h3", eventId: EV, displayId: "#H3", status: "delivered", quantity: 3,
      extra: { producao_interna: true, instrucoes_grafica: INSTRUCOES, skip_approval: true, final_file_url: null,
        approval_thumb_url: null, delivered_qty: 3, conferred_qty: 3, quantity_produced: 3 } });
    const r = await app.chamar<Linha>(USUARIOS.solicitacao, "POST", "/api/items/h3/complement", { quantity: 2, reason: MOTIVO });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const filho = await peca(String(r.corpo.id));
    expect({ status: filho.status, arquivo: filho.final_file_url, interna: filho.producao_interna, instrucoes: filho.instrucoes_grafica })
      .toEqual({ status: "ready_for_production", arquivo: null, interna: true, instrucoes: INSTRUCOES });
  });

  // ── H4 ─────────────────────────────────────────────────────────────────────
  it("ACHADO H4: cancelar o complemento NÃO solta a reserva de estoque dele (a exclusão normal solta)", async () => {
    await semearPeca(banco, { id: "h4", eventId: EV, displayId: "#H4", status: "delivered", quantity: 2,
      extra: { delivered_qty: 2, conferred_qty: 2, quantity_produced: 2 } });
    const criar = await app.chamar<Linha>(USUARIOS.solicitacao, "POST", "/api/items/h4/complement", { quantity: 1, reason: MOTIVO });
    expect(criar.status, JSON.stringify(criar.corpo)).toBe(201);
    const filhoId = String(criar.corpo.id);
    await banco.consultar(`INSERT INTO inventory_assets (id, display_id, name) VALUES ('ativo-h4', '#EST-H4-1', 'Pórtico 3x1')`);
    await banco.consultar(
      `INSERT INTO event_inventory_allocations (event_id, asset_id, item_id, reservado_por) VALUES ($1, 'ativo-h4', $2, 'Sofia')`,
      [EV, filhoId],
    );
    const r = await app.chamar(USUARIOS.solicitacao, "DELETE", `/api/items/${filhoId}/complement`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const reservas = await banco.consultar(`SELECT 1 FROM event_inventory_allocations WHERE item_id = $1`, [filhoId]);
    // excluirPecaParaALixeira: "reserva de peça morta não segura estoque".
    expect(reservas.length).toBe(0);
  });

  // ── H5 ─────────────────────────────────────────────────────────────────────
  it("ACHADO H5: a Solicitação clona tudo de um evento com Kit, mas a MESMA clonagem com seleção volta 403 inteira", async () => {
    await semearPeca(banco, { id: "h5-arena", eventId: EV_ORIGEM, displayId: "#H5A", status: "delivered", quantity: 1 });
    await semearPeca(banco, { id: "h5-kit", eventId: EV_ORIGEM, displayId: "#H5K", status: "delivered", quantity: 1,
      extra: { kit_remessa_id: "kit-orig", criado_por_id: KIT.id } });
    // Clonar é LER a origem e criar peça da Arena no destino — não escreve na peça do Kit.
    const tudo = await app.chamar<Linha>(USUARIOS.solicitacao, "POST", `/api/events/${EV}/clone-items`, { sourceEventId: EV_ORIGEM });
    const selecao = await app.chamar<Linha>(USUARIOS.solicitacao, "POST", `/api/events/${EV}/clone-items`,
      { sourceEventId: EV_ORIGEM, itemIds: ["h5-arena", "h5-kit"] });
    expect({ tudo: tudo.status, selecao: selecao.status }).toEqual({ tudo: 201, selecao: 201 });
  });

  // ── H6 ─────────────────────────────────────────────────────────────────────
  it("ACHADO H6: quantidade fracionada na criação passa pelo schema e estoura como 500", async () => {
    const r = await app.chamar(USUARIOS.solicitacao, "POST", "/api/items", {
      eventId: EV, type: "Pórtico", description: "Fração", quantity: 1.5, area: "3", visual: "3",
      material: "Lona", finish: "Ilhós", measurement: "3 × 1", calculatedM2: "3",
    });
    expect(r.status, JSON.stringify(r.corpo)).toBe(400);
  });
});
