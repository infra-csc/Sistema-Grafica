// Inspeção somente leitura: GET/LIST/HEAD, sem PUT, DELETE ou escrita em banco.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { S3Client, ListObjectsV2Command, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { ORIGEM, DESTINO, CONTA_R2, LIMITE_OBJETO, opcoes, codificarMetadados, conferirMetadados, resumirFluxo } from './migrar-storage-r2.mjs';
opcoes(['--planejar', '--todos'], process.env);
const token = readFileSync(0, 'utf8').trim();
assert.ok(token && !/\s/.test(token));
const s3 = new S3Client({ region: 'auto', forcePathStyle: true,
  endpoint: `https://${CONTA_R2}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  requestHandler: { connectionTimeout: 5000, socketTimeout: 30000 } });
async function gcs(url) {
  assert.equal(url.origin, 'https://storage.googleapis.com');
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!res.ok) { await res.body?.cancel(); throw Error('GCS_HTTP_' + res.status); }
  return res;
}
const objects = []; let page, pages = 0;
do {
  const url = new URL(`https://storage.googleapis.com/storage/v1/b/${ORIGEM}/o`);
  url.searchParams.set('maxResults', '500');
  if (page) url.searchParams.set('pageToken', page);
  const data = await (await gcs(url)).json();
  objects.push(...(data.items ?? [])); page = data.nextPageToken; pages++;
  if (objects.length % 5000 === 0) console.log(JSON.stringify({ evento: 'progresso', objetos: objects.length }));
} while (page);
const dest = []; let cursor;
do {
  const data = await s3.send(new ListObjectsV2Command({ Bucket: DESTINO, ContinuationToken: cursor }));
  dest.push(...(data.Contents ?? [])); cursor = data.NextContinuationToken;
} while (cursor);
const byKey = new Map(objects.map(o => [o.name, o]));
const report = {
  consultadoEm: new Date().toISOString(), origem: ORIGEM, destino: DESTINO, paginas: pages,
  objetosOrigem: objects.length, bytesOrigem: objects.reduce((n,o) => n + BigInt(o.size), 0n).toString(),
  objetosDestino: dest.length, objetosNovos: 0, objetosComMesmaChave: 0,
  acimaDe64MiB: [], acimaDoLimiteDeTransporte: [], metadadosAcimaDe1800Bytes: [], encodingEspecial: [],
  identidadesOuTamanhosInvalidos: [], chavesInvalidas: [], aclJsonInvalido: [],
  objetosComAcl: 0, maiorObjetoBytes: 0, maioresObjetos: [], maiorMetadataBytes: 0,
  semMd5: 0, contentTypes: {}, destinoSemOrigem: [], conflitos: [], existentesConferidos: [],
};
const destKeys = new Set(dest.map(o => o.Key));
for (const o of objects) {
  const size = Number(o.size);
  if (!o.name || !o.generation || !o.metageneration || !Number.isSafeInteger(size) || size < 0)
    report.identidadesOuTamanhosInvalidos.push(o.name);
  if (size > 64 * 1024 * 1024) report.acimaDe64MiB.push({ chave: o.name, bytes: size });
  if (size > LIMITE_OBJETO) report.acimaDoLimiteDeTransporte.push({ chave: o.name, bytes: size });
  if (!o.name || Buffer.byteLength(o.name) > 1024 || /[\r\n]/.test(o.name)) report.chavesInvalidas.push(o.name);
  report.maiorObjetoBytes = Math.max(report.maiorObjetoBytes, size);
  const metadataBytes = Object.entries(codificarMetadados(o.metadata)).reduce((n,[k,v]) => n + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
  report.maiorMetadataBytes = Math.max(report.maiorMetadataBytes, metadataBytes);
  if (metadataBytes > 1800) report.metadadosAcimaDe1800Bytes.push({ chave: o.name, bytes: metadataBytes });
  if (o.contentEncoding && o.contentEncoding !== 'identity') report.encodingEspecial.push({ chave: o.name, encoding: o.contentEncoding });
  if (!o.md5Hash) report.semMd5++;
  report.contentTypes[o.contentType ?? 'naoInformado'] = (report.contentTypes[o.contentType ?? 'naoInformado'] ?? 0) + 1;
  if (o.metadata?.['custom:aclPolicy']) {
    report.objetosComAcl++;
    try { JSON.parse(o.metadata['custom:aclPolicy']); } catch { report.aclJsonInvalido.push(o.name); }
  }
  if (!destKeys.has(o.name)) report.objetosNovos++;
}
report.maioresObjetos = [...objects].sort((a,b) => Number(b.size)-Number(a.size)).slice(0,10).map(o => ({ chave: o.name, bytes: Number(o.size) }));
for (const d of dest) {
  const o = byKey.get(d.Key);
  if (!o) { report.destinoSemOrigem.push(d.Key); continue; }
  report.objetosComMesmaChave++;
  try {
    const input = { Bucket: DESTINO, Key: d.Key };
    const head = await s3.send(new HeadObjectCommand(input));
    conferirMetadados(head, o);
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${ORIGEM}/o/${encodeURIComponent(o.name)}`);
    url.searchParams.set('alt','media'); url.searchParams.set('generation',o.generation);
    url.searchParams.set('ifMetagenerationMatch',o.metageneration);
    const from = await resumirFluxo((await gcs(url)).body, Number(o.size));
    if (o.md5Hash) assert.equal(from.md5, o.md5Hash, 'MD5 da origem diverge');
    const to = await s3.send(new GetObjectCommand({ ...input, IfMatch: head.ETag }));
    const bytes = await resumirFluxo(to.Body, Number(o.size));
    assert.equal(bytes.sha256, from.sha256, 'SHA-256 diverge');
    report.existentesConferidos.push({ chave: d.Key, bytes: bytes.bytes, sha256: bytes.sha256, metadadosIguais: true });
  } catch(e) {
    report.conflitos.push({ chave: d.Key, tipo: e.name,
      motivo: e.$metadata?.httpStatusCode ? 'HTTP_' + e.$metadata.httpStatusCode : e.message.split('\n')[0] });
  }
}
report.limitesAprovados = ['acimaDoLimiteDeTransporte','metadadosAcimaDe1800Bytes','encodingEspecial','identidadesOuTamanhosInvalidos','chavesInvalidas','aclJsonInvalido'].every(k => report[k].length === 0);
report.conflitosAusentes = report.conflitos.length === 0 && report.destinoSemOrigem.length === 0;
console.log(JSON.stringify({ evento: 'relatorio', ...report }));
s3.destroy();
