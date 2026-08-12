// Audit-log routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./shared";

export function registerAuditLogRoutes(app: Express): void {
  // ============ AUDIT LOGS ============
  
  // Get audit logs (all or filtered by type/entity)
  //
  // Segurança — por que NÃO é requireAdmin: a intenção era exigir admin na
  // listagem completa (trilha de auditoria do sistema inteiro) e deixar
  // requireAuth só para consultas com escopo (?entityId= de uma entidade).
  // Só que HOJE as telas Atendimento, Arte, Gráfica, Histórico e Vincular
  // Patrocinadores — todas acessíveis a perfis não-admin (ver ROLES_* no
  // App.tsx) — baixam a listagem completa sem filtro para montar históricos
  // por peça no client. Restringir aqui quebraria essas cinco telas.
  // Mitigação aplicada: teto de 500 registros no storage.getAuditLogs.
  // Pendência: migrar essas telas para consultas com escopo
  // (?entityType=/&entityId=) e então exigir admin na listagem completa.
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, limit } = req.query;
      const logs = await storage.getAuditLogs(
        entityType as string | undefined,
        entityId as string | undefined
      );
      // ?limit=N: os logs já vêm ordenados por createdAt desc — devolve só os
      // N mais recentes (o modal de revisão pede 8) em vez da lista inteira.
      const n = Number.parseInt(limit as string, 10);
      res.json(Number.isFinite(n) && n > 0 ? logs.slice(0, n) : logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
