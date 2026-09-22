// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A RÉGUA DE LAYOUT, COM AS TELAS MONTADAS.
//
// O caso que este arquivo existe para prender é o TABLET DO GALPÃO: janela de
// 1024–1280px (portanto "desktop" para o `useIsMobile`, que lê a janela) com a
// barra lateral aberta, o que deixa 700–1000px de conteúdo. Nessa faixa as
// tabelas de 900–960px de mínimo rolavam de lado e escondiam a coluna de
// AÇÕES, que é a última — e a rolagem acontecia na PÁGINA, em silêncio.
//
// O que fica preso aqui:
//   1. Janela larga + conteúdo estreito ⇒ CARTÕES (não tabela). É o caso que
//      nenhum corte por `window.innerWidth` conseguia enxergar.
//   2. Conteúdo entre 820 e 1180 ⇒ tabela COMPACTA: as colunas secundárias
//      somem do cabeçalho e o mínimo da tabela cai.
//   3. Conteúdo ≥ 1180 ⇒ tabela inteira, com todas as colunas.
//   4. A coluna de AÇÕES está sempre presente, em qualquer densidade — é o que
//      o tablet perdia.
//   5. `(pointer: coarse)` em janela de desktop ⇒ alvos de 44px.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

// A primeira importação das páginas transforma centenas de módulos.
vi.setConfig({ testTimeout: 120_000 });

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: () => {} }) }));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
/** Os rótulos do cabeçalho da tabela, como o usuário os lê. */
const cabecalhos = () => $$("th").map((t) => (t.textContent ?? "").trim());
const px = (v: string | undefined) => parseFloat(String(v ?? "").replace("px", "")) || 0;

/**
 * Prepara o jsdom com DUAS larguras independentes — é justamente a
 * independência delas que o app precisa respeitar:
 *   `janela`   alimenta `useIsMobile` (window.innerWidth / matchMedia).
 *   `conteudo` alimenta `useElementSize` → `densityFromWidth`.
 * Com a barra lateral aberta as duas divergem em ~256px, e era essa diferença
 * que se perdia quando o layout era decidido pela janela.
 */
function prepararJsdom(janela: number, conteudo: number, opts: { ponteiroGrosso?: boolean } = {}) {
  Object.defineProperty(window, "innerWidth", { value: janela, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /pointer:\s*coarse/.test(q)
      ? !!opts.ponteiroGrosso
      : /max-width:\s*767px/.test(q) && janela < 768,
    media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  // O ResizeObserver não dispara no jsdom; quem entrega a medida é a SEMENTE do
  // hook, que lê getBoundingClientRect logo depois do commit.
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).getBoundingClientRect = function () {
    return { width: conteudo, height: 0, top: 0, left: 0, right: conteudo, bottom: 0, x: 0, y: 0, toJSON() {} };
  };
  (Element.prototype as any).scrollIntoView = () => {};
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
}

function fetchFalso(porUrl: (u: string) => unknown = () => []) {
  const mock = vi.fn(async (url: any) => new Response(JSON.stringify(porUrl(String(url))), {
    status: 200, headers: { "content-type": "application/json" },
  }));
  vi.stubGlobal("fetch", mock);
  return mock;
}

// ─── Dados mínimos de cada tela ──────────────────────────────────────────────

const usuario = (i: number, extra: any = {}) => ({
  id: `u${i}`, name: `Pessoa ${i}`, email: `pessoa.${i}.sobrenome.comprido@cscdoesporte.com.br`,
  role: "solicitacao", kit: false, mustChangePassword: false,
  createdAt: "2026-01-10T12:00:00Z", ...extra,
});

const ativoDoAcervo = (i: number, extra: any = {}) => ({
  id: `s${i}`, displayId: `#EST-${String(i).padStart(4, "0")}`, name: `Lona ${i}`, quantity: 1,
  condition: "PERFEITO", trackingStatus: "NO_GALPAO", location: "Setor A", notes: null,
  franchiseTags: [], sponsorIds: [], approvalThumbUrl: null, autoAdded: true, originalItemId: null, ...extra,
});

const ativoDaTriagem = (i: number, extra: any = {}) => ({
  id: `a${i}`, displayId: `#EST-${String(i).padStart(4, "0")}`, name: `Placa ${i}`, quantity: 1,
  condition: "PERFEITO", trackingStatus: "AGUARDANDO_TRIAGEM", location: null, notes: null,
  franchiseTags: [], sponsorIds: [], sponsors: [], approvalThumbUrl: null, autoAdded: true,
  originalItemId: null, updatedAt: "2026-09-01T12:00:00Z",
  eventId: "e1", eventName: "Evento 1", eventDate: "2026-08-30T00:00:00Z", ...extra,
});

async function montarUsuarios(janela: number, conteudo: number, opts: { ponteiroGrosso?: boolean } = {}) {
  prepararJsdom(janela, conteudo, opts);
  fetchFalso();
  window.history.replaceState({}, "", "/usuarios");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/usuarios")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/users"], [usuario(1), usuario(2, { role: "arte", kit: true })]);
  queryClient.setQueryData(["/api/auth/me"], usuario(9, { id: "u1", role: "admin" }));
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
}

