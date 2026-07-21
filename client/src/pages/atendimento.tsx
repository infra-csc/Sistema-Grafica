import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SponsorChips } from "@/components/sponsor-chips";
import { CheckCircle, AlertCircle, Eye, Search, X, XCircle, Clock, Loader2, ChevronDown, ChevronRight, Zap, FileText, Download, RotateCcw, Package, Paperclip, Printer, Plus, Pencil, Trash2, Truck, Cog, Send, Link2, Unlock, Upload, ImageIcon, ArrowRightLeft, ChevronsUpDown, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { FilePreview } from "@/components/file-preview";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useState, useMemo, Fragment, useEffect, useRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SponsorApproval {
  id: string;
  itemId: string;
  sponsorId: string;
  status: 'pending' | 'approved' | 'rejected' | 'awaiting_arte' | 'new_version_pending';
  approvedBy?: string | null;
  approvedAt?: Date | null;
  rejectedBy?: string | null;
  rejectedAt?: Date | null;
  rejectionReason?: string | null;
  sponsor?: {
    id: string;
    name: string;
  } | null;
}

export default function Atendimento() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  const [eventComboOpen, setEventComboOpen] = useState(false);
  const [sponsorComboOpen, setSponsorComboOpen] = useState(false);

  // Modal Exportar PDF
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);
  const [expEventFilter, setExpEventFilter] = useState("all");
  const [expSponsorFilter, setExpSponsorFilter] = useState("all");
  const [expGroupFilter, setExpGroupFilter] = useState("all");
  const [expTypeFilter, setExpTypeFilter] = useState("all");
  const [expIncludeNoThumb, setExpIncludeNoThumb] = useState(true);
  const [expGroupByEvent, setExpGroupByEvent] = useState(false);
  const [expStatusFilter, setExpStatusFilter] = useState<"all" | "pending" | "approved">("all");
  const [expEventComboOpen, setExpEventComboOpen] = useState(false);
  const [expSponsorComboOpen, setExpSponsorComboOpen] = useState(false);

  // Seleção múltipla
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [approvedGroupExpanded, setApprovedGroupExpanded] = useState(false);

  // Lote por Patrocinador + Evento
  const [batchSponsorId, setBatchSponsorId]           = useState<string>("");
  const [batchEventId, setBatchEventId]               = useState<string>("");
  const [batchRejectReason, setBatchRejectReason]     = useState<string>("");
  const [batchShowRejectForm, setBatchShowRejectForm] = useState<boolean>(false);
  const [batchSelectedItemIds, setBatchSelectedItemIds] = useState<Set<string>>(new Set());
  const [batchSponsorComboOpen, setBatchSponsorComboOpen] = useState(false);

  // Map para rastrear patrocinadores de cada item
  const [itemSponsorsMap, setItemSponsorsMap] = useState<Record<string, any[]>>({});
  const [loadingSponsors, setLoadingSponsors] = useState(false);

  // Map para rastrear aprovações de cada item (para mostrar na tabela)
  const [itemApprovalsMap, setItemApprovalsMap] = useState<Record<string, SponsorApproval[]>>({});

  // Request ID para evitar race conditions
  const requestIdRef = useRef(0);

  // State para aprovações individuais de patrocinadores (no diálogo)
  const [sponsorApprovals, setSponsorApprovals] = useState<SponsorApproval[]>([]);
  const [loadingSponsorApprovals, setLoadingSponsorApprovals] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectingSponsorId, setRejectingSponsorId] = useState<string | null>(null);

  // Confirmação de aprovação
  const [confirmApproveIndividual, setConfirmApproveIndividual] = useState<{ itemId: string; sponsorId: string; sponsorName: string } | null>(null);
  const [confirmApproveBatch, setConfirmApproveBatch] = useState(false);

  const { data: items = [], isLoading: itemsLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs"],
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Memoizar awaiting items para evitar fetches desnecessários
  const awaitingItems = useMemo(() =>
    items.filter(item =>
      item.status === 'awaiting_sponsor_approval' && !item.skipApproval
    ), [items]
  );

  // Carregar patrocinadores e aprovações de items pendentes
  useEffect(() => {
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    if (awaitingItems.length === 0) {
      setItemSponsorsMap({});
      setItemApprovalsMap({});
      setLoadingSponsors(false);
      return;
    }

    setLoadingSponsors(true);

    Promise.all(
      awaitingItems.map(async (item) => {
        try {
          const [sponsorsRes, approvalsRes] = await Promise.all([
            apiRequest("GET", `/api/items/${item.id}/sponsors`),
            apiRequest("GET", `/api/items/${item.id}/sponsor-approvals`)
          ]);
          const itemSponsors = await sponsorsRes.json();
          const itemApprovals = await approvalsRes.json();
          return { itemId: item.id, sponsors: itemSponsors, approvals: itemApprovals };
        } catch (error) {
          console.error(`Erro ao carregar dados do item ${item.id}:`, error);
          return { itemId: item.id, sponsors: [], approvals: [] };
        }
      })
    ).then(results => {
      if (currentRequestId === requestIdRef.current) {
        const sponsorsMap = results.reduce((acc, { itemId, sponsors }) => ({
          ...acc,
          [itemId]: sponsors
        }), {});

        const approvalsMap = results.reduce((acc, { itemId, approvals }) => ({
          ...acc,
          [itemId]: approvals
        }), {});

        setItemSponsorsMap(sponsorsMap);
        setItemApprovalsMap(approvalsMap);
        setLoadingSponsors(false);
      }
    });
  }, [awaitingItems]);

  // Carregar aprovações individuais de patrocinadores quando o dialog é aberto
  useEffect(() => {
    if (dialogOpen && selectedItem) {
      setLoadingSponsorApprovals(true);
      setSponsorApprovals([]);
      setRejectionReason("");
      setRejectingSponsorId(null);

      apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
        .then(response => response.json())
        .then((approvals: SponsorApproval[]) => {
          setSponsorApprovals(approvals);
          setLoadingSponsorApprovals(false);
        })
        .catch(error => {
          console.error('Error loading sponsor approvals:', error);
          setLoadingSponsorApprovals(false);
        });
    }
  }, [dialogOpen, selectedItem]);

  const individualApproveMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/approve`, {});
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });

      if (data.allApproved) {
        setDialogOpen(false);
        setSelectedItem(null);
        toast({ title: "Todos patrocinadores aprovaram", description: "A peça avançou para finalização do arquivo" });
      } else {
        if (selectedItem) {
          apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
            .then(r => r.json()).then(setSponsorApprovals).catch(console.error);
        }
        toast({ title: "Patrocinador aprovou", description: `${data.approval?.sponsor?.name || 'Patrocinador'} aprovou a peça` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aprovar", description: error.message || "Ocorreu um erro ao aprovar", variant: "destructive" });
    },
  });

  const individualRejectMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId, reason }: { itemId: string; sponsorId: string; reason?: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/reject`, {
        rejectionReason: reason || null
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setRejectionReason("");
      setRejectingSponsorId(null);

      if (selectedItem) {
        apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
          .then(r => r.json()).then(setSponsorApprovals).catch(console.error);
      }

      if (data.allDecided) {
        toast({ title: "Todos patrocinadores decidiram", description: "Peça retornou para Arte refazer o thumb." });
      } else {
        toast({ title: "Reprovação registrada", description: `Aguardando ${data.pendingCount} patrocinador(es).` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reprovar", description: error.message || "Ocorreu um erro ao reprovar", variant: "destructive" });
    },
  });

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({ title: "Peça aprovada", description: "A peça foi aprovada pelo patrocinador com sucesso!" });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aprovar peça", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  const sponsorRejectMutation = useMutation({
    mutationFn: async (itemId: string) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/sponsor-reject`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setDialogOpen(false);
      setSelectedItem(null);
      toast({ title: "Peça reprovada", description: "A peça retornou para a Arte refazer." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reprovar peça", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return await Promise.all(itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/sponsor-approve`, {})));
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      toast({ title: "Peças aprovadas", description: `${itemIds.length} peças aprovadas com sucesso!` });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao aprovar peças", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  const bulkRejectMutation = useMutation({
    mutationFn: async (itemIds: string[]) => {
      return await Promise.all(itemIds.map(id => apiRequest("PATCH", `/api/items/${id}/sponsor-reject`, {})));
    },
    onSuccess: (_, itemIds) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedItemIds(new Set());
      toast({ title: "Peças reprovadas", description: `${itemIds.length} peças retornaram para a Arte.` });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reprovar peças", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  const batchSponsorMutation = useMutation({
    mutationFn: async ({ sponsorId, eventId, action, reason }: {
      sponsorId: string; eventId: string; action: "approve" | "reject"; reason?: string;
    }) => {
      const targetItems = awaitingItems.filter(item =>
        item.eventId === eventId && batchSelectedItemIds.has(item.id)
      );
      const promises = targetItems.flatMap(item => {
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        const approval = approvals.find(a => a.sponsorId === sponsorId);
        const status = approval?.status || "pending";
        if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === sponsorId)) return [];
        if (status !== "pending" && status !== "new_version_pending") return [];
        if (action === "approve") {
          return [apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/approve`, {})];
        } else {
          return [apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/reject`, { rejectionReason: reason || null })];
        }
      });
      return await Promise.all(promises);
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setBatchSponsorId("");
      setBatchEventId("");
      setBatchRejectReason("");
      setBatchShowRejectForm(false);
      toast({
        title: vars.action === "approve" ? "Peças aprovadas em lote" : "Peças reprovadas em lote",
        description: vars.action === "approve"
          ? "Todas as peças selecionadas foram aprovadas para este patrocinador."
          : "Todas as peças selecionadas foram devolvidas para a Arte.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Erro na operação em lote", description: error.message || "Ocorreu um erro", variant: "destructive" });
    },
  });

  const pendingItems = awaitingItems;

  const filteredItems = useMemo(() => {
    return pendingItems.filter(item => {
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) return false;

      const matchesSearch = searchTerm === "" ||
        item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
      const matchesType = itemTypeFilter === "all" || item.type === itemTypeFilter;
      const matchesSponsor = sponsorFilter === "all" ||
        itemSponsorsMap[item.id]?.some(sponsor => sponsor.id === sponsorFilter);

      return matchesSearch && matchesEvent && matchesType && matchesSponsor;
    });
  }, [pendingItems, searchTerm, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors]);

  const uniqueItemGroups = useMemo(() => {
    const groups = new Set(pendingItems.map(item => (item.type ?? "").split(/[\s(]/)[0]).filter(Boolean));
    return Array.from(groups).sort();
  }, [pendingItems]);
  const uniqueItemTypes = useMemo(() => {
    const types = new Set(pendingItems.map(item => item.type).filter(Boolean));
    return Array.from(types).sort();
  }, [pendingItems]);

  // Itens filtrados para o modal de exportação PDF (filtros independentes da página)
  const exportItems = useMemo(() => {
    return pendingItems.filter(item => {
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) return false;
      if (expEventFilter !== "all" && item.eventId !== expEventFilter) return false;
      if (expGroupFilter !== "all") {
        const g = (item.type ?? "").split(/[\s(]/)[0];
        if (g !== expGroupFilter) return false;
      }
      if (expTypeFilter !== "all" && item.type !== expTypeFilter) return false;
      if (expSponsorFilter !== "all" && !itemSponsorsMap[item.id]?.some((s: any) => s.id === expSponsorFilter)) return false;
      if (!expIncludeNoThumb && !item.approvalThumbUrl) return false;
      if (expStatusFilter === "pending" && isItemFullyApproved(item)) return false;
      if (expStatusFilter === "approved" && !isItemFullyApproved(item)) return false;
      return true;
    });
  }, [pendingItems, itemSponsorsMap, loadingSponsors, expEventFilter, expGroupFilter, expTypeFilter, expSponsorFilter, expIncludeNoThumb, expStatusFilter]);

  const isItemEligibleForBatch = (item: any): boolean => {
    const itemSps = itemSponsorsMap[item.id] || [];
    if (itemSps.length !== 1) return false;
    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    if (approvals.some(a => a.status === 'awaiting_arte')) return false;
    const approval = approvals.find(a => a.sponsorId === itemSps[0].id);
    const status = approval?.status || 'pending';
    return status === 'pending' || status === 'new_version_pending';
  };

  const isItemFullyApproved = (item: any): boolean => {
    const itemSps = itemSponsorsMap[item.id] || [];
    if (itemSps.length === 0) return false;
    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return itemSps.every((s: any) => approvals.find(a => a.sponsorId === s.id)?.status === 'approved');
  };

  const pendingGroup = useMemo(() => {
    if (loadingSponsors) return filteredItems;
    return filteredItems.filter(item => !isItemFullyApproved(item));
  }, [filteredItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

  const approvedGroup = useMemo(() => {
    if (loadingSponsors) return [];
    return filteredItems.filter(item => isItemFullyApproved(item));
  }, [filteredItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors]);

  const actionableCount = useMemo(() => {
    if (loadingSponsors) return null;
    return pendingGroup.filter(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
      if (hasArteBlock) return false;
      return approvals.some(a => a.status === 'rejected' || a.status === 'pending' || a.status === 'new_version_pending');
    }).length;
  }, [pendingGroup, itemApprovalsMap, loadingSponsors]);

  const batchEligibleSponsors = useMemo(() => {
    if (loadingSponsors) return [];
    const sponsorSet = new Set<string>();
    awaitingItems.forEach(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const itemSps = itemSponsorsMap[item.id] || [];
      itemSps.forEach((s: any) => {
        const approval = approvals.find(a => a.sponsorId === s.id);
        const status = approval?.status || "pending";
        if (status === "pending" || status === "new_version_pending") sponsorSet.add(s.id);
      });
    });
    return (sponsors as any[]).filter((s: any) => sponsorSet.has(s.id));
  }, [awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, sponsors]);

  const batchEligibleEvents = useMemo(() => {
    if (!batchSponsorId || loadingSponsors) return [];
    const eventSet = new Set<string>();
    awaitingItems.forEach(item => {
      if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === batchSponsorId)) return;
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const approval = approvals.find(a => a.sponsorId === batchSponsorId);
      const status = approval?.status || "pending";
      if (status === "pending" || status === "new_version_pending") eventSet.add(item.eventId);
    });
    return (events as any[]).filter((e: any) => eventSet.has(e.id));
  }, [batchSponsorId, awaitingItems, itemApprovalsMap, itemSponsorsMap, loadingSponsors, events]);

  const batchEligibleItems = useMemo(() => {
    if (!batchSponsorId || !batchEventId) return [];
    return awaitingItems.filter(item => {
      if (item.eventId !== batchEventId) return false;
      if (!itemSponsorsMap[item.id]?.some((s: any) => s.id === batchSponsorId)) return false;
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      const approval = approvals.find(a => a.sponsorId === batchSponsorId);
      const status = approval?.status || "pending";
      return status === "pending" || status === "new_version_pending";
    });
  }, [batchSponsorId, batchEventId, awaitingItems, itemApprovalsMap, itemSponsorsMap]);

  const batchItemCount = batchEligibleItems.length;

  // Group pendingGroup by event - must be before any early return
  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    const sorted = [...pendingGroup].sort((a, b) => {
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      return ga.localeCompare(gb) || a.type.localeCompare(b.type);
    });
    sorted.forEach(item => {
      const eid = item.eventId || '__none__';
      if (!map.has(eid)) map.set(eid, []);
      map.get(eid)!.push(item);
    });
    return map;
  }, [pendingGroup, typeToGroup]);

  useEffect(() => {
    setBatchSelectedItemIds(new Set(batchEligibleItems.map(i => i.id)));
  }, [batchSponsorId, batchEventId]);

  const getEventInfo = (eventId: string) => events.find((e: any) => e.id === eventId);

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setDialogOpen(true);
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) newSet.delete(itemId);
      else newSet.add(itemId);
      return newSet;
    });
  };

  const toggleAllSelection = () => {
    const eligible = filteredItems.filter(isItemEligibleForBatch);
    if (selectedItemIds.size === eligible.length && eligible.length > 0) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(eligible.map(item => item.id)));
    }
  };

  if (itemsLoading || eventsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Carregando itens...</div>
      </div>
    );
  }

  // Normaliza URL GCS raw → /objects/ proxy path
  const normalizeThumbUrl = (raw: string): string => {
    if (raw.startsWith('/')) return raw;
    const match = raw.match(/\/\.private\/(.+?)(?:\?|$)/);
    if (match) return `/objects/${match[1]}`;
    return raw;
  };

  const handleExportPDF = async (itemsToExport: any[], groupByEvent: boolean) => {
    if (itemsToExport.length === 0) {
      toast({ title: "Nenhum item para exportar", variant: "destructive" });
      return;
    }

    // Pré-busca todas as imagens como data URIs antes de abrir a janela
    const rawUrls = [...new Set(itemsToExport.map(i => i.approvalThumbUrl).filter(Boolean) as string[])];
    const thumbDataUris: Record<string, string> = {};
    const imgUrls = rawUrls.filter(u => !/\.pdf$/i.test(u));
    if (imgUrls.length > 0) {
      toast({ title: `Preparando ${imgUrls.length} imagem${imgUrls.length !== 1 ? "ns" : ""}…`, description: "Aguarde um momento" });
      await Promise.allSettled(imgUrls.map(async (rawUrl) => {
        const local = normalizeThumbUrl(rawUrl);
        const fetchUrl = local.startsWith("/") ? `${window.location.origin}${local}` : local;
        try {
          const resp = await fetch(fetchUrl, { credentials: "include" });
          if (!resp.ok) return;
          const ct = resp.headers.get("content-type") || "";
          if (!ct.startsWith("image/")) return;
          const blob = await resp.blob();
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          if (dataUri) thumbDataUris[rawUrl] = dataUri;
        } catch (error) {
          console.warn("Failed to fetch/convert thumbnail image for print", rawUrl, error);
        }
      }));
    }

    const win = window.open("", "_blank");
    if (!win) return;

    const now = new Date();
    const nowStr = now.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const logoUrl = `${window.location.origin}/norte-logo.jpg`;

    const sorted = groupByEvent
      ? [...itemsToExport].sort((a, b) => (a.event?.name || "").localeCompare(b.event?.name || ""))
      : itemsToExport;

    const pages = sorted.map((item: any, idx: number) => {
      const thumbUrl = item.approvalThumbUrl || "";
      const thumbDataUri = thumbDataUris[thumbUrl] || null;
      const isImg = !!thumbDataUri;
      const resolvedThumb = thumbDataUri || "";

      const itemSponsors = itemSponsorsMap[item.id] || [];
      const approvals = itemApprovalsMap[item.id] || [];

      const approvalsHtml = approvals.length
        ? approvals.map((a: any) => {
            const statusColor = a.status === 'approved' ? '#16a34a' : a.status === 'rejected' ? '#dc2626' : '#ea580c';
            const statusLabel = a.status === 'approved' ? 'Aprovado' : a.status === 'rejected' ? 'Reprovado' : 'Pendente';
            const sp = itemSponsors.find((s: any) => s.id === a.sponsorId);
            const sponsorName = a.sponsor?.name || sp?.name || '—';
            const dotColor = sp?.color || a.sponsor?.color || '#94a3b8';
            return `<div class="appr-row"><span class="appr-left"><span class="sp-dot" style="background:${dotColor}"></span><span class="appr-name">${sponsorName}</span></span><span class="appr-status" style="color:${statusColor}">${statusLabel}</span></div>`;
          }).join("")
        : itemSponsors.length
          ? itemSponsors.map((s: any) => {
              const c = s.color || "#3b82f6";
              return `<div class="appr-row"><span class="sp-chip" style="border-color:${c}33;background:${c}11"><span class="sp-dot" style="background:${c}"></span>${s.name}</span><span class="appr-status" style="color:#ea580c">Pendente</span></div>`;
            }).join("")
          : `<span style="color:#94a3b8;font-size:12px">Sem patrocinadores</span>`;

      const pageNum = `${idx + 1} / ${sorted.length}`;
      const itemName = item.description || item.type || "Sem nome";
      const typeLabel = item.type || "—";
      const eventName = item.event?.name || "—";

      return `
        <div class="page">
          <div class="doc-header">
            <div class="hdr-left">
              <img src="${logoUrl}" class="hdr-logo" alt="NORTE" />
              <div class="hdr-brand">
                <span class="hdr-norte">NORTE</span>
                <span class="hdr-sub">Marketing Esportivo</span>
              </div>
            </div>
            <div class="hdr-right">
              <span class="id-chip">${item.displayId || "#—"}</span>
            </div>
          </div>

          <div class="piece-title-bar">
            <span class="piece-name">${itemName}</span>
            <div class="title-meta">
              <span class="type-badge">${typeLabel}</span>
              <span class="event-badge">${eventName}</span>
            </div>
          </div>

          <div class="body">
            <div class="col-img">
              <div class="img-frame">
                ${isImg
                  ? `<img src="${resolvedThumb}" alt="Aprovação" class="ref-img" />`
                  : thumbUrl
                    ? `<div class="no-img"><div class="no-img-icon">PDF</div><div class="no-img-sub">Arquivo PDF vinculado</div></div>`
                    : `<div class="no-img"><div class="no-img-icon">—</div><div class="no-img-sub">Sem arte de aprovação</div></div>`
                }
              </div>
              <div class="img-caption">Arte de aprovação</div>
            </div>

            <div class="col-info">
              <div class="info-card">
                <div class="sec-label">Identificação</div>
                ${item.description ? `<div class="field"><div class="fld-lbl">Descrição</div><div class="fld-val">${item.description}</div></div>` : ""}
                <div class="field"><div class="fld-lbl">Tipo</div><div class="fld-val">${item.type || "—"}</div></div>
              </div>
            </div>
          </div>

          <div class="doc-footer">
            <span class="ft-gen">Gerado em ${nowStr}</span>
            <span class="ft-pg">Página ${pageNum}</span>
          </div>
        </div>
      `;
    }).join("");

    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>Aprovação — Peças</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet"/>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .page { width: 100vw; min-height: 100vh; display: flex; flex-direction: column; break-after: page; page-break-after: always; background: #ffffff; }
        .page:last-child { break-after: avoid; page-break-after: avoid; }
        @media print { .page { width: 210mm; min-height: 297mm; } }

        .doc-header { display: flex; align-items: center; justify-content: space-between; background: #1c1917; padding: 14px 32px; flex-shrink: 0; }
        .hdr-left { display: flex; align-items: center; gap: 12px; }
        .hdr-logo { height: 34px; width: auto; object-fit: contain; display: block; flex-shrink: 0; }
        .hdr-brand { display: flex; flex-direction: column; gap: 1px; }
        .hdr-norte { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 800; color: #ffffff; letter-spacing: 0.04em; line-height: 1; }
        .hdr-sub { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.55); line-height: 1; }
        .hdr-right { flex-shrink: 0; }
        .id-chip { font-family: 'DM Mono', 'Courier New', monospace; font-size: 16px; font-weight: 700; color: #ffffff; background: #f97316; padding: 6px 14px; border-radius: 8px; letter-spacing: 0.02em; }

        .piece-title-bar { padding: 16px 32px; background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
        .piece-name { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -0.02em; }
        .title-meta { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; align-items: center; }
        .type-badge { display: inline-block; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 100px; font-size: 11px; font-weight: 600; padding: 3px 12px; }
        .event-badge { display: inline-block; background: #f0f9ff; border: 1px solid #bae6fd; color: #0369a1; border-radius: 100px; font-size: 11px; font-weight: 600; padding: 3px 12px; }

        .body { display: flex; gap: 24px; flex: 1; padding: 24px 32px; min-height: 0; }

        .col-img { flex: 0 0 58%; display: flex; flex-direction: column; }
        .img-frame { flex: 1; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 320px; }
        .ref-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .no-img { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; width: 100%; }
        .no-img-icon { font-size: 28px; font-weight: 800; color: #cbd5e1; font-family: 'DM Mono', monospace; }
        .no-img-sub { font-size: 11px; color: #94a3b8; }
        .img-caption { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 7px; }

        .col-info { flex: 0 0 42%; display: flex; flex-direction: column; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; flex: 1; }

        .sec-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-bottom: 10px; }
        .sep { height: 1px; background: #e2e8f0; margin: 14px 0; }
        .field { margin-bottom: 12px; }
        .field:last-child { margin-bottom: 0; }
        .fld-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 2px; }
        .fld-val { font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.3; }
        .qty-val { font-size: 16px; font-weight: 800; color: #f97316; }

        .approvals { display: flex; flex-direction: column; gap: 8px; }
        .appr-row { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; }
        .appr-left { display: flex; align-items: center; gap: 7px; }
        .appr-name { font-size: 12px; font-weight: 600; color: #0f172a; }
        .appr-status { font-size: 11px; font-weight: 700; }
        .sp-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; color: #1c1917; padding: 2px 8px; border-radius: 20px; border: 1px solid transparent; }
        .sp-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        .doc-footer { flex-shrink: 0; padding: 12px 32px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; justify-content: space-between; }
        .ft-gen { font-size: 9px; color: #94a3b8; }
        .ft-pg { font-size: 9px; color: #94a3b8; font-family: 'DM Mono', monospace; }
      </style>
    </head><body>${pages}</body></html>`);
    win.document.close();
    // Imagens já embutidas como data URIs — pode imprimir imediatamente
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="bg-stone-50 p-8" style={{ height: "100%", overflowY: "auto" }}>

      {/* ─── HERO HEADER ─────────────────────────────────────────── */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-3">
            <span style={{
              backgroundColor: '#fd761a', color: '#5c2400',
              fontSize: 10, fontWeight: 800,
              padding: '2px 8px', borderRadius: 4,
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              Fluxo de Verificação
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#9d4300', display: 'inline-block' }} />
            <span style={{ color: '#78716c', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Aprovação do Patrocinador
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900,
            letterSpacing: '-0.04em', color: '#1c1917',
            lineHeight: 1, marginBottom: 16,
          }}>
            Aprovação do Patrocinador
          </h1>
          <p style={{ color: '#57534e', fontSize: 16, fontWeight: 500, lineHeight: 1.6 }}>
            Gestão centralizada de ativos de marca e validação técnica de entregáveis para patrocinadores.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span style={{ color: '#a8a29e', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
            Pendências Atuais
          </span>
          <div style={{
            backgroundColor: '#0c0a09', color: '#ffffff',
            padding: '8px 16px', borderRadius: 8,
            display: 'flex', alignItems: 'center', gap: 12,
          }} data-testid="badge-pendentes-count">
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
              {actionableCount ?? '—'}
            </span>
            <span style={{ fontSize: 10, lineHeight: 1.4, textTransform: 'uppercase', fontWeight: 700, opacity: 0.7 }}>
              Ativos em<br/>Análise
            </span>
          </div>
        </div>
      </header>

      {/* ─── FILTROS ─────────────────────────────────────────────── */}
      <section style={{
        marginBottom: 32, backgroundColor: '#f3f4f3',
        padding: 24, borderRadius: 12,
        border: '1px solid rgba(224,192,177,0.15)',
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
      }}>
        {/* Busca */}
        <div style={{ flex: '1 1 280px', position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#a8a29e' }} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por ID, Tipo ou Descrição..."
            data-testid="input-search"
            style={{
              width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
              backgroundColor: '#ffffff', borderRadius: 8, border: 'none',
              outline: 'none', fontSize: 14, fontWeight: 500, color: '#1c1917',
              boxSizing: 'border-box',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e' }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {/* Filtro Evento — combobox pesquisável */}
          {(() => {
            const _PRIO: Record<string, number> = { urgente: 0, alta: 1, media: 2, baixa: 3 };
            const _PRIO_DOT: Record<string, string> = { urgente: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
            const sortedEvents = [...events].sort((a: any, b: any) => {
              const pa = _PRIO[a.priority] ?? 4, pb = _PRIO[b.priority] ?? 4;
              return pa !== pb ? pa - pb : a.name.localeCompare(b.name, 'pt-BR');
            });
            const selectedEvent = sortedEvents.find((e: any) => e.id === eventFilter);
            return (
              <Popover open={eventComboOpen} onOpenChange={setEventComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    data-testid="select-event-filter"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      backgroundColor: '#ffffff', border: 'none', borderRadius: 8,
                      fontSize: 14, fontWeight: 600, padding: '12px 16px',
                      color: selectedEvent ? '#1c1917' : '#78716c',
                      cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedEvent ? selectedEvent.name : 'Todos os Eventos'}
                    <ChevronsUpDown style={{ width: 14, height: 14, color: '#a8a29e', flexShrink: 0 }} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0" style={{ width: 280 }} align="start">
                  <Command>
                    <CommandInput placeholder="Buscar evento..." />
                    <CommandList>
                      <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => { setEventFilter("all"); setEventComboOpen(false); }}
                        >
                          <Check style={{ width: 14, height: 14, opacity: eventFilter === "all" ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
                          Todos os Eventos
                        </CommandItem>
                        {sortedEvents.map((ev: any) => (
                          <CommandItem
                            key={ev.id}
                            value={ev.name}
                            onSelect={() => { setEventFilter(ev.id); setEventComboOpen(false); }}
                          >
                            <Check style={{ width: 14, height: 14, opacity: eventFilter === ev.id ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
                            {ev.priority && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: _PRIO_DOT[ev.priority], display: 'inline-block', marginRight: 6, flexShrink: 0 }} />}
                            {ev.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            );
          })()}

          {/* Filtro Tipo */}
          <select
            value={itemTypeFilter}
            onChange={e => setItemTypeFilter(e.target.value)}
            data-testid="select-type-filter"
            style={{
              backgroundColor: '#ffffff', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 600, padding: '12px 16px',
              color: '#1c1917', cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="all">Tipo de Entrega</option>
            {uniqueItemTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>

          {/* Filtro Patrocinador — combobox pesquisável com cores */}
          {(() => {
            const sortedSponsors = [...sponsors].sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'));
            const selectedSponsor = sortedSponsors.find((s: any) => s.id === sponsorFilter);
            return (
              <Popover open={sponsorComboOpen} onOpenChange={setSponsorComboOpen}>
                <PopoverTrigger asChild>
                  <button
                    data-testid="select-sponsor-filter"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      backgroundColor: '#ffffff', border: 'none', borderRadius: 8,
                      fontSize: 14, fontWeight: 600, padding: '12px 16px',
                      color: selectedSponsor ? '#1c1917' : '#78716c',
                      cursor: 'pointer', outline: 'none', whiteSpace: 'nowrap',
                    }}
                  >
                    {selectedSponsor && (
                      <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: selectedSponsor.color || '#a8a29e', flexShrink: 0, display: 'inline-block' }} />
                    )}
                    {selectedSponsor ? selectedSponsor.name : 'Patrocinador'}
                    <ChevronsUpDown style={{ width: 14, height: 14, color: '#a8a29e', flexShrink: 0 }} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="p-0" style={{ width: 260 }} align="start">
                  <Command>
                    <CommandInput placeholder="Buscar patrocinador..." />
                    <CommandList>
                      <CommandEmpty>Nenhum patrocinador encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="all"
                          onSelect={() => { setSponsorFilter("all"); setSponsorComboOpen(false); }}
                        >
                          <Check style={{ width: 14, height: 14, opacity: sponsorFilter === "all" ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
                          Todos os Patrocinadores
                        </CommandItem>
                        {sortedSponsors.map((s: any) => (
                          <CommandItem
                            key={s.id}
                            value={s.name}
                            onSelect={() => { setSponsorFilter(s.id); setSponsorComboOpen(false); }}
                          >
                            <Check style={{ width: 14, height: 14, opacity: sponsorFilter === s.id ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
                            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: s.color || '#a8a29e', flexShrink: 0, display: 'inline-block', marginRight: 6 }} />
                            {s.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            );
          })()}

          {/* Limpar filtros */}
          {(searchTerm || eventFilter !== "all" || itemTypeFilter !== "all" || sponsorFilter !== "all") && (
            <button
              onClick={() => { setSearchTerm(""); setEventFilter("all"); setItemTypeFilter("all"); setSponsorFilter("all"); }}
              data-testid="button-clear-filters"
              style={{
                backgroundColor: '#0c0a09', color: '#ffffff',
                padding: '12px', borderRadius: 8, border: 'none',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          )}

          {/* Exportar PDF */}
          <button
            onClick={() => setShowExportPDFModal(true)}
            data-testid="button-export-pdf"
            title="Exportar itens em PDF"
            style={{
              height: 46, padding: '0 16px', borderRadius: 8,
              backgroundColor: '#1c1917', border: 'none',
              color: '#ffffff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
              whiteSpace: 'nowrap', marginLeft: 'auto',
            }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
          >
            <Printer style={{ width: 15, height: 15 }} />
            Exportar PDF
          </button>
        </div>
      </section>

      {/* ─── PAINEL DE LOTE ───────────────────────────────── */}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && (
        <section
          data-testid="section-batch-sponsor"
          style={{
            marginBottom: 32,
            backgroundColor: '#ffffff',
            border: '1px solid #e7e5e4',
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {/* Cabeçalho */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px',
            backgroundColor: '#f9f9f8',
            borderBottom: '1px solid #e7e5e4',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ backgroundColor: '#ea580c', padding: '6px', borderRadius: 8, display: 'flex' }}>
                <Zap style={{ width: 16, height: 16, color: '#ffffff' }} />
              </div>
              <div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em', margin: 0, color: '#1c1917' }}>
                  Aprovação em Lote
                </h3>
                <p style={{ color: '#78716c', fontSize: 12, margin: 0 }}>
                  Processe múltiplos arquivos de um patrocinador simultaneamente
                </p>
              </div>
            </div>
            {batchSelectedItemIds.size > 0 && (
              <span style={{
                fontSize: 12, fontWeight: 700, color: '#ea580c',
                backgroundColor: '#fff7ed', border: '1px solid #fed7aa',
                borderRadius: 20, padding: '4px 14px',
              }}>
                {batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça selecionada' : 'peças selecionadas'}
              </span>
            )}
          </div>

          <div style={{ padding: 24 }}>
            {/* ── Linha de Filtros ── */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
              {/* Patrocinador */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c' }}>
                  Patrocinador
                </label>
                {(() => {
                  const sortedAllSponsors = [...(sponsors as any[])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                  const selSponsor = sortedAllSponsors.find(s => s.id === batchSponsorId);
                  return (
                    <Popover open={batchSponsorComboOpen} onOpenChange={setBatchSponsorComboOpen}>
                      <PopoverTrigger asChild>
                        <button
                          data-testid="select-batch-sponsor"
                          style={{
                            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                            backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                            color: selSponsor ? '#1c1917' : '#a8a29e',
                            borderRadius: 8, padding: '10px 14px',
                            fontSize: 13, cursor: 'pointer', outline: 'none',
                          }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                            {selSponsor && (
                              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: selSponsor.color || '#a8a29e', flexShrink: 0, display: 'inline-block' }} />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {selSponsor ? selSponsor.name : 'Selecionar patrocinador...'}
                            </span>
                          </span>
                          <ChevronsUpDown style={{ width: 13, height: 13, color: '#a8a29e', flexShrink: 0 }} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" style={{ width: 260 }} align="start">
                        <Command>
                          <CommandInput placeholder="Buscar patrocinador..." />
                          <CommandList>
                            <CommandEmpty>Nenhum patrocinador encontrado.</CommandEmpty>
                            <CommandGroup>
                              {sortedAllSponsors.map((s: any) => (
                                <CommandItem
                                  key={s.id}
                                  value={s.name}
                                  onSelect={() => {
                                    setBatchSponsorId(s.id);
                                    setBatchEventId("");
                                    setBatchShowRejectForm(false);
                                    setBatchRejectReason("");
                                    setBatchSponsorComboOpen(false);
                                  }}
                                >
                                  <Check style={{ width: 14, height: 14, opacity: batchSponsorId === s.id ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
                                  <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: s.color || '#a8a29e', flexShrink: 0, display: 'inline-block', marginRight: 6 }} />
                                  {s.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </div>

              {/* Evento */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c' }}>
                  Evento
                </label>
                <select
                  value={batchEventId}
                  onChange={e => { setBatchEventId(e.target.value); setBatchShowRejectForm(false); setBatchRejectReason(""); }}
                  disabled={!batchSponsorId}
                  data-testid="select-batch-event"
                  style={{
                    width: '100%', backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                    color: batchEventId ? '#1c1917' : '#a8a29e', borderRadius: 8, padding: '10px 14px',
                    fontSize: 13, cursor: batchSponsorId ? 'pointer' : 'not-allowed',
                    outline: 'none', opacity: batchSponsorId ? 1 : 0.5,
                  }}
                >
                  <option value="">{batchSponsorId ? 'Selecionar evento...' : 'Selecione um patrocinador primeiro'}</option>
                  {batchEligibleEvents.map((ev: any) => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* ── Área de Items ── */}
            {batchSponsorId && batchEventId ? (
              batchItemCount === 0 ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '32px 0', gap: 10, color: '#a8a29e',
                  backgroundColor: '#f9f9f8', borderRadius: 8, border: '1px dashed #e7e5e4',
                }}>
                  <CheckCircle style={{ width: 18, height: 18 }} />
                  <span style={{ fontSize: 13, fontWeight: 500 }}>Nenhuma peça pendente para esta combinação</span>
                </div>
              ) : (
                <>
                  {/* Barra de seleção */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginBottom: 12,
                  }}>
                    <label style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 12, fontWeight: 600, color: '#57534e', cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={batchSelectedItemIds.size === batchItemCount}
                        onChange={e => {
                          if (e.target.checked) setBatchSelectedItemIds(new Set(batchEligibleItems.map((i: any) => i.id)));
                          else setBatchSelectedItemIds(new Set());
                        }}
                        style={{ accentColor: '#ea580c', width: 14, height: 14, cursor: 'pointer' }}
                      />
                      Selecionar todos
                    </label>
                    <span style={{ fontSize: 11, color: '#a8a29e' }}>
                      {batchSelectedItemIds.size} / {batchItemCount} {batchItemCount === 1 ? 'peça' : 'peças'}
                    </span>
                  </div>

                  {/* Grid de itens */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 10,
                    marginBottom: 20,
                  }}>
                    {batchEligibleItems.map((item: any) => {
                      const isChecked = batchSelectedItemIds.has(item.id);
                      const hasThumb = !!item.approvalThumbUrl;
                      return (
                        <div
                          key={item.id}
                          data-testid={`batch-item-row-${item.id}`}
                          onClick={() => {
                            setBatchSelectedItemIds(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            });
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px',
                            backgroundColor: isChecked ? '#fff7ed' : '#f9f9f8',
                            border: `1px solid ${isChecked ? '#fb923c' : '#e7e5e4'}`,
                            borderRadius: 8, cursor: 'pointer',
                            transition: 'border-color 0.12s, background-color 0.12s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            data-testid={`checkbox-batch-item-${item.id}`}
                            onChange={e => {
                              e.stopPropagation();
                              setBatchSelectedItemIds(prev => {
                                const next = new Set(prev);
                                if (next.has(item.id)) next.delete(item.id);
                                else next.add(item.id);
                                return next;
                              });
                            }}
                            style={{ accentColor: '#ea580c', width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                          />
                          {/* Thumbnail */}
                          <div style={{
                            width: 44, height: 44, borderRadius: 6,
                            backgroundColor: '#e7e5e4', flexShrink: 0, overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {hasThumb ? (
                              <img src={item.approvalThumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <Package style={{ width: 16, height: 16, color: '#a8a29e' }} />
                            )}
                          </div>
                          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 12, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#1c1917' }}>
                              {item.type}
                            </p>
                            <p style={{ fontSize: 10, color: '#a8a29e', margin: '2px 0 0', fontFamily: 'monospace' }}>
                              {item.displayId}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Ações ── */}
                  {!batchShowRejectForm ? (
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                      <button
                        onClick={() => setBatchShowRejectForm(true)}
                        disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0}
                        data-testid="button-batch-reject"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          backgroundColor: '#ffffff', color: '#dc2626',
                          border: '1px solid #fca5a5', borderRadius: 8,
                          padding: '10px 20px', fontSize: 13, fontWeight: 700,
                          cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                          opacity: batchSelectedItemIds.size === 0 ? 0.45 : 1,
                        }}
                      >
                        <XCircle style={{ width: 15, height: 15 }} />
                        Recusar
                      </button>
                      <button
                        onClick={() => setConfirmApproveBatch(true)}
                        disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0}
                        data-testid="button-batch-approve"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          backgroundColor: '#ea580c', color: '#ffffff',
                          border: 'none', borderRadius: 8,
                          padding: '10px 24px', fontSize: 13, fontWeight: 700,
                          cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                          opacity: batchSelectedItemIds.size === 0 ? 0.45 : 1,
                        }}
                      >
                        {batchSponsorMutation.isPending
                          ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" />
                          : <CheckCircle style={{ width: 15, height: 15 }} />}
                        Aprovar {batchSelectedItemIds.size > 0 ? `${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'Peça' : 'Peças'}` : 'Seleção'}
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      backgroundColor: '#fef2f2', border: '1px solid #fca5a5',
                      borderRadius: 8, padding: 16,
                    }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <XCircle style={{ width: 14, height: 14 }} />
                        Motivo da reprovação
                      </p>
                      <textarea
                        value={batchRejectReason}
                        onChange={e => setBatchRejectReason(e.target.value)}
                        placeholder="Descreva o motivo para o patrocinador..."
                        data-testid="textarea-batch-reject-reason"
                        style={{
                          width: '100%', backgroundColor: '#ffffff',
                          border: `1px solid ${batchRejectReason.trim() === "" ? '#fca5a5' : '#e7e5e4'}`,
                          color: '#1c1917', borderRadius: 8, padding: '10px 12px',
                          fontSize: 13, resize: 'none', height: 76, outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setBatchShowRejectForm(false); setBatchRejectReason(""); }}
                          style={{
                            backgroundColor: '#ffffff', color: '#78716c',
                            border: '1px solid #e7e5e4', borderRadius: 8,
                            padding: '9px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason })}
                          disabled={batchSponsorMutation.isPending || batchRejectReason.trim() === ""}
                          data-testid="button-batch-confirm-reject"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            backgroundColor: batchRejectReason.trim() === "" ? '#e7e5e4' : '#dc2626',
                            color: '#ffffff', border: 'none', borderRadius: 8,
                            padding: '9px 18px', fontSize: 12, fontWeight: 700,
                            cursor: batchRejectReason.trim() === "" ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {batchSponsorMutation.isPending
                            ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                            : <XCircle style={{ width: 13, height: 13 }} />}
                          Confirmar Recusa
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '32px 0', color: '#a8a29e',
                backgroundColor: '#f9f9f8', borderRadius: 8, border: '1px dashed #e7e5e4',
              }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {batchSponsorId ? 'Selecione um evento para ver as peças.' : 'Selecione um patrocinador e um evento para começar.'}
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ─── GRID DE CARDS (bento-style) ─────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }}>
          <CheckCircle style={{ width: 48, height: 48, color: '#86efac', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1c1917', margin: '0 0 8px' }}>
            {pendingItems.length === 0 ? "Nenhum item pendente" : "Nenhum resultado encontrado"}
          </h3>
          <p style={{ color: '#78716c', fontSize: 14 }}>
            {pendingItems.length === 0
              ? "Não há itens aguardando aprovação do patrocinador no momento."
              : "Tente ajustar os filtros para ver mais resultados."}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Grupo: Pendentes */}
          {pendingGroup.length > 0 && Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
            const ev = getEventInfo(eventId);
            return (
              <div key={eventId}>
                {/* Group Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  paddingBottom: 16, marginBottom: 16,
                  borderBottom: '1px solid #e7e5e4',
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    backgroundColor: '#fd761a', flexShrink: 0,
                  }} />
                  <h4 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
                    color: '#1c1917', margin: 0,
                  }}>
                    {ev?.name || 'Sem Evento'}
                    {ev?.startDate && (
                      <span style={{ color: '#a8a29e', fontWeight: 500, marginLeft: 12, fontSize: 15 }}>
                        {format(parseDateLocal(ev.startDate), "MMMM yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </h4>
                  {ev?.truckDepartureDate && (() => {
                    const days = ev.deadlineAprovacaoLayout ?? -12;
                    const d = new Date(new Date(ev.truckDepartureDate).getTime() + days * 86400000);
                    d.setHours(0,0,0,0);
                    const tod = new Date(); tod.setHours(0,0,0,0);
                    const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                    const ds = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    const s = diff < 0
                      ? { bg: '#FEE2E2', border: '#FECACA', text: '#B84040' }
                      : diff === 0
                      ? { bg: '#FEF3E7', border: '#FED7AA', text: '#D97A1E' }
                      : diff <= 3
                      ? { bg: '#FDF0E8', border: '#FDDBC4', text: '#C97B4B' }
                      : { bg: '#F3F2F0', border: '#E7E3DC', text: '#6F6A63' };
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 99, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                        Aprovação de Layout · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.7, fontWeight: 500 }}> ({diff}d)</span>}
                      </span>
                    );
                  })()}
                  <span style={{
                    marginLeft: 'auto',
                    backgroundColor: '#fff7ed', border: '1px solid #fed7aa',
                    color: '#c2410c', borderRadius: 100,
                    fontSize: 11, fontWeight: 700, padding: '3px 10px',
                  }}>
                    {eventItems.length} {eventItems.length === 1 ? 'peça' : 'peças'}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {eventItems.map((item, idx) => {
                    const itemSps = itemSponsorsMap[item.id] || [];
                    const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
                    const isFullyApproved = isItemFullyApproved(item);
                    const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
                    const hasThumb = !!item.approvalThumbUrl;
                    const prevItem = idx > 0 ? eventItems[idx - 1] : null;
                    const showTypeHeader = !prevItem || prevItem.type !== item.type;
                    const itemGroupName = typeToGroup[item.type] || '';
                    const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
                    const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;

                    return (
                      <Fragment key={item.id}>
                        {showGroupHeader && (
                          <div style={{ backgroundColor: '#dbeafe', borderRadius: 6, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{itemGroupName}</span>
                          </div>
                        )}
                        {showTypeHeader && (
                          <div style={{ backgroundColor: '#f0ede8', borderRadius: 6, padding: '4px 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.type}</span>
                          </div>
                        )}
                      <div
                        key={`card-${item.id}`}
                        data-testid={`row-item-${item.id}`}
                        className="group"
                        style={{
                          backgroundColor: '#ffffff', borderRadius: 12,
                          borderLeft: `4px solid ${isFullyApproved ? '#d6d3d1' : '#f97316'}`,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                          overflow: 'hidden',
                          opacity: isFullyApproved ? 0.75 : 1,
                          transition: 'box-shadow 0.2s',
                        }}
                        onMouseEnter={e => { if (!isFullyApproved) (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', padding: 20, gap: 24 }}>

                          {/* Thumbnail */}
                          <div style={{
                            width: 64, height: 64, flexShrink: 0, borderRadius: 8,
                            overflow: 'hidden', backgroundColor: '#f5f5f4', position: 'relative',
                          }}>
                            {hasThumb ? (
                              <>
                                <img
                                  src={item.approvalThumbUrl}
                                  alt=""
                                  style={{
                                    width: '100%', height: '100%', objectFit: 'cover',
                                    filter: isFullyApproved ? 'grayscale(1)' : 'grayscale(0)',
                                    transition: 'filter 0.4s',
                                  }}
                                />
                                {!isFullyApproved && (
                                  <div style={{
                                    position: 'absolute', inset: 0,
                                    backgroundColor: 'rgba(0,0,0,0.35)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    opacity: 0, transition: 'opacity 0.2s',
                                  }}
                                    className="group-hover:opacity-100"
                                  >
                                    <Eye style={{ width: 18, height: 18, color: '#fff' }} />
                                  </div>
                                )}
                              </>
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileText style={{ width: 24, height: 24, color: '#a8a29e' }} />
                              </div>
                            )}
                          </div>

                          {/* Grid de info */}
                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 16, alignItems: 'center', minWidth: 0 }}>

                            {/* Col 1: Título e ID */}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <h5 style={{ fontSize: 14, fontWeight: 700, color: isFullyApproved ? '#78716c' : '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.type}
                                </h5>
                                {item.isReuse && (
                                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', backgroundColor: '#dcfce7', color: '#166534', borderRadius: 999, padding: '2px 7px', flexShrink: 0 }}>
                                    Reaproveit.
                                  </span>
                                )}
                              </div>
                              <p style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', margin: '3px 0 0', letterSpacing: '0.05em' }}>
                                {item.displayId}{item.description ? ` • ${item.description}` : ''}
                              </p>
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, padding: '2px 6px', marginTop: 4 }} data-testid={`link-reference-atendimento-${item.id}`}>
                                  <Paperclip style={{ width: 9, height: 9 }} />
                                  Ref. visual
                                </a>
                              )}
                            </div>

                            {/* Col 2: Patrocinadores */}
                            <div>
                              <p style={{ fontSize: 10, color: '#a8a29e', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 4px' }}>Patrocinador</p>
                              {loadingSponsors ? (
                                <span style={{ fontSize: 12, color: '#a8a29e' }}>...</span>
                              ) : (
                                <SponsorChips sponsors={itemSps} variant="gray" size="sm" />
                              )}
                            </div>

                            {/* Col 3: Status Badge */}
                            <div>
                              <p style={{ fontSize: 10, color: '#a8a29e', textTransform: 'uppercase', fontWeight: 700, margin: '0 0 4px' }}>Status Aprovação</p>
                              {isFullyApproved ? (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 8px', borderRadius: 4,
                                  backgroundColor: '#f1f5f9', color: '#64748b',
                                  fontSize: 10, fontWeight: 700,
                                }}>
                                  <CheckCircle style={{ width: 12, height: 12 }} />
                                  APROVADO
                                </span>
                              ) : hasArteBlock ? (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 8px', borderRadius: 4,
                                  backgroundColor: '#fef3c7', color: '#92400e',
                                  fontSize: 10, fontWeight: 700,
                                }}>
                                  <RotateCcw style={{ width: 12, height: 12 }} />
                                  DEVOLVIDO À ARTE
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 8px', borderRadius: 4,
                                  backgroundColor: '#fff7ed', color: '#c2410c',
                                  fontSize: 10, fontWeight: 700,
                                }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f97316', animation: 'pulse 2s infinite' }} />
                                  AGUARDANDO REVISÃO
                                </span>
                              )}
                            </div>

                            {/* Col 4: Botão de ação */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                              {isFullyApproved ? (
                                <span style={{
                                  padding: '8px 20px', borderRadius: 8,
                                  backgroundColor: '#f1f5f9', color: '#94a3b8',
                                  fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                }}>
                                  Histórico
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleViewDetails(item)}
                                  data-testid={`button-view-${item.id}`}
                                  style={{
                                    padding: '8px 20px', borderRadius: 8,
                                    backgroundColor: '#f5f5f4', color: '#1c1917',
                                    border: 'none', cursor: 'pointer',
                                    fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    transition: 'all 0.2s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#0c0a09'; e.currentTarget.style.color = '#ffffff'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.color = '#1c1917'; }}
                                >
                                  Revisar
                                  <Eye style={{ width: 14, height: 14 }} />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Grupo: Aprovados (colapsável) */}
          {approvedGroup.length > 0 && (
            <div>
              <button
                onClick={() => setApprovedGroupExpanded(v => !v)}
                data-testid="row-approved-group-header"
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                  backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                  marginBottom: approvedGroupExpanded ? 12 : 0,
                }}
              >
                {approvedGroupExpanded
                  ? <ChevronDown style={{ width: 14, height: 14, color: '#15803d' }} />
                  : <ChevronRight style={{ width: 14, height: 14, color: '#15803d' }} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Aprovados — {approvedGroup.length} {approvedGroup.length === 1 ? 'item' : 'itens'}
                </span>
              </button>
              {approvedGroupExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {approvedGroup.map(item => {
                    const itemSps = itemSponsorsMap[item.id] || [];
                    return (
                      <div
                        key={item.id}
                        data-testid={`row-approved-item-${item.id}`}
                        style={{
                          backgroundColor: '#ffffff', borderRadius: 12,
                          borderLeft: '4px solid #d6d3d1',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                          overflow: 'hidden', opacity: 0.7,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 20 }}>
                          <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, backgroundColor: '#f5f5f4', overflow: 'hidden', filter: 'grayscale(1)' }}>
                            {item.approvalThumbUrl
                              ? <img src={item.approvalThumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText style={{ width: 18, height: 18, color: '#a8a29e' }} /></div>}
                          </div>
                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'center', minWidth: 0 }}>
                            <div>
                              <h5 style={{ fontSize: 13, fontWeight: 600, color: '#78716c', margin: 0 }}>{item.type}</h5>
                              <p style={{ fontSize: 10, color: '#a8a29e', margin: '2px 0 0' }}>{item.displayId}</p>
                            </div>
                            <SponsorChips sponsors={itemSps} variant="gray" size="sm" />
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 10, fontWeight: 700, color: '#15803d',
                              backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                              padding: '3px 8px', borderRadius: 4,
                            }}>
                              <CheckCircle style={{ width: 11, height: 11 }} /> APROVADO
                            </span>
                            <span data-testid={`badge-aprovado-${item.id}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                              color: '#15803d', borderRadius: 6, fontSize: 12, fontWeight: 600, padding: '4px 12px',
                            }}>
                              <CheckCircle style={{ width: 12, height: 12 }} /> Aprovado
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── MODAL DE REVISÃO (3 colunas) ───────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col [&>button:last-child]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogTitle className="sr-only">Revisão de Ativo</DialogTitle>
          <DialogDescription className="sr-only">Revise os detalhes e aprove ou reprove o ativo</DialogDescription>

          {selectedItem && (() => {
            const ev = events.find((e: any) => e.id === selectedItem.eventId);
            const thumbUrl = selectedItem.approvalThumbUrl;
            const finalUrl = selectedItem.finalFileUrl;
            const itemLogs = (auditLogs as any[])
              .filter(log => log.entityType === 'item' && log.entityId === selectedItem.id)
              .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            const dialogSponsors = itemSponsorsMap[selectedItem.id] || [];
            const allDecided = sponsorApprovals.length > 0 && dialogSponsors.every(s => {
              const a = sponsorApprovals.find(ap => ap.sponsorId === s.id);
              return a && (a.status === 'approved' || a.status === 'rejected' || a.status === 'awaiting_arte');
            });
            const allApproved = dialogSponsors.length > 0 && dialogSponsors.every(s => {
              return sponsorApprovals.find(ap => ap.sponsorId === s.id)?.status === 'approved';
            });

            return (
              <>
                {/* Modal Header */}
                <div style={{
                  padding: '20px 24px', borderBottom: '1px solid #f1f0ef',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  backgroundColor: '#fafaf9',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ backgroundColor: '#0c0a09', color: '#ffffff', padding: 10, borderRadius: 10 }}>
                      <FileText style={{ width: 20, height: 20 }} />
                    </div>
                    <div>
                      <h2 style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 20, fontWeight: 900, letterSpacing: '-0.03em',
                        color: '#1c1917', margin: 0, lineHeight: 1,
                      }}>
                        REVISÃO DE ATIVO {selectedItem.displayId}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                          {ev?.name || 'Sem Evento'}
                        </span>
                        {ev?.truckDepartureDate && (
                          <>
                            <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#d6d3d1' }} />
                            <span style={{ fontSize: 10, fontWeight: 800, color: '#f97316', textTransform: 'uppercase' }}>
                              Saída: {format(toUTCDisplayDate(ev.truckDepartureDate), "dd/MM HH:mm")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setDialogOpen(false)}
                    data-testid="button-close-dialog"
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#78716c', transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f0ef'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <X style={{ width: 18, height: 18 }} />
                  </button>
                </div>

                {/* Modal Body: 3 colunas */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr' }}>

                  {/* Coluna esquerda: Metadados técnicos */}
                  <div style={{
                    borderRight: '1px solid #f1f0ef', padding: 24,
                    backgroundColor: 'rgba(250,250,249,0.5)',
                    display: 'flex', flexDirection: 'column', gap: 28,
                    overflowY: 'auto',
                  }}>
                    <div>
                      <h4 style={{ fontSize: 10, fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>
                        Metadados Técnicos
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {[
                          { label: 'Tipo / Formato', value: selectedItem.type || '—' },
                          { label: 'Descrição', value: selectedItem.description || '—' },
                          { label: 'Quantidade', value: selectedItem.quantity ? `${selectedItem.quantity}x` : '—' },
                          { label: 'Dimensões / Tamanho', value: (() => {
                            const vw = selectedItem.visualWidth; const vh = selectedItem.visualHeight;
                            const fw = selectedItem.fileWidth;  const fh = selectedItem.fileHeight;
                            const visual = vw && vh ? `${parseFloat(vw)}×${parseFloat(vh)} m (visual)` : null;
                            const file   = fw && fh ? `${parseFloat(fw)}×${parseFloat(fh)} m (arquivo)` : null;
                            return [visual, file].filter(Boolean).join(' · ') || '—';
                          })() },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: 8, border: '1px solid #f1f0ef' }}>
                            <p style={{ fontSize: 10, color: '#a8a29e', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 3px' }}>{label}</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0 }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Links para arquivos */}
                    <div>
                      <h4 style={{ fontSize: 10, fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 12px' }}>
                        Arquivos
                      </h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {thumbUrl && (
                          <a
                            href={thumbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 12px', borderRadius: 8,
                              backgroundColor: 'rgba(253,118,26,0.05)',
                              border: '1px solid rgba(253,118,26,0.15)',
                              color: '#9d4300', textDecoration: 'none',
                              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}
                          >
                            <span>Thumb Aprovação</span>
                            <Download style={{ width: 14, height: 14 }} />
                          </a>
                        )}
                        {finalUrl && (
                          <a
                            href={finalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 12px', borderRadius: 8,
                              backgroundColor: 'rgba(0,99,152,0.05)',
                              border: '1px solid rgba(0,99,152,0.15)',
                              color: '#006398', textDecoration: 'none',
                              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                            }}
                          >
                            <span>Arquivo Final</span>
                            <Download style={{ width: 14, height: 14 }} />
                          </a>
                        )}
                        {!thumbUrl && !finalUrl && (
                          <p style={{ fontSize: 12, color: '#a8a29e' }}>Nenhum arquivo disponível</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Coluna central: Preview + aprovações por patrocinador */}
                  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {/* Preview de imagem */}
                    <div style={{
                      aspectRatio: '16/9', backgroundColor: '#f5f5f4',
                      borderRadius: 12, overflow: 'hidden',
                      border: '1px solid #e7e5e4', position: 'relative',
                    }}>
                      {thumbUrl ? (
                        <FilePreview url={thumbUrl} linkUrl={finalUrl || thumbUrl} objectFit="contain" />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <Package style={{ width: 40, height: 40, color: '#a8a29e' }} />
                          <p style={{ fontSize: 13, color: '#a8a29e', margin: 0 }}>Sem thumb de aprovação</p>
                        </div>
                      )}
                    </div>

                    {/* Aprovações por Patrocinador */}
                    <div>
                      <h4 style={{ fontSize: 10, fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 16px' }}>
                        Decisão por Patrocinador
                      </h4>

                      {loadingSponsorApprovals ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                          <Loader2 style={{ width: 20, height: 20, color: '#a8a29e' }} className="animate-spin" />
                        </div>
                      ) : dialogSponsors.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#a8a29e' }}>Nenhum patrocinador vinculado</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {dialogSponsors.map((sponsor: any) => {
                            const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
                            const status = approval?.status || 'pending';
                            const isApproved = status === 'approved';
                            const isRejected = status === 'rejected' || status === 'awaiting_arte';
                            const isNewVersion = status === 'new_version_pending';
                            const isPending = status === 'pending' || isNewVersion;
                            const isRejectingThis = rejectingSponsorId === sponsor.id;

                            return (
                              <div
                                key={sponsor.id}
                                style={{
                                  padding: '14px 16px', borderRadius: 10,
                                  border: '2px dashed',
                                  borderColor: isApproved ? '#86efac' : isRejected ? '#fecaca' : '#e7e5e4',
                                  backgroundColor: isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : '#fafaf9',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isRejectingThis ? 12 : 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                      width: 32, height: 32, borderRadius: '50%',
                                      backgroundColor: isApproved ? '#86efac' : isRejected ? '#fecaca' : '#e7e5e4',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      {isApproved
                                        ? <CheckCircle style={{ width: 14, height: 14, color: '#15803d' }} />
                                        : isRejected
                                        ? <XCircle style={{ width: 14, height: 14, color: '#dc2626' }} />
                                        : <Clock style={{ width: 14, height: 14, color: '#a8a29e' }} />}
                                    </div>
                                    <div>
                                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0 }}>{sponsor.name}</p>
                                      <p style={{ fontSize: 10, color: '#a8a29e', margin: '1px 0 0', textTransform: 'uppercase', fontWeight: 600 }}>
                                        {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isNewVersion ? 'Nova Arte Enviada' : 'Aguardando Decisão'}
                                      </p>
                                    </div>
                                  </div>

                                  {isPending && !isRejectingThis && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <button
                                        onClick={() => setRejectingSponsorId(sponsor.id)}
                                        disabled={individualRejectMutation.isPending}
                                        style={{
                                          padding: '6px 14px', borderRadius: 6,
                                          backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                                          color: '#dc2626', fontSize: 11, fontWeight: 700,
                                          cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                      >
                                        Reprovar
                                      </button>
                                      <button
                                        onClick={() => setConfirmApproveIndividual({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.sponsor?.name || 'Patrocinador' })}
                                        disabled={individualApproveMutation.isPending}
                                        data-testid={`button-approve-sponsor-${sponsor.id}`}
                                        style={{
                                          padding: '6px 14px', borderRadius: 6,
                                          backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                                          color: '#15803d', fontSize: 11, fontWeight: 700,
                                          cursor: 'pointer', transition: 'all 0.15s',
                                          display: 'flex', alignItems: 'center', gap: 4,
                                        }}
                                      >
                                        {individualApproveMutation.isPending
                                          ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                          : <CheckCircle style={{ width: 12, height: 12 }} />}
                                        Aprovar
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Motivo de reprovação existente */}
                                {isRejected && approval?.rejectionReason && (
                                  <div style={{ marginTop: 10, padding: '8px 12px', backgroundColor: '#ffffff', borderRadius: 6, border: '1px solid #fecaca' }}>
                                    <p style={{ fontSize: 11, fontStyle: 'italic', color: '#78716c', margin: 0 }}>
                                      "{approval.rejectionReason}"
                                    </p>
                                  </div>
                                )}

                                {/* Formulário de reprovação inline */}
                                {isRejectingThis && (
                                  <div style={{ marginTop: 12 }}>
                                    <Textarea
                                      value={rejectionReason}
                                      onChange={e => setRejectionReason(e.target.value)}
                                      placeholder="Motivo da reprovação (obrigatório)..."
                                      className="h-20 text-sm resize-none"
                                      data-testid={`textarea-reject-reason-${sponsor.id}`}
                                      style={{ borderColor: rejectionReason.trim() === "" ? '#fca5a5' : '#e7e5e4' }}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                                      <button
                                        onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
                                        style={{
                                          padding: '6px 14px', borderRadius: 6,
                                          backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
                                          color: '#78716c', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                        }}
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={() => individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason })}
                                        disabled={individualRejectMutation.isPending || rejectionReason.trim() === ""}
                                        data-testid={`button-confirm-reject-${sponsor.id}`}
                                        style={{
                                          padding: '6px 14px', borderRadius: 6,
                                          backgroundColor: rejectionReason.trim() === "" ? '#a8a29e' : '#dc2626',
                                          border: 'none', color: '#ffffff', fontSize: 12, fontWeight: 700,
                                          cursor: rejectionReason.trim() === "" ? 'not-allowed' : 'pointer',
                                          display: 'flex', alignItems: 'center', gap: 5,
                                        }}
                                      >
                                        {individualRejectMutation.isPending
                                          ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                          : <XCircle style={{ width: 12, height: 12 }} />}
                                        Confirmar Reprovação
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Coluna direita: Histórico */}
                  <div style={{
                    borderLeft: '1px solid #f1f0ef', padding: 24,
                    backgroundColor: 'rgba(250,250,249,0.3)',
                    overflowY: 'auto',
                  }}>
                    <h4 style={{ fontSize: 10, fontWeight: 900, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.12em', margin: '0 0 24px' }}>
                      Histórico de Alterações
                    </h4>

                    {itemLogs.length === 0 ? (
                      <p style={{ fontSize: 12, color: '#a8a29e' }}>Sem registros de histórico</p>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        {/* Linha vertical */}
                        <div style={{
                          position: 'absolute', left: 10, top: 8, bottom: 8,
                          width: 1, backgroundColor: '#e7e5e4',
                        }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                          {itemLogs.slice(0, 10).map((log, i) => {
                            const ACTION_CONFIG: Record<string, { label: string; bg: string; iconColor: string; icon: any }> = {
                              created:          { label: 'Criado',                bg: '#dbeafe', iconColor: '#1d4ed8', icon: Plus },
                              updated:          { label: 'Atualizado',            bg: '#ffedd5', iconColor: '#c2410c', icon: Pencil },
                              deleted:          { label: 'Excluído',              bg: '#fee2e2', iconColor: '#dc2626', icon: Trash2 },
                              approved:         { label: 'Aprovado',              bg: '#dcfce7', iconColor: '#15803d', icon: CheckCircle },
                              rejected:         { label: 'Reprovado',             bg: '#fee2e2', iconColor: '#dc2626', icon: XCircle },
                              canceled:         { label: 'Cancelado',             bg: '#fee2e2', iconColor: '#dc2626', icon: XCircle },
                              delivered:        { label: 'Entregue',              bg: '#ede9fe', iconColor: '#7c3aed', icon: Truck },
                              produced:         { label: 'Produzido',             bg: '#e0e7ff', iconColor: '#4338ca', icon: Cog },
                              submitted:        { label: 'Enviado',               bg: '#cffafe', iconColor: '#0e7490', icon: Send },
                              linked:           { label: 'Vinculado',             bg: '#ccfbf1', iconColor: '#0f766e', icon: Link2 },
                              released:         { label: 'Liberado',              bg: '#dbeafe', iconColor: '#1d4ed8', icon: Unlock },
                              status_changed:   { label: 'Status alterado',       bg: '#ffedd5', iconColor: '#c2410c', icon: ArrowRightLeft },
                              sponsor_approved: { label: 'Patrocinador aprovado', bg: '#dcfce7', iconColor: '#15803d', icon: CheckCircle },
                              sponsor_rejected: { label: 'Patrocinador reprovou', bg: '#fee2e2', iconColor: '#dc2626', icon: XCircle },
                              file_uploaded:    { label: 'Arquivo enviado',       bg: '#f3e8ff', iconColor: '#7e22ce', icon: Upload },
                              thumb_uploaded:   { label: 'Thumb enviado',         bg: '#f3e8ff', iconColor: '#7e22ce', icon: ImageIcon },
                            };
                            const cfg = ACTION_CONFIG[log.action] ?? { label: log.action?.replace(/_/g, ' ') ?? 'Ação', bg: '#e7e5e4', iconColor: '#a8a29e', icon: Clock };
                            const IconComp = cfg.icon;
                            return (
                              <div key={log.id} style={{ paddingLeft: 32, position: 'relative', opacity: i > 3 ? 0.5 : 1 }}>
                                <div style={{
                                  position: 'absolute', left: 0, top: 2,
                                  width: 20, height: 20, borderRadius: '50%',
                                  backgroundColor: cfg.bg,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
                                }}>
                                  <IconComp style={{ width: 10, height: 10, color: cfg.iconColor }} />
                                </div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: cfg.iconColor, margin: 0 }}>
                                  {cfg.label}
                                </p>
                                <p style={{ fontSize: 10, color: '#a8a29e', margin: '2px 0 0' }}>
                                  {log.userName && <><span style={{ fontWeight: 600, color: '#78716c' }}>{log.userName}</span> · </>}
                                  {format(new Date(log.createdAt), "dd MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                                </p>
                                {log.details && (
                                  <p style={{
                                    fontSize: 10, margin: '6px 0 0',
                                    backgroundColor: '#ffffff', border: `1px solid ${cfg.bg}`,
                                    padding: '6px 10px', borderRadius: 6,
                                    color: '#57534e', fontStyle: 'italic',
                                  }}>
                                    "{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}"
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Modal Footer */}
                <div style={{
                  padding: '16px 24px', borderTop: '1px solid #f1f0ef',
                  display: 'flex', justifyContent: 'flex-end', gap: 12,
                  backgroundColor: '#ffffff',
                }}>
                  <button
                    onClick={() => setDialogOpen(false)}
                    style={{
                      padding: '10px 20px', borderRadius: 8, border: 'none',
                      backgroundColor: 'transparent', color: '#78716c',
                      fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
                      cursor: 'pointer', letterSpacing: '0.06em',
                    }}
                  >
                    Fechar
                  </button>
                  {!allDecided && (
                    <>
                      <button
                        onClick={() => sponsorRejectMutation.mutate(selectedItem.id)}
                        disabled={sponsorRejectMutation.isPending}
                        data-testid="button-reject-item"
                        style={{
                          padding: '10px 20px', borderRadius: 8, border: 'none',
                          backgroundColor: '#ba1a1a', color: '#ffffff',
                          fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
                          cursor: 'pointer', letterSpacing: '0.06em',
                          display: 'flex', alignItems: 'center', gap: 6,
                          opacity: sponsorRejectMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        {sponsorRejectMutation.isPending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <XCircle style={{ width: 14, height: 14 }} />}
                        Reprovar Ativo
                      </button>
                      <button
                        onClick={() => sponsorApproveMutation.mutate(selectedItem.id)}
                        disabled={sponsorApproveMutation.isPending}
                        data-testid="button-approve-item"
                        style={{
                          padding: '10px 28px', borderRadius: 8, border: 'none',
                          backgroundColor: '#9d4300', color: '#ffffff',
                          fontSize: 11, fontWeight: 900, textTransform: 'uppercase',
                          cursor: 'pointer', letterSpacing: '0.06em',
                          display: 'flex', alignItems: 'center', gap: 6,
                          boxShadow: '0 4px 14px rgba(157,67,0,0.3)',
                          opacity: sponsorApproveMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        {sponsorApproveMutation.isPending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <CheckCircle style={{ width: 14, height: 14 }} />}
                        Aprovar Ativo
                      </button>
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAÇÃO: Aprovar Individual ─────────────────────────────── */}
      <Dialog open={!!confirmApproveIndividual} onOpenChange={(open) => { if (!open) setConfirmApproveIndividual(null); }}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 12, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 16px 32px -12px rgba(28,25,23,0.15)' }}>
          <DialogTitle style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 18, fontWeight: 700, color: '#1c1917', margin: 0 }}>Confirmar Aprovação</DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#78716c', marginTop: 8 }}>
            Aprovar a arte para o patrocinador <strong style={{ color: '#1c1917' }}>{confirmApproveIndividual?.sponsorName}</strong>?
            Esta ação não pode ser desfeita.
          </DialogDescription>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setConfirmApproveIndividual(null)}
              style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', color: '#78716c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                if (confirmApproveIndividual) {
                  individualApproveMutation.mutate({ itemId: confirmApproveIndividual.itemId, sponsorId: confirmApproveIndividual.sponsorId });
                  setConfirmApproveIndividual(null);
                }
              }}
              disabled={individualApproveMutation.isPending}
              data-testid="button-confirm-approve-individual"
              style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: '#15803d', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <CheckCircle style={{ width: 14, height: 14 }} />
              Aprovar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAÇÃO: Aprovar em Lote ────────────────────────────────── */}
      <Dialog open={confirmApproveBatch} onOpenChange={(open) => { if (!open) setConfirmApproveBatch(false); }}>
        <DialogContent style={{ maxWidth: 380, borderRadius: 12, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 16px 32px -12px rgba(28,25,23,0.15)' }}>
          <DialogTitle style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 18, fontWeight: 700, color: '#1c1917', margin: 0 }}>Confirmar Aprovação em Lote</DialogTitle>
          <DialogDescription style={{ fontSize: 13, color: '#78716c', marginTop: 8 }}>
            Aprovar <strong style={{ color: '#1c1917' }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'item' : 'itens'}</strong> para o patrocinador selecionado?
            Esta ação não pode ser desfeita.
          </DialogDescription>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setConfirmApproveBatch(false)}
              style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', color: '#78716c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "approve" });
                setConfirmApproveBatch(false);
              }}
              disabled={batchSponsorMutation.isPending}
              data-testid="button-confirm-batch-approve"
              style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: '#15803d', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <CheckCircle style={{ width: 14, height: 14 }} />
              Aprovar Seleção
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL EXPORTAR PDF                                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showExportPDFModal} onOpenChange={(open) => { if (!open) { setShowExportPDFModal(false); } }}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 960, width: '95vw', borderRadius: 14, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 24px 48px -12px rgba(28,25,23,0.18)' }}>
          <DialogTitle className="sr-only">Exportar PDF de Aprovação</DialogTitle>
          <DialogDescription className="sr-only">Configure os filtros e exporte os itens em PDF</DialogDescription>

          {/* Header */}
          <div style={{ padding: '24px 32px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', borderRadius: '14px 14px 0 0' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#9d4300', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Printer style={{ width: 16, height: 16, color: '#fff' }} />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#ffffff', margin: 0, fontFamily: '"Space Grotesk", sans-serif' }}>
                  Exportar PDF de Aprovação
                </h2>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, paddingLeft: 42 }}>
                Defina os filtros e opções antes de gerar o PDF
              </p>
            </div>
            <button
              onClick={() => setShowExportPDFModal(false)}
              style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', lineHeight: 1, flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* Body — 2 colunas */}
          <div style={{ display: 'flex', height: 540, overflow: 'hidden' }}>

            {/* Painel esquerdo — filtros e opções */}
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #f0ede8', display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf9' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

                {/* Filtros */}
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#78716c', margin: '0 0 10px' }}>Filtros</p>

                {/* Evento — combobox buscável */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#57534e', display: 'block', marginBottom: 4 }}>Evento</label>
                  <Popover open={expEventComboOpen} onOpenChange={setExpEventComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={expEventComboOpen}
                        className="w-full justify-between font-normal h-9 px-3 text-left text-sm"
                      >
                        <span className="flex-1 overflow-hidden truncate">
                          {expEventFilter === "all"
                            ? <span className="text-muted-foreground">Todos os eventos</span>
                            : <span>{(events as any[]).find((e: any) => e.id === expEventFilter)?.name ?? "Todos os eventos"}</span>
                          }
                        </span>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-72" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar evento..." />
                        <CommandList>
                          <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem value="todos-os-eventos" onSelect={() => { setExpEventFilter("all"); setExpEventComboOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${expEventFilter === "all" ? "opacity-100" : "opacity-0"}`} />
                              Todos os eventos
                            </CommandItem>
                            {(() => {
                              const P: Record<string,number> = { urgente:0, alta:1, media:2, baixa:3 };
                              const C: Record<string,string> = { urgente:'#ef4444', alta:'#f97316', media:'#eab308', baixa:'#3b82f6' };
                              return [...events].sort((a:any,b:any) => { const pa=P[a.priority]??4,pb=P[b.priority]??4; return pa!==pb?pa-pb:a.name.localeCompare(b.name,'pt-BR'); }).map((ev:any) => (
                                <CommandItem key={ev.id} value={ev.name} onSelect={() => { setExpEventFilter(ev.id); setExpEventComboOpen(false); }}>
                                  <Check className={`mr-2 h-4 w-4 ${expEventFilter === ev.id ? "opacity-100" : "opacity-0"}`} />
                                  {ev.priority && <span style={{ width:7, height:7, borderRadius:'50%', backgroundColor:C[ev.priority], display:'inline-block', marginRight:6, flexShrink:0 }} />}
                                  {ev.name}
                                </CommandItem>
                              ));
                            })()}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Patrocinador — combobox buscável */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#57534e', display: 'block', marginBottom: 4 }}>Patrocinador</label>
                  <Popover open={expSponsorComboOpen} onOpenChange={setExpSponsorComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={expSponsorComboOpen}
                        className="w-full justify-between font-normal h-9 px-3 text-left text-sm"
                      >
                        <span className="flex-1 overflow-hidden truncate">
                          {expSponsorFilter === "all"
                            ? <span className="text-muted-foreground">Todos os patrocinadores</span>
                            : <span>{(sponsors as any[]).find((s: any) => s.id === expSponsorFilter)?.name ?? "Todos os patrocinadores"}</span>
                          }
                        </span>
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-72" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar patrocinador..." />
                        <CommandList>
                          <CommandEmpty>Nenhum patrocinador encontrado.</CommandEmpty>
                          <CommandGroup>
                            <CommandItem value="todos-os-patrocinadores" onSelect={() => { setExpSponsorFilter("all"); setExpSponsorComboOpen(false); }}>
                              <Check className={`mr-2 h-4 w-4 ${expSponsorFilter === "all" ? "opacity-100" : "opacity-0"}`} />
                              Todos os patrocinadores
                            </CommandItem>
                            {[...sponsors].sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR')).map((s: any) => (
                              <CommandItem key={s.id} value={s.name} onSelect={() => { setExpSponsorFilter(s.id); setExpSponsorComboOpen(false); }}>
                                <Check className={`mr-2 h-4 w-4 ${expSponsorFilter === s.id ? "opacity-100" : "opacity-0"}`} />
                                {s.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Grupo Pai */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#57534e', display: 'block', marginBottom: 4 }}>Grupo pai</label>
                  <select
                    value={expGroupFilter}
                    onChange={e => { setExpGroupFilter(e.target.value); setExpTypeFilter("all"); }}
                    style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', fontSize: 12, fontWeight: 600, color: '#1c1917', padding: '0 10px', cursor: 'pointer' }}
                  >
                    <option value="all">Todos os grupos</option>
                    {uniqueItemGroups.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                {/* Tipo */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#57534e', display: 'block', marginBottom: 4 }}>Tipo de peça</label>
                  <select
                    value={expTypeFilter}
                    onChange={e => setExpTypeFilter(e.target.value)}
                    style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', fontSize: 12, fontWeight: 600, color: '#1c1917', padding: '0 10px', cursor: 'pointer' }}
                  >
                    <option value="all">Todos os tipos</option>
                    {(expGroupFilter === "all" ? uniqueItemTypes : uniqueItemTypes.filter(t => t.split(/[\s(]/)[0] === expGroupFilter)).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {/* Status de aprovação */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#57534e', display: 'block', marginBottom: 4 }}>Status</label>
                  <select
                    value={expStatusFilter}
                    onChange={e => setExpStatusFilter(e.target.value as "all" | "pending" | "approved")}
                    style={{ width: '100%', height: 36, borderRadius: 8, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', fontSize: 12, fontWeight: 600, color: '#1c1917', padding: '0 10px', cursor: 'pointer' }}
                  >
                    <option value="all">Todos os status</option>
                    <option value="pending">Aguardando aprovação</option>
                    <option value="approved">Aprovados</option>
                  </select>
                </div>

                {/* Divisor */}
                <div style={{ borderTop: '1px solid #e7e5e4', marginBottom: 16 }} />
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#78716c', margin: '0 0 12px' }}>Opções do PDF</p>

                {/* Incluir sem thumb */}
                <div
                  onClick={() => setExpIncludeNoThumb(!expIncludeNoThumb)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${expIncludeNoThumb ? '#bfdbfe' : '#e7e5e4'}`, backgroundColor: expIncludeNoThumb ? '#f0f9ff' : '#ffffff', cursor: 'pointer', marginBottom: 8, transition: 'all 0.12s' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${expIncludeNoThumb ? '#2563eb' : '#d4d4d0'}`, backgroundColor: expIncludeNoThumb ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                    {expIncludeNoThumb && <CheckCircle style={{ width: 10, height: 10, color: '#fff' }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: 0 }}>Incluir sem thumb</p>
                    <p style={{ fontSize: 10, color: '#a8a29e', margin: 0 }}>Peças sem imagem de aprovação</p>
                  </div>
                </div>

                {/* Agrupar por evento */}
                <div
                  onClick={() => setExpGroupByEvent(!expGroupByEvent)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${expGroupByEvent ? '#bfdbfe' : '#e7e5e4'}`, backgroundColor: expGroupByEvent ? '#f0f9ff' : '#ffffff', cursor: 'pointer', marginBottom: 8, transition: 'all 0.12s' }}
                >
                  <div style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${expGroupByEvent ? '#2563eb' : '#d4d4d0'}`, backgroundColor: expGroupByEvent ? '#2563eb' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                    {expGroupByEvent && <CheckCircle style={{ width: 10, height: 10, color: '#fff' }} />}
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: 0 }}>Agrupar por evento</p>
                    <p style={{ fontSize: 10, color: '#a8a29e', margin: 0 }}>Separador de seção por evento no PDF</p>
                  </div>
                </div>

                {/* Limpar filtros */}
                {(expEventFilter !== "all" || expSponsorFilter !== "all" || expTypeFilter !== "all" || expStatusFilter !== "all") && (
                  <button
                    onClick={() => { setExpEventFilter("all"); setExpSponsorFilter("all"); setExpTypeFilter("all"); setExpStatusFilter("all"); }}
                    style={{ width: '100%', height: 30, borderRadius: 6, background: 'none', border: '1px solid #e7e5e4', color: '#a8a29e', cursor: 'pointer', fontSize: 11, fontWeight: 600, marginTop: 4 }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>

              {/* Rodapé com ações */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #f0ede8', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setShowExportPDFModal(false)}
                  style={{ width: '100%', height: 36, borderRadius: 8, background: '#f5f5f4', border: '1px solid #e7e5e4', color: '#78716c', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >Cancelar</button>
                <button
                  onClick={() => { void handleExportPDF(exportItems, expGroupByEvent); setShowExportPDFModal(false); }}
                  disabled={exportItems.length === 0}
                  data-testid="button-confirm-export-pdf"
                  style={{
                    width: '100%', height: 44, borderRadius: 8,
                    backgroundColor: exportItems.length === 0 ? '#e7e5e4' : '#9d4300',
                    border: 'none',
                    color: exportItems.length === 0 ? '#a8a29e' : '#ffffff',
                    fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    cursor: exportItems.length === 0 ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (exportItems.length > 0) e.currentTarget.style.filter = 'brightness(0.88)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                >
                  <Printer style={{ width: 14, height: 14 }} />
                  Gerar PDF — {exportItems.length} {exportItems.length === 1 ? 'peça' : 'peças'}
                </button>
              </div>
            </div>

            {/* Painel direito — preview dos itens */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {exportItems.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#f3f4f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText style={{ width: 28, height: 28, color: '#d4d4d0' }} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#a8a29e', margin: 0 }}>Nenhum item encontrado</p>
                  <p style={{ fontSize: 11, color: '#d4d4d0', margin: 0, textAlign: 'center', maxWidth: 220 }}>Ajuste os filtros à esquerda para encontrar itens</p>
                </div>
              ) : (
                <>
                  {/* Cabeçalho da lista */}
                  <div style={{ padding: '14px 24px 10px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#78716c' }}>
                      {exportItems.length} {exportItems.length === 1 ? 'peça selecionada' : 'peças selecionadas'}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 10, color: '#a8a29e' }}>
                        {exportItems.filter(i => i.approvalThumbUrl).length} com thumb ·{' '}
                        {exportItems.filter(i => !i.approvalThumbUrl).length} sem thumb
                      </span>
                    </div>
                  </div>

                  {/* Lista scrollável */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {exportItems.map((item: any) => {
                      const hasThumb = !!item.approvalThumbUrl;
                      const isApproved = isItemFullyApproved(item);
                      const itemSps = itemSponsorsMap[item.id] || [];
                      return (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                          border: '1px solid #f0ede8', backgroundColor: '#ffffff',
                        }}>
                          {/* Thumb preview */}
                          <div style={{ width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: '1px solid rgba(0,0,0,0.06)', backgroundColor: '#f3f4f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {hasThumb
                              ? <img src={item.approvalThumbUrl.startsWith("/objects/") ? item.approvalThumbUrl : item.approvalThumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <ImageIcon style={{ width: 18, height: 18, color: '#d4d4d0' }} />
                            }
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: '#9d4300', fontFamily: 'monospace' }}>{item.displayId}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</span>
                            </div>
                            <div style={{ fontSize: 10, color: '#78716c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.event?.name || "Sem evento"}{item.description ? ` · ${item.description}` : ''}
                            </div>
                            {itemSps.length > 0 && (
                              <div style={{ marginTop: 3 }}>
                                <SponsorChips sponsors={itemSps} variant="gray" size="xs" />
                              </div>
                            )}
                          </div>

                          {/* Status badges */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                            {isApproved
                              ? <span style={{ fontSize: 9, fontWeight: 800, color: '#15803d', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aprovado</span>
                              : <span style={{ fontSize: 9, fontWeight: 800, color: '#b45309', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pendente</span>
                            }
                            {!hasThumb && (
                              <span style={{ fontSize: 9, fontWeight: 700, color: '#a8a29e', backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 4, padding: '2px 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sem thumb</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
