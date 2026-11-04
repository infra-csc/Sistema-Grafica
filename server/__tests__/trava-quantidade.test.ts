import { describe, expect, it, vi } from "vitest";
vi.mock("../db", () => ({ db: {}, pool: {} }));
import { planejarEdicao } from "../services/edicao-da-peca";
import { CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import type { Item } from "@shared/schema";

// Fernanda, 04/11, #8272: travou a peça porque a medida mudou, a medida passou e a
// quantidade não, com a frase "fale com" ela mesma.
const peca = (extra: Partial<Item> = {}) => ({
  id: "p1", displayId: "#8272", status: "ready_for_production", quantity: 1, quantityProduced: null,
  reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  travadaEm: new Date("2026-11-04T12:00:00Z"), travadaPor: "Fernanda", travadaMotivo: "Arte vai mudar",
  ...extra,
}) as unknown as Item;

const editar = (p: Item, quantity: number, podeAjustar: boolean) => planejarEdicao(p, { quantity } as never, {}, false, podeAjustar);
const recusada = (r: unknown) => (r as { recusa?: { status: number; corpo: { code?: string } } }).recusa;

describe("quantidade da peça travada", () => {
  it("quem trava sobe a quantidade sem destravar", () => {
    const r = editar(peca(), 2, true) as { updatePayload: { quantity?: number; travadaEm?: unknown }; mudouQtd: boolean };
    expect(recusada(r)).toBeUndefined();
    expect(r.mudouQtd).toBe(true);
    expect(r.updatePayload.quantity).toBe(2);
    // A trava continua: a edição não mexe nela.
    expect(r.updatePayload.travadaEm).toBeUndefined();
  });

  it("quem trava reduz a quantidade sem destravar", () => {
    expect(recusada(editar(peca({ quantity: 5 }), 3, true))).toBeUndefined();
  });

  it("os demais papéis seguem recusados", () => {
    const r = recusada(editar(peca(), 2, false));
    expect(r?.status).toBe(409);
    expect(r?.corpo.code).toBe(CODIGO_PECA_TRAVADA);
  });

  it("a redução que faria a peça virar Produzido é recusada até para quem trava", () => {
    const r = recusada(editar(peca({ status: "inProduction", quantity: 10, quantityProduced: 6 }), 6, true));
    expect(r?.status).toBe(409);
    expect(r?.corpo.code).toBe(CODIGO_PECA_TRAVADA);
  });

  it("aumento em produção continua indo para o complemento", () => {
    const r = recusada(editar(peca({ status: "inProduction", quantity: 5, quantityProduced: 2 }), 8, true));
    expect(r?.corpo.code).toBe("USE_COMPLEMENT");
  });

  it("peça sem trava segue como antes", () => {
    const r = editar(peca({ travadaEm: null, status: "inProduction", quantity: 10, quantityProduced: 6 }), 6, false) as { promoveuParaProduzido: boolean };
    expect(r.promoveuParaProduzido).toBe(true);
  });
});
