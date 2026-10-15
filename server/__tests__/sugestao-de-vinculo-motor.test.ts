// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE VÍNCULO — O MOTOR E O APRENDIZADO (dono, 15/10).
//
// O motor é puro (@shared/sugestao-de-vinculo): estes testes prendem as duas
// regras (nome na descrição e COTA POR PEÇA), o que vira AUTOMÁTICO (só o nome
// único, sem cota pedindo outro), o aprendizado pelo TIPO EXATO da peça (sem
// cair no grupo) e a cota sugerida. A antiga regra "estrutura" saiu (dono:
// "as sugestões têm que ser pela peça de cota, não grupo").
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import * as Motor from "@shared/sugestao-de-vinculo";
import {
  aprenderPadroes, lerNomeDaPeca, chaveDoNome, chaveDoTipo, nomeNaDescricao, normalizarCota, sugerirCotas,
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
    expect(chaveDoTipo("Pórtico Larg/Cheg")).toBe(chaveDoTipo("pórticos larg / cheg"));
    expect(chaveDoTipo("2x1 padrão")).toBe("2x1 padrao");
  });
  it("cota normalizada", () => {
    expect(normalizarCota("Ministério")).toBe("MINISTERIO");
    expect(normalizarCota("  ")).toBeNull();
  });
  it("a regra 'estrutura' e o casamento por prefixo do aprendido saíram do motor", () => {
    expect("prefixosDaChave" in Motor).toBe(false);
    expect(Object.keys(PADROES_VAZIOS)).toEqual(["cotaPorNome", "cotaPorTipo"]);
    expect(Object.keys(LIMIARES_DE_VINCULO).some((k) => k.startsWith("estrutura"))).toBe(false);
  });
});

