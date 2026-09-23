// ─────────────────────────────────────────────────────────────────────────────
// REGRAS PURAS DO DETALHE DO EVENTO — sem React, sem rede. O cabeçalho, a
// timeline, a lista e o formulário leem daqui em vez de cada um ter a sua.
// ─────────────────────────────────────────────────────────────────────────────
import { STATUS } from "@/lib/status";
import { FORA_DO_FUNIL } from "@/lib/fases";
import { MARCOS_DO_EVENTO, type MarcoDoEvento } from "@shared/prazo-dates";
import { TIPOS_DE_PECA, statusParaContagem } from "@shared/molde";
import type { ItemFormData, Marco, PecaDoEvento, TrabalhoAberto } from "./tipos";

/**
 * QUAL ETAPA CADA STATUS JÁ CUMPRIU — a régua da timeline.
 *
 * Os seis marcos (lista de imagens 0, layouts 1, aprovação 2, finalização 3,
 * revisão 4, produção 5) são datas; as peças têm status. Esta tabela liga os
 * dois: uma peça está ATRÁS do marco `i` quando a etapa que ela cumpriu é
 * menor que `i + 1`. Os pontos de ancoragem vêm do handoff — aguardando
 * envio 0, aguardando aprovação 2, aguardando revisão 3, pronto para produção
 * 4, em produção 5, entregue 6 — e os status intermediários entram na
 * posição monotônica entre eles. Cancelada/excluída não está atrás de nada.
 */
const ETAPA_CUMPRIDA: Record<string, number> = {
  awaiting_linking: 0, awaiting_submission: 0,
  awaiting_approval: 2, awaiting_sponsor_approval: 2, sponsor_approved: 2, awaiting_finalization: 2,
  awaiting_creator_review: 3, awaiting_final_review: 3, awaiting_review: 3, in_review: 3,
  ready_for_production: 4, pronto_para_producao: 4, approved: 4, liberado: 4,
  inProduction: 5, em_producao: 5, produced: 5, produzido: 5, conferred: 5, packed: 5,
  delivered: 6, entregue: 6, canceled: 6, deleted: 6,
};
const etapaCumprida = (status: string) => ETAPA_CUMPRIDA[status] ?? 0;
/** A peça ainda não passou pelo marco `i`? */
export const estaAtrasDoMarco = (status: string, i: number) => etapaCumprida(status) < i + 1;

/** A ordem do fluxo, para as seções do modo Status: a ordem das chaves de STATUS em lib/status. */
export const ORDEM_DO_FLUXO = new Map(Object.keys(STATUS).map((k, i) => [k, i]));

/**
 * Por que os botões de montar a lista não aparecem — e QUEM pode. "Seu perfil
 * não edita" sozinho mandava a pessoa procurar a permissão errada.
 */
export const MOTIVO_SOMENTE_LEITURA = "Somente leitura — quem monta a lista deste evento é a Solicitação, um admin ou quem criou o evento.";

/** O que o cálculo dos marcos lê do evento: a saída e os offsets por coluna. */
export type EventoParaMarcos = { truckDepartureDate: string | Date } & Partial<Record<MarcoDoEvento["campo"], number | null>>;

/**
 * OS SEIS MARCOS, derivados da fonte única (@shared/prazo-dates) e ancorados
 * na SAÍDA DO CAMINHÃO: sábado→sexta, domingo→segunda, e `todosOsDias` só na
 * Produção Gráfica. Esta lista era escrita à mão aqui com CINCO marcos —
 * faltava a Finalização (−10), a mesma divergência que o Calendário teve.
 *
 * Função pura, fora do componente: o cabeçalho (frase de resolução) e a
 * timeline leem o MESMO resultado, em vez de cada um calcular o seu.
 */
export function calcularMarcos(event: EventoParaMarcos, today: Date): { marcos: Marco[]; countdownDays: number } {
  const departure = new Date(event.truckDepartureDate);
  const depDay = new Date(departure); depDay.setHours(0, 0, 0, 0);
  const countdownDays = Math.ceil((depDay.getTime() - today.getTime()) / 86400000);
  const adjustWeekend = (date: Date, skip: boolean): { date: Date; adjusted: 'fri' | 'mon' | null } => {
    if (skip) return { date, adjusted: null };
    const dow = date.getDay();
    if (dow === 6) { const d = new Date(date); d.setDate(d.getDate() - 1); return { date: d, adjusted: 'fri' }; }
    if (dow === 0) { const d = new Date(date); d.setDate(d.getDate() + 1); return { date: d, adjusted: 'mon' }; }
    return { date, adjusted: null };
  };
  const marcos = MARCOS_DO_EVENTO.map((m) => {
    const days: number = event[m.campo] ?? m.offset;
    const raw = new Date(departure); raw.setDate(raw.getDate() + days);
    const { date, adjusted } = adjustWeekend(raw, m.todosOsDias);
    const isPast = date < today;
    const isOverdue = isPast && countdownDays > 0;
    return { key: m.key, label: m.label, date, adjusted, isPast, isOverdue };
  });
  return { marcos, countdownDays };
}

