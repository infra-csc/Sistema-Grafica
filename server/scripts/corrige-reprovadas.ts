/**
 * CORREÇÃO PONTUAL — peças devolvidas pelo CRIADOR, presas em "Aguardando envio".
 *
 * Contexto. Até 17/08 as quatro rotas de devolução do criador (creator-reject,
 * bulk-creator-reject, return-to-arte, bulk-return-to-arte) mandavam a peça
 * para `awaiting_submission`: o começo do fluxo, a fila de quem NUNCA foi
 * enviado — 1.120 peças na produção. Mas a devolução da Revisão acontece
 * DEPOIS de o patrocinador ter aprovado o layout: o que falhou foi o arquivo
 * final, não a arte.
 *
 * A regra do dono (17/08) é que ela volte para a FINALIZAÇÃO. As rotas já
 * fazem isso — mandam para `sponsor_approved`, o status que alimenta a aba
 * "Finalizar arte". Este script arruma as peças que ficaram para trás.
 *
 * (As devolvidas por PATROCINADOR não precisam de script: a aba Correção
 * passou a pescá-las pelo `rejectedBySponsor`, sem escrever no banco.)
 *
 * O QUE ELE MEXE — e só isso:
 *   peças em `awaiting_submission`, com `rejected_by_creator = true`, QUE JÁ
 *   TENHAM PASSADO pela aprovação do patrocinador.
 *
 * Por que a terceira condição: `sponsor_approved` afirma que o patrocinador
 * aprovou. Numa peça que nunca chegou lá isso seria mentira gravada no banco —
 * ela pularia a aprovação inteira e cairia na Gráfica sem ninguém ter dito sim.
 * Essas ficam INTOCADAS e são listadas no fim para decisão humana.
 *
 * Uso:
 *   npx tsx server/scripts/corrige-reprovadas.ts           (simulação, padrão)
 *   npx tsx server/scripts/corrige-reprovadas.ts --gravar  (aplica)
 */
import { db } from "../db";
import { items, itemSponsorApprovals, auditLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const GRAVAR = process.argv.includes("--gravar");

async function main() {
  const candidatas = await db
    .select()
    .from(items)
    .where(and(eq(items.status, "awaiting_submission"), eq(items.rejectedByCreator, true)));

  const paraCorrigir: typeof candidatas = [];
  const semAprovacao: typeof candidatas = [];

  for (const peca of candidatas) {
    const aprovacoes = await db
      .select()
      .from(itemSponsorApprovals)
      .where(eq(itemSponsorApprovals.itemId, peca.id));

    // "Passou pela aprovação" tem três formas legítimas, e basta uma:
    //   · o carimbo do fluxo (sponsorApprovedAt),
    //   · todas as linhas de patrocinador aprovadas,
    //   · a peça ser isenta de aprovação (skipApproval) — nesse caso o fluxo
    //     manda `awaiting_submission` direto para a revisão, sem passar por
    //     patrocinador nenhum, e a finalização é o lugar certo mesmo assim.
    const passou =
      peca.sponsorApprovedAt != null ||
      (peca as any).skipApproval === true ||
      (aprovacoes.length > 0 && aprovacoes.every((a) => a.status === "approved"));

    (passou ? paraCorrigir : semAprovacao).push(peca);
  }

  console.log(`\nCandidatas (awaiting_submission + devolvida pelo criador): ${candidatas.length}`);
  console.log(`  · já passaram pela aprovação (serão corrigidas): ${paraCorrigir.length}`);
  console.log(`  · nunca chegaram à aprovação (ficam como estão): ${semAprovacao.length}\n`);

  for (const peca of paraCorrigir) {
    console.log(`  ${GRAVAR ? "CORRIGINDO" : "simulação"}  ${peca.displayId} — awaiting_submission → sponsor_approved`);
    if (!GRAVAR) continue;

    await db
      .update(items)
      .set({ status: "sponsor_approved" })
      .where(eq(items.id, peca.id));

    // Uma peça que muda de status sem linha no histórico é a próxima
    // investigação de alguém — a correção se registra como qualquer escrita.
    await db.insert(auditLogs).values({
      userId: null,
      userName: "Sistema",
      action: "updated",
      entityType: "item",
      entityId: peca.id,
      details:
        "Correção pontual: peça devolvida pela Revisão estava em Aguardando Envio por causa do " +
        "comportamento antigo das rotas de devolução. Movida para Aguardando Finalização, que é " +
        "onde ela precisa ser refeita — a aprovação do patrocinador segue valendo.",
    });
  }

  if (semAprovacao.length > 0) {
    console.log(`\n  Estas ficaram INTOCADAS — nunca passaram pela aprovação do patrocinador,`);
    console.log(`  e marcá-las como aprovadas seria gravar uma mentira no banco:`);
    for (const peca of semAprovacao) console.log(`    ${peca.displayId}`);
  }

  console.log(GRAVAR ? "\nFeito.\n" : "\nNada foi gravado. Rode com --gravar para aplicar.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
