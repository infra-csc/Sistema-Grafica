// ─────────────────────────────────────────────────────────────────────────────
// O que sobrou da "Análises nota 10" (24/08): os focos que foram CRIADOS no
// Painel Geral para que cada número da antiga aba de desempenho levasse às
// peças. A aba saiu em 16/10 (a Análises virou o Painel operacional da
// gráfica), mas os focos continuam no Painel Geral — e continuam lendo a régua
// de retrabalho da lib, não uma cópia.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";

const PAINEL = fonteDaTela("painel");

describe("os focos do Painel Geral", () => {
  it("existem e filtram de verdade", () => {
    expect(PAINEL).toContain('f === "retrabalho" ? temRefacao(item)');
    expect(PAINEL).toContain('f === "fora-do-prazo" ? entregueForaDoPrazo(item)');
    expect(PAINEL).toContain('sortBy === "ciclo"');
  });

  it("e usam a régua importada — não uma cópia", () => {
    expect(PAINEL).toContain('import { temRefacao } from "@/lib/analises-desempenho";');
    expect(PAINEL).toContain('import { isDelivered } from "@/lib/analises-status";');
    // e o `<=` do prazo é o mesmo: entregar NO dia da saída é no prazo
    expect(PAINEL).toContain("return d.getTime() > truckDayMs;");
  });
});
