// Taxonomia de status da tela de Análises — ESPELHO do funil canônico do
// servidor (`STAGE_DEFS`, `DELIVERED` e `OUT_OF_FUNNEL` em
// `server/services/prazo-domain.ts`).
//
// PORQUÊ um espelho e não um import direto: `prazo-domain.ts` é módulo de
// SERVIDOR (o bundle do cliente não o alcança) e `shared/prazos-contract.ts`
// só publica o pedaço do vocabulário que os dois lados já citavam
// (`PRODUCED_LIKE`). Até a reforma, a tela declarava a QUARTA taxonomia do app,
// sem as grafias legadas em português e sem conceito de "fora do funil" — o
// resultado era peça `entregue` contando como não entregue e peça cancelada
// inflando o denominador de toda razão da tela.
//
// O espelho só é aceitável porque existe um teste que o compara etapa a
// etapa, na ordem, com `STAGE_DEFS` (`server/__tests__/analises-status.test.ts`):
// acrescentar uma grafia legada no domínio e esquecer daqui quebra o gate em
// vez de voltar a subnotificar a entrega em silêncio.
import { PRODUCED_LIKE } from "@shared/prazos-contract";

export interface AnaliseStage {
  key: string;
  label: string;
  /** Status que significam "a peça está travada NESTA etapa". */
  statuses: string[];
}

/** Espelho de `STAGE_DEFS` — mesma ordem, mesmos status, mesmas grafias. */
export const ANALISE_STAGES: AnaliseStage[] = [
  {
    key: "listaImagens",
    label: "Lista de Imagens",
    statuses: ["draft", "requested", "awaiting_linking"],
  },
  {
    key: "layouts",
    label: "Entrega de Layouts",
    statuses: ["awaiting_submission"],
  },
  {
    key: "aprovacao",
    label: "Aprovação de Layout",
    statuses: ["awaiting_approval", "awaiting_sponsor_approval"],
  },
  {
    key: "finalizacao",
    label: "Finalização",
    statuses: [
      "awaiting_finalization", "sponsor_approved", "awaiting_creator_review",
    ],
  },
  {
    key: "revisao",
    label: "Revisão de Lista",
    statuses: [
      "awaiting_final_review", "awaiting_review", "in_review",
    ],
  },
  {
    key: "producao",
    label: "Produção Gráfica",
    statuses: [
      "ready_for_production", "approved", "inProduction",
      "pronto_para_producao", "liberado", "em_producao",
      ...PRODUCED_LIKE,
    ],
  },
];

/** "entregue" é a grafia legada de `delivered` — conta como pronta. */
export const DELIVERED_STATUSES = ["delivered", "entregue"];

/** Cancelada/excluída/arquivada: não é pendência NEM total (regra do domínio). */
export const OUT_OF_FUNNEL_STATUSES = ["canceled", "deleted", "archived"];

const DELIVERED_SET = new Set(DELIVERED_STATUSES);
const OUT_OF_FUNNEL_SET = new Set(OUT_OF_FUNNEL_STATUSES);

export function isDelivered(status: string | null | undefined): boolean {
  return !!status && DELIVERED_SET.has(status);
}

export function isOutOfFunnel(status: string | null | undefined): boolean {
  return !!status && OUT_OF_FUNNEL_SET.has(status);
}