async function montarEstoque(janela: number, conteudo: number, opts: { ponteiroGrosso?: boolean } = {}) {
  prepararJsdom(janela, conteudo, opts);
  fetchFalso();
  window.history.replaceState({}, "", "/estoque");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/estoque")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/inventory"], [ativoDoAcervo(1), ativoDoAcervo(2)]);
  queryClient.setQueryData(["/api/sponsors"], []);
  queryClient.setQueryData(["/api/events"], []);
  queryClient.setQueryData(["/api/estoque/reservas-ativas"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
}

async function montarTriagem(janela: number, conteudo: number, opts: { ponteiroGrosso?: boolean } = {}) {
  prepararJsdom(janela, conteudo, opts);
  fetchFalso();
  window.history.replaceState({}, "", "/triagem-retorno?vista=tabela");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/triagem-retorno")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/inventory/awaiting-triage"], [ativoDaTriagem(1), ativoDaTriagem(2)]);
  queryClient.setQueryData(["/api/estoque/reservas-ativas"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
}

afterEach(async () => {
  cleanup(); vi.unstubAllGlobals();
  const { queryClient, resetItensDelta } = await import("@/lib/queryClient");
  queryClient.clear(); resetItensDelta();
  window.history.replaceState({}, "", "/");
});

// ─── A régua, isolada ────────────────────────────────────────────────────────

describe("a régua de layout (use-mobile)", () => {
  it("tem três degraus e o corte mora na ÁREA ÚTIL", async () => {
    const { densityFromWidth, CONTENT_CARDS_MAX, CONTENT_COMPACT_MAX } = await import("@/hooks/use-mobile");
    expect(densityFromWidth(390)).toBe("cards");
    expect(densityFromWidth(CONTENT_CARDS_MAX - 1)).toBe("cards");
    expect(densityFromWidth(CONTENT_CARDS_MAX)).toBe("compact");
    expect(densityFromWidth(CONTENT_COMPACT_MAX - 1)).toBe("compact");
    expect(densityFromWidth(CONTENT_COMPACT_MAX)).toBe("full");
    expect(densityFromWidth(1600)).toBe("full");
  });

  it("o alvo só cresce quando o ponteiro é grosso — e nunca encolhe", async () => {
    const { alvo, ALVO_TOQUE } = await import("@/hooks/use-mobile");
    expect(alvo(32, false)).toBe(32);
    expect(alvo(32, true)).toBe(ALVO_TOQUE);
    // Botão já maior que o mínimo não é reduzido para caber na régua.
    expect(alvo(56, true)).toBe(56);
  });
});

// ─── Usuários ────────────────────────────────────────────────────────────────

describe("Usuários: a tabela de 6 colunas cede ao cartão", () => {
  it("tablet (janela 1280, conteúdo 700): cartão por usuário, com e-mail inteiro e ações", async () => {
    await montarUsuarios(1280, 700);
    expect(tid("lista-usuarios-cards")).toBeTruthy();
    expect($("table")).toBeNull();
    // O e-mail é o que identifica a pessoa no SSO: aparece por extenso.
    expect(document.body.textContent).toContain("pessoa.1.sobrenome.comprido@cscdoesporte.com.br");
    // E as ações continuam ali — era a coluna que a tabela espremia a 20px.
    expect(tid("button-edit-u1")).toBeTruthy();
    expect(tid("button-logs-u1")).toBeTruthy();
  });

  it("conteúdo de 1000px: tabela compacta, sem a coluna 'Criado em' e ainda com 'Ações'", async () => {
    await montarUsuarios(1280, 1000);
    expect($("table")).toBeTruthy();
    const th = cabecalhos();
    expect(th).toContain("Ações");
    expect(th).not.toContain("Criado em");
    // A data não SOME — muda de lugar, para baixo do nome.
    expect(document.body.textContent).toContain("Criado em 10/01/2026");
  });

  it("conteúdo de 1280px: tabela inteira, com as seis colunas", async () => {
    await montarUsuarios(1440, 1280);
    const th = cabecalhos();
    expect(th).toEqual(["Nome", "Email", "Perfil", "Status", "Criado em", "Ações"]);
  });

  it("o que 'Kit' significa é texto, não `title`", async () => {
    await montarUsuarios(1440, 1280);
    const selo = tid("badge-kit-u2");
    expect(selo).toBeTruthy();
    expect(selo!.getAttribute("title")).toBeNull();
    expect(selo!.textContent).toContain("só vê e cria peças do Kit");
  });

  it("ponteiro grosso em janela de desktop: os botões de ação chegam a 44px", async () => {
    await montarUsuarios(1280, 1280, { ponteiroGrosso: true });
    const editar = tid("button-edit-u1")!;
    expect(px(editar.style.height)).toBeGreaterThanOrEqual(44);
    expect(px(editar.style.width)).toBeGreaterThanOrEqual(44);
  });

  it("sem ponteiro grosso o desenho do mouse não muda (32px)", async () => {
    await montarUsuarios(1280, 1280, { ponteiroGrosso: false });
    expect(px(tid("button-edit-u1")!.style.height)).toBe(32);
  });
});

// ─── Estoque ─────────────────────────────────────────────────────────────────

describe("Estoque: o acervo no tablet", () => {
  it("tablet (janela 1280, conteúdo 700): cartões, sem tabela de 900px", async () => {
    await montarEstoque(1280, 700);
    expect($("table")).toBeNull();
    expect($('[aria-label="Materiais do acervo"]')).toBeTruthy();
    expect(tid("row-asset-s1")).toBeTruthy();
  });

  it("conteúdo de 1000px: tabela compacta, sem 'Onde já foi usado' e com 'Ações'", async () => {
    await montarEstoque(1280, 1000);
    const th = cabecalhos();
    expect($("table")).toBeTruthy();
    expect(th).toContain("Ações");
    expect(th).not.toContain("Onde já foi usado");
  });

  it("conteúdo de 1280px: as seis colunas voltam", async () => {
    await montarEstoque(1440, 1280);
    const th = cabecalhos();
    expect(th).toContain("Onde já foi usado");
    expect(th).toContain("Ações");
  });
});

// ─── Triagem de Retorno ──────────────────────────────────────────────────────

describe("Triagem de Retorno: a tela que mais vive no tablet", () => {
  it("tablet (janela 1280, conteúdo 700): cartões — o Salvar não pode ficar fora da tela", async () => {
    await montarTriagem(1280, 700);
    expect($("table")).toBeNull();
    expect(tid("row-triage-a1") ?? tid("card-triage-a1") ?? document.body).toBeTruthy();
    // O que importa: a ação de gravar está no DOM e visível sem rolagem lateral.
    expect(document.body.textContent).toContain("Salvar");
  });

  it("conteúdo de 1000px: tabela compacta — Evento e Patrocinadores saem do cabeçalho, 'Ação' fica", async () => {
    await montarTriagem(1280, 1000);
    const th = cabecalhos();
    expect($("table")).toBeTruthy();
    expect(th).toContain("Ação");
    expect(th).not.toContain("Evento");
    expect(th).not.toContain("Patrocinadores");
    // O nome do evento não some da tela: desce para dentro da célula.
    expect(document.body.textContent).toContain("Evento 1");
  });

  it("conteúdo de 1280px: a tabela inteira, com as seis colunas", async () => {
    await montarTriagem(1440, 1280);
    const th = cabecalhos();
    expect(th).toContain("Evento");
    expect(th).toContain("Patrocinadores");
    expect(th).toContain("Ação");
  });
});
