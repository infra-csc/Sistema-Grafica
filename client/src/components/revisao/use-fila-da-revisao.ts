// ─────────────────────────────────────────────────────────────────────────────
// A FILA DA REVISÃO FINAL: as leituras da API e tudo o que se deriva delas —
// a lista recortada, as facetas, as contagens dos chips, os blocos por evento
// e a separação do lote. O estado dos filtros e da seleção mora na página (a
// URL e os diálogos também mexem nele); este hook só lê.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizarBusca } from "@/lib/utils";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { arquivoFinalOk, ehMolde } from "@shared/molde";
import { pecaTravada } from "@shared/trava-da-peca";
import { seloPecaEventoFinalizado, todayBusinessMs } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { aguardandoEstoque, estoqueRespondeu } from "@/components/consulta-de-estoque/na-revisao";
import type { EstoqueDaLinha } from "@/components/consulta-de-estoque/na-revisao";
import { SOLICITACAO_AO_ESTOQUE_ATIVA, propostaDaLiberacao } from "@shared/consultas-de-estoque";
import { CHAVE_DA_REVISAO, REVIEW_STATUS, prontaParaLiberar, reaproveitamentoTotal } from "./regras";
import type { EventoDaApi, EventoDaPeca, FiltroDoEstoque, ItemPadrao, OpcaoDeFaceta, PecaDaRevisao, RegistroDoHistorico } from "./tipos";

/** A dimensão que cada faceta exclui do próprio pool (ver `casaRecorte`). */
type DimensaoDoRecorte = 'evento' | 'tipo' | 'sem-arquivo' | 'evento-finalizado' | 'estoque';

export interface EntradaDaFila {
  user: { role?: string | null; kit?: boolean | null } | null | undefined;
  searchTerm: string;
  eventFilter: string[];
  itemTypeFilter: string[];
  soSemArquivo: boolean;
  soEventoFinalizado: boolean;
  filtroEstoque: FiltroDoEstoque;
  estoquePorPeca: Map<string, EstoqueDaLinha>;
  selectedItemIds: Set<string>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  selectedItem: PecaDaRevisao | null;
  modalOpen: boolean;
}

