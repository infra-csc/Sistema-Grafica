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

/**
 * Peça NA REVISÃO — o degrau imediatamente antes de ser liberada para a
 * Gráfica (os mesmos três status da etapa "revisao" do funil de prazos).
 *
 * Pedido do dono (24/08): a Gráfica passa a VER essas peças na fila dela —
 * é o trabalho que está chegando — mas não pode agir sobre elas. O gate vale
 * nos dois lados: a tela esconde as ações, e o servidor recusa a conferência
 * (uma peça em revisão com reaproveitamento marcado passava pelo caminho do
 * reuso, que não olha status).
 */
export const EM_REVISAO: ReadonlySet<string> = new Set([
  "awaiting_final_review", "awaiting_review", "in_review",
]);

/**
 * PEÇA "BOOK COMPLETO" — o book inteiro do evento cadastrado como UMA peça,
 * para o patrocinador aprovar o conjunto pelo fluxo do Atendimento (nasceu
 * num teste, 25/08, e virou regra do dono).
 *
 * Ela só existe para esse trâmite: não é imprimível, não tem m² real, não
 * entra em prazo de produção. Por isso APARECE SÓ NO ATENDIMENTO (e na
 * Correção da Arte quando reprovada — senão a v2 não teria porta de reenvio)
 * e SOME de todo o resto: Painel, Gráfica, Revisão, Prazos, Análises,
 * Versões, busca, etiquetas, relatório e digests. O Detalhe do Evento a
 * mantém — é o registro bruto, e é por lá que ela se edita ou se exclui.
 */
export const ehBookCompleto = (i: { type?: string | null } | null | undefined): boolean =>
  /books*completo/i.test(i?.type ?? "");
