// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR ARTE JÁ FEITA — o recorte do BANCO, executando.
//
// Veio de buscar-arte-ja-feita.test.ts e busca-arte-revisao.test.ts, que
// liam o texto de routes/artes-busca.ts e de routes.ts. Aqui as duas rotas
// rodam sobre um banco de mentira que guarda WHERE, ORDER BY e LIMIT de cada
// consulta (renderizados pelo dialeto do Postgres do drizzle) e responde da
// fila, na ordem em que o handler pergunta. O ranking e a tela seguem lá.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { capturarRotas, type ContextoDaChamada } from "./rotas-de-mentira";

type Consulta = { where?: unknown; ordem: unknown[]; limite?: number };
const H = vi.hoisted(() => ({ consultas: [] as Consulta[], filas: [] as unknown[][], papeis: [] as string[][] }));

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

vi.mock("../routes/shared", () => ({
  // O requireRole de verdade barra quem não está na lista; este anota a lista.
  requireRole: (...papeis: string[]) => {
    H.papeis.push(papeis);
    return (req: any, res: any, next: () => void) =>
      papeis.includes(req.userRole) ? next() : res.status(403).json({ error: "Acesso negado" });
  },
}));

const { registerArtesBuscaRoutes, recorteDoKitSql } = await import("../routes/artes-busca");

const dialeto = new PgDialect();
const render = (cond: unknown) => dialeto.sqlToQuery(cond as SQL);
const BUSCA = "GET /api/artes/busca";
const SUG = "GET /api/artes/sugestao-final";
const ARTE = { userId: "u1", userRole: "arte" };

const linha = (id: string, mudanca: Record<string, unknown> = {}) => ({
  id, displayId: `#${id}`, tipo: "2x1", descricao: "portico",
  thumbUrl: `/objects/${id}`, previewUrl: null, arquivoFinalUrl: null, arquivoFinalNome: null,
  kitRemessaId: null, criadoPorId: "u1", fileWidth: "2.00", fileHeight: "1.00",
  eventId: `ev-${id}`, eventName: "Circuito das Estações 2026 São Paulo", eventInicio: new Date("2026-01-01T00:00:00Z"),
  ...mudanca,
});
const comFinal = (id: string, mudanca: Record<string, unknown> = {}) => linha(id, {
  thumbUrl: "/objects/mesma", arquivoFinalUrl: `//srv/arte/${id}.tif`, arquivoFinalNome: `${id}.tif`,
  quando: new Date("2026-09-01T00:00:00Z"), ...mudanca,
});

const { chamar: chamarRota, rotas: rotasRegistradas } = capturarRotas(registerArtesBuscaRoutes);
const chamar = (rota: string, query: Record<string, unknown>, sessao: ContextoDaChamada["sessao"] = ARTE) =>
  chamarRota(rota, { sessao, query }) as Promise<{ status: number; body: any }>;

beforeEach(() => {
  H.consultas.length = 0;
  H.filas = [];
});

describe("GET /api/artes/busca — quem pode", () => {
  it("é da Arte e do admin — a mesma régua de quem troca a arte da peça", async () => {
    // Uma régua só (montada ao carregar o módulo) para as duas rotas, com
    // exatamente esses dois papéis.
    expect(H.papeis).toEqual([["admin", "arte"]]);
    expect(rotasRegistradas.get(BUSCA)![0]).toBe(rotasRegistradas.get(SUG)![0]);
    for (const userRole of ["admin", "arte"]) {
      H.filas = [[linha("alvo")], [], [], []];
      expect((await chamar(BUSCA, { item: "alvo" }, { userId: "u1", userRole })).status, userRole).toBe(200);
    }
    for (const userRole of ["grafica", "atendimento", "solicitacao"]) {
      expect((await chamar(BUSCA, { item: "alvo" }, { userId: "u1", userRole })).status, userRole).toBe(403);
    }
  });

  it("não cria rota de escrita nenhuma — reaproveitar grava pelo caminho de sempre", () => {
    expect(Array.from(rotasRegistradas.keys()).sort()).toEqual([BUSCA, SUG].sort());
  });

  it("está registrada onde as outras estão", () => {
    // Varredura: registerRoutes monta o servidor inteiro (sessão, websocket,
    // db) — executá-lo aqui não cabe. Procura a chamada em todo o server/.
    const RAIZ = path.resolve(__dirname, "..");
    const chamadas: string[] = [];
    (function andar(d: string) {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (statSync(p).isDirectory()) { if (n !== "__tests__" && n !== "node_modules") andar(p); continue; }
        if (!n.endsWith(".ts")) continue;
        const texto = readFileSync(p, "utf8");
        if (/^\s*registerArtesBuscaRoutes\(\s*app\s*\);?\s*$/m.test(texto)) {
          chamadas.push(n);
          // No mesmo lugar em que as demais rotas são registradas.
          expect(texto).toMatch(/^\s*registerBuscaRoutes\(\s*app\s*\);?\s*$/m);
        }
      }
    })(RAIZ);
    expect(chamadas).toEqual(["routes.ts"]);
  });
});

