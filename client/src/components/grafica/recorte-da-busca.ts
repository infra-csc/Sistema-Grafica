// ─────────────────────────────────────────────────────────────────────────────
// A BUSCA UMA VEZ SÓ — como a Gráfica separa o texto digitado das outras
// passadas do recorte sem mudar o resultado de nenhuma delas.
//
// POR QUE. A tela faz ONZE varreduras da fila a cada mudança de recorte (a
// lista, o pool dos cards, as oito facetas e as entregues ocultas), todas via
// `itemCasaFiltros`. Com texto na busca, cada chamada normaliza quatro campos
// da peça (NFD + regex): com 4 mil peças, ~500 ms de CPU por clique de aba ou
// pausa na digitação — 44 mil normalizações para responder a mesma pergunta
// onze vezes.
//
// A IDENTIDADE (conferida em grafica-recorte-da-busca.test.ts, peça a peça):
//
//   itemCasaFiltros(i, f, ctx, o)
//     === itemCasaFiltros(i, recorteSoDaBusca(f.busca), ctx, { ignorarStatus: true })
//      && itemCasaFiltros(i, recorteSemABusca(f), ctx, o)
//
// Vale porque `itemCasaFiltros` lê `busca` em só dois lugares: o próprio teste
// de texto (o primeiro, e independente de `excluir`/`ignorarStatus`) e
// `escondeEntregues`, onde busca preenchida REVELA as entregues. Tirar a busca
// sem compensar esconderia de novo as entregues achadas pelo texto — por isso
// `recorteSemABusca` liga `entregues`, que produz exatamente o mesmo efeito ali.
// Se alguém passar a ler `busca` ou `entregues` em outro ponto de
// `itemCasaFiltros`, o teste da identidade quebra antes da tela mentir.
// ─────────────────────────────────────────────────────────────────────────────
import { FILTROS_VAZIOS, type GraficaFiltros } from "@/lib/grafica-filtros";

/** Recorte que só aplica o texto da busca (use com `{ ignorarStatus: true }`). */
export const recorteSoDaBusca = (busca: string): GraficaFiltros => ({ ...FILTROS_VAZIOS, busca });

/**
 * O recorte para as passadas feitas SOBRE o que a busca já deixou: sem o texto
 * (não normaliza de novo) e com `entregues` ligado no lugar dele (a busca
 * preenchida revela as entregues em `escondeEntregues`). Sem busca, devolve o
 * MESMO objeto — as dependências dos useMemo não mudam à toa.
 */
export function recorteSemABusca(f: GraficaFiltros): GraficaFiltros {
  if (!f.busca.trim()) return f;
  return { ...f, busca: "", entregues: true };
}
