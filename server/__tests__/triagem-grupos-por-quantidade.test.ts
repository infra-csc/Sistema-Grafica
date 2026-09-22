// ─────────────────────────────────────────────────────────────────────────────
// TRIAGEM — ITENS POR QUANTIDADE JUNTOS (dono, 21/09): as regras puras.
//
// O dado de fato: o ciclo da Gráfica cria UM registro por unidade (quantity 1,
// mesmo originalItemId). 24 unidades = 24 registros. O agrupamento é de tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  SEM_DISTRIBUICAO, agruparAtivos, ajustarDistribuicao, chaveDoGrupo, fraseDoDescarte, moverQuantidade,
  planoDeGravacao, restante, resumoDaGravacao, tudoPara,
} from "../../client/src/components/triagem/grupos-da-triagem";

const ativo = (id: string, extra: any = {}) => ({
  id, displayId: `#EST-${id}`, name: "2x1 Ministério", quantity: 1, eventId: "e1", originalItemId: "item-1",
  sponsorIds: ["s1"], sponsors: [{ id: "s1", name: "Ministério" }], approvalThumbUrl: null, ...extra,
}) as any;

describe("a chave do grupo", () => {
  it("mesmo evento + mesma peça de origem = mesmo grupo, ainda que o nome mude", () => {
    expect(chaveDoGrupo(ativo("a"))).toBe(chaveDoGrupo(ativo("b", { name: "outro nome" })));
  });
  it("a mesma peça de origem em OUTRO evento não se mistura", () => {
    expect(chaveDoGrupo(ativo("a"))).not.toBe(chaveDoGrupo(ativo("b", { eventId: "e2" })));
  });
  it("sem peça de origem: nome (sem acento/caixa/espaço duplo) + patrocinadores em qualquer ordem", () => {
    const manual = (nome: string, pats: string[]) => ativo("m", { originalItemId: null, name: nome, sponsorIds: pats });
    expect(chaveDoGrupo(manual("Grade  Metálica", ["s2", "s1"]))).toBe(chaveDoGrupo(manual("grade metalica", ["s1", "s2"])));
    expect(chaveDoGrupo(manual("Grade", ["s1"]))).not.toBe(chaveDoGrupo(manual("Grade", ["s2"])));
    expect(chaveDoGrupo(manual("Grade", []))).not.toBe(chaveDoGrupo(ativo("x")));
  });
});

describe("agrupar", () => {
  it("soma as unidades (inclusive de registro ×N), guarda os registros em ordem natural e a 1ª miniatura", () => {
    const grupos = agruparAtivos([
      ativo("0412-10"), ativo("0412-2", { approvalThumbUrl: "/objects/a.png" }), ativo("0412-1", { quantity: 3 }),
      ativo("solto", { originalItemId: "item-2", name: "Pórtico" }),
    ]);
    expect(grupos.length).toBe(2);
    expect(grupos[0]).toMatchObject({ nome: "2x1 Ministério", unidades: 5, patrocinadores: ["Ministério"], miniatura: "/objects/a.png" });
    expect(grupos[0].ativos.map((a) => a.id)).toEqual(["0412-1", "0412-2", "0412-10"]);
    expect(grupos[1].unidades).toBe(1);
  });
  it("não funde nem altera registro nenhum; 4 mil registros agrupam numa passada", () => {
    const fila = Array.from({ length: 4200 }, (_, i) => ativo(String(i), { originalItemId: `item-${i % 300}` }));
    const copia = JSON.stringify(fila);
    const grupos = agruparAtivos(fila);
    expect(grupos.length).toBe(300);
    expect(grupos.reduce((s, g) => s + g.unidades, 0)).toBe(4200);
    expect(JSON.stringify(fila)).toBe(copia);
  });
});

describe("distribuir a quantidade", () => {
  it("a soma nunca passa do total; o resto é o que continua aguardando", () => {
    let d = ajustarDistribuicao(24, SEM_DISTRIBUICAO, "galpao", 20);
    d = ajustarDistribuicao(24, d, "manutencao", 3);
    expect(restante(24, d)).toBe(1);
    d = ajustarDistribuicao(24, d, "descartar", 9);
    expect(d).toEqual({ galpao: 20, manutencao: 3, descartar: 1 });
    expect(restante(24, d)).toBe(0);
    // Diminuir um destino libera o resto.
    expect(restante(24, ajustarDistribuicao(24, d, "galpao", 5))).toBe(15);
  });
  it("lixo, negativo e fração viram número limpo", () => {
    expect(ajustarDistribuicao(10, SEM_DISTRIBUICAO, "galpao", NaN).galpao).toBe(0);
    expect(ajustarDistribuicao(10, SEM_DISTRIBUICAO, "galpao", -4).galpao).toBe(0);
    expect(ajustarDistribuicao(10, SEM_DISTRIBUICAO, "galpao", 3.9).galpao).toBe(3);
  });
  it("tudo para um destino; arrastar o cartão leva a fatia da coluna de origem", () => {
    expect(tudoPara(24, "galpao")).toEqual({ galpao: 24, manutencao: 0, descartar: 0 });
    const d = { galpao: 20, manutencao: 3, descartar: 0 };
    expect(moverQuantidade(24, d, "triar", "descartar")).toEqual({ galpao: 20, manutencao: 3, descartar: 1 });
    expect(moverQuantidade(24, d, "manutencao", "galpao")).toEqual({ galpao: 23, manutencao: 0, descartar: 0 });
    expect(moverQuantidade(24, d, "galpao", "triar")).toEqual({ galpao: 0, manutencao: 3, descartar: 0 });
    expect(moverQuantidade(24, d, "galpao", "galpao")).toBe(d);
  });
});

