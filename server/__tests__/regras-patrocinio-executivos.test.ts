// ─────────────────────────────────────────────────────────────────────────────
// EXECUTIVO DE CONTA, RODANDO — o sinal no banco, quem recebe o aviso do book,
// o preview do e-mail e a inferência que PROPÕE e não adivinha.
//
// Veio de executivo-de-conta.test.ts (as partes que liam server/, shared/ e
// scripts/ como texto). O que era "o fonte contém X" virou: a função roda com
// banco de mentira e o que se afirma é o que ela propõe, grava e devolve.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from "vitest";

const H = vi.hoisted(() => ({
  tabelas: new Map<string, any[]>(),
  nome: (t: any): string => t?.[Symbol.for("drizzle:Name")],
  updates: [] as { tabela: string; valores: any; where: unknown }[],
  inserts: [] as { tabela: string; valores: any }[],
  /** O que o UPDATE … RETURNING devolve (vazio = alguém preencheu antes). */
  retorno: ((_where: unknown) => [{ id: "x" }]) as (where: unknown) => any[],
  storage: {} as Record<string, any>,
  escritos: [] as { destino: string; conteudo: string }[],
  montagens: [] as { entrada: any; saida: any }[],
}));

vi.mock("../db", () => {
  const select = () => ({
    from: (tabela: unknown) => {
      const q: any = {
        where: () => q,
        then: (ok: any, falha: any) => Promise.resolve(H.tabelas.get(H.nome(tabela)) ?? []).then(ok, falha),
      };
      return q;
    },
  });
  const update = (tabela: unknown) => ({
    set: (valores: any) => ({
      where: (where: unknown) => ({
        returning: async () => { H.updates.push({ tabela: H.nome(tabela), valores, where }); return H.retorno(where); },
      }),
    }),
  });
  const insert = (tabela: unknown) => ({ values: async (valores: any) => { H.inserts.push({ tabela: H.nome(tabela), valores }); } });
  const db: any = { select, update, insert, execute: async () => ({ rows: [] }), transaction: async (fn: any) => fn({ select, update, insert }) };
  return { db, pool: {} };
});
vi.mock("../storage", () => ({ storage: H.storage }));
vi.mock("../tempo-real", () => ({ publicarMensagem: vi.fn() }));
// O preview escreve um HTML no disco: aqui a escrita é só anotada.
vi.mock("fs", async () => {
  const real = await vi.importActual<any>("fs");
  const writeFileSync = (destino: string, conteudo: string) => { H.escritos.push({ destino, conteudo }); };
  return { ...real, default: { ...real.default, writeFileSync }, writeFileSync };
});
// O construtor do e-mail é o de verdade — só embrulhado para ver com o quê o
// preview o chamou.
vi.mock("../services/bookEmailNotification", async () => {
  const real = await vi.importActual<any>("../services/bookEmailNotification");
  return {
    ...real,
    buildBookEmailMessage: (...a: any[]) => {
      const saida = real.buildBookEmailMessage(...a);
      H.montagens.push({ entrada: a[0], saida });
      return saida;
    },
  };
});

import { getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { sponsors, itemSponsorApprovals, users, auditLogs } from "@shared/schema";
import { analisarInferenciaExecutivos, aplicarInferenciaExecutivos } from "../services/inferirExecutivos";
import { destinatariosDoEvento, USAR_EXECUTIVOS_DO_EVENTO, DESTINATARIOS_NOMEADOS } from "../routes/itens/book";
import { registerInferirExecutivosRoutes } from "../routes/inferir-executivos";

const T = { sponsors: getTableName(sponsors), aprovacoes: getTableName(itemSponsorApprovals), users: getTableName(users), auditLogs: getTableName(auditLogs) };
const dialeto = new PgDialect();

// ── Rodar um script (process.exit interceptado) ──────────────────────────────
class SaidaDoScript extends Error {}
let codigos: number[] = [];
let saida: string[] = [];
let aoSair: () => void = () => {};
beforeAll(() => {
  vi.spyOn(process, "exit").mockImplementation(((c?: number) => {
    codigos.push(c ?? 0);
    aoSair();
    if (codigos.length === 1) throw new SaidaDoScript();
  }) as any);
});
afterAll(() => { vi.restoreAllMocks(); });

function capturarConsole() {
  saida = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => { saida.push(a.join(" ")); });
  vi.spyOn(console, "error").mockImplementation(() => {});
}