describe("as regras do motor", () => {
  // Sem histórico de NOME aqui: tudo cai no TIPO exato (e o motivo diz isso).
  const padroes: PadroesDeVinculo = {
    cotaPorNome: {},
    cotaPorTipo: {
      "MASTER|display": { eventos: 14, comVinculo: 12, taxa: 0.91, rotulo: "Display", padrao: true },
      "MASTER|portico larg cheg": { eventos: 15, comVinculo: 14, taxa: 0.95, rotulo: "Pórtico Larg/Cheg", padrao: true },
      "GOLD|portico larg cheg": { eventos: 10, comVinculo: 9, taxa: 0.88, rotulo: "Pórtico Larg/Cheg", padrao: true },
      "MASTER|rolo": { eventos: 14, comVinculo: 1, taxa: 0.2, rotulo: "Rolo", padrao: false },
    },
  };
  const elenco: PatrocinadorDoEvento[] = [{ ...ITAU, cota: "MASTER" }, { ...NIKE, cota: "GOLD" }, { ...GAT, cota: "GOLD" }, BB];

  it("UM nome na descrição de peça sem cota pedindo outro: automática", () => {
    const s = sugerirVinculos({ tipo: "Rolo", descricao: "Rolo Nike 2x1" }, elenco, padroes);
    expect(s).toEqual([expect.objectContaining({ sponsorId: "nike", regra: "nome-na-descricao", automatica: true, motivo: "O nome está na descrição" })]);
  });

  it("dois nomes: sugestão dos dois, nenhuma automática", () => {
    const s = sugerirVinculos({ tipo: "Rolo", descricao: "Rolo Nike + Gatorade" }, elenco, padroes);
    expect(s.map((x) => x.sponsorId).sort()).toEqual(["gat", "nike"]);
    expect(s.every((x) => !x.automatica)).toBe(true);
    expect(s[0].motivo).toMatch(/junto com/);
  });

  it("COTA POR PEÇA: no pórtico vão as cotas que vão no pórtico — não o elenco inteiro", () => {
    const s = sugerirVinculos({ tipo: "Pórtico Larg/Cheg", descricao: "Pórtico de chegada" }, elenco, padroes);
    expect(s.map((x) => x.sponsorId).sort()).toEqual(["gat", "itau", "nike"]); // BB não tem cota: fica de fora
    expect(s.every((x) => x.regra === "cota" && !x.automatica)).toBe(true);
    const itau = s.find((x) => x.sponsorId === "itau")!;
    expect(itau.motivo).toBe("Itaú · MASTER — MASTER vai em Pórtico Larg/Cheg (14 de 15 eventos), pelo tipo da peça");
    expect(itau.cota).toBe("MASTER");
    expect(s.find((x) => x.sponsorId === "nike")!.motivo).toBe("Nike · GOLD — GOLD vai em Pórtico Larg/Cheg (9 de 10 eventos), pelo tipo da peça");
  });

  it("tipo EXATO: 'Pórtico' não vale por 'Pórtico Larg/Cheg', nem 'Display 1x2' por 'Display'", () => {
    expect(sugerirVinculos({ tipo: "Pórtico", descricao: "" }, elenco, padroes)).toEqual([]);
    expect(sugerirVinculos({ tipo: "Display 1x2", descricao: "" }, elenco, padroes)).toEqual([]);
    expect(sugerirVinculos({ tipo: "Displays", descricao: "" }, elenco, padroes).map((x) => x.sponsorId)).toEqual(["itau"]);
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
    expect(s[0].cotaDoHistorico).toBe(true);
    expect(s[0].motivo).toBe("Itaú · MASTER (cota pelo histórico dele; não está no evento) — MASTER vai em Display (12 de 14 eventos), pelo tipo da peça");
  });

  it("regra MANUAL de cota (Configurar cotas) continua valendo, com o casamento daquela tela", () => {
    const s = sugerirVinculos(
      { tipo: "Palco Lateral", descricao: "" },
      [{ ...NIKE, cota: "Gold" }],
      PADROES_VAZIOS,
      [{ cota: "GOLD", tipos: ["Palco"], origem: "evento" }],
    );
    expect(s).toEqual([expect.objectContaining({ sponsorId: "nike", regra: "cota", cota: "GOLD", motivo: "Nike · GOLD — Configurar cotas do evento: GOLD vai em Palco" })]);
    expect(sugerirVinculos({ tipo: "Palco Lateral", descricao: "" }, [{ ...NIKE, cota: "GOLD" }], PADROES_VAZIOS,
      [{ cota: "GOLD", tipos: ["Palcos"], origem: "geral" }])[0].motivo).toBe("Nike · GOLD — Configurar cotas: GOLD vai em Palcos");
  });

  it("sem elenco, nada", () => {
    expect(sugerirVinculos({ tipo: "Rolo", descricao: "Rolo Nike" }, [], padroes)).toEqual([]);
  });
});

