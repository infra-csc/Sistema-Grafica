// ─────────────────────────────────────────────────────────────────────────────
// O CABEÇALHO DO MODAL DE REVISÃO: a peça, o evento com o prazo de Aprovação
// de Layout, e a navegação da fila (anterior, próxima, fechar).
//
// NO CELULAR (29/09, 2ª passada) o cabeçalho tem DUAS linhas e não três: o
// título divide a primeira com o X (onde se procura o fechar), e o prazo
// divide a segunda com "7/17 ‹ ›". A fileira só de navegação custava 56px
// entre o título e a arte — era ela que empurrava a primeira decisão para
// baixo do rodapé fixo em 360×740. A miniatura some no celular: a arte
// inteira vem logo abaixo.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { ChevronLeft, ChevronRight, FileText, X } from "lucide-react";
import { format } from "date-fns";
import { SeloKit } from "@/components/kit/selo-kit";
import { Botao } from "@/components/ui/botao";
import { prazoAprovacaoLayout } from "@/lib/atendimento-prazo";
import { miniatura } from "@/lib/miniatura";
import { toUTCDisplayDate } from "@/lib/utils";
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { aoFalharMiniatura, posicaoNaFila } from "./regras";
import { botaoQuadrado, codigoDaPeca, letra } from "./estilos";
import type { EventoAtendimento, PecaAtendimento } from "./tipos";

