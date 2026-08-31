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
    // o padrão virou "prazo" (dono, 31/08)
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes", "prazo")).toBe("");
  });

  it("a ordem não-padrão viaja, e volta", () => {
    // "A fila por evento" é metade do que se está mostrando quando se manda o
    // link para um colega. O PADRÃO virou "prazo" (dono, 31/08) — é "evento"
    // que agora precisa viajar explícito na URL.
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes", "evento")).toBe("ordem=evento");
    expect(parseArteFilters("ordem=evento").sort).toBe("evento");
    // e o padrão não polui a URL
    expect(serializeArteFilters(EMPTY_ARTE_FILTERS, "criar-aprovacoes", "prazo")).toBe("");
  });

  it("ordem inventada na URL cai no padrão em vez de quebrar a lista", () => {
    expect(parseArteFilters("ordem=vontade").sort).toBe("prazo");
    expect(parseArteFilters("").sort).toBe("prazo");
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

describe("Arte — o que ficou padronizado, e os quatro que o dono manteve segmentados", () => {
  // Decisão do dono (17/08), depois de ver os quatro como menu: "o filtro
  // antigo estava bom, não precisa mudar esses — neste caso apenas".
  // Prazo da fase, Prioridade, Thumb e Arquivo final voltam a ser
  // segmentados; o resto do vocabulário segue valendo na tela. Este teste
  // trava a EXCEÇÃO para que a próxima onda de padronização não a desfaça
  // sem querer — foi por não estar escrita que ela virou trabalho refeito.
  it.each(["segment-atrasado", "segment-urgente"])(
    "%s continua segmentado, com os estados à vista sem abrir menu",
    (testId) => {
      expect(ARTE).toContain(`data-testid="${testId}"`);
      expect(ARTE).toContain('role="group"');
    },
  );

  it("Thumb e Arquivo final saem do mesmo .map, e seguem segmentados", () => {
    // Estes dois nao trazem o testId literal no JSX: nascem de uma lista, e o
    // `data-testid` vem do item. Procurar a string literal daria falso negativo.
    expect(ARTE).toContain("testId: 'segment-thumb'");
    expect(ARTE).toContain("testId: 'segment-final'");
    expect(ARTE).toContain("data-testid={testId}");
  });

  it("os quatro segmentados NÃO viraram FilterSelect", () => {
    for (const nome of ["prioridadeFilterOptions", "thumbFilterOptions", "finalFilterOptions", "prazoFilterOptions"]) {
      expect(ARTE, `${nome} voltou a alimentar um menu`).not.toContain(`options={${nome}}`);
    }
  });

  it("o resto do vocabulário segue padronizado na Arte", () => {
    // A exceção é dos QUATRO, não da tela: ordenação, faixa de período e o
    // seletor de fase do celular continuam no padrão da casa, e nenhum
    // <select> nativo voltou.
    expect(ARTE).toContain('kind="sort"');
    expect(ARTE).toContain('kind="field"');
    expect(ARTE).toContain("options={periodFilterOptions}");
    expect(ARTE).toContain("options={monthFilterOptions}");
    expect(ARTE.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")).not.toContain("<select");
  });

  it("Finalizados continua sem prometer atraso que não existe", () => {
    // Ali o marco É a própria saída do caminhão, que numa peça pronta já
    // passou por definição — o recorte não existe em vez de mentir. O
    // comentário do bloco é o contrato escrito; o que se trava aqui é que o
    // segmentado de Prazo continua existindo para as outras abas.
    expect(ARTE).toContain('aria-label="Prazo da fase" data-testid="segment-atrasado"');
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
