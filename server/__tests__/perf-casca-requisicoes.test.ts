// @vitest-environment jsdom
//
// PERF-7 — O QUE A CASCA PEDE AO SERVIDOR SÓ POR EXISTIR.
//
// A casca (sidebar, topbar, sino, busca, toaster) aparece em TODA tela. Cada
// requisição que ela faz ao montar é paga em toda navegação com F5 — e em
// produção as telas mostravam /api/notifications duas vezes e cargas pesadas
// (/api/events, /api/sponsors, /api/standard-items) que pareciam vir dela.
//
// Este arquivo monta o App INTEIRO numa rota sem página de dados (a 404, que
// é eager e não consulta nada) com o fetch contado, e fixa o orçamento:
//   • /api/auth/me uma vez;
//   • /api/notifications uma vez (a lista do sino é UMA query, da casca);
//   • o badge de pedidos só para quem resolve pedidos;
//   • nada de acervo pesado — isso é das páginas, não da casca.
//
// O WebSocket aqui nunca abre: a revalidação da (re)conexão é assunto do
// hook do tempo real e tem teste próprio. O que se mede é a casca.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { createElement } from "react";
import { render, cleanup, act } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

const pedidos: string[] = [];

function responder(url: string, papel: string) {
  if (url.startsWith("/api/auth/me")) return { id: "u1", name: "Teste", email: "t@t", role: papel, mustChangePassword: false };
  if (url.startsWith("/api/notifications")) return [];
  if (url.startsWith("/api/pedidos-de-peca/pendentes")) return { total: 0 };
  return [];
}

async function montar(papel: string) {
  pedidos.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (entrada: RequestInfo | URL) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.pathname : entrada.url;
    pedidos.push(url);
    return new Response(JSON.stringify(responder(url, papel)), { status: 200, headers: { "content-type": "application/json" } });
  }));
  // Socket que nunca conecta (ver cabeçalho).
  class SocketParado { readyState = 0; onopen: any; onclose: any; onmessage: any; onerror: any; close() {} send() {} }
  vi.stubGlobal("WebSocket", SocketParado as any);
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} unobserve() {} } as any);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} } as any);
  window.history.pushState({}, "", "/rota-que-nao-existe-perf7");
  vi.resetModules();
  const { default: App } = await import("@/App");
  await act(async () => { render(createElement(App)); });
  // Espera a casca montar (o /api/notifications é dela e só sai depois do
  // /api/auth/me) e então dá folga maior que o coalescer de 500ms do tempo
  // real — um espera fixa curta media antes da casca existir.
  const esperar = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  for (let i = 0; i < 300 && !pedidos.some((u) => u.startsWith("/api/notifications")); i++) await esperar(50);
  await esperar(900);
  const contar = (prefixo: string) => pedidos.filter((u) => u === prefixo || u.startsWith(prefixo + "?")).length;
  return contar;
}

beforeEach(() => {
  Element.prototype.scrollTo = function () {} as any;
  Element.prototype.scrollIntoView = function () {} as any;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("a casca pede o mínimo ao montar", () => {
  it("admin: me 1×, notificações 1×, badge 1× — e nenhum acervo pesado", async () => {
    const contar = await montar("admin");
    expect(contar("/api/auth/me")).toBe(1);
    expect(contar("/api/notifications")).toBe(1);
    expect(contar("/api/pedidos-de-peca/pendentes")).toBe(1);
    for (const pesado of ["/api/events", "/api/sponsors", "/api/standard-items", "/api/items"]) {
      expect(contar(pesado), pesado).toBe(0);
    }
    // Orçamento total da casca: se crescer, que seja de propósito.
    expect(pedidos.length, pedidos.join(", ")).toBe(3);
  }, 20_000);

  it("gráfica: não pede o badge de pedidos (não é dela)", async () => {
    const contar = await montar("grafica");
    expect(contar("/api/pedidos-de-peca/pendentes")).toBe(0);
    expect(pedidos.length, pedidos.join(", ")).toBe(2);
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// O CHUNK DE ENTRADA E A NAVEGAÇÃO.
// ─────────────────────────────────────────────────────────────────────────────
const lerFonte = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

describe("o chunk de entrada não carrega telas de formulário", () => {
  it("Login e Alterar senha são lazy — traziam zod, react-hook-form e drizzle para todo F5", () => {
    const app = lerFonte("client/src/App.tsx");
    expect(app).not.toMatch(/^import Login from/m);
    expect(app).not.toMatch(/^import ChangePassword from/m);
    expect(app).toContain('const Login = lazyPage(() => import("@/pages/login"));');
    expect(app).toContain('const ChangePassword = lazyPage(() => import("@/pages/change-password"));');
  });
});

describe("o menu pré-carrega a tela antes do clique", () => {
  it("cada item do menu tem importador — rota nova sem pré-carga é regressão silenciosa", () => {
    const menu = lerFonte("client/src/components/app-sidebar.tsx");
    const prefetch = lerFonte("client/src/lib/prefetch-de-rota.ts");
    const urls = Array.from(menu.matchAll(/\{ title: "[^"]+",\s*url: "([^"]+)"/g), (m) => m[1]);
    expect(urls.length).toBe(26); // + Máquinas, Inferir executivos e Reparo de vínculos
    for (const url of urls) expect(prefetch, url).toContain(`"${url}": () => import(`);
    expect(menu).toContain("prefetchRota(item.url)");
  });

  it("pré-carga é idempotente e nunca lança", async () => {
    const { prefetchRota } = await import("@/lib/prefetch-de-rota");
    expect(() => { prefetchRota("/rota-sem-tela"); prefetchRota("/rota-sem-tela"); }).not.toThrow();
  });
});

describe("aviso não re-renderiza quem só dispara aviso", () => {
  it("useToast sem ler `toasts` não renderiza de novo; quem lê, renderiza", async () => {
    vi.resetModules();
    const { useToast, toast } = await import("@/hooks/use-toast");
    let soDispara = 0;
    let leAPilha = 0;
    function SoDispara() { soDispara++; const { toast: _t } = useToast(); return null; }
    function LeAPilha() { leAPilha++; const { toasts } = useToast(); return createElement("i", null, String(toasts.length)); }
    const { container } = render(createElement("div", null, createElement(SoDispara), createElement(LeAPilha)));
    const antesSo = soDispara;
    const antesLe = leAPilha;
    await act(async () => { toast({ title: "Salvo" }); });
    expect(soDispara).toBe(antesSo);
    expect(leAPilha).toBeGreaterThan(antesLe);
    expect(container.querySelector("i")?.textContent).toBe("1");
  });
});
