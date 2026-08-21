// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS: A ORDEM DECLARADA, A SITUAÇÃO NUM CONTROLE SÓ, E A LISTA.
//
// 1. A ORDEM ERA CERTA E MUDA. `sortedEvents` sempre ordenou por risco e depois
//    pela saída do caminhão, e a tela nunca disse isso: ninguém entendia por
//    que um evento era o terceiro, e não havia como pedir outro critério. Uma
//    ordem que a pessoa não consegue nomear ela lê como aleatória — e passa a
//    varrer a lista inteira toda vez, em vez de confiar no topo.
//
// 2. O MESMO EIXO EM TRÊS LUGARES. Situação vivia no FilterSelect "Prioridade e
//    situação" (que misturava PRIORITY com LIFECYCLE_FILTERS), no botão
//    "Ocultar concluídos", e nos chips do cabeçalho. O código chegava a
//    DESABILITAR o botão quando o dropdown pedia uma situação —
//    `explicitLifecycleFilter` era a confissão de que dois controles disputavam
//    a mesma decisão. Um controle que se desliga por causa de outro é sempre um
//    sintoma, nunca a doença.
//
// 3. O CARTÃO É CARO PARA VARRER. Sete blocos e ~440px de altura; com 50
//    eventos a leitura é longa. A lista não substitui o cartão — responde outra
//    pergunta: "onde está o evento X" em vez de "como está o evento X".
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const tela = readFileSync(
  path.resolve(__dirname, "../../client/src/pages/eventos.tsx"),
  "utf8",
);

/** Sem comentários — para asserções de ausência. */
const codigo = tela
  .replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map(l => l.replace(/^\s*\/\/.*$/, ""))
  .join("\n");

