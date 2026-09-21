// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DA GRÁFICA COM A BARRA LATERAL ABERTA — relato do dono (17/09):
// "cortando quando o menu está aberto, cortando o status".
//
// O QUE ACONTECIA: num monitor de 1.710px com a sidebar aberta sobram ~1.380px.
// Os limites fixos (≤ 820 cartões, 820–1180 compacta) diziam "cabe a tabela
// cheia" — mas a largura mínima dela depende do CONTEÚDO. A coluna Peça tinha
// `maxWidth: 320` na <td>, que o Chrome ignora em tabela automática, e a
// descrição em `nowrap` media a frase inteira. A tabela passava da caixa, a
// coluna de Ações (sticky à direita) cobria o Status ("PR", "há 1") e o botão
// principal saía pela borda.
//
// O QUE ESTE ARQUIVO PRENDE (jsdom não faz layout, então o estouro é SIMULADO
// na caixa de rolagem — `scrollWidth` > `clientWidth` — e o resto é a reação da
// tela a ele):
//   1. tabela cheia que estoura desce para a compacta; compacta que estoura
//      desce para cartões; tabela que cabe continua cheia;
//   2. na compacta, as ações SECUNDÁRIAS moram no menu "⋯" e a PRINCIPAL fica
//      à vista; o menu abre, mostra rótulos e fecha com Esc;
//   3. o teto da coluna Peça mora numa div (onde vale), o Status não quebra e
//      o cabeçalho do evento quebra linha em vez de sair da tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Admin", email: "a@a", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

const DIA = 86400000;
const agora = Date.now();
const iso = (d: number) => new Date(agora + d * DIA).toISOString();
const EVENTO = { id: "ev1", name: "Maratona Internacional de São Paulo 2026 — Largada e Arena", status: "active", startDate: iso(8).slice(0, 10), truckDepartureDate: iso(4), deadlineProducaoGrafica: -12 };

const PECAS = [
  // Liberada: Produzir (principal) + Reaproveitar + Devolver (secundárias).
  { id: "a1", displayId: "#4066", type: "Placa km", status: "approved", quantity: 6, quantityProduced: 0 },
  // Produzida com reaproveitamento parcial: Conferir (principal) + Ajustar/Corrigir reaprov. (secundárias).
  { id: "a2", displayId: "#4067", type: "Placa km", status: "produced", quantity: 6, quantityProduced: 2, reuseQty: 4 },
  // Conferida: Entregar (principal), sem secundária.
  { id: "a3", displayId: "#4068", type: "Placa km", status: "conferred", quantity: 6, quantityProduced: 6, conferredQty: 6 },
].map((p) => ({
  ...p, eventId: EVENTO.id, event: EVENTO,
  description: "PLACA KM 5K — lona 440g com ilhós nos quatro cantos e logo do patrocinador master aplicado em toda a extensão",
  material: "SANETT", finish: "ILHÓS", calculatedM2: "3.42", fileWidth: "300", fileHeight: "114", visualWidth: "3", visualHeight: "1.14",
  approvalThumbUrl: `/objects/${p.id}.png`, isReuse: false, observations: "", statusChangedAt: iso(-1),
}));

/** Como a caixa de rolagem da tabela responde, por densidade desenhada. */
let estoura: { cheia: boolean; compacta: boolean } = { cheia: false, compacta: false };

beforeAll(() => {
  Object.defineProperty(window, "innerWidth", { value: 1710, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
  (Element.prototype as any).scrollIntoView = () => {};
  // A raiz da Gráfica mede 1.380px (1.710 − sidebar aberta).
  // SÓ a raiz (a caixa que contém o título e rola): medir tudo com 1.380 fazia
  // outros componentes que se medem entrarem em laço.
  const medirOriginal = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const ehRaiz = (this as HTMLElement).style?.overflowY === "auto" && !!this.querySelector?.('[data-testid="title-grafica"]');
    return ehRaiz
      ? ({ width: 1380, height: 900, top: 0, left: 0, right: 1380, bottom: 900, x: 0, y: 0, toJSON() {} } as DOMRect)
      : medirOriginal.call(this);
  };
  const cheia = (el: Element) => Array.from(el.querySelectorAll("th")).some((th) => th.textContent === "m² a produzir");
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.getAttribute?.("data-testid") === "tabela-rolagem" ? 1332 : 0; } });
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get() {
      if (this.getAttribute?.("data-testid") !== "tabela-rolagem") return 0;
      return (cheia(this) ? estoura.cheia : estoura.compacta) ? 1520 : 1300;
    },
  });
  vi.stubGlobal("fetch", async (url: any) => new Response(JSON.stringify(String(url).startsWith("/api/items/approved") ? PECAS : []), { status: 200, headers: { "content-type": "application/json" } }));
});

afterEach(() => cleanup());

