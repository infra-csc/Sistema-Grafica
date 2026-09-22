// ─────────────────────────────────────────────────────────────────────────────
// MOLDE — o tipo de peça de fluxo curto (dono, 22/09).
//
// "A criação é feita normal, mas não vai passar por Vincular Patrocinadores; a
// Arte coloca o thumb e depois já vai direto para a Revisão; na Gráfica ele vai
// ter apenas o status de Produzido; claro, depois de ser liberado. O fluxo dele
// morre no Produzido."
//
// Este arquivo prende as três camadas:
//   1. a REGRA pura (shared/molde.ts) — reconhecimento do tipo e etapas;
//   2. as ROTAS REAIS (registerItemRoutes + registerMoldeRoutes + Máquinas),
//      com a borda mockada (db, storage, shared) como em complemento-rotas;
//   3. as CONTAGENS — o molde produzido conta como a peça entregue conta.
// E a autorrevisão: nenhum caminho leva molde a conferir/embalar/entregar, e a
// peça comum segue idêntica.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
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
    requireRole: () => (_req: any, _res: any, next: any) => next(),
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

import {
  ehMolde, ehTipoMolde, tipoCanonico, TIPOS_DE_PECA, statusAoEnviarALista, gestoDoMolde, etapaDoMolde,
  statusParaContagem, statusDeExibicao, destinoDaDevolucao, arquivoFinalOk, quantidadeProduzidaDoMolde,
  TRILHA_ENVIO_DO_MOLDE, TRILHA_MOLDE_PRODUZIDO, TRILHA_MOLDE_DESFEITO,
} from "@shared/molde";
import { registerItemRoutes } from "../routes/items";
import { registerMoldeRoutes } from "../routes/molde";
import { registerMaquinasRoutes } from "../routes/maquinas";
import { enrichEvent, countOpenWork } from "../routes/events";
import { buildEventPrazo } from "../services/prazo-domain";
import { contarPorFase, PHASES } from "@/lib/fases";
import { computeStats } from "@/lib/painel-kpis";
import { countPendentes } from "@/lib/painel-prazo";
import { itemCasaFiltros, FILTROS_VAZIOS } from "@/lib/grafica-filtros";
import { canConfer, isDelivered, isProduced } from "@/lib/saldo";
import { getStatusMeta } from "@/lib/status";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");

// ═════════════════════════════════════════════════════════════════════════════
// 1. A REGRA PURA
// ═════════════════════════════════════════════════════════════════════════════
describe("shared/molde — reconhecer o tipo", () => {
  it("aceita caixa, acento e plural; recusa o que só contém a palavra", () => {
    for (const t of ["Molde", "MOLDE", "molde", " moldes ", "MOLDES", "Mólde"]) expect(ehTipoMolde(t), t).toBe(true);
    for (const t of ["", null, undefined, "Moldura", "Molde 2x1", "Pórtico", "Arena"]) expect(ehTipoMolde(t as any), String(t)).toBe(false);
    expect(ehMolde({ type: "MOLDE" })).toBe(true);
    expect(ehMolde({ type: "Pórtico" })).toBe(false);
    expect(ehMolde(null)).toBe(false);
  });

  it("a importação grava o nome canônico — e não toca nos outros tipos", () => {
    expect(tipoCanonico("MOLDE")).toBe("Molde");
    expect(tipoCanonico("moldes")).toBe("Molde");
    expect(tipoCanonico("TESTEIRA PÓRTICO")).toBe("TESTEIRA PÓRTICO");
    expect(ler("server/services/xlsxImport.ts")).toContain("type: tipoCanonico(groupType),");
  });

  it("\"Molde\" está na lista ÚNICA de tipos, lida pelo Detalhe do Evento e pelos Modelos", () => {
    expect(TIPOS_DE_PECA).toContain("Molde");
    for (const t of ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"]) {
      expect(TIPOS_DE_PECA, t).toContain(t);
    }
    for (const tela of ["client/src/pages/event-detail.tsx", "client/src/pages/modelos.tsx"]) {
      expect(ler(tela), tela).toContain("const itemTypes = [...TIPOS_DE_PECA];");
    }
  });
});

