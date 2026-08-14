import { defineConfig } from "vitest/config";
import path from "path";

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
    // Padrão continua node. Testes que precisam de DOM pedem jsdom por arquivo,
    // com o docblock `// @vitest-environment jsdom`.
    environment: "node",
    include: ["server/__tests__/**/*.test.ts"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["server/**/*.ts"],
      exclude: ["server/__tests__/**", "server/vite.ts"],
      reporter: ["text", "html"],
    },
  },
});
