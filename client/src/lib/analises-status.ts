// Taxonomia de status da tela de Análises — ESPELHO do funil canônico do
// servidor (`STAGE_DEFS`, `DELIVERED` e `OUT_OF_FUNNEL` em
// `server/services/prazo-domain.ts`).
//
// PORQUÊ um espelho e não um import direto: `prazo-domain.ts` é módulo de
// SERVIDOR (o bundle do cliente não o alcança) e `shared/prazos-contract.ts`
// só publica o pedaço do vocabulário que os dois lados já citavam
// (`PRODUCED_LIKE`). Até aqui a tela declarava a QUARTA taxonomia do app,
// sem as grafias legadas em português e sem conceito de "fora do funil" — o
// resultado era peça `entregue` contando como não entregue e peça cancelada
// inflando o denominador.
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
    key: "revisao",
    label: "Revisão de Lista",
    statuses: [
      "awaiting_finalization", "sponsor_approved",
      "awaiting_final_review", "awaiting_review", "in_review", "awaiting_creator_review",
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

const stage = (key: string): string[] =>
  ANALISE_STAGES.find((s) => s.key === key)?.statuses ?? [];

export interface FlowGroup {
  key: string;
  label: string;
  statuses: string[];
  /**
   * Status representativo do grupo. A COR sai de `getStatusMeta(colorStatus).dot`
   * (fonte única, `lib/status.ts`) em vez de um hex solto no componente — antes
   * as cinco cores da rosca e as três da barra de eficiência eram literais que
   * não vinham de lugar nenhum.
   */
  colorStatus: string;
}

/**
 * Grupos da rosca — recorte do funil canônico, não uma taxonomia nova.
 *
 * "Aprovação" passa a ser SÓ a etapa em que a bola está com o patrocinador.
 * Antes o mesmo grupo juntava `awaiting_approval` (patrocinador decidindo) com
 * `ready_for_production`/`approved` (já liberadas, esperando a gráfica): ler
 * "Aprovação 48%" não distinguia acervo travado de acervo pronto para imprimir
 * — decisões opostas na mesma fatia.
 */
export const FLOW_GROUPS: FlowGroup[] = [
  { key: "planejamento", label: "Planejamento", statuses: [...stage("listaImagens"), ...stage("layouts")], colorStatus: "requested" },
  { key: "aprovacao",    label: "Aprovação",    statuses: stage("aprovacao"), colorStatus: "awaiting_approval" },
  { key: "revisao",      label: "Revisão",      statuses: stage("revisao"),   colorStatus: "awaiting_final_review" },
  { key: "producao",     label: "Produção",     statuses: stage("producao"),  colorStatus: "inProduction" },
  { key: "entregue",     label: "Entregue",     statuses: DELIVERED_STATUSES, colorStatus: "delivered" },
];

const GROUP_OF_STATUS = new Map<string, string>();
FLOW_GROUPS.forEach((g) => g.statuses.forEach((s) => GROUP_OF_STATUS.set(s, g.key)));

/** Grupo do funil, ou `null` para status fora do funil / desconhecido. */
export function flowGroupOf(status: string | null | undefined): string | null {
  return (status && GROUP_OF_STATUS.get(status)) || null;
}

export function isDelivered(status: string | null | undefined): boolean {
  return !!status && DELIVERED_SET.has(status);
}

export function isOutOfFunnel(status: string | null | undefined): boolean {
  return !!status && OUT_OF_FUNNEL_SET.has(status);
}

/** Mesma definição de "produção" da fatia da rosca — havia três na tela. */
export function isInProduction(status: string | null | undefined): boolean {
  return flowGroupOf(status) === "producao";
}

/** Já passou da aprovação: produção gráfica (inclui liberadas) ou entregue. */
export function isApprovedOrBeyond(status: string | null | undefined): boolean {
  const g = flowGroupOf(status);
  return g === "producao" || g === "entregue";
}

/**
 * Peça esperando DECISÃO (patrocinador ou revisão interna) — o conjunto que o
 * alerta "sem aprovação há mais de 24h" precisa varrer. A lista anterior tinha
 * 2 dos 8 status e o alerta subnotificava.
 */
export const AWAITING_DECISION_STATUSES = [...stage("aprovacao"), ...stage("revisao")];

/** Liberadas pela Arte e ainda não iniciadas na gráfica (inclui grafia legada). */
export const READY_FOR_PRODUCTION_STATUSES = ["ready_for_production", "pronto_para_producao"];
