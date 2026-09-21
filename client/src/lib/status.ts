// ─────────────────────────────────────────────────────────────────────────────
// FONTE ÚNICA DE VERDADE para status (rótulo + cores + ícone).
//
// Antes existiam 4+ mapas divergentes (status-badge.tsx, painel-geral
// STATUS_CONFIG, dashboard-analises, grafica, item-details/timeline): o mesmo
// status aparecia com nome diferente ("Prod." vs "Produção") e cor diferente
// ("Produzido" roxo numa tela, rosa noutra). Isto centraliza tudo aqui.
//
// Acessibilidade: `text` é sempre o tom ESCURO (700/800) — passa WCAG AA sobre
// o `bg` claro. A `dot` (bolinha) usa o tom saturado (500), que não precisa de
// contraste de texto. As paletas antigas usavam a cor saturada COMO texto, o
// que reprovava AA.
// ─────────────────────────────────────────────────────────────────────────────
import { Clock, CheckCircle, Package, PackageCheck, Truck, XCircle, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  EVENT_CLOSED_STATUS,
  eventDayMs,
  isEventoFinalizado,
  motivoEventoFinalizado,
  todayBusinessMs,
} from "@shared/prazo-dates";
import type { EventoFinalizadoMotivo, EventoFinalizavel } from "@shared/prazo-dates";

export interface StatusMeta {
  label: string;      // rótulo completo (desktop)
  short: string;      // rótulo curto (mobile / espaços apertados)
  bg: string;         // fundo do badge (tint claro)
  text: string;       // texto/ícone — tom escuro AA
  border: string;     // borda (tint médio)
  dot: string;        // bolinha de status (tom saturado)
  icon: LucideIcon;   // ícone (para o StatusBadge com ícone)
}

/**
 * Paleta base por "família" de cor — reutilizada pelos status.
 * bg = 50, border = 100/200, text = 700/800 (AA), dot = 500.
 *
 * EXPORTADA porque era privada e todo mundo redigitava o hex à mão. Uma tarja
 * de erro escrita como `#fef2f2` + `#fecaca` num arquivo de tela é a MESMA
 * coisa que `P.red.bg` + `P.red.border`, com a diferença de que a cópia não
 * acompanha a origem — foi assim que um cinza aposentado voltou para a Gestão
 * de Prazos e um vermelho reprovado em contraste sobreviveu em cinco telas.
 */
