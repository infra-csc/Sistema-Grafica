// Object-storage upload / serve / delivery-photo-save routes. Extracted
// from server/routes.ts (OBJECT STORAGE section).
import express, { type Express } from "express";
import { storage } from "../storage";
import { insertDeliveryPhotoSchema } from "@shared/schema";
import { requireAuth } from "./shared";

export async function registerObjectRoutes(app: Express): Promise<void> {
  
  const { ObjectStorageService, ObjectNotFoundError } = await import("../objectStorage");
  
  // Allowed content-type prefixes for uploads.
  const ALLOWED_CONTENT_TYPE_PREFIXES = [
    "image/",
    "video/",
    "application/pdf",
    "application/zip",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument",
    "text/plain",
    "application/octet-stream", // fallback for unknown binary (browsers may use this)
  ];
  const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

  // Get upload URL for a new photo
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    try {
      const { contentType, size } = req.body as { contentType?: string; size?: number };

      // Validate content-type when provided by the client.
      if (contentType) {
        const allowed = ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) =>
          contentType.startsWith(prefix)
        );
        if (!allowed) {
          return res.status(400).json({ error: "Tipo de arquivo não permitido" });
        }
      }

      // Validate file size when provided by the client.
      if (typeof size === "number" && size > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "Arquivo muito grande (máximo 50 MB)" });
      }

      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error: any) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Não foi possível gerar URL de upload" });
    }
  });

  // Upload via servidor (proxy de mesma origem). O caminho antigo — URL
  // assinada + PUT direto do navegador no storage.googleapis.com — morre em
  // "Failed to fetch" nas redes corporativas que bloqueiam o host do Google
  // Storage. Aqui o navegador só fala com a origem do app; o servidor valida
  // tipo/tamanho e grava no bucket.
  app.put(
    "/api/objects/upload-direct",
    requireAuth,
    express.raw({ type: "*/*", limit: MAX_UPLOAD_BYTES }),
    async (req, res) => {
      try {
        const contentType = String(req.headers["content-type"] || "application/octet-stream");
        const allowed = ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));
        if (!allowed) {
          return res.status(400).json({ error: "Tipo de arquivo não permitido" });
        }
        const buf: Buffer = req.body;
        if (!Buffer.isBuffer(buf) || buf.length === 0) {
          return res.status(400).json({ error: "Arquivo vazio ou corpo inválido" });
        }
        if (buf.length > MAX_UPLOAD_BYTES) {
          return res.status(400).json({ error: "Arquivo muito grande (máximo 50 MB)" });
        }
        const objectStorageService = new ObjectStorageService();
        const url = await objectStorageService.uploadObjectEntityFromBuffer(buf, contentType);
        res.json({ url });
      } catch (error: any) {
        console.error("Error in proxy upload:", error);
        res.status(500).json({ error: "Não foi possível enviar o arquivo" });
      }
    }
  );

  // Serve uploaded objects (photos) — requires auth + an ACL check so users
  // can't read arbitrary uploaded files just by guessing/enumerating paths.
  //
  // Delivery-photo and art-reference uploads now record a "public" ACL
  // policy (owner = uploader) right after upload — see the referenceUrl
  // handling in PATCH /api/items/:id and POST /api/delivery-photos.
  // Objects created before that change (or via any path that doesn't set a
  // policy) still have no ACL policy attached. canAccessObject() would deny
  // access outright when there's no policy, which would 403 every legacy
  // object in the app. Since this route is gated behind requireAuth, we
  // treat "no policy recorded" as accessible to any authenticated user
  // (matches pre-existing behavior for those objects), and defer to the
  // recorded ACL policy for any object that has one.
  app.get("/objects/:objectPath(*)", requireAuth, async (req, res) => {
    try {
      const { ObjectPermission, getObjectAclPolicy } = await import("../objectAcl");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);

      const aclPolicy = await getObjectAclPolicy(objectFile);
      if (aclPolicy) {
        const canAccess = await objectStorageService.canAccessObjectEntity({
          userId: req.userId,
          objectFile,
          requestedPermission: ObjectPermission.READ,
        });
        if (!canAccess) {
          return res.sendStatus(403);
        }
      }

      await objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error serving object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Save delivery photo info to database
  app.post("/api/delivery-photos", requireAuth, async (req, res) => {
    try {
      const validatedData = insertDeliveryPhotoSchema.parse(req.body);

      // Normalize the photo URL to object path and record an ACL policy so
      // the object is attributed to its uploader. Delivery photos are
      // treated as "public" to any authenticated user, matching the
      // pre-existing behavior where objects with no ACL policy were freely
      // accessible to anyone logged in.
      const objectStorageService = new ObjectStorageService();
      let photoPath: string;
      try {
        photoPath = await objectStorageService.trySetObjectEntityAclPolicy(
          validatedData.photoUrl,
          { owner: req.userId!, visibility: "public" }
        );
      } catch {
        // Object may not exist in storage yet (e.g. legacy/external URL) —
        // fall back to just normalizing the path without setting an ACL.
        photoPath = objectStorageService.normalizeObjectEntityPath(validatedData.photoUrl);
      }

      const photo = await storage.addDeliveryPhoto({
        ...validatedData,
        photoUrl: photoPath,
      });
      
      res.status(201).json(photo);
    } catch (error: any) {
      console.error("Error saving delivery photo:", error);
      res.status(500).json({ error: error.message });
    }
  });

}
