// ─────────────────────────────────────────────────────────────────────────────
// APROVAÇÃO EM LOTE — quem é elegível, e a seleção em sincronia com isso.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

export function useLoteDoPatrocinador({
  awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, sponsors, events,
  batchSponsorId, setBatchSponsorId, batchEventId, setBatchSelectedItemIds, nomePorPatrocinador, eventoPorId,
}: {
  awaitingItems: PecaAtendimento[];
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  loadingSponsors: boolean;
  sponsors: Patrocinador[];
  events: EventoAtendimento[];
  batchSponsorId: string;
  setBatchSponsorId: Dispatch<SetStateAction<string>>;
  batchEventId: string;
  setBatchSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  nomePorPatrocinador: Map<string, string>;
  eventoPorId: Map<string, EventoAtendimento>;
}) {
  const batchEligibleSponsors = useMemo(() => {
    if (loadingSponsors) return [];
    const sponsorSet = new Set<string>();
    awaitingItems.forEach(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const itemSps = itemSponsorsMap[item.id] || [];
      itemSps.forEach((s) => {
        const approval = approvals.find(a => a.sponsorId === s.id);
        const status = approval?.status || "pending";
        if (status === "pending" || status === "new_version_pending") sponsorSet.add(s.id);
      });
    });
    return sponsors.filter((s) => sponsorSet.has(s.id));
  }, [awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, sponsors]);

  const batchEligibleEvents = useMemo(() => {
    if (!batchSponsorId || loadingSponsors) return [];
    const eventSet = new Set<string>();
    awaitingItems.forEach(item => {
      if (!itemSponsorsMap[item.id]?.some((s) => s.id === batchSponsorId)) return;
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const approval = approvals.find(a => a.sponsorId === batchSponsorId);
      const status = approval?.status || "pending";
      if (status === "pending" || status === "new_version_pending") eventSet.add(item.eventId);
    });
    return events.filter((e) => eventSet.has(e.id));
  }, [batchSponsorId, awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, events]);

  const batchEligibleItems = useMemo(() => {
    if (!batchSponsorId || !batchEventId) return [];
    return awaitingItems.filter(item => {
      if (item.eventId !== batchEventId) return false;
      if (!itemSponsorsMap[item.id]?.some((s) => s.id === batchSponsorId)) return false;
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const approval = approvals.find(a => a.sponsorId === batchSponsorId);
      const status = approval?.status || "pending";
      return status === "pending" || status === "new_version_pending";
    });
  }, [batchSponsorId, batchEventId, awaitingItems, itemApprovalsMap, itemSponsorsMap]);

  const batchItemCount = batchEligibleItems.length;

  // NOMES do lote (rodada 4): a confirmação dizia "para o patrocinador
  // selecionado" — a pergunta "para quem?" voltava justamente no último clique,
  // com o seletor escondido atrás do diálogo.
  const batchSponsorNome = nomePorPatrocinador.get(batchSponsorId) ?? "o patrocinador selecionado";
  const batchEventoNome = eventoPorId.get(batchEventId)?.name ?? null;

  // Depois de um lote o patrocinador FICA escolhido (ver batchSponsorMutation):
  // o próximo evento dele é a pergunta seguinte. Se ele não tem mais nada
  // pendente, a escolha volta ao zero em vez de apontar para um nome que saiu
  // da lista.
  useEffect(() => {
    if (!batchSponsorId || loadingSponsors) return;
    if (!batchEligibleSponsors.some((s) => s.id === batchSponsorId)) setBatchSponsorId("");
  }, [batchSponsorId, batchEligibleSponsors, loadingSponsors]);

  // Mantém a seleção em sincronia com o conjunto elegível: se uma peça sai do
  // lote (decidida em outro lugar), ela some da seleção também. Só entram
  // sozinhas na seleção as peças NOVAS no conjunto (diff com o conjunto
  // anterior via ref) — antes, qualquer mudança no conjunto re-selecionava
  // TUDO e apagava as desmarcações manuais do usuário. Trocar de
  // patrocinador/evento recomeça com tudo selecionado (combo nova).
  const prevBatchEligibleRef = useRef<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  useEffect(() => {
    const key = `${batchSponsorId}:${batchEventId}`;
    const ids = new Set(batchEligibleItems.map(i => i.id));
    const prev = prevBatchEligibleRef.current;
    prevBatchEligibleRef.current = { key, ids };
    if (prev.key !== key) {
      setBatchSelectedItemIds(ids);
      return;
    }
    setBatchSelectedItemIds(prevSelected => {
      const next = new Set<string>();
      ids.forEach(id => {
        if (!prev.ids.has(id) || prevSelected.has(id)) next.add(id);
      });
      return next;
    });
  }, [batchSponsorId, batchEventId, batchEligibleItems]);

  return { batchEligibleSponsors, batchEligibleEvents, batchEligibleItems, batchItemCount, batchSponsorNome, batchEventoNome };
}
