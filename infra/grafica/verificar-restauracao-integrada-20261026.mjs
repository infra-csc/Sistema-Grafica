// Somente leitura. Destinos explícitos desta atualização; não consulta o Neon.
import assert from 'node:assert/strict';
import pg from 'pg';
const source = 'grafica_import_20261026';
const restored = 'grafica_restore_integrada_20261026';
const base = new URL(process.env.DATABASE_URL);
assert.equal(base.hostname, 'postgres');
const ident = s => '"' + s.replaceAll('"', '""') + '"';
async function inventory(name) {
  const url = new URL(base); url.pathname = '/' + name;
  const db = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
  await db.connect();
  try {
    await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await db.query("SET LOCAL statement_timeout = '60s'");
    const tables = (await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','drizzle') ORDER BY 1,2")).rows;
    const out = [];
    for (const t of tables) {
      const result = (await db.query(`SELECT count(*)::text AS registros, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text),'')) AS hash FROM ${ident(t.table_schema)}.${ident(t.table_name)} t`)).rows[0];
      out.push({ tabela: `${t.table_schema}.${t.table_name}`, ...result });
    }
    await db.query('ROLLBACK'); return out;
  } finally { await db.end(); }
}
const original = await inventory(source);
const copy = await inventory(restored);
assert.deepEqual(copy, original, 'Restauração precisa preservar todas as tabelas e registros');
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), source, restored, tables: original.length, identical: true, result: 'OK' }));
