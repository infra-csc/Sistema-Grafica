// ─────────────────────────────────────────────────────────────────────────────
// NENHUM CAMPO DERIVADO ENVELHECE SOZINHO.
//
// Este teste não guarda um bug: guarda uma CLASSE de bug, e é por isso que ele
// é uma lista e não uma asserção.
//
// A classe: a tabela `items` guarda o mesmo fato em mais de uma coluna. Quando
// só uma delas é atualizada, o sistema passa a ter duas respostas para a mesma
// pergunta — e a que a produção lê costuma ser a errada, porque as telas de
// quem edita mostram a coluna nova e as de quem produz mostram a velha.
//
// Duas ocorrências conhecidas, as duas descobertas pelo mesmo relato:
//
//   1. `measurement` guarda "3.95 × 2.95" como TEXTO ao lado de `file_width` e
//      `file_height`, que guardam os mesmos dois números. O m² já era
//      recalculado no servidor a cada edição — `deriveCalculatedM2` existe
//      porque "m² é grandeza de produção e não pode ser fonte-de-verdade do
//      cliente". A medida, mesmo dado pela mesma razão, não era.
//
//   2. `area`/`visual` são as colunas ORIGINAIS da medida visual;
//      `visual_width`/`visual_height` vieram depois. Quatro colunas, dois
//      números. Na criação nascem juntas; na edição o formulário manda só o par
//      novo, e o velho congela — e é `area × visual` que a linha do tempo da
//      peça imprime.
//
// O RELATO, 20/08: a peça #2472 teve as dimensões corrigidas de 3.95×2.95 para
// 7.55×2.25 às 14:36, e a gráfica continuou lendo 3.95×2.95. Não era cache nem
// atraso: era o texto da medida, que ninguém tinha reescrito, saindo na coluna
// "Medida" da planilha exportada.
//
// A REGRA, para quem for adicionar a terceira: se duas colunas guardam o mesmo
// fato, ou você as move JUNTAS no servidor, ou uma delas mente. O cliente não
// serve para isso — ele manda de volta o valor que carregou ao ABRIR o
// formulário, que é justamente o antigo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");

const rotas = ler("server/routes/items.ts");
const schema = ler("shared/schema.ts");

/**
 * AS DUPLAS CONHECIDAS.
 *
 * Cada entrada é um fato guardado em dois lugares, com a função do servidor que
 * as mantém juntas. Uma dupla sem função de derivação é uma divergência
 * esperando acontecer.
 */
const DUPLAS = [
  {
    fato: "a medida do arquivo, como texto",
    colunas: ["measurement", "file_width", "file_height"],
    derivador: "deriveMeasurement",
    lidoPor: "a coluna Medida da planilha da gráfica, a ficha da peça, a triagem e o estoque",
  },
  {
    fato: "a medida visual, no par antigo",
    colunas: ["area", "visual", "visual_width", "visual_height"],
    derivador: "derivarAreaVisual",
    lidoPor: "a linha do tempo da peça",
  },
  {
    fato: "o metro quadrado",
    colunas: ["calculated_m2", "quantity", "file_width", "file_height"],
    derivador: "deriveCalculatedM2",
    lidoPor: "o custo, o fechamento com patrocinador e a fila da gráfica",
  },
];

describe("cada dupla tem quem a mantenha junta", () => {
  it.each(DUPLAS)("$fato → $derivador", ({ colunas, derivador }) => {
    expect(
      rotas.includes(`function ${derivador}(`),
      `Não existe \`${derivador}\` em server/routes/items.ts.\n\n` +
      `As colunas ${colunas.join(", ")} guardam o mesmo fato. Sem uma função ` +
      `que as derive no servidor, editar uma delas deixa as outras para trás — ` +
      `e quem produz lê a que ficou.`,
    ).toBe(true);
    for (const c of colunas) {
      expect(schema, `a coluna ${c} sumiu do schema`).toContain(`"${c}"`);
    }
  });
});

describe("as duas derivações que faltavam", () => {
  it("a medida em texto é reescrita quando a dimensão de arquivo muda", () => {
    expect(rotas).toContain("if (medida !== undefined) updatePayload.measurement = medida;");
    // E na rota-irmã, que aceitava o texto do cliente sem olhar as dimensões.
    expect(rotas).toContain("medidaDerivada ?? (measurement !== undefined ? measurement : currentItem.measurement)");
  });

  it("o par velho anda com o par novo da medida visual", () => {
    expect(rotas).toContain("if (par) { updatePayload.area = par.area; updatePayload.visual = par.visual; }");
  });

  it("e as duas só disparam quando a dimensão MUDA", () => {
    // Derivar sempre apagaria um texto escrito à mão — "conforme croqui" — que
    // ninguém pediu para apagar. `measurement` é editável de propósito: a
    // própria coluna do schema diz "Can be edited".
    expect(rotas).toContain("function medidaMudou(");
    expect(schema).toContain("Can be edited");
  });
});

describe("o que o usuário lê vem do par vivo", () => {
  it("a linha do tempo lê visualWidth antes de area", () => {
    // Assim as peças que divergiram ANTES da correção leem certo mesmo sem
    // passar pelo script — a tela não espera o banco ser consertado.
    const tl = ler("client/src/components/item-timeline-dialog.tsx");
    expect(tl).toContain("{(item.visualWidth ?? item.area)} × {(item.visualHeight ?? item.visual)}");
    // A comparação que decide mostrar a linha "Medida" usa o MESMO par que a
    // linha acima imprime; antes media contra as colunas velhas, e bastava uma
    // envelhecer para a linha aparecer ou sumir sem nada ter mudado na peça.
    expect(tl).toContain("item.measurement !== `${item.visualWidth ?? item.area} × ${item.visualHeight ?? item.visual}`");
  });

  it("e a trilha de auditoria diz quando cada uma mudou", () => {
    // Antes as duas ficavam para trás EM SILÊNCIO: nada na trilha, nada na
    // tela. A divergência só aparecia semanas depois, na gráfica.
    expect(rotas).toContain("Medida: ${currentItem.measurement || '—'} → ${item.measurement || '—'}");
    expect(rotas).toContain("Medida visual: ${currentItem.visualWidth ?? '?'}×${currentItem.visualHeight ?? '?'}");
  });
});

describe("o passivo tem por onde ser corrigido", () => {
  const s = ler("scripts/conferir-medida-vs-dimensoes.ts");

  it("o script cobre as DUAS duplas", () => {
    expect(s).toContain("MEDIDA (texto) diferente das dimensões de arquivo");
    expect(s).toContain("AREA/VISUAL congelados fora do par visual_width/height");
  });

  it("e não escreve nada sem --aplicar", () => {
    expect(s).toContain('const APLICAR = process.argv.includes("--aplicar");');
    expect(s).toContain("Nada foi escrito.");
  });

  it("nem reescreve texto que não parece medida", () => {
    expect(s).toContain("function pareceMedida(");
    expect(s).toContain("aDecidir");
  });
});
