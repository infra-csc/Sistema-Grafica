// ─────────────────────────────────────────────────────────────────────────────
// A MARCA DO CHIP TEM FORMA, E NÃO SÓ COR.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// O chip de patrocinador comunicava o estado da aprovação por cor: campo verde
// para aprovado, vermelho para reprovado, laranja para pendente, com uma marca
// de 5px do tom saturado. Simulando deuteranopia sobre os três, os FUNDOS
// colapsam:
//
//   aprovado  #f0fdf4 → #f5f4f7
//   reprovado #fef2f2 → #fafaf2
//   pendente  #fff7ed → #fcfdf0
//
// Três quase-brancos indistinguíveis — 0,014 de diferença de luminância entre
// dois deles. Sobrava a marca de 5px carregando a distinção inteira, e ela era
// um círculo nos três casos. Ou seja: a única pista visual era a MATIZ, que é
// exatamente o que a WCAG 1.4.1 proíbe como canal único.
//
// O rótulo `sr-only` já existia e resolvia para leitor de tela. Quem enxerga e
// tem daltonismo não tinha nada.
//
// Forma sobrevive a qualquer deficiência de cor e custa ZERO largura — o que
// importa aqui, porque 51% dos nomes de patrocinador já truncam na coluna.
//
// A regra que fica: quando a cor carrega significado, ela precisa de um
// segundo canal. Aqui o canal é a forma, porque era o único que cabia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const chips = readFileSync(path.resolve(__dirname, "../../client/src/components/sponsor-chips.tsx"), "utf8");
const status = readFileSync(path.resolve(__dirname, "../../client/src/lib/status.ts"), "utf8");

describe("o estado da aprovação tem um segundo canal", () => {
  it("a forma da marca depende do tom, não só a cor", () => {
    expect(chips).toContain('borderRadius: ap?.tone === "rejected" || ap?.tone === "rework" ? 1 : "50%"');
  });

  it("o estado sem decisão é vazado, e não preenchido", () => {
    // Cheio x vazado é a distinção que separa "já decidiram" de "ainda não" —
    // e ela funciona em preto e branco.
    expect(chips).toContain('background: ap?.tone === "waiting" ? "transparent"');
    expect(chips).toContain('border: ap?.tone === "waiting" ?');
  });

  it("a marca é grande o bastante para a forma se ler", () => {
    // A 5px redondo e quadrado são o mesmo borrão. 6 é o mínimo em que a
    // diferença aparece.
    expect(chips).toContain("width: 6, height: 6");
  });

  it("o rótulo textual para leitor de tela continua lá", () => {
    // A forma é para quem enxerga; o texto é para quem não vê a tela. Os dois
    // canais servem gente diferente e nenhum substitui o outro.
    expect(chips).toContain("<span style={SR_ONLY}>{` — ${ap.label}`}</span>");
  });
});

describe("o vocabulário de tons cobre as formas usadas", () => {
  it("existem os tons que o chip consulta", () => {
    // Se um tom for renomeado em status.ts sem passar aqui, a forma volta
    // silenciosamente ao círculo padrão e o segundo canal some sem aviso.
    for (const tom of ["approved", "rejected", "rework", "waiting"]) {
      expect(status).toContain(`tone: "${tom}"`);
    }
  });
});
