// ─────────────────────────────────────────────────────────────────────────────
// OS REPAROS EM MASSA, RODANDO — os dois scripts que drenam estoque torto.
//
// De onde vieram (eram leituras do texto de scripts/*.ts):
//   · aprovar-atalho-e-revogar.test.ts §4 — reparar-aprovacao-incoerente.ts
//     (peça avançada com patrocinador "Aguardando" volta à fila, caso #4176);
//   · desvincular-patrocinador.test.ts — reparar-vinculos-de-evento.ts
//     (patrocinador na peça que o evento não conhece) e o serviço dele;
//   · acrescentar-patrocinador.test.ts — o script usa a MESMA lista
//     POS_APROVACAO de @shared/fluxo-peca.
// O script roda de verdade (import com o argv montado), com o banco de
// mentira; process.exit é interceptado para o processo do teste não morrer.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

const H = vi.hoisted(() => ({
  /** Linhas que cada SELECT devolve, pelo NOME da tabela do FROM (o script
   *  é recarregado a cada rodada, e a identidade do objeto da tabela muda). */
  tabelas: new Map<string, any[]>(),
  nome: (t: any): string => t?.[Symbol.for("drizzle:Name")],
  execs: [] as unknown[],
  inserts: [] as { tabela: string; valores: any }[],
  rowCount: (() => 1) as (q: unknown) => number,
}));

vi.mock("../db", () => {
  const select = () => ({
    from: (tabela: unknown) => {
      const q: any = {
        where: () => q, orderBy: () => q, groupBy: () => q,
        then: (ok: any, falha: any) => Promise.resolve(H.tabelas.get(H.nome(tabela)) ?? []).then(ok, falha),
      };
      return q;
    },
  });
  const insert = (tabela: unknown) => ({
    values: (valores: any) => {
      H.inserts.push({ tabela: H.nome(tabela), valores });
      const r: any = Promise.resolve([]);
      r.onConflictDoNothing = () => Promise.resolve([]);
      return r;
    },
  });
  const db: any = {
    select, insert,
    execute: async (q: unknown) => { H.execs.push(q); return { rowCount: H.rowCount(q), rows: [] }; },
    transaction: async (fn: any) => fn({ select, insert }),
  };
  return { db, pool: {} };
});
vi.mock("../storage", () => ({ storage: {} }));

import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { items, itemSponsorApprovals, itemSponsors, eventSponsors, sponsors, events, auditLogs } from "@shared/schema";
import { POS_APROVACAO } from "@shared/fluxo-peca";
import { listarVinculosEventoPendentes, aplicarVinculosEventoPendentes } from "../services/repararVinculosEvento";

/** Nomes das tabelas, para casar com o que o script (recarregado) usa. */
const T = {
  items: getTableName(items), itemSponsorApprovals: getTableName(itemSponsorApprovals), itemSponsors: getTableName(itemSponsors),
  eventSponsors: getTableName(eventSponsors), sponsors: getTableName(sponsors), events: getTableName(events), auditLogs: getTableName(auditLogs),
};

const dialeto = new PgDialect();
const emSql = (q: any) => dialeto.sqlToQuery(q);

// ── Rodar um script como `npx tsx scripts/x.ts [--aplicar]` ──────────────────
class SaidaDoScript extends Error {}
let codigos: number[] = [];
let saida: string[] = [];
let aoSair: () => void = () => {};

beforeAll(() => {
  // O script chama process.exit ao terminar — e o .catch dele chama de novo.
  // O primeiro exit PARA o script (lança); os seguintes só são anotados.
  vi.spyOn(process, "exit").mockImplementation(((c?: number) => {
    codigos.push(c ?? 0);
    aoSair();
    if (codigos.length === 1) throw new SaidaDoScript();
  }) as any);
});
afterAll(() => { vi.restoreAllMocks(); });

async function rodar(nome: string, carregar: () => Promise<unknown>, args: string[] = []) {
  vi.resetModules();
  codigos = []; saida = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { saida.push(a.join(" ")); });
  vi.spyOn(console, "error").mockImplementation(() => {});
  const argvAntes = process.argv;
  process.argv = ["node", `/app/scripts/${nome}.ts`, ...args];
  const terminou = new Promise<void>((r) => { aoSair = r; });
  try {
    await carregar();
    await terminou;
    // deixa o .catch do script rodar (o segundo exit) antes de seguir
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    process.argv = argvAntes;
  }
  return { codigo: codigos[0], texto: saida.join("\n") };
}

