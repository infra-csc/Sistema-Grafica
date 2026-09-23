// ─────────────────────────────────────────────────────────────────────────────
// AS TRÊS CONFIRMAÇÕES DO ATENDIMENTO: desvincular um patrocinador, aprovar
// para um patrocinador, e aprovar em lote. Cada uma diz o efeito real.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { CheckCircle, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { T, TOM } from "@/lib/theme";
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
  return (
    <Dialog open={!!desvincularAlvo} onOpenChange={(open) => { if (!open) setDesvincularAlvo(null); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(460)}>
        <DialogTitle className="sr-only">Desvincular patrocinador</DialogTitle>
        <ModalHeader
          variant="confirm"
          icon={XCircle}
          tint={TOM.perigo.text}
          title="Desvincular patrocinador"
          onClose={() => setDesvincularAlvo(null)}
        />
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <DialogDescription style={{ fontSize: 13, color: T.apoio, lineHeight: 1.6, margin: 0 }}>
            Tirar <strong style={{ color: T.text }}>{desvincularAlvo?.sponsorName}</strong> desta peça?
            A aprovação <strong>pendente</strong> dele deixa de contar — e, se ele for o único que falta, a rodada fecha e a peça segue para a finalização da Arte. Aprovações já dadas por outros permanecem no histórico.
          </DialogDescription>
        </div>
        <ModalFooter>
          {/* Perigo: tira o patrocinador da peça e a pendência dele deixa
              de contar. */}
          <Botao
            variante="perigo"
            tamanho="toque"
            larguraCheia
            carregando={desvincularSponsorMutation.isPending}
            onClick={() => { if (desvincularAlvo) desvincularSponsorMutation.mutate({ itemId: desvincularAlvo.itemId, sponsorId: desvincularAlvo.sponsorId }); }}
            data-testid="button-confirm-desvincular"
          >
            Desvincular
          </Botao>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmarAprovacao({ confirmApproveIndividual, setConfirmApproveIndividual, individualApproveMutation }: {
  confirmApproveIndividual: AlvoDePatrocinador | null;
  setConfirmApproveIndividual: Dispatch<SetStateAction<AlvoDePatrocinador | null>>;
  individualApproveMutation: AcoesDoAtendimento["individualApproveMutation"];
}) {
  return (
    <Dialog open={!!confirmApproveIndividual} onOpenChange={(open) => { if (!open) setConfirmApproveIndividual(null); }}>
      {/* FOCO NO "APROVAR". O Radix focava o primeiro focável — o X do
          cabeçalho —, e confirmar pedia mirar o botão de novo com o mouse ou
          dois Tabs. A pergunta é de uma palavra e reversível (dá para
          revogar): Enter confirma, Esc cancela. */}
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(440)}
        onOpenAutoFocus={(e) => {
          const alvo = (e.currentTarget as HTMLElement | null)?.querySelector('[data-testid="button-confirm-approve-individual"]') as HTMLElement | null;
          if (alvo) { e.preventDefault(); alvo.focus(); }
        }}
      >
        <DialogTitle className="sr-only">Confirmar aprovação</DialogTitle>
        <ModalHeader
          variant="confirm"
          icon={CheckCircle}
          tint={TOM.sucesso.text}
          title="Confirmar aprovação"
          onClose={() => setConfirmApproveIndividual(null)}
        />
        {/* ALTURA: cabeçalho 80 + este corpo 82 + rodapé 120 = 282px, e em 445
            de altura sobram 397 — este modal NÃO cortava em nenhuma das
            alturas conferidas. A rolagem é preventiva: com o teto e o
            `overflow: hidden` que o `modalSurface` agora traz, um nome de
            patrocinador longo (a única parte elástica) seria recortado em
            silêncio se não houvesse scrollport. */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <DialogDescription style={{ fontSize: 13, color: T.apoio, lineHeight: 1.6, margin: 0 }}>
            Aprovar a arte para o patrocinador <strong style={{ color: T.text }}>{confirmApproveIndividual?.sponsorName}</strong>?
 Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte.
          </DialogDescription>
        </div>
        <ModalFooter>
          {/* TINTA, não verde: verde é o ESTADO 'aprovado' nesta tela — o
              que a peça vira DEPOIS da decisão. O CTA diz o resultado e
              para quem (rodada 4). */}
          <Botao
            variante="primario"
            tamanho="toque"
            larguraCheia
            icone={CheckCircle}
            carregando={individualApproveMutation.isPending}
            onClick={() => {
              if (confirmApproveIndividual) {
                individualApproveMutation.mutate({ itemId: confirmApproveIndividual.itemId, sponsorId: confirmApproveIndividual.sponsorId });
                setConfirmApproveIndividual(null);
              }
            }}
            data-testid="button-confirm-approve-individual"
          >
            {`Aprovar para ${confirmApproveIndividual?.sponsorName ?? 'o patrocinador'}`}
          </Botao>
          <Botao variante="fantasma" larguraCheia onClick={() => setConfirmApproveIndividual(null)}>
            Cancelar
          </Botao>
        </ModalFooter>
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
  return (
    <Dialog open={confirmApproveBatch} onOpenChange={(open) => { if (!open) setConfirmApproveBatch(false); }}>
      {/* Mesmo foco inicial da confirmação individual: Enter aprova. */}
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        style={modalSurface(440)}
        onOpenAutoFocus={(e) => {
          const alvo = (e.currentTarget as HTMLElement | null)?.querySelector('[data-testid="button-confirm-batch-approve"]') as HTMLElement | null;
          if (alvo) { e.preventDefault(); alvo.focus(); }
        }}
      >
        <DialogTitle className="sr-only">Confirmar aprovação em lote</DialogTitle>
        <ModalHeader
          variant="confirm"
          icon={CheckCircle}
          tint={TOM.sucesso.text}
          title="Confirmar aprovação em lote"
          onClose={() => setConfirmApproveBatch(false)}
        />
        {/* Mesma conta do modal individual acima: 282px de modal contra 397
            disponíveis em 445 de altura — NÃO cortava. Scrollport preventivo
            pelo teto que o `modalSurface` passou a impor. */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
          <DialogDescription style={{ fontSize: 13, color: T.apoio, lineHeight: 1.6, margin: 0 }}>
            Aprovar <strong style={{ color: T.text }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> para <strong style={{ color: T.text }}>{batchSponsorNome}</strong>{batchEventoNome ? <> em {batchEventoNome}</> : null}?
            Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte.
          </DialogDescription>
        </div>
        <ModalFooter>
          {/* TINTA, não verde: verde é o ESTADO 'aprovado' nesta tela — o
              que a peça vira DEPOIS da decisão. */}
          <Botao
            variante="primario"
            tamanho="toque"
            larguraCheia
            icone={CheckCircle}
            carregando={batchSponsorMutation.isPending}
            onClick={() => {
              batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "approve" });
              setConfirmApproveBatch(false);
            }}
            data-testid="button-confirm-batch-approve"
          >
            {`Aprovar ${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'peça' : 'peças'} para ${batchSponsorNome}`}
          </Botao>
          <Botao variante="fantasma" larguraCheia onClick={() => setConfirmApproveBatch(false)}>
            Cancelar
          </Botao>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