describe("o aprendizado cota × tipo da peça (dados sintéticos)", () => {
  // 4 eventos, 4 patrocinadores cada; A é MASTER e B é GOLD em todos.
  const eventos = ["e1", "e2", "e3", "e4"];
  const elencos: ElencoDoHistorico[] = eventos.flatMap((e) => [
    { eventId: e, sponsorId: "A", cota: "MASTER" },
    { eventId: e, sponsorId: "B", cota: "gold" },
    { eventId: e, sponsorId: "C", cota: null },
    { eventId: e, sponsorId: "D", cota: null },
  ]);
  const pecas: PecaDoHistorico[] = eventos.flatMap((e) => [
    // pórtico larg/cheg: MASTER e GOLD sempre (com grafias diferentes)
    { eventId: e, tipo: "Pórtico Larg/Cheg", patrocinadores: ["A", "B", "C"] },
    { eventId: e, tipo: "Pórticos larg / cheg", patrocinadores: ["A", "B", "D"] },
    // "Pórtico" sozinho: só o C — não herda nada do Larg/Cheg
    { eventId: e, tipo: "Pórtico", patrocinadores: ["C"] },
    // display só do MASTER
    { eventId: e, tipo: "Display", patrocinadores: ["A"] },
    { eventId: e, tipo: "display", patrocinadores: ["A"] },
    // rolos: um por patrocinador
    ...["A", "B", "C", "D"].map((s) => ({ eventId: e, tipo: "Rolo", patrocinadores: [s] })),
  ]);
  const p = aprenderPadroes(pecas, elencos);

  it("aprende pelo tipo exato, juntando as grafias", () => {
    expect(p.cotaPorTipo["MASTER|portico larg cheg"]).toEqual(expect.objectContaining({ eventos: 4, comVinculo: 4, taxa: 1, padrao: true }));
    expect(p.cotaPorTipo["GOLD|portico larg cheg"]).toEqual(expect.objectContaining({ taxa: 1, padrao: true }));
    expect(p.cotaPorTipo["MASTER|portico larg cheg"].rotulo).toBe("Pórtico Larg/Cheg");
    expect(p.cotaPorTipo["MASTER|display"]).toEqual(expect.objectContaining({ eventos: 4, comVinculo: 4, taxa: 1, padrao: true, rotulo: "Display" }));
  });

  it("sem cair no grupo: 'Pórtico' tem a sua própria conta (e MASTER não vai nele)", () => {
    expect(p.cotaPorTipo["MASTER|portico"]).toEqual(expect.objectContaining({ taxa: 0, padrao: false }));
    expect(p.cotaPorTipo["MASTER|rolo"]).toEqual(expect.objectContaining({ eventos: 4, padrao: false }));
    expect(p.cotaPorTipo["GOLD|display"]).toEqual(expect.objectContaining({ taxa: 0, padrao: false }));
    // patrocinador sem cota no evento não ensina cota
    expect(Object.keys(p.cotaPorTipo).every((k) => /^(MASTER|GOLD)\|/.test(k))).toBe(true);
  });

  it("menos de 3 eventos não ensina", () => {
    const pouco = aprenderPadroes(pecas.filter((x) => x.eventId !== "e3" && x.eventId !== "e4"), elencos);
    expect(pouco.cotaPorTipo["MASTER|display"]).toBeUndefined();
  });

  it("o motor com o aprendido: o pórtico larg/cheg leva MASTER e GOLD; o 'Pórtico' não leva ninguém", () => {
    const elenco: PatrocinadorDoEvento[] = [{ id: "A", nome: "Alfa", cota: "MASTER" }, { id: "B", nome: "Beta", cota: "GOLD" }, { id: "C", nome: "Gama" }];
    expect(sugerirVinculos({ tipo: "Pórtico larg/cheg", descricao: "" }, elenco, p).map((s) => s.sponsorId).sort()).toEqual(["A", "B"]);
    expect(sugerirVinculos({ tipo: "Pórtico", descricao: "" }, elenco, p)).toEqual([]);
    expect(sugerirVinculos({ tipo: "Display", descricao: "" }, elenco, p).map((s) => s.sponsorId)).toEqual(["A"]);
  });
});

