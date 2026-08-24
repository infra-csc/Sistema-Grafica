// ─────────────────────────────────────────────────────────────────────────────
// UNIFICAÇÃO DAS GRAFIAS DE STATUS (frente 5 do diagnóstico de 24/08).
//
// Duas grafias do MESMO estado circulam no banco: `pronto_para_producao` ao
// lado de `ready_for_production`, `entregue` ao lado de `delivered`, e assim
// por diante. Nenhum código ESCREVE as formas em português há tempos — elas
// são fóssil de versões antigas — mas cada consulta nova precisa lembrar das
// duas, e o erro de esquecer é sempre otimista: a peça esquecida SOME da
// pendência ("a peça sumia do funil e a etapa virava verde falso", nas
// palavras dos comentários que hoje remendam isso em seis arquivos).
//
// Este script converte os dados para o vocabulário canônico. Os leitores
// tolerantes CONTINUAM no código de propósito: um backup restaurado, um
// import antigo, qualquer resto — a tolerância vira cinto de segurança em vez
// de necessidade. Removê-la é decisão para meses depois da migração, não para
// o mesmo commit.
//
// Roda uma vez, idempotente (WHERE pela grafia antiga), e grava uma linha de
// auditoria por grafia convertida — a trilha é onde alguém, meses depois,
// descobre por que o status da peça "mudou" sem ninguém tocar nela.
//
//   npx tsx scripts/unificar-status-legado.ts           (lista)
//   npx tsx scripts/unificar-status-legado.ts --aplicar (grava)
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../server/db";
import { items, auditLogs } from "../shared/schema";
import { sql, eq } from "drizzle-orm";

/** Grafia legada → canônica. O mapa espelha os leitores tolerantes. */
export const CANONICO: Record<string, string> = {
  pronto_para_producao: "ready_for_production",
  liberado: "approved",
  em_producao: "inProduction",
  produzido: "produced",
  conferido: "conferred",
  entregue: "delivered",
};

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const contagem = await db
    .select({ status: items.status, n: sql<number>`count(*)::int` })
    .from(items)
    .groupBy(items.status);

  const legadas = contagem.filter((c) => CANONICO[c.status]);
  console.log(`\nGrafias legadas no banco:`);
  if (legadas.length === 0) { console.log("  nenhuma — o banco já é canônico.\n"); process.exit(0); }
  for (const c of legadas) console.log(`  ${String(c.n).padStart(6)}  ${c.status} → ${CANONICO[c.status]}`);

  if (!aplicar) {
    console.log("\nNada foi gravado. Rode com --aplicar para converter.\n");
    process.exit(0);
  }

  let total = 0;
  for (const c of legadas) {
    const destino = CANONICO[c.status];
    // NÃO passa por updateItem de propósito: isto é correção de grafia, não
    // transição de estado — statusChangedAt e updatedAt ficam como estão,
    // senão toda peça migrada viraria "andou hoje" no painel de prazos.
    const r: any = await db.execute(sql`
      UPDATE items SET status = ${destino} WHERE status = ${c.status}
    `);
    const n = r?.rowCount ?? 0;
    total += n;
    await db.insert(auditLogs).values({
      userName: "Sistema",
      action: "updated",
      entityType: "sistema",
      entityId: "unificacao-status",
      details: `Grafia de status unificada: ${n} peças de "${c.status}" para "${destino}" (mesmo estado, vocabulário canônico — nenhuma peça mudou de etapa).`,
    });
    console.log(`  ${String(n).padStart(6)}  ${c.status} → ${destino} ✔`);
  }
  console.log(`\n${total} peças convertidas. Os leitores tolerantes continuam no código como cinto de segurança.\n`);
  process.exit(0);
}

if (process.argv[1]?.includes("unificar-status-legado")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
