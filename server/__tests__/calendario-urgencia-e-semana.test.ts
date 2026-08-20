// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO: O QUE A CÉLULA CORTA, A ESCALA QUE FALTAVA, E OS DOIS MESES.
//
// Três defeitos, e nenhum deles é de aparência.
//
// 1. A CÉLULA CORTAVA POR ORDEM DE INSERÇÃO. Ela mostra 2 itens e o resto vira
//    "+N mais"; a ordem era eventos primeiro, prazos depois. Com 5 prazos por
//    evento mais início e saída, as células estouram com frequência — e o que
//    ficava escondido era arbitrário. Um "Prod. Gráfica" que vence HOJE
//    desaparecia atrás de duas pílulas de início de evento, que é a marcação
//    que menos pede ação de alguém.
//
// 2. FALTAVA A ESCALA DO MEIO. A faixa de alerta cobre 48h, a grade cobre o
//    mês, e a operação trabalha por semana. Na grade de 90px o nome do evento
//    em 10px trunca em ~80px: a pílula é quase decorativa.
//
// 3. O RESUMO CONTAVA UM MÊS E A GRADE DESENHAVA OUTRO. `monthEvents` filtrava
//    por data de INÍCIO; a grade desenha marcadores ancorados na SAÍDA DO
//    CAMINHÃO. Um evento que começa em 12 de setembro com caminhão em 9 de
//    setembro tem três prazos em agosto: aparecia na grade de agosto e não
//    entrava no Resumo de agosto. Os dois números da mesma tela contavam meses
//    diferentes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const tela = readFileSync(
  path.resolve(__dirname, "../../client/src/pages/calendario.tsx"),
  "utf8",
);

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
// A ORDEM DE URGÊNCIA, reimplementada aqui para ser exercitada de verdade.
// É a única regra desta revisão que dá para errar em silêncio: um peso trocado
// não quebra nada, só esconde a marcação errada.
// ─────────────────────────────────────────────────────────────────────────────
const HORA = 3_600_000;
function pesoDaUrgencia(item: { kind: string; ev?: any }, diaMs: number, agoraMs: number): number {
  if (item.kind === "deadline") {
    const hoje = new Date(agoraMs); hoje.setHours(0, 0, 0, 0);
    if (diaMs === hoje.getTime()) return 0;
    if (diaMs < hoje.getTime()) return 1;
    return 4;
  }
  if (item.ev?._type === "departure") {
    const horas = (new Date(item.ev.truckDepartureDate).getTime() - agoraMs) / HORA;
    return horas > 0 && horas < 48 ? 2 : 3;
  }
  return 5;
}

describe("o que a célula corta é o menos urgente", () => {
  const agora = new Date(2026, 7, 20, 10, 0).getTime();
  const hojeMs = new Date(2026, 7, 20).getTime();
  const ontemMs = new Date(2026, 7, 19).getTime();
  const amanhaMs = new Date(2026, 7, 21).getTime();

  const inicio = { kind: "event", ev: { _type: "start" } };
  const saidaLonge = { kind: "event", ev: { _type: "departure", truckDepartureDate: new Date(2026, 8, 15).toISOString() } };
  const saidaPerto = { kind: "event", ev: { _type: "departure", truckDepartureDate: new Date(2026, 7, 21, 8, 0).toISOString() } };
  const prazo = { kind: "deadline" };

  it("prazo que vence hoje vem antes de tudo", () => {
    expect(pesoDaUrgencia(prazo, hojeMs, agora)).toBe(0);
    for (const outro of [inicio, saidaLonge, saidaPerto]) {
      expect(pesoDaUrgencia(prazo, hojeMs, agora)).toBeLessThan(pesoDaUrgencia(outro, hojeMs, agora));
    }
  });

  it("prazo atrasado vem depois do de hoje e antes do resto", () => {
    expect(pesoDaUrgencia(prazo, ontemMs, agora)).toBe(1);
    expect(pesoDaUrgencia(prazo, ontemMs, agora)).toBeGreaterThan(pesoDaUrgencia(prazo, hojeMs, agora));
    expect(pesoDaUrgencia(prazo, ontemMs, agora)).toBeLessThan(pesoDaUrgencia(saidaPerto, ontemMs, agora));
  });

  it("saída em menos de 48h vem antes de saída normal", () => {
    expect(pesoDaUrgencia(saidaPerto, amanhaMs, agora)).toBe(2);
    expect(pesoDaUrgencia(saidaLonge, amanhaMs, agora)).toBe(3);
  });

  it("início de evento é o último — é a marcação que menos pede ação", () => {
    expect(pesoDaUrgencia(inicio, amanhaMs, agora)).toBe(5);
    for (const outro of [prazo, saidaLonge, saidaPerto]) {
      expect(pesoDaUrgencia(inicio, amanhaMs, agora)).toBeGreaterThan(pesoDaUrgencia(outro, amanhaMs, agora));
    }
  });

  it("O CASO DO ENUNCIADO: um prazo de hoje nunca fica atrás de dois inícios", () => {
    const itens = [inicio, inicio, prazo];
    const ordenado = itens.slice().sort((a, b) => pesoDaUrgencia(a, hojeMs, agora) - pesoDaUrgencia(b, hojeMs, agora));
    expect(ordenado[0]).toBe(prazo);
    // A célula corta em 2: o prazo sobrevive ao corte.
    expect(ordenado.slice(0, 2)).toContain(prazo);
  });

  it("a ordenação é estável dentro do mesmo peso", () => {
    // Dois inícios continuam na ordem em que entraram — `sort` estável.
    const a = { kind: "event", ev: { _type: "start", id: "a" } };
    const b = { kind: "event", ev: { _type: "start", id: "b" } };
    const r = [a, b].sort((x, y) => pesoDaUrgencia(x, hojeMs, agora) - pesoDaUrgencia(y, hojeMs, agora));
    expect(r[0]).toBe(a);
  });
});

