// Shared middleware, helpers, and Express type augmentations used across all
// route modules (server/routes/*.ts). Extracted from the former monolithic
// server/routes.ts during the routes.ts → routes/* split — no behavior
// changes, just centralizing what multiple modules depend on.
import { WebSocket } from "ws";
import { z } from "zod";
import { storage } from "../storage";
import { invalidateAllCaches } from "../cache";

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
export const wsClients = new Set<WebSocket>();

// Broadcast function for real-time updates.
// Also flushes server-side caches so the next read reflects the mutation.
export function broadcast(data: any) {
  invalidateAllCaches();

  const message = JSON.stringify(data);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Helper to translate status to Portuguese
export function translateStatus(status: string): string {
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
    conferred: "Conferido",
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
export async function createAuditLog(
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

// Helper for sensitive routes (auth, user management): Zod validation errors
// are safe and useful to return as-is (400 + field message), but any other
// error (DB failures, unexpected exceptions, etc.) is logged in full on the
// server and reported to the client with a generic message only — never
// error.message, which could leak internal details.
export function sendSensitiveError(res: any, error: any, context: string, status = 400) {
  console.error(`${context}:`, error);
  if (error instanceof z.ZodError) {
    const message = error.errors?.[0]?.message || "Dados inválidos";
    return res.status(400).json({ error: message });
  }
  return res.status(status).json({ error: "Não foi possível completar a operação" });
}

// Helper to calculate event status based on items
export async function calculateEventStatus(eventId: string): Promise<"created" | "completed"> {
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
export async function updateEventStatus(eventId: string): Promise<void> {
  const newStatus = await calculateEventStatus(eventId);
  const event = await storage.getEvent(eventId);

  if (event && event.status !== newStatus) {
    await storage.updateEvent(eventId, { status: newStatus });
    broadcast({ type: "event_updated", event: { ...event, status: newStatus } });
  }
}

// Auth middleware - protect routes that require authentication
export const requireAuth = (req: any, res: any, next: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  next();
};

// Admin middleware - protect routes that require admin role
export const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  if (req.session.userRole !== 'admin') {
    return res.status(403).json({ error: "Acesso negado - apenas administradores" });
  }
  next();
};

// Role middleware factory — protects routes that require one of the given roles.
// Usage: requireRole("admin", "solicitacao")
export const requireRole = (...roles: string[]) => (req: any, res: any, next: any) => {
  if (!req.session?.userId) {
    return res.status(401).json({ error: "Não autenticado" });
  }
  if (!roles.includes(req.session.userRole as string)) {
    return res.status(403).json({ error: "Acesso negado" });
  }
  next();
};

// Simple in-memory rate limiter (no new dependency needed) — protects
// credential-related endpoints from brute-force attempts. Keyed by IP.
// Not distributed-safe (per-process only), which is an acceptable
// trade-off for this single-instance deployment.
export function createRateLimiter(opts: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  setInterval(() => {
    const now = Date.now();
    hits.forEach((v, k) => { if (v.resetAt < now) hits.delete(k); });
  }, 60_000);

  return (req: any, res: any, next: any) => {
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > opts.max) {
      return res.status(429).json({ error: opts.message });
    }
    next();
  };
}

export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas de login. Tente novamente em alguns minutos.",
});

export const changePasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas. Tente novamente em alguns minutos.",
});

// General write rate limiter — applied to all mutation routes (POST/PUT/PATCH/DELETE)
// to slow down automated scripts without affecting normal human usage.
// 300 mutations per 5 minutes per IP ≈ 1 req/sec sustained, well above any human.
export const writeRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 300,
  message: "Muitas requisições. Aguarde alguns minutos antes de continuar.",
});
