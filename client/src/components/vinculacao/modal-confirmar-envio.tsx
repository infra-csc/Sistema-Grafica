// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMAR O ENVIO PARA A ARTE — a conferência antes do envio: cada peça com
// os patrocinadores que leva, e as que vão sem marca destacadas (com o
// recorte "Ver só essas"). Depois do envio o vínculo só se acrescenta.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { SeloKit } from "@/components/kit/selo-kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { alvo, useIsMobile } from "@/hooks/use-mobile";
import { TOM, T, N, R, FS, FW, FONT } from "@/lib/theme";
import type {
  EventoDaVinculacao, PatrocinadorDaVinculacao, ProgressoDoEnvio, SendConfirmModal,
} from "./tipos";

type Props = {
  sendConfirmModal: SendConfirmModal | null;
  setSendConfirmModal: (m: SendConfirmModal | null) => void;
  isSending: boolean;
  soSemPatrocinador: boolean;
  setSoSemPatrocinador: Dispatch<SetStateAction<boolean>>;
  originalSponsorsMap: Record<string, string[]>;
  sponsors: PatrocinadorDaVinculacao[];
  events: EventoDaVinculacao[];
  progressoEnvio: ProgressoDoEnvio | null;
  handleModalConfirmSend: () => void;
  enviando: boolean;
  dedo: boolean;
};

