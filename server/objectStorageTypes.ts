import type { Readable } from "node:stream";

export interface ObjectMetadata {
  contentType?: string;
  size?: string | number;
  metadata?: Record<string, string | number | boolean | null>;
}

/** Contrato utilizado por upload, ACL, miniaturas e leitura de PDFs. */
export interface ObjectFile {
  name: string;
  bucket: ObjectBucket;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[ObjectMetadata, ...unknown[]]>;
  setMetadata(metadata: { metadata: Record<string, string> }): Promise<unknown>;
  save(data: Buffer, options?: { contentType?: string; resumable?: boolean }): Promise<unknown>;
  download(): Promise<[Buffer]>;
  delete(): Promise<unknown>;
  createReadStream(options?: { start?: number; end?: number }): Readable;
  getSignedUrl(options: { version: "v4"; action: "read" | "write" | "delete"; expires: number }): Promise<[string]>;
}

export interface ObjectBucket {
  name: string;
  file(name: string): ObjectFile;
}

export interface ObjectStorageClient {
  bucket(name: string): ObjectBucket;
}
