// ─────────────────────────────────────────────────────────────────────────────
// O CARIMBO QUE SUSTENTA O DELTA, RODANDO (veio de delta-sync-itens.test.ts,
// que contava as chamadas de touchItem no texto do storage).
//
// A peça enriquecida muda quando o VÍNCULO ou a APROVAÇÃO de patrocinador
// muda, sem que ninguém escreva na linha de items. Por isso toda escrita
// dessas tabelas carimba items.updated_at — senão GET /api/items?since= não vê
// a peça e a tela fica com o patrocinador velho. E a falha do carimbo nunca
// derruba a operação (o vínculo vale mais que o delta).
//
// Aqui o storage REAL roda sobre um banco de mentira que registra cada
// UPDATE em items. (O mesmo, com Postgres de verdade: o caso do delta em
// integracao-peca-do-rascunho-a-entrega.test.ts.)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const B = vi.hoisted(() => ({
  carimbos: [] as Array<{ updatedAt?: unknown }>,
  falharCarimbo: false,
  linhasApagadas: 1,
}));

vi.mock("../db", async () => {
  const { items } = await import("@shared/schema");
  /** Um encadeamento do drizzle que, aguardado, devolve `resultado`. */
  const cadeia = (resultado: () => unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "values", "returning", "onConflictDoNothing", "innerJoin", "leftJoin", "orderBy", "limit", "for"]) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) => {
      try { return Promise.resolve(resultado()).then(ok, erro); } catch (e) { return Promise.reject(e).then(ok, erro); }
    };
    return c;
  };
  const db = {
    insert: () => cadeia(() => [{ id: "linha-1", itemId: "p1", sponsorId: "sp-1", status: "pending" }]),
    select: () => cadeia(() => [{ id: "sp-1", arquivadoEm: null }]),
    delete: () => cadeia(() => ({ rowCount: B.linhasApagadas })),
    update: (tabela: unknown) => ({
      set: (valores: { updatedAt?: unknown }) => cadeia(() => {
        if (tabela === items) {
          if (B.falharCarimbo) throw new Error("banco caiu no carimbo");
          B.carimbos.push(valores);
        }
        return [{ id: "linha-1", itemId: "p1" }];
      }),
    }),
  };
  return { db, pool: {} };
});

import { DatabaseStorage } from "../storage";

type Escrita = [nome: string, rodar: (s: DatabaseStorage) => Promise<unknown>];
const ESCRITAS: Escrita[] = [
  ["addSponsorToItem", (s) => s.addSponsorToItem({ itemId: "p1", sponsorId: "sp-1" })],
  ["removeSponsorFromItem", (s) => s.removeSponsorFromItem("p1", "sp-1")],
  ["bulkSyncItemSponsors", (s) => s.bulkSyncItemSponsors("p1", ["sp-1"])],
  ["updateItemSponsorApproval", (s) => s.updateItemSponsorApproval("linha-1", { status: "approved" })],
  ["deleteItemSponsorApprovals", (s) => s.deleteItemSponsorApprovals("p1")],
  ["initializeItemSponsorApprovals", (s) => s.initializeItemSponsorApprovals("p1", ["sp-1"])],
];

beforeEach(() => {
  B.carimbos = [];
  B.falharCarimbo = false;
  B.linhasApagadas = 1;
});

describe("toda escrita de vínculo/aprovação carimba updated_at da peça", () => {
  it.each(ESCRITAS)("%s carimba items.updated_at com a hora da escrita", async (_nome, rodar) => {
    const antes = Date.now();
    await rodar(new DatabaseStorage());
    expect(B.carimbos.length).toBeGreaterThanOrEqual(1);
    const quando = B.carimbos[B.carimbos.length - 1].updatedAt;
    expect(quando).toBeInstanceOf(Date);
    expect((quando as Date).getTime()).toBeGreaterThanOrEqual(antes);
  });

  it("remover um vínculo que não existia não carimba (nada mudou na peça)", async () => {
    B.linhasApagadas = 0;
    await new DatabaseStorage().removeSponsorFromItem("p1", "sp-inexistente");
    expect(B.carimbos).toEqual([]);
  });

  it.each(ESCRITAS)("%s: o carimbo falhando não derruba a escrita", async (_nome, rodar) => {
    B.falharCarimbo = true;
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(rodar(new DatabaseStorage())).resolves.not.toThrow();
    expect(erro.mock.calls.some((c) => String(c[0]).includes("[touch-item]"))).toBe(true);
    erro.mockRestore();
  });
});
