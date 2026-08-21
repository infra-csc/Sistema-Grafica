// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS: realizados ficam ocultos por padrão, e o risco ABERTO vem primeiro.
//
// Relato com captura: a grade abria com três cartões "REALIZADO COM PENDÊNCIAS
// · Saiu há 14d" no topo — eventos cujo caminhão já saiu — e o evento que
// embarca amanhã ficava abaixo da dobra. Duas causas, uma em cada eixo:
//
//   · O balde "Pendências" (lifecycle `realizado`) vinha LIGADO por padrão.
//     Ele não é arquivo — sobrou trabalho —, mas também não é o que a pessoa
//     abre a tela para ver. Agora o padrão é só "Ativos"; Pendências fica a
//     um clique no alternador, e a URL continua mandando.
//
//   · A ordenação punha `realizado` no balde 0, junto com marco atrasado e
//     prioridade urgente. Mas um realizado não é urgência: o caminhão já foi,
//     o que sobrou é acerto de contas. Urgente MAS ABERTO é o que dá para
//     salvar — e por isso vem primeiro. Realizado vai para o balde 2, antes
//     só do arquivo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const EV = readFileSync(path.resolve(__dirname, "../../client/src/pages/eventos.tsx"), "utf8");

describe("a visão padrão esconde os realizados", () => {
  it("só Ativos vem ligado quando a URL não diz nada", () => {
    const i = EV.indexOf("const [situacoes, setSituacoes] = useState<Set<string>>(() => {");
    const bloco = EV.slice(i, i + 300);
    expect(bloco).toContain('return new Set(["ativos"]);');
    expect(bloco).not.toContain('"pendencias"]');
  });

  it("mas Pendências continua existindo como balde — a um clique", () => {
    expect(EV).toContain("{ chave: 'pendencias'");
    expect(EV).toContain('if (v) return new Set(v.split(",").filter(Boolean));');
  });
});

describe("urgente MAS aberto vem primeiro", () => {
  const i = EV.indexOf("const sortRank = (event: any): number => {");
  const corpo = EV.slice(i, i + 500);

  it("realizado desce para o balde 2 — antes só do arquivo", () => {
    expect(corpo).toContain("if (ARCHIVED_LIFECYCLES.has(lifecycle)) return 3;");
    expect(corpo).toContain("if (lifecycle === 'realizado') return 2;");
  });

  it("marco atrasado e prioridade urgente continuam no balde 0", () => {
    expect(corpo).toContain("if (event.nextMilestone?.state === 'overdue') return 0;");
    expect(corpo).toContain("if (event.priority === 'urgente') return 0;");
  });

  it("e a ordem dos testes dentro da função garante que realizado não é promovido", () => {
    // Um realizado com marco atrasado (todos têm: o caminhão saiu) cairia no
    // balde 0 se o teste de `overdue` viesse antes do de `realizado`.
    expect(corpo.indexOf("lifecycle === 'realizado'")).toBeLessThan(corpo.indexOf("state === 'overdue'"));
  });

  it("a regra escrita diz isso", () => {
    expect(EV).toContain("'marco atrasado primeiro, depois quem embarca antes; realizados por último'");
  });
});
