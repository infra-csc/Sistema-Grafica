// ─────────────────────────────────────────────────────────────────────────────
// PRAZO DO MOLDE NO EVENTO (dono, 22/09).
//
// "Vamos cadastrar o prazo (opcional) no evento: o solicitante coloca esse
// prazo para o MOLDE, apenas se tiver molde; ele seleciona no Eventos; mas
// esse prazo é apenas para o fluxo, NÃO entra na Gestão de Prazos."
//
// O que este arquivo pina:
//   · a regra pura (shared/prazo-molde.ts): o dia gravado ao meio-dia UTC, o
//     prazo só para peça molde, o aviso de molde sem prazo;
//   · as ROTAS REAIS de criar/editar evento: gravam, limpam, recusam data
//     inválida e mantêm os papéis de sempre (admin e Solicitação);
//   · o dado viaja: enrichEvent e o formato compacto das peças o carregam;
//   · NÃO ENTRA NA GESTÃO DE PRAZOS: com o prazo do molde vencido, o funil do
//     evento é idêntico, e nenhum módulo de prazos/alertas/digest/Análises o lê.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({
  storage: {} as Record<string, any>,
  broadcast: (() => {}) as any,
  createAuditLog: (async () => {}) as any,
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
    broadcast: (...a: any[]) => H.broadcast(...a),
    createAuditLog: (...a: any[]) => H.createAuditLog(...a),
  };
});
vi.mock("../services/prioridadeAutomatica", () => ({ aplicarPrioridadeAutomatica: vi.fn(async () => {}) }));

const { registerEventRoutes, enrichEvent } = await import("../routes/events");
const { buildEventPrazo } = await import("../services/prazo-domain");
const {
  prazoMoldeParaGravar, diaDoPrazoMolde, prazoDoMolde, eventoTemMoldeSemPrazo, prazoMoldeBR,
  AJUDA_PRAZO_MOLDE, AVISO_MOLDE_SEM_PRAZO,
} = await import("@shared/prazo-molde");
const { compactarPecas, expandirPecas } = await import("@shared/itens-compactos");

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.resolve(RAIZ, rel), "utf8");

type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const appFalso: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
}
registerEventRoutes(appFalso);