beforeEach(() => {
  H.tabelas = new Map();
  H.execs = [];
  H.inserts = [];
  H.rowCount = () => 1;
});

// ═════════════════════════════════════════════════════════════════════════════
// reparar-aprovacao-incoerente.ts
// ═════════════════════════════════════════════════════════════════════════════
describe("reparar-aprovacao-incoerente — devolve à fila as peças presas", () => {
  const script = () => import("../../scripts/reparar-aprovacao-incoerente");

  const cenario = () => {
    H.tabelas.set(T.items, [
      { id: "i1", displayId: "#4176", status: "awaiting_finalization", skipApproval: false }, // incoerente
      { id: "i2", displayId: "#0002", status: "sponsor_approved", skipApproval: false },       // todas aprovadas
      { id: "i3", displayId: "#0003", status: "awaiting_final_review", skipApproval: true },   // isenta
      { id: "i4", displayId: "#0004", status: "in_review", skipApproval: false },              // sem vínculo
      { id: "i5", displayId: "#0005", status: "awaiting_review", skipApproval: false },        // sem linha (fluxo antigo)
      { id: "i6", displayId: "#0006", status: "sponsor_approved", skipApproval: false },       // incoerente (awaiting_arte)
    ]);
    H.tabelas.set(T.itemSponsorApprovals, [
      { itemId: "i1", status: "approved" }, { itemId: "i1", status: "pending" },
      { itemId: "i2", status: "approved" },
      { itemId: "i3", status: "pending" },
      { itemId: "i4", status: "pending" },
      { itemId: "i6", status: "awaiting_arte" },
    ]);
    H.tabelas.set(T.itemSponsors, [{ itemId: "i1" }, { itemId: "i2" }, { itemId: "i3" }, { itemId: "i5" }, { itemId: "i6" }]);
  };

  it("a lista de status pós-aprovação é a de @shared/fluxo-peca (mesma referência)", async () => {
    const mod = await import("../../scripts/reparar-aprovacao-incoerente");
    expect(mod.POS_APROVACAO).toBe(POS_APROVACAO);
  });

  it("é ensaio por padrão: lista as incoerentes e não grava nada", async () => {
    cenario();
    const r = await rodar("reparar-aprovacao-incoerente", script);
    expect(r.codigo).toBe(0);
    expect(r.texto).toContain("6 peças pós-aprovação · 2 incoerentes");
    expect(r.texto).toContain("#4176");
    expect(r.texto).toContain("Nada foi gravado");
    expect(H.execs).toHaveLength(0);
    expect(H.inserts).toHaveLength(0);
  });

  it("o critério é o invariante do dono: não-isenta, com vínculo, com linha, e alguma linha não-aprovada", async () => {
    cenario();
    await rodar("reparar-aprovacao-incoerente", script, ["--aplicar"]);
    const reparadas = H.execs.map((q) => emSql(q).params[0]);
    expect(reparadas).toEqual(["i1", "i6"]);
  });

  it("devolve à fila sem apagar trabalho, e o WHERE repete o status lido (não atropela decisão nova)", async () => {
    cenario();
    await rodar("reparar-aprovacao-incoerente", script, ["--aplicar"]);
    const { sql, params } = emSql(H.execs[0]);
    expect(sql).toContain("SET status = 'awaiting_sponsor_approval'");
    expect(sql).toContain("sponsor_approved_by = NULL");
    expect(sql).toMatch(/WHERE id = \$1 AND status = \$2/);
    expect(params).toEqual(["i1", "awaiting_finalization"]);
    expect(sql).not.toContain("final_file_url");
    expect(sql).not.toContain("approval_thumb_url");
  });

  it("deixa rastro na trilha de cada peça reparada — e pula a que andou no meio tempo", async () => {
    cenario();
    H.rowCount = (q) => (emSql(q).params[0] === "i6" ? 0 : 1);
    const r = await rodar("reparar-aprovacao-incoerente", script, ["--aplicar"]);
    expect(H.inserts).toHaveLength(1);
    expect(H.inserts[0].tabela).toBe(T.auditLogs);
    expect(H.inserts[0].valores).toMatchObject({ entityType: "item", entityId: "i1", action: "updated" });
    expect(H.inserts[0].valores.details).toContain("peça pendente no Atendimento");
    expect(r.texto).toContain("andou no meio tempo — pulada");
    expect(r.texto).toContain("1 peças devolvidas à fila do Atendimento");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// reparar-vinculos-de-evento — o serviço e o script
// ═════════════════════════════════════════════════════════════════════════════
describe("repararVinculosEvento — só INSERE o vínculo de evento que falta", () => {
  const cenario = () => {
    H.tabelas.set(T.itemSponsors, [
      { itemId: "p1", sponsorId: "sp-livelo" },   // falta no evento
      { itemId: "p2", sponsorId: "sp-livelo" },   // mesma falta, outra prova
      { itemId: "p3", sponsorId: "sp-vale" },     // já está no evento
      { itemId: "p-orfa", sponsorId: "sp-vale" }, // peça excluída/sem evento: não prova nada
      { itemId: "p4", sponsorId: "sp-arq" },      // patrocinador arquivado
    ]);
    H.tabelas.set(T.eventSponsors, [{ eventId: "ev-1", sponsorId: "sp-vale" }]);
    H.tabelas.set(T.items, [
      { id: "p1", eventId: "ev-1", displayId: "#0001" },
      { id: "p2", eventId: "ev-1", displayId: "#0002" },
      { id: "p3", eventId: "ev-1", displayId: "#0003" },
      { id: "p4", eventId: "ev-1", displayId: "#0004" },
    ]);
    H.tabelas.set(T.sponsors, [
      { id: "sp-livelo", name: "Livelo", arquivadoEm: null },
      { id: "sp-vale", name: "Vale", arquivadoEm: null },
      { id: "sp-arq", name: "Antigo", arquivadoEm: new Date() },
    ]);
    H.tabelas.set(T.events, [{ id: "ev-1", name: "Primavera São Paulo" }]);
  };

  it("lista só o par evento↔patrocinador que falta, com as peças que provam", async () => {
    cenario();
    expect(await listarVinculosEventoPendentes()).toEqual([
      { eventId: "ev-1", sponsorId: "sp-livelo", eventName: "Primavera São Paulo", sponsorName: "Livelo", provas: ["#0001", "#0002"] },
    ]);
  });

  it("aplica: insere o vínculo SEM cota (idempotente) e deixa rastro", async () => {
    cenario();
    const r = await aplicarVinculosEventoPendentes({ userName: "Script de reparo" });
    expect(r).toMatchObject({ totalEncontrado: 1, aplicados: 1 });
    const vinculo = H.inserts.find((i) => i.tabela === T.eventSponsors)!.valores;
    expect(vinculo).toEqual({ eventId: "ev-1", sponsorId: "sp-livelo" });
    const log = H.inserts.find((i) => i.tabela === T.auditLogs)!.valores;
    expect(log).toMatchObject({ userName: "Script de reparo", entityType: "event_sponsor", entityId: "ev-1_sp-livelo" });
    expect(log.details).toContain("sem cota — defina no Vincular");
    // não remove nada, não toca peça nem aprovação
    expect(H.inserts.every((i) => i.tabela === T.eventSponsors || i.tabela === T.auditLogs)).toBe(true);
  });

  it("o script é dry-run por padrão e só grava com --aplicar", async () => {
    cenario();
    const script = () => import("../../scripts/reparar-vinculos-de-evento");
    const ensaio = await rodar("reparar-vinculos-de-evento", script);
    expect(ensaio.codigo).toBe(0);
    expect(ensaio.texto).toContain("Dry-run: nada gravado.");
    expect(H.inserts).toHaveLength(0);

    const aplicado = await rodar("reparar-vinculos-de-evento", script, ["--aplicar"]);
    expect(aplicado.codigo).toBe(0);
    expect(aplicado.texto).toContain("1 vínculo(s) criado(s)");
    expect(H.inserts.filter((i) => i.tabela === T.eventSponsors)).toHaveLength(1);
  });
});
