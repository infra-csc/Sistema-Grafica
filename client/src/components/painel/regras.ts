// ─── Regras puras do Painel Geral ───────────────────────────────────────────
// Constantes de módulo e funções sem estado: não dependem de React e são
// hoisted para não serem realocadas a cada render.
import { STATUS, getStatusLabel } from "@/lib/status";
import type { GroupKey } from "@/lib/painel-kpis";
import { T, TOM } from "@/lib/theme";
import type { PecaDoPainel } from "./tipos";

// Faixas do filtro de data (diff em dias até a saída do caminhão).
export const DATE_RANGE_MAP: Record<string, (diff: number) => boolean> = {
  today: d => d === 0, next3days: d => d >= 0 && d <= 3, next7days: d => d >= 0 && d <= 7,
  next10days: d => d >= 0 && d <= 10, next15days: d => d >= 0 && d <= 15,
  next30days: d => d >= 0 && d <= 30, overdue: d => d < 0,
};

// Rótulos do filtro de data — fonte única para o dropdown e os chips ativos.
export const DATE_FILTER_LABELS: Record<string, string> = {
  overdue: "Caminhão já saiu", today: "Sai hoje",
  next3days: "Sai em até 3 dias", next7days: "Sai em até 7 dias",
  next10days: "Sai em até 10 dias", next15days: "Sai em até 15 dias",
  next30days: "Sai em até 30 dias", no_departure: "Sem data de saída",
};
export const DATE_FILTER_VALUES = Object.keys(DATE_FILTER_LABELS);

// ─── Filtro de FOCO — os três recortes que a operação pede sem parar ────────
// Não são status nem datas: são cruzamentos (reprovação de patrocinador,
// caminhão que já saiu com peça pendente, "esconde o que já acabou"). Vivem
// numa dimensão própria para poderem ser combinados com qualquer status.
export const FOCO_LABELS: Record<string, string> = {
  reprovadas: "Reprovadas pelo patrocinador",
  atrasadas: "Em evento com caminhão atrasado",
  pendentes: "Só pendências",
};

/** Opções do menu de Foco — constantes; inline, nasciam novas a cada render. */
export const FOCO_OPTIONS = Object.keys(FOCO_LABELS).map((value) => ({ value, label: FOCO_LABELS[value], pinned: true }));

// Title do card "Outros": o rótulo pt-BR quando o status tem um, e só o valor
// desconhecido entre aspas — é ele que o admin precisa para investigar.
export const tituloDoCardOutros = (crus: string[]) =>
  `Peças com status fora das etapas do fluxo: ${crus.map((s) => (STATUS[s] ? getStatusLabel(s) : s === "(sem status)" ? "sem status" : `“${s}” (não reconhecido)`)).join(", ")}`;

// Opções do dropdown de status, na ordem do fluxo (rótulos via getStatusLabel).
// `draft` entrou com opção PRÓPRIA: o card "Solicitado" anuncia "inclui N
// rascunhos" e não existia caminho nenhum para ver só eles — a tela fazia a
// pergunta e não dava a resposta.
export const STATUS_FILTER_VALUES = [
  "requested", "draft", "awaiting_linking", "awaiting_submission",
  "awaiting_approval", "awaiting_finalization", "awaiting_final_review",
  "ready_for_production", "approved", "inProduction", "produced",
  "conferred", "packed", "delivered", "canceled",
];

// Altura FIXA do header sticky de evento — o thead sticky usa este valor como
// `top` para encostar exatamente abaixo dele (ver comentários na tabela).
export const EVENT_HEADER_H = 62;

// Renderização incremental: cada evento mostra até ROW_CAP linhas e a lista
// abre até GROUP_CAP eventos; o resto entra sob demanda. Sem o teto de GRUPOS,
// 40 eventos ativos (o estado padrão da tela, sem filtro) rendiam até 2000 <tr>
// de uma vez — e a tela recebe invalidação por WebSocket a cada mutação de
// QUALQUER usuário, então um lote de 30 peças virava cascata de re-render.
export const ROW_CAP = 50;
export const GROUP_CAP = 5;

