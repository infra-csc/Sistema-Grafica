// ─────────────────────────────────────────────────────────────────────────────
// REGRA PURA DO RECORTE DA GRÁFICA (filtros da fila de produção).
//
// Por que este arquivo existe: os doze filtros da tela viviam como doze
// `useState` soltos, e cada lugar que precisava saber "há filtro ativo?" mantinha
// a lista À MÃO. Foi assim que os filtros de Grupo e Percurso entraram sem
// aparecer no `hasActiveFilters`: filtrar por Grupo sem correspondência fazia a
// tela afirmar "Nenhuma peça liberada ainda" — a tela mentindo justamente no
// momento em que o operador mais precisa de um caminho de volta.
//
// Aqui o recorte é UM objeto e tudo é derivado dele: a contagem de filtros
// ativos, a descrição para o empty state, a serialização para a URL e o próprio
// casamento item↔filtro. Filtro novo = um campo em GraficaFiltros e uma linha em
// CAMPOS; nunca mais uma lista escrita à mão em outro canto do arquivo.
//
// Tudo aqui é PURO: nada lê `window`, `Date.now()` nem estado de React. O "hoje"
// entra por parâmetro (ctx.hojeUTC) e a resolução de grupo entra como função
// (ctx.groupOf), porque ela depende do catálogo de Modelos carregado por query.
// ─────────────────────────────────────────────────────────────────────────────

import { isDelivered, isComplement, type SaldoItem } from "./saldo";
import { normalizarBusca } from "./utils";

/** Forma mínima de peça que o recorte enxerga (o item cru da API é `any`). */
export interface ItemGrafica extends SaldoItem {
  id?: string;
  displayId?: string | null;
  type?: string | null;
  description?: string | null;
  material?: string | null;
  finish?: string | null;
  eventId?: string | null;
  event?: { name?: string | null; truckDepartureDate?: string | Date | null } | null;
}

export interface GraficaFiltros {
  busca: string;
  status: string[];
  evento: string[];
  grupo: string[];
  percurso: string[];
  tipo: string[];
  material: string[];
  acabamento: string[];
  mes: string[];
  proximos10: boolean;
  complementos: boolean;
  /**
   * MOSTRAR as peças já entregues. O padrão é `false`: a tela abre na fila do
   * que falta fazer, não no arquivo histórico. Não conta como "filtro ativo"
   * (é o estado natural da tela), por isso vive fora de CAMPOS.
   */
  entregues: boolean;
}

export const FILTROS_VAZIOS: GraficaFiltros = {
  busca: "", status: [], evento: [], grupo: [], percurso: [], tipo: [],
  material: [], acabamento: [], mes: [], proximos10: false,
  complementos: false, entregues: false,
};

const MESES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * A tabela de campos: a ÚNICA lista de filtros do arquivo. Contagem de ativos,
 * descrição do empty state e serialização para a URL saem toda daqui.
 * `entregues` de propósito não entra (ver GraficaFiltros.entregues).
 */
const CAMPOS = [
  { chave: "busca",       url: "busca",      rotulo: "Busca" },
  { chave: "status",      url: "status",     rotulo: "Status" },
  { chave: "evento",      url: "evento",     rotulo: "Evento" },
  { chave: "grupo",       url: "grupo",      rotulo: "Grupo" },
  { chave: "percurso",    url: "percurso",   rotulo: "Percurso" },
  { chave: "tipo",        url: "tipo",       rotulo: "Tipo" },
  { chave: "material",    url: "material",   rotulo: "Material" },
  { chave: "acabamento",  url: "acabamento", rotulo: "Acabamento" },
  { chave: "mes",         url: "mes",        rotulo: "Mês" },
  { chave: "proximos10",  url: "proximos10", rotulo: "Próximos 10 dias" },
  { chave: "complementos", url: "complementos", rotulo: "Só complementos" },
] as const;

const vazio = (v: string | string[] | boolean): boolean =>
  Array.isArray(v) ? v.length === 0 : !v;

/** Filtros de fato aplicados pelo usuário, na ordem em que aparecem na barra. */
export function filtrosAtivos(f: GraficaFiltros): Array<{ chave: string; rotulo: string; valor: string }> {
  return CAMPOS
    .filter((c) => !vazio(f[c.chave] as any))
    .map((c) => {
      const v = f[c.chave] as string | string[] | boolean;
      return {
        chave: c.chave,
        rotulo: c.rotulo,
        valor: typeof v === "boolean" ? "" : Array.isArray(v) ? v.join(", ") : v,
      };
    });
}

