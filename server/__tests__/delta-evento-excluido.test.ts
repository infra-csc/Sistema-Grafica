// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS DE EVENTO EXCLUÍDO SAEM NO PRÓXIMO DELTA.
//
// Excluir um evento apaga as peças em cascata no banco, e linha apagada não
// aparece em `?since=`: as peças ficavam em Painel, Gráfica e Análises até o
// resync cheio (30 min). O delta traz TODOS os eventos; peça cujo evento não
// está mais lá sai do cache.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { aplicarDelta } from "../../client/src/lib/queryClient";

const ev = (id: string) => ({ id, name: `Evento ${id}` });
const peca = (id: string, eventId: string | null) => ({ id, eventId, event: eventId ? ev(eventId) : null, createdAt: `2026-09-0${id.length}`, status: "requested" });

describe("aplicarDelta · evento excluído", () => {
  const anterior = [peca("p1", "e1"), peca("p2", "e2"), peca("p3", "e2"), peca("p4", null)];

  it("peça de evento que sumiu da lista de eventos sai; as outras ficam com a MESMA identidade", () => {
    const assinaturas = { eventos: new Map([["e1", JSON.stringify(ev("e1"))]]), patrocinadores: new Map() };
    const novo = aplicarDelta(anterior, { delta: true, itens: [], removidas: [], eventos: [ev("e1")], patrocinadores: [] }, assinaturas);
    expect(novo.map((p) => p.id)).toEqual(["p1", "p4"]);
    expect(novo[0]).toBe(anterior[0]);
  });

  it("delta sem a lista de eventos (formato antigo) não apaga nada", () => {
    const novo = aplicarDelta(anterior, { delta: true, itens: [], removidas: [] }, null);
    expect(novo.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("nada mudou → devolve o mesmo array (sem re-render)", () => {
    const eventos = [ev("e1"), ev("e2")];
    const assinaturas = { eventos: new Map(eventos.map((e) => [e.id, JSON.stringify(e)])), patrocinadores: new Map() };
    expect(aplicarDelta(anterior, { delta: true, itens: [], removidas: [], eventos, patrocinadores: [] }, assinaturas)).toBe(anterior);
  });
});
