import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, AlertCircle, Eye, Search, X, FileImage, Maximize2, Trash2, Paperclip, Recycle } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { FilePreview } from "@/components/file-preview";
import { parseDateLocal } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState, useMemo, useEffect, Fragment, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { STATUS, getStatusMeta } from "@/lib/status";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";

// Tons de texto desta paleta valem para superfícies CLARAS (bg/surface).
// Sobre os painéis escuros (#0c0a09/#1c1917) use #a8a29e ou mais claro —
// #746e69 e #57534e reprovam WCAG AA nesses fundos.
const TI = {
  bg: "#fafaf9", surface: "#ffffff", border: "#e7e5e4",
  text: "#1c1917", secondary: "#746e69", muted: "#a8a29e",
  accent: "#f97316", dark: "#0c0a09",
};

// Status que esta tela revisa. O vocabulário canônico (rótulo/cores) vive em
// lib/status: "awaiting_final_review" → "Aguardando Revisão Final".
const REVIEW_STATUS = "awaiting_final_review";

// Config do HISTÓRICO: ações de log que correspondem a status do vocabulário
// herdam rótulo e cor de lib/status; o mapa abaixo cobre apenas os tipos de
// log que NÃO são status. Vive fora do componente para não ser recriado a
// cada render.
// `dot` (tom saturado 500) é só da bolinha; `text` (tom escuro 700, AA sobre
// fundo claro) é o que vai no rótulo — mesma disciplina do StatusMeta.
const NON_STATUS_LOG_CFG: Record<string, { label: string; dot: string; text: string }> = {
  updated:          { label: "Atualizado",            dot: "#f97316", text: "#c2410c" },
  rejected:         { label: "Reprovado",             dot: "#ef4444", text: "#b91c1c" },
  submitted:        { label: "Enviado",               dot: "#0e7490", text: "#0e7490" },
  linked:           { label: "Vinculado",             dot: "#0f766e", text: "#0f766e" },
  released:         { label: "Liberado",              dot: "#3b82f6", text: "#1d4ed8" },
  status_changed:   { label: "Status alterado",       dot: "#f97316", text: "#c2410c" },
  sponsor_approved: { label: "Patrocinador aprovado", dot: "#10b981", text: "#047857" },
  sponsor_rejected: { label: "Patrocinador reprovou", dot: "#ef4444", text: "#b91c1c" },
  file_uploaded:    { label: "Arquivo enviado",       dot: "#7e22ce", text: "#7e22ce" },
  thumb_uploaded:   { label: "Thumb enviado",         dot: "#7e22ce", text: "#7e22ce" },
};

function getLogCfg(log: any): { label: string; dot: string; text: string } {
  const action = log?.action as string | undefined;
  if (action && STATUS[action]) {
    const m = getStatusMeta(action);
    return { label: m.label, dot: m.dot, text: m.text };
  }
  if (action && NON_STATUS_LOG_CFG[action]) return NON_STATUS_LOG_CFG[action];
  return { label: action?.replace(/_/g, " ") ?? log?.details ?? "Ação", dot: "#a8a29e", text: "#746e69" };
}

