// ─── As queries do Painel Geral ─────────────────────────────────────────────
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, Sponsor, StandardItem } from "@shared/schema";
import { ehBookCompleto } from "@shared/fluxo-peca";
import { LISTA_VAZIA } from "./regras";
import type { EventoDaPeca, PecaDoPainel, RegistroDeAuditoria } from "./tipos";

export function usePainelDados({ selectedItemId, showDeleted, canDeleteAny, eventFilter }: {
  /** A peça aberta na ficha — o histórico dela é buscado sob demanda. */
  selectedItemId: string | undefined;
  showDeleted: boolean;
  canDeleteAny: boolean;
  eventFilter: string[];
}) {
  // ── Frescor do dado ───────────────────────────────────────────────────────
  // O queryClient roda com staleTime Infinity e sem refetch: a ÚNICA fonte de
  // atualização era o WebSocket. Socket caído = painel congelado por tempo
  // indeterminado, enquanto o subtítulo prometia "tempo real". Aqui a query
  // desta tela sobrescreve o padrão: fica velha em 30s, revalida sozinha a cada
  // 60s e ao voltar o foco da aba. Sem botão "Atualizar" (decisão do dono): a
  // tela se atualiza sozinha e o carimbo diz desde quando o que se lê é verdade.
  //
  // PERF-4: `isFetching` e `dataUpdatedAt` NÃO são lidos aqui — quem os lê é o
  // <CarimboDeFrescor>. O React Query só re-renderiza o componente que lê a
  // propriedade; lidos aqui, cada revalidação re-renderizava a página duas
  // vezes mesmo quando o servidor devolvia o mesmo acervo.
  const {
    data: itensDoServidor = LISTA_VAZIA, isLoading, isError, refetch,
  } = useQuery<PecaDoPainel[]>({
    queryKey: ["/api/items"],
    staleTime: 30_000,
    refetchInterval: 300_000, // 5min: o WebSocket cobre o tempo real; isto é só a rede de segurança de socket morto
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  // BOOK COMPLETO fica de fora: é o trâmite do Atendimento, não uma peça (ver shared/fluxo-peca).
  const items = useMemo(() => itensDoServidor.filter((i) => !ehBookCompleto(i)), [itensDoServidor]);
  const { data: sponsors = LISTA_VAZIA }      = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], placeholderData: LISTA_VAZIA });
  const { data: standardItems = LISTA_VAZIA } = useQuery<StandardItem[]>({ queryKey: ["/api/standard-items"], placeholderData: LISTA_VAZIA });

  // Audit log SÓ da peça aberta no modal, buscado sob demanda. Antes a página
  // baixava /api/audit-logs INTEIRO no load (tabela que só cresce — em 1 ano,
  // megabytes por visita) apenas para alimentar o ItemDetailsDialog. O modal
  // filtra por entityId internamente, então receber o subconjunto é compatível.
  const { data: auditLogs = [] } = useQuery<unknown, Error, RegistroDeAuditoria[]>({
    queryKey: ["/api/audit-logs", "item", selectedItemId],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItemId!}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    // Resposta inesperada (HTML de erro, objeto) não pode chegar ao modal
    // como "array" — normaliza para lista vazia.
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItemId,
    placeholderData: LISTA_VAZIA,
  });

  const {
    // LISTA_VAZIA e não `[]`: com a query desligada (o normal — sem a visão
    // Excluídos), `= []` criava um array novo a CADA render, e como ele é
    // dependência do useMemo do recorte, a filtragem/ordenação/agrupamento
    // das 5.000 peças era refeita a cada clique na tela (abrir um menu, abrir
    // a ficha, o relógio do carimbo). Era o gargalo nº 1 medido na PERF-4.
    data: deletedItems = LISTA_VAZIA,
    isLoading: deletedLoading,
    isError: deletedError,
    refetch: refetchDeleted,
  } = useQuery<PecaDoPainel[]>({
    queryKey: ["/api/items/deleted"],
    enabled: showDeleted && canDeleteAny,
  });

  // ── /api/events só quando faz falta (PERF-4) ─────────────────────────────
  // Esta tela usava a lista de eventos (826 KB em produção, baixada duas vezes
  // na abertura) só para NOME e PRIORIDADE de um id — e toda peça de
  // /api/items já traz o evento dela embutido (`item.event`, o registro cru do
  // enrich do servidor, re-costurado a cada delta). O mapa sai daí. A lista
  // completa só é pedida no caso em que as peças não respondem: um link com
  // ?evento= de um evento sem nenhuma peça aqui, para o chip do filtro dizer o
  // nome e não o id.
  const eventoDasPecas = useMemo(() => {
    const m = new Map<string, EventoDaPeca>();
    for (const lista of [items, deletedItems]) {
      for (const i of lista) if (i.eventId && i.event && !m.has(i.eventId)) m.set(i.eventId, i.event);
    }
    return m;
  }, [items, deletedItems]);
  const faltaNomeDeEvento = !isLoading && eventFilter.some((id) => !eventoDasPecas.has(id));
  const { data: events = LISTA_VAZIA as Event[] } = useQuery<Event[]>({
    queryKey: ["/api/events"], staleTime: 30_000, refetchOnWindowFocus: true, enabled: faltaNomeDeEvento,
  });
  const nomeDoEvento = (id: string): string | undefined =>
    eventoDasPecas.get(id)?.name ?? events.find((e) => e.id === id)?.name;

  return {
    itensDoServidor, items, isLoading, isError, refetch, sponsors, standardItems, auditLogs,
    deletedItems, deletedLoading, deletedError, refetchDeleted, eventoDasPecas, nomeDoEvento,
  };
}
