// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE AUTOMÁTICA pela saída do caminhão (pedido do dono, 25/08).
//
// A decisão de convivência, confirmada pelo dono: "automática + ajuste
// manual" — a regra manda em todo evento sem trava; definir à mão trava
// (priority_manual) até alguém limpar, e aí a automática volta NA HORA.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { prioridadePelaSaida, LIMITES_DA_PRIORIDADE } from "../../shared/prioridade-do-evento";

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
  const SCHEMA = ler("shared/schema.ts");
  const SERVICO = ler("server/services/prioridadeAutomatica.ts");
  const EVENTS = ler("server/routes/events.ts");
  const ROUTES = ler("server/routes.ts");
  const TELA = ler("client/src/pages/eventos.tsx");

  it("a trava manual existe na coluna e o job a respeita", () => {
    expect(SCHEMA).toContain('priorityManual: boolean("priority_manual").notNull().default(false)');
    expect(SERVICO).toContain("if ((ev as any).priorityManual) continue;");
    // evento finalizado fica SEM prioridade — saiu das filas
    expect(SERVICO).toContain("motivoEventoFinalizado(ev as any, hojeBiz) !== null");
  });

  it("o job roda no boot e de hora em hora, e falha não derruba o processo", () => {
    expect(SERVICO).toContain("void tick();");
    expect(SERVICO).toContain("setInterval(tick, 60 * 60 * 1000);");
    expect(ROUTES).toContain("startPrioridadeAutomatica();");
  });

  it("definir à mão TRAVA; limpar destrava e aplica a automática NA HORA", () => {
    expect(EVENTS).toContain("priorityManual: !clearing,");
    expect(EVENTS).toContain("priority: (clearing ? automatica : priority) as any,");
    // e a trilha registra a decisão humana (travar/destravar) — o tick não loga
    expect(EVENTS).toContain('voltou à automática');
    expect(EVENTS).toContain("travada; a regra automática não mexe até limpar");
    expect(SERVICO).not.toContain("createAuditLog");
  });

  it("evento novo já nasce com prioridade; mudar a saída reprioriza na hora", () => {
    expect(EVENTS).toContain("prioridadeEscolhida ?? prioridadePelaSaida(truckAt.getTime(), Date.now())");
    expect(EVENTS).toContain("priorityManual: !!prioridadeEscolhida,");
    expect(EVENTS).toContain("if (patchData.truckDepartureDate) void aplicarPrioridadeAutomatica();");
  });

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
