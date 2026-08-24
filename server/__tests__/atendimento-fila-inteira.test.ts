// ─────────────────────────────────────────────────────────────────────────────
// A FILA DO ATENDIMENTO CHEGA INTEIRA E ABERTA.
//
// Duas decisões do dono no mesmo dia (24/08), a segunda revendo a primeira:
// primeiro os eventos passaram a abrir recolhidos (a rolagem era enorme), e
// depois voltaram a abrir expandidos — porque a lista existe para VARRER o que
// espera decisão, e fechada ela obrigava a clicar evento por evento para
// descobrir onde estava o trabalho.
//
// O que sustentava "fechado" era o custo de desenhar tudo. Esse custo foi
// tratado onde ele mora, e é isso que este arquivo guarda:
//
//   · `content-visibility: auto` no grupo — o que está fora da tela não é
//     desenhado, mas continua no DOM (Ctrl+F, leitor de tela e links seguem
//     funcionando, o que uma lista virtualizada quebraria);
//   · `contain-intrinsic-size` com estimativa real, senão a barra de rolagem
//     pula enquanto se rola e o remédio fica pior que a doença;
//   · `loading="lazy"` nas thumbs das listas longas — 227 linhas abertas de
//     uma vez são 227 downloads simultâneos.
//
// E o "Carregar mais" da fila saiu: ele paginava PEÇAS antes do agrupamento,
// então não escondia linhas — escondia EVENTOS INTEIROS.
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

describe("e chega aberta", () => {
  it("o estado guarda quem está RECOLHIDO: vazio = tudo aberto", () => {
    expect(TELA).toContain("const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set());");
    expect(TELA).toContain("const eventoAberto = (id: string) => !collapsedEvents.has(id);");
  });

  it("e o toggle continua, para quem quiser fechar o que não interessa", () => {
    expect(TELA).toContain("onClick={() => toggleEventCollapsed(eventId)}");
    expect(TELA).toContain("aria-expanded={eventoAberto(eventId)}");
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
