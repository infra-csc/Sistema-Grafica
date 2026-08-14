// Lista PLANA de peças atrasadas — a regra da terceira visão da tela, em
// funções PURAS (payload do contrato entra, lista ordenada sai).
//
// PORQUÊ ESTE ARQUIVO. As duas visões existentes são orientadas a EVENTO: o
// quadro põe o evento numa coluna, a tabela põe o evento numa linha, e as
// peças só aparecem depois de abrir o drill de um evento por vez. A pergunta
// do dono — "ver todos os itens atrasados, sem divisão de eventos, claro
// falando qual evento é" — é orientada a PEÇA e nenhuma das duas responde sem
// N cliques. Aqui a regra fica testável (`server/__tests__/prazo-atrasadas.test.ts`),
// como já acontece com `gargalos.ts`.
//
// ─── O QUE É "ATRASADA" ──────────────────────────────────────────────────────
//
// Nada é inventado aqui. O domínio do servidor já decide isso e o contrato já
// carrega a resposta em dois campos:
//
//   • `item.marcoIndex` — o índice da etapa cujo PRAZO mede aquela peça. É
//     igual a `stageIndex` no caso normal e aponta para a Aprovação de Layout
//     na peça isenta de aprovação (`items.skipApproval`) — ver `marcoIndexFor`
//     em `server/services/prazo-domain.ts`.
//   • `stages[marcoIndex].state` — "overdue" quando aquele prazo já venceu.
//     O estado é calculado no servidor e já embute as duas exceções que
//     importam: evento com data de saída inválida nunca fica "overdue" (sem
//     data confiável não há atraso confiável) e evento sem peça nenhuma
//     também não.
//
// Então: PEÇA ATRASADA = `stages[item.marcoIndex].state === "overdue"`, e os
// dias de atraso são `|stages[marcoIndex].diffDays|`. Uma peça só entra na
// lista quando o prazo que a mede venceu — é o que permite escrever "atrasada
// há 12 dias" em cada linha sem mentir.
//
// RELAÇÃO COM O PLACAR (`kpis.pecasAtrasadas`): o KPI soma `pecasEmAtraso` de
// cada evento, que é a pendência ACUMULADA da etapa vencida mais avançada —
// ou seja, conta as peças cujo marco é aquela etapa OU qualquer anterior. Com
// os prazos em ordem crescente (o caso de todo evento normal: -25, -20, -12,
// -10, -8, -1 sobre a saída) os dois conjuntos são exatamente o mesmo, e a
// lista fecha com o placar peça a peça. Se um evento tiver offsets editados
// FORA DE ORDEM, o acumulado pode contar uma peça cujo prazo próprio ainda
// não venceu; nesse caso esta lista fica MENOR que o KPI, nunca maior — e a
// tela diz isso em uma linha em vez de deixar dois números se contradizerem.
import type { PrazoEvent, PrazoPendingItem, PrazoStage } from "@shared/prazos-contract";
import { normalize, STAGE_SECTOR } from "./tokens";

/** Uma peça atrasada, já resolvida: evento, etapa, prazo, setor e destino. */
export interface PecaAtrasada {
  /** Chave de lista: o id da peça já é único, o evento entra para leitura. */
  key: string;
  eventId: string;
  eventName: string;
  eventPriority: string | null;
  /** ISO 8601 da saída do caminhão — a linha mostra o dia curto. */
  truckDepartureDate: string;
  item: PrazoPendingItem;
  /** Etapa em que a peça ESTÁ — é dela que sai "de quem é a bola". */
  stage: PrazoStage;
  /** Etapa cujo PRAZO mede a peça. Igual a `stage`, exceto na peça isenta. */
  marco: PrazoStage;
  /**
   * `true` quando o marco não é a etapa em que a peça está: a peça é isenta da
   * aprovação do patrocinador e por isso é cobrada pelo prazo da Aprovação de
   * Layout. Sem esta marca, a linha diria "Entrega de Layouts · atrasada há 6
   * dias" citando um prazo que não é o daquela etapa.
   */
  cobradaPorOutraEtapa: boolean;
  /** Dias-calendário desde o vencimento do marco (sempre ≥ 1). */
  diasAtraso: number;
  /** Setor que destrava — mesma fonte do drill (`STAGE_SECTOR`). */
  setor: string;
  /** Tela que RESOLVE a peça. Sem tela de setor, o detalhe do evento. */
  url: string;
}

