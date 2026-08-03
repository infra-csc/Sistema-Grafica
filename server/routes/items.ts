// Item CRUD, workflow transitions, sponsor-approval sub-endpoints, and
// XLSX import routes. Extracted from server/routes.ts (ITEMS section).
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertItemSchema, insertProductionUpdateSchema } from "@shared/schema";
import {
  requireAuth,
  broadcast,
  translateStatus,
  createAuditLog,
  updateEventStatus,
} from "./shared";
import { runInventoryCron } from "../services/inventoryLifecycle";
import { handlePreviewXlsx, handleConfirmImport } from "../services/xlsxImport";
import { handleExportItemsXlsx, handleExportSelectedItemsXlsx } from "../services/xlsxExport";

// Enriquece uma lista de itens com { event, sponsors } fazendo apenas 4 queries
// totais (eventos, patrocinadores, vínculos item↔patrocinador e aprovações em
// bloco), em vez de 1 getEvent + 1 getItemSponsors + N getSponsor POR item
// (N+1). Cada sponsor recebe approvalStatus: "approved"|"rejected"|"pending"|null
// para que SponsorChips possa colorir os chips sem requests adicionais.
async function enrichItemsWithEventsAndSponsors(list: any[]): Promise<any[]> {
  if (list.length === 0) return [];
  const [allEvents, allSponsors, allItemSponsors, allApprovals] = await Promise.all([
    storage.getAllEvents(),
    storage.getAllSponsors(),
    storage.getAllItemSponsors(),
    storage.getAllItemSponsorApprovals(),
  ]);
  const eventById = new Map(allEvents.map((e) => [e.id, e]));
  const sponsorById = new Map(allSponsors.map((s) => [s.id, s]));
  // key: `${itemId}_${sponsorId}` → approval status
  const approvalKey = (itemId: string, sponsorId: string) => `${itemId}__${sponsorId}`;
  const approvalStatus = new Map<string, string>();
  for (const a of allApprovals) {
    approvalStatus.set(approvalKey(a.itemId, a.sponsorId), a.status);
  }
  const sponsorsByItem = new Map<string, any[]>();
  for (const is of allItemSponsors) {
    const sponsor = sponsorById.get(is.sponsorId);
    if (!sponsor) continue;
    const enrichedSponsor = {
      ...sponsor,
      approvalStatus: approvalStatus.get(approvalKey(is.itemId, is.sponsorId)) ?? null,
    };
    const arr = sponsorsByItem.get(is.itemId);
    if (arr) arr.push(enrichedSponsor);
    else sponsorsByItem.set(is.itemId, [enrichedSponsor]);
  }
  return list.map((item) => ({
    ...item,
    event: eventById.get(item.eventId) ?? undefined,
    sponsors: sponsorsByItem.get(item.id) ?? [],
  }));
}

