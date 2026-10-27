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
//     igual a `stageIndex` no caso normal; difere na peça do Kit e na peça sem
//     aprovação em Lista de Imagens — ver `marcoIndexFor` em
//     `server/services/prazo-domain.ts`.
//   • `item.prazo` (26/10) — o prazo DA PEÇA naquele marco: o do evento, ou o
//     prazo de Layout AJUSTADO na peça "Sem patrocínio" / "Arte do cliente"
//     ainda em Layout (Layout + dias da Aprovação — @shared/prazo-sem-aprovacao).
//   • `stages[marcoIndex].state` — "overdue" quando algum prazo das peças do
//     gate venceu. Já embute as duas exceções: evento com data de saída
//     inválida nunca fica "overdue" e evento sem peça nenhuma também não.
//
// Então: PEÇA ATRASADA = marco "overdue" E `item.prazo` antes de hoje (a peça
// sem aprovação pode estar no gate de um marco vencido pela peça comum ao lado
// sem estar atrasada ela mesma); os dias de atraso contam do `item.prazo`.
// Uma peça só entra na lista quando o prazo que a mede venceu — é o que permite
// escrever "atrasada há 12 dias" em cada linha sem mentir.
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
import { normalize, STAGE_SECTOR, urlPecaNoEvento, urlSetorDaPeca } from "./tokens";
import { contarPorMarca, itemPassaNaMarca, type FiltroDeMarcaPrazos } from "./sem-aprovacao";

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
  /** Etapa cujo PRAZO mede a peça. Igual a `stage`, exceto no Kit e na peça sem aprovação em Lista de Imagens. */
  marco: PrazoStage;
  /**
   * `true` quando o prazo que mede a peça não é o da etapa em que ela está: a
   * peça do Kit (cobrada pela Aprovação) ou a peça sem aprovação (cobrada pelo
   * Layout ajustado). Sem esta marca, a linha diria "Entrega de Layouts ·
   * atrasada há 6 dias" citando um prazo que não é o daquela etapa.
   */
  cobradaPorOutraEtapa: boolean;
  /** O prazo que mede a peça ("YYYY-MM-DD") — o do marco ou o Layout ajustado. */
  prazo: string;
  /** O prazo veio da regra das peças sem aprovação (Layout ajustado). */
  prazoAjustado: boolean;
  /** Dias-calendário desde o vencimento do marco (sempre ≥ 1). */
  diasAtraso: number;
  /** Setor que destrava — mesma fonte do drill (`STAGE_SECTOR`). */
  setor: string;
  /**
   * Tela que RESOLVE a peça, já apontada NA PEÇA — não na fila do setor.
   * Montada por `urlSetorDaPeca`; ver o contrato de parâmetro em `tokens.ts`.
   */
  url: string;
  /** A ficha da peça aberta dentro do evento (`/eventos/:id?item=`). */
  urlPeca: string;
}

/**
 * Todas as peças atrasadas do payload, das piores para as menos piores.
 *
 * Ordem: maior atraso primeiro; empate desempata por quem está parada há mais
 * tempo (a peça esquecida antes da que se mexeu ontem), depois por evento e
 * código — determinismo total, para a lista não dançar entre dois renders com
 * o mesmo dado.
 */
/** Dias de `b` até `a` ("YYYY-MM-DD"). */
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

/**
 * O "hoje" do servidor, reconstituído do marco (`prazoEfetivo` − `diffDays`):
 * a lista não lê o relógio do navegador para decidir regra (ver o contrato).
 */
