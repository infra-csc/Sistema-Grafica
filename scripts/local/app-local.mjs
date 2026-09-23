// ─────────────────────────────────────────────────────────────────────────────
// AS PEÇAS DO AMBIENTE LOCAL, para o dev-local.mjs e o e2e-local.mjs:
// banco (PGlite) + object storage de mentira + migrações + usuários de teste +
// o servidor do app apontado para eles.
//
// Nada aqui lê DATABASE_URL do ambiente: o banco é SEMPRE o local, criado
// neste processo. Não há como este caminho encostar em produção.
// ─────────────────────────────────────────────────────────────────────────────
import { spawn, spawnSync } from "child_process";
import { createRequire } from "module";
import { delimiter, resolve } from "path";
import { pathToFileURL } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import { subirBancoLocal } from "./banco-local.mjs";
import { subirGcsLocal } from "./gcs-local.mjs";
import { PASTA_DAS_FERRAMENTAS, RAIZ_DO_REPO } from "./ferramentas.mjs";

const exigir = createRequire(import.meta.url);

/** A senha dos usuários locais. Só existe neste banco de mentira. */
export const SENHA_LOCAL = process.env.SENHA_LOCAL || "senha-local-123";

/** Um usuário por perfil — os e-mails que o e2e usa (E2E_EMAIL_*). */
export const USUARIOS_LOCAIS = [
  { perfil: "admin", nome: "Ana Admin (local)", email: "admin@local.test" },
  { perfil: "solicitacao", nome: "Sofia Solicitação (local)", email: "solicitacao@local.test" },
  { perfil: "arte", nome: "Artur Arte (local)", email: "arte@local.test" },
  { perfil: "grafica", nome: "Gabriel Gráfica (local)", email: "grafica@local.test" },
  { perfil: "atendimento", nome: "Aline Atendimento (local)", email: "atendimento@local.test" },
];

/** As variáveis E2E_* que batem com os usuários acima. */
export function variaveisDoE2e(baseUrl) {
  const env = { E2E_BASE_URL: baseUrl, E2E_SENHA: SENHA_LOCAL };
  for (const u of USUARIOS_LOCAIS) env[`E2E_EMAIL_${u.perfil.toUpperCase()}`] = u.email;
  return env;
}

export const BUCKET_LOCAL = "bucket-local";

/** Roda um script node como filho SEM travar este processo (o banco mora aqui). */
export function rodarNode(argumentos, env, { silencioso = false } = {}) {
  return new Promise((ok) => {
    const filho = spawn(process.execPath, argumentos, { env: { ...process.env, ...env }, cwd: RAIZ_DO_REPO });
    let saida = "";
    filho.stdout.on("data", (d) => { saida += d; if (!silencioso) process.stdout.write(d); });
    filho.stderr.on("data", (d) => { saida += d; process.stderr.write(d); });
    filho.on("close", (status) => ok({ status, saida }));
  });
}

/** Banco + storage + migrações + usuários. Devolve o que o servidor precisa. */
export async function subirInfra({ pasta, log = console.log } = {}) {
  log(`[local] subindo o banco (PGlite${pasta ? `, dados em ${pasta}` : ", em memória"})…`);
  const inicio = Date.now();
  const banco = await subirBancoLocal({ pasta: pasta && resolve(pasta, "banco"), log });
  log(`[local] banco no ar em ${((Date.now() - inicio) / 1000).toFixed(0)} s — ${banco.url}`);
  const gcs = await subirGcsLocal({ pasta: pasta && resolve(pasta, "arquivos") });

  const migrou = await rodarNode([resolve(RAIZ_DO_REPO, "scripts/migrar.mjs"), "--aplicar", "--silencioso"], { DATABASE_URL: banco.url });
  if (migrou.status !== 0) {
    await gcs.parar(); await banco.parar();
    throw new Error("as migrações falharam no banco local (saída acima)");
  }

  const c = new pg.Client({ connectionString: banco.url });
  await c.connect();
  let novos = 0;
  try {
    const hash = await bcrypt.hash(SENHA_LOCAL, 10);
    for (const u of USUARIOS_LOCAIS) {
      const r = await c.query(
        `INSERT INTO users (name, email, password_hash, role, must_change_password)
         VALUES ($1, $2, $3, $4, false) ON CONFLICT (email) DO NOTHING`,
        [u.nome, u.email, hash, u.perfil],
      );
      novos += r.rowCount ?? 0;
    }
  } finally {
    await c.end();
  }
  if (novos) log(`[local] ${novos} usuário(s) de teste criados (senha: ${SENHA_LOCAL})`);

  return {
    banco,
    gcs,
    async parar() {
      await gcs.parar();
      await banco.parar();
    },
  };
}

