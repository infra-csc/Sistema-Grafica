// ─────────────────────────────────────────────────────────────────────────────
// REGRAS PURAS DA VINCULAÇÃO — sem estado nem React, testáveis por fora.
// ─────────────────────────────────────────────────────────────────────────────
import { grupoDoKit } from "@shared/kit";
import { compareDisplayId } from "@/lib/displayId";
import { COLLATOR_PTBR, DOWNSTREAM_STATUSES, LINKING_STATUSES } from "./constantes";
import type { ItemChanges, PecaDaVinculacao, UIStatus } from "./tipos";

/** A seção da linha: a remessa do Kit ("KIT · entrega 14/09") ou o tipo. */
export const secaoDaPeca = (p: PecaDaVinculacao): string => grupoDoKit(p) ?? (p.type || '');

// Função para determinar estado UI de um item (FONTE ÚNICA DE VERDADE)
export const getItemUIStatus = (
  item: PecaDaVinculacao,
  originalSponsors: string[],
  pendingChange?: ItemChanges
): UIStatus => {
  // 1. Se tem mudanças pendentes não salvas → RASCUNHO
  if (pendingChange?.isDirty) {
    return 'RASCUNHO';
  }

  // 2. Se status indica que já foi enviado para Arte ou produção → ENVIADO
  if (DOWNSTREAM_STATUSES.includes(item.status)) {
    return 'ENVIADO';
  }

  // 3. Items com status 'awaiting_linking' e com patrocinadores salvos → PRONTO (para enviar)
  const canSendStatuses = LINKING_STATUSES;
  if (canSendStatuses.includes(item.status)) {
    const hasSponsors = originalSponsors.length > 0;
    const hasSkipApproval = item.skipApproval === true;
    const isReuse = item.isReuse === true;
    if (hasSponsors || hasSkipApproval || isReuse) {
      return 'PRONTO';
    }
    return 'PENDENTE';
  }

  // 4. Caso contrário → PENDENTE
  return 'PENDENTE';
};

// URLs de referência vêm de input de usuário: só http(s) ou caminho relativo
// pode chegar a href/src — "javascript:..." executava no clique (XSS).
export const safeRefUrl = (u?: string | null): string | null =>
  u && /^(https?:\/\/|\/)/i.test(u.trim()) ? u.trim() : null;

// Função helper para converter hex para rgba
export const hexToRgba = (hex: string, alpha: number = 1): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(59, 130, 246, ${alpha})`; // Fallback azul
  return `rgba(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}, ${alpha})`;
};

// Helper para comparar arrays de sponsor IDs
export const areSponsorsEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((id, index) => id === sortedB[index]);
};

/**
 * A ORDEM DE LEITURA DA PRODUÇÃO: grupo pai → tipo → ID.
 *
 * A tabela abre um cabeçalho de tipo sempre que o tipo MUDA em relação à
 * linha anterior (`abreTipo`, na fila). Isso só agrupa se a lista chegar
 * ordenada por tipo — sem esta ordem, cada cabeçalho dizia "TOTENS 6" com UMA
 * linha embaixo, seguida de "QUADROS 4X3 6" com uma linha, e assim por
 * diante: a contagem certa, a lista misturada.
 *
 * O Kit vai por último, cada remessa junta. Dentro do tipo, compareDisplayId
 * (não replace(/\D/g,'')): o complemento "#0062-C1" virava 621 e desgrudava
 * da peça original.
 */
export const ordenarParaLeitura = (lista: PecaDaVinculacao[], typeToGroup: Record<string, string>) => [...lista].sort((a, b) => {
  const ka = grupoDoKit(a) ?? '', kb = grupoDoKit(b) ?? '';
  if (!!ka !== !!kb) return ka ? 1 : -1;
  if (ka !== kb) return COLLATOR_PTBR.compare(ka, kb);
  if (ka) return compareDisplayId(a.displayId, b.displayId);
  const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
  if (ga !== gb) return COLLATOR_PTBR.compare(ga, gb);
  if (a.type !== b.type) return COLLATOR_PTBR.compare(a.type || '', b.type || '');
  return compareDisplayId(a.displayId, b.displayId);
});

/**
 * A mensagem de um erro pego em `catch`. O `catch` recebe `unknown`; lê a
 * `message` de quem tiver uma (Error ou objeto do servidor), como o
 * `e?.message` de antes — e `undefined` quando não há.
 */
export function mensagemDoErro(e: unknown): string | undefined {
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}
