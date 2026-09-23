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
//
// A ROTA (só soma, a isenção só cai, até onde aceita, reabertura, lote
// honesto) roda de verdade em regras-patrocinio-vinculos; a lista única do
// script de reparo, em regras-patrocinio-reparos. Aqui ficam a tela e a
// régua de papéis (que cruza tela, rota e shared/permissoes).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const ROTA = ler("server/routes/sponsors.ts");
const TELA = ler("client/src/pages/vincular-patrocinadores.tsx");
const PERMISSOES = ler("shared/permissoes.ts");

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

  it("a seleção é CONGELADA na abertura do diálogo — o bug do 'Acrescentar em 0'", () => {
    // O efeito de auto-deselect (escrito quando ENVIADO não era marcável)
    // esvaziava a seleção no render seguinte ao clique: a pessoa marcava 12 e
    // o diálogo dizia zero. Duas defesas, e as duas ficam:
    // 1 · o efeito passa a manter ENVIADO quando a ação existe — a lista dele
    //     tem de ser a MESMA do podeSelecionar da linha;
    expect(TELA).toContain("(st === 'ENVIADO' && podeAcrescentar)");
    // 2 · o diálogo congela o alvo na abertura e confirma sobre ELE — refetch
    //     nenhum esvazia o que a pessoa já está vendo;
    expect(TELA).toContain("setAcrescentarAlvo(Array.from(selectedItemIds));");
    expect(TELA).toContain("itemIds: acrescentarAlvo });");
    // e zero peças nunca vira request (era o erro cru 'itemIds deve ser…')
    expect(TELA).toContain("if (!acrescentarSponsorId || acrescentarAlvo.length === 0) return;");
  });

  it("os chips atualizam sem F5 — o cache por peça é descartado no sucesso", () => {
    // Os vínculos por peça são derivados UMA vez (loadedItemIdsRef) e o merge
    // preserva a entrada velha por cima do refetch — os chips ficavam
    // mentindo até o F5 (caso Mandala, 25/08).
    expect(TELA).toContain("for (const id of variables.itemIds) delete nx[id];");
    expect(TELA).toContain("for (const id of variables.itemIds) loadedItemIdsRef.current.delete(id);");
  });

  it("a lista de patrocinadores sai em ordem alfabética", () => {
    // Erro apontado pelo dono: o cadastro vem na ordem do banco, e achar
    // "Ministério" numa lista embaralhada era rolar e torcer.
    expect(TELA).toContain(".sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR'))");
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
