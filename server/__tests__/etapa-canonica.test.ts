// ─────────────────────────────────────────────────────────────────────────────
// A ETAPA CANÔNICA DA PEÇA — todas as telas contam a MESMA lista de peças do
// mesmo jeito (shared/fluxo-peca → etapaDaPeca).
//
// Painel (cards), barra de fases (Eventos/Detalhe), chip de prazo do Painel,
// Gestão de Prazos (funil do servidor), Análises e o resumo por setor tinham
// cada um a sua tabela status → etapa; a mesma peça "entregue" era Outros no
// Painel, entregue nas Análises e pendente no chip. Aqui uma lista com TODOS
// os status (canônicos, legados, molde produzido e um desconhecido) passa por
// todas as réguas, e os números têm de bater.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, expect, it } from "vitest";
import { ITEM_STATUSES } from "@shared/schema";
import {
  DEPOIS_DA_ARTE, DISPENSAVEIS, EM_REVISAO, ETAPAS_DA_PECA, POS_APROVACAO, POS_CONFERENCIA, PODE_IR_PARA_TUBO,
  STATUS_CONHECIDOS, STATUS_DA_ETAPA, etapaDaPeca, type EtapaDaPeca,
} from "@shared/fluxo-peca";
import { MOLDE_LIBERADO, STATUS_MOLDE_PRODUZIDO, statusParaContagem } from "@shared/molde";
import { PRODUCED_LIKE } from "@shared/prazos-contract";
import { DELIVERED, OUT_OF_FUNNEL, STAGE_DEFS, STATUS_STAGE_RANK } from "../services/prazo-domain";
import { ANALISE_STAGES, isDelivered, isOutOfFunnel } from "@/lib/analises-status";
import { computeStats, statusGroupOf } from "@/lib/painel-kpis";
import { PHASES, contarPorFase } from "@/lib/fases";
import { countPendentes, isPendingItemStatus } from "@/lib/painel-prazo";
import { FINAL_STATUSES, STATUS, getStatusLabel } from "@/lib/status";

/** Uma peça por status conhecido + molde produzido + um valor desconhecido. */
const PECAS: Array<{ id: string; status: string; type: string }> = [
  ...STATUS_CONHECIDOS.map((status, n) => ({ id: `p${n}`, status, type: "Pórtico" })),
  { id: "molde", status: "produced", type: "Molde" },
  { id: "estranha", status: "status_que_ninguem_conhece", type: "Pórtico" },
];

const etapaDe = (p: { status: string; type: string }) => etapaDaPeca(statusParaContagem(p));
const contar = (pred: (e: EtapaDaPeca | null) => boolean) => PECAS.filter((p) => pred(etapaDe(p))).length;
const ETAPAS_DO_FUNIL = new Set(STAGE_DEFS.flatMap((s) => s.pendingStatuses).map((s) => etapaDaPeca(s)));

describe("a régua cobre todo o vocabulário", () => {
  it("todo status de ITEM_STATUSES e das listas de shared/ tem etapa", () => {
    const listas = [
      ...ITEM_STATUSES, ...DEPOIS_DA_ARTE, ...EM_REVISAO, ...POS_APROVACAO, ...DISPENSAVEIS,
      ...PODE_IR_PARA_TUBO, ...POS_CONFERENCIA, ...MOLDE_LIBERADO,
    ];
    expect(listas.filter((s) => etapaDaPeca(s) === null)).toEqual([]);
  });

  it("nenhum status pertence a duas etapas; o primeiro de cada etapa é a própria etapa", () => {
    const vistos = new Set<string>();
    for (const e of ETAPAS_DA_PECA) {
      expect(STATUS_DA_ETAPA[e][0]).toBe(e);
      for (const s of STATUS_DA_ETAPA[e]) { expect(vistos.has(s), s).toBe(false); vistos.add(s); }
    }
  });

  it("as grafias legadas caem na etapa certa", () => {
    expect(etapaDaPeca("entregue")).toBe("delivered");
    expect(etapaDaPeca("conferido")).toBe("conferred");
    expect(etapaDaPeca("liberado")).toBe("approved");
    expect(etapaDaPeca("em_producao")).toBe("inProduction");
    expect(etapaDaPeca("in_production")).toBe("inProduction");
    expect(etapaDaPeca("produzido")).toBe("produced");
    expect(etapaDaPeca("pronto_para_producao")).toBe("ready_for_production");
    expect(etapaDaPeca("awaiting_review")).toBe("awaiting_final_review");
    expect(etapaDaPeca("in_review")).toBe("awaiting_final_review");
    expect(etapaDaPeca("archived")).toBe("canceled");
    expect(etapaDaPeca("solicitado")).toBe("requested");
    expect(etapaDaPeca("inventado")).toBeNull();
    // Molde produzido é o fim do fluxo dele: conta como entregue.
    expect(etapaDe({ status: "produced", type: "Molde" })).toBe("delivered");
  });
});

