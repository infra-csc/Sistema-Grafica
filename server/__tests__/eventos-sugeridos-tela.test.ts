// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÕES DO UMMENSE NA TELA DE EVENTOS (dono, 15/10).
//
//   · admin/Solicitação veem "Sugestões do Ummense (N)"; a Arte não (e nem
//     pede a rota);
//   · o painel lista por mês, com a data da FOTO visível, o nº de
//     patrocinadores (e quantos sem cadastro) e o "Pode já existir" com link;
//   · "Criar evento" abre o MESMO formulário de criação, pré-preenchido: nome,
//     data, patrocinadores do cadastro marcados com a cota do Ummense — o
//     arquivado não; a saída do caminhão em branco;
//   · patrocinador sem cadastro: listado à parte; POST /api/sponsors SÓ ao
//     clicar em "Criar no cadastro" — e ele entra marcado;
//   · "Ignorar" tira da lista e do N, guarda por usuário (localStorage) e
//     "Voltar a sugerir" devolve.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { RespostaEventosSugeridos } from "@shared/eventos-sugeridos";

const h = React.createElement;
let papel = "solicitacao";
const SPONSORS: Array<{ id: string; name: string; color: string; company: string | null }> = [
  { id: "sp-sant", name: "Santander", color: "#ec0000", company: null },
  { id: "sp-dec", name: "Decathlon", color: "#0082c3", company: null },
  { id: "sp-pow", name: "Powerade", color: "#1d4ed8", company: null },
];
const SUGERIDOS: RespostaEventosSugeridos = {
  fotoDe: "2026-10-15",
  origem: "Ummense — Calendário 2026 + Atribuir Entregas",
  hoje: "2026-10-15",
  futurosNaFoto: 10,
  jaNoApp: 7,
  sugestoes: [
    {
      id: "nr-maceio", nome: "Night Run - Etapa 1 - Maceió", data: "2026-11-21", cidade: "Maceió", estacao: null,
      dataNaoConfirmada: false, tags: [], podeJaExistir: null,
      patrocinadores: [
        { nomeNoUmmense: "Santander", cota: "MASTER", cotaNoApp: "MASTER", sponsorId: "sp-sant", nomeNoApp: "Santander", arquivado: false },
        { nomeNoUmmense: "Decatlhon", cota: "APOIO", cotaNoApp: "APOIO", sponsorId: "sp-dec", nomeNoApp: "Decathlon", arquivado: false },
        { nomeNoUmmense: "Zurich", cota: "SILVER", cotaNoApp: "SILVER", sponsorId: "sp-zur", nomeNoApp: "Zurich", arquivado: true },
        { nomeNoUmmense: "O2 PRIME", cota: "O2 PRIME", cotaNoApp: null, sponsorId: null, nomeNoApp: null, arquivado: false },
        { nomeNoUmmense: "Tokio Marine", cota: "GOLD", cotaNoApp: "GOLD", sponsorId: null, nomeNoApp: null, arquivado: false },
      ],
    },
    {
      id: "eco-navegantes", nome: "Eco Run - Navegantes", data: "2026-11-22", cidade: "Navegantes", estacao: null,
      dataNaoConfirmada: true, tags: ["DATA NÃO CONFIRMADA"],
      podeJaExistir: { id: "ev-eco", nome: "Eco Run Navegantes", data: "2026-10-11", arquivado: false, motivo: "mesma marca e cidade, em 11/10 no app" },
      patrocinadores: [{ nomeNoUmmense: "Portonave", cota: "GOLD", cotaNoApp: "GOLD", sponsorId: null, nomeNoApp: null, arquivado: false }],
    },
    {
      id: "verao-sp", nome: "Circuito das Estações - São Paulo", data: "2026-12-20", cidade: "São Paulo", estacao: "VERÃO",
      dataNaoConfirmada: false, tags: [], podeJaExistir: null,
      patrocinadores: [{ nomeNoUmmense: "Powerade", cota: "MASTER", cotaNoApp: "MASTER", sponsorId: "sp-pow", nomeNoApp: "Powerade", arquivado: false }],
    },
  ],
};

const chamadas: Array<{ metodo: string; url: string; corpo: any }> = [];
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });

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
    if (u === "/api/auth/me") return json({ id: "u-sol", name: "Sofia", email: "s@s", role: papel, mustChangePassword: false });
    if (u === "/api/sponsors" && metodo === "POST") {
      const novo = { id: "sp-novo", name: JSON.parse(init.body).name, color: "#3b82f6", company: null };
      SPONSORS.push(novo);
      return json(novo, 201);
    }
    if (u === "/api/sponsors") return json(SPONSORS);
    if (u === "/api/eventos-sugeridos") return json(SUGERIDOS);
    if (u.split("?")[0] === "/api/events" && metodo === "GET") return json([]);
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
  await tick(80);
};

