// ─────────────────────────────────────────────────────────────────────────────
// CACHE DEPOIS DO DEPLOY, RODANDO (veio de chunk-apos-deploy.test.ts, que lia
// o texto de server/vite.ts; as camadas do cliente continuam lá).
//
// O modo de falha: o navegador segura um index.html velho que aponta para
// chunks que o Republicar acabou de apagar ("Failed to fetch dynamically
// imported module"). A defesa do servidor, conferida por pedido HTTP de
// verdade contra o serveStatic real, sobre uma pasta "public" de mentira:
//   · /assets/* (hash no nome) → 1 ano, immutable;
//   · index.html → no-store, inclusive no fall-through da SPA (/grafica).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { Server } from "http";
import type { AddressInfo } from "net";

const PUBLICO = vi.hoisted(() => ({ pasta: "" }));

// O serveStatic procura "<pasta do vite.ts>/public"; aqui ela vira uma pasta
// temporária — o build real não é necessário nem tocado.
vi.mock("path", async () => {
  const real = await vi.importActual<typeof import("path")>("path");
  const resolve = (...partes: string[]) => (partes[partes.length - 1] === "public" && PUBLICO.pasta ? PUBLICO.pasta : real.resolve(...partes));
  return { ...real, default: { ...real, resolve }, resolve };
});
// vite.ts importa o Vite e o vite.config só para o modo dev; nada disso roda aqui.
vi.mock("vite", () => ({ createServer: vi.fn(), createLogger: () => ({ error: vi.fn() }) }));
vi.mock("../../vite.config", () => ({ default: {} }));

let servidor: Server;
let base = "";

beforeAll(async () => {
  PUBLICO.pasta = mkdtempSync(path.join(tmpdir(), "publico-"));
  mkdirSync(path.join(PUBLICO.pasta, "assets"));
  writeFileSync(path.join(PUBLICO.pasta, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(path.join(PUBLICO.pasta, "assets", "grafica-BrXTdZZg.js"), "export default 1;");
  const express = (await import("express")).default;
  const { serveStatic } = await import("../vite");
  const app = express();
  serveStatic(app);
  servidor = await new Promise((ok) => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((ok) => servidor?.close(() => ok()));
  if (PUBLICO.pasta) rmSync(PUBLICO.pasta, { recursive: true, force: true });
});

describe("serveStatic: a regra de cache em duas camadas", () => {
  it("os chunks com hash vivem 1 ano, immutable", async () => {
    const r = await fetch(`${base}/assets/grafica-BrXTdZZg.js`);
    expect(r.status).toBe(200);
    const cc = r.headers.get("cache-control") ?? "";
    expect(cc).toContain("max-age=31536000");
    expect(cc).toContain("immutable");
  });

  it("o index.html pedido direto nunca envelhece no cache", async () => {
    const r = await fetch(`${base}/index.html`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
  });

  it("a raiz e o fall-through da SPA (rota do cliente) também saem no-store", async () => {
    for (const rota of ["/", "/grafica", "/eventos/123"]) {
      const r = await fetch(base + rota);
      expect(r.status, rota).toBe(200);
      expect(r.headers.get("cache-control"), rota).toBe("no-store");
      expect(await r.text()).toContain("<title>app</title>");
    }
  });
});
