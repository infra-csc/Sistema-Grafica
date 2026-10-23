// ─────────────────────────────────────────────────────────────────────────────
// KIT — a inclusão do Kit do evento (dono, 14/09; uma só por evento desde
// 23/10). Decisões em shared/kit.ts.
//
// Só LEITURA: a inclusão nasce sozinha com a primeira peça do Kit (criação à
// mão em POST /api/items ou planilha do Kit em POST /api/events/:id/confirm-
// import) e as planilhas seguintes acrescentam peças a ela — ver
// services/kitRemessas.ts. Criar, editar e excluir "remessa" deixou de existir:
// o Kit não tem datas nem versões próprias.
//
// Papéis: qualquer usuário logado lê (o caminho segue /api/kit/remessas, o que
// as telas e o tempo real já conhecem).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { and, asc, eq, type SQL } from "drizzle-orm";
import { db } from "../db";
import { kitRemessas } from "@shared/schema";
import type { InclusaoDoKit } from "@shared/kit";
import { requireAuth } from "./shared";
import { doEventoNaoArquivado } from "../services/arquivamento";

/** A linha do banco no formato da tela (sem as datas antigas da remessa). */
const paraTela = (r: typeof kitRemessas.$inferSelect): InclusaoDoKit => ({
  id: r.id,
  eventId: r.eventId,
  solicitante: r.solicitante,
  departamento: r.departamento,
  arquivo: r.arquivo,
  criadoPor: r.criadoPor,
  criadoPorId: r.criadoPorId,
  createdAt: new Date(r.createdAt).toISOString(),
});

export function registerKitRoutes(app: Express): void {
  app.get("/api/kit/remessas", requireAuth, async (req, res) => {
    try {
      // Inclusão de evento arquivado sai da lista, como o evento.
      const condicoes: SQL[] = [doEventoNaoArquivado(kitRemessas.eventId)];
      if (typeof req.query.eventId === "string" && req.query.eventId) condicoes.push(eq(kitRemessas.eventId, req.query.eventId));
      const lista = await db.select().from(kitRemessas)
        .where(and(...condicoes))
        .orderBy(asc(kitRemessas.createdAt), asc(kitRemessas.id));
      // Uma por evento (a mais antiga, se o banco ainda não passou pela 0009).
      const vistas = new Set<string>();
      res.json(lista.filter((r) => (vistas.has(r.eventId) ? false : (vistas.add(r.eventId), true))).map(paraTela));
    } catch (error) {
      console.error("[kit] erro ao listar as inclusões do Kit:", error);
      res.status(500).json({ error: "Erro ao carregar o Kit do evento" });
    }
  });
}
