// A ETAPA PARCIAL NOS CARDS DA GRÁFICA (relato de 24/09: "embalar parcial ou
// conferir parcial não está aparecendo no filtro do card da gráfica").
//
// Com a conferência parcial, uma peça tem trabalho em duas etapas ao mesmo
// tempo. O card é a fila de uma mão (quem confere, quem embala, quem entrega):
// a peça tem de aparecer no card onde parte dela espera, e o clique no card
// tem de abrir a mesma lista que o número conta (`casaEtapa` é a régua única).
import { describe, expect, it } from "vitest";
import { FILTROS_VAZIOS, casaEtapa, itemCasaFiltros, normKey, type ItemGrafica } from "@/lib/grafica-filtros";
import { readFileSync } from "fs";
import { join } from "path";

const ctx = { groupOf: (t: string) => normKey(t), hojeUTC: Date.UTC(2026, 8, 24) };

function peca(over: Partial<ItemGrafica> = {}): ItemGrafica {
  return {
    id: "p1", displayId: "#0001", type: "Banner", description: "", material: "Lona", finish: "Ilhós",
    status: "inProduction", quantity: 10, eventId: "ev1",
    event: { name: "Maratona", truckDepartureDate: new Date(Date.UTC(2026, 9, 1)).toISOString() },
    ...over,
  };
}

const clique = (item: ItemGrafica, etapa: string) =>
  itemCasaFiltros(item, { ...FILTROS_VAZIOS, status: [etapa] }, ctx);

describe("conferir parcial: impressas esperando conferência aparecem em Impresso", () => {
  const meioImpressa = peca({ status: "inProduction", quantityProduced: 6, conferredQty: 0 });

  it("a peça em impressão com 6 de 10 prontas conta em Impresso E em Em Impressão", () => {
    expect(casaEtapa(meioImpressa, "produced")).toBe(true);
    expect(casaEtapa(meioImpressa, "inProduction")).toBe(true);
    expect(clique(meioImpressa, "produced")).toBe(true);
  });

  it("já conferidas as 6 impressas, sai de Impresso (não há o que conferir)", () => {
    expect(casaEtapa(peca({ quantityProduced: 6, conferredQty: 6 }), "produced")).toBe(false);
  });

  it("peça em impressão sem nada impresso não entra em Impresso", () => {
    expect(casaEtapa(peca({ quantityProduced: 0 }), "produced")).toBe(false);
  });
});

describe("embalar parcial: conferidas esperando embalagem aparecem em Conferidos", () => {
  it("Impresso com 4 de 10 conferidas conta em Conferidos (e segue em Impresso)", () => {
    const p = peca({ status: "produced", quantityProduced: 10, conferredQty: 4, embaladaQty: 0 });
    expect(casaEtapa(p, "conferred")).toBe(true);
    expect(casaEtapa(p, "produced")).toBe(true);
    expect(clique(p, "conferred")).toBe(true);
  });

  it("todas as conferidas já embaladas: sai de Conferidos", () => {
    expect(casaEtapa(peca({ status: "produced", quantityProduced: 10, conferredQty: 4, embaladaQty: 4 }), "conferred")).toBe(false);
  });

  it("peça ainda na máquina não embala (regra do servidor) — não promete o que o botão não faz", () => {
    expect(casaEtapa(peca({ status: "inProduction", quantityProduced: 6, conferredQty: 6 }), "conferred")).toBe(false);
  });
});

describe("embalados esperando entrega aparecem em Embalados", () => {
  it("Conferido com 5 de 10 embaladas e nada entregue conta em Embalados", () => {
    const p = peca({ status: "conferred", quantityProduced: 10, conferredQty: 10, embaladaQty: 5, deliveredQty: 0 });
    expect(casaEtapa(p, "packed")).toBe(true);
    expect(casaEtapa(p, "conferred")).toBe(true);
    expect(clique(p, "packed")).toBe(true);
  });

  it("volumes já entregues saem de Embalados", () => {
    expect(casaEtapa(peca({ status: "conferred", conferredQty: 10, embaladaQty: 5, deliveredQty: 5 }), "packed")).toBe(false);
  });
});

describe("fora do fluxo nunca aparece por saldo", () => {
  it.each(["canceled", "archived", "delivered"])("%s não entra em Impresso/Conferidos/Embalados", (status) => {
    const p = peca({ status, quantityProduced: 10, conferredQty: 4, embaladaQty: 2 });
    for (const etapa of ["produced", "conferred", "packed"]) expect(casaEtapa(p, etapa)).toBe(false);
  });

  it("o status continua valendo sozinho (Impresso sem saldo parcial segue em Impresso)", () => {
    expect(casaEtapa(peca({ status: "produced", quantityProduced: 10, conferredQty: 10 }), "produced")).toBe(true);
    expect(casaEtapa(peca({ status: "pronto_para_producao" }), "ready_for_production")).toBe(true);
  });
});

describe("cartão, clique e menu de status usam a MESMA régua", () => {
  const ler = (p: string) => readFileSync(join(import.meta.dirname, "..", "..", p), "utf8");
  it("a contagem dos cards e a faceta de status chamam casaEtapa", () => {
    expect(ler("client/src/components/grafica/hooks/use-fila-da-grafica.ts")).toContain("vals.some((v) => casaEtapa(i, v))");
    expect(ler("client/src/components/grafica/hooks/use-facetas-da-fila.ts")).toContain("casaEtapa(i, s.value)");
  });
});
