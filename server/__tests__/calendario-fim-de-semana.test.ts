// ─────────────────────────────────────────────────────────────────────────────
// CALENDÁRIO × GESTÃO DE PRAZOS: O MESMO DIA (dono, 06/10: "Sim").
//
// O Calendário desenhava o marco no dia CRU (saída do caminhão + offset); a
// Gestão de Prazos, a Arte e o Detalhe do Evento cobravam o dia AJUSTADO
// (sábado → sexta, domingo → segunda). Um marco de sábado ficava no sábado
// numa tela e na sexta na outra. A regra agora mora em @shared/prazo-dates
// (`diaDoMarcoUTC`, com a regra `fimDeSemana` de cada marco) e as duas telas
// leem a mesma função. Estes testes travam o RESULTADO (o dia) e a FONTE
// (ninguém volta a escrever a conta à mão no Calendário).
//
// Produção Gráfica (dono, 19/10): "seg-sab" — sábado vale, domingo → sábado.
// Antes ela ficava no dia cru ("todos"), domingo inclusive.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { diaDoMarcoNoCalendario } from "../../client/src/components/calendario/dia-do-marco";
import { MARCOS_DO_EVENTO, deslocamentoDeFimDeSemana, diaDoMarcoUTC, type RegraDeFimDeSemana } from "@shared/prazo-dates";
import { buildEventPrazo, stageDeadline, truckDayUTC, type DomainEvent } from "../services/prazo-domain";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

/** Dia local da Date do Calendário como "YYYY-MM-DD" (é assim que a grade indexa). */
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const marco = (key: string) => MARCOS_DO_EVENTO.find((m) => m.key === key)!;

// 30/10/2026 é sexta. −13 cai no sábado 17/10; −19 no domingo 11/10.
const SAIDA_SEXTA = "2026-10-30T08:00:00.000Z";
// 02/11/2026 é segunda: −1 cai no domingo 01/11; −2 no sábado 31/10.
const SAIDA_SEGUNDA = "2026-11-02T08:00:00.000Z";

const REGRAS: RegraDeFimDeSemana[] = ["seg-sex", "seg-sab", "todos"];

describe("a regra de fim de semana, num lugar só", () => {
  it("seg-sex: sábado anda −1, domingo +1, dia útil fica", () => {
    expect(deslocamentoDeFimDeSemana(6, "seg-sex")).toBe(-1);
    expect(deslocamentoDeFimDeSemana(0, "seg-sex")).toBe(1);
    for (const dow of [1, 2, 3, 4, 5]) expect(deslocamentoDeFimDeSemana(dow, "seg-sex")).toBe(0);
  });

  it("seg-sab (Produção Gráfica, dono 19/10): sábado fica, domingo −1", () => {
    expect(deslocamentoDeFimDeSemana(6, "seg-sab")).toBe(0);
    expect(deslocamentoDeFimDeSemana(0, "seg-sab")).toBe(-1);
    for (const dow of [1, 2, 3, 4, 5]) expect(deslocamentoDeFimDeSemana(dow, "seg-sab")).toBe(0);
  });

  it("todos: nada anda", () => {
    for (const dow of [0, 1, 2, 3, 4, 5, 6]) expect(deslocamentoDeFimDeSemana(dow, "todos")).toBe(0);
  });

  it("stageDeadline (servidor) é a função compartilhada, dia a dia por um ano", () => {
    for (let i = 0; i < 366; i++) {
      const saida = new Date(Date.UTC(2026, 0, 1 + i));
      for (const off of [-25, -20, -13, -12, -10, -8, -1]) {
        for (const regra of REGRAS) {
          expect(stageDeadline(saida, off, regra).getTime()).toBe(diaDoMarcoUTC(saida, off, regra).getTime());
        }
      }
    }
  });
});

