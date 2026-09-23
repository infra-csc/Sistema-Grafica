// ─────────────────────────────────────────────────────────────────────────────
// PLACAR POR SITUAÇÃO — o topo da aba Pendentes.
//
// A tela mostrava UM número no cabeçalho ("Aguardam Aprovação") e a dimensão
// que de fato separa o trabalho — a SITUAÇÃO da peça — existia só como menu
// suspenso. Quem abre esta tela pergunta "o que depende de mim agora?", e a
// resposta estava fechada num dropdown.
//
// AS TRÊS PRIMEIRAS CÉLULAS SOMAM; A QUARTA NÃO.
//
// As três primeiras são chaves exclusivas de `situacaoDaPeca` — nenhuma peça
// conta em duas. A quarta é outra dimensão: "passaram do prazo" CRUZA com as
// outras (uma peça atrasada também é "aguardando" ou "nova versão"). Por isso
// ela é separada por uma régua mais forte e não entra em soma nenhuma.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { SITUACAO_META } from "./regras";

export function PlacarDeSituacao({
  cards, contagemSituacao, situacaoFilter, alternarSituacao, atrasadosNaBase, atrasadosFilter, setAtrasadosFilter, loadingSponsors,
}: {
  cards: boolean;
  contagemSituacao: Map<string, number>;
  situacaoFilter: string[];
  alternarSituacao: (k: string) => void;
  atrasadosNaBase: readonly unknown[];
  atrasadosFilter: boolean;
  setAtrasadosFilter: Dispatch<SetStateAction<boolean>>;
  loadingSponsors: boolean;
}) {
  return (
    <div style={{
      display: 'grid', marginBottom: 14,
      gridTemplateColumns: cards ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
      backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg,
      overflow: 'hidden', boxShadow: '0 1px 2px rgba(28,25,23,0.06)',
    }}>
      {[
        { k: 'nova_versao', titulo: 'Sua decisão', n: contagemSituacao.get('nova_versao') ?? 0,
          cor: TOM.alerta.text, anel: TOM.alerta.text, hint: SITUACAO_META.nova_versao.hint,
          testId: 'placar-nova-versao', cruzada: false,
          ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'nova_versao',
          onClick: () => alternarSituacao('nova_versao') },
        { k: 'aguardando', titulo: 'Aguardam patrocinador', n: contagemSituacao.get('aguardando') ?? 0,
          cor: T.accentText, anel: T.accentText, hint: SITUACAO_META.aguardando.hint,
          testId: 'placar-aguardando', cruzada: false,
          ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'aguardando',
          onClick: () => alternarSituacao('aguardando') },
        { k: 'aguardando_arte', titulo: 'Arte refazendo', n: contagemSituacao.get('aguardando_arte') ?? 0,
          cor: T.apoio, anel: T.apoio, hint: SITUACAO_META.aguardando_arte.hint,
          testId: 'placar-arte-refazendo', cruzada: false,
          ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'aguardando_arte',
          onClick: () => alternarSituacao('aguardando_arte') },
        { k: 'atrasados', titulo: 'Passaram do prazo', n: atrasadosNaBase.length,
          cor: TOM.perigo.text, anel: TOM.perigo.text,
          hint: 'O prazo de Aprovação de Layout do evento já venceu — cruza com as outras três',
          testId: 'placar-atrasados', cruzada: true,
          ativo: atrasadosFilter,
          onClick: () => setAtrasadosFilter(v => !v) },
      ].map((c, i) => (
        <button
          key={c.k}
          type="button"
          onClick={c.onClick}
          aria-pressed={c.ativo}
          data-testid={c.testId}
          title={cards ? c.hint : undefined}
          style={{
            textAlign: 'left', cursor: 'pointer', minWidth: 0,
            padding: cards ? '12px 14px' : '14px 16px', border: 'none',
            // A quarta célula é de OUTRA dimensão. A régua mais forte
            // antes dela é o que impede o olho de somar as quatro.
            borderLeft: c.cruzada && !cards ? `1px solid ${T.border}` : undefined,
            borderRight: (i + 1) % (cards ? 2 : 4) !== 0 ? `1px solid ${N.n3}` : undefined,
            borderBottom: cards && i < 2 ? `1px solid ${N.n3}` : undefined,
            backgroundColor: c.ativo ? T.bg : T.surface,
            boxShadow: c.ativo ? `inset 0 -2px 0 ${c.anel}` : 'none',
          }}
        >
          <span style={{
            display: 'block', fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: T.second, marginBottom: 6,
          }}>
            {c.titulo}
          </span>
          <span style={{
            display: 'block', fontFamily: FONT.display,
            fontSize: cards ? 28 : 34, fontWeight: FW.forte, lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            // Zero é neutro: um "0" pintado de vermelho afirmaria o
            // contrário do que o número diz.
            color: c.n === 0 ? T.second : c.cor,
          }}>
            {loadingSponsors ? '—' : c.n}
          </span>
          {/* O `hint` do SITUACAO_META como TEXTO, não como `title`: ele
              explica o que o número significa e vivia só no hover do
              menu — ou seja, existia para quem tem mouse e já sabia.
              NO CELULAR ele vai para leitor de tela e `title`: em duas
              colunas de ~180px cada frase quebrava em três ou quatro
              linhas, o placar passava de 400px de altura e empurrava a
              primeira peça para a segunda tela. O título da célula já diz
              o essencial ("Sua decisão", "Arte refazendo"). */}
          <span className={cards ? 'sr-only' : undefined} style={cards ? undefined : { display: 'block', marginTop: 6, fontSize: FS.meta, lineHeight: 1.45, color: T.second }}>
            {c.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
