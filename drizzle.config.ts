import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` (npm run db:generate) NÃO abre conexão: compara
// shared/schema.ts com o último retrato em migrations/meta. Os outros
// comandos (push, studio, introspect) precisam do banco.
const soGera = process.argv.includes("generate") || process.argv.includes("check");
if (!process.env.DATABASE_URL && !soGera) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  // Migrações versionadas: geradas por `npm run db:generate`, aplicadas por
  // `npm run db:migrate` (scripts/migrar.mjs). Ver README, seção "Banco".
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://gerar-migracao-nao-conecta/",
  },
});
