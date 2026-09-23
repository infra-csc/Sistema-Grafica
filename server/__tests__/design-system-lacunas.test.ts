// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// AS LACUNAS DO DESIGN SYSTEM, FECHADAS — rodada final (23/09).
//
// Cada tela que migrou para os componentes de ui/ relatou o que faltava, e
// contornou localmente: <div> em volta só para carregar um data-testid, ref que
// recolocava id/aria-controls depois do render, `style` sobrescrevendo a cor
// do botão para a etapa, botão irmão posicionado por cima do cartão para não
// ter botão dentro de botão, cabeçalho escuro com hex cravado.
//
// Este arquivo prende as props NOVAS, uma por uma, montadas no jsdom — e, junto,
// que os PADRÕES não mudaram: toda mudança desta rodada é aditiva, e as telas
// continuam iguais até adotarem. No fim, o contraste medido dos tokens novos
// (TOM_FORTE, ESCURO) e o que o index.css passou a carregar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import { Printer, LayoutGrid, List, CheckCircle2 } from "lucide-react";

import { Botao, BotaoLink } from "@/components/ui/botao";
import { Abas, Segmentado } from "@/components/ui/abas";
import { CartaoKpi, FaixaDeKpis } from "@/components/ui/cartao-kpi";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { Selo, CORES_SOBRE_ESCURO } from "@/components/ui/selo";
import { ModalHeader, ModalFooter } from "@/components/modal-shell";
import { T, N, TOM, TOM_FORTE, ESCURO, H } from "@/lib/theme";

const h = React.createElement;
vi.setConfig({ testTimeout: 60_000 });

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const px = (v: string) => parseFloat(v);

