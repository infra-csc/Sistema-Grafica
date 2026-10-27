// Somente GET na origem; token recebido por stdin, sem persistência.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const token = readFileSync(0, 'utf8').trim();
assert.ok(token && !/\s/.test(token));
const bucket = 'replit-objstore-c4b4879f-ce65-4fb1-891e-2d8c9642fe0e';
const keys = JSON.parse(readFileSync('/migration/r2-missing-keys.json', 'utf8'));
assert.equal(keys.length, 6);
assert.ok(keys.every(k => /^\.private\/uploads\/[a-f0-9-]{36}$/.test(k)));
const results = [];
async function get(url) { return fetch(url, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(120000) }); }
for (const key of keys) {
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(key)}`);
  const metaResponse = await get(url);
  if (!metaResponse.ok) { results.push({ key, metadataHttp: metaResponse.status }); continue; }
  const meta = await metaResponse.json();
  assert.equal(meta.name, key);
  assert.ok(meta.generation && meta.metageneration && meta.md5Hash);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('generation', meta.generation);
  url.searchParams.set('ifMetagenerationMatch', meta.metageneration);
  const response = await get(url);
  if (!response.ok) { results.push({ key, readHttp: response.status }); continue; }
  const md5 = createHash('md5'), sha = createHash('sha256');
  let bytes = 0, prefix = Buffer.alloc(0);
  for await (const chunk of response.body) {
    const b = Buffer.from(chunk); bytes += b.length; md5.update(b); sha.update(b);
    if (prefix.length < 16) prefix = Buffer.concat([prefix,b.subarray(0,16-prefix.length)]);
    assert.ok(bytes <= 512 * 1024 * 1024, 'Objeto acima do limite de leitura.');
  }
  const signatures = {
    'image/jpeg': prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255,
    'image/png': prefix.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'application/pdf': prefix.subarray(0,5).toString() === '%PDF-',
    'image/webp': prefix.subarray(0,4).toString() === 'RIFF' && prefix.subarray(8,12).toString() === 'WEBP'
  };
  results.push({ key, exists: true, bytesExpected: Number(meta.size), bytesReceived: bytes,
    sizeMatches: bytes === Number(meta.size), md5Matches: md5.digest('base64') === meta.md5Hash,
    contentType: meta.contentType, formatMatches: signatures[meta.contentType] ?? null,
    sha256: sha.digest('hex'), createdAt: meta.timeCreated, updatedAt: meta.updated,
    generation: meta.generation, aclPresent: Boolean(meta.metadata?.['custom:aclPolicy']) });
}
const ok = results.every(r => r.exists && r.sizeMatches && r.md5Matches && r.formatMatches !== false);
const report = { checkedAt: new Date().toISOString(), bucket, objects: results, allReadableAndIntact: ok, sourceModified: false, objectsCopied: 0 };
writeFileSync('/migration/source-missing-validation-report.json', JSON.stringify(report,null,2), { mode: 0o600 });
console.log(JSON.stringify(report));
if (!ok) process.exitCode = 1;
