// ─────────────────────────────────────────────────────────────────────────────
// OS TIPOS DA FICHA DA PEÇA.
//
// A ficha abre em seis telas, e cada uma monta a peça do seu jeito (o enrich de
// /api/items, a linha da fila da Gráfica, a peça do Painel). Por isso os campos
// são todos opcionais e aceitam as duas formas de data (string do JSON ou Date
// já convertido): o tipo descreve o que a ficha LÊ, não o que cada tela tem.
// ─────────────────────────────────────────────────────────────────────────────
import type { PecaComProducao } from "@/lib/detalhe-producao";
import type { PecaTravavel } from "@shared/trava-da-peca";
import type { PecaDividivel } from "@shared/impressao-dividida";
import type { EventoFinalizavel } from "@/lib/status";

type Data = string | Date | null;
type Decimal = string | number | null;

/** O evento cru que o enrich de /api/items pendura na peça. */
export interface EventoDaFicha extends EventoFinalizavel {
  name?: string | null;
  truckDepartureDate?: Data;
  prazoMolde?: Data;
}

export interface PatrocinadorDaFicha {
  id: string;
  name?: string | null;
  color?: string | null;
}

/** Uma linha de /api/items/:id/sponsor-approvals (ou de `item.sponsorApprovals`). */
export interface AprovacaoDaFicha {
  sponsorId?: string | null;
  status?: string | null;
  /** Forma antiga, anterior ao `status`. */
  approved?: boolean | null;
  approvedAt?: Data;
  approvedBy?: string | null;
  rejectedAt?: Data;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
}

/** Uma foto de /api/items/:id/photos. */
export interface FotoDaPeca {
  kind?: string | null;
  photoUrl: string;
}

/** Evento de /api/events, só no que o seletor de transferência lê. */
export interface EventoParaTransferir {
  id: string;
  name: string;
}

/**
 * Registro do audit log. Aceita as duas grafias (camelCase do Drizzle e
 * snake_case de consultas cruas), como a ficha sempre aceitou.
 */
export interface RegistroDaFicha {
  id?: string | number | null;
  action?: string | null;
  details?: string | null;
  entityId?: string | null;
  entity_id?: string | null;
  createdAt?: Data;
  created_at?: Data;
  userName?: string | null;
  user_name?: string | null;
}

export interface ItemDaFicha extends PecaComProducao, PecaTravavel, PecaDividivel {
  id: string;
  displayId?: string | null;
  eventId?: string | null;
  event?: EventoDaFicha | null;
  description?: string | null;
  type?: string | null;
  material?: string | null;
  finish?: string | null;
  measurement?: string | null;
  status?: string | null;
  quantity?: number | null;
  reuseQty?: number | null;
  quantityProduced?: number | null;
  conferredQty?: number | null;
  deliveredQty?: number | null;
  calculatedM2?: Decimal;
  fileWidth?: Decimal;
  fileHeight?: Decimal;
  visualWidth?: Decimal;
  visualHeight?: Decimal;
  printShop?: string | null;
  observations?: string | null;
  motivoCancelamento?: string | null;
  referenceUrl?: string | null;
  referenceUrls?: (string | null)[] | null;
  sponsors?: PatrocinadorDaFicha[] | null;
  sponsorApprovals?: AprovacaoDaFicha[] | null;
  approvalThumbUrl?: string | null;
  approvalThumbUpdatedAt?: Data;
  previousApprovalThumbUrl?: string | null;
  finalFileUrl?: string | null;
  finalFileName?: string | null;
  finalFileUpdatedAt?: Data;
  previousFinalFileUrl?: string | null;
  previousFinalFileName?: string | null;
  bookUrl?: string | null;
  bookPage?: number | string | null;
  conferencePhotoUrl?: string | null;
  deliveryPhotoUrl?: string | null;
  conferenceNotes?: string | null;
  deliveryNotes?: string | null;
  createdAt?: Data;
  updatedAt?: Data;
  sponsorApprovedAt?: Data;
  sponsorApprovedBy?: string | null;
  creatorReviewedAt?: Data;
  approvedAt?: Data;
  productionStartedAt?: Data;
  producedAt?: Data;
  conferredAt?: Data;
  deliveredAt?: Data;
}

/** Os três campos que o "Editar" da especificação abre. */
export type CampoEditavel = "type" | "material" | "finish";

/** Um acontecimento do percurso — log ou carimbo do item. */
export type EventoDoPercurso = { chave: string; ts: number; texto: string; autor: string | null; cor: string };
