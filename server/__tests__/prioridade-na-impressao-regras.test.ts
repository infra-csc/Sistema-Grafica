// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA IMPRESSÃO — a REGRA e as ORDENS (dono, 08/10).
//
//   · shared/prioridade-na-impressao.ts, status a status: pedir só da Revisão
//     Final até a impressão terminar; quem (admin, Solicitação, régua do Kit);
//     molde, reaproveitamento total, book e lixeira de fora; retirar não
//     depende da etapa;
//   · a fila da GRÁFICA: prioritária primeiro de TODA a fila, à frente de
//     qualquer evento (08/10 — antes era só o topo do bloco do evento);
//   · MÁQUINAS: na fila geral a prioritária passa à frente de qualquer evento;
//     na fila da impressora, à frente das que esperam — nunca da pausada
//     (a "tirada para o topo"), e a que imprime nem está nessa lista.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  motivoParaNaoPedirPrioridade, motivoParaNaoRetirarPrioridade, estadoDaPrioridadeNaImpressao,
  ETAPAS_DA_PRIORIDADE_NA_IMPRESSAO, lerPedidoDePrioridade, mensagemDoAvisoDePrioridade, primeiroAsPrioritarias,
} from "@shared/prioridade-na-impressao";
import { STATUS_CONHECIDOS } from "@shared/fluxo-peca";
import { ITEM_STATUSES } from "@shared/schema";
import { ordenarFilaDaGrafica } from "@/components/grafica/fila/ordem-da-fila";
import { ordenarFila } from "@/components/grafica/maquinas/regras";
import type { PecaNaFila } from "@/components/grafica/maquinas/tipos";

const peca = (over: Record<string, unknown> = {}) => ({
  status: "awaiting_final_review", type: "Banner", isReuse: false, isPriority: false,
  deletedAt: null, kitRemessaId: null, criadoPorId: "u9", ...over,
});

describe("as etapas: da Revisão Final até a impressão terminar", () => {
  const ACEITAS = ["awaiting_final_review", "awaiting_review", "in_review", "ready_for_production", "pronto_para_producao", "approved", "liberado", "inProduction", "em_producao"];
  it("a lista é exatamente esta", () => {
    expect([...ETAPAS_DA_PRIORIDADE_NA_IMPRESSAO].sort()).toEqual([...ACEITAS].sort());
  });

  const UNIVERSO = Array.from(new Set<string>([...STATUS_CONHECIDOS, ...ITEM_STATUSES, "status_inexistente"]));
  for (const status of UNIVERSO) {
    const aceita = ACEITAS.includes(status);
    it(`${status} → ${aceita ? "pode pedir" : "não pode"}`, () => {
      const m = motivoParaNaoPedirPrioridade(peca({ status }), "solicitacao");
      if (aceita) expect(m).toBeNull();
      else { expect(m?.codigo).toBe("ETAPA"); expect(m?.http).toBe(409); }
    });
  }

  it("a frase diz o porquê, conforme o lado em que a peça está", () => {
    expect(motivoParaNaoPedirPrioridade(peca({ status: "produced" }), "admin")?.frase).toMatch(/já saiu da impressora/);
    expect(motivoParaNaoPedirPrioridade(peca({ status: "delivered" }), "admin")?.frase).toMatch(/já saiu da impressora/);
    expect(motivoParaNaoPedirPrioridade(peca({ status: "canceled" }), "admin")?.frase).toMatch(/cancelada/);
    expect(motivoParaNaoPedirPrioridade(peca({ status: "awaiting_submission" }), "admin")?.frase).toMatch(/ainda não chegou à Revisão Final/);
  });
});

