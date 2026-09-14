// ─────────────────────────────────────────────────────────────────────────────
// KIT — fase 1 (dono, 14/09): usuário do Kit, remessas com as datas do Kit,
// peça do Kit com quem criou, e o filtro "o usuário do Kit só vê as dele".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  pecaVisivelPara,
  remessaUtilizavelPor,
  textoDoSeloKit,
  rotuloDaRemessa,
  diaMesDoKit,
  detalheDaRemessa,
} from "@shared/kit";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
const SCHEMA = ler("shared/schema.ts");
const ITEMS = ler("server/routes/items.ts");
const EVENTS = ler("server/routes/events.ts");
const KIT = ler("server/routes/kit.ts");
const AUTH = ler("server/routes/auth.ts");
const INDEX = ler("server/index.ts");
const ROUTES = ler("server/routes.ts");
const IMPORT = ler("server/services/xlsxImport.ts");
const USUARIOS = ler("client/src/pages/usuarios.tsx");
const EVENTO = ler("client/src/pages/event-detail.tsx");

describe("regras puras do Kit", () => {
  it("usuário do Kit só vê as peças do Kit que ele criou; o resto vê tudo", () => {
    const kit = { kit: true, userId: "u1" };
    expect(pecaVisivelPara(kit, { kitRemessaId: "r1", criadoPorId: "u1" })).toBe(true);
    expect(pecaVisivelPara(kit, { kitRemessaId: "r1", criadoPorId: "u2" })).toBe(false);
    expect(pecaVisivelPara(kit, { kitRemessaId: null, criadoPorId: "u1" })).toBe(false);
    expect(pecaVisivelPara({ kit: false, userId: "u9" }, { kitRemessaId: "r1", criadoPorId: "u1" })).toBe(true);
    expect(pecaVisivelPara({ kit: false, userId: "u9" }, { kitRemessaId: null, criadoPorId: null })).toBe(true);
    expect(remessaUtilizavelPor(kit, { criadoPorId: "u2" })).toBe(false);
    expect(remessaUtilizavelPor({ kit: false, userId: "u9" }, { criadoPorId: "u2" })).toBe(true);
  });

  it("selo e rótulos: KIT · entrega dd/mm", () => {
    expect(diaMesDoKit("2026-09-20T12:00:00Z")).toBe("20/09");
    expect(textoDoSeloKit({ entregaMaterial: "2026-09-20T12:00:00Z" })).toBe("KIT · entrega 20/09");
    expect(textoDoSeloKit(null)).toBe("KIT");
    expect(rotuloDaRemessa({ versao: "V2", entregaMaterial: "2026-09-20T12:00:00Z" })).toBe("KIT V2 · entrega 20/09");
    expect(detalheDaRemessa({ versao: "V1", entregaMaterial: "2026-09-20T12:00:00Z", saidaCaminhao: "2026-09-21T12:00:00Z" }))
      .toBe("Peça do Kit — remessa V1 · entrega do material 20/09 · saída do caminhão 21/09");
  });
});

describe("servidor do Kit", () => {
  it("schema: marca no usuário, remessa com datas do Kit, peça com remessa e quem criou", () => {
    expect(SCHEMA).toContain('kit: boolean("kit").notNull().default(false),');
    expect(SCHEMA).toContain('export const kitRemessas = pgTable("kit_remessas", {');
    expect(SCHEMA).toContain('entregaMaterial: timestamp("entrega_material").notNull(),');
    expect(SCHEMA).toContain('kitRemessaId: varchar("kit_remessa_id").references((): any => kitRemessas.id, { onDelete: "set null" }),');
    expect(SCHEMA).toContain('criadoPorId: varchar("criado_por_id"),');
    expect(SCHEMA).toContain("  criadoPorId: true,\n});");
  });

  it("a marca vem do login (senha e SSO) e mudar a marca derruba as sessões", () => {
    expect(AUTH).toContain("req.session.userKit = user.kit === true;");
    expect(AUTH).toContain("if (validatedData.role !== undefined || validatedData.kit !== undefined) {");
    expect(INDEX).toContain("req.session.userKit  = entry.userKit;");
    expect(ROUTES).toContain("req.userKit = req.session.userKit === true;");
    expect(ROUTES).toContain("registerKitRoutes(app);");
  });

  it("remessas: criar é admin/Solicitação; o usuário do Kit só lista as dele", () => {
    expect(KIT).toContain('const requireCriarRemessa = requireRole("admin", "solicitacao");');
    expect(KIT).toContain('app.post("/api/kit/remessas", requireCriarRemessa');
    expect(KIT).toContain('if ((req as any).userKit) condicoes.push(eq(kitRemessas.criadoPorId, (req as any).userId ?? ""));');
  });

  it("peças: filtro do usuário do Kit nas listas, na criação e na importação", () => {
    expect(ITEMS).toContain("const allItems = (await storage.getAllItems()).filter((i) => pecaVisivelPara(quemVe(req), i));");
    expect(ITEMS).toContain("(await storage.getItemsByEvent(req.params.eventId)).filter((i) => pecaVisivelPara(quemVe(req), i));");
    expect(ITEMS).toContain("removidas: mudadas.filter((i) => i.deletedAt || !pecaVisivelPara(quemVe(req), i)).map((i) => i.id),");
    expect(ITEMS).toContain('return res.status(400).json({ error: "Usuário do Kit cria só peça do Kit — escolha a remessa do Kit." });');
    expect(ITEMS).toContain("(validatedData as any).criadoPorId = req.userId ?? null;");
    expect(IMPORT).toContain("criadoPorId: (req as any).userId ?? null,");
    expect(IMPORT).toContain("Usuário do Kit importa só peças do Kit");
  });

  it("eventos: o do Kit vê os eventos com as contagens só das peças dele; enviar separa Kit e Arena", () => {
    expect(EVENTS).toContain("if (!it.kitRemessaId || it.criadoPorId !== userId) continue;");
    expect(EVENTS).toContain("? todasAsPecas.filter((i) => !!i.kitRemessaId && i.criadoPorId === userIdKit)");
    expect(EVENTS).toContain("(isAdmin || (doKit ? (!!item.kitRemessaId && item.criadoPorId === userId) : !item.kitRemessaId)));");
  });
});

describe("telas do Kit", () => {
  it("usuários: marca 'Usuário do Kit' só no perfil Solicitação", () => {
    expect(USUARIOS).toContain('{form.watch("role") === "solicitacao" && (');
    expect(USUARIOS).toContain('data-testid="checkbox-user-kit"');
    expect(USUARIOS).toContain('const kit = data.role === "solicitacao" && data.kit;');
  });

  it("evento: painel do Kit, 'Peça de' no formulário, selo KIT na lista, sem Entrada Rápida para o usuário do Kit", () => {
    expect(EVENTO).toContain("<PainelDoKit");
    expect(EVENTO).toContain('data-testid="select-item-kit"');
    expect(EVENTO).toContain("...(data.kitRemessaId ? { kitRemessaId: data.kitRemessaId } : {}),");
    expect(EVENTO).toContain('<SeloKit peca={item} style={{ marginLeft: 6 }} />');
    expect(EVENTO).toContain("trailing={!editingItem && !pedidoEmAtendimento && !user?.kit ? (");
  });
});