export function ModalConfirmarEnvio({
  sendConfirmModal, setSendConfirmModal, isSending, soSemPatrocinador, setSoSemPatrocinador,
  originalSponsorsMap, sponsors, events, progressoEnvio, handleModalConfirmSend, enviando, dedo,
}: Props) {
  const isMobile = useIsMobile();
  const lado = isMobile ? 16 : 24;
  return (
    <Dialog open={!!sendConfirmModal} onOpenChange={(open) => { if (!open && !isSending) setSendConfirmModal(null); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={{ ...modalSurface(680), gap: 0 }}>
        {/* POR QUE congelar aqui: o onSuccess do envio invalida /api/items,
            /api/audit-logs e /api/notifications, esvazia `selectedItemIds`,
            limpa os otimistas, fecha e toasta — no mesmo commit. O corpo
            inteiro (a lista de peças e o contador do botão) vem de
            `sendConfirmModal`, que acabou de virar null: sem congelar o
            modal se esvazia durante toda a animação de saída, com três
            invalidações renderizando a página por cima. */}
        <FreezeWhileClosing open={!!sendConfirmModal}>
        <DialogTitle className="sr-only">Confirmar envio para a Arte</DialogTitle>
        <DialogDescription className="sr-only">Revise as peças e os patrocinadores antes de enviar para a Arte</DialogDescription>

        {/* CASCA PADRÃO, como todo modal. O número de peças não se repete
            num selo no cabeçalho: ele está na faixa logo abaixo e no botão
            de enviar. Durante o envio o X some (o onOpenChange já bloqueia). */}
        <ModalHeader
          icon={Send}
          tint={T.accentText}
          title="Enviar para Arte"
          subtitle="Confira os patrocinadores de cada peça — depois do envio o vínculo só se acrescenta, não se troca."
          compacto={isMobile}
          onClose={isSending ? undefined : () => setSendConfirmModal(null)}
        />

        {/* Contadores: quantas levam marca e quantas vão sem. */}
        {sendConfirmModal && (() => {
          const withSponsors = sendConfirmModal.items.filter(item => {
            const confirmed = originalSponsorsMap[item.id] || [];
            const newOnes = Array.from(sendConfirmModal.pendingByItem[item.id] || []);
            return [...confirmed, ...newOnes].length > 0;
          }).length;
          const withoutSponsors = sendConfirmModal.items.length - withSponsors;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: `12px ${lado}px`, borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg, flexShrink: 0 }}>
              <Selo tom="sucesso" icone={CheckCircle2}>{withSponsors} com patrocinador</Selo>
              {withoutSponsors > 0 && (
                <>
                  <Selo tom="alerta" icone={AlertTriangle}>{withoutSponsors} sem patrocinador</Selo>
                  {/* VER SÓ ESSAS. O aviso dizia "3 sem patrocinador" e
                      deixava a conferência por conta de quem rolasse: numa
                      lista de trinta, as três em âmbar ficam espalhadas.
                      Enviar sem marca é decisão legítima — mas tem de ser
                      uma decisão, e para isso precisa ser vista.
                      Alternador (aria-pressed), por isso não é <Botao>. */}
                  <button
                    type="button"
                    onClick={() => setSoSemPatrocinador(v => !v)}
                    aria-pressed={soSemPatrocinador}
                    data-testid="button-so-sem-patrocinador"
                    className="vinc-chip"
                    style={{
                      marginLeft: 'auto', flexShrink: 0,
                      height: alvo(30, dedo), padding: '0 12px', borderRadius: R.sm,
                      backgroundColor: soSemPatrocinador ? TOM.alerta.bg : T.surface,
                      color: soSemPatrocinador ? TOM.alerta.text : T.strong,
                      border: `1px solid ${soSemPatrocinador ? TOM.alerta.border : T.border}`, cursor: 'pointer',
                      font: 'inherit', fontSize: FS.meta, fontWeight: FW.forte, whiteSpace: 'nowrap',
                    }}
                  >
                    {soSemPatrocinador ? 'Ver todas' : 'Ver só essas'}
                  </button>
                </>
              )}
            </div>
          );
        })()}

        {/* ── Lista de itens ──
            UMA LISTA COM DIVISÓRIAS, não um cartão por peça. Eram cartões
            com número, selo laranja do ID, chip do evento, ícone ✓/⚠ e, nas
            sem marca, fundo âmbar + selo âmbar + ícone âmbar: três avisos
            para a mesma coisa. Agora a peça sem patrocinador tem UMA marca —
            a faixa âmbar à esquerda e o selo — e a lista se lê como lista.
            O corpo rola (`flex: 1 1 auto` + `minHeight: 0`) sob o teto do
            modalSurface; cabeçalho e rodapé ficam. */}
        <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: `14px ${lado}px` }}>
          <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: 'hidden' }}>
            {(sendConfirmModal?.items ?? [])
              // O recorte não muda o que vai ser enviado — só o que está à
              // vista. O rodapé continua contando a lista inteira.
              .filter(item => {
                if (!soSemPatrocinador) return true;
                const confirmed = originalSponsorsMap[item.id] || [];
                const newOnes = Array.from(sendConfirmModal?.pendingByItem[item.id] || []);
                return [...confirmed, ...newOnes].length === 0;
              })
              .map((item, idx) => {
              const confirmed = (originalSponsorsMap[item.id] || []);
              const newOnes = Array.from(sendConfirmModal?.pendingByItem[item.id] || []);
              const allLinkedIds = Array.from(new Set([...confirmed, ...newOnes]));
              const linkedSponsors = allLinkedIds
                .map(sid => sponsors.find((s) => s.id === sid))
              .filter((s): s is PatrocinadorDaVinculacao => Boolean(s));
              const eventName = events.find(e => e.id === item.eventId)?.name;
              const hasSponsor = linkedSponsors.length > 0;

              return (
                <div key={item.id} data-testid={`envio-peca-${item.id}`} style={{
                  padding: '11px 14px 12px',
                  borderTop: idx === 0 ? 'none' : `1px solid ${N.n3}`,
                  borderLeft: `3px solid ${hasSponsor ? 'transparent' : TOM.alerta.dot}`,
                  backgroundColor: T.surface,
                }}>
                  {/* Tipo, evento e descrição quebram linha em vez de
                      cortar com reticência: aqui é a conferência antes do
                      envio, e o pedaço cortado é o que se confere. */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: FW.forte, color: T.second, flexShrink: 0 }}>
                      {item.displayId}
                    </span>
                    <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text }}>
                      {item.type}
                    </span>
                    <SeloKit peca={item} style={{ flexShrink: 0, alignSelf: 'center' }} />
                    {eventName && (
                      <span style={isMobile
                        ? { flexBasis: '100%', fontSize: FS.meta, color: T.apoio }
                        : { marginLeft: 'auto', fontSize: FS.meta, color: T.apoio, textAlign: 'right' }}>
                        {eventName}
                      </span>
                    )}
                  </div>

                  {item.description && (
                    <p style={{ fontSize: FS.meta, color: T.apoio, margin: '2px 0 0', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.description}
                    </p>
                  )}

                  {/* Patrocinadores ou o aviso */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {hasSponsor ? linkedSponsors.map((sp) => {
                      const isNew = newOnes.includes(sp.id);
                      return (
                        <Selo
                          key={sp.id}
                          ponto
                          cores={isNew
                            ? { bg: TOM.laranja.bg, text: T.strong, border: TOM.laranja.border, dot: sp.color || T.accent }
                            : { bg: T.bg, text: T.strong, border: T.border, dot: sp.color || T.muted }}
                          style={{ fontWeight: FW.medio }}
                          title={isNew ? 'Ainda não salvo — entra junto com o envio' : undefined}
                        >
                          {sp.name}
                          {isNew && <span style={{ color: T.accentText, fontWeight: FW.forte, letterSpacing: '0.04em', fontSize: FS.micro }}>NOVO</span>}
                        </Selo>
                      );
                    }) : (
                      <Selo tom="alerta" icone={AlertTriangle}>Sem patrocinadores vinculados</Selo>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Rodapé ── */}
        <ModalFooter fundo={T.bg} style={{ flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'space-between', gap: 12, padding: isMobile ? '12px 16px' : '14px 24px' }}>
          {/* Dizia "as peças saem desta tela" — e não saem: ficam aqui como
              Enviado, travadas. A frase agora diz o que acontece de fato e
              quem age a seguir. */}
          <p style={{ margin: 0, fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, maxWidth: isMobile ? undefined : 320 }}>
            As peças entram na fila da Arte, que faz o layout para os patrocinadores aprovarem. Aqui elas ficam como Enviado.
          </p>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              onClick={() => setSendConfirmModal(null)}
              disabled={!!isSending}
              data-testid="button-close-send-modal"
            >
              Cancelar
            </Botao>
            {/* A AÇÃO DA TELA — primário do design system (escuro). Era um
                gradiente laranja com hover por JS; o laranja é da marca, e
                o botão principal é o mesmo em todo o app. */}
            <Botao
              variante="primario"
              tamanho={dedo ? "toque" : "md"}
              icone={Send}
              onClick={handleModalConfirmSend}
              disabled={isSending || enviando}
              carregando={isSending || enviando}
              style={isMobile ? { flex: '1 1 0' } : undefined}
            >
              {(isSending || enviando)
                ? (progressoEnvio && progressoEnvio.total > 0 ? `Sincronizando ${progressoEnvio.feito}/${progressoEnvio.total}…` : 'Enviando…')
                : `Enviar ${sendConfirmModal?.items.length ?? 0} para a Arte`}
            </Botao>
          </div>
        </ModalFooter>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
