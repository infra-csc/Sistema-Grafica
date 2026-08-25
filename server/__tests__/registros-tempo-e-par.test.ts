// ─────────────────────────────────────────────────────────────────────────────
// REGISTROS: O ACERVO SE LÊ EM ORDEM DE TEMPO, E O PAR ANDA JUNTO.
//
// Duas coisas faltavam num acervo de comprovantes fotográficos:
//
// 1. ORDEM DE TEMPO. A grade era plana — dezenas de cartões seguidos, sem marco
//    nenhum, e a única referência era "Exibindo 60 de 240". A pergunta que traz
//    alguém aqui é "o que entrou hoje", e não havia como responder sem contar.
//
// 2. O PAR. A pergunta central é "a peça foi entregue como foi conferida?", e as
//    duas fotos que respondem isso eram cartões independentes, a dezenas de
//    posições de distância — e, com o agrupamento por dia, quase sempre em
//    grupos diferentes. Não havia caminho de uma para a outra: só buscar o
//    displayId e conferir na mão.
//
// A metade de baixo deste arquivo é o guarda-costas do que JÁ estava certo. A
// tela passou por uma revisão cuidadosa antes desta, e cada item ali é uma
// decisão registrada — "melhorar" qualquer um deles é reverter trabalho feito
// de propósito.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const tela = readFileSync(
  path.resolve(__dirname, "../../client/src/pages/registros.tsx"),
  "utf8",
);

/** Sem comentários — para asserções de ausência. Ver a nota em vincular. */
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
// A LÓGICA DO RÓTULO DO DIA, reimplementada aqui para ser exercitada.
//
// É a única regra desta revisão que dá para errar em silêncio, e o modo de
// errar é conhecido: comparar por diferença de milissegundos em vez de por dia
// civil. Às 00h30, uma foto das 23h de ontem está a uma hora de distância — e
// mesmo assim é de ontem.
// ─────────────────────────────────────────────────────────────────────────────
const MS_DIA = 86_400_000;
function rotuloDoDia(iso: string, hoje: Date): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Sem data";
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  if (dia === base) return "Hoje";
  if (dia === base - MS_DIA) return "Ontem";
  return "data escrita";
}

describe("o rótulo do dia", () => {
  const hoje = new Date(2026, 7, 20, 0, 30); // 20/08 às 00h30 — o caso difícil

  it("uma foto de hoje é 'Hoje', mesmo poucos minutos atrás", () => {
    expect(rotuloDoDia(new Date(2026, 7, 20, 0, 10).toISOString(), hoje)).toBe("Hoje");
  });

  it("uma foto das 23h de ontem é 'Ontem', mesmo a uma hora de distância", () => {
    // Este é o caso que a conta por milissegundos erra: 1h30 de diferença
    // arredondaria para "hoje".
    expect(rotuloDoDia(new Date(2026, 7, 19, 23, 0).toISOString(), hoje)).toBe("Ontem");
  });

  it("e uma das 00h05 de hoje continua sendo 'Hoje', a 25 minutos", () => {
    expect(rotuloDoDia(new Date(2026, 7, 20, 0, 5).toISOString(), hoje)).toBe("Hoje");
  });

  it("dois dias atrás vira data escrita", () => {
    expect(rotuloDoDia(new Date(2026, 7, 18, 12, 0).toISOString(), hoje)).toBe("data escrita");
  });

  it("data inválida não quebra o cabeçalho", () => {
    expect(rotuloDoDia("nada disso", hoje)).toBe("Sem data");
  });

  it("atravessa a virada do mês", () => {
    const primeiro = new Date(2026, 8, 1, 9, 0);
    expect(rotuloDoDia(new Date(2026, 7, 31, 18, 0).toISOString(), primeiro)).toBe("Ontem");
  });
});

