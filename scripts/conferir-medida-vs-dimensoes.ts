/**
 * OS CAMPOS DERIVADOS QUE ENVELHECERAM SOZINHOS.
 *
 * A tabela `items` guarda a mesma medida em mais colunas do que precisa, e por
 * duas razões históricas diferentes:
 *
 *   measurement  ← texto "3.95 × 2.95" derivado de file_width × file_height
 *   area/visual  ← as colunas ORIGINAIS da medida visual, hoje duplicadas em
 *                  visual_width/visual_height
 *
 * Nos dois casos, editar a peça mudava o par novo e deixava o velho para trás —
 * e o velho é o que a planilha exportada para a gráfica, a ficha da peça, a
 * triagem, o estoque e a linha do tempo mostram. A peça #2472 foi corrigida de
 * 3.95×2.95 para 7.55×2.25 às 14:36 de 20/08 e a gráfica continuou lendo
 * 3.95×2.95.
 *
 * O servidor já não deixa mais divergir (`deriveMeasurement` e
 * `derivarAreaVisual` em routes/items.ts). Este script é para o PASSIVO: as
 * peças que divergiram antes da correção continuam divergindo, porque nada as
 * toca até alguém editá-las de novo.
 *
 * Uso:
 *   npx tsx scripts/conferir-medida-vs-dimensoes.ts            # só LISTA
 *   npx tsx scripts/conferir-medida-vs-dimensoes.ts --aplicar  # corrige
 *
 * Sem --aplicar ele não escreve nada. A lista sai com o displayId para poder
 * ser conferida à mão antes de qualquer escrita, e o que NÃO parece medida
 * ("conforme croqui") sai numa seção separada, sem ser tocado.
 */
import { db } from "../server/db";
import { items } from "../shared/schema";
import { eq } from "drizzle-orm";

const APLICAR = process.argv.includes("--aplicar");

const num = (v: unknown) => (v != null ? parseFloat(String(v)) : NaN);
const positivo = (n: number) => Number.isFinite(n) && n > 0;

/** Mesmo formato de server/routes/items.ts — se um mudar, o outro mente. */
function medidaDerivada(w: unknown, h: unknown): string | null {
  const nw = num(w), nh = num(h);
  return positivo(nw) && positivo(nh) ? `${nw.toFixed(2)} × ${nh.toFixed(2)}` : null;
}

/**
 * O texto é uma medida (dois números com um separador) ou é prosa?
 *
 * Só o que PARECE medida é candidato a correção automática. "conforme croqui"
 * não é uma medida errada, é outra coisa — e reescrevê-la seria apagar o que
 * alguém digitou de propósito.
 */
function pareceMedida(txt: string): boolean {
  return /^\s*\d+([.,]\d+)?\s*[×xX*]\s*\d+([.,]\d+)?\s*$/.test(txt);
}

type Linha = { id: string; displayId: string | null; atual: string; certo: string };

async function main() {
  const todos = await db.select().from(items);

  const medidas: Linha[] = [];
  const aDecidir: Linha[] = [];
  const pares: (Linha & { area: string; visual: string })[] = [];
  let semDimensoes = 0;

  for (const it of todos) {
    // ── measurement × file_width/file_height ──
    const certo = medidaDerivada(it.fileWidth, it.fileHeight);
    if (certo === null) {
      semDimensoes++;
    } else {
      const atual = String(it.measurement ?? "").trim();
      if (atual !== certo) {
        const linha: Linha = { id: it.id, displayId: it.displayId, atual: atual || "(vazio)", certo };
        (atual === "" || pareceMedida(atual) ? medidas : aDecidir).push(linha);
      }
    }

    // ── area/visual × visual_width/visual_height ──
    const vw = num(it.visualWidth), vh = num(it.visualHeight);
    if (positivo(vw) && positivo(vh)) {
      const area = vw.toFixed(2), visual = vh.toFixed(2);
      if (num(it.area) !== vw || num(it.visual) !== vh) {
        pares.push({
          id: it.id, displayId: it.displayId,
          atual: `${it.area} × ${it.visual}`, certo: `${area} × ${visual}`,
          area, visual,
        });
      }
    }
  }

  console.log(`\n${todos.length} peças · ${semDimensoes} sem dimensões de arquivo (nada a derivar)\n`);

  const bloco = (titulo: string, linhas: Linha[]) => {
    if (linhas.length === 0) { console.log(`${titulo}: nenhuma.\n`); return; }
    console.log(`${titulo}: ${linhas.length}\n`);
    for (const d of linhas) {
      console.log(`  ${(d.displayId ?? d.id).padEnd(12)} ${d.atual.padEnd(20)} →  ${d.certo}`);
    }
    console.log("");
  };

  bloco("MEDIDA (texto) diferente das dimensões de arquivo", medidas);
  bloco("AREA/VISUAL congelados fora do par visual_width/height", pares);

  if (aDecidir.length > 0) {
    console.log(`Texto que NÃO parece medida — não serão tocadas: ${aDecidir.length}\n`);
    for (const d of aDecidir) {
      console.log(`  ${(d.displayId ?? d.id).padEnd(12)} ${JSON.stringify(d.atual)}  (derivaria ${d.certo})`);
    }
    console.log("\n  Se alguma dessas for de fato uma medida velha, corrija pela tela da peça.\n");
  }

  const total = medidas.length + pares.length;
  if (!APLICAR) {
    console.log(`Nada foi escrito. Rode com --aplicar para corrigir as ${total}.\n`);
    return;
  }

  for (const d of medidas) {
    await db.update(items).set({ measurement: d.certo }).where(eq(items.id, d.id));
  }
  for (const p of pares) {
    await db.update(items).set({ area: p.area, visual: p.visual }).where(eq(items.id, p.id));
  }
  console.log(`${total} correções aplicadas (${medidas.length} medidas, ${pares.length} pares area/visual).\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
