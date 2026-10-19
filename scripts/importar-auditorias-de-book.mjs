// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR AUDITORIAS DE BOOK FEITAS FORA DO APP — para carregar em produção o
// resultado da rodada manual de 19/10 (22 books) sem pagar a IA de novo.
//
// Lê os JSONs de uma pasta (formato de books-analise: id = 8 primeiros
// caracteres do uuid do book; faltando_no_app, cancelada_no_app, divergencia,
// observacoes…) e
// grava, para cada um, uma auditoria "concluida" do book analisado — o
// event_books mais recente cujo book_url termina com aquele uuid. Book que já
// foi reenviado depois da análise também recebe (regra do 1º book, 19/10: a
// auditoria do book analisado continua valendo; a tela avisa do reenvio).
// Evento que JÁ TEM auditoria valendo (rodada pela IA) é pulado — a importação
// não passa por cima dela. NÃO notifica ninguém: os achados aparecem na tela
// de Eventos e no número do menu.
//
// SIMULAÇÃO POR PADRÃO — sem `--aplicar`, só diz o que faria.
//   node scripts/importar-auditorias-de-book.mjs <pasta-com-json>
//   node scripts/importar-auditorias-de-book.mjs <pasta-com-json> --aplicar
//
// Idempotente: book que já tem auditoria (de qualquer status, exceto
// "substituida") é pulado. Usa DATABASE_URL. Rode a migração 0007 antes.
//
// Autocontido de propósito (só `pg`): roda com `node` puro no Shell do
// Replit, sem tsx. A normalização abaixo segue a de
// server/services/auditoria-do-book/normalizar.ts — mudou uma, muda a outra.
// ─────────────────────────────────────────────────────────────────────────────
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import pg from "pg";

const args = process.argv.slice(2);
const APLICAR = args.includes("--aplicar");
const pasta = args.find((a) => !a.startsWith("--"));
for (const a of args) {
  if (a.startsWith("--") && a !== "--aplicar") {
    console.error(`Opção desconhecida: ${a}\nUso: node scripts/importar-auditorias-de-book.mjs <pasta-com-json> [--aplicar]`);
    process.exit(2);
  }
}
if (!pasta) {
  console.error("Uso: node scripts/importar-auditorias-de-book.mjs <pasta-com-json> [--aplicar]");
  process.exit(2);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

// ── Normalização (espelho de normalizar.ts) ─────────────────────────────────
const texto = (v, max = 2000) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const pagina = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/\D+/g, "")) : NaN;
  return Number.isFinite(n) && n >= 1 && n <= 10000 ? Math.floor(n) : null;
};
const contagem = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : null;
};
function confianca(v) {
  const s = typeof v === "string" ? v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase() : "";
  if (s === "alta" || s === "high") return "alta";
  if (s === "media" || s === "medium") return "media";
  return "baixa";
}

