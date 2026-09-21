// Dois ajustes do dono (21/09, tarde), pinados para não voltarem:
//  · "não pode entregar antes de embalar" — a peça CONFERIDA só tem Embalar,
//    na tabela cheia, no menu "⋯" da compacta e no cartão do celular;
//  · "no estoque não pode cortar o nome de jeito nenhum".
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const ler = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const ESTOQUE = ler("client/src/pages/estoque.tsx");

describe("estoque não corta nome", () => {
  it("o nome do material quebra linha em vez de reticências", () => {
    expect(ESTOQUE).toContain('whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.3 }}>{g.nome}</span>');
  });
});