describe("shared/molde — as etapas", () => {
  it("enviar a lista: molde pula a Vinculação; peça comum não", () => {
    expect(statusAoEnviarALista({ type: "Molde" })).toBe("awaiting_submission");
    expect(statusAoEnviarALista({ type: "Pórtico" })).toBe("awaiting_linking");
    expect(ler("server/routes/events.ts")).toContain("storage.updateItemWithStatusCheck(item.id, item.status as ItemStatus, statusAoEnviarALista(item))");
  });

  it("os dois gestos da Gráfica: produzir (liberado) e desfazer (produzido, ninguém mexeu)", () => {
    const m = (over: any) => ({ type: "Molde", quantity: 4, reuseQty: 0, ...over });
    for (const s of ["ready_for_production", "pronto_para_producao", "approved", "liberado"]) expect(gestoDoMolde(m({ status: s })), s).toBe("produzir");
    expect(gestoDoMolde(m({ status: "produced", quantityProduced: 4 }))).toBe("desfazer");
    // reaproveitamento total (produzido na Revisão) não se desfaz aqui
    expect(gestoDoMolde(m({ status: "produced", quantityProduced: 0, isReuse: true }))).toBeNull();
    for (const s of ["awaiting_submission", "awaiting_final_review", "inProduction", "conferred", "packed", "delivered"]) {
      expect(gestoDoMolde(m({ status: s })), s).toBeNull();
    }
    expect(gestoDoMolde({ type: "Pórtico", status: "ready_for_production" })).toBeNull();
    expect(quantidadeProduzidaDoMolde({ quantity: 10, reuseQty: 3 })).toBe(7);
  });

  it("a trilha da ficha tem três etapas: Arte → Revisão → Produzido", () => {
    expect(etapaDoMolde("draft")).toBe(-1);
    expect(etapaDoMolde("awaiting_submission")).toBe(0);
    expect(etapaDoMolde("awaiting_final_review")).toBe(1);
    expect(etapaDoMolde("ready_for_production")).toBe(2);
    expect(etapaDoMolde("produced")).toBe(3);
  });

  it("contagem × exibição: produzido conta como entregue e se lê \"Produzido (molde)\"", () => {
    expect(statusParaContagem({ type: "Molde", status: "produced" })).toBe("delivered");
    expect(statusParaContagem({ type: "Molde", status: "ready_for_production" })).toBe("ready_for_production");
    expect(statusParaContagem({ type: "Pórtico", status: "produced" })).toBe("produced");
    expect(statusDeExibicao({ type: "Molde", status: "produced" })).toBe("molde_produzido");
    expect(getStatusMeta("molde_produzido").label).toBe("Produzido (molde)");
    expect(getStatusMeta("molde_produzido").short).toBe("Produzido");
    expect(getStatusMeta("molde_produzido").label).not.toMatch(/Acabamento/);
  });

  it("revisão: molde volta só para a Arte e libera sem arquivo final", () => {
    expect(destinoDaDevolucao("finalizacao", { type: "Molde" })).toBe("arte");
    expect(destinoDaDevolucao("finalizacao", { type: "Pórtico" })).toBe("finalizacao");
    expect(arquivoFinalOk({ type: "Molde", finalFileUrl: null })).toBe(true);
    expect(arquivoFinalOk({ type: "Pórtico", finalFileUrl: null })).toBe(false);
    expect(arquivoFinalOk({ type: "Pórtico", finalFileUrl: "x.pdf" })).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. AS ROTAS REAIS
// ═════════════════════════════════════════════════════════════════════════════
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);
registerMoldeRoutes(appFalso);
registerMaquinasRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; query?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: ctx.query ?? {}, headers: {}, userRole: ctx.userRole, userId: "u1", userName: "Maria", session: {} };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.send = res.json;
  for (const h of handlers) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

let mundo: { itens: Record<string, any>; eventos: Record<string, any> };
let trilha: string[];
let notificacoes: any[];
let txSets: any[];

const peca = (over: any = {}) => ({
  id: "m1", displayId: "#0500", eventId: "ev-1", type: "Molde", description: "Molde do pórtico", quantity: 3,
  quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0, deliveredQty: 0,
  status: "awaiting_submission", skipApproval: false, approvalThumbUrl: null, finalFileUrl: null, deletedAt: null, parentItemId: null,
  ...over,
});

beforeEach(() => {
  mundo = {
    itens: {},
    eventos: { "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") } },
  };
  trilha = []; notificacoes = []; txSets = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async (_a: any, _acao: string, _t: string, _id: string, det: string) => { trilha.push(det); });
  H.db.transaction = vi.fn(async (cb: any) => cb({
    update: () => ({ set: (vals: any) => ({ where: () => ({ returning: async () => { txSets.push(vals); return [{ ...mundo.itens.m1, ...mundo.itens.p1, ...vals, id: "x" }]; } }) }) }),
    insert: () => ({ values: (vals: any) => { const p: any = Promise.resolve([vals]); p.returning = async () => [{ id: "n1", ...vals }]; return p; } }),
    execute: async () => ({ rows: [] }),
    select: () => ({ from: () => ({ where: async () => [] }) }),
  }));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => (mundo.itens[id] = { ...mundo.itens[id], ...dados }));
  s.getItemSponsors = vi.fn(async () => [{ sponsorId: "sp-1" }]);
  s.getItemSponsorApprovals = vi.fn(async () => []);
  s.initializeItemSponsorApprovals = vi.fn(async () => {});
  s.createItemArtVersion = vi.fn(async () => ({}));
  s.createNotification = vi.fn(async (n: any) => { notificacoes.push(n); return { id: "n1", ...n }; });
  s.getSponsor = vi.fn(async () => null);
});

