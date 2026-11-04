// Processo separado do conferidor: abre o arquivo final e gera a imagem reduzida.
// Fica à parte porque abrir um .ai pesado não tem como ser cancelado por dentro:
// quando demora demais, quem chamou encerra este processo, e o trabalho para de verdade.
// Só LÊ o arquivo da rede.
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const req = createRequire(import.meta.url);
const sharp = req("sharp");
const { createCanvas } = req("@napi-rs/canvas");
sharp.concurrency(1);
const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

const LADO = 1000, TETO_AI = 80 * 1048576, TETO_TIF = 500 * 1048576, MAX_PRANCHETAS = 60, MAX_CANDIDATAS = 3;
// O caminho vem como foi colado: às vezes entre aspas e com barras trocadas.
const caminhoLocal = (u) => u.trim().replace(/^"+|"+$/g, "").split("/").join(path.sep);

async function desenhar(pagina, lado) {
  const v1 = pagina.getViewport({ scale: 1 });
  const vp = pagina.getViewport({ scale: lado / Math.max(v1.width, v1.height) });
  const cv = createCanvas(Math.max(1, Math.round(vp.width)), Math.max(1, Math.round(vp.height)));
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
  await pagina.render({ canvasContext: ctx, viewport: vp }).promise;
  pagina.cleanup();
  return cv.toBuffer("image/png");
}
const assinatura = (b) => sharp(b).resize(48, 48, { fit: "fill" }).flatten({ background: "#fff" }).removeAlpha().raw().toBuffer();
const distancia = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };
const emJpeg = (e) => sharp(e, { limitInputPixels: false, failOn: "none" }).rotate().resize({ width: LADO, height: LADO, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).toColourspace("srgb").jpeg({ quality: 80 }).toBuffer();

// Várias peças costumam sair do mesmo .ai (km 1, km 2...): guarda o último aberto.
let aberto = null;
async function abrirPdf(u) {
  if (aberto?.u === u) return aberto;
  if (aberto) await aberto.doc.loadingTask.destroy();
  aberto = null;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await fs.promises.readFile(u)), disableFontFace: true, useSystemFonts: true, verbosity: 0 }).promise;
  aberto = { u, doc, assinaturas: null };
  return aberto;
}

async function imagemDoArquivo(arquivo, thumb) {
  if (/https?:|^\/objects\//i.test(arquivo.trim())) throw new Error("O arquivo final está em um link, não na pasta da rede.");
  const u = caminhoLocal(arquivo);
  const st = await fs.promises.stat(u);
  if (!st.isFile()) throw new Error("O caminho aponta para uma pasta, não para um arquivo.");
  const cab = Buffer.alloc(4);
  const fh = await fs.promises.open(u, "r"); await fh.read(cab, 0, 4, 0); await fh.close();
  if (cab.toString("latin1") !== "%PDF") {
    if (st.size > TETO_TIF) throw new Error("Arquivo grande demais para conferir.");
    return { jpg: await emJpeg(u), pagina: null };
  }
  if (st.size > TETO_AI) throw new Error("Arquivo grande demais para conferir.");
  const a = await abrirPdf(u);
  // Um .ai costuma ter várias pranchetas. A semelhança só ordena: em formas simples
  // (o numeral 1 e o 2 de um pódio) ela erra, então vão as mais parecidas e o servidor
  // só avisa se nenhuma conferir.
  const n = Math.min(a.doc.numPages, MAX_PRANCHETAS);
  let ordem = [1];
  if (n > 1) {
    if (!a.assinaturas) {
      a.assinaturas = [];
      for (let i = 1; i <= n; i++) a.assinaturas.push(await assinatura(await desenhar(await a.doc.getPage(i), 200)));
    }
    const alvo = await assinatura(thumb);
    ordem = a.assinaturas.map((s, i) => ({ pagina: i + 1, d: distancia(alvo, s) })).sort((x, y) => x.d - y.d).slice(0, MAX_CANDIDATAS).map((x) => x.pagina);
  }
  const [jpg, ...outras] = await Promise.all(ordem.map(async (p) => emJpeg(await desenhar(await a.doc.getPage(p), LADO))));
  return { jpg, pagina: `${ordem[0]}/${a.doc.numPages}`, extras: outras.map((o, i) => ({ final: o.toString("base64"), pagina: `${ordem[i + 1]}/${a.doc.numPages}` })) };
}

// Problema da rede ou de permissão não diz nada sobre a peça: não grava, tenta na próxima passada.
const ERROS_DA_REDE = new Set(["ENETUNREACH", "EHOSTUNREACH", "ETIMEDOUT", "ECONNRESET", "ENOTCONN", "EPIPE", "EBUSY", "EIO", "EACCES", "EPERM", "UNKNOWN", "EAI_AGAIN"]);
/** "Não encontrado" só vale se a pasta compartilhada responde: \\servidor\pasta. */
async function pastaResponde(arquivo) {
  const partes = caminhoLocal(arquivo).split(path.sep).filter(Boolean);
  if (partes.length < 2) return true;
  try { await fs.promises.stat(path.sep + path.sep + partes[0] + path.sep + partes[1]); return true; } catch { return false; }
}

process.on("message", async ({ id, arquivo, thumb }) => {
  try {
    const { jpg, pagina, extras } = await imagemDoArquivo(arquivo, Buffer.from(thumb, "base64"));
    // Quase toda branca costuma ser falha ao gerar, não arte em branco: não vira aviso de arte errada.
    const st = await sharp(jpg).stats();
    if (st.channels.every((c) => c.mean > 250 && c.stdev < 6)) process.send({ id, naoDeu: "A imagem do arquivo saiu em branco ao gerar." });
    else process.send({ id, final: jpg.toString("base64"), pagina, extras: extras ?? [] });
  } catch (e) {
    if (ERROS_DA_REDE.has(e?.code)) return process.send({ id, adiar: String(e.code) });
    if (e?.code === "ENOENT" && caminhoLocal(arquivo).startsWith(path.sep + path.sep) && !(await pastaResponde(arquivo))) return process.send({ id, adiar: "pasta da rede fora do ar" });
    process.send({ id, naoDeu: e?.code === "ENOENT" ? "Arquivo não encontrado na pasta da rede." : String(e?.message ?? e).slice(0, 180) });
  }
});
process.send({ pronto: true });
