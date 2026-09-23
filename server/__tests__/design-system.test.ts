// @vitest-environment jsdom
//
// ─────────────────────────────────────────────────────────────────────────────
// O DESIGN SYSTEM, MONTADO.
//
// Os componentes de client/src/components/ui/ existem para acabar com padrões
// que cada tela reimplementava pela metade. Este arquivo guarda justamente as
// metades que faltavam, montando cada peça no jsdom:
//
//   · <Botao>   — o MOTIVO de estar desabilitado aparece na tela, não no title;
//                 `carregando` realmente impede o segundo clique.
//   · <Abas>    — seta anda, Home/End vão às pontas, e só a aba ativa está no
//                 Tab (roving tabindex).
//   · <CartaoKpi> — clicável é <button aria-pressed>, e não <div onClick>.
//   · useConfirmar() — a promessa resolve uma vez e resolve `false` quando se
//                 desiste; nenhum window.confirm é chamado.
//
// E, no fim, o CONTRATO DO ESPELHO: theme.ts e index.css têm de carregar os
// mesmos valores. Era exatamente aí que a base já tinha divergido uma vez —
// --r-md valia 10 contra R.md 8 — e a divergência sobreviveu porque nada a
// media.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterEach, vi } from "vitest";
import * as React from "react";
import { render, act, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { Abas, Segmentado } from "@/components/ui/abas";
import { CartaoKpi } from "@/components/ui/cartao-kpi";
import { EstadoVazio, EstadoErro, Esqueleto } from "@/components/ui/estados";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { T, N, FS, R, TOM, FONT, H } from "@/lib/theme";

const h = React.createElement;
vi.setConfig({ testTimeout: 60_000 });

const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const tid = (id: string) => $(`[data-testid="${id}"]`);
const tick = (ms = 0) => act(() => new Promise<void>((r) => setTimeout(r, ms)));

// O Radix pede estas duas em qualquer diálogo; o jsdom não as tem.
function prepararJsdom() {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  (Element.prototype as any).hasPointerCapture = () => false;
  (Element.prototype as any).releasePointerCapture = () => {};
  (Element.prototype as any).scrollIntoView = () => {};
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// ─────────────────────────────────────────────────────────────────────────────
describe("<Botao>", () => {
  it("o motivo do bloqueio aparece NA TELA e descreve o botão", () => {
    render(h(Botao, {
      disabled: true,
      motivo: "Só a Solicitação envia a lista.",
      "data-testid": "b",
    } as any, "Enviar"));

    const frase = tid("motivo-bloqueio");
    expect(frase, "a frase do motivo está na tela").not.toBeNull();
    expect(frase!.textContent).toContain("Só a Solicitação envia a lista.");

    // E está LIGADA ao botão: quem usa leitor de tela ouve o porquê junto com
    // o rótulo, em vez de só "Enviar, indisponível".
    const botao = tid("b") as HTMLButtonElement;
    expect(botao.getAttribute("aria-describedby")).toBe(frase!.id);
    expect(botao.disabled).toBe(true);
  });

  it("e NÃO aparece quando o botão está liberado — motivo de algo liberado é ruído", () => {
    render(h(Botao, { motivo: "…", "data-testid": "b" } as any, "Enviar"));
    expect(tid("motivo-bloqueio")).toBeNull();
    expect(tid("b")!.getAttribute("aria-describedby")).toBeNull();
  });

  it("carregando desabilita de verdade: o segundo clique não manda o segundo pedido", () => {
    const cliques: number[] = [];
    const { rerender } = render(h(Botao, {
      onClick: () => cliques.push(1),
      "data-testid": "b",
    } as any, "Atender"));

    fireEvent.click(tid("b")!);
    expect(cliques.length).toBe(1);

    rerender(h(Botao, {
      carregando: true,
      onClick: () => cliques.push(1),
      "data-testid": "b",
    } as any, "Atender"));

    const botao = tid("b") as HTMLButtonElement;
    expect(botao.disabled, "carregando É desabilitado").toBe(true);
    expect(botao.getAttribute("aria-busy")).toBe("true");
    fireEvent.click(botao);
    expect(cliques.length, "dois cliques rápidos já viraram dois pedidos de peça iguais").toBe(1);
  });

  it("os estados vivem na classe, porque estilo inline não tem :hover nem :focus-visible", () => {
    render(h(Botao, { variante: "fantasma", "data-testid": "b" } as any, "Filtrar"));
    const classe = tid("b")!.className;
    expect(classe).toContain("ds-botao");
    expect(classe).toContain("ds-botao-fantasma");
  });

  it("type=button por padrão: dentro de <form>, um botão de ação não envia o formulário", () => {
    const enviou: string[] = [];
    render(h("form", { onSubmit: (e: any) => { e.preventDefault(); enviou.push("x"); } },
      h(Botao, { "data-testid": "b" } as any, "Cancelar")));
    fireEvent.click(tid("b")!);
    expect(enviou.length).toBe(0);
  });

  it("o tamanho `toque` respeita o piso de 44px do galpão", () => {
    render(h(Botao, { tamanho: "toque", "data-testid": "b" } as any, "Atender"));
    expect(parseInt(tid("b")!.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    expect(H.toque).toBe(44);
  });

  it("nem accent laranja nem o cinza decorativo entram como cor de texto", () => {
    for (const variante of ["primario", "secundario", "fantasma", "perigo"] as const) {
      cleanup();
      render(h(Botao, { variante, "data-testid": "b" } as any, "x"));
      const cor = tid("b")!.style.color.replace(/\s/g, "");
      expect(cor, variante).not.toBe("rgb(249,115,22)");  // #f97316
      expect(cor, variante).not.toBe("rgb(168,162,158)");  // #a8a29e
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<Abas>", () => {
  const ITENS = [
    { id: "todos", rotulo: "Todos", contador: 42 },
    { id: "atrasados", rotulo: "Atrasados", contador: 3, tom: "perigo" as const },
    { id: "fechados", rotulo: "Fechados", desabilitada: true },
    { id: "meus", rotulo: "Meus" },
  ];

  function montar(ativoInicial = "todos") {
    const trocas: string[] = [];
    function Tela() {
      const [ativo, setAtivo] = React.useState(ativoInicial);
      return h(Abas, {
        itens: ITENS, ativo,
        aoTrocar: (id: string) => { trocas.push(id); setAtivo(id); },
        rotuloDaLista: "Filtro",
      });
    }
    render(h(Tela));
    return trocas;
  }

  it("só a aba ativa fica no Tab — 9 abas não podem custar 9 Tabs", () => {
    montar();
    const noTab = $$('[role="tab"]').filter((b) => b.getAttribute("tabindex") === "0");
    expect(noTab.length).toBe(1);
    expect(noTab[0].getAttribute("data-testid")).toBe("aba-todos");
  });

  it("a seta anda, e PULA a aba desabilitada em vez de parar nela", () => {
    const trocas = montar("atrasados");
    fireEvent.keyDown(tid("abas")!, { key: "ArrowRight" });
    // "fechados" está desabilitada: a seta segue para "meus".
    expect(trocas).toEqual(["meus"]);
  });

  it("dá a volta na ponta, e Home/End vão direto às extremidades", () => {
    const trocas = montar("meus");
    const abas = tid("abas")!;
    fireEvent.keyDown(abas, { key: "ArrowRight" });   // volta ao começo
    expect(trocas.at(-1)).toBe("todos");
    fireEvent.keyDown(abas, { key: "End" });
    expect(trocas.at(-1)).toBe("meus");
    fireEvent.keyDown(abas, { key: "Home" });
    expect(trocas.at(-1)).toBe("todos");
  });

  it("aria-selected acompanha, e o clique também troca", () => {
    montar();
    expect(tid("aba-todos")!.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tid("aba-meus")!);
    expect(tid("aba-meus")!.getAttribute("aria-selected")).toBe("true");
    expect(tid("aba-todos")!.getAttribute("aria-selected")).toBe("false");
  });

  it("o contador usa a cor da PRÓPRIA aba: o 3 vermelho é a notícia antes da palavra", () => {
    montar();
    const comTom = tid("aba-atrasados")!.querySelector("span") as HTMLElement;
    const semTom = tid("aba-todos")!.querySelector("span") as HTMLElement;
    expect(comTom.textContent).toBe("3");
    expect(comTom.style.backgroundColor.replace(/\s/g, "")).toBe("rgb(254,242,242)"); // TOM.perigo.bg
    expect(semTom.textContent).toBe("42");
    expect(semTom.style.backgroundColor.replace(/\s/g, "")).not.toBe("rgb(254,242,242)");
  });

  it("e o alvo de cada aba é o de dedo", () => {
    montar();
    for (const aba of $$('[role="tab"]')) {
      expect(parseInt(aba.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });

  it("<Segmentado> compartilha a MESMA navegação por setas — ela existe uma vez só", () => {
    const trocas: string[] = [];
    function Tela() {
      const [ativo, setAtivo] = React.useState("tabela");
      return h(Segmentado, {
        itens: [{ id: "tabela", rotulo: "Tabela" }, { id: "cartao", rotulo: "Cartões" }],
        ativo, aoTrocar: (id: string) => { trocas.push(id); setAtivo(id); },
      });
    }
    render(h(Tela));
    fireEvent.keyDown(tid("segmentado")!, { key: "ArrowRight" });
    expect(trocas).toEqual(["cartao"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<CartaoKpi>", () => {
  it("com onClick é um <button aria-pressed> — como <div> o teclado não alcançava o filtro", () => {
    const cliques: number[] = [];
    render(h(CartaoKpi, {
      valor: 12, rotulo: "Atrasadas", tom: "perigo", ativo: true,
      onClick: () => cliques.push(1), "data-testid": "k",
    } as any));

    const k = tid("k")!;
    expect(k.tagName).toBe("BUTTON");
    expect(k.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(k);
    expect(cliques.length).toBe(1);
  });

  it("sem onClick é uma <div> e não finge ser clicável", () => {
    render(h(CartaoKpi, { valor: 12, rotulo: "Total", "data-testid": "k" } as any));
    const k = tid("k")!;
    expect(k.tagName).toBe("DIV");
    expect(k.getAttribute("aria-pressed")).toBeNull();
    expect(k.style.cursor).toBe("default");
  });

  it("o estado ativo muda mais que a cor: borda e aria-pressed", () => {
    render(h(CartaoKpi, { valor: 1, rotulo: "A", tom: "perigo", onClick: () => {}, "data-testid": "a" } as any));
    const desligado = tid("a")!.style.border;
    cleanup();
    render(h(CartaoKpi, { valor: 1, rotulo: "A", tom: "perigo", ativo: true, onClick: () => {}, "data-testid": "a" } as any));
    expect(tid("a")!.style.border).not.toBe(desligado);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<Selo>", () => {
  it("as cores de status mandam quando vêm por `cores` — a forma é do selo, a cor é de status.ts", () => {
    render(h(Selo, {
      cores: { bg: "#123456", text: "#654321", border: "#abcdef", dot: "#000000" },
      ponto: true, "data-testid": "s",
    } as any, "Produzido"));
    const s = tid("s")!;
    expect(s.style.backgroundColor.replace(/\s/g, "")).toBe("rgb(18,52,86)");
    expect(s.style.color.replace(/\s/g, "")).toBe("rgb(101,67,33)");
    expect(s.textContent).toBe("Produzido");
  });

  it("o tom semântico vem da mesma paleta que a pílula de status", () => {
    render(h(Selo, { tom: "sucesso", "data-testid": "s" } as any, "ok"));
    expect(tid("s")!.style.color.replace(/\s/g, "")).toBe("rgb(21,128,61)"); // TOM.sucesso.text
    expect(TOM.sucesso.text).toBe("#15803d");
  });

  it("no tamanho sm ele ganha a classe que o celular sobe para 12px", () => {
    render(h(Selo, { tamanho: "sm", "data-testid": "s" } as any, "x"));
    expect(tid("s")!.className).toContain("status-pill-sm");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("<EstadoVazio>, <EstadoErro> e <Esqueleto>", () => {
  it("vazio e erro NÃO são a mesma caixa: o erro se anuncia e oferece o caminho de volta", () => {
    const tentativas: number[] = [];
    render(h(EstadoErro, {
      titulo: "Não deu para carregar",
      detalhe: "500 no servidor",
      aoTentarDeNovo: () => tentativas.push(1),
    }));

    const erro = tid("estado-erro")!;
    expect(erro.getAttribute("role"), "a falha chega depois do render").toBe("alert");
    expect(erro.textContent).toContain("500 no servidor");
    fireEvent.click(tid("botao-tentar-de-novo")!);
    expect(tentativas.length).toBe(1);

    cleanup();
    render(h(EstadoVazio, { titulo: "Nenhum modelo", descricao: "…" }));
    const vazio = tid("estado-vazio")!;
    expect(vazio.getAttribute("role"), "vazio é um fato normal, não um alarme").toBeNull();
    expect(tid("botao-tentar-de-novo")).toBeNull();
  });

  it("o esqueleto se anuncia: quem usa leitor de tela ouvia silêncio e achava a página vazia", () => {
    render(h(Esqueleto, { variante: "tabela", linhas: 3, rotulo: "Carregando as peças" }));
    const e = tid("esqueleto-tabela")!;
    expect(e.getAttribute("role")).toBe("status");
    expect(e.getAttribute("aria-busy")).toBe("true");
    expect(e.textContent).toContain("Carregando as peças");
  });

  it("as três variantes desenham silhuetas diferentes — bloco genérico faz a página pular", () => {
    for (const variante of ["lista", "cartoes", "tabela"] as const) {
      cleanup();
      render(h(Esqueleto, { variante, linhas: 4 }));
      expect(tid(`esqueleto-${variante}`), variante).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("useConfirmar()", () => {
  function montar() {
    prepararJsdom();
    const respostas: (boolean | string)[] = [];
    function Tela() {
      const { confirmar, dialogo } = useConfirmar();
      return h(React.Fragment, null,
        h("button", {
          "data-testid": "abrir",
          onClick: async () => {
            const ok = await confirmar({
              titulo: "Excluir este modelo?",
              descricao: "Não dá para desfazer.",
              confirmar: "Excluir",
              cancelar: "Manter",
              perigo: true,
            });
            respostas.push(ok);
          },
        }, "Excluir"),
        dialogo,
      );
    }
    render(h(Tela));
    return respostas;
  }

  it("resolve `true` só quando a pessoa confirma, e o botão diz o VERBO", async () => {
    const respostas = montar();
    await act(async () => { fireEvent.click(tid("abrir")!); });
    await tick(20);

    expect(tid("confirmacao")!.textContent).toContain("Excluir este modelo?");
    expect(tid("confirmacao-confirmar")!.textContent, "'OK' combina com excluir e com manter").toBe("Excluir");
    expect(tid("confirmacao-cancelar")!.textContent).toBe("Manter");

    await act(async () => { fireEvent.click(tid("confirmacao-confirmar")!); });
    await tick(20);
    expect(respostas).toEqual([true]);
  });

  it("e `false` quando a pessoa desiste — um await pendurado para sempre é um handler vazando", async () => {
    const respostas = montar();
    await act(async () => { fireEvent.click(tid("abrir")!); });
    await tick(20);
    await act(async () => { fireEvent.click(tid("confirmacao-cancelar")!); });
    await tick(20);
    expect(respostas).toEqual([false]);
  });

  it("não chama o window.confirm do navegador em momento nenhum", async () => {
    const nativo = vi.fn(() => true);
    vi.stubGlobal("confirm", nativo);
    const respostas = montar();
    await act(async () => { fireEvent.click(tid("abrir")!); });
    await tick(20);
    await act(async () => { fireEvent.click(tid("confirmacao-confirmar")!); });
    await tick(20);
    expect(nativo).not.toHaveBeenCalled();
    expect(respostas).toEqual([true]);
  });

  it("uma pergunta de cada vez resolve UMA vez só", async () => {
    const respostas = montar();
    await act(async () => { fireEvent.click(tid("abrir")!); });
    await tick(20);
    await act(async () => { fireEvent.click(tid("confirmacao-confirmar")!); });
    await tick(30);
    expect(respostas.length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O CONTRATO DO ESPELHO.
//
// theme.ts é a fonte (estilo inline lê dali) e o index.css é a cópia para o que
// o inline não alcança. A base já tinha divergido uma vez — --r-md 10 contra
// R.md 8, --n3 #e7e5e4 contra T.border #e8e8e7 — e ninguém percebeu porque
// nenhum .tsx consumia as vars. Estes testes são o que faltava para a
// divergência doer na hora em que aparece.
// ─────────────────────────────────────────────────────────────────────────────
describe("theme.ts e index.css carregam os mesmos valores", () => {
  const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
  const varDe = (nome: string) => {
    const m = css.match(new RegExp(`--${nome}\\s*:\\s*([^;]+);`));
    return m ? m[1].trim() : null;
  };

  it("a escada de neutros bate degrau por degrau", () => {
    for (const [nome, hex] of Object.entries(N)) {
      expect(varDe(nome), `--${nome}`).toBe(hex);
    }
  });

  it("os raios batem", () => {
    expect(varDe("r-sm")).toBe(`${R.sm}px`);
    expect(varDe("r-md")).toBe(`${R.md}px`);
    expect(varDe("r-lg")).toBe(`${R.lg}px`);
    expect(varDe("r-xl")).toBe(`${R.xl}px`);
  });

  it("a escala tipográfica bate, e o piso é 10px", () => {
    for (const [nome, px] of Object.entries(FS)) {
      expect(varDe(`fs-${nome}`), `--fs-${nome}`).toBe(`${px}px`);
      expect(px, `${nome} abaixo de 10px não se lê no galpão`).toBeGreaterThanOrEqual(10);
    }
  });

  it("as famílias de fonte batem — e só existem três", () => {
    expect(varDe("font-corpo")).toBe(FONT.corpo);
    expect(varDe("font-display")).toBe(FONT.display);
    expect(varDe("font-mono-ds")).toBe(FONT.mono);
    expect(Object.keys(FONT).length).toBe(3);
  });

  it("os tokens órfãos morreram: --status-* não existe mais", () => {
    expect(css).not.toContain("--status-completed");
    expect(css).not.toContain("--status-production");
    expect(css).not.toContain(".bg-status-");
  });

  it("T aponta para a escada, e não para os quase-iguais que existiam só no token", () => {
    expect(T.border).toBe(N.n4);
    expect(T.bg).toBe(N.n1);
    expect(T.text).toBe(N.n10);
    expect(T.second).toBe(N.n7);
  });

  it("o index.html carrega exatamente as três famílias", () => {
    const html = readFileSync(path.resolve(__dirname, "../../client/index.html"), "utf8");
    const link = html.match(/fonts\.googleapis\.com\/css2\?[^"']+/)![0];
    expect(link).toContain("Inter");
    expect(link).toContain("Space+Grotesk");
    expect(link).toContain("DM+Mono");
    for (const aposentada of ["Plus+Jakarta", "Manrope", "Outfit"]) {
      expect(link, aposentada).not.toContain(aposentada);
    }
  });

  it("e o app é instalável: manifest com 192/512 e display standalone", () => {
    const html = readFileSync(path.resolve(__dirname, "../../client/index.html"), "utf8");
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('name="theme-color"');
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../client/public/manifest.webmanifest"), "utf8"));
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: any) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o contraste que a régua da casa cobra", () => {
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

  it("n7, n8, n9 e n10 passam AA sobre as superfícies de TEXTO (n0, n1, n2, low)", () => {
    for (const fundo of [N.n0, N.n1, N.n2, T.low]) {
      for (const texto of [N.n7, N.n8, N.n9, N.n10]) {
        expect(razao(texto, fundo), `${texto} sobre ${fundo}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("e n3 é a exceção que o token documenta: ali o texto de apoio começa no n8", () => {
    // Medido: n7 sobre n3 dá 4,38 — abaixo do piso. n3 é fundo de campo e
    // trilho, não superfície de leitura; onde houver texto em cima dele (o
    // placeholder de um campo cinza), o token certo é o n8. Este teste existe
    // para o limite ficar escrito, e não virar "ah, 4,38 é quase".
    expect(razao(N.n7, N.n3)).toBeLessThan(4.5);
    expect(razao(N.n8, N.n3)).toBeGreaterThanOrEqual(4.5);

    const modelos = readFileSync(path.resolve(__dirname, "../../client/src/pages/modelos.tsx"), "utf8");
    expect(modelos).toContain("::placeholder { color: ${T.apoio}; opacity: 1; }");
  });

  it("n6 NÃO passa — é por isso que ele só serve a ícone e desabilitado", () => {
    expect(razao(N.n6, N.n0)).toBeLessThan(4.5);
  });

  it("o texto de cada tom semântico passa sobre o próprio fundo", () => {
    for (const [nome, tom] of Object.entries(TOM)) {
      expect(razao(tom.text, tom.bg), nome).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("o accent laranja só serve a decoração; quem carrega leitura é o accentText", () => {
    expect(razao(T.accent, "#ffffff"), "#f97316 sob texto branco").toBeLessThan(4.5);
    expect(razao(T.accentText, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("o Confirmar da Revisão Final e o placeholder saíram dos tons que reprovavam", () => {
    // A casca própria (.review-confirm-content) saiu do CSS: as confirmações
    // da Revisão usam <Botao> — primário escuro ou perigo, nunca o laranja da
    // marca sob texto branco — e o placeholder do motivo usa o
    // muted-foreground AA (~#736d67), não o n6.
    const css = readFileSync(path.resolve(__dirname, "../../client/src/index.css"), "utf8");
    expect(css).not.toMatch(/^\.review-confirm-content\b/m);
    expect(css).not.toMatch(/^\.review-dialog-shell\b/m);

    const rev = readFileSync(path.resolve(__dirname, "../../client/src/pages/solicitacao.tsx"), "utf8");
    // Do `<Botao` mais próximo até o testid: o onClick tem `=>`, então um
    // regex de tag única pararia no primeiro `>`.
    const confirmacoes = Array.from(rev.matchAll(/data-testid="button-[a-z-]+-confirm"/g)).map((m) => {
      const ini = rev.lastIndexOf("<Botao", m.index!);
      return ini >= 0 && m.index! - ini < 2000 ? rev.slice(ini, m.index! + m[0].length) : "";
    });
    expect(confirmacoes.length).toBeGreaterThanOrEqual(6);
    for (const b of confirmacoes) {
      expect(b).toMatch(/variante="(primario|perigo)"/);
      expect(b).not.toContain("T.accent}");
      expect(b).not.toContain("#f97316");
    }
    const motivos = Array.from(rev.matchAll(/<textarea[\s\S]*?\/>/g)).map((m) => m[0]).filter((t) => t.includes("CAMPO_DO_MOTIVO"));
    expect(motivos.length).toBeGreaterThan(0);
    for (const t of motivos) expect(t).toContain("placeholder:text-muted-foreground");
  });
});