async function rodarInferencia(args: string[] = []) {
  vi.resetModules();
  codigos = [];
  capturarConsole();
  const argvAntes = process.argv;
  process.argv = ["node", "/app/scripts/inferir-executivos.ts", ...args];
  const terminou = new Promise<void>((r) => { aoSair = r; });
  try {
    await import("../../scripts/inferir-executivos");
    await terminou;
    await new Promise((r) => setTimeout(r, 0));
  } finally {
    process.argv = argvAntes;
  }
  return { codigo: codigos[0], texto: saida.join("\n") };
}

// ── O cadastro de mentira ────────────────────────────────────────────────────
const aprovou = (sponsorId: string, quem: string, n: number) => Array.from({ length: n }, () => ({ sponsorId, approvedBy: quem, rejectedBy: null }));

function cenario() {
  H.tabelas.set(T.sponsors, [
    { id: "sp-clara", name: "Vale", accountExecutiveId: null, arquivadoEm: null },
    { id: "sp-tem", name: "Aché", accountExecutiveId: "u-bia", arquivadoEm: null },
    { id: "sp-nome", name: "Livelo", accountExecutiveId: null, arquivadoEm: null },
    { id: "sp-homonimo", name: "Crystal", accountExecutiveId: null, arquivadoEm: null },
    { id: "sp-admin", name: "QCY", accountExecutiveId: null, arquivadoEm: null },
    { id: "sp-dividido", name: "Mandala", accountExecutiveId: null, arquivadoEm: null },
    { id: "sp-mudo", name: "Ministério", accountExecutiveId: null, arquivadoEm: null },
    { id: "sp-arq", name: "Antiga", accountExecutiveId: null, arquivadoEm: new Date() },
  ]);
  H.tabelas.set(T.aprovacoes, [
    // grafia diferente (acento, caixa, espaço) do cadastro: tem de casar
    ...aprovou("sp-clara", "jose  antonio", 3), ...aprovou("sp-clara", "Bia", 1),
    ...aprovou("sp-tem", "Bia", 9),
    ...aprovou("sp-nome", "Fulano Sem Cadastro", 4),
    ...aprovou("sp-homonimo", "Ana", 5),
    ...aprovou("sp-admin", "Pedro", 5),
    ...aprovou("sp-dividido", "José Antônio", 2), ...aprovou("sp-dividido", "Bia", 2),
    { sponsorId: "sp-dividido", approvedBy: null, rejectedBy: "   " },
    ...aprovou("sp-arq", "José Antônio", 5),
  ]);
  H.tabelas.set(T.users, [
    { id: "u-jose", name: "José Antônio", email: "jose@nortemkt.com", role: "atendimento" },
    { id: "u-bia", name: "Bia", email: "bia@nortemkt.com", role: "atendimento" },
    { id: "u-ana1", name: "Ana", email: "ana1@nortemkt.com", role: "atendimento" },
    { id: "u-ana2", name: "ana", email: "ana2@nortemkt.com", role: "atendimento" },
    { id: "u-pedro", name: "Pedro", email: "pedro@nortemkt.com", role: "admin" },
  ]);
}

beforeEach(() => {
  H.tabelas = new Map();
  H.updates = [];
  H.inserts = [];
  H.escritos = [];
  H.montagens = [];
  H.retorno = () => [{ id: "x" }];
  for (const k of Object.keys(H.storage)) delete H.storage[k];
});

// ═════════════════════════════════════════════════════════════════════════════
describe("o sinal existe no banco", () => {
  it("o patrocinador tem executivo de conta, e a aprovação guarda quem decidiu", () => {
    const col = (t: any, nome: string) => getTableConfig(t).columns.find((c) => c.name === nome);
    expect(col(sponsors, "account_executive_id")).toBeDefined();
    expect(col(itemSponsorApprovals, "approved_by")?.dataType).toBe("string");
    expect(col(itemSponsorApprovals, "rejected_by")?.dataType).toBe("string");
  });
});

