// ─────────────────────────────────────────────────────────────────────────────
// INTEGRAÇÃO COM O CHECKLIST DE ARENA (23/09) — só leitura, por token.
//
// O que este arquivo pina:
//   · a REGRA da peça da Arena entregue (shared/integracao-checklist.ts): é ela
//     que decide o que o montador vai procurar no evento. Legado entregue com
//     delivered_qty 0, entrega parcial, Kit, book, cancelada e excluída;
//   · o grupo e a ordem iguais aos da Revisão Final — o montador compara as
//     duas listas lado a lado;
//   · o TOKEN: falha fechada sem variável (ou curta), 401 no token errado ou
//     ausente, e o log da recusa nunca imprime o que chegou;
//   · a rota nasce protegida: o middleware vem ANTES de qualquer GET do prefixo;
//   · a ARTE da peça: `temImagem` na lista e GET /itens/:itemId/thumb — só
//     por id de peça entregue, só imagem, com cache privado (o único lugar do
//     prefixo sem no-store);
//   · os VOLUMES na lista de entregues (24/09): `tubos` de cada peça com a
//     quantidade dela EM CADA tubo, e `tubos` no topo com linhas/unidades —
//     a conferência em dois passos da arena (quais tubos chegaram; aberto o
//     tubo, quantas peças). Avulso depois dos tubos; linha não entregue fora.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// A rota importa o db (que exige DATABASE_URL no import). Aqui nada toca o
// banco: o db é uma fila de respostas — cada `db.select(...)` leva a próxima
// (na ordem em que a rota consulta), e a cadeia do drizzle é só encenada.
const H = vi.hoisted(() => ({
  respostas: [] as unknown[][],
  // O bucket de mentira: nome do objeto → bytes + tipo gravado.
  bucket: new Map<string, { bytes: Buffer; contentType: string }>(),
  pedidosAoStorage: [] as string[],
}));
vi.mock("../db", () => {
  const consulta = () => {
    const linhas = H.respostas.shift() ?? [];
    const q: any = {};
    for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) q[m] = () => q;
    q.then = (ok: any, falha: any) => Promise.resolve(linhas).then(ok, falha);
    return q;
  };
  return { db: { select: () => consulta() }, pool: {} };
});
vi.mock("../objectStorage", () => {
  class ObjectNotFoundError extends Error {}
  const arquivo = (nome: string): any => ({
    name: nome,
    bucket: { file: (n: string) => arquivo(n) },
    async exists() { return [H.bucket.has(nome)]; },
    async download() {
      const o = H.bucket.get(nome);
      if (!o) throw new Error("não existe");
      return [o.bytes];
    },
    async save() { throw new Error("a integração não grava nada"); },
    async getMetadata() {
      const o = H.bucket.get(nome)!;
      return [{ contentType: o.contentType, size: String(o.bytes.length) }];
    },
  });
  return {
    ObjectNotFoundError,
    ObjectStorageService: class {
      async getObjectEntityFile(caminho: string) {
        H.pedidosAoStorage.push(caminho);
        const nome = caminho.replace(/^\/objects\//, "");
        if (!H.bucket.has(nome)) throw new ObjectNotFoundError();
        return arquivo(nome);
      }
    },
  };
});

import {
  compararComoARevisaoFinal,
  entraNoChecklist,
  grupoPorTipo,
  quantidadeEntregueParaChecklist,
  type PecaParaChecklist,
} from "@shared/integracao-checklist";
import {
  conferirTokenDaIntegracao,
  exigirTokenDoChecklist,
  registerIntegracaoChecklistRoutes,
  MSG_INTEGRACAO_DESATIVADA,
  TOKEN_MINIMO,
  TETO_DO_ORIGINAL_NA_INTEGRACAO,
  temImagemDaPeca,
} from "../routes/integracao-checklist";
import { miniaturasDisponiveis } from "../services/miniaturas";

const peca = (p: Partial<PecaParaChecklist> = {}): PecaParaChecklist => ({
  type: "Pórtico",
  status: "delivered",
  quantity: 10,
  deliveredQty: 10,
  deletedAt: null,
  kitRemessaId: null,
  ...p,
});

describe("a regra da peça da Arena entregue", () => {
  it("entregue por inteiro conta a quantidade toda", () => {
    expect(quantidadeEntregueParaChecklist(peca())).toBe(10);
  });

  it("legado: entregue com delivered_qty 0 vale a quantidade toda", () => {
    expect(quantidadeEntregueParaChecklist(peca({ deliveredQty: 0 }))).toBe(10);
    expect(quantidadeEntregueParaChecklist(peca({ deliveredQty: null }))).toBe(10);
    // Grafia legada do status entregue também vale.
    expect(quantidadeEntregueParaChecklist(peca({ status: "entregue", deliveredQty: 0 }))).toBe(10);
  });

  it("entrega parcial conta o que saiu, mesmo com a peça ainda embalada", () => {
    expect(quantidadeEntregueParaChecklist(peca({ status: "packed", deliveredQty: 7 }))).toBe(7);
    expect(entraNoChecklist(peca({ status: "packed", deliveredQty: 7 }))).toBe(true);
  });

  it("nada entregue não entra", () => {
    expect(entraNoChecklist(peca({ status: "packed", deliveredQty: 0 }))).toBe(false);
    expect(entraNoChecklist(peca({ status: "conferred", deliveredQty: 0 }))).toBe(false);
  });

  it("o teto é a quantidade da peça", () => {
    expect(quantidadeEntregueParaChecklist(peca({ deliveredQty: 14 }))).toBe(10);
  });

  it("peça do Kit fica de fora (o Checklist é da Arena)", () => {
    expect(entraNoChecklist(peca({ kitRemessaId: "remessa-1" }))).toBe(false);
  });

  it("book completo fica de fora (não é peça física)", () => {
    expect(entraNoChecklist(peca({ type: "Book Completo" }))).toBe(false);
    expect(entraNoChecklist(peca({ type: "book_completo" }))).toBe(false);
  });

  it("cancelada fica de fora, mesmo com unidades entregues", () => {
    expect(entraNoChecklist(peca({ status: "canceled", deliveredQty: 5 }))).toBe(false);
    expect(entraNoChecklist(peca({ status: "archived" }))).toBe(false);
  });

  it("excluída fica de fora", () => {
    expect(entraNoChecklist(peca({ deletedAt: new Date("2026-09-01T00:00:00Z") }))).toBe(false);
  });
});

describe("grupo e ordem da Revisão Final", () => {
  it("o grupo vem do modelo com o nome do tipo; grupo vazio é ignorado; o mais antigo vence", () => {
    const mapa = grupoPorTipo([
      { id: "b", name: "Pórtico", group: "Estruturas", createdAt: "2026-05-01T00:00:00Z" },
      { id: "a", name: "Pórtico", group: "Entrada", createdAt: "2026-01-01T00:00:00Z" },
      { id: "c", name: "Rolo", group: null, createdAt: "2026-01-01T00:00:00Z" },
      { id: "d", name: "Rolo", group: "", createdAt: "2026-01-02T00:00:00Z" },
      { id: "e", name: "Rolo", group: "Percurso", createdAt: "2026-06-01T00:00:00Z" },
    ]);
    expect(mapa.get("Pórtico")).toBe("Entrada");
    expect(mapa.get("Rolo")).toBe("Percurso");
    expect(mapa.has("Stand")).toBe(false);
  });

  it("sem grupo primeiro (como na tela), depois grupo, tipo e código", () => {
    const lista = [
      { grupo: "Pórtico", tipo: "Testeira", codigo: "0010" },
      { grupo: "Pórtico", tipo: "Lona", codigo: "0200" },
      { grupo: "Pórtico", tipo: "Lona", codigo: "0030" },
      { grupo: null, tipo: "Stand", codigo: "0001" },
      { grupo: "Arena", tipo: "Zeta", codigo: "0005" },
    ];
    expect([...lista].sort(compararComoARevisaoFinal).map((i) => i.codigo))
      .toEqual(["0001", "0005", "0030", "0200", "0010"]);
  });
});

describe("o token da integração", () => {
  const TOKEN = "t".repeat(TOKEN_MINIMO);

  it("sem variável configurada, a integração está desativada", () => {
    expect(conferirTokenDaIntegracao(`Bearer ${TOKEN}`, undefined)).toBe("desativada");
    expect(conferirTokenDaIntegracao(`Bearer ${TOKEN}`, "")).toBe("desativada");
  });

  it("variável curta demais também desativa (falha fechada)", () => {
    const curto = "x".repeat(TOKEN_MINIMO - 1);
    expect(conferirTokenDaIntegracao(`Bearer ${curto}`, curto)).toBe("desativada");
  });

  it("token errado ou ausente é recusado", () => {
    expect(conferirTokenDaIntegracao(`Bearer ${"u".repeat(TOKEN_MINIMO)}`, TOKEN)).toBe("recusado");
    expect(conferirTokenDaIntegracao(`Bearer ${TOKEN}x`, TOKEN)).toBe("recusado");
    expect(conferirTokenDaIntegracao(undefined, TOKEN)).toBe("recusado");
    expect(conferirTokenDaIntegracao("", TOKEN)).toBe("recusado");
    // Sem o esquema Bearer não vale, mesmo com o valor certo.
    expect(conferirTokenDaIntegracao(TOKEN, TOKEN)).toBe("recusado");
    expect(conferirTokenDaIntegracao(`Basic ${TOKEN}`, TOKEN)).toBe("recusado");
  });

  it("token certo passa", () => {
    expect(conferirTokenDaIntegracao(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
    expect(conferirTokenDaIntegracao(`bearer ${TOKEN}`, TOKEN)).toBe("ok");
  });
});

describe("o middleware", () => {
  const TOKEN = "s".repeat(40);
  const original = process.env.CHECKLIST_INTEGRACAO_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.CHECKLIST_INTEGRACAO_TOKEN;
    else process.env.CHECKLIST_INTEGRACAO_TOKEN = original;
    vi.restoreAllMocks();
  });

  function chamar(authorization?: string) {
    const req: any = { method: "GET", baseUrl: "/api/integracao/checklist", path: "/eventos", ip: "1.2.3.4", headers: authorization ? { authorization } : {} };
    const res: any = { _status: 200, _body: undefined, _headers: {} as Record<string, string> };
    res.setHeader = (k: string, v: string) => { res._headers[k] = v; };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: any) => { res._body = b; return res; };
    const next = vi.fn();
    exigirTokenDoChecklist(req, res, next);
    return { res, next };
  }

  it("503 com a integração desligada, e sem cache", () => {
    delete process.env.CHECKLIST_INTEGRACAO_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { res, next } = chamar(`Bearer ${TOKEN}`);
    expect(res._status).toBe(503);
    expect(res._body).toEqual({ error: MSG_INTEGRACAO_DESATIVADA });
    expect(res._headers["Cache-Control"]).toBe("no-store");
    expect(next).not.toHaveBeenCalled();
  });

  it("401 no token errado, e o log não imprime o token", () => {
    process.env.CHECKLIST_INTEGRACAO_TOKEN = TOKEN;
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errado = "segredo-errado-que-nao-pode-vazar-no-log";
    const { res, next } = chamar(`Bearer ${errado}`);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    const logado = aviso.mock.calls.flat().join(" ");
    expect(logado).toContain("token errado");
    expect(logado).not.toContain(errado);
    expect(logado).not.toContain(TOKEN);
  });

  it("token certo segue para a rota, com no-store", () => {
    process.env.CHECKLIST_INTEGRACAO_TOKEN = TOKEN;
    const { res, next } = chamar(`Bearer ${TOKEN}`);
    expect(next).toHaveBeenCalledOnce();
    expect(res._headers["Cache-Control"]).toBe("no-store");
  });
});