describe("quem pede", () => {
  it("admin e Solicitação; Arte, Gráfica e Atendimento não (403)", () => {
    expect(motivoParaNaoPedirPrioridade(peca(), "admin")).toBeNull();
    expect(motivoParaNaoPedirPrioridade(peca(), "solicitacao")).toBeNull();
    for (const papel of ["arte", "grafica", "atendimento", null, undefined]) {
      expect(motivoParaNaoPedirPrioridade(peca(), papel)).toMatchObject({ codigo: "PAPEL", http: 403 });
      expect(motivoParaNaoRetirarPrioridade(peca({ isPriority: true }), papel)).toMatchObject({ codigo: "PAPEL", http: 403 });
    }
  });

  it("Kit: a Solicitação da Arena só visualiza; o usuário do Kit só as que criou; o admin, tudo", () => {
    const doKit = peca({ kitRemessaId: "r1", criadoPorId: "k1" });
    expect(motivoParaNaoPedirPrioridade(doKit, { papel: "solicitacao" })).toMatchObject({ codigo: "KIT", http: 403 });
    expect(motivoParaNaoPedirPrioridade(doKit, { papel: "solicitacao", kit: true, userId: "k1" })).toBeNull();
    expect(motivoParaNaoPedirPrioridade(doKit, { papel: "solicitacao", kit: true, userId: "k2" })).toMatchObject({ codigo: "KIT" });
    expect(motivoParaNaoPedirPrioridade(peca(), { papel: "solicitacao", kit: true, userId: "k1" })).toMatchObject({ codigo: "KIT" });
    expect(motivoParaNaoPedirPrioridade(doKit, { papel: "admin" })).toBeNull();
  });
});

describe("as peças que não imprimem", () => {
  it("molde, reaproveitamento total, book completo e lixeira", () => {
    expect(motivoParaNaoPedirPrioridade(peca({ type: "Molde" }), "admin")?.codigo).toBe("MOLDE");
    expect(motivoParaNaoPedirPrioridade(peca({ isReuse: true }), "admin")?.codigo).toBe("REAPROVEITAMENTO");
    expect(motivoParaNaoPedirPrioridade(peca({ type: "Book completo" }), "admin")?.codigo).toBe("BOOK");
    expect(motivoParaNaoPedirPrioridade(peca({ deletedAt: new Date() }), "admin")).toMatchObject({ codigo: "EXCLUIDA", http: 404 });
  });
});

describe("retirar é recuar: não depende da etapa", () => {
  it("vale numa peça já impressa ou cancelada; a lixeira não", () => {
    expect(motivoParaNaoRetirarPrioridade(peca({ status: "produced", isPriority: true }), "solicitacao")).toBeNull();
    expect(motivoParaNaoRetirarPrioridade(peca({ status: "canceled", isPriority: true }), "solicitacao")).toBeNull();
    expect(motivoParaNaoRetirarPrioridade(peca({ deletedAt: "2026-10-01" }), "solicitacao")?.codigo).toBe("EXCLUIDA");
  });
});

describe("o estado na tela", () => {
  it("pedir / pedida / nada", () => {
    expect(estadoDaPrioridadeNaImpressao(peca(), "solicitacao")).toBe("pedir");
    expect(estadoDaPrioridadeNaImpressao(peca({ isPriority: true, status: "inProduction" }), "solicitacao")).toBe("pedida");
    expect(estadoDaPrioridadeNaImpressao(peca({ status: "produced" }), "solicitacao")).toBeNull();
    expect(estadoDaPrioridadeNaImpressao(peca(), "grafica")).toBeNull();
    expect(estadoDaPrioridadeNaImpressao(peca(), "arte")).toBeNull();
    expect(estadoDaPrioridadeNaImpressao(null, "admin")).toBeNull();
  });

  it("o corpo do pedido é booleano", () => {
    expect(lerPedidoDePrioridade({ prioritaria: true })).toEqual({ ok: true, prioritaria: true });
    expect(lerPedidoDePrioridade({ prioritaria: false })).toEqual({ ok: true, prioritaria: false });
    expect(lerPedidoDePrioridade({ prioritaria: "sim" }).ok).toBe(false);
    expect(lerPedidoDePrioridade(null).ok).toBe(false);
  });

  it("o aviso à Gráfica", () => {
    expect(mensagemDoAvisoDePrioridade({ displayId: "#6033", type: "Placa 2x1" }, "Copa Norte", "Fulana"))
      .toBe("PRIORIDADE NA IMPRESSÃO: #6033 Placa 2x1 — Copa Norte (pedida por Fulana)");
  });
});

