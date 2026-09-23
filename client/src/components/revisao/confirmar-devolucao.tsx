// A confirmação de DEVOLVER para a Arte a peça aberta na ficha: para onde ela
// volta (ou o aviso do molde, que volta sempre ao começo) e o motivo.
import { RotateCcw } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { ehMolde } from "@shared/molde";
import { T, N, FS, R } from "@/lib/theme";
import { CAMPO_DO_MOTIVO, CORPO_DA_CONFIRMACAO, RODAPE_DA_CONFIRMACAO, TEXTO_DA_CONFIRMACAO } from "./estilos";
import { avisoMotivoCurto, motivoCurto } from "./regras";
import { ContadorDoMotivo, SeletorDeDestino } from "./motivo-da-devolucao";
import type { DestinoDaDevolucao, PecaDaRevisao } from "./tipos";

export function ConfirmarDevolucao({
  open, onOpenChange, dedo, fonteDeCampo, selectedItem, destino, aoEscolherDestino,
  motivo, setMotivo, devolvendo, aoDevolver,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dedo: boolean;
  fonteDeCampo: number;
  selectedItem: PecaDaRevisao | null;
  destino: DestinoDaDevolucao;
  aoEscolherDestino: (d: DestinoDaDevolucao) => void;
  motivo: string;
  setMotivo: (v: string) => void;
  devolvendo: boolean;
  aoDevolver: (pedido: { itemId: string; notes: string; destino: string }) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)}>
        {/* POR QUE congelar aqui: o onSuccess da devolução fecha este diálogo,
            zera `selectedItem` (o ID na descrição) e ainda esvazia o motivo —
            o texto que a pessoa acabou de escrever sumiria do textarea à vista,
            no meio do fade. */}
        <FreezeWhileClosing open={open}>
        <ModalHeader variant="confirm" icon={RotateCcw} tint={T.text} title="Devolver para Arte" onClose={() => onOpenChange(false)} />
        <AlertDialogTitle className="sr-only">Devolver para Arte</AlertDialogTitle>
        <div style={CORPO_DA_CONFIRMACAO}>
          <AlertDialogDescription asChild>
            <div style={{ ...TEXTO_DA_CONFIRMACAO, marginBottom: 12 }}>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> sai da Revisão Final e volta para a Arte. Quem recebe é a Arte: ela é avisada com o motivo que você escrever abaixo.</span>}
            </div>
          </AlertDialogDescription>
          {ehMolde(selectedItem) ? (
            <p data-testid="aviso-devolucao-molde" style={{ margin: "0 0 12px", fontSize: FS.meta, lineHeight: 1.5, color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: R.md, padding: "8px 12px" }}>
              Molde não tem Finalização: ele volta para o começo da Arte, <strong>com o thumb</strong>, que a Arte corrige e reenvia.
            </p>
          ) : <SeletorDeDestino destino={destino} aoEscolher={aoEscolherDestino} />}
          <textarea
            placeholder="Descreva as alterações necessárias..."
            aria-label="Motivo da devolução para a Arte"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            data-testid="textarea-return-quick"
            className="placeholder:text-muted-foreground"
            style={{ ...CAMPO_DO_MOTIVO, fontSize: fonteDeCampo }}
          />
          <ContadorDoMotivo texto={motivo} />
        </div>
        <div style={RODAPE_DA_CONFIRMACAO}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo ? "toque" : "md"} data-testid="button-return-cancel" onClick={() => { setMotivo(""); }}>Cancelar</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={RotateCcw}
              onClick={() => selectedItem && aoDevolver({ itemId: selectedItem.id, notes: motivo, destino: ehMolde(selectedItem) ? "arte" : destino })}
              disabled={devolvendo || motivoCurto(motivo)}
              title={motivoCurto(motivo) ? avisoMotivoCurto : undefined}
              data-testid="button-return-confirm"
            >
              {devolvendo ? "Devolvendo..." : "Devolver para Arte"}
            </Botao>
          </AlertDialogPrimitive.Action>
        </div>
        </FreezeWhileClosing>
      </AlertDialogContent>
    </AlertDialog>
  );
}
