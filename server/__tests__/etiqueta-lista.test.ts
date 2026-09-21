// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// ETIQUETA EM LISTA (21/09) — o galpão parar de fazer etiqueta no Corel.
//
// Em setembro saíram 1.669 peças com a etiqueta deles e 25 com a do app. A
// deles é por tubo, em lista, adesivo pequeno em pé; às vezes com quantidade,
// às vezes sem; e uma segunda etiqueta "REAPROVEITAR" no tubo de reuso. Este
// arquivo prende: a regra da linha (num lugar só), a paginação, os tipos em
// lista, os tamanhos (@page), o REAPROVEITAR e as cópias — na regra pura E na
// tela montada.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { readFileSync } from "fs";
import path from "path";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  TAMANHOS, cabeNoAdesivo, cabecalhoPadrao, prefixoPara, resumoDaImpressao, comCopias, ehDoisPorUm, fonteDaCidadeMm, lerPreferencias, gravarPreferencias, limitarCopias, linhaDaLista,
  linhasAgrupadas, paginarLinhas, regraDaPagina, subtituloDoTipo, temReaproveitamento,
} from "../../client/src/lib/etiqueta-lista";

const h = React.createElement;
const ler = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", name: "Operador", email: "g@g", role: "admin", mustChangePassword: false }, isLoading: false, logout: () => {} }),
}));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { window.localStorage.clear(); } catch { /* sem storage */ } });

