// ─────────────────────────────────────────────────────────────────────────────
// FORMATO COMPACTO DAS LISTAS DE PEÇAS + DELTA DA GRÁFICA (perf, 17/09).
//
// O que este arquivo prende:
//  1. decodificar(codificar(x)) SERIALIZA BYTE A BYTE IGUAL a x — mesmas
//     chaves, mesma ordem, mesmos valores, peças do Kit com o evento nas datas
//     da remessa, complementos e `parent` intactos. A régua é a string JSON
//     inteira, não um deepEqual frouxo.
//  2. As rotas reais (handlers de routes/items.ts com o storage em memória):
//     sem `?formato=` a resposta é a de sempre; com, decodifica igual.
//  3. O cliente de verdade (getQueryFn de lib/queryClient.ts, com fetch
//     ligado aos handlers): full compacto + deltas dão o MESMO array que um
//     full fetch antigo daria — em /api/items e em /api/items/approved.
//  4. O merge do delta preserva a identidade das peças que não mudaram.
//
// E imprime o ANTES vs DEPOIS com dados sintéticos no tamanho de produção
// (5.128 peças, 68 eventos, 159 patrocinadores, 60% entregues).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll } from "vitest";
import { fonteDasRotasDeItens } from "./fonte-das-rotas-de-itens";
import { readFileSync } from "fs";
import path from "path";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  remessas: new Map<string, any>(),
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    broadcast: () => {},
    createAuditLog: async () => {},
    updateEventStatus: async () => {},
  };
});
vi.mock("../services/kitRemessas", () => ({
  carregarRemessa: async (id: string) => H.remessas.get(id) ?? null,
  remessasPorIds: async (ids: string[]) =>
    new Map(ids.filter((id) => H.remessas.has(id)).map((id) => [id, H.remessas.get(id)])),
}));
// O tubo viaja na peça (21/09) por um select em lote — aqui, sem banco, o lote
// é vazio; o `comTubo` real segue valendo (devolve a mesma peça).
vi.mock("../services/tubosDaPeca", async () => {
  const real = await vi.importActual<any>("../services/tubosDaPeca");
  return { ...real, resumosDeTuboPorIds: async () => new Map() };
});
vi.mock("../services/inventoryLifecycle", () => ({ runInventoryCron: vi.fn() }));
vi.mock("../services/xlsxImport", () => ({ handlePreviewXlsx: vi.fn(), handleConfirmImport: vi.fn() }));
vi.mock("../services/xlsxExport", () => ({ handleExportItemsXlsx: vi.fn(), handleExportSelectedItemsXlsx: vi.fn() }));

import { getTableColumns } from "drizzle-orm";
import { replaceEqualDeep } from "@tanstack/react-query";
import { items as tItems, events as tEvents, sponsors as tSponsors, itemSponsorApprovals as tApprovals } from "@shared/schema";
import { eventoComDatasDoKit } from "@shared/kit";
import {
  compactarPecas, expandirPecas, expandirResposta, compactarAprovacoes, expandirAprovacoes,
} from "@shared/itens-compactos";
import { registerItemRoutes } from "../routes/items";
import { cabeNaJanelaDeEntregues } from "../storage";
import { aplicarDelta, getQueryFn, resetItensDelta } from "../../client/src/lib/queryClient";

// ─── harness das rotas ───────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerItemRoutes(appFalso);

async function chamar(chave: string, query: Record<string, string> = {}, userRole = "admin", extra: Record<string, any> = {}): Promise<any> {
  const req: any = { params: {}, body: {}, query, headers: {}, userRole, userId: "u-admin", userName: "Admin", ...extra };
  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.set = () => res; res.setHeader = res.set;
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  if (res._status !== 200) throw new Error(`${chave} → ${res._status}: ${JSON.stringify(res._body)}`);
  return res._body;
}

// ─── dados sintéticos no tamanho de produção ────────────────────────────────
let semente = 42;
const aleatorio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const escolher = <T,>(xs: T[]) => xs[Math.floor(aleatorio() * xs.length)];
const texto = (min: number, max: number) => {
  const n = min + Math.floor(aleatorio() * (max - min));
  let s = ""; while (s.length < n) s += escolher(["lona ", "banner ", "pórtico ", "arena ", "entrada ", "palco ", "backdrop "]);
  return s.slice(0, n).trim();
};
const uuid = (pref: string, n: number) => `${pref}${String(n).padStart(8, "0")}-4a1b-9c2d-${String(n * 7919).padStart(12, "0")}`.slice(0, 36);
const data = (dia: number, hora = 12) => new Date(Date.UTC(2026, 5, 1 + dia, hora, Math.floor(aleatorio() * 60)));

