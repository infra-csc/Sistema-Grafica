// A confirmação do "Excluir" evento — que ARQUIVA: some das telas, nada é
// apagado, e o admin restaura em Arquivados.
import { AlertTriangle, Archive } from "lucide-react";
import { T, FS, R, SHADOW, TOM, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { AcoesDoEvento } from "./use-acoes-do-evento";

export function DialogoDeArquivar({ acoes, isMobile }: { acoes: AcoesDoEvento; isMobile: boolean }) {
  const {
    deletingEventId, setDeletingEventId, deleteConfirmText, setDeleteConfirmText, deletingEvent,
    deletingStats, deleteNeedsTyping, deleteConfirmed, deleteEventMutation,
  } = acoes;
  return (
      <AlertDialog open={!!deletingEventId} onOpenChange={(v) => { if (!v && !deleteEventMutation.isPending) { setDeletingEventId(null); setDeleteConfirmText(""); } }}>
        {/* ALTURA — a conta.
              Medido no pior caso realista (evento com peças e a tarja laranja
              cheia): 32 de padding + título 24 + tarja de até 110 + o campo de
              confirmação por digitação (rótulo 20 + campo 40) + rodapé 86 =
              ~430px. Numa janela de 445 sobram 397, então CORTAVA ~16px em cima
              e 16 embaixo ao mesmo tempo — sumiam o título e o botão Arquivar
              juntos.
              O teto é `100vh − 48`: a viewport menos 24px de respiro em cima e
              24 embaixo, simétrico porque o Radix centra o Content com
              `top: 50%` + translate. A rede de segurança de ui/alert-dialog.tsx
              NÃO alcança este diálogo: ele traz `overflow: hidden` inline, e
              inline vence classe — sem a coluna flex e sem um scrollport o teto
              só trocaria o corte simétrico por um corte embaixo. Por isso o
              corpo vira o único item que rola e o rodapé leva `flexShrink: 0`. */}
          <AlertDialogContent style={{ maxWidth: "460px", backgroundColor: T.surface, borderRadius: R.xl, padding: "0", border: "none", boxShadow: SHADOW.lg, overflow: "hidden", maxHeight: "calc(100vh - 48px)", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "32px 32px 8px 32px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            <AlertDialogTitle style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: "700", letterSpacing: "-0.02em", color: T.dark, margin: 0 }}>
              Arquivar evento
            </AlertDialogTitle>

            {/* Confirmação PROPORCIONAL ao que sai de vista: "e 128 peças, 96
                já entregues" faz parar. Excluir ARQUIVA — nada é apagado, e a
                frase diz isso, senão ninguém sabe que dá para voltar. */}
            <div style={{ marginTop: "20px", padding: "16px", backgroundColor: TOM.laranja.bg, borderLeft: `4px solid ${T.accent}`, borderRadius: `0 ${R.md}px ${R.md}px 0`, display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <AlertTriangle style={{ width: "18px", height: "18px", color: T.accent, flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: FS.body, fontWeight: "600", color: T.accentText, margin: 0, lineHeight: 1.6 }}>
                {deletingStats && deletingStats.itemCount > 0 ? (
                  <>
                    O evento some de todas as telas junto com{" "}
                    <strong>{deletingStats.itemCount} {deletingStats.itemCount === 1 ? 'peça' : 'peças'}</strong>
                    {deletingStats.deliveredCount > 0 ? ` (${deletingStats.deliveredCount} já ${deletingStats.deliveredCount === 1 ? 'entregue' : 'entregues'})` : ''}
                    {deletingStats.inProductionCount > 0 ? `, ${deletingStats.inProductionCount} em produção` : ''}
                    . Nada é apagado: fotos, comentários e aprovações ficam guardados.
                  </>
                ) : (
                  <>O evento some de todas as telas. Nada é apagado: patrocinadores e cotas ficam guardados.</>
                )}
              </p>
            </div>

            <AlertDialogDescription style={{ fontSize: FS.strong, color: T.second, lineHeight: 1.6, marginTop: "16px" }}>
              Arquivar{" "}
              <strong style={{ color: T.text, fontWeight: "600" }}>
                "{deletingEvent?.name || "este evento"}"
              </strong>
              ? Um administrador pode restaurá-lo em Arquivados, com tudo como estava.
            </AlertDialogDescription>

            {deleteNeedsTyping && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="delete-confirm" style={{ fontSize: FS.small, fontWeight: 700, color: T.apoio }}>
                  Há trabalho entregue ou em produção. Digite <strong style={{ color: T.text }}>{deletingEvent?.name}</strong> para liberar o arquivamento:
                </label>
                <input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoComplete="off"
                  data-testid="input-delete-confirm"
                  style={{ width: '100%', height: 38, border: `1px solid ${T.border}`, borderRadius: R.md, padding: '0 12px', fontSize: FS.body, fontFamily: 'inherit', color: T.text }}
                />
              </div>
            )}
          </div>

          <AlertDialogFooter style={{ padding: "16px 32px 32px 32px", display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px", flexShrink: 0 }}>
            {/* Botao solto (ver o diálogo de descarte). Sem o Action do Radix
                o diálogo só fecha no onSuccess — o "Excluindo..." fica na tela
                até a resposta, em vez de o diálogo sumir no clique. */}
            <Botao
              variante="secundario"
              tamanho={isMobile ? 'toque' : 'md'}
              disabled={deleteEventMutation.isPending}
              onClick={() => { setDeletingEventId(null); setDeleteConfirmText(""); }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="perigo"
              icone={Archive}
              tamanho={isMobile ? 'toque' : 'md'}
              carregando={deleteEventMutation.isPending}
              disabled={!deleteConfirmed}
              motivo={!deleteConfirmed ? 'Digite o nome do evento acima.' : undefined}
              alinharMotivo="end"
              onClick={() => {
                if (!deleteConfirmed) return;
                if (deletingEventId) deleteEventMutation.mutate(deletingEventId);
              }}
              data-testid="button-confirm-delete-event"
            >
              {deleteEventMutation.isPending ? "Arquivando..." : "Arquivar"}
            </Botao>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  );
}
