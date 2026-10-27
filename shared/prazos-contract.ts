// Contrato do payload de GET /api/prazos — FONTE ÚNICA de tipos.
//
// PORQUÊ deste arquivo: até aqui o mesmo contrato era datilografado duas
// vezes — uma em `client/src/pages/gestao-prazos.tsx` e outra implícita no
// `res.json({...})` de `server/routes/prazos.ts`. Duas cópias que ninguém
// obriga a concordar: um campo renomeado no servidor virava `undefined` na
// tela, sem erro de compilação, sem log, só um número errado na cara do
// diretor. Com o contrato aqui e o servidor tipando o retorno
// (`const payload: PrazosPayload = {...}`), esquecer um campo passa a ser
// erro de `tsc`, não bug em produção.
//
// Regra: NADA de lógica aqui. Só tipos e as constantes de vocabulário que
// os dois lados precisam citar pelo mesmo nome.

import { STATUS_PRODUZIDAS } from "./fluxo-peca";

/**
 * Status de peça que significam "já produzida/conferida" dentro da etapa de
 * Produção Gráfica ("produzido" é grafia legada que circula no banco).
 *
 * Vive AQUI porque dois lados citam o mesmo vocabulário: o domínio do servidor
 * (compõe os `pendingStatuses` da produção) e o resumo por setor do cliente
 * (o sub-rótulo "aguardando conferência/entrega"). Antes o cliente mantinha um
 * `new Set([...])` local — a terceira cópia da mesma lista, pronta a divergir
 * na próxima grafia legada descoberta.
 */
// Derivada da etapa canônica (shared/fluxo-peca): a cópia literal esqueceu
// "conferido" e a peça conferida com grafia legada saía do resumo por setor.
export const PRODUCED_LIKE: readonly string[] = STATUS_PRODUZIDAS;

// ─── Semáforo por etapa ──────────────────────────────────────────────────────

/** Estado de um marco (etapa) de um evento. */
export type StageState = "done" | "upcoming" | "warning" | "overdue";

export interface PrazoStage {
  key: string;
  label: string;
  /** Data-calendário do marco no calendário do evento, "YYYY-MM-DD". */
  deadline: string;
  /**
   * O prazo que vale para as peças que ainda estão neste gate (26/10): o menor
   * prazo entre elas. Igual a `deadline`, a não ser quando o gate só tem peças
   * sem aprovação (Sem patrocínio / Arte do cliente) ainda em Layout — aí é o
   * prazo de Layout ajustado delas. O semáforo e `diffDays` contam DESTE dia.
   */
  prazoEfetivo: string;
  /** Dias até `prazoEfetivo` a partir do `today` do NEGÓCIO (negativo = vencido). */
  diffDays: number;
  /** Peças travadas AQUI ou em etapa anterior — é o gate real da etapa. */
  pendingCount: number;
  /** Peças travadas exatamente nesta etapa. */
  directCount: number;
  /**
   * Das peças do gate, as que já passaram do prazo DELAS nesta etapa (26/10).
   * Igual a `pendingCount` na etapa vencida sem peça sem aprovação no gate.
   */
  atrasadas: number;
  state: StageState;
}

// ─── Peças pendentes (drill-down) ────────────────────────────────────────────

export interface PrazoPendingSponsor {
  name: string;
  days: number;
  /** Com quem está a bola: o patrocinador decide ou a Arte precisa refazer. */
  holder: "sponsor" | "arte";
}

