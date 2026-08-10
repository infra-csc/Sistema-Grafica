// Item-comment routes. Extracted from server/routes.ts.
import type { Express } from "express";
import { storage } from "../storage";
import { insertCommentSchema } from "@shared/schema";
import { requireAuth, broadcast } from "./shared";

export function registerCommentRoutes(app: Express): void {
  // ============ COMMENTS ============
  
  // Get comments for an item
  app.get("/api/items/:itemId/comments", requireAuth, async (req, res) => {
    try {
      const comments = await storage.getComments(req.params.itemId);
      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a comment
  app.post("/api/items/:itemId/comments", requireAuth, async (req, res) => {
    try {
      // Buscar item para pegar o status atual
      const item = await storage.getItem(req.params.itemId);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const validatedData = insertCommentSchema.parse({
        ...req.body,
        itemId: req.params.itemId,
        itemStatus: item.status, // Captura o status atual do item
      });
      
      const comment = await storage.createComment(validatedData);
      
      // Broadcast new comment to all connected clients
      broadcast({ type: "new_comment", comment });
      
      res.json(comment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete a comment — só o próprio autor ou um admin. Sem esta checagem
  // qualquer usuário autenticado apagava comentário de qualquer outro (IDOR).
  app.delete("/api/comments/:id", requireAuth, async (req, res) => {
    try {
      const comment = await storage.getComment(req.params.id);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      const isOwner = comment.userId != null && comment.userId === req.userId;
      if (!isOwner && req.userRole !== "admin") {
        return res.status(403).json({ error: "Você só pode excluir seus próprios comentários" });
      }

      const success = await storage.deleteComment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      broadcast({ type: "comment_deleted", commentId: req.params.id });
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
