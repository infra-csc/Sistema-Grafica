// ─────────────────────────────────────────────────────────────────────────────
// O MODAL DE REVISÃO.
//
// DESKTOP (29/09, 2ª passada): à esquerda a ARTE numa mesa de luz alta e o
// histórico; à direita a DECISÃO e a ficha da peça; embaixo, de ponta a ponta,
// a barra de ações (Fechar · Aprovar para todos · Próxima peça) com a dica do
// teclado.
//
// EMPILHADO (≤ 900px) a ordem é a do TRABALHO: a arte, a decisão, e só depois
// a ficha e o histórico. O rodapé (Fechar · Próxima peça) fica FIXO no pé do
// modal, fora da rolagem, na zona do polegar — o desenho da Revisão Final.
//
// ATALHOS ← → (29/09): acionam exatamente os handlers das setas do cabeçalho,
// com o mesmo "desligado" (sem anterior/próxima, nada acontece). Só quando o
// foco não está num campo e sem modificadores. Nenhum atalho decide nada.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { T, N } from "@/lib/theme";
import { CabecalhoDaRevisao } from "./cabecalho-da-revisao";
import { ArteDaRevisao, DetalhesDaRevisao, LeituraDaRevisao } from "./leitura-da-revisao";
import { BotaoAprovarTodos, DecisaoDaRevisao, ListaDaDecisao, RodapeDaDecisao } from "./decisao-da-revisao";
import { posicaoNaFila } from "./regras";
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

/** O foco está num lugar onde a seta é do CAMPO (texto, menu, editor)? */
export function focoEmCampo(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"]');
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
  const conteudoRef = useRef<HTMLDivElement | null>(null);

  // O FOCO NÃO SE PERDE NA TROCA DE PEÇA. O corpo é remontado a cada peça
  // (para começar do topo, com a arte); se o foco estava num botão de lá
  // (Aprovar, e o avanço automático trocou a peça), ele caía no <body> e o
  // teclado perdia o lugar. Volta para o próprio modal.
  useEffect(() => {
    if (!dialogOpen) return;
    const id = requestAnimationFrame(() => {
      const el = conteudoRef.current;
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [selectedItem?.id, dialogOpen]);

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (focoEmCampo(e.target)) return;
    const { temAnterior, temProxima } = posicaoNaFila(reviewQueue, selectedItem?.id);
    // Os MESMOS handlers e o MESMO desligado das setas do cabeçalho.
    if (e.key === "ArrowLeft" && temAnterior) { e.preventDefault(); goToAdjacentItem(-1); }
    if (e.key === "ArrowRight" && temProxima) { e.preventDefault(); goToAdjacentItem(1); }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      {/* Escape fecha o modal, EXCETO com o formulário de reprovação aberto —
          para não descartar o motivo digitado com um Esc acidental. */}
      <DialogContent
        ref={conteudoRef}
        tabIndex={-1}
        onKeyDown={aoTeclar}
        // 1240 e não 1152 (max-w-6xl): a coluna da decisão ganha espaço e a
        // arte também.
        className={`max-w-[1240px] max-h-[92vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`}
        // No celular o modal ocupa a tela menos 8px de cada lado (e o teto
        // em dvh, para o rodapé fixo não ficar atrás da barra do navegador).
        // No desktop a ALTURA é fixa (92vh): a mesa de luz e a coluna da
        // decisão não encolhem com uma peça de pouco conteúdo.
        style={isMobile ? { maxWidth: 'calc(100vw - 16px)', width: 'calc(100vw - 16px)', maxHeight: 'calc(100dvh - 16px)', borderRadius: 16, outline: 'none' } : empilhado ? { outline: 'none' } : { height: 'min(92vh, 900px)', outline: 'none' }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (rejectingSponsorId) e.preventDefault(); }}
      >
        {/* O TÍTULO ACESSÍVEL nomeia a peça: o leitor de tela anunciava
            "Revisão de Ativo" em toda peça, e a troca de peça passava muda. */}
        <DialogTitle className="sr-only">{selectedItem ? `Revisão de ${selectedItem.type || 'peça'} ${selectedItem.displayId}` : 'Revisão de Ativo'}</DialogTitle>
        <DialogDescription className="sr-only">Revise os detalhes e aprove ou reprove o ativo. Setas para a esquerda e para a direita trocam de peça.</DialogDescription>

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
          const doRodape = {
            dialogSponsors, allDecided, allApproved, setDialogOpen, reviewQueue, goToAdjacentItem, sponsorApproveMutation,
            selectedItem, canDecide: daLinha.canDecide, tamBotao: daLinha.tamBotao, pecaRecemAberta: daLinha.pecaRecemAberta,
            decisaoTravada: daLinha.decisaoTravada, dedo,
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
                      <ListaDaDecisao
                        {...daLista}
                        compacta={isMobile}
                        acaoDaPecaInteira={<BotaoAprovarTodos {...doRodape} larguraCheia />}
                      />
                    </div>
                    <DetalhesDaRevisao selectedItem={selectedItem} thumbUrl={thumbUrl} finalUrl={finalUrl} itemLogs={itemLogs} isMobile={isMobile} toque={toque} />
                  </div>
                  <RodapeDaDecisao {...doRodape} fixoNoCelular />
                </>
              ) : (
                <>
                  {/* DUAS colunas — ler à esquerda, decidir à direita. A chave
                      pela peça: a troca entra com um fade curto e cada coluna
                      começa do topo. O rodapé fica FORA, e não é remontado. */}
                  <div key={selectedItem.id} className="review-modal-body atd-entrar">
                    <LeituraDaRevisao
                      selectedItem={selectedItem}
                      thumbUrl={thumbUrl}
                      finalUrl={finalUrl}
                      itemLogs={itemLogs}
                      toque={toque}
                    />
                    <DecisaoDaRevisao {...daLista} thumbUrl={thumbUrl} finalUrl={finalUrl} />
                  </div>
                  <RodapeDaDecisao {...doRodape} />
                </>
              )}
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
