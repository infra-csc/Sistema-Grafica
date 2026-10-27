// Somente leitura; não imprime senhas, nomes de usuários ou URLs de arquivos.
import pg from 'pg';
const source = new URL(process.env.SOURCE_DATABASE_URL);
source.searchParams.delete('sslmode');
const db = new pg.Client({ connectionString: source.toString(), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
await db.connect();
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout = '30s'");
  const info = (await db.query("SELECT current_database() AS database, current_setting('server_version') AS version, pg_database_size(current_database()) AS bytes")).rows[0];
  const schemas = (await db.query("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' ORDER BY 1")).rows;
  const extensions = (await db.query('SELECT extname, extversion FROM pg_extension ORDER BY 1')).rows;
  const tables = (await db.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema IN ('public','drizzle') ORDER BY 1,2")).rows;
  const counts = {};
  for (const table of tables) {
    const q = s => `"${s.replaceAll('"','""')}"`;
    counts[`${table.table_schema}.${table.table_name}`] = (await db.query(`SELECT count(*)::int AS n FROM ${q(table.table_schema)}.${q(table.table_name)}`)).rows[0].n;
  }
  console.log(JSON.stringify({ inspectedAt: new Date().toISOString(), ...info, schemas, extensions, counts },null,2));
  await db.query('ROLLBACK');
} finally {await db.end();}
