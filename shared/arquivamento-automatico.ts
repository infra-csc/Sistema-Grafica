// ─────────────────────────────────────────────────────────────────────────────
// ARQUIVAMENTO AUTOMÁTICO (dono, 19/10): "excluir automaticamente do sistema
// os eventos que já foram realizados, umas 2 semanas pra frente; inativar na
// gráfica nesses casos". Escolha: ARQUIVAR (não apagar) — o mesmo arquivar do
// botão Excluir, com restauração pela tela de Arquivados.
//
// O que mora aqui é só o que servidor e tela precisam dizer igual: o prazo e
// a assinatura gravada em `events.arquivado_por`. A regra (quem vence, quando)
// e o agendador estão em server/services/arquivamento-automatico.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** Dias depois da DATA DO EVENTO até ele ser arquivado sozinho. */
export const DIAS_PARA_ARQUIVAR = 14;

/** O que fica em `arquivado_por` quando quem arquivou foi o agendador. */
export const ARQUIVADO_POR_AUTOMATICO = "Automático — 2 semanas após o evento";

/** Verdadeiro quando o arquivamento foi o automático (e não um admin). */
export function foiArquivadoAutomaticamente(arquivadoPor: string | null | undefined): boolean {
  return arquivadoPor === ARQUIVADO_POR_AUTOMATICO;
}
