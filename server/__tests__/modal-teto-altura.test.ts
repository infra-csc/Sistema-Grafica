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

// ─────────────────────────────────────────────────────────────────────────────
// A RAIZ — o teto saiu de cada tela e passou a morar na casca compartilhada.
//
// POR QUE ESTE BLOCO EXISTE: os testes acima montam páginas inteiras e provam o
// resultado em quatro telas. Eles são caros (mais de 30s cada) e, por isso, não
// dá para escrever um por modal — são ~40 no app. O que segue mede a FONTE:
// `modalSurface` é a casca de ~20 DialogContent, e `ModalHeader`/`ModalFooter`
// são o cabeçalho e o rodapé desses mesmos modais. Se a regra sair daqui, sai de
// todos eles de uma vez — e é exatamente esse o estrago que estas asserções
// pegam antes de chegar na tela.
// ─────────────────────────────────────────────────────────────────────────────
describe("a casca compartilhada carrega o teto de altura", () => {
  it("modalSurface devolve o teto da casa e a coluna flex", async () => {
    const { modalSurface } = await import("@/components/modal-shell");
    const s = modalSurface(640);

    // A CONTA: `100vh − 48` = viewport menos 24px de respiro em cima e 24
    // embaixo. O desconto é simétrico porque o Radix centra o Content com
    // `top: 50%` + `translateY(-50%)` — é essa centralização que fazia o
    // excedente sair METADE de cada lado quando não havia teto.
    expect(s.maxHeight, "modalSurface voltou a não ter teto de altura").toBe(TETO_DA_CASA);

    // Sem a coluna flex o teto não serve de nada: com `overflow: hidden` (que
    // esta casca traz para mascarar os cantos arredondados) o conteúdo seria
    // recortado em silêncio em vez de virar rolagem no corpo.
    expect(s.display).toBe("flex");
    expect(s.flexDirection).toBe("column");
    expect(s.overflow).toBe("hidden");

    // O que já existia e não pode ser perdido na mesma mexida.
    expect(s.maxWidth).toBe(640);
    expect(s.width).toBe("96vw");
  });

  it("cabeçalho e rodapé da casca não encolhem", async () => {
    const { ModalHeader, ModalFooter } = await import("@/components/modal-shell");

    // `flexShrink: 0` nos dois é o outro lado da coluna flex: sem ele o
    // navegador espreme cabeçalho e rodapé junto com o corpo numa janela baixa,
    // em vez de deixar o corpo rolar. O rodapé é onde mora a ação primária.
    const { container: cab } = render(h(ModalHeader as any, { title: "Título" }));
    expect((cab.firstElementChild as HTMLElement).style.flexShrink).toBe("0");

    const { container: rod } = render(h(ModalFooter as any, null, "ação"));
    expect((rod.firstElementChild as HTMLElement).style.flexShrink).toBe("0");
  });

  it("os Content base trazem a rede de segurança, e o inline continua vencendo", async () => {
    const { DialogContent } = await import("@/components/ui/dialog");
    const { AlertDialogContent } = await import("@/components/ui/alert-dialog");

    // A REDE: um DialogContent que não declara teto NEM overflow é o único que
    // hoje fica sem proteção — e é esse que a classe base alcança. Ela não
    // atropela ninguém: `style` inline vence classe, e o `cn` usa tailwind-merge,
    // então um `max-h-[92vh]` do consumidor apaga o desta base.
    const { Dialog } = await import("@/components/ui/dialog");
    const { AlertDialog } = await import("@/components/ui/alert-dialog");

    render(h(Dialog, { open: true } as any,
      h(DialogContent as any, { "data-testid": "cru" },
        h("h2", null, "t"))));
    const cru = document.querySelector('[data-testid="cru"]') as HTMLElement;
    expect(cru.className).toContain("max-h-[calc(100vh-48px)]");
    expect(cru.className).toContain("overflow-y-auto");

    cleanup();
    render(h(AlertDialog, { open: true } as any,
      h(AlertDialogContent as any, { "data-testid": "cru-alerta" },
        h("h2", null, "t"))));
    const cruAlerta = document.querySelector('[data-testid="cru-alerta"]') as HTMLElement;
    expect(cruAlerta.className).toContain("max-h-[calc(100vh-48px)]");
    expect(cruAlerta.className).toContain("overflow-y-auto");

    // tailwind-merge: quem declara pela className manda. Se isto quebrar, a
    // rede virou uma regra que atropela os modais que já se resolvem sozinhos.
    cleanup();
    render(h(Dialog, { open: true } as any,
      h(DialogContent as any, { "data-testid": "proprio", className: "max-h-[92vh] overflow-hidden" },
        h("h2", null, "t"))));
    const proprio = document.querySelector('[data-testid="proprio"]') as HTMLElement;
    expect(proprio.className).toContain("max-h-[92vh]");
    expect(proprio.className).not.toContain("max-h-[calc(100vh-48px)]");
    expect(proprio.className).not.toContain("overflow-y-auto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// O DESCONTO FIXO NÃO PODE VOLTAR.
//
// O padrão errado que esta varredura removeu tem sempre a mesma cara: o corpo
// do modal ganha um `maxHeight` com um número CHUTADO para cabeçalho e rodapé —
// `min(62vh, calc(100vh - 300px))`, `calc(88vh - 96px)`, `56vh`, `62vh`, `75vh`.
// Ele parece funcionar na tela de quem escreveu e erra em todas as outras: o
// cabeçalho muda de altura quando o título quebra em duas linhas no celular, e
// nenhuma constante acerta 1080 e 445 ao mesmo tempo. Foi assim que a Gestão de
// Prazos descobriu o erro (192 calculado, 12px de folga real em 375×667).
//
// O certo é o teto no DialogContent (`100vh − 48`) e o corpo com
// `flex: 1 1 auto; minHeight: 0`, deixando o navegador MEDIR cabeçalho e rodapé.
//
// Este teste lê o código-fonte porque é a única forma barata de vigiar ~40
// modais: montar cada um custaria mais de 30s. Ele não cobre modais novos — só
// impede que os já convertidos regridam.
// ─────────────────────────────────────────────────────────────────────────────
describe("os descontos fixos de altura não voltam", () => {
  const CONVERTIDOS: Array<[string, string[]]> = [
    ["client/src/pages/historico.tsx", ['maxHeight: "56vh"']],
    ["client/src/pages/arte.tsx", ["maxHeight: '62vh'"]],
    ["client/src/pages/grafica.tsx", ['"calc(88vh - 96px)"', '"calc(88vh - 112px)"']],
    ["client/src/pages/atendimento.tsx", ["maxHeight: '75vh'"]],
    ["client/src/pages/registros.tsx", ['maxHeight: "72vh"']],
    ["client/src/components/aumentar-quantidade-dialog.tsx",
      ['"min(62vh, calc(100vh - 300px))"', '"calc(88vh - 168px)"']],
    ["client/src/components/book-page-picker.tsx", ['height: "min(520px, 52vh)"']],
    ["client/src/components/export-pdf-dialog.tsx", ['maxHeight: "85dvh"']],
  ];

  /**
   * Tira comentários antes de procurar.
   *
   * É obrigatório: a regra da casa manda ESCREVER a conta onde ela mora, e cada
   * um destes arquivos agora explica, por extenso, qual desconto fixo existia
   * ali e por que saiu — citando o valor antigo. Sem descartar comentário, o
   * guarda acusaria justamente a documentação que ele deveria proteger.
   */
  const semComentarios = (fonte: string) =>
    fonte
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  it.each(CONVERTIDOS)("%s não recuperou o desconto fixo", async (arquivo, proibidos) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = semComentarios(readFileSync(resolve(process.cwd(), arquivo), "utf8"));
    for (const p of proibidos) {
      expect(
        fonte.includes(p),
        `${arquivo} voltou a descontar altura por número fixo (${p}). ` +
        `A regra da casa é teto no DialogContent e corpo com flex: 1 1 auto + minHeight: 0.`,
      ).toBe(false);
    }
  });

  it("a Gestão de Prazos não duplica a regra que já vem do modalSurface", async () => {
    // Esta tela foi a primeira a acertar o teto e por isso o declarava à mão.
    // Com a regra na casca compartilhada, repetir os mesmos valores aqui criaria
    // duas fontes de verdade para a mesma conta — a próxima pessoa mudaria uma
    // e não a outra.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const fonte = semComentarios(readFileSync(resolve(process.cwd(), "client/src/pages/gestao-prazos.tsx"), "utf8"));
    const trecho = fonte.slice(fonte.indexOf("modalSurface(1120)") - 400, fonte.indexOf("modalSurface(1120)") + 200);
    expect(trecho).not.toContain('maxHeight: "calc(100vh - 48px)"');
  });
});
