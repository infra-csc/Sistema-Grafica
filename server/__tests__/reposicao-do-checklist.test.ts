// ─────────────────────────────────────────────────────────────────────────────
// REPOSIÇÃO PEDIDA PELO CHECKLIST DE ARENA (21/10).
//
// O que este arquivo pina (services/reposicao-do-checklist.ts):
//   · a reposição é um COMPLEMENTO da peça entregue que nasce na REVISÃO FINAL
//     (awaiting_final_review) e avisa a Solicitação — não a fila da Gráfica;
//   · reposição de um complemento se pede na peça ORIGINAL;
//   · evento REALIZADO (a data passou) é reaberto, com trilha do Checklist;
//   · evento ENCERRADO À MÃO ou ARQUIVADO recusa (decisão de uma pessoa);
//   · peça que nem entrou em produção recusa; duplo clique devolve a mesma.
// Nada toca banco: storage, efeitos de ./shared e o criarComplemento são borda.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  criar: vi.fn(),
  broadcast: vi.fn(),
  audit: vi.fn(async () => {}),
  updateEventStatus: vi.fn(async () => {}),
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../routes/shared", () => ({
  broadcast: (...a: any[]) => H.broadcast(...a),
  createAuditLog: (...a: any[]) => H.audit(...a),
  updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
}));
vi.mock("../services/complemento-da-peca", () => ({ criarComplemento: (...a: any[]) => H.criar(...a) }));

import { ETAPA_DA_REPOSICAO, pedirReposicaoDoChecklist } from "../services/reposicao-do-checklist";

const dia = (deslocamento: number) => {
  const d = new Date();
  d.setDate(d.getDate() + deslocamento);
  return d.toISOString().slice(0, 10);
};

const ENTREGUE = { id: "11111111-1111-4111-8111-111111111111", displayId: "#4896", type: "2x1", status: "delivered", quantity: 31, eventId: "ev1", parentItemId: null, deletedAt: null };
const pedido = { itemId: ENTREGUE.id, quantidade: 2, motivo: "lona rasgada no canto", solicitante: "Fernanda" };

function eventoCom(e: Record<string, unknown>) {
  H.storage.getEvent = vi.fn(async () => ({ id: "ev1", name: "Night Run Salvador", status: "created", ...e }));
}

beforeEach(() => {
  vi.clearAllMocks();
  H.storage.getItem = vi.fn(async (id: string) => (id === ENTREGUE.id ? ENTREGUE : undefined));
  H.storage.findRecentComplement = vi.fn(async () => undefined);
  H.storage.updateEvent = vi.fn(async (id: string, campos: any) => ({ id, name: "Night Run Salvador", ...campos }));
  H.criar.mockImplementation(async (parent: any, _ev: any, ped: any, _ator: any, op: any) => ({
    child: { id: "c1", displayId: `${parent.displayId}-C1`, status: op.status, quantity: ped.quantity },
    notification: { id: "n1" },
  }));
  eventoCom({ startDate: dia(3) });
});

describe("reposição pedida pelo Checklist", () => {
  it("vira complemento na Revisão Final e avisa a Solicitação", async () => {
    const r = await pedirReposicaoDoChecklist(pedido);
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ codigo: "#4896-C1", status: ETAPA_DA_REPOSICAO, quantidade: 2, pecaOriginal: "#4896", eventoReaberto: false });
    const [parent, , ped, ator, op] = H.criar.mock.calls[0];
    expect(parent.id).toBe(ENTREGUE.id);
    expect(ped.reason).toContain("Reposição pedida pelo Checklist de Arena (Fernanda): lona rasgada no canto");
    expect(ator).toBe("Checklist de Arena · Fernanda");
    expect(op.status).toBe("awaiting_final_review");
    expect(op.notificacao).toMatchObject({ type: "reposicaoChecklist", targetRoles: ["solicitacao", "admin"] });
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
    expect(H.broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: "item_complement_created" }));
  });

  it("reposição de um complemento vai na peça original", async () => {
    const complemento = { ...ENTREGUE, id: "22222222-2222-4222-8222-222222222222", displayId: "#4896-C1", parentItemId: ENTREGUE.id };
    H.storage.getItem = vi.fn(async (id: string) => (id === complemento.id ? complemento : id === ENTREGUE.id ? ENTREGUE : undefined));
    const r = await pedirReposicaoDoChecklist({ ...pedido, itemId: complemento.id });
    expect(r.status).toBe(201);
    expect(H.criar.mock.calls[0][0].id).toBe(ENTREGUE.id);
  });

  it("evento já realizado é reaberto (com trilha do Checklist)", async () => {
    eventoCom({ startDate: dia(-3) });
    const r = await pedirReposicaoDoChecklist(pedido);
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({ eventoReaberto: true });
    expect(H.storage.updateEvent).toHaveBeenCalledWith("ev1", expect.objectContaining({ status: "created", reopenedAt: expect.any(Date) }));
    expect(H.audit).toHaveBeenCalledWith("Checklist de Arena · Fernanda", "updated", "event", "ev1", expect.stringContaining("REABERTO pelo Checklist"));
  });

  it("evento encerrado à mão ou arquivado: recusa, sem criar nada", async () => {
    eventoCom({ startDate: dia(-3), manuallyClosed: true });
    expect((await pedirReposicaoDoChecklist(pedido)).status).toBe(409);
    eventoCom({ startDate: dia(3), arquivadoEm: new Date() });
    expect((await pedirReposicaoDoChecklist(pedido)).status).toBe(409);
    expect(H.criar).not.toHaveBeenCalled();
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("peça que nem entrou em produção: recusa", async () => {
    H.storage.getItem = vi.fn(async () => ({ ...ENTREGUE, status: "awaiting_final_review" }));
    const r = await pedirReposicaoDoChecklist(pedido);
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ code: "NOT_IN_PRODUCTION" });
  });

  it("duplo clique devolve a reposição que já existe", async () => {
    H.storage.findRecentComplement = vi.fn(async () => ({ id: "c1", displayId: "#4896-C1", status: "awaiting_final_review", quantity: 2 }));
    const r = await pedirReposicaoDoChecklist(pedido);
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ codigo: "#4896-C1" });
    expect(H.criar).not.toHaveBeenCalled();
  });

  it("peça que não existe: 404", async () => {
    expect((await pedirReposicaoDoChecklist({ ...pedido, itemId: "33333333-3333-4333-8333-333333333333" })).status).toBe(404);
  });
});
