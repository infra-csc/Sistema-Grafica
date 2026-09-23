// ─────────────────────────────────────────────────────────────────────────────
// AS SEÇÕES DA LISTA DE PEÇAS — por grupo pai e tipo (como a produção lê) ou
// pela etapa (para achar o que travou).
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import { Selo } from "@/components/ui/selo";
import { getStatusMeta } from "@/lib/status";
import { T, N, TOM, FONT } from "@/lib/theme";
import { CartaoDaPeca, LinhaDaPeca, type PropsDaPeca } from "./linha-da-peca";
import type { Agrupamento } from "./use-lista-de-pecas";
import type { PecaDoEvento } from "./tipos";

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
  const renderTabelaDeItens = (typeItems: PecaDoEvento[]) => (
    <>
      {/* Tabela do grupo */}
      <div style={{ backgroundColor: T.surface, borderRadius: '12px', overflow: 'hidden' }}>
        {/* CARTÕES pela ÁREA ÚTIL, não pela janela: a tabela tem
            `minWidth: 960` e a coluna de Ações é a última — no tablet
            com a barra lateral aberta ela ficava fora da tela. */}
        {emCards ? (
          <div style={{ padding: '8px' }}>
            {typeItems.map(item => (
              <CartaoDaPeca key={item.id} item={item} {...linha} />
            ))}
          </div>
        ) : (
        // Rolagem horizontal própria por seção, mas com table-layout
        // fixed e as MESMAS larguras de coluna em todas as seções —
        // assim as colunas alinham visualmente entre os tipos, como
        // se fosse uma tabela só. Material/Acabamento viraram a 2ª
        // linha da Descrição (11→9 colunas), o que baixou o minWidth
        // de 1120 para 840.
        <div style={{ overflowX: 'auto' }}>
        {/* PORCENTAGENS SOMANDO 100. Com `table-layout: fixed`, uma
            coluna `auto` ao lado de oito em px resolve para ZERO —
            a Descrição sumia em telas estreitas. Status leva 19%
            para a pílula caber numa linha. */}
        {/* DENSIDADE COMPACTA (área útil de 820 a 1180px): M² desce
            para baixo das dimensões e Patrocinador para baixo da
            descrição. Nove colunas em 960px de mínimo não cabem num
            tablet com a barra lateral aberta, e a coluna que ficava
            de fora era justamente Ações. */}
        <table style={{ width: '100%', minWidth: compacto ? 720 : 960, borderCollapse: 'collapse', textAlign: 'left', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              {(compacto ? ([
                ['ID', '10%'],
                ['Referência', '9%'],
                ['Descrição', '27%'],
                ['Qtd', '6%'],
                ['Dimensões (V / A)', '17%'],
                ['Status', '19%'],
                ['Ações', '12%'],
              ] as const) : ([
                ['ID', '7%'],
                ['Referência', '8%'],
                ['Descrição', '19%'],
                ['Qtd', '5%'],
                ['Dimensões (V / A)', '13%'],
                ['M²', '7%'],
                ['Patrocinador', '11%'],
                ['Status', '19%'],
                ['Ações', '11%'],
              ] as const)).map(([col, width]) => (
                <th
                  key={col}
                  style={{
                    padding: '14px 14px',
                    fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em',
                    // #a8a29e em 11px reprova AA (2,5:1 sobre #f9f9f8).
                    color: T.second, whiteSpace: 'nowrap',
                    // Números à direita (Qtd, M²): as casas alinham e a
                    // coluna se lê de cima a baixo sem caçar dígito.
                    textAlign: col === 'Ações' || col === 'Qtd' || col === 'M²' ? 'right' : 'left',
                    width,
                    backgroundColor: T.bg,
                  }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {typeItems.map(item => (
              <LinhaDaPeca key={item.id} item={item} compacto={compacto} {...linha} />
            ))}
          </tbody>
        </table>
        </div>
        )}
      </div>
    </>
  );

  if (agrupar === 'status') {
    return secoesPorStatus.map(([status, lista]) => {
      const m = getStatusMeta(status);
      return (
        <section key={status} style={{ marginBottom: '40px' }} data-testid={`secao-status-${status}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <h2 style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: FONT.display, fontSize: '18px', fontWeight: '700', letterSpacing: '-0.02em', color: T.text, margin: 0, whiteSpace: 'nowrap' }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: m.dot, flexShrink: 0 }} />
              {m.label}
            </h2>
            <div style={{ flex: 1, height: '2px', backgroundColor: N.n3 }} />
            <Selo tamanho="sm" cores={{ bg: T.low, text: T.second, border: T.low }} style={{ padding: '4px 12px' }}>
              {lista.length} {lista.length === 1 ? 'PEÇA' : 'PEÇAS'}
            </Selo>
          </div>
          {renderTabelaDeItens(lista)}
        </section>
      );
    });
  }

  return sortedGroups.map(group => (
    <Fragment key={group || '__nogroup'}>
      {/* ── Grupo Pai header ── */}
      {group && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', marginTop: '8px' }}>
          <span data-testid={group.startsWith('KIT') ? 'grupo-kit' : undefined} style={{
            backgroundColor: group.startsWith('KIT') ? TOM.roxo.bg : TOM.info.border, color: group.startsWith('KIT') ? TOM.roxo.text : TOM.info.text,
            fontSize: '11px', fontWeight: '900', letterSpacing: '0.12em',
            textTransform: 'uppercase', padding: '4px 14px', borderRadius: '999px',
            fontFamily: FONT.display, whiteSpace: 'nowrap',
          }}>
            {group}
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: group.startsWith('KIT') ? TOM.roxo.border : TOM.info.border }} />
        </div>
      )}

      {Object.entries(groupMap[group]).map(([type, typeItems]) => (
      <section key={type} style={{ marginBottom: group ? '32px' : '48px' }}>
        {/* Cabeçalho do tipo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          {/* 18px (degrau de seção), não 22: em caixa alta, 22 competia
              com o nome do evento (26) pela primeira leitura. Nome de
              tipo longo quebra em vez de empurrar a contagem para fora. */}
          <h2 style={{ fontFamily: FONT.display, fontSize: group ? '15px' : '18px', fontWeight: '700', letterSpacing: '-0.02em', color: T.text, margin: 0, textTransform: 'uppercase', minWidth: 0, overflowWrap: 'anywhere' }}>
            {type}
          </h2>
          <div style={{ flex: 1, height: '2px', backgroundColor: N.n3 }} />
          <Selo tamanho="sm" cores={{ bg: T.low, text: T.second, border: T.low }} style={{ padding: '4px 12px' }}>
            {typeItems.length} {typeItems.length === 1 ? 'PEÇA' : 'PEÇAS'}
          </Selo>
        </div>

        {renderTabelaDeItens(typeItems)}
      </section>
    ))}
    </Fragment>
  ));
}
