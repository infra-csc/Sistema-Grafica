// Leitura das remessas do Kit (14/09), separada de routes/kit.ts: peças e
// importação precisam só ler a remessa, e importar o arquivo de rotas traria
// junto os guardas de papel (que alguns testes substituem por mocks).
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { kitRemessas } from "@shared/schema";

export async function carregarRemessa(id: string) {
  const [remessa] = await db.select().from(kitRemessas).where(eq(kitRemessas.id, id));
  return remessa ?? null;
}

export async function remessasPorIds(ids: string[]) {
  const unicos = ids.filter((v, i) => !!v && ids.indexOf(v) === i);
  if (unicos.length === 0) return new Map<string, typeof kitRemessas.$inferSelect>();
  const lista = await db.select().from(kitRemessas).where(inArray(kitRemessas.id, unicos));
  return new Map(lista.map((r) => [r.id, r]));
}
