// Três furos apontados pela revisão final (22/09), pinados para não voltarem:
//  · o molde travado não pode ser marcado como produzido;
//  · reaproveitar anda a peça — a trava da Solicitação segura;
//  · evento só com moldes produzidos (e entregues) vira Concluído sozinho.
// A rota do molde e a conta do evento rodam de verdade em
// regras-fluxo-reaproveitar-e-molde.test.ts (inclusive o mark-reuse da peça
// travada); aqui ficam as telas.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("a trava da Solicitação segura também o molde e o reaproveitar", () => {
  it("o botão do molde fica desabilitado com o motivo", () => {
    const b = ler("client/src/components/grafica/acoes-do-molde.tsx");
    expect(b).toContain("const bloqueado = !!selo || ocupado || travada;");
    expect(b).toContain("title={travada ? fraseDaTrava(item)");
  });
  it("a Gráfica não oferece Reaproveitar na peça travada", () => {
    // A recusa do mark-reuse (409 com a frase da trava) RODA em
    // regras-fluxo-reaproveitar-e-molde.test.ts.
    expect(ler("client/src/pages/grafica.tsx")).toContain("const podeReaproveitarPeca = !emRevisao && !pecaTravada(item)");
  });
});
