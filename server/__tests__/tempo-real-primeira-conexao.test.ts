// @vitest-environment jsdom
//
// TEMPO REAL: PRIMEIRA CONEXÃO NÃO É RECONEXÃO (perf, 17/09).
//
// O ws.onopen revalidava prazos, trilha, peças, fila da Gráfica, eventos e
// notificações em TODA abertura — inclusive a primeira, logo depois de a tela
// buscar exatamente essas chaves: a casca media /api/notifications 2× em
// 700 ms, e a lista de peças/eventos também saía dobrada. A cura da queda
// (reconexão) tem de continuar inteira: o que mudou enquanto o socket esteve
// fora só chega por ela.
//
// E a memória: o estado do delta de /api/items não pode segurar a lista
// depois que o React Query a descarta.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";

const sockets: any[] = [];
class SocketFalso {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 0; onopen: any; onclose: any; onmessage: any; onerror: any;
  constructor() { sockets.push(this); }
  close() {} send() {}
}

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const CHAVES = [["/api/notifications"], ["/api/events"], ["/api/items"], ["/api/items/approved"], ["/api/prazos"], ["/api/audit-logs"]];

beforeEach(() => {
  sockets.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("WebSocket", SocketFalso as any);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function montar() {
  vi.resetModules();
  const { queryClient } = await import("@/lib/queryClient");
  const { useWebSocket } = await import("@/hooks/use-websocket");
  queryClient.clear();
  return { queryClient, useWebSocket };
}

/** Resposta JSON que só sai quando o teste mandar (carga "em voo"). */
function respostaAdiada() {
  let soltar!: (corpo: unknown) => void;
  const promessa = new Promise<Response>((ok) => {
    soltar = (corpo) => ok(new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } }));
  });
  return { promessa, soltar };
}

describe("ws.onopen", () => {
  it("primeira abertura não re-busca o que chegou DEPOIS de abrir; a reconexão re-busca tudo", async () => {
    const { queryClient, useWebSocket } = await montar();
    const hook = renderHook(() => useWebSocket());
    vi.advanceTimersByTime(50);
    const invalidar = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => { sockets[0].onopen(); });
    // A tela recebeu as chaves DEPOIS de o socket abrir: o servidor já o conhecia.
    vi.advanceTimersByTime(20);
    for (const k of CHAVES) queryClient.setQueryData(k, []);
    await act(async () => { vi.advanceTimersByTime(3000); });
    const invalidadas = CHAVES.filter((k) => queryClient.getQueryState(k)?.isInvalidated);
    expect(invalidadas, "primeira conexão invalidou chaves buscadas com o socket aberto").toEqual([]);

    // Queda e volta: agora é reconexão — tudo o que a tela mostra revalida.
    await act(async () => { sockets[0].onclose(); vi.advanceTimersByTime(1500); });
    expect(sockets).toHaveLength(2);
    invalidar.mockClear();
    await act(async () => { sockets[1].onopen(); vi.advanceTimersByTime(3000); });
    for (const k of CHAVES) {
      expect(queryClient.getQueryState(k)?.isInvalidated, k[0]).toBe(true);
    }
    hook.unmount();
  });

  it("primeira abertura revalida o que já estava no cache ANTES de o socket começar (cache quente)", async () => {
    const { queryClient, useWebSocket } = await montar();
    queryClient.setQueryData(["/api/notifications"], []);
    vi.advanceTimersByTime(50);
    const hook = renderHook(() => useWebSocket());
    await act(async () => { sockets[0].onopen(); vi.advanceTimersByTime(3000); });
    expect(queryClient.getQueryState(["/api/notifications"])?.isInvalidated).toBe(true);
    hook.unmount();
  });

  it("o corte é a ABERTURA: o que chegou entre criar e abrir o socket revalida", async () => {
    // Revisão adversarial 17/09: a régua era a criação do socket — a mudança
    // broadcast nesse meio tempo não chegava a ninguém e o dado ficava velho.
    const { queryClient, useWebSocket } = await montar();
    const hook = renderHook(() => useWebSocket());
    vi.advanceTimersByTime(50);
    queryClient.setQueryData(["/api/events"], []);
    vi.advanceTimersByTime(30);
    await act(async () => { sockets[0].onopen(); vi.advanceTimersByTime(3000); });
    expect(queryClient.getQueryState(["/api/events"])?.isInvalidated).toBe(true);
    hook.unmount();
  });
});

