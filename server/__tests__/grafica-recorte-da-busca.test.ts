// ─────────────────────────────────────────────────────────────────────────────
// A BUSCA UMA VEZ SÓ (Gráfica, 17/09) — a identidade que sustenta a otimização.
//
// A tela casa o texto da busca UMA vez e roda as outras dez passadas do recorte
// sobre o que sobrou, com o recorte sem o texto (components/grafica/
// recorte-da-busca.ts). Isso só é seguro se, para QUALQUER peça, recorte e
// opção de faceta:
//
//   casa(i, f, o) === casa(i, soDaBusca(f.busca), {ignorarStatus}) && casa(i, semABusca(f), o)
//
// Este teste confere a identidade peça a peça numa grade de recortes. Se
// `itemCasaFiltros` passar a ler `busca` ou `entregues` em outro lugar, é aqui
// que quebra — antes de a lista, os cards e as facetas divergirem na tela.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  FILTROS_VAZIOS, itemCasaFiltros, hojeEmUTC,
  type GraficaFiltros, type FacetaGrafica,
} from "../../client/src/lib/grafica-filtros";
import { recorteSoDaBusca, recorteSemABusca } from "../../client/src/components/grafica/recorte-da-busca";

const HOJE = hojeEmUTC(new Date(2026, 8, 17));
const ctx = { groupOf: (t: string) => (/placa/i.test(t) ? "PLACAS" : ""), hojeUTC: HOJE };

const STATUS = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered", "awaiting_final_review"];
const PECAS = Array.from({ length: 140 }, (_, i) => {
  const status = STATUS[i % STATUS.length];
  const qtd = 1 + (i % 4);
  return {
    id: `p${i}`, displayId: i % 9 === 0 ? `#00${i}-C1` : `#00${i}`,
    type: i % 3 === 0 ? "Placa km" : i % 3 === 1 ? "Banner" : "Pórtico",
    description: i % 2 ? `Placa ${i % 5}k SÓ QUERO PEDALAR` : `Banner lateral ${i}`,
    status, quantity: qtd,
    quantityProduced: ["produced", "conferred", "delivered"].includes(status) ? qtd : 0,
    quantityConferred: ["conferred", "delivered"].includes(status) ? qtd : 0,
    quantityDelivered: status === "delivered" ? qtd : 0,
    isReuse: i % 11 === 0, reuseQty: i % 7 === 0 ? 1 : 0,
    parentItemId: i % 9 === 0 ? "pai" : null,
    material: i % 2 ? "Lona" : "PVC", finish: i % 3 ? "Ilhós" : "",
    eventId: `ev${i % 6}`,
    event: { name: i % 6 === 0 ? "Corrida São João" : `Evento ${i % 6}`, truckDepartureDate: new Date(HOJE + ((i % 6) - 2) * 5 * 86400000).toISOString() },
  };
});

const RECORTES: Partial<GraficaFiltros>[] = [
  {},
  { busca: "placa" }, { busca: "sao joao" }, { busca: "#00" }, { busca: "   " }, { busca: "nada-casa" },
  { busca: "banner", status: ["delivered"] },
  { busca: "evento", entregues: true },
  { busca: "placa", evento: ["ev1"] },
  { busca: "pedalar", reaproveitamento: true },
  { busca: "placa", complementos: true, grupo: ["PLACAS"] },
  { busca: "e", tipo: ["Banner"], material: ["Lona"], mes: ["9"], proximos10: true },
  { busca: "5k", percurso: ["5k"] },
  { status: ["inProduction"], acabamento: ["Ilhós"] },
];
const OPCOES: Array<{ ignorarStatus?: boolean; excluir?: FacetaGrafica }> = [
  {}, { ignorarStatus: true },
  ...(["status", "evento", "grupo", "percurso", "tipo", "material", "acabamento", "mes"] as FacetaGrafica[]).map((excluir) => ({ excluir })),
];

describe("busca uma vez só: mesmo resultado peça a peça", () => {
  it.each(RECORTES.map((r) => [JSON.stringify(r), r] as const))("recorte %s", (_nome, parcial) => {
    const f = { ...FILTROS_VAZIOS, ...parcial } as GraficaFiltros;
    const soBusca = recorteSoDaBusca(f.busca);
    const semBusca = recorteSemABusca(f);
    for (const o of OPCOES) {
      for (const i of PECAS) {
        const direto = itemCasaFiltros(i as any, f, ctx, o);
        const emDuasEtapas = itemCasaFiltros(i as any, soBusca, ctx, { ignorarStatus: true })
          && itemCasaFiltros(i as any, semBusca, ctx, o);
        expect(emDuasEtapas, `${i.id} ${JSON.stringify(o)}`).toBe(direto);
      }
    }
  });

  it("sem busca, o recorte das passadas é o MESMO objeto (não invalida os useMemo)", () => {
    const f = { ...FILTROS_VAZIOS, status: ["produced"] };
    expect(recorteSemABusca(f)).toBe(f);
  });
});
