// ─────────────────────────────────────────────────────────────────────────────
// CI DAS MIGRAÇÕES — as migrações de migrations/ reproduzem o schema?
//
// Sobe um Postgres VAZIO em memória (PGlite), aplica TODAS as migrações do
// zero com scripts/migrar.mjs e roda scripts/checar-drift.mjs contra ele.
// Falha se:
//   · alguma migração não roda num banco vazio;
//   · o banco resultante não tem tudo o que shared/schema.ts declara
//     (alguém mudou o schema e não rodou `npm run db:generate`);
//   · o banco resultante tem coluna/tabela/índice que o schema NÃO declara
//     (migração escrita à mão que divergiu do schema);
//   · a migração aditiva antiga (scripts/migracao-aditiva-producao.sql), rodada
//     por cima, ainda cria alguma coisa — sinal de que produção recebeu um
//     objeto que as migrações não sabem criar.
//
// Nada aqui toca banco de verdade: DATABASE_URL é ignorada.
// Precisa do PGlite na pasta de ferramentas (npm run ferramentas:instalar).
//   node scripts/ci-migracoes.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "child_process";
import { createRequire } from "module";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { isAbsolute, join, relative, resolve } from "path";
import pg from "pg";
import { subirBancoLocal } from "./local/banco-local.mjs";
import { RAIZ_DO_REPO } from "./local/ferramentas.mjs";

const exigir = createRequire(import.meta.url);
const TSX = exigir.resolve("tsx/cli");

const banco = await subirBancoLocal({ log: console.warn });
const env = { ...process.env, DATABASE_URL: banco.url };
let falhou = false;

// ASSÍNCRONO de propósito: o banco roda NESTE processo. Um spawnSync congelaria
// o laço de eventos e o filho esperaria para sempre por um banco parado.
function rodar(titulo, argumentos) {
  console.log(`\n── ${titulo} ${"─".repeat(Math.max(0, 70 - titulo.length))}`);
  return new Promise((ok) => {
    const filho = spawn(process.execPath, argumentos, { env, cwd: RAIZ_DO_REPO });
    let stdout = "";
    filho.stdout.on("data", (d) => { stdout += d; process.stdout.write(d); });
    filho.stderr.on("data", (d) => process.stderr.write(d));
    filho.on("close", (status) => ok({ status, stdout }));
  });
}

/** Retrato do catálogo: o que a migração aditiva poderia acrescentar. */
async function retrato() {
  const c = new pg.Client({ connectionString: banco.url });
  await c.connect();
  try {
    const q = async (sql) => (await c.query(sql)).rows.map((r) => Object.values(r).join("."));
    return new Set([
      ...(await q(`SELECT 'coluna', table_name, column_name, data_type, is_nullable, coalesce(column_default,'')
                     FROM information_schema.columns WHERE table_schema = 'public'`)),
      ...(await q(`SELECT 'indice', tablename, indexname FROM pg_indexes WHERE schemaname = 'public'`)),
      ...(await q(`SELECT 'extensao', extname FROM pg_extension`)),
      ...(await q(`SELECT 'sequencia', sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`)),
    ]);
  } finally {
    await c.end();
  }
}

