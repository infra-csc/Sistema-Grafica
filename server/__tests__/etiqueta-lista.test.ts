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
  TAMANHOS, comCopias, ehDoisPorUm, fonteDaCidadeMm, lerPreferencias, gravarPreferencias, limitarCopias, linhaDaLista,
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
// 3 · A ETIQUETA DO TUBO, montada
// ═════════════════════════════════════════════════════════════════════════════
const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" } });

async function montarTubo(pecasDoTubo: any[]) {
  vi.stubGlobal("fetch", vi.fn(async () => json([])));
  window.history.replaceState({}, "", "/grafica/tubos/t1/etiqueta");
  const { queryClient } = await import("@/lib/queryClient");
  const Pagina = (await import("@/pages/etiqueta-tubo")).default;
  queryClient.clear();
  queryClient.setQueryData(["/api/tubos/t1"], {
    tubo: { id: "t1", numero: 2, entregueEm: null, recebidoPor: null },
    evento: { id: "ev1", name: "Circuito Corrida Vale 2026 Itabira", truckDepartureDate: "2026-09-25T00:00:00.000Z", bookUrl: null },
    pecas: pecasDoTubo,
  });
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
}
const naTela = (sel: string) => $$(`[data-testid="folha-do-tubo"] ${sel}`);
const css = () => $$("style").map((s) => s.textContent ?? "").join("\n");

