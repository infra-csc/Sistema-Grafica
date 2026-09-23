// ─────────────────────────────────────────────────────────────────────────────
// O STORAGE DO PATROCÍNIO, RODANDO — a coluna "Resposta" e o descarte de
// UMA linha de aprovação.
//
// Veio de patrocinadores-nota-10.test.ts §1 (que lia storage.getSponsorUsage
// como texto) e de desvincular-patrocinador.test.ts (deleteItemSponsorApproval). Aqui o método roda com o banco de mentira: cada uma das quatro
// consultas devolve linhas prontas e se afirma o que ele MONTA — e o SQL que
// ele manda (a régua do "pendente" e a conta da média), já renderizado.
// A média em si (avg/extract no Postgres) só um banco de verdade calcula.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  /** Respostas das consultas, NA ORDEM em que o método as dispara. */
  respostas: [] as any[][],
  consultas: [] as { campos: any; where: unknown }[],
  apagados: [] as { tabela: string; where: unknown }[],
  rowCount: 1 as number | null,
}));

vi.mock("../db", () => {
  const db: any = {
    delete: (tabela: any) => ({
      where: async (where: unknown) => { H.apagados.push({ tabela: tabela[Symbol.for("drizzle:Name")], where }); return { rowCount: H.rowCount }; },
    }),
    // o carimbo de updated_at da peça (touchItem)
    update: () => ({ set: () => ({ where: async () => [] }) }),
    select: (campos: any) => {
      const registro = { campos, where: undefined as unknown };
      H.consultas.push(registro);
      const linhas = H.respostas.shift() ?? [];
      const q: any = {
        from: () => q, groupBy: () => q,
        where: (w: unknown) => { registro.where = w; return q; },
        then: (ok: any, falha: any) => Promise.resolve(linhas).then(ok, falha),
      };
      return q;
    },
  };
  return { db, pool: {} };
});
vi.mock("../tempo-real", () => ({ publicarMensagem: vi.fn() }));

import { PgDialect } from "drizzle-orm/pg-core";
import { storage } from "../storage";

const dialeto = new PgDialect();

beforeEach(() => {
  H.respostas = [];
  H.consultas = [];
  H.apagados = [];
  H.rowCount = 1;
});

describe("getSponsorUsage — uso, pendências e média no MESMO agregado", () => {
  it("junta as quatro medidas por patrocinador; sem decisão, a média é null — nunca zero", async () => {
    H.respostas = [
      [{ sponsorId: "sp-a", n: 12 }, { sponsorId: "sp-c", n: "2" }],        // eventos
      [{ sponsorId: "sp-a", n: 148 }],                                      // peças
      [{ sponsorId: "sp-a", n: 3 }, { sponsorId: "sp-b", n: 1 }],           // pendências
      [{ sponsorId: "sp-a", media: "6.6" }, { sponsorId: "sp-b", media: -0.4 }], // média em dias
    ];
    const uso = await storage.getSponsorUsage();
    expect(uso["sp-a"]).toEqual({ events: 12, items: 148, pendencias: 3, mediaDias: 7 });
    // relógio torto não produz média negativa
    expect(uso["sp-b"]).toEqual({ events: 0, items: 0, pendencias: 1, mediaDias: 0 });
    // nunca decidiu: "—" na tela, não "responde na hora"
    expect(uso["sp-c"]).toEqual({ events: 2, items: 0, pendencias: 0, mediaDias: null });
    // quatro consultas, não uma por patrocinador
    expect(H.consultas).toHaveLength(4);
  });

  it("'pendente' é pending ou new_version_pending; a média só olha o que já foi decidido", async () => {
    await storage.getSponsorUsage();
    const pend = dialeto.sqlToQuery(H.consultas[2].where as any).sql;
    expect(pend).toContain(`"item_sponsor_approvals"."status" in ('pending', 'new_version_pending')`);
    const media = dialeto.sqlToQuery(H.consultas[3].campos.media).sql;
    expect(media).toContain(`avg(extract(epoch from (coalesce("item_sponsor_approvals"."approved_at", "item_sponsor_approvals"."rejected_at") - "item_sponsor_approvals"."created_at")) / 86400.0)`);
    const decididas = dialeto.sqlToQuery(H.consultas[3].where as any).sql;
    expect(decididas).toContain(`coalesce("item_sponsor_approvals"."approved_at", "item_sponsor_approvals"."rejected_at") is not null`);
  });
});

describe("deleteItemSponsorApproval — apaga UMA linha, não a rodada inteira", () => {
  it("o WHERE amarra a peça E o patrocinador", async () => {
    expect(await storage.deleteItemSponsorApproval("p1", "sp-min")).toBe(true);
    expect(H.apagados).toHaveLength(1);
    expect(H.apagados[0].tabela).toBe("item_sponsor_approvals");
    const { sql, params } = dialeto.sqlToQuery(H.apagados[0].where as any);
    expect(sql).toBe(`("item_sponsor_approvals"."item_id" = $1 and "item_sponsor_approvals"."sponsor_id" = $2)`);
    expect(params).toEqual(["p1", "sp-min"]);
  });

  it("nada apagado → false", async () => {
    H.rowCount = 0;
    expect(await storage.deleteItemSponsorApproval("p1", "sp-min")).toBe(false);
  });
});