describe("quem recebe o aviso do book: os executivos dos patrocinadores DO evento", () => {
  it("a chave está ligada, e patrocinador sem executivo não coloca ninguém", async () => {
    expect(USAR_EXECUTIVOS_DO_EVENTO).toBe(true);
    H.storage.getEventSponsors = vi.fn(async () => [{ sponsorId: "sp-a" }, { sponsorId: "sp-b" }, { sponsorId: "sp-sem" }, { sponsorId: "sp-c" }]);
    H.storage.getAllSponsors = vi.fn(async () => [
      { id: "sp-a", accountExecutiveId: "u1" }, { id: "sp-b", accountExecutiveId: "u1" },
      { id: "sp-sem", accountExecutiveId: null }, { id: "sp-c", accountExecutiveId: "u2" }, { id: "sp-fora", accountExecutiveId: "u3" },
    ]);
    H.storage.getAllUsers = vi.fn(async () => [
      { id: "u1", email: "jose@nortemkt.com" }, { id: "u2", email: "bia@nortemkt.com" }, { id: "u3", email: "outro@nortemkt.com" },
    ]);
    // sem repetição, e só de quem tem patrocinador NESTE evento
    expect(await destinatariosDoEvento("ev-1")).toEqual(["jose@nortemkt.com", "bia@nortemkt.com"]);
    // três consultas, não uma por patrocinador
    expect(H.storage.getAllSponsors).toHaveBeenCalledTimes(1);
    expect(H.storage.getAllUsers).toHaveBeenCalledTimes(1);
  });
});

describe("o preview do e-mail não pode mentir", () => {
  it("usa o construtor de verdade, e a cópia oculta é a mesma lista do servidor", async () => {
    capturarConsole();
    vi.resetModules();
    await import("../../scripts/preview-email-book");
    expect(H.montagens).toHaveLength(1);
    const { entrada, saida: montado } = H.montagens[0];
    // A lista é copiada no script (importar de routes/itens arrastaria o
    // banco); o preço da cópia é esta comparação.
    expect(entrada.destinatariosDeCopia).toEqual(DESTINATARIOS_NOMEADOS);
    expect(DESTINATARIOS_NOMEADOS.length).toBeGreaterThan(0);
    // o que foi escrito é exatamente o HTML que o construtor devolveu
    expect(H.escritos).toEqual([{ destino: "preview-book.html", conteudo: montado.message.html }]);
  });
});

