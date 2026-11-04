// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DE SEGURANÇA 28/10 — achados provados contra o app de verdade e o
// Postgres de verdade (PGlite). Cada `it` descreve o COMPORTAMENTO ATUAL (o
// risco). Quando a correção entrar, o teste quebra de propósito: troque a
// expectativa pela recusa (403) e ele passa a guardar a proteção.
// Relatório: docs/qa/security-review-2026-10-28.md.
//
// Sem o PGlite instalado (pasta de ferramentas), o arquivo PULA com aviso.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "net";
import type { Server } from "http";
import type { Request, Response, NextFunction } from "express";
import { PGLITE_DISPONIVEL, subirBancoDeTeste, type BancoDeTeste } from "./banco-pglite";
import { montarApp, semearUsuarios, semearPeca, semearEvento, USUARIOS, type AppDeTeste, type Usuario } from "./app-com-banco";

vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
// O bucket não existe no teste: a ACL "falha" e a rota cai no caminho de
// sempre (normalizar o texto), como acontece com um link externo de verdade.
vi.mock("../objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    async trySetObjectEntityAclPolicy() { throw new Error("sem bucket no teste"); }
    normalizeObjectEntityPath(p: string) { return p; }
  },
}));

const KIT: Usuario = { id: "u-kit", nome: "Kika Kit", papel: "solicitacao", kit: true };

