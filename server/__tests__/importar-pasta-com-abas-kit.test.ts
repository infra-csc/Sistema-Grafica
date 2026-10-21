// ─────────────────────────────────────────────────────────────────────────────
// PASTA COM VÁRIAS ABAS: A DO KIT É A DO KIT (dono, 21/10 — "New Balance
// BSB.xlsx": o admin importa, o usuário do Kit "aparece erro de 0
// quantidades").
//
// A pasta tem as abas "KIT" (1ª, com o cabeçalho do Kit e 10 peças), "Arena"
// (31 peças), duas vazias e uma OCULTA cheia de #REF!. O importador ficava com
// a aba de MAIS peças — a Arena — em silêncio: o Kit recebia as peças da Arena
// (que já estavam no evento) e o cabeçalho do Kit se perdia. Aqui a pasta é
// montada no mesmo formato (KIT na sheet1, Arena na sheet2), em miniatura.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import AdmZip from "adm-zip";

vi.mock("../db", () => ({ db: {}, pool: {} }));
import { lerPlanilhaDePecas, lerCabecalhoDoKit, tiposDaPrevia } from "../services/xlsxImport";

type Celula = string | number | null;
type Aba = { nome: string; linhas: Record<number, Celula[]>; oculta?: boolean };

/** Uma pasta .xlsx com workbook.xml e rels de verdade (os nomes das abas). */
function pasta(abas: Aba[]): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const zip = new AdmZip();
  abas.forEach((aba, n) => {
    const rows = Object.entries(aba.linhas).map(([r, l]) => `<row r="${r}">${l.map((v, c) => {
      if (v === null) return "";
      const ref = `${col(c)}${r}`;
      return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
    }).join("")}</row>`).join("");
    zip.addFile(`xl/worksheets/sheet${n + 1}.xml`, Buffer.from(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`));
  });
  zip.addFile("xl/workbook.xml", Buffer.from(`<?xml version="1.0"?><workbook xmlns:r="r"><sheets>${abas.map((a, n) =>
    `<sheet name="${esc(a.nome)}" sheetId="${n + 1}"${a.oculta ? ' state="hidden"' : ""} r:id="rId${n + 1}"/>`).join("")}</sheets></workbook>`));
  zip.addFile("xl/_rels/workbook.xml.rels", Buffer.from(`<?xml version="1.0"?><Relationships>${abas.map((_a, n) =>
    `<Relationship Id="rId${n + 1}" Type="worksheet" Target="worksheets/sheet${n + 1}.xml"/>`).join("")}</Relationships>`));
  return zip.toBuffer();
}

// A aba KIT como veio: cabeçalho do Kit nas linhas 3–11 (sem datas de
// entrega/caminhão), tabela na 15, "compr"/"altura" na 16, AREA/VISUAL/sangria
// e cod_evento com " " (espaço).
const KIT: Aba = {
  nome: "KIT",
  linhas: {
    3: ["NEW BALANCE - BSB"],
    4: ["DADOS DO SOLICITANTE"],
    5: ["Data Solicitação", 46248],
    6: ["Solicitante", "BRUNO FERREIRA"],
    7: ["Departamento", "Kit"],
    9: ["ATUALIZAÇÃO DE LISTA"],
    10: ["Versão do Pedido", "V1"],
    11: ["Data última atualização", " "],
    15: ["cod_evento", "item", "qtde", "AREA ", "VISUAL", "sangria", "material", "acabamento", "medida do arquivo"],
    16: [" ", " ", " ", " ", " ", " ", " ", " ", "compr", "altura"],
    17: [" ", "Placa de octanorme - COMUNICAÇAO DA PROVA", 10, " ", " ", " ", "P.S.", "P.S. Adesivado", 0.98, 0.92],
    18: [" ", "Placa de octanorme - CHECK- IN ", 6, " ", " ", " ", "P.S.", "P.S. Adesivado", 0.98, 0.92],
    19: [" ", "Backdrop Estoque ( COMUNICAÇAO DA PROVA)", 1, " ", " ", " ", "Lona", "ILHOS", 7.43, 2.27],
    20: [" ", "TOTEM RETIRADA DE KIT - (1º PASSO CHECK - IN)", 1, " ", " ", " ", "LONA", "LONA REFILE", 1.9, 0.9],
  },
};
// A aba Arena, com MAIS peças (é ela que o parser pegava).
const ARENA: Aba = {
  nome: "Arena",
  linhas: {
    3: ["CÓDEVENTO", null, "item", "qtde", "área", "visual", "material", "acabamento", "medida do arquivo", null],
    4: ["NB_BSB", "2X1", "2x1 New Balance", 20, 1.9, 0.9, "Sanett", "Ilhós", 1.9, 0.9],
    5: ["NB_BSB", "2X1", "2x1 Run your way", 20, 1.9, 0.9, "Sanett", "Ilhós", 1.9, 0.9],
    6: ["NB_BSB", "ROLO", "Rolo New Balance", 4, 6, 0.7, "Sanett", "Ilhós", 6, 0.7],
    7: ["NB_BSB", "ROLO", "Rolo Run your way", 4, 6, 0.7, "Sanett", "Ilhós", 6, 0.7],
    8: ["NB_BSB", "PALCO", "backdrop", 1, 8, 4, "Lona", "Refile", 8.3, 4.3],
  },
};
const VAZIA: Aba = { nome: "Faixas de transito", linhas: {} };
// Oculta, com cara de tabela e mais linhas que todas: não pode ser a fonte.
const OCULTA: Aba = {
  nome: "memória-tapeçaria", oculta: true,
  linhas: Object.fromEntries([[1, ["item", "qtde"]], ...Array.from({ length: 12 }, (_v, i) => [i + 2, [`#REF! ${i}`, 1]])]),
};
const NEW_BALANCE = pasta([KIT, ARENA, VAZIA, OCULTA]);

const ler = (opcoes: Parameters<typeof lerPlanilhaDePecas>[2] = {}) => {
  const r = lerPlanilhaDePecas(NEW_BALANCE, () => [], opcoes);
  if (!r.ok) throw new Error(r.erro);
  return r;
};

describe("New Balance BSB: a importação do Kit lê a aba KIT", () => {
  it("para o Kit: as peças da aba KIT, com a quantidade, o material e a medida do arquivo", () => {
    const r = ler({ paraOKit: true });
    expect(r.aba).toBe("KIT");
    expect(r.items.map((p) => [p.description, p.quantity])).toEqual([
      ["Placa de octanorme - COMUNICAÇAO DA PROVA", 10],
      ["Placa de octanorme - CHECK- IN", 6],
      ["Backdrop Estoque ( COMUNICAÇAO DA PROVA)", 1],
      ["TOTEM RETIRADA DE KIT - (1º PASSO CHECK - IN)", 1],
    ]);
    const [placa, , backdrop] = r.items;
    expect([placa.material, placa.finish]).toEqual(["P.S.", "P.S. Adesivado"]);
    expect([placa.fileWidth, placa.fileHeight]).toEqual([0.98, 0.92]);
    // AREA/VISUAL em branco: o visual é a própria medida do arquivo.
    expect([placa.visualWidth, placa.visualHeight]).toEqual([0.98, 0.92]);
    expect(placa.calculatedM2).toBeCloseTo(10 * 0.98 * 0.92, 4);
    expect([backdrop.fileWidth, backdrop.fileHeight, backdrop.finish]).toEqual([7.43, 2.27, "ILHOS"]);
  });

  it("sem pedir o Kit (admin): a aba de mais peças, e a lista das abas para escolher — a oculta e a vazia ficam fora", () => {
    const r = ler();
    expect(r.aba).toBe("Arena");
    expect(r.items).toHaveLength(5);
    expect(r.abas.map((a) => [a.nome, a.pecas, a.doKit])).toEqual([["KIT", 4, true], ["Arena", 5, false]]);
    expect(r.abaDoKit).toMatchObject({ nome: "KIT", pecas: 4 });
  });

  it("a aba escolhida na tela vale sobre as duas regras", () => {
    expect(ler({ aba: "KIT" }).aba).toBe("KIT");
    expect(ler({ paraOKit: true, aba: "Arena" }).aba).toBe("Arena");
    // Aba que não existe (ou sem peças) cai na regra de sempre.
    expect(ler({ aba: "Faixas de transito" }).aba).toBe("Arena");
  });

  it("a aba do Kit também é reconhecida pelo cabeçalho do Kit, sem o nome", () => {
    const r = lerPlanilhaDePecas(pasta([{ ...KIT, nome: "Pedido BSB" }, ARENA]), () => [], { paraOKit: true });
    expect(r.ok && r.aba).toBe("Pedido BSB");
  });

  it("o cabeçalho da aba KIT preenche a remessa mesmo sem as datas (a entrega fica para a pessoa)", () => {
    const r = ler({ paraOKit: true });
    expect(lerCabecalhoDoKit(NEW_BALANCE, { abaDoKit: r.arquivoDaAba })).toEqual({
      evento: null, versao: "V1", solicitante: "BRUNO FERREIRA", departamento: "Kit",
      dataSolicitacao: "2026-08-14", entregaMaterial: null, dataEvento: null, cargaCaminhao: null, saidaCaminhao: null,
    });
    // Lendo a Arena, o cabeçalho sem datas não vale: a tela não sugere Kit para peças da Arena.
    expect(lerCabecalhoDoKit(NEW_BALANCE)).toBeNull();
  });

  it("o tipo sai do texto do item: o Modelo que o abre; sem catálogo, o texto antes do separador", () => {
    const r = ler({ paraOKit: true });
    const modelos = [
      { id: "m1", name: "Placa de octanorme", group: "Placas" },
      { id: "m2", name: "Backdrop", group: null },
      { id: "m3", name: "Totem", group: null },
    ];
    expect(tiposDaPrevia(r.items, { modelos }).map((p) => p.type))
      .toEqual(["Placa de octanorme", "Placa de octanorme", "Backdrop", "Totem"]);
    expect(tiposDaPrevia(r.items, { modelos: [] }, { recortarSemCatalogo: true }).map((p) => p.type))
      .toEqual(["Placa de octanorme", "Placa de octanorme", "Backdrop Estoque", "TOTEM RETIRADA DE KIT"]);
    // Com tipo de verdade (grupo na planilha), nada muda.
    const arena = ler().items;
    expect(tiposDaPrevia(arena, { modelos }).map((p) => p.type)).toEqual(arena.map((p) => p.type));
  });
});

describe("'Nenhum item válido' diz onde", () => {
  it("quando nenhuma aba tem peça com quantidade, a mensagem cita a aba e as linhas", () => {
    const semQtd: Aba = { nome: "KIT", linhas: { 1: ["item", "qtde"], 2: ["Placa", null], 3: ["Totem", 0] } };
    const r = lerPlanilhaDePecas(pasta([semQtd, VAZIA]), () => []);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.erro).toBe(
      'Nenhum item válido encontrado. Verifique se há linhas com quantidade > 0. Na aba "KIT", 2 linhas ficaram sem quantidade válida (linha 2: sem quantidade; linha 3: quantidade mínima é 1 (veio "0")).',
    );
  });

  it("aba com peças em outra aba: não há erro — a outra aba é lida", () => {
    const semQtd: Aba = { nome: "KIT", linhas: { 1: ["item", "qtde"], 2: ["Placa", null] } };
    const r = lerPlanilhaDePecas(pasta([semQtd, ARENA]), () => [], { paraOKit: true });
    expect(r.ok && r.aba).toBe("Arena");
  });
});
