import type { Express } from "express";
import { requireAdmin } from "./shared";
import {
  aplicarReparosMotivosSemS,
  listarReparosMotivosSemS,
} from "../services/reparoMotivosSemS";

/**
 * Correção pontual dos motivos afetados pelo bug que substituía "s" por
 * espaço. A rota é exclusiva de admin e não altera logs/notificações.
 */
export function registerReparoMotivosRoutes(app: Express): void {
  app.get("/api/admin/reparo-motivos-sem-s", requireAdmin, async (_req, res) => {
    try {
      const reparos = await listarReparosMotivosSemS();
      res.json({ reparos, total: reparos.length });
    } catch (error) {
      console.error("[reparo-motivos] falha ao gerar prévia:", error);
      res.status(500).json({ error: "Não foi possível gerar a prévia das correções." });
    }
  });

  app.post("/api/admin/reparo-motivos-sem-s", requireAdmin, async (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Confirme a aplicação das correções antes de continuar." });
    }

    try {
      const resultado = await aplicarReparosMotivosSemS({
        userId: req.userId,
        userName: req.userName,
      });
      res.json(resultado);
    } catch (error) {
      console.error("[reparo-motivos] falha ao aplicar correções:", error);
      res.status(500).json({ error: "Não foi possível aplicar as correções." });
    }
  });
}