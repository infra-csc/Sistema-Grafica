// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE REVISÃO — duas colunas: ler à esquerda, decidir à direita.
//
// EMPILHADO (≤ 900px, 29/09) a ordem é a do TRABALHO, não a das colunas: a
// arte, logo abaixo dela a decisão (um patrocinador por linha), e só depois
// especificações, arquivos e histórico. O rodapé da fila (Aprovar para todos ·
// Próxima peça) fica FIXO no pé do modal, fora da rolagem, na zona do polegar
// — o mesmo desenho do rodapé da Revisão Final. Antes a coluna da decisão
// vinha INTEIRA depois da de leitura: no celular os botões moravam a quatro
// telas de rolagem da arte que eles decidem.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { T, N } from "@/lib/theme";
import { CabecalhoDaRevisao } from "./cabecalho-da-revisao";
import { ArteDaRevisao, DetalhesDaRevisao, LeituraDaRevisao } from "./leitura-da-revisao";
import { DecisaoDaRevisao, ListaDaDecisao, RodapeDaDecisao } from "./decisao-da-revisao";
import type { PropsDaLinhaDeDecisao } from "./linha-de-decisao";
import type { AcoesDoAtendimento } from "./use-atendimento-acoes";
import type {
  CandidatoAPatrocinador, EventoAtendimento, Patrocinador, PecaAtendimento, RegistroDeAuditoria, VinculoDoEvento,
} from "./tipos";

/** A MESMA régua do `.review-modal-body` no index.css: abaixo dela, uma coluna. */
const CONSULTA_EMPILHADA = "(max-width: 900px)";
function useEmpilhado(): boolean {
  const ler = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(CONSULTA_EMPILHADA).matches;
  const [v, setV] = useState(ler);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(CONSULTA_EMPILHADA);
    const f = () => setV(m.matches);
    f();
    m.addEventListener?.("change", f);
    return () => m.removeEventListener?.("change", f);
  }, []);
  return v;
}

export function ModalDeRevisao({
  dialogOpen, setDialogOpen, selectedItem, events, auditLogs, itemSponsorsMap, hoje, reviewQueue, goToAdjacentItem,
  loadingSponsorApprovals, vinculosDoEvento, sponsorsDoEvento, sponsors, buscaPatrocinador, setBuscaPatrocinador,
  addPatrocinadorAberto, setAddPatrocinadorAberto, addingPatrocinadorId, adicionarPatrocinador, sponsorApproveMutation,
  falhaNasDecisoes = false, aoTentarDeNovoDecisoes,
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
  /** A leitura das decisões desta peça falhou (ver a página). */
  falhaNasDecisoes?: boolean;
  aoTentarDeNovoDecisoes?: () => void;
} & Omit<PropsDaLinhaDeDecisao, "sponsor" | "selectedItem">) {
  const { rejectingSponsorId, isMobile, dedo, sponsorApprovals } = daLinha;
  const empilhado = useEmpilhado() || isMobile;
  const toque = isMobile || dedo;
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {/* Escape fecha o modal, EXCETO com o formulário de reprovação aberto —
          para não descartar o motivo digitado com um Esc acidental. */}
      <DialogContent
        // 1240 e não 1152 (max-w-6xl): a coluna da decisão ganha ~40px e o nome
        // do patrocinador cabe numa linha ao lado de Reprovar/Aprovar.
        className={`max-w-[1240px] max-h-[92vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`}
        // No celular o modal ocupa a tela menos 8px de cada lado (e o teto
        // em dvh, para o rodapé fixo não ficar atrás da barra do navegador).
        style={isMobile ? { maxWidth: 'calc(100vw - 16px)', width: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', borderRadius: 16 } : undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (rejectingSponsorId) e.preventDefault(); }}
      >
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
          const daLista = {
            dialogSponsors, allDecided, allApproved, loadingSponsorApprovals, vinculosDoEvento, sponsorsDoEvento, sponsors,
            buscaPatrocinador, setBuscaPatrocinador, addPatrocinadorAberto, setAddPatrocinadorAberto, addingPatrocinadorId,
            adicionarPatrocinador, selectedItem, falhaNasDecisoes, aoTentarDeNovoDecisoes, ...daLinha,
          };

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

              {empilhado ? (
                <>
                  {/* UMA rolagem, na ordem do trabalho. A chave pela peça faz
                      a troca (Próxima peça) começar do topo, com a arte. */}
                  <div key={selectedItem.id} data-testid="corpo-empilhado" className="atd-entrar" style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', backgroundColor: T.surface }}>
                    <ArteDaRevisao selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} toque={toque} compacta={isMobile} />
                    <div style={{ backgroundColor: T.bg, borderTop: `1px solid ${N.n3}`, borderBottom: `1px solid ${N.n3}`, marginTop: 16 }}>
                      <ListaDaDecisao {...daLista} compacta={isMobile} />
                    </div>
                    <DetalhesDaRevisao selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} itemLogs={itemLogs} isMobile={isMobile} toque={toque} />
                  </div>
                  <RodapeDaDecisao
                    dialogSponsors={dialogSponsors}
                    allDecided={allDecided}
                    allApproved={allApproved}
                    setDialogOpen={setDialogOpen}
                    reviewQueue={reviewQueue}
                    goToAdjacentItem={goToAdjacentItem}
                    sponsorApproveMutation={sponsorApproveMutation}
                    selectedItem={selectedItem}
                    canDecide={daLinha.canDecide}
                    tamBotao={daLinha.tamBotao}
                    pecaRecemAberta={daLinha.pecaRecemAberta}
                    decisaoTravada={daLinha.decisaoTravada}
                    fixoNoCelular
                  />
                </>
              ) : (
                // Modal Body: DUAS colunas — ler à esquerda, decidir à direita.
                // A chave pela peça: a troca de peça entra com um fade curto
                // (o cabeçalho e o toast já dizem que a peça mudou).
                <div key={selectedItem.id} className="review-modal-body atd-entrar">
                  <LeituraDaRevisao
                    selectedItem={selectedItem}
                    thumbUrl={thumbUrl}
                    finalUrl={finalUrl}
                    itemLogs={itemLogs}
                    isMobile={isMobile}
                    toque={toque}
                  />
                  <DecisaoDaRevisao
                    {...daLista}
                    setDialogOpen={setDialogOpen}
                    reviewQueue={reviewQueue}
                    goToAdjacentItem={goToAdjacentItem}
                    sponsorApproveMutation={sponsorApproveMutation}
                  />
                </div>
              )}
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
