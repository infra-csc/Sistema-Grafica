// ─────────────────────────────────────────────────────────────────────────────
// OPERADORES NO LOGIN COMPARTILHADO — as regras puras e o middleware (21/10).
//
// O que se prende aqui, sem banco:
//   · o PIN: só números, 4 a 6, nada de 0000 nem 1234;
//   · o turno: vence em 2 h sem ação gravada ou 12 h depois de assumir;
//   · o middleware: login COM operadores e SEM operador → escrita 428, leitura
//     segue, login/operador livres; com operador → req.userName vira
//     "Produção Grafica (Gilmar)"; login SEM operadores (Kit, Arte, admin…)
//     não muda nada; banco sem a tabela não para o app.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";
import {
  OCIOSO_MS, TURNO_MAX_MS, nomeComOperador, problemaNoPin, situacaoDoTurno, problemaNoNomeDoOperador, CODIGO_OPERADOR_NECESSARIO,
} from "@shared/operadores";
import { criarCacheDeOperadores, identidadeDoOperador, fraseDaSaida, rotaLivreDeOperador, type SaidaAutomatica } from "../operadores";

describe("PIN do operador", () => {
  it("aceita 4 a 6 números que não se adivinham", () => {
    for (const pin of ["2580", "73915", "192837", "1357", "0592"]) expect(problemaNoPin(pin), pin).toBeNull();
  });
  it("recusa curto, longo, com letra ou vazio", () => {
    for (const pin of ["", "123", "1234567", "12a4", " 2580", 2580 as unknown as string, undefined as unknown as string]) {
      expect(problemaNoPin(pin), String(pin)).not.toBeNull();
    }
  });
  it("recusa todos iguais e sequência (a primeira tentativa de quem chuta)", () => {
    for (const pin of ["0000", "1111", "999999", "1234", "4321", "012345", "987654", "3456"]) {
      expect(problemaNoPin(pin), pin).toMatch(/adivinhar/);
    }
  });
});

describe("nome do operador", () => {
  it("o nome na trilha é 'Login (Operador)'", () => {
    expect(nomeComOperador("Produção Grafica", "Gilmar")).toBe("Produção Grafica (Gilmar)");
  });
  it("sem parênteses (a trilha usa) e com tamanho", () => {
    expect(problemaNoNomeDoOperador("Gilmar")).toBeNull();
    expect(problemaNoNomeDoOperador("  ")).not.toBeNull();
    expect(problemaNoNomeDoOperador("Gil (manhã)")).toMatch(/parênteses/);
    expect(problemaNoNomeDoOperador("x".repeat(41))).toMatch(/40/);
  });
});

describe("o turno vence — a rede de segurança da inatividade", () => {
  const t0 = Date.UTC(2026, 9, 21, 11, 0);
  it("vale enquanto houver ação nas últimas 2 h e o turno tiver menos de 12 h", () => {
    const s = situacaoDoTurno({ entrouEm: t0, ultimaAcaoEm: t0 + 60_000 }, t0 + 90 * 60_000);
    expect(s).toEqual({ valido: true, expiraEm: t0 + 60_000 + OCIOSO_MS });
  });
  it("2 h sem ação: vence por inatividade", () => {
    expect(situacaoDoTurno({ entrouEm: t0, ultimaAcaoEm: t0 }, t0 + OCIOSO_MS)).toEqual({ valido: false, motivo: "ocioso" });
  });
  it("12 h depois de assumir vence, mesmo com ação há 1 minuto", () => {
    expect(situacaoDoTurno({ entrouEm: t0, ultimaAcaoEm: t0 + TURNO_MAX_MS - 60_000 }, t0 + TURNO_MAX_MS)).toEqual({ valido: false, motivo: "turno" });
  });
  it("sessão sem carimbo de entrada não vale (pedir o PIN de novo é o lado seguro)", () => {
    expect(situacaoDoTurno({}, t0).valido).toBe(false);
  });
  it("a frase da saída diz a hora de Brasília", () => {
    expect(fraseDaSaida("Gilmar", Date.UTC(2026, 9, 21, 15, 0), "almoco")).toBe("Gilmar saiu às 12:00 (almoço)");
    expect(fraseDaSaida("Gilmar", Date.UTC(2026, 9, 21, 16, 2), "troca", { quemAssumiu: "Elias" })).toBe("Gilmar saiu às 13:02 — Elias assumiu a máquina");
    expect(fraseDaSaida("Gilmar", 0, "ocioso", { ultimaAcaoEm: Date.UTC(2026, 9, 21, 13, 15) })).toBe("Gilmar saiu por inatividade — sem nenhuma ação desde as 10:15");
  });
});

