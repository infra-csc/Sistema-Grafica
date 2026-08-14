// ─────────────────────────────────────────────────────────────────────────────
// EVENTOS (/eventos) — índice operacional por evento.
//
// A pergunta que o usuário traz para cá é sempre a mesma: *qual evento sai
// primeiro, ele está no prazo, e onde clico para abrir*. Três decisões desta
// tela saem daí:
//
// 1. ESTADO HONESTO. O servidor deixou de carimbar "Concluído" por DATA e passou
//    a mandar `lifecycle` (active | completed | closed_with_pending) junto com
//    `allDelivered`/`eventHasPassed`. Antes, um evento que apenas COMEÇOU virava
//    verde, perdia a bandeira de prioridade, caía para o último balde da
//    ordenação e ainda exibia "3/20 Entregues" ao lado de "Concluído" — a tela
//    escondia exatamente o caso que ela existe para revelar. Aqui os três
//    estados são distintos em borda, badge, ordenação e rodapé.
// 2. A TELA FALA DE PRAZO. É onde os 5 marcos nascem e era a única do sistema
//    que não os mostrava (só /prazos, restrita a admin). O card agora traz o
//    PRÓXIMO MARCO com semáforo, direto de `event.nextMilestone` — cálculo do
//    servidor, mesma âncora (saída do caminhão) e mesmo ajuste de fim de semana
//    de /api/prazos. NÃO recalcule no cliente: `daysRemaining` já vem no fuso do
//    negócio (America/Sao_Paulo).
// 3. NADA DE TRABALHO PERDIDO. X, Esc e clique-fora do modal passam pela MESMA
//    pergunta de descarte, comparada contra um snapshot (e não contra "está em
//    modo edição").
// ─────────────────────────────────────────────────────────────────────────────
import { useQuery, useMutation } from "@tanstack/react-query";
import { parseDateLocal, toUTCDisplayDate, runInBatches } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Plus, Calendar, Truck, AlertCircle, AlertTriangle, Search, Pencil, Trash2,
  Package, Flag, Building2, CheckCircle, ChevronDown, ChevronUp, Clock,
  HelpCircle, Copy, RotateCcw, CalendarPlus, X, Lock, Unlock,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Sponsor } from "@shared/schema";
import { FilterSelect } from "@/components/filter-select";
import { SponsorChips } from "@/components/sponsor-chips";
import { PRIORITY, getPriorityMeta, getStatusMeta, PRODUCTION_STATUSES } from "@/lib/status";
import { T, FS, R, SHADOW } from "@/lib/theme";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ptBR } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";

type PriorityLevel = 'baixa' | 'media' | 'alta' | 'urgente' | 'sem_prioridade';
// `manually_closed` é o único estado que NÃO é derivado: alguém clicou em
// "Encerrar evento". Ele sobrepõe os outros três (ver enrichEvent) — é por isso
// que a tela consegue separar "encerrado por alguém" de "concluído porque tudo
// foi entregue".
type LifecycleKey = 'active' | 'completed' | 'closed_with_pending' | 'manually_closed';

// Pseudo-opções do filtro de prioridade que NÃO são prioridade: são dimensões
// do ciclo de vida. Ficam no mesmo dropdown porque é onde o usuário já procura
// por "Concluído" — mas casam por lifecycle, não por `event.priority`.
const LIFECYCLE_FILTERS = ['completed', 'closed_with_pending', 'manually_closed'] as const;

// Os dois estados que saem da visão padrão da grade: trabalho que acabou
// (entregue) e trabalho que alguém fechou. "Encerrado com pendências" NÃO entra
// aqui — ele continua sendo cobrança.
const ARCHIVED_LIFECYCLES = new Set<LifecycleKey>(['completed', 'manually_closed']);

