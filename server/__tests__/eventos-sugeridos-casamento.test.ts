// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS SUGERIDOS DO UMMENSE — o casamento "já existe no app?", com os NOMES
// REAIS dos dois lados (app: "Night Run BH", "Verão Campinas", "Girl Power
// Brasilia"…; Ummense: "Night Run - Etapa 1 - Belo Horizonte", "Circuito das
// Estações - Campinas"…), o casamento de patrocinadores e a conversão
// TSV → JSON da foto (shared/ummense-foto.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  casarComOApp, casarPatrocinador, cidadesNoNome, indexarPatrocinadores, marcaDoNome, marcasBatem,
  montarEventosSugeridos, patrocinadoresSugeridos, cotaNoApp,
  type EventoDoAppParaCasar, type EventoDoUmmense, type FotoDoUmmense,
} from "@shared/eventos-sugeridos";
import { cidadeDoEvento, fotoDoTsv, idDoEventoDoUmmense, lerPatrocinadores } from "@shared/ummense-foto";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

/** Um evento da foto, como o importador gera. */
function u(nome: string, data: string, tags: string, patr = "", estacao: string | null = null): EventoDoUmmense {
  const t = tags.split("|").filter(Boolean);
  return {
    id: idDoEventoDoUmmense(nome, data), nome, data, estacao, cidade: cidadeDoEvento(nome, t),
    dataNaoConfirmada: t.includes("DATA NÃO CONFIRMADA"), tags: t, patrocinadores: lerPatrocinadores(patr),
  };
}
let seq = 0;
const app = (nome: string, data: string, arquivado = false): EventoDoAppParaCasar => ({ id: `ev-${++seq}`, nome, data, arquivado });

// Os eventos do app (nomes reais, inclusive os espaços duplos).
const APP = [
  app("Night Run BH", "2026-11-14"),
  app("Night Run POA", "2026-11-14"),
  app("Night Run Belém", "2026-10-17"),
  app("Night Run Salvador", "2026-10-17"),
  app("Verão Campinas", "2026-11-15"),
  app("Primavera Campinas", "2026-09-13"),
  app("Girl Power  Brasilia", "2026-11-08"),
  app("Girl Power São Paulo", "2026-10-18"),
  app("Banco do Brasil Brasilia", "2026-10-18"),
  app("Bota pra Correr RJ", "2026-10-18"),
  app("Smart Fit SP", "2026-10-18"),
  app("Circuitinho SP", "2026-10-24"),
  app("Viva Esporte", "2026-10-29"),
  app("Treinão Plié", "2026-10-17"),
  app("S Run Rio Branco", "2026-11-08"),
  app("Desafio Petrobrás Bike RJ", "2026-11-08"),
  app("Eco Run Navegantes", "2026-10-11"),
  app("Meia de Sampa", "2026-11-15"),
  app("Makai - 2026 - João Pessoa", "2026-10-29"),
];
const porNome = (n: string) => APP.find((e) => e.nome === n)!;

