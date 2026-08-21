// ─────────────────────────────────────────────────────────────────────────────
// AS MEDIDAS FALAM UMA LÍNGUA SÓ.
//
// O app guarda DOIS pares de medidas por peça, e a distinção importa dinheiro:
//
//   ARQ. (file_width × file_height)  — o que a impressora recebe, com sangria.
//                                       É DELE que sai o m² cobrado.
//   VIS. (visual_width × visual_height) — o que se vê na peça montada.
//
// A auditoria (pedida depois do relato da #2472) encontrou o mesmo par com
// CINCO nomes, e pior que os nomes, três defeitos de sinal:
//
//   · o formulário de peça marcava com bolinha LARANJA os campos VISUAIS —
//     sendo que o "M2 Total" laranja logo acima deriva do ARQUIVO. O form
//     ensinava a olhar para o lado que não cobra.
//   · a Gráfica — a tela que IMPRIME — mostrava o VIS em cima, escuro, e o
//     ARQ embaixo, apagado. Quando a #2472 teve o arquivo corrigido, a
//     gráfica seguiu lendo a linha escura, que era o outro par.
//   · e o ARQ da Gráfica só aparecia SE o visual existisse: peça só com
//     medida de arquivo mostrava "—" na tela de produção.
//
// A REGRA, agora em toda parte: telas de produção lideram com ARQ., escuro;
// VIS. vem depois, apagado. Rótulos são "ARQ."/"VIS." (não V:/A:, não
// "sangria", não "Medida"). E o formulário espelha VIS→ARQ enquanto o ARQ
// não for personalizado — a regra que só o Modelos tinha.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");

describe("a Gráfica lê o par que imprime", () => {
  const gr = ler("client/src/pages/grafica.tsx");

  it("ARQ primeiro e escuro; VIS depois e apagado", () => {
    const i = gr.indexOf("MEDIDAS: o ARQ vem primeiro e escuro");
    expect(i).toBeGreaterThan(-1);
    const col = gr.slice(i, i + 2600);
    // A ordem no código é a ordem na tela.
    expect(col.indexOf("ARQ")).toBeLessThan(col.indexOf("VIS"));
    expect(gr).toContain("Medidas (ARQ / VIS)");
  });

  it("peça só com medida de arquivo não vira '—'", () => {
    // O ARQ aparecia SÓ se o visual existisse. Cada par se mostra por si.
    expect(gr).toContain("{(item.fileWidth && item.fileHeight) || (item.visualWidth && item.visualHeight) ? (");
  });

  it("os apelidos de uma letra morreram", () => {
    const semCom = gr.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").map(l => l.replace(/^\s*\/\/.*$/, "")).join("\n");
    expect(semCom).not.toContain(">V:</span>");
    expect(semCom).not.toContain(">A:</span>");
  });
});

describe("o formulário de peça aponta para o par que cobra", () => {
  const ed = ler("client/src/pages/event-detail.tsx");

  it("a bolinha laranja marca o ARQ, não o VIS", () => {
    expect(ed).toContain('{ label: "ARQ. Largura", key: "fileWidth", orange: true');
    expect(ed).toContain('{ label: "VIS. Largura", key: "visualWidth", orange: false');
  });

  it("digitar o VIS espelha no ARQ enquanto o ARQ não for personalizado", () => {
    // A regra que só o Modelos tinha. Sem ela, quem parava nos dois primeiros
    // campos criava peça sem medida de arquivo — m² zero, "sem medida" na
    // importação. Um ARQ com sangria digitada nunca é sobrescrito.
    expect(ed).toContain("const espelho = !formData.fileWidth || formData.fileWidth === formData.visualWidth;");
    expect(ed).toContain("fileWidth: espelho ? v : formData.fileWidth");
  });

  it("e a frase explica os dois pares onde eles são digitados", () => {
    expect(ed).toContain("é o que a impressora recebe (com sangria) — o m² e a gráfica usam ele.");
    expect(ed).toContain("é o que se vê na peça montada.");
  });

  it("os data-testids dos quatro campos sobreviveram ao rebatismo", () => {
    for (const t of ["input-visual-width", "input-visual-height", "input-file-width", "input-file-height",
      "input-edit-visual-width", "input-edit-file-width"]) {
      expect(ed, `sumiu ${t}`).toContain(`"${t}"`);
    }
  });
});

describe("as demais telas usam os mesmos dois nomes", () => {
  it("Painel Geral: ARQ primeiro e escuro, como a Gráfica", () => {
    const pg = ler("client/src/pages/painel-geral.tsx");
    const i = pg.indexOf("ARQ primeiro e escuro");
    expect(i).toBeGreaterThan(-1);
    // O chip compacto também prefere o ARQ.
    expect(pg).toContain("? `ARQ ${item.fileWidth} × ${item.fileHeight}`");
  });

  it("Revisão: a tira diz DE QUAL par é a dimensão", () => {
    expect(ler("client/src/pages/solicitacao.tsx")).toContain('{ label: "Dimensões (ARQ.)"');
  });

  it("a ficha da peça tem dois pares, não três nomes", () => {
    const idd = ler("client/src/components/item-details-dialog.tsx");
    expect(idd).toContain('{ label: "Arquivo (ARQ.)"');
    expect(idd).toContain('{ label: "Visual (VIS.)"');
    // "Medida" (o texto derivado) saiu: era a mesma linha que "Arquivo" com
    // outro nome, e quando divergia (#2472) era a linha errada.
    expect(idd).not.toContain('{ label: "Medida",');
  });

  it("a Arte parou de chamar o ARQ de 'sangria' sozinho", () => {
    const ar = ler("client/src/pages/arte.tsx");
    expect(ar).toContain(">arq.</span>");
    expect(ar).toContain("ARQ. (com sangria)");
  });

  it("a importação diz de onde sai o m²", () => {
    expect(ler("client/src/components/import-xlsx-dialog.tsx"))
      .toContain("o que a impressora recebe (m); o m² sai daqui");
  });

  it("o Modelos mantém a regra do espelho que virou padrão", () => {
    const mo = ler("client/src/pages/modelos.tsx");
    expect(mo).toContain("const autoSync = !formData.fileWidth || formData.fileWidth === formData.area;");
  });
});
