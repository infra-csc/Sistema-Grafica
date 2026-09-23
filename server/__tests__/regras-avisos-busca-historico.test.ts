// ─────────────────────────────────────────────────────────────────────────────
// A BUSCA DO HISTÓRICO SAI DA JANELA — o lado do SERVIDOR, executando.
//
// Veio de busca-alem-da-janela.test.ts (que lia o texto de storage.ts e de
// routes/audit-logs.ts). Aqui o helper, o storage e a rota rodam de verdade
// sobre um banco de mentira que só guarda o WHERE; o SQL é renderizado pelo
// dialeto do Postgres do drizzle. O lado da tela continua lá.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { capturarRotas } from "./rotas-de-mentira";

const H = vi.hoisted(() => ({
  wheres: [] as unknown[],
  resposta: [] as unknown[],
  fake: {} as Record<string, any>,
}));

vi.mock("../db", () => {
  const select = () => {
    const q: any = {
      from: () => q, orderBy: () => q, limit: () => q,
      where: (w: unknown) => { H.wheres.push(w); return q; },
      then: (ok: any, falha: any) => Promise.resolve(H.resposta).then(ok, falha),
    };
    return q;
  };
  return { db: { select }, pool: {} };
});

// A rota recebe um storage falso (para ver o que ela repassa); o storage real
// continua acessível por vi.importActual para os casos do SQL.
vi.mock("../storage", async () => {
  const real = await vi.importActual<Record<string, unknown>>("../storage");
  return { ...real, storage: H.fake };
});

vi.mock("../routes/shared", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  sendSensitiveError: (res: any, _e: unknown, _ctx: string, status: number) => res.status(status).json({ error: "erro" }),
}));

const real = await vi.importActual<typeof import("../storage")>("../storage");
const { auditLogsBusca } = real;
const { registerAuditLogRoutes } = await import("../routes/audit-logs");

const dialeto = new PgDialect();
const render = (cond: unknown) => dialeto.sqlToQuery(cond as SQL);

beforeEach(() => {
  H.wheres.length = 0;
  H.resposta = [];
  for (const k of Object.keys(H.fake)) delete H.fake[k];
});