const THUMB = "/objects/uploads/thumb-molde.png";

describe("Arte → envio do molde vai direto para a Revisão Final", () => {
  it("molde: awaiting_submission → awaiting_final_review, trilha própria, só a Solicitação é avisada", async () => {
    mundo.itens.m1 = peca();
    const r = await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "m1" }, body: { approvalThumbUrl: THUMB }, userRole: "arte" });
    expect(r.status).toBe(200);
    expect(mundo.itens.m1.status).toBe("awaiting_final_review");
    expect(mundo.itens.m1.approvalThumbUrl).toBe(THUMB);
    expect(trilha.some((t) => t.startsWith(TRILHA_ENVIO_DO_MOLDE))).toBe(true);
    expect(TRILHA_ENVIO_DO_MOLDE).toBe("Molde: thumb enviado direto para a Revisão Final (sem aprovação de patrocinador nem arquivo final)");
    // Mesmo COM patrocinador vinculado: nenhuma rodada de aprovação, nenhum aviso ao Atendimento.
    expect(H.storage.initializeItemSponsorApprovals).not.toHaveBeenCalled();
    expect(notificacoes.map((n) => n.targetRoles)).toEqual([["solicitacao"]]);
  });

  it("molde sem patrocinador também envia (não é exigido em lugar nenhum)", async () => {
    mundo.itens.m1 = peca();
    H.storage.getItemSponsors = vi.fn(async () => []);
    const r = await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "m1" }, body: { approvalThumbUrl: THUMB }, userRole: "arte" });
    expect(r.status).toBe(200);
    expect(mundo.itens.m1.status).toBe("awaiting_final_review");
  });

  it("peça COMUM inalterada: com patrocinador → aprovação; sem → finalização", async () => {
    mundo.itens.p1 = peca({ id: "p1", type: "Pórtico" });
    await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "p1" }, body: { approvalThumbUrl: THUMB }, userRole: "arte" });
    expect(mundo.itens.p1.status).toBe("awaiting_sponsor_approval");
    expect(H.storage.initializeItemSponsorApprovals).toHaveBeenCalledWith("p1", ["sp-1"]);
    expect(notificacoes.map((n) => n.targetRoles)).toEqual([["atendimento"]]);

    mundo.itens.p2 = peca({ id: "p2", type: "Pórtico" });
    H.storage.getItemSponsors = vi.fn(async () => []);
    await chamar("PATCH /api/items/:id/submit-for-approval", { params: { id: "p2" }, body: { approvalThumbUrl: THUMB }, userRole: "arte" });
    expect(mundo.itens.p2.status).toBe("awaiting_creator_review");
  });

  it("\"Direto para finalização\" recusa o molde (ele não tem aprovação nem finalização)", async () => {
    mundo.itens.m1 = peca();
    const r = await chamar("PATCH /api/items/:id/dispense", { params: { id: "m1" }, body: { reason: "x" }, userRole: "arte" });
    expect(r.status).toBe(409);
    expect(mundo.itens.m1.status).toBe("awaiting_submission");
  });
});

