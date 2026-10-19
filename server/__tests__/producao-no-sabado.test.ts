// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO GRÁFICA NO SÁBADO (dono, 19/10).
//
// "Produção da Gráfica pode colocar no sábado" — "se eu quiser colocar no
// sábado, eu poder; aqui ele bloqueia e joga na sexta". A regra virou
// explícita por marco em @shared/prazo-dates (`fimDeSemana`):
//
//   · Produção Gráfica ("seg-sab"): sábado VALE; domingo volta para o SÁBADO
//     (a gráfica trabalha sábado, não domingo — e voltando, o prazo nunca
//     passa da saída do caminhão).
//   · Os outros cinco ("seg-sex"): sábado → sexta, domingo → segunda.
//
// Este arquivo trava a regra e a PARIDADE: o mesmo dia no servidor (Gestão de
// Prazos e card do evento), no Calendário, no Detalhe do Evento, no chip da
// fila da Gráfica, em Máquinas e nos alertas — todos lendo a mesma função.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const {
  MARCOS_DO_EVENTO, DIAS_DA_GRAFICA, FIM_DE_SEMANA_DO_CAMPO, FIM_DE_SEMANA_DO_MARCO,
  diaDoMarcoUTC, ajusteDeFimDeSemana, fraseDaRegraDeFimDeSemana, diaPodeTerPrazo, venceNoDia,
} = await import("@shared/prazo-dates");
const { stageDeadline, truckDayUTC, buildEventPrazo } = await import("../services/prazo-domain");
const { enrichEvent } = await import("../routes/events");
const { fimDoDiaDoPrazo } = await import("../services/deadlineAlerts");
const { diaDoMarcoNoCalendario } = await import("../../client/src/components/calendario/dia-do-marco");
const { calcularMarcos } = await import("../../client/src/components/detalhe-do-evento/regras");
const { prazoDaPeca } = await import("../../client/src/components/grafica/maquinas/regras");
const { ehDiaUtil } = await import("@shared/painel-operacional");

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const diaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const marco = (key: string) => MARCOS_DO_EVENTO.find((m) => m.key === key)!;

// 02/11/2026 é SEGUNDA. Produção −1 → domingo 01/11; −2 → sábado 31/10.
const SAIDA_SEGUNDA = Date.UTC(2026, 10, 2);
// 03/11/2026 é TERÇA. Produção −1 → segunda 02/11 (dia útil).
const SAIDA_TERCA = Date.UTC(2026, 10, 3);

describe("a regra, marco a marco", () => {
  it("Produção Gráfica é seg–sáb; os outros cinco seg–sex", () => {
    expect(DIAS_DA_GRAFICA).toBe("seg-sab");
    expect(FIM_DE_SEMANA_DO_MARCO.producao).toBe("seg-sab");
    expect(FIM_DE_SEMANA_DO_CAMPO.deadlineProducaoGrafica).toBe("seg-sab");
    for (const m of MARCOS_DO_EVENTO.filter((x) => x.key !== "producao")) expect(m.fimDeSemana, m.key).toBe("seg-sex");
  });

  it("produção no SÁBADO fica no sábado", () => {
    expect(iso(diaDoMarcoUTC(SAIDA_SEGUNDA, -2, marco("producao").fimDeSemana))).toBe("2026-10-31");
  });

  it("produção no DOMINGO vai para o SÁBADO (antes ficava no domingo)", () => {
    expect(iso(diaDoMarcoUTC(SAIDA_SEGUNDA, -1, marco("producao").fimDeSemana))).toBe("2026-10-31");
  });

  it("produção em dia útil não anda", () => {
    expect(iso(diaDoMarcoUTC(SAIDA_TERCA, -1, marco("producao").fimDeSemana))).toBe("2026-11-02");
  });

  it("os demais marcos inalterados: sábado → sexta, domingo → segunda", () => {
    for (const m of MARCOS_DO_EVENTO.filter((x) => x.key !== "producao")) {
      expect(iso(diaDoMarcoUTC(SAIDA_SEGUNDA, -2, m.fimDeSemana)), `${m.key} sábado`).toBe("2026-10-30");
      expect(iso(diaDoMarcoUTC(SAIDA_SEGUNDA, -1, m.fimDeSemana)), `${m.key} domingo`).toBe("2026-11-02");
    }
  });

  it("nunca passa da saída do caminhão (offset ≤ −1)", () => {
    for (let i = 0; i < 366; i++) {
      const saida = Date.UTC(2026, 0, 1 + i);
      expect(diaDoMarcoUTC(saida, -1, "seg-sab").getTime()).toBeLessThan(saida);
    }
  });

  it("dias da semana em que algum prazo pode vencer: seg–sáb", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(diaPodeTerPrazo)).toEqual([false, true, true, true, true, true, true]);
    expect(venceNoDia(6, "seg-sab")).toBe(true);
    expect(venceNoDia(6, "seg-sex")).toBe(false);
  });
});