// ── O middleware, com sessão e cache de mentira ────────────────────────────
type Sessao = Record<string, unknown>;
function pedido(metodo: string, caminho: string, sessao: Sessao | undefined, userName = "Produção Grafica") {
  return { method: metodo, path: caminho, session: sessao, userName } as unknown as Request;
}
function resposta() {
  const r = { statusCode: 200, corpo: undefined as unknown, status(c: number) { r.statusCode = c; return r; }, json(b: unknown) { r.corpo = b; return r; } };
  return r;
}
async function rodar(mw: ReturnType<typeof identidadeDoOperador>, req: Request) {
  const res = resposta();
  let passou = false;
  await mw(req, res as unknown as Response, (() => { passou = true; }) as NextFunction);
  return { passou, res, req };
}

const OPS = [{ id: "op-gil", nome: "Gilmar" }, { id: "op-eli", nome: "Elias" }];
const cacheCom = (porUsuario: Record<string, typeof OPS>) => ({ ativos: async (u: string) => porUsuario[u] ?? [] });

describe("identidadeDoOperador — a guarda de toda requisição", () => {
  const T = Date.UTC(2026, 9, 21, 14, 0);
  const mw = (extra: Partial<Parameters<typeof identidadeDoOperador>[0]> = {}) =>
    identidadeDoOperador({ cache: cacheCom({ "u-prod": OPS }), agora: () => T, ...extra });

  it("login com operadores e SEM operador: escrita leva 428 com o código que a tela reconhece", async () => {
    const { passou, res } = await rodar(mw(), pedido("PATCH", "/api/items/p1/start-printing", { userId: "u-prod", userName: "Produção Grafica" }));
    expect(passou).toBe(false);
    expect(res.statusCode).toBe(428);
    expect(res.corpo).toMatchObject({ codigo: CODIGO_OPERADOR_NECESSARIO, error: expect.stringMatching(/Escolha quem está operando/) });
  });

  it("…mas leitura segue, e as rotas de login e de operador também", async () => {
    for (const [m, c] of [["GET", "/api/items/approved"], ["POST", "/api/operadores/entrar"], ["POST", "/api/operadores/definir-pin"], ["POST", "/api/auth/logout"], ["POST", "/api/auth/change-password"]]) {
      const { passou } = await rodar(mw(), pedido(m, c, { userId: "u-prod", userName: "Produção Grafica" }));
      expect(passou, `${m} ${c}`).toBe(true);
    }
    expect(rotaLivreDeOperador("/api/operadores-falsos")).toBe(false);
  });

  it("com operador escolhido: o nome efetivo é 'Produção Grafica (Gilmar)' e a escrita carimba a última ação", async () => {
    const sessao: Sessao = { userId: "u-prod", userName: "Produção Grafica", operadorId: "op-gil", operadorNome: "Gilmar", operadorEntrouEm: T - 3600_000, operadorUltimaAcaoEm: T - 600_000 };
    const { passou, req } = await rodar(mw(), pedido("POST", "/api/tubos/t1/entregar", sessao));
    expect(passou).toBe(true);
    expect(req.userName).toBe("Produção Grafica (Gilmar)");
    expect(req.operadorId).toBe("op-gil");
    expect(sessao.operadorUltimaAcaoEm).toBe(T);
  });

  it("ler a tela não conta como ação (só escrita adia a inatividade)", async () => {
    const sessao: Sessao = { userId: "u-prod", userName: "Produção Grafica", operadorId: "op-gil", operadorNome: "Gilmar", operadorEntrouEm: T - 3600_000, operadorUltimaAcaoEm: T - 600_000 };
    await rodar(mw(), pedido("GET", "/api/items/approved", sessao));
    expect(sessao.operadorUltimaAcaoEm).toBe(T - 600_000);
  });

  it("renomeado pelo admin: a sessão acompanha o nome atual", async () => {
    const sessao: Sessao = { userId: "u-prod", userName: "Produção Grafica", operadorId: "op-eli", operadorNome: "Eliass", operadorEntrouEm: T - 60_000, operadorUltimaAcaoEm: T - 60_000 };
    const { req } = await rodar(mw(), pedido("GET", "/api/items", sessao));
    expect(req.userName).toBe("Produção Grafica (Elias)");
    expect(sessao.operadorNome).toBe("Elias");
  });

  it("2 h parado: o operador sai sozinho, a saída vai para a trilha e a escrita pede o PIN de novo", async () => {
    const saidas: SaidaAutomatica[] = [];
    const sessao: Sessao = { userId: "u-prod", userName: "Produção Grafica", operadorId: "op-gil", operadorNome: "Gilmar", operadorEntrouEm: T - 3 * 3600_000, operadorUltimaAcaoEm: T - OCIOSO_MS - 1 };
    const { passou, res, req } = await rodar(mw({ registrarSaida: async (s) => { saidas.push(s); } }), pedido("POST", "/api/items/p1/start-production", sessao));
    expect(passou).toBe(false);
    expect(res.statusCode).toBe(428);
    expect(req.userName).toBe("Produção Grafica");
    expect(sessao.operadorId).toBeUndefined();
    expect(saidas).toEqual([expect.objectContaining({ operadorId: "op-gil", nome: "Gilmar", motivo: "ocioso", nomeDoLogin: "Produção Grafica" })]);
  });

  it("operador desativado enquanto estava na máquina: sai na próxima requisição", async () => {
    const saidas: SaidaAutomatica[] = [];
    const sessao: Sessao = { userId: "u-prod", userName: "Produção Grafica", operadorId: "op-har", operadorNome: "Harisson", operadorEntrouEm: T - 60_000, operadorUltimaAcaoEm: T - 60_000 };
    await rodar(mw({ registrarSaida: async (s) => { saidas.push(s); } }), pedido("GET", "/api/items", sessao));
    expect(sessao.operadorId).toBeUndefined();
    expect(saidas[0]).toMatchObject({ motivo: "desativado", nome: "Harisson" });
  });

  it("login SEM operadores (Kit, Arte, admin, Gráfica comum) não muda nada — nem nome, nem escrita", async () => {
    for (const papel of ["solicitacao", "arte", "admin", "grafica", "atendimento"]) {
      const { passou, req } = await rodar(mw(), pedido("PATCH", "/api/items/p1", { userId: `u-${papel}`, userName: "Ana", userRole: papel, userKit: papel === "solicitacao" }, "Ana"));
      expect(passou, papel).toBe(true);
      expect(req.userName).toBe("Ana");
      expect(req.loginComOperadores).toBeUndefined();
    }
  });

  it("sem sessão: passa direto (quem barra é o requireAuth)", async () => {
    const { passou } = await rodar(mw(), pedido("POST", "/api/auth/login", undefined, "Sistema"));
    expect(passou).toBe(true);
  });
});

describe("cache de operadores", () => {
  it("guarda por 30 s e esquece quando o admin muda", async () => {
    let agora = 0;
    const consultar = vi.fn(async () => OPS);
    const cache = criarCacheDeOperadores(consultar, () => agora);
    await cache.ativos("u"); await cache.ativos("u");
    expect(consultar).toHaveBeenCalledTimes(1);
    agora = 31_000; await cache.ativos("u");
    expect(consultar).toHaveBeenCalledTimes(2);
    cache.esquecer("u"); await cache.ativos("u");
    expect(consultar).toHaveBeenCalledTimes(3);
  });
  it("tabela ausente (código publicado antes da migração): segue sem exigir operador, não derruba o app", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cache = criarCacheDeOperadores(async () => { throw Object.assign(new Error('relation "operadores" does not exist'), { code: "42P01" }); });
    expect(await cache.ativos("u")).toEqual([]);
    const mw = identidadeDoOperador({ cache });
    const { passou } = await rodar(mw, pedido("POST", "/api/items/p1/start-printing", { userId: "u", userName: "Produção Grafica" }));
    expect(passou).toBe(true);
    aviso.mockRestore();
  });
});
