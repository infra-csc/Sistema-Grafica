// O Painel Geral e os eventos que saíram de circulação.
//
// O caso que originou tudo: o "SÓ QUERO PEDALAR SP", encerrado À MÃO em 09/08,
// aparecia no Painel com o chip "ATRASADO 8D · 66 PENDENTES" e mais nada — a
// tela cobrava, em vermelho, um evento que já tinha saído das cinco filas de
// trabalho e da Gestão de Prazos. Cada bloco abaixo prende uma das três coisas
// que precisavam mudar: o evento passa a DIZER o que aconteceu, o número do
// passivo NÃO pode sumir junto com a cobrança, e a ocultação nunca pode ser
// silenciosa.
import { describe, expect, it } from "vitest";
import {
  seloEventoFinalizado, chipOcultas, buscaEhCodigoDaPeca,
  CONTAGEM_OCULTAS_ZERO, type ContagemOcultas,
} from "@/lib/painel-encerrados";
import { businessDayStrToMs } from "@shared/prazo-dates";

const hoje = businessDayStrToMs("2026-08-14");
const evento = (over: Record<string, unknown> = {}) =>
  ({ status: "created", startDate: "2026-08-20", ...over }) as any;

// Cores que a régua da casa proíbe como cor de TEXTO.
const PROIBIDAS = ["#f97316", "#a8a29e"];

describe("seloEventoFinalizado", () => {
  it("evento em jogo não ganha selo nenhum", () => {
    expect(seloEventoFinalizado(evento(), hoje, 66)).toBeNull();
    expect(seloEventoFinalizado(null, hoje, 0)).toBeNull();
    // Evento sem data de início nunca é finalizado pela data — sumir por falta
    // de cadastro esconderia justamente o evento mais mal cadastrado.
    expect(seloEventoFinalizado(evento({ startDate: null }), hoje, 3)).toBeNull();
  });

  it("encerramento manual fala a língua da lista de Eventos", () => {
    const selo = seloEventoFinalizado(evento({ status: "closed" }), hoje, 66)!;
    expect(selo.motivo).toBe("encerrado");
    expect(selo.label).toBe("Encerrado manualmente");
    expect(selo.short).toBe("Encerrado");
    // A frase oferece a volta: encerrar é decisão de gente e tem reabrir.
    expect(selo.hint).toContain("reabrir");
    expect(selo.hint).toContain("66 peças ficaram em aberto");
  });

  it("o caso real do SÓ QUERO PEDALAR SP: encerrado à mão ANTES da data do evento", () => {
    // status closed + startDate 09/08 (já passou). O encerramento manual vem
    // primeiro: é a decisão de uma pessoa, e continua sendo a explicação certa
    // mesmo depois de a data passar.
    const selo = seloEventoFinalizado(evento({ status: "closed", startDate: "2026-08-09" }), hoje, 66)!;
    expect(selo.motivo).toBe("encerrado");
  });

  it("data que passou é 'realizado', e o rótulo depende de ter sobrado trabalho", () => {
    const comPend = seloEventoFinalizado(evento({ startDate: "2026-08-13" }), hoje, 4)!;
    expect(comPend.motivo).toBe("realizado");
    expect(comPend.label).toBe("Realizado com pendências");
    const semPend = seloEventoFinalizado(evento({ startDate: "2026-08-13" }), hoje, 0)!;
    expect(semPend.label).toBe("Realizado sem pendências");
    // "Concluído" é o fim FELIZ da lista de Eventos (tudo entregue) e não pode
    // ser afirmado só porque nenhuma peça está em status aberto — cancelada
    // também não está.
    expect(semPend.label).not.toContain("Concluído");
  });

  it("durante o DIA do evento ele ainda conta", () => {
    expect(seloEventoFinalizado(evento({ startDate: "2026-08-14" }), hoje, 9)).toBeNull();
  });

  it("a frase da PEÇA começa em 'Evento' — o que acabou não foi a peça", () => {
    const enc = seloEventoFinalizado(evento({ status: "closed" }), hoje, 1)!;
    const real = seloEventoFinalizado(evento({ startDate: "2026-08-01" }), hoje, 1)!;
    expect(enc.labelPeca).toBe("Evento encerrado");
    expect(real.labelPeca).toBe("Evento realizado");
    // Vem de `marcoEventoFinalizado` (lib/status), a MESMA frase da trilha da
    // ficha — se alguém mudar lá, muda aqui, e nunca há duas versões.
    expect(real.hintPeca).toContain("Não há autor nem volta");
  });

  it("nenhuma cor proibida entra como cor de texto", () => {
    for (const selo of [
      seloEventoFinalizado(evento({ status: "closed" }), hoje, 1)!,
      seloEventoFinalizado(evento({ startDate: "2026-08-01" }), hoje, 1)!,
    ]) {
      expect(PROIBIDAS).not.toContain(selo.text);
    }
  });
});

