// ─────────────────────────────────────────────────────────────────────────────
// "COM REAPROVEITAMENTO" REVELA AS ENTREGUES (defeito do dono, 27/08: "filtro
// de reaproveitamento não funciona").
//
// O que acontecia: a opção no menu de Status prometia 667 peças (contadas no
// pool que ignora status), mas o clique passava pela ocultação-padrão das
// entregues — e o reuso vive quase todo no arquivo. A tela tem uma invariante
// escrita em grafica-filtros.ts: TODA OPÇÃO OFERECIDA ENTREGA EXATAMENTE A
// CONTAGEM QUE MOSTRA. O reuso agora é o terceiro recorte que revela, ao lado
// de status e evento.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));
const { itemCasaFiltros, escondeEntregues, FILTROS_VAZIOS } = await import("../../client/src/lib/grafica-filtros");

const ctx = { groupOf: () => "", hojeUTC: Date.UTC(2026, 7, 27) };
const base = { type: "2x1", description: "", displayId: "#1", status: "produced", eventId: "e1", event: { name: "X" } } as any;

describe("o filtro filtra", () => {
  it("ligado, peça sem reuso some — total (isReuse) e parcial (reuseQty) contam", () => {
    const f = { ...FILTROS_VAZIOS, reaproveitamento: true };
    expect(itemCasaFiltros({ ...base, isReuse: false, reuseQty: 0 }, f, ctx)).toBe(false);
    expect(itemCasaFiltros({ ...base, isReuse: false, reuseQty: 2, quantity: 3 }, f, ctx)).toBe(true);
    expect(itemCasaFiltros({ ...base, isReuse: true, reuseQty: 0 }, f, ctx)).toBe(true);
  });

  it("combinado com status selecionados, as duas réguas valem juntas", () => {
    const f = { ...FILTROS_VAZIOS, reaproveitamento: true, status: ["produced", "delivered"] };
    expect(itemCasaFiltros({ ...base, isReuse: false, reuseQty: 0 }, f, ctx)).toBe(false);
    expect(itemCasaFiltros({ ...base, status: "inProduction", isReuse: true }, f, ctx)).toBe(false);
  });
});

describe("e revela o arquivo — a parte que faltava", () => {
  it("peça reaproveitada ENTREGUE aparece com o filtro ligado", () => {
    const f = { ...FILTROS_VAZIOS, reaproveitamento: true };
    expect(escondeEntregues(f)).toBe(false);
    expect(itemCasaFiltros({ ...base, status: "delivered", isReuse: true, reuseQty: 3, quantity: 3 }, f, ctx)).toBe(true);
    // entregue SEM reuso continua fora — revelar não é escancarar
    expect(itemCasaFiltros({ ...base, status: "delivered", isReuse: false, reuseQty: 0 }, f, ctx)).toBe(false);
  });

  it("sem o filtro, a ocultação-padrão das entregues segue de pé", () => {
    expect(escondeEntregues({ ...FILTROS_VAZIOS })).toBe(true);
    expect(itemCasaFiltros({ ...base, status: "delivered", isReuse: true }, { ...FILTROS_VAZIOS }, ctx)).toBe(false);
  });
});
