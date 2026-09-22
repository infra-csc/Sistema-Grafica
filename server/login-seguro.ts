// ─────────────────────────────────────────────────────────────────────────────
// Peças do login que precisam ser iguais em todo caminho de entrada (senha,
// cadastro, SSO) e testáveis sem subir o servidor.
// ─────────────────────────────────────────────────────────────────────────────
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { users, type User } from "@shared/schema";

/** Senha de quem é cadastrado sem senha (entra por SSO): aleatória, nunca fixa. */
export function senhaAleatoria(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * E-mail sem diferenciar maiúsculas: "Ana@Norte.com" e "ana@norte.com" são a
 * mesma conta. Se o banco tiver duas grafias (legado), a exata vence.
 */
export async function buscarUsuarioPorEmail(email: string): Promise<User | undefined> {
  const limpo = email.trim();
  const [u] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${limpo})`)
    .orderBy(sql`(${users.email} = ${limpo}) desc`)
    .limit(1);
  return u;
}

// Hash de uma senha que ninguém conhece: o login de e-mail inexistente compara
// contra ele, para levar o mesmo tempo que "senha errada" e não revelar quem
// tem conta.
let hashFicticio: Promise<string> | null = null;
export function hashParaTempoConstante(): Promise<string> {
  if (!hashFicticio) hashFicticio = bcrypt.hash(senhaAleatoria(), 10);
  return hashFicticio;
}

/** Confere a senha; sem usuário, gasta o mesmo tempo e devolve false. */
export async function conferirSenha(senha: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (!passwordHash) {
    await bcrypt.compare(senha, await hashParaTempoConstante());
    return false;
  }
  return bcrypt.compare(senha, passwordHash);
}
