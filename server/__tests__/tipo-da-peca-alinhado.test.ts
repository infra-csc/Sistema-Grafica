// O TIPO DA PEÇA ALINHADO AO CATÁLOGO (relato do dono, 25/09): "quando eu crio
// a lista por importar a peça ele meio que não cria aquele grupo e quando vou
// criar individual, ele não fica no mesmo grupo".
import { describe, it, expect } from "vitest";
import { alinharTipo, chaveDoTipo } from "@shared/tipo-da-peca";
import { readFileSync } from "fs";
import { join } from "path";

const modelos = [
  { id: "m1", name: "Placa KM", group: "PLACA KM" },
  { id: "m2", name: "Testeira do pórtico", group: "PÓRTICO" },
  { id: "m3", name: "Backdrop 3x2", group: null },
];

describe("alinharTipo", () => {
  it("o tipo da planilha em outra grafia vira o NOME do Modelo, com o vínculo", () => {
    expect(alinharTipo("PLACA KM", { modelos })).toEqual({ type: "Placa KM", standardItemId: "m1" });
    expect(alinharTipo("  testeira do  portico ", { modelos })).toEqual({ type: "Testeira do pórtico", standardItemId: "m2" });
    expect(alinharTipo("BACKDROP 3×2", { modelos })).toEqual({ type: "Backdrop 3x2", standardItemId: "m3" });
  });

  it("sem Modelo, reaproveita a grafia que o EVENTO já usa", () => {
    expect(alinharTipo("wind banner", { modelos, tiposDoEvento: ["Wind Banner"] })).toEqual({ type: "Wind Banner", standardItemId: null });
  });

  it("casa com o NOME de um grupo do catálogo (a peça cai no grupo)", () => {
    expect(alinharTipo("portico", { modelos })).toEqual({ type: "PÓRTICO", standardItemId: null });
  });

  it("nada casou: fica como veio — não se inventa grupo", () => {
    expect(alinharTipo("Faixa de chegada", { modelos, tiposDoEvento: ["Wind Banner"] })).toEqual({ type: "Faixa de chegada", standardItemId: null });
  });

  it("a chave ignora maiúscula, acento, espaço e ×", () => {
    expect(chaveDoTipo(" PÓRTICO  3×2 ")).toBe("portico 3x2");
  });
});

describe("os três caminhos de criar peça usam a mesma régua", () => {
  const ler = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");
  it("importação (prévia e confirmação), formulário e entrada rápida chamam alinharTipo; a lista junta por chaveDoTipo", () => {
    const imp = ler("server/services/xlsxImport.ts");
    expect(imp.match(/alinharTipo\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(imp).toContain("standardItemId: alinhar(item.type).standardItemId");
    expect(ler("client/src/components/detalhe-do-evento/formulario-da-peca.tsx")).toContain("alinharTipo(formData.type");
    expect(ler("client/src/components/bulk-item-entry.tsx")).toContain("alinharTipo(r.type");
    expect(ler("client/src/components/detalhe-do-evento/use-lista-de-pecas.ts")).toContain("chaveDoTipo(item.type)");
  });
});
