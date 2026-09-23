// ─────────────────────────────────────────────────────────────────────────────
// AS QUERIES DO ATENDIMENTO — o que a tela baixa, e quando.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CHAVE_DA_FILA, CHAVE_DO_HISTORICO, SEM_DADOS } from "./regras";
import type {
  EventoAtendimento, ModeloDePeca, Patrocinador, PecaAtendimento, RegistroDeAuditoria, UsuarioDaTela, VinculoDoEvento,
} from "./tipos";

export function useAtendimentoDados({ selectedItem, dialogOpen, user, precisaDoHistorico }: {
  selectedItem: PecaAtendimento | null;
  dialogOpen: boolean;
  user: UsuarioDaTela;
  /**
   * O histórico só desce quando alguém vai olhar para ele: a aba aberta ou o
   * book de exportação montado (o book precisa das já aprovadas, senão sai
   * incompleto — ver `exportPool`). Uma vez baixado, fica no cache do React
   * Query como qualquer outra lista, e revalida por delta.
   */
  precisaDoHistorico: boolean;
}) {
  // /api/events/:id/sponsors devolve VÍNCULOS ({ sponsorId, quota }) — os
  // nomes vêm do catálogo que esta tela já carrega em /api/sponsors.
  const { data: vinculosDoEvento = SEM_DADOS } = useQuery<VinculoDoEvento[]>({
    queryKey: ["/api/events", selectedItem?.eventId, "sponsors"],
    enabled: !!selectedItem?.eventId && dialogOpen && user?.role === "admin",
  });

  const { data: pecasDaFila = SEM_DADOS, isLoading: itemsLoading, isError: itemsError, refetch: refetchItems,
    dataUpdatedAt, isFetching: isFetchingItems } = useQuery<PecaAtendimento[]>({
    queryKey: CHAVE_DA_FILA,
  });

  const { data: pecasDoHistorico = SEM_DADOS } = useQuery<PecaAtendimento[]>({
    queryKey: CHAVE_DO_HISTORICO,
    enabled: precisaDoHistorico,
  });

  // As duas listas como UMA, que é o que o resto da tela sempre viu.
  //
  // DEDUPLICA POR ID mesmo os recortes sendo disjuntos por construção (eles não
  // compartilham status nenhum). Uma peça em dobro aqui não daria erro: daria
  // placar dobrado e a mesma peça duas vezes na fila — o tipo de defeito que só
  // se descobre olhando. O custo é uma passada por Map, e só quando as duas
  // listas existem; enquanto o histórico não é pedido, é a própria fila.
  const items = useMemo(() => {
    if (pecasDoHistorico.length === 0) return pecasDaFila;
    if (pecasDaFila.length === 0) return pecasDoHistorico;
    const porId = new Map<string, PecaAtendimento>();
    for (const p of pecasDaFila) porId.set(p.id, p);
    for (const p of pecasDoHistorico) if (!porId.has(p.id)) porId.set(p.id, p);
    return Array.from(porId.values());
  }, [pecasDaFila, pecasDoHistorico]);

  const { data: events = SEM_DADOS, isLoading: eventsLoading } = useQuery<EventoAtendimento[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = SEM_DADOS } = useQuery<Patrocinador[]>({
    queryKey: ["/api/sponsors"],
  });
  const sponsorsDoEvento = useMemo(() => {
    const porId = new Map(sponsors.map((s) => [s.id, s]));
    return vinculosDoEvento
      .map((v) => porId.get(v.sponsorId))
      .filter((s): s is Patrocinador => Boolean(s));
  }, [vinculosDoEvento, sponsors]);

  // Histórico DA PEÇA em revisão, com escopo no servidor. A listagem global
  // tem teto de 500 registros — peça antiga caía fora da janela e o modal
  // mostrava "sem histórico" (bug reportado pelo dono).
  const { data: auditLogs = SEM_DADOS } = useQuery<unknown, Error, RegistroDeAuditoria[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: (d): RegistroDeAuditoria[] => (Array.isArray(d) ? d : []),
    enabled: dialogOpen && !!selectedItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = SEM_DADOS } = useQuery<ModeloDePeca[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    standardItems.forEach((s) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  return {
    vinculosDoEvento, items, itemsLoading, itemsError, refetchItems, dataUpdatedAt, isFetchingItems,
    events, eventsLoading, sponsors, sponsorsDoEvento, auditLogs, typeToGroup,
  };
}
