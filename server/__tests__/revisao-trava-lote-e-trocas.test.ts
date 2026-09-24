// ─────────────────────────────────────────────────────────────────────────────
// VINCULAÇÃO → ARTE → REVISÃO FINAL: as regras das trocas, da trava e dos
// lotes, com as ROTAS REAIS de server/routes/items.ts (borda mockada).
//
//   1. trocar o arquivo final depois da liberação devolve a peça à Revisão;
//      com material produzido, 409; travada, 409 com o código da trava;
//   2. trocar o thumb: com o Atendimento (em aprovação) pede motivo e avisa o
//      Atendimento (decisão do dono 24/09); recusado depois da liberação;
//      depois da aprovação pede motivo e marca "trocada após aprovação";
//   3. a Revisão pergunta o que fazer com a trava ao liberar;
//   4. a Arte não libera nem devolve na Revisão (ARTE_DECIDE_NA_REVISAO);
//   5. o molde devolvido mantém o thumb e diz que foi para a Arte;
//   8. o lote de devolver traz o motivo por peça, grava hasModifiedData e
//      avisa por evento;
//  13. creator-reject e bulk-creator-reject não existem mais.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  createAuditLogsEmLote: (async () => {}) as any,
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
    createAuditLogsEmLote: (...a: any[]) => H.createAuditLogsEmLote(...a),
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

import { registerItemRoutes } from "../routes/items";
import { txDeMentira } from "./tx-de-mentira";
import {
  regraDaTrocaDeArquivoFinal, regraDaTrocaDeThumb, ERRO_JA_PRODUZIDO, ARTE_DECIDE_NA_REVISAO, papelDecideNaRevisao,
  MARCA_TROCA_APOS_APROVACAO, THUMB_APOS_APROVACAO, MARCA_TROCA_EM_APROVACAO, THUMB_EM_APROVACAO,
} from "@shared/troca-de-material";
import { CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params ?? {}, body: ctx.body ?? {}, query: {}, headers: {}, userRole: ctx.userRole, userId: "u1", userName: "Maria", session: {} };
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
let notificacoes: any[];
let trilha: string[];
let versoes: any[];

const peca = (over: any = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico", quantity: 10,
  quantityProduced: null, reuseQty: 0, isReuse: false, conferredQty: 0, deliveredQty: 0,
  status: "awaiting_final_review", skipApproval: false, approvalThumbUrl: "/objects/uploads/thumb-v1.png",
  finalFileUrl: "\\\\10.100.1.7\\arte\\v1.pdf", deletedAt: null, parentItemId: null, kitRemessaId: null,
  travadaEm: null, travadaPor: null, travadaMotivo: null, hasModifiedData: false, creatorReviewedAt: new Date("2026-09-20T12:00:00Z"),
  printMachine: null, impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null,
  ...over,
});
const TRAVA = { travadaEm: new Date("2026-09-21T12:00:00Z"), travadaPor: "Ana Solicitação", travadaMotivo: "Quantidade vai mudar" };

beforeEach(() => {
  mundo = {
    itens: {},
    eventos: {
      "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
      "ev-2": { id: "ev-2", name: "COPA SUL", status: "created", startDate: "2099-02-10", truckDepartureDate: new Date("2099-02-01T00:00:00Z") },
    },
  };
  notificacoes = []; trilha = []; versoes = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async (_req: any, _acao: string, _ent: string, _id: string, detalhe: string) => { trilha.push(detalhe); });
  H.createAuditLogsEmLote = vi.fn(async (_req: any, linhas: any[]) => { for (const l of linhas) trilha.push(l.details); });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(mundo)));
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async (id: string) => mundo.itens[id]);
  s.getEvent = vi.fn(async (id: string) => mundo.eventos[id]);
  s.updateItem = vi.fn(async (id: string, dados: any) => (mundo.itens[id] = { ...mundo.itens[id], ...dados, updatedAt: new Date() }));
  s.createNotification = vi.fn(async (n: any) => { notificacoes.push(n); return { id: `n${notificacoes.length}`, ...n }; });
  s.getItemSponsorApprovals = vi.fn(async () => []);
  s.getItemSponsors = vi.fn(async () => []);
  s.getSponsor = vi.fn(async () => null);
  s.getLiveComplements = vi.fn(async () => []);
  s.createItemArtVersion = vi.fn(async (v: any) => { versoes.push(v); return v; });
});