describe("a inferência propõe, não adivinha", () => {
  it("só é CLARA a proposta inequívoca: nome único, do atendimento, com maioria", async () => {
    cenario();
    const r = await analisarInferenciaExecutivos();
    expect(r.claras.map((p) => [p.sponsorId, p.user.id, p.decisionsByTop, p.totalDecisions])).toEqual([["sp-clara", "u-jose", 3, 4]]);
    const motivo = Object.fromEntries(r.duvidosas.map((d) => [d.sponsorId, d.reason]));
    expect(motivo["sp-nome"]).toBe("o nome não casa com nenhum usuário do cadastro");
    expect(motivo["sp-homonimo"]).toBe("o nome casa com 2 usuários diferentes");
    expect(motivo["sp-admin"]).toBe('quem mais decide é "admin", não atendimento');
    // 50% não é maioria
    expect(motivo["sp-dividido"]).toBe("sem maioria — 2 pessoas decidem por esta conta");
  });

  it("nunca sobrescreve executivo já definido, e patrocinador arquivado fica fora", async () => {
    cenario();
    const r = await analisarInferenciaExecutivos();
    expect(r).toMatchObject({ totalSponsors: 7, alreadyAssigned: 1, withoutExecutive: 6 });
    const todos = [...r.claras, ...r.duvidosas, ...r.semSinal].map((p) => p.sponsorId);
    expect(todos).not.toContain("sp-tem");
    expect(todos).not.toContain("sp-arq");
  });

  it("patrocinador sem sinal nenhum fica SEM executivo, de propósito", async () => {
    cenario();
    const r = await analisarInferenciaExecutivos();
    expect(r.semSinal).toEqual([{ sponsorId: "sp-mudo", sponsorName: "Ministério" }]);
  });

  it("aplicar grava só as claras, com a guarda de 'ainda sem executivo' no WHERE, e deixa a trilha com o número", async () => {
    cenario();
    const r = await aplicarInferenciaExecutivos({ userId: "u-adm", userName: "Yan" });
    expect(r.aplicados).toBe(1);
    expect(H.updates).toHaveLength(1);
    expect(H.updates[0].valores).toEqual({ accountExecutiveId: "u-jose" });
    const { sql, params } = dialeto.sqlToQuery(H.updates[0].where as any);
    expect(sql).toContain('"account_executive_id" is null');
    expect(params).toEqual(["sp-clara"]);
    const log = H.inserts.find((i) => i.tabela === T.auditLogs)!.valores;
    expect(log).toMatchObject({ userId: "u-adm", userName: "Yan", entityType: "sponsor", entityId: "sp-clara" });
    expect(log.details).toContain('Executivo de conta inferido: "José Antônio" respondeu por 3 de 4 decisões (75%)');
    expect(log.details).toContain("corrija no cadastro se estiver errado");
  });

  it("se alguém preencheu o executivo no meio tempo, o UPDATE não pega e nada vai para a trilha", async () => {
    cenario();
    H.retorno = () => [];
    const r = await aplicarInferenciaExecutivos({ userName: "Yan" });
    expect(r.aplicados).toBe(0);
    expect(H.inserts).toHaveLength(0);
  });

  it("o script é dry-run por padrão; com --aplicar grava como 'Script de inferência'", async () => {
    cenario();
    const ensaio = await rodarInferencia();
    expect(ensaio.codigo).toBe(0);
    expect(ensaio.texto).toContain("Dry-run: nada gravado.");
    expect(ensaio.texto).toContain("ninguém do atendimento é avisado por causa deles");
    expect(H.updates).toHaveLength(0);

    const aplicado = await rodarInferencia(["--aplicar"]);
    expect(aplicado.codigo).toBe(0);
    expect(H.updates).toHaveLength(1);
    expect(H.inserts[0].valores.userName).toBe("Script de inferência");
  });
});

describe("a aplicação pela produção é explícita e protegida", () => {
  type Handler = (req: any, res: any, next: any) => any;
  const rotas = new Map<string, Handler[]>();
  const appFalso: any = {};
  for (const verbo of ["get", "post"]) {
    appFalso[verbo] = (caminho: string, ...hs: Handler[]) => { rotas.set(`${verbo.toUpperCase()} ${caminho}`, hs); return appFalso; };
  }
  registerInferirExecutivosRoutes(appFalso);

  async function chamar(chave: string, userRole: string, body: any = {}) {
    const req: any = { body, userRole, userId: "u1", userName: "Yan", session: { userId: "u1", userRole } };
    const res: any = { _status: 200, _body: undefined, _pronto: false };
    res.status = (c: number) => { res._status = c; return res; };
    res.json = (b: any) => { res._body = b; res._pronto = true; return res; };
    for (const h of rotas.get(chave)!) {
      let seguiu = false;
      await h(req, res, () => { seguiu = true; });
      if (res._pronto || !seguiu) break;
    }
    return { status: res._status, body: res._body };
  }

  it("prévia e aplicação exigem administrador", async () => {
    cenario();
    for (const papel of ["atendimento", "arte", "solicitacao"]) {
      expect((await chamar("GET /api/admin/inferir-executivos", papel)).status, papel).toBe(403);
      expect((await chamar("POST /api/admin/inferir-executivos", papel, { confirm: true })).status, papel).toBe(403);
    }
    expect((await chamar("GET /api/admin/inferir-executivos", "admin")).status).toBe(200);
    expect(H.updates).toHaveLength(0);
  });

  it("o POST exige confirmação explícita (true, não 'true')", async () => {
    cenario();
    for (const body of [{}, { confirm: "true" }, { confirm: 1 }]) {
      expect((await chamar("POST /api/admin/inferir-executivos", "admin", body)).status).toBe(400);
    }
    expect(H.updates).toHaveLength(0);
    const r = await chamar("POST /api/admin/inferir-executivos", "admin", { confirm: true });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ totalPropostasClaras: 1, aplicados: 1, duvidosas: 4, semSinal: 1 });
  });
});
