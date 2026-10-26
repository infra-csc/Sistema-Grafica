// Executar dentro do container app. Usa apenas usuário e arquivos sintéticos.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const base = 'https://grafica.appsnorte.com';
const id = randomUUID();
const email = `validacao-${id}@example.invalid`;
const password = randomBytes(32).toString('hex');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
let key;
await db.connect();
try {
  await db.query('INSERT INTO users (id,name,email,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,$5,false)',
    [id, 'Validação técnica descartável', email, await bcrypt.hash(password, 10), 'admin']);
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000),
  });
  assert.equal(login.status, 200, 'login HTTPS');
  const cookies = login.headers.getSetCookie();
  const session = cookies.find(c => c.startsWith('connect.sid='));
  assert.ok(session && /; Secure/i.test(session) && /; HttpOnly/i.test(session), 'cookie seguro');
  const Cookie = session.split(';')[0];
  const me = await fetch(`${base}/api/auth/me`, { headers: { Cookie }, signal: AbortSignal.timeout(15000) });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).id, id, 'sessão persistida no PostgreSQL');
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const upload = await fetch(`${base}/api/objects/upload-direct`, {
    method: 'PUT', headers: { Cookie, Origin: base, 'Content-Type': 'image/png' }, body: bytes,
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(upload.status, 200, 'upload via app para R2');
  const { url } = await upload.json();
  assert.match(url, /^\/objects\/uploads\/[a-f0-9-]+$/);
  key = `.private/${url.slice('/objects/'.length)}`;
  const download = await fetch(`${base}${url}`, { headers: { Cookie }, signal: AbortSignal.timeout(15000) });
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  const denied = await fetch(`${base}${url}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(denied.status, 401, 'arquivo exige autenticação');
  console.log('HOMOLOG_OK: HTTPS, login, cookie seguro, sessão PostgreSQL, upload/download R2 e bloqueio sem login.');
} finally {
  if (key) {
    for (const Key of [key, `${key}/thumb.webp`]) {
      await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key }));
    }
  }
  await db.query('DELETE FROM session WHERE sess::jsonb ->> $1 = $2', ['userId', id]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1', [id]);
  await db.query('DELETE FROM users WHERE id = $1', [id]);
  await db.query('DELETE FROM limite_de_tentativas WHERE chave LIKE $1', [`%${email}%`]);
  await db.end();
  r2.destroy();
  console.log('Usuário, sessão e arquivos sintéticos removidos.');
}