/** Linha "do banco" com TODAS as colunas da tabela, na ordem do Drizzle. */
function linha(tabela: any, over: Record<string, any>): Record<string, any> {
  const o: Record<string, any> = {};
  for (const [chave, col] of Object.entries<any>(getTableColumns(tabela))) {
    if (chave in over) { o[chave] = over[chave]; continue; }
    const nula = !col.notNull && aleatorio() < 0.55;
    if (nula) { o[chave] = null; continue; }
    switch (col.dataType) {
      case "boolean": o[chave] = aleatorio() < 0.2; break;
      case "number": o[chave] = Math.floor(aleatorio() * 40); break;
      case "date": o[chave] = data(Math.floor(aleatorio() * 90)); break;
      case "array": o[chave] = [`/objects/ref-${Math.floor(aleatorio() * 1e6)}.png`]; break;
      default:
        o[chave] = /url/i.test(chave)
          ? `/objects/uploads/${uuid("f", Math.floor(aleatorio() * 1e6))}/${texto(8, 20).replace(/ /g, "-")}.pdf`
          : col.columnType === "PgNumeric" ? (aleatorio() * 10).toFixed(2) : texto(6, 40);
    }
  }
  return o;
}

const N_PECAS = 5128, N_EVENTOS = 68, N_PATROCINADORES = 159;
const STATUS = ["draft", "requested", "awaiting_linking", "awaiting_submission", "awaiting_sponsor_approval", "sponsor_approved",
  "awaiting_final_review", "ready_for_production", "inProduction", "produced", "conferred"];

function gerarMundo() {
  semente = 42;
  const eventos = Array.from({ length: N_EVENTOS }, (_, n) => linha(tEvents, {
    id: uuid("e", n), name: `CIRCUITO ${n} ${texto(5, 25)}`, status: n % 11 === 0 ? "closed" : "created",
    startDate: data(n + 30), truckDepartureDate: data(n + 28), createdAt: data(n), updatedAt: data(n + 1),
  }));
  const patrocinadores = Array.from({ length: N_PATROCINADORES }, (_, n) => linha(tSponsors, {
    id: uuid("s", n), name: `Patrocinador ${n} ${texto(3, 20)}`, color: "#3b82f6", strictApproval: n % 13 === 0,
    createdAt: data(n % 60), updatedAt: data(n % 60),
  }));
  const remessas = [0, 1, 2].map((n) => ({
    id: uuid("r", n), eventId: eventos[n].id, versao: `V${n + 1}`, solicitante: "Kit", departamento: "Kit",
    dataSolicitacao: data(10), entregaMaterial: data(20 + n), dataEvento: n === 1 ? null : data(25 + n),
    cargaCaminhao: data(19 + n), saidaCaminhao: data(21 + n), arquivo: `kit-v${n + 1}.xlsx`,
    criadoPor: "Kit", criadoPorId: "u-kit", createdAt: data(10),
  }));
  const pecas: any[] = [];
  for (let n = 0; n < N_PECAS; n++) {
    const doKit = n % 34 === 5 ? remessas[n % 3] : null;
    pecas.push(linha(tItems, {
      id: uuid("i", n), displayId: `#${String(n + 1).padStart(4, "0")}`,
      eventId: doKit ? doKit.eventId : eventos[n % N_EVENTOS].id,
      status: aleatorio() < 0.6 ? "delivered" : escolher(STATUS),
      parentItemId: null, complementSeq: null, kitRemessaId: doKit ? doKit.id : null,
      criadoPorId: doKit ? "u-kit" : "u-solic", deletedAt: null,
      // created_at único e decrescente: a ordem do storage (createdAt DESC).
      createdAt: new Date(Date.UTC(2026, 8, 1) - n * 60_000), updatedAt: new Date(Date.UTC(2026, 8, 2) - n * 1000),
    }));
  }
  // 40 complementos: filho aponta para a mãe; a mãe ganha complements[].
  for (let c = 0; c < 40; c++) {
    const filho = pecas[100 + c * 50];
    filho.parentItemId = pecas[99 + c * 50].id;
    filho.complementSeq = 1;
  }
  const vinculos: any[] = [];
  const aprovacoes: any[] = [];
  let na = 0;
  for (const p of pecas) {
    const qtd = Math.floor(aleatorio() * 4.2);
    const usados = new Set<number>();
    for (let k = 0; k < qtd; k++) {
      const si = Math.floor(aleatorio() * N_PATROCINADORES);
      if (usados.has(si)) continue;
      usados.add(si);
      vinculos.push({ id: `v${vinculos.length}`, itemId: p.id, sponsorId: patrocinadores[si].id, createdAt: data(3) });
      if (aleatorio() < 0.75) {
        aprovacoes.push(linha(tApprovals, {
          id: uuid("a", na++), itemId: p.id, sponsorId: patrocinadores[si].id,
          status: escolher(["approved", "approved", "pending", "rejected", "awaiting_arte"]),
        }));
      }
    }
  }
  return { eventos, patrocinadores, remessas, pecas, vinculos, aprovacoes };
}

// Dados no tamanho de produção: cada rota leva segundos no runner.
vi.setConfig({ testTimeout: 180_000 });

let M: ReturnType<typeof gerarMundo>;
const FILA_DA_GRAFICA = new Set(["awaiting_final_review", "awaiting_review", "in_review", "ready_for_production",
  "pronto_para_producao", "approved", "inProduction", "produced", "conferred", "packed", "delivered"]);

