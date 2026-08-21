// ─────────────────────────────────────────────────────────────────────────────
// A MEDIDA ACOMPANHA AS DIMENSÕES.
//
// Relatado em produção, 20/08: a peça #2472 teve as dimensões corrigidas de
// 3.95×2.95 para 7.55×2.25 às 14:36, e a gráfica continuou lendo 3.95×2.95.
//
// A causa é uma denormalização meio-mantida. `items.measurement` guarda
// "3.95 × 2.95" como TEXTO ao lado de `file_width` e `file_height`, que guardam
// os mesmos dois números. O m² já era recalculado no servidor a cada edição —
// `deriveCalculatedM2` existe justamente porque "m² é grandeza de produção e
// não pode ser fonte-de-verdade do cliente". A medida, que é o MESMO dado pela
// mesma razão, não era: o PATCH salvava fileWidth, fileHeight e calculatedM2, e
// escrevia por cima o `measurement` que o formulário tinha carregado ao ABRIR —
// ou seja, o antigo.
//
// O estrago não ficava na tela de quem editou. `measurement` é a coluna
// "Medida" da planilha exportada para a gráfica (services/xlsxExport.ts), e é o
// que a ficha da peça, a triagem e o estoque mostram. Quem corrigiu viu o
// número novo; quem produz recebeu o velho. Dois campos para o mesmo fato, um
// deles corrigido — o outro não fica "desatualizado", fica ERRADO.
//
// A regra é deliberadamente estreita: re-derivar SÓ quando as dimensões mudam.
// `measurement` é editável de propósito (a coluna do schema diz isso), e
// derivar sempre apagaria um texto escrito à mão que ninguém pediu para apagar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const rotas = readFileSync(
  path.resolve(__dirname, "../../server/routes/items.ts"),
  "utf8",
);

/** Sem comentários — para as afirmações de ausência. */
const codigo = rotas
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(l => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

describe("a medida é derivada no servidor, como o m²", () => {
  it("existe uma função só que produz o texto da medida", () => {
    expect(rotas).toContain("function deriveMeasurement(");
    // Mesmo formato do importador de planilha, que escreve a maioria deles.
    expect(rotas).toContain("return `${w.toFixed(2)} × ${h.toFixed(2)}`;");
  });

  it("e ela exige os dois lados positivos, como a do m²", () => {
    const i = rotas.indexOf("function deriveMeasurement(");
    const corpo = rotas.slice(i, i + 700);
    expect(corpo).toContain("Number.isFinite(w) && w > 0 && Number.isFinite(h) && h > 0");
    // Sem dimensão não há o que derivar — e devolver "" apagaria o texto que
    // estiver lá, que é o oposto do que esta correção quer.
    expect(corpo).toContain("return undefined;");
  });

  it("só re-deriva quando a dimensão MUDA", () => {
    // Derivar sempre apagaria um "conforme croqui" digitado à mão. Mas no
    // instante em que a dimensão muda, o texto antigo deixa de ser escolha e
    // passa a ser contradição.
    expect(rotas).toContain("function medidaMudou(");
    expect(rotas).toContain("num(novoW) !== num(atual.fileWidth) || num(novoH) !== num(atual.fileHeight)");
  });
});

describe("os dois caminhos de edição", () => {
  it("o PATCH genérico grava a medida derivada", () => {
    // É o caminho que a #2472 percorreu.
    expect(rotas).toContain("if (medida !== undefined) updatePayload.measurement = medida;");
  });

  it("e a rota-irmã ignora o `measurement` do corpo quando a dimensão mudou", () => {
    expect(rotas).toContain("const effMeasurement =");
    expect(rotas).toContain("medidaDerivada ?? (measurement !== undefined ? measurement : currentItem.measurement)");
    // A linha que aceitava o texto do cliente sem olhar para as dimensões.
    expect(codigo).not.toContain(
      "measurement: measurement !== undefined ? measurement : currentItem.measurement,",
    );
  });

  it("a trilha de auditoria diz que a medida mudou", () => {
    // Antes, a medida ficava para trás EM SILÊNCIO: nada na trilha, nada na
    // tela. A divergência só aparecia semanas depois, na gráfica.
    expect(rotas).toContain("Medida: ${currentItem.measurement || '—'} → ${item.measurement || '—'}");
  });

  it("e o diff da rota-irmã compara o que FOI GRAVADO, não o que veio no corpo", () => {
    // `measurement !== currentItem.measurement` media o campo enviado; com o
    // servidor derivando, o que foi gravado pode ser outra coisa — e a trilha
    // registraria uma mudança que não houve, ou omitiria a que houve.
    expect(rotas).toContain("if (item.measurement !== currentItem.measurement) editDetails.push(");
  });
});

describe("na criação, a medida nasce junto", () => {
  it("no POST unitário e no lote", () => {
    expect((rotas.match(/const medida = deriveMeasurement\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("mas só quando o cliente não mandou uma", () => {
    // Na criação não há valor anterior para contradizer: se veio texto, ele é
    // uma escolha, não um resíduo.
    expect((rotas.match(/if \(!String\((validatedData|parsed)\.measurement \?\? ""\)\.trim\(\)\)/g) ?? []).length).toBe(2);
  });
});

describe("o passivo tem por onde ser corrigido", () => {
  it("o script existe e não escreve sem --aplicar", () => {
    const s = readFileSync(
      path.resolve(__dirname, "../../scripts/conferir-medida-vs-dimensoes.ts"),
      "utf8",
    );
    expect(s).toContain('const APLICAR = process.argv.includes("--aplicar");');
    expect(s).toContain("if (!APLICAR) {");
    // As peças corrigidas antes desta correção continuam divergindo: nada as
    // toca até alguém editá-las de novo.
    expect(s).toContain("Nada foi escrito.");
  });

  it("e ele não reescreve texto que não parece medida", () => {
    const s = readFileSync(
      path.resolve(__dirname, "../../scripts/conferir-medida-vs-dimensoes.ts"),
      "utf8",
    );
    expect(s).toContain("function pareceMedida(");
    expect(s).toContain("aDecidir");
  });
});