describe("Calendário: o marco aparece no dia da Gestão de Prazos", () => {
  it("marco no SÁBADO aparece na SEXTA", () => {
    const d = diaDoMarcoNoCalendario(SAIDA_SEXTA, -13, marco("aprovacao").fimDeSemana);
    expect(diaLocal(d)).toBe("2026-10-16");
    expect(d.getDay()).toBe(5);
  });

  it("marco no DOMINGO aparece na SEGUNDA", () => {
    const d = diaDoMarcoNoCalendario(SAIDA_SEXTA, -19, marco("layouts").fimDeSemana);
    expect(diaLocal(d)).toBe("2026-10-12");
    expect(d.getDay()).toBe(1);
  });

  // dono, 19/10: "Produção da Gráfica pode colocar no sábado". Este teste
  // travava "o domingo continua domingo" (regra antiga, todosOsDias).
  it("Produção Gráfica no DOMINGO aparece no SÁBADO (dono, 19/10)", () => {
    expect(marco("producao").fimDeSemana).toBe("seg-sab");
    const d = diaDoMarcoNoCalendario(SAIDA_SEGUNDA, -1, marco("producao").fimDeSemana);
    expect(diaLocal(d)).toBe("2026-10-31");
    expect(d.getDay()).toBe(6);
  });

  it("Produção Gráfica no SÁBADO fica no SÁBADO (dono, 19/10)", () => {
    const d = diaDoMarcoNoCalendario(SAIDA_SEGUNDA, -2, marco("producao").fimDeSemana);
    expect(diaLocal(d)).toBe("2026-10-31");
    expect(d.getDay()).toBe(6);
  });

  it("dia útil não anda", () => {
    // −14 sobre 30/10 = sexta 16/10.
    expect(diaLocal(diaDoMarcoNoCalendario(SAIDA_SEXTA, -14, "seg-sex"))).toBe("2026-10-16");
  });

  it("para o MESMO evento, os seis marcos caem no dia que a Gestão de Prazos calcula", () => {
    // Prazos próprios escolhidos para cair em fim de semana (e um no útil).
    const ev: DomainEvent = {
      id: "ev-cal", name: "EVENTO DO CALENDÁRIO", status: "created",
      startDate: "2026-11-07T00:00:00.000Z", truckDepartureDate: SAIDA_SEXTA,
      deadlineListaImagens: -27,    // sáb 03/10 → sex 02/10
      deadlineEntregaLayouts: -19,  // dom 11/10 → seg 12/10
      deadlineAprovacaoLayout: -13, // sáb 17/10 → sex 16/10
      deadlineFinalizacao: -6,      // sáb 24/10 → sex 23/10
      deadlineRevisaoLista: -4,     // seg 26/10 (útil)
      deadlineProducaoGrafica: -5,  // dom 25/10 → sáb 24/10 (seg–sáb; dono, 19/10)
    };
    const prazo = buildEventPrazo(ev, [{
      id: "it-1", displayId: "#0001", status: "draft", type: "2x1", quantity: 1,
    }], { today: Date.UTC(2026, 9, 1) });
    expect(prazo).not.toBeNull();
    const esperado: Record<string, string> = {
      listaImagens: "2026-10-02", layouts: "2026-10-12", aprovacao: "2026-10-16",
      finalizacao: "2026-10-23", revisao: "2026-10-26", producao: "2026-10-24",
    };
    for (const st of prazo!.stages) {
      const m = marco(st.key);
      const offset = ev[m.campo] as number;
      const noCalendario = diaLocal(diaDoMarcoNoCalendario(ev.truckDepartureDate, offset, m.fimDeSemana));
      expect(noCalendario, st.key).toBe(st.deadline);
      expect(st.deadline, st.key).toBe(esperado[st.key]);
    }
  });

  it("varredura de um ano: Calendário e Gestão de Prazos nunca discordam do dia", () => {
    let movidos = 0;
    let producaoNoSabado = 0;
    for (let i = 0; i < 366; i++) {
      const saida = new Date(Date.UTC(2026, 0, 1 + i, 8)).toISOString();
      for (const m of MARCOS_DO_EVENTO) {
        const cal = diaLocal(diaDoMarcoNoCalendario(saida, m.offset, m.fimDeSemana));
        const gp = stageDeadline(truckDayUTC(saida), m.offset, m.fimDeSemana).toISOString().slice(0, 10);
        expect(cal).toBe(gp);
        const cru = new Date(Date.UTC(2026, 0, 1 + i + m.offset)).toISOString().slice(0, 10);
        if (cal !== cru) movidos += 1;
        const dow = new Date(`${gp}T12:00:00Z`).getUTCDay();
        // Nenhum marco vence no domingo; só a Produção Gráfica vence no sábado.
        expect(dow, `${m.key} ${gp}`).not.toBe(0);
        if (dow === 6) { expect(m.key).toBe("producao"); producaoNoSabado += 1; }
      }
    }
    // Sanidade: sem nenhum marco movido, o laço não teria testado o ajuste.
    expect(movidos).toBeGreaterThan(0);
    expect(producaoNoSabado).toBeGreaterThan(0);
  });
});

describe("Calendário: a fonte usa a conta compartilhada nos dois pontos", () => {
  const CAL = ler("client/src/pages/calendario.tsx");

  it("grade (byDay) e Resumo do mês (monthEvents) leem diaDoMarcoNoCalendario", () => {
    const usos = CAL.match(/diaDoMarcoNoCalendario\(ev\.truckDepartureDate, offsetDoMarco\(ev, dt\.key\), dt\.fimDeSemana\)/g) ?? [];
    expect(usos.length).toBe(2);
  });

  it("a soma CRUA de offset (sem fim de semana) não volta", () => {
    expect(CAL).not.toMatch(/d\.setDate\(d\.getDate\(\) \+ offset\)/);
  });

  it("a legenda explica a regra — a frase vem da regra do marco", () => {
    expect(CAL).toContain("fraseDaRegraDeFimDeSemana(m.fimDeSemana)");
  });

  it("o dialog do dia diz de onde o marco veio, pela mesma função (dia cru = regra \"todos\")", () => {
    expect(CAL).toContain('diaDoMarcoNoCalendario(event.truckDepartureDate, offsetDoMarco(event, dtype.key), "todos")');
    expect(CAL).toContain("ajusteDeFimDeSemana(cru.getDay(), dtype.fimDeSemana)");
    expect(CAL).toContain("` · cairia no ${ajuste.de}, vence ${ajuste.paraComArtigo}`");
  });
});
