// ─────────────────────────────────────────────────────────────────────────────
// CONTRATO de GET /api/analises/operacao (admin) — os agregados da nova
// Análises (dono, 01/10: "bem completo, onde o gestor da empresa abra e
// consiga ver tudo, por abas") que o CLIENTE não tem como calcular a partir de
// /api/items: decisões por patrocinador, diário das máquinas, tubos, ações por
// pessoa, estoque e pedidos.
//
// O estado ATUAL das peças (quantas em cada status, há quanto tempo, atrasadas
// na etapa) NÃO está aqui: a tela já tem /api/items em mãos e calcula em
// client/src/lib/analises-estado.ts — um número só, sem segunda fonte.
//
// Querystring: de, ate (ISO, janela das séries e dos totais "no período"),
// evento (id), patrocinador (id). Tudo opcional; sem `de`, os últimos 30 dias.
//   · `de`/`ate` aceitam "AAAA-MM-DD" (dia de Brasília: `de` vale desde a
//     meia-noite, `ate` INCLUI o dia inteiro) ou um instante ISO completo. A
//     janela é [de, ate). Data inválida, início depois do fim ou mais de 366
//     dias → 400 com a frase em pt-BR. "all" ou vazio em evento/patrocinador
//     = sem filtro.
//   · Regra e I/O em server/services/analises-operacao.ts (testes em
//     server/__tests__/analises-operacao.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface JanelaDaOperacao {
  de: string;
  ate: string;
  evento: string | null;
  patrocinador: string | null;
}

/** Aba Aprovação — leitura, nunca cobrança. */
export interface AprovacaoDaOperacao {
  /**
   * Linhas de aprovação pendentes AGORA — status pending ou
   * new_version_pending, a bola com o PATROCINADOR (awaiting_arte é a Arte
   * refazendo) — E só quando a PEÇA está na etapa de aprovação
   * (awaiting_approval / awaiting_sponsor_approval, STATUS_DA_ETAPA): a linha
   * nasce pending no vínculo e fica assim com a peça em rascunho, na Arte ou
   * já adiante. Peças fora do funil, excluídas e BOOK COMPLETO não contam.
   * Vale também para esperaPorPatrocinador.
   */
  pendentesAgora: number;
  /** Ranking dos patrocinadores com decisão pendente, maior espera primeiro. */
  esperaPorPatrocinador: {
    sponsorId: string;
    nome: string;
    pecasPendentes: number;
    /**
     * Dias de espera da pendente mais antiga. O relógio é o da PEÇA
     * (items.statusChangedAt — o mesmo da tela para "há quanto tempo na
     * etapa"); o updatedAt da linha só entra para peça sem esse carimbo.
     */
    diasMaisAntiga: number;
    /** Mediana de dias de espera das pendentes (mesmo relógio). */
    diasMediana: number;
  }[];
  /**
   * Decisões do patrocinador DENTRO da janela, lidas da TRILHA ("Patrocinador
   * X aprovou/reprovou o item"): a linha de aprovação apaga a decisão quando
   * a arte renova; a trilha, não.
   */
  decididasNoPeriodo: { aprovadas: number; reprovadas: number };
  /** Motivos de reprovação mais frequentes na janela (texto normalizado; no máximo 10). */
  motivosDeReprovacao: { motivo: string; vezes: number }[];
  /**
   * Mediana de dias entre a linha nascer/renovar e a decisão, na janela.
   * "Renovar" = a versão da arte mais recente ANTES da decisão
   * (item_art_versions) — a linha não guarda quando voltou a ficar pendente.
   * Lida das linhas que AINDA carregam a decisão (approvedAt/rejectedAt).
   * Decisão de peça SEM versão de arte registrada antes dela sai da amostra:
   * o único carimbo restante seria o nascimento da linha, no vínculo do
   * patrocinador, e inflaria a mediana (o contrato não traz o tamanho da
   * amostra; null = nenhuma decisão medível na janela).
   */
  diasAteDecidirMediana: number | null;
}

/**
 * Aba Gráfica — o diário das máquinas e os volumes.
 *
 * "Unidades" impressas são as dos registros "parcial" e "conclusao" do diário
 * (a mesma régua do Resumo do dia da aba Máquinas); m² = unidades × m² por
 * unidade da peça (calculatedM2 ÷ quantity).
 */
export interface GraficaDaOperacao {
  /**
   * Uma linha por impressora conhecida (inclusive as paradas, com zero), na
   * ordem de MAQUINAS_DE_IMPRESSAO; códigos desconhecidos vêm depois.
   * `maquina` é o RÓTULO (rotuloDaMaquina); `codigo`, o que o banco grava.
   * `pecas` = peças distintas com algum registro na janela.
   */
  porMaquina: { maquina: string; codigo: string; unidades: number; m2: number; registros: number; pecas: number }[];
  /** Série por dia (YYYY-MM-DD, fuso de Brasília), unidades e m² impressos. Contínua: dia sem impressão vem com zero. */
  porDia: { dia: string; unidades: number; m2: number }[];
  /**
   * Volumes. abertos/fechados = TUBOS (não avulsos) ainda não entregues, sem e
   * com fechamento; avulsosAbertos = volumes avulsos ainda não entregues;
   * entreguesNoPeriodo = volumes (tubos + avulsos) entregues na janela.
   */
  tubos: { abertos: number; fechados: number; entreguesNoPeriodo: number; avulsosAbertos: number };
  /** UNIDADES embaladas e entregues por dia (tubo_itens.embaladoEm / entregueEm). Contínua, como porDia. */
  embaladasPorDia: { dia: string; embaladas: number; entregues: number }[];
}

