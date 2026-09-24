/**
 * EXPORTAR EVENTOS PARA O CHECKLIST DE ARENA (demo local) — SÓ LEITURA.
 *
 * A integração por token não está publicada. Para mostrar o Checklist com
 * dados REAIS, este script lê do banco o mesmo JSON que as rotas
 * GET /api/integracao/checklist/eventos e .../eventos/:id/entregues devolvem
 * (a mesma montagem: server/services/checklist-entregues.ts) e grava num
 * arquivo. Não busca a arte (o storage não existe na máquina local): o
 * `temImagem` segue como está.
 *
 * Uso (PowerShell):
 *   $env:DATABASE_URL="<cole aqui>"
 *   npx tsx scripts/exportar-checklist.ts                       # só LISTA os eventos
 *   npx tsx scripts/exportar-checklist.ts --exportar            # os 3 mais recentes
 *   npx tsx scripts/exportar-checklist.ts --ultimos 2           # os 2 mais recentes
 *   npx tsx scripts/exportar-checklist.ts --todos               # todos com peça entregue
 *   npx tsx scripts/exportar-checklist.ts <id> [<id> ...]       # eventos escolhidos
 *   ... --saida C:\caminho\arquivo.json                         # outro destino
 *   Remove-Item Env:DATABASE_URL
 *
 * Arquivo (padrão ./checklist-eventos.json):
 *   { geradoEm, eventos: [ { lista: <item de /eventos>, entregues: <JSON de /entregues> } ] }
 *
 * SEGURANÇA:
 *   · o endereço do banco vem SÓ de DATABASE_URL — nunca de argumento, nunca
 *     impresso (nem em mensagem de erro: ele é apagado do texto);
 *   · nenhuma outra variável é necessária: o script NÃO importa server/db
 *     (nem o servidor); abre o próprio cliente com o mesmo schema;
 *   · SÓ LEITURA em três camadas: a sessão é posta em
 *     `default_transaction_read_only`, tudo roda dentro de uma transação
 *     `begin read only`, e o script confere `transaction_read_only = on`
 *     antes da primeira consulta — se não estiver, para sem ler nada. Qualquer
 *     INSERT/UPDATE/DELETE nessa transação o próprio Postgres recusa.
 */
import { writeFileSync } from "fs";
import path from "path";
import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { sql } from "drizzle-orm";
import ws from "ws";
import * as schema from "../shared/schema";
import {
  listarEventosDoChecklist,
  montarEntreguesDoEvento,
  type EventoDaListaDoChecklist,
  type RespostaDasEntregues,
} from "../server/services/checklist-entregues";

neonConfig.webSocketConstructor = ws;

const ULTIMOS_PADRAO = 3;
const SAIDA_PADRAO = "checklist-eventos.json";

type Pedido =
  | { modo: "listar" }
  | { modo: "ultimos"; n: number; saida: string }
  | { modo: "todos"; saida: string }
  | { modo: "ids"; ids: string[]; saida: string };

function falhar(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

function lerArgumentos(argv: string[]): Pedido {
  const ids: string[] = [];
  let exportar = false;
  let todos = false;
  let ultimos: number | null = null;
  let saida: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--exportar") exportar = true;
    else if (a === "--todos") todos = true;
    else if (a === "--ultimos") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < 1) falhar("--ultimos precisa de um número inteiro maior que zero (ex.: --ultimos 2).");
      ultimos = n;
    } else if (a === "--saida") {
      const s = argv[++i];
      if (!s || s.startsWith("--")) falhar("--saida precisa de um caminho de arquivo.");
      saida = s;
    } else if (a.startsWith("-")) {
      falhar(`Opção desconhecida: ${a}. Use --exportar, --ultimos <n>, --todos, --saida <arquivo> ou ids de evento.`);
    } else {
      ids.push(a);
    }
  }
  const modos = [ids.length > 0, ultimos !== null, todos].filter(Boolean).length;
  if (modos > 1) falhar("Escolha UM: ids de evento, --ultimos <n> ou --todos.");
  const destino = path.resolve(saida ?? SAIDA_PADRAO);
  if (ids.length > 0) return { modo: "ids", ids: Array.from(new Set(ids)), saida: destino };
  if (todos) return { modo: "todos", saida: destino };
  if (ultimos !== null) return { modo: "ultimos", n: ultimos, saida: destino };
  if (exportar) return { modo: "ultimos", n: ULTIMOS_PADRAO, saida: destino };
  if (saida) falhar("--saida só vale ao exportar (--exportar, --ultimos, --todos ou ids).");
  return { modo: "listar" };
}

/** Tira o endereço do banco (e a senha dele) de qualquer texto antes de imprimir. */
function semSegredo(texto: string, url: string): string {
  let t = texto.split(url).join("<DATABASE_URL>");
  try {
    const u = new URL(url);
    if (u.password) t = t.split(u.password).join("***");
    if (u.password) t = t.split(decodeURIComponent(u.password)).join("***");
  } catch { /* URL fora do padrão: já trocamos o texto inteiro acima */ }
  return t;
}

/**
 * O texto do erro. O driver do Neon, quando a conexão (WebSocket) cai, lança
 * um evento, não um Error — sem isto sairia "[object Object]".
 */
