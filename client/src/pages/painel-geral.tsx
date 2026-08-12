import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useRef, Fragment, useEffect } from "react";
import { Search, Calendar, Truck, Eye, Paperclip, Trash2, FileText, Printer, RotateCcw, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { FilterSelect } from "@/components/filter-select";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { SponsorChips } from "@/components/sponsor-chips";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStatusMeta, getStatusLabel, PRODUCTION_STATUSES, FINAL_STATUSES } from "@/lib/status";
import type { Event, Sponsor, StandardItem } from "@shared/schema";

// Cores/rótulos de status vêm de lib/status.ts (fonte única) — antes havia um
// STATUS_CONFIG local que divergia do status-badge (mesma peça, cor/nome
// diferentes por tela). Usa o rótulo curto para manter a densidade da tabela.
function StatusPill({ status }: { status: string }) {
  const cfg = getStatusMeta(status);
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "3px 10px",
      backgroundColor: cfg.bg,
      color: cfg.text,
      border: `1px solid ${cfg.border}`,
      borderRadius: 999,
      fontSize: 11, fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />
      {cfg.short}
    </span>
  );
}

// ─── Constantes de módulo — não dependem de estado; hoisted para não serem
// realocadas a cada render. ─────────────────────────────────────────────────

// Gate de exclusão composto a partir das listas canônicas de lib/status.
// O array literal anterior carregava nomes fantasmas ('liberado',
// 'em_producao', 'produzido', 'entregue') que não existem no vocabulário —
// esses gates nunca disparavam. pronto_para_producao é canônico (variação
// gravada pela dispensa da Arte) e fica.
const BLOCKED_DELETE_STATUSES: string[] = [
  "awaiting_submission", "awaiting_approval", "awaiting_final_review",
  "ready_for_production", "pronto_para_producao", "approved",
  ...PRODUCTION_STATUSES, ...FINAL_STATUSES,
];

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

// Opções do dropdown de status, na ordem do fluxo (rótulos via getStatusLabel).
const STATUS_FILTER_VALUES = [
  "requested", "awaiting_linking", "awaiting_submission",
  "awaiting_approval", "awaiting_finalization", "awaiting_final_review",
  "ready_for_production", "approved", "inProduction", "produced",
  "conferred", "delivered", "canceled",
];

// Altura FIXA do header sticky de evento — o thead sticky usa este valor como
// `top` para encostar exatamente abaixo dele (ver comentários na tabela).
const EVENT_HEADER_H = 62;

const EVENT_TITLE_STYLE: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif",
  fontWeight: 800, fontSize: 15,
  textTransform: "uppercase", letterSpacing: "0.01em",
  color: "#1c1917", margin: 0, lineHeight: 1,
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

// ─── Status card ────────────────────────────────────────────────────────────
// Fora do componente da página de propósito: definido inline, era recriado a
// cada render e os 13 cards remontavam (perdendo até a transição CSS) a cada
// tecla digitada na busca. Recebe tudo por props.
function StatusCard({
  label, value, dot, color, filterKey, sub, isActive, onToggle,
}: {
  label: string; value: number; dot: string; color: string;
  filterKey: string; sub?: string; isActive: boolean; onToggle: () => void;
}) {
  // Cards zerados são informação de baixo valor no escaneamento ("onde está
  // o gargalo?") — ficam esmaecidos, mas continuam clicáveis/filtráveis.
  const isZero = value === 0 && !isActive;
  const undim = (el: HTMLDivElement) => { if (isZero) el.style.opacity = "1"; };
  const redim = (el: HTMLDivElement) => { if (isZero) el.style.opacity = "0.75"; };
  // Os cartões são o filtro por status desta tela. Como div com onClick,
  // filtrar era exclusivamente com mouse — e só a cor dizia qual estava
  // ativo, coisa que aria-pressed comunica a quem não a vê.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isActive}
      aria-label={`Filtrar por ${label}, ${value} ${value === 1 ? "peça" : "peças"}`}
      onClick={onToggle}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      data-testid={`stat-card-${filterKey}`}
      style={{
        position: "relative", overflow: "hidden",
        background: isActive ? `linear-gradient(135deg, ${color}18 0%, #ffffff 72%)` : "#ffffff",
        border: `1px solid ${isActive ? color : "#e7e5e4"}`,
        borderLeft: `4px solid ${isActive ? color : `${dot}90`}`,
        borderRadius: 12,
        padding: "14px 15px 13px 14px", minHeight: 102,
        display: "flex", flexDirection: "column", justifyContent: "space-between",
        cursor: "pointer",
        boxShadow: isActive ? `0 0 0 2px ${color}30, 0 5px 12px ${color}18` : "0 1px 2px rgba(28,25,23,.04)",
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
        <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot, boxShadow: `0 0 0 4px ${dot}18` }} />
        {isActive && <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: ".08em", color, textTransform: "uppercase" }}>Filtrado</span>}
      </div>
      <div>
        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: isActive ? color : "#1c1917", lineHeight: 1, margin: 0, letterSpacing: "-.05em" }}>{value}</p>
        <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#746e69", marginTop: 4, lineHeight: 1.2 }}>{label}</p>
        {sub && (
          <p style={{ fontSize: 9, fontWeight: 600, color: "#746e69", marginTop: 2, lineHeight: 1.2 }}>{sub}</p>
        )}
      </div>
    </div>
  );
}

// ─── Chip de filtro ativo (removível) — linha abaixo da toolbar ─────────────
function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
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
        style={{ background: "none", border: "none", cursor: "pointer", color: "#746e69", fontSize: 13, fontWeight: 800, padding: "0 2px", lineHeight: 1, display: "flex", alignItems: "center", flexShrink: 0 }}
      >
        ×
      </button>
    </span>
  );
}

