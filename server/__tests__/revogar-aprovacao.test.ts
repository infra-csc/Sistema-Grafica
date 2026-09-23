// ─────────────────────────────────────────────────────────────────────────────
// REVOGAR APROVAÇÃO — o Atendimento desfaz uma aprovação enquanto a peça está
// em aprovação ou na finalização da Arte.
//
// Pedido do dono (21/08/2026): "possibilidade de revogar aprovação — enquanto
// estiver no status de aprovação; Atendimento pode revogar enquanto estiver
// na finalização da arte".
//
// Já existia a rota /revert, como correção de ADMIN sem limite de status.
// Este arquivo fixa a ampliação, não uma rota nova:
//   1. Atendimento entra — mas SÓ em awaiting_sponsor_approval e
//      sponsor_approved. Admin continua sem limite (capacidade preservada).
//   2. Motivo opcional vai para a trilha; o nome do papel também.
//   3. Se a peça estava "aprovada por todos" e volta, a Arte é AVISADA —
//      ela estava finalizando.
//   4. Os dois lugares do cliente (Atendimento e Detalhe da peça) mostram o
//      botão pela MESMA regra, e as frases "somente um administrador pode
//      reverter" saem — seriam mentira.
// ─────────────────────────────────────────────────────────────────────────────

// Os itens 1–3 (servidor) rodam de verdade em regras-patrocinio-aprovacao
// (e em maquina-de-estados-da-peca). Aqui fica o item 4, o da tela.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ATEND = ler("client/src/pages/atendimento.tsx");
const DIALOG = ler("client/src/components/item-details-dialog.tsx");

describe("4 · o cliente mostra o botão pela mesma regra", () => {
  it("Atendimento: admin sempre, quem decide enquanto dá para revogar", () => {
    expect(ATEND).toContain('const podeRevogar = user?.role === "admin"');
    expect(ATEND).toContain('|| (canDecide && (selectedItem.status === "awaiting_sponsor_approval" || selectedItem.status === "sponsor_approved"));');
    expect(ATEND).toContain("{!isPending && !isRejectingThis && podeRevogar && (");
    expect(ATEND).toContain("data-testid={`button-revert-approval-${sponsor.id}`}");
  });

  it("o botão diz o que faz: Revogar quando estava aprovado, Reverter quando reprovado", () => {
    expect(ATEND).toContain("{isApproved ? 'Revogar' : 'Reverter'}");
    expect(ATEND).toContain("title={`${isApproved ? 'Revogar a aprovação' : 'Reverter a reprovação'} — volta a aguardar decisão");
  });

  it("a frase 'somente um administrador pode reverter' saiu dos dois modais de confirmação", () => {
    expect(ATEND).not.toContain("Somente um administrador pode reverter.");
    expect((ATEND.match(/Dá para revogar depois, enquanto a peça estiver em aprovação ou na finalização da Arte\./g) ?? []).length).toBe(2);
  });

  it("Detalhe da peça: a mesma regra, lendo o status cru da peça", () => {
    // Reescrito em 24/08 (caso #4176): a condição virou um bloco nomeado para
    // caber o caso incoerente — linha pendente com a peça avançada também
    // mostra o botão, agora como "reabrir". Papéis continuam os mesmos.
    expect(DIALOG).toContain('const podeAgir = user?.role === "admin" || (user?.role === "atendimento" && (rawStatus === "awaiting_sponsor_approval" || rawStatus === "sponsor_approved"));');
    expect(DIALOG).toContain('return podeAgir && approval && (approval.status !== "pending" || reabrirIncoerente);');
    expect(DIALOG).toContain(': `${approval.status === "approved" ? "Revogar a aprovação" : "Reverter a decisão"} — volta a aguardar (estava ${meta.label.toLowerCase()})`}');
  });
});
