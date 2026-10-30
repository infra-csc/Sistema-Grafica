// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIOS DE PRODUÇÃO POR MATERIAL (Pedro, 29/10 — "Gestão Gráfica —
// Relatórios de produção por material"). Os critérios de aceite do documento:
//   1. sem filtro, "Produção por evento" dá os números de hoje;
//   2. filtrando um material, todas as colunas contam só as peças dele;
//   3. dois materiais = a soma dos dois filtros sozinhos;
//   4. evento sem peça do material sai da lista;
//   5. no relatório novo, a soma das linhas de material = a linha de Total;
//   6. o "A imprimir" do Produção por evento = Pré-produção + A imprimir do
//      relatório novo (lá o saldo da impressora vem inteiro; aqui, separado);
//   7. a célula lista exatamente as peças que compõem o número.
// O painel é montado pela MESMA função da rota, com os eventos da Gestão de
// Prazos (buildEventPrazo), como em painel-operacional.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  montarPainelOperacional, producaoPorEvento, producaoDoEventoPorMaterial, m2DaPecaPorStatus, normalizarRotulo,
  somarDias, STATUS_DO_MATERIAL, type PecaDoPainel, type PainelOperacional,
} from "@shared/painel-operacional";
import { MATERIAIS_PADRAO, OUTROS_MATERIAIS, filtroDeMaterial, materiaisDoCadastro } from "@shared/materiais";
import { buildEventPrazo, computeKpis, type DomainEvent } from "../services/prazo-domain";
import { businessDayStrToMs } from "@shared/prazo-dates";
import type { PrazoEvent } from "@shared/prazos-contract";

const HOJE = "2026-10-16";
const HOJE_MS = businessDayStrToMs(HOJE);
const em = (n: number) => new Date(Date.parse(`${somarDias(HOJE, n)}T15:00:00Z`));

const E1: DomainEvent = { id: "e1", name: "Copa Norte", status: "created", startDate: "2026-10-20", truckDepartureDate: "2026-10-14T00:00:00.000Z" };
const E2: DomainEvent = { id: "e2", name: "Abertura Sul", status: "created", startDate: "2026-11-01", truckDepartureDate: "2026-10-30T00:00:00.000Z" };

let seq = 0;
const peca = (eventId: string, status: string, over: Partial<PecaDoPainel> = {}): PecaDoPainel => {
  seq += 1;
  return {
    id: over.id ?? `p${seq}`, displayId: String(seq).padStart(4, "0"), eventId, status,
    type: "Banner", description: `Peça ${seq}`, measurement: "1x1", material: "Lona", finish: "ilhos",
    quantity: 1, reuseQty: 0, fileWidth: "1", fileHeight: "1", visualWidth: null, visualHeight: null,
    skipApproval: false, isPriority: false, parentItemId: null, complementReason: null,
    rejectedBySponsor: false, rejectedByCreator: false, createdAt: em(-40), ...over,
  };
};

const PECAS: PecaDoPainel[] = [
  // ── E1 ──
  peca("e1", "awaiting_submission", { id: "l-pre", quantity: 3, fileWidth: "2", fileHeight: "1" }),            // LONA pré · 6 m²
  peca("e1", "ready_for_production", { id: "l-lib", quantity: 4, reuseQty: 1, fileWidth: "2", fileHeight: "1" }), // LONA a imprimir · 3 un · 6 m²
  peca("e1", "inProduction", { id: "l-par", quantity: 5, quantityProduced: 2, fileWidth: "1", fileHeight: "1" }),   // LONA 3 a imprimir + 2 a acabar
  peca("e1", "produced", { id: "l-imp", quantity: 2, fileWidth: "1.5", fileHeight: "1", producedAt: em(-1) }),    // LONA a acabar · 3 m²
  peca("e1", "conferred", { id: "l-ok", quantity: 1, producedAt: em(-3), conferredAt: em(-2) }),                 // LONA acabado
  peca("e1", "delivered", { id: "l-ent", quantity: 2, producedAt: em(-50), conferredAt: em(-45) }),               // LONA acabado (fora dos 30 dias)
  peca("e1", "ready_for_production", { id: "s-lib", material: " sanett ", quantity: 2, fileWidth: "0.5", fileHeight: "1" }), // SANETT a imprimir · 1 m²
  peca("e1", "awaiting_final_review", { id: "x-pre", material: "PS 2MM", quantity: 1 }),                          // fora do cadastro
  peca("e1", "ready_for_production", { id: "r-zero", quantity: 2, reuseQty: 2 }),                                 // reuso inteiro: nada a produzir
  // ── E2: só ADESIVO ──
  peca("e2", "ready_for_production", { id: "a-lib", material: "Adesivo", quantity: 2, fileWidth: "1", fileHeight: "1" }),
  peca("e2", "draft", { id: "a-pre", material: "Adesivo", quantity: 1, fileWidth: "3", fileHeight: "1" }),
];

