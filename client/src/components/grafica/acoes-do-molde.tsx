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
import { usePonteiroGrosso } from "@/hooks/use-mobile";
import { parseApiError } from "@/components/aumentar-quantidade-dialog";
import { motivoAcaoBloqueada, type EventoFinalizadoMotivo } from "@/lib/status";
import { gestoDoMolde } from "@shared/molde";
import { pecaTravada, fraseDaTrava } from "@shared/trava-da-peca";
import { SeloPrazoMolde } from "@/components/prazo-do-molde";
import { Botao } from "@/components/ui/botao";
import { TOM, FS, FW } from "@/lib/theme";

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
  // Tablet do galpão é dedo em qualquer largura: o alvo segue o ponteiro.
  const grosso = usePonteiroGrosso();
  const tamanho = cartao || grosso ? "toque" : "sm";
  const gesto = gestoDoMolde(item);
  const mutacao = useMutation({
    mutationFn: async (acao: "produzir" | "desfazer") =>
      apiRequest("PATCH", `/api/items/${item.id}/${acao === "produzir" ? "molde-produzido" : "molde-voltar-liberado"}`, {}),
    onSuccess: (_r, acao) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast(acao === "produzir"
        ? { title: `${item.displayId} produzido`, description: "Molde concluído — o fluxo dele termina aqui (sem conferência nem entrega).", variant: "success" }
        : { title: `${item.displayId} voltou para liberado`, description: "O molde está de novo na fila da Gráfica.", variant: "success" });
    },
    onError: (e) => toast({ title: "Não foi possível mudar o molde", description: parseApiError(e).message, variant: "destructive" }),
  });

  if (!podeProduzir || !gesto) {
    // Nada a fazer aqui: diz o que é, em vez de uma linha muda.
    return gesto === null && item?.status && ["produced", "produzido"].includes(item.status) ? (
      <span data-testid={`molde-concluido-${item.id}`} style={{ fontSize: FS.body, color: TOM.sucesso.text, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: FW.medio }}>
        <Check aria-hidden="true" style={{ width: 13, height: 13 }} /> Produzido
      </span>
    ) : null;
  }

  const ocupado = mutacao.isPending;
  if (gesto === "produzir") {
    // Travada pela Solicitação: o botão fica, desabilitado, com o motivo.
    const travada = pecaTravada(item);
    const bloqueado = !!selo || ocupado || travada;
    const motivo = travada ? fraseDaTrava(item) : selo ? motivoAcaoBloqueada(selo.motivo, "marcar como produzido") : undefined;
    return (
      <>
      <Botao
        variante="primario"
        tamanho={tamanho}
        icone={Check}
        carregando={ocupado}
        onClick={(e) => { e.stopPropagation(); if (!bloqueado) mutacao.mutate("produzir"); }}
        disabled={bloqueado}
        // O porquê fica VISÍVEL embaixo do botão: no dedo não existe `title`.
        motivo={motivo}
        data-testid={`button-molde-produzido-${item.id}`}
        title={travada ? fraseDaTrava(item) : selo ? motivoAcaoBloqueada(selo.motivo, "marcar como produzido") : "Molde: marca a peça inteira como produzida — sem impressora. É o fim do fluxo dele."}
        style={cartao ? { flex: "2 1 150px", minHeight: 48 } : undefined}
      >
        {ocupado ? "Marcando…" : "Marcar como produzido"}
      </Botao>
      {/* PRAZO DO MOLDE (22/09): ao lado do único gesto que falta a ele. */}
      <SeloPrazoMolde item={item} />
      </>
    );
  }
  return (
    <Botao
      variante="secundario"
      tamanho={tamanho}
      icone={Undo2}
      carregando={ocupado}
      onClick={(e) => { e.stopPropagation(); if (!ocupado && !selo) mutacao.mutate("desfazer"); }}
      disabled={ocupado || !!selo}
      motivo={selo ? motivoAcaoBloqueada(selo.motivo, "desfazer o produzido") : undefined}
      data-testid={`button-molde-voltar-${item.id}`}
      title={selo ? motivoAcaoBloqueada(selo.motivo, "desfazer o produzido") : "Desfaz o \"produzido\" — o molde volta para liberado, na fila da Gráfica"}
      style={cartao ? { flex: "1 1 120px" } : undefined}
    >
      {ocupado ? "Voltando…" : "Voltar para liberado"}
    </Botao>
  );
}
