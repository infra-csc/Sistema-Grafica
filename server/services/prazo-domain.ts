// Domínio da Gestão de Prazos — regra de negócio PURA, sem Express e sem I/O.
//
// PORQUÊ este arquivo existe: a regra inteira do produto (o funil de etapas,
// a pendência acumulada, a âncora de fuso, o semáforo) morava dentro de um
// handler Express de 270 linhas — impossível de testar sem subir servidor e
// banco. Aqui ela é uma função pura sobre estruturas simples; a rota fica só
// com I/O + montagem, e o job de snapshot reusa exatamente o mesmo cálculo
// (antes o job teria que reimplementar a conta e as duas versões divergiriam).
//
// O cálculo dos marcos espelha a Agenda Operacional do event-detail:
// cada etapa é um offset em dias sobre a SAÍDA DO CAMINHÃO (âncora oficial
// de prazos do negócio), com ajuste de fim de semana (sáb→sex, dom→seg)
// exceto na Produção Gráfica, que vence seg–sáb (dom→sáb; dono, 19/10).
//
// Toda a aritmética de datas é feita em UTC sobre a data-calendário
// (YYYY-MM-DD): o servidor pode rodar em qualquer fuso e o resultado
// tem que bater com o que a UI exibe (que formata em UTC).
import {
  isPlausibleEventYear,
  motivoEventoFinalizado,
  SP_DAY_FMT,
  spDayMs,
  todayBusinessMs,
  todayBusinessStr,
  businessDayStrToMs,
  diaDoMarcoUTC,
  FIM_DE_SEMANA_DO_CAMPO,
} from "@shared/prazo-dates";
import type { EventoFinalizadoMotivo, RegraDeFimDeSemana } from "@shared/prazo-dates";
import { FUNIL_DE_PRAZOS, STATUS_ENTREGUES, STATUS_FORA_DO_FUNIL, statusDoFunil } from "@shared/fluxo-peca";
import { comStatusDeContagem } from "@shared/molde";
import { MARCO_EM_QUE_O_KIT_ENTRA } from "@shared/kit";
import {
  DIAS_DA_APROVACAO_PADRAO,
  aguardandoArteDoCliente,
  marcoQueCobra,
  prazoDaPeca,
  prazoNoMarco,
  prazosDeLayoutDaPeca,
  pulaAprovacao,
  responsavelPeloAtraso,
  semPatrocinio,
  INDICE_LAYOUT,
} from "@shared/prazo-sem-aprovacao";
import type {
  PrazoCategoria,
  PrazoEvent,
  PrazoKpis,
  PrazoPendingItem,
  PrazoPendingSponsor,
  PrazoStage,
  StageState,
} from "@shared/prazos-contract";

export interface StageDef {
  key: string;
  label: string;
  offsetField:
    | "deadlineListaImagens"
    | "deadlineEntregaLayouts"
    | "deadlineAprovacaoLayout"
    | "deadlineFinalizacao"
    | "deadlineRevisaoLista"
    | "deadlineProducaoGrafica";
  defaultOffset: number;
  /** Em que dias o prazo vence — lida do marco em @shared/prazo-dates, nunca escrita aqui. */
  fimDeSemana: RegraDeFimDeSemana;
  // Status de item que significam "ainda não passou por esta etapa".
  pendingStatuses: string[];
}

// A ordem importa: uma etapa só está concluída quando nenhuma peça está
// nela NEM em qualquer etapa anterior (peça em rascunho também não foi
// aprovada). Os status legados entram na etapa equivalente.
// Os status de cada etapa vêm do funil canônico (shared/fluxo-peca), com as
// grafias legadas: o cliente (Análises) lê a MESMA lista, sem espelho.
const DEFS_DE_OFFSET: Record<string, Pick<StageDef, "offsetField" | "defaultOffset">> = {
  listaImagens: { offsetField: "deadlineListaImagens", defaultOffset: -25 },
  layouts:      { offsetField: "deadlineEntregaLayouts", defaultOffset: -20 },
  aprovacao:    { offsetField: "deadlineAprovacaoLayout", defaultOffset: -12 },
  // Finalização: a Arte anexando o arquivo final (sponsor_approved, isenta de
  // aprovação ou grafia legada — o mesmo trabalho por três caminhos).
  finalizacao:  { offsetField: "deadlineFinalizacao", defaultOffset: -10 },
  revisao:      { offsetField: "deadlineRevisaoLista", defaultOffset: -8 },
  // Produção Gráfica: vence seg–sáb (regra no marco, @shared/prazo-dates).
  producao:     { offsetField: "deadlineProducaoGrafica", defaultOffset: -1 },
};

