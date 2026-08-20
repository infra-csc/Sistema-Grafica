// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL DE `items.status_changed_at`.
//
// A coluna nasce vazia, e daí em diante o `updateItem` a mantém. Este script
// existe para o passado: sem ele, o Painel Geral levaria semanas para ter
// idade em alguma peça, e a mudança nasceria inútil.
//
// A REGRA, e o que ela recusa a fazer: preenche a partir do carimbo que
// corresponde ao status ATUAL da peça — `deliveredAt` para entregue,
// `producedAt` para produzida, e assim por diante. Onde não há carimbo para o
// status atual, deixa NULL.
//
// Deixar NULL é a parte importante. Os status do começo do fluxo
// (awaiting_linking, awaiting_submission, awaiting_approval) não têm carimbo
// nenhum, e é exatamente onde está a maior fila. A tentação é usar `createdAt`
// — "melhor um número do que nenhum". Seria pior: uma peça criada há oito
// meses que entrou em aprovação ontem apareceria como "parada há 240 dias", e
// quem procura gargalo agiria sobre um número inventado. Um campo vazio diz "não
// sei"; um número errado diz "sei" e mente.
//
// Roda uma vez, é idempotente (só toca linhas com a coluna nula) e não altera
// nenhum outro campo — nem `updatedAt`, que mede outra coisa.
//
//   npx tsx scripts/backfill-status-changed-at.ts          (lista)
//   npx tsx scripts/backfill-status-changed-at.ts --aplicar (grava)
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../server/db";
import { items } from "../shared/schema";
import { isNull, sql } from "drizzle-orm";

/**
 * Status → a coluna que registra a entrada NELE.
 *
 * As variações em português existem porque a dispensa da Arte grava
 * `pronto_para_producao` e a Gráfica grava `entregue` — os dois vocabulários
 * circulam no banco, e um mapa que só conheça o inglês silenciosamente não
 * preencheria metade das peças produzidas.
 */
const CARIMBO_DO_STATUS: Record<string, string> = {
  delivered: "delivered_at",
  entregue: "delivered_at",
  conferred: "conferred_at",
  conferido: "conferred_at",
  produced: "produced_at",
  produzido: "produced_at",
  inproduction: "production_started_at",
  inProduction: "production_started_at",
  em_producao: "production_started_at",
  ready_for_production: "approved_at",
  pronto_para_producao: "approved_at",
  approved: "approved_at",
  liberado: "approved_at",
  awaiting_final_review: "final_file_updated_at",
  awaiting_review: "final_file_updated_at",
  sponsor_approved: "sponsor_approved_at",
  awaiting_finalization: "sponsor_approved_at",
  awaiting_creator_review: "creator_reviewed_at",
};

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const semCarimbo = await db
    .select({ id: items.id, status: items.status })
    .from(items)
    .where(isNull(items.statusChangedAt));

  const porStatus = new Map<string, number>();
  for (const i of semCarimbo) porStatus.set(i.status, (porStatus.get(i.status) ?? 0) + 1);

  let alcancaveis = 0, semFonte = 0;
  console.log(`\n${semCarimbo.length} peças sem \`status_changed_at\`.\n`);
  for (const [status, n] of Array.from(porStatus.entries()).sort((a, b) => b[1] - a[1])) {
    const coluna = CARIMBO_DO_STATUS[status];
    if (coluna) { alcancaveis += n; console.log(`  ${String(n).padStart(6)}  ${status.padEnd(26)} ← ${coluna}`); }
    else { semFonte += n; console.log(`  ${String(n).padStart(6)}  ${status.padEnd(26)} — sem carimbo, fica NULL`); }
  }
  console.log(`\n  ${alcancaveis} com fonte · ${semFonte} sem fonte (ficam sem idade na tela).\n`);

  if (!aplicar) {
    console.log("Nada foi gravado. Rode com --aplicar para preencher.\n");
    process.exit(0);
  }

  let gravadas = 0;
  for (const [status, coluna] of Object.entries(CARIMBO_DO_STATUS)) {
    // Só onde a coluna de origem tem valor: um `delivered` sem `delivered_at`
    // (peça migrada) continua sem idade, que é o correto.
    const r: any = await db.execute(sql`
      UPDATE items
         SET status_changed_at = ${sql.raw(coluna)}
       WHERE status = ${status}
         AND status_changed_at IS NULL
         AND ${sql.raw(coluna)} IS NOT NULL
    `);
    const n = r?.rowCount ?? r?.rowsAffected ?? 0;
    if (n > 0) { gravadas += n; console.log(`  ${String(n).padStart(6)}  ${status} ← ${coluna}`); }
  }
  console.log(`\n${gravadas} peças carimbadas. As demais seguem sem idade, de propósito.\n`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
