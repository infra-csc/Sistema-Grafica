// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA TRAVADA PELA SOLICITAÇÃO (dono, 21/09) — a regra, as rotas reais e as
// guardas do que faz a peça andar.
//
// Rotas: os handlers de verdade (registerTravaRoutes, registerItemRoutes,
// registerMaquinasRoutes) num "app" que só guarda handlers; a borda (storage,
// db, broadcast, audit) é de mentira. Tubos e a troca por prioridade, que
// rodam em transação, são conferidos na fonte.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fonteDoComponente } from "./fonte-dos-componentes";
import { txDeMentira } from "./tx-de-mentira";
import { readFileSync } from "fs";
import { resolve } from "path";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  db: { transaction: (async () => {}) as any, execute: (async () => ({ rows: [] })) as any },
  broadcast: [] as any[],
  auditoria: [] as string[],
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
    broadcast: (m: any) => { H.broadcast.push(m); },
    createAuditLog: async (_a: any, _acao: string, _t: string, _id: string, detalhe: string) => { H.auditoria.push(detalhe); },
    createAuditLogsEmLote: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn(), responderRelatorioMaquinasXlsx: vi.fn() }));

import { registerTravaRoutes } from "../routes/trava";
import { registerItemRoutes } from "../routes/items";
import { registerMaquinasRoutes } from "../routes/maquinas";
import {
  pecaTravada, lerMotivo, motivoDeNaoTravar, fraseDaTrava, seloDaTrava, podeTravar, SUGESTOES_DE_MOTIVO,
} from "@shared/trava-da-peca";
import { podePapel } from "@shared/permissoes";
import { compactarPecas, expandirPecas } from "@shared/itens-compactos";
import { publicInsertItemSchema } from "@shared/schema";

const ler = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerTravaRoutes(appFalso);
registerItemRoutes(appFalso);
registerMaquinasRoutes(appFalso);