describe("a ordem chega às três leituras", () => {
  it("a grade ordena antes de cortar em 2", () => {
    const i = tela.indexOf("...dayDeadlines.map(d => ({ kind: \"deadline\" as const");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 900);
    expect(bloco).toContain(".sort((a, c) => pesoDaUrgencia(a, meiaNoiteDe(date), now)");
    // O corte continua em 2 e o "+N mais" também — quem quer o resto abre o dia.
    expect(tela).toContain("allCellItems.slice(0, 2)");
    expect(tela).toContain("+{allCellItems.length - 2} mais");
  });

  it("as barrinhas do celular leem o MESMO array já ordenado", () => {
    // Não há um segundo `allCellItems` para o mobile: os dois ramos do
    // ternário consomem o mesmo.
    const ocorrencias = codigo.split("const allCellItems").length - 1;
    expect(ocorrencias).toBe(1);
  });

  it("e o dialog do dia aplica a mesma régua dentro da seção", () => {
    expect(tela).toContain('pesoDaUrgencia({ kind: "event", ev: a }, meiaNoiteDe(selectedDate), now)');
  });

  it("a semana também", () => {
    const i = tela.indexOf("data-testid={`week-day-");
    expect(i).toBeGreaterThan(-1);
    expect(tela.slice(i - 900, i)).toContain("pesoDaUrgencia(a, meiaNoiteDe(date), now)");
  });
});

describe("a visão de semana", () => {
  it("é um segmented de duas opções, e 'Lista' não voltou", () => {
    // As abas tinham sido removidas por serem estado morto — trocavam um
    // `activeView` que nada lia. Semana volta porque agora tem conteúdo
    // próprio, que era a condição registrada. "Lista" continua sem ter.
    expect(tela).toContain('data-testid="segmented-escala"');
    expect(tela).toContain('role="radiogroup"');
    expect(tela).toContain('["semana", "mes"] as const');
    expect(codigo).not.toContain('"Lista"');
    expect(codigo).not.toContain("activeView");
  });

  it("mostra o nome do evento por extenso", () => {
    // O motivo desta visão existir: na grade de 90px o nome trunca em ~80px.
    const i = tela.indexOf("O NOME POR EXTENSO");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 300);
    expect(bloco).toContain("{ev.name}");
    expect(bloco).not.toContain("textOverflow");
  });

  it("e o horário da saída em monospace", () => {
    expect(tela).toContain('fontFamily: "monospace", fontSize: 12, color: P.secondary, whiteSpace: "nowrap", flexShrink: 0');
    expect(tela).toContain("String(saida.getHours()).padStart(2, \"0\")");
  });

  it("borda sólida para evento, tracejada para prazo", () => {
    expect(tela).toContain('borderLeft: item.kind === "deadline" ? `3px dashed ${cor}` : `3px solid ${cor}`');
  });

  it("dia vazio diz 'Nada marcado', e não em #a8a29e", () => {
    expect(tela).toContain(">Nada marcado</p>");
    const i = tela.indexOf(">Nada marcado</p>");
    expect(tela.slice(i - 200, i)).toContain('color: "#78716c"');
    expect(contraste("#78716c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contraste("#a8a29e", "#ffffff")).toBeLessThan(4.5);
  });

  it("alvo de 44px em cada item da lista", () => {
    const i = tela.indexOf("data-testid={`week-item-");
    expect(tela.slice(i, i + 700)).toContain("minHeight: 44");
  });
});

describe("as setas mudam de passo conforme a escala", () => {
  it("uma semana ou um mês, não sempre um mês", () => {
    // Com a semana na tela, avançar um mês pula quatro semanas e a pessoa
    // perde o lugar.
    const i = tela.indexOf("const andar = (passo: number)");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 500);
    expect(bloco).toContain('if (escala === "semana")');
    expect(bloco).toContain("d.setDate(d.getDate() + passo * 7);");
    expect(bloco).toContain("currentDate.getMonth() + passo");
    // E o `month ± 1` cru saiu dos botões.
    expect(codigo).not.toContain("setCurrentDate(new Date(year, month - 1, 1))");
    expect(codigo).not.toContain("setCurrentDate(new Date(year, month + 1, 1))");
  });

  it("o rótulo acessível das setas acompanha", () => {
    expect(tela).toContain('label={escala === "semana" ? "Semana anterior" : "Mês anterior"}');
  });

  it("a escala viaja na URL, como a busca", () => {
    expect(tela).toContain('if (escala === "semana") p.set("escala", "semana");');
    expect(tela).toContain('}, [searchTerm, escala]);');
    expect(tela).toContain('const v = new URLSearchParams(window.location.search).get("escala");');
  });

  it("e no celular a semana é o padrão", () => {
    // A grade de 62px só mostra barrinhas de 4px, sem nome de evento nenhum.
    expect(tela).toContain('window.innerWidth < 768 ? "semana" : "mes"');
  });
});

