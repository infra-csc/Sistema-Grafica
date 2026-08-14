// ─────────────────────────────────────────────────────────────────────────────
// FRESCOR DO DADO — "Atualizado há X", regra pura.
//
// PORQUÊ ISTO EXISTE. O painel dizia "Acompanhamento em tempo real" e a ÚNICA
// fonte de atualização era o WebSocket: com `staleTime: Infinity`,
// `refetchOnWindowFocus: false` e `refetchInterval: false` no queryClient, se o
// socket caísse (servidor reiniciado, proxy corporativo, notebook que dormiu) a
// tela congelava indefinidamente na última mensagem recebida — sem aviso.
// Numa operação ancorada na hora de saída do caminhão, decidir a partir de um
// painel de 40 minutos atrás é pior do que não ter painel: o usuário confia
// porque a tela afirma que é tempo real.
//
// Regra do dono: NADA de botão "Atualizar" — a tela se atualiza sozinha. O que
// resta ao usuário é saber DESDE QUANDO o que ele está lendo é verdade.
// ─────────────────────────────────────────────────────────────────────────────

/** A partir daqui o carimbo deixa de ser verde e passa a avisar. */
export const FRESCOR_ALERTA_MS = 3 * 60_000;

export type FrescorTone = "fresco" | "envelhecendo";

export interface Frescor {
  /** "agora mesmo", "há 4 min", "há 2 h" — sempre precedido de "Atualizado" na tela. */
  texto: string;
  tone: FrescorTone;
  /** Frase completa para o `title`/leitor de tela. */
  srLabel: string;
}

/**
 * Quanto tempo faz desde a última resposta do servidor.
 *
 * `updatedAtMs = 0` é o valor que o TanStack devolve antes da primeira
 * resposta: nesse caso não existe carimbo nenhum a mostrar (a tela está no
 * esqueleto de carregamento), e devolver "há 56 anos" seria pior que nada.
 */
export function formatFrescor(updatedAtMs: number, nowMs: number): Frescor | null {
  if (!updatedAtMs) return null;

  // Relógio do cliente atrasado em relação ao carimbo (ou ajuste de horário no
  // meio da sessão) daria "há -2 min". Trata como recém-atualizado.
  const deltaMs = Math.max(0, nowMs - updatedAtMs);
  const tone: FrescorTone = deltaMs >= FRESCOR_ALERTA_MS ? "envelhecendo" : "fresco";

  if (deltaMs < 45_000) {
    return { texto: "agora mesmo", tone, srLabel: "Dados atualizados agora mesmo" };
  }

  const min = Math.round(deltaMs / 60_000);
  if (min < 60) {
    return {
      texto: `há ${min} min`,
      tone,
      srLabel: `Dados atualizados há ${min} ${min === 1 ? "minuto" : "minutos"}`,
    };
  }

  const horas = Math.floor(min / 60);
  return {
    texto: `há ${horas} h`,
    tone,
    srLabel: `Dados atualizados há ${horas} ${horas === 1 ? "hora" : "horas"}`,
  };
}
