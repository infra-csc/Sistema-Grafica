// ─────────────────────────────────────────────────────────────────────────────
// TRAVAR A PEÇA (Solicitação e admin): motivo obrigatório, com atalhos. A
// Gráfica lê o motivo no selo e no title dos botões e não consegue fazer a peça
// andar até alguém destravar. A regra mora em shared/trava-da-peca.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { invalidarGraficaEMaquinas } from "@/lib/tempo-real-grafica";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import { FS, FW, N, R, T, TOM } from "@/lib/theme";
import { pecaTravada, fraseDaTrava, lerMotivo, SUGESTOES_DE_MOTIVO, MOTIVO_MINIMO } from "@shared/trava-da-peca";
import type { PecaDaFila } from "@/components/grafica/tipos";
import { apiErrorMessage } from "@/components/grafica/fila/regras";
import { TravaDaPeca } from "@/components/grafica/fila/trava-da-peca";

export type TravaDaFila = ReturnType<typeof useTravaDaPeca>;

export function useTravaDaPeca(podeMexerNaTrava: (item: PecaDaFila) => boolean) {
  const { toast } = useToast();
  const [travandoItem, setTravandoItem] = useState<PecaDaFila | null>(null);
  const [motivoDaTrava, setMotivoDaTrava] = useState("");
  const travarMutation = useMutation({
    mutationFn: async ({ itemId, motivo }: { itemId: string; motivo: string; displayId?: string }) =>
      await apiRequest("POST", `/api/items/${itemId}/travar`, { motivo }),
    onSuccess: (_r, v) => {
      invalidarGraficaEMaquinas();
      setTravandoItem(null); setMotivoDaTrava("");
      toast({ title: `${v.displayId ?? "Peça"} travada`, description: `A Gráfica vê o motivo e não consegue fazê-la andar até alguém destravar: ${v.motivo}` });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível travar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  const destravarMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string; displayId?: string }) =>
      await apiRequest("POST", `/api/items/${itemId}/destravar`, {}),
    onSuccess: (_r, v) => {
      invalidarGraficaEMaquinas();
      toast({ title: `${v.displayId ?? "Peça"} destravada`, description: "A Gráfica já pode seguir com ela." });
    },
    onError: (error: Error) => {
      invalidarGraficaEMaquinas();
      toast({ title: "Não foi possível destravar", description: apiErrorMessage(error), variant: "destructive" });
    },
  });
  /** A porta de toda ação que faz a peça andar: travada, avisa e não abre. */
  const avisarTravada = (item: PecaDaFila): boolean => {
    if (!pecaTravada(item)) return false;
    toast({ title: `${item.displayId ?? "Peça"} está travada`, description: fraseDaTrava(item), variant: "warning" });
    return true;
  };
  const travaDaLinha = (item: PecaDaFila, fonte: number, alvo: number) => (
    <TravaDaPeca
      item={item} fonte={fonte} alvo={alvo} podeMexer={podeMexerNaTrava(item)}
      onTravar={() => { setMotivoDaTrava(""); setTravandoItem(item); }}
      onDestravar={() => destravarMutation.mutate({ itemId: item.id, displayId: item.displayId })}
      destravando={destravarMutation.isPending && destravarMutation.variables?.itemId === item.id}
    />
  );
  return { travandoItem, setTravandoItem, motivoDaTrava, setMotivoDaTrava, travarMutation, destravarMutation, avisarTravada, travaDaLinha };
}

