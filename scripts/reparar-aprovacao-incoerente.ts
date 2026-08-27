// ─────────────────────────────────────────────────────────────────────────────
// REPARO: peça avançada com patrocinador "Aguardando" volta à fila (caso #4176).
//
// A regra do dono, com todas as letras: "se está aguardando, tem que voltar
// pendente no Atendimento". Os três caminhos que criavam o estado incoerente
// foram fechados no código (atalho de aprovação, revogação, devolução para
// finalização) — mas as peças que JÁ nasceram assim continuam paradas fora
// da fila, e o dono não deveria precisar caçá-las uma a uma para clicar em
// reabrir. Este script drena o estoque de uma vez.
//
// O QUE ELE FAZ: para cada peça em status pós-aprovação (sponsor_approved,
// awaiting_finalization, awaiting_final_review, awaiting_review, in_review)
// que NÃO seja isenta (skipApproval) e tenha ao menos um patrocinador
// vinculado com linha não-aprovada → status volta a awaiting_sponsor_approval,
// zera o carimbo de aprovação, e a trilha ganha uma linha explicando.
//
// O QUE ELE NÃO FAZ: não toca arquivo final nem thumb (trabalho da Arte
// fica), não toca peça isenta ou sem patrocinador, não toca produção.
//
// Idempotente: depois de rodar, nada mais casa o critério.
//
//   npx tsx scripts/reparar-aprovacao-incoerente.ts           (lista)
//   npx tsx scripts/reparar-aprovacao-incoerente.ts --aplicar (grava)
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../server/db";
import { items, itemSponsorApprovals, itemSponsors, auditLogs } from "../shared/schema";
import { sql, inArray, and, isNull } from "drizzle-orm";

// A lista é a mesma da revogação e do acrescentar — @shared/fluxo-peca.
export { POS_APROVACAO } from "../shared/fluxo-peca";
import { POS_APROVACAO } from "../shared/fluxo-peca";

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const candidatas = await db
    .select({ id: items.id, displayId: items.displayId, status: items.status, skipApproval: items.skipApproval })
    .from(items)
    .where(and(inArray(items.status, [...POS_APROVACAO]), isNull(items.deletedAt)));

  if (candidatas.length === 0) { console.log("\nNenhuma peça em status pós-aprovação.\n"); process.exit(0); }

  const ids = candidatas.map((c) => c.id);
  const [linhas, vinculos] = await Promise.all([
    db.select({ itemId: itemSponsorApprovals.itemId, status: itemSponsorApprovals.status })
      .from(itemSponsorApprovals).where(inArray(itemSponsorApprovals.itemId, ids)),
    db.select({ itemId: itemSponsors.itemId })
      .from(itemSponsors).where(inArray(itemSponsors.itemId, ids)),
  ]);

  const linhasPorItem = new Map<string, string[]>();
  for (const l of linhas) {
    const arr = linhasPorItem.get(l.itemId) ?? [];
    arr.push(l.status); linhasPorItem.set(l.itemId, arr);
  }
  const temVinculo = new Set(vinculos.map((v) => v.itemId));

  const incoerentes = candidatas.filter((c) => {
    if (c.skipApproval) return false;              // isenta: não há quem aprovar
    if (!temVinculo.has(c.id)) return false;       // sem patrocinador: idem
    const ls = linhasPorItem.get(c.id) ?? [];
    if (ls.length === 0) return false;             // sem linha: fluxo antigo, fora do critério
    return ls.some((s) => s !== "approved");       // a rodada está ABERTA por baixo
  });

  console.log(`\n${candidatas.length} peças pós-aprovação · ${incoerentes.length} incoerentes (linha não-aprovada por baixo):\n`);
  for (const p of incoerentes) console.log(`  ${p.displayId.padEnd(10)} ${p.status}`);

  if (!aplicar) { console.log("\nNada foi gravado. Rode com --aplicar para devolvê-las à fila do Atendimento.\n"); process.exit(0); }

  let feitas = 0;
  for (const p of incoerentes) {
    // WHERE repete o status: se a peça andou entre a leitura e a escrita
    // (alguém decidiu agora), este reparo não atropela a decisão nova.
    const r: any = await db.execute(sql`
      UPDATE items
         SET status = 'awaiting_sponsor_approval',
             sponsor_approved_by = NULL,
             sponsor_approved_at = NULL,
             rejected_by_sponsor = false
       WHERE id = ${p.id} AND status = ${p.status}
    `);
    if ((r?.rowCount ?? 0) === 0) { console.log(`  ${p.displayId}: andou no meio tempo — pulada.`); continue; }
    feitas += 1;
    await db.insert(auditLogs).values({
      userName: "Sistema",
      action: "updated",
      entityType: "item",
      entityId: p.id,
      details: `Reparo: a peça estava avançada (${p.status}) com patrocinador ainda aguardando aprovação — volta pendente à fila do Atendimento (regra: linha "Aguardando" ⇒ peça pendente no Atendimento). O arquivo final e o thumb ficam como estavam.`,
    });
    console.log(`  ${p.displayId} → awaiting_sponsor_approval ✔`);
  }
  console.log(`\n${feitas} peças devolvidas à fila do Atendimento.\n`);
  process.exit(0);
}

if (process.argv[1]?.includes("reparar-aprovacao-incoerente")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
