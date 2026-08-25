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

  it("o recorte mora no MENU DE STATUS, como valor sintético (25/08)", () => {
    // O chip solto ficava longe de onde se filtra — o dono mandou juntar.
    // "reuso" entra e sai do boolean, nunca do array de status.
    expect(TELA).toContain('set: (v: string[]) => patchFiltros({ status: v.filter((x) => x !== "reuso"), reaproveitamento: v.includes("reuso") })');
    expect(TELA).toContain('{ value: "reuso", label: "♻ Com reaproveitamento", count: comReusoNaLista, pinned: true }');
    expect(TELA).not.toContain('data-testid="chip-reaproveitamento"');
    // a contagem continua do pool sem a própria dimensão
    expect(TELA).toContain("(statsPool as any[]).filter((i: any) => i.isReuse || reusedTotalOf(i) > 0).length");
  });
});
