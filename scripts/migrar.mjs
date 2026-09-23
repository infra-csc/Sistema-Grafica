// ─────────────────────────────────────────────────────────────────────────────
// MIGRAÇÕES VERSIONADAS — o executor.
//
// Aplica, no banco de DATABASE_URL, as migrações de migrations/ que ainda não
// rodaram lá. O controle é a MESMA tabela do drizzle
// ("drizzle"."__drizzle_migrations"), com a mesma regra dele: uma migração
// está aplicada quando o banco tem um registro com created_at >= o `when` dela
// no migrations/meta/_journal.json. (Assim `drizzle-kit migrate` e este script
// enxergam o mesmo estado.)
//
// POR QUE UM EXECUTOR PRÓPRIO E NÃO `drizzle-kit migrate`:
//   · SIMULAÇÃO POR PADRÃO — sem `--aplicar`, só diz o que faria;
//   · MODO DE ADOÇÃO — produção e dev nasceram de `db:push` + migração aditiva
//     e JÁ TÊM o schema inteiro. Executar a migração de base lá tentaria criar
//     tabela que existe. `--adotar` confere com scripts/checar-drift.mjs que
//     não falta nada e só então MARCA a base como aplicada, sem executá-la;
//   · RECUSA o erro óbvio — rodar a base num banco que já tem tabelas.
//
// USO
//   npm run db:migrate                         → simulação: lista o pendente
//   npm run db:migrate -- --aplicar            → aplica o pendente
//   npm run db:migrate -- --adotar             → simulação da adoção
//   npm run db:migrate -- --adotar --aplicar   → adota (uma vez por banco) e
//                                                aplica o que vier depois da base
//
// Cada execução com --aplicar roda numa transação só: ou entram todas as
// pendentes, ou nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { readMigrationFiles } from "drizzle-orm/migrator";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PASTA = resolve(RAIZ, "migrations");
const TABELA = `"drizzle"."__drizzle_migrations"`;

const args = new Set(process.argv.slice(2));
const APLICAR = args.has("--aplicar");
const ADOTAR = args.has("--adotar");
const SILENCIOSO = args.has("--silencioso");
for (const a of args) {
  if (!["--aplicar", "--adotar", "--silencioso"].includes(a)) {
    console.error(`Opção desconhecida: ${a}\nUso: node scripts/migrar.mjs [--adotar] [--aplicar]`);
    process.exit(2);
  }
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

const diga = (...x) => { if (!SILENCIOSO) console.log(...x); };
const hostDoBanco = (() => { try { return new URL(url).host; } catch { return "(url ilegível)"; } })();

// ── As migrações do repositório ────────────────────────────────────────────
const journal = (await import("fs")).readFileSync(resolve(PASTA, "meta", "_journal.json"), "utf8");
const entradas = JSON.parse(journal).entries;
const arquivos = readMigrationFiles({ migrationsFolder: PASTA }).map((m, i) => ({ ...m, tag: entradas[i].tag }));
if (arquivos.length === 0) { console.error("migrations/ está vazia."); process.exit(1); }
const base = arquivos[0];

// ── O estado do banco ──────────────────────────────────────────────────────
const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
});
await client.connect();