async function abrirEventos(comPapel: string) {
  cleanup();
  papel = comPapel;
  chamadas.length = 0;
  window.history.replaceState(null, "", "/eventos");
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const { AuthProvider } = await import("@/contexts/auth-context");
  const { Toaster } = await import("@/components/ui/toaster");
  const Eventos = (await import("@/pages/eventos")).default;
  queryClient.clear();
  render(h(QueryClientProvider, { client: queryClient } as any,
    h(TooltipProvider, null, h(AuthProvider, null, h(Eventos as any, null), h(Toaster as any, null)))));
  await tick(200);
}

describe("Sugestões do Ummense: entrada e painel", () => {
  it("Solicitação vê o botão com N e o painel com a foto, os meses e o aviso", async () => {
    try { localStorage.clear(); } catch { /* sem storage */ }
    await abrirEventos("solicitacao");
    await esperar('[data-testid="contagem-sugestoes-ummense"]');
    expect(el('[data-testid="button-sugestoes-ummense"]')!.textContent).toContain("Sugestões do Ummense");
    expect(el('[data-testid="contagem-sugestoes-ummense"]')!.textContent).toBe("3");

    await clicar('[data-testid="button-sugestoes-ummense"]');
    await esperar('[data-testid="sugestao-nr-maceio"]');
    expect(el('[data-testid="foto-do-ummense"]')!.textContent).toContain("Foto do Ummense de 15/10");
    expect(el('[data-testid="foto-do-ummense"]')!.textContent).toContain("10 eventos de hoje em diante · 7 já no app");
    // Por mês, em ordem.
    const meses = Array.from(document.querySelectorAll(".sug-ev-mes-titulo")).map((x) => x.textContent);
    expect(meses).toEqual(["Novembro 20262", "Dezembro 20261"]);
    // Linha: cidade, patrocinadores e quantos sem cadastro.
    const maceio = el('[data-testid="sugestao-nr-maceio"]')!.textContent!;
    expect(maceio).toContain("Night Run - Etapa 1 - Maceió");
    expect(maceio).toContain("Maceió");
    expect(maceio).toContain("5 patrocinadores");
    expect(el('[data-testid="sem-cadastro-nr-maceio"]')!.textContent).toContain("2 sem cadastro");
    // A dúvida, com o link para o evento do app.
    expect(el('[data-testid="pode-existir-eco-navegantes"]')!.textContent).toContain("Pode já existir: Eco Run Navegantes");
    expect(el('[data-testid="link-pode-existir-eco-navegantes"]')!.getAttribute("href")).toBe("/eventos/ev-eco");
    expect(el('[data-testid="sugestao-eco-navegantes"]')!.textContent).toContain("Data não confirmada");
  }, 30_000);

  it("a Arte não vê o botão nem pede a rota", async () => {
    await abrirEventos("arte");
    await tick(300);
    expect(el('[data-testid="button-sugestoes-ummense"]')).toBeNull();
    expect(chamadas.some((c) => c.url === "/api/eventos-sugeridos")).toBe(false);
  }, 30_000);
});

