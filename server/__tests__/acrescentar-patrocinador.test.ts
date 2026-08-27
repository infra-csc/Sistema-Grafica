// ─────────────────────────────────────────────────────────────────────────────
// ACRESCENTAR UM PATROCINADOR DEPOIS DO ENVIO À ARTE (pedido do dono, 25/08).
//
// O caso real: a lista da Primavera RJ já estava vinculada e enviada quando a
// Karina avisou que, nesta etapa, o Ministério precisa aprovar alguns itens.
// Não havia caminho — a tela trava o vínculo depois do envio, a rota de
// re-sincronizar recusa fora da fase de vinculação, e "devolver para a criação"
// apagaria os vínculos certos.
//
// A DISTINÇÃO QUE ESTE ARQUIVO GUARDA, e é o coração da coisa:
//   · `sponsors/sync` recebe a lista INTEIRA e SUBSTITUI → perigoso depois do
//     envio (apagaria em silêncio o que não fosse remarcado);
//   · esta rota só SOMA um patrocinador → segura em qualquer fase até a
//     aprovação fechar.
// Se um dia alguém "unificar" as duas, o estrago volta.
//
// A RÉGUA DE ATÉ ONDE (dono, 25/08): "pode vincular até a peça ser aprovada,
// até em correção; caso seja aprovada, não pode mais".
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/sponsors.ts");
const TELA = ler("client/src/pages/vincular-patrocinadores.tsx");
const PERMISSOES = ler("shared/permissoes.ts");

/** O corpo da rota nova, isolado, para os asserts não pegarem outra. */
const bloco = (() => {
  const i = ROTA.indexOf('app.post("/api/items/bulk-add-sponsor"');
  expect(i).toBeGreaterThan(-1);
  return ROTA.slice(i, ROTA.indexOf('app.post("/api/items/:id/return-to-creation"'));
})();

describe("a rota só SOMA — nunca reescreve", () => {
  it("não apaga vínculo, não mexe em skipApproval, não toca em quem já decidiu", () => {
    expect(bloco).toContain("storage.addSponsorToItem(");
    // o que NÃO pode estar aqui
    expect(bloco).not.toContain("bulkSyncItemSponsors");
    expect(bloco).not.toContain("removeSponsorFromItem");
    expect(bloco).not.toContain("skipApproval");
    expect(bloco).not.toContain("deleteItemSponsorApproval");
  });

  it("peça que já tem o patrocinador é contada, não duplicada", () => {
    expect(bloco).toContain("if (jaNaPeca) { jaTinham.push(rotulo); continue; }");
  });

  it("vincula ao EVENTO antes da peça — marca que o evento não conhece foi bug", () => {
    // É o desencontro que o reparo de vínculos teve de limpar: peça com marca
    // que o Vincular Patrocinadores não mostrava.
    expect(bloco).toContain("storage.addSponsorToEvent(");
    expect(bloco).toContain("eventosJaVinculados");
  });
});

describe("até a aprovação fechar — inclusive em correção", () => {
  it("aceita da criação até a peça estar em aprovação", () => {
    expect(bloco).toContain('"draft", "requested", "awaiting_linking", "awaiting_submission",');
    expect(bloco).toContain('"awaiting_approval", "awaiting_sponsor_approval",');
  });

  it("a CORREÇÃO já está coberta pelos mesmos dois estados", () => {
    // Patrocinador reprovou: a PEÇA fica em awaiting_sponsor_approval e só a
    // LINHA dele vai para awaiting_arte (ver a rota de reject em items.ts).
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).toContain("status: 'awaiting_arte',");
    expect(ITEMS).toContain('if (currentItem.status !== "awaiting_sponsor_approval") {');
    // Revisor devolveu à Arte: a peça volta para awaiting_submission.
    expect(ITEMS).toContain('status: "awaiting_submission",');
    // E o comentário da rota explica isso para quem vier depois.
    expect(bloco).toContain("A CORREÇÃO está aqui dentro");
  });

  it("peça que JÁ PASSOU (finalização/revisão) REABRE — e só o novo decide", () => {
    // Segunda rodada da regra (dono, 25/08): "quando já passou para a revisão
    // ou foi aprovada, volta só ela para aprovação — só um patrocinador".
    expect(bloco).toContain("const jaPassou = POS_APROVACAO.includes(item.status);");
    expect(bloco).toContain('status: "awaiting_sponsor_approval",');
    // quem já aprovou NÃO decide de novo: as linhas deles não são tocadas
    // (nenhum reset de aprovação existe neste bloco)
    expect(bloco).not.toContain("initializeItemSponsorApprovals");
    expect(bloco).not.toContain('status: "pending" } as any)); //');
    // a arte que a Arte subiu FICA — reabrir é sobre a decisão
    expect(bloco).not.toContain("finalFileUrl: null");
    expect(bloco).not.toContain("approvalThumbUrl: null");
    // e a Arte é avisada para segurar a finalização
    expect(bloco).toContain("segure a finalização");
    expect(bloco).toContain('targetRoles: ["arte"],');
    // a trilha explica o que aconteceu
    expect(bloco).toContain("voltou para a aprovação; só ele decide, os demais seguem aprovados");
  });

  it("a REGRA DA REABERTURA é a mesma da revogação — lista única em shared", () => {
    // POS_APROVACAO saiu da rota de revogar e do script de reparo para
    // @shared/fluxo-peca; três cópias divergiriam no primeiro status novo.
    const FLUXO = ler("shared/fluxo-peca.ts");
    expect(FLUXO).toContain("export const POS_APROVACAO: readonly string[] = [");
    const ITEMS = ler("server/routes/items.ts");
    expect(ITEMS).not.toContain('const POS_APROVACAO = ["sponsor_approved"');
    expect(ler("scripts/reparar-aprovacao-incoerente.ts")).toContain('from "../shared/fluxo-peca"');
  });

  it("o corte é a LIBERAÇÃO para a produção — dali em diante recusa, com o porquê", () => {
    expect(bloco).toContain("if (!ACEITA.includes(item.status) && !jaPassou) {");
    expect(bloco).toContain("já foi liberada para a produção");
    expect(bloco).toContain("a peça é da Gráfica");
    // ready_for_production não está em nenhuma das duas listas de entrada
    const listaAceita = bloco.slice(bloco.indexOf("const ACEITA"), bloco.indexOf("const EM_APROVACAO"));
    expect(listaAceita).not.toContain("ready_for_production");
    expect(ler("shared/fluxo-peca.ts").slice(0, 99999)).not.toMatch(/POS_APROVACAO[\s\S]{0,400}ready_for_production/);
  });

  it("a pendência de aprovação nasce quando há rodada — em curso ou reaberta", () => {
    expect(bloco).toContain('const EM_APROVACAO = ["awaiting_approval", "awaiting_sponsor_approval"];');
    expect(bloco).toContain("if (EM_APROVACAO.includes(item.status) || jaPassou) {");
    expect(bloco).toContain("storage.createItemSponsorApproval({ itemId, sponsorId, status: \"pending\" }");
  });
});

