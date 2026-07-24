// Standard-item catalog routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { insertStandardItemSchema, insertCatalogOptionSchema } from "@shared/schema";
import { requireAuth, broadcast, createAuditLog } from "./shared";

export function registerStandardItemRoutes(app: Express): void {
  // ============ STANDARD ITEMS ============

  app.get("/api/standard-items", requireAuth, async (req, res) => {
    try {
      const items = await storage.getAllStandardItems();
      res.json(items);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ CATÁLOGO DE OPÇÕES (material/acabamento/grupo) ============

  app.get("/api/catalog-options", requireAuth, async (req, res) => {
    try {
      const kind = typeof req.query.kind === "string" ? req.query.kind : undefined;
      res.json(await storage.getCatalogOptions(kind));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/catalog-options", requireAuth, async (req, res) => {
    try {
      const validated = insertCatalogOptionSchema.parse(req.body);
      const option = await storage.createCatalogOption(validated);
      broadcast({ type: "catalog_option_created", option });
      res.status(201).json(option);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/catalog-options", requireAuth, async (req, res) => {
    try {
      const { kind, value } = req.body ?? {};
      if (!kind || !value) return res.status(400).json({ error: "kind e value são obrigatórios" });
      const ok = await storage.deleteCatalogOption(kind, value);
      broadcast({ type: "catalog_option_deleted", kind, value });
      res.json({ deleted: ok });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/standard-items", requireAuth, async (req, res) => {
    try {
      const validatedData = insertStandardItemSchema.parse(req.body);
      const item = await storage.createStandardItem(validatedData);
      
      broadcast({ type: "standard_item_created", item });
      
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Rename all standard items in a group
  app.patch("/api/standard-items/rename-group", requireAuth, async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemGroup(oldName, newName.trim());
      broadcast({ type: "standard_item_group_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a group from all standard items
  app.delete("/api/standard-items/clear-group", requireAuth, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemGroup(name);
      broadcast({ type: "standard_item_group_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Rename a finish across all standard items
  app.patch("/api/standard-items/rename-finish", requireAuth, async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemFinish(oldName, newName.trim());
      broadcast({ type: "standard_item_finish_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a finish from all standard items
  app.delete("/api/standard-items/clear-finish", requireAuth, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemFinish(name);
      broadcast({ type: "standard_item_finish_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Rename a material across all standard items
  app.patch("/api/standard-items/rename-material", requireAuth, async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemMaterial(oldName, newName.trim());
      broadcast({ type: "standard_item_material_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a material from all standard items
  app.delete("/api/standard-items/clear-material", requireAuth, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemMaterial(name);
      broadcast({ type: "standard_item_material_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update standard item
  app.patch("/api/standard-items/:id", requireAuth, async (req, res) => {
    try {
      const validatedData = insertStandardItemSchema.partial().parse(req.body);
      const item = await storage.updateStandardItem(req.params.id, validatedData);
      
      if (!item) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'updated',
        'standardItem',
        req.params.id,
        `Modelo "${item.name}" atualizado`
      );
      
      broadcast({ type: "standard_item_updated", item });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete standard item
  app.delete("/api/standard-items/:id", requireAuth, async (req, res) => {
    try {
      const item = await storage.getStandardItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Modelo não encontrado" });
      }
      
      await storage.deleteStandardItem(req.params.id);
      
      // Create audit log
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'standardItem',
        req.params.id,
        `Modelo "${item.name}" excluído`
      );
      
      broadcast({ type: "standard_item_deleted", itemId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
