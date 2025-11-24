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
  loginSchema,
  changePasswordSchema,
  type Item
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { db } from "./db";
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
      const { password, ...userData } = insertUserSchema.parse(req.body);
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email já cadastrado" });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        ...userData,
        passwordHash,
        mustChangePassword: true,
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
  app.post("/api/sponsors", requireAdmin, async (req, res) => {
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

  // Add sponsor to event
  app.post("/api/events/:id/sponsors", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertEventSponsorSchema.parse({
        eventId: req.params.id,
        sponsorId: req.body.sponsorId,
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
  app.delete("/api/events/:eventId/sponsors/:sponsorId", requireAdmin, async (req, res) => {
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

  // Get sponsors for specific item
  app.get("/api/items/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      res.json(itemSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk sync item sponsors (replaces all sponsors for an item)
  app.post("/api/items/:id/sponsors/sync", requireAuth, async (req, res) => {
    try {
      const itemId = req.params.id;
      const { sponsorIds } = req.body;

      if (!Array.isArray(sponsorIds)) {
        return res.status(400).json({ error: "sponsorIds deve ser um array" });
      }

      await storage.bulkSyncItemSponsors(itemId, sponsorIds);
      
      const item = await storage.getItem(itemId);
      
      await createAuditLog(
        (req as any).userName,
        'updated',
        'item',
        itemId,
        `Patrocinadores atualizados - ${sponsorIds.length} ${sponsorIds.length === 1 ? 'patrocinador vinculado' : 'patrocinadores vinculados'}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json({ message: "Patrocinadores atualizados com sucesso" });
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
      
      // Check authorization: admin can submit any event, others can only submit their own events
      const isAdmin = userRole === 'admin';
      const isOwner = event.createdBy === userId;
      
      if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: "Acesso negado. Você só pode enviar itens de eventos que você criou" });
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

  // Update item
  app.patch("/api/items/:id", async (req, res) => {
    try {
      const validatedData = insertItemSchema.partial().parse(req.body);
      
      // Pegar item atual antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const item = await storage.updateItem(req.params.id, validatedData);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Create audit log - check if status changed (compare actual persisted status)
      let auditDetails = `Item "${item.type}" atualizado`;
      if (item.status !== currentItem.status) {
        auditDetails = `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`;
      }
      
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
      
      if (!approvalThumbUrl) {
        return res.status(400).json({ error: "approvalThumbUrl is required" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "requested") {
        return res.status(409).json({ 
          error: `Item não pode ser enviado para aprovação. Status atual: ${currentItem.status}, esperado: requested` 
        });
      }
      
      // Check if skipApproval flag is set
      const shouldSkipApproval = currentItem.skipApproval === true;
      const nextStatus = shouldSkipApproval ? "awaiting_creator_review" : "awaiting_sponsor_approval";
      
      const item = await storage.updateItem(req.params.id, {
        status: nextStatus,
        approvalThumbUrl,
      });
      
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

  // Arte submits final file after sponsor approval
  app.patch("/api/items/:id/submit-final-file", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar arquivo final" });
      }
      
      // Validate request body with Zod
      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio").url("finalFileUrl deve ser uma URL válida"),
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
        status: "awaiting_creator_review",
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
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_creator_review")} (arquivo final adicionado)`
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
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem revisar como criador do evento" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      if (currentItem.status !== "awaiting_creator_review") {
        return res.status(409).json({ 
          error: `Item não pode ser revisado pelo criador. Status atual: ${currentItem.status}, esperado: awaiting_creator_review` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "ready_for_production",
        creatorReviewedAt: new Date(),
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

        const departure = new Date(event.truckDepartureDate);
        const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);

        // Check for 48h, 24h, 12h alerts
        if (
          (hoursUntilDeparture <= 48 && hoursUntilDeparture > 47.5) ||
          (hoursUntilDeparture <= 24 && hoursUntilDeparture > 23.5) ||
          (hoursUntilDeparture <= 12 && hoursUntilDeparture > 11.5)
        ) {
          const hours = Math.floor(hoursUntilDeparture);
          const notification = await storage.createNotification({
            type: "deadlineAlert",
            message: `⚠️ ALERTA: Faltam ${hours}h para saída do caminhão - ${event.name}`,
            eventId: event.id,
            targetRoles: ["arte", "grafica", "solicitacao"], // Alertas para todos
          });

          broadcast({
            type: "deadline_alert",
            event,
            hoursRemaining: hours,
          });
          broadcast({ type: "notification_created", notification });
        }
      }
    } catch (error) {
      console.error("Error checking deadlines:", error);
    }
  }, 30 * 60 * 1000); // Check every 30 minutes

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
