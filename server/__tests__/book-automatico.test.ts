import { describe, expect, it } from "vitest";
import {
  arranjarNaPagina, circuitoDoEvento, combinarComOficial, compararVersoes, montarPortico, motivoDeFicarFora, planejarBook, preferenciaDaSecao, rotuloDoRodape, secaoDaPeca, type PecaDoBook,
} from "@shared/book-automatico";

const peca = (id: string, tipo: string, descricao: string | null = null, thumb: string | null = "/objects/x"): PecaDoBook => ({ id, displayId: `#${id}`, tipo, descricao, thumb });

describe("de qual seção é a peça", () => {
  it.each([
    ["2x1", "2x1 Esfera", "Gradil"], ["Rolo", "rolo Heineken", "Rolo"], ["STANDS 9X6", "Testeira O2", "Estande"], ["PÓRTICO LARG/CHEG", "Testeira", "Pórtico"],
    ["ARENA", "faixa de chegada", "Faixa"], ["ARENA", "testeira guarda volumes", "Testeiras"], ["Placa de Percurso", "8k", "Placa Km"], ["PLACAS", "placa balcão Santander", "Placas Balcão"],
    ["QUADRO 4X3", "quadro fotos 1", "Quadros de Fotos"], ["PÓTICO BEM VINDO", "Testeira portico até logo", "Testeira Bem-vindo & Até Logo"], ["Windbanner", null, "Windbanner"],
  ])("%s / %s é %s", (t, d, s) => { expect(secaoDaPeca(t, d)).toBe(s); });
  it("tipo desconhecido não vira seção por engano", () => { expect(secaoDaPeca("Cooler", "cooler azul")).toBeNull(); });
  it("backdrop de caixa não vira palco", () => { expect(secaoDaPeca("CAIXA LED", 'BACKDROP "CAIXA"')).toBeNull(); });
});

describe("o que fica fora", () => {
  it.each([["Imantadas", null], ["ARENA", "num pódio 1"], ["Adesivo pódio nº 2", null], ["Testeiras metalon", null], ["Prisma aéreo", null], ["Book Completo", null]])("%s / %s", (t, d) => {
    expect(motivoDeFicarFora(t, d)).not.toBeNull();
  });
  it("peça comum entra", () => { expect(motivoDeFicarFora("Rolo", "rolo Santander")).toBeNull(); });
});

