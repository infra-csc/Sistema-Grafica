// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE VÍNCULO — O MOTOR E O APRENDIZADO (dono, 15/10).
//
// O motor é puro (@shared/sugestao-de-vinculo): estes testes prendem as três
// regras, o que vira AUTOMÁTICO (só o nome único, sem nada mais na peça), o
// aprendizado com dados sintéticos e a cota sugerida.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  aprenderPadroes, chaveDoTipo, nomeNaDescricao, normalizarCota, prefixosDaChave, sugerirCotas,
  sugerirVinculos, textoDaCotaSugerida, LIMIARES_DE_VINCULO, PADROES_VAZIOS,
  type PadroesDeVinculo, type PatrocinadorDoEvento, type PecaDoHistorico, type ElencoDoHistorico,
} from "@shared/sugestao-de-vinculo";

const ITAU = { id: "itau", nome: "Itaú" };
const NIKE = { id: "nike", nome: "Nike" };
const BB = { id: "bb", nome: "BB" };
const GAT = { id: "gat", nome: "Gatorade" };

describe("o nome na descrição", () => {
  it("casa sem acento e sem caixa", () => {
    expect(nomeNaDescricao("ROLO ITAU 2X1", "Itaú")).toBe(true);
    expect(nomeNaDescricao("Rolo itaú", "ITAU")).toBe(true);
  });
  it("casa por PALAVRA INTEIRA: Itaú não casa em Itaúna", () => {
    expect(nomeNaDescricao("Rolo Itaúna", "Itaú")).toBe(false);
    expect(nomeNaDescricao("Rolo Itaú/Arena", "Itaú")).toBe(true);
    expect(nomeNaDescricao("Banco do Brasil - rolo", "Banco do Brasil")).toBe(true);
  });
  it("nome com menos de 3 letras nunca casa", () => {
    expect(nomeNaDescricao("Rolo BB", "BB")).toBe(false);
    expect(LIMIARES_DE_VINCULO.nomeMinimo).toBe(3);
  });
  it("descrição vazia não casa", () => {
    expect(nomeNaDescricao(null, "Itaú")).toBe(false);
  });
});

describe("a chave do tipo", () => {
  it("junta as grafias: caixa, acento, plural e 'de'", () => {
    expect(chaveDoTipo("Quadros 4x3")).toBe(chaveDoTipo("quadro 4x3"));
    expect(chaveDoTipo("Faixa de Chegada")).toBe("faixa chegada");
    expect(chaveDoTipo("Pórtico (larg/cheg)")).toBe("portico larg cheg");
    expect(chaveDoTipo("2x1 padrão")).toBe("2x1 padrao");
  });
  it("prefixos do mais longo ao mais curto", () => {
    expect(prefixosDaChave("portico chegada largada")).toEqual(["portico chegada largada", "portico chegada", "portico"]);
  });
  it("cota normalizada", () => {
    expect(normalizarCota("Ministério")).toBe("MINISTERIO");
    expect(normalizarCota("  ")).toBeNull();
  });
});

