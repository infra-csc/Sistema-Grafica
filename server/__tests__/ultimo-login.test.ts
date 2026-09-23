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
//
// Até 23/09 este arquivo lia o texto de auth.ts/index.ts/storage.ts. Agora as
// rotas de senha, cadastro, edição e listagem RODAM (banco de mentira); só o
// SSO, que mora dentro do server/index.ts (não dá para subir sem o servidor
// inteiro), segue como varredura.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, expectTypeOf } from "vitest";
import { readFileSync } from "fs";
import bcrypt from "bcryptjs";
import { getTableConfig } from "drizzle-orm/pg-core";

const H = vi.hoisted(() => ({
  usuarios: [] as Array<Record<string, unknown>>,
  updateUser: vi.fn(),
  createUser: vi.fn(),
}));

vi.mock("../db", () => ({ db: {}, pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) } }));
vi.mock("../storage", () => ({
  storage: {
    updateUser: (...a: unknown[]) => H.updateUser(...a),
    createUser: (...a: unknown[]) => H.createUser(...a),
    getAllUsers: async () => H.usuarios,
  },
}));
vi.mock("../login-seguro", async () => {
  const real = await vi.importActual<typeof import("../login-seguro")>("../login-seguro");
  return {
    ...real,
    buscarUsuarioPorEmail: async (email: string) => H.usuarios.find((u) => String(u.email).toLowerCase() === email.toLowerCase()),
  };
});
vi.mock("../sessoes-encerradas", () => ({ avisarSessoesEncerradas: vi.fn() }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<typeof import("../routes/shared")>("../routes/shared");
  const passa = (_req: unknown, _res: unknown, next: () => void) => next();
  // Os limitadores contam no Postgres; aqui não é deles que se trata.
  return { ...real, loginRateLimiter: passa, loginPorContaRateLimiter: passa, changePasswordRateLimiter: passa, createAuditLog: vi.fn(async () => {}) };
});

import { registerAuthRoutes } from "../routes/auth";
import { users, insertUserSchema } from "@shared/schema";
import type { storage } from "../storage";
import { capturarRotas } from "./rotas-de-mentira";

const { chamar } = capturarRotas(registerAuthRoutes);
const ADMIN = { userId: "u-admin", userRole: "admin", userName: "Ana" };

let hashDaAna: string;
beforeEach(async () => {
  hashDaAna ??= await bcrypt.hash("senha-certa", 4);
  H.usuarios = [{ id: "u-ana", name: "Ana", email: "ana@x.com", role: "arte", kit: false, passwordHash: hashDaAna, lastLoginAt: new Date("2026-09-01T12:00:00Z") }];
  H.updateUser.mockReset().mockImplementation(async (id: string, data: Record<string, unknown>) => ({ ...H.usuarios.find((u) => u.id === id), ...data }));
  H.createUser.mockReset().mockImplementation(async (dados: Record<string, unknown>) => ({ id: "u-novo", ...dados }));
});

describe("a coluna existe e é anulável", () => {
  it("last_login_at, sem default e sem NOT NULL — vazio significa 'anterior ao registro'", () => {
    const col = getTableConfig(users).columns.find((c) => c.name === "last_login_at");
    expect(col).toBeDefined();
    expect(col!.notNull).toBe(false);
    // Um default now() carimbaria toda conta futura como "acessada" no
    // instante do cadastro, que é exatamente a mentira que a coluna combate.
    expect(col!.hasDefault).toBe(false);
  });
});

