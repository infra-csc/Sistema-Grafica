/**
 * MAPA DE CORES — quais hexes ainda estão cravados, e qual token cabe em cada.
 *
 * SÓ LÊ. Não escreve, não toca em arquivo nenhum, não pede banco. O que ele
 * produz é uma LISTA para a pessoa decidir, arquivo por arquivo.
 *
 * ─── por que uma lista, e não um substituidor automático ────────────────────
 *
 * A troca em massa de hex por token parece mecânica e não é. Nesta mesma
 * rodada, três casos apareceram nas telas menores e nenhum deles é decidível
 * sem olhar:
 *
 *   · `border-[#e7e5e4]` na Sidebar é valor arbitrário de TAILWIND, lido em
 *     tempo de build. Trocado por um token, a classe some da folha gerada e a
 *     borda simplesmente não existe mais.
 *   · `impressaErrada ? "#fca5a5" : divergente ? "#fecaca"` são DOIS degraus
 *     de propósito. Mapear os dois para `TOM.perigo.border` faz o ternário
 *     devolver a mesma cor nos dois ramos, e a diferença entre "já imprimiu" e
 *     "ainda dá para corrigir" desaparece sem ninguém notar.
 *   · `#f25022`, `#7fba00`, `#00a4ef`, `#ffb900` no login são o logo da
 *     Microsoft. Não são a paleta de ninguém e não devem virar token.
 *
 * Por isso este script SUGERE. A coluna "por quê" existe para quem vai aplicar
 * saber o que está aceitando.
 *
 * ─── uso ────────────────────────────────────────────────────────────────────
 *
 *   node scripts/mapa-de-cores.mjs                    # tudo em client/src
 *   node scripts/mapa-de-cores.mjs client/src/pages   # só uma pasta
 *   node scripts/mapa-de-cores.mjs --resumo           # só o total por arquivo
 *   node scripts/mapa-de-cores.mjs --sem-token        # só os hexes órfãos
 *
 * A fonte dos tokens é client/src/lib/theme.ts (T, N, TOM) e, por trás dela, a
 * paleta P de lib/status.ts. Se um hex aparece aqui como "sem token", ou ele é
 * marca de terceiro (e fica), ou é um tom que ninguém decidiu adotar (e a
 * pergunta é qual degrau da escada ele deveria ser) — não invente o décimo
 * segundo cinza.
 */
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────────────────────────────────────
// A tabela. Espelha N, T e TOM de client/src/lib/theme.ts.
//
// O "porquê" de cada linha é curto de propósito: ele responde "posso trocar
// direto?" e não "o que é esta cor".
// ─────────────────────────────────────────────────────────────────────────────
const TOKENS = {
  // ── neutros: a escada ──────────────────────────────────────────────────
  "#ffffff": ["T.surface", "superfície pura (n0)"],
  "#fff": ["T.surface", "superfície pura (n0)"],
  "#fafaf9": ["T.bg", "fundo de página (n1)"],
  "#f9f9f8": ["T.bg", "era o T.bg antigo — hoje n1 é #fafaf9"],
  "#f5f5f4": ["T.low", "superfície sutil (n2)"],
  "#f3f4f3": ["T.low", "variante do n2"],
  "#f0efee": ["N.n3", "separador claro / campo"],
  "#f0efec": ["N.n3", "tom único de um arquivo — vizinho do n3"],
  "#f5f4f0": ["N.n3", "tom único de um arquivo — vizinho do n3"],
  "#f5f4f2": ["N.n3", "tom único de um arquivo — vizinho do n3"],
  "#f1efec": ["N.n3", "tom único de um arquivo — vizinho do n3"],
  "#eeeeed": ["T.border", "tom único de um arquivo — vizinho do n4"],
  "#e7e5e4": ["T.border", "BORDA PADRÃO (n4)"],
  "#e8e8e7": ["T.border", "era o T.border antigo — hoje n4 é #e7e5e4"],
  "#d6d3d1": ["T.bdark", "borda forte (n5)"],
  "#d4d0ce": ["T.bdark", "vizinho do n5"],
  "#a8a29e": ["T.muted", "SÓ ícone/desabilitado (n6) — como TEXTO reprova AA"],
  "#78716c": ["T.second", "APOSENTADO: cai para 4,4:1 nos fundos acinzentados"],
  "#746e69": ["T.second", "texto secundário (n7)"],
  "#57534e": ["T.apoio", "texto de apoio (n8)"],
  "#44403c": ["T.strong", "texto forte (n9)"],
  "#292524": ["T.strong", "vizinho do n9"],
  "#1c1917": ["T.text", "texto principal (n10)"],
  "#1a1c1c": ["T.text", "era o T.text antigo — hoje n10 é #1c1917"],
  "#0c0a09": ["T.text", "vizinho do n10"],

  // ── laranja da marca ───────────────────────────────────────────────────
  "#f97316": ["T.accent", "SÓ decoração — como texto ou sob texto branco dá 2,8:1"],
  "#ea580c": ["T.accentText", "3,6:1 como texto; use o accentText (4,9:1)"],
  "#c2410c": ["T.accentText", "laranja legível"],
  "#9a3412": ["T.accentText", "vizinho do accentText"],
  "#fff7ed": ["TOM.laranja.bg", ""],
  "#fed7aa": ["TOM.laranja.border", ""],
  "#fdba74": ["TOM.laranja.border", "vizinho"],
  "#fb923c": ["TOM.laranja.dot", ""],

  // ── semânticos ─────────────────────────────────────────────────────────
  "#f0fdf4": ["TOM.sucesso.bg", ""],
  "#dcfce7": ["TOM.sucesso.bg", "vizinho"],
  "#bbf7d0": ["TOM.sucesso.border", ""],
  "#86efac": ["TOM.sucesso.border", "vizinho"],
  "#15803d": ["TOM.sucesso.text", ""],
  "#166534": ["TOM.sucesso.text", "vizinho"],
  "#16a34a": ["TOM.sucesso.text", "4,3:1 como texto — o token é mais escuro"],
  "#22c55e": ["TOM.sucesso.dot", "SÓ bolinha/barra"],
  "#ecfdf5": ["TOM.esmeralda.bg", ""],
  "#a7f3d0": ["TOM.esmeralda.border", ""],
  "#047857": ["TOM.esmeralda.text", ""],

  "#fffbeb": ["TOM.alerta.bg", ""],
  "#fef3c7": ["TOM.alerta.bg", "vizinho"],
  "#fffbf5": ["TOM.alerta.bg", "vizinho"],
  "#fde68a": ["TOM.alerta.border", ""],
  "#fcd34d": ["TOM.alerta.border", "vizinho"],
  "#b45309": ["TOM.alerta.text", ""],
  "#92400e": ["TOM.alerta.text", "amber 800 — um degrau abaixo do alerta do app"],
  "#78350f": ["TOM.alerta.text", "amber 900 — idem"],
  "#d97706": ["TOM.alerta.text", "3,8:1 como texto — o token é mais escuro"],
  "#f59e0b": ["TOM.alerta.dot", "SÓ bolinha/barra"],

  "#fef2f2": ["TOM.perigo.bg", ""],
  "#fee2e2": ["TOM.perigo.bg", "vizinho"],
  "#fff5f5": ["TOM.perigo.bg", "vizinho"],
  "#fecaca": ["TOM.perigo.border", ""],
  "#fca5a5": ["TOM.perigo.border", "CUIDADO: onde convive com #fecaca, são dois degraus de propósito — o forte é TOM.perigo.dot"],
  "#f87171": ["TOM.perigo.border", "vizinho"],
  "#b91c1c": ["TOM.perigo.text", ""],
  "#991b1b": ["TOM.perigo.text", "vizinho"],
  "#7f1d1d": ["TOM.perigo.text", "red 900 — um degrau abaixo do vermelho do app"],
  "#dc2626": ["TOM.perigo.text", "4,0:1 como texto: REPROVA AA — o token é #b91c1c"],
  "#ef4444": ["TOM.perigo.dot", "SÓ bolinha/barra — 3,4:1 como texto"],

  "#eff6ff": ["TOM.info.bg", ""],
  "#bfdbfe": ["TOM.info.border", ""],
  "#dbeafe": ["TOM.info.border", "vizinho"],
  "#1d4ed8": ["TOM.info.text", ""],
  "#2563eb": ["TOM.info.text", "vizinho"],
  "#3b82f6": ["TOM.info.dot", "SÓ bolinha/barra"],
  "#f0f9ff": ["TOM.ceu.bg", ""],
  "#e0f2fe": ["TOM.ceu.border", "vizinho"],
  "#bae6fd": ["TOM.ceu.border", ""],
  "#0369a1": ["TOM.ceu.text", ""],

  "#faf5ff": ["TOM.roxo.bg", ""],
  "#e9d5ff": ["TOM.roxo.border", ""],
  "#7e22ce": ["TOM.roxo.text", ""],
  "#a855f7": ["TOM.roxo.dot", "SÓ bolinha/barra"],
  "#f3e8ff": ["TOM.roxo.bg", "vizinho"],
  "#9333ea": ["TOM.roxo.text", "vizinho"],

  "#f0fdfa": ["TOM.turquesa.bg", ""],
  "#99f6e4": ["TOM.turquesa.border", ""],
  "#0f766e": ["TOM.turquesa.text", ""],
  "#ecfeff": ["TOM.ciano.bg", ""],
  "#a5f3fc": ["TOM.ciano.border", ""],
  "#0e7490": ["TOM.ciano.text", ""],
  "#cffafe": ["TOM.ciano.bg", "vizinho"],
  "#06b6d4": ["TOM.ciano.dot", "SÓ bolinha/barra"],
  "#0891b2": ["TOM.ciano.text", "vizinho"],
};