describe("as frases saem da regra", () => {
  it("formulário/Calendário: domingo → sábado na Produção; sábado não tem frase", () => {
    expect(ajusteDeFimDeSemana(0, "seg-sab")).toEqual({ de: "domingo", para: "sábado", paraComArtigo: "no sábado", sentido: "antecipado" });
    expect(ajusteDeFimDeSemana(6, "seg-sab")).toBeNull();
    expect(ajusteDeFimDeSemana(6, "seg-sex")).toEqual({ de: "sábado", para: "sexta", paraComArtigo: "na sexta", sentido: "antecipado" });
    expect(ajusteDeFimDeSemana(0, "seg-sex")).toEqual({ de: "domingo", para: "segunda", paraComArtigo: "na segunda", sentido: "adiado" });
    for (const dow of [0, 6]) expect(ajusteDeFimDeSemana(dow, "todos")).toBeNull();
  });

  it("legenda da regra", () => {
    expect(fraseDaRegraDeFimDeSemana("seg-sab")).toBe("Vale no sábado; se cair no domingo, vence no sábado.");
    expect(fraseDaRegraDeFimDeSemana("seg-sex")).toBe("Se cair no sábado, vence na sexta; no domingo, na segunda.");
  });

  it("o formulário monta \"Cairia no domingo — antecipado para sábado (dd/mm)\" a partir do ajuste", () => {
    const f = ler("client/src/components/eventos/secao-de-prazos.tsx");
    expect(f).toContain("Cairia no {ajuste.de} — {ajuste.sentido} para {ajuste.para} ({fmtDateBR(dateVal)})");
    expect(f).toContain("ajusteDeFimDeSemana(rawDate.getDay(), fimDeSemana)");
    // A frase fixa "antecipado para sexta" (que valia para TODO marco) não volta.
    expect(f).not.toContain("'no sábado — antecipado para sexta'");
    expect(f).toContain("a <strong>Produção Gráfica</strong> vale no sábado");
  });

  it("a Gestão de Prazos explica a exceção nova", () => {
    const g = ler("client/src/pages/gestao-prazos.tsx");
    expect(g).toContain("o prazo dela vale no sábado e, se cair no domingo, é antecipado para o sábado");
    expect(g).not.toContain("roda no fim de semana, e o prazo dela fica no dia");
  });
});

