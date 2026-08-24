// ─────────────────────────────────────────────────────────────────────────────
// O ATALHO DE APROVAÇÃO E A REVOGAÇÃO CONTAM A MESMA HISTÓRIA (caso #4176).
//
// A sequência real, 24/08: o admin revogou a aprovação da Vale (funcionou —
// a peça voltou para o Atendimento); o Atendimento aprovou de novo pelo
// ATALHO de peça inteira; o atalho mudava só o STATUS, sem tocar as linhas
// por patrocinador. Resultado: peça em "Aguardando Finalização" com a Vale
// "Aguardando" e "0 de 1 aprovaram" no modal — e a revogação seguinte
// respondia "Esta aprovação já está pendente". A peça ficava presa fora da
// fila, sem nenhum botão que a trouxesse de volta.
//
// Duas garantias, uma por lado:
//  1. o atalho passa a aprovar AS LINHAS junto com o status;
//  2. a revogação reconhece o estado incoerente herdado (linha pendente +
//     peça avançada) e REABRE a peça — é o que destrava as que já nasceram
//     assim, com o mesmo botão que o admin já usa.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const ITEMS = readFileSync(new URL("../routes/items.ts", import.meta.url), "utf8");

const rota = (assinatura: string, tamanho = 6000) => {
  const i = ITEMS.indexOf(assinatura);
  expect(i, assinatura).toBeGreaterThan(-1);
  return ITEMS.slice(i, i + tamanho);
};

describe("1 · o atalho aprova a peça INTEIRA — linhas incluídas", () => {
  const APROVAR = rota('app.patch("/api/items/:id/sponsor-approve"');

  it("toda linha não-aprovada vira approved, com autor e hora", () => {
    expect(APROVAR).toContain('if (linha.status === "approved") continue;');
    expect(APROVAR).toContain('status: "approved",');
    expect(APROVAR).toContain('approvedBy: req.userName ?? "Atendimento",');
    // e limpa o rastro de reprovação da linha, como o caminho normal faz
    expect(APROVAR).toContain("rejectionReason: null,");
  });

  it("o cache das Versões é invalidado — aprovação muda o que a tela mostra", () => {
    expect(APROVAR).toContain("invalidarCacheDeVersoes();");
  });
});

describe("2 · a revogação reabre o estado incoerente em vez de dar 409", () => {
  const REVOGAR = rota('sponsor-approvals/:sponsorId/revert"', 7000);

  it("linha pendente + peça avançada = reabrir, não recusar", () => {
    expect(REVOGAR).toContain('const reabrirIncoerente = approval.status === "pending" && currentItem.status === "sponsor_approved";');
    expect(REVOGAR).toContain('if (approval.status === "pending" && !reabrirIncoerente) {');
  });

  it("no caminho incoerente a linha NÃO é reescrita — ela já está pendente", () => {
    expect(REVOGAR).toContain("const updatedApproval = reabrirIncoerente ? approval :");
  });

  it("pendente com a peça ainda em aprovação continua 409 — aí não há o que fazer", () => {
    expect(REVOGAR).toContain('"Esta aprovação já está pendente"');
  });

  it("a trilha explica o estado herdado com todas as letras", () => {
    expect(REVOGAR).toContain("estado herdado do atalho de aprovação");
    expect(REVOGAR).toContain("Item reaberto:");
  });

  it("a reabertura usa o MESMO caminho de sempre (status volta, Arte avisada)", () => {
    expect(REVOGAR).toContain('if (currentItem.status === "sponsor_approved") {');
    expect(REVOGAR).toContain('status: "awaiting_sponsor_approval",');
    expect(REVOGAR).toContain("segure a finalização");
  });
});
