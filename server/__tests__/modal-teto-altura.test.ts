// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O TETO DE ALTURA DOS MODAIS — e a corrente de flex que o entrega ao corpo.
//
// O DEFEITO QUE ORIGINOU ESTE ARQUIVO: o cadastro de patrocinador tinha
// `maxWidth`, `borderRadius` e `overflow: hidden`, e o corpo tinha
// `overflowY: auto; flex: 1` — mas o DialogContent não tinha teto de altura
// nem coluna flex. `flex` só reparte altura quando existe altura limitada
// para repartir: sem teto, o modal crescia com o formulário (medi 1047px em
// 1280 de largura e 1215px em 375), e como o Radix centra o conteúdo com
// `top: 50%` + `translateY(-50%)`, o excedente saía METADE em cima e METADE
// embaixo. Numa janela de 445px de altura sumiam o cabeçalho e a seção 01 por
// cima e "Observações" por baixo, ao mesmo tempo, e a rolagem interna nunca
// era acionada.
//
// A REGRA DA CASA (modal-shell.tsx e o modal da Gestão de Prazos): o corpo é o
// ÚNICO scrollport; cabeçalho e rodapé não rolam e não encolhem; o teto é
// `calc(100vh - 48px)` no DialogContent, com coluna flex e `minHeight: 0` no
// caminho até o corpo.
//
// POR QUE OS 48: é a viewport inteira menos 24px de respiro em cima e 24
// embaixo. O desconto é simétrico porque o modal é centrado. NÃO se desconta
// cabeçalho e rodapé por número fixo — eles são itens flex que não rolam, o
// navegador os mede sozinho, e o corpo fica com o que sobrar. Um número fixo
// não serve para todas as telas: em 375 de largura o título quebra em duas
// linhas e o cabeçalho engorda.
//
// O QUE ESTE ARQUIVO MEDE: jsdom não faz layout, então aqui não se mede pixel.
// Mede-se a ESTRUTURA que produz o pixel certo — teto, coluna e a corrente de
// `minHeight: 0` do DialogContent até o scrollport. É exatamente a corrente
// que alguém quebra sem perceber ao inserir uma div a mais no meio: basta um
// elo sem `minHeight: 0` para o corpo voltar a se recusar a encolher e
// empurrar o rodapé para fora da tela.
//
// A conferência em pixel foi feita em navegador de verdade, em 1280×1080,
// 1280×745, 1280×445, 375×667 e 375×445.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

const PATROCINADOR = {
  id: "s1", name: "Patro 1", email: "p1@ex.com", phone: "", company: "Empresa 1",
  contactPerson: "Fulano", notes: "", color: "#f97316", accountExecutiveId: "",
};

const USUARIO = {
  id: "u2", name: "Beltrano", email: "b@ex.com", role: "solicitacao",
  createdAt: "2026-01-15T12:00:00.000Z",
};

const MODELO = {
  id: "m1", name: "Backdrop Premium", type: "Backdrop", group: "Estrutura",
  area: "6", visual: "3x2", visualWidth: "3", visualHeight: "2",
  fileWidth: "300", fileHeight: "200", material: "Lona", finish: "Ilhós",
  hasVariableMeasurement: false,
};

beforeAll(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class {
    observe() {} unobserve() {} disconnect() {}
  });
  (Element.prototype as any).scrollIntoView = () => {};

  vi.stubGlobal("fetch", async (url: any, init?: any) => {
    const u = String(url);
    const method = (init?.method || "GET").toUpperCase();
    const json = (b: any) =>
      new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u === "/api/auth/me") return json({ id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false });
    if (u === "/api/sponsors" && method === "GET") return json([PATROCINADOR]);
    if (u === "/api/sponsors/usage") return json({ s1: { events: 1, items: 2 } });
    if (u === "/api/users/basic") return json([{ id: "u1", name: "Admin", role: "admin" }]);
    if (u === "/api/users" && method === "GET") return json([USUARIO]);
    if (u === "/api/standard-items" && method === "GET") return json([MODELO]);
    if (u === "/api/catalog-options") return json([]);
    return json([]);
  });
});

beforeEach(() => cleanup());

async function tick(ms = 60) {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
}

const dialog = () => document.querySelector('[role="dialog"]') as HTMLElement | null;

/** Monta a página e clica no gatilho que abre o modal. */
async function abrir(importarPagina: () => Promise<any>, gatilho: string) {
  const { queryClient } = await import("@/lib/queryClient");
  const { TooltipProvider } = await import("@/components/ui/tooltip");
  const Pagina = (await importarPagina()).default;

  queryClient.clear();
  render(
    h(QueryClientProvider, { client: queryClient } as any,
      h(TooltipProvider, null, h(Pagina as any, null))),
  );
  await tick(150);

  await act(async () => {
    (document.querySelector(gatilho) as HTMLElement)?.click();
  });
  await tick(150);

  const d = dialog();
  expect(d, `o modal de ${gatilho} não abriu`).toBeTruthy();
  return d!;
}

