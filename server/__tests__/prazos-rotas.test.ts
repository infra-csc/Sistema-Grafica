// ─────────────────────────────────────────────────────────────────────────────
// GESTÃO DE PRAZOS — comportamento das ROTAS REAIS de server/routes/prazos.ts.
//
// Os handlers rodam de verdade: `registerPrazoRoutes` recebe um "app" falso que
// só GUARDA os handlers, e cada teste invoca o handler com req/res de mentira
// (mesmo estilo de `complemento-rotas.test.ts` e `middleware.test.ts`). O que
// está mockado é só a BORDA — `../db` (as três tabelas de prazo) e
// `../storage` (eventos, peças, patrocinadores, usuários). O gate de papel
// (`requireRole("admin")`) é o REAL, importado de `./shared`.
//
// PORQUÊ este arquivo, já havendo testes de domínio: `prazo-domain.test.ts`
// prova a REGRA; ele não prova a MONTAGEM. Quatro dos achados da revisão vivem
// exatamente na montagem e são invisíveis para um teste de função pura:
//   • o registro de cobrança (total, histórico com teto, promessa vencida,
//     `houveMovimento` conferido contra o andamento real das peças);
//   • a validação do POST (data irreal, promessa no passado, horizonte, nota);
//   • a faixa "desde ontem", que é um DIFF entre o payload de hoje e o
//     snapshot de um dia anterior;
//   • e a degradação enquanto `npm run db:push` não roda — que é o estado REAL
//     do ambiente hoje: as três tabelas ainda não existem, e a tela do diretor
//     não pode cair por causa disso.
//
// O relógio do processo é congelado: `todayBusinessMs()`/`todayBusinessStr()`
// são chamados DENTRO do handler, então sem congelar o teste passaria a
// depender da hora em que o CI roda (e falharia entre 21h e 00h de Brasília,
// que é exatamente o bug que a âncora existe para evitar).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

// ── Mocks de borda (hoisted: o objeto H existe antes dos imports do módulo) ──
const H = vi.hoisted(() => {
  const h: any = {
    storage: {} as Record<string, any>,
    // As implementações reais são plugadas depois dos imports (precisam dos
    // objetos de tabela do schema). O `db` em si é o MESMO objeto o tempo
    // todo, porque `prazos.ts` captura a referência no import.
    db: {
      select: (...a: any[]) => h.selectImpl(...a),
      insert: (...a: any[]) => h.insertImpl(...a),
    },
    selectImpl: () => { throw new Error("db.select sem implementação"); },
    insertImpl: () => { throw new Error("db.insert sem implementação"); },
    broadcast: (..._a: any[]) => {},
    createAuditLog: async (..._a: any[]) => {},
  };
  return h;
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));

vi.mock("../storage", async () => {
  const real = await vi.importActual<any>("../storage");
  return { ...real, storage: H.storage };
});

vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return {
    ...real,
    // `requireRole` fica REAL de propósito: a rota é admin-only e o gate faz
    // parte do que está sendo testado.
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
  };
});

import { registerPrazoRoutes } from "../routes/prazos";
import { prazoCobrancas, prazoSnapshots, prazoEventSnapshots } from "@shared/schema";
import { businessDayStrToMs } from "../services/prazo-domain";
import type { PrazosPayload } from "@shared/prazos-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Relógio e calendário
// ─────────────────────────────────────────────────────────────────────────────
// 12h de Brasília de 13/08/2026 (quinta-feira). Longe da virada dos dois
// fusos, para que este arquivo teste montagem e não aritmética de fuso — essa
// tem arquivo próprio (`prazo-domain-bordas.test.ts`, bloco T2).
const AGORA = new Date("2026-08-13T15:00:00.000Z");
const HOJE = "2026-08-13";
const DIA_MS = 86400000;

/** "YYYY-MM-DD" deslocado em N dias-calendário. */
function maisDias(base: string, n: number): string {
  return new Date(businessDayStrToMs(base) + n * DIA_MS).toISOString().slice(0, 10);
}
/** Instante ao MEIO-DIA UTC do dia informado — 9h em Brasília, mesmo dia de
 *  negócio. Meia-noite UTC seria 21h do dia ANTERIOR e erraria por um dia. */
const meioDia = (d: string) => new Date(`${d}T12:00:00.000Z`);

// ─────────────────────────────────────────────────────────────────────────────
// Harness de rotas
// ─────────────────────────────────────────────────────────────────────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => {
    rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs);
    return appFalso;
  };
}
registerPrazoRoutes(appFalso);

interface Resposta { status: number; body: any; }

