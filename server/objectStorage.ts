// Armazenamento privado: R2 na VPS e GCS/emulador para compatibilidade local.
import { Storage } from "@google-cloud/storage";
import type { ObjectFile, ObjectStorageClient } from "./objectStorageTypes";
import { createR2Storage } from "./r2Storage";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  setObjectAclPolicy,
} from "./objectAcl";
import { cabecalhosDoObjeto } from "./upload-seguro";

// GOOGLE_APPLICATION_CREDENTIALS aponta para credenciais administradas pela empresa.
// STORAGE_EMULATOR_HOST é usado somente no desenvolvimento local.
export const storageProvider = process.env.STORAGE_PROVIDER || "gcs";
if (!["gcs", "r2"].includes(storageProvider)) throw new Error("STORAGE_PROVIDER deve ser gcs ou r2.");
export const objectStorageClient: ObjectStorageClient = storageProvider === "r2" ? createR2Storage() : new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || (process.env.STORAGE_EMULATOR_HOST ? "local" : undefined),
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Configure o bucket e " +
          "defina PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Configure o bucket e " +
          "defina PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<ObjectFile | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  //
  // Aceita requisição de faixa (HTTP Range). Sem isso, todo consumidor precisa
  // baixar o arquivo inteiro antes de usar qualquer parte dele: o book de um
  // evento tem ~4,7 MB e levava uns 3s só de transferência antes de a primeira
  // página aparecer — era a lentidão relatada ao abrir o book. O visualizador
  // de PDF do navegador e o pdf.js sabem pedir só os trechos de que precisam,
  // mas só fazem isso quando o servidor anuncia `Accept-Ranges`.
  async downloadObject(file: ObjectFile, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      const contentType = metadata.contentType || "application/octet-stream";
      const isPdf = contentType === "application/pdf" || file.name.endsWith(".pdf");
      const size = Number(metadata.size ?? 0);

      const commonHeaders: Record<string, string> = {
        "Content-Type": isPdf ? "application/pdf" : contentType,
        // Sempre `private`: estes objetos são servidos SÓ pela rota autenticada
        // /objects/*. Antes usava `public` (porque todo upload é gravado com
        // visibility "public"), o que permitiria um proxy/CDN compartilhado
        // cachear e reentregar conteúdo de acesso restrito.
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
        "Accept-Ranges": "bytes",
        // Tell the browser to display the file inline (critical for PDFs in new tabs).
        // Without this, Chrome downloads the file silently and the tab shows blank.
        ...(isPdf && { "Content-Disposition": "inline; filename=\"document.pdf\"" }),
        // nosniff sempre; o que não é imagem raster nem PDF vai como download
        // em sandbox — um HTML/SVG antigo no bucket não roda na origem do app.
        ...cabecalhosDoObjeto(isPdf ? "application/pdf" : contentType),
      };

      // "bytes=INICIO-FIM", com qualquer um dos lados opcional.
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(res.req.headers.range ?? ""));
      if (range && size > 0) {
        const [, rawStart, rawEnd] = range;
        let start: number, end: number;
        if (rawStart === "") {
          // "bytes=-500" pede os últimos 500 bytes.
          const suffix = Number(rawEnd);
          start = Math.max(0, size - suffix);
          end = size - 1;
        } else {
          start = Number(rawStart);
          end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
        }

        if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
          res.status(416).set({ "Content-Range": `bytes */${size}` }).end();
          return;
        }

        res.status(206).set({
          ...commonHeaders,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": String(end - start + 1),
        });
        const partial = file.createReadStream({ start, end });
        partial.on("error", (err) => {
          console.error("Stream error:", err);
          if (!res.headersSent) res.status(500).json({ error: "Error streaming file" });
        });
        partial.pipe(res);
        return;
      }

      res.set({ ...commonHeaders, "Content-Length": String(size) });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Configure o bucket e " +
          "defina PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Upload feito PELO SERVIDOR (proxy). Existe porque redes corporativas
  // bloqueiam storage.googleapis.com no cliente: a URL assinada chegava, mas
  // o PUT do navegador morria em "Failed to fetch". Aqui o navegador manda os
  // bytes para o app e o app grava no bucket. Retorna a URL canônica do
  // objeto — o mesmo formato que o cliente obtinha de uploadURL.split("?")[0].
  async uploadObjectEntityFromBuffer(buf: Buffer, contentType: string): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    await file.save(buf, { contentType, resumable: false });
    return storageProvider === "r2"
      ? `/objects/uploads/${objectId}`
      : `https://storage.googleapis.com/${bucketName}/${objectName}`;
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<ObjectFile> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    const r2Origin = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    if (!rawPath.startsWith("https://storage.googleapis.com/") &&
        !(storageProvider === "r2" && rawPath.startsWith(`${r2Origin}/`))) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    // Só normalizamos o bucket atual e origens legadas declaradas pelo operador.
    const entityDirs = [this.getPrivateObjectDir(), ...(process.env.LEGACY_PRIVATE_OBJECT_DIRS || "").split(",")]
      .map(dir => dir.trim()).filter(Boolean).map(dir => dir.endsWith("/") ? dir : `${dir}/`);
    for (const objectEntityDir of entityDirs) {
      if (rawObjectPath.startsWith(objectEntityDir)) {
        return `/objects/${rawObjectPath.slice(objectEntityDir.length)}`;
      }
    }
    return rawObjectPath;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: ObjectFile;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  if (process.env.STORAGE_EMULATOR_HOST) {
    throw new Error("O emulador local não assina URLs. Use o upload via servidor.");
  }
  if (method === "HEAD") throw new Error("Assinatura HEAD não suportada.");
  const [signedURL] = await objectStorageClient.bucket(bucketName).file(objectName).getSignedUrl({
    version: "v4",
    action: method === "PUT" ? "write" : method === "DELETE" ? "delete" : "read",
    expires: Date.now() + ttlSec * 1000,
  });
  return signedURL;
}