export const contarFiltrosAtivos = (f: GraficaFiltros): number => filtrosAtivos(f).length;
export const temFiltroAtivo = (f: GraficaFiltros): boolean => contarFiltrosAtivos(f) > 0;

/**
 * Texto legível do que está ativo, para o empty state ("Grupo: Placa km ·
 * Próximos 10 dias"). Recebe os rótulos bonitos de quem sabe traduzi-los
 * (status e evento são ids/chaves na URL, não nomes).
 */
export function descreverFiltros(
  f: GraficaFiltros,
  bonito?: Partial<Record<string, (valores: string[]) => string>>,
): string[] {
  return filtrosAtivos(f).map(({ chave, rotulo, valor }) => {
    if (!valor) return rotulo;
    const tradutor = bonito?.[chave];
    const bruto = f[chave as keyof GraficaFiltros];
    const texto = tradutor && Array.isArray(bruto) ? tradutor(bruto) : valor;
    return `${rotulo}: ${texto}`;
  });
}

/** Nome do mês pelo número em texto ("8" → "Agosto"). Usado na descrição. */
export const nomeDoMes = (n: string): string => MESES[Number(n)] ?? n;

// ── URL ─────────────────────────────────────────────────────────────────────

const csv = (v: string | null): string[] => (v ? v.split(",").filter(Boolean) : []);

/** Lê o recorte da query string. Chave ausente = valor vazio (nunca lança). */
export function filtrosDaURL(search: string): GraficaFiltros {
  const p = new URLSearchParams(search);
  return {
    busca: p.get("busca") ?? "",
    status: csv(p.get("status")),
    evento: csv(p.get("evento")),
    grupo: csv(p.get("grupo")),
    percurso: csv(p.get("percurso")),
    tipo: csv(p.get("tipo")),
    material: csv(p.get("material")),
    acabamento: csv(p.get("acabamento")),
    mes: csv(p.get("mes")),
    proximos10: p.get("proximos10") === "1",
    complementos: p.get("complementos") === "1",
    entregues: p.get("entregues") === "1",
  };
}

/**
 * Devolve a query string com o recorte espelhado. Parte da query ATUAL e
 * sobrescreve só as chaves gerenciadas — um param alheio (`?item=` do deep link
 * do sino, utm_source, flag de debug) sobrevive à filtragem.
 */
export function filtrosParaQuery(searchAtual: string, f: GraficaFiltros): string {
  const p = new URLSearchParams(searchAtual);
  const por = (chave: string, valor: string) => (valor ? p.set(chave, valor) : p.delete(chave));
  for (const c of CAMPOS) {
    const v = f[c.chave] as string | string[] | boolean;
    por(c.url, typeof v === "boolean" ? (v ? "1" : "") : Array.isArray(v) ? v.join(",") : v);
  }
  // `entregues` só aparece na URL quando LIGADO: o padrão da tela é ocultar, e
  // um "?entregues=0" em todo link seria ruído sem informação.
  por("entregues", f.entregues ? "1" : "");
  return p.toString();
}

// ── PERCURSO das placas de quilometragem ────────────────────────────────────
// O app não tem campo para isso: a distância vive no texto da peça, na forma
// que a operação escreve — "10k - km 8", "5k - km 4", "5k/10k - km 1" (esta
// última pertence aos DOIS percursos). Casa "5k", "10km", "21,1k"; ignora o
// marcador "km 8" (exige dígito ANTES do k) e unidades como "kg" (lookahead).
const PERCURSO_RE = /(\d{1,3}(?:[.,]\d{1,2})?)\s*k(?:m|ms)?(?![a-z])/gi;

export function itemPercursos(item: ItemGrafica): string[] {
  const texto = `${item?.description ?? ""} ${item?.type ?? ""}`;
  const out = new Set<string>();
  PERCURSO_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PERCURSO_RE.exec(texto)) !== null) out.add(`${m[1].replace(".", ",")}k`);
  return Array.from(out);
}

