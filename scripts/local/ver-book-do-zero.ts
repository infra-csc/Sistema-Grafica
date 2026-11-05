// Devolve o PDF gerado "como evento novo" e o oficial de um evento, para olhar lado a lado. Não grava nada.
import pg from "pg";
import { montarRascunho } from "../../server/services/book-automatico";
import { lerPdfDoBook } from "../../server/services/auditoria-do-book/pdf";
(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const e = (await c.query(`select e.id, e.name, (select b.book_url from event_books b where b.event_id=e.id and b.item_count>=25 order by b.created_at desc limit 1) u from events e where e.name ilike $1 limit 1`, [process.env.EVENTO])).rows[0];
  const m = await montarRascunho(e.id, { comoEventoNovo: true });
  const of = await lerPdfDoBook(e.u);
  const esc = (o: unknown) => new Promise<void>((k) => process.stdout.write(JSON.stringify(o) + "\n", () => k()));
  await esc({ n: "gerado", b: m.bytes.toString("base64"), plano: m.plano.map((p) => `${p.rotulo} [${p.pecas.join(",")}]`), modelo: m.modeloEvento });
  await esc({ n: "oficial", b: of.toString("base64") });
  await c.end(); process.exit(0);
})().catch((x) => { console.error(x); process.exit(1); });
