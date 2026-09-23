// Datas e frases de prazo da tela de Eventos (escopo de módulo: não dependem de estado).
import { T, N, TOM } from "@/lib/theme";
import type { NextMilestonePayload } from "./tipos";

export const parseDateStr = (s: string): Date | undefined => {
  s = (s || "").slice(0, 10); // blinda contra ISO completo ("...T00:00:00.000Z")
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};
export const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fmtDateBR = (s: string): string => {
  s = (s || "").slice(0, 10); // blinda contra ISO completo
  if (!s) return '';
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
};

/**
 * "10 mar" — e "10 mar 2027" quando o ano difere do corrente.
 *
 * ATENÇÃO: recebe o valor JÁ passado por `toUTCDisplayDate`, que desloca o
 * instante pelo offset do navegador exatamente para que a leitura LOCAL
 * (getFullYear, toLocaleDateString sem `timeZone`) devolva a hora de parede
 * gravada. Formatar esse mesmo valor com `timeZone:'UTC'` aplicaria o
 * deslocamento DUAS vezes: em Brasília uma saída às 08:00 virava 11:00, e uma
 * saída às 22:00 pulava para o dia (e às vezes o ano) seguinte.
 */
export function fmtCardDate(d: Date, currentYear: number): string {
  const base = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return d.getFullYear() === currentYear ? base : `${base} ${d.getFullYear()}`;
}

/** Frase de prazo do próximo marco. Os 5 rótulos são femininos ("Lista", "Entrega", "Aprovação", "Revisão", "Produção"). */
export function milestoneDueText(ms: NextMilestonePayload): string {
  if (ms.invalidDate) return 'prazo indisponível — confira a saída';
  const d = ms.daysRemaining;
  if (d < 0) return `atrasada há ${Math.abs(d)} ${Math.abs(d) === 1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'vence hoje';
  if (d === 1) return 'vence amanhã';
  return `vence em ${d} dias`;
}

export const MILESTONE_TONE = {
  overdue:  { text: TOM.perigo.text, bg: TOM.perigo.bg, border: TOM.perigo.border },
  warning:  { text: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border },
  upcoming: { text: T.apoio, bg: N.n2, border: T.border },
} as const;

// "-25" → "25 dias antes" (em vez do críptico "-25d").
export const fmtOffset = (d: number): string =>
  d === 0 ? 'no dia' : d < 0 ? `${-d} dia${-d > 1 ? 's' : ''} antes` : `${d} dia${d > 1 ? 's' : ''} depois`;
