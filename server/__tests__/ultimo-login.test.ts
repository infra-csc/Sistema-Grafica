// ─────────────────────────────────────────────────────────────────────────────
// O REGISTRO DE ÚLTIMO LOGIN (frente 1 do diagnóstico de 24/08).
//
// O app tinha 38 contas e nenhuma forma de separar quem trabalha nele de quem
// saiu da empresa: nada registrava login — nem coluna, nem audit_log, e a
// tabela de sessões é rolling de 7 dias.
//
// As decisões de desenho que este arquivo prende:
//
//  1. GRAVADO NOS DOIS CAMINHOS de entrada (senha e SSO) — um só daria uma
//     coluna que mente para metade dos usuários.
//  2. FORA DO CAMINHO CRÍTICO: se o UPDATE falhar, a pessoa entra mesmo
//     assim. O registro serve à gestão de acesso, não à autenticação — negar
//     login por causa dele seria o termômetro desligando o paciente.
//  3. SÓ O LOGIN ESCREVE. O cadastro não aceita o campo (nem pelo zod, nem
//     pelo contrato do storage): um cadastro que o aceitasse poderia fabricar
//     uma conta "usada ontem" que nunca foi aberta.
//  4. NULL é legítimo e IRRECUPERÁVEL — não existe fonte para backfill. Uma
//     conta com NULL é "anterior ao registro", não "nunca usada"; a tela que
//     consumir isto tem de dizer as duas coisas de formas diferentes.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const SCHEMA = readFileSync(new URL("../../shared/schema.ts", import.meta.url), "utf8");
const AUTH = readFileSync(new URL("../routes/auth.ts", import.meta.url), "utf8");
const INDEX = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
const STORAGE = readFileSync(new URL("../storage.ts", import.meta.url), "utf8");

describe("a coluna existe e é anulável", () => {
  it("last_login_at, sem default — vazio significa 'anterior ao registro'", () => {
    expect(SCHEMA).toContain('lastLoginAt: timestamp("last_login_at"),');
    // Um default now() carimbaria toda conta futura como "acessada" no
    // instante do cadastro, que é exatamente a mentira que a coluna combate.
    expect(SCHEMA).not.toMatch(/last_login_at"\)\.[^,]*default/);
  });
});

describe("os dois caminhos de entrada gravam", () => {
  it("o login por senha grava depois de autenticar, fora do caminho crítico", () => {
    const i = AUTH.indexOf('app.post("/api/auth/login"');
    const corpo = AUTH.slice(i, AUTH.indexOf("app.post", i + 10));
    expect(corpo).toContain("storage.updateUser(user.id, { lastLoginAt: new Date() }).catch(");
    // Depois da senha conferida e da sessão regenerada — nunca antes: gravar
    // login para quem errou a senha seria pior que não gravar.
    expect(corpo.indexOf("bcrypt.compare")).toBeLessThan(corpo.indexOf("lastLoginAt"));
    expect(corpo.indexOf("req.session.regenerate")).toBeLessThan(corpo.indexOf("lastLoginAt"));
  });

  it("o SSO grava no exchange, com o mesmo contrato", () => {
    expect(INDEX).toContain('pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [entry.userId])');
    expect(INDEX).toContain("[SSO] lastLoginAt não gravado");
  });

  it("e os dois engolem a falha — login não depende do carimbo", () => {
    expect(AUTH).toContain("lastLoginAt não gravado (login por senha)");
    // Os dois são fire-and-forget com .catch; nenhum await na frente.
    expect(AUTH).not.toContain("await storage.updateUser(user.id, { lastLoginAt");
    expect(INDEX).not.toContain('await pool.query("UPDATE users SET last_login_at');
  });
});

describe("só o login escreve", () => {
  it("o zod do cadastro rejeita o campo", () => {
    const i = SCHEMA.indexOf("export const insertUserSchema");
    const bloco = SCHEMA.slice(i, SCHEMA.indexOf(".extend({", i));
    expect(bloco).toContain("lastLoginAt: true,");
  });

  it("o contrato do createUser não o aceita", () => {
    expect(STORAGE).toContain("'lastLoginAt'>): Promise<User>");
  });

  it("o PATCH de usuário do admin não repassa o campo", () => {
    const i = AUTH.indexOf('app.patch("/api/users/:id"');
    const corpo = AUTH.slice(i, AUTH.indexOf("app.delete", i));
    expect(corpo).not.toContain("lastLoginAt");
  });
});

describe("a coluna chega à tela de usuários", () => {
  it("GET /api/users manda o usuário inteiro menos o hash — o carimbo vai junto", () => {
    const i = AUTH.indexOf('app.get("/api/users", requireAdmin');
    const corpo = AUTH.slice(i, i + 600);
    expect(corpo).toContain("({ passwordHash: _, ...user })");
  });
});
