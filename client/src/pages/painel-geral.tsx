import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef, Fragment, useEffect, useCallback } from "react";
import {
  Search, Calendar, Truck, Eye, Paperclip, Trash2, FileText, Printer, RotateCcw,
  Loader2, MessageSquare, ArrowUpRight, ChevronDown, ChevronUp, Copy, FileSpreadsheet,
  SlidersHorizontal, Link2, Check, Lock, Pin,
} from "lucide-react";
import { Link } from "wouter";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { compareDisplayId } from "@/lib/displayId";
import { FilterSelect } from "@/components/filter-select";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import {
  ComplementoDaFicha,
  temBlocoDeComplemento,
} from "@/components/aumentar-quantidade-dialog";
import { SponsorChips } from "@/components/sponsor-chips";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile, useElementSize, densityFromWidth, type ContentDensity } from "@/hooks/use-mobile";
import { getStatusMeta, getStatusLabel, getApprovalMeta, motivoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import { StatusPill } from "@/components/status-pill";
import type { Event, Sponsor, StandardItem } from "@shared/schema";
import {
  STATUS_GROUPS, GROUP_KEYS, computeStats, matchesStatusFilter,
  statusFlowIndex, type GroupKey,
} from "@/lib/painel-kpis";
import {
  computeDeadlineChip, dayDiff, isPendingItemStatus, type PrazoChip,
} from "@/lib/painel-prazo";
import {
  seloEventoFinalizado, chipOcultas, buscaEhCodigoDaPeca,
  CONTAGEM_OCULTAS_ZERO, type SeloEventoFinalizado, type ContagemOcultas,
} from "@/lib/painel-encerrados";
import { formatFrescor } from "@/lib/painel-frescor";
import { proximaTelaDoStatus } from "@/lib/painel-rotas";
import {
  visoesParaPapel, visaoEstaAtiva, chaveVisaoPadrao, type Visao,
} from "@/lib/painel-visoes";

// ─── Constantes de módulo — não dependem de estado; hoisted para não serem
// realocadas a cada render. ─────────────────────────────────────────────────

// Faixas do filtro de data (diff em dias até a saída do caminhão).
const DATE_RANGE_MAP: Record<string, (diff: number) => boolean> = {
  today: d => d === 0, next3days: d => d >= 0 && d <= 3, next7days: d => d >= 0 && d <= 7,
  next10days: d => d >= 0 && d <= 10, next15days: d => d >= 0 && d <= 15,
  next30days: d => d >= 0 && d <= 30, overdue: d => d < 0,
};

// Rótulos do filtro de data — fonte única para o dropdown e os chips ativos.
const DATE_FILTER_LABELS: Record<string, string> = {
  overdue: "Caminhão já saiu", today: "Sai hoje",
  next3days: "Sai em até 3 dias", next7days: "Sai em até 7 dias",
  next10days: "Sai em até 10 dias", next15days: "Sai em até 15 dias",
  next30days: "Sai em até 30 dias", no_departure: "Sem data de saída",
};
const DATE_FILTER_VALUES = Object.keys(DATE_FILTER_LABELS);

// ─── Filtro de FOCO — os três recortes que a operação pede sem parar ────────
// Não são status nem datas: são cruzamentos (reprovação de patrocinador,
// caminhão que já saiu com peça pendente, "esconde o que já acabou"). Vivem
// numa dimensão própria para poderem ser combinados com qualquer status.
const FOCO_LABELS: Record<string, string> = {
  reprovadas: "Reprovadas pelo patrocinador",
  atrasadas: "Em evento com caminhão atrasado",
  pendentes: "Só pendências",
};

// Opções do dropdown de status, na ordem do fluxo (rótulos via getStatusLabel).
// `draft` entrou com opção PRÓPRIA: o card "Solicitado" anuncia "inclui N
// rascunhos" e não existia caminho nenhum para ver só eles — a tela fazia a
// pergunta e não dava a resposta.
const STATUS_FILTER_VALUES = [
  "requested", "draft", "awaiting_linking", "awaiting_submission",
  "awaiting_approval", "awaiting_finalization", "awaiting_final_review",
  "ready_for_production", "approved", "inProduction", "produced",
  "conferred", "delivered", "canceled",
];

// Altura FIXA do header sticky de evento — o thead sticky usa este valor como
// `top` para encostar exatamente abaixo dele (ver comentários na tabela).
const EVENT_HEADER_H = 62;

// Renderização incremental: cada evento mostra até ROW_CAP linhas e a lista
// abre até GROUP_CAP eventos; o resto entra sob demanda. Sem o teto de GRUPOS,
// 40 eventos ativos (o estado padrão da tela, sem filtro) rendiam até 2000 <tr>
// de uma vez — e a tela recebe invalidação por WebSocket a cada mutação de
// QUALQUER usuário, então um lote de 30 peças virava cascata de re-render.
const ROW_CAP = 50;
const GROUP_CAP = 5;

const EVENT_TITLE_STYLE: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 800, fontSize: 15,
  textTransform: "uppercase", letterSpacing: "0.01em",
  color: "#1c1917", margin: 0, lineHeight: 1,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

// Zonas dos KPIs — as três fases do fluxo. 12 cards iguais obrigavam a
// escanear um a um para achar o gargalo.
const ZONA_ENTRADA: GroupKey[] = ["requested", "awaiting_linking"];
const ZONA_APROVACAO: GroupKey[] = ["awaiting_submission", "awaiting_approval", "awaiting_finalization", "awaiting_final_review"];
const ZONA_PRODUCAO: GroupKey[] = ["ready_for_production", "approved", "inProduction", "produced", "conferred", "delivered"];

// ─── CSS da tela ────────────────────────────────────────────────────────────
// O hover das linhas era feito com onMouseEnter/onMouseLeave mutando
// `el.style` — dois handlers recriados a cada render em até 2000 linhas. Em
// CSS custa zero por linha. A zebra continua vindo de atributo (`data-zebra`)
// porque as linhas de peça não são contíguas: sub-headers de grupo e de tipo
// se intercalam, então `:nth-child` contaria errado.
const PG_CSS = `
.pg-row { border-left: 3px solid transparent; border-bottom: 1px solid #f0f0ef; transition: background-color .15s, transform .15s, border-color .15s; }
.pg-row[data-zebra="0"] { background-color: #ffffff; }
.pg-row[data-zebra="1"] { background-color: #f6f4f1; }
.pg-row[data-deleted="0"] { cursor: pointer; }
.pg-row[data-deleted="1"] { background-color: #fff5f5; border-left-color: #fecaca; opacity: .85; }
.pg-row[data-deleted="0"]:hover { background-color: #fff7ed; border-left-color: #f97316; transform: translateY(-1px); }
.pg-row[data-selected="1"] { background-color: #fff7ed; border-left-color: #c2410c; }
.pg-event-link { text-decoration: none; display: block; min-width: 0; border-radius: 4px; }
.pg-event-link h3 { transition: color .15s; }
.pg-event-link:hover h3 { color: #c2410c; text-decoration: underline; }
.pg-event-link:focus-visible { outline: 2px solid #c2410c; outline-offset: 2px; }
.pg-goto { opacity: 0; transition: opacity .15s; flex-shrink: 0; }
.pg-event-link:hover .pg-goto, .pg-event-link:focus-visible .pg-goto { opacity: 1; }
.pg-rail { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
.pg-rail > * { scroll-snap-align: start; flex: 0 0 150px; }
.pg-sortable { cursor: pointer; user-select: none; }
/* #c2410c sobre o #fafaf9 do cabecalho = 4,96:1 AA. Era #fdba74, escolhido
   quando o thead era ESCURO; ao clarear o cabecalho eu nao revisei esta cor e
   ela virou 1,61:1 — o hover de ordenacao ficou praticamente invisivel. */
.pg-sortable:hover { color: #c2410c; }
`;

// ─── Status card ────────────────────────────────────────────────────────────
// Fora do componente da página de propósito: definido inline, era recriado a
// cada render e os 13 cards remontavam (perdendo até a transição CSS) a cada
// tecla digitada na busca. Recebe tudo por props.
//
// `dark` existe para o card Total: ele era 33 linhas escritas à mão, sem
// transição, sem hover e sem o par undim/redim — ao lado de 12 cards que
// reagem ao mouse, o único que serve de "limpar status" parecia quebrado.
function StatusCard({
  label, value, dot, color, filterKey, sub, subActionLabel, onSubAction,
  isActive, onToggle, dark, badge, title,
}: {
  label: string; value: number; dot: string; color: string;
  filterKey: string; sub?: string; subActionLabel?: string; onSubAction?: () => void;
  isActive: boolean; onToggle: () => void; dark?: boolean; badge?: string; title?: string;
}) {
  // Cards zerados são informação de baixo valor no escaneamento ("onde está
  // o gargalo?") — ficam esmaecidos, mas continuam clicáveis/filtráveis.
  const isZero = value === 0 && !isActive && !dark;
  const undim = (el: HTMLDivElement) => { if (isZero) el.style.opacity = "1"; };
  const redim = (el: HTMLDivElement) => { if (isZero) el.style.opacity = "0.75"; };
  const plural = value === 1 ? "peça" : "peças";
  // Os cartões são o filtro por status desta tela. Como div com onClick,
  // filtrar era exclusivamente com mouse — e só a cor dizia qual estava
  // ativo, coisa que aria-pressed comunica a quem não a vê.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`${dark ? "Mostrar todas as peças" : `Filtrar por ${label}`}, ${value} ${plural}`}
      title={title}
      onClick={onToggle}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      data-testid={dark ? "stat-total" : `stat-card-${filterKey}`}
      style={{
        position: "relative", overflow: "hidden",
        background: dark
          ? "linear-gradient(145deg, #292522, #1c1917)"
          : isActive ? `linear-gradient(135deg, ${color}18 0%, #ffffff 72%)` : "#ffffff",
        border: `1px solid ${dark ? (isActive ? "#f97316" : "#3b3531") : (isActive ? color : "#e7e5e4")}`,
        ...(dark
          ? { borderBottom: "3px solid #f97316" }
          : { borderLeft: `4px solid ${isActive ? color : `${dot}90`}` }),
        borderRadius: 12,
        padding: dark ? "14px 15px" : "14px 15px 13px 14px", minHeight: 102,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        cursor: "pointer",
        boxShadow: dark
          ? (isActive ? "0 0 0 2px rgba(249,115,22,.22), 0 5px 12px rgba(28,25,23,.16)" : "0 2px 5px rgba(28,25,23,.12)")
          : (isActive ? `0 0 0 2px ${color}30, 0 5px 12px ${color}18` : "0 1px 2px rgba(28,25,23,.04)"),
        transform: isActive ? "translateY(1px)" : "none",
        opacity: isZero ? 0.75 : 1,
        transition: "border-color 0.15s, box-shadow 0.15s, transform 0.15s, opacity 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        undim(e.currentTarget as HTMLDivElement);
      }}
      onMouseLeave={(e) => {
        if (!isActive) (e.currentTarget as HTMLDivElement).style.transform = "none";
        redim(e.currentTarget as HTMLDivElement);
      }}
      onFocus={(e) => undim(e.currentTarget as HTMLDivElement)}
      onBlur={(e) => redim(e.currentTarget as HTMLDivElement)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {dark ? (
          /* rgba .7 (era .45): em traço de 2px sobre o gradiente escuro o tom
             anterior lia como riscado. A régua da casa pede 0.7 mínimo aqui. */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
        ) : (
          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot, boxShadow: `0 0 0 4px ${dot}18` }} />
        )}
        {isActive && (
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".08em", color: dark ? "#f97316" : color, textTransform: "uppercase" }}>
            {badge ?? "Filtrado"}
          </span>
        )}
      </div>
      <div>
        {/* #f97316 como cor do NÚMERO no card escuro dá 6,3:1 sobre #1c1917 —
            exceção legítima à régua da casa, que foi escrita para fundo claro. */}
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: dark ? "#f97316" : (isActive ? color : "#1c1917"), lineHeight: 1, margin: 0, letterSpacing: "-.05em" }}>{value}</p>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: dark ? "rgba(255,255,255,0.75)" : "#746e69", marginTop: 4, lineHeight: 1.2 }}>{label}</p>
        {sub && (
          onSubAction ? (
            /* O subtexto era um beco sem saída: dizia "inclui 7 rascunhos" e
               não havia como ver os 7. stopPropagation para não alternar o
               card pai no mesmo clique. */
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSubAction(); }}
              onKeyDown={(e) => e.stopPropagation()}
              title={subActionLabel}
              style={{
                background: "none", border: "none", padding: 0, marginTop: 2,
                fontSize: 9, fontWeight: 700, lineHeight: 1.2, cursor: "pointer",
                color: dark ? "rgba(255,255,255,0.75)" : "#78716c",
                textDecoration: "underline", textUnderlineOffset: 2, textAlign: "left",
              }}
            >
              {sub}
            </button>
          ) : (
            <p style={{ fontSize: 9, fontWeight: 600, color: dark ? "rgba(255,255,255,0.75)" : "#746e69", marginTop: 2, lineHeight: 1.2 }}>{sub}</p>
          )
        )}
      </div>
    </div>
  );
}

// ─── Chip de filtro ativo (removível) — linha abaixo da toolbar ─────────────
// isMobile por PROP: como cada chip chamava useIsMobile(), 10 filtros ativos
// criavam 10 listeners de matchMedia para uma informação que o pai já tem.
function FilterChip({ label, onRemove, isMobile }: { label: string; onRemove: () => void; isMobile: boolean }) {
  // Alvo de toque do ×: 24px no desktop, 32px no mobile. Margens negativas
  // compensam a área extra para o chip não inflar visualmente.
  const hit = isMobile ? 32 : 24;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", borderRadius: 999,
      padding: "3px 6px 3px 10px", fontSize: 11, fontWeight: 600, color: "#44403c",
      whiteSpace: "nowrap", maxWidth: 280, overflow: "hidden",
    }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        style={{
          background: "none", border: "none", cursor: "pointer", color: "#746e69",
          fontSize: 13, fontWeight: 800, padding: 0, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          minWidth: hit, minHeight: hit,
          margin: `${-(hit - 18) / 2}px ${-(hit - 18) / 2}px ${-(hit - 18) / 2}px -2px`,
        }}
      >
        ×
      </button>
    </span>
  );
}

// ─── Barra de distribuição de status do evento ──────────────────────────────
// O header do grupo dizia só "N peças": para saber se o evento estava saudável
// era preciso expandir e ler linha a linha. A barra responde "onde está o
// gargalo" na unidade de decisão real — o evento — sem nenhum clique. As cores
// saem de lib/status.ts (mesmas dos dots e pills), então nada de novo vocabulário.
function EventStatusBar({ items, width }: { items: Array<{ status?: string | null }>; width: number }) {
  const segments = useMemo(() => {
    const stats = computeStats(items);
    return GROUP_KEYS
      .map(k => ({ key: k, n: stats.byGroup[k], meta: getStatusMeta(STATUS_GROUPS[k][0]) }))
      .filter(s => s.n > 0);
  }, [items]);

  if (segments.length === 0) return null;
  const total = segments.reduce((a, s) => a + s.n, 0);
  const resumo = segments.map(s => `${s.meta.label}: ${s.n}`).join(" · ");

  return (
    <div
      title={resumo}
      aria-label={`Distribuição por etapa — ${resumo}`}
      role="img"
      style={{ display: "flex", width, height: 6, borderRadius: 999, overflow: "hidden", backgroundColor: "#f0efee", flexShrink: 0 }}
    >
      {segments.map(s => (
        <div key={s.key} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.meta.dot }} />
      ))}
    </div>
  );
}

