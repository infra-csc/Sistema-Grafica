// ─────────────────────────────────────────────────────────────────────────────
// "DESDE QUANDO" A PEÇA ESTÁ NO STATUS — a coluna, o carimbo do storage e o
// backfill, RODANDO (storage.updateItem de verdade e o script de verdade,
// sobre um banco de mentira).
//
// Vieram de casos de painel-tempo-no-estado.test.ts que só liam o fonte:
//   · é uma coluna própria (status_changed_at), não updatedAt;
//   · o carimbo mora em updateItem, é decidido NO SQL (IS DISTINCT FROM) e
//     não por um SELECT antes do UPDATE;
//   · o backfill só preenche onde há carimbo de origem, e deixa NULL no resto.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";

const H = vi.hoisted(() => ({
  db: {} as Record<string, any>,
  selects: 0,
  linha: {} as Record<string, any>,
  semCarimbo: [] as Array<{ id: string; status: string }>,
  sqlDoBackfill: [] as string[],
}));
vi.mock("../db", () => ({ db: H.db, pool: {} }));

import { items } from "@shared/schema";
import { storage } from "../storage";
import { pedacosDoSql } from "./regras-fluxo-banco";

/**
 * O CASE do carimbo, avaliado: "CASE WHEN status IS DISTINCT FROM $novo THEN
 * now() ELSE status_changed_at END". Qualquer outra forma faz o teste falhar —
 * de propósito: é esta a regra que o painel lê.
 */
function avaliarCarimbo(valor: unknown, linha: Record<string, any>, agora: Date): unknown {
  const p = pedacosDoSql(valor);
  const texto = p.map((k) => (k.t === "txt" ? k.s : k.t === "col" ? `{${k.chave}}` : "{?}")).join("").replace(/\s+/g, " ").trim();
  expect(texto).toBe("CASE WHEN {status} IS DISTINCT FROM {?} THEN now() ELSE {statusChangedAt} END");
  const novo = (p.find((k) => k.t === "val") as { v: unknown }).v;
  // Em JS, !== já trata null como um valor qualquer — o mesmo que IS DISTINCT FROM.
  return linha.status !== novo ? agora : linha.statusChangedAt;
}

describe("a coluna e o carimbo", () => {
  const ANTES = new Date("2026-09-01T12:00:00Z");
  beforeEach(() => {
    H.selects = 0;
    H.linha = { id: "p1", status: "awaiting_submission", statusChangedAt: ANTES, updatedAt: ANTES, skipApproval: false };
    H.db.select = () => { H.selects += 1; throw new Error("updateItem não pode ler antes de escrever"); };
    H.db.update = () => ({
      set: (valores: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            const agora = new Date();
            const novos: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(valores)) {
              if (k === "statusChangedAt") novos[k] = avaliarCarimbo(v, H.linha, agora);
              else if (k !== "skipApproval") novos[k] = v; // a isenção tem regra (e teste) próprios
            }
            Object.assign(H.linha, novos);
            return [{ ...H.linha }];
          },
        }),
      }),
    });
  });

  it("é uma coluna própria, anulável (vazio = 'não sei'), não o updatedAt", () => {
    const col = getTableConfig(items).columns.find((c) => c.name === "status_changed_at");
    expect(col).toMatchObject({ dataType: "date", notNull: false });
    expect(col?.hasDefault).toBe(false);
  });

  it("carimba quando o status MUDA, no próprio UPDATE — sem SELECT antes", async () => {
    await storage.updateItem("p1", { status: "awaiting_submission" });
    expect(H.linha.statusChangedAt).toEqual(ANTES); // mesmo status: não é andar
    await storage.updateItem("p1", { status: "ready_for_production" });
    expect(H.linha.statusChangedAt.getTime()).toBeGreaterThan(ANTES.getTime());
    expect(H.selects).toBe(0);
  });

  it("status nulo conta como diferente (IS DISTINCT FROM, e não <>)", async () => {
    H.linha.status = null;
    await storage.updateItem("p1", { status: "draft" });
    expect(H.linha.statusChangedAt.getTime()).toBeGreaterThan(ANTES.getTime());
  });

  it("editar outro campo não mexe no carimbo (updatedAt é que mede o toque)", async () => {
    await storage.updateItem("p1", { observations: "nova observação" });
    expect(H.linha.statusChangedAt).toEqual(ANTES);
    expect(H.linha.updatedAt.getTime()).toBeGreaterThan(ANTES.getTime());
  });
});

describe("o backfill", () => {
  const argv = process.argv;
  afterEach(() => { process.argv = argv; vi.restoreAllMocks(); });

  it("preenche só a partir do carimbo do status ATUAL, só onde está vazio — e deixa NULL onde não há fonte", async () => {
    H.semCarimbo = [
      { id: "a", status: "delivered" }, { id: "b", status: "awaiting_submission" }, { id: "c", status: "awaiting_linking" },
    ];
    H.db.select = () => ({ from: () => ({ where: async () => H.semCarimbo }) });
    H.db.execute = async (q: unknown) => {
      H.sqlDoBackfill.push(pedacosDoSql(q).map((k) => (k.t === "txt" ? k.s : k.t === "val" ? `'${String(k.v)}'` : "?")).join("").replace(/\s+/g, " ").trim());
      return { rowCount: 0 };
    };
    process.argv = [...argv, "--aplicar"];
    vi.spyOn(console, "log").mockImplementation(() => {});
    let saiu!: () => void;
    const fim = new Promise<void>((r) => { saiu = r; });
    vi.spyOn(process, "exit").mockImplementation(((() => { saiu(); }) as unknown) as typeof process.exit);
    await import("../../scripts/backfill-status-changed-at");
    await fim;

    expect(H.sqlDoBackfill.length).toBeGreaterThan(0);
    for (const q of H.sqlDoBackfill) {
      // Idempotente (só a coluna vazia) e só com a fonte presente.
      expect(q).toMatch(/^UPDATE items SET status_changed_at = (\w+) WHERE status = '[^']+' AND status_changed_at IS NULL AND \1 IS NOT NULL$/);
      expect(q).not.toContain("created_at");
    }
    expect(H.sqlDoBackfill.some((q) => q.includes("status = 'delivered'") && q.includes("= delivered_at"))).toBe(true);
    // Os status do começo do fluxo não têm carimbo: nenhum UPDATE os toca.
    for (const semFonte of ["awaiting_submission", "awaiting_linking", "awaiting_approval"]) {
      expect(H.sqlDoBackfill.some((q) => q.includes(`status = '${semFonte}'`)), semFonte).toBe(false);
    }
  });
});
