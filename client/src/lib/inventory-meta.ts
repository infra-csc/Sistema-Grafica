/**
 * Metadados de condição dos ativos de estoque — fonte única.
 *
 * Antes cada tela (estoque, triagem-retorno, triagem-modal) mantinha sua
 * própria cópia de CONDITION_META, com labels e cores divergentes
 * ("Avaria" × "Avaria Leve", #d97706 × #b45309). Este módulo é a única
 * definição; as três telas importam daqui.
 *
 * Decisão de unificação: label "Avaria Leve", cor #b45309 (âmbar-700,
 * contraste AA sobre fundos claros).
 */
import type { ElementType } from "react";
import { Sparkles, Hammer, Trash2 } from "lucide-react";
import type { InventoryAsset } from "@shared/schema";

export const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
export type Condition = (typeof CONDITIONS)[number];

export interface ConditionMeta {
  label: string;
  /** Cor de texto/ícone. */
  color: string;
  /** Fundo claro para chips/pills. */
  bg: string;
  /** Borda para estados selecionados. */
  border: string;
  /** Fundo mais saturado para toggle ativo. */
  activeBg: string;
  Icon: ElementType;
}

// Cores de texto no tom 700 (#15803d / #b45309 / #b91c1c): os tons 600
// reprovavam contraste AA sobre os fundos claros dos chips.
export const CONDITION_META: Record<Condition, ConditionMeta> = {
  PERFEITO:    { label: "Perfeito",    color: "#15803d", bg: "#f0fdf4", border: "#86efac", activeBg: "#dcfce7", Icon: Sparkles },
  AVARIA_LEVE: { label: "Avaria Leve", color: "#b45309", bg: "#fffbeb", border: "#fcd34d", activeBg: "#fef3c7", Icon: Hammer },
  SUCATA:      { label: "Sucata",      color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5", activeBg: "#fee2e2", Icon: Trash2 },
};

/**
 * Payload de /api/inventory/awaiting-triage — o servidor enriquece o ativo
 * com evento (id/nome/data) e patrocinadores resolvidos. Tipo único,
 * importado por triagem-retorno e pelo TriagemModal.
 */
export type EnrichedAsset = InventoryAsset & {
  eventId: string | null;
  eventName: string | null;
  eventDate: string | null;
  sponsors: { id: string; name: string }[];
};

/**
 * Acesso seguro quando a condição vem do banco como `string | null` —
 * cai em PERFEITO se o valor for nulo ou desconhecido.
 */
export const conditionMeta = (c: string | null | undefined): ConditionMeta =>
  CONDITION_META[(c ?? "PERFEITO") as Condition] ?? CONDITION_META.PERFEITO;
