// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM SÓ DE QUEM ESTÁ AGUARDANDO (dono, 21/09).
//
// As rotas PATCH /api/inventory/:id/triage e POST .../triage-split aceitavam
// qualquer ativo: uma peça EM USO podia ser "triada" de volta ao galpão e duas
// pessoas triando a mesma pilha gravavam uma por cima da outra. Agora a
// conferência vai NO WHERE do UPDATE — o banco de mentira daqui só atualiza a
// linha se TODOS os valores do WHERE baterem, que é o que o Postgres faz.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from "vitest";

const H = vi.hoisted(() => ({ storage: {} as Record<string, any>, db: {} as Record<string, any>, auditoria: [] as any[] }));
vi.mock("../db", () => ({ db: H.db, pool: {} }));
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../routes/shared", () => ({
  requireAuth: (_q: any, _s: any, n: any) => n(),
  requireRole: () => (_q: any, _s: any, n: any) => n(),
  broadcast: () => {},
  createAuditLog: async (...a: any[]) => { H.auditoria.push(a); },
}));

import { registerInventoryRoutes } from "../routes/inventory";
import { inventoryAssets } from "@shared/schema";
import { ehRecusaDeJaTriada, recusaDeTriagem } from "@shared/estoque";

// ── "Express" que só coleciona handlers ──────────────────────────────────────
const rotas = new Map<string, any[]>();
const app: any = {};
for (const v of ["get", "post", "patch", "put", "delete"]) app[v] = (c: string, ...hs: any[]) => { rotas.set(`${v.toUpperCase()} ${c}`, hs); return app; };
registerInventoryRoutes(app);

async function chamar(chave: string, params: any, body: any) {
  const res: any = { _status: 200, _body: undefined };
  res.status = (c: number) => { res._status = c; return res; };
  res.json = (b: any) => { res._body = b; res._done = true; return res; };
  for (const h of rotas.get(chave)!) {
    let seguiu = false;
    await h({ params, body, userName: "Ana" }, res, () => { seguiu = true; });
    if (res._done || !seguiu) break;
  }
  return { status: res._status as number, body: res._body };
}

// ── Banco de mentira ─────────────────────────────────────────────────────────
/** Todos os valores literais de uma condição do drizzle (eq/and aninhados). */
function valoresDoWhere(cond: any, vistos = new Set<any>()): unknown[] {
  if (!cond || typeof cond !== "object" || vistos.has(cond)) return [];
  vistos.add(cond);
  if (cond.constructor?.name === "Param") return [cond.value];
  // Colunas e tabelas apontam de volta para o schema inteiro: não descer.
  if (cond.constructor?.name?.startsWith("Pg") || "table" in cond) return [];
  const filhos = Array.isArray(cond) ? cond : Array.isArray(cond.queryChunks) ? cond.queryChunks : [];
  return filhos.flatMap((f: any) => valoresDoWhere(f, vistos));
}

let linhas: Record<string, any>;
let inseridos: any[];

function bancoFalso(alvo: Record<string, any>) {
  alvo.update = (tabela: any) => ({
    set: (dados: any) => ({
      where: (cond: any) => {
        const aplicar = async () => {
          // Uma volta do laço de eventos antes de tocar na linha: é o que deixa
          // duas requisições "simultâneas" de verdade se cruzarem.
          await new Promise((r) => setTimeout(r, 1));
          if (tabela !== inventoryAssets) return [];
          const [id, ...resto] = valoresDoWhere(cond) as string[];
          const linha = linhas[id];
          if (!linha) return [];
          if (resto.length > 0 && !resto.includes(linha.trackingStatus)) return [];
          Object.assign(linha, dados);
          return [{ ...linha }];
        };
        const promessa: any = { returning: () => aplicar(), then: (ok: any, erro: any) => aplicar().then(ok, erro) };
        return promessa;
      },
    }),
  });
  alvo.insert = () => ({ values: (v: any) => { inseridos.push(v); const r: any = Promise.resolve([{ id: `novo-${inseridos.length}`, ...v }]); r.returning = () => Promise.resolve([{ id: `novo-${inseridos.length}`, ...v }]); return r; } });
  // SELECT encadeável (from/join/where/for): nenhuma reserva, nenhum lote
  // anterior. A trava FOR UPDATE da reserva (22/09) passa por aqui também.
  alvo.select = () => {
    const c: any = { from: () => c, innerJoin: () => c, leftJoin: () => c, where: () => c, for: () => c, orderBy: () => c,
      then: (ok: any, erro: any) => Promise.resolve([]).then(ok, erro) };
    return c;
  };
  // A recusa acontece no PRIMEIRO comando da transação (o UPDATE que trava a
  // linha), antes de qualquer escrita — por isso o "rollback" daqui não precisa
  // desfazer nada; os testes conferem que nada foi escrito.
  alvo.transaction = async (fn: any) => fn(alvo);
}