// ─── Renderização incremental por ORÇAMENTO de linhas ───────────────────────
// O teto antigo (5 eventos × 50 linhas) montava até 250 linhas na abertura, e
// a primeira dobra mostra umas oito: o primeiro evento já passa de 3.000px.
// Agora a tela monta um orçamento inicial e uma sentinela no fim do que foi
// montado pede o próximo lote quando o usuário chega a ~1.500px dela. O
// resultado final é o MESMO conjunto de antes (os mesmos tetos, os mesmos
// botões "Mostrar"); só deixa de ser montado de uma vez o que ninguém vê.
// Contadores, KPIs, busca e exportação continuam sobre a lista inteira — o
// orçamento só decide o que vai para o DOM.
export const LINHAS_INICIAIS = 40;
export const LINHAS_POR_LOTE = 60;
/** Cabeçalho do evento (+ thead ou botão "Mostrar") custa ~2 linhas de altura. */
export const CUSTO_CABECALHO = 2;

// Zonas dos KPIs — as três fases do fluxo. 12 cards iguais obrigavam a
// escanear um a um para achar o gargalo.
//
// ── TEMPO NO ESTADO ────────────────────────────────────────────────────────
//
// O painel respondia ONDE as peças estão e nunca DESDE QUANDO. 1.129 peças em
// "Aguardando envio" pode ser vazão normal ou travamento de duas semanas — e
// essa é exatamente a pergunta de quem procura gargalo. Status é posição;
// faltava duração.
//
// A fonte é `items.status_changed_at`, coluna que o servidor carimba em toda
// transição (ver shared/schema.ts para por que não serve `updatedAt` nem o
// audit_log). NULO É LEGÍTIMO: peça anterior ao backfill, em status sem
// carimbo de etapa, não tem como saber — e a tela não exibe idade nessas
// linhas em vez de mostrar a idade desde a criação como se fosse tempo no
// estado. Um campo vazio diz "não sei"; um número errado diz "sei" e mente.
export const ZONA_ENTRADA: GroupKey[] = ["requested", "awaiting_linking"];
export const ZONA_APROVACAO: GroupKey[] = ["awaiting_submission", "awaiting_approval", "awaiting_finalization", "awaiting_final_review"];
export const ZONA_PRODUCAO: GroupKey[] = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "packed", "delivered"];

// ─── Tom NEUTRO por zona, para as barras de distribuição ────────────────────
// As barras pintavam cada etapa com a cor do seu status: até 13 matizes numa
// faixa de 14px, logo abaixo dos chips vermelho e âmbar de atenção — a cor que
// SIGNIFICA alguma coisa (atraso, reprovação) competia com cor que só
// identifica. Nenhuma etapa do fluxo é, por si, um risco.
//
// O tom agora diz AVANÇO: quanto mais escuro, mais perto da entrega. Três
// degraus da escala stone, os mesmos tokens do resto da tela. A identidade de
// cada etapa continua onde ela é lida — no nome do card, no title e no
// aria-label do segmento, e na pílula de status de cada linha.
export const TOM_ZONA_ENTRADA = T.bdark;
export const TOM_ZONA_APROVACAO = T.muted;
export const TOM_ZONA_PRODUCAO = T.apoio;
export function tomDaZona(k: GroupKey): string {
  if (ZONA_ENTRADA.includes(k)) return TOM_ZONA_ENTRADA;
  if (ZONA_APROVACAO.includes(k)) return TOM_ZONA_APROVACAO;
  if (ZONA_PRODUCAO.includes(k)) return TOM_ZONA_PRODUCAO;
  return T.border; // canceladas: fora do avanço
}

/** Número com separador de milhar pt-BR: "2.099", não "2099". */
export const fmtN = (n: number) => n.toLocaleString("pt-BR");

/** Acima disto, a peça não está em fluxo: está parada. */
export const LIMITE_PARADA = 7;

export const DIA_MS = 86_400_000;
export const HORA_MS = 3_600_000;

/** Lista vazia ESTÁVEL: `data = []` no destructuring cria um array novo a cada
 *  render enquanto a query carrega, e todo useMemo que depende dele refaz. */
export const LISTA_VAZIA: never[] = [];

/** Mesmo resultado de `localeCompare(x, "pt-BR")` (a especificação define um
 *  pelo outro), sem montar o collator de novo a cada comparação do sort. */
export const COLLATOR_PT = new Intl.Collator("pt-BR");

