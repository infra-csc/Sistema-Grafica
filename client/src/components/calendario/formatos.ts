// ─────────────────────────────────────────────────────────────────────────────
// Formatos do Calendário — só APRESENTAÇÃO (nomes de mês, faixa da semana,
// contagem regressiva). Nenhuma regra de data mora aqui: âncora, fuso e
// offsets dos prazos continuam na página (pages/calendario.tsx).
// ─────────────────────────────────────────────────────────────────────────────

export const NOMES_DOS_MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Domingo-primeiro, como a grade. */
export const DIAS_DA_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "16h 24min" — a contagem por extenso (faixa de 48h, semana, rótulos). */
export function horasEMinutos(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}min`;
}

/**
 * "16h" / "40min" — a contagem que CABE numa pílula de 150px. A versão por
 * extenso ("16h 24min") comia o nome do evento inteiro ("Corrid…").
 */
export function horasCurtas(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  if (h >= 1) return `${h}h`;
  return `${Math.max(1, Math.floor(ms / 60_000))}min`;
}

const dois = (n: number) => String(n).padStart(2, "0");

/** "09:00" */
export function horaMinuto(d: Date): string {
  return `${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** "qui, 08/10" */
export function diaCurto(d: Date): string {
  return `${DIA_CURTO[d.getDay()]}, ${dois(d.getDate())}/${dois(d.getMonth() + 1)}`;
}

/** "out" — a sigla do mês, para o bloco de data. */
export function mesCurto(d: Date): string {
  return NOMES_DOS_MESES[d.getMonth()].slice(0, 3).toLowerCase();
}

/** "4 a 10 de outubro" / "28 de setembro a 4 de outubro" (sem o ano). */
export function faixaDaSemana(d1: Date, d7: Date): string {
  const m1 = NOMES_DOS_MESES[d1.getMonth()].toLowerCase();
  const m7 = NOMES_DOS_MESES[d7.getMonth()].toLowerCase();
  return d1.getMonth() === d7.getMonth()
    ? `${d1.getDate()} a ${d7.getDate()} de ${m7}`
    : `${d1.getDate()} de ${m1} a ${d7.getDate()} de ${m7}`;
}

/** "Sexta-feira, 9 de outubro de 2026" — título do dialog do dia. */
export function diaPorExtenso(d: Date): string {
  const t = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