describe("Revisão Final — libera o molde sem arquivo final", () => {
  it("molde sem arquivo final → ready_for_production", async () => {
    mundo.itens.m1 = peca({ status: "awaiting_final_review", approvalThumbUrl: THUMB });
    const r = await chamar("PATCH /api/items/:id/creator-review", { params: { id: "m1" }, userRole: "solicitacao" });
    expect(r.status).toBe(200);
    expect(txSets[0].status).toBe("ready_for_production");
  });

  it("peça comum sem arquivo final continua barrada (a regra só não vale para o molde)", async () => {
    mundo.itens.p1 = peca({ id: "p1", type: "Pórtico", status: "awaiting_final_review" });
    const r = await chamar("PATCH /api/items/:id/creator-review", { params: { id: "p1" }, userRole: "solicitacao" });
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/arquivo final/);
  });

  it("a devolução do molde vai sempre para a Arte (não há finalização)", () => {
    const rotasSrc = ler("server/routes/items.ts");
    expect(rotasSrc.split("camposDoDestino(destinoDaDevolucao(destino, currentItem), await rodadaDeAprovacaoFechada(currentItem))").length - 1).toBe(5);
    expect(rotasSrc).not.toContain("camposDoDestino(destino, await rodadaDeAprovacaoFechada(currentItem))");
  });
});

describe("Gráfica — \"Marcar como produzido\" e o desfazer", () => {
  it("liberado → produced, a peça INTEIRA menos o reaproveitado, com trilha", async () => {
    mundo.itens.m1 = peca({ status: "ready_for_production", quantity: 5, reuseQty: 2 });
    const r = await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "grafica" });
    expect(r.status).toBe(200);
    expect(mundo.itens.m1.status).toBe("produced");
    expect(mundo.itens.m1.quantityProduced).toBe(3);
    expect(mundo.itens.m1.producedAt).toBeInstanceOf(Date);
    expect(trilha.some((t) => t.startsWith(TRILHA_MOLDE_PRODUZIDO))).toBe(true);
    // updateItem carimba updatedAt/statusChangedAt (storage.updateItem é o funil)
    expect(H.storage.updateItem).toHaveBeenCalledWith("m1", expect.objectContaining({ status: "produced" }));
  });

  it("mesmos papéis de quem imprime: Solicitação e Arte levam 403", async () => {
    mundo.itens.m1 = peca({ status: "ready_for_production" });
    for (const papel of ["solicitacao", "arte", "atendimento"]) {
      const r = await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: papel });
      expect(r.status, papel).toBe(403);
    }
    expect((await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "admin" })).status).toBe(200);
  });

  it("recusa peça comum, molde ainda em revisão e evento finalizado", async () => {
    mundo.itens.p1 = peca({ id: "p1", type: "Pórtico", status: "ready_for_production" });
    expect((await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "p1" }, userRole: "grafica" })).status).toBe(409);
    expect(mundo.itens.p1.status).toBe("ready_for_production");

    mundo.itens.m1 = peca({ status: "awaiting_final_review" });
    expect((await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "grafica" })).status).toBe(409);
    expect(mundo.itens.m1.status).toBe("awaiting_final_review");

    mundo.itens.m1 = peca({ status: "ready_for_production" });
    mundo.eventos["ev-1"].manuallyClosed = true;
    mundo.eventos["ev-1"].status = "closed";
    const r = await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "grafica" });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("EVENT_FINALIZED");
    expect(mundo.itens.m1.status).toBe("ready_for_production");
  });

  it("clique repetido não é erro (já produzido)", async () => {
    mundo.itens.m1 = peca({ status: "produced", quantityProduced: 3 });
    const r = await chamar("PATCH /api/items/:id/molde-produzido", { params: { id: "m1" }, userRole: "grafica" });
    expect(r.status).toBe(200);
    expect(H.storage.updateItem).not.toHaveBeenCalled();
  });

  it("\"Voltar para liberado\": produced → ready_for_production, zera o produzido, com trilha", async () => {
    mundo.itens.m1 = peca({ status: "produced", quantityProduced: 3, producedAt: new Date() });
    const r = await chamar("PATCH /api/items/:id/molde-voltar-liberado", { params: { id: "m1" }, userRole: "grafica" });
    expect(r.status).toBe(200);
    expect(mundo.itens.m1.status).toBe("ready_for_production");
    expect(mundo.itens.m1.quantityProduced).toBe(0);
    expect(mundo.itens.m1.producedAt).toBeNull();
    expect(trilha.some((t) => t.startsWith(TRILHA_MOLDE_DESFEITO))).toBe(true);
    expect((await chamar("PATCH /api/items/:id/molde-voltar-liberado", { params: { id: "m1" }, userRole: "solicitacao" })).status).toBe(403);
  });
});

