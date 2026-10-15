// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAÇÃO: a medida do ARQUIVO não pode cair no visual (dono, 15/10, GIRL
// POWER SP 2: "o Aplique 2 está subindo com medida errada, diferente do
// arquivo"). A planilha trazia o cabeçalho "medidadoarquivo" (tudo junto),
// mesclado sobre duas colunas (largura | altura) — o parser não reconhecia e
// copiava o visual para o arquivo.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import AdmZip from "adm-zip";

vi.mock("../db", () => ({ db: {}, pool: {} }));
import { lerPlanilhaDePecas } from "../services/xlsxImport";

function planilha(linhas: (string | number | null)[][]): Buffer {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const col = (i: number) => String.fromCharCode(65 + i);
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => {
    if (v === null || v === "") return "";
    const ref = `${col(c)}${r + 1}`;
    return typeof v === "number" ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const zip = new AdmZip();
  zip.addFile("xl/worksheets/sheet1.xml", Buffer.from(`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`));
  return zip.toBuffer();
}

function ler(linhas: (string | number | null)[][]) {
  const r = lerPlanilhaDePecas(planilha(linhas), () => []);
  if (!r.ok) throw new Error(r.erro);
  return r.items;
}

describe("medida do arquivo em duas colunas (formato GIRL POWER SP 2)", () => {
  it('"medidadoarquivo" sem espaços: largura e altura do arquivo vêm das duas colunas', () => {
    const [p] = ler([
      ["CÓDEVENTO", null, "item", "qtde", null, "área", "visual", "material", "acabamento", "medidadoarquivo", null, "m²"],
      ["GPR_SP", "PALCO", "Aplique2", 1, 0, 2.64, 0.98, "lona", "refile", 2.94, 1.28, 3.7632],
    ]);
    expect(p.description).toBe("Aplique2");
    expect([p.visualWidth, p.visualHeight]).toEqual([2.64, 0.98]);
    expect([p.fileWidth, p.fileHeight]).toEqual([2.94, 1.28]);
  });

  it('"medida do arquivo" com espaços continua funcionando', () => {
    const [p] = ler([
      ["item", "qtde", "área", "visual", "medida do arquivo", null],
      ["Aplique1", 1, 3.3, 3.2, 3.6, 3.5],
    ]);
    expect([p.fileWidth, p.fileHeight]).toEqual([3.6, 3.5]);
  });

  it('"Medida" mesclada sobre duas colunas (só número em cada uma) também vira o par do arquivo', () => {
    const [p] = ler([
      ["item", "qtde", "área", "visual", "medida", null],
      ["PalcoBackdrop", 1, 8.48, 0.7, 8.78, 1],
    ]);
    expect([p.fileWidth, p.fileHeight]).toEqual([8.78, 1]);
  });

  it('"Medida" no formato "2,94x1,28" numa coluna só segue valendo', () => {
    const [p] = ler([
      ["item", "qtde", "área", "visual", "medida"],
      ["Aplique2", 1, 2.64, 0.98, "2,94x1,28"],
    ]);
    expect([p.fileWidth, p.fileHeight]).toEqual([2.94, 1.28]);
  });

  it("sem nenhuma medida de arquivo, o arquivo espelha o visual (regra antiga)", () => {
    const [p] = ler([
      ["item", "qtde", "área", "visual"],
      ["2x1 BB", 2, 1.9, 0.9],
    ]);
    expect([p.fileWidth, p.fileHeight]).toEqual([1.9, 0.9]);
  });
});