/** Cores que NÃO são nossas — marca de terceiro. Ficam como estão. */
const DE_TERCEIROS = new Map([
  ["#f25022", "logo da Microsoft"],
  ["#7fba00", "logo da Microsoft"],
  ["#00a4ef", "logo da Microsoft"],
  ["#ffb900", "logo da Microsoft"],
]);

/**
 * Marca cada linha como comentário ou não, varrendo o arquivo de cima a baixo.
 *
 * Não dá para decidir isso olhando a linha sozinha: este código-base escreve
 * blocos `/** ... *​/` de dez linhas cujas linhas do meio começam com o texto,
 * sem `*`. São justamente as que registram os contrastes medidos — e elas
 * mencionam mais hexes do que o código ao redor usa.
 */
function mapaDeComentarios(linhas) {
  let dentroDeBloco = false;
  return linhas.map((linha) => {
    const comecouDentro = dentroDeBloco;
    const abre = linha.lastIndexOf("/*");
    const fecha = linha.lastIndexOf("*/");
    if (!dentroDeBloco && abre > fecha) dentroDeBloco = true;
    else if (dentroDeBloco && fecha > abre) dentroDeBloco = false;
    if (comecouDentro || dentroDeBloco) return true;
    return /^\s*\/\//.test(linha);
  });
}

