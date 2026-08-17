// ─────────────────────────────────────────────────────────────────────────────
// O VOCABULÁRIO DE CONTROLES, TRAVADO.
//
// O dono olhou a faixa da Arte e disse "não pode cada um ser de um jeito". A
// primeira onda escreveu a decisão como comentário de bloco no topo de
// `client/src/components/filter-select.tsx` e padronizou 15 arquivos; a segunda
// pegou as três telas que tinham ficado de fora. Um comentário, porém, não
// impede ninguém de escrever o décimo desenho amanhã — este arquivo é o que
// impede.
//
// O teste LÊ A FONTE porque a regra é sobre QUAL PEÇA cada job usa, e isso não
// se observa por fora sem montar a árvore React inteira. Mesma técnica de
// evento-finalizado-telas e faceta-lista-invariante.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  EMPTY_ARTE_FILTERS,
  serializeArteFilters,
  parseArteFilters,
  countActiveFilters,
  filtersKey,
} from "../../client/src/lib/arte-rules";

// As fontes chegam com CRLF (o repositório é editado no Windows). Normalizar na
// LEITURA é o que permite escrever as âncoras multi-linha deste arquivo com
// "\n" — senão cada asserção passaria a depender do fim de linha do checkout,
// que é a última coisa que estas regras querem travar.
const ler = (p: string) =>
  readFileSync(resolve(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

const ARTE = ler("client/src/pages/arte.tsx");
const GRAFICA = ler("client/src/pages/grafica.tsx");
const REVISAO = ler("client/src/pages/solicitacao.tsx");
const COMPONENTE = ler("client/src/components/filter-select.tsx");

/** Só o JSX, sem os comentários — que citam de propósito o que foi aposentado. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("nenhuma das três telas abre mais o menu do sistema operacional", () => {
  it.each([
    ["Arte", ARTE],
    ["Gráfica", GRAFICA],
    ["Revisão Final", REVISAO],
  ])("%s não tem <select> nativo", (_tela, fonte) => {
    // Era o defeito mais visível do lote: um <select> nativo desenha o menu do
    // Windows — fonte, cor de seleção e ordem que não são da casa — no meio de
    // uma faixa inteiramente desenhada pela casa. E não tem contagem, nem
    // busca, nem grupo, nem selo de ativo.
    expect(semComentarios(fonte)).not.toMatch(/<select[\s>]/);
  });

  it("a ordenação da Arte é o job 6, e não um filtro disfarçado", () => {
    // Ordenação não tira linha nenhuma da lista: não tem "Todos", não tem o que
    // limpar e sempre vale alguma. Por isso veste GRAFITE (kind="sort"), e não
    // a laranja de quem recorta.
    expect(ARTE).toContain('kind="sort"');
    expect(ARTE).toContain('testId="select-ordenar"');
  });

  it("o seletor de fase do celular é campo, não filtro", () => {
    // A fase não RECORTA a lista — ela escolhe QUAL lista está aberta, que é o
    // que as abas fazem no desktop. Sem "Todos" e sem × de limpar.
    expect(ARTE).toContain('kind="field"');
    expect(ARTE).toContain('testId="select-fase-mobile"');
    // A contagem saiu de dentro do rótulo ("Aguardando envio (12)", texto
    // colado que o leitor de tela lia junto) e virou `count` da opção.
    expect(semComentarios(ARTE)).not.toContain("{tab.label} ({tab.count})");
  });
});

describe("job 4 — o binário é pílula-atalho, nunca interruptor", () => {
  it("o controle existe UMA vez, no componente da casa", () => {
    // Existia como decisão escrita e não como peça: cada tela escrevia o seu.
    expect(COMPONENTE).toContain("export function ShortcutPill");
  });

  it.each([
    ["Arte", ARTE],
    ["Gráfica", GRAFICA],
  ])("%s usa a pílula compartilhada no 'próximos 10 dias'", (_tela, fonte) => {
    expect(fonte).toContain("ShortcutPill");
    expect(fonte).toContain('testId="button-next-10-days-filter"');
  });

  it("a Gráfica não usa mais role=switch para filtrar", () => {
    // Interruptor PROMETE gravar uma preferência; aqui é recorte de tela, que
    // some no F5 de quem não estiver com ele na URL.
    expect(semComentarios(GRAFICA)).not.toContain('role="switch"');
  });

  it("o estado ligado nunca depende só de cor", () => {
    // Sem o ✓, quem não distingue laranja de cinza (e quem imprime a tela) não
    // consegue ler o estado do atalho.
    const i = COMPONENTE.indexOf("export function ShortcutPill");
    expect(i).toBeGreaterThan(-1);
    const corpo = COMPONENTE.slice(i);
    expect(corpo).toContain("active\n        ? <Check");
  });

  it("a pílula respeita a régua de cor da casa", () => {
    const corpo = COMPONENTE.slice(COMPONENTE.indexOf("export function ShortcutPill"));
    // #f97316 e #a8a29e NUNCA como cor de texto. O ativo escreve em #c2410c
    // (4,88:1 sobre #FFF7ED ✓) e o inativo em #57534e (7,03:1 sobre branco ✓).
    expect(corpo).not.toMatch(/color:\s*(active \?\s*)?["']#(f97316|a8a29e)["']/i);
    expect(corpo).toContain('color: active ? "#c2410c" : "#57534e"');
  });
});

describe("Arte — ORDEM na URL, e ordem NÃO É FILTRO", () => {
  it("a ordem padrão não suja a URL", () => {
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes")).toBe("");
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes", "evento")).toBe("");
  });

  it("a ordem não-padrão viaja, e volta", () => {
    // "A fila por prazo" é metade do que se está mostrando quando se manda o
    // link para um colega — sem isto o link abria em A→Z do outro lado.
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes", "prazo")).toBe("ordem=prazo");
    expect(parseArteFilters("ordem=prazo").sort).toBe("prazo");
  });

  it("ordem inventada na URL cai no padrão em vez de quebrar a lista", () => {
    expect(parseArteFilters("ordem=vontade").sort).toBe("evento");
    expect(parseArteFilters("").sort).toBe("evento");
  });

  it("a ordem NÃO conta como filtro ativo nem muda o recorte", () => {
    // Se entrasse no objeto de filtros, viraria +1 em "N filtros ativos",
    // ganharia um chip de "Ativos:" com um × que não teria o que apagar, e
    // mudaria a chave do recorte — reiniciando a paginação de quem só quis
    // reordenar o que já estava vendo.
    expect(countActiveFilters(EMPTY_ARTE_FILTERS)).toBe(0);
    expect(Object.keys(EMPTY_ARTE_FILTERS)).not.toContain("sort");
    expect(filtersKey(EMPTY_ARTE_FILTERS, "criar-aprovacoes"))
      .toBe(filtersKey(EMPTY_ARTE_FILTERS, "criar-aprovacoes"));
    expect(filtersKey(EMPTY_ARTE_FILTERS, "criar-aprovacoes")).not.toContain("prazo");
  });

  it("a ordem convive com os filtros na mesma query", () => {
    const qs = serializeArteFilters(
      { ...EMPTY_ARTE_FILTERS, atrasado: true, period: "7 dias" },
      "finalizar-layouts",
      "prazo",
    );
    const volta = parseArteFilters(qs);
    expect(volta.sort).toBe("prazo");
    expect(volta.tab).toBe("finalizar-layouts");
    expect(volta.filters.atrasado).toBe(true);
    expect(volta.filters.period).toBe("7 dias");
  });
});

describe("Arte — `?mes=` deixou de ser um recorte sem porta de entrada", () => {
  it("o filtro de mês tem gatilho na tela", () => {
    // Ele entrava só por link e só saía pelo X do chip: quem recebesse a URL
    // não tinha onde reescolher o mês nem onde ver quais existem.
    expect(ARTE).toContain('testId="select-month-filter"');
    expect(ARTE).toContain("options={monthFilterOptions}");
  });

  it("a chave da URL não mudou — links já compartilhados continuam abrindo", () => {
    expect(serializeArteFilters({ ...EMPTY_ARTE_FILTERS, months: ["8"] }, "criar-aprovacoes"))
      .toBe("mes=8");
    expect(parseArteFilters("mes=8,9").filters.months).toEqual(["8", "9"]);
  });
});

describe("Arte — as contagens que os segmentados mudos não tinham", () => {
  it.each([
    "periodFilterOptions", "monthFilterOptions", "prioridadeFilterOptions",
    "thumbFilterOptions", "finalFilterOptions", "prazoFilterOptions",
  ])("%s existe e alimenta um menu", (nome) => {
    expect(ARTE).toContain(`const ${nome} =`);
    expect(ARTE).toContain(`options={${nome}}`);
  });

  it("toda contagem sai do MESMO pool da lista, com a própria dimensão de fora", () => {
    // A regra que vale para todos (vocabulário do componente): a contagem de
    // cada opção é o número de linhas que AQUELE CLIQUE entrega. `poolSemDimensao`
    // refaz o recorte inteiro com um campo trocado — inclusive o que mora fora
    // de `matchesArteFilters` (a janela de 90 dias dos Finalizados e o recorte
    // de atrasadas).
    const i = ARTE.indexOf("const poolSemDimensao =");
    expect(i, "poolSemDimensao não foi encontrado em arte.tsx").toBeGreaterThan(-1);
    const corpo = ARTE.slice(i, ARTE.indexOf("\n  const periodFilterOptions"));
    expect(corpo).toContain("tabPoolItems.filter");
    expect(corpo).toContain("matchesArteFilters");
    expect(corpo).toContain("dentroDaJanelaFinalizados");
    expect(corpo).toContain("filtrarAtrasadasDaFase");
  });

  it("o selo de atrasadas virou a contagem da opção, e é o mesmo número", () => {
    expect(ARTE).toContain('label: "Só atrasadas", count: atrasadasNaAba');
    // O número sai da BASE (sem o recorte de atraso aplicado), senão mudaria
    // ao ser clicado — o controle prometeria um total e entregaria outro.
    expect(ARTE).toContain("const atrasadasNaAba = useMemo");
  });

  it("Finalizados continua sem prometer atraso que não existe", () => {
    // Ali o marco É a própria saída do caminhão, que numa peça pronta já passou
    // por definição. O gatilho fica DESABILITADO (e não sumindo), para que quem
    // chegou na aba com o recorte ligado ainda consiga desligá-lo.
    expect(ARTE).toContain('const prazoBloqueado = activeTab === "finalizados" && !atrasadoFilter');
    expect(ARTE).toContain("disabled={prazoBloqueado}");
  });
});

describe("Revisão Final — a última tela sem memória do recorte", () => {
  it("lê os filtros da URL ao abrir", () => {
    expect(REVISAO).toContain("filtrosRevisaoDaURL(window.location.search)");
    expect(REVISAO).toContain("useState(urlInicial.busca)");
    expect(REVISAO).toContain("useState<string[]>(urlInicial.eventos)");
    expect(REVISAO).toContain("useState<string[]>(urlInicial.tipos)");
  });

  it("espelha o recorte de volta na URL, sem pisar em parâmetro alheio", () => {
    // `?item=` do deep link de peça (components/prazos/tokens.ts) sobrevive:
    // a query nova PARTE da atual em vez de ser montada do zero.
    expect(REVISAO).toContain("filtrosRevisaoParaQuery(");
    expect(REVISAO).toContain("window.history.replaceState");
    expect(REVISAO).toContain("new URLSearchParams(searchAtual)");
  });

  it("usa as MESMAS chaves em pt-BR das outras telas", () => {
    // O mesmo recorte não pode ter um nome em cada tela: a URL é compartilhada
    // entre colegas.
    const i = REVISAO.indexOf("function filtrosRevisaoDaURL");
    const corpo = REVISAO.slice(i, REVISAO.indexOf("export default function Solicitacao"));
    for (const chave of ["busca", "evento", "tipo"]) {
      expect(corpo).toContain(`"${chave}"`);
    }
  });

  it("o Voltar do navegador reidrata o recorte", () => {
    // Sem isto o back trocava a URL e a tela continuava com os filtros novos —
    // a URL passaria a mentir sobre o que está na tela.
    expect(REVISAO).toContain('window.addEventListener("popstate"');
  });

  it("ganhou o atalho '/' — e ele se cala com diálogo aberto", () => {
    expect(REVISAO).toContain('aria-keyshortcuts="/"');
    expect(REVISAO).toContain("const algumDialogoAberto =");
    expect(REVISAO).toContain('if (e.key !== "/" || algumDialogoAberto) return;');
  });

  it("o debounce da URL respeita a régua de ≥200ms", () => {
    // Sem ele, cada tecla da busca escreve um replaceState — o padrão que já
    // derrubou a árvore React no Safari em outra tela.
    const i = REVISAO.indexOf("filtrosRevisaoParaQuery(\n        window.location.search");
    expect(i).toBeGreaterThan(-1);
    const atraso = REVISAO.slice(i, i + 400).match(/\}, (\d+)\);/);
    expect(atraso, "não achei o setTimeout do espelho da URL").toBeTruthy();
    expect(Number(atraso![1])).toBeGreaterThanOrEqual(200);
  });
});