describe("o plano", () => {
  it("segue a ordem do modelo do circuito e usa o nome dele", () => {
    const p = planejarBook([peca("1", "Palco", "backdrop"), peca("2", "Pórtico", "testeira"), peca("3", "2x1", "a")], { rotulos: ["Pórtico", "Backdrop Palco", "Gradil"] });
    expect(p.paginas.map((g) => g.rotulo)).toEqual(["Pórtico", "Backdrop Palco", "Gradil"]);
  });
  it("sem modelo, usa a ordem mais comum", () => {
    const p = planejarBook([peca("3", "2x1", "a"), peca("1", "Palco", "b"), peca("2", "Rolo", "c")]);
    expect(p.paginas.map((g) => g.secao)).toEqual(["Palco", "Gradil", "Rolo"]);
  });
  it("seção opcional só entra se o circuito costuma mostrar", () => {
    const p = planejarBook([peca("1", "Prisma", "acesso"), peca("2", "2x1", "a")], { rotulos: ["Gradil"] });
    expect(p.paginas.map((g) => g.secao)).toEqual(["Gradil"]);
    expect(p.fora[0].motivo).toMatch(/não costuma mostrar/);
  });
  it("área de serviço só entra se o circuito costuma mostrar", () => {
    const entrada = [peca("1", "TENDA 3X3", "Testeira Posto Médico"), peca("2", "STAND", "Testeira DHL")];
    expect(planejarBook(entrada, { rotulos: ["Estande - DHL"] }).paginas.map((g) => g.rotulo)).toEqual(["Estande - DHL"]);
    expect(planejarBook(entrada, { rotulos: ["Estande - DHL", "Estande - Posto Médico"] }).paginas).toHaveLength(2);
  });
  it("não passa do número de páginas de pórtico que o circuito usa: fica o mais completo", () => {
    const entrada = [peca("1", "PORTICO LARG", "Testeira"), peca("2", "PORTICO LARG", "Lateral esquerda"), peca("3", "PORTICO LARG", "Lateral direita"), peca("4", "PORTICO ACESSO", "Testeira")];
    const p = planejarBook(entrada, { rotulos: ["Pórtico"] });
    expect(p.paginas.filter((g) => g.secao === "Pórtico")).toHaveLength(1);
    expect(p.paginas[0].pecas).toHaveLength(3);
    expect(p.fora.map((f) => f.id)).toEqual(["4"]);
  });
  it("quebra-cabeça e moldura são ativação", () => { expect(secaoDaPeca("Quebra cabeça", "fundo")).toBe("Ativação"); expect(secaoDaPeca("INSTAGRAMÁVEL MOLDURA", "x")).toBe("Ativação"); });
  it("cada estande tem sua página, com a testeira em cima", () => {
    const p = planejarBook([peca("1", "STAND", "Backdrop DHL"), peca("2", "STAND", "Testeira DHL"), peca("3", "STAND", "Testeira O2")], { rotulos: ["Estandes - X"] });
    expect(p.paginas.map((g) => g.rotulo)).toEqual(["Estandes - DHL", "Estandes - O2"]);
    expect(p.paginas[0].pecas.map((x) => x.id)).toEqual(["2", "1"]);
  });
  it("placas de km em ordem", () => {
    const p = planejarBook([peca("1", "Placa km", "km 3"), peca("2", "Placa km", "km 10"), peca("3", "Placa km", "km 1")]);
    expect(p.paginas[0].pecas.map((x) => x.descricao)).toEqual(["km 1", "km 3", "km 10"]);
  });
  it("peça sem thumb e sem seção aparecem com o motivo, não somem", () => {
    const p = planejarBook([peca("1", "Rolo", "a", null), peca("2", "Cooler", "b")]);
    expect(p.fora.map((f) => f.motivo)).toEqual(["Peça ainda sem thumb", "Não reconheci a seção desta peça"]);
  });
  it("toda peça aparece no book ou na lista de fora, nenhuma some", () => {
    const entrada = [peca("1", "MANDALA", "Frente - medalha verão"), peca("2", "MANDALA", "Fundo mandala verão"), peca("3", "MANDALA", "Fita verão"), peca("4", "PORTICO", "Testeira frente"), peca("5", "PORTICO", "Testeira verso"), peca("6", "Cooler", "x"), peca("7", "Imantadas", "y"), peca("8", "Rolo", "z", null)];
    const p = planejarBook(entrada);
    const contadas = [...p.paginas.flatMap((g) => g.pecas.map((x) => x.id)), ...p.fora.map((f) => f.id)];
    expect(contadas.sort()).toEqual(entrada.map((x) => x.id).sort());
    expect(new Set(contadas).size).toBe(contadas.length);
  });
  it("montagem feita à mão pede conferência", () => {
    const p = planejarBook([peca("1", "PALCO", "backdrop"), peca("2", "PALCO", "aplique superior")]);
    expect(p.paginas[0].conferir).toMatch(/palco/);
  });
  it("parte que só existe como verso continua no pórtico", () => {
    const p = planejarBook([peca("1", "PORTICO", "Testeira verso"), peca("2", "PORTICO", "Lateral esquerda")]);
    expect(p.paginas[0].pecas.map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("o nome do estande continua como foi digitado", () => {
    const p = planejarBook([peca("1", "STAND", "Testeira DHL"), peca("2", "STAND", "Backdrop O2 Prime")], { rotulos: ["Estandes - X"] });
    expect(p.paginas.map((g) => g.rotulo)).toEqual(["Estandes - DHL", "Estandes - O2 Prime"]);
  });
  it("frente e verso do pórtico: uma face só", () => {
    const p = planejarBook([peca("1", "PORTICO", "Testeira frente"), peca("2", "PORTICO", "Testeira verso")]);
    expect(p.paginas[0].pecas.map((x) => x.id)).toEqual(["1"]);
  });
});

describe("as artes na página", () => {
  const W = 758, H = 460;
  const dentro = (pos: Array<{ x: number; y: number; w: number; h: number }>) => { for (const c of pos) { expect(c.x).toBeGreaterThanOrEqual(-0.01); expect(c.y).toBeGreaterThanOrEqual(-0.01); expect(c.x + c.w).toBeLessThanOrEqual(W + 0.01); expect(c.y + c.h).toBeLessThanOrEqual(H + 0.01); } };
  it.each([[1], [2], [3], [7], [19], [30]])("%i artes não saem da página nem se deformam", (n) => {
    const artes = Array.from({ length: n }, (_, i) => ({ w: i % 2 ? 1400 : 539, h: i % 2 ? 163 : 255 }));
    const pos = arranjarNaPagina(artes, W, H);
    expect(pos).toHaveLength(n); dentro(pos);
    for (const c of pos) expect(c.w / c.h).toBeCloseTo(c.arte.w / c.arte.h, 2);
  });
  it("nenhuma arte fica por cima de outra", () => {
    const pos = arranjarNaPagina(Array.from({ length: 12 }, () => ({ w: 539, h: 255 })), W, H);
    for (const a of pos) for (const b of pos) if (a !== b) expect(a.x + a.w <= b.x + 0.01 || b.x + b.w <= a.x + 0.01 || a.y + a.h <= b.y + 0.01 || b.y + b.h <= a.y + 0.01).toBe(true);
  });
  it("arte sozinha não vira cartaz", () => {
    const [c] = arranjarNaPagina([{ w: 1000, h: 1000 }], W, H, 0.5);
    expect(c.w * c.h).toBeLessThanOrEqual(0.5 * W * H + 1);
  });
  it("lista vazia não quebra", () => { expect(arranjarNaPagina([], W, H)).toEqual([]); });
  const linhasDe = (pos: Array<{ y: number }>) => { const m = new Map<number, number>(); for (const c of pos) { const k = Math.round(c.y); m.set(k, (m.get(k) ?? 0) + 1); } return Array.from(m.values()); };
  it("gradil de 7 fica 3+3+1, como nos books", () => {
    expect(linhasDe(arranjarNaPagina(Array.from({ length: 7 }, () => ({ w: 539, h: 255 })), W, H, 0.62, preferenciaDaSecao("Gradil", 7)))).toEqual([3, 3, 1]);
  });
  it("rolo fica em uma coluna", () => {
    expect(linhasDe(arranjarNaPagina(Array.from({ length: 8 }, () => ({ w: 1400, h: 163 })), W, H, 0.62, preferenciaDaSecao("Rolo", 8)))).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
  it("rolo com muitos passa para duas colunas", () => {
    const l = linhasDe(arranjarNaPagina(Array.from({ length: 19 }, () => ({ w: 1400, h: 163 })), W, H, 0.62, preferenciaDaSecao("Rolo", 19)));
    expect(Math.max(...l)).toBe(2);
  });
  it("mandalas ficam 2+2", () => {
    expect(linhasDe(arranjarNaPagina(Array.from({ length: 4 }, () => ({ w: 1000, h: 1400 })), W, H, 0.62, preferenciaDaSecao("Mandalas", 4)))).toEqual([2, 2]);
  });
  it("windbanners ficam lado a lado", () => {
    expect(linhasDe(arranjarNaPagina(Array.from({ length: 5 }, () => ({ w: 268, h: 1400 })), W, H, 0.62, preferenciaDaSecao("Windbanner", 5)))).toEqual([5]);
  });
  it("estande fica empilhado, testeira em cima", () => {
    const pos = arranjarNaPagina([{ w: 1400, h: 241 }, { w: 1400, h: 388 }], W, H, 0.5, preferenciaDaSecao("Estande", 2));
    expect(linhasDe(pos)).toEqual([1, 1]); expect(pos[0].y).toBeLessThan(pos[1].y);
  });
  it("pórtico monta quando tem as três partes", () => {
    const pos = montarPortico([{ w: 1400, h: 260, descricao: "Testeira" }, { w: 532, h: 1400, descricao: "Lateral esquerda" }, { w: 532, h: 1400, descricao: "Lateral direita" }], W, H)!;
    expect(pos).toHaveLength(3); dentro(pos);
    expect(pos[1].x).toBeLessThan(pos[2].x);
  });
  it("pórtico sem lateral cai no arranjo comum", () => { expect(montarPortico([{ w: 1400, h: 260, descricao: "Testeira" }], W, H)).toBeNull(); });
});

describe("o nome da seção no rodapé", () => {
  it("texto único", () => { expect(rotuloDoRodape([{ texto: "Gradil", x: 0.25 }])).toBe("Gradil"); });
  it("nome em vários pedaços continua inteiro", () => { expect(rotuloDoRodape([{ texto: "Estande -", x: 0.25 }, { texto: "DHL", x: 0.33 }])).toBe("Estande - DHL"); });
  it("nome coberto por outro: vale o de cima", () => { expect(rotuloDoRodape([{ texto: "Pórtico", x: 0.25 }, { texto: "Gradil", x: 0.25 }])).toBe("Gradil"); });
  it("só espaço não conta", () => { expect(rotuloDoRodape([{ texto: "  ", x: 0.25 }])).toBe(""); });
});

describe("partir do book oficial", () => {
  const base = (...r: Array<string | null>) => r.map((rotulo, i) => ({ indice: i + 1, rotulo }));
  const pecas = [peca("1", "Palco", "backdrop"), peca("2", "2x1", "Santander"), peca("3", "2x1", "Esfera"), peca("4", "STAND", "Testeira DHL"), peca("5", "STAND", "Backdrop DHL"), peca("6", "STAND", "Testeira O2")];
  const oficial = base("Palco", "Gradil", "Estande - DHL", "Estande - O2", "Retirada de Kit - Octanormes", null);
  const plano = planejarBook(pecas, { rotulos: oficial.map((b) => b.rotulo ?? "").filter(Boolean) });
  const tipos = (f: Array<{ origem: string; rotulo: string }>) => f.map((x) => `${x.origem}:${x.rotulo}`);

  it("nada mudou: o book sai idêntico, página por página", () => {
    const r = combinarComOficial(oficial, plano, () => false);
    expect(r.paginas.every((p) => p.origem === "mantida")).toBe(true);
    expect(r.paginas.map((p) => (p.origem === "mantida" ? p.indiceBase : 0))).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("mudou uma peça do gradil: só o gradil é refeito", () => {
    const r = combinarComOficial(oficial, plano, (p) => p.id === "2");
    expect(tipos(r.paginas)).toEqual(["mantida:Palco", "refeita:Gradil", "mantida:Estande - DHL", "mantida:Estande - O2", "mantida:Retirada de Kit - Octanormes", "mantida:Página sem rótulo"]);
  });
  it("mudou um estande: só a página daquele patrocinador", () => {
    const r = combinarComOficial(oficial, plano, (p) => p.id === "5");
    expect(tipos(r.paginas)[2]).toBe("refeita:Estande - DHL");
    expect(tipos(r.paginas)[3]).toBe("mantida:Estande - O2");
  });
  it("seção sem peça no sistema continua, mesmo com outras mudando", () => {
    const r = combinarComOficial(oficial, plano, (p) => p.id === "1");
    expect(tipos(r.paginas)).toContain("mantida:Retirada de Kit - Octanormes");
  });
  it("patrocinador novo entra na seção certa", () => {
    const p2 = planejarBook([...pecas, peca("7", "STAND", "Testeira Lupo")], { rotulos: ["Palco", "Gradil", "Estande - DHL"] });
    const r = combinarComOficial(base("Palco", "Gradil", "Estande - DHL", "Placas Balcão"), p2, (p) => p.id === "7");
    expect(tipos(r.paginas).filter((t) => /Lupo/.test(t))).toEqual(["nova:Estande - Lupo"]);
    expect(tipos(r.paginas).findIndex((t) => /Lupo/.test(t))).toBeLessThan(tipos(r.paginas).findIndex((t) => /Balcão/.test(t)));
  });
  it("o que a equipe deixou fora do book não volta sozinho", () => {
    const p2 = planejarBook([...pecas, peca("8", "STAND", "Testeira Posto Médico")], { rotulos: ["Palco", "Gradil", "Estande - DHL"] });
    const r = combinarComOficial(base("Palco", "Gradil", "Estande - DHL"), p2, () => false);
    expect(tipos(r.paginas).some((t) => /Posto/.test(t))).toBe(false);
  });
  it("seção com duas páginas é refeita uma vez só", () => {
    const quadros = Array.from({ length: 12 }, (_, i) => peca(`q${i}`, "Rolo", `r${i}`));
    const pl = planejarBook(quadros, { rotulos: ["Rolo"] });
    const r = combinarComOficial(base("Rolo", "Rolo"), pl, (p) => p.id === "q1");
    expect(r.paginas.filter((p) => p.origem === "refeita").length).toBe(pl.paginas.length);
  });
});

describe("modelo e versões", () => {
  it.each([["Night Run - Etapa 2 - Rio de Janeiro", "night run"], ["Night Run Fortaleza", "night run"], ["Circuito das Estações - Verão Curitiba", "circuito das estacoes"], ["Primavera Recife", "primavera"], ["Eco Run Special Edition RJ", "eco run"]])("%s é %s", (n, c) => {
    expect(circuitoDoEvento(n)).toBe(c);
  });
  it("mostra o que mudou entre as versões", () => {
    const m = compararVersoes({ a: { d: "#1", t: "x" }, b: { d: "#2", t: "y" } }, { a: { d: "#1", t: "z" }, c: { d: "#3", t: "k" } });
    expect(m).toEqual({ novas: ["#3"], trocadas: ["#1"], saiu: ["#2"] });
  });
  it("sem mudança, tudo vazio", () => { expect(compararVersoes({ a: { d: "#1", t: "x" } }, { a: { d: "#1", t: "x" } })).toEqual({ novas: [], trocadas: [], saiu: [] }); });
});
