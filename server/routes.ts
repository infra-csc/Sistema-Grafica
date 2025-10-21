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
  insertAuditLogSchema
} from "@shared/schema";
import { db } from "./db";
import { events } from "@shared/schema";

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
  // Middleware to extract user info from headers
  app.use((req, res, next) => {
    req.userName = (req.headers['x-user-name'] as string) || 'Sistema';
    next();
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
      
      broadcast({ type: "event_updated", event });
      
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete event
  app.delete("/api/events/:id", async (req, res) => {
    try {
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
