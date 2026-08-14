// Regra pura do RECORTE da Gráfica. Cada bloco abaixo prende um defeito real
// que a tela teve — ou que ela teria de novo no próximo filtro adicionado.
import { describe, expect, it } from "vitest";
import {
  FILTROS_VAZIOS, contarFiltrosAtivos, descreverFiltros, escondeEntregues,
  filtrosDaURL, filtrosParaQuery, hojeEmUTC, itemCasaFiltros, itemPercursos,
  nomeDoMes, normKey, ordemPercurso, temFiltroAtivo,
  type GraficaFiltros, type ItemGrafica,
} from "@/lib/grafica-filtros";

const DIA = 86_400_000;
const HOJE = Date.UTC(2026, 7, 14); // 14/08/2026 — a data do relógio do time

const f = (over: Partial<GraficaFiltros> = {}): GraficaFiltros => ({ ...FILTROS_VAZIOS, ...over });

const ctx = { groupOf: (t: string) => (normKey(t).startsWith("placa km") ? "PLACA KM" : ""), hojeUTC: HOJE };

function item(over: Partial<ItemGrafica> = {}): ItemGrafica {
  return {
    id: over.id ?? "i1",
    displayId: over.displayId ?? "#0062",
    type: over.type ?? "Banner",
    description: over.description ?? "",
    material: over.material ?? "Lona 440g",
    finish: over.finish ?? "Ilhós",
    status: over.status ?? "produced",
    quantity: over.quantity ?? 10,
    eventId: over.eventId ?? "ev1",
    event: "event" in over ? over.event : { name: "Maratona SP", truckDepartureDate: new Date(Date.UTC(2026, 7, 18)).toISOString() },
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("contagem de filtros ativos — a regressão do empty state", () => {
  // Grupo e Percurso entraram na barra e NÃO entraram no `hasActiveFilters`
  // escrito à mão: filtrar por Grupo sem correspondência fazia a tela dizer
  // "Nenhuma peça liberada ainda", ou seja, mentir sobre o motivo do vazio.
  it("conta grupo e percurso como filtros ativos", () => {
    expect(temFiltroAtivo(f({ grupo: ["PLACA KM"] }))).toBe(true);
    expect(temFiltroAtivo(f({ percurso: ["21k"] }))).toBe(true);
    expect(contarFiltrosAtivos(f({ grupo: ["PLACA KM"], percurso: ["21k"], proximos10: true }))).toBe(3);
  });

  it("conta TODOS os onze filtros — a lista vive num lugar só", () => {
    const cheio = f({
      busca: "0062", status: ["produced"], evento: ["ev1"], grupo: ["PLACA KM"],
      percurso: ["5k"], tipo: ["Banner"], material: ["Lona"], acabamento: ["Ilhós"],
      mes: ["8"], proximos10: true, complementos: true,
    });
    expect(contarFiltrosAtivos(cheio)).toBe(11);
  });

  it("recorte vazio não tem filtro ativo, e `entregues` NÃO é filtro", () => {
    expect(temFiltroAtivo(FILTROS_VAZIOS)).toBe(false);
    expect(temFiltroAtivo(f({ entregues: true }))).toBe(false);
  });

  it("descreve o que está ativo, para o empty state ter o que dizer", () => {
    const d = descreverFiltros(f({ grupo: ["PLACA KM"], proximos10: true, mes: ["8"] }), {
      mes: (v) => v.map(nomeDoMes).join(", "),
    });
    expect(d).toEqual(["Grupo: PLACA KM", "Mês: Agosto", "Próximos 10 dias"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("URL — o recorte sobrevive ao F5 e vira link", () => {
  it("ida e volta preserva todos os campos", () => {
    const original = f({
      busca: "placa", status: ["produced", "conferred"], evento: ["ev1"],
      grupo: ["PLACA KM"], percurso: ["5k", "10k"], tipo: ["Banner"],
      material: ["Lona 440g"], acabamento: ["Ilhós"], mes: ["8"],
      proximos10: true, complementos: true, entregues: true,
    });
    expect(filtrosDaURL("?" + filtrosParaQuery("", original))).toEqual(original);
  });

  it("query vazia devolve o recorte vazio (nunca lança)", () => {
    expect(filtrosDaURL("")).toEqual(FILTROS_VAZIOS);
    expect(filtrosDaURL("?lixo=1")).toEqual(FILTROS_VAZIOS);
  });

  it("preserva param alheio — o `?item=` do deep link do sino não some", () => {
    const qs = filtrosParaQuery("?item=abc-123&utm_source=whats", f({ grupo: ["PLACA KM"] }));
    const p = new URLSearchParams(qs);
    expect(p.get("item")).toBe("abc-123");
    expect(p.get("utm_source")).toBe("whats");
    expect(p.get("grupo")).toBe("PLACA KM");
  });

  it("filtro desligado sai da URL em vez de virar ruído", () => {
    const qs = filtrosParaQuery("?grupo=PLACA%20KM&proximos10=1&entregues=1", FILTROS_VAZIOS);
    expect(qs).toBe("");
  });

  it("`entregues` só aparece quando ligado (o padrão é ocultar)", () => {
    expect(filtrosParaQuery("", f({ entregues: false }))).toBe("");
    expect(filtrosParaQuery("", f({ entregues: true }))).toBe("entregues=1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("percurso — a distância vive no TEXTO da peça", () => {
  it("uma placa 5k/10k pertence aos DOIS percursos", () => {
    expect(itemPercursos(item({ description: "Placa km - 5k/10k - km 1" }))).toEqual(["5k", "10k"]);
  });

  it("ignora o marcador 'km 8' (exige dígito ANTES do k)", () => {
    expect(itemPercursos(item({ description: "10k - km 8", type: "Placa" }))).toEqual(["10k"]);
  });

  it("ignora unidades como kg", () => {
    expect(itemPercursos(item({ description: "Saco de 5kg", type: "Etiqueta" }))).toEqual([]);
  });

  it("aceita decimal com vírgula e com ponto, normalizando para vírgula", () => {
    expect(itemPercursos(item({ description: "21,1k", type: "" }))).toEqual(["21,1k"]);
    expect(itemPercursos(item({ description: "21.1k", type: "" }))).toEqual(["21,1k"]);
  });

  it("ordena por distância — 5k antes de 10k (alfabética inverteria)", () => {
    expect(["10k", "5k", "21,1k"].sort((a, b) => ordemPercurso(a) - ordemPercurso(b)))
      .toEqual(["5k", "10k", "21,1k"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("casamento item ↔ recorte", () => {
  it("status legado casa com a grafia canônica da mesma etapa", () => {
    const legado = item({ status: "pronto_para_producao" });
    expect(itemCasaFiltros(legado, f({ status: ["ready_for_production"] }), ctx)).toBe(true);
    // ...mas "approved" é outra opção do select e NÃO pode ser devolvida junto.
    expect(itemCasaFiltros(item({ status: "approved" }), f({ status: ["ready_for_production"] }), ctx)).toBe(false);
  });

  it("percurso casa com QUALQUER um dos selecionados", () => {
    const placa = item({ description: "Placa km - 5k/10k - km 1" });
    expect(itemCasaFiltros(placa, f({ percurso: ["10k"] }), ctx)).toBe(true);
    expect(itemCasaFiltros(placa, f({ percurso: ["21k"] }), ctx)).toBe(false);
  });

  it("peça SEM data de saída não passa nem no mês nem nos próximos 10 dias", () => {
    // O filtro de mês deixava a peça sem data passar (a condição inteira era
    // falsa), enquanto o de 10 dias a excluía: dois vizinhos, regras opostas.
    const semData = item({ event: { name: "Sem saída", truckDepartureDate: null } });
    expect(itemCasaFiltros(semData, f({ mes: ["8"] }), ctx)).toBe(false);
    expect(itemCasaFiltros(semData, f({ proximos10: true }), ctx)).toBe(false);
    // Sem filtro de data, ela continua na fila.
    expect(itemCasaFiltros(semData, FILTROS_VAZIOS, ctx)).toBe(true);
  });

  it("mês e próximos-10-dias contam em UTC, o mesmo fuso da Saída exibida", () => {
    const saiHoje = item({ event: { name: "e", truckDepartureDate: new Date(HOJE).toISOString() } });
    const saiEm11 = item({ event: { name: "e", truckDepartureDate: new Date(HOJE + 11 * DIA).toISOString() } });
    const ontem = item({ event: { name: "e", truckDepartureDate: new Date(HOJE - DIA).toISOString() } });
    expect(itemCasaFiltros(saiHoje, f({ proximos10: true }), ctx)).toBe(true);
    expect(itemCasaFiltros(saiEm11, f({ proximos10: true }), ctx)).toBe(false);
    expect(itemCasaFiltros(ontem, f({ proximos10: true }), ctx)).toBe(false);
    expect(itemCasaFiltros(saiHoje, f({ mes: ["8"] }), ctx)).toBe(true);
    expect(itemCasaFiltros(saiHoje, f({ mes: ["9"] }), ctx)).toBe(false);
  });

  it("busca varre tipo, descrição, código e nome do evento", () => {
    const i = item({ displayId: "#0062-C1", description: "Placa de largada", type: "Placa km" });
    for (const q of ["0062", "largada", "placa km", "maratona"]) {
      expect(itemCasaFiltros(i, f({ busca: q }), ctx)).toBe(true);
    }
    expect(itemCasaFiltros(i, f({ busca: "banner" }), ctx)).toBe(false);
  });

  it("grupo sai do catálogo de Modelos (ctx.groupOf), não do texto", () => {
    expect(itemCasaFiltros(item({ type: "Placa km 5" }), f({ grupo: ["PLACA KM"] }), ctx)).toBe(true);
    expect(itemCasaFiltros(item({ type: "Banner" }), f({ grupo: ["PLACA KM"] }), ctx)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("entregues ocultas por padrão — e o caminho de volta", () => {
  const entregue = item({ status: "delivered" });

  it("a tela abre na fila do que falta: entregue não entra", () => {
    expect(escondeEntregues(FILTROS_VAZIOS)).toBe(true);
    expect(itemCasaFiltros(entregue, FILTROS_VAZIOS, ctx)).toBe(false);
    expect(itemCasaFiltros(item({ status: "produced" }), FILTROS_VAZIOS, ctx)).toBe(true);
  });

  it("clicar no KPI 'Entregues' mostra as entregues em vez de uma lista vazia", () => {
    expect(escondeEntregues(f({ status: ["delivered"] }))).toBe(false);
    expect(itemCasaFiltros(entregue, f({ status: ["delivered"] }), ctx)).toBe(true);
  });

  it("buscar uma peça entregue a encontra — o deep link do sino depende disso", () => {
    expect(itemCasaFiltros(entregue, f({ busca: "0062" }), ctx)).toBe(true);
  });

  it("o chip de reversão traz o arquivo de volta", () => {
    expect(itemCasaFiltros(entregue, f({ entregues: true }), ctx)).toBe(true);
  });

  it("o pool dos KPIs ignora a ocultação — senão o card Entregues leria 0", () => {
    expect(itemCasaFiltros(entregue, FILTROS_VAZIOS, ctx, { ignorarStatus: true })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("facetas — cada dropdown conta sem o próprio filtro", () => {
  const banner = item({ id: "a", type: "Banner", material: "Lona 440g" });
  const placa = item({ id: "b", type: "Placa km 5", material: "PS 2mm" });

  it("o filtro excluído não se aplica; os outros continuam valendo", () => {
    const rec = f({ tipo: ["Banner"], material: ["PS 2mm"] });
    // Faceta de TIPO: ignora o próprio tipo, mas o material ainda recorta.
    expect(itemCasaFiltros(placa, rec, ctx, { excluir: "tipo" })).toBe(true);
    expect(itemCasaFiltros(banner, rec, ctx, { excluir: "tipo" })).toBe(false);
    // Faceta de MATERIAL: o inverso.
    expect(itemCasaFiltros(banner, rec, ctx, { excluir: "material" })).toBe(true);
    expect(itemCasaFiltros(placa, rec, ctx, { excluir: "material" })).toBe(false);
  });

  it("a busca também recorta as facetas — a contagem não pode prometer o que a lista não mostra", () => {
    expect(itemCasaFiltros(banner, f({ busca: "banner" }), ctx, { excluir: "tipo" })).toBe(true);
    expect(itemCasaFiltros(placa, f({ busca: "banner" }), ctx, { excluir: "tipo" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("helpers", () => {
  it("normKey tira acento, caixa e espaço duplicado", () => {
    expect(normKey("  PÓRTICO  de   Largada ")).toBe("portico de largada");
  });

  it("hojeEmUTC devolve a meia-noite UTC do dia local", () => {
    expect(hojeEmUTC(new Date(2026, 7, 14, 23, 59))).toBe(Date.UTC(2026, 7, 14));
  });

  it("nomeDoMes traduz o número que viaja na URL", () => {
    expect(nomeDoMes("8")).toBe("Agosto");
    expect(nomeDoMes("12")).toBe("Dezembro");
  });
});