export interface PrazoPendingItem {
  id: string;
  displayId: string;
  status: string;
  /** Etapa calculada no servidor (fonte única status→etapa) — onde a peça ESTÁ. */
  stageIndex: number;
  /**
   * Índice do MARCO que mede o prazo desta peça — o que decide se ela está
   * atrasada. Igual a `stageIndex` no caso normal.
   *
   * Difere na peça do Kit (cobrada da Entrega de Layouts em diante) e na peça sem
   * aprovação em Lista de Imagens (cobrada no Layout — Pedro/dono, 26/10; até
   * aí a isenta era cobrada pela Finalização). É por `marcoIndex` que
   * `stages[].pendingCount` conta.
   */
  marcoIndex: number;
  /**
   * O prazo que MEDE a peça agora ("YYYY-MM-DD"): o do marco, ou — na peça sem
   * aprovação ainda em Layout — o prazo de Layout ajustado (Layout + dias da
   * Aprovação). A peça está atrasada quando ele é anterior a `today`.
   */
  prazo: string | null;
  /** "Sem patrocínio" (items.skipApproval). */
  semPatrocinio: boolean;
  /** "Arte do cliente". */
  arteDoCliente: boolean;
  /** "Layout — Aguardando arte do cliente": a marca, sem "Arte recebida", em Layout. */
  aguardandoArteDoCliente: boolean;
  /** RN09: atrasada por conta do cliente (arte não recebida depois do Layout ajustado). */
  atrasoDoCliente: boolean;
  /** RF12: o prazo de Layout normal × ajustado, na peça com marca (não Kit). */
  prazoDeLayout: { normal: string; ajustado: string } | null;
  type: string;
  description: string | null;
  quantity: number;
  /**
   * Dias PARADA NA ETAPA ATUAL, de `items.statusChangedAt`.
   *
   * `null` quando a peça não tem esse carimbo (anterior à coluna). É um valor
   * legítimo e as telas têm de exibi-lo como ausência, não como zero: zero diz
   * "andou hoje", e essa é exatamente a afirmação falsa que este campo passou
   * a existir para não fazer.
   *
   * ANTES media `updatedAt`, que é tocado por QUALQUER escrita — inclusive
   * por rotinas que não geram linha no histórico. Uma peça parada em
   * "Aguardando Envio" desde 7 de agosto aparecia como "hoje", e o histórico
   * da própria peça não tinha nada no dia: o número contradizia o único
   * registro que dá para conferir.
   */
  waitingDays: number | null;
  sponsors?: PrazoPendingSponsor[];
}

// ─── Categoria: classificação ÚNICA e EXCLUSIVA do evento ────────────────────

/**
 * Classificação única do evento, com precedência
 * `semPecas` > `dataInvalida` > `atrasado` > `emDia`.
 *
 * PORQUÊ: o bug mais caro da tela era quatro lugares decidindo por conta
 * própria o que é "sem peças" / "em dia" (KPI, coluna do quadro, filtro de
 * atraso e botão de cobrança) — e discordando entre si. Um evento a 5 dias da
 * saída com ZERO peças cadastradas era pintado de verde, jogado na última
 * coluna do funil e sumia do filtro "Só com atraso". Agora existe UM campo,
 * calculado uma vez no servidor, e todo mundo lê dele.
 *
 * As contagens de `PrazoKpis` são derivadas daqui, o que garante a identidade
 * `atrasados + semPecas + invalidCount + emDia === events.length`.
 */
export type PrazoCategoria = "semPecas" | "dataInvalida" | "atrasado" | "emDia";

// ─── Evento ──────────────────────────────────────────────────────────────────

export interface PrazoEvent {
  /** Id do evento. Uma linha por evento: a peça do Kit conta no próprio evento (23/10). */
  id: string;
  /**
   * O evento (sempre igual a `id` desde 23/10). Até lá a linha de uma remessa
   * do Kit tinha id `<evento>#kit-<remessa>` e este campo apontava o evento;
   * as telas ainda leem `eventId ?? id`, o que segue certo.
   */
  eventId?: string;
  name: string;
  priority: string | null;
  /** ISO 8601 (o cliente formata com timeZone UTC, convenção de toda a UI). */
  startDate: string;
  /** ISO 8601. */
  truckDepartureDate: string;
  /** Ano de saída fora de 2000-2100 → cadastro quebrado, não atraso real. */
  invalidDate: boolean;
  totalItems: number;
  deliveredItems: number;
  stages: PrazoStage[];
  pendingItems: PrazoPendingItem[];
  /** Risco PROJETADO: marco a até 2 dias de vencer com 10+ peças no gate. */
  riskCritical: boolean;

  /** Classificação única — ver `PrazoCategoria`. */
  categoria: PrazoCategoria;
  /**
   * Dias-calendário até a saída do caminhão, MESMA âncora do semáforo
   * (America/Sao_Paulo). `null` quando `invalidDate`.
   *
   * PORQUÊ: o cliente refazia essa conta com `new Date()` — meia-noite LOCAL
   * do navegador. Entre 21h e 00h em Brasília (ou numa VM em UTC, ou com o
   * diretor viajando) os dois relógios discordam em um dia e o KPI "Saídas em
   * 7 dias" passava a se contradizer com o resultado do próprio clique.
   */
  diasParaSaida: number | null;
  /** 0 se nada vencido; senão |menor diffDays| entre as etapas `overdue`. */
  piorAtrasoDias: number;
  /**
   * Peças em atraso DESTE evento: `pendingCount` da etapa vencida mais
   * avançada. É exatamente a parcela deste evento dentro de
   * `kpis.pecasAtrasadas` — reconcilia o card com o placar.
   */
  pecasEmAtraso: number;
  /** max(pendingItems[].waitingDays), 0 quando não há pendência. */
  piorEsperaDias: number;
  /** RN09: das `pecasEmAtraso`, as atrasadas por conta do cliente (o resto é interno). */
  pecasAtrasoDoCliente: number;
  /** Peças em "Layout — Aguardando arte do cliente". */
  aguardandoArteDoCliente: number;
  /** users.name via events.createdBy — "Solicitante: Fulano". */
  solicitante: string | null;
}

