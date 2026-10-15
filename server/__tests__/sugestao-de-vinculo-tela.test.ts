// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE VÍNCULO NA TELA (dono, 15/10) — de relance, o que é SUGESTÃO e o
// que está GRAVADO.
//
//   · chip sugerido: contorno tracejado, aria-checked=false, motivo no title;
//   · a faixa "Sugerido" com Aceitar e Descartar na linha;
//   · o vínculo que o sistema fez sozinho: chip normal + selo "Automático";
//   · o "Aplicar sugestões (N)" do evento manda SÓ quais peças — e a tela
//     passa a mostrar o que o servidor gravou;
//   · Descartar é só na tela (nenhuma requisição) e tira a peça do N.
//
// E a tela da cota sugerida, no formulário do evento.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const SPONSORS = [
  { id: "s-itau", name: "Itaú", color: "#ec7000", company: null },
  { id: "s-nike", name: "Nike", color: "#111111", company: null },
  { id: "s-gat", name: "Gatorade", color: "#16a34a", company: null },
];
const EVENTO = {
  id: "e1", name: "Maratona do Rio 2099", priority: "alta", status: "active", manuallyClosed: false,
  startDate: "2099-09-10", truckDepartureDate: "2099-09-05T08:00:00.000Z",
  deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1,
  lifecycle: "active", allDelivered: false, eventHasPassed: false,
  sponsors: SPONSORS.map((s) => ({ sponsorId: s.id, quota: null })),
  items: [],
  nextMilestone: null,
};
const peca = (id: string, n: number, type: string, description: string, sponsors: string[] = []) => ({
  id, displayId: `#${n}`, eventId: "e1", event: EVENTO, type, description,
  quantity: 1, visualWidth: "3", visualHeight: "2", material: "Lona", finish: "Ilhós",
  status: "awaiting_linking", skipApproval: false, isReuse: false, observations: "",
  sponsors: sponsors.map((sid) => ({ id: sid })),
  approvalThumbUrl: null, createdAt: "2026-08-01T12:00:00.000Z", updatedAt: "2026-08-01T12:00:00.000Z",
});
const ITENS = [
  peca("p-portico", 1001, "Pórtico", "Pórtico de chegada"),
  peca("p-display", 1002, "Display", "Display entrada"),
  peca("p-rolo", 1003, "Rolo", "Rolo Itaú 2x1", ["s-itau"]),
  peca("p-livre", 1004, "Testeira", "Testeira lateral"),
];
const estrutura = (sponsorId: string) => ({ sponsorId, regra: "estrutura", confianca: 0.93, motivo: "Peça de estrutura: leva os patrocinadores do evento", automatica: false });
const SUGESTOES = {
  e1: {
    porPeca: {
      "p-portico": SPONSORS.map((s) => estrutura(s.id)),
      "p-display": [{ sponsorId: "s-itau", regra: "cota", confianca: 0.91, motivo: "MASTER costuma ir em Display (12 de 14 eventos)", automatica: false }],
    },
    automaticos: { "p-rolo": [{ sponsorId: "s-itau", motivo: "O nome está na descrição" }] },
  },
};

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const chamadas: Array<{ metodo: string; url: string; corpo: any }> = [];

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
    const metodo = (init?.method || "GET").toUpperCase();
    chamadas.push({ metodo, url: u, corpo: init?.body ? JSON.parse(init.body) : undefined });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Arte", email: "a@a", role: "arte", mustChangePassword: false });
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u.split("?")[0] === "/api/events") return json([EVENTO]);
    if (u === "/api/items" || u.startsWith("/api/items?")) return json(ITENS);
    if (u.startsWith("/api/sugestoes-de-vinculo?")) return json(SUGESTOES);
    if (metodo === "POST" && u === "/api/events/e1/sugestoes-de-vinculo/aplicar") {
      const ids: string[] = JSON.parse(init.body).itemIds;
      const aplicadas = ids.map((itemId) => ({ itemId, displayId: "#", sponsorIds: (SUGESTOES.e1.porPeca as any)[itemId].map((s: any) => s.sponsorId) }));
      return json({ aplicadas, vinculos: aplicadas.reduce((n, a) => n + a.sponsorIds.length, 0) });
    }
    if (u.startsWith("/api/cotas-sugeridas")) return json({ "s-itau": { cota: "MASTER", seguidos: 3, eventos: 5 }, "s-nike": { cota: "GOLD", seguidos: 1, eventos: 2 } });
    return json([]);
  });
});

