// Taxonomia de status da tela de Análises — lida do FUNIL CANÔNICO
// (`FUNIL_DE_PRAZOS` em shared/fluxo-peca), o mesmo de onde o servidor monta
// `STAGE_DEFS` da Gestão de Prazos. Antes era um espelho à mão, vigiado por um
// teste de paridade; agora não há cópia para divergir.
import {
  FUNIL_DE_PRAZOS, STATUS_ENTREGUES, STATUS_FORA_DO_FUNIL, ehEntregue, ehForaDoFunil, statusDoFunil,
} from "@shared/fluxo-peca";
import { statusParaContagem } from "@shared/molde";

export interface AnaliseStage {
  key: string;
  label: string;
  /** Status que significam "a peça está travada NESTA etapa". */
  statuses: string[];
}

/** As etapas do funil, na ordem, com todas as grafias legadas. */
export const ANALISE_STAGES: AnaliseStage[] = FUNIL_DE_PRAZOS.map((f) => ({
  key: f.key, label: f.label, statuses: statusDoFunil(f.key),
}));

/** Entregue, com as grafias legadas ("entregue"). */
export const DELIVERED_STATUSES: readonly string[] = STATUS_ENTREGUES;

/** Cancelada/excluída/arquivada: não é pendência NEM total (regra do domínio). */
export const OUT_OF_FUNNEL_STATUSES: readonly string[] = STATUS_FORA_DO_FUNIL;

/**
 * Concluída? Aceita o STATUS (como sempre) ou a PEÇA — e com a peça o molde
 * produzido, que é o fim do fluxo dele, conta como entregue (shared/molde.ts,
 * revisão 22/09). Quem só tem o status continua com a régua de antes.
 */
export function isDelivered(statusOuPeca: string | null | undefined | { type?: string | null; status?: string | null }): boolean {
  const status = statusOuPeca != null && typeof statusOuPeca === "object" ? statusParaContagem(statusOuPeca) : statusOuPeca;
  return ehEntregue(status);
}

export function isOutOfFunnel(status: string | null | undefined): boolean {
  return ehForaDoFunil(status);
}