const ARQUIVO_NOVO = { finalFileUrl: "\\\\10.100.1.7\\arte\\v2.pdf", finalFileName: "v2.pdf" };

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · trocar o arquivo final depois que a peça andou", () => {
  const trocar = (userRole = "arte") => chamar("PATCH /api/items/:id/update-final-file", { params: { id: "p1" }, body: ARQUIVO_NOVO, userRole });

  it("na Revisão Final: troca simples, a peça fica onde está e a Gráfica não é chamada", async () => {
    mundo.itens.p1 = peca();
    const r = await trocar();
    expect(r.status).toBe(200);
    expect(r.body.voltouParaRevisao).toBe(false);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
    expect(mundo.itens.p1.finalFileUrl).toBe(ARQUIVO_NOVO.finalFileUrl);
    expect(notificacoes.some((n) => n.targetRoles.includes("grafica"))).toBe(false);
  });

  it("liberada: a troca DEVOLVE a peça para a Revisão Final e zera a revisão anterior", async () => {
    mundo.itens.p1 = peca({ status: "ready_for_production", reservaPorMaquina: { "1": 10 }, maquinaPrevista: "1" });
    const r = await trocar();
    expect(r.status).toBe(200);
    expect(r.body.voltouParaRevisao).toBe(true);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
    expect(mundo.itens.p1.creatorReviewedAt).toBeNull();
    expect(mundo.itens.p1.reservaPorMaquina).toBeNull();
    expect(mundo.itens.p1.previousFinalFileUrl).toBe("\\\\10.100.1.7\\arte\\v1.pdf");
    expect(trilha.some((t) => t.includes("volta para a Revisão Final"))).toBe(true);
    // Quem age agora é a Revisão; a Gráfica fica sabendo que a peça saiu.
    expect(notificacoes.find((n) => n.targetRoles.includes("solicitacao"))?.message).toContain("voltou para a Revisão Final");
    expect(notificacoes.find((n) => n.targetRoles.includes("grafica"))?.message).toContain("saiu da fila");
  });

  it("em impressão SEM nenhuma impressa: volta para a Revisão e sai da impressora", async () => {
    mundo.itens.p1 = peca({ status: "inProduction", quantityProduced: 0, printMachine: "2", impressaoPorMaquina: { "2": { atrib: 10, impressas: 0 } } });
    const r = await trocar();
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
    expect(mundo.itens.p1.printMachine).toBeNull();
    expect(mundo.itens.p1.impressaoPorMaquina).toBeNull();
  });

  it("com unidades impressas, conferidas ou entregues: 409 — é caso de complemento/reimpressão", async () => {
    for (const over of [
      { status: "inProduction", quantityProduced: 3 },
      { status: "produced", quantityProduced: 10 },
      { status: "conferred", quantityProduced: 10, conferredQty: 10 },
      { status: "delivered", quantityProduced: 10, conferredQty: 10, deliveredQty: 10 },
    ]) {
      mundo.itens.p1 = peca(over);
      const r = await trocar();
      expect(r.status, over.status).toBe(409);
      expect(r.body.error).toBe(ERRO_JA_PRODUZIDO);
      expect(mundo.itens.p1.finalFileUrl).toBe("\\\\10.100.1.7\\arte\\v1.pdf");
    }
  });

  it("travada pela Solicitação: 409 com a frase e o código da trava", async () => {
    mundo.itens.p1 = peca({ status: "ready_for_production", ...TRAVA });
    const r = await trocar();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(CODIGO_PECA_TRAVADA);
    expect(r.body.error).toContain("Quantidade vai mudar");
    expect(mundo.itens.p1.status).toBe("ready_for_production");
  });

  it("a regra pura que a tela da Arte lê é a mesma", () => {
    expect(regraDaTrocaDeArquivoFinal(peca({ status: "ready_for_production" }))).toEqual({ pode: true, voltaParaRevisao: true });
    expect(regraDaTrocaDeArquivoFinal(peca())).toEqual({ pode: true, voltaParaRevisao: false });
    expect(regraDaTrocaDeArquivoFinal(peca({ status: "inProduction", quantityProduced: 1 })).pode).toBe(false);
    expect(regraDaTrocaDeArquivoFinal(peca({ finalFileUrl: null })).pode).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · trocar o thumb", () => {
  const THUMB_NOVO = "/objects/uploads/thumb-v2.png";
  const trocar = (body: any = {}) => chamar("PATCH /api/items/:id/update-thumb", { params: { id: "p1" }, body: { approvalThumbUrl: THUMB_NOVO, ...body }, userRole: "arte" });

  // DECISÃO DO DONO (24/09): "pra gente não ter que ficar esperando alguém
  // recusar se vier alguma alteração" — a Arte troca o thumb com a peça ainda
  // com o Atendimento. Antes era 409 e a versão nova só entrava pela reprovação.
  it("em aprovação do patrocinador: sem motivo é 400 — o thumb não muda", async () => {
    expect(THUMB_EM_APROVACAO).toBe("motivo");
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    const r = await trocar({ motivo: "curto" });
    expect(r.status).toBe(400);
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/thumb-v1.png");
  });

  it("em aprovação, com motivo: troca, fica com o Atendimento, marca a versão e AVISA o Atendimento", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    const r = await trocar({ motivo: "patrocinador mandou o logo novo por e-mail" });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.approvalThumbUrl).toBe(THUMB_NOVO);
    expect(mundo.itens.p1.status, "a peça segue com o Atendimento").toBe("awaiting_sponsor_approval");
    expect(versoes[0]).toMatchObject({ origem: "troca", createdBy: `Maria (${MARCA_TROCA_EM_APROVACAO})` });
    expect(trilha.some((t) => t.includes(MARCA_TROCA_EM_APROVACAO) && t.includes("logo novo por e-mail"))).toBe(true);
    const aviso = notificacoes.find((n) => n.targetRoles.includes("atendimento"));
    expect(aviso?.message).toContain("apresente a versão nova");
    expect(aviso?.message).toContain("logo novo por e-mail");
    expect(aviso?.type, "grupo 'Precisa de ação' do sino").toBe("itemRejected");
  });

  it("em aprovação: o desaprovador estrito que já tinha aprovado volta a aprovar (e o aviso diz quem)", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_sponsor_approval" });
    const aprovacao = { id: "ap1", sponsorId: "s1", status: "approved" };
    H.storage.getItemSponsors = vi.fn(async () => [{ sponsorId: "s1" }]);
    H.storage.getItemSponsorApprovals = vi.fn(async () => [aprovacao]);
    H.storage.getSponsor = vi.fn(async () => ({ id: "s1", name: "Banco Aurora", strictApproval: true }));
    const mudancas: any[] = [];
    H.storage.updateItemSponsorApproval = vi.fn(async (_id: string, d: any) => { mudancas.push(d); return { ...aprovacao, ...d }; });
    const r = await trocar({ motivo: "patrocinador mandou o logo novo por e-mail" });
    expect(r.status).toBe(200);
    expect(mudancas[0]?.status).toBe("new_version_pending");
    expect(notificacoes.find((n) => n.targetRoles.includes("atendimento"))?.message).toContain("Banco Aurora precisa aprovar de novo");
  });

  it("liberada em diante: 409", async () => {
    for (const status of ["ready_for_production", "inProduction", "produced", "delivered"]) {
      mundo.itens.p1 = peca({ status });
      expect((await trocar({ motivo: "cor errada no logo do patrocinador" })).status, status).toBe(409);
    }
  });

  it("depois da aprovação (decisão padrão \"motivo\"): sem motivo é 400", async () => {
    expect(THUMB_APOS_APROVACAO).toBe("motivo");
    mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    const r = await trocar({ motivo: "curto" });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("10 caracteres");
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/thumb-v1.png");
  });

  it("depois da aprovação, com motivo: troca e marca \"trocada após aprovação\" na trilha e na versão", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_final_review" });
    const r = await trocar({ motivo: "logo do patrocinador na versão errada" });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.approvalThumbUrl).toBe(THUMB_NOVO);
    // A frase que a tela de Versões lê por regex continua intacta…
    expect(trilha.some((t) => t.startsWith("Thumb de aprovação atualizado por Maria. Anterior: /objects/uploads/thumb-v1.png → Novo: " + THUMB_NOVO))).toBe(true);
    // …e a marca com o motivo vem numa linha própria.
    expect(trilha.some((t) => t.includes(MARCA_TROCA_APOS_APROVACAO) && t.includes("logo do patrocinador na versão errada"))).toBe(true);
    expect(versoes[0]).toMatchObject({ origem: "troca", createdBy: `Maria (${MARCA_TROCA_APOS_APROVACAO})` });
  });

  it("antes da aprovação: livre, sem motivo", async () => {
    mundo.itens.p1 = peca({ status: "awaiting_submission" });
    const r = await trocar();
    expect(r.status).toBe(200);
    expect(versoes[0].createdBy).toBe("Maria");
  });

  it("peça isenta de aprovação na Revisão: ninguém aprovou este thumb, não pede motivo", () => {
    expect(regraDaTrocaDeThumb(peca({ status: "awaiting_creator_review", skipApproval: true }))).toEqual({ pode: true, exigeMotivo: false });
    expect(regraDaTrocaDeThumb(peca({ status: "sponsor_approved" }))).toEqual({ pode: true, exigeMotivo: true });
    // Com o Atendimento: pode, com motivo (a tela da Arte lê esta mesma regra).
    expect(regraDaTrocaDeThumb(peca({ status: "awaiting_sponsor_approval" }))).toEqual({ pode: true, exigeMotivo: true });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · a trava na Revisão Final", () => {
  const liberar = (body: any = {}) => chamar("PATCH /api/items/:id/creator-review", { params: { id: "p1" }, body, userRole: "solicitacao" });

  it("travada, sem escolher: 409 com o código — a tela pergunta", async () => {
    mundo.itens.p1 = peca(TRAVA);
    const r = await liberar();
    expect(r.status).toBe(409);
    expect(r.body.code).toBe(CODIGO_PECA_TRAVADA);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
  });

  it("\"Liberar e destravar\": libera e limpa a trava na mesma gravação, com trilha", async () => {
    mundo.itens.p1 = peca(TRAVA);
    const r = await liberar({ destravar: true });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("ready_for_production");
    expect(mundo.itens.p1.travadaEm).toBeNull();
    expect(mundo.itens.p1.travadaMotivo).toBeNull();
  });

  it("\"Liberar mantendo a trava\": libera e a trava continua", async () => {
    mundo.itens.p1 = peca(TRAVA);
    const r = await liberar({ manterTrava: true });
    expect(r.status).toBe(200);
    expect(mundo.itens.p1.status).toBe("ready_for_production");
    expect(mundo.itens.p1.travadaMotivo).toBe("Quantidade vai mudar");
  });

  it("peça livre libera como sempre", async () => {
    mundo.itens.p1 = peca();
    expect((await liberar()).status).toBe(200);
    expect(mundo.itens.p1.status).toBe("ready_for_production");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · a Arte não decide na Revisão Final (decisão padrão)", () => {
  it("creator-review, return-to-arte e o lote recusam o perfil Arte", async () => {
    expect(ARTE_DECIDE_NA_REVISAO).toBe(false);
    expect(papelDecideNaRevisao("arte")).toBe(false);
    expect(papelDecideNaRevisao("solicitacao")).toBe(true);
    mundo.itens.p1 = peca();
    const motivo = { notes: "arquivo sem sangria nas bordas" };
    expect((await chamar("PATCH /api/items/:id/creator-review", { params: { id: "p1" }, userRole: "arte" })).status).toBe(403);
    expect((await chamar("PATCH /api/items/:id/return-to-arte", { params: { id: "p1" }, body: motivo, userRole: "arte" })).status).toBe(403);
    expect((await chamar("PATCH /api/items/bulk-return-to-arte", { body: { itemIds: ["p1"], ...motivo }, userRole: "arte" })).status).toBe(403);
    expect(mundo.itens.p1.status).toBe("awaiting_final_review");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · o molde devolvido pela Revisão", () => {
  it("volta para o começo da Arte COM o thumb, e a resposta diz o destino real", async () => {
    mundo.itens.p1 = peca({ type: "Molde", finalFileUrl: null });
    const r = await chamar("PATCH /api/items/:id/return-to-arte", {
      params: { id: "p1" }, body: { notes: "o recorte do molde saiu torto", destino: "finalizacao" }, userRole: "solicitacao",
    });
    expect(r.status).toBe(200);
    expect(r.body.destinoDevolvido).toBe("arte");
    expect(mundo.itens.p1.status).toBe("awaiting_submission");
    expect(mundo.itens.p1.approvalThumbUrl).toBe("/objects/uploads/thumb-v1.png");
  });

  it("peça comum com destino \"arte\" continua perdendo o thumb (arte nova, aprovação nova)", async () => {
    mundo.itens.p1 = peca();
    const r = await chamar("PATCH /api/items/:id/return-to-arte", {
      params: { id: "p1" }, body: { notes: "a arte inteira está desatualizada", destino: "arte" }, userRole: "solicitacao",
    });
    expect(r.body.destinoDevolvido).toBe("arte");
    expect(mundo.itens.p1.approvalThumbUrl).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("8 · devolução em lote", () => {
  it("o motivo de cada recusa vem por id; grava o mesmo que a individual; avisa por evento", async () => {
    mundo.itens.a = peca({ id: "a", displayId: "#0001" });
    mundo.itens.b = peca({ id: "b", displayId: "#0002", eventId: "ev-2", type: "Molde", finalFileUrl: null });
    mundo.itens.c = peca({ id: "c", displayId: "#0003", status: "ready_for_production" });
    const r = await chamar("PATCH /api/items/bulk-return-to-arte", {
      body: { itemIds: ["a", "b", "c", "sumiu"], notes: "trocar a fonte do título", destino: "finalizacao" }, userRole: "solicitacao",
    });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(2);
    const porId = Object.fromEntries(r.body.errors.map((e: any) => [e.itemId, e.error]));
    expect(porId.c).toContain("Pronto para Produção");
    expect(porId.sumiu).toBe("Peça não encontrada.");
    expect(r.body.destinos).toEqual({ a: "finalizacao", b: "arte" });
    // Os mesmos campos da individual — inclusive o aviso de dados modificados.
    expect(mundo.itens.a).toMatchObject({ hasModifiedData: true, rejectedByCreator: true, rejectionReason: "trocar a fonte do título", creatorReviewedAt: null });
    expect(mundo.itens.b.approvalThumbUrl).toBe("/objects/uploads/thumb-v1.png");
    // Uma notificação por evento, cada uma com o próprio evento.
    const daArte = notificacoes.filter((n) => n.targetRoles.includes("arte"));
    expect(daArte.map((n) => n.eventId).sort()).toEqual(["ev-1", "ev-2"]);
    expect(daArte.find((n) => n.eventId === "ev-2").message).toContain("COPA SUL");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("13 · as rotas mortas saíram", () => {
  it("creator-reject e bulk-creator-reject não estão registradas", () => {
    expect(rotas.has("PATCH /api/items/:id/creator-reject")).toBe(false);
    expect(rotas.has("PATCH /api/items/bulk-creator-reject")).toBe(false);
    expect(rotas.has("PATCH /api/items/:id/return-to-arte")).toBe(true);
  });
});
