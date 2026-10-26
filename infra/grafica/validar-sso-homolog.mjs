// Executar dentro do container da homologacao. Nao emite tokens pelo hub.
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';

const base = 'https://grafica.appsnorte.com';
assert.equal(new URL(process.env.DATABASE_URL).pathname, '/grafica_import_20261008');
assert.ok(process.env.SSO_SECRET && process.env.SSO_SECRET !== process.env.SESSION_SECRET);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
const id = randomUUID();
const email = `validacao-sso-${id}@example.invalid`;
const request = (path, options = {}) => fetch(`${base}${path}`, {
  ...options, redirect: 'manual', signal: AbortSignal.timeout(30000),
});
const sign = (payload, secret = process.env.SSO_SECRET, options = {}) => jwt.sign(payload, secret, {
  algorithm: 'HS256', issuer: 'norte-portal', audience: 'producao', expiresIn: '2m', ...options,
});
const results = [];
await db.connect();
try {
  await db.query('INSERT INTO users (id,name,email,password_hash,role,must_change_password) VALUES ($1,$2,$3,$4,$5,false)',
    [id, 'Validacao SSO descartavel', email, '!disabled', 'admin']);
  const entry = await request(`/?portal_sso=${encodeURIComponent(sign({email, app:'producao'}))}`);
  assert.equal(entry.status, 302);
  const target = new URL(entry.headers.get('location'), base);
  const exchangeToken = target.searchParams.get('sso_exchange');
  assert.ok(exchangeToken && !target.searchParams.has('portal_sso'));
  const exchange = await request('/api/auth/sso-exchange', {
    method:'POST', headers:{'Content-Type':'application/json', Origin:base}, body:JSON.stringify({exchangeToken}),
  });
  assert.equal(exchange.status, 200);
  const cookie = exchange.headers.getSetCookie().find(x=>x.startsWith('connect.sid='));
  assert.ok(cookie && /; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie));
  const Cookie = cookie.split(';')[0];
  const me = await request('/api/auth/me', {headers:{Cookie}});
  assert.equal(me.status,200);
  assert.equal((await me.json()).id,id);
  results.push('JWT no formato do hub, troca de uso unico, cookie HTTPS e sessao PostgreSQL');
  const reused = await request('/api/auth/sso-exchange', {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({exchangeToken}),
  });
  assert.equal(reused.status,401);
  for (const [label, token, expected] of [
    ['assinatura incorreta',sign({email},randomBytes(32).toString('hex')),'sso_invalid_token'],
    ['token expirado',sign({email},process.env.SSO_SECRET,{expiresIn:-120}),'sso_invalid_token'],
    ['usuario ausente',sign({email:`ausente-${id}@example.invalid`}),'sso_user_not_found'],
  ]) {
    const res=await request(`/?portal_sso=${encodeURIComponent(token)}`);
    assert.equal(res.status,302,label);
    assert.equal(new URL(res.headers.get('location'),base).searchParams.get('error'),expected,label);
    results.push(`Recusado: ${label}`);
  }
  for (const [key, bytes, sha] of [
    ['00089d55-d67c-4e97-9bee-da73f8b8fa7b',2367646,'2623a244fea27c79e78d9c444e8e0bf36fce84ae4ab6ffa7049fd656474f995e'],
    ['02846922-c73c-460d-94e7-b64e5101c92b',6461551,'49f602bc0ea14be7651de260e0f40e8601172b8400b0a03be50d03a5b9da20b3'],
    ['002c6a5a-14da-4d7a-9763-1b0bf125fa57/thumb.webp',10218,'5fd3a96cd71403d446a6cae8d00b2c19f9d35424fa35a1f1ce9c4796a49ab1f6'],
  ]) {
    const path=`/objects/uploads/${key}`;
    const res=await request(path,{headers:{Cookie}});
    assert.equal(res.status,200);
    const buffer=Buffer.from(await res.arrayBuffer());
    assert.equal(buffer.length,bytes);
    assert.equal(createHash('sha256').update(buffer).digest('hex'),sha);
    assert.equal((await request(path)).status,401);
  }
  results.push('JPEG, PDF e miniatura via app/R2 identicos a amostra da origem; sem sessao retorna 401');
  const logout=await request('/api/auth/logout',{method:'POST',headers:{Cookie,Origin:base}});
  assert.equal(logout.status,200);
  assert.equal((await request('/api/auth/me',{headers:{Cookie}})).status,401);
  results.push('Logout invalida a sessao');
  console.log(JSON.stringify({resultado:'OK',testes:results,loginMicrosoftReal:'PENDENTE'},null,2));
} finally {
  await db.query('DELETE FROM session WHERE sess::jsonb ->> $1 = $2',['userId',id]);
  await db.query('DELETE FROM sso_tokens_de_troca WHERE user_id = $1',[id]);
  await db.query('DELETE FROM audit_logs WHERE user_id = $1',[id]);
  await db.query('DELETE FROM users WHERE id = $1',[id]);
  await db.end();
  console.log('Conta e sessao sinteticas removidas da copia de homologacao.');
}
