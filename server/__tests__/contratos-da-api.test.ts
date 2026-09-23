// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// CONTRATOS DA API (shared/api) E A LEITURA TIPADA (client/src/lib/api-tipada.ts).
//
// O que este arquivo prende:
//   · `Json<T>` descreve o que o JSON faz com a linha do banco (Date → texto),
//     verificado em tempo de compilação (`tsc -p tsconfig.test.json`) E contra
//     um JSON.parse(JSON.stringify(...)) de verdade;
//   · o mapa `Rotas` cobre as listas que o queryClient decodifica (delta e
//     compacto) — se uma delas sair do mapa, a tela perde o tipo em silêncio;
//   · `useApi` é SÓ um useQuery com a chave de sempre: `[rota]` ou
//     `[rota, "?…"]`. A invalidação por prefixo (WebSocket, mutações) tem de
//     continuar alcançando a query — é o que se confere montando o hook;
//   · os tipos que as telas da Gráfica ainda declaram à mão (TuboDaAba) cabem
//     no contrato: quando elas o adotarem, nada muda de forma.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, expectTypeOf, afterEach, vi } from "vitest";
import * as React from "react";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Json, Rotas, RespostaDe, PecaEnriquecida, PecaDaTrilha, EventoDaLista, TuboDaAba as TuboDoContrato, UsuarioDaSessao } from "@shared/api";
import type { TuboDaAba as TuboDaTela } from "@/components/grafica/aba-tubos";
import { useApi, chaveDaApi } from "@/lib/api-tipada";
import { getQueryFn } from "@/lib/queryClient";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Json<T>: a linha do banco como chega pelo cabo", () => {
  it("Date vira texto ISO, em qualquer profundidade; null e o resto ficam", () => {
    type Linha = { criado: Date; entregue: Date | null; itens: Array<{ em: Date }>; n: number; nome: string };
    expectTypeOf<Json<Linha>>().toEqualTypeOf<{ criado: string; entregue: string | null; itens: Array<{ em: string }>; n: number; nome: string }>();
    const linha: Linha = { criado: new Date("2026-09-21T13:00:00Z"), entregue: null, itens: [{ em: new Date("2026-09-22T00:00:00Z") }], n: 3, nome: "x" };
    const peloCabo: Json<Linha> = JSON.parse(JSON.stringify(linha));
    expect(peloCabo).toEqual({ criado: "2026-09-21T13:00:00.000Z", entregue: null, itens: [{ em: "2026-09-22T00:00:00.000Z" }], n: 3, nome: "x" });
  });

  it("a peça das listas não promete Date a ninguém", () => {
    expectTypeOf<PecaEnriquecida["createdAt"]>().toEqualTypeOf<string>();
    expectTypeOf<PecaDaTrilha["deliveredAt"]>().toEqualTypeOf<string | null>();
    expectTypeOf<EventoDaLista["truckDepartureDate"]>().toEqualTypeOf<string>();
    expectTypeOf<UsuarioDaSessao>().not.toHaveProperty("passwordHash");
  });
});

describe("o mapa de rotas", () => {
  it("cobre as listas com delta/compacto do queryClient e a sessão", () => {
    const chaves: Array<keyof Rotas> = ["/api/items", "/api/items/approved", "/api/items/pending", "/api/items/deleted", "/api/events", "/api/auth/me"];
    expect(chaves).toHaveLength(6);
    expectTypeOf<RespostaDe<"/api/items/approved">>().toEqualTypeOf<PecaEnriquecida[]>();
    expectTypeOf<RespostaDe<"/api/events">>().toEqualTypeOf<EventoDaLista[]>();
  });

  it("o tipo que a aba Tubos declara à mão cabe no contrato de ?detalhe=1", () => {
    expectTypeOf<TuboDoContrato>().toMatchTypeOf<TuboDaTela>();
  });
});

describe("useApi: um useQuery com a chave de sempre", () => {
  const montar = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => React.createElement(QueryClientProvider, { client: qc }, children);
    return { qc, wrapper };
  };
  const responder = (corpo: unknown) => {
    const fetch = vi.fn(async (_url: RequestInfo | URL) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  it("chaveDaApi monta [rota] ou [rota, sufixo] — nunca a URL colada", () => {
    expect(chaveDaApi("/api/users")).toEqual(["/api/users"]);
    expect(chaveDaApi("/api/grafica/maquinas", "?dia=2026-09-20")).toEqual(["/api/grafica/maquinas", "?dia=2026-09-20"]);
  });

  it("busca pela rota, guarda na chave de sempre e a invalidação por prefixo a alcança", async () => {
    const fetch = responder([{ id: "u1", name: "Ana", role: "admin" }]);
    const { qc, wrapper } = montar();
    const { result } = renderHook(() => useApi("/api/users/basic"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expectTypeOf(result.current.data).toEqualTypeOf<RespostaDe<"/api/users/basic"> | undefined>();
    expect(result.current.data?.[0].name).toBe("Ana");
    expect(String(fetch.mock.calls[0][0])).toBe("/api/users/basic");
    expect(qc.getQueryData(["/api/users/basic"])).toEqual([{ id: "u1", name: "Ana", role: "admin" }]);
    await qc.invalidateQueries({ queryKey: ["/api/users/basic"] });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  });

  it("o sufixo vira a query da URL (a mesma regra do queryFn padrão)", async () => {
    const fetch = responder({ dia: "2026-09-20", hoje: "2026-09-23", maquinas: [], semMaquina: [] });
    const { wrapper } = montar();
    const { result } = renderHook(() => useApi("/api/grafica/maquinas", { sufixo: "?dia=2026-09-20" }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(String(fetch.mock.calls[0][0])).toBe("/api/grafica/maquinas?dia=2026-09-20");
    expect(result.current.data?.dia).toBe("2026-09-20");
  });

  it("enabled:false não busca (as opções do useQuery passam intactas)", () => {
    const fetch = responder([]);
    const { wrapper } = montar();
    renderHook(() => useApi("/api/users", { enabled: false }), { wrapper });
    expect(fetch).not.toHaveBeenCalled();
  });
});