/** O prazo de Aprovação de Layout da peça, vermelho quando venceu. */
function PrazoDaPeca({ ev, hoje, toque }: { ev: EventoAtendimento | undefined; hoje: Date; toque: boolean }) {
  // O prazo desta tela é o marco de APROVAÇÃO DE LAYOUT, não a saída do
  // caminhão: aqui o patrocinador decide. A conta é a mesma regra pura do
  // card da lista e do filtro "Atrasados".
  const p = prazoAprovacaoLayout(ev, hoje);
  if (!p) return null;
  // VENCIDO fica vermelho e POR EXTENSO: a tela inteira existe para não
  // deixar vencer, e a cor sozinha não basta (WCAG 1.4.1).
  const venceu = p.diff < 0;
  return (
    <span data-testid="prazo-da-peca" style={{
      fontSize: letra(FS.meta, toque), fontWeight: venceu ? FW.forte : FW.medio,
      color: venceu ? TOM.perigo.text : T.second,
      // No toque a linha divide espaço com as setas: quebra em vez de vazar
      // por cima do contador "8/18" (visto a 375px, 02/10).
      fontVariantNumeric: 'tabular-nums', whiteSpace: toque ? 'normal' : 'nowrap',
    }}>
      Aprovação até {format(toUTCDisplayDate(p.limite.toISOString()), "dd/MM HH:mm")}
      {venceu && " · vencida"}
    </span>
  );
}

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
  const toque = isMobile || dedo;
  const { indice, temAnterior, temProxima, total } = posicaoNaFila(reviewQueue, selectedItem.id);
  const naFila = indice >= 0 && total > 1;
  const tamanho = dedo || isMobile ? 'toque' as const : 'md' as const;
  const quadrado = botaoQuadrado(dedo || isMobile);

  // Os TRÊS botões do canto (anterior, próxima, fechar) com a mesma forma —
  // o <Botao> da casa, com hover, foco e desligado dele. As setas anunciam o
  // atalho de teclado (aria-keyshortcuts) e o mostram no title.
  const setas = naFila && (
    <>
      <span data-testid="posicao-na-fila" style={{ fontSize: letra(FS.meta, toque), fontWeight: FW.forte, color: T.second, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', marginRight: 4 }}>
        {isMobile ? `${indice + 1}/${total}` : `Peça ${indice + 1} de ${total}`}
      </span>
      {/* aria-label: só com o title o leitor de tela lia "botão" sem nome
          em dois ícones de seta. */}
      <Botao
        variante="secundario"
        tamanho={tamanho}
        icone={ChevronLeft}
        tamanhoDoIcone={16}
        onClick={() => temAnterior && goToAdjacentItem(-1)}
        disabled={!temAnterior}
        data-testid="button-prev-item"
        title="Peça anterior (←)"
        aria-label="Peça anterior"
        aria-keyshortcuts="ArrowLeft"
        style={quadrado}
      />
      <Botao
        variante="secundario"
        tamanho={tamanho}
        icone={ChevronRight}
        tamanhoDoIcone={16}
        onClick={() => temProxima && goToAdjacentItem(1)}
        disabled={!temProxima}
        data-testid="button-next-item"
        title="Próxima peça (→)"
        aria-label="Próxima peça"
        aria-keyshortcuts="ArrowRight"
        style={quadrado}
      />
    </>
  );
  const fechar = (
    <Botao
      variante="secundario"
      tamanho={tamanho}
      icone={X}
      tamanhoDoIcone={16}
      onClick={() => setDialogOpen(false)}
      data-testid="button-close-dialog"
      aria-label="Fechar"
      title="Fechar (Esc)"
      style={quadrado}
    />
  );
  // O TÍTULO diz o que é a peça (era "REVISÃO DE ATIVO #3524": três palavras
  // sobre o modal e nenhuma sobre a PEÇA), com o código em mono ao lado.
  const titulo = (
    <h2 title={selectedItem.type || undefined} style={{
      fontFamily: FONT.display,
      fontSize: isMobile ? 17 : 18, fontWeight: FW.forte, letterSpacing: '-0.02em',
      color: T.text, margin: 0, lineHeight: 1.25,
      display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0,
    }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {selectedItem.type || 'Peça'}
      </span>
      <span style={codigoDaPeca(toque, FS.body)}>{selectedItem.displayId}</span>
      <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />
    </h2>
  );
  const nomeDoEvento = (
    <span title={ev?.name || undefined} style={{ fontSize: letra(FS.meta, toque), fontWeight: FW.medio, color: T.second, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
      {ev?.name || 'Sem evento'}
    </span>
  );

  if (isMobile) {
    return (
      <div data-testid="cabecalho-da-revisao" style={{ padding: '10px 10px 10px 16px', borderBottom: `1px solid ${N.n3}`, backgroundColor: T.bg, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div style={{ flex: '1 1 0%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
            {titulo}
            {nomeDoEvento}
          </div>
          {fechar}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ flex: '1 1 0%', minWidth: 0 }}>
            <PrazoDaPeca ev={ev} hoje={hoje} toque />
          </div>
          {setas}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="cabecalho-da-revisao" style={{
      padding: '18px 20px 18px 24px', borderBottom: `1px solid ${N.n3}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16,
      backgroundColor: T.bg, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: '1 1 auto' }}>
        <div style={{
          width: 40, height: 40, borderRadius: R.md + 2, overflow: 'hidden', flexShrink: 0,
          backgroundColor: N.n2, border: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
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
                  <FileText aria-hidden="true" style={{ width: 18, height: 18, color: T.second }} />
                </div>
              </>
            : <FileText aria-hidden="true" style={{ width: 18, height: 18, color: T.second }} />}
        </div>
        <div style={{ minWidth: 0 }}>
          {titulo}
          {/* Evento e prazo em caixa normal, separados por um ponto. */}
          <div style={{ display: 'flex', alignItems: 'center', columnGap: 8, rowGap: 2, marginTop: 4, flexWrap: 'wrap', minWidth: 0 }}>
            {nomeDoEvento}
            {prazoAprovacaoLayout(ev, hoje) && <span aria-hidden="true" style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: T.bdark }} />}
            <PrazoDaPeca ev={ev} hoje={hoje} toque={toque} />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        {/* A dica do atalho ← → mora no rodapé (barra de ações), uma vez só. */}
        {setas}
        {naFila && <span aria-hidden="true" style={{ width: 1, height: 20, backgroundColor: T.border, margin: '0 4px' }} />}
        {fechar}
      </div>
    </div>
  );
}
