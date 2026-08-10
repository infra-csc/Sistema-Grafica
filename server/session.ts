// Configuração de sessão centralizada. Extraída de server/index.ts para que
// o mesmo middleware possa ser reutilizado na autenticação do handshake do
// WebSocket (ver server/routes.ts) — antes o /ws aceitava qualquer conexão.
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";

// Fail fast: nunca cair em um segredo hardcoded. Tanto a sessão quanto a
// verificação do JWT de SSO dependem de segredos reais fornecidos pelo operador.
const rawSessionSecret = process.env.SESSION_SECRET;
if (!rawSessionSecret) {
  console.error(
    "FATAL: SESSION_SECRET não está definido. Defina a variável de ambiente SESSION_SECRET antes de iniciar o servidor.",
  );
  process.exit(1);
}
// Após o guard acima, o tipo é garantidamente string (process.exit → never).
export const SESSION_SECRET: string = rawSessionSecret;

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: "session",
    createTableIfMissing: true,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  // Sem `rolling`, o maxAge conta a partir do login e não da última atividade:
  // quem usa o sistema todo dia era desconectado no sétimo dia sem motivo. Com
  // ele, a janela de 7 dias reinicia a cada requisição.
  rolling: true,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  },
});