// ── Cotas de patrocinador ────────────────────────────────────────────────────
// Par {dot, text} na mesma disciplina de lib/status.ts: hex SATURADO só em
// borda/bolinha, tom escuro 700/800 no TEXTO. Antes a cor saturada era usada
// como cor de texto em 11px sobre um tint de 9% dela mesma: 4 das 6 cotas
// reprovavam AA (MASTER 3,18:1 · MIDIA 3,14:1 · MINISTERIO 3,21:1 · APOIO
// 4,10:1) medindo contra o fundo composto real da linha selecionada (#fff8f2).
// Os pares abaixo são os mesmos da paleta `P` de lib/status.ts (tint 50 + tom
// 700), já auditados. DÍVIDA CONHECIDA: `IMPORT_QUOTA_COLORS`
// (import-xlsx-dialog.tsx:41) mantém um terceiro conjunto — MASTER é #ef4444
// aqui e #dc2626 lá. Ao mover QUOTAS para `shared`, escolha UM par por cota.
const QUOTA_OPTIONS = [
  { value: "MASTER",     label: "Master",     dot: "#ef4444", text: "#b91c1c", bg: "#fef2f2", border: "#fecaca" },
  { value: "GOLD",       label: "Gold",       dot: "#3b82f6", text: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
  { value: "SILVER",     label: "Silver",     dot: "#a855f7", text: "#7e22ce", bg: "#faf5ff", border: "#e9d5ff" },
  { value: "APOIO",      label: "Apoio",      dot: "#78716c", text: "#44403c", bg: "#f5f5f4", border: "#e7e5e4" },
  { value: "MIDIA",      label: "Mídia",      dot: "#06b6d4", text: "#0e7490", bg: "#ecfeff", border: "#a5f3fc" },
  { value: "MINISTERIO", label: "Ministério", dot: "#10b981", text: "#047857", bg: "#ecfdf5", border: "#a7f3d0" },
];

// Offsets padrão dos prazos (dias relativos à saída do caminhão).
const DEFAULT_DEADLINES = {
  deadlineListaImagens: -25,
  deadlineEntregaLayouts: -20,
  deadlineAprovacaoLayout: -12,
  deadlineFinalizacao: -10,
  deadlineRevisaoLista: -8,
  deadlineProducaoGrafica: -1,
};

type DeadlineField = keyof typeof DEFAULT_DEADLINES;

// Os marcos, na ORDEM da cadeia causal. `key` casa com `nextMilestone.key`
// do servidor (server/routes/events.ts MARCO_DEFS) — é o que permite pintar a
// bolinha do card com a cor do marco sem duplicar a conta de prazo.
const MARCO_FIELDS: {
  field: DeadlineField;
  key: string;
  label: string;
  desc: string;
  color: string;
  allDays: boolean;
}[] = [
  { field: 'deadlineListaImagens',   key: 'listaImagens', label: 'Lista de Imagens',    desc: 'Criação dos itens do evento',          color: '#8b5cf6', allDays: false },
  { field: 'deadlineEntregaLayouts', key: 'layouts',      label: 'Entrega de Layouts',  desc: 'Arte entrega os arquivos finais',      color: '#3b82f6', allDays: false },
  { field: 'deadlineAprovacaoLayout',key: 'aprovacao',    label: 'Aprovação de Layout', desc: 'Aprovação pelo patrocinador',          color: '#f59e0b', allDays: false },
  { field: 'deadlineFinalizacao',    key: 'finalizacao',  label: 'Finalização',         desc: 'Arte anexa o arquivo final da peça',   color: '#14b8a6', allDays: false },
  { field: 'deadlineRevisaoLista',   key: 'revisao',      label: 'Revisão de Lista',    desc: 'Criador revisa e lança todos os itens',color: '#10b981', allDays: false },
  { field: 'deadlineProducaoGrafica',key: 'producao',     label: 'Produção Gráfica',    desc: 'Prazo da gráfica para produzir',       color: '#f97316', allDays: true  },
];
const MARCO_COLOR: Record<string, string> = Object.fromEntries(MARCO_FIELDS.map((m) => [m.key, m.color]));

// Rótulo do botão "Restaurar padrão", DERIVADO dos offsets. Era a lista
// datilografada "(−25 / −20 / −12 / −8 / −1)": acrescentar um marco deixava o
// botão mentindo sobre o que ele restaura, sem erro de compilação.
// U+2212 (menos) e não hífen — é o sinal que o resto da tela usa em fmtOffset.
const DEFAULT_OFFSETS_LABEL = MARCO_FIELDS
  .map((m) => `−${Math.abs(DEFAULT_DEADLINES[m.field])}`)
  .join(' / ');

/** Forma de `event.nextMilestone` — contrato de server/routes/events.ts. */
interface NextMilestonePayload {
  key: string;
  label: string;
  deadline: string;       // "YYYY-MM-DD", já com ajuste sáb→sex / dom→seg
  daysRemaining: number;  // >0 faltam N · 0 vence hoje · <0 atrasado há N
  state: 'upcoming' | 'warning' | 'overdue';
  pendingItems: number;
  invalidDate: boolean;
}

// Grafias que contam como ENTREGUE e como FORA DO FUNIL — espelham
// server/routes/events.ts. Só são usadas no fallback de `readEventStats`.
const DELIVERED_STATUSES = new Set(['delivered', 'entregue']);
const OUT_OF_FUNNEL_STATUSES = new Set(['canceled', 'deleted', 'archived']);

interface EventStats {
  itemCount: number;
  activeItemCount: number;
  deliveredCount: number;
  canceledCount: number;
  openCount: number;
  inProductionCount: number;
  allDelivered: boolean;
  eventHasPassed: boolean;
  manuallyClosed: boolean;
  lifecycle: LifecycleKey;
  progressPct: number;
}

/**
 * Lê os contadores do payload — com FALLBACK calculado no cliente.
 *
 * O servidor manda `lifecycle`/`allDelivered`/`deliveredCount`/`activeItemCount`
 * prontos e essa é a fonte a usar. O fallback existe para o cenário
 * git-pull-sem-Stop/Run (o Express velho responde sem os campos novos): sem
 * ele a tela mostraria TODO evento como "ativo, 0%", que é pior que a mentira
 * que estamos corrigindo. As duas contas seguem a MESMA regra: canceladas
 * saem do denominador, "entregue" (grafia legada) conta como entregue.
 */
function readEventStats(event: any): EventStats {
  const items: any[] = Array.isArray(event.items) ? event.items : [];

  let deliveredCount = 0;
  let canceledCount = 0;
  let inProductionCount = 0;
  for (const it of items) {
    if (OUT_OF_FUNNEL_STATUSES.has(it.status)) canceledCount += 1;
    else if (DELIVERED_STATUSES.has(it.status)) deliveredCount += 1;
    if (it.status === 'inProduction' || it.status === 'em_producao') inProductionCount += 1;
  }

  const itemCount = typeof event.itemCount === 'number' ? event.itemCount : items.length;
  canceledCount = typeof event.canceledCount === 'number' ? event.canceledCount : canceledCount;
  deliveredCount = typeof event.deliveredCount === 'number' ? event.deliveredCount : deliveredCount;
  const activeItemCount = typeof event.activeItemCount === 'number'
    ? event.activeItemCount
    : itemCount - canceledCount;
  const openCount = typeof event.openCount === 'number'
    ? event.openCount
    : activeItemCount - deliveredCount;

  const allDelivered = typeof event.allDelivered === 'boolean'
    ? event.allDelivered
    : activeItemCount > 0 && openCount === 0;

  // `eventHasPassed` do servidor usa dia-calendário em America/Sao_Paulo. O
  // fallback local compara datas (não instantes) para não virar "passou" às
  // 21:00 da véspera, que era o bug original.
  let eventHasPassed = false;
  if (typeof event.eventHasPassed === 'boolean') {
    eventHasPassed = event.eventHasPassed;
  } else if (event.startDate) {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    eventHasPassed = todayStr >= String(event.startDate).slice(0, 10);
  }

  // Encerramento MANUAL: `manuallyClosed` vem do servidor; o fallback lê a
  // coluna crua (status "closed") porque é ela que persiste a decisão. É o
  // único pedaço do ciclo de vida que NÃO se recalcula a partir das peças —
  // por isso vem primeiro e vence os outros três.
  const manuallyClosed = typeof event.manuallyClosed === 'boolean'
    ? event.manuallyClosed
    : event.status === 'closed';

  const lifecycle: LifecycleKey = manuallyClosed
    ? 'manually_closed'
    : (event.lifecycle as LifecycleKey)
      ?? (allDelivered ? 'completed' : eventHasPassed ? 'closed_with_pending' : 'active');

  const progressPct = activeItemCount > 0
    ? Math.round((deliveredCount / activeItemCount) * 100)
    : 0;

  return {
    itemCount, activeItemCount, deliveredCount, canceledCount, openCount,
    inProductionCount, allDelivered, eventHasPassed, manuallyClosed, lifecycle, progressPct,
  };
}

/** Prioridade do evento para filtro/ordenação. Ciclo de vida NÃO entra aqui. */
function eventPriorityKey(event: any): PriorityLevel {
  return (event.priority as PriorityLevel) || 'sem_prioridade';
}

// Cores/rótulos derivados de PRIORITY (lib/status) — antes havia mapas hex
// duplicados aqui. `hex` (saturado) fica para borda/ícone/barra; `text` (tom
// escuro AA) é o que vai em texto.
const PRIORITY_FALLBACK = { label: "Sem Prioridade", hex: '#d6d3d1', text: '#57534e' };
function getPriorityConfig(priority: string | null | undefined): { label: string; hex: string; text: string } {
  const meta = getPriorityMeta(priority);
  return meta ? { label: meta.label, hex: meta.dot, text: meta.text || '#57534e' } : PRIORITY_FALLBACK;
}

// ── Barra de progresso segmentada por FASE ───────────────────────────────────
// Deriva de PRODUCTION_STATUSES (lib/status) para não inventar vocabulário: a
// barra antiga só enxergava `delivered`, então um evento com tudo produzido e
// conferido aparecia com 0% — visualmente idêntico a um evento travado.
const PHASE_ALIASES: Record<string, string[]> = {
  inProduction: ['inProduction', 'em_producao'],
  produced:     ['produced', 'produzido'],
  conferred:    ['conferred'],
  delivered:    ['delivered', 'entregue'],
};
const PHASE_NOUN: Record<string, string> = {
  inProduction: 'em produção',
  produced:     'produzidas',
  conferred:    'conferidas',
  delivered:    'entregues',
};
const PHASES = PRODUCTION_STATUSES.map((key) => ({
  key,
  color: getStatusMeta(key).dot,
  statuses: PHASE_ALIASES[key],
  noun: PHASE_NOUN[key],
}));

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Quantos cards a grade monta de primeira. É a única lista do app que só
// cresce (nada nunca sai dela), então segue o mesmo teto do Painel Geral e do
// detalhe do evento: 50 + "Mostrar todos".
const CARD_PAGE = 50;

// ── Helpers de data (escopo de módulo: não dependem de estado) ───────────────
const parseDateStr = (s: string): Date | undefined => {
  s = (s || "").slice(0, 10); // blinda contra ISO completo ("...T00:00:00.000Z")
  if (!s) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
};
const toDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fmtDateBR = (s: string): string => {
  s = (s || "").slice(0, 10); // blinda contra ISO completo
  if (!s) return '';
  const p = s.split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
};

/**
 * "10 mar" — e "10 mar 2027" quando o ano difere do corrente.
 *
 * ATENÇÃO: recebe o valor JÁ passado por `toUTCDisplayDate`, que desloca o
 * instante pelo offset do navegador exatamente para que a leitura LOCAL
 * (getFullYear, toLocaleDateString sem `timeZone`) devolva a hora de parede
 * gravada. Formatar esse mesmo valor com `timeZone:'UTC'` aplicaria o
 * deslocamento DUAS vezes: em Brasília uma saída às 08:00 virava 11:00, e uma
 * saída às 22:00 pulava para o dia (e às vezes o ano) seguinte.
 */
function fmtCardDate(d: Date, currentYear: number): string {
  const base = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
  return d.getFullYear() === currentYear ? base : `${base} ${d.getFullYear()}`;
}

/** Frase de prazo do próximo marco. Os 5 rótulos são femininos ("Lista", "Entrega", "Aprovação", "Revisão", "Produção"). */
function milestoneDueText(ms: NextMilestonePayload): string {
  if (ms.invalidDate) return 'prazo indisponível — confira a saída';
  const d = ms.daysRemaining;
  if (d < 0) return `atrasada há ${Math.abs(d)} ${Math.abs(d) === 1 ? 'dia' : 'dias'}`;
  if (d === 0) return 'vence hoje';
  if (d === 1) return 'vence amanhã';
  return `vence em ${d} dias`;
}

const MILESTONE_TONE = {
  overdue:  { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  warning:  { text: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  upcoming: { text: '#57534e', bg: '#f5f5f4', border: '#e7e5e4' },
} as const;

function EventCardActions({
  event,
  accentHex,
  onEdit,
  onDelete,
  onDuplicate,
  onSetPriority,
  onClose,
  onReopen,
  canEdit,
  canDelete,
  canDuplicate,
  canSetPriority,
  canClose,
  isClosed,
  isMobile,
}: {
  event: any;
  accentHex: string;
  onEdit: (event: any, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: (event: any, e: React.MouseEvent) => void;
  onSetPriority: (event: any, e: React.MouseEvent) => void;
  onClose: (event: any, e: React.MouseEvent) => void;
  onReopen: (event: any, e: React.MouseEvent) => void;
  canEdit: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canSetPriority: boolean;
  canClose: boolean;
  isClosed: boolean;
  isMobile?: boolean;
}) {
  // Alvo de toque: 44px no mobile, 32px no desktop.
  const btnBase: React.CSSProperties = {
    minWidth: isMobile ? 44 : 32,
    minHeight: isMobile ? 44 : 32,
    padding: '8px',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: R.md,
    cursor: 'pointer',
    display: 'flex',
    boxShadow: SHADOW.sm,
  };
  return (
    <div
      className={isMobile ? "focus-within:opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}
      style={{ display: 'flex', gap: '6px', transition: 'opacity 0.2s', flexShrink: 0 }}
      onClick={(e) => { e.stopPropagation(); }}
    >
      {/* canSetPriority espelha o gate do servidor (admin/atendimento/solicitacao).
          A bandeira só some no evento CONCLUÍDO de verdade — antes ela sumia
          por data, e a prioridade do evento problemático virava inalterável. */}
      {canSetPriority && (
        <button
          onClick={(e) => onSetPriority(event, e)}
          title="Definir prioridade"
          aria-label={`Definir prioridade de ${event.name}`}
          data-testid={`button-priority-event-${event.id}`}
          style={{ ...btnBase, backgroundColor: '#f9f9f8', color: event.priority ? accentHex : '#78716c' }}
        >
          <Flag style={{ width: '13px', height: '13px', fill: event.priority ? accentHex : 'none' }} />
        </button>
      )}
      {canDuplicate && (
        <button onClick={(e) => onDuplicate(event, e)} data-testid={`button-duplicate-event-${event.id}`}
          title="Duplicar evento (prazos, patrocinadores e cotas)" aria-label={`Duplicar evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: '#f9f9f8', color: '#78716c' }}>
          <Copy style={{ width: '13px', height: '13px' }} />
        </button>
      )}
      {canEdit && (
        <button onClick={(e) => onEdit(event, e)} data-testid={`button-edit-event-${event.id}`}
          title="Editar evento" aria-label={`Editar evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: '#f9f9f8', color: '#78716c' }}>
          <Pencil style={{ width: '13px', height: '13px' }} />
        </button>
      )}
      {/* Encerrar / Reabrir — o mesmo lugar no card, porque são a mesma
          decisão nas duas direções. Só admin (ver gate do servidor). */}
      {canClose && (
        isClosed ? (
          <button onClick={(e) => onReopen(event, e)} data-testid={`button-reopen-event-${event.id}`}
            title="Reabrir evento" aria-label={`Reabrir evento ${event.name}`}
            style={{ ...btnBase, backgroundColor: '#f0fdf4', color: '#15803d' }}>
            <Unlock style={{ width: '13px', height: '13px' }} />
          </button>
        ) : (
          <button onClick={(e) => onClose(event, e)} data-testid={`button-close-event-${event.id}`}
            title="Encerrar evento" aria-label={`Encerrar evento ${event.name}`}
            style={{ ...btnBase, backgroundColor: '#f9f9f8', color: '#57534e' }}>
            <Lock style={{ width: '13px', height: '13px' }} />
          </button>
        )
      )}
      {canDelete && (
        <button onClick={(e) => onDelete(event.id, e)} data-testid={`button-delete-event-${event.id}`}
          title="Excluir evento" aria-label={`Excluir evento ${event.name}`}
          style={{ ...btnBase, backgroundColor: '#fef2f2', color: '#ef4444' }}>
          <Trash2 style={{ width: '13px', height: '13px' }} />
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CARD DO EVENTO
//
// O conteúdo inteiro é uma ÂNCORA de verdade (<a href>) — antes era um
// `div role="link"`, o que tirava Ctrl/⌘+clique, clique do meio, "abrir em
// nova aba", "copiar link" e o preview do destino na barra de status. Quem
// trabalha aqui todo dia compara eventos: abrir três em abas é o gesto
// natural. Os botões de ação ficam FORA da âncora (âncora não pode conter
// botão), posicionados sobre o canto — e a primeira linha reserva a largura
// deles para o badge nunca correr por baixo.
// ─────────────────────────────────────────────────────────────────────────────
function EventCard({
  event,
  cardSponsors,
  isMobile,
  currentYear,
  canEdit,
  canDelete,
  canDuplicate,
  canSetPriority,
  canClose,
  onEdit,
  onDelete,
  onDuplicate,
  onSetPriority,
  onClose,
  onReopen,
}: {
  event: any;
  cardSponsors: Sponsor[];
  isMobile: boolean;
  currentYear: number;
  canEdit: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canSetPriority: boolean;
  canClose: boolean;
  onEdit: (event: any, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: (event: any, e: React.MouseEvent) => void;
  onSetPriority: (event: any, e: React.MouseEvent) => void;
  onClose: (event: any, e: React.MouseEvent) => void;
  onReopen: (event: any, e: React.MouseEvent) => void;
}) {
  const stats = readEventStats(event);
  const isDone = stats.lifecycle === 'completed';
  const isClosedPending = stats.lifecycle === 'closed_with_pending';
  const isClosed = stats.lifecycle === 'manually_closed';
  const priorityConfig = getPriorityConfig(event.priority);
  // Cinza no encerrado manual, de propósito: verde diria "deu tudo certo" e
  // âmbar diria "corre atrás". Encerrado é nenhum dos dois — é fora de jogo.
  const accentHex = isClosed ? '#78716c' : isDone ? '#10b981' : isClosedPending ? '#f59e0b' : priorityConfig.hex;

  // Urgência da saída pelo MESMO helper que a exibição e os filtros usam.
  // Com `new Date(...)` cru, um caminhão gravado para 08:00 virava o instante
  // 08:00Z = 05:00 em Brasília: entre 05:00 e 08:00 do dia da saída o card
  // exibia "10 mar · 08:00" E o selo vermelho "Saiu hoje" ao mesmo tempo.
  const departure = event.truckDepartureDate ? toUTCDisplayDate(event.truckDepartureDate) : null;
  const hoursUntilDeparture = departure ? (departure.getTime() - Date.now()) / 3600000 : null;
  const truckUrgency = hoursUntilDeparture === null ? 'normal'
    : hoursUntilDeparture < 0 ? 'departed'
    : hoursUntilDeparture < 24 ? 'urgent'
    : hoursUntilDeparture < 48 ? 'warning'
    : 'normal';
  const daysSinceDeparture = hoursUntilDeparture === null ? 0 : Math.floor(-hoursUntilDeparture / 24);

  // Saturado só no ÍCONE; o TEXTO usa tons escuros com contraste AA.
  // `outOfPlay` = concluído ou encerrado à mão: nos dois casos a saída deixa de
  // ser urgência. Pulsar vermelho num evento que alguém fechou é o alarme falso
  // que ensina a ignorar o vermelho de verdade.
  const outOfPlay = isDone || isClosed;
  const truckIconColor = isDone ? '#10b981' : isClosed ? '#78716c' : truckUrgency === 'urgent' ? '#ef4444' : truckUrgency === 'warning' ? '#f59e0b' : '#78716c';
  const truckTextColor = !outOfPlay && truckUrgency === 'urgent' ? '#b91c1c' : !outOfPlay && truckUrgency === 'warning' ? '#b45309' : '#1c1917';

  const ms: NextMilestonePayload | null = event.nextMilestone ?? null;
  const msTone = MILESTONE_TONE[ms?.state ?? 'upcoming'];

  // Espaço reservado na primeira linha para as ações sobrepostas.
  const actionCount = (canSetPriority ? 1 : 0) + (canDuplicate ? 1 : 0) + (canEdit ? 1 : 0)
    + (canClose ? 1 : 0) + (canDelete ? 1 : 0);
  const btnSize = isMobile ? 44 : 32;
  const actionsWidth = actionCount > 0 ? actionCount * btnSize + (actionCount - 1) * 6 + 10 : 0;
  const cardPad = isMobile ? 14 : 24;

  const stateLabel = isClosed
    ? (isMobile ? 'Encerrado' : 'Encerrado manualmente')
    : isDone
      ? 'Concluído'
      : isClosedPending
        ? (isMobile ? 'Com pendências' : 'Encerrado com pendências')
        : null;

  // Evento encerrado SEM nenhuma peça: "0 peças em aberto" seria mentira ao
  // contrário — não há trabalho pendente, há trabalho que nunca começou.
  const closedEmpty = isClosedPending && stats.activeItemCount === 0;
  const ariaLabel = isClosed
    ? `Abrir evento ${event.name} — encerrado manualmente${stats.openCount > 0 ? `, ${stats.openCount} ${stats.openCount === 1 ? 'peça ficou' : 'peças ficaram'} em aberto` : ''}`
    : isDone
      ? `Abrir evento ${event.name} — concluído, ${stats.deliveredCount} peças entregues`
      : closedEmpty
        ? `Abrir evento ${event.name} — encerrado sem nenhuma peça criada`
        : isClosedPending
          ? `Abrir evento ${event.name} — encerrado com ${stats.openCount} ${stats.openCount === 1 ? 'peça em aberto' : 'peças em aberto'}`
          : `Abrir evento ${event.name}`;

  // Uma passada só sobre as peças (a grade monta até 50 cards).
  const phaseCounts = (() => {
    const counts = new Array(PHASES.length).fill(0) as number[];
    const items: any[] = Array.isArray(event.items) ? event.items : [];
    for (const it of items) {
      const idx = PHASES.findIndex((p) => p.statuses.includes(it.status));
      if (idx >= 0) counts[idx] += 1;
    }
    return counts;
  })();

  const emptyActive = stats.activeItemCount === 0 && stats.lifecycle === 'active';

  return (
    <div
      className="group relative bg-white rounded-xl overflow-hidden"
      style={{
        border: '1px solid #e7e5e4',
        borderLeft: `4px solid ${accentHex}`,
        boxShadow: SHADOW.sm,
        transition: 'box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease',
      }}
      /* Hover contido (2px + sombra curta + borda que escurece) no lugar do
         lift de 4px com sombra de 40px: com 3 cards por linha, a elevação
         antiga fazia a grade inteira "pular" a cada passada de mouse. */
      onMouseEnter={isMobile ? undefined : (e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = SHADOW.md;
        el.style.transform = 'translateY(-2px)';
        el.style.borderColor = '#d6d3d1';
      }}
      onMouseLeave={isMobile ? undefined : (e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = SHADOW.sm;
        el.style.transform = 'translateY(0)';
        el.style.borderColor = '#e7e5e4';
      }}
      data-testid={`card-event-${event.id}`}
      data-lifecycle={stats.lifecycle}
    >
      {isDone && (
        <div style={{ position: 'absolute', right: '-16px', bottom: '-16px', opacity: 0.03, pointerEvents: 'none' }}>
          <CheckCircle style={{ width: '120px', height: '120px', color: '#10b981' }} />
        </div>
      )}

      <Link
        href={`/eventos/${event.id}`}
        aria-label={ariaLabel}
        data-testid={`link-event-${event.id}`}
        style={{
          display: 'flex', flexDirection: 'column', gap: '16px',
          padding: cardPad, textDecoration: 'none', color: 'inherit',
          position: 'relative', zIndex: 1, minHeight: '100%',
        }}
      >
        {/* minHeight = altura dos botões: assim a faixa de ações sobreposta
            termina DENTRO desta linha e nunca cobre o começo do nome. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: actionsWidth, minHeight: actionCount > 0 ? btnSize : undefined }}>
          {stateLabel ? (
            <span
              title={isClosed
                ? `Encerrado por decisão de um administrador${stats.openCount > 0 ? ` com ${stats.openCount} ${stats.openCount === 1 ? 'peça em aberto' : 'peças em aberto'}` : ''}. Saiu da Gestão de Prazos e das filas de trabalho; pode ser reaberto.`
                : isDone
                  ? 'Todas as peças foram entregues'
                  : closedEmpty
                    ? 'A data do evento chegou e nenhuma peça chegou a ser criada'
                    : `A data do evento chegou e ${stats.openCount} ${stats.openCount === 1 ? 'peça continua' : 'peças continuam'} em aberto`}
              style={{
                fontSize: FS.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em',
                color: isClosed ? '#44403c' : isDone ? '#047857' : '#b45309',
                backgroundColor: isClosed ? '#f5f5f4' : isDone ? '#ecfdf5' : '#fffbeb',
                border: `1px solid ${isClosed ? '#d6d3d1' : isDone ? '#a7f3d0' : '#fde68a'}`,
                padding: '3px 8px', borderRadius: R.sm, whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              {isClosed
                ? <Lock style={{ width: '10px', height: '10px' }} />
                : isDone
                  ? <CheckCircle style={{ width: '10px', height: '10px' }} />
                  : <AlertTriangle style={{ width: '10px', height: '10px' }} />}
              {stateLabel}
            </span>
          ) : !event.priority ? (
            <span style={{ fontSize: FS.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#746e69', backgroundColor: T.low, padding: '4px 10px', borderRadius: R.sm, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <AlertCircle style={{ width: '10px', height: '10px' }} />
              Sem prioridade
            </span>
          ) : (
            <span style={{ fontSize: FS.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: priorityConfig.text, backgroundColor: accentHex + '12', padding: '4px 10px', borderRadius: R.sm, whiteSpace: 'nowrap' }}>
              {priorityConfig.label}
            </span>
          )}
        </div>

        <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.title, fontWeight: '700', color: T.dark, lineHeight: 1.25, margin: 0 }}>
          {event.name}
        </h3>

        {cardSponsors.length > 0 && (
          <SponsorChips sponsors={cardSponsors} max={3} variant="colored" size="xs" />
        )}

        <div style={{ margin: '2px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={{ fontSize: FS.micro, fontWeight: '700', color: T.second, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Saída do Caminhão</p>
            <div className={!outOfPlay && truckUrgency === 'urgent' ? 'motion-safe:animate-pulse' : ''} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Truck style={{ width: '16px', height: '16px', color: truckIconColor, flexShrink: 0 }} />
              <span style={{ fontSize: FS.strong, fontWeight: '700', color: truckTextColor }}>
                {departure ? fmtCardDate(departure, currentYear) : '—'}
                {departure ? ' · ' : ''}
                {/* Sem `timeZone:'UTC'`: `departure` já veio de
                    toUTCDisplayDate e é lido em hora LOCAL — ver fmtCardDate. */}
                {departure ? departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
              {!outOfPlay && truckUrgency === 'departed' && (
                <span style={{ fontSize: FS.small, fontWeight: '700', color: '#b91c1c' }}>
                  {daysSinceDeparture < 1 ? 'Saiu hoje' : `Saiu há ${daysSinceDeparture}d`}
                </span>
              )}
            </div>
          </div>

          {/* PRÓXIMO MARCO — a informação que só existia em /prazos (admin).
              Vem calculada do servidor: mesma âncora (saída do caminhão), mesmo
              ajuste de fim de semana e mesma regra de pendência acumulada de
              /api/prazos. `daysRemaining` já está no fuso do negócio. */}
          {ms && (
            <div
              title={`${ms.label} — ${milestoneDueText(ms)}. Prazo: ${fmtDateBR(ms.deadline)}.${ms.pendingItems > 0 ? ` ${ms.pendingItems} ${ms.pendingItems === 1 ? 'peça ainda não passou' : 'peças ainda não passaram'} por esta etapa.` : ''}`}
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <p style={{ fontSize: FS.micro, fontWeight: '700', color: T.second, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Próximo marco</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: MARCO_COLOR[ms.key] || '#78716c', flexShrink: 0 }} />
                <span style={{ fontSize: FS.body, fontWeight: '600', color: '#1c1917' }}>{ms.label}</span>
                <span style={{
                  fontSize: FS.small, fontWeight: '700', color: msTone.text,
                  backgroundColor: msTone.bg, border: `1px solid ${msTone.border}`,
                  borderRadius: R.sm, padding: '1px 7px', whiteSpace: 'nowrap',
                }}>
                  {milestoneDueText(ms)}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: FS.small, color: T.second }}>
            <Calendar style={{ width: '11px', height: '11px', color: T.muted, flexShrink: 0 }} />
            <span>
              Início: {event.startDate
                ? parseDateLocal(event.startDate).toLocaleDateString('pt-BR', parseDateLocal(event.startDate).getFullYear() === currentYear
                    ? { day: '2-digit', month: 'short' }
                    : { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
                : '—'}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: '1px solid #f0efee' }}>
          {emptyActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: FS.body, fontWeight: '700', color: ms && ms.state !== 'upcoming' ? msTone.text : '#57534e' }}>
                Nenhuma peça criada
                {ms ? ` — lista ${milestoneDueText(ms)}` : ''}
              </span>
              <span style={{ fontSize: FS.small, fontWeight: '700', color: T.accentText }}>
                Criar lista de imagens →
              </span>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: FS.small, fontWeight: '700', color: '#57534e' }}>
                  {stats.activeItemCount === 0
                    ? 'Sem peças'
                    : `${stats.deliveredCount} de ${stats.activeItemCount} ${stats.activeItemCount === 1 ? 'peça' : 'peças'}`}
                  {stats.inProductionCount > 0 ? ` · ${stats.inProductionCount} em produção` : ''}
                </span>
                {isClosed ? (
                  // O número de peças abertas continua VISÍVEL num evento
                  // encerrado: encerrar tira o evento das filas, não apaga o
                  // que ficou para trás.
                  <span style={{ fontSize: FS.small, fontWeight: '800', color: '#44403c', whiteSpace: 'nowrap' }}>
                    {stats.openCount > 0 ? `Encerrado · ${stats.openCount} em aberto` : 'Encerrado'}
                  </span>
                ) : isDone ? (
                  <span style={{ fontSize: FS.small, fontWeight: '800', color: '#047857', whiteSpace: 'nowrap' }}>Concluído</span>
                ) : isClosedPending ? (
                  <span style={{ fontSize: FS.small, fontWeight: '800', color: '#b45309', whiteSpace: 'nowrap' }}>
                    {closedEmpty ? 'Nada criado' : `${stats.openCount} em aberto`}
                  </span>
                ) : (
                  <span style={{ fontSize: FS.small, fontWeight: '800', color: T.dark, whiteSpace: 'nowrap' }}>{stats.progressPct}%</span>
                )}
              </div>
              {/* Barra SEGMENTADA por fase: cada trecho é uma etapa da produção
                  (em produção → produzido → conferido → entregue). A barra
                  antiga só media `delivered` e mostrava 0% para um evento com
                  tudo produzido e conferido. */}
              <div
                style={{ width: '100%', backgroundColor: '#f0efee', borderRadius: R.pill, height: '8px', overflow: 'hidden', display: 'flex' }}
                role="img"
                aria-label={PHASES.map((p, i) => `${phaseCounts[i]} ${p.noun}`).join(', ')}
              >
                {PHASES.map((p, i) => (
                  phaseCounts[i] > 0 && stats.activeItemCount > 0 ? (
                    <div
                      key={p.key}
                      title={`${phaseCounts[i]} ${p.noun}`}
                      style={{ height: '100%', backgroundColor: p.color, width: `${(phaseCounts[i] / stats.activeItemCount) * 100}%`, transition: 'width 0.4s ease' }}
                    />
                  ) : null
                ))}
              </div>
              {stats.canceledCount > 0 && (
                <span style={{ fontSize: FS.micro, color: T.second, marginTop: '5px', display: 'block' }}>
                  {stats.canceledCount} {stats.canceledCount === 1 ? 'peça cancelada' : 'peças canceladas'} fora da conta
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div style={{ position: 'absolute', top: cardPad, right: cardPad, zIndex: 2 }}>
        <EventCardActions
          event={event}
          accentHex={accentHex}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onSetPriority={onSetPriority}
          onClose={onClose}
          onReopen={onReopen}
          canEdit={canEdit}
          canDelete={canDelete}
          canDuplicate={canDuplicate}
          // Prioridade não faz sentido no que já saiu de jogo — nem no
          // concluído, nem no encerrado à mão.
          canSetPriority={canSetPriority && !isDone && !isClosed}
          canClose={canClose}
          isClosed={isClosed}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

export default function Eventos() {
  const { user } = useAuth();
  // Permissões de UI espelham os gates do servidor. Todas leem `user.role`
  // pela MESMA forma — `hasPermission("solicitacao")` já devolve true para
  // admin, então misturar as duas escritas dava a impressão de regras
  // diferentes onde a regra é a mesma.
  const role = user?.role;
  const canEdit = role === 'admin' || role === 'solicitacao';        // PATCH /api/events/:id
  const canDelete = role === 'admin';                                 // DELETE /api/events/:id
  // Encerrar/reabrir é da mesma classe da exclusão (admin), e não da edição:
  // não muda um dado do evento, tira trabalho do campo de visão de OUTRAS
  // equipes — some da Gestão de Prazos e das filas. Espelha o gate do servidor
  // em POST /api/events/:id/close e /reopen.
  const canClose = role === 'admin';
  const canSetPriority = role === 'admin' || role === 'atendimento' || role === 'solicitacao';
  const canCreate = role === 'admin' || role === 'solicitacao';       // POST /api/events
  const [open, setOpen] = useState(false);

  // ── Filtros: inicializam da URL e são espelhados nela ──────────────────────
  // (mesmo padrão do Painel Geral: F5 não perde o estado e o link filtrado é
  // compartilhável).
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  // Busca com DEBOUNCE: `searchInput` acompanha a digitação; `searchTerm` (o
  // que filtra e vai para a URL) só alcança 200ms depois. Sem isso, cada tecla
  // refiltrava e reordenava a grade inteira — e escrevia um replaceState, o
  // padrão que a casa já documentou como causa de SecurityError no Safari
  // (~100 chamadas/30s derrubam a árvore React) em gestao-prazos.tsx:575.
  const [searchInput, setSearchInput] = useState(() => urlParams.get("busca") ?? "");
  const [searchTerm, setSearchTerm] = useState(() => urlParams.get("busca") ?? "");
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(
    () => (urlParams.get("prioridade")?.split(",").filter(Boolean)) ?? [],
  );
  const [selectedSponsorFilter, setSelectedSponsorFilter] = useState<string[]>(
    () => (urlParams.get("patrocinador")?.split(",").filter(Boolean)) ?? [],
  );
  const [next10DaysFilter, setNext10DaysFilter] = useState(() => urlParams.get("proximos") === "1");
  const [monthFilter, setMonthFilter] = useState<string>(() => urlParams.get("mes") ?? "all");
  // "Ocultar concluídos" nasce LIGADO: a visão padrão é o que ainda tem
  // trabalho. Só esconde `lifecycle === 'completed'` — "Encerrado com
  // pendências" continua visível, e em âmbar, porque ainda há o que fechar.
  // Na URL o parâmetro diz o CONTRÁRIO (`concluidos=1` = mostrar), para que o
  // estado padrão continue sendo a URL limpa.
  const [showCompleted, setShowCompleted] = useState(() => urlParams.get("concluidos") === "1");
  // Chips de foco do cabeçalho (sugestão 7 do relatório).
  const [foco, setFoco] = useState<string>(() => urlParams.get("foco") ?? "");

  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // URL espelhada com 300ms de atraso — ver comentário do debounce acima.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (searchTerm) p.set("busca", searchTerm);
      if (selectedPriorities.length) p.set("prioridade", selectedPriorities.join(","));
      if (selectedSponsorFilter.length) p.set("patrocinador", selectedSponsorFilter.join(","));
      if (next10DaysFilter) p.set("proximos", "1");
      if (monthFilter !== "all") p.set("mes", monthFilter);
      if (showCompleted) p.set("concluidos", "1");
      if (foco) p.set("foco", foco);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm, selectedPriorities, selectedSponsorFilter, next10DaysFilter, monthFilter, showCompleted, foco]);

  // Atalho "/" foca a busca (paridade com o Painel Geral).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const clearAllEventFilters = () => {
    setSearchInput(""); setSearchTerm(""); setSelectedPriorities([]); setSelectedSponsorFilter([]);
    setNext10DaysFilter(false); setMonthFilter("all"); setFoco("");
  };

  const [formData, setFormData] = useState({
    name: "",
    priority: "",
    startDate: "",
    truckDepartureDate: "",
    ...DEFAULT_DEADLINES,
  });
  const [prazosExpanded, setPrazosExpanded] = useState(false);
  const [selectedSponsorIds, setSelectedSponsorIds] = useState<string[]>([]);
  const [sponsorQuotaMap, setSponsorQuotaMap] = useState<Record<string, string>>({});
  const [sponsorsLoading, setSponsorsLoading] = useState(false);
  const [sponsorsError, setSponsorsError] = useState(false);
  const [sponsorSearch, setSponsorSearch] = useState("");
  const [editingEvent, setEditingEvent] = useState<any>(null);
  // Duplicação: mesmo modal, modo "criar" pré-preenchido com os prazos,
  // patrocinadores e cotas de um evento existente.
  const [duplicateSource, setDuplicateSource] = useState<any>(null);
  const [copyItems, setCopyItems] = useState(false);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  // Encerrar e reabrir compartilham um único par de estados: nunca há os dois
  // diálogos abertos ao mesmo tempo (o card mostra um botão OU o outro).
  const [closingEventId, setClosingEventId] = useState<string | null>(null);
  const [reopeningEventId, setReopeningEventId] = useState<string | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [selectedEventForPriority, setSelectedEventForPriority] = useState<any>(null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(CARD_PAGE);
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openTruckDate, setOpenTruckDate] = useState(false);
  const [openPrazoKey, setOpenPrazoKey] = useState<string | null>(null);

  const currentYear = useMemo(() => new Date().getFullYear(), []);

  const { data: events = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [], isLoading: sponsorsQueryLoading, isError: sponsorsQueryError } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  // Resolve nome/cor dos vínculos do payload de eventos (que só trazem sponsorId).
  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const modalMode: 'create' | 'edit' | 'duplicate' =
    editingEvent ? 'edit' : duplicateSource ? 'duplicate' : 'create';

  // ── Snapshot do formulário ────────────────────────────────────────────────
  // `formDirty` comparado contra um SNAPSHOT em vez de "está em modo edição".
  // Antes, abrir a edição já contava como sujo por definição — e conferir é o
  // uso mais frequente da edição, então Esc ficava travado sem nenhuma
  // alteração feita.
  const formSignature = useCallback((
    fd: typeof formData,
    ids: string[],
    quotas: Record<string, string>,
  ) => JSON.stringify({
    ...fd,
    sponsors: [...ids].sort().map((id) => `${id}:${quotas[id] || ''}`),
  }), []);
  const [baselineSig, setBaselineSig] = useState<string>("");
  // Ref para o baseline poder ser recalculado quando os patrocinadores do
  // evento chegam (a busca é assíncrona e o formData já está preenchido).
  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const currentSig = formSignature(formData, selectedSponsorIds, sponsorQuotaMap);
  const formDirty = currentSig !== baselineSig;

  const resetForm = useCallback(() => {
    const empty = { name: "", priority: "", startDate: "", truckDepartureDate: "", ...DEFAULT_DEADLINES };
    setFormData(empty);
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setSponsorSearch("");
    setCopyItems(false);
    return empty;
  }, []);

  /**
   * FECHAR SÓ FECHA. Nenhum estado do formulário é zerado aqui.
   *
   * O modal do Radix continua MONTADO durante a animação de saída (Presence).
   * Zerar formData, editingEvent, patrocinadores e prazos no mesmo clique
   * fazia o conteúdo se reconstruir enquanto ele saía — e o ciclo de
   * attach/detach de ref do Presence entrava em laço: React #185
   * ("Maximum update depth exceeded"), tela branca com "Erro de renderização"
   * ao cancelar, ao fechar no X e depois de salvar.
   *
   * A limpeza não é necessária porque as TRÊS portas de entrada (Novo Evento,
   * handleEdit e handleDuplicate) já inicializam tudo antes de abrir. Se
   * alguma porta nova aparecer, ela também precisa inicializar — não volte a
   * limpar aqui.
   */
  const handleCloseDialog = useCallback(() => {
    setOpen(false);
    setConfirmDiscardOpen(false);
  }, []);

  /** Saída ÚNICA do modal: X, Esc e clique-fora passam todos por aqui. */
  const requestCloseDialog = useCallback(() => {
    if (formDirty) {
      setConfirmDiscardOpen(true);
      return;
    }
    handleCloseDialog();
  }, [formDirty, handleCloseDialog]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  /** Payload aceito por POST/PATCH /api/events. `priority` viaja à parte. */
  const eventPayload = (fd: typeof formData) => ({
    name: fd.name,
    startDate: fd.startDate,
    truckDepartureDate: fd.truckDepartureDate,
    deadlineListaImagens: fd.deadlineListaImagens,
    deadlineEntregaLayouts: fd.deadlineEntregaLayouts,
    deadlineAprovacaoLayout: fd.deadlineAprovacaoLayout,
    deadlineFinalizacao: fd.deadlineFinalizacao,
    deadlineRevisaoLista: fd.deadlineRevisaoLista,
    deadlineProducaoGrafica: fd.deadlineProducaoGrafica,
  });

  const createEventMutation = useMutation({
    mutationFn: async ({ fd, cloneFrom }: { fd: typeof formData; cloneFrom: string | null }) => {
      let response;
      try {
        // `priority` só entra quando definida: insertEventSchema aceita o enum
        // dos 4 níveis e rejeita string vazia com 400.
        const body: Record<string, unknown> = eventPayload(fd);
        if (fd.priority) body.priority = fd.priority;
        response = await apiRequest("POST", "/api/events", body);
      } catch (error: any) {
        throw new Error(error?.message || "Erro ao criar evento");
      }
      const event = await response.json();

      // Vincular patrocinadores em lotes de 5 (runInBatches, lib/utils): 25
      // patrocinadores em Promise.all abriam 25 conexões simultâneas, cada uma
      // ainda fazendo getEvent + getSponsor para o audit log — a causa
      // documentada de falhas intermitentes em massa.
      // Se o evento JÁ foi criado, uma falha aqui não vira erro do fluxo (o
      // toast de erro sugeriria tentar de novo e duplicar o evento) — coletamos
      // os NOMES que falharam para o onSuccess avisar quais revisar.
      const failedSponsors: string[] = [];
      if (selectedSponsorIds.length > 0) {
        await runInBatches(selectedSponsorIds, async (sponsorId) => {
          try {
            await apiRequest("POST", `/api/events/${event.id}/sponsors`, { sponsorId, quota: sponsorQuotaMap[sponsorId] || null });
          } catch {
            failedSponsors.push(sponsorById.get(sponsorId)?.name || sponsorId);
          }
        }, 5);
      }

      // Duplicação com peças: reaproveita o endpoint de clonagem que o detalhe
      // do evento já usa. Falhar aqui também não invalida o evento criado.
      let clonedItems = 0;
      let cloneFailed = false;
      if (cloneFrom) {
        try {
          const res = await apiRequest("POST", `/api/events/${event.id}/clone-items`, { sourceEventId: cloneFrom });
          const data = await res.json();
          clonedItems = data?.cloned ?? 0;
        } catch {
          cloneFailed = true;
        }
      }

      return { event, failedSponsors, clonedItems, cloneFailed };
    },
    onSuccess: ({ event, failedSponsors, clonedItems, cloneFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      handleCloseDialog();
      const parts: string[] = [];
      if (clonedItems > 0) parts.push(`${clonedItems} ${clonedItems === 1 ? 'peça copiada' : 'peças copiadas'}`);
      if (cloneFailed) parts.push("as peças não puderam ser copiadas — use 'Clonar peças' dentro do evento");
      if (failedSponsors.length > 0) parts.push(`não foi possível vincular: ${failedSponsors.join(", ")}`);
      toast({
        title: "Evento criado",
        description: parts.length > 0 ? parts.join(" · ") : "O evento foi criado com sucesso.",
        // O passo seguinte à criação é SEMPRE montar a lista de imagens — sem
        // esta ação o usuário voltava para a grade e precisava caçar o card
        // recém-criado, que pode estar fora do filtro ativo.
        action: (
          <ToastAction altText="Abrir evento" onClick={() => setLocation(`/eventos/${event.id}`)}>
            Abrir evento
          </ToastAction>
        ),
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao criar evento", description: error.message, variant: "destructive" });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, fd }: { id: string; fd: typeof formData }) => {
      const failedSponsors: string[] = [];
      try {
        await apiRequest("PATCH", `/api/events/${id}`, eventPayload(fd));

        // Prioridade tem rota própria (gate e audit log próprios) e é a única
        // que aceita "" para REMOVER — insertEventSchema rejeitaria a string
        // vazia com 400.
        const originalPriority = editingEvent?.priority || "";
        if ((fd.priority || "") !== originalPriority) {
          await apiRequest("PATCH", `/api/events/${id}/priority`, { priority: fd.priority || "" });
        }

        const currentSponsorsRes = await apiRequest("GET", `/api/events/${id}/sponsors`);
        const currentSponsors = await currentSponsorsRes.json();
        const currentSponsorIds = currentSponsors.map((es: any) => es.sponsorId);
        const currentQuotaMap: Record<string, string> = {};
        currentSponsors.forEach((es: any) => { currentQuotaMap[es.sponsorId] = es.quota || ''; });

        const toRemove = currentSponsorIds.filter((sid: string) => !selectedSponsorIds.includes(sid));
        const toAdd = selectedSponsorIds.filter((sid: string) => !currentSponsorIds.includes(sid));
        const toUpdateQuota = selectedSponsorIds.filter(
          (sid: string) => currentSponsorIds.includes(sid) && (sponsorQuotaMap[sid] || '') !== (currentQuotaMap[sid] || '')
        );

        // Mesma razão do create: lotes de 5 em vez de um Promise.all com todas
        // as operações de vínculo de uma vez.
        const operations: { run: () => Promise<unknown>; name: string }[] = [
          ...toRemove.map((sponsorId: string) => ({
            name: sponsorById.get(sponsorId)?.name || sponsorId,
            run: () => apiRequest("DELETE", `/api/events/${id}/sponsors/${sponsorId}`),
          })),
          ...toAdd.map((sponsorId: string) => ({
            name: sponsorById.get(sponsorId)?.name || sponsorId,
            run: () => apiRequest("POST", `/api/events/${id}/sponsors`, { sponsorId, quota: sponsorQuotaMap[sponsorId] || null }),
          })),
          ...toUpdateQuota.map((sponsorId: string) => ({
            name: sponsorById.get(sponsorId)?.name || sponsorId,
            run: () => apiRequest("PATCH", `/api/events/${id}/sponsors/${sponsorId}`, { quota: sponsorQuotaMap[sponsorId] || null }),
          })),
        ];

        if (operations.length > 0) {
          await runInBatches(operations, async (op) => {
            try { await op.run(); } catch { failedSponsors.push(op.name); }
          }, 5);
        }
      } catch (error: any) {
        throw new Error(error?.message || "Erro ao atualizar evento e patrocinadores");
      }
      return { failedSponsors };
    },
    onSuccess: ({ failedSponsors }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      handleCloseDialog();
      toast({
        title: "Evento atualizado",
        description: failedSponsors.length > 0
          ? `Não foi possível atualizar: ${failedSponsors.join(", ")}. Reabra o evento para revisar.`
          : "O evento foi atualizado com sucesso.",
        variant: failedSponsors.length > 0 ? "destructive" : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar evento", description: error.message, variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/events/${id}`);
      // apiRequest devolve Response crua; o corpo traz a dimensão real do que
      // o cascade removeu.
      return await res.json() as { deletedItems?: number; deliveredItems?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDeletingEventId(null);
      setDeleteConfirmText("");
      const removed = data?.deletedItems ?? 0;
      const delivered = data?.deliveredItems ?? 0;
      toast({
        title: "Evento excluído",
        description: removed > 0
          ? `${removed} ${removed === 1 ? 'peça removida' : 'peças removidas'} em cascata${delivered > 0 ? ` (${delivered} já ${delivered === 1 ? 'entregue' : 'entregues'})` : ''}.`
          : "O evento foi excluído com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir evento", description: error.message, variant: "destructive" });
    },
  });

  // ── Encerrar / reabrir ────────────────────────────────────────────────────
  // O corpo da resposta traz a contagem REAL do servidor (openCount /
  // inProductionCount): o toast repete o número que a confirmação prometeu, em
  // vez de reafirmar o que o cliente já achava.
  const closeEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/events/${id}/close`);
      return await res.json() as { openCount?: number; inProductionCount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      // As filas de trabalho leem `item.event.status` do payload de PEÇAS —
      // sem estas três, a aba de Arte/Gráfica já aberta continuaria mostrando
      // o evento encerrado (essas chaves rodam com staleTime Infinity).
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setClosingEventId(null);
      const open = data?.openCount ?? 0;
      toast({
        title: "Evento encerrado",
        description: open > 0
          ? `${open} ${open === 1 ? 'peça continua' : 'peças continuam'} em aberto na lista do evento, sem cobrança de prazo.`
          : "Saiu da Gestão de Prazos e das filas de trabalho.",
        // O card acabou de SUMIR da grade (a visão padrão esconde encerrados).
        // Sem esta ação, "pode reabrir a qualquer momento" seria verdade só
        // para quem já sabe onde o evento foi parar.
        action: !showCompleted ? (
          <ToastAction altText="Mostrar eventos encerrados" onClick={() => setShowCompleted(true)}>
            Mostrar
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao encerrar evento", description: error.message, variant: "destructive" });
    },
  });

  const reopenEventMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/events/${id}/reopen`);
      return await res.json() as { openCount?: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      // Mesmas três do encerrar: é o que devolve as peças às filas na hora.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      setReopeningEventId(null);
      const open = data?.openCount ?? 0;
      toast({
        title: "Evento reaberto",
        description: open > 0
          ? `Voltou para a Gestão de Prazos e para as filas com ${open} ${open === 1 ? 'peça em aberto' : 'peças em aberto'}.`
          : "Voltou para a Gestão de Prazos e para as filas de trabalho.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao reabrir evento", description: error.message, variant: "destructive" });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: string }) => {
      return await apiRequest("PATCH", `/api/events/${id}/priority`, { priority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setPriorityDialogOpen(false);
      setSelectedEventForPriority(null);
      toast({ title: "Prioridade atualizada", description: "A prioridade do evento foi atualizada com sucesso." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao atualizar prioridade", description: error.message, variant: "destructive" });
    },
  });

  // ── Prazos: ordem, personalização ─────────────────────────────────────────
  const offsets = MARCO_FIELDS.map((m) => Number(formData[m.field]));
  // Cadeia CAUSAL: não se entrega layout de uma lista que não existe. Um marco
  // não pode cair ANTES do anterior. A inversão só reaparecia como alerta
  // esquisito em /prazos e no Painel — aqui ela é barrada na origem.
  const orderIssues = offsets.map((v, i) => i > 0 && v < offsets[i - 1]);
  const hasOrderIssue = orderIssues.some(Boolean);
  const customDeadlineCount = MARCO_FIELDS.filter((m) => Number(formData[m.field]) !== DEFAULT_DEADLINES[m.field]).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.truckDepartureDate) {
      toast({ title: "Datas obrigatórias", description: "Preencha a data de início e a saída do caminhão.", variant: "destructive" });
      return;
    }

    // Horário incompleto: digitar só ":" produzia "2026-03-10T:", que passava
    // por toda a validação do cliente e só estourava no insert do Drizzle com
    // "RangeError: Invalid time value" dentro do toast destrutivo.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(formData.truckDepartureDate)) {
      toast({
        title: "Horário inválido",
        description: "Confira o horário da saída do caminhão (formato 08:00).",
        variant: "destructive",
      });
      setOpenTruckDate(true);
      return;
    }

    // Validação: Saída do caminhão deve ser pelo menos 1 dia ANTES do início do
    // evento. Comparar apenas as datas do calendário (YYYY-MM-DD), sem timezone.
    const startDateStr = formData.startDate;
    const truckDateStr = formData.truckDepartureDate.substring(0, 10);

    // Sanidade de ano (espelha o servidor): um "0206" no banco fez o Painel
    // mostrar "ATRASADO 664730D". O Calendar não produz isso, mas o dado pode
    // vir de import/edição legada — barrar aqui dá mensagem melhor que o 400.
    const badYear = [startDateStr, truckDateStr].some((d) => {
      const y = Number(d.slice(0, 4));
      return !Number.isFinite(y) || y < 2000 || y > 2100;
    });
    if (badYear) {
      toast({
        title: "Data inválida",
        description: "Confira o ano das datas (ex.: 2026) — valor fora do intervalo aceito.",
        variant: "destructive",
      });
      return;
    }

    if (truckDateStr >= startDateStr) {
      toast({
        title: "Data inválida",
        description: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento.",
        variant: "destructive",
      });
      return;
    }

    if (hasOrderIssue) {
      const first = orderIssues.findIndex(Boolean);
      setPrazosExpanded(true);
      toast({
        title: "Prazos fora de ordem",
        description: `"${MARCO_FIELDS[first].label}" está antes de "${MARCO_FIELDS[first - 1].label}". Os ${MARCO_FIELDS.length} marcos seguem uma sequência — ajuste antes de salvar.`,
        variant: "destructive",
      });
      return;
    }

    // Ao editar/duplicar, não deixa salvar antes de os patrocinadores
    // carregarem (ou se o carregamento falhou), para não apagar os vínculos
    // existentes por engano.
    if (modalMode !== 'create' && (sponsorsLoading || sponsorsError)) {
      toast({
        title: sponsorsLoading ? "Aguarde o carregamento" : "Não foi possível carregar os patrocinadores",
        description: sponsorsLoading
          ? "Os patrocinadores do evento ainda estão carregando."
          : "Reabra o evento para editar com segurança — salvar agora poderia remover os patrocinadores vinculados.",
        variant: "destructive",
      });
      return;
    }

    if (editingEvent) {
      updateEventMutation.mutate({ id: editingEvent.id, fd: formData });
    } else {
      createEventMutation.mutate({
        fd: formData,
        cloneFrom: duplicateSource && copyItems ? duplicateSource.id : null,
      });
    }
  };

  const handleEdit = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setDuplicateSource(null);
    setEditingEvent(event);
    const next = {
      name: event.name || "",
      priority: event.priority || "",
      // startDate pode vir como ISO completo ("2026-03-10T00:00:00.000Z") —
      // sem o slice, fmtDateBR/parseDateStr quebravam a exibição no modal.
      startDate: (event.startDate || "").slice(0, 10),
      truckDepartureDate: event.truckDepartureDate ? new Date(event.truckDepartureDate).toISOString().slice(0, 16) : "",
      deadlineListaImagens: event.deadlineListaImagens ?? DEFAULT_DEADLINES.deadlineListaImagens,
      deadlineEntregaLayouts: event.deadlineEntregaLayouts ?? DEFAULT_DEADLINES.deadlineEntregaLayouts,
      deadlineAprovacaoLayout: event.deadlineAprovacaoLayout ?? DEFAULT_DEADLINES.deadlineAprovacaoLayout,
      deadlineFinalizacao: event.deadlineFinalizacao ?? DEFAULT_DEADLINES.deadlineFinalizacao,
      deadlineRevisaoLista: event.deadlineRevisaoLista ?? DEFAULT_DEADLINES.deadlineRevisaoLista,
      deadlineProducaoGrafica: event.deadlineProducaoGrafica ?? DEFAULT_DEADLINES.deadlineProducaoGrafica,
    };
    setFormData(next);
    setCopyItems(false);
    // Baseline provisório (sem patrocinadores); é recalculado quando a busca
    // dos vínculos retorna — ver fetchEventSponsors.
    setBaselineSig(formSignature(next, [], {}));
    // Prazo personalizado precisa estar VISÍVEL na edição: quem abre para mudar
    // a data da saída não fazia ideia de que "Aprovação de Layout" estava
    // customizada em −6, e saía sem revisar.
    const hasCustom = MARCO_FIELDS.some((m) => Number(next[m.field]) !== DEFAULT_DEADLINES[m.field]);
    setPrazosExpanded(hasCustom);
    setOpen(true);
  }, [formSignature]);

  const handleDuplicate = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setEditingEvent(null);
    setDuplicateSource(event);
    const next = {
      name: `${event.name} (cópia)`,
      priority: event.priority || "",
      // Datas em branco de propósito: o que muda entre etapas de um circuito
      // são exatamente elas. Os offsets (prazos) viajam junto.
      startDate: "",
      truckDepartureDate: "",
      deadlineListaImagens: event.deadlineListaImagens ?? DEFAULT_DEADLINES.deadlineListaImagens,
      deadlineEntregaLayouts: event.deadlineEntregaLayouts ?? DEFAULT_DEADLINES.deadlineEntregaLayouts,
      deadlineAprovacaoLayout: event.deadlineAprovacaoLayout ?? DEFAULT_DEADLINES.deadlineAprovacaoLayout,
      deadlineFinalizacao: event.deadlineFinalizacao ?? DEFAULT_DEADLINES.deadlineFinalizacao,
      deadlineRevisaoLista: event.deadlineRevisaoLista ?? DEFAULT_DEADLINES.deadlineRevisaoLista,
      deadlineProducaoGrafica: event.deadlineProducaoGrafica ?? DEFAULT_DEADLINES.deadlineProducaoGrafica,
    };
    setFormData(next);
    setCopyItems(false);
    // Formulário duplicado nasce SUJO (baseline vazio): fechar sem salvar
    // descarta trabalho pré-montado e precisa perguntar.
    setBaselineSig("");
    setPrazosExpanded(MARCO_FIELDS.some((m) => Number(next[m.field]) !== DEFAULT_DEADLINES[m.field]));
    setOpen(true);
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteConfirmText("");
    setDeletingEventId(id);
  }, []);

  const handleClose = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setClosingEventId(event.id);
  }, []);

  const handleReopen = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setReopeningEventId(event.id);
  }, []);

  // Buscar patrocinadores vinculados ao editar/duplicar evento — extraído do
  // useEffect para o banner de erro poder oferecer "Tentar novamente".
  const fetchEventSponsors = useCallback((eventId: string, rebaseline: boolean) => {
    setSponsorsLoading(true);
    setSponsorsError(false);
    apiRequest("GET", `/api/events/${eventId}/sponsors`)
      .then((res) => res.json())
      .then((eventSponsors) => {
        const sponsorIds = eventSponsors.map((es: any) => es.sponsorId);
        const quotaMap: Record<string, string> = {};
        eventSponsors.forEach((es: any) => { if (es.quota) quotaMap[es.sponsorId] = es.quota; });
        setSelectedSponsorIds(sponsorIds);
        setSponsorQuotaMap(quotaMap);
        setSponsorsLoading(false);
        // Só a EDIÇÃO rebaseia: no modo duplicar os vínculos herdados são
        // trabalho novo a salvar, então o formulário continua sujo.
        if (rebaseline) setBaselineSig(formSignature(formDataRef.current, sponsorIds, quotaMap));
      })
      .catch((error) => {
        // NÃO zera selectedSponsorIds aqui: se zerasse e o usuário salvasse,
        // o updateEvent removeria TODOS os vínculos de patrocinador do evento.
        console.error("Erro ao buscar patrocinadores:", error);
        setSponsorsError(true);
        setSponsorsLoading(false);
      });
  }, [formSignature]);

  useEffect(() => {
    if (editingEvent) fetchEventSponsors(editingEvent.id, true);
    else if (duplicateSource) fetchEventSponsors(duplicateSource.id, false);
  }, [editingEvent, duplicateSource, fetchEventSponsors]);

  const handleSetPriority = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEventForPriority(event);
    setPriorityDialogOpen(true);
  }, []);

  const handlePrioritySelect = useCallback((priority: string) => {
    if (selectedEventForPriority) {
      updatePriorityMutation.mutate({ id: selectedEventForPriority.id, priority });
    }
  }, [selectedEventForPriority, updatePriorityMutation]);

  // Atalhos 1–4 definem a prioridade e 0 remove — organizar a fila da semana
  // era hover → bandeira → clique em 5–10 eventos.
  useEffect(() => {
    if (!priorityDialogOpen) return;
    const map: Record<string, string> = { '1': 'baixa', '2': 'media', '3': 'alta', '4': 'urgente', '0': '' };
    const onKey = (e: KeyboardEvent) => {
      if (updatePriorityMutation.isPending) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const value = map[e.key];
      if (value === undefined) return;
      e.preventDefault();
      handlePrioritySelect(value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [priorityDialogOpen, updatePriorityMutation.isPending, handlePrioritySelect]);

  // ── Predicados de filtro ──────────────────────────────────────────────────
  // Separados para que a CONTAGEM de cada dropdown reflita os DEMAIS filtros
  // (o número dentro do dropdown nunca mente sobre o que vai aparecer).
  const matchesSearch = useCallback((event: any) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    if (event.name?.toLowerCase().includes(q)) return true;
    // Busca também por patrocinador: "em quais eventos a Ambev está?" é rotina
    // no Atendimento e não tinha resposta aqui.
    return ((event.sponsors || []) as any[]).some((es) =>
      (sponsorById.get(es.sponsorId)?.name || '').toLowerCase().includes(q));
  }, [searchTerm, sponsorById]);

  const matchesDates = useCallback((event: any) => {
    // Próximos 10 dias — toUTCDisplayDate alinha com a data que o card exibe.
    if (next10DaysFilter && event.truckDepartureDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tenDaysFromNow = new Date(today);
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
      const departureDate = toUTCDisplayDate(event.truckDepartureDate);
      if (!(departureDate >= today && departureDate <= tenDaysFromNow)) return false;
    }
    // Mês — compara ano+mês ("2026-03") na mesma base UTC do card.
    if (monthFilter !== "all" && event.truckDepartureDate) {
      const d = toUTCDisplayDate(event.truckDepartureDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key !== monthFilter) return false;
    }
    return true;
  }, [next10DaysFilter, monthFilter]);

  const matchesFoco = useCallback((event: any) => {
    if (!foco) return true;
    const stats = readEventStats(event);
    if (foco === "atrasado") return event.nextMilestone?.state === 'overdue';
    if (foco === "sem_pecas") return stats.activeItemCount === 0 && !ARCHIVED_LIFECYCLES.has(stats.lifecycle);
    return true;
  }, [foco]);

  const matchesPriority = useCallback((event: any) => {
    if (selectedPriorities.length === 0) return true;
    const lifecycle = readEventStats(event).lifecycle;
    return selectedPriorities.some((sel) => {
      if (sel === 'completed') return lifecycle === 'completed';
      if (sel === 'closed_with_pending') return lifecycle === 'closed_with_pending';
      if (sel === 'manually_closed') return lifecycle === 'manually_closed';
      // Um evento CONCLUÍDO (ou encerrado à mão) não responde mais pela
      // prioridade — o badge dele já não é a prioridade. "Encerrado com
      // pendências", sim: ele continua sendo trabalho, e continua na fila da
      // prioridade que tem.
      return !ARCHIVED_LIFECYCLES.has(lifecycle) && eventPriorityKey(event) === sel;
    });
  }, [selectedPriorities]);

  const matchesSponsor = useCallback((event: any) => {
    if (selectedSponsorFilter.length === 0) return true;
    return ((event.sponsors || []) as any[]).some((es) => selectedSponsorFilter.includes(es.sponsorId));
  }, [selectedSponsorFilter]);

  // "Ocultar concluídos" é ignorado quando o usuário pede explicitamente por
  // eles no filtro de prioridade — senão o dropdown mostraria contagem e a
  // grade viria vazia.
  const explicitLifecycleFilter = selectedPriorities.some((p) => (LIFECYCLE_FILTERS as readonly string[]).includes(p));
  const matchesVisibility = useCallback((event: any) => {
    if (showCompleted || explicitLifecycleFilter) return true;
    // O encerrado à mão sai da visão padrão pela MESMA porta do concluído — e
    // volta pela mesma: o botão "Ocultar concluídos" e o filtro explícito.
    // Encerrar nunca esconde um evento de forma irrecuperável.
    return !ARCHIVED_LIFECYCLES.has(readEventStats(event).lifecycle);
  }, [showCompleted, explicitLifecycleFilter]);

  /**
   * Ordenação: RISCO primeiro, depois SAÍDA DO CAMINHÃO ascendente.
   *
   * A saída é a âncora do negócio — todo prazo do sistema pende dela. A
   * prioridade deixa de ser o eixo primário e vira desempate + destaque
   * visual. Os três baldes:
   *   0 · risco — encerrado com peça aberta, marco atrasado ou prioridade urgente
   *   1 · em jogo
   *   2 · concluído (história; só aparece com "Ocultar concluídos" desligado)
   */
  const sortRank = (event: any): number => {
    const lifecycle = readEventStats(event).lifecycle;
    if (ARCHIVED_LIFECYCLES.has(lifecycle)) return 2;
    if (lifecycle === 'closed_with_pending') return 0;
    if (event.nextMilestone?.state === 'overdue') return 0;
    if (event.priority === 'urgente') return 0;
    return 1;
  };
  const PRIORITY_ORDER: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3, sem_prioridade: 4 };

  const filteredEvents = useMemo(() => {
    // Chaves de ordenação calculadas UMA vez por evento (decorate-sort-undecorate):
    // dentro do comparador, `sortRank` refazia a leitura das peças a cada
    // comparação — O(n log n) varreduras da lista inteira de itens.
    const decorated = events
      .filter((event) => matchesSearch(event) && matchesDates(event) && matchesFoco(event)
        && matchesPriority(event) && matchesSponsor(event) && matchesVisibility(event))
      .map((event) => ({
        event,
        rank: sortRank(event),
        dep: event.truckDepartureDate ? toUTCDisplayDate(event.truckDepartureDate).getTime() : Number.MAX_SAFE_INTEGER,
        prio: PRIORITY_ORDER[eventPriorityKey(event)],
        name: event.name || '',
      }));

    decorated.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.dep !== b.dep) return a.dep - b.dep;
      if (a.prio !== b.prio) return a.prio - b.prio;
      return a.name.localeCompare(b.name, 'pt-BR');
    });

    return decorated.map((d) => d.event);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, matchesSearch, matchesDates, matchesFoco, matchesPriority, matchesSponsor, matchesVisibility]);

  // Volta ao teto sempre que o recorte muda: "Mostrar todos" de um filtro não
  // pode vazar para o próximo.
  useEffect(() => { setVisibleCount(CARD_PAGE); },
    [searchTerm, selectedPriorities, selectedSponsorFilter, next10DaysFilter, monthFilter, showCompleted, foco]);

  const visibleEvents = useMemo(() => filteredEvents.slice(0, visibleCount), [filteredEvents, visibleCount]);
  const hiddenCount = filteredEvents.length - visibleEvents.length;

  // Contagens de prioridade sobre a lista já filtrada pelos DEMAIS filtros.
  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events
      .filter((e) => matchesSearch(e) && matchesDates(e) && matchesFoco(e) && matchesSponsor(e))
      .forEach((e) => {
        const lifecycle = readEventStats(e).lifecycle;
        if (lifecycle === 'manually_closed') {
          counts.manually_closed = (counts.manually_closed || 0) + 1;
          return;
        }
        if (lifecycle === 'completed') {
          counts.completed = (counts.completed || 0) + 1;
          return;
        }
        if (lifecycle === 'closed_with_pending') {
          counts.closed_with_pending = (counts.closed_with_pending || 0) + 1;
        }
        const p = eventPriorityKey(e);
        counts[p] = (counts[p] || 0) + 1;
      });
    return counts;
  }, [events, matchesSearch, matchesDates, matchesFoco, matchesSponsor]);

  const priorityFilterOptions = useMemo(() => ([
    ...Object.entries(PRIORITY).map(([value, meta]) => ({
      value, label: meta.label, dotColor: meta.dot, count: priorityCounts[value] || 0, pinned: true,
    })),
    { value: "sem_prioridade", label: "Sem Prioridade", dotColor: "#d6d3d1", count: priorityCounts.sem_prioridade || 0, pinned: true },
    { value: "closed_with_pending", label: "Encerrado com pendências", dotColor: "#f59e0b", count: priorityCounts.closed_with_pending || 0, pinned: true },
    { value: "completed", label: "Concluído", dotColor: "#10b981", count: priorityCounts.completed || 0, pinned: true },
    { value: "manually_closed", label: "Encerrado manualmente", dotColor: "#78716c", count: priorityCounts.manually_closed || 0, pinned: true },
  ]), [priorityCounts]);

  // Opções/contagens do filtro de patrocinador — mesma disciplina: contam a
  // lista já filtrada por tudo, MENOS o próprio filtro de patrocinador.
  const sponsorFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    events
      .filter((e) => matchesSearch(e) && matchesDates(e) && matchesFoco(e) && matchesPriority(e) && matchesVisibility(e))
      .forEach((e) => {
        ((e.sponsors || []) as any[]).forEach((es) => {
          counts.set(es.sponsorId, (counts.get(es.sponsorId) || 0) + 1);
        });
      });
    const seen = new Set<string>();
    events.forEach((e) => ((e.sponsors || []) as any[]).forEach((es) => seen.add(es.sponsorId)));
    return Array.from(seen)
      .map((id) => ({
        value: id,
        label: sponsorById.get(id)?.name || "Patrocinador removido",
        dotColor: (sponsorById.get(id) as any)?.color || "#78716c",
        count: counts.get(id) || 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [events, sponsorById, matchesSearch, matchesDates, matchesFoco, matchesPriority, matchesVisibility]);

  // Contagens dos chips de foco (calculadas sem o próprio foco aplicado).
  const focoCounts = useMemo(() => {
    const base = events.filter((e) => matchesSearch(e) && matchesDates(e) && matchesPriority(e) && matchesSponsor(e) && matchesVisibility(e));
    let atrasado = 0, semPecas = 0, semPrioridade = 0;
    base.forEach((e) => {
      const stats = readEventStats(e);
      if (e.nextMilestone?.state === 'overdue') atrasado += 1;
      const arquivado = ARCHIVED_LIFECYCLES.has(stats.lifecycle);
      if (stats.activeItemCount === 0 && !arquivado) semPecas += 1;
      if (!e.priority && !arquivado) semPrioridade += 1;
    });
    return { atrasado, semPecas, semPrioridade };
  }, [events, matchesSearch, matchesDates, matchesPriority, matchesSponsor, matchesVisibility]);

  // Opções de mês (com ANO) derivadas dos eventos existentes, em ordem cronológica.
  const monthOptions = useMemo(() => {
    const keys = new Set<string>();
    events.forEach((e) => {
      if (!e.truckDepartureDate) return;
      const d = toUTCDisplayDate(e.truckDepartureDate);
      keys.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(keys).sort().map((key) => {
      const [y, m] = key.split("-");
      return { value: key, label: `${MONTH_NAMES[Number(m) - 1]}/${y}`, pinned: true };
    });
  }, [events]);

  // Filtros ativos como CHIPS removíveis — usados no empty state por filtro,
  // onde "Limpar filtros" era tudo-ou-nada.
  const activeFilterChips = useMemo(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (searchTerm) chips.push({ key: 'busca', label: `Busca: "${searchTerm}"`, clear: () => { setSearchInput(""); setSearchTerm(""); } });
    selectedPriorities.forEach((p) => {
      const opt = priorityFilterOptions.find((o) => o.value === p);
      chips.push({ key: `prio-${p}`, label: opt?.label || p, clear: () => setSelectedPriorities((prev) => prev.filter((x) => x !== p)) });
    });
    selectedSponsorFilter.forEach((sid) => {
      chips.push({ key: `sp-${sid}`, label: sponsorById.get(sid)?.name || 'Patrocinador', clear: () => setSelectedSponsorFilter((prev) => prev.filter((x) => x !== sid)) });
    });
    if (monthFilter !== "all") {
      const opt = monthOptions.find((o) => o.value === monthFilter);
      chips.push({ key: 'mes', label: opt?.label || monthFilter, clear: () => setMonthFilter("all") });
    }
    if (next10DaysFilter) chips.push({ key: 'proximos', label: 'Próximos 10 dias', clear: () => setNext10DaysFilter(false) });
    if (foco === 'atrasado') chips.push({ key: 'foco', label: 'Marco atrasado', clear: () => setFoco("") });
    if (foco === 'sem_pecas') chips.push({ key: 'foco', label: 'Sem peças', clear: () => setFoco("") });
    if (!showCompleted && !explicitLifecycleFilter) chips.push({ key: 'concluidos', label: 'Concluídos e encerrados ocultos', clear: () => setShowCompleted(true) });
    return chips;
  }, [searchTerm, selectedPriorities, selectedSponsorFilter, monthFilter, next10DaysFilter, foco, showCompleted, explicitLifecycleFilter, priorityFilterOptions, monthOptions, sponsorById]);

  const hasActiveFilters = searchTerm !== "" || selectedPriorities.length > 0 || selectedSponsorFilter.length > 0
    || monthFilter !== "all" || next10DaysFilter || foco !== "";

  // ── Exclusão: dimensão real do estrago ────────────────────────────────────
  const deletingEvent = deletingEventId ? events.find((e: any) => e.id === deletingEventId) : null;
  const deletingStats = deletingEvent ? readEventStats(deletingEvent) : null;
  // Peça entregue ou em produção = trabalho pago e material físico envolvido.
  // Nesses casos a confirmação exige digitar o nome do evento.
  const deleteNeedsTyping = !!deletingStats && (deletingStats.deliveredCount > 0 || deletingStats.inProductionCount > 0);
  const deleteConfirmed = !deleteNeedsTyping
    || deleteConfirmText.trim().toLowerCase() === (deletingEvent?.name || "").trim().toLowerCase();

  // ── Encerramento: dimensão real do que sai de vista ───────────────────────
  const closingEvent = closingEventId ? events.find((e: any) => e.id === closingEventId) : null;
  const closingStats = closingEvent ? readEventStats(closingEvent) : null;
  const reopeningEvent = reopeningEventId ? events.find((e: any) => e.id === reopeningEventId) : null;
  const reopeningStats = reopeningEvent ? readEventStats(reopeningEvent) : null;

  // ── Prazos: conversão offset ↔ data ───────────────────────────────────────
  const truckDateOnly = formData.truckDepartureDate ? formData.truckDepartureDate.slice(0, 10) : "";
  const offsetToDateStr = (days: number, allDays = false): string => {
    if (!truckDateOnly) return "";
    const d = new Date(truckDateOnly + "T12:00:00");
    d.setDate(d.getDate() + days);
    if (!allDays) {
      const dow = d.getDay();
      if (dow === 6) d.setDate(d.getDate() - 1); // sábado → sexta
      else if (dow === 0) d.setDate(d.getDate() + 1); // domingo → segunda
    }
    return toDateStr(d);
  };
  const dateStrToOffset = (dateStr: string): number => {
    if (!truckDateOnly || !dateStr) return 0;
    const base = new Date(truckDateOnly + "T12:00:00");
    const target = new Date(dateStr + "T12:00:00");
    return Math.round((target.getTime() - base.getTime()) / 86400000);
  };
  // "-25" → "25 dias antes" (em vez do críptico "-25d").
  const fmtOffset = (d: number): string =>
    d === 0 ? 'no dia' : d < 0 ? `${-d} dia${-d > 1 ? 's' : ''} antes` : `${d} dia${d > 1 ? 's' : ''} depois`;
  const noStart = !truckDateOnly;

  const submitPending = createEventMutation.isPending || updateEventMutation.isPending;

  return (
    <div style={{ backgroundColor: '#fafaf9', height: '100%', overflowY: 'auto', padding: isMobile ? '12px' : '32px', display: 'flex', flexDirection: 'column', gap: isMobile ? '14px' : '20px' }}>

      {/* ── HEADER ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <h1
              data-testid="title-eventos"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em', fontSize: FS.h1, fontWeight: '700', color: T.dark, margin: 0, lineHeight: 1.1 }}
            >
              Eventos
            </h1>
            {/* No lugar do subtítulo genérico ("Gerencie todos os eventos de
                produção gráfica", que não informava nada): três atalhos que
                também filtram, com contagem calculada sobre os demais filtros.
                "Saem esta semana" ficou de fora de propósito — duplicaria o
                toggle "Próximos 10 dias" que já existe na barra. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 0 0' }}>
              {[
                { key: 'atrasado', label: 'Marco atrasado', count: focoCounts.atrasado, tone: { text: '#b91c1c', bg: '#fef2f2', border: '#fecaca' }, active: foco === 'atrasado', toggle: () => setFoco(foco === 'atrasado' ? '' : 'atrasado') },
                { key: 'sem_prioridade', label: 'Sem prioridade', count: focoCounts.semPrioridade, tone: { text: '#57534e', bg: T.low, border: '#e7e5e4' }, active: selectedPriorities.length === 1 && selectedPriorities[0] === 'sem_prioridade', toggle: () => setSelectedPriorities((prev) => (prev.length === 1 && prev[0] === 'sem_prioridade') ? [] : ['sem_prioridade']) },
                { key: 'sem_pecas', label: 'Sem peças', count: focoCounts.semPecas, tone: { text: '#b45309', bg: '#fffbeb', border: '#fde68a' }, active: foco === 'sem_pecas', toggle: () => setFoco(foco === 'sem_pecas' ? '' : 'sem_pecas') },
              ].map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.toggle}
                  aria-pressed={chip.active}
                  disabled={chip.count === 0 && !chip.active}
                  data-testid={`chip-foco-${chip.key}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 11px', borderRadius: R.pill,
                    fontSize: FS.small, fontWeight: '700',
                    cursor: chip.count === 0 && !chip.active ? 'default' : 'pointer',
                    opacity: chip.count === 0 && !chip.active ? 0.45 : 1,
                    border: `1px solid ${chip.active ? '#1c1917' : chip.tone.border}`,
                    backgroundColor: chip.active ? T.dark : chip.tone.bg,
                    color: chip.active ? '#ffffff' : chip.tone.text,
                    transition: 'all 0.15s',
                  }}
                >
                  {chip.label}
                  <span style={{ fontWeight: '800' }}>{chip.count}</span>
                </button>
              ))}
            </div>
          </div>
          {canCreate && (
            <Button
              data-testid="button-create-event"
              onClick={() => {
                setEditingEvent(null);
                setDuplicateSource(null);
                const empty = resetForm();
                setBaselineSig(formSignature(empty, [], {}));
                setSponsorsError(false);
                setSponsorsLoading(false);
                setPrazosExpanded(false);
                setOpen(true);
              }}
              style={{ flexShrink: 0, backgroundColor: T.accentText, color: '#ffffff', border: 'none', borderRadius: R.md, fontWeight: '700', fontSize: FS.body, padding: '0 18px', height: '34px', gap: '7px', boxShadow: '0 2px 8px rgba(249,115,22,0.28)', display: 'flex', alignItems: 'center' }}
            >
              <Plus style={{ width: '14px', height: '14px' }} />
              Novo Evento
            </Button>
          )}
        </div>

        {/* ── MODAL CRIAR / EDITAR / DUPLICAR (Dialog 100% controlado) ── */}
        <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) requestCloseDialog(); else setOpen(true); }}>
          <DialogContent
            className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`}
            style={{
              ...modalSurface(720),
              maxHeight: 'calc(100dvh - 48px)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Enquanto o modal SAI, o miolo para de renderizar. É a correção
                do React #185 ao salvar — o mecanismo do laço está escrito por
                extenso em components/modal-shell.tsx. Resumo: cada render da
                página desanexa e reanexa a ref de toda primitiva Radix aqui
                dentro, e fazer isso com a subárvore em desmontagem estoura o
                contador de updates aninhados do React. Cancelar fazia UM
                render; salvar faz quatro (isPending, useToast, timer do toast,
                refetch do invalidateQueries) dentro dos ~200ms da animação de
                saída. */}
            <FreezeWhileClosing open={open}>
            <DialogTitle className="sr-only">
              {modalMode === 'edit' ? 'Editar evento' : modalMode === 'duplicate' ? 'Duplicar evento' : 'Novo evento'}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Nome, prioridade, datas, prazos dos 5 marcos e patrocinadores do evento.
            </DialogDescription>
            <ModalHeader
              icon={CalendarPlus}
              variant="work"
              tint="#c2410c"
              title={modalMode === 'edit' ? 'Editar Evento' : modalMode === 'duplicate' ? 'Duplicar Evento' : 'Novo Evento'}
              subtitle={
                modalMode === 'edit'
                  ? 'Atualize as informações do evento.'
                  : modalMode === 'duplicate'
                    ? `Cópia de "${duplicateSource?.name}" — prazos, patrocinadores e cotas já vieram junto.`
                    : 'Preencha os detalhes do evento.'
              }
              onClose={requestCloseDialog}
            />

            <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

                {/* Nome + Prioridade */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(240px, 1fr) auto', gap: '16px', alignItems: 'end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                    <label htmlFor="event-name" style={{ fontSize: FS.micro, fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Nome do Evento
                    </label>
                    <input
                      id="event-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Circuito Estações — Etapa 2"
                      required
                      data-testid="input-event-name"
                      style={{ width: '100%', backgroundColor: T.border, border: 'none', borderRadius: R.md, padding: '12px 16px', fontSize: FS.strong, color: T.text, fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'box-shadow 0.15s, background-color 0.15s' }}
                    />
                  </div>
                  {/* Prioridade na CRIAÇÃO: o schema já a aceitava, mas o
                      formulário não tinha o campo — depois de salvar eram 4
                      interações extras para achar o card e definir o nível.
                      Resultado: "Sem prioridade" era o badge mais comum da
                      grade, esvaziando o filtro e a ordenação. */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <span style={{ fontSize: FS.micro, fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Prioridade
                    </span>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {[{ value: '', label: 'Sem', dot: '#d6d3d1', text: '#57534e', bg: T.low, border: '#e7e5e4' },
                        ...(['baixa', 'media', 'alta', 'urgente'] as const).map((k) => ({
                          value: k, label: PRIORITY[k].label, dot: PRIORITY[k].dot, text: PRIORITY[k].text, bg: PRIORITY[k].bg, border: PRIORITY[k].border,
                        }))].map((opt) => {
                        const active = formData.priority === opt.value;
                        return (
                          <button
                            key={opt.value || 'none'}
                            type="button"
                            onClick={() => setFormData({ ...formData, priority: opt.value })}
                            aria-pressed={active}
                            data-testid={`form-priority-${opt.value || 'none'}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '5px',
                              height: 34, padding: '0 10px', borderRadius: R.md,
                              border: `1.5px solid ${active ? opt.dot : '#e7e5e4'}`,
                              backgroundColor: active ? opt.bg : '#ffffff',
                              color: active ? opt.text : '#57534e',
                              fontSize: FS.small, fontWeight: '700', cursor: 'pointer',
                              fontFamily: "'Plus Jakarta Sans', sans-serif",
                            }}
                          >
                            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: opt.dot, flexShrink: 0 }} />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Datas */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: FS.micro, fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Data de Início
                    </label>
                    <Popover open={openStartDate} onOpenChange={setOpenStartDate}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid="input-start-date"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, backgroundColor: openStartDate ? '#ffffff' : T.border, border: openStartDate ? '1px solid #f97316' : '1px solid transparent', borderRadius: R.md, padding: '0 12px', fontSize: FS.body, color: formData.startDate ? T.text : T.second, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', textAlign: 'left' as const, boxShadow: openStartDate ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s' }}
                        >
                          <Calendar style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
                          {formData.startDate ? fmtDateBR(formData.startDate) : <span style={{ color: T.second }}>Selecionar data</span>}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                        <CalendarUI
                          mode="single"
                          selected={parseDateStr(formData.startDate)}
                          onSelect={date => { if (date) { setFormData({ ...formData, startDate: toDateStr(date) }); setOpenStartDate(false); } }}
                          locale={ptBR}
                          classNames={{ day_selected: 'bg-[#f97316] text-white hover:bg-[#ea580c] hover:text-white focus:bg-[#f97316] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: FS.micro, fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Saída do Caminhão
                    </label>
                    <Popover open={openTruckDate} onOpenChange={setOpenTruckDate}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-testid="input-truck-date"
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, backgroundColor: openTruckDate ? '#ffffff' : T.border, border: openTruckDate ? '1px solid #f97316' : '1px solid transparent', borderRadius: R.md, padding: '0 12px', fontSize: FS.body, color: formData.truckDepartureDate ? T.text : T.second, fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', textAlign: 'left' as const, boxShadow: openTruckDate ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s' }}
                        >
                          <Truck style={{ width: 14, height: 14, color: T.muted, flexShrink: 0 }} />
                          {formData.truckDepartureDate
                            ? `${fmtDateBR(formData.truckDepartureDate.slice(0, 10))} às ${formData.truckDepartureDate.slice(11, 16)}`
                            : <span style={{ color: T.second }}>Selecionar data e hora</span>}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                        <CalendarUI
                          mode="single"
                          selected={parseDateStr(formData.truckDepartureDate?.slice(0, 10) || '')}
                          onSelect={date => {
                            if (date) {
                              const timePart = formData.truckDepartureDate?.slice(11, 16) || '08:00';
                              const firstFill = !formData.truckDepartureDate;
                              setFormData({ ...formData, truckDepartureDate: toDateStr(date) + 'T' + timePart });
                              // Abre os prazos só no PRIMEIRO preenchimento —
                              // antes reabria a cada correção de data, mesmo
                              // depois de o usuário ter recolhido a seção.
                              if (firstFill) setPrazosExpanded(true);
                            }
                          }}
                          locale={ptBR}
                          classNames={{ day_selected: 'bg-[#f97316] text-white hover:bg-[#ea580c] hover:text-white focus:bg-[#f97316] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
                        />
                        <div style={{ borderTop: '1px solid #f0efee', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Clock style={{ width: 12, height: 12, color: T.muted, flexShrink: 0 }} />
                          <label htmlFor="truck-time" style={{ fontSize: FS.small, color: T.second, fontWeight: 600, flexShrink: 0 }}>Horário:</label>
                          <input
                            id="truck-time"
                            type="text"
                            inputMode="numeric"
                            placeholder="HH:MM"
                            maxLength={5}
                            data-testid="input-truck-time"
                            value={formData.truckDepartureDate?.slice(11, 16) || ''}
                            onChange={e => {
                              let v = e.target.value.replace(/[^\d:]/g, '');
                              if (v.length === 2 && !v.includes(':')) v = v + ':';
                              if (v.length > 5) return;
                              const datePart = formData.truckDepartureDate?.slice(0, 10) || '';
                              if (!datePart) return;
                              if (/^\d{2}:\d{2}$/.test(v)) {
                                const [hh, mm] = v.split(':').map(Number);
                                const h = String(Math.min(23, hh)).padStart(2, '0');
                                const mi = String(Math.min(59, mm)).padStart(2, '0');
                                setFormData({ ...formData, truckDepartureDate: `${datePart}T${h}:${mi}` });
                              } else {
                                setFormData({ ...formData, truckDepartureDate: `${datePart}T${v}` });
                              }
                            }}
                            onBlur={e => {
                              const datePart = formData.truckDepartureDate?.slice(0, 10) || '';
                              if (!datePart) return;
                              const match = e.target.value.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
                              if (match) {
                                const h = String(Math.min(23, parseInt(match[1] || '0', 10))).padStart(2, '0');
                                const mi = String(Math.min(59, parseInt(match[2] || '0', 10))).padStart(2, '0');
                                setFormData({ ...formData, truckDepartureDate: `${datePart}T${h}:${mi}` });
                                return;
                              }
                              // Valor irrecuperável (":" sozinho, vazio): volta
                              // para 08:00 em vez de deixar "…T:" navegar até
                              // o insert do banco.
                              setFormData({ ...formData, truckDepartureDate: `${datePart}T08:00` });
                            }}
                            /* Sem onFocus inline: o anel vinha do handler e
                               nunca era removido no blur, deixando o campo
                               permanentemente com cara de ativo. O
                               :focus-visible global (index.css) já cuida. */
                            style={{ width: 68, height: 34, textAlign: 'center', border: '1px solid #e7e5e4', borderRadius: R.sm, fontSize: FS.strong, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.05em' }}
                          />
                          <button
                            type="button"
                            onClick={() => setOpenTruckDate(false)}
                            style={{ marginLeft: 'auto', height: 34, padding: '0 14px', borderRadius: R.sm, border: 'none', background: T.accentText, color: '#ffffff', fontSize: FS.small, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                          >
                            Ok
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {(() => {
                      const s = formData.startDate;
                      const t = formData.truckDepartureDate?.substring(0, 10);
                      if (s && t && t >= s) {
                        return <p style={{ margin: 0, fontSize: FS.small, color: '#dc2626', fontWeight: 600 }}>Deve ser pelo menos 1 dia antes do início do evento.</p>;
                      }
                      return null;
                    })()}
                  </div>
                </div>

                {/* Prazos colapsável */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  <button
                    type="button"
                    onClick={() => setPrazosExpanded(!prazosExpanded)}
                    data-testid="button-toggle-prazos"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', backgroundColor: '#f0efee', border: 'none', borderRadius: prazosExpanded ? `${R.md}px ${R.md}px 0 0` : R.md, padding: '10px 14px', cursor: 'pointer', transition: 'background-color 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e8e7e6'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0efee'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                      <Clock style={{ width: '13px', height: '13px', color: '#f97316', flexShrink: 0 }} />
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: FS.micro, fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Prazos</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            {/* A ÚNICA explicação de por que a data escolhida
                                diverge da exibida vivia num <span> sem
                                tabIndex — inalcançável por teclado, já que
                                Radix abre em hover/focus. Aqui ele é focável
                                (tabIndex=0 + role/aria-label), mas NÃO é um
                                <button>: este bloco já está DENTRO do botão que
                                expande os prazos, e <button> dentro de <button>
                                é aninhamento inválido (o React reclama em
                                validateDOMNesting e o alvo de clique fica
                                ambíguo). */}
                            <span
                              role="button"
                              tabIndex={0}
                              aria-label="Como funciona o ajuste de fim de semana"
                              onClick={e => { e.stopPropagation(); e.preventDefault(); }}
                              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                              style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 'none', padding: 2, cursor: 'help' }}
                            >
                              <HelpCircle style={{ width: '12px', height: '12px', color: '#78716c' }} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" style={{ maxWidth: '240px', fontSize: FS.body, lineHeight: '1.5' }}>
                            Prazos que caírem no <strong>sábado</strong> são antecipados para <strong>sexta-feira</strong>. Os que caírem no <strong>domingo</strong> são adiados para <strong>segunda-feira</strong>. Exceção: Produção Gráfica funciona todos os dias.
                          </TooltipContent>
                        </Tooltip>
                      </span>
                      {customDeadlineCount > 0 && (
                        <span style={{ fontSize: FS.micro, fontWeight: '700', color: T.accentText, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: R.pill, padding: '1px 8px', whiteSpace: 'nowrap' }}>
                          {customDeadlineCount} personalizado{customDeadlineCount > 1 ? 's' : ''}
                        </span>
                      )}
                      <span style={{ fontSize: FS.micro, color: T.second, fontWeight: '400' }}>{noStart ? 'preencha a saída do caminhão primeiro' : 'relativo à saída do caminhão'}</span>
                    </div>
                    {prazosExpanded
                      ? <ChevronUp style={{ width: '14px', height: '14px', color: T.second, flexShrink: 0 }} />
                      : <ChevronDown style={{ width: '14px', height: '14px', color: T.second, flexShrink: 0 }} />
                    }
                  </button>
                  {prazosExpanded && (
                    <div style={{ backgroundColor: '#f0efee', borderRadius: `0 0 ${R.md}px ${R.md}px`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                      {MARCO_FIELDS.map(({ field, key, label, desc, color, allDays }, idx) => {
                        const currentDays = Number(formData[field]);
                        const dateVal = offsetToDateStr(currentDays, allDays);
                        // Detecta se o ajuste de fim de semana moveu a data.
                        const rawVal = offsetToDateStr(currentDays, true);
                        const weekendAdjusted = !allDays && !!dateVal && rawVal !== dateVal;
                        const rawDate = rawVal ? parseDateStr(rawVal) : undefined;
                        const outOfOrder = orderIssues[idx];
                        return (
                          <div
                            key={field}
                            style={{
                              display: 'flex',
                              flexDirection: isMobile ? 'column' : 'row',
                              alignItems: isMobile ? 'stretch' : 'center',
                              justifyContent: 'space-between',
                              gap: isMobile ? '6px' : '12px',
                              padding: outOfOrder ? '8px 10px' : 0,
                              border: outOfOrder ? '1px solid #fbbf24' : '1px solid transparent',
                              backgroundColor: outOfOrder ? '#fffbeb' : 'transparent',
                              borderRadius: R.sm,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: FS.body, fontWeight: '600', color: T.text, lineHeight: 1.2 }}>{label}</div>
                                <div style={{ fontSize: FS.micro, color: T.second, lineHeight: 1.2, marginTop: '1px' }}>{desc}</div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'flex-start' : 'flex-end', gap: '2px', flexShrink: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                <Popover open={openPrazoKey === key} onOpenChange={o => setOpenPrazoKey(o ? key : null)}>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      data-testid={`input-${field}`}
                                      disabled={noStart}
                                      style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: R.sm, border: openPrazoKey === key ? '1px solid #f97316' : '1px solid transparent', backgroundColor: noStart ? '#f0efee' : (openPrazoKey === key ? '#ffffff' : T.border), fontSize: FS.body, fontWeight: '600', color: noStart ? '#78716c' : (dateVal ? T.text : T.second), cursor: noStart ? 'not-allowed' : 'pointer', boxShadow: openPrazoKey === key ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap' as const }}
                                    >
                                      <Calendar style={{ width: 11, height: 11, color: noStart ? '#c4bfbb' : T.muted, flexShrink: 0 }} />
                                      {dateVal ? fmtDateBR(dateVal) : (noStart ? '—' : 'Selecionar')}
                                    </button>
                                  </PopoverTrigger>
                                  {!noStart && (
                                    <PopoverContent className="w-auto p-0" align={isMobile ? 'start' : 'end'} style={{ zIndex: 9999 }}>
                                      <CalendarUI
                                        mode="single"
                                        selected={parseDateStr(dateVal)}
                                        disabled={d => !!(truckDateOnly && toDateStr(d) > truckDateOnly)}
                                        onSelect={date => {
                                          if (date) {
                                            setFormData({ ...formData, [field]: dateStrToOffset(toDateStr(date)) });
                                            setOpenPrazoKey(null);
                                          }
                                        }}
                                        locale={ptBR}
                                        classNames={{ day_selected: 'bg-[#f97316] text-white hover:bg-[#ea580c] hover:text-white focus:bg-[#f97316] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
                                      />
                                    </PopoverContent>
                                  )}
                                </Popover>
                                {!noStart && dateVal && (
                                  <span style={{ fontSize: FS.micro, color: T.second, fontWeight: '500', whiteSpace: 'nowrap' as const }}>{fmtOffset(currentDays)}</span>
                                )}
                              </div>
                              {weekendAdjusted && rawDate && (
                                <span style={{ fontSize: FS.micro, color: T.second }}>
                                  Cairia {rawDate.getDay() === 6 ? 'no sábado — antecipado para sexta' : 'no domingo — adiado para segunda'} ({fmtDateBR(dateVal)})
                                </span>
                              )}
                              {outOfOrder && (
                                <span style={{ fontSize: FS.micro, color: '#b45309', fontWeight: '700' }}>
                                  Deve vir depois de {MARCO_FIELDS[idx - 1].label} — confira a ordem
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '8px' }}>
                        <button
                          type="button"
                          disabled={customDeadlineCount === 0}
                          onClick={() => setFormData({ ...formData, ...DEFAULT_DEADLINES })}
                          data-testid="button-restore-default-deadlines"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            background: 'transparent', border: 'none', padding: '4px 6px',
                            fontSize: FS.small, fontWeight: '700',
                            // T.second e não T.muted (#a8a29e): a paleta reserva
                            // o cinza claro a elementos decorativos — ele nunca
                            // é cor de TEXTO, nem em estado desabilitado.
                            color: customDeadlineCount === 0 ? T.second : T.accentText,
                            cursor: customDeadlineCount === 0 ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                          }}
                        >
                          <RotateCcw style={{ width: 12, height: 12 }} />
                          Restaurar padrão ({DEFAULT_OFFSETS_LABEL})
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Patrocinadores */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: FS.micro, fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 style={{ width: '12px', height: '12px', color: '#f97316' }} />
                    Patrocinadores
                    <span style={{ color: T.second, fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                    {selectedSponsorIds.length > 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: '700', color: T.accentText, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: R.pill, padding: '1px 8px', letterSpacing: 0, textTransform: 'none' }}>
                        {selectedSponsorIds.length} selecionado{selectedSponsorIds.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </label>

                  {(sponsorsQueryLoading || sponsorsLoading) ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#ffffff', border: '1px solid #f0efee', borderRadius: R.md, padding: '14px 16px' }} aria-busy="true" aria-label="Carregando patrocinadores">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse" style={{ height: '14px', borderRadius: '4px', backgroundColor: '#f5f5f4', width: `${88 - i * 9}%` }} />
                      ))}
                    </div>
                  ) : (sponsorsQueryError || sponsorsError) ? (
                    <div role="alert" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: R.md, padding: '12px 16px', fontSize: FS.body, fontWeight: '600', color: '#b45309', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <AlertTriangle style={{ width: '15px', height: '15px', flexShrink: 0, marginTop: '1px' }} />
                      <span style={{ flex: 1 }}>Não foi possível carregar os patrocinadores.</span>
                      {(editingEvent || duplicateSource) && sponsorsError && (
                        <button
                          type="button"
                          onClick={() => fetchEventSponsors((editingEvent || duplicateSource).id, !!editingEvent)}
                          data-testid="button-retry-sponsors"
                          style={{ flexShrink: 0, background: 'transparent', border: 'none', padding: 0, fontSize: FS.body, fontWeight: '700', color: '#b45309', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
                        >
                          Tentar novamente
                        </button>
                      )}
                    </div>
                  ) : sponsors.length === 0 ? (
                    <p style={{ fontSize: FS.body, color: '#57534e', backgroundColor: '#f0efee', borderRadius: R.md, padding: '12px 16px' }}>
                      Nenhum patrocinador cadastrado.{" "}
                      <Link href="/patrocinadores" style={{ color: T.accentText, fontWeight: '600' }}>Cadastre agora</Link>
                    </p>
                  ) : (
                    <div style={{ backgroundColor: '#f0efee', borderRadius: R.lg, overflow: 'hidden' }}>
                      <div style={{ padding: '10px 12px', borderBottom: '1px solid #e7e5e4', position: 'relative' }}>
                        <Search style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.muted, pointerEvents: 'none' }} />
                        <input
                          type="text"
                          placeholder="Buscar patrocinador..."
                          aria-label="Buscar patrocinador"
                          value={sponsorSearch}
                          onChange={e => setSponsorSearch(e.target.value)}
                          data-testid="input-sponsor-search"
                          style={{
                            width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                            backgroundColor: '#ffffff', border: 'none', borderRadius: R.sm,
                            fontSize: FS.body, color: T.text, boxSizing: 'border-box',
                          }}
                        />
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px 0' }}>
                        {(() => {
                          const q = sponsorSearch.toLowerCase();
                          // Selecionados FIXADOS no topo: numa lista alfabética
                          // dentro de 200px eles ficavam espalhados, e o único
                          // resumo era o contador. Com busca ativa, sumiam de
                          // vista sem indicação de que continuavam marcados.
                          const filtered = [...sponsors]
                            .filter(s => !q || s.name.toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q))
                            .sort((a, b) => {
                              const selA = selectedSponsorIds.includes(a.id) ? 0 : 1;
                              const selB = selectedSponsorIds.includes(b.id) ? 0 : 1;
                              if (selA !== selB) return selA - selB;
                              return (a.name || '').localeCompare(b.name || '', 'pt-BR');
                            });
                          const hiddenSelected = selectedSponsorIds.filter((id) => !filtered.some((s) => s.id === id)).length;
                          if (filtered.length === 0) return (
                            <p style={{ fontSize: FS.body, color: T.second, textAlign: 'center', padding: '16px 12px' }}>
                              Nenhum resultado para "{sponsorSearch}"
                              {hiddenSelected > 0 ? ` — ${hiddenSelected} selecionado${hiddenSelected > 1 ? 's' : ''} continua${hiddenSelected > 1 ? 'm' : ''} marcado${hiddenSelected > 1 ? 's' : ''}.` : ''}
                            </p>
                          );
                          return (
                            <>
                              {hiddenSelected > 0 && (
                                <p style={{ fontSize: FS.micro, color: T.accentText, fontWeight: 700, padding: '0 14px 8px' }}>
                                  +{hiddenSelected} selecionado{hiddenSelected > 1 ? 's' : ''} fora desta busca (continua{hiddenSelected > 1 ? 'm' : ''} marcado{hiddenSelected > 1 ? 's' : ''})
                                </p>
                              )}
                              {filtered.map((sponsor) => {
                                const isSelected = selectedSponsorIds.includes(sponsor.id);
                                const color = (sponsor as any).color || '#3b82f6';
                                const currentQuota = sponsorQuotaMap[sponsor.id] || '';
                                const quotaOpt = QUOTA_OPTIONS.find(q => q.value === currentQuota);
                                return (
                                  <div
                                    key={sponsor.id}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 10,
                                      padding: '9px 14px',
                                      borderBottom: '1px solid #f0efed',
                                      backgroundColor: isSelected ? '#fff8f2' : 'transparent',
                                      transition: 'background-color 0.12s',
                                      cursor: 'pointer',
                                    }}
                                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f4f2'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = isSelected ? '#fff8f2' : 'transparent'; }}
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedSponsorIds(prev => prev.filter(id => id !== sponsor.id));
                                        setSponsorQuotaMap(prev => { const n = { ...prev }; delete n[sponsor.id]; return n; });
                                      } else {
                                        setSelectedSponsorIds(prev => [...prev, sponsor.id]);
                                      }
                                    }}
                                  >
                                    <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}33` }} />

                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <span style={{ fontSize: FS.body, fontWeight: isSelected ? 700 : 500, color: T.text, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {sponsor.name}
                                      </span>
                                      {sponsor.company && (
                                        <span style={{ fontSize: FS.micro, color: T.second, display: 'block', lineHeight: 1.2 }}>{sponsor.company}</span>
                                      )}
                                    </div>

                                    {isSelected && (
                                      // <select> NATIVO, não o Select do Radix.
                                      //
                                      // O Radix aqui travava a tela inteira: ao
                                      // fechar o modal (Cancelar, X, Esc ou
                                      // depois de salvar), o trigger soltava a
                                      // ref, o Select voltava a se declarar
                                      // controle de formulário e remontava o
                                      // <select> escondido enquanto o Dialog
                                      // ainda estava saindo — os dois ficavam
                                      // montando e desmontando um ao outro até
                                      // React #185 ("Maximum update depth") e
                                      // "Erro de renderização" na tela toda.
                                      // Reproduzido no dev: com o patrocinador
                                      // desmarcado (sem este campo) o modal
                                      // fecha limpo; com ele, quebra sempre.
                                      //
                                      // Escolher cota é uma lista curta de
                                      // opção única — o nativo faz isso, é o
                                      // melhor no celular e não tem ciclo de
                                      // vida para conflitar com o modal.
                                      <div style={{ flexShrink: 0, position: 'relative', display: 'inline-flex', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                        <select
                                          value={currentQuota || '_none_'}
                                          onChange={e => {
                                            const val = e.target.value === '_none_' ? '' : e.target.value;
                                            setSponsorQuotaMap(prev => {
                                              const n = { ...prev };
                                              if (val) n[sponsor.id] = val; else delete n[sponsor.id];
                                              return n;
                                            });
                                          }}
                                          data-testid={`quota-select-${sponsor.id}`}
                                          aria-label={`Cota de ${sponsor.name}`}
                                          style={{
                                            appearance: 'none',
                                            WebkitAppearance: 'none',
                                            MozAppearance: 'none',
                                            fontSize: FS.small,
                                            fontWeight: 700,
                                            letterSpacing: '0.05em',
                                            textTransform: 'uppercase',
                                            borderRadius: R.pill,
                                            // Borda saturada + fundo tint 50 +
                                            // texto tom 700: o par auditado da
                                            // paleta. Antes o texto usava o hex
                                            // saturado sobre 9% dele mesmo — 4
                                            // das 6 cotas reprovavam AA em 11px.
                                            border: `1.5px solid ${quotaOpt ? quotaOpt.dot : '#d8d5d2'}`,
                                            backgroundColor: quotaOpt ? quotaOpt.bg : '#f0efee',
                                            color: quotaOpt ? quotaOpt.text : '#44403c',
                                            height: '28px',
                                            // Direita maior: a seta desenhada
                                            // ao lado ocupa esse espaço.
                                            padding: '0 26px 0 10px',
                                            minWidth: '96px',
                                            fontFamily: "'Plus Jakarta Sans', sans-serif",
                                            boxShadow: 'none',
                                            cursor: 'pointer',
                                          }}
                                        >
                                          <option value="_none_">Sem cota</option>
                                          {QUOTA_OPTIONS.map(q => (
                                            <option key={q.value} value={q.value}>{q.label}</option>
                                          ))}
                                        </select>
                                        <ChevronDown
                                          aria-hidden="true"
                                          style={{ position: 'absolute', right: 8, width: 12, height: 12, pointerEvents: 'none', color: quotaOpt ? quotaOpt.text : '#44403c' }}
                                        />
                                      </div>
                                    )}

                                    <Checkbox
                                      id={`sponsor-${sponsor.id}`}
                                      aria-label={sponsor.name}
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        if (checked) {
                                          setSelectedSponsorIds(prev => [...prev, sponsor.id]);
                                        } else {
                                          setSelectedSponsorIds(prev => prev.filter(id => id !== sponsor.id));
                                          setSponsorQuotaMap(prev => { const n = { ...prev }; delete n[sponsor.id]; return n; });
                                        }
                                      }}
                                      onClick={e => e.stopPropagation()}
                                      data-testid={`checkbox-sponsor-${sponsor.id}`}
                                      className="border-[#d4cfc9] bg-[#f0efee] data-[state=checked]:bg-[#fd761a] data-[state=checked]:border-[#fd761a] rounded-[4px] flex-shrink-0 h-[18px] w-[18px]"
                                    />
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Copiar peças — só na duplicação, e só quando há o que copiar */}
                {modalMode === 'duplicate' && readEventStats(duplicateSource).itemCount > 0 && (
                  <label
                    htmlFor="copy-items"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#f0efee', borderRadius: R.md, padding: '12px 14px', cursor: 'pointer' }}
                  >
                    <Checkbox
                      id="copy-items"
                      checked={copyItems}
                      onCheckedChange={(v) => setCopyItems(!!v)}
                      data-testid="checkbox-copy-items"
                      className="border-[#d4cfc9] bg-[#ffffff] data-[state=checked]:bg-[#fd761a] data-[state=checked]:border-[#fd761a] rounded-[4px] flex-shrink-0 h-[18px] w-[18px]"
                    />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: FS.body, fontWeight: 700, color: T.text }}>
                        Copiar também as {readEventStats(duplicateSource).itemCount} peças
                      </span>
                      <span style={{ display: 'block', fontSize: FS.micro, color: T.second, marginTop: 1 }}>
                        As peças entram como rascunho, sem arquivos nem aprovações.
                      </span>
                    </span>
                  </label>
                )}

              </div>

              <ModalFooter>
                <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                  <button
                    type="button"
                    onClick={requestCloseDialog}
                    style={{ fontSize: FS.body, fontWeight: '700', color: '#625d5b', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 16px', textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: R.sm, transition: 'background-color 0.15s, color 0.15s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = T.border; e.currentTarget.style.color = T.dark; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#625d5b'; }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitPending}
                    data-testid="button-submit-event"
                    style={{ backgroundColor: T.dark, color: '#ffffff', borderRadius: R.md, fontWeight: '700', fontSize: FS.body, padding: '10px 32px', textTransform: 'uppercase', letterSpacing: '0.04em', border: 'none', cursor: submitPending ? 'not-allowed' : 'pointer', opacity: submitPending ? 0.7 : 1, transition: 'filter 0.15s, transform 0.1s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    onMouseEnter={e => { if (!submitPending) e.currentTarget.style.backgroundColor = '#292524'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.dark; }}
                  >
                    {modalMode === 'edit'
                      ? (updateEventMutation.isPending ? "Salvando..." : "Salvar Alterações")
                      : modalMode === 'duplicate'
                        ? (createEventMutation.isPending ? "Duplicando..." : "Criar Cópia")
                        : (createEventMutation.isPending ? "Criando..." : "Salvar Evento")
                    }
                  </button>
                </div>
              </ModalFooter>
            </form>
            </FreezeWhileClosing>
          </DialogContent>
        </Dialog>

        {/* Descarte: regra ÚNICA para X, Esc e clique-fora. Antes o X do
            DialogContent chamava handleCloseDialog direto e apagava nome, duas
            datas, cinco marcos ajustados e a seleção de patrocinadores com
            cotas — enquanto Esc e clique-fora ficavam travados. O usuário
            aprendia que a tela era imprevisível. */}
        <AlertDialog open={confirmDiscardOpen} onOpenChange={(v) => { if (!v) setConfirmDiscardOpen(false); }}>
          <AlertDialogContent style={{ maxWidth: 420, borderRadius: R.xl, padding: 0, border: 'none', boxShadow: SHADOW.lg, overflow: 'hidden' }}>
            <div style={{ padding: '28px 28px 8px' }}>
              <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.title, fontWeight: '700', letterSpacing: '-0.02em', color: T.dark, margin: 0 }}>
                Descartar alterações?
              </AlertDialogTitle>
              <AlertDialogDescription style={{ fontSize: FS.body, color: T.second, lineHeight: 1.6, marginTop: 10 }}>
                O que você preencheu neste formulário será perdido — inclusive os prazos ajustados e os patrocinadores selecionados.
              </AlertDialogDescription>
            </div>
            <AlertDialogFooter style={{ padding: '16px 28px 28px', display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
              <AlertDialogCancel
                style={{ padding: '9px 20px', backgroundColor: 'transparent', border: '1px solid #e0c0b1', borderRadius: R.sm, fontSize: FS.body, fontWeight: '700', color: '#625d5b', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Continuar editando
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCloseDialog}
                data-testid="button-confirm-discard"
                style={{ padding: '9px 20px', backgroundColor: '#ba1a1a', border: 'none', borderRadius: R.sm, fontSize: FS.body, fontWeight: '700', color: '#ffffff', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Descartar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* ── FILTROS inline ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', paddingBottom: isMobile ? '10px' : '16px', borderBottom: '1px solid #e7e5e4' }}>

        <div style={{ position: 'relative', flexShrink: 0, width: isMobile ? '100%' : undefined }}>
          <Search style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: T.muted, width: '13px', height: '13px', pointerEvents: 'none' }} />
          <input
            ref={searchRef}
            placeholder="Buscar evento ou patrocinador..."
            aria-label="Buscar eventos por nome ou patrocinador"
            title="Atalho: pressione / para focar a busca"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="input-search-events"
            style={{ paddingLeft: '32px', paddingRight: '12px', height: '32px', width: isMobile ? '100%' : '230px', border: '1px solid #e7e5e4', borderRadius: R.pill, backgroundColor: '#ffffff', fontSize: FS.body, color: T.dark, fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#fd761a'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(253,118,26,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e7e5e4'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Divisor — só no desktop; no mobile a busca ocupa a linha inteira e o traço ficava órfão */}
        {!isMobile && (
          <div style={{ width: '1px', height: '20px', backgroundColor: '#e7e5e4', flexShrink: 0 }} />
        )}

        <FilterSelect
          label="Prioridade"
          allLabel="Todas as prioridades"
          values={selectedPriorities}
          onValuesChange={(v) => setSelectedPriorities(v)}
          options={priorityFilterOptions}
          testId="filter-priority"
        />

        <FilterSelect
          label="Patrocinador"
          allLabel="Todos os patrocinadores"
          values={selectedSponsorFilter}
          onValuesChange={setSelectedSponsorFilter}
          options={sponsorFilterOptions}
          searchPlaceholder="Buscar patrocinador..."
          testId="filter-sponsor"
        />

        <FilterSelect
          label="Mês"
          allLabel="Todos os meses"
          value={monthFilter}
          onChange={setMonthFilter}
          options={monthOptions}
          showAllLabelWhenEmpty
          testId="select-month-filter"
        />

        <button
          onClick={() => setNext10DaysFilter(!next10DaysFilter)}
          aria-pressed={next10DaysFilter}
          data-testid="button-next-10-days-filter"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 13px', borderRadius: R.pill,
            fontSize: FS.body, fontWeight: '700', cursor: 'pointer',
            border: 'none',
            backgroundColor: next10DaysFilter ? T.dark : '#e2e2e2',
            color: next10DaysFilter ? '#ffffff' : '#57534e',
            transition: 'all 0.15s',
          }}
        >
          <Truck style={{ width: '13px', height: '13px' }} />
          Próximos 10 dias
        </button>

        {/* "Ocultar concluídos" nasce ligado: a grade padrão mostra o que ainda
            tem trabalho. Esconde o concluído e o encerrado à mão; NUNCA esconde
            "Encerrado com pendências", que segue sendo cobrança. */}
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          aria-pressed={!showCompleted}
          disabled={explicitLifecycleFilter}
          title={explicitLifecycleFilter
            ? 'Desativado enquanto o filtro de prioridade pede eventos concluídos ou encerrados'
            : 'Esconde os eventos concluídos e os encerrados manualmente. "Encerrado com pendências" continua na grade.'}
          data-testid="button-toggle-completed"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '5px 13px', borderRadius: R.pill,
            fontSize: FS.body, fontWeight: '700',
            cursor: explicitLifecycleFilter ? 'default' : 'pointer',
            opacity: explicitLifecycleFilter ? 0.5 : 1,
            border: 'none',
            backgroundColor: !showCompleted ? T.dark : '#e2e2e2',
            color: !showCompleted ? '#ffffff' : '#57534e',
            transition: 'all 0.15s',
          }}
        >
          <CheckCircle style={{ width: '13px', height: '13px' }} />
          Ocultar concluídos
        </button>

        {hasActiveFilters && (
          <button onClick={clearAllEventFilters} data-testid="button-clear-filters"
            style={{ padding: '5px 10px', borderRadius: R.pill, fontSize: FS.small, cursor: 'pointer', border: 'none', backgroundColor: 'transparent', color: T.second }}>
            Limpar
          </button>
        )}

        {/* Contador de resultados — plural correto ("1 de 1 eventos" era o texto antigo). */}
        {!isLoading && !isError && (
          <span aria-live="polite" style={{ marginLeft: 'auto', fontSize: FS.small, color: T.second, flexShrink: 0 }}>
            {filteredEvents.length === events.length
              ? `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`
              : `${filteredEvents.length} de ${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`}
          </span>
        )}
      </div>

      {/* ── CONTEÚDO ── */}
      {isLoading ? (
        /* Skeleton com a silhueta dos cards reais (badge + título + datas +
           marco + barra de progresso) no lugar do spinner central — sem
           layout shift. */
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6" aria-busy="true" aria-label="Carregando eventos">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderLeft: '4px solid #e7e5e4', borderRadius: R.lg, padding: '20px 22px' }}>
              <div className="animate-pulse" style={{ width: 110, height: 22, borderRadius: R.pill, backgroundColor: '#f5f5f4', marginBottom: 14 }} />
              <div className="animate-pulse" style={{ width: '55%', height: 18, borderRadius: 4, backgroundColor: '#e7e5e4', marginBottom: 18 }} />
              <div style={{ display: 'flex', gap: 32, marginBottom: 14 }}>
                <div className="animate-pulse" style={{ width: 90, height: 12, borderRadius: 4, backgroundColor: '#f0efee' }} />
                <div className="animate-pulse" style={{ width: 110, height: 12, borderRadius: 4, backgroundColor: '#f0efee' }} />
              </div>
              <div className="animate-pulse" style={{ width: '65%', height: 12, borderRadius: 4, backgroundColor: '#f0efee', marginBottom: 18 }} />
              <div className="animate-pulse" style={{ width: '100%', height: 8, borderRadius: R.pill, backgroundColor: '#f0efee' }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        /* Sem este ramo, uma falha da API caía no "Nenhum evento criado" com
           botão de criar — mensagem enganosa que podia induzir a recriar
           eventos que já existem. */
        <div role="alert" style={{ backgroundColor: '#ffffff', border: '1px solid #fecaca', borderRadius: R.lg, padding: '72px 24px', textAlign: 'center' }}>
          <h3 style={{ color: '#b91c1c', fontSize: FS.title, fontWeight: '700', marginBottom: '6px' }}>Não foi possível carregar os eventos</h3>
          <p style={{ color: T.second, fontSize: FS.body, marginBottom: '20px' }}>Verifique sua conexão e tente novamente.</p>
          <button onClick={() => refetch()} style={{ fontSize: FS.body, fontWeight: 700, color: '#fff', background: T.dark, border: 'none', borderRadius: R.md, padding: '9px 20px', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      ) : events.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: R.lg, padding: '72px 24px', textAlign: 'center' }}>
          <Package style={{ width: '44px', height: '44px', color: '#d4d0cb', margin: '0 auto 16px' }} />
          <h3 style={{ color: T.dark, fontSize: FS.title, fontWeight: '700', marginBottom: '6px', fontFamily: "'Space Grotesk', sans-serif" }}>Nenhum evento criado</h3>
          {canCreate ? (
            <>
              <p style={{ color: T.second, fontSize: FS.body, marginBottom: '24px' }}>Comece criando seu primeiro evento de produção</p>
              <Button
                onClick={() => {
                  setEditingEvent(null);
                  setDuplicateSource(null);
                  const empty = resetForm();
                  setBaselineSig(formSignature(empty, [], {}));
                  // Fechar o modal não limpa mais nada (ver handleCloseDialog):
                  // quem abre é que inicializa. Sem estas três linhas, um erro
                  // ou um bloco de prazos aberto na sessão anterior reapareceria
                  // aqui.
                  setSponsorsError(false);
                  setSponsorsLoading(false);
                  setPrazosExpanded(false);
                  setOpen(true);
                }}
                style={{ backgroundColor: T.accentText, color: '#ffffff', borderRadius: R.md, fontWeight: '700', boxShadow: '0 4px 14px rgba(249,115,22,0.25)' }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Evento
              </Button>
            </>
          ) : (
            <p style={{ color: T.second, fontSize: FS.body, margin: 0 }}>Os eventos criados pela equipe aparecerão aqui</p>
          )}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: R.lg, padding: '56px 24px', textAlign: 'center' }}>
          <Search style={{ width: '40px', height: '40px', color: '#d4d0cb', margin: '0 auto 16px' }} />
          <h3 style={{ color: T.dark, fontSize: FS.title, fontWeight: '700', marginBottom: '6px', fontFamily: "'Space Grotesk', sans-serif" }}>Nenhum evento encontrado</h3>
          <p style={{ color: T.second, fontSize: FS.body, marginBottom: '16px' }}>Nenhum evento corresponde aos filtros ativos.</p>
          {/* Chips removíveis: "Limpar filtros" era tudo-ou-nada, e com
              prioridade + mês + próximos 10 dias combinados não dava para saber
              qual deles esvaziou a lista. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '20px' }}>
            {activeFilterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.clear}
                data-testid={`chip-remove-${chip.key}`}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: R.pill, fontSize: FS.small, fontWeight: '700', border: '1px solid #e7e5e4', backgroundColor: '#f5f5f4', color: '#44403c', cursor: 'pointer' }}
              >
                {chip.label}
                <X style={{ width: 11, height: 11 }} />
              </button>
            ))}
          </div>
          <button
            onClick={clearAllEventFilters}
            data-testid="button-clear-filters-empty"
            style={{ fontSize: FS.body, fontWeight: 700, color: '#fff', background: T.dark, border: 'none', borderRadius: R.md, padding: '9px 20px', cursor: 'pointer' }}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
            {visibleEvents.map((event) => {
              // O payload de eventos traz só o vínculo (sponsorId/quota) —
              // nome/cor vêm da lista global de patrocinadores.
              const cardSponsors = ((event.sponsors || []) as any[])
                .map((es) => sponsorById.get(es.sponsorId))
                .filter(Boolean) as Sponsor[];
              return (
                <EventCard
                  key={event.id}
                  event={event}
                  cardSponsors={cardSponsors}
                  isMobile={isMobile}
                  currentYear={currentYear}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  canDuplicate={canCreate && !isMobile}
                  canSetPriority={canSetPriority}
                  canClose={canClose}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onDuplicate={handleDuplicate}
                  onSetPriority={handleSetPriority}
                  onClose={handleClose}
                  onReopen={handleReopen}
                />
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={() => setVisibleCount(filteredEvents.length)}
              data-testid="button-show-all-events"
              style={{ alignSelf: 'center', fontSize: FS.body, fontWeight: 700, color: '#44403c', background: '#ffffff', border: '1px solid #e7e5e4', borderRadius: R.pill, padding: '9px 22px', cursor: 'pointer', boxShadow: SHADOW.sm }}
            >
              Mostrar todos os {filteredEvents.length} eventos (+{hiddenCount})
            </button>
          )}
        </>
      )}

      {/* ── EXCLUSÃO ── */}
      <AlertDialog open={!!deletingEventId} onOpenChange={(v) => { if (!v && !deleteEventMutation.isPending) { setDeletingEventId(null); setDeleteConfirmText(""); } }}>
        <AlertDialogContent style={{ maxWidth: "460px", backgroundColor: "#ffffff", borderRadius: R.xl, padding: "0", border: "none", boxShadow: SHADOW.lg, overflow: "hidden" }}>
          <div style={{ padding: "32px 32px 8px 32px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.title, fontWeight: "700", letterSpacing: "-0.02em", color: T.dark, margin: 0 }}>
              Excluir evento
            </AlertDialogTitle>

            {/* Confirmação PROPORCIONAL ao dano. "Todas as peças associadas"
                não fazia ninguém parar; "e 128 peças, 96 já entregues" faz. O
                cascade do banco leva junto fotos de entrega, comentários,
                aprovações de patrocinador e os vínculos do acervo. */}
            <div style={{ marginTop: "20px", padding: "16px", backgroundColor: "#fff7ed", borderLeft: "4px solid #f97316", borderRadius: `0 ${R.md}px ${R.md}px 0`, display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <AlertTriangle style={{ width: "18px", height: "18px", color: "#f97316", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: FS.body, fontWeight: "600", color: "#783200", margin: 0, lineHeight: 1.6 }}>
                {deletingStats && deletingStats.itemCount > 0 ? (
                  <>
                    Isto remove permanentemente{" "}
                    <strong>{deletingStats.itemCount} {deletingStats.itemCount === 1 ? 'peça' : 'peças'}</strong>
                    {deletingStats.deliveredCount > 0 ? ` (${deletingStats.deliveredCount} já ${deletingStats.deliveredCount === 1 ? 'entregue' : 'entregues'})` : ''}
                    {deletingStats.inProductionCount > 0 ? `, ${deletingStats.inProductionCount} em produção` : ''}
                    , além das fotos de entrega, comentários e aprovações de patrocinador. Peças do acervo geradas aqui ficam sem origem.
                  </>
                ) : (
                  <>Este evento não tem peças. Vínculos de patrocinador, regras de cota e notificações também serão removidos.</>
                )}
              </p>
            </div>

            <AlertDialogDescription style={{ fontSize: FS.strong, color: T.second, lineHeight: 1.6, marginTop: "16px" }}>
              Tem certeza que deseja excluir o evento{" "}
              <strong style={{ color: T.text, fontWeight: "600" }}>
                "{deletingEvent?.name || "este evento"}"
              </strong>
              ? Esta ação não pode ser desfeita.
            </AlertDialogDescription>

            {deleteNeedsTyping && (
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label htmlFor="delete-confirm" style={{ fontSize: FS.small, fontWeight: 700, color: '#57534e' }}>
                  Há trabalho entregue ou em produção. Digite <strong style={{ color: T.text }}>{deletingEvent?.name}</strong> para liberar a exclusão:
                </label>
                <input
                  id="delete-confirm"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  autoComplete="off"
                  data-testid="input-delete-confirm"
                  style={{ width: '100%', height: 38, border: '1px solid #e7e5e4', borderRadius: R.md, padding: '0 12px', fontSize: FS.body, fontFamily: 'inherit', color: T.text }}
                />
              </div>
            )}
          </div>

          <AlertDialogFooter style={{ padding: "16px 32px 32px 32px", display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              disabled={deleteEventMutation.isPending}
              style={{ padding: "9px 24px", backgroundColor: "transparent", border: "1px solid #e0c0b1", borderRadius: R.sm, fontSize: FS.body, fontWeight: "700", color: "#625d5b", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = T.low)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Sem o preventDefault o AlertDialog fecha antes de a mutação
                // responder e o toast com a contagem real se perde.
                if (!deleteConfirmed) { e.preventDefault(); return; }
                if (deletingEventId) deleteEventMutation.mutate(deletingEventId);
              }}
              disabled={deleteEventMutation.isPending || !deleteConfirmed}
              data-testid="button-confirm-delete-event"
              style={{ padding: "9px 24px", backgroundColor: "#ba1a1a", border: "none", borderRadius: R.sm, fontSize: FS.body, fontWeight: "700", color: "#ffffff", cursor: deleteEventMutation.isPending ? "wait" : !deleteConfirmed ? "not-allowed" : "pointer", opacity: deleteEventMutation.isPending || !deleteConfirmed ? 0.5 : 1, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "8px", transition: "filter 0.15s" }}
            >
              <Trash2 style={{ width: "14px", height: "14px" }} />
              {deleteEventMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── ENCERRAR ──
          A confirmação diz o NÚMERO real de peças em aberto e quantas estão em
          produção. "Ainda há peças pendentes" não faz ninguém parar; "12 peças
          pendentes, sendo 3 em produção" faz. E diz o que encerrar FAZ e o que
          NÃO faz — nenhuma peça muda de status, nada é apagado. */}
      <AlertDialog open={!!closingEventId} onOpenChange={(v) => { if (!v && !closeEventMutation.isPending) setClosingEventId(null); }}>
        <AlertDialogContent style={{ maxWidth: "460px", backgroundColor: "#ffffff", borderRadius: R.xl, padding: 0, border: "none", boxShadow: SHADOW.lg, overflow: "hidden" }}>
          <div style={{ padding: "32px 32px 8px 32px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.title, fontWeight: "700", letterSpacing: "-0.02em", color: T.dark, margin: 0 }}>
              Encerrar evento
            </AlertDialogTitle>

            {closingStats && closingStats.openCount > 0 && (
              <div style={{ marginTop: "20px", padding: "16px", backgroundColor: "#fffbeb", borderLeft: "4px solid #f59e0b", borderRadius: `0 ${R.md}px ${R.md}px 0`, display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <AlertTriangle style={{ width: "18px", height: "18px", color: "#b45309", flexShrink: 0, marginTop: "1px" }} />
                <p style={{ fontSize: FS.body, fontWeight: "600", color: "#783200", margin: 0, lineHeight: 1.6 }}>
                  Este evento tem{" "}
                  <strong>{closingStats.openCount} {closingStats.openCount === 1 ? 'peça pendente' : 'peças pendentes'}</strong>
                  {closingStats.inProductionCount > 0
                    ? <>, {closingStats.inProductionCount === 1 ? 'sendo 1 em produção' : `sendo ${closingStats.inProductionCount} em produção`}</>
                    : null}
                  . Elas <strong>não são canceladas nem entregues</strong> — continuam na lista do evento, mas param de ser cobradas na Gestão de Prazos e saem das filas de trabalho.
                </p>
              </div>
            )}

            <AlertDialogDescription style={{ fontSize: FS.strong, color: T.second, lineHeight: 1.6, marginTop: "16px" }}>
              Encerrar{" "}
              <strong style={{ color: T.text, fontWeight: "600" }}>"{closingEvent?.name || "este evento"}"</strong>
              {closingStats && closingStats.openCount === 0
                ? closingStats.activeItemCount > 0
                  ? <> — todas as {closingStats.activeItemCount} peças já estão entregues.</>
                  : <> — este evento não tem nenhuma peça.</>
                : '.'}
              {" "}Ele sai da Gestão de Prazos e das filas de trabalho, e segue visível no histórico, na consulta e no filtro "Concluídos". A ação fica registrada com seu nome e horário, e pode ser desfeita em <strong style={{ color: T.text, fontWeight: 600 }}>Reabrir evento</strong>.
            </AlertDialogDescription>
          </div>

          <AlertDialogFooter style={{ padding: "16px 32px 32px 32px", display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              disabled={closeEventMutation.isPending}
              style={{ padding: "9px 24px", backgroundColor: "transparent", border: "1px solid #e0c0b1", borderRadius: R.sm, fontSize: FS.body, fontWeight: "700", color: "#625d5b", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // preventDefault: sem ele o diálogo fecha antes de a mutação
                // responder e o toast com a contagem real se perde.
                e.preventDefault();
                if (closingEventId) closeEventMutation.mutate(closingEventId);
              }}
              disabled={closeEventMutation.isPending}
              data-testid="button-confirm-close-event"
              style={{ padding: "9px 24px", backgroundColor: "#57534e", border: "none", borderRadius: R.sm, fontSize: FS.body, fontWeight: "700", color: "#ffffff", cursor: closeEventMutation.isPending ? "wait" : "pointer", opacity: closeEventMutation.isPending ? 0.5 : 1, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Lock style={{ width: "14px", height: "14px" }} />
              {closeEventMutation.isPending ? "Encerrando..." : "Encerrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── REABRIR ── */}
      <AlertDialog open={!!reopeningEventId} onOpenChange={(v) => { if (!v && !reopenEventMutation.isPending) setReopeningEventId(null); }}>
        <AlertDialogContent style={{ maxWidth: "440px", backgroundColor: "#ffffff", borderRadius: R.xl, padding: 0, border: "none", boxShadow: SHADOW.lg, overflow: "hidden" }}>
          <div style={{ padding: "32px 32px 8px 32px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: FS.title, fontWeight: "700", letterSpacing: "-0.02em", color: T.dark, margin: 0 }}>
              Reabrir evento
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: FS.strong, color: T.second, lineHeight: 1.6, marginTop: "16px" }}>
              <strong style={{ color: T.text, fontWeight: "600" }}>"{reopeningEvent?.name || "Este evento"}"</strong>{" "}
              volta para a Gestão de Prazos e para as filas de trabalho
              {reopeningStats && reopeningStats.openCount > 0
                ? <> com <strong style={{ color: T.text, fontWeight: 600 }}>{reopeningStats.openCount} {reopeningStats.openCount === 1 ? 'peça em aberto' : 'peças em aberto'}</strong>{reopeningStats.inProductionCount > 0 ? ` (${reopeningStats.inProductionCount} em produção)` : ''}</>
                : null}
              . A partir daí os prazos voltam a ser cobrados normalmente. A reabertura fica registrada com seu nome e horário.
            </AlertDialogDescription>
          </div>

          <AlertDialogFooter style={{ padding: "16px 32px 32px 32px", display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              disabled={reopenEventMutation.isPending}
              style={{ padding: "9px 24px", backgroundColor: "transparent", border: "1px solid #e0c0b1", borderRadius: R.sm, fontSize: FS.body, fontWeight: "700", color: "#625d5b", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (reopeningEventId) reopenEventMutation.mutate(reopeningEventId);
              }}
              disabled={reopenEventMutation.isPending}
              data-testid="button-confirm-reopen-event"
              style={{ padding: "9px 24px", backgroundColor: "#15803d", border: "none", borderRadius: R.sm, fontSize: FS.body, fontWeight: "700", color: "#ffffff", cursor: reopenEventMutation.isPending ? "wait" : "pointer", opacity: reopenEventMutation.isPending ? 0.5 : 1, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "8px" }}
            >
              <Unlock style={{ width: "14px", height: "14px" }} />
              {reopenEventMutation.isPending ? "Reabrindo..." : "Reabrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── PRIORIDADE ── */}
      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className={`${HIDE_NATIVE_CLOSE} p-0 gap-0`} style={{ ...modalSurface(460) }}>
          {/* Mesma tríade do modal de edição: o onSuccess invalida, fecha e
              toasta de uma vez, e ainda zera `selectedEventForPriority` — o
              subtítulo ficava em branco durante a animação de saída. Congelar
              resolve as duas coisas. */}
          <FreezeWhileClosing open={priorityDialogOpen}>
          <DialogTitle className="sr-only">Definir prioridade</DialogTitle>
          <DialogDescription className="sr-only">Escolha o nível de prioridade do evento. Teclas 1 a 4 definem, 0 remove.</DialogDescription>
          <ModalHeader
            variant="confirm"
            icon={Flag}
            tint="#c2410c"
            title="Definir Prioridade"
            subtitle={selectedEventForPriority?.name}
            onClose={() => setPriorityDialogOpen(false)}
          />

          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {(['baixa', 'media', 'alta', 'urgente'] as const).map((key, i) => {
              // Cores derivadas de PRIORITY (lib/status) — antes havia um mapa hex local.
              const meta = PRIORITY[key];
              const isSelected = selectedEventForPriority?.priority === key;
              const isPending = updatePriorityMutation.isPending;
              return (
                <button
                  key={key}
                  onClick={() => handlePrioritySelect(key)}
                  disabled={isPending}
                  aria-pressed={isSelected}
                  style={{
                    height: '72px',
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '0 16px',
                    borderRadius: R.lg,
                    border: isSelected ? `2px solid ${meta.dot}` : '2px solid #e7e5e4',
                    backgroundColor: isSelected ? meta.bg : '#ffffff',
                    cursor: isPending ? 'wait' : 'pointer',
                    opacity: isPending ? 0.5 : 1,
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected && !isPending) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = meta.dot;
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = meta.bg;
                      (e.currentTarget.querySelector('.prio-label') as HTMLElement).style.color = meta.text;
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#e7e5e4';
                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#ffffff';
                      (e.currentTarget.querySelector('.prio-label') as HTMLElement).style.color = '#44403c';
                    }
                  }}
                  data-testid={`button-priority-${key}`}
                >
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: meta.dot, flexShrink: 0 }} />
                  <span className="prio-label" style={{ fontWeight: '700', fontSize: FS.body, color: isSelected ? meta.text : '#44403c', transition: 'color 0.15s' }}>
                    {meta.label}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: FS.micro, fontWeight: 700, color: T.second, border: '1px solid #e7e5e4', borderRadius: 4, padding: '1px 5px' }}>
                    {i + 1}
                  </span>
                </button>
              );
            })}
          </div>

          <div style={{ backgroundColor: T.low, borderTop: '1px solid #e7e5e4', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            {/* Caminho de volta: sem isto, prioridade definida era para sempre. */}
            {selectedEventForPriority?.priority ? (
              <button
                onClick={() => handlePrioritySelect("")}
                disabled={updatePriorityMutation.isPending}
                data-testid="button-remove-priority"
                style={{ fontSize: FS.small, fontWeight: '700', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                Remover prioridade (0)
              </button>
            ) : <span style={{ fontSize: FS.small, color: T.second }}>Teclas 1–4 definem · 0 remove</span>}
            <button
              onClick={() => setPriorityDialogOpen(false)}
              style={{ fontSize: FS.small, fontWeight: '700', color: T.second, background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = T.dark)}
              onMouseLeave={e => (e.currentTarget.style.color = T.second)}
            >
              Cancelar
            </button>
          </div>
          </FreezeWhileClosing>
        </DialogContent>
      </Dialog>
    </div>
  );
}