describe("invalidação durante a primeira carga (React Query 5.60)", () => {
  // Invalidar chave SEM dado e EM busca reaproveita a promessa em voo, e o
  // sucesso zera isInvalidated: a mudança de outra pessoa durante a carga
  // inicial era descartada. O hook repete a invalidação UMA vez no fim.
  async function montarComCargaEmVoo(chave: string) {
    const { queryClient, useWebSocket } = await montar();
    const { QueryObserver } = await import("@tanstack/react-query");
    const pedidos: string[] = [];
    const adiadas: ReturnType<typeof respostaAdiada>[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      pedidos.push(url);
      const r = respostaAdiada();
      adiadas.push(r);
      return r.promessa;
    }));
    const cache = queryClient.getQueryCache() as any;
    const ouvintesAntes: number = cache.listeners.size;
    const hook = renderHook(() => useWebSocket());
    // Tela montada: a chave fica ATIVA e começa a primeira carga (sem dado).
    const observador = new QueryObserver(queryClient, { queryKey: [chave] });
    const desassinarTela = observador.subscribe(() => {});
    await act(async () => { vi.advanceTimersByTime(10); });
    expect(queryClient.getQueryState([chave])?.fetchStatus).toBe("fetching");
    expect(queryClient.getQueryState([chave])?.data).toBeUndefined();
    return { queryClient, hook, pedidos, adiadas, desassinarTela, cache, ouvintesAntes };
  }

  it("abertura + mensagens com a carga em voo: UMA re-busca quando ela termina, sem assinatura sobrando", async () => {
    const t = await montarComCargaEmVoo("/api/notifications");
    expect(t.pedidos).toHaveLength(1);
    // A carga saiu antes de o socket abrir; e outra pessoa mexe duas vezes.
    await act(async () => { sockets[0].onopen(); });
    for (let n = 0; n < 2; n++) {
      await act(async () => {
        sockets[0].onmessage({ data: JSON.stringify({ type: "notification_created" }) });
        vi.advanceTimersByTime(2100);
      });
    }
    expect(t.pedidos, "invalidar sem dado reaproveita a busca em voo").toHaveLength(1);
    expect(t.cache.listeners.size, "uma assinatura só por chave").toBe(t.ouvintesAntes + 1);

    await act(async () => { t.adiadas[0].soltar([{ id: "n-velha" }]); });
    await vi.waitFor(() => expect(t.pedidos).toHaveLength(2));
    expect(t.cache.listeners.size, "assinatura solta no sucesso").toBe(t.ouvintesAntes);

    await act(async () => { t.adiadas[1].soltar([{ id: "n-velha" }, { id: "n-nova" }]); });
    await vi.waitFor(() => expect(t.queryClient.getQueryData(["/api/notifications"])).toHaveLength(2));
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(t.pedidos, "a re-busca é uma só").toHaveLength(2);
    t.desassinarTela();
    t.hook.unmount();
  });

  it("desmontar o hook com a carga em voo não deixa assinatura no queryCache", async () => {
    const t = await montarComCargaEmVoo("/api/items/approved");
    await act(async () => { sockets[0].onopen(); });
    expect(t.cache.listeners.size).toBe(t.ouvintesAntes + 1);
    t.hook.unmount();
    expect(t.cache.listeners.size).toBe(t.ouvintesAntes);
    t.desassinarTela();
  });
});