async function tick(ms = 60) { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); }
async function esperar(seletor: string, max = 200) {
  for (let i = 0; i < max && !document.querySelector(seletor); i++) await tick(25);
  expect(document.querySelector(seletor), seletor).toBeTruthy();
}
const el = (s: string) => document.querySelector(s) as HTMLElement | null;
const clicar = async (s: string) => {
  const alvo = el(s);
  expect(alvo, s).toBeTruthy();
  await act(async () => { alvo!.click(); });
};

async function abrirVincular() {
  cleanup();
  window.history.replaceState(null, "", "/vincular-patrocinadores");
  try { sessionStorage.clear(); localStorage.clear(); } catch { /* sem storage */ }
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const { Toaster } = await import("@/components/ui/toaster");
  const Vincular = (await import("@/pages/vincular-patrocinadores")).default;
  queryClient.clear();
  render(h(QueryClientProvider, { client: queryClient } as any,
    h(TooltipProvider, null, h(AuthProvider, null, h(Vincular as any, null), h(Toaster as any, null)))));
  await esperar('[data-testid="item-row-p-livre"]');
  await esperar('[data-testid="sugestao-p-portico"]');
}

describe("Vincular: sugestão × gravado", () => {
  it("chip sugerido é tracejado e NÃO marcado; a faixa diz 'Sugerido' e o motivo", async () => {
    await abrirVincular();
    const chip = el('[data-testid="checkbox-sponsor-p-portico-s-nike"]')!;
    expect(chip.getAttribute("data-sugerido")).toBe("sugerido");
    expect(chip.getAttribute("aria-checked")).toBe("false");
    expect(chip.style.border).toContain("dashed");
    expect(chip.getAttribute("title")).toContain("Peça de estrutura");
    const faixa = el('[data-testid="sugestao-p-portico"]')!;
    expect(faixa.textContent).toContain("Sugerido");
    expect(faixa.textContent).toContain("Todos os 3 — peça de estrutura: leva os patrocinadores do evento");
    expect(el('[data-testid="btn-aceitar-sugestao-p-portico"]')).toBeTruthy();
    // sem sugestão, sem faixa e sem chip tracejado
    expect(el('[data-testid="sugestao-p-livre"]')).toBeNull();
    expect(el('[data-testid="checkbox-sponsor-p-livre-s-nike"]')!.getAttribute("data-sugerido")).toBeNull();
    // a linha com sugestão continua "Pendente": nada foi gravado
    expect(el('[data-testid="badge-status-p-portico"]')!.textContent).toMatch(/Pendente/i);
  }, 30000);

  it("o vínculo automático é chip MARCADO de verdade, com o selo 'Automático'", async () => {
    await abrirVincular();
    const chip = el('[data-testid="checkbox-sponsor-p-rolo-s-itau"]')!;
    expect(chip.getAttribute("aria-checked")).toBe("true");
    expect(chip.getAttribute("data-sugerido")).toBeNull();
    expect(chip.hasAttribute("data-automatico")).toBe(true);
    expect(el('[data-testid="selo-automatico-p-rolo"]')!.textContent).toContain("Automático");
    expect(el('[data-testid="sugestao-p-rolo"]')).toBeNull();
  }, 30000);

  it("Descartar só esconde (nenhuma requisição) e tira a peça do 'Aplicar sugestões (N)'", async () => {
    await abrirVincular();
    expect(el('[data-testid="button-aplicar-sugestoes-e1"]')!.textContent).toContain("Aplicar sugestões (2)");
    const antes = chamadas.filter((c) => c.metodo !== "GET").length;
    await clicar('[data-testid="btn-descartar-sugestao-p-display"]');
    await tick();
    expect(el('[data-testid="sugestao-p-display"]')).toBeNull();
    expect(el('[data-testid="checkbox-sponsor-p-display-s-itau"]')!.getAttribute("data-sugerido")).toBeNull();
    expect(el('[data-testid="button-aplicar-sugestoes-e1"]')!.textContent).toContain("Aplicar sugestões (1)");
    expect(chamadas.filter((c) => c.metodo !== "GET").length).toBe(antes);
  }, 30000);

  it("'Aplicar sugestões' manda só QUAIS peças e a tela mostra o que ficou gravado", async () => {
    await abrirVincular();
    await clicar('[data-testid="button-aplicar-sugestoes-e1"]');
    for (let i = 0; i < 80 && el('[data-testid="sugestao-p-portico"]'); i++) await tick(25);
    const post = chamadas.filter((c) => c.metodo === "POST" && c.url.endsWith("/sugestoes-de-vinculo/aplicar")).pop()!;
    expect(post.corpo).toEqual({ itemIds: expect.arrayContaining(["p-portico", "p-display"]) });
    expect(Object.keys(post.corpo)).toEqual(["itemIds"]);
    // gravado: chips marcados de verdade, faixa some, a linha fica Pronta
    for (const s of SPONSORS) {
      expect(el(`[data-testid="checkbox-sponsor-p-portico-${s.id}"]`)!.getAttribute("aria-checked")).toBe("true");
    }
    expect(el('[data-testid="sugestao-p-portico"]')).toBeNull();
    expect(el('[data-testid="badge-status-p-portico"]')!.textContent).toMatch(/Pronto/i);
    expect(el('[data-testid="button-aplicar-sugestoes-e1"]')).toBeNull();
  }, 30000);

  it("'Aceitar' grava a sugestão só daquela peça", async () => {
    await abrirVincular();
    await clicar('[data-testid="btn-aceitar-sugestao-p-display"]');
    for (let i = 0; i < 80 && el('[data-testid="sugestao-p-display"]'); i++) await tick(25);
    const post = chamadas.filter((c) => c.metodo === "POST" && c.url.endsWith("/sugestoes-de-vinculo/aplicar")).pop()!;
    expect(post.corpo).toEqual({ itemIds: ["p-display"] });
    expect(el('[data-testid="checkbox-sponsor-p-display-s-itau"]')!.getAttribute("aria-checked")).toBe("true");
    // a outra peça segue com a sugestão dela
    expect(el('[data-testid="sugestao-p-portico"]')).toBeTruthy();
  }, 30000);

  it("marcar um chip à mão leva a linha ao rascunho: a faixa fica só com 'Descartar sugestão'", async () => {
    await abrirVincular();
    await clicar('[data-testid="checkbox-sponsor-p-portico-s-itau"]');
    await tick();
    expect(el('[data-testid="checkbox-sponsor-p-portico-s-itau"]')!.getAttribute("aria-checked")).toBe("true");
    expect(el('[data-testid="checkbox-sponsor-p-portico-s-nike"]')!.getAttribute("data-sugerido")).toBe("sugerido");
    expect(el('[data-testid="btn-aceitar-sugestao-p-portico"]')).toBeNull();
    expect(el('[data-testid="btn-descartar-sugestao-p-portico"]')!.textContent).toBe("Descartar sugestão");
  }, 30000);
});