describe("AUTORREVISÃO — nenhum caminho leva o molde a imprimir, conferir, embalar ou entregar", () => {
  it("start-printing, start-production e confer recusam o molde", async () => {
    mundo.itens.m1 = peca({ status: "ready_for_production" });
    const imprimir = await chamar("PATCH /api/items/:id/start-printing", { params: { id: "m1" }, body: { printMachine: "1" }, userRole: "grafica" });
    expect(imprimir.status).toBe(409);
    expect(imprimir.body.error).toMatch(/Marcar como produzido/);

    mundo.itens.m1 = peca({ status: "inProduction" });
    const produzir = await chamar("PATCH /api/items/:id/start-production", { params: { id: "m1" }, body: { quantityProduced: 3 }, userRole: "grafica" });
    expect(produzir.status).toBe(409);

    mundo.itens.m1 = peca({ status: "produced", quantityProduced: 3 });
    const conferir = await chamar("POST /api/items/:id/confer", { params: { id: "m1" }, body: { conferencePhotoUrl: "/objects/f.jpg" }, userRole: "grafica" });
    expect(conferir.status).toBe(409);
    expect(conferir.body.error).toMatch(/termina no Produzido/);
    expect(mundo.itens.m1.status).toBe("produced");
    expect(mundo.itens.m1.conferredQty).toBe(0);
  });

  it("sem conferência não há embalagem (o tubo exige unidade conferida) nem entrega", async () => {
    const { planejarEmbalar } = await import("@shared/embalagem");
    const plano = planejarEmbalar({ ...peca({ status: "produced", quantityProduced: 3 }) } as any);
    expect(plano.ok).toBe(false);
    const entregar = await chamar("PATCH /api/items/:id/deliver", { params: { id: "m1" }, userRole: "grafica" });
    expect(entregar.status).not.toBe(200);
  });

  it("o cliente também não oferece: saldo trata molde produzido como concluído, sem conferência", () => {
    const produzido = peca({ status: "produced", quantityProduced: 3 });
    expect(isDelivered(produzido)).toBe(true);
    expect(isProduced(produzido)).toBe(false);
    expect(canConfer(produzido)).toBe(false);
    expect(canConfer(peca({ status: "ready_for_production", reuseQty: 1 }))).toBe(false);
    // peça comum: nada mudou
    const comum = peca({ type: "Pórtico", status: "produced", quantityProduced: 3 });
    expect(isDelivered(comum)).toBe(false);
    expect(isProduced(comum)).toBe(true);
    expect(canConfer(comum)).toBe(true);
  });
});