describe("memória do delta", () => {
  it("descartar a query de /api/items solta o estado do delta (a próxima busca é full)", async () => {
    vi.useRealTimers();
    vi.resetModules();
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      pedidos.push(url);
      const corpo = url.includes("since=")
        ? { delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] }
        : [{ id: "p1", eventId: "e1", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", sponsors: [] }];
      return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
    }));
    const { queryClient } = await import("@/lib/queryClient");
    await queryClient.fetchQuery({ queryKey: ["/api/items"] });
    await queryClient.refetchQueries({ queryKey: ["/api/items"] });
    await queryClient.fetchQuery({ queryKey: ["/api/items"], staleTime: 0 });
    expect(pedidos.at(-1)).toContain("since=");
    queryClient.removeQueries({ queryKey: ["/api/items"], exact: true });
    await queryClient.fetchQuery({ queryKey: ["/api/items"] });
    expect(pedidos.at(-1)).toBe("/api/items?formato=compacto");
    // As listas eventuais saem do cache em 5 min; as com delta seguem 30.
    expect(queryClient.getQueryDefaults(["/api/items/deleted"]).gcTime).toBe(5 * 60 * 1000);
    expect(queryClient.getQueryDefaults(["/api/items"]).gcTime).toBeUndefined();
  });

  const PECA = { id: "p1", eventId: "e1", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", sponsors: [] };
  const responder = (corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  const DELTA_VAZIO = () => ({ delta: true, agora: new Date().toISOString(), itens: [], removidas: [], eventos: [], patrocinadores: [] });

  it("resync: passados 30 min da última busca CHEIA, a próxima revalidação baixa a lista inteira", async () => {
    // Revisão adversarial 17/09: só delta, um desvio (peça sem carimbo,
    // transação fora da sobreposição) ficava na aba da Gráfica até o F5.
    vi.resetModules();
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      pedidos.push(url);
      return responder(url.includes("since=") ? DELTA_VAZIO() : [PECA]);
    }));
    const { queryClient } = await import("@/lib/queryClient");
    const CHAVE = ["/api/items/approved"];
    await queryClient.fetchQuery({ queryKey: CHAVE });
    vi.advanceTimersByTime(29 * 60 * 1000);
    await queryClient.fetchQuery({ queryKey: CHAVE, staleTime: 0 });
    expect(pedidos.at(-1), "antes dos 30 min segue delta").toContain("since=");
    // Os deltas no meio NÃO renovam o prazo: conta da última CHEIA.
    vi.advanceTimersByTime(2 * 60 * 1000);
    await queryClient.fetchQuery({ queryKey: CHAVE, staleTime: 0 });
    expect(pedidos.at(-1)).toBe("/api/items/approved?formato=compacto");
    await queryClient.fetchQuery({ queryKey: CHAVE, staleTime: 0 });
    expect(pedidos.at(-1), "depois da cheia, volta ao delta").toContain("since=");
    queryClient.clear();
  });

  it("busca que termina DEPOIS de a chave ser descartada não regrava o estado do delta", async () => {
    vi.resetModules();
    const pedidos: string[] = [];
    const adiadas: ReturnType<typeof respostaAdiada>[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string) => {
      pedidos.push(url);
      const r = respostaAdiada();
      adiadas.push(r);
      return r.promessa;
    }));
    const { queryClient } = await import("@/lib/queryClient");
    const CHAVE = ["/api/items"];
    const emVoo = queryClient.fetchQuery({ queryKey: CHAVE });
    await vi.waitFor(() => expect(adiadas).toHaveLength(1));
    queryClient.removeQueries({ queryKey: CHAVE, exact: true });
    adiadas[0].soltar([PECA]);
    await emVoo.catch(() => undefined);
    const nova = queryClient.fetchQuery({ queryKey: CHAVE });
    await vi.waitFor(() => expect(adiadas).toHaveLength(2));
    expect(pedidos.at(-1), "a sincronia descartada não voltou: busca cheia").toBe("/api/items?formato=compacto");
    adiadas[1].soltar([PECA]);
    await nova;
    queryClient.clear();
  });
});