function montar(pecas = PECAS): PainelOperacional {
  const prazos = [E1, E2]
    .map((ev) => buildEventPrazo(ev, pecas.filter((p) => p.eventId === ev.id).map((p) => ({ ...p, quantity: p.quantity ?? 1, type: p.type ?? "" })) as never, { today: HOJE_MS }))
    .filter((e): e is PrazoEvent => !!e)
    .map((e) => ({ ...e, eventId: e.id, kit: null }));
  return montarPainelOperacional({
    pecas, prazos, kpis: computeKpis(prazos), hoje: HOJE, geradoEm: em(0).toISOString(),
    nomeDoEvento: new Map([["e1", "Copa Norte"], ["e2", "Abertura Sul"]]),
  });
}
const P = montar();
const CADASTRO = materiaisDoCadastro(normalizarRotulo, [{ kind: "material", value: "P.S." }, { kind: "finish", value: "Ilhós" }], [{ material: "Lona" }, { material: null }]);
const so = (...m: string[]) => filtroDeMaterial(m, CADASTRO);
const linha = (r: ReturnType<typeof producaoPorEvento>, ev: string) => r.find((x) => x.evento === ev);

describe("o cadastro de materiais", () => {
  it("padrão + cadastrados + Modelos, normalizados e sem repetição", () => {
    expect(CADASTRO).toEqual(["ADESIVO", "LONA", "MADEIRA", "P.S.", "SANETT", "TECIDO", "TECIDO PET"]);
    expect(MATERIAIS_PADRAO).toHaveLength(6);
  });

  it("nenhum escolhido = sem filtro; 'Outros' pega o que está fora do cadastro", () => {
    expect(filtroDeMaterial([], CADASTRO)).toBeNull();
    const outros = filtroDeMaterial([OUTROS_MATERIAIS], CADASTRO)!;
    expect(outros("PS 2MM")).toBe(true);
    expect(outros("(sem material)")).toBe(true);
    expect(outros("LONA")).toBe(false);
  });
});

describe("Melhoria 1 — filtro de tipo de material em Produção por evento", () => {
  it("1 · sem filtro, os mesmos números de antes (o material só abriu as linhas)", () => {
    expect(producaoPorEvento(P, null)).toEqual(producaoPorEvento(P));
    // As séries somadas abertas por material somam o mesmo que antes.
    const e1 = linha(producaoPorEvento(P), "e1")!;
    expect(e1.aImprimirUn).toBe(3 + 3 + 3 + 2 + 1); // pré (3) + liberada (3) + parcial (3) + sanett (2) + PS (1)
  });

  it("2 · filtrando um material, TODAS as colunas contam só as peças dele", () => {
    const lona = linha(producaoPorEvento(P, so("LONA")), "e1")!;
    expect(lona.aImprimirUn).toBe(9); // l-pre 3 + l-lib 3 + l-par 3
    expect(lona.aImprimirM2).toBe(15); // 6 + 6 + 3
    expect(lona.impressoM2_30d).toBe(3 + 1); // l-imp 3 m² + l-ok 1 m² (l-ent fora dos 30 dias)
    expect(lona.acabadoM2_30d).toBe(1);
    const sanett = linha(producaoPorEvento(P, so("SANETT")), "e1")!;
    expect(sanett).toMatchObject({ aImprimirUn: 2, aImprimirM2: 1, impressoM2_30d: 0, acabadoM2_30d: 0 });
  });

  it("3 · dois materiais = a soma dos dois sozinhos", () => {
    const soma = (r: ReturnType<typeof producaoPorEvento>[number] | undefined) => r ?? { impressoM2_30d: 0, acabadoM2_30d: 0, aImprimirM2: 0, aImprimirUn: 0, aAcabarUn: 0 };
    for (const ev of ["e1", "e2"]) {
      const a = soma(linha(producaoPorEvento(P, so("LONA")), ev));
      const b = soma(linha(producaoPorEvento(P, so("ADESIVO")), ev));
      const ab = soma(linha(producaoPorEvento(P, so("LONA", "ADESIVO")), ev));
      for (const k of ["impressoM2_30d", "acabadoM2_30d", "aImprimirM2", "aImprimirUn", "aAcabarUn"] as const) {
        expect(ab[k], `${ev}.${k}`).toBe(a[k] + b[k]);
      }
    }
  });

  it("4 · evento sem peça do material sai da lista", () => {
    expect(producaoPorEvento(P, so("ADESIVO")).map((r) => r.evento)).toEqual(["e2"]);
    expect(producaoPorEvento(P, so("SANETT")).map((r) => r.evento)).toEqual(["e1"]);
    expect(producaoPorEvento(P, so("MADEIRA"))).toEqual([]);
  });
});

