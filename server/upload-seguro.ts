// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD SEGURO — o que entra no bucket e como sai dele.
//
// O arquivo é servido pela MESMA origem do app (/objects/*). Um HTML ou SVG
// enviado como "anexo" abriria com a sessão de quem clicasse (XSS). Por isso:
//   · entrada: só a lista fechada abaixo, e o tipo é decidido pelos BYTES do
//     arquivo, não pelo Content-Type que o navegador declarou;
//   · saída: nosniff sempre; sandbox + download forçado para o que não for
//     imagem raster ou PDF (objetos antigos podem ter qualquer tipo gravado).
// ─────────────────────────────────────────────────────────────────────────────

export const TIPOS_PERMITIDOS = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
] as const;

export type TipoPermitido = (typeof TIPOS_PERMITIDOS)[number];

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Declarações que não dizem nada (o navegador manda quando não sabe). */
const DECLARACAO_GENERICA = new Set(["", "application/octet-stream", "binary/octet-stream"]);

function comeca(buf: Buffer, bytes: number[], deslocamento = 0): boolean {
  if (buf.length < deslocamento + bytes.length) return false;
  return bytes.every((b, i) => buf[deslocamento + i] === b);
}

/** O tipo real pelos bytes mágicos, ou null quando não é nenhum dos aceitos. */
export function detectarTipoReal(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "application/pdf" | "zip" | null {
  if (comeca(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (comeca(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(buf, [0x52, 0x49, 0x46, 0x46]) && comeca(buf, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (comeca(buf, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  // "%PDF-" pode vir depois de lixo curto no começo (o Acrobat tolera 1 KB).
  if (buf.subarray(0, 1024).includes("%PDF-")) return "application/pdf";
  // Zip local, vazio ou "spanned": xlsx é um zip.
  if (comeca(buf, [0x50, 0x4b, 0x03, 0x04]) || comeca(buf, [0x50, 0x4b, 0x05, 0x06]) || comeca(buf, [0x50, 0x4b, 0x07, 0x08])) return "zip";
  return null;
}

function limparDeclarado(declarado: string | undefined | null): string {
  return String(declarado ?? "").split(";")[0].trim().toLowerCase();
}

/** O tipo declarado pode seguir para a checagem dos bytes? (svg, html, texto: não) */
export function declaracaoAceita(declarado: string | undefined | null): boolean {
  const d = limparDeclarado(declarado);
  return DECLARACAO_GENERICA.has(d) || (TIPOS_PERMITIDOS as readonly string[]).includes(d) || d === "image/jpg";
}

export type ResultadoDoUpload =
  | { ok: true; tipo: TipoPermitido }
  | { ok: false; erro: string };

/**
 * Decide se o arquivo entra e com qual Content-Type fica gravado. O tipo
 * gravado é o dos BYTES: um "image/png" que na verdade é PDF fica PDF; um
 * zip declarado como planilha fica planilha (xlsx é zip por dentro).
 */
export function avaliarUpload(buf: Buffer, declarado: string | undefined | null): ResultadoDoUpload {
  if (!declaracaoAceita(declarado)) {
    return { ok: false, erro: "Tipo de arquivo não permitido. Envie imagem (PNG, JPG, WEBP, GIF), PDF, planilha .xlsx ou .zip." };
  }
  const real = detectarTipoReal(buf);
  if (!real) {
    return { ok: false, erro: "O conteúdo do arquivo não é imagem, PDF, planilha .xlsx nem .zip." };
  }
  if (real === "zip") {
    return { ok: true, tipo: limparDeclarado(declarado) === XLSX ? XLSX : "application/zip" };
  }
  return { ok: true, tipo: real };
}

const RASTER = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

/**
 * Cabeçalhos de segurança para servir um objeto. Imagem raster e PDF abrem no
 * navegador; o resto (inclusive tipos antigos gravados antes da lista fechada,
 * como SVG, HTML ou texto) vai como download, isolado em sandbox.
 * O PDF não leva `sandbox`: o visualizador de PDF do Chrome se recusa a abrir
 * documento em sandbox, e o PDF não roda script na origem do app.
 */
export function cabecalhosDoObjeto(contentType: string | null | undefined): Record<string, string> {
  const tipo = limparDeclarado(contentType);
  const cabecalhos: Record<string, string> = { "X-Content-Type-Options": "nosniff" };
  if (tipo === "application/pdf") return cabecalhos;
  cabecalhos["Content-Security-Policy"] = "sandbox; default-src 'none'";
  if (!RASTER.has(tipo)) cabecalhos["Content-Disposition"] = "attachment";
  return cabecalhos;
}

/** Tamanho máximo aceito em qualquer caminho de upload. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * O pedido de URL assinada (caminho legado): o bucket não amarra tipo nem
 * tamanho a essa URL, então o mínimo é exigir que o pedido declare um tipo
 * da lista e um tamanho dentro do teto. O que é servido depois ainda passa
 * por `cabecalhosDoObjeto`.
 */
export function avaliarPedidoDeUrlAssinada(corpo: { contentType?: unknown; size?: unknown } | undefined): string | null {
  const tipo = limparDeclarado(typeof corpo?.contentType === "string" ? corpo.contentType : "");
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(tipo)) {
    return "Informe o tipo do arquivo (imagem, PDF, planilha .xlsx ou .zip).";
  }
  const tamanho = corpo?.size;
  if (typeof tamanho !== "number" || !Number.isFinite(tamanho) || tamanho <= 0) {
    return "Informe o tamanho do arquivo.";
  }
  if (tamanho > MAX_UPLOAD_BYTES) return "Arquivo muito grande (máximo 50 MB)";
  return null;
}