describe("a etiqueta do tubo, na tela", () => {
  const duas = [
    { id: "a", displayId: "#1", type: "2x1", description: "Ministério", quantity: 16, conferida: true },
    { id: "b", displayId: "#2", type: "Testeira", description: "Testeira Médica", quantity: 1, conferida: true },
  ];

  it("abre no adesivo 10×15 em pé, com quantidade, 1 cópia, sem REAPROVEITAR", async () => {
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
  });

  it("'Mostrar quantidade' desligado tira o ' - N' e fica lembrado", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.click($('[data-testid="check-mostrar-quantidade"]')!); });
    expect($('[data-testid="linha-tubo-1-a"]')!.textContent).toBe("2x1 Ministério");
    expect($('[data-testid="linha-tubo-1-b"]')!.textContent).toBe("Testeira Médica");
    expect(lerPreferencias().mostrarQuantidade).toBe(false);
  });

  it("o tamanho troca o @page e a caixa", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.change($('[data-testid="select-tamanho-etiqueta"]')!, { target: { value: "meia-a4" } }); });
    expect(css()).toContain("@page { size: A5 portrait; margin: 8mm; }");
    expect(naTela(".etl-caixa")[0].style.width).toBe("132mm");
    await act(async () => { fireEvent.change($('[data-testid="select-tamanho-etiqueta"]')!, { target: { value: "a4" } }); });
    expect(css()).toContain("@page { size: A4 portrait; margin: 10mm; }");
    expect(css()).not.toContain("100mm 150mm");
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
    expect($('[data-testid="contagem-etiquetas-tubo"]')!.textContent).toBe("2 etiquetas");
  });

  it("cópias repetem o jogo inteiro — inclusive o REAPROVEITAR", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.change($('[data-testid="select-copias-etiqueta"]')!, { target: { value: "2" } }); });
    expect(naTela(".etl-caixa")).toHaveLength(2);
    await act(async () => { fireEvent.click($('[data-testid="check-reaproveitar"]')!); });
    const caixas = naTela(".etl-caixa");
    expect(caixas.map((c) => (c.textContent ?? "").includes("REAPROVEITAR"))).toEqual([false, true, false, true]);
    expect(lerPreferencias().copias).toBe(2);
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

  it("o que vai para o papel é um portal no body com as MESMAS páginas; o resto some", async () => {
    await montarTubo(duas);
    await act(async () => { fireEvent.change($('[data-testid="select-copias-etiqueta"]')!, { target: { value: "3" } }); });
    const papel = $("body > .etq-impressao")!;
    expect(papel).toBeTruthy();
    expect(papel.querySelectorAll(".etl-caixa")).toHaveLength(3);
    expect(papel.querySelectorAll(".etl-caixa.etl-ultima")).toHaveLength(1);
    expect(css()).toContain("body > *:not(.etq-impressao) { display: none !important; }");
    expect(css()).toContain(".etq-acao { display: none !important; }");
    // A barra de opções é .etq-acao, com alvos de 44 no toque.
    const barra = $('[data-testid="check-mostrar-quantidade"]')!.closest(".etq-acao")!;
    expect(barra).toBeTruthy();
    for (const el of Array.from(barra.querySelectorAll("label, button, a"))) expect(el.className, el.textContent ?? "").toContain("etq-alvo");
  });

  it("tubo vazio ainda imprime a etiqueta (evento + número)", async () => {
    await montarTubo([]);
    expect(naTela(".etl-caixa")).toHaveLength(1);
    expect(naTela(".etl-caixa")[0].textContent).toContain("Este tubo está vazio.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · ETIQUETAS DO EVENTO — "Em lista" com escolha de tipos
// ═════════════════════════════════════════════════════════════════════════════
async function montarEvento(itens: any[]) {
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
  queryClient.setQueryData(["/api/events", "ev1"], { id: "ev1", name: "Circuito Corrida Vale 2026 Itabira" });
  queryClient.setQueryData(["/api/items", "ev1"], itens);
  await act(async () => { render(h(QueryClientProvider, { client: queryClient } as any, h(Pagina as any, null))); });
  await tick(30);
  return chamadas;
}
const item = (id: string, type: string, description: string, quantity = 1) =>
  ({ id, displayId: `#${id}`, type, description, quantity, status: "conferred", conferredQty: quantity, deliveredQty: 0 });
const ITENS = [
  item("1", "2x1", "Ministério", 16), item("2", "2x1", "BB", 6),
  item("3", "Testeira", "Testeira Médica"), item("4", "Testeira", "Testeira Largada"),
  item("5", "Rolo", "Santander", 3), item("6", "Backdrop", "Backdrop lona"),
];
const contagem = () => $(".etq-acao")!.textContent ?? "";

describe("etiquetas do evento: 'Em lista'", () => {
  it("abre com o 2x1 em lista e o resto individual; chips com contagem", async () => {
    await montarEvento(ITENS);
    expect($('[data-testid="check-em-lista"]')!.closest("label")!.textContent).toContain("Em lista");
    expect($('[data-testid="lista-tipo-2x1"]')!.textContent).toBe("2x1 · 2");
    expect($('[data-testid="lista-tipo-2x1"]')!.getAttribute("aria-pressed")).toBe("true");
    expect($('[data-testid="lista-tipo-testeira"]')!.textContent).toBe("Testeira · 2");
    expect($('[data-testid="lista-tipo-testeira"]')!.getAttribute("aria-pressed")).toBe("false");
    expect($$('[data-testid^="lista-linha-"]').map((e) => e.textContent)).toEqual(["2x1 Ministério - 16", "2x1 BB - 6"]);
    expect($$('[data-testid="etl-subtitulo"]')).toHaveLength(0);
    expect($$('[data-testid^="etiqueta-"]')).toHaveLength(4);
    // 4 individuais = 2 folhas, + 1 lista
    expect(contagem()).toContain("4 etiquetas + 1 lista · 3 folhas");
  });

  it("escolher mais tipos agrupa com subtítulo e tira as peças das individuais", async () => {
    await montarEvento(ITENS);
    await act(async () => { fireEvent.click($('[data-testid="lista-tipo-testeira"]')!); });
    await act(async () => { fireEvent.click($('[data-testid="lista-tipo-rolo"]')!); });
    expect($$('[data-testid="etl-subtitulo"]').map((e) => e.textContent)).toEqual(["2X1", "ROLOS", "TESTEIRAS"]);
    expect($$('[data-testid^="lista-linha-"]')).toHaveLength(5);
    expect($$('[data-testid^="etiqueta-"]')).toHaveLength(1);
    expect(contagem()).toContain("1 etiqueta + 1 lista · 2 folhas");
  });

  it("'todos' põe tudo em lista; de novo, volta ao padrão (só 2x1)", async () => {
    await montarEvento(ITENS);
    await act(async () => { fireEvent.click($('[data-testid="lista-tipo-todos"]')!); });
    expect($$('[data-testid^="etiqueta-"]')).toHaveLength(0);
    expect($$('[data-testid^="lista-linha-"]')).toHaveLength(6);
    expect(contagem()).toContain("0 etiquetas + 1 lista · 1 folha");
    await act(async () => { fireEvent.click($('[data-testid="lista-tipo-todos"]')!); });
    expect($$('[data-testid^="lista-linha-"]')).toHaveLength(2);
  });

  it("'Mostrar quantidade' e o tamanho valem para as listas; a lista tem página própria", async () => {
    await montarEvento(ITENS);
    expect(css()).toContain("@page etqlista { size: 100mm 150mm; margin: 3mm; }");
    expect(css()).toContain(".etq-lista { page: etqlista; }");
    // As individuais seguem em A4, como sempre.
    expect(css()).toContain("@page { size: A4 landscape; margin: 8mm; }");
    await act(async () => { fireEvent.click($('[data-testid="check-mostrar-quantidade"]')!); });
    expect($$('[data-testid^="lista-linha-"]').map((e) => e.textContent)).toEqual(["2x1 Ministério", "2x1 BB"]);
    await act(async () => { fireEvent.change($('[data-testid="select-tamanho-lista"]')!, { target: { value: "a4" } }); });
    expect(css()).toContain("@page etqlista { size: A4 portrait; margin: 10mm; }");
    expect($('[data-testid="lista-1"]')!.style.width).toBe("190mm");
  });

  it("lista longa pagina ('Lista · 1 de 2') e a conta de folhas acompanha", async () => {
    const muitos = Array.from({ length: 20 }, (_, k) => item(`m${k}`, "2x1", `Marca ${k}`, 2));
    await montarEvento([...muitos, item("x", "Backdrop", "Backdrop lona")]);
    expect($('[data-testid="lista-1"]')!.textContent).toContain("Lista · 1 de 2");
    expect($$('[data-testid^="lista-linha-"]')).toHaveLength(20);
    expect(contagem()).toContain("1 etiqueta + 2 listas · 3 folhas");
  });

  it("o registro de impressão vale para TODAS as que saíram, em lista ou não", async () => {
    const chamadas = await montarEvento(ITENS);
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-etiquetas"]')!); });
    const reg = chamadas.find((c) => c.url.includes("/api/items/labels-printed"))!;
    expect(reg.corpo.itemIds.sort()).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(window.print).toHaveBeenCalled();
  });

  it("'Só listas' imprime (e registra) só as listas, no papel da lista", async () => {
    const chamadas = await montarEvento(ITENS);
    await act(async () => { fireEvent.click($('[data-testid="o-que-sai-listas"]')!); });
    expect($$('[data-testid^="etiqueta-"]')).toHaveLength(0);
    expect(contagem()).toContain("0 etiquetas + 1 lista · 1 folha");
    expect(css()).toContain("@page { size: 100mm 150mm; margin: 3mm; }");
    await act(async () => { fireEvent.click($('[data-testid="button-imprimir-etiquetas"]')!); });
    const reg = chamadas.find((c) => c.url.includes("/api/items/labels-printed"))!;
    expect(reg.corpo.itemIds.sort()).toEqual(["1", "2"]);
  });

  it("desligar 'Em lista' volta tudo às individuais e some com a faixa", async () => {
    await montarEvento(ITENS);
    await act(async () => { fireEvent.click($('[data-testid="check-em-lista"]')!); });
    expect($('[data-testid="faixa-em-lista"]')).toBeNull();
    expect($$('[data-testid^="etiqueta-"]')).toHaveLength(6);
    expect($$('[data-testid^="lista-linha-"]')).toHaveLength(0);
  });
});
