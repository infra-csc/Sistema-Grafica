// ─────────────────────────────────────────────────────────────────────────────
// KIT — remessas (dono, 14/09). Decisões em shared/kit.ts.
//
// A remessa guarda as datas do Kit de um evento (entrega do material, carga e
// saída do caminhão), a versão e quem pediu. Toda peça do Kit aponta para uma
// remessa do MESMO evento. Cada versão da planilha é uma remessa nova.
//
// Papéis: ler — qualquer usuário logado (o do Kit, só as dele); criar — admin
// e Solicitação (o usuário do Kit é um usuário de Solicitação marcado "Kit").
// Validação e criação moram em services/kitRemessas.ts (a importação também usa).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db";
import { kitRemessas } from "@shared/schema";
import { requireAuth, requireRole } from "./shared";
import { criarRemessa, excluirRemessa, remessaSchema } from "../services/kitRemessas";
import { doEventoNaoArquivado } from "../services/arquivamento";

const requireCriarRemessa = requireRole("admin", "solicitacao");

export function registerKitRoutes(app: Express): void {
  app.get("/api/kit/remessas", requireAuth, async (req, res) => {
    try {
      // Remessa de evento arquivado sai da lista, como o evento.
      const condicoes: SQL[] = [doEventoNaoArquivado(kitRemessas.eventId)];
      if (typeof req.query.eventId === "string" && req.query.eventId) condicoes.push(eq(kitRemessas.eventId, req.query.eventId));
      if ((req as any).userKit) condicoes.push(eq(kitRemessas.criadoPorId, (req as any).userId ?? ""));
      const lista = await db.select().from(kitRemessas)
        .where(condicoes.length ? and(...condicoes) : undefined)
        .orderBy(desc(kitRemessas.createdAt));
      res.json(lista);
    } catch (error) {
      console.error("[kit] erro ao listar remessas:", error);
      res.status(500).json({ error: "Erro ao listar as remessas do Kit" });
    }
  });

  app.post("/api/kit/remessas", requireCriarRemessa, async (req, res) => {
    try {
      const dados = remessaSchema.parse(req.body);
      const r = await criarRemessa(req, dados);
      if ("erro" in r) return res.status(r.status).json({ error: r.erro });
      res.status(201).json(r.remessa);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      console.error("[kit] erro ao criar remessa:", error);
      res.status(500).json({ error: "Erro ao criar a remessa do Kit" });
    }
  });

  // Excluir a remessa com as peças (soft) — só enquanto nenhuma peça andou.
  app.delete("/api/kit/remessas/:id", requireCriarRemessa, async (req, res) => {
    try {
      const r = await excluirRemessa(req, req.params.id);
      if ("erro" in r) return res.status(r.status).json({ error: r.erro });
      res.json({ ok: true, excluidas: r.excluidas });
    } catch (error) {
      console.error("[kit] erro ao excluir remessa:", error);
      res.status(500).json({ error: "Erro ao excluir a remessa do Kit" });
    }
  });
}