/** O mínimo que a idade lê: o carimbo da última mudança de status. */
type ComCarimbo = { statusChangedAt?: string | Date | null; status_changed_at?: string | Date | null };

// Parse do carimbo memoizado por peça. `diasNoEstado` roda por peça no
// comparador do sort por tempo, nos cabeçalhos de evento e na barra do fluxo —
// dezenas de milhares de `new Date(string)` por clique com 5.000 peças. O
// objeto da peça é imutável no cache do React Query (o delta-sync cria objetos
// novos), e o texto bruto entra na chave para não servir carimbo velho.
const CARIMBO_MS = new WeakMap<object, { bruto: string; t: number }>();
function carimboEmMs(item: object, bruto: string): number {
  const c = CARIMBO_MS.get(item);
  if (c && c.bruto === bruto) return c.t;
  const t = new Date(bruto).getTime();
  if (item && typeof item === "object") CARIMBO_MS.set(item, { bruto, t });
  return t;
}

/**
 * Dias inteiros desde a última mudança de status, ou `null` quando não há
 * registro. O `null` percorre a tela toda: nenhuma das três leituras inventa
 * um número quando ele falta.
 */
export function diasNoEstado(item: ComCarimbo, agoraMs: number): number | null {
  const bruto = item?.statusChangedAt ?? item?.status_changed_at;
  if (!bruto) return null;
  const t = typeof bruto === "string" ? carimboEmMs(item, bruto) : new Date(bruto).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((agoraMs - t) / DIA_MS));
}

/**
 * Tom pela idade. Até o limite é FLUXO e fica discreto — pintar de vermelho
 * tudo que tem três dias transformaria o alerta em papel de parede, e a tela
 * inteira em ruído. Acima do limite o dado vira acionável e o peso sobe junto
 * com a cor: cor sozinha não é sinal para quem não a distingue.
 */
export function tomDaIdade(dias: number): { cor: string; peso: number } {
  if (dias > 14) return { cor: TOM.perigo.text, peso: 700 };
  if (dias > LIMITE_PARADA) return { cor: TOM.alerta.text, peso: 700 };
  return { cor: T.second, peso: 500 };
}

/** "há 1 dia" / "há 12 dias" / "hoje". */
export const idadePorExtenso = (d: number) => (d === 0 ? "hoje" : d === 1 ? "há 1 dia" : `há ${d} dias`);

// ─── Texto de busca por peça, memoizado ─────────────────────────────────────
// A busca testava cinco campos com toLowerCase() cada, e o recorte roda a
// busca uma vez por MENU com contagem (evento, tipo, patrocinador, data) além
// da lista: ~30 toLowerCase por peça por tecla. Os campos são os mesmos e na
// mesma ordem; o separador \u0001 impede um acerto atravessando dois campos
// (fim do tipo + começo do evento), que a busca campo a campo nunca dava.
const TEXTO_DE_BUSCA = new WeakMap<object, string>();
export function textoDeBusca(item: PecaDoPainel): string {
  let t = TEXTO_DE_BUSCA.get(item);
  if (t === undefined) {
    t = [
      item.type ?? "",
      item.event?.name || "",
      item.displayId ?? "",
      item.description || "",
      ...(Array.isArray(item.sponsors) ? item.sponsors.map((s) => s?.name || "") : []),
    ].join("\u0001").toLowerCase();
    TEXTO_DE_BUSCA.set(item, t);
  }
  return t;
}

/** Agrupa as linhas visíveis por Grupo Pai → Tipo, na ordem de exibição. */
export function secoesDoGrupo(visibleItems: PecaDoPainel[], typeToGroup: Record<string, string>) {
  // Group by Grupo Pai first, then by type within each
  // group. typeToGroup vem do memo do topo (fonte única).
  const groupMap: Record<string, Record<string, PecaDoPainel[]>> = {};
  for (const item of visibleItems) {
    const g = typeToGroup[item.type] || '';
    if (!groupMap[g]) groupMap[g] = {};
    if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
    groupMap[g][item.type].push(item);
  }
  const sortedGroups = Object.keys(groupMap).sort((a, b) => {
    if (a === '') return 1; if (b === '') return -1;
    return COLLATOR_PT.compare(a, b);
  });
  return sortedGroups.map((group) => ({ group, tipos: Object.entries(groupMap[group]) }));
}
