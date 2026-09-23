// ─────────────────────────────────────────────────────────────────────────────
// AS FERRAMENTAS LOCAIS — PGlite (Postgres em WebAssembly), o servidor de
// protocolo dele e o Playwright — moram FORA do repositório, de propósito:
//
//   · o app publicado não precisa de nenhuma delas (o Playwright ainda baixa
//     ~300 MB de navegador);
//   · instalar o PGlite dentro do projeto duplica o drizzle-orm (ele é peer
//     opcional) e quebra a verificação de tipos — aconteceu no NORTE-App-Hub.
//
// Onde ficam: a pasta de NORTE_FERRAMENTAS ou, sem ela, `../_ferramentas`
// (irmã do repositório). Para instalar:
//
//   npm run ferramentas:instalar
//
// que é o mesmo que
//
//   npm install --prefix ../_ferramentas @electric-sql/pglite @electric-sql/pglite-socket @playwright/test
//   node ../_ferramentas/node_modules/@playwright/test/cli.js install chromium
// ─────────────────────────────────────────────────────────────────────────────
import { existsSync } from "fs";
import { createRequire } from "module";
import { dirname, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

export const RAIZ_DO_REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const PASTA_DAS_FERRAMENTAS = resolve(
  process.env.NORTE_FERRAMENTAS || resolve(RAIZ_DO_REPO, "..", "_ferramentas"),
);

const exigir = createRequire(resolve(PASTA_DAS_FERRAMENTAS, "package.json"));

/** Caminho do arquivo principal de um pacote instalado na pasta de ferramentas. */
export function caminhoDaFerramenta(pacote) {
  try {
    return exigir.resolve(pacote);
  } catch {
    const dica = existsSync(PASTA_DAS_FERRAMENTAS)
      ? `a pasta ${PASTA_DAS_FERRAMENTAS} existe mas não tem ${pacote}.`
      : `a pasta ${PASTA_DAS_FERRAMENTAS} não existe.`;
    throw new Error(
      `Ferramenta local ausente: ${pacote} — ${dica}\n` +
      `Rode:  npm run ferramentas:instalar   (ou defina NORTE_FERRAMENTAS com outra pasta)`,
    );
  }
}

/** `import()` de um pacote da pasta de ferramentas (a versão ESM dele). */
export async function importarFerramenta(pacote) {
  const cjs = caminhoDaFerramenta(pacote);
  // O resolve do require aponta para a entrada CommonJS; a ESM fica ao lado.
  const esm = cjs.replace(/\.cjs$/, ".js");
  return import(pathToFileURL(existsSync(esm) ? esm : cjs).href);
}
