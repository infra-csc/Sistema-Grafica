// Atua somente em banco cujo nome começa por grafica_import_.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';

const target = process.env.GRAFICA_IMPORT_DB;
assert.match(target ?? '', /^grafica_import_\d{8}$/);
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
url.pathname = `/${target}`;
const env = { ...process.env, DATABASE_URL: url.toString() };
const db = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10000 });
await db.connect();
try {
  const applied = (await db.query('SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at')).rows;
  const expected = readMigrationFiles({ migrationsFolder: '/app/migrations' });
  for (const row of applied) {
    const migration = expected.find(m => m.folderMillis === Number(row.created_at));
    assert.ok(migration && migration.hash === row.hash, 'Migração de origem desconhecida ou diferente do código.');
  }
  const migrated = spawnSync(process.execPath, ['scripts/migrar.mjs', '--aplicar'], { env, stdio: 'inherit' });
  assert.equal(migrated.status, 0, 'Migrações da cópia falharam.');
  const drift = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', '/app/scripts/checar-drift.mjs'], { env, stdio: 'inherit' });
  assert.equal(drift.status, 0, 'Estrutura da cópia diverge do código.');

  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const q = name => `"${name.replaceAll('"', '""')}"`;
  const tables = (await db.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('public','drizzle') AND table_type='BASE TABLE' ORDER BY 1,2")).rows;
  const counts = {};
  for (const t of tables) counts[`${t.table_schema}.${t.table_name}`] = (await db.query(`SELECT count(*)::int AS n FROM ${q(t.table_schema)}.${q(t.table_name)}`)).rows[0].n;
  for (const t of ['session','sso_tokens_de_troca','limite_de_tentativas','reservas_de_disparo']) assert.equal(counts[`public.${t}`], 0, `${t} deve iniciar vazia.`);
  const columns = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND column_name ~ '_urls?$' ORDER BY 1,2")).rows;
  const keys = new Set();
  const externalHosts = {};
  const otherBuckets = {};
  let references = 0;
  const legacyBuckets = new Set((process.env.LEGACY_PRIVATE_OBJECT_DIRS ?? '').split(',').map(p => p.split('/')[1]).filter(Boolean));
  for (const c of columns) {
    const rows = (await db.query(`SELECT ${q(c.column_name)} AS value FROM public.${q(c.table_name)} WHERE ${q(c.column_name)} IS NOT NULL`)).rows;
    for (const row of rows) for (const raw of Array.isArray(row.value) ? row.value : [row.value]) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      references++;
      if (raw.startsWith('/objects/')) {
        keys.add(`.private/${raw.slice('/objects/'.length).split('?')[0]}`);
        continue;
      }
      try {
        const parsed = new URL(raw);
        if (parsed.hostname === 'storage.googleapis.com') {
          const [, bucket, ...path] = decodeURIComponent(parsed.pathname).split('/');
          if (legacyBuckets.has(bucket) && path[0] === '.private') keys.add(path.join('/'));
          else otherBuckets[bucket] = (otherBuckets[bucket] ?? 0) + 1;
        } else externalHosts[parsed.hostname] = (externalHosts[parsed.hostname] ?? 0) + 1;
      } catch { /* Referências manuais/caminhos de rede não são objetos deste bucket. */ }
    }
  }
  const invalidIndexes = (await db.query("SELECT count(*)::int AS n FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT i.indisvalid")).rows[0].n;
  assert.equal(invalidIndexes, 0);
  const invalidConstraints = (await db.query("SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated")).rows[0].n;
  assert.equal(invalidConstraints, 0);
  await db.query('ROLLBACK');
  const report = { preparedAt: new Date().toISOString(), database: target, counts, invalidIndexes, invalidConstraints, references, uniquePrivateObjects: keys.size, externalHosts, otherBuckets };
  writeFileSync('/migration/copy-report.json', JSON.stringify(report,null,2), {mode:0o600});
  writeFileSync('/migration/object-manifest.json', JSON.stringify({ sourceBuckets:[...legacyBuckets], destinationBucket:process.env.R2_BUCKET, keys:[...keys].sort() },null,2), {mode:0o600});
  console.log(JSON.stringify(report,null,2));
} finally {await db.end();}