const UMMENSE = {
  nrBH: u("Night Run - Etapa 1 - Belo Horizonte", "2026-11-14", "BELO HORIZONTE|CORRIDA|LIE|NIGHT RUN 2"),
  nrPOA: u("Night Run - Etapa 1 - Porto Alegre", "2026-11-14", "PORTO ALEGRE|CORRIDA|LIE|NIGHT RUN 1"),
  nrBelem: u("Night Run - Etapa 1 - Belém", "2026-10-17", "BELÉM|CORRIDA|LIE|NIGHT RUN 2"),
  nrSalvador: u("Night Run - Etapa 1 - Salvador", "2026-10-17", "SALVADOR|CORRIDA|LIE|NIGHT RUN 3"),
  verCampinas: u("Circuito das Estações - Campinas", "2026-11-15", "CAMPINAS|CORRIDA|LIE", "", "VERÃO"),
  gpBrasilia: u("Girl Power - Brasília", "2026-11-08", "BRASÍLIA|CORRIDA|LIE|GIRL POWER RUN 14"),
  gpSP: u("Girl Power São Paulo", "2026-10-18", "SÃO PAULO|CORRIDA|LIE|GIRL POWER RUN"),
  bbBrasilia: u("Circuito Banco do Brasil - Brasília", "2026-10-18", "BRASÍLIA|CORRIDA|ORGANIZAÇÃO"),
  bota: u("Bota Para Correr - Rio de Janeiro", "2026-10-18", "RIO DE JANEIRO|CORRIDA|LIE|BOTA PRA CORRER"),
  smart: u("Smart Fit - São Paulo", "2026-10-18", "SÃO PAULO|CORRIDA|ORGANIZAÇÃO"),
  circuitinho: u("Circuitinho - São Paulo", "2026-10-24", "SÃO PAULO|ESPORTES|LIE|CIRCUITINHO DAS ESTAÇÕES"),
  tecnobank: u("Treinão Running Land - Tecnobank", "2026-10-24", "SÃO PAULO|TREINÃO|RUNNING LAND|ORGANIZAÇÃO"),
  vivaVV: u("Viva Esporte - Vila Velha", "2026-10-29", "VILA VELHA|RECREAÇÃO|LIE|VIVA ESPORTE III"),
  vivaSerra: u("Viva Esporte - Serra", "2026-11-05", "RECREAÇÃO|LIE|VIVA ESPORTE III|SERRA"),
  plie: u("Treinão Running Land - Plié", "2026-10-17", "RIO DE JANEIRO|TREINÃO|ORGANIZAÇÃO|RUNNING LAND"),
  srun: u("Circuito S Run - Rio Branco", "2026-11-08", "RIO BRANCO|CORRIDA|LIE|SRUN"),
  bike: u("Desafio Energia Petrobrás - Passeio Bike - Rio de Janeiro", "2026-11-08", "RIO DE JANEIRO|BIKE|LIE"),
  travessia: u("Desafio Energia Petrobrás - Travessia - Rio de Janeiro", "2026-11-29", "RIO DE JANEIRO|NATAÇÃO|LIE"),
  navegantes: u("Eco Run - Navegantes", "2026-11-22", "NAVEGANTES|CORRIDA|LIE|ECO RUN 1|DATA NÃO CONFIRMADA"),
  meia: u("Meia de Sampa", "2026-11-15", "SÃO PAULO|MEIAS E MARATONAS|LIE"),
  makai: u("Makai - Beach Tenis - João Pessoa", "2026-10-29", "BEACH TENIS|LIE|MAKAI BEACH TENNIS EXPERIENCE II|SEMPRE AMIGOS|JOÃO PESSOA"),
  nrMaceio: u("Night Run - Etapa 1 - Maceió", "2026-11-21", "MACEIÓ|CORRIDA|LIE|NIGHT RUN 6"),
  verBelem: u("Circuito das Estações - Belém", "2026-12-13", "BELÉM|CORRIDA|LIE|DATA NÃO CONFIRMADA", "", "VERÃO"),
};

describe("cidade no nome do app (apelidos e frase mais longa)", () => {
  it("BH, RJ, SP, POA, Sampa e Brasilia sem acento", () => {
    expect(Array.from(cidadesNoNome("Night Run BH"))).toEqual(["belo horizonte"]);
    expect(Array.from(cidadesNoNome("Bota pra Correr RJ"))).toEqual(["rio de janeiro"]);
    expect(Array.from(cidadesNoNome("Smart Fit SP"))).toEqual(["sao paulo"]);
    expect(Array.from(cidadesNoNome("Night Run POA"))).toEqual(["porto alegre"]);
    expect(Array.from(cidadesNoNome("Meia de Sampa"))).toEqual(["sao paulo"]);
    expect(Array.from(cidadesNoNome("Girl Power  Brasilia"))).toEqual(["brasilia"]);
  });
  it('"Rio Branco" não vira Rio de Janeiro; nome sem cidade fica vazio', () => {
    expect(Array.from(cidadesNoNome("S Run Rio Branco"))).toEqual(["rio branco"]);
    expect(cidadesNoNome("Viva Esporte").size).toBe(0);
    expect(cidadesNoNome("Treinão Plié").size).toBe(0);
  });
});

