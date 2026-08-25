// ─────────────────────────────────────────────────────────────────────────────
// A PRIORIDADE AUTOMÁTICA DO EVENTO (pedido do dono, 25/08).
//
// A régua é a SAÍDA DO CAMINHÃO — o prazo duro do negócio: tudo que a fila
// decide gira em torno de quando o material embarca. Dias CORRIDOS de
// propósito: fim de semana não estica prazo de caminhão, e a conta fica
// explicável em uma frase ("faltam N dias").
//
//   ≤ 3 dias  → urgente
//   ≤ 7 dias  → alta
//   ≤ 15 dias → média
//   > 15 dias → baixa
//   sem data, ou caminhão já saiu → sem prioridade (null)
//
// Quem aplica é o servidor (services/prioridadeAutomatica.ts), que respeita a
// TRAVA MANUAL: evento com prioridade definida à mão (events.priority_manual)
// não é tocado até alguém limpar. Esta função é pura — a régua mora aqui e os
// testes batem nela sem banco.
// ─────────────────────────────────────────────────────────────────────────────
export type PrioridadeDoEvento = "baixa" | "media" | "alta" | "urgente";

export const LIMITES_DA_PRIORIDADE = { urgente: 3, alta: 7, media: 15 } as const;

const UM_DIA_MS = 86_400_000;

export function prioridadePelaSaida(
  saidaMs: number | null,
  agoraMs: number,
): PrioridadeDoEvento | null {
  if (saidaMs === null || !Number.isFinite(saidaMs)) return null;
  const dias = Math.ceil((saidaMs - agoraMs) / UM_DIA_MS);
  // Caminhão já saiu: priorizar não muda mais nada — e um "urgente" eterno em
  // evento passado só dessensibiliza o vermelho de quem ainda está em jogo.
  if (dias < 0) return null;
  if (dias <= LIMITES_DA_PRIORIDADE.urgente) return "urgente";
  if (dias <= LIMITES_DA_PRIORIDADE.alta) return "alta";
  if (dias <= LIMITES_DA_PRIORIDADE.media) return "media";
  return "baixa";
}
