// ─────────────────────────────────────────────────────────────────────────────
// A ORDEM DA FILA — a lista e a fila do modal andam JUNTAS.
//
// Navegar com "Próxima peça" numa ordem diferente da que está na tela é o
// tipo de desencontro que faz a pessoa decidir a peça errada. Por isso a lista
// agrupada e a fila de revisão saem do mesmo comparador e do mesmo peso.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useMemo } from "react";
import { prazoAprovacaoLayout } from "@/lib/atendimento-prazo";
import { COLLATOR, situacaoDaPeca, type OrdemPendentes } from "./regras";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

export function useOrdemDaFila({
  filteredItems, loadingSponsors, isItemFullyApproved, itemApprovalsMap, itemSponsorsMap,
  ordemPendentes, typeToGroup, eventoPorId, hoje,
}: {
  filteredItems: PecaAtendimento[];
  loadingSponsors: boolean;
  isItemFullyApproved: (item: { id: string }) => boolean;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  ordemPendentes: OrdemPendentes;
  typeToGroup: Record<string, string>;
  eventoPorId: Map<string, EventoAtendimento>;
  hoje: Date;
}) {
  const pendingGroup = useMemo(() => {
    if (loadingSponsors) return filteredItems;
    return filteredItems.filter(item => !isItemFullyApproved(item));
  }, [filteredItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

  // A ORDEM, EM UM LUGAR SÓ — a lista e a fila do modal têm de andar
  // juntas: navegar com "Próxima peça" numa ordem diferente da que está na
  // tela é o tipo de desencontro que faz a pessoa decidir a peça errada.
  const comparaPecas = useCallback((a: PecaAtendimento, b: PecaAtendimento) => {
    if (ordemPendentes === "mesa") {
      const ma = situacaoDaPeca(itemApprovalsMap[a.id]) === "nova_versao" ? 0 : 1;
      const mb = situacaoDaPeca(itemApprovalsMap[b.id]) === "nova_versao" ? 0 : 1;
      if (ma !== mb) return ma - mb;
    }
    const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
    return COLLATOR.compare(ga, gb) || COLLATOR.compare(a.type, b.type);
  }, [ordemPendentes, itemApprovalsMap, typeToGroup]);

  /** Peso do EVENTO na ordem escolhida. Vencido primeiro; sem prazo, por último. */
  const pesoDoEvento = useCallback((eventId: string, pecas: PecaAtendimento[]) => {
    const ev = eventoPorId.get(eventId);
    if (ordemPendentes === "evento") return { chave: (ev?.name || "").toLowerCase(), num: 0 };
    if (ordemPendentes === "mesa") {
      const naMesa = pecas.filter((i) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao").length;
      return { chave: "", num: -naMesa };
    }
    const prazo = ev ? prazoAprovacaoLayout(ev, hoje) : null;
    // Sem marco não é "no prazo": é desconhecido, e vai para o fim.
    return { chave: "", num: prazo ? prazo.diff : Number.MAX_SAFE_INTEGER };
  }, [ordemPendentes, itemApprovalsMap, eventoPorId, hoje]);

  
  const actionableCount = useMemo(() => {
    if (loadingSponsors) return null;
    return pendingGroup.filter(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
      if (hasArteBlock) return false;
      return approvals.some(a => a.status === 'rejected' || a.status === 'pending' || a.status === 'new_version_pending');
    }).length;
  }, [pendingGroup, itemApprovalsMap, loadingSponsors]);

  // Fila de revisão: todas as peças pendentes na MESMA ordem em que aparecem
  // na tela (agrupadas por evento). É o que permite ir para a próxima peça sem
  // fechar o modal e voltar para a lista.
  const reviewQueue = useMemo(() => {
    const sorted = [...pendingGroup].sort(comparaPecas);
    const byEvent = new Map<string, PecaAtendimento[]>();
    sorted.forEach(item => {
      const eid = item.eventId || '__none__';
      if (!byEvent.has(eid)) byEvent.set(eid, []);
      byEvent.get(eid)!.push(item);
    });
    return Array.from(byEvent.entries())
      .sort(([ea, pa], [eb, pb]) => {
        const wa = pesoDoEvento(ea, pa), wb = pesoDoEvento(eb, pb);
        return wa.num - wb.num || COLLATOR.compare(wa.chave, wb.chave);
      })
      .flatMap(([, pecas]) => pecas);
  }, [pendingGroup, comparaPecas, pesoDoEvento]);

  /** As peças que esperam decisão SUA, na ordem da tela. */
  const filaDaSuaMesa = useMemo(
    () => reviewQueue.filter((i) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao"),
    [reviewQueue, itemApprovalsMap],
  );

  // Agrupa pendingGroup por evento (a página chama antes de qualquer return).
  const itemsByEvent = useMemo(() => {
    const map = new Map<string, PecaAtendimento[]>();
    const sorted = [...pendingGroup].sort(comparaPecas);
    // TODAS as peças entram. O corte em 25 fatiava as PEÇAS antes de agrupar,
    // então ele não escondia só linhas: escondia EVENTOS INTEIROS. Com 227
    // pendências, a tela mostrava meia dúzia de eventos e dava a impressão de
    // que o resto não existia — e "Carregar mais" não anuncia que o que falta
    // são eventos, não peças.
    //
    // O custo disso é desenhar tudo; ver `content-visibility` no grupo.
    sorted.forEach(item => {
      const eid = item.eventId || '__none__';
      if (!map.has(eid)) map.set(eid, []);
      map.get(eid)!.push(item);
    });
    // Os GRUPOS também obedecem à ordem escolhida.
    return new Map(Array.from(map.entries()).sort(([ea, pa], [eb, pb]) => {
      const wa = pesoDoEvento(ea, pa), wb = pesoDoEvento(eb, pb);
      return wa.num - wb.num || COLLATOR.compare(wa.chave, wb.chave);
    }));
  }, [pendingGroup, comparaPecas, pesoDoEvento]);

  return { pendingGroup, actionableCount, reviewQueue, filaDaSuaMesa, itemsByEvent };
}
