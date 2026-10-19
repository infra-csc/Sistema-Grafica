// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DO BOOK — o banco. Separado da fila e das rotas para que elas
// decidam papel, Kit e fluxo sem depender de banco (os testes trocam este
// módulo inteiro).
//
// SÓ O PRIMEIRO BOOK (dono, 19/10 — custo): a auditoria automática roda no
// 1º book de cada evento. Reenvio não audita de novo, e a auditoria do 1º
// book continua valendo e visível. Vale a auditoria MAIS RECENTE do evento
// (a do 1º book, ou a que o admin pediu de novo sobre o book atual).
// ─────────────────────────────────────────────────────────────────────────────
import { and, desc, eq, inArray, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { auditoriasDoBook, eventBooks, events, type AuditoriaDoBook } from "@shared/schema";
import type { AchadosDoBook, ResolucaoDoAchado, StatusDaAuditoria } from "@shared/auditoria-do-book";

/** Quanto tempo uma auditoria pode ficar "processando" antes de outra cópia retomá-la. */
export const PROCESSANDO_ESQUECIDA_MS = 20 * 60_000;

export type { AuditoriaDoBook };

/**
 * O evento já tem auditoria que conta? "Primeiro book" = não tem nenhuma,
 * fora as que deram "erro" ou ficaram "sem_chave" — essas tentam de novo no
 * próximo envio.
 */
export async function eventoJaTemAuditoria(eventId: string): Promise<boolean> {
  const [linha] = await db.select({ id: auditoriasDoBook.id }).from(auditoriasDoBook)
    .where(and(eq(auditoriasDoBook.eventId, eventId), notInArray(auditoriasDoBook.status, ["erro", "sem_chave"])))
    .limit(1);
  return !!linha;
}

/**
 * Cria a auditoria de um book. As que ainda não tinham rodado
 * para o mesmo evento viram "substituida" — a fila pula, e a que estava
 * rodando não consegue mais concluir (ver `concluir`).
 */
export async function criarAuditoria(eventId: string, bookUrl: string): Promise<AuditoriaDoBook> {
  await db.update(auditoriasDoBook)
    .set({ status: "substituida" })
    .where(and(eq(auditoriasDoBook.eventId, eventId), inArray(auditoriasDoBook.status, ["pendente", "processando", "sem_chave"])));
  const [nova] = await db.insert(auditoriasDoBook).values({ eventId, bookUrl, status: "pendente" }).returning();
  return nova;
}

export async function buscarAuditoria(id: string): Promise<AuditoriaDoBook | null> {
  const [a] = await db.select().from(auditoriasDoBook).where(eq(auditoriasDoBook.id, id));
  return a ?? null;
}

/**
 * Pega a auditoria para rodar NESTA cópia do servidor. Atômico: duas cópias
 * que sobem juntas e tentam a mesma pendente — só uma consegue. A que ficou
 * "processando" há mais de 20 min (processo caiu no meio) pode ser retomada.
 */
export async function reivindicar(id: string): Promise<AuditoriaDoBook | null> {
  const limite = new Date(Date.now() - PROCESSANDO_ESQUECIDA_MS);
  const [a] = await db.update(auditoriasDoBook)
    .set({ status: "processando", iniciadoEm: new Date(), erro: null })
    .where(and(
      eq(auditoriasDoBook.id, id),
      or(
        eq(auditoriasDoBook.status, "pendente"),
        and(eq(auditoriasDoBook.status, "processando"), or(lt(auditoriasDoBook.iniciadoEm, limite), sql`${auditoriasDoBook.iniciadoEm} IS NULL`)),
      ),
    ))
    .returning();
  return a ?? null;
}

/** Grava o resultado. Devolve null se a auditoria foi substituída no meio do caminho. */
export async function concluir(id: string, dados: {
  achados: AchadosDoBook;
  pecasNoBook: number | null;
  encontradasNoApp: number | null;
  modelo: string;
  tokensEntrada: number | null;
  tokensSaida: number | null;
}): Promise<AuditoriaDoBook | null> {
  const [a] = await db.update(auditoriasDoBook)
    .set({ ...dados, status: "concluida", erro: null, concluidoEm: new Date() })
    .where(and(eq(auditoriasDoBook.id, id), eq(auditoriasDoBook.status, "processando")))
    .returning();
  return a ?? null;
}

/** "erro" ou "sem_chave", com o motivo. Não mexe em auditoria já substituída. */
export async function falhar(id: string, status: Extract<StatusDaAuditoria, "erro" | "sem_chave">, erro: string, extra?: { modelo?: string | null; tokensEntrada?: number | null; tokensSaida?: number | null }): Promise<void> {
  await db.update(auditoriasDoBook)
    .set({ status, erro: erro.slice(0, 2000), concluidoEm: new Date(), ...(extra ?? {}) })
    .where(and(eq(auditoriasDoBook.id, id), inArray(auditoriasDoBook.status, ["pendente", "processando"])));
}

/** A auditoria mais recente de cada evento (qualquer status). */
async function maisRecentesPorEvento(): Promise<AuditoriaDoBook[]> {
  return db.selectDistinctOn([auditoriasDoBook.eventId])
    .from(auditoriasDoBook)
    .orderBy(auditoriasDoBook.eventId, desc(auditoriasDoBook.criadoEm));
}

/** O book atual (publicação mais recente) de cada evento. */
async function booksAtuais(eventIds?: string[]): Promise<Map<string, { bookUrl: string; createdAt: Date }>> {
  if (eventIds && eventIds.length === 0) return new Map();
  const linhas = await db.selectDistinctOn([eventBooks.eventId], { eventId: eventBooks.eventId, bookUrl: eventBooks.bookUrl, createdAt: eventBooks.createdAt })
    .from(eventBooks)
    .where(eventIds ? inArray(eventBooks.eventId, eventIds) : undefined)
    .orderBy(eventBooks.eventId, desc(eventBooks.createdAt));
  return new Map(linhas.map((l) => [l.eventId, { bookUrl: l.bookUrl, createdAt: l.createdAt }]));
}

export async function bookAtualDoEvento(eventId: string): Promise<{ bookUrl: string; createdAt: Date } | null> {
  return (await booksAtuais([eventId])).get(eventId) ?? null;
}

/**
 * Ao subir o servidor: o que ficou por fazer. Só a mais recente de cada
 * evento conta. Com a chave configurada, as que pararam em "sem_chave" voltam
 * para a fila — o book publicado enquanto faltava o Secret também é auditado.
 */
export async function idsParaRetomar(comChave: boolean): Promise<string[]> {
  const recentes = await maisRecentesPorEvento();
  // Só as dos últimos 30 dias: book velho de evento que já passou não vale a chamada.
  const desde = Date.now() - 30 * 86_400_000;
  const voltar = recentes.filter((a) => comChave && a.status === "sem_chave" && new Date(a.criadoEm).getTime() > desde).map((a) => a.id);
  if (voltar.length) {
    await db.update(auditoriasDoBook).set({ status: "pendente", erro: null, concluidoEm: null })
      .where(and(inArray(auditoriasDoBook.id, voltar), eq(auditoriasDoBook.status, "sem_chave")));
  }
  return recentes
    .filter((a) => a.status === "pendente" || a.status === "processando" || voltar.includes(a.id))
    .map((a) => a.id);
}

export interface AuditoriaAtual extends AuditoriaDoBook {
  evento: {
    id: string;
    name: string;
    status: string | null;
    startDate: Date | null;
    reopenedAt: Date | null;
    arquivadoEm: Date | null;
  };
  /** Quando o book AUDITADO foi publicado. */
  bookPublicadoEm: Date | null;
  /** Quando saiu um book mais novo que o auditado (reenvio não audita de novo). */
  bookMaisNovoEm: Date | null;
}

/**
 * A auditoria vigente de cada evento: a mais recente. Não exige que o book
 * dela seja o atual — o reenvio não audita de novo (regra do 1º book) e a do
 * 1º book continua valendo.
 */
export async function auditoriasAtuais(): Promise<AuditoriaAtual[]> {
  const recentes = (await maisRecentesPorEvento()).filter((a) => a.status !== "substituida");
  if (recentes.length === 0) return [];
  const ids = recentes.map((a) => a.eventId);
  const [books, publicacoes, evs] = await Promise.all([
    booksAtuais(ids),
    db.select({ eventId: eventBooks.eventId, bookUrl: eventBooks.bookUrl, createdAt: eventBooks.createdAt })
      .from(eventBooks).where(inArray(eventBooks.eventId, ids)),
    db.select({
      id: events.id, name: events.name, status: events.status, startDate: events.startDate,
      reopenedAt: events.reopenedAt, arquivadoEm: events.arquivadoEm,
    }).from(events).where(inArray(events.id, ids)),
  ]);
  const evPorId = new Map(evs.map((e) => [e.id, e]));
  const saida: AuditoriaAtual[] = [];
  for (const a of recentes) {
    const evento = evPorId.get(a.eventId);
    if (!evento) continue;
    const doLivro = publicacoes
      .filter((p) => p.eventId === a.eventId && p.bookUrl === a.bookUrl)
      .sort((x, y) => new Date(x.createdAt).getTime() - new Date(y.createdAt).getTime())[0];
    const atual = books.get(a.eventId);
    const maisNovo = atual && atual.bookUrl !== a.bookUrl ? atual.createdAt : null;
    saida.push({ ...a, evento, bookPublicadoEm: doLivro?.createdAt ?? null, bookMaisNovoEm: maisNovo });
  }
  return saida;
}

/** Marca (ou desmarca, com null) um achado. Atômico no jsonb: duas pessoas marcando achados diferentes não se apagam. */
export async function gravarResolucao(id: string, chave: string, resolucao: ResolucaoDoAchado | null): Promise<AuditoriaDoBook | null> {
  const novo = resolucao
    ? sql`${auditoriasDoBook.resolvidos} || jsonb_build_object(${chave}::text, ${JSON.stringify(resolucao)}::jsonb)`
    : sql`${auditoriasDoBook.resolvidos} - ${chave}::text`;
  const [a] = await db.update(auditoriasDoBook)
    .set({ resolvidos: novo as unknown as AuditoriaDoBook["resolvidos"] })
    .where(eq(auditoriasDoBook.id, id))
    .returning();
  return a ?? null;
}
