// Inventory-asset (acervo) routes: CRUD, triage, dispatch/return, allocations.
// Extracted from server/routes.ts (INVENTORY ASSETS section).
import type { Express } from "express";
import { z } from "zod";
import { eq, like } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { insertInventoryAssetSchema, inventoryAssets, auditLogs } from "@shared/schema";
import { requireAuth, requireRole, broadcast, createAuditLog } from "./shared";

// Escritas no acervo: Gráfica e admin (dono, 14/09 — quem recebe o material
// na volta do caminhão faz a triagem e registra onde guardou). Excluir peça e
// disparar saída/retorno à mão seguem só do admin. Leituras seguem abertas a
// qualquer autenticado (várias telas consultam o acervo).
const requireInventoryWrite = requireRole("admin", "grafica");
const requireInventoryAdmin = requireRole("admin");

// EM_USO e AGUARDANDO_TRIAGEM são definidos exclusivamente pelo ciclo do
// evento (dispatch/return/triage) — o CRUD genérico não pode gravá-los.
const CYCLE_ONLY_STATUSES = ["EM_USO", "AGUARDANDO_TRIAGEM"];
const cycleStatusError =
  "Status controlado pelo ciclo do evento (despacho, retorno e triagem) — escolha NO_GALPAO ou DESCARTADO.";

// Validação da triagem simples (condição + destino).
const triageSchema = z.object({
  condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]).optional(),
  notes: z.string().nullish(),
  trackingStatus: z.enum(["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"]).optional(),
  location: z.string().max(120).nullish(),
});

// Destino da triagem (14/09): "Manutenção" virou situação própria. Antes ela
// gravava NO_GALPAO + Avaria Leve, e a peça avariada seguia aparecendo como
// disponível para reaproveitar.
const destinoDaTriagem = (s?: string | null) =>
  s === "DESCARTADO" ? "DESCARTADO" : s === "EM_MANUTENCAO" ? "EM_MANUTENCAO" : "NO_GALPAO";

// Nenhuma das 5.008 peças do acervo tinha local em 14/09 — e "onde está a
// peça" é a primeira pergunta de quem vai reaproveitar. Voltar ao galpão
// exige dizer onde.
const SEM_LOCAL = "Informe onde a peça foi guardada no galpão — sem o local, ninguém a encontra para reaproveitar.";

