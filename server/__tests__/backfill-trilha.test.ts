// ─────────────────────────────────────────────────────────────────────────────
// O BACKFILL PELA TRILHA (frente 3 do diagnóstico de 24/08).
//
// O parser é a parte que pode mentir: se ele extrair o rótulo errado de uma
// linha da trilha, o carimbo herdado diria "parada aqui desde D" sobre um D
// de outra etapa. Estes testes rodam o parser contra os FORMATOS REAIS das
// linhas — copiados de server/routes/items.ts, não inventados.
//
// E a regra de segurança — o rótulo-alvo tem de bater com o status atual da
// peça, senão fica NULL — é conferida rodando o script sobre um banco de
// mentira.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { rodarScript } from "./rodar-script";

vi.mock("../db", () => ({ db: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { alvoDaTransicao } = await import("../../scripts/backfill-status-da-trilha");

describe("o parser contra os formatos reais da trilha", () => {
  it("a forma comum: 'Status alterado: X → Y (contexto)'", () => {
    expect(alvoDaTransicao("Status alterado: Rascunho → Aguardando Envio (enviada à Arte)"))
      .toBe("Aguardando Envio");
    expect(alvoDaTransicao("Status alterado: Aguardando Aprovação → Aguardando Finalização (aprovado pelo patrocinador)"))
      .toBe("Aguardando Finalização");
  });

  it("a forma do /edit: 'Status: X → Y' seguido de outros campos", () => {
    expect(alvoDaTransicao("Status: Aguardando Envio → Aguardando Aprovação; Quantidade: 3 → 5 un."))
      .toBe("Aguardando Aprovação");
  });

  it("devolução com motivo: corta no ponto E no parêntese", () => {
    expect(alvoDaTransicao("Status alterado: Aguardando Revisão Final → Rascunho (devolvida pela Arte ao solicitante). Motivo: medida errada"))
      .toBe("Rascunho");
    expect(alvoDaTransicao("Status alterado: Aguardando Envio → Rascunho (devolvida pela Arte ao solicitante, JÁ FORA DA ARTE). Motivo: refazer"))
      .toBe("Rascunho");
  });

  it("a forma com travessão: 'X → Y — quem precisa aprovar'", () => {
    expect(alvoDaTransicao("Status alterado: Aguardando Finalização → Aguardando Aprovação — Kiss FM precisa aprovar a nova versão"))
      .toBe("Aguardando Aprovação");
  });

  it("linha que não é transição devolve null — nunca um chute", () => {
    expect(alvoDaTransicao("Quantidade: 15 → 10 un.")).toBeNull();
    expect(alvoDaTransicao("Marcado para reaproveitamento")).toBeNull();
    expect(alvoDaTransicao("")).toBeNull();
  });

  it("seta dentro do MOTIVO não engana o parser", () => {
    // O motivo é texto livre; alguém escreve "mudar A → B" e o parser tem de
    // continuar lendo o alvo da TRANSIÇÃO, que vem antes do ". Motivo:".
    expect(alvoDaTransicao("Status alterado: Aguardando Envio → Rascunho (devolvida). Motivo: trocar logo → versão nova"))
      .toBe("Rascunho");
  });
});

describe("as regras de segurança, com o script RODANDO sobre um banco de mentira", () => {
  // Até 23/09 estas regras eram lidas no texto do script. Agora o main() roda
  // de verdade (o script se executa ao ser importado com o próprio nome em
  // argv[1]) e o que se confere é o que ele manda gravar.
  type Linha = { entityId: string; details: string; createdAt: Date };
  const D = (dia: number) => new Date(Date.UTC(2026, 7, dia, 12));

  async function rodarBackfill(cenario: { pecas: Array<{ id: string; status: string }>; linhas: Linha[]; aplicar: boolean }) {
    const updates: Array<{ sql: string; params: unknown[] }> = [];
    const { PgDialect } = await import("drizzle-orm/pg-core");
    // Pelo NOME da tabela: depois do resetModules o script carrega outra cópia do schema.
    const { getTableName } = await import("drizzle-orm");
    type Tabela = Parameters<typeof getTableName>[0];
    const dialeto = new PgDialect();
    const cadeia = (tabela: unknown) => {
      const c: Record<string, unknown> = {};
      c.where = () => c;
      c.orderBy = () => c;
      const nome = getTableName(tabela as Tabela);
      c.then = (ok: (v: unknown) => unknown) => ok(nome === "items" ? cenario.pecas : nome === "audit_logs" ? cenario.linhas : []);
      return c;
    };
    const dbFalso = {
      select: () => ({ from: (tabela: unknown) => cadeia(tabela) }),
      execute: async (consulta: import("drizzle-orm").SQL) => {
        updates.push(dialeto.sqlToQuery(consulta));
        return { rowCount: 1 };
      },
    };
    const { saidas } = await rodarScript({
      nome: "backfill-status-da-trilha",
      importar: () => import("../../scripts/backfill-status-da-trilha"),
      args: cenario.aplicar ? ["--aplicar"] : [],
      db: dbFalso,
    });
    return { updates, saidas };
  }

  it("o alvo tem de bater com o status ATUAL (pelo mesmo translateStatus) — divergência fica NULL", async () => {
    const { updates, saidas } = await rodarBackfill({
      aplicar: true,
      pecas: [{ id: "bate", status: "awaiting_submission" }, { id: "diverge", status: "awaiting_linking" }],
      linhas: [
        { entityId: "bate", details: "Status alterado: Rascunho → Aguardando Envio (enviada à Arte)", createdAt: D(10) },
        { entityId: "diverge", details: "Status alterado: Rascunho → Aguardando Envio (enviada à Arte)", createdAt: D(9) },
      ],
    });
    expect(saidas[0]).toBe(0);
    expect(updates).toHaveLength(1);
    expect(updates[0].params).toEqual([D(10), "bate"]);
  });

  it("só a transição MAIS RECENTE de cada peça decide (as linhas chegam da mais nova para a mais velha)", async () => {
    const { updates } = await rodarBackfill({
      aplicar: true,
      pecas: [{ id: "p1", status: "awaiting_submission" }],
      linhas: [
        // A mais nova diz outra etapa: a peça andou sem rastro — fica NULL,
        // mesmo havendo, mais atrás, uma linha que "bateria".
        { entityId: "p1", details: "Status alterado: Aguardando Envio → Aguardando Aprovação", createdAt: D(12) },
        { entityId: "p1", details: "Status alterado: Rascunho → Aguardando Envio", createdAt: D(5) },
      ],
    });
    expect(updates).toEqual([]);
  });

  it("linha que cita Status mas não é transição não decide — segue procurando a próxima", async () => {
    const { updates } = await rodarBackfill({
      aplicar: true,
      pecas: [{ id: "p1", status: "awaiting_submission" }],
      linhas: [
        { entityId: "p1", details: "Quantidade: 15 → 10 un. (Status: sem mudança)", createdAt: D(12) },
        { entityId: "p1", details: "Status alterado: Rascunho → Aguardando Envio", createdAt: D(5) },
      ],
    });
    expect(updates.map((u) => u.params)).toEqual([[D(5), "p1"]]);
  });

  it("o UPDATE repete o IS NULL — nunca sobrescreve um carimbo melhor", async () => {
    const { updates } = await rodarBackfill({
      aplicar: true,
      pecas: [{ id: "p1", status: "awaiting_submission" }],
      linhas: [{ entityId: "p1", details: "Status alterado: Rascunho → Aguardando Envio", createdAt: D(5) }],
    });
    expect(updates[0].sql).toMatch(/UPDATE items SET status_changed_at = \$1\s+WHERE id = \$2 AND status_changed_at IS NULL/);
  });

  it("é ensaio por padrão: sem --aplicar não grava nada", async () => {
    const { updates, saidas } = await rodarBackfill({
      aplicar: false,
      pecas: [{ id: "p1", status: "awaiting_submission" }],
      linhas: [{ entityId: "p1", details: "Status alterado: Rascunho → Aguardando Envio", createdAt: D(5) }],
    });
    expect(saidas[0]).toBe(0);
    expect(updates).toEqual([]);
  });
});
