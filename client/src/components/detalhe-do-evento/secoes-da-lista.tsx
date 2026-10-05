// ─────────────────────────────────────────────────────────────────────────────
// AS SEÇÕES DA LISTA DE PEÇAS — por grupo pai e tipo (como a produção lê) ou
// pela etapa (para achar o que travou).
//
// UMA TABELA SÓ, À VISTA. Cada tipo era um cartão próprio com o cabeçalho de
// colunas repetido e ~100px de vazio entre um e outro: num evento de seis
// tipos, seis "ID · REFERÊNCIA · DESCRIÇÃO…" iguais e a lista ocupava três
// telas. Agora a lista mora num painel só: o cabeçalho de colunas aparece uma
// vez (no topo) e cada tipo — ou cada etapa — é uma faixa dentro do painel.
// As larguras são as MESMAS em todos os blocos (table-layout fixed com as
// mesmas porcentagens), então as colunas alinham de cima a baixo.
//
// No celular (área útil estreita) a lista vira cartões, com o título de cada
// tipo acima deles — ali não há colunas para alinhar.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import { getStatusMeta } from "@/lib/status";
import { T, N, TOM, FONT, FS, FW, R, SHADOW } from "@/lib/theme";
import { CartaoDaPeca, LinhaDaPeca, type PropsDaPeca } from "./linha-da-peca";
import { plural } from "./regras";
import type { Agrupamento } from "./use-lista-de-pecas";
import type { PecaDoEvento } from "./tipos";

/**
 * DOIS STATUS, UM RÓTULO (o mesmo agrupamento dos chips do resumo):
 * awaiting_finalization e awaiting_creator_review chamam-se "Aguardando
 * Finalização" — eram duas seções com o mesmo título, uma embaixo da outra.
 */
function juntarPorRotulo(secoes: [string, PecaDoEvento[]][]): [string, PecaDoEvento[]][] {
  const porRotulo = new Map<string, [string, PecaDoEvento[]]>();
  for (const [status, lista] of secoes) {
    const rotulo = getStatusMeta(status).label;
    const atual = porRotulo.get(rotulo);
    if (atual) atual[1] = [...atual[1], ...lista];
    else porRotulo.set(rotulo, [status, lista]);
  }
  return Array.from(porRotulo.values());
}

/**
 * A LINHA É A MESMA NOS DOIS MODOS: o bloco da tabela (cabeçalho, linhas,
 * cartões do celular) é UMA função, chamada pela montagem por tipo e pela
 * montagem por status — senão as colunas divergem no primeiro ajuste que só
 * uma delas recebe.
 */