/**
 * Todas as peças atrasadas do payload, das piores para as menos piores.
 *
 * Ordem: maior atraso primeiro; empate desempata por quem está parada há mais
 * tempo (a peça esquecida antes da que se mexeu ontem), depois por evento e
 * código — determinismo total, para a lista não dançar entre dois renders com
 * o mesmo dado.
 */
export function computePecasAtrasadas(events: PrazoEvent[]): PecaAtrasada[] {
  const out: PecaAtrasada[] = [];
  for (const ev of events) {
    for (const item of ev.pendingItems) {
      // `marcoIndex` pode faltar num payload de Express antigo (git pull sem
      // Stop/Run): o tipo promete o campo, o processo em execução não. Cair
      // para `stageIndex` mantém a lista de pé com a regra normal, que é a
      // que vale para todas as peças menos as isentas.
      const marcoIdx = item.marcoIndex ?? item.stageIndex;
      const marco = ev.stages[marcoIdx];
      const stage = ev.stages[item.stageIndex];
      if (!marco || !stage) continue;
      if (marco.state !== "overdue") continue;
      const alvo = STAGE_SECTOR[stage.key];
      out.push({
        key: item.id,
        eventId: ev.id,
        eventName: ev.name,
        eventPriority: ev.priority,
        truckDepartureDate: ev.truckDepartureDate,
        item,
        stage,
        marco,
        cobradaPorOutraEtapa: marcoIdx !== item.stageIndex,
        diasAtraso: Math.abs(marco.diffDays),
        setor: alvo?.sector ?? stage.label,
        // Mesmo fallback do drill: etapa sem tela própria (Lista de Imagens)
        // resolve no detalhe do evento, que é onde a peça nasce.
        url: alvo?.url ?? `/eventos/${ev.id}`,
      });
    }
  }
  return out.sort((a, b) =>
    b.diasAtraso - a.diasAtraso
    || b.item.waitingDays - a.item.waitingDays
    || a.eventName.localeCompare(b.eventName, "pt-BR")
    || a.item.displayId.localeCompare(b.item.displayId, "pt-BR"));
}

/**
 * Filtros que a lista aplica POR PEÇA.
 *
 * Os RECORTES de evento (só com atraso, saídas em 7 dias, sem peças, data
 * inválida) já foram aplicados antes, sobre a lista de eventos — é a mesma
 * peneira das outras duas visões, e nenhum deles tem leitura por peça. O que
 * mora aqui são as quatro dimensões que a linha-peça sabe responder sozinha:
 *
 *  • ETAPA — no quadro e na tabela filtra o EVENTO pela etapa em que o funil
 *    dele está travado; aqui filtra a PEÇA pela etapa em que ela está. É a
 *    mesma pergunta feita no grão certo: quem clica em "Arte" na faixa de
 *    diagnóstico quer as peças que estão na mesa da Arte.
 *  • DIA — mesma coisa: o prazo que mede aquela peça vence naquele dia.
 *  • EVENTO e PRIORIDADE — são atributos do evento, e filtrar a lista de
 *    eventos ANTES daria exatamente o mesmo resultado (`p.eventId` e
 *    `p.eventPriority` são cópias do evento de origem). Vieram para cá por
 *    causa da CONTAGEM: `contarPecasAtrasadas` precisa recontar cada dimensão
 *    com ela mesma neutralizada, e isso só é possível quando as quatro passam
 *    pela mesma peneira. Duas peneiras equivalentes em lugares diferentes é
 *    como nascem dois critérios que discordam.
 *
 * BUSCA: nas outras visões procura só no nome do evento, porque a linha é o
 * evento. Aqui a linha é a peça, então o código, o tipo e a descrição também
 * entram — procurar "3521" numa lista de peças e não achar a peça 3521 seria
 * o tipo de silêncio que faz o diretor desconfiar da tela inteira.
 */