describe("o Resumo conta o mês da grade", () => {
  it("entra quem tem QUALQUER marcador no mês exibido", () => {
    const i = tela.indexOf("const monthEvents = useMemo");
    expect(i).toBeGreaterThan(-1);
    const bloco = tela.slice(i, i + 1200);
    expect(bloco).toContain("if (ev.startDate && noMes(parseDateLocal(ev.startDate))) return true;");
    expect(bloco).toContain("if (noMes(saida)) return true;");
    expect(bloco).toContain("return DEADLINE_TYPES.some(dt => {");
    // A âncora e os offsets são os MESMOS que a grade usa.
    expect(bloco).toContain("DEADLINE_DEFAULTS[dt.key]");
    expect(bloco).toContain("toUTCDisplayDate(ev.truckDepartureDate)");
  });

  it("e a regra está escrita na tela", () => {
    expect(tela).toContain("Eventos que aparecem na grade");
  });

  it("as cinco linhas derivam do mesmo monthEvents", () => {
    // Muda completedCount, closedCount, urgentCount e ongoingCount junto — e
    // esse é o ponto: as cinco linhas passam a descrever o que se está vendo.
    for (const c of ["completedCount", "closedCount", "urgentCount", "ongoingCount"]) {
      expect(tela).toContain(c);
    }
    expect(tela).toContain("const ongoingCount   = monthEvents.length - completedCount - closedCount;");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// O QUE NÃO PODE TER SIDO MEXIDO
// ═════════════════════════════════════════════════════════════════════════════
describe("as decisões anteriores continuam de pé", () => {
  it("a âncora dos prazos é a saída do caminhão", () => {
    expect(tela).toContain("DEADLINE_DEFAULTS");
    expect(tela).toContain("const base = toUTCDisplayDate(ev.truckDepartureDate);");
  });

  it("toUTCDisplayDate na saída e parseDateLocal no início", () => {
    // Com `new Date()` cru, em UTC-3 uma saída "00:30" caía na grade um dia
    // antes do que o dialog mostrava, e a contagem ganhava 3h de folga.
    expect(tela).toContain("toUTCDisplayDate(ev.truckDepartureDate)");
    expect(tela).toContain("parseDateLocal(ev.startDate)");
  });

  it("o índice byDay e o tick de 1 minuto", () => {
    expect(tela).toContain("const byDay = useMemo(");
    expect(tela).toContain("setNow");
  });

  it("o calendário NÃO filtra evento realizado", () => {
    // "Um calendário sem o passado não é um calendário."
    const i = tela.indexOf("const byDay = useMemo(");
    const bloco = tela.slice(i, i + 1500);
    expect(bloco).not.toContain("isEventoEncerrado");
    expect(bloco).not.toContain('status !== "completed"');
  });

  it("os controles de dia e o guard do onKeyDown", () => {
    expect(tela).toContain("e.target !== e.currentTarget");
  });

  it("as cores de hoje e das contagens", () => {
    expect(tela).toContain('"#c2410c"');
    expect(tela).toContain('"#dc2626"');
    // Branco sobre o #f97316 saturado dava ~2,8:1.
    expect(contraste("#ffffff", "#f97316")).toBeLessThan(4.5);
    expect(contraste("#c2410c", "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });

  it("Concluídos e Encerrados em linhas separadas", () => {
    expect(tela).toContain("const closedCount    = monthEvents.filter(e => isEventoEncerrado(e)).length;");
  });

  it("os testids antigos sobreviveram", () => {
    for (const t of [
      "title-calendario", "button-prev-month", "button-next-month", "button-today",
      "button-retry-calendar", "calendar-day-", "urgent-event-", "upcoming-event-",
      "dialog-event-", "dialog-deadline-",
    ]) {
      expect(tela, `${t} sumiu`).toContain(t);
    }
  });
});
