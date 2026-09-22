// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// SALVAR EM LOTE COM FALHA PARCIAL — o motivo fica NA LINHA (revisão 22/09).
//
// Antes: o toast mostrava o erro da PRIMEIRA peça que falhou, a seleção se
// perdia e a pessoa não sabia qual peça do lote tinha ficado para trás. Agora
// a que falhou continua selecionada, o motivo aparece escrito na linha dela e
// o toast só resume. E o cartão da busca de arte diz "Aprovada".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const SPONSORS = [
  { id: "s1", name: "Bradesco", color: "#3b82f6", company: null },
  { id: "s2", name: "Ministério", color: "#10b981", company: null },
];
const EVENTO = {
  id: "e1", name: "Circuito das Estações 2099", priority: "alta", status: "active", manuallyClosed: false,
  startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: [{ sponsorId: "s1", quota: "ouro" }, { sponsorId: "s2", quota: "ouro" }],
  items: [],
  nextMilestone: null,
};
const pecaDe = (id: string, n: number) => ({
  id, displayId: `#${n}`, eventId: "e1", event: EVENTO, type: "Pórtico", description: `Peça ${n}`,
  quantity: 1, visualWidth: "3", visualHeight: "2", material: "Lona", finish: "Ilhós",
  status: "awaiting_linking", skipApproval: false, isReuse: false, observations: "", sponsors: [],
  approvalThumbUrl: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z",
});
const ITENS = [pecaDe("i1", 1001), pecaDe("i2", 1002)];

const json = (b: any, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u.split("?")[0] === "/api/events") return json([EVENTO]);
    if (u === "/api/items" || u.startsWith("/api/items?")) return json(ITENS);
    // i1 salva; i2 esbarra num patrocinador que sumiu.
    if (method === "POST" && u === "/api/items/i1/sponsors/sync") return json({ message: "ok" });
    if (method === "POST" && u === "/api/items/i2/sponsors/sync") return json({ error: "Patrocinador não encontrado: s2. Recarregue a tela e tente de novo." }, 400);
    if (u.startsWith("/api/artes/busca")) {
      return json({
        alvo: { id: "alvo", displayId: "#9", tipo: "2x1", eventName: "X", patrocinadores: [] },
        total: 2, cortou: false,
        artes: [
          { id: "a1", displayId: "#1", tipo: "2x1", descricao: null, eventId: "e", eventName: "E", eventInicio: null, patrocinadores: [],
            thumbUrl: "/objects/a1", previewUrl: null, arquivoFinalUrl: null, arquivoFinalNome: null, temThumb: true, temPrevia: false,
            temArquivoFinal: false, mesmoPatrocinador: false, mesmoTipo: true, eventoParecido: false,
            aprovada: true, aprovadaPor: "Karina", aprovadaEm: "2026-09-10T15:00:00.000Z" },
          { id: "a2", displayId: "#2", tipo: "2x1", descricao: null, eventId: "e", eventName: "E", eventInicio: null, patrocinadores: [],
            thumbUrl: "/objects/a2", previewUrl: null, arquivoFinalUrl: null, arquivoFinalNome: null, temThumb: true, temPrevia: false,
            temArquivoFinal: false, mesmoPatrocinador: false, mesmoTipo: true, eventoParecido: false,
            aprovada: false, aprovadaPor: null, aprovadaEm: null },
        ],
      });
    }
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(seletor: string, max = 200) {
  for (let i = 0; i < max && !document.querySelector(seletor); i++) await tick(25);
  expect(document.querySelector(seletor)).toBeTruthy();
}
const clicar = async (seletor: string) => {
  const el = document.querySelector(seletor) as HTMLElement | null;
  expect(el, seletor).toBeTruthy();
  await act(async () => { el!.click(); });
};

describe("Vinculação: salvar em lote com falha parcial", () => {
  it("a que falhou continua selecionada, com o motivo na linha; a que salvou fica limpa", async () => {
    cleanup();
    window.history.replaceState(null, "", "/vincular-patrocinadores");
    try { sessionStorage.clear(); localStorage.clear(); } catch { /* sem storage */ }
    const { queryClient } = await import("@/lib/queryClient");
    const { TooltipProvider } = await import("@/components/ui/tooltip");
    const { AuthProvider } = await import("@/contexts/auth-context");
    const { Toaster } = await import("@/components/ui/toaster");
    const Vincular = (await import("@/pages/vincular-patrocinadores")).default;
    queryClient.clear();
    render(
      h(QueryClientProvider, { client: queryClient } as any,
        h(TooltipProvider, null, h(AuthProvider, null, h(Vincular as any, null), h(Toaster as any, null)))),
    );
    await esperar('[data-testid="item-row-i2"]');

    // Marca um patrocinador em cada peça → duas viram rascunho.
    await clicar('[data-testid="checkbox-sponsor-i1-s1"]');
    await clicar('[data-testid="checkbox-sponsor-i2-s2"]');
    await tick();
    await esperar('[data-testid="button-save-all-drafts"]');
    await clicar('[data-testid="button-save-all-drafts"]');
    await esperar('[data-testid="falha-linha-i2"]');

    expect(document.querySelector('[data-testid="falha-linha-i2"]')!.textContent).toContain("Patrocinador não encontrado: s2");
    expect(document.querySelector('[data-testid="falha-linha-i1"]')).toBeNull();
    // A que falhou está marcada; a que salvou, não.
    expect(document.querySelector('[data-testid="checkbox-item-i2"]')!.getAttribute("data-state")).toBe("checked");
    expect(document.querySelector('[data-testid="checkbox-item-i1"]')!.getAttribute("data-state")).not.toBe("checked");
    // O toast só resume e aponta para a linha.
    const corpo = document.body.textContent || "";
    expect(corpo).toContain("1 salva, 1 com problema");
    expect(corpo).toContain("o motivo está na linha");
  }, 30000);
});

describe("Busca de arte: selo 'Aprovada'", () => {
  it("a aprovada tem selo com quem/quando no tooltip e no rodapé ao escolher; a outra não", async () => {
    cleanup();
    const { queryClient } = await import("@/lib/queryClient");
    const { BuscarArteDialog } = await import("@/components/buscar-arte-dialog");
    queryClient.clear();
    render(h(QueryClientProvider, { client: queryClient } as any,
      h(BuscarArteDialog as any, { item: { id: "alvo" }, onUsar: () => {}, onClose: () => {} })));
    await esperar('[data-testid="card-busca-arte-a1"]');
    await tick(400);

    const selo = document.querySelector('[data-testid="selo-aprovada-a1"]') as HTMLElement;
    expect(selo).toBeTruthy();
    expect(selo.textContent).toBe("Aprovada");
    expect(selo.parentElement!.getAttribute("title")).toBe("Aprovada por Karina, 10/09");
    expect(document.querySelector('[data-testid="selo-aprovada-a2"]')).toBeNull();

    await clicar('[data-testid="card-busca-arte-a1"]');
    await esperar('[data-testid="texto-aprovacao-escolhida"]');
    expect(document.querySelector('[data-testid="texto-aprovacao-escolhida"]')!.textContent).toBe("Aprovada por Karina, 10/09");
  }, 30000);
});
