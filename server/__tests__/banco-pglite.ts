// ─────────────────────────────────────────────────────────────────────────────
// UM POSTGRES DE VERDADE PARA OS TESTES DE INTEGRAÇÃO — o PGlite (Postgres 17
// em WebAssembly) servido pelo mesmo servidor de protocolo do `npm run
// dev:local` (scripts/local/banco-local.mjs), com as migrações de migrations/
// aplicadas do zero.
//
// Por que pelo servidor de protocolo e não o PGlite direto no drizzle: o app
// fala com o banco pelo driver do Neon (server/db.ts, Pool sobre WebSocket).
// Apontando esse driver para o WebSocket local, o teste roda o server/db.ts
// REAL — o mesmo Pool, as mesmas transações, o mesmo SQL que produção.
//
// O PGlite mora FORA do repositório (pasta de ferramentas, ver
// scripts/local/ferramentas.mjs). Sem ele instalado, os testes que usam este
// apoio PULAM com um aviso — o CI instala (`npm run ferramentas:instalar`).
//
// Limite a lembrar (o cabeçalho do banco-local.mjs explica): é UMA sessão de
// Postgres. Duas conexões com transação aberta não rodam juntas — a segunda
// espera o COMMIT da primeira. Para concorrência isso é uma SERIALIZAÇÃO
// simulada: prova que o resultado final não perde escrita, não que o FOR
// UPDATE disputa a linha. A "carona" do banco local (a outra conexão rodar
// DENTRO da transação parada) fica DESLIGADA aqui: com ela, o COMMIT da
// segunda requisição fecharia a transação da primeira no meio. Consequência:
// uma rota que, com transação aberta, consultasse o banco por OUTRA conexão
// travaria o teste (estoura o tempo) — o que em produção seria uma segunda
// sessão esperando a primeira.
//
// Não é um arquivo de teste (não termina em .test.ts): é só o apoio.
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from "module";
import { existsSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { readMigrationFiles } from "drizzle-orm/migrator";

const RAIZ = path.resolve(__dirname, "../..");
const PASTA_DAS_FERRAMENTAS = path.resolve(process.env.NORTE_FERRAMENTAS || path.resolve(RAIZ, "..", "_ferramentas"));

/** O PGlite está instalado na pasta de ferramentas? (síncrono: serve ao `describe.skipIf`). */
function pgliteInstalado(): boolean {
  try {
    createRequire(path.join(PASTA_DAS_FERRAMENTAS, "package.json")).resolve("@electric-sql/pglite");
    return true;
  } catch {
    return false;
  }
}

export const PGLITE_DISPONIVEL = pgliteInstalado();
if (!PGLITE_DISPONIVEL) {
  console.warn(
    `[integração] PGlite ausente em ${PASTA_DAS_FERRAMENTAS} — os testes com banco de verdade vão PULAR. ` +
    "Rode `npm run ferramentas:instalar` (ou defina NORTE_FERRAMENTAS).",
  );
}

/** O que scripts/local/banco-local.mjs devolve (ele é .mjs, sem tipos). */
interface BancoLocal {
  db: { exec(sql: string): Promise<unknown>; query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };
  url: string;
  ws: string;
  parar(): Promise<void>;
}

export interface BancoDeTeste {
  /** URL TCP (para `pg`, se precisar de uma conexão fora do app). */
  url: string;
  /** Consulta direta no PGlite — para montar cenário e conferir o que ficou gravado. */
  consultar<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  parar(): Promise<void>;
}

/**
 * Sobe o banco, aplica TODAS as migrações e aponta o driver do Neon para ele.
 * Chame ANTES de importar qualquer módulo que importe server/db.ts (ele lê
 * DATABASE_URL ao carregar): nos testes, os módulos do app entram por
 * `await import(...)` depois disto.
 */
export async function subirBancoDeTeste(): Promise<BancoDeTeste> {
  const modulo = pathToFileURL(path.join(RAIZ, "scripts/local/banco-local.mjs")).href;
  const { subirBancoLocal } = (await import(/* @vite-ignore */ modulo)) as { subirBancoLocal: (o: { log?: () => void; caronaMs?: number }) => Promise<BancoLocal> };
  const banco = await subirBancoLocal({ log: () => {}, caronaMs: Infinity });

  // As migrações, na ordem do journal, como o scripts/migrar.mjs aplica.
  const pasta = path.join(RAIZ, "migrations");
  if (!existsSync(path.join(pasta, "meta", "_journal.json"))) throw new Error("migrations/meta/_journal.json não encontrado");
  for (const m of readMigrationFiles({ migrationsFolder: pasta })) {
    for (const instrucao of m.sql) if (instrucao.trim()) await banco.db.exec(instrucao);
  }

  // O mesmo desvio do preload scripts/local/neon-local.mjs: o driver do Neon
  // passa a abrir o WebSocket do banco local, sem TLS.
  const { neonConfig } = await import("@neondatabase/serverless");
  neonConfig.wsProxy = () => `${banco.ws}/v2`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineTLS = false;
  neonConfig.pipelineConnect = false;
  process.env.DATABASE_URL = banco.url;

  return {
    url: banco.url,
    consultar: async <T,>(sql: string, params?: unknown[]) => (await banco.db.query<T>(sql, params)).rows,
    parar: () => banco.parar(),
  };
}
