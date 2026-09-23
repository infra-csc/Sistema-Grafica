// ─── O recorte do Painel Geral — funções puras ──────────────────────────────
// Retrato por evento, filtragem, ordenação, agrupamento, KPIs e as opções dos
// menus com contagem. A página chama cada uma dentro de um useMemo com as
// mesmas dependências de sempre; aqui não há estado nem React.
import type { Sponsor } from "@shared/schema";
import { getApprovalMeta } from "@/lib/status";
import { compareDisplayId } from "@/lib/displayId";
import { toUTCDisplayDate } from "@/lib/utils";
// AS DEFINIÇÕES VÊM DA ANÁLISE, não de uma cópia. Os focos "retrabalho" e
// "fora do prazo" existem para responder ao clique num KPI de lá — se cada
// tela tivesse a sua regra, o número da Análise e a contagem daqui
// divergiriam, e a tela de destino desmentiria a tela de origem.
import { temRefacao } from "@/lib/analises-desempenho";
import { statusParaContagem } from "@shared/molde";
import { isDelivered } from "@/lib/analises-status";
import {
  STATUS_GROUPS, GROUP_KEYS, computeStats, matchesStatusFilter, statusFlowIndex, type GroupKey,
} from "@/lib/painel-kpis";
import { dayDiff, isPendingItemStatus } from "@/lib/painel-prazo";
import {
  seloEventoFinalizado, buscaEhCodigoDaPeca,
  CONTAGEM_OCULTAS_ZERO, type SeloEventoFinalizado, type ContagemOcultas,
} from "@/lib/painel-encerrados";
import { T, TOM } from "@/lib/theme";
import {
  DATE_RANGE_MAP, DATE_FILTER_LABELS, DATE_FILTER_VALUES, COLLATOR_PT, diasNoEstado, textoDeBusca,
} from "./regras";
import type {
  EventoDaPeca, GrupoDeEvento, MetaDoEvento, OpcaoDeFiltro, PecaDoPainel, SortCampo, SortDir,
} from "./tipos";

/**
 * O retrato de cada evento, calculado sobre a base INTEIRA.
 * De propósito não usa a lista filtrada: o chip de prazo diz "3 pendentes" e
 * esse número não pode encolher porque o usuário filtrou por "Entregue". O
 * estado do evento é o que é, independentemente do recorte na tela.
 */
export function retratoDosEventos(items: PecaDoPainel[], hojeNegocioMs: number) {
  const eventMeta = new Map<string, MetaDoEvento>();
  for (const i of items) {
    const key = i.eventId || "no-event";
    let m = eventMeta.get(key);
    if (!m) {
      const raw = i.event?.truckDepartureDate;
      // toUTCDisplayDate: mesma conversão usada na EXIBIÇÃO da saída — com
      // new Date() local, um fuso atrás do UTC classificava o dia errado.
      let truckDayMs: number | null = null;
      if (raw) { const d = toUTCDisplayDate(raw); d.setHours(0, 0, 0, 0); truckDayMs = d.getTime(); }
      m = { truckDayMs, pendentes: 0, selo: null };
      eventMeta.set(key, m);
    }
    if (!i.deletedAt && isPendingItemStatus(statusParaContagem(i))) m.pendentes++;
  }
  // ── Selo de evento fora de jogo, por evento ──────────────────────────────
  // Calculado DEPOIS do laço acima porque o rótulo do "realizado" depende da
  // contagem de pendentes ("com pendências" × "sem pendências"), que só fecha
  // no fim dele. `item.event` é o evento CRU do enrich de /api/items — traz
  // `status` e `startDate`, que são exatamente as duas colunas do predicado
  // compartilhado (@shared/prazo-dates), o mesmo das cinco filas.
  //
  // Cache próprio, alimentado sob demanda: a lista de EXCLUÍDAS pode trazer
  // peça de um evento que não tem nenhuma peça viva, e esse evento não existe
  // em `eventMeta`. Sem o fallback, a peça excluída de um evento encerrado
  // apareceria sem selo nenhum — exatamente o silêncio que este trabalho veio
  // acabar.
  const seloDosEventosVivos = new Map<string, SeloEventoFinalizado | null>();
  for (const i of items) {
    const key = i.eventId || "no-event";
    const m = eventMeta.get(key);
    if (!m || m.selo !== null) continue;
    if (!seloDosEventosVivos.has(key)) {
      seloDosEventosVivos.set(key, seloEventoFinalizado(i.event ?? null, hojeNegocioMs, m.pendentes));
    }
    m.selo = seloDosEventosVivos.get(key)!;
  }
  return { eventMeta, seloDosEventosVivos };
}

