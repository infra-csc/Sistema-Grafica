// ─────────────────────────────────────────────────────────────────────────────
// GET /api/events?itens=resumo (perf, 17/09).
//
// O que este arquivo prende:
//  1. Resumir e expandir não muda NADA que as telas leem: o evento sai com as
//     mesmas chaves, na mesma ordem e os mesmos valores (fora `items`), e
//     `items` volta com as mesmas quantidades por status e por skipApproval —
//     então readEventStats, contarRascunhos e contarPorFaseDoEvento dão o mesmo
//     número. O `id` da peça é o que NÃO volta (ninguém lê — conferido).
//  2. A rota: sem o parâmetro, o corpo de sempre; com, o resumo — e o JSON
//     pronto de uma variante nunca é servido para a outra (cache e montagem
//     em voo separados), inclusive depois de uma escrita invalidar o cache.
//     Usuário do Kit também recebe o resumo, das peças DELE.
//  3. O cliente de verdade (getQueryFn) pede `?itens=resumo` para
//     ["/api/events"] e entrega `items` em array; servidor antigo passa intacto.
//
// E imprime o ANTES × DEPOIS do tamanho com o acervo de produção (68 eventos,
// 5.128 peças).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any> }));

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
  };
});
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn() }));

import { registerEventRoutes, montarListaDeEventos } from "../routes/events";
import { invalidateEventsCache } from "../cache";
import { todayBusinessMs } from "@shared/prazo-dates";
import { resumirItensDosEventos, expandirItensDosEventos } from "@shared/eventos-resumo";
import { contarPorFaseDoEvento } from "../../client/src/lib/fases";
import { getQueryFn } from "../../client/src/lib/queryClient";

// ─── harness ─────────────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventRoutes(appFalso);

