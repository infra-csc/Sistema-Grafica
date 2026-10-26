// Executado no app de homologação: leitura dos bancos, sem alterar registros.
import assert from 'node:assert/strict';
import pg from 'pg';

const origem = new URL(process.env.DATABASE_URL);
assert.equal(origem.hostname, 'postgres');
assert.equal(origem.pathname, '/grafica_import_20261008');
const teste = process.env.GRAFICA_RESTORE_TEST_DB;
assert.match(teste ?? '', /^grafica_restorecheck_\d{8}_\d{6}$/);
const ident = value => `"${value.replaceAll('"', '""')}"`;
async function inventario(database) {
  const url = new URL(origem);
  url.pathname = `/${database}`;
  const db = new pg.Client({connectionString: url.toString(), connectionTimeoutMillis: 10000});
  try {
    await db.connect();
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL statement_timeout = '60s'");
    const tables = (await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','drizzle') ORDER BY 1,2")).rows;
    const out = [];
    for (const t of tables) {
      const r = (await db.query(`SELECT count(*)::text AS registros, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) AS checksum FROM ${ident(t.table_schema)}.${ident(t.table_name)} t`)).rows[0];
      out.push({tabela: `${t.table_schema}.${t.table_name}`, ...r});
    }
    await db.query('ROLLBACK');
    return out;
  } finally { await db.end(); }
}
const [source, restored] = await Promise.all([inventario(origem.pathname.slice(1)), inventario(teste)]);
assert.deepEqual(restored.map(t=>t.tabela), source.map(t=>t.tabela), 'Tabelas diferentes');
const differences = source.filter((t,i)=>t.registros !== restored[i].registros || t.checksum !== restored[i].checksum).map(t=>t.tabela);
const critical = ['public.users','public.events','public.items'];
assert.equal(differences.filter(t=>critical.includes(t)).length, 0, 'Dados centrais diferentes');
console.log(JSON.stringify({conferidoEm:new Date().toISOString(), bancoOrigem:origem.pathname.slice(1), bancoRestaurado:teste,
  tabelas:source.length, tabelasIdenticas:source.length-differences.length, diferencas: differences,
  dadosCentrais:source.filter(t=>critical.includes(t.tabela)), restauracao:'OK'}, null,2));
// A comparação lê a origem depois do dump: jobs concorrentes podem atualizar
// tabelas operacionais. Toda diferença deve ser relatada, nunca ocultada.