describe("o agrupamento por dia", () => {
  it("agrupa a FATIA VISÍVEL, não `filtered` inteiro", () => {
    // "Carregar mais" traz 60 por vez e pode partir um dia no meio — aceitável,
    // o grupo seguinte continua. Contar sobre `filtered` faria o cabeçalho
    // anunciar um número que não está na tela.
    const i = tela.indexOf("const gruposPorDia");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 700);
    expect(bloco).toContain("filtered.slice(0, visible).forEach");
    expect(bloco).not.toContain("filtered.forEach");
  });

  it("o índice em `filtered` viaja junto com cada foto", () => {
    // É ele que o zoom usa. Se o grupo carregasse o índice LOCAL, abrir a
    // terceira foto do segundo dia abriria a terceira do acervo.
    expect(tela).toContain("{ p: Photo; idx: number }[]");
    expect(tela).toContain("{grupo.fotos.map(({ p, idx }) => {");
    expect(tela).toContain("onClick={() => setZoomIdx(idx)}");
  });

  it("o cabeçalho é fixo e compensa o padding do contêiner", () => {
    // `top: -24` porque o contêiner rolável tem 24px de padding: sem compensar,
    // o rótulo gruda 24px abaixo do topo e deixa uma faixa de cartões passando
    // por cima dele.
    expect(tela).toContain("position: \"sticky\", top: -24");
    // Gradiente e não fundo chapado com borda: borda dura corta a foto que
    // passa por baixo dela na rolagem.
    expect(tela).toContain("linear-gradient(#f9f9f8 78%, rgba(249,249,248,0))");
  });

  it("a contagem do cabeçalho é a do próprio grupo", () => {
    expect(tela).toContain("{grupo.fotos.length} {grupo.fotos.length === 1 ? \"registro\" : \"registros\"}");
  });

  it("tem testid por grupo", () => {
    expect(tela).toContain("data-testid={`group-day-${grupo.rotulo}`}");
  });
});

describe("o par conferência ↔ entrega", () => {
  it("o índice sai do ACERVO, não da lista filtrada", () => {
    // A contraparte existe independentemente do filtro em vigor. Indexar sobre
    // `filtered` faria a tela dizer "sem foto de entrega" para uma peça que tem
    // — só porque o filtro de tipo está em "Conferência".
    const i = tela.indexOf("const porPeca = useMemo");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 900);
    expect(bloco).toContain("for (const f of photos)");
    expect(bloco).not.toContain("filtered");
    expect(tela).toContain("}, [photos]);");
  });

  it("a chave da peça é o itemId, não o displayId", () => {
    // `displayId` é editável; `itemId` não. O payload traz os dois.
    expect(tela).toContain("const pecaDe = (p: Photo): string => p.itemId || p.displayId");
    expect(tela).toContain("itemId?: string;");
  });

  it("com duas do mesmo tipo, a contraparte é a mais recente", () => {
    expect(tela).toContain("const maisNova = (a: Photo, b: Photo) =>");
    expect(tela).toContain("return outras[0] ?? null;");
  });

  it("o botão do par abre o zoom naquela foto", () => {
    expect(tela).toContain("data-testid={`button-pair-${p.id}`}");
    expect(tela).toContain("if (idxOutra >= 0) { setZoomIdx(idxOutra); return; }");
  });

  it("e quando ela está fora do filtro, o clique limpa o filtro em vez de não fazer nada", () => {
    // Um botão que não responde é indistinguível de um botão quebrado.
    expect(tela).toContain("setAlvoDoPar(outra.id);");
    expect(tela).toContain("const i = filtered.findIndex(f => f.id === alvoDoPar);");
  });

  it("a ausência é dita, com a redação certa para cada direção", () => {
    // Faltar a entrega é trabalho em curso. Faltar a conferência é uma peça que
    // SAIU sem conferência registrada — não é a mesma notícia.
    expect(tela).toContain("Sem foto de entrega ainda");
    expect(tela).toContain("Entregue sem foto de conferência");
    expect(tela).toContain("ehConferencia ? \"Sem foto de entrega ainda\" : \"Entregue sem foto de conferência\"");
  });

  it("a faixa do zoom troca a foto sem fechar o diálogo", () => {
    expect(tela).toContain('data-testid="strip-same-item"');
    // Só muda o índice: nada de setZoomIdx(null) aqui.
    expect(tela).toContain("onClick={() => { if (alcancavel && !atual) setZoomIdx(i); }}");
  });

  it("e as setas continuam percorrendo o acervo filtrado inteiro", () => {
    // Dois eixos de propósito: as setas andam no acervo, a faixa anda na peça.
    expect(tela).toContain('data-testid="button-zoom-prev"');
    expect(tela).toContain('data-testid="button-zoom-next"');
    expect(tela).toContain("zoomIdx! < filtered.length - 1");
  });
});

