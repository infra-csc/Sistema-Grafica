// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DA MÁQUINA DE ESTADOS DIZ A VERDADE — rota a rota, status a status.
//
// shared/maquina-de-estados.ts declara, para cada ação, de onde a peça pode
// sair, para onde vai e quem pode. Este arquivo roda os HANDLERS REAIS (as
// rotas da peça e as do molde, com o banco de mentira de tx-de-mentira.ts) e,
// para cada cenário, passa a peça por TODO status conhecido (e um inventado):
//
//   · status na origem da ação  → a rota aceita (2xx) e a peça termina no
//     destino que a tabela diz (ou onde estava, quando o destino é "mesmo");
//   · status fora da origem     → a rota recusa (4xx) e a peça não muda —
//     ou, nas ações que só às vezes mudam o status, a peça não muda.
//
// As ações de rotas fora de routes/itens e molde (vinculação, tubos, saída de
// patrocinador) ficam na lista FORA_DESTE_TESTE, com o teste que as cobre; um
// teste abaixo exige que toda ação da tabela esteja num lugar ou no outro.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { txDeMentira } from "./tx-de-mentira";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: {} as Record<string, any>,
  mundo: { itens: {} as Record<string, any> },
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
    broadcast: () => {},
    createAuditLog: async () => {},
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../routes/pedidos-de-peca", async () => {
  const real = await vi.importActual<any>("../routes/pedidos-de-peca");
  return { ...real, aoExcluirPeca: async () => {} };
});
vi.mock("../routes/estoque-reservas", async () => {
  const real = await vi.importActual<any>("../routes/estoque-reservas");
  return { ...real, liberarReservasDasPecas: async () => {} };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/ocupacaoDasImpressoras", () => ({ quemOcupaAImpressora: async () => null, erroImpressoraOcupada: () => "ocupada" }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));
vi.mock("../services/consultaDeEstoqueNaLiberacao", () => ({
  respostaDoEstoqueParaLiberar: vi.fn(async () => null),
  marcarRespostaAplicada: vi.fn(async () => {}),
}));

const { registerItemRoutes } = await import("../routes/items");
const { registerMoldeRoutes } = await import("../routes/molde");
const M = await import("@shared/maquina-de-estados");
const { STATUS_CONHECIDOS } = await import("@shared/fluxo-peca");
const { ITEM_STATUSES } = await import("@shared/schema");
type AcaoDaPeca = import("@shared/maquina-de-estados").AcaoDaPeca;

// ── App de mentira (a última rota registrada no caminho vence, como no Map) ──
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => {
    const chave = `${verbo.toUpperCase()} ${caminho}`;
    if (!rotas.has(chave)) rotas.set(chave, hs); // o Express entrega à PRIMEIRA
    return app;
  };
}
registerItemRoutes(app);
registerMoldeRoutes(app);

async function chamar(chave: string, ctx: { params: any; body: any; userRole: string }) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { params: ctx.params, body: ctx.body, query: {}, headers: {}, userRole: ctx.userRole, userId: "u1", userName: "Maria", session: {} };
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
const peca = (over: Record<string, unknown> = {}) => ({
  id: "p1", displayId: "#0500", eventId: "ev-1", type: "Pórtico", description: "Pórtico de largada",
  quantity: 10, quantityProduced: 0, reuseQty: 0, isReuse: false, conferredQty: 0, embaladaQty: 0,
  deliveredQty: 0, status: "draft", skipApproval: false, deletedAt: null, parentItemId: null,
  kitRemessaId: null, pedidoDePecaLinhaId: null, observations: "", motivoCancelamento: null,
  statusBeforeCancel: null, approvalThumbUrl: "/objects/uploads/thumb.png", finalFileUrl: "/objects/uploads/final.pdf",
  finalFileName: "final.pdf", sponsorApprovedBy: null, sponsorApprovedAt: null, creatorReviewedAt: null,
  rejectedBySponsor: false, rejectedByCreator: false, rejectionReason: null, hasModifiedData: false,
  printMachine: null, impressaoPorMaquina: null, reservaPorMaquina: null, maquinaPrevista: null,
  travadaEm: null, travadaPor: null, travadaMotivo: null, conferencePhotoUrl: null, conferredAt: null,
  productionStartedAt: null, producedAt: null, fileWidth: "2.00", fileHeight: "1.00", area: "2", visual: "1",
  calculatedM2: "20.00", material: "Lona", finish: "Ilhós", measurement: "2.00 × 1.00", createdAt: new Date("2026-09-01"),
  ...over,
});

let patrocinadores: string[] = [];
let aprovacoes: any[] = [];
let criados: any[] = [];

beforeEach(() => {
  H.mundo.itens = {};
  patrocinadores = [];
  aprovacoes = [];
  criados = [];
  const eventos: Record<string, any> = {
    "ev-1": { id: "ev-1", name: "COPA NORTE", status: "created", startDate: "2099-01-10", truckDepartureDate: new Date("2099-01-01T00:00:00Z") },
  };
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  Object.assign(s, {
    getItem: vi.fn(async (id: string) => (H.mundo.itens[id] ? { ...H.mundo.itens[id] } : undefined)),
    getItemsByIds: vi.fn(async (ids: string[]) => ids.map((id) => H.mundo.itens[id]).filter(Boolean)),
    updateItem: vi.fn(async (id: string, dados: any) => (H.mundo.itens[id] ? (H.mundo.itens[id] = { ...H.mundo.itens[id], ...dados }) : undefined)),
    getEvent: vi.fn(async (id: string) => eventos[id]),
    getItemsByEvent: vi.fn(async () => Object.values(H.mundo.itens)),
    getLiveComplements: vi.fn(async () => []),
    getAuditLogs: vi.fn(async () => []),
    createNotification: vi.fn(async (n: any) => ({ id: "n1", ...n })),
    getItemSponsors: vi.fn(async () => patrocinadores.map((sponsorId) => ({ itemId: "p1", sponsorId }))),
    getSponsor: vi.fn(async (id: string) => ({ id, name: id, strictApproval: false })),
    getAllSponsors: vi.fn(async () => patrocinadores.map((id) => ({ id, name: id }))),
    getItemSponsorApprovals: vi.fn(async () => aprovacoes),
    getItemSponsorApproval: vi.fn(async (_i: string, sponsorId: string) => aprovacoes.find((a) => a.sponsorId === sponsorId)),
    updateItemSponsorApproval: vi.fn(async (id: string, dados: any) => {
      const a = aprovacoes.find((x) => x.id === id);
      return a ? Object.assign(a, dados) : undefined;
    }),
    createItemSponsorApproval: vi.fn(async (dados: any) => { const a = { id: `ap-${aprovacoes.length + 1}`, ...dados }; aprovacoes.push(a); return a; }),
    initializeItemSponsorApprovals: vi.fn(async () => []),
    createItemArtVersion: vi.fn(async () => ({})),
    getAssetsByOriginalItemId: vi.fn(async () => []),
    createInventoryAssets: vi.fn(async (rs: any[]) => rs.map((r, i) => ({ id: `at-${i}`, ...r }))),
    findRecentComplement: vi.fn(async () => undefined),
    createComplementItemTx: vi.fn(async (_tx: any, mae: any, campos: any) => {
      const filho = { ...mae, id: "c1", displayId: `${mae.displayId}-C1`, parentItemId: mae.id, quantityProduced: 0, ...campos };
      criados.push(filho);
      return filho;
    }),
    bulkSyncItemSponsors: vi.fn(async () => {}),
    copyItemSponsorApprovals: vi.fn(async () => {}),
  });
  H.db.transaction = vi.fn(async (fn: any) => fn(txDeMentira(H.mundo)));
  H.db.execute = vi.fn(async () => ({ rows: [] }));
  H.db.insert = vi.fn(() => ({ values: async () => [] }));
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// ── Os cenários ──────────────────────────────────────────────────────────────
type Cenario = {
  acao: AcaoDaPeca;
  papel: string;
  rota: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  /** Campos da peça além do status. */
  peca?: Record<string, unknown>;
  /** Monta patrocinadores/aprovações do mundo. */
  preparar?: () => void;
  /** Outras ações da MESMA rota que também partem de alguns status: lá este cenário não afirma nada. */
  tambem?: AcaoDaPeca[];
  /** A ação só às vezes muda o status: fora da origem basta a peça não mudar. */
  foraDaOrigem?: "recusa" | "nao-muda";
  /** O status final quando a tabela diz "anterior" (descancelar). */
  anterior?: string;
  /** Para onde olhar o resultado (o complemento nasce numa peça nova). */
  destinoEm?: "peca" | "filho";
};

const MOTIVO = "O motivo tem mais de dez caracteres";
const FOTO = "/objects/uploads/foto.jpg";
const umPatrocinador = () => { patrocinadores = ["sp1"]; };

const CENARIOS: Cenario[] = [
  { acao: "enviar-para-aprovacao", papel: "arte", rota: "PATCH /api/items/:id/submit-for-approval", body: { approvalThumbUrl: "/objects/uploads/novo.png" }, preparar: umPatrocinador },
  { acao: "enviar-direto-para-finalizacao", papel: "arte", rota: "PATCH /api/items/:id/submit-for-approval", body: { approvalThumbUrl: "/objects/uploads/novo.png" } },
  { acao: "enviar-molde-para-revisao", papel: "arte", rota: "PATCH /api/items/:id/submit-for-approval", body: { approvalThumbUrl: "/objects/uploads/novo.png" }, peca: { type: "Molde" } },
  { acao: "aprovar-peca-inteira", papel: "atendimento", rota: "PATCH /api/items/:id/sponsor-approve", preparar: umPatrocinador },
  { acao: "aprovar-o-ultimo-patrocinador", papel: "atendimento", rota: "POST /api/items/:id/sponsor-approvals/:sponsorId/approve", params: { sponsorId: "sp1" }, preparar: umPatrocinador },
  { acao: "aprovar-um-patrocinador", papel: "atendimento", rota: "POST /api/items/:id/sponsor-approvals/:sponsorId/approve", params: { sponsorId: "sp1" }, preparar: () => { patrocinadores = ["sp1", "sp2"]; } },
  { acao: "reprovar-por-patrocinador", papel: "atendimento", rota: "POST /api/items/:id/sponsor-approvals/:sponsorId/reject", params: { sponsorId: "sp1" }, body: { rejectionReason: MOTIVO }, preparar: umPatrocinador },
  { acao: "reenviar-nova-versao", papel: "arte", rota: "POST /api/items/:id/sponsor-approvals/resubmit", body: { newThumbUrl: "/objects/uploads/v2.png" },
    preparar: () => { patrocinadores = ["sp1"]; aprovacoes = [{ id: "ap-1", itemId: "p1", sponsorId: "sp1", status: "awaiting_arte" }]; } },
  ...(["admin", "atendimento"] as const).map((papel): Cenario => ({
    acao: "revogar-aprovacao", papel, rota: "POST /api/items/:id/sponsor-approvals/:sponsorId/revert", params: { sponsorId: "sp1" },
    preparar: () => { patrocinadores = ["sp1"]; aprovacoes = [{ id: "ap-1", itemId: "p1", sponsorId: "sp1", status: "approved" }]; },
  })),
  { acao: "dispensar-aprovacao", papel: "arte", rota: "PATCH /api/items/:id/dispense", body: { reason: MOTIVO } },
  { acao: "enviar-arquivo-final", papel: "arte", rota: "PATCH /api/items/:id/submit-final-file", body: { finalFileUrl: "/objects/uploads/final-2.pdf" } },
  { acao: "trocar-arquivo-final-liberado", papel: "arte", rota: "PATCH /api/items/:id/update-final-file", body: { finalFileUrl: "/objects/uploads/final-2.pdf" }, foraDaOrigem: "nao-muda" },
  { acao: "trocar-thumb-aprovado", papel: "arte", rota: "PATCH /api/items/:id/update-thumb", body: { approvalThumbUrl: "/objects/uploads/v3.png", motivo: MOTIVO }, foraDaOrigem: "nao-muda",
    preparar: () => {
      patrocinadores = ["sp1"];
      aprovacoes = [{ id: "ap-1", itemId: "p1", sponsorId: "sp1", status: "approved" }];
      H.storage.getSponsor = vi.fn(async (id: string) => ({ id, name: id, strictApproval: true }));
    } },
  { acao: "liberar-para-producao", papel: "solicitacao", rota: "PATCH /api/items/:id/creator-review", tambem: ["liberar-o-que-ja-foi-liberado"] },
  { acao: "liberar-com-reaproveitamento-total", papel: "solicitacao", rota: "PATCH /api/items/:id/creator-review", body: { reuseQty: 10 }, tambem: ["liberar-o-que-ja-foi-liberado"] },
  { acao: "liberar-o-que-ja-foi-liberado", papel: "solicitacao", rota: "PATCH /api/items/:id/creator-review", tambem: ["liberar-para-producao"] },
  { acao: "devolver-para-a-arte", papel: "solicitacao", rota: "PATCH /api/items/:id/return-to-arte", body: { notes: MOTIVO, destino: "arte" } },
  { acao: "devolver-para-a-finalizacao", papel: "solicitacao", rota: "PATCH /api/items/:id/return-to-arte", body: { notes: MOTIVO, destino: "finalizacao" } },
  { acao: "devolver-para-a-aprovacao", papel: "solicitacao", rota: "PATCH /api/items/:id/return-to-arte", body: { notes: MOTIVO, destino: "finalizacao" },
    preparar: () => { patrocinadores = ["sp1"]; aprovacoes = [{ id: "ap-1", itemId: "p1", sponsorId: "sp1", status: "pending" }]; } },
  { acao: "devolver-ao-solicitante", papel: "arte", rota: "PATCH /api/items/:id/arte-reject", body: { notes: MOTIVO } },
  { acao: "devolver-para-a-revisao", papel: "grafica", rota: "PATCH /api/items/:id/return-to-review", body: { notes: MOTIVO } },
  { acao: "cancelar", papel: "solicitacao", rota: "PATCH /api/items/:id/cancel", body: { notes: "motivo" } },
  { acao: "descancelar", papel: "admin", rota: "PATCH /api/items/:id/uncancel", peca: { statusBeforeCancel: "awaiting_final_review" }, anterior: "awaiting_final_review" },
  { acao: "iniciar-impressao", papel: "grafica", rota: "PATCH /api/items/:id/start-printing", body: { printMachine: "1" } },
  { acao: "concluir-impressao", papel: "grafica", rota: "PATCH /api/items/:id/start-production", body: { quantityProduced: 10 }, peca: { printMachine: "1" } },
  { acao: "informar-impressas-parcial", papel: "grafica", rota: "PATCH /api/items/:id/start-production", body: { quantityProduced: 3 }, peca: { printMachine: "1" } },
  { acao: "esvaziar-impressoras", papel: "grafica", rota: "PATCH /api/items/:id/start-production", body: { maquina: "1", impressasNaMaquina: 4 },
    peca: { quantity: 12, quantityProduced: 6, printMachine: "1", impressaoPorMaquina: { "1": { atrib: 4, impressas: 0 }, "2": { atrib: 6, impressas: 6 } } } },
  { acao: "reaproveitar-o-que-falta", papel: "grafica", rota: "POST /api/items/:id/mark-reuse" },
  { acao: "reaproveitar-parte", papel: "grafica", rota: "POST /api/items/:id/mark-reuse", body: { qty: 2 } },
  { acao: "ajustar-reaproveitamento-da-produzida", papel: "solicitacao", rota: "POST /api/items/:id/mark-reuse", body: { reuseTotal: 3, qty: 2 },
    peca: { quantityProduced: 10 }, tambem: ["reaproveitar-parte", "reaproveitar-o-que-falta"] },
  ...(["grafica", "admin"] as const).map((papel): Cenario => ({
    acao: "corrigir-reaproveitamento-para-a-fila", papel, rota: "POST /api/items/:id/correct-reuse", body: { correctedReuseQty: 1 },
    peca: { reuseQty: 3, quantityProduced: 7 },
  })),
  { acao: "corrigir-para-reaproveitamento-total", papel: "admin", rota: "POST /api/items/:id/correct-reuse", body: { correctedReuseQty: 10 }, peca: { reuseQty: 3, quantityProduced: 7 } },
  { acao: "conferir-tudo", papel: "grafica", rota: "POST /api/items/:id/confer", body: { conferencePhotoUrl: FOTO }, peca: { quantityProduced: 10 } },
  { acao: "conferir-tudo-ja-embalado", papel: "grafica", rota: "POST /api/items/:id/confer", body: { conferencePhotoUrl: FOTO }, peca: { quantityProduced: 10, embaladaQty: 10 } },
  { acao: "conferir-parte", papel: "grafica", rota: "POST /api/items/:id/confer", body: { conferencePhotoUrl: FOTO, qty: 3 }, peca: { quantityProduced: 10 } },
  { acao: "marcar-molde-produzido", papel: "grafica", rota: "PATCH /api/items/:id/molde-produzido", peca: { type: "Molde" }, tambem: ["marcar-molde-ja-produzido"] },
  { acao: "marcar-molde-ja-produzido", papel: "grafica", rota: "PATCH /api/items/:id/molde-produzido", peca: { type: "Molde", quantityProduced: 10 }, tambem: ["marcar-molde-produzido"] },
  { acao: "desfazer-molde-produzido", papel: "grafica", rota: "PATCH /api/items/:id/molde-voltar-liberado", peca: { type: "Molde", quantityProduced: 10 }, tambem: ["desfazer-molde-ja-liberado"] },
  { acao: "desfazer-molde-ja-liberado", papel: "grafica", rota: "PATCH /api/items/:id/molde-voltar-liberado", peca: { type: "Molde", quantityProduced: 10 }, tambem: ["desfazer-molde-produzido"] },
  { acao: "criar-complemento", papel: "solicitacao", rota: "POST /api/items/:id/complement", body: { quantity: 2, reason: MOTIVO }, destinoEm: "filho" },
];

/** As ações cujas rotas vivem fora de routes/itens e molde — e quem as cobre. */
const FORA_DESTE_TESTE: Partial<Record<AcaoDaPeca, string>> = {
  "enviar-lista-para-vinculacao": "events.ts — event-encerramento-pecas.test.ts / molde.test.ts",
  "enviar-molde-da-lista": "events.ts — molde.test.ts",
  "vincular-patrocinadores": "sponsors.ts — patrocinadores e vinculação",
  "enviar-para-a-arte": "sponsors.ts — vincular-falha-fica-na-linha / patrocinadores",
  "voltar-para-a-criacao": "sponsors.ts — patrocinadores",
  "reabrir-ao-acrescentar-patrocinador": "sponsors.ts — acrescentar-patrocinador.test.ts",
  "cancelar-ao-tirar-o-ultimo-patrocinador": "sponsors.ts — patrocinadores",
  "fechar-rodada-ao-tirar-patrocinador-pendente": "sponsors.ts — patrocinadores",
  "embalar": "tubos.ts — tubos.test.ts / embalagem-com-quantidade.test.ts",
  "tirar-do-tubo": "tubos.ts — tubos.test.ts",
  "entregar-volume": "tubos.ts — tubos.test.ts",
};

const UNIVERSO = Array.from(new Set<string>([...STATUS_CONHECIDOS, ...ITEM_STATUSES, "status_inexistente"]));

describe("a tabela cobre as rotas: toda ação está num cenário ou na lista de fora", () => {
  it("nenhuma ação sem dono", () => {
    const cobertas = new Set<string>([...CENARIOS.map((c) => c.acao), ...Object.keys(FORA_DESTE_TESTE)]);
    const semDono = Array.from(new Set(M.TRANSICOES.map((t) => t.acao))).filter((a) => !cobertas.has(a));
    expect(semDono).toEqual([]);
  });

  it("toda rota citada pelos cenários está na tabela da ação", () => {
    for (const c of CENARIOS) {
      const rotasDaAcao = M.TRANSICOES.filter((t) => t.acao === c.acao).flatMap((t) => t.rotas);
      expect(rotasDaAcao, c.acao).toContain(c.rota);
    }
  });
});

for (const c of CENARIOS) {
  describe(`${c.acao} (${c.papel}) — ${c.rota}`, () => {
    for (const status of UNIVERSO) {
      const outra = (c.tambem ?? []).some((a) => M.podeTransicionar(status, a, c.papel));
      if (outra && !M.podeTransicionar(status, c.acao, c.papel)) continue;
      const aceita = M.podeTransicionar(status, c.acao, c.papel);
      it(`${status} → ${aceita ? "aceita" : "recusa"}`, async () => {
        c.preparar?.();
        H.mundo.itens.p1 = peca({ ...(c.peca ?? {}), status });
        const r = await chamar(c.rota, { params: { id: "p1", ...(c.params ?? {}) }, body: { ...(c.body ?? {}) }, userRole: c.papel });
        const final = H.mundo.itens.p1.status;
        if (aceita) {
          expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
          const esperado = M.proximoStatus(status, c.acao);
          const destino = esperado === M.VOLTA_PARA_ONDE_ESTAVA ? c.anterior : esperado;
          if (c.destinoEm === "filho") {
            expect(final).toBe(status); // a mãe não muda
            expect(criados.at(-1)?.status).toBe("ready_for_production");
          } else {
            expect(final).toBe(destino);
          }
        } else if (c.foraDaOrigem === "nao-muda") {
          expect(final).toBe(status);
        } else {
          expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400);
          expect(final).toBe(status);
          expect(criados).toEqual([]);
        }
      });
    }
  });
}
