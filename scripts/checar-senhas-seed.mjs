// Lista quais contas ainda usam a senha do cadastro inicial (SEED_PASSWORD),
// que por muito tempo foi recriada a cada boot. Só LÊ — não altera nada.
//
// A senha NÃO fica no repositório: passe pela variável de ambiente.
//   SENHA_ANTIGA='...' node scripts/checar-senhas-seed.mjs
// (DATABASE_URL de produção no ambiente.)
//
// Quem aparecer na lista deve trocar a senha (ou o admin redefine pela tela
// de usuários, o que derruba as sessões da pessoa).
import pg from "pg";
import bcrypt from "bcryptjs";

const senha = process.env.SENHA_ANTIGA;
const url = process.env.DATABASE_URL;
if (!senha) { console.error("Defina SENHA_ANTIGA com a senha a conferir."); process.exit(1); }
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

const cliente = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await cliente.connect();
try {
  const { rows } = await cliente.query("SELECT email, role, last_login_at, password_hash FROM users ORDER BY email");
  const usando = [];
  for (const u of rows) {
    if (u.password_hash && (await bcrypt.compare(senha, u.password_hash))) usando.push(u);
  }
  console.log(`${usando.length} de ${rows.length} contas ainda usam essa senha.`);
  for (const u of usando) {
    const ultimo = u.last_login_at ? new Date(u.last_login_at).toISOString().slice(0, 10) : "sem registro";
    console.log(`  - ${u.email} (${u.role}, último login: ${ultimo})`);
  }
} catch (erro) {
  console.error("Falhou:", erro.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
