// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE REVISÃO — duas colunas: ler à esquerda, decidir à direita.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { CabecalhoDaRevisao } from "./cabecalho-da-revisao";
import { LeituraDaRevisao } from "./leitura-da-revisao";
import { DecisaoDaRevisao } from "./decisao-da-revisao";
import type { PropsDaLinhaDeDecisao } from "./linha-de-decisao";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type {
  CandidatoAPatrocinador, EventoAtendimento, Patrocinador, PecaAtendimento, RegistroDeAuditoria, VinculoDoEvento,
} from "./tipos";

export function ModalDeRevisao({
  dialogOpen, setDialogOpen, selectedItem, events, auditLogs, itemSponsorsMap, hoje, reviewQueue, goToAdjacentItem,
  loadingSponsorApprovals, vinculosDoEvento, sponsorsDoEvento, sponsors, buscaPatrocinador, setBuscaPatrocinador,
  addPatrocinadorAberto, setAddPatrocinadorAberto, addingPatrocinadorId, adicionarPatrocinador, sponsorApproveMutation,
  ...daLinha
}: {
  dialogOpen: boolean;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
  selectedItem: PecaAtendimento | null;
  events: EventoAtendimento[];
  auditLogs: RegistroDeAuditoria[];
  itemSponsorsMap: Record<string, Patrocinador[]>;
  hoje: Date;
  reviewQueue: PecaAtendimento[];
  goToAdjacentItem: (dir: 1 | -1) => void;
  loadingSponsorApprovals: boolean;
  vinculosDoEvento: VinculoDoEvento[];
  sponsorsDoEvento: Patrocinador[];
  sponsors: Patrocinador[];
  buscaPatrocinador: string;
  setBuscaPatrocinador: Dispatch<SetStateAction<string>>;
  addPatrocinadorAberto: boolean;
  setAddPatrocinadorAberto: Dispatch<SetStateAction<boolean>>;
  addingPatrocinadorId: string | null;
  adicionarPatrocinador: (sp: CandidatoAPatrocinador) => void;
  sponsorApproveMutation: AcoesDoAtendimento["sponsorApproveMutation"];
} & Omit<PropsDaLinhaDeDecisao, "sponsor" | "selectedItem">) {
  const { rejectingSponsorId, isMobile, dedo, sponsorApprovals } = daLinha;
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {/* Escape fecha o modal, EXCETO com o formulário de reprovação aberto —
          para não descartar o motivo digitado com um Esc acidental. */}
      <DialogContent className={`max-w-6xl max-h-[92vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`} style={isMobile ? { maxWidth: '95vw', width: '95vw' } : undefined} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { if (rejectingSponsorId) e.preventDefault(); }}>
        <DialogTitle className="sr-only">Revisão de Ativo</DialogTitle>
        <DialogDescription className="sr-only">Revise os detalhes e aprove ou reprove o ativo</DialogDescription>

        {selectedItem && (() => {
          const ev = events.find((e) => e.id === selectedItem.eventId);
          const thumbUrl = selectedItem.approvalThumbUrl;
          const finalUrl = selectedItem.finalFileUrl;
          const itemLogs = auditLogs
            .filter(log => log.entityType === 'item' && log.entityId === selectedItem.id)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          const dialogSponsors = itemSponsorsMap[selectedItem.id] || [];
          const allDecided = sponsorApprovals.length > 0 && dialogSponsors.every(s => {
            const a = sponsorApprovals.find(ap => ap.sponsorId === s.id);
            return a && (a.status === 'approved' || a.status === 'rejected' || a.status === 'awaiting_arte');
          });
          const allApproved = dialogSponsors.length > 0 && dialogSponsors.every(s => {
            return sponsorApprovals.find(ap => ap.sponsorId === s.id)?.status === 'approved';
          });

          return (
            <>
              <CabecalhoDaRevisao
                selectedItem={selectedItem}
                ev={ev}
                thumbUrl={thumbUrl}
                isMobile={isMobile}
                dedo={dedo}
                hoje={hoje}
                reviewQueue={reviewQueue}
                goToAdjacentItem={goToAdjacentItem}
                setDialogOpen={setDialogOpen}
              />

              {/* Modal Body: DUAS colunas — ler à esquerda, decidir à direita */}
              <div className="review-modal-body">
                <LeituraDaRevisao
                  selectedItem={selectedItem}
                  thumbUrl={thumbUrl}
                  finalUrl={finalUrl}
                  itemLogs={itemLogs}
                  isMobile={isMobile}
                />
                <DecisaoDaRevisao
                  dialogSponsors={dialogSponsors}
                  allDecided={allDecided}
                  allApproved={allApproved}
                  loadingSponsorApprovals={loadingSponsorApprovals}
                  setDialogOpen={setDialogOpen}
                  reviewQueue={reviewQueue}
                  goToAdjacentItem={goToAdjacentItem}
                  vinculosDoEvento={vinculosDoEvento}
                  sponsorsDoEvento={sponsorsDoEvento}
                  sponsors={sponsors}
                  buscaPatrocinador={buscaPatrocinador}
                  setBuscaPatrocinador={setBuscaPatrocinador}
                  addPatrocinadorAberto={addPatrocinadorAberto}
                  setAddPatrocinadorAberto={setAddPatrocinadorAberto}
                  addingPatrocinadorId={addingPatrocinadorId}
                  adicionarPatrocinador={adicionarPatrocinador}
                  sponsorApproveMutation={sponsorApproveMutation}
                  selectedItem={selectedItem}
                  {...daLinha}
                />
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
