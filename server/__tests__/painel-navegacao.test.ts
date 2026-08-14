// "Continuar em ⟨tela⟩", visões salvas e carimbo de frescor — as três regras
// puras que sustentam o "ver → agir" e o "posso confiar nisto?" do Painel.
import { describe, expect, it } from "vitest";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import { visaoDoPapel, visoesParaPapel, visaoEstaAtiva, VISOES_BASE } from "@/lib/painel-visoes";
import { formatFrescor, FRESCOR_ALERTA_MS } from "@/lib/painel-frescor";
import { STATUS_GROUPS } from "@/lib/painel-kpis";

describe("proximaTelaDoStatus", () => {
  it("manda cada status para a fila que REALMENTE o trabalha", () => {
    expect(proximaTelaDoStatus("awaiting_submission", "admin")?.path).toBe("/arte");
    expect(proximaTelaDoStatus("awaiting_approval", "admin")?.path).toBe("/atendimento");
    expect(proximaTelaDoStatus("ready_for_production", "admin")?.path).toBe("/grafica");
    expect(proximaTelaDoStatus("awaiting_linking", "admin")?.path).toBe("/vincular-patrocinadores");
  });

  it("awaiting_final_review vai para Solicitação, não para Atendimento", () => {
    // O palpite óbvio pelo nome estaria errado: quem revisa o arquivo final é o
    // CRIADOR, e solicitacao.tsx filtra exatamente por este status.
    expect(proximaTelaDoStatus("awaiting_final_review", "solicitacao")?.path).toBe("/solicitacao");
  });

  it("não oferece caminho que o RoleProtectedRoute vai recusar", () => {
    // grafica não entra em /arte nem em /atendimento.
    expect(proximaTelaDoStatus("awaiting_submission", "grafica")).toBeNull();
    expect(proximaTelaDoStatus("awaiting_approval", "grafica")).toBeNull();
    // ...mas entra na própria fila.
    expect(proximaTelaDoStatus("inProduction", "grafica")?.path).toBe("/grafica");
  });

  it("status terminal e rascunho não têm fila", () => {
    for (const s of ["delivered", "canceled", "draft"]) {
      expect(proximaTelaDoStatus(s, "admin"), s).toBeNull();
    }
  });

  it("sem status ou sem papel, nada é sugerido", () => {
    expect(proximaTelaDoStatus(null, "admin")).toBeNull();
    expect(proximaTelaDoStatus("awaiting_approval", null)).toBeNull();
  });
});

describe("visões salvas", () => {
  it("cada papel operacional tem fila própria; admin vê o fluxo inteiro", () => {
    for (const r of ["arte", "atendimento", "solicitacao", "grafica"]) {
      expect(visaoDoPapel(r), r).not.toBeNull();
    }
    expect(visaoDoPapel("admin")).toBeNull();
    expect(visoesParaPapel("admin")).toHaveLength(VISOES_BASE.length);
    expect(visoesParaPapel("arte")).toHaveLength(VISOES_BASE.length + 1);
  });

  it("toda visão usa status que existem no mapa do painel", () => {
    const conhecidos = new Set(Object.keys(STATUS_GROUPS));
    for (const v of [...VISOES_BASE, ...["arte", "atendimento", "solicitacao", "grafica"].map(r => visaoDoPapel(r)!)]) {
      for (const s of v.filtros.status) {
        expect(conhecidos.has(s), `visão "${v.label}" usa status desconhecido: ${s}`).toBe(true);
      }
    }
  });

  it("a visão fica marcada mesmo se o usuário montou o recorte pelos dropdowns", () => {
    const prontos = VISOES_BASE.find(v => v.id === "prontos")!;
    // ordem trocada de propósito: comparação por CONJUNTO, não por ordem.
    expect(visaoEstaAtiva(prontos, { status: ["approved", "ready_for_production"], saida: [], foco: [] })).toBe(true);
    expect(visaoEstaAtiva(prontos, { status: ["approved"], saida: [], foco: [] })).toBe(false);
  });

  it("filtro extra em outra dimensão desmarca a visão", () => {
    const atrasados = VISOES_BASE.find(v => v.id === "atrasados")!;
    expect(visaoEstaAtiva(atrasados, { status: [], saida: [], foco: ["atrasadas"] })).toBe(true);
    expect(visaoEstaAtiva(atrasados, { status: [], saida: ["today"], foco: ["atrasadas"] })).toBe(false);
  });
});

describe("formatFrescor", () => {
  const t0 = Date.UTC(2026, 7, 14, 12, 0, 0);

  it("antes da primeira resposta não existe carimbo", () => {
    expect(formatFrescor(0, t0)).toBeNull();
  });

  it("recém-atualizado, minutos e horas", () => {
    expect(formatFrescor(t0 - 10_000, t0)?.texto).toBe("agora mesmo");
    expect(formatFrescor(t0 - 4 * 60_000, t0)?.texto).toBe("há 4 min");
    expect(formatFrescor(t0 - 90 * 60_000, t0)?.texto).toBe("há 1 h");
  });

  it("passa a avisar a partir do limite, e não antes", () => {
    expect(formatFrescor(t0 - (FRESCOR_ALERTA_MS - 1_000), t0)?.tone).toBe("fresco");
    expect(formatFrescor(t0 - FRESCOR_ALERTA_MS, t0)?.tone).toBe("envelhecendo");
  });

  it("relógio do cliente atrasado não produz 'há -2 min'", () => {
    expect(formatFrescor(t0 + 5 * 60_000, t0)?.texto).toBe("agora mesmo");
  });
});