// ─── Patrocinadores segurando aprovação ──────────────────────────────────────

export interface SponsorDelayItem {
  itemId: string;
  eventId: string;
  eventName: string;
  displayId: string;
  days: number;
}

export interface SponsorDelay {
  sponsorId: string;
  name: string;
  pendingCount: number;
  maxDays: number;
  eventCount: number;
  /** Pior primeiro, com teto de 20 (lista de cobrança, não inventário). */
  items: SponsorDelayItem[];
  /** users.name via sponsors.accountExecutiveId — "conta: Ana Paula". */
  executivoConta: string | null;
}

// ─── Placar ──────────────────────────────────────────────────────────────────

export interface PrazoKpis {
  /** count(categoria === "atrasado") */
  atrasados: number;
  /** Eventos com saída entre hoje e hoje+7 (exclui data inválida). */
  saidas7d: number;
  /** Soma de `pecasEmAtraso` de todos os eventos. */
  pecasAtrasadas: number;
  /** count(categoria === "emDia") */
  emDia: number;
  /**
   * count(categoria === "dataInvalida").
   *
   * ATENÇÃO — semântica alterada: antes contava TODO evento com data inválida,
   * inclusive os que também estavam sem peças, e `emDia` era uma subtração
   * (`length - overdue - invalid`) que descontava o mesmo evento duas vezes e
   * podia ficar NEGATIVA. Agora é contagem de categoria exclusiva.
   */
  invalidCount: number;
  /** count(categoria === "semPecas") — o pior caso do negócio, com lugar próprio. */
  semPecas: number;
  /** RN09 (26/10): das `pecasAtrasadas`, as atrasadas por conta do cliente (arte do cliente não recebida). */
  pecasAtrasoDoCliente?: number;
}

/**
 * Delta contra o snapshot ANTERIOR mais recente — não necessariamente "ontem".
 * Numa segunda-feira o anterior é o de sexta, e o rótulo da UI diz "último
 * registro" de propósito. Trocar por "vs ontem" introduziria mentira.
 */
export type PrazoTrend = {
  atrasados: number;
  saidas7d: number;
  pecasAtrasadas: number;
  emDia: number;
} | null;

// ─── "O que mudou desde ontem" ───────────────────────────────────────────────

export interface DesdeOntemEvento {
  id: string;
  name: string;
}

export interface DesdeOntem {
  /**
   * Dia comparado ("YYYY-MM-DD"): o mais recente ANTERIOR a `today`. Numa
   * segunda-feira é sexta — por isso o rótulo da UI deve nomear o dia em vez
   * de cravar "ontem".
   */
  baseDay: string;
  /** Eventos que passaram de sem-atraso para com-atraso desde `baseDay`. */
  entraramEmAtraso: DesdeOntemEvento[];
  /** Eventos que saíram do vermelho (só os que continuam no payload). */
  sairamDoAtraso: DesdeOntemEvento[];
  /** soma(pecasAtrasadas em baseDay) − soma(hoje), com piso 0. */
  pecasDestravadas: number;
}

// ─── Raiz ────────────────────────────────────────────────────────────────────

export interface PrazosPayload {
  /** ISO 8601 do instante da agregação (alimenta o selo de frescor). */
  generatedAt: string;
  /**
   * "YYYY-MM-DD" do NEGÓCIO (America/Sao_Paulo). Âncora oficial de TODA
   * comparação de data na tela — o cliente não deve chamar `new Date()`
   * para decidir regra, só para pintar.
   */
  today: string;
  /** Ordem e rótulos das etapas — o cliente deriva cabeçalhos daqui. */
  stageMeta: { key: string; label: string }[];
  events: PrazoEvent[];
  sponsorDelays: SponsorDelay[];
  kpis: PrazoKpis;
  /** `null` sem snapshot anterior (ou sem a tabela migrada). */
  trend: PrazoTrend;
  // `cobrancas` (o registro de "Marcar como cobrado") saiu do payload em
  // 06/10 — decisão do dono: "tudo de cobrança pode tirar".
  /** `null` enquanto `prazo_event_snapshots` não existir ou não houver dia base. */
  desdeOntem: DesdeOntem | null;
}
