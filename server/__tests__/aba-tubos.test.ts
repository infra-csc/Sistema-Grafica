// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// A ABA "TUBOS" DA GRÁFICA (dono, 21/09: "devia ter uma aba de tubos para eles
// saberem quais tubos têm o quê e administrar" / "põe na mesma da Gráfica, uma
// abinha separada, não precisa ser uma página"). MONTADA a 1280 e a 390px.
//
// O que este arquivo pina:
//   · segmentos Abertos | Embaladas sozinhas | Entregues, com contagem, em tablist;
//   · abertos ordenados pela SAÍDA DO CAMINHÃO; resumo do que ainda vai sair;
//   · busca (código, descrição, nº do tubo, recebedor) e filtro por evento NA URL;
//   · o cartão: conteúdo com a quantidade NAQUELE tubo, "Ver tudo", fotos, ações —
//     que abrem os MESMOS modais da fila (o do tubo e o de entrega);
//   · estados: carregando, erro, vazio com a frase que ensina; "Mostrar mais";
//   · celular: 44px, 16px, sem largura fixa;
//   · na Gráfica: tablist Fila | Tubos com `?aba=tubos`, cada aba monta só o seu
//     painel; nada de rota nem item de menu; servidor sem N+1; Excel com os volumes.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const h = React.createElement;
vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));
vi.mock("@/components/ObjectUploader", () => ({ ObjectUploader: ({ children }: any) => h("button", { type: "button" }, children) }));

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));
const px = (v: string | null | undefined) => { const m = String(v ?? "").match(/^(-?\d+(?:\.\d+)?)px$/); return m ? Number(m[1]) : NaN; };

function prepararJsdom(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: largura < 768 && /max-width:\s*767px/.test(q), media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  window.history.replaceState(null, "", "/grafica?aba=tubos&status=conferred");
}

const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const peca = (id: string, displayId: string, quantidadeNoTubo: number, quantity = quantidadeNoTubo, description = "Nubank") => ({ id, displayId, type: "2x1", description, quantity, quantidadeNoTubo });
const tubo = (id: string, numero: number, evento: any, pecas: any[], extra: Record<string, unknown> = {}) => ({
  id, numero, avulso: false, evento, criadoEm: emDias(-1), fotosFechamento: ["/objects/f.jpg"], fechadoEm: emDias(-1), fechadoPor: "Operador",
  entregueEm: null, recebidoPor: null, entreguePor: null, fotoEntregaUrl: null, pecas, unidades: pecas.reduce((u, p) => u + p.quantidadeNoTubo, 0), podeAgir: true, ...extra,
});
const LONGE = { id: "e1", name: "Circuito Longe", truckDepartureDate: emDias(9) };
const PERTO = { id: "e2", name: "Maratona Perto", truckDepartureDate: emDias(1) };
const mundo = () => [
  tubo("t1", 1, LONGE, [peca("a", "#0001", 7, 10), peca("b", "#0002", 4), peca("c", "#0003", 1), peca("d", "#0004", 1), peca("e", "#0005", 2, 2, "Itaú")]),
  tubo("t2", 1, PERTO, [peca("f", "#0010", 5)]),
  tubo("av", -1, PERTO, [peca("g", "#0020", 1, 1, "Pórtico de largada")], { avulso: true }),
  tubo("t9", 2, LONGE, [peca("z", "#0099", 3)], { entregueEm: emDias(-2), recebidoPor: "Carlos da portaria", podeAgir: false }),
];

async function montar(largura: number, dados: any = mundo(), resposta?: () => Response) {
  prepararJsdom(largura);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (resposta) return resposta();
    const corpo = /detalhe=1/.test(String(url)) ? dados : { evento: { id: "e2", name: "Maratona Perto" }, tubos: [], semTubo: [] };
    return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
  }));
  const { queryClient } = await import("@/lib/queryClient");
  const { AbaTubos } = await import("@/components/grafica/aba-tubos");
  queryClient.clear();
  const onAbrirPeca = vi.fn();
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(AbaTubos as any, { onAbrirPeca }))); });
  for (let i = 0; i < 60 && !$('[data-testid^="cartao-tubo-"]') && !$('[data-testid="tubos-vazio"]') && !$('[role="alert"]'); i++) await tick(25);
  return { onAbrirPeca };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

