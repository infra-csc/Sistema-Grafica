// ─────────────────────────────────────────────────────────────────────────────
// FACETA E LISTA SAEM DO MESMO POOL — a invariante dos menus de filtro.
//
// O DEFEITO QUE ORIGINOU ISTO (dono do NORTE, 17/08): na Gráfica, as peças do
// evento "SÓ QUERO PEDALAR SP" apareciam na lista com o selo EVENTO REALIZADO —
// a mudança de 796861e funcionando —, mas ao abrir "Todos os Eventos" e digitar,
// o evento não era oferecido. Ver a peça na tela e não conseguir filtrar por ela
// é uma promessa quebrada.
//
// A CAUSA REAL não era um segundo pool (este arquivo prova que não é: o pool das
// facetas da Gráfica é o MESMO array da lista, com o próprio filtro excluído).
// Era a BUSCA DO MENU, cega a acento: `label.toLowerCase().includes(termo)` não
// casa "SÓ QUERO PEDALAR SP" com "so quero". A opção estava lá; o acento não
// deixava chegar nela. Menu que esconde a opção existente é indistinguível de
// menu que não a tem — e foi assim que o defeito foi lido como "os encerrados
// sumiram do filtro".
//
// A AUDITORIA achou o mesmo pecado nos dois sentidos, e este arquivo trava os
// dois:
//   · FACETA OFERECE MENOS que a lista mostra → o operador vê a peça e não
//     consegue filtrar por ela.
//   · FACETA OFERECE MAIS do que a lista entrega → o clique devolve lista
//     vazia, sem dizer por quê. Era o caso do menu de Status e do de Mês da
//     Gráfica (listas fixas de seis etapas e doze meses, sem contagem) e o dos
//     dois menus da aba Histórico do Atendimento (o sistema inteiro).
//
// E a CONTAGEM ao lado de cada opção tem de ser o número de linhas que o clique
// entrega — não a de um pool vizinho.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  FILTROS_VAZIOS, itemCasaFiltros, itemPercursos, itemMes, normKey, escondeEntregues,
  type FacetaGrafica, type GraficaFiltros, type ItemGrafica, type CtxFiltros,
} from "@/lib/grafica-filtros";
import { normalizarBusca } from "@/lib/utils";
import { seloPecaEventoFinalizado } from "@/lib/status";
import { EVENT_CLOSED_STATUS } from "@shared/prazo-dates";

const ler = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const HOJE_UTC = Date.UTC(2026, 7, 17); // 17/08/2026 — o dia do relato
const DIA = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

const ctx: CtxFiltros = {
  groupOf: (t: string) => (normKey(t).startsWith("placa km") ? "PLACA KM" : ""),
  hojeUTC: HOJE_UTC,
};

// ─────────────────────────────────────────────────────────────────────────────
// A BASE: evento VIVO + evento ENCERRADO à mão + evento REALIZADO (data
// passada), misturados, como a fila da Gráfica de fato fica. Nomes com acento e
// caixa alta de propósito — é o formato real que quebrou a busca do menu.
// ─────────────────────────────────────────────────────────────────────────────
const EVENTOS = {
  vivo: {
    id: "ev-vivo",
    event: { name: "MARATONA DE SÃO PAULO", status: "active", startDate: iso(HOJE_UTC + 20 * DIA), truckDepartureDate: iso(HOJE_UTC + 14 * DIA) },
  },
  encerrado: {
    id: "ev-encerrado",
    event: { name: "CIRCUITO DAS ÁRVORES", status: EVENT_CLOSED_STATUS, startDate: iso(HOJE_UTC + 30 * DIA), truckDepartureDate: iso(HOJE_UTC + 25 * DIA) },
  },
  realizado: {
    id: "ev-realizado",
    event: { name: "SÓ QUERO PEDALAR SP", status: "active", startDate: iso(HOJE_UTC - 2 * DIA), truckDepartureDate: iso(HOJE_UTC - 9 * DIA) },
  },
  // O evento do SEGUNDO relato (dono do NORTE, 17/08): TODAS as peças entregues.
  // É o caso que fazia o evento sumir do filtro de Eventos enquanto a busca
  // livre pelo nome dele o oferecia normalmente.
  entregue: {
    id: "ev-entregue",
    event: { name: "PRIMAVERA MANAUS", status: "active", startDate: iso(HOJE_UTC - 5 * DIA), truckDepartureDate: iso(HOJE_UTC - 12 * DIA) },
  },
} as const;

