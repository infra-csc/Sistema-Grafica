// ─────────────────────────────────────────────────────────────────────────────
// O número ao lado de "Revisão Final" no menu (dono, 26/10): "assim como fica
// aparecendo o de solicitações". GET /api/items/revisao-final/contagem conta
// pela MESMA régua da fila da tela (@shared/revisao-final).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";

const H = vi.hoisted(() => ({
  pecas: [
    { id: "a", status: "awaiting_final_review", type: "2x1", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
    { id: "b", status: "awaiting_final_review", type: "Rolo", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
    { id: "k", status: "awaiting_final_review", type: "Placa", kitRemessaId: "r1", criadoPorId: "u-kit", deletedAt: null },
    { id: "book", status: "awaiting_final_review", type: "BOOK COMPLETO", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: null },
    { id: "x", status: "awaiting_final_review", type: "2x1", kitRemessaId: null, criadoPorId: "u-sol", deletedAt: new Date() },
  ],
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: { getItemsByStatuses: vi.fn(async () => H.pecas) } };
});

import { capturarRotas } from "./rotas-de-mentira";
import { registrarFilasEPorEvento } from "../routes/itens/leitura";
import { pecasParaRevisar } from "@shared/revisao-final";

const { chamar } = capturarRotas((app) => registrarFilasEPorEvento(app as any));
const rota = "GET /api/items/revisao-final/contagem";

describe("Revisão Final — o número do menu", () => {
  it("Solicitação da Arena: conta as dela, sem Kit, sem BOOK COMPLETO e sem excluída", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-sol", userRole: "solicitacao", userName: "S" } });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ total: 2 });
  });

  it("admin vê tudo o que a fila mostra (inclusive o Kit)", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-adm", userRole: "admin", userName: "A" } });
    expect(r.body).toEqual({ total: 3 });
  });

  it("usuário do Kit conta só o que enxerga (as peças do Kit dele)", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-kit", userRole: "solicitacao", userName: "K", userKit: true } });
    expect(r.body).toEqual({ total: 1 });
  });

  it("quem não revisa (Gráfica, Arte…) recebe zero", async () => {
    const r = await chamar(rota, { sessao: { userId: "u-g", userRole: "grafica", userName: "G" } });
    expect(r.body).toEqual({ total: 0 });
  });

  it("a régua é a mesma da fila da tela", () => {
    const vivas = H.pecas.filter((p) => !p.deletedAt);
    expect(pecasParaRevisar(vivas, { role: "solicitacao", kit: false }).map((p) => p.id)).toEqual(["a", "b"]);
  });
});
