import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a YYYY-MM-DD date string as LOCAL noon to avoid UTC midnight
 * rolling back to the previous day in UTC-offset timezones (e.g. UTC-3).
 */
export function parseDateLocal(dateStr: string): Date {
  const datePart = dateStr.includes('T') ? dateStr.slice(0, 10) : dateStr;
  return new Date(datePart + "T12:00:00");
}

/**
 * truckDepartureDate is stored as UTC but the value the user typed (e.g. "15:11")
 * IS the intended local display time — no offset conversion was applied on save.
 * To make date-fns format() show the UTC value instead of the local value,
 * shift the Date by the browser's UTC offset so local rendering == UTC value.
 */
export function toUTCDisplayDate(dateStr: string): Date {
  const d = new Date(dateStr);
  return new Date(d.getTime() + d.getTimezoneOffset() * 60000);
}

/**
 * Executa tarefas assíncronas em lotes com concorrência limitada.
 * Evita esgotar o pool de conexões do banco quando muitos itens (ex: 50)
 * são salvos/enviados de uma vez — causa de falhas intermitentes em massa.
 */
export async function runInBatches<T>(
  inputs: T[],
  task: (input: T) => Promise<unknown>,
  batchSize = 5,
): Promise<void> {
  for (let i = 0; i < inputs.length; i += batchSize) {
    await Promise.all(inputs.slice(i, i + batchSize).map(task));
  }
}

// Extrai o nome do arquivo de um caminho (rede/URL) quando ele aponta para um
// ARQUIVO (tem extensão conhecida). Retorna null quando é uma PASTA — assim a
// UI pode avisar a Arte para colar o caminho do arquivo específico, evitando
// que a Gráfica pegue o arquivo errado dentro da pasta.
const FINAL_FILE_EXT_RE = /\.(ai|pdf|tiff?|jpe?g|png|psd|eps|cdr|svg|indd|zip|rar|bmp|gif|webp)$/i;

export function fileNameFromPath(p?: string | null): string | null {
  if (!p) return null;
  const seg = String(p).trim().replace(/[\/]+$/, "").split(/[\/]/).pop() || "";
  return FINAL_FILE_EXT_RE.test(seg) ? seg : null;
}

/** Pasta que contém o arquivo (tudo antes do último separador), ou o próprio caminho. */
export function folderFromPath(p?: string | null): string {
  if (!p) return "";
  const s = String(p).trim().replace(/[\/]+$/, "");
  const idx = Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/"));
  return idx > 0 ? s.slice(0, idx) : s;
}