function ligarStorage() {
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  const vivas = () => M.pecas.filter((p) => !p.deletedAt).sort((a, b) => b.createdAt - a.createdAt);
  s.getAllItems = async () => vivas();
  s.getItemsByStatuses = async (sts: string[]) => vivas().filter((p) => sts.includes(p.status));
  // A fila leva os entregues só da janela (storage.getApprovedItems) — a
  // mesma régua que o delta aplica (cabeNaJanelaDeEntregues).
  s.getApprovedItems = async () => vivas().filter((p) => FILA_DA_GRAFICA.has(p.status) && cabeNaJanelaDeEntregues(p));
  s.getIdsQueSairamDaJanelaDeEntregues = async () => [];
  s.getPendingItems = async () => vivas().filter((p) => ["requested", "awaiting_linking"].includes(p.status));
  s.getDeletedItems = async () => M.pecas.filter((p) => p.deletedAt);
  s.getItemsChangedSince = async (since: Date) => M.pecas.filter((p) => p.updatedAt >= since);
  s.getAllEvents = async () => M.eventos.slice();
  s.getEventsByIds = async (ids: string[]) => M.eventos.filter((e) => ids.includes(e.id));
  s.getAllSponsors = async () => M.patrocinadores.slice();
  s.getAllItemSponsors = async () => M.vinculos;
  s.getItemSponsorsByItemIds = async (ids: string[]) => { const set = new Set(ids); return M.vinculos.filter((v) => set.has(v.itemId)); };
  s.getAllItemSponsorApprovals = async () => M.aprovacoes;
  s.getVinculosEAprovacoesDasPecasVivas = async () => {
    const vivasIds = new Set(vivas().map((p) => p.id));
    return { vinculos: M.vinculos.filter((v) => vivasIds.has(v.itemId)), aprovacoes: M.aprovacoes.filter((a) => vivasIds.has(a.itemId)) };
  };
  s.getItemsParaCorrecao = async () => vivas().filter((p) => p.status === "awaiting_sponsor_approval" || (p.status === "awaiting_submission" && p.rejectedBySponsor === true));
  s.getItemSponsorApprovalsByItemIds = async (ids: string[]) => { const set = new Set(ids); return M.aprovacoes.filter((a) => set.has(a.itemId)); };
  s.getComplementsByParentIds = async (ids: string[]) => {
    const set = new Set(ids);
    return M.pecas.filter((p) => p.parentItemId && set.has(p.parentItemId) && !p.deletedAt)
      .map((p) => ({ id: p.id, displayId: p.displayId, parentItemId: p.parentItemId, quantity: p.quantity, status: p.status, complementSeq: p.complementSeq }));
  };
  s.getItemsByIds = async (ids: string[]) => M.pecas.filter((p) => ids.includes(p.id));
  H.remessas.clear();
  for (const r of M.remessas) H.remessas.set(r.id, r);
}

const json = (x: unknown) => JSON.stringify(x);
const viaRede = (x: unknown) => JSON.parse(JSON.stringify(x));
const ms = (t0: number) => `${(performance.now() - t0).toFixed(1)} ms`;
const mb = (s: string) => `${(Buffer.byteLength(s) / 1024 / 1024).toFixed(2)} MB`;

beforeAll(() => {
  M = gerarMundo();
  ligarStorage();
});