/** Variáveis do servidor local: tudo o que manda mensagem ou fala com a nuvem, desligado. */
export function ambienteDoServidor(infra, porta) {
  const preload = pathToFileURL(resolve(RAIZ_DO_REPO, "scripts/local/neon-local.mjs")).href;
  return {
    NODE_ENV: "development",
    PORT: String(porta),
    DATABASE_URL: infra.banco.url,
    NEON_WS_LOCAL: infra.banco.ws,
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${preload}`.trim(),
    // Plano B de resolução: o Node só consulta NODE_PATH quando o node_modules
    // do projeto NÃO tem o pacote. Numa instalação sã, não muda nada; numa
    // instalação interrompida (pacote sem package.json), o que estiver na
    // pasta de ferramentas cobre o buraco em vez de o servidor não subir.
    NODE_PATH: [process.env.NODE_PATH, resolve(PASTA_DAS_FERRAMENTAS, "node_modules")].filter(Boolean).join(delimiter),
    SESSION_SECRET: "sessao-local-nao-e-segredo-de-ninguem-0123456789",
    SSO_SECRET: "sso-local-nao-e-segredo-de-ninguem-0123456789",
    // Object storage de mentira (scripts/local/gcs-local.mjs).
    STORAGE_EMULATOR_HOST: infra.gcs.endereco,
    // `.private` é o nome que o Replit usa, e o servidor conta com ele
    // (server/routes/thumb-url.ts reconhece o objeto por "/.private/").
    PRIVATE_OBJECT_DIR: `/${BUCKET_LOCAL}/.private`,
    PUBLIC_OBJECT_SEARCH_PATHS: `/${BUCKET_LOCAL}/public`,
    // Uma cópia só: o canal LISTEN/NOTIFY entre cópias não tem o que fazer.
    TEMPO_REAL_CANAL: "off",
    // Nenhum e-mail sai daqui.
    BOOK_EMAIL_NOTIFICATIONS_ENABLED: "false",
    BOOK_EMAIL_DRY_RUN: "true",
    BOOK_EMAIL_TO: "",
    BOOK_EMAIL_APP_URL: `http://localhost:${porta}`,
    REVISAO_DIGEST_ENABLED: "false",
    GESTAO_DIGEST_ENABLED: "false",
    // Sem SEED_PASSWORD: os usuários locais são os de USUARIOS_LOCAIS.
    SEED_PASSWORD: "",
  };
}

/**
 * Nada de Replit: com REPL_ID definida (mesmo vazia) o vite.config.ts liga os
 * plugins do editor do Replit, e REPLIT_DEPLOYMENT faria o servidor se achar
 * publicado.
 */
function semReplit(env) {
  for (const k of Object.keys(env)) if (k.startsWith("REPL")) delete env[k];
  return env;
}

/** Sobe o servidor do app (tsx server/index.ts) e espera ele responder. */
export async function subirServidor(infra, { porta = 5000, log = console.log, saida = "herdar" } = {}) {
  const tsx = exigir.resolve("tsx/cli");
  const filho = spawn(process.execPath, [tsx, "server/index.ts"], {
    cwd: RAIZ_DO_REPO,
    env: semReplit({ ...process.env, ...ambienteDoServidor(infra, porta) }),
    stdio: saida === "herdar" ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
  });
  let log2 = "";
  if (saida !== "herdar") {
    filho.stdout.on("data", (d) => { log2 += d; if (log2.length > 200_000) log2 = log2.slice(-100_000); });
    filho.stderr.on("data", (d) => { log2 += d; if (log2.length > 200_000) log2 = log2.slice(-100_000); });
  }
  let saiu = null;
  filho.on("exit", (codigo) => { saiu = codigo ?? -1; });

  const base = `http://127.0.0.1:${porta}`;
  const limite = Date.now() + 300_000; // tsx transpila o servidor inteiro na 1ª vez: minutos numa máquina ocupada
  for (;;) {
    if (saiu !== null) throw new Error(`o servidor saiu com código ${saiu} antes de responder\n${log2.slice(-4000)}`);
    try {
      const r = await fetch(`${base}/api/auth/me`);
      if (r.status > 0) break;
    } catch { /* ainda subindo */ }
    if (Date.now() > limite) { matarArvore(filho.pid); throw new Error(`o servidor não respondeu em 300 s\n${log2.slice(-4000)}`); }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  log(`[local] app no ar em http://localhost:${porta}`);
  return {
    base,
    processo: filho,
    ultimasLinhas: () => log2.slice(-8000),
    parar: () => pararProcesso(filho),
  };
}

/** O tsx sobe um node filho: no Windows, matar só o pai deixaria o servidor órfão. */
export function matarArvore(pid) {
  if (!pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-pid, "SIGTERM"); } catch { try { process.kill(pid, "SIGTERM"); } catch { /* já saiu */ } } }
}

async function pararProcesso(filho) {
  if (filho.exitCode !== null) return;
  const saiu = new Promise((ok) => filho.once("exit", ok));
  matarArvore(filho.pid);
  await Promise.race([saiu, new Promise((ok) => setTimeout(ok, 5000))]);
}
