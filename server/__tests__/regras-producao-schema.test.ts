// ─────────────────────────────────────────────────────────────────────────────
// O QUE O SQL À MÃO CRIA ESTÁ DECLARADO NO SCHEMA (drizzle) — lido do objeto
// do schema (getTableConfig), não do texto de shared/schema.ts.
//
// Vieram de casos que liam o fonte: prazo-do-molde ("schema, SQL aditivo e a
// conferência do .mjs") e molde-revisao-adversarial ("todo índice do SQL de
// performance está declarado").
//
// O lado do SQL (scripts/*.sql, o .mjs que confere) continua VARREDURA: rodar
// a migração pede um Postgres (as integracao-*.test.ts sobem o PGlite).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@shared/schema";
import { events } from "@shared/schema";

const RAIZ = path.resolve(__dirname, "../..");
const ler = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** Todos os .sql/.mjs de scripts/ — a migração pode mudar de arquivo sem o teste mentir. */
const scripts = (ext: string) => readdirSync(path.join(RAIZ, "scripts")).filter((f) => f.endsWith(ext)).map((f) => ler(`scripts/${f}`));

const tabelas = Object.values(schema).filter((v: unknown): v is PgTable => is(v, PgTable)).map((t) => getTableConfig(t));

describe("o prazo do molde no evento", () => {
  it("events.prazo_molde: timestamp opcional (nulo = sem prazo)", () => {
    const col = getTableConfig(events).columns.find((c) => c.name === "prazo_molde");
    expect(col?.getSQLType()).toBe("timestamp");
    expect(col?.notNull).toBe(false);
  });

  it("a migração aditiva cria a coluna e o .mjs confere que ela existe (varredura: SQL não roda aqui)", () => {
    expect(scripts(".sql").some((s) => /ALTER TABLE events ADD COLUMN IF NOT EXISTS prazo_molde timestamp\s*;/i.test(s))).toBe(true);
    expect(scripts(".mjs").some((s) => /table_name\s*=\s*'events'\s+AND\s+column_name\s*=\s*'prazo_molde'/i.test(s))).toBe(true);
  });
});

describe("os índices do SQL de performance", () => {
  it("todo CREATE INDEX de scripts/indices-performance.sql está declarado no schema, na MESMA tabela (nenhum some num db:push)", () => {
    const sql = ler("scripts/indices-performance.sql");
    const criados = Array.from(sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF NOT EXISTS\s+)?"?(\w+)"?\s+ON\s+"?(\w+)"?/gi));
    expect(criados.length).toBeGreaterThan(0);
    for (const [, nome, tabela] of criados) {
      const cfg = tabelas.find((t) => t.name === tabela);
      expect(cfg, `tabela ${tabela} (do índice ${nome}) no schema`).toBeTruthy();
      expect(cfg!.indexes.map((i) => i.config.name), `${nome} declarado em ${tabela}`).toContain(nome);
    }
  });
});
