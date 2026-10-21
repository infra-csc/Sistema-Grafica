// ─────────────────────────────────────────────────────────────────────────────
// CRIA OS OPERADORES DE UM LOGIN COMPARTILHADO (dono, 21/10).
//
// Cria só os NOMES — sem PIN. No primeiro acesso, cada operador toca no
// próprio nome em "Quem está na máquina?" e cria o PIN dele. Idempotente: quem
// já existe no login (mesmo nome, sem diferenciar maiúsculas) é pulado; quem
// existe DESATIVADO é só avisado (reative pela tela de Usuários).
//
// Precisa da migração 0008 aplicada (tabela operadores): npm run db:migrate.
//
// Uso (DATABASE_URL do banco desejado no ambiente):
//   node scripts/criar-operadores.mjs <email-do-login> <nome1,nome2,...>            → SIMULAÇÃO
//   node scripts/criar-operadores.mjs <email-do-login> <nome1,nome2,...> --aplicar  → cria
//
// Exemplo:
//   node scripts/criar-operadores.mjs producaografica@ttkmarketing.com.br "Gilmar,Elias,Harisson" --aplicar
// ─────────────────────────────────────────────────────────────────────────────
import pg from "pg";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const posicionais = args.filter((a) => !a.startsWith("--"));
const desconhecidas = args.filter((a) => a.startsWith("--") && a !== "--aplicar");
if (desconhecidas.length || posicionais.length !== 2) {
  if (desconhecidas.length) console.error(`Opção desconhecida: ${desconhecidas.join(", ")}`);
  console.error('Uso: node scripts/criar-operadores.mjs <email-do-login> "Nome1,Nome2,..." [--aplicar]');
  process.exit(2);
}
const [email, listaDeNomes] = posicionais;

// As mesmas regras de nome de shared/operadores.ts (o script é .mjs puro).
const MAX = 40;
const nomes = [];
for (const cru of listaDeNomes.split(",")) {
  const nome = cru.trim().replace(/\s+/g, " ");
  if (!nome) continue;
  if (nome.length > MAX) { console.error(`Nome longo demais (máx. ${MAX}): "${nome}"`); process.exit(2); }
  if (/[()]/.test(nome)) { console.error(`O nome não pode ter parênteses: "${nome}"`); process.exit(2); }
  if (nomes.some((n) => n.toLowerCase() === nome.toLowerCase())) continue;
  nomes.push(nome);
}
if (nomes.length === 0) { console.error("Nenhum nome informado."); process.exit(2); }

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }
const host = (() => { try { return new URL(url).host; } catch { return "(url ilegível)"; } })();

const cliente = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await cliente.connect();
try {
  console.log(`Banco: ${host}`);
  const { rows: [tabela] } = await cliente.query(`SELECT to_regclass('public.operadores') IS NOT NULL AS existe`);
  if (!tabela.existe) {
    console.error("A tabela operadores não existe neste banco. Rode antes a migração: npm run db:migrate -- --aplicar");
    process.exitCode = 1;
  } else {
    const { rows: usuarios } = await cliente.query(
      `SELECT id, name, email, role FROM users WHERE lower(email) = lower($1) ORDER BY (email = $1) DESC LIMIT 1`,
      [email.trim()],
    );
    const login = usuarios[0];
    if (!login) {
      console.error(`Nenhum usuário com o e-mail ${email}.`);
      process.exitCode = 1;
    } else {
      console.log(`Login: ${login.name} <${login.email}> — perfil ${login.role}`);
      if (login.role !== "grafica") console.warn(`  (atenção: o perfil não é "grafica")`);
      const { rows: existentes } = await cliente.query(`SELECT id, nome, ativo, pin_hash IS NOT NULL AS tem_pin FROM operadores WHERE user_id = $1`, [login.id]);
      const criar = [];
      for (const nome of nomes) {
        const ja = existentes.find((o) => o.nome.toLowerCase() === nome.toLowerCase());
        if (!ja) { criar.push(nome); console.log(`  + ${nome} — será criado (sem PIN; cria no primeiro acesso)`); }
        else if (ja.ativo) console.log(`  = ${ja.nome} — já existe${ja.tem_pin ? " (com PIN)" : " (ainda sem PIN)"}; nada a fazer`);
        else console.log(`  ! ${ja.nome} — existe DESATIVADO; reative em Administração → Usuários → Operadores deste login`);
      }
      const outros = existentes.filter((o) => !nomes.some((n) => n.toLowerCase() === o.nome.toLowerCase()));
      if (outros.length) console.log(`  (já no login e fora da lista: ${outros.map((o) => `${o.nome}${o.ativo ? "" : " [desativado]"}`).join(", ")} — não mexo)`);

      if (!APLICAR) {
        console.log(`\nSIMULAÇÃO — nada foi gravado. ${criar.length} a criar. Rode de novo com --aplicar.`);
      } else if (criar.length === 0) {
        console.log("\nNada a criar.");
      } else {
        await cliente.query("BEGIN");
        for (const nome of criar) {
          const { rows: [op] } = await cliente.query(`INSERT INTO operadores (user_id, nome) VALUES ($1, $2) RETURNING id`, [login.id, nome]);
          await cliente.query(
            `INSERT INTO audit_logs (user_name, user_id, action, entity_type, entity_id, details) VALUES ($1, NULL, 'created', 'operador', $2, $3)`,
            ["Sistema", op.id, `Operador "${nome}" adicionado ao login "${login.name}" pelo script de carga — cria o próprio PIN no primeiro acesso`],
          );
        }
        await cliente.query("COMMIT");
        console.log(`\nFeito: ${criar.length} operador(es) criado(s). O login "${login.name}" passa a perguntar "Quem está na máquina?" no próximo acesso (quem já está com a tela aberta vê a pergunta na primeira gravação, em até 30 s).`);
      }
    }
  }
} catch (erro) {
  await cliente.query("ROLLBACK").catch(() => {});
  console.error("Falhou:", erro.message);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
