// Teste de verdade do modo "do zero": monta o book como se o evento fosse novo e compara a
// IMAGEM de cada página com a do book oficial dele. Não grava nada.
import { createRequire } from "module";
import pg from "pg";
import { montarRascunho } from "../../server/services/book-automatico";
import { lerPdfDoBook } from "../../server/services/auditoria-do-book/pdf";
import { normalizarDoBook, rotuloDoRodape, secaoDaPeca } from "../../shared/book-automatico";

const require = createRequire(import.meta.url);
const { createCanvas } = require("@napi-rs/canvas");
const L = 200, A = 141;
type Pag = { r: string; g: Uint8Array };
async function paginas(bytes: Buffer): Promise<Pag[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise; const out: Pag[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 45); i++) {
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

(async () => {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
  const evs = (await c.query(`with u as (select distinct on (b.event_id) b.event_id id, e.name, b.book_url, b.item_count, e.start_date from event_books b join events e on e.id=b.event_id where b.item_count >= 25 and b.book_url like '/objects/%' order by b.event_id, b.created_at desc) select * from u where start_date >= now() - interval '10 days' order by start_date limit 26`)).rows;
  const circ = new Set<string>(); const vistos: typeof evs = []; for (const e of evs) { const k = normalizarDoBook(e.name).split(" ").slice(0, 2).join(" "); if (circ.has(k) && vistos.length >= 14) continue; circ.add(k); vistos.push(e); if (vistos.length >= 16) break; }
  for (const e of vistos) {
    const saida: Record<string, unknown> = { n: e.name };
    try {
      const m = await montarRascunho(e.id, { comoEventoNovo: true });
      saida.modelo = m.modeloEvento; saida.base = m.baseOficial;
      const [ger, ofi] = [await paginas(m.bytes), await paginas(await lerPdfDoBook(e.book_url))];
      saida.pGer = ger.length; saida.pOfi = ofi.length;
      const livres = new Set(ger.map((_, i) => i).filter((i) => i > 0)); const res: unknown[] = [];
      for (const o of ofi.slice(1)) {
        if (!o.r) continue; const s = secaoDaPeca(o.r, ""); let melhor = -1, mp = -1;
        for (const i of Array.from(livres)) { if (secaoDaPeca(ger[i].r, "") !== s) continue; const q = par(ger[i].r, o.r); const d = difer(ger[i].g, o.g); const nota = q - d / 200; if (nota > mp) { mp = nota; melhor = i; } }
        if (melhor < 0) { res.push({ r: o.r, d: -1 }); continue; } livres.delete(melhor); res.push({ r: o.r, d: +difer(ger[melhor].g, o.g).toFixed(1) });
      }
      saida.pags = res; saida.aMais = Array.from(livres).map((i) => ger[i].r);
    } catch (x) { saida.erro = x instanceof Error ? x.message.slice(0, 160) : String(x); }
    await new Promise<void>((k) => process.stdout.write(JSON.stringify(saida) + "\n", () => k()));
  }
  await c.end(); process.exit(0);
})().catch((x) => { console.error(x); process.exit(1); });