// ═════════════════════════════════════════════════════════════════════════════
// 1 · A REGRA DA LINHA — um lugar só
// ═════════════════════════════════════════════════════════════════════════════
describe("a linha da lista", () => {
  it("com quantidade: 'tipo descrição - quantidade'", () => {
    expect(linhaDaLista({ type: "2x1", description: "Ministério", quantity: 16 })).toBe("2x1 Ministério - 16");
    expect(linhaDaLista({ type: "Pórtico", description: "", quantity: 1 })).toBe("Pórtico - 1");
    expect(linhaDaLista({ type: "Rolo", description: "Santander", quantity: null })).toBe("Rolo Santander - 1");
  });

  it("sem quantidade: só o nome — 'Testeira Médica'", () => {
    expect(linhaDaLista({ type: "Testeira", description: "Testeira Médica", quantity: 2 }, { mostrarQuantidade: false })).toBe("Testeira Médica");
    expect(linhaDaLista({ type: "2x1", description: "BB", quantity: 6 }, { mostrarQuantidade: false })).toBe("2x1 BB");
  });

  it("não repete o tipo quando a descrição já começa por ele (sem olhar a caixa)", () => {
    expect(linhaDaLista({ type: "2x1", description: "2x1 Logo Santander", quantity: 3 })).toBe("2x1 Logo Santander - 3");
    expect(linhaDaLista({ type: "2X1", description: "2x1 bb", quantity: 6 })).toBe("2x1 bb - 6");
  });

  it("NÃO abrevia: a descrição cadastrada sai inteira", () => {
    const desc = "Ministério da Saúde e Governo Federal";
    expect(linhaDaLista({ type: "2x1", description: desc, quantity: 4 })).toBe(`2x1 ${desc} - 4`);
  });

  it("vive num lugar só: as duas telas importam a regra, nenhuma tem cópia", () => {
    for (const arq of ["client/src/pages/etiqueta-tubo.tsx", "client/src/pages/etiquetas-evento.tsx"]) {
      const src = ler(arq);
      expect(src, arq).toContain('from "@/lib/etiqueta-lista"');
      expect(src, arq).not.toContain("desc.toLowerCase().startsWith(tipo.toLowerCase())");
      expect(src, arq).not.toMatch(/const ehDoisPorUm\s*=/);
    }
  });

  it("2x1: aceita as grafias das planilhas e não confunde 2x10", () => {
    for (const t of ["2x1", "2X1", "2×1", "2 x 1", "2x1 MBRF"]) expect(ehDoisPorUm({ type: t }), t).toBe(true);
    for (const t of ["2x10", "Rolo", "12x1", "Stand", ""]) expect(ehDoisPorUm({ type: t }), t).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · PAGINAÇÃO, TIPOS, TAMANHOS, CÓPIAS, REAPROVEITAR — a regra pura
// ═════════════════════════════════════════════════════════════════════════════
const pecas = (n: number, type = "2x1") => Array.from({ length: n }, (_, k) => ({ id: `${type}-${k}`, type, description: `P${k}`, quantity: 1 }));
const comoLinhas = <T,>(ps: T[]) => ps.map((peca) => ({ tipo: "peca" as const, peca }));

describe("paginação da lista", () => {
  it("quebra pela capacidade e não perde nem repete peça", () => {
    const paginas = paginarLinhas(comoLinhas(pecas(30)), { capacidade: 13, letrasPorLinha: 34 });
    expect(paginas.map((p) => p.length)).toEqual([13, 13, 4]);
    expect(paginas.flat().map((l: any) => l.peca.id)).toEqual(pecas(30).map((p) => p.id));
  });

  it("lista que cabe sai numa etiqueta só; lista vazia não gera página", () => {
    expect(paginarLinhas(comoLinhas(pecas(13)), { capacidade: 13, letrasPorLinha: 34 })).toHaveLength(1);
    expect(paginarLinhas([], { capacidade: 13, letrasPorLinha: 34 })).toEqual([]);
  });

  it("linha longa pesa pelas linhas que ocupa no papel — e 'sem quantidade' encurta", () => {
    const longa = { id: "l", type: "2x1", description: "x".repeat(40), quantity: 1 }; // "2x1 xxxx… - 1" = 48 letras → 2 linhas
    const paginas = paginarLinhas(comoLinhas([longa, longa, longa]), { capacidade: 4, letrasPorLinha: 34 });
    expect(paginas.map((p) => p.length)).toEqual([2, 1]);
  });

  it("subtítulo nunca fica órfão no pé da etiqueta", () => {
    const linhas = linhasAgrupadas([...pecas(3, "2x1"), ...pecas(2, "Rolo")]);
    // capacidade 5: [2x1(sub), 3 peças] = 4; o subtítulo ROLOS caberia sozinho — desce com a 1ª peça.
    const paginas = paginarLinhas(linhas, { capacidade: 5, letrasPorLinha: 34 });
    expect(paginas[0].at(-1)!.tipo).toBe("peca");
    expect(paginas[1][0]).toEqual({ tipo: "subtitulo", texto: "ROLOS" });
  });

  it("peça maior que a etiqueta inteira não trava a paginação", () => {
    const enorme = { id: "e", type: "2x1", description: "y".repeat(500), quantity: 1 };
    const paginas = paginarLinhas(comoLinhas([enorme, ...pecas(2)]), { capacidade: 3, letrasPorLinha: 34 });
    expect(paginas.flat()).toHaveLength(3);
  });
});

describe("tipos em lista: agrupados, com subtítulo", () => {
  it("2x1 primeiro, o resto em ordem alfabética, subtítulo por grupo", () => {
    const linhas = linhasAgrupadas([...pecas(1, "Testeira"), ...pecas(2, "2x1"), ...pecas(1, "Rolo")]);
    expect(linhas.filter((l) => l.tipo === "subtitulo").map((l: any) => l.texto)).toEqual(["2X1", "ROLOS", "TESTEIRAS"]);
    expect(linhas).toHaveLength(7);
  });

  it("um grupo só não gasta linha com subtítulo (a linha já começa por '2x1')", () => {
    expect(linhasAgrupadas(pecas(3)).every((l) => l.tipo === "peca")).toBe(true);
  });

  it("só pluraliza o caso seguro", () => {
    expect(subtituloDoTipo("Testeira")).toBe("TESTEIRAS");
    expect(subtituloDoTipo("Mandala")).toBe("MANDALAS");
    expect(subtituloDoTipo("Stand")).toBe("STAND");
    expect(subtituloDoTipo("Testeira Médica")).toBe("TESTEIRA MÉDICA");
    expect(subtituloDoTipo("")).toBe("OUTROS");
  });
});

describe("tamanhos", () => {
  it("@page de cada um: adesivo 100×150 em pé (margem pequena), A5 e A4", () => {
    expect(regraDaPagina("adesivo")).toBe("@page { size: 100mm 150mm; margin: 3mm; }");
    expect(regraDaPagina("meia-a4")).toBe("@page { size: A5 portrait; margin: 8mm; }");
    expect(regraDaPagina("a4")).toBe("@page { size: A4 portrait; margin: 10mm; }");
    expect(regraDaPagina("adesivo", "etqlista")).toBe("@page etqlista { size: 100mm 150mm; margin: 3mm; }");
  });

  it("a caixa cabe na área útil do papel, com folga", () => {
    const papel = { adesivo: [100, 150], "meia-a4": [148, 210], a4: [210, 297] } as const;
    for (const [t, m] of Object.entries(TAMANHOS)) {
      const [w, hh] = papel[t as keyof typeof papel];
      expect(m.larguraMm, t).toBeLessThanOrEqual(w - 2 * m.margemMm);
      expect(m.alturaMm, t).toBeLessThan(hh - 2 * m.margemMm);
      expect(m.linhasSemTubo, t).toBeGreaterThan(m.linhasComTubo);
    }
  });

  it("a cidade encolhe para caber — palavra longa não estoura o adesivo", () => {
    expect(fonteDaCidadeMm("adesivo", "ITABIRA")).toBeLessThanOrEqual(TAMANHOS.adesivo.cidadeMaxMm);
    const longa = fonteDaCidadeMm("adesivo", "PINDAMONHANGABA");
    expect(longa * 15 * 0.68).toBeLessThanOrEqual(TAMANHOS.adesivo.larguraMm + 0.5);
    // Duas palavras: manda a MAIOR (o navegador quebra entre elas).
    expect(fonteDaCidadeMm("adesivo", "SÃO PAULO")).toBe(fonteDaCidadeMm("adesivo", "PAULO"));
    expect(fonteDaCidadeMm("a4", "ITABIRA")).toBeGreaterThan(fonteDaCidadeMm("adesivo", "ITABIRA"));
  });
});

describe("cópias e REAPROVEITAR (regra)", () => {
  it("cópias ficam entre 1 e 4 e repetem o jogo inteiro", () => {
    expect([0, 1, 4, 9, "3", "x", null].map(limitarCopias)).toEqual([1, 1, 4, 4, 3, 1, 1]);
    expect(comCopias(["a", "b"], 2)).toEqual(["a", "b", "a", "b"]);
  });

  it("reuso vem de isReuse OU reuseQty > 0; sem os campos, false", () => {
    expect(temReaproveitamento([{ isReuse: true }])).toBe(true);
    expect(temReaproveitamento([{ reuseQty: 2 }, {}])).toBe(true);
    expect(temReaproveitamento([{ isReuse: false, reuseQty: 0 }, {}])).toBe(false);
  });

  it("preferências: lembra, e storage quebrado ou lixo cai no padrão", () => {
    gravarPreferencias({ mostrarQuantidade: false, tamanho: "a4", copias: 3 });
    expect(lerPreferencias()).toEqual({ mostrarQuantidade: false, tamanho: "a4", copias: 3 });
    window.localStorage.setItem("grafica:etiqueta-lista:v1", '{"tamanho":"toString","copias":99,"mostrarQuantidade":"sim"}');
    expect(lerPreferencias()).toEqual({ mostrarQuantidade: true, tamanho: "adesivo", copias: 4 });
    window.localStorage.setItem("grafica:etiqueta-lista:v1", "{quebrado");
    expect(lerPreferencias().tamanho).toBe("adesivo");
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(lerPreferencias().copias).toBe(1);
    expect(() => gravarPreferencias({ mostrarQuantidade: true, tamanho: "a4", copias: 1 })).not.toThrow();
    get.mockRestore(); set.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · CABEÇALHO, RESUMO E SUGESTÃO DE ADESIVO (22/09) — regra pura
// ═════════════════════════════════════════════════════════════════════════════
describe("a palavra gigante inteligente", () => {
  it("'teste 3' não vira um '3' gigante: última palavra numérica → o nome inteiro", () => {
    expect(cabecalhoPadrao("teste 3")).toEqual({ prefixo: "", gigante: "teste 3" });
    expect(cabecalhoPadrao("Etapa 2")).toEqual({ prefixo: "", gigante: "Etapa 2" });
    expect(cabecalhoPadrao("Circuito Vale 2026")).toEqual({ prefixo: "", gigante: "Circuito Vale 2026" });
  });

  it("última palavra de 1–2 letras também não serve de destaque", () => {
    expect(cabecalhoPadrao("Corrida da Fe")).toEqual({ prefixo: "", gigante: "Corrida da Fe" });
    expect(cabecalhoPadrao("Desafio X")).toEqual({ prefixo: "", gigante: "Desafio X" });
  });

  it("o caso do modelo continua: a cidade é a última palavra", () => {
    expect(cabecalhoPadrao("Circuito Corrida Vale 2026 Itabira")).toEqual({ prefixo: "Circuito Corrida Vale 2026", gigante: "Itabira" });
  });

  it("cidade composta conhecida casa pelo FIM do nome, sem olhar caixa nem acento", () => {
    expect(cabecalhoPadrao("Maratona do Rio de Janeiro")).toEqual({ prefixo: "Maratona do", gigante: "Rio de Janeiro" });
    expect(cabecalhoPadrao("Circuito Vale 2026 sao paulo")).toEqual({ prefixo: "Circuito Vale 2026", gigante: "sao paulo" });
    expect(cabecalhoPadrao("Night Run Belo Horizonte")).toEqual({ prefixo: "Night Run", gigante: "Belo Horizonte" });
    expect(cabecalhoPadrao("Porto Alegre")).toEqual({ prefixo: "", gigante: "Porto Alegre" });
    // "Paulo" sozinho no meio não é cidade: só casa no fim
    expect(cabecalhoPadrao("São Paulo Run Itabira").gigante).toBe("Itabira");
  });

  it("nome vazio, de uma palavra e com espaços sobrando", () => {
    expect(cabecalhoPadrao("")).toEqual({ prefixo: "", gigante: "" });
    expect(cabecalhoPadrao(null)).toEqual({ prefixo: "", gigante: "" });
    expect(cabecalhoPadrao("Itabira")).toEqual({ prefixo: "", gigante: "Itabira" });
    expect(cabecalhoPadrao("  Circuito   Vale   Itabira ")).toEqual({ prefixo: "Circuito Vale", gigante: "Itabira" });
  });

  it("gigante editada: o texto de cima é o nome sem ela; se não está no nome, o nome inteiro", () => {
    expect(prefixoPara("Circuito Vale Ouro Branco", "ouro branco")).toBe("Circuito Vale");
    expect(prefixoPara("Circuito Vale Itabira", "Mariana")).toBe("Circuito Vale Itabira");
    expect(prefixoPara("Circuito Vale Itabira", "")).toBe("Circuito Vale Itabira");
  });
});

describe("o resumo do que vai sair", () => {
  it("fala como gente e avisa das duas impressões só com papéis diferentes", () => {
    expect(resumoDaImpressao({ etiquetas: 5, folhasIndividuais: 3, listas: 2, pecasEmLista: 34, tamanho: "adesivo" })).toEqual({
      texto: "Vai imprimir: 2 listas em Adesivo 10×15 cm (34 peças) e 5 etiquetas individuais em A4 (3 folhas) — 2 impressões separadas",
      impressoesSeparadas: true,
    });
    expect(resumoDaImpressao({ etiquetas: 1, folhasIndividuais: 1, listas: 1, pecasEmLista: 1, tamanho: "a4" })).toEqual({
      texto: "Vai imprimir: 1 lista em A4 (1 peça) e 1 etiqueta individual em A4 (1 folha)", impressoesSeparadas: false,
    });
    expect(resumoDaImpressao({ etiquetas: 0, folhasIndividuais: 0, listas: 1, pecasEmLista: 3, tamanho: "meia-a4" }).texto).toBe("Vai imprimir: 1 lista em Meia A4 (3 peças)");
    expect(resumoDaImpressao({ etiquetas: 0, folhasIndividuais: 0, listas: 0, pecasEmLista: 0, tamanho: "a4" }).texto).toBe("Nada para imprimir ainda.");
  });

  it("sugere o adesivo só quando a lista INTEIRA cabe numa etiqueta dele", () => {
    expect(cabeNoAdesivo(comoLinhas(pecas(3)), { comTubo: false })).toBe(true);
    expect(cabeNoAdesivo(comoLinhas(pecas(16)), { comTubo: false })).toBe(true);
    expect(cabeNoAdesivo(comoLinhas(pecas(16)), { comTubo: true })).toBe(false);
    expect(cabeNoAdesivo(comoLinhas(pecas(40)), { comTubo: false })).toBe(false);
    expect(cabeNoAdesivo([], { comTubo: false })).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · A ETIQUETA DO TUBO, montada (desktop e 390px)
// ═════════════════════════════════════════════════════════════════════════════
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" } });

/** Tela de `largura` px: o useIsMobile lê innerWidth + matchMedia. */
function prepararTela(largura: number) {
  Object.defineProperty(window, "innerWidth", { value: largura, configurable: true });
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: /max-width:\s*767px/.test(q) && largura < 768, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; },
  }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
}
const px = (v: string | null | undefined) => { const m = String(v ?? "").match(/^(-?\d+(?:\.\d+)?)px$/); return m ? Number(m[1]) : NaN; };
const visivel = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) { if ((e as HTMLElement).style?.display === "none" || e.classList.contains("sr-only")) return false; } return true; };
/** Régua do celular: alvos ≥ 44 (o rótulo que embrulha a caixa conta), campos ≥ 16px, nada mais largo que a tela. */
function furosDoCelular(raiz: ParentNode) {
  const ruins: string[] = [];
  const nomeDe = (el: Element) => el.getAttribute("data-testid") || (el.textContent ?? "").trim().slice(0, 30);
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>('button, a[href], select, input:not([type="checkbox"])'))) {
    if (!visivel(el)) continue;
    const alt = Math.max(px(el.style.minHeight) || 0, px(el.style.height) || 0);
    if (alt < 44) ruins.push(`alvo ${alt}px: ${nomeDe(el)}`);
  }
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>('input[type="checkbox"]'))) {
    if (!visivel(el)) continue;
    const rot = el.closest("label") as HTMLElement | null;
    if (!rot || !(px(rot.style.minHeight) >= 44)) ruins.push(`caixa sem rótulo de 44: ${nomeDe(el)}`);
  }
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>('select, input:not([type="checkbox"])'))) {
    if (visivel(el) && !(px(el.style.fontSize) >= 16)) ruins.push(`campo ${el.style.fontSize}: ${nomeDe(el)}`);
  }
  for (const el of Array.from(raiz.querySelectorAll<HTMLElement>("*"))) {
    for (const v of [el.style.width, el.style.minWidth]) if (px(v) > 390) ruins.push(`largura fixa ${v}: ${nomeDe(el)}`);
    if (el.style.textOverflow === "ellipsis") ruins.push(`reticências: ${nomeDe(el)}`);
  }
  return ruins;
}

async function montarTubo(pecasDoTubo: any[], opcoes: { largura?: number; tubo?: any; nome?: string } = {}) {
  prepararTela(opcoes.largura ?? 1280);
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
  window.history.replaceState({}, "", "/grafica/tubos/t1/etiqueta");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/etiqueta-tubo")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/tubos/t1"], {
    tubo: { id: "t1", numero: 2, entregueEm: null, recebidoPor: null, ...(opcoes.tubo ?? {}) },
    evento: { id: "ev1", name: opcoes.nome ?? "Circuito Corrida Vale 2026 Itabira", truckDepartureDate: "2026-09-25T00:00:00.000Z", bookUrl: null },
    pecas: pecasDoTubo,
  });
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
}
const naTela = (sel: string) => $$(`[data-testid="folha-do-tubo"] ${sel}`);
const css = () => $$("style").map((s) => s.textContent ?? "").join("\n");
const resumoNaTela = () => $('[data-testid="resumo-da-impressao"]')!.textContent ?? "";

