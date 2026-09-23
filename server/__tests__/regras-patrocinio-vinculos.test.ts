// ─────────────────────────────────────────────────────────────────────────────
// VINCULAR, ACRESCENTAR E DESVINCULAR PATROCINADOR, RODANDO (server/routes/sponsors.ts).
//
// De onde vieram (eram leituras do texto de sponsors.ts/storage.ts):
//   · acrescentar-patrocinador.test.ts — a rota bulk-add-sponsor inteira;
//   · desvincular-patrocinador.test.ts — o DELETE peça a peça e a cascata
//     de quando o patrocinador sai do EVENTO;
//   · aprovar-atalho-e-revogar.test.ts §5 — vincular numa peça em aprovação
//     cria a linha pendente junto (caso #2801);
//   · isencao-e-espera.test.ts — "acrescentar patrocinador limpa a isenção".
// Handlers reais; storage de mentira. requireRole é o de VERDADE (lê a
// sessão), para o papel ser testado pela porta que o servidor usa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
  broadcast: (() => {}) as any,
  trilha: [] as { acao: string; tipo: string; id: string; detalhe: string }[],
  invalidarVersoes: (() => {}) as any,
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
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: async (_req: any, acao: string, tipo: string, id: string, detalhe: string) => {
      H.trilha.push({ acao, tipo, id, detalhe });
    },
    updateEventStatus: async () => {},
  };
});
vi.mock("../routes/versoes", async () => {
  const real = await vi.importActual<any>("../routes/versoes");
  return { ...real, invalidarCacheDeVersoes: (...a: any[]) => H.invalidarVersoes(...a) };
});
vi.mock("../cache", () => ({ eventsCache: null, setEventsCache: vi.fn(), invalidateEventsCache: vi.fn(), invalidateAllCaches: vi.fn(), registrarCache: vi.fn(), invalidarCacheNoCluster: vi.fn() }));
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import { POS_APROVACAO, DEPOIS_DA_ARTE } from "@shared/fluxo-peca";
import { origemDaAcao } from "@shared/maquina-de-estados";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";
import { registerSponsorRoutes } from "../routes/sponsors";
import { EVENTO_REALIZADO_ERRO } from "../routes/eventoFinalizado";

