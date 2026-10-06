// ─────────────────────────────────────────────────────────────────────────────
// ENVIAR DIRETO PARA A GRÁFICA — a chamada e o que a tela faz depois (dono,
// 02/10: "da solicitação direto para a gráfica"). Uma peça vai pela rota por
// peça (aceita arquivo); várias, pela rota de lote (instrução comum). As
// regras de quem/quando: shared/producao-interna.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export type PedidoDeEnvioDireto = {
  itemIds: string[];
  /** Vazio = vale a instrução que cada peça já tem. */
  instrucoes?: string;
  /** Só no envio de UMA peça: o caminho de rede ou o arquivo subido (/objects/…). */
  arquivo?: { url: string; nome?: string | null } | null;
};

export type ResultadoDoEnvioDireto = {
  enviadas: Array<{ id: string; displayId: string }>;
  ficaramDeFora: Array<{ id: string; displayId: string; motivo: string }>;
};

/** A chamada pura — a rota certa para 1 ou N peças, com a resposta no mesmo formato. */
export async function enviarDiretoParaGrafica(pedido: PedidoDeEnvioDireto): Promise<ResultadoDoEnvioDireto> {
  const instrucoes = pedido.instrucoes?.trim() ? pedido.instrucoes.trim() : undefined;
  if (pedido.itemIds.length === 1) {
    const corpo = {
      ...(instrucoes ? { instrucoes } : {}),
      ...(pedido.arquivo?.url ? { finalFileUrl: pedido.arquivo.url, finalFileName: pedido.arquivo.nome ?? undefined } : {}),
    };
    const res = await apiRequest<{ id: string; displayId: string }>("POST", `/api/items/${pedido.itemIds[0]}/direto-para-grafica`, corpo);
    const peca = await res.json();
    return { enviadas: [{ id: peca.id, displayId: peca.displayId }], ficaramDeFora: [] };
  }
  const res = await apiRequest<ResultadoDoEnvioDireto>("POST", "/api/items/direto-para-grafica", {
    itemIds: pedido.itemIds,
    ...(instrucoes ? { instrucoes } : {}),
  });
  const r = await res.json();
  return { enviadas: r.enviadas ?? [], ficaramDeFora: r.ficaramDeFora ?? [] };
}

/**
 * A mutação com o fim de tela padrão: invalida as listas (o evento e o acervo
 * — a Gráfica lê o acervo) e diz o resultado num toast. As que ficaram de
 * fora são NOMEADAS, com o motivo, num aviso (não erro: as outras foram).
 */
export function useEnviarDiretoParaGrafica({ eventId, aoConcluir }: { eventId?: string; aoConcluir?: (r: ResultadoDoEnvioDireto) => void } = {}) {
  const { toast } = useToast();
  return useMutation({
    mutationFn: enviarDiretoParaGrafica,
    onSuccess: (r) => {
      if (eventId) queryClient.invalidateQueries({ queryKey: ["/api/items", eventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      const n = r.enviadas.length;
      const fora = r.ficaramDeFora;
      const nomes = r.enviadas.map((p) => p.displayId).join(", ");
      toast({
        variant: fora.length > 0 ? "warning" : "success",
        title: fora.length > 0
          ? `${n} de ${n + fora.length} peças enviadas direto para a Gráfica`
          : n === 1 ? "Peça enviada direto para a Gráfica" : `${n} peças enviadas direto para a Gráfica`,
        description: `${nomes} ${n === 1 ? "está" : "estão"} em Pronto para Produção, na fila da Gráfica, com o selo Produção interna.`
          + (fora.length > 0 ? ` Ficaram de fora: ${fora.map((f) => `${f.displayId} (${f.motivo})`).join("; ")}.` : ""),
      });
      aoConcluir?.(r);
    },
  });
}
