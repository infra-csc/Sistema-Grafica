// Conferência somente leitura do lote já copiado: LIST R2 e relatório privado.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function conferirLote(linhas, objetos) {
  const plano = linhas.find(l => l.evento === 'plano');
  const fim = linhas.filter(l => l.evento === 'concluido').at(-1);
  assert.ok(plano?.aplicar && plano.origem === 'replit-objstore-c4b4879f-ce65-4fb1-891e-2d8c9642fe0e'
    && plano.destino === 'grafica-homolog-arquivos', 'Plano incompatível.');
  assert.ok(fim?.aplicar && fim.objetos === plano.objetos, 'Lote sem confirmação de conclusão.');
  assert.ok(!linhas.some(l => l.evento === 'interrompido'), 'Lote registra interrupção.');
  const verificados = new Map();
  for (const l of linhas) if (l.evento === 'verificado') {
    assert.ok(typeof l.chave === 'string' && Number.isSafeInteger(l.bytes) && l.bytes >= 0
      && /^[a-f0-9]{64}$/.test(l.sha256) && typeof l.etag === 'string', 'Registro inválido.');
    assert.ok(!verificados.has(l.chave), 'Chave repetida no relatório.');
    verificados.set(l.chave, l);
  }
  assert.equal(verificados.size, plano.objetos, 'Quantidade verificada diverge do plano.');
  const bytes = [...verificados.values()].reduce((n,l) => n + BigInt(l.bytes), 0n);
  assert.equal(bytes.toString(), plano.bytes, 'Total de bytes diverge do plano.');
  const destino = new Map(objetos.map(o => [o.Key, o]));
  const ausentes = [], divergentes = [];
  for (const [chave, l] of verificados) {
    const o = destino.get(chave);
    if (!o) ausentes.push(chave);
    else if (o.Size !== l.bytes || o.ETag !== l.etag) divergentes.push(chave);
  }
  const extras = [...destino.keys()].filter(k => !verificados.has(k));
  return { loteCompleto: true, objetos: verificados.size, bytes: bytes.toString(),
    reaproveitados: [...verificados.values()].filter(l => l.reutilizado === true).length,
    objetosDestino: destino.size, ausentes, divergentes, extras,
    destinoConfere: ausentes.length === 0 && divergentes.length === 0 && extras.length === 0 };
}
async function main() {
  assert.equal(process.env.R2_BUCKET, 'grafica-homolog-arquivos');
  assert.equal(process.env.R2_ACCOUNT_ID, 'e317b932bc90d8c0bcca5b96769a3d1d');
  const linhas = readFileSync('/app/copia.jsonl', 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({ region: 'auto', forcePathStyle: true,
    endpoint: 'https://e317b932bc90d8c0bcca5b96769a3d1d.r2.cloudflarestorage.com',
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    requestHandler: { connectionTimeout: 5000, socketTimeout: 30000 } });
  try {
    let token; const objetos = [];
    do {
      const r = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, ContinuationToken: token }));
      objetos.push(...(r.Contents ?? [])); token = r.NextContinuationToken;
    } while (token);
    const resultado = conferirLote(linhas, objetos);
    console.log(JSON.stringify({ consultadoEm: new Date().toISOString(), ...resultado }));
    if (!resultado.destinoConfere) process.exitCode = 1;
  } finally { s3.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => {
  console.error(JSON.stringify({ evento: 'conferencia_interrompida', tipo: e.name, mensagem: e.message.split('\n')[0] }));
  process.exitCode = 1;
});
