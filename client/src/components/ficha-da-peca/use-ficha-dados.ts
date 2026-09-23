// As leituras da ficha: aprovações por patrocinador e fotos da Gráfica.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AprovacaoDaFicha, FotoDaPeca, ItemDaFicha } from "./tipos";

export function useFichaDados(item: ItemDaFicha | null, open: boolean) {
  // Aprovação por patrocinador não vem no payload de /api/items — sem buscar
  // aqui, peças com várias marcas apareciam sempre como "Aguardando" no Painel
  // Geral e no detalhe do evento, mesmo já aprovadas.
  // useQuery (não fetch cru em useEffect): cache/deduplicação/cancelamento de
  // graça. staleTime 0 preserva o comportamento antigo de buscar a cada abertura.
  const approvalsQuery = useQuery<AprovacaoDaFicha[]>({
    queryKey: ["/api/items", item?.id, "sponsor-approvals"],
    enabled: !!item?.id && open && !item?.sponsorApprovals,
    staleTime: 0,
  });
  const fetchedApprovals: AprovacaoDaFicha[] = Array.isArray(approvalsQuery.data) ? approvalsQuery.data : [];
  // Sobrepõe a lista assim que o admin reverte uma aprovação — sem isso o chip
  // ficaria com o status antigo até o diálogo reabrir.
  const [approvalsOverride, setApprovalsOverride] = useState<AprovacaoDaFicha[] | null>(null);
  const refetchApprovals = async () => {
    if (!item?.id) return;
    // refetch() ignora `enabled` — funciona mesmo quando o payload já trazia
    // sponsorApprovals e a query ficou desligada.
    const res = await approvalsQuery.refetch();
    const list = Array.isArray(res.data) ? res.data : [];
    setApprovalsOverride(list);
    return list;
  };

  // Fotos que a Gráfica anexou na conferência e na entrega, para que o registro
  // acompanhe a peça ao longo do fluxo e não fique só na tela da Gráfica.
  const { data: flowPhotosData } = useQuery<FotoDaPeca[]>({
    queryKey: ["/api/items", item?.id, "photos"],
    enabled: !!item?.id && open,
    staleTime: 0,
  });
  const flowPhotos: FotoDaPeca[] = Array.isArray(flowPhotosData) ? flowPhotosData : [];

  return { fetchedApprovals, approvalsOverride, setApprovalsOverride, refetchApprovals, flowPhotos };
}
