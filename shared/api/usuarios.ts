// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DE SESSÃO E USUÁRIOS (server/routes/auth.ts).
//
// O hash da senha NUNCA vai para o cliente: toda resposta de usuário é a
// linha sem `passwordHash`.
// ─────────────────────────────────────────────────────────────────────────────
import type { User } from "../schema";
import type { Json } from "./json";

/** Os perfis do sistema. */
export type PerfilDoUsuario = "admin" | "solicitacao" | "arte" | "grafica" | "atendimento";

/** A linha do usuário sem o hash, como chega pelo cabo. */
export type UsuarioSemSenha = Json<Omit<User, "passwordHash">>;

/**
 * GET /api/auth/me — o usuário da sessão.
 *
 * VER COMO (15/09): enquanto o admin navega como outro perfil, `role` e `kit`
 * são os da SESSÃO e `papelReal` é "admin"; fora disso `papelReal` é null.
 */
export type UsuarioDaSessao = UsuarioSemSenha & { papelReal: string | null };

/** Elemento de GET /api/users (só admin). */
export type UsuarioDaLista = UsuarioSemSenha;

/** Elemento de GET /api/users/basic — o que qualquer sessão pode ver. */
export interface UsuarioBasico { id: string; name: string; role: string }

/** POST /api/auth/login — corpo. A resposta é `UsuarioSemSenha`. */
export interface CorpoDoLogin { email: string; password: string }

/**
 * POST /api/auth/register (admin) — corpo. Sem `password`, o servidor gera uma
 * senha aleatória (usuário que entra por SSO).
 */
export interface CorpoNovoUsuario {
  name: string;
  email: string;
  role?: PerfilDoUsuario;
  kit?: boolean;
  password?: string;
  mustChangePassword?: boolean;
}

/** PATCH /api/users/:id (admin) — corpo parcial; `password` troca a senha e obriga a trocar no próximo login. */
export type CorpoEdicaoDeUsuario = Partial<CorpoNovoUsuario>;
