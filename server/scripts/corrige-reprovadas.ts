/**
 * CORREÇÃO PONTUAL — peças de retrabalho presas em "Aguardando envio".
 *
 * Contexto: até 17/08 existiam DUAS portas de reprovação (ver o comentário no
 * lugar da antiga rota `sponsor-reject`, em server/routes/items.ts). A que
 * reprovava a peça inteira mandava para `awaiting_submission`, no meio das
 * peças que nunca foram enviadas, em vez de deixá-la no par que alimenta a aba
 * Correção da Arte (`awaiting_sponsor_approval` + linha do patrocinador em
 * `awaiting_arte`). A porta foi removida; este script arruma o que ela deixou.
 *
 * O QUE ELE MEXE — e só isso:
 *   peças com status `awaiting_submission`, `rejected_by_sponsor = true` E que
 *   JÁ TENHAM pelo menos uma aprovação em `awaiting_arte`.
 *
 * Por que essa terceira condição: é ela que diz QUEM pediu a mudança. Sem
 * nenhuma linha em `awaiting_arte` não há como saber qual patrocinador
 * reprovou, e inventar um seria pior do que deixar a peça onde está. As peças
 * nesse caso são LISTADAS no fim para decisão humana, não tocadas.
 *
 * Não mexe em peça reprovada pelo CRIADOR (`rejected_by_creator`): aquele é o
 * caminho Revisão → Arte, que não passa por patrocinador nenhum.
 *
 * Uso:
 *   npx tsx server/scripts/corrige-reprovadas.ts          (simulação, padrão)
 *   npx tsx server/scripts/corrige-reprovadas.ts --gravar (aplica)
 */
import { db } from "../db";
import { items, itemSponsorApprovals, auditLogs } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const GRAVAR = process.argv.includes("--gravar");

async function main() {
  const candidatas = await db
    .select()
    .from(items)
    .where(and(eq(items.status, "awaiting_submission"), eq(items.rejectedBySponsor, true)));

  const paraCorrigir: typeof candidatas = [];
  const semDono: typeof candidatas = [];

  for (const peca of candidatas) {
    const aprovacoes = await db
      .select()
      .from(itemSponsorApprovals)
      .where(eq(itemSponsorApprovals.itemId, peca.id));
    const temAwaitingArte = aprovacoes.some((a) => a.status === "awaiting_arte");
    (temAwaitingArte ? paraCorrigir : semDono).push(peca);
  }

  console.log(`\nCandidatas (awaiting_submission + reprovada por patrocinador): ${candidatas.length}`);
  console.log(`  · com patrocinador identificado (serão corrigidas): ${paraCorrigir.length}`);
  console.log(`  · sem patrocinador identificado (ficam como estão):  ${semDono.length}\n`);

  for (const peca of paraCorrigir) {
    console.log(`  ${GRAVAR ? "CORRIGINDO" : "simulação"}  ${peca.displayId} — awaiting_submission → awaiting_sponsor_approval`);
    if (!GRAVAR) continue;

    await db
      .update(items)
      .set({ status: "awaiting_sponsor_approval", rejectedBySponsor: false })
      .where(eq(items.id, peca.id));

    // A trilha registra a correção como qualquer outra escrita — uma peça que
    // muda de status sem linha no histórico é a próxima investigação de alguém.
    await db.insert(auditLogs).values({
      userId: null,
      userName: "Sistema",
      action: "updated",
      entityType: "item",
      entityId: peca.id,
      details:
        "Correção pontual: peça de retrabalho estava em Aguardando Envio por causa da antiga " +
        "reprovação de peça inteira. Devolvida para Aguardando Aprovação, onde a linha do " +
        "patrocinador em awaiting_arte a coloca na aba Correção da Arte.",
    });
  }

  if (semDono.length > 0) {
    console.log(`\n  Estas ficaram INTOCADAS — nenhuma aprovação em awaiting_arte diz quem pediu a mudança:`);
    for (const peca of semDono) console.log(`    ${peca.displayId}`);
  }

  console.log(GRAVAR ? "\nFeito.\n" : "\nNada foi gravado. Rode com --gravar para aplicar.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
