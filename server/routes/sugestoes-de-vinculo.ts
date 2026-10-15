// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÕES DE VÍNCULO E COTA SUGERIDA — as rotas da vinculação com histórico
// (dono, 15/10). A lógica mora em services/sugestao-de-vinculo e o motor em
// @shared/sugestao-de-vinculo; aqui só papel, guarda e resposta.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole } from "./shared";
import { barraEventoFinalizado } from "./eventoFinalizado";
import { barraSeArquivado } from "../services/arquivamento";
import { responderFalha } from "../erros";
import { aplicarSugestoes, cotasSugeridas, sugestoesDosEventos } from "../services/sugestao-de-vinculo";

// Os MESMOS papéis que vinculam (requireLinkingWrite em sponsors.ts e a rota
// /vincular-patrocinadores do client): ler a sugestão é parte de vincular.
const requireSugestaoDeVinculo = requireRole("arte", "solicitacao", "atendimento", "admin");

/** Até quantos eventos a leitura em lote aceita (a tela pede só os que têm peça em vinculação). */
const TETO_DE_EVENTOS = 500;

export function registerSugestoesDeVinculoRoutes(app: Express): void {
  // Lote: a tela de Vincular lê os eventos em jogo numa requisição só.
  app.get("/api/sugestoes-de-vinculo", requireSugestaoDeVinculo, async (req, res) => {
    try {
      const cru = typeof req.query.eventId === "string" ? req.query.eventId : "";
      const ids = Array.from(new Set(cru.split(",").map((s) => s.trim()).filter(Boolean)));
      if (ids.length > TETO_DE_EVENTOS) {
        return res.status(400).json({ error: `Peça sugestões de até ${TETO_DE_EVENTOS} eventos por vez.` });
      }
      res.json(ids.length === 0 ? {} : await sugestoesDosEventos(ids));
    } catch (error: unknown) {
      responderFalha(res, error, "GET /api/sugestoes-de-vinculo");
    }
  });

  // Um evento: { porPeca: { [itemId]: Sugestao[] }, automaticos: {...} }.
  app.get("/api/events/:id/sugestoes-de-vinculo", requireSugestaoDeVinculo, async (req, res) => {
    try {
      const evento = await storage.getEvent(req.params.id);
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });
      const todos = await sugestoesDosEventos([evento.id]);
      res.json(todos[evento.id] ?? { porPeca: {}, automaticos: {} });
    } catch (error: unknown) {
      responderFalha(res, error, "GET /api/events/:id/sugestoes-de-vinculo");
    }
  });

  // APLICAR: o servidor recalcula. `itemIds` (opcional) só RECORTA quais
  // peças — o que entra em cada uma é decisão do motor, não do cliente.
  app.post("/api/events/:id/sugestoes-de-vinculo/aplicar", requireSugestaoDeVinculo, async (req, res) => {
    try {
      const evento = await storage.getEvent(req.params.id);
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });
      if (barraSeArquivado(evento, res)) return;
      // ANDA: vincular é a etapa que faz a peça seguir para a Arte.
      if (await barraEventoFinalizado({ eventId: evento.id }, res)) return;
      const cru: unknown = req.body?.itemIds;
      if (cru !== undefined && (!Array.isArray(cru) || cru.some((x) => typeof x !== "string") || cru.length > 2000)) {
        return res.status(400).json({ error: "itemIds deve ser uma lista de até 2.000 ids de peça." });
      }
      // Sem lista, "o evento inteiro" — e para a Solicitação da Arena, sem as
      // peças do Kit (com lista, a trava de server/routes.ts já responde 403).
      const semPecasDoKit = req.userRole === "solicitacao" && !req.userKit;
      const r = await aplicarSugestoes(req, evento.id, cru as string[] | undefined, { semPecasDoKit });
      res.json(r);
    } catch (error: unknown) {
      responderFalha(res, error, "POST /api/events/:id/sugestoes-de-vinculo/aplicar");
    }
  });

  // COTA SUGERIDA: a mais recente de cada patrocinador em outros eventos.
  // `?exceto=<eventId>` tira o evento em edição da conta.
  app.get("/api/cotas-sugeridas", requireAuth, async (req, res) => {
    try {
      const exceto = typeof req.query.exceto === "string" && req.query.exceto ? req.query.exceto : null;
      res.json(await cotasSugeridas(exceto));
    } catch (error: unknown) {
      responderFalha(res, error, "GET /api/cotas-sugeridas");
    }
  });
}