export function useFilaDaRevisao({
  user, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, filtroEstoque,
  estoquePorPeca, selectedItemIds, setSelectedItemIds, selectedItem, modalOpen,
}: EntradaDaFila) {
  const { data: itensDoServidor = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<PecaDaRevisao[]>({ queryKey: CHAVE_DA_REVISAO });
  // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
  const items = useMemo(() => itensDoServidor.filter((i) => !ehBookCompleto(i)), [itensDoServidor]);
  const { data: events = [], isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery<EventoDaApi[]>({ queryKey: ["/api/events"] });
  // Histórico da peça: só busca com o modal aberto, já filtrado e limitado no
  // servidor. A chave em duas partes ("/api/audit-logs" + querystring) mantém
  // o prefixo casando com as invalidateQueries(["/api/audit-logs"]) das
  // mutations (o queryFn junta as partes com "/").
  const { data: itemAuditLogs = [], isLoading: historicoCarregando } = useQuery<RegistroDoHistorico[]>({
    queryKey: ["/api/audit-logs", `?entityId=${selectedItem?.id}&limit=8`],
    enabled: modalOpen && !!selectedItem?.id,
  });
  const { data: standardItems = [] } = useQuery<ItemPadrao[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    standardItems.forEach((s) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // ── Evento FINALIZADO CONTINUA NESTA FILA ─────────────────────────────────
  // Regra do dono: "os eventos finalizados devem aparecer ainda na Revisão e
  // Gráfica". Esta tela não filtra as peças de evento encerrado ou realizado.
  //
  // POR QUE AQUI FICA E EM ARTE/ATENDIMENTO/VINCULAR CONTINUA ESCONDIDO: a
  // guarda do servidor (server/routes/eventoFinalizado.ts) barra o que faz o
  // trabalho ANDAR e permite o que ARRUMA A CASA; das exceções que ela abriu,
  // CONFERIR e REGISTRAR ENTREGA são da Gráfica e EXCLUIR PEÇA é daqui.
  // Esconder a peça tornaria impossível executar o que o servidor autoriza. E
  // a Revisão é onde se vê o que ficou por revisar: um pendente que some não
  // vira resolvido — vira invisível.
  //
  // A CONTRAPARTIDA, obrigatória: aqui quase TUDO é barrado. Liberar, devolver,
  // reaproveitar, mexer na quantidade e salvar observação passam todos pela
  // guarda. Por isso o selo na linha — e por isso o lote separa peça viva de
  // peça morta (ver `selecaoLote`) em vez de mandar tudo e colher erro.
  //
  // `item.event` vem CRU do storage: traz `status` ("closed") e `startDate`.
  const hojeBusinessMs = todayBusinessMs();
  const pendingItems = useMemo(
    // KIT: a Solicitação da Arena não revisa peça do Kit — ela nem aparece
    // aqui. O usuário do Kit só recebe as do Kit; o admin vê tudo.
    () => items.filter(item => item.status === REVIEW_STATUS
      && !(user?.role === "solicitacao" && !user?.kit && item.kitRemessaId)),
    [items, user?.role, user?.kit],
  );

  // Um selo por peça, calculado uma vez. Sem entrada = evento em jogo, linha normal.
  const selosPorItem = useMemo(() => {
    const m = new Map<string, SeloPecaEventoFinalizado>();
    for (const item of pendingItems) {
      const s = seloPecaEventoFinalizado(item.event, hojeBusinessMs);
      if (s) m.set(item.id, s);
    }
    return m;
  }, [pendingItems, hojeBusinessMs]);
  const seloDoItem = (item: PecaDaRevisao | null | undefined): SeloPecaEventoFinalizado | null =>
    (item ? selosPorItem.get(item.id) : undefined) ?? null;

  // ── O RECORTE, UMA FUNÇÃO SÓ ──────────────────────────────────────────────
  // A INVARIANTE, e é ela que alguém quebra sem perceber ao acrescentar um
  // filtro: FACETA E LISTA SAEM DO MESMO POOL. A lista chama isto sem
  // `excluir`; cada dropdown chama com a PRÓPRIA dimensão excluída, sobre o
  // mesmo `pendingItems`. Assim o pool da faceta é, por construção, um
  // superconjunto da lista que difere só naquele filtro — a faceta nunca
  // oferece menos do que a tela mostra nem mais do que ela entrega.
  //
  // A BUSCA também recorta as facetas: sem isso, digitar "banner" encolhia a
  // lista e os dropdowns continuavam prometendo o número de antes.
  //
  // Busca sem acento (`normalizarBusca`): "so quero" acha "SÓ QUERO PEDALAR SP".
  const casaRecorte = (item: PecaDaRevisao, excluir?: DimensaoDoRecorte): boolean => {
    const q = normalizarBusca(searchTerm);
    if (q &&
        !normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.description).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.event?.name).includes(q)) return false;
    if (excluir !== 'evento' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
    if (excluir !== 'tipo' && itemTypeFilter.length > 0 && !itemTypeFilter.includes(item.type)) return false;
    if (excluir !== 'sem-arquivo' && soSemArquivo && arquivoFinalOk(item)) return false;
    if (excluir !== 'evento-finalizado' && soEventoFinalizado && !selosPorItem.has(item.id)) return false;
    if (excluir !== 'estoque' && filtroEstoque === "aguardando" && !aguardandoEstoque(estoquePorPeca.get(item.id))) return false;
    if (excluir !== 'estoque' && filtroEstoque === "respondeu" && !estoqueRespondeu(estoquePorPeca.get(item.id))) return false;
    return true;
  };

  const filteredItems = useMemo(() => pendingItems.filter(item => casaRecorte(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, selosPorItem, filtroEstoque, estoquePorPeca]);

  // "Aguardando estoque (N)" e "Estoque respondeu (N)" — mesma disciplina dos
  // outros chips: a contagem sai do pool com a PRÓPRIA dimensão excluída.
  const contagemDoEstoque = useMemo(() => {
    const pool = pendingItems.filter(i => casaRecorte(i, 'estoque'));
    return {
      aguardando: pool.filter(i => aguardandoEstoque(estoquePorPeca.get(i.id))).length,
      respondeu: pool.filter(i => estoqueRespondeu(estoquePorPeca.get(i.id))).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, soEventoFinalizado, selosPorItem, estoquePorPeca]);

  // ── OS DOIS CHIPS DE FACETA ─────────────────────────────────────────────
  // A contagem sai do pool com a PRÓPRIA dimensão excluída, então o número ao
  // lado do chip é exatamente o número de linhas que o clique entrega. Contar
  // sobre `filteredItems` faria o chip ligado mostrar a contagem de si mesmo e
  // o desligado mostrar zero.
  const contagemSemArquivo = useMemo(
    () => pendingItems.filter(i => casaRecorte(i, 'sem-arquivo') && !arquivoFinalOk(i)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soEventoFinalizado, selosPorItem],
  );
  const contagemEventoFinalizado = useMemo(
    () => pendingItems.filter(i => casaRecorte(i, 'evento-finalizado') && selosPorItem.has(i.id)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingItems, searchTerm, eventFilter, itemTypeFilter, soSemArquivo, selosPorItem],
  );

  // ── A FRASE DE RESOLUÇÃO ────────────────────────────────────────────────
  // No lugar da descrição fixa da tela, o que muda a cada visita: quantas dá
  // para decidir AGORA, e quantas ainda dependem da Arte.
  const fraseDeResolucao = useMemo(() => {
    const total = pendingItems.length;
    if (total === 0) return "Nenhuma peça aguardando revisão.";
    const semArquivo = pendingItems.filter(i => !arquivoFinalOk(i)).length;
    const prontas = total - semArquivo;
    if (semArquivo === 0) {
      return `${total === 1 ? "A única peça tem" : `Todas as ${total} peças têm`} arquivo final — é só decidir.`;
    }
    if (prontas === 0) {
      return `${semArquivo === 1 ? "A única peça ainda espera" : `As ${semArquivo} peças ainda esperam`} o arquivo final da Arte.`;
    }
    return `${prontas} ${prontas === 1 ? "peça está pronta" : "peças estão prontas"} para decidir; `
         + `${semArquivo} ainda ${semArquivo === 1 ? "espera" : "esperam"} o arquivo final da Arte.`;
  }, [pendingItems]);

  // Seleção sobrevive ao filtro: quando a lista filtrada muda, mantém marcado
  // só o que continua visível — senão "Liberar" agiria sobre peças que a
  // pessoa não está mais vendo.
  useEffect(() => {
    setSelectedItemIds(prev => {
      const visible = new Set(filteredItems.map((i) => i.id));
      if (Array.from(prev).every(id => visible.has(id))) return prev;
      return new Set(Array.from(prev).filter(id => visible.has(id)));
    });
  }, [filteredItems]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtros facetados: mesmo `casaRecorte` da lista, só com a própria dimensão
  // excluída. Peça de evento finalizado entra aqui como qualquer outra — ela
  // está na lista, então o evento dela tem de estar no menu.
  const eventFilterOptions = useMemo(() => {
    // Sem dotColor: o EventFilterDropdown em modo múltiplo (o desta tela) não
    // renderiza bolinha.
    const byId = new Map(events.map((e) => [e.id, e]));
    const map = new Map<string, OpcaoDeFaceta>();
    pendingItems
      .filter(i => casaRecorte(i, 'evento'))
      .forEach((i) => {
        if (!i.eventId) return;
        const cur = map.get(i.eventId);
        if (cur) cur.count++;
        else {
          const ev = byId.get(i.eventId);
          map.set(i.eventId, { value: i.eventId, label: ev?.name || i.event?.name || 'Sem evento', count: 1 });
        }
      });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, itemTypeFilter, events]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, OpcaoDeFaceta>();
    pendingItems
      .filter(i => casaRecorte(i, 'tipo'))
      .forEach((i) => {
        if (!i.type) return;
        const cur = map.get(i.type);
        if (cur) cur.count++;
        else map.set(i.type, { value: i.type, label: i.type, count: 1 });
      });
    return Array.from(map.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItems, searchTerm, eventFilter]);

  const itemsByEvent = useMemo(() => {
    const map = new Map<string, PecaDaRevisao[]>();
    // Dentro do evento: grupo do item padrão, depois tipo.
    const sorted = [...filteredItems].sort((a, b) => {
      // ESTOQUE RESPONDEU sobe: a resposta existe para a Revisão Final agir —
      // no meio de dezenas de peças ela passava batido.
      if (SOLICITACAO_AO_ESTOQUE_ATIVA) {
        const ra = estoqueRespondeu(estoquePorPeca.get(a.id)) ? 0 : 1, rb = estoqueRespondeu(estoquePorPeca.get(b.id)) ? 0 : 1;
        if (ra !== rb) return ra - rb;
      }
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      // type pode vir null do banco — sem o fallback o localeCompare lançava.
      return ga.localeCompare(gb) || (a.type || '').localeCompare(b.type || '');
    });
    sorted.forEach(item => {
      // KIT: as peças de uma remessa formam bloco próprio, com as datas do Kit
      // no cabeçalho (ver getEventInfo).
      const key = item.kitRemessaId ? `${item.eventId}#kit-${item.kitRemessaId}` : (item.eventId || "__none__");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    // Grupos na ordem da urgência real: saída do caminhão ascendente (quem
    // sai primeiro aparece primeiro), sem data por último, nome desempata.
    // O Kit vem sempre em cima.
    const byId = new Map<string, EventoDaPeca>(events.map((e) => [e.id, e]));
    for (const [key, lista] of Array.from(map.entries())) {
      if (key.includes("#kit-") && lista[0]?.event) byId.set(key, lista[0].event);
    }
    const entries = Array.from(map.entries()).sort(([idA], [idB]) => {
      const kitA = idA.includes("#kit-"), kitB = idB.includes("#kit-");
      if (kitA !== kitB) return kitA ? -1 : 1;
      const ea = byId.get(idA), eb = byId.get(idB);
      const ta = ea?.truckDepartureDate ? new Date(ea.truckDepartureDate).getTime() : Infinity;
      const tb = eb?.truckDepartureDate ? new Date(eb.truckDepartureDate).getTime() : Infinity;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (ea?.name || "").localeCompare(eb?.name || "");
    });
    return new Map(entries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredItems, typeToGroup, events]);

  // ── LOTE MISTO: a tela conta a história que o servidor conta ──────────────
  // As ações em lote são barradas em evento finalizado, e o servidor já sabe
  // lidar com mistura:
  //   · PATCH /api/items/bulk-return-to-arte roda item a item — o barrado entra
  //     na lista de `errors`, os outros passam. 409 do lote inteiro só quando
  //     NADA passou e tudo caiu por esta regra (`contadorDeBloqueio` em
  //     server/routes/eventoFinalizado.ts).
  //   · "Liberar" não tem rota de lote: são N chamadas individuais de
  //     creator-review, cada peça de evento acabado devolvendo o seu 409.
  //
  // A tela NÃO manda o que já se sabe que vai voltar: a seleção é SEPARADA em
  // duas — `vivas` seguem, `finalizadas` ficam — e o diálogo de confirmação
  // diz as duas metades ANTES do clique, com o motivo. Só quando a seleção
  // inteira é de evento acabado o botão desabilita, que é o espelho exato do
  // 409 de lote inteiro do servidor.
  const selecaoLote = useMemo(() => {
    const ids = Array.from(selectedItemIds);
    const vivas: string[] = [];
    let encerrado = 0, realizado = 0;
    for (const id of ids) {
      const motivo = selosPorItem.get(id)?.motivo;
      if (motivo === "encerrado") encerrado++;
      else if (motivo === "realizado") realizado++;
      else vivas.push(id);
    }
    return { ids, vivas, encerrado, realizado, finalizadas: encerrado + realizado };
  }, [selectedItemIds, selosPorItem]);

  // As peças vivas da seleção (fora as de evento finalizado).
  const itensDoLoteVivo = selecaoLote.vivas.map(id => pendingItems.find((i) => i.id === id));
  // O LOTE leva a sugestão do estoque: peça com resposta entra com o que a
  // Gráfica atendeu — o servidor aplica na liberação de cada uma.
  const propostasDoLote = itensDoLoteVivo
    .filter((it): it is PecaDaRevisao => !!it && !it.isReuse && estoqueRespondeu(estoquePorPeca.get(it.id)))
    .map((it) => propostaDaLiberacao(Number(it.quantity) || 0, estoquePorPeca.get(it.id)!));
  const reaproveitadasNoLote = itensDoLoteVivo.filter((it) => reaproveitamentoTotal(it)).length;
  // O LOTE DE LIBERAR leva só as PRONTAS. Sem arquivo final o servidor
  // recusa; travada pede a escolha "destravar ou manter", que é da ficha.
  // As de fora ficam marcadas com o motivo na linha, sem ir e voltar.
  const loteDeLiberar = useMemo(() => {
    const prontas: string[] = [];
    const deFora: Record<string, string> = {};
    let nTravadas = 0, nSemArquivo = 0;
    for (const id of selecaoLote.vivas) {
      const it = pendingItems.find((i) => i.id === id);
      if (!it) continue;
      if (pecaTravada(it)) { nTravadas++; deFora[id] = "Travada — libere pela ficha, escolhendo destravar ou manter a trava."; }
      else if (!prontaParaLiberar(it)) { nSemArquivo++; deFora[id] = "Sem arquivo final da Arte — fica para depois."; }
      else prontas.push(id);
    }
    return { prontas, deFora, nFora: nTravadas + nSemArquivo, nTravadas, nSemArquivo };
  }, [selecaoLote, pendingItems]);
  // Moldes no lote de devolver: voltam sempre para o começo da Arte (com o
  // thumb), qualquer que seja o destino escolhido.
  const moldesNoLote = itensDoLoteVivo.filter((it) => ehMolde(it)).length;
  const loteSoDeMoldes = moldesNoLote > 0 && moldesNoLote === selecaoLote.vivas.length;

  /** A frase do "ficam de fora" — uma só, para os diálogos de lote. */
  const avisoLoteFinalizadas = (): string | null => {
    const { finalizadas, encerrado, realizado } = selecaoLote;
    if (finalizadas <= 0) return null;
    const partes: string[] = [];
    if (encerrado > 0) partes.push(`${encerrado} em evento encerrado por um administrador`);
    if (realizado > 0) partes.push(`${realizado} em evento cuja data já passou`);
    return `${finalizadas} ${finalizadas === 1 ? "peça fica" : "peças ficam"} de fora`
      + ` (${partes.join(" e ")}): em evento finalizado, nenhuma ação que faça o trabalho andar é aceita.`;
  };

  // Bloco do Kit ("<evento>#kit-<remessa>"): o evento da peça já vem com as
  // datas do Kit (servidor); o nome ganha "· KIT".
  const getEventInfo = (eventId: string): EventoDaPeca | undefined => {
    if (eventId.includes("#kit-")) {
      const peca = filteredItems.find((i) => `${i.eventId}#kit-${i.kitRemessaId}` === eventId);
      return peca?.event ? { ...peca.event, name: `${peca.event.name} · KIT` } : undefined;
    }
    return events.find(e => e.id === eventId);
  };

  return {
    itensDoServidor, items, itemsLoading, itemsError, refetchItems,
    events, eventsLoading, eventsError, refetchEvents,
    itemAuditLogs, historicoCarregando, typeToGroup,
    hojeBusinessMs, pendingItems, selosPorItem, seloDoItem,
    filteredItems, contagemDoEstoque, contagemSemArquivo, contagemEventoFinalizado, fraseDeResolucao,
    eventFilterOptions, typeFilterOptions, itemsByEvent,
    selecaoLote, propostasDoLote, reaproveitadasNoLote, loteDeLiberar, moldesNoLote, loteSoDeMoldes,
    avisoLoteFinalizadas, getEventInfo,
  };
}
