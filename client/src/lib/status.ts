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
import { Clock, CheckCircle, Package, Truck, XCircle, Lock } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface StatusMeta {
  label: string;      // rótulo completo (desktop)
  short: string;      // rótulo curto (mobile / espaços apertados)
  bg: string;         // fundo do badge (tint claro)
  text: string;       // texto/ícone — tom escuro AA
  border: string;     // borda (tint médio)
  dot: string;        // bolinha de status (tom saturado)
  icon: LucideIcon;   // ícone (para o StatusBadge com ícone)
}

// Paleta base por "família" de cor — reutilizada pelos status.
// bg = 50, border = 100/200, text = 700/800 (AA), dot = 500.
const P = {
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
  inProduction:          meta("Em Produção",            "Em Produção",    P.orange,  Package),
  produced:              meta("Produzido",              "Produzido",      P.pink,    CheckCircle),
  conferred:             meta("Conferido",              "Conferido",      P.cyan,    CheckCircle),
  delivered:             meta("Entregue",               "Entregue",       P.emerald, Truck),
  // ── Aliases LEGADOS em português (dados antigos ainda gravados assim) ──
  // Apontam para os mesmos metas dos status canônicos correspondentes
  // (liberado→approved, em_producao→inProduction, produzido→produced,
  // entregue→delivered). Sem eles, o badge caía no fallback "—".
  liberado:              meta("Liberado",               "Liberado",       P.green,   CheckCircle),
  em_producao:           meta("Em Produção",            "Em Produção",    P.orange,  Package),
  produzido:             meta("Produzido",              "Produzido",      P.pink,    CheckCircle),
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

// ── Listas canônicas por fase — para gates de edição/exclusão/referência. ──
// Existem porque telas comparavam contra nomes que NÃO existem no vocabulário
// ('entregue', 'em_producao', 'produzido') e os gates nunca disparavam.
// Sempre importe daqui em vez de escrever arrays literais.
export const PRODUCTION_STATUSES = ["inProduction", "produced", "conferred", "delivered"] as const;
export const FINAL_STATUSES = ["delivered", "canceled", "deleted"] as const;

/** Valor gravado em `events.status` pelo encerramento MANUAL (routes/shared.ts). */
export const EVENT_CLOSED_STATUS = "closed";

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
 */
export function isEventoEncerrado(
  event: { status?: string | null; manuallyClosed?: boolean | null } | null | undefined,
): boolean {
  if (!event) return false;
  return event.manuallyClosed === true || event.status === EVENT_CLOSED_STATUS;
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