beforeEach(() => {
  linhas = {
    a1: { id: "a1", displayId: "#EST-0396-1", name: "2x1 Nubank", quantity: 1, condition: "PERFEITO", trackingStatus: "AGUARDANDO_TRIAGEM", location: null, notes: null },
    a24: { id: "a24", displayId: "#EST-M-7", name: "Grade", quantity: 24, condition: "PERFEITO", trackingStatus: "AGUARDANDO_TRIAGEM", location: null, notes: null, franchiseTags: [], sponsorIds: [] },
    emUso: { id: "emUso", displayId: "#EST-0100-1", name: "Pórtico", quantity: 1, condition: "PERFEITO", trackingStatus: "EM_USO", location: "Setor A", notes: null },
  };
  inseridos = [];
  H.auditoria.length = 0;
  bancoFalso(H.db);
  H.storage.getInventoryAsset = async (id: string) => (linhas[id] ? { ...linhas[id] } : undefined);
});

describe("PATCH /api/inventory/:id/triage", () => {
  it("aguardando → 200, grava destino, condição, local e auditoria", async () => {
    const r = await chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { condition: "PERFEITO", trackingStatus: "NO_GALPAO", location: " Setor B " });
    expect(r.status).toBe(200);
    expect(linhas.a1).toMatchObject({ trackingStatus: "NO_GALPAO", location: "Setor B", condition: "PERFEITO" });
    expect(H.auditoria.length).toBe(1);
  });

  it("peça que NÃO está aguardando → 409 com frase humana, e nada muda", async () => {
    const r = await chamar("PATCH /api/inventory/:id/triage", { id: "emUso" }, { condition: "SUCATA", trackingStatus: "DESCARTADO" });
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Essa peça já foi triada (está: Em uso) — atualize a lista");
    expect(ehRecusaDeJaTriada(r.body.error)).toBe(true);
    expect(linhas.emUso.trackingStatus).toBe("EM_USO");
    expect(H.auditoria.length).toBe(0);
  });

  it("corrida: duas pessoas triando a mesma peça ao mesmo tempo — só uma passa", async () => {
    const [x, y] = await Promise.all([
      chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { condition: "PERFEITO", trackingStatus: "NO_GALPAO", location: "Setor A" }),
      chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { condition: "SUCATA", trackingStatus: "DESCARTADO" }),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    // Ficou o que a PRIMEIRA gravou; a segunda não passou por cima.
    expect(linhas.a1.trackingStatus).toBe("NO_GALPAO");
    expect([x, y].find((r) => r.status === 409)!.body.error).toBe(recusaDeTriagem("NO_GALPAO"));
    expect(H.auditoria.length).toBe(1);
  });

  it("galpão sem local passa (dono, 21/09: o sistema não guarda onde fica); ativo inexistente → 404", async () => {
    expect((await chamar("PATCH /api/inventory/:id/triage", { id: "a1" }, { trackingStatus: "NO_GALPAO" })).status).toBe(200);
    expect(linhas.a1.location).toBeNull();
    expect((await chamar("PATCH /api/inventory/:id/triage", { id: "nao-existe" }, { trackingStatus: "DESCARTADO" })).status).toBe(404);
  });
});

describe("POST /api/inventory/:id/triage-split", () => {
  const corpo = { location: "Setor C", splits: [
    { qty: 20, condition: "PERFEITO", trackingStatus: "NO_GALPAO" },
    { qty: 3, condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO" },
    { qty: 1, condition: "SUCATA", trackingStatus: "DESCARTADO" },
  ] };

  it("aguardando → divide: o original fica com o 1º lote e nascem os outros dois", async () => {
    const r = await chamar("POST /api/inventory/:id/triage-split", { id: "a24" }, corpo);
    expect(r.status).toBe(200);
    expect(linhas.a24).toMatchObject({ quantity: 20, trackingStatus: "NO_GALPAO", location: "Setor C" });
    const clones = inseridos.filter((v) => v.displayId);
    expect(clones.map((c) => [c.displayId, c.quantity, c.trackingStatus])).toEqual([["#EST-M-7-L2", 3, "EM_MANUTENCAO"], ["#EST-M-7-L3", 1, "DESCARTADO"]]);
  });

  it("já triada → 409 e a transação INTEIRA volta (nenhum clone, nenhuma auditoria)", async () => {
    linhas.a24.trackingStatus = "NO_GALPAO";
    const r = await chamar("POST /api/inventory/:id/triage-split", { id: "a24" }, corpo);
    expect(r.status).toBe(409);
    expect(r.body.error).toBe("Essa peça já foi triada (está: No galpão) — atualize a lista");
    expect(linhas.a24.quantity).toBe(24);
    expect(inseridos.length).toBe(0);
  });

  it("corrida: duas divisões simultâneas — uma divide, a outra recebe 409 e não duplica unidades", async () => {
    const [x, y] = await Promise.all([
      chamar("POST /api/inventory/:id/triage-split", { id: "a24" }, corpo),
      chamar("POST /api/inventory/:id/triage-split", { id: "a24" }, corpo),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
  });
});
