import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Texto pronto para COMPARAÇÃO DE BUSCA: minúscula, SEM ACENTO e com espaço
 * colapsado.
 *
 * Por que existe: os menus de filtro casavam com `label.toLowerCase()
 * .includes(termo.toLowerCase())`, que é cego a acento. Nomes de evento são
 * escritos em caixa alta e com acento ("SÓ QUERO PEDALAR SP"), então digitar
 * "so quero" no dropdown devolvia "Nenhum evento encontrado" — o evento existia
 * na lista, tinha peça na tela, e mesmo assim não era oferecido. Quem digita
 * não desconfia do acento: conclui que a opção não está lá.
 *
 * Fonte ÚNICA da normalização de busca do app (os dois menus de filtro e o
 * campo de busca da Gráfica). Duas implementações divergentes disto foi
 * exatamente como o defeito nasceu.
 */
export const normalizarBusca = (s: string | null | undefined): string =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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

// Rótulos amigáveis dos papéis — `capitalize` cru exibia "Solicitacao"/
// "Grafica" sem acento. Fonte única para sidebar, topbar e onde mais precisar.
export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  solicitacao: "Solicitação",
  arte: "Arte",
  grafica: "Gráfica",
  atendimento: "Atendimento",
};
export const roleLabel = (role?: string | null): string =>
  (role && ROLE_LABELS[role]) || role || "";

// Iniciais do avatar (topbar e sidebar): duas primeiras palavras do nome.
// Fonte única — antes cada avatar tinha a própria regra e fallbacks
// divergentes ("U" na sidebar, "?" na topbar).
export function userInitials(name?: string | null): string {
  if (!name) return "?";
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return initials || "?";
}
