import { afterEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { HeadObjectCommand, GetObjectCommand, PutObjectCommand, CopyObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { R2Bucket, createR2Storage, encodeR2Metadata, decodeR2Metadata } from "../r2Storage";

const fileWith = (send: ReturnType<typeof vi.fn>) => new R2Bucket({ send } as unknown as S3Client, "grafica-teste").file(".private/uploads/arquivo");
afterEach(() => vi.unstubAllEnvs());

describe("arquivos privados no R2", () => {
  it("preserva nome da ACL e valores Unicode apesar dos cabeçalhos S3", () => {
    const metadata = { "custom:aclPolicy": '{"owner":"usuário","visibility":"private"}', "OutroNome": "João" };
    const encoded = encodeR2Metadata(metadata);
    expect(Object.keys(encoded).every(key => /^[a-z0-9-]+$/.test(key))).toBe(true);
    expect(decodeR2Metadata(encoded)).toEqual(metadata);
  });

  it("só trata ausência real como arquivo inexistente", async () => {
    const missing = fileWith(vi.fn().mockRejectedValue({ $metadata: { httpStatusCode: 404 } }));
    expect(await missing.exists()).toEqual([false]);
    const denied = { $metadata: { httpStatusCode: 403 }, name: "AccessDenied" };
    await expect(fileWith(vi.fn().mockRejectedValue(denied)).exists()).rejects.toEqual(denied);
  });

  it("não inicia sem as credenciais e recusa um bucket diferente", () => {
    expect(() => createR2Storage({})).toThrow("R2_ACCOUNT_ID");
    const client = createR2Storage({ R2_ACCOUNT_ID: "a".repeat(32), R2_BUCKET: "grafica-teste", R2_ACCESS_KEY_ID: "teste", R2_SECRET_ACCESS_KEY: "teste" });
    expect(() => client.bucket("outro-app")).toThrow("não é o bucket configurado");
  });

  it("grava bytes e Content-Type sem publicar o objeto", async () => {
    const send = vi.fn().mockResolvedValue({});
    await fileWith(send).save(Buffer.from("conteúdo"), { contentType: "application/pdf" });
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input.ContentType).toBe("application/pdf");
    expect(command.input.ACL).toBeUndefined();
  });

  it("normaliza upload assinado e origem GCS declarada sem aceitar buckets alheios", async () => {
    vi.stubEnv("STORAGE_PROVIDER", "r2");
    vi.stubEnv("R2_ACCOUNT_ID", "a".repeat(32));
    vi.stubEnv("R2_BUCKET", "grafica-teste");
    vi.stubEnv("R2_ACCESS_KEY_ID", "chave-de-teste");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "segredo-de-teste");
    vi.stubEnv("PRIVATE_OBJECT_DIR", "/grafica-teste/.private");
    vi.stubEnv("LEGACY_PRIVATE_OBJECT_DIRS", "/bucket-antigo/.private");
    vi.resetModules();
    const { ObjectStorageService } = await import("../objectStorage");
    const service = new ObjectStorageService();
    const signed = await service.getObjectEntityUploadURL();
    expect(new URL(signed).origin).toBe(`https://${"a".repeat(32)}.r2.cloudflarestorage.com`);
    expect(service.normalizeObjectEntityPath(signed)).toMatch(/^\/objects\/uploads\//);
    expect(service.normalizeObjectEntityPath("https://storage.googleapis.com/bucket-antigo/.private/uploads/legado")).toBe("/objects/uploads/legado");
    expect(service.normalizeObjectEntityPath("https://storage.googleapis.com/outro-app/.private/uploads/legado")).not.toBe("/objects/uploads/legado");
  });

  it("atualiza ACL preservando metadados, Content-Type e conteúdo por ETag", async () => {
    const send = vi.fn().mockImplementation(async command => command instanceof HeadObjectCommand
      ? { ContentType: "image/png", ETag: '"versao-original"', Metadata: encodeR2Metadata({ existente: "valor" }) } : {});
    await fileWith(send).setMetadata({ metadata: { "custom:aclPolicy": '{"visibility":"private"}' } });
    const copy = send.mock.calls[1][0] as CopyObjectCommand;
    expect(copy).toBeInstanceOf(CopyObjectCommand);
    expect(copy.input.CopySourceIfMatch).toBe('"versao-original"');
    expect(copy.input.ContentType).toBe("image/png");
    expect(decodeR2Metadata(copy.input.Metadata)).toEqual({ existente: "valor", "custom:aclPolicy": '{"visibility":"private"}' });
  });

  it("encaminha uma faixa de bytes sem carregar todo o PDF", async () => {
    const send = vi.fn().mockResolvedValue({ Body: Readable.from([Buffer.from("trecho")]) });
    const chunks: Buffer[] = [];
    for await (const chunk of fileWith(send).createReadStream({ start: 20, end: 25 })) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe("trecho");
    const command = send.mock.calls[0][0] as GetObjectCommand;
    expect(command.input.Range).toBe("bytes=20-25");
  });

  it("propaga erros da leitura para o stream", async () => {
    const stream = fileWith(vi.fn().mockRejectedValue(new Error("leitura recusada"))).createReadStream();
    await expect((async () => { for await (const _chunk of stream) { /* consumir */ } })()).rejects.toThrow("leitura recusada");
  });
});
