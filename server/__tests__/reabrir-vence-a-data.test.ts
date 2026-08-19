// ─────────────────────────────────────────────────────────────────────────────
// A REABERTURA À MÃO VENCE A TRAVA POR DATA.
//
// A regra ANTIGA, escrita no próprio código: "encerrado é sempre decisão de
// gente (tem volta: reabrir); realizado é sempre a data (não tem volta)".
//
// O dono mudou: a data continua encerrando sozinha, mas se ele reabrir, o
// evento volta a circular. O raciocínio é bom — quem reabre um evento SABENDO
// que a data passou está afirmando que ainda há trabalho ali.
//
// O caso que originou: Fit House RJ, data 18/08, hoje 19/08. Ele encerrou e
// reabriu, e as peças em rascunho continuaram travadas — porque a reabertura
// limpava só a primeira das duas origens.
//
// POR QUE UMA COLUNA NOVA, e não `status`: evento nunca encerrado e evento
// reaberto ficam os DOIS em "created". Sem marca própria, "reabriu logo libera"
// liberaria também todo evento passado que ninguém tocou, e a trava de data
// deixaria de existir.
//
// POR QUE TIMESTAMP, e não booleano: a licença é comparada com o DIA DO EVENTO.
// Reabrir ANTES da data não pode valer como licença para depois que ela vencer
// — senão um evento reaberto em janeiro fica destravado para sempre.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { motivoEventoFinalizado, EVENT_CLOSED_STATUS } from "@shared/prazo-dates";

const DIA = 24 * 60 * 60 * 1000;
const evento = (startDate: string, extra: Record<string, unknown> = {}) =>
  ({ status: "created", startDate, ...extra }) as any;

/** 18/08/2026 é o dia do evento; "hoje" é 19/08. */
const DIA_DO_EVENTO = "2026-08-18T00:00:00.000Z";
const HOJE = new Date("2026-08-19T00:00:00.000Z").getTime();

describe("sem reabertura, a data continua encerrando", () => {
  it("evento de ontem está realizado", () => {
    expect(motivoEventoFinalizado(evento(DIA_DO_EVENTO), HOJE)).toBe("realizado");
  });

  it("evento de amanhã continua em jogo", () => {
    expect(motivoEventoFinalizado(evento("2026-08-20T00:00:00.000Z"), HOJE)).toBeNull();
  });

  it("encerramento manual continua vencendo tudo", () => {
    // Encerrado à mão é "encerrado" mesmo com data futura — a decisão da
    // pessoa não depende do calendário.
    const e = evento("2026-12-01T00:00:00.000Z", { status: EVENT_CLOSED_STATUS });
    expect(motivoEventoFinalizado(e, HOJE)).toBe("encerrado");
  });
});

describe("reabrir depois da data destrava", () => {
  it("reaberto hoje libera um evento de ontem", () => {
    const e = evento(DIA_DO_EVENTO, { reopenedAt: new Date(HOJE) });
    expect(motivoEventoFinalizado(e, HOJE)).toBeNull();
  });

  it("a licença é do EVENTO, não global: outro evento passado segue travado", () => {
    // O risco de usar `status` era exatamente este — destravar todo mundo.
    const outro = evento("2026-07-01T00:00:00.000Z");
    expect(motivoEventoFinalizado(outro, HOJE)).toBe("realizado");
  });
});

describe("reabrir ANTES da data não vale como licença futura", () => {
  it("reabertura anterior ao dia do evento não destrava depois", () => {
    // Um evento reaberto em janeiro não pode ficar destravado para sempre:
    // a licença tem de ser posterior ao dia que ela dispensa.
    const e = evento(DIA_DO_EVENTO, { reopenedAt: new Date("2026-01-10T00:00:00.000Z") });
    expect(motivoEventoFinalizado(e, HOJE)).toBe("realizado");
  });

  it("reabertura no dia seguinte ao evento vale", () => {
    const e = evento(DIA_DO_EVENTO, {
      reopenedAt: new Date(new Date(DIA_DO_EVENTO).getTime() + DIA),
    });
    expect(motivoEventoFinalizado(e, HOJE)).toBeNull();
  });
});

describe("encerrar de novo revoga a licença", () => {
  it("evento reaberto e encerrado à mão volta a estar encerrado", () => {
    // A rota /close grava `reopenedAt: null` justamente para isto: sem limpar,
    // a licença antiga sobreviveria ao novo encerramento.
    const e = evento(DIA_DO_EVENTO, { status: EVENT_CLOSED_STATUS, reopenedAt: null });
    expect(motivoEventoFinalizado(e, HOJE)).toBe("encerrado");
  });
});

describe("a rota de reabrir aceita as duas origens", () => {
  it("não exige mais que o evento esteja `closed`", async () => {
    const { readFileSync } = await import("fs");
    const path = await import("path");
    const rotas = readFileSync(
      path.resolve(__dirname, "../routes/events.ts"), "utf8",
    );
    // Antes: 409 quando status !== closed — e a única saída para um evento
    // travado pela data era encerrar primeiro, só para poder reabrir.
    expect(rotas).not.toContain('return res.status(409).json({ error: "Este evento não está encerrado" });');
    expect(rotas).toContain("const motivo = motivoEventoFinalizado(event, todayBusinessMs());");
    expect(rotas).toContain("reopenedAt: new Date()");
    expect(rotas).toContain("reopenedAt: null");
  });
});
