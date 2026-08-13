// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — a camada de persistência (server/storage.ts), com um `db` de
// mentira encadeável. Dois métodos concentram risco que nenhum teste de rota
// alcança, porque a rota os consome mockados:
//
//   getComplementsByParentIds — troca de ESTRATÉGIA acima de 300 mães: em vez
//   de mandar milhares de uuids num IN (...), varre a coluna indexada e recorta
//   em memória. Um recorte errado aqui não estoura nada: a mãe #0062 apenas
//   passa a exibir o complemento de OUTRA peça, ou perde o seu. É o tipo de
//   defeito que só aparece em produção, quando o acervo cresce.
//
//   copyItemSponsorApprovals — a regra é copiar PRESERVANDO status. Se alguma
//   linha nascer 'pending', ela entra em getOpenItemSponsorApprovals e vira
//   cobrança FALSA no painel de Gestão de Prazos: uma aprovação que ninguém
//   precisa fazer, num item que já está liberado para produção (risco #10).
//
// O `db` falso registra a sequência de operações e devolve as linhas que o
// teste configurou. Toda a lógica exercitada — o corte de 300, o filtro em
// memória, a ordem delete→insert, o mapeamento de campos — é código real.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  /** Linhas que o próximo SELECT deve devolver. */
  linhas: [] as any[],
  /** Sequência de operações vistas pelo "banco". */
  ops: [] as Array<{ op: string; arg?: any }>,
}));

vi.mock("../db", () => {
  const encadeavel = (rows: any[]): any => {
    const o: any = Promise.resolve(rows);
    o.from = () => { H.ops.push({ op: "from" }); return encadeavel(rows); };
    o.where = () => { H.ops.push({ op: "where" }); return encadeavel(rows); };
    o.orderBy = () => { H.ops.push({ op: "orderBy" }); return encadeavel(rows); };
    o.limit = (n: number) => { H.ops.push({ op: "limit" }); return encadeavel(rows.slice(0, n)); };
    o.set = (v: any) => { H.ops.push({ op: "set", arg: v }); return encadeavel(rows); };
    o.values = (v: any) => {
      const arr = Array.isArray(v) ? v : [v];
      H.ops.push({ op: "values", arg: arr });
      return encadeavel(arr.map((r: any, i: number) => ({ id: `novo-${i}`, ...r })));
    };
    o.returning = () => encadeavel(rows);
    return o;
  };
  const db = {
    select: (_proj?: any) => { H.ops.push({ op: "select" }); return encadeavel(H.linhas); },
    insert: (_t: any) => { H.ops.push({ op: "insert" }); return encadeavel([]); },
    delete: (_t: any) => { H.ops.push({ op: "delete" }); return encadeavel([]); },
    update: (_t: any) => { H.ops.push({ op: "update" }); return encadeavel(H.linhas); },
    execute: async () => ({ rows: [] }),
    transaction: async (cb: any) => await cb(db),
  };
  return { db, pool: {} };
});

import { storage } from "../storage";

const nomesDeOp = () => H.ops.map((o) => o.op);
const valoresInseridos = () => H.ops.find((o) => o.op === "values")?.arg ?? [];

beforeEach(() => {
  H.linhas = [];
  H.ops = [];
});

