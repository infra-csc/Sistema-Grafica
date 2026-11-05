// Teste do gatilho por imagem: o thumb de hoje está na página do book antigo? Só lê.
// Sai, por página do book antigo, a melhor distância de cada peça da seção até as artes da página.
import { createRequire } from "module";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import pg from "pg";
import { normalizarDoBook, planejarBook, type PecaDoBook } from "../../shared/book-automatico";

const require = createRequire(import.meta.url);
const sharp = require("sharp") as typeof import("sharp")["default"];
const { createCanvas } = require("@napi-rs/canvas");
sharp.cache(false);
const e = process.env as Record<string, string>;
const s3 = new S3Client({ region: "auto", forcePathStyle: true, endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: e.R2_ACCESS_KEY_ID, secretAccessKey: e.R2_SECRET_ACCESS_KEY } });
const seg = (e.PRIVATE_OBJECT_DIR || "").replace(/^\/+/, "").split("/"); const Bucket = e.R2_BUCKET || seg[0]; const pre = seg.slice(1).join("/");
const baixar = async (u: string) => { const id = u.split("?")[0].replace("/objects/", ""); const o = await s3.send(new GetObjectCommand({ Bucket, Key: (pre ? pre + "/" : "") + id })); return Buffer.from(await o.Body!.transformToByteArray()); };
const LADO = 24;
type Caixa = { x: number; y: number; w: number; h: number };
const mult = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
function caixas(ops: { fnArray: number[]; argsArray: unknown[][] }, OPS: Record<string, number>, L: number, A: number): Caixa[] {
  const out: Caixa[] = []; let m = [1, 0, 0, 1, 0, 0]; const pilha: number[][] = []; let forms = 0;
  const reg = (bb: number[]) => { const p = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]); const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]); const b = { x: Math.min(...xs) / L, y: 1 - Math.max(...ys) / A, w: (Math.max(...xs) - Math.min(...xs)) / L, h: (Math.max(...ys) - Math.min(...ys)) / A }; if (b.w * b.h >= 0.004 && b.y + b.h <= 0.84 && !(b.w > 0.97 && b.h > 0.7)) out.push(b); };
  ops.fnArray.forEach((f, i) => { const a = ops.argsArray[i] as never as number[][]; if (f === OPS.save) pilha.push(m); else if (f === OPS.restore) m = pilha.pop() ?? m; else if (f === OPS.transform) m = mult(m, a as unknown as number[]); else if (f === OPS.paintFormXObjectBegin) { pilha.push(m); if (a[0]) m = mult(m, a[0]); if (forms === 0 && a[1]) reg(a[1]); forms++; } else if (f === OPS.paintFormXObjectEnd) { m = pilha.pop() ?? m; forms = Math.max(0, forms - 1); } else if (forms === 0 && (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject)) reg([0, 0, 1, 1]); });
  return out.filter((c, i) => !out.slice(0, i).some((o) => Math.abs(o.x - c.x) < 0.005 && Math.abs(o.y - c.y) < 0.005 && Math.abs(o.w - c.w) < 0.005));
}
const miniatura = (b: Buffer) => sharp(b, { failOn: "none" }).rotate().flatten({ background: "#fff" }).removeAlpha().resize(LADO, LADO, { fit: "fill" }).raw().toBuffer();
const dist = (a: Buffer, b: Buffer) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

