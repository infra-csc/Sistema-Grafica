// ─────────────────────────────────────────────────────────────────────────────
// IDADE NA FASE — fonte única (UX, 27/08). "Há quanto tempo a peça está
// parada onde está" existia só na Arte; a Gráfica e o Atendimento mostravam a
// MESMA peça sem essa informação, e a régua de cores vivia copiada. Uma régua,
// três telas: mesmo número, mesma cor, mesmo significado em qualquer fila.
//
// Deriva de `statusChangedAt` (a última mudança de status, gravada pelo
// servidor a cada transição). Peça SEM esse registro NÃO exibe idade:
// inferir da criação daria um número plausível e errado — uma peça criada há
// oito meses que entrou na fase ontem apareceria como "há 240d", e quem
// procura gargalo agiria sobre isso.
// ─────────────────────────────────────────────────────────────────────────────

export function diasNaFase(item: any, hoje: Date): number | null {
  const bruto = item?.statusChangedAt ?? item?.status_changed_at;
  if (!bruto) return null;
  const t = new Date(bruto).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((hoje.getTime() - t) / 86400000));
}

/** A escala da casa: até 7 dias é rotina; de 7 a 13 pede olhar; 14+ é gargalo. */
export function tomDaIdade(dias: number): { cor: string; peso: number } {
  if (dias >= 14) return { cor: "#b91c1c", peso: 700 };
  if (dias >= 7) return { cor: "#b45309", peso: 700 };
  return { cor: "#78716c", peso: 600 };
}