/** Linhas que não valem como uso de cor: comentário e classe do Tailwind. */
function porQueIgnorar(linha, ehComentario) {
  if (ehComentario) return "comentário";
  if (/\b(?:class|className)\s*=/.test(linha) && /-\[#[0-9a-fA-F]{3,8}\]/.test(linha)) {
    return "classe do Tailwind (valor arbitrário é lido em tempo de build)";
  }
  return null;
}

function arquivos(dir, achados = []) {
  // Aceita um arquivo só: é o caminho que quem vai migrar UMA tela usa.
  if (!statSync(dir).isDirectory()) return [dir];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome.startsWith(".")) continue;
    const completo = path.join(dir, nome);
    if (statSync(completo).isDirectory()) arquivos(completo, achados);
    else if (/\.(tsx?|css)$/.test(nome)) achados.push(completo);
  }
  return achados;
}

const args = process.argv.slice(2);
const soResumo = args.includes("--resumo");
const soOrfaos = args.includes("--sem-token");
const alvo = path.resolve(RAIZ, args.find((a) => !a.startsWith("--")) ?? "client/src");

const porArquivo = [];
const totalPorHex = new Map();

for (const arquivo of arquivos(alvo).sort()) {
  const linhas = readFileSync(arquivo, "utf8").split("\n");
  const comentario = mapaDeComentarios(linhas);
  const achados = [];

  linhas.forEach((linha, i) => {
    const ignorar = porQueIgnorar(linha, comentario[i]);
    for (const bruto of linha.match(/#[0-9a-fA-F]{6}\b/g) ?? []) {
      const hex = bruto.toLowerCase();
      const terceiro = DE_TERCEIROS.get(hex);
      const [token, porque] = TOKENS[hex] ?? [];
      if (soOrfaos && (token || terceiro)) continue;
      totalPorHex.set(hex, (totalPorHex.get(hex) ?? 0) + 1);
      achados.push({
        linha: i + 1,
        hex,
        token: terceiro ? "— (fica)" : token ?? "— (sem token)",
        nota: terceiro ?? porque ?? "",
        ignorar,
      });
    }
  });

  if (achados.length) porArquivo.push({ arquivo: path.relative(RAIZ, arquivo).replace(/\\/g, "/"), achados });
}

porArquivo.sort((a, b) => b.achados.length - a.achados.length);

console.log(`\nMAPA DE CORES — ${porArquivo.length} arquivo(s) com hex cravado, ${[...totalPorHex.values()].reduce((s, n) => s + n, 0)} ocorrência(s).`);
console.log("Este script só LÊ. A troca é decisão de quem aplica — veja o cabeçalho.\n");

for (const { arquivo, achados } of porArquivo) {
  const trocaveis = achados.filter((a) => !a.ignorar && a.token.startsWith("T") ).length;
  console.log(`${arquivo}  —  ${achados.length} hex (${trocaveis} com token direto)`);
  if (soResumo) continue;
  for (const a of achados) {
    const marca = a.ignorar ? `  [ignorar: ${a.ignorar}]` : "";
    console.log(`   ${String(a.linha).padStart(5)}  ${a.hex}  →  ${a.token.padEnd(22)}${a.nota ? "  " + a.nota : ""}${marca}`);
  }
  console.log("");
}

if (!soResumo) {
  const orfaos = [...totalPorHex.entries()].filter(([h]) => !TOKENS[h] && !DE_TERCEIROS.has(h)).sort((a, b) => b[1] - a[1]);
  if (orfaos.length) {
    console.log("SEM TOKEN — ou é marca de terceiro, ou é um tom que ninguém decidiu adotar:");
    for (const [hex, n] of orfaos) console.log(`   ${hex}  ${n}×`);
    console.log("");
  }
}