describe("marca", () => {
  it("Circuito das Estações = Verão/Primavera <cidade>, mas estação diferente não bate", () => {
    const um = marcaDoNome("Circuito das Estações - Campinas", "VERÃO");
    expect(marcasBatem(um, marcaDoNome("Verão Campinas"))).toBe(true);
    expect(marcasBatem(um, marcaDoNome("Primavera Campinas"))).toBe(false);
  });
  it("Circuito Banco do Brasil = Banco do Brasil <cidade>; Bota Para = Bota pra; Circuito S Run = S Run", () => {
    expect(marcasBatem(marcaDoNome("Circuito Banco do Brasil - Brasília"), marcaDoNome("Banco do Brasil Brasilia"))).toBe(true);
    expect(marcasBatem(marcaDoNome("Bota Para Correr - Rio de Janeiro"), marcaDoNome("Bota pra Correr RJ"))).toBe(true);
    expect(marcasBatem(marcaDoNome("Circuito S Run - Rio Branco"), marcaDoNome("S Run Rio Branco"))).toBe(true);
  });
  it("Circuitinho não é Circuito das Estações; Night Run não é Girl Power", () => {
    expect(marcasBatem(marcaDoNome("Circuitinho - São Paulo"), marcaDoNome("Verão São Paulo"))).toBe(false);
    expect(marcasBatem(marcaDoNome("Night Run - Etapa 1 - Belém"), marcaDoNome("Girl Power Belém"))).toBe(false);
  });
  it("fora da tabela: uma palavra própria em comum basta", () => {
    expect(marcasBatem(marcaDoNome("Corrida de Vera Cruz"), marcaDoNome("Vera Cruz RJ"))).toBe(true);
    expect(marcasBatem(marcaDoNome("Corrida de Vera Cruz"), marcaDoNome("Corrida da Ponte"))).toBe(false);
  });
});

describe("já existe no app? (nomes reais)", () => {
  const situacoes = casarComOApp(Object.values(UMMENSE), APP);
  const sit = (k: keyof typeof UMMENSE) => situacoes.get(UMMENSE[k].id)!;
  const existe = (k: keyof typeof UMMENSE, nomeNoApp: string) => {
    const s = sit(k);
    expect(s.tipo, `${UMMENSE[k].nome} → ${nomeNoApp}`).toBe("existe");
    expect(s.tipo === "existe" && s.evento.nome).toBe(nomeNoApp);
  };

  it("acha o par com apelido de cidade e nome curto", () => {
    existe("nrBH", "Night Run BH");
    existe("nrPOA", "Night Run POA");
    existe("verCampinas", "Verão Campinas");
    existe("gpBrasilia", "Girl Power  Brasilia");
    existe("bbBrasilia", "Banco do Brasil Brasilia");
    existe("bota", "Bota pra Correr RJ");
    existe("smart", "Smart Fit SP");
    existe("gpSP", "Girl Power São Paulo");
    existe("srun", "S Run Rio Branco");
    existe("bike", "Desafio Petrobrás Bike RJ");
    existe("meia", "Meia de Sampa");
    existe("makai", "Makai - 2026 - João Pessoa");
  });

  it("mesma marca e data na MESMA data, cidades diferentes: cada um com o seu", () => {
    existe("nrBelem", "Night Run Belém");
    existe("nrSalvador", "Night Run Salvador");
  });

  it("nome do app sem cidade casa pela marca e pela data", () => {
    existe("vivaVV", "Viva Esporte");
    existe("plie", "Treinão Plié");
    // Outra Viva Esporte, uma semana depois: não é a mesma.
    expect(sit("vivaSerra").tipo).toBe("novo");
  });

  it("evento do app já reconhecido não vira dúvida para os outros (o fim de semana de SP)", () => {
    // Treinão Tecnobank (SP, 24/10) e Circuitinho SP (24/10): marcas
    // diferentes, mesma cidade e data — mas o Circuitinho SP já é o par do
    // Circuitinho do Ummense.
    expect(sit("tecnobank").tipo).toBe("novo");
    // Travessia RJ (29/11): o Desafio Petrobrás Bike RJ é o par do Passeio Bike.
    expect(sit("travessia").tipo).toBe("novo");
  });

  it("data mudada (mesma marca e cidade, até 45 dias): fica sugerido com aviso", () => {
    const s = sit("navegantes");
    expect(s.tipo).toBe("talvez");
    expect(s.tipo === "talvez" && s.evento.nome).toBe("Eco Run Navegantes");
    expect(s.tipo === "talvez" && s.motivo).toContain("11/10");
  });

  it("novo de verdade, e estação diferente não é o mesmo", () => {
    expect(sit("nrMaceio").tipo).toBe("novo");
    expect(sit("verBelem").tipo).toBe("novo");
  });

  it("na dúvida (mesma cidade e data, marca diferente): sugere com aviso", () => {
    const fuga = u("Corrida da Ponte - Campinas", "2026-11-15", "CAMPINAS|CORRIDA");
    // Verão Campinas é reconhecido só se o Circuito das Estações estiver na lista.
    const s = casarComOApp([fuga], APP).get(fuga.id)!;
    expect(s.tipo).toBe("talvez");
    expect(s.tipo === "talvez" && s.evento.nome).toBe("Verão Campinas");
    expect(s.tipo === "talvez" && s.motivo).toContain("mesma cidade e data");
  });

  it("evento do app ARQUIVADO que bateria: dúvida, não 'já existe'", () => {
    const arq = [app("Night Run Maceió", "2026-11-21", true)];
    const s = casarComOApp([UMMENSE.nrMaceio], arq).get(UMMENSE.nrMaceio.id)!;
    expect(s.tipo).toBe("talvez");
    expect(s.tipo === "talvez" && s.evento.arquivado).toBe(true);
  });

  it("±3 dias: 3 casa, 4 não", () => {
    const a = [app("Night Run Maceió", "2026-11-24")];
    expect(casarComOApp([UMMENSE.nrMaceio], a).get(UMMENSE.nrMaceio.id)!.tipo).toBe("existe");
    const b = [app("Night Run Maceió", "2026-11-25")];
    // 4 dias: deixa de ser "o mesmo" e vira dúvida (data mudada).
    expect(casarComOApp([UMMENSE.nrMaceio], b).get(UMMENSE.nrMaceio.id)!.tipo).toBe("talvez");
  });
});

