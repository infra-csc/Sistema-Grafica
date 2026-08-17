// ─────────────────────────────────────────────────────────────────────────────
// AS COLUNAS DA ABA "FINALIZADOS" — a troca de largura que não pode desandar.
//
// O DEFEITO QUE ORIGINOU ESTE ARQUIVO. Só a aba Finalizados desenha o selo de
// status na célula de ID (nas outras quatro a fase é dada pela própria aba), e
// o selo foi acrescentado sem que a coluna acompanhasse. A tabela é
// `tableLayout: fixed` e o selo é `whiteSpace: nowrap`: o que não cabe não
// alarga a coluna nem quebra — PINTA POR CIMA da vizinha. Medido no navegador,
// no DOM real, com Inter carregada: a coluna ID tinha 116px (92 úteis) e
// "Pronto para Produção" pede 153,6 — vazava 49,6px exatamente sobre o número
// da QUANTIDADE, e "Aguardando Revisão Final" (175,9) vazava 71,9 e chegava na
// coluna "Peça". É o terceiro caso do mesmo mecanismo nesta tela.
//
// A CORREÇÃO, e o que este arquivo guarda: a aba ganhou um conjunto de colunas
// PRÓPRIO (ARTE_COLS_FINALIZADOS), pago dentro do próprio orçamento — o que a
// coluna de ID ganhou, a de "Ações" devolveu, porque em Finalizados
// `acaoPrimaria` devolve null e a célula carrega só o "⋯" de 36px.
//
// POR QUE O TOTAL É INVARIANTE. Em 1568 (a largura em que o dono trabalha) a
// área útil é 1248px — 1568 menos 256 de sidebar e 64 de padding — e a tabela
// mede 1246. São 2px de sobra. Qualquer coluna que cresça sem que outra
// devolva a mesma quantidade cria ROLAGEM HORIZONTAL NOVA numa largura que
// hoje mostra a linha inteira. É por isso que a soma é testada, e não as
// larguras individuais: elas podem ser remedidas, o total não pode crescer.
//
// A conferência em pixel foi feita em navegador de verdade, com as fontes reais
// (Inter/DM Mono/Space Grotesk), em 1366, 1568 e 1848 de viewport e no card de
// 375. jsdom não faz layout — aqui se guarda a ARITMÉTICA e a ESTRUTURA que
// produzem aquele pixel.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(resolve(process.cwd(), "client/src/pages/arte.tsx"), "utf8");

/** Larguras fixas do conjunto base (a coluna 'auto' de "Peça" fica de fora). */
function colunasBase(): Map<string, number> {
  const bloco = src.match(/const ARTE_COLS: ArteCol\[\] = \[([\s\S]*?)\n\];/);
  expect(bloco, "ARTE_COLS não foi encontrado em arte.tsx").toBeTruthy();
  const m = new Map<string, number>();
  for (const c of bloco![1].matchAll(/\{\s*label:\s*'([^']+)',\s*w:\s*(\d+)/g)) {
    m.set(c[1], Number(c[2]));
  }
  return m;
}

/** Overrides que a aba Finalizados aplica sobre o conjunto base. */
function overridesFinalizados(): Map<string, number> {
  const bloco = src.match(/const ARTE_COLS_FINALIZADOS: ArteCol\[\] =([\s\S]*?)\n\s*:\s*c\);/);
  expect(bloco, "ARTE_COLS_FINALIZADOS não foi encontrado em arte.tsx").toBeTruthy();
  const m = new Map<string, number>();
  for (const c of bloco![1].matchAll(/c\.label === '([^']+)'\s*\?\s*\{[^}]*?w:\s*(\d+)/g)) {
    m.set(c[1], Number(c[2]));
  }
  return m;
}

