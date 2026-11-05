// A NOTA do book gerado contra o book real, página a página, em todos os eventos.
// Cada evento é tratado como novo: o modelo vem de OUTRO evento do mesmo circuito.
// Só lê os arquivos exportados da análise; não toca no sistema.
//   tsx scripts/local/nota-do-book.ts <analise.jsonl> <tamanhos.jsonl> [--detalhe=Evento]
import fs from "fs";
import { arranjoDoModelo, circuitoDoEvento, normalizarDoBook, PAGINA_DO_BOOK, planejarBook, posicionarPagina, secaoDaPeca, type PecaDoBook } from "../../shared/book-automatico";

type El = { x: number; y: number; w: number; h: number };
type Pg = { i: number; tx?: Array<{ s: string; y: number }>; els?: El[] };
type Livro = { id: string; ev: string; evento: string; em: string; n: number; itens: number; pecas: number; pgs: Pg[] };
const ler = (a: string) => fs.readFileSync(a, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
const [arqB, arqT] = process.argv.slice(2);
const detalhe = process.argv.find((a) => a.startsWith("--detalhe="))?.slice(10);
const livros = (ler(arqB) as Livro[]).filter((x) => x.id && x.pgs);
const tam = new Map((ler(arqT) as Array<{ id: string; n: string; p: Array<{ id: string; d: string; t: string; x: string | null; kit: boolean; w?: number; h?: number }> }>).filter((x) => x.id).map((x) => [x.id, x]));
const ult = new Map<string, Livro>(); for (const b of livros) { const u = ult.get(b.ev); if (!u || b.em > u.em) ult.set(b.ev, b); }

const rotuloDe = (p: Pg) => (p.tx ?? []).filter((t) => t.y > 0.8).map((t) => t.s).join(" ").trim();
function artesReais(p: Pg): El[] {
  let els = (p.els ?? []).filter((e) => e.y + e.h <= 0.84 && e.y >= -0.02 && e.w * e.h >= 0.004 && !(e.w > 0.97 && e.h > 0.7));
  els = els.filter((e, i) => !els.slice(0, i).some((o) => Math.abs(o.x - e.x) < 0.005 && Math.abs(o.y - e.y) < 0.005 && Math.abs(o.w - e.w) < 0.005 && Math.abs(o.h - e.h) < 0.005));
  return els;
}
function linhas(els: El[]): number[] {
  const s = els.slice().sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2)); const L: El[][] = [];
  for (const e of s) { const c = e.y + e.h / 2; const l = L.find((r) => c >= Math.min(...r.map((x) => x.y)) && c <= Math.max(...r.map((x) => x.y + x.h))); if (l) l.push(e); else L.push([e]); }
  return L.map((l) => l.length);
}
const caixa = (e: El[]) => ({ x0: Math.min(...e.map((a) => a.x)), y0: Math.min(...e.map((a) => a.y)), x1: Math.max(...e.map((a) => a.x + a.w)), y1: Math.max(...e.map((a) => a.y + a.h)) });
function iou(a: El[], b: El[]) { const A = caixa(a), B = caixa(b); const w = Math.max(0, Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0)), h = Math.max(0, Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0)); const i = w * h; const u = (A.x1 - A.x0) * (A.y1 - A.y0) + (B.x1 - B.x0) * (B.y1 - B.y0) - i; return u > 0 ? i / u : 0; }
function notaDaPagina(real: El[], gerada: El[]) {
  if (!real.length || !gerada.length) return { nota: real.length === gerada.length ? 1 : 0.3, qtd: 0, arranjo: 0, area: 0 };
  const qtd = Math.min(real.length, gerada.length) / Math.max(real.length, gerada.length);
  const lr = linhas(real), lg = linhas(gerada); const arranjo = lr.join("+") === lg.join("+") ? 1 : lr.length === lg.length ? 0.6 : 0;
  const area = iou(real, gerada);
  return { nota: 0.35 * qtd + 0.35 * arranjo + 0.3 * area, qtd, arranjo, area };
}
const { LP, AP, MX, TOPO } = PAGINA_DO_BOOK;
const parecido = (a: string, b: string) => { const x = normalizarDoBook(a).split(" "), y = normalizarDoBook(b).split(" "); const c = x.filter((w) => y.includes(w)).length; return c / Math.max(x.length, y.length, 1); };

