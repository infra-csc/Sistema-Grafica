import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "client/src"),
    },
  },
  test: {
    // Server-side tests only — no browser/DOM needed.
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