describe("a etiqueta do tubo, na tela", () => {
  const duas = [
    { id: "a", displayId: "#1", type: "2x1", description: "Ministério", quantity: 16, conferida: true },
    { id: "b", displayId: "#2", type: "Testeira", description: "Testeira Médica", quantity: 1, conferida: true },
  ];

  it("abre no adesivo 10×15 em pé, com quantidade, 1 cópia, sem REAPROVEITAR — e diz o que vai sair", async () => {
    await montarTubo(duas);
    expect(css()).toContain("@page { size: 100mm 150mm; margin: 3mm; }");
    const caixas = naTela(".etl-caixa");
    expect(caixas).toHaveLength(1);
    expect(caixas[0].style.width).toBe("94mm");
    expect(caixas[0].textContent).toContain("TUBO 2");
    expect(caixas[0].textContent).toContain("Itabira");
    expect($('[data-testid="linha-tubo-1-a"]')!.textContent).toBe("2x1 Ministério - 16");
    expect($('[data-testid="linha-tubo-1-b"]')!.textContent).toBe("Testeira Médica - 1");
    expect(naTela('[data-testid^="etiqueta-reaproveitar"]')).toHaveLength(0);
    expect(($('[data-testid="check-reaproveitar"]') as HTMLInputElement).checked).toBe(false);
    expect($("h1")!.textContent).toContain("Etiqueta do Tubo 2");
    expect(resumoNaTela()).toBe("Vai imprimir: 1 etiqueta em Adesivo 10×15 cm (a lista do tubo)");
    expect($('[data-testid="legenda-etiqueta-1"]')!.textContent).toBe("Adesivo 10×15 cm · lista · etiqueta 1 de 1");
    // As opções falam a mesma língua do evento: seções nomeadas.
    expect($$("fieldset legend").map((l) => l.textContent)).toEqual(["Formato", "Cabeçalho da etiqueta"]);
  });

  it("'Mostrar quantidade' desligado tira o ' - N' e fica lembrado", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.click($('[data-testid="check-mostrar-quantidade"]')!); });
    expect($('[data-testid="linha-tubo-1-a"]')!.textContent).toBe("2x1 Ministério");
    expect($('[data-testid="linha-tubo-1-b"]')!.textContent).toBe("Testeira Médica");
    expect(lerPreferencias().mostrarQuantidade).toBe(false);
  });

  it("o tamanho troca o @page e a caixa; lista curta em folha grande sugere o adesivo", async () => {
    await montarTubo(duas);
    expect($('[data-testid="sugestao-adesivo"]')).toBeNull();
    await act(async () => { fireEvent.change($('[data-testid="select-tamanho-etiqueta"]')!, { target: { value: "meia-a4" } }); });
    expect(css()).toContain("@page { size: A5 portrait; margin: 8mm; }");
    expect(naTela(".etl-caixa")[0].style.width).toBe("132mm");
    await act(async () => { fireEvent.change($('[data-testid="select-tamanho-etiqueta"]')!, { target: { value: "a4" } }); });
    expect(css()).toContain("@page { size: A4 portrait; margin: 10mm; }");
    expect(css()).not.toContain("100mm 150mm");
    expect($('[data-testid="sugestao-adesivo"]')).toBeTruthy();
    await act(async () => { fireEvent.click($('[data-testid="usar-adesivo"]')!); });
    expect(css()).toContain("@page { size: 100mm 150mm; margin: 3mm; }");
  });

  it("lista que não cabe quebra em 'Tubo 2 · 1 de 2', sem perder peça", async () => {
    const muitas = Array.from({ length: 20 }, (_, k) => ({ id: `p${k}`, displayId: `#${k}`, type: "2x1", description: `Marca ${k}`, quantity: 2, conferida: true }));
    await montarTubo(muitas);
    const caixas = naTela(".etl-caixa");
    expect(caixas).toHaveLength(2);
    expect(caixas[0].textContent).toContain("Tubo 2 · 1 de 2");
    expect(caixas[1].textContent).toContain("Tubo 2 · 2 de 2");
    expect(caixas[1].textContent).toContain("TUBO 2");
    expect(naTela('[data-testid^="linha-tubo-"]')).toHaveLength(20);
    expect(resumoNaTela()).toBe("Vai imprimir: 2 etiquetas em Adesivo 10×15 cm (lista em 2 partes)");
    expect($('[data-testid="legenda-etiqueta-2"]')!.textContent).toBe("Adesivo 10×15 cm · lista 2 de 2 · etiqueta 2 de 2");
  });

  it("cópias repetem o jogo inteiro — inclusive o REAPROVEITAR", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.change($('[data-testid="select-copias-etiqueta"]')!, { target: { value: "2" } }); });
    expect(naTela(".etl-caixa")).toHaveLength(2);
    await act(async () => { fireEvent.click($('[data-testid="check-reaproveitar"]')!); });
    const caixas = naTela(".etl-caixa");
    expect(caixas.map((c) => (c.textContent ?? "").includes("REAPROVEITAR"))).toEqual([false, true, false, true]);
    expect(lerPreferencias().copias).toBe(2);
    expect(resumoNaTela()).toBe("Vai imprimir: 4 etiquetas em Adesivo 10×15 cm (a lista do tubo + REAPROVEITAR, 2 cópias)");
  });

  it("REAPROVEITAR: liga sozinho com peça de reuso, mesmo tamanho, texto em pé — e dá para desligar", async () => {
    await montarTubo([{ ...duas[0], reuseQty: 4 }, duas[1]]);
    expect(($('[data-testid="check-reaproveitar"]') as HTMLInputElement).checked).toBe(true);
    const extra = naTela('[data-testid^="etiqueta-reaproveitar"]');
    expect(extra).toHaveLength(1);
    expect(extra[0].style.width).toBe(naTela(".etl-caixa")[0].style.width);
    expect(extra[0].style.height).toBe(naTela(".etl-caixa")[0].style.height);
    expect(extra[0].querySelector(".etl-vertical")!.textContent).toBe("REAPROVEITAR");
    expect(css()).toContain("writing-mode: vertical-rl");
    await act(async () => { fireEvent.click($('[data-testid="check-reaproveitar"]')!); });
    expect(naTela('[data-testid^="etiqueta-reaproveitar"]')).toHaveLength(0);
  });

  it("o que vai para o papel é um portal no body com as MESMAS páginas; legenda e opções não imprimem", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.change($('[data-testid="select-copias-etiqueta"]')!, { target: { value: "3" } }); });
    const papel = $("body > .etq-impressao")!;
    expect(papel).toBeTruthy();
    expect(papel.querySelectorAll(".etl-caixa")).toHaveLength(3);
    expect(papel.querySelectorAll(".etl-caixa.etl-ultima")).toHaveLength(1);
    expect(papel.querySelectorAll(".etq-acao, .etq-zoom")).toHaveLength(0);
    expect(css()).toContain("body > *:not(.etq-impressao) { display: none !important; }");
    expect(css()).toContain(".etq-acao { display: none !important; }");
    expect($('[data-testid="painel-de-opcoes"]')!.className).toContain("etq-acao");
    // O zoom da prévia é só de tela.
    expect(css()).toContain("@media screen { .etq-zoom { zoom: var(--etq-zoom, 1); } }");
  });

  it("tubo vazio ainda imprime a etiqueta (evento + número)", async () => {
    await montarTubo([]);
    expect(naTela(".etl-caixa")).toHaveLength(1);
    expect(naTela(".etl-caixa")[0].textContent).toContain("Este tubo está vazio.");
  });

  it("evento 'teste 3': a gigante é o nome inteiro; o cabeçalho é editável e restaurável", async () => {
    await montarTubo(duas, { nome: "teste 3" });
    expect(($('[data-testid="input-destaque-tubo"]') as HTMLInputElement).value).toBe("teste 3");
    expect(($('[data-testid="input-texto-de-cima"]') as HTMLInputElement).value).toBe("");
    await act(async () => { fireEvent.change($('[data-testid="input-destaque-tubo"]')!, { target: { value: "Itabira" } }); });
    await act(async () => { fireEvent.change($('[data-testid="input-texto-de-cima"]')!, { target: { value: "Circuito Vale" } }); });
    expect(naTela(".etl-caixa")[0].textContent).toContain("Circuito Vale");
    expect(naTela(".etl-caixa")[0].textContent).toContain("Itabira");
    await act(async () => { fireEvent.click($('[data-testid="restaurar-cabecalho"]')!); });
    expect(($('[data-testid="input-destaque-tubo"]') as HTMLInputElement).value).toBe("teste 3");
  });

  it("embalada sozinha (tubo avulso / sem número) não quebra: sem 'TUBO N', com o caminho da etiqueta individual", async () => {
    await montarTubo(duas, { tubo: { numero: null, avulso: true } });
    expect($("h1")!.textContent).toContain("Etiqueta da embalagem");
    expect(naTela(".etl-caixa")[0].textContent).not.toContain("TUBO");
    expect(document.body.textContent).not.toContain("null");
    const aviso = $('[data-testid="aviso-embalada-sozinha"]')!;
    expect(aviso.querySelector("a")!.getAttribute("href")).toBe("/eventos/ev1/etiquetas?de=grafica");
  });

  it("a 390px: rodapé fixo com resumo + Imprimir, alvos de 44, campos de 16px, nada mais largo que a tela", async () => {
    await montarTubo(duas, { largura: 390 });
    const rodape = $('[data-testid="rodape-de-acao"]')!;
    expect(rodape.style.position).toBe("fixed");
    expect(rodape.style.paddingBottom).toContain("safe-area-inset-bottom");
    expect(rodape.querySelector('[data-testid="imprimir-etiqueta-tubo"]')).toBeTruthy();
    expect(furosDoCelular($('[data-testid="painel-de-opcoes"]')!.parentElement!.parentElement!)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · ETIQUETAS DO EVENTO — a tela reorganizada (22/09)
// ═════════════════════════════════════════════════════════════════════════════
async function montarEvento(itens: any[], opcoes: { largura?: number; nome?: string } = {}) {
  prepararTela(opcoes.largura ?? 1280);
  const chamadas: Array<{ url: string; corpo: any }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: any, init?: any) => {
    chamadas.push({ url: String(url), corpo: init?.body ? JSON.parse(init.body) : null });
    return json([]);
  }));
  window.print = vi.fn();
  window.history.replaceState({}, "", "/eventos/ev1/etiquetas");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/etiquetas-evento")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/events", "ev1"], { id: "ev1", name: opcoes.nome ?? "Circuito Corrida Vale 2026 Itabira" });
  queryClient.setQueryData(["/api/items", "ev1"], itens);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return chamadas;
}
const item = (id: string, type: string, description: string, quantity = 1, extra: any = {}) =>
  ({ id, displayId: `#${id}`, type, description, quantity, status: "conferred", conferredQty: quantity, deliveredQty: 0, ...extra });
