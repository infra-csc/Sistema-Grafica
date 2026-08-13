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
import { sessionMiddleware } from "./session";
import { registerAuthRoutes } from "./routes/auth";
import { registerSponsorRoutes } from "./routes/sponsors";
import { registerEventRoutes } from "./routes/events";
import { registerItemRoutes } from "./routes/items";
import { registerStandardItemRoutes } from "./routes/standard-items";
import { registerNotificationRoutes } from "./routes/notifications";
import { registerCommentRoutes } from "./routes/comments";
import { registerPhotoRoutes } from "./routes/photos";
import { registerAuditLogRoutes } from "./routes/audit-logs";
import { registerPrazoRoutes } from "./routes/prazos";
import { registerObjectRoutes } from "./routes/objects";
import { registerInventoryRoutes } from "./routes/inventory";
import { startDeadlineAlerts } from "./services/deadlineAlerts";
import { startInventoryLifecycle } from "./services/inventoryLifecycle";
import { startPrazoSnapshots } from "./services/prazoSnapshots";

export async function registerRoutes(app: Express): Promise<Server> {
  // Middleware to extract user info from session
  app.use((req, res, next) => {
    if (req.session?.userId) {
      req.userId = req.session.userId;
      req.userName = req.session.userName || 'Sistema';
      // Sem fallback de papel: sessão sem role NÃO ganha privilégios de
      // solicitacao por default — gates comparam com string e falham fechado.
      req.userRole = req.session.userRole;
    } else {
      // Sem sessão: identidade NÃO pode vir do cliente. O header x-user-name
      // é controlado pelo navegador e era falsificável — a trilha de auditoria
      // precisa ser confiável, então a autoria de requisições não autenticadas
      // é sempre "Sistema". (Rotas que gravam audit log exigem requireAuth.)
      req.userName = 'Sistema';
    }
    next();
  });

  // ── Route registration ──────────────────────────────────────────────────
  registerAuthRoutes(app);
  registerSponsorRoutes(app);
  registerEventRoutes(app);
  registerItemRoutes(app);
  registerStandardItemRoutes(app);
  registerNotificationRoutes(app);
  registerCommentRoutes(app);
  registerPhotoRoutes(app);
  registerAuditLogRoutes(app);
  registerPrazoRoutes(app);
  await registerObjectRoutes(app);

  // ── Background jobs ──────────────────────────────────────────────────────
  startDeadlineAlerts();
  startInventoryLifecycle();
  // Fecho diário da Gestão de Prazos. Se este registro sumir, nenhum snapshot
  // é gravado: a tendência ▲▼ e a faixa "o que mudou desde ontem" desaparecem
  // para sempre, em silêncio e sem erro. Ver services/prazoSnapshots.ts.
  startPrazoSnapshots();

  registerInventoryRoutes(app);

  // ============ WEBSOCKET SETUP ============
  const httpServer = createServer(app);

  // WebSocket em /ws. Usamos noServer + upgrade manual para AUTENTICAR o
  // handshake: sem isto qualquer cliente que alcançasse /ws entrava em
  // wsClients e recebia todos os broadcasts de mutação (dados de eventos e
  // itens) sem sessão. Rodamos o mesmo sessionMiddleware do Express sobre a
  // requisição de upgrade e só prosseguimos se houver userId na sessão.
  const wss = new WebSocketServer({ noServer: true });

  // res "fake" suficiente para o express-session ler o cookie na fase de
  // upgrade (não há ciclo normal de resposta aqui; só precisamos LER a sessão).
  const noopRes: any = {
    setHeader() {}, getHeader() {}, removeHeader() {},
    writeHead() {}, on() {}, once() {}, end() {},
  };

  httpServer.on('upgrade', (req: any, socket, head) => {
    // Só tratamos /ws; outros upgrades (ex.: HMR do Vite em dev) seguem para
    // os handlers deles — por isso retornamos SEM destruir o socket.
    const path = (req.url || '').split('?')[0];
    if (path !== '/ws') return;

    sessionMiddleware(req, noopRes, () => {
      if (!req.session?.userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    });
  });

  wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
    ws.isAlive = true;
    wsClients.add(ws);
    console.log('WebSocket client connected');

    ws.on('pong', () => { ws.isAlive = true; });

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

  // Heartbeat: ping every 30 s and terminate connections that don't pong back.
  // Prevents dead sockets accumulating in wsClients and receiving broadcasts.
  setInterval(() => {
    (wss.clients as Set<WebSocket & { isAlive?: boolean }>).forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        wsClients.delete(ws);
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30_000);

  return httpServer;
}
