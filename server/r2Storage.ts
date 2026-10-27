import {
  S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand,
  CopyObjectCommand, DeleteObjectCommand,
  type HeadObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PassThrough, Readable } from "node:stream";
import type { ObjectBucket, ObjectFile, ObjectMetadata, ObjectStorageClient } from "./objectStorageTypes";

// S3 normaliza nomes de metadados e não aceita ':' em um nome de cabeçalho.
// Hex preserva os nomes GCS; base64 permite valores Unicode em cabeçalhos HTTP.
export function encodeR2Metadata(metadata: Record<string, string | number | boolean | null>): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => [
    `grafica-${Buffer.from(key).toString("hex")}`, Buffer.from(String(value)).toString("base64"),
  ]));
}

export function decodeR2Metadata(metadata: Record<string, string> = {}): Record<string, string> {
  return Object.fromEntries(Object.entries(metadata).map(([key, value]) => {
    const encoded = key.startsWith("grafica-") && /^(?:[0-9a-f]{2})+$/.test(key.slice(8));
    return encoded
      ? [Buffer.from(key.slice(8), "hex").toString(), Buffer.from(value, "base64").toString()]
      : [key, value];
  }));
}

export function isMissingR2Object(error: unknown): boolean {
  const detail = error as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  return detail?.$metadata?.httpStatusCode === 404 || detail?.name === "NoSuchKey" || detail?.name === "NotFound";
}

export function createR2Storage(env: NodeJS.ProcessEnv = process.env): ObjectStorageClient {
  const required = ["R2_ACCOUNT_ID", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  const missing = required.filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Configuração R2 incompleta: ${missing.join(", ")}.`);
  if (!/^[a-f0-9]{32}$/.test(env.R2_ACCOUNT_ID!)) throw new Error("R2_ACCOUNT_ID inválido.");
  const bucketName = env.R2_BUCKET!;
  const client = new S3Client({
    region: "auto",
    forcePathStyle: true,
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY! },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    maxAttempts: 3,
    requestHandler: { connectionTimeout: 5_000, socketTimeout: 30_000 },
  });
  return {
    bucket(name) {
      if (name !== bucketName) throw new Error("O bucket solicitado não é o bucket configurado para a Gráfica.");
      return new R2Bucket(client, name);
    },
  };
}

export class R2Bucket implements ObjectBucket {
  constructor(private readonly client: S3Client, public readonly name: string) {}
  file(name: string): R2File { return new R2File(this.client, this, name); }
}

class R2File implements ObjectFile {
  constructor(private readonly client: S3Client, public readonly bucket: R2Bucket, public readonly name: string) {}
  private input() { return { Bucket: this.bucket.name, Key: this.name }; }
  private head(): Promise<HeadObjectCommandOutput> { return this.client.send(new HeadObjectCommand(this.input())); }

  async exists(): Promise<[boolean]> {
    try { await this.head(); return [true]; }
    catch (error) { if (isMissingR2Object(error)) return [false]; throw error; }
  }

  async getMetadata(): Promise<[ObjectMetadata]> {
    const head = await this.head();
    return [{ contentType: head.ContentType, size: head.ContentLength, metadata: decodeR2Metadata(head.Metadata) }];
  }

  async setMetadata(update: { metadata: Record<string, string> }): Promise<void> {
    const head = await this.head();
    await this.client.send(new CopyObjectCommand({
      ...this.input(),
      CopySource: `${this.bucket.name}/${this.name.split("/").map(encodeURIComponent).join("/")}`,
      CopySourceIfMatch: head.ETag,
      MetadataDirective: "REPLACE",
      Metadata: encodeR2Metadata({ ...decodeR2Metadata(head.Metadata), ...update.metadata }),
      ContentType: head.ContentType,
      CacheControl: head.CacheControl,
      ContentDisposition: head.ContentDisposition,
      ContentEncoding: head.ContentEncoding,
      ContentLanguage: head.ContentLanguage,
    }));
  }

  async save(data: Buffer, options: { contentType?: string; resumable?: boolean } = {}): Promise<void> {
    await this.client.send(new PutObjectCommand({ ...this.input(), Body: data, ContentType: options.contentType }));
  }

  async download(): Promise<[Buffer]> {
    const response = await this.client.send(new GetObjectCommand(this.input()));
    if (!response.Body) throw new Error("O R2 não retornou o conteúdo do arquivo.");
    return [Buffer.from(await response.Body.transformToByteArray())];
  }

  async delete(): Promise<void> {
    await this.client.send(new DeleteObjectCommand(this.input()));
  }

  createReadStream(options: { start?: number; end?: number } = {}): Readable {
    const stream = new PassThrough();
    const abort = new AbortController();
    let source: Readable | undefined;
    stream.once("close", () => { abort.abort(); source?.destroy(); });
    const range = options.start !== undefined || options.end !== undefined
      ? `bytes=${options.start ?? 0}-${options.end ?? ""}` : undefined;
    void this.client.send(new GetObjectCommand({ ...this.input(), Range: range }), { abortSignal: abort.signal })
      .then(response => {
        if (stream.destroyed) { (response.Body as Readable | undefined)?.destroy(); return; }
        if (!(response.Body instanceof Readable)) throw new Error("O R2 não retornou um stream de arquivo.");
        source = response.Body;
        source.once("error", error => stream.destroy(error));
        source.pipe(stream);
      }).catch(error => stream.destroy(error));
    return stream;
  }

  async getSignedUrl(options: { version: "v4"; action: "read" | "write" | "delete"; expires: number }): Promise<[string]> {
    const command = options.action === "write" ? new PutObjectCommand(this.input())
      : options.action === "delete" ? new DeleteObjectCommand(this.input()) : new GetObjectCommand(this.input());
    return [await getSignedUrl(this.client, command, { expiresIn: Math.max(1, Math.floor((options.expires - Date.now()) / 1000)) })];
  }
}
