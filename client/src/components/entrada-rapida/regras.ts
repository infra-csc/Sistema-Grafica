// Regras puras da ENTRADA RÁPIDA: catálogo padrão, linha completa, opções e repetição.
import type { FilterOption } from "@/components/filter-select";
// Mesma normalização da busca dos menus: sem acento, sem caixa, sem espaço
// sobrando. É ela que reconhece "sanett" e "Sanett" como o mesmo material.
import { normalizarBusca } from "@/lib/utils";
import type { BulkItemRow } from "./tipos";

export const materials = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"];
export const finishes = ["Dupla Face", "Ilhós", "Impressão UV", "Impresso", "Recorte", "Refile"];

/* Total focusable fields per row (indices 0–9) */
export const FIELDS_PER_ROW = 10;

/**
 * Opções de um campo da grade, AGRUPADAS POR FORMA NORMALIZADA.
 *
 * O cadastro tem sujeira de grafia — "sanett" e "Sanett", "ps" e "PS" são o
 * mesmo material digitado de dois jeitos, e o menu nativo mostrava os dois
 * como se fossem coisas diferentes. Consertar o CADASTRO não é trabalho de
 * componente (e está registrado para o dono decidir); o que o seletor pode
 * fazer é parar de oferecer a mesma coisa duas vezes.
 *
 * A regra é conservadora de propósito: entre as grafias de um mesmo valor
 * normalizado, vence a que já está no valor GRAVADO nesta linha (para não
 * reescrever dado de peça existente ao reabrir a grade) e, na falta dela, a
 * primeira que apareceu — a lista chega ordenada com o catálogo oficial na
 * frente. Nenhum valor é apagado do banco; só deixa de ter duas entradas no
 * menu.
 */
export function opcoesDeCampo(lista: string[], atual: string): FilterOption[] {
  const porChave = new Map<string, string>();
  const chave = (s: string) => normalizarBusca(s);
  for (const v of lista) {
    const k = chave(v);
    if (!k) continue;
    if (!porChave.has(k)) porChave.set(k, v);
  }
  // O valor já gravado manda na grafia da sua chave e entra mesmo se não
  // estiver mais no catálogo — senão o campo abriria mostrando "—" sobre uma
  // peça que tem material definido.
  if (atual) porChave.set(chave(atual), atual);
  return Array.from(porChave.values()).map(v => ({ value: v, label: v }));
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
/** Linha pronta para virar peça — mesma regra usada no envio e no contador. */
export function isRowComplete(r: BulkItemRow): boolean {
  // Quantidade: inteiro ≥ 1. Antes validava parseFloat > 0 mas o envio usa
  // parseInt — "0.5" passava como válida e gravava peça com quantity 0.
  return !!(r.type && Number.isInteger(Number(r.quantity)) && Number(r.quantity) >= 1 &&
    parseFloat(r.visualWidth) > 0 && parseFloat(r.visualHeight) > 0 &&
    parseFloat(r.fileWidth) > 0 && parseFloat(r.fileHeight) > 0 &&
    r.material && r.finish);
}

export function createEmptyRow(): BulkItemRow {
  return {
    id: Math.random().toString(36).substring(7),
    type: "", description: "", quantity: "1",
    visualWidth: "", visualHeight: "", fileWidth: "", fileHeight: "",
    material: "", finish: "", measurement: "", observations: "",
    calculatedM2: 0, sponsorId: "", isReuse: false, isPriority: false, standardItemId: "",
  };
}

export function isSameItem(
  a: { type: string; description?: string | null; quantity: number | string; visualWidth?: string | number | null; visualHeight?: string | number | null; fileWidth?: string | number | null; fileHeight?: string | number | null; material?: string | null; finish?: string | null },
  b: { type: string; description?: string | null; quantity: number | string; visualWidth?: string | number | null; visualHeight?: string | number | null; fileWidth?: string | number | null; fileHeight?: string | number | null; material?: string | null; finish?: string | null }
): boolean {
  return (
    (a.type || '').trim().toLowerCase() === (b.type || '').trim().toLowerCase() &&
    (a.description || '').trim().toLowerCase() === (b.description || '').trim().toLowerCase()
  );
}
