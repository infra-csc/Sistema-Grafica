// Gera o RASCUNHO do book no servidor: capa e rodapé do book mais recente do circuito,
// artes dos thumbs de agora. Não publica nada. Ver shared/book-automatico.ts.
import { createRequire } from "module";
import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage } from "pdf-lib";
import { pool } from "../db";
import { ObjectStorageService } from "../objectStorage";
import { lerPdfDoBook } from "./auditoria-do-book/pdf";
import {
  atribuirVagas, circuitoDoEvento, combinarComOficial, compararVersoes, encaixarNaVaga, PAGINA_DO_BOOK, paginaDoModeloParaUsar, planejarBook, posicionarPagina, rotuloDoRodape, secaoDaPeca, type PaginaFinal, type PaginaPlanejada, type Vaga,
  type ModeloDoBook, type PecaDoBook,
} from "@shared/book-automatico";

const require = createRequire(import.meta.url);
const carregarSharp = () => {
  const sharp = require("sharp") as typeof import("sharp")["default"];
  // O servidor é o mesmo do app: não guarda imagem em cache entre uma peça e outra.
  sharp.cache(false);
  return sharp;
};

const { LP, AP, TOPO, MX } = PAGINA_DO_BOOK;
/** A fonte do PDF não escreve qualquer caractere, e um deles derrubaria o book inteiro. */
const textoDoPdf = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, "").trim();
const LADO_DA_ARTE = 1400;

export type PecasDaVersao = Record<string, { d: string | null; t: string | null }>;

const fila: { promessa: Promise<unknown> } = { promessa: Promise.resolve() };
/** Um de cada vez: gerar lê dezenas de imagens e o servidor é o mesmo do app. */
function emFila<T>(tarefa: () => Promise<T>): Promise<T> {
  const r = fila.promessa.then(tarefa, tarefa);
  fila.promessa = r.catch(() => undefined);
  return r;
}

export async function pecasDoEvento(eventId: string): Promise<PecaDoBook[]> {
  const { rows } = await pool.query(
    `select id, display_id as "displayId", type as "tipo", description as "descricao", approval_thumb_url as "thumb"
       from items where event_id = $1 and deleted_at is null and kit_remessa_id is null
        and status not in ('canceled','cancelled','archived','deleted') order by display_id`, [eventId]);
  return rows.map((p: PecaDoBook) => ({ ...p, thumb: p.thumb && p.thumb.startsWith("/objects/") ? p.thumb : null }));
}

export const pecasDaVersao = (pecas: readonly PecaDoBook[]): PecasDaVersao =>
  Object.fromEntries(pecas.filter((p) => secaoDaPeca(p.tipo, p.descricao)).map((p) => [p.id, { d: p.displayId, t: p.thumb }]));

/** Guarda qual thumb cada peça tem agora, junto do book que acabou de ser publicado. */
export async function fotografarThumbsDoBook(eventId: string, bookId: string | undefined): Promise<void> {
  if (!bookId) return;
  await pool.query(
    `update event_books set thumbs = (select coalesce(jsonb_object_agg(i.id, i.approval_thumb_url), '{}'::jsonb) from items i where i.event_id = $1 and i.deleted_at is null) where id = $2`,
    [eventId, bookId]);
}

export type BookModelo = { url: string; evento: string; proprio: boolean; em: string; thumbs: Record<string, string | null> | null };
/**
 * O book do próprio evento; sem ele, o mais recente do mesmo circuito. Do próprio, ignora
 * republicação com poucas peças: ela não é o book inteiro e não serve de base.
 */
