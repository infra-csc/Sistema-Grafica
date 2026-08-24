// ─────────────────────────────────────────────────────────────────────────────
// ATENDIMENTO nota 10 — quatro mudanças na aba Pendentes e três no Histórico.
//
// PENDENTES
//  1. QUEM FALTA, POR NOME. O card dizia "2 de 3 responderam" e não dizia quem
//     — e o nome é o que permite ir atrás da resposta. Descobrir exigia abrir o
//     modal de cada peça.
//  2. A ORDEM DECLARADA. A lista sempre teve uma ordem (por evento, e por tipo
//     dentro do grupo) e a tela nunca disse isso: ninguém entende por que uma
//     peça é a terceira, nem tem como pedir outra ordem quando a pergunta muda.
//  3. A FILA ALCANÇÁVEL. A fila de decisão existia só DENTRO do modal; para
//     entrar nela era preciso caçar a primeira peça na lista.
//  4. O STATUS NO CARD. O tipo já carregava o status e o card não o mostrava.
//
// HISTÓRICO
//  5. UMA LEITURA, não duas: a trilha de marcos (datas) e o pipeline de 10
//     etapas (posição) contavam a mesma história empilhadas.
//  6. O TEMPO CALCULADO. "Criado 04/08 → Todos aprovaram 13/08" obrigava a
//     contar nove dias de cabeça.
//  7. ORDENAR PELAS MAIS DEMORADAS — numa tela de auditoria a duração é a
//     pergunta, e só dava para ordenar por data.
//
// O BOTÃO "COBRAR" da mudança 1 NÃO foi implementado, e está registrado por quê
// no próprio teste, abaixo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const A = ler("client/src/pages/atendimento.tsx");

describe("1 · quem falta responder, por nome", () => {
  it("a lista de quem falta sai dos vínculos e das decisões, não de um contador", () => {
    expect(A).toContain("const quemFalta = (item: any): string[] => {");
    expect(A).toContain('return !st || st === "pending" || st === "new_version_pending";');
  });

  it("a frase muda com a quantidade — um, dois, ou dois e mais N", () => {
    expect(A).toContain("if (nomes.length === 1) return `falta ${nomes[0]}`;");
    expect(A).toContain("if (nomes.length === 2) return `faltam ${nomes[0]} e ${nomes[1]}`;");
    expect(A).toContain("return `faltam ${nomes[0]}, ${nomes[1]} e mais ${nomes.length - 2}`;");
  });

  it("a linha da situação usa os nomes, e cai no contador só se não houver nome", () => {
    expect(A).toContain("const quemFaltaAqui = quemFalta(item);");
    expect(A).toContain("quemFaltaAqui.length > 0 ? fraseDeQuemFalta(quemFaltaAqui) : `${responderam} de ${approvals.length} responderam`");
  });

  it("NÃO há botão de cobrar — decisão do dono (24/08)", () => {
    // O prompt pedia um botão "Cobrar" ao lado dos nomes. A cobrança existe
    // (POST /api/prazos/cobrancas), mas é `requireRole("admin")` e o dono disse
    // que não está sendo usada — um botão que 403 para os 18 usuários de
    // Atendimento seria pior que nenhum. A metade que vale (dizer QUEM falta)
    // ficou; a outra espera a cobrança virar coisa de verdade.
    expect(A).not.toContain('data-testid={`button-cobrar-');
    expect(A).not.toContain("/api/prazos/cobrancas");
  });
});

describe("2 · a ordem declarada e trocável", () => {
  it("as três ordens existem, com a regra escrita ao lado", () => {
    expect(A).toContain('type OrdemPendentes = "prazo" | "mesa" | "evento";');
    expect(A).toContain('prazo: "vencidos primeiro, depois quem vence antes"');
    expect(A).toContain('mesa: "o que espera decisão sua no topo"');
    expect(A).toContain('evento: "ordem alfabética"');
    expect(A).toContain("{ORDEM_REGRA[ordemPendentes]}");
    for (const v of ["prazo", "mesa", "evento"]) {
      expect(A).toContain(`toggle-ordem-${"${valor}"}`.replace("${valor}", "")); // testid é template
    }
    expect(A).toContain("data-testid={`toggle-ordem-${valor}`}");
  });

  it("a lista E a fila usam o MESMO comparador — senão 'Próxima peça' desencontra da tela", () => {
    expect(A).toContain("const comparaPecas = useCallback((a: any, b: any) => {");
    expect((A.match(/\[\.\.\.pendingGroup\]\.sort\(comparaPecas\)/g) ?? []).length).toBe(2);
  });

  it("o agrupamento por evento continua — a ordem decide a sequência dos grupos", () => {
    expect(A).toContain("const pesoDoEvento = useCallback((eventId: string, pecas: any[]) => {");
    expect(A).toContain("// Sem marco não é \"no prazo\": é desconhecido, e vai para o fim.");
    expect(A).toContain("return wa.num - wb.num || COLLATOR.compare(wa.chave, wb.chave);");
  });

  it("o recorte vive na URL, como nas outras telas", () => {
    expect(A).toContain('const o = new URLSearchParams(window.location.search).get("ordem");');
    expect(A).toContain('if (ordemPendentes !== "prazo") p.set("ordem", ordemPendentes); else p.delete("ordem");');
  });
});

