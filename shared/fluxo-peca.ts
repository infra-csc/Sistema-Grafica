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
  "produced", "conferred", "packed", "delivered", "canceled", "archived",
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
  /book[\s_-]*completo/i.test(i?.type ?? "");

/**
 * PEÇA QUE JÁ FECHOU A RODADA DE APROVAÇÃO — e ainda não foi liberada para a
 * Gráfica. É a faixa entre "todos aprovaram" e "pronto para produção":
 * finalização da Arte e revisão.
 *
 * Duas ações leem DESTA lista, e é por isso que ela mora aqui em vez de em
 * cada uma:
 *   · REVOGAR uma aprovação (routes/items.ts) — linha "Aguardando" ⇒ a peça
 *     volta pendente no Atendimento, de qualquer status pós-aprovação;
 *   · ACRESCENTAR um patrocinador depois que a peça passou (routes/sponsors.ts,
 *     25/08) — a peça reabre para que SÓ o novo decida.
 *
 * As duas reabrem sem apagar trabalho: o arquivo final e a arte que a Arte já
 * subiu ficam. Reabrir é sobre a DECISÃO, não sobre o material.
 *
 * O corte no fim da lista é deliberado (decisão do dono, 25/08): da liberação
 * para a produção em diante, a peça é chão de fábrica — puxá-la de volta seria
 * tirar trabalho da mesa da Gráfica por uma decisão comercial.
 */
export const POS_APROVACAO: readonly string[] = [
  "sponsor_approved", "awaiting_finalization",
  // awaiting_creator_review é APELIDO LEGADO da mesma fase de revisão — o
  // servidor o traduz como "Aguardando Revisão Final", igual ao nome novo.
  // Ele faltou na primeira versão desta lista e a peça #3483 da Primavera RJ
  // foi recusada como "já é da Gráfica" estando em plena revisão (25/08).
  "awaiting_creator_review",
  "awaiting_final_review", "awaiting_review", "in_review",
];

/**
 * DIRETO PARA A FINALIZAÇÃO — os status de onde a Arte pode pular a aprovação
 * do Atendimento (decisão do dono, 09/09).
 *
 * A REGRA MUDOU DE DESTINO. Até 09/09 a ação jogava a peça em
 * `ready_for_production`: ela saía da mesa da Arte e caía na fila da Gráfica,
 * pulando aprovação, finalização E revisão. Sete peças do "Bota pra Correr SP"
 * passaram por lá e foram impressas e entregues SEM arquivo final no sistema —
 * o arquivo foi por fora. O dono decidiu: a peça pula só a aprovação do
 * Atendimento e vai para a FINALIZAÇÃO, onde a Arte sobe o arquivo final e a
 * Revisão ainda confere. As sete antigas ficam como estão.
 *
 * Por que a lista encolheu: com o destino sendo a finalização, oferecer a ação
 * a quem JÁ está nela (`sponsor_approved`, `awaiting_creator_review`) seria um
 * botão que não faz nada. Sobram os dois estados anteriores a ela.
 *
 * Mora aqui, e não em duas cópias, porque as duas divergiram: o cliente não
 * listava `awaiting_sponsor_approval` e o servidor sim — a Arte não via a
 * opção justamente na fase em que a peça trava esperando patrocinador. É a
 * dupla que o cabeçalho deste arquivo já apontava como candidata a migrar.
 */
export const DISPENSAVEIS: readonly string[] = [
  "awaiting_submission",
  "awaiting_sponsor_approval",
];

/** Onde a peça cai ao pular a aprovação: a fila de finalização da Arte. */
export const DESTINO_DA_DISPENSA = "awaiting_creator_review";

/**
 * AS MÁQUINAS DA GRÁFICA (dono, 14/09: "quando iniciar a produção, selecionar
 * a máquina; ainda não tenho as máquinas, então vira 1, 2, 3, 4").
 *
 * Por enquanto são só números. Quando as máquinas ganharem nome, é ESTA lista
 * que muda — o banco guarda o código ("1".."4") e a tela lê o rótulo daqui.
 * Nomear a máquina direto na coluna faria todo histórico antigo mudar de nome
 * junto, ou ficar com dois nomes para a mesma máquina.
 */
export const MAQUINAS_DE_IMPRESSAO: readonly string[] = ["1", "2", "3", "4"];

export const ehMaquinaValida = (m: unknown): m is string =>
  typeof m === "string" && MAQUINAS_DE_IMPRESSAO.includes(m);

/**
 * O NOME de cada impressora (dono, 21/09). Fonte ÚNICA: botões, seletor, aba
 * Máquinas, histórico, Excel e ficha leem daqui. O banco segue gravando só o
 * código ("1".."4") — trocar o nome aqui renomeia o passado junto, que é o
 * que se quer (é a mesma máquina física).
 */
export const NOMES_DAS_MAQUINAS: Readonly<Record<string, string>> = {
  "1": "Impressora 1 (New XT)",
  "2": "Impressora 2",
  "3": "Impressora 3",
  "4": "Impressora 4 (Targa Elite)",
};

export const rotuloDaMaquina = (m: string | null | undefined): string =>
  m ? (NOMES_DAS_MAQUINAS[m] ?? `Impressora ${m}`) : "máquina não informada";

/**
 * TUBOS (dono, 14/09: "na hora da conferência muitas peças vão no mesmo tubo;
 * nesta fase precisamos agrupar, e na entrega entregar por tubos").
 *
 * A peça pode ir para um tubo quando SAIU DA IMPRESSÃO — em acabamento /
 * conferência (produced) ou já conferida — e ainda não foi entregue. Antes
 * disso não há material para embalar. A lista mora aqui porque a tela
 * precisa saber o mesmo que o servidor recusa.
 */
export const PODE_IR_PARA_TUBO: readonly string[] = ["produced", "produzido", "conferred", "conferido", "packed"];

export const podeIrParaTubo = (status: string | null | undefined): boolean =>
  !!status && PODE_IR_PARA_TUBO.includes(status);

/**
 * EMBALADO — a etapa entre Conferido e Entregue (dono, 21/09: "precisava de
 * mais um status entre Conferidos e Entregue, que é aí que colocamos em tubos
 * as peças"; e o porquê: "hoje eles colocam Entregue, mas a foto é do tubo; a
 * entrega é feita depois").
 *
 * A ORDEM DO FIM DO FLUXO é: produced → conferred → packed → delivered.
 *
 * Como a peça entra e sai daqui (server/routes/tubos.ts é quem grava):
 *   · peça CONFERIDA colocada num tubo → packed (trilha "Embalada no Tubo N");
 *     peça em acabamento (produced) pode ir para o tubo, mas só vira packed
 *     quando a conferência dela fecha (routes/items.ts, confer);
 *   · tirada do tubo (ou tubo apagado) → volta a conferred;
 *   · tubo entregue → delivered. A entrega individual (PATCH /deliver) segue
 *     aceitando conferred (peça grande que não vai em tubo) E packed.
 *
 * Nada muda no que já está no banco: a etapa vale do dia da publicação em
 * diante (decisão do dono, 21/09 — sem reclassificar peça antiga). `packed`
 * está em PODE_IR_PARA_TUBO só para a peça poder MUDAR de tubo.
 */
export const EMBALADO = "packed";

export const ehEmbalada = (status: string | null | undefined): boolean => status === EMBALADO;

/** Conferida OU embalada: já passou pela conferência e ainda não saiu. */
export const POS_CONFERENCIA: readonly string[] = ["conferred", "conferido", EMBALADO];

export const ehPosConferencia = (status: string | null | undefined): boolean =>
  !!status && POS_CONFERENCIA.includes(status);
