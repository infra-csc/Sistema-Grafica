// ─────────────────────────────────────────────────────────────────────────────
// CHIP DE PRAZO DO EVENTO — regra pura, testável, sem React.
//
// PORQUÊ ISTO EXISTE. A regra antiga era puramente calendário:
//
//   isHistorical = inicioDoEvento < hoje − 3 dias
//   saída no passado → "Atrasado Xd" (vermelho)   … a não ser que isHistorical
//   isHistorical     → "Encerrado" (cinza)
//
// O cadastro de evento PROÍBE saída no mesmo dia ou depois do início
// (eventos.tsx rejeita `truckDate >= startDate`). Logo, em TODO evento vale
// `saída < início`, e existe uma janela garantida — de `saída + 1 dia` até
// `início + 3 dias` — em que o chip mostra ATRASADO vermelho mesmo com 100%
// das peças entregues. Depois dessa janela ele vira "Encerrado" cinza, apagando
// justamente o evento com 40 peças paradas. O único sinal de urgência da tela
// errava nos dois sentidos, sempre.
//
// A regra nova cruza CALENDÁRIO com ESTADO REAL das peças. Vermelho só quando
// o caminhão já saiu E ainda há peça pendente; saída passada com tudo
// entregue é história ("Saiu há Xd", neutro), não alarme.
//
// A data de INÍCIO do evento deixou de participar do cálculo: ela nunca disse
// nada sobre o prazo da gráfica — o prazo é a saída do caminhão.
// ─────────────────────────────────────────────────────────────────────────────
import { isPlausibleEventYear } from "@shared/prazo-dates";
import { FINAL_STATUSES } from "@/lib/status";

export const DIA_MS = 86_400_000;

export type PrazoTone = "danger" | "warning" | "neutral";

/**
 * Cores do chip. Todas passam AA 4,5:1 sobre #ffffff e sobre a zebra #f6f4f1,
 * com folga, em 10px peso 800:
 *   #b91c1c 6,47:1 · #b45309 5,02:1 · #746e69 5,03:1
 * Nenhuma cor proibida pela régua da casa (#f97316/#a8a29e) entra aqui.
 */
export const PRAZO_COLORS: Record<PrazoTone, string> = {
  danger: "#b91c1c",
  warning: "#b45309",
  neutral: "#746e69",
};

/** Faixa (em dias) em que a saída futura já merece âmbar — alinhada ao event-detail. */
export const PRAZO_ALERTA_DIAS = 3;

export interface PrazoChip {
  /** Texto curto do chip (caixa alta é aplicada no CSS). */
  text: string;
  /** Frase completa para `title`/leitor de tela — o chip curto é ambíguo fora de contexto. */
  srLabel: string;
  tone: PrazoTone;
  color: string;
  /** Dias até a saída (negativo = saída no passado). `null` quando a data é inválida. */
  dias: number | null;
}

/**
 * Diferença em dias entre dois instantes JÁ NORMALIZADOS à meia-noite local.
 *
 * `Math.round` e não `Math.ceil`: a tela usava as duas contas sobre exatamente
 * a mesma diferença (ceil no filtro de data, round no chip). Hoje coincidem
 * porque as duas pontas são meia-noite e o Brasil não tem horário de verão —
 * é o par que diverge silenciosamente na primeira mudança de qualquer um dos
 * dois pressupostos. `round` também absorve o ±1h de um eventual DST futuro.
 */
export function dayDiff(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / DIA_MS);
}

/** Peça que ainda consome prazo: qualquer status fora dos terminais. */
export function isPendingItemStatus(status: string | null | undefined): boolean {
  return !!status && !(FINAL_STATUSES as readonly string[]).includes(status);
}

/** Quantas peças da lista ainda consomem prazo (ignora soft-deleted). */
export function countPendentes(items: Array<{ status?: string | null; deletedAt?: unknown }>): number {
  let n = 0;
  for (const i of items) if (!i.deletedAt && isPendingItemStatus(i.status)) n++;
  return n;
}

/**
 * Chip de prazo de um evento.
 *
 * @param truckDayMs  saída do caminhão normalizada à meia-noite local, ou null
 * @param todayMs     hoje à meia-noite local
 * @param pendentes   peças do evento que ainda não chegaram a um status terminal
 *
 * Devolve `null` quando o evento não tem data de saída — ausência de prazo não
 * é um estado a ser pintado, é a ausência do chip.
 */
export function computeDeadlineChip(
  truckDayMs: number | null | undefined,
  todayMs: number,
  pendentes: number,
): PrazoChip | null {
  if (truckDayMs == null || !Number.isFinite(truckDayMs)) return null;

  // Guarda de sanidade preservada da versão anterior: saída no ano 0206 (typo
  // de 2026) produzia "ATRASADO 664730D". Dado absurdo é problema de CADASTRO —
  // o chip aponta a correção em vez de fazer a conta fiel do lixo. A faixa mora
  // em @shared/prazo-dates, a mesma que a validação de escrita do servidor usa.
  if (!isPlausibleEventYear(new Date(truckDayMs).getFullYear())) {
    return {
      text: "Data de saída inválida — corrija o evento",
      srLabel: "A data de saída do caminhão deste evento é inválida. Corrija o cadastro do evento.",
      tone: "danger",
      color: PRAZO_COLORS.danger,
      dias: null,
    };
  }

  const d = dayDiff(todayMs, truckDayMs);

  if (d > 0) {
    const urgente = d <= PRAZO_ALERTA_DIAS;
    return {
      text: `Faltam ${d}d`,
      srLabel: `Faltam ${d} ${d === 1 ? "dia" : "dias"} para a saída do caminhão`,
      tone: urgente ? "warning" : "neutral",
      color: urgente ? PRAZO_COLORS.warning : PRAZO_COLORS.neutral,
      dias: d,
    };
  }

  if (d === 0) {
    return {
      text: "Sai hoje",
      srLabel: "O caminhão deste evento sai hoje",
      tone: "warning",
      color: PRAZO_COLORS.warning,
      dias: 0,
    };
  }

  const atraso = Math.abs(d);

  // Caminhão já saiu E sobrou peça: ESTE é o vermelho que vale. Sem carência,
  // sem "Encerrado" por cima — era exatamente este o caso que a regra antiga
  // apagava em cinza.
  if (pendentes > 0) {
    return {
      text: `Atrasado ${atraso}d · ${pendentes} pendente${pendentes > 1 ? "s" : ""}`,
      srLabel: `Caminhão saiu há ${atraso} ${atraso === 1 ? "dia" : "dias"} com ${pendentes} ${pendentes === 1 ? "peça pendente" : "peças pendentes"}`,
      tone: "danger",
      color: PRAZO_COLORS.danger,
      dias: d,
    };
  }

  // Caminhão saiu e não sobrou nada: é história, não urgência. Texto preserva o
  // número (o "Encerrado" antigo jogava fora a informação) e usa a mesma frase
  // do event-detail, para as duas telas nunca mais discordarem do mesmo evento.
  return {
    text: `Saiu há ${atraso}d`,
    srLabel: `O caminhão saiu há ${atraso} ${atraso === 1 ? "dia" : "dias"}; nenhuma peça pendente`,
    tone: "neutral",
    color: PRAZO_COLORS.neutral,
    dias: d,
  };
}
