// ─────────────────────────────────────────────────────────────────────────────
// O SCHEMA DO ESTOQUE E DA EMBALAGEM — lido pelo próprio drizzle
// (getTableConfig), não pelo texto de shared/schema.ts.
//
// Vieram de casos que liam o texto do schema em:
//   · embalagem-com-quantidade.test.ts (items.embalada_qty, tubo_itens,
//     publicInsertItemSchema sem embaladaQty/printMachine/tuboId);
//   · estoque-reserva.test.ts (a reserva guarda a peça de destino e quem reservou);
//   · consulta-de-estoque.test.ts (UMA aberta por peça: o índice único parcial;
//     as colunas do SQL são as do schema, sem local);
//   · reserva-de-disparo.test.ts (a chave primária da reserva).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { getTableConfig, PgDialect, type PgTable } from "drizzle-orm/pg-core";
import { getTableName } from "drizzle-orm";
import {
  items, tubos, tuboItens, eventInventoryAllocations, consultasDeEstoque, reservasDeDisparo, publicInsertItemSchema,
} from "@shared/schema";
import { colunasDoCreate } from "./regras-estoque-migracao";

const dialeto = new PgDialect();
const cfg = (t: PgTable) => getTableConfig(t);
const coluna = (t: PgTable, nome: string) => cfg(t).columns.find((c) => c.name === nome);
const indice = (t: PgTable, nome: string) => cfg(t).indexes.find((i) => i.config.name === nome);
const colunasDoIndice = (t: PgTable, nome: string) => indice(t, nome)?.config.columns.map((c: any) => c.name);
const fk = (t: PgTable, colunaLocal: string) => cfg(t).foreignKeys.map((f) => ({ f, r: f.reference() })).find(({ r }) => r.columns[0].name === colunaLocal);

describe("embalagem com quantidade: o modelo", () => {
  it("items.embalada_qty é inteiro, obrigatório e começa em 0", () => {
    const c = coluna(items, "embalada_qty")!;
    expect(c.columnType).toBe("PgInteger");
    expect(c.notNull).toBe(true);
    expect(c.default).toBe(0);
  });

  it("tubo_itens: FKs em cascata para tubos e items, única por (tubo, peça), índice por peça, quantidade > 0", () => {
    const doTubo = fk(tuboItens, "tubo_id")!;
    expect(getTableName(doTubo.r.foreignTable)).toBe("tubos");
    expect(doTubo.f.onDelete).toBe("cascade");
    const daPeca = fk(tuboItens, "item_id")!;
    expect(getTableName(daPeca.r.foreignTable)).toBe("items");
    expect(daPeca.f.onDelete).toBe("cascade");
    expect(coluna(tuboItens, "tubo_id")!.notNull && coluna(tuboItens, "item_id")!.notNull).toBe(true);
    expect(indice(tuboItens, "UQ_tubo_itens_tubo_item")!.config.unique).toBe(true);
    expect(colunasDoIndice(tuboItens, "UQ_tubo_itens_tubo_item")).toEqual(["tubo_id", "item_id"]);
    expect(indice(tuboItens, "IDX_tubo_itens_item")!.config.unique).toBe(false);
    expect(colunasDoIndice(tuboItens, "IDX_tubo_itens_item")).toEqual(["item_id"]);
    const checagem = cfg(tuboItens).checks.find((c) => c.name === "tubo_itens_quantidade_check")!;
    expect(dialeto.sqlToQuery(checagem.value).sql).toBe("quantidade > 0");
    expect(getTableName(tubos)).toBe("tubos");
  });

  it("quem cria peça pelo corpo não escolhe o total embalado, a impressora nem o tubo", () => {
    const campos = Object.keys(publicInsertItemSchema.shape);
    for (const k of ["embaladaQty", "printMachine", "tuboId"]) expect(campos, k).not.toContain(k);
    const r = publicInsertItemSchema.safeParse({ eventId: "ev", type: "2x1", quantity: 1, embaladaQty: 9, tuboId: "t1" });
    if (r.success) {
      expect(r.data).not.toHaveProperty("embaladaQty");
      expect(r.data).not.toHaveProperty("tuboId");
    }
  });
});

describe("a reserva de estoque guarda a peça de destino e quem reservou", () => {
  it("item_id aponta para items (SET NULL ao apagar a peça), reservado_por é texto e há índice por peça", () => {
    const destino = fk(eventInventoryAllocations, "item_id")!;
    expect(getTableName(destino.r.foreignTable)).toBe("items");
    expect(destino.f.onDelete).toBe("set null");
    expect(coluna(eventInventoryAllocations, "item_id")!.notNull).toBe(false);
    expect(coluna(eventInventoryAllocations, "reservado_por")!.columnType).toBe("PgText");
    expect(coluna(eventInventoryAllocations, "reservado_por_id")).toBeDefined();
    expect(colunasDoIndice(eventInventoryAllocations, "IDX_event_inventory_allocations_item_id")).toEqual(["item_id"]);
  });
});

describe("solicitação ao estoque: UMA aberta por peça, e sem local", () => {
  it("o índice único PARCIAL em item_id WHERE status = 'aberta' — é ele quem garante a segunda 409", () => {
    const uq = indice(consultasDeEstoque, "UQ_consultas_de_estoque_aberta_por_peca")!;
    expect(uq.config.unique).toBe(true);
    expect(colunasDoIndice(consultasDeEstoque, "UQ_consultas_de_estoque_aberta_por_peca")).toEqual(["item_id"]);
    expect(dialeto.sqlToQuery(uq.config.where!).sql).toBe("status = 'aberta'");
    expect(colunasDoIndice(consultasDeEstoque, "IDX_consultas_de_estoque_item")).toEqual(["item_id"]);
    expect(colunasDoIndice(consultasDeEstoque, "IDX_consultas_de_estoque_status")).toEqual(["status"]);
  });

  it("as colunas do CREATE TABLE da migração são as do schema — e nenhuma guarda o local da peça (dono, 21/09)", () => {
    const doSchema = cfg(consultasDeEstoque).columns.map((c) => c.name);
    expect(colunasDoCreate("consultas_de_estoque")).toEqual(doSchema);
    expect(doSchema.some((c) => /local|location/.test(c))).toBe(false);
  });
});

describe("reserva de disparo", () => {
  it("a chave é a CHAVE PRIMÁRIA de reservas_de_disparo (a atomicidade é do Postgres)", () => {
    const chave = coluna(reservasDeDisparo, "chave")!;
    expect(chave.primary).toBe(true);
    expect(cfg(reservasDeDisparo).columns.filter((c) => c.primary).map((c) => c.name)).toEqual(["chave"]);
  });
});