function descreverErro(e: unknown, profundidade = 0): string {
  if (e instanceof Error) {
    const causa = (e as Error & { cause?: unknown }).cause;
    return causa && profundidade < 2 ? `${e.message} (${descreverErro(causa, profundidade + 1)})` : e.message;
  }
  if (e && typeof e === "object") {
    const o = e as { message?: unknown; error?: unknown };
    if (typeof o.message === "string" && o.message) return o.message;
    if (o.error && profundidade < 2) return descreverErro(o.error, profundidade + 1);
    return "não foi possível conectar ao banco (confira a DATABASE_URL e a rede).";
  }
  return String(e);
}

const dataCurta =(iso: string | null) => (iso ? iso.slice(0, 10) : "sem data  ");

function resumo(e: RespostaDasEntregues) {
  const unidades = e.itens.reduce((s, i) => s + i.quantidadeEntregue, 0);
  const semTubo = e.itens.filter((i) => i.tubos.length === 0).length;
  const tubos = e.tubos.filter((t) => !t.avulso).length;
  const avulsos = e.tubos.length - tubos;
  return { pecas: e.itens.length, unidades, tubos, avulsos, semTubo };
}

async function main() {
  const pedido = lerArgumentos(process.argv.slice(2));

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    falhar(
      "DATABASE_URL não está definida. No PowerShell:\n" +
      '    $env:DATABASE_URL="<cole aqui>"; npx tsx scripts/exportar-checklist.ts\n' +
      "  (e depois: Remove-Item Env:DATABASE_URL)",
    );
  }

  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 15_000 });
  let cliente: PoolClient | null = null;
  try {
    cliente = await pool.connect();
    // Camada 1: toda transação desta conexão nasce só de leitura.
    await cliente.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    await cliente.query("SET default_transaction_read_only = on");
    const banco = drizzle({ client: cliente, schema });

    // Camada 2: a transação é `begin read only`.
    await banco.transaction(async (tx) => {
      // Camada 3: confere antes de ler qualquer coisa.
      const r = await tx.execute(sql`select current_setting('transaction_read_only') as ro`);
      const ro = String((r as unknown as { rows: Array<{ ro: string }> }).rows?.[0]?.ro ?? "");
      if (ro !== "on") throw new Error(`a transação não ficou só de leitura (transaction_read_only=${ro || "?"}); nada foi lido.`);

      if (pedido.modo === "listar") {
        const { eventos } = await listarEventosDoChecklist(tx);
        if (eventos.length === 0) {
          console.log("Nenhum evento recente com peça da Arena entregue.");
          return;
        }
        console.log(`Eventos recentes com peça da Arena entregue (${eventos.length}):\n`);
        for (const e of eventos) {
          console.log(`  ${dataCurta(e.inicio)}  ${String(e.pecasEntregues).padStart(4)} peças  ${e.id}  ${e.nome}`);
        }
        console.log(
          "\nPara exportar: --exportar (os 3 mais recentes), --ultimos <n>, --todos, ou os ids.\n" +
          "  npx tsx scripts/exportar-checklist.ts <id-do-evento> [<id> ...]",
        );
        return;
      }

      const lista = await listarEventosDoChecklist(tx, { semJanela: pedido.modo !== "ultimos" });
      const porId = new Map(lista.eventos.map((e) => [e.id, e]));
      const escolhidos: string[] =
        pedido.modo === "ids" ? pedido.ids
        : pedido.modo === "ultimos" ? lista.eventos.slice(0, pedido.n).map((e) => e.id)
        : lista.eventos.map((e) => e.id);
      if (escolhidos.length === 0) throw new Error("nenhum evento com peça da Arena entregue para exportar.");

      const saida: Array<{ lista: EventoDaListaDoChecklist; entregues: RespostaDasEntregues }> = [];
      const naoEncontrados: string[] = [];
      for (const id of escolhidos) {
        const entregues = await montarEntreguesDoEvento(tx, id);
        if (!entregues) { naoEncontrados.push(id); continue; }
        // Evento pedido por id que não está na lista (nenhuma peça entregue):
        // a entrada é montada da própria resposta, com a mesma contagem.
        const daLista = porId.get(id) ?? { ...entregues.evento, pecasEntregues: entregues.itens.length };
        saida.push({ lista: daLista, entregues });
      }
      if (naoEncontrados.length > 0) {
        throw new Error(`evento(s) não encontrado(s): ${naoEncontrados.join(", ")}. Nada foi gravado. Rode sem argumentos para ver os ids.`);
      }

      writeFileSync(pedido.saida, JSON.stringify({ geradoEm: new Date().toISOString(), eventos: saida }, null, 2) + "\n", "utf8");

      console.log(`Exportado: ${pedido.saida}\n`);
      let tp = 0, tu = 0, tt = 0;
      for (const { entregues: e } of saida) {
        const r = resumo(e);
        tp += r.pecas; tu += r.unidades; tt += r.tubos + r.avulsos;
        console.log(
          `  ${e.evento.nome}\n` +
          `    ${r.pecas} peças · ${r.unidades} unidades · ${r.tubos} tubos · ${r.avulsos} avulsos · ${r.semTubo} peças sem tubo`,
        );
        if (r.pecas === 0) console.log("    (atenção: nenhuma peça da Arena entregue neste evento)");
      }
      console.log(`\nTotal: ${saida.length} evento(s), ${tp} peças, ${tu} unidades, ${tt} volumes.`);
    }, { accessMode: "read only" });
  } catch (e) {
    // Só a mensagem (sem stack, sem o objeto do driver), e sem o endereço.
    console.error(`\n✗ Falha: ${semSegredo(descreverErro(e), url)}\n`);
    process.exitCode = 1;
  } finally {
    cliente?.release();
    await pool.end().catch(() => {});
  }
}

main();