/** Chama GET /api/events e devolve o corpo como TEXTO (a rota manda JSON pronto). */
async function chamar(query: Record<string, string> = {}, extra: Record<string, any> = {}): Promise<string> {
  const req: any = { params: {}, body: {}, query, headers: {}, userRole: "admin", userId: "u-admin", ...extra };
  const res: any = { _status: 200, _body: undefined as any, _done: false, _headers: {} as Record<string, string> };
  res.status = (c: number) => { res._status = c; return res; };
  res.get = (k: string) => res._headers[k];
  res.set = (k: string, v: string) => { res._headers[k] = v; return res; };
  res.send = (b: any) => { res._body = b; res._done = true; return res; };
  res.json = (b: any) => { res._body = JSON.stringify(b); res._done = true; return res; };
  for (const h of rotas.get("GET /api/events")!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  if (res._status !== 200) throw new Error(`GET /api/events → ${res._status}: ${res._body}`);
  return res._body;
}

// ─── dados no tamanho de produção ────────────────────────────────────────────
let semente = 11;
const aleatorio = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
const STATUS = ["draft", "requested", "awaiting_linking", "awaiting_submission", "awaiting_sponsor_approval", "sponsor_approved",
  "awaiting_final_review", "ready_for_production", "inProduction", "produced", "conferred", "delivered", "delivered", "delivered",
  "canceled", "archived", "entregue", "em_producao"];
const uuid = (p: string, n: number) => `${p}${String(n).padStart(8, "0")}-4a1b-9c2d-${String(n * 7919).padStart(12, "0")}`.slice(0, 36);

const EVENTOS = Array.from({ length: 68 }, (_, n) => ({
  id: uuid("e", n), name: `CIRCUITO ${n}`, status: n % 13 === 0 ? "closed" : n % 7 === 0 ? "completed" : "created",
  priority: ["alta", "media", "baixa"][n % 3], franchise: `Franquia ${n % 5}`,
  startDate: new Date(Date.UTC(2026, 8, 1 + (n % 60))), truckDepartureDate: new Date(Date.UTC(2026, 7, 25 + (n % 60))),
  createdAt: new Date(Date.UTC(2026, 5, 1 + n)), updatedAt: new Date(Date.UTC(2026, 5, 2 + n)),
}));
const PECAS = Array.from({ length: 5128 }, (_, n) => ({
  id: uuid("i", n), eventId: EVENTOS[Math.floor(aleatorio() * EVENTOS.length)].id,
  status: STATUS[Math.floor(aleatorio() * STATUS.length)], skipApproval: aleatorio() < 0.15,
}));
const VINCULOS = EVENTOS.flatMap((e, n) => Array.from({ length: n % 4 }, (_, k) => ({ id: `v${n}-${k}`, eventId: e.id, sponsorId: `s${k}`, quota: "ouro" })));

beforeAll(() => {
  const s = H.storage;
  s.getAllEvents = async () => EVENTOS.slice();
  s.getItemsSlimForEvents = async () => PECAS.slice();
  s.getAllEventSponsors = async () => VINCULOS.slice();
  s.getItemsDoKitDoCriador = async (userId: string) =>
    PECAS.filter((_p, n) => n % 9 === 0).map((p) => ({ ...p, kitRemessaId: "r1", criadoPorId: userId, displayId: "#1" }));
});

const semItems = (ev: any) => { const { items: _i, ...resto } = ev; return resto; };
const assinaturaDasPecas = (itens: any[]) => itens.map((i) => `${i.eventId}|${i.status}|${i.skipApproval}`).sort();

// ═════════════════════════════════════════════════════════════════════════════
describe("resumir → expandir preserva o que as telas leem", () => {
  it("mesmas chaves/valores do evento; mesmas peças por status e skipApproval; mesmas fases (e mede)", () => {
    const lista = montarListaDeEventos(EVENTOS as any, PECAS, VINCULOS, todayBusinessMs());
    const jsonAntes = JSON.stringify(lista);
    const jsonDepois = JSON.stringify(resumirItensDosEventos(lista));
    const antes = JSON.parse(jsonAntes) as any[];
    const depois = expandirItensDosEventos(JSON.parse(jsonDepois)) as any[];

    expect(depois).toHaveLength(antes.length);
    for (let k = 0; k < antes.length; k++) {
      // Chaves na mesma ordem (inclusive `items` no mesmo lugar) e valores iguais.
      expect(Object.keys(depois[k])).toEqual(Object.keys(antes[k]));
      expect(JSON.stringify(semItems(depois[k]))).toBe(JSON.stringify(semItems(antes[k])));
      expect(Array.isArray(depois[k].items)).toBe(true);
      expect(assinaturaDasPecas(depois[k].items)).toEqual(assinaturaDasPecas(antes[k].items));
      expect(contarPorFaseDoEvento(depois[k])).toEqual(contarPorFaseDoEvento(antes[k]));
      // As contas de eventos.tsx (readEventStats / contarRascunhos) são por status.
      const conta = (itens: any[], st: string[]) => itens.filter((i) => st.includes(i.status)).length;
      for (const st of [["draft", "requested"], ["inProduction", "em_producao"], ["delivered", "entregue"], ["canceled", "archived"]]) {
        expect(conta(depois[k].items, st)).toBe(conta(antes[k].items, st));
      }
    }
    const kb = (s: string) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
    console.log(`[perf] GET /api/events (${EVENTOS.length} eventos, ${PECAS.length} peças)  antes: ${kb(jsonAntes)}   depois (?itens=resumo): ${kb(jsonDepois)}`);
    expect(Buffer.byteLength(jsonDepois)).toBeLessThan(Buffer.byteLength(jsonAntes) * 0.4);
  });

  it("resposta que não veio resumida passa intacta (servidor antigo no deploy)", () => {
    const corpo = [{ id: "e1", items: [{ id: "p1", eventId: "e1", status: "draft", skipApproval: false }] }, { id: "e2" }];
    expect(expandirItensDosEventos(corpo)).toBe(corpo);
    expect(expandirItensDosEventos({ erro: 1 })).toEqual({ erro: 1 });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a rota", () => {
  it("sem o parâmetro responde como sempre; com, o resumo — e o cache nunca troca uma variante pela outra", async () => {
    invalidateEventsCache();
    const esperadoCompleto = () => JSON.stringify(montarListaDeEventos(EVENTOS as any, PECAS, VINCULOS, todayBusinessMs()));
    const esperadoResumo = () => JSON.stringify(resumirItensDosEventos(JSON.parse(esperadoCompleto())));

    // Ordem que exercita os dois caches: completa (grava), resumo (não pode
    // usar o da completa), completa (do cache), resumo (do cache dele).
    expect(await chamar()).toBe(esperadoCompleto());
    expect(await chamar({ itens: "resumo" })).toBe(esperadoResumo());
    expect(await chamar()).toBe(esperadoCompleto());
    expect(await chamar({ itens: "resumo" })).toBe(esperadoResumo());

    // Pedidos simultâneos das duas variantes com o cache vazio.
    invalidateEventsCache();
    const [a, b, c] = await Promise.all([chamar({ itens: "resumo" }), chamar(), chamar({ itens: "resumo" })]);
    expect(a).toBe(esperadoResumo());
    expect(b).toBe(esperadoCompleto());
    expect(c).toBe(esperadoResumo());

    // Escrita (broadcast → invalidateEventsCache): o resumo guardado deixa de valer.
    PECAS[0].status = PECAS[0].status === "delivered" ? "draft" : "delivered";
    invalidateEventsCache();
    expect(await chamar({ itens: "resumo" })).toBe(esperadoResumo());
    expect(await chamar()).toBe(esperadoCompleto());

    // Valor desconhecido = sem resumo.
    expect(await chamar({ itens: "tudo" })).toBe(esperadoCompleto());
  });

  it("usuário do Kit: o resumo é das peças do Kit dele", async () => {
    const completo = JSON.parse(await chamar({}, { userKit: true, userId: "u-kit" })) as any[];
    const resumido = expandirItensDosEventos(JSON.parse(await chamar({ itens: "resumo" }, { userKit: true, userId: "u-kit" }))) as any[];
    expect(resumido.map((e) => e.itemCount)).toEqual(completo.map((e) => e.itemCount));
    for (let k = 0; k < completo.length; k++) {
      expect(assinaturaDasPecas(resumido[k].items)).toEqual(assinaturaDasPecas(completo[k].items));
      expect(JSON.stringify(semItems(resumido[k]))).toBe(JSON.stringify(semItems(completo[k])));
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o cliente de verdade", () => {
  const queryFn = getQueryFn({ on401: "throw" }) as any;
  const buscar = () => queryFn({ queryKey: ["/api/events"], signal: new AbortController().signal, meta: undefined });

  it('["/api/events"] pede ?itens=resumo e entrega `items` em array', async () => {
    const pedidos: string[] = [];
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem: () => {} });
    vi.stubGlobal("fetch", async (url: string) => {
      pedidos.push(url);
      const u = new URL(url, "http://local");
      const corpo = await chamar(Object.fromEntries(u.searchParams));
      return new Response(corpo, { status: 200, headers: { "content-type": "application/json" } });
    });
    invalidateEventsCache();
    const eventos = await buscar();
    expect(pedidos).toEqual(["/api/events?itens=resumo"]);
    const completo = JSON.parse(await chamar()) as any[];
    expect(eventos.map((e: any) => contarPorFaseDoEvento(e))).toEqual(completo.map((e) => contarPorFaseDoEvento(e)));
    expect(eventos.every((e: any) => Array.isArray(e.items))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("servidor antigo (ignora o parâmetro): o array de sempre passa intacto", async () => {
    const antigo = [{ id: "e1", name: "X", items: [{ id: "p1", eventId: "e1", status: "draft", skipApproval: false }] }];
    vi.stubGlobal("localStorage", { getItem: () => null, removeItem: () => {} });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(antigo), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await buscar()).toEqual(antigo);
    vi.unstubAllGlobals();
  });
});
