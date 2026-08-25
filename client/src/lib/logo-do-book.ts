// ─────────────────────────────────────────────────────────────────────────────
// O LOGO DA PROVA, EXTRAÍDO DO BOOK (pedido do dono, 25/08).
//
// O cadastro não tem logo por evento, mas o book subido TEM — a capa é o
// logo centrado num fundo liso (medido no exemplar: página 1 sem bitmaps,
// logo em curvas). Rasterizamos a capa com o pdf.js e recortamos a caixa do
// que não é fundo: sai uma imagem do logo pronta para a etiqueta.
//
// O recorte é uma função PURA sobre os pixels (recortarCaixaDoConteudo), com
// o fundo lido do canto e uma tolerância — testável sem PDF nem canvas.
// ─────────────────────────────────────────────────────────────────────────────
import { convertGCSUrlToLocalPath } from "./artePdfExport";

/**
 * A caixa do conteúdo: menor retângulo que contém todo pixel diferente do
 * fundo (a cor do canto superior-esquerdo), com tolerância por canal somada.
 * Devolve null quando a página é toda fundo — não há o que recortar.
 */
export function recortarCaixaDoConteudo(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  tolerancia = 30,
): { x: number; y: number; w: number; h: number } | null {
  if (w <= 0 || h <= 0 || px.length < w * h * 4) return null;
  const bg = [px[0], px[1], px[2]];
  const difere = (i: number) =>
    Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > tolerancia;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (difere((y * w + x) * 4)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  // Folga de 3% para o traço não encostar na borda do recorte.
  const folgaX = Math.round(w * 0.03);
  const folgaY = Math.round(h * 0.03);
  return {
    x: Math.max(0, minX - folgaX),
    y: Math.max(0, minY - folgaY),
    w: Math.min(w, maxX + folgaX + 1) - Math.max(0, minX - folgaX),
    h: Math.min(h, maxY + folgaY + 1) - Math.max(0, minY - folgaY),
  };
}

/**
 * Rasteriza a capa do book e devolve o logo recortado como data URI (PNG),
 * ou null quando não deu (sem book, capa toda lisa, pdf.js falhou). Nunca
 * lança: logo é enfeite obrigatório, não pré-requisito — a etiqueta sem ele
 * continua saindo.
 */
export async function logoDaCapaDoBook(bookUrl: string): Promise<string | null> {
  // CACHE por book (25/08): extrair leva segundos, e o dono quer o logo já
  // presente ao abrir a tela. A chave é a URL do book — book novo, logo novo.
  // O localStorage pode recusar (quota, aba anônima): falha de cache nunca
  // vira falha de logo, então cada acesso vai em try/catch próprio.
  const CHAVE = "norte:logo-book:" + bookUrl;
  try {
    const guardado = localStorage.getItem(CHAVE);
    if (guardado) return guardado;
  } catch { /* sem cache, segue a extração normal */ }
  try {
    const pdfjs = await import("pdfjs-dist");
    const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    const doc = await pdfjs.getDocument({ url: convertGCSUrlToLocalPath(bookUrl) }).promise;
    if (doc.numPages < 1) return null;
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    // ~900px de largura: nítido na etiqueta impressa sem pesar a página.
    const vp = page.getViewport({ scale: 900 / vp1.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(vp.width);
    canvas.height = Math.ceil(vp.height);
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;

    const dados = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const caixa = recortarCaixaDoConteudo(dados.data, canvas.width, canvas.height);
    if (!caixa || caixa.w < 20 || caixa.h < 20) return null;

    const corte = document.createElement("canvas");
    corte.width = caixa.w;
    corte.height = caixa.h;
    corte.getContext("2d")!.drawImage(canvas, caixa.x, caixa.y, caixa.w, caixa.h, 0, 0, caixa.w, caixa.h);
    const dataUrl = corte.toDataURL("image/png");
    try { localStorage.setItem(CHAVE, dataUrl); } catch { /* quota cheia: sem cache, com logo */ }
    return dataUrl;
  } catch {
    return null;
  }
}
