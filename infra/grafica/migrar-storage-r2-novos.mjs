// Preparação offline. Nenhuma operação ocorre ao importar este módulo.
// Origem: somente GET. Destino: somente leitura, exceto com --aplicar explícito.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, createReadStream } from 'node:fs';
import { mkdtemp, open, statfs, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ORIGEM = 'replit-objstore-c4b4879f-ce65-4fb1-891e-2d8c9642fe0e';
export const DESTINO = 'grafica-homolog-arquivos';
export const CONTA_R2 = 'e317b932bc90d8c0bcca5b96769a3d1d';
export const ARQUIVO_GRANDE = '.private/uploads/0f540128-be32-4e39-9254-9afb7065ead7';
export const AMOSTRAS = [
  '.private/uploads/00089d55-d67c-4e97-9bee-da73f8b8fa7b',
  '.private/uploads/003383b2-928a-4335-9d6d-008a901ab5c9',
  '.private/uploads/02846922-c73c-460d-94e7-b64e5101c92b',
  '.private/uploads/002c6a5a-14da-4d7a-9763-1b0bf125fa57/thumb.webp',
];
const LIMITE = 64 * 1024 * 1024;
export const LIMITE_OBJETO = 512 * 1024 * 1024;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const ordenar = metadata => Object.fromEntries(Object.entries(metadata ?? {}).sort(([a], [b]) => a.localeCompare(b)));

// Mesmo contrato de server/r2Storage.ts: ':' e Unicode não entram crus nos headers S3.
export function codificarMetadados(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata).map(([k, v]) => [
    `grafica-${Buffer.from(k).toString('hex')}`, Buffer.from(String(v)).toString('base64'),
  ]));
}

export function opcoes(args, env) {
  const permitidos = new Set(['--planejar', '--aplicar', '--amostra', '--arquivo-grande', '--todos', '--retomar', `--confirmar-destino=${DESTINO}`]);
  assert.ok(args.every(a => permitidos.has(a)), 'Argumento desconhecido.');
  assert.ok(!(args.includes('--planejar') && args.includes('--aplicar')), 'Escolha apenas um modo.');
  const escopos = ['--amostra', '--arquivo-grande', '--todos'].filter(a => args.includes(a));
  assert.ok(escopos.length <= 1, 'Escolha apenas um escopo.');
  const aplicar = args.includes('--aplicar');
  if (aplicar) {
    assert.ok(args.includes(`--confirmar-destino=${DESTINO}`), 'Confirmação do destino ausente.');
    assert.equal(escopos.length, 1, 'Escopo de gravação ausente.');
  }
  assert.equal(env.R2_BUCKET, DESTINO, 'Bucket R2 diferente do autorizado.');
  assert.equal(env.R2_ACCOUNT_ID, CONTA_R2, 'Conta Cloudflare diferente da autorizada.');
  assert.ok(env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY, 'Credenciais R2 ausentes.');
  return { aplicar, amostra: args.includes('--amostra'), arquivoGrande: args.includes('--arquivo-grande'), retomar: args.includes('--retomar') };
}

export function carregarRetomada(texto) {
  const linhas = texto.trim().split('\n').filter(Boolean).map(JSON.parse);
  const plano = linhas.find(l => l.evento === 'plano');
  assert.ok(plano?.aplicar && plano.origem === ORIGEM && plano.destino === DESTINO, 'Relatório de retomada incompatível.');
  const resultado = new Map();
  for (const l of linhas) if (l.evento === 'verificado') {
    assert.ok(typeof l.chave === 'string' && typeof l.generation === 'string' && typeof l.metageneration === 'string'
      && Number.isSafeInteger(l.bytes) && l.bytes >= 0 && /^[a-f0-9]{64}$/.test(l.sha256)
      && typeof l.etag === 'string' && l.etag.length > 0, 'Registro de retomada inválido.');
    resultado.set(l.chave, l);
  }
  return resultado;
}

export function podeReaproveitar(registro, objeto, head) {
  if (!registro || !head || registro.chave !== objeto.name || registro.generation !== objeto.generation
    || registro.metageneration !== objeto.metageneration || registro.bytes !== Number(objeto.size)
    || registro.etag !== head.ETag) return false;
  conferirMetadados(head, objeto);
  return true;
}

