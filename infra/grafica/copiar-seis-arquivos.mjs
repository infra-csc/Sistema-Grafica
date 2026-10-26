// Copia exclusivamente as seis chaves conferidas; não sobrescreve objetos.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { ORIGEM, DESTINO, CONTA_R2, codificarMetadados, conferirMetadados, lerLimitado, resumirFluxo } from './migrar-storage-r2.mjs';
assert.equal(process.env.R2_BUCKET, DESTINO);
assert.equal(process.env.R2_ACCOUNT_ID, CONTA_R2);
assert.deepEqual(process.argv.slice(2), ['--aplicar']);
const token = readFileSync(0, 'utf8').trim();
assert.ok(token && !/\s/.test(token));
const previous = JSON.parse(readFileSync('/migration/source-missing-validation-report.json','utf8'));
const keys = JSON.parse(readFileSync('/migration/r2-missing-keys.json','utf8'));
assert.equal(keys.length,6);
assert.ok(previous.allReadableAndIntact);
assert.deepEqual([...keys].sort(),previous.objects.map(o=>o.key).sort());
const s3 = new S3Client({ region: 'auto', forcePathStyle: true,
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  endpoint: `https://${CONTA_R2}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestHandler: { connectionTimeout: 5000, socketTimeout: 120000 } });
async function gcs(url) {
  assert.equal(url.origin,'https://storage.googleapis.com');
  const r = await fetch(url,{ headers: { Authorization: `Bearer ${token}` }, redirect:'error',signal:AbortSignal.timeout(120000) });
  assert.ok(r.ok,`GCS_HTTP_${r.status}`); return r;
}
const result = { startedAt: new Date().toISOString(), source: ORIGEM, destination: DESTINO, sourceModified: false, objects: [] };
try {
  for (const key of keys) {
    const checked = previous.objects.find(o=>o.key===key);
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${ORIGEM}/o/${encodeURIComponent(key)}`);
    url.searchParams.set('generation',checked.generation);
    const meta = await (await gcs(url)).json();
    assert.equal(meta.name,key); assert.equal(meta.generation,checked.generation);
    assert.equal(Number(meta.size),checked.bytesReceived);
    assert.ok(Number(meta.size)<=64*1024*1024);
    assert.ok(!meta.contentEncoding || meta.contentEncoding==='identity');
    const headers = { ContentType:meta.contentType || 'application/octet-stream', Metadata:codificarMetadados(meta.metadata) };
    for (const [from,to] of Object.entries({cacheControl:'CacheControl',contentDisposition:'ContentDisposition',contentLanguage:'ContentLanguage',contentEncoding:'ContentEncoding'})) if(meta[from]!==undefined) headers[to]=meta[from];
    if(meta.expires) headers.Expires=new Date(meta.expires);
    assert.ok(Object.entries(headers.Metadata).reduce((n,[k,v])=>n+Buffer.byteLength(k)+Buffer.byteLength(v),0)<=1800);
    url.searchParams.set('alt','media');url.searchParams.set('ifMetagenerationMatch',meta.metageneration);
    const bytes = await lerLimitado((await gcs(url)).body,Number(meta.size));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const md5 = createHash('md5').update(bytes).digest('base64');
    assert.equal(sha256,checked.sha256);assert.equal(md5,meta.md5Hash);
    const input = { Bucket:DESTINO,Key:key };
    let existed=false;
    try { await s3.send(new PutObjectCommand({...input,...headers,Body:bytes,ContentLength:bytes.length,ContentMD5:md5,IfNoneMatch:'*'})); }
    catch(e) { if(e.$metadata?.httpStatusCode!==412) throw e; existed=true; }
    const head=await s3.send(new HeadObjectCommand(input));
    conferirMetadados(head,meta);
    const downloaded=await s3.send(new GetObjectCommand({...input,IfMatch:head.ETag}));
    const actual=await resumirFluxo(downloaded.Body,Number(meta.size));
    assert.equal(actual.sha256,sha256);
    result.objects.push({key,bytes:bytes.length,sha256,etag:head.ETag,generation:meta.generation,metadataMatches:true,destinationContentMatches:true,alreadyExisted:existed});
  }
  result.completedAt=new Date().toISOString();result.complete=result.objects.length===6;
} finally {
  writeFileSync('/migration/six-copy-report.json',JSON.stringify(result,null,2),{mode:0o600});s3.destroy();
}
console.log(JSON.stringify(result));
