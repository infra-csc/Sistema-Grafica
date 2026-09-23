// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVAMENTO NO STORAGE — onde a regra "arquivado some" de fato mora.
//
// O storage roda de verdade sobre um banco de mentira que GRAVA o SQL de cada
// consulta (renderizado pelo dialeto do Postgres do drizzle). Confere:
//   · as listas de eventos e de peças deixam o arquivado de fora;
//   · getEvent continua enxergando (guardas e restauração leem por ele);
//   · o delta devolve as peças do evento restaurado;
//   · o dicionário de patrocinadores é completo e a lista de escolha, não;
//   · arquivar/restaurar é UPDATE — não existe mais DELETE de evento nem de
//     patrocinador.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.DATABASE_URL = "postgres://test:test@localhost:5432/banco_nunca_acessado";

const H = vi.hoisted(() => ({ consultas: [] as Array<{ tipo: string; where: unknown; set?: any }> }));

vi.mock("../db", () => {
  const select = () => {
    const registro: { tipo: string; where: unknown } = { tipo: "select", where: null };
    H.consultas.push(registro);
    const q: any = {
      from: () => q, leftJoin: () => q, innerJoin: () => q, orderBy: () => q, limit: () => q, groupBy: () => q,
      where: (w: unknown) => { registro.where = w; return q; },
      then: (ok: any, falha: any) => Promise.resolve([]).then(ok, falha),
    };
    return q;
  };
  const update = () => ({
    set: (valores: any) => ({
      where: (w: unknown) => {
        H.consultas.push({ tipo: "update", where: w, set: valores });
        const p: any = Promise.resolve([]);
        p.returning = async () => [{ id: "x", ...valores }];
        return p;
      },
    }),
  });
  const apagar = () => { throw new Error("DELETE físico não é permitido"); };
  return { db: { select, update, delete: apagar }, pool: {} };
});

const { storage } = await import("../storage");
const dialeto = new PgDialect();
const sqlDe = (w: unknown) => (w ? dialeto.sqlToQuery(w as any).sql.toLowerCase() : "");
const ultima = () => H.consultas[H.consultas.length - 1];

beforeEach(() => { H.consultas.length = 0; });

describe("eventos", () => {
  it("getAllEvents deixa o arquivado de fora; getEvent enxerga", async () => {
    await storage.getAllEvents();
    expect(sqlDe(ultima().where)).toContain('"arquivado_em" is null');
    await storage.getEvent("ev-1");
    expect(sqlDe(ultima().where)).not.toContain("arquivado_em");
  });

  it("arquivar e restaurar são UPDATE condicionais, com quem arquivou", async () => {
    const arq = await storage.arquivarEvento("ev-1", "Maria");
    expect(ultima().tipo).toBe("update");
    expect(ultima().set).toMatchObject({ arquivadoPor: "Maria" });
    expect(ultima().set.arquivadoEm).toBeInstanceOf(Date);
    expect(sqlDe(ultima().where)).toContain('"arquivado_em" is null');
    expect(arq?.arquivadoPor).toBe("Maria");

    await storage.restaurarEvento("ev-1");
    expect(ultima().set).toMatchObject({ arquivadoEm: null, arquivadoPor: null });
    expect(ultima().set.restauradoEm).toBeInstanceOf(Date);
    expect(sqlDe(ultima().where)).toContain('"arquivado_em" is not null');
  });

  it("não existe mais caminho de DELETE de evento nem de patrocinador", () => {
    expect("deleteEvent" in storage).toBe(false);
    expect("deleteSponsor" in storage).toBe(false);
  });
});

describe("peças de evento arquivado somem das listas", () => {
  const leituras: Array<[string, () => Promise<unknown>]> = [
    ["getAllItems", () => storage.getAllItems()],
    ["getItemsByEvent", () => storage.getItemsByEvent("ev-1")],
    ["getItemsByEvents", () => storage.getItemsByEvents(["ev-1"])],
    ["getItemsByStatuses", () => storage.getItemsByStatuses(["draft"])],
    ["getItemsByStatusesAndEvents", () => storage.getItemsByStatusesAndEvents(["draft"], ["ev-1"])],
    ["getPendingItems", () => storage.getPendingItems()],
    ["getApprovedItems", () => storage.getApprovedItems()],
    ["getDeletedItems", () => storage.getDeletedItems()],
    ["getItemsSlimForEvents", () => storage.getItemsSlimForEvents()],
    ["getItemsDoKitDoCriador", () => storage.getItemsDoKitDoCriador("u1")],
    ["getItemsParaPrazos", () => storage.getItemsParaPrazos(["ev-1"])],
    ["getItemsParaCorrecao", () => storage.getItemsParaCorrecao()],
    ["getItemsParaUsoDeModelos", () => storage.getItemsParaUsoDeModelos()],
  ];
  for (const [nome, ler] of leituras) {
    it(nome, async () => {
      await ler();
      expect(sqlDe(ultima().where)).toContain("ev_arq.arquivado_em is not null");
    });
  }

  it("o delta tira o arquivado e REENVIA as peças do evento restaurado desde `since`", async () => {
    await storage.getItemsChangedSince(new Date("2026-09-23T10:00:00Z"));
    const sql = sqlDe(ultima().where);
    expect(sql).toContain("ev_arq.arquivado_em is not null");
    expect(sql).toContain("ev_rest.restaurado_em >=");
  });
});

describe("patrocinadores", () => {
  it("o dicionário é completo (nome nas aprovações antigas); a lista de escolha não traz arquivado", async () => {
    await storage.getAllSponsors();
    expect(ultima().where).toBeNull();
    await storage.getSponsorsAtivos();
    expect(sqlDe(ultima().where)).toContain('"arquivado_em" is null');
  });

  it("o elenco do evento deixa o patrocinador arquivado de fora", async () => {
    await storage.getEventSponsors("ev-1");
    expect(sqlDe(ultima().where)).toContain("sp_arq.arquivado_em is not null");
    await storage.getAllEventSponsors();
    expect(sqlDe(ultima().where)).toContain("sp_arq.arquivado_em is not null");
  });

  it("arquivar/restaurar patrocinador é UPDATE, com quem arquivou", async () => {
    await storage.arquivarPatrocinador("sp-1", "Maria");
    expect(ultima()).toMatchObject({ tipo: "update", set: { arquivadoPor: "Maria" } });
    await storage.restaurarPatrocinador("sp-1");
    expect(ultima().set).toMatchObject({ arquivadoEm: null, arquivadoPor: null });
  });
});
