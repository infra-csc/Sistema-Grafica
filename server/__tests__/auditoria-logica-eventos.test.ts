// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE LÓGICA (28/10) — eventos, book, planilha, Kit, pedidos de peça,
// usuários e notificações. Cada `it` "ACHADO Ex: ..." PROVA um achado: o teste
// descreve o comportamento ESPERADO e fica VERMELHO enquanto o defeito existir.
//
// Integração real (PGlite + rotas de produção). Sem o PGlite, o arquivo PULA.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste, type Usuario } from "./app-com-banco";
import { capturarRotas } from "./rotas-de-mentira";

// O e-mail do book e a fila da IA não entram no cenário (nenhum dos dois é alcançado).
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

const KIT: Usuario = { id: "u-kit", nome: "Kaio Kit", papel: "solicitacao", kit: true };
const sessaoDe = (u: Usuario) => ({ userId: u.id, userName: u.nome, userRole: u.papel, userKit: u.kit === true });

describe.skipIf(!PGLITE_DISPONIVEL)("auditoria de lógica — eventos, book, planilha, Kit, pedidos, usuários, notificações", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  const EV = "ev-aud";

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await banco.consultar(`INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ($1, $2, $3, 'x', 'solicitacao', true)`, [KIT.id, KIT.nome, "u-kit@teste.local"]);
    await semearEvento(banco, EV, "EVENTO DA AUDITORIA", 40);
    await banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao, criado_por_id) VALUES ('kr-aud', $1, 'KIT', $2)`, [EV, KIT.id]);
    await banco.consultar(`INSERT INTO sponsors (id, name) VALUES ('sp-aud', 'Patrocinador Auditoria')`);
    app = await montarApp();
  }, 180_000);

  afterAll(async () => {
    await app?.fechar();
    await banco?.parar();
  });

  // ── E1 (P2) — BOOK: a rota apaga o book atual ANTES de validar as peças ──
  it("ACHADO E1: publicar book com seleção inválida responde 400 SEM apagar o book atual do evento", async () => {
    for (const n of [1, 2]) {
      await semearPeca(banco, { id: `p-book-${n}`, eventId: EV, displayId: `#81${n}`, status: "awaiting_sponsor_approval", quantity: 1, extra: { book_url: "/objects/uploads/book-v1.pdf" } });
    }
    const r = await app.chamar(USUARIOS.arte, "POST", `/api/events/${EV}/book`, {
      bookUrl: "/objects/uploads/book-v2.pdf", itemIds: ["peca-que-nao-existe-mais"], comentario: "trocou a capa do book",
    });
    expect(r.status, JSON.stringify(r.corpo)).toBe(400);
    const linhas = await banco.consultar<{ book_url: string | null }>(`SELECT book_url FROM items WHERE id IN ('p-book-1','p-book-2') ORDER BY id`);
    // Obtido hoje: [null, null] — clearEventBookUrl roda antes do filtro de ids válidos.
    expect(linhas.map((l) => l.book_url)).toEqual(["/objects/uploads/book-v1.pdf", "/objects/uploads/book-v1.pdf"]);
  });

  // ── E2 (P3) — PLANILHA: o m² do confirm-import vem do cliente ────────────
  it("ACHADO E2: confirmar importação grava o m² recalculado no servidor (qtd × larg × alt), não o que o corpo mandou", async () => {
    const r = await app.chamar<{ items: Array<{ id: string; calculatedM2: string }> }>(USUARIOS.solicitacao, "POST", `/api/events/${EV}/confirm-import`, {
      fileName: "lista.xlsx",
      items: [{
        linha: 2, type: "Banner", description: "Banner da auditoria", quantity: 2,
        fileWidth: "2", fileHeight: "1", visualWidth: "2", visualHeight: "1",
        calculatedM2: 999, material: "Lona", finish: "Ilhós", measurement: "2 × 1",
      }],
    });
    expect(r.status, JSON.stringify(r.corpo)).toBe(201);
    const [linha] = await banco.consultar<{ calculated_m2: string }>(`SELECT calculated_m2 FROM items WHERE id = $1`, [r.corpo.items[0].id]);
    // Obtido hoje: "999.00" — POST /api/items e /bulk recalculam (deriveCalculatedM2); a planilha não.
    expect(Number(linha.calculated_m2)).toBe(4);
  });

  // ── E3 (P2) — NOTIFICAÇÕES: "Marcar todas" do Kit lê as da Arena ─────────
  it("ACHADO E3: 'Marcar todas' do usuário do Kit não marca como lidas as notificações da Arena que ele nem vê", async () => {
    const { registerNotificationRoutes } = await import("../routes/notifications");
    const { chamar } = capturarRotas(registerNotificationRoutes);
    await semearPeca(banco, { id: "p-notif-arena", eventId: EV, displayId: "#701", status: "draft", quantity: 1 });
    await semearPeca(banco, { id: "p-notif-kit", eventId: EV, displayId: "#702", status: "draft", quantity: 1, extra: { kit_remessa_id: "kr-aud", criado_por_id: KIT.id } });
    await banco.consultar(`INSERT INTO notifications (id, type, message, event_id, item_id, target_roles) VALUES
      ('n-arena', 'itemAdded', 'Aviso da Arena', $1, 'p-notif-arena', ARRAY['solicitacao']::text[]),
      ('n-kit',   'itemAdded', 'Aviso do Kit',   $1, 'p-notif-kit',   ARRAY['solicitacao']::text[])`, [EV]);

    const vistas = await chamar("GET /api/notifications", { sessao: sessaoDe(KIT) });
    const ids = (vistas.body as Array<{ id: string }>).map((n) => n.id);
    expect(ids).toContain("n-kit");
    expect(ids, "o Kit não vê o aviso da Arena").not.toContain("n-arena");

    const r = await chamar("PATCH /api/notifications/read-all", { sessao: sessaoDe(KIT) });
    expect(r.status).toBe(200);
    const [arena] = await banco.consultar<{ is_read: boolean }>(`SELECT is_read FROM notifications WHERE id = 'n-arena'`);
    // Obtido hoje: true — markAllNotificationsAsReadForRole recorta só por PAPEL; o recorte do Kit fica fora do UPDATE.
    expect(arena.is_read, "o sino da Solicitação da Arena perdeu o aviso").toBe(false);
  });

  it("ACHADO E4: marcar UMA notificação como lida exige ser destinatário dela", async () => {
    const { registerNotificationRoutes } = await import("../routes/notifications");
    const { chamar } = capturarRotas(registerNotificationRoutes);
    await banco.consultar(`INSERT INTO notifications (id, type, message, target_roles, target_user_id) VALUES
      ('n-individual', 'pedidoAtendido', 'Seu pedido foi atendido', ARRAY['atendimento','admin']::text[], $1)`, [USUARIOS.atendimento.id]);
    const r = await chamar("PATCH /api/notifications/:id/read", { sessao: sessaoDe(USUARIOS.grafica), params: { id: "n-individual" } });
    // Obtido hoje: 200 e is_read = true — a rota não confere targetRoles nem targetUserId.
    expect(r.status).not.toBe(200);
    const [n] = await banco.consultar<{ is_read: boolean }>(`SELECT is_read FROM notifications WHERE id = 'n-individual'`);
    expect(n.is_read).toBe(false);
  });

  // ── E5 (P2) / E6 (P3) — PEDIDOS DE PEÇA: atender com peça do Kit / cancelada
  it("ACHADO E5: a Solicitação da Arena não atende uma solicitação ligando uma peça do KIT (que ela só visualiza)", async () => {
    const { registerPedidosDePecaRoutes } = await import("../routes/pedidos-de-peca");
    const { chamar } = capturarRotas(registerPedidosDePecaRoutes);
    await semearPeca(banco, { id: "p-ped-kit", eventId: EV, displayId: "#601", status: "draft", quantity: 3, extra: { kit_remessa_id: "kr-aud", criado_por_id: KIT.id } });
    await banco.consultar(`INSERT INTO pedidos_de_peca (id, status, pedido_por, pedido_por_id) VALUES ('ped-aud', 'aberto', $1, $2)`, [USUARIOS.atendimento.nome, USUARIOS.atendimento.id]);
    await banco.consultar(`INSERT INTO pedidos_de_peca_linhas (id, pedido_id, ordem, event_id, sponsor_ids, quantidade, observacao, status)
      VALUES ('lin-aud-1', 'ped-aud', 0, $1, ARRAY['sp-aud']::text[], 3, 'Banner do patrocinador', 'aberto')`, [EV]);

    const r = await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/atender", {
      sessao: sessaoDe(USUARIOS.solicitacao), params: { linhaId: "lin-aud-1" }, body: { itemId: "p-ped-kit" },
    });
    // A barreira de routes.ts olha só /api/items/:id e body.itemIds — este caminho e `itemId` passam ao largo.
    expect(r.status, JSON.stringify(r.body)).toBe(403);
    const vinculos = await banco.consultar(`SELECT 1 FROM item_sponsors WHERE item_id = 'p-ped-kit'`);
    // Obtido hoje: 1 vínculo novo — a peça do Kit ganhou patrocinador pela mão da Solicitação da Arena.
    expect(vinculos.length).toBe(0);
  });

  it("ACHADO E6: peça CANCELADA não atende solicitação (a linha ficaria 'atendida' com 0 unidades)", async () => {
    const { registerPedidosDePecaRoutes } = await import("../routes/pedidos-de-peca");
    const { chamar } = capturarRotas(registerPedidosDePecaRoutes);
    await semearPeca(banco, { id: "p-ped-cancelada", eventId: EV, displayId: "#602", status: "canceled", quantity: 2 });
    await banco.consultar(`INSERT INTO pedidos_de_peca_linhas (id, pedido_id, ordem, event_id, sponsor_ids, quantidade, observacao, status)
      VALUES ('lin-aud-2', 'ped-aud', 1, $1, ARRAY[]::text[], 2, 'Testeira', 'aberto')`, [EV]);
    const r = await chamar("PATCH /api/pedidos-de-peca/linhas/:linhaId/atender", {
      sessao: sessaoDe(USUARIOS.solicitacao), params: { linhaId: "lin-aud-2" }, body: { itemId: "p-ped-cancelada" },
    });
    // Obtido hoje: 200 e status 'atendido'.
    expect(r.status, JSON.stringify(r.body)).toBe(409);
    const [linha] = await banco.consultar<{ status: string }>(`SELECT status FROM pedidos_de_peca_linhas WHERE id = 'lin-aud-2'`);
    expect(linha.status).toBe("aberto");
  });

  // ── E7 (P2, decisão) / E8 (P3) — USUÁRIOS ─────────────────────────────────
  it("ACHADO E7: o ÚLTIMO admin não se rebaixa (o sistema ficaria sem ninguém para gerir usuários)", async () => {
    const { registerAuthRoutes } = await import("../routes/auth");
    const { chamar } = capturarRotas(registerAuthRoutes);
    const antes = await banco.consultar<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
    expect(antes[0].n, "cenário: um admin só").toBe(1);
    const r = await chamar("PATCH /api/users/:id", { sessao: sessaoDe(USUARIOS.admin), params: { id: USUARIOS.admin.id }, body: { role: "solicitacao" } });
    const depois = await banco.consultar<{ n: number }>(`SELECT count(*)::int AS n FROM users WHERE role = 'admin'`);
    // Obtido hoje: 200 e zero admins — só o banco devolve o acesso.
    expect(r.status, JSON.stringify(r.body)).not.toBe(200);
    expect(depois[0].n).toBe(1);
    if (depois[0].n === 0) await banco.consultar(`UPDATE users SET role = 'admin' WHERE id = $1`, [USUARIOS.admin.id]);
  });

  it("ACHADO E8: trocar o perfil de um usuário do Kit para outro perfil derruba a marca do Kit no servidor", async () => {
    const { registerAuthRoutes } = await import("../routes/auth");
    const { chamar } = capturarRotas(registerAuthRoutes);
    await banco.consultar(`INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ('u-kit-vira-arte', 'Kit Que Vira Arte', 'kva@teste.local', 'x', 'solicitacao', true)`);
    const r = await chamar("PATCH /api/users/:id", { sessao: sessaoDe(USUARIOS.admin), params: { id: "u-kit-vira-arte" }, body: { role: "arte" } });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [u] = await banco.consultar<{ role: string; kit: boolean }>(`SELECT role, kit FROM users WHERE id = 'u-kit-vira-arte'`);
    expect(u.role).toBe("arte");
    // Obtido hoje: kit = true. O login (auth.ts) copia user.kit para a sessão sem olhar o perfil,
    // e a trava do Kit passa a valer para um usuário da ARTE (403 em toda peça que ele não criou).
    expect(u.kit).toBe(false);
  });
});
