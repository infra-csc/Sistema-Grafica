// ─────────────────────────────────────────────────────────────────────────────
// REABRIR A PEÇA ENTREGUE PARA A REVISÃO — só o ADM (dono, 13/10).
//
// Fica na ficha da peça, não na linha: é correção rara e destrutiva. Zera
// impressão, conferência, embalagem e entrega, tira a peça dos volumes e vale
// também em evento realizado. O motivo é obrigatório como em toda devolução.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { FS, R, T, TOM } from "@/lib/theme";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { apiErrorMessage, MOTIVO_MIN_DEVOLUCAO } from "@/components/grafica/fila/regras";

export const podeReabrirEntregue = (item: PecaDaFila | null | undefined, role: string | undefined) =>
  role === "admin" && (item?.status === "delivered" || item?.status === "entregue");

export function ReabrirEntregueParaRevisao({ item, onReaberta }: { item: PecaDaFila; onReaberta: () => void }) {
  const { toast } = useToast();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const n = motivo.trim().replace(/\s+/g, " ").length;
  const mutation = useMutation({
    mutationFn: async () => await apiRequest("POST", `/api/items/${item.id}/reabrir-para-revisao`, { notes: motivo }),
    onSuccess: () => {
      invalidarGraficaEMaquinas();
      setAberto(false);
      setMotivo("");
      onReaberta();
      toast({ title: "Peça reaberta para a Revisão Final", description: "Produção e entrega foram zeradas; o histórico guarda os valores anteriores." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível reabrir", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  const fechar = () => { if (!mutation.isPending) { setAberto(false); setMotivo(""); } };

  return (
    <>
      <Botao variante="perigoSecundario" icone={RotateCcw} onClick={() => setAberto(true)} data-testid="button-reabrir-entregue">
        Voltar para a Revisão
      </Botao>
      <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
        <DialogContent style={{ maxWidth: 480 }}>
          <DialogTitle>Voltar {item.displayId} para a Revisão Final</DialogTitle>
          <DialogDescription>
            A peça sai de Entregue e volta para Aguardando Revisão Final para ser produzida de novo. Impressas, conferidas,
            embaladas e entregues voltam a zero e a peça sai dos tubos. Os valores anteriores ficam no histórico.
          </DialogDescription>
          <label htmlFor="textarea-reabrir-motivo" style={{ fontSize: FS.small, color: T.apoio }}>Motivo</label>
          <textarea
            id="textarea-reabrir-motivo"
            data-testid="textarea-reabrir-motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ex.: arte com patrocinador errado, precisa reimprimir"
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 16, fontFamily: "inherit", color: T.text, backgroundColor: T.surface, border: `1px solid ${T.bdark}`, borderRadius: R.md, resize: "vertical" }}
          />
          <p aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 5, margin: 0, fontSize: FS.small, color: n >= MOTIVO_MIN_DEVOLUCAO ? TOM.sucesso.text : T.second }}>
            {n >= MOTIVO_MIN_DEVOLUCAO && <Check aria-hidden="true" style={{ width: 12, height: 12 }} />}
            Mínimo de {MOTIVO_MIN_DEVOLUCAO} caracteres — {Math.min(n, 999)}/{MOTIVO_MIN_DEVOLUCAO}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            <Botao onClick={fechar} disabled={mutation.isPending}>Cancelar</Botao>
            <Botao variante="perigo" icone={RotateCcw} carregando={mutation.isPending} disabled={n < MOTIVO_MIN_DEVOLUCAO}
              onClick={() => mutation.mutate()} data-testid="button-confirmar-reabrir-entregue">
              Zerar e voltar para a Revisão
            </Botao>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
