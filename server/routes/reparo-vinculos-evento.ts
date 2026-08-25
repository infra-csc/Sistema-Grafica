import type { Express } from "express";
import { requireAdmin, broadcast } from "./shared";
import {
  aplicarVinculosEventoPendentes,
  listarVinculosEventoPendentes,
} from "../services/repararVinculosEvento";

/**
 * Reparo pontual do estoque antigo: uma marca presente em uma peça precisa
 * também ser conhecida pelo evento. Exclusivo de admin e com confirmação
 * explícita no POST; o serviço é idempotente e registra cada inclusão.
 */
export function registerReparoVinculosEventoRoutes(app: Express): void {
  app.get("/api/admin/reparo-vinculos-evento", requireAdmin, async (_req, res) => {
    try {
      const vinculos = await listarVinculosEventoPendentes();
      res.json({ vinculos, total: vinculos.length });
    } catch (error) {
      console.error("[reparo-vinculos-evento] falha ao gerar prévia:", error);
      res.status(500).json({ error: "Não foi possível gerar a prévia dos vínculos." });
    }
  });

  app.post("/api/admin/reparo-vinculos-evento", requireAdmin, async (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Confirme a aplicação dos vínculos antes de continuar." });
    }

    try {
      const resultado = await aplicarVinculosEventoPendentes({
        userId: req.userId,
        userName: req.userName,
      });
      broadcast({ type: "event_sponsors_repaired", count: resultado.aplicados });
      res.json({
        totalEncontrado: resultado.totalEncontrado,
        aplicados: resultado.aplicados,
      });
    } catch (error) {
      console.error("[reparo-vinculos-evento] falha ao aplicar vínculos:", error);
      res.status(500).json({ error: "Não foi possível aplicar os vínculos." });
    }
  });
}