// Gera o RASCUNHO do book no servidor: capa e rodapé do book mais recente do circuito,
// artes dos thumbs de agora. Não publica nada. Ver shared/book-automatico.ts.
import { createRequire } from "module";
import { PDFDocument, StandardFonts, rgb, type PDFEmbeddedPage } from "pdf-lib";
import { pool } from "../db";
import { ObjectStorageService } from "../objectStorage";
import { lerPdfDoBook } from "./auditoria-do-book/pdf";
import {
  arranjarNaPagina, circuitoDoEvento, compararVersoes, montarPortico, planejarBook, preferenciaDaSecao, secaoDaPeca,
  type ModeloDoBook, type PecaDoBook,
} from "@shared/book-automatico";

const require = createRequire(import.meta.url);
const carregarSharp = () => require("sharp") as typeof import("sharp")["default"];

// As margens medidas nos books reais: artes de 5% a 79% da altura, com 6% de cada lado.
const LP = 842, AP = 595, TOPO = AP * 0.05, BASE = AP * 0.79, MX = LP * 0.06;
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

/** O book do próprio evento; sem ele, o mais recente do mesmo circuito. */
export async function acharBookModelo(eventId: string): Promise<{ url: string; evento: string } | null> {
  const { rows } = await pool.query(
    `select b.book_url as url, b.event_id as "eventId", e.name as evento from event_books b join events e on e.id = b.event_id
      where b.book_url like '/objects/%' order by b.created_at desc limit 400`);
  const proprio = rows.find((b: { eventId: string }) => b.eventId === eventId);
  if (proprio) return proprio;
  const ev = await pool.query("select name from events where id = $1", [eventId]);
  const circuito = circuitoDoEvento(ev.rows[0]?.name);
  return rows.find((b: { evento: string }) => circuitoDoEvento(b.evento) === circuito) ?? null;
}

type Rotulos = { rotulos: string[]; paginaDoRodape: number; xDoRotulo: number };
async function lerRotulos(bytes: Buffer): Promise<Rotulos> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableFontFace: true, verbosity: 0 }).promise;
  const rotulos: string[] = [];
  let paginaDoRodape = Math.min(1, doc.numPages - 1), xDoRotulo = 0.25, achou = false;
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const v = p.getViewport({ scale: 1 });
    const texto = await p.getTextContent();
    const rodape = (texto.items as Array<{ str?: string; transform?: number[] }>).filter((t) => t.str?.trim() && t.transform && 1 - t.transform[5] / v.height > 0.8);
    const r = rodape.map((t) => t.str!.trim()).join(" ").trim();
    if (r) {
      rotulos.push(r);
      if (!achou) { achou = true; paginaDoRodape = i - 1; xDoRotulo = rodape[0].transform![4] / v.width; }
    }
    p.cleanup();
  }
  await doc.loadingTask.destroy();
  return { rotulos, paginaDoRodape, xDoRotulo };
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

async function gerar(eventId: string, quem: string, automatico: boolean): Promise<ResultadoDoRascunho> {
  const ev = (await pool.query("select name from events where id = $1", [eventId])).rows[0];
  if (!ev) throw new Error("Evento não encontrado");
  const pecas = await pecasDoEvento(eventId);

  const modeloInfo = await acharBookModelo(eventId);
  let origem: PDFDocument | null = null, lidos: Rotulos | null = null;
  if (modeloInfo) {
    try {
      const bytes = await lerPdfDoBook(modeloInfo.url);
      lidos = await lerRotulos(bytes);
      origem = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
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

  const paginasFeitas: Array<{ rotulo: string; pecas: Array<string | null>; conferir: string | null }> = [];
  const naoAbriram: Array<{ id: string; displayId: string | null; tipo: string; descricao: string | null; motivo: string }> = [];
  for (const pg of plano.paginas) {
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
    const W = LP - 2 * MX, H = BASE - TOPO;
    const pos = (pg.portico && montarPortico(artes, W, H)) || arranjarNaPagina(artes, W, H, pg.secao === "Estande" ? 0.5 : 0.62, preferenciaDaSecao(pg.secao, artes.length));
    for (const c of pos) {
      const img = await out.embedJpg(c.arte.bytes);
      pdf.drawImage(img, { x: MX + c.x, y: AP - TOPO - c.y - c.h, width: c.w, height: c.h });
    }
    paginasFeitas.push({ rotulo: pg.rotulo, pecas: artes.map((a) => a.peca.displayId), conferir: pg.conferir });
  }
  const bytes = Buffer.from(await out.save());

  const servico = new ObjectStorageService();
  const url = servico.normalizeObjectEntityPath(await servico.uploadObjectEntityFromBuffer(bytes, "application/pdf"));
  const versaoAtual = pecasDaVersao(pecas);
  const anterior = (await pool.query(`select versao, pecas_da_versao as p from rascunhos_do_book where event_id = $1 order by versao desc limit 1`, [eventId])).rows[0];
  const versao = (anterior?.versao ?? 0) + 1;
  const mudancas = anterior ? compararVersoes(anterior.p ?? {}, versaoAtual) : null;
  const { rows } = await pool.query(
    `insert into rascunhos_do_book (event_id, versao, pdf_url, paginas, pecas_no_book, plano, fora, pecas_da_versao, mudancas, modelo_evento, gerado_por, automatico, tamanho)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id`,
    [eventId, versao, url, out.getPageCount(), paginasFeitas.reduce((a, p) => a + p.pecas.length, 0), JSON.stringify(paginasFeitas),
      JSON.stringify([...plano.fora, ...naoAbriram]), JSON.stringify(versaoAtual), mudancas ? JSON.stringify(mudancas) : null, modeloInfo && origem ? modeloInfo.evento : null, quem, automatico, bytes.length],
  );
  return { id: rows[0].id, versao };
}

// ── Atualização sozinha ────────────────────────────────────────────────────
const INTERVALO_MS = 10 * 60_000;
/** Espera as trocas pararem: a Arte costuma mexer em várias peças em sequência. */
const ESPERA_MIN = 15;

/** Quem já tem rascunho é refeito quando um thumb muda. Um evento por rodada. */
export async function atualizarRascunhos(): Promise<string | null> {
  const { rows } = await pool.query(
    `select distinct on (r.event_id) r.event_id as "eventId", r.pecas_da_versao as p, r.criado_em < now() - ($1 || ' minutes')::interval as passou
       from rascunhos_do_book r join events e on e.id = r.event_id
      where e.arquivado_em is null and e.status <> 'closed' and e.start_date >= (now() at time zone 'America/Sao_Paulo')::date
      order by r.event_id, r.versao desc`, [ESPERA_MIN]);
  for (const r of rows) {
    if (!r.passou) continue;
    const m = compararVersoes(r.p ?? {}, pecasDaVersao(await pecasDoEvento(r.eventId)));
    if (m.novas.length + m.trocadas.length + m.saiu.length === 0) continue;
    await gerarRascunhoDoBook(r.eventId, "Atualização automática", true);
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