export const P = {
  neutral: { bg: "#f5f5f4", border: "#e7e5e4", text: "#44403c", dot: "#78716c" },
  blue:    { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", dot: "#3b82f6" },
  sky:     { bg: "#f0f9ff", border: "#bae6fd", text: "#0369a1", dot: "#0ea5e9" },
  amber:   { bg: "#fffbeb", border: "#fde68a", text: "#b45309", dot: "#f59e0b" },
  orange:  { bg: "#fff7ed", border: "#fed7aa", text: "#c2410c", dot: "#f97316" },
  purple:  { bg: "#faf5ff", border: "#e9d5ff", text: "#7e22ce", dot: "#a855f7" },
  fuchsia: { bg: "#fdf4ff", border: "#f5d0fe", text: "#a21caf", dot: "#d946ef" },
  teal:    { bg: "#f0fdfa", border: "#99f6e4", text: "#0f766e", dot: "#14b8a6" },
  green:   { bg: "#f0fdf4", border: "#bbf7d0", text: "#15803d", dot: "#22c55e" },
  emerald: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857", dot: "#10b981" },
  cyan:    { bg: "#ecfeff", border: "#a5f3fc", text: "#0e7490", dot: "#06b6d4" },
  pink:    { bg: "#fdf2f8", border: "#fbcfe8", text: "#be185d", dot: "#ec4899" },
  red:     { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", dot: "#ef4444" },
} as const;

function meta(label: string, short: string, pal: typeof P[keyof typeof P], icon: LucideIcon): StatusMeta {
  return { label, short, bg: pal.bg, text: pal.text, border: pal.border, dot: pal.dot, icon };
}

// Mapa canônico. Cobre o fluxo atual, os status "legacy" (compatibilidade de
// leitura), os status de EVENTO (created/completed) e as variações em português
// que a dispensa da Arte grava (pronto_para_producao).
export const STATUS: Record<string, StatusMeta> = {
  // ── Início do fluxo ──
  draft:                 meta("Rascunho",                "Rascunho",       P.neutral, Clock),
  requested:             meta("Solicitado",              "Solicitado",     P.blue,    Clock),
  awaiting_linking:      meta("Aguardando Vinculação",   "Ag. Vinculação", P.neutral, Clock),
  awaiting_submission:   meta("Aguardando Envio",        "Ag. Envio",      P.sky,     Clock),
  // ── Aprovação de patrocinador ──
  awaiting_approval:         meta("Aguardando Aprovação",  "Ag. Aprovação",   P.amber, Clock),
  awaiting_sponsor_approval: meta("Aguardando Aprovação",  "Ag. Aprovação",   P.amber, Clock),
  // ── Revisão interna / finalização ──
  awaiting_finalization:   meta("Aguardando Finalização", "Ag. Finalização", P.purple, Clock),
  sponsor_approved:        meta("Aguardando Finalização", "Ag. Finalização", P.purple, Clock),
  awaiting_creator_review: meta("Aguardando Finalização", "Ag. Finalização", P.purple, Clock),
  awaiting_final_review:   meta("Aguardando Revisão Final","Ag. Revisão",     P.fuchsia, Clock),
  // Variações registradas em ITEM_STATUSES (shared/schema) que circulam no
  // banco — sem elas, telas que exibem o status cru mostravam a chave inglesa.
  awaiting_review:         meta("Aguardando Revisão",     "Ag. Revisão",     P.fuchsia, Clock),
  in_review:               meta("Em Revisão",             "Em Revisão",      P.fuchsia, Clock),
  // ── Pronto / liberado ──
  ready_for_production:  meta("Pronto para Produção",   "Pronto Prod.",   P.teal,  CheckCircle),
  pronto_para_producao:  meta("Pronto para Produção",   "Pronto Prod.",   P.teal,  CheckCircle),
  approved:              meta("Liberado",               "Liberado",       P.green, CheckCircle),
  // ── Produção / entrega ──
  // short = "Em Produção" (não "Produzindo"): no Painel Geral os cards
  // "Produzindo" e "Produzido" ficavam lado a lado com 1 letra de diferença —
  // impossível de escanear. "Em Produção" tem o mesmo tamanho e zero ambiguidade.
  // 14/09 (dono): "Em Produção" virou "Em Impressão" — a peça está NA
  // MÁQUINA — e "Produzido" virou "Impresso / Acabamento" (21/09): saiu da
  // máquina e ainda precisa de acabamento e conferência. O curto do segundo
  // é "Impresso" — UM rótulo curto só, o do cartão da Gráfica (decisão de 21/09:
  // Atendimento dizia "Acabamento" e a Gráfica "Impresso" para a mesma etapa).
  // "Acabamento" sozinho fica para frases ("em acabamento"), nunca como selo.
  inProduction:          meta("Em Impressão",           "Em Impressão",   P.orange,  Package),
  produced:              meta("Impresso / Acabamento",        "Impresso",   P.pink,    CheckCircle),
  conferred:             meta("Conferido",              "Conferido",      P.cyan,    CheckCircle),
  // EMBALADO (dono, 21/09): conferida e dentro de um tubo, à espera do
  // caminhão. Azul de propósito — fica entre o ciano de Conferido e o verde
  // de Entregue sem se confundir com nenhum dos dois (text 700, AA no bg 50).
  packed:                meta("Embalado",               "Embalado",       P.blue,    PackageCheck),
  delivered:             meta("Entregue",               "Entregue",       P.emerald, Truck),
  // ── Aliases LEGADOS em português (dados antigos ainda gravados assim) ──
  // Apontam para os mesmos metas dos status canônicos correspondentes
  // (liberado→approved, em_producao→inProduction, produzido→produced,
  // entregue→delivered). Sem eles, o badge caía no fallback "—".
  liberado:              meta("Liberado",               "Liberado",       P.green,   CheckCircle),
  em_producao:           meta("Em Impressão",           "Em Impressão",   P.orange,  Package),
  produzido:             meta("Impresso / Acabamento",        "Impresso",   P.pink,    CheckCircle),
  entregue:              meta("Entregue",               "Entregue",       P.emerald, Truck),
  // ── Encerrados ──
  canceled:              meta("Cancelado",              "Cancelado",      P.red, XCircle),
  deleted:               meta("Excluído",               "Excluído",       P.red, XCircle),
  // ── Status de EVENTO ──
  created:               meta("Criado",                 "Criado",         P.amber, Clock),
  // "Concluído": termo usado na lista de eventos (chips/badges) — o badge do
  // detalhe usa este mesmo rótulo para não divergir.
  completed:             meta("Concluído",              "Concluído",      P.green, CheckCircle),
  // "closed" = encerramento MANUAL (alguém clicou em Encerrar evento). Neutro
  // de propósito: verde diria "deu tudo certo" e âmbar diria "corre atrás" —
  // encerrado não é nenhum dos dois. Sem esta entrada o badge do detalhe do
  // evento caía no fallback "—".
  closed:                meta("Encerrado",              "Encerrado",      P.neutral, Lock),
};

// ─────────────────────────────────────────────────────────────────────────────
// O SIGNIFICADO DE CADA STATUS — o que quer dizer, de quem é a vez, o que vem.
//
// PORQUÊ EXISTE. O rótulo "Aguardando Finalização" responde "em que etapa",
// mas não responde as três perguntas que quem chega faz em seguida: "aguardando
// QUEM?", "onde isso se resolve?" e "e depois?". A resposta vivia na cabeça de
// quem já usava o sistema — e em pedaços espalhados (a faixa da ficha da peça,
// o texto de cada fila). Aqui ela fica ao lado do rótulo, e o StatusBadge e o
// StatusPill a mostram sozinhos: toda tela ganha o significado sem mudar nada.
//
// CONFERIDO NO CÓDIGO, não de memória (16/09). Cada "quem age" saiu da guarda
// de perfil da rota que faz a peça ANDAR a partir daquele status:
//   draft/requested     → POST /api/events/:id/items/submit     (solicitacao, admin)
//   awaiting_linking    → POST /api/items/send-to-arte           (arte, solicitacao, atendimento, admin)
//   awaiting_submission → PATCH /api/items/:id/submit-for-approval (arte, admin)
//   aprovação           → POST .../sponsor-approvals/:id/approve|reject (atendimento, admin)
//   finalização         → PATCH /api/items/:id/submit-final-file (arte, admin)
//   awaiting_final_review → PATCH /api/items/:id/creator-review  (a tela /solicitacao, perfil Solicitação)
//   pronto/liberado     → PATCH /api/items/:id/start-production  (grafica, admin)
//   produced            → POST /api/items/:id/confer             (grafica, solicitacao, admin)
//   conferred           → PATCH /api/tubos/:id/itens (embala) ou PATCH /api/items/:id/deliver (grafica, solicitacao, admin)
//   packed              → POST /api/tubos/:id/entregar          (grafica, solicitacao, admin)
//   canceled            → PATCH /api/items/:id/uncancel          (admin, pela ficha da peça)
//   evento closed       → POST /api/events/:id/reopen            (admin)
// Se uma dessas guardas mudar, a frase daqui muda junto — é texto de ajuda,
// não permissão: nenhum botão lê este mapa para decidir nada.
//
// Não é um campo novo do StatusMeta de propósito: o STATUS é importado por
// dezenas de telas só pela cor, e ninguém precisa carregar estas frases no
// objeto que pinta um ponto.
// ─────────────────────────────────────────────────────────────────────────────
export interface StatusGuia {
  /** O que o status quer dizer, em uma frase de gente. */
  significado: string;
  /** De quem é a vez agora (perfil). `null` = ninguém precisa agir. */
  quemAge: string | null;
  /** Onde a ação mora (tela/aba). `null` quando não há ação. */
  onde: string | null;
  /** O que precisa acontecer para a peça andar. `null` no fim da linha. */
  proximoPasso: string | null;
  /**
   * Versão CURTÍSSIMA de "de quem é a vez" ("vez da Arte"), para o leitor de
   * tela ouvir junto do rótulo sem transformar cada linha de tabela num
   * parágrafo. A frase completa fica no `title` e no balão ao tocar.
   */
  vez: string;
}

const G_RASCUNHO: StatusGuia = {
  significado: "A peça está na lista do evento, mas a lista ainda não foi enviada.",
  quemAge: "Solicitação",
  onde: "Detalhe do Evento",
  proximoPasso: "Enviar a lista para a vinculação de patrocinadores.",
  vez: "vez da Solicitação",
};
const G_APROVACAO: StatusGuia = {
  significado: "O layout está com os patrocinadores, esperando a decisão de cada um.",
  quemAge: "Atendimento",
  onde: "tela Atendimento",
  proximoPasso: "Registrar a decisão de cada patrocinador. Todos aprovaram: a Arte finaliza. Alguém reprovou: volta para a Arte corrigir.",
  vez: "vez do Atendimento",
};
const G_FINALIZACAO: StatusGuia = {
  significado: "Os patrocinadores aprovaram; falta o arquivo final para impressão.",
  quemAge: "Arte",
  onde: "tela Arte, aba Finalizar arte",
  proximoPasso: "Subir o arquivo final, que segue para a Revisão Final.",
  vez: "vez da Arte",
};
const G_REVISAO: StatusGuia = {
  significado: "O arquivo final está pronto e espera a conferência antes de ir para a gráfica.",
  quemAge: "Solicitação",
  onde: "tela Revisão Final",
  proximoPasso: "Liberar para produção ou devolver para a Arte com o ajuste.",
  vez: "vez da Revisão Final",
};
const G_PRONTO: StatusGuia = {
  significado: "Aprovada e revisada: a peça já pode ser impressa.",
  quemAge: "Gráfica",
  onde: "tela Gráfica",
  proximoPasso: "Registrar a produção.",
  vez: "vez da Gráfica",
};
const G_EM_PRODUCAO: StatusGuia = {
  // Com a escolha da máquina (14/09), "Em Impressão" é a peça NA impressora —
  // começou e ainda não saiu toda. O guia diz isso e o próximo gesto.
  significado: "A peça está na impressora escolhida e ainda não saiu toda.",
  quemAge: "Gráfica",
  onde: "tela Gráfica",
  proximoPasso: "Informar quantas já saíram da máquina; com todas, vai para Impresso / Acabamento.",
  vez: "vez da Gráfica",
};
const G_PRODUZIDO: StatusGuia = {
  // "Impresso / Acabamento" (dono, 21/09): todas as unidades saíram da
  // impressora e estão no acabamento, à espera da conferência.
  significado: "Todas as unidades saíram da impressora e estão no acabamento, à espera da conferência.",
  quemAge: "Gráfica ou Solicitação",
  onde: "tela Gráfica",
  proximoPasso: "Terminar o acabamento e conferir a peça (com foto).",
  vez: "vez da conferência",
};
const G_ENTREGUE: StatusGuia = {
  significado: "A peça foi entregue — o ciclo dela terminou.",
  quemAge: null,
  onde: null,
  proximoPasso: null,
  vez: "concluída",
};

export const STATUS_GUIA: Record<string, StatusGuia> = {
  draft: G_RASCUNHO,
  requested: G_RASCUNHO,
  awaiting_linking: {
    significado: "A peça espera as marcas (patrocinadores) que vão aparecer nela.",
    quemAge: "Arte, Atendimento ou Solicitação",
    onde: "tela Vincular Patrocinadores",
    proximoPasso: "Vincular os patrocinadores e enviar para a Arte.",
    vez: "vez da vinculação",
  },
  awaiting_submission: {
    significado: "A Arte precisa criar o layout e mandar para aprovação.",
    quemAge: "Arte",
    onde: "tela Arte, aba Aguardando envio",
    proximoPasso: "Enviar para aprovação dos patrocinadores (ou direto para a finalização, quando a peça dispensa aprovação).",
    vez: "vez da Arte",
  },
  awaiting_approval: G_APROVACAO,
  awaiting_sponsor_approval: G_APROVACAO,
  awaiting_finalization: G_FINALIZACAO,
  sponsor_approved: G_FINALIZACAO,
  // Guia PRÓPRIO, mesmo rótulo/cor: awaiting_creator_review é também onde cai
  // a peça que dispensou aprovação (skipApproval ou sem patrocinador — ver
  // submit-for-approval em server/routes/items.ts). "Os patrocinadores
  // aprovaram" seria falso para ela.
  awaiting_creator_review: {
    ...G_FINALIZACAO,
    significado: "Aprovada pelos patrocinadores ou sem aprovação exigida; falta o arquivo final da Arte.",
  },
  awaiting_final_review: G_REVISAO,
  awaiting_review: G_REVISAO,
  in_review: G_REVISAO,
  ready_for_production: G_PRONTO,
  pronto_para_producao: G_PRONTO,
  approved: G_PRONTO,
  liberado: G_PRONTO,
  inProduction: G_EM_PRODUCAO,
  em_producao: G_EM_PRODUCAO,
  produced: G_PRODUZIDO,
  produzido: G_PRODUZIDO,
  conferred: {
    significado: "Conferida; falta embalar (sozinha ou num tubo).",
    quemAge: "Gráfica ou Solicitação",
    onde: "tela Gráfica",
    proximoPasso: "Embalar — com a foto. Toda peça é embalada antes de ser entregue.",
    vez: "vez da embalagem",
  },
  packed: {
    significado: "Conferida e embalada (sozinha ou num tubo), à espera da saída do caminhão.",
    quemAge: "Gráfica",
    onde: "tela Gráfica, na linha da peça (Entregar / Entregar tubo)",
    proximoPasso: "Entregar — a peça sozinha ou o tubo inteiro — com o nome de quem recebeu.",
    vez: "vez da entrega",
  },
  delivered: G_ENTREGUE,
  entregue: G_ENTREGUE,
  canceled: {
    significado: "A peça saiu do fluxo e não será produzida.",
    quemAge: null,
    onde: null,
    proximoPasso: "Nada a fazer. Se foi engano, um administrador pode descancelar pela ficha da peça.",
    vez: "fora do fluxo",
  },
  deleted: {
    significado: "A peça foi excluída e não conta mais no evento.",
    quemAge: null,
    onde: null,
    proximoPasso: null,
    vez: "fora do fluxo",
  },
  // ── Evento ──
  created: {
    significado: "Evento em andamento: as peças dele ainda estão no fluxo.",
    quemAge: null,
    onde: null,
    proximoPasso: "Cada peça mostra de quem é a vez no próprio status.",
    vez: "em andamento",
  },
  completed: {
    significado: "Todas as peças do evento foram entregues.",
    quemAge: null,
    onde: null,
    proximoPasso: null,
    vez: "concluído",
  },
  closed: {
    significado: "Um administrador encerrou o evento: ele saiu das filas de trabalho e da cobrança de prazos.",
    quemAge: null,
    onde: null,
    proximoPasso: "Se foi engano, um administrador pode reabrir o evento.",
    vez: "encerrado",
  },
};

/** O guia de um status, ou `null` para status desconhecido (nunca inventa). */
export function guiaDoStatus(status: string | null | undefined): StatusGuia | null {
  return (status && STATUS_GUIA[status]) || null;
}

/**
 * A frase inteira de um status — `title`, tooltip, leitor de tela.
 * Ex.: "Aguardando Envio: A Arte precisa criar o layout… Quem age agora: Arte
 * (tela Arte, aba Aguardando envio). Próximo passo: Enviar para aprovação…"
 */
export function descricaoDoStatus(status: string | null | undefined): string | null {
  const g = guiaDoStatus(status);
  if (!g) return null;
  const partes = [`${getStatusLabel(status)}: ${g.significado}`];
  if (g.quemAge) partes.push(`Quem age agora: ${g.quemAge}${g.onde ? ` (${g.onde})` : ""}.`);
  if (g.proximoPasso) partes.push(`Próximo passo: ${g.proximoPasso}`);
  return partes.join(" ");
}

// ── Listas canônicas por fase — para gates de edição/exclusão/referência. ──
// Existem porque telas comparavam contra nomes que NÃO existem no vocabulário
// ('entregue', 'em_producao', 'produzido') e os gates nunca disparavam.
// Sempre importe daqui em vez de escrever arrays literais.
// `packed` (Embalado, 21/09) entrou ENTRE conferred e delivered — quem
// desestrutura esta lista por posição (atendimento.tsx) precisa dos cinco.
export const PRODUCTION_STATUSES = ["inProduction", "produced", "conferred", "packed", "delivered"] as const;
export const FINAL_STATUSES = ["delivered", "canceled", "deleted"] as const;

/** Valor gravado em `events.status` pelo encerramento MANUAL (routes/shared.ts). */
export { EVENT_CLOSED_STATUS };

/**
 * Evento encerrado À MÃO — o gate das filas de trabalho e do calendário.
 *
 * A confirmação do encerramento promete que o evento "sai da Gestão de Prazos e
 * das filas"; é aqui que essa promessa vira código no cliente. Existe uma vez
 * só porque a mesma pergunta é feita em quatro telas (Arte, Atendimento,
 * Gráfica, Calendário) — quatro cópias divergiriam no primeiro ajuste.
 *
 * Lê `manuallyClosed` E a coluna crua: o objeto de evento chega enriquecido
 * (`enrichEvent`, com `manuallyClosed`) em /api/events, mas vem CRU pendurado
 * em `item.event` nas listas de peças — ali só existe `status`.
 *
 * CONTINUA EXISTINDO com este escopo estreito (só o encerramento manual)
 * porque o Calendário precisa exatamente dele: lá o evento realizado NÃO some
 * — um calendário sem o passado não é um calendário. Quem filtra FILA de
 * trabalho usa `motivoEventoFinalizado`/`isEventoFinalizado`, que cobre as
 * duas origens.
 */
export function isEventoEncerrado(
  event: { status?: string | null; manuallyClosed?: boolean | null } | null | undefined,
): boolean {
  if (!event) return false;
  return event.manuallyClosed === true || event.status === EVENT_CLOSED_STATUS;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTO FINALIZADO — o gate das telas de AÇÃO.
//
// A REGRA (do dono, 14/08): "eventos finalizados, ou seja que passou o dia, não
// contam mais para prazos e no app"; e, sobre a âncora, "saída do caminhão não,
// e sim a DATA DO EVENTO". Depois ele estreitou o alcance: "evento passado some
// de tudo NÃO. Ele tem que ficar de registro no app em algumas telas, mas não
// em tela de ações e nem de gestão."
//
// Ou seja, quem filtra é só quem MANDA TRABALHAR ou COBRA:
//   FILTRA  → Arte, Atendimento e Vincular Patrocinadores (filas de ação) e
//             Gestão de Prazos (cobrança, filtrada no servidor por
//             `isPrazoCandidate`).
//   NÃO FILTRA → Gráfica e Revisão Final (ver o parágrafo abaixo), Painel
//             Geral, Histórico, Registros, lista de Eventos, Detalhe do
//             Evento, Consulta, Análises e Calendário — são registro, e
//             registro não perde o passado.
//
// POR QUE A GRÁFICA E A REVISÃO FINAL VOLTARAM A MOSTRAR (regra do dono,
// 17/08: "os eventos finalizados devem aparecer ainda na Revisão e Gráfica").
// Esta é A pergunta que alguém vai fazer olhando cinco filas e vendo só três
// filtrarem, então a resposta fica aqui, ao lado do predicado:
//
//   A guarda de escrita (server/routes/eventoFinalizado.ts) barra o que faz o
//   trabalho ANDAR e PERMITE o que ARRUMA A CASA. Das ações que sobreviveram,
//   duas são de peça em fluxo: CONFERIR e REGISTRAR ENTREGA — e as duas moram
//   exatamente nestas duas telas. A conferência e a entrega de um evento que já
//   aconteceu são o caso NORMAL, não a exceção: a papelada chega no dia
//   seguinte, que é justamente quando o evento vira "realizado".
//
//   Esconder a peça tornava impossível executar o que o servidor permite: o
//   material saiu, o canhoto chegou, e não havia linha nenhuma onde clicar.
//   Nas outras três filas nada sobrou de permitido, então esconder continua
//   sendo a resposta certa — lá a peça visível só ofereceria 409.
//
// A contrapartida obrigatória, e é o que `seloPecaEventoFinalizado` existe para
// servir: a peça que volta TEM de se declarar, e as ações barradas TÊM de vir
// desabilitadas com o motivo. Peça de evento morto misturada às vivas, sem
// sinal e com os botões todos ativos, é pior que escondê-la.
//
// O predicado em si mora em @shared/prazo-dates (servidor e cliente precisam da
// MESMA virada de dia). Aqui ficam só os apetrechos de UI: a âncora de "hoje" e
// a frase que explica a ausência.
// ─────────────────────────────────────────────────────────────────────────────
export { motivoEventoFinalizado, isEventoFinalizado, todayBusinessMs };
export type { EventoFinalizadoMotivo, EventoFinalizavel };

/**
 * Contagem de peças escondidas, por origem. Toda fila que ESCONDE monta uma
 * destas e entrega para `avisoPecasOcultas` — assim as três telas contam a
 * mesma história com as mesmas palavras. A Gráfica e a Revisão Final não
 * escondem mais (ver o bloco do gate acima) e por isso não passam por aqui.
 */
export interface PecasOcultasPorMotivo {
  /** Peças fora da fila porque um admin encerrou o evento. */
  encerrado: number;
  /** Peças fora da fila porque a data do evento já passou. */
  realizado: number;
}

export interface AvisoPecasOcultas {
  /** Trecho em negrito — o número, que é o que a pessoa procura. */
  destaque: string;
  /** O resto da frase: onde não estão, por quê, e onde continuam. */
  texto: string;
}

/**
 * A frase do aviso de peças ocultas — FONTE ÚNICA das filas que ESCONDEM
 * (Arte, Atendimento e Vincular Patrocinadores).
 *
 * PORQUÊ existe: esconder em silêncio é o pior desfecho possível desta regra.
 * "Nenhuma peça aguardando envio" lido como "nada a fazer" por quem, na
 * verdade, teve o trabalho retirado — e quem procura UMA peça específica
 * precisa entender por que ela não está ali. Com duas origens, a frase também
 * tem que dizer QUAL: "encerrado" tem volta (reabrir o evento), "realizado"
 * não tem.
 *
 * `onde` é o complemento de lugar da tela ("destas abas", "desta fila",
 * "desta tela") — a única coisa que varia entre elas.
 */
export function avisoPecasOcultas(
  contagem: PecasOcultasPorMotivo,
  onde: string,
): AvisoPecasOcultas | null {
  const { encerrado, realizado } = contagem;
  const total = encerrado + realizado;
  if (total <= 0) return null;

  const destaque = `${total} peça${total !== 1 ? "s" : ""}`;
  const verbo = total !== 1 ? "estão" : "está";
  const elas = total !== 1 ? "Elas continuam" : "Ela continua";

  if (realizado === 0) {
    return {
      destaque,
      texto: `${verbo} fora ${onde} porque o evento foi encerrado.`
        + ` ${elas} no Detalhe do Evento — reabrir o evento traz o trabalho de volta.`,
    };
  }
  if (encerrado === 0) {
    return {
      destaque,
      texto: `${verbo} fora ${onde} porque o evento já foi realizado.`
        + ` ${elas} no Detalhe do Evento e no Painel Geral — evento que já aconteceu não é mais cobrado.`,
    };
  }
  return {
    destaque,
    texto: `${verbo} fora ${onde}: ${encerrado} porque o evento foi encerrado`
      + ` e ${realizado} porque o evento já foi realizado.`
      + ` ${elas} no Detalhe do Evento e no Painel Geral.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O FIM DA HISTÓRIA DA PEÇA — o marco que faltava nas linhas do tempo.
//
// O ACHADO (dono, 14/08, olhando a aba Histórico do Atendimento): "no app onde
// tem algum histórico, tem que colocar que o evento foi encerrado". A trilha da
// peça ia de "Criado" a "Todos aprovaram" e parava ali — em nenhum ponto ela
// dizia que a peça deixou de ser cobrada e saiu das filas. O motivo disso não
// está na peça: está no EVENTO. Por isso todo rótulo daqui começa com a palavra
// "Evento" — quem lê a trilha de uma peça precisa saber, na mesma frase, que o
// que acabou não foi a peça.
//
// AS DUAS ORIGENS, E O QUE CADA UMA PODE AFIRMAR:
//   · "encerrado" → decisão de gente, e TEM VOLTA (reabrir). Quem encerrou e
//     quando existem só no audit log do EVENTO (não há coluna `closedAt`), e
//     esse log não viaja junto com a peça. Logo este marco NÃO tem data nem
//     autor — e é por isso que ele diz onde procurar em vez de chutar um
//     carimbo. Inventar aqui a data de `updatedAt` seria exatamente o tipo de
//     data falsa que esta base já removeu de uma trilha antes.
//   · "realizado" → a DATA DO EVENTO passou, e não tem volta. Aqui há uma data
//     honesta para mostrar, porque a data É o fato: `events.startDate`.
// ─────────────────────────────────────────────────────────────────────────────

export interface MarcoEventoFinalizado {
  motivo: EventoFinalizadoMotivo;
  /** Rótulo curto da trilha. Começa em "Evento" de propósito. */
  label: string;
  /** Frase inteira — tooltip e leitor de tela. */
  hint: string;
  /**
   * Dia do evento em "YYYY-MM-DD", só no "realizado". `null` no encerramento
   * manual (não há data para afirmar) e no evento sem data plausível.
   *
   * String de dia, e não `Date`: o ms de finalização é meia-noite UTC, e
   * formatá-lo direto renderiza a VÉSPERA em qualquer fuso a oeste de
   * Greenwich. Quem exibe passa por `parseDateLocal` (lib/utils), que é como o
   * resto do app já mostra data de evento.
   */
  dataEventoISO: string | null;
  /** Bolinha da trilha (tom saturado — não carrega texto). */
  dot: string;
  /** Cor do rótulo — tom escuro, AA sobre fundo claro. */
  text: string;
}

/**
 * O marco de fim da história de UMA peça, derivado do evento dela.
 * `null` enquanto o evento está em jogo — a trilha não ganha linha nenhuma.
 *
 * Mesmo predicado das filas (`motivoEventoFinalizado`): a trilha nunca vai
 * dizer "encerrado" para uma peça que continua sendo cobrada, nem o contrário.
 */
export function marcoEventoFinalizado(
  event: EventoFinalizavel | null | undefined,
  hojeMs: number,
): MarcoEventoFinalizado | null {
  const motivo = motivoEventoFinalizado(event, hojeMs);
  if (motivo === null) return null;

  if (motivo === "encerrado") {
    return {
      motivo,
      label: "Evento encerrado",
      hint: "Um administrador encerrou este evento — a peça saiu das filas de trabalho e"
        + " da cobrança de prazos. Quem encerrou e quando estão no Histórico geral;"
        + " reabrir o evento traz o trabalho de volta.",
      dataEventoISO: null,
      // Cinza, o mesmo do selo "Encerrado" (STATUS.closed) e do acento da lista
      // de Eventos: verde diria "deu tudo certo", âmbar diria "corre atrás".
      dot: P.neutral.dot,
      text: P.neutral.text,
    };
  }

  const dia = eventDayMs(event?.startDate);
  return {
    motivo,
    label: "Evento realizado",
    // A palavra "reabrir" NÃO entra aqui, nem para ser negada: é o mesmo
    // cuidado de `avisoPecasOcultas`. Oferecer e retirar na mesma frase é como
    // a leitura apressada acaba levando embora só a oferta.
    hint: "A data deste evento já passou — a peça deixou de ser cobrada e saiu das filas."
      + " Não há autor nem volta: quem decide aqui é a data.",
    dataEventoISO: dia === null ? null : new Date(dia).toISOString().slice(0, 10),
    // Âmbar, o mesmo acento que a lista de Eventos dá ao lifecycle 'realizado'.
    dot: P.amber.dot,
    text: P.amber.text,   // #b45309 — 5,02:1 sobre #fff, 4,77:1 sobre #f9f9f8
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// O SELO NA LINHA — para as duas filas que voltaram a mostrar estas peças.
//
// A Gráfica e a Revisão Final listam peça de evento finalizado no meio das
// vivas (ver o bloco "POR QUE A GRÁFICA E A REVISÃO FINAL VOLTARAM A MOSTRAR",
// acima). Sem um selo na linha, o operador não tem como saber que aquele evento
// acabou — e isso MUDA a decisão dele: um "Produzir" desabilitado sem motivo
// visível lê-se como sistema quebrado, e uma peça que só aceita conferência
// lê-se como fila normal.
//
// NADA DE VOCABULÁRIO NOVO: o rótulo e a frase saem inteiros de
// `marcoEventoFinalizado` — a MESMA fonte que a trilha da ficha e o selo de
// peça do Painel Geral (lib/painel-encerrados) já usam. Este helper só
// acrescenta o `bg`/`border` que um badge precisa e que o marco (feito para
// bolinha de timeline) não tem, tirados do mesmo mapa `P` de onde o marco tira
// `dot` e `text` — por construção não há como divergir do Painel.
//
// CONTRASTE nos 10px do selo (o texto mais apertado desta tela):
//   encerrado #44403c sobre #f5f5f4 → 9,42:1
//   realizado #b45309 sobre #fffbeb → 4,84:1
// Os dois passam AA 4,5:1. Nenhuma cor proibida da casa (#f97316 / #a8a29e)
// entra como cor de texto.
// ─────────────────────────────────────────────────────────────────────────────
export interface SeloPecaEventoFinalizado {
  motivo: EventoFinalizadoMotivo;
  /** Rótulo do badge. Começa em "Evento" — o que acabou não foi a peça. */
  label: string;
  /** Frase inteira — `title` e leitor de tela. */
  hint: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
}

const SELO_PECA_BG: Record<EventoFinalizadoMotivo, { bg: string; border: string }> = {
  encerrado: { bg: P.neutral.bg, border: P.neutral.border },
  realizado: { bg: P.amber.bg, border: P.amber.border },
};

/** O selo da linha/card de UMA peça. `null` enquanto o evento dela está em jogo. */
export function seloPecaEventoFinalizado(
  event: EventoFinalizavel | null | undefined,
  hojeMs: number,
): SeloPecaEventoFinalizado | null {
  const marco = marcoEventoFinalizado(event, hojeMs);
  if (!marco) return null;
  return {
    motivo: marco.motivo,
    label: marco.label,
    hint: marco.hint,
    text: marco.text,
    dot: marco.dot,
    ...SELO_PECA_BG[marco.motivo],
  };
}

/**
 * O `title` de um botão DESABILITADO por evento finalizado.
 *
 * Não basta o botão apagar: quem chega na linha precisa ler POR QUE aquela ação
 * específica não está disponível, e a frase tem de casar com o 409 que o
 * servidor devolveria se o clique passasse (`erroEventoFechado`, em
 * server/routes/eventoFinalizado.ts). "encerrado" oferece a volta (reabrir);
 * "realizado" não oferece nada, porque não há nada a oferecer.
 *
 * `acao` é a ação no infinitivo, minúscula ("produzir", "liberar para
 * produção") — a tela sabe qual botão está desenhando, este módulo não.
 */
export function motivoAcaoBloqueada(motivo: EventoFinalizadoMotivo, acao: string): string {
  return motivo === "encerrado"
    ? `Não dá para ${acao}: um administrador encerrou este evento.`
      + " Reabrir o evento traz o trabalho de volta. Conferência e entrega continuam liberadas."
    : `Não dá para ${acao}: a data deste evento já passou.`
      + " Não há volta — quem decide aqui é a data. Conferência e entrega continuam liberadas.";
}

// ── Prioridade de EVENTO — mesma disciplina do StatusMeta (text escuro AA
// sobre bg claro; dot saturada). Antes havia 4 mapas hex divergentes só em
// eventos.tsx, um deles morto. ──
export interface PriorityMeta {
  label: string;
  bg: string;
  text: string;
  border: string;
  dot: string;
}
export const PRIORITY: Record<string, PriorityMeta> = {
  urgente: { label: "Urgente", bg: P.red.bg,     text: P.red.text,     border: P.red.border,     dot: P.red.dot },
  alta:    { label: "Alta",    bg: P.amber.bg,   text: P.amber.text,   border: P.amber.border,   dot: P.amber.dot },
  media:   { label: "Média",   bg: P.purple.bg,  text: P.purple.text,  border: P.purple.border,  dot: P.purple.dot },
  baixa:   { label: "Baixa",   bg: P.blue.bg,    text: P.blue.text,    border: P.blue.border,    dot: P.blue.dot },
};
export function getPriorityMeta(priority: string | null | undefined): PriorityMeta | null {
  return (priority && PRIORITY[priority]) || null;
}

// Fallback seguro para qualquer status desconhecido (ex.: valor legado novo).
const FALLBACK: StatusMeta = meta("—", "—", P.neutral, Clock);

/** Metadados completos de um status (nunca lança; cai no fallback neutro). */
export function getStatusMeta(status: string | null | undefined): StatusMeta {
  return (status && STATUS[status]) || FALLBACK;
}

/** Rótulo completo. Se o status for desconhecido, devolve o próprio valor. */
export function getStatusLabel(status: string | null | undefined): string {
  return (status && STATUS[status]?.label) || (status ?? "—");
}

/** Rótulo curto (mobile). */
export function getStatusShort(status: string | null | undefined): string {
  return (status && STATUS[status]?.short) || (status ?? "—");
}

// ─────────────────────────────────────────────────────────────────────────────
// APROVAÇÃO DE PATROCINADOR — fonte única do visual (cor + rótulo + tooltip).
//
// PORQUÊ ISTO EXISTE. O servidor NUNCA grava 'rejected' na aprovação de
// patrocinador. Na reprovação ele grava `awaiting_arte`
// (server/routes/items.ts:1187 no update e :1199 no create) e, quando a Arte
// devolve o thumb novo, `new_version_pending` (items.ts:1342). 'rejected'
// sobrevive apenas como valor LEGADO: aparece só em guarda de leitura
// (items.ts:779), nunca numa escrita. E `enrichItemsWithEventsAndSponsors`
// (items.ts:110-121) repassa `approval.status` CRU para o cliente.
//
// O estrago do desalinhamento: componentes que só conheciam
// approved|rejected|pending caíam em estilo nulo justamente nos DOIS estados
// reais de reprovação e voltavam a pintar o chip com a COR DA MARCA. Ou seja,
// o patrocinador que JÁ REPROVOU ficava visualmente idêntico — às vezes mais
// discreto — que aquele que nem olhou a peça. A informação mais cara da
// operação ficava invisível na tela mais vista.
//
// Esta tradução nasceu local em atendimento.tsx (`approvalVisual`), que já
// conhecia os 5 valores. Promovida para cá para que Painel Geral, Vincular,
// Detalhe do Evento, Arte e Atendimento nunca mais contem histórias
// diferentes sobre a mesma peça.
//
// ACESSIBILIDADE: mesma disciplina do StatusMeta — `text` é sempre tom 700/800
// sobre `bg` tint claro (os chips renderizam em 11px, então precisa passar AA
// como texto normal); `dot` usa o tom saturado 500, isento de contraste de
// texto. Nenhum #f97316/#a8a29e entra como cor de TEXTO.
// ─────────────────────────────────────────────────────────────────────────────

/** Todos os valores que o servidor grava em `item_sponsor_approvals.status`. */
export const APPROVAL_STATUSES = [
  "pending",              // registro criado / reaberto, sem decisão do patrocinador
  "approved",             // patrocinador aprovou
  "awaiting_arte",        // patrocinador REPROVOU → Arte está refazendo
  "new_version_pending",  // Arte devolveu versão nova → aguarda o Atendimento reenviar
  "rejected",             // LEGADO: nenhuma rota grava; só guarda de leitura
] as const;

export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * Família semântica do estado. Existe para quem precisa AGRUPAR sem repetir a
 * lista de status (ex.: contar "reprovadas" num KPI, ordenar por gravidade).
 */
export type ApprovalTone = "approved" | "rejected" | "rework" | "waiting" | "unknown";

export interface ApprovalMeta {
  /** Chave canônica; "unknown" quando o servidor mandou algo fora do vocabulário. */
  key: ApprovalStatus | "unknown";
  /** Valor cru recebido — o que torna o estado desconhecido diagnosticável. */
  raw: string;
  label: string;   // rótulo completo (tooltip, legenda, leitor de tela)
  short: string;   // rótulo curto (badge/coluna apertada)
  hint: string;    // frase explicando o estado — copy de tooltip
  tone: ApprovalTone;
  bg: string;
  text: string;
  border: string;
  dot: string;
  /** true nos estados em que houve reprovação (`rejected` e `awaiting_arte`). */
  isRejection: boolean;
}

const APPROVAL: Record<ApprovalStatus, Omit<ApprovalMeta, "raw">> = {
  approved: {
    key: "approved",
    label: "Aprovado",
    short: "Aprovado",
    hint: "Aprovado pelo patrocinador",
    tone: "approved",
    bg: P.green.bg, text: P.green.text, border: P.green.border, dot: P.green.dot,
    isRejection: false,
  },
  rejected: {
    key: "rejected",
    label: "Reprovado",
    short: "Reprovado",
    hint: "Reprovado pelo patrocinador",
    tone: "rejected",
    bg: P.red.bg, text: P.red.text, border: P.red.border, dot: P.red.dot,
    isRejection: true,
  },
  awaiting_arte: {
    key: "awaiting_arte",
    label: "Reprovado · Arte refazendo",
    short: "Reprovado",
    hint: "Reprovado pelo patrocinador — a Arte está refazendo a peça",
    tone: "rework",
    // Campo VERMELHO (mesma família do 'rejected' — houve reprovação de fato)
    // com a bolinha ÂMBAR (o retrabalho já está em andamento). É a única
    // combinação de duas famílias do conjunto, e é de propósito: de relance o
    // chip entra no grupo do vermelho, que é a leitura que decide, e o âmbar
    // dá a nuance sem diluir o alarme. Era exatamente este o estado que antes
    // voltava à cor da marca.
    bg: P.red.bg, text: P.red.text, border: P.red.border, dot: P.amber.dot,
    isRejection: true,
  },
  new_version_pending: {
    key: "new_version_pending",
    label: "Nova versão enviada",
    short: "Nova versão",
    hint: "A Arte enviou uma nova versão — aguardando o Atendimento reenviar ao patrocinador",
    tone: "waiting",
    // Âmbar-800 no texto em vez do 700 do P.amber: em 11px peso 600 sobre tint
    // o tom mais escuro é o que sustenta a leitura, e afasta este chip do
    // vermelho do `awaiting_arte`, com quem já divide a bolinha âmbar.
    bg: P.amber.bg, text: "#92400e", border: P.amber.border, dot: P.amber.dot,
    isRejection: false,
  },
  pending: {
    key: "pending",
    label: "Aguardando patrocinador",
    short: "Aguardando",
    hint: "Sem ação do patrocinador até agora",
    tone: "waiting",
    // Laranja e não cinza: decisão registrada da tela — é o chip que EXIGE
    // ação e era o mais apagado dos três estados que o componente conhecia.
    // Fica abaixo do vermelho na hierarquia, que é o ponto do achado.
    bg: P.orange.bg, text: P.orange.text, border: P.orange.border, dot: P.orange.dot,
    isRejection: false,
  },
};

// Fallback VISÍVEL. Foi o silêncio do fallback antigo (estilo nulo → cor da
// marca) que criou o bug: valor novo no banco tem de aparecer como anomalia
// cinza, com o valor cru no tooltip, e nunca se disfarçar de estado normal.
const APPROVAL_UNKNOWN: Omit<ApprovalMeta, "raw"> = {
  key: "unknown",
  label: "Estado de aprovação desconhecido",
  short: "Desconhecido",
  hint: "Estado de aprovação não reconhecido por esta versão do sistema",
  tone: "unknown",
  bg: P.neutral.bg, text: P.neutral.text, border: P.neutral.border, dot: P.neutral.dot,
  isRejection: false,
};

/**
 * Visual canônico do status de aprovação de UM patrocinador para UMA peça.
 *
 * Devolve `null` SOMENTE quando não há registro de aprovação (null/undefined/
 * string vazia) — aí o consumidor mantém a identidade da marca, que é o
 * comportamento certo para telas onde o patrocinador nem entrou no fluxo de
 * aprovação (lista de eventos, triagem). Qualquer string não reconhecida
 * devolve o meta "unknown", nunca `null`: valor estranho tem de ser visível.
 */
export function getApprovalMeta(status: string | null | undefined): ApprovalMeta | null {
  if (!status) return null;
  const known = APPROVAL[status as ApprovalStatus];
  return known ? { ...known, raw: status } : { ...APPROVAL_UNKNOWN, raw: status };
}

/** Rótulo completo do estado de aprovação (ou o texto de "sem registro"). */
export function getApprovalLabel(status: string | null | undefined): string {
  return getApprovalMeta(status)?.label ?? "Sem registro de aprovação";
}

/**
 * De quem é a vez em cada estado de aprovação — o complemento do `hint`.
 *
 * O `hint` diz O QUE aconteceu ("Reprovado pelo patrocinador — a Arte está
 * refazendo"); faltava dizer a quem cabe o próximo movimento, que é a pergunta
 * de quem olha um chip vermelho. Separado do APPROVAL para não mudar o
 * `getApprovalTitle`, que várias telas já exibem e testam.
 * Conferido nas rotas: aprovar/reprovar/reenviar são do Atendimento
 * (items.ts, sponsor-approvals/*); refazer o layout é da Arte (update-thumb).
 */
const PROXIMO_DA_APROVACAO: Record<ApprovalStatus, string | null> = {
  pending: "Vez do Atendimento: registrar a decisão do patrocinador (tela Atendimento).",
  approved: null,
  awaiting_arte: "Vez da Arte: refazer o layout (tela Arte, aba Correção).",
  new_version_pending: "Vez do Atendimento: levar a nova versão ao patrocinador e registrar a decisão (tela Atendimento).",
  rejected: "Vez da Arte: refazer o layout (tela Arte, aba Correção).",
};

/** O próximo passo de um estado de aprovação, ou `null` quando não há o que fazer. */
export function proximoPassoDaAprovacao(status: string | null | undefined): string | null {
  if (!status) return null;
  return PROXIMO_DA_APROVACAO[status as ApprovalStatus] ?? null;
}

/**
 * Tooltip canônico de um chip de patrocinador: "Nome — explicação do estado".
 * Centralizado aqui porque o caso do estado desconhecido precisa carregar o
 * valor cru, e essa regra não pode ser reinventada em cada tela.
 */
export function getApprovalTitle(name: string, status?: string | null): string {
  const m = getApprovalMeta(status);
  if (!m) return name;
  if (m.key === "unknown") return `${name} — ${m.hint} ("${m.raw}")`;
  return `${name} — ${m.hint}`;
}
