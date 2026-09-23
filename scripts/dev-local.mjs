// ─────────────────────────────────────────────────────────────────────────────
// O APP INTEIRO NA SUA MÁQUINA, COM BANCO DE TESTE — `npm run dev:local`.
//
//   1. sobe um Postgres local (PGlite, em memória) e um object storage de
//      mentira (scripts/local/);
//   2. aplica as migrações de migrations/ (as mesmas que produção recebe);
//   3. cria um usuário por perfil (senha abaixo) e semeia dados de EXEMPLO
//      pela própria API: eventos, patrocinadores, peças em todas as etapas;
//   4. sobe o servidor (Vite + Express) em http://localhost:5000.
//
// Ctrl+C derruba tudo (servidor, banco e storage).
//
// NADA AQUI ENCOSTA EM PRODUÇÃO: o DATABASE_URL do seu ambiente é ignorado —
// o servidor recebe a URL do banco que este script acabou de criar. E-mail,
// avisos agendados e o canal entre cópias ficam desligados.
//
// Opções:
//   --porta=5000        porta do app (ou PORT)
//   --persistir         guarda banco e arquivos em <ferramentas>/dados-locais
//                       (sem ela, tudo some ao parar); semeia só na 1ª vez
//   --limpar            com --persistir: apaga os dados guardados antes
//   --sem-exemplos      só os usuários, sem eventos/peças de exemplo
//
// Precisa das ferramentas locais (uma vez): npm run ferramentas:instalar
// ─────────────────────────────────────────────────────────────────────────────
import { rmSync } from "fs";
import { resolve } from "path";
import { PASTA_DAS_FERRAMENTAS } from "./local/ferramentas.mjs";
import { subirInfra, subirServidor, USUARIOS_LOCAIS, SENHA_LOCAL } from "./local/app-local.mjs";
import { semear } from "./local/semear.mjs";

const args = process.argv.slice(2);
const opcao = (nome) => args.includes(`--${nome}`);
const valor = (nome) => args.find((a) => a.startsWith(`--${nome}=`))?.split("=")[1];
const conhecidas = ["porta", "persistir", "limpar", "sem-exemplos"];
for (const a of args) {
  if (!conhecidas.includes(a.replace(/^--/, "").split("=")[0])) {
    console.error(`Opção desconhecida: ${a}. Veja o cabeçalho de scripts/dev-local.mjs.`);
    process.exit(2);
  }
}

const porta = Number(valor("porta") ?? process.env.PORT ?? 5000);
const pasta = opcao("persistir") ? resolve(PASTA_DAS_FERRAMENTAS, "dados-locais") : undefined;
if (pasta && opcao("limpar")) rmSync(pasta, { recursive: true, force: true });

let infra;
let servidor;
let parando = false;
async function parar(codigo = 0) {
  if (parando) return;
  parando = true;
  console.log("\n[local] parando servidor, banco e storage…");
  try { await servidor?.parar(); } catch { /* já parou */ }
  try { await infra?.parar(); } catch { /* já parou */ }
  process.exit(codigo);
}
process.on("SIGINT", () => void parar(0));
process.on("SIGTERM", () => void parar(0));

try {
  infra = await subirInfra({ pasta });
  servidor = await subirServidor(infra, { porta });
  servidor.processo.on("exit", (codigo) => {
    if (!parando) { console.error(`[local] o servidor caiu (código ${codigo}).`); void parar(1); }
  });

  if (!opcao("sem-exemplos")) {
    const r = await semear(servidor.base);
    console.log(r.jaTinha ? "[local] o banco já tinha dados — nada semeado." : `[local] exemplos semeados: ${r.resumo}`);
  }

  console.log(`
──────────────────────────────────────────────────────────────────────
  App local:   http://localhost:${porta}
  Banco:       ${infra.banco.url}   (psql/DBeaver: usuário postgres, sem senha)
  Senha de todos os usuários: ${SENHA_LOCAL}
${USUARIOS_LOCAIS.map((u) => `    ${u.perfil.padEnd(12)} ${u.email}`).join("\n")}
  Na tela de login, "Entrar com e-mail e senha" (o SSO do portal não existe aqui).
  Ctrl+C para parar.
──────────────────────────────────────────────────────────────────────`);
} catch (erro) {
  console.error(`\n[local] não subiu: ${erro instanceof Error ? erro.message : erro}`);
  await parar(1);
}