describe("patrocinadores: casamento com o cadastro", () => {
  const CADASTRO = [
    { id: "dec", nome: "Decathlon" },
    { id: "hyu", nome: "Hyundai" },
    { id: "getnet", nome: "Get Net" },
    { id: "sula1", nome: "SulAmerica", criadoEm: "2025-01-01T00:00:00Z" },
    { id: "sula2", nome: "Sulamerica", criadoEm: "2024-01-01T00:00:00Z" },
    { id: "porto", nome: "Porto" },
    { id: "hein", nome: "Heineken" },
    { id: "esfera", nome: "Esfera" },
    { id: "dsp", nome: "Drogaria SP" },
    { id: "hdi", nome: "HDI" },
    { id: "fleury", nome: "Fleury" },
    { id: "rumo", nome: "Rumo" },
    { id: "zurich-velho", nome: "Zurich", arquivado: true },
    { id: "colgate-velho", nome: "Colgate", arquivado: true },
    { id: "colgate", nome: "Colgate" },
  ];
  const idx = indexarPatrocinadores(CADASTRO);
  const id = (nome: string) => casarPatrocinador(nome, idx)?.id ?? null;

  it("grafias do Decathlon e do B. Hyundai", () => {
    for (const n of ["Decathlon", "Decatlhon", "Decathon", "Decahtlon", "DECATHLON"]) expect(id(n), n).toBe("dec");
    for (const n of ["B.Hyndai", "B. Hyundai", "B.Hyundai", "B. HYNDAI"]) expect(id(n), n).toBe("hyu");
  });
  it("acento, caixa e espaço; duplicado no cadastro: grafia idêntica vence", () => {
    expect(id("Getnet")).toBe("getnet");
    expect(id("GETNET")).toBe("getnet");
    expect(id("SulAmérica")).toBe("sula1");
    expect(id("SulAmérica/Paraná Clinicas")).toBe("sula1");
  });
  it("sufixo que não muda a empresa; Esfera Energia NÃO é a Esfera", () => {
    expect(id("Porto Saúde")).toBe("porto");
    expect(id("Heineken 0.0")).toBe("hein");
    expect(id("HDI SEGUROS")).toBe("hdi");
    expect(id("Drogaria São Paulo")).toBe("dsp");
    expect(id("Fleury (A+ Medicina Diagnóstica)")).toBe("fleury");
    expect(id("Rumo + Instituto")).toBe("rumo");
    expect(id("Esfera Energia")).toBeNull();
    expect(id("O2 PRIME")).toBeNull();
  });
  it("arquivado: marca como arquivado; havendo um ativo de mesmo nome, vence o ativo", () => {
    expect(casarPatrocinador("Zurich", idx)).toMatchObject({ id: "zurich-velho", arquivado: true });
    expect(id("Colgate")).toBe("colgate");
  });
  it("na sugestão: cota do app, arquivado sinalizado e dois nomes do mesmo patrocinador numa linha só", () => {
    const lista = patrocinadoresSugeridos(lerPatrocinadores("Decatlhon:APOIO|Zurich:SILVER|O2 PRIME:O2 PRIME|Porto Saúde:APOIO|Porto:MASTER"), idx);
    expect(lista).toEqual([
      { nomeNoUmmense: "Decatlhon", cota: "APOIO", cotaNoApp: "APOIO", sponsorId: "dec", nomeNoApp: "Decathlon", arquivado: false },
      { nomeNoUmmense: "Zurich", cota: "SILVER", cotaNoApp: "SILVER", sponsorId: "zurich-velho", nomeNoApp: "Zurich", arquivado: true },
      { nomeNoUmmense: "O2 PRIME", cota: "O2 PRIME", cotaNoApp: null, sponsorId: null, nomeNoApp: null, arquivado: false },
      { nomeNoUmmense: "Porto Saúde / Porto", cota: "MASTER", cotaNoApp: "MASTER", sponsorId: "porto", nomeNoApp: "Porto", arquivado: false },
    ]);
  });
  it("cota: MÍDIA vira MIDIA; O2 PRIME e EXPO não existem no formulário", () => {
    expect(cotaNoApp("MÍDIA")).toBe("MIDIA");
    expect(cotaNoApp("gold")).toBe("GOLD");
    expect(cotaNoApp("O2 PRIME")).toBeNull();
    expect(cotaNoApp("EXPO")).toBeNull();
  });
});

