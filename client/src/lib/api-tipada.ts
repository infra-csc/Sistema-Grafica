// ─────────────────────────────────────────────────────────────────────────────
// LEITURA TIPADA PELA ROTA — `useApi("/api/events")` já sabe que volta
// `EventoDaLista[]` (contratos em @shared/api; o "como usar" está no topo de
// shared/api/index.ts).
//
// É SÓ um `useQuery` com a chave de sempre: `[rota]`, ou `[rota, sufixo]` nos
// recortes (`?status=…`, `?dia=…`). Nada muda no cache, na invalidação por
// prefixo, no WebSocket nem no delta-sync (lib/queryClient.ts) — o helper
// existe para a tela não precisar repetir o tipo da resposta.
//
// Rota com mais de UMA forma de resposta (`?campos=trilha`, `?detalhe=1`,
// `?paged=1`) não passa por aqui: use `useQuery<TipoExplícito>` com o tipo do
// contrato — o sufixo mudaria a forma sem o tipo acompanhar.
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, type UseQueryOptions, type UseQueryResult } from "@tanstack/react-query";
import type { RespostaDe, RotaGet } from "@shared/api";

/** A chave da query de uma rota: `[rota]` ou `[rota, "?…"]` (ver urlDaLista em queryClient.ts). */
export type ChaveDaApi<R extends RotaGet> = readonly [R] | readonly [R, `?${string}`];

/** A chave de sempre para a rota (com o recorte, quando houver). */
export function chaveDaApi<R extends RotaGet>(rota: R, sufixo?: `?${string}`): ChaveDaApi<R> {
  return sufixo ? [rota, sufixo] : [rota];
}

/** As opções do useQuery, menos chave e fetch (que vêm da rota). */
export type OpcoesDaApi<R extends RotaGet, TSelecionado = RespostaDe<R>> = Omit<
  UseQueryOptions<RespostaDe<R>, Error, TSelecionado, ChaveDaApi<R>>,
  "queryKey" | "queryFn"
> & {
  /** Recorte que NÃO muda a forma da resposta: `?status=…`, `?dia=…`. */
  sufixo?: `?${string}`;
};

/** `useQuery` com o tipo da resposta vindo do contrato da rota. */
export function useApi<R extends RotaGet, TSelecionado = RespostaDe<R>>(
  rota: R,
  opcoes: OpcoesDaApi<R, TSelecionado> = {},
): UseQueryResult<TSelecionado, Error> {
  const { sufixo, ...resto } = opcoes;
  return useQuery<RespostaDe<R>, Error, TSelecionado, ChaveDaApi<R>>({ ...resto, queryKey: chaveDaApi(rota, sufixo) });
}
