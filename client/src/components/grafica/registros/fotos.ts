// Tipos e funções puras do acervo de Registros (pages/registros.tsx): a forma
// da foto que /api/photos devolve e os rótulos/URLs derivados dela.
import { FileCheck, Truck } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { TOM } from "@/lib/theme";

export const KIND = {
  conference: { label: "Conferência", color: TOM.ciano.text, bg: TOM.ciano.bg, border: TOM.ciano.border, icon: FileCheck },
  delivery:   { label: "Entrega",     color: TOM.roxo.text, bg: TOM.roxo.bg, border: TOM.roxo.border, icon: Truck },
} as const;

export type Kind = keyof typeof KIND;

// Forma real do payload de /api/photos: um campo renomeado no servidor vira
// erro de tipo aqui, e não uma célula vazia em produção.
export interface Photo {
  id: string;
  kind?: string;
  /** Id da peça. Vem do payload desde sempre; faltava aqui. É por ele que as
   *  duas fotos da mesma peça se acham — `displayId` é editável. */
  itemId?: string;
  photoUrl?: string;
  eventId?: string;
  eventName?: string;
  displayId?: string;
  itemType?: string;
  itemDescription?: string;
  receivedBy?: string;
  uploadedBy?: string;
  createdAt?: string;
  conferenceNotes?: string;
  deliveryNotes?: string;
}

/** Opção de um filtro facetado (tipo, evento, período) com a sua contagem. */
export type OpcaoDeFiltro = { value: string; label: string; count: number };

export const PAGE_SIZE = 60;

export const PERIODS = ["Hoje", "7 dias", "15 dias", "30 dias", "Todos"] as const;
export type Period = typeof PERIODS[number];
export const PERIOD_DAYS: Record<string, number> = { "Hoje": 0, "7 dias": 7, "15 dias": 15, "30 dias": 30 };

export const kindOf = (p: Photo): Kind => (p.kind === "conference" ? "conference" : "delivery");

/** Chave da PEÇA. `itemId` primeiro; `displayId` só como rede. */
export const pecaDe = (p: Photo): string => p.itemId || p.displayId || "";

const MS_DIA = 86_400_000;

/**
 * Rótulo do dia: "Hoje", "Ontem", ou a data escrita.
 *
 * Comparação por DIA CIVIL (zerando a hora dos dois lados), não por diferença
 * de milissegundos: às 00h30 uma foto das 23h de ontem está a uma hora de
 * distância e mesmo assim é de ontem.
 */
export function rotuloDoDia(iso: string, hoje: Date): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sem data";
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  if (dia === base) return "Hoje";
  if (dia === base - MS_DIA) return "Ontem";
  return format(d, "d 'de' MMMM", { locale: ptBR });
}
// Registros antigos guardaram a URL assinada do GCS, que expira; o app serve
// os arquivos por /objects/...
export const srcOf = (p: Photo) => convertGCSUrlToLocalPath(p.photoUrl || "");

export const fmt = (d?: string) => (d ? format(new Date(d), "dd/MM/yy HH:mm", { locale: ptBR }) : "—");

/** Texto que descreve a foto para quem não a vê. */
export const altOf = (p: Photo) =>
  [KIND[kindOf(p)].label, p.displayId, p.itemType, p.eventName].filter(Boolean).join(" — ");
