// ─────────────────────────────────────────────────────────────────────────────
// A LISTA DA FILA — carregando, erro, vazio (com o motivo), ou as peças: em
// CARTÕES (celular e tablet) ou em TABELA (desktop), por lotes de linhas.
//
// Cada linha passa pela LinhaMemo: só redesenha quando muda algo do inventário
// `depsDaLinha` (página). O JSX da linha mora em cartao-da-peca.tsx e
// linha-da-tabela.tsx; aqui só se decide a ordem, os cabeçalhos e o corte.
// ─────────────────────────────────────────────────────────────────────────────
import type React from "react";
import { Package } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { FS, FW, T } from "@/lib/theme";
// Fila de ~4 mil peças: linha memoizada + desenho por lotes (ver o arquivo).
import { LinhaMemo, SentinelaDaLista } from "@/components/grafica/lista-incremental";
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { FilaDaGrafica } from "@/components/grafica/hooks/use-fila-da-grafica";
import type { ContextoDaLinha } from "./contexto-da-linha";
import { LINHAS_POR_LOTE } from "./regras";
import { CartaoDaPeca } from "./cartao-da-peca";
import { LinhaDaTabela } from "./linha-da-tabela";

export function ListaDaFila({ fila, ctx, depsDaLinha, usaCards, colunas, tabelaRolagemRef }: {
  fila: FilaDaGrafica;
  ctx: ContextoDaLinha;
  /** O inventário do que cada linha lê (ver a página) + o que vem da posição dela. */
  depsDaLinha: (item: PecaDaFila, daPosicao: unknown[]) => unknown[];
  usaCards: boolean;
  /** As colunas da tabela (a compacta funde Material e m² em outras células). */
  colunas: { rotulo: string; direita?: boolean }[];
  /** A caixa de rolagem lateral da tabela — é nela que a página mede o estouro. */
  tabelaRolagemRef: React.RefObject<HTMLDivElement>;
}) {
  const {
    isLoading, isError, isFetching, refetch, migracaoPendente, filteredItems, haFiltro, entreguesOcultas,
    descricaoFiltros, nFiltros, patchFiltros, limparFiltros,
    linhasRenderizadas, linhasVisiveis, cortePorItem, desenharMaisLinhas, etiquetaveisPorEvento, typeToGroup,
  } = fila;
  const { idMenuAberto } = ctx;
  return (
    <>
      {isLoading ? (
        /* Silhueta em vez de spinner (UX 27/08): o spinner colapsava a
           altura e a fila chegava EMPURRANDO a tela. */
        <EsqueletoDeFila linhas={8} />
      ) : isError ? (
        /* Erro NÃO é vazio: diz o que falhou e oferece tentar de novo
           (EstadoErro já leva role="alert" e o botão). A margem o descola
           das bordas do cartão da lista. */
        <div style={{ margin: 12 }}>
          <EstadoErro
            titulo={migracaoPendente ? "Atualização do banco pendente" : "Não foi possível carregar as peças"}
            detalhe={migracaoPendente
              ? "Falta rodar a atualização do banco (npm run db:push) para o recurso de aumento de quantidade. Fale com o administrador."
              : "Verifique sua conexão e tente novamente."}
            aoTentarDeNovo={isFetching ? undefined : () => { void refetch(); }}
          />
        </div>
      ) : filteredItems.length === 0 ? (
        /* Três motivos diferentes, três respostas diferentes: recorte
           filtrado (com botão de volta e a lista do que está ativo), só
           entregues escondidas (mostrar é um clique), ou a fila vazia mesmo.
           `temFiltroAtivo` deriva da tabela de campos da lib — era essa lista
           mantida à mão que fazia a tela dizer "Nenhuma peça liberada ainda"
           depois de filtrar por Grupo.

           OS DOIS MOTIVOS JUNTOS: filtrar por Material/Grupo/Percurso/Mês cujo
           recorte inteiro já foi entregue caía no primeiro caso e só oferecia
           "Limpar filtros" — as entregues do recorte ficavam escondidas SEM
           aviso, e limpar o filtro era jogar fora justamente a pergunta que a
           pessoa fez. É o mesmo beco do relato do NORTE, na versão das facetas
           que NÃO revelam (evento e status revelam; ver a regra em
           lib/grafica-filtros). Aqui ele se paga com o aviso e o atalho: o
           botão de mostrar vira o principal, porque é o que a pessoa procura. */
        <div style={{ margin: 12 }}>
          <EstadoVazio
            icone={Package}
            titulo={haFiltro && entreguesOcultas > 0 ? "Neste recorte, já foi tudo entregue"
              : haFiltro ? "Nenhuma peça encontrada"
              : entreguesOcultas > 0 ? "Tudo entregue por aqui"
              : "Nenhuma peça liberada ainda"}
            descricao={
              <>
                {haFiltro ? `Recorte atual: ${descricaoFiltros.join(" · ")}`
                  : entreguesOcultas > 0 ? `${entreguesOcultas} peça${entreguesOcultas !== 1 ? "s" : ""} já entregue${entreguesOcultas !== 1 ? "s" : ""} ${entreguesOcultas !== 1 ? "estão" : "está"} fora da fila.`
                  : "Quando a Arte liberar peças para produção, elas aparecem aqui"}
                {haFiltro && entreguesOcultas > 0 && (
                  <span style={{ display: "block", marginTop: 6 }}>
                    {entreguesOcultas} peça{entreguesOcultas !== 1 ? "s" : ""} deste recorte {entreguesOcultas !== 1 ? "estão" : "está"} fora da fila por já ter{entreguesOcultas !== 1 ? "em" : ""} sido entregue{entreguesOcultas !== 1 ? "s" : ""}.
                  </span>
                )}
              </>
            }
            acao={(entreguesOcultas > 0 || haFiltro) ? (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {/* Mostrar as entregues é o principal quando existe: é o que
                    a pessoa procura — limpar o filtro jogaria fora a pergunta. */}
                {entreguesOcultas > 0 && (
                  <Botao variante="primario" tamanho="toque" onClick={() => patchFiltros({ entregues: true })} data-testid="button-mostrar-entregues-vazio">
                    {entreguesOcultas === 1 ? "Mostrar a peça entregue" : `Mostrar as ${entreguesOcultas} entregues`}
                  </Botao>
                )}
                {haFiltro && (
                  <Botao variante={entreguesOcultas > 0 ? "secundario" : "primario"} tamanho="toque" onClick={limparFiltros} data-testid="button-limpar-filtros-vazio">
                    Limpar filtros ({nFiltros})
                  </Botao>
                )}
              </div>
            ) : undefined}
          />
        </div>
      ) : usaCards ? (
        /* ── Cards: celular E tablet (conteúdo < 820px, ver `densidade`) ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 8px' }}>
          {linhasRenderizadas.map((item, index) => {
            const prev = index > 0 ? linhasRenderizadas[index - 1] : null;
            const corte = cortePorItem.get(item.id);
            const showEvHeader = !prev || prev.event?.name !== item.event?.name;
            return (
              <LinhaMemo key={item.id} deps={depsDaLinha(item, [index > 0, showEvHeader, corte?.chave, corte?.total, corte?.ocultas, etiquetaveisPorEvento.get(String(item.eventId)) ?? 0])} render={() => (
                <CartaoDaPeca ctx={ctx} item={item} index={index} showEvHeader={showEvHeader} corte={corte} />
              )} />
            );
          })}
        </div>
      ) : (
        /* ── View desktop: tabela ── */
        <div ref={tabelaRolagemRef} data-testid="tabela-rolagem" style={{ overflowX: idMenuAberto ? "visible" : "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            {/* Cabeçalho CLARO: a tabela tinha três faixas escuras seguidas
                (thead preto, cabeçalho de evento marrom, linha de tipo) e o
                olho não sabia qual delas era o agrupamento. O escuro fica só
                com o EVENTO — é ele que manda na ordem do galpão. */}
            <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
              {colunas.map(({ rotulo: col, direita }) => (
                /* A coluna de AÇÕES é `sticky right`: são 10 colunas e num
                   notebook 1366 (menos a sidebar fixa de 16rem sobram ~1110px)
                   ela ficava fora da vista. O usuário recorrente faz o mesmo
                   gesto o dia inteiro — achar a linha e clicar no botão —, e
                   rolar para a direita e voltar a cada peça triplica o custo e
                   ainda perde a linha no caminho. */
                <th key={col || "acoes"} scope="col" style={{
                  padding: "10px 16px", textAlign: col === "" || direita ? "right" : "left",
                  fontSize: FS.small, fontWeight: FW.forte, color: T.apoio,
                  whiteSpace: "nowrap",
                  ...(col === "" ? { position: "sticky" as const, right: 0, zIndex: 2, backgroundColor: T.bg } : {}),
                }}>
                  {col === "" ? <span className="sr-only">Ações</span> : col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhasRenderizadas.map((item, index) => {
              const prev = index > 0 ? linhasRenderizadas[index - 1] : null;
              const corte = cortePorItem.get(item.id);
              const showEvHeader = !prev || prev.event?.name !== item.event?.name;
              const showTypeHeader = !prev || prev.event?.name !== item.event?.name || prev.type !== item.type;
              return (
                <LinhaMemo key={item.id} deps={depsDaLinha(item, [showEvHeader, showTypeHeader, typeToGroup[item.type] || '', prev ? (typeToGroup[prev.type] || '') : '', corte?.chave, corte?.total, corte?.ocultas, etiquetaveisPorEvento.get(String(item.eventId)) ?? 0])} render={() => (
                  <LinhaDaTabela ctx={ctx} item={item} prev={prev} showEvHeader={showEvHeader} showTypeHeader={showTypeHeader} corte={corte} />
                )} />
              );
            })}
          </tbody>
        </table>
        </div>
      )}
      {/* Próximo lote de linhas: entra sozinho quando a rolagem chega perto
          do fim do que está desenhado, ou pelo botão (teclado, leitor de
          tela). Fora do ramo de carregando/erro, onde não há lista. */}
      {/* Sem a condição "falta desenhar": o próprio sentinela some quando a
          lista está completa, e precisa continuar montado no último lote
          pedido pelo botão para levar o foco ao texto do fim. */}
      {!isLoading && !isError && (
        <SentinelaDaLista
          mostradas={linhasRenderizadas.length}
          total={linhasVisiveis.length}
          lote={LINHAS_POR_LOTE}
          onMais={() => desenharMaisLinhas()}
          compacto={usaCards}
        />
      )}
    </>
  );
}
