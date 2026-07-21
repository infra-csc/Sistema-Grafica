// Notification routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, broadcast } from "./shared";

export function registerNotificationRoutes(app: Express): void {
  // ============ NOTIFICATIONS ============

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userRole = (req as any).session?.userRole;
      if (!userRole) {
        return res.status(403).json({ error: "Perfil de usuário não encontrado" });
      }
      
      const allNotifications = await storage.getAllNotifications();
      
      // Admin vê TODAS as notificações
      if (userRole === "admin") {
        return res.json(allNotifications);
      }
      
      // Outros perfis: filtrar notificações baseadas no perfil (SEGURANÇA)
      const filteredNotifications = allNotifications.filter((notification) => {
        // Se não houver targetRoles, mostrar para todos (backward compatibility)
        if (!notification.targetRoles || notification.targetRoles.length === 0) {
          return true;
        }
        // Verificar se o perfil do usuário está na lista de targetRoles
        return notification.targetRoles.includes(userRole);
      });
      
      res.json(filteredNotifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      
      broadcast({ type: "notification_read", notification });
      
      res.json(notification);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
