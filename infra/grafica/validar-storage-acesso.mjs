// Validação de homologação: fixtures próprias, sem modificar arquivos reais.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const base = 'https://grafica.appsnorte.com';
assert.equal(process.env.R2_BUCKET, 'grafica-homolog-arquivos');
assert.equal(process.env.R2_ACCOUNT_ID, 'e317b932bc90d8c0bcca5b96769a3d1d');
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/grafica_homolog');
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  region: 'auto', forcePathStyle: true,
  endpoint: 'https://e317b932bc90d8c0bcca5b96769a3d1d.r2.cloudflarestorage.com',
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  requestHandler: { connectionTimeout: 5000, socketTimeout: 20000 },
});
const Bucket = process.env.R2_BUCKET;
const sha = b => createHash('sha256').update(b).digest('hex');
const id = randomUUID(), eventId = randomUUID(), kitId = randomUUID(), itemId = randomUUID();
const people = [
  { id: randomUUID(), role: 'admin', kit: false },
  { id: randomUUID(), role: 'solicitacao', kit: true },
  { id: randomUUID(), role: 'solicitacao', kit: true },
].map(p => ({ ...p, email: `validacao-storage-${p.id}@example.invalid`, password: randomBytes(32).toString('hex') }));
const privateKey = `.private/uploads/validacao-${id}-privado`;
const publicKey = `.private/uploads/validacao-${id}-publico`;
const kitKey = `.private/uploads/validacao-${id}-kit`;
const fixtureKeys = [privateKey, `${privateKey}/thumb.webp`, publicKey, kitKey];
const path = key => '/objects/' + key.slice('.private/'.length);
const checks = [];
function ok(name, detail) { checks.push({ teste: name, ...detail }); console.log(JSON.stringify({ evento: 'aprovado', teste: name, ...detail })); }
async function request(url, cookie, options = {}) {
  return fetch(base + url, { redirect: 'error', signal: AbortSignal.timeout(30000),
    ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
}
async function status(url, cookie, expected, name) {
  const res = await request(url, cookie);
  assert.equal(res.status, expected, name);
  await res.arrayBuffer();
  ok(name, { http: res.status });
}
async function content(url, cookie, digest, name) {
  const res = await request(url, cookie);
  assert.equal(res.status, 200, name);
  assert.match(res.headers.get('cache-control') ?? '', /private/i, 'Cache privado');
  const bytes = Buffer.from(await res.arrayBuffer());
  assert.equal(sha(bytes), digest, name);
  ok(name, { http: 200, bytes: bytes.length, sha256: digest, cachePrivado: true });
}
async function keys() {
  const result = []; let token;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket, ContinuationToken: token }));
    result.push(...(page.Contents ?? []).map(o => o.Key));
    token = page.NextContinuationToken;
  } while (token);
  return result.sort();
}
async function counts() {
  return (await db.query('SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM events) AS events, (SELECT count(*) FROM items) AS items, (SELECT count(*) FROM kit_remessas) AS kits, (SELECT count(*) FROM session) AS sessions')).rows[0];
}
let beforeKeys, beforeCounts, failed, cleanupFailed;
await db.connect();
try {
  assert.equal((await db.query('SELECT current_database() AS db')).rows[0].db, 'grafica_homolog');
  beforeKeys = await keys(); beforeCounts = await counts();
  await db.query('BEGIN');
  try {
    for (const p of people) await db.query(
      'INSERT INTO users (id,name,email,password_hash,role,kit,must_change_password) VALUES ($1,$2,$3,$4,$5,$6,false)',
      [p.id, 'Validação storage descartável', p.email, await bcrypt.hash(p.password, 10), p.role, p.kit]);
    await db.query('INSERT INTO events (id,name,start_date,truck_departure_date) VALUES ($1,$2,now(),now())', [eventId, 'Validação storage descartável']);
    await db.query('INSERT INTO kit_remessas (id,event_id,versao,entrega_material,criado_por_id) VALUES ($1,$2,$3,now(),$4)',
      [kitId, eventId, 'Validação descartável', people[1].id]);
    await db.query(`INSERT INTO items (id,display_id,event_id,type,quantity,area,visual,material,finish,measurement,calculated_m2,kit_remessa_id,criado_por_id,reference_url)
      VALUES ($1,$2,$3,'teste',1,1,1,'teste','teste','teste',1,$4,$5,$6)`,
      [itemId, 'VALIDACAO-' + id, eventId, kitId, people[1].id, path(kitKey)]);
    await db.query('COMMIT');
  } catch (e) { await db.query('ROLLBACK'); throw e; }

  for (const p of people) {
    const res = await request('/api/auth/login', null, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base },
      body: JSON.stringify({ email: p.email, password: p.password }),
    });
    assert.equal(res.status, 200, 'Login descartável');
    const cookie = res.headers.getSetCookie().find(c => c.startsWith('connect.sid='));
    assert.ok(cookie && /; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie), 'Cookie seguro');
    p.cookie = cookie.split(';')[0];
    await res.arrayBuffer();
    const me = await request('/api/auth/me', p.cookie);
    assert.equal(me.status, 200);
    const user = await me.json();
    assert.equal(user.id, p.id); assert.equal(user.kit, p.kit);
    ok('Login e perfil ' + (p.kit ? 'Kit' : 'admin'), { http: 200, cookieSeguro: true });
  }
  const png = await sharp({ create: { width: 3, height: 3, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const thumb = await sharp(png).webp().toBuffer();
  function metadata(visibility) {
    return { ['grafica-' + Buffer.from('custom:aclPolicy').toString('hex')]:
      Buffer.from(JSON.stringify({ owner: people[1].id, visibility })).toString('base64') };
  }
  for (const [Key, Body, Metadata, ContentType] of [
    [privateKey, png, metadata('private'), 'image/png'],
    [privateKey + '/thumb.webp', thumb, {}, 'image/webp'],
    [publicKey, png, metadata('public'), 'image/png'],
    [kitKey, png, {}, 'image/png'],
  ]) await s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, Metadata, IfNoneMatch: '*' }));

  const samples = [
    ['.private/uploads/00089d55-d67c-4e97-9bee-da73f8b8fa7b', '2623a244fea27c79e78d9c444e8e0bf36fce84ae4ab6ffa7049fd656474f995e', 'JPEG real'],
    ['.private/uploads/003383b2-928a-4335-9d6d-008a901ab5c9', 'cc732f43fc1793f65e295c2e46e3add6dcd17a6c8e6f63bc914636e1d2eaee88', 'PNG real'],
    ['.private/uploads/02846922-c73c-460d-94e7-b64e5101c92b', '49f602bc0ea14be7651de260e0f40e8601172b8400b0a03be50d03a5b9da20b3', 'PDF real'],
    ['.private/uploads/002c6a5a-14da-4d7a-9763-1b0bf125fa57/thumb.webp', '5fd3a96cd71403d446a6cae8d00b2c19f9d35424fa35a1f1ce9c4796a49ab1f6', 'Miniatura real'],
  ];
  for (const [key, digest, name] of samples) {
    await status(path(key), null, 401, name + ' sem login');
    await content(path(key), people[0].cookie, digest, name + ' autenticado');
  }
  await content(path(privateKey), people[1].cookie, sha(png), 'ACL privada: dono permitido');
  await status(path(privateKey), people[0].cookie, 403, 'ACL privada: outro usuário bloqueado');
  await status(path(privateKey) + '?thumb=1', people[0].cookie, 403, 'ACL privada: miniatura bloqueada para outro usuário');
  await status(path(privateKey) + '?thumb=1', null, 401, 'Miniatura sem login bloqueada');
  await content(path(privateKey) + '?thumb=1', people[1].cookie, sha(thumb), 'Miniatura armazenada: dono permitido');
  await status(path(publicKey), null, 401, 'ACL public continua exigindo login');
  await content(path(publicKey), people[0].cookie, sha(png), 'ACL public: outro usuário autenticado permitido');
  await content(path(kitKey), people[1].cookie, sha(png), 'Kit: arquivo da própria peça permitido');
  await status(path(kitKey), people[2].cookie, 403, 'Kit: arquivo de outra pessoa bloqueado');
  await status(path(kitKey) + '?thumb=1', people[2].cookie, 403, 'Kit: miniatura de outra pessoa bloqueada');
  await content(path(kitKey), people[0].cookie, sha(png), 'Arquivo Kit: admin permitido');
} catch (e) {
  failed = e;
  console.error(JSON.stringify({ evento: 'falha', tipo: e.name, mensagem: e.message }));
} finally {
  // Exclusões restritas às chaves e IDs aleatórios desta execução.
  const cleanups = await Promise.allSettled(fixtureKeys.map(Key => s3.send(new DeleteObjectCommand({ Bucket, Key }))));
  cleanupFailed = cleanups.some(r => r.status === 'rejected');
  try {
    await db.query('BEGIN');
    await db.query('DELETE FROM items WHERE id=$1 AND event_id=$2', [itemId, eventId]);
    await db.query('DELETE FROM kit_remessas WHERE id=$1 AND event_id=$2', [kitId, eventId]);
    await db.query('DELETE FROM events WHERE id=$1', [eventId]);
    for (const p of people) {
      await db.query('DELETE FROM session WHERE sess::jsonb ->> $1 = $2', ['userId', p.id]);
      await db.query('DELETE FROM audit_logs WHERE user_id=$1', [p.id]);
      await db.query('DELETE FROM users WHERE id=$1 AND email=$2', [p.id, p.email]);
      await db.query('DELETE FROM limite_de_tentativas WHERE chave LIKE $1', ['%' + p.email + '%']);
    }
    await db.query('COMMIT');
    if (beforeCounts) assert.deepEqual(await counts(), beforeCounts, 'Contagens após limpeza');
    if (beforeKeys) assert.deepEqual(await keys(), beforeKeys, 'Chaves R2 após limpeza');
  } catch (e) {
    cleanupFailed = true;
    await db.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({ evento: 'falha_limpeza', tipo: e.name, mensagem: e.message, identificador: id }));
  }
  await db.end(); s3.destroy();
  console.log(JSON.stringify({ evento: 'resultado', aprovado: !failed && !cleanupFailed,
    testes: checks.length, limpezaConferida: !cleanupFailed, banco: beforeCounts, arquivosReaisMantidos: beforeKeys?.length }));
}
if (failed || cleanupFailed) process.exitCode = 1;
