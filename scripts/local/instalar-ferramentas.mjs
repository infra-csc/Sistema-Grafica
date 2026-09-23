// ─────────────────────────────────────────────────────────────────────────────
// `npm run ferramentas:instalar` — instala, FORA do repositório, o que só o
// ambiente local e os testes de ponta a ponta usam (ver ferramentas.mjs):
//
//   · @electric-sql/pglite — o Postgres em WebAssembly do dev:local e do CI
//     das migrações;
//   · @playwright/test + Chromium — os testes de ponta a ponta (e2e/).
//
// Pasta: NORTE_FERRAMENTAS ou ../_ferramentas. Opções:
//   --sem-navegador   não baixa o Chromium (o CI das migrações só quer o PGlite)
//   --com-deps        baixa também as bibliotecas do sistema (Linux/CI)
// ─────────────────────────────────────────────────────────────────────────────
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { PASTA_DAS_FERRAMENTAS } from "./ferramentas.mjs";

// Versões fixas: a mesma ferramenta no CI e em qualquer máquina.
const PACOTES = ["@electric-sql/pglite@0.5.8", "@playwright/test@1.63.0"];

const args = new Set(process.argv.slice(2));
mkdirSync(PASTA_DAS_FERRAMENTAS, { recursive: true });
const pacote = resolve(PASTA_DAS_FERRAMENTAS, "package.json");
if (!existsSync(pacote)) {
  writeFileSync(pacote, JSON.stringify({
    name: "ferramentas-locais-norte",
    private: true,
    description: "Ferramentas do ambiente local do Sistema-Grafica (PGlite, Playwright) — fora do repositório de propósito.",
  }, null, 2));
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
console.log(`Instalando em ${PASTA_DAS_FERRAMENTAS}: ${PACOTES.join(", ")}`);
let r = spawnSync(npm, ["install", "--no-audit", "--no-fund", "--prefix", PASTA_DAS_FERRAMENTAS, ...PACOTES], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (r.status !== 0) process.exit(r.status ?? 1);

if (!args.has("--sem-navegador")) {
  const cli = resolve(PASTA_DAS_FERRAMENTAS, "node_modules/@playwright/test/cli.js");
  console.log("Baixando o Chromium do Playwright (só na primeira vez)…");
  r = spawnSync(process.execPath, [cli, "install", ...(args.has("--com-deps") ? ["--with-deps"] : []), "chromium"], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
console.log("Ferramentas locais prontas.");