describe("baixar e recortar", () => {
  it("dá para salvar sem abrir o zoom", () => {
    expect(tela).toContain("data-testid={`button-card-download-${p.id}`}");
    // A mesma função do zoom — não uma segunda implementação.
    expect(tela).toContain("onClick={e => { e.stopPropagation(); baixar(p); }}");
    expect(tela).toContain("disabled={baixando}");
  });

  it("cartão e skeleton têm a MESMA proporção", () => {
    // Com 4:3 num e 1:1 no outro, a grade salta de altura no instante em que a
    // lista chega.
    const quadrados = codigo.match(/aspectRatio: "1\/1"/g) ?? [];
    expect(quadrados.length).toBe(2);
    expect(codigo).not.toContain('aspectRatio: "4/3"');
  });

  it("o zoom continua sem proporção imposta e com contain", () => {
    expect(tela).toContain('objectFit: "contain"');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE NÃO PODE TER SIDO MEXIDO
//
// Cada item abaixo é uma decisão da revisão anterior. Estão aqui porque a
// tentação de "melhorar" um deles é real — e cada um tem um defeito concreto
// atrás de si.
// ═════════════════════════════════════════════════════════════════════════════
describe("as facetas continuam facetadas", () => {
  it.each([
    ["kindOptions", "passes.event(p) && passes.search(p) && passes.period(p)"],
    ["eventOptions", "passes.kind(p) && passes.search(p) && passes.period(p)"],
  ])("%s exclui o próprio filtro do pool", (nome, poolEsperado) => {
    const i = tela.indexOf(`const ${nome} = useMemo`);
    expect(i).toBeGreaterThan(-1);
    expect(tela.slice(i, i + 400)).toContain(poolEsperado);
  });

  it("o período mantém a ordem cronológica contra a alfabética do FilterSelect", () => {
    expect(tela).toContain("pinned: true");
  });
});

describe("as correções de contraste continuam de pé", () => {
  it("o recuo dos contadores inativos é por COR, não por opacity", () => {
    // `opacity` derruba o contraste do texto junto com o resto; trocar a cor
    // recua sem tirar a leitura.
    expect(tela).toContain("T.second");
  });

  it("o link do evento usa o laranja que passa", () => {
    expect(tela).toContain('color: "#c2410c"');
    expect(contraste("#c2410c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("o ID sobre a foto mantém o alfa 0.72", () => {
    // A 0.6 o fundo dependia da foto atrás: sobre foto clara o branco caía
    // abaixo de 4,5:1.
    expect(tela).toContain('backgroundColor: "rgba(28,25,23,0.72)"');
  });

  it("a observação continua em #57534e", () => {
    expect(tela).toContain('color: "#57534e"');
    expect(contraste("#57534e", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("e o que entrou nesta revisão também passa", () => {
    const pares: [string, string][] = [
      ["#1a1c1c", "#f9f9f8"],  // rótulo do dia
      ["#57534e", "#f9f9f8"],  // contagem do dia
      ["#92400e", "#fffbeb"],  // "sem foto de entrega ainda"
      ["#0e7490", "#ecfeff"],  // "ver a conferência"
      ["#7e22ce", "#faf5ff"],  // "ver a entrega"
      ["#ffffff", "#1c1917"],  // ícone do download sobre o chip escuro
    ];
    for (const [f, b] of pares) {
      expect(contraste(f, b), `${f} sobre ${b}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("o zoom continua sendo um diálogo de verdade", () => {
  it("é Dialog, não um div fixo", () => {
    // Como div, o Tab passeava pelos cartões atrás do escurecido, o fundo
    // rolava com a roda do mouse, o foco não voltava ao cartão de origem e nada
    // anunciava a abertura.
    expect(tela).toContain("<Dialog open={zoom != null}");
    expect(tela).toContain("<DialogTitle className=\"sr-only\">");
  });

  it("o teto é altura, não rolagem", () => {
    // Num lightbox a resposta certa para "não coube" é a foto encolher.
    expect(tela).toContain('maxHeight: "calc(100vh - 48px)"');
    expect(tela).toContain('flex: "1 1 auto", minHeight: 0');
  });
});

describe("o resto do que estava certo", () => {
  it.each([
    ["altOf", "altOf"],
    ["lazy nas imagens da grade", 'loading="lazy"'],
    ["brokenIds em estado React", "setBrokenIds"],
    ["reset de brokenIds a cada photos", "useEffect(() => { setBrokenIds(new Set()); }, [photos]);"],
    ["useDeferredValue na busca", "useDeferredValue(search)"],
    ["espelho dos filtros na URL", "window.history.replaceState"],
    ["atalho da barra", 'if (e.key !== "/") return;'],
    ["dica de teclado", "para percorrer"],
    ["ramo de erro separado", "button-retry-registros"],
  ])("%s continua lá", (_nome, trecho) => {
    expect(tela).toContain(trecho);
  });

  it("os testids antigos sobreviveram", () => {
    for (const t of [
      "filter-kind", "filter-event", "select-period-filter", "button-clear-filters",
      "card-photo-", "link-event-", "img-zoom", "button-zoom-prev", "button-zoom-next",
      "button-zoom-download", "button-load-more", "button-retry-registros",
      "input-search-registros",
    ]) {
      expect(tela, `${t} sumiu`).toContain(t);
    }
  });
});
describe("desempenho com 3.800 fotos originais (25/08)", () => {
  // As fotos sobem ORIGINAIS da câmera (megabytes). A tela travava por três
  // razões, e cada uma tem a sua trava aqui.
  const tela = readFileSync(path.resolve(__dirname, "../../client/src/pages/registros.tsx"), "utf8");

  it("cartão fora da janela não pinta, não decodifica e (lazy) nem baixa", () => {
    expect(tela).toContain(".reg-cartao { content-visibility: auto; contain-intrinsic-size: auto 430px; }");
    expect(tela).toContain('className="group reg-cartao"');
    // o lazy da <img> do cartão continua — é o que segura o download
    expect(tela).toContain('loading="lazy" decoding="async"');
  });

  it("o botão do par NÃO baixa uma segunda foto original para 26px", () => {
    // era <img src={srcOf(outra)}> em cada cartão — dobrava o download da grade
    expect(tela).not.toContain("srcOf(outra)");
    expect(tela).toContain("<KoIcone style={{ width: 14, height: 14, color: ko.color }} />");
  });

  it("o índice do par vem de um Map, não de findIndex dentro do render", () => {
    expect(tela).toContain("const idxPorId = useMemo(() => {");
    expect(tela).toContain("const idxOutra = idxPorId.get(outra.id) ?? -1;");
    expect(tela).toContain("const i = idxPorId.get(f.id) ?? -1;");
    // o único findIndex que resta roda uma vez por clique (alvo do par), não por cartão
    expect((tela.match(/filtered\.findIndex/g) ?? []).length).toBe(1);
  });
});
