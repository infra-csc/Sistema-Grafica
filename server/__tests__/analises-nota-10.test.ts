// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES nota 10 — três mudanças.
//
//  1. A VARIAÇÃO DIZ QUANDO É RUÍDO. A tela afirmava "+3,2 p.p." com a mesma
//     convicção sobre 357 peças e sobre 9. Variação em amostra pequena não é
//     tendência: é sorte de amostra — e num painel que existe para embasar
//     decisão, esse é o defeito mais caro, porque não parece defeito.
//  2. CADA NÚMERO LEVA ÀS PEÇAS. "Retrabalho 11,2%" é o dado mais acionável da
//     tela e terminava em si mesmo.
//  3. O GRÁFICO APONTA ONDE VAI ESTOURAR. Ele desenhava demanda, concluído e a
//     média, e deixava a conclusão para o olho — em 21 barras, comparar oito
//     futuras contra uma tracejada é trabalho manual.
//
// As DUAS decisões de negócio foram confirmadas com o dono antes (24/08): o
// piso da amostra é 30, e os filtros que faltavam foram criados no Painel Geral
// em vez de mandar o clique para uma lista que não responde.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const A = ler("client/src/pages/dashboard-analises.tsx");
const PAINEL = ler("client/src/pages/painel-geral.tsx");

describe("1 · a variação diz quando é ruído", () => {
  it("o piso é 30 e vale a MENOR das duas janelas", () => {
    expect(A).toContain("export const PISO_AMOSTRA = 30;");
    expect(A).toContain("const menor = Math.min(atual, anterior);");
    expect(A).toContain("if (menor >= PISO_AMOSTRA) return null;");
    // comparar 300 contra 8 é tão frágil quanto 8 contra 8
    expect(A).toContain("Vale a");
  });

  it("o selo QUALIFICA a variação, não a esconde", () => {
    const i = A.indexOf("<SeloVariacao v={v} sufixo={sufixoVariacao} />");
    expect(i).toBeGreaterThan(-1);
    expect(A.slice(i, i + 120)).toContain("{selo}");
    expect(A).toContain("amostra pequena · pode ser ruído");
  });

  it("a dica diz o NÚMERO, não só que é pouco", () => {
    expect(A).toContain("qualJanela} só ${int(menor)}");
    expect(A).toContain("abaixo de ${PISO_AMOSTRA} a variação oscila por acaso e não indica tendência.");
  });

  it("usa o denominador que cada KPI já usa", () => {
    expect(A).toContain("amostra: atual.prazoAvaliadas,");
    expect(A).toContain("amostra: atual.cicloAmostra,");
    expect(A).toContain("amostra: atual.pecasTotal,");
    expect(A).toContain("amostraAnterior: anterior?.prazoAvaliadas,");
  });

  it("contraste do selo: #92400e sobre #fffbeb = 6,6:1", () => {
    expect(A).toContain('color: "#92400e", backgroundColor: "#fffbeb", border: "1px solid #fde68a"');
  });
});

describe("2 · cada número leva às peças que o compõem", () => {
  it("os três KPIs acionáveis têm link, e o volume NÃO tem", () => {
    for (const t of ["link-kpi-prazo", "link-kpi-ciclo", "link-kpi-retrabalho"]) {
      expect(A).toContain(`testId: "${t}"`);
    }
    // m² é uma SOMA, não uma lista de exceções.
    expect(A).toContain("// Sem link: m² é uma SOMA, não uma lista de exceções.");
    expect(A).toContain("link: null,");
  });

  it("o link só existe quando há o que ver", () => {
    expect(A).toContain("link: atual.prazoAvaliadas > atual.prazoNoPrazo");
    expect(A).toContain("link: atual.retrabalhoPecas > 0");
    expect(A).toContain("link: atual.cicloAmostra > 0");
  });

  it("o recorte viaja — menos o período, que mediria outra coisa", () => {
    expect(A).toContain("const recorteNoLink = (extra: Record<string, string>) => {");
    expect(A).toContain('if (eventFilter !== "all") q.set("evento", eventFilter);');
    expect(A).toContain('if (sponsorFilter !== "all") q.set("patrocinador", sponsorFilter);');
    expect(A).toContain("O PERÍODO não vai");
  });

  it("o clique navega como o resto da tela, e ctrl+clique continua abrindo em outra aba", () => {
    expect(A).toContain("aoNavegar={setLocation}");
    expect(A).toContain("if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;");
  });

  it("O DESTINO SABE FILTRAR — os focos foram criados no Painel Geral", () => {
    // A regra do prompt: nenhum link pode levar a uma lista que não responde ao
    // clique. Nenhuma tela filtrava por isso, então os filtros foram criados.
    expect(PAINEL).toContain('f === "retrabalho" ? temRefacao(item as any)');
    expect(PAINEL).toContain('f === "fora-do-prazo" ? entregueForaDoPrazo(item)');
    expect(PAINEL).toContain('sortBy === "ciclo"');
  });

  it("e usa a MESMA definição da Análise, importada — não uma cópia", () => {
    // Se cada tela tivesse a sua regra, a lista desmentiria o número que a
    // abriu. `temRefacao` e `isDelivered` vêm das libs da Análise.
    expect(PAINEL).toContain('import { temRefacao } from "@/lib/analises-desempenho";');
    expect(PAINEL).toContain('import { isDelivered } from "@/lib/analises-status";');
    // e o `<=` do prazo é o mesmo: entregar NO dia da saída é no prazo
    expect(PAINEL).toContain("return d.getTime() > truckDayMs;");
  });
});