let codigo = 0;
try {
  const { rows: [{ existe }] } = await client.query(
    `SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS existe`,
  );
  const aplicadas = existe
    ? (await client.query(`SELECT hash, created_at FROM ${TABELA} ORDER BY created_at`)).rows
    : [];
  const ultima = aplicadas.length ? Number(aplicadas[aplicadas.length - 1].created_at) : null;
  const { rows: [{ tabelas }] } = await client.query(
    `SELECT count(*)::int AS tabelas FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );

  diga(`Banco: ${hostDoBanco}`);
  diga(`Tabelas no schema public: ${tabelas} · migrações registradas: ${aplicadas.length}`);

  // Arquivo de migração editado depois de aplicado: o drizzle não liga (só
  // olha a data), mas é quase sempre engano — o banco NÃO recebeu a edição.
  for (const a of arquivos) {
    const noBanco = aplicadas.find((x) => Number(x.created_at) === a.folderMillis);
    if (noBanco && noBanco.hash !== a.hash) {
      console.warn(`ATENÇÃO: ${a.tag} foi editada depois de aplicada neste banco (hash diferente). ` +
        `A edição NÃO chegou aqui — mudança de schema vai numa migração NOVA (npm run db:generate).`);
    }
  }

  let pendentes = arquivos.filter((a) => ultima === null || a.folderMillis > ultima);

  if (ADOTAR) {
    if (aplicadas.length > 0) {
      console.error("\nEste banco já tem migrações registradas — já foi adotado ou criado por migração. Rode sem --adotar.");
      process.exit(1);
    }
    if (tabelas === 0) {
      console.error("\nBanco vazio: não há o que adotar. Rode sem --adotar para criar tudo pela migração de base.");
      process.exit(1);
    }
    diga(`\nADOÇÃO: conferindo que o banco já tem tudo o que a base (${base.tag}) cria…`);
    const exigir = createRequire(import.meta.url);
    const drift = spawnSync(process.execPath, [exigir.resolve("tsx/cli"), resolve(RAIZ, "scripts", "checar-drift.mjs")], {
      env: process.env,
      encoding: "utf8",
    });
    diga(drift.stdout?.trim() ?? "");
    if (drift.status !== 0) {
      console.error(drift.stderr ?? "");
      console.error(
        "\nADOÇÃO RECUSADA: falta coisa no banco (lista acima). A base não pode ser dada como aplicada " +
        "sobre um banco incompleto. Rode a migração aditiva (node scripts/migracao-aditiva-producao.mjs), " +
        "confira de novo com `npm run db:drift` e repita a adoção.",
      );
      process.exit(1);
    }
    diga(`\nNada faltando. ${base.tag} será MARCADA como aplicada, sem executar.`);
    pendentes = arquivos.slice(1);
  } else if (aplicadas.length === 0 && tabelas > 0) {
    console.error(
      `\nEste banco já tem ${tabelas} tabelas, mas nenhuma migração registrada: ele nasceu de db:push. ` +
      `Executar a base aqui tentaria recriar tudo.\nUse a adoção (uma vez): npm run db:migrate -- --adotar --aplicar`,
    );
    process.exit(1);
  }

  if (pendentes.length === 0 && !ADOTAR) {
    diga("\nNenhuma migração pendente. O banco está em dia com migrations/.");
  } else {
    diga(`\n${ADOTAR ? "Depois da adoção, a executar" : "Pendentes"} (${pendentes.length}):`);
    for (const p of pendentes) {
      const instrucoes = p.sql.filter((s) => s.trim()).length;
      diga(`  · ${p.tag} — ${instrucoes} instrução(ões)`);
    }
  }

  if (!APLICAR) {
    diga("\nSIMULAÇÃO — nada foi gravado. Para valer, repita com --aplicar.");
  } else if (pendentes.length > 0 || ADOTAR) {
    await client.query("BEGIN");
    try {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
      await client.query(
        `CREATE TABLE IF NOT EXISTS ${TABELA} (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`,
      );
      if (ADOTAR) {
        await client.query(`INSERT INTO ${TABELA} (hash, created_at) VALUES ($1, $2)`, [base.hash, base.folderMillis]);
        diga(`  ✓ ${base.tag} (adotada — não executada)`);
      }
      for (const p of pendentes) {
        for (const instrucao of p.sql) {
          if (instrucao.trim()) await client.query(instrucao);
        }
        await client.query(`INSERT INTO ${TABELA} (hash, created_at) VALUES ($1, $2)`, [p.hash, p.folderMillis]);
        diga(`  ✓ ${p.tag}`);
      }
      await client.query("COMMIT");
      diga("\nMigrações aplicadas.");
    } catch (erro) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`\nFALHOU — nada foi gravado (transação desfeita): ${erro instanceof Error ? erro.message : erro}`);
      codigo = 1;
    }
  }
} finally {
  await client.end();
}
process.exit(codigo);
