// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR PEÇAS: a planilha que o app EXPORTA tem de voltar inteira.
//
// Captura em uso real, planilha de 145 peças: "145 PEÇAS · 145 GRUPOS", cada
// cabeçalho de grupo um ID (#0386, #0387…) com contagem 1. A planilha era a
// exportação do próprio app (services/xlsxExport.ts) sendo reimportada:
//
//     #ID | Tipo | Descrição | Qtd | Material | Acabamento | Medida |
//     Larg. Visual (m) | Alt. Visual (m) | Larg. Arq. (m) | Alt. Arq. (m) |
//     M² Calc. | Reaprov. | Patrocinadores | Observações
//
// O parser fazia três coisas erradas com ela, e as três eram regras gerais —
// valiam para qualquer planilha parecida:
//
//   · "Tipo" era aceito como coluna de ITEM. A descrição virava o tipo e a
//     coluna Descrição de verdade era ignorada.
//   · A coluna à ESQUERDA do item virava grupo sem perguntar o que era.
//     "#0386" não é número → era grupo. Um por linha. 145 grupos.
//   · "Larg. Visual (m)" e irmãs não eram reconhecidas. A coluna VISUAL
//     chegava vazia, e a equipe achava que a planilha não tinha visual.
//
// A leitura virou função pura (`lerPlanilhaDePecas`: Buffer entra, peças saem)
// justamente para este teste existir — antes, reproduzir o caso exigia subir
// o servidor, um evento e um upload.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import AdmZip from "adm-zip";

process.env.DATABASE_URL ??= "postgresql://teste:teste@localhost:5432/teste";

let lerPlanilhaDePecas: typeof import("../services/xlsxImport").lerPlanilhaDePecas;
beforeAll(async () => {
  ({ lerPlanilhaDePecas } = await import("../services/xlsxImport"));
});

/**
 * Um .xlsx mínimo, montado à mão com o MESMO adm-zip que o parser usa para ler.
 * Texto vai como inlineStr (um dos três tipos de célula que o parser entende),
 * número vai como <v>. Sem dependência de escritor de planilha — o ExcelJS do
 * projeto puxa o jszip só em produção, e o teste não pode depender disso.
 */
