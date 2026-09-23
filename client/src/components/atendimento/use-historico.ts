// ─────────────────────────────────────────────────────────────────────────────
// A ABA HISTÓRICO: a lista, a ordem e as duas facetas — do MESMO pool.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { normalizarBusca } from "@/lib/utils";
import { T, TOM } from "@/lib/theme";
import { COLLATOR, isPastApproval, jornadaDaPeca, type OrdemHistorico } from "./regras";
import type { AbaDoAtendimento, EventoAtendimento, OpcaoContada, Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

export function useHistorico({
  activeTab, ordemHistorico, hoje, eventoPorId, items, events, itemApprovalsMap, itemSponsorsMap, loadingSponsors,
  histEventFilter, histSponsorFilter, histPeriodFilter, histBuscaDeferida,
}: {
  activeTab: AbaDoAtendimento;
  ordemHistorico: OrdemHistorico;
  hoje: Date;
  eventoPorId: Map<string, EventoAtendimento>;
  items: PecaAtendimento[];
  events: EventoAtendimento[];
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  loadingSponsors: boolean;
  histEventFilter: string[];
  histSponsorFilter: string[];
  histPeriodFilter: string;
  histBuscaDeferida: string;
}) {
  // ── Aba Histórico ───────────────────────────────────────────────────────
  // Itens que têm pelo menos uma aprovação de patrocinador com status 'approved',
  // independente do status atual (podem estar em produção, entregues, etc.)
  // Rótulo e cores do badge de status vêm da lib canônica (getStatusMeta) —
  // o mapa local que existia aqui divergia dos nomes usados nas outras telas.
  //
  // A INVARIANTE, a mesma da fila de pendentes (use-fila-pendente): FACETA E LISTA SAEM DO
  // MESMO POOL. Aqui ela estava quebrada ao contrário — os dois menus desta aba
  // (`histEventOptions`, `histSponsorOptions`) listavam TODOS os eventos e
  // TODOS os patrocinadores do sistema, sem contagem, sobre uma lista que só
  // tem peça com aprovação registrada. Escolher um evento sem histórico
  // devolvia lista vazia, e não havia como saber se o evento não tinha
  // aprovação ou se a tela tinha quebrado.
  //
  // `excluir` é o que sustenta a invariante: a lista chama sem ele, cada menu
  // chama com a própria dimensão de fora.
  const casaHistorico = (item: PecaAtendimento, excluir?: 'evento' | 'patrocinador'): boolean => {
    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    // Aprovação registrada OU status pós-aprovação: o atalho "Aprovar
    // Ativo" muda o status sem criar approvals e a peça sumia daqui.
    if (!approvals.some(a => a.status === 'approved') && !isPastApproval(item)) return false;

    if (excluir !== 'evento' && histEventFilter.length > 0 && !histEventFilter.includes(item.eventId)) return false;

    if (excluir !== 'patrocinador' && histSponsorFilter.length > 0) {
      const itemSps = itemSponsorsMap[item.id] || [];
      if (!itemSps.some((s) => histSponsorFilter.includes(s.id))) return false;
    }

    const now = new Date();
    const cutoff = histPeriodFilter === "7d"  ? new Date(now.getTime() - 7  * 86400000)
                 : histPeriodFilter === "30d" ? new Date(now.getTime() - 30 * 86400000)
                 : histPeriodFilter === "90d" ? new Date(now.getTime() - 90 * 86400000)
                 : null;
    if (cutoff) {
      const approvedAt = approvals
        .filter(a => a.status === 'approved' && a.approvedAt)
        .map(a => new Date(a.approvedAt!))
        .sort((a, b) => b.getTime() - a.getTime())[0];
      if (!approvedAt || approvedAt < cutoff) return false;
    }

    // Busca sem acento (`normalizarBusca`, lib/utils) — a mesma dos menus.
    const q = normalizarBusca(histBuscaDeferida);
    if (q &&
        !normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.description).includes(q)) return false;

    return true;
  };

  const historyItems = useMemo(() => {
    if (loadingSponsors) return [];
    // A aba Histórico só é desenhada com ela aberta (`activeTab === "history"`),
    // e este memo varre as 5 mil peças e ORDENA as que casam. Com a aba
    // Pendentes aberta ele rodava de graça a cada decisão (o mapa de aprovações
    // muda) — agora espera a aba ser aberta.
    if (activeTab !== "history") return [];
    // Chave de ordenação calculada UMA vez por peça: antes `latestApproval`
    // filtrava as aprovações e fazia `new Date` dentro de cada COMPARAÇÃO do
    // sort (~12 comparações por peça).
    const ultimaPorId = new Map<string, number>();
    const latestApproval = (item: PecaAtendimento) => {
      const guardada = ultimaPorId.get(item.id);
      if (guardada !== undefined) return guardada;
      const times = (itemApprovalsMap[item.id] || [])
        .filter((a: SponsorApproval) => a.status === 'approved' && a.approvedAt)
        .map((a: SponsorApproval) => new Date(a.approvedAt!).getTime());
      const ultima = times.length ? Math.max(...times) : 0;
      ultimaPorId.set(item.id, ultima);
      return ultima;
    };
    const duracaoDe = (item: PecaAtendimento) => jornadaDaPeca(item, hoje instanceof Date ? hoje.getTime() : Number(hoje)).duracao ?? -1;
    const nomeDoEvento = (item: PecaAtendimento) => (eventoPorId.get(item.eventId)?.name || "").toLowerCase();
    return items.filter(item => casaHistorico(item)).sort((a, b) => {
      if (ordemHistorico === "demoradas") return duracaoDe(b) - duracaoDe(a);
      if (ordemHistorico === "evento") return COLLATOR.compare(nomeDoEvento(a), nomeDoEvento(b)) || latestApproval(b) - latestApproval(a);
      return latestApproval(b) - latestApproval(a);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, ordemHistorico, hoje, eventoPorId, items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histSponsorFilter, histPeriodFilter, histBuscaDeferida]);

  // As duas facetas da aba Histórico, do MESMO pool da lista. Só o que tem
  // linha aparece, e a contagem ao lado do nome é o número de linhas que o
  // clique entrega.
  const histEventOptions = useMemo(() => {
    if (loadingSponsors) return [] as OpcaoContada[];
    // Mesma razão do historyItems: menu da aba Histórico, só com ela aberta.
    if (activeTab !== "history") return [] as OpcaoContada[];
    const C: Record<string, string> = { urgente: TOM.perigo.dot, urgent: TOM.perigo.dot, alta: T.accent, media: TOM.alerta.dot, baixa: TOM.info.dot };
    const byId = new Map(events.map((e) => [e.id, e]));
    const map = new Map<string, OpcaoContada>();
    items.filter(i => casaHistorico(i, 'evento')).forEach((i) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) { cur.count++; return; }
      const ev = byId.get(i.eventId);
      map.set(i.eventId, { value: i.eventId, label: ev?.name || i.event?.name || 'Sem evento', count: 1, dotColor: C[ev?.priority ?? ''] });
    });
    // Prioridade primeiro (urgente no topo), nome desempata — a mesma ordem que
    // o seletor já tinha quando listava o sistema inteiro.
    const P: Record<string, number> = { urgente: 0, urgent: 0, alta: 1, media: 2, baixa: 3 };
    return Array.from(map.values()).sort((a, b) => {
      const pa = P[byId.get(a.value)?.priority ?? ''] ?? 4, pb = P[byId.get(b.value)?.priority ?? ''] ?? 4;
      return pa !== pb ? pa - pb : a.label.localeCompare(b.label, 'pt-BR');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items, events, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histSponsorFilter, histPeriodFilter, histBuscaDeferida]);

  const histSponsorOptions = useMemo(() => {
    if (loadingSponsors) return [] as { value: string; label: string; count: number }[];
    if (activeTab !== "history") return [] as { value: string; label: string; count: number }[];
    const map = new Map<string, { value: string; label: string; count: number }>();
    items.filter(i => casaHistorico(i, 'patrocinador')).forEach((i) => {
      (itemSponsorsMap[i.id] || []).forEach((s) => {
        const cur = map.get(s.id);
        if (cur) cur.count++;
        else map.set(s.id, { value: s.id, label: s.name, count: 1 });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histPeriodFilter, histBuscaDeferida]);

  return { historyItems, histEventOptions, histSponsorOptions };
}
