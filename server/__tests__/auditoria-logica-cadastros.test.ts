// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE LÓGICA (28/10, rodada 2) — cadastros: cotas e vínculo
// automático, vínculo peça a peça, planilha (confirmar a importação), trilha e
// Versões. Cada `it` "ACHADO Cx: ..." PROVA um achado: o teste descreve o
// comportamento ESPERADO e fica VERMELHO enquanto o defeito existir.
//
// Integração real (PGlite + rotas de produção). Sem o PGlite, o arquivo PULA.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste, type Usuario } from "./app-com-banco";
import { capturarRotas } from "./rotas-de-mentira";

// O exceljs de verdade não entra (a mesma nota de fechamento-do-evento.test.ts):
// um Workbook de mentira guarda o que a planilha RECEBE; o resto de
// xlsxExport (writeWorkbook) é o de produção.
const PLANILHAS = vi.hoisted(() => [] as any[]);
vi.mock("exceljs", () => {
  class Cell { value: any = null; font: any; fill: any; alignment: any; border: any; numFmt: any; }
  class Row {
    cells = new Map<number, Cell>(); height = 0;
    getCell(i: number) { let c = this.cells.get(i); if (!c) { c = new Cell(); this.cells.set(i, c); } return c; }
    eachCell(_o: any, fn: (c: Cell, i: number) => void) { for (const [i, c] of Array.from(this.cells)) fn(c, i); }
  }
  class Sheet {
    columns: { key: string }[] = []; rows: Row[] = []; views: any; autoFilter: any;
    constructor(public name: string) {}
    getRow(n: number) { while (this.rows.length < n) this.rows.push(new Row()); return this.rows[n - 1]; }
    getCell(ref: string) { return this.getRow(Number(ref.slice(1))).getCell(ref.charCodeAt(0) - 64); }
    mergeCells() {}
    addRow(obj: Record<string, any>) { const r = this.getRow(this.rows.length + 1); this.columns.forEach((c, i) => { if (obj[c.key] !== undefined) r.getCell(i + 1).value = obj[c.key]; }); return r; }
  }
  class Workbook {
    creator = ""; created: any; worksheets: Sheet[] = []; xlsx = { write: async () => {} };
    constructor() { PLANILHAS.push(this); }
    addWorksheet(name: string) { const s = new Sheet(name); this.worksheets.push(s); return s; }
    getWorksheet(name: string) { return this.worksheets.find((w) => w.name === name); }
  }
  return { default: { Workbook } };
});
vi.mock("../services/xlsxExport", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn(),
}));

const KIT: Usuario = { id: "u-kit-c", nome: "Kátia Kit", papel: "solicitacao", kit: true };
const sessaoDe = (u: Usuario) => ({ userId: u.id, userName: u.nome, userRole: u.papel, userKit: u.kit === true });