async function chamar(chave: string, ctx: { id?: string; body?: any; papel?: string; kit?: boolean; nome?: string } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = {
    params: { id: ctx.id ?? "p1" }, body: ctx.body ?? {}, query: {}, headers: {},
    userRole: ctx.papel, userKit: ctx.kit === true, userId: "u-" + (ctx.nome ?? "ana"), userName: ctx.nome ?? "Ana Solicitação",
  };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json; res.set = () => res; res.setHeader = () => res;
  for (const h of hs) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

let pecas: Record<string, any>;
const TRAVA = { travadaEm: new Date("2026-09-21T12:00:00Z"), travadaPor: "Ana Solicitação", travadaPorId: "u-ana", travadaMotivo: "Arte vai mudar" };
beforeEach(() => {
  H.broadcast.length = 0;
  H.auditoria.length = 0;
  pecas = {
    p1: { id: "p1", displayId: "#0101", status: "ready_for_production", quantity: 10, quantityProduced: 0, reuseQty: 0, eventId: null, kitRemessaId: null, criadoPorId: null },
    kit: { id: "kit", displayId: "#0900", status: "ready_for_production", quantity: 5, quantityProduced: 0, eventId: null, kitRemessaId: "rem1", criadoPorId: "u-kit" },
    entregue: { id: "entregue", displayId: "#0102", status: "delivered", quantity: 5, eventId: null, kitRemessaId: null },
    trav: { id: "trav", displayId: "#0103", status: "inProduction", quantity: 10, quantityProduced: 3, reuseQty: 0, printMachine: "2", eventId: null, kitRemessaId: null, conferencePhotoUrl: "/objects/x.png", ...TRAVA },
  };
  H.storage.getItem = async (id: string) => pecas[id] ? { ...pecas[id] } : undefined;
  // Conferir (22/09) lê a peça TRAVADA dentro de uma transação.
  H.db.transaction = async (cb: any) => cb(txDeMentira({ itens: pecas }));
  H.storage.getEvent = async () => undefined;
  H.storage.updateItem = async (id: string, dados: any) => { pecas[id] = { ...pecas[id], ...dados, updatedAt: new Date() }; return { ...pecas[id] }; };
});

// ─── A regra pura ─────────────────────────────────────────────────────────────
describe("a regra (shared/trava-da-peca.ts)", () => {
  it("motivo obrigatório, mínimo 5 letras; sugestões do dono", () => {
    expect(lerMotivo("").ok).toBe(false);
    expect(lerMotivo("  abc ").ok).toBe(false);
    expect(lerMotivo("  Arte   vai mudar ")).toEqual({ ok: true, motivo: "Arte vai mudar" });
    expect(SUGESTOES_DE_MOTIVO).toEqual(["Arte vai mudar", "Aguardando patrocinador", "Quantidade vai mudar", "Evento em revisão"]);
  });
  it("quem trava; o que é travada; o que não se trava; as frases", () => {
    expect(["solicitacao", "admin", "grafica", "arte"].map(podeTravar)).toEqual([true, true, false, false]);
    expect(pecaTravada({})).toBe(false);
    expect(pecaTravada(TRAVA)).toBe(true);
    expect(motivoDeNaoTravar({ status: "delivered" })).toMatch(/entregue/);
    expect(motivoDeNaoTravar({ status: "packed" })).toBeNull();
    expect(motivoDeNaoTravar({ status: "produced", ...TRAVA })).toBe("A peça já está travada");
    expect(fraseDaTrava(TRAVA)).toBe("Peça travada pela Solicitação: Arte vai mudar — fale com Ana Solicitação");
    expect(seloDaTrava(TRAVA, new Date("2026-09-21T14:05:00Z").getTime())).toBe("Travada: Arte vai mudar · por Ana Solicitação, há 2h");
  });
  it("o dado: fora da API pública e de ida e volta no formato compacto", () => {
    const campos = Object.keys((publicInsertItemSchema as any).shape ?? {});
    for (const c of ["travadaEm", "travadaPor", "travadaPorId", "travadaMotivo"]) expect(campos).not.toContain(c);
    const peca = { id: "a", displayId: "#1", status: "inProduction", travadaEm: "2026-09-21T12:00:00.000Z", travadaPor: "Ana", travadaPorId: "u1", travadaMotivo: "Arte vai mudar", event: null, sponsors: [] };
    expect(JSON.stringify(expandirPecas(compactarPecas([peca]) as any))).toBe(JSON.stringify([peca]));
    const sql = ler("scripts/migracao-aditiva-producao.sql");
    for (const c of ["travada_em timestamp", "travada_por text", "travada_por_id varchar", "travada_motivo text"]) expect(sql).toContain(`ALTER TABLE items ADD COLUMN IF NOT EXISTS ${c};`);
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("'travada_em','travada_por','travada_por_id','travada_motivo'");
  });
  it("permissões declaradas: solicitacao e admin; a Gráfica não", () => {
    for (const rota of ["/api/items/:id/travar", "/api/items/:id/destravar"]) {
      expect(podePapel("POST", rota, "solicitacao")).toBe(true);
      expect(podePapel("POST", rota, "admin")).toBe(true);
      expect(podePapel("POST", rota, "grafica")).toBe(false);
    }
  });
});

// ─── As rotas de travar e destravar ───────────────────────────────────────────
describe("POST /api/items/:id/travar e /destravar", () => {
  it("papéis: a Gráfica e a Arte não travam; Solicitação e admin sim", async () => {
    for (const papel of ["grafica", "arte", "atendimento"]) {
      expect((await chamar("POST /api/items/:id/travar", { papel, body: { motivo: "Arte vai mudar" } })).status, papel).toBe(403);
    }
    const r = await chamar("POST /api/items/:id/travar", { papel: "solicitacao", body: { motivo: "Arte vai mudar" } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ travadaMotivo: "Arte vai mudar", travadaPor: "Ana Solicitação", travadaPorId: "u-ana", status: "ready_for_production" });
    expect(r.body.travadaEm).toBeInstanceOf(Date);
    expect(r.body.updatedAt).toBeInstanceOf(Date);
    expect(H.auditoria).toEqual(["Travada pela Solicitação: Arte vai mudar (Ana Solicitação)"]);
    expect(H.broadcast.map((m) => m.type)).toEqual(["item_updated"]);
  });
  it("motivo obrigatório (400), já travada e entregue (409), Kit só visualiza (403)", async () => {
    expect((await chamar("POST /api/items/:id/travar", { papel: "solicitacao", body: {} })).status).toBe(400);
    expect((await chamar("POST /api/items/:id/travar", { papel: "solicitacao", body: { motivo: "ok" } })).status).toBe(400);
    expect((await chamar("POST /api/items/:id/travar", { id: "trav", papel: "admin", body: { motivo: "de novo não" } })).status).toBe(409);
    expect((await chamar("POST /api/items/:id/travar", { id: "entregue", papel: "admin", body: { motivo: "tarde demais" } })).status).toBe(409);
    expect((await chamar("POST /api/items/:id/travar", { id: "kit", papel: "solicitacao", body: { motivo: "Arte vai mudar" } })).status).toBe(403);
    expect((await chamar("POST /api/items/:id/travar", { id: "kit", papel: "admin", body: { motivo: "Arte vai mudar" } })).status).toBe(200);
    expect((await chamar("POST /api/items/:id/travar", { id: "nada", papel: "admin", body: { motivo: "Arte vai mudar" } })).status).toBe(404);
  });
  it("destravar: a Gráfica não destrava; a Solicitação sim, com trilha e WebSocket", async () => {
    expect((await chamar("POST /api/items/:id/destravar", { id: "trav", papel: "grafica" })).status).toBe(403);
    expect((await chamar("POST /api/items/:id/destravar", { id: "p1", papel: "solicitacao" })).status).toBe(409);
    const r = await chamar("POST /api/items/:id/destravar", { id: "trav", papel: "solicitacao", nome: "Bia" });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ travadaEm: null, travadaPor: null, travadaPorId: null, travadaMotivo: null, status: "inProduction" });
    expect(H.auditoria).toEqual(["Destravada (Bia)"]);
    expect(H.broadcast.map((m) => m.type)).toEqual(["item_updated"]);
  });
});

