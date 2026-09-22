// ─────────────────────────────────────────────────────────────────────────────
// SESSÃO VÁLIDA — o que o cookie sozinho não garante.
//
// A sessão é "rolling": cada requisição renova os 7 dias, então quem usa o
// sistema todo dia nunca precisaria logar de novo. Aqui entram duas travas:
//   · teto absoluto: 30 dias desde o login, renovando ou não;
//   · o usuário ainda existe (excluído não segue navegando com a sessão velha
//     de outra réplica ou de antes da exclusão). Consulta com cache curto.
// ─────────────────────────────────────────────────────────────────────────────
import type { Request, Response, NextFunction } from "express";

declare module "express-session" {
  interface SessionData {
    /** Momento do login (ms). Base do teto absoluto da sessão. */
    loginEm?: number;
  }
}

export const TETO_DA_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;
export const CACHE_USUARIO_MS = 60 * 1000;

type Existe = (userId: string) => Promise<boolean>;

/** Cache de "o usuário existe?" por processo; a exclusão limpa na hora. */
export function criarVerificadorDeUsuario(consultar: Existe, agora: () => number = Date.now) {
  const cache = new Map<string, { existe: boolean; ate: number }>();
  return {
    async existe(userId: string): Promise<boolean> {
      const t = agora();
      const c = cache.get(userId);
      if (c && c.ate > t) return c.existe;
      const existe = await consultar(userId);
      cache.set(userId, { existe, ate: t + CACHE_USUARIO_MS });
      if (cache.size > 5000) {
        cache.forEach((v, k) => { if (v.ate <= t) cache.delete(k); });
      }
      return existe;
    },
    esquecer(userId: string) {
      cache.delete(userId);
    },
  };
}

/** A sessão passou do teto? Sessão antiga sem carimbo ganha o carimbo agora. */
export function sessaoVencida(sessao: { loginEm?: number }, agora: number): boolean {
  if (typeof sessao.loginEm !== "number" || !Number.isFinite(sessao.loginEm)) {
    sessao.loginEm = agora;
    return false;
  }
  return agora - sessao.loginEm > TETO_DA_SESSAO_MS;
}

/**
 * Middleware: roda antes de qualquer rota. Sessão vencida ou de usuário que não
 * existe mais é destruída e a requisição segue como NÃO autenticada — as
 * guardas (requireAuth e cia.) respondem 401 como sempre.
 */
export function validarSessao(verificador: { existe: Existe }, agora: () => number = Date.now) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const sessao = req.session;
    if (!sessao?.userId) return next();
    try {
      const vencida = sessaoVencida(sessao, agora());
      const existe = vencida ? true : await verificador.existe(sessao.userId);
      if (!vencida && existe) return next();
      await new Promise<void>((ok) => sessao.destroy(() => ok()));
      // destroy() tira req.session; sem ela as guardas veem "não autenticado".
      next();
    } catch (erro) {
      // Banco fora do ar não pode virar "todo mundo deslogado" nem liberar
      // quem não devia: segue o fluxo normal, e a rota decide.
      console.error("[sessao] falha ao validar a sessão:", erro);
      next();
    }
  };
}
