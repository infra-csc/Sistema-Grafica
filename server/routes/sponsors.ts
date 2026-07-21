// Sponsor, quota-rule, event-sponsor, and item-sponsor routes. Extracted from server/routes.ts.
import fs from "fs";
import path from "path";
import type { Express } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { insertSponsorSchema, insertEventSponsorSchema, insertItemSponsorSchema } from "@shared/schema";
import {
  requireAuth,
  requireAdmin,
  broadcast,
  translateStatus,
  createAuditLog,
  updateEventStatus,
} from "./shared";

export function registerSponsorRoutes(app: Express): void {
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

  // ── Global quota rules (JSON-file backed, no schema change needed) ──
  const GLOBAL_QUOTA_FILE = path.join(process.cwd(), "global-quota-rules.json");

  function readGlobalQuotaRules(): { quota: string; itemTypes: string[] }[] {
    try {
      if (fs.existsSync(GLOBAL_QUOTA_FILE)) {
        return JSON.parse(fs.readFileSync(GLOBAL_QUOTA_FILE, "utf8"));
      }
    } catch { /* ignore */ }
    return [];
  }

  function writeGlobalQuotaRules(rules: { quota: string; itemTypes: string[] }[]): void {
    fs.writeFileSync(GLOBAL_QUOTA_FILE, JSON.stringify(rules, null, 2), "utf8");
  }

  app.get("/api/quota-rules/global", requireAuth, (_req, res) => {
    res.json(readGlobalQuotaRules());
  });

  app.put("/api/quota-rules/global", requireAuth, (req, res) => {
    try {
      const { quota, itemTypes } = req.body as { quota: string; itemTypes: string[] };
      if (!quota) return res.status(400).json({ error: "quota é obrigatório" });
      const rules = readGlobalQuotaRules().filter(r => r.quota !== quota);
      rules.push({ quota, itemTypes: itemTypes ?? [] });
      writeGlobalQuotaRules(rules);
      res.json({ quota, itemTypes: itemTypes ?? [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Returns distinct parent group types from standard_items (canonical group names)
  app.get("/api/quota-rules/groups", requireAuth, async (_req, res) => {
    try {
      // Always merge distinct types from standard_items AND items tables
      const result = await pool.query(
        `SELECT DISTINCT type FROM (
           SELECT type FROM standard_items WHERE type IS NOT NULL AND type <> ''
           UNION
           SELECT type FROM items WHERE type IS NOT NULL AND type <> ''
         ) combined
         ORDER BY type`
      );
      const groups = result.rows.map((r: any) => r.type as string);
      res.json(groups);
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
      
      // Update item with skipApproval (status "Enviar" transition still requires explicit user action)
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      const itemUpdates: any = { skipApproval: skipApproval || false };

      // No automatic status transition here — only the creator (Solicitação)
      // can move items from Rascunho → Aguardando Vinculação via the submit endpoint.
      
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

      const allowedStatuses = ['draft', 'requested', 'awaiting_linking', 'awaiting_submission'];
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

  // Send items to Arte (bulk) - changes status from 'awaiting_linking' to 'awaiting_submission'
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
          
          // Items with status 'awaiting_linking' can be sent to Arte (submitted by creator)
          if (item.status !== 'awaiting_linking') {
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

}
