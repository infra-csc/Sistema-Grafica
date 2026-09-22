// Links gravados que viram href, e o que entra/sai do bucket (XSS por upload).
import { describe, it, expect } from "vitest";
import { urlSegura, hrefSeguro, campoDeUrlInseguro } from "@shared/url-segura";
import {
  avaliarUpload,
  cabecalhosDoObjeto,
  detectarTipoReal,
  avaliarPedidoDeUrlAssinada,
} from "../upload-seguro";

describe("urlSegura", () => {
  it.each([
    "https://drive.google.com/x",
    "http://exemplo.com",
    "/objects/uploads/abc",
    "\\\\servidor\\artes\\peca.pdf",
    "X:\\Artes\\peca.pdf",
    "Z:/Artes/peca.pdf",
    "drive.google.com/sem-esquema",
  ])("aceita %s", (u) => {
    expect(urlSegura(u)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "  javascript:alert(1)",
    "java\tscript:alert(1)",
    "\u0001javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "file:///etc/passwd",
  ])("recusa %s", (u) => {
    expect(urlSegura(u)).toBe(false);
  });

  it("hrefSeguro deixa o link inerte quando não é seguro", () => {
    expect(hrefSeguro("javascript:alert(1)")).toBeUndefined();
    expect(hrefSeguro(null)).toBeUndefined();
    expect(hrefSeguro("/objects/a")).toBe("/objects/a");
  });

  it("campoDeUrlInseguro acha o campo em qualquer profundidade e deixa limpar", () => {
    expect(campoDeUrlInseguro({ referenceUrl: null, finalFileUrl: "" })).toBeNull();
    expect(campoDeUrlInseguro({ referenceUrl: "https://a" })).toBeNull();
    expect(campoDeUrlInseguro({ finalFileUrl: "javascript:x" })).toBe("finalFileUrl");
    expect(campoDeUrlInseguro({ referenceUrls: ["/objects/a", "data:text/html,x"] })).toBe("referenceUrls");
    expect(campoDeUrlInseguro({ items: [{ bookUrl: "javascript:x" }] })).toBe("bookUrl");
    expect(campoDeUrlInseguro({ nome: "javascript:é só texto" })).toBeNull();
  });
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = Buffer.from("%PDF-1.7\n...");
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("upload: o tipo é decidido pelos bytes", () => {
  it("aceita os uploads legítimos (thumb, foto, PDF final, book, planilha, zip)", () => {
    expect(avaliarUpload(PNG, "image/png")).toEqual({ ok: true, tipo: "image/png" });
    expect(avaliarUpload(JPG, "image/jpeg")).toEqual({ ok: true, tipo: "image/jpeg" });
    expect(avaliarUpload(PDF, "application/pdf")).toEqual({ ok: true, tipo: "application/pdf" });
    expect(avaliarUpload(ZIP, XLSX)).toEqual({ ok: true, tipo: XLSX });
    expect(avaliarUpload(ZIP, "application/zip")).toEqual({ ok: true, tipo: "application/zip" });
  });

  it("sem tipo declarado (octet-stream), vale o que os bytes dizem", () => {
    expect(avaliarUpload(PDF, "application/octet-stream")).toEqual({ ok: true, tipo: "application/pdf" });
    expect(avaliarUpload(PNG, "")).toEqual({ ok: true, tipo: "image/png" });
  });

  it("declarar imagem não basta: grava o tipo real", () => {
    expect(avaliarUpload(PDF, "image/png")).toEqual({ ok: true, tipo: "application/pdf" });
  });

  it("recusa SVG, HTML e texto — declarados ou disfarçados", () => {
    expect(avaliarUpload(SVG, "image/svg+xml").ok).toBe(false);
    expect(avaliarUpload(HTML, "text/html").ok).toBe(false);
    expect(avaliarUpload(Buffer.from("oi"), "text/plain").ok).toBe(false);
    expect(avaliarUpload(HTML, "image/png").ok).toBe(false);
    expect(avaliarUpload(SVG, "application/octet-stream").ok).toBe(false);
  });

  it("detecta webp e gif", () => {
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBP")]);
    expect(detectarTipoReal(webp)).toBe("image/webp");
    expect(detectarTipoReal(Buffer.from("GIF89a"))).toBe("image/gif");
  });

  it("URL assinada exige tipo da lista e tamanho dentro do teto", () => {
    expect(avaliarPedidoDeUrlAssinada({})).not.toBeNull();
    expect(avaliarPedidoDeUrlAssinada({ contentType: "text/html", size: 10 })).not.toBeNull();
    expect(avaliarPedidoDeUrlAssinada({ contentType: "image/png" })).not.toBeNull();
    expect(avaliarPedidoDeUrlAssinada({ contentType: "image/png", size: 60 * 1024 * 1024 })).not.toBeNull();
    expect(avaliarPedidoDeUrlAssinada({ contentType: "image/png", size: 1000 })).toBeNull();
  });
});

describe("saída por /objects/*", () => {
  it("imagem raster abre no navegador, com nosniff e sandbox", () => {
    const h = cabecalhosDoObjeto("image/png");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toBe("sandbox; default-src 'none'");
    expect(h["Content-Disposition"]).toBeUndefined();
  });

  it("PDF abre no navegador (o visualizador do Chrome não abre em sandbox)", () => {
    const h = cabecalhosDoObjeto("application/pdf");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Disposition"]).toBeUndefined();
    expect(h["Content-Security-Policy"]).toBeUndefined();
  });

  it.each(["text/html", "image/svg+xml", "text/plain", "application/octet-stream", ""])(
    "%s (objeto antigo) vai como download em sandbox",
    (tipo) => {
      const h = cabecalhosDoObjeto(tipo);
      expect(h["Content-Disposition"]).toBe("attachment");
      expect(h["Content-Security-Policy"]).toBe("sandbox; default-src 'none'");
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
    },
  );
});