function contraste(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [1, 3, 5]
      .map(i => parseInt(h.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
// OS BALDES DE SITUAÇÃO, reimplementados para provar que PARTICIONAM.
// É a propriedade que sustenta o critério 3 — e a que se perde em silêncio se
// alguém acrescentar um lifecycle novo sem tocar aqui.
// ─────────────────────────────────────────────────────────────────────────────
const ARQUIVADOS = new Set(["completed", "manually_closed"]);
function baldeDe(lifecycle: string): "ativos" | "pendencias" | "arquivados" {
  if (ARQUIVADOS.has(lifecycle)) return "arquivados";
  if (lifecycle === "realizado") return "pendencias";
  return "ativos";
}

describe("os três baldes particionam", () => {
  const TODOS = ["active", "realizado", "completed", "manually_closed"];

  it("cada lifecycle cai em exatamente um balde", () => {
    for (const l of TODOS) {
      const baldes = (["ativos", "pendencias", "arquivados"] as const).filter(b => baldeDe(l) === b);
      expect(baldes.length, `${l} caiu em ${baldes.length} baldes`).toBe(1);
    }
  });

  it("a soma das contagens fecha com o total", () => {
    const eventos = [
      "active", "active", "active",
      "realizado", "realizado",
      "completed",
      "manually_closed", "manually_closed",
    ];
    const c = { ativos: 0, pendencias: 0, arquivados: 0 };
    eventos.forEach(l => { c[baldeDe(l)] += 1; });
    expect(c.ativos + c.pendencias + c.arquivados).toBe(eventos.length);
    expect(c).toEqual({ ativos: 3, pendencias: 2, arquivados: 3 });
  });

  it("'realizado' NÃO é arquivado — é o único balde em que sobrou trabalho", () => {
    // Arquivá-lo esconderia exatamente o que o dono não pode perder de vista.
    expect(baldeDe("realizado")).toBe("pendencias");
    expect(ARQUIVADOS.has("realizado")).toBe(false);
    // E a tela mantém a mesma regra.
    expect(tela).toContain("const ARCHIVED_LIFECYCLES = new Set<LifecycleKey>(['completed', 'manually_closed']);");
  });

  it("e a função da tela é a mesma", () => {
    const i = tela.indexOf("const baldeDe = useCallback");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 400);
    expect(bloco).toContain('if (ARCHIVED_LIFECYCLES.has(lifecycle)) return "arquivados";');
    expect(bloco).toContain('if (lifecycle === "realizado") return "pendencias";');
    expect(bloco).toContain('return "ativos";');
  });
});

describe("situação em um controle só", () => {
  it("os três alternadores existem, com aria-pressed", () => {
    // Alternadores e não radios: radios prometem exclusão mútua, e aqui a
    // pessoa combina baldes.
    for (const chave of ["ativos", "pendencias", "arquivados"]) {
      expect(tela).toContain(`{ chave: '${chave}'`);
    }
    expect(tela).toContain("data-testid={`toggle-situacao-${chave}`}");
    expect(tela).toContain("aria-pressed={ligado}");
  });

  it("o botão 'Ocultar concluídos' saiu", () => {
    expect(codigo).not.toContain("Ocultar concluídos");
    expect(codigo).not.toContain('data-testid="button-toggle-completed"');
  });

  it("e `explicitLifecycleFilter` morreu junto", () => {
    // Ele existia só para remendar a disputa entre dois controles sobre o mesmo
    // eixo. Sem a disputa, não há o que remendar — e nenhum controle fica
    // desabilitado por causa de outro.
    expect(codigo).not.toContain("explicitLifecycleFilter");
    expect(codigo).not.toContain("Desativado enquanto o filtro");
  });

  it("as pseudo-opções de situação saíram do menu de prioridade", () => {
    expect(codigo).not.toContain('label: "Realizado com pendências"');
    expect(codigo).not.toContain('label: "Encerrado manualmente"');
    expect(codigo).not.toContain('group: "Situação do evento"');
  });

  it("e o rótulo do filtro não promete mais situação", () => {
    expect(codigo).not.toContain('label="Prioridade e situação"');
    expect(tela).toContain('label="Todas as prioridades"');
    expect(tela).toContain('allLabel="Todas as prioridades"');
  });

  it("a contagem de cada alternador exclui a própria dimensão", () => {
    // É o que faz o número ser exatamente o de linhas que ligá-lo acrescenta.
    const i = tela.indexOf("const contagemPorSituacao = useMemo");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 500);
    expect(bloco).toContain("matchesSearch(e) && matchesDates(e) && matchesFoco(e) && matchesPriority(e) && matchesSponsor(e)");
    expect(bloco).not.toContain("matchesVisibility");
  });

  it("nenhum balde marcado mostra tudo, não nada", () => {
    // Uma tela vazia porque a pessoa desmarcou os três se lê como erro.
    expect(tela).toContain("if (situacoes.size === 0) return true;");
  });

  it("os chips de foco continuam — são cruzamentos, não situação", () => {
    expect(tela).toContain("'Marco atrasado'");
    expect(tela).toContain("'Sem prioridade'");
    expect(tela).toContain("'Sem peças'");
    // E "Sem prioridade" filtra de verdade, via selectedPriorities.
    expect(tela).toContain("setSelectedPriorities((prev) => (prev.length === 1 && prev[0] === 'sem_prioridade') ? [] : ['sem_prioridade'])");
  });
});

describe("a ordem é declarada e trocável", () => {
  it("os três critérios existem, com a regra escrita ao lado", () => {
    for (const v of ["saida", "marco", "nome"]) {
      expect(tela).toContain(`data-testid={\`toggle-ordem-\${valor}\`}`);
      expect(tela).toContain(`['${v}',`);
    }
    // A regra fica escrita, não num tooltip: ela responde "por que este está em
    // cima", e essa pergunta se faz olhando a lista.
    expect(tela).toContain("marco atrasado primeiro, depois quem embarca antes");
    expect(tela).toContain("o marco mais perto de vencer no topo");
    expect(tela).toContain("ordem alfabética");
  });

  it("o critério escolhido decide o PRIMEIRO desempate", () => {
    const i = tela.indexOf("decorated.sort((a, b) => {");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 600);
    expect(bloco).toContain("if (ordem === 'nome') return a.name.localeCompare(b.name, 'pt-BR');");
    expect(bloco).toContain("if (ordem === 'marco') {");
    // A cadeia de desempate continua: sem ela a ordem não é estável.
    expect(bloco).toContain("if (a.dep !== b.dep) return a.dep - b.dep;");
    expect(bloco).toContain("if (a.prio !== b.prio) return a.prio - b.prio;");
  });

  it("sem marco vai para o fim, não para o meio", () => {
    // Não é "o menos urgente": é ausência de marco. Misturá-lo com os de prazo
    // longo esconderia os dois.
    expect(tela).toContain("marco: event.nextMilestone?.daysRemaining ?? Number.MAX_SAFE_INTEGER,");
  });

  it("e `daysRemaining` continua vindo do servidor", () => {
    // Já está no fuso do negócio; recalcular no cliente é reintroduzir o bug.
    const i = tela.indexOf("marco: event.nextMilestone?.daysRemaining");
    expect(tela.slice(i - 300, i)).toContain("vem do SERVIDOR");
  });
});

