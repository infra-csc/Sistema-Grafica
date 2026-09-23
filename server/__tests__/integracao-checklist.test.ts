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
//   · a rota nasce protegida: o middleware vem ANTES de qualquer GET do prefixo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// A rota importa o db (que exige DATABASE_URL no import). Aqui nada toca o
// banco: os testes de rota só olham o registro e o middleware.
vi.mock("../db", () => ({ db: {}, pool: {} }));

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
} from "../routes/integracao-checklist";

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
    ]);
  });

  it("está registrada no orquestrador", () => {
    const fonte = readFileSync(path.resolve(__dirname, "../routes.ts"), "utf8");
    expect(fonte).toContain("registerIntegracaoChecklistRoutes(app);");
  });
});
