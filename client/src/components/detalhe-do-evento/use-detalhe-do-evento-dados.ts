// ─────────────────────────────────────────────────────────────────────────────
// AS LEITURAS DO DETALHE DO EVENTO — cada query com a MESMA chave, o mesmo
// `enabled` e o mesmo cache de antes; só saíram da página para ela caber numa
// leitura. As que dependem de estado da tela (diálogo aberto, peça aberta,
// evento encerrado) recebem esse estado por parâmetro.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Sponsor, EventQuotaRule } from "@shared/schema";
import type { RemessaDoKit } from "@shared/kit";
import { chaveDasRemessas } from "@/components/kit/painel-do-kit";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { finishes, materials, normKey } from "./regras";
import type {
  EventoDoDetalhe, LogDeAuditoria, ModeloDePeca, OpcaoDoCatalogo, PecaDoEvento,
  ResumoDoEstoque, VinculoDePatrocinador,
} from "./tipos";

/** O evento, as peças dele e as remessas do Kit. */
export function useDadosDoEvento(eventId: string | undefined) {
  const { data: event, isLoading: loadingEvent, isError: eventError, refetch: refetchEvent } = useQuery<EventoDoDetalhe>({
    queryKey: ["/api/events", eventId],
    enabled: !!eventId,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  const { data: rawItems = [], isLoading: loadingItems, isFetching, isError: itemsError, refetch: refetchItems } = useQuery<PecaDoEvento[]>({
    queryKey: ["/api/items", eventId],
    enabled: !!eventId,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  // Remessas do Kit deste evento — "Peça de" no formulário.
  const { data: remessasDoKit = [] } = useQuery<RemessaDoKit[]>({
    queryKey: [chaveDasRemessas(eventId ?? "")],
    enabled: !!eventId,
  });

  return { event, loadingEvent, eventError, refetchEvent, rawItems, loadingItems, isFetching, itemsError, refetchItems, remessasDoKit };
}

/**
 * Modelos e opções do catálogo, e o que a tela deriva deles: o grupo pai de
 * cada tipo e as listas de Material/Acabamento.
 */
export function useCatalogoDePecas() {
  const { data: standardItems = [] } = useQuery<ModeloDePeca[]>({
    queryKey: ["/api/standard-items"],
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  const { data: catalogOptions = [] } = useQuery<OpcaoDoCatalogo[]>({
    queryKey: ["/api/catalog-options"],
  });

  const createCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("POST", "/api/catalog-options", { kind, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] }),
  });

  // Mapa tipo → grupo pai (a partir dos standardItems). Resolve tolerante a
  // maiúscula/acento/espaço, casando o type tanto com o NOME do modelo quanto
  // com um NOME DE GRUPO do catálogo — assim itens importados da planilha
  // (ex.: type "Rolo") caem no grupo "ROLO".
  const groupOf = useMemo(() => {
    const groupByName: Record<string, string> = {};
    const groupByGroup: Record<string, string> = {};
    standardItems.forEach((s) => {
      if (s.group) {
        groupByName[normKey(s.name)] = s.group;
        groupByGroup[normKey(s.group)] = s.group;
      }
    });
    return (type: string): string => {
      const k = normKey(type);
      return groupByName[k] || groupByGroup[k] || "";
    };
  }, [standardItems]);

  // Materiais e acabamentos: padrão + catálogo cadastrado + os usados nos Modelos,
  // para que um material/acabamento criado em "Modelos" apareça na edição de itens.
  const { materialOptions, finishOptions } = useMemo(() => {
    const catMats = catalogOptions.filter(o => o.kind === "material").map(o => o.value);
    const catFinishes = catalogOptions.filter(o => o.kind === "finish").map(o => o.value);
    return {
      materialOptions: Array.from(new Set([...materials, ...catMats, ...(standardItems.map(s => s.material).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b, "pt-BR")),
      finishOptions: Array.from(new Set([...finishes, ...catFinishes, ...(standardItems.map(s => s.finish).filter(Boolean) as string[])])).sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  }, [catalogOptions, standardItems]);

  return { standardItems, catalogOptions, createCatalogOptionMutation, groupOf, materialOptions, finishOptions };
}

/** Patrocinadores do evento e as cotas — a Entrada Rápida e a importação usam. */
export function usePatrocinadoresDoEvento(eventId: string | undefined) {
  // Buscar patrocinadores vinculados ao evento
  const { data: eventSponsors = [] } = useQuery<VinculoDePatrocinador[]>({
    queryKey: ["/api/events", eventId, "sponsors"],
    enabled: !!eventId,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  // Buscar todos os patrocinadores para obter os detalhes
  const { data: allSponsors = [] } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });

  // Filtrar apenas os patrocinadores vinculados ao evento
  const sponsors = allSponsors.filter(sponsor =>
    eventSponsors.some(es => es.sponsorId === sponsor.id)
  );

  // Cotas configuradas para este evento (usadas na sugestão de patrocinador na importação)
  const { data: eventQuotaRules = [] } = useQuery<EventQuotaRule[]>({
    queryKey: ["/api/events", eventId, "quota-rules"],
    queryFn: () => fetch(`/api/events/${eventId}/quota-rules`).then(r => r.json()),
    enabled: !!eventId,
  });

  // Lista enriquecida: eventSponsors + nome do patrocinador (para sugestão na importação).
  // Cota nula vira "": a sugestão compara com a cota da regra (nunca vazia) e o
  // selo cai no tom padrão — o mesmo resultado que o `null` dava.
  const eventSponsorsList = eventSponsors.map((es) => ({
    sponsorId: es.sponsorId,
    quota: es.quota ?? "",
    name: allSponsors.find((s) => s.id === es.sponsorId)?.name ?? '',
  })).filter(es => es.name);

  return { sponsors, eventQuotaRules, eventSponsorsList };
}

/**
 * Todos os eventos (para o seletor de clone) — só quando o dialog de
 * clonagem abre; antes a lista inteira era baixada em toda visita à página.
 */
export function useEventosParaClonar(cloneDialogOpen: boolean) {
  const { data: allEvents = [], isLoading: loadingAllEvents } = useQuery<EventoDoDetalhe[]>({
    queryKey: ["/api/events"],
    enabled: cloneDialogOpen,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });
  return { allEvents, loadingAllEvents };
}

/**
 * Audit log SÓ da peça aberta no modal, sob demanda — antes baixava a tabela
 * inteira de auditoria no load da página (o modal filtra por entityId).
 */
export function useHistoricoDaPeca(itemId: string | undefined) {
  const { data: auditLogs = [] } = useQuery<LogDeAuditoria[]>({
    queryKey: ["/api/audit-logs", "item", itemId],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${itemId!}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!itemId,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });
  return auditLogs;
}

/**
 * BUSCAR NO ESTOQUE: cada peça mostra quantas iguais — mesmo tipo e medida —
 * o estoque tem. Estoque é só do admin: sem o resumo, o selo e a busca somem
 * para os outros.
 */
export function useResumoDoEstoque(eventId: string | undefined, isAdmin: boolean) {
  const { data: estoqueResumo = {} } = useQuery<ResumoDoEstoque>({
    queryKey: [`/api/events/${eventId}/estoque-resumo`],
    enabled: !!eventId && isAdmin,
  });
  return estoqueResumo;
}

/**
 * Quem encerrou e quando: a resposta mora no audit log (o encerramento não
 * tem coluna própria, de propósito — ver server/routes/shared.ts). Consulta
 * com ESCOPO e só quando o evento está encerrado; sem isto o banner diria
 * "encerrado" sem dizer por quem, que é metade da segurança da ação.
 */
export function useQuemEncerrou(eventId: string | undefined, isEventClosed: boolean) {
  const { data: eventAuditLogs = [] } = useQuery<LogDeAuditoria[]>({
    queryKey: ["/api/audit-logs", "event", eventId],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=event&entityId=${eventId}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!eventId && isEventClosed,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: false,
  });
  return useMemo(
    () => (Array.isArray(eventAuditLogs) ? eventAuditLogs : [])
      .filter((l) => typeof l?.details === 'string' && l.details.includes('ENCERRADO manualmente'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0],
    [eventAuditLogs],
  );
}