export function SecoesDaLista({ agrupar, secoesPorStatus, sortedGroups, groupMap, emCards, compacto, linha }: {
  agrupar: Agrupamento;
  secoesPorStatus: [string, PecaDoEvento[]][];
  sortedGroups: string[];
  groupMap: Record<string, Record<string, PecaDoEvento[]>>;
  /** Área útil estreita: cartões em vez da tabela (régua em use-mobile.tsx). */
  emCards: boolean;
  compacto: boolean;
  linha: PropsDaPeca;
}) {
  const secoesDeStatus = juntarPorRotulo(secoesPorStatus);

  const colunas = compacto ? ([
    ['ID', '11%'],
    ['Referência', '13%'],
    ['Descrição', '28%'],
    ['Qtd', '7%'],
    ['Medidas', '15%'],
    ['Status', '15%'],
    ['Ações', '11%'],
  ] as const) : ([
    ['ID', '9%'],
    ['Referência', '11%'],
    ['Descrição', '20%'],
    ['Qtd', '5%'],
    ['Medidas', '12%'],
    ['M²', '7%'],
    ['Patrocinador', '11%'],
    ['Status', '14%'],
    ['Ações', '11%'],
  ] as const);

  const renderTabelaDeItens = (typeItems: PecaDoEvento[]) => (
    <>
      {/* CARTÕES pela ÁREA ÚTIL, não pela janela: a tabela tem `minWidth`
          e a coluna de Ações é a última — no tablet com a barra lateral
          aberta ela ficava fora da tela. */}
      {emCards ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {typeItems.map(item => (
            <CartaoDaPeca key={item.id} item={item} {...linha} />
          ))}
        </div>
      ) : (
        // Rolagem horizontal própria por bloco, com table-layout fixed e as
        // MESMAS larguras em todos — as colunas alinham como numa tabela só.
        // PORCENTAGENS SOMANDO 100: com `fixed`, uma coluna `auto` ao lado
        // de outras em px resolve para ZERO. DENSIDADE COMPACTA (área útil de
        // 820 a 1180px): M² desce para baixo das medidas e Patrocinador para
        // baixo da descrição — é o que mantém Ações dentro da tela.
        <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: compacto ? 720 : 960, borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <colgroup>
            {colunas.map(([col, width]) => <col key={col} style={{ width }} />)}
          </colgroup>
          {/* Cabeçalho para o LEITOR DE TELA em cada bloco (a tabela de
              dados continua dizendo o nome de cada coluna); o que se VÊ é o
              cabeçalho único no topo do painel. */}
          <thead className="sr-only">
            <tr>{colunas.map(([col]) => <th key={col} scope="col">{col}</th>)}</tr>
          </thead>
          <tbody>
            {typeItems.map(item => (
              <LinhaDaPeca key={item.id} item={item} compacto={compacto} {...linha} />
            ))}
          </tbody>
        </table>
        </div>
      )}
    </>
  );

  /** A faixa que nomeia um bloco: tipo (ou etapa) e quantas peças. */
  const faixa = (rotulo: React.ReactNode, n: number, opts?: { ponto?: string; nivel?: 'grupo' | 'tipo' }) => {
    const grupo = opts?.nivel === 'grupo';
    if (emCards) {
      return (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '0 2px 10px' }}>
          <h3 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, letterSpacing: '-0.01em', color: T.text, margin: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
            {opts?.ponto && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: opts.ponto, flexShrink: 0 }} />}
            {rotulo}
          </h3>
          <span style={{ fontSize: FS.meta, color: T.second, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n} {plural(n, 'peça', 'peças')}</span>
        </div>
      );
    }
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: grupo ? '10px 16px' : '9px 16px',
        backgroundColor: grupo ? N.n2 : N.n1,
        borderTop: `1px solid ${T.border}`,
      }}>
        {opts?.ponto && <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: opts.ponto, flexShrink: 0 }} />}
        <h3 style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.body, fontWeight: FW.forte, letterSpacing: '0.04em', textTransform: 'uppercase', color: T.text, minWidth: 0, overflowWrap: 'anywhere' }}>
          {rotulo}
        </h3>
        <span style={{ fontSize: FS.meta, color: T.second, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {n} {plural(n, 'peça', 'peças')}
        </span>
      </div>
    );
  };

  // O painel que abraça a lista (só na tabela; os cartões têm borda própria),
  // com o cabeçalho de colunas UMA vez, no topo — as mesmas larguras dos
  // blocos de baixo. É só visual (aria-hidden): cada bloco tem o seu para o
  // leitor de tela.
  const painel = (conteudo: React.ReactNode) => emCards
    ? <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>{conteudo}</div>
    : (
      <div data-testid="painel-da-lista" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ overflowX: 'hidden' }}>
          <table role="presentation" style={{ tableLayout: 'fixed', borderCollapse: 'collapse', width: '100%', minWidth: compacto ? 720 : 960 }}>
            <colgroup>{colunas.map(([col, width]) => <col key={col} style={{ width }} />)}</colgroup>
            <thead>
              <tr>
                {colunas.map(([col]) => (
                  <th
                    key={col}
                    style={{
                      padding: col === 'ID' ? '12px 8px 12px 16px' : '12px 10px',
                      fontSize: FS.micro, fontWeight: FW.forte, textTransform: 'uppercase', letterSpacing: '0.07em',
                      // #a8a29e em 10–11px reprova AA: T.second passa.
                      color: T.second, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      // Números à direita (Qtd, M²): as casas alinham e a
                      // coluna se lê de cima a baixo sem caçar dígito.
                      textAlign: col === 'Ações' || col === 'Qtd' || col === 'M²' ? 'right' : 'left',
                    }}>
                    {col === 'Ações' ? '' : col}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        {conteudo}
      </div>
    );

  if (agrupar === 'status') {
    return painel(secoesDeStatus.map(([status, lista]) => {
      const m = getStatusMeta(status);
      return (
        <section key={status} data-testid={`secao-status-${status}`} aria-label={m.label}>
          {faixa(m.label, lista.length, { ponto: m.dot })}
          {renderTabelaDeItens(lista)}
        </section>
      );
    }));
  }

  return painel(sortedGroups.map(group => {
    const kit = group.startsWith('KIT');
    const total = Object.values(groupMap[group]).reduce((n, l) => n + l.length, 0);
    return (
      <Fragment key={group || '__nogroup'}>
        {/* ── Grupo Pai: a faixa de cima, com a cor da família (roxo no Kit). */}
        {group && (
          emCards ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span data-testid={kit ? 'grupo-kit' : undefined} style={{
                backgroundColor: kit ? TOM.roxo.bg : TOM.info.bg, color: kit ? TOM.roxo.text : TOM.info.text,
                border: `1px solid ${kit ? TOM.roxo.border : TOM.info.border}`,
                fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '4px 12px', borderRadius: R.pill, fontFamily: FONT.display, whiteSpace: 'nowrap',
              }}>
                {group}
              </span>
              <div style={{ flex: 1, height: 1, backgroundColor: kit ? TOM.roxo.border : TOM.info.border }} />
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 10px', borderTop: `1px solid ${T.border}`, backgroundColor: T.surface }}>
              <span data-testid={kit ? 'grupo-kit' : undefined} style={{
                backgroundColor: kit ? TOM.roxo.bg : TOM.info.bg, color: kit ? TOM.roxo.text : TOM.info.text,
                border: `1px solid ${kit ? TOM.roxo.border : TOM.info.border}`,
                fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: '0.1em', textTransform: 'uppercase',
                padding: '3px 10px', borderRadius: R.sm, fontFamily: FONT.display, whiteSpace: 'nowrap',
              }}>
                {group}
              </span>
              <span style={{ fontSize: FS.meta, color: T.second, fontVariantNumeric: 'tabular-nums' }}>{total} {plural(total, 'peça', 'peças')}</span>
            </div>
          )
        )}

        {Object.entries(groupMap[group]).map(([type, typeItems]) => (
          <section key={type} aria-label={type}>
            {faixa(type, typeItems.length)}
            {renderTabelaDeItens(typeItems)}
          </section>
        ))}
      </Fragment>
    );
  }));
}
