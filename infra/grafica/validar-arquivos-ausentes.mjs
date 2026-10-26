// Consulta somente a cópia PostgreSQL e HEAD do R2, sem alterar objetos.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import pg from 'pg';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
url.pathname = '/grafica_import_20261008';
assert.equal(process.env.R2_BUCKET, 'grafica-homolog-arquivos');
assert.equal(process.env.R2_ACCOUNT_ID, 'e317b932bc90d8c0bcca5b96769a3d1d');
const missing = JSON.parse(readFileSync('/migration/r2-missing-keys.json', 'utf8'));
assert.equal(missing.length, 6);
assert.ok(missing.every(k => /^\.private\/uploads\/[a-f0-9-]{36}$/.test(k)));
const result = new Map(missing.map(key => [key, { key, references: [] }]));
const q = v => `"${v.replaceAll('"', '""')}"`;
const db = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
const s3 = new S3Client({ region: 'auto', forcePathStyle: true,
  endpoint: 'https://e317b932bc90d8c0bcca5b96769a3d1d.r2.cloudflarestorage.com',
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestHandler: { connectionTimeout: 5000, socketTimeout: 30000 } });
try {
  await db.connect();
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout = '30s'");
  const columns = (await db.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2")).rows;
  const fields = columns.filter(c => /_urls?$/.test(c.column_name) || ['kit_remessas.arquivo','tubo_itens.fotos','tubos.fotos_fechamento'].includes(`${c.table_name}.${c.column_name}`));
  for (const f of fields) {
    const info = columns.filter(c => c.table_name === f.table_name && (['id','item_id','event_id','tubo_id'].includes(c.column_name) || /^(created_at|updated_at|uploaded_at|taken_at)$/.test(c.column_name))).map(c => c.column_name);
    const rows = (await db.query(`SELECT ${[...new Set([...info, f.column_name])].map(q).join(',')} FROM public.${q(f.table_name)} WHERE ${q(f.column_name)} IS NOT NULL`)).rows;
    for (const row of rows) for (const raw of Array.isArray(row[f.column_name]) ? row[f.column_name] : [row[f.column_name]]) {
      if (typeof raw !== 'string') continue;
      let key;
      if (raw.startsWith('/objects/')) key = '.private/' + raw.slice(9).split('?')[0];
      else { try { const u = new URL(raw); if (u.hostname === 'storage.googleapis.com') key = decodeURIComponent(u.pathname).split('/').slice(2).join('/'); } catch {} }
      if (result.has(key)) result.get(key).references.push({ table: f.table_name, column: f.column_name, ...Object.fromEntries(info.map(c => [c,row[c]])) });
    }
  }
  await db.query('ROLLBACK');
  async function head(key) {
    try { const h = await s3.send(new HeadObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key })); return { exists: true, bytes: h.ContentLength, contentType: h.ContentType }; }
    catch (e) { if (e.$metadata?.httpStatusCode === 404) return { exists: false, httpStatus: 404 }; throw e; }
  }
  for (const r of result.values()) { r.r2 = await head(r.key); r.thumbnailR2 = await head(r.key + '/thumb.webp'); }
  const report = { checkedAt: new Date().toISOString(), database: 'grafica_import_20261008', sourceValidation: 'pending_new_read_token', objects: [...result.values()] };
  writeFileSync('/migration/missing-validation-report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally { await db.end(); s3.destroy(); }
