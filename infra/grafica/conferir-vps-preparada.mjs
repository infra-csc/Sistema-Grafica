// Executar dentro do container app por stdin. Não cria usuários, sessões ou objetos.
import assert from 'node:assert/strict';
import pg from 'pg';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, 'postgres');
assert.equal(url.pathname, '/grafica_import_20261008', 'Esperado banco de homologação');
for (const field of ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'SSO_SECRET']) {
  assert.ok(process.env[field]?.trim(), `Configuração ausente: ${field}`);
}
assert.equal(process.env.R2_BUCKET, 'grafica-homolog-arquivos');
assert.equal(process.env.R2_ACCOUNT_ID, 'e317b932bc90d8c0bcca5b96769a3d1d');
assert.equal(process.env.MICROSOFT_REDIRECT_URI, 'https://grafica.appsnorte.com/api/auth/microsoft/callback');
for (const field of ['BOOK_EMAIL_NOTIFICATIONS_ENABLED', 'REVISAO_DIGEST_ENABLED', 'GESTAO_DIGEST_ENABLED']) {
  assert.equal(process.env[field], 'false', `${field} deve ficar desligado na homologação`);
}
assert.equal(process.env.BOOK_EMAIL_DRY_RUN, 'true');

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const r2 = new S3Client({region: 'auto', endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY},
  requestHandler: {connectionTimeout: 10000, socketTimeout: 20000}, maxAttempts: 2});
try {
  await db.connect();
  await db.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await db.query("SET LOCAL statement_timeout = '20s'");
  const {rows: [counts]} = await db.query(`SELECT
    (SELECT count(*)::int FROM users) AS users,
    (SELECT count(*)::int FROM events) AS events,
    (SELECT count(*)::int FROM items) AS items,
    (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS migrations,
    (SELECT count(*)::int FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','drizzle') AND NOT i.indisvalid) AS invalid_indexes`);
  assert.equal(counts.invalid_indexes, 0);
  assert.ok(counts.users > 0 && counts.events > 0 && counts.items > 0);
  await db.query('ROLLBACK');
  const listed = await r2.send(new ListObjectsV2Command({Bucket: process.env.R2_BUCKET, MaxKeys: 1}));
  assert.ok(listed.Contents?.length, 'Bucket do app vazio');
  const login = await fetch('https://grafica.appsnorte.com/login', {signal: AbortSignal.timeout(20000)});
  assert.equal(login.status, 200);
  const anonymous = await fetch('https://grafica.appsnorte.com/api/auth/me', {signal: AbortSignal.timeout(20000)});
  assert.equal(anonymous.status, 401, 'Identidade exige autenticação');
  console.log(JSON.stringify({conferidoEm: new Date().toISOString(), resultado: 'OK',
    banco: url.pathname.slice(1), registros: counts, storage: process.env.R2_BUCKET,
    storageLeitura: 'OK', httpsLogin: login.status, identidadeAnonima: anonymous.status,
    microsoftConfigurado: true, emailsDesligados: true, replitAlterado: false}, null, 2));
} finally { await db.end(); r2.destroy(); }