let seq = 0;
function peca(evento: keyof typeof EVENTOS, over: Partial<ItemGrafica> = {}): ItemGrafica {
  const e = EVENTOS[evento];
  return {
    id: `i${++seq}`,
    displayId: `#${String(seq).padStart(4, "0")}`,
    type: "Banner",
    description: "",
    material: "Lona 440g",
    finish: "Ilhós",
    status: "produced",
    quantity: 10,
    eventId: e.id,
    event: e.event as any,
    ...over,
  };
}

const BASE: ItemGrafica[] = [
  peca("vivo"),
  peca("vivo", { type: "Placa km 5k - km 3", material: "PS 2mm", finish: "Sem acabamento", status: "approved" }),
  peca("vivo", { status: "delivered", quantityDelivered: 10 }),
  peca("encerrado", { status: "inProduction", material: "Adesivo" }),
  peca("encerrado", { type: "Placa km 10k - km 8", status: "conferred" }),
  // As peças do evento do relato: uma pronta para conferir, uma já entregue.
  peca("realizado", { status: "produced", type: "Pórtico" }),
  peca("realizado", { status: "delivered", quantityDelivered: 4, finish: "Bastão" }),
  peca("realizado", { type: "Placa km 5k/10k - km 1", status: "ready_for_production" }),
  // Grafia legada da MESMA etapa — a faceta de status tem de somá-la com
  // "ready_for_production" numa opção só.
  peca("vivo", { status: "pronto_para_producao" }),
  // PRIMAVERA MANAUS: três peças, as três entregues. Nenhuma delas aparece na
  // fila padrão — e mesmo assim o evento tem de ser oferecido no menu, porque o
  // clique nele revela as três.
  peca("entregue", { status: "delivered", quantityDelivered: 10 }),
  peca("entregue", { status: "delivered", quantityDelivered: 10, type: "Pórtico", material: "PS 2mm" }),
  peca("entregue", { status: "delivered", quantityDelivered: 10, type: "Placa km 21,1k - km 2", finish: "Bastão" }),
];

const f = (over: Partial<GraficaFiltros> = {}): GraficaFiltros => ({ ...FILTROS_VAZIOS, ...over });

const FACETAS: FacetaGrafica[] = [
  "status", "evento", "grupo", "percurso", "tipo", "material", "acabamento", "mes",
];

/** O campo do recorte que cada faceta comanda — o que o clique na opção liga. */
const CAMPO: Record<FacetaGrafica, keyof GraficaFiltros> = {
  status: "status", evento: "evento", grupo: "grupo", percurso: "percurso",
  tipo: "tipo", material: "material", acabamento: "acabamento", mes: "mes",
};

/**
 * Os valores que UMA peça contribui para UMA faceta — a mesma derivação que os
 * dropdowns da tela fazem. Peça pode contribuir com nenhum (sem material) ou
 * com dois (a placa "5k/10k" pertence aos dois percursos).
 */
function valoresDaFaceta(faceta: FacetaGrafica, i: ItemGrafica): string[] {
  switch (faceta) {
    case "status": {
      const s = String(i.status ?? "");
      return s ? [s === "pronto_para_producao" ? "ready_for_production" : s] : [];
    }
    case "evento":     return i.eventId ? [String(i.eventId)] : [];
    case "grupo":      { const g = ctx.groupOf(String(i.type ?? "")); return g ? [g] : []; }
    case "percurso":   return itemPercursos(i);
    case "tipo":       return i.type ? [String(i.type)] : [];
    case "material":   return i.material ? [String(i.material)] : [];
    case "acabamento": return i.finish ? [String(i.finish)] : [];
    case "mes":        { const m = itemMes(i); return m ? [m] : []; }
  }
}

