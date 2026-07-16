// Referenced from javascript_websocket blueprint for WebSocket setup
//
// This file is the orchestrator: it wires up session middleware, delegates
// route registration to the domain modules in server/routes/*, starts the
// background jobs in server/services/*, and sets up the WebSocket server.
// It used to contain every route inline (~4700 lines) — that logic was
// split out module-by-module with no behavior changes; see server/routes/
// and server/services/ for the actual route handlers.
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { wsClients } from "./routes/shared";
import { registerAuthRoutes } from "./routes/auth";
import { registerSponsorRoutes } from "./routes/sponsors";
import { registerEventRoutes } from "./routes/events";
import { registerItemRoutes } from "./routes/items";
import { registerStandardItemRoutes } from "./routes/standard-items";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerCommentRoutes } from "./routes/comments";
import { registerPhotoRoutes } from "./routes/photos";
import { registerAuditLogRoutes } from "./routes/audit-logs";
import { registerObjectRoutes } from "./routes/objects";
import { registerInventoryRoutes } from "./routes/inventory";
import { startDeadlineAlerts } from "./services/deadlineAlerts";
import { startInventoryLifecycle } from "./services/inventoryLifecycle";

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

  // Route registration order matches the original monolithic routes.ts —
  // this matters because Express matches routes in registration order, and
  // some domains register generic parameterized paths (e.g. GET
  // /api/items/:eventId in items.ts) that must come after more specific
  // literal paths registered by earlier domains.
  registerAuthRoutes(app);
  registerSponsorRoutes(app);
  registerEventRoutes(app);
  registerItemRoutes(app);
  registerStandardItemRoutes(app);
  registerNotificationRoutes(app);
  registerCommentRoutes(app);
  registerPhotoRoutes(app);
  registerAuditLogRoutes(app);
  await registerObjectRoutes(app);

  // ============ BACKGROUND JOBS ============
  startDeadlineAlerts();
  startInventoryLifecycle();

  registerInventoryRoutes(app);

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
