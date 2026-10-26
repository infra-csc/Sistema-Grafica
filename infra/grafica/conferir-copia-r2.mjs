// Somente leitura do banco importado e do R2; escreve apenas relatórios locais.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
assert.match(process.env.GRAFICA_IMPORT_DB ?? '', /^grafica_import_\d{8}$/);
url.pathname = `/${process.env.GRAFICA_IMPORT_DB}`;
assert.equal(process.env.R2_BUCKET, 'grafica-homolog-arquivos');
assert.equal(process.env.R2_ACCOUNT_ID, 'e317b932bc90d8c0bcca5b96769a3d1d');
const db = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
const s3 = new S3Client({ region: 'auto', forcePathStyle: true,
  endpoint: 'https://e317b932bc90d8c0bcca5b96769a3d1d.r2.cloudflarestorage.com',
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestHandler: { connectionTimeout: 5000, socketTimeout: 30000 } });
const q = v => `"${v.replaceAll('"', '""')}"`;
try {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout = '30s'");
  const fields = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND (column_name ~ '_urls?$' OR (table_name,column_name) IN (('kit_remessas','arquivo'),('tubo_itens','fotos'),('tubos','fotos_fechamento'))) ORDER BY 1,2")).rows;
  const buckets = new Set((process.env.LEGACY_PRIVATE_OBJECT_DIRS ?? '').split(',').map(p => p.split('/')[1]).filter(Boolean));
  const keys = new Set();
  let values = 0, external = 0;
  for (const f of fields) {
    const rows = (await db.query(`SELECT ${q(f.column_name)} AS value FROM public.${q(f.table_name)} WHERE ${q(f.column_name)} IS NOT NULL`)).rows;
    for (const row of rows) for (const raw of Array.isArray(row.value) ? row.value : [row.value]) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      values++;
      if (raw.startsWith('/objects/')) { keys.add(`.private/${raw.slice(9).split('?')[0]}`); continue; }
      try {
        const parsed = new URL(raw);
        const [, bucket, ...path] = decodeURIComponent(parsed.pathname).split('/');
        if (parsed.hostname === 'storage.googleapis.com' && buckets.has(bucket) && path[0] === '.private') keys.add(path.join('/'));
        else external++;
      } catch { external++; }
    }
  }
  await db.query('ROLLBACK');
  let token;
  const stored = new Set();
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, ContinuationToken: token }));
    for (const o of r.Contents ?? []) stored.add(o.Key);
    token = r.NextContinuationToken;
  } while (token);
  const missing = [...keys].filter(k => !stored.has(k)).sort();
  const report = { checkedAt: new Date().toISOString(), database: process.env.GRAFICA_IMPORT_DB,
    fields: fields.length, values, externalOrManual: external, references: keys.size,
    objectsInR2: stored.size, found: keys.size - missing.length, missing: missing.length,
    thumbnailsAvailable: [...keys].filter(k => stored.has(`${k}/thumb.webp`)).length };
  writeFileSync('/migration/r2-reference-report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  writeFileSync('/migration/r2-missing-keys.json', JSON.stringify(missing, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally { await db.end(); s3.destroy(); }