for (const largura of [1280, 390]) {
  describe(`aba Tubos (${largura === 390 ? "390px" : "desktop"})`, () => {
    it("segmentos com contagem; ABERTOS pela saída do caminhão; o resumo fala do que ainda vai sair", async () => {
      await montar(largura);
      expect($$('[data-testid="tubos-segmentos"] [role="tab"]').map((t) => t.textContent)).toEqual(["Abertos (2)", "Embaladas sozinhas (1)", "Entregues (1)"]);
      expect($('[data-testid="tubos-seg-abertos"]')!.getAttribute("aria-selected")).toBe("true");
      // o caminhão que sai amanhã vem antes do que sai em 9 dias
      expect($$('[data-testid^="cartao-tubo-"]').map((c) => c.getAttribute("data-testid"))).toEqual(["cartao-tubo-t2", "cartao-tubo-t1"]);
      expect($('[data-testid="cartao-tubo-t2"]')!.textContent).toContain("(amanhã)");
      expect($('[data-testid="tubos-resumo"]')!.textContent).toContain("2 tubos abertos · 1 embalada sozinha · 21 un. · 1 evento sai em até 2 dias");
    }, 30_000);

    it("o cartão: quantidade NAQUELE tubo com '(7 de 10)', 'Ver tudo', fotos, etiqueta — e abre os modais da fila", async () => {
      const { onAbrirPeca } = await montar(largura);
      const c = $('[data-testid="cartao-tubo-t1"]')!;
      expect(c.textContent).toContain("Tubo 1");
      expect(c.textContent).toContain("5 peças · 15 un. · 1 foto");
      expect(c.textContent).toContain("2x1 Nubank - 7 (7 de 10)");
      expect(c.textContent).not.toContain("#0005");
      await act(async () => { fireEvent.click($('[data-testid="ver-tudo-t1"]')!); });
      expect(c.textContent).toContain("#0005");
      expect($('[data-testid="aba-etiqueta-t1"]')!.getAttribute("href")).toBe("/grafica/tubos/t1/etiqueta");
      // "Abrir" → o MESMO modal do tubo; "Entregar tubo" → o MESMO modal de entrega
      await act(async () => { fireEvent.click($('[data-testid="aba-abrir-t1"]')!); });
      await tick(30);
      expect($('[data-testid="modal-do-tubo"]')).toBeTruthy();
      expect(onAbrirPeca).not.toHaveBeenCalled();
      cleanup();
      await montar(largura);
      await act(async () => { fireEvent.click($('[data-testid="aba-entregar-t2"]')!); });
      await tick(30);
      expect($('[data-testid="modal-entregar-tubo"]')).toBeTruthy();
    }, 30_000);

    it("Embaladas sozinhas: nunca 'Tubo N' nem etiqueta de tubo; Entregues: a quem e quando, sem Entregar", async () => {
      await montar(largura);
      await act(async () => { fireEvent.click($('[data-testid="tubos-seg-sozinhas"]')!); });
      const s = $('[data-testid="cartao-tubo-av"]')!;
      expect(s.textContent).toContain("Embalagem de #0020");
      expect(s.textContent).not.toMatch(/Tubo -?\d/);
      expect($('[data-testid="aba-etiqueta-av"]')).toBeNull();
      expect($('[data-testid="aba-entregar-av"]')!.textContent).toBe(" Entregar");
      expect(new URLSearchParams(window.location.search).get("seg")).toBe("sozinhas");
      await act(async () => { fireEvent.click($('[data-testid="tubos-seg-entregues"]')!); });
      const e = $('[data-testid="cartao-tubo-t9"]')!;
      expect(e.textContent).toContain("entregue a Carlos da portaria em");
      expect($('[data-testid="aba-entregar-t9"]')).toBeNull();
      expect($('[data-testid="aba-abrir-t9"]')!.textContent).toContain("Ver o registro");
    }, 30_000);

    it("busca e filtro por evento moram na URL — e os parâmetros da FILA não se perdem", async () => {
      await montar(largura);
      await act(async () => { fireEvent.change($('[data-testid="tubos-busca"]')!, { target: { value: "itau" } }); });
      expect($$('[data-testid^="cartao-tubo-"]').map((c) => c.getAttribute("data-testid"))).toEqual(["cartao-tubo-t1"]);
      let q = new URLSearchParams(window.location.search);
      expect(q.get("tuboBusca")).toBe("itau");
      expect(q.get("status"), "filtro da fila intacto").toBe("conferred");
      expect(q.get("aba")).toBe("tubos");
      await act(async () => { fireEvent.change($('[data-testid="tubos-busca"]')!, { target: { value: "nada disso" } }); });
      expect($('[data-testid="tubos-vazio"]')!.textContent).toBe("Nada com esse filtro. Limpe a busca ou troque o evento.");
      await act(async () => { fireEvent.click($('[data-testid="tubos-limpar"]')!); });
      await act(async () => { fireEvent.change($('[data-testid="tubos-evento"]')!, { target: { value: "e2" } }); });
      expect($$('[data-testid^="cartao-tubo-"]').map((c) => c.getAttribute("data-testid"))).toEqual(["cartao-tubo-t2"]);
      expect(new URLSearchParams(window.location.search).get("tuboEvento")).toBe("e2");
      // entregues: acha pelo recebedor
      await act(async () => { fireEvent.click($('[data-testid="tubos-limpar"]')!); });
      await act(async () => { fireEvent.click($('[data-testid="tubos-seg-entregues"]')!); });
      await act(async () => { fireEvent.change($('[data-testid="tubos-busca"]')!, { target: { value: "portaria" } }); });
      expect($$('[data-testid^="cartao-tubo-"]').length).toBe(1);
    }, 30_000);

    it("setas trocam de segmento (roving tabindex)", async () => {
      await montar(largura);
      await act(async () => { fireEvent.keyDown($('[data-testid="tubos-segmentos"]')!, { key: "ArrowRight" }); });
      expect($('[data-testid="tubos-seg-sozinhas"]')!.getAttribute("aria-selected")).toBe("true");
      expect($('[data-testid="tubos-seg-abertos"]')!.getAttribute("tabindex")).toBe("-1");
      await act(async () => { fireEvent.keyDown($('[data-testid="tubos-segmentos"]')!, { key: "ArrowLeft" }); });
      expect($('[data-testid="tubos-seg-abertos"]')!.getAttribute("aria-selected")).toBe("true");
    }, 30_000);

    it("estados: vazio com a frase que ensina, erro com 'Tentar novamente', e 'Mostrar mais' em lotes de 30", async () => {
      await montar(largura, []);
      expect($('[data-testid="tubos-vazio"]')!.textContent).toBe("Nenhum tubo aberto. Embale peças conferidas na Gráfica.");
      cleanup();
      await montar(largura, [], () => new Response("{}", { status: 500 }));
      expect($('[role="alert"]')!.textContent).toContain("Não foi possível carregar os tubos.");
      cleanup();
      await montar(largura, Array.from({ length: 35 }, (_, i) => tubo(`m${i}`, i + 1, LONGE, [peca(`p${i}`, `#1${String(i).padStart(3, "0")}`, 1)])));
      expect($$('[data-testid^="cartao-tubo-"]').length).toBe(30);
      expect($('[data-testid="tubos-mostrar-mais"]')!.textContent).toBe("Mostrar mais (5 de 35)");
      await act(async () => { fireEvent.click($('[data-testid="tubos-mostrar-mais"]')!); });
      expect($$('[data-testid^="cartao-tubo-"]').length).toBe(35);
    }, 30_000);

    if (largura === 390) {
      it("celular: alvos de 44px, campos a 16px, uma coluna, nada com largura fixa maior que a tela", async () => {
        await montar(390);
        const raiz = $('[data-testid="aba-tubos"]')!;
        const ruins: string[] = [];
        for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("button, a[href], input, select"))) {
          const alt = Math.max(px(el.style.minHeight) || 0, px(el.style.height) || 0);
          if (alt < 44) ruins.push(`alvo ${el.getAttribute("data-testid") ?? el.textContent}`);
          if ((el.tagName === "INPUT" || el.tagName === "SELECT") && px(el.style.fontSize) < 16) ruins.push(`campo ${el.getAttribute("data-testid")}`);
        }
        for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) if (px(el.style.width) > 390 || px(el.style.minWidth) > 390) ruins.push(`largura ${el.tagName}`);
        expect(ruins).toEqual([]);
        expect(raiz.querySelector<HTMLElement>('div[style*="grid"]')!.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
        expect($('[data-testid="tubos-segmentos"]')!.style.overflowX).toBe("auto");
      }, 30_000);
    }
  });
}