type Linha = { ev: string; nota: number; paginasR: number; paginasG: number; casadas: number; semModelo: boolean; circuito: string };
const res: Linha[] = []; const porSecao = new Map<string, { n: number; soma: number; qtd: number; arr: number; area: number; faltou: number; sobrou: number }>();
const sec = (k: string) => { if (!porSecao.has(k)) porSecao.set(k, { n: 0, soma: 0, qtd: 0, arr: 0, area: 0, faltou: 0, sobrou: 0 }); return porSecao.get(k)!; };
for (const b of Array.from(ult.values())) {
  const t = tam.get(b.ev); if (!t) continue;
  // Book parcial (republicado com poucas peças) não é gabarito.
  if (b.n < 8) continue;
  const circuito = circuitoDoEvento(b.evento);
  const irmao = Array.from(ult.values()).filter((x) => x.ev !== b.ev && circuitoDoEvento(x.evento) === circuito).sort((x, y) => y.em.localeCompare(x.em))[0];
  const tamanhos = new Map(t.p.map((p) => [p.id, p]));
  const entrada: PecaDoBook[] = t.p.filter((p) => !p.kit).map((p) => ({ id: p.id, displayId: p.d, tipo: p.t, descricao: p.x, thumb: p.w ? "/objects/x" : null }));
  const plano = planejarBook(entrada, irmao ? { rotulos: irmao.pgs.map(rotuloDe).filter(Boolean) } : null);
  const geradas = plano.paginas.map((pg) => {
    const artes = pg.pecas.map((p) => ({ w: tamanhos.get(p.id)!.w!, h: tamanhos.get(p.id)!.h!, descricao: p.descricao }));
    const pos = posicionarPagina(pg.secao, !!pg.portico, artes);
    return { rotulo: pg.rotulo, secao: pg.secao, els: pos.map((c) => ({ x: (MX + c.x) / LP, y: (TOPO + c.y) / AP, w: c.w / LP, h: c.h / AP })) };
  });
  const reais = b.pgs.filter((p) => rotuloDe(p)).map((p) => ({ rotulo: rotuloDe(p), secao: secaoDaPeca(rotuloDe(p), "") ?? "?", els: artesReais(p) }));
  // Casa cada página real com a gerada de mesma seção e nome mais parecido.
  const livres = new Set(geradas.map((_, i) => i)); let soma = 0, casadas = 0;
  for (const r of reais) {
    let melhor = -1, mp = -1;
    for (const i of Array.from(livres)) { if (geradas[i].secao !== r.secao) continue; const q = parecido(geradas[i].rotulo, r.rotulo) + 0.2 * Math.min(r.els.length, geradas[i].els.length) / Math.max(r.els.length, geradas[i].els.length, 1); if (q > mp) { mp = q; melhor = i; } }
    const s = sec(r.secao);
    if (melhor < 0) { s.faltou++; if (detalhe && b.evento.includes(detalhe)) console.log(`  FALTOU  ${r.rotulo} (${r.els.length} artes)`); continue; }
    livres.delete(melhor); casadas++;
    const n = notaDaPagina(r.els, geradas[melhor].els); soma += n.nota; s.n++; s.soma += n.nota; s.qtd += n.qtd; s.arr += n.arranjo; s.area += n.area;
    if (detalhe && b.evento.includes(detalhe)) console.log(`  ${n.nota.toFixed(2)} ${r.rotulo} real ${linhas(r.els).join("+") || "-"} | gerado ${geradas[melhor].rotulo} ${linhas(geradas[melhor].els).join("+") || "-"} | área ${n.area.toFixed(2)}`);
  }
  for (const i of Array.from(livres)) { sec(geradas[i].secao).sobrou++; if (detalhe && b.evento.includes(detalhe)) console.log(`  A MAIS  ${geradas[i].rotulo} (${geradas[i].els.length} artes)`); }
  res.push({ ev: b.evento, nota: soma / Math.max(reais.length, geradas.length, 1), paginasR: reais.length, paginasG: geradas.length, casadas, semModelo: !irmao, circuito });
}
const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const p = (x: number) => (x * 100).toFixed(0);
const com = res.filter((x) => !x.semModelo);
console.log(`NOTA GERAL: mediana ${p(med(com.map((x) => x.nota)))} | média ${p(com.reduce((a, x) => a + x.nota, 0) / com.length)} | eventos ${com.length} (+${res.length - com.length} sem modelo: ${p(med(res.filter((x) => x.semModelo).map((x) => x.nota)) || 0)})`);
console.log(`Eventos com nota ≥80: ${com.filter((x) => x.nota >= 0.8).length} | ≥70: ${com.filter((x) => x.nota >= 0.7).length} | ≥60: ${com.filter((x) => x.nota >= 0.6).length} | <50: ${com.filter((x) => x.nota < 0.5).length}`);
const circ = new Map<string, number[]>(); for (const x of com) { if (!circ.has(x.circuito)) circ.set(x.circuito, []); circ.get(x.circuito)!.push(x.nota); }
console.log("Por circuito:", Array.from(circ.entries()).filter(([, v]) => v.length >= 2).sort((a, b) => med(b[1]) - med(a[1])).map(([k, v]) => `${k} ${p(med(v))} (${v.length})`).join(" | "));
console.log("Por seção (nota · qtd · arranjo · área · faltou · a mais):");
for (const [k, s] of Array.from(porSecao.entries()).sort((a, b) => b[1].n + b[1].faltou - a[1].n - a[1].faltou).slice(0, 22)) console.log(`  ${k.padEnd(30)} ${s.n ? p(s.soma / s.n) : "-"} · ${s.n ? p(s.qtd / s.n) : "-"} · ${s.n ? p(s.arr / s.n) : "-"} · ${s.n ? p(s.area / s.n) : "-"} · ${s.n}p · faltou ${s.faltou} · a mais ${s.sobrou}`);
console.log("Melhores:", com.slice().sort((a, b) => b.nota - a.nota).slice(0, 5).map((x) => `${x.ev.slice(0, 26)} ${p(x.nota)}`).join(" | "));
console.log("Piores:", com.slice().sort((a, b) => a.nota - b.nota).slice(0, 5).map((x) => `${x.ev.slice(0, 26)} ${p(x.nota)} (${x.paginasG}/${x.paginasR}p)`).join(" | "));