describe("o login por senha grava, depois de autenticar e fora do caminho crítico", () => {
  it("senha certa: entra e carimba lastLoginAt (um Date recém-criado)", async () => {
    const antes = Date.now();
    const r = await chamar("POST /api/auth/login", { body: { email: "ana@x.com", password: "senha-certa" } });
    expect(r.status).toBe(200);
    expect(H.updateUser).toHaveBeenCalledTimes(1);
    const [id, dados] = H.updateUser.mock.calls[0];
    expect(id).toBe("u-ana");
    expect(dados.lastLoginAt).toBeInstanceOf(Date);
    expect((dados.lastLoginAt as Date).getTime()).toBeGreaterThanOrEqual(antes);
    // A resposta nunca leva o hash.
    expect(r.body).not.toHaveProperty("passwordHash");
  });

  it("senha errada ou conta inexistente: 401 e NENHUM carimbo (gravar login de quem errou seria pior que não gravar)", async () => {
    expect((await chamar("POST /api/auth/login", { body: { email: "ana@x.com", password: "errada" } })).status).toBe(401);
    expect((await chamar("POST /api/auth/login", { body: { email: "ninguem@x.com", password: "qualquer" } })).status).toBe(401);
    expect(H.updateUser).not.toHaveBeenCalled();
  });

  it("o UPDATE do carimbo falhando não impede a entrada", async () => {
    H.updateUser.mockRejectedValue(new Error("banco caiu"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await chamar("POST /api/auth/login", { body: { email: "ana@x.com", password: "senha-certa" } });
    expect(r.status).toBe(200);
    await new Promise((ok) => setTimeout(ok, 0));
    expect(erro.mock.calls.some((c) => String(c[0]).includes("lastLoginAt não gravado (login por senha)"))).toBe(true);
    erro.mockRestore();
  });
});

describe("o SSO grava com o mesmo contrato", () => {
  // VARREDURA: a troca do SSO é um handler dentro de server/index.ts, que só
  // existe com o servidor inteiro de pé. Prende-se a forma: UPDATE do
  // carimbo, sem `await` (fora do caminho crítico) e com o .catch que loga.
  const INDEX = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
  it("UPDATE users SET last_login_at = now() sem await, com .catch", () => {
    const m = /(await\s+)?pool\.query\(\s*["'`]UPDATE users SET last_login_at\s*=\s*now\(\)[^)]*\)\s*\.catch\(/.exec(INDEX);
    expect(m, "o SSO precisa carimbar last_login_at com .catch").not.toBeNull();
    expect(m![1], "o carimbo do SSO não pode ter await na frente").toBeUndefined();
    expect(INDEX).toContain("lastLoginAt não gravado");
  });
});

describe("só o login escreve", () => {
  it("o zod do cadastro descarta o campo", () => {
    const lido = insertUserSchema.parse({ name: "Bia", email: "bia@x.com", password: "123456", lastLoginAt: new Date("2020-01-01") });
    expect(lido).not.toHaveProperty("lastLoginAt");
  });

  it("POST /api/auth/register com lastLoginAt no corpo: o createUser não o recebe", async () => {
    const r = await chamar("POST /api/auth/register", {
      sessao: ADMIN,
      body: { name: "Bia", email: "bia@x.com", password: "123456", role: "arte", lastLoginAt: "2020-01-01T00:00:00Z" },
    });
    expect(r.status).toBe(200);
    expect(H.createUser).toHaveBeenCalledTimes(1);
    expect(H.createUser.mock.calls[0][0]).not.toHaveProperty("lastLoginAt");
  });

  it("o contrato do storage.createUser não aceita o campo (checado pelo tsc dos testes)", () => {
    expectTypeOf<Parameters<typeof storage.createUser>[0]>().not.toHaveProperty("lastLoginAt");
  });

  it("o PATCH de usuário do admin não repassa o campo", async () => {
    const r = await chamar("PATCH /api/users/:id", { sessao: ADMIN, params: { id: "u-ana" }, body: { name: "Ana Maria", lastLoginAt: "2020-01-01T00:00:00Z" } });
    expect(r.status).toBe(200);
    expect(H.updateUser).toHaveBeenCalledTimes(1);
    expect(H.updateUser.mock.calls[0][1]).toEqual({ name: "Ana Maria" });
  });
});

describe("a coluna chega à tela de usuários", () => {
  it("GET /api/users manda o usuário inteiro menos o hash — o carimbo vai junto", async () => {
    const r = await chamar("GET /api/users", { sessao: ADMIN });
    expect(r.status).toBe(200);
    const [ana] = r.body as Array<Record<string, unknown>>;
    expect(ana.lastLoginAt).toEqual(new Date("2026-09-01T12:00:00Z"));
    expect(ana).not.toHaveProperty("passwordHash");
  });
});
