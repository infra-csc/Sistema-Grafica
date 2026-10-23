// A INCLUSÃO DO KIT do evento (dono, 23/10: "seria tudo a mesma inclusão").
//
// Uma linha de `kit_remessas` por evento (UQ_kit_remessas_event, migração
// 0009). Ela não tem data nem versão que importe: é a marca de que o evento tem
// Kit e o ponto a que as peças do Kit apontam (`items.kit_remessa_id`). Toda
// planilha do Kit — e toda peça do Kit criada à mão — ACRESCENTA peças a ela;
// a primeira cria a linha. Os prazos do Kit são os do evento (shared/kit.ts).
//
// Separado de routes/kit.ts: a criação de peça e a importação precisam só
// disto, e importar o arquivo de rotas traria junto os guardas de papel (que
// alguns testes substituem por mocks).
import { asc, eq, inArray } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import { kitRemessas } from "@shared/schema";

export type InclusaoDoKitLinha = typeof kitRemessas.$inferSelect;

/** O executor: o `db` ou a transação em curso (`db.transaction(async (tx) => …)`). */
type Executor = Pick<typeof db, "select" | "insert" | "update">;

/** Quem pede (para gravar o autor da inclusão quando ela nasce). */
type QuemPede = Pick<Request, "userId" | "userName">;

/** A inclusão do Kit do evento, ou null quando o evento ainda não tem Kit. */
export async function inclusaoDoKitDoEvento(eventId: string, executor: Executor = db): Promise<InclusaoDoKitLinha | null> {
  // A mais antiga, se por algum motivo houver duas (banco antes da 0009).
  const [linha] = await executor.select().from(kitRemessas)
    .where(eq(kitRemessas.eventId, eventId))
    .orderBy(asc(kitRemessas.createdAt), asc(kitRemessas.id))
    .limit(1);
  return linha ?? null;
}

/** As inclusões de vários eventos (eventId → inclusão). */
export async function inclusoesDoKitPorEvento(eventIds: string[]): Promise<Map<string, InclusaoDoKitLinha>> {
  const unicos = Array.from(new Set(eventIds.filter(Boolean)));
  const mapa = new Map<string, InclusaoDoKitLinha>();
  if (unicos.length === 0) return mapa;
  const linhas = await db.select().from(kitRemessas)
    .where(inArray(kitRemessas.eventId, unicos))
    .orderBy(asc(kitRemessas.createdAt), asc(kitRemessas.id));
  for (const l of linhas) if (!mapa.has(l.eventId)) mapa.set(l.eventId, l);
  return mapa;
}

/** Os dados da planilha do Kit que a inclusão guarda (o resto do cabeçalho é ignorado). */
export interface DadosDaInclusao {
  solicitante?: string | null;
  departamento?: string | null;
  /** O nome da planilha do Kit incluída (a última fica). */
  arquivo?: string | null;
}

const corta = (v: string | null | undefined, max: number) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, max) : null;
};

/**
 * A inclusão do Kit do evento — criada na primeira peça do Kit. Na planilha
 * seguinte, só o nome do arquivo (e o solicitante/departamento que faltavam)
 * é atualizado: as peças novas se SOMAM às que já estão lá.
 *
 * Corrida entre duas importações do mesmo evento: o índice único derruba a
 * segunda inserção (23505), e ela lê a linha que a primeira criou. Dentro de
 * uma transação o 23505 aborta a transação — por isso a inserção usa
 * ON CONFLICT DO NOTHING e só depois relê.
 */
export async function obterOuCriarInclusaoDoKit(
  executor: Executor,
  eventId: string,
  quem: QuemPede,
  dados: DadosDaInclusao = {},
): Promise<{ inclusao: InclusaoDoKitLinha; criada: boolean }> {
  const solicitante = corta(dados.solicitante, 120);
  const departamento = corta(dados.departamento, 60);
  const arquivo = corta(dados.arquivo, 200);
  const existente = await inclusaoDoKitDoEvento(eventId, executor);
  if (existente) {
    const mudancas: Partial<typeof kitRemessas.$inferInsert> = {};
    if (arquivo && arquivo !== existente.arquivo) mudancas.arquivo = arquivo;
    if (solicitante && !existente.solicitante) mudancas.solicitante = solicitante;
    if (departamento && !existente.departamento) mudancas.departamento = departamento;
    if (Object.keys(mudancas).length === 0) return { inclusao: existente, criada: false };
    const [atualizada] = await executor.update(kitRemessas).set(mudancas).where(eq(kitRemessas.id, existente.id)).returning();
    return { inclusao: atualizada ?? existente, criada: false };
  }
  const [criada] = await executor.insert(kitRemessas).values({
    eventId,
    // A coluna é NOT NULL desde 14/09; "KIT" é só o rótulo da inclusão única.
    versao: "KIT",
    solicitante: solicitante ?? quem.userName ?? null,
    departamento: departamento ?? "Kit",
    arquivo,
    criadoPor: quem.userName ?? null,
    criadoPorId: quem.userId ?? null,
  }).onConflictDoNothing().returning();
  if (criada) return { inclusao: criada, criada: true };
  const outra = await inclusaoDoKitDoEvento(eventId, executor);
  if (!outra) throw new Error("Não foi possível abrir o Kit do evento");
  return { inclusao: outra, criada: false };
}
