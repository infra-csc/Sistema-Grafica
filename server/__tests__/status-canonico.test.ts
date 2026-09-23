// ─────────────────────────────────────────────────────────────────────────────
// O VOCABULÁRIO DE STATUS É CANÔNICO NA ESCRITA (frente 5 do diagnóstico).
//
// A migração (scripts/unificar-status-legado.ts) converte os DADOS; este
// arquivo garante que o problema não volta pela porta da frente: nenhum
// código pode voltar a ESCREVER uma grafia legada. Sem esta guarda, a
// migração seria enxugar gelo — o próximo `status: "entregue"` recomeçaria a
// bifurcação que seis arquivos hoje remendam com listas duplas.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { rodarScript } from "./rodar-script";
import { readFileSync, readdirSync } from "fs";
import path from "path";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { CANONICO } = await import("../../scripts/unificar-status-legado");

const LEGADAS = Object.keys(CANONICO);

function arquivosDe(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory() && f.name !== "__tests__" && f.name !== "node_modules") out.push(...arquivosDe(p, ext));
    else if (ext.some((e) => f.name.endsWith(e))) out.push(p);
  }
  return out;
}

describe("nenhum código escreve grafia legada", () => {
  const raiz = path.resolve(__dirname, "../..");
  const fontes = [
    ...arquivosDe(path.join(raiz, "server"), [".ts"]),
    ...arquivosDe(path.join(raiz, "client/src"), [".ts", ".tsx"]),
  ].filter((p) => !p.includes("permissoes-scan"));

  it("não existe `status: \"<legada>\"` em atribuição nenhuma", () => {
    const violacoes: string[] = [];
    for (const arq of fontes) {
      const src = readFileSync(arq, "utf8");
      for (const g of LEGADAS) {
        // Escrita é `status: "x"` fora de listas de leitura. Leitores usam
        // arrays/Sets ("...", "...") e comparações — a forma de escrita é a
        // chave de objeto. Falso positivo aqui é preferível a falso negativo:
        // quem cair nesta rede legitimamente que escreva o canônico.
        const padrao = new RegExp(`status:\\s*["']${g}["']`);
        if (padrao.test(src)) violacoes.push(`${path.relative(raiz, arq)}: status: "${g}"`);
      }
    }
    expect(violacoes).toEqual([]);
  });
});

describe("o mapa da migração", () => {
  it("cobre as seis grafias que os leitores toleram", () => {
    expect(CANONICO).toEqual({
      pronto_para_producao: "ready_for_production",
      liberado: "approved",
      em_producao: "inProduction",
      produzido: "produced",
      conferido: "conferred",
      entregue: "delivered",
    });
  });

  it("todo destino é um status que o app escreve de verdade", () => {
    // Um typo no destino ("in_production") criaria uma TERCEIRA grafia — a
    // migração viraria geradora do problema que ela resolve.
    const ESCRITOS = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered"];
    for (const destino of Object.values(CANONICO)) {
      expect(ESCRITOS).toContain(destino);
    }
  });

  // A migração RODA aqui, sobre um banco de mentira (antes lia-se o texto do script).
  async function rodarMigracao(aplicar: boolean) {
    const { PgDialect } = await import("drizzle-orm/pg-core");
    const dialeto = new PgDialect();
    const sqls: Array<{ sql: string; params: unknown[] }> = [];
    const trilha: Array<Record<string, unknown>> = [];
    const contagem = [{ status: "em_producao", n: 3 }, { status: "inProduction", n: 7 }, { status: "entregue", n: 2 }];
    const cadeia = { from: () => cadeia, groupBy: async () => contagem };
    const db = {
      select: () => cadeia,
      execute: async (consulta: import("drizzle-orm").SQL) => { sqls.push(dialeto.sqlToQuery(consulta)); return { rowCount: 3 }; },
      insert: () => ({ values: async (v: Record<string, unknown>) => { trilha.push(v); } }),
      // Qualquer update() pelo query builder (o que updateItem faz) seria transição: não pode acontecer.
      update: () => { throw new Error("a migração não pode usar update() — grafia não é transição"); },
    };
    const { saidas } = await rodarScript({ nome: "unificar-status-legado", importar: () => import("../../scripts/unificar-status-legado"), args: aplicar ? ["--aplicar"] : [], db });
    return { sqls, trilha, saidas };
  }

  it("a migração é um UPDATE só da coluna status, por grafia — sem updateItem (statusChangedAt/updatedAt intocados)", async () => {
    const { sqls, saidas } = await rodarMigracao(true);
    expect(saidas[0]).toBe(0);
    // Só as grafias LEGADAS (inProduction já é canônica e fica fora).
    expect(sqls.map((s) => s.params)).toEqual([["inProduction", "em_producao"], ["delivered", "entregue"]]);
    for (const s of sqls) {
      expect(s.sql).toMatch(/UPDATE items SET status = \$1 WHERE status = \$2/);
      expect(s.sql).not.toMatch(/status_changed_at|updated_at/);
    }
  });

  it("deixa rastro na trilha, uma linha por grafia, em nome do Sistema", async () => {
    const { trilha } = await rodarMigracao(true);
    expect(trilha).toHaveLength(2);
    expect(trilha[0]).toMatchObject({ userName: "Sistema", entityType: "sistema", entityId: "unificacao-status" });
    expect(String(trilha[0].details)).toContain("Grafia de status unificada");
  });

  it("é ensaio por padrão: sem --aplicar não grava nada", async () => {
    const { sqls, trilha, saidas } = await rodarMigracao(false);
    expect(saidas[0]).toBe(0);
    expect(sqls).toEqual([]);
    expect(trilha).toEqual([]);
  });
});

describe("os leitores tolerantes continuam — são o cinto de segurança", () => {
  it("o funil de prazos ainda aceita as grafias antigas", async () => {
    // As grafias moram na etapa canônica (shared/fluxo-peca); o funil lê de lá.
    const { STATUS_STAGE_RANK } = await import("../services/prazo-domain");
    for (const s of ["pronto_para_producao", "em_producao", "liberado", "produzido", "conferido"]) {
      expect(STATUS_STAGE_RANK[s], s).toBe(STATUS_STAGE_RANK.ready_for_production);
    }
  });
});
