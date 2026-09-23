// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO — A PEÇA DO RASCUNHO À ENTREGA, com as rotas reais contra um
// Postgres de verdade (PGlite, migrações aplicadas do zero).
//
// Os testes de rota com banco de mentira provam cada regra isolada; este prova
// que as rotas ENCADEIAM: o que uma grava é o que a próxima lê, com o SQL, as
// transações, os defaults e as restrições reais do schema. Se uma migração
// esquecer uma coluna ou uma rota gravar um status que a seguinte não aceita,
// é aqui que quebra.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste } from "./app-com-banco";

// A planilha (exceljs) não entra no caminho da peça; o pacote nem carrega sem
// o jszip, então as duas pontas dela ficam de fora — como nos testes de rota.
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

type Peca = { id: string; status: string; displayId: string; quantity: number; quantityProduced: number | null; conferredQty: number; embaladaQty: number; deliveredQty: number };

describe.skipIf(!PGLITE_DISPONIVEL)("integração: a peça do rascunho à entrega", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-integracao";
  const SP = "sp-integracao";

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await banco.consultar(
      `INSERT INTO events (id, name, start_date, truck_departure_date, created_by) VALUES ($1, 'COPA INTEGRAÇÃO', now() + interval '60 days', now() + interval '50 days', $2)`,
      [EV, USUARIOS.solicitacao.id],
    );
    await banco.consultar(`INSERT INTO sponsors (id, name) VALUES ($1, 'PATROCINADOR A')`, [SP]);
    await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id) VALUES ($1, $2)`, [EV, SP]);
    app = await montarApp();
  }, 120_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  const statusNoBanco = async (id: string) => (await banco.consultar<{ status: string }>(`SELECT status FROM items WHERE id = $1`, [id]))[0]?.status;

  it("cria, vincula, aprova, libera, imprime, confere, embala e entrega", async () => {
    const ok = <T,>(r: { status: number; corpo: T }, esperado = 200) => {
      expect(r.status, JSON.stringify(r.corpo)).toBe(esperado);
      return r.corpo;
    };

    // 1. A Solicitação cria a peça: nasce rascunho, com código e m² do servidor.
    const criada = ok(await app.chamar<Peca>(USUARIOS.solicitacao, "POST", "/api/items", {
      eventId: EV, type: "Pórtico", description: "Pórtico de largada", quantity: 2,
      area: "3.00", visual: "3.00", measurement: "3.00 × 1.00", calculatedM2: "6.00", fileWidth: "3.00", fileHeight: "1.00", material: "Lona", finish: "Ilhós",
    }), 201);
    const id = criada.id;
    expect(criada.status).toBe("draft");
    expect(criada.displayId).toBe("#0001");
    expect(await statusNoBanco(id)).toBe("draft");

    // 2. Envia a lista: rascunho → vinculação.
    ok(await app.chamar(USUARIOS.solicitacao, "POST", `/api/events/${EV}/items/submit`, {}));
    expect(await statusNoBanco(id)).toBe("awaiting_linking");

    // 3. Vincula o patrocinador e manda para a Arte.
    ok(await app.chamar(USUARIOS.atendimento, "POST", `/api/items/${id}/sponsors/sync`, { sponsorIds: [SP] }));
    expect(await banco.consultar(`SELECT sponsor_id FROM item_sponsors WHERE item_id = $1`, [id])).toEqual([{ sponsor_id: SP }]);
    ok(await app.chamar(USUARIOS.atendimento, "POST", "/api/items/send-to-arte", { itemIds: [id] }));
    expect(await statusNoBanco(id)).toBe("awaiting_submission");

    // 4. A Arte envia o thumb: com patrocinador vinculado, vai para a aprovação.
    ok(await app.chamar(USUARIOS.arte, "PATCH", `/api/items/${id}/submit-for-approval`, { approvalThumbUrl: "/objects/uploads/thumb-1.png" }));
    expect(await statusNoBanco(id)).toBe("awaiting_sponsor_approval");

    // 5. O Atendimento aprova pelo patrocinador.
    ok(await app.chamar(USUARIOS.atendimento, "PATCH", `/api/items/${id}/sponsor-approve`, {}));
    expect(await statusNoBanco(id)).toBe("sponsor_approved");

    // 6. A Arte manda o arquivo final → Revisão Final.
    ok(await app.chamar(USUARIOS.arte, "PATCH", `/api/items/${id}/submit-final-file`, { finalFileUrl: "/objects/uploads/final-1.pdf", finalFileName: "final-1.pdf" }));
    expect(await statusNoBanco(id)).toBe("awaiting_final_review");

    // 7. A Solicitação libera para a Gráfica.
    ok(await app.chamar(USUARIOS.solicitacao, "PATCH", `/api/items/${id}/creator-review`, {}));
    expect(await statusNoBanco(id)).toBe("ready_for_production");

    // 8. A Gráfica põe na Impressora 1 e informa as 2 impressas.
    ok(await app.chamar(USUARIOS.grafica, "PATCH", `/api/items/${id}/start-printing`, { printMachine: "1" }));
    expect(await statusNoBanco(id)).toBe("inProduction");
    ok(await app.chamar(USUARIOS.grafica, "PATCH", `/api/items/${id}/start-production`, { quantityProduced: 2 }));
    expect(await statusNoBanco(id)).toBe("produced");

    // 9. Confere com foto.
    ok(await app.chamar(USUARIOS.grafica, "POST", `/api/items/${id}/confer`, { conferencePhotoUrl: "/objects/uploads/conf-1.jpg" }));
    expect(await statusNoBanco(id)).toBe("conferred");

    // 10. Embala num tubo novo (com a foto) e entrega o tubo.
    const tubo = ok(await app.chamar<{ id: string; numero: number }>(USUARIOS.grafica, "POST", `/api/events/${EV}/tubos`, { itemIds: [id], fotos: ["/objects/uploads/tubo-1.jpg"] }), 201);
    expect(await statusNoBanco(id)).toBe("packed");
    const entrega = ok(await app.chamar<{ ok: boolean; entregues: number; unidades: number }>(USUARIOS.grafica, "POST", `/api/tubos/${tubo.id}/entregar`, { receivedBy: "Carlos do evento" }));
    expect(entrega).toMatchObject({ ok: true, entregues: 1, unidades: 2 });

    // O retrato final, lido do banco (não da resposta).
    const [final] = await banco.consultar<Record<string, unknown>>(
      `SELECT status, quantity, quantity_produced, conferred_qty, embalada_qty, delivered_qty FROM items WHERE id = $1`, [id]);
    expect(final).toEqual({ status: "delivered", quantity: 2, quantity_produced: 2, conferred_qty: 2, embalada_qty: 2, delivered_qty: 2 });
    // A trilha registrou cada passo, na ordem.
    const trilha = await banco.consultar<{ action: string }>(`SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at`, [id]);
    expect(trilha.length).toBeGreaterThanOrEqual(8);
    expect(trilha[0].action).toBe("created");
  });

  it("lote: três linhas viram três peças com códigos novos e distintos (a sequência é do banco)", async () => {
    const linha = { eventId: EV, type: "Faixa", description: "Faixa", quantity: 1, area: "2.00", visual: "2.00", measurement: "2.00 × 1.00", calculatedM2: "2.00", material: "Lona", finish: "Bainha" };
    const r = await app.chamar(USUARIOS.solicitacao, "POST", "/api/items/bulk", { items: [linha, { ...linha, quantity: 2 }, { ...linha, quantity: 3 }] });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const criadas = await banco.consultar<{ display_id: string; quantity: number; status: string }>(
      `SELECT display_id, quantity, status FROM items WHERE type = 'Faixa' ORDER BY display_id`);
    expect(criadas.map((c) => c.quantity).sort()).toEqual([1, 2, 3]);
    expect(new Set(criadas.map((c) => c.display_id)).size).toBe(3);
    expect(criadas.every((c) => c.status === "draft")).toBe(true);
  });

  it("cancelar grava motivo e status anterior; descancelar (admin) devolve a peça para onde estava", async () => {
    await semearPeca(banco, { id: "canc-1", eventId: EV, displayId: "#0901", status: "awaiting_submission", quantity: 1 });
    const c = await app.chamar(USUARIOS.solicitacao, "PATCH", "/api/items/canc-1/cancel", { notes: "Patrocinador desistiu da peça" });
    expect(c.status, JSON.stringify(c.corpo)).toBe(200);
    const [cancelada] = await banco.consultar<Record<string, unknown>>(`SELECT status, status_before_cancel, motivo_cancelamento FROM items WHERE id = 'canc-1'`);
    expect(cancelada).toMatchObject({ status: "canceled", status_before_cancel: "awaiting_submission" });
    expect(String(cancelada.motivo_cancelamento)).toContain("Patrocinador desistiu");
    // Só o admin descancela.
    expect((await app.chamar(USUARIOS.solicitacao, "PATCH", "/api/items/canc-1/uncancel", {})).status).toBe(403);
    const d = await app.chamar(USUARIOS.admin, "PATCH", "/api/items/canc-1/uncancel", {});
    expect(d.status, JSON.stringify(d.corpo)).toBe(200);
    expect(await statusNoBanco("canc-1")).toBe("awaiting_submission");
  });

  it("transferir leva a peça para outro evento, mantém o status e AVISA na trilha do patrocinador que não é de lá", async () => {
    await semearEvento(banco, "ev-destino", "COPA DESTINO", 90);
    await semearPeca(banco, { id: "transf-1", eventId: EV, displayId: "#0902", status: "awaiting_linking", quantity: 1 });
    await banco.consultar(`INSERT INTO item_sponsors (item_id, sponsor_id) VALUES ('transf-1', $1)`, [SP]);
    // Transferir é só do admin.
    const r = await app.chamar(USUARIOS.admin, "POST", "/api/items/transf-1/transfer-event", { eventId: "ev-destino" });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const [peca] = await banco.consultar<{ event_id: string; status: string }>(`SELECT event_id, status FROM items WHERE id = 'transf-1'`);
    expect(peca).toEqual({ event_id: "ev-destino", status: "awaiting_linking" });
    // O vínculo fica (quem decide é a vinculação); a trilha diz quem ficou de fora.
    expect(await banco.consultar(`SELECT 1 FROM item_sponsors WHERE item_id = 'transf-1'`)).toHaveLength(1);
    const [trilha] = await banco.consultar<{ details: string }>(`SELECT details FROM audit_logs WHERE entity_id = 'transf-1' ORDER BY created_at DESC LIMIT 1`);
    expect(trilha.details).toContain("Patrocinadores fora do evento de destino: PATROCINADOR A");
  });

  it("a Gráfica devolve para a Revisão a peça liberada que ainda não imprimiu (com motivo)", async () => {
    await semearPeca(banco, { id: "dev-1", eventId: EV, displayId: "#0903", status: "ready_for_production", quantity: 1 });
    const semMotivo = await app.chamar(USUARIOS.grafica, "PATCH", "/api/items/dev-1/return-to-review", { notes: "curto" });
    expect(semMotivo.status).toBe(400);
    const r = await app.chamar(USUARIOS.grafica, "PATCH", "/api/items/dev-1/return-to-review", { notes: "O arquivo final veio sem sangria" });
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(await statusNoBanco("dev-1")).toBe("awaiting_final_review");
  });

  it("excluir manda para a lixeira (deleted_at) e restaurar traz de volta", async () => {
    await semearPeca(banco, { id: "exc-1", eventId: EV, displayId: "#0904", status: "draft", quantity: 1 });
    const e = await app.chamar(USUARIOS.admin, "DELETE", "/api/items/exc-1");
    expect(e.status, JSON.stringify(e.corpo)).toBeLessThan(300);
    const [apagada] = await banco.consultar<{ deleted_at: Date | null }>(`SELECT deleted_at FROM items WHERE id = 'exc-1'`);
    expect(apagada.deleted_at).not.toBeNull();
    const r = await app.chamar(USUARIOS.admin, "POST", "/api/items/exc-1/restore", {});
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const [devolta] = await banco.consultar<{ deleted_at: Date | null }>(`SELECT deleted_at FROM items WHERE id = 'exc-1'`);
    expect(devolta.deleted_at).toBeNull();
  });

  it("evento arquivado: a conferência recusa com 409 e a peça não anda", async () => {
    await semearEvento(banco, "ev-arq", "COPA ARQUIVADA", 30);
    await semearPeca(banco, { id: "arq-1", eventId: "ev-arq", displayId: "#0905", status: "produced", quantity: 1, extra: { quantity_produced: 1 } });
    await banco.consultar(`UPDATE events SET arquivado_em = now() WHERE id = 'ev-arq'`);
    const r = await app.chamar<{ code?: string }>(USUARIOS.grafica, "POST", "/api/items/arq-1/confer", { conferencePhotoUrl: "/objects/uploads/c.jpg" });
    expect(r.status).toBe(409);
    expect(r.corpo.code).toBe("EVENT_FINALIZED");
    expect(await statusNoBanco("arq-1")).toBe("produced");
  });

  it("delta por updated_at: ?since traz só o que mudou depois, e a peça excluída vem em removidas", async () => {
    await semearPeca(banco, { id: "delta-velha", eventId: EV, displayId: "#0906", status: "draft", quantity: 1 });
    await semearPeca(banco, { id: "delta-mexida", eventId: EV, displayId: "#0907", status: "draft", quantity: 1 });
    await semearPeca(banco, { id: "delta-apagada", eventId: EV, displayId: "#0908", status: "draft", quantity: 1 });
    // Tudo "antigo": duas horas atrás.
    await banco.consultar(`UPDATE items SET updated_at = now() - interval '2 hours'`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Mexe numa (edição) e apaga outra — pelas rotas.
    const editada = await app.chamar(USUARIOS.solicitacao, "PATCH", "/api/items/delta-mexida", { description: "Descrição nova" });
    expect(editada.status, JSON.stringify(editada.corpo)).toBe(200);
    expect((await app.chamar(USUARIOS.admin, "DELETE", "/api/items/delta-apagada")).status).toBeLessThan(300);
    const r = await app.chamar<{ delta: boolean; itens: Array<{ id: string }>; removidas: string[] }>(
      USUARIOS.admin, "GET", `/api/items?since=${encodeURIComponent(since)}`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    expect(r.corpo.delta).toBe(true);
    expect(r.corpo.itens.map((i) => i.id)).toEqual(["delta-mexida"]);
    expect(r.corpo.removidas).toContain("delta-apagada");
    expect(r.corpo.removidas).not.toContain("delta-velha");
  });
});
