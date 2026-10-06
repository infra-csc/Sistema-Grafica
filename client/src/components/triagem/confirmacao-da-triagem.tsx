// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — A CONFIRMAÇÃO (redesign 06/10).
//
// A tabela e o quadro tinham três AlertDialogs crus (título e descrição do
// shadcn, botão vermelho pintado por `style`), um desenho diferente do
// `useConfirmar` do resto do app. Este é o mesmo desenho da casa — ladrilho de
// ícone, pergunta, descrição e os dois verbos —, mas mantém o título e os
// botões com os data-testid que os testes da triagem leem. Cancel/Action vêm
// do Radix cru (asChild + <Botao>): os do ui/alert-dialog injetam as classes do
// botão do shadcn por cima do nosso.
// ─────────────────────────────────────────────────────────────────────────────
import type { LucideIcon } from "lucide-react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { HIDE_NATIVE_CLOSE, modalSurface } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { T, TOM, FS, FW, R, FONT } from "@/lib/theme";

export function ConfirmacaoDaTriagem({
  open, onOpenChange, icone: Icone, titulo, tituloTestId, descricao,
  cancelar, testIdCancelar, confirmar, testIdConfirmar, onConfirmar, perigo = true,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  icone: LucideIcon;
  titulo: React.ReactNode;
  tituloTestId?: string;
  descricao: React.ReactNode;
  cancelar: string;
  testIdCancelar: string;
  confirmar: string;
  testIdConfirmar: string;
  onConfirmar: () => void;
  perigo?: boolean;
}) {
  const tom = perigo ? TOM.perigo : TOM.alerta;
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className={`gap-0 ${HIDE_NATIVE_CLOSE}`} style={modalSurface(460)}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "22px 24px 18px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: R.md, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: tom.bg, border: `1px solid ${tom.border}` }}>
            <Icone size={18} color={tom.text} />
          </span>
          <div style={{ minWidth: 0 }}>
            <AlertDialogTitle asChild>
              <h2 data-testid={tituloTestId} style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.rotulo, letterSpacing: "-0.02em", lineHeight: 1.25, color: T.text, overflowWrap: "anywhere" }}>
                {titulo}
              </h2>
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <p style={{ margin: "6px 0 0", fontSize: FS.body, lineHeight: 1.55, color: T.apoio }}>{descricao}</p>
            </AlertDialogDescription>
          </div>
        </div>
        <div style={{
          display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, flexShrink: 0,
          padding: "14px 24px calc(14px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${T.border}`,
        }}>
          <AlertDialogPrimitive.Cancel asChild>
            <Botao variante="secundario" tamanho="toque" data-testid={testIdCancelar}>{cancelar}</Botao>
          </AlertDialogPrimitive.Cancel>
          <AlertDialogPrimitive.Action asChild>
            <Botao variante={perigo ? "perigo" : "primario"} tamanho="toque" data-testid={testIdConfirmar} onClick={onConfirmar}>{confirmar}</Botao>
          </AlertDialogPrimitive.Action>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
