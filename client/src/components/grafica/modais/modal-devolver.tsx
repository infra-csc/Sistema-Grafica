// ─────────────────────────────────────────────────────────────────────────────
// DEVOLVER PARA A REVISÃO.
//
// O operador abre o arquivo na hora de imprimir e vê que está errado. Sem esta
// saída ele teria duas ruins: imprimir mesmo assim, ou deixar a peça parada na
// fila — onde ela continuaria contando como "Pronto para Produção" para o resto
// do app, inclusive para a Gestão de Prazos, que a cobraria da Gráfica sem que
// ninguém soubesse que ela estava travada. O motivo é obrigatório pela mesma
// régua das outras devoluções: quem recebe a peça de volta precisa saber o que
// refazer, senão é ida e volta garantida.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { FS, FW, N, R, T, TOM } from "@/lib/theme";
// Teclado virtual: o modal sobe junto com ele (ver o arquivo).
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { apiErrorMessage, MOTIVO_MIN_DEVOLUCAO } from "@/components/grafica/fila/regras";

export type DevolucaoParaRevisao = ReturnType<typeof useDevolverParaRevisao>;

export function useDevolverParaRevisao(isMobile: boolean) {
  const { toast } = useToast();
  const [devolverItem, setDevolverItem] = useState<PecaDaFila | null>(null);
  const [devolverMotivo, setDevolverMotivo] = useState("");
  const devolverMutation = useMutation({
    mutationFn: async ({ itemId, notes }: { itemId: string; notes: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/return-to-review`, { notes }),
    onSuccess: () => {
      invalidarGraficaEMaquinas();
      setDevolverItem(null);
      setDevolverMotivo("");
      toast({ title: "Devolvida para a Revisão Final", description: "A peça saiu da fila da Gráfica e o motivo foi registrado." });
    },
    // Recusa típica: a peça já entrou em produção por outra pessoa. A fila
    // recarrega para o botão Devolver sumir de onde ele não vale mais.
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível devolver", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  // No celular, com o teclado virtual aberto, o modal encolhe para a área
  // visível — o rodapé com o Confirmar fica logo acima do teclado.
  const modalDevolverRef = useRef<HTMLDivElement>(null);
  useAcompanharAreaVisivel(modalDevolverRef, "centro", isMobile && !!devolverItem);
  return { devolverItem, setDevolverItem, devolverMotivo, setDevolverMotivo, devolverMutation, modalDevolverRef };
}

export function ModalDevolver({ devolucao, isMobile, padModal, fsMin }: {
  devolucao: DevolucaoParaRevisao;
  isMobile: boolean;
  /** Margem interna do corpo dos modais (16 no celular, 24 no resto). */
  padModal: number;
  fsMin: (n: number) => number;
}) {
  const { devolverItem, setDevolverItem, devolverMotivo, setDevolverMotivo, devolverMutation, modalDevolverRef } = devolucao;
  return (
    <Dialog open={!!devolverItem} onOpenChange={o => { if (!o) { setDevolverItem(null); setDevolverMotivo(""); } }}>
      <DialogContent ref={modalDevolverRef} className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">Devolver peça para a Revisão Final</DialogTitle>
        <ModalHeader
          variant="confirm"
          icon={Undo2}
          tint={TOM.perigo.text}
          title="Devolver para a Revisão Final"
          subtitle={devolverItem ? `${devolverItem.displayId} · ${devolverItem.type ?? ""}` : undefined}
          onClose={() => { setDevolverItem(null); setDevolverMotivo(""); }}
        />
        <div style={{ padding: `18px ${padModal}px`, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <p style={{ fontSize: 13, color: T.apoio, lineHeight: 1.6, margin: "0 0 14px" }}>
            A peça sai da fila da Gráfica e volta para <strong style={{ color: T.text }}>Aguardando Revisão Final</strong>. Nada foi produzido, então não há material a estornar.
          </p>
          <label htmlFor="textarea-devolver-motivo" style={{ display: "block", fontSize: fsMin(FS.small), fontWeight: FW.forte, color: T.apoio, marginBottom: 6 }}>
            Motivo da devolução
          </label>
          <textarea
            value={devolverMotivo}
            onChange={e => setDevolverMotivo(e.target.value)}
            placeholder="O que está errado? Ex.: arquivo em baixa resolução, medida diferente do pedido..."
            rows={3}
            id="textarea-devolver-motivo"
            data-testid="textarea-devolver-revisao-motivo"
            style={{
              width: "100%", minHeight: 80, boxSizing: "border-box", padding: "10px 12px",
              fontSize: isMobile ? 16 : 13, fontFamily: "inherit", color: T.text,
              backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md,
              resize: "vertical", outlineOffset: 2,
            }}
          />
          {/* O mínimo aparece SEMPRE, não só depois de errar: botão
              desabilitado sem explicação é o que faz a pessoa achar que o
              app travou. */}
          <p style={{ fontSize: fsMin(FS.small), color: T.second, margin: "6px 0 0" }}>
            Mínimo de {MOTIVO_MIN_DEVOLUCAO} caracteres — {devolverMotivo.trim().replace(/\s+/g, " ").length}/{MOTIVO_MIN_DEVOLUCAO}
          </p>
        </div>
        {/* Rodapé fora do corpo rolável (flexShrink 0) e com o recorte
            seguro; no celular os dois botões dividem a largura — com
            "Devolver para a Revisão Final" por extenso, a fileira alinhada à
            direita passava de 360px e empurrava o botão para fora. */}
        <div style={{ flexShrink: 0, paddingTop: 12, paddingLeft: padModal, paddingRight: padModal, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid ${N.n3}`, backgroundColor: T.bg, display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          <Botao tamanho={isMobile ? "toque" : "md"} onClick={() => { setDevolverItem(null); setDevolverMotivo(""); }}
            style={{ flex: isMobile ? "1 1 auto" : undefined, minHeight: isMobile ? 48 : undefined }}>
            Cancelar
          </Botao>
          {/* Contorno vermelho, não preenchido: devolver tira o trabalho da
              mão de alguém, e botão vermelho cheio convida ao clique reflexo.
              O motivo do desabilitado é a contagem logo acima, sempre à vista. */}
          <Botao
            tamanho={isMobile ? "toque" : "md"}
            icone={Undo2}
            carregando={devolverMutation.isPending}
            onClick={() => devolverItem && devolverMutation.mutate({ itemId: devolverItem.id, notes: devolverMotivo })}
            disabled={devolverMotivo.trim().replace(/\s+/g, " ").length < MOTIVO_MIN_DEVOLUCAO}
            data-testid="button-confirmar-devolver-revisao"
            style={{ flex: isMobile ? "2 1 auto" : undefined, minHeight: isMobile ? 48 : undefined, color: TOM.perigo.text, border: `1.5px solid ${TOM.perigo.text}` }}
          >
            {isMobile ? "Devolver à Revisão" : "Devolver para a Revisão Final"}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
