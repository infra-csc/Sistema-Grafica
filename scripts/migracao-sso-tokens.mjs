// Roda scripts/migracao-sso-tokens.sql no banco de DATABASE_URL.
// Só CRIA (IF NOT EXISTS). Uso: node scripts/migracao-sso-tokens.mjs
import { readFileSync } from "fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }
const sql = readFileSync(new URL("./migracao-sso-tokens.sql", import.meta.url), "utf8");
const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query(sql);
  const r = await client.query("SELECT to_regclass('public.sso_tokens_de_troca') AS tabela");
  console.log(r.rows[0].tabela ? "OK: sso_tokens_de_troca existe." : "ATENÇÃO: a tabela não apareceu.");
} catch (erro) {
  console.error("Falhou:", erro.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
