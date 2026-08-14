// ─────────────────────────────────────────────────────────────────────────────
// VISÕES SALVAS DO PAINEL — regra pura.
//
// PORQUÊ ISTO EXISTE. A home é IDÊNTICA para os 5 papéis, que têm trabalhos
// completamente diferentes, e cada usuário remontava todo dia a mesma
// combinação de 2-3 filtros (~6 cliques). Uma visão é só um conjunto de
// filtros nomeado — como os filtros já vivem na URL, ela é literalmente um
// link compartilhável.
//
// A visão do PAPEL é derivada da fila real de cada tela (a mesma tabela que
// painel-rotas.ts usa para "Continuar em ⟨tela⟩"), não de um palpite: se as
// duas divergirem, o painel manda a pessoa para uma tela onde a peça não está.
// ─────────────────────────────────────────────────────────────────────────────

/** Só as dimensões que uma visão controla. As demais (busca, evento, tipo, patrocinador) ficam como estão. */
export interface VisaoFiltros {
  status: string[];
  saida: string[];
  foco: string[];
}

export interface Visao {
  id: string;
  label: string;
  /** Frase do `title` — o rótulo curto não explica o recorte. */
  hint: string;
  filtros: VisaoFiltros;
}

const vazio = (): VisaoFiltros => ({ status: [], saida: [], foco: [] });

/** Visões comuns a todos os papéis, na ordem em que aparecem na tela. */
export const VISOES_BASE: Visao[] = [
  {
    id: "atrasados",
    label: "Atrasados",
    hint: "Peças pendentes em eventos cujo caminhão já saiu",
    filtros: { ...vazio(), foco: ["atrasadas"] },
  },
  {
    id: "sai7",
    label: "Sai em 7 dias",
    hint: "Peças de eventos com saída de caminhão nos próximos 7 dias",
    filtros: { ...vazio(), saida: ["next7days"] },
  },
  {
    id: "reprovadas",
    label: "Reprovadas",
    hint: "Peças com reprovação de algum patrocinador",
    filtros: { ...vazio(), foco: ["reprovadas"] },
  },
  {
    id: "ag_patrocinador",
    label: "Aguardando patrocinador",
    hint: "Peças paradas na decisão do patrocinador",
    filtros: { ...vazio(), status: ["awaiting_approval"] },
  },
  {
    id: "prontos",
    label: "Prontos para produção",
    hint: "Peças liberadas, esperando a Gráfica",
    filtros: { ...vazio(), status: ["ready_for_production", "approved"] },
  },
];

/**
 * A fila do papel — o recorte que essa pessoa abriria de qualquer jeito.
 * `admin` não tem fila própria (vê o fluxo inteiro), então não ganha a visão.
 */
export function visaoDoPapel(role: string | null | undefined): Visao | null {
  switch (role) {
    case "arte":
      return { id: "meu_papel", label: "Minha fila (Arte)", hint: "Peças aguardando envio ou finalização da Arte", filtros: { ...vazio(), status: ["awaiting_submission", "awaiting_finalization"] } };
    case "atendimento":
      return { id: "meu_papel", label: "Minha fila (Atendimento)", hint: "Peças aguardando decisão do patrocinador", filtros: { ...vazio(), status: ["awaiting_approval"] } };
    case "solicitacao":
      return { id: "meu_papel", label: "Minha fila (Solicitação)", hint: "Peças aguardando vinculação ou sua revisão final", filtros: { ...vazio(), status: ["awaiting_linking", "awaiting_final_review"] } };
    case "grafica":
      return { id: "meu_papel", label: "Minha fila (Gráfica)", hint: "Peças liberadas ou já em produção", filtros: { ...vazio(), status: ["ready_for_production", "approved", "inProduction"] } };
    default:
      return null;
  }
}

/** Visões oferecidas a este papel: a fila dele primeiro, depois as comuns. */
export function visoesParaPapel(role: string | null | undefined): Visao[] {
  const minha = visaoDoPapel(role);
  return minha ? [minha, ...VISOES_BASE] : VISOES_BASE;
}

const mesmoConjunto = (a: string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");

/**
 * A visão está ativa? Comparação por CONJUNTO, não por ordem — o usuário pode
 * ter chegado ao mesmo recorte pelos dropdowns, e nesse caso o botão tem de
 * aparecer marcado (senão ele clica e "nada acontece").
 */
export function visaoEstaAtiva(visao: Visao, atual: VisaoFiltros): boolean {
  return (
    mesmoConjunto(atual.status, visao.filtros.status) &&
    mesmoConjunto(atual.saida, visao.filtros.saida) &&
    mesmoConjunto(atual.foco, visao.filtros.foco)
  );
}

/** Chave do localStorage da visão fixada como padrão (por papel — papéis diferentes, filas diferentes). */
export function chaveVisaoPadrao(role: string | null | undefined): string {
  return `painel-geral:visao-padrao:${role ?? "anon"}`;
}
