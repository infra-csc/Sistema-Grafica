// ─────────────────────────────────────────────────────────────────────────────
// AUTORIA NAS ROTAS QUE MAIS APARECEM NO HISTÓRICO — teste executável.
//
// auditoria-autoria.test.ts garante a FORMA lendo o código-fonte. Este garante
// o RESULTADO rodando os handlers: as quatro rotas que escrevem em audit_logs
// direto pela transação (aprovar, liberar, produzir, entregar) são justamente
// as que enchem a coluna "Realizado por" da tela, e eram as quatro que gravavam
// só o nome — `user_id` nascia nulo.
//
// Nada aqui toca banco: `../db` é substituído por uma transação de mentira que
// guarda o que seria inserido.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any },
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
  updateEventStatus: (async () => {}) as any,
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
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
    updateEventStatus: (...a: any[]) => H.updateEventStatus(...a),
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

import { registerItemRoutes } from "../routes/items";
import { auditLogs } from "@shared/schema";

/* ── Harness: um "Express" que só guarda handlers ── */
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => {
    rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs);
    return appFalso;
  };
}
registerItemRoutes(appFalso);

const AUTOR = { userName: "Ana Souza", userId: "u-ana" };

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: ctx.params ?? {},
    body: ctx.body ?? {},
    query: {},
    headers: {},
    userRole: ctx.userRole,
    userName: AUTOR.userName,
    userId: AUTOR.userId,
    session: { userId: AUTOR.userId, userRole: ctx.userRole, userName: AUTOR.userName },
  };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;
  res.set = () => res;
  res.setHeader = res.set;
  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

let inserts: Array<{ table: any; vals: any }>;
let itemEmFoco: any;

function peca(over: Partial<any> = {}) {
  return {
    id: "i-1",
    displayId: "#3089",
    eventId: "ev-1",
    type: "Imantadas",
    description: null,
    quantity: 4,
    quantityProduced: 0,
    reuseQty: 0,
    isReuse: false,
    conferredQty: 4,
    deliveredQty: 0,
    status: "ready_for_production",
    finalFileUrl: "/objects/arte.pdf",
    approvalThumbUrl: null,
    parentItemId: null,
    productionStartedAt: null,
    producedAt: null,
    approvedAt: null,
    creatorReviewedAt: null,
    deletedAt: null,
    ...over,
  };
}

beforeEach(() => {
  inserts = [];
  itemEmFoco = peca();

  const tx = {
    insert: (table: any) => ({
      values: (vals: any) => {
        inserts.push({ table, vals });
        const linha = { id: `linha-${inserts.length}`, ...vals };
        const p: any = Promise.resolve([linha]);
        p.returning = async () => [linha];
        return p;
      },
    }),
    update: (_table: any) => ({
      set: (vals: any) => ({
        where: () => {
          const linha = { ...itemEmFoco, ...vals };
          const p: any = Promise.resolve([linha]);
          p.returning = async () => [linha];
          return p;
        },
      }),
    }),
  };

  H.db.transaction = vi.fn(async (cb: any) => await cb(tx));
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async () => {});
  H.updateEventStatus = vi.fn(async () => {});

  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getItem = vi.fn(async () => itemEmFoco);
  s.getEvent = vi.fn(async () => ({ id: "ev-1", name: "Primavera Manaus", franchise: "Norte" }));
  s.getItemSponsors = vi.fn(async () => []);
  s.getAssetsByOriginalItemId = vi.fn(async () => []);
  s.createInventoryAssets = vi.fn(async () => []);
  s.createNotification = vi.fn(async (n: any) => ({ id: "n-1", ...n }));
});

/** A linha de audit_logs que a rota inseriu dentro da transação. */
function linhaDeAuditoria() {
  const achada = inserts.find(i => i.table === auditLogs);
  expect(achada, "a rota não inseriu nenhuma linha em audit_logs").toBeDefined();
  return achada!.vals;
}

describe("as quatro rotas que enchem a coluna 'Realizado por'", () => {
  const casos: Array<{ nome: string; chave: string; ctx: any; antes?: () => void; acao: string }> = [
    {
      nome: "liberar para produção (Solicitação)",
      chave: "PATCH /api/items/:id/approve",
      ctx: { params: { id: "i-1" }, userRole: "solicitacao" },
      acao: "approved",
    },
    {
      nome: "revisão do criador (liberação)",
      chave: "PATCH /api/items/:id/creator-review",
      ctx: { params: { id: "i-1" }, userRole: "solicitacao" },
      antes: () => { itemEmFoco = peca({ status: "awaiting_final_review" }); },
      acao: "approved",
    },
    {
      nome: "lançamento de produção (Gráfica)",
      chave: "PATCH /api/items/:id/start-production",
      ctx: { params: { id: "i-1" }, body: { quantityProduced: 4 }, userRole: "grafica" },
      antes: () => { itemEmFoco = peca({ status: "inProduction" }); },
      acao: "produced",
    },
    {
      nome: "entrega",
      chave: "PATCH /api/items/:id/deliver",
      ctx: { params: { id: "i-1" }, body: { receivedBy: "Portaria", photoUrl: "/objects/uploads/comprovante.jpg" }, userRole: "grafica" },
      antes: () => { itemEmFoco = peca({ status: "conferred", conferredQty: 4 }); },
      acao: "delivered",
    },
  ];

  for (const caso of casos) {
    it(`${caso.nome} — grava nome E id de quem fez`, async () => {
      caso.antes?.();
      const r = await chamar(caso.chave, caso.ctx);
      expect(r.status, JSON.stringify(r.body)).toBe(200);

      const linha = linhaDeAuditoria();
      expect(linha.userName).toBe(AUTOR.userName);
      // O id é o ponto do conserto: a coluna existia no schema e era gravada
      // nula em 100% das linhas, então a trilha de meses atrás virava um nome
      // que pode ter mudado, repetido, ou apontar para ninguém.
      expect(linha.userId).toBe(AUTOR.userId);
      expect(linha.action).toBe(caso.acao);
      expect(linha.entityType).toBe("item");
      expect(linha.entityId).toBe("i-1");
    });

    it(`${caso.nome} — sessão sem nome grava "Sistema", nunca vazio`, async () => {
      caso.antes?.();
      const handlers = rotas.get(caso.chave)!;
      const req: any = {
        params: caso.ctx.params ?? {},
        body: caso.ctx.body ?? {},
        query: {},
        headers: {},
        userRole: caso.ctx.userRole,
        userName: undefined,
        userId: undefined,
        session: {},
      };
      const res: any = { _status: 200, _done: false };
      res.status = (c: number) => { res._status = c; return res; };
      res.json = () => { res._done = true; return res; };
      res.send = res.json;
      for (const h of handlers) {
        let chamouNext = false;
        await h(req, res, () => { chamouNext = true; });
        if (res._done || !chamouNext) break;
      }
      const linha = linhaDeAuditoria();
      expect(linha.userName).toBe("Sistema");
      expect(linha.userId).toBeNull();
    });
  }
});
