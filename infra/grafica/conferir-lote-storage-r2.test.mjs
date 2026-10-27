import test from 'node:test';
import assert from 'node:assert/strict';
import { conferirLote } from './conferir-lote-storage-r2.mjs';

const plano = { evento: 'plano', aplicar: true, origem: 'replit-objstore-c4b4879f-ce65-4fb1-891e-2d8c9642fe0e', destino: 'grafica-homolog-arquivos', objetos: 1, bytes: '3' };
const arquivo = { evento: 'verificado', chave: 'chave', bytes: 3, sha256: 'a'.repeat(64), etag: 'versao', reutilizado: true };
const fim = { evento: 'concluido', aplicar: true, objetos: 1 };
const destino = [{ Key: 'chave', Size: 3, ETag: 'versao' }];

test('conclusão confere quantidade, bytes e identidade dos objetos no R2', () => {
  const r = conferirLote([plano, arquivo, fim], destino);
  assert.equal(r.destinoConfere, true);
  assert.equal(r.reaproveitados, 1);
  assert.equal(r.bytes, '3');
});

test('lote incompleto, interrompido ou com chave repetida não comprova conclusão', () => {
  assert.throws(() => conferirLote([plano, arquivo], destino));
  assert.throws(() => conferirLote([plano, arquivo, fim, { evento: 'interrompido' }], destino));
  assert.throws(() => conferirLote([plano, arquivo, arquivo, fim], destino));
  assert.throws(() => conferirLote([{ ...plano, bytes: '4' }, arquivo, fim], destino));
});

test('objeto ausente, alterado ou extra no destino aparece como divergência', () => {
  const linhas = [plano, arquivo, fim];
  assert.deepEqual(conferirLote(linhas, []).ausentes, ['chave']);
  assert.deepEqual(conferirLote(linhas, [{ ...destino[0], ETag: 'outro' }]).divergentes, ['chave']);
  assert.deepEqual(conferirLote(linhas, [...destino, { Key: 'extra' }]).extras, ['extra']);
});
