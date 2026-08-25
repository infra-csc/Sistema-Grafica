// ─────────────────────────────────────────────────────────────────────────────
// GERADOR DO BOOK — monta o PDF no padrão do exemplar manual, no navegador.
//
// Toda medida vem de book-spec.ts (a régua única — a prévia HTML lê a mesma).
// A saída são os bytes do PDF, prontos para o caminho que o book manual já
// percorre: PUT /api/objects/upload-direct → POST /api/events/:id/book.
//
// DECISÕES:
//  · pdf-lib no CLIENTE: já é dependência, roda no navegador, e reusar o
//    upload existente evita ensinar o servidor a escrever no storage por um
//    segundo caminho. O custo (gerar na máquina de quem clica) é o mesmo que
//    o upload manual de 6,6 MB já cobra hoje.
//  · Fontes padrão (Helvetica): o rótulo do exemplar é um subset sem nome
//    legível ("sans-serif", 12 pt) — Helvetica é o equivalente honesto sem
//    embutir fonte nenhuma. Se a Arte nomear a família, trocamos aqui.
//  · Artes reamostradas em canvas para JPEG ≤1600 px: qualidade do exemplar
//    (6,6 MB/13 páginas) sem estourar o e-mail do book.
//  · Sem logo do evento cadastrado (lacuna aceita pelo dono, 25/08): a capa
//    leva o NOME do evento no fundo claro do exemplar, e a assinatura do
//    rodapé leva o nome em 8 pt onde o manual põe o logo.
// ─────────────────────────────────────────────────────────────────────────────
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { BOOK, celulasDaPagina, encaixeContain, type PaginaDoBook } from "./book-spec";
import { convertGCSUrlToLocalPath } from "./artePdfExport";

const cor = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Baixa a arte e reamostra para JPEG (bytes + dimensões). Lança em falha. */
async function arteComoJpeg(url: string): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const local = convertGCSUrlToLocalPath(url);
  const resp = await fetch(local.startsWith("/") ? local : url, { credentials: "include" });
  if (!resp.ok) throw new Error(`arte não carregou (${resp.status})`);
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  const escala = Math.min(1, BOOK.ARTE_LARGURA_MAX / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * escala));
  const h = Math.max(1, Math.round(bmp.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // Fundo branco: JPEG não tem alfa — PNG transparente viraria fundo preto.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const jpeg: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("canvas vazio"))), "image/jpeg", BOOK.ARTE_JPEG_QUALIDADE),
  );
  return { bytes: new Uint8Array(await jpeg.arrayBuffer()), w, h };
}

export interface ProgressoDoBook { etapa: string; feito: number; total: number }

/**
 * Gera o PDF do book. `paginas` já vem paginado (book-spec.paginarGrupos);
 * peça sem arte carregável entra como falha em `falhas` e a página segue —
 * quem gera decide se publica mesmo assim.
 */
export async function gerarBookPdf(
  nomeDoEvento: string,
  paginas: PaginaDoBook[],
  aoProgredir?: (p: ProgressoDoBook) => void,
): Promise<{ bytes: Uint8Array; falhas: Array<{ displayId: string; motivo: string }> }> {
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const falhas: Array<{ displayId: string; motivo: string }> = [];

  // ── Capa: fundo claro do exemplar, identidade centrada ──
  const capa = doc.addPage([BOOK.LARGURA, BOOK.ALTURA]);
  capa.drawRectangle({ x: 0, y: 0, width: BOOK.LARGURA, height: BOOK.ALTURA, color: cor(BOOK.CAPA_FUNDO) });
  {
    const maxW = BOOK.LARGURA * BOOK.MIOLO_FRACAO;
    let corpo = 44;
    while (corpo > 18 && fonteBold.widthOfTextAtSize(nomeDoEvento, corpo) > maxW) corpo -= 2;
    const w = fonteBold.widthOfTextAtSize(nomeDoEvento, corpo);
    capa.drawText(nomeDoEvento, {
      x: (BOOK.LARGURA - w) / 2,
      y: BOOK.ALTURA / 2 - corpo / 2,
      size: corpo, font: fonteBold, color: cor(BOOK.CAPA_TEXTO),
    });
  }

  // ── Páginas de grupo ──
  const totalArtes = paginas.reduce((s, p) => s + p.itens.length, 0);
  let feitas = 0;
  for (const pagina of paginas) {
    const page = doc.addPage([BOOK.LARGURA, BOOK.ALTURA]);
    const celulas = celulasDaPagina(pagina.itens.length);

    for (let i = 0; i < pagina.itens.length; i++) {
      const item = pagina.itens[i];
      aoProgredir?.({ etapa: `Arte de ${item.displayId}`, feito: ++feitas, total: totalArtes });
      try {
        const arte = await arteComoJpeg(item.approvalThumbUrl);
        const img = await doc.embedJpg(arte.bytes);
        const box = encaixeContain(celulas[i], arte.w, arte.h);
        // book-spec usa origem no topo; o PDF, no fundo — converte aqui.
        page.drawImage(img, { x: box.x, y: BOOK.ALTURA - box.y - box.h, width: box.w, height: box.h });
      } catch (e: any) {
        falhas.push({ displayId: item.displayId, motivo: e?.message ?? "falha ao carregar" });
      }
    }

    // ── Rodapé assinado, nas medidas do exemplar ──
    const baseline = BOOK.RODAPE_BASELINE_DO_FUNDO;
    page.drawText(nomeDoEvento, {
      x: BOOK.ASSINATURA_X, y: baseline, size: BOOK.ASSINATURA_PT,
      font: fonte, color: cor("#78716c"),
    });
    page.drawLine({
      start: { x: BOOK.BARRA_X, y: baseline - 4 },
      end: { x: BOOK.BARRA_X + 8, y: baseline + 12 },
      thickness: 1, color: cor("#a8a29e"),
    });
    page.drawText(pagina.rotulo, {
      x: BOOK.RODAPE_ROTULO_X, y: baseline, size: BOOK.RODAPE_ROTULO_PT,
      font: fonte, color: cor("#1c1917"),
    });
  }

  return { bytes: await doc.save(), falhas };
}

/** Sobe o PDF pelo caminho do upload manual e devolve a URL do objeto. */
export async function subirBookPdf(bytes: Uint8Array): Promise<string> {
  const resp = await fetch("/api/objects/upload-direct", {
    method: "PUT",
    body: new Blob([bytes as BlobPart], { type: "application/pdf" }),
    headers: { "Content-Type": "application/pdf" },
    credentials: "include",
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({} as { error?: string }));
    throw new Error((body as { error?: string }).error || "Falha no upload do book");
  }
  const { url } = (await resp.json()) as { url: string };
  return url;
}
