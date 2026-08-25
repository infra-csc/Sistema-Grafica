// ─────────────────────────────────────────────────────────────────────────────
// A CONFERÊNCIA DOS QUATRO HANDOFFS, virada teste.
//
// Revisão, Painel Geral, Calendário e Registros receberam revisões de design, e
// depois uma lista de 48 afirmações verificáveis — "confirme no código e
// conserte só o que não fechar". Uma lista assim se confere uma vez e envelhece
// no dia seguinte; como teste, ela confere a cada commit.
//
// O PADRÃO DE DEFEITO que estas listas procuram é sempre o mesmo, e vale
// escrever porque é o que une itens que parecem soltos:
//
//     o número que a tela MOSTRA ser diferente do número que a ação ENTREGA.
//
// "Liberar 12" mandando 9. Um chip que promete 4 linhas e devolve 0. Um
// cabeçalho de dia que conta o que não está na tela. Uma faceta que oferece um
// evento cujas peças estão ocultas. Todos o mesmo defeito, em telas diferentes.
//
// Duas afirmações da lista não fecham LITERALMENTE, e as duas estão anotadas no
// lugar: a estrutura do modal de Revisão é de colunas e não de faixas, e o
// `#a8a29e` que sobra no Painel é cor de ícone e de separador `aria-hidden`,
// que é o uso que a regra permite. Nos dois casos o EFEITO que a afirmação
// protege está lá; o que muda é o caminho.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");

const REV = ler("client/src/pages/solicitacao.tsx");
const PG = ler("client/src/pages/painel-geral.tsx");
const CAL = ler("client/src/pages/calendario.tsx");
const REG = ler("client/src/pages/registros.tsx");

/** Sem comentários — para as afirmações de AUSÊNCIA. */
const semCom = (s: string) =>
  s.replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map(l => l.replace(/^\s*\/\/.*$/, ""))
    .join("\n");

const conta = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe("Revisão", () => {
  it("1 · a contagem de cada faceta sai do pool sem a própria dimensão", () => {
    expect(REV).toContain("casaRecorte(i, 'sem-arquivo')");
    expect(REV).toContain("casaRecorte(i, 'evento-finalizado')");
  });

  it("2 · o contador do lote é `vivas`, não o tamanho da seleção", () => {
    // "Liberar 12" mandando 9 é o defeito que isto previne — espelho do 409 de
    // lote inteiro do servidor.
    expect(REV).toContain("selecaoLote.vivas");
  });

  it("3 · o aviso das finalizadas aparece nas duas confirmações", () => {
    expect(conta(REV, /avisoLoteFinalizadas\(\)/g)).toBeGreaterThanOrEqual(2);
  });

  it("4 · o par de botões do rodapé continua removido", () => {
    // A cópia dele contava `selectedItemIds` em vez de `vivas`.
    expect(semCom(REV)).not.toContain("Liberar Selecionadas");
  });

  it("5 · a fila tem posição, setas e anúncio", () => {
    expect(REV).toContain("text-queue-position");
    expect(REV).toContain('aria-live="polite"');
    expect(REV).toContain('e.key === "ArrowRight"');
    expect(REV).toContain("disabled={!temProxima}");
  });

  it("6 · decidir avança em vez de fechar, nos dois caminhos", () => {
    expect(conta(REV, /if \(!marcarAvanco\(\)\)/g)).toBe(2);
  });

  it("7a · a moldura da imagem tem eixo definido", () => {
    // `max-*` limita um tamanho, nunca o produz: sozinho, resolve para 2px.
    expect(REV).toContain('flex: "1 1 auto", minHeight: isMobile ? 180 : 140, width: "100%"');
  });

  it("7b · a faixa de comparação tem piso e recorte", () => {
    expect(REV).toContain('flex: "1 1 auto", minHeight: 200, overflow: "hidden"');
  });

  it("7c · a decisão se contém em vez de crescer", () => {
    // A ressalva que vivia aqui ("a estrutura é de colunas, não de faixas")
    // MORREU: o handoff seguinte pediu a reestruturação de verdade, e o
    // modal virou as cinco faixas horizontais que este item descrevia. A
    // contenção agora é a da especificação: as duas metades da faixa de
    // decisão têm teto de 32vh com rolagem própria — sem o teto elas
    // cresceriam até a altura do conteúdo e o modal inteiro rolaria,
    // deixando as decisões fora de vista na abertura.
    expect((REV.match(/maxHeight: isMobile \? "\d+vh" : "32vh", overflowY: "auto"/g) ?? []).length).toBe(2);
    expect(REV).toContain('height: isMobile ? "94dvh" : "87vh", maxHeight: 900');
  });

  it("8 · a ordem é a da saída do caminhão, com os dias à vista", () => {
    expect(REV).toContain("chip-caminhao-");
  });

  it("9 · os oito FreezeWhileClosing continuam", () => {
    // 8 desde 25/08: o diálogo de "Reaproveitar em lote" entrou congelado.
    expect(conta(REV, /<FreezeWhileClosing/g)).toBe(8);
  });

  it("10 · o motivo exige 10 caracteres, contados no texto normalizado", () => {
    // Contar o cru media um motivo cheio de espaços como mais curto do que é, e
    // o botão ficava travado sem explicar por quê.
    expect(REV).toContain('t.trim().replace(/\\s+/g, " ").length < MOTIVO_MIN');
    expect(REV).toContain("avisoMotivoCurto");
  });

  it("11 · o seletor de destino está nas duas devoluções", () => {
    expect(conta(REV, /destino/g)).toBeGreaterThanOrEqual(4);
  });

  it("12 · a guarda de evento finalizado segue de pé", () => {
    expect(REV).toContain("motivoAcaoBloqueada");
    expect(REV).toContain("badge-evento-finalizado-");
    expect(REV).toContain("avisoLoteFinalizadas");
  });
});