const rola = (el: HTMLElement) => ["auto", "scroll"].includes(el.style.overflowY);
const podeEncolher = (el: HTMLElement) => el.style.minHeight === "0" || el.style.minHeight === "0px";
const colunaFlex = (el: HTMLElement) => el.style.display === "flex" && el.style.flexDirection === "column";

/**
 * A asserção inteira da regra da casa, num lugar só.
 *
 * 1. o DialogContent tem teto de altura;
 * 2. o DialogContent é coluna flex;
 * 3. existe EXATAMENTE UM scrollport dentro dele (dois scrollports aninhados
 *    é o defeito clássico de "a barra de rolagem some quando eu rolo");
 * 4. todo elo entre o DialogContent e esse scrollport é coluna flex e pode
 *    encolher (`minHeight: 0`). Um elo sem isso devolve ao corpo o tamanho
 *    mínimo automático do conteúdo — e o teto para de chegar até ele.
 *
 * O scrollport em si não precisa de `minHeight: 0` declarado: `overflow-y`
 * diferente de `visible` já zera o tamanho mínimo automático pela própria
 * especificação do flexbox. Declarar continua sendo o costume da casa.
 */
function exigirCascaComTeto(d: HTMLElement) {
  expect(d.style.maxHeight, "DialogContent sem teto de altura").not.toBe("");
  expect(colunaFlex(d), "DialogContent não é coluna flex").toBe(true);

  const scrollports = Array.from(d.querySelectorAll<HTMLElement>("*")).filter(rola);
  expect(scrollports.length, "o modal deve ter um único scrollport").toBe(1);

  const corpo = scrollports[0];
  for (let el = corpo.parentElement; el && el !== d; el = el.parentElement) {
    expect(podeEncolher(el), `elo sem minHeight: 0 entre o DialogContent e o corpo (${el.tagName})`).toBe(true);
    expect(colunaFlex(el), `elo que não é coluna flex entre o DialogContent e o corpo (${el.tagName})`).toBe(true);
  }
  return corpo;
}

const TETO_DA_CASA = "calc(100vh - 48px)";

describe("teto de altura dos modais", () => {
  it("cadastro de patrocinador: teto da casa, coluna flex e um único corpo rolável", async () => {
    const d = await abrir(() => import("@/pages/patrocinadores"), '[data-testid="button-add-sponsor"]');
    expect(d.style.maxHeight).toBe(TETO_DA_CASA);
    const corpo = exigirCascaComTeto(d);

    // O corpo é o do formulário — e o rodapé com Cancelar/Salvar está FORA
    // dele, que é o que mantém o botão à vista numa janela de 445px.
    expect(corpo.querySelector("#sponsor-form")).toBeTruthy();
    const salvar = d.querySelector('[data-testid="button-submit"]') as HTMLElement;
    expect(salvar, "o botão de salvar sumiu do modal").toBeTruthy();
    expect(corpo.contains(salvar), "o botão de salvar não pode rolar com o formulário").toBe(false);
  }, 40000);

  it("confirmação de exclusão de patrocinador: teto da casa com a tarja e os botões fixos", async () => {
    const d = await abrir(() => import("@/pages/patrocinadores"), '[data-testid="button-delete-s1"]');
    expect(d.style.maxHeight).toBe(TETO_DA_CASA);
    const corpo = exigirCascaComTeto(d);

    // Só o texto rola. A tarja "Ação Irreversível" e os dois botões ficam
    // parados — o conteúdo é curto e nunca cortou, mas o nome do patrocinador
    // é a parte elástica e é ela que o teto segura.
    const excluir = d.querySelector('[data-testid="button-confirm-delete"]') as HTMLElement;
    expect(excluir).toBeTruthy();
    expect(corpo.contains(excluir)).toBe(false);
  }, 40000);

  it("cadastro de usuário: teto da casa e corrente de flex até o formulário", async () => {
    const d = await abrir(() => import("@/pages/usuarios"), '[data-testid="button-new-user"]');
    expect(d.style.maxHeight).toBe(TETO_DA_CASA);
    const corpo = exigirCascaComTeto(d);

    // Aqui o próprio <form> é o scrollport (os botões precisam do submit e
    // moram dentro dele); o cabeçalho é que fica fixo.
    expect(corpo.tagName).toBe("FORM");
    expect(corpo.querySelector('[data-testid="button-save-user"]')).toBeTruthy();
  }, 40000);

  it("cadastro de modelo: já seguia a regra e continua seguindo", async () => {
    // Referência de que a asserção não é específica de uma tela: este modal
    // nunca cortou porque sempre teve teto (90vh) e coluna flex.
    const d = await abrir(() => import("@/pages/modelos"), '[data-testid="button-edit-model-m1"]');
    expect(d.style.maxHeight).not.toBe("");
    exigirCascaComTeto(d);
  }, 40000);
});
