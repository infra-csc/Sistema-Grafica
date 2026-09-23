// ─────────────────────────────────────────────────────────────────────────────
// A MIGRAÇÃO ADITIVA LIDA POR COMANDO — apoio das varreduras de migração dos
// testes de estoque/embalagem. O .sql e o .mjs não rodam nos testes de unidade
// (quem os aplica de verdade é o CI/PGlite), então o que se confere é o TEXTO —
// mas por comando e com regex tolerante a espaço, não um recorte entre dois
// comentários que quebra quando alguém reorganiza o arquivo.
// Não é um arquivo de teste: é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync } from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../..");
export const SQL_DA_MIGRACAO = readFileSync(path.join(RAIZ, "scripts/migracao-aditiva-producao.sql"), "utf8");
export const MJS_DA_MIGRACAO = readFileSync(path.join(RAIZ, "scripts/migracao-aditiva-producao.mjs"), "utf8");

/** Sem os comentários `-- …` (para não casar texto de explicação). */
const semComentarios = (s: string) => s.replace(/--[^\n]*/g, "");

/**
 * Os comandos do .sql, um por item. O bloco `DO $$ … END $$;` conta como um
 * comando só (os `;` de dentro dele não cortam).
 */
export function comandosDaMigracao(sql = SQL_DA_MIGRACAO): string[] {
  const limpo = semComentarios(sql);
  const saida: string[] = [];
  let atual = "";
  let dentroDoDo = false;
  for (const linha of limpo.split(/\r?\n/)) {
    atual += `${linha}\n`;
    if (/^\s*DO\s+\$\$/i.test(linha)) dentroDoDo = true;
    if (dentroDoDo) {
      if (/^\s*END\s+\$\$\s*;\s*$/i.test(linha)) { saida.push(atual.trim()); atual = ""; dentroDoDo = false; }
      continue;
    }
    if (/;\s*$/.test(linha)) { saida.push(atual.trim()); atual = ""; }
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida.filter(Boolean);
}

/** Os comandos que citam a tabela (ou coluna) — com a palavra inteira. */
export const comandosQueCitam = (nome: string) =>
  comandosDaMigracao().filter((c) => new RegExp(`\\b${nome}\\b`, "i").test(c));

/** O que é destrutivo num comando aditivo ("ON DELETE CASCADE" de FK não conta). */
export const DESTRUTIVO = /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bALTER\s+COLUMN\b|ALTER\s+TABLE\s+\w+\s+DROP\b/i;

/** As colunas de `CREATE TABLE IF NOT EXISTS <tabela> ( … );`, na ordem. */
export function colunasDoCreate(tabela: string): string[] {
  const cmd = comandosDaMigracao().find((c) => new RegExp(`^CREATE TABLE IF NOT EXISTS ${tabela}\\s*\\(`, "i").test(c));
  if (!cmd) return [];
  const corpo = cmd.slice(cmd.indexOf("(") + 1, cmd.lastIndexOf(")"));
  return corpo.split(/\n/).map((l) => /^\s*([a-z_]+)\s+\w/.exec(l)?.[1]).filter((c): c is string => !!c && !/^(constraint|primary|unique|check|foreign)$/i.test(c));
}

/** O que o .mjs confere depois de rodar: tabela → colunas (`table_name='x' AND column_name IN (…)` ou `= '…'`). */
export function colunasConferidasPeloMjs(): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  const re = /table_name\s*=\s*'([a-z_]+)'\s+AND\s+column_name\s*(?:IN\s*\(([^)]*)\)|=\s*'([a-z_]+)')/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(MJS_DA_MIGRACAO)) !== null) {
    const cols: string[] = [];
    if (m[2]) {
      const reCol = /'([a-z_]+)'/g;
      let c: RegExpExecArray | null;
      while ((c = reCol.exec(m[2])) !== null) cols.push(c[1]);
    } else cols.push(m[3]);
    const s = mapa.get(m[1]) ?? new Set<string>();
    for (const c of cols) s.add(c);
    mapa.set(m[1], s);
  }
  return mapa;
}
