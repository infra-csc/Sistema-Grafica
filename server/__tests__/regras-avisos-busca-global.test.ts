// ─────────────────────────────────────────────────────────────────────────────
// BUSCA GLOBAL (Ctrl+K) — a rota /api/busca, executando.
//
// Veio de busca-global.test.ts (que lia o texto de routes/busca.ts). Aqui o
// handler roda sobre um banco de mentira que guarda WHERE, ORDER BY e LIMIT
// de cada consulta; o SQL é renderizado pelo dialeto do Postgres do drizzle.
// A paleta (tela) continua lá.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { capturarRotas } from "./rotas-de-mentira";

type Consulta = { where?: unknown; ordem: unknown[]; limite?: number };
const H = vi.hoisted(() => ({ consultas: [] as Consulta[], filas: [] as unknown[][] }));

vi.mock("../db", () => {
  const select = () => {
    const c: Consulta = { ordem: [] };
    H.consultas.push(c);
    const q: any = {
      from: () => q, leftJoin: () => q,
      where: (w: unknown) => { c.where = w; return q; },
      orderBy: (...o: unknown[]) => { c.ordem = o; return q; },
      limit: (n: number) => { c.limite = n; return q; },
      then: (ok: any, falha: any) => Promise.resolve(H.filas.shift() ?? []).then(ok, falha),
    };
    return q;
  };
  return { db: { select }, pool: {} };
});
vi.mock("../storage", () => ({ storage: {} }));
vi.mock("../routes/shared", () => ({
  // O requireAuth de verdade: sem sessão, 401.
  requireAuth: (req: any, res: any, next: () => void) =>
    req.session?.userId ? next() : res.status(401).json({ error: "Não autenticado" }),
}));

const { registerBuscaRoutes, BUSCA_MAX_PECAS, BUSCA_MAX_EVENTOS } = await import("../routes/busca");
const { requireAuth } = await import("../routes/shared");

const dialeto = new PgDialect();
const render = (cond: unknown) => dialeto.sqlToQuery(cond as SQL);
const ROTA = "GET /api/busca";
const LOGADO = { userId: "u1", userRole: "grafica" };

beforeEach(() => { H.consultas.length = 0; H.filas = []; });

describe("a rota /api/busca", () => {
  it("o recorte desce ao SQL — a paleta não baixa o banco para procurar", async () => {
    const { chamar } = capturarRotas(registerBuscaRoutes);
    await chamar(ROTA, { sessao: LOGADO, query: { q: "#2993" } });
    const [pecas, eventos] = H.consultas;

    const p = render(pecas.where);
    expect(p.sql).toContain('"items"."display_id" ilike $');
    expect(p.sql).toContain('"items"."description" ilike $');
    // O código procura sem a cerquilha; o texto, como foi digitado.
    expect(p.params).toContain("%2993%");
    expect(p.params).toContain("%#2993%");
    expect(pecas.limite).toBe(BUSCA_MAX_PECAS);

    const e = render(eventos.where);
    expect(e.sql).toContain('"events"."name" ilike $');
    expect(e.params).toContain("%#2993%");
    expect(eventos.limite).toBe(BUSCA_MAX_EVENTOS);
  });

  it("código exato vem primeiro — quem digita #2993 quer A peça", async () => {
    const { chamar } = capturarRotas(registerBuscaRoutes);
    // Com e sem cerquilha: as duas grafias são a mesma intenção.
    for (const q of ["#2993", "2993"]) {
      H.consultas.length = 0;
      await chamar(ROTA, { sessao: LOGADO, query: { q } });
      const [primeira, segunda] = H.consultas[0].ordem.map(render);
      expect(primeira.sql).toContain('CASE WHEN lower("items"."display_id") IN (lower($1), lower($2)) THEN 0 ELSE 1 END');
      expect(primeira.params).toEqual(["#2993", "2993"]);
      // Depois do exato, o mais novo.
      expect(segunda.sql).toContain('"items"."created_at" desc');
    }
  });

  it("menos de 2 caracteres devolve vazio sem tocar o banco", async () => {
    const { chamar } = capturarRotas(registerBuscaRoutes);
    for (const query of [{ q: "a" }, { q: "  b  " }, { q: "" }, {}, { q: ["ab", "cd"] }]) {
      const r = await chamar(ROTA, { sessao: LOGADO, query });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ pecas: [], eventos: [] });
    }
    expect(H.consultas).toHaveLength(0);
  });

  it("peça excluída não aparece, e os limites são pequenos — é paleta, não relatório", async () => {
    expect(BUSCA_MAX_PECAS).toBe(15);
    expect(BUSCA_MAX_EVENTOS).toBe(5);
    const { chamar } = capturarRotas(registerBuscaRoutes);
    await chamar(ROTA, { sessao: LOGADO, query: { q: "portico" } });
    expect(render(H.consultas[0].where).sql).toContain('"items"."deleted_at" is null');
  });

  it("leitura para qualquer logado — o destino (Detalhe do Evento) todo papel já vê", async () => {
    const { rotas, chamar } = capturarRotas(registerBuscaRoutes);
    // Só o requireAuth antes do handler: nenhum requireRole na pilha.
    const pilha = rotas.get(ROTA)!;
    expect(pilha).toHaveLength(2);
    expect(pilha[0]).toBe(requireAuth);

    // Todo papel recebe a MESMA resposta — o handler não olha o papel.
    const peca = { id: "p1", displayId: "#2993", type: "2x1", description: "Pórtico", status: "draft", eventId: "e1", eventName: "Copa", kitRemessaId: null, criadoPorId: "x" };
    const evento = { id: "e1", name: "Copa 2993", truckDepartureDate: null };
    for (const userRole of ["admin", "arte", "atendimento", "solicitacao", "grafica", "revisao"]) {
      H.filas = [[peca], [evento]];
      const r = await chamar(ROTA, { sessao: { userId: "u1", userRole }, query: { q: "2993" } });
      expect(r.status, userRole).toBe(200);
      expect(r.body, userRole).toEqual({ pecas: [peca], eventos: [evento] });
    }

    // Sem sessão, não passa do requireAuth.
    expect((await chamar(ROTA, { query: { q: "2993" } })).status).toBe(401);
  });
});
