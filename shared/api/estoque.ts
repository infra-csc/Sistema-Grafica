// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DO ACERVO (server/routes/inventory.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { InventoryAsset, Item } from "../schema";
import type { Json } from "./json";

/** Linha do acervo como chega pelo cabo. */
export type AtivoJson = Json<InventoryAsset>;

/** Elemento de GET /api/inventory — a linha + o evento da peça de origem (left join). */
export type AtivoDoAcervo = AtivoJson & { origemEventId: string | null };

/** Elemento de GET /api/inventory/awaiting-triage — a fila da Triagem de Retorno. */
export type AtivoNaTriagem = AtivoJson & {
  eventId: string | null;
  eventName: string | null;
  eventDate: string | null;
  sponsors: Array<{ id: string; name: string }>;
};

/**
 * GET /api/inventory/:id/origem — a peça de ORIGEM do ativo (só as colunas do
 * detalhe) e os patrocinadores dela; `null` quando o ativo não veio de peça.
 */
export type OrigemDoAtivo = Pick<
  Json<Item>,
  "id" | "displayId" | "eventId" | "type" | "material" | "finish" | "measurement"
  | "visualWidth" | "visualHeight" | "quantity" | "calculatedM2"
> & { sponsors: Array<{ id: string; name: string }> };