export async function lerLimitado(body, esperado) {
  assert.ok(Number.isSafeInteger(esperado) && esperado >= 0 && esperado <= LIMITE, 'Tamanho fora do limite.');
  const partes = [];
  let recebidos = 0;
  try {
    for await (const parte of body) {
      const chunk = Buffer.from(parte);
      recebidos += chunk.length;
      assert.ok(recebidos <= esperado && recebidos <= LIMITE, 'Conteúdo maior que o informado.');
      partes.push(chunk);
    }
    assert.equal(recebidos, esperado, 'Download incompleto.');
    return Buffer.concat(partes, recebidos);
  } finally {
    body.destroy?.();
  }
}

// Concorrência limitada; uma falha impede iniciar os seguintes.
export async function emLote(objetos, processar, concorrencia = 3) {
  assert.ok(Number.isInteger(concorrencia) && concorrencia >= 1 && concorrencia <= 16);
  let indice = 0, falha;
  await Promise.all(Array.from({ length: concorrencia }, async () => {
    while (!falha && indice < objetos.length) {
      const objeto = objetos[indice++];
      try { await processar(objeto); } catch (e) { falha ??= e; }
    }
  }));
  if (falha) throw falha;
}

// Conta e calcula hashes incrementalmente, sem acumular o conteúdo.
export async function resumirFluxo(body, esperado, escrever = async () => {}) {
  assert.ok(Number.isSafeInteger(esperado) && esperado >= 0 && esperado <= LIMITE_OBJETO, 'Tamanho fora do limite de transporte.');
  const sha256 = createHash('sha256'), md5 = createHash('md5');
  let bytes = 0;
  try {
    for await (const parte of body) {
      const chunk = Buffer.from(parte);
      bytes += chunk.length;
      assert.ok(bytes <= esperado, 'Conteúdo maior que o informado.');
      sha256.update(chunk); md5.update(chunk);
      await escrever(chunk);
    }
    assert.equal(bytes, esperado, 'Download incompleto.');
    return { bytes, sha256: sha256.digest('hex'), md5: md5.digest('base64') };
  } finally { body.destroy?.(); }
}

// Um único arquivo privado por vez; remove só o arquivo e diretório criados aqui.
export async function comArquivoTemporario(body, esperado, usar, diretorio = tmpdir()) {
  let pasta, arquivo, handle;
  try {
    assert.ok(Number.isSafeInteger(esperado) && esperado > LIMITE && esperado <= LIMITE_OBJETO, 'Tamanho fora do limite temporário.');
    const espaco = await statfs(diretorio, { bigint: true });
    assert.ok(espaco.bavail * espaco.bsize >= BigInt(esperado + LIMITE), 'Espaço temporário insuficiente.');
    pasta = await mkdtemp(join(diretorio, 'grafica-storage-'));
    arquivo = join(pasta, 'conteudo');
    handle = await open(arquivo, 'wx', 0o600);
    const resumo = await resumirFluxo(body, esperado, async chunk => {
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await handle.write(chunk, offset, chunk.length - offset);
        assert.ok(bytesWritten > 0, 'Escrita temporária interrompida.');
        offset += bytesWritten;
      }
    });
    await handle.close(); handle = undefined;
    return await usar(arquivo, resumo);
  } finally {
    body.destroy?.();
    await body.cancel?.().catch(() => {});
    await handle?.close();
    if (arquivo) await unlink(arquivo).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (pasta) await rmdir(pasta);
  }
}

function headersDestino(objeto) {
  const headers = { ContentType: objeto.contentType || 'application/octet-stream', Metadata: codificarMetadados(objeto.metadata) };
  for (const [campo, destino] of Object.entries({
    contentType: 'ContentType', cacheControl: 'CacheControl',
    contentDisposition: 'ContentDisposition', contentLanguage: 'ContentLanguage',
  })) if (objeto[campo] !== undefined) headers[destino] = objeto[campo];
  // Evita transcoding/decompressão implícita do fetch alterar os bytes e headers.
  assert.ok(!objeto.contentEncoding || objeto.contentEncoding === 'identity', 'Content-Encoding exige tratamento específico.');
  if (objeto.contentEncoding) headers.ContentEncoding = objeto.contentEncoding;
  if (objeto.expires) headers.Expires = new Date(objeto.expires);
  // Limite conservador de preparação; não remove metadados para contornar excesso.
  const tamanho = Object.entries(headers.Metadata).reduce((n, [k, v]) => n + Buffer.byteLength(k) + Buffer.byteLength(v), 0);
  assert.ok(tamanho <= 1800, 'Metadados exigem revisão de tamanho.');
  return headers;
}

