import type { Express } from "express";
import { broadcast, requireAdmin } from "./shared";
import {
  analisarInferenciaExecutivos,
  aplicarInferenciaExecutivos,
} from "../services/inferirExecutivos";

export function registerInferirExecutivosRoutes(app: Express): void {
  app.get("/api/admin/inferir-executivos", requireAdmin, async (_req, res) => {
    try {
      res.json(await analisarInferenciaExecutivos());
    } catch (error) {
      console.error("[inferir-executivos] falha ao gerar prévia:", error);
      res.status(500).json({ error: "Não foi possível gerar a prévia dos executivos." });
    }
  });

  app.post("/api/admin/inferir-executivos", requireAdmin, async (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: "Confirme a aplicação das propostas claras antes de continuar." });
    }

    try {
      const resultado = await aplicarInferenciaExecutivos({
        userId: req.userId,
        userName: req.userName,
      });
      broadcast({ type: "account_executives_inferred", count: resultado.aplicados });
      res.json({
        totalPropostasClaras: resultado.relatorio.claras.length,
        aplicados: resultado.aplicados,
        duvidosas: resultado.relatorio.duvidosas.length,
        semSinal: resultado.relatorio.semSinal.length,
      });
    } catch (error) {
      console.error("[inferir-executivos] falha ao aplicar propostas:", error);
      res.status(500).json({ error: "Não foi possível aplicar os executivos." });
    }
  });
}