describe("Criar evento a partir da sugestão", () => {
  it("abre o formulário de criação pré-preenchido; sem cadastro só cria ao clicar", async () => {
    try { localStorage.clear(); } catch { /* sem storage */ }
    await abrirEventos("solicitacao");
    await esperar('[data-testid="button-sugestoes-ummense"]');
    await clicar('[data-testid="button-sugestoes-ummense"]');
    await esperar('[data-testid="criar-sugestao-nr-maceio"]');
    await clicar('[data-testid="criar-sugestao-nr-maceio"]');
    await esperar('[data-testid="input-event-name"]');
    await tick(200);

    // O painel fechou; o formulário é o de criação de sempre.
    expect(el('[data-testid="painel-sugestoes-ummense"]')).toBeNull();
    expect((el('[data-testid="input-event-name"]') as HTMLInputElement).value).toBe("Night Run - Etapa 1 - Maceió");
    expect(el('[data-testid="input-start-date"]')!.textContent).toContain("21/11/2026");
    // Saída do caminhão em branco (o Ummense não dá).
    expect(el('[data-testid="input-truck-date"]')!.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(el('[data-testid="button-submit-event"]')!.textContent).toContain("Salvar Evento");

    // Patrocinadores do cadastro marcados com a cota do Ummense.
    expect((el('[data-testid="checkbox-sponsor-sp-sant"]') as HTMLInputElement).checked).toBe(true);
    expect((el('[data-testid="quota-select-sp-sant"]') as HTMLSelectElement).value).toBe("MASTER");
    expect((el('[data-testid="checkbox-sponsor-sp-dec"]') as HTMLInputElement).checked).toBe(true);
    expect((el('[data-testid="quota-select-sp-dec"]') as HTMLSelectElement).value).toBe("APOIO");
    // Quem não está na sugestão, não.
    expect((el('[data-testid="checkbox-sponsor-sp-pow"]') as HTMLInputElement).checked).toBe(false);

    // O bloco do Ummense: os sem cadastro à parte, e o arquivado dito.
    const bloco = el('[data-testid="patrocinadores-do-ummense"]')!;
    expect(bloco.textContent).toContain("5 no Ummense · 2 já marcados");
    expect(bloco.textContent).toContain("2 sem cadastro");
    expect(el('[data-testid="patr-sem-cadastro-O2 PRIME"]')).toBeTruthy();
    expect(el('[data-testid="patr-sem-cadastro-Tokio Marine"]')).toBeTruthy();
    expect(el('[data-testid="patr-arquivados"]')!.textContent).toContain("Zurich");

    // Nada foi criado no cadastro só por abrir.
    expect(chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/sponsors")).toEqual([]);

    // "Criar no cadastro": cria ESTE, e ele entra marcado com a cota.
    await clicar('[data-testid="criar-patrocinador-Tokio Marine"]');
    await tick(300);
    const posts = chamadas.filter((c) => c.metodo === "POST" && c.url === "/api/sponsors");
    expect(posts.map((p) => p.corpo)).toEqual([{ name: "Tokio Marine" }]);
    expect(el('[data-testid="patr-sem-cadastro-Tokio Marine"]')!.textContent).toContain("Cadastrado e marcado");
    await esperar('[data-testid="checkbox-sponsor-sp-novo"]');
    expect((el('[data-testid="checkbox-sponsor-sp-novo"]') as HTMLInputElement).checked).toBe(true);
    expect((el('[data-testid="quota-select-sp-novo"]') as HTMLSelectElement).value).toBe("GOLD");
    // O outro continua só listado.
    expect(el('[data-testid="criar-patrocinador-O2 PRIME"]')).toBeTruthy();
    expect(el('[data-testid="patrocinadores-do-ummense"]')!.textContent).toContain("1 sem cadastro");
    expect(el('[data-testid="patrocinadores-do-ummense"]')!.textContent).toContain("5 no Ummense · 3 já marcados");
  }, 30_000);

  it("Novo Evento comum não traz o bloco do Ummense (a porta inicializa)", async () => {
    await abrirEventos("solicitacao");
    await esperar('[data-testid="button-create-event"]');
    await clicar('[data-testid="button-create-event"]');
    await esperar('[data-testid="input-event-name"]');
    expect(el('[data-testid="patrocinadores-do-ummense"]')).toBeNull();
    expect((el('[data-testid="input-event-name"]') as HTMLInputElement).value).toBe("");
  }, 30_000);
});

describe("Ignorar", () => {
  it("tira da lista e do N, guarda por usuário e volta a sugerir", async () => {
    try { localStorage.clear(); } catch { /* sem storage */ }
    await abrirEventos("admin");
    await esperar('[data-testid="contagem-sugestoes-ummense"]');
    await clicar('[data-testid="button-sugestoes-ummense"]');
    await esperar('[data-testid="ignorar-sugestao-verao-sp"]');
    const antes = chamadas.length;
    await clicar('[data-testid="ignorar-sugestao-verao-sp"]');
    expect(el('[data-testid="sugestao-verao-sp"]')).toBeNull();
    expect(el('[data-testid="contagem-sugestoes-ummense"]')!.textContent).toBe("2");
    // Só na tela: nenhuma requisição de escrita.
    expect(chamadas.slice(antes).filter((c) => c.metodo !== "GET")).toEqual([]);
    expect(JSON.parse(localStorage.getItem("sug-ev-ignorados:u-sol") || "[]")).toEqual(["verao-sp"]);

    await clicar('[data-testid="toggle-ignoradas"]');
    await esperar('[data-testid="ignorada-verao-sp"]');
    await clicar('[data-testid="voltar-sugestao-verao-sp"]');
    await esperar('[data-testid="sugestao-verao-sp"]');
    expect(el('[data-testid="contagem-sugestoes-ummense"]')!.textContent).toBe("3");
    expect(JSON.parse(localStorage.getItem("sug-ev-ignorados:u-sol") || "[]")).toEqual([]);
  }, 30_000);
});