async function chamar(chave: string, ctx: { params?: any; body?: any; userRole?: string } = {}) {
  const handlers = rotas.get(chave)!;
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

let banco: Record<string, any>;
let trilha: string[];
beforeEach(() => {
  banco = {
    "ev-1": { id: "ev-1", name: "COPA", status: "created", startDate: new Date("2099-03-10T00:00:00Z"), truckDepartureDate: new Date("2099-03-01T11:00:00Z"), prazoMolde: null },
  };
  trilha = [];
  H.broadcast = vi.fn();
  H.createAuditLog = vi.fn(async (_u: any, _a: string, _t: string, _id: string, det: string) => { trilha.push(det); });
  const s = H.storage;
  for (const k of Object.keys(s)) delete s[k];
  s.getEvent = vi.fn(async (id: string) => banco[id]);
  s.updateEvent = vi.fn(async (id: string, dados: any) => (banco[id] = { ...banco[id], ...dados }));
  s.createEvent = vi.fn(async (dados: any) => (banco["novo"] = { id: "novo", ...dados, prazoMolde: dados.prazoMolde ?? null }));
});

// ═════════════════════════════════════════════════════════════════════════════
describe("a regra pura", () => {
  it("o dia vira meio-dia UTC; vazio limpa; ausente não mexe; lixo é recusado", () => {
    expect((prazoMoldeParaGravar("2026-10-05") as Date).toISOString()).toBe("2026-10-05T12:00:00.000Z");
    expect(prazoMoldeParaGravar("")).toBeNull();
    expect(prazoMoldeParaGravar(null)).toBeNull();
    expect(prazoMoldeParaGravar(undefined)).toBeUndefined();
    for (const lixo of ["amanhã", "2026-02-31", "0206-10-05", 42]) expect(prazoMoldeParaGravar(lixo), String(lixo)).toBe(false);
    expect(diaDoPrazoMolde("2026-10-05T12:00:00.000Z")).toBe("2026-10-05");
    expect(prazoMoldeBR(new Date("2026-10-05T12:00:00Z"))).toBe("05/10/2026");
  });

  it("o prazo vale só para o MOLDE de evento que tem prazo do molde", () => {
    const hoje = new Date(2026, 9, 1); // 01/10/2026, local
    const evento = { prazoMolde: "2026-10-05T12:00:00.000Z" };
    const p = prazoDoMolde({ type: "Molde" }, evento, hoje)!;
    expect(p.label).toBe("Prazo do molde");
    expect(p.diff).toBe(4);
    expect(p.date.getDate()).toBe(5);
    expect(prazoDoMolde({ type: "Molde" }, { prazoMolde: "2026-09-28T12:00:00.000Z" }, hoje)!.diff).toBe(-3);
    expect(prazoDoMolde({ type: "Pórtico" }, evento, hoje)).toBeNull();
    expect(prazoDoMolde({ type: "Molde" }, { prazoMolde: null }, hoje)).toBeNull();
  });

  it("o aviso: evento com molde vivo e sem prazo — e só ele", () => {
    const molde = { type: "Molde", status: "awaiting_submission" };
    expect(eventoTemMoldeSemPrazo({ prazoMolde: null }, [molde])).toBe(true);
    expect(eventoTemMoldeSemPrazo({ prazoMolde: "2026-10-05" }, [molde])).toBe(false);
    expect(eventoTemMoldeSemPrazo({ prazoMolde: null }, [{ type: "Pórtico", status: "draft" }])).toBe(false);
    expect(eventoTemMoldeSemPrazo({ prazoMolde: null }, [{ type: "Molde", status: "canceled" }])).toBe(false);
    expect(eventoTemMoldeSemPrazo({ prazoMolde: null }, [{ type: "Molde", status: "draft", deletedAt: new Date() }])).toBe(false);
    expect(AVISO_MOLDE_SEM_PRAZO).toBe("Há molde neste evento sem prazo do molde");
    expect(AJUDA_PRAZO_MOLDE).toBe("Só se o evento tiver molde. Usado no fluxo do molde; não entra na Gestão de Prazos.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("as rotas de evento", () => {
  it("PATCH grava o dia (meio-dia UTC) e a trilha diz o que mudou", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, body: { prazoMolde: "2099-02-20" }, userRole: "solicitacao" });
    expect(r.status).toBe(200);
    expect(banco["ev-1"].prazoMolde).toBeInstanceOf(Date);
    expect(banco["ev-1"].prazoMolde.toISOString()).toBe("2099-02-20T12:00:00.000Z");
    expect(trilha.join(" ")).toContain("Prazo do molde: — → 20/02/2099");
  });

  it("PATCH com vazio limpa; sem o campo não mexe", async () => {
    banco["ev-1"].prazoMolde = new Date("2099-02-20T12:00:00Z");
    await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, body: { name: "COPA 2" }, userRole: "admin" });
    expect(banco["ev-1"].prazoMolde.toISOString()).toBe("2099-02-20T12:00:00.000Z");
    await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, body: { prazoMolde: "" }, userRole: "admin" });
    expect(banco["ev-1"].prazoMolde).toBeNull();
    expect(trilha.join(" ")).toContain("Prazo do molde: 20/02/2099 → —");
  });

  it("data inválida → 400, nada gravado", async () => {
    const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, body: { prazoMolde: "2099-02-31" }, userRole: "admin" });
    expect(r.status).toBe(400);
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("os papéis de sempre: Arte, Gráfica e Atendimento não editam o evento", async () => {
    for (const papel of ["arte", "grafica", "atendimento"]) {
      const r = await chamar("PATCH /api/events/:id", { params: { id: "ev-1" }, body: { prazoMolde: "2099-02-20" }, userRole: papel });
      expect(r.status, papel).toBe(403);
    }
    expect(H.storage.updateEvent).not.toHaveBeenCalled();
  });

  it("POST: opcional — sem o campo nasce null; com ele, o dia", async () => {
    const base = { name: "NOVO", startDate: "2099-05-10", truckDepartureDate: "2099-05-01T08:00" };
    const semPrazo = await chamar("POST /api/events", { body: base, userRole: "solicitacao" });
    expect(semPrazo.status).toBe(201);
    expect(H.storage.createEvent.mock.calls[0][0].prazoMolde).toBeNull();
    const comPrazo = await chamar("POST /api/events", { body: { ...base, prazoMolde: "2099-04-25" }, userRole: "admin" });
    expect(comPrazo.status).toBe(201);
    expect(H.storage.createEvent.mock.calls[1][0].prazoMolde.toISOString()).toBe("2099-04-25T12:00:00.000Z");
    expect((await chamar("POST /api/events", { body: { ...base, prazoMolde: "x" }, userRole: "admin" })).status).toBe(400);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o dado viaja com o evento", () => {
  it("enrichEvent (GET /api/events, completo e resumo) carrega prazoMolde", () => {
    const ev = { ...banco["ev-1"], prazoMolde: new Date("2099-02-20T12:00:00Z") };
    // enrichEvent espalha o evento recebido; o tipo declarado não lista as
    // colunas da tabela, então o acesso aqui é pelo Record.
    expect((enrichEvent(ev, [], [], Date.now()) as Record<string, any>).prazoMolde).toEqual(ev.prazoMolde);
  });

  it("o formato compacto das peças devolve o evento com prazoMolde", () => {
    const evento = { id: "ev-1", name: "COPA", prazoMolde: "2099-02-20T12:00:00.000Z" };
    const pecas = [{ id: "m1", displayId: "#1", type: "Molde", status: "ready_for_production", event: evento, sponsors: [] }];
    const volta: any[] = expandirPecas(compactarPecas(pecas as any) as any) as any;
    expect(volta[0].event.prazoMolde).toBe("2099-02-20T12:00:00.000Z");
  });

  it("schema, SQL aditivo e a conferência do .mjs", () => {
    expect(ler("shared/schema.ts")).toContain('prazoMolde: timestamp("prazo_molde"),');
    expect(ler("scripts/migracao-aditiva-producao.sql")).toContain("ALTER TABLE events ADD COLUMN IF NOT EXISTS prazo_molde timestamp;");
    expect(ler("scripts/migracao-aditiva-producao.mjs")).toContain("(table_name='events' AND column_name='prazo_molde')");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("NÃO entra na Gestão de Prazos", () => {
  it("com o prazo do molde VENCIDO, o funil do evento é idêntico ao sem prazo", () => {
    const hoje = Date.UTC(2099, 1, 25);
    const evento = { ...banco["ev-1"], deadlineListaImagens: -25, deadlineEntregaLayouts: -20, deadlineAprovacaoLayout: -12, deadlineFinalizacao: -10, deadlineRevisaoLista: -8, deadlineProducaoGrafica: -1 };
    const itens = [
      { id: "m1", eventId: "ev-1", type: "Molde", status: "awaiting_submission", quantity: 1, createdAt: new Date("2099-01-01") },
      { id: "m2", eventId: "ev-1", type: "Molde", status: "ready_for_production", quantity: 1, createdAt: new Date("2099-01-01") },
      { id: "p1", eventId: "ev-1", type: "Pórtico", status: "awaiting_submission", quantity: 2, createdAt: new Date("2099-01-01") },
    ];
    const opts = () => ({ today: hoje, sponsorNameById: new Map(), openApprovalsByItem: new Map(), userNameById: new Map() });
    const sem = buildEventPrazo({ ...evento, prazoMolde: null } as any, itens as any, opts() as any);
    const vencido = buildEventPrazo({ ...evento, prazoMolde: new Date("2099-02-01T12:00:00Z") } as any, itens as any, opts() as any);
    expect(sem).not.toBeNull(); // o evento ESTÁ na Gestão de Prazos — a comparação vale
    const semOCampo = (x: any) => JSON.parse(JSON.stringify(x, (k, v) => (k === "prazoMolde" ? undefined : v)));
    expect(semOCampo(vencido)).toEqual(semOCampo(sem));
  });

  it("nenhum módulo de prazos, alertas, digest, cobrança, snapshot ou Análises lê o prazo do molde", () => {
    const arquivos = [
      "server/services/prazo-domain.ts", "server/services/deadlineAlerts.ts", "server/services/gestaoDigest.ts",
      "server/services/revisaoDigest.ts", "server/services/prazoSnapshots.ts", "server/routes/prazos.ts",
      "client/src/lib/painel-prazo.ts", "client/src/pages/gestao-prazos.tsx", "client/src/pages/dashboard-analises.tsx",
      "shared/prazo-dates.ts", "shared/prazos-contract.ts",
      ...readdirSync(path.resolve(RAIZ, "client/src/components/prazos")).map((f) => `client/src/components/prazos/${f}`),
      ...readdirSync(path.resolve(RAIZ, "client/src/lib")).filter((f) => f.startsWith("analises-")).map((f) => `client/src/lib/${f}`),
    ];
    for (const a of arquivos) {
      let src = "";
      try { src = ler(a); } catch { continue; }
      expect(src, a).not.toMatch(/prazoMolde|prazo_molde|prazo-molde/);
    }
  });
});
