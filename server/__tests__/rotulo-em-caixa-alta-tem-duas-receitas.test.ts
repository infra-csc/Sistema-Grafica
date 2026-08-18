// ─────────────────────────────────────────────────────────────────────────────
// DUAS RECEITAS DE RÓTULO EM CAIXA-ALTA, E NÃO SETE.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O Painel Geral tinha SETE combinações de tamanho/peso/tracking para o mesmo
// papel — o micro-rótulo em caixa-alta:
//
//   10/900/0.12em (5×)   10/800/0.08em (4×)   10/800/0.06em (4×)
//   11/800/0.08em (1×)   10/900/0.08em (1×)   10/800/.08em  (1×)
//   10/700/0.07em (1×)
//
// Três pesos, quatro trackings, dois tamanhos — sem nenhuma regra que os
// separasse. Um deles ainda escrevia ".08em" onde os outros escrevem "0.08em":
// o mesmo valor grafado de dois jeitos, que é o sintoma mais claro de que não
// havia sistema, e sim acúmulo.
//
// A distinção que SOBREVIVE é uma só, e é real:
//
//   FAIXA (10/900/0.12em) — rotula uma região inteira: as zonas ENTRADA ·
//   APROVAÇÃO · PRODUÇÃO & ENTREGA, o "PRECISA DE ATENÇÃO". Tracking largo
//   porque é lido de longe, no escaneamento, longe do conteúdo que nomeia.
//
//   MICRO (10/800/0.08em) — rotula um dado dentro de um componente: o nome do
//   card, o selo, a coluna. Fica colado no que nomeia, então não precisa do
//   mesmo alarde.
//
// A regra que fica: peso e tracking diferentes têm de significar coisas
// diferentes. Quando não significam, o que a tela comunica não é hierarquia —
// é a ordem em que as partes dela foram escritas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const painel = readFileSync(path.resolve(__dirname, "../../client/src/pages/painel-geral.tsx"), "utf8");

/** Toda receita de rótulo em caixa-alta declarada na tela. */
function receitas(): Map<string, number> {
  const re = /fontSize: (\d+), fontWeight: (\d+), textTransform: "uppercase", letterSpacing: "([\d.]+em)"/g;
  const m = new Map<string, number>();
  for (const [, size, peso, track] of painel.matchAll(re)) {
    const k = `${size}/${peso}/${track}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

describe("o rótulo em caixa-alta tem sistema", () => {
  it("existem no máximo três receitas, e as duas principais são as do sistema", () => {
    const r = receitas();
    expect(r.size).toBeLessThanOrEqual(3);
    expect(r.get("10/800/0.08em")).toBeGreaterThan(0); // micro
    expect(r.get("10/900/0.12em")).toBeGreaterThan(0); // faixa
  });

  it("o micro-rótulo é o mais usado — é a receita padrão", () => {
    const r = receitas();
    const maior = [...r.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(maior[0]).toBe("10/800/0.08em");
  });

  it("as receitas intermediárias não voltaram", () => {
    const r = receitas();
    // Cada uma dessas existia e não distinguia nada de nada.
    for (const morta of ["10/800/0.06em", "10/900/0.08em", "10/700/0.07em"]) {
      expect(r.get(morta)).toBeUndefined();
    }
  });

  it("nenhum tracking é escrito sem o zero à esquerda", () => {
    // ".08em" e "0.08em" são o mesmo valor. Duas grafias do mesmo número é
    // como a sétima receita nasceu.
    expect(painel).not.toMatch(/letterSpacing: "\.\d+em"/);
  });
});
