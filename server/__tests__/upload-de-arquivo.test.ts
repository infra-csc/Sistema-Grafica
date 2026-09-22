// ─────────────────────────────────────────────────────────────────────────────
// O UPLOAD, PELA ROTA DE VERDADE.
//
// POR QUE ESTE ARQUIVO NASCEU: o antigo `upload-validation.test.ts` declarava
// no próprio cabeçalho que "extraía a lógica de validação para funções puras
// que espelham server/routes/objects.ts". Espelho não é reflexo: a lista dele
// aceitava `image/svg+xml`, `text/plain` e `video/*`, e decidia pelo
// Content-Type declarado. O servidor de verdade (server/upload-seguro.ts)
// RECUSA os três e decide pelos BYTES do arquivo. Os 20 casos verdes falavam
// de um código que não existe há meses — e teriam continuado verdes se a
// validação real fosse apagada inteira.
//
// Aqui não há cópia: o que roda é `registerObjectRoutes`, o handler real, com
// o bucket de mentira. Se alguém afrouxar a lista ou o teto, ESTES casos caem.
//
// O contrato coberto:
//   · tipo declarado fora da lista → 400 antes de olhar os bytes;
//   · declaração genérica (octet-stream / vazia) segue para os bytes;
//   · bytes que não são de nenhum tipo aceito → 400 (o HTML disfarçado de PNG);
//   · o Content-Type GRAVADO é o dos bytes, não o que o navegador disse;
//   · arquivo vazio → 400; acima de 50 MB → 400, sem subir nada;
//   · a URL assinada (caminho legado) exige tipo E tamanho declarados.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({
  enviados: [] as { buf: Buffer; contentType: string }[],
  urlAssinadaPedida: 0,
}));

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: { addDeliveryPhoto: vi.fn(async (p: any) => ({ id: "foto-1", ...p })) } }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, requireAuth: (_req: any, _res: any, next: any) => next() };
});
vi.mock("../objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    async getObjectEntityUploadURL() { H.urlAssinadaPedida += 1; return "https://bucket.exemplo/assinada"; }
    async uploadObjectEntityFromBuffer(buf: Buffer, contentType: string) {
      H.enviados.push({ buf, contentType });
      return `/objects/uploads/${H.enviados.length}`;
    }
  },
}));

const { registerObjectRoutes } = await import("../routes/objects");
const { MAX_UPLOAD_BYTES, TIPOS_PERMITIDOS } = await import("../upload-seguro");

// ── O app de mentira: guarda os handlers e deixa chamá-los na mão ────────────
type Handler = (req: any, res: any, next: any) => any;
const rotas = new Map<string, Handler[]>();
const app: any = {};
for (const verbo of ["get", "post", "patch", "put", "delete"]) {
  app[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return app; };
}
await registerObjectRoutes(app);

/**
 * Roda a rota. O `express.raw` do meio da cadeia é pulado de propósito: quem
 * entrega o Buffer em `req.body` é ele, e aqui o Buffer já vem pronto — o que
 * queremos exercitar é o handler que decide, não o parser do Express.
 */
async function chamar(chave: string, ctx: { body?: any; headers?: any; params?: any } = {}) {
  const hs = rotas.get(chave);
  if (!hs) throw new Error(`Rota não registrada: ${chave}`);
  const req: any = { body: ctx.body, headers: ctx.headers ?? {}, params: ctx.params ?? {}, query: {}, path: "/objects/x", userId: "u1", userName: "Maria" };
  const res: any = { _status: 200, _body: undefined, _pronto: false };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
  res.sendStatus = (c: number) => { res._status = c; res._pronto = true; return res; };
  res.set = () => res; res.setHeader = () => res; res.end = () => res;
  for (const h of hs) {
    if (h.length >= 3 && (h as any).name === "raw") continue;
    let seguiu = false;
    await h(req, res, () => { seguiu = true; });
    if (res._pronto || !seguiu) break;
  }
  return { status: res._status, body: res._body };
}

const bytes = (...b: number[]) => Buffer.from(b);
const PNG = Buffer.concat([bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), Buffer.alloc(16)]);
const JPG = Buffer.concat([bytes(0xff, 0xd8, 0xff, 0xe0), Buffer.alloc(16)]);
const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n");
const ZIP = Buffer.concat([bytes(0x50, 0x4b, 0x03, 0x04), Buffer.alloc(16)]);
const HTML = Buffer.from("<html><script>alert(document.cookie)</script></html>");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const enviar = (buf: Buffer, contentType?: string) =>
  chamar("PUT /api/objects/upload-direct", { body: buf, headers: contentType === undefined ? {} : { "content-type": contentType } });