/** O `style` da <td> que contém o marcador — para checar o recorte da célula. */
function estiloDaCelulaQueContem(marcador: string): string {
  const i = src.indexOf(marcador);
  expect(i, `marcador não encontrado em arte.tsx: ${marcador}`).toBeGreaterThan(-1);
  const abertura = src.lastIndexOf("<td style={{", i);
  expect(abertura).toBeGreaterThan(-1);
  return src.slice(abertura, src.indexOf("}}>", abertura));
}

describe("Arte · colunas da aba Finalizados", () => {
  it("dá à coluna de ID largura para o SELO DE STATUS mais largo", () => {
    // Medido no navegador com Inter: "Aguardando Revisão Final" pede 175,9px e
    // a célula gasta 12+12 de padding. Abaixo de 200 o selo volta a vazar.
    const largura = overridesFinalizados().get("ID");
    expect(largura, "a aba Finalizados precisa redefinir a largura da coluna ID").toBeDefined();
    expect(largura! - 24).toBeGreaterThanOrEqual(175.9);
  });

  it("renomeia o cabeçalho, porque a coluna deixou de ser só o código", () => {
    // Uma coluna de 208px chamada "ID" mentiria sobre o que carrega — e
    // cabeçalho é a única coisa desta tabela que nunca pode truncar.
    expect(src).toMatch(/c\.label === 'ID'\s*\?\s*\{ \.\.\.c, label: 'ID \/ Status'/);
  });

  it("paga o alargamento dentro do próprio orçamento: o TOTAL não muda", () => {
    const base = colunasBase();
    const over = overridesFinalizados();
    const somaBase = [...base.values()].reduce((s, w) => s + w, 0);
    const somaFinalizados = [...base.entries()]
      .reduce((s, [label, w]) => s + (over.get(label) ?? w), 0);
    expect(somaFinalizados).toBe(somaBase);
  });

  it("só mexe em colunas que a aba Finalizados pode pagar", () => {
    const over = overridesFinalizados();
    // "Ações" é a fonte do dinheiro: em Finalizados `acaoPrimaria` devolve null
    // e sobra só o "⋯" de 36px. Ela precisa continuar cabendo o cabeçalho
    // "AÇÕES" (41,5px medidos) mais os 24 de padding.
    const acoes = over.get("Ações");
    expect(acoes, "o alargamento da ID sai da coluna Ações").toBeDefined();
    expect(acoes!).toBeLessThan(colunasBase().get("Ações")!);
    expect(acoes! - 24).toBeGreaterThanOrEqual(41.5);
    // E o botão "⋯" tem 36px fixos.
    expect(acoes! - 24).toBeGreaterThanOrEqual(36);
  });

  it("mantém as outras quatro abas no conjunto base", () => {
    expect(src).toMatch(/tabId === "finalizados" \? ARTE_COLS_FINALIZADOS : ARTE_COLS/);
    // O colgroup e o cabeçalho precisam ler o MESMO conjunto da aba — é esse
    // pareamento que mantém as colunas alinhadas.
    expect(src).toMatch(/\{cols\.map\(\(c, i\) => <col key=\{i\} style=\{\{ width: c\.w \}\} \/>\)\}/);
    expect(src).toMatch(/\{cols\.map\(\(col, ci\) => <th key=\{ci\} style=\{thStyle\(col\)\}>/);
  });

  it("recorta a célula do ID: nenhum selo futuro volta a invadir a Qtd", () => {
    // A largura é o ajuste; o recorte é a garantia. Sem ele, qualquer rótulo
    // novo — ou um fallback de fonte mais largo que Inter — repete o defeito.
    expect(estiloDaCelulaQueContem("text-display-id-")).toContain("overflow: 'hidden'");
  });

  it("recorta a célula de patrocinadores: o chip é nowrap e não cabia", () => {
    // Segunda colisão da mesma varredura: "Prefeitura Municipal" pede 131,6px
    // contra 80 úteis e pintava por cima do botão de ação primária das abas
    // que têm um.
    expect(estiloDaCelulaQueContem('<SponsorChips sponsors={item.sponsors ?? []} variant="orange"'))
      .toContain("overflow: 'hidden'");
  });
});