// ─── As ordens ───────────────────────────────────────────────────────────────
const ev = (name: string, saida: string) => ({ name, truckDepartureDate: saida });
const PERTO = ev("A · perto", "2026-10-10T12:00:00Z");
const LONGE = ev("Z · longe", "2026-12-20T12:00:00Z");

describe("a fila da Gráfica: prioritária primeiro de TODA a fila (08/10)", () => {
  it("a prioritária de um evento distante passa à frente de todas as do evento mais próximo", () => {
    const fila = [
      { id: "p1", displayId: "#0001", type: "Banner", isPriority: false, event: PERTO },
      { id: "p2", displayId: "#0002", type: "Banner", isPriority: false, event: PERTO },
      { id: "z1", displayId: "#0100", type: "Banner", isPriority: false, event: LONGE },
      { id: "z2", displayId: "#0101", type: "Placa", isPriority: true, event: LONGE },
    ];
    expect(ordenarFilaDaGrafica(fila).map((p) => p.id)).toEqual(["z2", "p1", "p2", "z1"]);
  });

  it("entre as prioritárias e no resto, a ordem de sempre (saída, evento, tipo, código)", () => {
    const fila = [
      { id: "z9", displayId: "#0109", type: "Banner", isPriority: true, event: LONGE },
      { id: "a9", displayId: "#0009", type: "Placa", isPriority: true, event: PERTO },
      { id: "a1", displayId: "#0001", type: "Banner", isPriority: true, event: PERTO },
      { id: "n2", displayId: "#0002", type: "Banner", isPriority: false, event: PERTO },
    ];
    expect(ordenarFilaDaGrafica(fila).map((p) => p.id)).toEqual(["a1", "a9", "z9", "n2"]);
  });
});

const naFila = (id: string, over: Partial<PecaNaFila> = {}): PecaNaFila => ({
  id, displayId: `#${id}`, tipo: "Banner", descricao: null, evento: "E", quantidade: 1, reuso: 0, aImprimir: 1, impressas: 0,
  desde: null, maquina: null, status: "ready_for_production", miniatura: null, eventoInfo: null,
  maquinaPrevista: null, m2: 1, saidaCaminhao: "2026-10-10T12:00:00Z", prazoProducaoGrafica: -1, ...over,
});

describe("Máquinas: a prioritária primeiro", () => {
  it("fila geral: a prioritária de evento mais distante passa à frente de todas", () => {
    const fila = [
      naFila("0001", { saidaCaminhao: "2026-10-10T12:00:00Z" }),
      naFila("0002", { saidaCaminhao: "2026-10-11T12:00:00Z" }),
      naFila("0900", { saidaCaminhao: "2026-12-20T12:00:00Z", prioritaria: true }),
    ];
    expect(ordenarFila(fila).map((p) => p.id)).toEqual(["0900", "0001", "0002"]);
  });

  it("fila da impressora: passa à frente das que esperam, NUNCA da pausada (a tirada para o topo)", () => {
    const fila = [
      naFila("0001", { saidaCaminhao: "2026-10-10T12:00:00Z" }),
      naFila("0005", { pausadaEm: "2026-10-08T10:00:00Z", saidaCaminhao: "2026-11-01T12:00:00Z" }),
      naFila("0900", { saidaCaminhao: "2026-12-20T12:00:00Z", prioritaria: true }),
    ];
    expect(ordenarFila(fila).map((p) => p.id)).toEqual(["0005", "0900", "0001"]);
  });

  it("o desempate puro é estável: sozinho, só separa as prioritárias", () => {
    const l = [{ id: "a" }, { id: "b", prioritaria: true }, { id: "c" }, { id: "d", prioritaria: true }];
    expect([...l].sort(primeiroAsPrioritarias).map((x) => x.id)).toEqual(["b", "d", "a", "c"]);
  });
});
