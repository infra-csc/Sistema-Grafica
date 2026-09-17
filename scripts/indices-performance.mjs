// Roda scripts/indices-performance.sql no banco de DATABASE_URL.
// Só CRIA o que falta (nunca apaga). Uso: node scripts/indices-performance.mjs
//
// Por que um comando por vez: CREATE INDEX CONCURRENTLY não pode rodar dentro
// de transação, e mandar o arquivo inteiro numa query só faz o Postgres
// embrulhar tudo numa transação implícita (erro 25001).
//
// Use a URL DIRETA do Neon (sem "-pooler" no host): o pooler em modo
// transação não segura a sessão que o CONCURRENTLY precisa.
//
// Se um CONCURRENTLY falhar no meio (queda de conexão), o Postgres deixa um
// índice INVÁLIDO com o nome — e o IF NOT EXISTS passaria a pulá-lo. O
// relatório final aponta esses casos; a correção é manual e consciente
// (DROP INDEX CONCURRENTLY "<nome>"; e rodar este script de novo). Este script
// não apaga nada por conta própria.
import { readFileSync } from "fs";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

const comandos = readFileSync(new URL("./indices-performance.sql", import.meta.url), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("--"))
  .join("\n")
  .split(";")
  .map((c) => c.trim())
  .filter(Boolean);

const nomes = comandos.map((c) => /"(IDX_[^"]+)"/.exec(c)?.[1]).filter(Boolean);

const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
// Um comando que falha (timeout, lock, queda) NÃO interrompe os outros: cada
// índice é independente, e parar no primeiro erro deixava os seguintes sem
// criar e sem relatório. As falhas são listadas no fim e o processo sai com
// código ≠ 0 — quem roda (ou a esteira) precisa saber que não ficou completo.
const falhas = [];
let semRelatorio = false;
let faltando = [];
let invalidos = [];
try {
  for (const comando of comandos) {
    const nome = /"(IDX_[^"]+)"/.exec(comando)?.[1] ?? comando.slice(0, 60);
    process.stdout.write(`→ ${nome}… `);
    const inicio = Date.now();
    try {
      await client.query(comando);
      console.log(`ok (${Date.now() - inicio} ms)`);
    } catch (erro) {
      console.log(`FALHOU (${Date.now() - inicio} ms): ${erro?.message ?? erro}`);
      falhas.push({ nome, erro: erro?.message ?? String(erro) });
    }
  }

  // O relatório roda mesmo com falhas acima — é justamente quando ele importa.
  try {
    const r = await client.query(
      `SELECT c.relname AS nome, i.indisvalid AS valido
         FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
        WHERE c.relname = ANY($1)
        ORDER BY 1`,
      [nomes],
    );
    const presentes = new Map(r.rows.map((x) => [x.nome, x.valido]));
    faltando = nomes.filter((n) => !presentes.has(n));
    invalidos = nomes.filter((n) => presentes.get(n) === false);
    console.log(`\nConferido: ${presentes.size}/${nomes.length} índices presentes.`);
    if (faltando.length) console.log("FALTANDO:", faltando.join(", "));
    if (invalidos.length) {
      console.log("INVÁLIDOS (CONCURRENTLY interrompido):", invalidos.join(", "));
      console.log('Para cada um: DROP INDEX CONCURRENTLY "<nome>"; e rode este script de novo.');
    }
  } catch (erro) {
    semRelatorio = true;
    console.log(`\nNão foi possível conferir os índices: ${erro?.message ?? erro}`);
  }
} finally {
  await client.end().catch(() => undefined);
}

if (falhas.length) {
  console.log(`\n${falhas.length} comando(s) falharam:`);
  for (const f of falhas) console.log(`  · ${f.nome}: ${f.erro}`);
}
if (falhas.length || semRelatorio || faltando.length || invalidos.length) {
  console.log("\nÍndices NÃO ficaram completos — veja acima.");
  process.exit(1);
}
