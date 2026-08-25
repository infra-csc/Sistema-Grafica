// ─────────────────────────────────────────────────────────────────────────────
// FILTRO "SÓ REAPROVEITAMENTO" na Gráfica (pedido do dono, 24/08).
//
// O reuso sempre foi VISÍVEL peça a peça (chips verdes, saldos), mas não havia
// como RECORTAR a fila por ele — e "o que sai do estoque em vez da impressora"
// é pergunta de planejamento de impressão, não de linha a linha.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { FILTROS_VAZIOS } from "../../client/src/lib/grafica-filtros";

const LIB = readFileSync(new URL("../../client/src/lib/grafica-filtros.ts", import.meta.url), "utf8");
const TELA = readFileSync(new URL("../../client/src/pages/grafica.tsx", import.meta.url), "utf8");

describe("o recorte de reaproveitamento", () => {
  it("nasce desligado e entra na fonte única de filtros (URL, ativos, empty state)", () => {
    expect(FILTROS_VAZIOS.reaproveitamento).toBe(false);
    expect(LIB).toContain('{ chave: "reaproveitamento", url: "reuso", rotulo: "Só reaproveitamento" },');
    expect(LIB).toContain('reaproveitamento: p.get("reuso") === "1",');
  });

  it("a régua é a MESMA dos chips verdes: total (isReuse) ou parcial (reusedTotalOf)", () => {
    expect(LIB).toContain("if (!ignorarStatus && f.reaproveitamento && !(item.isReuse || reusedTotalOf(item) > 0)) return false;");
  });

  it("o chip conta do pool sem a própria dimensão e some só quando zerado E desligado", () => {
    expect(TELA).toContain('data-testid="chip-reaproveitamento"');
    expect(TELA).toContain("(comReusoNaLista > 0 || filtros.reaproveitamento) && (");
    expect(TELA).toContain("(statsPool as any[]).filter((i: any) => i.isReuse || reusedTotalOf(i) > 0).length");
  });
});