export function registerItemRoutes(app: Express): void {
  // ============ ITEMS ============

  // Get all items with event data and sponsors
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      const allItems = await storage.getAllItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(allItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending items with event and sponsors (for Arte module) - MUST come BEFORE /:eventId route
  app.get("/api/items/pending", requireAuth, async (req, res) => {
    try {
      const pendingItems = await storage.getPendingItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(pendingItems);
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
  app.get("/api/items/approved", requireAuth, async (req, res) => {
    try {
      const approvedItems = await storage.getApprovedItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(approvedItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items by event with sponsors - MUST come AFTER specific routes like /pending and /approved
  // Batch: retorna sponsors + approvals de todos os itens aguardando aprovação
  // em 3 queries totais, evitando o N*2 de chamadas individuais da página de atendimento.
  // DEVE ficar ANTES de /:eventId — senão Express captura "batch-approval-data" como eventId.
  app.get("/api/items/batch-approval-data", requireAuth, async (req, res) => {
    try {
      const [allSponsors, allItemSponsors, allApprovals] = await Promise.all([
        storage.getAllSponsors(),
        storage.getAllItemSponsors(),
        storage.getAllItemSponsorApprovals(),
      ]);

      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      // agrupa vínculos por item
      const sponsorsByItem: Record<string, any[]> = {};
      for (const is of allItemSponsors) {
        const sponsor = sponsorById.get(is.sponsorId);
        if (!sponsor) continue;
        (sponsorsByItem[is.itemId] ??= []).push(sponsor);
      }

      // agrupa approvals por item, enriquecendo com sponsor
      const approvalsByItem: Record<string, any[]> = {};
      for (const a of allApprovals) {
        const enriched = { ...a, sponsor: sponsorById.get(a.sponsorId) || null };
        (approvalsByItem[a.itemId] ??= []).push(enriched);
      }

      res.json({ sponsorsByItem, approvalsByItem });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/items/:eventId", requireAuth, async (req, res) => {
    try {
      const items = await storage.getItemsByEvent(req.params.eventId);
      const itemsWithSponsors = await enrichItemsWithEventsAndSponsors(items);
      res.json(itemsWithSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create item
  app.post("/api/items", requireAuth, async (req, res) => {
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
  app.post("/api/items/bulk", requireAuth, async (req, res) => {
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


  // ── Export items to Excel (.xlsx) ────────────────────────────────────────
  app.get("/api/events/:id/export-items", requireAuth, handleExportItemsXlsx);
  // Exportação da Gráfica: recebe os ids já filtrados pela tela.
  app.post("/api/items/export-xlsx", requireAuth, handleExportSelectedItemsXlsx);


  // Import de Excel usa o fluxo preview → confirm (abaixo). O endpoint direto
  // /import-xlsx (parser legado) foi removido: importava a aba errada em
  // planilhas cujo cabeçalho usa "cód peça" em vez de "item" e não vinculava
  // patrocinadores.

  // ── Preview Excel items (parse without saving) ───────────────────────────
  app.post("/api/events/:id/preview-xlsx", requireAuth, handlePreviewXlsx);

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  app.post("/api/events/:id/confirm-import", requireAuth, handleConfirmImport);


  // ── Clone items from another event ───────────────────────────────────────
  app.post("/api/events/:id/clone-items", requireAuth, async (req, res) => {
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
        status: "draft" as const,
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
  app.patch("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const validatedData = insertItemSchema.partial().parse(req.body);

      // Normalize referenceUrl from raw GCS URL to /objects/ proxy path and
      // record an ACL policy so the object is attributed to its uploader.
      // Reference photos/art files are treated as "public" to any
      // authenticated user, matching the pre-existing behavior where objects
      // with no ACL policy were freely accessible to anyone logged in.
      if (validatedData.referenceUrl) {
        const { ObjectStorageService } = await import("../objectStorage");
        const objectStorageService = new ObjectStorageService();
        try {
          validatedData.referenceUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            validatedData.referenceUrl,
            { owner: req.userId!, visibility: "public" }
          );
        } catch {
          // Object may not exist in storage yet (e.g. legacy/external URL) —
          // fall back to just normalizing the path without setting an ACL.
          validatedData.referenceUrl = objectStorageService.normalizeObjectEntityPath(validatedData.referenceUrl);
        }
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

  // Delete item (soft delete — preservado no histórico)
  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      const isAdmin = req.userRole === "admin";
      const isSolicitacao = req.userRole === "solicitacao";

      if (!isAdmin && !isSolicitacao) {
        return res.status(403).json({ error: "Sem permissão para excluir peças" });
      }

      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Atendimento só pode excluir peças que ainda não foram liberadas para Arte/Gráfica
      const LOCKED_STATUSES = [
        "awaiting_submission", "awaiting_approval", "awaiting_final_review",
        "ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered",
      ];
      if (isSolicitacao && LOCKED_STATUSES.includes(item.status)) {
        return res.status(403).json({
          error: "Não é possível excluir uma peça que já foi enviada para Arte ou está em produção",
        });
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
        `Item "${item.type}" (${item.displayId}) excluído por ${req.userRole}`
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
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)} (sem aprovação de patrocinador)`
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
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)}`
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

  // Arte dispenses item (bypasses remaining approval steps → ready_for_production)
  app.patch("/api/items/:id/dispense", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem dispensar itens" });
      }
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Item not found" });
      const dispensableStatuses = ["awaiting_submission", "awaiting_sponsor_approval", "sponsor_approved", "awaiting_creator_review"];
      if (!dispensableStatuses.includes(currentItem.status)) {
        return res.status(409).json({ error: `Item não pode ser dispensado no status atual: ${currentItem.status}` });
      }
      const { reason } = req.body;
      await storage.updateItem(req.params.id, { status: "ready_for_production" });
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
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      
      const validatedData = finalFileSchema.parse(req.body);
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // sponsor_approved: normal flow after sponsor approval
      // awaiting_creator_review: skipApproval / no-sponsor flow (sponsor approval skipped)
      if (currentItem.status !== "sponsor_approved" && currentItem.status !== "awaiting_creator_review") {
        return res.status(409).json({ 
          error: `Item não pode receber arquivo final. Status atual: ${currentItem.status}, esperado: sponsor_approved ou awaiting_creator_review` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
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

  // Arte atualiza o caminho do arquivo final já enviado (sem mudar o status do item)
  // Troca o thumb de aprovação já existente, preservando o anterior. Serve para
  // corrigir o material de referência sem reabrir a aprovação dos patrocinadores
  // (para isso existe a rota de reenvio, que muda o status).
  app.patch("/api/items/:id/update-thumb", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o thumb" });
      }

      const { approvalThumbUrl } = z
        .object({ approvalThumbUrl: z.string().min(1, "approvalThumbUrl não pode estar vazio") })
        .parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (!currentItem.approvalThumbUrl) {
        return res.status(409).json({ error: "Este item ainda não possui um thumb enviado" });
      }
      if (currentItem.approvalThumbUrl === approvalThumbUrl) {
        return res.status(409).json({ error: "O thumb enviado é igual ao atual" });
      }

      const prevUrl = currentItem.approvalThumbUrl;

      const item = await storage.updateItem(req.params.id, {
        approvalThumbUrl,
        previousApprovalThumbUrl: prevUrl,
        approvalThumbUpdatedAt: new Date(),
      });
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      await createAuditLog(
        req.userName!,
        'updated',
        'item',
        item.id,
        `Thumb de aprovação atualizado por ${req.userName}. Anterior: ${prevUrl} → Novo: ${approvalThumbUrl}`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/items/:id/update-final-file", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o arquivo final" });
      }

      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio"),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      const validatedData = finalFileSchema.parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      if (!currentItem.finalFileUrl) {
        return res.status(409).json({ error: "Este item ainda não possui um arquivo final enviado" });
      }

      const prevUrl  = currentItem.finalFileUrl;
      const prevName = currentItem.finalFileName || null;

      const item = await storage.updateItem(req.params.id, {
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
        previousFinalFileUrl:  prevUrl,
        previousFinalFileName: prevName,
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
        `Arquivo final substituído por ${req.userName}. Anterior: ${prevUrl} → Novo: ${validatedData.finalFileUrl}`
      );

      // Notifica gráfica que o arquivo foi trocado e precisa ser re-verificado
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `⚠ Arquivo final atualizado: ${item.type}${event ? ` — ${event.name}` : ""} (verifique antes de produzir)`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
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
      
      // Idempotente: se a peça JÁ foi liberada (ou já avançou na produção), não
      // é erro clicar "Liberar" de novo (lista desatualizada / clique duplo) —
      // só devolve a peça como sucesso, sem reprocessar.
      const alreadyReleased = [
        "ready_for_production", "approved", "pronto_para_producao", "liberado",
        "inProduction", "em_producao", "produced", "produzido", "conferred", "delivered", "entregue",
      ].includes(currentItem.status);
      if (alreadyReleased) {
        return res.json(currentItem);
      }
      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({
          error: `Item não pode ser revisado pelo criador. Status atual: ${translateStatus(currentItem.status)}, esperado: Aguardando Revisão Final`
        });
      }

      // Reaproveitamento parcial: body pode trazer { reuseQty } quando a Solicitação
      // quer reaproveitar só algumas unidades, enviando o restante para produção.
      const rawReuseQty = req.body?.reuseQty != null ? Number(req.body.reuseQty) : undefined;
      const askedReuse = rawReuseQty != null && !isNaN(rawReuseQty) && rawReuseQty > 0;
      // Pedir a quantidade inteira pelo campo do parcial é reaproveitamento
      // total. Antes esse caso caía fora das duas condições e a peça seguia para
      // produção como se nada tivesse sido pedido, sem aviso nenhum.
      const isFullReuse = currentItem.isReuse || (askedReuse && rawReuseQty! >= currentItem.quantity);
      const isPartialReuse = askedReuse && !isFullReuse;

      // Peças de reaproveitamento total não passam pela produção: já entram como produzidas.
      // Reaproveitamento parcial vai para ready_for_production (as demais unidades precisam produzir).
      const nextStatus = isFullReuse ? "produced" : "ready_for_production";

      const item = await storage.updateItem(req.params.id, {
        status: nextStatus,
        creatorReviewedAt: new Date(),
        hasModifiedData: false, // Reset flag - Gráfica vê como dados novos
        ...(isPartialReuse ? { reuseQty: rawReuseQty!, isReuse: false } : {}),
        // Reuso total também grava a quantidade: sem isso a peça fica marcada
        // sem registro de quantas unidades foram reaproveitadas, e a Gráfica
        // trata como legado.
        ...(isFullReuse ? { reuseQty: currentItem.quantity, isReuse: true } : {}),
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
        // O parcial não era mencionado no log: a peça aparecia no histórico
        // apenas como "liberado para produção", sem registro do reaproveitamento.
        isFullReuse
          ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("produced")} (reaproveitamento — não precisa produzir)`
          : isPartialReuse
            ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (reaproveitamento parcial: ${rawReuseQty} un. de ${currentItem.quantity}, ${currentItem.quantity - rawReuseQty!} a produzir)`
            : `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (liberado para produção)`
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
  app.patch("/api/items/:id/approve", requireAuth, async (req, res) => {
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
  app.patch("/api/items/:id/start-production", requireAuth, async (req, res) => {
    try {
      const { quantityProduced } = req.body;
      
      if (!quantityProduced || quantityProduced <= 0) {
        return res.status(400).json({ error: "quantityProduced is required and must be greater than 0" });
      }
      
      // Status antes da produção, só para descrever a transição no histórico.
      const before = await storage.getItem(req.params.id);

      const item = await storage.startProduction(req.params.id, quantityProduced);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Esta é a rota que a tela da Gráfica usa. Sem este log, "Em produção" e
      // "Produzido" não apareciam no Histórico.
      await createAuditLog(
        (req as any).userName,
        item.status === "produced" ? "produced" : "production",
        "item",
        item.id,
        `Produção: ${quantityProduced}/${item.quantity} un.${before ? ` (${translateStatus(before.status)} → ${translateStatus(item.status)})` : ""}`
      );

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

  // Gráfica marca unidades como reaproveitamento — total ou parcial. As unidades
  // reaproveitadas dispensam produção, mas continuam passando pela conferência
  // junto com as produzidas.
  app.post("/api/items/:id/mark-reuse", requireAuth, async (req, res) => {
    try {
      if ((req as any).userRole !== "grafica" && (req as any).userRole !== "admin" && (req as any).userRole !== "solicitacao") {
        return res.status(403).json({ error: "Apenas a Gráfica ou Solicitação pode marcar reaproveitamento" });
      }
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      if (current.status === "delivered" || current.status === "entregue") {
        return res.status(409).json({ error: "Não é possível reaproveitar uma peça já entregue" });
      }
      // Permite marcar como reaproveitamento enquanto a peça ainda está no fluxo de produção
      const allowedStatuses = [
        "ready_for_production", "pronto_para_producao", "approved",
        "inProduction", "em_producao",
      ];
      if (!allowedStatuses.includes(current.status)) {
        return res.status(409).json({ error: `Status atual não permite reaproveitamento: ${translateStatus(current.status)}` });
      }

      const alreadyReused = current.reuseQty || 0;
      const produced = current.quantityProduced || 0;
      // O reuso não pode invadir o que já foi produzido.
      const room = current.quantity - alreadyReused - produced;
      if (room <= 0) {
        return res.status(409).json({ error: `Nada a reaproveitar: ${alreadyReused} reaproveitada(s) e ${produced} produzida(s) de ${current.quantity}.` });
      }

      // Sem quantidade no corpo, reaproveita tudo o que resta (comportamento antigo).
      const n = Math.min(room, Math.max(1, Number(req.body?.qty) || room));
      const newReuse = alreadyReused + n;
      const isFullReuse = newReuse >= current.quantity;
      // Fecha em "Produzido" quando reuso + produção cobrem a quantidade toda.
      const isReady = newReuse + produced >= current.quantity;

      const item = await storage.updateItem(req.params.id, {
        reuseQty: newReuse,
        isReuse: isFullReuse,
        ...(isReady ? { status: "produced" as const } : {}),
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      await createAuditLog(
        (req as any).userName!,
        'updated',
        'item',
        item.id,
        isFullReuse
          ? `Reaproveitamento total pela Gráfica: ${newReuse}/${current.quantity} un.`
          : `Reaproveitamento parcial pela Gráfica: ${n} un. (${newReuse}/${current.quantity} reaproveitadas, ${current.quantity - newReuse} a produzir)`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Corrige reaproveitamento total que foi marcado por engano na Solicitação.
  // Só disponível enquanto a peça ainda não foi conferida (status = produced, conferredQty = 0).
  app.post("/api/items/:id/correct-reuse", requireAuth, async (req, res) => {
    try {
      if (
        (req as any).userRole !== "grafica" &&
        (req as any).userRole !== "admin" &&
        (req as any).userRole !== "solicitacao"
      ) {
        return res.status(403).json({ error: "Apenas a Gráfica, Solicitação ou Admin pode corrigir reaproveitamento" });
      }

      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });

      if (current.status !== "produced" && current.status !== "produzido") {
        return res.status(409).json({ error: "Correção disponível apenas para peças com status Produzido" });
      }
      if ((current.conferredQty || 0) > 0) {
        return res.status(409).json({ error: "Não é possível corrigir: a peça já foi parcialmente conferida" });
      }
      // Reuso antigo vai direto para a entrega sem conferir: sem esta checagem,
      // uma peça com unidades já entregues voltaria para "Pronto p/ Produção"
      // carregando deliveredQty, e a contagem de entrega ficaria inconsistente.
      if ((current.deliveredQty || 0) > 0) {
        return res.status(409).json({ error: `Não é possível corrigir: ${current.deliveredQty} un. já foram entregues` });
      }
      if ((current.reuseQty || 0) === 0 && !current.isReuse) {
        return res.status(409).json({ error: "Peça não tem reaproveitamento para corrigir" });
      }

      // Só faz sentido corrigir para MENOS que o total: reaproveitar tudo é o
      // que já estava valendo. Por isso o intervalo aceito é 0..quantidade-1.
      const correctedReuseQty = Number(req.body?.correctedReuseQty);
      if (isNaN(correctedReuseQty) || correctedReuseQty < 0 || correctedReuseQty >= current.quantity) {
        return res.status(400).json({
          error: `Quantidade corrigida inválida (deve ser entre 0 e ${current.quantity - 1})`,
        });
      }

      const item = await storage.updateItem(req.params.id, {
        reuseQty: correctedReuseQty,
        isReuse: false,
        // Sempre sobra o que produzir, então a peça volta para a fila da produção.
        status: "ready_for_production" as const,
        // A produção lançada antes da marcação errada não vale mais para a
        // quantidade que agora precisa ser impressa.
        quantityProduced: null,
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      await createAuditLog(
        (req as any).userName!,
        "updated",
        "item",
        item.id,
        correctedReuseQty === 0
          ? `Reaproveitamento removido por correção — peça voltou para Pronto para Produção (${current.quantity} un. a produzir)`
          : `Reaproveitamento corrigido: ${correctedReuseQty}/${current.quantity} un. reaproveitadas, ${current.quantity - correctedReuseQty} a produzir`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Gráfica confere a peça produzida (com foto). Suporta conferência parcial.
  app.post("/api/items/:id/confer", requireAuth, async (req, res) => {
    try {
      if ((req as any).userRole !== "grafica" && (req as any).userRole !== "admin") {
        return res.status(403).json({ error: "Apenas a Gráfica pode conferir" });
      }
      const { conferencePhotoUrl, qty, notes } = req.body ?? {};
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      if (!conferencePhotoUrl && !current.conferencePhotoUrl) {
        return res.status(400).json({ error: "Foto da conferência é obrigatória" });
      }
      // Conferência acontece a partir de Produzido (e continua enquanto parcial).
      const alreadyConferred = current.conferredQty || 0;
      const remaining = current.quantity - alreadyConferred;
      if (current.status !== "produced" || remaining <= 0) {
        return res.status(409).json({ error: `Nada a conferir. Status: ${translateStatus(current.status)} (${alreadyConferred}/${current.quantity})` });
      }
      // Quantidade desta conferência (padrão: o que falta). Limita ao restante.
      const n = Math.min(remaining, Math.max(1, Number(qty) || remaining));
      const newConferred = alreadyConferred + n;
      const isFull = newConferred >= current.quantity;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      const item = await storage.updateItem(req.params.id, {
        conferredQty: newConferred,
        conferencePhotoUrl: conferencePhotoUrl || current.conferencePhotoUrl || null,
        conferredAt: isFull ? new Date() : current.conferredAt,
        ...(trimmedNotes ? { conferenceNotes: trimmedNotes } : {}),
        // Status só vira "conferred" quando conferiu tudo; parcial continua "produced".
        ...(isFull ? { status: "conferred" as const } : {}),
      });
      await createAuditLog((req as any).userName, 'updated', 'item', req.params.id,
        (isFull ? `Conferência concluída (${newConferred}/${current.quantity})` : `Conferência parcial: ${n} un. (${newConferred}/${current.quantity})`)
        + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : ""));
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark item as delivered (Gráfica module)
  app.patch("/api/items/:id/deliver", requireAuth, async (req, res) => {
    try {
      const { receivedBy, photoUrl, notes } = req.body;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      if (!receivedBy) {
        return res.status(400).json({ error: "receivedBy is required" });
      }
      
      // Pegar status anterior antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Entrega parcial: acumula deliveredQty; só vira "delivered" quando entrega
      // tudo. Só se entrega o que já foi conferido — inclusive o reaproveitamento,
      // que também passa pela conferência.
      //
      // Exceção para o legado: peças marcadas como reuso ANTES de reuse_qty
      // existir têm reuseQty = 0 e nunca passaram por conferência, porque a regra
      // antiga as mandava direto para a entrega. Exigir conferência delas agora
      // travaria entregas já em andamento, então seguem pela regra antiga.
      const legacyReuse = currentItem.isReuse && (currentItem.reuseQty || 0) === 0;
      const alreadyDelivered = currentItem.deliveredQty || 0;
      const maxDeliverable = legacyReuse ? currentItem.quantity : (currentItem.conferredQty || 0);
      const remaining = maxDeliverable - alreadyDelivered;
      if (remaining <= 0) {
        return res.status(409).json({ error: `Nada a entregar. Entregue ${alreadyDelivered}/${currentItem.quantity}${legacyReuse ? "" : ` (conferido ${currentItem.conferredQty || 0})`}.` });
      }
      const n = Math.min(remaining, Math.max(1, Number(req.body.qty) || remaining));
      const newDelivered = alreadyDelivered + n;
      const isFullDelivery = newDelivered >= currentItem.quantity;

      const item = await storage.updateItem(req.params.id, {
        deliveredQty: newDelivered,
        receivedBy,
        deliveryPhotoUrl: photoUrl || currentItem.deliveryPhotoUrl || null,
        ...(trimmedNotes ? { deliveryNotes: trimmedNotes } : {}),
        ...(isFullDelivery ? { status: "delivered" as const, deliveredAt: new Date() } : {}),
      });
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
        (isFullDelivery
          ? `Entrega concluída (${newDelivered}/${currentItem.quantity}, recebido por: ${receivedBy})`
          : `Entrega parcial: ${n} un. (${newDelivered}/${currentItem.quantity}, recebido por: ${receivedBy})`)
        + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : "")
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
  // Vincula um PDF de book (layout pronto) às peças selecionadas de um evento.
  // Usado pela Arte para enviar o book aos patrocinadores enquanto a exportação
  // automática não está 100%. Aceita { bookUrl, itemIds }.
  app.post("/api/events/:eventId/book", requireAuth, async (req, res) => {
    try {
      const { bookUrl, itemIds } = req.body ?? {};
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma peça" });
      }
      if (bookUrl !== null && (typeof bookUrl !== "string" || !bookUrl.trim())) {
        return res.status(400).json({ error: "bookUrl inválido" });
      }
      // Limpa o bookUrl antigo de TODOS os itens do evento antes de setar o novo.
      // Isso garante que itens não selecionados não fiquem com URL obsoleta,
      // evitando que a exportação abra a versão antiga do book.
      await storage.clearEventBookUrl(req.params.eventId);
      const count = await storage.setItemsBookUrl(itemIds, bookUrl || null);
      await createAuditLog(
        (req as any).userName,
        'updated',
        'event',
        req.params.eventId,
        bookUrl ? `Book de aprovação vinculado a ${count} peça(s)` : `Book removido de ${count} peça(s)`
      );
      broadcast({ type: "items_book_updated", eventId: req.params.eventId, count });
      res.json({ updated: count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/items/:id/production", requireAuth, async (req, res) => {
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

      // Registra QUEM produziu — sem este log o histórico não tem autor e acaba
      // exibindo o fallback "Sistema".
      await createAuditLog(
        (req as any).userName,
        newStatus === "produced" ? "produced" : "production",
        "item",
        item.id,
        `Produção: ${validatedData.quantityProduced}/${item.quantity} un. (${translateStatus(item.status)} → ${translateStatus(newStatus)})`
      );

      // Não notificar sobre atualizações de produção

      broadcast({ type: "production_updated", item: updatedItem, update: productionUpdate });
      
      res.json({ item: updatedItem, update: productionUpdate });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

}