describe("Painel Geral", () => {
  it("1 · as marcas de zona têm a largura da soma da zona", () => {
    expect(PG).toContain("zona-tick-");
    expect(PG).toContain("const pct = (n / soma) * 100");
  });

  it("2 · a frase diz há quanto tempo, e a idade sai de statusChangedAt", () => {
    expect(PG).toContain("texto-idade-maior-fila");
    expect(PG).toContain("item?.statusChangedAt ?? item?.status_changed_at");
  });

  it("2c · peça sem registro NÃO exibe idade", () => {
    // Inferir da criação daria um número plausível e errado: uma peça criada há
    // oito meses que entrou em aprovação ontem apareceria como "parada há 240
    // dias", e quem procura gargalo agiria sobre isso.
    expect(PG).toContain("if (!bruto) return null;");
    const i = PG.indexOf("function diasNoEstado");
    expect(PG.slice(i, i + 400)).not.toContain("createdAt");
  });

  it("3 · a escala de idade tem peso, não só cor", () => {
    expect(PG).toContain('return { cor: "#b91c1c", peso: 700 }');
    expect(PG).toContain('if (dias > LIMITE_PARADA) return { cor: "#b45309", peso: 700 }');
    expect(PG).toContain("fontWeight: tom.peso");
  });

  it("4 · o chip de paradas não encolhe", () => {
    const i = PG.indexOf("chip-paradas-");
    expect(i).toBeGreaterThan(-1);
    expect(PG.slice(i, i + 800)).toContain("flexShrink: 0");
  });

  it("6 e 7 · a seleção diz do que é feita", () => {
    expect(PG).toContain("text-selecao-composicao");
  });

  it("8 · `flexShrink: 0` na raiz", () => {
    expect(PG).toContain("flexShrink: 0");
  });

  it("9 · a cadeia de sticky continua calculada", () => {
    expect(PG).toContain("EVENT_HEADER_H");
    expect(PG).toContain("topOffset");
  });

  it("10 e 11 · chip de ocultas e rótulo que muda", () => {
    expect(PG).toContain("chip-atencao-ocultas");
    expect(PG).toContain("Precisa de atenção");
    expect(PG).toContain("Fora da lista");
  });

  it("12 · #a8a29e não voltou como texto informativo", () => {
    // A regra é "só como ícone". As ocorrências que restam são cor de ícone em
    // botão desabilitado e um separador "/" com aria-hidden — que é o uso
    // permitido. Procurar a string crua acusaria as três; o que importa é se há
    // texto que alguém precisa LER naquela cor.
    const informativas = PG.split(/\r?\n/)
      .filter(l => l.includes('color: "#a8a29e"'))
      .filter(l => !l.includes("aria-hidden") && !l.includes("not-allowed"));
    expect(informativas).toEqual([]);
    expect(PG).toContain("#746e69");
  });
});