/** Tudo de que o recorte depende — as mesmas dependências do useMemo da página. */
export interface EntradaDoRecorte {
  eventMeta: Map<string, MetaDoEvento>;
  seloDosEventosVivos: Map<string, SeloEventoFinalizado | null>;
  hojeNegocioMs: number;
  items: PecaDoPainel[];
  deletedItems: PecaDoPainel[];
  showDeleted: boolean;
  searchTerm: string;
  statusFilter: string[];
  eventFilter: string[];
  sponsorFilter: string[];
  typeFilter: string[];
  dateFilter: string[];
  focoFilter: string[];
  mostrarFinalizados: boolean;
  typeToGroup: Record<string, string>;
  sortBy: SortCampo;
  sortDir: SortDir;
  eventoDasPecas: Map<string, EventoDaPeca>;
  sponsors: Sponsor[];
}

/** Uma dimensão do recorte base — ver `applyBaseFilters`. */
type DimBase = "evento" | "tipo" | "patrocinador" | "data";

export function calcularRecorte({
  eventMeta, seloDosEventosVivos, hojeNegocioMs, items, deletedItems, showDeleted, searchTerm,
  statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados,
  typeToGroup, sortBy, sortDir, eventoDasPecas, sponsors,
}: EntradaDoRecorte) {
  // Hoje à meia-noite — calculado UMA vez por recomputação (antes era um
  // new Date por item dentro do filtro).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // Içado do applyBaseFilters: eram até 4 toLowerCase() do MESMO termo por item.
  const q = searchTerm.toLowerCase();

  // Cópia por recomputação: o fallback abaixo acrescenta eventos que só
  // existem na lista de EXCLUÍDAS, e isso não pode vazar para o memo do
  // retrato (que não depende de `deletedItems`).
  const seloPorEvento = new Map(seloDosEventosVivos);
  const seloDoItem = (item: PecaDoPainel): SeloEventoFinalizado | null => {
    const key = item.eventId || "no-event";
    if (seloPorEvento.has(key)) return seloPorEvento.get(key)!;
    const selo = seloEventoFinalizado(item.event ?? null, hojeNegocioMs, eventMeta.get(key)?.pendentes ?? 0);
    seloPorEvento.set(key, selo);
    return selo;
  };
  const eventoFinalizado = (item: PecaDoPainel) => seloDoItem(item) !== null;

  const temReprovacao = (item: PecaDoPainel) =>
    Array.isArray(item.sponsors) &&
    item.sponsors.some((s) => getApprovalMeta(s?.approvalStatus)?.isRejection);

  // "Atrasada" é uma COBRANÇA, e evento fora de jogo não se cobra — nem quando
  // o usuário pede para VER as peças ocultas. Por isso a exclusão não olha o
  // `mostrarFinalizados`: revelar o registro é uma coisa, voltar a chamar de
  // atrasado o que ninguém mais vai tocar seria outra. Era isto que fazia o
  // chip "436 peças em evento com caminhão atrasado" contar um passivo que
  // ninguém ia atacar.
  const emEventoAtrasado = (item: PecaDoPainel) => {
    const m = eventMeta.get(item.eventId || "no-event");
    return !!m?.truckDayMs && dayDiff(todayMs, m.truckDayMs) < 0
      && isPendingItemStatus(statusParaContagem(item)) && !eventoFinalizado(item);
  };

  // ── A ocultação ──────────────────────────────────────────────────────────
  // A peça sai da lista quando o EVENTO dela saiu de circulação. Três
  // exceções, e as três são intenção EXPLÍCITA de ver aquilo:
  //   · o usuário pediu para ver (chip da faixa de atenção / deep link);
  //   · a busca é o CÓDIGO EXATO da peça — procurar "#3089" e ouvir "nenhuma
  //     peça encontrada" faria qualquer um concluir que ela sumiu do sistema;
  //   · o evento foi escolhido A DEDO no filtro de evento. Filtrar pelo nome do
  //     evento encerrado e receber "Nenhuma peça encontrada" seria a mesma
  //     armadilha, com um clique a menos de esforço para cair nela.
  //
  // `seriaOculto` ignora o botão e responde só "esta peça pertence à ocultação?".
  // É ele que alimenta a contagem do chip — sem essa separação o chip zeraria
  // assim que o usuário revelasse as peças, e o caminho de VOLTA para a lista
  // limpa desapareceria junto com ele.
  // Memoizado por peça DENTRO desta recomputação: a mesma peça passa por aqui
  // até seis vezes (base, ocultas, três pools de menu e a lista).
  const ocultoCache = new Map<PecaDoPainel, boolean>();
  const seriaOculto = (item: PecaDoPainel) => {
    let r = ocultoCache.get(item);
    if (r === undefined) {
      r = eventoFinalizado(item)
        && !buscaEhCodigoDaPeca(item.displayId, searchTerm)
        && !eventFilter.includes(item.eventId);
      ocultoCache.set(item, r);
    }
    return r;
  };
  const ocultoPorEvento = (item: PecaDoPainel) => !mostrarFinalizados && seriaOculto(item);

  /**
   * O recorte base da tela. `exceto` desliga UMA dimensão — é assim que o
   * pool das opções de um menu sai da MESMA lista que a tela mostra, sem o
   * próprio filtro dele (senão a opção escolhida seria a única com número).
   * Mesma assinatura de `casaRecorte(item, 'evento')` na Revisão Final e de
   * `casaHistorico(i, 'evento')` no Atendimento — a disciplina travada em
   * server/__tests__/faceta-lista-invariante.test.ts.
   */
  // PERF-4: cada dimensão é avaliada UMA vez por peça por recomputação e
  // guardada como máscara de bits das dimensões que a peça NÃO casa. Antes a
  // peça era reavaliada inteira em cada chamada — uma pela base, uma por menu
  // com contagem e uma pela lista —, com cinco toLowerCase de busca em cada.
  // `applyBaseFilters(item, exceto)` responde igual: ignora o bit da dimensão
  // excluída e exige que as demais casem.
  const BIT_DIM: Record<DimBase, number> = { evento: 1, tipo: 2, patrocinador: 4, data: 8 };
  const BIT_BUSCA = 16;
  const falhasPorPeca = new Map<PecaDoPainel, number>();
  const falhasDoRecorte = (item: PecaDoPainel): number => {
    const cache = falhasPorPeca.get(item);
    if (cache !== undefined) return cache;
    // Busca sobre o texto memoizado da peça (código, evento, tipo, descrição
    // e patrocinador — ver textoDeBusca). Patrocinador: a tela exibe chips de
    // patrocinador em toda linha, então "buscar Ambev" é tentativa natural.
    const matchesSearch = q === "" || textoDeBusca(item).includes(q);
    const matchesEvent   = eventFilter.length === 0   || eventFilter.includes(item.eventId);
    const matchesType    = typeFilter.length === 0    || typeFilter.includes(item.type);
    const matchesSponsor = sponsorFilter.length === 0 ||
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s) => sponsorFilter.includes(s.id)));
    const matchesDate = dateFilter.length === 0 || (() => {
      // Âncora: SAÍDA DO CAMINHÃO (decisão de negócio) — é o prazo operacional
      // que os chips e alertas usam. Antes filtrava pelo início do evento, que
      // podia dizer "no prazo" com o caminhão já atrasado.
      // Itens sem data não são descartados em silêncio: têm opção própria.
      const truckDayMs = eventMeta.get(item.eventId || "no-event")?.truckDayMs ?? null;
      if (truckDayMs == null) return dateFilter.includes("no_departure");
      // dayDiff (Math.round): a MESMA conta do chip de prazo. Antes o filtro
      // usava ceil e o chip usava round sobre a mesma diferença.
      const diff = dayDiff(todayMs, truckDayMs);
      return dateFilter.some(df => df === "no_departure" ? false : (DATE_RANGE_MAP[df] ? DATE_RANGE_MAP[df](diff) : true));
    })();
    const falhas = (matchesSearch ? 0 : BIT_BUSCA) | (matchesEvent ? 0 : BIT_DIM.evento)
      | (matchesType ? 0 : BIT_DIM.tipo) | (matchesSponsor ? 0 : BIT_DIM.patrocinador)
      | (matchesDate ? 0 : BIT_DIM.data);
    falhasPorPeca.set(item, falhas);
    return falhas;
  };
  const applyBaseFilters = (item: PecaDoPainel, exceto?: DimBase) =>
    (falhasDoRecorte(item) & ~(exceto ? BIT_DIM[exceto] : 0)) === 0;

  // "Fora do prazo": peça ENTREGUE depois do dia em que o caminhão saiu. É a
  // mesma conta de computeDesempenho — inclusive o `<=`, que trata entregar
  // NO dia da saída como no prazo, porque o caminhão carrega naquele dia.
  const entregueForaDoPrazo = (item: PecaDoPainel) => {
    if (!isDelivered(item.status)) return false;
    const truckDayMs = eventMeta.get(item.eventId || "no-event")?.truckDayMs ?? null;
    if (truckDayMs == null || !item.deliveredAt) return false;
    const d = new Date(item.deliveredAt);
    d.setHours(0, 0, 0, 0);
    return d.getTime() > truckDayMs;
  };

  const matchesFoco = (item: PecaDoPainel) => focoFilter.every(f =>
    f === "reprovadas" ? temReprovacao(item)
    : f === "atrasadas" ? emEventoAtrasado(item)
    : f === "pendentes" ? isPendingItemStatus(statusParaContagem(item))
    // Os dois abaixo são a porta de entrada dos KPIs da Análise.
    : f === "retrabalho" ? temRefacao(item)
    : f === "fora-do-prazo" ? entregueForaDoPrazo(item)
    : true);

  const matchesStatus = (item: PecaDoPainel, f: string[]) => {
    const isDeleted = !!item.deletedAt;
    const activeFilters = f.filter(x => x !== "deleted");
    // Itens excluídos só aparecem quando o filtro "deleted" está ativo — e,
    // se houver outro status marcado, precisam casar com ele também. Antes o
    // atalho `return f.includes("deleted")` trazia a lixeira INTEIRA com o
    // card "Solicitado" marcado como Filtrado: o rótulo mentia.
    if (isDeleted) {
      if (!f.includes("deleted")) return false;
      return activeFilters.length === 0 || matchesStatusFilter(item.status, activeFilters);
    }
    // Itens normais nunca aparecem quando só "deleted" está selecionado —
    // com "Excluídos" como único filtro, a lista mostra SÓ os excluídos.
    if (activeFilters.length === 0) return !f.includes("deleted");
    // Molde produzido cai no card de Entregues, o mesmo que o conta (shared/molde).
    return matchesStatusFilter(statusParaContagem(item), activeFilters);
  };

  // Quando o filtro "Excluídos" está ativo, mescla as peças soft-deleted na lista de exibição.
  const allDisplayItems = showDeleted ? [...items, ...deletedItems] : items;

  // Base do bloco "Precisa de atenção": respeita evento/tipo/busca, mas NÃO o
  // próprio foco — senão o número do chip mudaria ao clicar nele mesmo.
  //
  // A REGRA DOS NÚMEROS DESTA TELA, e ela vale para TUDO (KPIs, contador de
  // resultados, chips de atenção, exportação): os números seguem o RECORTE
  // VISÍVEL. Um KPI é "quanto trabalho eu tenho", e evento fora de jogo não é
  // trabalho. A única exceção é o chip de ocultas logo abaixo — ele existe
  // justamente para contar o que os outros deixaram de contar, e é a porta de
  // volta. Metade dos números seguindo uma regra e metade outra seria pior que
  // qualquer das duas.
  const baseCompleta = items.filter(i => applyBaseFilters(i));
  const baseItems = baseCompleta.filter(i => !ocultoPorEvento(i));
  const atencao = {
    reprovadas: baseItems.filter(temReprovacao).length,
    atrasadas: baseItems.filter(emEventoAtrasado).length,
  };

  // O que a ocultação tira (ou tiraria) da tela, por origem e por situação.
  // Contado sobre a base JÁ filtrada pelos demais recortes: o chip fala do que
  // sumiu DESTA lista, não do banco inteiro — senão ele anunciaria peças que o
  // filtro de evento tinha excluído de qualquer jeito.
  const ocultas: ContagemOcultas = { ...CONTAGEM_OCULTAS_ZERO };
  for (const i of baseCompleta) {
    if (!seriaOculto(i)) continue;
    const motivo = seloDoItem(i)!.motivo;
    const aberto = !i.deletedAt && isPendingItemStatus(statusParaContagem(i));
    if (motivo === "encerrado") { ocultas.encerrado++; if (aberto) ocultas.encerradoAberto++; }
    else { ocultas.realizado++; if (aberto) ocultas.realizadoAberto++; }
  }

  const statsItems = baseItems.filter(matchesFoco);

  // ── Opções dos menus, COM contagem ─────────────────────────────────────
  // Os seis menus desta tela eram os únicos do app sem número nenhum: os
  // cards de status contavam, os chips de atenção contavam, e os menus logo
  // ao lado ofereciam listas mudas. Pior no de Evento, que varria a query
  // `events` INTEIRA — oferecia evento do sistema todo sobre uma fila podada
  // por evento finalizado, e clicar num deles devolvia lista vazia sem dizer
  // por quê. É exatamente o defeito que o teste de invariante trava nas
  // outras telas.
  //
  // Cada pool exclui o próprio filtro (`exceto`) e respeita a ocultação de
  // evento finalizado — menos o de EVENTO, que a ignora de propósito: é
  // clicando no evento oculto que o operador o revela (`seriaOculto` já não
  // esconde evento escolhido à mão), então esconder a opção fecharia a única
  // porta de entrada. Mesma decisão da Gráfica com as peças entregues.
  const poolDe = (dim: DimBase, respeitarOcultacao = true) => {
    const base = items.filter(i => applyBaseFilters(i, dim));
    return respeitarOcultacao ? base.filter(i => !ocultoPorEvento(i)) : base;
  };

  const PRIO_ORDEM: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const PRIO_COR: Record<string, string> = { urgente: TOM.perigo.dot, alta: T.accent, media: TOM.alerta.dot, baixa: TOM.info.dot };
  // Nome e prioridade do evento saem do evento EMBUTIDO nas peças (ver
  // `eventoDasPecas`): todo id deste menu veio de uma peça, então ele sempre
  // responde — e a tela não precisa da lista inteira de /api/events.
  const eventoPorId = eventoDasPecas;

  const eventFilterOptions: OpcaoDeFiltro[] = (() => {
    const conta = new Map<string, number>();
    poolDe("evento", false).forEach(i => {
      if (!i.eventId) return;
      conta.set(i.eventId, (conta.get(i.eventId) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .map(([id, count]) => {
        // `events` entra só para buscar NOME e prioridade de um id que já veio
        // da lista — nunca como fonte do conjunto de opções.
        const ev = eventoPorId.get(id);
        return { value: id, label: ev?.name ?? "Evento sem nome", count, dotColor: PRIO_COR[ev?.priority ?? ""], _p: PRIO_ORDEM[ev?.priority ?? ""] ?? 4 };
      })
      // `pinned` em todas para o FilterSelect preservar esta ordem: por
      // prioridade e, dentro dela, alfabética — era a ordem que a tela já
      // tinha e que a ordenação alfabética padrão do menu desmontaria.
      .sort((a, b) => a._p !== b._p ? a._p - b._p : COLLATOR_PT.compare(a.label, b.label))
      .map(({ _p, ...o }) => ({ ...o, pinned: true }));
  })();

  const typeFilterOptions: OpcaoDeFiltro[] = (() => {
    const conta = new Map<string, number>();
    poolDe("tipo").forEach(i => { if (i.type) conta.set(i.type, (conta.get(i.type) ?? 0) + 1); });
    return Array.from(conta.entries()).map(([t, count]) => ({ value: t, label: t, count }));
  })();

  const sponsorFilterOptions: OpcaoDeFiltro[] = (() => {
    const conta = new Map<string, number>();
    poolDe("patrocinador").forEach(i => {
      if (!Array.isArray(i.sponsors)) return;
      // Set por peça: uma peça com o mesmo patrocinador repetido não pode
      // contar duas vezes — o clique nele devolveria UMA linha.
      new Set(i.sponsors.map((s) => s?.id).filter((id): id is string => Boolean(id))).forEach((id) => {
        conta.set(id, (conta.get(id) ?? 0) + 1);
      });
    });
    const nomePorId = new Map(sponsors.map(s => [s.id, s.name]));
    return Array.from(conta.entries())
      .map(([id, count]) => ({ value: id, label: nomePorId.get(id) ?? "Patrocinador", count }));
  })();

  const dateFilterOptions: OpcaoDeFiltro[] = (() => {
    // Era uma varredura completa do pool POR OPÇÃO de data (6+ passes por
    // render). Uma passada só, contando cada peça em todas as faixas em que
    // ela cai — mesma régua, ~6× menos trabalho por render.
    const pool = poolDe("data");
    const conta = new Map<string, number>(DATE_FILTER_VALUES.map((v) => [v, 0]));
    for (const i of pool) {
      const truckDayMs = eventMeta.get(i.eventId || "no-event")?.truckDayMs ?? null;
      if (truckDayMs == null) {
        conta.set("no_departure", (conta.get("no_departure") ?? 0) + 1);
        continue;
      }
      const diff = dayDiff(todayMs, truckDayMs);
      for (const value of DATE_FILTER_VALUES) {
        if (value === "no_departure") continue;
        const casa = DATE_RANGE_MAP[value] ? DATE_RANGE_MAP[value](diff) : true;
        if (casa) conta.set(value, (conta.get(value) ?? 0) + 1);
      }
    }
    return DATE_FILTER_VALUES.map((value) => ({
      value,
      label: DATE_FILTER_LABELS[value],
      count: conta.get(value) ?? 0,
      pinned: true,
    }));
  })();

  /** Dias entre criação e entrega — a mesma conta do KPI de ciclo. */
  const cicloEmDias = (i: PecaDoPainel): number | null => {
    if (!isDelivered(i.status) || !i.deliveredAt || !i.createdAt) return null;
    const fim = new Date(i.deliveredAt); fim.setHours(0, 0, 0, 0);
    const ini = new Date(i.createdAt); ini.setHours(0, 0, 0, 0);
    const d = (fim.getTime() - ini.getTime()) / 86400000;
    return d >= 0 ? d : null;
  };

  const areaDe = (i: PecaDoPainel) => {
    const fw = Number(i.fileWidth), fh = Number(i.fileHeight);
    if (Number.isFinite(fw) && Number.isFinite(fh) && fw > 0 && fh > 0) return fw * fh;
    const vw = Number(i.visualWidth), vh = Number(i.visualHeight);
    if (Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0) return vw * vh;
    return -1;
  };

  const dir = sortDir === "asc" ? 1 : -1;
  const filteredItems = allDisplayItems
    .filter((i) => applyBaseFilters(i))
    .filter((i) => !ocultoPorEvento(i))
    .filter(matchesFoco)
    .filter((i) => matchesStatus(i, statusFilter))
    .sort((a, b) => {
      // Itens excluídos ficam no final
      if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? 1 : -1;
      const gA = typeToGroup[a.type] || '', gB = typeToGroup[b.type] || '';
      if (gA !== gB) return COLLATOR_PT.compare(gA, gB);
      // Ordenação escolhida no cabeçalho. O padrão continua sendo o displayId:
      // compareDisplayId, não replace(/\D/g,'') — com o replace, o complemento
      // "#0062-C1" virava 621 e aparecia centenas de linhas longe da mãe.
      if (sortBy === "status") {
        // ORDENA PELO TEMPO NO ESTADO, nao pela etapa do fluxo. Ordenar por
        // etapa so reagrupa o que os cards ja agrupam; ordenar por tempo
        // responde a pergunta nova — o que esta parado ha mais tempo. Peca sem
        // carimbo vai para o fim: ela nao e "a mais nova", e desconhecida.
        const ia = diasNoEstado(a, Date.now()), ib = diasNoEstado(b, Date.now());
        if (ia !== ib) {
          if (ia === null) return 1;
          if (ib === null) return -1;
          return (ib - ia) * dir;
        }
        const d = statusFlowIndex(a.status) - statusFlowIndex(b.status);
        if (d !== 0) return d * dir;
      } else if (sortBy === "area") {
        const d = areaDe(a) - areaDe(b);
        if (d !== 0) return d * dir;
      } else if (sortBy === "ciclo") {
        // MESMA conta do KPI: dias entre a criação e a entrega, só para peça
        // entregue. Peça sem ciclo fechado não é "a mais rápida" — é outra
        // coisa, e vai para o fim em qualquer direção.
        const ca = cicloEmDias(a), cb = cicloEmDias(b);
        if (ca !== cb) {
          if (ca === null) return 1;
          if (cb === null) return -1;
          return (cb - ca) * dir;
        }
      } else {
        return compareDisplayId(a.displayId, b.displayId) * dir;
      }
      return compareDisplayId(a.displayId, b.displayId);
    });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const k = item.eventId || "no-event";
    if (!acc[k]) acc[k] = { eventId: item.eventId, eventName: item.event?.name || "Sem Evento", items: [] };
    acc[k].items.push(item);
    return acc;
  }, {} as Record<string, GrupoDeEvento>);

  // KPIs num único passe, derivados do MESMO mapa que o predicado do filtro
  // (lib/painel-kpis). Antes eram duas escritas da mesma regra sem ligação, e
  // o switch sem `default:` deixava status fora do mapa somarem no Total e em
  // card nenhum — a soma dos cards parava de fechar sem qualquer aviso.
  const stats = computeStats(statsItems);

  // Grupos ordenados pela saída do caminhão (ascendente; sem data por último;
  // empate/sem data desempata pelo nome) — Object.entries herdava a ordem de
  // inserção, arbitrária para o usuário.
  //
  // ANTES DISSO, porém, evento fora de jogo vai para o FIM — nunca escondido,
  // sempre no fim. A ordem é por saída do caminhão ASCENDENTE, ou seja o mais
  // antigo primeiro: um evento encerrado em maio ficaria no topo da tela
  // empurrando para baixo tudo que ainda está vivo. Só acontece com o chip de
  // ocultas ligado (por padrão eles nem aparecem), e é exatamente aí que
  // importa: quem revelou o registro quer olhá-lo DEPOIS do trabalho do dia.
  const sortedGroupEntries = (Object.entries(groupedItems) as Array<[string, GrupoDeEvento]>).sort(([ka, a], [kb, b]) => {
    const fa = seloPorEvento.get(ka) ? 1 : 0;
    const fb = seloPorEvento.get(kb) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const da = eventMeta.get(ka)?.truckDayMs ?? null;
    const db = eventMeta.get(kb)?.truckDayMs ?? null;
    if (da == null && db == null) return COLLATOR_PT.compare(a.eventName, b.eventName);
    if (da == null) return 1;
    if (db == null) return -1;
    const diff = da - db;
    return diff !== 0 ? diff : COLLATOR_PT.compare(a.eventName, b.eventName);
  });

  return { filteredItems, sortedGroupEntries, stats, atencao, ocultas,
           eventFilterOptions, typeFilterOptions, sponsorFilterOptions, dateFilterOptions };
}

/**
 * Idades por etapa da barra do fluxo, numa passada só. A barra chamava
 * `idadeDoSegmento` para até 13 segmentos — duas vezes cada, no title — e
 * cada chamada varria a lista filtrada inteira com parse de data: ~130 mil
 * iterações a cada render da página, inclusive ao abrir um menu.
 */
export function idadesPorEtapaDe(filteredItems: PecaDoPainel[], relogioIdade: number) {
  const porStatus = new Map<string, GroupKey>();
  for (const k of GROUP_KEYS) for (const s of STATUS_GROUPS[k]) porStatus.set(s, k);
  const m = new Map<string, number[]>();
  for (const i of filteredItems) {
    const k = porStatus.get(i.status);
    if (!k) continue;
    const d = diasNoEstado(i, relogioIdade);
    if (d === null) continue;
    let lista = m.get(k);
    if (!lista) { lista = []; m.set(k, lista); }
    lista.push(d);
  }
  return m;
}
