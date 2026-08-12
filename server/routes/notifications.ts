// Notification routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, broadcast } from "./shared";

import { notifCache, setNotifCache, invalidateNotificationsCache } from "../cache";

export function registerNotificationRoutes(app: Express): void {
  // ============ NOTIFICATIONS ============

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userRole = (req as any).session?.userRole;
      if (!userRole) {
        return res.status(403).json({ error: "Perfil de usuário não encontrado" });
      }

      const cached = notifCache.get(userRole);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }
      
      const allNotifications = await storage.getAllNotifications();
      
      // Admin vê TODAS as notificações
      if (userRole === "admin") {
        setNotifCache(userRole, allNotifications);
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

      setNotifCache(userRole, filteredNotifications);
      res.json(filteredNotifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Marca TODAS as não lidas visíveis ao papel do usuário em uma chamada.
  // Antes o "Marcar todas" do sino disparava até 50 PATCHes paralelos (um por
  // notificação), cada um com refetch no cliente.
  // Precisa vir ANTES de /:id/read — senão o Express casa "read-all" como :id.
  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const userRole = (req as any).session?.userRole;
      if (!userRole) {
        return res.status(403).json({ error: "Perfil de usuário não encontrado" });
      }
      // UM UPDATE no banco (o filtro por papel vive no storage) — antes eram
      // N updates disparados em Promise.all, um por notificação não lida.
      const marked = await storage.markAllNotificationsAsReadForRole(
        userRole === "admin" ? null : userRole,
      );
      invalidateNotificationsCache();
      broadcast({ type: "notification_read" });
      res.json({ marked });
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
