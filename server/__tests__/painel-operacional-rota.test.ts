// ─────────────────────────────────────────────────────────────────────────────
// GET /api/analises/painel-operacional — só admin, memo de 60s, e a leitura do
// banco (services/painel-operacional) montando os eventos pela MESMA função da
// Gestão de Prazos, com o book e o evento já realizado tratados como lá.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => {
  const linhas: Record<string, unknown>[] = [];
  const db = {
    select: vi.fn((colunas?: unknown) => ({
      from: () => ({ where: async () => (colunas ? linhas : []) }),
    })),
  };
  const storage = { getAllEvents: vi.fn(async () => [] as unknown[]) };
  return { linhas, db, storage };
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

import { capturarRotas } from "./rotas-de-mentira";
import { registerAnaliseRoutes, limparMemoAnalises } from "../routes/analises";
import { todayBusinessStr } from "../services/prazo-domain";
import { somarDias, type PainelOperacional } from "@shared/painel-operacional";

const { chamar } = capturarRotas((app) => registerAnaliseRoutes(app));
const admin = { userId: "u1", userRole: "admin", userName: "Maria" };

describe("GET /api/analises/painel-operacional", () => {
  beforeEach(() => {
    limparMemoAnalises();
    H.db.select.mockClear();
    H.linhas.length = 0;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("só admin: sem sessão 401, outro papel 403 — e o banco nem é tocado", async () => {
    expect((await chamar("GET /api/analises/painel-operacional", {})).status).toBe(401);
    for (const papel of ["solicitacao", "arte", "grafica", "atendimento", "revisao"]) {
      const r = await chamar("GET /api/analises/painel-operacional", { sessao: { userId: "u2", userRole: papel, userName: "X" } });
      expect(r.status, papel).toBe(403);
    }
    expect(H.db.select).not.toHaveBeenCalled();
  });

  it("as rotas da Análises antiga saíram", async () => {
    await expect(chamar("GET /api/analises/operacao", { sessao: admin })).rejects.toThrow(/Rota não registrada/);
    await expect(chamar("GET /api/analises/tempo-por-etapa", { sessao: admin })).rejects.toThrow(/Rota não registrada/);
  });

  it("admin recebe o painel montado ao vivo; a segunda chamada vem do memo", async () => {
    const hoje = todayBusinessStr();
    const dia = (n: number) => somarDias(hoje, n);
    H.storage.getAllEvents.mockResolvedValue([
      { id: "e1", name: "Copa Norte", status: "created", startDate: dia(10), truckDepartureDate: new Date(`${dia(8)}T00:00:00Z`) },
      { id: "e9", name: "Maratona Antiga", status: "created", startDate: dia(-5), truckDepartureDate: new Date(`${dia(-7)}T00:00:00Z`) },
    ]);
    const ontem = new Date(Date.parse(`${dia(-1)}T15:00:00Z`));
    const base = { type: "Banner", description: null, measurement: "1x1", material: "Lona", finish: "Ilhós", reuseQty: 0, fileWidth: "1", fileHeight: "2",
      visualWidth: null, visualHeight: null, quantityProduced: null, skipApproval: false, isPriority: false, parentItemId: null, complementReason: null,
      rejectedBySponsor: false, rejectedByCreator: false, kitRemessaId: null, createdAt: ontem, updatedAt: ontem, approvalThumbUpdatedAt: null,
      statusChangedAt: ontem, sponsorApprovedAt: null, finalFileUpdatedAt: null, creatorReviewedAt: null, producedAt: null, conferredAt: null };
    H.linhas.push(
      { ...base, id: "i1", displayId: "0001", eventId: "e1", status: "ready_for_production", quantity: 3 },
      { ...base, id: "i2", displayId: "0002", eventId: "e1", status: "ready_for_production", quantity: 9, type: "BOOK COMPLETO" },
      { ...base, id: "i3", displayId: "0003", eventId: "e9", status: "delivered", quantity: 2, producedAt: ontem },
    );

    const r = await chamar("GET /api/analises/painel-operacional", { sessao: admin });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const p = r.body as PainelOperacional;
    expect(p.hoje).toBe(hoje);
    expect(p.eventos.map((e) => e.nome)).toEqual(["Copa Norte"]); // o realizado já saiu dos prazos
    expect(p.pecas.map((x) => x.id)).toEqual(["i1"]); // o book não é peça
    expect(p.resumo.m2AImprimir).toBe(6); // 3 un × 2 m²
    expect(p.resumo.m2Impresso7d).toBe(4); // a peça do evento já realizado conta no realizado
    expect(p.nomes.e9).toBe("Maratona Antiga");

    const chamadas = H.db.select.mock.calls.length;
    const r2 = await chamar("GET /api/analises/painel-operacional", { sessao: admin });
    expect(r2.status).toBe(200);
    expect(H.db.select.mock.calls.length).toBe(chamadas);
  });

  it("falha do banco vira 500 com a frase", async () => {
    H.storage.getAllEvents.mockRejectedValue(new Error("caiu"));
    const r = await chamar("GET /api/analises/painel-operacional", { sessao: admin });
    expect(r.status).toBe(500);
    expect((r.body as { error: string }).error).toMatch(/painel operacional/);
  });
});
