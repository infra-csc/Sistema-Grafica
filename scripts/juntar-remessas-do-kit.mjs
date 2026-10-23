// ─────────────────────────────────────────────────────────────────────────────
// KIT NUMA INCLUSÃO SÓ (dono, 23/10) — conferir (e, se quiser, fazer) a junção
// das remessas do Kit no banco de DATABASE_URL.
//
// A junção mora na migração 0009 (migrations/0009_juntar-remessas-do-kit.sql) e
// roda sozinha no `npm run db:migrate -- --aplicar`. Este script existe para
// VER ANTES o que ela vai fazer em produção: por evento, quantas remessas
// existem, quantas peças cada uma tem e qual fica (a mais antiga).
//
// USO
//   node scripts/juntar-remessas-do-kit.mjs            → simulação (padrão): só lista
//   node scripts/juntar-remessas-do-kit.mjs --aplicar  → executa a MESMA SQL da 0009,
//                                                        numa transação só
//
// Seguro de rodar quantas vezes quiser: sem evento com duas remessas, não faz nada.
// Nenhuma peça é apagada — as peças das remessas extras passam para a que fica
// (inclusive as excluídas, que guardam a marca "peça do Kit") e só então as
// remessas extras saem. Uma linha na trilha (audit_logs) por evento juntado.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const APLICAR = args.has("--aplicar");
for (const a of args) {
  if (a !== "--aplicar") {
    console.error(`Opção desconhecida: ${a}\nUso: node scripts/juntar-remessas-do-kit.mjs [--aplicar]`);
    process.exit(2);
  }
}

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL não definida."); process.exit(1); }
const host = (() => { try { return new URL(url).host; } catch { return "(url ilegível)"; } })();

const client = new pg.Client({
  connectionString: url,
  ssl: /sslmode=require|neon\.tech/.test(url) ? { rejectUnauthorized: true } : undefined,
});
await client.connect();

const dia = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "—");

try {
  const { rows } = await client.query(`
    SELECT r.id, r.event_id, e.name AS evento, r.versao, r.created_at, r.entrega_material,
           row_number() OVER (PARTITION BY r.event_id ORDER BY r.created_at, r.id) AS posicao,
           count(*) OVER (PARTITION BY r.event_id) AS total,
           (SELECT count(*) FROM items i WHERE i.kit_remessa_id = r.id AND i.deleted_at IS NULL) AS vivas,
           (SELECT count(*) FROM items i WHERE i.kit_remessa_id = r.id AND i.deleted_at IS NOT NULL) AS excluidas
    FROM kit_remessas r LEFT JOIN events e ON e.id = r.event_id
    ORDER BY e.name, r.event_id, r.created_at, r.id`);

  const porEvento = new Map();
  for (const r of rows) {
    const l = porEvento.get(r.event_id) ?? [];
    l.push(r);
    porEvento.set(r.event_id, l);
  }
  const aJuntar = Array.from(porEvento.values()).filter((l) => l.length > 1);

  console.log(`Banco: ${host}`);
  console.log(`${porEvento.size} ${porEvento.size === 1 ? "evento tem" : "eventos têm"} Kit · ${rows.length} ${rows.length === 1 ? "remessa" : "remessas"} no total.`);
  if (aJuntar.length === 0) {
    console.log("Nenhum evento com mais de uma remessa — nada a juntar.");
  } else {
    let pecas = 0;
    console.log(`\n${aJuntar.length} ${aJuntar.length === 1 ? "evento será juntado" : "eventos serão juntados"}:\n`);
    for (const l of aJuntar) {
      const fica = l[0];
      console.log(`• ${fica.evento ?? "(evento não encontrado)"} [${fica.event_id}] — ${l.length} remessas`);
      for (const r of l) {
        const n = Number(r.vivas), x = Number(r.excluidas);
        if (r !== fica) pecas += n + x;
        console.log(`    ${r === fica ? "fica " : "junta"}  ${String(r.versao).padEnd(6)} criada ${dia(r.created_at)} · entrega ${dia(r.entrega_material)} · ${n} ${n === 1 ? "peça" : "peças"}${x ? ` (+${x} excluída${x === 1 ? "" : "s"})` : ""}`);
      }
    }
    console.log(`\n${pecas} ${pecas === 1 ? "peça muda" : "peças mudam"} de remessa; nenhuma é apagada.`);
  }

  if (!APLICAR) {
    console.log("\nSIMULAÇÃO — nada foi gravado. Para juntar: node scripts/juntar-remessas-do-kit.mjs --aplicar");
    console.log("(ou rode a migração: npm run db:migrate -- --aplicar — ela faz a mesma junção.)");
  } else {
    const sql = readFileSync(resolve(RAIZ, "migrations", "0009_juntar-remessas-do-kit.sql"), "utf8");
    const comandos = sql.split("--> statement-breakpoint").map((c) => c.trim()).filter(Boolean);
    await client.query("BEGIN");
    try {
      for (const c of comandos) await client.query(c);
      await client.query("COMMIT");
    } catch (erro) {
      await client.query("ROLLBACK");
      throw erro;
    }
    const { rows: [depois] } = await client.query(
      `SELECT count(*) AS remessas, count(DISTINCT event_id) AS eventos FROM kit_remessas`);
    const ne = Number(depois.eventos), nr = Number(depois.remessas);
    console.log(`\nAPLICADO. Agora: ${ne} ${ne === 1 ? "evento" : "eventos"} com Kit, ${nr} ${nr === 1 ? "inclusão" : "inclusões"} (uma por evento).`);
  }
} catch (erro) {
  console.error("Falhou:", erro?.message ?? erro);
  process.exitCode = 1;
} finally {
  await client.end();
}
