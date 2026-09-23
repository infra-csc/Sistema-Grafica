// ─────────────────────────────────────────────────────────────────────────────
// useAcrescentar — ACRESCENTAR UM PATROCINADOR, inclusive depois do envio: o
// diálogo, a seleção congelada na abertura e a mutação. Chamado de dentro de
// useAcoesDaVinculacao.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Vinculacao } from "./use-vinculacao";
import type { RespostaDoAcrescentar, ResultadoDoLote } from "./tipos";

export function useAcrescentar(v: Vinculacao, setResultadoDoLote: (r: ResultadoDoLote | null) => void) {
  const { setItemSponsorsMap, setOriginalSponsorsMap, loadedItemIdsRef, selectedItemIds, setSelectedItemIds } = v;
  const { toast } = useToast();

  // ── ACRESCENTAR PATROCINADOR DEPOIS DO ENVIO ─────────────────────────────
  // "Aplicar Patrocinadores" manda a lista INTEIRA e substitui — por isso é
  // barrada depois do envio: rodá-la ali apagaria em silêncio o que a pessoa
  // não remarcasse. Esta ação só SOMA um patrocinador, e por isso vale nas
  // peças já enviadas: é o caso do patrocinador que passa a precisar aprovar
  // itens de uma lista que já tinha ido para a Arte.
  const [acrescentarAberto, setAcrescentarAberto] = useState(false);
  const [acrescentarSponsorId, setAcrescentarSponsorId] = useState<string | null>(null);
  const [buscaAcrescentar, setBuscaAcrescentar] = useState("");
  // A seleção é CONGELADA na abertura do diálogo. Sem isso, um refetch ou o
  // efeito de auto-deselect podia esvaziá-la com o diálogo aberto — foi o bug
  // do "Acrescentar em 0 peças": a pessoa marcou 12 e confirmou sobre nada.
  const [acrescentarAlvo, setAcrescentarAlvo] = useState<string[]>([]);

  const acrescentarSponsorMutation = useMutation({
    mutationFn: async ({ sponsorId, itemIds }: { sponsorId: string; itemIds: string[] }): Promise<RespostaDoAcrescentar> => {
      const res = await apiRequest("POST", "/api/items/bulk-add-sponsor", { sponsorId, itemIds });
      return await res.json();
    },
    onSuccess: (r: RespostaDoAcrescentar, variables) => {
      // SEM ISTO OS CHIPS NÃO MUDAVAM ATÉ O F5: os vínculos por peça são
      // derivados UMA vez (loadedItemIdsRef) e o merge preserva a entrada
      // antiga por cima do refetch. Descarta o cache das peças tocadas — o
      // efeito repovoa do payload fresco, com a verdade do servidor
      // (inclusive as recusadas, que ficam como estavam).
      setItemSponsorsMap(prev => {
        const nx = { ...prev };
        for (const id of variables.itemIds) delete nx[id];
        return nx;
      });
      setOriginalSponsorsMap(prev => {
        const nx = { ...prev };
        for (const id of variables.itemIds) delete nx[id];
        return nx;
      });
      for (const id of variables.itemIds) loadedItemIdsRef.current.delete(id);

      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setAcrescentarAberto(false);
      setAcrescentarSponsorId(null);
      setBuscaAcrescentar("");
      setSelectedItemIds(new Set());

      const partes: string[] = [];
      if (r?.vinculadas > 0) partes.push(`${r.vinculadas} peça(s) vinculada(s)`);
      if (r?.reabertas > 0) partes.push(`${r.reabertas} voltou(aram) para a aprovação — só o novo patrocinador decide, os demais seguem aprovados`);
      if (r?.pendenciasCriadas > 0 && !(r?.reabertas > 0)) partes.push(`${r.pendenciasCriadas} já entrou na aprovação em curso`);
      if (r?.jaTinham > 0) partes.push(`${r.jaTinham} já tinha(m)`);
      // As recusadas são DITAS, com o motivo — sumir com elas faria a pessoa
      // achar que o lote inteiro passou.
      const recusadas: { displayId: string; motivo: string }[] = r?.recusadas ?? [];
      if (recusadas.length > 0) {
        partes.push(`${recusadas.length} não pôde(ram): ${recusadas.slice(0, 3).map(x => `${x.displayId} (${x.motivo})`).join("; ")}${recusadas.length > 3 ? "…" : ""}`);
      }
      toast({
        title: r?.vinculadas > 0 ? `${r.sponsor} acrescentado` : "Nada a acrescentar",
        description: partes.join(" · ") || "As peças selecionadas já tinham este patrocinador.",
        // Recusa do servidor é falha; "nada a acrescentar" (todas já tinham)
        // é aviso — não aconteceu, mas nada quebrou.
        variant: r?.vinculadas > 0 ? "success" : recusadas.length > 0 ? "destructive" : "warning",
      });
      // MAIS DE 3 RECUSADAS não cabem num toast: abre o resultado completo,
      // peça por peça com o motivo — o "…" escondia exatamente o que a pessoa
      // precisava para agir.
      if (recusadas.length > 3) {
        setResultadoDoLote({ titulo: `${r?.sponsor ?? "Patrocinador"} — ${recusadas.length} peças recusadas`, recusadas });
      }
    },
    onError: (error: Error) => toast({ title: "Erro ao acrescentar", description: error.message, variant: "destructive" }),
  });

  /** Abre o diálogo do Acrescentar com a seleção de agora, congelada. */
  const abrirAcrescentar = () => { setAcrescentarSponsorId(null); setBuscaAcrescentar(""); setAcrescentarAlvo(Array.from(selectedItemIds)); setAcrescentarAberto(true); };

  const confirmarAcrescentar = () => {
    if (!acrescentarSponsorId || acrescentarAlvo.length === 0) return;
    acrescentarSponsorMutation.mutate({ sponsorId: acrescentarSponsorId, itemIds: acrescentarAlvo });
  };

  return {
    acrescentarAberto, setAcrescentarAberto, acrescentarSponsorId, setAcrescentarSponsorId,
    buscaAcrescentar, setBuscaAcrescentar, acrescentarAlvo, abrirAcrescentar, confirmarAcrescentar,
    acrescentarSponsorMutation,
  };
}