/** Ordena percursos por distância ("5k" antes de "10k"; alfabética inverteria). */
export const ordemPercurso = (p: string): number => parseFloat(p.replace(",", ".")) || 0;

/**
 * Minúscula, sem acento, espaço colapsado — mesma regra da Arte.
 * Delega para `normalizarBusca` (lib/utils), a fonte única do app: os menus de
 * filtro precisam da MESMA normalização, e duas cópias divergentes foi como o
 * campo de busca dos dropdowns ficou cego a acento.
 */
export const normKey = (s: string): string => normalizarBusca(s);

// ── Casamento item ↔ recorte ────────────────────────────────────────────────

export interface CtxFiltros {
  /** Resolve o GRUPO da peça pelo catálogo de Modelos (depende de query). */
  groupOf: (type: string) => string;
  /** Meia-noite de HOJE em UTC — mesmo fuso em que a Saída é exibida. */
  hojeUTC: number;
}

/**
 * As dimensões que têm DROPDOWN com opções e contagem.
 *
 * A INVARIANTE DESTE ARQUIVO — a que ninguém percebe quebrando, e que é a razão
 * de `excluir` existir: FACETA E LISTA SAEM DO MESMO POOL. As opções de um
 * dropdown são calculadas com `itemCasaFiltros(item, f, ctx, { excluir: <esta
 * dimensão> })` sobre EXATAMENTE o mesmo array que alimenta a lista; a lista usa
 * a mesma função sem `excluir`. Assim o pool da faceta é, por construção, um
 * superconjunto da lista que difere só naquele filtro — e por isso:
 *   · a faceta nunca oferece MENOS do que a lista mostra (o operador vê a peça
 *     do evento na tela e o evento está no dropdown), e
 *   · a faceta nunca oferece MAIS do que a lista entrega (opção clicada nunca
 *     devolve lista vazia, e a contagem ao lado do nome é o número de linhas
 *     que o clique produz).
 *
 * `mes` entrou nesta lista depois: o dropdown de Mês era uma lista FIXA dos doze
 * meses, sem contagem — oferecia Janeiro sobre uma fila que só tem Agosto e o
 * clique devolvia vazio. O mesmo valia para Status, que era a lista fixa das
 * seis etapas. Filtro novo com dropdown = um nome aqui e uma linha em
 * `itemCasaFiltros`; sem isso ele volta a ser uma segunda fonte de verdade.
 */
export type FacetaGrafica =
  | "status" | "evento" | "grupo" | "percurso" | "tipo" | "material" | "acabamento" | "mes";

export interface OpcoesCasamento {
  /**
   * Ignora os três recortes com FORMA DE STATUS: o filtro de status, o chip de
   * complementos e a ocultação das entregues. É o pool que alimenta os cards
   * (cada card mostra a contagem do seu próprio status) — sem isto, o KPI
   * "Entregues" leria 0 justamente porque as entregues estão ocultas, e o chip
   * "Entregues ocultas (N)" não teria de onde tirar o N.
   */
  ignorarStatus?: boolean;
  /** Não aplica este filtro — usado para a contagem facetada de cada dropdown. */
  excluir?: FacetaGrafica;
}

/** "ready_for_production" e "pronto_para_producao" são a MESMA etapa (grafia legada). */
const casaStatus = (statusDoItem: string, escolhido: string): boolean =>
  escolhido === "ready_for_production"
    ? statusDoItem === "ready_for_production" || statusDoItem === "pronto_para_producao"
    : statusDoItem === escolhido;

/**
 * As entregues ficam ocultas por padrão — MAS não quando o operador pediu por
 * elas: escolher "Entregues" no filtro de status ou buscar uma peça pelo código
 * é pedir o arquivo explicitamente. Sem esta exceção, clicar no KPI "Entregues"
 * abriria uma lista vazia e o deep link do sino para uma peça já entregue não
 * acharia nada.
 */
export const escondeEntregues = (f: GraficaFiltros): boolean =>
  !f.entregues && !f.status.includes("delivered") && !f.busca.trim();