describe("o NOME da peça (dono: 'pegar o NOME da peça e fazer a análise de cota por peça')", () => {
  const SP = ["BB Seguros", "Itaú"];
  it("tira patrocinador, numeração, medida, lado e preposição; dimensão sozinha é o nome", () => {
    expect(chaveDoNome("2x1 BB Seguros", SP)).toBe("2x1");
    expect(chaveDoNome("Testeira BB Seguros", SP)).toBe("testeira");
    expect(chaveDoNome("Quadro fotos 1", SP)).toBe(chaveDoNome("Quadro de Fotos 6", SP));
    expect(chaveDoNome("Quadro de Fotos 6", SP)).toBe("quadro foto");
    expect(chaveDoNome("Painel 9x6", SP)).toBe("painel");
    expect(chaveDoNome("Placa 4,0 x 3,0 Itaú", SP)).toBe("placa");
    expect(chaveDoNome("Lateral dir Pórtico Largada", SP)).toBe("lateral portico largada");
    expect(chaveDoNome("Lateral esq Pórtico Largada", SP)).toBe("lateral portico largada");
    expect(chaveDoNome("Testeira Pórtico Chegada", SP)).toBe("testeira portico chegada");
    expect(chaveDoNome("Aplique1", SP)).toBe("aplique");
    expect(chaveDoNome("Aplique2", SP)).toBe("aplique");
    expect(chaveDoNome("Lado A - Backdrop", SP)).toBe("backdrop");
    expect(chaveDoNome("", SP)).toBe("");
  });
  it("o legível guarda acento, caixa e a preposição do meio", () => {
    expect(lerNomeDaPeca("Quadro de Fotos 6", SP).legivel).toBe("Quadro de Fotos");
    expect(lerNomeDaPeca("Lateral dir Pórtico Largada", SP).legivel).toBe("Lateral Pórtico Largada");
  });

  it("aprende por nome (sem o patrocinador no nome) e o motor usa o nome antes do tipo", () => {
    const eventos = ["e1", "e2", "e3"];
    const elencos: ElencoDoHistorico[] = eventos.flatMap((e) => [
      { eventId: e, sponsorId: "A", cota: "MASTER", nome: "Itaú" },
      { eventId: e, sponsorId: "B", cota: "GOLD", nome: "BB Seguros" },
    ]);
    const pecas: PecaDoHistorico[] = eventos.flatMap((e, i) => [
      // mesmo TIPO "Testeira", nomes diferentes: a do pórtico leva MASTER e GOLD…
      { eventId: e, tipo: "Testeira", descricao: `Testeira Pórtico Chegada ${i + 1}`, patrocinadores: ["A", "B"] },
      // …a "Testeira BB Seguros" leva só o GOLD
      { eventId: e, tipo: "Testeira", descricao: "Testeira BB Seguros", patrocinadores: ["B"] },
    ]);
    const p = aprenderPadroes(pecas, elencos);
    expect(p.cotaPorNome["MASTER|testeira portico chegada"]).toEqual(expect.objectContaining({ eventos: 3, comVinculo: 3, taxa: 1, padrao: true, rotulo: "Testeira Pórtico Chegada" }));
    expect(p.cotaPorNome["MASTER|testeira"]).toEqual(expect.objectContaining({ taxa: 0, padrao: false }));
    expect(p.cotaPorNome["GOLD|testeira"]).toEqual(expect.objectContaining({ taxa: 1, padrao: true }));
    // pelo TIPO, as duas se misturam (MASTER em metade): não passa
    expect(p.cotaPorTipo["MASTER|testeira"]).toEqual(expect.objectContaining({ taxa: 0.5, padrao: false }));

    const elenco: PatrocinadorDoEvento[] = [{ id: "A", nome: "Itaú", cota: "MASTER" }, { id: "B", nome: "BB Seguros", cota: "GOLD" }];
    const portico = sugerirVinculos({ tipo: "Testeira", descricao: "Testeira Pórtico Chegada 4" }, elenco, p);
    expect(portico.map((s) => s.sponsorId).sort()).toEqual(["A", "B"]);
    const itau = portico.find((s) => s.sponsorId === "A")!;
    expect(itau.base).toBe("nome");
    expect(itau.motivo).toBe("Itaú · MASTER — MASTER vai em Testeira Pórtico Chegada (3 de 3 eventos)");
    // o nome com histórico DECIDE, mesmo dizendo "não": a testeira do patrocinador não leva o MASTER
    const doBB = sugerirVinculos({ tipo: "Testeira", descricao: "Testeira BB Seguros" }, elenco, p);
    expect(doBB.map((s) => s.sponsorId)).toEqual(["B"]);
  });

  it("sem histórico do NOME, cai no TIPO exato e diz 'pelo tipo da peça' — nunca no grupo", () => {
    const padroes: PadroesDeVinculo = {
      cotaPorNome: {},
      cotaPorTipo: { "MASTER|display": { eventos: 5, comVinculo: 5, taxa: 1, rotulo: "Display", padrao: true } },
    };
    const elenco: PatrocinadorDoEvento[] = [{ id: "A", nome: "Itaú", cota: "MASTER" }];
    const s = sugerirVinculos({ tipo: "Display", descricao: "Display novo da arena" }, elenco, padroes);
    expect(s[0]).toEqual(expect.objectContaining({ base: "tipo", motivo: "Itaú · MASTER — MASTER vai em Display (5 de 5 eventos), pelo tipo da peça" }));
    expect(sugerirVinculos({ tipo: "Display Lateral", descricao: "Display novo" }, elenco, padroes)).toEqual([]);
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