describe("paridade: o mesmo dia em todas as telas, um ano de saídas", () => {
  it("servidor (Gestão de Prazos + card), Calendário, Detalhe, chip/Máquinas e alerta", () => {
    let sabados = 0;
    let domingosMovidos = 0;
    for (let i = 0; i < 366; i++) {
      const saidaIso = new Date(Date.UTC(2026, 0, 1 + i, 8)).toISOString();
      for (const off of [-1, -2, -3, -6]) {
        const servidor = iso(stageDeadline(truckDayUTC(saidaIso), off, marco("producao").fimDeSemana));
        // Calendário
        expect(diaLocal(diaDoMarcoNoCalendario(saidaIso, off, marco("producao").fimDeSemana))).toBe(servidor);
        // Detalhe do Evento
        const { marcos } = calcularMarcos({ truckDepartureDate: saidaIso, deadlineProducaoGrafica: off }, new Date(2026, 0, 1));
        expect(diaLocal(marcos.find((m) => m.key === "producao")!.date)).toBe(servidor);
        // Máquinas (e o chip da fila, que faz a mesma conta)
        const [, mm, dd] = servidor.split("-");
        expect(prazoDaPeca(saidaIso, off)!.data).toBe(`${dd}/${mm}`);
        // Alerta: o fim do dia do prazo (23:59 no fuso do processo) cai no MESMO dia.
        expect(diaLocal(fimDoDiaDoPrazo(new Date(saidaIso).getTime(), off, "deadlineProducaoGrafica"))).toBe(servidor);

        const dowCru = new Date(Date.UTC(2026, 0, 1 + i + off)).getUTCDay();
        const dow = new Date(`${servidor}T12:00:00Z`).getUTCDay();
        expect(dow).not.toBe(0);
        if (dow === 6) sabados++;
        if (dowCru === 0) domingosMovidos++;
      }
    }
    expect(sabados).toBeGreaterThan(100);
    expect(domingosMovidos).toBeGreaterThan(50);
  });

  it("o card do evento (nextMilestone) e a Gestão de Prazos dão o sábado", () => {
    const evento = {
      id: "ev-sab", name: "EVENTO SÁBADO", status: "created",
      startDate: "2026-11-07T00:00:00.000Z", truckDepartureDate: "2026-11-02T08:00:00.000Z",
      deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12,
      deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1, // domingo 01/11
    };
    const itens = [{ id: "i1", displayId: "#1", status: "ready_for_production", type: "2x1", quantity: 1 }];
    const card = enrichEvent(evento, itens, [], Date.UTC(2026, 9, 20));
    expect(card.nextMilestone?.key).toBe("producao");
    expect(card.nextMilestone?.deadline).toBe("2026-10-31");
    const gp = buildEventPrazo(evento as any, itens as any, { today: Date.UTC(2026, 9, 20) });
    expect(gp!.stages.find((s) => s.key === "producao")!.deadline).toBe("2026-10-31");
  });

  it("os demais marcos no alerta seguem seg–sex (sábado → sexta)", () => {
    // Saída segunda 02/11; −2 = sábado 31/10 → sexta 30/10.
    expect(diaLocal(fimDoDiaDoPrazo(Date.UTC(2026, 10, 2, 8), -2, "deadlineRevisaoLista"))).toBe("2026-10-30");
  });
});

describe("o planejado por dia já é seg–sáb — e lê a MESMA regra", () => {
  it("ehDiaUtil: sábado é dia da gráfica, domingo não", () => {
    expect(ehDiaUtil("2026-10-31")).toBe(true);  // sábado
    expect(ehDiaUtil("2026-11-01")).toBe(false); // domingo
    expect(ehDiaUtil("2026-11-02")).toBe(true);  // segunda
  });

  it("a fonte do planejado usa DIAS_DA_GRAFICA", () => {
    expect(ler("shared/painel-operacional.ts")).toContain("venceNoDia(meioDia(d).getUTCDay(), DIAS_DA_GRAFICA)");
  });
});

describe("ninguém volta a escrever a regra à mão", () => {
  it("todo uso passa pela regra do marco (sem boolean, sem `todosOsDias`/`allDays`)", () => {
    const arquivos = [
      "shared/prazo-dates.ts", "server/routes/events.ts", "server/services/prazo-domain.ts",
      "server/services/deadlineAlerts.ts", "client/src/components/detalhe-do-evento/regras.ts",
      "client/src/components/eventos/use-formulario-do-evento.tsx", "client/src/components/eventos/constantes.ts",
      "client/src/components/eventos/secao-de-prazos.tsx", "client/src/lib/arte-rules.ts",
      "client/src/components/calendario/dia-do-marco.ts", "client/src/pages/calendario.tsx",
      "client/src/components/grafica/fila/selos.tsx", "client/src/components/grafica/maquinas/regras.ts",
    ];
    for (const a of arquivos) {
      const src = ler(a);
      expect(src, a).not.toMatch(/\btodosOsDias\b|\ballDays\b/);
    }
  });
});
