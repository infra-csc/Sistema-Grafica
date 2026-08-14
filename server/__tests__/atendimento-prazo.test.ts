// Prazo da tela de Atendimento (client/src/lib/atendimento-prazo.ts).
//
// O que estes testes travam: o marco desta tela é a APROVAÇÃO DE LAYOUT
// (deadlineAprovacaoLayout do evento, padrão −12 sobre a saída do caminhão), e
// não a saída em si. A regra estava escrita duas vezes na página — card da
// lista e cabeçalho do modal — e as duas divergiram na prática (o modal chegou
// a mostrar a saída do caminhão, semanas depois da decisão). Agora é uma só, e
// o filtro "Atrasados" é o terceiro leitor dela.
import { describe, it, expect } from "vitest";
import {
  OFFSET_APROVACAO_PADRAO,
  filtrarAtrasadosNaAprovacao,
  inicioDoDia,
  isEventoAtrasadoNaAprovacao,
  prazoAprovacaoLayout,
} from "../../client/src/lib/atendimento-prazo";
import { STAGE_DEFS } from "../services/prazo-domain";

const HOJE = inicioDoDia(new Date(2026, 7, 14, 10, 0, 0)); // 14/08/2026

/** Saída do caminhão no formato que o servidor devolve (ISO em UTC). */
function saida(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toISOString();
}

describe("marco de Aprovação de Layout", () => {
  it("o padrão é o mesmo da etapa 'aprovacao' do domínio de prazos", () => {
    // Espelho explícito: se o dono mudar o padrão do funil, este teste avisa
    // que a tela de Atendimento ficou para trás.
    const etapa = STAGE_DEFS.find((s) => s.key === "aprovacao")!;
    expect(etapa.offsetField).toBe("deadlineAprovacaoLayout");
    expect(OFFSET_APROVACAO_PADRAO).toBe(etapa.defaultOffset);
  });

  it("aplica o offset padrão de −12 dias sobre a saída", () => {
    const p = prazoAprovacaoLayout({ truckDepartureDate: saida(2026, 9, 3) }, HOJE)!;
    expect(p.dia.getDate()).toBe(22); // 03/09 − 12d = 22/08
    expect(p.dia.getMonth()).toBe(7);
    expect(p.diff).toBe(8);
  });

  it("respeita o offset gravado no evento", () => {
    const p = prazoAprovacaoLayout(
      { truckDepartureDate: saida(2026, 9, 3), deadlineAprovacaoLayout: -30 },
      HOJE,
    )!;
    expect(p.dia.getMonth()).toBe(7); // 04/08
    expect(p.dia.getDate()).toBe(4);
    expect(p.diff).toBe(-10);
  });

  it("evento sem saída marcada não tem prazo inventado", () => {
    expect(prazoAprovacaoLayout({ truckDepartureDate: null }, HOJE)).toBeNull();
    expect(prazoAprovacaoLayout({}, HOJE)).toBeNull();
    expect(prazoAprovacaoLayout(null, HOJE)).toBeNull();
  });

  it("data ilegível devolve null em vez de NaN na tela", () => {
    expect(prazoAprovacaoLayout({ truckDepartureDate: "quinta que vem" }, HOJE)).toBeNull();
  });

  it("`limite` guarda a hora (rótulo do modal) e `dia` a meia-noite (conta de dias)", () => {
    const p = prazoAprovacaoLayout({ truckDepartureDate: saida(2026, 9, 3) }, HOJE)!;
    expect(p.limite.getTime()).toBeGreaterThan(p.dia.getTime());
    expect(p.dia.getHours()).toBe(0);
  });
});

describe("atrasado é medido pela APROVAÇÃO, não pela saída do caminhão", () => {
  it("evento com saída no futuro já pode estar atrasado na aprovação", () => {
    // Saída 20/08 — daqui a 6 dias, folgadíssima. Aprovação: 08/08, vencida.
    const ev = { truckDepartureDate: saida(2026, 8, 20) };
    expect(prazoAprovacaoLayout(ev, HOJE)!.diff).toBe(-6);
    expect(isEventoAtrasadoNaAprovacao(ev, HOJE)).toBe(true);
  });

  it("cobrar pela saída do caminhão esconderia o atraso", () => {
    // A prova de por que o filtro NÃO usa a saída: pelo prazo mais folgado do
    // fluxo, este mesmo evento apareceria como "em dia".
    const ev = { truckDepartureDate: saida(2026, 8, 20) };
    const diffPelaSaida = Math.ceil(
      (inicioDoDia(new Date(ev.truckDepartureDate)).getTime() - HOJE.getTime()) / 86400000,
    );
    expect(diffPelaSaida).toBeGreaterThan(0);
    expect(isEventoAtrasadoNaAprovacao(ev, HOJE)).toBe(true);
  });

  it("vence hoje ainda não é atraso", () => {
    expect(isEventoAtrasadoNaAprovacao({ truckDepartureDate: saida(2026, 8, 26) }, HOJE)).toBe(false);
  });

  it("evento sem saída não é atrasado", () => {
    expect(isEventoAtrasadoNaAprovacao({ truckDepartureDate: null }, HOJE)).toBe(false);
    expect(isEventoAtrasadoNaAprovacao(null, HOJE)).toBe(false);
  });
});

describe("recorte da lista", () => {
  const eventos = new Map<string, any>([
    ["vencido", { id: "vencido", truckDepartureDate: saida(2026, 8, 20) }],
    ["emDia", { id: "emDia", truckDepartureDate: saida(2026, 10, 1) }],
    ["semSaida", { id: "semSaida", truckDepartureDate: null }],
  ]);
  const lista = [
    { id: "a", eventId: "vencido" },
    { id: "b", eventId: "emDia" },
    { id: "c", eventId: "semSaida" },
    { id: "d", eventId: null },
  ];

  it("devolve só as peças de evento com aprovação vencida", () => {
    expect(filtrarAtrasadosNaAprovacao(lista, eventos, HOJE).map((i) => i.id)).toEqual(["a"]);
  });

  it("peça de evento desconhecido não entra no recorte", () => {
    const orfa = [{ id: "x", eventId: "nao-existe" }];
    expect(filtrarAtrasadosNaAprovacao(orfa, eventos, HOJE)).toEqual([]);
  });

  it("não modifica a lista de entrada", () => {
    const copia = [...lista];
    filtrarAtrasadosNaAprovacao(lista, eventos, HOJE);
    expect(lista).toEqual(copia);
  });
});

describe("âncora de hoje", () => {
  it("inicioDoDia zera a hora sem mexer no objeto recebido", () => {
    const agora = new Date(2026, 7, 14, 23, 59, 59);
    const d = inicioDoDia(agora);
    expect(d.getHours()).toBe(0);
    expect(agora.getHours()).toBe(23);
  });

  it("a mesma âncora dá a mesma resposta o dia inteiro", () => {
    const ev = { truckDepartureDate: saida(2026, 8, 30) };
    const manha = prazoAprovacaoLayout(ev, inicioDoDia(new Date(2026, 7, 14, 0, 1)))!;
    const noite = prazoAprovacaoLayout(ev, inicioDoDia(new Date(2026, 7, 14, 23, 59)))!;
    expect(manha.diff).toBe(noite.diff);
  });
});