export default function Solicitacao() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [returnObservations, setReturnObservations] = useState("");
  const [editingQuantity, setEditingQuantity] = useState(false);
  const [quantityValue, setQuantityValue] = useState<number>(1);
  const quantityInputRef = useRef<HTMLInputElement>(null);
  const [releaseConfirmOpen, setReleaseConfirmOpen] = useState(false);
  // Campo de observação do card: precisa existir por conta própria, sem
  // depender de "Liberar" ou "Devolver" — a pessoa pode querer deixar um
  // recado (cor, acabamento, posição) sem estar pronta para tomar nenhuma das
  // duas decisões ainda.
  const [cardObservations, setCardObservations] = useState("");
  const [bulkReleaseConfirmOpen, setBulkReleaseConfirmOpen] = useState(false);
  const [bulkReturnConfirmOpen, setBulkReturnConfirmOpen] = useState(false);
  const [bulkReturnObservations, setBulkReturnObservations] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [deleteConfirmItemId, setDeleteConfirmItemId] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>([]);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const isMobile = useIsMobile();
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: events = [], isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = useQuery<any[]>({ queryKey: ["/api/events"] });
  // Histórico da peça: só busca com o modal aberto, já filtrado e limitado no
  // servidor. A chave em duas partes ("/api/audit-logs" + querystring) mantém
  // o prefixo casando com as invalidateQueries(["/api/audit-logs"]) das
  // mutations (o queryFn junta as partes com "/").
  const { data: itemAuditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", `?entityId=${selectedItem?.id}&limit=8`],
    enabled: modalOpen && !!selectedItem?.id,
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  const updateQuantityMutation = useMutation({
    // apiRequest devolve o Response cru — sem o json() o "updatedItem" era o
    // Response e updatedItem.quantity saía sempre undefined.
    mutationFn: async ({ itemId, quantity }: { itemId: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/items/${itemId}`, { quantity });
      return await res.json();
    },
    onSuccess: (updatedItem: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => prev ? { ...prev, quantity: updatedItem.quantity ?? quantityValue } : prev);
      setEditingQuantity(false);
      toast({ title: "Quantidade atualizada", description: `Nova quantidade: ${updatedItem.quantity ?? quantityValue}x` });
    },
    onError: (error: any) => toast({ title: "Erro ao atualizar quantidade", description: error.message, variant: "destructive" }),
  });

  const updateObservationsMutation = useMutation({
    mutationFn: async ({ itemId, observations }: { itemId: string; observations: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}`, { observations }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItem((prev: any) => prev ? { ...prev, observations: cardObservations } : prev);
      toast({ title: "Observação salva" });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar observação", description: error.message, variant: "destructive" }),
  });

  const creatorReviewMutation = useMutation({
    mutationFn: async ({ itemId }: { itemId: string }) => await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setModalOpen(false); setSelectedItem(null); setReleaseConfirmOpen(false);
      toast({ title: "Peça liberada para produção!", description: "Pronto para produção — a Arte foi notificada." });
    },
    onError: (error: any) => toast({ title: "Erro ao liberar peça", description: error.message, variant: "destructive" }),
  });

  const bulkReleaseMutation = useMutation({
    // LIBERAÇÃO não tem rota em lote (/bulk-creator-review não existe: a
    // chamada caía no fallback do SPA — 200 + HTML — e a tela dava "peças
    // liberadas" sem nada acontecer). Usa a rota individual, idempotente, e
    // reporta o que de fato passou. Devolução é diferente: essa TEM rota em
    // lote (bulk-return-to-arte), usada pelo bulkReturnMutation abaixo.
    mutationFn: async (itemIds: string[]) => {
      const results = await Promise.allSettled(
        itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/creator-review`, {}))
      );
      const failedIds = itemIds.filter((_, i) => results[i].status === "rejected");
      return { total: itemIds.length, released: itemIds.length - failedIds.length, failed: failedIds.length, failedIds };
    },
    onSuccess: ({ total, released, failed, failedIds }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      // Falha parcial: mantém selecionado só o que falhou, para a pessoa
      // tentar de novo sem re-marcar tudo.
      setSelectedItemIds(new Set(failedIds)); setBulkReleaseConfirmOpen(false);
      if (failed > 0) {
        toast({
          title: "Liberação parcial",
          description: `${released} de ${total} liberada(s). ${failed} não passou(aram) — verifique o status delas.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Peças liberadas", description: `${released} peça(s) liberada(s) para produção.` });
      }
    },
    onError: (error: any) => toast({ title: "Erro ao liberar peças", description: error.message, variant: "destructive" }),
  });

  const returnToArteMutation = useMutation({
    mutationFn: async (payload: { itemId: string; notes: string }) =>
      // PATCH, não POST: a rota é PATCH e o método errado caía no fallback do
      // SPA, que responde 200 com HTML. A tela dava "devolvida com sucesso" e o
      // servidor nunca recebia nada — a peça continuava na fila de revisão.
      await apiRequest("PATCH", `/api/items/${payload.itemId}/return-to-arte`, { notes: payload.notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setModalOpen(false); setSelectedItem(null);
      setReturnConfirmOpen(false); setReturnObservations("");
      toast({ title: "Peça devolvida para Arte", description: "A peça foi devolvida com observações." });
    },
    onError: (error: any) => toast({ title: "Erro ao devolver peça", description: error.message, variant: "destructive" }),
  });

  const bulkReturnMutation = useMutation({
    // Uma chamada só: a rota de lote existe (PATCH /api/items/bulk-return-to-arte)
    // e responde { success, errors, items, failedItemIds }.
    mutationFn: async (payload: { ids: string[]; notes: string }) => {
      const res = await apiRequest("PATCH", "/api/items/bulk-return-to-arte", { itemIds: payload.ids, notes: payload.notes });
      const result: { success: number; errors: number; failedItemIds?: string[] } = await res.json();
      return { total: payload.ids.length, failed: result.errors, failedIds: result.failedItemIds ?? [] };
    },
    onSuccess: ({ total, failed, failedIds }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      // Falha parcial: mantém selecionado só o que falhou, para a pessoa
      // tentar de novo sem re-marcar tudo.
      setSelectedItemIds(new Set(failedIds)); setBulkReturnConfirmOpen(false); setBulkReturnObservations("");
      const ok = total - failed;
      if (failed > 0) {
        toast({ title: "Devolução parcial", description: `${ok} devolvida(s), ${failed} com erro.`, variant: "destructive" });
      } else {
        toast({ title: "Peças devolvidas", description: `${ok} peça(s) devolvida(s) para a Arte.` });
      }
    },
    onError: (error: any) => toast({ title: "Erro ao devolver peças", description: error.message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => await apiRequest("DELETE", `/api/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDeleteConfirmItemId(null);
      toast({ title: "Peça excluída", description: "A peça foi removida com sucesso." });
    },
    onError: (error: any) => toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }),
  });

  // Diálogo de reaproveitamento (total ou parcial)
  const [reuseDialogItemId, setReuseDialogItemId] = useState<string | null>(null);
  const [partialReuseQty, setPartialReuseQty] = useState(1);

  const toggleReuseMutation = useMutation({
    mutationFn: async ({ itemId, isReuse }: { itemId: string; isReuse: boolean }) => {
      await apiRequest("PATCH", `/api/items/${itemId}`, { isReuse });
      // Ao marcar reaproveitamento, libera automaticamente para Gráfica (status → produced)
      if (isReuse) {
        try {
          await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, {});
        } catch {
          return { statusAdvanced: false };
        }
      }
      return { statusAdvanced: true };
    },
    onSuccess: (result, { isReuse }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      const advanced = (result as any)?.statusAdvanced !== false;
      if (isReuse && !advanced) {
        // A marcação gravou mas o creator-review falhou: nada de prometer
        // atualização automática — a liberação precisa ser feita à mão.
        toast({
          title: "Reaproveitamento marcado, mas não liberado",
          description: "A liberação automática falhou. Abra a peça e clique em \"Liberar para Produção\" manualmente.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: isReuse ? "Reaproveitamento confirmado" : "Marcação removida",
        description: isReuse
          ? "Peça enviada diretamente para a Gráfica como produzida."
          : "A peça voltará ao fluxo normal.",
      });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  // Reaproveitamento parcial: define reuseQty e avança via creator-review
  const partialReuseMutation = useMutation({
    mutationFn: async ({ itemId, reuseQty }: { itemId: string; reuseQty: number }) => {
      // creator-review aceita reuseQty no body para registrar o parcial e
      // avança para ready_for_production (as demais unidades ainda vão para produção)
      await apiRequest("PATCH", `/api/items/${itemId}/creator-review`, { reuseQty });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setReuseDialogItemId(null);
      toast({
        title: "Reaproveitamento parcial confirmado",
        description: "As unidades reaproveitadas foram registradas. O restante segue para produção.",
      });
    },
    onError: (error: any) => toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }),
  });

  const pendingItems = useMemo(() => items.filter(item => item.status === REVIEW_STATUS), [items]);

  const filteredItems = useMemo(() => pendingItems.filter(item => {
    const matchesSearch = searchTerm === "" ||
      item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.displayId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesEvent = eventFilter.length === 0 || eventFilter.includes(item.eventId);
    const matchesType = itemTypeFilter.length === 0 || itemTypeFilter.includes(item.type);
    return matchesSearch && matchesEvent && matchesType;
  }), [pendingItems, searchTerm, eventFilter, itemTypeFilter]);

  // Seleção sobrevive ao filtro: quando a lista filtrada muda, mantém marcado
  // só o que continua visível — senão "Liberar Selecionadas" agiria sobre
  // peças que a pessoa não está mais vendo.
  useEffect(() => {
    setSelectedItemIds(prev => {
      const visible = new Set(filteredItems.map((i: any) => i.id));
      if (Array.from(prev).every(id => visible.has(id))) return prev;
      return new Set(Array.from(prev).filter(id => visible.has(id)));
    });
  }, [filteredItems]);

  const uniqueItemTypes = useMemo(() => Array.from(new Set(pendingItems.map(i => i.type).filter(Boolean))).sort(), [pendingItems]);
  const eventsWithItems = useMemo(() => {
    const ids = new Set(pendingItems.map(i => i.eventId));
    return events.filter(e => ids.has(e.id));
  }, [pendingItems, events]);

  // Filtros facetados: cada filtro lista só o que existe aqui, aplicando o
  // OUTRO filtro ativo, com contagem por opção.
  const eventFilterOptions = useMemo(() => {
    // Sem dotColor aqui: o EventFilterDropdown em modo múltiplo (o desta tela)
    // não renderiza bolinha — e o mapa local divergia do PRIORITY canônico.
    const byId = new Map(events.map((e: any) => [e.id, e]));
    const map = new Map<string, { value: string; label: string; count: number }>();
    pendingItems
      .filter(i => itemTypeFilter.length === 0 || itemTypeFilter.includes(i.type))
      .forEach((i: any) => {
        if (!i.eventId) return;
        const cur = map.get(i.eventId);
        if (cur) cur.count++;
        else {
          const ev: any = byId.get(i.eventId);
          map.set(i.eventId, { value: i.eventId, label: ev?.name || i.event?.name || 'Sem evento', count: 1 });
        }
      });
    return Array.from(map.values());
  }, [pendingItems, itemTypeFilter, events]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    pendingItems
      .filter(i => eventFilter.length === 0 || eventFilter.includes(i.eventId))
      .forEach((i: any) => {
        if (!i.type) return;
        const cur = map.get(i.type);
        if (cur) cur.count++;
        else map.set(i.type, { value: i.type, label: i.type, count: 1 });
      });
    return Array.from(map.values());
  }, [pendingItems, eventFilter]);

  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    // Dentro do evento: grupo do item padrão, depois tipo.
    const sorted = [...filteredItems].sort((a, b) => {
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      // type pode vir null do banco — sem o fallback o localeCompare lançava.
      return ga.localeCompare(gb) || (a.type || '').localeCompare(b.type || '');
    });
    sorted.forEach(item => {
      const key = item.eventId || "__none__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    });
    // Grupos na ordem da urgência real: saída do caminhão ascendente (quem
    // sai primeiro aparece primeiro), sem data por último, nome desempata.
    const byId = new Map(events.map((e: any) => [e.id, e]));
    const entries = Array.from(map.entries()).sort(([idA], [idB]) => {
      const ea: any = byId.get(idA), eb: any = byId.get(idB);
      const ta = ea?.truckDepartureDate ? new Date(ea.truckDepartureDate).getTime() : Infinity;
      const tb = eb?.truckDepartureDate ? new Date(eb.truckDepartureDate).getTime() : Infinity;
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (ea?.name || "").localeCompare(eb?.name || "");
    });
    return new Map(entries);
  }, [filteredItems, typeToGroup, events]);

  const getEventInfo = (eventId: string) => events.find(e => e.id === eventId);

  const toggleItem = (id: string) => setSelectedItemIds(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });
  const toggleAll = () => {
    selectedItemIds.size === filteredItems.length && filteredItems.length > 0
      ? setSelectedItemIds(new Set())
      : setSelectedItemIds(new Set(filteredItems.map(i => i.id)));
  };

  const openModal = (item: any) => {
    setSelectedItem(item);
    setQuantityValue(item.quantity ?? 1);
    setEditingQuantity(false);
    setReturnObservations("");
    setCardObservations(item.observations || "");
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const handler = (e: KeyboardEvent) => {
      // Quem está digitando num campo (textarea de observação, input de
      // quantidade...) não pode ter Enter/Esc sequestrados pelo atalho.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.tagName === "SELECT" || t.isContentEditable)) return;
      // Com foco em botão/link, Enter ativa o próprio elemento — agir aqui
      // também abriria dois diálogos de uma vez.
      if (t && t.closest("button,a")) return;
      // Com um AlertDialog de confirmação aberto por cima, Enter/Esc são dele
      // (o Radix cuida); agir aqui fechava as duas camadas de uma vez.
      if (releaseConfirmOpen || returnConfirmOpen) return;
      // Mesma checagem do botão "Liberar para Produção": sem arquivo final,
      // o atalho não pode driblar o botão desabilitado.
      if (e.key === "Enter" && selectedItem?.finalFileUrl) setReleaseConfirmOpen(true);
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [modalOpen, selectedItem, releaseConfirmOpen, returnConfirmOpen]);

  if (itemsLoading || eventsLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: TI.accent }} />
      </div>
    );
  }

  if (itemsError || eventsError) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, textAlign: "center", padding: "0 24px" }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", margin: 0 }}>
          {itemsError ? "Não foi possível carregar os itens" : "Não foi possível carregar os eventos"}
        </p>
        <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>Verifique sua conexão e tente novamente.</p>
        <button onClick={() => { refetchItems(); refetchEvents(); }} style={{ marginTop: 4, background: TI.text, color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: TI.bg, height: "100%", overflowY: "auto" }}>

      {/* ── 1. HERO HEADER ─────────────────────────────────────────────── */}
      <section style={{ backgroundColor: "#0c0a09", color: "#fff", padding: isMobile ? "24px 12px" : "48px 32px", position: "relative", overflow: "hidden" }}>
        {/* Decorative icon */}
        <div style={{ position: "absolute", right: -60, top: "50%", transform: "translateY(-50%)", opacity: 0.04, pointerEvents: "none", fontSize: 280, lineHeight: 1, userSelect: "none", color: "#fff" }}>
          <Eye style={{ width: 280, height: 280 }} />
        </div>

        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-start", gap: 32, position: "relative", zIndex: 1 }}>
          {/* Left */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, flex: 1 }}>
            <span style={{
              display: "inline-block", padding: "4px 12px",
              backgroundColor: "#1c1917", fontSize: 10, fontWeight: 700,
              letterSpacing: "0.18em", textTransform: "uppercase", color: "#d6d3d1",
              borderLeft: "2px solid #f97316",
            }}>
              REVISÃO FINAL
            </span>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900,
              fontSize: isMobile ? 32 : 56, letterSpacing: "-0.04em", color: "#fff",
              lineHeight: 1, margin: 0,
            }}>
              Revisão do Criador
            </h1>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                backgroundColor: "#1c1917", padding: "8px 16px", borderRadius: 8,
                border: "1px solid #292524",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#f97316", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#a8a29e" }}>Aguardando:</span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: "#fff" }}>{pendingItems.length}</span>
              </div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                backgroundColor: "#1c1917", padding: "8px 16px", borderRadius: 8,
                border: "1px solid #292524",
              }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#10b981", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#a8a29e" }}>Selecionadas:</span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 18, color: "#f97316" }}>{selectedItemIds.size}</span>
              </div>
            </div>
          </div>

          {/* Right — quick action panel */}
          <div style={{
            backgroundColor: "rgba(28,25,23,0.8)", backdropFilter: "blur(12px)",
            padding: 24, borderRadius: 12, border: "1px solid #292524",
            width: isMobile ? "100%" : 280, display: "flex", flexDirection: "column", gap: 16, flexShrink: isMobile ? 1 : 0,
          }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", letterSpacing: "0.18em", textTransform: "uppercase", margin: 0 }}>AÇÃO RÁPIDA</p>
            <button
              onClick={() => selectedItemIds.size > 0 && setBulkReleaseConfirmOpen(true)}
              disabled={selectedItemIds.size === 0 || bulkReleaseMutation.isPending}
              data-testid="button-bulk-release-hero"
              style={{
                width: "100%", padding: "12px 0", borderRadius: 6, border: "none",
                backgroundColor: selectedItemIds.size === 0 ? "#292524" : "#9d4300",
                color: selectedItemIds.size === 0 ? "rgba(255,255,255,0.45)" : "#fff",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                cursor: selectedItemIds.size === 0 || bulkReleaseMutation.isPending ? "not-allowed" : "pointer",
              }}>
              {bulkReleaseMutation.isPending
                ? "Processando..."
                : `Liberar Selecionadas ${selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ""}`}
            </button>
            <button
              onClick={() => selectedItemIds.size > 0 && setBulkReturnConfirmOpen(true)}
              disabled={selectedItemIds.size === 0 || bulkReturnMutation.isPending}
              data-testid="button-bulk-return-hero"
              style={{
                width: "100%", padding: "12px 0", borderRadius: 6,
                border: "1px solid #44403c",
                backgroundColor: "transparent",
                color: selectedItemIds.size === 0 ? "rgba(255,255,255,0.45)" : "#d6d3d1",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em",
                cursor: selectedItemIds.size === 0 || bulkReturnMutation.isPending ? "not-allowed" : "pointer",
              }}>
              {bulkReturnMutation.isPending
                ? "Processando..."
                : `Devolver Selecionadas ${selectedItemIds.size > 0 ? `(${selectedItemIds.size})` : ""}`}
            </button>
          </div>
        </div>
      </section>

      {/* ── 2. FILTER BAR ──────────────────────────────────────────────── */}
      <section style={{
        backgroundColor: "#fff", padding: isMobile ? "12px 12px" : "12px 32px",
        borderBottom: `1px solid ${TI.border}`,
        position: "sticky", top: 0, zIndex: 30,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: TI.muted, pointerEvents: "none" }} />
            <input
              placeholder="Filtrar por ID ou descrição..."
              aria-label="Filtrar por ID ou descrição"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              data-testid="input-search"
              style={{ width: "100%", paddingLeft: 34, paddingRight: searchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9, backgroundColor: "#f3f4f3", border: "none", borderRadius: 8, fontSize: 13, color: TI.text, boxSizing: "border-box" }}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} aria-label="Limpar busca" style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: TI.muted, padding: 8, display: "flex" }}>
                <X style={{ width: 13, height: 13 }} />
              </button>
            )}
          </div>

          {/* Event select */}
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={setEventFilter}
            options={eventFilterOptions}
          />

          {/* Type select */}
          <FilterSelect
            label="Tipo de Peça" allLabel="Todos os tipos"
            values={itemTypeFilter} onValuesChange={setItemTypeFilter}
            options={typeFilterOptions}
            searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
            testId="select-type-filter"
            triggerStyle={{ backgroundColor: "#f3f4f3", border: "none", fontSize: 13, color: TI.text, minWidth: 150 }}
          />

          {(searchTerm || eventFilter.length > 0 || itemTypeFilter.length > 0) && (
            <button
              onClick={() => { setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]); }}
              data-testid="button-clear-filters"
              style={{ fontSize: 11, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", padding: "0 8px" }}>
              Limpar filtros
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {filteredItems.length > 0 && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: TI.secondary, cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                  ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length; }}
                  onChange={toggleAll}
                  data-testid="checkbox-select-all"
                  style={{ accentColor: TI.accent, width: 20, height: 20 }}
                />
                Selecionar todos
              </label>
            )}
            <span style={{ fontSize: 11, color: TI.secondary, whiteSpace: "nowrap" }}>
              {filteredItems.length} de {pendingItems.length} peças
            </span>
          </div>
        </div>
      </section>

      {/* ── 3 & 4. HIGH-DENSITY TABLE ──────────────────────────────────── */}
      <section style={{ padding: isMobile ? "12px 12px" : "32px", maxWidth: 1200, margin: "0 auto", paddingBottom: isMobile ? 20 : 80 }}>
        {filteredItems.length === 0 ? (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, textAlign: "center", padding: "80px 24px" }}>
            <CheckCircle style={{ width: 48, height: 48, color: "#d1cfce", margin: "0 auto 16px" }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: TI.secondary, margin: "0 0 8px" }}>
              {pendingItems.length === 0 ? "Tudo revisado!" : "Nenhum resultado encontrado"}
            </p>
            <p style={{ fontSize: 13, color: TI.secondary, margin: 0 }}>
              {pendingItems.length === 0 ? "Não há itens aguardando sua revisão no momento." : "Tente ajustar os filtros."}
            </p>
          </div>
        ) : isMobile ? (
          <div>
            {Array.from(itemsByEvent.entries()).map(([eventKey, eventItems]) => {
              const evInfo = getEventInfo(eventKey);
              return (
                <div key={eventKey} style={{marginBottom:16}}>
                  {/* Event header */}
                  <div style={{padding:"8px 0 6px", borderBottom:"2px solid #f97316", marginBottom:8}}>
                    <span style={{fontSize:11,fontWeight:900,textTransform:"uppercase",letterSpacing:"0.08em",color:"#746e69"}}>{evInfo?.name || "Sem Evento"}</span>
                  </div>
                  {eventItems.map((item:any) => (
                    /* Card mobile: o checkbox fica FORA do alvo role="button"
                       (checkbox aninhado em botão é estrutura inválida para
                       leitor de tela); o corpo do card segue abrindo o modal
                       por toque, Enter e Espaço. */
                    <div key={item.id} style={{position:"relative",backgroundColor:"#fff",border:"1px solid #e7e5e4",borderRadius:8,marginBottom:8}}>
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={()=>toggleItem(item.id)}
                        aria-label={`Selecionar ${item.displayId}`}
                        style={{position:"absolute",top:10,right:10,accentColor:"#f97316",width:20,height:20,padding:2,zIndex:1}}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        aria-label={`Revisar peça ${item.displayId}`}
                        onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(item); } }}
                        onClick={() => openModal(item)}
                        style={{padding:"12px",cursor:"pointer",display:"flex",flexDirection:"column",gap:6}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingRight:32}}>
                          <span style={{fontFamily:"monospace",fontWeight:700,color:"#c2410c",fontSize:13}}>{item.displayId}</span>
                        </div>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
                          <div style={{flex:1}}>
                            <span style={{fontSize:13,fontWeight:700,color:"#1c1917"}}>{item.type}</span>
                            {item.description && <p style={{fontSize:13,color:"#746e69",margin:"2px 0 0"}}>{item.description}</p>}
                          </div>
                          <span style={{fontSize:10,fontWeight:700,color:"#746e69",whiteSpace:"nowrap"}}>{item.quantity}×</span>
                        </div>
                        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                          {item.sponsors?.map((s:any)=><span key={s.id} style={{fontSize:10,padding:"2px 6px",borderRadius:6,backgroundColor:"#f5f5f4",color:"#746e69",fontWeight:600}}>{s.name}</span>)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e7e5e4", borderRadius: 8, overflowX: "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
            <table style={{ width: "100%", minWidth: 860, textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }}>
                  {/* Select all */}
                  <th style={{ padding: "14px 24px", width: 48, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={selectedItemIds.size === filteredItems.length && filteredItems.length > 0}
                      ref={el => { if (el) el.indeterminate = selectedItemIds.size > 0 && selectedItemIds.size < filteredItems.length; }}
                      onChange={toggleAll}
                      aria-label="Selecionar todos"
                      data-testid="checkbox-select-all-header"
                      style={{ accentColor: "#f97316", width: 20, height: 20, cursor: "pointer" }}
                    />
                  </th>
                  {[
                    { label: "ID", w: 120 },
                    { label: "Tipo", w: 160 },
                    { label: "Descrição da Peça", w: undefined },
                    { label: "Qtd", w: 64, center: true },
                    { label: "Dim (LxA)", w: 128 },
                    { label: "M²", w: 80 },
                    { label: "Ações", w: 120, right: true },
                  ].map(col => (
                    <th
                      key={col.label}
                      style={{
                        padding: "14px 16px",
                        width: col.w,
                        textAlign: col.right ? "right" : col.center ? "center" : "left",
                        fontSize: 10, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: "0.1em",
                        color: "#746e69",
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
                  const event = getEventInfo(eventId);
                  const groupSelected = eventItems.every(i => selectedItemIds.has(i.id));
                  const toggleGroup = () => {
                    setSelectedItemIds(prev => {
                      const next = new Set(prev);
                      if (groupSelected) eventItems.forEach(i => next.delete(i.id));
                      else eventItems.forEach(i => next.add(i.id));
                      return next;
                    });
                  };

                  return (
                    <Fragment key={eventId}>
                      {/* ── Group header row ── */}
                      <tr style={{ backgroundColor: "#1c1917", borderTop: "1px solid #292524", borderBottom: "1px solid #292524" }}>
                        <td style={{ padding: "10px 24px", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={groupSelected}
                            onChange={toggleGroup}
                            aria-label={`Selecionar evento ${event?.name || "sem evento"}`}
                            data-testid={`checkbox-group-${eventId}`}
                            style={{ accentColor: "#f97316", width: 20, height: 20, cursor: "pointer", backgroundColor: "#292524" }}
                          />
                        </td>
                        <td colSpan={7} style={{ padding: "10px 16px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <span style={{
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: 11, fontWeight: 900,
                                color: "#fff", textTransform: "uppercase", letterSpacing: "0.06em",
                              }}>
                                {event?.name || "Sem Evento"}
                              </span>
                              <span style={{
                                backgroundColor: "#c2410c", color: "#fff",
                                fontSize: 10, fontWeight: 900,
                                padding: "1px 8px", borderRadius: 999,
                                textTransform: "uppercase", letterSpacing: "0.04em",
                              }}>
                                {eventItems.length} PENDENTE{eventItems.length !== 1 ? "S" : ""}
                              </span>
                            </div>
                            {event && (
                              <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#d6d3d1", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexWrap: "wrap", alignItems: "center" }}>
                                {event.startDate && (
                                  <span>Início: <span style={{ color: "#d6d3d1" }}>{parseDateLocal(event.startDate).toLocaleDateString("pt-BR")}</span></span>
                                )}
                                {event.truckDepartureDate && (
                                  <span>Saída: <span style={{ color: "#d6d3d1" }}>{new Date(event.truckDepartureDate).toLocaleDateString("pt-BR", { timeZone: 'UTC' })} {new Date(event.truckDepartureDate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: 'UTC' })}</span></span>
                                )}
                                {event.truckDepartureDate && (() => {
                                  const dls = [
                                    { label: "Lista de Imagens", days: event.deadlineListaImagens  ?? -25 },
                                    { label: "Revisão de Lista", days: event.deadlineRevisaoLista   ?? -8  },
                                  ];
                                  const tod = new Date(); tod.setHours(0,0,0,0);
                                  return dls.map(({ label, days }) => {
                                    const d = new Date(new Date(event.truckDepartureDate).getTime() + days * 86400000);
                                    d.setHours(0,0,0,0);
                                    const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                                    const ds = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                                    const s = diff < 0
                                      ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
                                      : diff === 0
                                      ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
                                      : diff <= 3
                                      ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
                                      : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
                                    return (
                                      <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: "0.04em", whiteSpace: "nowrap", textTransform: "none" }}>
                                        {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                                      </span>
                                    );
                                  });
                                })()}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* ── Item rows ── */}
                      {eventItems.map((item, idx) => {
                        const isSelected = selectedItemIds.has(item.id);
                        const isLast = idx === eventItems.length - 1;
                        const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                        const showTypeHeader = !prevItem || prevItem.type !== item.type;
                        const itemGroupName = typeToGroup[item.type] || '';
                        const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                        const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;
                        return (
                          <Fragment key={item.id}>
                            {showGroupHeader && (
                              <tr style={{ backgroundColor: '#dbeafe' }}>
                                <td colSpan={8} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{itemGroupName}</span>
                                </td>
                              </tr>
                            )}
                            {showTypeHeader && (
                              <tr style={{ backgroundColor: '#f0ede8' }}>
                                <td colSpan={8} style={{ padding: '5px 16px' }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
                                </td>
                              </tr>
                            )}
                          <tr
                            key={`row-${item.id}`}
                            data-testid={`row-item-${item.id}`}
                            style={{
                              borderBottom: isLast ? "none" : "1px solid #f0efee",
                              backgroundColor: isSelected ? "#fff8f5" : "#fff",
                              transition: "background-color 0.1s",
                              cursor: "default",
                            }}
                            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = "#fafaf9"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = isSelected ? "#fff8f5" : "#fff"; }}
                          >
                            {/* Checkbox */}
                            <td style={{ padding: "14px 24px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleItem(item.id)}
                                aria-label={`Selecionar ${item.displayId}`}
                                data-testid={`checkbox-item-${item.id}`}
                                style={{ accentColor: "#f97316", width: 20, height: 20, cursor: "pointer" }}
                              />
                            </td>

                            {/* ID */}
                            <td style={{ padding: "14px 16px" }}>
                              <span
                                data-testid={`text-display-id-${item.id}`}
                                style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#c2410c", letterSpacing: "-0.02em" }}
                              >
                                {item.displayId}
                              </span>
                            </td>

                            {/* Tipo */}
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, fontWeight: 900, textTransform: "uppercase", color: TI.text, letterSpacing: "0.02em" }}>
                                  {item.type}
                                </span>
                                {item.isReuse && (
                                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 7px" }}>
                                    Reaproveit.
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Descrição */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontSize: 13, fontWeight: 500, color: TI.secondary }}>
                                {item.description || "—"}
                              </span>
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência visual" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 6px', marginTop: 4, marginLeft: 4 }} data-testid={`link-reference-solicitacao-${item.id}`}>
                                  <Paperclip style={{ width: 9, height: 9 }} />
                                  Ref. visual
                                </a>
                              )}
                            </td>

                            {/* Qtd */}
                            <td style={{ padding: "14px 16px", textAlign: "center" }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: TI.text }}>
                                {item.quantity}
                              </span>
                            </td>

                            {/* Dimensões */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontFamily: "monospace", fontSize: 11, color: TI.secondary }}>
                                {item.fileWidth && item.fileHeight ? `${item.fileWidth}x${item.fileHeight}` : "—"}
                              </span>
                            </td>

                            {/* M² */}
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontSize: 13, fontWeight: 900, color: item.calculatedM2 ? TI.text : "#78716c" }}>
                                {item.calculatedM2 || "—"}
                              </span>
                            </td>

                            {/* Ação */}
                            <td style={{ padding: "14px 16px", textAlign: "right" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                                <button
                                  onClick={() => openModal(item)}
                                  data-testid={`button-review-${item.id}`}
                                  style={{
                                    backgroundColor: "#1c1917", color: "#fff",
                                    border: "none", borderRadius: 6,
                                    fontSize: 10, fontWeight: 900,
                                    textTransform: "uppercase", letterSpacing: "0.08em",
                                    padding: "6px 16px", cursor: "pointer",
                                    transition: "background-color 0.15s",
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#ea580c")}
                                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#1c1917")}
                                >
                                  Revisar
                                </button>
                                <button
                                  onClick={() => {
                                    if (item.isReuse) {
                                      // Se já está marcado como reaproveitamento total, desfaz
                                      toggleReuseMutation.mutate({ itemId: item.id, isReuse: false });
                                    } else {
                                      // Abre o diálogo para escolher total ou parcial
                                      setPartialReuseQty(Math.max(1, Number(item.quantity) - 1 || 1));
                                      setReuseDialogItemId(item.id);
                                    }
                                  }}
                                  data-testid={`button-reuse-${item.id}`}
                                  title={item.isReuse ? "Remover marcação de reaproveitamento" : "Marcar para reaproveitamento"}
                                  style={{
                                    background: item.isReuse ? "#dcfce7" : "none",
                                    border: item.isReuse ? "1px solid #86efac" : "1px solid transparent",
                                    cursor: "pointer",
                                    color: item.isReuse ? "#15803d" : "#746e69",
                                    padding: 6,
                                    display: "flex", alignItems: "center",
                                    borderRadius: 6, transition: "all 0.15s",
                                  }}
                                  onMouseEnter={e => {
                                    if (!item.isReuse) {
                                      (e.currentTarget as HTMLButtonElement).style.color = "#15803d";
                                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f0fdf4";
                                    }
                                  }}
                                  onMouseLeave={e => {
                                    if (!item.isReuse) {
                                      (e.currentTarget as HTMLButtonElement).style.color = "#746e69";
                                      (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                                    }
                                  }}
                                >
                                  <Recycle style={{ width: 15, height: 15 }} />
                                </button>
                                {/* Toda peça desta tela está em awaiting_final_review —
                                    status TRAVADO para "solicitacao" no DELETE do servidor.
                                    Mostrar a lixeira para esse perfil só rendia um 403. */}
                                {user?.role === "admin" && (
                                  <button
                                    onClick={() => setDeleteConfirmItemId(item.id)}
                                    data-testid={`button-delete-${item.id}`}
                                    title="Excluir peça"
                                    style={{
                                      background: "none", border: "none", cursor: "pointer",
                                      color: "#746e69", padding: 6,
                                      display: "flex", alignItems: "center",
                                      borderRadius: 6, transition: "color 0.15s",
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "#746e69")}
                                  >
                                    <Trash2 style={{ width: 15, height: 15 }} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer */}
            <div style={{
              backgroundColor: "#fafaf9", padding: "12px 24px",
              borderTop: "1px solid #e7e5e4",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Mostrando {filteredItems.length} de {pendingItems.length} iten{pendingItems.length !== 1 ? "s" : ""} pendente{pendingItems.length !== 1 ? "s" : ""}
              </span>
              {selectedItemIds.size > 0 && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setBulkReleaseConfirmOpen(true)}
                    data-testid="button-bulk-release-table"
                    style={{ fontSize: 10, fontWeight: 700, padding: "5px 14px", borderRadius: 6, backgroundColor: "#1c1917", color: "#fff", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Liberar {selectedItemIds.size}
                  </button>
                  <button
                    onClick={() => setBulkReturnConfirmOpen(true)}
                    data-testid="button-bulk-return-table"
                    style={{ fontSize: 10, fontWeight: 700, padding: "5px 14px", borderRadius: 6, backgroundColor: "transparent", color: "#b91c1c", border: "1px solid #b91c1c", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Devolver {selectedItemIds.size}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 5. REVIEW MODAL ────────────────────────────────────────────── */}
      <Dialog open={modalOpen} onOpenChange={open => { setModalOpen(open); if (!open) setReturnObservations(""); }}>
        <DialogContent className={`review-dialog-shell max-w-6xl p-0 gap-0 rounded-xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`} style={{ height: isMobile ? "94dvh" : "87vh", maxHeight: 900, maxWidth: isMobile ? "95vw" : undefined }} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">Decisão de Revisão</DialogTitle>
          <DialogDescription className="sr-only">
            Compare o thumb aprovado pelo patrocinador com o arquivo final da Arte e libere ou devolva a peça
          </DialogDescription>
          <div className="review-modal-columns" style={{ height: "100%" }}>

            {/* Left column — comparação aprovado × final (40%) */}
            <div style={{ width: isMobile ? "100%" : "40%", backgroundColor: "#f5f5f4", display: "flex", flexDirection: "column", borderRight: "1px solid #e7e5e4", overflow: "hidden" }}>
              {/* Left header */}
              <div style={{ padding: "14px 18px", backgroundColor: "#1c1917", borderBottom: "2px solid #f97316", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#fff" }}>Comparação de Arquivos</span>
                {selectedItem?.finalFileUrl && (
                  <a
                    href={selectedItem.finalFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir arquivo final em nova aba"
                    aria-label="Abrir arquivo final em nova aba"
                    style={{ display: "flex", padding: 4, borderRadius: 6, color: "rgba(255,255,255,0.7)" }}
                  >
                    <Maximize2 style={{ width: 16, height: 16 }} />
                  </a>
                )}
              </div>

              {/* Left content — os dois arquivos empilhados, cada um com ~40%
                  da altura da coluna: a decisão da tela É comparar o que o
                  patrocinador aprovou com o que a Arte finalizou. */}
              <div className="review-modal-scroll" style={{ flex: 1, padding: isMobile ? 14 : 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
                {[
                  { label: "Aprovado pelo patrocinador", url: selectedItem?.approvalThumbUrl, empty: "Sem thumb aprovado" },
                  { label: "Arquivo final da Arte", url: selectedItem?.finalFileUrl, empty: "A Arte ainda não subiu o arquivo final" },
                ].map(({ label, url, empty }) => (
                  <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>{label}</p>
                    <div style={{ height: isMobile ? 220 : "32vh", minHeight: 180, width: "100%", backgroundColor: "#fff", borderRadius: 8, overflow: "hidden", border: "1px solid #e7e5e4", boxShadow: "inset 0 1px 4px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {url ? (
                        <FilePreview url={url} noLink objectFit="contain" />
                      ) : (
                        <div style={{ textAlign: "center", color: TI.secondary, padding: 12 }}>
                          <FileImage style={{ width: 32, height: 32, margin: "0 auto 8px", color: "#a8a29e" }} />
                          <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{empty}</p>
                        </div>
                      )}
                    </div>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 700, color: "#c2410c", textDecoration: "none", borderBottom: "1px solid #fed7aa", paddingBottom: 1 }}
                      >
                        Abrir em nova aba
                      </a>
                    )}
                  </div>
                ))}

                {/* File path */}
                <div>
                  <p style={{ fontSize: 10, fontWeight: 900, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Caminho do Arquivo Final</p>
                  {selectedItem?.finalFileUrl ? (
                    <div style={{ backgroundColor: "#e2e2e2", padding: "8px 10px", borderRadius: 6, fontFamily: "monospace", fontSize: 10, color: "#57534e", wordBreak: "break-all" }}>
                      {selectedItem.finalFileUrl}
                    </div>
                  ) : (
                    <div style={{ backgroundColor: "#fff0ee", border: "1px solid #fecaca", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#b91c1c", fontWeight: 600 }}>
                      Nenhum arquivo final enviado
                    </div>
                  )}
                </div>

                {/* Technical metadata grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Tipo", value: selectedItem?.type || "—" },
                    { label: "Material", value: selectedItem?.material || "—" },
                    { label: "Acabamento", value: selectedItem?.finish || "—" },
                    { label: "Dimensões", value: selectedItem?.fileWidth && selectedItem?.fileHeight ? `${selectedItem.fileWidth}×${selectedItem.fileHeight}` : "—" },
                    { label: "M²", value: selectedItem?.calculatedM2 || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ backgroundColor: "#fff", padding: "10px 12px", borderRadius: 8, border: "1px solid #e7e5e4" }}>
                      <p style={{ fontSize: 10, color: "#746e69", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0 }}>{label}</p>
                      <p style={{ fontSize: 11, fontWeight: 700, color: TI.text, margin: "3px 0 0" }}>{value}</p>
                    </div>
                  ))}

                  {/* Quantidade — editável.
                      Era um <div> com onClick: editar a quantidade só existia
                      para quem usa mouse, e o "· editar" a 8px era o menor
                      texto do app. */}
                  <div
                    role={editingQuantity ? undefined : "button"}
                    tabIndex={editingQuantity ? undefined : 0}
                    aria-label="Editar quantidade"
                    style={{ backgroundColor: "#fff", padding: "10px 12px", borderRadius: 8, border: "1px solid #e7e5e4", cursor: "pointer", position: "relative" }}
                    onClick={() => {
                      if (!editingQuantity) {
                        setEditingQuantity(true);
                        setTimeout(() => quantityInputRef.current?.select(), 50);
                      }
                    }}
                    onKeyDown={e => {
                      if (editingQuantity) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setEditingQuantity(true);
                        setTimeout(() => quantityInputRef.current?.select(), 50);
                      }
                    }}
                    title="Clique para editar a quantidade"
                  >
                    <p style={{ fontSize: 10, color: "#746e69", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.06em", margin: 0, display: "flex", alignItems: "center", gap: 4 }}>
                      Quantidade
                      <span style={{ fontSize: 10, color: "#c2410c", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em" }}>· editar</span>
                    </p>
                    {editingQuantity ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }} onClick={e => e.stopPropagation()}>
                        <input
                          ref={quantityInputRef}
                          type="number"
                          min={1}
                          value={quantityValue}
                          onChange={e => setQuantityValue(Math.max(1, parseInt(e.target.value) || 1))}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue });
                            }
                            if (e.key === "Escape") {
                              setQuantityValue(selectedItem.quantity ?? 1);
                              setEditingQuantity(false);
                            }
                          }}
                          style={{
                            width: 52, padding: "2px 6px", fontSize: 13, fontWeight: 700,
                            border: "1.5px solid #f97316", borderRadius: 6,
                            color: TI.text, background: "#fff9f5",
                          }}
                          data-testid="input-quantity-edit"
                          autoFocus
                        />
                        <button
                          onClick={() => updateQuantityMutation.mutate({ itemId: selectedItem.id, quantity: quantityValue })}
                          disabled={updateQuantityMutation.isPending}
                          style={{ padding: "6px 10px", fontSize: 10, fontWeight: 800, backgroundColor: "#c2410c", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textTransform: "uppercase" }}
                          data-testid="button-confirm-quantity"
                        >
                          {updateQuantityMutation.isPending ? "..." : "OK"}
                        </button>
                        <button
                          onClick={() => { setQuantityValue(selectedItem.quantity ?? 1); setEditingQuantity(false); }}
                          style={{ padding: "6px 8px", fontSize: 10, fontWeight: 800, backgroundColor: "#f3f4f3", color: "#746e69", border: "none", borderRadius: 6, cursor: "pointer" }}
                          data-testid="button-cancel-quantity"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, fontWeight: 700, color: TI.text, margin: "3px 0 0" }}>
                        {selectedItem?.quantity ?? "—"}x
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right column — decision & timeline (60%) */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "#fafaf9", overflow: "hidden" }}>
              {/* Right header — ModalHeader compartilhado (X com aria-label). */}
              <div style={{ flexShrink: 0 }}>
                <ModalHeader
                  variant="confirm"
                  icon={Eye}
                  tint="#c2410c"
                  title="Decisão de Revisão"
                  subtitle={[selectedItem?.displayId && `ID: ${selectedItem.displayId}`, selectedItem?.type].filter(Boolean).join(" | ")}
                  onClose={() => setModalOpen(false)}
                  trailing={selectedItem?.isReuse ? (
                    <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", backgroundColor: "#dcfce7", color: "#166534", borderRadius: 999, padding: "3px 10px", flexShrink: 0 }}>
                      Reaproveitamento
                    </span>
                  ) : undefined}
                />
              </div>

              {/* Right body */}
              <div className="review-modal-scroll" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "18px" : "24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

                {/* Reuse banner */}
                {selectedItem?.isReuse && (
                  <div style={{ backgroundColor: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <Recycle style={{ width: 18, height: 18, color: "#15803d", flexShrink: 0, marginTop: 1 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 800, color: "#166534", margin: 0, textTransform: "uppercase", letterSpacing: "0.05em" }}>Peça para Reaproveitamento</p>
                      <p style={{ fontSize: 11, color: "#166534", margin: "3px 0 0", opacity: 0.8 }}>
                        Esta peça não será enviada para nova produção gráfica. Verifique o arquivo de arte e libere normalmente.
                      </p>
                    </div>
                  </div>
                )}

                {/* Action card (dark) */}
                <div style={{ backgroundColor: "#1c1917", border: "1px solid #292524", padding: isMobile ? 18 : 24, borderRadius: 12, display: "flex", flexDirection: "column", gap: 18, boxShadow: "0 8px 20px rgba(12,10,9,.10)" }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <button
                      onClick={() => setReleaseConfirmOpen(true)}
                      disabled={creatorReviewMutation.isPending || !selectedItem?.finalFileUrl}
                      data-testid="button-release-modal"
                      title={!selectedItem?.finalFileUrl ? "Arquivo final não enviado" : ""}
                      style={{
                        flex: 1, padding: "14px 0", borderRadius: 6, border: "none",
                        backgroundColor: !selectedItem?.finalFileUrl ? "#292524" : "#9d4300",
                        color: !selectedItem?.finalFileUrl ? "#57534e" : "#fff",
                        fontSize: 13, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em",
                        cursor: !selectedItem?.finalFileUrl || creatorReviewMutation.isPending ? "not-allowed" : "pointer",
                      }}
                    >
                      {creatorReviewMutation.isPending ? "Liberando..." : "Liberar para Produção"}
                    </button>
                    <button
                      onClick={() => setReturnConfirmOpen(true)}
                      data-testid="button-return-toggle"
                      style={{
                        flex: 1, padding: "14px 0", borderRadius: 6,
                        border: "1px solid #44403c", backgroundColor: "transparent",
                        color: "#d6d3d1", fontSize: 13, fontWeight: 900,
                        textTransform: "uppercase", letterSpacing: "0.12em", cursor: "pointer",
                      }}
                    >
                      Devolver para Arte
                    </button>
                  </div>
                </div>

                {/* Observações do item — campo próprio, sempre editável.
                    Antes só existia como texto (se já houvesse algo escrito) e
                    a única forma de gravar uma observação era pelo textarea
                    de "Devolver para Arte", ou seja: só dava para anotar algo
                    devolvendo a peça. Aqui a pessoa escreve e salva sem que
                    isso implique liberar ou devolver nada. */}
                <div style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 14px", display: "flex", gap: 8 }}>
                  <AlertCircle style={{ width: 14, height: 14, color: "#d97706", flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: "0 0 6px" }}>Observações do item</p>
                    <textarea
                      placeholder="Deixe um recado sobre esta peça (cor, acabamento, posição...)"
                      value={cardObservations}
                      onChange={e => setCardObservations(e.target.value)}
                      data-testid="textarea-item-observations"
                      style={{
                        width: "100%", minHeight: 60, padding: "8px 10px", borderRadius: 6,
                        border: "1px solid #fde68a", backgroundColor: "#fffdf5",
                        color: "#78350f", fontSize: 13, resize: "vertical",
                        fontFamily: "inherit", boxSizing: "border-box",
                      }}
                    />
                    {cardObservations !== (selectedItem?.observations || "") && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                          onClick={() => selectedItem && updateObservationsMutation.mutate({ itemId: selectedItem.id, observations: cardObservations })}
                          disabled={updateObservationsMutation.isPending}
                          data-testid="button-save-observations"
                          style={{
                            padding: "6px 14px", borderRadius: 6, border: "none",
                            backgroundColor: "#d97706", color: "#fff",
                            fontSize: 12, fontWeight: 700, cursor: updateObservationsMutation.isPending ? "not-allowed" : "pointer",
                          }}
                        >
                          {updateObservationsMutation.isPending ? "Salvando..." : "Salvar observação"}
                        </button>
                        <button
                          onClick={() => setCardObservations(selectedItem?.observations || "")}
                          style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "none", color: "#92400e", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          Descartar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Patrocinadores da peça — quem aprovou o thumb que está
                    sendo comparado ali ao lado. Vem no payload de /api/items. */}
                {(selectedItem?.sponsors?.length ?? 0) > 0 && (
                  <div>
                    <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: TI.secondary, paddingBottom: 10, borderBottom: "1px solid #f0efee", margin: "0 0 12px" }}>
                      PATROCINADORES DA PEÇA
                    </h3>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {selectedItem.sponsors.map((s: any) => (
                        <span key={s.id} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, backgroundColor: "#f5f5f4", border: "1px solid #e7e5e4", color: TI.secondary }}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* History timeline */}
                <div>
                  <h3 style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.18em", color: TI.secondary, paddingBottom: 10, borderBottom: "1px solid #f0efee", margin: "0 0 20px" }}>
                    HISTÓRICO
                  </h3>
                  {itemAuditLogs.length === 0 ? (
                    <p style={{ fontSize: 13, color: TI.secondary }}>Sem histórico disponível.</p>
                  ) : (
                    <div style={{ position: "relative", paddingLeft: 24 }}>
                      {/* Vertical line */}
                      <div style={{ position: "absolute", left: 11, top: 8, bottom: 0, width: 2, backgroundColor: "#f0efee" }} />
                      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                        {itemAuditLogs.map((log: any, idx: number) => {
                          const cfg = getLogCfg(log);
                          return (
                            <div key={log.id || idx} style={{ position: "relative" }}>
                              <span style={{
                                position: "absolute", left: -22, top: 2,
                                width: 16, height: 16, borderRadius: "50%",
                                backgroundColor: "#fff", border: `4px solid ${cfg.dot}`, zIndex: 1,
                              }} />
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                                <div>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: cfg.text, margin: 0 }}>{cfg.label}</p>
                                  {log.userName && <p style={{ fontSize: 10, color: TI.secondary, margin: "2px 0 0" }}>{log.userName}</p>}
                                  {log.details && log.action && (
                                    <p style={{ fontSize: 11, fontStyle: "italic", color: TI.secondary, backgroundColor: "#f3f4f3", padding: "6px 8px", borderRadius: 6, margin: "6px 0 0" }}>
                                      "{log.details}"
                                    </p>
                                  )}
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 700, color: "#78716c", whiteSpace: "nowrap", fontFamily: "monospace" }}>
                                  {log.createdAt ? new Date(log.createdAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Rodapé de atalhos: só no desktop — no mobile não há teclado
                  físico e o rodapé roubava altura do modal. */}
              {!isMobile && (
                <div style={{ padding: "14px 24px", backgroundColor: "#fafaf9", borderTop: "1px solid #f0efee", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Atalhos:</span>
                    <span style={{ fontSize: 10, fontWeight: 900, backgroundColor: "#e7e5e4", padding: "2px 6px", borderRadius: 6, color: TI.text }}>Enter</span>
                    <span style={{ fontSize: 10, color: TI.secondary }}>Liberar</span>
                    <span style={{ fontSize: 10, fontWeight: 900, backgroundColor: "#e7e5e4", padding: "2px 6px", borderRadius: 6, color: TI.text }}>Esc</span>
                    <span style={{ fontSize: 10, color: TI.secondary }}>Fechar</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRM DIALOGS ─────────────────────────────────────────────── */}

      {/* Release single */}
      <AlertDialog open={releaseConfirmOpen} onOpenChange={setReleaseConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar para Produção</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> — {selectedItem.type} será liberado para produção.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && creatorReviewMutation.mutate({ itemId: selectedItem.id })}
              disabled={creatorReviewMutation.isPending}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-release-confirm"
            >
              {creatorReviewMutation.isPending ? "Liberando..." : "Liberar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Return to Arte from card (quick) */}
      <AlertDialog open={returnConfirmOpen} onOpenChange={setReturnConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedItem && <span><strong>{selectedItem.displayId}</strong> será devolvido à equipe de Arte.</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: 0 }}>
            <textarea
              placeholder="Descreva as alterações necessárias..."
              value={returnObservations}
              onChange={e => setReturnObservations(e.target.value)}
              data-testid="textarea-return-quick"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-return-cancel" onClick={() => { setReturnObservations(""); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedItem && returnToArteMutation.mutate({ itemId: selectedItem.id, notes: returnObservations })}
              disabled={returnToArteMutation.isPending || !returnObservations.trim()}
              title={!returnObservations.trim() ? "Descreva o motivo da devolução — a Arte precisa saber o que corrigir" : undefined}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-return-confirm"
            >
              {returnToArteMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk release */}
      <AlertDialog open={bulkReleaseConfirmOpen} onOpenChange={setBulkReleaseConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          <AlertDialogHeader>
            <AlertDialogTitle>Liberar {selectedItemIds.size} iten{selectedItemIds.size !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja liberar {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"} para produção?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-release-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkReleaseMutation.mutate(Array.from(selectedItemIds))}
              disabled={bulkReleaseMutation.isPending}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-release-confirm"
            >
              {bulkReleaseMutation.isPending ? "Liberando..." : "Liberar Todos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk return */}
      <AlertDialog open={bulkReturnConfirmOpen} onOpenChange={setBulkReturnConfirmOpen}>
        <AlertDialogContent className="review-confirm-content">
          <AlertDialogHeader>
            <AlertDialogTitle>Devolver {selectedItemIds.size} iten{selectedItemIds.size !== 1 ? "s" : ""} para Arte</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja devolver {selectedItemIds.size} {selectedItemIds.size === 1 ? "item" : "itens"} para a Arte?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div style={{ padding: 0 }}>
            <textarea
              placeholder="Descreva o motivo da devolução..."
              value={bulkReturnObservations}
              onChange={e => setBulkReturnObservations(e.target.value)}
              data-testid="textarea-bulk-return"
              className="w-full min-h-20 p-2 border rounded-md bg-background text-foreground resize-none text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-bulk-return-cancel">Manter Itens</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                bulkReturnMutation.mutate({ ids: Array.from(selectedItemIds), notes: bulkReturnObservations });
              }}
              disabled={bulkReturnMutation.isPending || !bulkReturnObservations.trim()}
              title={!bulkReturnObservations.trim() ? "Descreva o motivo da devolução — a Arte precisa saber o que corrigir" : undefined}
              style={{ backgroundColor: TI.text, color: "#fff" }}
              data-testid="button-bulk-return-confirm"
            >
              {bulkReturnMutation.isPending ? "Devolvendo..." : "Devolver para Arte"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo: escolher reaproveitamento total ou parcial.
          Era um overlay <div> montado à mão: sem Esc, sem armadilha de foco
          (o Tab passeava pela lista atrás), sem devolver o foco ao fechar, e a
          página continuava rolando por baixo. A largura ainda vinha de
          `window.innerWidth` lido na renderização — girar o celular deixava o
          painel no tamanho antigo. */}
      <Dialog open={!!reuseDialogItemId} onOpenChange={o => { if (!o) setReuseDialogItemId(null); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(420)}>
          {(() => {
            const dialogItem = pendingItems.find(i => i.id === reuseDialogItemId);
            if (!dialogItem) return null;
            const qty = Number(dialogItem.quantity) || 1;
            return (
              <>
                <DialogTitle className="sr-only">Reaproveitamento</DialogTitle>
                <DialogDescription className="sr-only">
                  Escolha reaproveitar todas as unidades ou apenas parte delas
                </DialogDescription>
                <ModalHeader
                  variant="confirm"
                  icon={Recycle}
                  tint="#15803d"
                  title="Reaproveitamento"
                  subtitle={`${dialogItem.displayId} · ${dialogItem.type} · ${qty} un.`}
                  onClose={() => setReuseDialogItemId(null)}
                />
                <div style={{ padding: "20px 24px" }}>

              {/* Opção: reaproveitar tudo */}
              <button
                onClick={() => {
                  toggleReuseMutation.mutate({ itemId: dialogItem.id, isReuse: true });
                  setReuseDialogItemId(null);
                }}
                disabled={toggleReuseMutation.isPending || partialReuseMutation.isPending}
                style={{
                  width: "100%", padding: "12px 16px", marginBottom: 10,
                  backgroundColor: "#15803d", color: "#fff",
                  border: "none", borderRadius: 8, cursor: "pointer",
                  fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Recycle style={{ width: 13, height: 13 }} />
                Reaproveitar tudo ({qty} un.) — pula produção
              </button>

              {/* Opção: reaproveitar parcialmente (só aparece se qty > 1) */}
              {qty > 1 && (
                <div style={{ border: "1px solid #e7e5e4", borderRadius: 8, padding: "14px 16px" }}>
                  <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Reaproveitar parcialmente
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input
                      type="number"
                      min={1}
                      max={qty - 1}
                      value={partialReuseQty}
                      onChange={e => setPartialReuseQty(Math.max(1, Math.min(qty - 1, parseInt(e.target.value) || 1)))}
                      aria-label="Unidades reaproveitadas"
                      data-testid="input-partial-reuse-qty"
                      style={{ width: 64, height: 34, padding: "0 8px", borderRadius: 6, border: "1px solid #d4d4d0", fontSize: 15, fontWeight: 700, textAlign: "center" }}
                    />
                    <span style={{ fontSize: 13, color: "#746e69" }}>de {qty} un. reaproveitadas</span>
                  </div>
                  <p style={{ margin: "0 0 10px", fontSize: 11, color: "#746e69" }}>
                    As outras <strong>{qty - partialReuseQty}</strong> un. seguirão para produção normal.
                  </p>
                  <button
                    onClick={() => partialReuseMutation.mutate({ itemId: dialogItem.id, reuseQty: partialReuseQty })}
                    disabled={toggleReuseMutation.isPending || partialReuseMutation.isPending}
                    style={{
                      width: "100%", padding: "10px 16px",
                      backgroundColor: "#0c0a09", color: "#fff",
                      border: "none", borderRadius: 6, cursor: "pointer",
                      fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                    }}
                  >
                    {partialReuseMutation.isPending ? "Salvando..." : `Confirmar ${partialReuseQty} un. reaproveitadas`}
                  </button>
                </div>
              )}

                  <button
                    onClick={() => setReuseDialogItemId(null)}
                    style={{ width: "100%", marginTop: 12, height: 36, background: "none", border: "none", fontSize: 13, color: "#746e69", cursor: "pointer" }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirmItemId} onOpenChange={open => { if (!open) setDeleteConfirmItemId(null); }}>
        <AlertDialogContent className="review-confirm-content">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir peça</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirmItemId && (() => {
                const item = pendingItems.find(i => i.id === deleteConfirmItemId);
                return item ? <span>A peça <strong>{item.displayId}</strong> será permanentemente excluída. Esta ação não pode ser desfeita.</span> : "Esta peça será permanentemente excluída.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault(); // a mutation controla o fechamento (mantém aberto em erro)
                if (deleteConfirmItemId) deleteItemMutation.mutate(deleteConfirmItemId);
              }}
              disabled={deleteItemMutation.isPending}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-delete-confirm"
            >
              {deleteItemMutation.isPending ? "Excluindo..." : "Excluir Peça"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