export const STAGE_DEFS: StageDef[] = FUNIL_DE_PRAZOS.map((f) => ({
  key: f.key,
  label: f.label,
  ...DEFS_DE_OFFSET[f.key],
  fimDeSemana: FIM_DE_SEMANA_DO_CAMPO[DEFS_DE_OFFSET[f.key].offsetField],
  pendingStatuses: statusDoFunil(f.key),
}));

/** Ordem/rótulos das etapas para o payload — o front deriva os cabeçalhos daqui. */
export const STAGE_META = STAGE_DEFS.map((d) => ({ key: d.key, label: d.label }));

// "entregue" é a grafia legada de delivered — conta como pronta, não pendente.
export const DELIVERED = new Set(STATUS_ENTREGUES);

// status → índice da etapa em que a peça está travada.
// Fora do mapa = já passou por tudo (delivered) ou está fora do funil.
export const STATUS_STAGE_RANK: Record<string, number> = {};
STAGE_DEFS.forEach((s, i) => s.pendingStatuses.forEach((st) => { STATUS_STAGE_RANK[st] = i; }));

/** Índice da Aprovação de Layout. */
export const APROVACAO_STAGE_INDEX = STAGE_DEFS.findIndex((s) => s.key === "aprovacao");

/** Índice da Finalização (até 26/10 era o marco que cobrava a peça isenta de aprovação). */
export const FINALIZACAO_STAGE_INDEX = STAGE_DEFS.findIndex((s) => s.key === "finalizacao");

/** Índice do primeiro marco que cobra a peça do Kit (a Entrega de Layouts, 26/10). */
export const KIT_STAGE_INDEX = STAGE_DEFS.findIndex((s) => s.key === MARCO_EM_QUE_O_KIT_ENTRA);

/**
 * Marco que MEDE o prazo de uma peça — nem sempre é a etapa em que ela está.
 *
 * A REGRA MUDOU (Pedro/dono, 26/10 — "Prazos para peças sem aprovação"). Até
 * aqui a peça isenta de aprovação (`items.skipApproval`) era cobrada pela
 * FINALIZAÇÃO (regra de 24/08). Agora a peça com "Sem patrocínio"
 * (skipApproval) ou "Arte do cliente" é medida pelo prazo de LAYOUT AJUSTADO
 * (Layout + duração da Aprovação, em dias corridos) — a regra única mora em
 * @shared/prazo-sem-aprovacao (`marcoQueCobra` / `prazoDaPeca`), lida também
 * pelo card do evento, pelo Detalhe, pelo Calendário, pela Arte e pelas Análises.
 *
 *   · com marca, em Lista de Imagens ou Entrega de Layouts → o marco de Layout
 *     (com o piso do prazo ajustado — ver `buildEventPrazo`);
 *   · PEÇA DO KIT (dono, 23/10: "ele entra nessa aprovação pra frente"): Lista
 *     de Imagens e Entrega de Layouts não cobram o Kit — a peça do Kit nessas
 *     etapas é medida pela Aprovação de Layout. A regra do Kit vence a da marca;
 *   · o resto → a própria etapa.
 *
 * `stageIndex` (onde a peça ESTÁ, e portanto de quem é a bola) continua o de
 * `STATUS_STAGE_RANK`: quem atribui setor no resumo de gargalos precisa da
 * etapa real, não do marco.
 */
export function marcoIndexFor(
  status: string,
  skipApproval?: boolean | null,
  doKit?: boolean | null,
  arteDoCliente?: boolean | null,
  /** Produção interna: o skipApproval dela não é "Sem patrocínio" (shared/prazo-sem-aprovacao). */
  producaoInterna?: boolean | null,
): number | undefined {
  return marcoQueCobra({ status, skipApproval, arteDoCliente, producaoInterna, kitRemessaId: doKit ? "kit" : null });
}

