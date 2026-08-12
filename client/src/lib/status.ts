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
import { Clock, CheckCircle, Package, Truck, XCircle } from "lucide-react";
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
  // ── Encerrados ──
  canceled:              meta("Cancelado",              "Cancelado",      P.red, XCircle),
  deleted:               meta("Excluído",               "Excluído",       P.red, XCircle),
  // ── Status de EVENTO ──
  created:               meta("Criado",                 "Criado",         P.amber, Clock),
  // "Concluído": termo usado na lista de eventos (chips/badges) — o badge do
  // detalhe usa este mesmo rótulo para não divergir.
  completed:             meta("Concluído",              "Concluído",      P.green, CheckCircle),
};

// ── Listas canônicas por fase — para gates de edição/exclusão/referência. ──
// Existem porque telas comparavam contra nomes que NÃO existem no vocabulário
// ('entregue', 'em_producao', 'produzido') e os gates nunca disparavam.
// Sempre importe daqui em vez de escrever arrays literais.
export const PRODUCTION_STATUSES = ["inProduction", "produced", "conferred", "delivered"] as const;
export const FINAL_STATUSES = ["delivered", "canceled", "deleted"] as const;

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