function casador(pecas) {
  const porNumero = new Map(pecas.map((p) => [String(p.display_id).replace(/^#/, "").trim().toUpperCase(), p]));
  const porId = new Map(pecas.map((p) => [p.id, p]));
  return (ref) => {
    if (typeof ref !== "string") return null;
    const s = ref.trim();
    return porId.get(s) ?? porNumero.get(s.replace(/^#\s*/, "").toUpperCase()) ?? null;
  };
}
function rotuloDaPeca(p) {
  const tipo = texto(p.type);
  const desc = texto(p.description);
  const repete = !!tipo && desc.toLowerCase().startsWith(tipo.toLowerCase());
  return [p.display_id, repete ? "" : tipo, desc].filter(Boolean).join(" ");
}

function normalizar(j, todas) {
  const casar = casador(todas.filter((p) => p.status !== "canceled"));
  const casarCancelada = casador(todas.filter((p) => p.status === "canceled"));
  // Peça desenhada cuja correspondente está CANCELADA no app (dono, 19/10).
  const canceladas = [];
  const viraramFaltando = [];
  for (const c of Array.isArray(j.cancelada_no_app) ? j.cancelada_no_app : []) {
    if (!c || typeof c !== "object") continue;
    const pecaNoBook = texto(c.peca_no_book, 400);
    const detalhe = texto(c.detalhe);
    if (!pecaNoBook && !detalhe) continue;
    const refs = Array.isArray(c.ids) ? c.ids : [];
    const vistas = new Set();
    const validas = [];
    for (const ref of refs) {
      const p = casarCancelada(ref);
      if (p && !vistas.has(p.id)) { vistas.add(p.id); validas.push(p); }
    }
    if (validas.length === 0) {
      if (refs.some((ref) => casar(ref))) continue; // apontou peça ativa: está encontrada
      viraramFaltando.push({ pagina: c.pagina, peca_no_book: pecaNoBook, detalhe: [detalhe, "A IA apontou uma peça cancelada que não foi encontrada no evento."].filter(Boolean).join(" "), confianca: "baixa" });
      continue;
    }
    canceladas.push({ chave: `c${canceladas.length}`, pagina: pagina(c.pagina), pecaNoBook: pecaNoBook || detalhe.slice(0, 120), detalhe, ids: validas.map((p) => p.id), rotulos: validas.map(rotuloDaPeca) });
  }
  const faltando = [];
  for (const f of [...(Array.isArray(j.faltando_no_app) ? j.faltando_no_app : []), ...viraramFaltando]) {
    if (!f || typeof f !== "object") continue;
    const pecaNoBook = texto(f.peca_no_book, 400);
    const detalhe = texto(f.detalhe);
    if (!pecaNoBook && !detalhe) continue;
    const candidata = texto(f.candidata_mais_proxima, 400) || null;
    let candidataId = null;
    if (candidata) for (const m of candidata.matchAll(/#\s*([A-Za-z0-9-]+)/g)) { const p = casar(m[1]); if (p) { candidataId = p.id; break; } }
    faltando.push({ chave: `f${faltando.length}`, pagina: pagina(f.pagina), pecaNoBook: pecaNoBook || detalhe.slice(0, 120), detalhe, confianca: confianca(f.confianca), candidata, candidataId });
  }
  const divergencias = [];
  const fonteDiv = Array.isArray(j.divergencias) ? j.divergencias : Array.isArray(j.divergencia) ? j.divergencia : [];
  const descartadas = [];
  for (const d of fonteDiv) {
    if (!d || typeof d !== "object") continue;
    const vistas = new Set();
    const validas = [];
    for (const ref of Array.isArray(d.ids) ? d.ids : []) {
      const p = casar(ref);
      if (p && !vistas.has(p.id)) { vistas.add(p.id); validas.push(p); }
    }
    if (validas.length === 0) { descartadas.push((d.ids ?? []).join(",")); continue; }
    const noBook = texto(d.no_book);
    const noApp = texto(d.no_app);
    if (!noBook && !noApp) continue;
    divergencias.push({ chave: `d${divergencias.length}`, pagina: pagina(d.pagina), ids: validas.map((p) => p.id), displayIds: validas.map((p) => p.display_id), noBook, noApp });
  }
  // Contagem: a análise manual nem sempre trouxe os totais — sem eles, o que
  // casou (no_app) mais o que faltou dá a ordem de grandeza.
  const casadas = Array.isArray(j.no_app) ? j.no_app.length : null;
  const pecasNoBook = contagem(j.pecas_no_book) ?? (casadas !== null ? casadas + faltando.length : null);
  let encontradas = contagem(j.encontradas_no_app ?? j.pecas_encontradas_no_app) ?? casadas;
  if (pecasNoBook !== null && encontradas !== null && encontradas > pecasNoBook) encontradas = pecasNoBook;
  return {
    achados: { faltando, canceladas, divergencias, observacoes: texto(j.observacoes, 4000) || null },
    pecasNoBook, encontradas, descartadas,
  };
}

// ── Execução ────────────────────────────────────────────────────────────────
const dir = resolve(pasta);
const arquivos = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".json")).sort();
if (arquivos.length === 0) { console.error(`Nenhum .json em ${dir}`); process.exit(1); }

const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
});
await client.connect();
const hostDoBanco = (() => { try { return new URL(url).host; } catch { return "(url ilegível)"; } })();
console.log(`Banco: ${hostDoBanco}`);
console.log(APLICAR ? "MODO: APLICAR (grava)\n" : "MODO: simulação (nada é gravado — use --aplicar)\n");

const { rows: [{ existe }] } = await client.query(`SELECT to_regclass('public.auditorias_do_book') IS NOT NULL AS existe`);
if (!existe) {
  console.error("A tabela auditorias_do_book não existe neste banco — rode a migração 0007 antes (npm run db:migrate -- --aplicar).");
  await client.end();
  process.exit(1);
}

let gravadas = 0, puladas = 0, totalFaltando = 0, totalCanceladas = 0, totalDiv = 0;
try {
  if (APLICAR) await client.query("BEGIN");
  for (const arq of arquivos) {
    let j;
    try { j = JSON.parse(readFileSync(join(dir, arq), "utf8")); } catch (e) {
      console.log(`✗ ${arq}: JSON ilegível (${e.message})`); puladas++; continue;
    }
    const id8 = String(j.id ?? arq.replace(/\.json$/i, "")).trim().toLowerCase();
    if (!/^[0-9a-f]{8}$/.test(id8)) { console.log(`✗ ${arq}: id "${id8}" não é o prefixo de 8 caracteres de um uuid`); puladas++; continue; }

    const { rows: books } = await client.query(
      `SELECT eb.event_id, eb.book_url, eb.created_at, e.name
         FROM event_books eb JOIN events e ON e.id = eb.event_id
        WHERE eb.book_url ~ $1
        ORDER BY eb.created_at DESC LIMIT 1`,
      [`/${id8}[0-9a-f-]*([?#].*)?$`],
    );
    const book = books[0];
    if (!book) { console.log(`✗ ${id8}: nenhum book publicado com esse uuid`); puladas++; continue; }

    const { rows: [atual] } = await client.query(
      `SELECT book_url FROM event_books WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1`, [book.event_id]);
    const reenviado = atual?.book_url !== book.book_url;
    // Já tem auditoria valendo (inclusive a pendente/rodando): não passa por cima.
    const { rows: jaTem } = await client.query(
      `SELECT id, status FROM auditorias_do_book WHERE event_id = $1 AND status NOT IN ('substituida', 'erro', 'sem_chave') LIMIT 1`,
      [book.event_id]);
    if (jaTem.length) {
      console.log(`– ${id8} · ${book.name}: já tem auditoria (${jaTem[0].status}) — pulado`);
      puladas++; continue;
    }
    if (reenviado) console.log(`  (${id8}: o book foi reenviado depois da análise — a auditoria vale para o book analisado, como a regra do 1º book)`);

    const { rows: pecas } = await client.query(
      `SELECT id, display_id, type, description, status FROM items WHERE event_id = $1 AND deleted_at IS NULL`, [book.event_id]);
    const n = normalizar(j, pecas);
    totalFaltando += n.achados.faltando.length;
    totalCanceladas += n.achados.canceladas.length;
    totalDiv += n.achados.divergencias.length;
    console.log(`✓ ${id8} · ${book.name}: ${n.achados.faltando.length} faltando, ${n.achados.canceladas.length} cancelada(s) no app, ${n.achados.divergencias.length} divergência(s)` +
      (n.descartadas.length ? ` · ${n.descartadas.length} divergência(s) descartada(s) por peça fora do evento (${n.descartadas.join(" | ")})` : ""));

    if (APLICAR) {
      await client.query(
        `UPDATE auditorias_do_book SET status = 'substituida' WHERE event_id = $1 AND status IN ('pendente', 'processando', 'sem_chave')`,
        [book.event_id]);
      await client.query(
        `INSERT INTO auditorias_do_book (event_id, book_url, status, modelo, achados, resolvidos, pecas_no_book, encontradas_no_app, criado_em, concluido_em)
         VALUES ($1, $2, 'concluida', $3, $4::jsonb, '{}'::jsonb, $5, $6, now(), now())`,
        [book.event_id, book.book_url, "análise importada (19/10)", JSON.stringify(n.achados), n.pecasNoBook, n.encontradas]);
    }
    gravadas++;
  }
  if (APLICAR) await client.query("COMMIT");
} catch (e) {
  if (APLICAR) await client.query("ROLLBACK").catch(() => {});
  console.error(`\nFALHOU — nada foi gravado: ${e.message}`);
  await client.end();
  process.exit(1);
}
await client.end();

console.log(`\n${APLICAR ? "Gravadas" : "Seriam gravadas"}: ${gravadas} auditoria(s) · ${totalFaltando} peça(s) faltando · ${totalCanceladas} cancelada(s) no app · ${totalDiv} divergência(s) · puladas: ${puladas}`);
if (!APLICAR && gravadas > 0) console.log("Rode de novo com --aplicar para gravar.");