describe("o modo lista", () => {
  it("cabeçalho e linhas usam a MESMA definição de grade", () => {
    // Duas definições — uma no cabeçalho, outra na linha — é como colunas saem
    // de registro: nascem iguais e divergem no primeiro ajuste que só um dos
    // lados recebe.
    expect(tela).toContain("const GRADE_LISTA = `4px 1fr 132px 190px 108px 92px ${LARGURA_ACOES}px`;");
    const usos = tela.split("gridTemplateColumns: GRADE_LISTA").length - 1;
    expect(usos).toBe(2);
  });

  it("a linha é uma âncora de verdade, como o cartão", () => {
    // Ctrl+clique, clique do meio e "abrir em nova aba" são o jeito de comparar
    // dois eventos — um `div role="link"` tira os três de uma vez.
    expect(tela).toContain("data-testid={`link-event-${event.id}`}");
    const i = tela.indexOf("data-testid={`link-event-${event.id}`}");
    expect(tela.slice(i - 300, i)).toContain("href={`/eventos/${event.id}`}");
  });

  it("DENSIDADE NÃO MUDA O QUE DÁ PARA FAZER: a linha tem as mesmas ações", () => {
    // O mesmo defeito que a tela de Vincular tinha entre suas duas abas —
    // escolher um modo custava capacidade. A primeira versão desta lista deixou
    // as ações de fora com o argumento de que o cartão está a um clique; o
    // argumento não sobrevive a "e por que o cartão não usa o mesmo?".
    //
    // Mesmo COMPONENTE, não uma segunda fileira de botões: assim um botão novo
    // nasce nos dois lugares.
    const usos = tela.split("<EventCardActions").length - 1;
    expect(usos).toBe(2); // o cartão e a linha
  });

  it("e as ações ficam FORA da âncora, como no cartão", () => {
    // <button> dentro de <a> é HTML inválido, e o navegador desfaz o
    // aninhamento de um jeito que quebra os dois.
    const i = tela.indexOf("AÇÕES — fora da âncora");
    expect(i).toBeGreaterThan(-1);
    // O fechamento da âncora vem ANTES do bloco de ações.
    expect(tela.slice(i - 200, i)).toContain("</a>");
  });

  it("a âncora usa `display: contents` para não quebrar o alinhamento", () => {
    // Os filhos viram itens diretos do grid: as colunas alinham com o cabeçalho
    // por UMA definição de grade, e o conteúdo continua DENTRO do link — o que
    // preserva a seleção de texto. A alternativa comum (link esticado por
    // `position: absolute` + `pointer-events: none` nas células) alinharia
    // igual e custaria a seleção da linha inteira.
    expect(tela).toContain("style={{ display: 'contents', textDecoration: 'none', color: 'inherit' }}");
  });

  it("a largura da coluna de ações é a mesma conta do cartão", () => {
    expect(tela).toContain("const LARGURA_ACOES = 5 * 32 + 4 * 6 + 10;");
  });

  it("ACOPLAMENTO INVISÍVEL: quem renderiza as ações tem um ancestral `group`", () => {
    // `EventCardActions` se esconde com `opacity-0 group-hover:opacity-100`, e
    // isso DEPENDE de um ancestral com a classe `group` do Tailwind.
    //
    // Tirar essa classe — num refactor do wrapper, ao trocar um <div> por
    // outro, ao mexer no estilo — deixa os botões PERMANENTEMENTE invisíveis no
    // mouse. E nada denuncia: sem erro, sem falha de tsc, sem teste. Eles
    // continuam no DOM e continuam focáveis por Tab (o `focus-within` os traz
    // de volta), então nem a navegação por teclado acusa. Só o mouse deixa de
    // achá-los, que é como 99% das pessoas usa a tela.
    //
    // O acoplamento não dá para remover sem trocar a técnica de revelação
    // inteira. Dá para travá-lo aqui.
    const corpoDe = (nome: string) => {
      const i = tela.indexOf(`function ${nome}(`);
      expect(i, `não achei ${nome}`).toBeGreaterThan(-1);
      // Até a próxima declaração de função no topo do arquivo.
      const resto = tela.slice(i + 1);
      const fim = resto.search(/\nfunction |\nexport default function /);
      return fim < 0 ? resto : resto.slice(0, fim);
    };

    for (const nome of ["EventRow", "EventCard"]) {
      const corpo = corpoDe(nome);
      expect(corpo, `${nome} não renderiza as ações`).toContain("<EventCardActions");
      expect(corpo, `${nome} perdeu o ancestral \`group\` — as ações ficam invisíveis no mouse`)
        .toContain('className="group');
    }
  });

  it("desenha a MESMA barra segmentada por fase do cartão", () => {
    // A barra antiga media só `delivered` e mostrava 0% num evento todo
    // conferido. A contagem virou função de módulo, e depois foi para
    // lib/fases.ts quando o Detalhe do Evento passou a desenhar a MESMA
    // barra — três telas, uma conta. Aqui ela entra por import, e o nome
    // local continua `contarPorFase` para o cartão e a linha lerem igual.
    expect(tela).toContain('import { PHASES, contarPorFaseDoEvento as contarPorFase } from "@/lib/fases";');
    expect(tela).not.toContain("function contarPorFase(event: any): number[]");
    const usos = tela.split("contarPorFase(event)").length - 1;
    expect(usos).toBe(2); // o cartão e a linha
  });

  it("o alternador de densidade existe e some no celular", () => {
    expect(tela).toContain("data-testid={`toggle-densidade-${valor}`}");
    // A tabela de seis colunas não cabe em 390px, e virar cartão é o que ela
    // faria — então no celular só existe cartão.
    expect(tela).toContain("{!isMobile && (");
    expect(tela).toContain("densidade === 'lista' && !isMobile ?");
  });

  it("a situação da linha é a MESMA frase do rodapé do cartão", () => {
    const i = tela.indexOf("const situacao = stats.activeItemCount === 0");
    expect(i).toBeGreaterThan(-1);
    expect(tela.slice(i, i + 220)).toContain("'Sem peças'");
  });
});