describe("3 · o gráfico aponta onde vai estourar", () => {
  it("só semanas FUTURAS entram, e só quando há régua", () => {
    expect(A).toContain("const semanasQueEstouram = temMedia");
    expect(A).toContain("? dadosCarga.filter((d) => d.futura && d.demanda > (carga.mediaConcluidoM2 as number))");
    expect(A).toContain(": [];");
    // sem média não há faixa nenhuma
    expect(A).toContain("{temMedia && !cargaVazia && (");
  });

  it("a faixa NOMEIA as semanas e soma o excedente", () => {
    expect(A).toContain('data-testid="faixa-estouro-capacidade"');
    expect(A).toContain("semanas previstas passam da capacidade:");
    expect(A).toContain("{semanasQueEstouram.map((d) => d.label).join(\", \")}");
    expect(A).toContain("Somam {int(excedenteTotal)} m² acima da média de");
    expect(A).toContain("Antecipar produção nas semanas vizinhas é mais barato que estourar o prazo.");
  });

  it("sem estouro, a faixa afirma isso — em verde, com a conta", () => {
    expect(A).toContain("Nenhuma semana prevista passa da capacidade");
    expect(A).toContain("semanas à frente cabem");
  });

  it("o gráfico marca as MESMAS semanas que a faixa nomeia", () => {
    expect(A).toContain("const rotulosQueEstouram = new Set(semanasQueEstouram.map((d) => d.label));");
    expect(A).toContain('stroke={rotulosQueEstouram.has(d.label) ? "#b45309" : "none"}');
    expect(A).toContain("strokeWidth={rotulosQueEstouram.has(d.label) ? 1.5 : 0}");
  });

  it("contraste do texto miúdo: #78350f e #14532d", () => {
    expect(A).toContain('color: "#78350f"');
    expect(A).toContain('color: "#14532d"');
  });
});

describe("o que NÃO podia mudar continua de pé", () => {
  it("nenhum número entra sozinho, e a variação é julgada pela cor", () => {
    expect(A).toContain("/** Denominador ou amostra. Regra da tela: nenhum número entra sozinho. */");
    expect(A).toContain("peças entregues chegaram até a saída do caminhão");
    expect(A).not.toContain("▲");
  });

  it("o bloco de carga ignora o filtro de período, de propósito", () => {
    expect(A).toContain("mediaConcluidoM2");
    expect(A).toContain("const cargaVazia = dadosCarga.every((d) => d.demanda === 0 && !d.concluido);");
  });

  it("semana futura tem concluído nulo, e a série nula é filtrada do tooltip", () => {
    expect(A).toContain("concluido: s.concluidoM2 == null ? null : Math.round(s.concluidoM2),");
    expect(A).toContain("const series = payload.filter((p: any) => p?.value != null);");
  });

  it("os testids da tela continuam", () => {
    for (const t of ["kpi-prazo", "kpi-ciclo", "kpi-retrabalho", "kpi-m2", "btn-clear-filters", "recorte-analises"]) {
      expect(A).toContain(t);
    }
  });
});