export interface FiltroPecasAtrasadas {
  busca?: string;
  /** Id do evento ou "all". */
  eventoId?: string;
  /** Chave da etapa ou "all". */
  etapaKey?: string;
  /** Prioridade do EVENTO da peça, ou "all". */
  prioridade?: string;
  /** "YYYY-MM-DD" ou "" — o prazo que mede a peça vence neste dia. */
  dia?: string;
}

export function filtrarPecasAtrasadas(
  lista: PecaAtrasada[],
  { busca = "", eventoId = "all", etapaKey = "all", prioridade = "all", dia = "" }: FiltroPecasAtrasadas,
): PecaAtrasada[] {
  const q = normalize(busca.trim());
  return lista.filter((p) => {
    if (eventoId !== "all" && p.eventId !== eventoId) return false;
    if (etapaKey !== "all" && p.stage.key !== etapaKey) return false;
    if (prioridade !== "all" && p.eventPriority !== prioridade) return false;
    if (dia && p.marco.deadline !== dia) return false;
    if (q) {
      const alvo = normalize(
        `${p.item.displayId} ${p.item.type} ${p.item.description ?? ""} ${p.eventName}`);
      if (!alvo.includes(q)) return false;
    }
    return true;
  });
}

/** Quantas peças por chave. Peça sem a chave (prioridade nula) não conta. */
function agrupar(
  lista: PecaAtrasada[],
  chave: (p: PecaAtrasada) => string | null | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of lista) {
    const k = chave(p);
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** Contagem por opção de cada filtro — o número que vai ao lado do rótulo. */
export interface ContagensPecasAtrasadas {
  /** eventId → peças atrasadas. */
  porEvento: Map<string, number>;
  /** chave da etapa em que a peça ESTÁ → peças. */
  porEtapa: Map<string, number>;
  /** prioridade do evento → peças. */
  porPrioridade: Map<string, number>;
  /** dia do prazo que mede a peça ("YYYY-MM-DD") → peças. */
  porDia: Map<string, number>;
}

/**
 * As contagens que cada filtro mostra ao lado das suas opções.
 *
 * A regra que faz o número ser útil: cada dimensão é contada com ELA MESMA
 * neutralizada e com todas as outras aplicadas. Contar tudo sobre a lista já
 * filtrada faria o menu de eventos, com um evento escolhido, exibir aquele
 * evento com o total e TODOS os outros com zero — um menu que só sabe dizer o
 * que já está na tela. Contar sobre a lista sem filtro nenhum seria o oposto:
 * o número prometeria 30 peças e o clique entregaria 4, porque a busca e a
 * etapa continuam ligadas. Com a própria dimensão de fora, "COPA A (12)" é a
 * promessa exata do que aparece ao clicar.
 */
export function contarPecasAtrasadas(
  lista: PecaAtrasada[],
  filtro: FiltroPecasAtrasadas,
): ContagensPecasAtrasadas {
  return {
    porEvento: agrupar(filtrarPecasAtrasadas(lista, { ...filtro, eventoId: "all" }), (p) => p.eventId),
    porEtapa: agrupar(filtrarPecasAtrasadas(lista, { ...filtro, etapaKey: "all" }), (p) => p.stage.key),
    porPrioridade: agrupar(filtrarPecasAtrasadas(lista, { ...filtro, prioridade: "all" }), (p) => p.eventPriority),
    porDia: agrupar(filtrarPecasAtrasadas(lista, { ...filtro, dia: "" }), (p) => p.marco.deadline),
  };
}
