import { defineConfig } from "vitest/config";
import { readdirSync, readFileSync } from "fs";
import path from "path";

// TESTES DE TELA (jsdom) EM GRUPO PRÓPRIO. Montar React no jsdom é pesado; na
// suíte inteira eles disputavam CPU com os ~200 testes de servidor e
// estouravam o tempo (falha falsa, que passava rodando o arquivo sozinho).
// Agora rodam DEPOIS dos de servidor (sequence.groupOrder) e com poucos
// workers — sem concorrência, cada um termina no próprio tempo.
// Quem é de tela: o arquivo que pede `// @vitest-environment jsdom`.
const PASTA_DOS_TESTES = path.resolve(__dirname, "server/__tests__");
const TESTES_DE_TELA = readdirSync(PASTA_DOS_TESTES)
  .filter((f) => f.endsWith(".test.ts"))
  .filter((f) => /@vitest-environment\s+jsdom/.test(readFileSync(path.join(PASTA_DOS_TESTES, f), "utf8").slice(0, 3000)))
  .map((f) => `server/__tests__/${f}`);
const WORKERS_DE_TELA = 4;

export default defineConfig({
  // O tsconfig do app usa `jsx: "preserve"` (é o Vite quem transforma no
  // build). Sem dizer isto aqui, qualquer teste que importe um .tsx do client
  // morre em "content contains invalid JS syntax". Não afeta os testes de
  // server, que não têm JSX.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/__tests__/**", "server/vite.ts"],
      reporter: ["text", "html"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "servidor",
          // Padrão node. Teste que precisa de DOM pede jsdom no docblock e cai
          // no projeto de baixo.
          environment: "node",
          include: ["server/__tests__/**/*.test.ts"],
          exclude: ["**/node_modules/**", ...TESTES_DE_TELA],
          sequence: { groupOrder: 0 },
          // 5s (padrão) estourava em rota que importa o servidor inteiro e em
          // varredura de fonte, com a máquina ocupada ou no CI — falha de
          // relógio, não de código. Teste lento de verdade continua acusando.
          testTimeout: 20_000,
        },
      },
      {
        extends: true,
        test: {
          name: "telas",
          // "node" de propósito: o docblock de cada arquivo liga o jsdom (como
          // antes). Com "jsdom" aqui o Vitest troca o modo de transformação
          // para o de navegador — 4× mais lento e com telas quebrando.
          environment: "node",
          include: TESTES_DE_TELA,
          maxWorkers: WORKERS_DE_TELA,
          sequence: { groupOrder: 1 },
          // DUAS REPETIÇÕES, SÓ AQUI (22/09). O teto de workers acima reduziu
          // a falha falsa por disputa de CPU, mas não a eliminou: na suíte
          // inteira, `etiqueta-lista` quebra num caso diferente a cada rodada
          // (ora o clique não acha o elemento, ora o <select> ainda é null) e
          // passa 74/74 quando roda sozinho. É o relógio, não a regra.
          //
          // O risco conhecido de `retry` é esconder defeito de verdade. Por
          // isso ele fica SÓ no projeto de tela — onde a causa é conhecida e
          // documentada — e não no de servidor, que é determinístico. Teste
          // de tela que falha nas três tentativas é defeito mesmo.
          retry: 2,
        },
      },
    ],
  },
});