export async function acharBookModelo(eventId: string, ignorarProprio = false): Promise<BookModelo | null> {
  const { rows } = await pool.query(
    `select b.book_url as url, b.event_id as "eventId", b.item_count as itens, e.name as evento, b.thumbs, to_char(b.created_at, 'YYYY-MM-DD HH24:MI:SS.US') as em
       from event_books b join events e on e.id = b.event_id
      where b.book_url like '/objects/%' order by b.created_at desc limit 500`);
  const proprios = rows.filter((b: { eventId: string }) => b.eventId === eventId);
  if (proprios.length > 0 && !ignorarProprio) {
    const maior = Math.max(...proprios.map((b: { itens: number }) => b.itens ?? 0));
    const b = proprios.find((x: { itens: number }) => (x.itens ?? 0) >= maior * 0.4) ?? proprios[0];
    return { url: b.url, evento: b.evento, em: b.em, thumbs: b.thumbs ?? null, proprio: true };
  }
  const ev = await pool.query("select name from events where id = $1", [eventId]);
  const circuito = circuitoDoEvento(ev.rows[0]?.name);
  const b = rows.find((x: { evento: string; eventId: string }) => x.eventId !== eventId && circuitoDoEvento(x.evento) === circuito);
  return b ? { url: b.url, evento: b.evento, em: b.em, thumbs: null, proprio: false } : null;
}

type Rotulos = { rotulos: string[]; porPagina: Array<string | null>; paginaDoRodape: number; xDoRotulo: number; paginas: PaginaDoModelo[] };
async function lerRotulos(bytes: Buffer): Promise<Rotulos> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  const rotulos: string[] = [];
  const porPagina: Array<string | null> = [];
  const paginas: PaginaDoModelo[] = [];
  let paginaDoRodape = Math.min(1, doc.numPages - 1), xDoRotulo = 0.25, achou = false;
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const v = p.getViewport({ scale: 1 });
    const texto = await p.getTextContent();
    const rodape = (texto.items as Array<{ str?: string; transform?: number[] }>).filter((t) => t.str?.trim() && t.transform && 1 - t.transform[5] / v.height > 0.8);
    const r = rotuloDoRodape(rodape.map((t) => ({ texto: t.str!, x: t.transform![4] / v.width })));
    porPagina.push(r || null);
    if (i > 1) { const ops = await p.getOperatorList(); paginas.push({ indice: i - 1, rotulo: r || null, vagas: vagasDaPagina(ops as never, pdfjs.OPS as never, v.width, v.height) }); }
    if (r) {
      rotulos.push(r);
      if (!achou) { achou = true; paginaDoRodape = i - 1; xDoRotulo = rodape[0].transform![4] / v.width; }
    }
    p.cleanup();
  }
  await doc.loadingTask.destroy();
  return { rotulos, porPagina, paginaDoRodape, xDoRotulo, paginas };
}

// ── As vagas do modelo ─────────────────────────────────────────────────────
type PaginaDoModelo = { indice: number; rotulo: string | null; vagas: Vaga[] };
const mult = (a: number[], b: number[]) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
/** Onde estão as artes numa página do PDF, sem rodapé nem fundo de página inteira. */
function vagasDaPagina(ops: { fnArray: number[]; argsArray: unknown[] }, OPS: Record<string, number>, L: number, A: number): Vaga[] {
  const out: Vaga[] = []; let m = [1, 0, 0, 1, 0, 0]; const pilha: number[][] = []; let forms = 0;
  const reg = (bb: number[]) => {
    const p = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
    const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
    const b = { x: Math.min(...xs) / L, y: 1 - Math.max(...ys) / A, w: (Math.max(...xs) - Math.min(...xs)) / L, h: (Math.max(...ys) - Math.min(...ys)) / A };
    if (b.w * b.h >= 0.004 && b.y >= -0.02 && b.y + b.h <= 0.84 && !(b.w > 0.97 && b.h > 0.7)) out.push(b);
  };
  ops.fnArray.forEach((f, i) => {
    const a = ops.argsArray[i] as number[][];
    if (f === OPS.save) pilha.push(m);
    else if (f === OPS.restore) m = pilha.pop() ?? m;
    else if (f === OPS.transform) m = mult(m, a as unknown as number[]);
    else if (f === OPS.paintFormXObjectBegin) { pilha.push(m); if (a[0]) m = mult(m, a[0]); if (forms === 0 && a[1]) reg(a[1]); forms++; }
    else if (f === OPS.paintFormXObjectEnd) { m = pilha.pop() ?? m; forms = Math.max(0, forms - 1); }
    else if (forms === 0 && (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject)) reg([0, 0, 1, 1]);
  });
  return out.filter((c, i) => !out.slice(0, i).some((o) => Math.abs(o.x - c.x) < 0.005 && Math.abs(o.y - c.y) < 0.005 && Math.abs(o.w - c.w) < 0.005 && Math.abs(o.h - c.h) < 0.005));
}
const LADO_DA_MINIATURA = 24;
const miniaturaCrua = (b: Buffer) => carregarSharp()(b, { failOn: "none" }).rotate().flatten({ background: "#ffffff" }).removeAlpha().resize(LADO_DA_MINIATURA, LADO_DA_MINIATURA, { fit: "fill" }).raw().toBuffer();
const distancia = (a: Buffer, b: Buffer) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