// Cancelada/excluída/arquivada não conta como pendência nem como total.
export const OUT_OF_FUNNEL = new Set(STATUS_FORA_DO_FUNIL);

// Status em que a peça está esperando decisão de patrocinador.
export const AWAITING_SPONSOR = new Set(["awaiting_approval", "awaiting_sponsor_approval"]);

// Aprovação em aberto cuja bola está com o PATROCINADOR (o resto está com a Arte).
export const SPONSOR_TURN = new Set(["pending", "new_version_pending"]);

// "Hoje" do NEGÓCIO: dia-calendário em America/Sao_Paulo, expresso como
// UTC-midnight para a aritmética de dias. A âncora anterior (dia UTC do
// servidor) virava "amanhã" às 21h de Brasília e o semáforo mostrava
// "vencida há 1d" com o dia ainda em curso — exatamente nas horas em que
// o diretor confere pendência de véspera. As DATAS de evento continuam
// tratadas como wall-clock em UTC (convenção de toda a UI); só o "hoje"
// e os timestamps reais (updatedAt) usam o fuso do negócio.
//
// A implementação MUDOU DE CASA (para @shared/prazo-dates) sem mudar de
// comportamento: o CLIENTE precisa da mesma virada de dia para decidir o que
// esconder das filas, e o cliente não importa `server/`. Os nomes continuam
// exportados daqui — todo mundo que já importava de `prazo-domain` segue
// funcionando, e não existem duas contas de "hoje" para divergir.
export { SP_DAY_FMT, spDayMs, todayBusinessMs, todayBusinessStr, businessDayStrToMs };

