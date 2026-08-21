/**
 * A MEDIDA ESCRITA × AS DIMENSÕES GUARDADAS.
 *
 * `items.measurement` é texto ("3.95 × 2.95") e vive ao lado de `file_width` e
 * `file_height`, que guardam os mesmos dois números. Até hoje, editar as
 * dimensões mudava as colunas e o m² e deixava o texto para trás — e o texto é
 * o que sai na coluna "Medida" da planilha exportada para a gráfica, na ficha
 * da peça, na triagem e no estoque.
 *
 * O servidor já não deixa mais divergir (deriveMeasurement em routes/items.ts).
 * Este script é para o passivo: as peças que divergiram ANTES da correção
 * continuam divergindo, porque nada as toca até alguém editá-las de novo.
 *
 * Uso:
 *   npx tsx scripts/conferir-medida-vs-dimensoes.ts            # só LISTA
 *   npx tsx scripts/conferir-medida-vs-dimensoes.ts --aplicar  # corrige
 *
 * Sem --aplicar ele não escreve nada. A lista sai com o displayId para poder
 * ser conferida à mão contra a peça antes de qualquer escrita — algumas
 * divergências são texto escrito de propósito ("conforme croqui"), e essas o
 * script mostra separadas, na seção "à decidir", sem tocar nelas.
 */
import { db } from "../server/db";
import { items } from "../shared/schema";
import { eq } from "drizzle-orm";

const APLICAR = process.argv.includes("--aplicar");

/** Mesmo formato de server/routes/items.ts — se um mudar, o outro mente. */
function medidaDerivada(w: unknown, h: unknown): string | null {
  const nw = w != null ? parseFloat(String(w)) : NaN;
  const nh = h != null ? parseFloat(String(h)) : NaN;
  if (Number.isFinite(nw) && nw > 0 && Number.isFinite(nh) && nh > 0) {
    return `${nw.toFixed(2)} × ${nh.toFixed(2)}`;
  }
  return null;
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

async function main() {
  const todos = await db.select().from(items);

  const divergentes: { id: string; displayId: string | null; atual: string; certo: string }[] = [];
  const aDecidir: { id: string; displayId: string | null; atual: string; certo: string }[] = [];
  let semDimensoes = 0;

  for (const it of todos) {
    const certo = medidaDerivada(it.fileWidth, it.fileHeight);
    if (certo === null) { semDimensoes++; continue; }
    const atual = String(it.measurement ?? "").trim();
    if (atual === certo) continue;
    const linha = { id: it.id, displayId: it.displayId, atual: atual || "(vazio)", certo };
    if (atual === "" || pareceMedida(atual)) divergentes.push(linha);
    else aDecidir.push(linha);
  }

  console.log(`\n${todos.length} peças no total · ${semDimensoes} sem dimensões de arquivo (nada a derivar)\n`);

  if (divergentes.length === 0) {
    console.log("Nenhuma medida divergente do par largura × altura.");
  } else {
    console.log(`${divergentes.length} com a medida diferente das dimensões guardadas:\n`);
    for (const d of divergentes) {
      console.log(`  ${(d.displayId ?? d.id).padEnd(12)} ${d.atual.padEnd(20)} →  ${d.certo}`);
    }
  }

  if (aDecidir.length > 0) {
    console.log(`\n${aDecidir.length} com texto que NÃO parece medida — não serão tocadas:\n`);
    for (const d of aDecidir) {
      console.log(`  ${(d.displayId ?? d.id).padEnd(12)} ${JSON.stringify(d.atual)}  (derivaria ${d.certo})`);
    }
    console.log("\n  Se alguma dessas for de fato uma medida velha, corrija pela tela da peça.");
  }

  if (!APLICAR) {
    console.log(`\nNada foi escrito. Rode com --aplicar para corrigir as ${divergentes.length}.\n`);
    return;
  }

  for (const d of divergentes) {
    await db.update(items).set({ measurement: d.certo }).where(eq(items.id, d.id));
  }
  console.log(`\n${divergentes.length} medidas corrigidas.\n`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