describe("todas as telas classificam a mesma lista igual", () => {
  it("Painel: cada peça no card da etapa dela; só a desconhecida vai para Outros", () => {
    const stats = computeStats(PECAS);
    for (const e of ETAPAS_DA_PECA) expect(stats.byGroup[e], e).toBe(contar((x) => x === e));
    expect(stats.outros).toBe(1);
    expect(stats.outrosStatus).toEqual(["status_que_ninguem_conhece"]);
    for (const s of STATUS_CONHECIDOS) expect(statusGroupOf(s), s).toBe(etapaDaPeca(s));
  });

  it("barra de fases: cada fase conta exatamente a etapa dela", () => {
    const fases = contarPorFase(PECAS);
    PHASES.forEach((f, i) => expect(fases[i], f.key).toBe(contar((x) => x === f.key)));
  });

  it("Prazos (servidor) e Análises (cliente): mesma etapa do funil, mesma entrega, mesmo fora do funil", () => {
    for (const s of STATUS_CONHECIDOS) {
      const e = etapaDaPeca(s)!;
      const naAnalise = ANALISE_STAGES.findIndex((st) => st.statuses.includes(s));
      expect(naAnalise, s).toBe(STATUS_STAGE_RANK[s] ?? -1);
      expect(STATUS_STAGE_RANK[s] !== undefined, s).toBe(ETAPAS_DO_FUNIL.has(e));
      expect(DELIVERED.has(s), s).toBe(e === "delivered");
      expect(isDelivered(s), s).toBe(e === "delivered");
      expect(OUT_OF_FUNNEL.has(s), s).toBe(e === "canceled");
      expect(isOutOfFunnel(s), s).toBe(e === "canceled");
    }
    // Todo status conhecido é etapa do funil, entrega OU fora — nada some.
    expect(STATUS_CONHECIDOS.filter((s) => STATUS_STAGE_RANK[s] === undefined && !DELIVERED.has(s) && !OUT_OF_FUNNEL.has(s))).toEqual([]);
  });

  it("chip de prazo do Painel: pendente = nem entregue nem fora do funil (entregue/archived não contam)", () => {
    expect(isPendingItemStatus("entregue")).toBe(false);
    expect(isPendingItemStatus("archived")).toBe(false);
    expect(isPendingItemStatus("conferido")).toBe(true);
    expect(countPendentes(PECAS.filter((p) => p.id !== "estranha")))
      .toBe(contar((e) => e !== null && e !== "delivered" && e !== "canceled"));
    expect(new Set(FINAL_STATUSES)).toEqual(new Set([...DELIVERED, ...OUT_OF_FUNNEL]));
  });

  it("resumo por setor (PRODUCED_LIKE): produzida, conferida e embalada — com 'conferido' legado", () => {
    expect(PRODUCED_LIKE).toContain("conferido");
    for (const s of STATUS_CONHECIDOS) {
      expect(PRODUCED_LIKE.includes(s), s).toBe(["produced", "conferred", "packed"].includes(etapaDaPeca(s)!));
    }
  });

  it("os totais batem entre as telas", () => {
    const stats = computeStats(PECAS);
    const fases = contarPorFase(PECAS);
    const entreguesNaAnalise = PECAS.filter((p) => isDelivered(p)).length;
    const entreguesNoPrazo = PECAS.map((p) => statusParaContagem(p)).filter((s) => DELIVERED.has(s)).length;
    const entreguesNaBarra = fases[PHASES.findIndex((f) => f.key === "delivered")];
    expect(new Set([stats.byGroup.delivered, entreguesNaAnalise, entreguesNoPrazo, entreguesNaBarra]).size).toBe(1);
    const noFunil = PECAS.map((p) => statusParaContagem(p)).filter((s) => STATUS_STAGE_RANK[s] !== undefined).length;
    expect(countPendentes(PECAS.filter((p) => p.id !== "estranha"))).toBe(noFunil);
  });
});

describe("rótulos pt-BR", () => {
  it("todo status conhecido (e todo de ITEM_STATUSES) tem rótulo — nunca a chave crua", () => {
    const todos = new Set([...STATUS_CONHECIDOS, ...ITEM_STATUSES, STATUS_MOLDE_PRODUZIDO]);
    for (const s of Array.from(todos)) {
      expect(STATUS[s], s).toBeDefined();
      expect(getStatusLabel(s), s).not.toBe(s);
    }
    expect(getStatusLabel("archived")).toBe("Arquivado");
    expect(getStatusLabel("conferido")).toBe("Conferido");
    expect(getStatusLabel("in_production")).toBe("Em Impressão");
    expect(getStatusLabel("solicitado")).toBe("Solicitado");
  });
});
