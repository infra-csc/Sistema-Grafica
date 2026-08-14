// ─────────────────────────────────────────────────────────────────────────────
// Prazo da tela de Atendimento — regra PURA, sem React.
//
// PORQUÊ ESTE ARQUIVO EXISTE. A conta do marco de Aprovação de Layout estava
// escrita DUAS vezes em atendimento.tsx: no selo do cabeçalho de evento da
// lista e no cabeçalho do modal de Revisão de Ativo. As duas divergiram na
// prática — o modal mostrava "Prazo · <saída do caminhão>" enquanto o card
// mostrava o marco de aprovação, semanas antes (commit d11295d). O filtro de
// atrasados seria a TERCEIRA cópia; em vez disso as três leem daqui.
//
// Testado em server/__tests__/atendimento-prazo.test.ts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Offset padrão do marco de Aprovação de Layout, em dias sobre a saída do
 * caminhão. Espelha `STAGE_DEFS` da etapa "aprovacao"
 * (server/services/prazo-domain.ts): mesmo campo de evento, mesmo padrão −12.
 */
export const OFFSET_APROVACAO_PADRAO = -12;

export interface PrazoAprovacao {
  /**
   * Instante bruto (saída do caminhão + offset), sem normalizar a hora — é o
   * que o cabeçalho do modal formata com dia e hora.
   */
  limite: Date;
  /** Meia-noite local do dia-limite: base da conta de dias e do selo do card. */
  dia: Date;
  /** Dias restantes: negativo = atrasado, 0 = vence hoje. */
  diff: number;
}

/** Meia-noite local — a âncora de "hoje" que os cálculos desta tela recebem. */
export function inicioDoDia(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Marco de APROVAÇÃO DE LAYOUT do evento — o prazo desta tela.
 *
 * QUAL MARCO, E POR QUE NÃO É A SAÍDA DO CAMINHÃO. O que se decide aqui é a
 * aprovação do patrocinador, e o marco dela é `deadlineAprovacaoLayout` (padrão
 * −12 dias sobre a saída). A saída do caminhão é o prazo mais FOLGADO do fluxo,
 * o fim da linha: cobrar o atendimento por ela daria semanas de folga que ele
 * não tem, e quase nenhuma peça apareceria como atrasada enquanto a decisão do
 * patrocinador já estivesse vencida havia dias.
 *
 * `null` quando o evento não tem saída marcada — sem âncora, qualquer data
 * seria inventada, e peça sem prazo não é peça atrasada.
 */
export function prazoAprovacaoLayout(event: any, hoje: Date): PrazoAprovacao | null {
  const raw = event?.truckDepartureDate;
  if (!raw) return null;
  const base = new Date(raw);
  if (!Number.isFinite(base.getTime())) return null;
  const offset = event.deadlineAprovacaoLayout ?? OFFSET_APROVACAO_PADRAO;
  const limite = new Date(base.getTime() + offset * 86400000);
  const dia = new Date(limite);
  dia.setHours(0, 0, 0, 0);
  return {
    limite,
    dia,
    diff: Math.ceil((dia.getTime() - hoje.getTime()) / 86400000),
  };
}

/** O evento já passou do marco de Aprovação de Layout? */
export function isEventoAtrasadoNaAprovacao(event: any, hoje: Date): boolean {
  const p = prazoAprovacaoLayout(event, hoje);
  return !!p && p.diff < 0;
}

/**
 * Recorte "só atrasadas" da lista de peças. O prazo é do EVENTO da peça — é
 * assim que a tela já mostra o selo, no cabeçalho do grupo de evento.
 */
export function filtrarAtrasadosNaAprovacao<T extends { eventId?: string | null }>(
  items: T[],
  eventoPorId: Map<string, any>,
  hoje: Date,
): T[] {
  return items.filter((i) =>
    isEventoAtrasadoNaAprovacao(i.eventId ? eventoPorId.get(i.eventId) : null, hoje),
  );
}
