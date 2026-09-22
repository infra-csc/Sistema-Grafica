// Contas criadas pela tela de usuários SEM senha ganhavam, sem ninguém saber,
// a senha fixa "sso_placeholder_pw" (o texto estava no código). Este script
// acha essas contas e troca a senha por uma aleatória que ninguém conhece.
//
// Uso (DATABASE_URL de produção no ambiente):
//   node scripts/corrigir-senha-placeholder.mjs            → SIMULAÇÃO: só lista
//   node scripts/corrigir-senha-placeholder.mjs --aplicar  → troca e derruba sessões
//
// Quem entra pelo portal (SSO) não usa senha: nada muda para essas pessoas.
// Quem entrava com a senha fixa perde esse acesso — é o objetivo.
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

const SENHA_FIXA = "sso_placeholder_pw";
const aplicar = process.argv.includes("--aplicar");
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

const cliente = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await cliente.connect();
try {
  const { rows } = await cliente.query("SELECT id, email, password_hash FROM users ORDER BY email");
  const afetadas = [];
  for (const u of rows) {
    if (u.password_hash && (await bcrypt.compare(SENHA_FIXA, u.password_hash))) afetadas.push(u);
  }
  console.log(`${afetadas.length} de ${rows.length} contas usam a senha fixa.`);
  for (const u of afetadas) console.log(`  - ${u.email}`);

  if (!aplicar) {
    console.log("\nSIMULAÇÃO — nada foi alterado. Rode com --aplicar para trocar as senhas.");
  } else {
    for (const u of afetadas) {
      const hash = await bcrypt.hash(randomBytes(32).toString("base64url"), 10);
      await cliente.query("BEGIN");
      await cliente.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2", [hash, u.id]);
      await cliente.query("DELETE FROM session WHERE (sess->>'userId') = $1", [u.id]);
      await cliente.query("COMMIT");
    }
    console.log(`\nFeito: ${afetadas.length} senhas trocadas e sessões dessas contas encerradas.`);
  }
} catch (erro) {
  await cliente.query("ROLLBACK").catch(() => {});
  console.error("Falhou:", erro.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