describe("as regras do motor", () => {
  const padroes: PadroesDeVinculo = {
    estrutura: {
      portico: { pecas: 40, cobertura: 0.93, rotulo: "Pórtico", padrao: true },
      testeira: { pecas: 30, cobertura: 0.3, rotulo: "Testeira", padrao: false },
      "testeira portico": { pecas: 12, cobertura: 0.9, rotulo: "Testeira Pórtico", padrao: true },
    },
    cotaPorTipo: {
      "MASTER|display": { eventos: 14, comVinculo: 12, taxa: 0.91, rotulo: "Display", padrao: true },
      "MASTER|rolo": { eventos: 14, comVinculo: 1, taxa: 0.2, rotulo: "Rolo", padrao: false },
    },
  };
  const elenco: PatrocinadorDoEvento[] = [{ ...ITAU, cota: "MASTER" }, NIKE, GAT, BB];

  it("UM nome na descrição de peça comum: automática", () => {
    const s = sugerirVinculos({ tipo: "Rolo", descricao: "Rolo Nike 2x1" }, elenco, padroes);
    expect(s).toEqual([expect.objectContaining({ sponsorId: "nike", regra: "nome-na-descricao", automatica: true, motivo: "O nome está na descrição" })]);
  });

  it("dois nomes: sugestão dos dois, nenhuma automática", () => {
    const s = sugerirVinculos({ tipo: "Rolo", descricao: "Rolo Nike + Gatorade" }, elenco, padroes);
    expect(s.map((x) => x.sponsorId).sort()).toEqual(["gat", "nike"]);
    expect(s.every((x) => !x.automatica)).toBe(true);
    expect(s[0].motivo).toMatch(/junto com/);
  });

  it("estrutura leva o elenco; o nome NÃO vira automático numa peça de estrutura", () => {
    const s = sugerirVinculos({ tipo: "Pórtico Chegada", descricao: "Pórtico chegada Nike" }, elenco, padroes);
    expect(s.map((x) => x.sponsorId).sort()).toEqual(["bb", "gat", "itau", "nike"]);
    expect(s.every((x) => !x.automatica)).toBe(true);
    const gat = s.find((x) => x.sponsorId === "gat")!;
    expect(gat.regra).toBe("estrutura");
    expect(gat.motivo).toBe("Peça de estrutura: leva os patrocinadores do evento");
  });

  it("a chave mais específica com dado decide: 'testeira portico' é estrutura, 'testeira' não", () => {
    expect(sugerirVinculos({ tipo: "Testeira Pórtico Largada", descricao: "" }, elenco, padroes)).toHaveLength(4);
    expect(sugerirVinculos({ tipo: "Testeira", descricao: "" }, elenco, padroes)).toHaveLength(0);
  });

  it("cota aprendida: MASTER em Display, com a frase do histórico", () => {
    const s = sugerirVinculos({ tipo: "Display 1x2", descricao: "Display entrada" }, elenco, padroes);
    expect(s).toEqual([expect.objectContaining({ sponsorId: "itau", regra: "cota", confianca: 0.91, automatica: false, motivo: "MASTER costuma ir em Display (12 de 14 eventos)" })]);
  });

  it("cota abaixo do limiar não sugere (MASTER em Rolo)", () => {
    expect(sugerirVinculos({ tipo: "Rolo", descricao: "Rolo sem marca" }, elenco, padroes)).toEqual([]);
  });

  it("nome único + a cota pedindo outro patrocinador: tudo vira sugestão (nada automático)", () => {
    const s = sugerirVinculos({ tipo: "Display", descricao: "Display Nike" }, elenco, padroes);
    expect(s.map((x) => x.sponsorId).sort()).toEqual(["itau", "nike"]);
    expect(s.some((x) => x.automatica)).toBe(false);
  });

  it("cota vinda do histórico vale com confiança menor e diz de onde veio", () => {
    const s = sugerirVinculos({ tipo: "Display", descricao: "" }, [{ ...ITAU, cota: "MASTER", cotaDoHistorico: true }], padroes);
    expect(s[0].confianca).toBeCloseTo(0.91 * 0.9, 3);
    expect(s[0].motivo).toMatch(/cota pelo histórico/);
  });

  it("regra MANUAL de cota entra como 'cota', pelo prefixo do tipo", () => {
    const s = sugerirVinculos(
      { tipo: "Palco Lateral", descricao: "" },
      [{ ...NIKE, cota: "Gold" }],
      PADROES_VAZIOS,
      [{ cota: "GOLD", tipos: ["Palco"], origem: "evento" }],
    );
    expect(s).toEqual([expect.objectContaining({ sponsorId: "nike", regra: "cota", motivo: "Regra de cota do evento: GOLD leva Palco" })]);
    // "Palcos" não casa com "Palco Lateral"? Casa: plural vira singular.
    expect(sugerirVinculos({ tipo: "Palco Lateral", descricao: "" }, [{ ...NIKE, cota: "GOLD" }], PADROES_VAZIOS,
      [{ cota: "GOLD", tipos: ["Palcos"], origem: "geral" }])[0].motivo).toBe("Regra de cota geral: GOLD leva Palcos");
  });

  it("sem elenco, nada", () => {
    expect(sugerirVinculos({ tipo: "Rolo", descricao: "Rolo Nike" }, [], padroes)).toEqual([]);
  });
});