describe.skipIf(!PGLITE_DISPONIVEL)("auditoria de segurança 28/10 — integração", () => {
  let banco: BancoDeTeste;
  let app: AppDeTeste;
  let extra: { base: string; chamar: AppDeTeste["chamar"]; fechar(): Promise<void> };
  const EV = "ev-seg-28-10";

  beforeAll(async () => {
    banco = await subirBancoDeTeste();
    await semearUsuarios(banco);
    await banco.consultar(`INSERT INTO users (id, name, email, password_hash, role, kit) VALUES ($1, $2, $3, 'x', 'solicitacao', true)`, [KIT.id, KIT.nome, "kit@teste.local"]);
    await semearEvento(banco, EV, "EVENTO DA ARENA", 20);
    // Peça da Arena NA IMPRESSORA (4 un., nenhuma impressa ainda).
    await semearPeca(banco, { id: "p-seg-imprimindo", eventId: EV, displayId: "#7001", status: "inProduction", quantity: 4, extra: { print_machine: "Mimaki 1" } });
    // Peça da Arena entregue (o comprovante de entrega é dela).
    await semearPeca(banco, { id: "p-seg-entregue", eventId: EV, displayId: "#7002", status: "delivered", quantity: 2, extra: { delivered_qty: 2, approval_thumb_url: "/objects/uploads/arte-da-arena" } });
    // A inclusão do Kit do evento e uma peça do Kit do usuário KIT (rascunho).
    await banco.consultar(`INSERT INTO kit_remessas (id, event_id, versao, criado_por_id) VALUES ('rem-seg', $1, '1', $2)`, [EV, KIT.id]);
    await semearPeca(banco, { id: "p-seg-kit", eventId: EV, displayId: "#7003", status: "draft", quantity: 1, extra: { kit_remessa_id: "rem-seg", criado_por_id: KIT.id, approval_thumb_url: null, final_file_url: null } });
    // O acervo (Estoque) guardou uma unidade da peça da Arena, com a arte dela.
    await banco.consultar(
      `INSERT INTO inventory_assets (id, original_item_id, display_id, name, approval_thumb_url) VALUES ('ativo-seg-1', 'p-seg-entregue', '#EST-7002-1', 'Pórtico da Arena', '/objects/uploads/arte-da-arena')`,
    );
    // Aviso SÓ do admin (targetRoles) e aviso individual de outra pessoa.
    await banco.consultar(`INSERT INTO notifications (id, type, message, event_id, target_roles) VALUES ('n-seg-admin', 'eventCreated', 'AVISO SÓ DO ADMIN', $1, ARRAY['admin'])`, [EV]);
    await banco.consultar(`INSERT INTO notifications (id, type, message, target_roles, target_user_id) VALUES ('n-seg-sofia', 'pedido', 'AVISO INDIVIDUAL DA SOFIA', ARRAY['solicitacao'], $1)`, [USUARIOS.solicitacao.id]);

    app = await montarApp();
    extra = await montarAppDeAvisosEFotos();
  }, 400_000);

  afterAll(async () => {
    await extra?.fechar();
    await app?.fechar();
    await banco?.parar();
  });

  describe("M1 corrigido — PATCH /api/items/:id: o contrato da peça é de quem gerencia a lista", () => {
    it("Atendimento não troca material e descrição de uma peça que está na impressora", async () => {
      const r = await app.chamar(USUARIOS.atendimento, "PATCH", "/api/items/p-seg-imprimindo", {
        material: "MATERIAL TROCADO PELO ATENDIMENTO", description: "descrição trocada",
      });
      expect(r.status, JSON.stringify(r.corpo)).toBe(403);
      const [p] = await banco.consultar<{ material: string; status: string }>(`SELECT material, status FROM items WHERE id = 'p-seg-imprimindo'`);
      expect(p.material).not.toBe("MATERIAL TROCADO PELO ATENDIMENTO");
      expect(p.status).toBe("inProduction");
    });

    it("Arte não reduz a quantidade de uma peça em impressão", async () => {
      const r = await app.chamar(USUARIOS.arte, "PATCH", "/api/items/p-seg-imprimindo", { quantity: 1 });
      expect(r.status, JSON.stringify(r.corpo)).toBe(403);
      const [p] = await banco.consultar<{ quantity: number }>(`SELECT quantity FROM items WHERE id = 'p-seg-imprimindo'`);
      expect(p.quantity).not.toBe(1);
    });

    it("controle: a Gráfica (sem ser criadora do evento) é recusada — a guarda existe, só é larga demais", async () => {
      const r = await app.chamar(USUARIOS.grafica, "PATCH", "/api/items/p-seg-imprimindo", { material: "x" });
      expect(r.status).toBe(403);
    });
  });

  describe("M3 corrigido — o usuário do Kit não lê o acervo nem adota arquivo alheio", () => {
    it("GET /api/inventory é recusado ao Kit", async () => {
      const r = await app.chamar(KIT, "GET", "/api/inventory");
      expect(r.status).toBe(403);
    });

    it("o Kit não 'adota' a arte da Arena como referência da peça dele: a ACL segue recusando o original", async () => {
      const { criarAclDoKit } = await import("../objectAcl");
      const consultar = async (sql: string, params: unknown[]) => ({ rows: await banco.consultar(sql, params) });
      expect(await criarAclDoKit(consultar).podeLer(KIT.id, "/objects/uploads/arte-da-arena"), "antes: recusado").toBe(false);
      const r = await app.chamar(KIT, "PATCH", "/api/items/p-seg-kit", { referenceUrls: ["/objects/uploads/arte-da-arena"] });
      expect(r.status, JSON.stringify(r.corpo)).toBe(400);
      expect(await criarAclDoKit(consultar).podeLer(KIT.id, "/objects/uploads/arte-da-arena")).toBe(false);
    });

    it("GET /api/inventory/:id também (o detalhe do ativo)", async () => {
      const r = await app.chamar(KIT, "GET", "/api/inventory/ativo-seg-1");
      expect(r.status).toBe(403);
    });
  });

  describe("M2 corrigido — a rota que contornava a guarda das fotos saiu", () => {
    it("controle: a rota gêmea recusa o Atendimento", async () => {
      const r = await extra.chamar(USUARIOS.atendimento, "POST", "/api/items/p-seg-entregue/photos", { photoUrl: "/objects/uploads/f" });
      expect(r.status).toBe(403);
    });

    it("POST /api/delivery-photos não existe mais, e nada é gravado", async () => {
      const r = await extra.chamar(USUARIOS.atendimento, "POST", "/api/delivery-photos", {
        itemId: "p-seg-entregue", photoUrl: "javascript:alert(document.domain)",
      });
      expect(r.status, JSON.stringify(r.corpo)).toBe(404);
      const fotos = await banco.consultar<{ photo_url: string }>(`SELECT photo_url FROM delivery_photos WHERE item_id = 'p-seg-entregue'`);
      expect(fotos.map((f) => f.photo_url)).not.toContain("javascript:alert(document.domain)");
    });
  });

  describe("M4 corrigido — PATCH /api/notifications/:id/read exige ser destinatário", () => {
    it("a Gráfica não vê o aviso do admin na lista…", async () => {
      const r = await extra.chamar<Array<{ id: string }>>(USUARIOS.grafica, "GET", "/api/notifications");
      expect(r.status).toBe(200);
      expect(r.corpo.map((n) => n.id)).not.toContain("n-seg-admin");
    });

    it("…e nem pelo id (que o tempo real entrega a todo socket) lê o texto ou dá baixa", async () => {
      const r = await extra.chamar<{ message: string; isRead: boolean }>(USUARIOS.grafica, "PATCH", "/api/notifications/n-seg-admin/read");
      expect(r.status).toBe(404);
      expect(r.corpo.message).toBeUndefined();
      const [n] = await banco.consultar<{ is_read: boolean }>(`SELECT is_read FROM notifications WHERE id = 'n-seg-admin'`);
      expect(n.is_read).toBe(false);
    });

    it("o usuário do Kit não lê o aviso individual de outra pessoa", async () => {
      const r = await extra.chamar<{ message: string }>(KIT, "PATCH", "/api/notifications/n-seg-sofia/read");
      expect(r.status).toBe(404);
      expect(r.corpo.message).toBeUndefined();
    });
  });

  describe("BAIXO — /api/catalog-options fica fora da trava 'Modelos não é do usuário do Kit'", () => {
    it("a Gráfica (qualquer logado) acrescenta opção ao catálogo; o DELETE, não", async () => {
      const r = await extra.chamar(USUARIOS.grafica, "POST", "/api/catalog-options", { kind: "material", value: "MATERIAL DA GRAFICA (teste)" });
      expect(r.status, JSON.stringify(r.corpo)).toBe(201); // correção: 403 (mesma régua do DELETE)
      const apagar = await extra.chamar(USUARIOS.grafica, "DELETE", "/api/catalog-options", { kind: "material", value: "MATERIAL DA GRAFICA (teste)" });
      expect(apagar.status).toBe(403);
    });

    it("o usuário do Kit grava E apaga opção do catálogo (a trava do Kit só olha /api/standard-items)", async () => {
      const r = await extra.chamar(KIT, "POST", "/api/catalog-options", { kind: "material", value: "MATERIAL DO KIT (teste)" });
      expect(r.status, JSON.stringify(r.corpo)).toBe(201); // correção: 403
      const apagar = await extra.chamar(KIT, "DELETE", "/api/catalog-options", { kind: "material", value: "MATERIAL DO KIT (teste)" });
      expect(apagar.status).toBe(200); // correção: 403
    });
  });
});