describe("chipOcultas", () => {
  const c = (over: Partial<ContagemOcultas>): ContagemOcultas => ({ ...CONTAGEM_OCULTAS_ZERO, ...over });

  it("sem nada oculto não existe chip", () => {
    expect(chipOcultas(CONTAGEM_OCULTAS_ZERO, false)).toBeNull();
  });

  it("o destaque é o PASSIVO quando há peça em aberto", () => {
    const chip = chipOcultas(c({ encerrado: 120, encerradoAberto: 66 }), false)!;
    expect(chip.numero).toBe(66);
    expect(chip.total).toBe(120);
    // O total não fica escondido: ele vai no rótulo da própria ação, que é
    // onde a pessoa lê o que vai acontecer se clicar.
    expect(chip.acao).toBe("mostrar as 120 ocultas");
  });

  it("sem nada em aberto o destaque cai para o total — nunca um zero", () => {
    // É este o caso em que a ocultação viraria silenciosa: 40 peças fora da
    // lista e um chip anunciando "0".
    const chip = chipOcultas(c({ realizado: 40 }), false)!;
    expect(chip.numero).toBe(40);
    expect(chip.emAberto).toBe(0);
    expect(chip.acao).toBe("mostrar");
  });

  it("a composição por origem sempre aparece por extenso", () => {
    const chip = chipOcultas(c({ encerrado: 10, realizado: 5, encerradoAberto: 2, realizadoAberto: 1 }), false)!;
    expect(chip.title).toContain("10 peças em evento encerrado manualmente");
    expect(chip.title).toContain("5 peças em evento já realizado");
    expect(chip.title).toContain("3 ainda estão em aberto");
  });

  it("com as peças reveladas o chip continua na tela, oferecendo o caminho de volta", () => {
    const chip = chipOcultas(c({ encerrado: 120, encerradoAberto: 66 }), true)!;
    expect(chip.acao).toBe("ocultar");
    expect(chip.title).toContain("Clique para tirá-las da lista de novo");
  });

  it("singular e plural", () => {
    const um = chipOcultas(c({ realizado: 1 }), false)!;
    expect(um.texto).toContain("peça de evento");
    const dois = chipOcultas(c({ realizado: 2 }), false)!;
    expect(dois.texto).toContain("peças de evento");
  });
});

describe("buscaEhCodigoDaPeca", () => {
  it("o código exato vence a ocultação", () => {
    expect(buscaEhCodigoDaPeca("#3089", "#3089")).toBe(true);
    expect(buscaEhCodigoDaPeca("#3089", "3089")).toBe(true);
    expect(buscaEhCodigoDaPeca("#3089", " 3089 ")).toBe(true);
    expect(buscaEhCodigoDaPeca("#0062-C1", "0062-c1")).toBe(true);
  });

  it("busca por texto solto NÃO abre a ocultação", () => {
    // Se qualquer palavra revelasse evento encerrado, o recorte padrão viraria
    // loteria: às vezes o evento morto aparece, às vezes não, e nunca dá para
    // entender por quê.
    expect(buscaEhCodigoDaPeca("#3089", "308")).toBe(false);
    expect(buscaEhCodigoDaPeca("#3089", "banner")).toBe(false);
    expect(buscaEhCodigoDaPeca("#3089", "")).toBe(false);
    expect(buscaEhCodigoDaPeca("#3089", "  ")).toBe(false);
    expect(buscaEhCodigoDaPeca(null, "3089")).toBe(false);
  });
});
