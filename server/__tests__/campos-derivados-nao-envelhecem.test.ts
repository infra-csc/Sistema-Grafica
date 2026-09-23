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

// Os casos que liam o texto das rotas, do schema e do script foram trocados por
// testes que RODAM o código em medida-acompanha-dimensoes.test.ts (as três
// duplas, o PATCH, a criação, a trilha e o script do passivo).
import { describe, it, expect } from "vitest";
import { existsSync } from "fs";
import path from "path";

describe("o que o usuário lê vem do par vivo", () => {
  it("a linha do tempo antiga (item-timeline-dialog) saiu: era código morto", () => {
    // Ninguém importava o componente (21/09) — a jornada da peça mora na ficha
    // (item-details-dialog). Este teste lia o arquivo morto e o mantinha vivo;
    // agora prende que ele não volta sem alguém usá-lo.
    expect(existsSync(path.resolve(__dirname, "../../client/src/components/item-timeline-dialog.tsx"))).toBe(false);
  });
});

