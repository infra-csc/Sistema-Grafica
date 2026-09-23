// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DA MÁQUINA DE ESTADOS, POR DENTRO — coerência que não depende de
// rota nenhuma (a conferência rota a rota está em
// maquina-de-estados-conformidade.test.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  TRANSICOES, origemAceita, podeTransicionar, proximoStatus, vemDeOrigemValida, origemDaAcao,
  FICA_ONDE_ESTA, VOLTA_PARA_ONDE_ESTAVA,
} from "@shared/maquina-de-estados";
import { STATUS_CONHECIDOS } from "@shared/fluxo-peca";
import { ITEM_STATUSES } from "@shared/schema";
import { REGUA_DE_PAPEIS } from "@shared/permissoes";

const UNIVERSO = Array.from(new Set<string>([...STATUS_CONHECIDOS, ...ITEM_STATUSES, "status_inexistente"]));

describe("cada ação tem um destino só", () => {
  it("as linhas da mesma ação não disputam o mesmo status de origem", () => {
    const acoes = Array.from(new Set(TRANSICOES.map((t) => t.acao)));
    const conflitos: string[] = [];
    for (const acao of acoes) {
      const linhas = TRANSICOES.filter((t) => t.acao === acao);
      for (const s of UNIVERSO) {
        const destinos = new Set(linhas.filter((t) => origemAceita(t.de, s)).map((t) => t.para));
        if (destinos.size > 1) conflitos.push(`${acao} em ${s}: ${Array.from(destinos).join(" | ")}`);
      }
    }
    expect(conflitos).toEqual([]);
  });

  it("todo destino fixo é um status que o sistema grava", () => {
    for (const t of TRANSICOES) {
      if (t.para === FICA_ONDE_ESTA || t.para === VOLTA_PARA_ONDE_ESTAVA) continue;
      expect((ITEM_STATUSES as readonly string[]).includes(t.para), `${t.acao} → ${t.para}`).toBe(true);
    }
  });

  it("toda linha diz quem pode, por onde e o que mais exige", () => {
    for (const t of TRANSICOES) {
      expect(t.papeis.length, t.acao).toBeGreaterThan(0);
      expect(t.rotas.length, t.acao).toBeGreaterThan(0);
      for (const r of t.rotas) expect(r, t.acao).toMatch(/^(GET|POST|PATCH|PUT|DELETE) \/api\//);
    }
  });
});

describe("os papéis batem com a régua de permissões", () => {
  it("quem a tabela deixa agir está entre os papéis da rota em shared/permissoes.ts", () => {
    const regua = new Map(REGUA_DE_PAPEIS.map((r) => [`${r.metodo} ${r.rota}`, r.papeis as readonly string[]]));
    const divergentes: string[] = [];
    for (const t of TRANSICOES) {
      for (const rota of t.rotas) {
        const daRota = regua.get(rota);
        if (!daRota) continue; // rota sem recorte de papel na régua
        for (const p of t.papeis) if (!daRota.includes(p)) divergentes.push(`${t.acao} (${rota}): ${p}`);
      }
    }
    expect(divergentes).toEqual([]);
  });
});

describe("as leituras", () => {
  it("podeTransicionar olha status E papel; vemDeOrigemValida só o status", () => {
    expect(podeTransicionar("sponsor_approved", "revogar-aprovacao", "atendimento")).toBe(true);
    expect(podeTransicionar("awaiting_final_review", "revogar-aprovacao", "atendimento")).toBe(false);
    expect(podeTransicionar("awaiting_final_review", "revogar-aprovacao", "admin")).toBe(true);
    expect(podeTransicionar("awaiting_submission", "enviar-para-aprovacao", "grafica")).toBe(false);
    expect(vemDeOrigemValida("awaiting_submission", "enviar-para-aprovacao")).toBe(true);
    expect(vemDeOrigemValida("draft", "enviar-para-aprovacao")).toBe(false);
  });

  it("proximoStatus: o destino, o próprio status no 'mesmo', 'anterior' no descancelar, null fora da origem", () => {
    expect(proximoStatus("awaiting_submission", "enviar-para-aprovacao")).toBe("awaiting_sponsor_approval");
    expect(proximoStatus("awaiting_sponsor_approval", "reprovar-por-patrocinador")).toBe("awaiting_sponsor_approval");
    expect(proximoStatus("canceled", "descancelar")).toBe(VOLTA_PARA_ONDE_ESTAVA);
    expect(proximoStatus("delivered", "enviar-para-aprovacao")).toBeNull();
    expect(proximoStatus("em_producao", "informar-impressas-parcial")).toBe("inProduction");
  });

  it("origemDaAcao: a lista, ou null quando a origem é 'qualquer status, menos…'", () => {
    expect(origemDaAcao("devolver-para-a-revisao")).toEqual(["ready_for_production", "pronto_para_producao", "approved", "liberado"]);
    expect(origemDaAcao("revogar-aprovacao")).toBeNull();
    expect(origemDaAcao("cancelar")).toBeNull();
  });
});
