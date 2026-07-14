// Referenced from javascript_websocket blueprint for WebSocket setup
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  insertEventSchema, 
  insertItemSchema, 
  insertStandardItemSchema,
  insertNotificationSchema,
  insertProductionUpdateSchema,
  insertCommentSchema,
  insertDeliveryPhotoSchema,
  insertAuditLogSchema,
  insertUserSchema,
  insertSponsorSchema,
  insertEventSponsorSchema,
  insertItemSponsorSchema,
  insertItemSponsorApprovalSchema,
  loginSchema,
  changePasswordSchema,
  type Item,
  type ItemSponsorApproval
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { db, pool } from "./db";
import { events } from "@shared/schema";
import { z } from "zod";

// Extend Express Request type to include userName and userId
declare global {
  namespace Express {
    interface Request {
      userName?: string;
      userId?: string;
      userRole?: string;
    }
  }
}

// Session data interface
declare module "express-session" {
  interface SessionData {
    userId?: string;
    userName?: string;
    userRole?: string;
  }
}

// WebSocket clients set
const wsClients = new Set<WebSocket>();

// Broadcast function for real-time updates
function broadcast(data: any) {
  const message = JSON.stringify(data);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Helper to translate status to Portuguese
function translateStatus(status: string): string {
  const statusMap: Record<string, string> = {
    draft: "Rascunho",
    requested: "Solicitado",
    awaiting_linking: "Aguardando Vinculação",
    awaiting_submission: "Aguardando Envio",
    awaiting_approval: "Aguardando Aprovação",
    awaiting_finalization: "Aguardando Finalização",
    awaiting_final_review: "Aguardando Revisão Final",
    awaiting_review: "Aguardando Revisão",
    in_review: "Em Revisão",
    ready_for_production: "Pronto para Produção",
    approved: "Liberado",
    inProduction: "Em Produção",
    produced: "Produzido",
    delivered: "Entregue",
    canceled: "Cancelado",
    archived: "Arquivado",
    // Legacy status compatibility
    awaiting_sponsor_approval: "Aguardando Aprovação",
    sponsor_approved: "Aguardando Finalização",
    awaiting_creator_review: "Aguardando Revisão Final",
  };
  return statusMap[status] || status;
}

// Helper to create audit logs
async function createAuditLog(
  userName: string,
  action: string,
  entityType: string,
  entityId: string,
  details?: string
) {
  try {
    await storage.createAuditLog({
      userName,
      action,
      entityType,
      entityId,
      details,
    });
  } catch (error) {
    console.error("Failed to create audit log:", error);
  }
}

// Helper to calculate event status based on items
async function calculateEventStatus(eventId: string): Promise<"created" | "completed"> {
  const event = await storage.getEvent(eventId);
  if (!event) return "created";
  
  const items = await storage.getItemsByEvent(eventId);
  
  // Se já passou a data do evento, considera como concluído
  const now = new Date();
  const eventStartDate = new Date(event.startDate);
  const eventHasPassed = now > eventStartDate;
  
  if (eventHasPassed) {
    return "completed";
  }
  
  // Se não há itens, evento permanece "created"
  if (items.length === 0) {
    return "created";
  }
  
  // Verifica se TODOS os itens foram entregues
  const allDelivered = items.every(item => item.status === "delivered");
  
  return allDelivered ? "completed" : "created";
}

// Helper to update event status automatically
async function updateEventStatus(eventId: string): Promise<void> {
  const newStatus = await calculateEventStatus(eventId);
  const event = await storage.getEvent(eventId);
  
  if (event && event.status !== newStatus) {
    await storage.updateEvent(eventId, { status: newStatus });
    broadcast({ type: "event_updated", event: { ...event, status: newStatus } });
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Middleware to extract user info from session
  app.use((req, res, next) => {
    if (req.session?.userId) {
      req.userId = req.session.userId;
      req.userName = req.session.userName || 'Sistema';
      req.userRole = req.session.userRole || 'solicitacao';
    } else {
      // Fallback to headers for backwards compatibility
      req.userName = (req.headers['x-user-name'] as string) || 'Sistema';
    }
    next();
  });

  // Auth middleware - protect routes that require authentication
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    next();
  };

  // Admin middleware - protect routes that require admin role
  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    if (req.session.userRole !== 'admin') {
      return res.status(403).json({ error: "Acesso negado - apenas administradores" });
    }
    next();
  };

  // ============ AUTHENTICATION ============

  // Register new user (admin only)
  app.post("/api/auth/register", requireAdmin, async (req, res) => {
    try {
      const { password, ...userData } = insertUserSchema.parse({ ...req.body, password: req.body.password || "sso_placeholder_pw" });
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      // When no password is provided (SSO-only users), generate a random secure hash
      const rawPassword = password && password.length >= 6 ? password : Math.random().toString(36) + Math.random().toString(36) + Date.now().toString(36);
      const passwordHash = await bcrypt.hash(rawPassword, 10);

      // Create user (SSO-only: no password change required)
      const user = await storage.createUser({
        ...userData,
        passwordHash,
        mustChangePassword: false,
      });

      // Create audit log
      await createAuditLog(
        req.userName!,
        'created',
        'user',
        user.id,
        `Usuário "${user.name}" criado com perfil "${user.role}"`
      );

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Register error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Login
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);

      // Find user
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Email ou senha inválidos" });
      }

      // Set session
      req.session.userId = user.id;
      req.session.userName = user.name;
      req.session.userRole = user.role;

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Logout
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Erro ao fazer logout" });
      }
      res.json({ message: "Logout realizado com sucesso" });
    });
  });

  // Get current user
  app.get("/api/auth/me", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    try {
      const user = await storage.getUser(req.session.userId);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Change password
  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

      // Get current user
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // If not first login, verify current password
      if (!user.mustChangePassword && currentPassword) {
        const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isValid) {
          return res.status(401).json({ error: "Senha atual incorreta" });
        }
      }

      // Hash new password
      const passwordHash = await bcrypt.hash(newPassword, 10);

      // Update user
      await storage.updateUser(user.id, {
        passwordHash,
        mustChangePassword: false,
      });

      // Create audit log
      await createAuditLog(
        req.userName!,
        'updated',
        'user',
        user.id,
        'Senha alterada'
      );

      res.json({ message: "Senha alterada com sucesso" });
    } catch (error: any) {
      console.error("Change password error:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ USER MANAGEMENT (Admin only) ============

  // Get all users
  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      // Don't send password hashes to client
      const usersWithoutPasswords = users.map(({ passwordHash: _, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update user (admin only)
  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const { password, ...updateData } = req.body;

      // If password is being updated, hash it
      if (password) {
        const passwordHash = await bcrypt.hash(password, 10);
        updateData.passwordHash = passwordHash;
        updateData.mustChangePassword = true;
      }

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      // Create audit log
      await createAuditLog(
        req.userName!,
        'updated',
        'user',
        user.id,
        `Usuário "${user.name}" atualizado`
      );

      // Don't send password hash to client
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete user (admin only)
  app.delete("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      // Prevent deleting yourself
      if (req.params.id === req.userId) {
        return res.status(400).json({ error: "Você não pode excluir sua própria conta" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      await storage.deleteUser(req.params.id);

      // Create audit log
      await createAuditLog(
        req.userName!,
        'deleted',
        'user',
        user.id,
        `Usuário "${user.name}" excluído`
      );

      res.json({ message: "Usuário excluído com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ SPONSORS ============
  
  // Get all sponsors
  app.get("/api/sponsors", requireAuth, async (req, res) => {
    try {
      const sponsors = await storage.getAllSponsors();
      res.json(sponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single sponsor
  app.get("/api/sponsors/:id", requireAuth, async (req, res) => {
    try {
      const sponsor = await storage.getSponsor(req.params.id);
      if (!sponsor) {
        return res.status(404).json({ error: "Patrocinador não encontrado" });
      }
      res.json(sponsor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create sponsor
  app.post("/api/sponsors", requireAuth, async (req, res) => {
    try {
      const validatedData = insertSponsorSchema.parse(req.body);
      const sponsor = await storage.createSponsor(validatedData);
      
      await createAuditLog(
        req.userName!,
        'created',
        'sponsor',
        sponsor.id,
        `Patrocinador "${sponsor.name}" criado`
      );
      
      broadcast({ type: "sponsor_created", sponsor });
      res.status(201).json(sponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update sponsor
  app.patch("/api/sponsors/:id", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertSponsorSchema.partial().parse(req.body);
      const sponsor = await storage.updateSponsor(req.params.id, validatedData);
      if (!sponsor) {
        return res.status(404).json({ error: "Patrocinador não encontrado" });
      }
      
      await createAuditLog(
        req.userName!,
        'updated',
        'sponsor',
        sponsor.id,
        `Patrocinador "${sponsor.name}" atualizado`
      );
      
      broadcast({ type: "sponsor_updated", sponsor });
      res.json(sponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete sponsor
  app.delete("/api/sponsors/:id", requireAdmin, async (req, res) => {
    try {
      const sponsor = await storage.getSponsor(req.params.id);
      if (!sponsor) {
        return res.status(404).json({ error: "Patrocinador não encontrado" });
      }

      await storage.deleteSponsor(req.params.id);
      
      await createAuditLog(
        req.userName!,
        'deleted',
        'sponsor',
        sponsor.id,
        `Patrocinador "${sponsor.name}" excluído`
      );
      
      broadcast({ type: "sponsor_deleted", sponsorId: req.params.id });
      res.json({ message: "Patrocinador excluído com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ QUOTA RULES ============

  app.get("/api/events/:id/quota-rules", requireAuth, async (req, res) => {
    try {
      const rules = await storage.getEventQuotaRules(req.params.id);
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:id/quota-rules", requireAuth, async (req, res) => {
    try {
      // Body: { quota: string, itemTypes: string[] }
      const { quota, itemTypes } = req.body as { quota: string; itemTypes: string[] };
      if (!quota) return res.status(400).json({ error: "quota é obrigatório" });
      const rule = await storage.upsertEventQuotaRule(req.params.id, quota, itemTypes ?? []);
      res.json(rule);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/events/:id/quota-rules/:quota", requireAuth, async (req, res) => {
    try {
      await storage.deleteEventQuotaRule(req.params.id, req.params.quota);
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id/auto-link-preview", requireAuth, async (req, res) => {
    try {
      const preview = await storage.previewAutoLink(req.params.id);
      res.json(preview);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/:id/auto-link-sponsors", requireAuth, async (req, res) => {
    try {
      const linked = await storage.autoLinkByQuota(req.params.id);
      res.json({ linked });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ EVENT SPONSORS ============
  
  // Get sponsors for an event
  app.get("/api/events/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const eventSponsors = await storage.getEventSponsors(req.params.id);
      res.json(eventSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update sponsor quota on event
  app.patch("/api/events/:eventId/sponsors/:sponsorId", requireAuth, async (req, res) => {
    try {
      const { eventId, sponsorId } = req.params;
      const quota = req.body.quota || null;
      await storage.updateEventSponsorQuota(eventId, sponsorId, quota);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Add sponsor to event
  app.post("/api/events/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const validatedData = insertEventSponsorSchema.parse({
        eventId: req.params.id,
        sponsorId: req.body.sponsorId,
        quota: req.body.quota || null,
      });

      const eventSponsor = await storage.addSponsorToEvent(validatedData);
      
      const event = await storage.getEvent(req.params.id);
      const sponsor = await storage.getSponsor(validatedData.sponsorId);
      
      await createAuditLog(
        req.userName!,
        'added',
        'event_sponsor',
        eventSponsor.id,
        `Patrocinador "${sponsor?.name}" vinculado ao evento "${event?.name}"`
      );
      
      broadcast({ type: "event_sponsor_added", eventSponsor });
      res.status(201).json(eventSponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Remove sponsor from event
  app.delete("/api/events/:eventId/sponsors/:sponsorId", requireAuth, async (req, res) => {
    try {
      const { eventId, sponsorId } = req.params;
      const success = await storage.removeSponsorFromEvent(eventId, sponsorId);
      
      if (!success) {
        return res.status(404).json({ error: "Vinculação não encontrada" });
      }
      
      const event = await storage.getEvent(eventId);
      const sponsor = await storage.getSponsor(sponsorId);
      
      await createAuditLog(
        req.userName!,
        'removed',
        'event_sponsor',
        `${eventId}_${sponsorId}`,
        `Patrocinador "${sponsor?.name}" removido do evento "${event?.name}"`
      );
      
      broadcast({ type: "event_sponsor_removed", eventId, sponsorId });
      res.json({ message: "Patrocinador removido do evento com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ ITEM SPONSORS ============

  // Get sponsors for specific item (with full sponsor data including name)
  app.get("/api/items/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      
      // Fetch full sponsor data for each item sponsor relationship
      const sponsorsWithDetails = await Promise.all(
        itemSponsors.map(async (is) => {
          const sponsor = await storage.getSponsor(is.sponsorId);
          return sponsor ? {
            id: sponsor.id,
            name: sponsor.name,
            color: sponsor.color || '#3b82f6',
            itemSponsorId: is.id,
            createdAt: is.createdAt
          } : null;
        })
      );
      
      res.json(sponsorsWithDetails.filter(Boolean));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk sync item sponsors (replaces all sponsors for an item)
  app.post("/api/items/:id/sponsors/sync", requireAuth, async (req, res) => {
    try {
      const itemId = req.params.id;
      const { sponsorIds, skipApproval } = req.body;

      if (!Array.isArray(sponsorIds)) {
        return res.status(400).json({ error: "sponsorIds deve ser um array" });
      }

      // Filtrar IDs nulos ou vazios antes de inserir no banco
      const validSponsorIds = sponsorIds.filter((id: any) => id && typeof id === 'string' && id.trim() !== '');
      await storage.bulkSyncItemSponsors(itemId, validSponsorIds);
      
      // Update item with skipApproval only (status NOT changed here - user must click "Enviar para Arte")
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // Only update skipApproval, do NOT change status automatically
      const itemUpdates: any = { skipApproval: skipApproval || false };
      
      const item = await storage.updateItem(itemId, itemUpdates);
      
      await createAuditLog(
        (req as any).userName,
        'updated',
        'item',
        itemId,
        `Patrocinadores atualizados - ${sponsorIds.length} ${sponsorIds.length === 1 ? 'patrocinador vinculado' : 'patrocinadores vinculados'}${skipApproval ? ' (sem aprovação)' : ''}`
      );
      
      broadcast({ type: "item_updated", item });
      
      // Return updated item with sponsors
      const itemSponsorsData = await storage.getItemSponsors(itemId);
      res.json({ 
        message: "Patrocinadores atualizados com sucesso",
        item,
        sponsors: itemSponsorsData
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Return item to creation (Solicitação) team
  app.post("/api/items/:id/return-to-creation", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await storage.getItem(id);
      if (!item) return res.status(404).json({ error: "Item não encontrado" });

      const allowedStatuses = ['requested', 'awaiting_linking', 'awaiting_submission'];
      if (!allowedStatuses.includes(item.status)) {
        return res.status(409).json({ error: `Item não pode ser devolvido. Status atual: ${item.status}` });
      }

      const prevStatus = item.status;
      await storage.updateItem(id, { status: 'draft', skipApproval: false });
      await storage.bulkSyncItemSponsors(id, []);

      await createAuditLog(
        (req as any).userName,
        'updated',
        'item',
        id,
        `Item devolvido para Criação (status anterior: ${translateStatus(prevStatus)})`
      );

      const updated = await storage.getItem(id);
      res.json({ message: "Item devolvido para Criação com sucesso", item: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send items to Arte (bulk) - changes status from 'requested' to 'awaiting_submission'
  app.post("/api/items/send-to-arte", requireAuth, async (req, res) => {
    try {
      const { itemIds } = req.body;
      
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array com pelo menos um item" });
      }
      
      const results: any[] = [];
      const errors: string[] = [];
      
      for (const itemId of itemIds) {
        try {
          const item = await storage.getItem(itemId);
          if (!item) {
            errors.push(`Item ${itemId} não encontrado`);
            continue;
          }
          
          // Items with status 'requested' or 'awaiting_linking' can be sent to Arte
          if (item.status !== 'requested' && item.status !== 'awaiting_linking') {
            errors.push(`Item ${item.displayId} não está no status correto para envio`);
            continue;
          }
          
          // Check if item has sponsors, skipApproval, or isReuse
          const itemSponsors = await storage.getItemSponsors(itemId);
          if (itemSponsors.length === 0 && !item.skipApproval && !item.isReuse) {
            errors.push(`Item ${item.displayId} precisa ter patrocinadores vinculados ou "Sem aprovação" marcado`);
            continue;
          }
          
          // Update status to awaiting_submission
          const updatedItem = await storage.updateItem(itemId, { status: 'awaiting_submission' });
          results.push(updatedItem);
        } catch (error: any) {
          errors.push(`Erro ao processar item ${itemId}: ${error.message}`);
        }
      }
      
      if (results.length > 0) {
        await createAuditLog(
          (req as any).userName,
          'updated',
          'item',
          results.map(i => i.id).join(','),
          `${results.length} ${results.length === 1 ? 'item enviado' : 'itens enviados'} para Arte`
        );
        
        // Notify Arte profile
        await storage.createNotification({
          type: 'itemsSentToArte',
          message: `${results.length} ${results.length === 1 ? 'item' : 'itens'} aguardando criação de thumb de aprovação`,
          targetRoles: ['arte', 'admin'],
        });
        
        results.forEach(item => {
          broadcast({ type: "item_updated", item });
        });
      }
      
      res.json({ 
        success: true,
        sent: results.length,
        errors: errors.length > 0 ? errors : undefined,
        items: results
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add single sponsor to item
  app.post("/api/items/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const validatedData = insertItemSponsorSchema.parse({
        itemId: req.params.id,
        sponsorId: req.body.sponsorId,
      });

      const itemSponsor = await storage.addSponsorToItem(validatedData);
      
      const item = await storage.getItem(req.params.id);
      const sponsor = await storage.getSponsor(validatedData.sponsorId);
      
      await createAuditLog(
        (req as any).userName,
        'added',
        'item_sponsor',
        itemSponsor.id,
        `Patrocinador "${sponsor?.name}" vinculado ao item ${item?.type || 'N/A'}`
      );
      
      broadcast({ type: "item_sponsor_added", itemSponsor });
      res.status(201).json(itemSponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Remove sponsor from item
  app.delete("/api/items/:itemId/sponsors/:sponsorId", requireAuth, async (req, res) => {
    try {
      const { itemId, sponsorId } = req.params;
      const success = await storage.removeSponsorFromItem(itemId, sponsorId);
      
      if (!success) {
        return res.status(404).json({ error: "Vinculação não encontrada" });
      }
      
      const item = await storage.getItem(itemId);
      const sponsor = await storage.getSponsor(sponsorId);
      
      await createAuditLog(
        (req as any).userName,
        'removed',
        'item_sponsor',
        `${itemId}_${sponsorId}`,
        `Patrocinador "${sponsor?.name}" removido do item ${item?.type || 'N/A'}`
      );
      
      broadcast({ type: "item_sponsor_removed", itemId, sponsorId });
      res.json({ message: "Patrocinador removido do item com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ EVENTS ============
  
  // Get all events with items count
  app.get("/api/events", async (req, res) => {
    try {
      const allEvents = await storage.getAllEvents();
      
      // Fetch items and sponsors for each event and calculate real-time status
      const eventsWithItems = await Promise.all(
        allEvents.map(async (event) => {
          const eventItems = await storage.getItemsByEvent(event.id);
          const eventSponsors = await storage.getEventSponsors(event.id);
          
          // Calculate real-time status
          const now = new Date();
          const eventStartDate = new Date(event.startDate);
          const eventHasPassed = now > eventStartDate;
          
          let calculatedStatus = event.status;
          
          if (eventHasPassed) {
            calculatedStatus = "completed";
          } else if (eventItems.length > 0) {
            const allDelivered = eventItems.every(item => item.status === "delivered");
            if (allDelivered) {
              calculatedStatus = "completed";
            }
          }
          
          return {
            ...event,
            status: calculatedStatus, // Override with calculated status
            items: eventItems,
            sponsors: eventSponsors,
          };
        })
      );
      
      res.json(eventsWithItems);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single event
  app.get("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      const eventItems = await storage.getItemsByEvent(event.id);
      res.json({ ...event, items: eventItems });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create event
  app.post("/api/events", async (req, res) => {
    try {
      const validatedData = insertEventSchema.parse(req.body);
      
      // Validação: Saída do caminhão deve ser pelo menos 1 dia antes do início do evento
      const startDate = new Date(validatedData.startDate);
      const truckDate = new Date(validatedData.truckDepartureDate);
      startDate.setHours(0, 0, 0, 0);
      const truckDateOnly = new Date(truckDate);
      truckDateOnly.setHours(0, 0, 0, 0);
      
      if (truckDateOnly >= startDate) {
        return res.status(400).json({ 
          error: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento" 
        });
      }
      
      const event = await storage.createEvent(validatedData);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'created',
        'event',
        event.id,
        `Evento "${event.name}" criado`
      );
      
      // Não notificar quando evento é criado (só quando itens forem adicionados)
      
      // Broadcast update
      broadcast({ type: "event_created", event });
      
      res.status(201).json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update event
  app.patch("/api/events/:id", async (req, res) => {
    try {
      // Validação: Se ambas as datas estão sendo atualizadas, verificar regra
      if (req.body.startDate && req.body.truckDepartureDate) {
        const startDate = new Date(req.body.startDate);
        const truckDate = new Date(req.body.truckDepartureDate);
        startDate.setHours(0, 0, 0, 0);
        const truckDateOnly = new Date(truckDate);
        truckDateOnly.setHours(0, 0, 0, 0);
        
        if (truckDateOnly >= startDate) {
          return res.status(400).json({ 
            error: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento" 
          });
        }
      }
      
      const event = await storage.updateEvent(req.params.id, req.body);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        event.id,
        `Evento "${event.name}" atualizado`
      );
      
      broadcast({ type: "event_updated", event });
      
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update event priority
  app.patch("/api/events/:id/priority", async (req, res) => {
    try {
      const { priority } = req.body;
      
      if (!priority || !["baixa", "media", "alta", "urgente"].includes(priority)) {
        return res.status(400).json({ error: "Prioridade inválida. Use: baixa, media, alta ou urgente" });
      }
      
      const event = await storage.updateEvent(req.params.id, { priority });
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        event.id,
        `Prioridade do evento "${event.name}" definida como "${priority}"`
      );
      
      broadcast({ type: "event_priority_updated", event });
      
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete event
  app.delete("/api/events/:id", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Delete all items associated with this event first
      const items = await storage.getItemsByEvent(req.params.id);
      for (const item of items) {
        await storage.deleteItem(item.id);
      }
      
      // Delete the event
      const success = await storage.deleteEvent(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Event not found" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'event',
        req.params.id,
        `Evento "${event.name}" excluído`
      );
      
      broadcast({ type: "event_deleted", eventId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit all draft items to Arte
  app.post("/api/events/:id/items/submit", requireAuth, async (req, res) => {
    try {
      const userRole = (req as any).userRole;
      const userId = (req as any).userId;
      const eventId = req.params.id;
      
      // Buscar evento para validação
      const event = await storage.getEvent(eventId);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Allow admin or any solicitacao user to submit draft items
      const isAdmin = userRole === 'admin';
      const isSolicitacao = userRole === 'solicitacao';

      if (!isAdmin && !isSolicitacao) {
        return res.status(403).json({ error: "Acesso negado. Apenas perfis de Solicitação ou Admin podem enviar itens para vinculação" });
      }
      
      // Buscar todos os itens em rascunho deste evento
      const allItems = await storage.getItemsByEvent(eventId);
      const draftItems = allItems.filter(item => item.status === 'draft');
      
      if (draftItems.length === 0) {
        return res.status(400).json({ error: "Nenhum item em rascunho para enviar" });
      }
      
      // Atomic status transition: only update if status is still 'draft'
      // This prevents race conditions where status might have changed between read and update
      const updatePromises = draftItems.map(item => 
        storage.updateItemWithStatusCheck(item.id, 'draft', 'requested')
      );
      const updatedItems = await Promise.all(updatePromises);
      
      // Filter out failed updates (items that returned null)
      const successfulUpdates = updatedItems.filter((item): item is Item => item !== null);
      const failedCount = updatedItems.length - successfulUpdates.length;
      
      // If any updates failed, return conflict error
      if (failedCount > 0) {
        return res.status(409).json({ 
          error: "Alguns itens mudaram de status durante a operação. Recarregue a página e tente novamente.",
          failedCount,
          successCount: successfulUpdates.length
        });
      }
      
      // All updates successful - create audit log with actual count
      await createAuditLog(
        (req as any).userName,
        'created',
        'item',
        eventId,
        `${successfulUpdates.length} ${successfulUpdates.length === 1 ? 'item' : 'itens'}: Status alterado de Rascunho → ${translateStatus('requested')} (${successfulUpdates.length === 1 ? 'enviado' : 'enviados'} para vinculação)`
      );
      
      // Notify Arte and Admin profiles with actual count
      await storage.createNotification({
        type: 'itemsSubmitted',
        message: `${successfulUpdates.length} ${successfulUpdates.length === 1 ? 'novo item' : 'novos itens'} aguardando vinculação de patrocinadores no evento "${event.name}"`,
        targetRoles: ['arte', 'admin'],
        eventId,
      });
      
      broadcast({ 
        type: "items_submitted", 
        eventId,
        count: successfulUpdates.length,
        items: successfulUpdates 
      });
      
      res.json({ 
        success: true, 
        count: successfulUpdates.length,
        items: successfulUpdates 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ ITEMS ============

  // Get all items with event data and sponsors
  app.get("/api/items", async (req, res) => {
    try {
      const allItems = await storage.getAllItems();
      
      // Fetch event and sponsors for each item
      const itemsWithEventsAndSponsors = await Promise.all(
        allItems.map(async (item) => {
          const event = await storage.getEvent(item.eventId);
          
          // Buscar sponsors do item
          const itemSponsors = await storage.getItemSponsors(item.id);
          
          // Fazer lookup dos dados completos dos sponsors
          const sponsors = await Promise.all(
            itemSponsors.map(async (is: any) => {
              const sponsor = await storage.getSponsor(is.sponsorId);
              return sponsor;
            })
          );
          
          return {
            ...item,
            event,
            sponsors: sponsors.filter(Boolean), // Remove nulls
          };
        })
      );
      
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending items with event and sponsors (for Arte module) - MUST come BEFORE /:eventId route
  app.get("/api/items/pending", async (req, res) => {
    try {
      const pendingItems = await storage.getPendingItems();
      
      // Fetch event and sponsors for each item
      const itemsWithEventsAndSponsors = await Promise.all(
        pendingItems.map(async (item) => {
          const event = await storage.getEvent(item.eventId);
          
          // Buscar sponsors do item
          const itemSponsors = await storage.getItemSponsors(item.id);
          
          // Fazer lookup dos dados completos dos sponsors
          const sponsors = await Promise.all(
            itemSponsors.map(async (is: any) => {
              const sponsor = await storage.getSponsor(is.sponsorId);
              return sponsor;
            })
          );
          
          return {
            ...item,
            event,
            sponsors: sponsors.filter(Boolean), // Remove nulls
          };
        })
      );
      
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items that have at least one awaiting_arte sponsor approval (for Arte correção) - MUST come BEFORE /:eventId
  app.get("/api/items/resubmission-needed", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }

      const allItems = await storage.getAllItems();
      const awaitingItems = allItems.filter(i => i.status === "awaiting_sponsor_approval");

      const result = [];
      for (const item of awaitingItems) {
        const approvals = await storage.getItemSponsorApprovals(item.id);
        const awaitingArte = approvals.filter((a: any) => a.status === "awaiting_arte");
        if (awaitingArte.length === 0) continue;

        const itemSponsors = await storage.getItemSponsors(item.id);
        const sponsorMap = new Map<string, any>();
        for (const is of itemSponsors) {
          const s = await storage.getSponsor(is.sponsorId);
          if (s) sponsorMap.set(is.sponsorId, s);
        }

        const event = await storage.getEvent(item.eventId);

        result.push({
          ...item,
          event,
          awaitingArteApprovals: awaitingArte.map((a: any) => ({
            ...a,
            sponsor: sponsorMap.get(a.sponsorId) || null,
          })),
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approved items with event and sponsors (for Gráfica module) - MUST come BEFORE /:eventId route
  app.get("/api/items/approved", async (req, res) => {
    try {
      const approvedItems = await storage.getApprovedItems();
      
      // Fetch event and sponsors for each item
      const itemsWithEventsAndSponsors = await Promise.all(
        approvedItems.map(async (item) => {
          const event = await storage.getEvent(item.eventId);
          
          // Buscar sponsors do item
          const itemSponsors = await storage.getItemSponsors(item.id);
          
          // Fazer lookup dos dados completos dos sponsors
          const sponsors = await Promise.all(
            itemSponsors.map(async (is: any) => {
              const sponsor = await storage.getSponsor(is.sponsorId);
              return sponsor;
            })
          );
          
          return {
            ...item,
            event,
            sponsors: sponsors.filter(Boolean), // Remove nulls
          };
        })
      );
      
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items by event with sponsors - MUST come AFTER specific routes like /pending and /approved
  app.get("/api/items/:eventId", async (req, res) => {
    try {
      const items = await storage.getItemsByEvent(req.params.eventId);
      
      // Buscar sponsors para cada item
      const itemsWithSponsors = await Promise.all(
        items.map(async (item) => {
          // Buscar sponsors do item
          const itemSponsors = await storage.getItemSponsors(item.id);
          
          // Fazer lookup dos dados completos dos sponsors
          const sponsors = await Promise.all(
            itemSponsors.map(async (is: any) => {
              const sponsor = await storage.getSponsor(is.sponsorId);
              return sponsor;
            })
          );
          
          return {
            ...item,
            sponsors: sponsors.filter(Boolean), // Remove nulls
          };
        })
      );
      
      res.json(itemsWithSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create item
  app.post("/api/items", async (req, res) => {
    try {
      const validatedData = insertItemSchema.parse(req.body);
      
      const event = await storage.getEvent(validatedData.eventId);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Check if event was completed - if so, reset priority and require re-definition
      if (event.status === "completed") {
        await storage.updateEvent(event.id, { 
          status: "created",
          priority: undefined // Reset priority - must be redefined
        });
        
        // Notificação sobre reset de prioridade (apenas admin)
        const notification = await storage.createNotification({
          type: "eventCreated",
          message: `Item adicionado ao evento "${event.name}" que estava concluído. Prioridade precisa ser redefinida.`,
          eventId: event.id,
          targetRoles: ["admin"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      const item = await storage.createItem(validatedData);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'created',
        'item',
        item.id,
        `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
      );
      
      // Novo item adicionado - notifica Arte + Gráfica
      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `Novo item adicionado: ${item.type} - Evento: ${event.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte", "grafica"],
      });
      
      // Update event status
      await updateEventStatus(item.eventId);
      
      broadcast({ type: "item_created", item });
      broadcast({ type: "notification_created", notification });
      
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create multiple items at once (bulk)
  app.post("/api/items/bulk", async (req, res) => {
    try {
      const { items: itemsData } = req.body;
      
      if (!Array.isArray(itemsData) || itemsData.length === 0) {
        return res.status(400).json({ error: "Items array is required and cannot be empty" });
      }
      
      // Validate all items
      const validatedItems = itemsData.map((item, index) => {
        try {
          return insertItemSchema.parse(item);
        } catch (error: any) {
          throw new Error(`Validation error at item ${index + 1}: ${error.message}`);
        }
      });
      
      // Create all items in bulk
      const createdItems = await storage.createBulkItems(validatedItems);
      
      // Create audit log for each item created
      for (const item of createdItems) {
        await createAuditLog(
          (req as any).userName,
          'created',
          'item',
          item.id,
          `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
        );
      }
      
      // Get event for notification
      const firstItem = createdItems[0];
      const event = firstItem ? await storage.getEvent(firstItem.eventId) : null;
      
      // Primeira lista de itens - notificação única para Arte + Gráfica
      if (event) {
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `${createdItems.length} itens adicionados - Evento: ${event.name}`,
          eventId: event.id,
          targetRoles: ["arte", "grafica"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      // Broadcast update
      broadcast({ type: "items_bulk_created", items: createdItems, eventId: firstItem?.eventId });
      
      res.status(201).json(createdItems);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Import items from Excel (.xlsx) ──────────────────────────────────────
  // Uses multer to handle multipart/form-data upload (avoids JSON body size limits)
  app.post("/api/events/:id/import-xlsx", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      // Parse multipart using multer (memory storage)
      const multer = (await import("multer")).default;
      const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
      await new Promise<void>((resolve, reject) =>
        upload.single("file")(req as any, res as any, (err: any) => err ? reject(err) : resolve())
      );

      const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
      if (!file) return res.status(400).json({ error: "Arquivo .xlsx não encontrado na requisição" });

      // Decode buffer → parse xlsx in-process via AdmZip + XML
      const { default: AdmZip } = await import("adm-zip");
      const buf = file.buffer;
      const zip = new AdmZip(buf);

      // Read shared strings
      const ssEntry = zip.getEntry("xl/sharedStrings.xml");
      const sharedStrings: string[] = [];
      if (ssEntry) {
        const ssXml = ssEntry.getData().toString("utf8");
        for (const m of ssXml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) sharedStrings.push(m[1]);
      }

      // Helper: parse all rows from a sheet XML into {rowNum → {col → value}}
      type CellMap = Record<string, string>;
      function parseSheet(sheetXml: string): Record<number, CellMap> {
        const result: Record<number, CellMap> = {};
        for (const rowM of sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
          const rowNum = parseInt(rowM[1]);
          const cellMap: CellMap = {};
          // String cells: t="s"
          for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"[^>]*t="s"[^>]*><v>(\d+)<\/v><\/c>/g)) {
            cellMap[cm[1]] = (sharedStrings[parseInt(cm[2])] ?? "").trim();
          }
          // Numeric/other cells (no t= attribute or t != "s")
          for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"(?![^>]*t="s")[^>]*><v>([^<]+)<\/v><\/c>/g)) {
            if (!cellMap[cm[1]]) cellMap[cm[1]] = cm[2].trim();
          }
          if (Object.keys(cellMap).length > 0) result[rowNum] = cellMap;
        }
        return result;
      }

      // Try sheets in order: sheet2 first (Norte standard format), then sheet1
      const sheetNames = ["xl/worksheets/sheet2.xml", "xl/worksheets/sheet1.xml",
                          "xl/worksheets/sheet3.xml", "xl/worksheets/sheet4.xml"];

      let rows: Record<number, CellMap> = {};
      let headerRow = -1;
      let colMap: Record<string, string> = {};

      for (const sheetName of sheetNames) {
        const entry = zip.getEntry(sheetName);
        if (!entry) continue;
        const candidate = parseSheet(entry.getData().toString("utf8"));

        // Find header row in this sheet
        for (const [rn, cells] of Object.entries(candidate)) {
          const vals = Object.values(cells).map(v => v.toLowerCase().trim());
          if (vals.includes("item") && (vals.includes("qtde") || vals.includes("qtd") || vals.includes("quantidade"))) {
            headerRow = parseInt(rn);
            rows = candidate;
            // Map column letters to field names
            for (const [col, val] of Object.entries(cells)) {
              const v = val.toLowerCase().replace(/\s+/g, " ").trim();
              if (v === "item") colMap["item"] = col;
              else if (v === "qtde" || v === "qtd" || v === "quantidade") colMap["qty"] = col;
              else if (v.startsWith("área") || v === "area" || v === "compr") colMap["width"] = col;
              else if (v === "visual" || v === "altura") colMap["height"] = col;
              else if (v === "material") colMap["material"] = col;
              else if (v === "acabamento") colMap["finish"] = col;
              else if (v.startsWith("medida do arquivo") || v === "medida arquivo") colMap["fileSize"] = col;
              else if (v === "m²" || v === "m2") colMap["m2"] = col;
              else if (v === "obs" || v.startsWith("observa")) colMap["obs"] = col;
            }
            break;
          }
        }
        if (headerRow !== -1) break;
      }

      if (headerRow === -1) {
        return res.status(400).json({ error: "Cabeçalho não encontrado. A planilha deve ter colunas 'item' e 'qtde'." });
      }

      // In Norte's format column B = group/tipo (e.g. "2x1", "ROLO")
      // Detect the group column: it's the column just before "item"
      const itemCol = colMap["item"]!;
      const itemColIdx = itemCol.charCodeAt(0) - 65; // A=0, B=1 ...
      const groupCol = itemColIdx > 0 ? String.fromCharCode(65 + itemColIdx - 1) : null;

      // Also detect width/height from area columns after header if not found by name
      // Norte sheets use G=área(width) H=visual(height) K=fileW L=fileH
      // But colMap["width"] might not be set if column header was "área " (trailing space)
      // Fix: search again more loosely
      const hdrRow = rows[headerRow] ?? {};
      for (const [col, val] of Object.entries(hdrRow)) {
        const v = val.toLowerCase().trim();
        if (!colMap["width"] && (v.startsWith("área") || v === "area")) colMap["width"] = col;
        if (!colMap["height"] && v === "visual") colMap["height"] = col;
        // K/L are "medida do arquivo" width and height separately in some sheets
        if (!colMap["fileW"] && v.startsWith("medida do arquivo")) colMap["fileW"] = col;
        if (!colMap["fileH"] && v === "compr") colMap["fileH"] = col;
      }

      // Determine next column letters for file dimensions (Norte: K=fileW, L=fileH after J=acabamento)
      const finCol = colMap["finish"];
      if (finCol && !colMap["fileW"]) {
        const finIdx = finCol.charCodeAt(0) - 65;
        colMap["fileW"] = String.fromCharCode(65 + finIdx + 1); // K
        colMap["fileH"] = String.fromCharCode(65 + finIdx + 2); // L
      }

      const parseNum = (s: string): number => {
        if (!s) return 0;
        const clean = s.replace(",", ".").replace(/[^\d.eE+\-]/g, "");
        return parseFloat(clean) || 0;
      };

      let currentGroup = "";
      const itemsToCreate: any[] = [];
      const numRows = Math.max(...Object.keys(rows).map(Number));

      for (let r = headerRow + 1; r <= numRows; r++) {
        const row = rows[r];
        if (!row) continue;

        // Group column (B in Norte format) — update currentGroup when present
        if (groupCol && row[groupCol]) currentGroup = row[groupCol];

        const itemVal = colMap["item"] ? (row[colMap["item"]] || "").trim() : "";
        const qtyStr  = colMap["qty"]  ? (row[colMap["qty"]]  || "").trim() : "";
        const matVal  = colMap["material"] ? (row[colMap["material"]] || "").trim() : "";
        const finVal  = colMap["finish"]   ? (row[colMap["finish"]]   || "").trim() : "";
        const wVal    = colMap["width"]    ? (row[colMap["width"]]    || "").trim() : "";
        const hVal    = colMap["height"]   ? (row[colMap["height"]]   || "").trim() : "";
        const fwVal   = colMap["fileW"]    ? (row[colMap["fileW"]]    || "").trim() : "";
        const fhVal   = colMap["fileH"]    ? (row[colMap["fileH"]]    || "").trim() : "";
        const fileSizeVal = colMap["fileSize"] ? (row[colMap["fileSize"]] || "").trim() : "";
        const obsVal  = colMap["obs"]      ? (row[colMap["obs"]]      || "").trim() : "";

        if (!itemVal) continue;

        const qty = parseInt(qtyStr) || 0;
        if (qty === 0) continue;

        // Parse visual dimensions
        const visualW = parseNum(wVal);
        const visualH = parseNum(hVal);

        // Parse file dimensions: prefer explicit columns K/L, then "medida do arquivo" string, then fallback to visual
        let fileW = parseNum(fwVal) || visualW;
        let fileH = parseNum(fhVal) || visualH;
        if (fileSizeVal && (!fileW || !fileH)) {
          const parts = fileSizeVal.replace(/,/g, ".").replace(/\s/g, "").split(/[xX×]/);
          if (parts.length >= 2) {
            fileW = parseFloat(parts[0]) || fileW;
            fileH = parseFloat(parts[1]) || fileH;
          }
        }

        const calcM2 = qty * fileW * fileH;
        const cap = (s: string) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
        const measurement = fileW && fileH
          ? `${fileW.toFixed(2)} × ${fileH.toFixed(2)}`
          : (visualW && visualH ? `${visualW.toFixed(2)} × ${visualH.toFixed(2)}` : "");

        itemsToCreate.push({
          eventId: event.id,
          type: currentGroup || itemVal,
          description: itemVal,
          quantity: qty,
          area: visualW || fileW || 0,
          visual: visualH || fileH || 0,
          calculatedM2: calcM2 || 0,
          material: cap(matVal) || "Lona",
          finish: cap(finVal) || "Ilhós",
          measurement,
          observations: obsVal,
          status: "requested",
        });
      }

      if (itemsToCreate.length === 0) {
        return res.status(400).json({ error: "Nenhum item válido encontrado na planilha. Verifique se há linhas com item e qtde preenchidos." });
      }

      // Validate and create
      const validated = itemsToCreate.map((item, i) => {
        try {
          return insertItemSchema.parse(item);
        } catch (e: any) {
          throw new Error(`Item ${i + 1} (${item.description}): ${e.message}`);
        }
      });

      const created = await storage.createBulkItems(validated);

      // Audit log
      await createAuditLog(
        (req as any).userName,
        'created',
        'item',
        event.id,
        `${created.length} itens importados via Excel ("${file.originalname}")`
      );

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens importados via Excel — Evento: ${event.name}`,
        eventId: event.id,
        targetRoles: ["arte", "grafica"],
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: event.id });
      await updateEventStatus(event.id);

      res.status(201).json({ imported: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Preview Excel items (parse without saving) ───────────────────────────
  app.post("/api/events/:id/preview-xlsx", async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const multer = (await import("multer")).default;
      const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
      await new Promise<void>((resolve, reject) =>
        upload.single("file")(req as any, res as any, (err: any) => err ? reject(err) : resolve())
      );

      const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
      if (!file) return res.status(400).json({ error: "Arquivo .xlsx não encontrado" });

      const { default: AdmZip } = await import("adm-zip");
      let zip: any;
      try { zip = new AdmZip(file.buffer); }
      catch (e: any) { return res.status(400).json({ error: `Arquivo inválido ou corrompido: ${e.message}` }); }

      // Parse sharedStrings correctly — each <si> = one entry, concat all <t> children
      const sharedStrings: string[] = [];
      const ssEntry = zip.getEntry("xl/sharedStrings.xml");
      if (ssEntry) {
        const ssXml = ssEntry.getData().toString("utf8");
        for (const siM of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
          const parts: string[] = [];
          for (const tM of siM[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)) parts.push(tM[1]);
          sharedStrings.push(parts.join(""));
        }
      }

      const decodeXml = (s: string) =>
        s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
         .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_,n) => String.fromCharCode(+n));

      type CellMap = Record<string, string>;
      function parseSheet(sheetXml: string): Record<number, CellMap> {
        const result: Record<number, CellMap> = {};
        for (const rowM of sheetXml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
          const rowNum = parseInt(rowM[1]);
          const cellMap: CellMap = {};
          // Parse each cell individually to handle all types: s, str, inlineStr, numeric
          for (const cm of rowM[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
            const col = cm[1];
            const attrs = cm[2];
            const content = cm[3];
            const typeM = attrs.match(/\bt="([^"]+)"/);
            const t = typeM ? typeM[1] : "";
            let val = "";
            if (t === "s") {
              const vM = content.match(/<v>(\d+)<\/v>/);
              if (vM) val = decodeXml(sharedStrings[parseInt(vM[1])] ?? "");
            } else if (t === "inlineStr") {
              const parts: string[] = [];
              for (const tM of content.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) parts.push(tM[1]);
              val = decodeXml(parts.join(""));
            } else {
              // t="str" (formula string), t="" (number), t="b" (boolean), etc.
              // <f> may appear before <v> in formula cells — use [\s\S]*? to skip it
              const vM = content.match(/<v>([^<]+)<\/v>/);
              if (vM) val = decodeXml(vM[1].trim());
            }
            if (val.trim()) cellMap[col] = val.trim();
          }
          if (Object.keys(cellMap).length > 0) result[rowNum] = cellMap;
        }
        return result;
      }

      let rows: Record<number, CellMap> = {};
      let headerRow = -1;
      let colMap: Record<string, string> = {};

      // Normalise text for header matching (strip accents, lowercase)
      const normHdr = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

      // Collect all worksheet entries from the ZIP
      const sheetEntries: string[] = [];
      for (const entry of zip.getEntries()) {
        if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entry.entryName)) sheetEntries.push(entry.entryName);
      }
      // Try sheet2 first (common for multi-sheet workbooks), then sheet1, then rest
      sheetEntries.sort((a, b) => {
        const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0");
        const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0");
        if (na === 2) return -1; if (nb === 2) return 1;
        if (na === 1) return -1; if (nb === 1) return 1;
        return na - nb;
      });

      for (const sn of sheetEntries) {
        const entry = zip.getEntry(sn);
        if (!entry) continue;
        const candidate = parseSheet(entry.getData().toString("utf8"));
        for (const [rn, cells] of Object.entries(candidate)) {
          const vals = Object.values(cells).map(v => normHdr(v));
          // Exact-match item column (direct labels only — "cód peça" is a code col, not item)
          const isItemCol = (v: string) =>
            v === "item" || v === "peca" || v === "pecas" || v === "descricao" || v === "descr" ||
            v === "nome" || v === "produto" || v === "tipo" ||
            v.startsWith("descri") || v.startsWith("tipo de");
          // Code column ("cód peça", "codigo peca", etc.) — item col is inferred from the preceding column
          const isCodeCol = (v: string) =>
            (v.startsWith("cod") || v.startsWith("codigo")) && v.includes("peca");
          const isQtyCol = (v: string) =>
            v === "qtde" || v === "qtd" || v === "qtd." || v === "quantidade" || v === "quant" ||
            v === "und" || v === "unid" || v === "unidade" || v === "qnt" || v === "un" || v === "un." ||
            v.startsWith("qtd") || v.startsWith("quan") || v.includes("quantidade");

          const hasItem = vals.some(v => isItemCol(v) || isCodeCol(v));
          const hasQty  = vals.some(isQtyCol);
          if (hasItem && hasQty) {
            headerRow = parseInt(rn); rows = candidate;
            let codeColLetter: string | null = null;
            for (const [col, val] of Object.entries(cells)) {
              const v = normHdr(val);
              if (!colMap["item"] && isItemCol(v))          colMap["item"] = col;
              else if (isCodeCol(v))                        codeColLetter = col;
              else if (!colMap["qty"] && isQtyCol(v))       colMap["qty"] = col;
              else if (!colMap["width"]  && (v.startsWith("area") || v === "compr" || v === "largura" || v === "larg")) colMap["width"] = col;
              else if (!colMap["height"] && (v === "visual" || v === "visu" || v === "altura" || v === "alt")) colMap["height"] = col;
              else if (!colMap["material"] && v === "material") colMap["material"] = col;
              else if (!colMap["finish"]   && (v === "acabamento" || v === "acab")) colMap["finish"] = col;
              else if (!colMap["fileSize"] && (v.startsWith("medida") || v === "medida arquivo" || v === "dimensao" || v === "dimensoes")) colMap["fileSize"] = col;
              else if (!colMap["m2"]  && (v === "m2" || v === "m\u00b2" || v === "metragem")) colMap["m2"] = col;
              else if (!colMap["obs"] && (v === "obs" || v.startsWith("observa"))) colMap["obs"] = col;
            }
            // Infer item col = column immediately before code col (Norte standard format)
            if (!colMap["item"] && codeColLetter) {
              const codeIdx = codeColLetter.charCodeAt(0) - 65;
              if (codeIdx > 0) colMap["item"] = String.fromCharCode(65 + codeIdx - 1);
            }
            break;
          }
        }
        if (headerRow !== -1) break;
      }

      if (headerRow === -1) {
        // Log all row values found to aid debugging
        const allRowSamples: string[] = [];
        for (const sn of sheetEntries.slice(0, 2)) {
          const entry = zip.getEntry(sn);
          if (!entry) continue;
          const candidate = parseSheet(entry.getData().toString("utf8"));
          for (const [rn, cells] of Object.entries(candidate).slice(0, 10)) {
            const vals = Object.values(cells as CellMap).map((v: string) => normHdr(v)).filter(Boolean);
            if (vals.length > 0) allRowSamples.push(`  row ${rn} [${sn}]: ${vals.join(" | ")}`);
          }
        }
        console.error("[preview-xlsx] header not found. File:", file.originalname, "\nRows scanned:\n" + allRowSamples.join("\n"));
        return res.status(400).json({ error: "Cabeçalho não encontrado. A planilha deve ter colunas 'item' (ou 'peça'/'descrição') e 'qtde' (ou 'quantidade')." });
      }

      const hdrRow = rows[headerRow] ?? {};
      for (const [col, val] of Object.entries(hdrRow)) {
        const v = val.toLowerCase().trim();
        if (!colMap["width"] && (v.startsWith("área") || v.startsWith("area"))) colMap["width"] = col;
        if (!colMap["height"] && (v === "visual" || v === "visu")) colMap["height"] = col;
        if (!colMap["fileW"] && v.startsWith("medida do arquivo")) colMap["fileW"] = col;
        if (!colMap["fileH"] && v === "compr") colMap["fileH"] = col;
        if (!colMap["obs"] && (v === "obs" || v.startsWith("observa"))) colMap["obs"] = col;
      }
      const finCol = colMap["finish"];
      if (finCol && !colMap["fileW"]) {
        const fi = finCol.charCodeAt(0) - 65;
        colMap["fileW"] = String.fromCharCode(65 + fi + 1);
        colMap["fileH"] = String.fromCharCode(65 + fi + 2);
      }
      // If fileW found but fileH not set, infer fileH = next column after fileW
      if (colMap["fileW"] && !colMap["fileH"]) {
        const fwIdx = colMap["fileW"].charCodeAt(0) - 65;
        colMap["fileH"] = String.fromCharCode(65 + fwIdx + 1);
      }
      // If height found but width not set, infer width = column immediately before height
      if (colMap["height"] && !colMap["width"]) {
        const hIdx = colMap["height"].charCodeAt(0) - 65;
        if (hIdx > 0) colMap["width"] = String.fromCharCode(65 + hIdx - 1);
      }

      const parseNum = (s: string) => { if (!s) return 0; return parseFloat(s.replace(",", ".").replace(/[^\d.eE+\-]/g, "")) || 0; };
      const itemCol = colMap["item"]!;
      const itemColIdx = itemCol.charCodeAt(0) - 65;
      const groupCol = itemColIdx > 0 ? String.fromCharCode(65 + itemColIdx - 1) : null;

      let currentGroup = "";
      const items: any[] = [];
      const numRows = Math.max(...Object.keys(rows).map(Number));

      for (let r = headerRow + 1; r <= numRows; r++) {
        const row = rows[r];
        if (!row) continue;
        if (groupCol && row[groupCol]) currentGroup = row[groupCol];
        const itemVal = colMap["item"] ? (row[colMap["item"]] || "").trim() : "";
        const qtyStr  = colMap["qty"]  ? (row[colMap["qty"]]  || "").trim() : "";
        if (!itemVal) continue;
        const qty = parseInt(qtyStr) || 0;
        if (qty === 0) continue;

        const matVal = colMap["material"] ? (row[colMap["material"]] || "").trim() : "";
        const finVal = colMap["finish"]   ? (row[colMap["finish"]]   || "").trim() : "";
        const wVal   = colMap["width"]    ? (row[colMap["width"]]    || "").trim() : "";
        const hVal   = colMap["height"]   ? (row[colMap["height"]]   || "").trim() : "";
        const fwVal  = colMap["fileW"]    ? (row[colMap["fileW"]]    || "").trim() : "";
        const fhVal  = colMap["fileH"]    ? (row[colMap["fileH"]]    || "").trim() : "";
        const fileSizeVal = colMap["fileSize"] ? (row[colMap["fileSize"]] || "").trim() : "";
        const obsVal = colMap["obs"]      ? (row[colMap["obs"]]      || "").trim() : "";

        const visualW = parseNum(wVal);
        const visualH = parseNum(hVal);
        let fileW = parseNum(fwVal) || visualW;
        let fileH = parseNum(fhVal) || visualH;
        if (fileSizeVal && (!fileW || !fileH)) {
          const parts = fileSizeVal.replace(/,/g, ".").replace(/\s/g, "").split(/[xX×]/);
          if (parts.length >= 2) { fileW = parseFloat(parts[0]) || fileW; fileH = parseFloat(parts[1]) || fileH; }
        }

        const cap = (s: string) => s ? (s.charAt(0).toUpperCase() + s.slice(1)) : s;
        items.push({
          type: currentGroup || itemVal,
          description: itemVal,
          quantity: qty,
          visualWidth: visualW || null,
          visualHeight: visualH || null,
          fileWidth: fileW || null,
          fileHeight: fileH || null,
          calculatedM2: fileW && fileH ? qty * fileW * fileH : 0,
          material: cap(matVal) || "Lona",
          finish: cap(finVal) || "Ilhós",
          measurement: fileW && fileH ? `${fileW.toFixed(2)} × ${fileH.toFixed(2)}` : (visualW && visualH ? `${visualW.toFixed(2)} × ${visualH.toFixed(2)}` : ""),
          observations: obsVal,
        });
      }

      if (items.length === 0) return res.status(400).json({ error: "Nenhum item válido encontrado. Verifique se há linhas com quantidade > 0." });
      res.json({ items, fileName: file.originalname });
    } catch (error: any) {
      console.error("[preview-xlsx] unhandled error:", error.message, error.stack?.slice(0, 600));
      res.status(400).json({ error: error.message || "Erro ao processar arquivo" });
    }
  });

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  app.post("/api/events/:id/confirm-import", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const { items, fileName } = req.body as { items: any[]; fileName?: string };
      if (!items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ error: "Nenhum item para importar" });

      const toCreate = items.map((item: any) => ({
        eventId: event.id,
        type: item.type,
        description: item.description,
        quantity: Number(item.quantity),
        area: Number(item.visualWidth) || Number(item.fileWidth) || 0,
        visual: Number(item.visualHeight) || Number(item.fileHeight) || 0,
        visualWidth: item.visualWidth !== null && item.visualWidth !== undefined ? Number(item.visualWidth) : null,
        visualHeight: item.visualHeight !== null && item.visualHeight !== undefined ? Number(item.visualHeight) : null,
        fileWidth: item.fileWidth !== null && item.fileWidth !== undefined ? Number(item.fileWidth) : null,
        fileHeight: item.fileHeight !== null && item.fileHeight !== undefined ? Number(item.fileHeight) : null,
        calculatedM2: Number(item.calculatedM2) || 0,
        material: item.material || "Lona",
        finish: item.finish || "Ilhós",
        measurement: item.measurement || "",
        observations: item.observations || "",
        status: "requested",
      }));

      const validated = toCreate.map((item, i) => {
        try { return insertItemSchema.parse(item); }
        catch (e: any) { throw new Error(`Item ${i + 1} (${item.description}): ${e.message}`); }
      });

      const created = await storage.createBulkItems(validated);

      // Link suggested sponsors when provided (supports multiple sponsors per item)
      const sponsorLinks: Promise<any>[] = [];
      for (let i = 0; i < created.length; i++) {
        const raw = items[i];
        // Support both old suggestedSponsorId (string) and new suggestedSponsorIds (array)
        const ids: string[] = raw?.suggestedSponsorIds?.length
          ? raw.suggestedSponsorIds
          : (raw?.suggestedSponsorId ? [raw.suggestedSponsorId] : []);
        for (const sponsorId of ids) {
          if (sponsorId && typeof sponsorId === 'string') {
            sponsorLinks.push(
              storage.addSponsorToItem({ itemId: created[i].id, sponsorId }).catch(() => {})
            );
          }
        }
      }
      if (sponsorLinks.length > 0) await Promise.all(sponsorLinks);

      await createAuditLog(
        (req as any).userName, 'created', 'item', event.id,
        `${created.length} itens importados via Excel${fileName ? ` ("${fileName}")` : ""}`
      );
      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens importados via Excel — Evento: ${event.name}`,
        eventId: event.id,
        targetRoles: ["arte", "grafica"],
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: event.id });
      await updateEventStatus(event.id);

      res.status(201).json({ imported: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Clone items from another event ───────────────────────────────────────
  app.post("/api/events/:id/clone-items", async (req, res) => {
    try {
      const targetEvent = await storage.getEvent(req.params.id);
      if (!targetEvent) return res.status(404).json({ error: "Evento destino não encontrado" });

      const { sourceEventId } = req.body as { sourceEventId: string };
      if (!sourceEventId) return res.status(400).json({ error: "sourceEventId é obrigatório" });

      const sourceEvent = await storage.getEvent(sourceEventId);
      if (!sourceEvent) return res.status(404).json({ error: "Evento origem não encontrado" });

      const sourceItems = await storage.getItemsByEvent(sourceEventId);
      if (sourceItems.length === 0) {
        return res.status(400).json({ error: "O evento de origem não tem itens para clonar" });
      }

      const cloned = sourceItems.map(item => ({
        eventId: targetEvent.id,
        type: item.type,
        description: item.description || "",
        quantity: item.quantity,
        area: item.area,
        visual: item.visual,
        visualWidth: item.visualWidth,
        visualHeight: item.visualHeight,
        fileWidth: item.fileWidth,
        fileHeight: item.fileHeight,
        material: item.material,
        finish: item.finish,
        measurement: item.measurement,
        observations: item.observations || "",
        calculatedM2: item.calculatedM2,
        status: "requested" as const,
        isReuse: item.isReuse || false,
      }));

      const validated = cloned.map((item, i) => {
        try {
          return insertItemSchema.parse(item);
        } catch (e: any) {
          throw new Error(`Item ${i + 1} (${item.type}): ${e.message}`);
        }
      });

      const created = await storage.createBulkItems(validated);

      await createAuditLog(
        (req as any).userName,
        'created',
        'item',
        targetEvent.id,
        `${created.length} itens clonados do evento "${sourceEvent.name}"`
      );

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens clonados de "${sourceEvent.name}" → "${targetEvent.name}"`,
        eventId: targetEvent.id,
        targetRoles: ["arte", "grafica"],
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: targetEvent.id });
      await updateEventStatus(targetEvent.id);

      res.status(201).json({ cloned: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update item
  app.patch("/api/items/:id", async (req, res) => {
    try {
      const validatedData = insertItemSchema.partial().parse(req.body);

      // Normalize referenceUrl from raw GCS URL to /objects/ proxy path
      if (validatedData.referenceUrl) {
        const { ObjectStorageService } = await import("./objectStorage");
        const objectStorageService = new ObjectStorageService();
        validatedData.referenceUrl = objectStorageService.normalizeObjectEntityPath(validatedData.referenceUrl);
      }

      // Pegar item atual antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const item = await storage.updateItem(req.params.id, validatedData);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Create audit log - build descriptive diff of changed fields
      const changedParts: string[] = [];

      if (item.status !== currentItem.status) {
        changedParts.push(`Status: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`);
      }
      if ('isReuse' in validatedData && item.isReuse !== currentItem.isReuse) {
        changedParts.push(item.isReuse ? "Marcado para reaproveitamento" : "Reaproveitamento removido");
      }
      if ('quantity' in validatedData && item.quantity !== currentItem.quantity) {
        changedParts.push(`Quantidade: ${currentItem.quantity ?? '—'} → ${item.quantity ?? '—'}`);
      }
      if ('type' in validatedData && item.type !== currentItem.type) {
        changedParts.push(`Tipo: ${currentItem.type ?? '—'} → ${item.type ?? '—'}`);
      }
      if ('material' in validatedData && item.material !== currentItem.material) {
        changedParts.push(`Material: ${currentItem.material ?? '—'} → ${item.material ?? '—'}`);
      }
      if ('finish' in validatedData && item.finish !== currentItem.finish) {
        changedParts.push(`Acabamento: ${currentItem.finish ?? '—'} → ${item.finish ?? '—'}`);
      }
      if ('fileWidth' in validatedData || 'fileHeight' in validatedData) {
        if (item.fileWidth !== currentItem.fileWidth || item.fileHeight !== currentItem.fileHeight) {
          changedParts.push(`Dimensões: ${currentItem.fileWidth ?? '?'}×${currentItem.fileHeight ?? '?'} → ${item.fileWidth ?? '?'}×${item.fileHeight ?? '?'}`);
        }
      }
      if ('observations' in validatedData && item.observations !== currentItem.observations) {
        changedParts.push("Observações atualizadas");
      }
      if ('approvalThumbUrl' in validatedData && item.approvalThumbUrl !== currentItem.approvalThumbUrl) {
        changedParts.push("Thumb de aprovação atualizado");
      }
      if ('finalFileUrl' in validatedData && item.finalFileUrl !== currentItem.finalFileUrl) {
        changedParts.push("Arquivo final atualizado");
      }
      if ('referenceUrl' in validatedData && item.referenceUrl !== currentItem.referenceUrl) {
        changedParts.push("Referência de arte atualizada");
      }
      if ('skipApproval' in validatedData && item.skipApproval !== currentItem.skipApproval) {
        changedParts.push(item.skipApproval ? "Aprovação de patrocinador dispensada" : "Aprovação de patrocinador reativada");
      }

      const auditDetails = changedParts.length > 0
        ? changedParts.join(" | ")
        : `Item "${item.type}" atualizado`;
      
      await createAuditLog(
        (req as any).userName,
        'updated',
        'item',
        item.id,
        auditDetails
      );
      
      // Recalculate event status if item status changed
      await updateEventStatus(item.eventId);
      
      broadcast({ type: "item_updated", item });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete item
  app.delete("/api/items/:id", async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const success = await storage.deleteItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'item',
        req.params.id,
        `Item "${item.type}" excluído`
      );
      
      broadcast({ type: "item_deleted", itemId: req.params.id, eventId: item.eventId });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Submit item for sponsor approval (Arte module)
  app.patch("/api/items/:id/submit-for-approval", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar para aprovação" });
      }
      
      const { approvalThumbUrl } = req.body;
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Only items that passed through vincular-patrocinadores (awaiting_submission) can be worked on
      if (currentItem.status !== "awaiting_submission") {
        return res.status(409).json({ 
          error: `Item não pode ser enviado para aprovação. Status atual: ${currentItem.status}. O item precisa passar pelo fluxo de Vincular Patrocinadores antes.`
        });
      }
      
      if (!approvalThumbUrl) {
        return res.status(400).json({ error: "approvalThumbUrl is required" });
      }
      
      // Check if item has sponsors linked
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      const hasSponsors = itemSponsors.length > 0;
      
      // Determine next status:
      // 1. If skipApproval is true → awaiting_creator_review
      // 2. If has sponsors → awaiting_sponsor_approval
      // 3. If no sponsors → awaiting_creator_review (skip sponsor approval)
      const shouldSkipApproval = currentItem.skipApproval === true || !hasSponsors;
      const nextStatus = shouldSkipApproval ? "awaiting_creator_review" : "awaiting_sponsor_approval";
      
      // If resubmitting after rejection (awaiting_submission) and going to sponsor approval,
      // reset all sponsor approval records back to 'pending' so Atendimento can re-review
      if (currentItem.status === "awaiting_submission" && nextStatus === "awaiting_sponsor_approval") {
        const existingApprovals = await storage.getItemSponsorApprovals(req.params.id);
        for (const approval of existingApprovals) {
          // Reset any non-approved status back to pending
          if (['awaiting_arte', 'new_version_pending', 'rejected'].includes(approval.status)) {
            await storage.updateItemSponsorApproval(approval.id, {
              status: 'pending',
              approvedBy: null,
              approvedAt: null,
              rejectedBy: null,
              rejectedAt: null,
              rejectionReason: null,
            });
          }
        }
      }

      const itemUpdates: any = { 
        status: nextStatus,
        // Limpa flag de reprovação pelo criador quando item é reenviado
        // rejectedBySponsor permanece até ser aprovado pelo patrocinador novamente
        rejectedByCreator: false,
      };
      if (approvalThumbUrl) {
        itemUpdates.approvalThumbUrl = approvalThumbUrl;
      }
      
      const item = await storage.updateItem(req.params.id, itemUpdates);
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      if (shouldSkipApproval) {
        // Pula aprovação do patrocinador e vai direto para revisão da Solicitação
        await createAuditLog(
          req.userName!,
          'updated',
          'item',
          item.id,
          `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)} (sem aprovação de patrocinador)`
        );
        
        // Notifica Solicitação para revisar
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando revisão da Solicitação: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["solicitacao"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      } else {
        // Fluxo padrão: vai para aprovação do patrocinador
        
        // Inicializar registros de aprovação para cada patrocinador
        await storage.initializeItemSponsorApprovals(
          req.params.id, 
          itemSponsors.map(s => s.sponsorId)
        );
        
        await createAuditLog(
          req.userName!,
          'updated',
          'item',
          item.id,
          `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)}`
        );
        
        // Notifica Atendimento para aprovar com patrocinador
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando aprovação do patrocinador: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["atendimento"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Sponsor approves item (Atendimento module)
  app.patch("/api/items/:id/sponsor-approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ 
          error: `Item não pode ser aprovado pelo patrocinador. Status atual: ${currentItem.status}, esperado: awaiting_sponsor_approval` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "sponsor_approved",
        sponsorApprovedBy: req.userName,
        sponsorApprovedAt: new Date(),
        // Limpa flag de reprovação pelo patrocinador quando aprovado
        rejectedBySponsor: false,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req.userName!,
        'approved',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")} (aprovado pelo patrocinador)`
      );
      
      // Notifica Arte para finalizar o layout e adicionar arquivo final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Patrocinador aprovou o item. Finalize o layout e adicione o arquivo final: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte dispenses item (bypasses remaining approval steps → pronto_para_producao)
  app.patch("/api/items/:id/dispense", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem dispensar itens" });
      }
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Item not found" });
      const dispensableStatuses = ["awaiting_submission", "awaiting_sponsor_approval", "sponsor_approved"];
      if (!dispensableStatuses.includes(currentItem.status)) {
        return res.status(409).json({ error: `Item não pode ser dispensado no status atual: ${currentItem.status}` });
      }
      const { reason } = req.body;
      await storage.updateItem(req.params.id, { status: "pronto_para_producao" });
      await createAuditLog(
        req.userName || "Sistema",
        "dispensed",
        "item",
        req.params.id,
        `Peça dispensada pela Arte. Status anterior: ${currentItem.status}${reason ? `. Motivo: ${reason}` : ''}`
      );
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sponsor rejects item (Atendimento module)
  app.patch("/api/items/:id/sponsor-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem reprovar pelo patrocinador" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ 
          error: `Item não pode ser reprovado pelo patrocinador. Status atual: ${currentItem.status}, esperado: awaiting_sponsor_approval` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_submission",
        sponsorApprovedBy: null,
        sponsorApprovedAt: null,
        rejectedBySponsor: true, // Flag indicando que foi reprovado pelo patrocinador
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req.userName!,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_submission")} (reprovado pelo patrocinador)`
      );
      
      // Notifica Arte para refazer o trabalho
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Patrocinador reprovou o item. Refaça o thumb de aprovação: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== Individual Sponsor Approval Endpoints ==========
  
  // Get sponsor approvals for an item
  app.get("/api/items/:id/sponsor-approvals", requireAuth, async (req, res) => {
    try {
      const approvals = await storage.getItemSponsorApprovals(req.params.id);
      
      // Enrich with sponsor names
      const sponsors = await storage.getAllSponsors();
      const sponsorMap = new Map(sponsors.map(s => [s.id, s]));
      
      const enrichedApprovals = approvals.map(approval => ({
        ...approval,
        sponsor: sponsorMap.get(approval.sponsorId) || null
      }));
      
      res.json(enrichedApprovals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Individual sponsor approves item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ 
          error: `Item não está aguardando aprovação do patrocinador. Status atual: ${currentItem.status}` 
        });
      }
      
      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }
      
      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      // Prevent approving a sponsor that is waiting for Arte to resubmit
      if (approval && approval.status === 'awaiting_arte') {
        return res.status(409).json({ error: "Aguardando nova versão da Arte para este patrocinador. Não é possível aprovar agora." });
      }
      
      if (approval) {
        // Update existing approval
        approval = await storage.updateItemSponsorApproval(approval.id, {
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          itemId,
          sponsorId,
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
        });
      }
      
      // Get sponsor name for audit log
      const sponsor = await storage.getSponsor(sponsorId);
      
      await createAuditLog(
        req.userName!,
        'approved',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" aprovou o item`
      );
      
      // Check if ALL sponsors have approved
      const allApprovals = await storage.getItemSponsorApprovals(itemId);
      const allApproved = itemSponsors.every(is => {
        const sponsorApproval = allApprovals.find(a => a.sponsorId === is.sponsorId);
        return sponsorApproval && sponsorApproval.status === 'approved';
      });
      
      if (allApproved) {
        // All sponsors approved - advance item status
        const item = await storage.updateItem(itemId, {
          status: "sponsor_approved",
          sponsorApprovedBy: req.userName,
          sponsorApprovedAt: new Date(),
          rejectedBySponsor: false,
        });
        
        const event = await storage.getEvent(currentItem.eventId);
        
        await createAuditLog(
          req.userName!,
          'approved',
          'item',
          itemId,
          `Todos os patrocinadores aprovaram. Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")}`
        );
        
        // Notify Arte to add final file
        const notification = await storage.createNotification({
          type: "arteApproved",
          message: `Todos os patrocinadores aprovaram. Finalize o layout e adicione o arquivo final: ${currentItem.type} - Evento: ${event?.name}`,
          eventId: currentItem.eventId,
          itemId: itemId,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
        
        res.json({ approval, item, allApproved: true });
      } else {
        // Not all sponsors approved yet
        broadcast({ type: "sponsor_approval_updated", itemId, approval });
        res.json({ approval, allApproved: false });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Individual sponsor rejects item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem reprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      const { rejectionReason } = req.body;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ 
          error: `Item não está aguardando aprovação do patrocinador. Status atual: ${currentItem.status}` 
        });
      }
      
      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }
      
      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);
      
      if (approval) {
        // Update existing approval
        approval = await storage.updateItemSponsorApproval(approval.id, {
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
          approvedBy: null,
          approvedAt: null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          itemId,
          sponsorId,
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
        });
      }
      
      // Get sponsor name for audit log and notification
      const sponsor = await storage.getSponsor(sponsorId);
      const event = await storage.getEvent(currentItem.eventId);
      
      // Item stays in awaiting_sponsor_approval — only leaves when ALL sponsors approve
      const item = (await storage.updateItem(itemId, {
        rejectedBySponsor: true,
      }))!;
      
      await createAuditLog(
        req.userName!,
        'rejected',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" reprovou o item. Item aguarda nova versão da Arte${rejectionReason ? `. Motivo: ${rejectionReason}` : ''}`
      );
      
      // Notify Arte to prepare a new version for this sponsor
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Patrocinador "${sponsor?.name}" reprovou. Envie nova arte para: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "notification_created", notification });
      
      res.json({ 
        approval, 
        item, 
        message: `Reprovação registrada. Item aguarda nova arte para o patrocinador.`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte submits new version for specific sponsors (correção)
  app.post("/api/items/:id/sponsor-approvals/resubmit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar nova versão" });
      }

      const { id: itemId } = req.params;
      const { newThumbUrl, sponsorIds } = req.body as { newThumbUrl: string; sponsorIds: string[] };

      if (!newThumbUrl) {
        return res.status(400).json({ error: "newThumbUrl é obrigatório" });
      }
      if (!sponsorIds || sponsorIds.length === 0) {
        return res.status(400).json({ error: "Selecione pelo menos um patrocinador" });
      }

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ error: "Item não está aguardando aprovação do patrocinador" });
      }

      // Update each selected sponsor approval: awaiting_arte → new_version_pending
      for (const sponsorId of sponsorIds) {
        const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
        if (approval && approval.status === "awaiting_arte") {
          await storage.updateItemSponsorApproval(approval.id, {
            status: "new_version_pending",
          });
        }
      }

      // Update item thumb with the new version
      const item = await storage.updateItem(itemId, {
        approvalThumbUrl: newThumbUrl,
        rejectedBySponsor: false,
      });

      const event = await storage.getEvent(currentItem.eventId);

      await createAuditLog(
        req.userName!,
        'updated',
        'item',
        itemId,
        `Arte enviou nova versão do thumb para ${sponsorIds.length} patrocinador(es). Aguarda revisão do Atendimento.`
      );

      // Notify Atendimento
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Nova versão de arte enviada. Revise o thumb: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["atendimento"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      res.json({ item, message: "Nova versão enviada. Atendimento notificado." });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Initialize sponsor approvals when sending item for approval
  app.post("/api/items/:id/initialize-sponsor-approvals", requireAuth, async (req, res) => {
    try {
      const itemId = req.params.id;
      
      // Get item sponsors
      const itemSponsors = await storage.getItemSponsors(itemId);
      
      if (itemSponsors.length === 0) {
        return res.status(400).json({ error: "Item não possui patrocinadores vinculados" });
      }
      
      // Initialize approval records for all sponsors
      await storage.initializeItemSponsorApprovals(
        itemId, 
        itemSponsors.map(s => s.sponsorId)
      );
      
      const approvals = await storage.getItemSponsorApprovals(itemId);
      
      res.json(approvals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== End Individual Sponsor Approval Endpoints ==========

  // Arte submits final file after sponsor approval
  app.patch("/api/items/:id/submit-final-file", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar arquivo final" });
      }
      
      // Validate request body with Zod
      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio"),
      });
      
      const validatedData = finalFileSchema.parse(req.body);
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "sponsor_approved") {
        return res.status(409).json({ 
          error: `Item não pode receber arquivo final. Status atual: ${currentItem.status}, esperado: sponsor_approved` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        finalFileUrl: validatedData.finalFileUrl,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req.userName!,
        'updated',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_final_review")} (arquivo final adicionado)`
      );
      
      // Notifica Solicitação para revisão final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Arquivo final pronto para revisão: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator reviews and releases item for production (Solicitação module)
  app.patch("/api/items/:id/creator-review", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem revisar como criador do evento" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({ 
          error: `Item não pode ser revisado pelo criador. Status atual: ${currentItem.status}, esperado: awaiting_final_review` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "ready_for_production",
        creatorReviewedAt: new Date(),
        hasModifiedData: false, // Reset flag - Gráfica vê como dados novos
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req.userName!,
        'approved',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (liberado para produção)`
      );
      
      // Notifica Arte e Gráfica que o item está liberado para produção
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Criador do evento liberou item para produção: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte", "grafica"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator rejects item and sends back to Arte (Solicitação module)
  app.patch("/api/items/:id/creator-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem reprovar itens" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({ 
          error: `Item não pode ser reprovado pelo criador. Status atual: ${currentItem.status}, esperado: awaiting_final_review` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_submission",
        creatorReviewedAt: null,
        finalFileUrl: null,
        approvalThumbUrl: null,
        // Mantém sponsorApprovedBy/sponsorApprovedAt para preservar o contexto da aprovação anterior
        rejectedByCreator: true, // Flag indicando que foi reprovado pelo criador
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req.userName!,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_submission")} (reprovado pelo criador)`
      );
      
      // Notifica Arte para refazer o trabalho
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador do evento reprovou o item. Refaça o thumb de aprovação: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator returns item to Arte with modification notes (Solicitação module)
  app.patch("/api/items/:id/return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem devolver itens" });
      }
      
      const { notes } = req.body;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({ error: `Item não pode ser devolvido. Status atual: ${currentItem.status}` });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_submission",
        creatorReviewedAt: null,
        finalFileUrl: null,
        approvalThumbUrl: null,
        rejectedByCreator: true,
        observations: notes || currentItem.observations,
        hasModifiedData: true, // Flag: Arte precisa revisar dados modificados
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      const detailMsg = notes ? ` Observações: ${notes}` : "";
      const modifiedDataMsg = currentItem.hasModifiedData ? " ⚠️ DADOS MODIFICADOS: Verifique Quantidade, m² Total e Medida!" : "";
      
      await createAuditLog(
        req.userName!,
        'rejected',
        'item',
        item.id,
        `Item devolvido para Arte para modificações.${detailMsg}${modifiedDataMsg}`
      );
      
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador devolveu item para modificações: ${item.type} - Evento: ${event?.name}${detailMsg}${modifiedDataMsg}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk return to Arte with notes
  app.patch("/api/items/bulk-return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem devolver itens" });
      }
      
      const { itemIds, notes } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results = [];
      const errors = [];
      
      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Item não encontrado" });
          continue;
        }
        
        if (currentItem.status !== "awaiting_final_review") {
          errors.push({ itemId, error: `Status inválido: ${currentItem.status}` });
          continue;
        }
        
        const item = await storage.updateItem(itemId, {
          status: "awaiting_submission",
          creatorReviewedAt: null,
          finalFileUrl: null,
          approvalThumbUrl: null,
          rejectedByCreator: true,
          observations: notes || currentItem.observations,
        });
        
        if (item) {
          results.push(item);
          await createAuditLog(
            req.userName!,
            'rejected',
            'item',
            item.id,
            `Item devolvido para Arte para modificações (em lote).`
          );
          broadcast({ type: "item_updated", item });
        }
      }
      
      if (results.length > 0) {
        const detailMsg = notes ? ` Observações: ${notes}` : "";
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Criador devolveu ${results.length} item(ns) para modificações.${detailMsg}`,
          eventId: results[0].eventId,
          itemId: null,
          targetRoles: ["arte"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json({ success: results.length, errors: errors.length, items: results, failedItemIds: errors.map(e => e.itemId) });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Cancel item (item disappears from workflow but stays in events)
  app.patch("/api/items/:id/cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { notes } = req.body;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "canceled",
        observations: notes || currentItem.observations,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const detailMsg = notes ? ` Motivo: ${notes}` : "";
      await createAuditLog(
        req.userName!,
        'canceled',
        'item',
        item.id,
        `Item cancelado${detailMsg}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk cancel items
  app.patch("/api/items/bulk-cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { itemIds, notes } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results = [];
      
      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) continue;
        
        const item = await storage.updateItem(itemId, { 
          status: "canceled",
          observations: notes || currentItem.observations,
        });
        if (item) {
          results.push(item);
          const detailMsg = notes ? ` Motivo: ${notes}` : "";
          await createAuditLog(req.userName!, 'canceled', 'item', item.id, `Item cancelado (em lote)${detailMsg}`);
          broadcast({ type: "item_updated", item });
        }
      }
      
      res.json({ canceled: results.length, items: results });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update item fields (Solicitação module - can edit)
  app.patch("/api/items/:id/edit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem editar itens" });
      }
      
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const { type, quantity, description, fileWidth, fileHeight, material, finish, calculatedM2, measurement } = req.body;
      
      const item = await storage.updateItem(req.params.id, {
        type: type || currentItem.type,
        quantity: quantity !== undefined ? quantity : currentItem.quantity,
        description: description !== undefined ? description : currentItem.description,
        fileWidth: fileWidth !== undefined ? fileWidth : currentItem.fileWidth,
        fileHeight: fileHeight !== undefined ? fileHeight : currentItem.fileHeight,
        material: material || currentItem.material,
        finish: finish || currentItem.finish,
        calculatedM2: calculatedM2 !== undefined ? calculatedM2 : currentItem.calculatedM2,
        measurement: measurement !== undefined ? measurement : currentItem.measurement,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const editDetails = [];
      if (type && type !== currentItem.type) editDetails.push(`Tipo: ${currentItem.type} → ${type}`);
      if (material && material !== currentItem.material) editDetails.push(`Material: ${currentItem.material} → ${material}`);
      if (finish && finish !== currentItem.finish) editDetails.push(`Acabamento: ${currentItem.finish} → ${finish}`);
      if (quantity !== undefined && quantity !== currentItem.quantity) editDetails.push(`Quantidade: ${currentItem.quantity} → ${quantity}`);
      if (calculatedM2 !== undefined && calculatedM2 !== currentItem.calculatedM2) editDetails.push(`m² Total: ${currentItem.calculatedM2} → ${calculatedM2}`);
      if (measurement !== undefined && measurement !== currentItem.measurement) editDetails.push(`Medida: ${currentItem.measurement} → ${measurement}`);
      
      await createAuditLog(
        req.userName!,
        'updated',
        'item',
        item.id,
        `Item editado${editDetails.length > 0 ? ': ' + editDetails.join(', ') : ''}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk creator reject (Solicitação module)
  app.patch("/api/items/bulk-creator-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem reprovar itens" });
      }
      
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results = [];
      const errors = [];
      
      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Item não encontrado" });
          continue;
        }
        
        if (currentItem.status !== "awaiting_final_review") {
          errors.push({ itemId, error: `Status inválido: ${currentItem.status}` });
          continue;
        }
        
        const item = await storage.updateItem(itemId, {
          status: "awaiting_submission",
          creatorReviewedAt: null,
          finalFileUrl: null,
          approvalThumbUrl: null,
          // Mantém sponsorApprovedBy/sponsorApprovedAt para preservar o contexto da aprovação anterior
          rejectedByCreator: true,
        });
        
        if (item) {
          results.push(item);
          
          const event = await storage.getEvent(item.eventId);
          
          await createAuditLog(
            req.userName!,
            'rejected',
            'item',
            item.id,
            `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_submission")} (reprovado pelo criador em lote)`
          );
          
          broadcast({ type: "item_updated", item });
        }
      }
      
      // Notifica Arte uma vez para todos os itens
      if (results.length > 0) {
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Criador reprovou ${results.length} item(ns). Refaça os thumbs de aprovação.`,
          eventId: results[0].eventId,
          itemId: null,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "notification_created", notification });
      }
      
      // Extrair apenas os IDs dos itens com erro
      const failedItemIds = errors.map(e => e.itemId);
      
      res.json({ 
        success: results.length, 
        errors: errors.length,
        items: results,
        failedItemIds,
        errorDetails: errors
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Approve item (Arte module) - DEPRECATED: Use new approval workflow
  app.patch("/api/items/:id/approve", async (req, res) => {
    try {
      const item = await storage.approveItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'approved',
        'item',
        item.id,
        `Item "${item.type}" aprovado para produção`
      );
      
      // Liberação pela Arte - notifica apenas Gráfica
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Item liberado para produção: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
      });
      
      broadcast({ type: "item_approved", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Start production (Gráfica module)
  app.patch("/api/items/:id/start-production", async (req, res) => {
    try {
      const { quantityProduced } = req.body;
      
      if (!quantityProduced || quantityProduced <= 0) {
        return res.status(400).json({ error: "quantityProduced is required and must be greater than 0" });
      }
      
      const item = await storage.startProduction(req.params.id, quantityProduced);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);

      // Auto-add to inventory when fully produced — N individual records
      if (item.status === 'produced') {
        const existingAssets = await storage.getAssetsByOriginalItemId(item.id);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        // Get sponsors linked to this item
        const itemSponsorLinks = await storage.getItemSponsors(item.id);
        const linkedSponsorIds = itemSponsorLinks.map(s => s.sponsorId);
        // Get approvalThumbUrl from item
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        // Extract numeric part from item displayId (e.g. "#0062" → "0062")
        const itemNum = item.displayId.replace(/[^0-9]/g, '').padStart(4, '0');

        const producedBy = (req as any).userName || 'Gráfica';
        if (existingAssets.length === 0) {
          // Create N individual records (1 per unit)
          const records = Array.from({ length: quantityProduced }, (_, i) => ({
            displayId: `#EST-${itemNum}-${i + 1}`,
            name: itemName,
            quantity: 1,
            originalItemId: item.id,
            condition: "PERFEITO" as const,
            location: null,
            franchiseTags,
            sponsorIds: linkedSponsorIds,
            approvalThumbUrl,
            trackingStatus: "NO_GALPAO" as const,
            notes: `Gráfica — Evento: ${event?.name ?? '—'}`,
            autoAdded: true,
          }));
          const created = await storage.createInventoryAssets(records);
          for (const a of created) {
            await createAuditLog(producedBy, 'cadastrado', 'inventory_asset', a.id,
              JSON.stringify({ evento: event?.name ?? '—', itemId: item.id }));
          }
        } else if (existingAssets.length < quantityProduced) {
          // Add missing units
          const currentMax = existingAssets.length;
          const additional = Array.from({ length: quantityProduced - currentMax }, (_, i) => ({
            displayId: `#EST-${itemNum}-${currentMax + i + 1}`,
            name: itemName,
            quantity: 1,
            originalItemId: item.id,
            condition: "PERFEITO" as const,
            location: null,
            franchiseTags,
            sponsorIds: linkedSponsorIds,
            approvalThumbUrl,
            trackingStatus: "NO_GALPAO" as const,
            notes: `Gráfica — Evento: ${event?.name ?? '—'}`,
            autoAdded: true,
          }));
          const created = await storage.createInventoryAssets(additional);
          for (const a of created) {
            await createAuditLog(producedBy, 'cadastrado', 'inventory_asset', a.id,
              JSON.stringify({ evento: event?.name ?? '—', itemId: item.id }));
          }
        }
        // Run lifecycle cron immediately so assets with past event dates
        // transition straight to EM_USO / AGUARDANDO_TRIAGEM without waiting for the next tick.
        runInventoryCron();
      }
      
      // Não notificar sobre início de produção
      
      broadcast({ type: "production_started", item });
      
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark item as delivered (Gráfica module)
  app.patch("/api/items/:id/deliver", async (req, res) => {
    try {
      const { receivedBy, photoUrl } = req.body;
      
      if (!receivedBy) {
        return res.status(400).json({ error: "receivedBy is required" });
      }
      
      // Pegar status anterior antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const item = await storage.markItemAsDelivered(req.params.id, receivedBy, photoUrl);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'delivered',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("delivered")} (Recebido por: ${receivedBy})`
      );
      
      // Recalculate event status - might become "completed"
      const previousStatus = event?.status;
      await updateEventStatus(item.eventId);
      
      // Verificar se evento foi concluído agora - notificar Solicitação
      const updatedEvent = await storage.getEvent(item.eventId);
      if (previousStatus !== "completed" && updatedEvent?.status === "completed") {
        const notification = await storage.createNotification({
          type: "eventCompleted",
          message: `Evento concluído: ${event?.name} - Todos os itens foram entregues`,
          eventId: item.eventId,
          targetRoles: ["solicitacao"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      broadcast({ type: "item_delivered", item });
      
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update production (Gráfica module)
  app.post("/api/items/:id/production", async (req, res) => {
    try {
      const validatedData = insertProductionUpdateSchema.parse(req.body);
      const productionUpdate = await storage.createProductionUpdate({
        ...validatedData,
        itemId: req.params.id,
      });
      
      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Update item status based on quantity produced
      let newStatus = item.status;
      if (validatedData.quantityProduced >= parseInt(item.quantity.toString())) {
        newStatus = "produced";
      } else if (validatedData.quantityProduced > 0) {
        newStatus = "inProduction";
      }

      const updatedItem = await storage.updateItem(req.params.id, { status: newStatus });
      
      const event = await storage.getEvent(item.eventId);
      
      // Não notificar sobre atualizações de produção
      
      broadcast({ type: "production_updated", item: updatedItem, update: productionUpdate });
      
      res.json({ item: updatedItem, update: productionUpdate });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ STANDARD ITEMS ============

  app.get("/api/standard-items", async (req, res) => {
    try {
      const items = await storage.getAllStandardItems();
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/standard-items", async (req, res) => {
    try {
      const validatedData = insertStandardItemSchema.parse(req.body);
      const item = await storage.createStandardItem(validatedData);
      
      broadcast({ type: "standard_item_created", item });
      
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Rename all standard items in a group
  app.patch("/api/standard-items/rename-group", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemGroup(oldName, newName.trim());
      broadcast({ type: "standard_item_group_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a group from all standard items
  app.delete("/api/standard-items/clear-group", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemGroup(name);
      broadcast({ type: "standard_item_group_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Rename a finish across all standard items
  app.patch("/api/standard-items/rename-finish", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemFinish(oldName, newName.trim());
      broadcast({ type: "standard_item_finish_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a finish from all standard items
  app.delete("/api/standard-items/clear-finish", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemFinish(name);
      broadcast({ type: "standard_item_finish_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Rename a material across all standard items
  app.patch("/api/standard-items/rename-material", async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemMaterial(oldName, newName.trim());
      broadcast({ type: "standard_item_material_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a material from all standard items
  app.delete("/api/standard-items/clear-material", async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemMaterial(name);
      broadcast({ type: "standard_item_material_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update standard item
  app.patch("/api/standard-items/:id", async (req, res) => {
    try {
      const validatedData = insertStandardItemSchema.partial().parse(req.body);
      const item = await storage.updateStandardItem(req.params.id, validatedData);
      
      if (!item) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'standardItem',
        req.params.id,
        `Modelo "${item.name}" atualizado`
      );
      
      broadcast({ type: "standard_item_updated", item });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete standard item
  app.delete("/api/standard-items/:id", async (req, res) => {
    try {
      const item = await storage.getStandardItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }
      
      await storage.deleteStandardItem(req.params.id);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'standardItem',
        req.params.id,
        `Modelo "${item.name}" excluído`
      );
      
      broadcast({ type: "standard_item_deleted", itemId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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

  app.patch("/api/notifications/:id/read", async (req, res) => {
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

  // ============ COMMENTS ============
  
  // Get comments for an item
  app.get("/api/items/:itemId/comments", async (req, res) => {
    try {
      const comments = await storage.getComments(req.params.itemId);
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a comment
  app.post("/api/items/:itemId/comments", async (req, res) => {
    try {
      // Buscar item para pegar o status atual
      const item = await storage.getItem(req.params.itemId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const validatedData = insertCommentSchema.parse({
        ...req.body,
        itemId: req.params.itemId,
        itemStatus: item.status, // Captura o status atual do item
      });
      
      const comment = await storage.createComment(validatedData);
      
      // Broadcast new comment to all connected clients
      broadcast({ type: "new_comment", comment });
      
      res.json(comment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a comment
  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const success = await storage.deleteComment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      broadcast({ type: "comment_deleted", commentId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ DELIVERY PHOTOS ============
  
  // Get delivery photos for an item
  app.get("/api/items/:itemId/photos", async (req, res) => {
    try {
      const photos = await storage.getDeliveryPhotos(req.params.itemId);
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add a delivery photo
  app.post("/api/items/:itemId/photos", async (req, res) => {
    try {
      const validatedData = insertDeliveryPhotoSchema.parse({
        ...req.body,
        itemId: req.params.itemId,
      });
      
      const photo = await storage.addDeliveryPhoto(validatedData);
      
      broadcast({ type: "photo_added", photo });
      
      res.json(photo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a delivery photo
  app.delete("/api/photos/:id", async (req, res) => {
    try {
      const success = await storage.deleteDeliveryPhoto(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Photo not found" });
      }
      
      broadcast({ type: "photo_deleted", photoId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ AUDIT LOGS ============
  
  // Get audit logs (all or filtered by type/entity)
  app.get("/api/audit-logs", async (req, res) => {
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

  // ============ OBJECT STORAGE (PHOTO UPLOADS) ============
  // Reference: blueprint:javascript_object_storage
  
  const { ObjectStorageService, ObjectNotFoundError } = await import("./objectStorage");
  
  // Get upload URL for a new photo
  app.post("/api/objects/upload", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve uploaded objects (photos)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Save delivery photo info to database
  app.post("/api/delivery-photos", async (req, res) => {
    try {
      const validatedData = insertDeliveryPhotoSchema.parse(req.body);
      
      // Normalize the photo URL to object path
      const objectStorageService = new ObjectStorageService();
      const photoPath = objectStorageService.normalizeObjectEntityPath(validatedData.photoUrl);
      
      const photo = await storage.addDeliveryPhoto({
        ...validatedData,
        photoUrl: photoPath,
      });
      
      res.status(201).json(photo);
    } catch (error: any) {
      console.error("Error saving delivery photo:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Get photos for an item
  app.get("/api/items/:itemId/photos", async (req, res) => {
    try {
      const photos = await storage.getDeliveryPhotos(req.params.itemId);
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ DEADLINE ALERTS ============
  // Background job to check for upcoming deadlines
  setInterval(async () => {
    try {
      const allEvents = await storage.getAllEvents();
      const now = new Date();

      for (const event of allEvents) {
        if (event.status === 'completed') continue;

        // ── Truck departure alerts (48h / 24h / 12h) ────────────────────────
        const departure = new Date(event.truckDepartureDate);
        const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (
          (hoursUntilDeparture <= 48 && hoursUntilDeparture > 47.5) ||
          (hoursUntilDeparture <= 24 && hoursUntilDeparture > 23.5) ||
          (hoursUntilDeparture <= 12 && hoursUntilDeparture > 11.5)
        ) {
          const hours = Math.floor(hoursUntilDeparture);
          const notification = await storage.createNotification({
            type: "deadlineAlert",
            message: `ALERTA: Faltam ${hours}h para saída do caminhão - ${event.name}`,
            eventId: event.id,
            targetRoles: ["arte", "grafica", "solicitacao"],
          });
          broadcast({ type: "deadline_alert", event, hoursRemaining: hours });
          broadcast({ type: "notification_created", notification });
        }

        // ── Prazo alerts (48h / 24h before each configurable deadline) ──────
        if (!event.truckDepartureDate) continue;

        const truckMs = new Date(event.truckDepartureDate).getTime();

        const prazos: Array<{
          field: keyof typeof event;
          label: string;
          roles: string[];
        }> = [
          { field: "deadlineListaImagens",   label: "Lista de Imagens",    roles: ["solicitacao", "admin"] },
          { field: "deadlineEntregaLayouts", label: "Entrega de Layouts",  roles: ["arte", "admin"] },
          { field: "deadlineAprovacaoLayout",label: "Aprovação de Layout", roles: ["atendimento", "arte", "admin"] },
          { field: "deadlineRevisaoLista",   label: "Revisão de Lista",    roles: ["solicitacao", "admin"] },
          { field: "deadlineProducaoGrafica",label: "Produção Gráfica",    roles: ["grafica", "admin"] },
        ];

        for (const { field, label, roles } of prazos) {
          const offsetDays = event[field] as number | null;
          if (offsetDays == null) continue;

          // Deadline = truck date + offset days, treated as end-of-day (23:59)
          const deadlineDate = new Date(truckMs + offsetDays * 24 * 60 * 60 * 1000);
          deadlineDate.setHours(23, 59, 59, 0);
          const hoursUntil = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);

          if (
            (hoursUntil <= 48 && hoursUntil > 47.5) ||
            (hoursUntil <= 24 && hoursUntil > 23.5)
          ) {
            const hours = Math.round(hoursUntil);
            const notification = await storage.createNotification({
              type: "prazoAlert",
              message: `Prazo "${label}" em ${hours}h — ${event.name}`,
              eventId: event.id,
              targetRoles: roles,
            });
            broadcast({ type: "prazo_alert", event, label, hoursRemaining: hours });
            broadcast({ type: "notification_created", notification });
          }
        }
      }
    } catch (error) {
      console.error("Error checking deadlines:", error);
    }
  }, 30 * 60 * 1000); // Check every 30 minutes

  // ============ INVENTORY BACKFILL ============
  // Runs once on startup: finds all produzido/entregue items with no inventory assets and creates them.
  async function backfillInventoryAssets() {
    try {
      const allItems = await storage.getAllItems();
      const produced = allItems.filter(
        item => (item.status === 'produced' || item.status === 'delivered') &&
                item.quantityProduced && item.quantityProduced > 0
      );
      let totalCreated = 0;
      for (const item of produced) {
        const existing = await storage.getAssetsByOriginalItemId(item.id);
        if (existing.length >= (item.quantityProduced ?? 1)) continue; // already backfilled

        const event = await storage.getEvent(item.eventId);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        const itemSponsorLinks = await storage.getItemSponsors(item.id);
        const linkedSponsorIds = itemSponsorLinks.map(s => s.sponsorId);
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        const itemNum = item.displayId.replace(/[^0-9]/g, '').padStart(4, '0');

        const startIdx = existing.length;
        const qty = (item.quantityProduced ?? 1) - startIdx;
        if (qty <= 0) continue;

        const records = Array.from({ length: qty }, (_, i) => ({
          displayId: `#EST-${itemNum}-${startIdx + i + 1}`,
          name: itemName,
          quantity: 1,
          originalItemId: item.id,
          condition: "PERFEITO" as const,
          location: null,
          franchiseTags,
          sponsorIds: linkedSponsorIds,
          approvalThumbUrl,
          trackingStatus: "NO_GALPAO" as const,
          notes: `Gráfica — Evento: ${event?.name ?? '—'}`,
          autoAdded: true,
        }));

        await storage.createInventoryAssets(records);
        totalCreated += records.length;
        console.log(`[inventory-backfill] created ${records.length} asset(s) for item "${item.type}" (${item.displayId})`);
      }
      if (totalCreated > 0) {
        console.log(`[inventory-backfill] total: ${totalCreated} asset(s) backfilled`);
      } else {
        console.log(`[inventory-backfill] nothing to backfill`);
      }
    } catch (err) {
      console.error('[inventory-backfill] error:', err);
    }
  }

  // ============ INVENTORY LIFECYCLE CRON ============
  // ── Inventory lifecycle: extracted to function so it runs on startup AND every minute ──
  // Trigger 1: truckDepartureDate passed → EM_USO
  // Trigger 2: midnight of event startDate (when the event day begins) → AGUARDANDO_TRIAGEM
  // Continuous (catch-up) logic — no narrow window — missed ticks are recovered automatically.
  async function runInventoryCron() {
    try {
      const now = new Date();
      const allEvents = await storage.getAllEvents();
      for (const event of allEvents) {
        if (!event.truckDepartureDate) continue;

        // ── Departure: truck left → mark assets EM_USO ──────────────────────
        const departure = new Date(event.truckDepartureDate);
        if (now >= departure) {
          const count = await storage.markAssetsInUseForEvent(event.id, departure);
          if (count > 0) {
            broadcast({ type: 'inventory_in_use', eventId: event.id, eventName: event.name, count });
            console.log(`[inventory-cron] ${count} asset(s) → EM_USO for event "${event.name}"`);
          }
        }

        // ── Triage: midnight of the day AFTER the event's startDate → AGUARDANDO_TRIAGEM ─
        // Only assets currently EM_USO transition — assets not in use are never pulled into triage.
        if (event.startDate) {
          const dayAfterEvent = new Date(event.startDate);
          dayAfterEvent.setDate(dayAfterEvent.getDate() + 1);
          dayAfterEvent.setHours(0, 0, 0, 0);

          if (now >= dayAfterEvent) {
            const count = await storage.markAssetsAwaitingTriageForEvent(event.id);
            if (count > 0) {
              broadcast({
                type: 'inventory_awaiting_triage',
                eventId: event.id,
                eventName: event.name,
                count,
                message: `Os materiais do evento "${event.name}" retornaram e aguardam triagem.`,
              });
              console.log(`[inventory-cron] ${count} asset(s) → AGUARDANDO_TRIAGEM for event "${event.name}"`);
            }
          }
        }
      }
    } catch (err) {
      console.error('[inventory-cron] error:', err);
    }
  }

  // On startup: backfill missing assets first, then immediately run lifecycle transitions,
  // then schedule every-10-minute checks. Sequential so backfilled assets are ready for the cron.
  backfillInventoryAssets().then(() => runInventoryCron());
  setInterval(runInventoryCron, 10 * 60 * 1000);

  // ============ INVENTORY ASSETS (ACERVO) ============

  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getAllInventoryAssets();
      res.json(assets);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Erro ao buscar acervo" });
    }
  });

  app.get("/api/inventory/available/:franchise", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getAvailableAssetsByFranchise(req.params.franchise);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching available assets:", error);
      res.status(500).json({ error: "Erro ao buscar peças disponíveis" });
    }
  });

  // Must be before /:id to avoid being swallowed by that route
  app.get("/api/inventory/awaiting-triage", requireAuth, async (req, res) => {
    try {
      const [assets, allItems, allEvents, allSponsors] = await Promise.all([
        storage.getAssetsAwaitingTriage(),
        storage.getAllItems(),
        storage.getAllEvents(),
        storage.getAllSponsors(),
      ]);
      const itemMap = Object.fromEntries(allItems.map(i => [i.id, i]));
      const eventMap = Object.fromEntries(allEvents.map(e => [e.id, e]));
      const sponsorMap = Object.fromEntries(allSponsors.map(s => [s.id, s]));
      const enriched = assets.map(asset => {
        const item = asset.originalItemId ? itemMap[asset.originalItemId] : null;
        const event = item ? eventMap[item.eventId] : null;
        const sponsors = (asset.sponsorIds ?? [])
          .map(sid => sponsorMap[sid])
          .filter(Boolean)
          .map(s => ({ id: s.id, name: s.name }));
        return {
          ...asset,
          eventName: event?.name ?? null,
          eventDate: event?.startDate ?? null,
          sponsors,
        };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ativos" });
    }
  });

  app.get("/api/inventory/:id/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getAssetAllocations(req.params.id);
      res.json(allocations);
    } catch (error) {
      console.error("Error fetching asset allocations:", error);
      res.status(500).json({ error: "Erro ao buscar histórico de eventos" });
    }
  });

  app.get("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Peça não encontrada" });
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar peça" });
    }
  });

  app.post("/api/inventory", requireAuth, async (req, res) => {
    try {
      const data = req.body;
      const asset = await storage.createInventoryAsset(data);
      res.status(201).json(asset);
    } catch (error) {
      console.error("Error creating inventory asset:", error);
      res.status(500).json({ error: "Erro ao criar peça no acervo" });
    }
  });

  app.patch("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.updateInventoryAsset(req.params.id, req.body);
      if (!asset) return res.status(404).json({ error: "Peça não encontrada" });
      res.json(asset);
    } catch (error) {
      console.error("Error updating inventory asset:", error);
      res.status(500).json({ error: "Erro ao atualizar peça" });
    }
  });

  app.delete("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteInventoryAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Peça não encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir peça" });
    }
  });

  // Triage endpoint: update condition + set back to NO_GALPAO (or DESCARTADO)
  app.patch("/api/inventory/:id/triage", requireAuth, async (req, res) => {
    try {
      const { condition, notes, trackingStatus } = req.body;
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });
      const newStatus = trackingStatus === 'DESCARTADO' ? 'DESCARTADO' : 'NO_GALPAO';
      const updated = await storage.updateInventoryAsset(req.params.id, {
        condition: condition ?? asset.condition,
        notes: notes ?? asset.notes,
        trackingStatus: newStatus,
      } as any);
      const triagedBy = (req as any).userName || 'Sistema';
      await createAuditLog(triagedBy, 'triagem', 'inventory_asset', req.params.id,
        JSON.stringify({ destino: newStatus, condicao: condition ?? asset.condition }));
      broadcast({ type: 'inventory_triaged', assetId: req.params.id, trackingStatus: newStatus });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: "Erro ao registrar triagem" });
    }
  });

  // Triage with quantity split: splits the asset into multiple records by qty
  app.post("/api/inventory/:id/triage-split", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });

      interface SplitPayload { qty: number; condition: string; trackingStatus: string; notes?: string; }
      const splits: SplitPayload[] = req.body.splits;
      if (!Array.isArray(splits) || splits.length === 0)
        return res.status(400).json({ error: "splits[] obrigatório" });

      const totalQty = splits.reduce((s, sp) => s + (sp.qty ?? 0), 0);
      if (totalQty !== (asset.quantity ?? 1))
        return res.status(400).json({ error: `Soma das quantidades (${totalQty}) não bate com o total do ativo (${asset.quantity})` });

      // Update original asset with first split
      const firstStatus = splits[0].trackingStatus === 'DESCARTADO' ? 'DESCARTADO' : 'NO_GALPAO';
      await storage.updateInventoryAsset(req.params.id, {
        condition: splits[0].condition as any,
        notes: splits[0].notes ?? asset.notes,
        trackingStatus: firstStatus,
        quantity: splits[0].qty,
      } as any);

      // Clone asset for each additional split (displayId auto-generated by storage)
      for (let i = 1; i < splits.length; i++) {
        const sp = splits[i];
        const spStatus = sp.trackingStatus === 'DESCARTADO' ? 'DESCARTADO' : 'NO_GALPAO';
        await storage.createInventoryAsset({
          name: asset.name,
          condition: sp.condition as any,
          trackingStatus: spStatus,
          quantity: sp.qty,
          notes: sp.notes ?? null,
          location: asset.location,
          franchiseTags: asset.franchiseTags,
          sponsorIds: asset.sponsorIds,
          approvalThumbUrl: asset.approvalThumbUrl,
          autoAdded: asset.autoAdded,
          originalItemId: asset.originalItemId,
        } as any);
      }

      const triagedBy = (req as any).userName || 'Sistema';
      await createAuditLog(triagedBy, 'triagem', 'inventory_asset', req.params.id,
        JSON.stringify({ destino: firstStatus, condicao: splits[0].condition, lotes: splits.length }));
      broadcast({ type: 'inventory_triaged', assetId: req.params.id, trackingStatus: firstStatus });
      res.json({ ok: true, splits: splits.length });
    } catch (error) {
      console.error("Error in triage-split:", error);
      res.status(500).json({ error: "Erro ao registrar triagem por quantidade" });
    }
  });

  // Manual trigger: mark event assets EM_USO
  app.post("/api/events/:id/dispatch-inventory", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });
      const departure = event.truckDepartureDate ? new Date(event.truckDepartureDate) : new Date();
      const count = await storage.markAssetsInUseForEvent(req.params.id, departure);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Erro ao processar despacho" });
    }
  });

  // Manual trigger: mark event assets AGUARDANDO_TRIAGEM
  app.post("/api/events/:id/return-inventory", requireAuth, async (req, res) => {
    try {
      const count = await storage.markAssetsAwaitingTriageForEvent(req.params.id);
      if (count > 0) {
        const event = await storage.getEvent(req.params.id);
        broadcast({
          type: 'inventory_awaiting_triage',
          eventId: req.params.id,
          eventName: event?.name ?? '—',
          count,
          message: `Os materiais do evento "${event?.name ?? '—'}" retornaram e aguardam triagem.`,
        });
      }
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Erro ao processar retorno" });
    }
  });

  // Event Allocations
  app.get("/api/events/:id/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getEventAllocations(req.params.id);
      res.json(allocations);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar alocações" });
    }
  });

  app.post("/api/events/:id/allocations", requireAuth, async (req, res) => {
    try {
      const { assetId } = req.body;
      if (!assetId) return res.status(400).json({ error: "assetId é obrigatório" });
      const alloc = await storage.allocateAssetToEvent(req.params.id, assetId);
      res.status(201).json(alloc);
    } catch (error) {
      console.error("Error allocating asset:", error);
      res.status(500).json({ error: "Erro ao alocar peça" });
    }
  });

  app.delete("/api/allocations/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deallocateAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Alocação não encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao desalocar peça" });
    }
  });

  // ============ WEBSOCKET SETUP ============
  const httpServer = createServer(app);
  
  // WebSocket server on /ws path to avoid conflict with Vite HMR
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log('WebSocket client connected');

    ws.on('close', () => {
      wsClients.delete(ws);
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsClients.delete(ws);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket connected' }));
  });

  return httpServer;
}
