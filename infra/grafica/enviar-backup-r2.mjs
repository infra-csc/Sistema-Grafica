import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

const path = resolve(process.argv[2] ?? '');
assert.equal(path.startsWith('/backups/'), true, 'Backup fora da pasta montada');
assert.match(basename(path), /^grafica-\d{8}T\d{6}Z-\d+\.dump$/);
assert.equal(process.env.BACKUP_R2_BUCKET, 'grafica-backups');
assert.equal(process.env.BACKUP_R2_ACCOUNT_ID, 'e317b932bc90d8c0bcca5b96769a3d1d');
assert.ok(process.env.BACKUP_R2_ACCESS_KEY_ID && process.env.BACKUP_R2_SECRET_ACCESS_KEY, 'Credenciais de backup ausentes');
const bytes = await readFile(path);
assert.equal(bytes.subarray(0,5).toString(), 'PGDMP', 'Não é um dump custom PostgreSQL');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const Bucket = process.env.BACKUP_R2_BUCKET;
const Key = `postgres/${basename(path)}`;
const s3 = new S3Client({region:'auto', forcePathStyle:true,
  endpoint:`https://${process.env.BACKUP_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:process.env.BACKUP_R2_ACCESS_KEY_ID, secretAccessKey:process.env.BACKUP_R2_SECRET_ACCESS_KEY},
  requestHandler:{connectionTimeout:10000, socketTimeout:120000}, maxAttempts:3});
try {
  try {
    await s3.send(new PutObjectCommand({Bucket,Key,Body:bytes,ContentLength:bytes.length,
      ContentType:'application/octet-stream',IfNoneMatch:'*',Metadata:{sha256}}));
  } catch (error) {
    // Repetir um envio não sobrescreve o backup já existente. Confira seus bytes.
    if (error?.$metadata?.httpStatusCode !== 412) throw error;
  }
  const head=await s3.send(new HeadObjectCommand({Bucket,Key}));
  assert.equal(head.ContentLength,bytes.length);
  assert.equal(head.Metadata?.sha256,sha256);
  const response=await s3.send(new GetObjectCommand({Bucket,Key}));
  const hash=createHash('sha256');
  let received=0;
  for await (const chunk of response.Body) {received+=chunk.length;hash.update(chunk);}
  assert.equal(received,bytes.length);
  assert.equal(hash.digest('hex'),sha256);
  console.log(JSON.stringify({verificadoEm:new Date().toISOString(),bucket:Bucket,chave:Key,bytes:received,sha256,resultado:'OK'}));
} finally {s3.destroy();}