/**
 * As naturezas em que a trilha é agrupada, NA ORDEM DO FLUXO (é a ordem de
 * exibição). A chave é o texto que a tela mostra. Quem cai em cada uma:
 * naturezaDaAcao em server/services/analises-operacao.ts.
 *   · "enviar lista" = a Solicitação manda a lista para a Vinculação/Arte;
 *     "enviar arte" = a Arte manda thumb, arquivo final ou book;
 *     "trocar arte" = a Arte substitui thumb ou arquivo já enviado;
 *   · "liberar" = a decisão da Revisão Final (Solicitação/admin);
 *     "devolver" = qualquer devolução que não é reprovação do patrocinador;
 *   · "estoque" = pedidos ao estoque, reservas, triagem e reaproveitamento;
 *   · "cancelar" = cancelar, excluir, restaurar e descancelar peça;
 *   · "prazos" = registro na Gestão de Prazos; "cadastros" = patrocinador,
 *     usuário, modelos, catálogo, cotas e destinatários de aviso.
 */
export const NATUREZAS_DAS_ACOES = [
  "evento", "pedido de peça", "criar peça", "editar peça", "vincular patrocinador", "enviar lista",
  "enviar arte", "trocar arte", "aprovar", "reprovar", "liberar", "devolver", "travar", "estoque",
  "imprimir", "etiquetas", "conferir", "embalar", "entregar", "cancelar", "prazos", "cadastros", "outras",
] as const;
export type NaturezaDaAcao = (typeof NATUREZAS_DAS_ACOES)[number];

/** Aba Pessoas — VOLUME DE AÇÕES, não nota de desempenho. */
export interface PessoasDaOperacao {
  /** Mais ações primeiro. "Sistema" (rotinas automáticas) não é pessoa e fica de fora. */
  porPessoa: {
    nome: string;
    /** Papel ATUAL do usuário (users.role); null quando a linha não tem usuário ligado. */
    papel: string | null;
    total: number;
    /** Ações agrupadas por natureza (NATUREZAS_DAS_ACOES); só as naturezas com ação aparecem. */
    // A pessoa é o usuário do cadastro: pelo user_id da linha ou, sem ele,
    // pelo nome (sem caixa nem acento). papel null = o nome não casa com
    // ninguém (ou casa com dois homônimos).
    porAcao: Record<string, number>;
  }[];
  /**
   * Quantas linhas da trilha foram lidas e se bateu no `teto` (fica o mais
   * recente; o começo da janela é o que se perde).
   * `soAcoesEmPecas`: com filtro de evento/patrocinador só contam as ações
   * sobre PEÇAS desse recorte (tubo, estoque e cadastros não têm evento).
   */
  cobertura: { linhasLidas: number; truncado: boolean; teto: number; soAcoesEmPecas: boolean };
}

/**
 * Aba Estoque e reaproveitamento.
 *
 * O acervo (ativosPor*) é FOTO DE AGORA e não tem evento: o filtro de evento
 * não o recorta; o de patrocinador recorta pelos patrocinadores impressos no
 * ativo (sponsorIds).
 */
export interface EstoqueDaOperacao {
  /** trackingStatus cru (NO_GALPAO, EM_USO, AGUARDANDO_TRIAGEM, DESCARTADO); unidades = soma de quantity. */
  ativosPorSituacao: { situacao: string; unidades: number; registros: number }[];
  /** condition crua (PERFEITO, AVARIA_LEVE, SUCATA) dos ativos NÃO descartados. */
  ativosPorCondicao: { condicao: string; unidades: number }[];
  /**
   * Reaproveitado × impresso entre as peças ENTREGUES na janela (deliveredAt):
   * é a entrega que prova que a unidade do estoque foi usada de fato. Peça com
   * reaproveitamento PARCIAL conta nos dois lados (as unidades se dividem);
   * isReuse = a quantidade toda veio do estoque.
   */
  reaproveitadas: { pecas: number; unidades: number; m2: number };
  impressas: { pecas: number; unidades: number; m2: number };
  /** Pedidos da Revisão Final ao estoque (consultas_de_estoque): abertos agora; respondidos (atendida, parcial ou não atendida) na janela. */
  pedidosAoEstoque: { abertos: number; respondidosNoPeriodo: number };
  /** Solicitações de peça do Atendimento, contadas POR PEÇA pedida (pedidos_de_peca_linhas; o pedido antigo sem linhas conta como uma). */
  pedidosDePeca: { abertos: number; atendidosNoPeriodo: number; recusadosNoPeriodo: number };
}

/** Aba Arte — retrabalho real, por versões. */
export interface ArteDaOperacao {
  /** Versões criadas na janela, por origem (envio | reenvio | troca). */
  versoesNoPeriodo: Record<string, number>;
  /**
   * Peças com 3+ versões (retrabalho), as piores primeiro, no máximo 20.
   * Entram as peças com alguma versão NA JANELA, e conta-se o histórico
   * inteiro delas (a 3ª versão é retrabalho mesmo que a 1ª seja antiga).
   */
  pecasComMaisVersoes: { itemId: string; displayId: string | null; versoes: number }[];
}

export interface OperacaoDaAnalise {
  janela: JanelaDaOperacao;
  geradoEm: string;
  aprovacao: AprovacaoDaOperacao;
  grafica: GraficaDaOperacao;
  pessoas: PessoasDaOperacao;
  estoque: EstoqueDaOperacao;
  arte: ArteDaOperacao;
}
