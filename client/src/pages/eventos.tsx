import { useQuery } from "@tanstack/react-query";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, Calendar, Truck, AlertCircle, AlertTriangle, Search, Pencil, Trash2, Package, Flag, Building2, CheckCircle, ChevronDown, ChevronUp, Clock, HelpCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useLocation } from "wouter";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Sponsor } from "@shared/schema";
import { FilterSelect } from "@/components/filter-select";
import { SponsorChips } from "@/components/sponsor-chips";
import { PRIORITY, getPriorityMeta } from "@/lib/status";
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
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useIsMobile } from "@/hooks/use-mobile";

type PriorityLevel = 'baixa' | 'media' | 'alta' | 'urgente' | 'completed' | 'sem_prioridade';

const QUOTA_OPTIONS = [
  { value: "MASTER",     label: "Master",     color: "#ef4444" },
  { value: "GOLD",       label: "Gold",       color: "#1d4ed8" },
  { value: "SILVER",     label: "Silver",     color: "#7c3aed" },
  { value: "APOIO",      label: "Apoio",      color: "#6b7280" },
  { value: "MIDIA",      label: "Mídia",      color: "#0891b2" },
  { value: "MINISTERIO", label: "Ministério", color: "#059669" },
];

// Offsets padrão dos prazos (dias relativos à saída do caminhão).
const DEFAULT_DEADLINES = {
  deadlineListaImagens: -25,
  deadlineEntregaLayouts: -20,
  deadlineAprovacaoLayout: -12,
  deadlineRevisaoLista: -8,
  deadlineProducaoGrafica: -1,
};

// Prioridade efetiva do evento para filtragem/ordenação (concluído vem do status).
function getEventPriority(event: any): PriorityLevel {
  if (event.status === 'completed') return 'completed';
  if (!event.priority) return 'sem_prioridade';
  return event.priority as PriorityLevel;
}

// Cores/rótulos derivados de PRIORITY (lib/status) — antes havia mapas hex duplicados aqui.
// `hex` (saturado) fica para borda/ícone/barra; `text` (tom escuro AA) é o que vai em texto.
const PRIORITY_FALLBACK = { label: "Sem Prioridade", hex: '#a8a29e', text: '#57534e' };
function getPriorityConfig(priority: string | null | undefined): { label: string; hex: string; text: string } {
  const meta = getPriorityMeta(priority);
  return meta ? { label: meta.label, hex: meta.dot, text: meta.text || '#57534e' } : PRIORITY_FALLBACK;
}