try {
  // ── 0. O schema tem mudança que não virou migração? ────────────────────
  // drizzle-kit generate numa CÓPIA de migrations/: se ele achar o que gerar,
  // alguém mudou shared/schema.ts e esqueceu o `npm run db:generate`. (O
  // checar-drift abaixo vê coluna/índice faltando; este vê também tipo,
  // default, NOT NULL e chave estrangeira.)
  const copia = mkdtempSync(join(tmpdir(), "migracoes-"));
  cpSync(resolve(RAIZ_DO_REPO, "migrations"), copia, { recursive: true });
  const rel = relative(RAIZ_DO_REPO, copia);
  const gerar = await rodar("O schema tem mudança sem migração?", [
    resolve(RAIZ_DO_REPO, "node_modules", "drizzle-kit", "bin.cjs"), "generate", "--dialect", "postgresql",
    "--schema", "./shared/schema.ts", "--out", isAbsolute(rel) ? copia : rel,
  ]);
  const migracoesNovas = readdirSync(copia).filter((f) => f.endsWith(".sql")).length - readdirSync(resolve(RAIZ_DO_REPO, "migrations")).filter((f) => f.endsWith(".sql")).length;
  rmSync(copia, { recursive: true, force: true });
  if (gerar.status !== 0 || migracoesNovas !== 0) {
    falhou = true;
    console.error("\nshared/schema.ts mudou e a mudança NÃO está em migrations/. Rode `npm run db:generate`, revise o SQL e comite.");
  }

  const migrar = await rodar("Aplicando todas as migrações num banco vazio", [resolve(RAIZ_DO_REPO, "scripts/migrar.mjs"), "--aplicar"]);
  if (migrar.status !== 0) { falhou = true; throw new Error("as migrações não rodam num banco vazio"); }

  const drift = await rodar("Comparando com shared/schema.ts", [TSX, resolve(RAIZ_DO_REPO, "scripts/checar-drift.mjs")]);
  if (drift.status !== 0) {
    falhou = true;
    console.error("\nFALTA no banco criado pelas migrações algo que o schema declara. Rode `npm run db:generate` e comite o SQL.");
  }
  // "SOBRANDO" também é defeito AQUI (num banco de produção pode ser legado;
  // num banco que nasceu só das migrações, não).
  const sobrando = /SOBRANDO no banco[^(]*\((\d+)\)/.exec(drift.stdout ?? "");
  if (sobrando && Number(sobrando[1]) > 0) {
    falhou = true;
    console.error(`\nAs migrações criam ${sobrando[1]} objeto(s) que o schema não declara (lista acima).`);
  }

  console.log("\n── A migração aditiva antiga ainda acrescentaria algo? ─────────────────");
  const antes = await retrato();
  const c = new pg.Client({ connectionString: banco.url });
  await c.connect();
  try {
    await c.query(readFileSync(resolve(RAIZ_DO_REPO, "scripts/migracao-aditiva-producao.sql"), "utf8"));
  } finally {
    await c.end();
  }
  const depois = await retrato();
  const novos = [...depois].filter((x) => !antes.has(x));
  if (novos.length) {
    falhou = true;
    console.error("A migração aditiva criou o que as migrações não criam — leve isto para uma migração:");
    for (const n of novos) console.error(`  · ${n}`);
  } else {
    console.log("Nada — as migrações cobrem tudo o que produção recebeu pela aditiva.");
  }

  // ── O modo de adoção, no mesmo banco fingindo ser produção ─────────────
  // Sem o registro das migrações, este banco fica igual a produção hoje:
  // schema completo, nascido de db:push, nenhuma migração registrada.
  const sql = async (texto) => {
    const k = new pg.Client({ connectionString: banco.url });
    await k.connect();
    try { await k.query(texto); } finally { await k.end(); }
  };
  const MIGRAR = resolve(RAIZ_DO_REPO, "scripts/migrar.mjs");
  const esperar = (r, codigo, oque) => {
    if (r.status !== codigo) { falhou = true; console.error(`\nFALHOU: ${oque} (saiu com ${r.status}, esperado ${codigo})`); }
  };
  await sql(`DROP SCHEMA drizzle CASCADE`);
  esperar(await rodar("Adoção: sem --adotar, um banco de db:push é recusado", [MIGRAR, "--aplicar"]), 1, "a base rodaria sobre um banco já existente");
  esperar(await rodar("Adoção: --adotar --aplicar", [MIGRAR, "--adotar", "--aplicar"]), 0, "a adoção de um banco completo");
  esperar(await rodar("Adoção: depois dela, nada pendente", [MIGRAR, "--aplicar"]), 0, "rodar de novo depois da adoção");
  esperar(await rodar("Adoção: uma segunda adoção é recusada", [MIGRAR, "--adotar"]), 1, "adotar duas vezes");
  await sql(`DROP SCHEMA drizzle CASCADE; ALTER TABLE items DROP COLUMN embalada_qty`);
  esperar(await rodar("Adoção: banco incompleto é recusado", [MIGRAR, "--adotar", "--aplicar"]), 1, "adotar um banco com coluna faltando");
} catch (erro) {
  console.error(`\nERRO: ${erro instanceof Error ? erro.message : erro}`);
  falhou = true;
} finally {
  await banco.parar();
}

console.log(falhou ? "\nCI das migrações: FALHOU." : "\nCI das migrações: ok.");
process.exit(falhou ? 1 : 0);
