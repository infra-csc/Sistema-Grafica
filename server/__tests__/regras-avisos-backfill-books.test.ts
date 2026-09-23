// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL DOS BOOKS, RODANDO — scripts/backfill-books.ts com banco de mentira.
//
// Veio de versoes-aprovadas.test.ts ("o backfill grava o histórico de books
// que estava para se apagar"), que lia o texto do script. Aqui o script roda
// de verdade (sem e com --aplicar) e o que se afirma é o que ele grava.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const H = vi.hoisted(() => ({
  execute: [] as unknown[][],
  jaGravados: [] as Record<string, unknown>[],
  consultas: [] as unknown[],
  inseridos: [] as { tabela: unknown; valores: Record<string, unknown> }[],
}));

vi.mock("../db", () => ({
  db: {
    execute: async (q: unknown) => { H.consultas.push(q); return { rows: H.execute.shift() ?? [] }; },
    select: () => ({ from: async () => H.jaGravados }),
    insert: (tabela: unknown) => ({ values: async (valores: Record<string, unknown>) => { H.inseridos.push({ tabela, valores }); } }),
  },
  pool: {},
}));

import { PgDialect, getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const argvOriginal = process.argv;
let saiu: Promise<void>;

async function rodar(args: string[]) {
  vi.resetModules();
  process.argv = ["node", "backfill-books.ts", ...args];
  let fim!: () => void;
  saiu = new Promise((r) => { fim = r; });
  vi.spyOn(process, "exit").mockImplementation(((_c?: number) => { fim(); }) as never);
  await import("../../scripts/backfill-books");
  await saiu;
}

beforeEach(() => {
  H.consultas = [];
  H.inseridos = [];
  H.jaGravados = [{ eventId: "ev-ja", bookUrl: "/objects/ja.pdf" }];
  // 1ª consulta: os books atuais; 2ª: o último registro da trilha por evento.
  H.execute = [
    [
      { eventId: "ev-1", bookUrl: "/objects/b1.pdf", itemCount: 12, eventName: "COPA" },
      { eventId: "ev-2", bookUrl: "/objects/b2.pdf", itemCount: 3, eventName: "ECO RUN" },
      { eventId: "ev-ja", bookUrl: "/objects/ja.pdf", itemCount: 9, eventName: "JÁ FOI" },
    ],
    [{ eventId: "ev-1", userName: "Ana Arte", createdAt: "2026-08-10T14:00:00Z" }],
  ];
  vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { process.argv = argvOriginal; vi.restoreAllMocks(); });

describe("scripts/backfill-books.ts", () => {
  it("sem --aplicar é só relatório: nada é gravado", async () => {
    await rodar([]);
    expect(H.inseridos).toEqual([]);
  });

  it("com --aplicar grava um book por evento com book atual — datado e assinado pela trilha", async () => {
    await rodar(["--aplicar"]);
    // (resetModules recria o schema: compara pelo nome da tabela)
    expect(H.inseridos.map((i) => getTableConfig(i.tabela as PgTable).name)).toEqual(["event_books", "event_books"]);
    const porEvento = Object.fromEntries(H.inseridos.map((i) => [i.valores.eventId, i.valores]));
    expect(porEvento["ev-1"]).toMatchObject({ bookUrl: "/objects/b1.pdf", itemCount: 12, createdBy: "Ana Arte" });
    expect(new Date(porEvento["ev-1"].createdAt as Date).toISOString()).toBe("2026-08-10T14:00:00.000Z");
    // não inventa: sem trilha, entra sem autor
    expect(porEvento["ev-2"]).toMatchObject({ bookUrl: "/objects/b2.pdf", createdBy: null });
    // o que já está em event_books não é gravado de novo
    expect(porEvento["ev-ja"]).toBeUndefined();
    expect(H.inseridos).toHaveLength(2);
  });

  it("a data e o autor vêm do registro de PUBLICAÇÃO do book na trilha", async () => {
    await rodar([]);
    const q = new PgDialect().sqlToQuery(H.consultas[1] as SQL).sql;
    expect(q).toContain("details like 'Book de aprovação vinculado%'");
  });
});