describe("o plano de gravação", () => {
  const unitarios = agruparAtivos(Array.from({ length: 24 }, (_, i) => ativo(`0412-${i + 1}`)))[0];

  it("N registros unitários: os primeiros vão ao Galpão, depois Manutenção, depois Descartar; o resto fica como está", () => {
    const { passos, incompletos } = planoDeGravacao(unitarios, { galpao: 20, manutencao: 2, descartar: 1 }, "AVARIA_LEVE");
    expect(incompletos).toEqual([]);
    expect(passos.length).toBe(23);
    expect(passos.every((p) => p.tipo === "triagem" && p.metodo === "PATCH")).toBe(true);
    expect(passos[0]).toMatchObject({ ativoId: "0412-1", url: "/api/inventory/0412-1/triage", corpo: { condition: "AVARIA_LEVE", trackingStatus: "NO_GALPAO" } });
    expect(passos[20].corpo).toEqual({ condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO" });
    expect(passos[22]).toMatchObject({ ativoId: "0412-23", corpo: { condition: "SUCATA", trackingStatus: "DESCARTADO" } });
    // Sem local em nenhum corpo (dono, 21/09).
    expect(passos.some((p) => "location" in p.corpo)).toBe(false);
  });

  it("UM registro ×24 repartido inteiro → um triage-split cuja soma fecha a quantidade", () => {
    const g = agruparAtivos([ativo("M-7", { quantity: 24 })])[0];
    const { passos } = planoDeGravacao(g, { galpao: 20, manutencao: 3, descartar: 1 }, "PERFEITO");
    expect(passos).toEqual([{ tipo: "divisao", ativoId: "M-7", chave: g.chave, metodo: "POST", url: "/api/inventory/M-7/triage-split", corpo: { splits: [
      { qty: 20, condition: "PERFEITO", trackingStatus: "NO_GALPAO" },
      { qty: 3, condition: "AVARIA_LEVE", trackingStatus: "EM_MANUTENCAO" },
      { qty: 1, condition: "SUCATA", trackingStatus: "DESCARTADO" },
    ] }, unidades: 24 }]);
  });

  it("registro ×N inteiro num destino → triagem simples; repartido SÓ EM PARTE → fica de fora e é apontado", () => {
    const g = agruparAtivos([ativo("M-7", { quantity: 10 })])[0];
    expect(planoDeGravacao(g, tudoPara(10, "galpao"), "PERFEITO").passos[0]).toMatchObject({ tipo: "triagem", corpo: { trackingStatus: "NO_GALPAO" } });
    const parcial = planoDeGravacao(g, { galpao: 0, manutencao: 4, descartar: 0 }, "PERFEITO");
    expect(parcial.passos).toEqual([]);
    expect(parcial.incompletos).toEqual([{ ativoId: "M-7", displayId: "#EST-M-7", quantidade: 10, faltam: 6 }]);
  });

  // Revisão 22/09: o ×3 não BLOQUEIA mais o plano — os dois unitários fecham
  // as 2 do Galpão e o ×3 fica inteiro, aguardando (antes virava "incompleto").
  it("grupo misto (×3 + unitários): 2 no Galpão = os dois unitários; o ×3 fica intocado, sem incompleto", () => {
    const g = agruparAtivos([ativo("A-1", { quantity: 3 }), ativo("A-2"), ativo("A-3")])[0];
    const { passos, incompletos } = planoDeGravacao(g, { galpao: 2, manutencao: 0, descartar: 0 }, "PERFEITO");
    expect(incompletos).toEqual([]);
    expect(passos.map((p) => p.ativoId).sort()).toEqual(["A-2", "A-3"]);
  });
});

describe("as frases", () => {
  it("confirmação do descarte: parcial, total e de vários materiais", () => {
    expect(fraseDoDescarte([{ nome: "2x1 Ministério", descartar: 1, unidades: 24 }])).toBe("Descartar 1 de 24 un. de 2x1 Ministério?");
    expect(fraseDoDescarte([{ nome: "2x1 Ministério", descartar: 24, unidades: 24 }])).toBe("Descartar as 24 un. de 2x1 Ministério?");
    expect(fraseDoDescarte([{ nome: "Pórtico", descartar: 1, unidades: 1 }])).toBe("Descartar Pórtico?");
    expect(fraseDoDescarte([{ nome: "A", descartar: 1, unidades: 2 }, { nome: "B", descartar: 3, unidades: 3 }])).toBe("Descartar 4 un. de 2 materiais?");
  });
  it("resumo do salvar: as já triadas por outra pessoa contam à parte", () => {
    expect(resumoDaGravacao(18, 2, 0)).toBe("18 salvas · 2 já tinham sido triadas");
    expect(resumoDaGravacao(1, 1, 1)).toBe("1 salva · 1 já tinha sido triada · 1 com erro");
    expect(resumoDaGravacao(5, 0, 0)).toBe("5 salvas");
  });
});
