// ─────────────────────────────────────────────────────────────────────────────
// AS AÇÕES DO MOLDE NA GRÁFICA (dono, 22/09): "na Gráfica ele vai ter apenas o
// status de Produzido; claro, depois de ser liberado. O fluxo dele morre no
// Produzido."
//
// Uma ação só — "Marcar como produzido" — no molde liberado. Sem impressora,
// sem "Em Impressão", sem quantidade parcial: marca a peça inteira. Depois de
// produzido, o molde está CONCLUÍDO (sem conferir, embalar, tubo, etiqueta nem
// entregar); sobra só o "Voltar para liberado" para desfazer um clique errado.
// A regra (quem pode o quê) mora em shared/molde.ts — este componente só a
// desenha. Grafica.tsx troca o trilho inteiro de ações por este na linha do molde.
// ─────────────────────────────────────────────────────────────────────────────
import { useMutation } from "@tanstack/react-query";
import { Check, Undo2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { motivoAcaoBloqueada, type EventoFinalizadoMotivo } from "@/lib/status";
import { gestoDoMolde } from "@shared/molde";
import { pecaTravada, fraseDaTrava } from "@shared/trava-da-peca";

export function AcoesDoMolde({ item, podeProduzir, selo, cartao }: {
  item: any;
  /** grafica | admin — os mesmos papéis de quem imprime. */
  podeProduzir: boolean;
  /** Evento finalizado: o botão fica, desabilitado, com o motivo. */
  selo?: { motivo: EventoFinalizadoMotivo } | null;
  /** Cartão do celular/tablet: botão largo, de dedo. */
  cartao?: boolean;
}) {
  const { toast } = useToast();
  const gesto = gestoDoMolde(item);
  const mutacao = useMutation({
    mutationFn: async (acao: "produzir" | "desfazer") =>
      apiRequest("PATCH", `/api/items/${item.id}/${acao === "produzir" ? "molde-produzido" : "molde-voltar-liberado"}`, {}),
    onSuccess: (_r, acao) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast(acao === "produzir"
        ? { title: `${item.displayId} produzido`, description: "Molde concluído — o fluxo dele termina aqui (sem conferência nem entrega)." }
        : { title: `${item.displayId} voltou para liberado`, description: "O molde está de novo na fila da Gráfica." });
    },
    onError: (e) => toast({ title: "Não foi possível mudar o molde", description: parseApiError(e).message, variant: "destructive" }),
  });

  if (!podeProduzir || !gesto) {
    // Nada a fazer aqui: diz o que é, em vez de uma linha muda.
    return gesto === null && item?.status && ["produced", "produzido"].includes(item.status) ? (
      <span data-testid={`molde-concluido-${item.id}`} style={{ fontSize: 13, color: "#15803d", display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 600 }}>
        <Check aria-hidden="true" style={{ width: 13, height: 13 }} /> Produzido
      </span>
    ) : null;
  }

  const ocupado = mutacao.isPending;
  if (gesto === "produzir") {
    // Travada pela Solicitação: o botão fica, desabilitado, com o motivo.
    const travada = pecaTravada(item);
    const bloqueado = !!selo || ocupado || travada;
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (!bloqueado) mutacao.mutate("produzir"); }}
        disabled={bloqueado}
        data-testid={`button-molde-produzido-${item.id}`}
        title={travada ? fraseDaTrava(item) : selo ? motivoAcaoBloqueada(selo.motivo, "marcar como produzido") : "Molde: marca a peça inteira como produzida — sem impressora. É o fim do fluxo dele."}
        style={{
          ...(cartao ? { flex: "2 1 150px", minHeight: 48, fontSize: 14, fontWeight: 800 } : { height: 32, fontSize: 12, fontWeight: 700 }),
          padding: "0 12px", borderRadius: 8, whiteSpace: "nowrap",
          backgroundColor: selo ? "#f5f5f4" : "#1c1917", color: selo ? "#78716c" : "#ffffff",
          border: selo ? "1px solid #e7e5e4" : "none",
          cursor: bloqueado ? "not-allowed" : "pointer", opacity: ocupado ? 0.7 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
        }}
      >
        <Check aria-hidden="true" style={{ width: 13, height: 13 }} />
        {ocupado ? "Marcando…" : "Marcar como produzido"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!ocupado && !selo) mutacao.mutate("desfazer"); }}
      disabled={ocupado || !!selo}
      data-testid={`button-molde-voltar-${item.id}`}
      title={selo ? motivoAcaoBloqueada(selo.motivo, "desfazer o produzido") : "Desfaz o \"produzido\" — o molde volta para liberado, na fila da Gráfica"}
      style={{
        ...(cartao ? { flex: "1 1 120px", minHeight: 44, fontSize: 13 } : { height: 32, fontSize: 12 }),
        padding: "0 10px", borderRadius: 8, fontWeight: 700, whiteSpace: "nowrap",
        backgroundColor: "#ffffff", color: "#44403c", border: "1px solid #d6d3d1",
        cursor: ocupado || selo ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
      }}
    >
      <Undo2 aria-hidden="true" style={{ width: 13, height: 13 }} />
      {ocupado ? "Voltando…" : "Voltar para liberado"}
    </button>
  );
}
