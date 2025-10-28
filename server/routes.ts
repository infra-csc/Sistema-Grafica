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
  loginSchema,
  changePasswordSchema
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { events } from "@shared/schema";

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

  // ============ EVENTS ============
  
  // Get all events with items count
  app.get("/api/events", async (req, res) => {
    try {
      const allEvents = await storage.getAllEvents();
      
      // Fetch items for each event
      const eventsWithItems = await Promise.all(
        allEvents.map(async (event) => {
          const eventItems = await storage.getItemsByEvent(event.id);
          return {
            ...event,
            items: eventItems,
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
      
      // Create notification
      await storage.createNotification({
        type: "eventCreated",
        message: `Novo evento criado: ${event.name}`,
        eventId: event.id,
      });
      
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

  // ============ ITEMS ============

  // Get all items with event data
  app.get("/api/items", async (req, res) => {
    try {
      const allItems = await storage.getAllItems();
      
      // Fetch event for each item
      const itemsWithEvents = await Promise.all(
        allItems.map(async (item) => {
          const event = await storage.getEvent(item.eventId);
          return {
            ...item,
            event,
          };
        })
      );
      
      res.json(itemsWithEvents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending items (for Arte module) - MUST come BEFORE /:eventId route
  app.get("/api/items/pending", async (req, res) => {
    try {
      const pendingItems = await storage.getPendingItems();
      
      // Fetch event for each item
      const itemsWithEvents = await Promise.all(
        pendingItems.map(async (item) => {
          const event = await storage.getEvent(item.eventId);
          return {
            ...item,
            event,
          };
        })
      );
      
      res.json(itemsWithEvents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approved items (for Gráfica module) - MUST come BEFORE /:eventId route
  app.get("/api/items/approved", async (req, res) => {
    try {
      const approvedItems = await storage.getApprovedItems();
      
      // Fetch event for each item
      const itemsWithEvents = await Promise.all(
        approvedItems.map(async (item) => {
          const event = await storage.getEvent(item.eventId);
          return {
            ...item,
            event,
          };
        })
      );
      
      res.json(itemsWithEvents);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items by event - MUST come AFTER specific routes like /pending and /approved
  app.get("/api/items/:eventId", async (req, res) => {
    try {
      const items = await storage.getItemsByEvent(req.params.eventId);
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create item
  app.post("/api/items", async (req, res) => {
    try {
      const validatedData = insertItemSchema.parse(req.body);
      const item = await storage.createItem(validatedData);
      
      const event = await storage.getEvent(item.eventId);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'created',
        'item',
        item.id,
        `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
      );
      
      // Create notification
      await storage.createNotification({
        type: "itemAdded",
        message: `Novo item adicionado: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
      });
      
      broadcast({ type: "item_created", item });
      
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
      
      // Get event for notification
      const firstItem = createdItems[0];
      const event = firstItem ? await storage.getEvent(firstItem.eventId) : null;
      
      // Create notification for bulk addition
      if (event) {
        await storage.createNotification({
          type: "itemAdded",
          message: `${createdItems.length} itens adicionados - Evento: ${event.name}`,
          eventId: event.id,
        });
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
      const item = await storage.updateItem(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'item',
        item.id,
        `Item "${item.type}" atualizado`
      );
      
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

  // Approve item (Arte module)
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
      
      // Create notification
      await storage.createNotification({
        type: "arteApproved",
        message: `Item liberado para produção: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
      });
      
      broadcast({ type: "item_approved", item });
      
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
      
      // Create notification
      await storage.createNotification({
        type: "productionStarted",
        message: `Produção iniciada: ${item.type} - ${quantityProduced}/${item.quantity} unidades - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
      });
      
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
        `Item "${item.type}" entregue - Recebido por: ${receivedBy}`
      );
      
      // Create notification
      await storage.createNotification({
        type: "itemDelivered",
        message: `Item entregue: ${item.type} - Recebido por: ${receivedBy} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
      });
      
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
      
      // Create notification
      await storage.createNotification({
        type: "productionUpdate",
        message: `Produção atualizada: ${item.type} - ${validatedData.quantityProduced}/${item.quantity} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
      });
      
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

  app.get("/api/notifications", async (req, res) => {
    try {
      const notifications = await storage.getAllNotifications();
      res.json(notifications);
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
      const validatedData = insertCommentSchema.parse({
        ...req.body,
        itemId: req.params.itemId,
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
          await storage.createNotification({
            type: "deadlineAlert",
            message: `⚠️ ALERTA: Faltam ${hours}h para saída do caminhão - ${event.name}`,
            eventId: event.id,
          });

          broadcast({
            type: "deadline_alert",
            event,
            hoursRemaining: hours,
          });
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