describe("TSV → foto (scripts/importar-ummense.mjs)", () => {
  const TSV = [
    "nome\tdata\testacao\ttags\tpatrocinadores",
    "Night Run - Etapa 1 - São Luis\t2026-10-24\t\tSÃO LUIS|CORRIDA|LIE|EDUCARE|NIGHT RUN 4\tSantander:MASTER|Zurich:SILVER",
    "Treinão Running Land - Plié\t2026-10-17\t\tRIO DE JANEIRO|TREINÃO|ORGANIZAÇÃO|RUNNING LAND",
    "Meia de Sampa\t2026-11-15\t\tSÃO PAULO|MEIAS E MARATONAS|LIE\tLupo Sport:SILVER",
    "Desafio Energia Petrobrás - Travessia - Búzios\t2026-12-20\t\tNATAÇÃO|LIE|BÚZIOS|DATA NÃO CONFIRMADA\tPetrobrás:MASTER",
    "Bravus Speed - Etapa 2\t2026-11-29\t\tSÃO PAULO|SPEED 2|LIE\t",
    "Prova Nova - Xique-Xique\t2026-12-01\t\tXIQUE-XIQUE|CORRIDA\t",
    "Night Run - Etapa 2 - São Paulo\t2026-11-28\t\tSÃO PAULO|CORRIDA|BASE\tSantander:MASTER|Construjá | FERJÁ:SILVER|Powerade:SILVER",
    "Circuito das Estações - Campinas\t2026-11-15\tVERÃO\tCAMPINAS|CORRIDA\tGetnet:SILVER",
  ].join("\r\n");
  const foto = fotoDoTsv(TSV, "2026-10-15");
  const ev = (nome: string) => foto.eventos.find((e) => e.nome === nome)!;

  it("cabeçalho da foto, ordem por data e id estável", () => {
    expect(foto.fotoDe).toBe("2026-10-15");
    expect(foto.origem).toContain("Ummense");
    expect(foto.eventos.map((e) => e.data)).toEqual([...foto.eventos.map((e) => e.data)].sort());
    expect(ev("Meia de Sampa").id).toBe("meia-de-sampa-2026-11-15");
  });
  it("cidade: trecho depois do último ' - ', senão a tag que é cidade", () => {
    expect(ev("Night Run - Etapa 1 - São Luis").cidade).toBe("São Luís");
    expect(ev("Treinão Running Land - Plié").cidade).toBe("Rio de Janeiro");
    expect(ev("Meia de Sampa").cidade).toBe("São Paulo");
    expect(ev("Desafio Energia Petrobrás - Travessia - Búzios").cidade).toBe("Búzios");
    expect(ev("Bravus Speed - Etapa 2").cidade).toBe("São Paulo");
    // Cidade fora da lista, confirmada por uma tag igual ao trecho do nome.
    expect(ev("Prova Nova - Xique-Xique").cidade).toBe("Xique-Xique");
  });
  it("estação, data não confirmada, tags e patrocinadores (inclusive com '|' no nome)", () => {
    expect(ev("Circuito das Estações - Campinas").estacao).toBe("VERÃO");
    expect(ev("Desafio Energia Petrobrás - Travessia - Búzios").dataNaoConfirmada).toBe(true);
    expect(ev("Meia de Sampa").dataNaoConfirmada).toBe(false);
    expect(ev("Treinão Running Land - Plié").patrocinadores).toEqual([]);
    expect(ev("Night Run - Etapa 2 - São Paulo").patrocinadores).toEqual([
      { nome: "Santander", cota: "MASTER" },
      { nome: "Construjá | FERJÁ", cota: "SILVER" },
      { nome: "Powerade", cota: "SILVER" },
    ]);
  });
  it("data fora do formato: erro com a linha", () => {
    expect(() => fotoDoTsv("nome\tdata\testacao\ttags\tpatrocinadores\nX\t15/10/2026\t\t\t", "2026-10-15")).toThrow(/Linha 2/);
  });
  it("a foto versionada no repositório (15/10) tem a forma esperada", () => {
    const real = JSON.parse(readFileSync(path.join(RAIZ, "shared", "dados", "ummense-eventos.json"), "utf8")) as FotoDoUmmense;
    expect(real.fotoDe).toBe("2026-10-15");
    expect(real.origem).toBe("Ummense — Calendário 2026 + Atribuir Entregas");
    expect(real.eventos).toHaveLength(78);
    expect(real.eventos.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.data) && e.id && e.cidade)).toBe(true);
    expect(real.eventos[0].data).toBe("2026-10-17");
    expect(real.eventos[real.eventos.length - 1].data).toBe("2026-12-31");
  });
});

