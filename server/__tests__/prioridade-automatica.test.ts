// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE AUTOMÁTICA pela saída do caminhão (pedido do dono, 25/08).
//
// A decisão de convivência, confirmada pelo dono: "automática + ajuste
// manual" — a regra manda em todo evento sem trava; definir à mão trava
// (priority_manual) até alguém limpar, e aí a automática volta NA HORA.
//
// O job, a trava e as rotas de evento rodam de verdade em
// regras-fluxo-prioridade.test.ts; aqui ficam a régua pura e a tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { prioridadePelaSaida, LIMITES_DA_PRIORIDADE } from "../../shared/prioridade-do-evento";
import { fonteDaTela } from "./fonte-da-tela";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../..", rel), "utf8");
const DIA = 86_400_000;
const HOJE = Date.UTC(2026, 7, 25, 12, 0, 0);

describe("a régua (função pura)", () => {
  it("≤3 dias urgente · ≤7 alta · ≤15 média · >15 baixa", () => {
    expect(prioridadePelaSaida(HOJE + 1 * DIA, HOJE)).toBe("urgente");
    expect(prioridadePelaSaida(HOJE + 3 * DIA, HOJE)).toBe("urgente");
    expect(prioridadePelaSaida(HOJE + 4 * DIA, HOJE)).toBe("alta");
    expect(prioridadePelaSaida(HOJE + 7 * DIA, HOJE)).toBe("alta");
    expect(prioridadePelaSaida(HOJE + 8 * DIA, HOJE)).toBe("media");
    expect(prioridadePelaSaida(HOJE + 15 * DIA, HOJE)).toBe("media");
    expect(prioridadePelaSaida(HOJE + 16 * DIA, HOJE)).toBe("baixa");
    expect(prioridadePelaSaida(HOJE + 90 * DIA, HOJE)).toBe("baixa");
  });

  it("o dia da saída ainda é urgente; caminhão que JÁ saiu fica sem prioridade", () => {
    expect(prioridadePelaSaida(HOJE, HOJE)).toBe("urgente");
    expect(prioridadePelaSaida(HOJE + 2 * 60 * 60 * 1000, HOJE)).toBe("urgente");
    // um 'urgente' eterno em evento passado dessensibiliza o vermelho
    expect(prioridadePelaSaida(HOJE - 2 * DIA, HOJE)).toBeNull();
  });

  it("regra do não sei: sem data não inventa prioridade", () => {
    expect(prioridadePelaSaida(null, HOJE)).toBeNull();
    expect(prioridadePelaSaida(NaN, HOJE)).toBeNull();
  });

  it("os limites são declarados uma vez", () => {
    expect(LIMITES_DA_PRIORIDADE).toEqual({ urgente: 3, alta: 7, media: 15 });
  });
});

describe("a amarração", () => {
  const TELA = fonteDaTela("eventos");

  it("a tela diz a regra: 1–4 travam, 0 volta à automática", () => {
    expect(TELA).toContain("Voltar à automática (0)");
    expect(TELA).toContain("Teclas 1–4 travam · 0 volta à automática");
    expect(TELA).toContain("automática pela saída do caminhão");
  });

  it("no criar/editar evento o desflag existe: a opção vazia é 'Automática'", () => {
    // O salvar já mandava priority: "" quando mudou — que no servidor destrava
    // e aplica a automática na hora. O rótulo dizia 'Sem', que virou mentira.
    expect(TELA).toContain("{ value: '', label: 'Automática'");
    expect(TELA).toContain("data-testid={`form-priority-${opt.value || 'none'}`}");
    expect(TELA).toContain("Trava este nível — a regra automática deixa de mexer");
  });
});