async function chamar(
  chave: string,
  ctx: { body?: any; userRole?: string | null; userId?: string | null; userName?: string } = {},
): Promise<Resposta> {
  const handlers = rotas.get(chave);
  if (!handlers) throw new Error(`Rota não registrada: ${chave}`);

  const temSessao = ctx.userId !== null;
  const req: any = {
    params: {}, query: {}, headers: {},
    body: ctx.body ?? {},
    userName: ctx.userName ?? "Ana Paula",
    session: temSessao
      ? { userId: ctx.userId ?? "u-diretor", userRole: ctx.userRole ?? "admin", userName: ctx.userName ?? "Ana Paula" }
      : {},
  };

  const res: any = { _status: 200, _body: undefined, _done: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  res.send = res.json;

  for (const h of handlers) {
    let chamouNext = false;
    await h(req, res, () => { chamouNext = true; });
    if (res._done || !chamouNext) break;
  }
  return { status: res._status, body: res._body };
}

const GET = "GET /api/prazos";
const POST = "POST /api/prazos/cobrancas";

/** GET que EXIGE 200 — evita que um 500 mascarado vire "campo undefined". */
async function pegarPayload(): Promise<PrazosPayload> {
  const r = await chamar(GET);
  expect(r.status, `GET /api/prazos falhou: ${JSON.stringify(r.body)}`).toBe(200);
  return r.body as PrazosPayload;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mundo em memória
// ─────────────────────────────────────────────────────────────────────────────
interface LinhaCobranca {
  id: string; targetType: string; targetId: string; userName: string;
  promisedFor: string | null; note: string | null; createdAt: Date;
}
interface LinhaEventSnapshot {
  day: string; eventId: string; hasOverdue: boolean; pecasAtrasadas: number;
}

let mundo: {
  eventos: any[];
  pecas: any[];
  patrocinadores: any[];
  usuarios: any[];
  aprovacoes: any[];
  snapshots: any[];
  cobrancas: LinhaCobranca[];
  eventSnapshots: LinhaEventSnapshot[];
  /** Tabelas que ainda NÃO existem no banco (db:push pendente). */
  ausentes: Set<string>;
};

let broadcasts: any[];
let auditorias: any[][];
let seq = 0;

function evento(over: Partial<any> = {}): any {
  seq += 1;
  return {
    id: over.id ?? `ev-${seq}`,
    name: over.name ?? `EVENTO ${seq}`,
    status: "created",
    priority: null,
    startDate: new Date("2026-09-05T00:00:00.000Z"),
    truckDepartureDate: new Date("2026-08-30T00:00:00.000Z"),
    createdBy: null,
    deadlineListaImagens: null,
    deadlineEntregaLayouts: null,
    deadlineAprovacaoLayout: null,
    deadlineRevisaoLista: null,
    deadlineProducaoGrafica: null,
    ...over,
  };
}

function peca(eventId: string, over: Partial<any> = {}): any {
  seq += 1;
  return {
    id: over.id ?? `it-${seq}`,
    eventId,
    displayId: over.displayId ?? `#${1000 + seq}`,
    status: "draft",
    type: "2x1",
    description: null,
    quantity: 1,
    updatedAt: null,
    createdAt: null,
    ...over,
  };
}

/** Cadastra evento + peças de uma vez. */
function cadastrar(ev: any, statusDasPecas: Array<string | Partial<any>> = []): any {
  mundo.eventos.push(ev);
  for (const s of statusDasPecas) {
    mundo.pecas.push(peca(ev.id, typeof s === "string" ? { status: s } : s));
  }
  return ev;
}

// ─────────────────────────────────────────────────────────────────────────────
// db falso: builder encadeável e "thenable", resolvido por TABELA
// ─────────────────────────────────────────────────────────────────────────────
const NOME_TABELA = new Map<any, string>([
  [prazoCobrancas, "prazo_cobrancas"],
  [prazoSnapshots, "prazo_snapshots"],
  [prazoEventSnapshots, "prazo_event_snapshots"],
]);

interface Consulta { tabela: string; limit: number | null; }

/** Dia-base da faixa "desde ontem": o mais recente ANTERIOR a hoje. */
function diaBaseSnapshot(): string | null {
  const dias = Array.from(new Set(mundo.eventSnapshots.map((r) => r.day)))
    .filter((d) => d < HOJE)
    .sort()
    .reverse();
  return dias[0] ?? null;
}

/**
 * Resolve a consulta.
 *
 * NOTA: o mock não interpreta `where`/`orderBy` — ele REPRODUZ o recorte que
 * cada consulta da rota faz (o filtro `day < hoje`, a ordem desc, o dia-base).
 * É deliberado: o que está sob teste é o que a rota FAZ com as linhas, não a
 * tradução para SQL, que é responsabilidade do Drizzle.
 */
function consultar(info: Consulta): any[] {
  if (mundo.ausentes.has(info.tabela)) {
    // A cara real do erro enquanto `npm run db:push` não roda.
    throw new Error(`relation "${info.tabela}" does not exist`);
  }
  switch (info.tabela) {
    case "prazo_snapshots": {
      const anteriores = mundo.snapshots
        .filter((s) => s.day < HOJE)
        .sort((a, b) => b.day.localeCompare(a.day));
      return info.limit === null ? anteriores : anteriores.slice(0, info.limit);
    }
    case "prazo_cobrancas":
      return [...mundo.cobrancas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    case "prazo_event_snapshots": {
      const base = diaBaseSnapshot();
      // Com `.limit()` é a busca do dia-base (projeção `{ day }`); sem, é a
      // leitura do dia inteiro.
      if (info.limit !== null) return base ? [{ day: base }] : [];
      return mundo.eventSnapshots.filter((r) => r.day === base);
    }
    default:
      return [];
  }
}

function criarBuilder(): any {
  const info: Consulta = { tabela: "desconhecida", limit: null };
  const b: any = {
    from(t: any) { info.tabela = NOME_TABELA.get(t) ?? "desconhecida"; return b; },
    where() { return b; },
    orderBy() { return b; },
    limit(n: number) { info.limit = n; return b; },
    // Thenable: `await` em qualquer ponto da cadeia dispara a resolução.
    then(ok: any, erro: any) {
      return new Promise<any[]>((resolve) => resolve(consultar(info))).then(ok, erro);
    },
  };
  return b;
}

H.selectImpl = () => criarBuilder();
H.insertImpl = (t: any) => ({
  values: (v: any) => ({
    returning: async () => {
      const tabela = NOME_TABELA.get(t);
      if (mundo.ausentes.has(tabela!)) throw new Error(`relation "${tabela}" does not exist`);
      seq += 1;
      const linha: LinhaCobranca = {
        id: `cob-${seq}`, promisedFor: null, note: null, createdAt: AGORA, ...v,
      };
      mundo.cobrancas.push(linha);
      return [linha];
    },
  }),
});

// `Object.assign` e NÃO `H.storage = {...}`: a factory do `vi.mock` já
// capturou ESTA referência de objeto, então trocá-la deixaria a rota com o
// `{}` original.
Object.assign(H.storage, {
  getAllEvents: async () => mundo.eventos,
  getAllSponsors: async () => mundo.patrocinadores,
  getAllUsers: async () => mundo.usuarios,
  getOpenItemSponsorApprovals: async () => mundo.aprovacoes,
  getItemsByEvents: async (ids: string[]) => mundo.pecas.filter((p) => ids.includes(p.eventId)),
  getEvent: async (id: string) => mundo.eventos.find((e) => e.id === id),
  getSponsor: async (id: string) => mundo.patrocinadores.find((s) => s.id === id),
});
H.broadcast = (...a: any[]) => { broadcasts.push(a[0]); };
H.createAuditLog = async (...a: any[]) => { auditorias.push(a); };

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});
afterAll(() => { vi.useRealTimers(); });

beforeEach(() => {
  seq = 0;
  broadcasts = [];
  auditorias = [];
  mundo = {
    eventos: [], pecas: [], patrocinadores: [], usuarios: [], aprovacoes: [],
    snapshots: [], cobrancas: [], eventSnapshots: [], ausentes: new Set(),
  };
});

// ═════════════════════════════════════════════════════════════════════════════
// Gate de papel — a tela é do DIRETOR
// ═════════════════════════════════════════════════════════════════════════════
describe("gate admin-only", () => {
  it("sem sessão devolve 401 e sem papel de admin devolve 403, nas duas rotas", async () => {
    for (const rota of [GET, POST]) {
      expect((await chamar(rota, { userId: null })).status).toBe(401);
      expect((await chamar(rota, { userRole: "operador" })).status).toBe(403);
      expect((await chamar(rota, { userRole: "arte" })).status).toBe(403);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T3/T6/T7/T11/T15 — payload e placar montados de ponta a ponta
// ═════════════════════════════════════════════════════════════════════════════
describe("GET /api/prazos — payload e placar", () => {
  it("T3 — 1 peça esquecida no rascunho trava as 5 etapas, com 39 já na produção", async () => {
    cadastrar(evento({ id: "E1" }), ["draft", ...Array(39).fill("ready_for_production")]);
    const p = await pegarPayload();

    const ev = p.events.find((e) => e.id === "E1")!;
    expect(ev.totalItems).toBe(40);
    // NENHUMA etapa concluída: a pendência é ACUMULADA, não direta.
    expect(ev.stages.every((s) => s.state !== "done")).toBe(true);
    expect(ev.stages.every((s) => s.pendingCount > 0)).toBe(true);
    // Direta: 1 na etapa 0, 39 na etapa 4. Simplificar para contagem direta
    // deixaria as etapas 1..3 verdes com uma peça ainda no rascunho.
    expect(ev.stages[0].directCount).toBe(1);
    expect(ev.stages[4].directCount).toBe(39);
    expect(ev.stages[0].pendingCount).toBe(1);
    expect(ev.stages[4].pendingCount).toBe(40);
    expect(ev.categoria).toBe("atrasado");
  });

  it("T6 — evento SEM peças entra em kpis.semPecas e em nenhum outro cartão", async () => {
    cadastrar(evento({ id: "VAZIO" }), []);
    const p = await pegarPayload();

    const ev = p.events.find((e) => e.id === "VAZIO")!;
    expect(ev.categoria).toBe("semPecas");
    expect(ev.totalItems).toBe(0);
    expect(ev.stages.map((s) => s.state)).toEqual(Array(5).fill("upcoming"));
    expect(ev.pecasEmAtraso).toBe(0);
    expect(ev.piorAtrasoDias).toBe(0);

    expect(p.kpis.semPecas).toBe(1);
    expect(p.kpis.emDia).toBe(0);
    expect(p.kpis.atrasados).toBe(0);
    expect(p.kpis.pecasAtrasadas).toBe(0);
  });

  it("T7 — data inválida vira categoria própria, sem atraso e sem risco", async () => {
    cadastrar(evento({ id: "TYPO", truckDepartureDate: new Date("0206-05-13T00:00:00.000Z") }),
      Array(30).fill("draft"));
    const p = await pegarPayload();

    const ev = p.events.find((e) => e.id === "TYPO")!;
    expect(ev.invalidDate).toBe(true);
    expect(ev.categoria).toBe("dataInvalida");
    expect(ev.stages.some((s) => s.state === "overdue")).toBe(false);
    expect(ev.diasParaSaida).toBeNull();
    // 30 peças no gate NÃO acendem risco: sem data confiável não há projeção.
    expect(ev.riskCritical).toBe(false);
    expect(p.kpis.invalidCount).toBe(1);
  });

  it("T7 — data inválida E zero peças cai em 'semPecas', e a identidade do placar fecha", async () => {
    cadastrar(evento({ id: "A" }), ["draft"]);                                              // atrasado
    cadastrar(evento({ id: "B", truckDepartureDate: new Date("2026-12-20T00:00:00.000Z") }), ["draft"]); // em dia
    cadastrar(evento({ id: "C" }), []);                                                     // sem peças
    cadastrar(evento({ id: "D", truckDepartureDate: new Date("0206-05-13T00:00:00.000Z") }), ["draft"]); // inválida
    cadastrar(evento({ id: "E", truckDepartureDate: new Date("0206-05-13T00:00:00.000Z") }), []);        // ambos

    const p = await pegarPayload();
    const porId = new Map(p.events.map((e) => [e.id, e]));

    // Precedência: sem peça nem existe funil a corrigir.
    expect(porId.get("E")!.categoria).toBe("semPecas");
    expect(porId.get("E")!.invalidDate).toBe(true);

    const { atrasados, semPecas, invalidCount, emDia } = p.kpis;
    // A identidade que impede o `emDia` NEGATIVO por dupla subtração — o
    // evento "E" era descontado duas vezes na fórmula antiga.
    expect(atrasados + semPecas + invalidCount + emDia).toBe(p.events.length);
    expect({ atrasados, semPecas, invalidCount, emDia })
      .toEqual({ atrasados: 1, semPecas: 2, invalidCount: 1, emDia: 1 });
  });

  it("T11 — a soma dos pecasEmAtraso é exatamente kpis.pecasAtrasadas", async () => {
    // Duas etapas vencidas no mesmo evento: offset -41 põe a etapa 0 em 20/07
    // (segunda, 24 dias vencida) e o default -20 põe a etapa 1 em 10/08
    // (segunda, 3 dias vencida).
    cadastrar(evento({ id: "DUAS", deadlineListaImagens: -41 }),
      ["draft", "draft", "awaiting_submission", "awaiting_submission", "awaiting_submission"]);
    cadastrar(evento({ id: "OUTRO" }), ["draft"]);
    cadastrar(evento({ id: "LIMPO", truckDepartureDate: new Date("2026-12-20T00:00:00.000Z") }), ["draft"]);

    const p = await pegarPayload();
    const duas = p.events.find((e) => e.id === "DUAS")!;

    const vencidas = duas.stages.filter((s) => s.state === "overdue");
    expect(vencidas.map((s) => s.diffDays)).toEqual([-24, -3]);
    // Vale a acumulada da etapa vencida MAIS AVANÇADA (5), nunca a soma (2+5).
    expect(duas.pecasEmAtraso).toBe(5);
    expect(duas.pecasEmAtraso).not.toBe(7);
    expect(duas.piorAtrasoDias).toBe(24);

    // Card e placar reconciliam — é o que impede a tela de se contradizer.
    const soma = p.events.reduce((acc, e) => acc + e.pecasEmAtraso, 0);
    expect(p.kpis.pecasAtrasadas).toBe(soma);
    expect(p.kpis.pecasAtrasadas).toBe(5 + 1);
  });

  it("T15 — saidas7d conta 0 e 7 dias, ignora -1, 8 e data inválida", async () => {
    cadastrar(evento({ id: "HOJE", truckDepartureDate: new Date(`${HOJE}T00:00:00.000Z`) }), ["draft"]);
    cadastrar(evento({ id: "SETE", truckDepartureDate: new Date(`${maisDias(HOJE, 7)}T00:00:00.000Z`) }), ["draft"]);
    cadastrar(evento({ id: "ONTEM", truckDepartureDate: new Date(`${maisDias(HOJE, -1)}T00:00:00.000Z`) }), ["draft"]);
    cadastrar(evento({ id: "OITO", truckDepartureDate: new Date(`${maisDias(HOJE, 8)}T00:00:00.000Z`) }), ["draft"]);
    cadastrar(evento({ id: "INVAL", truckDepartureDate: new Date("0206-05-13T00:00:00.000Z") }), ["draft"]);

    const p = await pegarPayload();
    const diasPorId = new Map(p.events.map((e) => [e.id, e.diasParaSaida]));
    // Mesma âncora do semáforo — o `today` do payload é a fonte única.
    expect(p.today).toBe(HOJE);
    expect(diasPorId.get("HOJE")).toBe(0);
    expect(diasPorId.get("SETE")).toBe(7);
    expect(diasPorId.get("ONTEM")).toBe(-1);
    expect(diasPorId.get("OITO")).toBe(8);
    expect(diasPorId.get("INVAL")).toBeNull();

    expect(p.kpis.saidas7d).toBe(2);
  });

  it("o payload publica a âncora e os metadados de etapa que o cliente consome", async () => {
    cadastrar(evento({ id: "X" }), ["draft"]);
    const p = await pegarPayload();
    expect(p.today).toBe(HOJE);
    expect(p.stageMeta.map((m) => m.key))
      .toEqual(["listaImagens", "layouts", "aprovacao", "revisao", "producao"]);
    expect(typeof p.generatedAt).toBe("string");
  });

  it("T12 — o servidor devolve os eventos ordenados pela saída mais próxima", async () => {
    cadastrar(evento({ id: "TARDE", truckDepartureDate: new Date("2026-09-01T00:00:00.000Z") }), ["draft"]);
    cadastrar(evento({ id: "CEDO", truckDepartureDate: new Date("2026-08-15T00:00:00.000Z") }), ["draft"]);
    cadastrar(evento({ id: "MEIO", truckDepartureDate: new Date("2026-08-20T00:00:00.000Z") }), ["draft"]);
    const p = await pegarPayload();
    expect(p.events.map((e) => e.id)).toEqual(["CEDO", "MEIO", "TARDE"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T8 — quem SAI do payload
// ═════════════════════════════════════════════════════════════════════════════
describe("T8 — exclusão do payload", () => {
  it("evento 'completed' sai; evento com TODAS as peças entregues sai", async () => {
    cadastrar(evento({ id: "CONCLUIDO", status: "completed" }), ["draft"]);
    cadastrar(evento({ id: "ENTREGUE" }), ["delivered", "delivered"]);
    cadastrar(evento({ id: "LEGADO" }), ["entregue"]);          // grafia legada conta igual
    cadastrar(evento({ id: "PARCIAL" }), ["delivered", "draft"]);

    const p = await pegarPayload();
    expect(p.events.map((e) => e.id)).toEqual(["PARCIAL"]);
  });

  it("evento que começa HOJE permanece; o que começou ONTEM sai (dia-calendário, não instante)", async () => {
    // Timestamps à MEIA-NOITE UTC de propósito: é como as datas de evento são
    // gravadas, e é o caso em que comparar instantes (em vez de dias) fazia o
    // evento sumir da tela às 21h da véspera em Brasília — as horas de crise.
    cadastrar(evento({ id: "COMECA_HOJE", startDate: new Date(`${HOJE}T00:00:00.000Z`) }), ["draft"]);
    cadastrar(evento({ id: "COMECOU_ONTEM", startDate: new Date(`${maisDias(HOJE, -1)}T00:00:00.000Z`) }), ["draft"]);

    const p = await pegarPayload();
    expect(p.events.map((e) => e.id)).toEqual(["COMECA_HOJE"]);
  });

  it("evento SEM peças NÃO sai por 'tudo entregue' — é o pior caso do negócio", async () => {
    // O guard `eventItems.length > 0`: sem ele, `[].every(...)` é `true` e o
    // evento a 17 dias da saída com ZERO peças sumiria em silêncio.
    cadastrar(evento({ id: "VAZIO" }), []);
    const p = await pegarPayload();
    expect(p.events.map((e) => e.id)).toEqual(["VAZIO"]);
    expect(p.kpis.semPecas).toBe(1);
  });

  it("peças fora do funil não salvam nem condenam o evento (T9 na montagem)", async () => {
    // Só canceladas/excluídas/arquivadas → o evento é "semPecas", não some.
    cadastrar(evento({ id: "SO_LIXO" }), ["canceled", "deleted", "archived"]);
    const p = await pegarPayload();
    const ev = p.events.find((e) => e.id === "SO_LIXO")!;
    expect(ev.totalItems).toBe(0);
    expect(ev.deliveredItems).toBe(0);
    expect(ev.pendingItems).toEqual([]);
    expect(ev.categoria).toBe("semPecas");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T14 — ranking de patrocinadores (montagem cross-evento)
// ═════════════════════════════════════════════════════════════════════════════
describe("T14 — sponsorDelays", () => {
  beforeEach(() => {
    mundo.usuarios = [{ id: "u-exec", name: "Ana Paula" }];
    mundo.patrocinadores = [
      { id: "sp-1", name: "Coca-Cola", accountExecutiveId: "u-exec" },
      { id: "sp-2", name: "Ambev", accountExecutiveId: null },
    ];
  });

  it("só o patrocinador COM A BOLA entra no ranking, com executivo de conta e peças", async () => {
    cadastrar(evento({ id: "EV1", name: "COPA NORTE" }), [
      { id: "i1", displayId: "#501", status: "awaiting_approval" },
      { id: "i2", displayId: "#502", status: "awaiting_approval" },
    ]);
    mundo.aprovacoes = [
      // Bola com o patrocinador (pending) há 7 dias.
      { itemId: "i1", sponsorId: "sp-1", status: "pending", createdAt: meioDia("2026-08-06"), updatedAt: null },
      // Bola com a ARTE (reprovou): NÃO é cobrado no ranking.
      { itemId: "i1", sponsorId: "sp-2", status: "awaiting_arte", createdAt: meioDia("2026-08-01"), updatedAt: null },
      // Reenvio: criado há 24 dias, devolvido ao patrocinador há 3.
      { itemId: "i2", sponsorId: "sp-1", status: "pending",
        createdAt: meioDia("2026-07-20"), updatedAt: meioDia("2026-08-10") },
    ];

    const p = await pegarPayload();
    expect(p.sponsorDelays).toHaveLength(1);
    const [sp] = p.sponsorDelays;
    expect(sp).toMatchObject({
      sponsorId: "sp-1", name: "Coca-Cola", pendingCount: 2, eventCount: 1,
      executivoConta: "Ana Paula",
    });
    // maxDays vem de `updatedAt ?? createdAt`: 7 (não 24, que cobraria o
    // patrocinador por dias em que a bola estava com a Arte).
    expect(sp.maxDays).toBe(7);
    // Lista de cobrança: pior primeiro.
    expect(sp.items.map((i) => [i.displayId, i.days])).toEqual([["#501", 7], ["#502", 3]]);

    // A Ambev aparece no drill como "arte", mas fora do ranking.
    const i1 = p.events[0].pendingItems.find((it) => it.id === "i1")!;
    expect(i1.sponsors).toEqual([
      { name: "Coca-Cola", days: 7, holder: "sponsor" },
      { name: "Ambev", days: 12, holder: "arte" },
    ]);
  });

  it("o ranking soma entre eventos e ordena por mais peças, desempatando por espera", async () => {
    cadastrar(evento({ id: "EV1", name: "COPA A" }), [{ id: "i1", status: "awaiting_approval" }]);
    cadastrar(evento({ id: "EV2", name: "COPA B" }), [
      { id: "i2", status: "awaiting_approval" }, { id: "i3", status: "awaiting_approval" },
    ]);
    mundo.aprovacoes = [
      { itemId: "i1", sponsorId: "sp-2", status: "pending", createdAt: meioDia("2026-07-14"), updatedAt: null },
      { itemId: "i2", sponsorId: "sp-1", status: "pending", createdAt: meioDia("2026-08-11"), updatedAt: null },
      { itemId: "i3", sponsorId: "sp-1", status: "new_version_pending", createdAt: meioDia("2026-08-12"), updatedAt: null },
    ];

    const p = await pegarPayload();
    // sp-1 tem 2 peças (ganha), embora sp-2 espere há muito mais tempo.
    expect(p.sponsorDelays.map((s) => [s.sponsorId, s.pendingCount, s.maxDays]))
      .toEqual([["sp-1", 2, 2], ["sp-2", 1, 30]]);
    expect(p.sponsorDelays[0].eventCount).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T16 — registro de cobrança
// ═════════════════════════════════════════════════════════════════════════════
describe("T16 — cobranças no payload", () => {
  function cobranca(over: Partial<LinhaCobranca> = {}): LinhaCobranca {
    seq += 1;
    return {
      id: `c-${seq}`, targetType: "event", targetId: "EV1", userName: "Ana Paula",
      promisedFor: null, note: null, createdAt: meioDia("2026-08-08"), ...over,
    };
  }

  it("total conta TODAS as linhas do alvo, mas o histórico tem teto de 5, em ordem desc", async () => {
    cadastrar(evento({ id: "EV1" }), ["draft"]);
    // 7 cobranças, uma por dia de 02/08 a 08/08.
    for (let i = 0; i < 7; i++) {
      mundo.cobrancas.push(cobranca({ userName: `Diretor ${i}`, createdAt: meioDia(maisDias("2026-08-02", i)) }));
    }

    const p = await pegarPayload();
    const c = p.cobrancas["event:EV1"]!;
    expect(c.total).toBe(7);
    // O modal mostra a RÉGUA da pressão ("3 cobranças em 12 dias"), não o log
    // completo — o log completo é o audit log.
    expect(c.historico).toHaveLength(5);
    // Mais recente primeiro, e o topo do histórico é a mesma da capa.
    expect(c.historico.map((h) => h.userName))
      .toEqual(["Diretor 6", "Diretor 5", "Diretor 4", "Diretor 3", "Diretor 2"]);
    expect(c.userName).toBe("Diretor 6");
    expect(c.daysAgo).toBe(5);   // 08/08 → 13/08
    expect(c.historico.map((h) => h.daysAgo)).toEqual([5, 6, 7, 8, 9]);
  });

  it("promessaDiasRestantes: negativo quando vencida, 0 quando é hoje, positivo à frente", async () => {
    cadastrar(evento({ id: "VENCIDA" }), ["draft"]);
    cadastrar(evento({ id: "HOJE" }), ["draft"]);
    cadastrar(evento({ id: "FUTURA" }), ["draft"]);
    mundo.cobrancas.push(
      cobranca({ targetId: "VENCIDA", promisedFor: maisDias(HOJE, -3) }),
      cobranca({ targetId: "HOJE", promisedFor: HOJE }),
      cobranca({ targetId: "FUTURA", promisedFor: maisDias(HOJE, 4) }),
    );

    const p = await pegarPayload();
    // A conta é feita no SERVIDOR, com a âncora do negócio: o cliente não pode
    // decidir "promessa vencida" com o relógio do navegador.
    expect(p.cobrancas["event:VENCIDA"]!.promessaDiasRestantes).toBe(-3);
    expect(p.cobrancas["event:HOJE"]!.promessaDiasRestantes).toBe(0);
    expect(p.cobrancas["event:FUTURA"]!.promessaDiasRestantes).toBe(4);
    // Sem promessa, o campo é null (não 0, que afirmaria "vence hoje").
    cadastrar(evento({ id: "SEM" }), ["draft"]);
    mundo.cobrancas.push(cobranca({ targetId: "SEM" }));
    const p2 = await pegarPayload();
    expect(p2.cobrancas["event:SEM"]!.promessaDiasRestantes).toBeNull();
    expect(p2.cobrancas["event:SEM"]!.promessaData).toBeNull();
  });

  it("houveMovimento é TRUE quando alguma peça andou depois da cobrança", async () => {
    // Cobrança há 5 dias (08/08); uma peça tocada há 2 dias (11/08).
    cadastrar(evento({ id: "EV1" }), [
      { status: "draft", updatedAt: meioDia("2026-08-01") },
      { status: "draft", updatedAt: meioDia("2026-08-11") },
    ]);
    mundo.cobrancas.push(cobranca());

    const p = await pegarPayload();
    const c = p.cobrancas["event:EV1"]!;
    expect(c.daysAgo).toBe(5);
    expect(c.houveMovimento).toBe(true);
  });

  it("houveMovimento é FALSE quando TODAS as peças estão paradas desde antes da cobrança", async () => {
    cadastrar(evento({ id: "EV1" }), [
      { status: "draft", updatedAt: meioDia("2026-08-01") },   // 12 dias
      { status: "draft", updatedAt: meioDia("2026-08-08") },   // 5 dias = igual, não é movimento
    ]);
    mundo.cobrancas.push(cobranca());

    const p = await pegarPayload();
    // "cobrado há 5d — segue parado" agora é uma afirmação CONFERIDA. Ela
    // aparece com nome e sobrenome de quem cobrou: quando é falsa, gera
    // cobrança injusta ou ensina o diretor a ignorar o campo.
    expect(p.cobrancas["event:EV1"]!.houveMovimento).toBe(false);
  });

  it("alvo 'sponsor' recebe chave própria e houveMovimento fica null", async () => {
    cadastrar(evento({ id: "EV1" }), ["draft"]);
    mundo.patrocinadores = [{ id: "sp-1", name: "Coca-Cola", accountExecutiveId: null }];
    mundo.cobrancas.push(cobranca({ targetType: "sponsor", targetId: "sp-1", note: "prometeu olhar hoje" }));

    const p = await pegarPayload();
    const c = p.cobrancas["sponsor:sp-1"]!;
    expect(c.total).toBe(1);
    expect(c.nota).toBe("prometeu olhar hoje");
    // Não há "peças de um patrocinador" neste recorte para comparar.
    expect(c.houveMovimento).toBeNull();
    expect(p.cobrancas["event:sp-1"]).toBeUndefined();
  });

  it("linha legada com targetType fora do vocabulário é ignorada, não vira chave fantasma", async () => {
    cadastrar(evento({ id: "EV1" }), ["draft"]);
    mundo.cobrancas.push(cobranca({ targetType: "pedido", targetId: "EV1" }));
    const p = await pegarPayload();
    // Sem a normalização, essa linha criaria uma chave que o cliente nunca
    // consulta — e a cobrança sumiria do placar sem aviso.
    expect(Object.keys(p.cobrancas)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T17 — validação do POST
// ═════════════════════════════════════════════════════════════════════════════
describe("T17 — POST /api/prazos/cobrancas", () => {
  beforeEach(() => {
    cadastrar(evento({ id: "EV1" }), ["draft"]);
    mundo.patrocinadores = [{ id: "sp-1", name: "Coca-Cola", accountExecutiveId: null }];
  });

  const base = { targetType: "event", targetId: "EV1" };

  it("registra a cobrança, grava audit log e faz broadcast", async () => {
    const r = await chamar(POST, { body: { ...base, promisedFor: maisDias(HOJE, 2), note: "  falei com o Rafael  " } });
    expect(r.status).toBe(200);
    expect(mundo.cobrancas).toHaveLength(1);
    expect(mundo.cobrancas[0].note).toBe("falei com o Rafael"); // trim aplicado

    // Regra da casa: toda escrita grava audit log E faz broadcast — sem o
    // broadcast, dois diretores ligam para o mesmo responsável no mesmo dia.
    expect(auditorias).toHaveLength(1);
    expect(auditorias[0].slice(0, 4)).toEqual(["Ana Paula", "cobranca_registrada", "event", "EV1"]);
    expect(auditorias[0][4]).toContain("falei com o Rafael");
    expect(broadcasts).toEqual([{ type: "prazo_cobranca", targetType: "event", targetId: "EV1" }]);
  });

  it("aceita cobrança sem promessa e sem nota (o caso mais comum)", async () => {
    const r = await chamar(POST, { body: base });
    expect(r.status).toBe(200);
    expect(mundo.cobrancas[0].promisedFor).toBeNull();
    expect(mundo.cobrancas[0].note).toBeNull();
  });

  it("promisedFor fora do formato → 400", async () => {
    for (const ruim of ["13/08/2026", "2026-8-13", "amanhã", "20260813"]) {
      const r = await chamar(POST, { body: { ...base, promisedFor: ruim } });
      expect(r.status, `promisedFor=${ruim}`).toBe(400);
      expect(r.body.error).toMatch(/formato/i);
    }
    expect(mundo.cobrancas).toEqual([]);
  });

  it("data que o regex aceita mas o calendário não (2026-02-31) → 400", async () => {
    const r = await chamar(POST, { body: { ...base, promisedFor: "2026-02-31" } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/não existe no calendário/i);
    expect(mundo.cobrancas).toEqual([]);
  });

  it("promessa no passado → 400; promessa para HOJE é válida", async () => {
    const passado = await chamar(POST, { body: { ...base, promisedFor: maisDias(HOJE, -1) } });
    expect(passado.status).toBe(400);
    expect(passado.body.error).toMatch(/data passada/i);

    const hoje = await chamar(POST, { body: { ...base, promisedFor: HOJE } });
    expect(hoje.status).toBe(200);
  });

  it("promessa além de hoje+180 → 400; exatamente hoje+180 passa", async () => {
    // O horizonte existe porque uma promessa para 2027 é typo de digitação, e
    // um typo aqui envenena o rótulo "promessa vencida" naquele alvo para
    // sempre.
    const longe = await chamar(POST, { body: { ...base, promisedFor: maisDias(HOJE, 181) } });
    expect(longe.status).toBe(400);
    expect(longe.body.error).toMatch(/180 dias/);

    const limite = await chamar(POST, { body: { ...base, promisedFor: maisDias(HOJE, 180) } });
    expect(limite.status).toBe(200);
  });

  it("nota acima de 280 caracteres → 400; exatamente 280 passa", async () => {
    const r = await chamar(POST, { body: { ...base, note: "a".repeat(281) } });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/280/);

    expect((await chamar(POST, { body: { ...base, note: "a".repeat(280) } })).status).toBe(200);
  });

  it("targetType fora de event|sponsor → 400", async () => {
    for (const ruim of ["user", "item", "", null, undefined]) {
      const r = await chamar(POST, { body: { targetType: ruim, targetId: "EV1" } });
      expect(r.status, `targetType=${String(ruim)}`).toBe(400);
    }
    expect(mundo.cobrancas).toEqual([]);
  });

  it("targetId vazio → 400", async () => {
    expect((await chamar(POST, { body: { targetType: "event", targetId: "" } })).status).toBe(400);
  });

  it("alvo inexistente → 404, nos dois tipos", async () => {
    const ev = await chamar(POST, { body: { targetType: "event", targetId: "nao-existe" } });
    expect(ev.status).toBe(404);
    expect(ev.body.error).toMatch(/evento não existe/i);

    const sp = await chamar(POST, { body: { targetType: "sponsor", targetId: "nao-existe" } });
    expect(sp.status).toBe(404);
    expect(sp.body.error).toMatch(/patrocinador não existe/i);

    // Nenhuma linha órfã e nenhum audit log apontando para nada — num recurso
    // cujo valor inteiro é ser verdadeiro.
    expect(mundo.cobrancas).toEqual([]);
    expect(auditorias).toEqual([]);
    expect(broadcasts).toEqual([]);
  });

  it("nenhuma requisição rejeitada grava audit log ou dispara broadcast", async () => {
    await chamar(POST, { body: { ...base, promisedFor: "2026-02-31" } });
    await chamar(POST, { body: { ...base, note: "a".repeat(400) } });
    await chamar(POST, { body: { targetType: "user", targetId: "EV1" } });
    expect(auditorias).toEqual([]);
    expect(broadcasts).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T18 — "o que mudou desde ontem"
// ═════════════════════════════════════════════════════════════════════════════
describe("T18 — desdeOntem", () => {
  const ONTEM = maisDias(HOJE, -1);

  it("classifica entrada e saída do atraso, ignora quem sumiu do payload e tem piso 0", async () => {
    // Hoje: ENTROU está atrasado (peça no rascunho, marcos vencidos);
    // SAIU está em dia (saída distante); SUMIU foi concluído e não vem no
    // payload; NOVO não tem linha no dia base.
    cadastrar(evento({ id: "ENTROU", name: "COPA NORTE" }), ["draft"]);
    cadastrar(evento({ id: "SAIU", name: "COPA SUL", truckDepartureDate: new Date("2026-12-20T00:00:00.000Z") }), ["draft"]);
    cadastrar(evento({ id: "SUMIU", name: "COPA LESTE", status: "completed" }), ["draft"]);
    cadastrar(evento({ id: "NOVO", name: "COPA OESTE" }), ["draft"]);

    mundo.eventSnapshots = [
      { day: ONTEM, eventId: "ENTROU", hasOverdue: false, pecasAtrasadas: 0 },
      { day: ONTEM, eventId: "SAIU", hasOverdue: true, pecasAtrasadas: 4 },
      { day: ONTEM, eventId: "SUMIU", hasOverdue: true, pecasAtrasadas: 6 },
    ];

    const p = await pegarPayload();
    expect(p.desdeOntem).not.toBeNull();
    const d = p.desdeOntem!;
    expect(d.baseDay).toBe(ONTEM);
    expect(d.entraramEmAtraso).toEqual([{ id: "ENTROU", name: "COPA NORTE" }]);
    expect(d.sairamDoAtraso.map((e) => e.id)).toEqual(["SAIU"]);
    // SUMIU não aparece em nenhum dos dois: sem estar no payload de hoje não
    // dá para afirmar TRANSIÇÃO sobre ele. NOVO também não — não estava na
    // foto de ontem, e "cadastro novo" não é "entrou em atraso".
    expect([...d.entraramEmAtraso, ...d.sairamDoAtraso].map((e) => e.id)).not.toContain("SUMIU");
    expect([...d.entraramEmAtraso, ...d.sairamDoAtraso].map((e) => e.id)).not.toContain("NOVO");
  });

  it("pecasDestravadas tem piso 0 — 'destravou -8 peças' não é frase de gestão", async () => {
    // Ontem 1 peça atrasada; hoje 2 eventos com 1 peça atrasada cada → saldo
    // PIOROU. Quem conta essa história é `entraramEmAtraso`, não um negativo.
    cadastrar(evento({ id: "A" }), ["draft"]);
    cadastrar(evento({ id: "B" }), ["draft"]);
    mundo.eventSnapshots = [
      { day: ONTEM, eventId: "A", hasOverdue: true, pecasAtrasadas: 1 },
      { day: ONTEM, eventId: "B", hasOverdue: false, pecasAtrasadas: 0 },
    ];

    const p = await pegarPayload();
    expect(p.kpis.pecasAtrasadas).toBe(2);
    expect(p.desdeOntem!.pecasDestravadas).toBe(0);
  });

  it("conta as peças destravadas quando o saldo melhora", async () => {
    cadastrar(evento({ id: "A" }), ["draft"]);
    mundo.eventSnapshots = [{ day: ONTEM, eventId: "A", hasOverdue: true, pecasAtrasadas: 9 }];
    const p = await pegarPayload();
    expect(p.desdeOntem!.pecasDestravadas).toBe(8); // 9 → 1
  });

  it("SEM snapshot anterior o bloco é null — nunca zero, que afirmaria 'nada mudou'", async () => {
    cadastrar(evento({ id: "A" }), ["draft"]);
    expect((await pegarPayload()).desdeOntem).toBeNull();

    // Snapshot do PRÓPRIO dia também não serve de base (a consulta é day < hoje).
    mundo.eventSnapshots = [{ day: HOJE, eventId: "A", hasOverdue: false, pecasAtrasadas: 0 }];
    expect((await pegarPayload()).desdeOntem).toBeNull();
  });

  it("o dia-base é o último ANTERIOR a hoje, não necessariamente ontem (segunda compara com sexta)", async () => {
    const SEXTA = maisDias(HOJE, -3);
    cadastrar(evento({ id: "A" }), ["draft"]);
    mundo.eventSnapshots = [
      { day: maisDias(HOJE, -9), eventId: "A", hasOverdue: false, pecasAtrasadas: 0 },
      { day: SEXTA, eventId: "A", hasOverdue: false, pecasAtrasadas: 0 },
    ];
    const p = await pegarPayload();
    // A UI nomeia o dia em vez de cravar "ontem" justamente por causa disto.
    expect(p.desdeOntem!.baseDay).toBe(SEXTA);
    expect(p.desdeOntem!.entraramEmAtraso.map((e) => e.id)).toEqual(["A"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T18b — tendência ▲▼ (mesma família: leitura de snapshot)
// ═════════════════════════════════════════════════════════════════════════════
describe("trend", () => {
  it("compara com o snapshot anterior mais recente e aceita delta negativo", async () => {
    cadastrar(evento({ id: "A" }), ["draft"]);   // atrasado, 1 peça
    mundo.snapshots = [
      { day: maisDias(HOJE, -5), atrasados: 99, saidas7d: 99, pecasAtrasadas: 99, emDia: 99 },
      { day: maisDias(HOJE, -1), atrasados: 4, saidas7d: 2, pecasAtrasadas: 7, emDia: 3 },
    ];
    const p = await pegarPayload();
    expect(p.trend).toEqual({ atrasados: 1 - 4, saidas7d: 0 - 2, pecasAtrasadas: 1 - 7, emDia: 0 - 3 });
  });

  it("sem snapshot anterior, trend é null", async () => {
    cadastrar(evento({ id: "A" }), ["draft"]);
    expect((await pegarPayload()).trend).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// T19 — degradação enquanto `npm run db:push` não roda
//
// Este é o estado REAL do ambiente hoje: as três tabelas de prazo ainda não
// existem. A tela do diretor não pode cair por causa disso — e o que ela perde
// tem que ser exatamente os três blocos opcionais, nada do núcleo.
// ═════════════════════════════════════════════════════════════════════════════
describe("T19 — as três tabelas ausentes", () => {
  let erros: any;
  beforeEach(() => {
    // O handler loga o motivo por bloco; silenciamos para não poluir a saída,
    // mas conferimos que o diagnóstico É emitido (é o que diz ao dono o que
    // fazer).
    erros = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => { vi.restoreAllMocks(); });

  it("responde 200 com events e kpis completos; trend/cobrancas/desdeOntem degradam", async () => {
    mundo.ausentes = new Set(["prazo_snapshots", "prazo_cobrancas", "prazo_event_snapshots"]);
    cadastrar(evento({ id: "A" }), ["draft", "draft"]);
    cadastrar(evento({ id: "B" }), []);

    const p = await pegarPayload();

    // Núcleo INTEIRO: é o que responde "o que está atrasado".
    expect(p.events).toHaveLength(2);
    expect(p.events.find((e) => e.id === "A")!.categoria).toBe("atrasado");
    expect(p.kpis).toEqual({
      atrasados: 1, saidas7d: 0, pecasAtrasadas: 2, emDia: 0, invalidCount: 0, semPecas: 1,
    });
    expect(p.today).toBe(HOJE);
    expect(p.stageMeta).toHaveLength(5);

    // Opcionais degradados — e `{}`/`null`, nunca `undefined` (o contrato
    // promete a chave, e o cliente checa presença).
    expect(p.trend).toBeNull();
    expect(p.cobrancas).toEqual({});
    expect(p.desdeOntem).toBeNull();

    // O log diz ao dono exatamente o que fazer.
    const mensagens = erros.mock.calls.map((c: any[]) => String(c[0])).join(" | ");
    expect(mensagens).toContain("prazo_snapshots");
    expect(mensagens).toContain("prazo_cobrancas");
    expect(mensagens).toContain("prazo_event_snapshots");
    expect(mensagens).toContain("db:push");
  });

  it("cada tabela degrada SOZINHA — a ausência de uma não derruba as outras", async () => {
    mundo.ausentes = new Set(["prazo_cobrancas"]);
    cadastrar(evento({ id: "A" }), ["draft"]);
    mundo.snapshots = [{ day: maisDias(HOJE, -1), atrasados: 0, saidas7d: 0, pecasAtrasadas: 0, emDia: 0 }];
    mundo.eventSnapshots = [{ day: maisDias(HOJE, -1), eventId: "A", hasOverdue: false, pecasAtrasadas: 0 }];

    const p = await pegarPayload();
    expect(p.cobrancas).toEqual({});
    expect(p.trend).not.toBeNull();
    expect(p.desdeOntem).not.toBeNull();
    expect(p.desdeOntem!.entraramEmAtraso.map((e) => e.id)).toEqual(["A"]);
  });

  it("o POST de cobrança devolve 500 com instrução acionável, sem inventar sucesso", async () => {
    mundo.ausentes = new Set(["prazo_cobrancas"]);
    cadastrar(evento({ id: "EV1" }), ["draft"]);
    const r = await chamar(POST, { body: { targetType: "event", targetId: "EV1" } });
    expect(r.status).toBe(500);
    expect(r.body.error).toMatch(/db:push/);
    expect(broadcasts).toEqual([]);
  });
});