export function ModalTravar({ trava, isMobile, ponteiroGrosso }: { trava: TravaDaFila; isMobile: boolean; ponteiroGrosso: boolean }) {
  const { travandoItem, setTravandoItem, motivoDaTrava, setMotivoDaTrava, travarMutation } = trava;
  return (
    <Dialog open={!!travandoItem} onOpenChange={(o) => { if (!o) { setTravandoItem(null); setMotivoDaTrava(""); } }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)} data-testid="modal-travar">
        <DialogTitle className="sr-only">Travar peça</DialogTitle>
        <DialogDescription className="sr-only">Diga o motivo — a Gráfica não consegue fazer a peça andar até alguém destravar</DialogDescription>
        <ModalHeader icon={Lock} tint={TOM.perigo.text} title={`Travar ${travandoItem?.displayId ?? "peça"}`} subtitle="A Gráfica vê o motivo e não consegue fazer a peça andar até alguém da Solicitação destravar" onClose={() => { setTravandoItem(null); setMotivoDaTrava(""); }} />
        {travandoItem && (() => {
          const lido = lerMotivo(motivoDaTrava);
          const pode = lido.ok && !travarMutation.isPending;
          const enviar = () => { if (lido.ok && !travarMutation.isPending) travarMutation.mutate({ itemId: travandoItem.id, motivo: lido.motivo, displayId: travandoItem.displayId }); };
          return (
            <>
            <div style={{ padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
              <p style={{ margin: 0, fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio }}>Motivos comuns</p>
              <div role="group" aria-label="Motivos comuns" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {SUGESTOES_DE_MOTIVO.map((s) => (
                  <button key={s} type="button" className="ds-botao" onClick={() => setMotivoDaTrava(s)} data-testid={`chip-motivo-${s}`} aria-pressed={motivoDaTrava === s} style={{ minHeight: alvoDeToque(32, isMobile || ponteiroGrosso), padding: "0 12px", borderRadius: R.pill, border: `1px solid ${motivoDaTrava === s ? TOM.perigo.text : T.bdark}`, background: motivoDaTrava === s ? TOM.perigo.bg : T.surface, color: TOM.perigo.text, fontSize: isMobile ? 13 : 12, fontWeight: 700, cursor: "pointer" }}>{s}</button>
                ))}
              </div>
              <label htmlFor="input-motivo-trava" style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.apoio, marginTop: 2 }}>Motivo <span style={{ fontWeight: FW.corpo, color: T.second }}>· a Gráfica lê esta frase</span></label>
              <textarea
                id="input-motivo-trava"
                value={motivoDaTrava}
                onChange={(e) => setMotivoDaTrava(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Ex.: a arte vai mudar — segurar a impressão"
                data-testid="input-motivo-trava"
                className="grf-campo"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: R.md, border: `1px solid ${T.bdark}`, backgroundColor: T.surface, color: T.text, fontSize: isMobile ? 16 : 13, lineHeight: 1.5, fontFamily: "inherit", resize: "vertical" }}
              />
              {!lido.ok && motivoDaTrava.trim().length > 0 && (
                <div role="status" data-testid="aviso-motivo-trava" style={{ fontSize: 12, color: TOM.alerta.text }}>Pelo menos {MOTIVO_MINIMO} letras — é o que a Gráfica vai ler.</div>
              )}
            </div>
              <div style={{ flexShrink: 0, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", paddingTop: 12, paddingLeft: isMobile ? 16 : 24, paddingRight: isMobile ? 16 : 24, paddingBottom: "calc(12px + env(safe-area-inset-bottom))", borderTop: `1px solid ${N.n3}`, backgroundColor: T.bg }}>
                <Botao tamanho={isMobile || ponteiroGrosso ? "toque" : "md"} onClick={() => { setTravandoItem(null); setMotivoDaTrava(""); }} style={{ flex: isMobile ? 1 : undefined }}>Cancelar</Botao>
                {/* Travar é destrutivo para o fluxo (a peça para): perigo. */}
                <Botao variante="perigo" tamanho={isMobile || ponteiroGrosso ? "toque" : "md"} icone={Lock} carregando={travarMutation.isPending} onClick={enviar} disabled={!pode} data-testid="button-confirmar-trava" style={{ flex: isMobile ? 2 : undefined }}>
                  {travarMutation.isPending ? "Travando…" : "Travar peça"}
                </Botao>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