describe("montarEventosSugeridos", () => {
  const foto: FotoDoUmmense = {
    fotoDe: "2026-10-15", origem: "teste",
    eventos: [UMMENSE.nrBelem, UMMENSE.nrMaceio, UMMENSE.navegantes, UMMENSE.verBelem,
      u("Prova Passada - Recife", "2026-10-01", "RECIFE|CORRIDA")],
  };
  it("só data ≥ hoje, sem os que já existem, em ordem de data, com fotoDe", () => {
    const r = montarEventosSugeridos(foto, APP, [], "2026-10-17");
    expect(r.fotoDe).toBe("2026-10-15");
    expect(r.futurosNaFoto).toBe(4);
    expect(r.jaNoApp).toBe(1); // Night Run Belém
    expect(r.sugestoes.map((s) => s.nome)).toEqual([
      "Night Run - Etapa 1 - Maceió", "Eco Run - Navegantes", "Circuito das Estações - Belém",
    ]);
    expect(r.sugestoes[1].podeJaExistir).toMatchObject({ id: porNome("Eco Run Navegantes").id, nome: "Eco Run Navegantes", arquivado: false });
    expect(r.sugestoes[0].podeJaExistir).toBeNull();
  });
  it("sem foto: resposta vazia, sem quebrar", () => {
    expect(montarEventosSugeridos(null, APP, [], "2026-10-17")).toMatchObject({ fotoDe: null, sugestoes: [] });
  });
});

describe("LIE, ICMS RJ e LPIE = Ministério (dono, 15/10)", () => {
  it("evento com a etiqueta LIE ganha o Ministério com a cota MINISTERIO", async () => {
    const { comMinisterioDaLei } = await import("@shared/eventos-sugeridos");
    const lista = comMinisterioDaLei({ tags: ["MANAUS", "CORRIDA", "LIE"], patrocinadores: [{ nome: "Honda", cota: "GOLD" }] });
    expect(lista).toEqual([{ nome: "Honda", cota: "GOLD" }, { nome: "Ministério", cota: "MINISTERIO" }]);
  });
  it("ICMS RJ e LPIE também; ORGANIZAÇÃO não; com o Ministério já na lista não duplica", async () => {
    const { comMinisterioDaLei } = await import("@shared/eventos-sugeridos");
    expect(comMinisterioDaLei({ tags: ["RIO DE JANEIRO", "ICMS RJ"], patrocinadores: [] })).toEqual([{ nome: "Ministério", cota: "MINISTERIO" }]);
    expect(comMinisterioDaLei({ tags: ["LPIE"], patrocinadores: [] })).toEqual([{ nome: "Ministério", cota: "MINISTERIO" }]);
    expect(comMinisterioDaLei({ tags: ["ORGANIZAÇÃO", "BASE"], patrocinadores: [] })).toEqual([]);
    const ja = [{ nome: "MINISTÉRIO", cota: null }];
    expect(comMinisterioDaLei({ tags: ["LIE"], patrocinadores: ja })).toBe(ja);
  });
});
