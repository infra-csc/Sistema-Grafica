// ─────────────────────────────────────────────────────────────────────────────
// DRIFT ENTRE O SCHEMA E O BANCO — só LÊ (nada é criado, alterado ou apagado).
//
// Compara shared/schema.ts (o que o código espera) com o banco de DATABASE_URL
// (information_schema / pg_catalog) e lista:
//   · FALTANDO no banco — tabela, coluna, índice ou sequência que o código usa
//     e o banco não tem (erro "column does not exist" em produção). A cura é
//     `npm run db:migrate -- --aplicar` (ou, num banco ainda não adotado, a
//     migração aditiva: node scripts/migracao-aditiva-producao.mjs)
//   · SOBRANDO no banco — o que existe lá e o schema não declara. CUIDADO: é
//     exatamente o que um `db:push` DERRUBARIA. Os índices criados por script
//     (busca trigram, performance) aparecem separados, como "criados por
//     script" — eles devem ficar.
//
// Roda com tsx (o schema é TypeScript):
//   npx tsx scripts/checar-drift.mjs                              ← DEV
//   DATABASE_URL="<produção>" npx tsx scripts/checar-drift.mjs
// Sai com código 1 se faltar algo no banco (serve de checagem antes do deploy).
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from "fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

let schema, pgCore;
try {
  schema = await import("../shared/schema.ts");
  pgCore = await import("drizzle-orm/pg-core");
} catch (erro) {
  console.error("Não deu para ler shared/schema.ts — rode com tsx: npx tsx scripts/checar-drift.mjs");
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
}
const { getTableConfig, PgTable, isPgSequence } = pgCore;

// ── O que o código declara ──────────────────────────────────────────────────
const esperado = new Map(); // tabela → { colunas:Set, indices:Set }
const sequenciasEsperadas = new Set();
for (const valor of Object.values(schema)) {
  if (valor instanceof PgTable) {
    const cfg = getTableConfig(valor);
    if ((cfg.schema ?? "public") !== "public") continue;
    esperado.set(cfg.name, {
      colunas: new Set(cfg.columns.map((c) => c.name)),
      indices: new Set(cfg.indexes.map((i) => i.config.name).filter(Boolean)),
    });
  } else if (isPgSequence?.(valor)) {
    sequenciasEsperadas.add(valor.seqName);
  }
}

// Índices criados por script ou por migração escrita à mão (fora do schema, de
// propósito): lidos dos próprios arquivos, para não virar "sobrando" nem ser
// confundido com lixo.
const porScript = new Set();
for (const pasta of ["./", "../migrations/"]) {
  let nomes = [];
  try { nomes = readdirSync(new URL(pasta, import.meta.url)); } catch { continue; }
  for (const arq of nomes) {
    if (!/\.(sql|ts|mjs)$/.test(arq) || arq === "checar-drift.mjs") continue;
    const texto = readFileSync(new URL(`${pasta}${arq}`, import.meta.url), "utf8");
    for (const m of texto.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?IF\s+NOT\s+EXISTS\s+"?([A-Za-z0-9_]+)"?/gi)) porScript.add(m[1]);
  }
}
// ── O que o banco tem ───────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
let colunasDoBanco, indicesDoBanco, sequenciasDoBanco, tabelasDoBanco;
try {
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  tabelasDoBanco = new Set((await client.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  )).rows.map((r) => r.table_name));
  colunasDoBanco = (await client.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  )).rows;
  // Índices que NÃO sustentam constraint (pkey/unique de coluna são do próprio
  // CREATE TABLE e não aparecem como índice no schema).
  indicesDoBanco = (await client.query(
    `SELECT t.relname AS tabela, i.relname AS indice, ix.indisvalid AS valido
       FROM pg_index ix
       JOIN pg_class i ON i.oid = ix.indexrelid
       JOIN pg_class t ON t.oid = ix.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public'
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid)`,
  )).rows;
  sequenciasDoBanco = new Set((await client.query(
    `SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public'`,
  )).rows.map((r) => r.sequence_name));
} finally {
  await client.end();
}

// ── Comparação ──────────────────────────────────────────────────────────────
const faltando = [];
const sobrando = [];
const deScript = [];
const invalidos = [];

for (const [tabela, { colunas, indices }] of esperado) {
  if (!tabelasDoBanco.has(tabela)) { faltando.push(`tabela ${tabela}`); continue; }
  const doBanco = new Set(colunasDoBanco.filter((c) => c.table_name === tabela).map((c) => c.column_name));
  for (const c of colunas) if (!doBanco.has(c)) faltando.push(`coluna ${tabela}.${c}`);
  for (const c of doBanco) if (!colunas.has(c)) sobrando.push(`coluna ${tabela}.${c}`);
  const idxDoBanco = new Set(indicesDoBanco.filter((i) => i.tabela === tabela).map((i) => i.indice));
  for (const i of indices) if (!idxDoBanco.has(i)) faltando.push(`índice ${tabela}.${i}`);
}
for (const t of tabelasDoBanco) if (!esperado.has(t)) sobrando.push(`tabela ${t}`);
for (const i of indicesDoBanco) {
  if (!i.valido) invalidos.push(`${i.tabela}.${i.indice}`);
  const declarado = esperado.get(i.tabela)?.indices.has(i.indice);
  if (declarado || !esperado.has(i.tabela)) continue;
  (porScript.has(i.indice) ? deScript : sobrando).push(`índice ${i.tabela}.${i.indice}`);
}
for (const s of sequenciasEsperadas) if (!sequenciasDoBanco.has(s)) faltando.push(`sequência ${s}`);

const secao = (titulo, lista) => {
  console.log(`\n${titulo} (${lista.length})`);
  for (const l of lista.sort()) console.log(`  · ${l}`);
};
secao("FALTANDO no banco — rode `npm run db:migrate -- --aplicar` (banco ainda não adotado: a migração aditiva)", faltando);
secao("SOBRANDO no banco — o schema não declara (um db:push derrubaria)", sobrando);
secao("Índices criados por script (fora do schema, de propósito — devem ficar)", deScript);
if (invalidos.length) secao("Índices INVÁLIDOS (CONCURRENTLY interrompido) — refazer à mão", invalidos);
console.log(faltando.length === 0 ? "\nNada faltando." : "\nHá itens faltando no banco.");
process.exit(faltando.length === 0 ? 0 : 1);