describe("Calendário", () => {
  it("1 · o passo das setas segue a escala", () => {
    expect(CAL).toContain("d.setDate(d.getDate() + passo * 7)");
    expect(CAL).toContain("currentDate.getMonth() + passo");
  });

  it("2 · a escala viaja na URL e o hash sobrevive", () => {
    expect(CAL).toContain('p.set("escala", "semana")');
    expect(CAL).toContain("window.location.hash");
  });

  it("3 · a semana mostra o nome por extenso", () => {
    expect(CAL).toContain("week-item-");
  });

  it("4 · a ordem de urgência vale nas três leituras", () => {
    expect(conta(CAL, /pesoDaUrgencia/g)).toBeGreaterThanOrEqual(4);
  });

  it("5 · o Resumo e a grade contam o mesmo conjunto", () => {
    expect(CAL).toContain("return DEADLINE_TYPES.some(dt => {");
    expect(CAL).toContain("Eventos que aparecem na grade");
  });

  it("6 · a mesma conversão de data em toda parte", () => {
    expect(CAL).toContain("toUTCDisplayDate(ev.truckDepartureDate)");
    expect(CAL).toContain("parseDateLocal(ev.startDate)");
  });

  it("7 · o tick de 1 minuto continua", () => {
    expect(CAL).toContain("setNow");
  });

  it("8 · encerrado vem antes da prioridade", () => {
    const i = CAL.indexOf("function prioMeta");
    expect(i).toBeGreaterThan(-1);
    expect(CAL.slice(i, i + 400)).toContain("isEventoEncerrado");
  });

  it("9 · o calendário não filtra evento realizado", () => {
    const i = CAL.indexOf("const byDay = useMemo(");
    expect(CAL.slice(i, i + 1500)).not.toContain("isEventoEncerrado");
  });

  it("10 · as cores de hoje e das contagens", () => {
    expect(CAL).toContain('"#c2410c"');
    expect(CAL).toContain('"#dc2626"');
  });

  it("11 e 12 · o dialog filtra como a grade, e o guard do teclado", () => {
    expect(CAL).toContain("e.target !== e.currentTarget");
    expect(conta(CAL, /searchTerm \|\| /g)).toBeGreaterThanOrEqual(3);
  });
});

describe("Registros", () => {
  it("1 · agrupa a fatia visível, não `filtered` inteiro", () => {
    expect(REG).toContain("filtered.slice(0, visible).forEach");
  });

  it("2 · o par, com a redação certa para cada direção", () => {
    expect(REG).toContain("Sem foto de entrega ainda");
    expect(REG).toContain("Entregue sem foto de conferência");
  });

  it("3 · a faixa troca a foto sem fechar o diálogo", () => {
    expect(REG).toContain("strip-same-item");
    expect(REG).toContain("if (alcancavel && !atual) setZoomIdx(i)");
  });

  it("4 · salvar não exige abrir o zoom, e não dispara o zoom", () => {
    expect(REG).toContain("e.stopPropagation(); baixar(p)");
  });

  it("5 · cartão e skeleton na mesma proporção", () => {
    expect(conta(semCom(REG), /aspectRatio: "1\/1"/g)).toBe(2);
  });

  it("6 · as facetas excluem o próprio filtro, e o período mantém a ordem", () => {
    expect(REG).toContain("passes.event(p) && passes.search(p) && passes.period(p)");
    expect(REG).toContain("pinned: true");
  });

  it("7 · o recuo é por cor, não por opacity", () => {
    expect(REG).toContain("dim ? T.second : color");
  });

  it("8 · o ramo de erro é separado do vazio", () => {
    expect(REG).toContain("button-retry-registros");
  });

  it("9 · o zoom é um Dialog com teto de altura", () => {
    expect(REG).toContain("<Dialog open={zoom != null}");
    expect(REG).toContain('maxHeight: "calc(100vh - 48px)"');
  });

  it("10 · brokenIds em estado, com reset a cada photos", () => {
    expect(REG).toContain("useEffect(() => { setBrokenIds(new Set()); }, [photos]);");
  });

  it("11 · alt descritivo e lazy", () => {
    expect(REG).toContain("altOf(p)");
    expect(REG).toContain('loading="lazy"');
  });

  it("12 · alvos de 44px no celular", () => {
    expect(REG).toContain("isMobile ? 44");
  });
});
