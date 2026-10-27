// CONFIGURAÇÕES GERAIS (26/10): a duração da etapa de Aprovação, em dias
// corridos — o "N" do prazo de Layout ajustado das peças sem aprovação
// (Pedro/dono: "editável nas configurações — não um valor fixo no código").
// Todo usuário logado LÊ (as telas calculam o prazo ajustado na hora); só o
// admin GRAVA, com linha na trilha.
import type { Express } from "express";
import { requireAuth, requireAdmin, createAuditLog } from "./shared";
import { invalidateAllCaches } from "../cache";
import { lerConfiguracaoDePrazos, gravarDiasDaAprovacao } from "../services/configuracoes";

export function registerConfiguracoesRoutes(app: Express): void {
  app.get("/api/configuracoes/prazos", requireAuth, async (_req, res) => {
    res.json(await lerConfiguracaoDePrazos());
  });

  app.put("/api/configuracoes/prazos", requireAdmin, async (req, res) => {
    try {
      const r = await gravarDiasDaAprovacao(req.body?.diasDaAprovacao, req.userName ?? null);
      if ("erro" in r) return res.status(400).json({ error: r.erro });
      if (r.anterior !== r.novo) {
        await createAuditLog(
          req, "updated", "configuracao", "dias_da_aprovacao",
          `Duração da etapa de Aprovação: ${r.anterior} → ${r.novo} dias corridos (estende o prazo de Layout das peças sem patrocínio e com arte do cliente)`,
        );
      }
      // O card do evento (cache de /api/events) traz o próximo marco já calculado.
      invalidateAllCaches();
      res.json(await lerConfiguracaoDePrazos());
    } catch (error) {
      console.error("[configuracoes] falha ao gravar:", error);
      res.status(500).json({ error: "Não foi possível salvar a configuração." });
    }
  });
}