describe("o servidor busca na tabela inteira", () => {
  it("ILIKE nas três colunas que carregam texto", () => {
    const { sql, params } = render(auditLogsBusca("#2993"));
    expect(sql).toContain('"audit_logs"."details" ilike $');
    expect(sql).toContain('"audit_logs"."user_name" ilike $');
    expect(sql).toContain('"audit_logs"."entity_id" ilike $');
    // As três colunas numa OU: basta casar em uma.
    expect(sql.split(" or ").length).toBe(3);
    expect(params).toEqual(["%#2993%", "%#2993%", "%#2993%"]);
  });

  it("o termo é literal: %, _ e \\ são escapados", () => {
    // Sem isto, buscar "100%" viraria "tudo que contém 100" — e um termo com
    // "_" casaria qualquer caractere naquela posição.
    expect(render(auditLogsBusca("100%")).params[0]).toBe("%100\\%%");
    expect(render(auditLogsBusca("a_b")).params[0]).toBe("%a\\_b%");
    expect(render(auditLogsBusca("c\\d")).params[0]).toBe("%c\\\\d%");
    // Espaço nas pontas sai; o meio fica.
    expect(render(auditLogsBusca("  peça 12  ")).params[0]).toBe("%peça 12%");
  });

  it("termo vazio não vira filtro — a listagem normal fica intocada", async () => {
    for (const vazio of ["", "   ", null, undefined]) expect(auditLogsBusca(vazio)).toBeUndefined();
    // Sem filtro nenhum, a listagem nem chama .where().
    await real.storage.getAuditLogs(undefined, undefined, { busca: "  " });
    expect(H.wheres).toEqual([]);
  });

  it("a busca compõe com cursor e recorte — mesma cláusula, mesmo funil", async () => {
    const cursor = { createdAt: new Date("2026-08-07T12:00:00Z"), id: "log-9" };
    await real.storage.getAuditLogs("item", undefined, { cursor, busca: "#2993" });
    const { sql, params } = render(H.wheres[0]);
    expect(sql).toContain('"audit_logs"."entity_type" = $');
    expect(sql).toContain('"audit_logs"."created_at" < $');
    expect(sql).toContain('"audit_logs"."details" ilike $');
    expect(params).toContain("item");
    expect(params).toContain("%#2993%");

    // A contagem usa o MESMO recorte com a busca.
    H.resposta = [{ total: 7 }];
    expect(await real.storage.getAuditLogsCount("item", undefined, "#2993")).toBe(7);
    const contagem = render(H.wheres[1]);
    expect(contagem.sql).toContain('"audit_logs"."entity_type" = $');
    expect(contagem.sql).toContain('"audit_logs"."user_name" ilike $');
    expect(contagem.params).toContain("%#2993%");
  });

  it("a rota repassa ?busca= para a listagem E para a contagem", async () => {
    const { chamar } = capturarRotas(registerAuditLogRoutes);
    H.fake.getAuditLogs = vi.fn(async () => []);
    H.fake.getAuditLogsCount = vi.fn(async () => 42);
    H.fake.getIdsDasPecasDoKitDoCriador = vi.fn(async () => []);

    // Admin: a contagem do storage recebe o termo.
    const admin = await chamar("GET /api/audit-logs", {
      sessao: { userId: "u1", userRole: "admin" }, query: { busca: "#2993", withTotal: "1", limit: "50" },
    });
    expect(admin.status).toBe(200);
    expect(admin.body).toEqual({ logs: [], total: 42, nextCursor: null });
    expect(H.fake.getAuditLogs).toHaveBeenCalledWith(undefined, undefined, { limit: 50, cursor: null, busca: "#2993" });
    expect(H.fake.getAuditLogsCount).toHaveBeenCalledWith(undefined, undefined, "#2993");

    // Fora do admin a contagem é recortada no SQL da rota — com a busca junto.
    H.resposta = [{ total: 3 }];
    const arte = await chamar("GET /api/audit-logs", {
      sessao: { userId: "u2", userRole: "arte" }, query: { busca: "100%", withTotal: "1" },
    });
    expect(arte.body).toEqual({ logs: [], total: 3, nextCursor: null });
    const { sql, params } = render(H.wheres[H.wheres.length - 1]);
    expect(sql).toContain('"audit_logs"."details" ilike $');
    expect(params).toContain("%100\\%%");

    // ?busca= que não é texto (repetido na URL) não vira termo.
    await chamar("GET /api/audit-logs", { sessao: { userId: "u1", userRole: "admin" }, query: { busca: ["a", "b"] } });
    expect(H.fake.getAuditLogs).toHaveBeenLastCalledWith(undefined, undefined, expect.objectContaining({ busca: undefined }));
  });

  it("há UMA só declaração do helper e do campo — o duplo-patch já mordeu aqui", () => {
    // Varredura (AST): uma declaração duplicada de interface é LEGAL em TS
    // (as duas se fundem), então o compilador não pega isto sozinho.
    const RAIZ = path.resolve(__dirname, "..");
    const arquivos: string[] = [];
    (function andar(d: string) {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") andar(p); }
        else if (n.endsWith(".ts")) arquivos.push(p);
      }
    })(RAIZ);

    let helpers = 0;
    let campos = 0;
    for (const arq of arquivos) {
      const texto = readFileSync(arq, "utf8");
      if (!texto.includes("auditLogsBusca") && !texto.includes("AuditLogQuery")) continue;
      const sf = ts.createSourceFile(arq, texto, ts.ScriptTarget.Latest, true);
      const visitar = (no: ts.Node) => {
        if (ts.isFunctionDeclaration(no) && no.name?.text === "auditLogsBusca") helpers++;
        if (ts.isVariableDeclaration(no) && ts.isIdentifier(no.name) && no.name.text === "auditLogsBusca") helpers++;
        if (ts.isInterfaceDeclaration(no) && no.name.text === "AuditLogQuery") {
          campos += no.members.filter((m) => m.name && m.name.getText(sf) === "busca").length;
        }
        ts.forEachChild(no, visitar);
      };
      visitar(sf);
    }
    expect(helpers).toBe(1);
    expect(campos).toBe(1);
  });
});