describe("Melhoria 2 — Produção do evento por material", () => {
  const rel = producaoDoEventoPorMaterial(P.pecas, "e1");
  const de = (m: string) => rel.linhas.find((l) => l.material === m)!;

  it("uma linha por material, com o m² no status da peça (a parcial dividida)", () => {
    expect(rel.linhas.map((l) => l.material).sort()).toEqual(["LONA", "PS 2MM", "SANETT"]);
    expect(de("LONA").m2).toEqual({ pre: 6, aImprimir: 9, aAcabar: 5, acabado: 3 });
    expect(de("LONA").total).toBe(23);
    expect(de("LONA").unidades).toBe(3 + 3 + 5 + 2 + 1 + 2);
    expect(de("SANETT").m2).toEqual({ pre: 0, aImprimir: 1, aAcabar: 0, acabado: 0 });
    expect(de("PS 2MM").m2.pre).toBe(1);
    // Reuso inteiro não tem nada a produzir: não entra em célula nenhuma.
    expect(rel.linhas.flatMap((l) => STATUS_DO_MATERIAL.flatMap((s) => l.pecas[s]))).not.toContain("r-zero");
  });

  it("ordem padrão: A imprimir (m²), do maior para o menor", () => {
    expect(rel.linhas.map((l) => l.material)).toEqual(["LONA", "SANETT", "PS 2MM"]);
  });

  it("5 · a soma das linhas de material bate com a linha de Total (e cada Total de linha com as colunas)", () => {
    for (const s of STATUS_DO_MATERIAL) expect(rel.total.m2[s]).toBe(rel.linhas.reduce((a, l) => a + l.m2[s], 0));
    expect(rel.total.total).toBe(rel.linhas.reduce((a, l) => a + l.total, 0));
    expect(rel.total.unidades).toBe(rel.linhas.reduce((a, l) => a + l.unidades, 0));
    for (const l of rel.linhas) expect(l.total).toBe(STATUS_DO_MATERIAL.reduce((a, s) => a + l.m2[s], 0));
  });

  it("6 · o 'A imprimir' do Produção por evento = Pré-produção + A imprimir daqui — também por material", () => {
    for (const ev of ["e1", "e2"]) {
      const r = producaoDoEventoPorMaterial(P.pecas, ev);
      expect(r.total.m2.pre + r.total.m2.aImprimir, ev).toBe(linha(producaoPorEvento(P), ev)!.aImprimirM2);
    }
    expect(de("LONA").m2.pre + de("LONA").m2.aImprimir).toBe(linha(producaoPorEvento(P, so("LONA")), "e1")!.aImprimirM2);
  });

  it("7 · cada célula lista exatamente as peças que compõem o número", () => {
    expect(de("LONA").pecas).toEqual({ pre: ["l-pre"], aImprimir: ["l-lib", "l-par"], aAcabar: ["l-par", "l-imp"], acabado: ["l-ok", "l-ent"] });
    const doEvento = P.pecas.filter((p) => p.evento === "e1");
    for (const l of rel.linhas) {
      for (const s of STATUS_DO_MATERIAL) {
        const soma = l.pecas[s].reduce((a, id) => a + m2DaPecaPorStatus(doEvento.find((p) => p.id === id)!)[s], 0);
        // Maior resto: a célula é o m² das peças arredondado para baixo ou para cima.
        expect(Math.abs(soma - l.m2[s]), `${l.material}.${s}`).toBeLessThan(1);
      }
    }
  });

  it("arredondamento pelo maior resto: a coluna soma o total real arredondado, não a soma dos arredondados", () => {
    // Três materiais com 0,4 m² a imprimir cada: célula a célula daria 0 + 0 + 0
    // e a linha de Total diria 0 para 1,2 m² reais.
    const tres = ["LONA", "SANETT", "ADESIVO"].map((material, i) => ({
      ...P.pecas.find((p) => p.id === "l-lib")!, id: `t${i}`, evento: "t", material, unidades: 1, aImprimir: 1, m2: 0.4,
    }));
    const r = producaoDoEventoPorMaterial(tres, "t");
    expect(r.total.m2.aImprimir).toBe(1);
    expect(r.linhas.map((l) => l.m2.aImprimir).sort()).toEqual([0, 0, 1]);
    expect(r.total.total).toBe(r.linhas.reduce((a, l) => a + l.total, 0));
  });

  it("evento sem peça a produzir: nenhuma linha, total zerado", () => {
    expect(producaoDoEventoPorMaterial(P.pecas, "nao-existe")).toEqual({ linhas: [], total: { m2: { pre: 0, aImprimir: 0, aAcabar: 0, acabado: 0 }, total: 0, unidades: 0 } });
  });
});