const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function EventCardActions({
  event,
  cardBorderHex,
  onEdit,
  onDelete,
  onSetPriority,
  canEdit,
  canDelete,
  canSetPriority,
  isCompleted,
  isMobile,
}: {
  event: any;
  cardBorderHex: string;
  onEdit: (event: any, e: React.MouseEvent) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onSetPriority: (event: any, e: React.MouseEvent) => void;
  canEdit: boolean;
  canDelete: boolean;
  canSetPriority: boolean;
  isCompleted?: boolean;
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
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  };
  return (
    <div
      className={isMobile ? "focus-within:opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}
      style={{ display: 'flex', gap: '6px', transition: 'opacity 0.2s', flexShrink: 0 }}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
    >
      {/* canSetPriority: espelha o gate do servidor (admin/atendimento/solicitacao).
          Evento concluído não tem prioridade a definir — a bandeira some. */}
      {canSetPriority && !isCompleted && (
        <button
          onClick={(e) => onSetPriority(event, e)}
          title="Definir prioridade"
          aria-label="Definir prioridade"
          data-testid={`button-priority-event-${event.id}`}
          style={{ ...btnBase, backgroundColor: '#f9f9f8', color: event.priority ? cardBorderHex : '#a8a29e' }}
        >
          <Flag style={{ width: '13px', height: '13px', fill: event.priority ? cardBorderHex : 'none' }} />
        </button>
      )}
      {canEdit && (
        <button onClick={(e) => onEdit(event, e)} data-testid={`button-edit-event-${event.id}`}
          title="Editar evento" aria-label="Editar evento"
          style={{ ...btnBase, backgroundColor: '#f9f9f8', color: '#78716c' }}>
          <Pencil style={{ width: '13px', height: '13px' }} />
        </button>
      )}
      {canDelete && (
        <button onClick={(e) => onDelete(event.id, e)} data-testid={`button-delete-event-${event.id}`}
          title="Excluir evento" aria-label="Excluir evento"
          style={{ ...btnBase, backgroundColor: '#fef2f2', color: '#ef4444' }}>
          <Trash2 style={{ width: '13px', height: '13px' }} />
        </button>
      )}
    </div>
  );
}

export default function Eventos() {
  const { hasPermission, user } = useAuth();
  // Permissões de UI espelham os gates do servidor:
  // - editar: admin/solicitacao; excluir: só admin (DELETE devolve 403 aos demais);
  // - prioridade: admin/atendimento/solicitacao; criar: admin/solicitacao.
  const canEdit = hasPermission("admin") || hasPermission("solicitacao");
  const canDelete = hasPermission("admin");
  const canSetPriority = user?.role === 'admin' || user?.role === 'atendimento' || user?.role === 'solicitacao';
  const canCreate = user?.role === 'admin' || user?.role === 'solicitacao';
  const [open, setOpen] = useState(false);
  // Filtros inicializam da URL e são espelhados nela (mesmo padrão do Painel
  // Geral): F5 não perde o estado e o link filtrado é compartilhável.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [searchTerm, setSearchTerm] = useState(() => urlParams.get("busca") ?? "");
  const [selectedPriorities, setSelectedPriorities] = useState<PriorityLevel[]>(
    () => (urlParams.get("prioridade")?.split(",").filter(Boolean) as PriorityLevel[]) ?? [],
  );
  const [next10DaysFilter, setNext10DaysFilter] = useState(() => urlParams.get("proximos") === "1");
  const [monthFilter, setMonthFilter] = useState<string>(() => urlParams.get("mes") ?? "all");

  useEffect(() => {
    const p = new URLSearchParams();
    if (searchTerm) p.set("busca", searchTerm);
    if (selectedPriorities.length) p.set("prioridade", selectedPriorities.join(","));
    if (next10DaysFilter) p.set("proximos", "1");
    if (monthFilter !== "all") p.set("mes", monthFilter);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [searchTerm, selectedPriorities, next10DaysFilter, monthFilter]);

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
    setSearchTerm(""); setSelectedPriorities([]); setNext10DaysFilter(false); setMonthFilter("all");
  };
  const [formData, setFormData] = useState({
    name: "",
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
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [priorityDialogOpen, setPriorityDialogOpen] = useState(false);
  const [selectedEventForPriority, setSelectedEventForPriority] = useState<any>(null);
  const { toast } = useToast();
  const [, setLocation] = useLocation();  const isMobile = useIsMobile();
  const [openStartDate, setOpenStartDate] = useState(false);
  const [openTruckDate, setOpenTruckDate] = useState(false);
  const [openPrazoKey, setOpenPrazoKey] = useState<string | null>(null);

  const { data: events = [], isLoading, isError, refetch } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [], isLoading: sponsorsQueryLoading, isError: sponsorsQueryError } = useQuery<Sponsor[]>({
    queryKey: ["/api/sponsors"],
  });

  // Resolve nome/cor dos vínculos do payload de eventos (que só trazem sponsorId).
  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors]);

  const createEventMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      let response;
      try {
        response = await apiRequest("POST", "/api/events", data);
      } catch (error: any) {
        throw new Error(error?.message || "Erro ao criar evento");
      }
      const event = await response.json();

      // Vincular patrocinadores em paralelo. Se o evento JÁ foi criado, uma
      // falha aqui não vira erro do fluxo (o toast de erro sugeriria tentar de
      // novo e duplicar o evento) — sinalizamos para o onSuccess avisar.
      if (selectedSponsorIds.length > 0) {
        try {
          await Promise.all(
            selectedSponsorIds.map((sponsorId) =>
              apiRequest("POST", `/api/events/${event.id}/sponsors`, { sponsorId, quota: sponsorQuotaMap[sponsorId] || null })
            )
          );
        } catch {
          return { event, sponsorsFailed: true };
        }
      }

      return { event, sponsorsFailed: false };
    },
    onSuccess: ({ sponsorsFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setOpen(false);
      setFormData({ name: "", startDate: "", truckDepartureDate: "", ...DEFAULT_DEADLINES });
      setSelectedSponsorIds([]);
      setSponsorQuotaMap({});
      setSponsorSearch("");
      setPrazosExpanded(false);
      toast({
        title: "Evento criado",
        description: sponsorsFailed
          ? "Alguns patrocinadores não foram vinculados — edite o evento para revisar."
          : "O evento foi criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao criar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      try {
        // Atualizar evento
        await apiRequest("PATCH", `/api/events/${id}`, data);
        
        // Buscar patrocinadores atuais do evento
        const currentSponsorsRes = await apiRequest("GET", `/api/events/${id}/sponsors`);
        const currentSponsors = await currentSponsorsRes.json();
        const currentSponsorIds = currentSponsors.map((es: any) => es.sponsorId);
        const currentQuotaMap: Record<string, string> = {};
        currentSponsors.forEach((es: any) => { currentQuotaMap[es.sponsorId] = es.quota || ''; });
        
        // Calcular operações necessárias
        const toRemove = currentSponsorIds.filter((id: string) => !selectedSponsorIds.includes(id));
        const toAdd = selectedSponsorIds.filter((id: string) => !currentSponsorIds.includes(id));
        const toUpdateQuota = selectedSponsorIds.filter(
          (sid: string) => currentSponsorIds.includes(sid) && (sponsorQuotaMap[sid] || '') !== (currentQuotaMap[sid] || '')
        );
        
        const operations = [
          ...toRemove.map((sponsorId: string) => 
            apiRequest("DELETE", `/api/events/${id}/sponsors/${sponsorId}`)
          ),
          ...toAdd.map((sponsorId: string) => 
            apiRequest("POST", `/api/events/${id}/sponsors`, { sponsorId, quota: sponsorQuotaMap[sponsorId] || null })
          ),
          ...toUpdateQuota.map((sponsorId: string) =>
            apiRequest("PATCH", `/api/events/${id}/sponsors/${sponsorId}`, { quota: sponsorQuotaMap[sponsorId] || null })
          ),
        ];
        
        if (operations.length > 0) {
          await Promise.all(operations);
        }
      } catch (error: any) {
        throw new Error(error?.message || "Erro ao atualizar evento e patrocinadores");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setOpen(false);
      setEditingEvent(null);
      setFormData({ name: "", startDate: "", truckDepartureDate: "", ...DEFAULT_DEADLINES });
      setSelectedSponsorIds([]);
      setSponsorQuotaMap({});
      setSponsorSearch("");
      setPrazosExpanded(false);
      toast({
        title: "Evento atualizado",
        description: "O evento foi atualizado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar evento",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDeletingEventId(null);
      toast({
        title: "Evento excluído",
        description: "O evento foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir evento",
        description: error.message,
        variant: "destructive",
      });
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
      toast({
        title: "Prioridade atualizada",
        description: "A prioridade do evento foi atualizada com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar prioridade",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.truckDepartureDate) {
      toast({ title: "Datas obrigatórias", description: "Preencha a data de início e a saída do caminhão.", variant: "destructive" });
      return;
    }
    
    // Validação: Saída do caminhão deve ser pelo menos 1 dia ANTES do início do evento
    // Comparar apenas as datas do calendário (YYYY-MM-DD) sem timezone
    const startDateStr = formData.startDate; // "YYYY-MM-DD"
    const truckDateStr = formData.truckDepartureDate.substring(0, 10); // "YYYY-MM-DD"

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
        description: "A saída do caminhão deve ser pelo menos 1 dia antes do início do evento",
        variant: "destructive",
      });
      return;
    }

    // Ao editar, não deixa salvar antes de os patrocinadores carregarem (ou se
    // o carregamento falhou), para não apagar os vínculos existentes por engano.
    if (editingEvent && (sponsorsLoading || sponsorsError)) {
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
      updateEventMutation.mutate({ id: editingEvent.id, data: formData });
    } else {
      createEventMutation.mutate(formData);
    }
  };

  const handleEdit = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setEditingEvent(event);
    setFormData({
      name: event.name || "",
      // startDate pode vir como ISO completo ("2026-03-10T00:00:00.000Z") —
      // sem o slice, fmtDateBR/parseDateStr quebravam a exibição no modal.
      startDate: (event.startDate || "").slice(0, 10),
      truckDepartureDate: event.truckDepartureDate ? new Date(event.truckDepartureDate).toISOString().slice(0, 16) : "",
      deadlineListaImagens: event.deadlineListaImagens ?? DEFAULT_DEADLINES.deadlineListaImagens,
      deadlineEntregaLayouts: event.deadlineEntregaLayouts ?? DEFAULT_DEADLINES.deadlineEntregaLayouts,
      deadlineAprovacaoLayout: event.deadlineAprovacaoLayout ?? DEFAULT_DEADLINES.deadlineAprovacaoLayout,
      deadlineRevisaoLista: event.deadlineRevisaoLista ?? DEFAULT_DEADLINES.deadlineRevisaoLista,
      deadlineProducaoGrafica: event.deadlineProducaoGrafica ?? DEFAULT_DEADLINES.deadlineProducaoGrafica,
    });
    setOpen(true);
  }, []);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeletingEventId(id);
  }, []);

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingEvent(null);
    setFormData({ name: "", startDate: "", truckDepartureDate: "", ...DEFAULT_DEADLINES });
    setSelectedSponsorIds([]);
    setSponsorQuotaMap({});
    setSponsorSearch("");
    // Sem estes resets, um erro/carregamento pendente do modo EDITAR
    // contaminava a próxima abertura em modo CRIAR (banner de erro fantasma).
    setSponsorsError(false);
    setSponsorsLoading(false);
    setPrazosExpanded(false);
  };

  // Buscar patrocinadores vinculados ao editar evento — extraído do useEffect
  // para o banner de erro poder oferecer "Tentar novamente".
  const fetchEventSponsors = useCallback((eventId: string) => {
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
      })
      .catch((error) => {
        // NÃO zera selectedSponsorIds aqui: se zerasse e o usuário salvasse,
        // o updateEvent removeria TODOS os vínculos de patrocinador do evento.
        console.error("Erro ao buscar patrocinadores:", error);
        setSponsorsError(true);
        setSponsorsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (editingEvent) {
      fetchEventSponsors(editingEvent.id);
    }
  }, [editingEvent, fetchEventSponsors]);

  const handleSetPriority = useCallback((event: any, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedEventForPriority(event);
    setPriorityDialogOpen(true);
  }, []);

  const handlePrioritySelect = (priority: string) => {
    if (selectedEventForPriority) {
      updatePriorityMutation.mutate({ id: selectedEventForPriority.id, priority });
    }
  };

  // Casa busca (nome ou #id), próximos 10 dias e mês — tudo MENOS prioridade,
  // para que as contagens do filtro de prioridade reflitam os demais filtros.
  const matchesOtherFilters = useCallback((event: any) => {
    const q = searchTerm.toLowerCase().trim();
    const qId = q.replace("#", "");
    const matchesSearch = !q
      || event.name.toLowerCase().includes(q)
      || (qId !== "" && String(event.displayId ?? "").includes(qId));

    // Próximos 10 dias — toUTCDisplayDate alinha com a data que o card exibe (UTC).
    let matchesNext10Days = true;
    if (next10DaysFilter && event.truckDepartureDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tenDaysFromNow = new Date(today);
      tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
      const departureDate = toUTCDisplayDate(event.truckDepartureDate);
      matchesNext10Days = departureDate >= today && departureDate <= tenDaysFromNow;
    }

    // Mês — compara ano+mês ("2026-03") na mesma base UTC do card.
    let matchesMonth = true;
    if (monthFilter !== "all" && event.truckDepartureDate) {
      const d = toUTCDisplayDate(event.truckDepartureDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      matchesMonth = key === monthFilter;
    }

    return matchesSearch && matchesNext10Days && matchesMonth;
  }, [searchTerm, next10DaysFilter, monthFilter]);

  const filteredEvents = useMemo(() => events
    .filter((event) => {
      const matchesPriority = selectedPriorities.length === 0 ||
        selectedPriorities.includes(getEventPriority(event));
      return matchesPriority && matchesOtherFilters(event);
    })
    .sort((a, b) => {
      const priorityOrder: Record<PriorityLevel, number> = {
        urgente: 0,        // Vermelho - primeiro
        alta: 1,           // Amarelo - segundo
        media: 2,          // Roxo - terceiro
        baixa: 3,          // Azul - quarto
        sem_prioridade: 4, // Cinza - quinto
        completed: 5       // Verde - último
      };

      const orderA = priorityOrder[getEventPriority(a)];
      const orderB = priorityOrder[getEventPriority(b)];

      // Se têm prioridades diferentes, ordena por prioridade
      if (orderA !== orderB) {
        return orderA - orderB;
      }

      // Se têm a mesma prioridade, ordena primeiro por data de início do evento
      const startDateA = new Date(a.startDate);
      const startDateB = new Date(b.startDate);

      if (startDateA.getTime() !== startDateB.getTime()) {
        return startDateA.getTime() - startDateB.getTime();
      }

      // Se a data de início for igual, ordena por data de saída do caminhão
      const truckDateA = new Date(a.truckDepartureDate);
      const truckDateB = new Date(b.truckDepartureDate);
      return truckDateA.getTime() - truckDateB.getTime();
    }), [events, selectedPriorities, matchesOtherFilters]);

  // Contagens de prioridade sobre a lista já filtrada pelos demais filtros.
  const priorityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    events.filter(matchesOtherFilters).forEach((e) => {
      const p = getEventPriority(e);
      counts[p] = (counts[p] || 0) + 1;
    });
    return counts;
  }, [events, matchesOtherFilters]);

  // Opções do FilterSelect de prioridade — cores de PRIORITY (lib/status);
  // pinned preserva a ordem de severidade (o componente ordena o resto por rótulo).
  const priorityFilterOptions = useMemo(() => ([
    ...Object.entries(PRIORITY).map(([value, meta]) => ({
      value, label: meta.label, dotColor: meta.dot, count: priorityCounts[value] || 0, pinned: true,
    })),
    { value: "sem_prioridade", label: "Sem Prioridade", dotColor: "#a8a29e", count: priorityCounts.sem_prioridade || 0, pinned: true },
    { value: "completed", label: "Concluído", dotColor: "#10b981", count: priorityCounts.completed || 0, pinned: true },
  ]), [priorityCounts]);

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

  // ── Date picker helpers ────────────────────────────────────────────────
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

  // Formulário "sujo" do modal criar/editar: com dados em jogo, Esc/clique-fora
  // ficam bloqueados; pristine pode fechar sem cerimônia. No modo edição o
  // formulário já abre preenchido, então é sempre tratado como sujo (comparar
  // com um snapshot custaria mais do que vale aqui).
  const formDirty = !!editingEvent
    || formData.name.trim() !== ""
    || formData.startDate !== ""
    || formData.truckDepartureDate !== ""
    || selectedSponsorIds.length > 0;

  return (
    <div style={{ backgroundColor: '#fafaf9', height: '100%', overflowY: 'auto', padding: isMobile ? '12px' : '32px', display: 'flex', flexDirection: 'column', gap: isMobile ? '14px' : '20px' }}>

      {/* ── HEADER ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1
              data-testid="title-eventos"
              style={{ fontFamily: "'Space Grotesk', sans-serif", letterSpacing: '-0.03em', fontSize: '26px', fontWeight: '700', color: '#1c1917', margin: 0, lineHeight: 1.1 }}
            >
              Eventos
            </h1>
            <p style={{ color: '#746e69', fontSize: '15px', margin: '6px 0 0 0', fontWeight: '500' }}>
              Gerencie todos os eventos de produção gráfica
            </p>
          </div>
          {canCreate && (
            <Button
              data-testid="button-create-event"
              onClick={() => { setEditingEvent(null); setSponsorsError(false); setSponsorsLoading(false); setOpen(true); }}
              style={{ flexShrink: 0, backgroundColor: '#c2410c', color: '#ffffff', border: 'none', borderRadius: '12px', fontWeight: '700', fontSize: '13px', padding: '0 18px', height: '34px', gap: '7px', boxShadow: '0 2px 8px rgba(249,115,22,0.28)', display: 'flex', alignItems: 'center' }}
            >
              <Plus style={{ width: '14px', height: '14px' }} />
              Novo Evento
            </Button>
          )}
        </div>

        {/* ── MODAL CRIAR / EDITAR (Dialog 100% controlado, sem DialogTrigger) ── */}
          <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleCloseDialog(); else setOpen(true); }}>
            {/* ── MODAL CRIAR / EDITAR ── */}
            <DialogContent className="sm:max-w-[720px] p-0 gap-0" style={{ borderRadius: '16px', overflow: 'visible', boxShadow: '0 24px 48px -12px rgba(26,28,28,0.22)', maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column', maxWidth: isMobile ? '95vw' : undefined }}
              onInteractOutside={e => { if (formDirty) e.preventDefault(); }}
              onEscapeKeyDown={e => { if (formDirty) e.preventDefault(); }}>{/* com dados preenchidos, evita descartar o formulário por clique fora/Esc acidental — usar Cancelar/Salvar; pristine fecha normalmente */}
              {/* Cabeçalho */}
              <div style={{ borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
                {/* Faixa laranja */}
                <div style={{ height: '4px', background: 'linear-gradient(90deg, #f97316 0%, #fb923c 100%)' }} />
                <div style={{ padding: '20px 24px 18px', borderBottom: '1px solid #d4cfc9', backgroundColor: '#f9f8f7' }}>
                  <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '700', color: '#1c1917', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
                    {editingEvent ? "Editar Evento" : "Criar Novo Evento"}
                  </DialogTitle>
                  <DialogDescription style={{ color: '#746e69', fontSize: '13px', margin: '4px 0 0 0', fontWeight: '400' }}>
                    {editingEvent ? "Atualize as informações do evento." : "Preencha os detalhes do evento."}
                  </DialogDescription>
                </div>
              </div>

              <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto', flex: 1, minHeight: 0 }}>

                  {/* Nome */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                      Nome do Evento
                    </label>
                    <input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Ex: Circuitinho BSB 2024"
                      required
                      data-testid="input-event-name"
                      style={{ width: '100%', backgroundColor: '#e8e8e7', border: 'none', borderRadius: '6px', padding: '12px 16px', fontSize: '15px', color: '#1a1c1c', fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'box-shadow 0.15s, background-color 0.15s' }}
                      onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(253,118,26,0.25)'; e.currentTarget.style.backgroundColor = '#ffffff'; }}
                      onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.backgroundColor = '#e8e8e7'; }}
                    />
                  </div>

                  {/* Datas */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                        Data Início
                      </label>
                      <Popover open={openStartDate} onOpenChange={setOpenStartDate}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            data-testid="input-start-date"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, backgroundColor: openStartDate ? '#ffffff' : '#e8e8e7', border: openStartDate ? '1px solid #f97316' : '1px solid transparent', borderRadius: '8px', padding: '0 12px', fontSize: '13px', color: formData.startDate ? '#1a1c1c' : '#746e69', fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', textAlign: 'left' as const, boxShadow: openStartDate ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s' }}
                          >
                            <Calendar style={{ width: 14, height: 14, color: '#a8a29e', flexShrink: 0 }} />
                            {formData.startDate ? fmtDateBR(formData.startDate) : <span style={{ color: '#746e69' }}>Selecionar data</span>}
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
                      <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                        Saída Caminhão
                      </label>
                      <Popover open={openTruckDate} onOpenChange={setOpenTruckDate}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            data-testid="input-truck-date"
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 40, backgroundColor: openTruckDate ? '#ffffff' : '#e8e8e7', border: openTruckDate ? '1px solid #f97316' : '1px solid transparent', borderRadius: '8px', padding: '0 12px', fontSize: '13px', color: formData.truckDepartureDate ? '#1a1c1c' : '#746e69', fontFamily: "'Plus Jakarta Sans', sans-serif", cursor: 'pointer', textAlign: 'left' as const, boxShadow: openTruckDate ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s' }}
                          >
                            <Truck style={{ width: 14, height: 14, color: '#a8a29e', flexShrink: 0 }} />
                            {formData.truckDepartureDate
                              ? `${fmtDateBR(formData.truckDepartureDate.slice(0, 10))} às ${formData.truckDepartureDate.slice(11, 16)}`
                              : <span style={{ color: '#746e69' }}>Selecionar data e hora</span>}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start" style={{ zIndex: 9999 }}>
                          <CalendarUI
                            mode="single"
                            selected={parseDateStr(formData.truckDepartureDate?.slice(0, 10) || '')}
                            onSelect={date => {
                              if (date) {
                                const timePart = formData.truckDepartureDate?.slice(11, 16) || '08:00';
                                setFormData({ ...formData, truckDepartureDate: toDateStr(date) + 'T' + timePart });
                                setPrazosExpanded(true);
                              }
                            }}
                            locale={ptBR}
                            classNames={{ day_selected: 'bg-[#f97316] text-white hover:bg-[#ea580c] hover:text-white focus:bg-[#f97316] focus:text-white', day_today: 'bg-orange-50 font-semibold' }}
                          />
                          <div style={{ borderTop: '1px solid #f0efee', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Clock style={{ width: 12, height: 12, color: '#a8a29e', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, flexShrink: 0 }}>Horário:</span>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder="HH:MM"
                              maxLength={5}
                              value={formData.truckDepartureDate?.slice(11, 16) || ''}
                              onChange={e => {
                                let v = e.target.value.replace(/[^\d:]/g, '');
                                // auto-insert colon after 2 digits
                                if (v.length === 2 && !v.includes(':')) v = v + ':';
                                if (v.length > 5) return;
                                const datePart = formData.truckDepartureDate?.slice(0, 10) || '';
                                if (!datePart) return;
                                // update as raw string while typing; only clamp when complete
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
                                // on blur normalise incomplete values
                                const datePart = formData.truckDepartureDate?.slice(0, 10) || '';
                                if (!datePart) return;
                                const raw = e.target.value;
                                const match = raw.match(/^(\d{1,2})(?::(\d{0,2}))?$/);
                                if (match) {
                                  const h = String(Math.min(23, parseInt(match[1] || '0', 10))).padStart(2, '0');
                                  const mi = String(Math.min(59, parseInt(match[2] || '0', 10))).padStart(2, '0');
                                  setFormData({ ...formData, truckDepartureDate: `${datePart}T${h}:${mi}` });
                                }
                              }}
                              style={{ width: 68, height: 34, textAlign: 'center', border: '1px solid #e7e5e4', borderRadius: 6, fontSize: 15, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.05em' }}
                              onFocus={e => { e.currentTarget.style.borderColor = '#f97316'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(249,115,22,0.18)'; }}
                            />
                            <button
                              type="button"
                              onClick={() => setOpenTruckDate(false)}
                              style={{ marginLeft: 'auto', height: 34, padding: '0 14px', borderRadius: 6, border: 'none', background: '#c2410c', color: '#ffffff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
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
                          return <p style={{ margin: 0, fontSize: '11px', color: '#dc2626', fontWeight: 600 }}>Deve ser pelo menos 1 dia antes do início do evento.</p>;
                        }
                        return null;
                      })()}
                    </div>
                  </div>

                  {/* Patrocinadores */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 style={{ width: '12px', height: '12px', color: '#f97316' }} />
                      Patrocinadores
                      <span style={{ color: '#746e69', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(opcional)</span>
                      {selectedSponsorIds.length > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '10px', fontWeight: '700', color: '#c2410c', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '999px', padding: '1px 8px', letterSpacing: 0, textTransform: 'none' }}>
                          {selectedSponsorIds.length} selecionado{selectedSponsorIds.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </label>

                    {(sponsorsQueryLoading || sponsorsLoading) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#ffffff', border: '1px solid #f0efee', borderRadius: '8px', padding: '14px 16px' }} aria-busy="true" aria-label="Carregando patrocinadores">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div key={i} className="animate-pulse" style={{ height: '14px', borderRadius: '4px', backgroundColor: '#f5f5f4', width: `${88 - i * 9}%` }} />
                        ))}
                      </div>
                    ) : (sponsorsQueryError || sponsorsError) ? (
                      <div role="alert" style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px 16px', fontSize: '13px', fontWeight: '600', color: '#b45309', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                        <AlertTriangle style={{ width: '15px', height: '15px', flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ flex: 1 }}>Não foi possível carregar os patrocinadores.</span>
                        {editingEvent && sponsorsError && (
                          <button
                            type="button"
                            onClick={() => fetchEventSponsors(editingEvent.id)}
                            data-testid="button-retry-sponsors"
                            style={{ flexShrink: 0, background: 'transparent', border: 'none', padding: 0, fontSize: '13px', fontWeight: '700', color: '#b45309', textDecoration: 'underline', cursor: 'pointer', fontFamily: 'inherit' }}
                          >
                            Tentar novamente
                          </button>
                        )}
                      </div>
                    ) : sponsors.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#57534e', backgroundColor: '#f0efee', borderRadius: '8px', padding: '12px 16px' }}>
                        Nenhum patrocinador cadastrado.{" "}
                        <Link href="/patrocinadores" style={{ color: '#c2410c', fontWeight: '600' }}>Cadastre agora</Link>
                      </p>
                    ) : (
                      <div style={{ backgroundColor: '#f0efee', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Search input */}
                        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e7e5e4', position: 'relative' }}>
                          <Search style={{ position: 'absolute', left: 22, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: '#a8a29e', pointerEvents: 'none' }} />
                          <input
                            type="text"
                            placeholder="Buscar patrocinador..."
                            value={sponsorSearch}
                            onChange={e => setSponsorSearch(e.target.value)}
                            data-testid="input-sponsor-search"
                            style={{
                              width: '100%', paddingLeft: 28, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                              backgroundColor: '#ffffff', border: 'none', borderRadius: '6px',
                              fontSize: '13px', color: '#1a1c1c', boxSizing: 'border-box',
                            }}
                          />
                        </div>
                        {/* Sponsor list */}
                        <div style={{ maxHeight: '200px', overflowY: 'auto', padding: '8px 0' }}>
                          {(() => {
                            const q = sponsorSearch.toLowerCase();
                            const filtered = [...sponsors]
                              .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))
                              .filter(s => !q || s.name.toLowerCase().includes(q) || (s.company || '').toLowerCase().includes(q));
                            if (filtered.length === 0) return (
                              <p style={{ fontSize: '13px', color: '#746e69', textAlign: 'center', padding: '16px 12px' }}>
                                Nenhum resultado para "{sponsorSearch}"
                              </p>
                            );
                            return filtered.map((sponsor) => {
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
                                  {/* Color dot */}
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: color, flexShrink: 0, boxShadow: `0 0 0 2px ${color}33` }} />

                                  {/* Name */}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: '#1a1c1c', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {sponsor.name}
                                    </span>
                                    {sponsor.company && (
                                      <span style={{ fontSize: 10, color: '#746e69', display: 'block', lineHeight: 1.2 }}>{sponsor.company}</span>
                                    )}
                                  </div>

                                  {/* Quota select — only when selected */}
                                  {isSelected && (
                                    <div style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                    <Select
                                      value={currentQuota || '_none_'}
                                      onValueChange={v => {
                                        const val = v === '_none_' ? '' : v;
                                        setSponsorQuotaMap(prev => {
                                          const n = { ...prev };
                                          if (val) n[sponsor.id] = val; else delete n[sponsor.id];
                                          return n;
                                        });
                                      }}
                                    >
                                      <SelectTrigger
                                        data-testid={`quota-select-${sponsor.id}`}
                                        aria-label={`Cota de ${sponsor.name}`}
                                        className="w-auto"
                                        style={{
                                          fontSize: '11px',
                                          fontWeight: 700,
                                          letterSpacing: '0.05em',
                                          textTransform: 'uppercase',
                                          borderRadius: '999px',
                                          border: `1.5px solid ${quotaOpt ? quotaOpt.color : '#d8d5d2'}`,
                                          backgroundColor: quotaOpt ? quotaOpt.color + '18' : '#f0efee',
                                          color: quotaOpt ? quotaOpt.color : '#78716c',
                                          height: '28px',
                                          padding: '0 8px 0 10px',
                                          minWidth: '96px',
                                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                                          boxShadow: 'none',
                                        }}
                                      >
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="_none_">Sem cota</SelectItem>
                                        {QUOTA_OPTIONS.map(q => (
                                          <SelectItem key={q.value} value={q.value} data-testid={`quota-${sponsor.id}-${q.value}`}>
                                            {q.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    </div>
                                  )}

                                  {/* Checkbox */}
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
                            });
                          })()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Prazos colapsável */}
                  {(() => {
                    // Converte offset (dias) em YYYY-MM-DD para o input date
                    // truckDepartureDate é datetime-local (YYYY-MM-DDTHH:MM), pegamos só a data
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
                    // Converte data escolhida de volta em offset (dias)
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
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                        <button
                          type="button"
                          onClick={() => setPrazosExpanded(!prazosExpanded)}
                          data-testid="button-toggle-prazos"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', backgroundColor: '#f0efee', border: 'none', borderRadius: prazosExpanded ? '8px 8px 0 0' : '8px', padding: '10px 14px', cursor: 'pointer', transition: 'background-color 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e8e7e6'; }}
                          onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f0efee'; }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock style={{ width: '13px', height: '13px', color: '#f97316' }} />
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: '#625d5b', textTransform: 'uppercase', letterSpacing: '0.12em' }}>Prazos</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span
                                    onClick={e => e.stopPropagation()}
                                    style={{ display: 'inline-flex', alignItems: 'center', cursor: 'help' }}
                                  >
                                    <HelpCircle style={{ width: '12px', height: '12px', color: '#a8a29e' }} />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top" style={{ maxWidth: '220px', fontSize: '13px', lineHeight: '1.5' }}>
                                  Prazos que caírem no <strong>sábado</strong> são antecipados para <strong>sexta-feira</strong>. Os que caírem no <strong>domingo</strong> são adiados para <strong>segunda-feira</strong>. Exceção: Produção Gráfica funciona todos os dias.
                                </TooltipContent>
                              </Tooltip>
                            </span>
                            <span style={{ fontSize: '10px', color: '#746e69', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{noStart ? 'preencha a saída do caminhão primeiro' : 'relativo à saída do caminhão'}</span>
                          </div>
                          {prazosExpanded
                            ? <ChevronUp style={{ width: '14px', height: '14px', color: '#746e69' }} />
                            : <ChevronDown style={{ width: '14px', height: '14px', color: '#746e69' }} />
                          }
                        </button>
                        {prazosExpanded && (
                          <div style={{ backgroundColor: '#f0efee', borderRadius: '0 0 8px 8px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                            {[
                              { key: 'deadlineListaImagens', label: 'Lista de Imagens', desc: 'Criação dos itens do evento', color: '#8b5cf6', allDays: false },
                              { key: 'deadlineEntregaLayouts', label: 'Entrega de Layouts', desc: 'Arte entrega os arquivos finais', color: '#3b82f6', allDays: false },
                              { key: 'deadlineAprovacaoLayout', label: 'Aprovação de Layout', desc: 'Aprovação pelo patrocinador', color: '#f59e0b', allDays: false },
                              { key: 'deadlineRevisaoLista', label: 'Revisão de Lista', desc: 'Criador revisa e lança todos os itens', color: '#10b981', allDays: false },
                              { key: 'deadlineProducaoGrafica', label: 'Produção Gráfica', desc: 'Prazo da gráfica para produzir', color: '#f97316', allDays: true },
                            ].map(({ key, label, desc, color, allDays }) => {
                              const currentDays = formData[key as keyof typeof formData] as number;
                              const dateVal = offsetToDateStr(currentDays, allDays);
                              // Detecta se o ajuste de fim de semana (sáb→sex / dom→seg) moveu a data.
                              const rawVal = offsetToDateStr(currentDays, true);
                              const weekendAdjusted = !allDays && !!dateVal && rawVal !== dateVal;
                              return (
                                <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                                    <div style={{ minWidth: 0 }}>
                                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1a1c1c', lineHeight: 1.2 }}>{label}</div>
                                      <div style={{ fontSize: '10px', color: '#746e69', lineHeight: 1.2, marginTop: '1px' }}>{desc}</div>
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                    <Popover open={openPrazoKey === key} onOpenChange={o => setOpenPrazoKey(o ? key : null)}>
                                      <PopoverTrigger asChild>
                                        <button
                                          type="button"
                                          data-testid={`input-${key}`}
                                          disabled={noStart}
                                          style={{ display: 'flex', alignItems: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: '6px', border: openPrazoKey === key ? '1px solid #f97316' : '1px solid transparent', backgroundColor: noStart ? '#f0efee' : (openPrazoKey === key ? '#ffffff' : '#e8e8e7'), fontSize: '13px', fontWeight: '600', color: noStart ? '#a8a29e' : (dateVal ? '#1a1c1c' : '#746e69'), cursor: noStart ? 'not-allowed' : 'pointer', boxShadow: openPrazoKey === key ? '0 0 0 2px rgba(249,115,22,0.18)' : 'none', transition: 'all 0.15s', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap' as const }}
                                        >
                                          <Calendar style={{ width: 11, height: 11, color: noStart ? '#c4bfbb' : '#a8a29e', flexShrink: 0 }} />
                                          {dateVal ? fmtDateBR(dateVal) : (noStart ? '—' : 'Selecionar')}
                                        </button>
                                      </PopoverTrigger>
                                      {!noStart && (
                                        <PopoverContent className="w-auto p-0" align="end" style={{ zIndex: 9999 }}>
                                          <CalendarUI
                                            mode="single"
                                            selected={parseDateStr(dateVal)}
                                            disabled={d => !!(truckDateOnly && toDateStr(d) > truckDateOnly)}
                                            onSelect={date => {
                                              if (date) {
                                                const offset = dateStrToOffset(toDateStr(date));
                                                setFormData({ ...formData, [key]: offset });
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
                                      <span style={{ fontSize: '10px', color: '#746e69', fontWeight: '500', whiteSpace: 'nowrap' as const }}>{fmtOffset(currentDays)}</span>
                                    )}
                                  </div>
                                  {weekendAdjusted && (
                                    <span style={{ fontSize: '10px', color: '#746e69' }}>fim de semana → ajustado</span>
                                  )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                </div>

                {/* Rodapé */}
                <div style={{ padding: '24px', backgroundColor: '#fafaf9', borderTop: '1px solid rgba(224,192,177,0.2)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', borderRadius: '0 0 16px 16px', flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={handleCloseDialog}
                    style={{ fontSize: '13px', fontWeight: '700', color: '#625d5b', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 16px', textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: '6px', transition: 'background-color 0.15s, color 0.15s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e8e8e7'; e.currentTarget.style.color = '#1c1917'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#625d5b'; }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={createEventMutation.isPending || updateEventMutation.isPending}
                    data-testid="button-submit-event"
                    style={{ backgroundColor: '#1c1917', color: '#ffffff', borderRadius: '6px', fontWeight: '700', fontSize: '13px', padding: '10px 32px', textTransform: 'uppercase', letterSpacing: '0.04em', border: 'none', cursor: createEventMutation.isPending || updateEventMutation.isPending ? 'not-allowed' : 'pointer', transition: 'filter 0.15s, transform 0.1s', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    onMouseEnter={e => { if (!createEventMutation.isPending && !updateEventMutation.isPending) e.currentTarget.style.backgroundColor = '#292524'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#1c1917'; }}
                    onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                    onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    {editingEvent
                      ? (updateEventMutation.isPending ? "Salvando..." : "Salvar Alterações")
                      : (createEventMutation.isPending ? "Criando..." : "Salvar Evento")
                    }
                  </button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      {/* ── FILTROS inline ── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', paddingBottom: isMobile ? '10px' : '16px', borderBottom: '1px solid #e7e5e4' }}>

        {/* Busca */}
        <div style={{ position: 'relative', flexShrink: 0, width: isMobile ? '100%' : undefined }}>
          <Search style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#a8a29e', width: '13px', height: '13px', pointerEvents: 'none' }} />
          <input
            ref={searchRef}
            placeholder="Buscar evento..."
            aria-label="Buscar eventos"
            title="Atalho: pressione / para focar a busca"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="input-search-events"
            style={{ paddingLeft: '32px', paddingRight: '12px', height: '32px', width: isMobile ? '100%' : '200px', border: '1px solid #e7e5e4', borderRadius: '999px', backgroundColor: '#ffffff', fontSize: '13px', color: '#1c1917', fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#fd761a'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(253,118,26,0.12)'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e7e5e4'; e.currentTarget.style.boxShadow = 'none'; }}
          />
        </div>

        {/* Divisor — só no desktop; no mobile a busca ocupa a linha inteira e o traço ficava órfão */}
        {!isMobile && (
          <div style={{ width: '1px', height: '20px', backgroundColor: '#e7e5e4', flexShrink: 0 }} />
        )}

        {/* Filtro de prioridade — múltiplo, cores de PRIORITY, contagens da lista já filtrada */}
        <FilterSelect
          label="Prioridade"
          allLabel="Todas as prioridades"
          values={selectedPriorities}
          onValuesChange={(v) => setSelectedPriorities(v as PriorityLevel[])}
          options={priorityFilterOptions}
          testId="filter-priority"
        />

        {/* Filtro de mês — simples, com ano, derivado dos eventos existentes */}
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
            padding: '5px 13px', borderRadius: '999px',
            fontSize: '13px', fontWeight: '700', cursor: 'pointer',
            border: 'none',
            backgroundColor: next10DaysFilter ? '#1c1917' : '#e2e2e2',
            color: next10DaysFilter ? '#ffffff' : '#57534e',
            transition: 'all 0.15s',
          }}
        >
          <Truck style={{ width: '13px', height: '13px' }} />
          Próximos 10 dias
        </button>

        {(searchTerm || selectedPriorities.length > 0 || monthFilter !== "all" || next10DaysFilter) && (
          <button onClick={clearAllEventFilters} data-testid="button-clear-filters"
            style={{ padding: '5px 10px', borderRadius: '999px', fontSize: '11px', cursor: 'pointer', border: 'none', backgroundColor: 'transparent', color: '#746e69' }}>
            Limpar
          </button>
        )}

        {/* Contador de resultados */}
        {!isLoading && !isError && (
          <span aria-live="polite" style={{ marginLeft: 'auto', fontSize: '11px', color: '#746e69', flexShrink: 0 }}>
            {filteredEvents.length} de {events.length} eventos
          </span>
        )}
      </div>

      {/* ── CONTEÚDO ── */}
      {isLoading ? (
        /* Skeleton com a silhueta dos cards reais (badge + título + datas +
           barra de progresso) no lugar do spinner central — sem layout shift. */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" aria-busy="true" aria-label="Carregando eventos">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderLeft: '4px solid #e7e5e4', borderRadius: 12, padding: '20px 22px' }}>
              <div className="animate-pulse" style={{ width: 110, height: 22, borderRadius: 999, backgroundColor: '#f5f5f4', marginBottom: 14 }} />
              <div className="animate-pulse" style={{ width: '55%', height: 18, borderRadius: 4, backgroundColor: '#e7e5e4', marginBottom: 18 }} />
              <div style={{ display: 'flex', gap: 32, marginBottom: 22 }}>
                <div className="animate-pulse" style={{ width: 90, height: 12, borderRadius: 4, backgroundColor: '#f0efee' }} />
                <div className="animate-pulse" style={{ width: 110, height: 12, borderRadius: 4, backgroundColor: '#f0efee' }} />
              </div>
              <div className="animate-pulse" style={{ width: '100%', height: 6, borderRadius: 999, backgroundColor: '#f0efee' }} />
            </div>
          ))}
        </div>
      ) : isError ? (
        /* Sem este ramo, uma falha da API caía no "Nenhum evento criado" com
           botão de criar — mensagem enganosa que podia induzir a recriar
           eventos que já existem. */
        <div role="alert" style={{ backgroundColor: '#ffffff', border: '1px solid #fecaca', borderRadius: '12px', padding: '72px 24px', textAlign: 'center' }}>
          <h3 style={{ color: '#b91c1c', fontSize: '16px', fontWeight: '700', marginBottom: '6px' }}>Não foi possível carregar os eventos</h3>
          <p style={{ color: '#746e69', fontSize: '13px', marginBottom: '20px' }}>Verifique sua conexão e tente novamente.</p>
          <button onClick={() => refetch()} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#1c1917', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer' }}>
            Tentar novamente
          </button>
        </div>
      ) : events.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '12px', padding: '72px 24px', textAlign: 'center' }}>
          <Package style={{ width: '44px', height: '44px', color: '#d4d0cb', margin: '0 auto 16px' }} />
          <h3 style={{ color: '#1c1917', fontSize: '18px', fontWeight: '700', marginBottom: '6px', fontFamily: "'Space Grotesk', sans-serif" }}>Nenhum evento criado</h3>
          {canCreate ? (
            <>
              <p style={{ color: '#746e69', fontSize: '13px', marginBottom: '24px' }}>Comece criando seu primeiro evento de produção</p>
              <Button onClick={() => setOpen(true)} style={{ backgroundColor: '#c2410c', color: '#ffffff', borderRadius: '12px', fontWeight: '700', boxShadow: '0 4px 14px rgba(249,115,22,0.25)' }}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Evento
              </Button>
            </>
          ) : (
            <p style={{ color: '#746e69', fontSize: '13px', margin: 0 }}>Os eventos criados pela equipe aparecerão aqui</p>
          )}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div style={{ backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: '12px', padding: '72px 24px', textAlign: 'center' }}>
          <Search style={{ width: '40px', height: '40px', color: '#d4d0cb', margin: '0 auto 16px' }} />
          <h3 style={{ color: '#1c1917', fontSize: '18px', fontWeight: '700', marginBottom: '6px', fontFamily: "'Space Grotesk', sans-serif" }}>Nenhum evento encontrado</h3>
          <p style={{ color: '#746e69', fontSize: '13px', marginBottom: '20px' }}>Nenhum evento corresponde aos filtros ativos.</p>
          <button
            onClick={clearAllEventFilters}
            style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: '#1c1917', border: 'none', borderRadius: 8, padding: '9px 20px', cursor: 'pointer' }}
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredEvents.map((event) => {
            const itemCount = event.items?.length || 0;

            const now = new Date();
            const departure = new Date(event.truckDepartureDate);
            const hoursUntilDeparture = (departure.getTime() - now.getTime()) / (1000 * 60 * 60);
            const truckUrgency = hoursUntilDeparture < 0 ? 'departed'
              : hoursUntilDeparture < 24 ? 'urgent'
              : hoursUntilDeparture < 48 ? 'warning'
              : 'normal';
            const daysSinceDeparture = Math.floor(-hoursUntilDeparture / 24);

            const priorityConfig = getPriorityConfig(event.priority);
            const isCompleted = event.status === 'completed';
            const cardBorderHex = isCompleted ? '#10b981' : priorityConfig.hex;
            const deliveredCount = event.items?.filter((item: any) => item.status === 'delivered').length || 0;
            const progressPct = itemCount > 0 ? Math.round((deliveredCount / itemCount) * 100) : 0;
            const progressColor = progressPct === 100 ? '#10b981' : cardBorderHex;

            // Saturado só no ÍCONE; o TEXTO usa tons escuros com contraste AA.
            const truckIconColor = isCompleted ? '#10b981' : truckUrgency === 'urgent' ? '#ef4444' : truckUrgency === 'warning' ? '#f59e0b' : '#78716c';
            const truckTextColor = !isCompleted && truckUrgency === 'urgent' ? '#b91c1c' : !isCompleted && truckUrgency === 'warning' ? '#b45309' : '#1c1917';

            // O payload de eventos traz só o vínculo (sponsorId/quota) —
            // nome/cor vêm da lista global de patrocinadores.
            const cardSponsors = ((event.sponsors || []) as any[])
              .map((es) => sponsorById.get(es.sponsorId))
              .filter(Boolean) as Sponsor[];

            // ── Card único parametrizado (concluído vs. ativo variam borda,
            //    badge, ícone decorativo e rodapé) ──
            return (
                <div
                  key={event.id}
                  className="group relative cursor-pointer bg-white rounded-xl flex flex-col gap-4 overflow-hidden"
                  style={{
                    border: '1px solid #e7e5e4',
                    borderLeft: `4px solid ${cardBorderHex}`,
                    padding: isMobile ? '14px' : '24px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'box-shadow 0.3s ease, transform 0.3s ease',
                  }}
                  /* Os cards SÃO a navegação desta tela. Como div sem foco,
                     abrir um evento era impossível sem mouse. role="link"
                     porque a ação é navegar — links respondem a Enter, não
                     a Espaço. */
                  role="link"
                  tabIndex={0}
                  aria-label={`Abrir evento ${event.name}`}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setLocation(`/eventos/${event.id}`); } }}
                  onClick={() => setLocation(`/eventos/${event.id}`)}
                  onMouseEnter={isMobile ? undefined : e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 20px 40px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)'; }}
                  onMouseLeave={isMobile ? undefined : e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
                  data-testid={`card-event-${event.id}`}
                >
                  {isCompleted && (
                    <div style={{ position: 'absolute', right: '-16px', bottom: '-16px', opacity: 0.03, pointerEvents: 'none' }}>
                      <CheckCircle style={{ width: '120px', height: '120px', color: '#10b981' }} />
                    </div>
                  )}

                  {/* Linha 1: badge de status/prioridade + ações */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', position: 'relative', zIndex: 1 }}>
                    {isCompleted ? (
                      <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#047857', backgroundColor: 'rgba(16,185,129,0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                        Concluído
                      </span>
                    ) : !event.priority ? (
                      <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#746e69', backgroundColor: '#f3f4f3', padding: '4px 10px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle style={{ width: '10px', height: '10px' }} />
                        Sem prioridade
                      </span>
                    ) : (
                      <span style={{ fontSize: '10px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: priorityConfig.text, backgroundColor: cardBorderHex + '12', padding: '4px 10px', borderRadius: '6px' }}>
                        {priorityConfig.label}
                      </span>
                    )}
                    <EventCardActions
                      event={event}
                      cardBorderHex={cardBorderHex}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onSetPriority={handleSetPriority}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canSetPriority={canSetPriority}
                      isCompleted={isCompleted}
                      isMobile={isMobile}
                    />
                  </div>

                  {/* Nome + id (id rebaixado para junto do nome) */}
                  <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '18px', fontWeight: '700', color: '#1c1917', lineHeight: 1.25, margin: 0 }}>
                      {event.name}
                    </h3>
                    {event.displayId && (
                      <span style={{ fontSize: '11px', fontWeight: '500', color: '#746e69' }}>#{String(event.displayId).padStart(4, '0')}</span>
                    )}
                  </div>

                  {/* Patrocinadores do evento */}
                  {cardSponsors.length > 0 && (
                    <div style={{ position: 'relative', zIndex: 1 }}>
                      <SponsorChips sponsors={cardSponsors} max={3} variant="colored" size="xs" />
                    </div>
                  )}

                  {/* Datas — Saída do Caminhão dominante; Início como apoio */}
                  <div style={{ margin: '4px 0', position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <p style={{ fontSize: '10px', fontWeight: '700', color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Saída Caminhão</p>
                      <div className={!isCompleted && truckUrgency === 'urgent' ? 'motion-safe:animate-pulse' : ''} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <Truck style={{ width: '16px', height: '16px', color: truckIconColor, flexShrink: 0 }} />
                        <span style={{ fontSize: '16px', fontWeight: '700', color: truckTextColor }}>
                          {new Date(event.truckDepartureDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' }).replace('.', '')}
                          {' · '}
                          {new Date(event.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
                        </span>
                        {!isCompleted && truckUrgency === 'departed' && (
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#b91c1c' }}>
                            {daysSinceDeparture < 1 ? 'Saiu hoje' : `Saiu há ${daysSinceDeparture}d`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#746e69' }}>
                      <Calendar style={{ width: '11px', height: '11px', color: '#a8a29e', flexShrink: 0 }} />
                      <span>
                        Início: {event.startDate ? parseDateLocal(event.startDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '') : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Progresso */}
                  <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #f0efee', position: 'relative', zIndex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#57534e' }}>
                        {isCompleted && itemCount === 0 ? 'Sem peças' : `${deliveredCount}/${itemCount} Entregues`}
                      </span>
                      {isCompleted ? (
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#047857' }}>Concluído</span>
                      ) : (
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#1c1917' }}>{progressPct}%</span>
                      )}
                    </div>
                    <div style={{ width: '100%', backgroundColor: '#f0efee', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', backgroundColor: isCompleted ? '#10b981' : progressColor, borderRadius: '999px', width: `${progressPct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                </div>
            );
          })}

        </div>
      )}

      <AlertDialog open={!!deletingEventId} onOpenChange={(open) => { if (!open && !deleteEventMutation.isPending) setDeletingEventId(null); }}>
        <AlertDialogContent style={{ maxWidth: "420px", backgroundColor: "#ffffff", borderRadius: "16px", padding: "0", border: "none", boxShadow: "0 16px 32px -12px rgba(26,28,28,0.2)", overflow: "hidden" }}>
          <div style={{ padding: "32px 32px 8px 32px" }}>
            <AlertDialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "18px", fontWeight: "700", letterSpacing: "-0.02em", color: "#1c1917", margin: 0 }}>
              Confirmar Exclusão
            </AlertDialogTitle>

            {/* Banner aviso — borda esquerda laranja */}
            <div style={{ marginTop: "24px", padding: "16px", backgroundColor: "#fff7ed", borderLeft: "4px solid #f97316", borderRadius: "0 8px 8px 0", display: "flex", alignItems: "flex-start", gap: "12px" }}>
              <AlertTriangle style={{ width: "18px", height: "18px", color: "#f97316", flexShrink: 0, marginTop: "1px" }} />
              <p style={{ fontSize: "13px", fontWeight: "600", color: "#783200", margin: 0, lineHeight: 1.6 }}>
                Todas as peças associadas a este evento também serão removidas permanentemente.
              </p>
            </div>

            {/* Descrição com nome do evento */}
            <AlertDialogDescription style={{ fontSize: "15px", color: "#746e69", lineHeight: 1.6, marginTop: "16px" }}>
              Tem certeza que deseja excluir o evento{" "}
              <strong style={{ color: "#1a1c1c", fontWeight: "600" }}>
                "{events.find((e: any) => e.id === deletingEventId)?.name || "este evento"}"
              </strong>
              ? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </div>

          <AlertDialogFooter style={{ padding: "16px 32px 32px 32px", display: "flex", flexDirection: "row", justifyContent: "flex-end", gap: "10px" }}>
            <AlertDialogCancel
              disabled={deleteEventMutation.isPending}
              style={{ padding: "9px 24px", backgroundColor: "transparent", border: "1px solid #e0c0b1", borderRadius: "6px", fontSize: "13px", fontWeight: "700", color: "#625d5b", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", transition: "background-color 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f3")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEventId && deleteEventMutation.mutate(deletingEventId)}
              disabled={deleteEventMutation.isPending}
              data-testid="button-confirm-delete-event"
              style={{ padding: "9px 24px", backgroundColor: "#ba1a1a", border: "none", borderRadius: "6px", fontSize: "13px", fontWeight: "700", color: "#ffffff", cursor: deleteEventMutation.isPending ? "wait" : "pointer", opacity: deleteEventMutation.isPending ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.04em", fontFamily: "'Plus Jakarta Sans', sans-serif", display: "flex", alignItems: "center", gap: "8px", transition: "filter 0.15s" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#991b1b")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#ba1a1a")}
            >
              <Trash2 style={{ width: "14px", height: "14px" }} />
              {deleteEventMutation.isPending ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={priorityDialogOpen} onOpenChange={setPriorityDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0" style={{ borderRadius: '12px', overflow: 'hidden' }}>
          {/* Cabeçalho */}
          <div style={{ backgroundColor: '#f3f4f3', borderBottom: '1px solid #e7e5e4', padding: '18px 24px', paddingRight: 48, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <DialogTitle style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '15px', fontWeight: '700', color: '#1c1917', margin: 0, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
              Definir Prioridade
            </DialogTitle>
            <DialogDescription className="sr-only">Escolha o nível de prioridade do evento.</DialogDescription>
            {selectedEventForPriority && (
              <span style={{ fontSize: '10px', fontWeight: '700', color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {selectedEventForPriority.name.length > 20 ? selectedEventForPriority.name.slice(0, 20) + '…' : selectedEventForPriority.name}
              </span>
            )}
          </div>

          {/* Corpo — grid de opções horizontais */}
          <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            {(['baixa', 'media', 'alta', 'urgente'] as const).map((key) => {
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
                    borderRadius: '12px',
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
                  <span className="prio-label" style={{ fontWeight: '700', fontSize: '13px', color: isSelected ? meta.text : '#44403c', transition: 'color 0.15s' }}>
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Rodapé */}
          <div style={{ backgroundColor: '#f3f4f3', borderTop: '1px solid #e7e5e4', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Caminho de volta: sem isto, prioridade definida era para sempre. */}
            {selectedEventForPriority?.priority ? (
              <button
                onClick={() => handlePrioritySelect("")}
                disabled={updatePriorityMutation.isPending}
                data-testid="button-remove-priority"
                style={{ fontSize: '11px', fontWeight: '700', color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em' }}
              >
                Remover prioridade
              </button>
            ) : <span />}
            <button
              onClick={() => setPriorityDialogOpen(false)}
              style={{ fontSize: '11px', fontWeight: '700', color: '#746e69', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.08em', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#1c1917')}
              onMouseLeave={e => (e.currentTarget.style.color = '#746e69')}
            >
              Cancelar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
