// Ensaio do book a partir do oficial: volta ao momento de uma versão antiga, atualiza com as artes
// que existiam na versão seguinte e compara a IMAGEM com essa versão seguinte. Não grava nada.
// Mostra se o rascunho ficou mais perto do que a equipe publicou do que o book antigo estava.
import { createRequire } from "module";
import pg from "pg";
import { montarRascunho, thumbsNaDataDoBook, type EnsaioDoBook } from "../../server/services/book-automatico";
import { lerPdfDoBook } from "../../server/services/auditoria-do-book/pdf";
import { normalizarDoBook, rotuloDoRodape, secaoDaPeca, type PecaDoBook } from "../../shared/book-automatico";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas");
const L = 200, A = 141;
type Pag = { r: string; g: Uint8Array };
async function paginas(bytes: Buffer): Promise<Pag[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise; const out: Pag[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
    const p = await doc.getPage(i); const v = p.getViewport({ scale: 1 }); const t = await p.getTextContent();
    const r = rotuloDoRodape((t.items as Array<{ str?: string; transform?: number[] }>).filter((x) => x.str?.trim() && 1 - x.transform![5] / v.height > 0.8).map((x) => ({ texto: x.str!, x: x.transform![4] / v.width })));
    const cv = createCanvas(L, A); const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, L, A);
    await p.render({ canvasContext: ctx as never, viewport: p.getViewport({ scale: L / v.width }), canvas: cv as never } as never).promise;
    const H = Math.floor(A * 0.8); const d = ctx.getImageData(0, 0, L, H).data; const g = new Uint8Array(L * H); for (let k = 0; k < g.length; k++) g[k] = (d[k * 4] + d[k * 4 + 1] + d[k * 4 + 2]) / 3;
    out.push({ r, g }); p.cleanup();
  }
  await doc.loadingTask.destroy(); return out;
}
const difer = (a: Uint8Array, b: Uint8Array) => { let s = 0; for (let k = 0; k < a.length; k++) s += Math.abs(a[k] - b[k]); return s / a.length; };
const pal = (s: string) => normalizarDoBook(s).split(" ");
const par = (a: string, b: string) => { const x = pal(a), y = pal(b); return x.filter((w) => y.includes(w)).length / Math.max(x.length, y.length, 1); };
/** Para cada página da verdade, a distância até a melhor página de mesma seção, sem repetir. */
function distancias(ofi: Pag[], ger: Pag[]): Array<number | null> {
  const livres = new Set(ger.map((_, i) => i).filter((i) => i > 0));
  return ofi.slice(1).map((o) => {
    if (!o.r) return null; const s = secaoDaPeca(o.r, ""); let melhor = -1, mp = -Infinity;
    for (const i of Array.from(livres)) { if (secaoDaPeca(ger[i].r, "") !== s) continue; const nota = par(ger[i].r, o.r) - difer(ger[i].g, o.g) / 200; if (nota > mp) { mp = nota; melhor = i; } }
    if (melhor < 0) return null; livres.delete(melhor); return +difer(ger[melhor].g, o.g).toFixed(2);
  });
}

const VARIANTES: Array<{ nome: string; ensaio: Partial<EnsaioDoBook> }> = JSON.parse(process.env.VARIANTES || `[{"nome":"refazer","ensaio":{"trocarNoLugar":false}},{"nome":"trocar","ensaio":{"trocarNoLugar":true}}]`);
(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const pares = (await c.query(`with v as (select b.event_id, b.book_url u, b.created_at em, e.name n, lead(b.book_url) over w u1, lead(b.created_at) over w em1, lead(b.item_count) over w i1, b.item_count i0
      from event_books b join events e on e.id = b.event_id where b.book_url like '/objects/%' and b.item_count >= 25 window w as (partition by b.event_id order by b.created_at))
    select event_id id, n, u u0, u1, to_char(em,'YYYY-MM-DD HH24:MI:SS') e0, to_char(em1,'YYYY-MM-DD HH24:MI:SS') e1 from v where u1 is not null and em > '2026-08-25' and em1 - em > interval '30 minutes' and i1 >= i0 * 0.7 order by em1 desc limit $1`, [Number(process.env.PARES || 24)])).rows;
  for (const x of pares) {
    const saida: Record<string, unknown> = { n: x.n, id: x.id, e0: x.e0, e1: x.e1 };
    try {
      const pecas: PecaDoBook[] = (await c.query(`select i.id, i.display_id as "displayId", i.type as "tipo", i.description as "descricao",
          coalesce((select v.thumb_url from item_art_versions v where v.item_id = i.id and v.created_at <= $2::timestamp order by v.created_at desc limit 1),
                   case when exists (select 1 from item_art_versions v where v.item_id = i.id) then null else i.approval_thumb_url end) as "thumb"
        from items i where i.event_id = $1 and i.deleted_at is null and i.kit_remessa_id is null and i.created_at <= $2::timestamp and i.status not in ('canceled','cancelled','archived','deleted') order by i.display_id`, [x.id, x.e1])).rows
        .map((p: PecaDoBook) => ({ ...p, thumb: p.thumb?.startsWith("/objects/") ? p.thumb : null }));
      const thumbs = await thumbsNaDataDoBook(x.id, x.e0);
      saida.mudaram = pecas.filter((p) => { const a = thumbs[p.id]; return !(p.id in thumbs) || (a?.startsWith("/objects/") ? a : null) !== p.thumb; }).length; saida.pecas = pecas.length;
      const verdade = await paginas(await lerPdfDoBook(x.u1)); const velho = await paginas(await lerPdfDoBook(x.u0));
      const res: Record<string, unknown> = { velho: distancias(verdade, velho) };
      const origens: Record<string, unknown> = {};
      for (const v of VARIANTES) {
        const t0 = Date.now();
        const m = await montarRascunho(x.id, { ensaio: { modelo: { url: x.u0, evento: x.n, proprio: true, em: x.e0, thumbs }, pecas, ...v.ensaio } });
        res[v.nome] = distancias(verdade, await paginas(m.bytes));
        const o: Record<string, number> = {}; for (const p of m.plano) o[p.origem] = (o[p.origem] ?? 0) + 1; origens[v.nome] = { ...o, seg: Math.round((Date.now() - t0) / 1000), mb: +(m.bytes.length / 1e6).toFixed(1) };
      }
      saida.rotulos = verdade.slice(1).map((p) => p.r); saida.res = res; saida.origens = origens;
    } catch (e) { saida.erro = e instanceof Error ? e.message.slice(0, 200) : String(e); }
    await new Promise<void>((k) => process.stdout.write(JSON.stringify(saida) + "\n", () => k()));
  }
  await c.end(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
