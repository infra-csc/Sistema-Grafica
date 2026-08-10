// Inventory-asset (acervo) routes: CRUD, triage, dispatch/return, allocations.
// Extracted from server/routes.ts (INVENTORY ASSETS section).
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertInventoryAssetSchema } from "@shared/schema";
import { requireAuth, requireRole, broadcast, createAuditLog } from "./shared";

// Escritas no acervo são restritas a admin — as telas /estoque e
// /triagem-retorno já são admin-only no frontend. Leituras seguem abertas a
// qualquer autenticado (várias telas consultam o acervo).
const requireInventoryWrite = requireRole("admin");

// Validação da triagem simples (condição + destino).
const triageSchema = z.object({
  condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]).optional(),
  notes: z.string().nullish(),
  trackingStatus: z.enum(["NO_GALPAO", "DESCARTADO"]).optional(),
});

// Validação de cada lote da triagem por quantidade.
const triageSplitSchema = z.object({
  splits: z
    .array(
      z.object({
        qty: z.number().int().min(1),
        condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]),
        trackingStatus: z.enum(["NO_GALPAO", "DESCARTADO"]),
        notes: z.string().nullish(),
      }),
    )
    .min(1),
});

export function registerInventoryRoutes(app: Express): void {
  // ============ INVENTORY ASSETS (ACERVO) ============

  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getAllInventoryAssets();
      res.json(assets);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Erro ao buscar acervo" });
    }
  });

  app.get("/api/inventory/available/:franchise", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getAvailableAssetsByFranchise(req.params.franchise);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching available assets:", error);
      res.status(500).json({ error: "Erro ao buscar peças disponíveis" });
    }
  });

  // Must be before /:id to avoid being swallowed by that route
  app.get("/api/inventory/awaiting-triage", requireAuth, async (req, res) => {
    try {
      const [assets, allItems, allEvents, allSponsors] = await Promise.all([
        storage.getAssetsAwaitingTriage(),
        storage.getAllItems(),
        storage.getAllEvents(),
        storage.getAllSponsors(),
      ]);
      const itemMap = Object.fromEntries(allItems.map(i => [i.id, i]));
      const eventMap = Object.fromEntries(allEvents.map(e => [e.id, e]));
      const sponsorMap = Object.fromEntries(allSponsors.map(s => [s.id, s]));
      const enriched = assets.map(asset => {
        const item = asset.originalItemId ? itemMap[asset.originalItemId] : null;
        const event = item ? eventMap[item.eventId] : null;
        const sponsors = (asset.sponsorIds ?? [])
          .map(sid => sponsorMap[sid])
          .filter(Boolean)
          .map(s => ({ id: s.id, name: s.name }));
        return {
          ...asset,
          eventName: event?.name ?? null,
          eventDate: event?.startDate ?? null,
          sponsors,
        };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar ativos" });
    }
  });

  app.get("/api/inventory/:id/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getAssetAllocations(req.params.id);
      res.json(allocations);
    } catch (error) {
      console.error("Error fetching asset allocations:", error);
      res.status(500).json({ error: "Erro ao buscar histórico de eventos" });
    }
  });

  app.get("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Peça não encontrada" });
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar peça" });
    }
  });

  app.post("/api/inventory", requireInventoryWrite, async (req, res) => {
    try {
      // Valida contra o schema para impedir mass-assignment de colunas
      // arbitrárias (displayId, trackingStatus fora do enum, etc.).
      const data = insertInventoryAssetSchema.parse(req.body);
      const asset = await storage.createInventoryAsset(data as any);
      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      console.error("Error creating inventory asset:", error);
      res.status(500).json({ error: "Erro ao criar peça no acervo" });
    }
  });

  app.patch("/api/inventory/:id", requireInventoryWrite, async (req, res) => {
    try {
      const data = insertInventoryAssetSchema.partial().parse(req.body);
      const asset = await storage.updateInventoryAsset(req.params.id, data as any);
      if (!asset) return res.status(404).json({ error: "Peça não encontrada" });
      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      console.error("Error updating inventory asset:", error);
      res.status(500).json({ error: "Erro ao atualizar peça" });
    }
  });

  app.delete("/api/inventory/:id", requireInventoryWrite, async (req, res) => {
    try {
      const success = await storage.deleteInventoryAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Peça não encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao excluir peça" });
    }
  });

  // Triage endpoint: update condition + set back to NO_GALPAO (or DESCARTADO)
  app.patch("/api/inventory/:id/triage", requireInventoryWrite, async (req, res) => {
    try {
      const { condition, notes, trackingStatus } = triageSchema.parse(req.body);
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });
      const newStatus = trackingStatus === 'DESCARTADO' ? 'DESCARTADO' : 'NO_GALPAO';
      const updated = await storage.updateInventoryAsset(req.params.id, {
        condition: condition ?? asset.condition,
        notes: notes ?? asset.notes,
        trackingStatus: newStatus,
      } as any);
      const triagedBy = (req as any).userName || 'Sistema';
      await createAuditLog(triagedBy, 'triagem', 'inventory_asset', req.params.id,
        JSON.stringify({ destino: newStatus, condicao: condition ?? asset.condition }));
      broadcast({ type: 'inventory_triaged', assetId: req.params.id, trackingStatus: newStatus });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      res.status(500).json({ error: "Erro ao registrar triagem" });
    }
  });

  // Triage with quantity split: splits the asset into multiple records by qty
  app.post("/api/inventory/:id/triage-split", requireInventoryWrite, async (req, res) => {
    try {
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });

      const { splits } = triageSplitSchema.parse(req.body);

      const totalQty = splits.reduce((s, sp) => s + (sp.qty ?? 0), 0);
      if (totalQty !== (asset.quantity ?? 1))
        return res.status(400).json({ error: `Soma das quantidades (${totalQty}) não bate com o total do ativo (${asset.quantity})` });

      // Update original asset with first split
      const firstStatus = splits[0].trackingStatus === 'DESCARTADO' ? 'DESCARTADO' : 'NO_GALPAO';
      await storage.updateInventoryAsset(req.params.id, {
        condition: splits[0].condition as any,
        notes: splits[0].notes ?? asset.notes,
        trackingStatus: firstStatus,
        quantity: splits[0].qty,
      } as any);

      // Clone asset for each additional split (displayId auto-generated by storage)
      for (let i = 1; i < splits.length; i++) {
        const sp = splits[i];
        const spStatus = sp.trackingStatus === 'DESCARTADO' ? 'DESCARTADO' : 'NO_GALPAO';
        await storage.createInventoryAsset({
          name: asset.name,
          condition: sp.condition as any,
          trackingStatus: spStatus,
          quantity: sp.qty,
          notes: sp.notes ?? null,
          location: asset.location,
          franchiseTags: asset.franchiseTags,
          sponsorIds: asset.sponsorIds,
          approvalThumbUrl: asset.approvalThumbUrl,
          autoAdded: asset.autoAdded,
          originalItemId: asset.originalItemId,
        } as any);
      }

      const triagedBy = (req as any).userName || 'Sistema';
      await createAuditLog(triagedBy, 'triagem', 'inventory_asset', req.params.id,
        JSON.stringify({ destino: firstStatus, condicao: splits[0].condition, lotes: splits.length }));
      broadcast({ type: 'inventory_triaged', assetId: req.params.id, trackingStatus: firstStatus });
      res.json({ ok: true, splits: splits.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      console.error("Error in triage-split:", error);
      res.status(500).json({ error: "Erro ao registrar triagem por quantidade" });
    }
  });

  // Manual trigger: mark event assets EM_USO
  app.post("/api/events/:id/dispatch-inventory", requireInventoryWrite, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });
      const departure = event.truckDepartureDate ? new Date(event.truckDepartureDate) : new Date();
      const count = await storage.markAssetsInUseForEvent(req.params.id, departure);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Erro ao processar despacho" });
    }
  });

  // Manual trigger: mark event assets AGUARDANDO_TRIAGEM
  app.post("/api/events/:id/return-inventory", requireInventoryWrite, async (req, res) => {
    try {
      const count = await storage.markAssetsAwaitingTriageForEvent(req.params.id);
      if (count > 0) {
        const event = await storage.getEvent(req.params.id);
        broadcast({
          type: 'inventory_awaiting_triage',
          eventId: req.params.id,
          eventName: event?.name ?? '—',
          count,
          message: `Os materiais do evento "${event?.name ?? '—'}" retornaram e aguardam triagem.`,
        });
      }
      res.json({ count });
    } catch (error) {
      res.status(500).json({ error: "Erro ao processar retorno" });
    }
  });

  // Event Allocations
  app.get("/api/events/:id/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getEventAllocations(req.params.id);
      res.json(allocations);
    } catch (error) {
      res.status(500).json({ error: "Erro ao buscar alocações" });
    }
  });

  app.post("/api/events/:id/allocations", requireInventoryWrite, async (req, res) => {
    try {
      const { assetId } = req.body;
      if (!assetId || typeof assetId !== "string") return res.status(400).json({ error: "assetId é obrigatório" });
      const alloc = await storage.allocateAssetToEvent(req.params.id, assetId);
      res.status(201).json(alloc);
    } catch (error) {
      console.error("Error allocating asset:", error);
      res.status(500).json({ error: "Erro ao alocar peça" });
    }
  });

  app.delete("/api/allocations/:id", requireInventoryWrite, async (req, res) => {
    try {
      const success = await storage.deallocateAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Alocação não encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao desalocar peça" });
    }
  });

}