beforeEach(() => {
  H.enviados = [];
  H.urlAssinadaPedida = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ═════════════════════════════════════════════════════════════════════════════
describe("PUT /api/objects/upload-direct — o que ENTRA no bucket", () => {
  it("o que a lista aceita entra, e entra com o tipo dos bytes", async () => {
    for (const [buf, declarado, gravado] of [
      [PNG, "image/png", "image/png"],
      [JPG, "image/jpeg", "image/jpeg"],
      [PDF, "application/pdf", "application/pdf"],
      [ZIP, XLSX, XLSX],
      [ZIP, "application/zip", "application/zip"],
    ] as [Buffer, string, string][]) {
      const r = await enviar(buf, declarado);
      expect(r.status, declarado).toBe(200);
      expect(r.body.url).toMatch(/^\/objects\/uploads\//);
      expect(H.enviados.at(-1)!.contentType, declarado).toBe(gravado);
    }
    expect(H.enviados).toHaveLength(5);
  });

  it("SVG e HTML são RECUSADOS — é o XSS de mesma origem que a lista fecha", async () => {
    // O objeto é servido por /objects/*, a MESMA origem do app: um SVG com
    // `onload` aberto numa aba roda com a sessão de quem clicou.
    for (const [buf, tipo] of [[SVG, "image/svg+xml"], [HTML, "text/html"]] as [Buffer, string][]) {
      const r = await enviar(buf, tipo);
      expect(r.status, tipo).toBe(400);
      expect(r.body.error).toContain("Tipo de arquivo não permitido");
    }
    expect(H.enviados).toEqual([]);
  });

  it("texto simples e vídeo também ficam de fora (a lista antiga aceitava os dois)", async () => {
    for (const tipo of ["text/plain", "video/mp4", "application/x-msdownload", "application/javascript"]) {
      const r = await enviar(Buffer.from("qualquer coisa"), tipo);
      expect(r.status, tipo).toBe(400);
    }
    expect(H.enviados).toEqual([]);
  });

  it("mentir no Content-Type não ajuda: HTML declarado como PNG cai nos bytes", async () => {
    const r = await enviar(HTML, "image/png");
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("O conteúdo do arquivo não é imagem");
    expect(H.enviados).toEqual([]);
  });

  it("e mentir para BAIXO também não: PDF declarado como PNG é gravado como PDF", async () => {
    const r = await enviar(PDF, "image/png");
    expect(r.status).toBe(200);
    expect(H.enviados[0].contentType).toBe("application/pdf");
  });

  it("navegador que não sabe o tipo (octet-stream / vazio) passa pelos bytes", async () => {
    expect((await enviar(PDF, "application/octet-stream")).status).toBe(200);
    expect((await enviar(PNG, "")).status).toBe(200);
    expect((await enviar(SVG, "application/octet-stream")).status).toBe(400);
    expect(H.enviados.map((e) => e.contentType)).toEqual(["application/pdf", "image/png"]);
  });

  it("arquivo vazio: 400, sem chamar o bucket", async () => {
    expect((await enviar(Buffer.alloc(0), "image/png")).status).toBe(400);
    expect((await chamar("PUT /api/objects/upload-direct", { body: { nao: "é buffer" }, headers: { "content-type": "image/png" } })).status).toBe(400);
    expect(H.enviados).toEqual([]);
  });

  it("acima de 50 MB: 400 com a frase do tamanho, e nada sobe", async () => {
    // O `express.raw({ limit })` já barraria antes; a checagem do handler é a
    // segunda tranca, para o caminho em que o corpo chega por outra via.
    const gigante = Buffer.concat([PNG, Buffer.alloc(MAX_UPLOAD_BYTES + 1 - PNG.length)]);
    const r = await enviar(gigante, "image/png");
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Arquivo muito grande (máximo 50 MB)");
    expect(H.enviados).toEqual([]);
  });

  it("exatamente 50 MB ainda entra — o teto é inclusivo", async () => {
    const noLimite = Buffer.concat([PNG, Buffer.alloc(MAX_UPLOAD_BYTES - PNG.length)]);
    expect((await enviar(noLimite, "image/png")).status).toBe(200);
  });

  it("falha do bucket vira 500 genérico — o erro do Google não vaza para a tela", async () => {
    const { ObjectStorageService } = await import("../objectStorage");
    const espiao = vi
      .spyOn(ObjectStorageService.prototype as any, "uploadObjectEntityFromBuffer")
      .mockRejectedValueOnce(new Error("gs://bucket-interno-da-norte negou: 403"));
    const r = await enviar(PNG, "image/png");
    expect(r.status).toBe(500);
    expect(r.body.error).toBe("Não foi possível enviar o arquivo");
    espiao.mockRestore();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("POST /api/objects/upload — a URL assinada (caminho legado)", () => {
  // O bucket não amarra tipo nem tamanho à URL assinada: o pedido precisa
  // declarar os dois, senão a URL vira um buraco por onde entra qualquer coisa.
  it("sem tipo, com tipo de fora da lista ou sem tamanho: 400 e nenhuma URL emitida", async () => {
    for (const corpo of [
      {},
      { size: 10 },
      { contentType: "text/html", size: 10 },
      { contentType: "image/svg+xml", size: 10 },
      { contentType: "image/png" },
      { contentType: "image/png", size: 0 },
      { contentType: "image/png", size: "muito" },
      { contentType: "image/png", size: MAX_UPLOAD_BYTES + 1 },
    ]) {
      const r = await chamar("POST /api/objects/upload", { body: corpo });
      expect(r.status, JSON.stringify(corpo)).toBe(400);
    }
    expect(H.urlAssinadaPedida).toBe(0);
  });

  it("todo tipo da lista, com tamanho dentro do teto, recebe a URL", async () => {
    for (const tipo of TIPOS_PERMITIDOS) {
      const r = await chamar("POST /api/objects/upload", { body: { contentType: tipo, size: 1024 } });
      expect(r.status, tipo).toBe(200);
      expect(r.body.uploadURL).toBe("https://bucket.exemplo/assinada");
    }
    expect(H.urlAssinadaPedida).toBe(TIPOS_PERMITIDOS.length);
  });
});
