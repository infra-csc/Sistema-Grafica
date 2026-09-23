import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Botao } from "@/components/ui/botao";
import { T, FS, R, SHADOW, FONT } from "@/lib/theme";
import type { FormularioDoEventoAberto } from "./use-formulario-do-evento";

// Descarte: regra ÚNICA para X, Esc e clique-fora. Antes o X do
// DialogContent chamava handleCloseDialog direto e apagava nome, duas
// datas, cinco marcos ajustados e a seleção de patrocinadores com
// cotas — enquanto Esc e clique-fora ficavam travados. O usuário
// aprendia que a tela era imprevisível.
export function DialogoDeDescarte({ form, isMobile }: { form: FormularioDoEventoAberto; isMobile: boolean }) {
  const { confirmDiscardOpen, setConfirmDiscardOpen, handleCloseDialog } = form;
  return (
    <AlertDialog open={confirmDiscardOpen} onOpenChange={(v) => { if (!v) setConfirmDiscardOpen(false); }}>
      {/* ALTURA — a conta.
          Medido: 28+8 de padding + título 24 + texto de duas linhas 44 +
          rodapé 82 = 186px. Este diálogo NÃO cortava em nenhuma das alturas
          conferidas — o teto aqui é preventivo.
          O teto é `100vh − 48`: a viewport menos 24px de respiro em cima e
          24 embaixo, simétrico porque o Radix centra o Content com
          `top: 50%` + translate. A rede de segurança de ui/alert-dialog.tsx
          NÃO alcança este diálogo: ele traz `overflow: hidden` inline, e
          inline vence classe — sem a coluna flex e sem um scrollport o teto
          só trocaria o corte simétrico por um corte embaixo. Por isso o
          corpo vira o único item que rola e o rodapé leva `flexShrink: 0`. */}
      <AlertDialogContent style={{ maxWidth: 420, borderRadius: R.xl, padding: 0, border: 'none', boxShadow: SHADOW.lg, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '28px 28px 8px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <AlertDialogTitle style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: '700', letterSpacing: '-0.02em', color: T.dark, margin: 0 }}>
            Descartar alterações?
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: FS.body, color: T.second, lineHeight: 1.6, marginTop: 10 }}>
            O que você preencheu neste formulário será perdido — inclusive os prazos ajustados e os patrocinadores selecionados.
          </AlertDialogDescription>
        </div>
        <AlertDialogFooter style={{ padding: '16px 28px 28px', display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: 10, flexShrink: 0 }}>
          {/* Botao solto, e não AlertDialogCancel/Action: esses dois trazem
              as classes do buttonVariants (altura, raio, hover) que brigam
              com o .ds-botao. Fechar passa a ser explícito — é o que o
              useConfirmar também faz. handleCloseDialog já fecha esta pergunta. */}
          <Botao variante="secundario" tamanho={isMobile ? 'toque' : 'md'} onClick={() => setConfirmDiscardOpen(false)}>
            Continuar editando
          </Botao>
          <Botao
            variante="perigo"
            tamanho={isMobile ? 'toque' : 'md'}
            onClick={handleCloseDialog}
            data-testid="button-confirm-discard"
          >
            Descartar
          </Botao>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
