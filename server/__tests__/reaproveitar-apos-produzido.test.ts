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
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ITEMS = ler("server/routes/items.ts");
const GRAFICA = ler("client/src/pages/grafica.tsx");

/** O corpo da rota mark-reuse, isolado. */
const rota = (() => {
  const i = ITEMS.indexOf('app.post("/api/items/:id/mark-reuse"');
  expect(i).toBeGreaterThan(-1);
  return ITEMS.slice(i, ITEMS.indexOf('app.post("/api/items/:id/correct-reuse"'));
})();

describe("quem pode, e quando", () => {
  it("após Produzido, só Solicitação e admin — a Gráfica ouve o porquê", () => {
    expect(rota).toContain('const ehProduzida = current.status === "produced" || current.status === "produzido";');
    expect(rota).toContain('&& ((req as any).userRole === "admin" || (req as any).userRole === "solicitacao");');
    // a Gráfica (que passa no gate de papel da rota) recebe recusa COM motivo,
    // não o erro genérico de status
    expect(rota).toContain("mudar o reaproveitamento agora é da Solicitação e do admin");
  });

  it("conferida ou entregue, acabou — o número virou contagem física", () => {
    expect(rota).toContain('if (viaProduzida && (current.conferredQty || 0) > 0) {');
    expect(rota).toContain('if (viaProduzida && (current.deliveredQty || 0) > 0) {');
  });

  it("o fluxo normal não mudou: fora de Produzido a régua é a mesma de antes", () => {
    expect(rota).toContain('if (!allowedStatuses.includes(current.status) && !viaProduzida) {');
    expect(rota).toContain("? current.quantity - alreadyReused");
    expect(rota).toContain(": current.quantity - alreadyReused - produced;");
  });
});

describe("a conversão fecha a conta", () => {
  it("o que vira reuso SAI do produzido — os dois números seguem somando a quantidade", () => {
    expect(rota).toContain("...(viaProduzida ? { quantityProduced: current.quantity - newReuse } : {}),");
    // e o status segue Produzido (a via produzida sempre está 'pronta')
    expect(rota).toContain("const isReady = viaProduzida || newReuse + produced >= current.quantity;");
  });

  it("a trilha explica que foi conversão, com os dois lados da conta", () => {
    expect(rota).toContain("Reaproveitamento após Produzido");
    expect(rota).toContain("convertida(s) de produzida(s) para reaproveitada(s)");
  });
});

describe("a tela da Gráfica espelha o servidor", () => {
  it("o botão aparece em peça Produzida só para quem pode (podeMexerQtd = admin|solicitacao)", () => {
    expect(GRAFICA).toContain("(!isProduced(item) || podeMexerQtd) && tetoReaproveitar(item) > 0");
    // o gate é o MESMO das outras mexidas de quantidade — não canProduce
    expect(GRAFICA).toContain("const podeMexerQtd = podeMexerNaQuantidade(user?.role);");
  });

  it("o teto muda de significado após Produzido: converte o que ainda não é reuso", () => {
    expect(GRAFICA).toContain("isProduced(item) ? Math.max(0, qtyOf(item) - reusedTotalOf(item)) : remainingReuse(item);");
    // e o title conta a semântica para quem clica
    expect(GRAFICA).toContain("Reaproveitar após Produzido — converte produzidas em reaproveitadas");
  });

  it("conferida ou entregue, o botão some — mesma tranca do servidor", () => {
    const bloco = GRAFICA.slice(GRAFICA.indexOf("(!isProduced(item) || podeMexerQtd)") - 200);
    expect(bloco.slice(0, 260)).toContain("!isDelivered(item) && !isConferred(item)");
  });
});
