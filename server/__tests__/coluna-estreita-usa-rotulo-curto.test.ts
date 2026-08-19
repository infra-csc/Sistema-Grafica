// ─────────────────────────────────────────────────────────────────────────────
// COLUNA ESTREITA PEDE O RÓTULO CURTO.
//
// O defeito: a coluna "PEÇA" da Gestão de Prazos tem 104px de largura fixa e
// mostrava o rótulo LONGO do status embaixo do código. O resultado, medido em
// produção, era "Aguardando Vi…" e "Aguardando Vin…" — um corte que não
// distingue vinculação de visita nem de visualização, repetido em toda linha
// da lista de peças atrasadas e do drilldown do evento.
//
// `lib/status` mantém DUAS formas para cada status exatamente por isto, e a
// curta ("Ag. Vinculação") já existia sem ninguém usar nestas duas tabelas.
//
// A regra que fica: largura fixa e rótulo longo não convivem. Onde a coluna é
// estreita vai a forma curta, com a longa no `title`.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ler = (rel: string) => readFileSync(path.resolve(__dirname, "../../", rel), "utf8");
const atrasadas = ler("client/src/components/prazos/pecas-atrasadas.tsx");
const drilldown = ler("client/src/components/prazos/event-drilldown.tsx");

describe("as tabelas de coluna fixa usam a forma curta do status", () => {
  it("a lista de peças atrasadas", () => {
    expect(atrasadas).toContain("{getStatusShort(p.item.status)}");
  });

  it("o drilldown do evento", () => {
    expect(drilldown).toContain("{getStatusShort(it.status)}");
  });

  it("e as duas mantêm o rótulo inteiro no title", () => {
    expect(atrasadas).toContain("title={getStatusLabel(p.item.status)}");
    expect(drilldown).toContain("title={getStatusLabel(it.status)}");
  });
});