// ── App de mentira ───────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
/** As rotas reais, capturadas por um app que só anota "VERBO caminho" → handlers. */
const rotas = (() => {
  const mapa = new Map<string, Handler[]>();
  const appFalso: any = {};
  for (const verbo of ["get", "post", "patch", "put", "delete"]) {
    appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { mapa.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
  }
  registerSponsorRoutes(appFalso);
  return mapa;
})();

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const papel = ctx.userRole ?? "admin";
  const req: any = {
    params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {},
    userRole: papel, userId: "u1", userName: "Maria", session: { userId: "u1", userRole: papel },
  };
  const res: any = { _status: 200, _body: undefined, _pronto: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._pronto || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

// ── O mundo ──────────────────────────────────────────────────────────────────
let mundo: {
  itens: Record<string, any>;
  eventos: Record<string, any>;
  patrocinadores: Record<string, any>;
  naPeca: Record<string, string[]>;
  noEvento: Record<string, string[]>;
  aprovacoes: Record<string, any[]>;
};
let notificacoes: any[];
/** Ordem das escritas, para as regras de "antes de". */
let escritas: string[];

const peca = (id: string, over: any = {}) => ({
  id, displayId: `#${id}`, eventId: "ev-1", type: "Testeira", status: "awaiting_submission",
  skipApproval: false, deletedAt: null, approvalThumbUrl: "/objects/uploads/v1.png", finalFileUrl: "/objects/uploads/final.pdf",
  sponsorApprovedBy: null, sponsorApprovedAt: null, rejectedBySponsor: false, observations: null,
  ...over,
});
const linha = (itemId: string, sponsorId: string, status: string) => ({ id: `a-${itemId}-${sponsorId}`, itemId, sponsorId, status });
const trilhaDe = (id: string) => H.trilha.filter((l) => l.id === id).map((l) => l.detalhe).join(" | ");

beforeEach(() => {
  mundo = {
    itens: {},
    eventos: {
      "ev-1": { id: "ev-1", name: "PRIMAVERA RJ", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      "ev-fim": { id: "ev-fim", name: "JÁ FOI", status: "created", startDate: "2020-01-10", truckDepartureDate: new Date("2020-01-01T00:00:00Z") },
    },
    patrocinadores: {
      "sp-min": { id: "sp-min", name: "Ministério" },
      "sp-vale": { id: "sp-vale", name: "Vale" },
      "sp-qcy": { id: "sp-qcy", name: "QCY" },
    },
    naPeca: {},
    noEvento: { "ev-1": ["sp-vale"], "ev-fim": [] },
    aprovacoes: {},
  };
  notificacoes = [];
  escritas = [];
  H.trilha = [];
  H.broadcast = vi.fn();
  H.invalidarVersoes = vi.fn();
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.getSponsor = vi.fn(async (id: string) => mundo.patrocinadores[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => { escritas.push(`updateItem:${id}`); return (mundo.itens[id] = { ...mundo.itens[id], ...dados }); });
  s.getEventSponsors = vi.fn(async (eventId: string) => (mundo.noEvento[eventId] ?? []).map((sponsorId) => ({ eventId, sponsorId })));
  s.addSponsorToEvent = vi.fn(async (d: any) => { escritas.push(`addSponsorToEvent:${d.eventId}`); (mundo.noEvento[d.eventId] ??= []).push(d.sponsorId); return { id: "es1", ...d }; });
  s.removeSponsorFromEvent = vi.fn(async (eventId: string, sponsorId: string) => {
    const antes = mundo.noEvento[eventId] ?? [];
    mundo.noEvento[eventId] = antes.filter((x) => x !== sponsorId);
    return antes.includes(sponsorId);
  });
  s.getItemSponsors = vi.fn(async (itemId: string) => (mundo.naPeca[itemId] ?? []).map((sponsorId) => ({ id: `v-${sponsorId}`, itemId, sponsorId })));
  s.addSponsorToItem = vi.fn(async (d: any) => { escritas.push(`addSponsorToItem:${d.itemId}`); (mundo.naPeca[d.itemId] ??= []).push(d.sponsorId); return { id: `v-${d.sponsorId}`, ...d }; });
  s.removeSponsorFromItem = vi.fn(async (itemId: string, sponsorId: string) => {
    const antes = mundo.naPeca[itemId] ?? [];
    mundo.naPeca[itemId] = antes.filter((x) => x !== sponsorId);
    return antes.includes(sponsorId);
  });
  s.getItemSponsorApprovals = vi.fn(async (itemId: string) => mundo.aprovacoes[itemId] ?? []);
  s.getItemSponsorApproval = vi.fn(async (itemId: string, sponsorId: string) => (mundo.aprovacoes[itemId] ?? []).find((a) => a.sponsorId === sponsorId));
  s.createItemSponsorApproval = vi.fn(async (d: any) => { const l = { id: `a-${d.itemId}-${d.sponsorId}`, ...d }; (mundo.aprovacoes[d.itemId] ??= []).push(l); return l; });
  s.deleteItemSponsorApproval = vi.fn(async (itemId: string, sponsorId: string) => {
    mundo.aprovacoes[itemId] = (mundo.aprovacoes[itemId] ?? []).filter((a) => a.sponsorId !== sponsorId);
    return true;
  });
  // O que o "só SOMA" nunca pode chamar.
  s.updateItemSponsorApproval = vi.fn(async () => undefined);
  s.initializeItemSponsorApprovals = vi.fn(async () => {});
  s.bulkSyncItemSponsors = vi.fn(async () => {});
  s.getAllItems = vi.fn(async () => Object.values(mundo.itens));
  s.getItemsByEvent = vi.fn(async (eventId: string) => Object.values(mundo.itens).filter((i: any) => i.eventId === eventId));
  s.createNotification = vi.fn(async (n: any) => { notificacoes.push(n); return { id: `n${notificacoes.length}`, ...n }; });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const acrescentar = (itemIds: string[], sponsorId = "sp-min", userRole = "solicitacao") =>
  chamar("POST /api/items/bulk-add-sponsor", { body: { sponsorId, itemIds }, userRole });

// ═════════════════════════════════════════════════════════════════════════════
// ACRESCENTAR (bulk-add-sponsor)
// ═════════════════════════════════════════════════════════════════════════════
describe("acrescentar · quem pode", () => {
  it("só admin e solicitação — pela régua de papéis e pela rota", async () => {
    expect(REGUA_DE_PAPEIS).toContainEqual({ metodo: "POST", rota: "/api/items/bulk-add-sponsor", papeis: ["admin", "solicitacao"] });
    mundo.itens.p1 = peca("p1");
    for (const papel of ["arte", "atendimento", "grafica"]) {
      const r = await acrescentar(["p1"], "sp-min", papel);
      expect(r.status, papel).toBe(403);
    }
    expect(H.storage.addSponsorToItem).not.toHaveBeenCalled();
    for (const papel of ["admin", "solicitacao"]) expect((await acrescentar(["p1"], "sp-min", papel)).status, papel).toBe(200);
  });

  it("valida o pedido antes de tocar em peça", async () => {
    expect((await acrescentar([], "sp-min")).status).toBe(400);
    expect((await acrescentar(Array.from({ length: 501 }, (_, i) => `x${i}`), "sp-min")).status).toBe(400);
    expect((await chamar("POST /api/items/bulk-add-sponsor", { body: { itemIds: ["p1"] }, userRole: "admin" })).status).toBe(400);
    expect((await acrescentar(["p1"], "sp-nada")).status).toBe(404);
    expect(H.storage.getItem).not.toHaveBeenCalled();
  });
});

describe("acrescentar · só SOMA — nunca reescreve", () => {
  it("o vínculo existente fica, nada é apagado e ninguém que já decidiu é tocado", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    mundo.naPeca.p1 = ["sp-vale"];
    mundo.aprovacoes.p1 = [linha("p1", "sp-vale", "approved")];
    const r = await acrescentar(["p1"]);
    expect(r.status).toBe(200);
    expect(mundo.naPeca.p1).toEqual(["sp-vale", "sp-min"]);
    for (const proibida of ["bulkSyncItemSponsors", "removeSponsorFromItem", "deleteItemSponsorApproval", "updateItemSponsorApproval", "initializeItemSponsorApprovals"]) {
      expect(H.storage[proibida], proibida).not.toHaveBeenCalled();
    }
    expect(mundo.aprovacoes.p1[0]).toEqual(linha("p1", "sp-vale", "approved"));
  });

  it("vincula ao EVENTO antes da peça — uma vez por evento, e o evento é lido uma vez", async () => {
    mundo.itens.p1 = peca("p1");
    mundo.itens.p2 = peca("p2");
    mundo.itens.p3 = peca("p3");
    const r = await acrescentar(["p1", "p2", "p3"]);
    expect(r.body.vinculadas).toBe(3);
    expect(mundo.noEvento["ev-1"]).toEqual(["sp-vale", "sp-min"]);
    expect(H.storage.addSponsorToEvent).toHaveBeenCalledTimes(1);
    expect(escritas.indexOf("addSponsorToEvent:ev-1")).toBeLessThan(escritas.findIndex((e) => e.startsWith("addSponsorToItem:")));
    expect(H.storage.getEvent).toHaveBeenCalledTimes(1);
  });

  it("peça que já tem o patrocinador é contada, não duplicada — e sem nada a normalizar, nem trilha", async () => {
    mundo.itens.p1 = peca("p1");
    mundo.naPeca.p1 = ["sp-min"];
    mundo.noEvento["ev-1"].push("sp-min");
    const r = await acrescentar(["p1"]);
    expect(r.body).toMatchObject({ vinculadas: 0, jaTinham: 1, recusadas: [] });
    expect(H.storage.addSponsorToItem).not.toHaveBeenCalled();
    expect(H.storage.updateItem).not.toHaveBeenCalled();
    expect(H.trilha).toHaveLength(0);
  });
});

describe("acrescentar · a isenção só CAI, nunca sobe (caso Mandala)", () => {
  it("peça ISENTA deixa de ser isenta ao ganhar patrocinador, e a tela recebe o item sem F5", async () => {
    mundo.itens.p1 = peca("p1", { skipApproval: true });
    await acrescentar(["p1"]);
    expect(mundo.itens.p1.skipApproval).toBe(false);
    expect(H.broadcast).toHaveBeenCalledWith({ type: "item_updated", item: expect.objectContaining({ id: "p1", skipApproval: false }) });
    expect(trilhaDe("p1")).toContain('a peça deixou de ser "sem aprovação"');
  });

  it("o vínculo pré-existente com isenção TAMBÉM é normalizado (2º round, 27/08)", async () => {
    mundo.itens.p1 = peca("p1", { skipApproval: true });
    mundo.naPeca.p1 = ["sp-min"];
    const r = await acrescentar(["p1"]);
    expect(r.body.jaTinham).toBe(1);
    expect(mundo.itens.p1.skipApproval).toBe(false);
    expect(trilhaDe("p1")).toContain("já estava na peça #p1; o estado foi normalizado");
  });

  it("em nenhum status a rota marca isenção", async () => {
    const todos = ["draft", "requested", "awaiting_linking", "awaiting_submission", "awaiting_approval", "awaiting_sponsor_approval", ...POS_APROVACAO];
    todos.forEach((status, i) => { mundo.itens[`p${i}`] = peca(`p${i}`, { status, skipApproval: i % 2 === 0 }); });
    await acrescentar(todos.map((_, i) => `p${i}`));
    for (const [, dados] of H.storage.updateItem.mock.calls) expect(dados.skipApproval).not.toBe(true);
  });
});

describe("acrescentar · até a aprovação fechar — inclusive em correção", () => {
  it("da criação ao envio: vincula sem criar pendência — ela nasce quando a Arte enviar", async () => {
    for (const status of ["draft", "requested", "awaiting_linking", "awaiting_submission"]) {
      mundo.itens.p1 = peca("p1", { status });
      mundo.naPeca.p1 = [];
      H.trilha = [];
      const r = await acrescentar(["p1"]);
      expect(r.body.recusadas, status).toEqual([]);
      expect(mundo.naPeca.p1, status).toEqual(["sp-min"]);
      expect(trilhaDe("p1"), status).toContain("entrará na aprovação quando a Arte enviar o layout");
    }
    expect(H.storage.createItemSponsorApproval).not.toHaveBeenCalled();
  });

  it("em aprovação: a linha pendente nasce JUNTO, e a peça fica onde está", async () => {
    for (const status of ["awaiting_approval", "awaiting_sponsor_approval"]) {
      mundo.itens.p1 = peca("p1", { status });
      mundo.naPeca.p1 = [];
      mundo.aprovacoes.p1 = [];
      H.trilha = [];
      const r = await acrescentar(["p1"]);
      expect(r.body.pendenciasCriadas, status).toBe(1);
      expect(mundo.aprovacoes.p1, status).toEqual([expect.objectContaining({ sponsorId: "sp-min", status: "pending" })]);
      expect(mundo.itens.p1.status, status).toBe(status);
      expect(trilhaDe("p1"), status).toContain("entra na rodada de aprovação em curso");
    }
  });

  it("a CORREÇÃO está nos mesmos estados: a peça reprovada segue em aprovação (só a linha vai para a Arte)", async () => {
    // Reprovar só parte de awaiting_sponsor_approval e deixa a peça ali.
    expect(origemDaAcao("reprovar-por-patrocinador")).toEqual(["awaiting_sponsor_approval"]);
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval", rejectedBySponsor: true });
    mundo.naPeca.p1 = ["sp-vale"];
    mundo.aprovacoes.p1 = [linha("p1", "sp-vale", "awaiting_arte")];
    const r = await acrescentar(["p1"]);
    expect(r.body).toMatchObject({ vinculadas: 1, pendenciasCriadas: 1, recusadas: [] });
    expect(mundo.aprovacoes.p1.map((a) => a.status)).toEqual(["awaiting_arte", "pending"]);
  });

  it("peça que JÁ PASSOU reabre para que SÓ o novo decida — a arte fica e a Arte é avisada", async () => {
    // A lista é a de @shared/fluxo-peca — a mesma que a revogação usa; o
    // apelido legado da revisão tem de estar nela (peça #3483).
    expect(POS_APROVACAO).toContain("awaiting_creator_review");
    for (const status of POS_APROVACAO) {
      mundo.itens.p1 = peca("p1", { status, skipApproval: true, sponsorApprovedBy: "Ana", sponsorApprovedAt: new Date() });
      mundo.naPeca.p1 = ["sp-vale"];
      mundo.aprovacoes.p1 = [linha("p1", "sp-vale", "approved")];
      notificacoes = [];
      H.trilha = [];
      const r = await acrescentar(["p1"]);
      expect(r.body.reabertas, status).toBe(1);
      expect(mundo.itens.p1, status).toMatchObject({
        status: "awaiting_sponsor_approval", skipApproval: false, sponsorApprovedBy: null, sponsorApprovedAt: null, rejectedBySponsor: false,
        finalFileUrl: "/objects/uploads/final.pdf", approvalThumbUrl: "/objects/uploads/v1.png",
      });
      // quem já aprovou não decide de novo
      expect(mundo.aprovacoes.p1.map((a) => [a.sponsorId, a.status]), status).toEqual([["sp-vale", "approved"], ["sp-min", "pending"]]);
      expect(notificacoes, status).toEqual([expect.objectContaining({ targetRoles: ["arte"], message: expect.stringContaining("segure a finalização") })]);
      expect(trilhaDe("p1"), status).toContain("voltou para a aprovação; só ele decide, os demais seguem aprovados");
    }
    expect(H.storage.updateItemSponsorApproval).not.toHaveBeenCalled();
    expect(H.storage.initializeItemSponsorApprovals).not.toHaveBeenCalled();
  });

  it("vínculo antigo SEM linha numa peça que passou: a pendência nasce agora e a peça reabre", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_finalization" });
    mundo.naPeca.p1 = ["sp-min"];
    const r = await acrescentar(["p1"]);
    expect(r.body).toMatchObject({ jaTinham: 1, reabertas: 1, pendenciasCriadas: 1 });
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
  });

  it("o corte é a LIBERAÇÃO: dali em diante recusa, com o porquê", async () => {
    const liberadas = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "packed", "delivered"];
    for (const s of liberadas) expect(POS_APROVACAO, s).not.toContain(s);
    liberadas.forEach((status, i) => { mundo.itens[`g${i}`] = peca(`g${i}`, { status }); });
    const r = await acrescentar(liberadas.map((_, i) => `g${i}`));
    expect(r.status).toBe(200);
    expect(r.body.recusadas).toHaveLength(liberadas.length);
    for (const rec of r.body.recusadas) {
      expect(rec.motivo).toContain("já foi liberada para a produção");
      expect(rec.motivo).toContain("a peça é da Gráfica");
    }
    expect(H.storage.addSponsorToItem).not.toHaveBeenCalled();
  });
});

describe("acrescentar · o lote é honesto sobre o que não fez", () => {
  it("recusa por peça, com motivo, e o resto do lote passa", async () => {
    mundo.itens.p1 = peca("p1");
    mundo.itens.m1 = peca("m1", { type: "Molde" });
    mundo.itens.x1 = peca("x1", { deletedAt: new Date() });
    const r = await acrescentar(["p1", "m1", "x1", "sumida"]);
    expect(r.status).toBe(200);
    expect(r.body.vinculadas).toBe(1);
    const porPeca = Object.fromEntries(r.body.recusadas.map((x: any) => [x.displayId, x.motivo]));
    expect(porPeca["#m1"]).toContain("molde não recebe patrocinador");
    expect(porPeca.x1).toBe("peça não encontrada");
    expect(porPeca.sumida).toBe("peça não encontrada");
  });

  it("uma falha interna numa peça vira recusa nomeada, não derruba o lote", async () => {
    mundo.itens.p1 = peca("p1");
    mundo.itens.p2 = peca("p2");
    H.storage.addSponsorToItem.mockImplementationOnce(async () => { throw new Error("conexão caiu"); });
    const r = await acrescentar(["p1", "p2"]);
    expect(r.status).toBe(200);
    expect(r.body.vinculadas).toBe(1);
    expect(r.body.recusadas).toEqual([expect.objectContaining({ motivo: "falha interna: conexão caiu" })]);
  });

  it("evento finalizado: a peça é recusada com a frase da casa; o lote inteiro barrado vira 409", async () => {
    mundo.itens.p1 = peca("p1");
    mundo.itens.f1 = peca("f1", { eventId: "ev-fim" });
    const misto = await acrescentar(["p1", "f1"]);
    expect(misto.status).toBe(200);
    expect(misto.body.recusadas).toEqual([{ displayId: "#f1", motivo: EVENTO_REALIZADO_ERRO }]);

    const inteiro = await acrescentar(["f1"]);
    expect(inteiro.status).toBe(409);
    expect(inteiro.body).toMatchObject({ error: EVENTO_REALIZADO_ERRO, code: "EVENT_FINALIZED" });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// VINCULAR UM (POST /api/items/:id/sponsors) — caso #2801
// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/items/:id/sponsors", () => {
  it("numa peça em aprovação, a linha pendente nasce JUNTO com o vínculo", async () => {
    for (const status of ["awaiting_sponsor_approval", "awaiting_approval"]) {
      mundo.itens.p1 = peca("p1", { status });
      mundo.naPeca.p1 = [];
      mundo.aprovacoes.p1 = [];
      const r = await chamar("POST /api/items/:id/sponsors", { params: { id: "p1" }, body: { sponsorId: "sp-min" }, userRole: "admin" });
      expect(r.status, status).toBe(201);
      expect(mundo.aprovacoes.p1, status).toEqual([expect.objectContaining({ sponsorId: "sp-min", status: "pending" })]);
    }
  });

  it("linha que já existe não é duplicada; fora da aprovação, nenhuma linha nasce", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    mundo.aprovacoes.p1 = [linha("p1", "sp-min", "pending")];
    await chamar("POST /api/items/:id/sponsors", { params: { id: "p1" }, body: { sponsorId: "sp-min" }, userRole: "admin" });
    expect(mundo.aprovacoes.p1).toHaveLength(1);

    mundo.itens.p2 = peca("p2", { status: "awaiting_submission" });
    await chamar("POST /api/items/:id/sponsors", { params: { id: "p2" }, body: { sponsorId: "sp-min" }, userRole: "admin" });
    expect(mundo.aprovacoes.p2).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DESVINCULAR DA PEÇA (DELETE /api/items/:itemId/sponsors/:sponsorId)
// ═════════════════════════════════════════════════════════════════════════════
describe("DELETE /api/items/:itemId/sponsors/:sponsorId", () => {
  const desvincular = (sponsorId: string, itemId = "p1") =>
    chamar("DELETE /api/items/:itemId/sponsors/:sponsorId", { params: { itemId, sponsorId }, userRole: "admin" });

  it("a linha APROVADA fica (é registro) e a trilha diz isso — na trilha da PEÇA", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    mundo.naPeca.p1 = ["sp-vale", "sp-min"];
    mundo.aprovacoes.p1 = [linha("p1", "sp-vale", "approved"), linha("p1", "sp-min", "pending")];
    const r = await desvincular("sp-vale");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ aprovacaoPendenteDescartada: false, rodadaFechou: false, pecaInativada: false });
    expect(H.storage.deleteItemSponsorApproval).not.toHaveBeenCalled();
    expect(H.trilha).toContainEqual(expect.objectContaining({ acao: "removed", tipo: "item", id: "p1" }));
    expect(trilhaDe("p1")).toContain("a aprovação que ele já deu permanece no histórico");
  });

  it("a PENDENTE é descartada — só a dele — e deixa de contar", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    mundo.naPeca.p1 = ["sp-vale", "sp-min", "sp-qcy"];
    mundo.aprovacoes.p1 = [linha("p1", "sp-vale", "pending"), linha("p1", "sp-min", "pending"), linha("p1", "sp-qcy", "approved")];
    const r = await desvincular("sp-min");
    expect(r.body).toMatchObject({ aprovacaoPendenteDescartada: true, rodadaFechou: false });
    expect(mundo.aprovacoes.p1.map((a) => a.sponsorId)).toEqual(["sp-vale", "sp-qcy"]);
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(H.invalidarVersoes).toHaveBeenCalled();
    expect(trilhaDe("p1")).toContain("a aprovação pendente dele foi descartada e deixa de contar");
  });

  it("se ele era o ÚNICO que faltava, a peça SEGUE — carimbo, trilha e aviso à Arte", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    mundo.naPeca.p1 = ["sp-vale", "sp-min"];
    mundo.aprovacoes.p1 = [linha("p1", "sp-vale", "approved"), linha("p1", "sp-min", "pending")];
    const r = await desvincular("sp-min");
    expect(r.body).toMatchObject({ aprovacaoPendenteDescartada: true, rodadaFechou: true, pecaInativada: false });
    expect(mundo.itens.p1).toMatchObject({ status: "sponsor_approved", sponsorApprovedBy: "Maria", rejectedBySponsor: false });
    expect(notificacoes).toEqual([expect.objectContaining({ targetRoles: ["arte"] })]);
    expect(trilhaDe("p1")).toContain('Com a saída de "Ministério", todos os patrocinadores restantes já aprovaram');
  });

  it("era o ÚNICO patrocinador: a peça é INATIVADA (cancelada), com a explicação na peça — e não 'segue'", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval", observations: "Ilhós a cada 50 cm" });
    mundo.naPeca.p1 = ["sp-qcy"];
    mundo.aprovacoes.p1 = [linha("p1", "sp-qcy", "pending")];
    const r = await desvincular("sp-qcy");
    expect(r.body).toMatchObject({ pecaInativada: true, rodadaFechou: false });
    expect(mundo.itens.p1.status).toBe("canceled");
    expect(mundo.itens.p1.observations).toBe('Cancelada automaticamente: o único patrocinador ("QCY") foi desvinculado do evento. · Ilhós a cada 50 cm');
    expect(H.storage.updateItem).toHaveBeenCalledTimes(1);
    expect(notificacoes[0].targetRoles).toEqual(["solicitacao", "atendimento"]);
  });

  it("a exceção: peça que JÁ CHEGOU na Gráfica (DEPOIS_DA_ARTE) só perde a marca", async () => {
    for (const status of ["ready_for_production", "inProduction", "delivered"]) {
      expect(DEPOIS_DA_ARTE.has(status)).toBe(true);
      mundo.itens.p1 = peca("p1", { status });
      mundo.naPeca.p1 = ["sp-qcy"];
      mundo.aprovacoes.p1 = [linha("p1", "sp-qcy", "approved")];
      const r = await desvincular("sp-qcy");
      expect(r.body.pecaInativada, status).toBe(false);
      expect(mundo.itens.p1.status, status).toBe(status);
    }
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("sem vínculo para remover: 404 e nada acontece (peça sem patrocinador não é tocada)", async () => {
    mundo.itens.p1 = peca("p1", { status: "awaiting_sponsor_approval" });
    const r = await desvincular("sp-qcy");
    expect(r.status).toBe(404);
    expect(H.storage.updateItem).not.toHaveBeenCalled();
    expect(H.storage.deleteItemSponsorApproval).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TIRAR DO EVENTO cascateia para as peças (caso QCY, 25/08)
// ═════════════════════════════════════════════════════════════════════════════
describe("DELETE /api/events/:eventId/sponsors/:sponsorId — a cascata", () => {
  const tirarDoEvento = (eventId = "ev-1", sponsorId = "sp-qcy") =>
    chamar("DELETE /api/events/:eventId/sponsors/:sponsorId", { params: { eventId, sponsorId }, userRole: "admin" });

  it("aplica em cada peça viva a MESMA regra do peça a peça, e conta o desfecho", async () => {
    mundo.noEvento["ev-1"] = ["sp-vale", "sp-qcy"];
    // fecha a rodada
    mundo.itens.a = peca("a", { status: "awaiting_sponsor_approval" });
    mundo.naPeca.a = ["sp-vale", "sp-qcy"];
    mundo.aprovacoes.a = [linha("a", "sp-vale", "approved"), linha("a", "sp-qcy", "pending")];
    // só tinha a QCY → inativada
    mundo.itens.b = peca("b", { status: "awaiting_submission" });
    mundo.naPeca.b = ["sp-qcy"];
    // aprovada: a linha fica
    mundo.itens.c = peca("c", { status: "awaiting_sponsor_approval" });
    mundo.naPeca.c = ["sp-vale", "sp-qcy"];
    mundo.aprovacoes.c = [linha("c", "sp-vale", "pending"), linha("c", "sp-qcy", "approved")];
    // nunca teve a QCY → não é tocada
    mundo.itens.d = peca("d", { status: "awaiting_submission" });
    // excluída → fora
    mundo.itens.e = peca("e", { status: "awaiting_submission", deletedAt: new Date() });
    mundo.naPeca.e = ["sp-qcy"];

    const r = await tirarDoEvento();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ pecasDesvinculadas: 3, rodadasFechadas: 1, pecasInativadas: 1 });
    expect(mundo.itens.a.status).toBe("sponsor_approved");
    expect(mundo.itens.b.status).toBe("canceled");
    expect(mundo.aprovacoes.c.find((l) => l.sponsorId === "sp-qcy")?.status).toBe("approved");
    expect(mundo.itens.d.status).toBe("awaiting_submission");
    expect(mundo.naPeca.e).toEqual(["sp-qcy"]);
    // nada de varrer o acervo atrás de "peça sem patrocinador"
    expect(H.storage.getAllItems).not.toHaveBeenCalled();

    // trilha da PEÇA e trilha do EVENTO
    for (const id of ["a", "b", "c"]) {
      expect(H.trilha).toContainEqual(expect.objectContaining({ acao: "removed", tipo: "item", id, detalhe: expect.stringContaining("junto com a remoção do evento") }));
    }
    const doEvento = H.trilha.find((l) => l.tipo === "event_sponsor")!.detalhe;
    expect(doEvento).toContain("desvinculado também de 3 peças");
    expect(doEvento).toContain("1 rodada de aprovação fechou e a peça seguiu");
    expect(doEvento).toContain("1 peça que só tinha este patrocinador foi cancelada");
  });

  it("as peças rodam em PARALELO — o 'Salvando…' do modal não espera peça a peça", async () => {
    mundo.noEvento["ev-1"] = ["sp-qcy"];
    for (const id of ["a", "b", "c", "d"]) { mundo.itens[id] = peca(id, { status: "ready_for_production" }); mundo.naPeca[id] = ["sp-qcy", "sp-vale"]; }
    let emVoo = 0, pico = 0;
    const original = H.storage.removeSponsorFromItem.getMockImplementation();
    H.storage.removeSponsorFromItem.mockImplementation(async (...a: any[]) => {
      emVoo++; pico = Math.max(pico, emVoo);
      await new Promise((r) => setTimeout(r, 5));
      emVoo--;
      return original(...a);
    });
    await tirarDoEvento();
    expect(pico).toBe(4);
  });

  it("ganhou a guarda de evento finalizado — agora ela mexe em peça", async () => {
    mundo.noEvento["ev-fim"] = ["sp-qcy"];
    mundo.itens.a = peca("a", { eventId: "ev-fim" });
    mundo.naPeca.a = ["sp-qcy"];
    const r = await tirarDoEvento("ev-fim");
    expect(r.status).toBe(409);
    expect(H.storage.removeSponsorFromEvent).not.toHaveBeenCalled();
    expect(mundo.naPeca.a).toEqual(["sp-qcy"]);
  });
});