/** Express mínimo com as rotas de avisos, fotos, objetos e catálogo — a mesma "sessão" de mentira do app-com-banco. */
async function montarAppDeAvisosEFotos() {
  const express = (await import("express")).default;
  const { registerNotificationRoutes } = await import("../routes/notifications");
  const { registerPhotoRoutes } = await import("../routes/photos");
  const { registerObjectRoutes } = await import("../routes/objects");
  const { registerStandardItemRoutes } = await import("../routes/standard-items");
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const cru = req.header("x-teste-usuario");
    const u = cru ? (JSON.parse(decodeURIComponent(cru)) as Usuario) : null;
    const sessao = (u ? { userId: u.id, userName: u.nome, userRole: u.papel, userKit: u.kit === true } : {}) as Request["session"];
    Object.defineProperty(req, "session", { value: sessao, writable: true, configurable: true });
    if (u) { req.userId = u.id; req.userName = u.nome; req.userRole = u.papel; req.userKit = u.kit === true; } else req.userName = "Sistema";
    next();
  });
  // A trava de Modelos do Kit, como em server/routes.ts.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.userKit && req.path.startsWith("/api/standard-items") && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      return res.status(403).json({ error: "Modelos não é do usuário do Kit." });
    }
    next();
  });
  registerStandardItemRoutes(app);
  registerNotificationRoutes(app);
  registerPhotoRoutes(app);
  await registerObjectRoutes(app);
  const servidor: Server = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  return {
    base,
    async chamar<T>(quem: Usuario, metodo: string, caminho: string, corpo?: unknown) {
      const r = await fetch(base + caminho, {
        method: metodo,
        headers: { "content-type": "application/json", "x-teste-usuario": encodeURIComponent(JSON.stringify(quem)) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
      const texto = await r.text();
      let json: unknown = texto;
      try { json = texto ? JSON.parse(texto) : null; } catch { /* texto */ }
      return { status: r.status, corpo: json as T };
    },
    async fechar() { await new Promise<void>((ok) => servidor.close(() => ok())); },
  };
}
