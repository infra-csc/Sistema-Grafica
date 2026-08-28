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

export async function gerarMiniatura(chave: string, original: Buffer): Promise<Buffer | null> {
  if (!sharp) return null;
  const pronta = CACHE.get(chave);
  if (pronta) {
    CACHE.delete(chave);
    CACHE.set(chave, pronta); // renova a posição no LRU
    return pronta;
  }
  try {
    const saida: Buffer = await sharp(original)
      .rotate() // respeita EXIF — foto de celular deitada não vira miniatura deitada
      .resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    CACHE.set(chave, saida);
    if (CACHE.size > CACHE_MAX) {
      const maisAntiga = CACHE.keys().next().value;
      if (maisAntiga !== undefined) CACHE.delete(maisAntiga);
    }
    return saida;
  } catch {
    // imagem corrompida/formato exótico: o chamador serve o original
    return null;
  }
}
