// Event CRUD + item submission routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { insertEventSchema, type Item } from "@shared/schema";
import {
  requireAuth,
  broadcast,
  translateStatus,
  createAuditLog,
} from "./shared";

import { eventsCache, setEventsCache } from "../cache";

export function registerEventRoutes(app: Express): void {
  // ============ EVENTS ============
  
  // Get all events with items count
  app.get("/api/events", requireAuth, async (req, res) => {
    try {
      const now = Date.now();
      if (eventsCache && eventsCache.expiresAt > now) {
        return res.json(eventsCache.data);
      }

      // 3 queries totais (eventos + todos os itens + todos os vínculos de
      // patrocinador), agrupando em memória — em vez de 1 + 2 queries POR evento
      // (N+1). Com centenas de eventos isso era a diferença entre ~3 e ~600
      // queries neste endpoint, que é o mais chamado do app.
      const [allEvents, allItems, allEventSponsors] = await Promise.all([
        storage.getAllEvents(),
        storage.getAllItems(),
        storage.getAllEventSponsors(),
      ]);

      // getAllItems/getAllEventSponsors já vêm ordenados por createdAt desc —
      // agrupar preserva a mesma ordem que getItemsByEvent/getEventSponsors dariam.
      const itemsByEvent = new Map<string, any[]>();
      for (const it of allItems) {
        const arr = itemsByEvent.get(it.eventId);
        if (arr) arr.push(it); else itemsByEvent.set(it.eventId, [it]);
      }
      const sponsorsByEvent = new Map<string, any[]>();
      for (const es of allEventSponsors) {
        const arr = sponsorsByEvent.get(es.eventId);
        if (arr) arr.push(es); else sponsorsByEvent.set(es.eventId, [es]);
      }

      const nowDate = new Date();
      const eventsWithItems = allEvents.map((event) => {
        const eventItems = itemsByEvent.get(event.id) ?? [];
        const eventSponsors = sponsorsByEvent.get(event.id) ?? [];

        // Calculate real-time status
        const eventHasPassed = nowDate > new Date(event.startDate);
        let calculatedStatus = event.status;
        if (eventHasPassed) {
          calculatedStatus = "completed";
        } else if (eventItems.length > 0) {
          const allDelivered = eventItems.every((item) => item.status === "delivered");
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
      });

      setEventsCache(eventsWithItems);
      res.json(eventsWithItems);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single event
  app.get("/api/events/:id", requireAuth, async (req, res) => {
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
  app.post("/api/events", requireAuth, async (req, res) => {
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
  app.patch("/api/events/:id", requireAuth, async (req, res) => {
    // Edição de evento é gestão (mesmos papéis que a UI mostra o lápis) — a
    // rota aceitava qualquer papel reescrever datas/dados de qualquer evento.
    if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para editar eventos" });
    }
    try {
      const validatedData = insertEventSchema.partial().parse(req.body);

      // Validação: Se ambas as datas estão sendo atualizadas, verificar regra
      if (validatedData.startDate && validatedData.truckDepartureDate) {
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
      }

      const event = await storage.updateEvent(req.params.id, validatedData);
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
  app.patch("/api/events/:id/priority", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "atendimento") {
        return res.status(403).json({ error: "Acesso negado" });
      }
      const { priority } = req.body;

      // priority vazia/null = REMOVER a prioridade (volta a "Sem Prioridade").
      // Antes só aceitava os 4 níveis — uma vez definida, não havia caminho de volta.
      const clearing = priority === null || priority === "";
      if (!clearing && !["baixa", "media", "alta", "urgente"].includes(priority)) {
        return res.status(400).json({ error: "Prioridade inválida. Use: baixa, media, alta, urgente ou vazio para remover" });
      }

      const event = await storage.updateEvent(req.params.id, { priority: clearing ? (null as any) : priority });
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        event.id,
        clearing
          ? `Prioridade do evento "${event.name}" removida`
          : `Prioridade do evento "${event.name}" definida como "${priority}"`
      );
      
      broadcast({ type: "event_priority_updated", event });
      
      res.json(event);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete event
  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem excluir eventos" });
      }
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
      
      // Buscar todos os itens em rascunho deste evento (draft = novo, requested = legado)
      const allItems = await storage.getItemsByEvent(eventId);
      const draftItems = allItems.filter(item => item.status === 'draft' || item.status === 'requested');
      
      if (draftItems.length === 0) {
        return res.status(400).json({ error: "Nenhum item em rascunho para enviar" });
      }
      
      // Atomic status transition: draft/requested → awaiting_linking
      // Cast is safe: draftItems was filtered to only draft/requested above.
      type ItemStatus = Parameters<typeof storage.updateItemWithStatusCheck>[1];
      const updatePromises = draftItems.map(item => 
        storage.updateItemWithStatusCheck(item.id, item.status as ItemStatus, 'awaiting_linking')
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
        `${successfulUpdates.length} ${successfulUpdates.length === 1 ? 'item' : 'itens'}: Status alterado de Rascunho → Aguardando Vinculação (${successfulUpdates.length === 1 ? 'enviado' : 'enviados'} para vinculação)`
      );
      
      // Notify Arte and Admin profiles with actual count
      await storage.createNotification({
        type: 'itemsSubmitted',
        message: `${successfulUpdates.length} ${successfulUpdates.length === 1 ? 'novo item' : 'novos itens'} aguardando vinculação de patrocinadores no evento "${event.name}"`,
        targetRoles: ['arte'], // só quem AGE: a Arte cria o thumb; admin não tem ação aqui
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

}