describe("os três estados novos viajam na URL", () => {
  it("ordem, situação e densidade", () => {
    expect(tela).toContain('if (ordem !== "saida") p.set("ordem", ordem);');
    expect(tela).toContain('if (sit !== "ativos,pendencias") p.set("situacao", sit);');
    expect(tela).toContain('if (densidade !== "cartoes") p.set("densidade", densidade);');
  });

  it("e o debounce de 300ms continua", () => {
    // O comentário aponta o SecurityError do Safari com ~100 replaceState/30s.
    expect(tela).toContain("}, 300);");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE NÃO PODE TER SIDO MEXIDO
// ═════════════════════════════════════════════════════════════════════════════
describe("as decisões anteriores continuam de pé", () => {
  it("o cartão é uma âncora com os botões FORA dela", () => {
    expect(tela).toContain("actionCount * btnSize + (actionCount - 1) * 6 + 10");
    expect(codigo).not.toContain('role="link"');
  });

  it("a grade mantém stretch e o rodapé em margin-top auto", () => {
    // É isso que alinha as barras de fase entre cartões da mesma linha.
    expect(tela).toContain("grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6");
    expect(tela).toContain("marginTop: 'auto'");
    expect(codigo).not.toContain("alignItems: 'start'");
  });

  it("toUTCDisplayDate na saída do caminhão", () => {
    // Um caminhão gravado para 08:00 exibia "08:00" e o selo "Saiu hoje" ao
    // mesmo tempo.
    expect(tela).toContain("toUTCDisplayDate(event.truckDepartureDate)");
  });

  it("o hover contido, sem o lift que fazia a grade pular", () => {
    expect(codigo).not.toContain("translateY(-4px)");
  });

  it("o snapshot do formulário e os FreezeWhileClosing", () => {
    expect(tela).toContain("formSignature");
    expect(tela).toContain("baselineSig");
    expect(tela).toContain("FreezeWhileClosing");
  });

  it("EventCardActions com os dois gatilhos de revelação", () => {
    // Sem `focus-within`, o teclado nunca alcança os botões.
    expect(tela).toContain("group-hover");
    expect(tela).toContain("focus-within");
  });

  it("MEDIÇÃO: o excedente de patrocinadores já não renderiza negativo", () => {
    // Fica registrado porque o pedido desta revisão trazia duas instruções que
    // se contradizem: "não altere sponsor-chips.tsx" e "use Math.max(0, ...) no
    // contador de excedente" — e o contador vive lá, não aqui.
    //
    // Medido: `const overflow = sponsors.length - max` é subtração crua, sim, e
    // dá negativo com menos patrocinadores que o máximo. Mas o único uso está
    // atrás de `overflow > 0`, então o negativo nunca chega à tela. Não há
    // defeito a corrigir, e a restrição mais forte (não tocar no componente
    // compartilhado, que outras telas usam) prevalece.
    const chips = readFileSync(
      path.resolve(__dirname, "../../client/src/components/sponsor-chips.tsx"),
      "utf8",
    );
    expect(chips).toContain("const overflow = sponsors.length - max;");
    expect(chips).toContain("{!showAll && overflow > 0 && (");
  });

  it("SponsorChips no mesmo variante", () => {
    expect(tela).toContain('variant="colored"');
  });
});

describe("contraste do que entrou", () => {
  it.each([
    ["#7a6154", "#fafaf9", "rótulo de coluna da lista"],
    ["#44403c", "#ffffff", "alternador desligado"],
    ["#9a3412", "#fff7ed", "alternador de ordem ativo"],
    ["#9a3412", "#ffffff", "saída em até 7 dias"],
    ["#b91c1c", "#ffffff", "saída já passada"],
    ["#ffffff", "#1c1917", "alternador de situação ligado"],
  ])("%s sobre %s — %s", (frente, fundo) => {
    expect(contraste(frente, fundo)).toBeGreaterThanOrEqual(4.5);
  });

  it("#a8a29e continua fora do texto", () => {
    expect(contraste("#a8a29e", "#ffffff")).toBeLessThan(4.5);
  });
});
