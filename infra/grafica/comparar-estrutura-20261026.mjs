// Compara somente metadados de duas cópias locais; não altera o banco.
import assert from 'node:assert/strict';
import pg from 'pg';
const base = new URL(process.env.DATABASE_URL);
assert.equal(base.hostname, 'postgres');
async function columns(name) {
  const url = new URL(base); url.pathname = '/' + name;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  try {
    await db.query('BEGIN READ ONLY');
    return (await db.query("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,column_name")).rows;
  } finally { await db.end(); }
}
const previous = await columns('grafica_import_20261014');
const current = await columns('grafica_import_20261026');
const key = x => x.table_name + '.' + x.column_name;
const old = new Map(previous.map(x => [key(x), x]));
const now = new Map(current.map(x => [key(x), x]));
console.log(JSON.stringify({ checkedAt: new Date().toISOString(),
  newColumns: current.filter(x => !old.has(key(x))),
  removedColumns: previous.filter(x => !now.has(key(x))),
  changedColumns: current.filter(x => old.has(key(x)) && JSON.stringify(x) !== JSON.stringify(old.get(key(x)))).map(x => ({ before: old.get(key(x)), after: x }))
}, null, 2));