(async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const c = new pg.Client({ connectionString: e.DATABASE_URL }); await c.connect();
  const pares = (await c.query(`with v as (select b.*, e.name n, row_number() over (partition by b.event_id order by b.created_at desc) r from event_books b join events e on e.id=b.event_id where b.item_count >= 25 and b.book_url like '/objects/%') select a.event_id ev, a.n, c.book_url u0, a.book_url u1, to_char(c.created_at,'YYYY-MM-DD HH24:MI') e0 from v a join v c on c.event_id=a.event_id and c.r=a.r+1 where a.r=1 order by a.created_at desc limit 12`)).rows;
  for (const par of pares) {
    const saida: Record<string, unknown> = { n: par.n, e0: par.e0, paginas: [] };
    try {
      const pecas = (await c.query(`select id, display_id as "displayId", type as "tipo", description as "descricao", approval_thumb_url as thumb from items where event_id=$1 and deleted_at is null and kit_remessa_id is null and status not in ('canceled','cancelled','archived','deleted')`, [par.ev])).rows as PecaDoBook[];
      const entrada = pecas.map((p) => ({ ...p, thumb: p.thumb?.startsWith("/objects/") ? p.thumb : null }));
      const mini = new Map<string, Buffer>(); let i = 0;
      await Promise.all(Array.from({ length: 4 }, async () => { while (i < entrada.length) { const p = entrada[i++]; if (!p.thumb) continue; try { mini.set(p.id, await miniatura(await baixar(p.thumb))); } catch { /* sem miniatura */ } } }));
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await baixar(par.u0)), disableFontFace: true, verbosity: 0 }).promise;
      const rotulos: string[] = []; const pgs: Array<{ r: string; m: Buffer[]; n: number }> = [];
      for (let k = 2; k <= Math.min(doc.numPages, 40); k++) {
        const p = await doc.getPage(k); const v = p.getViewport({ scale: 1 }); const t = await p.getTextContent();
        const r = (t.items as Array<{ str?: string; transform?: number[] }>).filter((x) => x.str?.trim() && 1 - x.transform![5] / v.height > 0.8).map((x) => x.str!.trim()).join(" ").trim(); if (!r) continue; rotulos.push(r);
        const ops = await p.getOperatorList(); const cx = caixas(ops as never, pdfjs.OPS as never, v.width, v.height);
        const W = 700, H = Math.round((W * v.height) / v.width); const cv = createCanvas(W, H); const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H); await p.render({ canvasContext: ctx as never, viewport: p.getViewport({ scale: W / v.width }), canvas: cv as never } as never).promise;
        const png = cv.toBuffer("image/png"); const ms: Buffer[] = [];
        for (const b of cx.slice(0, 40)) { const left = Math.max(0, Math.round(b.x * W)), top = Math.max(0, Math.round(b.y * H)); const width = Math.min(W - left, Math.max(4, Math.round(b.w * W))), height = Math.min(H - top, Math.max(4, Math.round(b.h * H))); ms.push(await sharp(png).extract({ left, top, width, height }).flatten({ background: "#fff" }).removeAlpha().resize(LADO, LADO, { fit: "fill" }).raw().toBuffer()); }
        pgs.push({ r, m: ms, n: cx.length }); p.cleanup();
      }
      await doc.loadingTask.destroy();
      const plano = planejarBook(entrada, { rotulos });
      const pal = (s: string | null) => normalizarDoBook(s).split(" ").filter((w) => w.length > 1 && !["estande", "estandes", "de", "da", "do", "area", "espaco"].includes(w));
      for (const pg_ of pgs) {
        const nomes = pal(pg_.r);
        const candidatas = plano.paginas.filter((g) => normalizarDoBook(g.rotulo) === normalizarDoBook(pg_.r) || (g.secao.startsWith("Estande") && pal(g.rotulo).some((w) => nomes.includes(w))));
        const delas = candidatas.flatMap((g) => g.pecas);
        const melhores = delas.map((p) => { const a = mini.get(p.id); if (!a || pg_.m.length === 0) return null; return { d: p.displayId, m: +Math.min(...pg_.m.map((b) => dist(a, b))).toFixed(1) }; }).filter(Boolean);
        (saida.paginas as unknown[]).push({ r: pg_.r, els: pg_.n, pecas: delas.length, melhores });
      }
    } catch (x) { saida.erro = x instanceof Error ? x.message.slice(0, 160) : String(x); }
    await new Promise<void>((k) => process.stdout.write(JSON.stringify(saida) + "\n", () => k()));
  }
  await c.end(); process.exit(0);
})().catch((x) => { console.error(x); process.exit(1); });
