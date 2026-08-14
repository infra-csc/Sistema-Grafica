// ─────────────────────────────────────────────────────────────────────────────
// STATUS → TELA DE TRABALHO ("Continuar em ⟨tela⟩"), regra pura.
//
// PORQUÊ ISTO EXISTE. Depois de achar o gargalo no Painel, o usuário fechava a
// ficha e fazia o roteamento MENTAL (awaiting_submission → Arte;
// awaiting_approval → Atendimento; ready_for_production → Gráfica) sem nenhuma
// ajuda da tela. Achar o problema e não ter para onde ir é meio produto.
//
// Os papéis de cada rota são cópia literal das constantes ROLES_* de App.tsx —
// se divergirem, o botão oferece um caminho que o RoleProtectedRoute recusa.
// Quando o papel não tem acesso, a função devolve `null` e a tela simplesmente
// não oferece o botão: melhor não sugerir do que sugerir e barrar.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProximaTela {
  path: string;
  /** Nome da tela como aparece no menu — o botão vira "Continuar em ⟨label⟩". */
  label: string;
  roles: readonly string[];
}

// Espelho de App.tsx (ROLES_ARTE, ROLES_VINCULAR, ...).
const TELAS = {
  vincular:    { path: "/vincular-patrocinadores", label: "Vincular Patrocinadores", roles: ["arte", "solicitacao", "atendimento", "admin"] },
  arte:        { path: "/arte",                    label: "Arte",                    roles: ["arte", "atendimento", "admin"] },
  atendimento: { path: "/atendimento",             label: "Atendimento",             roles: ["atendimento", "arte", "admin"] },
  solicitacao: { path: "/solicitacao",             label: "Solicitação",             roles: ["solicitacao", "admin"] },
  grafica:     { path: "/grafica",                 label: "Gráfica",                 roles: ["grafica", "solicitacao", "admin"] },
} as const satisfies Record<string, ProximaTela>;

/**
 * Onde a peça é trabalhada AGORA, por status.
 *
 * Os destinos foram conferidos contra a fila real de cada tela, não contra o
 * nome do status: `awaiting_final_review` vai para Solicitação (é o CRIADOR que
 * revisa o arquivo final — solicitacao.tsx filtra exatamente por este status),
 * e não para Atendimento, que seria o palpite óbvio.
 *
 * Status terminais (delivered, canceled) e rascunho não entram: não há fila.
 */
const TELA_DO_STATUS: Record<string, ProximaTela> = {
  requested:               TELAS.vincular,
  awaiting_linking:        TELAS.vincular,
  awaiting_submission:     TELAS.arte,
  awaiting_approval:       TELAS.atendimento,
  awaiting_sponsor_approval: TELAS.atendimento,
  awaiting_finalization:   TELAS.arte,
  sponsor_approved:        TELAS.arte,
  awaiting_creator_review: TELAS.arte,
  awaiting_final_review:   TELAS.solicitacao,
  ready_for_production:    TELAS.grafica,
  pronto_para_producao:    TELAS.grafica,
  approved:                TELAS.grafica,
  inProduction:            TELAS.grafica,
  produced:                TELAS.grafica,
  conferred:               TELAS.grafica,
};

/**
 * Tela onde este status é trabalhado, SE o papel tiver acesso a ela.
 * `null` = não há fila para o status, ou o papel não entra nessa tela.
 */
export function proximaTelaDoStatus(
  status: string | null | undefined,
  role: string | null | undefined,
): ProximaTela | null {
  if (!status || !role) return null;
  const tela = TELA_DO_STATUS[status];
  if (!tela) return null;
  return tela.roles.includes(role) ? tela : null;
}
