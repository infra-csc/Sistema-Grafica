// ─────────────────────────────────────────────────────────────────────────────
// TODA PEÇA QUE ENTRA NA CORREÇÃO TEM COMO SAIR DELA.
//
// O defeito que este arquivo existe para impedir, contado uma vez:
//
// A #3027 (Eco Run Londrina) mostrava "Arquivo enviado" com o "Confirmar
// Re-envio" cinza e morto. Quem estava na Arte subia a arte nova e não tinha o
// que clicar. Eram TRÊS peças em produção nesse estado — #3027, #3042 e #1527.
//
// Dois bloqueios encadeados, os dois introduzidos por mim:
//
// 1. A consulta da Correção empurrava as peças devolvidas com
//    `awaitingArteApprovals: []` FIXO. O comentário que eu tinha escrito ali
//    dizia que "vazio é a resposta honesta, nunca houve linha de patrocinador"
//    — e era falso: a #3027 tinha Atlas Schindler em `awaiting_arte`, com
//    motivo escrito ("Mudar a ordem — colocar Atlas Schindler antes do
//    Bradesco"). O `[]` jogava esse dado fora, o seletor do modal ficava sem
//    nenhuma linha para marcar, e o botão — que exigia pelo menos um
//    patrocinador selecionado — nunca saía de desabilitado.
//
// 2. Mesmo com o botão liberado, o destino estava errado. A peça devolvida
//    inteira está em `awaiting_submission`, e a rota
//    `sponsor-approvals/resubmit` recusa qualquer status que não seja
//    `awaiting_sponsor_approval` — teria respondido 409. Quem serve este
//    status é `submit-for-approval`.
//
// A regra que fica: uma fila de trabalho não pode aceitar uma peça sem
// oferecer a porta de saída dela. Se entra na Correção, sai da Correção.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const rotas = readFileSync(path.resolve(__dirname, "../routes/items.ts"), "utf8");
const arte = readFileSync(path.resolve(__dirname, "../../client/src/pages/arte.tsx"), "utf8");

describe("Correção: a peça devolvida leva as aprovações que tem", () => {
  it("a consulta não empurra mais um array vazio fixo", () => {
    expect(rotas).not.toContain("awaitingArteApprovals: [],");
  });

  it("as devolvidas são enriquecidas a partir do mesmo mapa das demais", () => {
    // `approvalsByItem` já contém só o que está em `awaiting_arte`; reusá-lo é
    // o que garante que os dois ramos da consulta contem a mesma história.
    expect(rotas).toMatch(/for \(const item of devolvidasSemDono\) \{[\s\S]{0,220}approvalsByItem\.get\(item\.id\)/);
  });
});

describe("Correção: o botão de re-envio tem sempre um destino válido", () => {
  it("a peça devolvida inteira é reconhecida pelo status", () => {
    expect(arte).toContain('const devolvidaInteira = correcaoItem.status === "awaiting_submission";');
  });

  it("ela não é barrada por falta de patrocinador selecionado", () => {
    // Exigir escolha onde não há o que escolher é o beco sem saída original.
    expect(arte).toContain("const faltaPatrocinador = !devolvidaInteira && correcaoSelectedSponsorIds.size === 0;");
  });

  it("ela vai para submit-for-approval, que aceita awaiting_submission", () => {
    expect(arte).toContain("reenvioInteiroMutation.mutate({ itemId: correcaoItem.id, approvalThumbUrl: correcaoThumbUrl })");
    expect(arte).toMatch(/reenvioInteiroMutation[\s\S]{0,400}submit-for-approval/);
  });

  it("a devolução por patrocinador continua indo pela rota dela", () => {
    expect(arte).toContain("resubmitMutation.mutate({ itemId: correcaoItem.id, newThumbUrl: correcaoThumbUrl, sponsorIds: Array.from(correcaoSelectedSponsorIds) })");
  });

  it("a trava do botão é UMA expressão, e não seis cópias que divergem", () => {
    expect(arte).toContain("const travado = !correcaoThumbUrl || faltaPatrocinador || enviando;");
    // A condição crua repetida em background/color/cursor/boxShadow/hover foi o
    // que deixou o botão parecer clicável em um estilo e morto em outro.
    const cruas = arte.split("correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending").length - 1;
    expect(cruas).toBe(0);
  });

  it("o spinner cobre as DUAS mutações", () => {
    expect(arte).toContain("const enviando = resubmitMutation.isPending || reenvioInteiroMutation.isPending;");
  });
});

describe("Correção: a seção de patrocinadores nunca fica muda", () => {
  it("sem patrocinador reprovado, a tela explica o que o envio vai fazer", () => {
    expect(arte).toContain("correcaoItem.awaitingArteApprovals.length === 0 && (");
    expect(arte).toContain("esta peça foi devolvida inteira");
  });
});