async function planilha(linhas: (string | number | null)[][]): Promise<Buffer> {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const rows = linhas.map((l, r) => {
    const cells = l.map((v, c) => {
      if (v === null || v === undefined || v === "") return "";
      const ref = `${col(c)}${r + 1}`;
      return typeof v === "number"
        ? `<c r="${ref}"><v>${v}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
    }).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`));
  zip.addFile("xl/workbook.xml", Buffer.from(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Peças" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>`));
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(sheet));
  return zip.toBuffer();
}

const PATROCINADORES = ["Aché", "BB Seguros", "Bradesco"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const matchSponsors = (t: string) => PATROCINADORES.filter(p => norm(t).includes(norm(p)));

const CABECALHO_EXPORTADO = [
  "#ID", "Tipo", "Descrição", "Qtd", "Material", "Acabamento", "Medida",
  "Larg. Visual (m)", "Alt. Visual (m)", "Larg. Arq. (m)", "Alt. Arq. (m)",
  "M² Calc.", "Reaprov.", "Patrocinadores", "Observações",
];

describe("a exportação do próprio app", () => {
  it("agrupa por TIPO, não por ID — 5 peças em 2 tipos dão 2 grupos", async () => {
    const buf = await planilha([
      ["BOTA PRA CORRER SP"],
      ["Data do evento: 16/08/2026   |   Saída do caminhão: 11/08/2026"],
      CABECALHO_EXPORTADO,
      ["#0386", "Quadro Ativação", "Quadro Aché", 1, "Lona", "Ilhós", "2.95 × 2.95", 3, 3, 2.95, 2.95, 8.7, "Não", "Aché", ""],
      ["#0387", "Quadro Ativação", "Quadro BB Seguros", 1, "Lona", "Refile", "4.30 × 3.30", 4, 3, 4.3, 3.3, 14.19, "Não", "BB Seguros", ""],
      ["#0388", "Testeira de tenda", "Testeira BB Seguros", 1, "Lona", "Refile", "5.30 × 0.90", 5, 0.6, 5.3, 0.9, 4.77, "Não", "BB Seguros", ""],
      ["#0389", "Testeira de tenda", "Testeira Bradesco", 2, "Lona", "Refile", "5.30 × 0.90", 5, 0.6, 5.3, 0.9, 9.54, "Sim", "Bradesco", "reforçar"],
      ["#0390", "Testeira de tenda", "Testeira neutra", 1, "Lona", "Refile", "5.30 × 0.90", 5, 0.6, 5.3, 0.9, 4.77, "Não", "", ""],
      ["TOTAL — 5 itens", null, null, 6, null, null, null, null, null, null, null, 42],
    ]);
    const r = lerPlanilhaDePecas(buf, matchSponsors);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(5);
    const tipos = new Set(r.items.map(i => i.type));
    expect([...tipos]).toEqual(["Quadro Ativação", "Testeira de tenda"]);
    // Nenhum grupo é um ID.
    for (const t of tipos) expect(t).not.toMatch(/^#?\d+$/);
  });

  it("a DESCRIÇÃO é a peça; o tipo não vira descrição", async () => {
    const buf = await planilha([
      CABECALHO_EXPORTADO,
      ["#0386", "Quadro Ativação", "Quadro Aché", 1, "Lona", "Ilhós", "2.95 × 2.95", 3, 3, 2.95, 2.95, 8.7, "Não", "Aché", ""],
    ]);
    const r = lerPlanilhaDePecas(buf, matchSponsors);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items[0].description).toBe("Quadro Aché");
    expect(r.items[0].type).toBe("Quadro Ativação");
  });

  it("lê as QUATRO medidas — visual E arquivo, separadas", async () => {
    // "Larg. Visual (m)" / "Alt. Visual (m)" não eram reconhecidas; a coluna
    // VISUAL da tela chegava vazia em todas as linhas.
    const buf = await planilha([
      CABECALHO_EXPORTADO,
      ["#0387", "Quadro Ativação", "Quadro BB Seguros", 1, "Lona", "Refile", "4.30 × 3.30", 4, 3, 4.3, 3.3, 14.19, "Não", "BB Seguros", ""],
    ]);
    const r = lerPlanilhaDePecas(buf, matchSponsors);
    if (!r.ok) throw new Error(r.erro);
    const p = r.items[0];
    expect([p.visualWidth, p.visualHeight]).toEqual([4, 3]);
    expect([p.fileWidth, p.fileHeight]).toEqual([4.3, 3.3]);
    // O m² sai do ARQUIVO, nunca do visual.
    expect(p.calculatedM2).toBeCloseTo(4.3 * 3.3, 3);
    expect(p.measurement).toBe("4.30 × 3.30");
  });

  it("a coluna Patrocinadores preserva os vínculos na volta", async () => {
    const buf = await planilha([
      CABECALHO_EXPORTADO,
      ["#0390", "Testeira de tenda", "Testeira neutra", 1, "Lona", "Refile", "5.30 × 0.90", 5, 0.6, 5.3, 0.9, 4.77, "Não", "Bradesco, Aché", ""],
    ]);
    const r = lerPlanilhaDePecas(buf, matchSponsors);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items[0].suggestedSponsorIds.sort()).toEqual(["Aché", "Bradesco"]);
  });

  it("Reaprov. = Sim marca a peça; o rodapé TOTAL não vira peça", async () => {
    const buf = await planilha([
      CABECALHO_EXPORTADO,
      ["#0389", "Testeira de tenda", "Testeira Bradesco", 2, "Lona", "Refile", "5.30 × 0.90", 5, 0.6, 5.3, 0.9, 9.54, "Sim", "Bradesco", ""],
      ["#0391", "Testeira de tenda", "Testeira parcial", 4, "Lona", "Refile", "5.30 × 0.90", 5, 0.6, 5.3, 0.9, 9.54, "2 un.", "", ""],
      ["TOTAL — 2 itens", null, null, 6],
    ]);
    const r = lerPlanilhaDePecas(buf, matchSponsors);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items).toHaveLength(2);
    expect(r.items[0].reuse).toBe(true);
    // Reaproveitamento PARCIAL ("2 un.") não é peça inteira reaproveitada.
    expect(r.items[1].reuse).toBeUndefined();
  });

  it("o tipo vindo de coluna própria NÃO é normalizado", async () => {
    // "Adesivo Pódio nº 1", "… nº 2", "… nº 3" são TRÊS tipos do app, de
    // propósito. A passada que tira o contador do fim ("TESTEIRA 1" → "TESTEIRA")
    // só vale para grupo IMPLÍCITO, inferido de linha de seção.
    const buf = await planilha([
      CABECALHO_EXPORTADO,
      ["#0400", "Adesivo Pódio nº 1", "Adesivo 1", 1, "Vinil", "Refile", "0.50 × 0.50", 0.5, 0.5, 0.5, 0.5, 0.25, "Não", "", ""],
      ["#0401", "Adesivo Pódio nº 2", "Adesivo 2", 1, "Vinil", "Refile", "0.50 × 0.50", 0.5, 0.5, 0.5, 0.5, 0.25, "Não", "", ""],
      ["#0402", "Totem 2", "Totem lateral", 1, "Lona", "Ilhós", "1.00 × 2.00", 1, 2, 1, 2, 2, "Não", "", ""],
    ]);
    const r = lerPlanilhaDePecas(buf, matchSponsors);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items.map(i => i.type)).toEqual(["Adesivo Pódio nº 1", "Adesivo Pódio nº 2", "Totem 2"]);
  });
});

describe("as planilhas antigas continuam funcionando", () => {
  it("grupo implícito: a linha de seção à esquerda do item vale até a próxima", async () => {
    const buf = await planilha([
      ["Grupo", "Item", "Qtde", "Material", "Acabamento", "Área", "Visual"],
      ["TESTEIRAS", "Testeira Pórtico 1", 2, "Lona", "Ilhós", 6, 0.7],
      [null, "Testeira Pórtico 2", 1, "Lona", "Ilhós", 6, 0.7],
      ["TOTENS", "Totem entrada", 3, "Lona", "Bastão", 1, 2],
    ]);
    const r = lerPlanilhaDePecas(buf, () => []);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items.map(i => i.type)).toEqual(["TESTEIRAS", "TESTEIRAS", "TOTENS"]);
    // Sem medida de arquivo, o arquivo espelha o visual — regra do formulário.
    expect([r.items[0].fileWidth, r.items[0].fileHeight]).toEqual([6, 0.7]);
  });

  it("um ID à esquerda do item NÃO é grupo, mesmo sem cabeçalho de ID", async () => {
    // A regra antiga: "não é número → é grupo". #0386 não é número.
    const buf = await planilha([
      ["Cód.", "Item", "Qtde", "Material"],
      ["#0386", "Quadro Aché", 1, "Lona"],
      ["#0387", "Quadro BB", 1, "Lona"],
    ]);
    const r = lerPlanilhaDePecas(buf, () => []);
    if (!r.ok) throw new Error(r.erro);
    for (const i of r.items) expect(i.type).not.toMatch(/^#\d+$/);
  });

  it("planilha só com Tipo e Qtd (sem descrição): o tipo é a peça", async () => {
    const buf = await planilha([
      ["Tipo", "Qtd"],
      ["Banner 2x1", 3],
    ]);
    const r = lerPlanilhaDePecas(buf, () => []);
    if (!r.ok) throw new Error(r.erro);
    expect(r.items[0].description).toBe("Banner 2x1");
    expect(r.items[0].quantity).toBe(3);
  });

  it("sem cabeçalho reconhecível, diz o que esperava — e traz a amostra", async () => {
    const buf = await planilha([["coisa", "outra"], ["a", "b"]]);
    const r = lerPlanilhaDePecas(buf, () => []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erro).toContain("Cabeçalho não encontrado");
    expect(r.amostra).toContain("coisa | outra");
  });
});

describe("o diálogo: nada cortado, e a barra lateral conta o que a tabela agrupa", () => {
  const dg = readFileSync(path.resolve(__dirname, "../../client/src/components/import-xlsx-dialog.tsx"), "utf8");

  it("uma chave de grupo só, usada pela contagem e pela tabela", () => {
    expect(dg).toContain("export const tipoDoGrupo = ");
    expect(dg).toContain("new Set(allItems.map(tipoDoGrupo)).size");
    expect(dg).toContain("const t = tipoDoGrupo(item);");
  });

  it("a tabela rola dentro do painel: layout fixo com colgroup", () => {
    // Com layout automático, as colunas eram espremidas até a última sair pela
    // borda sem barra de rolagem. A soma das larguras do <colgroup> É a
    // largura da tabela: abaixo dela o painel rola.
    expect(dg).toContain("tableLayout: 'fixed', width: '100%', minWidth: larguraDaTabela");
    expect(dg).toContain("<colgroup>");
    expect(dg).toContain("<div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'auto' }}>");
    expect(dg).toContain("<td colSpan={colunas.length}");
  });

  it("Patrocinador — a coluna mais larga — vem antes de Obs, com largura garantida", () => {
    const cols = dg.slice(dg.indexOf("export function colunasDaImportacao"), dg.indexOf("export type DefeitoImport"));
    expect(cols.indexOf("label: 'Patrocinador'")).toBeLessThan(cols.indexOf("label: 'Obs'"));
    expect(cols).toContain("label: 'Patrocinador', tip: 'Sugestão automática — clique para alterar', w: 250");
    // E a ordem das células da linha acompanha a do cabeçalho.
    const linha = dg.slice(dg.indexOf("export function ImportPreviewRow"), dg.indexOf("interface ImportXlsxDialogProps"));
    expect(linha.indexOf("{/* Sponsor multi-select cell */}")).toBeLessThan(linha.indexOf("{/* Obs cell with reuse toggle */}"));
  });

  it("a coluna VISUAL some quando nenhuma linha tem visual", () => {
    expect(dg).toContain("const mostrarVisual = (importPreviewItems ?? []).some(r => r.visualWidth || r.visualHeight);");
    expect(dg).toContain("if (mostrarVisual) cols.push({ label: 'Visual'");
    expect(dg).toContain("{mostrarVisual && dimCell('visualWidth', 'visualHeight'");
  });

  it("o modal nunca é mais alto que a janela; cartão e botão ficam fixos", () => {
    expect(dg).toContain("maxHeight: 'calc(100vh - 48px)'");
    expect(dg).toContain("display: 'flex', flexDirection: 'column', transition: 'width 0.3s'");
    // Barra lateral em três partes: topo fixo · meio rolável · pé fixo.
    expect(dg).toContain("TOPO FIXO: título e o cartão do arquivo");
    expect(dg).toContain("<div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>");
    expect(dg).toContain("PÉ FIXO: o botão de importar");
  });

  it("o que NÃO mudou: escala do m², triagem, padding da busca, reaproveitar, borda laranja", () => {
    expect(dg).toContain("const m2Color = m2 > 30 ? '#dc2626' : m2 > 10 ? '#ea580c' : m2 > 0 ? '#16a34a' : '#d0cdc9';");
    expect(dg).toContain("data-testid={`triagem-${chave}`}");
    expect(dg).toContain("padding: '10px 44px 10px 16px'");
    expect(dg).toContain("Reaproveitar");
    expect((dg.match(/borderBottom: '2px solid #f97316'/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
