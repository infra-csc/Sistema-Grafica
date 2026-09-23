// ─────────────────────────────────────────────────────────────────────────────
// OS SEIS MARCOS DO EVENTO, DO LADO DO SERVIDOR — rodando.
//
// Veio de marcos-do-evento-fonte-unica.test.ts ("o servidor continua cobrando
// os seis" e "a coluna da finalização existe no banco"), que liam o texto de
// server/routes/events.ts e shared/schema.ts. Aqui: enrichEvent (a conta do
// "próximo marco" da lista e do detalhe) roda para cada marco de
// MARCOS_DO_EVENTO, e o schema é lido pelo drizzle.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {}, pool: {} }));

import { getTableConfig } from "drizzle-orm/pg-core";
import { events } from "@shared/schema";
import { MARCOS_DO_EVENTO } from "@shared/prazo-dates";
import { enrichEvent } from "../routes/events";

const DIA = 86_400_000;
// Uma quarta-feira ao meio-dia UTC; a saída do caminhão 60 dias depois (também quarta).
const HOJE = Date.UTC(2026, 0, 7, 12);
const SAIDA = new Date(HOJE + 63 * DIA);
/** Um status de peça que ainda está parado NESTE marco (a ordem é a da lista). */
const PARADA_NO_MARCO: Record<string, string> = {
  listaImagens: "draft", layouts: "awaiting_submission", aprovacao: "awaiting_sponsor_approval",
  finalizacao: "awaiting_finalization", revisao: "awaiting_final_review", producao: "ready_for_production",
};

const evento = (over: Record<string, unknown> = {}) => ({
  id: "ev-1", name: "COPA", status: "created", startDate: new Date(SAIDA.getTime() + 2 * DIA).toISOString().slice(0, 10),
  truckDepartureDate: SAIDA, ...over,
});

describe("o servidor cobra os seis marcos, cada um pela SUA coluna", () => {
  it.each(MARCOS_DO_EVENTO.map((m) => [m.key, m] as const))("%s", (_key, m) => {
    expect(PARADA_NO_MARCO[m.key], `falta um status de exemplo para ${m.key}`).toBeDefined();
    const pecas = [{ status: PARADA_NO_MARCO[m.key] }];

    // Sem prazo gravado: o offset padrão do marco (o mesmo de shared).
    const padrao = enrichEvent(evento(), pecas, [], HOJE).nextMilestone!;
    expect(padrao).toMatchObject({ key: m.key, label: m.label, pendingItems: 1 });

    // Com a coluna do marco preenchida, o prazo anda junto — é ELA que o
    // servidor lê. Offset em múltiplos de 7 dias não cai em fim de semana.
    const outra = m.offset - 7;
    const custom = enrichEvent(evento({ [m.campo]: outra }), pecas, [], HOJE).nextMilestone!;
    expect(custom.key).toBe(m.key);
    expect(Date.parse(padrao.deadline) - Date.parse(custom.deadline)).toBe(7 * DIA);
  });

  it("a ordem do funil é a de MARCOS_DO_EVENTO: a peça mais atrasada manda", () => {
    const todas = MARCOS_DO_EVENTO.map((m) => ({ status: PARADA_NO_MARCO[m.key] }));
    expect(enrichEvent(evento(), todas, [], HOJE).nextMilestone?.key).toBe(MARCOS_DO_EVENTO[0].key);
  });
});

describe("as colunas dos marcos existem no banco", () => {
  it("cada marco tem a sua coluna inteira em events — inclusive a da finalização", () => {
    const colunas = new Map(getTableConfig(events).columns.map((c) => [c.name, c]));
    const porPropriedade = new Map(Object.entries(events).filter(([, v]) => (v as any)?.columnType).map(([k, v]) => [k, (v as any).name]));
    for (const m of MARCOS_DO_EVENTO) {
      const nome = porPropriedade.get(m.campo);
      expect(nome, `events.${m.campo} não existe no schema`).toBeDefined();
      expect(colunas.get(nome!)?.columnType, m.campo).toBe("PgInteger");
    }
    expect(porPropriedade.get("deadlineFinalizacao")).toBe("deadline_finalizacao");
  });
});
