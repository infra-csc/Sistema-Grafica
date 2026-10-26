import { expect, it, vi } from "vitest";
import { pathToFileURL } from "node:url";
import path from "node:path";

it("grava, lê e aplica ACL no emulador sem credenciais da antiga hospedagem", async () => {
  const moduleUrl = pathToFileURL(path.resolve("scripts/local/gcs-local.mjs")).href;
  const { subirGcsLocal } = await import(/* @vite-ignore */ moduleUrl);
  const emulator = await subirGcsLocal();
  vi.stubEnv("STORAGE_EMULATOR_HOST", emulator.endereco);
  vi.stubEnv("PRIVATE_OBJECT_DIR", "/bucket-teste/.private");
  try {
    vi.resetModules();
    const { ObjectStorageService } = await import("../objectStorage");
    const service = new ObjectStorageService();
    const content = Buffer.from("arquivo-apenas-do-teste");
    const raw = await service.uploadObjectEntityFromBuffer(content, "text/plain");
    const canonical = await service.trySetObjectEntityAclPolicy(raw, { owner: "dona", visibility: "private" });
    expect(canonical).toMatch(/^\/objects\/uploads\//);
    const file = await service.getObjectEntityFile(canonical);
    const [download] = await file.download();
    expect(download).toEqual(content);
    expect(await service.canAccessObjectEntity({ userId: "dona", objectFile: file })).toBe(true);
    expect(await service.canAccessObjectEntity({ userId: "outra-pessoa", objectFile: file })).toBe(false);
    await expect(service.getObjectEntityUploadURL()).rejects.toThrow("emulador local não assina URLs");
  } finally {
    await emulator.parar();
    vi.unstubAllEnvs();
  }
}, 20_000);