describe("GET /api/artes/busca — o recorte é do banco", () => {
  it("só peças COM arte, e o teto de 60 é do servidor", async () => {
    H.filas = [[linha("alvo")], [], [], []];
    await chamar(BUSCA, { item: "alvo" });
    for (const c of H.consultas.slice(1, 3)) {
      const { sql } = render(c.where);
      expect(sql).toContain('"items"."approval_thumb_url" is not null');
      expect(sql).toContain('"items"."final_preview_url" is not null');
      expect(sql).toContain('"items"."deleted_at" is null');
    }

    // 70 candidatas visíveis e com imagem: saem 60, e a resposta avisa o corte.
    const muitas = Array.from({ length: 70 }, (_, i) => linha(`c${i}`));
    H.filas = [[linha("alvo")], [], muitas, []];
    const cheia = await chamar(BUSCA, { item: "alvo" });
    expect(cheia.body.artes).toHaveLength(60);
    expect(cheia.body.total).toBe(60);
    expect(cheia.body.cortou).toBe(true);

    H.filas = [[linha("alvo")], [], muitas.slice(0, 60), []];
    expect((await chamar(BUSCA, { item: "alvo" })).body.cortou).toBe(false);
  });

  it("o recorte é do banco: `q` vira LIKE sem acento no SQL e sem `q` há teto de candidatas", async () => {
    // Sem `q`: duas consultas de candidatas (mesmo patrocinador + recentes),
    // cada uma com teto de 600 e ordem antes do corte.
    H.filas = [[linha("alvo")], [], [], []];
    await chamar(BUSCA, { item: "alvo" });
    const [, doMesmoPatrocinador, recentes] = H.consultas;
    expect(doMesmoPatrocinador.limite).toBe(600);
    expect(recentes.limite).toBe(600);
    // Quem divide patrocinador com o alvo entra sempre — o teto de recentes
    // não pode esconder a arte do mesmo patrocinador de dois anos atrás.
    const mp = render(doMesmoPatrocinador.where);
    expect(mp.sql).toContain("b.item_id = $");
    expect(mp.params).toContain("alvo");
    expect(render(recentes.where).sql).not.toContain("b.item_id");
    for (const c of [doMesmoPatrocinador, recentes]) expect(render(c.ordem[1]).sql).toContain("desc nulls last");

    // Com `q`: UMA consulta de candidatas; cada palavra vira LIKE sobre o
    // texto sem caixa e sem acento, e o termo desce já normalizado.
    H.consultas.length = 0;
    H.filas = [[linha("alvo")], [linha("a", { descricao: "Pórtico Bradesco" }), linha("b", { descricao: "Pórtico" })], []];
    const r = await chamar(BUSCA, { item: "alvo", q: "Pórtico 100%" });
    const candidatas = H.consultas[1];
    expect(candidatas.limite).toBe(600);
    const { sql, params } = render(candidatas.where);
    expect(sql).toContain("translate(lower(coalesce(");
    expect(sql).toMatch(/\) like \$\d+/);
    expect(params).toContain("%portico%");
    // O % digitado é LITERAL: chega ao LIKE escapado (\%), nunca como curinga
    // — "100%" acha "100%", não "100" nem tudo (defeito corrigido em 23/09).
    expect(params).toContain("%100\\%%");
    expect(params).not.toContain("%100%");
    expect(H.consultas.filter((c) => c.limite === 600)).toHaveLength(1);
    // O refino em memória segue a mesma régua (todas as palavras).
    expect(r.body.artes).toEqual([]);

    H.filas = [[linha("alvo")], [linha("a", { descricao: "Pórtico Bradesco" }), linha("b", { descricao: "Pórtico" })], []];
    const r2 = await chamar(BUSCA, { item: "alvo", q: "portico bradesco" });
    expect(r2.body.artes.map((x: { id: string }) => x.id)).toEqual(["a"]);
  });

  it("aberta pelo arquivo final, o SQL só traz arte que TEM arquivo final", async () => {
    H.filas = [[linha("alvo")], [], [], []];
    await chamar(BUSCA, { item: "alvo" });
    expect(render(H.consultas[1].where).sql).not.toContain('"items"."final_file_url" is not null');

    H.consultas.length = 0;
    H.filas = [
      [linha("alvo")],
      [],
      [linha("b", { arquivoFinalUrl: "\\\\rede\\arte\\rolo.tif", arquivoFinalNome: "rolo.tif" })],
      [],
    ];
    const r = await chamar(BUSCA, { item: "alvo", comArquivoFinal: "1" });
    for (const c of H.consultas.slice(1, 3)) expect(render(c.where).sql).toContain('"items"."final_file_url" is not null');
    expect(r.body.artes.map((x: { id: string }) => x.id)).toEqual(["b"]);
    expect(r.body.artes[0].temArquivoFinal).toBe(true);
  });

  it("o filtro do Kit vai para o SQL (antes do LIMIT)", async () => {
    expect(recorteDoKitSql({ kit: false, userId: "u1" })).toEqual([]);
    expect(render(recorteDoKitSql({ kit: true, userId: null })[0]).sql).toBe("false");

    const doKit = { kitRemessaId: "r1", criadoPorId: "u1" };
    H.filas = [[linha("alvo", doKit)], [], [], []];
    await chamar(BUSCA, { item: "alvo" }, { userId: "u1", userRole: "arte", userKit: true });
    for (const c of H.consultas.slice(1, 3)) {
      const { sql, params } = render(c.where);
      expect(sql).toContain('"items"."kit_remessa_id" is not null');
      expect(sql).toContain(`"items"."kit_remessa_id" <> ''`);
      expect(sql).toContain('"items"."criado_por_id" = $');
      expect(params).toContain("u1");
    }

    // Fora do Kit, nenhum recorte de Kit no SQL.
    H.consultas.length = 0;
    H.filas = [[linha("alvo")], [], [], []];
    await chamar(BUSCA, { item: "alvo" });
    expect(render(H.consultas[1].where).sql).not.toContain("kit_remessa_id");
  });
});

