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
//
// As garantias do SERVIDOR (§1 atalho, §2 revogação, §4 reparo em massa e o
// vínculo que cria a linha pendente em §5) rodam de verdade em
// regras-patrocinio-aprovacao, regras-patrocinio-reparos e
// regras-patrocinio-vinculos. Aqui ficam as da TELA.
import { describe, it, expect } from "vitest";
import { fonteDaTela } from "./fonte-da-tela";
import { fonteDoComponente } from "./fonte-dos-componentes";

describe("3 · e a TELA oferece o clique no estado incoerente", () => {
  // O conserto do servidor existia e não havia onde clicar: o botão de
  // revogar só aparecia com a linha não-pendente. No estado herdado
  // ("Aguardando" + peça avançada) ele agora aparece, com o título dizendo
  // o que vai acontecer.
  const DIALOGO = fonteDoComponente("client/src/components/item-details-dialog.tsx");

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
describe("5 · o admin adiciona o patrocinador que faltava, do próprio modal", () => {
  // Caso #2801 (25/08): a arte carregava a Crystal e não havia linha para
  // aprovar — a marca não estava vinculada à peça. Só admin.
  const ATEND = fonteDaTela("atendimento");

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
    expect(ATEND).toContain('setSponsorApprovals(prev => [...prev, { itemId: selectedItem.id, sponsorId: sp.id, status: "pending" }]);');
  });

  it("a busca dos patrocinadores do evento só roda para admin com o modal aberto", () => {
    expect(ATEND).toContain('enabled: !!selectedItem?.eventId && dialogOpen && user?.role === "admin",');
  });
});