describe("o registro das rotas", () => {
  it("o token vem antes de qualquer GET do prefixo, e tudo é GET", () => {
    const ordem: string[] = [];
    const appFalso: any = {
      use: (caminho: string, fn: any) => { ordem.push(`use ${caminho}${fn === exigirTokenDoChecklist ? " [token]" : ""}`); return appFalso; },
      get: (caminho: string) => { ordem.push(`get ${caminho}`); return appFalso; },
      post: () => { throw new Error("a integração é só leitura"); },
      patch: () => { throw new Error("a integração é só leitura"); },
      put: () => { throw new Error("a integração é só leitura"); },
      delete: () => { throw new Error("a integração é só leitura"); },
    };
    registerIntegracaoChecklistRoutes(appFalso);
    expect(ordem[0]).toBe("use /api/integracao/checklist [token]");
    expect(ordem.filter((l) => l.startsWith("get "))).toEqual([
      "get /api/integracao/checklist/eventos",
      "get /api/integracao/checklist/eventos/:id/entregues",
      "get /api/integracao/checklist/itens/:itemId/thumb",
    ]);
  });

  it("está registrada no orquestrador", () => {
    const fonte = readFileSync(path.resolve(__dirname, "../routes.ts"), "utf8");
    expect(fonte).toContain("registerIntegracaoChecklistRoutes(app);");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// A ARTE DA PEÇA — `temImagem` na lista e a rota da miniatura.
// Roda o handler DE VERDADE, atrás do middleware de verdade, com o db em fila
// e o bucket de mentira lá de cima.
// ═════════════════════════════════════════════════════════════════════════════
const seSharp = miniaturasDisponiveis() ? it : it.skip;
const sharpDoTeste = async (): Promise<any> => {
  const { createRequire } = (await import("node:module")) as unknown as { createRequire: (url: string) => NodeRequire };
  return createRequire(import.meta.url)("sharp");
};

describe("a arte da peça", () => {
  const TOKEN = "a".repeat(40);
  const AUTH = `Bearer ${TOKEN}`;
  const original = process.env.CHECKLIST_INTEGRACAO_TOKEN;
  const ID = "3f0c9a1e-5b7d-4c2a-9e8f-1a2b3c4d5e6f";
  const ROTA_THUMB = "/api/integracao/checklist/itens/:itemId/thumb";
  const ROTA_ENTREGUES = "/api/integracao/checklist/eventos/:id/entregues";

  beforeEach(() => {
    process.env.CHECKLIST_INTEGRACAO_TOKEN = TOKEN;
    H.respostas = [];
    H.bucket.clear();
    H.pedidosAoStorage = [];
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    if (original === undefined) delete process.env.CHECKLIST_INTEGRACAO_TOKEN;
    else process.env.CHECKLIST_INTEGRACAO_TOKEN = original;
    vi.restoreAllMocks();
  });

  const gets = new Map<string, (req: any, res: any) => any>();
  const appFalso: any = {
    use: () => appFalso,
    get: (caminho: string, fn: any) => { gets.set(caminho, fn); return appFalso; },
  };
  registerIntegracaoChecklistRoutes(appFalso);

  /** Middleware do token e, se ele deixar, o handler da rota. */
  async function chamar(rota: string, params: Record<string, string>, authorization: string | null = AUTH) {
    const req: any = { method: "GET", baseUrl: "/api/integracao/checklist", path: "/x", ip: "1.2.3.4", params, headers: authorization ? { authorization } : {} };
    const res: any = { _status: 200, _headers: {} as Record<string, string>, _body: undefined, _bytes: undefined as Buffer | undefined };
    res.setHeader = (k: string, v: string) => { res._headers[k] = v; };
    res.set = (o: Record<string, string>) => { Object.assign(res._headers, o); return res; };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: any) => { res._body = b; return res; };
    res.end = (b: Buffer) => { res._bytes = b; return res; };
    let seguiu = false;
    exigirTokenDoChecklist(req, res, () => { seguiu = true; });
    if (seguiu) await gets.get(rota)!(req, res);
    return res;
  }

  const pecaDoBanco = (p: Record<string, unknown> = {}) => ({
    id: ID, type: "Pórtico", quantity: 2, deliveredQty: 2, status: "delivered",
    deletedAt: null, kitRemessaId: null, approvalThumbUrl: "/objects/uploads/arte-1", ...p,
  });
  const PNG_FALSO = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

  describe("temImagem na lista de entregues", () => {
    it("true só com arte no nosso storage; nulo, vazio e link de fora são false", async () => {
      H.respostas = [
        [{ id: "ev-1", nome: "Evento", inicio: null, saidaCaminhao: null, status: "active" }],
        [
          { ...pecaDoBanco({ id: "p1", approvalThumbUrl: "/objects/uploads/arte-1" }), displayId: "0001" },
          { ...pecaDoBanco({ id: "p2", approvalThumbUrl: null }), displayId: "0002" },
          { ...pecaDoBanco({ id: "p3", approvalThumbUrl: "  " }), displayId: "0003" },
          { ...pecaDoBanco({ id: "p4", approvalThumbUrl: "https://exemplo.com/arte.png" }), displayId: "0004" },
        ],
        [], // volumes
        [], // modelos
      ];
      const res = await chamar(ROTA_ENTREGUES, { id: "ev-1" });
      expect(res._status).toBe(200);
      const porCodigo = Object.fromEntries(res._body.itens.map((i: any) => [i.codigo, i.temImagem]));
      expect(porCodigo).toEqual({ "0001": true, "0002": false, "0003": false, "0004": false });
      // O caminho no storage não vaza para o Checklist: só o booleano.
      expect(JSON.stringify(res._body)).not.toContain("/objects/");
    });
  });

  describe("os volumes (tubos) na lista de entregues", () => {
    const EVENTO = [{ id: "ev-1", nome: "Evento", inicio: null, saidaCaminhao: null, status: "active" }];
    const ENTREGUE = new Date("2026-09-20T12:00:00Z");
    /** Uma linha peça × volume, como a consulta de volumes devolve. */
    const linha = (l: Record<string, unknown>) => ({
      quantidade: 1, linhaEntregueEm: ENTREGUE, avulso: false,
      tuboEntregueEm: ENTREGUE, tuboRecebidoPor: "Carlos", fotos: 0, ...l,
    });

    it("peça dividida em dois tubos (7 + 3), avulso depois dos tubos, peça sem tubo com []", async () => {
      H.respostas = [
        EVENTO,
        [
          { ...pecaDoBanco({ id: "p-div", quantity: 10, deliveredQty: 10 }), displayId: "0001" },
          { ...pecaDoBanco({ id: "p-av", quantity: 1, deliveredQty: 1 }), displayId: "0002" },
          { ...pecaDoBanco({ id: "p-sem", quantity: 4, deliveredQty: 4 }), displayId: "0003" },
          { ...pecaDoBanco({ id: "p-t2", quantity: 5, deliveredQty: 5 }), displayId: "0004" },
        ],
        [
          // Fora de ordem de propósito: o avulso vem primeiro (número −1).
          linha({ itemId: "p-av", tuboId: "av-1", numero: -1, quantidade: 1, avulso: true, fotos: 1, tuboRecebidoPor: null }),
          linha({ itemId: "p-div", tuboId: "tubo-2", numero: 2, quantidade: 3, fotos: 0 }),
          linha({ itemId: "p-div", tuboId: "tubo-1", numero: 1, quantidade: 7, fotos: 2 }),
          linha({ itemId: "p-t2", tuboId: "tubo-2", numero: 2, quantidade: 5, fotos: 0 }),
          // Linha ainda não entregue: não conta (nem tubo, nem peça).
          linha({ itemId: "p-t2", tuboId: "tubo-3", numero: 3, quantidade: 5, linhaEntregueEm: null, tuboEntregueEm: null }),
          // Linha de peça que não está em `itens`: o tubo não aparece por ela.
          linha({ itemId: "p-fora", tuboId: "tubo-4", numero: 4, quantidade: 2 }),
        ],
        [], // modelos
      ];
      const res = await chamar(ROTA_ENTREGUES, { id: "ev-1" });
      expect(res._status).toBe(200);
      expect(res._headers["Cache-Control"]).toBe("no-store");
      const porCodigo = Object.fromEntries(res._body.itens.map((i: any) => [i.codigo, i]));

      expect(porCodigo["0001"].tubos).toEqual([
        { tuboId: "tubo-1", numero: 1, quantidade: 7 },
        { tuboId: "tubo-2", numero: 2, quantidade: 3 },
      ]);
      // `volumes` continua como antes (compatibilidade).
      expect(porCodigo["0001"].volumes).toEqual([1, 2]);
      expect(porCodigo["0002"].tubos).toEqual([{ tuboId: "av-1", numero: -1, quantidade: 1 }]);
      expect(porCodigo["0002"].volumes).toEqual([-1]);
      expect(porCodigo["0003"].tubos).toEqual([]);
      expect(porCodigo["0003"].volumes).toEqual([]);
      expect(porCodigo["0004"].tubos).toEqual([{ tuboId: "tubo-2", numero: 2, quantidade: 5 }]);
      expect(porCodigo["0004"].volumes).toEqual([2]);

      expect(res._body.tubos).toEqual([
        { id: "tubo-1", numero: 1, avulso: false, entregueEm: ENTREGUE.toISOString(), recebidoPor: "Carlos", linhas: 1, unidades: 7, fotos: 2 },
        { id: "tubo-2", numero: 2, avulso: false, entregueEm: ENTREGUE.toISOString(), recebidoPor: "Carlos", linhas: 2, unidades: 8, fotos: 0 },
        { id: "av-1", numero: -1, avulso: true, entregueEm: ENTREGUE.toISOString(), recebidoPor: null, linhas: 1, unidades: 1, fotos: 1 },
      ]);
    });

    it("avulsos ordenam por valor absoluto, depois de todos os tubos", async () => {
      H.respostas = [
        EVENTO,
        [{ ...pecaDoBanco({ id: "p1", quantity: 9, deliveredQty: 9 }), displayId: "0001" }],
        [
          linha({ itemId: "p1", tuboId: "av-2", numero: -2, avulso: true }),
          linha({ itemId: "p1", tuboId: "t-10", numero: 10 }),
          linha({ itemId: "p1", tuboId: "av-1", numero: -1, avulso: true }),
          linha({ itemId: "p1", tuboId: "t-3", numero: 3 }),
        ],
        [],
      ];
      const res = await chamar(ROTA_ENTREGUES, { id: "ev-1" });
      expect(res._body.tubos.map((t: any) => t.numero)).toEqual([3, 10, -1, -2]);
      expect(res._body.itens[0].tubos.map((t: any) => t.numero)).toEqual([3, 10, -1, -2]);
      // `volumes` segue a ordem numérica de sempre.
      expect(res._body.itens[0].volumes).toEqual([-2, -1, 3, 10]);
    });

    it("sem peça entregue, sem tubos — e sem consultar volumes", async () => {
      H.respostas = [EVENTO, [], [["não deveria ser lida"]]];
      const res = await chamar(ROTA_ENTREGUES, { id: "ev-1" });
      expect(res._status).toBe(200);
      expect(res._body.itens).toEqual([]);
      expect(res._body.tubos).toEqual([]);
      expect(H.respostas).toHaveLength(1);
    });
  });

  describe("GET /itens/:itemId/thumb", () => {
    it("sem token não chega à rota (401), nem ao banco nem ao storage", async () => {
      H.respostas = [[pecaDoBanco()]];
      const res = await chamar(ROTA_THUMB, { itemId: ID }, null);
      expect(res._status).toBe(401);
      expect(res._body.error).toBeTruthy();
      expect(res._bytes).toBeUndefined();
      expect(H.respostas).toHaveLength(1);
      expect(H.pedidosAoStorage).toEqual([]);
    });

    it("id fora do formato é 400, sem ir ao banco", async () => {
      for (const itemId of ["abc", "../../objects/uploads/x", `${ID}x`, ""]) {
        H.respostas = [[pecaDoBanco()]];
        const res = await chamar(ROTA_THUMB, { itemId });
        expect(res._status, itemId).toBe(400);
        expect(res._body.erro).toBeTruthy();
        expect(H.respostas, itemId).toHaveLength(1);
      }
    });

    it("404 {erro}: peça inexistente, não entregue, do Kit, excluída, cancelada ou book", async () => {
      for (const linhas of [
        [],
        [pecaDoBanco({ status: "packed", deliveredQty: 0 })],
        [pecaDoBanco({ kitRemessaId: "remessa-1" })],
        [pecaDoBanco({ deletedAt: new Date() })],
        [pecaDoBanco({ status: "canceled", deliveredQty: 2 })],
        [pecaDoBanco({ type: "Book Completo" })],
      ]) {
        H.respostas = [linhas];
        const res = await chamar(ROTA_THUMB, { itemId: ID });
        expect(res._status).toBe(404);
        expect(typeof res._body.erro).toBe("string");
      }
      expect(H.pedidosAoStorage).toEqual([]);
    });

    it("404 sem arte, ou com arte fora do nosso storage — nunca vai buscar o link", async () => {
      for (const approvalThumbUrl of [null, "", "https://exemplo.com/arte.png", "/etc/passwd"]) {
        H.respostas = [[pecaDoBanco({ approvalThumbUrl })]];
        const res = await chamar(ROTA_THUMB, { itemId: ID });
        expect(res._status, String(approvalThumbUrl)).toBe(404);
        expect(res._body.erro).toBeTruthy();
      }
      expect(H.pedidosAoStorage).toEqual([]);
    });

    it("404 quando o objeto sumiu do storage", async () => {
      H.respostas = [[pecaDoBanco({ approvalThumbUrl: "/objects/uploads/sumiu" })]];
      const res = await chamar(ROTA_THUMB, { itemId: ID });
      expect(res._status).toBe(404);
      expect(res._body.erro).toBeTruthy();
      expect(H.pedidosAoStorage).toEqual(["/objects/uploads/sumiu"]);
    });

    it("a miniatura gravada sai como webp, com cache privado de um dia e nosniff", async () => {
      const mini = Buffer.from("RIFF....WEBPVP8 miniatura");
      H.bucket.set("uploads/arte-g", { bytes: PNG_FALSO, contentType: "image/png" });
      H.bucket.set("uploads/arte-g/thumb.webp", { bytes: mini, contentType: "image/webp" });
      H.respostas = [[pecaDoBanco({ approvalThumbUrl: "/objects/uploads/arte-g" })]];
      const res = await chamar(ROTA_THUMB, { itemId: ID });
      expect(res._status).toBe(200);
      expect(res._bytes).toEqual(mini);
      expect(res._headers["Content-Type"]).toBe("image/webp");
      // O no-store do middleware é sobreposto SÓ aqui.
      expect(res._headers["Cache-Control"]).toBe("private, max-age=86400");
      expect(res._headers["X-Content-Type-Options"]).toBe("nosniff");
      expect(res._body).toBeUndefined();
    });

    seSharp("sem miniatura gravada, gera o webp de até 320px a pedido", async () => {
      const sharp = await sharpDoTeste();
      const png = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: 200, g: 80, b: 20 } } }).png().toBuffer();
      H.bucket.set("uploads/arte-gerar", { bytes: png, contentType: "image/png" });
      H.respostas = [[pecaDoBanco({ approvalThumbUrl: "/objects/uploads/arte-gerar" })]];
      const res = await chamar(ROTA_THUMB, { itemId: ID });
      expect(res._status).toBe(200);
      expect(res._headers["Content-Type"]).toBe("image/webp");
      const meta = await sharp(res._bytes).metadata();
      expect(meta.format).toBe("webp");
      expect(Math.max(meta.width, meta.height)).toBeLessThanOrEqual(320);
    });

    it("sem miniatura possível, o original pequeno sai com o tipo REAL dele", async () => {
      // Bytes que o sharp não lê: a geração falha (ou nem há sharp) e cai no original.
      H.bucket.set("uploads/arte-png", { bytes: PNG_FALSO, contentType: "image/png" });
      H.respostas = [[pecaDoBanco({ approvalThumbUrl: "/objects/uploads/arte-png" })]];
      const res = await chamar(ROTA_THUMB, { itemId: ID });
      expect(res._status).toBe(200);
      expect(res._bytes).toEqual(PNG_FALSO);
      expect(res._headers["Content-Type"]).toBe("image/png");
      expect(res._headers["Cache-Control"]).toBe("private, max-age=86400");
      expect(res._headers["X-Content-Type-Options"]).toBe("nosniff");
    });

    it("original fora da lista de imagens (PDF, SVG) ou grande demais é 404", async () => {
      H.bucket.set("uploads/arte-pdf", { bytes: Buffer.from("%PDF-1.7\n"), contentType: "application/pdf" });
      H.bucket.set("uploads/arte-svg", { bytes: Buffer.from("<svg/>"), contentType: "image/svg+xml" });
      H.bucket.set("uploads/arte-grande", {
        bytes: Buffer.concat([PNG_FALSO, Buffer.alloc(TETO_DO_ORIGINAL_NA_INTEGRACAO)]),
        contentType: "image/png",
      });
      for (const nome of ["arte-pdf", "arte-svg", "arte-grande"]) {
        H.respostas = [[pecaDoBanco({ approvalThumbUrl: `/objects/uploads/${nome}` })]];
        const res = await chamar(ROTA_THUMB, { itemId: ID });
        expect(res._status, nome).toBe(404);
        expect(res._body.erro).toBeTruthy();
        expect(res._bytes, nome).toBeUndefined();
      }
    });
  });
});

describe("temImagemDaPeca", () => {
  it("só objeto do nosso storage conta como arte", () => {
    expect(temImagemDaPeca("/objects/uploads/x")).toBe(true);
    expect(temImagemDaPeca("https://storage.googleapis.com/b/.private/uploads/x")).toBe(true);
    expect(temImagemDaPeca(null)).toBe(false);
    expect(temImagemDaPeca(undefined)).toBe(false);
    expect(temImagemDaPeca("")).toBe(false);
    expect(temImagemDaPeca("/objects/")).toBe(false);
    expect(temImagemDaPeca("https://exemplo.com/a.png")).toBe(false);
  });
});
