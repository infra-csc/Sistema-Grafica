// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE LÓGICA — FLUXO DA PEÇA E ROTAS DE ITENS (28/10).
//
// Cada teste "ACHADO Fx" descreve o comportamento ESPERADO pela regra declarada
// (máquina de estados, troca-de-material, permissões) e FALHA enquanto o bug
// existir. Rodam contra o Postgres de verdade (PGlite) com as rotas reais e as
// barreiras globais (app-com-banco.ts). Sem PGlite, o arquivo pula.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type Linha = Record<string, unknown>;

describe.skipIf(!PGLITE_DISPONIVEL)("auditoria de lógica: fluxo da peça", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-audit-fluxo";
  const MOTIVO = "Motivo com mais de dez caracteres";

  const peca = async (id: string): Promise<Linha> =>
    (await banco.consultar<Linha>(`SELECT * FROM items WHERE id = $1`, [id]))[0];

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await semearEvento(banco, EV, "EVENTO AUDITORIA FLUXO", 40);
    await banco.consultar(`INSERT INTO sponsors (id, name) VALUES ('sp-a', 'PATROCINADOR A'), ('sp-b', 'PATROCINADOR B')`);
    await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id) VALUES ($1, 'sp-a'), ($1, 'sp-b')`, [EV]);
    app = await montarApp();
  }, 180_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  // ── F1 ─────────────────────────────────────────────────────────────────────
  it("ACHADO F1a: PATCH genérico troca o thumb de peça JÁ LIBERADA para a Gráfica (update-thumb recusaria)", async () => {
    await semearPeca(banco, { id: "f1a", eventId: EV, displayId: "#F1A", status: "ready_for_production", quantity: 1 });
    const r = await app.chamar(USUARIOS.arte, "PATCH", "/api/items/f1a", { approvalThumbUrl: "/objects/uploads/thumb-trocado.png" });
    // regraDaTrocaDeThumb: "liberada em diante: não — a peça já é da Gráfica".
    expect(r.status, JSON.stringify(r.corpo)).toBe(409);
    expect((await peca("f1a")).approval_thumb_url).toBe("/objects/uploads/thumb.png");
  });

  it("ACHADO F1b: PATCH genérico troca o thumb APROVADO pelo patrocinador sem motivo, sem versão e sem reabrir o desaprovador estrito", async () => {
    await banco.consultar(`UPDATE sponsors SET strict_approval = true WHERE id = 'sp-a'`);
    await semearPeca(banco, { id: "f1b", eventId: EV, displayId: "#F1B", status: "sponsor_approved", quantity: 1 });
    await banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ('f1b', 'sp-a')`);
    await banco.consultar(`INSERT INTO item_sponsor_approvals (item_id, sponsor_id, status, approved_by, approved_at) VALUES ('f1b', 'sp-a', 'approved', 'Atila', now())`);
    const r = await app.chamar(USUARIOS.arte, "PATCH", "/api/items/f1b", { approvalThumbUrl: "/objects/uploads/thumb-nao-aprovado.png" });
    const depois = await peca("f1b");
    const versoes = await banco.consultar(`SELECT 1 FROM item_art_versions WHERE item_id = 'f1b'`);
    const linha = (await banco.consultar<Linha>(`SELECT status FROM item_sponsor_approvals WHERE item_id = 'f1b'`))[0];
    await banco.consultar(`UPDATE sponsors SET strict_approval = false WHERE id = 'sp-a'`);
    // O esperado (rota dedicada): sem motivo é 400; com motivo, versão gravada,
    // o estrito volta a "pending" e a peça volta para a Aprovação.
    expect({ http: r.status, thumb: depois.approval_thumb_url, versoes: versoes.length, linhaDoEstrito: linha.status, status: depois.status })
      .toEqual({ http: 400, thumb: "/objects/uploads/thumb.png", versoes: 0, linhaDoEstrito: "approved", status: "sponsor_approved" });
  });

  // ── F2 ─────────────────────────────────────────────────────────────────────
  it("ACHADO F2: 'Aprovar para todos' (sponsor-approve) aprova o patrocinador que REPROVOU e espera a versão nova da Arte", async () => {
    await semearPeca(banco, { id: "f2", eventId: EV, displayId: "#F2", status: "awaiting_sponsor_approval", quantity: 1 });
    await banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ('f2', 'sp-a'), ('f2', 'sp-b')`);
    await banco.consultar(
      `INSERT INTO item_sponsor_approvals (item_id, sponsor_id, status, rejected_by, rejected_at, rejection_reason)
       VALUES ('f2', 'sp-a', 'awaiting_arte', 'Atila', now(), 'Logo errado, refazer'), ('f2', 'sp-b', 'pending', null, null, null)`,
    );
    // A porta por patrocinador recusa (409 "Aguardando nova versão da Arte").
    const porLinha = await app.chamar(USUARIOS.atendimento, "POST", "/api/items/f2/sponsor-approvals/sp-a/approve");
    expect(porLinha.status).toBe(409);
    // O atalho da MESMA tela passa por cima.
    const atalho = await app.chamar(USUARIOS.atendimento, "PATCH", "/api/items/f2/sponsor-approve", {});
    const linhaA = (await banco.consultar<Linha>(`SELECT status FROM item_sponsor_approvals WHERE item_id = 'f2' AND sponsor_id = 'sp-a'`))[0];
    expect({ http: atalho.status, linhaA: linhaA.status, status: (await peca("f2")).status })
      .toEqual({ http: 409, linhaA: "awaiting_arte", status: "awaiting_sponsor_approval" });
  });

  // ── F3 ─────────────────────────────────────────────────────────────────────
  it("ACHADO F3: a Arte 'descancela' a peça pelo arte-reject (descancelar é só do admin)", async () => {
    await semearPeca(banco, { id: "f3", eventId: EV, displayId: "#F3", status: "canceled", quantity: 1,
      extra: { status_before_cancel: "ready_for_production", motivo_cancelamento: "Patrocinador saiu" } });
    // A régua: só admin descancela.
    const desc = await app.chamar(USUARIOS.arte, "PATCH", "/api/items/f3/uncancel", {});
    expect(desc.status).toBe(403);
    const r = await app.chamar(USUARIOS.arte, "PATCH", "/api/items/f3/arte-reject", { rejectionReason: MOTIVO });
    const depois = await peca("f3");
    expect({ http: r.status, status: depois.status }).toEqual({ http: 409, status: "canceled" });
  });

  // ── F4 ─────────────────────────────────────────────────────────────────────
  it("ACHADO F4a: a Revisão Final LIBERA para a Gráfica uma peça que está na LIXEIRA", async () => {
    await semearPeca(banco, { id: "f4a", eventId: EV, displayId: "#F4A", status: "awaiting_final_review", quantity: 1, extra: { deleted_at: new Date() } });
    const r = await app.chamar(USUARIOS.solicitacao, "PATCH", "/api/items/f4a/creator-review", {});
    expect({ http: r.status, status: (await peca("f4a")).status }).toEqual({ http: 404, status: "awaiting_final_review" });
  });

  it("ACHADO F4b: o Atendimento aprova e o PATCH genérico edita peça na LIXEIRA", async () => {
    await semearPeca(banco, { id: "f4b", eventId: EV, displayId: "#F4B", status: "awaiting_sponsor_approval", quantity: 2, extra: { deleted_at: new Date() } });
    const aprovar = await app.chamar(USUARIOS.atendimento, "PATCH", "/api/items/f4b/sponsor-approve", {});
    const editar = await app.chamar(USUARIOS.solicitacao, "PATCH", "/api/items/f4b", { quantity: 5 });
    const depois = await peca("f4b");
    expect({ aprovar: aprovar.status, editar: editar.status, status: depois.status, qtd: depois.quantity })
      .toEqual({ aprovar: 404, editar: 404, status: "awaiting_sponsor_approval", qtd: 2 });
  });

  // ── F5 ─────────────────────────────────────────────────────────────────────
  it("ACHADO F5: o Atendimento reduz a quantidade de peça EM IMPRESSÃO pelo PATCH genérico e a promove a Produzida", async () => {
    await semearPeca(banco, { id: "f5", eventId: EV, displayId: "#F5", status: "inProduction", quantity: 10,
      extra: { quantity_produced: 6, print_machine: "2" } });
    const r = await app.chamar(USUARIOS.atendimento, "PATCH", "/api/items/f5", { quantity: 6 });
    const depois = await peca("f5");
    // O gate declara Atendimento como "edições pontuais (vinculação)" — não o
    // contrato da peça na Gráfica.
    expect({ http: r.status, status: depois.status, qtd: depois.quantity }).toEqual({ http: 403, status: "inProduction", qtd: 10 });
  });

  // ── F6 ─────────────────────────────────────────────────────────────────────
  it("ACHADO F6: arte-reject de peça EM IMPRESSÃO a manda ao rascunho ainda com impressora e trava da Gráfica", async () => {
    await semearPeca(banco, { id: "f6", eventId: EV, displayId: "#F6", status: "inProduction", quantity: 4,
      extra: { print_machine: "3", maquina_prevista: "3", travada_em: new Date(), travada_por: "Sofia", travada_motivo: "Arte vai mudar" } });
    const r = await app.chamar(USUARIOS.arte, "PATCH", "/api/items/f6/arte-reject", { rejectionReason: MOTIVO });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const depois = await peca("f6");
    // return-to-review / return-to-arte limpam: "a trava só vale na Gráfica — saiu de lá, cai".
    expect({ status: depois.status, printMachine: depois.print_machine, maquinaPrevista: depois.maquina_prevista, travada: depois.travada_em !== null })
      .toEqual({ status: "draft", printMachine: null, maquinaPrevista: null, travada: false });
  });
});
