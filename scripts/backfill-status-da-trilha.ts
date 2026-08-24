// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL DE `items.status_changed_at` — SEGUNDA PASSADA, PELA TRILHA.
//
// A primeira passada (backfill-status-changed-at.ts) preenche a partir dos
// carimbos por etapa, e o próprio script avisa onde ela para: os status do
// começo do fluxo (awaiting_linking, awaiting_submission, awaiting_approval)
// não têm carimbo nenhum — e é exatamente onde está a maior fila.
//
// Só que essa história EXISTE, escrita como texto na trilha: toda transição
// grava "Status alterado: X → Y" (ou "Status: X → Y", no /edit) em
// audit_logs. Este script lê a última transição de cada peça ainda sem
// carimbo e usa a data dela.
//
// A REGRA DE OURO: o rótulo-ALVO da transição tem de bater com o rótulo do
// status ATUAL da peça (via translateStatus, o mesmo que escreveu a linha).
// Se não bater — a peça andou depois por um caminho que não deixou rastro, ou
// a linha é mais antiga que a última mudança — fica NULL. Um carimbo herdado
// de outra transição diria "parada aqui desde D" sobre um D de outra etapa,
// que é a mentira que esta coluna existe para não contar.
//
// LIMITE HONESTO: a trilha é completa só a partir de 04/08/2026 (teto de
// 20.000 por consulta na tela; aqui lemos direto, mas registros anteriores ao
// início da trilha simplesmente não existem). Peça parada desde antes disso
// continua NULL — "não sei" segue sendo a resposta certa.
//
// Roda uma vez, idempotente (só toca linhas nulas), não altera mais nada.
//
//   npx tsx scripts/backfill-status-da-trilha.ts           (lista)
//   npx tsx scripts/backfill-status-da-trilha.ts --aplicar (grava)
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../server/db";
import { items, auditLogs } from "../shared/schema";
import { isNull, sql, inArray, eq, and, or, like } from "drizzle-orm";
import { translateStatus } from "../server/routes/shared";

/**
 * Extrai o rótulo-alvo de uma linha de transição.
 *
 * Formatos reais (server/routes/items.ts):
 *   "Status alterado: Rascunho → Aguardando Envio (enviada à Arte)"
 *   "Status: Aguardando Envio → Aguardando Aprovação; Quantidade: 3 → 5"
 *
 * O alvo vai do último "→" até o primeiro delimitador: " (", ";", " —",
 * ". " ou fim. Ordem importa — "Aguardando Aprovação (aprovado...)" tem
 * parêntese, e "...→ Rascunho (devolvida...). Motivo: ..." tem os dois.
 */
export function alvoDaTransicao(details: string): string | null {
  const m = details.match(/Status(?: alterado)?:\s*[^→]+→\s*([^;]+)/);
  if (!m) return null;
  let alvo = m[1];
  for (const corte of [" (", " —", ". "]) {
    const i = alvo.indexOf(corte);
    if (i >= 0) alvo = alvo.slice(0, i);
  }
  return alvo.trim() || null;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const semCarimbo = await db
    .select({ id: items.id, status: items.status })
    .from(items)
    .where(and(isNull(items.statusChangedAt), isNull(items.deletedAt)));

  console.log(`\n${semCarimbo.length} peças sem \`status_changed_at\` (após a 1ª passada).\n`);
  if (semCarimbo.length === 0) { console.log("Nada a fazer.\n"); process.exit(0); }

  // Todas as linhas de transição dessas peças, numa consulta só — mais nova
  // primeiro, para o primeiro match por peça ser o que vale.
  const ids = semCarimbo.map((i) => i.id);
  const linhas = await db
    .select({ entityId: auditLogs.entityId, details: auditLogs.details, createdAt: auditLogs.createdAt })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.entityType, "item"),
      inArray(auditLogs.entityId, ids),
      or(like(auditLogs.details, "%Status alterado:%"), like(auditLogs.details, "%Status:%")),
    ))
    .orderBy(sql`${auditLogs.createdAt} DESC`);

  const statusDaPeca = new Map(semCarimbo.map((i) => [i.id, i.status]));
  const decisao = new Map<string, Date>();   // peça → data da transição que bate
  const rejeitadas = new Map<string, string>(); // peça → por que ficou de fora

  for (const l of linhas) {
    if (decisao.has(l.entityId) || rejeitadas.has(l.entityId)) continue; // só a mais recente decide
    const alvo = alvoDaTransicao(l.details ?? "");
    if (!alvo) continue; // linha de outro assunto que citou "Status:" — segue procurando
    const atual = translateStatus(statusDaPeca.get(l.entityId)!);
    if (alvo === atual) decisao.set(l.entityId, l.createdAt);
    else rejeitadas.set(l.entityId, `trilha diz "${alvo}", peça está "${atual}" — andou sem rastro, fica NULL`);
  }

  const semLinha = semCarimbo.length - decisao.size - rejeitadas.size;
  console.log(`  ${decisao.size} com transição que bate com o status atual`);
  console.log(`  ${rejeitadas.size} com trilha divergente (ficam NULL, de propósito)`);
  console.log(`  ${semLinha} sem transição na trilha — anteriores a 04/08, ficam NULL\n`);
  for (const [id, motivo] of Array.from(rejeitadas.entries()).slice(0, 8)) {
    console.log(`    · ${id}: ${motivo}`);
  }

  if (!aplicar) { console.log("\nNada foi gravado. Rode com --aplicar para preencher.\n"); process.exit(0); }

  let gravadas = 0;
  for (const [id, quando] of decisao) {
    // O WHERE repete o IS NULL: se a 1ª passada (ou o app) carimbou no meio
    // tempo, este script não sobrescreve um dado melhor com um inferido.
    const r: any = await db.execute(sql`
      UPDATE items SET status_changed_at = ${quando}
       WHERE id = ${id} AND status_changed_at IS NULL
    `);
    gravadas += r?.rowCount ?? 0;
  }
  console.log(`\n${gravadas} peças carimbadas pela trilha. O resto segue NULL, de propósito.\n`);
  process.exit(0);
}

// Só roda como script — o teste importa `alvoDaTransicao` sem tocar no banco.
if (process.argv[1]?.includes("backfill-status-da-trilha")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
