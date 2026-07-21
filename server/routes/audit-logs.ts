// Audit-log routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth } from "./shared";

export function registerAuditLogRoutes(app: Express): void {
  // ============ AUDIT LOGS ============
  
  // Get audit logs (all or filtered by type/entity)
  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId } = req.query;
      const logs = await storage.getAuditLogs(
        entityType as string | undefined,
        entityId as string | undefined
      );
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