// Validação de cada lote da triagem por quantidade.
const triageSplitSchema = z.object({
  splits: z
    .array(
      z.object({
        qty: z.number().int().min(1),
        condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]),
        trackingStatus: z.enum(["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"]),
        notes: z.string().nullish(),
        location: z.string().max(120).nullish(),
      }),
    )
    .min(1),
  // Local comum a todos os lotes (cada lote pode trazer o seu).
  location: z.string().max(120).nullish(),
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
          eventId: event?.id ?? null,
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
      if (data.trackingStatus && CYCLE_ONLY_STATUSES.includes(data.trackingStatus)) {
        return res.status(400).json({ error: cycleStatusError });
      }
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
      if (data.trackingStatus && CYCLE_ONLY_STATUSES.includes(data.trackingStatus)) {
        return res.status(400).json({ error: cycleStatusError });
      }
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

  app.delete("/api/inventory/:id", requireInventoryAdmin, async (req, res) => {
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
      const { condition, notes, trackingStatus, location } = triageSchema.parse(req.body);
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });
      const newStatus = destinoDaTriagem(trackingStatus);
      const local = (location ?? "").trim() || asset.location || null;
      if (newStatus === "NO_GALPAO" && !local) return res.status(400).json({ error: SEM_LOCAL });
      const updated = await storage.updateInventoryAsset(req.params.id, {
        condition: condition ?? asset.condition,
        notes: notes ?? asset.notes,
        trackingStatus: newStatus,
        location: local,
      } as any);
      const triagedBy = (req as any).userName || 'Sistema';
      await createAuditLog(triagedBy, 'triagem', 'inventory_asset', req.params.id,
        JSON.stringify({ destino: newStatus, condicao: condition ?? asset.condition, local }));
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

      const { splits, location } = triageSplitSchema.parse(req.body);

      const totalQty = splits.reduce((s, sp) => s + (sp.qty ?? 0), 0);
      if (totalQty !== (asset.quantity ?? 1))
        return res.status(400).json({ error: `Soma das quantidades (${totalQty}) não bate com o total do ativo (${asset.quantity})` });

      const localDoLote = (sp: { location?: string | null }) =>
        (sp.location ?? "").trim() || (location ?? "").trim() || asset.location || null;
      if (splits.some((sp) => destinoDaTriagem(sp.trackingStatus) === "NO_GALPAO" && !localDoLote(sp))) {
        return res.status(400).json({ error: SEM_LOCAL });
      }

      const triagedBy = (req as any).userName || 'Sistema';
      const firstStatus = destinoDaTriagem(splits[0].trackingStatus);

      // Atômico: redução do original + clones + auditoria na MESMA transação
      // (padrão de routes/items.ts). Antes, uma falha no meio dos clones
      // deixava o original já reduzido e unidades sumiam do acervo. O storage
      // não aceita `tx`, então as operações usam as tabelas do drizzle aqui.
      await db.transaction(async (tx) => {
        // Original fica com o primeiro lote
        await tx.update(inventoryAssets)
          .set({
            condition: splits[0].condition,
            notes: splits[0].notes ?? asset.notes,
            trackingStatus: firstStatus,
            location: localDoLote(splits[0]),
            quantity: splits[0].qty,
            updatedAt: new Date(),
          })
          .where(eq(inventoryAssets.id, req.params.id));

        await tx.insert(auditLogs).values({
          userName: triagedBy,
          action: 'triagem',
          entityType: 'inventory_asset',
          entityId: req.params.id,
          details: JSON.stringify({ destino: firstStatus, condicao: splits[0].condition, lotes: splits.length }),
        });

        // displayId dos lotes: o código da peça dividida + "-L2", "-L3"… — o
        // lote continua dizendo de que peça saiu. Antes virava "#EST-0063", um
        // número solto fora do padrão #EST-<peça>-<seq> do resto do acervo.
        // O maior -L já usado é lido dentro da transação: dividir a mesma peça
        // de novo, meses depois, não repete código. Uma colisão com escrita
        // concorrente viola o unique e reverte a transação INTEIRA.
        const lotesAnteriores = await tx
          .select({ displayId: inventoryAssets.displayId })
          .from(inventoryAssets)
          .where(like(inventoryAssets.displayId, `${asset.displayId}-L%`));
        let ultimoLote = lotesAnteriores.reduce((max, r) => {
          const m = r.displayId.match(/-L(\d+)$/);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 1);

        for (let i = 1; i < splits.length; i++) {
          const sp = splits[i];
          const spStatus = destinoDaTriagem(sp.trackingStatus);
          ultimoLote += 1;
          const [clone] = await tx.insert(inventoryAssets).values({
            displayId: `${asset.displayId}-L${ultimoLote}`,
            name: asset.name,
            condition: sp.condition,
            trackingStatus: spStatus,
            quantity: sp.qty,
            notes: sp.notes ?? null,
            location: localDoLote(sp),
            franchiseTags: asset.franchiseTags,
            sponsorIds: asset.sponsorIds,
            approvalThumbUrl: asset.approvalThumbUrl,
            autoAdded: asset.autoAdded,
            originalItemId: asset.originalItemId,
          }).returning();

          // Auditoria por clone criado no split — rastreia origem e lote.
          await tx.insert(auditLogs).values({
            userName: triagedBy,
            action: 'triagem',
            entityType: 'inventory_asset',
            entityId: clone.id,
            details: JSON.stringify({ destino: spStatus, condicao: sp.condition, origem: req.params.id, lote: `${i + 1}/${splits.length}` }),
          });
        }
      });

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
  app.post("/api/events/:id/dispatch-inventory", requireInventoryAdmin, async (req, res) => {
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
  app.post("/api/events/:id/return-inventory", requireInventoryAdmin, async (req, res) => {
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

  app.post("/api/events/:id/allocations", requireInventoryAdmin, async (req, res) => {
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

  app.delete("/api/allocations/:id", requireInventoryAdmin, async (req, res) => {
    try {
      const success = await storage.deallocateAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Alocação não encontrada" });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Erro ao desalocar peça" });
    }
  });

}
