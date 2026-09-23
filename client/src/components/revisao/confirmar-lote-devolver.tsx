// A confirmação de DEVOLVER EM LOTE: quantas voltam, para onde (os moldes
// voltam sempre ao começo da Arte), o que fica de fora e o motivo.
import { RotateCcw } from "lucide-react";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { T, N, FS, R } from "@/lib/theme";
import { CAMPO_DO_MOTIVO, CORPO_DA_CONFIRMACAO, RODAPE_DA_CONFIRMACAO, TEXTO_DA_CONFIRMACAO } from "./estilos";
import { avisoMotivoCurto, motivoCurto } from "./regras";
import { ContadorDoMotivo, SeletorDeDestino } from "./motivo-da-devolucao";
import type { DestinoDaDevolucao } from "./tipos";
import type { useFilaDaRevisao } from "./use-fila-da-revisao";

type Fila = ReturnType<typeof useFilaDaRevisao>;

export function ConfirmarLoteDevolver({
  open, onOpenChange, dedo, fonteDeCampo, selecaoLote, avisoLoteFinalizadas, moldesNoLote, loteSoDeMoldes,
  destino, aoEscolherDestino, motivo, setMotivo, devolvendo, aoDevolver,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dedo: boolean;
  fonteDeCampo: number;
  selecaoLote: Fila["selecaoLote"];
  avisoLoteFinalizadas: Fila["avisoLoteFinalizadas"];
  moldesNoLote: number;
  loteSoDeMoldes: boolean;
  destino: DestinoDaDevolucao;
  aoEscolherDestino: (d: DestinoDaDevolucao) => void;
  motivo: string;
  setMotivo: (v: string) => void;
  devolvendo: boolean;
  aoDevolver: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(470)}>
        {/* POR QUE congelar aqui: o onSuccess fecha, reescreve a seleção (que
            conta o título) e esvazia o motivo (que é o valor do textarea) no
            mesmo commit — dois campos visíveis apagando durante o fade. */}
        <FreezeWhileClosing open={open}>
        <ModalHeader
          variant="confirm"
          icon={RotateCcw}
          tint={T.text}
          title={`Devolver ${selecaoLote.vivas.length} ${selecaoLote.vivas.length === 1 ? "peça" : "peças"} para a Arte`}
          onClose={() => onOpenChange(false)}
        />
        <AlertDialogTitle className="sr-only">Devolver {selecaoLote.vivas.length} {selecaoLote.vivas.length === 1 ? "peça" : "peças"} para a Arte</AlertDialogTitle>
        <div style={CORPO_DA_CONFIRMACAO}>
          <AlertDialogDescription asChild>
            <div style={{ ...TEXTO_DA_CONFIRMACAO, marginBottom: 12 }}>
              {selecaoLote.vivas.length === 1 ? "A peça sai" : `As ${selecaoLote.vivas.length} peças saem`} da Revisão Final e {selecaoLote.vivas.length === 1 ? "volta" : "voltam"} para a Arte, que é avisada com o motivo escrito abaixo.
              {selecaoLote.finalizadas > 0 && (
                <span data-testid="aviso-bulk-return-finalizadas" style={{ display: "block", marginTop: 8 }}>
                  {avisoLoteFinalizadas()}
                </span>
              )}
            </div>
          </AlertDialogDescription>
          {!loteSoDeMoldes && <SeletorDeDestino destino={destino} aoEscolher={aoEscolherDestino} />}
          {moldesNoLote > 0 && (
            <p data-testid="aviso-bulk-return-moldes" style={{ margin: "0 0 12px", fontSize: FS.meta, lineHeight: 1.5, color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: R.md, padding: "8px 12px" }}>
              {loteSoDeMoldes
                ? (moldesNoLote === 1 ? "O molde volta" : `Os ${moldesNoLote} moldes voltam`)
                : (moldesNoLote === 1 ? "1 molde volta" : `${moldesNoLote} moldes voltam`)} para o começo da Arte, com o thumb — molde não tem Finalização{loteSoDeMoldes ? "." : ", seja qual for a escolha acima."}
            </p>
          )}
          <textarea
            placeholder="Descreva o motivo da devolução..."
            aria-label="Motivo da devolução das peças para a Arte"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            data-testid="textarea-bulk-return"
            className="placeholder:text-muted-foreground"
            style={{ ...CAMPO_DO_MOTIVO, fontSize: fonteDeCampo }}
          />
          <ContadorDoMotivo texto={motivo} />
        </div>
        <div style={RODAPE_DA_CONFIRMACAO}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="fantasma" tamanho={dedo ? "toque" : "md"} data-testid="button-bulk-return-cancel">Cancelar</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={RotateCcw}
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                aoDevolver();
              }}
              disabled={devolvendo || motivoCurto(motivo) || selecaoLote.vivas.length === 0}
              title={motivoCurto(motivo) ? avisoMotivoCurto : undefined}
              data-testid="button-bulk-return-confirm"
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
