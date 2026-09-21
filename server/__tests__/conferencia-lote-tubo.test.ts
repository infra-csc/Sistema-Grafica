// ─────────────────────────────────────────────────────────────────────────────
// CONFERÊNCIA EM LOTE — sem tubo (dono, 21/09: "o tubo só na hora de embalar;
// tire da conferência"). Até 14/09 o dialog do lote escolhia o tubo e as
// conferidas entravam nele; agora conferir é só conferir com uma foto, e o
// tubo entra depois, pelo "Embalar" da peça (ou "Embalar em lote" — ver
// embalar-na-fila.test.ts).
//
// O que este arquivo pina:
//   · a barra do lote não diz mais "Sel. 1" (lia como "1 selecionada" com nada
//     selecionado, e o Confirmar parecia quebrado);
//   · o dialog e o handler da conferência em lote NÃO falam de tubo;
//   · o toast final aponta o próximo passo: embalar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const GRAFICA = readFileSync(path.resolve(__dirname, "../../client/src/pages/grafica.tsx"), "utf8");

describe("a barra do lote", () => {
  it("diz 'Selecionar todas (N)' e explica o que tocar", () => {
    expect(GRAFICA).toContain("`Selecionar todas (${bulkEligibleList.length})`");
    expect(GRAFICA).not.toContain("`Sel. ${bulkEligibleList.length}`");
    expect(GRAFICA).toContain("'Toque nas peças em acabamento para conferir'");
  });
});

describe("o dialog da conferência em lote", () => {
  const dialog = GRAFICA.slice(GRAFICA.indexOf("function BulkActionDialog("), GRAFICA.indexOf("export default function"));

  it("não escolhe tubo nem avisa de entrega por tubo", () => {
    expect(dialog).not.toContain('data-testid="seletor-tubo-lote"');
    expect(dialog).not.toContain('data-testid="aviso-entrega-por-tubo"');
    expect(dialog).not.toContain("tubosAbertos");
    expect(GRAFICA).not.toContain("tubo={{");
  });
});

describe("ao confirmar", () => {
  const handler = GRAFICA.slice(GRAFICA.indexOf("const handleBulkConference = async"), GRAFICA.indexOf("const handleBulkDelivery = async"));

  it("só confere: nenhuma chamada às rotas de tubo", () => {
    expect(handler).not.toContain("/tubos");
    expect(handler).not.toContain("tuboDoLote");
    expect(handler).not.toContain("porEvento");
  });

  it("o toast final aponta o próximo passo: embalar", () => {
    expect(handler).toContain("Agora é embalar: o botão Embalar da peça (ou Embalar em lote) escolhe o tubo.");
  });
});
