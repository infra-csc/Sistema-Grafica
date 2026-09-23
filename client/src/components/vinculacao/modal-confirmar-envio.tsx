// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMAR O ENVIO PARA A ARTE — a conferência antes do envio: cada peça com
// os patrocinadores que leva, e as que vão sem marca destacadas (com o
// recorte "Ver só essas"). Depois do envio o vínculo só se acrescenta.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, Send } from "lucide-react";
import { SeloKit } from "@/components/kit/selo-kit";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { alvo } from "@/hooks/use-mobile";
import { TOM, T, R, FS, FW, FONT } from "@/lib/theme";
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
  return (
    <Dialog open={!!sendConfirmModal} onOpenChange={(open) => { if (!open && !isSending) setSendConfirmModal(null); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(680)}>
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

        {/* CASCA PADRÃO. Era um "hero" montado à mão — gradiente, dois
            círculos decorativos laranja, X próprio — e os contadores em
            verde/âmbar de fundo escuro (#4ade80, #fbbf24), cores que só
            existiam aqui. O cabeçalho agora é o mesmo de todo modal; os
            contadores descem para uma faixa clara, com os tons da paleta.
            Durante o envio o X some (o onOpenChange já bloqueia fechar). */}
        <ModalHeader
          icon={Send}
          tint={T.accentText}
          title="Enviar para Arte"
          subtitle="Confira os patrocinadores de cada peça — depois do envio o vínculo só se acrescenta, não se troca."
          onClose={isSending ? undefined : () => setSendConfirmModal(null)}
          trailing={
            <Selo cores={{ bg: 'rgba(255,255,255,0.12)', text: T.surface, border: 'rgba(255,255,255,0.18)' }} style={{ flexShrink: 0 }}>
              {sendConfirmModal?.items.length ?? 0} {(sendConfirmModal?.items.length ?? 0) === 1 ? 'peça' : 'peças'}
            </Selo>
          }
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '14px 32px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg, flexShrink: 0 }}>
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
            ALTURA: hero de ~150 + lista de até 360 + rodapé 77 = 587px. Em 445
            de altura cortava 71px de cada lado — sumiam o título do hero e o
            botão "Enviar" juntos. O `maxHeight: 360` da ScrollArea limita a
            lista, nunca o modal; `flex: 0 1 auto` + `minHeight: 0` deixa a
            ScrollArea encolher abaixo dos 360 sob o teto do `modalSurface`. */}
        <ScrollArea style={{ maxHeight: 360, flex: '0 1 auto', minHeight: 0 }}>
          <div style={{ padding: '20px 32px', display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                <div key={item.id} style={{
                  padding: '14px 16px',
                  borderRadius: R.lg,
                  border: `1px solid ${hasSponsor ? T.border : TOM.alerta.border}`,
                  backgroundColor: hasSponsor ? T.surface : TOM.alerta.bg,
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  transition: 'box-shadow 0.15s',
                }}>
                  {/* Index number */}
                  <div style={{ width: 26, height: 26, borderRadius: R.sm, background: hasSponsor ? T.low : TOM.alerta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: hasSponsor ? T.second : TOM.alerta.text }}>{idx + 1}</span>
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <Selo forma="retangulo" cores={TOM.laranja} style={{ fontFamily: FONT.mono, flexShrink: 0, padding: '1px 6px' }}>
                        {item.displayId}
                      </Selo>
                      <SeloKit peca={item} style={{ flexShrink: 0 }} />
                      {/* Tipo, evento e descrição quebram linha em vez de
                          cortar com reticência: aqui é a conferência antes do
                          envio, e o pedaço cortado é o que se confere. */}
                      <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.text, flex: 1, minWidth: 120 }}>
                        {item.type}
                      </span>
                      {eventName && (
                        <span style={{ fontSize: FS.small, color: T.second, background: T.low, borderRadius: R.sm, padding: '2px 7px' }}>
                          {eventName}
                        </span>
                      )}
                    </div>

                    {item.description && (
                      <p style={{ fontSize: FS.meta, color: T.second, marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {item.description}
                      </p>
                    )}

                    {/* Sponsors or warning */}
                    {hasSponsor ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {linkedSponsors.map((sp) => {
                          const isNew = newOnes.includes(sp.id);
                          return (
                            <Selo
                              key={sp.id}
                              ponto
                              cores={isNew
                                ? { bg: TOM.laranja.bg, text: T.strong, border: TOM.laranja.border, dot: T.accent }
                                : { bg: T.low, text: T.strong, border: T.border, dot: T.muted }}
                              style={{ fontWeight: FW.medio }}
                            >
                              {sp.name}
                              {isNew && <span style={{ color: T.accentText, fontWeight: FW.forte, letterSpacing: '0.04em' }}>+NOVO</span>}
                            </Selo>
                          );
                        })}
                      </div>
                    ) : (
                      <Selo tom="alerta" icone={AlertTriangle}>Sem patrocinadores vinculados</Selo>
                    )}
                  </div>

                  {/* Check/warn icon */}
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    {hasSponsor
                      ? <CheckCircle2 style={{ width: 16, height: 16, color: TOM.sucesso.dot }} />
                      : <AlertTriangle style={{ width: 16, height: 16, color: TOM.alerta.dot }} />
                    }
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* ── Footer ── */}
        <div style={{ flexShrink: 0, padding: '18px 32px', borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          {/* A consequência é a saída daqui, não só a chegada lá: a peça
              deixa esta tela e não volta a aparecer nela. */}
          {/* Dizia "as peças saem desta tela" — e não saem: ficam aqui como
              Enviado, travadas. A frase agora diz o que acontece de fato e
              quem age a seguir. */}
          <p style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.45, maxWidth: 340 }}>
            As peças entram na fila da Arte, que faz o layout para os patrocinadores aprovarem. Aqui elas ficam como Enviado.
          </p>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <Botao
              variante="fantasma"
              tamanho="toque"
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
              tamanho="toque"
              icone={Send}
              onClick={handleModalConfirmSend}
              disabled={isSending || enviando}
              carregando={isSending || enviando}
            >
              {(isSending || enviando)
                ? (progressoEnvio && progressoEnvio.total > 0 ? `Sincronizando ${progressoEnvio.feito}/${progressoEnvio.total}…` : 'Enviando…')
                : `Enviar ${sendConfirmModal?.items.length ?? 0} para a Arte`}
            </Botao>
          </div>
        </div>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
