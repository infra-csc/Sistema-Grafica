// Notification routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import type { Notification } from "@shared/schema";
import { requireAuth, broadcast } from "./shared";

import { notifCache, setNotifCache, invalidateNotificationsCache, notifCacheGeneration } from "../cache";
import { responderFalha } from "../erros";

export function registerNotificationRoutes(app: Express): void {
  // ============ NOTIFICATIONS ============

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const userRole = req.session?.userRole;
      if (!userRole) {
        return res.status(403).json({ error: "Perfil de usuário não encontrado" });
      }
      const userId = req.session?.userId ?? null;
      // Destinatário individual (14/09): o cache é por PERFIL; a notificação
      // de outra pessoa sai aqui, depois do cache, sem virar cache por usuário.
      // Usuário do Kit (14/09): além disso, só o que é dele — aviso individual
      // ou aviso sobre uma peça do Kit que ele criou.
      // PERF (17/09): o recorte das peças do Kit deste usuário vai para o
      // banco e volta só com os ids — antes o acervo inteiro (66 colunas ×
      // todas as peças) era carregado a cada abertura do sino. Mesmo conjunto
      // de ids que o filtro em JS produzia (ver getIdsDasPecasDoKitDoCriador).
      const minhasDoKit = (req as any).session?.userKit === true
        ? new Set(await storage.getIdsDasPecasDoKitDoCriador(userId))
        : null;
      const doUsuario = (lista: Notification[]) =>
        lista.filter((n) => (!n.targetUserId || n.targetUserId === userId)
          && (!minhasDoKit || n.targetUserId === userId || (!!n.itemId && minhasDoKit.has(n.itemId))));

      const cached = notifCache.get(userRole);
      if (cached && cached.expiresAt > Date.now()) {
        // O cache de notificações só guarda o que setNotifCache recebe abaixo.
        return res.json(doUsuario(cached.data as Notification[]));
      }

      // Geração anotada ANTES da leitura: se uma notificação nova (ou um
      // "marcar como lida") invalidar o cache enquanto lemos, o resultado
      // desta leitura não vira cache — ver o bloco GERAÇÃO em ../cache.
      const geracao = notifCacheGeneration();
      const allNotifications = await storage.getAllNotifications();

      // Admin vê TODAS as notificações de perfil — as individuais, só as dele.
      if (userRole === "admin") {
        setNotifCache(userRole, allNotifications, geracao);
        return res.json(doUsuario(allNotifications));
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

      setNotifCache(userRole, filteredNotifications, geracao);
      res.json(doUsuario(filteredNotifications));
    } catch (error: unknown) {
      responderFalha(res, error, "GET /api/notifications");
    }
  });

  // Marca TODAS as não lidas visíveis ao papel do usuário em uma chamada.
  // Antes o "Marcar todas" do sino disparava até 50 PATCHes paralelos (um por
  // notificação), cada um com refetch no cliente.
  // Precisa vir ANTES de /:id/read — senão o Express casa "read-all" como :id.
  app.patch("/api/notifications/read-all", requireAuth, async (req, res) => {
    try {
      const userRole = req.session?.userRole;
      if (!userRole) {
        return res.status(403).json({ error: "Perfil de usuário não encontrado" });
      }
      // UM UPDATE no banco (o filtro por papel vive no storage) — antes eram
      // N updates disparados em Promise.all, um por notificação não lida.
      const marked = await storage.markAllNotificationsAsReadForRole(
        userRole === "admin" ? null : userRole,
        req.session?.userId ?? null,
      );
      invalidateNotificationsCache();
      broadcast({ type: "notification_read" });
      res.json({ marked });
    } catch (error: unknown) {
      responderFalha(res, error, "PATCH /api/notifications/read-all");
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notificação não encontrada" });
      }
      
      broadcast({ type: "notification_read", notification });
      
      res.json(notification);
    } catch (error: unknown) {
      responderFalha(res, error, "PATCH /api/notifications/:id/read");
    }
  });

}
