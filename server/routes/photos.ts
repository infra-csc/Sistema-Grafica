// Delivery-photo routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { insertDeliveryPhotoSchema } from "@shared/schema";
import { requireAuth, broadcast } from "./shared";

export function registerPhotoRoutes(app: Express): void {
  // ============ DELIVERY PHOTOS ============
  
  // Get delivery photos for an item
  app.get("/api/items/:itemId/photos", requireAuth, async (req, res) => {
    try {
      const photos = await storage.getDeliveryPhotos(req.params.itemId);
      res.json(photos);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add a delivery photo
  app.post("/api/items/:itemId/photos", requireAuth, async (req, res) => {
    try {
      const validatedData = insertDeliveryPhotoSchema.parse({
        ...req.body,
        itemId: req.params.itemId,
      });
      
      const photo = await storage.addDeliveryPhoto(validatedData);
      
      broadcast({ type: "photo_added", photo });
      
      res.json(photo);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a delivery photo
  app.delete("/api/photos/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteDeliveryPhoto(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Photo not found" });
      }
      
      broadcast({ type: "photo_deleted", photoId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