export const plural = (n: number, um: string, muitos: string) => (n === 1 ? um : muitos);

// A lista única de tipos (com o Molde) mora em shared/molde.ts.
export const itemTypes = [...TIPOS_DE_PECA];
export const materials = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"];
export const finishes = ["Dupla Face", "Ilhós", "Impressão UV", "Impresso", "Recorte", "Refile"];

// Estado limpo do formulário de peça — o mesmo objeto de 14 campos era
// repetido em 3 lugares (useState inicial, reset pós-criação e fechamento),
// e qualquer campo novo tinha de ser adicionado três vezes.
export const EMPTY_ITEM_FORM: ItemFormData = {
  type: "",
  description: "",
  quantity: 1,
  visualWidth: "",
  visualHeight: "",
  fileWidth: "",
  fileHeight: "",
  material: "",
  finish: "",
  measurement: "",
  observations: "",
  skipApproval: false,
  // Peça PRIORITÁRIA: fura a fila da Arte e a avisa na hora.
  // Só admin|solicitacao mudam (gate no PATCH dispara na MUDANÇA de valor).
  isPriority: false,
  isReuse: false,
  referenceUrl: "",
  // O modelo de que a peça nasce (id), ou "" quando o tipo foi digitado.
  standardItemId: "",
  // KIT: a remessa do Kit a que a peça pertence; "" = Arena.
  kitRemessaId: "",
};

// Apenas nomes do vocabulário canônico (lib/status.ts): os antigos
// 'em_producao'/'produzido'/'entregue'/'liberado' não existem no banco e
// faziam o gate nunca disparar. 'approved' e 'conferred' entram no bloqueio
// de edição — antes dava para editar peça liberada/conferida mas não
// excluí-la, um gate incoerente.
export const BLOCKED_EDIT_STATUSES = ["ready_for_production", "pronto_para_producao", "approved", "inProduction", "produced", "conferred", "packed", "delivered"];

/** Chave tolerante a maiúscula/acento/espaço — casa tipo com modelo e grupo. */
export const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Peças que ficaram para trás — o número que a confirmação precisa dizer. */
export function contarTrabalhoAberto(items: readonly PecaDoEvento[]): TrabalhoAberto {
  const OUT = FORA_DO_FUNIL;
  const DONE = new Set(['delivered', 'entregue']);
  const PROD = new Set(['inProduction', 'em_producao']);
  let ativas = 0, entregues = 0, emProducao = 0;
  for (const it of items) {
    if (OUT.has(it.status)) continue;
    ativas += 1;
    if (DONE.has(statusParaContagem(it))) entregues += 1;
    else if (PROD.has(it.status)) emProducao += 1;
  }
  return { ativas, entregues, emProducao, abertas: ativas - entregues };
}

/**
 * A frase de resolução: onde o evento está, em uma linha derivada dos dados.
 * `atrasDoMarco[i]` = quantas peças ainda não passaram pelo marco `i`.
 */
export function fraseDeResolucao(
  t: number,
  entregues: number,
  marcosDoEvento: { marcos: Marco[]; countdownDays: number } | null,
  atrasDoMarco: number[],
): string | null {
  if (t === 0) return null;
  if (entregues === t) return `Todas as ${t} ${plural(t, 'peça entregue', 'peças entregues')}.`;
  const d = marcosDoEvento?.countdownDays ?? null;
  const caminhao = d === null ? '' : d < 0 ? ` O caminhão saiu há ${Math.abs(d)} ${plural(Math.abs(d), 'dia', 'dias')}.` : d === 0 ? ' O caminhão sai hoje.' : ` O caminhão sai em ${d} ${plural(d, 'dia', 'dias')}.`;
  const vencidos = (marcosDoEvento?.marcos ?? []).map((m, i) => ({ m, i })).filter(({ m, i }) => m.isOverdue && atrasDoMarco[i] > 0);
  if (vencidos.length > 0) {
    // As peças atrás de um marco são subconjunto das atrás do seguinte:
    // o total "atrás" é o do marco vencido mais avançado.
    const p = atrasDoMarco[vencidos[vencidos.length - 1].i];
    const n = vencidos.length;
    return `${n} ${plural(n, 'marco já venceu', 'marcos já venceram')} com ${p} ${plural(p, 'peça atrás', 'peças atrás')}.${caminhao}`;
  }
  return `${entregues} de ${t} ${plural(t, 'peça entregue', 'peças entregues')} ·${caminhao ? caminhao.replace(/^ /, ' ').replace(/^ O/, ' o') : ' sem data de saída.'}`;
}
