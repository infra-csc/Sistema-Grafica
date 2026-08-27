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
    // alargado no mesmo dia: a peça incoerente ANDA (arquivo final → revisão →
    // devolvida) sem fechar a rodada — o #4176 estava em Finalização de novo.
    expect(REVOGAR).toContain('const reabrirIncoerente = approval.status === "pending" && POS_APROVACAO.includes(currentItem.status);');
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
    expect(REVOGAR).toContain('if (POS_APROVACAO.includes(currentItem.status)) {');
    expect(REVOGAR).toContain('status: "awaiting_sponsor_approval",');
    expect(REVOGAR).toContain("segure a finalização");
  });
});
describe("3 · e a TELA oferece o clique no estado incoerente", () => {
  // O conserto do servidor existia e não havia onde clicar: o botão de
  // revogar só aparecia com a linha não-pendente. No estado herdado
  // ("Aguardando" + peça avançada) ele agora aparece, com o título dizendo
  // o que vai acontecer.
  const DIALOGO = readFileSync(new URL("../../client/src/components/item-details-dialog.tsx", import.meta.url), "utf8");

  it("linha pendente + peça avançada mostra o botão de reabrir", () => {
    expect(DIALOGO).toContain('const reabrirIncoerente = approval?.status === "pending" && pecaAvancada;');
    expect(DIALOGO).toContain('(approval.status !== "pending" || reabrirIncoerente)');
    expect(DIALOGO).toContain("a peça avançou com este patrocinador ainda aguardando");
  });

  it("a família de status é a MESMA do servidor — por import, não por cópia", () => {
    // A cópia cobrou o preço (25/08): o apelido legado awaiting_creator_review
    // entrou na lista canônica e a cópia do diálogo ficou para trás. Agora o
    // diálogo importa POS_APROVACAO de @shared/fluxo-peca — a mesma lista que
    // o servidor usa na revogação e no acrescentar.
    expect(DIALOGO).toContain('import { POS_APROVACAO } from "@shared/fluxo-peca";');
    expect(DIALOGO).toContain("const pecaAvancada = POS_APROVACAO.includes(rawStatus);");
    expect(DIALOGO).not.toContain('["sponsor_approved", "awaiting_finalization"');
  });

  it("pendente com a peça ainda em aprovação continua sem botão", () => {
    // pecaAvancada não inclui awaiting_sponsor_approval — nesse caso não há
    // mesmo o que fazer, e botão que só devolve 409 é armadilha.
    const i = DIALOGO.indexOf("const pecaAvancada = ");
    expect(DIALOGO.slice(i, i + 160)).not.toContain("awaiting_sponsor_approval");
  });
});
describe("4 · o reparo em massa drena o estoque de peças presas", () => {
  // O dono não deveria caçar peça por peça para clicar em reabrir: o script
  // devolve TODAS as incoerentes à fila do Atendimento de uma vez.
  const SCRIPT = readFileSync(new URL("../../scripts/reparar-aprovacao-incoerente.ts", import.meta.url), "utf8");

  it("o critério é o invariante do dono, com as exceções certas", () => {
    expect(SCRIPT).toContain('return ls.some((s) => s !== "approved");');
    expect(SCRIPT).toContain("if (c.skipApproval) return false;");
    expect(SCRIPT).toContain("if (!temVinculo.has(c.id)) return false;");
    expect(SCRIPT).toContain("if (ls.length === 0) return false;");
  });

  it("devolve à fila sem apagar trabalho, e não atropela decisão nova", () => {
    expect(SCRIPT).toContain("SET status = 'awaiting_sponsor_approval',");
    expect(SCRIPT).toContain("WHERE id = ${p.id} AND status = ${p.status}");
    expect(SCRIPT).not.toContain("final_file_url");
    expect(SCRIPT).not.toContain("approval_thumb_url");
  });

  it("deixa rastro na trilha e é ensaio por padrão", () => {
    expect(SCRIPT).toContain('peça pendente no Atendimento');
    expect(SCRIPT).toContain('process.argv.includes("--aplicar")');
  });
});



describe("5 · o admin adiciona o patrocinador que faltava, do próprio modal", () => {
  // Caso #2801 (25/08): a arte carregava a Crystal e não havia linha para
  // aprovar — a marca não estava vinculada à peça. Só admin.
  const SPONSORS = readFileSync(new URL("../routes/sponsors.ts", import.meta.url), "utf8");
  const ATEND = readFileSync(new URL("../../client/src/pages/atendimento.tsx", import.meta.url), "utf8");

  it("vincular numa peça em aprovação cria a linha pendente JUNTO", () => {
    // Sem a linha, o reenvio da Arte (que deriva das LINHAS) não incluiria o
    // recém-chegado, e a rodada poderia fechar sem ele.
    expect(SPONSORS).toContain('if (item.status === "awaiting_sponsor_approval" || item.status === "awaiting_approval") {');
    expect(SPONSORS).toContain('status: "pending",');
  });

  it("o bloco é só de admin, oferece os do evento E busca no catálogo inteiro", () => {
    // Revisto no mesmo dia: só-do-evento fazia o bloco SUMIR quando o evento
    // estava completo — e a marca da arte podia ser justamente a que falta
    // no evento (caso Crystal). Um de fora entra no evento junto.
    expect(ATEND).toContain('{user?.role === "admin" && (() => {');
    expect(ATEND).toContain('data-testid="input-busca-patrocinador"');
    expect(ATEND).toContain("!jaNaRodada.has(s.id) && !idsDoEvento.has(s.id)");
    expect(ATEND).toContain("fora do evento");
    expect(ATEND).toContain('await apiRequest("POST", `/api/events/${selectedItem.eventId}/sponsors`, { sponsorId: sp.id });');
    expect(ATEND).toContain('data-testid="button-add-patrocinador"');
  });

  it("a linha nova aparece na hora, como Aguardando decisão", () => {
    expect(ATEND).toContain('setSponsorApprovals(prev => [...prev, { itemId: selectedItem.id, sponsorId: sp.id, status: "pending" } as any]);');
  });

  it("a busca dos patrocinadores do evento só roda para admin com o modal aberto", () => {
    expect(ATEND).toContain('enabled: !!selectedItem?.eventId && dialogOpen && user?.role === "admin",');
  });
});