/** As OPÇÕES do dropdown: pool com a própria dimensão excluída, com contagem. */
function opcoesDaFaceta(faceta: FacetaGrafica, filtros: GraficaFiltros): Map<string, number> {
  const m = new Map<string, number>();
  BASE.filter(i => itemCasaFiltros(i, filtros, ctx, { excluir: faceta }))
    .forEach(i => valoresDaFaceta(faceta, i).forEach(v => m.set(v, (m.get(v) ?? 0) + 1)));
  return m;
}

/** O que a LISTA mostra com esse recorte. */
const lista = (filtros: GraficaFiltros) => BASE.filter(i => itemCasaFiltros(i, filtros, ctx));

/** Os valores daquela dimensão PRESENTES na lista. */
const naLista = (faceta: FacetaGrafica, filtros: GraficaFiltros): Set<string> =>
  new Set(lista(filtros).flatMap(i => valoresDaFaceta(faceta, i)));

const ordenado = (s: Iterable<string>) => Array.from(s).sort();

// Recortes de teste. Em cada um, as facetas SEM filtro próprio são checadas
// pela igualdade exata; a contagem é checada em todas.
const RECORTES: Array<[string, GraficaFiltros]> = [
  ["fila limpa", f()],
  ["mostrando as entregues", f({ entregues: true })],
  ["filtrado por tipo", f({ tipo: ["Banner"] })],
  ["filtrado por material", f({ material: ["Lona 440g"] })],
  ["filtrado por evento encerrado", f({ evento: ["ev-encerrado"] })],
  ["buscando pelo nome do evento", f({ busca: "pedalar" })],
  ["buscando SEM acento", f({ busca: "so quero" })],
  ["filtrado por mês da saída", f({ mes: ["8"] })],
  ["filtrado por status", f({ status: ["produced"] })],
  ["dois filtros juntos", f({ evento: ["ev-realizado"], tipo: ["Pórtico"] })],
];

// ─────────────────────────────────────────────────────────────────────────────
// A INVARIANTE, NA FORMA QUE IMPORTA PARA QUEM USA A TELA.
//
// Ela já foi "o conjunto oferecido é exatamente o presente na lista", com a
// faceta de Status documentada à parte como exceção deliberada — o menu segue
// oferecendo "Entregues" mesmo com as entregues ocultas, porque o clique as
// REVELA. Essa formulação não sobreviveu ao segundo relato: pela letra dela, um
// evento 100% entregue não podia ser oferecido (nenhuma peça dele está na
// lista), e era exatamente isso que fazia "Primavera Manaus" sumir do filtro de
// Eventos enquanto a busca livre pelo nome o encontrava. A exceção não era do
// Status: era de TODA faceta cujo clique revela.
//
// A promessa que o menu faz a quem clica não é sobre a lista de agora, é sobre a
// lista DEPOIS do clique. Então a invariante é:
//
//   1. toda opção oferecida entrega PELO MENOS UMA linha ao ser clicada, e a
//      contagem ao lado dela é o número de linhas que o clique entrega;
//   2. todo valor VISÍVEL na lista é oferecido no menu (o caminho de volta: ver
//      a peça na tela e não conseguir filtrar por ela foi o primeiro relato).
//
// Sem exceção nenhuma, para nenhuma faceta. A regra que decide se a faceta conta
// as entregues está escrita por extenso em lib/grafica-filtros (FacetaGrafica):
// se o clique revela, a faceta conta; se não revela, não conta.
// ─────────────────────────────────────────────────────────────────────────────
describe("Gráfica — toda opção oferecida entrega o que promete", () => {
  it.each(RECORTES)("%s", (_nome, filtros) => {
    for (const faceta of FACETAS) {
      // Faceta VAZIA é legítima e não é o que se está checando aqui: filtrar por
      // "Banner" deixa o menu de Percurso sem nenhuma opção, e o dropdown se
      // esconde. O que não pode existir é opção que não entrega.
      const opcoes = opcoesDaFaceta(faceta, filtros);
      for (const [valor, contagem] of opcoes) {
        const aoClicar = lista({ ...filtros, [CAMPO[faceta]]: [valor] } as GraficaFiltros);
        expect(
          aoClicar.length,
          `faceta "${faceta}", opção "${valor}": o menu prometeu ${contagem} e o clique entregou ${aoClicar.length}`,
        ).toBe(contagem);
        expect(contagem, `faceta "${faceta}", opção "${valor}" nasceu vazia`).toBeGreaterThan(0);
      }
    }
  });

  it("as oito facetas têm opção na fila limpa — o teste acima não passa a vazio", () => {
    // Sem esta trava, um bug que zerasse TODOS os menus passaria pelo it.each
    // acima sem uma única asserção executada.
    for (const faceta of FACETAS) {
      expect(opcoesDaFaceta(faceta, f()).size, `faceta "${faceta}"`).toBeGreaterThan(0);
    }
  });
});