// ═════════════════════════════════════════════════════════════════════════════
describe("codificar/decodificar é exato", () => {
  it("GET /api/items: compacto decodificado serializa igual ao formato de sempre (e mede)", async () => {
    const antigo = await chamar("GET /api/items");
    expect(Array.isArray(antigo)).toBe(true);
    expect(antigo).toHaveLength(N_PECAS);

    const t0 = performance.now();
    const jsonAntigo = json(antigo);
    const tAntigo = ms(t0);

    const t1 = performance.now();
    const compacto = await chamar("GET /api/items", { formato: "compacto" });
    const jsonCompacto = json(compacto);
    const tCompacto = ms(t1);
    const t1b = performance.now();
    json(compactarPecas(antigo));
    const tSoCodificar = ms(t1b);

    const t2 = performance.now();
    const parseAntigo = JSON.parse(jsonAntigo);
    const tParseAntigo = ms(t2);
    const t3 = performance.now();
    const decodificado = expandirResposta(JSON.parse(jsonCompacto)) as any[];
    const tParseCompacto = ms(t3);

    // A régua: a string inteira, byte a byte (chaves, ordem, ausentes, Kit).
    expect(json(decodificado)).toBe(jsonAntigo);
    expect(decodificado[5]).toStrictEqual(parseAntigo[5]);

    // Kit: o evento decodificado é o do servidor, com as datas da remessa.
    const doKit = decodificado.filter((i) => i.kitRemessaId);
    expect(doKit.length).toBeGreaterThan(100);
    expect(doKit.every((i) => i.event.datasDoKit === true && i.kitRemessa)).toBe(true);
    // Complemento e parent seguem inteiros.
    expect(decodificado.filter((i) => i.complements).length).toBe(40);
    expect(decodificado.filter((i) => i.parent).length).toBe(40);
    // Memória: o evento é o MESMO objeto entre as peças do mesmo evento.
    const doEvento0 = decodificado.filter((i) => i.eventId === M.eventos[10].id);
    expect(new Set(doEvento0.map((i) => i.event)).size).toBe(1);

    console.log(
      `\n[perf] GET /api/items (${N_PECAS} peças)\n` +
      `  JSON  antes: ${mb(jsonAntigo)}   depois: ${mb(jsonCompacto)}\n` +
      `  servidor JSON.stringify  antes: ${tAntigo}   depois (rota inteira, incl. enriquecer+codificar+stringify): ${tCompacto}   só codificar+stringify: ${tSoCodificar}\n` +
      `  cliente  JSON.parse  antes: ${tParseAntigo}   depois (parse + decodificar): ${tParseCompacto}`,
    );
    expect(Buffer.byteLength(jsonCompacto)).toBeLessThan(Buffer.byteLength(jsonAntigo) * 0.5);
  });

  it("/api/items/approved, /pending e /deleted também decodificam igual", async () => {
    M.pecas[7].deletedAt = data(80);
    try {
      for (const rota of ["GET /api/items/approved", "GET /api/items/pending", "GET /api/items/deleted"]) {
        const antigo = await chamar(rota);
        const compacto = await chamar(rota, { formato: "compacto" });
        expect(json(expandirResposta(viaRede(compacto))), rota).toBe(json(antigo));
      }
      const fila = await chamar("GET /api/items/approved");
      const jsonFila = json(fila);
      const jsonFilaCompacta = json(await chamar("GET /api/items/approved", { formato: "compacto" }));
      console.log(`[perf] GET /api/items/approved (${fila.length} peças)  antes: ${mb(jsonFila)}   depois: ${mb(jsonFilaCompacta)}`);
    } finally {
      M.pecas[7].deletedAt = null;
    }
  });

  it("GET /api/items/batch-approval-data compacto decodifica igual (e mede)", async () => {
    const antigo = await chamar("GET /api/items/batch-approval-data");
    const compacto = await chamar("GET /api/items/batch-approval-data", { formato: "compacto" });
    const jsonAntigo = json(antigo);
    const jsonCompacto = json(compacto);
    expect(json(expandirAprovacoes(JSON.parse(jsonCompacto)))).toBe(jsonAntigo);
    console.log(`[perf] GET /api/items/batch-approval-data  antes: ${mb(jsonAntigo)}   depois: ${mb(jsonCompacto)}`);
  });

  it("conservador: evento/patrocinador que não bate com o dicionário vai EMBUTIDO", () => {
    const ev = { id: "e1", name: "A", startDate: new Date("2026-01-01T00:00:00Z") };
    const evRenomeado = { ...ev, name: "B" }; // mesmo id, conteúdo diferente
    const sp = { id: "s1", name: "X" };
    const pecas = [
      { id: "p1", eventId: "e1", event: ev, sponsors: [{ ...sp, approvalStatus: "approved" }] },
      { id: "p2", eventId: "e1", event: evRenomeado, sponsors: [{ ...sp, name: "Y", approvalStatus: null }] },
      { id: "p3", eventId: "e1", sponsors: "não é lista", extra: undefined },
      { id: "p4", eventId: "e9", event: null, sponsors: [{ id: "s2", approvalStatus: "pending", nome: "fora de ordem" }] },
    ];
    const volta = expandirPecas(viaRede(compactarPecas(pecas)));
    expect(json(volta)).toBe(json(pecas));
    // no delta, a base é fixa: evento fora dela vai embutido
    const comBase = compactarPecas(pecas, { eventos: [evRenomeado], patrocinadores: [sp] });
    expect(json(expandirPecas(viaRede(comBase)))).toBe(json(pecas));
    expect(comBase.eventos).toHaveLength(1);
  });

  it("o status é VALOR, não índice: 'packed' (Embalado, 21/09) e o tubo fechado fazem a volta byte a byte", () => {
    // O formato guarda cada peça como [forma, ...valores] — o status viaja
    // como o texto que está no banco. Um status novo não muda forma nenhuma.
    const ev = { id: "e1", name: "A" };
    const pecas = [
      { id: "p1", eventId: "e1", event: ev, status: "conferred", tuboId: null, statusChangedAt: new Date("2026-09-21T14:00:00Z"), sponsors: [] },
      { id: "p2", eventId: "e1", event: ev, status: "packed", tuboId: "t1", statusChangedAt: new Date("2026-09-21T14:32:00Z"), sponsors: [] },
      { id: "p3", eventId: "e1", event: ev, status: "delivered", tuboId: "t1", sponsors: [] },
    ];
    const volta = expandirPecas(viaRede(compactarPecas(pecas)));
    expect(json(volta)).toBe(json(pecas));
    expect(volta.map((p) => p.status)).toEqual(["conferred", "packed", "delivered"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("paridade com o storage", () => {
  it("os status do delta da Gráfica são os de getApprovedItems", () => {
    const STORAGE = readFileSync(path.resolve(__dirname, "../storage.ts"), "utf8");
    const fn = STORAGE.slice(STORAGE.indexOf("async getApprovedItems"), STORAGE.indexOf("private async generateNextDisplayId"));
    const doSql = Array.from(fn.matchAll(/'([A-Za-z_]+)'/g), (m) => m[1]);
    const ITEMS = fonteDasRotasDeItens();
    const bloco = ITEMS.slice(ITEMS.indexOf("const STATUS_DA_FILA_DA_GRAFICA"), ITEMS.indexOf("]);", ITEMS.indexOf("const STATUS_DA_FILA_DA_GRAFICA")));
    const daRota = Array.from(bloco.matchAll(/"([A-Za-z_]+)"/g), (m) => m[1]);
    expect(doSql.length).toBeGreaterThan(5);
    expect(new Set(daRota)).toEqual(new Set(doSql));
    expect(new Set(daRota)).toEqual(FILA_DA_GRAFICA);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o cliente de verdade: queryFn com delta + compacto", () => {
  const queryFn = getQueryFn({ on401: "throw" }) as any;
  let pedidos: string[] = [];

  beforeAll(() => {
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem: () => {} });
    vi.stubGlobal("fetch", async (url: string) => {
      pedidos.push(url);
      const u = new URL(url, "http://local");
      const corpo = await chamar(`GET ${u.pathname}`, Object.fromEntries(u.searchParams));
      return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
    });
  });

  for (const chave of ["/api/items", "/api/items/approved"]) {
    it(`${chave}: full compacto + deltas = o full fetch antigo, byte a byte`, async () => {
      M = gerarMundo();
      ligarStorage();
      resetItensDelta();
      pedidos = [];
      const buscar = () => queryFn({ queryKey: [chave], signal: new AbortController().signal, meta: undefined });

      const primeira = await buscar();
      expect(pedidos[0]).toBe(`${chave}?formato=compacto`);
      expect(json(primeira)).toBe(json(viaRede(await chamar(`GET ${chave}`))));

      // Nada mudou → o MESMO array (as telas não re-renderizam à toa).
      const semMudanca = await buscar();
      expect(pedidos[1]).toMatch(new RegExp(`^${chave.replace(/\//g, "\\/")}\\?formato=compacto&since=`));
      expect(semMudanca).toBe(primeira);

      // Mudanças de outra pessoa: evento renomeado, patrocinador renomeado,
      // peça mudou de status (entra/sai da fila), peça apagada, peça nova,
      // evento de peça do Kit encerrado.
      const agora = new Date(Date.now() + 1000);
      M.eventos[20].name = "EVENTO RENOMEADO";
      M.eventos[1].status = "closed"; // evento da remessa V2 do Kit
      const spAlvo = M.patrocinadores.find((s) => M.vinculos.some((v) => v.sponsorId === s.id))!;
      spAlvo.name = "PATROCINADOR RENOMEADO";
      const mudaStatus = M.pecas.find((p) => p.status === "delivered" && !p.kitRemessaId && !p.parentItemId)!;
      mudaStatus.status = "awaiting_submission"; mudaStatus.updatedAt = agora;
      const entraNaFila = M.pecas.find((p) => p.status === "requested" && !p.parentItemId)!;
      entraNaFila.status = "produced"; entraNaFila.updatedAt = agora;
      const apagada = M.pecas.find((p) => p.status === "delivered" && !p.parentItemId && p !== mudaStatus)!;
      apagada.deletedAt = agora; apagada.updatedAt = agora;
      // Complemento que andou: a MÃE (não tocada no banco) muda o resumo.
      const filho = M.pecas.find((p) => p.parentItemId && p.status !== "produced")!;
      filho.status = "produced"; filho.updatedAt = agora;
      M.pecas.push({ ...M.pecas[3], id: uuid("n", 1), displayId: "#9999", status: "delivered", parentItemId: null,
        createdAt: new Date(Date.UTC(2026, 8, 1) - 1500.5 * 60_000), updatedAt: agora });

      const naoTocada = (primeira as any[]).find((i) => i.eventId === M.eventos[40].id
        && !i.sponsors.some((s: any) => s.id === spAlvo.id) && i.id !== mudaStatus.id && !i.kitRemessaId && i.id !== filho.parentItemId);

      const t0 = performance.now();
      const depois = await buscar();
      const tDelta = ms(t0);
      expect(json(depois)).toBe(json(viaRede(await chamar(`GET ${chave}`))));
      // Identidade: a peça que nada teve a ver com as mudanças é o mesmo objeto.
      if (naoTocada) expect((depois as any[]).find((i) => i.id === naoTocada.id)).toBe(naoTocada);
      // A peça do Kit no evento encerrado: status novo E as datas da remessa.
      const kitV2 = (depois as any[]).find((i) => i.kitRemessaId === M.remessas[1].id);
      if (kitV2) {
        expect(kitV2.event.status).toBe("closed");
        expect(kitV2.event.datasDoKit).toBe(true);
      }
      console.log(`[perf] ${chave}: ciclo de delta com 7 mudanças no cliente (fetch simulado + decodificar + merge): ${tDelta}`);
    });
  }

  it("busca que chega com outra em voo espera e pede só o delta (sem dois downloads cheios)", async () => {
    M = gerarMundo();
    ligarStorage();
    resetItensDelta();
    pedidos = [];
    const buscar = () => queryFn({ queryKey: ["/api/items"], signal: new AbortController().signal, meta: undefined });
    const [a, b] = await Promise.all([buscar(), buscar()]);
    expect(pedidos).toHaveLength(2);
    expect(pedidos[0]).toBe("/api/items?formato=compacto");
    expect(pedidos[1]).toContain("since=");
    expect(b).toBe(a);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("merge do delta: identidade e custo do structuralSharing", () => {
  /** O aplicarDelta de ANTES (27/08–15/09), para comparar resultado e custo. */
  function aplicarDeltaAntigo(anterior: any[], delta: any): any[] {
    const evPorId = new Map((delta.eventos ?? []).map((e: any) => [e.id, e]));
    const spPorId = new Map((delta.patrocinadores ?? []).map((s: any) => [s.id, s]));
    const porId = new Map<string, any>(anterior.map((i) => [i.id, i]));
    for (const id of delta.removidas ?? []) porId.delete(id);
    for (const item of delta.itens ?? []) porId.set(item.id, item);
    return Array.from(porId.values()).map((i) => ({
      ...i,
      event: i.kitRemessaId && i.kitRemessa
        ? eventoComDatasDoKit((evPorId.get(i.eventId) as any) ?? i.event, i.kitRemessa)
        : evPorId.get(i.eventId) ?? i.event,
      sponsors: Array.isArray(i.sponsors)
        ? i.sponsors.map((s: any) => {
            const atual = spPorId.get(s.id);
            return atual ? { ...atual, approvalStatus: s.approvalStatus ?? null } : s;
          })
        : i.sponsors,
    }));
  }

  it("mesmo resultado do merge antigo; peças intocadas mantêm identidade; replaceEqualDeep fica barato", async () => {
    M = gerarMundo();
    ligarStorage();
    const envelope = viaRede(await chamar("GET /api/items", { formato: "compacto" }));
    const anterior = expandirResposta(envelope) as any[];
    const assinaturas = {
      eventos: new Map<string, string>(envelope.eventos.map((e: any) => [e.id, JSON.stringify(e)])),
      patrocinadores: new Map<string, string>(envelope.patrocinadores.map((s: any) => [s.id, JSON.stringify(s)])),
    };
    // Delta típico: 3 peças mudadas, nenhum evento/patrocinador alterado.
    const agora = new Date(Date.now() + 1000);
    // (3001–3003: fora dos pares mãe/complemento, que puxariam a mãe junto)
    for (const p of M.pecas.slice(3001, 3004)) { p.observations = "mudou"; p.updatedAt = agora; }
    const delta = expandirResposta(viaRede(await chamar("GET /api/items", { formato: "compacto", since: new Date(Date.now() - 60_000).toISOString() }))) as any;
    expect(delta.itens).toHaveLength(3);

    const clone = () => JSON.parse(JSON.stringify(anterior)); // o cache anterior, estável

    const cacheA = clone();
    let t = performance.now();
    const antigo = aplicarDeltaAntigo(cacheA, delta);
    const tMergeAntigo = performance.now() - t;
    t = performance.now();
    replaceEqualDeep(cacheA, antigo);
    const tRedAntigo = performance.now() - t;

    const cacheB = clone();
    t = performance.now();
    const novo = aplicarDelta(cacheB, delta, assinaturas);
    const tMergeNovo = performance.now() - t;
    t = performance.now();
    const compartilhado = replaceEqualDeep(cacheB, novo);
    const tRedNovo = performance.now() - t;

    expect(json(novo)).toBe(json(antigo));
    const mudadas = new Set(delta.itens.map((i: any) => i.id));
    expect(novo.filter((i, n) => i === cacheB[n]).length).toBe(cacheB.length - mudadas.size);
    expect((compartilhado as any[]).filter((i, n) => i !== cacheB[n]).length).toBe(mudadas.size);

    console.log(
      `[perf] merge do delta (${anterior.length} peças, 3 mudadas)\n` +
      `  antes: merge ${tMergeAntigo.toFixed(1)} ms + replaceEqualDeep ${tRedAntigo.toFixed(1)} ms (cópia de toda peça → comparação profunda de tudo)\n` +
      `  depois: merge ${tMergeNovo.toFixed(1)} ms + replaceEqualDeep ${tRedNovo.toFixed(1)} ms (identidade preservada → comparação só das mudadas)`,
    );
    expect(tRedNovo).toBeLessThan(tRedAntigo);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// RECORTE ?status= / ?ids= (perf, 17/09 — segunda passada). A Revisão Final
// passou a pedir só as peças em "Aguardando Revisão Final".
describe("GET /api/items recortado (?status=, ?ids=)", () => {
  const REVISAO = "awaiting_final_review";
  const recortar = (lista: any[], sts: string[]) => lista.filter((i) => sts.includes(i.status));

  it("devolve exatamente as peças da lista inteira naquele status — mesma ordem, mesmo enriquecimento (e mede)", async () => {
    M = gerarMundo();
    ligarStorage();
    // Uma mãe em revisão com complemento em outro status, e um filho em revisão
    // cuja mãe está fora do recorte: `complements` e `parent` têm de vir iguais.
    const mae = M.pecas.find((p) => p.parentItemId === null && M.pecas.some((f) => f.parentItemId === p.id))!;
    mae.status = REVISAO;
    const filho = M.pecas.filter((p) => p.parentItemId)[3];
    filho.status = REVISAO;
    M.pecas.find((p) => p.id === filho.parentItemId)!.status = "delivered";

    const inteira = await chamar("GET /api/items");
    for (const sts of [[REVISAO], [REVISAO, "produced"], ["pronto_para_producao"]]) {
      const esperado = json(recortar(inteira, sts));
      const t0 = performance.now();
      const recorte = await chamar("GET /api/items", { status: sts.join(",") });
      const tRecorte = ms(t0);
      expect(json(recorte), sts.join()).toBe(esperado);
      const compacto = await chamar("GET /api/items", { status: sts.join(","), formato: "compacto" });
      expect(json(expandirResposta(viaRede(compacto))), sts.join()).toBe(esperado);
      if (sts.length === 1 && sts[0] === REVISAO) {
        expect(recorte.some((i: any) => i.id === mae.id && i.complements?.length)).toBe(true);
        expect(recorte.some((i: any) => i.id === filho.id && i.parent?.status === "delivered")).toBe(true);
        console.log(`[perf] Revisão Final: GET /api/items (${inteira.length} peças) ${mb(json(inteira))} → ?status=${REVISAO}&formato=compacto (${recorte.length} peças) ${(Buffer.byteLength(json(compacto)) / 1024).toFixed(1)} KB · rota recortada ${tRecorte}`);
      }
    }
  });

  it("os chips de patrocinador saem na ORDEM da lista inteira (leituras do acervo, não por id)", async () => {
    M = gerarMundo();
    ligarStorage();
    const porId = vi.fn(H.storage.getItemSponsorsByItemIds);
    H.storage.getItemSponsorsByItemIds = porId;
    await chamar("GET /api/items", { status: REVISAO });
    expect(porId).not.toHaveBeenCalled();
    const fonte = fonteDasRotasDeItens();
    expect(fonte).toContain("const escopado = list.length <= 500 && !carregados?.ordemDoAcervo;");
  });

  it("KIT: o recorte respeita pecaVisivelPara (cheio e delta)", async () => {
    M = gerarMundo();
    ligarStorage();
    for (const p of M.pecas.filter((x) => x.kitRemessaId).slice(0, 20)) p.status = REVISAO;
    const kit = { userKit: true, userId: "u-kit" };
    const inteiraDoKit = await chamar("GET /api/items", {}, "solicitacao", kit);
    const recorteDoKit = await chamar("GET /api/items", { status: REVISAO }, "solicitacao", kit);
    expect(recorteDoKit.length).toBeGreaterThan(0);
    expect(recorteDoKit.every((i: any) => i.kitRemessaId && i.criadoPorId === "u-kit")).toBe(true);
    expect(json(recorteDoKit)).toBe(json(recortar(inteiraDoKit, [REVISAO])));

    // Delta: peça da Arena que entra em revisão não aparece para o Kit; sai como removida.
    const agora = new Date(Date.now() + 1000);
    const arena = M.pecas.find((p) => !p.kitRemessaId && !p.parentItemId)!;
    arena.status = REVISAO; arena.updatedAt = agora;
    const delta = await chamar("GET /api/items", { status: REVISAO, since: new Date(Date.now() - 60_000).toISOString() }, "solicitacao", kit);
    expect(delta.itens.some((i: any) => i.id === arena.id)).toBe(false);
    expect(delta.removidas).toContain(arena.id);
  });

  it("?ids= devolve só essas peças (viva, visível), na ordem da lista", async () => {
    M = gerarMundo();
    ligarStorage();
    const [a, b, c] = [M.pecas[10], M.pecas[500], M.pecas[20]];
    c.deletedAt = data(80);
    const inteira = await chamar("GET /api/items");
    const r = await chamar("GET /api/items", { ids: [b.id, a.id, c.id].join(",") });
    expect(json(r)).toBe(json(inteira.filter((i: any) => i.id === a.id || i.id === b.id)));
    const foraDoStatus = await chamar("GET /api/items", { ids: a.id, status: a.status === REVISAO ? "delivered" : REVISAO });
    expect(foraDoStatus).toEqual([]);
  });

  it("status desconhecido, vazio ou ids inválidos → 400 (nunca uma lista vazia com cara de 'não há nada')", async () => {
    await expect(chamar("GET /api/items", { status: "aguardando_revisao" })).rejects.toThrow(/400.*Status desconhecido/);
    await expect(chamar("GET /api/items", { status: "" })).rejects.toThrow(/400/);
    await expect(chamar("GET /api/items", { ids: "a;DROP" })).rejects.toThrow(/400/);
    // Sem parâmetro nenhum: a lista de sempre.
    M = gerarMundo();
    ligarStorage();
    expect(await chamar("GET /api/items")).toHaveLength(N_PECAS);
  });

  it("cliente: a chave recortada busca com delta PRÓPRIO; peça liberada some e peça que chega aparece, sem F5", async () => {
    M = gerarMundo();
    // O gerador é pseudoaleatório com semente fixa e sorteia UM valor por coluna
    // do schema: uma coluna nova desloca a sequência, e o sorteio pode não cair
    // em "revisão" nenhuma vez. O teste precisa de peças simples em revisão —
    // então as põe lá à mão, em vez de depender da sorte da semente.
    for (const p of M.pecas.filter((x) => !x.parentItemId && !x.kitRemessaId && !M.pecas.some((f) => f.parentItemId === x.id)).slice(0, 12)) p.status = REVISAO;
    ligarStorage();
    resetItensDelta();
    const queryFn = getQueryFn({ on401: "throw" }) as any;
    const pedidos: { url: string; bytes: number }[] = [];
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem: () => {} });
    vi.stubGlobal("fetch", async (url: string) => {
      const u = new URL(url, "http://local");
      const corpo = JSON.stringify(await chamar(`GET ${u.pathname}`, Object.fromEntries(u.searchParams)));
      pedidos.push({ url, bytes: Buffer.byteLength(corpo) });
      return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
    });
    const CHAVE = ["/api/items", `?status=${REVISAO}`];
    const buscar = () => queryFn({ queryKey: CHAVE, signal: new AbortController().signal, meta: undefined });
    const esperado = async () => json(viaRede(recortar(await chamar("GET /api/items"), [REVISAO])));

    const primeira = await buscar();
    expect(pedidos[0].url).toBe(`/api/items?status=${REVISAO}&formato=compacto`);
    expect(json(primeira)).toBe(await esperado());
    // A lista inteira tem sincronia própria: buscá-la não vira delta da recortada.
    await queryFn({ queryKey: ["/api/items"], signal: new AbortController().signal, meta: undefined });
    expect(pedidos[1].url).toBe("/api/items?formato=compacto");

    // Primeiro delta sem mudança: mesmo conteúdo. (A peça do Kit cujo evento só
    // aparece no dicionário do Kit é re-costurada UMA vez aqui — a lista
    // recortada não trazia o evento cru dela para assinar; o delta traz todos.)
    const segunda = await buscar();
    expect(json(segunda)).toBe(json(primeira));
    expect(await buscar()).toBe(segunda); // daí em diante, nada mudou → mesmo array
    expect(pedidos[2].url.startsWith(`/api/items?status=${REVISAO}&formato=compacto&since=`)).toBe(true);

    // Liberada (sai do status), excluída em outra aba (sai) e uma nova
    // chegando — todas desde a última busca.
    const agora = new Date(Date.now() + 1000);
    const simples = (primeira as any[]).filter((i) => !i.parentItemId && !(i.complements?.length));
    const liberada = M.pecas.find((p) => p.id === simples[0].id)!;
    liberada.status = "ready_for_production"; liberada.updatedAt = agora;
    const excluida = M.pecas.find((p) => p.id === simples[1].id)!;
    excluida.deletedAt = agora; excluida.updatedAt = agora;
    const chegando = M.pecas.find((p) => p.status === "sponsor_approved" && !p.parentItemId && !M.pecas.some((f) => f.parentItemId === p.id))!;
    chegando.status = REVISAO; chegando.updatedAt = agora;

    const depois = await buscar();
    expect(json(depois)).toBe(await esperado());
    expect((depois as any[]).some((i) => i.id === liberada.id)).toBe(false);
    expect((depois as any[]).some((i) => i.id === excluida.id)).toBe(false);
    expect((depois as any[]).some((i) => i.id === chegando.id)).toBe(true);
    const intocada = (segunda as any[]).find((i) => i.id === simples[2]?.id);
    if (intocada) expect((depois as any[]).find((i) => i.id === intocada.id)).toBe(intocada);

    const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
    console.log(`[perf] Revisão Final no cliente: full recortado ${kb(pedidos[0].bytes)} (acervo inteiro compacto: ${kb(pedidos[1].bytes)}) · delta sem mudança ${kb(pedidos[3].bytes)} · delta com 3 mudanças ${kb(pedidos[4].bytes)}`);
    vi.unstubAllGlobals();
  });

  it("a chave recortada fica no prefixo /api/items: invalidar o prefixo (WebSocket, mutações) a atinge", async () => {
    const { queryClient } = await import("../../client/src/lib/queryClient");
    const CHAVE = ["/api/items", `?status=${REVISAO}`];
    queryClient.setQueryData(CHAVE, [{ id: "x" }]);
    await queryClient.invalidateQueries({ queryKey: ["/api/items"], refetchType: "none" });
    expect(queryClient.getQueryState(CHAVE)?.isInvalidated).toBe(true);
    queryClient.clear();
  });
});
