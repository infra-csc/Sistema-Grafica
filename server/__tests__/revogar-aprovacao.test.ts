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

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const ITEMS = ler("server/routes/items.ts");
const ATEND = ler("client/src/pages/atendimento.tsx");
const DIALOG = ler("client/src/components/item-details-dialog.tsx");

const rota = () => {
  const i = ITEMS.indexOf('app.post("/api/items/:id/sponsor-approvals/:sponsorId/revert"');
  // 8000: a rota cresceu em 24/08 (reabertura do estado incoerente + regra
  // do dono comentada) e a janela antiga cortava o bloco de notificação.
  return ITEMS.slice(i, i + 8000);
};

describe("1 · quem pode, e quando", () => {
  it("Atendimento e admin passam pelo papel; os outros não", () => {
    expect(rota()).toContain('if (req.userRole !== "admin" && req.userRole !== "atendimento") {');
    expect(rota()).toContain("Apenas Atendimento e administradores podem revogar uma aprovação");
  });

  it("Atendimento só em aprovação ou finalização da Arte; admin sem limite", () => {
    expect(ITEMS).toContain('const STATUS_REVOGAVEL = ["awaiting_sponsor_approval", "sponsor_approved"];');
    expect(rota()).toContain('if (req.userRole !== "admin" && !STATUS_REVOGAVEL.includes(currentItem.status)) {');
    expect(rota()).toContain("Só dá para revogar enquanto a peça está em aprovação ou na finalização da Arte. Status atual:");
  });

  it("o limite de status vem DEPOIS do evento finalizado e ANTES de mexer na aprovação", () => {
    const r = rota();
    const evento = r.indexOf("if (await barraEventoFinalizado(currentItem, res)) return;");
    const limite = r.indexOf("!STATUS_REVOGAVEL.includes(currentItem.status)");
    const mexe = r.indexOf("await storage.updateItemSponsorApproval(approval.id, {");
    expect(evento).toBeGreaterThan(-1);
    expect(limite).toBeGreaterThan(evento);
    expect(mexe).toBeGreaterThan(limite);
  });
});

describe("2 · a trilha diz quem, o quê e por quê", () => {
  it("motivo opcional, aparado e limitado", () => {
    expect(rota()).toContain('const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim().slice(0, 500) : "";');
  });

  it("o papel e o motivo entram no log; 'aprovação' vs 'decisão' conforme o que estava", () => {
    expect(rota()).toContain('${req.userRole === "admin" ? "Administrador" : "Atendimento"} revogou a ${previousStatus === "approved" ? "aprovação" : "decisão"} de');
    expect(rota()).toContain("${motivo ? `. Motivo: ${motivo}` : ''}");
  });
});

describe("3 · a peça aprovada por todos volta, e a Arte fica sabendo", () => {
  it("reabre de sponsor_approved para awaiting_sponsor_approval (capacidade antiga, preservada)", () => {
    const r = rota();
    // 24/08: reabre de QUALQUER status pós-aprovação — regra do dono: linha
    // "Aguardando" ⇒ a peça volta pendente no Atendimento.
    expect(r).toContain('if (POS_APROVACAO.includes(currentItem.status)) {');
    expect(r).toContain('status: "awaiting_sponsor_approval",');
    expect(r).toContain("sponsorApprovedBy: null,");
  });

  it("e só nesse caso notifica a Arte para segurar a finalização", () => {
    const r = rota();
    const i = r.indexOf("if (item.status !== currentItem.status) {");
    const bloco = r.slice(i, i + 1800);
    expect(bloco).toContain('targetRoles: ["arte"]');
    expect(bloco).toContain("revogada — segure a finalização");
    expect(bloco).toContain('broadcast({ type: "notification_created", notification });');
  });
});

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
    expect(DIALOG).toContain('{(user?.role === "admin" || (user?.role === "atendimento" && (rawStatus === "awaiting_sponsor_approval" || rawStatus === "sponsor_approved"))) && approval && approval.status !== "pending" && (');
    expect(DIALOG).toContain('title={`${approval.status === "approved" ? "Revogar a aprovação" : "Reverter a decisão"} — volta a aguardar (estava ${meta.label.toLowerCase()})`}');
  });
});
