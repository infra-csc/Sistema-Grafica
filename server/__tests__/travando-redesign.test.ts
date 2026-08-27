// ─────────────────────────────────────────────────────────────────────────────
// "QUEM ESTÁ TRAVANDO", segunda forma (dono, 26/08: "design péssimo, tem que
// melhorar desses patrocinadores").
//
// A primeira versão despejava TODAS as marcas com aprovação pendente como
// chips de peso igual — 40+ em produção, uma parede sem hierarquia. O que a
// segunda forma fixa: só as piores à vista, gravidade vestida no chip inteiro,
// e um resumo que dá o tamanho do problema sem contar chip por chip.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ARTE = readFileSync(path.resolve(__dirname, "../../client/src/pages/arte.tsx"), "utf8");

describe("só os piores à vista", () => {
  it("o teto existe e a lista corta nele (a ordenação já é espera ↓, peças ↓)", () => {
    expect(ARTE).toContain("const TRAVANDO_CHIPS_VISIBLE = 8;");
    expect(ARTE).toContain("travando.slice(0, TRAVANDO_CHIPS_VISIBLE)");
    // a ordenação que faz o corte significar "os piores"
    expect(ARTE).toContain("sort((a, b) => b.espera - a.espera || b.pecas - a.pecas)");
  });

  it("o resto fica atrás de '+ N outras', com volta ('Mostrar menos')", () => {
    expect(ARTE).toContain('data-testid="button-travando-todas"');
    expect(ARTE).toContain("setShowAllTravando(v => !v)");
    expect(ARTE).toContain("'Mostrar menos'");
  });

  it("o chip LIGADO nunca se esconde atrás do corte — ele carrega o caminho de volta", () => {
    expect(ARTE).toContain("const ligadoFora = sponsorFilter.length === 1 && !corte.some(t => t.id === sponsorFilter[0])");
    expect(ARTE).toContain("return ligadoFora ? [...corte, ligadoFora] : corte;");
  });
});

describe("a gravidade veste o chip inteiro", () => {
  it("a régua é a MESMA de tomDaIdade: ≥14d gargalo, 7–13d atenção, <7d rotina", () => {
    const pele = ARTE.slice(ARTE.indexOf("const pele = (espera: number, ligado: boolean)"));
    expect(pele.slice(0, 500)).toContain("if (espera >= 14) return { bg: '#fef2f2'");
    expect(pele.slice(0, 500)).toContain("if (espera >= 7) return { bg: '#fffbeb'");
    // ligado continua soberano: chip escuro, seja qual for a idade
    expect(pele.slice(0, 500)).toContain("if (ligado) return { bg: '#1c1917'");
  });
});

describe("o cabeçalho resume a conta", () => {
  it("N marcas seguram M aprovações — e a espera mais antiga", () => {
    expect(ARTE).toContain('data-testid="travando-resumo"');
    expect(ARTE).toContain("const pendencias = travando.reduce((s, t) => s + t.pecas, 0);");
    expect(ARTE).toContain("a mais antiga espera há ${travando[0].espera}d");
  });

  it("o que os testes antigos fixavam continua de pé: faixa, chips e filtro por clique", () => {
    expect(ARTE).toContain('data-testid="faixa-travando"');
    expect(ARTE).toContain("data-testid={`chip-travando-${t.id}`}");
    expect(ARTE).toContain("setSponsorFilter(ligado ? [] : [t.id])");
  });
});
