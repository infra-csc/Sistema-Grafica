// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR A FOTO DO UMMENSE — regenera shared/dados/ummense-eventos.json a
// partir de um TSV extraído do Ummense (fluxos "Calendário 2026" e "Atribuir
// Entregas"). É assim que a lista "Sugestões do Ummense" da tela de Eventos é
// atualizada: o app NÃO fala com o Ummense, ele lê esta foto.
//
// Roda com tsx (a conversão é TypeScript, em shared/ummense-foto.ts):
//   npx tsx scripts/importar-ummense.mjs <arquivo.tsv> [--foto-de AAAA-MM-DD] [--origem "texto"] [--saida caminho.json]
//
// --foto-de: o dia da extração (padrão: hoje). Aparece na tela ("Foto do
// Ummense de 15/10"). Depois: commit do JSON, Pull e Stop/Run no Replit — o
// servidor relê o arquivo quando ele muda, sem migração.
//
// O TSV tem cabeçalho e as colunas: nome · data (YYYY-MM-DD) · estacao · tags
// (separadas por |) · patrocinadores ("Nome:COTA|…"). A regra da cidade está
// no topo de shared/ummense-foto.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opcao = (nome) => {
  const i = args.indexOf(nome);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const hojeSP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const fotoDe = opcao("--foto-de") ?? hojeSP;
const origem = opcao("--origem");
const saida = path.resolve(opcao("--saida") ?? path.join(raiz, "shared", "dados", "ummense-eventos.json"));
const arquivo = args[0];

if (!arquivo) {
  console.error("Uso: npx tsx scripts/importar-ummense.mjs <arquivo.tsv> [--foto-de AAAA-MM-DD] [--origem \"texto\"] [--saida caminho.json]");
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(fotoDe)) {
  console.error(`--foto-de "${fotoDe}" não é AAAA-MM-DD.`);
  process.exit(1);
}

const { fotoDoTsv, ORIGEM_PADRAO } = await import("../shared/ummense-foto.ts");
const foto = fotoDoTsv(readFileSync(arquivo, "utf8"), fotoDe, origem ?? ORIGEM_PADRAO);

mkdirSync(path.dirname(saida), { recursive: true });
writeFileSync(saida, JSON.stringify(foto, null, 2) + "\n", "utf8");

const semCidade = foto.eventos.filter((e) => !e.cidade).map((e) => e.nome);
const patrocinios = foto.eventos.reduce((n, e) => n + e.patrocinadores.length, 0);
console.log(`Foto de ${fotoDe}: ${foto.eventos.length} eventos (${foto.eventos[0]?.data ?? "—"} a ${foto.eventos.at(-1)?.data ?? "—"}), ${patrocinios} patrocínios.`);
if (semCidade.length) console.log(`Sem cidade (${semCidade.length}): ${semCidade.join(" · ")}`);
console.log(`Gravado em ${path.relative(raiz, saida) || saida}`);
