// Os dados da tela de Eventos: a lista de eventos, os patrocinadores (nome e
// cor dos vínculos) e os pedidos de peça do Atendimento em aberto.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Sponsor } from "@shared/schema";
import type { PedidoDePeca } from "@shared/pedidos-de-peca";
import type { EventoDaLista } from "./tipos";

export function useEventosDados() {
  // PEDIDOS DO ATENDIMENTO (dono, 14/09): quantos pedidos de peça cada evento
  // tem esperando a lista.
  const { data: pedidosAbertos = [] } = useQuery<PedidoDePeca[]>({ queryKey: ["/api/pedidos-de-peca?status=aberto"] });
  // Uma solicitação tem várias peças, de eventos diferentes: conta PEÇAS abertas.
  const linhasAbertas = useMemo(
    () => pedidosAbertos.flatMap((p) => (p.linhas ?? []).filter((l) => l.status === 'aberto').map((linha) => ({ pedido: p, linha }))),
    [pedidosAbertos],
  );
  const pedidosPorEvento = useMemo(() => {
    const porEvento = new Map<string, number>();
    for (const { linha } of linhasAbertas) porEvento.set(linha.eventId, (porEvento.get(linha.eventId) ?? 0) + 1);
    return porEvento;
  }, [linhasAbertas]);

  const { data: events = [], isLoading, isError, refetch } = useQuery<EventoDaLista[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [], isLoading: sponsorsQueryLoading, isError: sponsorsQueryError } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  // Resolve nome/cor dos vínculos do payload de eventos (que só trazem sponsorId).
  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);
  // Patrocinadores de cada cartão, montados uma vez por payload. Montados no
  // render, eram um array novo a cada tecla e nenhum cartão memoizado pulava.
  const patrocinadoresDoCartao = useMemo(() => {
    const m = new Map<string, Sponsor[]>();
    for (const ev of events) {
      m.set(ev.id, (ev.sponsors || [])
        .map((es) => sponsorById.get(es.sponsorId))
        .filter((s): s is Sponsor => Boolean(s)));
    }
    return m;
  }, [events, sponsorById]);

  return {
    linhasAbertas, pedidosPorEvento,
    events, isLoading, isError, refetch,
    sponsors, sponsorsQueryLoading, sponsorsQueryError, sponsorById, patrocinadoresDoCartao,
  };
}

export type LinhaAberta = ReturnType<typeof useEventosDados>["linhasAbertas"][number];
