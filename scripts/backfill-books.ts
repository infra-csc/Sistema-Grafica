/**
 * BACKFILL DOS BOOKS — salvar o histórico antes que ele se apague sozinho.
 *
 * `items.book_url` guarda só o book ATUAL do evento: publicar um novo apaga a
 * URL do anterior de todas as peças. Até 21/08/2026 não havia `event_books`,
 * então TODO o histórico de books do app é, hoje, um único endereço por evento
 * — e ele desaparece no próximo publish, sem aviso.
 *
 * A trilha de auditoria guarda a data e o autor de cada publicação
 * ("Book de aprovação vinculado a N peça(s)"), mas NÃO a URL. Ou seja: dá para
 * recuperar QUANDO e QUEM de todas as publicações, e O QUÊ apenas da última.
 * Este script grava o que ainda existe: uma linha em `event_books` por evento
 * com book atual, datada e assinada pelo último registro da trilha daquele
 * evento.
 *
 * Não inventa: se o evento não tem registro na trilha, a linha entra com a data
 * do próprio script e sem autor — e a tela mostra "data não gravada" porque a
 * coluna `created_by` fica nula.
 *
 *   npx tsx scripts/backfill-books.ts            # relatório, não grava
 *   npx tsx scripts/backfill-books.ts --aplicar  # grava
 */
import { db } from "../server/db";
import { auditLogs, eventBooks, events, items } from "@shared/schema";
import { sql } from "drizzle-orm";

const aplicar = process.argv.includes("--aplicar");

async function main() {
  // Books atuais: uma URL por evento (a rota limpa o evento antes de gravar).
  const atuais = await db.execute(sql`
    select i.event_id as "eventId", i.book_url as "bookUrl", count(*)::int as "itemCount",
           e.name as "eventName"
      from ${items} i
      join ${events} e on e.id = i.event_id
     where i.deleted_at is null and i.book_url is not null
     group by i.event_id, i.book_url, e.name
     order by e.name
  `);
  const linhas = (atuais as any).rows ?? atuais;

  const jaGravados = await db.select().from(eventBooks);
  const gravado = new Set(jaGravados.map((b: any) => `${b.eventId}|${b.bookUrl}`));

  // Último "Book de aprovação vinculado" de cada evento: a data e o autor.
  const logs = await db.execute(sql`
    select distinct on (entity_id) entity_id as "eventId", user_name as "userName", created_at as "createdAt"
      from ${auditLogs}
     where entity_type = 'event' and details like 'Book de aprovação vinculado%'
     order by entity_id, created_at desc
  `);
  const porEvento = new Map<string, { userName: string | null; createdAt: Date }>();
  for (const l of ((logs as any).rows ?? logs) as any[]) {
    porEvento.set(l.eventId, { userName: l.userName ?? null, createdAt: new Date(l.createdAt) });
  }

  let novos = 0, pulados = 0, semTrilha = 0;
  for (const l of linhas as any[]) {
    if (gravado.has(`${l.eventId}|${l.bookUrl}`)) { pulados++; continue; }
    const trilha = porEvento.get(l.eventId);
    if (!trilha) semTrilha++;
    novos++;
    const quando = trilha?.createdAt ?? new Date();
    console.log(
      `${aplicar ? "GRAVA " : "would "} ${String(l.eventName).slice(0, 34).padEnd(34)} ` +
      `${String(l.itemCount).padStart(4)} peças  ${quando.toISOString().slice(0, 16)}  ${trilha?.userName ?? "(sem autor na trilha)"}`,
    );
    if (aplicar) {
      await db.insert(eventBooks).values({
        eventId: l.eventId,
        bookUrl: l.bookUrl,
        itemCount: l.itemCount,
        createdBy: trilha?.userName ?? null,
        createdAt: quando as any,
      });
    }
  }

  console.log("\n──");
  console.log(`eventos com book atual: ${(linhas as any[]).length}`);
  console.log(`já registrados em event_books: ${pulados}`);
  console.log(`${aplicar ? "gravados" : "a gravar"}: ${novos} (destes, ${semTrilha} sem data na trilha)`);
  if (!aplicar) console.log("\nNada foi gravado. Rode com --aplicar para gravar.");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