// ═════════════════════════════════════════════════════════════════════════════
describe("getComplementsByParentIds — o corte de 300 mães", () => {
  /** Universo: 400 mães, 1 complemento cada. */
  const universo = Array.from({ length: 400 }, (_, i) => ({
    id: `filho-${i}`,
    displayId: `#${String(i).padStart(4, "0")}-C1`,
    parentItemId: `mae-${i}`,
    quantity: 4,
    status: "ready_for_production",
    complementSeq: 1,
  }));
  const maes = (n: number) => Array.from({ length: n }, (_, i) => `mae-${i}`);

  it("lista vazia não vira 'IN ()' — devolve [] sem tocar no banco", async () => {
    const r = await storage.getComplementsByParentIds([]);
    expect(r).toEqual([]);
    expect(H.ops).toHaveLength(0);
  });

  it("ATÉ 300 mães: o recorte fica com o banco (o WHERE vai no IN)", async () => {
    H.linhas = universo;
    const r = await storage.getComplementsByParentIds(maes(300));
    // O db falso não filtra nada. Vir o universo inteiro de volta é justamente
    // a prova de que este ramo NÃO recorta em memória — quem recorta é o SQL.
    expect(r).toHaveLength(400);
    expect(nomesDeOp()).toEqual(["select", "from", "where", "orderBy"]);
  });

  it("ACIMA de 300: varre a coluna indexada e recorta em memória, sem perder ninguém", async () => {
    H.linhas = universo;
    const pedidas = maes(301);
    const r = await storage.getComplementsByParentIds(pedidas);
    expect(r).toHaveLength(301);
    expect(new Set(r.map((c) => c.parentItemId))).toEqual(new Set(pedidas));
  });

  it("ACIMA de 300: NENHUM complemento de mãe alheia vaza para a lista", async () => {
    H.linhas = universo;
    const r = await storage.getComplementsByParentIds(maes(301));
    // Se um complemento de mae-350 escapasse, a peça #0062 exibiria "+4" de
    // uma peça de outro evento — e o contractedTotal mentiria.
    expect(r.some((c) => c.parentItemId === "mae-350")).toBe(false);
    expect(r.every((c) => Number(c.displayId.slice(1, 5)) <= 300)).toBe(true);
  });

  it("ACIMA de 300: mãe pedida que não tem complemento simplesmente não aparece", async () => {
    H.linhas = universo.slice(0, 5);           // só 5 mães têm complemento
    const r = await storage.getComplementsByParentIds(maes(400));
    expect(r).toHaveLength(5);
  });

  it("complemento com parentItemId nulo (dado sujo) não é atribuído a ninguém", async () => {
    H.linhas = [...universo.slice(0, 3), { id: "sujo", displayId: "#9999-C1", parentItemId: null, quantity: 1 }];
    const r = await storage.getComplementsByParentIds(maes(301));
    expect(r.some((c) => c.id === "sujo")).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("getItemsByIds — completa as mães ausentes do enriquecimento", () => {
  it("lista vazia devolve [] sem query (o enrich chama isso a cada leitura)", async () => {
    const r = await storage.getItemsByIds([]);
    expect(r).toEqual([]);
    expect(H.ops).toHaveLength(0);
  });

  it("com ids, consulta uma vez só", async () => {
    H.linhas = [{ id: "mae-1", displayId: "#0062" }];
    const r = await storage.getItemsByIds(["mae-1"]);
    expect(r).toHaveLength(1);
    expect(nomesDeOp().filter((o) => o === "select")).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("copyItemSponsorApprovals — cobrança falsa é o defeito a evitar", () => {
  const aprovacao = (over: Partial<any> = {}) => ({
    id: "ap-1",
    itemId: "mae-1",
    sponsorId: "sp-1",
    status: "approved",
    approvedBy: "Ana do Atendimento",
    approvedAt: new Date("2026-08-01T12:00:00Z"),
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: null,
    ...over,
  });

  it("PRESERVA o status aprovado — o complemento é a mesma arte, já aprovada", async () => {
    H.linhas = [aprovacao()];
    const n = await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    expect(n).toBe(1);
    expect(valoresInseridos()[0]).toMatchObject({
      itemId: "filho-1",
      sponsorId: "sp-1",
      status: "approved",
      approvedBy: "Ana do Atendimento",
    });
  });

  it("NENHUMA linha nasce 'pending' — seria cobrança que ninguém precisa fazer", async () => {
    H.linhas = [
      aprovacao({ sponsorId: "sp-1", status: "approved" }),
      aprovacao({ sponsorId: "sp-2", status: "rejected", approvedBy: null, approvedAt: null, rejectedBy: "Ana", rejectedAt: new Date("2026-08-02T12:00:00Z"), rejectionReason: "logo pequeno" }),
    ];
    await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    const criadas = valoresInseridos();
    expect(criadas.map((c: any) => c.status)).toEqual(["approved", "rejected"]);
    expect(criadas.some((c: any) => c.status === "pending")).toBe(false);
  });

  it("carrega também o LADO da recusa (motivo, quem, quando)", async () => {
    H.linhas = [aprovacao({ status: "rejected", approvedBy: null, approvedAt: null, rejectedBy: "Ana", rejectedAt: new Date("2026-08-02T12:00:00Z"), rejectionReason: "logo pequeno" })];
    await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    expect(valoresInseridos()[0]).toMatchObject({
      status: "rejected", rejectedBy: "Ana", rejectionReason: "logo pequeno",
    });
  });

  it("o id da linha de origem NÃO é copiado (seria colisão de chave primária)", async () => {
    H.linhas = [aprovacao()];
    await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    expect("id" in valoresInseridos()[0]).toBe(false);
  });

  it("é idempotente: apaga o destino ANTES de inserir (retry pós-commit não duplica)", async () => {
    H.linhas = [aprovacao()];
    await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    const ops = nomesDeOp();
    expect(ops).toContain("delete");
    expect(ops.indexOf("delete")).toBeLessThan(ops.indexOf("insert"));
  });

  it("mãe sem patrocinador nenhum: devolve 0 sem apagar nem inserir nada", async () => {
    H.linhas = [];
    const n = await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    expect(n).toBe(0);
    expect(nomesDeOp()).not.toContain("delete");
    expect(nomesDeOp()).not.toContain("insert");
  });

  it("copia N patrocinadores de uma vez (um insert só)", async () => {
    H.linhas = [aprovacao({ sponsorId: "sp-1" }), aprovacao({ sponsorId: "sp-2" }), aprovacao({ sponsorId: "sp-3" })];
    const n = await storage.copyItemSponsorApprovals("mae-1", "filho-1");
    expect(n).toBe(3);
    expect(nomesDeOp().filter((o) => o === "insert")).toHaveLength(1);
    expect(valoresInseridos().every((c: any) => c.itemId === "filho-1")).toBe(true);
  });
});
