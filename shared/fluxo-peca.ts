// ─────────────────────────────────────────────────────────────────────────────
// REGRAS DO FLUXO DA PEÇA QUE VALEM NOS DOIS LADOS (frente 6 do diagnóstico).
//
// O padrão que este arquivo inaugura: quando o cliente precisa saber uma
// regra para NÃO OFERECER o que o servidor nega, a regra mora AQUI — não
// escrita duas vezes com um teste comparando as cópias. Um teste que só
// confere se duas listas continuam iguais é sintoma, não solução: ele pega a
// divergência depois que ela foi escrita, e o shared/ a torna inescrevível.
//
// Candidatas a migrar para cá quando forem tocadas (uma por vez, com o teste
// de paridade morrendo junto): DISPENSAVEIS_STATUSES (arte-rules × items.ts),
// o espelho podeEditar × guardas de papel (hoje coberto por
// shared/permissoes.ts), e o funil de arte-rules × prazo-domain.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Estados em que a peça JÁ SAIU da mesa da Arte.
 *
 * Usado pela devolução ao solicitante (decisão do dono, 24/08: devolver vale
 * de qualquer estado): devolver daqui é legítimo, mas não é rotina — some uma
 * linha da fila de outra equipe. O servidor marca a trilha ("JÁ FORA DA
 * ARTE") e o diálogo da Arte avisa a consequência antes do clique. Os dois
 * leem DESTA lista.
 */
export const DEPOIS_DA_ARTE: ReadonlySet<string> = new Set([
  "ready_for_production", "approved", "inProduction",
  "produced", "conferred", "delivered", "canceled", "archived",
]);

/**
 * O único estado que a devolução recusa: o próprio rascunho. Devolver o que
 * já está na criação não muda nada — e ainda zeraria os campos de aprovação.
 */
export const naoDevolvivel = (status: string): boolean => status === "draft";
