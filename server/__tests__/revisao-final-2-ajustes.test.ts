// Três furos apontados pela revisão final (22/09), pinados para não voltarem:
//  · o molde travado não pode ser marcado como produzido;
//  · reaproveitar anda a peça — a trava da Solicitação segura;
//  · evento só com moldes produzidos (e entregues) vira Concluído sozinho.
// A rota do molde e a conta do evento rodam de verdade em
// regras-fluxo-reaproveitar-e-molde.test.ts; aqui ficam as telas (e o
// mark-reuse, que se confere junto com a tela da Gráfica).
import { describe, it, expect } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

describe("a trava da Solicitação segura também o molde e o reaproveitar", () => {
  it("o botão do molde fica desabilitado com o motivo", () => {
    const b = ler("client/src/components/grafica/acoes-do-molde.tsx");
    expect(b).toContain("const bloqueado = !!selo || ocupado || travada;");
    expect(b).toContain("title={travada ? fraseDaTrava(item)");
  });
  it("mark-reuse recusa peça travada e a Gráfica não oferece Reaproveitar", () => {
    const rota = fonteDasRotasDeItens();
    const i = rota.indexOf('"/api/items/:id/mark-reuse"');
    expect(rota.slice(i, i + 2500)).toContain("if (pecaTravada(current as any)) return res.status(409)");
    expect(ler("client/src/pages/grafica.tsx")).toContain("const podeReaproveitarPeca = !emRevisao && !pecaTravada(item)");
  });
});