describe("3 · a fila alcançável da lista", () => {
  it("o botão abre a primeira peça que espera decisão sua", () => {
    expect(A).toContain('data-testid="button-fila-decisao"');
    expect(A).toContain("onClick={() => { setSelectedItem(filaDaSuaMesa[0]); setDialogOpen(true); }}");
    expect(A).toContain("const filaDaSuaMesa = useMemo(");
    expect(A).toContain('situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao"');
  });

  it("some quando não há nada esperando — botão que não faz nada é ruído", () => {
    expect(A).toContain("{filaDaSuaMesa.length > 0 && (");
  });
});

describe("4 · o status no card", () => {
  it("ponto de 6px + rótulo, com o title dizendo o que aquilo significa", () => {
    expect(A).toContain("data-testid={`selo-status-${item.id}`}");
    expect(A).toContain("é daqui que ela sai quando a decisão que falta chegar");
    expect(A).toContain("const meta = getStatusMeta(item.status);");
    // tons canônicos de lib/status, não hex inventado na tela
    expect(A).toContain("backgroundColor: meta.bg, border: `1px solid ${meta.border}`");
  });
});

describe("5 e 6 · a jornada, uma vez só e com o tempo calculado", () => {
  it("as datas de cada etapa saem dos carimbos do próprio fluxo", () => {
    expect(A).toContain("const DATA_DA_ETAPA: Record<string, (i: any) => string | null | undefined> = {");
    for (const campo of ["i.createdAt", "i.approvalThumbUpdatedAt", "i.sponsorApprovedAt", "i.approvedAt", "i.producedAt"]) {
      expect(A).toContain(campo);
    }
    // etapa sem carimbo aparece sem data, em vez de receber uma estimativa
    expect(A).toContain("' · sem carimbo de data'");
  });

  it("o intervalo entre etapas é calculado, e o tom sobe com a demora", () => {
    expect(A).toContain("function tomDoIntervalo(dias: number): string {");
    expect(A).toContain("return dias >= 14 ? '#b91c1c' : dias >= 7 ? '#b45309' : '#57534e';");
    expect(A).toContain("+{e.desdeAnterior}d");
  });

  it("o número da direita muda de significado conforme a peça esteja em curso ou fechada", () => {
    expect(A).toContain("data-testid={`text-duracao-${item.id}`}");
    expect(A).toContain("{j.concluida ? 'no total' : 'nesta etapa'}");
    expect(A).toContain("? (primeira !== null && ultima !== null ? Math.round((ultima - primeira) / DIA_MS) : null)");
    expect(A).toContain(": (ultima !== null ? Math.max(0, Math.round((agora - ultima) / DIA_MS)) : null);");
  });

  it("é UMA faixa: a trilha de marcos e o pipeline separado deixaram de existir", () => {
    expect(A).toContain("data-testid={`faixa-jornada-${item.id}`}");
    expect(A).not.toContain("timelineMilestones");
    expect(A).not.toContain("{/* ── Pipeline de fluxo");
    // a etapa atual tem o anel; a cumprida, a tinta
    expect(A).toContain("boxShadow: e.ehAtual ? '0 0 0 3px rgba(251,146,60,0.25)' : 'none'");
    expect(A).toContain("background: e.cumprida || e.ehAtual ? '#c2410c' : '#e7e5e4'");
  });
});

describe("7 · ordenar o histórico pelas mais demoradas", () => {
  it("as três ordens existem, com a regra ao lado", () => {
    expect(A).toContain('type OrdemHistorico = "recentes" | "demoradas" | "evento";');
    expect(A).toContain('demoradas: "maior tempo de jornada primeiro"');
    expect(A).toContain("data-testid={`toggle-ordem-hist-${valor}`}");
    expect(A).toContain("{ORDEM_HIST_REGRA[ordemHistorico]}");
  });

  it("a duração usada na ordem é a MESMA que o cartão mostra", () => {
    expect(A).toContain("const duracaoDe = (item: any) => jornadaDaPeca(item,");
    expect(A).toContain('if (ordemHistorico === "demoradas") return duracaoDe(b) - duracaoDe(a);');
  });
});

describe("o que NÃO podia mudar continua de pé", () => {
  it("'Reprovar Ativo' segue fora (decisão do dono, 17/08)", () => {
    // A expressão sobrevive no comentário que explica a remoção — é o
    // registro da decisão. O que não pode voltar é o BOTÃO.
    expect(A).toContain('O "Reprovar Ativo" FOI EMBORA (decisão do dono, 17/08)');
    expect(A).not.toMatch(/>s*Reprovar Ativos*</);
  });

  it("'Aprovar para todos' só aparece com decisões em aberto", () => {
    expect(A).toContain("dialogSponsors.length > 0 && !allApproved && !allDecided");
  });

  it("o prazo continua por extenso, e é o marco de Aprovação de Layout", () => {
    expect(A).toContain("`Aprovação de Layout venceu ${ds} · há ${dias} ${plural}`");
    expect(A).toContain("prazoAprovacaoLayout(ev, hoje)");
  });

  it("os testids que a casa conhece continuam", () => {
    for (const t of ['data-testid="button-approve-item"', 'data-testid="button-clear-filters"', "data-testid={`row-item-", "data-testid={`button-hist-details-", "data-testid={`situacao-"]) {
      expect(A).toContain(t);
    }
  });
});
