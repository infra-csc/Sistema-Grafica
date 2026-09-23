// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO (integração, 23/09): o escape de `% _ \` na busca de arte nunca
// agia. As palavras da busca passavam por `normalizarTexto`, que troca tudo o
// que não é letra/número por espaço — então "50%" virava "50" (e casava
// "#0500", "150 un."…) e uma busca só com "%" virava VAZIA, caindo no ramo
// sem termo: vinham as 600 mais recentes, isto é, tudo. Agora os três
// caracteres chegam ao LIKE (escapados, ao pé da letra) e ao filtro em
// memória.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const H = vi.hoisted(() => ({ filas: [] as any[][], wheres: [] as any[], limites: [] as number[] }));

vi.mock("../db", () => {
  // Cada consulta consome a próxima resposta enfileirada e anota o WHERE.
  const consulta = () => {
    const q: any = {
      from: () => q,
      leftJoin: () => q,
      where: (w: any) => { H.wheres.push(w); return q; },
      orderBy: () => q,
      limit: (n: number) => { H.limites.push(n); return q; },
      then: (ok: any, falha: any) => Promise.resolve(H.filas.shift() ?? []).then(ok, falha),
    };
    return q;
  };
  return { db: { select: consulta } };
});
vi.mock("../routes/shared", () => ({
  requireRole: (...papeis: string[]) => (req: any, res: any, next: any) =>
    papeis.includes(req.userRole) ? next() : res.status(403).json({ error: "Acesso negado" }),
}));

import { casaComTermo, palavrasDaBusca } from "@shared/artes-parecidas";

type Handler = (req: any, res: any, next: any) => unknown;
async function buscar(q: string) {
  const { registerArtesBuscaRoutes } = await import("../routes/artes-busca");
  const rotas = new Map<string, Handler[]>();
  const app: any = {};
  for (const m of ["get", "post", "patch", "put", "delete"]) app[m] = (c: string, ...hs: Handler[]) => { rotas.set(`${m.toUpperCase()} ${c}`, hs); return app; };
  registerArtesBuscaRoutes(app);
  const resposta: any = { statusCode: 200, corpo: undefined };
  const res: any = { status(c: number) { resposta.statusCode = c; return res; }, json(b: any) { resposta.corpo = b; return res; } };
  const req: any = { query: { item: "alvo", q }, userRole: "arte", userId: "u1", userKit: false };
  for (const h of rotas.get("GET /api/artes/busca")!) {
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (!seguiu) break;
  }
  return resposta;
}

const linha = (id: string, descricao: string) => ({
  id, displayId: `#${id}`, tipo: "Banner", descricao,
  thumbUrl: `/objects/${id}`, previewUrl: null, arquivoFinalUrl: null, arquivoFinalNome: null,
  kitRemessaId: null, criadoPorId: "u1", fileWidth: "2.00", fileHeight: "1.00",
  eventId: `ev-${id}`, eventName: "Circuito das Estações 2026 São Paulo", eventInicio: new Date("2026-01-01T00:00:00Z"),
});

// O que o banco "devolveria" se o LIKE não filtrasse nada: o filtro em memória
// tem de separar sozinho.
const CANDIDATAS = [linha("0500", "Banner lateral"), linha("150", "Faixa 150 un."), linha("promo", "Desconto 50% na inscrição"), linha("under", "arquivo lona_frente")];

const paramsDoLike = () => {
  const dialeto = new PgDialect();
  return H.wheres.flatMap((w) => (w ? dialeto.sqlToQuery(w).params : [])).filter((p) => typeof p === "string" && p.startsWith("%"));
};

beforeEach(() => { H.filas = []; H.wheres = []; H.limites = []; });

describe("busca de arte: % _ \\ valem ao pé da letra", () => {
  it("as palavras da busca guardam os curingas (antes sumiam na normalização)", () => {
    expect(palavrasDaBusca("50%")).toEqual(["50%"]);
    expect(palavrasDaBusca("Lona_Frente")).toEqual(["lona_frente"]);
    expect(palavrasDaBusca("São Paulo")).toEqual(["sao", "paulo"]);
  });

  it("\"50%\" casa só a peça que tem \"50%\" — não \"#0500\" nem \"150\"", async () => {
    H.filas = [[linha("alvo", "Pórtico")], CANDIDATAS, [], []];
    const r = await buscar("50%");
    expect(r.corpo.artes.map((a: any) => a.id)).toEqual(["promo"]);
    // e o LIKE recebe o % escapado, não um curinga
    expect(paramsDoLike()).toContain("%50\\%%");
  });

  it("busca só com \"%\" não vira \"sem termo\" (que devolvia as 600 recentes, isto é, tudo)", async () => {
    H.filas = [[linha("alvo", "Pórtico")], CANDIDATAS, [], []];
    const r = await buscar("%");
    // Um recorte só (o do termo), não os dois do ramo sem termo.
    expect(H.limites).toEqual([600]);
    expect(paramsDoLike()).toContain("%\\%%");
    expect(r.corpo.artes.map((a: any) => a.id)).toEqual(["promo"]);
  });

  it("\"_\" é sublinhado, não \"qualquer caractere\"", async () => {
    H.filas = [[linha("alvo", "Pórtico")], CANDIDATAS, [], []];
    const r = await buscar("lona_frente");
    expect(r.corpo.artes.map((a: any) => a.id)).toEqual(["under"]);
    expect(paramsDoLike()).toContain("%lona\\_frente%");
  });

  it("o filtro em memória segue a mesma régua (acento e caixa continuam não importando)", () => {
    const peca = { id: "x", displayId: "#1", tipo: "Banner", descricao: "Desconto 50% na INSCRIÇÃO", eventName: null } as any;
    expect(casaComTermo(peca, "50%")).toBe(true);
    expect(casaComTermo(peca, "inscricao")).toBe(true);
    expect(casaComTermo({ ...peca, descricao: "Banner #0500" }, "50%")).toBe(false);
  });
});