// ─── O que a trava bloqueia (409 com a frase humana) ──────────────────────────
describe("a peça travada não ANDA — 409 'Peça travada pela Solicitação: … — fale com …'", () => {
  const FRASE = "Peça travada pela Solicitação: Arte vai mudar — fale com Ana Solicitação";
  it("iniciar impressão / trocar de máquina (start-printing)", async () => {
    const r = await chamar("PATCH /api/items/:id/start-printing", { id: "trav", papel: "grafica", body: { printMachine: "3" } });
    expect(r).toEqual({ status: 409, body: { error: FRASE, code: "PECA_TRAVADA" } });
  });
  it("informar impressas / mandar para acabamento (start-production)", async () => {
    const r = await chamar("PATCH /api/items/:id/start-production", { id: "trav", papel: "grafica", body: { quantityProduced: 10, expectedProduced: 3, printMachine: "2" } });
    expect(r).toEqual({ status: 409, body: { error: FRASE, code: "PECA_TRAVADA" } });
  });
  it("conferir", async () => {
    pecas.trav.status = "produced";
    const r = await chamar("POST /api/items/:id/confer", { id: "trav", papel: "grafica", body: { conferencePhotoUrl: "/objects/c.png", qty: 1 } });
    expect(r).toEqual({ status: 409, body: { error: FRASE, code: "PECA_TRAVADA" } });
  });
  it("reservar impressora (unitário) e imprimir agora (é o start-printing)", async () => {
    pecas.trav.status = "ready_for_production";
    const r = await chamar("PATCH /api/items/:id/maquina-prevista", { id: "trav", papel: "grafica", body: { maquina: "1" } });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(FRASE);
  });
  it("a peça livre segue normal (a guarda não pega peça sem trava)", async () => {
    const r = await chamar("PATCH /api/items/:id/maquina-prevista", { id: "p1", papel: "grafica", body: { maquina: "1" } });
    expect(r.status).toBe(200);
  });
  it("embalar, entregar o volume, lote de reserva e a peça que ENTRA na troca — conferidos na fonte; TIRAR da impressora não", () => {
    const TUBOS = ler("server/routes/tubos.ts");
    expect(TUBOS).toContain("if (pecaTravada(p)) { recusas.push(`${nome}: ${fraseDaTrava(p)}`); continue; }");
    expect(TUBOS).toContain("const travada = aEntregar.find(({ p }) => pecaTravada(p));");
    expect(TUBOS).toContain("travadaEm: itemsTable.travadaEm,");
    const MAQ = ler("server/routes/maquinas.ts");
    // motivoDeNaoReservar vale para o unitário E para o lote.
    expect(MAQ).toContain("if (pecaTravada(item)) return fraseDaTrava(item);");
    const tirar = MAQ.slice(MAQ.indexOf("const tirarEColocar"), MAQ.indexOf('app.post("/api/grafica/maquinas/:maquina/trocar"'));
    expect((tirar.match(/pecaTravada\(/g) ?? []).length).toBe(1);
    expect(tirar).toContain("if (pecaTravada(entra as any))");
    expect(tirar.indexOf("pecaTravada(")).toBeGreaterThan(tirar.indexOf("const pausa = pausarParte("));
  });
});

// ─── As telas: a regra é a MESMA função ───────────────────────────────────────
describe("as telas leem pecaTravada (fonte)", () => {
  it("Gráfica: botão só para quem pode, selo, ações desabilitadas, filtro na URL", () => {
    const G = ler("client/src/pages/grafica.tsx");
    expect(G).toContain("const podeMexerNaTrava = (item: any) => podeTravar(user?.role) && !soVisualizaKit(item);");
    expect((G.match(/\{\.\.\.bloqueioDaTrava\(item\)\}/g) ?? []).length).toBe(9); // os dois "Entregar" por peça saíram (quem entrega é o volume)
    expect(G).toContain('testId="button-travadas-filter"');
    expect(ler("client/src/lib/grafica-filtros.ts")).toContain('{ chave: "travadas",    url: "travadas",   rotulo: "Só travadas" },');
  });
  it("Máquinas: o mesmo selo e sem Iniciar/Imprimir agora/Reservar; ficha e Detalhe do evento mostram", () => {
    const M = ler("client/src/pages/grafica-maquinas.tsx");
    expect(M).toContain("if (pecaTravada(p)) {");
    // Só o próprio helper chama o selo de evento finalizado; todas as linhas passam pelo helper.
    expect(M.split("seloPecaEventoFinalizado(p.eventoInfo, hojeMs)").length - 1).toBe(1);
    expect(M.split("seloDaPecaNaMaquina(p, hojeMs)").length - 1).toBeGreaterThanOrEqual(4);
    expect(fonteDoComponente("client/src/components/item-details-dialog.tsx")).toContain('data-testid="selo-travada-ficha"');
    expect(ler("client/src/components/detalhe-producao.tsx")).toContain('data-testid="detalhe-travada"');
  });
});