function hojeDoPayload(s: PrazoStage): string {
  const base = s.prazoEfetivo ?? s.deadline;
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - s.diffDays);
  return d.toISOString().slice(0, 10);
}

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
      // O prazo DA PEÇA (26/10). `prazo` e `prazoEfetivo` podem faltar num
      // payload de Express antigo: cai no prazo do marco, a regra de antes.
      const prazo = item.prazo ?? marco.deadline;
      const hoje = hojeDoPayload(marco);
      if (!(prazo < hoje)) continue;
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
        cobradaPorOutraEtapa: marcoIdx !== item.stageIndex || prazo !== marco.deadline,
        prazo,
        prazoAjustado: prazo !== marco.deadline,
        diasAtraso: diasEntre(hoje, prazo),
        setor: alvo?.sector ?? stage.label,
        // Toda peça desta lista está atrasada por definição (o `continue`
        // acima), então o recorte de atrasados do destino pode ir ligado.
        url: urlSetorDaPeca(stage.key, {
          eventId: ev.id,
          itemId: item.id,
          displayId: item.displayId,
          status: item.status,
          atrasada: true,
        }),
        urlPeca: urlPecaNoEvento(ev.eventId ?? ev.id, item.id),
      });
    }
  }
  return out.sort((a, b) =>
    b.diasAtraso - a.diasAtraso
    || (b.item.waitingDays ?? -1) - (a.item.waitingDays ?? -1)
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
  /**
   * As marcas da peça (RF11, Pedro/dono 26/10): "Sem patrocínio", "Arte do
   * cliente", "Aguardando arte do cliente", "Atraso do cliente" — ou "all".
   */
  marca?: FiltroDeMarcaPrazos;
}

/**
 * Texto de busca JÁ NORMALIZADO de cada peça, calculado uma vez por objeto.
 *
 * `normalize` (minúsculas + NFD + remoção de acento) é a parte cara da busca,
 * e ela rodava para CADA peça em CADA passada: a lista filtrada e as quatro
 * contagens dos menus são cinco passadas por tecla — milhares de NFD por
 * tecla com o volume de produção. `PecaAtrasada` é imutável depois de criada
 * por `computePecasAtrasadas` (um objeto novo a cada payload novo), então a
 * identidade do objeto é chave segura, e a `WeakMap` libera a entrada junto
 * com a lista antiga.
 */
const textoDeBusca = new WeakMap<PecaAtrasada, string>();
function alvoDaBusca(p: PecaAtrasada): string {
  let alvo = textoDeBusca.get(p);
  if (alvo === undefined) {
    alvo = normalize(`${p.item.displayId} ${p.item.type} ${p.item.description ?? ""} ${p.eventName}`);
    textoDeBusca.set(p, alvo);
  }
  return alvo;
}

export function filtrarPecasAtrasadas(
  lista: PecaAtrasada[],
  { busca = "", eventoId = "all", etapaKey = "all", prioridade = "all", dia = "", marca = "all" }: FiltroPecasAtrasadas,
): PecaAtrasada[] {
  const q = normalize(busca.trim());
  return lista.filter((p) => {
    if (eventoId !== "all" && p.eventId !== eventoId) return false;
    if (etapaKey !== "all" && p.stage.key !== etapaKey) return false;
    if (prioridade !== "all" && p.eventPriority !== prioridade) return false;
    if (dia && p.prazo !== dia) return false;
    if (marca !== "all" && !itemPassaNaMarca(p.item, marca)) return false;
    if (q && !alvoDaBusca(p).includes(q)) return false;
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
  /** marca da peça → peças (as opções se sobrepõem: "Sem aprovação" contém as outras). */
  porMarca: Map<FiltroDeMarcaPrazos, number>;
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
  // A busca nunca é neutralizada (ela entra em TODAS as contagens), então
  // aplicá-la uma vez antes das quatro passadas dá exatamente o mesmo número
  // — e a lista que as quatro percorrem encolhe para o que a busca deixou.
  const base = filtro.busca?.trim() ? filtrarPecasAtrasadas(lista, { busca: filtro.busca }) : lista;
  const semBusca = { ...filtro, busca: "" };
  return {
    porEvento: agrupar(filtrarPecasAtrasadas(base, { ...semBusca, eventoId: "all" }), (p) => p.eventId),
    porEtapa: agrupar(filtrarPecasAtrasadas(base, { ...semBusca, etapaKey: "all" }), (p) => p.stage.key),
    porPrioridade: agrupar(filtrarPecasAtrasadas(base, { ...semBusca, prioridade: "all" }), (p) => p.eventPriority),
    porDia: agrupar(filtrarPecasAtrasadas(base, { ...semBusca, dia: "" }), (p) => p.prazo),
    porMarca: contarPorMarca(filtrarPecasAtrasadas(base, { ...semBusca, marca: "all" }), (p) => p.item),
  };
}
