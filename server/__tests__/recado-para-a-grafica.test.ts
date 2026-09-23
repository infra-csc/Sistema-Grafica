/**
 * O RECADO PARA A GRÁFICA (relato da Solicitação, 22/09)
 *
 * "Quando eu libero algo pra gráfica, aparece um campo de observação... depois
 * que eu envio, não consigo mais visualizar o que eu escrevi nesse campo."
 *
 * A Revisão Final só lista o que ainda está nela: liberada a peça, o card some
 * e o recado vai junto. Pior: uma devolução posterior grava o motivo POR CIMA
 * da observação. Este teste prende as três saídas que resolvem isso:
 *   1. a trilha guarda o TEXTO do recado (dá para reler na ficha, sempre);
 *   2. a ficha chama o campo pelo nome ("Recado para a Gráfica");
 *   3. ao liberar, o aviso oferece abrir a peça na fila da Gráfica.
 */
// A trilha com o texto do recado roda em regras-avisos-edicao-da-peca.test.ts.
import { describe, it, expect } from "vitest";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { readFileSync } from "fs";
import { join } from "path";
import { fonteDaGrafica } from "./fonte-da-grafica";
import { fonteDaRevisao } from "./fonte-das-telas-da-arte";

const raiz = join(import.meta.dirname, "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

describe("o recado escrito na Revisão Final não se perde", () => {
  it("a ficha da peça chama o campo pelo nome", () => {
    const ficha = fonteDoComponente("client/src/components/item-details-dialog.tsx");
    expect(ficha).toContain(">Recado para a Gráfica</p>");
    expect(ficha).toContain("{item.observations}");
  });

  it("ao liberar, o aviso leva à peça na fila da Gráfica", () => {
    // O aviso de liberar mora em components/revisao/use-acoes-da-revisao.tsx.
    const revisao = fonteDaRevisao();
    const trecho = revisao.slice(revisao.indexOf('title: "Liberada para a Gráfica"'));
    expect(trecho.slice(0, 600)).toContain("Ver na Gráfica");
    expect(trecho.slice(0, 600)).toContain("/grafica?item=");
  });

  it("a Gráfica mostra o recado na fila e na ficha da peça", () => {
    const grafica = fonteDaGrafica();
    expect(grafica).toContain("item.observations");
    expect(grafica).toContain("selectedItem.observations");
  });
});