export function itemCasaFiltros(
  item: ItemGrafica,
  f: GraficaFiltros,
  ctx: CtxFiltros,
  opts: OpcoesCasamento = {},
): boolean {
  const { ignorarStatus = false, excluir } = opts;

  // Busca SEM acento e sem caixa (`normalizarBusca`, lib/utils): com
  // `toLowerCase()` puro, digitar "so quero pedalar" não achava
  // "SÓ QUERO PEDALAR SP" — o nome de evento é escrito em caixa alta e com
  // acento, e quem digita não desconfia do acento, conclui que a peça não está
  // lá. Mesma normalização do campo de busca dos dropdowns de filtro.
  if (f.busca.trim()) {
    const q = normalizarBusca(f.busca);
    if (!normalizarBusca(item.type).includes(q) &&
        !normalizarBusca(item.description).includes(q) &&
        !normalizarBusca(item.displayId).includes(q) &&
        !normalizarBusca(item.event?.name).includes(q)) return false;
  }

  // A ocultação das entregues é parte do recorte de STATUS: quem exclui o
  // filtro de status (faceta) ou o ignora (pool dos KPIs) exclui as duas.
  if (!ignorarStatus && excluir !== "status") {
    if (f.status.length > 0 && !f.status.some((s) => casaStatus(String(item.status ?? ""), s))) return false;
    if (escondeEntregues(f) && isDelivered(item)) return false;
  }
  if (!ignorarStatus && f.complementos && !isComplement(item)) return false;

  if (excluir !== "evento" && f.evento.length > 0 && !f.evento.includes(String(item.eventId ?? ""))) return false;
  if (excluir !== "grupo" && f.grupo.length > 0 && !f.grupo.includes(ctx.groupOf(String(item.type ?? "")))) return false;
  // Percurso casa com QUALQUER um dos selecionados: a placa "5k/10k" entra
  // tanto no filtro 5k quanto no 10k.
  if (excluir !== "percurso" && f.percurso.length > 0 && !itemPercursos(item).some((p) => f.percurso.includes(p))) return false;
  if (excluir !== "tipo" && f.tipo.length > 0 && !f.tipo.includes(String(item.type ?? ""))) return false;
  if (excluir !== "material" && f.material.length > 0 && !f.material.includes(String(item.material ?? ""))) return false;
  if (excluir !== "acabamento" && f.acabamento.length > 0 && !f.acabamento.includes(String(item.finish ?? ""))) return false;

  // ── Data de saída do caminhão (sempre em UTC, o fuso em que a Saída é
  // exibida na lista; com getMonth() local a virada de mês perto da meia-noite
  // caía no mês errado). Peça SEM data de saída não pertence a mês nenhum nem
  // aos "próximos 10 dias": os dois filtros a excluem, e não só um deles — era
  // o defeito do filtro de mês, que deixava passar quem não tinha data.
  const saida = item.event?.truckDepartureDate;
  const saidaUTC = (() => {
    if (!saida) return null;
    const d = new Date(saida as any);
    if (Number.isNaN(d.getTime())) return null;
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  })();

  if (f.proximos10) {
    if (saidaUTC === null) return false;
    if (!(saidaUTC >= ctx.hojeUTC && saidaUTC <= ctx.hojeUTC + 10 * 86400000)) return false;
  }
  if (excluir !== "mes" && f.mes.length > 0) {
    if (saidaUTC === null) return false;
    const mes = new Date(saidaUTC).getUTCMonth() + 1;
    if (!f.mes.includes(String(mes))) return false;
  }

  return true;
}

/**
 * O MÊS da peça ("8" = Agosto), pela saída do caminhão em UTC — a mesma conta do
 * recorte de mês em `itemCasaFiltros`. `null` para peça sem data de saída: ela
 * não pertence a mês nenhum, e é por isso que o filtro de mês a exclui.
 *
 * Existe para o dropdown de Mês poder listar SÓ os meses presentes no recorte,
 * com contagem — antes ele era a lista fixa dos doze, e escolher um mês sem
 * peça devolvia lista vazia sem explicar por quê.
 */
export function itemMes(item: ItemGrafica): string | null {
  const saida = item.event?.truckDepartureDate;
  if (!saida) return null;
  const d = new Date(saida as any);
  if (Number.isNaN(d.getTime())) return null;
  return String(d.getUTCMonth() + 1);
}

/** Meia-noite de hoje em UTC — a âncora que `itemCasaFiltros` espera. */
export function hojeEmUTC(agora: Date = new Date()): number {
  return Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate());
}