/** O desenho de cada vaga da página do modelo, para colocar cada peça na que mais se parece. */
async function miniaturasDasVagas(bytes: Buffer, indice: number, vagas: readonly Vaga[]): Promise<Buffer[] | null> {
  try {
    const { createCanvas } = require("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
    const p = await doc.getPage(indice + 1);
    const v = p.getViewport({ scale: 1 }); const W = 700, H = Math.round((W * v.height) / v.width);
    const cv = createCanvas(W, H); const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    await p.render({ canvasContext: ctx, viewport: p.getViewport({ scale: W / v.width }), canvas: cv } as never).promise;
    const png: Buffer = cv.toBuffer("image/png");
    const sharp = carregarSharp(); const out: Buffer[] = [];
    for (const b of vagas) {
      const left = Math.max(0, Math.round(b.x * W)), top = Math.max(0, Math.round(b.y * H));
      out.push(await sharp(png).extract({ left, top, width: Math.min(W - left, Math.max(4, Math.round(b.w * W))), height: Math.min(H - top, Math.max(4, Math.round(b.h * H))) }).flatten({ background: "#ffffff" }).removeAlpha().resize(LADO_DA_MINIATURA, LADO_DA_MINIATURA, { fit: "fill" }).raw().toBuffer());
    }
    p.cleanup(); await doc.loadingTask.destroy();
    return out;
  } catch { return null; }
}

async function arteEmJpeg(url: string): Promise<{ bytes: Buffer; w: number; h: number }> {
  const servico = new ObjectStorageService();
  const arquivo = await servico.getObjectEntityFile(servico.normalizeObjectEntityPath(url.split(/[?#]/)[0]));
  const [bruto] = await arquivo.download();
  const sharp = carregarSharp();
  const bytes = await sharp(bruto, { failOn: "none" }).rotate()
    .resize({ width: LADO_DA_ARTE, height: LADO_DA_ARTE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
  const m = await sharp(bytes).metadata();
  return { bytes, w: m.width ?? 1, h: m.height ?? 1 };
}

export type ResultadoDoRascunho = { id: string; versao: number };

export function gerarRascunhoDoBook(eventId: string, quem: string, automatico = false): Promise<ResultadoDoRascunho> {
  return emFila(() => gerar(eventId, quem, automatico));
}

export type RascunhoMontado = {
  bytes: Buffer;
  paginas: number;
  plano: Array<{ rotulo: string; secao: string; pecas: Array<string | null>; conferir: string | null; origem: "mantida" | "refeita" | "nova" | "regra"; mudaram?: Array<string | null> }>;
  modeloUrl: string | null;
  baseOficial: boolean;
  fora: Array<{ id: string; displayId: string | null; tipo: string; descricao: string | null; motivo: string }>;
  pecas: PecaDoBook[];
  modeloEvento: string | null;
};

/** Monta o PDF sem gravar nada. Quem grava é `gerar`; os testes em massa usam só esta. */
export async function montarRascunho(eventId: string, opcoes: { comoEventoNovo?: boolean } = {}): Promise<RascunhoMontado> {
  const ev = (await pool.query("select name from events where id = $1", [eventId])).rows[0];
  if (!ev) throw new Error("Evento não encontrado");
  const pecas = await pecasDoEvento(eventId);

  const modeloInfo = await acharBookModelo(eventId, opcoes.comoEventoNovo);
  let origem: PDFDocument | null = null, lidos: Rotulos | null = null, bytesDoModelo: Buffer | null = null;
  if (modeloInfo) {
    try {
      bytesDoModelo = await lerPdfDoBook(modeloInfo.url);
      lidos = await lerRotulos(bytesDoModelo);
      origem = await PDFDocument.load(bytesDoModelo, { ignoreEncryption: true, updateMetadata: false });
    } catch (erro) {
      console.warn("[book-automatico] modelo não abriu; segue sem ele:", erro instanceof Error ? erro.message : erro);
      origem = null; lidos = null;
    }
  }
  const modelo: ModeloDoBook | null = lidos ? { rotulos: lidos.rotulos } : null;
  const plano = planejarBook(pecas, modelo);

  const out = await PDFDocument.create();
  const fonte = await out.embedFont(StandardFonts.Helvetica);
  const fonteForte = await out.embedFont(StandardFonts.HelveticaBold);
  let rodape: PDFEmbeddedPage | null = null;
  let temCapa = false;
  if (origem && lidos && origem.getPageCount() > 0) {
    try {
      const [capa] = await out.copyPages(origem, [0]);
      out.addPage(capa);
      temCapa = true;
      if (lidos.rotulos.length > 0) rodape = await out.embedPage(origem.getPage(lidos.paginaDoRodape), { left: 0, bottom: 0, right: LP, top: AP * 0.2 });
    } catch (erro) {
      console.warn("[book-automatico] capa ou rodapé do modelo falharam:", erro instanceof Error ? erro.message : erro);
    }
  }
  if (!temCapa) {
    const capa = out.addPage([LP, AP]);
    capa.drawRectangle({ x: 0, y: 0, width: LP, height: AP, color: rgb(0.87, 0.87, 0.86) });
    const nome = textoDoPdf(String(ev.name));
    capa.drawText(nome, { x: Math.max(30, (LP - fonteForte.widthOfTextAtSize(nome, 26)) / 2), y: AP / 2, size: 26, font: fonteForte, color: rgb(0.11, 0.1, 0.09), maxWidth: LP - 60 });
  }

  const paginasFeitas: RascunhoMontado["plano"] = [];
  const naoAbriram: Array<{ id: string; displayId: string | null; tipo: string; descricao: string | null; motivo: string }> = [];

  // Com book oficial do próprio evento: mantém as páginas e refaz só o que mudou.
  const usarBase = !!(origem && lidos && modeloInfo?.proprio && temCapa);
  let roteiro: Array<PaginaFinal> = plano.paginas.map((pagina) => ({ origem: "nova" as const, pagina, rotulo: pagina.rotulo, mudaram: [] }));
  if (usarBase) {
    // Com a fotografia do book, a comparação é exata. Sem ela (books antes de 05/11), o melhor
    // que há é a trilha de auditoria, que não registra toda troca.
    const fotografia = modeloInfo!.thumbs;
    const mudaram = new Set<string>();
    if (fotografia) {
      for (const p of pecas) { const antes = fotografia[p.id]; if (!(p.id in fotografia) || (antes?.startsWith("/objects/") ? antes : null) !== p.thumb) mudaram.add(p.id); }
    } else {
      const { rows } = await pool.query(
        `select i.id from items i where i.event_id = $1 and i.deleted_at is null and (i.approval_thumb_updated_at > $2::timestamp or i.created_at > $2::timestamp
           or exists (select 1 from audit_logs a where a.entity_type = 'item' and a.entity_id = i.id and a.created_at > $2::timestamp and a.details ilike '%thumb%'))`, [eventId, modeloInfo!.em]);
      for (const r of rows as Array<{ id: string }>) mudaram.add(r.id);
    }
    const base = lidos!.porPagina.map((rotulo, indice) => ({ indice, rotulo })).filter((b) => b.indice > 0);
    roteiro = combinarComOficial(base, plano, (p) => mudaram.has(p.id)).paginas;
  }
  const copiadas = usarBase ? await out.copyPages(origem!, roteiro.flatMap((r) => (r.origem === "mantida" ? [r.indiceBase] : []))) : [];
  let proximaCopiada = 0;

  for (const passo of roteiro) {
    if (passo.origem === "mantida") {
      out.addPage(copiadas[proximaCopiada++]);
      paginasFeitas.push({ rotulo: passo.rotulo, secao: secaoDaPeca(passo.rotulo, "") ?? "", pecas: [], conferir: null, origem: "mantida" });
      continue;
    }
    const pg: PaginaPlanejada = passo.pagina;
    const lista: Array<{ peca: PecaDoBook; w: number; h: number; bytes: Buffer; descricao: string | null }> = [];
    let i = 0;
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (i < pg.pecas.length) {
        const k = i++, peca = pg.pecas[k];
        try { const a = await arteEmJpeg(peca.thumb!); lista[k] = { peca, ...a, descricao: peca.descricao }; }
        catch { naoAbriram.push({ id: peca.id, displayId: peca.displayId, tipo: peca.tipo, descricao: peca.descricao, motivo: "O thumb não abriu" }); }
      }
    }));
    const artes = lista.filter(Boolean);
    if (artes.length === 0) continue;
    const pdf = out.addPage([LP, AP]);
    if (rodape && lidos) {
      pdf.drawPage(rodape, { x: 0, y: 0 });
      // Cobre só o nome da seção do modelo; logo, barra e linhas continuam.
      const xNome = Math.max(0.2, lidos.xDoRotulo - 0.004) * LP;
      pdf.drawRectangle({ x: xNome, y: AP * 0.085, width: LP - xNome - 10, height: AP * 0.07, color: rgb(1, 1, 1) });
    } else {
      pdf.drawLine({ start: { x: 0, y: AP * 0.17 }, end: { x: LP, y: AP * 0.17 }, thickness: 0.4, color: rgb(0.8, 0.8, 0.8) });
      pdf.drawText(textoDoPdf(String(ev.name)).slice(0, 60), { x: 30, y: AP * 0.105, size: 8, font: fonte, color: rgb(0.35, 0.35, 0.35) });
    }
    pdf.drawText(textoDoPdf(pg.rotulo).slice(0, 90), { x: (rodape && lidos ? lidos.xDoRotulo : 0.25) * LP, y: AP * 0.105, size: 12, font: fonte, color: rgb(0.2, 0.2, 0.2) });
    // Mesmo número de artes que a página do modelo: usa as posições dele.
    const doModelo = lidos ? paginaDoModeloParaUsar(lidos.paginas, pg.rotulo, pg.secao, artes.length) : null;
    let colocou = false;
    if (doModelo && bytesDoModelo) {
      let vagaDe = artes.map((_, i) => i);
      if (artes.length > 1) {
        const dasVagas = await miniaturasDasVagas(bytesDoModelo, doModelo.indice, doModelo.vagas);
        if (dasVagas) {
          const dasArtes = await Promise.all(artes.map((a) => miniaturaCrua(a.bytes)));
          vagaDe = atribuirVagas(dasArtes.map((m: Buffer) => dasVagas.map((v) => distancia(m, v))));
        }
      }
      for (let i = 0; i < artes.length; i++) {
        const c = encaixarNaVaga(artes[i], doModelo.vagas[vagaDe[i]]);
        const img = await out.embedJpg(artes[i].bytes);
        pdf.drawImage(img, { x: c.x, y: AP - c.y - c.h, width: c.w, height: c.h });
      }
      colocou = true;
    }
    if (!colocou) {
      for (const c of posicionarPagina(pg.secao, !!pg.portico, artes)) {
        const img = await out.embedJpg(c.arte.bytes);
        pdf.drawImage(img, { x: MX + c.x, y: AP - TOPO - c.y - c.h, width: c.w, height: c.h });
      }
    }
    paginasFeitas.push({
      rotulo: pg.rotulo, secao: pg.secao, pecas: artes.map((a) => a.peca.displayId), conferir: pg.conferir,
      origem: usarBase ? passo.origem : "regra", mudaram: usarBase ? passo.mudaram : undefined,
    });
  }
  return {
    bytes: Buffer.from(await out.save()), paginas: out.getPageCount(), plano: paginasFeitas, fora: [...plano.fora, ...naoAbriram], pecas,
    modeloUrl: modeloInfo && origem ? modeloInfo.url : null, baseOficial: usarBase,
    modeloEvento: modeloInfo && origem ? modeloInfo.evento : null,
  };
}

async function gerar(eventId: string, quem: string, automatico: boolean): Promise<ResultadoDoRascunho> {
  const { bytes, paginas, plano, fora, pecas, modeloEvento, modeloUrl, baseOficial } = await montarRascunho(eventId);
  const servico = new ObjectStorageService();
  const url = servico.normalizeObjectEntityPath(await servico.uploadObjectEntityFromBuffer(bytes, "application/pdf"));
  const versaoAtual = pecasDaVersao(pecas);
  const anterior = (await pool.query(`select versao, pecas_da_versao as p from rascunhos_do_book where event_id = $1 order by versao desc limit 1`, [eventId])).rows[0];
  const versao = (anterior?.versao ?? 0) + 1;
  const mudancas = anterior ? compararVersoes(anterior.p ?? {}, versaoAtual) : null;
  const { rows } = await pool.query(
    `insert into rascunhos_do_book (event_id, versao, pdf_url, paginas, pecas_no_book, plano, fora, pecas_da_versao, mudancas, modelo_evento, gerado_por, automatico, tamanho, modelo_url, base_oficial)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
    [eventId, versao, url, paginas, plano.reduce((a, p) => a + p.pecas.length, 0), JSON.stringify(plano),
      JSON.stringify(fora), JSON.stringify(versaoAtual), mudancas ? JSON.stringify(mudancas) : null, modeloEvento, quem, automatico, bytes.length, modeloUrl, baseOficial],
  );
  return { id: rows[0].id, versao };
}

// ── Atualização sozinha ────────────────────────────────────────────────────
const INTERVALO_MS = 10 * 60_000;
/** Espera as trocas pararem: a Arte costuma mexer em várias peças em sequência. */
const ESPERA_MIN = 15;

/** Quem já tem rascunho é refeito quando um thumb muda. Um evento por rodada. */
export async function atualizarRascunhos(refazer: (eventId: string) => Promise<unknown> = (id) => gerarRascunhoDoBook(id, "Atualização automática", true)): Promise<string | null> {
  const { rows } = await pool.query(
    `select distinct on (r.event_id) r.event_id as "eventId", r.pecas_da_versao as p, r.criado_em < now() - ($1 || ' minutes')::interval as passou, r.modelo_url as "modeloUrl", r.base_oficial as "baseOficial",
            (select b.book_url from event_books b where b.event_id = r.event_id order by b.created_at desc limit 1) as oficial
       from rascunhos_do_book r join events e on e.id = r.event_id
      where e.arquivado_em is null and e.status <> 'closed' and e.start_date >= (now() at time zone 'America/Sao_Paulo')::date
      order by r.event_id, r.versao desc`, [ESPERA_MIN]);
  for (const r of rows) {
    if (!r.passou) continue;
    const m = compararVersoes(r.p ?? {}, pecasDaVersao(await pecasDoEvento(r.eventId)));
    // Saiu um book oficial novo: é a nova base.
    const oficialNovo = !!r.oficial && (r.baseOficial ? r.oficial !== r.modeloUrl : true);
    if (m.novas.length + m.trocadas.length + m.saiu.length === 0 && !oficialNovo) continue;
    await refazer(r.eventId);
    return r.eventId;
  }
  return null;
}

export function iniciarAtualizacaoDosRascunhos(aoAtualizar: (eventId: string) => void): void {
  if (process.env.NODE_ENV !== "production" || process.env.BOOK_RASCUNHO_AUTOMATICO === "0") return;
  setInterval(() => {
    void atualizarRascunhos().then((id) => { if (id) aoAtualizar(id); }).catch((erro) => console.error("[book-automatico] atualização:", erro));
  }, INTERVALO_MS).unref();
}
