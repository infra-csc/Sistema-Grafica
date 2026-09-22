// ─────────────────────────────────────────────────────────────────────────────
// MINIATURAS NO SERVIDOR (auditoria de performance, 27/08 — "pode fazer o
// resto"). As listas exibiam o ARQUIVO ORIGINAL (até dezenas de MB) em caixas
// de 12–80px; o `loading="lazy"` da Onda 2 adiou o custo, isto aqui o elimina:
// /objects/...?thumb=1 devolve um webp de até 320px.
//
// O SHARP É OPCIONAL, de propósito: o binário nativo só existe depois do
// `npm install` do deploy (o ambiente local desta base não instala pacote).
// Por isso o require dinâmico tolerante — sem o pacote, quem pedir ?thumb=1
// recebe o ORIGINAL, que é exatamente o comportamento de ontem. Nada quebra
// em nenhum dos dois mundos.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let sharp: any = null;
try {
  sharp = require("sharp");
} catch {
  console.log("[miniaturas] sharp não instalado — servindo originais. Para ligar: npm install sharp (no Replit) e republicar.");
}

export const miniaturasDisponiveis = (): boolean => !!sharp;

/** Só faz sentido miniaturizar imagem raster; PDF/SVG/vídeo seguem originais. */
export const tipoMiniaturavel = (contentType: string): boolean =>
  /^image\/(jpe?g|png|webp|avif|gif|tiff?)$/i.test(contentType);

// Teto do original que aceitamos carregar em memória para redimensionar — um
// upload de 50MB não pode virar 50MB de heap por request de lista.
export const TETO_ORIGINAL_BYTES = 25 * 1024 * 1024;

// LRU simples em memória: a miniatura sai a ~10–30KB; 300 entradas ≈ poucos
// MB, e o Cache-Control do browser segura o resto. Reinício do processo só
// custa re-gerar sob demanda.
const CACHE = new Map<string, Buffer>();
const CACHE_MAX = 300;

// ─────────────────────────────────────────────────────────────────────────────
// A MINIATURA GRAVADA NO UPLOAD (perf, 2ª rodada).
//
// O desenho de 27/08 gerava a miniatura A PEDIDO: cada falta no LRU (300
// entradas, na memória de CADA cópia do processo) baixava o ORIGINAL de até
// 25 MB do bucket e chamava o sharp — no meio de uma lista com dezenas de
// thumbs, num reinício ou numa segunda cópia do app, isso é dezenas de
// downloads de MBs e dezenas de resizes para desenhar caixas de 80px.
//
// Agora a miniatura nasce no UPLOAD e vai para o próprio object storage, ao
// lado do original (`<caminho-do-original>/thumb.webp`). Servir passa a ser um
// download de ~10–30 KB, sem sharp, sem LRU e sem o original.
//
// A geração a pedido CONTINUA, como plano B: é o que atende tudo que já está
// no bucket (o dono proíbe mexer em dados antigos, então não há backfill) e o
// upload cuja gravação da miniatura falhou. Nada quebra em nenhum dos dois
// mundos — que é a mesma promessa do sharp opcional acima.
//
// O `File` do @google-cloud/storage entra por tipagem estrutural de propósito:
// este serviço não conhece o objectStorage.ts, só precisa de `name`, `bucket`,
// `exists`, `download` e `save`.
// ─────────────────────────────────────────────────────────────────────────────

/** O mínimo do File do bucket que este serviço usa. */
export interface ArquivoDoBucket {
  name: string;
  bucket: { file(nome: string): ArquivoDoBucket };
  exists(): Promise<[boolean]>;
  download(): Promise<[Buffer]>;
  save(dados: Buffer, opcoes?: { contentType?: string; resumable?: boolean }): Promise<unknown>;
}

/** Onde mora a miniatura de um objeto: irmã do original, com nome fixo. */
export const NOME_DA_MINIATURA = "thumb.webp";
export const caminhoDaMiniatura = (nomeDoOriginal: string): string =>
  `${nomeDoOriginal}/${NOME_DA_MINIATURA}`;

/** A miniatura JÁ GRAVADA, ou null (não existe, ou o bucket recusou). */
export async function lerMiniaturaGravada(original: ArquivoDoBucket): Promise<Buffer | null> {
  try {
    const arquivo = original.bucket.file(caminhoDaMiniatura(original.name));
    const [existe] = await arquivo.exists();
    if (!existe) return null;
    const [bytes] = await arquivo.download();
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Gera e GRAVA a miniatura ao lado do original. Devolve `true` quando gravou.
 *
 * Nunca lança: a miniatura é um acessório do upload — o arquivo do usuário já
 * está salvo, e falhar aqui não pode transformar um upload bem-sucedido em
 * erro na tela. O pior caso é a miniatura voltar a ser gerada a pedido.
 */
export async function gravarMiniaturaDoUpload(
  arquivo: ArquivoDoBucket,
  original: Buffer,
  contentType: string,
): Promise<boolean> {
  if (!sharp || !tipoMiniaturavel(contentType) || original.length > TETO_ORIGINAL_BYTES) return false;
  try {
    const mini = await redimensionar(original);
    if (!mini) return false;
    await arquivo.bucket.file(caminhoDaMiniatura(arquivo.name))
      .save(mini, { contentType: "image/webp", resumable: false });
    return true;
  } catch (e) {
    console.error("[miniaturas] não foi possível gravar a miniatura do upload — segue a geração a pedido", e);
    return false;
  }
}

/** O resize em si, sem cache — o único ponto que chama o sharp. */
async function redimensionar(original: Buffer): Promise<Buffer | null> {
  try {
    return await sharp(original)
      .rotate() // respeita EXIF — foto de celular deitada não vira miniatura deitada
      .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
  } catch {
    // imagem corrompida/formato exótico: o chamador serve o original
    return null;
  }
}

export async function gerarMiniatura(chave: string, original: Buffer): Promise<Buffer | null> {
  if (!sharp) return null;
  const pronta = CACHE.get(chave);
  if (pronta) {
    CACHE.delete(chave);
    CACHE.set(chave, pronta); // renova a posição no LRU
    return pronta;
  }
  const saida = await redimensionar(original);
  if (!saida) return null;
  CACHE.set(chave, saida);
  if (CACHE.size > CACHE_MAX) {
    const maisAntiga = CACHE.keys().next().value;
    if (maisAntiga !== undefined) CACHE.delete(maisAntiga);
  }
  return saida;
}