const ITENS = [
  item("1", "2x1", "Ministério", 16), item("2", "2x1", "BB", 6),
  item("3", "Testeira", "Testeira Médica"), item("4", "Testeira", "Testeira Largada"),
  item("5", "Rolo", "Santander", 3), item("6", "Backdrop", "Backdrop lona"),
];
const clicar = async (testid: string) => { await act(async () => { fireEvent.click($(`[data-testid="${testid}"]`)!); }); };
const mudar = async (testid: string, value: string) => { await act(async () => { fireEvent.change($(`[data-testid="${testid}"]`)!, { target: { value } }); }); };
const individuais = () => $$('[data-testid^="etiqueta-"]');
const linhasDeLista = () => $$('[data-testid^="lista-linha-"]');

describe("etiquetas do evento: UMA leitura", () => {
  it("quatro seções nomeadas, na ordem em que se decide — e nenhuma faixa de chips", async () => {
    await montarEvento(ITENS);
    expect($$("fieldset legend").map((l) => l.textContent)).toEqual(["1 · O que imprimir", "2 · Como sai", "3 · Formato", "4 · Cabeçalho da etiqueta"]);
    expect($("h1")!.textContent).toContain("Etiquetas do evento");
    expect($('[data-testid="nome-do-evento"]')!.textContent).toContain("Circuito Corrida Vale 2026 Itabira");
    // as três faixas antigas saíram
    for (const velho of ["faixa-em-lista", "check-em-lista", "filtro-tipo-todos", "lista-tipo-todos"]) expect($(`[data-testid="${velho}"]`), velho).toBeNull();
  });

  it("abre com o 2x1 em lista e o resto individual, e o resumo diz isso em linguagem de gente", async () => {
    await montarEvento(ITENS);
    expect($('[data-testid="como-sai-2x1-lista"]')!.getAttribute("aria-pressed")).toBe("true");
    expect($('[data-testid="como-sai-testeira-individual"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(linhasDeLista().map((e) => e.textContent)).toEqual(["2x1 Ministério - 16", "2x1 BB - 6"]);
    expect($$('[data-testid="etl-subtitulo"]')).toHaveLength(0);
    expect(individuais()).toHaveLength(4);
    expect(resumoNaTela()).toBe("Vai imprimir: 1 lista em Adesivo 10×15 cm (2 peças) e 4 etiquetas individuais em A4 (2 folhas) — 2 impressões separadas");
    expect($('[data-testid="aviso-papeis-diferentes"]')).toBeTruthy();
    expect($('[data-testid="contagem-marcadas"]')!.textContent).toBe("6 de 6 peças marcadas");
    // cada folha da prévia diz o papel e a posição
    expect($('[data-testid="legenda-folha-1"]')!.textContent).toBe("A4 deitada · folha 1 de 2 · 2 etiquetas");
    expect($('[data-testid="legenda-lista-1"]')!.textContent).toBe("Adesivo 10×15 cm · lista 1 de 1");
  });

  it("'Como sai' decide por TIPO: mais tipos em lista agrupam com subtítulo; atalhos e 'Padrão'", async () => {
    await montarEvento(ITENS);
    await clicar("como-sai-testeira-lista");
    await clicar("como-sai-rolo-lista");
    expect($$('[data-testid="etl-subtitulo"]').map((e) => e.textContent)).toEqual(["2X1", "ROLOS", "TESTEIRAS"]);
    expect(linhasDeLista()).toHaveLength(5);
    expect(individuais()).toHaveLength(1);
    await clicar("como-sai-tudo-lista");
    expect(individuais()).toHaveLength(0);
    expect(linhasDeLista()).toHaveLength(6);
    expect(resumoNaTela()).toBe("Vai imprimir: 1 lista em Adesivo 10×15 cm (6 peças)");
    // sem individuais, a orientação (que só vale para elas) some
    expect($('[data-testid="formato-das-individuais"]')).toBeNull();
    await clicar("como-sai-tudo-individual");
    expect(individuais()).toHaveLength(6);
    expect($('[data-testid="formato-da-lista"]')).toBeNull();
    expect(resumoNaTela()).toBe("Vai imprimir: 6 etiquetas individuais em A4 (3 folhas)");
    await clicar("como-sai-padrao");
    expect(linhasDeLista()).toHaveLength(2);
    expect($('[data-testid="como-sai-padrao"]')).toBeNull();
  });

  it("busca e filtro só ESTREITAM A VISTA — o que imprime é o que está marcado; 'Só as visíveis' faz a ponte", async () => {
    await montarEvento(ITENS);
    await mudar("busca-peca", "médica");
    expect($$('[data-testid^="selecao-peca-"]')).toHaveLength(1);
    expect(individuais()).toHaveLength(4);
    expect($('[data-testid="contagem-marcadas"]')!.textContent).toBe("6 de 6 peças marcadas · mostrando 1");
    expect($('[data-testid="aviso-marcadas-fora-da-vista"]')!.textContent).toContain("5 peças marcadas estão fora da busca");
    await clicar("selecao-so-visiveis");
    expect(individuais().map((e) => e.getAttribute("data-testid"))).toEqual(["etiqueta-3"]);
    expect(linhasDeLista()).toHaveLength(0);
    await mudar("busca-peca", "");
    await mudar("select-filtro-tipo", "2x1");
    expect($$('[data-testid^="selecao-peca-"]')).toHaveLength(2);
    await mudar("busca-peca", "zzz");
    expect($('[data-testid="busca-sem-resultado"]')).toBeTruthy();
  });

  it("'Mostrar quantidade', papel e cópias valem para as listas; a lista tem página própria", async () => {
    await montarEvento(ITENS);
    expect(css()).toContain("@page etqlista { size: 100mm 150mm; margin: 3mm; }");
    expect(css()).toContain(".etq-lista { page: etqlista; }");
    expect(css()).toContain("@page { size: A4 landscape; margin: 8mm; }");
    // a quebra de página é do BLOCO — a folha mora dentro do embrulho do zoom
    expect(css()).toContain(".etq-bloco { break-after: page; page-break-after: always; }");
    await clicar("check-mostrar-quantidade");
    expect(linhasDeLista().map((e) => e.textContent)).toEqual(["2x1 Ministério", "2x1 BB"]);
    await mudar("select-tamanho-lista", "a4");
    expect(css()).toContain("@page etqlista { size: A4 portrait; margin: 10mm; }");
    expect($('[data-testid="lista-1"]')!.style.width).toBe("190mm");
    // lista de 2 linhas numa A4: sugere o adesivo — e, em A4, some o aviso das duas impressões
    expect($('[data-testid="aviso-papeis-diferentes"]')).toBeNull();
    await clicar("usar-adesivo");
    expect($('[data-testid="lista-1"]')!.style.width).toBe("94mm");
    await mudar("select-copias-lista", "2");
    expect($$('[data-testid^="legenda-lista-"]').map((e) => e.textContent)).toEqual([
      "Adesivo 10×15 cm · lista 1 de 1 · cópia 1 de 2", "Adesivo 10×15 cm · lista 1 de 1 · cópia 2 de 2",
    ]);
    expect(linhasDeLista()).toHaveLength(2);
    expect(resumoNaTela()).toContain("2 listas em Adesivo 10×15 cm (2 peças)");
  });

  it("lista longa pagina ('Lista · 1 de 2') e o resumo acompanha", async () => {
    const muitos = Array.from({ length: 20 }, (_, k) => item(`m${k}`, "2x1", `Marca ${k}`, 2));
    await montarEvento([...muitos, item("x", "Backdrop", "Backdrop lona")]);
    expect($('[data-testid="lista-1"]')!.textContent).toContain("Lista · 1 de 2");
    expect(linhasDeLista()).toHaveLength(20);
    expect(resumoNaTela()).toContain("2 listas em Adesivo 10×15 cm (20 peças) e 1 etiqueta individual em A4 (1 folha)");
    expect($('[data-testid="sugestao-adesivo"]')).toBeNull();
  });

  it("o registro de impressão vale para TODAS as que saíram, em lista ou não", async () => {
    const chamadas = await montarEvento(ITENS);
    await clicar("button-imprimir-etiquetas");
    const reg = chamadas.find((c) => c.url.includes("/api/items/labels-printed"))!;
    expect(reg.corpo.itemIds.sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(window.print).toHaveBeenCalled();
  });

  it("'Só listas' imprime (e registra) só as listas, no papel da lista; desmarcada nunca é registrada", async () => {
    const chamadas = await montarEvento(ITENS);
    await clicar("selecao-peca-2");
    await clicar("o-que-sai-listas");
    expect(individuais()).toHaveLength(0);
    expect(resumoNaTela()).toBe("Vai imprimir: 1 lista em Adesivo 10×15 cm (1 peça)");
    expect(css()).toContain("@page { size: 100mm 150mm; margin: 3mm; }");
    await clicar("button-imprimir-etiquetas");
    const reg = chamadas.find((c) => c.url.includes("/api/items/labels-printed"))!;
    expect(reg.corpo.itemIds).toEqual(["1"]);
  });

  it("'uma por unidade' numera os volumes das individuais", async () => {
    await montarEvento(ITENS);
    await clicar("check-por-unidade");
    expect($$('[data-testid^="etiqueta-5-"]')).toHaveLength(3);
    expect(resumoNaTela()).toContain("6 etiquetas individuais em A4 (3 folhas)");
  });

  it("evento 'teste 3': sai 'TESTE 3' gigante, não 'TESTE' + '3'; cabeçalho editável com prévia imediata", async () => {
    await montarEvento([item("6", "Backdrop", "Backdrop lona")], { nome: "teste 3" });
    expect(($('[data-testid="input-destaque"]') as HTMLInputElement).value).toBe("teste 3");
    expect(($('[data-testid="input-texto-de-cima"]') as HTMLInputElement).value).toBe("");
    const etiqueta = $('[data-testid="etiqueta-6"]')!;
    const gigante = Array.from(etiqueta.querySelectorAll("p")).find((p) => p.style.fontWeight === "900" && p.style.textTransform === "uppercase")!;
    expect(gigante.textContent).toBe("teste 3");
    await mudar("input-destaque", "Mariana");
    await mudar("input-texto-de-cima", "Circuito Vale");
    expect($('[data-testid="etiqueta-6"]')!.textContent).toContain("Circuito Vale");
    expect($('[data-testid="etiqueta-6"]')!.textContent).toContain("Mariana");
    await clicar("restaurar-cabecalho");
    expect(($('[data-testid="input-destaque"]') as HTMLInputElement).value).toBe("teste 3");
  });
});

describe("etiquetas do evento: todos os estados", () => {
  it("nenhuma conferida: explica de onde a etiqueta vem e oferece incluir as não conferidas", async () => {
    await montarEvento([item("1", "2x1", "BB", 6, { status: "produced", conferredQty: 0 })]);
    expect($('[data-testid="etiquetas-vazio"]')!.textContent).toContain("A etiqueta nasce da conferência");
    const botao = $('[data-testid="button-imprimir-etiquetas"]') as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect($('[data-testid="motivo-parado"]')!.textContent).toBe("Não há peças para etiquetar.");
    await clicar("vazio-incluir-todas");
    expect(linhasDeLista()).toHaveLength(1);
    expect(($('[data-testid="button-imprimir-etiquetas"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("nada marcado: o botão para, o motivo aparece escrito e 'Marcar todas' resolve — sem registrar nada", async () => {
    const chamadas = await montarEvento(ITENS);
    await clicar("selecao-nenhuma");
    expect($('[data-testid="etiquetas-vazio"]')!.textContent).toContain("Nenhuma peça marcada");
    expect(($('[data-testid="button-imprimir-etiquetas"]') as HTMLButtonElement).disabled).toBe(true);
    expect($('[data-testid="motivo-parado"]')!.textContent).toContain("Marque ao menos uma peça");
    expect(resumoNaTela()).toBe("Nada para imprimir ainda.");
    await clicar("button-imprimir-etiquetas");
    expect(window.print).not.toHaveBeenCalled();
    expect(chamadas.some((c) => c.url.includes("labels-printed"))).toBe(false);
    await clicar("vazio-marcar-todas");
    expect(individuais()).toHaveLength(4);
  });

  it("já impressas abrem desmarcadas, com selo; 'Só as N que faltam' refaz isso", async () => {
    await montarEvento([item("1", "Backdrop", "A", 1, { labelPrintedAt: "2026-09-20T15:00:00.000Z" }), item("2", "Backdrop", "B")]);
    expect(($('[data-testid="selecao-peca-1"]') as HTMLInputElement).checked).toBe(false);
    expect($('[data-testid="selo-impressa-1"]')!.textContent).toContain("impressa");
    await clicar("selecao-todas");
    expect(individuais()).toHaveLength(2);
    await clicar("selecao-so-novas");
    expect(individuais().map((e) => e.getAttribute("data-testid"))).toEqual(["etiqueta-2"]);
  });

  it("só listas / só individuais: 'O que sai' some quando não há os dois", async () => {
    await montarEvento([item("1", "2x1", "BB", 6)]);
    expect($('[data-testid="o-que-sai-tudo"]')).toBeNull();
    expect($('[data-testid="formato-das-individuais"]')).toBeNull();
    cleanup();
    await montarEvento([item("6", "Backdrop", "Backdrop lona")]);
    expect($('[data-testid="o-que-sai-tudo"]')).toBeNull();
    expect($('[data-testid="formato-da-lista"]')).toBeNull();
    expect($('[data-testid="orientacao-retrato"]')).toBeTruthy();
  });

  it("nome longo quebra linha em vez de cortar; muitas peças rolam dentro da lista", async () => {
    const longo = "Placa de octanorme (CHECK-IN) com aplicação frente e verso do patrocinador master";
    await montarEvento([item("1", "Placa de octanorme (CHECKI - IN)", longo, 10), ...Array.from({ length: 120 }, (_, k) => item(`n${k}`, "Backdrop", `Peça ${k}`))]);
    const lista = $('[data-testid="lista-de-pecas"]')!;
    expect(lista.style.overflowY).toBe("auto");
    expect(px(lista.style.maxHeight)).toBeGreaterThan(0);
    expect($$('[data-testid^="selecao-peca-"]')).toHaveLength(121);
    expect(furosDoCelular($('[data-testid="painel-de-opcoes"]')!).filter((f) => f.startsWith("reticências"))).toEqual([]);
  });

  it("falha de rede não vira 'evento sem peças'", async () => {
    prepararTela(1280);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    window.history.replaceState({}, "", "/eventos/ev9/etiquetas");
    const { queryClient } = await import("@/lib/queryClient");
    const Pagina = (await import("@/pages/etiquetas-evento")).default;
    queryClient.clear();
    await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
    await tick(80);
    expect($('[data-testid="etiquetas-erro"]')!.getAttribute("role")).toBe("alert");
    expect($('[data-testid="etiquetas-vazio"]')).toBeNull();
  });
});

describe("etiquetas do evento a 390px", () => {
  it("o painel vira 'Opções' (fechado), a prévia aparece e o resumo + Imprimir ficam no rodapé fixo", async () => {
    await montarEvento(ITENS, { largura: 390 });
    expect($('[data-testid="painel-de-opcoes"]')).toBeNull();
    const abrir = $('[data-testid="abrir-opcoes"]')!;
    expect(abrir.getAttribute("aria-expanded")).toBe("false");
    const rodape = $('[data-testid="rodape-de-acao"]')!;
    expect(rodape.style.position).toBe("fixed");
    expect(rodape.style.paddingBottom).toContain("safe-area-inset-bottom");
    expect(rodape.querySelector('[data-testid="resumo-da-impressao"]')).toBeTruthy();
    expect(rodape.querySelector('[data-testid="button-imprimir-etiquetas"]')).toBeTruthy();
    // a prévia tem espaço para o rodapé não cobrir a última folha, e não rola de lado
    const previa = $('[data-testid="previa-das-etiquetas"]')!;
    expect(previa.style.overflow).toBe("hidden");
    expect(px(previa.style.paddingBottom)).toBeGreaterThanOrEqual(120);
  });

  it("aberto: as mesmas quatro seções, alvos de 44, campos de 16px, nada mais largo que a tela", async () => {
    await montarEvento(ITENS, { largura: 390 });
    await clicar("abrir-opcoes");
    expect($('[data-testid="abrir-opcoes"]')!.getAttribute("aria-expanded")).toBe("true");
    expect($$("fieldset legend")).toHaveLength(4);
    // com as opções abertas a prévia sai da frente — só na tela
    expect($('[data-testid="previa-das-etiquetas"]')!.style.display).toBe("none");
    expect(css()).toContain(".etq-corpo, .etq-previa { display: block !important;");
    expect(furosDoCelular($('[data-testid="painel-de-opcoes"]')!)).toEqual([]);
    expect(furosDoCelular($('[data-testid="barra-das-etiquetas"]')!)).toEqual([]);
    expect(furosDoCelular($('[data-testid="rodape-de-acao"]')!)).toEqual([]);
  });
});
