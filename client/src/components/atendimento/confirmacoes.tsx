// ─────────────────────────────────────────────────────────────────────────────
// AS TRÊS CONFIRMAÇÕES DO ATENDIMENTO: desvincular um patrocinador, aprovar
// para um patrocinador, e aprovar em lote. Cada uma diz o efeito real.
//
// A CASCA É A DA REVISÃO FINAL (29/09): cabeçalho compacto no celular, corpo
// rolável, e o rodapé com Cancelar → ação na mesma linha, à direita, no
// desktop; no celular os dois em linha cheia, a ação EM CIMA e o recorte
// seguro embaixo (`rodapeDaConfirmacao`). Antes cada uma empilhava dois
// botões de largura cheia até num diálogo de 440px no desktop — e a de
// desvincular nem tinha "Cancelar": a única saída ao lado de "Desvincular"
// era o X do canto.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, Unlink } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { useIsMobile, usePonteiroGrosso } from "@/hooks/use-mobile";
import { T, TOM } from "@/lib/theme";
import { TEXTO_DA_CONFIRMACAO, corpoDaConfirmacao, rodapeDaConfirmacao } from "@/components/revisao/estilos";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type { AlvoDePatrocinador } from "./tipos";

/**
 * Desvincular patrocinador (25/08): a confirmação diz o efeito real —
 * inclusive que a peça pode SEGUIR se ele era o único que faltava.
 */
