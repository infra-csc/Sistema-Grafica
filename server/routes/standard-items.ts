// Standard-item catalog routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { insertStandardItemSchema, insertCatalogOptionSchema } from "@shared/schema";
import { requireAuth, requireRole, broadcast, createAuditLog } from "./shared";

// Gestão do catálogo de modelos (criar/editar/excluir modelos, renomear/limpar
// grupos, materiais e acabamentos em massa) vive na tela /modelos, que é
// solicitacao+admin. POST /api/catalog-options fica de fora: ele é aditivo e é
// chamado inline ao criar itens (event-detail), acessível a qualquer perfil.
const requireCatalogWrite = requireRole("solicitacao", "admin");

export function registerStandardItemRoutes(app: Express): void {
  // ============ STANDARD ITEMS ============

  // O USO DE CADA MODELO vem junto com o catálogo — um agregado, não N
  // requisições. Duas medidas, rotuladas de forma diferente na tela:
  //   exato      → peças com standard_item_id apontando para o modelo
  //                ("criadas a partir de"; o vínculo passou a ser gravado
  //                quando a peça nasce de um modelo).
  //   compativel → peças SEM vínculo com o mesmo tipo, material e medidas
  //                de arquivo (legado anterior à coluna; "compatíveis", não
  //                "criadas a partir" — a tela não promete o que não sabe).
  // Peça excluída (soft delete) não conta em nenhuma das duas.
  app.get("/api/standard-items", requireAuth, async (req, res) => {
    try {
      const [modelos, pecas] = await Promise.all([storage.getAllStandardItems(), storage.getAllItems()]);
      const num = (v: unknown) => { const x = parseFloat(String(v ?? "")); return Number.isFinite(x) ? x : null; };
      const chaveAssinatura = (type: unknown, material: unknown, fw: unknown, fh: unknown) =>
        `${String(type ?? "").trim().toLowerCase()}|${String(material ?? "").trim().toLowerCase()}|${num(fw) ?? ""}|${num(fh) ?? ""}`;
      const exato = new Map<string, { n: number; ultima: Date | null }>();
      const compativel = new Map<string, number>();
      for (const p of pecas) {
        if ((p as any).deletedAt) continue;
        const sid = (p as any).standardItemId as string | null | undefined;
        if (sid) {
          const e = exato.get(sid) ?? { n: 0, ultima: null };
          e.n += 1;
          const c = p.createdAt ? new Date(p.createdAt as any) : null;
          if (c && (!e.ultima || c > e.ultima)) e.ultima = c;
          exato.set(sid, e);
        } else {
          const k = chaveAssinatura(p.type, p.material, p.fileWidth, p.fileHeight);
          compativel.set(k, (compativel.get(k) ?? 0) + 1);
        }
      }
      res.json(modelos.map((m) => {
        const e = exato.get(m.id);
        // A peça grava `type = nome do modelo` (event-detail, Entrada Rápida).
        const k = chaveAssinatura(m.name, m.material, m.fileWidth, m.fileHeight);
        return { ...m, uso: { exato: e?.n ?? 0, compativel: compativel.get(k) ?? 0, ultimaEm: e?.ultima ?? null } };
      }));
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

  // Rótulo pt-BR do kind para os registros de auditoria.
  const kindLabel = (kind: string) =>
    kind === "group" ? "grupo" : kind === "material" ? "material" : kind === "finish" ? "acabamento" : kind;

  app.post("/api/catalog-options", requireAuth, async (req, res) => {
    try {
      const validated = insertCatalogOptionSchema.parse(req.body);
      const option = await storage.createCatalogOption(validated);
      await createAuditLog(
        (req as any).userName,
        'created',
        'catalogOption',
        option.value,
        `Opção "${option.value}" adicionada ao catálogo (${kindLabel(option.kind)})`
      );
      broadcast({ type: "catalog_option_created", option });
      res.status(201).json(option);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/catalog-options", requireCatalogWrite, async (req, res) => {
    try {
      const { kind, value } = req.body ?? {};
      if (!kind || !value) return res.status(400).json({ error: "kind e value são obrigatórios" });
      const ok = await storage.deleteCatalogOption(kind, value);
      // Auditoria só quando algo foi de fato removido: registrar exclusões de
      // opções inexistentes poluiria a trilha com não-eventos.
      if (ok) {
        await createAuditLog(
          (req as any).userName,
          'deleted',
          'catalogOption',
          value,
          `Opção "${value}" removida do catálogo (${kindLabel(kind)})`
        );
      }
      broadcast({ type: "catalog_option_deleted", kind, value });
      res.json({ deleted: ok });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/standard-items", requireCatalogWrite, async (req, res) => {
    try {
      const validatedData = insertStandardItemSchema.parse(req.body);
      const item = await storage.createStandardItem(validatedData);

      await createAuditLog(
        (req as any).userName,
        'created',
        'standardItem',
        item.id,
        `Modelo "${item.name}" criado`
      );

      broadcast({ type: "standard_item_created", item });

      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Rename all standard items in a group
  app.patch("/api/standard-items/rename-group", requireCatalogWrite, async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemGroup(oldName, newName.trim());
      // Operação em massa: não há um id único — registra o nome como entityId.
      await createAuditLog(
        (req as any).userName,
        'updated',
        'standardItem',
        newName.trim(),
        `Grupo "${oldName}" renomeado para "${newName.trim()}" (${count} modelos)`
      );
      broadcast({ type: "standard_item_group_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a group from all standard items
  app.delete("/api/standard-items/clear-group", requireCatalogWrite, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemGroup(name);
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'standardItem',
        name,
        `Grupo "${name}" removido de ${count} modelos`
      );
      broadcast({ type: "standard_item_group_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Rename a finish across all standard items
  app.patch("/api/standard-items/rename-finish", requireCatalogWrite, async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemFinish(oldName, newName.trim());
      await createAuditLog(
        (req as any).userName,
        'updated',
        'standardItem',
        newName.trim(),
        `Acabamento "${oldName}" renomeado para "${newName.trim()}" (${count} modelos)`
      );
      broadcast({ type: "standard_item_finish_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a finish from all standard items
  app.delete("/api/standard-items/clear-finish", requireCatalogWrite, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemFinish(name);
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'standardItem',
        name,
        `Acabamento "${name}" removido de ${count} modelos`
      );
      broadcast({ type: "standard_item_finish_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Rename a material across all standard items
  app.patch("/api/standard-items/rename-material", requireCatalogWrite, async (req, res) => {
    try {
      const { oldName, newName } = req.body;
      if (!oldName || !newName || !newName.trim()) {
        return res.status(400).json({ error: "oldName e newName são obrigatórios" });
      }
      const count = await storage.renameStandardItemMaterial(oldName, newName.trim());
      await createAuditLog(
        (req as any).userName,
        'updated',
        'standardItem',
        newName.trim(),
        `Material "${oldName}" renomeado para "${newName.trim()}" (${count} modelos)`
      );
      broadcast({ type: "standard_item_material_renamed", oldName, newName: newName.trim() });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete (clear) a material from all standard items
  app.delete("/api/standard-items/clear-material", requireCatalogWrite, async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: "name é obrigatório" });
      const count = await storage.deleteStandardItemMaterial(name);
      await createAuditLog(
        (req as any).userName,
        'deleted',
        'standardItem',
        name,
        `Material "${name}" removido de ${count} modelos`
      );
      broadcast({ type: "standard_item_material_deleted", name });
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update standard item
  app.patch("/api/standard-items/:id", requireCatalogWrite, async (req, res) => {
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
  app.delete("/api/standard-items/:id", requireCatalogWrite, async (req, res) => {
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
