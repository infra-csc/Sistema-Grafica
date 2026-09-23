// ─────────────────────────────────────────────────────────────────────────────
// REAPROVEITAR APÓS "PRODUZIDO" (pedido do dono, 27/08): "reaproveitar pode
// mudar a quantidade mesmo após produzido, mas só usuário de solicitação e
// admin".
//
// O vão que existia: peça fechada como Produzido SEM reaproveitamento não
// tinha ação nenhuma — o botão Reaproveitar some (`!isProduced`) e o
// "Corrigir reaprov." exige reaproveitamento já marcado. Quem descobria
// depois que as unidades vieram do estoque não tinha como registrar.
//
// A SEMÂNTICA da via nova é CONVERSÃO, não retrabalho: n unidades saem de
// "produzidas" e entram em "reaproveitadas"; produzido + reaproveitado segue
// somando a quantidade da peça e o status continua "Produzido". Nada volta
// para a fila da Gráfica — é disso que a metragem (m2ToProduce) e o custo
// leem a diferença.
//
// A ROTA (quem, quando, a conta e a trilha) roda de verdade em
// regras-fluxo-reaproveitar-e-molde.test.ts; aqui fica a tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { fonteDaGrafica } from "./fonte-da-grafica";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const GRAFICA = fonteDaGrafica();

describe("a tela da Gráfica espelha o servidor", () => {
  it("o botão aparece em peça Produzida só para quem pode (podeMexerQtd = admin|solicitacao)", () => {
    expect(GRAFICA).toContain("(!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0)");
    // o gate é o MESMO das outras mexidas de quantidade — não canProduce
    expect(GRAFICA).toContain("const podeMexerQtd = podeMexerNaQuantidade(user?.role);");
  });

  it("após Produzido o campo vira ajuste ABSOLUTO (0..quantidade), abrindo no valor atual", () => {
    // abre pré-preenchido com o total reaproveitado de hoje — quem ajusta
    // parte do que está lá, não de um chute
    expect(GRAFICA).toContain("setReuseQty(isProduced(item) ? reusedTotalOf(item) : tetoReaproveitar(item));");
    expect(GRAFICA).toContain("min={isProduced(item) ? 0 : 1}");
    expect(GRAFICA).toContain("max={isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}");
    // e manda o TOTAL, não a soma
    expect(GRAFICA).toContain("? { itemId: item.id, reuseTotal: reuseQty }");
    // o title conta a semântica das duas direções para quem clica
    expect(GRAFICA).toContain("converte entre produzidas e reaproveitadas, nas duas direções");
  });

  it("conferida ou entregue, o botão some — mesma tranca do servidor", () => {
    const bloco = GRAFICA.slice(GRAFICA.indexOf("(!isProduced(item) ? tetoReaproveitar(item) > 0") - 200);
    expect(bloco.slice(0, 260)).toContain("!isDelivered(item) && !isPosConferencia(item)");
  });
});