export function ConfirmarDesvinculo({ desvincularAlvo, setDesvincularAlvo, desvincularSponsorMutation }: {
  desvincularAlvo: AlvoDePatrocinador | null;
  setDesvincularAlvo: Dispatch<SetStateAction<AlvoDePatrocinador | null>>;
  desvincularSponsorMutation: AcoesDoAtendimento["desvincularSponsorMutation"];
}) {
  const celular = useIsMobile();
  // 44px no celular e no dedo; no desktop, o controle da casa (36).
  const dedo = usePonteiroGrosso();
  const tam = celular || dedo ? "toque" as const : "md" as const;
  return (
    <Dialog open={!!desvincularAlvo} onOpenChange={(open) => { if (!open) setDesvincularAlvo(null); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">Desvincular patrocinador</DialogTitle>
        <ModalHeader
          variant="confirm"
          compacto={celular}
          icon={Unlink}
          tint={TOM.perigo.text}
          title="Desvincular patrocinador"
          onClose={() => setDesvincularAlvo(null)}
        />
        <div style={corpoDaConfirmacao(celular)}>
          <DialogDescription style={{ ...TEXTO_DA_CONFIRMACAO, margin: 0 }}>
            Tirar <strong style={{ color: T.text }}>{desvincularAlvo?.sponsorName}</strong> desta peça?
            A aprovação <strong>pendente</strong> dele deixa de contar — e, se ele for o único que falta, a rodada fecha e a peça segue para a finalização da Arte. Aprovações já dadas por outros permanecem no histórico.
          </DialogDescription>
        </div>
        <div style={rodapeDaConfirmacao(celular)}>
          <Botao variante="fantasma" tamanho={tam} larguraCheia={celular} onClick={() => setDesvincularAlvo(null)} data-testid="button-cancel-desvincular">
            Cancelar
          </Botao>
          {/* Perigo: tira o patrocinador da peça e a pendência dele deixa
              de contar. */}
          <Botao
            variante="perigo"
            tamanho={tam}
            larguraCheia={celular}
            icone={Unlink}
            carregando={desvincularSponsorMutation.isPending}
            onClick={() => { if (desvincularAlvo) desvincularSponsorMutation.mutate({ itemId: desvincularAlvo.itemId, sponsorId: desvincularAlvo.sponsorId }); }}
            data-testid="button-confirm-desvincular"
          >
            Desvincular
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmarAprovacao({ confirmApproveIndividual, setConfirmApproveIndividual, individualApproveMutation }: {
  confirmApproveIndividual: AlvoDePatrocinador | null;
  setConfirmApproveIndividual: Dispatch<SetStateAction<AlvoDePatrocinador | null>>;
  individualApproveMutation: AcoesDoAtendimento["individualApproveMutation"];
}) {
  const celular = useIsMobile();
  // 44px no celular e no dedo; no desktop, o controle da casa (36).
  const dedo = usePonteiroGrosso();
  const tam = celular || dedo ? "toque" as const : "md" as const;
  return (
    <Dialog open={!!confirmApproveIndividual} onOpenChange={(open) => { if (!open) setConfirmApproveIndividual(null); }}>
      {/* FOCO NO "APROVAR". O Radix focava o primeiro focável — o X do
          cabeçalho —, e confirmar pedia mirar o botão de novo com o mouse ou
          dois Tabs. A pergunta é de uma palavra e reversível (dá para
          revogar): Enter confirma, Esc cancela. */}
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(480)}
        onOpenAutoFocus={(e) => {
          const alvo = (e.currentTarget as HTMLElement | null)?.querySelector('[data-testid="button-confirm-approve-individual"]') as HTMLElement | null;
          if (alvo) { e.preventDefault(); alvo.focus(); }
        }}
      >
        <DialogTitle className="sr-only">Confirmar aprovação</DialogTitle>
        <ModalHeader
          variant="confirm"
          compacto={celular}
          icon={CheckCircle}
          tint={TOM.sucesso.text}
          title="Confirmar aprovação"
          onClose={() => setConfirmApproveIndividual(null)}
        />
        {/* A rolagem é preventiva: com o teto e o `overflow: hidden` que o
            `modalSurface` traz, um nome de patrocinador longo (a única parte
            elástica) seria recortado em silêncio se não houvesse scrollport. */}
        <div style={corpoDaConfirmacao(celular)}>
          <DialogDescription style={{ ...TEXTO_DA_CONFIRMACAO, margin: 0 }}>
            Aprovar a arte para o patrocinador <strong style={{ color: T.text }}>{confirmApproveIndividual?.sponsorName}</strong>?
 Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte.
          </DialogDescription>
        </div>
        <div style={rodapeDaConfirmacao(celular)}>
          <Botao variante="fantasma" tamanho={tam} larguraCheia={celular} onClick={() => setConfirmApproveIndividual(null)}>
            Cancelar
          </Botao>
          {/* TINTA, não verde: verde é o ESTADO 'aprovado' nesta tela — o
              que a peça vira DEPOIS da decisão. O CTA diz o resultado e
              para quem (rodada 4). */}
          <Botao
            variante="primario"
            tamanho={tam}
            larguraCheia={celular}
            icone={CheckCircle}
            carregando={individualApproveMutation.isPending}
            onClick={() => {
              if (confirmApproveIndividual) {
                individualApproveMutation.mutate({ itemId: confirmApproveIndividual.itemId, sponsorId: confirmApproveIndividual.sponsorId });
                setConfirmApproveIndividual(null);
              }
            }}
            data-testid="button-confirm-approve-individual"
            // O nome do patrocinador pode ser longo: o rótulo quebra em vez
            // de empurrar o botão para fora do diálogo.
            style={{ whiteSpace: 'normal', textAlign: 'center', maxWidth: '100%' }}
          >
            {`Aprovar para ${confirmApproveIndividual?.sponsorName ?? 'o patrocinador'}`}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmarLote({
  confirmApproveBatch, setConfirmApproveBatch, batchSelectedItemIds, batchSponsorNome, batchEventoNome,
  batchSponsorId, batchEventId, batchSponsorMutation,
}: {
  confirmApproveBatch: boolean;
  setConfirmApproveBatch: Dispatch<SetStateAction<boolean>>;
  batchSelectedItemIds: Set<string>;
  batchSponsorNome: string;
  batchEventoNome: string | null;
  batchSponsorId: string;
  batchEventId: string;
  batchSponsorMutation: AcoesDoAtendimento["batchSponsorMutation"];
}) {
  const celular = useIsMobile();
  // 44px no celular e no dedo; no desktop, o controle da casa (36).
  const dedo = usePonteiroGrosso();
  const tam = celular || dedo ? "toque" as const : "md" as const;
  return (
    <Dialog open={confirmApproveBatch} onOpenChange={(open) => { if (!open) setConfirmApproveBatch(false); }}>
      {/* Mesmo foco inicial da confirmação individual: Enter aprova. */}
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(500)}
        onOpenAutoFocus={(e) => {
          const alvo = (e.currentTarget as HTMLElement | null)?.querySelector('[data-testid="button-confirm-batch-approve"]') as HTMLElement | null;
          if (alvo) { e.preventDefault(); alvo.focus(); }
        }}
      >
        <DialogTitle className="sr-only">Confirmar aprovação em lote</DialogTitle>
        <ModalHeader
          variant="confirm"
          compacto={celular}
          icon={CheckCircle}
          tint={TOM.sucesso.text}
          title="Confirmar aprovação em lote"
          onClose={() => setConfirmApproveBatch(false)}
        />
        <div style={corpoDaConfirmacao(celular)}>
          <DialogDescription style={{ ...TEXTO_DA_CONFIRMACAO, margin: 0 }}>
            Aprovar <strong style={{ color: T.text }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> para <strong style={{ color: T.text }}>{batchSponsorNome}</strong>{batchEventoNome ? <> em {batchEventoNome}</> : null}?
            Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte.
          </DialogDescription>
        </div>
        <div style={rodapeDaConfirmacao(celular)}>
          <Botao variante="fantasma" tamanho={tam} larguraCheia={celular} onClick={() => setConfirmApproveBatch(false)}>
            Cancelar
          </Botao>
          {/* TINTA, não verde: verde é o ESTADO 'aprovado' nesta tela — o
              que a peça vira DEPOIS da decisão. */}
          <Botao
            variante="primario"
            tamanho={tam}
            larguraCheia={celular}
            icone={CheckCircle}
            carregando={batchSponsorMutation.isPending}
            onClick={() => {
              batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "approve" });
              setConfirmApproveBatch(false);
            }}
            data-testid="button-confirm-batch-approve"
            style={{ whiteSpace: 'normal', textAlign: 'center', maxWidth: '100%' }}
          >
            {`Aprovar ${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'peça' : 'peças'} para ${batchSponsorNome}`}
          </Botao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
