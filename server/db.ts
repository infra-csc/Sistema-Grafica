// Referenced from javascript_database blueprint
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Limites explícitos (auditoria 27/08): sem `max`, os Promise.all de lote
// abriam conexões até o teto do Neon e derrubavam as OUTRAS requisições; sem
// `connectionTimeoutMillis`, requisição esperava conexão para sempre em vez
// de falhar rápido com erro legível.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});
export const db = drizzle({ client: pool, schema });
