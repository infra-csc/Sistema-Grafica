// ─────────────────────────────────────────────────────────────────────────────
// PAGINAÇÃO DA TRILHA — o teto de 500 deixa de ser o fim da linha.
//
// O que originou este arquivo: `getAuditLogs` devolvia no máximo 500 registros
// e não havia como pedir os anteriores. O Histórico, para não exibir uma trilha
// quase vazia, RECONSTRUÍA o resto a partir de carimbos de data das tabelas de
// eventos e peças — e carimbo é data, não é gente: 4.287 das 4.755 linhas da
// tela apareciam sem autor. O teto era a causa.
//
// Três garantias, e as três podem quebrar em silêncio:
//
//   1. COMPATIBILIDADE — a resposta padrão continua sendo um ARRAY. Cinco telas
//      consomem `logs.map(...)` direto; um dia em que a rota passe a devolver
//      objeto por padrão, todas quebram de uma vez.
//   2. CURSOR — ida e volta exata, e recusa explícita do texto inválido.
//      Ignorar um cursor quebrado devolveria a primeira página de novo, e o
//      cliente que caminha para trás entraria em laço pedindo sempre a mesma.
//   3. CUSTO — `limit` desce para o SQL (e não recorta um resultado já trazido)
//      e o `count(*)` só roda com ?withTotal=1. Cobrar a varredura da tabela
//      inteira por página faria a leitura da trilha custar o quadrado dela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// O `db` é um encadeamento de mentira que ANOTA o que recebeu: é ele que
// permite testar a consulta montada sem banco nenhum. O `storage` é o de
// verdade — os testes de rota trocam só os dois métodos, com spy.
const H = vi.hoisted(() => {
  const espiao: any = { where: null, orderBy: [], limit: null };
  const chain: any = {
    from: () => chain,
    where: (c: any) => { espiao.where = c; return chain; },
    orderBy: (...a: any[]) => { espiao.orderBy = a; return chain; },
    limit: (n: number) => { espiao.limit = n; return Promise.resolve([]); },
  };
  return { espiao, db: { select: () => chain } };
});

vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../routes/shared", async () => {
  const real = await vi.importActual<any>("../routes/shared");
  return { ...real, requireAuth: (_req: any, _res: any, next: any) => next() };
});

import {
  registerAuditLogRoutes,
  encodeAuditCursor,
  parseAuditCursor,
} from "../routes/audit-logs";
import {
  storage,
  clampAuditLogLimit,
  AUDIT_LOGS_DEFAULT_LIMIT,
  AUDIT_LOGS_MAX_LIMIT,
} from "../storage";

/* ── Harness: um "Express" que só guarda o handler ── */
type Handler = (req: any, res: any, next: any) => any;
let handler: Handler;
const appFalso: any = {
  get: (_caminho: string, ...hs: Handler[]) => { handler = hs[hs.length - 1]; return appFalso; },
};
registerAuditLogRoutes(appFalso);

async function chamar(query: Record<string, string> = {}) {
  const req: any = { query, params: {}, headers: {} };
  const res: any = { _status: 200, _body: undefined };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; return res; };
  await handler(req, res, () => {});
  return res;
}

/** Página de `n` registros, do mais novo para o mais antigo. */
function pagina(n: number, desde = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `log-${desde + i}`,
    userName: "Ana Souza",
    userId: "u-ana",
    action: "updated",
    entityType: "item",
    entityId: "item-1",
    details: "Item editado",
    createdAt: new Date(Date.UTC(2026, 7, 14, 12, 0, 0) - (desde + i) * 1000),
  }));
}

let recebido: any[] = [];
let contagens = 0;
let lista: any;

