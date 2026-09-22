// @vitest-environment jsdom
// ─────────────────────────────────────────────────────────────────────────────
// O CLIENTE DO TEMPO REAL COM O SINAL (tipo + ids).
//
// O servidor não manda mais a peça/evento/comentário pelo WebSocket — só o
// sinal. Este arquivo prende, com o hook MONTADO e um socket falso:
//   · as mensagens que antes eram ignoradas agora derrubam as chaves certas
//     (estoque, comentários, fotos, aprovações do patrocinador, modelos…);
//   · os avisos leem os campos do sinal (nome, tipoDaPeca, count);
//   · `resync` (o servidor ficou sem o canal entre cópias) revalida como uma
//     reconexão;
//   · o polling das telas de parede relaxa com o socket de pé.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { CHAVES_POR_MENSAGEM, alvosDaMensagem, predicadoDoAlvo } from "@/lib/tempo-real-grafica";

vi.setConfig({ testTimeout: 40_000 });

const sockets: any[] = [];
class SocketFalso {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 0; onopen: any; onclose: any; onmessage: any; onerror: any;
  constructor() { sockets.push(this); }
  close() {} send() {}
}

const avisos: any[] = [];
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: (t: any) => avisos.push(t) }), toast: () => {} }));

beforeEach(() => {
  sockets.length = 0;
  avisos.length = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal("WebSocket", SocketFalso as any);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function montado() {
  vi.resetModules();
  const { queryClient } = await import("@/lib/queryClient");
  const mod = await import("@/hooks/use-websocket");
  queryClient.clear();
  const hook = renderHook(() => mod.useWebSocket());
  await act(async () => { sockets[0].onopen(); vi.advanceTimersByTime(3000); });
  const mandar = async (sinal: Record<string, unknown>) => {
    await act(async () => { sockets[0].onmessage({ data: JSON.stringify(sinal) }); vi.advanceTimersByTime(2500); });
  };
  const semear = (...chaves: unknown[][]) => { for (const k of chaves) queryClient.setQueryData(k, {}); };
  const invalidada = (k: unknown[]) => queryClient.getQueryState(k)?.isInvalidated === true;
  return { queryClient, mod, hook, mandar, semear, invalidada };
}

describe("o mapa é exaustivo e só com mensagens que o servidor manda", () => {
  it("os dois tipos que o servidor nunca mandou saíram", () => {
    expect(Object.keys(CHAVES_POR_MENSAGEM)).not.toContain("item_delivered");
    expect(Object.keys(CHAVES_POR_MENSAGEM)).not.toContain("event_urgent");
  });

  it("molde, prefixo e 'contém' casam só o que devem", () => {
    const semelhantes = predicadoDoAlvo({ padrao: "/api/items/*/estoque-semelhantes" });
    expect(semelhantes(["/api/items/abc-1/estoque-semelhantes"])).toBe(true);
    expect(semelhantes(["/api/items/abc-1/outra-coisa"])).toBe(false);
    expect(semelhantes(["/api/items/a/b/estoque-semelhantes"])).toBe(false);
    expect(predicadoDoAlvo({ prefixo: "/api/kit/remessas" })(["/api/kit/remessas?eventId=e1"])).toBe(true);
    expect(predicadoDoAlvo({ contem: "comments" })(["/api/items", "p1", "comments"])).toBe(true);
    expect(predicadoDoAlvo({ contem: "comments" })(["/api/items", "p1", "photos"])).toBe(false);
  });

  it("chaves por evento continuam saindo do corpo (o sinal leva o eventId)", () => {
    expect(alvosDaMensagem({ type: "event_sponsor_added", eventId: "e1" })).toContainEqual(["/api/events", "e1", "sponsors"]);
    expect(alvosDaMensagem({ type: "event_priority_updated", eventId: "e1" })).toContainEqual(["/api/items", "e1"]);
  });
});

describe("hook montado: as mensagens antes ignoradas agora atualizam a tela", () => {
  it("reserva de estoque / inventário: reservas ativas, semelhantes da peça e resumo do evento", async () => {
    const t = await montado();
    for (const tipo of ["estoque_reservas", "inventory_changed"]) {
      t.semear(["/api/estoque/reservas-ativas"], ["/api/items/p1/estoque-semelhantes"], ["/api/events/e1/estoque-resumo"], ["/api/inventory"], ["/api/items/p1/outra"]);
      await t.mandar({ type: tipo, id: "p1", itemId: "p1", eventId: "e1" });
      expect(t.invalidada(["/api/estoque/reservas-ativas"]), tipo).toBe(true);
      expect(t.invalidada(["/api/items/p1/estoque-semelhantes"]), tipo).toBe(true);
      expect(t.invalidada(["/api/events/e1/estoque-resumo"]), tipo).toBe(true);
      expect(t.invalidada(["/api/inventory"]), tipo).toBe(true);
      expect(t.invalidada(["/api/items/p1/outra"]), tipo).toBe(false);
    }
    t.hook.unmount();
  });

  it("comentário, foto, aprovação do patrocinador, modelos e Kit", async () => {
    const t = await montado();
    const casos: Array<[Record<string, unknown>, unknown[]]> = [
      [{ type: "new_comment", id: "c1", itemId: "p1" }, ["/api/items", "p1", "comments"]],
      [{ type: "comment_deleted", id: "c1" }, ["/api/items", "p1", "comments"]],
      [{ type: "photo_added", id: "f1", itemId: "p1" }, ["/api/items", "p1", "photos"]],
      [{ type: "sponsor_approval_updated", id: "p1", itemId: "p1" }, ["/api/items", "p1", "sponsor-approvals"]],
      [{ type: "standard_item_group_renamed" }, ["/api/standard-items"]],
      [{ type: "catalog_option_deleted" }, ["/api/catalog-options"]],
      [{ type: "kit_remessas", eventId: "e1" }, ["/api/kit/remessas?eventId=e1"]],
      [{ type: "event_priority_updated", id: "e1", eventId: "e1" }, ["/api/items/approved"]],
    ];
    for (const [sinal, chave] of casos) {
      t.semear(chave);
      await t.mandar(sinal);
      expect(t.invalidada(chave), String(sinal.type)).toBe(true);
    }
    t.hook.unmount();
  });

  it("os avisos leem o sinal — nome do evento, tipo da peça, contagem", async () => {
    const t = await montado();
    await t.mandar({ type: "event_created", id: "e1", eventId: "e1", nome: "Arena Norte" });
    await t.mandar({ type: "item_created", id: "p1", eventId: "e1", itemId: "p1", tipoDaPeca: "Backdrop" });
    await t.mandar({ type: "items_bulk_created", eventId: "e1", count: 3 });
    await t.mandar({ type: "deadline_alert", id: "e1", eventId: "e1", nome: "Arena Norte", hoursRemaining: 12 });
    expect(avisos.map((a) => a.description)).toEqual([
      "Arena Norte",
      "Peça Backdrop entrou na lista.",
      "3 peças adicionadas ao evento",
      "Faltam 12h para a saída · Arena Norte",
    ]);
    // Sinal do Kit (sem textos): o aviso não inventa "undefined".
    await t.mandar({ type: "item_approved", id: "p2", itemId: "p2" });
    expect(avisos[avisos.length - 1].description).toBe("Aprovada para produção");
    t.hook.unmount();
  });

  it("resync (o servidor ficou sem o canal entre cópias) revalida como uma reconexão", async () => {
    const t = await montado();
    t.semear(["/api/items"], ["/api/items/approved"], ["/api/grafica/maquinas"], ["/api/events"], ["/api/notifications"]);
    await t.mandar({ type: "resync" });
    for (const k of [["/api/items"], ["/api/items/approved"], ["/api/grafica/maquinas"], ["/api/events"], ["/api/notifications"]]) {
      expect(t.invalidada(k), String(k[0])).toBe(true);
    }
    t.hook.unmount();
  });

  it("tipo desconhecido não quebra e não invalida nada", async () => {
    const t = await montado();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    t.semear(["/api/items"]);
    await t.mandar({ type: "tipo_que_nao_existe" });
    expect(t.invalidada(["/api/items"])).toBe(false);
    expect(log).toHaveBeenCalledWith("Unknown WebSocket message type:", "tipo_que_nao_existe");
    log.mockRestore();
    t.hook.unmount();
  });
});

describe("polling das telas de parede", () => {
  it("5 min com o socket de pé; o ritmo da tela com ele caído", async () => {
    const t = await montado();
    const intervalo = t.mod.intervaloDePolling(60_000);
    expect(intervalo()).toBe(5 * 60_000);
    await act(async () => { sockets[0].onclose(); });
    expect(intervalo()).toBe(60_000);
    t.hook.unmount();
  });
});
