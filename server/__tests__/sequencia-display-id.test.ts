// ─────────────────────────────────────────────────────────────────────────────
// A SEQUÊNCIA DOS NÚMEROS DE PEÇA não pode sumir — e, se sumir, tem de voltar.
//
// O CASO (25/08, produção): o `npm run db:push` das colunas novas DERRUBOU a
// item_display_id_seq — o drizzle-kit apaga objeto que o schema não declara, a
// mesma doença que a tabela `session` já tinha sofrido. O servidor, que
// memoriza "já criei" por processo, foi direto no nextval e TODA criação de
// peça morreu com `relation "item_display_id_seq" does not exist` até alguém
// reiniciar — o dono pegou o erro no meio de uma Entrada Rápida.
//
// Duas defesas, e as duas têm de existir:
//   1. DECLARAR a sequência no schema → o push para de derrubá-la (prevenção);
//   2. AUTOCURA no storage → se ainda assim ela sumir com o servidor de pé,
//      zera a memória, recria e repete, em vez de falhar até o reinício.
//
// Até 23/09 este arquivo lia o texto do schema e do storage. Agora o storage
// RODA contra um banco de mentira que só conhece a sequência pelo nome que o
// schema declara — se um lado renomear, o outro quebra aqui. (A sequência
// real, #0001 e lote com códigos distintos, está em
// integracao-peca-do-rascunho-a-entrega.test.ts, com Postgres de verdade.)
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

/** O "banco": a sequência existe ou não, e cada SQL executado fica registrado. */
const B = vi.hoisted(() => ({ existe: true, ultimo: 0, chamado: false, executados: [] as string[] }));

vi.mock("../db", async () => {
  const { itemDisplayIdSeq } = await import("@shared/schema");
  const dialeto = new PgDialect();
  const NOME = itemDisplayIdSeq.seqName;
  const sumiu = () => Object.assign(new Error(`relation "${NOME}" does not exist`), { code: "42P01" });
  const execute = async (consulta: SQL) => {
    const { sql: texto, params } = dialeto.sqlToQuery(consulta);
    B.executados.push(texto);
    if (texto.includes(`CREATE SEQUENCE IF NOT EXISTS ${NOME}`)) {
      if (!B.existe) { B.existe = true; B.ultimo = 1; B.chamado = false; }
      return { rows: [] };
    }
    if (/MAX\(CAST/.test(texto)) return { rows: [{ max_num: 0 }] };
    if (texto.includes(`FROM ${NOME}`) && texto.includes("last_value")) {
      if (!B.existe) throw sumiu();
      return { rows: [{ last_value: B.ultimo, is_called: B.chamado }] };
    }
    if (texto.includes(`nextval('${NOME}')`)) {
      if (!B.existe) throw sumiu();
      const n = texto.includes("generate_series") ? Number(params[params.length - 1]) : 1;
      return {
        rows: Array.from({ length: n }, () => {
          B.ultimo = B.chamado ? B.ultimo + 1 : B.ultimo;
          B.chamado = true;
          return { next_id: B.ultimo };
        }),
      };
    }
    throw new Error(`SQL inesperado no teste: ${texto}`);
  };
  const insert = () => ({
    values: (v: Record<string, unknown> | Array<Record<string, unknown>>) => ({
      returning: async () => (Array.isArray(v) ? v : [v]).map((x, i) => ({ id: `p${i + 1}`, ...x })),
    }),
  });
  return { db: { execute, insert }, pool: {} };
});

import { itemDisplayIdSeq } from "@shared/schema";
import { DatabaseStorage } from "../storage";

const PECA = { eventId: "ev-1", type: "Pórtico", quantity: 1, area: "1.00", visual: "1.00", material: "Lona", finish: "Ilhós", measurement: "1 × 1", calculatedM2: "1.00" };
type NovaPeca = Parameters<DatabaseStorage["createItem"]>[0];

beforeEach(() => {
  Object.assign(B, { existe: true, ultimo: 1, chamado: false, executados: [] });
});

describe("prevenção: o schema declara a sequência que o storage usa", () => {
  it("pgSequence item_display_id_seq começando em 1", () => {
    expect(itemDisplayIdSeq.seqName).toBe("item_display_id_seq");
    expect(itemDisplayIdSeq.seqOptions?.startWith).toBe(1);
  });

  it("o storage numera pela sequência DECLARADA (o banco de mentira só a conhece por esse nome)", async () => {
    const storage = new DatabaseStorage();
    const peca = await storage.createItem(PECA as NovaPeca);
    expect(peca.displayId).toBe("#0001");
    expect(B.executados.some((s) => s.includes(`nextval('${itemDisplayIdSeq.seqName}')`))).toBe(true);
  });
});

describe("autocura: sequência sumida com o servidor de pé", () => {
  it("peça única: 42P01 na sequência zera a memória, recria e repete — não vira falha permanente", async () => {
    const storage = new DatabaseStorage();
    expect((await storage.createItem(PECA as NovaPeca)).displayId).toBe("#0001");
    // O push derrubou a sequência com o processo de pé.
    B.existe = false;
    const criadas = B.executados.filter((s) => s.includes("CREATE SEQUENCE")).length;
    const peca = await storage.createItem(PECA as NovaPeca);
    expect(peca.displayId).toMatch(/^#\d{4}$/);
    // Recriou (a memória "já criei" foi zerada) — não foi direto no nextval de novo.
    expect(B.executados.filter((s) => s.includes("CREATE SEQUENCE")).length).toBe(criadas + 1);
    // E segue funcionando nas próximas.
    expect((await storage.createItem(PECA as NovaPeca)).displayId).toMatch(/^#\d{4}$/);
  });

  it("lote: o mesmo — os códigos voltam, distintos, depois da recriação", async () => {
    const storage = new DatabaseStorage();
    await storage.createItem(PECA as NovaPeca);
    B.existe = false;
    const lote = await storage.createBulkItems([PECA, PECA, PECA] as NovaPeca[]);
    expect(lote).toHaveLength(3);
    expect(new Set(lote.map((p) => p.displayId)).size).toBe(3);
  });

  it("erro que NÃO é a sequência sumida sobe como está (a rede não engole tudo)", async () => {
    const storage = new DatabaseStorage();
    await storage.createItem(PECA as NovaPeca);
    const { db } = await import("../db");
    const original = db.execute;
    (db as { execute: unknown }).execute = async () => { throw Object.assign(new Error("conexão caiu"), { code: "08006" }); };
    await expect(storage.createItem(PECA as NovaPeca)).rejects.toThrow("conexão caiu");
    (db as { execute: unknown }).execute = original;
  });
});