async function montar() {
  const { queryClient } = await import("@/lib/queryClient");
  const Grafica = (await import("@/pages/grafica")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/items/approved"], PECAS);
  queryClient.setQueryData(["/api/standard-items"], []);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Grafica as any, null))); });
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); });
}
const $ = (s: string) => document.querySelector<HTMLElement>(s);
const cabecalhos = () => Array.from(document.querySelectorAll("th")).map((th) => th.textContent);

describe("tabela da Gráfica com a barra lateral aberta (1.380px úteis)", () => {
  it("quando a tabela CABE, continua cheia — sem menu ⋯", async () => {
    estoura = { cheia: false, compacta: false };
    await montar();
    expect(cabecalhos()).toContain("m² a produzir");
    expect(document.querySelectorAll('[data-testid^="button-mais-acoes-"]').length).toBe(0);
    // TABELA CHEIA — a CONFERIDA (a3) só tem Embalar (21/09: "não pode entregar antes de embalar").
    const linhaA3 = $('[data-testid="row-item-a3"]')!;
    expect(linhaA3.querySelector('[data-testid="button-embalar-a3"]')).toBeTruthy();
    expect(linhaA3.querySelector('[data-testid="button-deliver-a3"]')).toBeNull();
    expect(Array.from(linhaA3.querySelectorAll("button")).map((b) => b.textContent?.trim()).filter((t) => /Entregar/.test(t ?? ""))).toEqual([]);
    // Teto da coluna Peça numa DIV (a <td> ignora max-width) e Status sem quebra.
    expect($('[data-testid="celula-peca-a1"]')!.style.maxWidth).toBe("320px");
    expect($('[data-testid="celula-peca-a1"]')!.closest("td")!.style.maxWidth).toBe("");
    const pilula = $('[data-testid="row-item-a1"]')!.querySelectorAll("td")[6];
    expect(pilula.style.whiteSpace).toBe("nowrap");
  }, 30_000);

  it("tabela cheia que ESTOURA desce para a compacta; as secundárias vão para o ⋯ e a principal fica à vista", async () => {
    estoura = { cheia: true, compacta: false };
    await montar();
    expect(cabecalhos(), "desceu para a compacta").not.toContain("m² a produzir");

    // Principais à vista, fora de qualquer menu. A da CONFERIDA (a3) é
    // Embalar (dono, 21/09); Entregar virou secundária dela.
    for (const t of ["button-production-a1", "button-confer-a2", "button-embalar-a3"]) {
      const b = $(`[data-testid="${t}"]`);
      expect(b, t).toBeTruthy();
      expect(b!.closest('[data-testid^="menu-acoes-"]'), `${t} não pode morar no menu`).toBeNull();
    }
    // Secundárias no menu fechado.
    const menu = $('[data-testid="menu-acoes-a1"]')!;
    expect(menu.style.display).toBe("none");
    expect(menu.querySelector('[data-testid="button-reuse-a1"]')).toBeTruthy();
    expect(menu.querySelector('[data-testid="button-devolver-revisao-a1"]')).toBeTruthy();
    expect($('[data-testid="menu-acoes-a2"]')!.querySelector('[data-testid="button-correct-reuse-a2"]')).toBeTruthy();
    // A conferida só tem Embalar (21/09: "não pode entregar antes de embalar"):
    // sem secundária nenhuma, o ⋯ nem aparece — e não há Entregar em lugar nenhum.
    expect($('[data-testid="button-mais-acoes-a3"]')).toBeNull();
    expect($('[data-testid="button-deliver-a3"]')).toBeNull();
    expect($('[data-testid="menu-acoes-a3"]')?.textContent ?? "").not.toContain("Entregar");

    // Abre: o menu aparece com RÓTULOS (o ícone solto não diz nada numa lista).
    await act(async () => { $('[data-testid="button-mais-acoes-a1"]')!.click(); });
    expect($('[data-testid="menu-acoes-a1"]') === menu, "mesmo nó").toBe(true);
    expect($('[data-testid="button-mais-acoes-a1"]')!.getAttribute("aria-expanded"), "aria-expanded").toBe("true");
    expect(menu.style.display).toBe("flex");
    expect($('[data-testid="button-mais-acoes-a1"]')!.getAttribute("aria-expanded")).toBe("true");
    expect(menu.textContent).toContain("Reaproveitar");
    expect(menu.textContent).toContain("Devolver para a Revisão");
    // A célula sobe acima da linha de baixo enquanto o menu está aberto.
    expect(menu.closest("td")!.style.zIndex).toBe("3");

    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(menu.style.display).toBe("none");

    // Cabeçalho do evento quebra linha em vez de sair da tela.
    const nomeEvento = Array.from(document.querySelectorAll("td span")).find((s) => s.textContent === EVENTO.name)!;
    expect((nomeEvento.parentElement!.parentElement as HTMLElement).style.flexWrap).toBe("wrap");
    expect($('[data-testid="celula-peca-a1"]')!.style.maxWidth).toBe("260px");
  });

  it("compacta que ainda estoura desce para os cartões — nada fica fora da vista", async () => {
    estoura = { cheia: true, compacta: true };
    await montar();
    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelectorAll("[data-item-row]").length).toBe(3);
  });
});
