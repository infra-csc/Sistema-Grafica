// ─────────────────────────────────────────────────────────────────────────────
// VÍNCULOS DUPLICADOS — só LÊ (nada é apagado, nada é alterado).
//
// Antes de criar índice ÚNICO em item_sponsors, item_sponsor_approvals e
// event_sponsors é preciso saber se já há pares repetidos no banco: o CREATE
// UNIQUE INDEX falharia (ou, pior, alguém "limparia" à mão sem critério).
// Este script conta e mostra exemplos; a decisão de qual linha fica é do dono.
//
//   node scripts/contar-vinculos-duplicados.mjs                    ← DEV
//   DATABASE_URL="<produção>" node scripts/contar-vinculos-duplicados.mjs
// ─────────────────────────────────────────────────────────────────────────────
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }

const TABELAS = [
  { tabela: "item_sponsors", chave: ["item_id", "sponsor_id"] },
  { tabela: "item_sponsor_approvals", chave: ["item_id", "sponsor_id"] },
  { tabela: "event_sponsors", chave: ["event_id", "sponsor_id"] },
];
const EXEMPLOS = 15;

const client = new pg.Client({ connectionString: url, ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: false } : undefined });
await client.connect();
let comDuplicata = 0;
try {
  // Só leitura, garantido pelo próprio Postgres.
  await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
  for (const { tabela, chave } of TABELAS) {
    const cols = chave.join(", ");
    const { rows: [tot] } = await client.query(
      `SELECT count(*)::int AS pares, coalesce(sum(n - 1), 0)::int AS linhas_a_mais
         FROM (SELECT ${cols}, count(*) AS n FROM ${tabela} GROUP BY ${cols} HAVING count(*) > 1) d`,
    );
    console.log(`\n${tabela} (${cols}): ${tot.pares} par(es) repetido(s), ${tot.linhas_a_mais} linha(s) a mais`);
    if (tot.pares === 0) continue;
    comDuplicata += 1;
    const { rows } = await client.query(
      `SELECT ${cols}, count(*)::int AS n, min(created_at) AS primeira, max(created_at) AS ultima
         FROM ${tabela} GROUP BY ${cols} HAVING count(*) > 1
        ORDER BY count(*) DESC, max(created_at) DESC LIMIT ${EXEMPLOS}`,
    );
    for (const r of rows) {
      console.log(`  ${chave.map((c) => `${c}=${r[c]}`).join("  ")}  ×${r.n}  (${new Date(r.primeira).toISOString().slice(0, 10)} → ${new Date(r.ultima).toISOString().slice(0, 10)})`);
    }
    if (tot.pares > EXEMPLOS) console.log(`  … e mais ${tot.pares - EXEMPLOS}`);
  }
} finally {
  await client.end();
}
console.log(comDuplicata === 0
  ? "\nNenhuma duplicata: dá para criar os índices únicos (em migração aditiva, com CONCURRENTLY)."
  : "\nHá duplicatas: NÃO crie índice único antes de decidir, com o dono, qual linha de cada par fica.");
