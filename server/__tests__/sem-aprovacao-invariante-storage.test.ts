// ─────────────────────────────────────────────────────────────────────────────
// "ARTE DO CLIENTE" E A ESPERA DO PATROCINADOR NÃO COEXISTEM (27/10).
//
// storage.updateItem já zerava `skipApproval` quando a peça ia para a espera
// do patrocinador (incidente de 08/09 — regras-patrocinio-isencao-e-saude).
// A outra marca que pula a Aprovação ("Arte do cliente") tem o mesmo par
// proibido: aqui se olha o SET que o funil manda, com o banco de mentira.
// As colunas zeradas são as de colunasDaArteDoCliente(false, …).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ sets: [] as any[] }));

vi.mock("../db", () => {
  const db: any = {
    update: () => ({
      set: (dados: any) => {
        H.sets.push(dados);
        const q: any = { where: () => q, returning: async () => [{ id: "p1" }] };
        return q;
      },
    }),
    execute: async () => ({ rows: [] }),
  };
  return { db, pool: {} };
});
vi.mock("../tempo-real", () => ({ publicarMensagem: vi.fn() }));

import { PgDialect } from "drizzle-orm/pg-core";
import { storage } from "../storage";
import { colunasDaArteDoCliente } from "../services/marcas-de-aprovacao";

const emSql = (q: any) => new PgDialect().sqlToQuery(q);
const ZERADA = { arteDoCliente: false, arteDoClienteMarcadaEm: null, arteDoClienteMarcadaPor: null, arteRecebidaEm: null, arteRecebidaPor: null };
const ESPERA = `"items"."status" IN ('awaiting_sponsor_approval', 'awaiting_approval')`;

beforeEach(() => { H.sets = []; });

describe("updateItem — a peça que vai esperar o patrocinador perde a “Arte do cliente”", () => {
  it("as colunas zeradas são exatamente as de colunasDaArteDoCliente(false)", () => {
    expect(colunasDaArteDoCliente(false, "Ana")).toEqual(ZERADA);
  });

  for (const status of ["awaiting_sponsor_approval", "awaiting_approval"]) {
    it(`status novo ${status}: zera a marca e a chegada (e a isenção segue como antes)`, async () => {
      await storage.updateItem("p1", { status });
      expect(H.sets[0]).toMatchObject(ZERADA);
      expect(emSql(H.sets[0].skipApproval).sql).toBe(`CASE WHEN $1 IN ('awaiting_sponsor_approval', 'awaiting_approval') THEN false ELSE "items"."skip_approval" END`);
    });
  }

  it("status novo fora da espera: a marca não é tocada", async () => {
    await storage.updateItem("p1", { status: "awaiting_creator_review" });
    for (const c of Object.keys(ZERADA)) expect(H.sets[0]).not.toHaveProperty(c);
  });

  it("update que não toca status nem marca não mexe na Arte do cliente", async () => {
    await storage.updateItem("p1", { observations: "Ilhós a cada 50 cm" });
    for (const c of Object.keys(ZERADA)) expect(H.sets[0]).not.toHaveProperty(c);
  });

  it("só a marca muda (status da COLUNA): marcar numa peça que já espera não passa — CASE no SQL, com o tipo", async () => {
    const quando = new Date("2026-11-01T13:00:00Z");
    await storage.updateItem("p1", { arteDoCliente: true, arteDoClienteMarcadaEm: quando, arteDoClienteMarcadaPor: "Sofia" });
    const s = H.sets[0];
    const marca = emSql(s.arteDoCliente);
    expect(marca.sql).toBe(`CASE WHEN ${ESPERA} THEN false ELSE $1 END`);
    expect(marca.params).toEqual([true]);
    const em = emSql(s.arteDoClienteMarcadaEm);
    expect(em.sql).toBe(`CASE WHEN ${ESPERA} THEN NULL::timestamp ELSE $1 END`);
    // o Date passa pelo codificador da coluna timestamp (string, como o drizzle grava)
    expect(typeof em.params[0]).toBe("string");
    expect(String(em.params[0])).toContain("2026-11-01");
    expect(emSql(s.arteDoClienteMarcadaPor).params).toEqual(["Sofia"]);
    // as colunas que não vieram ficam com o valor da própria coluna (ou zeradas na espera)
    expect(emSql(s.arteRecebidaEm).sql).toBe(`CASE WHEN ${ESPERA} THEN NULL::date ELSE "items"."arte_recebida_em" END`);
  });

  it("desmarcar (valores nulos) vira o zero tipado nos dois ramos", async () => {
    await storage.updateItem("p1", colunasDaArteDoCliente(false, null));
    expect(emSql(H.sets[0].arteRecebidaEm).sql).toBe(`CASE WHEN ${ESPERA} THEN NULL::date ELSE NULL::date END`);
    expect(emSql(H.sets[0].arteDoCliente).sql).toBe(`CASE WHEN ${ESPERA} THEN false ELSE $1 END`);
  });
});
