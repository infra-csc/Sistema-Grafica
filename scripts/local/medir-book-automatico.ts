// Mede o gerador nos books reais, como se cada evento fosse novo: o modelo vem de OUTRO
// evento do mesmo circuito. Lê os arquivos exportados pela análise; não toca no sistema.
//   tsx scripts/local/medir-book-automatico.ts <analise.jsonl> <pecas.json>
import fs from "fs";
import { circuitoDoEvento, planejarBook, secaoDaPeca, type PecaDoBook } from "../../shared/book-automatico";

type Livro = { id: string; ev: string; evento: string; em: string; n: number; pgs: Array<{ tx?: Array<{ s: string; y: number }> }> };
const [arqB, arqP] = process.argv.slice(2);
const livros = fs.readFileSync(arqB, "utf8").split("\n").filter(Boolean).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } }).filter((x) => x.id && x.pgs) as Livro[];
const pecas = JSON.parse(fs.readFileSync(arqP, "utf8")) as Array<{ e: string; id: string; t: string; d: string | null; s: string; th: boolean; kit: boolean }>;
const rotulosDe = (b: Livro) => b.pgs.map((p) => (p.tx ?? []).filter((t) => t.y > 0.8).map((t) => t.s).join(" ").trim()).filter(Boolean);
const ult = new Map<string, Livro>(); for (const b of livros) { const u = ult.get(b.ev); if (!u || b.em > u.em) ult.set(b.ev, b); }
const porEv = new Map<string, typeof pecas>(); for (const p of pecas) { if (!porEv.has(p.e)) porEv.set(p.e, []); porEv.get(p.e)!.push(p); }
const res: Array<{ ev: string; achadas: number; reais: number; demais: number; pgReal: number; pgGer: number; ordem: number; conferir: number; fora: number; tot: number; semModelo: boolean }> = [];
for (const b of Array.from(ult.values())) {
  const circuito = circuitoDoEvento(b.evento);
  const irmaos = Array.from(ult.values()).filter((x) => x.ev !== b.ev && circuitoDoEvento(x.evento) === circuito).sort((x, y) => y.em.localeCompare(x.em));
  const entrada: PecaDoBook[] = (porEv.get(b.ev) ?? []).filter((p) => !/cancel|delet|archiv/.test(p.s) && !p.kit).map((p) => ({ id: p.id, displayId: p.id, tipo: p.t, descricao: p.d, thumb: p.th ? "/objects/x" : null }));
  const plano = planejarBook(entrada, irmaos[0] ? { rotulos: rotulosDe(irmaos[0]) } : null);
  const reais = Array.from(new Set(rotulosDe(b).map((r) => secaoDaPeca(r, "")).filter(Boolean))) as string[];
  const ger = Array.from(new Set(plano.paginas.map((p) => p.secao)));
  const comuns = reais.filter((s) => ger.includes(s));
  // Pares na mesma ordem: 100% = sequência igual.
  let certos = 0, total = 0; for (let i = 0; i < comuns.length; i++) for (let j = i + 1; j < comuns.length; j++) { total++; if (ger.indexOf(comuns[i]) < ger.indexOf(comuns[j])) certos++; }
  res.push({ ev: b.evento, achadas: comuns.length, reais: reais.length, demais: ger.filter((s) => !reais.includes(s)).length, pgReal: b.n, pgGer: plano.paginas.length + 1, ordem: total ? certos / total : 1, conferir: plano.paginas.filter((p) => p.conferir).length, fora: plano.fora.length, tot: entrada.length, semModelo: !irmaos[0] });
}
const soma = (f: (x: (typeof res)[number]) => number) => res.reduce((a, x) => a + f(x), 0);
const com = res.filter((x) => !x.semModelo);
const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log("eventos", res.length, "| com modelo de outro evento do circuito", com.length, "| sem", res.length - com.length);
console.log("seções reais recriadas:", soma((x) => x.achadas), "de", soma((x) => x.reais), Math.round((soma((x) => x.achadas) / soma((x) => x.reais)) * 100) + "%", "| seções a mais:", soma((x) => x.demais));
console.log("só com modelo: recriadas", Math.round((com.reduce((a, x) => a + x.achadas, 0) / com.reduce((a, x) => a + x.reais, 0)) * 100) + "%", "| a mais por evento (mediana)", med(com.map((x) => x.demais)));
console.log("ordem das seções, pares certos (mediana):", Math.round(med(com.map((x) => x.ordem)) * 100) + "%");
const dif = com.map((x) => Math.abs(x.pgGer - x.pgReal)); console.log("diferença de páginas: mediana", med(dif), "| até 2 páginas:", dif.filter((d) => d <= 2).length, "de", dif.length, "| páginas reais (mediana)", med(com.map((x) => x.pgReal)));
console.log("páginas para conferir por book (mediana):", med(com.map((x) => x.conferir)), "| peças fora (mediana):", med(com.map((x) => x.fora)), "de", med(com.map((x) => x.tot)));
console.log("piores:", com.slice().sort((a, b) => a.achadas / a.reais - b.achadas / b.reais).slice(0, 6).map((x) => `${x.ev.slice(0, 28)} ${x.achadas}/${x.reais}`).join(" | "));
