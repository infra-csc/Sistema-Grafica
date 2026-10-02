// ─────────────────────────────────────────────────────────────────────────────
// O que TODA aba da Análises recebe (dono, 01–02/10: "bem completo, onde o
// gestor da empresa abra e consiga ver tudo, por abas… gestão completa de
// status, como dashboard, de todas as fases").
//
// A página (pages/analises/index.tsx) busca uma vez, aplica os filtros do topo
// e entrega o mesmo contexto a cada aba — nenhuma aba refaz busca de peças nem
// filtra por conta própria. Os agregados que o cliente não calcula vêm de
// GET /api/analises/operacao (shared/analises-operacao-contract.ts).
// ─────────────────────────────────────────────────────────────────────────────
import type { AnaliseEvent, AnaliseItem, AnaliseSponsor, AnaliseSponsorRef } from "@/lib/analises-metrics";
import type { EstadoDaOperacao, EventoDoEstado, LeitorDePeca } from "@/lib/analises-estado";
import type { OperacaoDaAnalise } from "@shared/analises-operacao-contract";

/**
 * O evento como a Análises o recebe de /api/events: o básico de AnaliseEvent
 * mais o que a régua de status lê (offsets dos marcos, início, encerramento).
 */
export type EventoDaAnalise = AnaliseEvent & EventoDoEstado;

/** A peça como a Análises de status precisa — o que /api/items já devolve. */
export interface PecaDaAnalise extends AnaliseItem {
  displayId?: string | null;
  description?: string | null;
  statusChangedAt?: string | Date | null;
  travadaEm?: string | Date | null;
  travadaMotivo?: string | null;
  isPriority?: boolean | null;
  isReuse?: boolean | null;
  reuseQty?: number | null;
  skipApproval?: boolean | null;
  parentItemId?: string | null;
  quantityProduced?: number | null;
  conferredQty?: number | null;
  deliveredQty?: number | null;
  embaladaQty?: number | null;
  printMachine?: string | null;
  approvedAt?: string | Date | null;
  sponsorApprovedAt?: string | Date | null;
  productionStartedAt?: string | Date | null;
  /** Peça nascida de um pedido de peça (shared/schema: pedido_de_peca_id). */
  pedidoDePecaId?: string | null;
  /** Arquivo final que a Gráfica imprime (a Revisão confere se ele existe). */
  finalFileUrl?: string | null;
  /** Quem travou (quando travada). */
  travadaPor?: string | null;
  /** Peça do Kit (remessa). */
  kitRemessaId?: string | null;
  /** Patrocinadores COM o status da aprovação de cada um (enrich de /api/items). */
  sponsors?: (AnaliseSponsorRef & { approvalStatus?: string | null })[] | null;
  /** O evento embutido na peça (para a peça do Kit, com as datas da remessa). */
  event?: EventoDoEstado | null;
}

export interface FiltrosDaAnalise {
  evento: string; // "all" ou id
  patrocinador: string; // "all" ou id
  tipo: string; // "all" ou tipo da peça
  /** Atalhos que recortam TODAS as abas de status. */
  soAtrasadas: boolean;
  soTravadas: boolean;
  soPrioritarias: boolean;
}

export interface ContextoDaAnalise {
  /** Peças JÁ filtradas pelo topo (evento, patrocinador, tipo, atalhos). */
  pecas: PecaDaAnalise[];
  /** Todas as peças, sem os filtros do topo (para comparar com o todo). */
  todasAsPecas: PecaDaAnalise[];
  eventos: EventoDaAnalise[];
  eventoPorId: Map<string, EventoDaAnalise>;
  patrocinadores: AnaliseSponsor[];
  filtros: FiltrosDaAnalise;
  /** Agregados do servidor; null enquanto carrega ou se falhar. */
  operacao: OperacaoDaAnalise | null;
  operacaoCarregando: boolean;
  operacaoErro: boolean;
  /**
   * A leitura de UMA peça (etapa, fase, idade, prazo da etapa, atraso,
   * travada, prioritária) — lib/analises-estado. Memoizada: chame à vontade.
   */
  leitura: LeitorDePeca<PecaDaAnalise>;
  /**
   * Os números de status sobre `pecas` (já filtradas) — a fonte ÚNICA de toda
   * aba. Para um recorte próprio (uma fila, um evento), use `resumirGrupo`.
   */
  estado: EstadoDaOperacao<PecaDaAnalise>;
  /** O mesmo resumo sobre `todasAsPecas` (para "x de y" contra o todo). */
  estadoDoTodo: EstadoDaOperacao<PecaDaAnalise>;
  /** "Agora" único da página — todas as idades usam o mesmo relógio. */
  hoje: Date;
  isMobile: boolean;
  /** DRILL-DOWN: todo número clicável abre a gaveta com estas peças. */
  abrirPecas: (titulo: string, pecas: PecaDaAnalise[], subtitulo?: string) => void;
  /** Leva a outra aba (ex.: o card da Visão geral abre a aba da fase). */
  irParaAba: (aba: IdDaAba) => void;
  /** Desfaz todos os filtros do topo (a saída de um estado vazio por filtro). */
  limparFiltros: () => void;
}

/**
 * `rotulo` é o texto da ABA — curto, para as dez caberem em 1366 sem
 * reticência. `titulo` é o nome completo (dica da aba e cabeçalho da seção).
 */
export const ABAS_DA_ANALISE = [
  { id: "geral", rotulo: "Visão geral", titulo: "Visão geral" },
  { id: "solicitacao", rotulo: "Solicitação", titulo: "Solicitação e Vinculação" },
  { id: "arte", rotulo: "Arte", titulo: "Arte" },
  { id: "aprovacao", rotulo: "Aprovação", titulo: "Aprovação" },
  { id: "revisao", rotulo: "Revisão Final", titulo: "Revisão Final" },
  { id: "grafica", rotulo: "Gráfica", titulo: "Gráfica" },
  { id: "eventos", rotulo: "Eventos", titulo: "Eventos e prazos" },
  { id: "pessoas", rotulo: "Pessoas", titulo: "Pessoas" },
  { id: "estoque", rotulo: "Estoque", titulo: "Estoque e reaproveitamento" },
  { id: "desempenho", rotulo: "Desempenho", titulo: "Desempenho e tempo" },
] as const;

export type IdDaAba = (typeof ABAS_DA_ANALISE)[number]["id"];