describe("Formulário do evento: cota sugerida", () => {
  async function montar(inicial: { ids: string[]; cotas: Record<string, string> }) {
    cleanup();
    const { queryClient } = await import("@/lib/queryClient");
    const { EscolhaDePatrocinadores } = await import("@/components/eventos/escolha-de-patrocinadores");
    queryClient.clear();
    const estado: { cotas: Record<string, string> } = { cotas: {} };
    function Casca() {
      const [selectedSponsorIds, setSelectedSponsorIds] = React.useState<string[]>(inicial.ids);
      const [sponsorQuotaMap, setSponsorQuotaMap] = React.useState<Record<string, string>>(inicial.cotas);
      const [sponsorSearch, setSponsorSearch] = React.useState("");
      estado.cotas = sponsorQuotaMap;
      const form = {
        selectedSponsorIds, setSelectedSponsorIds, sponsorQuotaMap, setSponsorQuotaMap,
        sponsorsLoading: false, sponsorsError: false, sponsorSearch, setSponsorSearch,
        editingEvent: null, duplicateSource: null, fetchEventSponsors: () => {},
        ordemFixadaNoTopo: new Set<string>(), soPatrocinadoresNoModal: false,
      };
      return h(EscolhaDePatrocinadores as any, { form, sponsors: SPONSORS, sponsorsQueryLoading: false, sponsorsQueryError: false });
    }
    render(h(QueryClientProvider, { client: queryClient } as any, h(Casca)));
    await tick(150);
    return estado;
  }

  it("marcar o patrocinador PREENCHE a cota sugerida e diz de onde veio", async () => {
    const estado = await montar({ ids: [], cotas: {} });
    await act(async () => { fireEvent.click(el('#sponsor-s-itau')!); });
    await tick();
    expect(estado.cotas["s-itau"]).toBe("MASTER");
    expect(el('[data-testid="cota-sugerida-s-itau"]')!.textContent).toContain("Sugerida: MASTER (últimos 3 eventos)");
    expect(el('[data-testid="usar-cota-sugerida-s-itau"]')).toBeNull();
    // sem histórico: nada preenchido
    await act(async () => { fireEvent.click(el('#sponsor-s-gat')!); });
    await tick();
    expect(estado.cotas["s-gat"]).toBeUndefined();
    expect(el('[data-testid="cota-sugerida-s-gat"]')).toBeNull();
  }, 30000);

  it("vínculo que JÁ existe sem cota: mostra a sugestão com 'Usar' — e não grava sozinho", async () => {
    const estado = await montar({ ids: ["s-nike"], cotas: {} });
    expect(estado.cotas["s-nike"]).toBeUndefined();
    expect(el('[data-testid="cota-sugerida-s-nike"]')!.textContent).toContain("Sugerida: GOLD (último evento)");
    await act(async () => { el('[data-testid="usar-cota-sugerida-s-nike"]')!.click(); });
    await tick();
    expect(estado.cotas["s-nike"]).toBe("GOLD");
  }, 30000);

  it("cota escolhida à mão não ganha a frase da sugestão", async () => {
    const estado = await montar({ ids: ["s-itau"], cotas: { "s-itau": "GOLD" } });
    expect(estado.cotas["s-itau"]).toBe("GOLD");
    expect(el('[data-testid="cota-sugerida-s-itau"]')).toBeNull();
  }, 30000);
});

