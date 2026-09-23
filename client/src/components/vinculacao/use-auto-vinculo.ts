// ─────────────────────────────────────────────────────────────────────────────
// useAutoVinculo — AUTO-VINCULAR POR COTA: a pré-visualização de um evento e a
// confirmação, que grava direto no servidor (sem passar pelo rascunho).
// Chamado de dentro de useAcoesDaVinculacao.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { mensagemDoErro } from "./regras";
import type { Vinculacao } from "./use-vinculacao";
import type { PreviaDoAutoVinculo } from "./tipos";

export function useAutoVinculo(v: Vinculacao) {
  const { setItemSponsorsMap, setOriginalSponsorsMap, setPendingChanges, loadedItemIdsRef } = v;
  const { toast } = useToast();

  // Auto-vincular por cota: a pré-visualização é uma entrada por patrocinador,
  // com as peças que ele levaria.
  const [autoLinkOpen, setAutoLinkOpen] = useState(false);
  const [autoLinkPreview, setAutoLinkPreview] = useState<PreviaDoAutoVinculo[] | null>(null);
  const [autoLinkLoading, setAutoLinkLoading] = useState(false);
  const [autoLinkConfirming, setAutoLinkConfirming] = useState(false);
  // O EVENTO do auto-vínculo aberto, guardado na abertura: o mesmo diálogo
  // serve ao botão do topo (com um evento filtrado) e ao do cabeçalho de cada
  // evento.
  const [autoLinkEventoId, setAutoLinkEventoId] = useState<string | null>(null);

  /** Abre a pré-visualização do auto-vínculo por cota de UM evento. */
  const abrirAutoVinculo = async (eventId: string) => {
    setAutoLinkEventoId(eventId);
    setAutoLinkOpen(true);
    setAutoLinkPreview(null);
    setAutoLinkLoading(true);
    try {
      // apiRequest em vez de fetch cru: herda a guarda de servidor
      // desatualizado (HTML no lugar de JSON) e o throw em erro HTTP.
      const res = await apiRequest('GET', `/api/events/${eventId}/auto-link-preview`);
      const data: unknown = await res.json();
      // Guarda de formato: se o corpo não for a lista esperada, o
      // .reduce() do rodapé derrubava a tela inteira.
      if (!Array.isArray(data)) {
        throw new Error('Não foi possível carregar a pré-visualização');
      }
      setAutoLinkPreview(data as PreviaDoAutoVinculo[]);
    } catch (e) {
      setAutoLinkOpen(false);
      toast({ variant: 'destructive', title: 'Erro na pré-visualização', description: mensagemDoErro(e) || 'Tente novamente' });
    } finally {
      setAutoLinkLoading(false);
    }
  };

  const fecharAutoVinculo = () => { setAutoLinkOpen(false); setAutoLinkPreview(null); };

  /** Confirma o auto-vínculo: grava direto no servidor, sem rascunho. */
  const confirmarAutoVinculo = async () => {
    if (!autoLinkPreview || autoLinkPreview.length === 0) return;
    setAutoLinkConfirming(true);
    try {
      if (!autoLinkEventoId) return;
      const res = await apiRequest('POST', `/api/events/${autoLinkEventoId}/auto-link-sponsors`);
      // Contagem real retornada pela rota — o total do preview
      // podia divergir do que foi de fato gravado.
      const { linked }: { linked: number } = await res.json();
      // Sem isto os vínculos novos não apareciam até um reload:
      // loadedItemIdsRef pulava os itens já vistos e o merge dos
      // mapas preserva a entrada antiga. Esquecer os itens
      // afetados força a re-derivação a partir do refetch.
      const affectedIds = autoLinkPreview.flatMap((e) => e.items.map((it) => it.itemId));
      affectedIds.forEach((id: string) => loadedItemIdsRef.current.delete(id));
      const dropAffected = (prev: Record<string, string[]>) => {
        const next = { ...prev };
        affectedIds.forEach((id: string) => { delete next[id]; });
        return next;
      };
      setItemSponsorsMap(dropAffected);
      setOriginalSponsorsMap(dropAffected);
      // Rascunhos locais dos afetados também caem: o auto-vínculo
      // acabou de gravar no servidor, e salvar um rascunho antigo
      // por cima desfaria os vínculos recém-criados.
      setPendingChanges(prev => {
        const next = { ...prev };
        affectedIds.forEach((id: string) => { delete next[id]; });
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/items'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-logs'] });
      setAutoLinkOpen(false);
      setAutoLinkPreview(null);
      // "Foi salvo?" — sim, e já no servidor: o auto-vínculo não
      // passa pelo rascunho. O aviso diz isso e o passo seguinte.
      toast({ variant: 'success', title: 'Vínculos salvos', description: `${linked} vínculo${linked !== 1 ? 's' : ''} gravado${linked !== 1 ? 's' : ''}. As peças vinculadas ficam Prontas — falta só Enviar para Arte.` });
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao vincular', description: mensagemDoErro(e) });
    } finally {
      setAutoLinkConfirming(false);
    }
  };

  return {
    autoLinkOpen, autoLinkPreview, autoLinkLoading, autoLinkConfirming, autoLinkEventoId,
    abrirAutoVinculo, fecharAutoVinculo, confirmarAutoVinculo,
  };
}
