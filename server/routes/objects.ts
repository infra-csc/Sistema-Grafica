// Object-storage upload / serve / delivery-photo-save routes. Extracted
// from server/routes.ts (OBJECT STORAGE section).
import express, { type Express } from "express";
import { storage } from "../storage";
import { insertDeliveryPhotoSchema } from "@shared/schema";
import { requireAuth, sendSensitiveError } from "./shared";
import { avaliarUpload, avaliarPedidoDeUrlAssinada, cabecalhosDoObjeto, MAX_UPLOAD_BYTES } from "../upload-seguro";
import {
  miniaturasDisponiveis, tipoMiniaturavel, gerarMiniatura, TETO_ORIGINAL_BYTES,
  gravarMiniaturaDoUpload, lerMiniaturaGravada, type ArquivoDoBucket,
} from "../services/miniaturas";

export async function registerObjectRoutes(app: Express): Promise<void> {
  
  const { ObjectStorageService, ObjectNotFoundError } = await import("../objectStorage");
  
  // Pedido de URL assinada (caminho legado — as telas sobem por
  // /upload-direct). O bucket não amarra tipo/tamanho a esta URL: exigimos o
  // pedido declarado dentro da lista, e a saída por /objects/* é blindada.
  app.post("/api/objects/upload", requireAuth, async (req, res) => {
    try {
      const recusa = avaliarPedidoDeUrlAssinada(req.body);
      if (recusa) return res.status(400).json({ error: recusa });

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
        const buf: Buffer = req.body;
        if (!Buffer.isBuffer(buf) || buf.length === 0) {
          return res.status(400).json({ error: "Arquivo vazio ou corpo inválido" });
        }
        if (buf.length > MAX_UPLOAD_BYTES) {
          return res.status(400).json({ error: "Arquivo muito grande (máximo 50 MB)" });
        }
        // O tipo gravado é o dos bytes, não o que o navegador declarou.
        const avaliacao = avaliarUpload(buf, req.headers["content-type"]);
        if (!avaliacao.ok) {
          return res.status(400).json({ error: avaliacao.erro });
        }
        const objectStorageService = new ObjectStorageService();
        const url = await objectStorageService.uploadObjectEntityFromBuffer(buf, avaliacao.tipo);
        // A MINIATURA NASCE AQUI (perf, 2ª rodada). Os bytes já estão em
        // memória e o sharp já teria de rodar na primeira listagem que
        // mostrasse esta imagem — fazer agora troca "um download de 25 MB e um
        // resize por falta de cache, em cada cópia do processo" por um resize
        // só, uma vez na vida. Falha não derruba o upload: a geração a pedido
        // continua de plano B (ver services/miniaturas.ts).
        if (miniaturasDisponiveis() && tipoMiniaturavel(avaliacao.tipo)) {
          try {
            const arquivo = await objectStorageService.getObjectEntityFile(
              objectStorageService.normalizeObjectEntityPath(url),
            );
            await gravarMiniaturaDoUpload(arquivo as unknown as ArquivoDoBucket, buf, avaliacao.tipo);
          } catch (e) {
            console.error("[miniaturas] upload gravado, miniatura não — segue a geração a pedido", e);
          }
        }
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

      // ── MINIATURA (?thumb=1 — auditoria 27/08) ─────────────────────────────
      // As listas pintam originais de MBs em caixas de 12–80px. A resposta é um
      // webp de até 320px. Ordem das tentativas:
      //   1. a miniatura GRAVADA no upload, irmã do original no bucket
      //      (`<caminho>/thumb.webp`) — um download de ~10–30 KB, sem sharp e
      //      sem tocar no original. É o caminho de tudo que subiu a partir da
      //      2ª rodada de performance;
      //   2. a geração a pedido, com o LRU em memória — o plano B de tudo o que
      //      já estava no bucket (não há backfill, por decisão do dono);
      //   3. o original, como sempre.
      // O controle de acesso não muda: a ACL foi conferida acima, contra o
      // objeto ORIGINAL, antes de qualquer uma destas tentativas.
      const cabecalhosDaMiniatura = {
        ...cabecalhosDoObjeto("image/webp"),
        "Content-Type": "image/webp",
        // private: mesma razão do downloadObject — rota autenticada, proxy
        // compartilhado não pode cachear.
        "Cache-Control": "private, max-age=86400",
      };
      if (req.query.thumb === "1") {
        const gravada = await lerMiniaturaGravada(objectFile as unknown as ArquivoDoBucket);
        if (gravada) {
          res.set(cabecalhosDaMiniatura);
          return res.end(gravada);
        }
      }
      if (req.query.thumb === "1" && miniaturasDisponiveis()) {
        try {
          const [metadata] = await objectFile.getMetadata();
          const contentType = String(metadata.contentType ?? "");
          const tamanho = Number(metadata.size ?? 0);
          if (tipoMiniaturavel(contentType) && tamanho > 0 && tamanho <= TETO_ORIGINAL_BYTES) {
            const [original] = await objectFile.download();
            const mini = await gerarMiniatura(req.path, original);
            if (mini) {
              res.set(cabecalhosDaMiniatura);
              return res.end(mini);
            }
          }
        } catch (e) {
          console.error("[miniaturas] falha ao gerar — servindo original", e);
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
      sendSensitiveError(res, error, "Error saving delivery photo", 500);
    }
  });

}
