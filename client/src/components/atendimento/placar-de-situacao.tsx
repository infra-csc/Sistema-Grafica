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
//
// NO CELULAR (29/09) o placar é uma grade 2×2 com o número AO LADO do rótulo.
// Empilhados (rótulo, número de 28px, respiro), os quatro somavam ~330px de
// altura em 390 — a primeira peça da fila nascia na segunda tela.
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
  const celulas = [
    { k: 'nova_versao', titulo: 'Sua decisão', n: contagemSituacao.get('nova_versao') ?? 0,
      cor: TOM.alerta.text, anel: TOM.alerta.dot, hint: SITUACAO_META.nova_versao.hint,
      testId: 'placar-nova-versao', cruzada: false,
      ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'nova_versao',
      onClick: () => alternarSituacao('nova_versao') },
    { k: 'aguardando', titulo: 'Aguardam patrocinador', n: contagemSituacao.get('aguardando') ?? 0,
      cor: T.accentText, anel: T.accent, hint: SITUACAO_META.aguardando.hint,
      testId: 'placar-aguardando', cruzada: false,
      ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'aguardando',
      onClick: () => alternarSituacao('aguardando') },
    { k: 'aguardando_arte', titulo: 'Arte refazendo', n: contagemSituacao.get('aguardando_arte') ?? 0,
      cor: T.apoio, anel: T.apoio, hint: SITUACAO_META.aguardando_arte.hint,
      testId: 'placar-arte-refazendo', cruzada: false,
      ativo: situacaoFilter.length === 1 && situacaoFilter[0] === 'aguardando_arte',
      onClick: () => alternarSituacao('aguardando_arte') },
    { k: 'atrasados', titulo: 'Passaram do prazo', n: atrasadosNaBase.length,
      cor: TOM.perigo.text, anel: TOM.perigo.dot,
      hint: 'O prazo de Aprovação de Layout do evento já venceu — cruza com as outras três',
      testId: 'placar-atrasados', cruzada: true,
      ativo: atrasadosFilter,
      onClick: () => setAtrasadosFilter(v => !v) },
  ];

  return (
    <div
      role="group"
      aria-label="Situação da fila — cada número filtra a lista"
      style={{
        display: 'grid', marginBottom: cards ? 16 : 20,
        gridTemplateColumns: cards ? 'repeat(2, minmax(0,1fr))' : 'repeat(4, minmax(0,1fr))',
        backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg,
        overflow: 'hidden', boxShadow: '0 1px 2px rgba(28,25,23,0.06)',
      }}
    >
      {celulas.map((c, i) => (
        <button
          key={c.k}
          type="button"
          onClick={c.onClick}
          aria-pressed={c.ativo}
          data-testid={c.testId}
          title={cards ? c.hint : undefined}
          className="atd-celula-do-placar"
          style={{
            textAlign: 'left', cursor: 'pointer', minWidth: 0, fontFamily: 'inherit',
            padding: cards ? '12px 14px' : '16px 18px 15px', border: 'none',
            // No celular o número fica À ESQUERDA do rótulo (linha, não coluna).
            display: cards ? 'flex' : 'block', alignItems: 'center', gap: 12,
            // A quarta célula é de OUTRA dimensão. A régua mais forte
            // antes dela é o que impede o olho de somar as quatro.
            borderLeft: c.cruzada && !cards ? `1px solid ${T.bdark}` : undefined,
            borderRight: (i + 1) % (cards ? 2 : 4) !== 0 ? `1px solid ${N.n3}` : undefined,
            borderBottom: cards && i < 2 ? `1px solid ${N.n3}` : undefined,
            backgroundColor: c.ativo ? T.bg : T.surface,
            // LIGADO: o trilho de baixo na cor da célula + o fundo rebaixado
            // + aria-pressed. Não só a cor.
            boxShadow: c.ativo ? `inset 0 -3px 0 ${c.anel}` : 'none',
          }}
        >
          <span style={{
            display: 'block', order: cards ? 2 : undefined, minWidth: 0,
            fontSize: cards ? FS.meta : FS.small, fontWeight: cards ? FW.medio : FW.rotulo,
            letterSpacing: cards ? 0 : '0.1em', lineHeight: 1.3,
            textTransform: cards ? 'none' : 'uppercase',
            color: c.ativo ? T.text : T.apoio, marginBottom: cards ? 0 : 8,
          }}>
            {c.titulo}
          </span>
          <span style={{
            display: 'block', order: cards ? 1 : undefined, flexShrink: 0,
            fontFamily: FONT.display,
            fontSize: cards ? 26 : 34, fontWeight: FW.forte, lineHeight: 1,
            letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums',
            minWidth: cards ? 30 : undefined,
            // Zero é neutro: um "0" pintado de vermelho afirmaria o
            // contrário do que o número diz.
            color: c.n === 0 ? T.second : c.cor,
          }}>
            {loadingSponsors ? '—' : c.n}
          </span>
          {/* O `hint` do SITUACAO_META como TEXTO, não como `title`: ele
              explica o que o número significa e vivia só no hover do
              menu. NO CELULAR ele vai para leitor de tela e `title` — a
              célula já diz o essencial ("Sua decisão", "Arte refazendo"). */}
          <span className={cards ? 'sr-only' : undefined} style={cards ? undefined : { display: 'block', marginTop: 8, fontSize: FS.meta, lineHeight: 1.45, color: T.second }}>
            {c.hint}
          </span>
        </button>
      ))}
    </div>
  );
}