describe.skipIf(!PGLITE_DISPONIVEL)("auditoria de lógica — cadastros (cotas, vínculos, planilha, trilha, versões)", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-cad";

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await banco.consultar(`INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ($1, $2, $3, 'x', 'solicitacao', true)`, [KIT.id, KIT.nome, "u-kit-c@teste.local"]);
    await semearEvento(banco, EV, "EVENTO DOS CADASTROS", 40);
    await banco.consultar(`INSERT INTO sponsors (id, name) VALUES ('sp-ouro', 'Patrocinador Ouro'), ('sp-prata', 'Patrocinador Prata')`);
    app = await montarApp();
  }, 420_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  // ── C1 (P1) — VINCULAÇÃO POR COTA: não olha a etapa da peça ───────────────
  it("ACHADO C1: a vinculação automática por cota só vincula peça em VINCULAÇÃO — não a impressa, entregue, cancelada, excluída nem a 'Sem patrocínio'", async () => {
    const EVC = "ev-cota";
    await semearEvento(banco, EVC, "EVENTO DA COTA", 30);
    await banco.consultar(`INSERT INTO event_sponsors (event_id, sponsor_id, quota) VALUES ($1, 'sp-ouro', 'OURO')`, [EVC]);
    await banco.consultar(`INSERT INTO event_quota_rules (event_id, quota, item_types) VALUES ($1, 'OURO', ARRAY['Pórtico']::text[])`, [EVC]);
    const pecas: Array<[string, string, Record<string, unknown>?]> = [
      ["c1-vinc", "requested"],
      ["c1-impressao", "inProduction"],
      ["c1-entregue", "delivered"],
      ["c1-cancelada", "canceled"],
      ["c1-excluida", "requested", { deleted_at: new Date() }],
      ["c1-semp", "requested", { skip_approval: true }],
    ];
    let n = 0;
    for (const [id, status, extra] of pecas) {
      await semearPeca(banco, { id, eventId: EVC, displayId: `#91${n++}`, status, quantity: 1, type: "Pórtico", extra });
    }

    const previa = await app.chamar<Array<{ items: Array<{ itemId: string }> }>>(USUARIOS.atendimento, "GET", `/api/events/${EVC}/auto-link-preview`);
    const naPrevia = previa.corpo.flatMap((p) => p.items.map((i) => i.itemId)).sort();

    const r = await app.chamar<{ linked: number }>(USUARIOS.atendimento, "POST", `/api/events/${EVC}/auto-link-sponsors`);
    expect(r.status, JSON.stringify(r.corpo)).toBe(200);
    const vinculadas = (await banco.consultar<{ item_id: string }>(
      `SELECT item_id FROM item_sponsors WHERE item_id = ANY($1::text[]) ORDER BY item_id`, [pecas.map((p) => p[0])],
    )).map((l) => l.item_id);

    // Obtido hoje: as SEIS peças ganham "Patrocinador Ouro" — a impressa e a
    // entregue (sem linha de aprovação: o patrocinador nunca decide), a
    // cancelada, a EXCLUÍDA e a "Sem patrocínio" (que segue pulando a Aprovação
    // com patrocinador — o estado impossível do caso Mandala). O sync, o
    // "Aplicar sugestões" e o Acrescentar barram todas elas.
    expect(naPrevia, "a prévia oferece peças fora da fase").toEqual(["c1-vinc"]);
    expect(vinculadas).toEqual(["c1-vinc"]);
    expect(r.corpo.linked).toBe(1);
  });

  // ── C2 (P2) — VINCULAR UM PATROCINADOR (POST /api/items/:id/sponsors) ─────
  it("ACHADO C2a: vincular patrocinador numa peça já LIBERADA para a Gráfica é recusado (o patrocinador nunca aprovaria)", async () => {
    await semearPeca(banco, { id: "c2-liberada", eventId: EV, displayId: "#920", status: "approved", quantity: 1 });
    const r = await app.chamar(USUARIOS.arte, "POST", `/api/items/c2-liberada/sponsors`, { sponsorId: "sp-prata" });
    // Obtido hoje: 201 — o vínculo nasce sem linha de aprovação e a peça segue
    // para a impressão. O Acrescentar (bulk-add-sponsor) recusa esta mesma peça
    // ("já foi liberada para a produção") e o sync também (fora da vinculação).
    expect(r.status, JSON.stringify(r.corpo)).toBe(409);
    const v = await banco.consultar(`SELECT 1 FROM item_sponsors WHERE item_id = 'c2-liberada'`);
    expect(v.length).toBe(0);
  });

  it("ACHADO C2b: vincular patrocinador numa peça 'Sem patrocínio' tira a marca (senão ela pula a Aprovação COM patrocinador)", async () => {
    await semearPeca(banco, { id: "c2-semp", eventId: EV, displayId: "#921", status: "awaiting_linking", quantity: 1, extra: { skip_approval: true } });
    const r = await app.chamar(USUARIOS.atendimento, "POST", `/api/items/c2-semp/sponsors`, { sponsorId: "sp-prata" });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const [p] = await banco.consultar<{ skip_approval: boolean }>(`SELECT skip_approval FROM items WHERE id = 'c2-semp'`);
    // Obtido hoje: true — o sync (27/10) e o Acrescentar desmarcam; este caminho não.
    expect(p.skip_approval).toBe(false);
  });

  it("ACHADO C2c: vincular patrocinador numa peça em REVISÃO FINAL não passa calado (reabre a aprovação, como o Acrescentar, ou recusa)", async () => {
    await semearPeca(banco, { id: "c2-revisao", eventId: EV, displayId: "#922", status: "awaiting_final_review", quantity: 1 });
    const r = await app.chamar(USUARIOS.arte, "POST", `/api/items/c2-revisao/sponsors`, { sponsorId: "sp-prata" });
    const [p] = await banco.consultar<{ status: string }>(`SELECT status FROM items WHERE id = 'c2-revisao'`);
    const linhas = await banco.consultar(`SELECT 1 FROM item_sponsor_approvals WHERE item_id = 'c2-revisao' AND sponsor_id = 'sp-prata'`);
    // Obtido hoje: 201, peça segue em Revisão Final e nenhuma pendência — o
    // patrocinador entra na arte sem nunca aprovar.
    const recusou = r.status === 409;
    const reabriu = p.status === "awaiting_sponsor_approval" && linhas.length === 1;
    expect(recusou || reabriu, `status ${r.status}, peça em ${p.status}, ${linhas.length} pendência(s)`).toBe(true);
  });

  // ── C3 (P2) — PLANILHA: o "Reaproveitar" da prévia some no confirmar ──────
  it("ACHADO C3: confirmar a importação grava o REAPROVEITAMENTO marcado na prévia (coluna 'Reaprov. = Sim' ou o botão Reaproveitar)", async () => {
    const r = await app.chamar<{ items: Array<{ id: string }> }>(USUARIOS.solicitacao, "POST", `/api/events/${EV}/confirm-import`, {
      fileName: "lista-exportada.xlsx",
      items: [{
        linha: 4, type: "Testeira de tenda", description: "Testeira Bradesco", quantity: 2,
        fileWidth: "5.3", fileHeight: "0.9", visualWidth: "5", visualHeight: "0.6",
        calculatedM2: 9.54, material: "Lona", finish: "Refile", measurement: "5.30 × 0.90",
        observations: "", reuse: true,
      }],
    });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const [p] = await banco.consultar<{ is_reuse: boolean; reuse_qty: number }>(`SELECT is_reuse, reuse_qty FROM items WHERE id = $1`, [r.corpo.items[0].id]);
    // Obtido hoje: is_reuse = false, reuse_qty = 0 — LinhaImportada nem lê `reuse`:
    // a peça marcada para sair do estoque entra para IMPRIMIR de novo.
    expect(p.is_reuse || p.reuse_qty > 0, JSON.stringify(p)).toBe(true);
  });

  // ── C4 (P3) — VERSÕES: o usuário do Kit recebe os books de todos os eventos ─
  it("ACHADO C4: Versões do usuário do Kit não traz os books de eventos onde ele não tem peça", async () => {
    const { registerVersoesRoutes } = await import("../routes/versoes");
    const { chamar } = capturarRotas(registerVersoesRoutes);
    const EVB = "ev-book-arena";
    await semearEvento(banco, EVB, "EVENTO SÓ DA ARENA", 20);
    await semearPeca(banco, { id: "c4-arena", eventId: EVB, displayId: "#930", status: "awaiting_sponsor_approval", quantity: 1 });
    await banco.consultar(`INSERT INTO event_books (event_id, book_url, item_count, created_by, comment) VALUES ($1, '/objects/uploads/book-arena.pdf', 1, 'Artur Arte', 'book da arena')`, [EVB]);

    const r = await chamar("GET /api/versoes", { sessao: sessaoDe(KIT), query: {} });
    expect(r.status).toBe(200);
    const corpo = r.body as { itens: unknown[]; books: Array<{ eventId: string }> };
    expect(corpo.itens.length, "as peças já são recortadas").toBe(0);
    // Obtido hoje: o book (com URL e comentário) do evento da Arena vem junto —
    // doUsuario recorta `itens` e devolve `books` inteiro.
    expect(corpo.books.map((b) => b.eventId)).not.toContain(EVB);
  });

  // ── C6 (P3) — RELATÓRIO DO EVENTO: fotos da Arena para o usuário do Kit ───
  it("ACHADO C6: o Relatório do Evento do usuário do Kit conta e mostra só as fotos das peças dele", async () => {
    const { registerRelatorioRoutes } = await import("../routes/relatorio");
    const { chamar } = capturarRotas(registerRelatorioRoutes);
    const EVR = "ev-relat";
    await semearEvento(banco, EVR, "EVENTO DO RELATÓRIO", 15);
    await banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao, criado_por_id) VALUES ('kr-relat', $1, 'KIT', $2)`, [EVR, KIT.id]);
    await semearPeca(banco, { id: "c6-kit", eventId: EVR, displayId: "#940", status: "draft", quantity: 1, extra: { kit_remessa_id: "kr-relat", criado_por_id: KIT.id } });
    await semearPeca(banco, { id: "c6-arena", eventId: EVR, displayId: "#941", status: "delivered", quantity: 1, extra: { delivered_qty: 1, delivery_photo_url: "/objects/uploads/entrega-arena.jpg", delivered_at: new Date() } });

    const r = await chamar("GET /api/events/:id/relatorio", { sessao: sessaoDe(KIT), params: { id: EVR } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const corpo = r.body as { totais: { pecas: number }; fotos: { total: number; ultimas: Array<{ displayId: string | null }> } };
    expect(corpo.totais.pecas, "as peças já são recortadas").toBe(1);
    // Obtido hoje: total 1 com a foto da entrega #941 (Arena) — fotosDoEvento
    // filtra só por evento, sem o recorte do Kit que as peças e aprovações têm.
    expect(corpo.fotos.total).toBe(0);
    expect(corpo.fotos.ultimas.map((f) => f.displayId)).not.toContain("#941");
  });

  // ── C7 (P3) — FECHAMENTO: "M² a produzir" soma a peça CANCELADA ───────────
  it("ACHADO C7: no Excel de fechamento, peça cancelada não entra no 'M² a produzir' (nem na linha, nem no TOTAL)", async () => {
    const { responderFechamento } = await import("../services/fechamentoDoEvento");
    const EVF = "ev-fech";
    await semearEvento(banco, EVF, "EVENTO DO FECHAMENTO", -3);
    await semearPeca(banco, { id: "c7-entregue", eventId: EVF, displayId: "#950", status: "delivered", quantity: 2, extra: { calculated_m2: "4.00", quantity_produced: 2, delivered_qty: 2 } });
    await semearPeca(banco, { id: "c7-cancelada", eventId: EVF, displayId: "#951", status: "canceled", quantity: 3, extra: { calculated_m2: "6.00" } });

    PLANILHAS.length = 0;
    const req: any = { userRole: "admin", userKit: false, userId: USUARIOS.admin.id, userName: USUARIOS.admin.nome };
    const res: any = { headersSent: false, _status: 200, _body: undefined as unknown };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: unknown) => { res._body = b; return res; };
    res.setHeader = () => res;
    res.end = () => res;
    await responderFechamento(req, res, [EVF]);
    expect(res._status, JSON.stringify(res._body)).toBe(200);

    const ws = PLANILHAS[PLANILHAS.length - 1].getWorksheet("Itens");
    const cab = Array.from(ws.getRow(3).cells.entries() as Iterable<[number, any]>).sort((a, b) => a[0] - b[0]).map(([, c]) => c.value);
    const colM2 = cab.indexOf("M² a produzir") + 1;
    let total: number | null = null;
    let daCancelada: number | null = null;
    for (let n = 4; n <= ws.rows.length; n++) {
      const row = ws.getRow(n);
      if (String(row.getCell(1).value ?? "").startsWith("TOTAL")) { total = row.getCell(colM2).value; break; }
      const valores = Array.from(row.cells.values() as Iterable<any>).map((c) => c.value);
      if (valores.includes("#951")) daCancelada = row.getCell(colM2).value;
    }
    // Obtido hoje: a cancelada sai com 6 m² a produzir e o TOTAL dá 10 —
    // m2ToProduce (xlsxExport) só desconta o reaproveitado, não o status.
    expect(daCancelada).toBe(0);
    expect(total).toBe(4);
  });
});

// ── C5 (P3) — TRILHA: gestão de operadores da Gráfica aberta a todos ───────
describe("auditoria de lógica — recorte da trilha", () => {
  it("ACHADO C5: a trilha de gestão de OPERADORES (PIN criado/redefinido/bloqueado) é do admin, como a de usuários", async () => {
    const { recortarTrilha } = await import("../routes/audit-logs");
    const logs = [
      { id: "1", entityType: "user", entityId: "u1", userId: "u-admin", action: "updated" },
      { id: "2", entityType: "operador", entityId: "op1", userId: "u-admin", action: "pin_redefinido" },
      { id: "3", entityType: "operador", entityId: "op1", userId: "u-graf", action: "pin_bloqueado" },
      { id: "4", entityType: "item", entityId: "p1", userId: "u-arte", action: "updated" },
      // Turno ("Gilmar assumiu a máquina às 13:02") é trilha operacional: fica à vista.
      { id: "5", entityType: "operador", entityId: "op1", userId: "u-graf", action: "turno_inicio" },
    ];
    const vistos = recortarTrilha(logs, { admin: false, kit: false, userId: "u-arte", minhas: new Set() }).map((l) => l.id);
    // Obtido hoje: ["2", "3", "4", "5"] — o recorte só conhece entityType "user".
    expect(vistos).toEqual(["4", "5"]);
  });
});
