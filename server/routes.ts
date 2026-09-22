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
import { registerAnaliseRoutes } from "./routes/analises";
import { registerObjectRoutes } from "./routes/objects";
import { registerInventoryRoutes } from "./routes/inventory";
import { registerReparoMotivosRoutes } from "./routes/reparo-motivos";
import { registerReparoVinculosEventoRoutes } from "./routes/reparo-vinculos-evento";
import { registerInferirExecutivosRoutes } from "./routes/inferir-executivos";
import { registerVersoesRoutes } from "./routes/versoes";
import { registerBuscaRoutes } from "./routes/busca";
import { registerRelatorioRoutes } from "./routes/relatorio";
import { registerMaquinasRoutes } from "./routes/maquinas";
import { registerTravaRoutes } from "./routes/trava";
import { registerTubosRoutes } from "./routes/tubos";
import { registerEstoqueReservasRoutes } from "./routes/estoque-reservas";
import { registerPedidosDePecaRoutes } from "./routes/pedidos-de-peca";
import { registerConsultasDeEstoqueRoutes } from "./routes/consultas-de-estoque";
import { registerKitRoutes } from "./routes/kit";
import { registerArtesBuscaRoutes } from "./routes/artes-busca";
import { db } from "./db";
import { items as itemsTable } from "@shared/schema";
import { and, inArray, isNotNull } from "drizzle-orm";
import { startRevisaoDigest } from "./services/revisaoDigest";
import { startDeadlineAlerts } from "./services/deadlineAlerts";
import { limparReservasAntigas } from "./services/reservaDeDisparo";
import { startInventoryLifecycle } from "./services/inventoryLifecycle";
import { startPrazoSnapshots } from "./services/prazoSnapshots";
import { startPrioridadeAutomatica } from "./services/prioridadeAutomatica";
import { startGestaoDigest } from "./services/gestaoDigest";

export async function registerRoutes(app: Express): Promise<Server> {
  // Middleware to extract user info from session
  app.use((req, res, next) => {
    if (req.session?.userId) {
      req.userId = req.session.userId;
      req.userName = req.session.userName || 'Sistema';
      // Sem fallback de papel: sessão sem role NÃO ganha privilégios de
      // solicitacao por default — gates comparam com string e falham fechado.
      req.userRole = req.session.userRole;
      // Usuário do Kit (14/09): a marca vem do login; mudar a marca derruba as
      // sessões da pessoa (PATCH /api/users/:id), como mudar o perfil.
      req.userKit = req.session.userKit === true;
    } else {
      // Sem sessão: identidade NÃO pode vir do cliente. O header x-user-name
      // é controlado pelo navegador e era falsificável — a trilha de auditoria
      // precisa ser confiável, então a autoria de requisições não autenticadas
      // é sempre "Sistema". (Rotas que gravam audit log exigem requireAuth.)
      req.userName = 'Sistema';
    }
    next();
  });

  // ── KIT: a Solicitação da Arena só VISUALIZA peça do Kit (dono, 15/09) ────
  // Uma trava só para toda escrita em peça (/api/items/:id/…, e lotes com
  // `itemIds`): quem é da Solicitação e NÃO é usuário do Kit não age sobre
  // peça do Kit — nem conferir, entregar, revisar, editar ou excluir.
  // Modelos não é do usuário do Kit (dono, 15/09): leitura segue (o formulário
  // de peça usa o catálogo), escrita no catálogo não.
  app.use((req, res, next) => {
    if (req.userKit && req.path.startsWith("/api/standard-items") && ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
      return res.status(403).json({ error: "Modelos não é do usuário do Kit." });
    }
    next();
  });

  app.use(async (req, res, next) => {
    try {
      if (req.userRole !== "solicitacao" || req.userKit || !["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return next();
      const ids: string[] = [];
      const alvo = req.path.match(/^\/api\/items\/([^/]+)(?:\/|$)/);
      if (alvo && !["bulk", "export-xlsx"].includes(alvo[1])) ids.push(alvo[1]);
      if (Array.isArray(req.body?.itemIds)) ids.push(...req.body.itemIds.filter((x: unknown): x is string => typeof x === "string"));
      if (ids.length === 0) return next();
      const doKit = await db.select({ id: itemsTable.id }).from(itemsTable)
        .where(and(inArray(itemsTable.id, ids), isNotNull(itemsTable.kitRemessaId)))
        .limit(1);
      if (doKit.length > 0) {
        return res.status(403).json({ error: "Peça do Kit: a Solicitação da Arena só visualiza. Quem age nela é o usuário do Kit." });
      }
      next();
    } catch (error) {
      next(error);
    }
  });

  // ── Route registration ──────────────────────────────────────────────────
  registerAuthRoutes(app);
  registerSponsorRoutes(app);
  registerEventRoutes(app);
  registerItemRoutes(app);
  registerStandardItemRoutes(app);
  registerVersoesRoutes(app);
  registerBuscaRoutes(app);
  registerRelatorioRoutes(app);
  registerMaquinasRoutes(app);
  registerTravaRoutes(app);
  registerTubosRoutes(app);
  registerEstoqueReservasRoutes(app);
  registerPedidosDePecaRoutes(app);
  registerConsultasDeEstoqueRoutes(app);
  registerKitRoutes(app);
  registerArtesBuscaRoutes(app);
  registerNotificationRoutes(app);
  registerCommentRoutes(app);
  registerPhotoRoutes(app);
  registerAuditLogRoutes(app);
  registerPrazoRoutes(app);
  registerAnaliseRoutes(app);
  registerReparoMotivosRoutes(app);
  registerReparoVinculosEventoRoutes(app);
  registerInferirExecutivosRoutes(app);
  await registerObjectRoutes(app);

  // ── Background jobs ──────────────────────────────────────────────────────
  // As reservas de disparo (a trava que impede réplicas de mandarem o mesmo
  // aviso) são histórico depois de alguns dias — 90 é folga de sobra para
  // investigar "o aviso de tal dia saiu?".
  limparReservasAntigas();
  startDeadlineAlerts();
  // Aviso da fila de revisão às 10h, 15h e 18h (services/revisaoDigest.ts).
  // Sobe junto com os outros trabalhos de fundo; sem REVISAO_DIGEST_ENABLED=true
  // ele bate o relógio e não faz nada.
  startRevisaoDigest();
  // Aviso da gestão (25/08): aprovações pendentes por evento e patrocinador,
  // 8h, para as três do acompanhamento. Desligado até GESTAO_DIGEST_ENABLED.
  startGestaoDigest();
  startInventoryLifecycle();
  // Fecho diário da Gestão de Prazos. Se este registro sumir, nenhum snapshot
  // é gravado: a tendência ▲▼ e a faixa "o que mudou desde ontem" desaparecem
  // para sempre, em silêncio e sem erro. Ver services/prazoSnapshots.ts.
  startPrazoSnapshots();
  // Prioridade automática pela saída do caminhão (25/08): boot + hora em hora;
  // respeita a trava manual (events.priority_manual).
  startPrioridadeAutomatica();

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