export function conferirMetadados(head, objeto) {
  const esperado = headersDestino(objeto);
  assert.equal(head.ContentLength, Number(objeto.size), 'Tamanho no destino diverge.');
  assert.deepEqual(ordenar(head.Metadata), ordenar(esperado.Metadata), 'Metadados customizados divergem.');
  for (const campo of ['ContentType', 'CacheControl', 'ContentDisposition', 'ContentLanguage', 'ContentEncoding']) {
    assert.equal(head[campo] ?? '', esperado[campo] ?? '', `${campo} diverge.`);
  }
  assert.equal(head.Expires?.getTime() ?? null, esperado.Expires?.getTime() ?? null, 'Expires diverge.');
}

async function executar() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Modo padrão: --planejar. Escopo: --amostra, --arquivo-grande ou --todos. Gravação: --aplicar com escopo e --confirmar-destino=grafica-homolog-arquivos. Token GCS pela entrada padrão; credenciais R2 pelo ambiente.');
    return;
  }
  const modo = opcoes(args, process.env);
  const retomada = modo.retomar ? carregarRetomada(readFileSync('/app/retomada.jsonl', 'utf8')) : new Map();
  assert.ok(!process.stdin.isTTY, 'Forneça token temporário GCS pela entrada padrão, sem salvar no arquivo.');
  const token = readFileSync(0, 'utf8').trim();
  assert.ok(token && !/\s/.test(token), 'Token inválido.');
  const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto', forcePathStyle: true,
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 3, requestHandler: { connectionTimeout: 5000, socketTimeout: 120000 },
  });
  async function gcs(url) {
    assert.equal(url.origin, 'https://storage.googleapis.com');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }, redirect: 'error',
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`GCS_HTTP_${response.status}`);
    }
    return response;
  }
  const objetos = [];
  let pagina;
  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${ORIGEM}/o`);
    url.searchParams.set('maxResults', '500');
    if (pagina) url.searchParams.set('pageToken', pagina);
    const resposta = await (await gcs(url)).json();
    objetos.push(...(resposta.items ?? []));
    pagina = resposta.nextPageToken;
  } while (pagina);
  const selecionados = modo.amostra ? objetos.filter(o => AMOSTRAS.includes(o.name))
    : modo.arquivoGrande ? objetos.filter(o => o.name === ARQUIVO_GRANDE) : objetos.filter(o => !retomada.has(o.name));
  if (modo.amostra) assert.equal(selecionados.length, AMOSTRAS.length, 'Amostra incompleta na origem.');
  if (modo.arquivoGrande) assert.equal(selecionados.length, 1, 'Arquivo grande não encontrado na origem.');
  // Preflight completo antes de qualquer PUT: não começa lote incompatível.
  for (const o of selecionados) {
    assert.ok(o.name && o.generation && o.metageneration, 'Identidade da origem incompleta.');
    assert.ok(Number.isSafeInteger(Number(o.size)) && Number(o.size) >= 0 && Number(o.size) <= LIMITE_OBJETO, 'Objeto fora do limite de transporte (512 MiB).');
    headersDestino(o);
  }
  console.log(JSON.stringify({ evento: 'plano', aplicar: modo.aplicar, origem: ORIGEM, destino: DESTINO,
    objetos: selecionados.length, bytes: selecionados.reduce((n, o) => n + BigInt(o.size), 0n).toString(),
    geradoEm: new Date().toISOString() }));
  // A retomada confere apenas HEAD para conteúdo já validado; não acumula buffers.
  const jaConferidos = new Set();
  if (modo.aplicar && modo.retomar) await emLote(selecionados.filter(o => retomada.has(o.name)), async o => {
    let head;
    try { head = await s3.send(new HeadObjectCommand({ Bucket: DESTINO, Key: o.name })); }
    catch (e) { if (e.$metadata?.httpStatusCode !== 404) throw e; }
    const anterior = retomada.get(o.name);
    if (podeReaproveitar(anterior, o, head)) {
      console.log(JSON.stringify({ ...anterior, reutilizado: true }));
      jaConferidos.add(o.name);
    }
  }, 16);
  await emLote(selecionados.filter(o => !jaConferidos.has(o.name)), async o => {
    const input = { Bucket: DESTINO, Key: o.name };
    let head;
    try { head = await s3.send(new HeadObjectCommand(input)); }
    catch (e) { if (e.$metadata?.httpStatusCode !== 404) throw e; }
    if (!modo.aplicar) {
      if (head) conferirMetadados(head, o);
      console.log(JSON.stringify({ evento: 'planejado', chave: o.name, destinoExiste: Boolean(head), generation: o.generation }));
      return;
    }
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${ORIGEM}/o/${encodeURIComponent(o.name)}`);
    url.searchParams.set('alt', 'media');
    url.searchParams.set('generation', o.generation);
    url.searchParams.set('ifMetagenerationMatch', o.metageneration);
    if (head) conferirMetadados(head, o);
    const anterior = retomada.get(o.name);
    if (podeReaproveitar(anterior, o, head)) {
      console.log(JSON.stringify({ ...anterior, reutilizado: true }));
      return;
    }
    async function copiarEConferir(body, resumo) {
      if (o.md5Hash) assert.equal(resumo.md5, o.md5Hash, 'MD5 da origem diverge.');
      if (!head) {
        try {
          await s3.send(new PutObjectCommand({ ...input, ...headersDestino(o), Body: body,
            ContentLength: resumo.bytes, ContentMD5: resumo.md5, IfNoneMatch: '*' }));
        } catch (e) { if (e.$metadata?.httpStatusCode !== 412) throw e; }
        finally { body.destroy?.(); }
      }
      // Confere inclusive arquivos preexistentes; releitura em fluxo em todos os tamanhos.
      head = await s3.send(new HeadObjectCommand(input));
      conferirMetadados(head, o);
      const leitura = await s3.send(new GetObjectCommand({ ...input, IfMatch: head.ETag }));
      const destino = await resumirFluxo(leitura.Body, Number(o.size));
      assert.equal(destino.sha256, resumo.sha256, 'SHA-256 do destino diverge. Interrompido sem excluir objetos.');
      console.log(JSON.stringify({ evento: 'verificado', chave: o.name, generation: o.generation,
        metageneration: o.metageneration, bytes: resumo.bytes, sha256: resumo.sha256, etag: head.ETag }));
    }
    const origem = (await gcs(url)).body;
    if (Number(o.size) <= LIMITE) {
      const bytes = await lerLimitado(origem, Number(o.size));
      await copiarEConferir(bytes, { bytes: bytes.length, sha256: sha(bytes), md5: createHash('md5').update(bytes).digest('base64') });
    } else {
      await comArquivoTemporario(origem, Number(o.size), async (arquivo, resumo) => {
        // Streams não são repetidos automaticamente pelo SDK; erro exige retomar o lote.
        const stream = head ? undefined : createReadStream(arquivo);
        try { await copiarEConferir(stream, resumo); }
        finally {
          if (stream) {
            stream.destroy();
            if (!stream.closed) await new Promise(resolve => stream.once('close', resolve));
          }
        }
      });
    }
  }, modo.amostra || modo.arquivoGrande ? 1 : 6);
  console.log(JSON.stringify({ evento: 'concluido', aplicar: modo.aplicar, objetos: selecionados.length }));
  s3.destroy();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  executar().catch(error => {
    // Não imprime tokens, credenciais, respostas HTTP completas ou metadados.
    console.error(JSON.stringify({ evento: 'interrompido', tipo: error.name,
      codigo: error.$metadata?.httpStatusCode ?? (/^GCS_HTTP_\d+$/.test(error.message) ? error.message : 'CONSULTAR_VALIDACAO') }));
    process.exitCode = 1;
  });
}