// Data-calendário (UTC, meia-noite) da saída do caminhão.
export function truckDayUTC(truckDepartureDate: Date | string): Date {
  const d = new Date(truckDepartureDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

// Marco da etapa: saída + offset, com o ajuste de fim de semana da regra do
// marco (seg–sex: sáb → sex, dom → seg; seg–sáb: dom → sáb).
// A conta MUDOU DE CASA em 06/10 (para `diaDoMarcoUTC`, @shared/prazo-dates)
// sem mudar de resultado: o Calendário passou a seguir a mesma regra (decisão
// do dono) e precisava ler a MESMA função, não uma sétima cópia dela.
export function stageDeadline(truckDay: Date, offsetDays: number, regra: RegraDeFimDeSemana): Date {
  return diaDoMarcoUTC(truckDay, offsetDays, regra);
}

// Dias-calendário (no fuso do negócio) desde um timestamp real.
export function daysSince(ts: Date | string | null | undefined, today: number): number {
  if (!ts) return 0;
  return Math.max(0, Math.round((today - spDayMs(new Date(ts))) / 86400000));
}

// ─── Entradas do domínio ─────────────────────────────────────────────────────
// Tipos ESTRUTURAIS (não os do Drizzle) de propósito: o teste monta um objeto
// literal de 8 campos em vez de fabricar uma linha de `items` com 60 colunas.
// `Event`/`Item` do schema são atribuíveis a estes sem cast.

export interface DomainEvent {
  id: string;
  name: string;
  status: string;
  priority?: string | null;
  startDate: Date | string;
  truckDepartureDate: Date | string;
  createdBy?: string | null;
  deadlineListaImagens?: number | null;
  deadlineEntregaLayouts?: number | null;
  deadlineAprovacaoLayout?: number | null;
  deadlineFinalizacao?: number | null;
  deadlineRevisaoLista?: number | null;
  deadlineProducaoGrafica?: number | null;
}

export interface DomainItem {
  id: string;
  displayId: string;
  status: string;
  type: string;
  description?: string | null;
  quantity: number;
  /** "Sem patrocínio" (pula a Aprovação) — o prazo de Layout é o ajustado. */
  skipApproval?: boolean | null;
  /**
   * Produção interna (vai direto para a Gráfica): grava skipApproval por
   * dentro, mas NÃO é "Sem patrocínio" — a regra única a ignora (27/10).
   */
  producaoInterna?: boolean | null;
  /** "Arte do cliente" (pula a Aprovação; espera o arquivo em Layout). */
  arteDoCliente?: boolean | null;
  /** O dia em que a arte do cliente chegou — sem ele a peça está "Aguardando arte do cliente". */
  arteRecebidaEm?: string | Date | null;
  /** Peça do Kit (a marca): cobrada só da Aprovação de Layout em diante. */
  kitRemessaId?: string | null;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
  /**
   * Desde quando a peça está no status atual. É o relógio da espera — não
   * `updatedAt`, que qualquer escrita encosta. `null`/ausente em peça
   * anterior à coluna, e nesse caso a espera não é calculada.
   */
  statusChangedAt?: Date | string | null;
}

export interface DomainApproval {
  sponsorId: string;
  status: string;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface BuildEventDeps {
  /** "Hoje" do negócio em ms (UTC-meia-noite) — ver `todayBusinessMs`. */
  today: number;
  /**
   * Duração da etapa de Aprovação em dias corridos (configuração geral, padrão
   * 7) — estende o prazo de Layout das peças sem aprovação. Quem chama lê da
   * configuração (services/configuracoes.ts); ausente = o padrão.
   */
  diasDaAprovacao?: number;
  /** id → nome do patrocinador (o "Patrocinador removido" é o fallback). */
  sponsorNameById?: Map<string, string>;
  /** itemId → aprovações em aberto daquela peça. */
  openApprovalsByItem?: Map<string, DomainApproval[]>;
  /** userId → nome (para `solicitante`). Montado UMA vez pela rota; nunca N+1. */
  userNameById?: Map<string, string>;
  /**
   * Callback do agregado cross-evento de patrocinadores. Fica fora da função
   * para não obrigar o domínio a conhecer o ranking — quem chama decide se
   * quer acumular (a rota quer; o job de snapshot não).
   */
  onSponsorHolding?: (info: {
    sponsorId: string;
    sponsorName: string;
    days: number;
    eventId: string;
    eventName: string;
    itemId: string;
    displayId: string;
  }) => void;
}

/**
 * Recorte barato de "evento que ainda interessa à gestão de prazos", aplicável
 * ANTES de buscar as peças no banco (o filtro por `allDelivered` depende das
 * peças e continua dentro de `buildEventPrazo`).
 *
 * As DUAS origens de "finalizado" (encerramento manual e data do evento já
 * passada) vivem num predicado só, em @shared/prazo-dates — o mesmo que as
 * telas de fila usam no cliente. Elas não são redundantes: o encerramento
 * manual derruba também o evento com data FUTURA (trabalho que alguém decidiu
 * que ninguém mais vai fazer), e a data derruba o evento que ninguém lembrou
 * de encerrar. `motivoEventoFinalizado` compara DIA-calendário no fuso do
 * negócio, então nada some às 21h da véspera, e trata evento SEM data de
 * início como ainda em jogo.
 *
 * "completed" continua aqui à parte: não é finalização, é produção terminada
 * (tudo entregue) — o mesmo que `allDelivered` faz em `buildEventPrazo`.
 *
 * Um ponto só atende as duas portas (routes/prazos.ts e
 * services/prazoSnapshots.ts).
 */
export function isPrazoCandidate(event: DomainEvent, today: number): boolean {
  if (event.status === "completed") return false;
  return motivoEventoFinalizado(event, today) === null;
}

/**
 * A origem da saída, para quem precisa EXPLICAR a ausência (o servidor conta
 * quantos eventos saíram por cada motivo; as telas dizem a frase certa).
 * Reexportado daqui para que o server tenha um import só.
 */
export { motivoEventoFinalizado };
export type { EventoFinalizadoMotivo };

/**
 * Monta o objeto `PrazoEvent` completo de um evento.
 * Devolve `null` quando o evento saiu da gestão de prazos (tudo entregue, ou
 * finalizado — encerrado à mão ou com a data do evento já passada) — "é
 * história", nas palavras do negócio.
 */
export function buildEventPrazo(
  event: DomainEvent,
  items: DomainItem[],
  deps: BuildEventDeps,
): PrazoEvent | null {
  const { today } = deps;

  // MOLDE (22/09): produzido é o fim do fluxo dele — entra como entregue.
  const eventItems = items.map(comStatusDeContagem).filter((it) => !OUT_OF_FUNNEL.has(it.status));

  // Evento com tudo entregue, encerrado à mão ou já realizado é história —
  // sai da gestão de prazos.
  const allDelivered = eventItems.length > 0 && eventItems.every((it) => DELIVERED.has(it.status));
  if (allDelivered || !isPrazoCandidate(event, today)) return null;

  const truckDay = truckDayUTC(event.truckDepartureDate);
  // Mesmo guard do Painel: ano absurdo (ex.: 0206) é problema de
  // cadastro — sinalizamos em vez de calcular atraso de 600 mil dias.
  // A faixa mora em @shared/prazo-dates (fonte única, ver o arquivo).
  const invalidDate = !isPlausibleEventYear(truckDay.getUTCFullYear());

  // Os seis prazos do evento ("YYYY-MM-DD", com o fim de semana de cada marco)
  // — o calendário do evento, igual para toda peça.
  const prazosDoEvento = STAGE_DEFS.map((def) => {
    const offset = (event[def.offsetField] as number | null | undefined) ?? def.defaultOffset;
    return stageDeadline(truckDay, offset, def.fimDeSemana).toISOString().slice(0, 10);
  });
  const hojeStr = new Date(today).toISOString().slice(0, 10);
  const diasDaAprovacao = deps.diasDaAprovacao ?? DIAS_DA_APROVACAO_PADRAO;

  // O prazo de CADA peça (a regra única, @shared/prazo-sem-aprovacao): o marco
  // que a cobra e o piso (o prazo de Layout ajustado da peça sem aprovação).
  const prazoDe = new Map(eventItems.map((it) => [it.id, prazoDaPeca(it, prazosDoEvento, diasDaAprovacao)]));

  // Contagem por etapa: direta (cobradas AQUI) e acumulada (aqui ou antes).
  // O índice é o do MARCO que mede a peça, não o da etapa em que ela está.
  const directCounts = new Array(STAGE_DEFS.length).fill(0);
  for (const it of eventItems) {
    const marco = prazoDe.get(it.id)?.marco;
    if (marco !== undefined) directCounts[marco] += 1;
  }
  // Evento sem NENHUMA peça: runningPending 0 deixaria todas as etapas
  // "done" — verde falso para um evento em que nada começou. Etapas
  // ficam neutras e o front sinaliza "sem peças cadastradas".
  const noItems = eventItems.length === 0;

  // O PRAZO EFETIVO DE CADA ETAPA (26/10). O gate da etapa i são as peças
  // cobradas em i ou antes; cada uma vence em i no prazo do marco — ou no piso
  // dela, quando é mais tarde (a peça sem aprovação em Layout só está atrasada
  // depois do Layout ajustado). O semáforo da etapa olha o MENOR desses
  // prazos: só peça sem aprovação no gate → a etapa vence no ajustado; uma
  // peça comum basta para valer o prazo do evento. Sem peça com piso, o
  // efetivo é o próprio prazo do marco — o comportamento de sempre.
  // A PEÇA SEM APROVAÇÃO não passa pela Aprovação (RN04): ela não segura essa
  // etapa — o gate da Aprovação não a conta, como a agenda do Detalhe e a
  // trilha da ficha (a Aprovação aparece "pulada" para ela).
  const gate = eventItems
    .map((it) => { const pd = prazoDe.get(it.id); return pd ? { ...pd, pula: pulaAprovacao(it) } : null; })
    .filter((pd): pd is NonNullable<typeof pd> => !!pd);
  const pulamAAprovacao = gate.filter((pd) => pd.pula && pd.marco < APROVACAO_STAGE_INDEX).length;

  let runningPending = 0;
  const stages: PrazoStage[] = STAGE_DEFS.map((def, i) => {
    runningPending += directCounts[i];
    const pendentesAqui = i === APROVACAO_STAGE_INDEX ? runningPending - pulamAAprovacao : runningPending;
    const deadline = prazosDoEvento[i];
    let efetivo: string | null = null;
    let atrasadas = 0;
    for (const pd of gate) {
      if (pd.marco > i) continue;
      if (i === APROVACAO_STAGE_INDEX && pd.pula && pd.marco < i) continue;
      const p = prazoNoMarco(i, prazosDoEvento, pd.piso);
      if (efetivo === null || p < efetivo) efetivo = p;
      if (p < hojeStr) atrasadas += 1;
    }
    const prazoEfetivo = efetivo ?? deadline;
    const diffDays = Math.round((Date.parse(`${prazoEfetivo}T00:00:00Z`) - today) / 86400000);

    let state: StageState;
    if (noItems) state = "upcoming";
    // Só peças sem aprovação antes dela: a Aprovação não foi CUMPRIDA, foi
    // pulada — neutra ("upcoming"), nunca o ✓ de "feita".
    else if (pendentesAqui === 0 && i === APROVACAO_STAGE_INDEX && pulamAAprovacao > 0) state = "upcoming";
    else if (pendentesAqui === 0) state = "done";
    else if (invalidDate) state = "upcoming"; // sem data confiável não há atraso confiável
    else if (diffDays < 0) state = "overdue";
    else if (diffDays <= 3) state = "warning";
    else state = "upcoming";

    return {
      key: def.key,
      label: def.label,
      deadline,
      prazoEfetivo,
      diffDays,
      pendingCount: pendentesAqui,    // cobradas aqui OU antes (o gate real)
      directCount: directCounts[i],   // cobradas exatamente por este marco
      atrasadas: invalidDate ? 0 : atrasadas,
      state,
    };
  });

  const deliveredCount = eventItems.filter((it) => DELIVERED.has(it.status)).length;

  // Risco projetado (regra fixa inicial, S6 da revisão): marco a até
  // 2 dias de vencer com 10+ peças ainda no gate é matematicamente
  // inviável — merece grito ANTES de virar atraso consumado.
  const riskCritical = !invalidDate && stages.some((s) =>
    (s.state === "warning" || s.state === "upcoming")
    && s.diffDays >= 0 && s.diffDays <= 2 && s.pendingCount >= 10);

  // Peças pendentes para o drill-down — detalhadas de propósito: a
  // tela existe para o diretor COBRAR, então cada linha diz o que é,
  // há quantos dias está parada e (na aprovação) quem está segurando.
  const pendingItems: PrazoPendingItem[] = eventItems
    .filter((it) => STATUS_STAGE_RANK[it.status] !== undefined)
    .map((it) => {
      // O RELÓGIO É `statusChangedAt`, não `updatedAt`.
      //
      // A dívida que este ponto registrava ("o relógio exato pede uma coluna
      // statusChangedAt") foi paga: a coluna existe (schema.ts) e o storage a
      // grava só quando o status muda de verdade (`IS DISTINCT FROM`). O que
      // ficou para trás foi este uso.
      //
      // `updatedAt` é tocado por qualquer escrita — atribuir book, corrigir
      // uma observação, uma rotina que varre o evento inteiro — e várias delas
      // nem geram linha no histórico. O resultado era a tela afirmar "sem
      // movimento hoje" sobre uma peça parada há semanas, com o histórico da
      // peça vazio no dia: o número contradizendo o único registro conferível.
      //
      // Sem carimbo, o valor é `null` e a tela CALA. Cair para `createdAt`
      // daria um número plausível e errado — uma peça criada há oito meses que
      // entrou na etapa ontem viraria "há 240d", e quem procura gargalo agiria
      // sobre isso.
      const waitingDays = it.statusChangedAt
        ? daysSince(it.statusChangedAt, today)
        : null;
      const pd = prazoDe.get(it.id) ?? null;
      const aguarda = aguardandoArteDoCliente(it);
      let sponsors: PrazoPendingSponsor[] | undefined;
      if (AWAITING_SPONSOR.has(it.status)) {
        const open = deps.openApprovalsByItem?.get(it.id) ?? [];
        sponsors = open.map((ap) => {
          const name = deps.sponsorNameById?.get(ap.sponsorId) ?? "Patrocinador removido";
          // updatedAt ?? createdAt: o registro sobrevive ao ciclo
          // reprovar→reenviar (o reset só bumpa updatedAt) — contar de
          // createdAt cobraria o patrocinador por dias em que a bola
          // estava com a Arte. Recém-criado, os dois são iguais.
          const days = daysSince(ap.updatedAt ?? ap.createdAt, today);
          const holder: "sponsor" | "arte" = SPONSOR_TURN.has(ap.status) ? "sponsor" : "arte";
          if (holder === "sponsor") {
            deps.onSponsorHolding?.({
              sponsorId: ap.sponsorId,
              sponsorName: name,
              days,
              eventId: event.id,
              eventName: event.name,
              itemId: it.id,
              displayId: it.displayId,
            });
          }
          return { name, days, holder };
        });
      }
      return {
        id: it.id,
        displayId: it.displayId,
        status: it.status,
        // Etapa calculada AQUI (fonte única): o front não mantém mais
        // um espelho do mapa status→etapa que podia divergir.
        stageIndex: STATUS_STAGE_RANK[it.status],
        // Marco que MEDE esta peça. Igual a `stageIndex` no caso normal;
        // diferente na peça sem aprovação e na do Kit — ver `marcoIndexFor`.
        marcoIndex: pd?.marco as number,
        // O prazo que mede a peça agora — o do marco, ou o Layout ajustado
        // (26/10). É por ele que a peça está (ou não) atrasada.
        prazo: pd?.prazo ?? null,
        semPatrocinio: semPatrocinio(it),
        arteDoCliente: !!it.arteDoCliente,
        aguardandoArteDoCliente: aguarda,
        atrasoDoCliente: !invalidDate && responsavelPeloAtraso(it, pd, hojeStr) === "cliente",
        prazoDeLayout: prazosDeLayoutDaPeca(it, prazosDoEvento[INDICE_LAYOUT], diasDaAprovacao),
        type: it.type,
        description: it.description ?? null,
        quantity: it.quantity,
        waitingDays,
        sponsors,
      };
    });

  // ── Campos derivados (fonte única para KPI, colunas, filtros e faixas) ────

  const overdueStages = stages.filter((s) => s.state === "overdue");

  // CATEGORIA: uma classificação e só uma, com precedência explícita.
  // Antes, "sem peças", "data inválida", "atrasado" e "em dia" eram decididos
  // separadamente em quatro lugares (KPI, coluna do quadro, filtro "Só com
  // atraso" e o botão de cobrança) — e discordavam. O evento sem nenhuma peça
  // a 5 dias da saída, que é o pior caso do negócio, era o que mais sofria:
  // entrava no placar "em dia", ia parar na ÚLTIMA coluna do funil e sumia do
  // filtro de atraso. Aqui ele ganha nome próprio, antes de qualquer outra
  // coisa — inclusive antes de "data inválida", porque sem peça nem existe
  // funil a corrigir.
  const categoria: PrazoCategoria =
    eventItems.length === 0 ? "semPecas"
    : invalidDate ? "dataInvalida"
    : overdueStages.length > 0 ? "atrasado"
    : "emDia";

  // Dias até a saída, MESMA âncora do semáforo. `null` quando a data não é
  // confiável — o cliente exibe "corrija o cadastro" em vez de uma conta fiel
  // sobre lixo (o "0206" que virava "ATRASADO 664730D").
  const diasParaSaida = invalidDate
    ? null
    : Math.round((truckDay.getTime() - today) / 86400000);

  // Pior atraso do evento: a etapa vencida há MAIS tempo é a de menor
  // diffDays (mais negativo). Ordena "mais atrasado primeiro" e a faixa
  // "Comece por aqui" sem o cliente refazer a varredura.
  const piorAtrasoDias = overdueStages.length
    ? Math.abs(Math.min(...overdueStages.map((s) => s.diffDays)))
    : 0;

  // Peças em atraso DESTE evento: as atrasadas da etapa vencida mais AVANÇADA
  // (peça presa antes também está atrasada para aquele marco). É exatamente a
  // parcela deste evento em `kpis.pecasAtrasadas` — expor por evento é o que
  // reconcilia o card com o placar. `atrasadas` (e não `pendingCount`, 26/10):
  // a peça sem aprovação no gate que ainda não passou do Layout ajustado está
  // pendente, mas não atrasada. Sem ela, os dois números são iguais.
  // A peça sem aprovação não entra no gate da Aprovação (acima): quando a
  // Aprovação é a etapa vencida mais avançada, a que já passou do Layout
  // ajustado dela soma aqui — atrasada uma vez, no marco que a cobra.
  const ultimaVencida = overdueStages.length ? overdueStages[overdueStages.length - 1] : null;
  const semAprovacaoAtrasadas = ultimaVencida?.key === STAGE_DEFS[APROVACAO_STAGE_INDEX].key && !invalidDate
    ? gate.filter((pd) => pd.pula && pd.marco < APROVACAO_STAGE_INDEX && pd.prazo < hojeStr).length
    : 0;
  const pecasEmAtraso = ultimaVencida ? ultimaVencida.atrasadas + semAprovacaoAtrasadas : 0;
  // RN09: das atrasadas, quantas o são por conta do CLIENTE (arte do cliente
  // não recebida depois do Layout ajustado) — o resto é atraso interno.
  const pecasAtrasoDoCliente = pendingItems.filter((it) => it.atrasoDoCliente).length;
  const aguardandoArteDoClienteCount = pendingItems.filter((it) => it.aguardandoArteDoCliente).length;

  // Separa o evento atrasado mas FERVENDO do evento atrasado e ABANDONADO —
  // são duas cobranças completamente diferentes.
  // Só as peças COM carimbo entram na pior espera: uma peça sem registro não
  // é uma peça que andou hoje, e contá-la como 0 puxaria o pior caso para
  // baixo — justamente no evento antigo, que é onde há peças sem carimbo.
  const esperasConhecidas = pendingItems
    .map((it) => it.waitingDays)
    .filter((d): d is number => d !== null);
  const piorEsperaDias = esperasConhecidas.length
    ? Math.max(...esperasConhecidas)
    : 0;

  return {
    id: event.id,
    name: event.name,
    priority: event.priority ?? null,
    // ISO explícito: o contrato promete `string`, e deixar o `Date` cru
    // dependendo da serialização do Express é o tipo de acordo tácito que
    // quebra no dia em que alguém trocar o serializador.
    startDate: new Date(event.startDate).toISOString(),
    truckDepartureDate: new Date(event.truckDepartureDate).toISOString(),
    invalidDate,
    totalItems: eventItems.length,
    deliveredItems: deliveredCount,
    stages,
    pendingItems,
    riskCritical,
    categoria,
    diasParaSaida,
    piorAtrasoDias,
    pecasEmAtraso,
    piorEsperaDias,
    pecasAtrasoDoCliente,
    aguardandoArteDoCliente: aguardandoArteDoClienteCount,
    solicitante: (event.createdBy && deps.userNameById?.get(event.createdBy)) || null,
  };
}

/**
 * Placar, derivado INTEIRAMENTE de `categoria`.
 *
 * A fórmula antiga era `emDia = length - comAtraso - invalidos`: uma subtração
 * sobre conjuntos que se sobrepõem. Um evento com data inválida E sem peças
 * era descontado duas vezes e `emDia` podia ficar NEGATIVO. Contando categoria
 * exclusiva vale a identidade
 * `atrasados + semPecas + invalidCount + emDia === events.length`.
 *
 * NOTA para quem for comparar com a tendência de ontem: `emDia` e
 * `invalidCount` MUDARAM de definição. No primeiro dia após o deploy a seta
 * ▲▼ reflete a troca de fórmula, não a realidade do negócio. É esperado —
 * não "consertar" achando que é bug.
 */
export function computeKpis(events: PrazoEvent[]): PrazoKpis {
  const byCategoria = (c: PrazoCategoria) => events.filter((ev) => ev.categoria === c).length;
  return {
    atrasados: byCategoria("atrasado"),
    // Reusa `diasParaSaida` (já calculado com a âncora do negócio) em vez de
    // refazer a conta — era a terceira cópia da mesma aritmética.
    saidas7d: events.filter((ev) => ev.diasParaSaida !== null && ev.diasParaSaida >= 0 && ev.diasParaSaida <= 7).length,
    pecasAtrasadas: events.reduce((acc, ev) => acc + ev.pecasEmAtraso, 0),
    emDia: byCategoria("emDia"),
    invalidCount: byCategoria("dataInvalida"),
    semPecas: byCategoria("semPecas"),
    // RN09 (26/10): das peças atrasadas, as que o são por conta do cliente.
    pecasAtrasoDoCliente: events.reduce((acc, ev) => acc + (ev.pecasAtrasoDoCliente ?? 0), 0),
  };
}
