// ─────────────────────────────────────────────────────────────────────────────
// O CABEÇALHO DO MODAL DE REVISÃO: a peça, o evento com o prazo de Aprovação
// de Layout, e a navegação da fila (anterior, próxima, fechar).
//
// NO CELULAR o cabeçalho QUEBRA em duas linhas (peça em cima, navegação da
// fila embaixo). Numa fileira só, o bloco da peça não tinha `minWidth: 0` e
// não encolhia: com "Peça 3 de 41", as duas setas e o fechar, o X saía da
// tela em 390px — o modal ficava sem saída visível além do Esc.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { ChevronRight, FileText, X } from "lucide-react";
import { format } from "date-fns";
import { SeloKit } from "@/components/kit/selo-kit";
import { alvo } from "@/hooks/use-mobile";
import { prazoAprovacaoLayout } from "@/lib/atendimento-prazo";
import { miniatura } from "@/lib/miniatura";
import { toUTCDisplayDate } from "@/lib/utils";
import { R, T, N, TOM, FONT } from "@/lib/theme";
import { aoFalharMiniatura } from "./regras";
import type { EventoAtendimento, PecaAtendimento } from "./tipos";

export function CabecalhoDaRevisao({
  selectedItem, ev, thumbUrl, isMobile, dedo, hoje, reviewQueue, goToAdjacentItem, setDialogOpen,
}: {
  selectedItem: PecaAtendimento;
  ev: EventoAtendimento | undefined;
  thumbUrl: string | null;
  isMobile: boolean;
  dedo: boolean;
  hoje: Date;
  reviewQueue: PecaAtendimento[];
  goToAdjacentItem: (dir: 1 | -1) => void;
  setDialogOpen: Dispatch<SetStateAction<boolean>>;
}) {
  return (
    <div style={{
      padding: isMobile ? '14px 16px' : '20px 24px', borderBottom: `1px solid ${N.n3}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? 10 : 16,
      backgroundColor: T.bg, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 12 : 16, minWidth: 0, flex: '1 1 auto' }}>
        <div style={{
          width: 38, height: 38, borderRadius: 10, overflow: 'hidden', flexShrink: 0,
          backgroundColor: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {thumbUrl
            ? <>
                <img
                  src={miniatura(thumbUrl)}
                  alt=""
                  decoding="async"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={aoFalharMiniatura}
                />
                <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                  <FileText style={{ width: 20, height: 20, color: T.surface }} />
                </div>
              </>
            : <FileText style={{ width: 20, height: 20, color: T.surface }} />}
        </div>
        <div style={{ minWidth: 0 }}>
          {/* O TÍTULO diz o que é a peça.

              Era "REVISÃO DE ATIVO #3524" — três palavras sobre o
              modal (que a pessoa acabou de abrir e já sabe que é uma
              revisão) e nenhuma sobre a PEÇA. Agora nomeia o objeto,
              com o código ao lado em mono para o olho achar o número
              sem ler a frase. */}
          <h2 title={selectedItem.type || undefined} style={{
            fontFamily: FONT.display,
            fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
            color: T.text, margin: 0, lineHeight: 1.2,
            display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0,
          }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedItem.type || 'Peça'}
            </span>
            <span style={{
              fontFamily: FONT.mono, fontSize: 13, fontWeight: 700,
              color: T.second, fontVariantNumeric: 'tabular-nums', flexShrink: 0,
            }}>
              {selectedItem.displayId}
            </span>
            <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />
          </h2>
          {/* Evento e prazo em caixa normal: em versalete espaçado a
              linha de contexto gritava tanto quanto o título, e o
              nome do evento, que pode ser longo, não quebrava. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', rowGap: 2 }}>
            <span title={ev?.name || undefined} style={{ fontSize: 12, fontWeight: 600, color: T.second, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {ev?.name || 'Sem evento'}
            </span>
            {(() => {
              // O prazo desta tela é o marco de APROVAÇÃO DE LAYOUT,
              // não a saída do caminhão: aqui o patrocinador decide,
              // e cobrar pela saída dava ao atendimento semanas de
              // folga que ele não tem. A conta era uma cópia da do
              // card da lista — agora as duas (e o filtro
              // "Atrasados") leem a mesma regra pura.
              const p = prazoAprovacaoLayout(ev, hoje);
              if (!p) return null;
              const limite = p.limite;
              // VENCIDO fica vermelho. O prazo era cinza nos dois
              // casos, com a data por extenso: quem abre a ficha
              // tinha de comparar a data com a de hoje de cabeça
              // para saber se estava atrasado — na tela cujo
              // trabalho inteiro é não deixar vencer.
              const venceu = p.diff < 0;
              return (
                <>
                  <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: T.bdark }} />
                  <span style={{
                    fontSize: 12, fontWeight: venceu ? 700 : 600,
                    color: venceu ? TOM.perigo.text : T.second,
                    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  }}>
                    Aprovação até {format(toUTCDisplayDate(limite.toISOString()), "dd/MM HH:mm")}
                    {venceu && " · vencida"}
                  </span>
                </>
              );
            })()}
          </div>
        </div>
      </div>
      {/* Navegação da fila + fechar */}
      {(() => {
        const qIdx = reviewQueue.findIndex((i) => i.id === selectedItem.id);
        const hasPrev = qIdx > 0;
        const hasNext = qIdx >= 0 && qIdx < reviewQueue.length - 1;
        // Os TRÊS botões do canto (anterior, próxima, fechar) com a
        // mesma forma e o mesmo tamanho. O fechar era um círculo de
        // 40 sem borda ao lado de dois quadrados de 40 com borda —
        // três controles vizinhos, três desenhos.
        const navBtn = (enabled: boolean): React.CSSProperties => ({
          width: alvo(36, dedo), height: alvo(36, dedo), borderRadius: R.md,
          border: `1px solid ${T.border}`,
          backgroundColor: T.surface,
          cursor: enabled ? 'pointer' : 'not-allowed',
          opacity: enabled ? 1 : 0.4,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.apoio,
        });
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
            {qIdx >= 0 && reviewQueue.length > 1 && (
              <>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.second, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  Peça {qIdx + 1} de {reviewQueue.length}
                </span>
                {/* aria-label: só com `title` o leitor de tela lia
                    "botão" sem nome em dois ícones de seta. */}
                <button
                  onClick={() => hasPrev && goToAdjacentItem(-1)}
                  disabled={!hasPrev}
                  data-testid="button-prev-item"
                  title="Peça anterior"
                  aria-label="Peça anterior"
                  style={navBtn(hasPrev)}
                >
                  <ChevronRight aria-hidden="true" style={{ width: 16, height: 16, transform: 'rotate(180deg)' }} />
                </button>
                <button
                  onClick={() => hasNext && goToAdjacentItem(1)}
                  disabled={!hasNext}
                  data-testid="button-next-item"
                  title="Próxima peça"
                  aria-label="Próxima peça"
                  style={navBtn(hasNext)}
                >
                  <ChevronRight aria-hidden="true" style={{ width: 16, height: 16 }} />
                </button>
              </>
            )}
            <button
              onClick={() => setDialogOpen(false)}
              data-testid="button-close-dialog"
              aria-label="Fechar"
              style={navBtn(true)}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>
        );
      })()}
    </div>
  );
}
