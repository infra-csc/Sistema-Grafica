// ─────────────────────────────────────────────────────────────────────────────
// ÍNDICES DE BUSCA DO HISTÓRICO (auditoria de performance, 27/08).
//
// A busca do Histórico faz ILIKE '%termo%' em details/user_name/entity_id da
// MAIOR tabela do sistema — padrão com % à esquerda nunca usa B-tree; a cada
// tecla é um seq scan (e DOIS com ?withTotal=1). A cura é pg_trgm + GIN, que
// o drizzle-kit não cria (CREATE EXTENSION não é schema declarativo) — por
// isso este script, no padrão da casa:
//
//   npx tsx scripts/criar-indices-de-busca.ts            ← DEV (Shell do Replit)
//   DATABASE_URL="<produção>" npx tsx scripts/criar-indices-de-busca.ts
//
// Idempotente (IF NOT EXISTS em tudo); rodar duas vezes não faz nada.
// Sem CONCURRENTLY de propósito: o driver serverless roda cada statement em
// transação implícita, e CREATE INDEX CONCURRENTLY não pode viver numa — para
// o tamanho atual da tabela, o lock breve do CREATE INDEX comum é aceitável;
// rode fora do horário de pico.
// ─────────────────────────────────────────────────────────────────────────────
process.env.DATABASE_URL ||= "postgresql://x:x@localhost/x";
const { db } = await import("../server/db");
const { sql } = await import("drizzle-orm");

const passos: Array<[string, string]> = [
  ["extensão pg_trgm", `CREATE EXTENSION IF NOT EXISTS pg_trgm`],
  ["GIN trigram em audit_logs.details", `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_details_trgm" ON "audit_logs" USING gin ("details" gin_trgm_ops)`],
  ["GIN trigram em audit_logs.user_name", `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_user_name_trgm" ON "audit_logs" USING gin ("user_name" gin_trgm_ops)`],
  // entity_id ENTRA: a busca é um OR de três ILIKEs, e o planner só troca o
  // seq scan por BitmapOr quando TODOS os braços têm índice — dois de três
  // deixariam a query exatamente onde estava. GIN aceita valores longos (o
  // limite de 2704 bytes que barrou o B-tree daqui não se aplica).
  ["GIN trigram em audit_logs.entity_id", `CREATE INDEX IF NOT EXISTS "IDX_audit_logs_entity_id_trgm" ON "audit_logs" USING gin ("entity_id" gin_trgm_ops)`],
];

for (const [nome, comando] of passos) {
  process.stdout.write(`→ ${nome}… `);
  await db.execute(sql.raw(comando));
  console.log("ok");
}
console.log("\nPronto. A busca do Histórico passa a usar índice para ILIKE '%termo%'.");
process.exit(0);