describe("o aprendizado (dados sintéticos)", () => {
  // 4 eventos, 4 patrocinadores cada; A é MASTER em todos.
  const eventos = ["e1", "e2", "e3", "e4"];
  const elencos: ElencoDoHistorico[] = eventos.flatMap((e) => [
    { eventId: e, sponsorId: "A", cota: "MASTER" },
    { eventId: e, sponsorId: "B", cota: "gold" },
    { eventId: e, sponsorId: "C", cota: null },
    { eventId: e, sponsorId: "D", cota: null },
  ]);
  const pecas: PecaDoHistorico[] = eventos.flatMap((e) => [
    // 3 pórticos por evento com o elenco quase todo → 12 peças, cobertura 0,94
    { eventId: e, tipo: "Pórtico Chegada", patrocinadores: ["A", "B", "C", "D"] },
    { eventId: e, tipo: "Pórtico de Chegada", patrocinadores: ["A", "B", "C", "D"] },
    { eventId: e, tipo: "Pórticos Chegada", patrocinadores: ["A", "B", "C"] },
    // display só do MASTER
    { eventId: e, tipo: "Display", patrocinadores: ["A"] },
    { eventId: e, tipo: "display", patrocinadores: ["A"] },
    // rolos: um por patrocinador
    ...["A", "B", "C", "D"].map((s) => ({ eventId: e, tipo: "Rolo", patrocinadores: [s] })),
  ]);
  const p = aprenderPadroes(pecas, elencos);

  it("estrutura: tipo com ≥ 10 peças e cobertura ≥ 0,8", () => {
    expect(p.estrutura["portico chegada"]).toEqual(expect.objectContaining({ pecas: 12, padrao: true }));
    expect(p.estrutura["portico chegada"].cobertura).toBeCloseTo((8 * 1 + 4 * 0.75) / 12, 3);
    expect(p.estrutura["portico chegada"].rotulo).toBe("Pórtico Chegada");
    // o prefixo de uma palavra também aprende, com o rótulo de uma palavra
    expect(p.estrutura["portico"].rotulo).toBe("Pórtico");
    // rolo: 16 peças, cobertura 0,25 — entra (dado suficiente) mas não é padrão
    expect(p.estrutura["rolo"]).toEqual(expect.objectContaining({ pecas: 16, padrao: false }));
    // display: só 8 peças — nem entra
    expect(p.estrutura["display"]).toBeUndefined();
  });

  it("cota × tipo: taxa ≥ 0,8 em ≥ 3 eventos", () => {
    expect(p.cotaPorTipo["MASTER|display"]).toEqual(expect.objectContaining({ eventos: 4, comVinculo: 4, taxa: 1, padrao: true, rotulo: "Display" }));
    expect(p.cotaPorTipo["MASTER|rolo"]).toEqual(expect.objectContaining({ eventos: 4, padrao: false }));
    expect(p.cotaPorTipo["GOLD|display"]).toEqual(expect.objectContaining({ taxa: 0, padrao: false }));
    // patrocinador sem cota no evento não ensina cota
    expect(Object.keys(p.cotaPorTipo).some((k) => k.startsWith("null"))).toBe(false);
  });

  it("menos de 3 eventos não ensina cota; evento com < 3 patrocinadores não ensina estrutura", () => {
    const pouco = aprenderPadroes(pecas.filter((x) => x.eventId !== "e3" && x.eventId !== "e4"), elencos);
    expect(pouco.cotaPorTipo["MASTER|display"]).toBeUndefined();
    const doisPatrocinadores = aprenderPadroes(
      Array.from({ length: 12 }, () => ({ eventId: "x", tipo: "Rolo", patrocinadores: ["A"] })),
      [{ eventId: "x", sponsorId: "A", cota: null }, { eventId: "x", sponsorId: "B", cota: null }],
    );
    expect(doisPatrocinadores.estrutura["rolo"]).toBeUndefined();
  });

  it("o motor com o aprendido: pórtico novo leva o elenco; display leva o MASTER", () => {
    const elenco: PatrocinadorDoEvento[] = [{ id: "A", nome: "Alfa", cota: "MASTER" }, { id: "B", nome: "Beta" }, { id: "C", nome: "Gama" }];
    expect(sugerirVinculos({ tipo: "Pórtico Chegada 2", descricao: "" }, elenco, p).map((s) => s.sponsorId).sort()).toEqual(["A", "B", "C"]);
    expect(sugerirVinculos({ tipo: "Display", descricao: "" }, elenco, p).map((s) => s.sponsorId)).toEqual(["A"]);
  });
});

describe("a cota sugerida", () => {
  const dia = (d: number) => Date.UTC(2026, 0, d);
  const vinculos = [
    { sponsorId: "A", eventId: "e1", cota: "GOLD", quando: dia(1) },
    { sponsorId: "A", eventId: "e2", cota: "master", quando: dia(5) },
    { sponsorId: "A", eventId: "e3", cota: "MASTER", quando: dia(9) },
    { sponsorId: "A", eventId: "e4", cota: "Master", quando: dia(12) },
    { sponsorId: "A", eventId: "e5", cota: null, quando: dia(20) },
    { sponsorId: "B", eventId: "e5", cota: null, quando: dia(20) },
    { sponsorId: "C", eventId: "e4", cota: "APOIO", quando: dia(12) },
  ];
  it("a mais recente, com quantos eventos seguidos", () => {
    const c = sugerirCotas(vinculos);
    expect(c.A).toEqual({ cota: "MASTER", seguidos: 3, eventos: 4 });
    expect(c.B).toBeUndefined();
    expect(textoDaCotaSugerida(c.A)).toBe("Sugerida: MASTER (últimos 3 eventos)");
    expect(textoDaCotaSugerida(c.C)).toBe("Sugerida: APOIO (último evento)");
  });
  it("tira o evento em edição da conta", () => {
    expect(sugerirCotas(vinculos, "e4").A).toEqual({ cota: "MASTER", seguidos: 2, eventos: 3 });
    expect(sugerirCotas(vinculos, "e4").C).toBeUndefined();
  });
});
