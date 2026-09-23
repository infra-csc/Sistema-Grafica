// ─────────────────────────────────────────────────────────────────────────────
// SSO DO PORTAL — o JWT que chega na URL e o token de troca de uso único.
//
// O token de troca vivia num Map do processo: no Autoscale, o redirect podia
// cair numa réplica e o POST de troca em outra (login falhava ao acaso), e o
// token ficava legível em memória. Agora vai para a tabela sso_tokens_de_troca,
// só o hash, com validade de 60 s e consumo atômico (DELETE … RETURNING).
// Se a tabela ainda não existir no banco (SQL não rodado), cai no Map antigo
// com aviso no log — produção não quebra por falta da migração.
// ─────────────────────────────────────────────────────────────────────────────
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "crypto";

export const VIDA_DO_TOKEN_DE_TROCA_MS = 60_000;

/** Regras fixas do JWT do portal: só HS256, emissor certo, emitido há pouco. */
export const OPCOES_DO_JWT_DO_PORTAL: jwt.VerifyOptions = {
  algorithms: ["HS256"],
  issuer: "norte-portal",
  maxAge: "5m",
  clockTolerance: 30,
};

export function verificarJwtDoPortal(token: string, segredo: string): { email?: string } {
  return jwt.verify(token, segredo, OPCOES_DO_JWT_DO_PORTAL) as { email?: string };
}

const hashDoToken = (t: string) => createHash("sha256").update(t).digest("hex");

/** Só o RETURNING do consumir lê as linhas (user_id, expira_em). */
type Consulta = (sql: string, params: unknown[]) => Promise<{ rows: Array<{ user_id?: unknown; expira_em: string | number | Date }> }>;

const TABELA_AUSENTE = "42P01";

export function criarTrocaDeSso(consultar: Consulta, agora: () => number = Date.now) {
  const memoria = new Map<string, { userId: string; expira: number }>();
  let avisou = false;
  const semTabela = (erro: unknown) => {
    const codigo = typeof erro === "object" && erro !== null ? (erro as { code?: unknown }).code : undefined;
    if (codigo !== TABELA_AUSENTE) return false;
    if (!avisou) {
      avisou = true;
      console.warn("[SSO] tabela sso_tokens_de_troca não existe — usando memória do processo. Rode o SQL da migração.");
    }
    return true;
  };

  return {
    /** Cria o token de troca para o usuário e devolve o texto que vai na URL. */
    async emitir(userId: string): Promise<string> {
      const token = randomBytes(32).toString("hex");
      const expira = agora() + VIDA_DO_TOKEN_DE_TROCA_MS;
      try {
        await consultar("DELETE FROM sso_tokens_de_troca WHERE expira_em < now()", []);
        await consultar(
          "INSERT INTO sso_tokens_de_troca (token_hash, user_id, expira_em) VALUES ($1, $2, $3)",
          [hashDoToken(token), userId, new Date(expira)],
        );
      } catch (erro) {
        if (!semTabela(erro)) throw erro;
        memoria.forEach((v, k) => { if (v.expira < agora()) memoria.delete(k); });
        memoria.set(hashDoToken(token), { userId, expira });
      }
      return token;
    },

    /** Consome o token (uso único). Devolve o userId, ou null se inválido/vencido. */
    async consumir(token: string): Promise<string | null> {
      if (typeof token !== "string" || !token) return null;
      const h = hashDoToken(token);
      try {
        const { rows } = await consultar(
          "DELETE FROM sso_tokens_de_troca WHERE token_hash = $1 RETURNING user_id, expira_em",
          [h],
        );
        const linha = rows[0];
        if (!linha) return memoriaConsumir(h);
        return new Date(linha.expira_em).getTime() >= agora() ? String(linha.user_id) : null;
      } catch (erro) {
        if (!semTabela(erro)) throw erro;
        return memoriaConsumir(h);
      }
    },
  };

  function memoriaConsumir(h: string): string | null {
    const e = memoria.get(h);
    memoria.delete(h);
    return e && e.expira >= agora() ? e.userId : null;
  }
}
