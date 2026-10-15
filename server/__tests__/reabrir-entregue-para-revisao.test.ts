// ─────────────────────────────────────────────────────────────────────────────
// REABRIR A PEÇA ENTREGUE PARA A REVISÃO (dono, 13/10: "como ADM levar um
// entregue de volta para a revisão" — zerar e produzir de novo, inclusive em
// evento realizado). Roda a rota real de server/routes/tubos.ts sobre o banco
// de mentira de regras-producao-apoio.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { montarRotas, bancoDeMentira, mundoVazio, type MundoDoBanco } from "./regras-producao-apoio";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  broadcast: [] as any[],
  trilha: [] as string[],
  eventosRecalculados: [] as string[],
}));

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_req: any, _a: string, _t: string, _id: string, detalhe: string) => { H.trilha.push(detalhe); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async (id: string) => { H.eventosRecalculados.push(id); },
  };
});

import { registerTubosRoutes } from "../routes/tubos";
import { origemDaAcao, TRANSICOES } from "@shared/maquina-de-estados";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";

vi.setConfig({ testTimeout: 120_000 });
const { chamar } = montarRotas(registerTubosRoutes);
const ROTA = "POST /api/items/:id/reabrir-para-revisao";
const MOTIVO = "Arte saiu com o patrocinador errado, reimprimir";
let mundo: MundoDoBanco;

const entregue = (over: Record<string, unknown> = {}) => ({
  id: "a", displayId: "#0001", type: "2x1", quantity: 4, status: "delivered", eventId: "ev-1", deletedAt: null,
  quantityProduced: 3, reuseQty: 1, isReuse: false, conferredQty: 4, embaladaQty: 4, deliveredQty: 4, tuboId: "t1",
  printMachine: "1", impressaoPorMaquina: { "1": { atrib: 3, impressas: 3 } }, producedAt: new Date(), conferredAt: new Date(),
  deliveredAt: new Date(), receivedBy: "João", deliveryPhotoUrl: "/objects/e.png", conferencePhotoUrl: "/objects/c.png",
  creatorReviewedAt: new Date(), travadaEm: null, travadaPor: null, travadaPorId: null, travadaMotivo: null, ...over,
});

beforeEach(() => {
  mundo = mundoVazio();
  // Evento já realizado: a reabertura do ADM vale mesmo assim.
  mundo.eventos["ev-1"] = { id: "ev-1", name: "Night Run", status: "completed", startDate: "2020-01-01", arquivadoEm: null };
  mundo.itens.a = entregue();
  mundo.itens.b = entregue({ id: "b", displayId: "#0002", tuboId: "t1" });
  mundo.tubos.t1 = { id: "t1", eventId: "ev-1", numero: 1, avulso: false, entregueEm: new Date(), fechadoEm: new Date("2026-10-10"), conteudoAlteradoEm: null };
  mundo.tubos.t2 = { id: "t2", eventId: "ev-1", numero: 2, avulso: true, entregueEm: new Date(), fechadoEm: null, conteudoAlteradoEm: null };
  mundo.linhas.l1 = { id: "l1", tuboId: "t1", itemId: "a", quantidade: 3, entregueEm: new Date() };
  mundo.linhas.l2 = { id: "l2", tuboId: "t2", itemId: "a", quantidade: 1, entregueEm: new Date() };
  mundo.linhas.l3 = { id: "l3", tuboId: "t1", itemId: "b", quantidade: 4, entregueEm: new Date() };
  H.broadcast.length = 0; H.trilha.length = 0; H.eventosRecalculados.length = 0;
  for (const k of Object.keys(H.storage)) delete H.storage[k];
  H.storage.createNotification = vi.fn(async (n: any) => ({ id: "n1", ...n }));
  for (const k of Object.keys(H.db)) delete H.db[k];
  Object.assign(H.db, bancoDeMentira(mundo));
});

describe("ADM reabre a peça entregue para a Revisão", () => {
  it("zera produção e entrega, tira dos volumes e registra os valores anteriores", async () => {
    const r = await chamar(ROTA, { params: { id: "a" }, body: { notes: MOTIVO }, userRole: "admin" });
    expect(r.status).toBe(200);
    expect(mundo.itens.a).toMatchObject({
      status: "awaiting_final_review", creatorReviewedAt: null, rejectionReason: MOTIVO, observations: MOTIVO,
      quantityProduced: null, conferredQty: 0, embaladaQty: 0, deliveredQty: 0, tuboId: null,
      printMachine: null, impressaoPorMaquina: null, producedAt: null, conferredAt: null, deliveredAt: null,
      receivedBy: null, deliveryPhotoUrl: null, conferencePhotoUrl: null,
      reuseQty: 1, // o reaproveitamento é estoque destinado à peça: fica
    });
    expect(Object.values(mundo.linhas).map((l: any) => l.id)).toEqual(["l3"]);
    expect(mundo.tubos.t2, "volume avulso vazio some").toBeUndefined();
    expect(mundo.tubos.t1.conteudoAlteradoEm, "tubo fotografado marca conteúdo alterado").toBeInstanceOf(Date);
    expect(mundo.itens.b.status, "a outra peça do tubo não muda").toBe("delivered");
    expect(H.trilha.join(" ")).toMatch(/3 impressas, 4 conferidas, 4 embaladas, 4 entregues.*Tubo 1, embalagem avulsa.*Motivo: Arte saiu/);
    expect(H.eventosRecalculados).toEqual(["ev-1"]);
    expect(H.storage.createNotification).toHaveBeenCalledWith(expect.objectContaining({ itemId: "a", targetRoles: ["solicitacao"] }));
    expect(H.broadcast.map((m) => m.type)).toEqual(expect.arrayContaining(["item_updated", "tubos_atualizados"]));
  });

  it("só o ADM; motivo obrigatório; só peça entregue", async () => {
    for (const papel of ["grafica", "solicitacao", "arte", "atendimento"]) {
      expect((await chamar(ROTA, { params: { id: "a" }, body: { notes: MOTIVO }, userRole: papel })).status, papel).toBe(403);
    }
    expect((await chamar(ROTA, { params: { id: "a" }, body: { notes: "curto" }, userRole: "admin" })).status).toBe(400);
    mundo.itens.a.status = "packed";
    expect((await chamar(ROTA, { params: { id: "a" }, body: { notes: MOTIVO }, userRole: "admin" })).status).toBe(409);
    expect((await chamar(ROTA, { params: { id: "zz" }, body: { notes: MOTIVO }, userRole: "admin" })).status).toBe(404);
    expect(mundo.itens.a.deliveredQty, "recusa não mexe em nada").toBe(4);
    expect(Object.keys(mundo.linhas)).toHaveLength(3);
  });

  it("a tabela de estados e a régua de permissões dizem o mesmo que a rota", () => {
    expect(origemDaAcao("reabrir-entregue-para-a-revisao")).toEqual(["delivered", "entregue"]);
    const t = TRANSICOES.find((x) => x.acao === "reabrir-entregue-para-a-revisao")!;
    expect([t.para, t.papeis]).toEqual(["awaiting_final_review", ["admin"]]);
    expect(REGUA_DE_PAPEIS.find((r) => r.rota === "/api/items/:id/reabrir-para-revisao")?.papeis).toEqual(["admin"]);
  });
});
