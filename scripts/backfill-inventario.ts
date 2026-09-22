// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL DOS ATIVOS DO INVENTÁRIO — o que rodava em TODA partida do servidor.
//
// backfillInventoryAssets (server/services/inventoryLifecycle.ts) cria o ativo
// que falta para cada peça produzida. Rodava no boot de cada cópia do
// servidor, lendo o acervo inteiro (peças, ativos, eventos, vínculos) — com o
// autoscale, a cada cópia nova que subia. Quase sempre para concluir "nada a
// fazer". Agora é à mão, quando houver motivo (ex.: depois de importar peças
// produzidas por fora):
//
//   npx tsx scripts/backfill-inventario.ts                       ← DEV
//   DATABASE_URL="<produção>" npx tsx scripts/backfill-inventario.ts
//
// Idempotente: só cria o ativo que falta; rodar duas vezes não faz nada. Ao
// fim, roda uma vez o ciclo (em uso / aguardando triagem) para os ativos novos.
// ─────────────────────────────────────────────────────────────────────────────
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
const { backfillInventoryAssets, runInventoryCron } = await import("../server/services/inventoryLifecycle");

console.log("→ backfill dos ativos do inventário…");
await backfillInventoryAssets();
console.log("→ ciclo do inventário (em uso / aguardando triagem)…");
await runInventoryCron();
console.log("Pronto.");
process.exit(0);
