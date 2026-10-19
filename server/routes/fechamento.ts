// ─────────────────────────────────────────────────────────────────────────────
// FECHAMENTO DO EVENTO (19/10) — a planilha completa de um ou mais eventos,
// em qualquer situação (aberto, realizado, encerrado). A regra e o porquê
// moram em services/fechamentoDoEvento.ts.
//
//  · GET /api/events/:id/export-xlsx       — um evento (Detalhe e Relatório).
//  · GET /api/fechamento-xlsx?eventos=a,b  — vários de uma vez (Gráfica, com
//    o filtro de evento): um arquivo, o evento numa coluna.
//
// Leitura pura (GET): não passa pelas travas de escrita nem pela auditoria.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { requireAuth } from "./shared";
import { responderFechamento, idsDosEventosDaQuery } from "../services/fechamentoDoEvento";

export function registerFechamentoRoutes(app: Express): void {
  app.get("/api/events/:id/export-xlsx", requireAuth, (req, res) => responderFechamento(req, res, [req.params.id]));
  app.get("/api/fechamento-xlsx", requireAuth, (req, res) => responderFechamento(req, res, idsDosEventosDaQuery(req.query.eventos)));
}