describe("Máquinas — o molde não entra na fila das impressoras", () => {
  const textoDoSql = (q: any): string =>
    (q?.queryChunks ?? []).map((c: any) => (typeof c === "string" ? c : Array.isArray(c?.value) ? c.value.join("") : "")).join("");

  it("a fila geral e as reservas saem sem o molde; a peça comum continua", async () => {
    const linha = (id: string, type: string) => ({
      id, display_id: `#${id}`, type, description: null, material: null, measurement: null, quantity: 2, status: "ready_for_production",
      produzido: 0, reuso: 0, calculated_m2: null, maquina_prevista: null, reserva_por_maquina: null, print_machine: null, impressao_por_maquina: null,
      kit_remessa_id: null, criado_por_id: null, approval_thumb_url: null, desde: null, evento_id: "ev-1", evento: "COPA", evento_status: "created",
      deadline_producao_grafica: -1, saida_caminhao: null, evento_inicio: null, evento_reaberto: null,
    });
    H.db.execute = vi.fn(async (q: any) => {
      const sql = textoDoSql(q);
      if (/i\.status in \('ready_for_production'/.test(sql) && /maquina_prevista/.test(sql)) {
        return { rows: [linha("m1", "Molde"), linha("m2", "MOLDES"), linha("p1", "Pórtico")] };
      }
      return { rows: [] };
    });
    const r = await chamar("GET /api/grafica/maquinas", { userRole: "grafica" });
    expect(r.status).toBe(200);
    expect(r.body.filaGeral.map((p: any) => p.id)).toEqual(["p1"]);
  });

  it("reservar/trocar para a impressora recusam o molde no servidor", () => {
    const src = ler("server/routes/maquinas.ts");
    expect(src).toContain("if (ehMolde(item)) return \"Molde não entra na fila das impressoras");
    expect(src).toContain("if (ehMolde(entra)) throw falha(409,");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. AS CONTAGENS — molde produzido conta como CONCLUÍDO
// ═════════════════════════════════════════════════════════════════════════════
describe("contagens — o molde produzido conta onde a peça entregue conta", () => {
  const HOJE = Date.UTC(2026, 8, 22);
  const evento = { id: "ev-1", name: "COPA", status: "created", startDate: "2099-01-10", truckDepartureDate: "2099-01-05T00:00:00Z" };

  it("evento com peças entregues e moldes produzidos é CONCLUÍDO", () => {
    const itens = [
      { status: "delivered", type: "Pórtico" },
      { status: "produced", type: "Molde" },
      { status: "produced", type: "MOLDE" },
    ];
    const e = enrichEvent(evento, itens, [], HOJE);
    expect(e.allDelivered).toBe(true);
    expect(e.lifecycle).toBe("completed");
    expect(e.deliveredCount).toBe(3);
    expect(e.openCount).toBe(0);
    expect(countOpenWork(itens).openCount).toBe(0);
  });

  it("peça comum em acabamento continua em aberto (nada mudou para ela)", () => {
    const itens = [{ status: "produced", type: "Pórtico" }, { status: "produced", type: "Molde" }];
    const e = enrichEvent(evento, itens, [], HOJE);
    expect(e.allDelivered).toBe(false);
    expect(e.openCount).toBe(1);
  });

  it("Gestão de Prazos: evento com tudo entregue/produzido sai; molde produzido não é cobrado", () => {
    const base = { displayId: "#1", description: null, quantity: 1 };
    expect(buildEventPrazo(evento as any, [
      { ...base, id: "a", status: "delivered", type: "Pórtico" },
      { ...base, id: "b", status: "produced", type: "Molde" },
    ], { today: HOJE })).toBeNull();
    const comPendente = buildEventPrazo(evento as any, [
      { ...base, id: "a", status: "produced", type: "Pórtico" },
      { ...base, id: "b", status: "produced", type: "Molde" },
    ], { today: HOJE });
    expect(comPendente).not.toBeNull();
    expect(JSON.stringify(comPendente)).not.toContain("\"b\"");
  });

  it("barras de fase, Painel e pendências tratam o molde produzido como entregue", () => {
    const itens = [{ status: "produced", type: "Molde" }, { status: "produced", type: "Pórtico" }];
    const fases = contarPorFase(itens);
    expect(fases[PHASES.findIndex((p) => p.key === "delivered")]).toBe(1);
    expect(fases[PHASES.findIndex((p) => p.key === "produced")]).toBe(1);
    const stats = computeStats(itens);
    expect(stats.byGroup.delivered).toBe(1);
    expect(stats.byGroup.produced).toBe(1);
    expect(countPendentes(itens)).toBe(1);
  });

  it("Gráfica: o filtro \"Entregues\" mostra o molde produzido; \"Impresso\" não", () => {
    const ctx: any = { hojeUTC: HOJE, groupOf: () => "" };
    const molde = { id: "m", type: "Molde", status: "produced", eventId: "ev-1" };
    expect(itemCasaFiltros(molde as any, { ...FILTROS_VAZIOS, status: ["delivered"] }, ctx)).toBe(true);
    expect(itemCasaFiltros(molde as any, { ...FILTROS_VAZIOS, status: ["produced"] }, ctx)).toBe(false);
    // oculto por padrão, como as entregues
    expect(itemCasaFiltros(molde as any, FILTROS_VAZIOS, ctx)).toBe(false);
  });

  it("dados antigos: nenhum código tratava \"molde\" antes (nada muda no que existe)", () => {
    // O predicado é por TIPO; peça comum nunca casa — a lista de tipos antiga não tem molde.
    for (const t of ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"]) {
      expect(ehTipoMolde(t), t).toBe(false);
    }
  });
});