describe("a busca e o prazo (puros)", () => {
  it("tuboCasa: todas as palavras, sem acento, em código/descrição/evento/nº do tubo/recebedor", async () => {
    const { tuboCasa, diasAteASaida } = await import("@/components/grafica/aba-tubos");
    const t: any = mundo()[0];
    expect(tuboCasa(t, "")).toBe(true);
    expect(tuboCasa(t, "tubo 1 longe")).toBe(true);
    expect(tuboCasa(t, "#0005 ITAU")).toBe(true);
    expect(tuboCasa(t, "tubo 2")).toBe(false);
    expect(tuboCasa(mundo()[3] as any, "carlos")).toBe(true);
    expect(tuboCasa(mundo()[2] as any, "sozinha portico")).toBe(true);
    expect(diasAteASaida(null)).toBeNull();
    expect(diasAteASaida("2026-09-23T00:00:00Z", new Date(2026, 8, 21))).toBe(2);
    expect(diasAteASaida("2026-09-20T00:00:00Z", new Date(2026, 8, 21))).toBe(-1);
  });
});

describe("na Gráfica e no servidor (fonte)", () => {
  const RAIZ = path.resolve(__dirname, "../..");
  const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");
  const GRAFICA = ler("client/src/pages/grafica.tsx");

  it("Fila | Tubos em tablist, com `?aba=tubos`; cada aba monta SÓ o próprio painel", () => {
    expect(GRAFICA).toContain('<div role="tablist" aria-label="Seções da Gráfica" data-testid="abas-grafica"');
    expect(GRAFICA).toContain('if (aba === "fila") u.searchParams.delete("aba"); else u.searchParams.set("aba", aba);');
    expect(GRAFICA).toContain('{abaDaTela === "tubos" && (\n        <AbaTubos');
    expect(GRAFICA).toContain('{abaDaTela === "fila" && (\n      <div id="painel-fila" role="tabpanel" aria-labelledby="aba-grafica-fila" style={{ display: "contents" }}>');
    expect(GRAFICA).toContain("tabIndex={ativa ? 0 : -1}");
    // celular: trilho com rolagem, alvos de 44 e folga entre eles
    expect(GRAFICA).toContain('gap: isMobile ? 8 : 0, overflowX: "auto"');
  });

  it("não é página nem item de menu", () => {
    expect(ler("client/src/App.tsx")).not.toContain('path="/grafica/tubos"');
    expect(ler("client/src/components/app-sidebar.tsx")).not.toContain("/grafica/tubos");
  });

  it("a consulta detalhada só existe na aba, e o servidor a atende sem N+1 (tubos, eventos, linhas, peças)", () => {
    expect(GRAFICA).not.toContain("detalhe=1");
    expect(ler("client/src/components/grafica/aba-tubos.tsx")).toContain('queryKey: ["/api/tubos", "?detalhe=1"]');
    const ROTAS = ler("server/routes/tubos.ts");
    const rota = ROTAS.slice(ROTAS.indexOf("if (req.query.detalhe) {"), ROTAS.indexOf("// `fechadoEm` vai junto: a fila da Gráfica"));
    expect(rota.match(/await db\.select/g)?.length).toBe(4);
    expect(rota).not.toMatch(/for \(const t of lista\)[\s\S]*await db/);
    expect(rota).toContain("const visivel = new Map(visiveis(req, cruas).map((p) => [p.id, p]));");
    expect(rota).toContain("podeAgir: !t.entregueEm && dentro.length > 0 && (total.get(t.id) ?? 0) === dentro.length && !soVe,");
  });

  it("o toque no selo abre o MODAL DO TUBO — o painel do evento continua no botão Tubos do cabeçalho", () => {
    expect(GRAFICA).toContain("verTubo: item.tuboId });");
    expect(GRAFICA).toContain("verTubo={tubosDoEvento?.verTubo}");
    expect(GRAFICA).toContain("data-testid={`button-tubos-${item.eventId}`}");
  });

  it("Excel de peças: a peça dividida diz todos os tubos com a quantidade ('Tubo 1 (7) · Tubo 2 (3)')", () => {
    const X = ler("server/services/xlsxExport.ts");
    expect(X).toContain("if (volumes.length > 1 || (volumes.length === 1 && Number(volumes[0].quantidade) < Number(item.quantity))) return seloDosVolumes(volumes);");
  });
});
