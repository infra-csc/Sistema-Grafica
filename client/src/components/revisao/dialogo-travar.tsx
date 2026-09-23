// Travar pela ficha: motivo obrigatório, com os mesmos atalhos de motivo da
// Gráfica. Travada, a peça pode ser liberada mas não anda lá até alguém da
// Solicitação destravar.
import { Lock } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { alvo } from "@/hooks/use-mobile";
import { lerMotivo, SUGESTOES_DE_MOTIVO, MOTIVO_MINIMO } from "@shared/trava-da-peca";
import { T, TOM, FS, R } from "@/lib/theme";
import { CAMPO_DO_MOTIVO, RODAPE_DA_CONFIRMACAO } from "./estilos";
import type { PecaDaRevisao } from "./tipos";

export function DialogoTravar({
  travandoItem, motivoDaTrava, setMotivoDaTrava, dedo, fonteDeCampo, travando, aoFechar, aoTravar,
}: {
  travandoItem: PecaDaRevisao | null;
  motivoDaTrava: string;
  setMotivoDaTrava: (v: string) => void;
  dedo: boolean;
  fonteDeCampo: number;
  travando: boolean;
  /** Fecha e limpa o motivo. */
  aoFechar: () => void;
  aoTravar: (pedido: { itemId: string; motivo: string; displayId?: string }) => void;
}) {
  const motivoDaTravaLido = lerMotivo(motivoDaTrava);
  return (
    <Dialog open={!!travandoItem} onOpenChange={o => { if (!o && !travando) aoFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
        <FreezeWhileClosing open={!!travandoItem}>
        <DialogTitle className="sr-only">Travar peça</DialogTitle>
        <DialogDescription className="sr-only">Diga o motivo da trava — é o que a Gráfica vai ler</DialogDescription>
        <ModalHeader
          variant="confirm"
          icon={Lock}
          tint={TOM.perigo.text}
          title="Travar peça"
          subtitle={travandoItem ? `${travandoItem.displayId ?? ""} · ${travandoItem.type ?? ""}` : undefined}
          onClose={() => { if (!travando) aoFechar(); }}
        />
        <div style={{ padding: "16px 24px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ margin: 0, fontSize: FS.body, lineHeight: 1.5, color: T.strong }}>
            Travada, a peça pode ser liberada, mas não anda na Gráfica (imprimir, conferir, embalar) até alguém da Solicitação destravar.
          </p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {SUGESTOES_DE_MOTIVO.map((sug) => (
              <button
                key={sug}
                type="button"
                onClick={() => setMotivoDaTrava(sug)}
                aria-pressed={motivoDaTrava === sug}
                style={{ minHeight: alvo(30, dedo), padding: "0 10px", borderRadius: R.pill, border: `1px solid ${T.border}`, background: motivoDaTrava === sug ? TOM.perigo.bg : T.surface, color: T.strong, fontSize: FS.meta, fontWeight: 600, cursor: "pointer" }}
              >
                {sug}
              </button>
            ))}
          </div>
          <textarea
            value={motivoDaTrava}
            onChange={e => setMotivoDaTrava(e.target.value)}
            aria-label="Motivo da trava"
            placeholder="Por que a peça fica travada?"
            data-testid="textarea-motivo-trava-revisao"
            className="placeholder:text-muted-foreground"
            style={{ ...CAMPO_DO_MOTIVO, fontSize: fonteDeCampo }}
          />
          {!motivoDaTravaLido.ok && (
            <p aria-live="polite" style={{ margin: 0, fontSize: FS.meta, color: TOM.alerta.text }}>
              {`Escreva o motivo (pelo menos ${MOTIVO_MINIMO} letras) — é o que a Gráfica vai ler.`}
            </p>
          )}
        </div>
        <div style={RODAPE_DA_CONFIRMACAO}>
          <Botao
            variante="fantasma"
            tamanho={dedo ? "toque" : "md"}
            onClick={aoFechar}
            disabled={travando}
          >
            Cancelar
          </Botao>
          <Botao
            variante="perigo"
            tamanho={dedo ? "toque" : "md"}
            icone={Lock}
            carregando={travando}
            onClick={() => { if (travandoItem && motivoDaTravaLido.ok) aoTravar({ itemId: travandoItem.id, motivo: motivoDaTravaLido.motivo, displayId: travandoItem.displayId }); }}
            disabled={!motivoDaTravaLido.ok || travando}
            data-testid="button-travar-confirm-revisao"
          >
            {travando ? "Travando…" : "Travar"}
          </Botao>
        </div>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