export default function PainelGeral() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Exclusão: admin e solicitação, em QUALQUER status — decisão do dono, mesma
  // regra do event-detail.tsx.
  //
  // O que torna a liberação segura é a natureza da ação: excluir aqui é SOFT
  // delete (grava deletedAt), fica registrado no log de auditoria e a peça
  // continua acessível — e restaurável por admin — na visão "Excluídos". Não é
  // uma porta sem volta, é tirar da listagem. A trava de escalão por status
  // impedia solicitação de apagar até o rascunho que ela mesma tinha acabado de
  // criar (awaiting_submission estava na lista de bloqueio), o que resolvia um
  // risco que não existia e criava um pedido de socorro ao admin por dia.
  //
  // A trava que CONTINUA valendo para todo mundo é a de integridade — peça mãe
  // com complemento vivo — e ela é barrada no servidor com 409, onde tem de
  // ser: é regra de dado, não de papel.
  const canDeleteAny = isAdmin || user?.role === "solicitacao";

  // Filtros inicializam da URL (?status=...&evento=...) — assim F5 não perde o
  // trabalho de filtrar e dá para compartilhar um link "itens atrasados do
  // evento X" com um colega.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const fromCsv = (key: string) => { const v = urlParams.get(key); return v ? v.split(",").filter(Boolean) : []; };
  // Busca com debounce: o input atualiza `searchInput` a cada tecla; o filtro
  // (searchTerm) só é aplicado 200ms depois — sem isso, cada tecla refiltrava,
  // reordenava e reagrupava a lista inteira.
  const [searchInput, setSearchInput]   = useState(() => urlParams.get("busca") ?? "");
  const [searchTerm, setSearchTerm]     = useState(() => urlParams.get("busca") ?? "");
  const [statusFilter, setStatusFilter] = useState<string[]>(() => fromCsv("status"));
  const [eventFilter, setEventFilter]   = useState<string[]>(() => fromCsv("evento"));
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => fromCsv("patrocinador"));
  const [typeFilter, setTypeFilter]     = useState<string[]>(() => fromCsv("tipo"));
  const [dateFilter, setDateFilter]     = useState<string[]>(() => fromCsv("saida"));
  const [focoFilter, setFocoFilter]     = useState<string[]>(() => fromCsv("foco"));
  // ── Peças de evento fora de jogo: ocultas na abertura ─────────────────────
  // Decisão do dono (14/08): "acho que não precisa aparecer inicialmente".
  // Mesmo padrão já provado das "entregues ocultas" da Gráfica — o estado mora
  // na URL (um recorte compartilhado tem de chegar igual do outro lado) e o
  // caminho de volta é um chip SEMPRE visível na faixa de atenção, nunca um
  // filtro escondido num dropdown.
  const [mostrarFinalizados, setMostrarFinalizados] = useState<boolean>(() => urlParams.get("finalizados") === "1");

  // Mantém a URL espelhando os filtros (replaceState: não polui o histórico).
  // Parte da query string ATUAL e sobrescreve só as chaves gerenciadas — um
  // param alheio (ex.: utm_source, flag de debug) sobrevive à filtragem.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string) => value ? p.set(key, value) : p.delete(key);
    setOrDelete("busca", searchTerm);
    setOrDelete("status", statusFilter.join(","));
    setOrDelete("evento", eventFilter.join(","));
    setOrDelete("patrocinador", sponsorFilter.join(","));
    setOrDelete("tipo", typeFilter.join(","));
    setOrDelete("saida", dateFilter.join(","));
    setOrDelete("foco", focoFilter.join(","));
    setOrDelete("finalizados", mostrarFinalizados ? "1" : "");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);

  // Debounce da busca (200ms) — ver comentário no estado searchInput.
  useEffect(() => {
    const t = setTimeout(() => setSearchTerm(searchInput), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Voltar/avançar do navegador: reidrata os filtros a partir da URL. Sem
  // isso, o back trocava a URL mas a tela continuava com os filtros novos.
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      const csv = (k: string) => { const v = p.get(k); return v ? v.split(",").filter(Boolean) : []; };
      setSearchInput(p.get("busca") ?? "");
      setSearchTerm(p.get("busca") ?? "");
      setStatusFilter(csv("status"));
      setEventFilter(csv("evento"));
      setSponsorFilter(csv("patrocinador"));
      setTypeFilter(csv("tipo"));
      setDateFilter(csv("saida"));
      setFocoFilter(csv("foco"));
      setMostrarFinalizados(p.get("finalizados") === "1");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Atalho "/" foca a busca (padrão de SaaS — Linear/GitHub). Ignorado quando
  // o usuário já está digitando em algum campo.
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

  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const expandEvent = (key: string) =>
    setExpandedEvents(prev => { const next = new Set(prev); next.add(key); return next; });
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const openGroup = (key: string) =>
    setOpenGroups(prev => { const next = new Set(prev); next.add(key); return next; });
  const [selectedItem, setSelectedItem] = useState<any>(null);
  // Aumento de quantidade pós-produção (COMPLEMENTO): a peça-mãe em foco.
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  // Feedback do restaurar: guarda o id em restauração para trocar o ícone
  // daquele botão por um spinner (os outros só ficam desabilitados).
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [showAllKpis, setShowAllKpis] = useState(false);
  const [sortBy, setSortBy] = useState<"displayId" | "status" | "area">("displayId");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const isMobile = useIsMobile();
  // Densidade pela largura do CONTEÚDO, não da janela: com a sidebar aberta,
  // 1000px de janela deixam ~744px de conteúdo — e era aí que a tabela de 6
  // colunas estourava, dando rolagem horizontal na PÁGINA inteira, em silêncio.
  const { ref: rootRef, width: contentWidth } = useElementSize<HTMLDivElement>();
  const density: ContentDensity = contentWidth === 0
    ? (isMobile ? "cards" : "full")   // antes da 1ª medição: cai no palpite da janela
    : densityFromWidth(contentWidth);
  const useCards = isMobile || density === "cards";
  const isCompact = !useCards && density === "compact";
  // Altura REAL da toolbar sticky — ela quebra linha conforme a largura, e o
  // header de evento e o thead grudam logo abaixo dela. Número fixo aqui
  // esconderia uma camada atrás da outra na primeira quebra.
  const { ref: toolbarRef, height: toolbarH } = useElementSize<HTMLDivElement>();
  const stickyToolbar = !useCards;
  const topOffset = 4 + (stickyToolbar ? toolbarH : 0);

  // ── Frescor do dado ───────────────────────────────────────────────────────
  // O queryClient roda com staleTime Infinity e sem refetch: a ÚNICA fonte de
  // atualização era o WebSocket. Socket caído = painel congelado por tempo
  // indeterminado, enquanto o subtítulo prometia "tempo real". Aqui a query
  // desta tela sobrescreve o padrão: fica velha em 30s, revalida sozinha a cada
  // 60s e ao voltar o foco da aba. Sem botão "Atualizar" (decisão do dono): a
  // tela se atualiza sozinha e o carimbo diz desde quando o que se lê é verdade.
  const {
    data: items = [], isLoading, isError, isFetching, dataUpdatedAt, refetch,
  } = useQuery<any[]>({
    queryKey: ["/api/items"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const { data: events = [] }        = useQuery<Event[]>({ queryKey: ["/api/events"], placeholderData: [], staleTime: 30_000, refetchOnWindowFocus: true });
  const { data: sponsors = [] }      = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], placeholderData: [] });
  const { data: standardItems = [] } = useQuery<StandardItem[]>({ queryKey: ["/api/standard-items"], placeholderData: [] });

  // Relógio de parede só para o carimbo envelhecer sozinho na tela: sem ele,
  // "há 2 min" ficava escrito até a próxima revalidação.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const frescor = formatFrescor(dataUpdatedAt, agora);

  // Audit log SÓ da peça aberta no modal, buscado sob demanda. Antes a página
  // baixava /api/audit-logs INTEIRO no load (tabela que só cresce — em 1 ano,
  // megabytes por visita) apenas para alimentar o ItemDetailsDialog. O modal
  // filtra por entityId internamente, então receber o subconjunto é compatível.
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    // Resposta inesperada (HTML de erro, objeto) não pode chegar ao modal
    // como "array" — normaliza para lista vazia.
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!selectedItem?.id,
    placeholderData: [],
  });

  const showDeleted = statusFilter.includes("deleted");
  const {
    data: deletedItems = [],
    isLoading: deletedLoading,
    isError: deletedError,
    refetch: refetchDeleted,
  } = useQuery<any[]>({
    queryKey: ["/api/items/deleted"],
    enabled: showDeleted && canDeleteAny,
  });

  // Restaurar (desfaz o soft delete) — SOMENTE admin; a visão Excluídos era
  // um beco sem saída (dava para ver, não para voltar).
  const restoreItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("POST", `/api/items/${itemId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Peça restaurada", description: "Ela voltou às listagens com o status que tinha." });
    },
    onError: (error: any) => toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" }),
    onSettled: () => setRestoringItemId(null),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: (_res, itemId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      // '/api/events' também: sem ela, com o socket caído, quem excluiu via a
      // lista certa e o status do evento errado no resto do app.
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      // Exclusão aqui é soft delete e existe rota de restore — mas só admin
      // pode chamá-la (solicitacao leva 403). Por isso o desfazer só aparece
      // para quem consegue desfazer; aos demais, o caminho para a lixeira.
      toast({
        title: "Peça excluída",
        description: "Ela saiu das listagens e foi para a lixeira.",
        action: isAdmin ? (
          <ToastAction
            altText="Desfazer exclusão"
            onClick={() => { setRestoringItemId(itemId); restoreItemMutation.mutate(itemId); }}
          >
            Desfazer
          </ToastAction>
        ) : canDeleteAny ? (
          <ToastAction altText="Ver a lixeira" onClick={() => setStatusFilter(["deleted"])}>
            Ver na lixeira
          </ToastAction>
        ) : undefined,
      });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  // `uniqueTypes` saiu: era a lista de tipos do BANCO INTEIRO alimentando o
  // menu de Tipo, sem contagem e sem relação com o recorte da tela. Quem faz
  // isso agora é `typeFilterOptions`, que sai do mesmo pool da lista.

  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Filtragem, ordenação, agrupamento e KPIs são recomputados SÓ quando os
  // dados ou filtros mudam — sem o useMemo, cada render (ex.: abrir um modal)
  // refazia filter+sort da lista inteira.
  const { filteredItems, sortedGroupEntries, stats, eventMeta, atencao, ocultas,
          eventFilterOptions, typeFilterOptions, sponsorFilterOptions, dateFilterOptions } = useMemo(() => {
  // Hoje à meia-noite — calculado UMA vez por recomputação (antes era um
  // new Date por item dentro do filtro).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  // Âncora SEPARADA para o predicado de evento finalizado, e ela é obrigatória:
  // `todayMs` acima é meia-noite LOCAL do navegador, enquanto o predicado
  // compartilhado (servidor + as cinco filas) roda no dia do negócio em
  // São Paulo. Duas âncoras diferentes fariam o Painel divergir das filas
  // exatamente na virada do dia — o horário em que alguém confere o painel
  // antes do evento.
  const hojeNegocioMs = todayBusinessMs();

  // Içado do applyBaseFilters: eram até 4 toLowerCase() do MESMO termo por item.
  const q = searchTerm.toLowerCase();

  // ── Retrato do evento, calculado sobre a base INTEIRA ────────────────────
  // De propósito não usa a lista filtrada: o chip de prazo diz "3 pendentes" e
  // esse número não pode encolher porque o usuário filtrou por "Entregue". O
  // estado do evento é o que é, independentemente do recorte na tela.
  const eventMeta = new Map<string, {
    truckDayMs: number | null;
    pendentes: number;
    /** Selo de evento fora de jogo — `null` enquanto ele ainda conta. */
    selo: SeloEventoFinalizado | null;
  }>();
  for (const i of items as any[]) {
    const key = i.eventId || "no-event";
    let m = eventMeta.get(key);
    if (!m) {
      const raw = i.event?.truckDepartureDate;
      // toUTCDisplayDate: mesma conversão usada na EXIBIÇÃO da saída — com
      // new Date() local, um fuso atrás do UTC classificava o dia errado.
      let truckDayMs: number | null = null;
      if (raw) { const d = toUTCDisplayDate(raw); d.setHours(0, 0, 0, 0); truckDayMs = d.getTime(); }
      m = { truckDayMs, pendentes: 0, selo: null };
      eventMeta.set(key, m);
    }
    if (!i.deletedAt && isPendingItemStatus(i.status)) m.pendentes++;
  }
  // ── Selo de evento fora de jogo, por evento ──────────────────────────────
  // Calculado DEPOIS do laço acima porque o rótulo do "realizado" depende da
  // contagem de pendentes ("com pendências" × "sem pendências"), que só fecha
  // no fim dele. `item.event` é o evento CRU do enrich de /api/items — traz
  // `status` e `startDate`, que são exatamente as duas colunas do predicado
  // compartilhado (@shared/prazo-dates), o mesmo das cinco filas.
  //
  // Cache próprio, alimentado sob demanda: a lista de EXCLUÍDAS pode trazer
  // peça de um evento que não tem nenhuma peça viva, e esse evento não existe
  // em `eventMeta`. Sem o fallback, a peça excluída de um evento encerrado
  // apareceria sem selo nenhum — exatamente o silêncio que este trabalho veio
  // acabar.
  const seloPorEvento = new Map<string, SeloEventoFinalizado | null>();
  const seloDoItem = (item: any): SeloEventoFinalizado | null => {
    const key = item.eventId || "no-event";
    if (seloPorEvento.has(key)) return seloPorEvento.get(key)!;
    const selo = seloEventoFinalizado(item.event ?? null, hojeNegocioMs, eventMeta.get(key)?.pendentes ?? 0);
    seloPorEvento.set(key, selo);
    return selo;
  };
  for (const i of items as any[]) {
    const m = eventMeta.get(i.eventId || "no-event");
    if (m && m.selo === null) m.selo = seloDoItem(i);
  }
  const eventoFinalizado = (item: any) => seloDoItem(item) !== null;

  const temReprovacao = (item: any) =>
    Array.isArray(item.sponsors) &&
    item.sponsors.some((s: any) => getApprovalMeta(s?.approvalStatus)?.isRejection);

  // "Atrasada" é uma COBRANÇA, e evento fora de jogo não se cobra — nem quando
  // o usuário pede para VER as peças ocultas. Por isso a exclusão não olha o
  // `mostrarFinalizados`: revelar o registro é uma coisa, voltar a chamar de
  // atrasado o que ninguém mais vai tocar seria outra. Era isto que fazia o
  // chip "436 peças em evento com caminhão atrasado" contar um passivo que
  // ninguém ia atacar.
  const emEventoAtrasado = (item: any) => {
    const m = eventMeta.get(item.eventId || "no-event");
    return !!m?.truckDayMs && dayDiff(todayMs, m.truckDayMs) < 0
      && isPendingItemStatus(item.status) && !eventoFinalizado(item);
  };

  // ── A ocultação ──────────────────────────────────────────────────────────
  // A peça sai da lista quando o EVENTO dela saiu de circulação. Três
  // exceções, e as três são intenção EXPLÍCITA de ver aquilo:
  //   · o usuário pediu para ver (chip da faixa de atenção / deep link);
  //   · a busca é o CÓDIGO EXATO da peça — procurar "#3089" e ouvir "nenhuma
  //     peça encontrada" faria qualquer um concluir que ela sumiu do sistema;
  //   · o evento foi escolhido A DEDO no filtro de evento. Filtrar pelo nome do
  //     evento encerrado e receber "Nenhuma peça encontrada" seria a mesma
  //     armadilha, com um clique a menos de esforço para cair nela.
  //
  // `seriaOculto` ignora o botão e responde só "esta peça pertence à ocultação?".
  // É ele que alimenta a contagem do chip — sem essa separação o chip zeraria
  // assim que o usuário revelasse as peças, e o caminho de VOLTA para a lista
  // limpa desapareceria junto com ele.
  const seriaOculto = (item: any) =>
    eventoFinalizado(item)
    && !buscaEhCodigoDaPeca(item.displayId, searchTerm)
    && !eventFilter.includes(item.eventId);
  const ocultoPorEvento = (item: any) => !mostrarFinalizados && seriaOculto(item);

  /**
   * O recorte base da tela. `exceto` desliga UMA dimensão — é assim que o
   * pool das opções de um menu sai da MESMA lista que a tela mostra, sem o
   * próprio filtro dele (senão a opção escolhida seria a única com número).
   * Mesma assinatura de `casaRecorte(item, 'evento')` na Revisão Final e de
   * `casaHistorico(i, 'evento')` no Atendimento — a disciplina travada em
   * server/__tests__/faceta-lista-invariante.test.ts.
   */
  type DimBase = "evento" | "tipo" | "patrocinador" | "data";
  const applyBaseFilters = (item: any, exceto?: DimBase) => {
    const matchesSearch =
      item.type?.toLowerCase().includes(q) ||
      (item.event?.name || "").toLowerCase().includes(q) ||
      item.displayId?.toLowerCase().includes(q) ||
      (item.description || "").toLowerCase().includes(q) ||
      // Patrocinador: a tela exibe chips de patrocinador em toda linha, então
      // "buscar Ambev" é tentativa natural — e devolvia zero.
      (Array.isArray(item.sponsors) && item.sponsors.some((s: any) => (s?.name || "").toLowerCase().includes(q)));
    const matchesEvent   = exceto === "evento"        || eventFilter.length === 0   || eventFilter.includes(item.eventId);
    const matchesType    = exceto === "tipo"          || typeFilter.length === 0    || typeFilter.includes(item.type);
    const matchesSponsor = exceto === "patrocinador"  || sponsorFilter.length === 0 ||
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => sponsorFilter.includes(s.id)));
    const matchesDate = exceto === "data" || dateFilter.length === 0 || (() => {
      // Âncora: SAÍDA DO CAMINHÃO (decisão de negócio) — é o prazo operacional
      // que os chips e alertas usam. Antes filtrava pelo início do evento, que
      // podia dizer "no prazo" com o caminhão já atrasado.
      // Itens sem data não são descartados em silêncio: têm opção própria.
      const truckDayMs = eventMeta.get(item.eventId || "no-event")?.truckDayMs ?? null;
      if (truckDayMs == null) return dateFilter.includes("no_departure");
      // dayDiff (Math.round): a MESMA conta do chip de prazo. Antes o filtro
      // usava ceil e o chip usava round sobre a mesma diferença.
      const diff = dayDiff(todayMs, truckDayMs);
      return dateFilter.some(df => df === "no_departure" ? false : (DATE_RANGE_MAP[df] ? DATE_RANGE_MAP[df](diff) : true));
    })();
    return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesDate;
  };

  const matchesFoco = (item: any) => focoFilter.every(f =>
    f === "reprovadas" ? temReprovacao(item)
    : f === "atrasadas" ? emEventoAtrasado(item)
    : f === "pendentes" ? isPendingItemStatus(item.status)
    : true);

  const matchesStatus = (item: any, f: string[]) => {
    const isDeleted = !!item.deletedAt;
    const activeFilters = f.filter(x => x !== "deleted");
    // Itens excluídos só aparecem quando o filtro "deleted" está ativo — e,
    // se houver outro status marcado, precisam casar com ele também. Antes o
    // atalho `return f.includes("deleted")` trazia a lixeira INTEIRA com o
    // card "Solicitado" marcado como Filtrado: o rótulo mentia.
    if (isDeleted) {
      if (!f.includes("deleted")) return false;
      return activeFilters.length === 0 || matchesStatusFilter(item.status, activeFilters);
    }
    // Itens normais nunca aparecem quando só "deleted" está selecionado —
    // com "Excluídos" como único filtro, a lista mostra SÓ os excluídos.
    if (activeFilters.length === 0) return !f.includes("deleted");
    return matchesStatusFilter(item.status, activeFilters);
  };

  // Quando o filtro "Excluídos" está ativo, mescla as peças soft-deleted na lista de exibição.
  const allDisplayItems = showDeleted ? [...items, ...(deletedItems as any[])] : items;

  // Base do bloco "Precisa de atenção": respeita evento/tipo/busca, mas NÃO o
  // próprio foco — senão o número do chip mudaria ao clicar nele mesmo.
  //
  // A REGRA DOS NÚMEROS DESTA TELA, e ela vale para TUDO (KPIs, contador de
  // resultados, chips de atenção, exportação): os números seguem o RECORTE
  // VISÍVEL. Um KPI é "quanto trabalho eu tenho", e evento fora de jogo não é
  // trabalho. A única exceção é o chip de ocultas logo abaixo — ele existe
  // justamente para contar o que os outros deixaram de contar, e é a porta de
  // volta. Metade dos números seguindo uma regra e metade outra seria pior que
  // qualquer das duas.
  const baseCompleta = (items as any[]).filter(i => applyBaseFilters(i));
  const baseItems = baseCompleta.filter(i => !ocultoPorEvento(i));
  const atencao = {
    reprovadas: baseItems.filter(temReprovacao).length,
    atrasadas: baseItems.filter(emEventoAtrasado).length,
  };

  // O que a ocultação tira (ou tiraria) da tela, por origem e por situação.
  // Contado sobre a base JÁ filtrada pelos demais recortes: o chip fala do que
  // sumiu DESTA lista, não do banco inteiro — senão ele anunciaria peças que o
  // filtro de evento tinha excluído de qualquer jeito.
  const ocultas: ContagemOcultas = { ...CONTAGEM_OCULTAS_ZERO };
  for (const i of baseCompleta) {
    if (!seriaOculto(i)) continue;
    const motivo = seloDoItem(i)!.motivo;
    const aberto = !i.deletedAt && isPendingItemStatus(i.status);
    if (motivo === "encerrado") { ocultas.encerrado++; if (aberto) ocultas.encerradoAberto++; }
    else { ocultas.realizado++; if (aberto) ocultas.realizadoAberto++; }
  }

  const statsItems = baseItems.filter(matchesFoco);

  // ── Opções dos menus, COM contagem ─────────────────────────────────────
  // Os seis menus desta tela eram os únicos do app sem número nenhum: os
  // cards de status contavam, os chips de atenção contavam, e os menus logo
  // ao lado ofereciam listas mudas. Pior no de Evento, que varria a query
  // `events` INTEIRA — oferecia evento do sistema todo sobre uma fila podada
  // por evento finalizado, e clicar num deles devolvia lista vazia sem dizer
  // por quê. É exatamente o defeito que o teste de invariante trava nas
  // outras telas.
  //
  // Cada pool exclui o próprio filtro (`exceto`) e respeita a ocultação de
  // evento finalizado — menos o de EVENTO, que a ignora de propósito: é
  // clicando no evento oculto que o operador o revela (`seriaOculto` já não
  // esconde evento escolhido à mão), então esconder a opção fecharia a única
  // porta de entrada. Mesma decisão da Gráfica com as peças entregues.
  const poolDe = (dim: DimBase, respeitarOcultacao = true) => {
    const base = (items as any[]).filter(i => applyBaseFilters(i, dim));
    return respeitarOcultacao ? base.filter(i => !ocultoPorEvento(i)) : base;
  };

  const PRIO_ORDEM: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
  const PRIO_COR: Record<string, string> = { urgente: "#ef4444", alta: "#f97316", media: "#eab308", baixa: "#3b82f6" };
  const eventoPorId = new Map((events as any[]).map(e => [e.id, e]));

  const eventFilterOptions = (() => {
    const conta = new Map<string, number>();
    poolDe("evento", false).forEach(i => {
      if (!i.eventId) return;
      conta.set(i.eventId, (conta.get(i.eventId) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .map(([id, count]) => {
        // `events` entra só para buscar NOME e prioridade de um id que já veio
        // da lista — nunca como fonte do conjunto de opções.
        const ev = eventoPorId.get(id);
        return { value: id, label: ev?.name ?? "Evento sem nome", count, dotColor: PRIO_COR[ev?.priority ?? ""], _p: PRIO_ORDEM[ev?.priority ?? ""] ?? 4 };
      })
      // `pinned` em todas para o FilterSelect preservar esta ordem: por
      // prioridade e, dentro dela, alfabética — era a ordem que a tela já
      // tinha e que a ordenação alfabética padrão do menu desmontaria.
      .sort((a, b) => a._p !== b._p ? a._p - b._p : a.label.localeCompare(b.label, "pt-BR"))
      .map(({ _p, ...o }) => ({ ...o, pinned: true }));
  })();

  const typeFilterOptions = (() => {
    const conta = new Map<string, number>();
    poolDe("tipo").forEach(i => { if (i.type) conta.set(i.type, (conta.get(i.type) ?? 0) + 1); });
    return Array.from(conta.entries()).map(([t, count]) => ({ value: t, label: t, count }));
  })();

  const sponsorFilterOptions = (() => {
    const conta = new Map<string, number>();
    poolDe("patrocinador").forEach(i => {
      if (!Array.isArray(i.sponsors)) return;
      // Set por peça: uma peça com o mesmo patrocinador repetido não pode
      // contar duas vezes — o clique nele devolveria UMA linha.
      new Set(i.sponsors.map((s: any) => s?.id).filter(Boolean)).forEach((id: any) => {
        conta.set(id, (conta.get(id) ?? 0) + 1);
      });
    });
    const nomePorId = new Map((sponsors as any[]).map(s => [s.id, s.name]));
    return Array.from(conta.entries())
      .map(([id, count]) => ({ value: id, label: nomePorId.get(id) ?? "Patrocinador", count }));
  })();

  const dateFilterOptions = (() => {
    const pool = poolDe("data");
    return DATE_FILTER_VALUES.map((value) => ({
      value,
      label: DATE_FILTER_LABELS[value],
      count: pool.filter(i => {
        const truckDayMs = eventMeta.get(i.eventId || "no-event")?.truckDayMs ?? null;
        if (truckDayMs == null) return value === "no_departure";
        if (value === "no_departure") return false;
        const diff = dayDiff(todayMs, truckDayMs);
        return DATE_RANGE_MAP[value] ? DATE_RANGE_MAP[value](diff) : true;
      }).length,
      pinned: true,
    }));
  })();

  const areaDe = (i: any) => {
    const fw = Number(i.fileWidth), fh = Number(i.fileHeight);
    if (Number.isFinite(fw) && Number.isFinite(fh) && fw > 0 && fh > 0) return fw * fh;
    const vw = Number(i.visualWidth), vh = Number(i.visualHeight);
    if (Number.isFinite(vw) && Number.isFinite(vh) && vw > 0 && vh > 0) return vw * vh;
    return -1;
  };

  const dir = sortDir === "asc" ? 1 : -1;
  const filteredItems = allDisplayItems
    .filter((i: any) => applyBaseFilters(i))
    .filter((i: any) => !ocultoPorEvento(i))
    .filter(matchesFoco)
    .filter((i) => matchesStatus(i, statusFilter))
    .sort((a, b) => {
      // Itens excluídos ficam no final
      if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? 1 : -1;
      const gA = typeToGroup[a.type] || '', gB = typeToGroup[b.type] || '';
      if (gA !== gB) return gA.localeCompare(gB, 'pt-BR');
      // Ordenação escolhida no cabeçalho. O padrão continua sendo o displayId:
      // compareDisplayId, não replace(/\D/g,'') — com o replace, o complemento
      // "#0062-C1" virava 621 e aparecia centenas de linhas longe da mãe.
      if (sortBy === "status") {
        const d = statusFlowIndex(a.status) - statusFlowIndex(b.status);
        if (d !== 0) return d * dir;
      } else if (sortBy === "area") {
        const d = areaDe(a) - areaDe(b);
        if (d !== 0) return d * dir;
      } else {
        return compareDisplayId(a.displayId, b.displayId) * dir;
      }
      return compareDisplayId(a.displayId, b.displayId);
    });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const k = item.eventId || "no-event";
    if (!acc[k]) acc[k] = { eventId: item.eventId, eventName: item.event?.name || "Sem Evento", items: [] };
    acc[k].items.push(item);
    return acc;
  }, {} as Record<string, { eventId: string | null; eventName: string; items: any[] }>);

  // KPIs num único passe, derivados do MESMO mapa que o predicado do filtro
  // (lib/painel-kpis). Antes eram duas escritas da mesma regra sem ligação, e
  // o switch sem `default:` deixava status fora do mapa somarem no Total e em
  // card nenhum — a soma dos cards parava de fechar sem qualquer aviso.
  const stats = computeStats(statsItems);

  // Grupos ordenados pela saída do caminhão (ascendente; sem data por último;
  // empate/sem data desempata pelo nome) — Object.entries herdava a ordem de
  // inserção, arbitrária para o usuário.
  //
  // ANTES DISSO, porém, evento fora de jogo vai para o FIM — nunca escondido,
  // sempre no fim. A ordem é por saída do caminhão ASCENDENTE, ou seja o mais
  // antigo primeiro: um evento encerrado em maio ficaria no topo da tela
  // empurrando para baixo tudo que ainda está vivo. Só acontece com o chip de
  // ocultas ligado (por padrão eles nem aparecem), e é exatamente aí que
  // importa: quem revelou o registro quer olhá-lo DEPOIS do trabalho do dia.
  type EventGroup = { eventId: string | null; eventName: string; items: any[] };
  const sortedGroupEntries = (Object.entries(groupedItems) as Array<[string, EventGroup]>).sort(([ka, a], [kb, b]) => {
    const fa = seloPorEvento.get(ka) ? 1 : 0;
    const fb = seloPorEvento.get(kb) ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const da = eventMeta.get(ka)?.truckDayMs ?? null;
    const db = eventMeta.get(kb)?.truckDayMs ?? null;
    if (da == null && db == null) return a.eventName.localeCompare(b.eventName, "pt-BR");
    if (da == null) return 1;
    if (db == null) return -1;
    const diff = da - db;
    return diff !== 0 ? diff : a.eventName.localeCompare(b.eventName, "pt-BR");
  });

  return { filteredItems, sortedGroupEntries, stats, eventMeta, atencao, ocultas,
           eventFilterOptions, typeFilterOptions, sponsorFilterOptions, dateFilterOptions };
  }, [items, deletedItems, showDeleted, searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados, typeToGroup, sortBy, sortDir, events, sponsors]);

  // O chip de reversão. Fora do memo de propósito: ele depende de `ocultas`
  // (que vem de lá) mas também do estado do botão, e nada mais.
  const chipOcultasDados = chipOcultas(ocultas, mostrarFinalizados);

  // Clique no card alterna o status DENTRO do conjunto de filtros — coerente
  // com o dropdown multi-seleção. Antes o clique descartava a seleção inteira
  // e ficava impossível combinar dois status pelos cards.
  const toggleStatusCard = (filterKey: string) =>
    setStatusFilter(prev => prev.includes(filterKey) ? prev.filter(s => s !== filterKey) : [...prev, filterKey]);
  const toggleFoco = (key: string) =>
    setFocoFilter(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]);

  const inputStyle: React.CSSProperties = {
    width: "100%", height: 36,
    backgroundColor: "#ffffff",
    border: "1px solid #e7e5e4",
    borderRadius: 6,
    padding: "0 12px",
    fontSize: 13, color: "#1c1917",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const activeFilterCount =
    statusFilter.length + eventFilter.length + sponsorFilter.length +
    typeFilter.length + dateFilter.length + focoFilter.length + (searchTerm ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const clearAllFilters = () => {
    setStatusFilter([]); setEventFilter([]); setSponsorFilter([]);
    setTypeFilter([]); setDateFilter([]); setFocoFilter([]);
    setSearchTerm(""); setSearchInput("");
  };

  // Mudou o recorte, muda a lista: manter grupos expandidos de um filtro
  // anterior deixava um evento com 400 linhas abertas debaixo de uma busca que
  // não tem nada a ver. `expandedEvents` só crescia; agora zera com o filtro.
  useEffect(() => {
    setExpandedEvents(new Set());
    setOpenGroups(new Set());
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, focoFilter, mostrarFinalizados]);

  // ── Visões salvas ─────────────────────────────────────────────────────────
  const visoes = useMemo(() => visoesParaPapel(user?.role), [user?.role]);
  const filtrosAtuais = { status: statusFilter, saida: dateFilter, foco: focoFilter };
  const aplicarVisao = (v: Visao) => {
    const ativa = visaoEstaAtiva(v, filtrosAtuais);
    setStatusFilter(ativa ? [] : [...v.filtros.status]);
    setDateFilter(ativa ? [] : [...v.filtros.saida]);
    setFocoFilter(ativa ? [] : [...v.filtros.foco]);
  };
  const [visaoPadrao, setVisaoPadrao] = useState<string | null>(null);
  useEffect(() => {
    try { setVisaoPadrao(localStorage.getItem(chaveVisaoPadrao(user?.role))); } catch { /* modo privado */ }
  }, [user?.role]);
  const fixarVisaoPadrao = (v: Visao) => {
    const novo = visaoPadrao === v.id ? null : v.id;
    setVisaoPadrao(novo);
    try {
      if (novo) localStorage.setItem(chaveVisaoPadrao(user?.role), novo);
      else localStorage.removeItem(chaveVisaoPadrao(user?.role));
    } catch { /* modo privado */ }
    toast({
      title: novo ? "Visão padrão definida" : "Visão padrão removida",
      description: novo ? `"${v.label}" será aplicada ao abrir o Painel sem filtros na URL.` : "O Painel volta a abrir sem recorte.",
    });
  };
  // Aplica a visão padrão UMA vez, e só quando a URL não trouxe filtro nenhum —
  // um link compartilhado sempre vence a preferência local, senão o colega abre
  // o link e vê outra coisa. O chip do filtro aparece normalmente: nunca é um
  // recorte silencioso.
  const visaoPadraoAplicada = useRef(false);
  useEffect(() => {
    if (visaoPadraoAplicada.current || visaoPadrao === null) return;
    visaoPadraoAplicada.current = true;
    if (urlParams.toString()) return;
    const v = visoes.find(x => x.id === visaoPadrao);
    if (!v) return;
    setStatusFilter([...v.filtros.status]);
    setDateFilter([...v.filtros.saida]);
    setFocoFilter([...v.filtros.foco]);
  }, [visaoPadrao, visoes, urlParams]);

  // ── Deep-link ?peca=<id> ──────────────────────────────────────────────────
  // O event-detail já suporta ?item=; a home, que é de onde se manda o link no
  // WhatsApp, não tinha equivalente. Consumido UMA vez (o param é removido da
  // URL), senão o dialog reabriria a cada re-render e o F5 nunca "esqueceria".
  const pendingDeepLink = useRef<string | null>(urlParams.get("peca"));
  useEffect(() => {
    const id = pendingDeepLink.current;
    if (!id || items.length === 0) return;
    pendingDeepLink.current = null;
    const alvo = (items as any[]).find((i: any) => i.id === id || i.displayId === id);
    const p = new URLSearchParams(window.location.search);
    p.delete("peca");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    if (alvo) {
      // A peça pode estar num evento fora de jogo, que a tela abre ocultando.
      // O link tem de entregar a peça — e, junto, o CONTEXTO: revelar o recorte
      // deixa o chip da faixa marcado, então o usuário vê onde ela estava. Sem
      // isto, o dialog abriria sobre uma lista onde a peça não existe.
      if (motivoEventoFinalizado(alvo.event, todayBusinessMs()) !== null) setMostrarFinalizados(true);
      setSelectedItem(alvo);
    }
    else toast({ title: "Peça não encontrada", description: "O link aponta para uma peça que não está mais nas listagens." });
  }, [items, toast]);

  const copiarLinkDaPeca = async (item: any) => {
    const url = `${window.location.origin}${window.location.pathname}?peca=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copiado", description: `Link direto da peça ${item.displayId}.` });
    } catch {
      toast({ title: "Não foi possível copiar", description: url, variant: "destructive" });
    }
  };

  // ── Seleção em lote ───────────────────────────────────────────────────────
  const selecionadas = useMemo(
    () => filteredItems.filter((i: any) => !i.deletedAt && selectedIds.has(i.id)),
    [filteredItems, selectedIds],
  );
  const toggleSelecionado = (id: string) =>
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleSelecaoDoEvento = (evItems: any[], marcar: boolean) =>
    setSelectedIds(prev => {
      const n = new Set(prev);
      for (const i of evItems) { if (i.deletedAt) continue; if (marcar) n.add(i.id); else n.delete(i.id); }
      return n;
    });
  const copiarIds = async () => {
    const txt = selecionadas.map((i: any) => i.displayId).join("\n");
    try {
      await navigator.clipboard.writeText(txt);
      toast({ title: "IDs copiados", description: `${selecionadas.length} ${selecionadas.length === 1 ? "ID copiado" : "IDs copiados"}.` });
    } catch {
      toast({ title: "Não foi possível copiar", description: "O navegador bloqueou o acesso à área de transferência.", variant: "destructive" });
    }
  };

  // ── Exportações ───────────────────────────────────────────────────────────
  // O que sai é sempre o que está na tela: a seleção quando existe, senão o
  // recorte filtrado. Nunca a base inteira, e nunca com peça excluída dentro.
  const itensParaExportar = (selecionadas.length > 0 ? selecionadas : filteredItems).filter((i: any) => !i.deletedAt);
  const tituloExport = statusFilter.length
    ? `Peças — ${statusFilter.filter(s => s !== "deleted").map(s => getStatusLabel(s)).join(", ") || "Excluídas"}`
    : "Peças";

  const exportarXlsx = async () => {
    if (!itensParaExportar.length) return;
    setExportMenuOpen(false);
    setIsExportingXlsx(true);
    try {
      const res = await fetch("/api/items/export-xlsx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ itemIds: itensParaExportar.map((i: any) => i.id), title: tituloExport }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao gerar o arquivo");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tituloExport}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({ title: "Erro ao exportar", description: error.message, variant: "destructive" });
    } finally {
      setIsExportingXlsx(false);
    }
  };

  // Fecha o menu de exportar ao clicar fora / apertar Escape.
  const exportMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExportMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [exportMenuOpen]);

  // Ordenação por coluna: mesmo campo alterna a direção; campo novo começa asc.
  const toggleSort = useCallback((campo: "displayId" | "status" | "area") => {
    setSortBy(prev => { if (prev === campo) { setSortDir(d => d === "asc" ? "desc" : "asc"); return prev; } setSortDir("asc"); return campo; });
  }, []);
  const ariaSort = (campo: string): "ascending" | "descending" | "none" =>
    sortBy === campo ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  // Banner da visão Excluídos visível = o motivo do vazio JÁ está explicado em
  // cima. O bloco genérico "Nenhum item corresponde aos filtros ativos" logo
  // abaixo dizia outra coisa (falsa) e era o maior e o único com botão.
  const bannerExcluidosVisivel = showDeleted && (!canDeleteAny || deletedLoading || deletedError);

  const colCount = isCompact ? 5 : 7;
  /**
   * QUAIS CARDS APARECEM. Um card com 0 ocupava a mesma largura e o mesmo peso
   * de um com 1102 — e a primeira dobra da tela gastava treze deles, sendo que
   * tres costumam estar zerados. "Onde esta o gargalo?" e uma pergunta sobre
   * onde HA peca, e cards vazios so competem com a resposta.
   *
   * A regra ja existia e valia so no celular; agora vale nos dois. O status
   * FILTRADO nunca some, mesmo zerado: quem clicou nele precisa do caminho de
   * volta, e um controle que desaparece ao ser usado e uma armadilha.
   */
  /** Largura de um card de status. Fixa de proposito: ver o comentario das
   *  zonas — card que estica para preencher a linha vira um retangulo de
   *  1500px anunciando o numero 1. */
  const LARG_CARD = useCards ? "minmax(0,1fr)" : "minmax(150px, 196px)";

  const kpiVisivelPorChave = (k: GroupKey) =>
    showAllKpis || (stats.byGroup[k] ?? 0) > 0 || statusFilter.includes(k);

  const entradaVisivel   = ZONA_ENTRADA.filter(kpiVisivelPorChave);
  const aprovacaoVisivel = ZONA_APROVACAO.filter(kpiVisivelPorChave);
  const producaoVisivel  = ZONA_PRODUCAO.filter(kpiVisivelPorChave);
  /** Quantos o corte tirou — o número que o gatilho promete devolver. */
  const escondidos =
    (ZONA_ENTRADA.length - entradaVisivel.length) +
    (ZONA_APROVACAO.length - aprovacaoVisivel.length) +
    (ZONA_PRODUCAO.length - producaoVisivel.length);

  const kpiCards: Array<{ key: GroupKey; value: number }> = [...ZONA_ENTRADA, ...ZONA_APROVACAO, ...ZONA_PRODUCAO]
    .map(k => ({ key: k, value: stats.byGroup[k] }));

  const renderStatusCard = (key: GroupKey) => {
    const m = getStatusMeta(STATUS_GROUPS[key][0]);
    return (
      <StatusCard
        key={key}
        // label completo no desktop: o contrato de StatusMeta diz que `short` é
        // para mobile/espaços apertados. Com 200px por card, "Ag. Vinculação"
        // no card e "Status: Aguardando Vinculação" no chip logo abaixo davam
        // dois nomes à mesma peça na mesma tela.
        label={useCards ? m.short : m.label}
        value={stats.byGroup[key]}
        dot={m.dot} color={m.text} filterKey={key}
        isActive={statusFilter.includes(key)}
        onToggle={() => toggleStatusCard(key)}
        sub={key === "requested" && stats.drafts > 0 ? `inclui ${stats.drafts} rascunho${stats.drafts > 1 ? "s" : ""}` : undefined}
        subActionLabel={key === "requested" ? "Ver só os rascunhos" : undefined}
        onSubAction={key === "requested" && stats.drafts > 0 ? () => setStatusFilter(["draft"]) : undefined}
      />
    );
  };

  const canceladas = stats.byGroup.canceled;
  const totalCard = (
    <StatusCard
      label="Total" value={stats.total}
      dot="#f97316" color="#f97316" filterKey="total" dark badge="BASELINE"
      isActive={statusFilter.length === 0}
      onToggle={() => setStatusFilter([])}
      sub={canceladas > 0 ? `inclui ${canceladas} cancelada${canceladas > 1 ? "s" : ""}` : undefined}
      subActionLabel="Ver só as canceladas"
      onSubAction={canceladas > 0 ? () => setStatusFilter(["canceled"]) : undefined}
    />
  );

  // Hoje à meia-noite — uma vez por render, não uma por grupo de evento.
  const hojeMs = (() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); })();

  return (
    <div
      ref={rootRef}
      /* alignSelf FLEX-START, e nao o stretch padrao.
         Esta raiz e flex ITEM do <main>, que e display:flex. Com o stretch
         padrao a altura dela era FORCADA a do container (610px, a do
         scrollport) e o conteudo transbordava por fora da caixa — o
         minHeight:100% nao faz a caixa crescer nesse cenario.
         Consequencia medida: a barra de filtros e position:sticky, e sticky so
         gruda DENTRO da caixa do pai. Com a caixa do tamanho da janela ela nao
         tinha alcance nenhum: rolando a lista a barra saia da tela (medida em
         y -64) e quem estava no meio de 3.187 pecas perdia busca, filtros e
         visoes salvas justamente quando mais precisa deles.
         Com flex-start a altura passa a ser a do CONTEUDO, e o minHeight:100%
         continua garantindo o piso quando a lista e curta. */
      style={{ position: "relative", display: "flex", flexDirection: "column", alignSelf: "flex-start", width: "100%", gap: 22, padding: useCards ? "0 12px 20px" : "0 28px 34px", minHeight: "100%", background: "#fafaf9" }}
    >
      {/* SEM overflowY no wrapper: quem rola é o <main> do layout. Um
          overflow:auto aqui criava um scroll-container que NÃO rola
          (min-height 100%) e prendia todo position:sticky descendente. */}
      <style>{PG_CSS}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 4, height: 4, margin: useCards ? "0 -12px" : "0 -28px", background: "linear-gradient(90deg, #1c1917 0%, #1c1917 72%, #f97316 72%, #f97316 100%)" }} />

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, paddingTop: 22, paddingBottom: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 }}>
          <h1
            data-testid="title-painel-geral"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: useCards ? 20 : 29, fontWeight: 700, letterSpacing: "-0.055em",
              textTransform: "uppercase", color: "#1c1917", margin: 0,
            }}
          >
            Painel de Status Geral
          </h1>
          {/* Subtítulo honesto: a tela mostra peças em TODOS os status (não só
              "em produção") e o "tempo real" dependia de um socket que cai. O
              que ela garante mesmo é o escopo e a ordem. */}
          <p style={{ fontSize: 13, color: "#746e69", fontWeight: 500, margin: "4px 0 0 0", display: useCards ? "none" : "block" }}>
            Todas as peças de todos os eventos, ordenadas pela saída do caminhão
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {/* Carimbo de frescor: o usuário precisa saber DESDE QUANDO o que ele
              lê é verdade. Sem botão Atualizar — a tela revalida sozinha. */}
          {frescor && (
            <div
              title={`${frescor.srLabel}. Esta tela se atualiza sozinha a cada minuto e ao voltar para a aba.`}
              data-testid="painel-frescor"
              style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "#746e69", whiteSpace: "nowrap" }}
            >
              {isFetching
                ? <Loader2 className="animate-spin" style={{ width: 11, height: 11, color: "#746e69" }} aria-hidden="true" />
                : <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: frescor.tone === "fresco" ? "#15803d" : "#b45309", flexShrink: 0 }} />}
              {/* Sem aria-live aqui de propósito: quem anuncia mudança é o
                  contador de resultados. Duas regiões vivas competindo fazem o
                  leitor de tela falar por cima de si mesmo a cada minuto. */}
              <span>{isFetching ? "Atualizando…" : `Atualizado ${frescor.texto}`}</span>
            </div>
          )}

          {/* Exportar rebaixado a contorno: o botão preto com sombra laranja era
              o elemento de maior peso visual da página — a ação mais destacada
              da tela era imprimir. */}
          <div ref={exportMenuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setExportMenuOpen(o => !o)}
              data-testid="button-export-painel"
              aria-haspopup="menu"
              aria-expanded={exportMenuOpen}
              title="Exportar o recorte que está na tela"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: useCards ? 44 : 40, minWidth: useCards ? 44 : undefined, padding: useCards ? "0 12px" : "0 14px", borderRadius: 8, backgroundColor: "#ffffff", border: "1px solid #d6d3d1", color: "#1c1917", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
            >
              {isExportingXlsx
                ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                : <Printer style={{ width: 14, height: 14 }} />}
              {!useCards && "Exportar"}
              <ChevronDown style={{ width: 13, height: 13, color: "#746e69" }} />
            </button>
            {exportMenuOpen && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, minWidth: 232, backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 10, boxShadow: "0 8px 24px rgba(28,25,23,.12)", padding: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "#746e69", margin: "6px 8px 6px" }}>
                  {selecionadas.length > 0 ? `${selecionadas.length} selecionada${selecionadas.length > 1 ? "s" : ""}` : `${itensParaExportar.length} ${itensParaExportar.length === 1 ? "peça na tela" : "peças na tela"}`}
                </p>
                <button role="menuitem" onClick={() => { setExportMenuOpen(false); setShowExportPDFModal(true); }} data-testid="button-export-pdf-painel" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 8px", background: "none", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1c1917", textAlign: "left" }}>
                  <Printer style={{ width: 14, height: 14, color: "#746e69" }} /> Exportar PDF
                </button>
                <button role="menuitem" onClick={exportarXlsx} disabled={isExportingXlsx || itensParaExportar.length === 0} data-testid="button-export-xlsx-painel" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 8px", background: "none", border: "none", borderRadius: 6, cursor: itensParaExportar.length === 0 ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, color: itensParaExportar.length === 0 ? "#a8a29e" : "#1c1917", textAlign: "left" }}>
                  <FileSpreadsheet style={{ width: 14, height: 14, color: "#746e69" }} /> Exportar Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Precisa de atenção ────────────────────────────────────────────────
          Os 13 estados têm o mesmo peso visual, mas a operação não é simétrica:
          reprovação de patrocinador e caminhão que já saiu com peça pendente
          valem mais que as outras dez juntas. Só aparece quando há o que dizer. */}
      {(atencao.reprovadas > 0 || atencao.atrasadas > 0 || chipOcultasDados) && (
        <section aria-label="Precisa de atenção" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69" }}>Precisa de atenção</span>
          {atencao.reprovadas > 0 && (
            <button
              onClick={() => toggleFoco("reprovadas")}
              aria-pressed={focoFilter.includes("reprovadas")}
              data-testid="chip-atencao-reprovadas"
              style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, backgroundColor: focoFilter.includes("reprovadas") ? "#b91c1c" : "#fef2f2", color: focoFilter.includes("reprovadas") ? "#fff" : "#b91c1c", border: `1px solid ${focoFilter.includes("reprovadas") ? "#b91c1c" : "#fecaca"}` }}
            >
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900 }}>{atencao.reprovadas}</span>
              {atencao.reprovadas === 1 ? "peça reprovada pelo patrocinador" : "peças reprovadas pelo patrocinador"}
            </button>
          )}
          {atencao.atrasadas > 0 && (
            <button
              onClick={() => toggleFoco("atrasadas")}
              aria-pressed={focoFilter.includes("atrasadas")}
              data-testid="chip-atencao-atrasadas"
              style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, backgroundColor: focoFilter.includes("atrasadas") ? "#b45309" : "#fffbeb", color: focoFilter.includes("atrasadas") ? "#fff" : "#b45309", border: `1px solid ${focoFilter.includes("atrasadas") ? "#b45309" : "#fde68a"}` }}
            >
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900 }}>{atencao.atrasadas}</span>
              {atencao.atrasadas === 1 ? "peça em evento com caminhão atrasado" : "peças em evento com caminhão atrasado"}
            </button>
          )}
          {/* ── Peças de evento fora de jogo ────────────────────────────────
              Mora AQUI, e não entre os cards de status, por dois motivos: os
              cards são etapas do fluxo, e isto não é etapa nenhuma; e esta
              faixa é o lugar onde os recortes transversais já vivem — foi dela
              que saiu a contagem de "atrasadas" que antes misturava evento
              vivo com evento morto.

              Aparece SEMPRE que houver algo oculto, inclusive com a lista
              cheia: esconder em silêncio seria pior que o problema que a
              ocultação resolve. Cinza, não âmbar nem vermelho — não é
              urgência, é registro; o alarme aqui ao lado tem de continuar
              sendo o mais forte da faixa.

              UM ALGARISMO SÓ, e é o total — o mesmo que o contador de
              resultados exibe. A primeira versão mostrava o passivo aqui e o
              total dentro do verbo ("315 em aberto … mostrar as 469
              ocultas"), e o dono reprovou de imediato: "aparece dois números
              diferentes". O passivo continua na frase do `title`, por extenso
              e com a relação dita. O porquê inteiro está em lib/
              painel-encerrados.ts. */}
          {chipOcultasDados && (
            <button
              onClick={() => setMostrarFinalizados(v => !v)}
              aria-pressed={mostrarFinalizados}
              title={chipOcultasDados.title}
              aria-label={chipOcultasDados.srLabel}
              data-testid="chip-atencao-ocultas"
              /* Contrastes: #44403c sobre #f5f5f4 = 9,42:1; no estado marcado,
                 #ffffff sobre #57534e = 7,63:1. Ambos AA com folga em 13px. */
              style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, backgroundColor: mostrarFinalizados ? "#57534e" : "#f5f5f4", color: mostrarFinalizados ? "#fff" : "#44403c", border: `1px solid ${mostrarFinalizados ? "#57534e" : "#e7e5e4"}` }}
            >
              <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900 }}>{chipOcultasDados.total}</span>
              {chipOcultasDados.texto}
              {/* Separador só de ritmo — o nome acessível do botão vem inteiro
                  do aria-label, então esta pontuação não é lida duas vezes. */}
              <span aria-hidden="true" style={{ opacity: 0.55 }}>·</span>
              <span style={{ textDecoration: "underline", fontWeight: 800 }}>{chipOcultasDados.acao}</span>
            </button>
          )}
        </section>
      )}


      {/* ── Status cards — agrupados nas 3 fases do fluxo ─────────────────
          12 cards iguais obrigavam o usuário a escanear um a um para achar o
          gargalo. As zonas (Entrada → Aprovação → Produção) contam a história
          do fluxo e a largura dos cards por zona cria ritmo visual. ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {useCards ? (
          /* Mobile: 5 linhas de cards (~600px) antes da primeira peça significavam
             rolar 1,4 tela num aparelho de 667px. Vira um trilho horizontal de
             uma linha com só os cards que têm valor — quem chega no celular vem
             com uma pergunta específica, não para escanear 13 KPIs. */
          <>
            <div className="pg-rail">
              {totalCard}
              {kpiCards.filter(c => kpiVisivelPorChave(c.key)).map(c => renderStatusCard(c.key))}
              {stats.outros > 0 && (
                <StatusCard
                  label="Outros" value={stats.outros} dot="#78716c" color="#44403c" filterKey="outros"
                  isActive={false} onToggle={() => setShowAllKpis(true)}
                  sub="fora do fluxo"
                  title={`Status fora do mapa do painel: ${stats.outrosStatus.join(", ")}`}
                />
              )}
            </div>
            <button
              onClick={() => setShowAllKpis(v => !v)}
              style={{ alignSelf: "flex-start", background: "none", border: "none", padding: "2px 2px", fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
            >
              {showAllKpis ? "Mostrar só os status com peças" : "Mostrar todos os status"}
            </button>
          </>
        ) : (
          /* AS ZONAS FLUEM, e não mais num grid 3fr/4fr fixo.
             Com o corte dos zerados o número de cards por zona virou variável,
             e proporções fixas passaram a produzir dois defeitos que só o ao
             vivo mostrou: uma zona com UM card esticava esse card por 1500px,
             e cards de zonas diferentes ficavam com larguras diferentes na
             mesma tela. Card de status é uma peça de tamanho conhecido — ele
             não deve crescer para preencher espaço, deve terminar e deixar o
             resto vazio. */
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 18 }}>
            {/* As colunas de cada zona saem do que SOBROU depois do corte dos
                zerados. Com `repeat(3,1fr)` fixo, esconder um card deixava um
                buraco do tamanho dele — o alívio viraria desalinhamento. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", paddingLeft: 2 }}>Entrada</span>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${1 + entradaVisivel.length}, ${LARG_CARD})`, gap: 10 }}>
                {totalCard}
                {entradaVisivel.map(renderStatusCard)}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", paddingLeft: 2 }}>Aprovação</span>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, aprovacaoVisivel.length)}, ${LARG_CARD})`, gap: 10 }}>
                {aprovacaoVisivel.map(renderStatusCard)}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", paddingLeft: 2 }}>Produção &amp; Entrega</span>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, producaoVisivel.length + (stats.outros > 0 ? 1 : 0))}, ${LARG_CARD})`, gap: 10 }}>
                {producaoVisivel.map(renderStatusCard)}
                {/* Card "Outros": qualquer status fora do mapa aparece aqui, com
                    o valor cru no title. É o que faz a soma dos cards fechar
                    SEMPRE com o Total — antes esses itens somavam no Total e em
                    card nenhum, sem aviso. */}
                {stats.outros > 0 && (
                  <StatusCard
                    label="Outros" value={stats.outros} dot="#78716c" color="#44403c" filterKey="outros"
                    isActive={false} onToggle={() => { /* sem filtro: é anomalia de dado, não etapa do fluxo */ }}
                    sub="status fora do fluxo"
                    title={`Status fora do mapa do painel: ${stats.outrosStatus.join(", ")}`}
                  />
                )}
              </div>
            </div>

            {/* O caminho de volta para os escondidos. Discreto de proposito:
                e uma porta, nao um alarme — e so aparece quando ha o que
                mostrar, senao viraria um botao que nao faz nada. */}
            {/* Sem a guarda de isLoading, durante a carga TODOS os status
                estao zerados e o link oferecia "mostrar os 13 status sem peca"
                — um convite para revelar um vazio que e temporario. */}
            {!isLoading && (escondidos > 0 || showAllKpis) && (
              <button
                onClick={() => setShowAllKpis(v => !v)}
                data-testid="button-toggle-kpis"
                /* Alinhado com a BASE dos cards, não solto embaixo de tudo:
                   `alignSelf: flex-end` o encosta na linha inferior da faixa,
                   onde ele se lê como a continuação dela. */
                style={{ alignSelf: "flex-end", marginBottom: 10, background: "none", border: "none", padding: "2px 2px", fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, whiteSpace: "nowrap" }}
              >
                {showAllKpis
                  ? "Mostrar só os status com peças"
                  : `Mostrar os ${escondidos} status sem peça`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* ── Filter toolbar ──
          Sticky no desktop: com 15 eventos abertos, refinar um filtro obrigava
          a rolar até o topo e voltar — exatamente o laço de quem usa a tela o
          dia inteiro. `top: 4` = logo abaixo da barra de gradiente; zIndex 8
          fica acima do header de evento (6) e do thead (5), que passam a grudar
          abaixo dela (topOffset). Nada aqui pode virar scroll-container. */}
      <div
        ref={toolbarRef}
        style={{
          ...(stickyToolbar ? { position: "sticky" as const, top: 4, zIndex: 8 } : null),
          // DUAS LINHAS DECLARADAS, e nao uma linha que quebra sozinha.
          // Com as visoes salvas aqui dentro sao ate 12 controles; deixados
          // num `wrap` livre eles se reorganizavam a cada largura e cortavam o
          // ultimo select ao meio. Agora e uma grade de duas faixas: as visoes
          // em cima (o recorte pronto), os filtros embaixo (o recorte a mao).
          display: "grid", gridTemplateColumns: "1fr", gap: 8,
          backgroundColor: "#ffffff",
          borderRadius: 10,
          border: "1px solid #e7e5e4",
          padding: "10px 12px",
          boxShadow: "0 1px 3px rgba(28,25,23,0.05)",
        }}
      >
        {/* AS VISÕES MORAM AQUI, e não numa terceira fileira acima.
            A tela tinha três faixas de controle empilhadas antes da primeira
            peça — atenção, visões e filtros —, três gramáticas visuais para
            duas funções. Visão salva É um conjunto de filtros (cada uma é
            literalmente um link com os parâmetros), então ela pertence à
            barra de filtros e não a uma linha própria.
            De quebra herda o `sticky` da barra: antes, para trocar de visão
            com a lista rolada era preciso voltar ao topo. */}
              {/* ── Visões salvas ─────────────────────────────────────────────────────
                  Cada usuário remontava todo dia a mesma combinação de 2-3 filtros, e a
                  home era idêntica para 5 papéis com trabalhos diferentes. Como os
                  filtros vivem na URL, cada visão é literalmente um link. */}
              <div aria-label="Visões salvas" role="group" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {visoes.map(v => {
                  // 44 no toque, 36 no ponteiro — o mesmo piso do resto dos filtros.
                  const alturaVisao = isMobile ? 44 : 36;
                  const ativa = visaoEstaAtiva(v, filtrosAtuais);
                  const ehPadrao = visaoPadrao === v.id;
                  return (
                    <span key={v.id} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${ativa ? "#c2410c" : "#e7e5e4"}`, backgroundColor: ativa ? "#fff7ed" : "#ffffff", overflow: "hidden" }}>
                      <button
                        onClick={() => aplicarVisao(v)}
                        aria-pressed={ativa}
                        title={v.hint}
                        data-testid={`visao-${v.id}`}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: "0 12px", height: alturaVisao, fontSize: 12, fontWeight: 700, color: ativa ? "#c2410c" : "#57534e", whiteSpace: "nowrap" }}
                      >
                        {v.label}
                      </button>
                      <button
                        onClick={() => fixarVisaoPadrao(v)}
                        aria-pressed={ehPadrao}
                        title={ehPadrao ? "Deixar de abrir o Painel nesta visão" : "Abrir o Painel nesta visão por padrão"}
                        aria-label={ehPadrao ? `Deixar de usar "${v.label}" como visão padrão` : `Usar "${v.label}" como visão padrão`}
                        style={{ background: "none", border: "none", borderLeft: `1px solid ${ativa ? "#fed7aa" : "#e7e5e4"}`, cursor: "pointer", padding: "0 9px", height: alturaVisao, display: "flex", alignItems: "center", color: ehPadrao ? "#c2410c" : "#a8a29e" }}
                      >
                        {/* PIN, não CHECK. O ✓ é o glifo que o app inteiro usa para
                            "este recorte está ligado" — nos FilterSelect e na pílula de
                            atalho. Aqui ele dizia outra coisa ("abrir o Painel nesta
                            visão"), e ficava aceso nas CINCO visões ao mesmo tempo:
                            quem aprendeu ✓ = ligado lia cinco filtros ativos numa tela
                            sem filtro nenhum. Fixar é outra ideia e ganha outro glifo.
                            #a8a29e sobrevive porque é ÍCONE, não texto — e o estado
                            real vive no aria-pressed, não na cor. */}
                        <Pin style={{ width: 12, height: 12, fill: ehPadrao ? "currentColor" : "none" }} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>

        {/* FAIXA 2 — o recorte a mao. Separada da faixa das visoes para os
            controles pararem de se reorganizar a cada largura. */}
        <div style={{ display: "flex", alignItems: useCards ? "stretch" : "center", flexWrap: "wrap", gap: 8 }}>
        {/* Search — full width row on mobile */}
        <div style={{ position: "relative", flexShrink: 0, width: useCards ? "100%" : 180 }}>
          {/* #78716c (4,8:1), não #a8a29e (2,52:1): a lupa é a única marcação
              visual do campo e reprovava o mínimo de 3:1 da WCAG 1.4.11. */}
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#746e69", pointerEvents: "none" }} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar peça, evento, tipo ou patrocinador"
            title="Atalho: pressione / para focar a busca"
            aria-label="Buscar peças (atalho: /)"
            aria-keyshortcuts="/"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="input-search"
            style={{ ...inputStyle, paddingLeft: 28, height: useCards ? 44 : 32, fontSize: 13 }}
          />
        </div>

        {useCards && (
          <button
            onClick={() => setMobileFiltersOpen(o => !o)}
            aria-expanded={mobileFiltersOpen}
            data-testid="button-toggle-filtros-mobile"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", height: 44, borderRadius: 6, border: "1px solid #e7e5e4", background: "#fafaf9", fontSize: 13, fontWeight: 700, color: "#1c1917", cursor: "pointer" }}
          >
            <SlidersHorizontal style={{ width: 14, height: 14, color: "#746e69" }} />
            Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            {mobileFiltersOpen ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
          </button>
        )}

        {!useCards && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {(!useCards || mobileFiltersOpen) && (
          <>
            {/* Evento */}
            <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              {/* As opções saem de `eventFilterOptions` — o pool da LISTA —
                  e não mais da query `events` inteira. Antes o menu oferecia
                  todo evento do sistema sobre uma fila podada, e o clique num
                  evento sem peça aqui devolvia lista vazia sem explicação. */}
              <EventFilterDropdown
                values={eventFilter}
                onValuesChange={setEventFilter}
                options={eventFilterOptions}
              />
            </div>

            {/* Tipo */}
            <div style={{ flexShrink: 1, minWidth: 110, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Tipo" allLabel="Todos os tipos"
                values={typeFilter} onValuesChange={setTypeFilter}
                hideWhenEmpty={false}
                options={typeFilterOptions}
                testId="select-type-filter"
                fullWidth
              />
            </div>

            {/* Patrocinador */}
            <div style={{ flex: 1, flexShrink: 1, minWidth: 130, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Patrocinador" allLabel="Todos os patrocinadores"
                values={sponsorFilter} onValuesChange={setSponsorFilter}
                hideWhenEmpty={false}
                options={sponsorFilterOptions}
                testId="select-sponsor-filter"
                fullWidth
              />
            </div>

            {/* Status */}
            <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Status" allLabel="Qualquer status"
                values={statusFilter} onValuesChange={setStatusFilter}
                hideWhenEmpty={false}
                options={[
                  // Rótulos derivam de lib/status.ts (fonte única) — o hardcoded
                  // anterior chamava `requested` de "Rascunho", divergindo dos
                  // pills da tabela ("Solicitado").
                  ...STATUS_FILTER_VALUES.map((value) => ({ value, label: getStatusLabel(value), pinned: true })),
                  ...(canDeleteAny ? [{ value: "deleted", label: "Excluídos", pinned: true }] : []),
                ]}
                testId="select-status-filter"
                fullWidth
              />
            </div>

            {/* Data */}
            <div style={{ flexShrink: 1, minWidth: 110, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              {/* O critério é a SAÍDA DO CAMINHÃO — a âncora operacional dos
                  prazos (mesma dos chips e dos alertas), confirmada pelo negócio. */}
              <FilterSelect
                label="Saída do caminhão" allLabel="Saída: qualquer data"
                values={dateFilter} onValuesChange={setDateFilter}
                hideWhenEmpty={false}
                options={dateFilterOptions}
                testId="select-date-filter"
                fullWidth
              />
            </div>

            {/* Foco */}
            <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
              <FilterSelect
                label="Foco" allLabel="Sem foco"
                values={focoFilter} onValuesChange={setFocoFilter}
                // TRÊS opções: uma caixa de busca sobre elas é ruído puro. É a
                // mesma decisão que o Histórico tomou com os seus 25/50/100.
                hideSearch
                hideWhenEmpty={false}
                options={Object.keys(FOCO_LABELS).map((value) => ({ value, label: FOCO_LABELS[value], pinned: true }))}
                testId="select-foco-filter"
                fullWidth
              />
            </div>
          </>
        )}

        {!useCards && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {/* Counter + clear.
            role="status": mudar o filtro trocava lista e número sem nada
            anunciar — o aria-pressed do card diz que o card está pressionado,
            não quantos resultados sobraram. */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, ...(useCards && { width: "100%" }) }}>
          <span
            role="status" aria-live="polite" aria-atomic="true"
            data-testid="painel-contador"
            style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, color: "#746e69", whiteSpace: "nowrap" }}
          >
            {/* ENQUANTO CARREGA, O CONTADOR NÃO PODE DIZER ZERO.
                Ele lia `filteredItems.length` sem guarda de isLoading, então
                durante a carga (3.187 peças em produção) a tela afirmava
                "0 peças encontradas" com os skeletons rodando logo abaixo —
                "não achei nada" no lugar de "estou buscando".
                E este span é role=status aria-live: o leitor de tela ANUNCIAVA
                o zero. Quem não vê o skeleton recebia a informação errada, sem
                nada que a contradissesse. */}
            {isLoading ? (
              <span style={{ color: "#1c1917", fontWeight: 900 }}>Carregando peças…</span>
            ) : (
              <>
                <span style={{ color: "#1c1917", fontWeight: 900 }}>{filteredItems.length}</span>
                {" "}{filteredItems.length === 1 ? "peça encontrada" : "peças encontradas"}
                {activeFilterCount > 0 && ` · ${activeFilterCount} ${activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}`}
              </>
            )}
            {/* O número desta tela conta o que está VISÍVEL. Ele só pode dizer
                isso se disser, no mesmo fôlego, quanto ficou de fora — é aqui
                que a contagem é lida (e anunciada pelo leitor de tela a cada
                mudança de filtro), então é aqui que a ressalva tem de estar.
                A porta de volta continua sendo o chip da faixa de atenção.

                É o MESMO número e a MESMA palavra do chip ("ocultas"), de
                propósito: repetir um fato em dois lugares que se leem de
                jeitos diferentes (o chip pelo olho, este pelo leitor de tela)
                é redundância; dizer 315 aqui e 469 ali era contradição. */}
            {chipOcultasDados && !mostrarFinalizados && ` · ${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "oculta" : "ocultas"}`}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#c2410c", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", height: 32 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#c2410c"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff7ed"; (e.currentTarget as HTMLButtonElement).style.color = "#c2410c"; }}
            >
              × Limpar
            </button>
          )}
        </div>
        </div>
      </div>

      {/* ── Chips dos filtros ativos — a seleção inteira num relance, cada
          filtro removível individualmente sem reabrir dropdown por dropdown.
          O "× Limpar" da toolbar continua sendo o limpa-tudo. ── */}
      {hasActiveFilters && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: -12 }}>
          {searchTerm && (
            <FilterChip isMobile={useCards} label={`Busca: "${searchTerm}"`} onRemove={() => { setSearchInput(""); setSearchTerm(""); }} />
          )}
          {eventFilter.map(id => (
            <FilterChip isMobile={useCards} key={`ev-${id}`} label={`Evento: ${events.find(e => e.id === id)?.name ?? id}`} onRemove={() => setEventFilter(prev => prev.filter(v => v !== id))} />
          ))}
          {typeFilter.map(t => (
            <FilterChip isMobile={useCards} key={`tp-${t}`} label={`Tipo: ${t}`} onRemove={() => setTypeFilter(prev => prev.filter(v => v !== t))} />
          ))}
          {sponsorFilter.map(id => (
            <FilterChip isMobile={useCards} key={`sp-${id}`} label={`Patrocinador: ${sponsors.find(s => s.id === id)?.name ?? id}`} onRemove={() => setSponsorFilter(prev => prev.filter(v => v !== id))} />
          ))}
          {statusFilter.map(s => (
            <FilterChip isMobile={useCards} key={`st-${s}`} label={`Status: ${s === "deleted" ? "Excluídos" : getStatusLabel(s)}`} onRemove={() => setStatusFilter(prev => prev.filter(v => v !== s))} />
          ))}
          {dateFilter.map(d => (
            <FilterChip isMobile={useCards} key={`dt-${d}`} label={`Saída: ${DATE_FILTER_LABELS[d] ?? d}`} onRemove={() => setDateFilter(prev => prev.filter(v => v !== d))} />
          ))}
          {focoFilter.map(f => (
            <FilterChip isMobile={useCards} key={`fc-${f}`} label={`Foco: ${FOCO_LABELS[f] ?? f}`} onRemove={() => setFocoFilter(prev => prev.filter(v => v !== f))} />
          ))}
        </div>
      )}

      {/* Sem permissão para a visão Excluídos (a query nem roda — enabled
          exige canDeleteAny): diz o porquê e oferece a saída, em vez de uma
          lista silenciosamente vazia. Acontece via URL compartilhada. */}
      {showDeleted && !canDeleteAny && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Você não tem permissão para ver peças excluídas.</span>
          <button
            onClick={() => setStatusFilter(prev => prev.filter(s => s !== "deleted"))}
            style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}
          >
            Remover filtro
          </button>
        </div>
      )}

      {/* Estados da visão Excluídos — sem eles, carregamento parecia lista
          vazia e uma falha virava "Nenhum item encontrado" (mentira). */}
      {showDeleted && deletedLoading && (
        <div style={{ backgroundColor: "#fafaf9", border: "1px solid #e7e5e4", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#746e69" }}>
          Carregando peças excluídas...
        </div>
      )}
      {showDeleted && deletedError && (
        <div style={{ backgroundColor: "#fff", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#b91c1c" }}>Não foi possível carregar as peças excluídas.</span>
          <button onClick={() => refetchDeleted()} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
            Tentar novamente
          </button>
        </div>
      )}

      {/* ── Grouped table ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading ? (
          /* Skeleton com a mesma silhueta da tabela real (cabeçalho do evento +
             header escuro + linhas zebradas) — em vez do spinner central, que
             causava layout shift e não dizia o que estava carregando. */
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, overflow: "hidden" }} aria-busy="true" aria-label="Carregando peças">
            <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="animate-pulse" style={{ width: 180, height: 16, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
              <div className="animate-pulse" style={{ width: 70, height: 20, borderRadius: 99, backgroundColor: "#f5f5f4" }} />
            </div>
            <div style={{ height: 40, backgroundColor: "#1c1917" }} />
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 24, padding: "13px 16px", backgroundColor: i % 2 ? "#fafaf9" : "#ffffff" }}>
                <div className="animate-pulse" style={{ width: 48, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
                <div className="animate-pulse" style={{ width: `${34 - i * 3}%`, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
                <div className="animate-pulse" style={{ width: 60, height: 12, borderRadius: 4, backgroundColor: "#f0efee", marginLeft: "auto" }} />
                <div className="animate-pulse" style={{ width: 90, height: 22, borderRadius: 99, backgroundColor: "#f0efee" }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #fecaca", padding: 48, textAlign: "center" }}>
            <p style={{ color: "#b91c1c", fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Não foi possível carregar as peças</p>
            <p style={{ color: "#746e69", fontSize: 13, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty state com contexto e ação: diz POR QUE está vazio (filtros
             ativos vs sistema sem peças) e oferece o caminho de volta ali
             mesmo. Suprimido quando um banner da visão Excluídos já explicou o
             motivo — antes os dois apareciam empilhados, e o segundo (maior e
             com botão) contava uma história falsa. */
          !bannerExcluidosVisivel && (
            <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, padding: "56px 24px", textAlign: "center" }}>
              <Search style={{ width: 28, height: 28, color: "#d6d3d1", margin: "0 auto 12px" }} />
              {/* Três motivos, três respostas. O terceiro é novo e é o que
                  evita a pior leitura desta feature: lista vazia com peças
                  ocultas por trás lida como "não existe" quando o certo é "não
                  está aqui, e está a um clique". */}
              <p style={{ color: "#1c1917", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
                {hasActiveFilters ? "Nenhuma peça encontrada"
                  : chipOcultasDados && !mostrarFinalizados ? "Só sobrou o que já acabou"
                  : "Nenhuma peça cadastrada ainda"}
              </p>
              <p style={{ color: "#746e69", fontSize: 13, margin: "0 0 16px" }}>
                {hasActiveFilters
                  ? "Nenhuma peça corresponde aos filtros ativos. Ajuste a busca ou limpe os filtros."
                  : chipOcultasDados && !mostrarFinalizados
                    ? `${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "peça está fora" : "peças estão fora"} da lista porque o evento delas foi encerrado ou já foi realizado.`
                    : "As peças aparecem aqui quando forem adicionadas a um evento."}
              </p>
              {hasActiveFilters ? (
                <button
                  onClick={clearAllFilters}
                  style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
                >
                  Limpar filtros
                </button>
              ) : chipOcultasDados && !mostrarFinalizados ? (
                <button
                  onClick={() => setMostrarFinalizados(true)}
                  data-testid="button-mostrar-ocultas-vazio"
                  style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
                >
                  Mostrar as {chipOcultasDados.total} {chipOcultasDados.total === 1 ? "peça oculta" : "peças ocultas"}
                </button>
              ) : null}
            </div>
          )
        ) : (
          sortedGroupEntries.map(([eventKey, eventData], groupIdx) => {
            const gd = eventData as { eventId: string | null; eventName: string; items: any[] };
            const firstItem = gd.items[0];
            // Renderização incremental em dois níveis: até GROUP_CAP eventos
            // abertos e ROW_CAP linhas por evento. O resto entra sob demanda —
            // sem os dois tetos, o estado padrão da tela montava milhares de
            // <tr> que o WebSocket depois re-renderiza a cada mutação alheia.
            const groupOpen = groupIdx < GROUP_CAP || openGroups.has(eventKey);
            const isExpanded = expandedEvents.has(eventKey);
            const visibleItems = !groupOpen ? [] : (isExpanded || gd.items.length <= ROW_CAP ? gd.items : gd.items.slice(0, ROW_CAP));
            const hiddenCount = gd.items.length - visibleItems.length;
            const meta = eventMeta.get(eventKey);
            // Selo de evento fora de jogo (encerrado à mão ou já realizado).
            // `null` enquanto o evento conta — a esmagadora maioria.
            const selo = meta?.selo ?? null;
            // Chip de prazo: calendário CRUZADO com o estado real das peças.
            // A regra inteira (e o porquê de a versão antiga errar em 100% dos
            // eventos) mora em lib/painel-prazo.ts, testada. O 4º argumento é
            // o que impede o "ATRASADO 8D" num evento que ninguém mais toca.
            const deadline: PrazoChip | null = computeDeadlineChip(
              meta?.truckDayMs ?? null, hojeMs, meta?.pendentes ?? 0, !!selo,
            );
            const todasSelecionadas = visibleItems.length > 0 && visibleItems.every((i: any) => i.deletedAt || selectedIds.has(i.id));
            // overflow: clip (não hidden): clipa o border-radius SEM criar
            // scroll-container — pré-requisito para o thead sticky funcionar
            // contra o scroll da página.
            return (
              <div key={eventKey} style={{ border: "1px solid #e2e2e2", borderRadius: 12, backgroundColor: "#ffffff", overflow: "clip", boxShadow: "0 2px 8px rgba(28,25,23,0.07)" }}>

                {/* Group header — sticky logo abaixo da toolbar (topOffset):
                    mantém o contexto do evento visível ao rolar listas longas.
                    zIndex 6 fica ACIMA do thead sticky (5) e ABAIXO da toolbar
                    (8); fundo sólido para as linhas não vazarem por trás.
                    Altura FIXA (EVENT_HEADER_H) — é ela que o thead usa como
                    `top` para encostar exatamente abaixo. Nada aqui cria novo
                    scroll-container (ver comentário na tabela). */}
                <div style={{
                  position: "sticky", top: topOffset, zIndex: 6,
                  backgroundColor: "#ffffff",
                  borderBottom: "1px solid #e7e5e4",
                  // Altura fixa SÓ no desktop (onde o thead precisa dela p/
                  // calcular o próprio top). Mobile usa cards, sem thead —
                  // altura automática deixa os metadados quebrarem linha.
                  ...(useCards
                    ? { padding: "13px 18px 13px 20px" }
                    : { padding: "0 18px 0 20px", height: EVENT_HEADER_H, boxSizing: "border-box" as const }),
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                  // Acento do evento fora de jogo — o MESMO da lista de
                  // Eventos: cinza no encerrado à mão (verde diria "deu tudo
                  // certo", âmbar diria "corre atrás", e encerrado não é
                  // nenhum dos dois) e âmbar no realizado. O laranja da marca
                  // fica para os eventos que ainda estão em jogo.
                  borderLeft: `3px solid ${selo ? selo.dot : "#f97316"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      {/* Nome do evento navega para o detalhe. Era a única saída
                          da tela e não parecia clicável: sem hover, sem
                          sublinhado, sem ícone e sem foco visível — descoberta
                          por acaso não é descoberta. Afordância no CSS (.pg-event-link). */}
                      {gd.eventId ? (
                        <Link
                          href={`/eventos/${gd.eventId}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Abrir evento ${gd.eventName}`}
                          className="pg-event-link"
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                            <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
                            <ArrowUpRight className="pg-goto" style={{ width: 12, height: 12, color: "#c2410c" }} aria-hidden="true" />
                          </span>
                        </Link>
                      ) : (
                        <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
                      )}
                      {/* Ordem invertida de propósito: o CHIP DE PRAZO vem
                          primeiro e não encolhe. Com as datas primeiro e
                          flexWrap nowrap + overflow hidden, o que era clipado
                          em silêncio (sem reticências) era justamente
                          "Atrasado 5d" — o dado mais acionável da linha. */}
                      <div style={{ display: "flex", alignItems: "center", gap: useCards ? 10 : 12, marginTop: 5, minWidth: 0, flexWrap: useCards ? "wrap" : "nowrap", overflow: "hidden" }}>
                        {/* O selo vem ANTES do chip de prazo e também não
                            encolhe: ele é a chave de leitura de todo o resto da
                            linha. Sem ele, "Saiu há 8d · 66 em aberto" parecia
                            um evento vivo em apuros. Palavras da lista de
                            Eventos — as duas telas falam do mesmo estado. */}
                        {selo && (
                          <span
                            title={selo.hint}
                            data-testid={`selo-evento-${eventKey}`}
                            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: selo.dot, flexShrink: 0 }} aria-hidden="true" />
                            {isCompact || useCards ? selo.short : selo.label}
                          </span>
                        )}
                        {deadline && (
                          <span
                            title={deadline.srLabel}
                            data-testid={`chip-prazo-${eventKey}`}
                            style={{ fontSize: 10, fontWeight: 800, color: deadline.color, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap", flexShrink: 0 }}
                          >
                            {deadline.text}
                          </span>
                        )}
                        {firstItem?.event?.truckDepartureDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#746e69", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                            <Truck style={{ width: 11, height: 11, flexShrink: 0 }} />
                            Saída: {format(toUTCDisplayDate(firstItem.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        {/* "Início" é o metadado menos acionável; some primeiro
                            em container estreito (continua na ficha do evento). */}
                        {firstItem?.event?.startDate && !isCompact && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#746e69", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                            <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                            Início: {format(parseDateLocal(firstItem.event.startDate), "dd MMM yyyy", { locale: ptBR })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                    {!useCards && <EventStatusBar items={gd.items} width={120} />}
                    {/* Contador é informação neutra — stone, não laranja: o
                        laranja da marca fica reservado para ação/urgência. */}
                    <span style={{
                      padding: "4px 11px", borderRadius: 999,
                      backgroundColor: "#f5f5f4", color: "#57534e",
                      border: "1px solid #e7e5e4",
                      fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                      whiteSpace: "nowrap",
                    }}>
                      {gd.items.length} {gd.items.length === 1 ? "peça" : "peças"}
                    </span>
                  </div>
                </div>

                {!groupOpen ? (
                  <button
                    onClick={() => openGroup(eventKey)}
                    data-testid={`button-open-group-${eventKey}`}
                    style={{ width: "100%", padding: "13px", background: "#fafaf9", border: "none", color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                  >
                    Mostrar as {gd.items.length} {gd.items.length === 1 ? "peça" : "peças"} deste evento
                  </button>
                ) : useCards ? (
                  <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 0 }}>
                    {(() => {
                      // typeToGroup: usa o memo do topo — este bloco reconstruía
                      // o mapa a cada render de cada evento.
                      const groupMap: Record<string, Record<string, any[]>> = {};
                      for (const item of visibleItems) {
                        const g = typeToGroup[item.type] || '';
                        if (!groupMap[g]) groupMap[g] = {};
                        if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
                        groupMap[g][item.type].push(item);
                      }
                      const sortedGroups = Object.keys(groupMap).sort((a, b) => {
                        if (a === '') return 1; if (b === '') return -1;
                        return a.localeCompare(b, 'pt-BR');
                      });
                      let cardIdx = 0;
                      return sortedGroups.map(group => (
                        <Fragment key={group || '__nogroup'}>
                          {group && (
                            <div style={{ padding: "6px 4px 4px", marginTop: 6, borderLeft: "3px solid #3b82f6", paddingLeft: 8, backgroundColor: "#e7f0fb", borderRadius: "6px 6px 0 0", overflow: "hidden" }}>
                              <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#1d4ed8", fontFamily: "'Space Grotesk', sans-serif", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {group}
                              </span>
                            </div>
                          )}
                          {Object.entries(groupMap[group]).map(([type, typeItems]) => (
                            <Fragment key={type}>
                              {/* Type sub-header */}
                              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px 4px", borderTop: "2px solid #e7e5e4", marginTop: group ? 0 : 6, overflow: "hidden" }}>
                                <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#44403c", fontFamily: "'Space Grotesk', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flex: 1 }}>
                                  {type}
                                </span>
                                <span style={{ fontSize: 10, fontWeight: 800, color: "#57534e", backgroundColor: "#e7e5e4", borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>
                                  {typeItems.length}
                                </span>
                              </div>
                              {typeItems.map((item: any) => {
                                const ci = cardIdx++;
                                const isDeleted = !!item.deletedAt;
                                return (
                                  <div
                                    key={item.id}
                                    data-testid={`item-row-${item.id}`}
                                    onClick={() => !isDeleted && setSelectedItem(item)}
                                    style={{
                                      border: `1px solid ${isDeleted ? "#fecaca" : "#e7e5e4"}`,
                                      borderRadius: 8,
                                      padding: "10px 12px",
                                      marginBottom: 8,
                                      backgroundColor: isDeleted ? "#fff5f5" : (ci % 2 === 1 ? "#f6f4f1" : "#ffffff"),
                                      display: "flex",
                                      alignItems: "flex-start",
                                      gap: 8,
                                      cursor: "pointer",
                                      overflow: "hidden",
                                      opacity: isDeleted ? 0.75 : 1,
                                    }}
                                  >
                                    {/* Card content */}
                                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                                      {/* Row 1: ID + type */}
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <button onClick={e => { e.stopPropagation(); if (!isDeleted) setSelectedItem(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, color: isDeleted ? "#b91c1c" : "#c2410c", fontSize: 13, flexShrink: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
                                          {item.displayId}
                                        </button>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: isDeleted ? "#746e69" : "#44403c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>{item.type}</span>
                                        {item.isReuse && !isDeleted && (
                                          <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>
                                            Reaproveit.
                                          </span>
                                        )}
                                      </div>
                                      {/* Row 2: description — allow up to 2 lines on mobile */}
                                      {item.description && (
                                        <span style={{ fontSize: 13, color: isDeleted ? "#746e69" : "#44403c", fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                                          {item.description}
                                        </span>
                                      )}
                                      {/* Row 3: status pill */}
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        <StatusPill status={isDeleted ? "deleted" : item.status} />
                                        {/* Mesmo selo da linha do desktop, ao
                                            lado do status: no card o status é
                                            a informação que a pessoa lê, e é
                                            justamente ele que engana sozinho
                                            ("Em Produção" num evento que
                                            acabou). */}
                                        {selo && !isDeleted && (
                                          <span
                                            title={selo.hintPeca}
                                            data-testid={`selo-peca-${item.id}`}
                                            style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" }}
                                          >
                                            {selo.labelPeca}
                                          </span>
                                        )}
                                        {isDeleted && item.deletedAt && (
                                          <span style={{ fontSize: 10, color: "#746e69" }}>
                                            {format(new Date(item.deletedAt), "dd/MM/yyyy", { locale: ptBR })}
                                          </span>
                                        )}
                                      </div>
                                      {/* Row 4: sponsors */}
                                      {!isDeleted && item.sponsors && item.sponsors.length > 0 && (
                                        <div style={{ minWidth: 0, overflow: "hidden" }}>
                                          <SponsorChips sponsors={item.sponsors} variant="colored" size="sm" max={2} />
                                        </div>
                                      )}
                                    </div>
                                    {/* Action buttons — compact on mobile */}
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                                      {isDeleted && (isAdmin ? (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setRestoringItemId(item.id); restoreItemMutation.mutate(item.id); }}
                                          disabled={restoreItemMutation.isPending}
                                          title="Restaurar peça" aria-label="Restaurar peça"
                                          data-testid={`button-restore-${item.id}`}
                                          style={{ background: "#d1fae5", border: "1px solid #6ee7b7", cursor: restoreItemMutation.isPending ? "not-allowed" : "pointer", borderRadius: 6, color: "#065f46", display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, opacity: restoreItemMutation.isPending ? 0.6 : 1 }}
                                        >
                                          {restoringItemId === item.id
                                            ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
                                            : <RotateCcw style={{ width: 15, height: 15 }} />}
                                        </button>
                                      ) : (
                                        // solicitacao ENXERGA a lixeira (o servidor libera o GET)
                                        // mas não pode restaurar: sem este botão a pessoa achava a
                                        // peça que apagou por engano e não descobria nem que existe
                                        // caminho de volta, nem a quem pedir.
                                        <button
                                          type="button" disabled aria-disabled="true"
                                          title="Só um administrador pode restaurar peças excluídas"
                                          aria-label="Só um administrador pode restaurar peças excluídas"
                                          style={{ background: "none", border: "1px solid #e7e5e4", borderRadius: 6, color: "#a8a29e", display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, cursor: "not-allowed" }}
                                        >
                                          <RotateCcw style={{ width: 15, height: 15 }} />
                                        </button>
                                      ))}
                                      {!isDeleted && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                                          aria-label="Ver detalhes da peça" title="Ver detalhes" data-testid={`button-view-${item.id}`}
                                          style={{
                                            background: "none", border: "1px solid #e7e5e4", cursor: "pointer",
                                            borderRadius: 6, color: "#746e69",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            height: 44, width: 44,
                                          }}
                                        >
                                          <Eye style={{ width: 15, height: 15 }} />
                                        </button>
                                      )}
                                      {!isDeleted && canDeleteAny && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmItemId(item.id); }}
                                          data-testid={`button-delete-${item.id}`}
                                          title="Excluir peça" aria-label="Excluir peça"
                                          style={{
                                            background: "none", border: "1px solid #fecaca", cursor: "pointer",
                                            borderRadius: 6, color: "#746e69",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            height: 44, width: 44,
                                          }}
                                        >
                                          <Trash2 style={{ width: 14, height: 14 }} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </Fragment>
                          ))}
                        </Fragment>
                      ));
                    })()}
                    {hiddenCount > 0 && (
                      <button
                        onClick={() => expandEvent(eventKey)}
                        data-testid={`button-show-all-${eventKey}`}
                        style={{ width: "100%", padding: "13px", marginTop: 4, background: "#fafaf9", border: "1px solid #e7e5e4", borderRadius: 8, color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                      >
                        Mostrar todas as {gd.items.length} peças (+{hiddenCount})
                      </button>
                    )}
                  </div>
                ) : (
                /* overflow visível (não auto): qualquer scroll-container entre o
                   th e o scroll da página quebraria o sticky do cabeçalho. O
                   desktop comporta a tabela; larguras menores usam cards. */
                <div style={{ overflow: "visible" }}>
                  {/* table-layout: fixed + colgroup — com `auto`, a largura
                      mínima de uma coluna é o min-content do conteúdo, então um
                      único campo de texto livre (a observação) esticava a tabela
                      inteira e a página ganhava barra horizontal SILENCIOSA (o
                      overflow-y do SidebarInset faz o overflow-x computar auto).
                      Com fixed, nenhum conteúdo futuro consegue estourar. */}
                  <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                    <caption className="sr-only">Peças do evento {gd.eventName}</caption>
                    <colgroup>
                      <col style={{ width: 40 }} />
                      {isCompact ? (
                        <>
                          <col style={{ width: "27%" }} />
                          <col style={{ width: "40%" }} />
                          <col style={{ width: "17%" }} />
                        </>
                      ) : (
                        <>
                          <col style={{ width: "15%" }} />
                          <col style={{ width: "27%" }} />
                          <col style={{ width: "12%" }} />
                          <col style={{ width: "17%" }} />
                          <col style={{ width: "12%" }} />
                        </>
                      )}
                      <col style={{ width: 96 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        {(() => {
                          const thBase: React.CSSProperties = {
                            /* Sticky: colunas continuam visíveis ao rolar listas
                               longas. bg no th (não no tr) — th sticky sem fundo
                               ficaria transparente sobre as linhas.
                               top = topOffset + EVENT_HEADER_H: encosta exatamente
                               sob o header sticky do evento, que por sua vez está
                               sob a toolbar sticky (altura medida). */
                            position: "sticky", top: topOffset + EVENT_HEADER_H, zIndex: 5,
                            // CABEÇALHO CLARO. Era #1c1917 sólido — e com 38
                            // eventos abertos a tela desenhava 38 barras pretas
                            // de ponta a ponta, o elemento mais pesado do painel
                            // repetido dezenas de vezes. O cabeçalho de tabela
                            // não é conteúdo: é régua. A Arte e o Detalhe do
                            // Evento já usam este tratamento claro.
                            // #57534e sobre #fafaf9 = 6,9:1 ✓ nos 11px.
                            backgroundColor: "#fafaf9",
                            borderBottom: "1px solid #e7e5e4",
                            padding: "11px 20px",
                            fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                            letterSpacing: "0.08em", color: "#57534e",
                            textAlign: "left",
                            whiteSpace: "nowrap",
                          };
                          const seta = (campo: string) => sortBy === campo ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                          const cols: React.ReactNode[] = [
                            <th key="sel" scope="col" style={{ ...thBase, padding: "12px 0 12px 12px" }}>
                              <input
                                type="checkbox"
                                checked={todasSelecionadas}
                                onChange={(e) => toggleSelecaoDoEvento(visibleItems, e.target.checked)}
                                aria-label={`Selecionar as peças visíveis do evento ${gd.eventName}`}
                                data-testid={`checkbox-all-${eventKey}`}
                                style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#c2410c" }}
                              />
                            </th>,
                            <th key="id" scope="col" aria-sort={ariaSort("displayId")} style={thBase}>
                              <span className="pg-sortable" role="button" tabIndex={0} onClick={() => toggleSort("displayId")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("displayId"); } }} title="Ordenar por ID">
                                {isCompact ? "ID / Medidas" : "ID"}{seta("displayId")}
                              </span>
                            </th>,
                            <th key="desc" scope="col" style={thBase}>{isCompact ? "Descrição / Patrocinador" : "Descrição"}</th>,
                          ];
                          if (!isCompact) {
                            cols.push(
                              <th key="med" scope="col" aria-sort={ariaSort("area")} style={thBase}>
                                <span className="pg-sortable" role="button" tabIndex={0} onClick={() => toggleSort("area")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("area"); } }} title="Ordenar por área">
                                  Medidas{seta("area")}
                                </span>
                              </th>,
                              <th key="pat" scope="col" style={thBase}>Patrocinador</th>,
                            );
                          }
                          cols.push(
                            <th key="st" scope="col" aria-sort={ariaSort("status")} style={thBase}>
                              <span className="pg-sortable" role="button" tabIndex={0} onClick={() => toggleSort("status")} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSort("status"); } }} title="Ordenar pela etapa do fluxo">
                                Status{seta("status")}
                              </span>
                            </th>,
                            <th key="ac" scope="col" style={{ ...thBase, textAlign: "right" }}>Ações</th>,
                          );
                          return cols;
                        })()}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Group by Grupo Pai first, then by type within each
                        // group. typeToGroup vem do memo do topo (fonte única).
                        const groupMap: Record<string, Record<string, any[]>> = {};
                        for (const item of visibleItems) {
                          const g = typeToGroup[item.type] || '';
                          if (!groupMap[g]) groupMap[g] = {};
                          if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
                          groupMap[g][item.type].push(item);
                        }
                        const sortedGroups = Object.keys(groupMap).sort((a, b) => {
                          if (a === '') return 1; if (b === '') return -1;
                          return a.localeCompare(b, 'pt-BR');
                        });
                        let globalIdx = 0;
                        return sortedGroups.map(group => (
                          <Fragment key={group || '__nogroup'}>
                            {/* A FAIXA AZUL DO GRUPO PAI SAIU. Eram DUAS linhas
                                inteiras empilhadas para rotular a mesma coisa —
                                uma azul com "2X1" e outra cinza com "2×1 PADRÃO
                                · 10" — em duas famílias de cor que não se
                                repetem em lugar nenhum da tela.
                                O pai virou PREFIXO da linha de tipo. Além de
                                devolver uma linha por grupo, informa mais: antes
                                o pai aparecia uma vez e some ao rolar; agora ele
                                acompanha cada tipo. */}
                            {Object.entries(groupMap[group]).map(([type, typeItems]) => (
                          <Fragment key={type}>
                            {/* ── Type sub-header ── */}
                            <tr>
                              <td colSpan={colCount} style={{
                                padding: "6px 18px 6px 20px",
                                // #f5f5f4 e não #fafaf9: o cabeçalho da tabela
                                // passou a ser claro nesta rodada, e os dois no
                                // mesmo tom viravam a mesma faixa repetida.
                                backgroundColor: "#f5f5f4",
                                borderTop: "1px solid #e7e5e4",
                                borderBottom: "1px solid #e7e5e4",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  {group && (
                                    <>
                                      {/* #746e69 sobre #f5f5f4 = 4,61:1 ✓ nos 11px.
                                          O comentario anterior dizia "#78716c = 4,7:1"
                                          e estava ERRADO: aquele cinza da 4,40 sobre
                                          este fundo e REPROVA AA. Os dois cinzas ficam
                                          a 6 unidades de distancia — indistinguiveis —
                                          entao o que passa substitui o que falha, sem
                                          custo visual nenhum.
                                          O pai vem em peso e cor MENORES que o
                                          tipo: ele é contexto, o tipo é o rótulo. */}
                                      <span style={{
                                        fontSize: 11, fontWeight: 600,
                                        textTransform: "uppercase", letterSpacing: "0.08em",
                                        color: "#746e69",
                                        fontFamily: "'Space Grotesk', sans-serif",
                                      }}>
                                        {group}
                                      </span>
                                      <span aria-hidden="true" style={{ color: "#a8a29e", fontSize: 11 }}>/</span>
                                    </>
                                  )}
                                  <span style={{
                                    fontSize: 11, fontWeight: 800,
                                    textTransform: "uppercase", letterSpacing: "0.08em",
                                    color: "#44403c",
                                    fontFamily: "'Space Grotesk', sans-serif",
                                  }}>
                                    {type}
                                  </span>
                                  <span style={{
                                    fontSize: 10, fontWeight: 800,
                                    color: "#57534e",
                                    backgroundColor: "#e7e5e4",
                                    borderRadius: 999,
                                    padding: "2px 8px",
                                    textTransform: "uppercase", letterSpacing: "0.06em",
                                  }}>
                                    {typeItems.length}
                                  </span>
                                </div>
                              </td>
                            </tr>

                            {/* ── Items within this type ── */}
                            {typeItems.map((item: any) => {
                              const idx = globalIdx++;
                              const isDeleted = !!item.deletedAt;
                              const selecionado = selectedIds.has(item.id);
                              return (
                                <tr
                                  key={item.id}
                                  className="pg-row"
                                  data-zebra={idx % 2 === 1 ? "1" : "0"}
                                  data-deleted={isDeleted ? "1" : "0"}
                                  data-selected={selecionado ? "1" : "0"}
                                  data-testid={`item-row-${item.id}`}
                                  onClick={() => !isDeleted && setSelectedItem(item)}
                                >
                                  {/* Seleção */}
                                  <td style={{ padding: "10px 0 10px 12px" }}>
                                    {!isDeleted && (
                                      <input
                                        type="checkbox"
                                        checked={selecionado}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={() => toggleSelecionado(item.id)}
                                        aria-label={`Selecionar a peça ${item.displayId}`}
                                        data-testid={`checkbox-${item.id}`}
                                        style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#c2410c" }}
                                      />
                                    )}
                                  </td>

                                  {/* ID (+ tipo; + medidas no modo reduzido) */}
                                  <td style={{ padding: "10px 18px 10px 20px", overflow: "hidden" }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                                      <button onClick={e => { e.stopPropagation(); if (!isDeleted) setSelectedItem(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, color: isDeleted ? "#b91c1c" : "#c2410c", fontSize: 13, textDecoration: isDeleted ? "line-through" : "none", textAlign: "left" }}>
                                        {item.displayId}
                                      </button>
                                      {/* O TIPO só existia na linha de sub-header
                                          com colspan, que não é sticky: com 40
                                          "Banner" num evento, rolar deixava a
                                          linha órfã do próprio tipo. */}
                                      <span title={item.type} style={{ fontSize: 10, fontWeight: 600, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {item.type}
                                      </span>
                                      {/* O selo se repete na LINHA, e não só
                                          no cabeçalho do grupo: quem chega por
                                          busca de código, por link direto ou
                                          rolando uma lista longa lê a linha, e
                                          o cabeçalho pode estar 40 linhas
                                          acima. A frase começa em "Evento" —
                                          é a mesma da trilha da ficha (lib/
                                          status, marcoEventoFinalizado), para
                                          que ninguém entenda que foi a PEÇA
                                          que acabou. */}
                                      {/* OS SELOS DEITAM, e não empilham.

                                          Esta célula era uma coluna vertical com
                                          até OITO filhos — ID, tipo, selo do
                                          evento, data de exclusão, medidas,
                                          "Reaproveit.", "Ref. visual" e "Book" —
                                          cada um numa linha própria com gap 4.
                                          Como quase todos são condicionais, a
                                          altura da linha passava a depender de
                                          QUANTOS selos aquela peça tivesse.

                                          Medido em produção, 150 linhas: 55% em
                                          63px e o resto espalhado até 93px. E a
                                          coluna de ID era a única causa — as
                                          outras seis colunas cabem em 24px. A
                                          lista lia irregular porque a identidade
                                          da peça crescia para baixo.

                                          Selo é etiqueta, e etiqueta deita ao lado
                                          da outra. Numa fileira que quebra só
                                          quando precisa, quatro selos ocupam UMA
                                          linha em vez de quatro. */}
                                      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 4, minWidth: 0 }}>
                                      {selo && !isDeleted && (
                                        <span
                                          title={selo.hintPeca}
                                          data-testid={`selo-peca-${item.id}`}
                                          style={{ display: "inline-block", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: selo.text, backgroundColor: selo.bg, border: `1px solid ${selo.border}`, borderRadius: 999, padding: "2px 7px", width: "fit-content", whiteSpace: "nowrap" }}
                                        >
                                          {selo.labelPeca}
                                        </span>
                                      )}
                                      {isDeleted && item.deletedAt && (
                                        <span style={{ fontSize: 10, color: "#746e69" }}>
                                          Excluído {format(new Date(item.deletedAt), "dd/MM/yy", { locale: ptBR })}
                                        </span>
                                      )}
                                      {isCompact && !isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) && (
                                        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#57534e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                          {item.visualWidth && item.visualHeight
                                            ? `VIS ${item.visualWidth} × ${item.visualHeight}`
                                            : `ARQ ${item.fileWidth} × ${item.fileHeight}`}
                                        </span>
                                      )}
                                      {!isDeleted && item.isReuse && (
                                        <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 7px", width: "fit-content" }}>
                                          Reaproveit.
                                        </span>
                                      )}
                                      {!isDeleted && item.referenceUrl && (
                                        <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#2563eb", textDecoration: "none", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "2px 6px", width: "fit-content" }} data-testid={`link-reference-painel-${item.id}`}>
                                          <Paperclip style={{ width: 9, height: 9 }} />
                                          Ref. visual
                                        </a>
                                      )}
                                      {!isDeleted && item.bookUrl && (
                                        <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Abrir book de aprovação (PDF) enviado pela Arte" style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "#6d28d9", textDecoration: "none", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 6, padding: "2px 6px", width: "fit-content" }} data-testid={`link-book-painel-${item.id}`}>
                                          <FileText style={{ width: 9, height: 9 }} />
                                          Book
                                        </a>
                                      )}
                                      </div>
                                    </div>
                                  </td>

                                  {/* Descrição (+ patrocinador no modo reduzido) */}
                                  <td style={{ padding: "10px 18px", overflow: "hidden" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", minWidth: 0 }}>
                                      {item.description ? (
                                        <span title={item.description} style={{ fontSize: 13, color: isDeleted ? "#746e69" : "#44403c", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
                                          {item.description}
                                        </span>
                                      ) : (
                                        <span style={{ color: "#746e69", fontSize: 13 }}>—</span>
                                      )}
                                      {!isDeleted && item.observations && (
                                        /* maxWidth + ellipsis + title: o selo
                                           mostrava a observação INTEIRA com
                                           nowrap e flex-shrink 0. O campo é
                                           texto livre e carrega motivo de
                                           reprovação — parágrafos. O ↩ cru
                                           virou ícone com rótulo. */
                                        <span
                                          title={item.observations}
                                          style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 1, minWidth: 0, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#57534e", backgroundColor: "#f0ede9", border: "1px solid #e2ddd8", borderRadius: 6, padding: "2px 6px" }}
                                        >
                                          <MessageSquare style={{ width: 9, height: 9, flexShrink: 0 }} aria-label="Observação" />
                                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{item.observations}</span>
                                        </span>
                                      )}
                                    </div>
                                    {isCompact && !isDeleted && (
                                      <div style={{ marginTop: 4, minWidth: 0, overflow: "hidden" }}>
                                        <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={3} />
                                      </div>
                                    )}
                                  </td>

                                  {/* Medidas */}
                                  {!isCompact && (
                                    <td style={{ padding: "10px 18px", overflow: "hidden" }}>
                                      {!isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                          {item.visualWidth && item.visualHeight && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", width: 30, flexShrink: 0 }}>VIS</span>
                                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#44403c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {item.visualWidth} × {item.visualHeight}
                                              </span>
                                            </div>
                                          )}
                                          {item.fileWidth && item.fileHeight && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", width: 30, flexShrink: 0 }}>ARQ</span>
                                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#746e69", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {item.fileWidth} × {item.fileHeight}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span style={{ color: "#746e69", fontSize: 13 }}>—</span>
                                      )}
                                    </td>
                                  )}

                                  {/* Patrocinador — na linha excluída a célula ganha "—" em vez
                                      de ficar vazia (leitura de tabela: vazio parece dado faltando). */}
                                  {!isCompact && (
                                    <td style={{ padding: "10px 18px", overflow: "hidden" }}>
                                      {isDeleted
                                        ? <span style={{ color: "#746e69", fontSize: 13 }}>—</span>
                                        : <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={4} />}
                                    </td>
                                  )}

                                  {/* Status */}
                                  <td style={{ padding: "10px 18px", overflow: "hidden" }}>
                                    <StatusPill status={isDeleted ? "deleted" : item.status} />
                                  </td>

                                  {/* Ação */}
                                  <td style={{ padding: "10px 18px", textAlign: "right" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                      {isDeleted && (isAdmin ? (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setRestoringItemId(item.id); restoreItemMutation.mutate(item.id); }}
                                          disabled={restoreItemMutation.isPending}
                                          title="Restaurar peça" aria-label="Restaurar peça"
                                          data-testid={`button-restore-${item.id}`}
                                          style={{ background: "#d1fae5", border: "1px solid #6ee7b7", cursor: restoreItemMutation.isPending ? "not-allowed" : "pointer", borderRadius: 6, color: "#065f46", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, opacity: restoreItemMutation.isPending ? 0.6 : 1 }}
                                        >
                                          {restoringItemId === item.id
                                            ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                                            : <RotateCcw style={{ width: 14, height: 14 }} />}
                                        </button>
                                      ) : (
                                        <button
                                          type="button" disabled aria-disabled="true"
                                          title="Só um administrador pode restaurar peças excluídas"
                                          aria-label="Só um administrador pode restaurar peças excluídas"
                                          style={{ background: "none", border: "none", padding: 4, color: "#a8a29e", display: "flex", alignItems: "center", justifyContent: "center", cursor: "not-allowed" }}
                                        >
                                          <RotateCcw style={{ width: 15, height: 15 }} />
                                        </button>
                                      ))}
                                      {!isDeleted && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setSelectedItem(item); }}
                                          aria-label="Ver detalhes da peça" title="Ver detalhes" data-testid={`button-view-${item.id}`}
                                          style={{
                                            background: "none", border: "none", cursor: "pointer",
                                            padding: 4, borderRadius: 6, color: "#746e69",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            transition: "color 0.15s",
                                          }}
                                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#c2410c")}
                                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#746e69")}
                                        >
                                          <Eye style={{ width: 16, height: 16 }} />
                                        </button>
                                      )}
                                      {!isDeleted && canDeleteAny && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setDeleteConfirmItemId(item.id); }}
                                          data-testid={`button-delete-${item.id}`}
                                          title="Excluir peça" aria-label="Excluir peça"
                                          style={{
                                            background: "none", border: "none", cursor: "pointer",
                                            padding: 4, borderRadius: 6, color: "#746e69",
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                            transition: "color 0.15s",
                                          }}
                                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#dc2626")}
                                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#746e69")}
                                        >
                                          <Trash2 style={{ width: 15, height: 15 }} />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </Fragment>
                            ))}
                          </Fragment>
                        ));
                      })()}
                      {hiddenCount > 0 && (
                        <tr>
                          <td colSpan={colCount} style={{ padding: 0 }}>
                            <button
                              onClick={() => expandEvent(eventKey)}
                              data-testid={`button-show-all-${eventKey}`}
                              style={{ width: "100%", padding: "13px", background: "#fafaf9", border: "none", borderTop: "1px solid #e7e5e4", color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                            >
                              Mostrar todas as {gd.items.length} peças (+{hiddenCount})
                            </button>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            );
          })
        )}
      </section>

      {/* ── Barra de ações em lote ────────────────────────────────────────────
          O ExportPdfDialog já tinha seleção interna, mas ela não conversava com
          a lista: o usuário filtrava fora e re-selecionava dentro. */}
      {selecionadas.length > 0 && (
        <div
          role="region" aria-label="Ações para as peças selecionadas"
          style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 999, backgroundColor: "#1c1917", boxShadow: "0 8px 24px rgba(28,25,23,.28)", flexWrap: "wrap", maxWidth: "94vw" }}
        >
          <span style={{ fontSize: 13, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>
            {selecionadas.length} {selecionadas.length === 1 ? "peça selecionada" : "peças selecionadas"}
          </span>
          <button onClick={() => setShowExportPDFModal(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            <Printer style={{ width: 13, height: 13 }} /> PDF
          </button>
          <button onClick={exportarXlsx} disabled={isExportingXlsx} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            <FileSpreadsheet style={{ width: 13, height: 13 }} /> Excel
          </button>
          <button onClick={copiarIds} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 999, color: "#fff", fontSize: 12, fontWeight: 700, padding: "6px 12px", cursor: "pointer" }}>
            <Copy style={{ width: 13, height: 13 }} /> Copiar IDs
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 700, padding: "6px 8px", cursor: "pointer", textDecoration: "underline" }}>
            Limpar seleção
          </button>
        </div>
      )}

      {/* ── Exportar PDF — mesmo modal da Arte e do Atendimento ── */}
      {/* Exporta o recorte que está na tela (ou a seleção), nunca a base
          inteira, e sem as peças excluídas. Montado só quando aberto — o modal
          roda facetas sobre a lista inteira mesmo fechado. */}
      {showExportPDFModal && (
        <ExportPdfDialog
          open={showExportPDFModal}
          onOpenChange={setShowExportPDFModal}
          items={itensParaExportar}
          title="Peças"
        />
      )}

      {/* ── Item details modal ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        topActions={selectedItem ? (
          /* Fecha o ciclo ver → agir: depois de achar o gargalo, o usuário
             fechava a ficha e fazia o roteamento mental (status → tela) sem
             ajuda nenhuma. O mapa status→tela respeita o papel: quando a
             pessoa não entra na tela, o botão não aparece. */
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {selectedItem.eventId && (
              <Link
                href={`/eventos/${selectedItem.eventId}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1917", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
              >
                <Link2 style={{ width: 13, height: 13, color: "#746e69" }} />
                Abrir evento
              </Link>
            )}
            {(() => {
              // "Continuar em X" leva à FILA de trabalho — e as filas escondem
              // as peças de evento finalizado. Mandar a pessoa para uma tela
              // onde a peça não aparece é o mesmo beco sem saída do botão que
              // só devolve 409: ela vai procurar, não vai achar, e vai concluir
              // que o sistema perdeu a peça. Aqui o atalho vira a explicação.
              //
              // Só o ATALHO muda. O Painel Geral continua listando a peça de
              // propósito (registro não perde o passado) e "Abrir evento" e
              // "Copiar link" seguem valendo — são leitura.
              const motivoFim = motivoEventoFinalizado(selectedItem.event ?? null, todayBusinessMs());
              if (motivoFim) {
                return (
                  <span
                    data-testid="aviso-evento-finalizado-ficha"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 34, padding: "6px 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fafaf9", color: "#57534e", fontSize: 12, fontWeight: 600, maxWidth: 360, lineHeight: 1.4 }}
                  >
                    <Lock style={{ width: 13, height: 13, flexShrink: 0, color: "#746e69" }} />
                    {motivoFim === "encerrado"
                      ? "Evento encerrado — esta peça não avança no fluxo. Reabra o evento para voltar a trabalhar nela."
                      : "Evento já realizado — esta peça não avança no fluxo. Conferência e entrega seguem liberadas na Gráfica."}
                  </span>
                );
              }
              const tela = proximaTelaDoStatus(selectedItem.status, user?.role);
              if (!tela) return null;
              return (
                <Link
                  href={tela.path}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #fed7aa", background: "#fff7ed", color: "#c2410c", fontSize: 12, fontWeight: 800, textDecoration: "none" }}
                >
                  <ArrowUpRight style={{ width: 13, height: 13 }} />
                  Continuar em {tela.label}
                </Link>
              );
            })()}
            <button
              onClick={() => copiarLinkDaPeca(selectedItem)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#1c1917", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              <Copy style={{ width: 13, height: 13, color: "#746e69" }} />
              Copiar link da peça
            </button>
          </div>
        ) : undefined}
        customActions={temBlocoDeComplemento(selectedItem, false, false) ? (
          <ComplementoDaFicha
            item={selectedItem}
            canEditLists={false}
            onAbrirPeca={(id) => {
              const alvo = (items as any[]).find((i: any) => i.id === id);
              if (alvo) setSelectedItem(alvo);
            }}
          />
        ) : undefined}
      />

      {/* ── Delete confirmation (Admin ou Solicitação, em qualquer status) ── */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* O texto antigo ("permanece no histórico de auditoria")
                  descrevia o LOG, não a peça — e escondia que a ação é
                  reversível. O que acontece é soft delete, com rota de restore. */}
              {deleteConfirmItemId && (() => {
                const item = items.find((i: any) => i.id === deleteConfirmItemId);
                const alvo = item ? `A peça "${item.displayId} — ${item.type}"` : "A peça";
                return `${alvo} vai para a lixeira. Ela some das listagens, mas um administrador pode restaurá-la a qualquer momento.`;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItemMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              // preventDefault: o AlertDialogAction fecha o diálogo no clique;
              // fechado, o "Excluindo..." nunca aparecia. Quem fecha agora é o
              // onSuccess da mutação (setDeleteConfirmItemId(null)).
              onClick={(e) => {
                e.preventDefault();
                if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
              }}
              disabled={deleteItemMutation.isPending}
              style={{ backgroundColor: "#dc2626", color: "#fff" }}
              data-testid="button-confirm-delete"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