describe("Gráfica — todo valor visível na lista é oferecido no menu", () => {
  it.each(RECORTES)("%s", (_nome, filtros) => {
    for (const faceta of FACETAS) {
      const oferecidos = opcoesDaFaceta(faceta, filtros);
      for (const valor of naLista(faceta, filtros)) {
        expect(
          oferecidos.has(valor),
          `faceta "${faceta}": "${valor}" está na lista e sumiu do menu`,
        ).toBe(true);
      }
    }
  });

  it("a faceta só passa da lista quando o clique REVELA — status e evento", () => {
    // O contrapositivo do teste acima, e o que separa "revelar" de "prometer o
    // que não existe": nas seis facetas que NÃO revelam, o conjunto oferecido é
    // exatamente o presente na lista. Nas duas que revelam, ele é maior — e cada
    // opção a mais entrega suas linhas (bloco anterior).
    for (const faceta of FACETAS) {
      const oferecidos = ordenado(opcoesDaFaceta(faceta, f()).keys());
      const visiveis = ordenado(naLista(faceta, f()));
      if (faceta === "status" || faceta === "evento") {
        expect(oferecidos.length, `faceta "${faceta}"`).toBeGreaterThan(visiveis.length);
      } else {
        expect(oferecidos, `faceta "${faceta}" passou da lista sem revelar nada`).toEqual(visiveis);
      }
    }
  });

  it("o evento do relato está no menu enquanto tiver peça na lista", () => {
    // A prova direta do que o dono viu: peça de evento REALIZADO na lista, com
    // selo, e o evento oferecido no dropdown.
    const visiveis = lista(f());
    const doRelato = visiveis.filter(i => i.eventId === "ev-realizado");
    expect(doRelato.length).toBeGreaterThan(0);
    expect(seloPecaEventoFinalizado(doRelato[0].event as any, HOJE_UTC)?.motivo).toBe("realizado");
    expect(opcoesDaFaceta("evento", f()).has("ev-realizado")).toBe(true);
  });

  it("evento ENCERRADO à mão também é oferecido — a lista mostra as peças dele", () => {
    const opcoes = opcoesDaFaceta("evento", f());
    expect(opcoes.has("ev-encerrado")).toBe(true);
    expect(opcoes.has("ev-vivo")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Gráfica — o evento 100% entregue (relato do dono do NORTE, 17/08)", () => {
  // "Na Gráfica só aparece quando filtro na busca manual; quando vou no filtro
  // Eventos, Primavera Manaus não aparece." As peças estavam todas entregues, e
  // as entregues são ocultas por padrão: sem busca, o evento ficava com zero
  // peça visível e caía da faceta. Com a busca preenchida, `escondeEntregues`
  // abria exceção, as peças voltavam e o evento voltava ao menu junto. A faceta
  // estava coerente com a lista — e o dono, sem caminho até o que procurava.
  it("as peças do evento estão TODAS entregues e todas ocultas na fila padrão", () => {
    const doEvento = BASE.filter(i => i.eventId === "ev-entregue");
    expect(doEvento.length).toBe(3);
    expect(doEvento.every(i => i.status === "delivered")).toBe(true);
    expect(lista(f()).filter(i => i.eventId === "ev-entregue").length).toBe(0);
  });

  it("pela BUSCA LIVRE o evento aparece — o caminho que funcionou para o dono", () => {
    expect(escondeEntregues(f({ busca: "manaus" }))).toBe(false);
    expect(opcoesDaFaceta("evento", f({ busca: "manaus" })).get("ev-entregue")).toBe(3);
    expect(lista(f({ busca: "manaus" })).length).toBe(3);
  });

  it("pelo FILTRO DE EVENTOS ele aparece igual, e com a contagem das entregues", () => {
    // O defeito, travado: antes desta correção a chamada abaixo devolvia
    // `undefined` — o evento não era oferecido.
    expect(opcoesDaFaceta("evento", f()).get("ev-entregue")).toBe(3);
  });

  it("e o clique entrega as três — o menu não promete o que não pode cumprir", () => {
    // Sem a exceção de `escondeEntregues` para o evento escolhido a dedo, este
    // clique devolveria ZERO: oferecer a opção sem revelar seria trocar um menu
    // que esconde por um menu que mente.
    expect(escondeEntregues(f({ evento: ["ev-entregue"] }))).toBe(false);
    expect(lista(f({ evento: ["ev-entregue"] })).length).toBe(3);
  });

  it("os dois caminhos até o evento dão a MESMA lista", () => {
    // Buscar o nome e escolher no menu são duas maneiras de dizer "quero este
    // evento". Darem respostas diferentes era o defeito por baixo do relato.
    expect(lista(f({ busca: "primavera manaus" })).map(i => i.id))
      .toEqual(lista(f({ evento: ["ev-entregue"] })).map(i => i.id));
  });

  it("revelar é do EVENTO escolhido, não da fila inteira", () => {
    // A fronteira da decisão: escolher o evento revela as entregues DELE; a fila
    // continua sendo a fila. Um recorte de atributo (material) não revela nada.
    const so = lista(f({ evento: ["ev-entregue"] }));
    expect(so.every(i => i.eventId === "ev-entregue")).toBe(true);
    expect(escondeEntregues(f({ material: ["Lona 440g"] }))).toBe(true);
    expect(lista(f({ material: ["Lona 440g"] })).some(i => i.status === "delivered")).toBe(false);
  });

  it("as facetas de ATRIBUTO não oferecem o que só existe entregue", () => {
    // "PS 2mm" e "Bastão" existem em peça viva; "Placa km 21,1k" e o percurso
    // "21,1k" só existem no evento 100% entregue — então não são oferecidos, e é
    // o certo: a opção não teria uma linha para entregar. O caminho até eles é o
    // chip "N entregues ocultas · mostrar" (ou o próprio evento).
    expect(opcoesDaFaceta("tipo", f()).has("Placa km 21,1k - km 2")).toBe(false);
    expect(opcoesDaFaceta("percurso", f()).has("21,1k")).toBe(false);
    expect(opcoesDaFaceta("tipo", f({ entregues: true })).get("Placa km 21,1k - km 2")).toBe(1);
    expect(opcoesDaFaceta("percurso", f({ entregues: true })).get("21,1k")).toBe(1);
    // E pelo evento também se chega, porque o evento revela.
    expect(opcoesDaFaceta("tipo", f({ evento: ["ev-entregue"] })).get("Placa km 21,1k - km 2")).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Gráfica — o atalho 'mostrar entregues' promete o que entrega", () => {
  // A MESMA régua dos menus, aplicada ao chip do rodapé e ao botão do empty
  // state (`entreguesOcultas` em grafica.tsx): o número é o que o CLIQUE traz,
  // não o que está escondido. É a saída das seis facetas que não revelam — sem
  // ela, um recorte cujas peças foram todas entregues vira beco sem saída.
  const revelaAoMostrar = (filtros: GraficaFiltros) =>
    escondeEntregues(filtros) ? lista({ ...filtros, entregues: true }).length - lista(filtros).length : 0;

  it("na fila limpa, promete as entregues e as entrega", () => {
    expect(revelaAoMostrar(f())).toBe(5);
    expect(lista(f({ entregues: true })).length).toBe(lista(f()).length + 5);
  });

  it("com um STATUS escolhido, não promete o que o próprio filtro exclui", () => {
    // Contando "as entregues do recorte" em vez do que o clique traz, o chip
    // dizia "5 entregues ocultas · mostrar" com "Produzidos" ligado — e o clique
    // não trazia nenhuma, porque o filtro de status segue excluindo entregue.
    const rec = f({ status: ["produced"] });
    expect(BASE.some(i => i.status === "delivered")).toBe(true);
    expect(revelaAoMostrar(rec)).toBe(0);
  });

  it("num recorte de ATRIBUTO 100% entregue, o atalho é o caminho de saída", () => {
    // "Bastão" só existe em peça entregue: a faceta de acabamento não o oferece
    // (o clique não teria linha para entregar) e quem chegar nele por URL ou por
    // um recorte anterior encontra o atalho, com o número certo.
    expect(opcoesDaFaceta("acabamento", f()).has("Bastão")).toBe(false);
    const rec = f({ acabamento: ["Bastão"] });
    expect(lista(rec).length).toBe(0);
    expect(revelaAoMostrar(rec)).toBe(2);
    expect(lista({ ...rec, entregues: true }).length).toBe(2);
  });

  it("com o evento escolhido não há nada a revelar — ele já revelou", () => {
    expect(revelaAoMostrar(f({ evento: ["ev-entregue"] }))).toBe(0);
    expect(lista(f({ evento: ["ev-entregue"] })).length).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("Gráfica — a contagem da opção é o que o clique entrega", () => {
  it("a faceta de status soma a grafia legada na MESMA opção", () => {
    // "pronto_para_producao" e "ready_for_production" são a mesma etapa: duas
    // opções seriam duas metades da mesma fila, e cada uma mentiria por baixo.
    const opcoes = opcoesDaFaceta("status", f());
    expect(opcoes.has("pronto_para_producao")).toBe(false);
    expect(opcoes.get("ready_for_production")).toBe(2);
  });

  it("o menu de status enxerga as entregues escondidas — clicar nelas as revela", () => {
    // `excluir: "status"` desliga também a ocultação das entregues (elas são
    // parte do recorte de status). Sem isso, "Entregues" sumiria do menu
    // justamente por estar escondida, e o KPI Entregues não teria par.
    const opcoes = opcoesDaFaceta("status", f());
    expect(opcoes.get("delivered")).toBe(5);
    expect(lista(f({ status: ["delivered"] })).length).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("o recorte da Gráfica NÃO conhece evento finalizado", () => {
  // É o que sustenta a invariante depois de 796861e: se algum dia voltar a
  // existir um recorte de evento finalizado aqui, ele tem de valer para a lista
  // E para a faceta — e o jeito de garantir isso é não haver recorte nenhum.
  it("peça de evento encerrado/realizado casa igual à de evento vivo", () => {
    const vivo = peca("vivo");
    const encerrado = peca("encerrado");
    const realizado = peca("realizado");
    for (const i of [vivo, encerrado, realizado]) {
      expect(itemCasaFiltros(i, f(), ctx)).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("a busca dos menus não pode ser cega a acento", () => {
  // O defeito do relato, isolado: é isto que fazia o evento "não ser oferecido".
  it("'so quero' acha 'SÓ QUERO PEDALAR SP'", () => {
    const rotulo = "SÓ QUERO PEDALAR SP";
    expect(rotulo.toLowerCase().includes("so quero")).toBe(false); // o jeito antigo
    expect(normalizarBusca(rotulo).includes(normalizarBusca("so quero"))).toBe(true);
  });

  it("acha nos dois sentidos, e com espaço/caixa sobrando", () => {
    expect(normalizarBusca("CIRCUITO DAS ÁRVORES").includes(normalizarBusca("  Arvores "))).toBe(true);
    expect(normalizarBusca("Maratona de Sao Paulo").includes(normalizarBusca("SÃO"))).toBe(true);
  });

  it("a busca da lista da Gráfica usa a mesma régua", () => {
    // Sem isto, o menu acharia o evento e a busca livre não — duas réguas para
    // a mesma pergunta.
    expect(lista(f({ busca: "so quero" })).length).toBe(lista(f({ busca: "SÓ QUERO" })).length);
    expect(lista(f({ busca: "so quero" })).length).toBeGreaterThan(0);
  });

  it.each([
    ["EventFilterDropdown", "client/src/components/event-filter-dropdown.tsx"],
    ["FilterSelect", "client/src/components/filter-select.tsx"],
  ])("%s casa o rótulo pela fonte única de normalização", (_nome, caminho) => {
    const fonte = ler(caminho);
    expect(fonte).toContain("normalizarBusca");
    expect(fonte).not.toContain("o.label.toLowerCase().includes(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AS TELAS. Aqui o teste LÊ a fonte: a invariante é sobre de ONDE cada menu tira
// as opções, e isso não dá para observar por fora sem montar a árvore React
// inteira. É a mesma técnica de evento-finalizado-telas.test.ts.
// ─────────────────────────────────────────────────────────────────────────────
const GRAFICA = ler("client/src/pages/grafica.tsx");
const REVISAO = ler("client/src/pages/solicitacao.tsx");
const ARTE = ler("client/src/pages/arte.tsx");
const ATENDIMENTO = ler("client/src/pages/atendimento.tsx");
const VINCULAR = ler("client/src/pages/vincular-patrocinadores.tsx");

/** O corpo de um `const <nome> = ...` até a próxima declaração de topo. */
function bloco(fonte: string, nome: string): string {
  const i = fonte.indexOf(`const ${nome} =`);
  if (i < 0) throw new Error(`não encontrei "const ${nome} =" na tela`);
  const resto = fonte.slice(i);
  const fim = resto.slice(1).search(/\n {2}const \w/);
  return fim < 0 ? resto : resto.slice(0, fim + 1);
}

describe("Gráfica — todo dropdown sai do mesmo pool da lista", () => {
  it("o pool das facetas e a lista filtram o MESMO array", () => {
    expect(bloco(GRAFICA, "gFacetPool")).toContain("(items as any[]).filter");
    expect(bloco(GRAFICA, "filteredItems")).toContain("(items as any[])");
  });

  it.each([
    "eventFilterOptions", "groupFilterOptions", "percursoFilterOptions",
    "statusFilterOptions", "mesFilterOptions",
  ])("%s é calculado a partir de gFacetPool", (nome) => {
    expect(bloco(GRAFICA, nome)).toContain("gFacetPool(");
  });

  it("os menus de Status e Mês deixaram de ser lista escrita à mão", () => {
    // Eram os dois últimos com opções fixas: ofereciam Janeiro numa fila só de
    // Agosto e "Entregues" num dia sem nenhuma entrega.
    expect(GRAFICA).not.toContain('{ value: "1", label: "Janeiro" }');
    expect(GRAFICA).not.toContain('label: "Entregues", pinned: true');
    // 24/08: os selects viraram a lista SELECTS_PRINCIPAIS (uma fonte, duas
    // apresentações — barra desktop e folha do celular); as opções continuam
    // vindo dos pools derivados, agora como campo da lista.
    // 25/08: o menu de Status ganhou o valor sintético "reuso" — as opções
    // continuam nascendo do pool derivado, com o extra anexado por cima.
    expect(GRAFICA).toContain("? [...statusFilterOptions, { value: \"reuso\",");
    expect(GRAFICA).toContain(": statusFilterOptions,");
    expect(GRAFICA).toContain("options: mesFilterOptions");
  });
});

describe("Revisão Final — mesma disciplina", () => {
  it("lista e facetas passam pelo mesmo `casaRecorte`", () => {
    expect(bloco(REVISAO, "filteredItems")).toContain("casaRecorte(item)");
    expect(bloco(REVISAO, "eventFilterOptions")).toContain("casaRecorte(i, 'evento')");
    expect(bloco(REVISAO, "typeFilterOptions")).toContain("casaRecorte(i, 'tipo')");
  });

  it("a BUSCA também recorta as facetas", () => {
    // Era o furo daqui: digitar encolhia a lista e os menus seguiam prometendo
    // o número de antes.
    expect(bloco(REVISAO, "casaRecorte")).toContain("normalizarBusca(searchTerm)");
    expect(bloco(REVISAO, "eventFilterOptions")).toContain("searchTerm");
    expect(bloco(REVISAO, "typeFilterOptions")).toContain("searchTerm");
  });
});

describe("as três telas que ESCONDEM — coerentes, escondendo dos dois lados", () => {
  // O defeito ao contrário: se a faceta oferecesse um evento cujas peças estão
  // ocultas, o clique devolveria lista vazia. Em cada uma, o pool das opções é
  // o MESMO pool já podado de evento finalizado.
  it("Arte: as facetas saem de tabPoolItems, que sai de allItems/correcaoItems", () => {
    expect(bloco(ARTE, "facetPool")).toContain("tabPoolItems.filter");
    expect(bloco(ARTE, "tabPoolItems")).toContain("allItems");
    expect(bloco(ARTE, "allItems")).toContain("!isEventoFinalizado(");
    expect(bloco(ARTE, "correcaoItems")).toContain("!isEventoFinalizado(");
    // Os dois seletores de evento dos modais seguem a mesma regra.
    expect(bloco(ARTE, "bookEventOptions")).toContain("arteItemsPool");
    expect(bloco(ARTE, "arteItemsPool")).toContain("allItems");
    expect(bloco(ARTE, "bulkThumbEventOptions")).toContain("bulkThumbBasePool");
    expect(bloco(ARTE, "bulkThumbBasePool")).toContain("allItems");
  });

  it("Atendimento: as facetas saem de pendingItems, que é awaitingItems", () => {
    expect(bloco(ATENDIMENTO, "facetPool")).toContain("pendingItems.filter");
    expect(bloco(ATENDIMENTO, "pendingItems")).toContain("awaitingItems");
    expect(bloco(ATENDIMENTO, "awaitingItems")).toContain("!isEventoFinalizado(");
  });

  it("Vincular: as facetas saem de visibleItems", () => {
    expect(bloco(VINCULAR, "eventFilterOptions")).toContain("visibleItems");
    expect(bloco(VINCULAR, "visibleItems")).toContain("isEventoFinalizado(");
  });

  it.each([
    ["Arte", ARTE, "eventFilterOptions"],
    ["Atendimento", ATENDIMENTO, "eventFilterOptions"],
    ["Vincular", VINCULAR, "eventFilterOptions"],
  ])("%s: o menu de evento NUNCA varre a query de eventos", (_nome, fonte, memo) => {
    // `events` pode entrar para buscar o NOME/prioridade de um id que já veio da
    // lista; o que não pode é o conjunto de opções sair de lá — seria oferecer
    // evento do sistema inteiro sobre uma fila podada.
    const corpo = bloco(fonte, memo);
    expect(corpo).not.toMatch(/\(?events as any\[\]\)?\.forEach/);
    expect(corpo).not.toMatch(/\[\.\.\.\(?events/);
    expect(corpo).not.toMatch(/events\.map\(\(e: any\) => \(\{ value: e\.id/);
  });

  it("Atendimento/Histórico: os dois menus saem do pool da lista, não do sistema", () => {
    // Era o caso mais claro do defeito ao contrário: listavam TODOS os eventos e
    // TODOS os patrocinadores, sem contagem, sobre uma lista que só tem peça com
    // aprovação registrada.
    expect(bloco(ATENDIMENTO, "historyItems")).toContain("casaHistorico(item)");
    expect(bloco(ATENDIMENTO, "histEventOptions")).toContain("casaHistorico(i, 'evento')");
    expect(bloco(ATENDIMENTO, "histSponsorOptions")).toContain("casaHistorico(i, 'patrocinador')");
    expect(ATENDIMENTO).not.toContain("const histSponsorOptions = (sponsors as any[])");
  });
});