describe("GET /api/artes/sugestao-final — o recorte é do banco", () => {
  it("é da Arte e do admin, e exige a peça", async () => {
    expect((await chamar(SUG, { item: "alvo" }, { userId: "u1", userRole: "grafica" })).status).toBe(403);
    expect((await chamar(SUG, {})).status).toBe(400);
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma" })], []];
    expect((await chamar(SUG, { item: "alvo" }, { userId: "u1", userRole: "admin" })).status).toBe(200);
  });

  it("casa pela MESMA URL de thumb, ignora a própria peça e ordena pela mais recente", async () => {
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma", previewUrl: "/objects/previa" })], [comFinal("origem")]];
    const r = await chamar(SUG, { item: "alvo" });
    expect(r.body.displayId).toBe("#origem");
    const irmas = H.consultas[1];
    const { sql, params } = render(irmas.where);
    expect(sql).toContain('("items"."approval_thumb_url" in ($');
    expect(sql).toContain('or "items"."final_preview_url" in ($');
    expect(params).toEqual(expect.arrayContaining(["/objects/mesma", "/objects/previa"]));
    expect(sql).toContain('"items"."id" <> $');
    expect(params).toContain("alvo");
    expect(render(irmas.ordem[0]).sql).toBe('"items"."final_file_updated_at" desc nulls last');
  });

  it("exige o caminho do arquivo final preenchido", async () => {
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma" })], [comFinal("a", { arquivoFinalUrl: "  " }), comFinal("b", { arquivoFinalUrl: null })]];
    expect((await chamar(SUG, { item: "alvo" })).body).toBeNull();
    const { sql } = render(H.consultas[1].where);
    expect(sql).toContain('"items"."final_file_url" is not null');
    expect(sql).toContain(`"items"."final_file_url" <> ''`);
  });

  it("nada casa pela URL → null, sem plano B por patrocinador", async () => {
    // Plano B seria outra consulta depois da das irmãs: não há.
    H.filas = [[linha("alvo")], []];
    const r = await chamar(SUG, { item: "alvo" });
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    expect(H.consultas).toHaveLength(2);

    // Peça sem thumb nem prévia nem chega a consultar as irmãs.
    H.consultas.length = 0;
    H.filas = [[linha("alvo", { thumbUrl: null })]];
    expect((await chamar(SUG, { item: "alvo" })).body).toBeNull();
    expect(H.consultas).toHaveLength(1);
  });

  it("o recorte também está no SQL (tipo e medida iguais)", async () => {
    H.filas = [[linha("alvo", { thumbUrl: "/objects/mesma", tipo: "Rolo", fileWidth: "2.50", fileHeight: null })], []];
    await chamar(SUG, { item: "alvo" });
    const { sql, params } = render(H.consultas[1].where);
    expect(sql).toMatch(/lower\("items"\."type"\) = lower\(\$\d+\)/);
    expect(sql).toMatch(/"items"\."file_width" is not distinct from \$\d+/);
    expect(sql).toMatch(/"items"\."file_height" is not distinct from \$\d+/);
    expect(params).toEqual(expect.arrayContaining(["Rolo", "2.50", null]));
  });
});