export default function PainelGeral() {
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  // Exclusão: admin pode sempre; solicitação apenas antes de a peça chegar na Arte
  // (mesma regra do event-detail.tsx — mantém os dois em sincronia).
  const canDeleteAny = isAdmin || user?.role === "solicitacao";
  const canDeleteItem = (status: string) => isAdmin || !BLOCKED_DELETE_STATUSES.includes(status);

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

  // Mantém a URL espelhando os filtros (replaceState: não polui o histórico).
  useEffect(() => {
    const p = new URLSearchParams();
    if (searchTerm) p.set("busca", searchTerm);
    if (statusFilter.length) p.set("status", statusFilter.join(","));
    if (eventFilter.length) p.set("evento", eventFilter.join(","));
    if (sponsorFilter.length) p.set("patrocinador", sponsorFilter.join(","));
    if (typeFilter.length) p.set("tipo", typeFilter.join(","));
    if (dateFilter.length) p.set("saida", dateFilter.join(","));
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter]);

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

  // Renderização incremental: cada evento mostra até ROW_CAP linhas; o resto
  // aparece sob demanda ("Mostrar todos"). Mantém o DOM pequeno com milhares
  // de itens sem a fragilidade de virtualizar uma <table> com grupos/colspan.
  const ROW_CAP = 50;
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const expandEvent = (key: string) =>
    setExpandedEvents(prev => { const next = new Set(prev); next.add(key); return next; });
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);
  // Feedback do restaurar: guarda o id em restauração para trocar o ícone
  // daquele botão por um spinner (os outros só ficam desabilitados).
  const [restoringItemId, setRestoringItemId] = useState<string | null>(null);
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const isMobile = useIsMobile();
  // Sem placeholderData: no TanStack v5 ele zera o isLoading e o spinner nunca
  // aparece — o usuário via "Nenhum item" e KPIs zerados durante o carregamento.
  const { data: items = [], isLoading, isError, refetch } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [] }           = useQuery<Event[]>({ queryKey: ["/api/events"], placeholderData: [] });
  const { data: sponsors = [] }         = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"], placeholderData: [] });
  const { data: standardItems = [] }    = useQuery<StandardItem[]>({ queryKey: ["/api/standard-items"], placeholderData: [] });

  // Audit log SÓ da peça aberta no modal, buscado sob demanda. Antes a página
  // baixava /api/audit-logs INTEIRO no load (tabela que só cresce — em 1 ano,
  // megabytes por visita) apenas para alimentar o ItemDetailsDialog. O modal
  // filtra por entityId internamente, então receber o subconjunto é compatível.
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.json()),
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
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Peça restaurada", description: "Ela voltou às listagens com o status que tinha." });
    },
    onError: (error: any) => toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" }),
    onSettled: () => setRestoringItemId(null),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      toast({ title: "Peça excluída", description: "A peça foi removida com sucesso." });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  const uniqueTypes = useMemo(
    () => Array.from(new Set(items.map((i: any) => i.type))).sort(),
    [items],
  );

  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Filtragem, ordenação, agrupamento e KPIs são recomputados SÓ quando os
  // dados ou filtros mudam — sem o useMemo, cada render (ex.: abrir um modal)
  // refazia filter+sort da lista inteira.
  const { statsItems, filteredItems, sortedGroupEntries, stats } = useMemo(() => {
  // Hoje à meia-noite — calculado UMA vez por recomputação (antes era um
  // new Date por item dentro do filtro).
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  const applyBaseFilters = (item: any) => {
    const matchesSearch =
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.event?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.description || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent   = eventFilter.length === 0   || eventFilter.includes(item.eventId);
    const matchesType    = typeFilter.length === 0    || typeFilter.includes(item.type);
    const matchesSponsor = sponsorFilter.length === 0 ||
      (item.sponsors && Array.isArray(item.sponsors) && item.sponsors.some((s: any) => sponsorFilter.includes(s.id)));
    const matchesDate = dateFilter.length === 0 || (() => {
      // Âncora: SAÍDA DO CAMINHÃO (decisão de negócio) — é o prazo operacional
      // que os chips e alertas usam. Antes filtrava pelo início do evento, que
      // podia dizer "no prazo" com o caminhão já atrasado.
      // Itens sem data não são descartados em silêncio: têm opção própria.
      if (!item.event?.truckDepartureDate) return dateFilter.includes("no_departure");
      // toUTCDisplayDate: mesma conversão usada na EXIBIÇÃO da saída no header
      // do evento — com new Date() local, um fuso atrás do UTC classificava
      // "sai hoje" no dia errado.
      const truckDate = toUTCDisplayDate(item.event.truckDepartureDate); truckDate.setHours(0, 0, 0, 0);
      const diff = Math.ceil((truckDate.getTime() - todayMs) / 86400000);
      return dateFilter.some(df => df === "no_departure" ? false : (DATE_RANGE_MAP[df] ? DATE_RANGE_MAP[df](diff) : true));
    })();
    return matchesSearch && matchesEvent && matchesType && matchesSponsor && matchesDate;
  };

  const matchesStatus = (item: any, f: string[]) => {
    const isDeleted = !!item.deletedAt;
    // Itens excluídos só aparecem quando o filtro "deleted" está ativo.
    if (isDeleted) return f.includes("deleted");
    // Itens normais nunca aparecem quando só "deleted" está selecionado —
    // com "Excluídos" como único filtro, a lista mostra SÓ os excluídos.
    const activeFilters = f.filter(x => x !== "deleted");
    if (activeFilters.length === 0) return !f.includes("deleted");
    const map: Record<string, string[]> = {
      requested:             ["draft", "requested"],
      awaiting_approval:     ["awaiting_approval", "awaiting_sponsor_approval"],
      awaiting_finalization: ["awaiting_finalization", "sponsor_approved", "awaiting_creator_review"],
      awaiting_final_review: ["awaiting_final_review"],
      ready_for_production:  ["ready_for_production", "pronto_para_producao"],
    };
    // approved e canceled não precisam de entrada no map: o fallback
    // (item.status === fv) cobre os dois.
    return activeFilters.some(fv => map[fv] ? map[fv].includes(item.status) : item.status === fv);
  };

  // Quando o filtro "Excluídos" está ativo, mescla as peças soft-deleted na lista de exibição.
  const allDisplayItems = showDeleted ? [...items, ...(deletedItems as any[])] : items;

  const statsItems    = items.filter(applyBaseFilters);
  const filteredItems = allDisplayItems
    .filter(applyBaseFilters)
    .filter((i) => matchesStatus(i, statusFilter))
    .sort((a, b) => {
      // Itens excluídos ficam no final
      if (!!a.deletedAt !== !!b.deletedAt) return a.deletedAt ? 1 : -1;
      const gA = typeToGroup[a.type] || '', gB = typeToGroup[b.type] || '';
      if (gA !== gB) return gA.localeCompare(gB, 'pt-BR');
      const idA = parseInt(String(a.displayId || '0').replace(/\D/g, '')) || 0;
      const idB = parseInt(String(b.displayId || '0').replace(/\D/g, '')) || 0;
      return idA - idB;
    });

  const groupedItems = filteredItems.reduce((acc, item) => {
    const k = item.eventId || "no-event";
    if (!acc[k]) acc[k] = { eventId: item.eventId, eventName: item.event?.name || "Sem Evento", items: [] };
    acc[k].items.push(item);
    return acc;
  }, {} as Record<string, { eventId: string | null; eventName: string; items: any[] }>);

  // KPIs num único passe pela lista — eram 14 filter() (14 varreduras).
  // `drafts` continua separado: subtexto do card "Solicitado" — sem ele, o
  // card somava draft+requested sem indicação e o usuário via pills
  // "Rascunho" que não batiam com nenhum card.
  const stats = statsItems.reduce(
    (acc, i: any) => {
      acc.total++;
      switch (i.status) {
        case "draft": acc.drafts++; acc.requested++; break;
        case "requested": acc.requested++; break;
        case "awaiting_linking": acc.awaitingLinking++; break;
        case "awaiting_submission": acc.awaitingSubmission++; break;
        case "awaiting_approval": case "awaiting_sponsor_approval": acc.awaitingApproval++; break;
        case "awaiting_finalization": case "sponsor_approved": case "awaiting_creator_review": acc.awaitingFinalization++; break;
        case "awaiting_final_review": acc.awaitingFinalReview++; break;
        case "ready_for_production": case "pronto_para_producao": acc.readyForProduction++; break;
        case "approved": acc.approved++; break;
        case "inProduction": acc.inProduction++; break;
        case "produced": acc.produced++; break;
        case "conferred": acc.conferred++; break;
        case "delivered": acc.delivered++; break;
        case "canceled": acc.canceled++; break;
      }
      return acc;
    },
    {
      total: 0, requested: 0, drafts: 0, awaitingLinking: 0, awaitingSubmission: 0,
      awaitingApproval: 0, awaitingFinalization: 0, awaitingFinalReview: 0,
      readyForProduction: 0, approved: 0, inProduction: 0, produced: 0,
      conferred: 0, delivered: 0, canceled: 0,
    },
  );

  // Grupos ordenados pela saída do caminhão (ascendente; sem data por último;
  // empate/sem data desempata pelo nome) — Object.entries herdava a ordem de
  // inserção, arbitrária para o usuário.
  type EventGroup = { eventId: string | null; eventName: string; items: any[] };
  const sortedGroupEntries = (Object.entries(groupedItems) as Array<[string, EventGroup]>).sort(([, a], [, b]) => {
    const da = a.items[0]?.event?.truckDepartureDate;
    const db = b.items[0]?.event?.truckDepartureDate;
    if (!da && !db) return a.eventName.localeCompare(b.eventName, "pt-BR");
    if (!da) return 1;
    if (!db) return -1;
    const diff = new Date(da).getTime() - new Date(db).getTime();
    return diff !== 0 ? diff : a.eventName.localeCompare(b.eventName, "pt-BR");
  });

  return { statsItems, filteredItems, sortedGroupEntries, stats };
  }, [items, deletedItems, showDeleted, searchTerm, statusFilter, eventFilter, sponsorFilter, typeFilter, dateFilter, typeToGroup]);

  // Clique no card alterna o status DENTRO do conjunto de filtros — coerente
  // com o dropdown multi-seleção. Antes o clique descartava a seleção inteira
  // e ficava impossível combinar dois status pelos cards.
  const toggleStatusCard = (filterKey: string) =>
    setStatusFilter(prev => prev.includes(filterKey) ? prev.filter(s => s !== filterKey) : [...prev, filterKey]);

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

  const hasActiveFilters = statusFilter.length > 0 || eventFilter.length > 0 || sponsorFilter.length > 0 || typeFilter.length > 0 || dateFilter.length > 0 || searchTerm.length > 0;
  const clearAllFilters = () => { setStatusFilter([]); setEventFilter([]); setSponsorFilter([]); setTypeFilter([]); setDateFilter([]); setSearchTerm(""); setSearchInput(""); };


  return (
    // SEM overflowY aqui: quem rola é o <main> do layout. Um overflow:auto
    // neste wrapper criava um scroll-container que NÃO rola (min-height 100%)
    // e prendia todo position:sticky descendente — o thead da tabela e a
    // própria barra de gradiente abaixo nunca grudavam no topo.
    <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 22, padding: isMobile ? "0 12px 20px" : "0 28px 34px", minHeight: "100%", background: "#fafaf9" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 4, height: 4, margin: isMobile ? "0 -12px" : "0 -28px", background: "linear-gradient(90deg, #1c1917 0%, #1c1917 72%, #f97316 72%, #f97316 100%)" }} />

      {/* ── Header ── */}
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16, paddingTop: 22, paddingBottom: 2 }}>
        <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minWidth: 0 }}>
          <h1
            data-testid="title-painel-geral"
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
               fontSize: isMobile ? 20 : 29, fontWeight: 700, letterSpacing: "-0.055em",
              textTransform: "uppercase", color: "#1c1917", margin: 0,
            }}
          >
            Painel de Status Geral
          </h1>
          <p style={{ fontSize: 13, color: "#746e69", fontWeight: 500, margin: "4px 0 0 0", display: isMobile ? "none" : "block" }}>
            Acompanhamento em tempo real de todos os itens em produção
          </p>
        </div>
        <button
          onClick={() => setShowExportPDFModal(true)}
          data-testid="button-export-pdf-painel"
           style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: isMobile ? 44 : 40, minWidth: isMobile ? 44 : undefined, padding: isMobile ? "0 12px" : "0 16px", borderRadius: 8, backgroundColor: "#1c1917", border: "1px solid #1c1917", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 0 #f97316" }}
        >
          <Printer style={{ width: 14, height: 14 }} />
          {!isMobile && "Exportar PDF"}
        </button>
      </header>

      {/* ── Status cards — agrupados nas 3 fases do fluxo ─────────────────
          12 cards iguais obrigavam o usuário a escanear um a um para achar o
          gargalo. As zonas (Entrada → Aprovação → Produção) contam a história
          do fluxo e a largura dos cards por zona cria ritmo visual. ── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
       {/* Desktop: Entrada (3) + Aprovação (4) lado a lado; Produção (5) na
           linha de baixo em largura total — mantém ~2 linhas de cards com
           largura confortável. Mobile: zonas empilhadas. */}
       <div style={{ display: isMobile ? "flex" : "grid", flexDirection: "column", gridTemplateColumns: "3fr 4fr", gap: isMobile ? 12 : 14 }}>

        {/* ZONA 1 — Entrada */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", paddingLeft: 2 }}>Entrada</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, flex: 1 }}>

        {/* Total card — dark */}
        <div
          role="button"
          tabIndex={0}
          aria-pressed={statusFilter.length === 0}
          aria-label="Mostrar todos os status"
          onClick={() => setStatusFilter([])}
          onKeyDown={e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStatusFilter([]); }
          }}
          data-testid="stat-total"
          style={{
             background: "linear-gradient(145deg, #292522, #1c1917)",
             border: `1px solid ${statusFilter.length === 0 ? "#f97316" : "#3b3531"}`,
            borderBottom: "3px solid #f97316",
             borderRadius: 12,
             padding: "14px 15px", minHeight: 102,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
            cursor: "pointer",
             boxShadow: statusFilter.length === 0 ? "0 0 0 2px rgba(249,115,22,.22), 0 5px 12px rgba(28,25,23,.16)" : "0 2px 5px rgba(28,25,23,.12)",
             transform: statusFilter.length === 0 ? "translateY(1px)" : "none",
          }}
        >
           <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>{statusFilter.length === 0 && <span style={{ fontSize: 10, color: "#f97316", fontWeight: 900, letterSpacing: ".08em" }}>BASELINE</span>}</div>
          <div>
             <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 26, fontWeight: 700, color: "#f97316", lineHeight: 1, margin: 0, letterSpacing: "-.05em" }}>{stats.total}</p>
            <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.2 }}>Total</p>
            {stats.canceled > 0 && (
              <p style={{ fontSize: 9, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginTop: 2, lineHeight: 1.2 }}>
                inclui {stats.canceled} cancelado{stats.canceled > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Rótulos e cores derivam de lib/status.ts (fonte única);
            dot = tom saturado, color = tom escuro AA. */}
        {([
          ["requested",        stats.requested],
          ["awaiting_linking", stats.awaitingLinking],
        ] as Array<[string, number]>).map(([key, value]) => {
          const m = getStatusMeta(key);
          return (
            <StatusCard
              key={key} label={m.short} value={value} dot={m.dot} color={m.text} filterKey={key}
              isActive={statusFilter.includes(key)} onToggle={() => toggleStatusCard(key)}
              sub={key === "requested" && stats.drafts > 0 ? `inclui ${stats.drafts} rascunho${stats.drafts > 1 ? "s" : ""}` : undefined}
            />
          );
        })}
          </div>
        </div>

        {/* ZONA 2 — Aprovação */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", paddingLeft: 2 }}>Aprovação</span>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, flex: 1 }}>
            {([
              ["awaiting_submission",  stats.awaitingSubmission],
              ["awaiting_approval",    stats.awaitingApproval],
              ["awaiting_finalization",stats.awaitingFinalization],
              ["awaiting_final_review",stats.awaitingFinalReview],
            ] as Array<[string, number]>).map(([key, value]) => {
              const m = getStatusMeta(key);
              return <StatusCard key={key} label={m.short} value={value} dot={m.dot} color={m.text} filterKey={key} isActive={statusFilter.includes(key)} onToggle={() => toggleStatusCard(key)} />;
            })}
          </div>
        </div>

        {/* ZONA 3 — Produção & Entrega (linha inteira no desktop) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, ...(!isMobile && { gridColumn: "1 / -1" }) }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", paddingLeft: 2 }}>Produção &amp; Entrega</span>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3,1fr)" : "repeat(6,1fr)", gap: 10, flex: 1 }}>
            {([
              ["ready_for_production", stats.readyForProduction],
              // "Liberado" (approved): a etapa entre Pronto p/ Produção e Em
              // Produção — o KPI existia e não aparecia em card nenhum.
              ["approved",             stats.approved],
              ["inProduction",         stats.inProduction],
              ["produced",             stats.produced],
              ["conferred",            stats.conferred],
              ["delivered",            stats.delivered],
            ] as Array<[string, number]>).map(([key, value]) => {
              const m = getStatusMeta(key);
              return <StatusCard key={key} label={m.short} value={value} dot={m.dot} color={m.text} filterKey={key} isActive={statusFilter.includes(key)} onToggle={() => toggleStatusCard(key)} />;
            })}
          </div>
        </div>

       </div>
      </section>

      {/* ── Filter toolbar ── */}
      <div style={{
        // flexWrap também no desktop: em janelas médias (~1100px) os seis
        // controles estouravam a linha e o contador sumia da tela.
        display: "flex", alignItems: isMobile ? "stretch" : "center", flexWrap: "wrap", gap: 8,
        backgroundColor: "#ffffff",
        borderRadius: 8,
        border: "1px solid #e7e5e4",
        padding: "8px 10px",
        boxShadow: "0 1px 3px rgba(28,25,23,0.05)",
      }}>
        {/* Search — full width row on mobile */}
        <div style={{ position: "relative", flexShrink: 0, width: isMobile ? "100%" : 180 }}>
          <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#a8a29e", pointerEvents: "none" }} />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar ID, evento..."
            title="Atalho: pressione / para focar a busca"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="input-search"
            style={{ ...inputStyle, paddingLeft: 28, height: 32, fontSize: 13 }}
          />
        </div>

        {/* Divider — hidden on mobile */}
        {!isMobile && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {/* Evento */}
        <div style={{ flexShrink: 1, minWidth: 120, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={setEventFilter}
            options={(() => {
              const P: Record<string,number> = { urgente:0, alta:1, media:2, baixa:3 };
              const C: Record<string,string> = { urgente:'#ef4444', alta:'#f97316', media:'#eab308', baixa:'#3b82f6' };
              return [...events].sort((a,b) => { const pa=P[a.priority ?? '']??4,pb=P[b.priority ?? '']??4; return pa!==pb?pa-pb:a.name.localeCompare(b.name,'pt-BR'); }).map((e) => ({ value: e.id, label: e.name, dotColor: C[e.priority ?? ''] }));
            })()}
          />
        </div>

        {/* Tipo */}
        <div style={{ flexShrink: 1, minWidth: 110, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <FilterSelect
            label="Tipo" allLabel="Todos os tipos"
            values={typeFilter} onValuesChange={setTypeFilter}
            hideWhenEmpty={false}
            options={uniqueTypes.map((t: string) => ({ value: t, label: t }))}
            testId="select-type-filter"
            fullWidth
          />
        </div>

        {/* Patrocinador */}
        <div style={{ flex: 1, flexShrink: 1, minWidth: 130, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          <FilterSelect
            label="Patrocinador" allLabel="Todos os patrocinadores"
            values={sponsorFilter} onValuesChange={setSponsorFilter}
            hideWhenEmpty={false}
            options={sponsors.map((s) => ({ value: s.id, label: s.name }))}
            testId="select-sponsor-filter"
            fullWidth
          />
        </div>

        {/* Status */}
        <div style={{ flexShrink: 1, minWidth: 120, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
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
        <div style={{ flexShrink: 1, minWidth: 110, ...(isMobile && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
          {/* O critério é a SAÍDA DO CAMINHÃO — a âncora operacional dos
              prazos (mesma dos chips e dos alertas), confirmada pelo negócio. */}
          <FilterSelect
            label="Saída do caminhão" allLabel="Saída: qualquer data"
            values={dateFilter} onValuesChange={setDateFilter}
            hideWhenEmpty={false}
            options={DATE_FILTER_VALUES.map((value) => ({ value, label: DATE_FILTER_LABELS[value], pinned: true }))}
            testId="select-date-filter"
            fullWidth
          />
        </div>

        {/* Divider — hidden on mobile */}
        {!isMobile && <div style={{ width: 1, height: 20, backgroundColor: "#e7e5e4", flexShrink: 0 }} />}

        {/* Counter + clear */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, ...(isMobile && { width: "100%" }) }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 13, fontWeight: 700, color: "#746e69", whiteSpace: "nowrap" }}>
            <span style={{ color: "#1c1917", fontWeight: 900 }}>{filteredItems.length}</span>
            {" "}{filteredItems.length === 1 ? "item" : "itens"}
          </span>
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              style={{ display: "flex", alignItems: "center", gap: 4, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#f97316", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap", height: 32 }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#f97316"; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#fff7ed"; (e.currentTarget as HTMLButtonElement).style.color = "#f97316"; }}
            >
              × Limpar
            </button>
          )}
        </div>
      </div>

      {/* ── Chips dos filtros ativos — a seleção inteira num relance, cada
          filtro removível individualmente sem reabrir dropdown por dropdown.
          O "× Limpar" da toolbar continua sendo o limpa-tudo. ── */}
      {hasActiveFilters && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: -12 }}>
          {searchTerm && (
            <FilterChip label={`Busca: "${searchTerm}"`} onRemove={() => { setSearchInput(""); setSearchTerm(""); }} />
          )}
          {eventFilter.map(id => (
            <FilterChip key={`ev-${id}`} label={`Evento: ${events.find(e => e.id === id)?.name ?? id}`} onRemove={() => setEventFilter(prev => prev.filter(v => v !== id))} />
          ))}
          {typeFilter.map(t => (
            <FilterChip key={`tp-${t}`} label={`Tipo: ${t}`} onRemove={() => setTypeFilter(prev => prev.filter(v => v !== t))} />
          ))}
          {sponsorFilter.map(id => (
            <FilterChip key={`sp-${id}`} label={`Patrocinador: ${sponsors.find(s => s.id === id)?.name ?? id}`} onRemove={() => setSponsorFilter(prev => prev.filter(v => v !== id))} />
          ))}
          {statusFilter.map(s => (
            <FilterChip key={`st-${s}`} label={`Status: ${s === "deleted" ? "Excluídos" : getStatusLabel(s)}`} onRemove={() => setStatusFilter(prev => prev.filter(v => v !== s))} />
          ))}
          {dateFilter.map(d => (
            <FilterChip key={`dt-${d}`} label={`Saída: ${DATE_FILTER_LABELS[d] ?? d}`} onRemove={() => setDateFilter(prev => prev.filter(v => v !== d))} />
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
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, overflow: "hidden" }} aria-busy="true" aria-label="Carregando itens">
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
            <p style={{ color: "#b91c1c", fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>Não foi possível carregar os itens</p>
            <p style={{ color: "#746e69", fontSize: 13, margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filteredItems.length === 0 ? (
          /* Empty state com contexto e ação: diz POR QUE está vazio (filtros
             ativos vs sistema sem itens) e oferece o caminho de volta ali
             mesmo, sem obrigar o usuário a achar o "× Limpar" na toolbar. */
          <div style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, padding: "56px 24px", textAlign: "center" }}>
            <Search style={{ width: 28, height: 28, color: "#d6d3d1", margin: "0 auto 12px" }} />
            <p style={{ color: "#1c1917", fontSize: 15, fontWeight: 700, margin: "0 0 4px" }}>
              {hasActiveFilters ? "Nenhum item encontrado" : "Nenhum item cadastrado ainda"}
            </p>
            <p style={{ color: "#746e69", fontSize: 13, margin: "0 0 16px" }}>
              {hasActiveFilters
                ? "Nenhum item corresponde aos filtros ativos. Ajuste a busca ou limpe os filtros."
                : "Os itens aparecem aqui quando forem adicionados a um evento."}
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          sortedGroupEntries.map(([eventKey, eventData]) => {
            const gd = eventData as { eventId: string | null; eventName: string; items: any[] };
            const firstItem = gd.items[0];
            // Renderização incremental: mantém o DOM pequeno em eventos com
            // centenas de itens; o restante entra sob demanda.
            const isExpanded = expandedEvents.has(eventKey);
            const visibleItems = isExpanded || gd.items.length <= ROW_CAP ? gd.items : gd.items.slice(0, ROW_CAP);
            const hiddenCount = gd.items.length - visibleItems.length;
            // Countdown do prazo (mesmo espírito do event-detail): a âncora é
            // a SAÍDA DO CAMINHÃO. Evento cujo início já passou há alguns dias
            // é HISTÓRIA — mostra "Encerrado" neutro em vez de "Atrasado 90d"
            // vermelho, alarme falso que ensina a ignorar o vermelho de verdade.
            const groupEvent = firstItem?.event;
            let deadline: { text: string; color: string } | null = null;
            if (groupEvent?.truckDepartureDate) {
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const truckDay = toUTCDisplayDate(groupEvent.truckDepartureDate); truckDay.setHours(0, 0, 0, 0);
              const diffDays = Math.round((truckDay.getTime() - today.getTime()) / 86400000);
              const isHistorical = groupEvent.startDate
                ? parseDateLocal(String(groupEvent.startDate)).getTime() < today.getTime() - 3 * 86400000
                : false;
              deadline = isHistorical ? { text: "Encerrado", color: "#746e69" }
                : diffDays < 0 ? { text: `Atrasado ${Math.abs(diffDays)}d`, color: "#b91c1c" }
                : diffDays === 0 ? { text: "Sai hoje", color: "#b45309" }
                : { text: `Faltam ${diffDays}d`, color: "#746e69" };
            }
            // overflow: clip (não hidden): clipa o border-radius SEM criar
            // scroll-container — pré-requisito para o thead sticky funcionar
            // contra o scroll da página.
            return (
              <div key={eventKey} style={{ border: "1px solid #e2e2e2", borderRadius: 12, backgroundColor: "#ffffff", overflow: "clip", boxShadow: "0 2px 8px rgba(28,25,23,0.07)" }}>

                {/* Group header — sticky (top 4 = logo abaixo da barra de
                    gradiente do topo): mantém o contexto do evento visível ao
                    rolar listas longas. zIndex 6 fica ACIMA do thead sticky
                    (5); fundo sólido para as linhas não vazarem por trás.
                    Altura FIXA (EVENT_HEADER_H) — é ela que o thead usa como
                    `top` para encostar exatamente abaixo. Nada aqui cria novo
                    scroll-container (ver comentário na tabela). */}
                <div style={{
                  position: "sticky", top: 4, zIndex: 6,
                  backgroundColor: "#ffffff",
                  borderBottom: "1px solid #e7e5e4",
                  // Altura fixa SÓ no desktop (onde o thead precisa dela p/
                  // calcular o próprio top). Mobile usa cards, sem thead —
                  // altura automática deixa os metadados quebrarem linha.
                  ...(isMobile
                    ? { padding: "13px 18px 13px 20px" }
                    : { padding: "0 18px 0 20px", height: EVENT_HEADER_H, boxSizing: "border-box" as const }),
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
                  borderLeft: "3px solid #f97316",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                    <div style={{ minWidth: 0 }}>
                      {/* Nome do evento navega para o detalhe — era a única
                          menção ao evento na tela sem caminho até ele. */}
                      {gd.eventId ? (
                        <Link
                          href={`/eventos/${gd.eventId}`}
                          onClick={(e) => e.stopPropagation()}
                          title={`Abrir evento ${gd.eventName}`}
                          style={{ textDecoration: "none", display: "block", minWidth: 0 }}
                        >
                          <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
                        </Link>
                      ) : (
                        <h3 style={EVENT_TITLE_STYLE}>{gd.eventName}</h3>
                      )}
                      <div style={{ display: "flex", gap: isMobile ? 10 : 14, marginTop: 5, minWidth: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
                        {firstItem?.event?.startDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#746e69", whiteSpace: "nowrap" }}>
                            <Calendar style={{ width: 11, height: 11, flexShrink: 0 }} />
                            Início: {format(parseDateLocal(firstItem.event.startDate), "dd MMM yyyy", { locale: ptBR })}
                          </span>
                        )}
                        {firstItem?.event?.truckDepartureDate && (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: "#746e69", whiteSpace: "nowrap" }}>
                            <Truck style={{ width: 11, height: 11, flexShrink: 0 }} />
                            Saída: {format(toUTCDisplayDate(firstItem.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        )}
                        {deadline && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: deadline.color, textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                            {deadline.text}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Contador é informação neutra — stone, não laranja: o
                      laranja da marca fica reservado para ação/urgência. */}
                  <span style={{
                    padding: "4px 11px", borderRadius: 999,
                    backgroundColor: "#f5f5f4", color: "#57534e",
                    border: "1px solid #e7e5e4",
                    fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em",
                    whiteSpace: "nowrap",
                  }}>
                    {gd.items.length} {gd.items.length === 1 ? "item" : "itens"}
                  </span>
                </div>

                {/* Table (desktop) / Cards (mobile) */}
                {isMobile ? (
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
                                      {isDeleted && isAdmin && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setRestoringItemId(item.id); restoreItemMutation.mutate(item.id); }}
                                          disabled={restoreItemMutation.isPending}
                                          title="Restaurar peça" aria-label="Restaurar peça"
                                          data-testid={`button-restore-${item.id}`}
                                          style={{ background: "#d1fae5", border: "1px solid #6ee7b7", cursor: "pointer", borderRadius: 6, color: "#065f46", display: "flex", alignItems: "center", justifyContent: "center", height: 44, width: 44, opacity: restoringItemId === item.id ? 0.6 : 1 }}
                                        >
                                          {restoringItemId === item.id
                                            ? <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} />
                                            : <RotateCcw style={{ width: 15, height: 15 }} />}
                                        </button>
                                      )}
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
                                        canDeleteItem(item.status) ? (
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
                                        ) : (
                                          // Botão desabilitado (não span): entra na ordem de
                                          // tabulação do leitor de tela e anuncia o bloqueio.
                                          <button
                                            type="button" disabled aria-disabled="true"
                                            title="Exclusão bloqueada — peça já está em Arte ou produção"
                                            aria-label="Exclusão bloqueada — peça já está em Arte ou produção"
                                            style={{
                                              background: "none", border: "1px solid #e7e5e4", borderRadius: 6, color: "#a8a29e",
                                              display: "flex", alignItems: "center", justifyContent: "center",
                                              height: 44, width: 44, cursor: "not-allowed", padding: 0,
                                            }}
                                          >
                                            <Trash2 style={{ width: 14, height: 14 }} />
                                          </button>
                                        )
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
                        style={{ width: "100%", padding: "13px", marginTop: 4, background: "#fafaf9", border: "1px solid #e7e5e4", borderRadius: 8, color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                      >
                        Mostrar todos os {gd.items.length} itens (+{hiddenCount})
                      </button>
                    )}
                  </div>
                ) : (
                /* overflow visível (não auto): qualquer scroll-container entre o
                   th e o scroll da página quebraria o sticky do cabeçalho. O
                   desktop comporta a tabela; mobile usa o layout de cards. */
                <div style={{ overflow: "visible" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {["ID", "Descrição", "Medidas", "Patrocinador", "Status", "Ações"].map((col, i) => (
                          <th key={i} style={{
                            /* Sticky: colunas continuam visíveis ao rolar listas
                               longas. bg no th (não no tr) — th sticky sem fundo
                               ficaria transparente sobre as linhas.
                               top = EVENT_HEADER_H + 4: encosta exatamente sob o
                               header sticky do evento (altura fixa + barra de
                               gradiente de 4px), sem sobrepor nem deixar vão. */
                            position: "sticky", top: EVENT_HEADER_H + 4, zIndex: 5,
                            backgroundColor: "#1c1917",
                            padding: "12px 20px",
                            fontSize: 11, fontWeight: 900, textTransform: "uppercase",
                            letterSpacing: "0.1em", color: "#ffffff",
                            textAlign: i === 5 ? "right" : "left",
                            whiteSpace: "nowrap",
                          }}>{i === 5 ? <span className="sr-only">{col}</span> : col}</th>
                        ))}
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
                            {/* ── Grupo Pai header (only when group exists) ── */}
                            {group && (
                              <tr>
                                 <td colSpan={6} style={{ padding: "7px 20px", backgroundColor: "#e7f0fb", borderTop: "1px solid #c9ddf5", borderBottom: "1px solid #c9ddf5", borderLeft: "3px solid #3b82f6" }}>
                                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: "#1d4ed8", fontFamily: "'Space Grotesk', sans-serif" }}>
                                    {group}
                                  </span>
                                </td>
                              </tr>
                            )}
                            {Object.entries(groupMap[group]).map(([type, typeItems]) => (
                          <Fragment key={type}>
                            {/* ── Type sub-header ── */}
                            <tr>
                              <td colSpan={6} style={{
                                padding: "6px 18px 6px 20px",
                                backgroundColor: "#fafaf9",
                                borderTop: "2px solid #e7e5e4",
                                borderBottom: "1px solid #e7e5e4",
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
                              return (
                                <Fragment key={item.id}>
                                  <tr
                                    data-testid={`item-row-${item.id}`}
                                    onClick={() => !isDeleted && setSelectedItem(item)}
                                    style={{
                                      borderBottom: "1px solid #f0f0ef",
                                      backgroundColor: isDeleted ? "#fff5f5" : (idx % 2 === 1 ? "#f6f4f1" : "#ffffff"),
                                      borderLeft: `3px solid ${isDeleted ? "#fecaca" : "transparent"}`,
                                      cursor: isDeleted ? "default" : "pointer",
                                      opacity: isDeleted ? 0.75 : 1,
                                      transition: "transform 0.15s, background-color 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                      if (isDeleted) return;
                                      (e.currentTarget as HTMLTableRowElement).style.transform = "translateY(-1px)";
                                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "#fff7ed";
                                      (e.currentTarget as HTMLTableRowElement).style.borderLeftColor = "#f97316";
                                    }}
                                    onMouseLeave={(e) => {
                                      if (isDeleted) return;
                                      (e.currentTarget as HTMLTableRowElement).style.transform = "none";
                                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = idx % 2 === 1 ? "#f6f4f1" : "#ffffff";
                                      (e.currentTarget as HTMLTableRowElement).style.borderLeftColor = "transparent";
                                    }}
                                  >
                                    {/* ID */}
                                    <td style={{ padding: "10px 18px 10px 20px", whiteSpace: "nowrap" }}>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                        <button onClick={e => { e.stopPropagation(); if (!isDeleted) setSelectedItem(item); }} disabled={isDeleted} aria-label={`Ver detalhes da peça ${item.displayId}`} data-testid={`text-display-id-${item.id}`} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "monospace", fontWeight: 700, color: isDeleted ? "#b91c1c" : "#c2410c", fontSize: 13, textDecoration: isDeleted ? "line-through" : "none" }}>
                                          {item.displayId}
                                        </button>
                                        {isDeleted && item.deletedAt && (
                                          <span style={{ fontSize: 10, color: "#746e69" }}>
                                            Excluído {format(new Date(item.deletedAt), "dd/MM/yy", { locale: ptBR })}
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
                                    </td>

                                    {/* Descrição */}
                                    <td style={{ padding: "10px 18px", maxWidth: 260 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                                        {item.description ? (
                                          <span title={item.description} style={{ fontSize: 13, color: isDeleted ? "#746e69" : "#44403c", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0, textDecoration: isDeleted ? "line-through" : "none" }}>
                                            {item.description}
                                          </span>
                                        ) : (
                                          <span style={{ color: "#a8a29e", fontSize: 13 }}>—</span>
                                        )}
                                        {!isDeleted && item.observations && (
                                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "#57534e", backgroundColor: "#f0ede9", border: "1px solid #e2ddd8", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap" }}>
                                            ↩ {item.observations}
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    {/* Medidas */}
                                    <td style={{ padding: "10px 18px", whiteSpace: "nowrap" }}>
                                      {!isDeleted && ((item.visualWidth && item.visualHeight) || (item.fileWidth && item.fileHeight)) ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                          {item.visualWidth && item.visualHeight && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", width: 30 }}>VIS</span>
                                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#44403c" }}>
                                                {item.visualWidth} × {item.visualHeight}
                                              </span>
                                            </div>
                                          )}
                                          {item.fileWidth && item.fileHeight && (
                                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                              <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#746e69", width: 30 }}>ARQ</span>
                                              <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#746e69" }}>
                                                {item.fileWidth} × {item.fileHeight}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span style={{ color: "#a8a29e", fontSize: 13 }}>—</span>
                                      )}
                                    </td>

                                    {/* Patrocinador */}
                                    <td style={{ padding: "10px 18px" }}>
                                      {!isDeleted && <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={4} />}
                                    </td>

                                    {/* Status */}
                                    <td style={{ padding: "10px 18px", whiteSpace: "nowrap" }}>
                                      <StatusPill status={isDeleted ? "deleted" : item.status} />
                                    </td>

                                    {/* Ação */}
                                    <td style={{ padding: "10px 18px", textAlign: "right" }}>
                                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                                        {isDeleted && isAdmin && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setRestoringItemId(item.id); restoreItemMutation.mutate(item.id); }}
                                            disabled={restoreItemMutation.isPending}
                                            title="Restaurar peça" aria-label="Restaurar peça"
                                            data-testid={`button-restore-${item.id}`}
                                            style={{ background: "#d1fae5", border: "1px solid #6ee7b7", cursor: "pointer", borderRadius: 6, color: "#065f46", display: "flex", alignItems: "center", justifyContent: "center", padding: 6, opacity: restoringItemId === item.id ? 0.6 : 1 }}
                                          >
                                            {restoringItemId === item.id
                                              ? <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} />
                                              : <RotateCcw style={{ width: 14, height: 14 }} />}
                                          </button>
                                        )}
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
                                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f97316")}
                                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#746e69")}
                                          >
                                            <Eye style={{ width: 16, height: 16 }} />
                                          </button>
                                        )}
                                        {!isDeleted && canDeleteAny && (
                                          canDeleteItem(item.status) ? (
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
                                          ) : (
                                            // Botão desabilitado (não span): entra na ordem de
                                            // tabulação do leitor de tela e anuncia o bloqueio.
                                            <button
                                              type="button" disabled aria-disabled="true"
                                              title="Exclusão bloqueada — peça já está em Arte ou produção"
                                              aria-label="Exclusão bloqueada — peça já está em Arte ou produção"
                                              style={{
                                                background: "none", border: "none",
                                                padding: 4, color: "#a8a29e",
                                                display: "flex", alignItems: "center", justifyContent: "center",
                                                cursor: "not-allowed",
                                              }}
                                            >
                                              <Trash2 style={{ width: 15, height: 15 }} />
                                            </button>
                                          )
                                        )}
                                      </div>
                                    </td>
                                  </tr>

                                </Fragment>
                              );
                            })}
                          </Fragment>
                            ))}
                          </Fragment>
                        ));
                      })()}
                      {hiddenCount > 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: 0 }}>
                            <button
                              onClick={() => expandEvent(eventKey)}
                              data-testid={`button-show-all-${eventKey}`}
                              style={{ width: "100%", padding: "13px", background: "#fafaf9", border: "none", borderTop: "1px solid #e7e5e4", color: "#1c1917", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                            >
                              Mostrar todos os {gd.items.length} itens (+{hiddenCount})
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

      {/* ── Exportar PDF — mesmo modal da Arte e do Atendimento ── */}
      {/* filteredItems (não items): o PDF exporta o recorte que está na tela —
          exportar com filtros ativos gerava um PDF da base inteira. */}
      <ExportPdfDialog
        open={showExportPDFModal}
        onOpenChange={setShowExportPDFModal}
        items={filteredItems}
        title="Peças"
      />

      {/* ── Item details modal ── */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={auditLogs}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
      />

      {/* ── Delete confirmation (Admin ou Solicitação, respeitando canDeleteItem) ── */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmItemId && (() => {
                const item = items.find((i: any) => i.id === deleteConfirmItemId);
                return item
                  ? `A peça "${item.displayId} — ${item.type}" será removida da lista, mas permanece no histórico de auditoria.`
                  : "A peça será removida da lista, mas permanece no histórico de auditoria.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItemMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmItemId && deleteItemMutation.mutate(deleteConfirmItemId)}
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