/** Troca os dois métodos do storage REAL; a consulta SQL é testada à parte. */
function stubStorage(resposta: () => Promise<any[]>) {
  lista = vi.spyOn(storage, "getAuditLogs").mockImplementation(async (...args: any[]) => {
    recebido.push(args);
    return resposta();
  });
  vi.spyOn(storage, "getAuditLogsCount").mockImplementation(async () => {
    contagens += 1;
    return 9_431;
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  recebido = [];
  contagens = 0;
  stubStorage(async () => pagina(3));
});

describe("clampAuditLogLimit — nenhum `?limit=` de fora vira um dump", () => {
  it("ausente ou inválido cai no padrão de 500", () => {
    for (const v of [undefined, null, NaN, Infinity]) {
      expect(clampAuditLogLimit(v as any)).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
    }
  });

  it("zero e negativo caem no padrão em vez de virar página vazia ou erro de SQL", () => {
    expect(clampAuditLogLimit(0)).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
    expect(clampAuditLogLimit(-10)).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
  });

  it("respeita o pedido dentro do teto e corta acima dele", () => {
    expect(clampAuditLogLimit(8)).toBe(8);
    expect(clampAuditLogLimit(1000)).toBe(1000);
    expect(clampAuditLogLimit(999_999)).toBe(AUDIT_LOGS_MAX_LIMIT);
  });
});

describe("cursor — ida e volta exata, e recusa do que não é cursor", () => {
  it("volta o MESMO par (instante, id) que saiu", () => {
    const log = { createdAt: new Date("2026-08-14T16:20:34.123Z"), id: "abc-123" };
    const texto = encodeAuditCursor(log);
    expect(texto).toBe("2026-08-14T16:20:34.123Z|abc-123");
    expect(parseAuditCursor(texto)).toEqual(log);
  });

  it("aceita createdAt que chegou como string (é assim que sai do JSON)", () => {
    expect(encodeAuditCursor({ createdAt: "2026-08-14T16:20:34.123Z", id: "x" }))
      .toBe("2026-08-14T16:20:34.123Z|x");
  });

  it("texto inválido devolve null — nunca um cursor que aponta para lugar nenhum", () => {
    for (const lixo of ["", "|", "abc", "abc|", "|abc", "não-é-data|abc-123"]) {
      expect(parseAuditCursor(lixo)).toBeNull();
    }
  });

  it("id com hífen não é quebrado no lugar errado (a quebra é no PRIMEIRO |)", () => {
    const p = parseAuditCursor("2026-08-14T16:20:34.123Z|9f0c-4d2e-a1b3");
    expect(p?.id).toBe("9f0c-4d2e-a1b3");
  });
});

describe("GET /api/audit-logs — o formato padrão é intocável", () => {
  it("sem parâmetro nenhum a resposta é ARRAY (cinco telas dependem disso)", async () => {
    const res = await chamar();
    expect(Array.isArray(res._body)).toBe(true);
    expect(res._body).toHaveLength(3);
  });

  it("sem ?limit, a página pedida ao storage é a de sempre: 500", async () => {
    await chamar();
    expect(recebido[0][2]).toMatchObject({ limit: AUDIT_LOGS_DEFAULT_LIMIT, cursor: null });
  });

  it("entityType/entityId continuam chegando ao storage", async () => {
    await chamar({ entityType: "item", entityId: "item-9" });
    expect(recebido[0][0]).toBe("item");
    expect(recebido[0][1]).toBe("item-9");
  });

  it("?limit=8 desce para o SQL — não traz 500 pelo cabo para descartar 492", async () => {
    await chamar({ limit: "8" });
    expect(recebido[0][2].limit).toBe(8);
  });

  it("?limit absurdo é cortado no teto da rota", async () => {
    await chamar({ limit: "999999" });
    expect(recebido[0][2].limit).toBe(AUDIT_LOGS_MAX_LIMIT);
  });
});

describe("GET /api/audit-logs — as duas formas de objeto", () => {
  it("?withTotal=1 devolve { logs, total, nextCursor }", async () => {
    const res = await chamar({ withTotal: "1" });
    expect(Array.isArray(res._body)).toBe(false);
    expect(res._body.logs).toHaveLength(3);
    expect(res._body.total).toBe(9_431);
    expect(res._body).toHaveProperty("nextCursor");
  });

  it("?paged=1 NÃO paga o count(*) — é o que torna a página seguinte barata", async () => {
    const res = await chamar({ paged: "1" });
    expect(res._body).toHaveProperty("nextCursor");
    expect(res._body).not.toHaveProperty("total");
    expect(contagens).toBe(0);
  });

  it("?withTotal=1 paga o count(*) uma vez, e só ele", async () => {
    await chamar({ withTotal: "1" });
    expect(contagens).toBe(1);
  });
});

describe("GET /api/audit-logs — o cursor diz quando parar", () => {
  it("página CHEIA devolve o cursor do último registro", async () => {
    const res = await chamar({ paged: "1", limit: "3" });
    const ultimo = pagina(3)[2];
    expect(res._body.nextCursor).toBe(encodeAuditCursor(ultimo));
  });

  it("página CURTA devolve nextCursor null — o cliente para sem pedir de novo", async () => {
    const res = await chamar({ paged: "1", limit: "10" });
    expect(res._body.nextCursor).toBeNull();
  });

  it("página VAZIA também para, sem estourar no último registro inexistente", async () => {
    stubStorage(async () => []);
    const res = await chamar({ paged: "1", limit: "10" });
    expect(res._body.logs).toEqual([]);
    expect(res._body.nextCursor).toBeNull();
  });

  it("o cursor recebido chega ao storage como Date + id, não como texto", async () => {
    const cursor = "2026-08-14T16:20:34.123Z|abc-123";
    await chamar({ paged: "1", cursor });
    expect(recebido[0][2].cursor).toEqual({
      createdAt: new Date("2026-08-14T16:20:34.123Z"),
      id: "abc-123",
    });
  });

  it("cursor inválido responde 400 — ignorar devolveria a primeira página em laço", async () => {
    const res = await chamar({ paged: "1", cursor: "lixo" });
    expect(res._status).toBe(400);
    expect(String(res._body.error)).toMatch(/cursor/i);
    expect(lista).not.toHaveBeenCalled();
  });

  it("cursor em branco é ausência de cursor, não erro", async () => {
    const res = await chamar({ paged: "1", cursor: "   " });
    expect(res._status).toBe(200);
    expect(recebido[0][2].cursor).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A CONSULTA — o que o storage monta antes de ir ao banco.
//
// Não há banco nos testes desta casa, então o `db` é um encadeamento de mentira
// que anota o que recebeu. O que se quer barrar aqui é concreto: alguém tirar o
// desempate por `id` da ordenação (com empate no instante — e a mesma transação
// grava dois logs no mesmo instante — a paginação pula ou repete linhas), ou o
// `limit` deixar de chegar ao SQL.
// ─────────────────────────────────────────────────────────────────────────────
describe("storage.getAuditLogs — ordem total e limite no SQL", () => {
  async function consultar(...args: any[]) {
    // Sem os spies: aqui é o método de VERDADE que roda, contra o db de mentira.
    vi.restoreAllMocks();
    H.espiao.where = null;
    H.espiao.orderBy = [];
    H.espiao.limit = null;
    await (storage as any).getAuditLogs(...args);
    return H.espiao;
  }

  it("ordena por (createdAt, id) — só createdAt não é ordem TOTAL", async () => {
    const espiao = await consultar();
    expect(espiao.orderBy).toHaveLength(2);
  });

  it("sem filtro e sem cursor não há WHERE nenhum, e o limite é o padrão", async () => {
    const espiao = await consultar();
    expect(espiao.where).toBeNull();
    expect(espiao.limit).toBe(AUDIT_LOGS_DEFAULT_LIMIT);
  });

  it("o limite pedido chega ao SQL", async () => {
    const espiao = await consultar(undefined, undefined, { limit: 1000 });
    expect(espiao.limit).toBe(1000);
  });

  it("o cursor vira WHERE — sem ele a página seguinte repetiria a primeira", async () => {
    const espiao = await consultar(undefined, undefined, {
      cursor: { createdAt: new Date("2026-08-14T16:20:34.123Z"), id: "abc" },
    });
    expect(espiao.where).not.toBeNull();
  });

  it("filtro por entidade e cursor convivem no mesmo WHERE", async () => {
    const espiao = await consultar("item", "item-1", {
      cursor: { createdAt: new Date("2026-08-14T16:20:34.123Z"), id: "abc" },
      limit: 50,
    });
    expect(espiao.where).not.toBeNull();
    expect(espiao.limit).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OS DOIS CONSUMIDORES — o que não pode quebrar do lado da tela.
//
// Lido do CÓDIGO-FONTE pela mesma razão de auditoria-autoria.test.ts: o modo de
// falha aqui é textual e silencioso. Trocar a chave de cache de duas partes por
// uma só, ou pedir ?withTotal em cada página, não quebra teste nenhum, não
// levanta erro de tipo e não aparece na tela — só faz o WebSocket parar de
// atualizar a trilha, ou o banco varrer a tabela inteira vinte vezes por carga.
// ─────────────────────────────────────────────────────────────────────────────
const raiz = path.resolve(__dirname, "..", "..");
const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

describe("as telas que consomem a rota", () => {
  const historico = ler("client/src/pages/historico.tsx");
  const logsSistema = ler("client/src/pages/logs-sistema.tsx");

  it("Histórico e Logs do Sistema dividem a MESMA chave de duas partes", () => {
    const chave = /\["\/api\/audit-logs",\s*"\?withTotal=1"\]/;
    expect(historico).toMatch(chave);
    expect(logsSistema).toMatch(chave);
  });

  it("a chave começa por '/api/audit-logs' — é o que a invalidação do WebSocket casa", () => {
    // use-websocket.ts invalida ['/api/audit-logs'], que casa por ELEMENTO do
    // array. Colar a querystring na primeira posição desligaria a atualização
    // automática das duas telas de uma vez.
    expect(historico).not.toMatch(/queryKey:\s*\["\/api\/audit-logs\?/);
    expect(logsSistema).not.toMatch(/queryKey:\s*\["\/api\/audit-logs\?/);
  });

  it("o caminhamento pede ?paged=1 — nunca ?withTotal, que cobra count(*) por página", () => {
    const url = historico.match(/`\/api\/audit-logs\?[^`]+`/)?.[0] ?? "";
    expect(url).toContain("paged=1");
    expect(url).toContain("cursor=");
    expect(url).not.toContain("withTotal");
  });

  it("o cursor vai escapado na URL — o ISO tem ':' e o separador é '|'", () => {
    expect(historico).toMatch(/encodeURIComponent\(cursor\)/);
  });

  it("as páginas caminhadas NÃO moram sob a chave da rota", () => {
    // Sob "/api/audit-logs" elas seriam invalidadas junto e o react-query
    // tentaria buscá-las por uma URL montada com as partes da chave, que não
    // existe — e a tela de Logs do Sistema passaria a mostrar a trilha inteira.
    const deposito = historico.match(/const CACHE_TRILHA = \[([^\]]+)\]/)?.[1] ?? "";
    expect(deposito).not.toContain("/api/audit-logs");
    expect(deposito.trim()).not.toBe("");
  });

  it("a lista mesclada é deduplicada por id antes de virar timeline", () => {
    // A janela da primeira página anda para frente enquanto o cliente caminha
    // para trás: sem a deduplicação, um registro repetido vira linha repetida.
    // O dedup mudou de forma quando a mescla passou a receber TRÊS fontes
    // (primeira página, páginas caminhadas e resultados de busca além da
    // janela): um Set único de vistos, alimentado na ordem.
    expect(historico).toMatch(/vistos\.has\(l\.id\)/);
    expect(historico).toContain("paginasSeguintes.concat(alemDaJanela)");
  });
});