/** "#rrggbb" → "rgb(r,g,b)", que é como o jsdom devolve a cor do style. */
const rgb = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r},${g},${b})`;
};
const cor = (v: string) => v.replace(/\s/g, "");

const luminancia = (hex: string) => {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
};
const razao = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Compõe "rgba(255,255,255,a)" sobre um fundo sólido — é o que o olho vê. */
const sobre = (rgbaBranco: string, fundo: string) => {
  const a = Number(rgbaBranco.match(/rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([\d.]+)\s*\)/)![1]);
  return "#" + [1, 3, 5].map((i) => {
    const c = Math.round(255 * a + parseInt(fundo.slice(i, i + 2), 16) * (1 - a));
    return c.toString(16).padStart(2, "0");
  }).join("");
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe("<Botao> — variantes novas, tom, ícone e a versão link", () => {
  it("os padrões não mudaram: secundário, ícone de 14px, classe .ds-botao", () => {
    render(h(Botao, { icone: Printer, "data-testid": "b" } as any, "Imprimir"));
    const b = tid("b")!;
    expect(b.className).toBe("ds-botao");
    expect(cor(b.style.color)).toBe(rgb(T.strong));
    expect(cor(b.style.backgroundColor)).toBe(rgb(T.surface));
    expect(px(b.style.minHeight)).toBe(H.md);
    const svg = b.querySelector("svg")!;
    expect(svg.style.width).toBe("14px");
  });

  it("tamanhoDoIcone muda o ícone e o spinner — sem ícone filho por fora", () => {
    render(h(Botao, { icone: Printer, tamanhoDoIcone: 18, "data-testid": "b" } as any, "x"));
    expect(tid("b")!.querySelector("svg")!.style.width).toBe("18px");
    cleanup();
    render(h(Botao, { carregando: true, tamanhoDoIcone: 18, "data-testid": "b" } as any, "x"));
    const spin = tid("b")!.querySelector("svg")!;
    expect(spin.getAttribute("class")).toContain("animate-spin");
    expect(spin.style.width).toBe("18px");
  });

  it("claro e claroFantasma: para fundo escuro, com classe própria de hover e foco", () => {
    render(h(Botao, { variante: "claro", "data-testid": "a" } as any, "Salvar"));
    const a = tid("a")!;
    expect(a.className).toContain("ds-botao-claro");
    expect(cor(a.style.backgroundColor)).toBe("rgb(255,255,255)");
    expect(cor(a.style.color)).toBe(rgb(T.text));

    cleanup();
    render(h(Botao, { variante: "claroFantasma", "data-testid": "f" } as any, "Anterior"));
    const f = tid("f")!;
    expect(f.className).toContain("ds-botao-claro-fantasma");
    expect(cor(f.style.color)).toBe(rgb(ESCURO.texto));
    // O texto claro sobre o realce, composto nos dois escuros da casa.
    for (const fundo of [ESCURO.fundo, ESCURO.fundoAlto]) {
      expect(razao(ESCURO.texto, sobre(ESCURO.realce, fundo)), fundo).toBeGreaterThanOrEqual(4.5);
      expect(razao(ESCURO.texto, sobre(ESCURO.realceForte, fundo)), `${fundo} no hover`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("perigoSecundario avisa sem gritar: fundo branco, texto e borda do vermelho", () => {
    render(h(Botao, { variante: "perigoSecundario", "data-testid": "b" } as any, "Remover"));
    const b = tid("b")!;
    expect(b.className).toContain("ds-botao-perigo-secundario");
    expect(cor(b.style.backgroundColor)).toBe(rgb(T.surface));
    expect(cor(b.style.color)).toBe(rgb(TOM.perigo.text));
    expect(razao(TOM.perigo.text, T.surface)).toBeGreaterThanOrEqual(4.5);
    // E o hover (a tinta vermelha clara) também segura o texto.
    expect(razao(TOM.perigo.text, TOM.perigo.bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("secundarioForte: borda n5 e texto n10", () => {
    render(h(Botao, { variante: "secundarioForte", "data-testid": "b" } as any, "Trocar"));
    expect(cor(tid("b")!.style.color)).toBe(rgb(T.text));
    expect(tid("b")!.style.border).toContain(cor(rgb(T.bdark)).replace(/,/g, ", "));
  });

  it("tom pinta a ETAPA sem style: fundo no primário, texto no secundário e no fantasma", () => {
    render(h(Botao, { variante: "primario", tom: "ciano", "data-testid": "p" } as any, "Conferir"));
    expect(cor(tid("p")!.style.backgroundColor)).toBe(rgb(TOM.ciano.text));
    expect(cor(tid("p")!.style.color)).toBe("rgb(255,255,255)");
    cleanup();
    render(h(Botao, { variante: "secundario", tom: "sucesso", "data-testid": "s" } as any, "Aprovar"));
    expect(cor(tid("s")!.style.color)).toBe(rgb(TOM.sucesso.text));
    cleanup();
    render(h(Botao, { variante: "fantasma", tom: "info", "data-testid": "f" } as any, "Ver"));
    expect(cor(tid("f")!.style.color)).toBe(rgb(TOM.info.text));
  });

  it("…e é ignorado onde a cor É o recado (perigo, claro)", () => {
    render(h(Botao, { variante: "perigo", tom: "sucesso", "data-testid": "b" } as any, "Excluir"));
    expect(cor(tid("b")!.style.backgroundColor)).toBe(rgb(TOM.perigo.text));
    cleanup();
    render(h(Botao, { variante: "claro", tom: "sucesso", "data-testid": "c" } as any, "x"));
    expect(cor(tid("c")!.style.color)).toBe(rgb(T.text));
  });

  it("todo tom serve de FUNDO sob texto branco (o primário com tom) e de texto sobre branco", () => {
    for (const [nome, t] of Object.entries(TOM)) {
      expect(razao("#ffffff", t.text), nome).toBeGreaterThanOrEqual(4.5);
      // #f97316 e #a8a29e nunca como texto — nem via tom.
      expect(t.text.toLowerCase(), nome).not.toBe("#f97316");
      expect(t.text.toLowerCase(), nome).not.toBe("#a8a29e");
    }
  });

  it("<BotaoLink> é UM <a> com o mesmo visual — sem <button> dentro", () => {
    render(h("div", null,
      h(BotaoLink, { href: "/eventos/1", variante: "primario", tamanho: "toque", icone: Printer, "data-testid": "l" } as any, "Abrir"),
      h(Botao, { variante: "primario", tamanho: "toque", "data-testid": "b" } as any, "Abrir"),
    ));
    const l = tid("l")!;
    const b = tid("b")!;
    expect(l.tagName).toBe("A");
    expect(l.getAttribute("href")).toBe("/eventos/1");
    expect(l.querySelector("button")).toBeNull();
    expect(l.className).toBe(b.className);
    for (const prop of ["backgroundColor", "color", "minHeight", "padding", "borderRadius", "fontWeight"] as const) {
      expect(l.style[prop], prop).toBe(b.style[prop]);
    }
    expect(l.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("externo vira <a href> cru; desabilitado perde o href, fica no Tab e mostra o motivo", () => {
    render(h(BotaoLink, { href: "https://exemplo.com/arquivo.pdf", externo: true, target: "_blank", "data-testid": "e" } as any, "Baixar"));
    expect(tid("e")!.getAttribute("href")).toBe("https://exemplo.com/arquivo.pdf");
    expect(tid("e")!.getAttribute("target")).toBe("_blank");
    cleanup();

    const navegou = vi.fn();
    render(h(BotaoLink, { href: "/x", desabilitado: true, motivo: "Só o admin reabre.", onClick: navegou, "data-testid": "d" } as any, "Reabrir"));
    const d = tid("d")!;
    expect(d.getAttribute("href")).toBeNull();
    expect(d.getAttribute("aria-disabled")).toBe("true");
    expect(d.getAttribute("tabindex")).toBe("0");
    expect(d.getAttribute("aria-describedby")).toBe(tid("motivo-bloqueio")!.id);
    fireEvent.click(d);
    expect(navegou).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<Segmentado> e <Abas> — o que as telas recolocavam por fora", () => {
  const ITENS = [
    { id: "cartoes", rotulo: "Cartões", icone: LayoutGrid, idDoElemento: "tab-cartoes", ariaControls: "painel-cartoes", title: "Ver em cartões" },
    { id: "lista", rotulo: "Lista", icone: List, idDoElemento: "tab-lista", ariaControls: "painel-lista" },
  ];

  it("Segmentado repassa id, aria-controls e title POR ITEM, e o ícone decorativo", () => {
    render(h(Segmentado, { itens: ITENS, ativo: "cartoes", aoTrocar: () => {} }));
    const a = tid("segmento-cartoes")!;
    expect(a.id).toBe("tab-cartoes");
    expect(a.getAttribute("aria-controls")).toBe("painel-cartoes");
    expect(a.getAttribute("title")).toBe("Ver em cartões");
    expect(a.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    // Sem as props, nada aparece — o padrão não inventa id.
    expect(tid("segmento-lista")!.getAttribute("title")).toBeNull();
  });

  it("tamanho toque põe cada segmento em 44px", () => {
    render(h(Segmentado, { itens: ITENS, ativo: "cartoes", aoTrocar: () => {}, tamanho: "toque" }));
    for (const s of $$('[role="tab"]')) expect(px(s.style.minHeight)).toBeGreaterThanOrEqual(44);
  });

  it("e os tamanhos antigos ficaram onde estavam (md = 28 no segmento, sm = 24)", () => {
    render(h(Segmentado, { itens: ITENS, ativo: "cartoes", aoTrocar: () => {} }));
    expect(px(tid("segmento-cartoes")!.style.minHeight)).toBe(H.md - 8);
    cleanup();
    render(h(Segmentado, { itens: ITENS, ativo: "cartoes", aoTrocar: () => {}, tamanho: "sm" }));
    expect(px(tid("segmento-cartoes")!.style.minHeight)).toBe(H.sm - 8);
  });

  it("testId, style e larguraCheia no contêiner", () => {
    render(h(Segmentado, {
      itens: ITENS, ativo: "cartoes", aoTrocar: () => {},
      testId: "segmented-modo", style: { marginBottom: 10, flexShrink: 0 }, larguraCheia: true,
    }));
    const c = tid("segmented-modo")!;
    expect(c.getAttribute("role")).toBe("tablist");
    expect(c.style.marginBottom).toBe("10px");
    expect(c.style.flexShrink).toBe("0");
    expect(c.style.width).toBe("100%");
    for (const s of $$('[role="tab"]')) expect(s.style.flex).toMatch(/^1 1 0/);
    expect(tid("segmentado")).toBeNull();
  });

  it("Abas: ícone, title, id e aria-controls — o painel pode dizer aria-labelledby", () => {
    render(h("div", null,
      h(Abas, { itens: ITENS, ativo: "lista", aoTrocar: () => {}, testId: "abas-grafica", style: { flex: "1 1 auto" } }),
      h("div", { role: "tabpanel", id: "painel-lista", "aria-labelledby": "tab-lista" }, "…"),
    ));
    const aba = tid("aba-lista")!;
    expect(aba.id).toBe("tab-lista");
    expect(aba.getAttribute("aria-controls")).toBe("painel-lista");
    expect(tid("aba-cartoes")!.getAttribute("title")).toBe("Ver em cartões");
    expect(aba.querySelector("svg")).not.toBeNull();
    // O painel acha a aba pelo id que ela agora tem.
    const painel = $('[role="tabpanel"]')!;
    expect(document.getElementById(painel.getAttribute("aria-labelledby")!)).toBe(aba);
    const lista = tid("abas-grafica")!;
    expect(lista.style.flex).toMatch(/^1 1 auto/);
    expect(lista.style.overflowX, "o style soma, não substitui").toBe("auto");
  });

  it("o vão entre abas é de 8px — a exceção que a régua do celular abria não é mais necessária", () => {
    render(h(Abas, { itens: ITENS, ativo: "lista", aoTrocar: () => {} }));
    expect(px(tid("abas")!.style.gap)).toBeGreaterThanOrEqual(8);
    for (const a of $$('[role="tab"]')) {
      expect(a.className, "anel de foco para dentro: o trilho rola e cortaria o de fora").toContain("ds-aba");
      expect(px(a.style.minHeight)).toBeGreaterThanOrEqual(44);
    }
  });

  it("rolarAteAtiva traz a aba ativa para a vista — e só quando pedido", () => {
    const rolou = vi.fn();
    (Element.prototype as any).scrollIntoView = rolou;
    const { rerender } = render(h(Abas, { itens: ITENS, ativo: "cartoes", aoTrocar: () => {} }));
    rerender(h(Abas, { itens: ITENS, ativo: "lista", aoTrocar: () => {} }));
    expect(rolou).not.toHaveBeenCalled();
    rerender(h(Abas, { itens: ITENS, ativo: "cartoes", aoTrocar: () => {}, rolarAteAtiva: true }));
    expect(rolou).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
    delete (Element.prototype as any).scrollIntoView;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<CartaoKpi> — cores livres, navegação, célula, tendência e ação no rodapé", () => {
  const FUCSIA = { bg: "#fdf4ff", text: "#a21caf", border: "#f5d0fe", dot: "#d946ef" };

  it("cores livres vencem o tom (fúcsia não existe no TOM)", () => {
    render(h(CartaoKpi, { valor: 7, rotulo: "Em revisão", cores: FUCSIA, tom: "info", "data-testid": "k" } as any));
    const numero = Array.from(tid("k")!.querySelectorAll("span")).find((s) => s.textContent === "7")!;
    expect(cor(numero.style.color)).toBe(rgb(FUCSIA.text));
    // E a faixa aparece: cor livre é notícia, mesmo com o tom padrão.
    const faixa = tid("k")!.querySelector('span[aria-hidden="true"]') as HTMLElement;
    expect(cor(faixa.style.backgroundColor)).toBe(rgb(FUCSIA.dot));
  });

  it("ariaLabel e title vão ao elemento — e o aria-label que já vinha pelo resto continua valendo", () => {
    render(h(CartaoKpi, { valor: 3, rotulo: "Atrasadas", onClick: () => {}, ariaLabel: "Filtrar atrasadas: 3", title: "Clique para filtrar", "data-testid": "k" } as any));
    expect(tid("k")!.getAttribute("aria-label")).toBe("Filtrar atrasadas: 3");
    expect(tid("k")!.getAttribute("title")).toBe("Clique para filtrar");
    cleanup();
    render(h(CartaoKpi, { valor: 3, rotulo: "A", onClick: () => {}, "aria-label": "antigo", "data-testid": "k" } as any));
    expect(tid("k")!.getAttribute("aria-label")).toBe("antigo");
  });

  it("NAVEGAÇÃO com href é um <a> sem aria-pressed, com a seta que diz 'leva a outro lugar'", () => {
    render(h(CartaoKpi, { valor: 12, rotulo: "Conferir", href: "/grafica?etapa=conferir", "data-testid": "k" } as any));
    const k = tid("k")!;
    expect(k.tagName).toBe("A");
    expect(k.getAttribute("href")).toBe("/grafica?etapa=conferir");
    expect(k.getAttribute("aria-pressed")).toBeNull();
    expect(k.querySelectorAll("svg").length).toBe(1);
  });

  it("NAVEGAÇÃO por onClick é <button> sem aria-pressed — atalho não é liga/desliga", () => {
    const foi = vi.fn();
    render(h(CartaoKpi, { valor: 12, rotulo: "Ver fila", onClick: foi, navegacao: true, ativo: true, "data-testid": "k" } as any));
    const k = tid("k")!;
    expect(k.tagName).toBe("BUTTON");
    expect(k.getAttribute("aria-pressed")).toBeNull();
    fireEvent.click(k);
    expect(foi).toHaveBeenCalledTimes(1);
  });

  it("o filtro continua sendo <button aria-pressed> (padrão intacto)", () => {
    render(h(CartaoKpi, { valor: 1, rotulo: "A", onClick: () => {}, ativo: true, "data-testid": "k" } as any));
    expect(tid("k")!.getAttribute("aria-pressed")).toBe("true");
    expect(tid("k")!.querySelectorAll("svg").length, "filtro não tem seta").toBe(0);
  });

  it("CÉLULA: sem moldura, com o divisor desenhado pela sombra, dentro da <FaixaDeKpis>", () => {
    render(h(FaixaDeKpis, { rotulo: "Resumo", minimo: 140 } as any,
      h(CartaoKpi, { valor: 4, rotulo: "Hoje", variante: "celula", "data-testid": "c1" } as any),
      h(CartaoKpi, { valor: 9, rotulo: "Semana", variante: "celula", onClick: () => {}, "data-testid": "c2" } as any),
    ));
    const faixa = tid("faixa-de-kpis")!;
    expect(faixa.getAttribute("role")).toBe("group");
    expect(faixa.getAttribute("aria-label")).toBe("Resumo");
    expect(faixa.style.overflow, "é o recorte que apaga o divisor da última coluna").toBe("hidden");
    const c1 = tid("c1")!;
    expect(c1.style.border).toBe("");
    expect(c1.style.borderRadius).toBe("");
    expect(c1.style.boxShadow).toMatch(/^1px 0(px)? 0(px)? /);
    expect(c1.style.boxShadow).toContain(T.border);
    expect(tid("c2")!.className, "anel para dentro: a faixa recortaria o de fora").toContain("ds-kpi-principal");
  });

  it("TENDÊNCIA: verde quando vai para onde é bom, vermelho quando não, cinza sem saber", () => {
    const montar = (t: any) => { cleanup(); render(h(CartaoKpi, { valor: 1, rotulo: "A", tendencia: t } as any)); return tid("kpi-tendencia")!; };
    expect(cor(montar({ valor: "+12%", direcao: "sobe", bom: "sobe" }).style.color)).toBe(rgb(TOM.sucesso.text));
    expect(cor(montar({ valor: "+3", direcao: "sobe", bom: "desce" }).style.color)).toBe(rgb(TOM.perigo.text));
    const neutra = montar({ valor: "0", direcao: "desce" });
    expect(cor(neutra.style.color)).toBe(rgb(T.second));
    // Quem não vê a seta ouve a direção.
    expect(neutra.querySelector(".sr-only")!.textContent).toContain("Caiu");
  });

  it("AÇÃO NO RODAPÉ sem botão dentro de botão — e o clique nela não aciona o cartão", () => {
    const cartao = vi.fn();
    const acao = vi.fn();
    render(h(CartaoKpi, {
      valor: 5, rotulo: "Rascunhos", onClick: cartao, "data-testid": "k",
      acaoSecundaria: h(Botao, { tamanho: "sm", variante: "fantasma", onClick: acao, "data-testid": "inclui" } as any, "inclui 3 rascunhos"),
    } as any));
    const principal = tid("k")!;
    expect(principal.tagName).toBe("BUTTON");
    expect(principal.querySelector("button"), "botão dentro de botão é HTML inválido").toBeNull();
    for (const b of $$("button")) expect(b.closest("button")).toBe(b);
    expect(tid("k-moldura")!.contains(tid("inclui")!)).toBe(true);
    fireEvent.click(tid("inclui")!);
    expect(acao).toHaveBeenCalledTimes(1);
    expect(cartao).not.toHaveBeenCalled();
  });

  it("o rótulo leva a classe que o celular sobe para 12px e deixa quebrar", () => {
    render(h(CartaoKpi, { valor: 1, rotulo: "Aguardando conferência", "data-testid": "k" } as any));
    const rotulo = Array.from(tid("k")!.querySelectorAll("span")).find((s) => s.textContent === "Aguardando conferência")!;
    expect(rotulo.className).toBe("ds-kpi-rotulo");
    const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
    const bloco = css.slice(css.indexOf(".ds-kpi-rotulo {"));
    expect(css.lastIndexOf("@media (max-width: 767px)", css.indexOf(".ds-kpi-rotulo {"))).toBeGreaterThan(-1);
    expect(bloco).toMatch(/font-size:\s*12px\s*!important/);
    expect(bloco).toMatch(/white-space:\s*normal\s*!important/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<CabecalhoDaPagina>, <EstadoVazio>, <EstadoErro>", () => {
  it("testId vai ao <h1>; margem e cor do ícone configuráveis; padrões intactos", () => {
    render(h(CabecalhoDaPagina, { titulo: "Eventos", testId: "title-eventos", icone: Printer, corDoIcone: T.accentText }));
    const h1 = tid("title-eventos")!;
    expect(h1.tagName).toBe("H1");
    expect(tid("cabecalho-da-pagina")!.style.marginBottom).toBe("20px");
    const ladrilho = tid("cabecalho-da-pagina")!.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(cor(ladrilho.style.color)).toBe(rgb(T.accentText));

    cleanup();
    render(h(CabecalhoDaPagina, { titulo: "A", semMargem: true, margemInferior: 12 }));
    expect(tid("cabecalho-da-pagina")!.style.marginBottom, "semMargem vence").toBe("0px");
    cleanup();
    render(h(CabecalhoDaPagina, { titulo: "A", margemInferior: 8, icone: Printer }));
    expect(tid("cabecalho-da-pagina")!.style.marginBottom).toBe("8px");
    const padrao = tid("cabecalho-da-pagina")!.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(cor(padrao.style.color)).toBe(rgb(T.apoio));
    expect($("h1")!.getAttribute("data-testid")).toBeNull();
  });

  it("EstadoErro: testId e testIdDoBotao; padrões continuam os de antes", () => {
    render(h(EstadoErro, { aoTentarDeNovo: () => {}, testId: "consultas-erro", testIdDoBotao: "button-retry-historico" }));
    expect(tid("consultas-erro")!.getAttribute("role")).toBe("alert");
    expect(tid("button-retry-historico")!.textContent).toBe("Tentar de novo");
    expect(tid("estado-erro")).toBeNull();
    cleanup();
    render(h(EstadoErro, { aoTentarDeNovo: () => {} }));
    expect(tid("estado-erro")).not.toBeNull();
    expect(px(tid("botao-tentar-de-novo")!.style.minHeight)).toBe(H.md);
  });

  it("EstadoErro: botão de toque, rótulo próprio, e carregando trava o segundo clique", () => {
    const tentou = vi.fn();
    render(h(EstadoErro, { aoTentarDeNovo: tentou, tamanhoDoBotao: "toque", rotuloDoBotao: "Recarregar", carregando: true }));
    const b = tid("botao-tentar-de-novo") as HTMLButtonElement;
    expect(px(b.style.minHeight)).toBeGreaterThanOrEqual(44);
    expect(b.textContent).toBe("Recarregar");
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(b);
    expect(tentou).not.toHaveBeenCalled();
  });

  it("EstadoVazio: tom no ícone (tudo em dia fala verde) e testId", () => {
    render(h(EstadoVazio, { titulo: "Nada pendente", icone: CheckCircle2, tom: "sucesso", testId: "empty-arte" }));
    const icone = tid("empty-arte")!.querySelector("svg")!;
    expect(cor(icone.style.color)).toBe(rgb(TOM.sucesso.text));
    expect(tid("estado-vazio")).toBeNull();
    cleanup();
    render(h(EstadoVazio, { titulo: "Nada" }));
    expect(cor(tid("estado-vazio")!.querySelector("svg")!.style.color)).toBe(rgb(T.bdark));
  });

  it("todo tom de ícone de vazio passa 3:1 (objeto gráfico) sobre o branco da caixa", () => {
    for (const [nome, t] of Object.entries(TOM)) expect(razao(t.text, T.surface), nome).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("modal-shell — X sem onMouseEnter, selo no escuro, rodapé sem #fff", () => {
  const fonte = readFileSync(path.resolve(__dirname, "../../client/src/components/modal-shell.tsx"), "utf8");

  it("o X não troca cor por JS: o hover mora no CSS e as cores chegam por var", () => {
    expect(fonte).not.toMatch(/onMouseEnter=/);
    expect(fonte).not.toMatch(/onMouseLeave=/);
    render(h(ModalHeader, { title: "Editar", onClose: () => {}, testIdDoFechar: "button-close-modal" }));
    const x = tid("button-close-modal")!;
    expect(x.getAttribute("title")).toBe("Fechar (Esc)");
    expect(x.className).toContain("modal-fechar");
    expect(x.className).toContain("modal-fechar-escuro");
    expect(x.style.getPropertyValue("--fechar-fundo")).toBe(ESCURO.realce);
    expect(x.style.getPropertyValue("--fechar-fundo-hover")).toBe(ESCURO.realceForte);
    fireEvent.mouseEnter(x);
    expect(x.style.backgroundColor, "nada de style.backgroundColor trocado na mão").toBe("");

    const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
    expect(css).toMatch(/\.modal-fechar:hover[^{]*\{\s*background-color:\s*var\(--fechar-fundo-hover/);
  });

  it("o cabeçalho escuro leva o anel claro e o selo ao lado do título", () => {
    render(h(ModalHeader, {
      title: "Vincular", onClose: () => {},
      selo: h(Selo, { cores: CORES_SOBRE_ESCURO, "data-testid": "selo" } as any, "3 de 12"),
    }));
    const cab = $("h2")!.closest(".ds-sobre-escuro");
    expect(cab).not.toBeNull();
    expect($("h2")!.parentElement!.contains(tid("selo"))).toBe(true);
    // O texto do selo sobre o realce forte, composto nos dois escuros.
    for (const fundo of [ESCURO.fundo, ESCURO.fundoAlto]) {
      expect(razao(CORES_SOBRE_ESCURO.text, sobre(CORES_SOBRE_ESCURO.bg, fundo))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("sem selo, o <h2> fica onde sempre esteve (filho direto da coluna do título)", () => {
    render(h(ModalHeader, { title: "Só título", variant: "confirm" }));
    const h2 = $("h2")!;
    expect(h2.parentElement!.style.flex).toMatch(/^1/);
    expect(h2.closest(".ds-sobre-escuro")).toBeNull();
  });

  it("ModalFooter: T.surface por padrão, fundo e style configuráveis", () => {
    expect(fonte).not.toMatch(/backgroundColor:\s*"#fff"/);
    render(h(ModalFooter, { "data-testid": "rodape" } as any, "x"));
    expect(cor(tid("rodape")!.style.backgroundColor)).toBe(rgb(T.surface));
    cleanup();
    render(h(ModalFooter, { fundo: T.bg, style: { flexDirection: "row" }, "data-testid": "rodape" } as any, "x"));
    expect(cor(tid("rodape")!.style.backgroundColor)).toBe(rgb(T.bg));
    expect(tid("rodape")!.style.flexDirection).toBe("row");
    expect(tid("rodape")!.style.flexShrink).toBe("0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("tokens novos: TOM_FORTE e ESCURO, com o contraste medido", () => {
  const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");

  it("TOM_FORTE cobre as MESMAS famílias do TOM, e o texto passa AA sobre o próprio fundo", () => {
    expect(Object.keys(TOM_FORTE).sort()).toEqual(Object.keys(TOM).sort());
    for (const [nome, t] of Object.entries(TOM_FORTE)) {
      expect(razao(t.text, t.bg), nome).toBeGreaterThanOrEqual(4.5);
      // E também sobre o branco: o texto forte aparece fora do chip.
      expect(razao(t.text, "#ffffff"), `${nome} sobre branco`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("forte é FORTE: fundo mais escuro e texto mais escuro que o degrau claro", () => {
    for (const nome of Object.keys(TOM) as (keyof typeof TOM)[]) {
      if (nome === "neutro") continue; // neutro claro já é o n2; o forte ganha no texto
      expect(luminancia(TOM_FORTE[nome].bg), `${nome}.bg`).toBeLessThan(luminancia(TOM[nome].bg));
      expect(luminancia(TOM_FORTE[nome].text), `${nome}.text`).toBeLessThan(luminancia(TOM[nome].text));
    }
    expect(luminancia(TOM_FORTE.neutro.text)).toBeLessThan(luminancia(TOM.neutro.text));
  });

  it("ESCURO: texto e apoio passam AA nos dois fundos; o #a8a29e não virou texto", () => {
    for (const fundo of [ESCURO.fundo, ESCURO.fundoAlto]) {
      expect(razao(ESCURO.texto, fundo), `texto sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      expect(razao(ESCURO.apoio, fundo), `apoio sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ESCURO.apoio.toLowerCase()).not.toBe("#a8a29e");
    expect(ESCURO.texto.toLowerCase()).not.toBe("#a8a29e");
    expect(ESCURO.gradiente).toContain(ESCURO.fundo);
    expect(ESCURO.gradiente).toContain(ESCURO.fundoAlto);
  });

  it("o anel de foco sobre o escuro passa 3:1 (WCAG 1.4.11) — e o laranja profundo não passaria no realce", () => {
    for (const fundo of [ESCURO.fundo, ESCURO.fundoAlto, sobre(ESCURO.realceForte, ESCURO.fundoAlto)]) {
      expect(razao(ESCURO.foco, fundo), fundo).toBeGreaterThanOrEqual(3);
    }
    expect(razao("#ea580c", sobre(ESCURO.realceForte, ESCURO.fundoAlto))).toBeLessThan(3);
    expect(css).toMatch(/\.ds-sobre-escuro :focus-visible[\s\S]{0,200}outline-color:\s*var\(--escuro-foco\)/);
  });

  it("o index.css espelha o ESCURO dígito por dígito", () => {
    const varDe = (nome: string) => css.match(new RegExp(`--${nome}\\s*:\\s*([^;]+);`))?.[1].trim();
    expect(varDe("escuro-fundo")).toBe(ESCURO.fundo);
    expect(varDe("escuro-fundo-alto")).toBe(ESCURO.fundoAlto);
    expect(varDe("escuro-texto")).toBe(ESCURO.texto);
    expect(varDe("escuro-apoio")).toBe(ESCURO.apoio);
    expect(varDe("escuro-borda")).toBe(ESCURO.borda);
    expect(varDe("escuro-realce")).toBe(ESCURO.realce);
    expect(varDe("escuro-realce-forte")).toBe(ESCURO.realceForte);
    expect(varDe("escuro-foco")).toBe(ESCURO.foco);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("index.css — tema claro de verdade, foco, movimento e alvo", () => {
  const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
  const bloco = (seletor: string, a = 0) => {
    const i = css.indexOf(seletor, a);
    return i < 0 ? "" : css.slice(i, css.indexOf("}", i) + 1);
  };

  it("o app declara que é claro: as peças nativas não escurecem sobre a tela clara", () => {
    const raiz = bloco(":root {\n  /* O APP É CLARO.");
    expect(raiz).toMatch(/color-scheme:\s*light/);
  });

  it("o hover do fantasma é um PAPEL (--realce), definido no claro com o cinza claro da escada", () => {
    expect(css).toMatch(/\.ds-botao-fantasma:hover:not\(:disabled\)\s*\{\s*background-color:\s*var\(--realce\)/);
    expect(css).not.toMatch(/\.ds-botao-fantasma:hover[^{]*\{[^}]*var\(--n2\)/);
    // O :root claro da escala carrega o valor claro — n2 é #f5f5f4, não o
    // #292524 do escuro.
    const escala = css.slice(css.indexOf("A ESCALA DA INTERFACE"), css.indexOf("\n.dark {", css.indexOf("A ESCALA DA INTERFACE")));
    expect(escala).toMatch(/--realce:\s*var\(--n2\)/);
    expect(escala).toContain(`--n2:  ${N.n2}`);
  });

  it("o tema escuro, desligado, está COERENTE: color-scheme, semânticos e superfície redefinidos", () => {
    const i = css.indexOf("\n.dark {", css.indexOf("A ESCALA DA INTERFACE"));
    const escuro = css.slice(i, css.indexOf("}", i));
    expect(escuro).toMatch(/color-scheme:\s*dark/);
    for (const v of ["ok-bg", "ok-text", "alerta-bg", "alerta-text", "perigo-bg", "perigo-text", "info-bg", "info-text", "escuro-fundo"]) {
      expect(escuro, `--${v} no escuro`).toContain(`--${v}:`);
    }
    // Os semânticos do escuro também passam AA (texto sobre o próprio fundo).
    const par = (n: string) => escuro.match(new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, "i"))![1];
    for (const f of ["ok", "alerta", "perigo", "info"]) {
      expect(razao(par(`${f}-text`), par(`${f}-bg`)), f).toBeGreaterThanOrEqual(4.5);
    }
    // E nenhum código liga o tema por engano.
    expect(css).not.toContain("prefers-color-scheme: dark");
  });

  it("foco visível: aba e célula com o anel para dentro; link-botão sem sublinhado", () => {
    expect(css).toMatch(/\.ds-aba:focus-visible\s*\{\s*outline-offset:\s*-3px/);
    expect(css).toMatch(/\.ds-kpi-principal:focus-visible\s*\{\s*outline-offset:\s*-3px/);
    expect(css).toMatch(/a\.ds-botao\s*\{\s*text-decoration:\s*none/);
    expect(css).toMatch(/a\.ds-botao\[aria-disabled="true"\]/);
  });

  it("alvo de 44px no toque também para o <a> com cara de botão", () => {
    const i = css.lastIndexOf("@media (pointer: coarse)");
    expect(css.slice(i, css.indexOf("}", css.indexOf("{", i) + 1) + 1)).toMatch(/a\.ds-botao\s*\{\s*min-height:\s*44px\s*!important/);
  });

  it("prefers-reduced-motion continua zerando transição e animação (spinner incluído)", () => {
    const m = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(m).toContain("animation-duration: 0.01ms !important");
    expect(m).toContain("transition-duration: 0.01ms !important");
  });

  it("hover das variantes novas mora no CSS e não acende desabilitado", () => {
    for (const c of ["ds-botao-claro-fantasma", "ds-botao-perigo-secundario"]) {
      expect(css, c).toMatch(new RegExp(`\\.${c}:hover:not\\(:disabled\\)`));
    }
  });
});
