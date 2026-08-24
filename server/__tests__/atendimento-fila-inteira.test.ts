// ─────────────────────────────────────────────────────────────────────────────
// A FILA DO ATENDIMENTO: LISTA INTEIRA, GRUPOS FECHADOS.
//
// São DUAS coisas, e confundi-las custou uma ida e volta. O pedido do dono
// (24/08) é: todos os eventos presentes, sem "carregar mais" — e cada evento
// recolhido, para ele abrir o que interessa.
//
//   LISTA  = quais eventos existem na tela.  Antes: cortada.
//   GRUPO  = se as peças do evento aparecem. Antes: sempre abertas.
//
// O "Carregar mais" era o defeito mais silencioso: paginava as PEÇAS antes do
// agrupamento, então não escondia linhas — escondia EVENTOS INTEIROS. Com 231
// pendências a tela mostrava meia dúzia de eventos, e o botão não avisa que o
// que falta são eventos.
//
// Com a lista inteira, desenhar tudo passa a custar. Isso foi tratado onde o
// custo mora, e é o que a última seção guarda:
//
//   · `content-visibility: auto` no grupo — o que está fora da tela não é
//     desenhado, mas continua no DOM (Ctrl+F, leitor de tela e links seguem
//     funcionando, o que uma lista virtualizada quebraria);
//   · `contain-intrinsic-size` com estimativa real, senão a barra de rolagem
//     pula enquanto se rola e o remédio fica pior que a doença;
//   · `loading="lazy"` nas thumbs das listas longas — 231 linhas abertas de
//     uma vez seriam 231 downloads simultâneos.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const TELA = readFileSync(
  new URL("../../client/src/pages/atendimento.tsx", import.meta.url),
  "utf8",
);

describe("a fila chega inteira", () => {
  it("nenhuma peça é cortada antes de agrupar por evento", () => {
    expect(TELA).toContain("const sorted = [...pendingGroup].sort(comparaPecas);");
    expect(TELA).toContain("sorted.forEach(item => {");
    // O corte antigo fatiava as peças, e com isso sumia com eventos.
    expect(TELA).not.toContain("sorted.slice(0, pendVisible)");
  });

  it("o botão 'Carregar mais' da fila não existe mais", () => {
    expect(TELA).not.toContain('data-testid="button-load-more-pending"');
    expect(TELA).not.toContain("pendVisible");
  });

  it("mas o Histórico mantém a paginação — lá a lista é ilimitada", () => {
    expect(TELA).toContain("setHistVisible(v => v + PAGE_SIZE)");
    expect(TELA).toContain("historyItems.slice(0, histVisible)");
  });
});

describe("e cada grupo chega FECHADO — são duas coisas diferentes", () => {
  // Aqui eu já errei uma vez: "vir todos os eventos" é sobre a LISTA estar
  // completa; "fechados" é sobre cada GRUPO. Uma coisa não implica a outra, e
  // o pedido do dono é lista inteira + grupos recolhidos.
  it("o estado guarda quem está ABERTO: vazio = tudo fechado", () => {
    expect(TELA).toContain("const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());");
    expect(TELA).toContain("const eventoAberto = (id: string) => expandedEvents.has(id);");
    // O sentido invertido é o único que tem valor inicial para "tudo fechado":
    // a lista de eventos muda a cada filtro e não é conhecida no useState.
    expect(TELA).not.toContain("collapsedEvents");
  });

  it("e o toggle continua, para abrir o evento que interessa", () => {
    expect(TELA).toContain("onClick={() => toggleEventCollapsed(eventId)}");
    expect(TELA).toContain("aria-expanded={eventoAberto(eventId)}");
  });

  it("o cabeçalho fechado já carrega o que decide", () => {
    // Se fosse preciso abrir para saber se vale abrir, recolher não ajudaria.
    expect(TELA).toContain("faixa-jornada-");
  });
});

describe("o custo de desenhar tudo foi tratado onde ele mora", () => {
  it("cada grupo de evento pula desenho quando está fora da tela", () => {
    expect(TELA).toContain('contentVisibility: "auto"');
    expect(TELA).toContain("containIntrinsicSize: `auto ${alturaEstimada}px`");
  });

  it("a altura reservada é estimada de verdade, senão a rolagem pula", () => {
    expect(TELA).toContain("128 + eventItems.length * 104");
  });

  it("grupo recolhido reserva só o cabeçalho", () => {
    // Sem isto, fechar um evento deixaria um buraco do tamanho dele embaixo.
    expect(TELA).toContain("const alturaEstimada = eventoAberto(eventId)");
    expect(TELA).toContain(": 128;");
  });

  it("as thumbs das listas longas carregam sob demanda", () => {
    // Três listas: pendentes, aprovados e histórico. Os modais NÃO entram —
    // lá a imagem é o próprio conteúdo, e esperar seria pior.
    expect(TELA.match(/loading="lazy"/g)?.length).toBe(3);
    expect(TELA.match(/decoding="async"/g)?.length).toBe(3);
  });
});
