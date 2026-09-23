// ─────────────────────────────────────────────────────────────────────────────
// DEFEITO (integração, 23/09): os comentários de server/routes.ts sobre os
// avisos por e-mail (digests) descreviam um comportamento que não existe
// mais — "sem REVISAO_DIGEST_ENABLED=true não faz nada", "8h", "desligado até
// GESTAO_DIGEST_ENABLED". Hoje os dois só sobem em produção, às 10h/15h/18h,
// ligados por padrão (desliga com =false). Este arquivo roda o comportamento
// que o comentário descreve e confere que o texto diz o mesmo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("../db", () => ({ db: {}, pool: {} }));
vi.mock("../storage", () => ({ storage: {} }));

const { startRevisaoDigest, HORARIOS } = await import("../services/revisaoDigest");
const { startGestaoDigest, HORARIOS_DA_GESTAO } = await import("../services/gestaoDigest");

const ROTAS = readFileSync(path.resolve(__dirname, "../routes.ts"), "utf8");
/** O trecho dos trabalhos de fundo que fala dos dois avisos. */
const TRECHO = ROTAS.slice(ROTAS.indexOf("startDeadlineAlerts();"), ROTAS.indexOf("startGestaoDigest();"));

const ambiente = { ...process.env };
afterEach(() => { process.env = { ...ambiente }; vi.restoreAllMocks(); });

function relogiosQueSobem(iniciar: () => void, env: Record<string, string | undefined>): number {
  process.env = { ...ambiente, NODE_ENV: "test", REPLIT_DEPLOYMENT: undefined, REVISAO_DIGEST_ENABLED: undefined, GESTAO_DIGEST_ENABLED: undefined, ...env };
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  const relogio = vi.spyOn(globalThis, "setInterval").mockImplementation((() => 0) as any);
  iniciar();
  return relogio.mock.calls.length;
}

describe("o que o comentário dos digests afirma, rodando", () => {
  it("fora de produção nenhum dos dois relógios sobe", () => {
    expect(relogiosQueSobem(startRevisaoDigest, {})).toBe(0);
    expect(relogiosQueSobem(startGestaoDigest, {})).toBe(0);
  });

  it("em produção os dois sobem SEM precisar de variável *_ENABLED (ligados por padrão)", () => {
    expect(relogiosQueSobem(startRevisaoDigest, { NODE_ENV: "production" })).toBe(1);
    expect(relogiosQueSobem(startGestaoDigest, { NODE_ENV: "production" })).toBe(1);
  });

  it("os dois disparam às 10h, 15h e 18h", () => {
    expect(HORARIOS).toEqual([10, 15, 18]);
    expect(HORARIOS_DA_GESTAO).toEqual([10, 15, 18]);
  });
});

describe("server/routes.ts diz o mesmo", () => {
  it("o texto não repete o comportamento antigo", () => {
    expect(TRECHO).not.toContain("REVISAO_DIGEST_ENABLED=true");
    expect(TRECHO).not.toMatch(/\b8h\b/);
    expect(TRECHO).not.toContain("Desligado até");
    expect(TRECHO).not.toContain("as três do acompanhamento");
  });

  it("o texto traz os horários, a trava de produção e o desligamento por =false", () => {
    for (const h of HORARIOS_DA_GESTAO) expect(TRECHO).toContain(`${h}h`);
    expect(TRECHO).toMatch(/produ[cç][aã]o/i);
    expect(TRECHO).toContain("REVISAO_DIGEST_ENABLED=false");
    expect(TRECHO).toContain("GESTAO_DIGEST_ENABLED=false");
  });
});
