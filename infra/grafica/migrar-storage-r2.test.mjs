import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createReadStream } from 'node:fs';
import { mkdtemp, readdir, rmdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { opcoes, ORIGEM, DESTINO, CONTA_R2, LIMITE_OBJETO, codificarMetadados, conferirMetadados, lerLimitado, resumirFluxo, comArquivoTemporario, emLote, carregarRetomada, podeReaproveitar } from './migrar-storage-r2.mjs';

const env = { R2_BUCKET: DESTINO, R2_ACCOUNT_ID: CONTA_R2, R2_ACCESS_KEY_ID: 'teste', R2_SECRET_ACCESS_KEY: 'teste' };

test('retomada aproveita hash anterior apenas com versões, ETag e metadados iguais', () => {
  const objeto = { name: 'chave', generation: '1', metageneration: '2', size: '3', contentType: 'image/png' };
  const registro = { evento: 'verificado', chave: 'chave', generation: '1', metageneration: '2', bytes: 3, sha256: 'a'.repeat(64), etag: 'versao-r2' };
  const plano = { evento: 'plano', aplicar: true, origem: ORIGEM, destino: DESTINO };
  const log = JSON.stringify(plano) + '\n' + JSON.stringify(registro);
  assert.equal(carregarRetomada(log).size, 1);
  assert.throws(() => carregarRetomada(JSON.stringify({ ...plano, destino: 'outro' })));
  assert.throws(() => carregarRetomada(JSON.stringify(plano) + '\n' + JSON.stringify({ ...registro, sha256: '' })));
  const head = { ETag: registro.etag, ContentLength: 3, ContentType: 'image/png', Metadata: {} };
  assert.equal(podeReaproveitar(registro, objeto, head), true);
  assert.equal(podeReaproveitar(registro, { ...objeto, generation: '3' }, head), false);
  assert.equal(podeReaproveitar(registro, { ...objeto, metageneration: '3' }, head), false);
  assert.equal(podeReaproveitar(registro, objeto, { ...head, ETag: 'alterado' }), false);
  assert.equal(podeReaproveitar(registro, objeto, undefined), false);
  assert.throws(() => podeReaproveitar(registro, objeto, { ...head, Metadata: { alterado: 'sim' } }));
});

test('lote limita concorrência e termina operações em andamento antes de reportar falha', async () => {
  let ativos = 0, pico = 0, concluidos = 0;
  await emLote([1,2,3,4,5,6], async () => {
    ativos++; pico = Math.max(pico, ativos);
    await new Promise(resolve => setImmediate(resolve));
    ativos--; concluidos++;
  });
  assert.equal(pico, 3); assert.equal(concluidos, 6);
  const iniciados = [];
  await assert.rejects(emLote([1,2,3,4,5,6], async n => {
    iniciados.push(n);
    if (n === 1) throw Error('interromper');
    await new Promise(resolve => setImmediate(resolve));
  }), /interromper/);
  assert.deepEqual(iniciados, [1,2,3]);
  await assert.rejects(emLote([], async () => {}, 17));
  let leves = 0, picoLeves = 0;
  await emLote(Array.from({ length: 32 }), async () => {
    leves++; picoLeves = Math.max(picoLeves, leves);
    await new Promise(resolve => setImmediate(resolve)); leves--;
  }, 16);
  assert.equal(picoLeves, 16);
});

test('modo padrão é somente leitura; gravação exige destino e escopo explícitos', () => {
  assert.equal(opcoes([], env).aplicar, false);
  assert.throws(() => opcoes(['--aplicar'], env));
  assert.throws(() => opcoes(['--aplicar', `--confirmar-destino=${DESTINO}`], env));
  assert.throws(() => opcoes(['--aplicar', '--todos'], env));
  assert.throws(() => opcoes(['--planejar', '--aplicar'], env));
  assert.throws(() => opcoes([], { ...env, R2_BUCKET: 'outro' }));
  assert.throws(() => opcoes([], { ...env, R2_ACCOUNT_ID: 'a'.repeat(32) }));
  assert.equal(opcoes(['--aplicar', '--amostra', `--confirmar-destino=${DESTINO}`], env).aplicar, true);
  assert.equal(opcoes(['--aplicar', '--arquivo-grande', `--confirmar-destino=${DESTINO}`], env).arquivoGrande, true);
  assert.throws(() => opcoes(['--arquivo-grande', '--todos'], env));
  assert.throws(() => opcoes(['--arquivo-grande', '--amostra'], env));
});

test('ACL Unicode atravessa headers S3 no contrato consumido pelo app', () => {
  const valor = JSON.stringify({ owner: 'ação', visibility: 'private' });
  const encoded = codificarMetadados({ 'custom:aclPolicy': valor });
  const key = 'grafica-' + Buffer.from('custom:aclPolicy').toString('hex');
  assert.equal(Buffer.from(encoded[key], 'base64').toString(), valor);
  assert.match(key, /^[a-z0-9-]+$/);
});

test('conteúdo incompleto ou maior que os metadados interrompe a operação', async () => {
  assert.equal((await lerLimitado(Readable.from([Buffer.from('abc')]), 3)).toString(), 'abc');
  await assert.rejects(lerLimitado(Readable.from([Buffer.from('ab')]), 3));
  await assert.rejects(lerLimitado(Readable.from([Buffer.from('abcd')]), 3));
  await assert.rejects(lerLimitado(Readable.from([]), 65 * 1024 * 1024));
});

test('um objeto existente com ACL diferente é conflito, não candidato a sobrescrita', () => {
  const objeto = { size: '3', contentType: 'image/png', metadata: { 'custom:aclPolicy': '{"visibility":"private"}' } };
  const head = { ContentLength: 3, ContentType: 'image/png', Metadata: codificarMetadados(objeto.metadata) };
  assert.doesNotThrow(() => conferirMetadados(head, objeto));
  assert.throws(() => conferirMetadados({ ...head, Metadata: {} }, objeto));
  assert.throws(() => conferirMetadados({ ...head, ContentLength: 2 }, objeto));
  assert.throws(() => conferirMetadados({ ...head, CacheControl: 'public' }, objeto));
});

test('objeto com Content-Encoding especial não inicia cópia sem tratamento', () => {
  assert.throws(() => conferirMetadados({}, { size: '3', contentEncoding: 'gzip' }));
});

test('hash incremental detecta truncamento, excesso e falha da origem', async () => {
  const resumo = await resumirFluxo(Readable.from(['abc']), 3);
  assert.equal(resumo.sha256, createHash('sha256').update('abc').digest('hex'));
  assert.equal(resumo.md5, createHash('md5').update('abc').digest('base64'));
  await assert.rejects(resumirFluxo(Readable.from(['ab']), 3));
  await assert.rejects(resumirFluxo(Readable.from(['abcd']), 3));
  await assert.rejects(resumirFluxo(Readable.from([]), LIMITE_OBJETO + 1));
  async function* quebrado() { yield Buffer.from('ab'); throw Error('origem interrompida'); }
  await assert.rejects(resumirFluxo(Readable.from(quebrado()), 3), /origem interrompida/);
});

test('arquivo de 260,8 MB atravessa disco e releitura com os mesmos hashes; temporário removido', async () => {
  const root = await mkdtemp(join(process.cwd(), '.teste-storage-'));
  const tamanho = 260795708;
  const sha = createHash('sha256'), md5 = createHash('md5');
  const bloco = Buffer.alloc(64 * 1024, 97);
  async function* gerar() {
    for (let n = 0; n < tamanho; n += bloco.length) {
      const parte = bloco.subarray(0, Math.min(bloco.length, tamanho - n));
      sha.update(parte); md5.update(parte); yield parte;
    }
  }
  try {
    await comArquivoTemporario(Readable.from(gerar()), tamanho, async (arquivo, resumo) => {
      assert.equal((await stat(arquivo)).size, tamanho);
      assert.equal(resumo.sha256, sha.digest('hex'));
      assert.equal(resumo.md5, md5.digest('base64'));
      assert.deepEqual(await resumirFluxo(createReadStream(arquivo), tamanho), resumo);
    }, root);
    assert.deepEqual(await readdir(root), []);
  } finally { await rmdir(root); }
});

test('temporário é removido se a origem truncar ou a operação de destino falhar', async () => {
  const root = await mkdtemp(join(process.cwd(), '.teste-storage-'));
  const size = 65 * 1024 * 1024;
  async function* gerar() { for (let n=0; n<65; n++) yield Buffer.alloc(1024 * 1024, 1); }
  try {
    let chamado = false;
    await assert.rejects(comArquivoTemporario(Readable.from(['abc']), size, async () => { chamado = true; }, root), /Download incompleto/);
    assert.equal(chamado, false);
    assert.deepEqual(await readdir(root), []);
    await assert.rejects(comArquivoTemporario(Readable.from(gerar()), size, async () => { throw Error('destino interrompido'); }, root), /destino interrompido/);
    assert.deepEqual(await readdir(root), []);
  } finally { await rmdir(root); }
});
