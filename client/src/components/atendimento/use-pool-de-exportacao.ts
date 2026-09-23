// ─────────────────────────────────────────────────────────────────────────────
// O POOL DO BOOK DE EXPORTAÇÃO (ExportPdfDialog): pendentes E já aprovadas.
//
// Órgãos como o Ministério do Esporte exigem o book COMPLETO da etapa a cada
// nova solicitação, mesmo quando só uma peça mudou — se só as pendentes
// entrassem, o book sairia incompleto assim que as demais fossem aprovadas.
// O pool anexa a cada peça os patrocinadores (que aqui vivem no mapa do lote)
// e o evento.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef } from "react";
import { isPastApproval } from "./regras";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, SponsorApproval } from "./tipos";

/** A peça como o book a recebe: com os patrocinadores e o evento junto. */
export type PecaDoBook = Omit<PecaAtendimento, "event"> & {
  sponsors: Patrocinador[];
  event: EventoAtendimento | null | undefined;
};

export function usePoolDeExportacao({ showExportPDFModal, items, events, itemSponsorsMap, itemApprovalsMap }: {
  showExportPDFModal: boolean;
  items: PecaAtendimento[];
  events: EventoAtendimento[];
  itemSponsorsMap: Record<string, Patrocinador[]>;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
}): PecaDoBook[] {
  const exportPool = useMemo(() => {
    // Só com o modal ABERTO: o pool copia cada peça elegível (milhares de
    // objetos novos) e o ExportPdfDialog, montado sempre, recalcula oito
    // facetas a cada identidade nova. Fechado, ele recebe o último pool que
    // mostrou (exportPoolCongelado) e não refaz nada — nem na animação de saída.
    if (!showExportPDFModal) return null;
    const evById = new Map(events.map((e) => [e.id, e]));
    return items
      .filter(item => {
        if ((itemSponsorsMap[item.id]?.length ?? 0) === 0) return false;
        // Entrou no fluxo de aprovação: está aguardando, já tem aprovação OU
        // está num status pós-aprovação (atalho "Aprovar Ativo" não cria approvals).
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        return item.status === 'awaiting_sponsor_approval'
          || approvals.some(a => a.status === 'approved')
          || isPastApproval(item);
      })
      .map((item): PecaDoBook => ({
        ...item,
        sponsors: itemSponsorsMap[item.id] ?? [],
        event: item.event ?? evById.get(item.eventId),
      }));
  }, [showExportPDFModal, items, itemSponsorsMap, itemApprovalsMap, events]);
  const exportPoolRef = useRef<PecaDoBook[]>([]);
  if (exportPool) exportPoolRef.current = exportPool;
  const exportPoolCongelado = exportPool ?? exportPoolRef.current;
  return exportPoolCongelado;
}
