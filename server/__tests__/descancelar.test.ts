// ─────────────────────────────────────────────────────────────────────────────
// DESCANCELAR (dono, 01/09: "botão para adm descancelar item e ele voltar no
// fluxo onde estava").
//
// As decisões que este arquivo pina:
//   · SÓ ADMIN — descancelar recoloca trabalho na fila de alguém; é gestão.
//   · O cancelamento agora GRAVA de onde a peça saiu (statusBeforeCancel),
//     no individual e no lote — e cancelar de novo não sobrescreve.
//   · O descancelar restaura em ordem de confiança: coluna → trilha de
//     auditoria ("Status alterado: X → Y") → "requested", sempre dizendo na
//     trilha qual das três fontes valeu.
//   · Evento finalizado barra — mexer ali reescreve número fechado, igual ao
//     cancelamento.
//   · O botão vive na FICHA da peça, só para admin e só em cancelada — a
//     mesma exceção da reversão de aprovação (corrigir lançamento é dado,
//     não atalho de fluxo).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/items.ts");
const SCHEMA = ler("shared/schema.ts");
const FICHA = ler("client/src/components/item-details-dialog.tsx");
const REGUA = ler("shared/permissoes.ts");

describe("o servidor", () => {
  it("a rota existe, é só de admin, e está declarada na régua", () => {
    expect(ROTA).toContain('app.patch("/api/items/:id/uncancel", requireAuth');
    expect(ROTA).toContain("Apenas administradores podem descancelar itens");
    expect(REGUA).toContain('rota: "/api/items/:id/uncancel", papeis: ["admin"]');
  });

  it("o cancelamento grava DE ONDE a peça saiu — individual e lote, sem sobrescrever no re-cancelamento", () => {
    expect(SCHEMA).toContain('statusBeforeCancel: text("status_before_cancel")');
    const gravacoes = ROTA.match(/statusBeforeCancel: currentItem\.status === "canceled" \? currentItem\.statusBeforeCancel : currentItem\.status/g) ?? [];
    expect(gravacoes.length).toBe(2); // /cancel e /bulk-cancel
  });

  it("restaura em ordem de confiança: coluna → trilha → requested, e a trilha diz qual valeu", () => {
    expect(ROTA).toContain('let origem = "registrado no cancelamento";');
    expect(ROTA).toContain('origem = "inferido pela trilha de auditoria";');
    expect(ROTA).toContain('origem = "sem registro do status anterior — voltou ao início do fluxo";');
    expect(ROTA).toContain("Item descancelado — voltou para ${translateStatus(alvo)} (${origem})");
    // e limpa a coluna ao restaurar
    expect(ROTA).toContain("statusBeforeCancel: null,");
  });

  it("só peça CANCELADA descancela, e evento finalizado barra", () => {
    expect(ROTA).toContain("A peça não está cancelada — nada a descancelar");
    const trecho = ROTA.slice(ROTA.indexOf("/api/items/:id/uncancel"), ROTA.indexOf("/api/items/bulk-cancel"));
    expect(trecho).toContain("barraEventoFinalizado(currentItem, res)");
  });

  it("a inferência pela trilha nunca devolve 'canceled' — seria descancelar para o próprio cancelamento", () => {
    expect(ROTA).toContain('if (chave && chave !== "canceled")');
  });
});

describe("a ficha da peça", () => {
  it("o botão aparece só para admin e só em cancelada", () => {
    expect(FICHA).toContain('rawStatus === "canceled" && user?.role === "admin"');
    expect(FICHA).toContain('data-testid="button-descancelar"');
  });

  it("chama a rota certa e conta para onde a peça voltou", () => {
    expect(FICHA).toContain("/uncancel`");
    expect(FICHA).toContain('toast({ title: "Peça descancelada"');
    expect(FICHA).toContain("Voltou para");
  });
});