describe("o lote é honesto sobre o que não fez", () => {
  it("recusa por peça, com motivo, e o resto do lote passa", () => {
    expect(bloco).toContain("const recusadas: { displayId: string; motivo: string }[] = [];");
    expect(bloco).toContain("recusadas.push({ displayId: rotulo, motivo:");
    expect(bloco).toContain("recusadas,");
  });

  it("evento finalizado usa a guarda da casa, e o lote inteiro barrado vira 409", () => {
    expect(bloco).toContain("await motivoEventoDaPeca(item)");
    expect(bloco).toContain("bloqueio.respondeLoteInteiro(res,");
  });

  it("a trilha diz o que vai acontecer com a aprovação", () => {
    expect(bloco).toContain("entra na rodada de aprovação em curso");
    expect(bloco).toContain("entrará na aprovação quando a Arte enviar o layout");
  });
});

describe("a tela", () => {
  it("peça já enviada passou a ser selecionável — para acrescentar, não para reescrever", () => {
    expect(TELA).toContain("const podeSelecionar = estado === 'PENDENTE' || estado === 'RASCUNHO' || (estado === 'ENVIADO' && podeAcrescentar);");
    expect(TELA).toContain('data-testid="button-acrescentar-sponsor"');
  });

  it("APLICAR continua fora das enviadas, e o desconto é dito ANTES do clique", () => {
    // O servidor recusaria de qualquer jeito; mandar renderia erro por peça.
    expect(TELA).toContain("const allSelectedItems = Array.from(selectedItemIds).filter(");
    expect(TELA).toContain("(id) => !optimisticSentIds.has(id) && (itemUIStates[id] || 'PENDENTE') !== 'ENVIADO',");
    expect(TELA).toContain('data-testid="aviso-selecao-enviadas"');
    expect(TELA).toContain("nelas só dá para acrescentar");
  });

  it("cada botão diz em quantas peças ELE age", () => {
    expect(TELA).toContain("Acrescentar em {idsSelecionados.length}");
    expect(TELA).toContain("{naVinculacao > 0 && (");
  });

  it("o resultado conta as recusadas — sumir com elas mentiria sobre o lote", () => {
    expect(TELA).toContain("não pôde(ram):");
  });

  it("só admin e solicitação — mais restrito que vincular na fase normal", () => {
    // Decisão do dono (25/08): a ação alcança peça que já saiu da vinculação, e
    // em peça em aprovação ela cria pendência nova para alguém decidir. Quem
    // faz isso é quem responde pela lista.
    expect(ROTA).toContain('const requireAcrescentarSponsor = requireRole("admin", "solicitacao");');
    expect(ROTA).toContain('app.post("/api/items/bulk-add-sponsor", requireAcrescentarSponsor');
    expect(PERMISSOES).toContain('{ metodo: "POST", rota: "/api/items/bulk-add-sponsor", papeis: ["admin", "solicitacao"] }');
    // e a tela não oferece o que o servidor recusaria
    expect(TELA).toContain('const podeAcrescentar = user?.role === "admin" || user?.role === "solicitacao";');
    expect(TELA).toContain("{podeAcrescentar && (");
    // sem a ação, marcar peça enviada seria caixa que não leva a botão nenhum
    expect(TELA).toContain("(estado === 'ENVIADO' && podeAcrescentar)");
  });
});