describe("a frase da faixa de sugestão", () => {
  it("agrupa pelo motivo, junta os nomes ambíguos e diz 'Todos' quando é o elenco inteiro", async () => {
    const { gruposDaSugestao } = await import("@/components/vinculacao/regras");
    const nomes = new Map(SPONSORS.map((s) => [s.id, s.name]));
    const s = (sponsorId: string, regra: string, motivo: string) => ({ sponsorId, regra, motivo, confianca: 0.5, automatica: false }) as any;
    expect(gruposDaSugestao([
      s("s-itau", "nome-na-descricao", "O nome está na descrição, junto com Nike"),
      s("s-nike", "nome-na-descricao", "O nome está na descrição, junto com Itaú"),
    ], nomes, 3)).toEqual([{ quem: "Itaú e Nike", motivo: "os dois nomes estão na descrição; confira se vão os dois" }]);
    expect(gruposDaSugestao(SPONSORS.map((x) => s(x.id, "estrutura", "Peça de estrutura: leva os patrocinadores do evento")), nomes, 3))
      .toEqual([{ quem: "Todos os 3", motivo: "peça de estrutura: leva os patrocinadores do evento" }]);
    expect(gruposDaSugestao([s("s-itau", "cota", "MASTER costuma ir em Display (12 de 14 eventos) — cota pelo histórico do patrocinador")], nomes, 3))
      .toEqual([{ quem: "Itaú", motivo: "MASTER costuma ir em Display (12 de 14 eventos); cota pelo histórico" }]);
  });

  it("o cabeçalho da tela conta as pendentes com sugestão", async () => {
    await abrirVincular();
    expect(document.body.textContent).toContain("2 têm sugestão do histórico");
  }, 30000);
});
