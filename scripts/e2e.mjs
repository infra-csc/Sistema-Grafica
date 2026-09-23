// ─────────────────────────────────────────────────────────────────────────────
// `npm run e2e` — os testes de ponta a ponta (e2e/), com o Playwright da pasta
// de ferramentas (ele não está nas dependências do projeto; ver
// scripts/local/ferramentas.mjs).
//
// DOIS MODOS:
//
//   · SEM E2E_BASE_URL (o normal): sobe TUDO na máquina — banco em memória,
//     storage de mentira, migrações, um usuário por perfil e o servidor — roda
//     a suíte e derruba tudo no fim. Nada encosta em banco de verdade.
//     Cada largura (projeto do playwright.config.ts) roda com o servidor
//     reiniciado: os limitadores de login e de escrita são por processo, e as
//     três larguras seguidas estourariam a cota de um admin só.
//
//   · COM E2E_BASE_URL (Replit de dev, por exemplo): só roda a suíte contra
//     aquele endereço, com as variáveis E2E_* do ambiente (e2e/README.md).
//
// Os argumentos passam direto para o Playwright:
//   npm run e2e -- --project=celular-390
//   npm run e2e -- e2e/05-grafica-imprime-confere-embala-entrega.spec.ts
//   npm run e2e -- --headed
// ─────────────────────────────────────────────────────────────────────────────
import { spawn } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { PASTA_DAS_FERRAMENTAS, RAIZ_DO_REPO } from "./local/ferramentas.mjs";

const PROJETOS = ["celular-390", "tablet-820", "desktop-1280"];
const PORTA = Number(process.env.E2E_PORTA ?? 5199);

// ── Onde está o Playwright ────────────────────────────────────────────────
function playwright() {
  const daPasta = resolve(PASTA_DAS_FERRAMENTAS, "node_modules/@playwright/test");
  if (existsSync(resolve(daPasta, "cli.js"))) {
    // Os specs importam "@playwright/test", que não mora no node_modules do
    // projeto: um tsconfig só para o Playwright aponta o nome para a pasta de
    // ferramentas (`--tsconfig` vale para todo arquivo que ele carrega).
    const tsconfig = join(tmpdir(), "norte-e2e-tsconfig.json");
    writeFileSync(tsconfig, JSON.stringify({
      compilerOptions: { baseUrl: PASTA_DAS_FERRAMENTAS, paths: { "@playwright/test": ["./node_modules/@playwright/test/index.mjs"] } },
    }));
    return { cli: resolve(daPasta, "cli.js"), extra: ["--tsconfig", tsconfig] };
  }
  try {
    // Plano B: quem instalou o Playwright no próprio projeto (npm i -D).
    const doProjeto = createRequire(resolve(RAIZ_DO_REPO, "package.json")).resolve("@playwright/test/cli");
    return { cli: doProjeto, extra: [] };
  } catch {
    console.error("Playwright não encontrado. Rode:  npm run ferramentas:instalar");
    process.exit(1);
  }
}

function rodarPlaywright(args, env) {
  const { cli, extra } = playwright();
  return new Promise((ok) => {
    const filho = spawn(process.execPath, [cli, "test", ...extra, ...args], {
      cwd: RAIZ_DO_REPO,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    filho.on("close", (codigo) => ok(codigo ?? 1));
  });
}

// ── Os argumentos: separa os projetos do resto ────────────────────────────
const brutos = process.argv.slice(2);
const pedidos = [];
const resto = [];
for (let i = 0; i < brutos.length; i++) {
  const a = brutos[i];
  if (a.startsWith("--project=")) pedidos.push(a.slice("--project=".length));
  else if (a === "--project") pedidos.push(brutos[++i]);
  else resto.push(a);
}

if (process.env.E2E_BASE_URL) {
  console.log(`[e2e] alvo externo: ${process.env.E2E_BASE_URL}`);
  process.exit(await rodarPlaywright(brutos, {}));
}

// ── Modo local ────────────────────────────────────────────────────────────
const { subirInfra, subirServidor, variaveisDoE2e } = await import("./local/app-local.mjs");
const projetos = pedidos.length ? pedidos : PROJETOS;
const interativo = resto.includes("--ui");

let infra;
let servidor;
const resultados = [];
async function derrubar() {
  try { await servidor?.parar(); } catch { /* já parou */ }
  try { await infra?.parar(); } catch { /* já parou */ }
}
process.on("SIGINT", () => { void derrubar().then(() => process.exit(130)); });

// O servidor de desenvolvimento, no Windows, já caiu UMA vez logo depois do
// listen, com código nativo (0xC0000409) e sem erro no log — não reproduziu.
// Uma segunda tentativa custa segundos; uma rodada perdida, minutos.
async function subirComUmaSegundaChance() {
  try {
    return await subirServidor(infra, { porta: PORTA, saida: "pipe" });
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message.split(/\r?\n/)[0] : String(erro);
    console.warn(`[e2e] o servidor não subiu (${motivo}) — tentando de novo`);
    return subirServidor(infra, { porta: PORTA, saida: "pipe" });
  }
}

try {
  infra = await subirInfra();
  const rodadas = interativo ? [projetos] : projetos.map((p) => [p]);
  for (const grupo of rodadas) {
    servidor = await subirComUmaSegundaChance();
    const env = variaveisDoE2e(`http://127.0.0.1:${PORTA}`);
    const saida = grupo.length === 1 ? ["--output", `test-results/${grupo[0]}`] : [];
    const codigo = await rodarPlaywright([...grupo.map((p) => `--project=${p}`), ...saida, ...resto], env);
    resultados.push({ projetos: grupo.join(", "), codigo });
    if (codigo !== 0) {
      console.error("\n[e2e] últimas linhas do servidor:\n" + servidor.ultimasLinhas().split("\n").slice(-40).join("\n"));
    }
    await servidor.parar();
    servidor = undefined;
  }
} catch (erro) {
  console.error(`[e2e] ${erro instanceof Error ? erro.message : erro}`);
  resultados.push({ projetos: "(ambiente local)", codigo: 1 });
} finally {
  await derrubar();
}

console.log("\n[e2e] resumo:");
for (const r of resultados) console.log(`  ${r.codigo === 0 ? "ok    " : "FALHOU"}  ${r.projetos}`);
process.exit(resultados.every((r) => r.codigo === 0) ? 0 : 1);
