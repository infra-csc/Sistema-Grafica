import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, AlertTriangle, Eye, Calendar, Truck, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock, Package, Send, FolderOpen, FileText, RotateCcw, X, Star, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Fragment, useState, useMemo } from "react";
import { FileUploader } from "@/components/FileUploader";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemDetailsDialog } from "@/components/item-details-dialog";

export default function Arte() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<string>("criar-aprovacoes");
  const [finalFileUrl, setFinalFileUrl] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [materialFilter, setMaterialFilter] = useState<string>("all");
  const [finishFilter, setFinishFilter] = useState<string>("all");
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [approvalThumbUrl, setApprovalThumbUrl] = useState<string>("");
  const [approvalThumbPreview, setApprovalThumbPreview] = useState<string>("");
  const [searchFilter, setSearchFilter] = useState<string>("");

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [sharedPdfUrl, setSharedPdfUrl] = useState<string>("");

  const [correcaoItem, setCorrecaoItem] = useState<any>(null);
  const [correcaoThumbUrl, setCorrecaoThumbUrl] = useState<string>("");
  const [correcaoSelectedSponsorIds, setCorrecaoSelectedSponsorIds] = useState<Set<string>>(new Set());
  const [correcaoSponsorFilter, setCorrecaoSponsorFilter] = useState<string>("all");

  const { data: allItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: correcaoItems = [], isLoading: correcaoLoading } = useQuery<any[]>({
    queryKey: ["/api/items/resubmission-needed"],
  });

  const { data: events = [] } = useQuery<any[]>({
    queryKey: ["/api/events"],
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

  const submitForApprovalMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setSelectedItem(null);
      setApprovalThumbUrl("");
      setApprovalThumbPreview("");
      toast({
        title: "Peça enviada para aprovação",
        description: "A peça foi enviada para aprovação do patrocinador",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar peça",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitBulkForApprovalMutation = useMutation({
    mutationFn: async ({ itemIds, pdfUrl }: { itemIds: string[]; pdfUrl: string }) => {
      const promises = itemIds.map(itemId =>
        apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl: pdfUrl })
      );
      return await Promise.all(promises);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      setShowBulkDialog(false);
      setSelectedItemIds(new Set());
      setSharedPdfUrl("");
      toast({
        title: "Peças enviadas para aprovação",
        description: `${variables.itemIds.length} peças foram enviadas com o mesmo PDF`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar peças",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const submitFinalFileMutation = useMutation({
    mutationFn: async ({ itemId, finalFileUrl }: { itemId: string; finalFileUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/submit-final-file`, { finalFileUrl });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSelectedItem(null);
      setFinalFileUrl("");
      toast({
        title: "Arquivo final enviado",
        description: "O arquivo final foi enviado para revisão da solicitação",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao enviar arquivo final",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resubmitMutation = useMutation({
    mutationFn: async ({ itemId, newThumbUrl, sponsorIds }: { itemId: string; newThumbUrl: string; sponsorIds: string[] }) => {
      return await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/resubmit`, { newThumbUrl, sponsorIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setCorrecaoItem(null);
      setCorrecaoThumbUrl("");
      setCorrecaoSelectedSponsorIds(new Set());
      toast({
        title: "Nova arte enviada",
        description: "O Atendimento foi notificado para revisar",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
    },
  });

  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  const convertGCSUrlToLocalPath = (gcsUrl: string): string => {
    if (gcsUrl.startsWith('/')) return gcsUrl;
    const match = gcsUrl.match(/\/\.private\/(.+?)(?:\?|$)/);
    if (match) return `/objects/${match[1]}`;
    return gcsUrl;
  };

  const uniqueTypes = Array.from(new Set(allItems.map(item => item.type))).sort();
  const uniqueMaterials = Array.from(new Set(allItems.map(item => item.material).filter(Boolean))).sort();
  const uniqueFinishes = Array.from(new Set(allItems.map(item => item.finish).filter(Boolean))).sort();

  const months = [
    { value: "all", label: "Todos os meses" },
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" }, { value: "4", label: "Abril" },
    { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  const getFilteredItemsForTab = (tab: string) => {
    return allItems
      .filter(item => {
        const matchesEvent = eventFilter === "all" || item.eventId === eventFilter;
        let matchesView = false;
        if (tab === "criar-aprovacoes") {
          matchesView = item.status === 'awaiting_submission';
        } else if (tab === "finalizar-layouts") {
          matchesView = item.status === 'sponsor_approved';
        } else if (tab === "finalizados") {
          matchesView = ['awaiting_final_review','ready_for_production','approved','inProduction','produced','delivered'].includes(item.status);
        }
        const matchesType = typeFilter === "all" || item.type === typeFilter;
        const matchesMaterial = materialFilter === "all" || item.material === materialFilter;
        const matchesFinish = finishFilter === "all" || item.finish === finishFilter;
        let matchesNext10Days = true;
        if (next10DaysFilter && item.event?.truckDepartureDate) {
          const today = new Date(); today.setHours(0,0,0,0);
          const tenDaysFromNow = new Date(today); tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
          const dep = new Date(item.event.truckDepartureDate);
          matchesNext10Days = dep >= today && dep <= tenDaysFromNow;
        }
        let matchesMonth = true;
        if (monthFilter !== "all" && item.event?.truckDepartureDate) {
          matchesMonth = (new Date(item.event.truckDepartureDate).getMonth() + 1).toString() === monthFilter;
        }
        const matchesSearch = !searchFilter || [item.displayId, item.type, item.description, item.event?.name].some(
          f => f && f.toLowerCase().includes(searchFilter.toLowerCase())
        );
        return matchesEvent && matchesView && matchesType && matchesMaterial && matchesFinish && matchesNext10Days && matchesMonth && matchesSearch;
      })
      .sort((a, b) => {
        const eA = a.event?.name || '', eB = b.event?.name || '';
        if (eA !== eB) return eA.localeCompare(eB, 'pt-BR');
        const gA = typeToGroup[a.type] || '', gB = typeToGroup[b.type] || '';
        if (gA !== gB) return gA.localeCompare(gB, 'pt-BR');
        const idA = parseInt(String(a.displayId || '0').replace(/\D/g, '')) || 0;
        const idB = parseInt(String(b.displayId || '0').replace(/\D/g, '')) || 0;
        return idA - idB;
      });
  };

  const filteredItems = getFilteredItemsForTab(activeTab);
  const itemsForEvent = eventFilter === "all" ? allItems : allItems.filter(item => item.eventId === eventFilter);
  const pendingCount = getFilteredItemsForTab("criar-aprovacoes").length;
  const needsFinalFileCount = getFilteredItemsForTab("finalizar-layouts").length;
  const finalizadosCount = getFilteredItemsForTab("finalizados").length;
  const correcaoCount = correcaoItems.length;
  const pendingItems = filteredItems.filter(item => item.status === 'awaiting_submission');

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setApprovalThumbUrl(item.approvalThumbUrl || "");
    setApprovalThumbPreview(item.approvalThumbUrl || "");
    setFinalFileUrl(item.finalFileUrl || "");
  };

  const handleSubmitForApproval = () => {
    if (!selectedItem || !approvalThumbUrl) {
      toast({ title: "Erro", description: "É necessário fazer upload do thumb de aprovação", variant: "destructive" });
      return;
    }
    submitForApprovalMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  const handleSubmitFinalFile = () => {
    if (!selectedItem || !finalFileUrl) {
      toast({ title: "Erro", description: "É necessário informar o caminho do arquivo final", variant: "destructive" });
      return;
    }
    submitFinalFileMutation.mutate({ itemId: selectedItem.id, finalFileUrl });
  };

  const toggleItemSelection = (itemId: string) => {
    const s = new Set(selectedItemIds);
    if (s.has(itemId)) s.delete(itemId); else s.add(itemId);
    setSelectedItemIds(s);
  };

  const toggleAllSelection = () => {
    if (selectedItemIds.size === pendingItems.length) setSelectedItemIds(new Set());
    else setSelectedItemIds(new Set(pendingItems.map(i => i.id)));
  };

  const handleBulkSubmit = () => {
    if (!sharedPdfUrl) {
      toast({ title: "Erro", description: "É necessário fazer upload do PDF compartilhado", variant: "destructive" });
      return;
    }
    submitBulkForApprovalMutation.mutate({ itemIds: Array.from(selectedItemIds), pdfUrl: sharedPdfUrl });
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "criar-aprovacoes", label: "Mandar para Aprovação", count: pendingCount, testId: "tab-criar-aprovacoes" },
    { id: "correcao", label: "Correção", count: correcaoCount, testId: "tab-correcao" },
    { id: "finalizar-layouts", label: "Finalizar Arte", count: needsFinalFileCount, testId: "tab-finalizar-layouts" },
    { id: "finalizados", label: "Finalizados", count: finalizadosCount, testId: "tab-finalizados" },
  ];

  const statCards = [
    {
      label: "Pendentes",
      value: pendingCount,
      sub: "+hoje",
      subColor: "#f97316",
      iconBg: "#fff7ed",
      iconColor: "#f97316",
      Icon: Clock,
      testId: "stat-pending",
      borderLeft: false,
    },
    {
      label: "Aguard. Patrocin.",
      value: itemsForEvent.filter(i => i.status === 'awaiting_sponsor_approval').length,
      sub: "Aguardando",
      subColor: "#d97706",
      iconBg: "#fffbeb",
      iconColor: "#d97706",
      Icon: Clock,
      testId: "stat-awaiting-sponsor",
      borderLeft: false,
    },
    {
      label: "Patrocin. Aprovou",
      value: itemsForEvent.filter(i => i.status === 'sponsor_approved').length,
      sub: "Verificado",
      subColor: "#2563eb",
      iconBg: "#eff6ff",
      iconColor: "#2563eb",
      Icon: CheckCircle,
      testId: "stat-sponsor-approved",
      borderLeft: false,
    },
    {
      label: "Prontos p/ Prod.",
      value: itemsForEvent.filter(i => ['ready_for_production','approved'].includes(i.status)).length,
      sub: "Liberado",
      subColor: "#16a34a",
      iconBg: "#f0fdf4",
      iconColor: "#16a34a",
      Icon: Package,
      testId: "stat-ready-production",
      borderLeft: true,
    },
  ];

  const renderGroupedTable = (items: any[], tabId: string) => {
    if (items.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          {tabId === "criar-aprovacoes" ? <CheckCircle style={{ width: 48, height: 48, color: '#16a34a', margin: '0 auto 16px' }} /> :
           tabId === "finalizar-layouts" ? <Upload style={{ width: 48, height: 48, color: '#2563eb', margin: '0 auto 16px' }} /> :
           <Eye style={{ width: 48, height: 48, color: '#a8a29e', margin: '0 auto 16px' }} />}
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', marginBottom: 4 }}>
            {tabId === "criar-aprovacoes" ? "Tudo liberado!" : tabId === "finalizar-layouts" ? "Nenhum item aguardando arquivo final" : "Nenhum item finalizado"}
          </p>
          <p style={{ fontSize: 13, color: '#a8a29e' }}>
            {tabId === "criar-aprovacoes" ? "Não há itens pendentes no momento" : "Histórico vazio"}
          </p>
        </div>
      );
    }

    const groups: { event: string; type: string; group: string; eventObj: any; items: any[] }[] = [];
    items.forEach(item => {
      const eventName = item.event?.name || 'Sem Evento';
      const typeName = item.type;
      const groupName = typeToGroup[typeName] || '';
      const last = groups[groups.length - 1];
      if (last && last.event === eventName && last.type === typeName) {
        last.items.push(item);
      } else {
        groups.push({ event: eventName, type: typeName, group: groupName, eventObj: item.event, items: [item] });
      }
    });

    let lastEventName = '';
    let lastGroupName = '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map((group, gIdx) => {
          const showEventHeader = group.event !== lastEventName;
          if (showEventHeader) lastGroupName = '';
          const showGroupHeader = !showEventHeader && group.group !== '' && group.group !== lastGroupName;
          lastEventName = group.event;
          lastGroupName = group.group;
          const allPendingInGroup = group.items.filter(i => i.status === 'awaiting_submission');
          return (
            <Fragment key={`${group.event}-${group.type}-${gIdx}`}>
              {showGroupHeader && (
                <div style={{ backgroundColor: '#dbeafe', borderRadius: 8, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, marginTop: -8 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group.group}</span>
                </div>
              )}
            <div style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: '#ffffff', border: '1px solid #e7e5e4' }}>
              {showEventHeader && (
                <div style={{
                  padding: '14px 20px',
                  background: 'linear-gradient(to right, #ea580c, #f97316)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Star style={{ width: 18, height: 18, color: '#ffffff', fill: '#ffffff' }} />
                    <span style={{ color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: '-0.03em', textTransform: 'uppercase' }}>
                      {group.event}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    {group.eventObj?.startDate && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600 }}>
                        <Calendar style={{ width: 12, height: 12 }} />
                        {new Date(group.eventObj.startDate).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {group.eventObj?.truckDepartureDate && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600 }}>
                        <Truck style={{ width: 12, height: 12 }} />
                        Saída: {new Date(group.eventObj.truckDepartureDate).toLocaleDateString('pt-BR')} às {new Date(group.eventObj.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {group.eventObj?.truckDepartureDate && (() => {
                      const dls = [
                        { label: 'Entrega de Layouts',  days: group.eventObj.deadlineEntregaLayouts  ?? -20 },
                        { label: 'Aprovação de Layout', days: group.eventObj.deadlineAprovacaoLayout ?? -12 },
                      ];
                      const tod = new Date(); tod.setHours(0,0,0,0);
                      return dls.map(({ label, days }) => {
                        const d = new Date(new Date(group.eventObj.truckDepartureDate).getTime() + days * 86400000);
                        d.setHours(0,0,0,0);
                        const diff = Math.ceil((d.getTime() - tod.getTime()) / 86400000);
                        const ds = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                        const s = diff < 0
                          ? { bg: 'rgba(255,80,80,0.22)', border: 'rgba(255,80,80,0.38)', text: '#ffb3b3' }
                          : diff === 0
                          ? { bg: 'rgba(255,200,80,0.28)', border: 'rgba(255,200,80,0.45)', text: '#ffe59c' }
                          : diff <= 3
                          ? { bg: 'rgba(255,160,50,0.22)', border: 'rgba(255,160,50,0.38)', text: '#ffc78a' }
                          : { bg: 'rgba(255,255,255,0.12)', border: 'rgba(255,255,255,0.2)', text: 'rgba(255,255,255,0.72)' };
                        return (
                          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 99, padding: '3px 9px', fontSize: 10, fontWeight: 700, color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                          </span>
                        );
                      });
                    })()}
                    <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {group.items.length} {group.items.length === 1 ? 'Item' : 'Itens'}
                    </span>
                  </div>
                </div>
              )}
              <div style={{ overflowX: 'auto' }} className="scrollbar-visible">
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4' }}>
                      {tabId === "criar-aprovacoes" && (
                        <th style={{ padding: '10px 16px', width: 40 }}>
                          <Checkbox
                            checked={allPendingInGroup.length > 0 && allPendingInGroup.every(i => selectedItemIds.has(i.id))}
                            onCheckedChange={() => {
                              const s = new Set(selectedItemIds);
                              if (allPendingInGroup.every(i => s.has(i.id))) {
                                allPendingInGroup.forEach(i => s.delete(i.id));
                              } else {
                                allPendingInGroup.forEach(i => s.add(i.id));
                              }
                              setSelectedItemIds(s);
                            }}
                            data-testid={`checkbox-group-${gIdx}`}
                          />
                        </th>
                      )}
                      {[
                        { label: 'ID', w: 80 },
                        { label: 'Qtd', w: 50 },
                        { label: `${group.type}`, flex: true },
                        ...(tabId === 'finalizados' ? [
                          { label: 'Patrocinadores', w: 140 },
                          { label: 'Thumb', w: 80 },
                          { label: 'Arq. Final', w: 160 },
                        ] : []),
                        { label: 'Dimensões (V / A)', w: 160 },
                        { label: 'M²', w: 60 },
                        { label: 'Material', w: 120 },
                        { label: 'Ações', w: 120, right: true },
                      ].map((col, ci) => (
                        <th
                          key={ci}
                          style={{
                            padding: '10px 16px',
                            fontSize: 10,
                            fontWeight: 700,
                            color: '#a8a29e',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            width: col.flex ? undefined : col.w,
                            textAlign: col.right ? 'right' : 'left',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(item => (
                      <Fragment key={item.id}>
                        <tr
                          data-testid={`row-pending-item-${item.id}`}
                          style={{ borderBottom: '1px solid #f5f5f4', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff'}
                        >
                          {tabId === "criar-aprovacoes" && (
                            <td style={{ padding: '12px 16px', width: 40 }}>
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => toggleItemSelection(item.id)}
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            </td>
                          )}
                          {/* ID */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#78716c', fontWeight: 600 }} data-testid={`text-display-id-${item.id}`}>
                                {item.displayId}
                              </span>
                              {tabId === "finalizados" && <StatusBadge status={item.status} />}
                              {tabId === "criar-aprovacoes" && item.rejectedBySponsor && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 5px' }} data-testid={`badge-rejected-sponsor-${item.id}`}>
                                  REPROV.
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Qtd */}
                          <td style={{ padding: '12px 16px', fontWeight: 700, color: '#1c1917', fontSize: 14 }}>
                            {String(item.quantity || '—').padStart(2, '0')}
                          </td>
                          {/* Descrição */}
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontWeight: 600, color: '#1c1917', fontSize: 13 }}>{item.description || item.type}</span>
                              {tabId !== 'finalizados' && item.sponsors && item.sponsors.length > 0 && (
                                <span style={{ fontSize: 11, color: '#78716c' }}>
                                  Logos: {item.sponsors.map((s: any) => s.name).join(', ')}
                                </span>
                              )}
                              {item.observations && (
                                <span style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <AlertCircle style={{ width: 10, height: 10 }} />{item.observations}
                                </span>
                              )}
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#f97316', textDecoration: 'none', fontWeight: 600 }} data-testid={`link-reference-arte-${item.id}`}>
                                  <img src={item.referenceUrl} style={{ width: 16, height: 16, objectFit: 'cover', borderRadius: 3, border: '1px solid #fed7aa' }} alt="" />
                                  Ref.
                                </a>
                              )}
                            </div>
                          </td>
                          {/* Patrocinadores — finalizados only */}
                          {tabId === 'finalizados' && (
                            <td style={{ padding: '12px 16px' }}>
                              {item.sponsors && item.sponsors.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {item.sponsors.map((s: any) => (
                                    <span
                                      key={s.id}
                                      style={{
                                        display: 'inline-block', fontSize: 10, fontWeight: 700,
                                        backgroundColor: '#fff7ed', color: '#c2410c',
                                        border: '1px solid #fed7aa', borderRadius: 4,
                                        padding: '2px 6px', whiteSpace: 'nowrap',
                                      }}
                                    >
                                      {s.name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ fontSize: 12, color: '#a8a29e' }}>—</span>
                              )}
                            </td>
                          )}

                          {/* Thumb aprovado — finalizados only */}
                          {tabId === 'finalizados' && (
                            <td style={{ padding: '12px 16px' }}>
                              {item.approvalThumbUrl ? (() => {
                                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(item.approvalThumbUrl.toLowerCase());
                                return isImage ? (
                                  <a href={item.approvalThumbUrl} target="_blank" rel="noopener noreferrer" title="Ver thumb aprovado">
                                    <img
                                      src={item.approvalThumbUrl}
                                      alt="Thumb"
                                      style={{ width: 48, height: 32, objectFit: 'cover', borderRadius: 4, border: '1px solid #e7e5e4', display: 'block' }}
                                    />
                                  </a>
                                ) : (
                                  <a
                                    href={item.approvalThumbUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Ver PDF aprovado"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 32, backgroundColor: '#fef2f2', borderRadius: 4, border: '1px solid #fecaca' }}
                                  >
                                    <FileText style={{ width: 16, height: 16, color: '#ef4444' }} />
                                  </a>
                                );
                              })() : (
                                <span style={{ fontSize: 12, color: '#a8a29e' }}>—</span>
                              )}
                            </td>
                          )}

                          {/* Arquivo final — finalizados only */}
                          {tabId === 'finalizados' && (
                            <td style={{ padding: '12px 16px', maxWidth: 160 }}>
                              {item.finalFileUrl ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                  <FolderOpen style={{ width: 12, height: 12, color: '#16a34a', flexShrink: 0 }} />
                                  <span
                                    title={item.finalFileUrl}
                                    style={{
                                      fontSize: 11, color: '#15803d', fontWeight: 600,
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                      maxWidth: 120,
                                    }}
                                  >
                                    {item.finalFileUrl.split('/').pop() || item.finalFileUrl}
                                  </span>
                                </div>
                              ) : (
                                <span style={{ fontSize: 11, color: '#f97316', fontWeight: 600 }}>Pendente</span>
                              )}
                            </td>
                          )}

                          {/* Dimensões */}
                          <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                            {item.visualWidth && item.visualHeight ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#1c1917' }}>{item.visualWidth} × {item.visualHeight}</span>
                                {item.fileWidth && item.fileHeight && (
                                  <span style={{ fontSize: 11, color: '#a8a29e' }}>{item.fileWidth} × {item.fileHeight} <span style={{ fontSize: 9 }}>(sangria)</span></span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#a8a29e', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          {/* m² */}
                          <td style={{ padding: '12px 16px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, color: '#1c1917' }}>
                            {item.calculatedM2 || '—'}
                          </td>
                          {/* Material */}
                          <td style={{ padding: '12px 16px' }}>
                            {item.material ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  backgroundColor: '#f5f5f4',
                                  color: '#78716c',
                                  borderRadius: 4,
                                  fontSize: 10,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.material}
                                </span>
                                {item.finish && (
                                  <span style={{ fontSize: 10, color: '#a8a29e' }}>{item.finish}</span>
                                )}
                              </div>
                            ) : <span style={{ color: '#a8a29e', fontSize: 12 }}>—</span>}
                          </td>
                          {/* Ações */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => handleViewDetails(item)}
                                data-testid={`button-view-${item.id}`}
                                title="Ver detalhes"
                                style={{
                                  width: 32, height: 32, borderRadius: 8,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'none', border: '1px solid #e7e5e4', cursor: 'pointer',
                                  color: '#a8a29e', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; e.currentTarget.style.borderColor = '#f97316'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
                              >
                                <Eye style={{ width: 14, height: 14 }} />
                              </button>
                              {(tabId === "criar-aprovacoes" || tabId === "finalizar-layouts") && (
                                <button
                                  onClick={() => handleViewDetails(item)}
                                  data-testid={`button-action-${item.id}`}
                                  style={{
                                    height: 32, padding: '0 12px', borderRadius: 8,
                                    backgroundColor: tabId === "criar-aprovacoes" ? '#f97316' : '#2563eb',
                                    color: '#ffffff', border: 'none', cursor: 'pointer',
                                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                    transition: 'filter 0.15s',
                                  }}
                                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
                                  onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                                >
                                  {tabId === "criar-aprovacoes" ? "Enviar Aprovação" : "Finalizar Arte"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </Fragment>
          );
        })}
      </div>
    );
  };

  const renderCorrecaoTab = () => {
    if (correcaoLoading) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e7e5e4', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
        </div>
      );
    }
    if (correcaoItems.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <CheckCircle style={{ width: 48, height: 48, color: '#16a34a', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', marginBottom: 4 }}>Sem correção pendente</p>
          <p style={{ fontSize: 13, color: '#a8a29e' }}>Nenhum item aguarda nova versão de arte</p>
        </div>
      );
    }

    const correcaoSponsors: { id: string; name: string; color: string }[] = [];
    const seenSponsorIds = new Set<string>();
    correcaoItems.forEach((item: any) => {
      (item.awaitingArteApprovals || []).forEach((a: any) => {
        if (a.sponsor && !seenSponsorIds.has(a.sponsorId)) {
          seenSponsorIds.add(a.sponsorId);
          correcaoSponsors.push({ id: a.sponsorId, name: a.sponsor.name, color: a.sponsor.color });
        }
      });
    });

    const filteredCorrecaoItems = correcaoSponsorFilter === "all"
      ? correcaoItems
      : correcaoItems.filter((item: any) => (item.awaitingArteApprovals || []).some((a: any) => a.sponsorId === correcaoSponsorFilter));

    return (
      <div>
        {/* Section header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: '"Space Grotesk", sans-serif', fontSize: 18, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.03em', marginBottom: 8 }}>
            <AlertTriangle style={{ width: 20, height: 20, color: '#ba1a1a' }} />
            Aguardando Correções
          </h2>

          {/* Sponsor filter pills */}
          {correcaoSponsors.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filtrar:</span>
              {[{ id: "all", name: "Todos", color: "#a8a29e" }, ...correcaoSponsors].map(sp => {
                const isActive = correcaoSponsorFilter === sp.id;
                return (
                  <button
                    key={sp.id}
                    onClick={() => setCorrecaoSponsorFilter(sp.id)}
                    data-testid={`filter-correcao-sponsor-${sp.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      height: 28, padding: '0 12px', borderRadius: 100,
                      border: isActive ? '1.5px solid #ba1a1a' : '1px solid #e7e5e4',
                      backgroundColor: isActive ? '#fef2f2' : '#ffffff',
                      color: isActive ? '#ba1a1a' : '#78716c',
                      fontSize: 12, fontWeight: isActive ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {sp.id !== "all" && <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: sp.color }} />}
                    {sp.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Correction cards — 2-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(480px, 1fr))', gap: 20 }}>
          {filteredCorrecaoItems.map((item: any) => {
            const approvalsToShow = correcaoSponsorFilter === "all"
              ? item.awaitingArteApprovals
              : item.awaitingArteApprovals.filter((a: any) => a.sponsorId === correcaoSponsorFilter);
            const isImage = item.approvalThumbUrl && /\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl);
            return (
              <div
                key={item.id}
                data-testid={`card-correcao-${item.id}`}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #e7e5e4',
                  borderLeft: '4px solid #ba1a1a',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                }}
              >
                {/* Watermark */}
                <div style={{ position: 'absolute', right: -12, top: -12, opacity: 0.04, pointerEvents: 'none' }}>
                  <X style={{ width: 96, height: 96, color: '#ba1a1a' }} />
                </div>

                {/* Card body: thumb + info side by side */}
                <div style={{ display: 'flex', gap: 0, padding: '20px 20px 16px' }}>
                  {/* Thumb */}
                  <div style={{
                    width: 140, height: 140, borderRadius: 8,
                    backgroundColor: '#f5f5f4',
                    flexShrink: 0, overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginRight: 16,
                  }}>
                    {isImage ? (
                      <img
                        src={item.approvalThumbUrl}
                        alt="Thumb reprovado"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : item.approvalThumbUrl ? (
                      <a
                        href={item.approvalThumbUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textDecoration: 'none', color: '#ba1a1a' }}
                      >
                        <FileText style={{ width: 28, height: 28 }} />
                        <span style={{ fontSize: 10, fontWeight: 600 }}>Ver PDF</span>
                      </a>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#a8a29e' }}>
                        <FileImage style={{ width: 24, height: 24 }} />
                        <span style={{ fontSize: 10 }}>Sem thumb</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#ba1a1a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Recusado pelo Patrocinador
                        </span>
                        <span style={{ color: '#e7e5e4' }}>•</span>
                        <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 10, color: '#a8a29e' }}>{item.displayId}</span>
                      </div>
                      <h4 style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1.3 }}>
                        {item.type}{item.description ? ` — ${item.description}` : ''}
                      </h4>

                      {/* Rejection reasons */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {approvalsToShow.map((approval: any) => (
                          <div
                            key={approval.id}
                            style={{
                              padding: '8px 10px',
                              backgroundColor: 'rgba(186,26,26,0.04)',
                              border: '1px solid rgba(186,26,26,0.12)',
                              borderRadius: 8,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: approval.rejectionReason ? 4 : 0 }}>
                              {approval.sponsor?.color && (
                                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />
                              )}
                              <span style={{ fontSize: 12, fontWeight: 700, color: '#1c1917' }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                              {approval.rejectedAt && (
                                <span style={{ fontSize: 10, color: '#a8a29e' }}>em {new Date(approval.rejectedAt).toLocaleDateString('pt-BR')}</span>
                              )}
                            </div>
                            {approval.rejectionReason && (
                              <p style={{ fontSize: 12, color: '#ba1a1a', margin: 0, lineHeight: 1.4 }}>
                                <strong>Motivo:</strong> {approval.rejectionReason}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  padding: '12px 20px',
                  backgroundColor: '#fafaf9',
                  borderTop: '1px solid #e7e5e4',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <button
                    onClick={() => {
                      setCorrecaoItem(item);
                      setCorrecaoThumbUrl("");
                      setCorrecaoSelectedSponsorIds(new Set(item.awaitingArteApprovals.map((a: any) => a.sponsorId)));
                    }}
                    data-testid={`button-open-correcao-${item.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      backgroundColor: '#f97316', color: '#ffffff', border: 'none',
                      borderRadius: 8, height: 36, padding: '0 18px',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      transition: 'filter 0.15s',
                      boxShadow: '0 2px 8px rgba(249,115,22,0.3)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
                    onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                  >
                    <RotateCcw style={{ width: 13, height: 13 }} />
                    Enviar Nova Arte
                  </button>
                  {item.approvalThumbUrl && (
                    <a
                      href={item.approvalThumbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: 12, fontWeight: 600, color: '#78716c',
                        textDecoration: 'none', transition: 'color 0.15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#1c1917')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#78716c')}
                    >
                      Ver Histórico
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: '32px', maxWidth: 1600, margin: '0 auto', height: '100%', overflowY: 'auto' }} className="space-y-8">

      {/* ── 1. STAT CARDS ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat) => {
          const Icon = stat.Icon;
          return (
            <div
              key={stat.testId}
              style={{
                backgroundColor: '#ffffff',
                padding: '20px 24px',
                borderRadius: 12,
                border: '1px solid #e7e5e4',
                borderLeft: stat.borderLeft ? '4px solid #22c55e' : '1px solid #e7e5e4',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: '#78716c' }}>{stat.label}</span>
                <span style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: stat.iconBg, color: stat.iconColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 36, fontWeight: 700, color: '#1c1917', letterSpacing: '-0.03em', lineHeight: 1 }} data-testid={stat.testId}>
                  {String(stat.value).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: stat.subColor }}>{stat.sub}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── 2. FILTERS BAR ────────────────────────────────────────────────── */}
      <div style={{
        backgroundColor: '#f3f4f3',
        padding: '12px 16px',
        borderRadius: 12,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <Search style={{ width: 14, height: 14, color: '#a8a29e', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchFilter}
            onChange={e => setSearchFilter(e.target.value)}
            placeholder="Buscar arte, ID ou projeto..."
            data-testid="input-search-filter"
            style={{
              width: '100%', paddingLeft: 32, paddingRight: 12, height: 36,
              backgroundColor: '#ffffff', border: 'none', borderRadius: 8,
              fontSize: 13, color: '#1c1917', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Event combobox */}
        <Popover open={openEventCombobox} onOpenChange={setOpenEventCombobox}>
          <PopoverTrigger asChild>
            <button
              style={{
                height: 36, padding: '0 12px', borderRadius: 8,
                backgroundColor: '#ffffff', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 500, color: '#1c1917',
                minWidth: 160,
              }}
              data-testid="button-event-filter"
            >
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {eventFilter === "all" ? "Evento: Todos" : events.find((e: any) => e.id === eventFilter)?.name || "Selecionar"}
              </span>
              <ChevronsUpDown style={{ width: 12, height: 12, color: '#a8a29e', flexShrink: 0 }} />
            </button>
          </PopoverTrigger>
          <PopoverContent style={{ width: 280, padding: 0 }}>
            <Command>
              <CommandInput placeholder="Buscar evento..." />
              <CommandList>
                <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="all" onSelect={() => { setEventFilter("all"); setOpenEventCombobox(false); }}>
                    <Check className={cn("mr-2 h-4 w-4", eventFilter === "all" ? "opacity-100" : "opacity-0")} />
                    Todos os eventos
                  </CommandItem>
                  {events.map((event: any) => (
                    <CommandItem key={event.id} value={event.name} onSelect={() => { setEventFilter(event.id); setOpenEventCombobox(false); }}>
                      <Check className={cn("mr-2 h-4 w-4", eventFilter === event.id ? "opacity-100" : "opacity-0")} />
                      {event.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Month select */}
        <select
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
          data-testid="select-month-filter"
          style={{
            height: 36, padding: '0 12px', borderRadius: 8,
            backgroundColor: '#ffffff', border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 500, color: '#1c1917',
            minWidth: 140,
          }}
        >
          {months.map(m => <option key={m.value} value={m.value}>{m.value === "all" ? "Mês: Todos" : m.label}</option>)}
        </select>

        {/* Next 10 days toggle */}
        <button
          onClick={() => setNext10DaysFilter(!next10DaysFilter)}
          data-testid="button-next-10-days-filter"
          style={{
            height: 36, padding: '0 12px', borderRadius: 8,
            backgroundColor: next10DaysFilter ? '#1c1917' : '#ffffff',
            color: next10DaysFilter ? '#ffffff' : '#78716c',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
          }}
        >
          <Truck style={{ width: 13, height: 13 }} />
          Próximos 10 dias
        </button>

        {/* PDF Upload button (ml-auto, only in criar-aprovacoes) */}
        {activeTab === "criar-aprovacoes" && (
          <button
            onClick={() => setShowBulkDialog(true)}
            disabled={selectedItemIds.size === 0}
            data-testid="button-open-bulk-upload"
            style={{
              marginLeft: 'auto',
              height: 36, padding: '0 16px', borderRadius: 8,
              backgroundColor: selectedItemIds.size > 0 ? '#1c1917' : '#e7e5e4',
              color: selectedItemIds.size > 0 ? '#ffffff' : '#a8a29e',
              border: 'none', cursor: selectedItemIds.size > 0 ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <Upload style={{ width: 13, height: 13 }} />
            {selectedItemIds.size > 0 ? `Upload PDF Compartilhado (${selectedItemIds.size})` : "Selecione itens para PDF"}
          </button>
        )}
      </div>

      {/* ── 3. TABS ───────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: 4, backgroundColor: 'rgba(214,211,209,0.5)',
        borderRadius: 12, width: 'fit-content',
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={tab.testId}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 20px', borderRadius: 9, border: 'none', cursor: 'pointer',
                backgroundColor: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#1c1917' : '#78716c',
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#1c1917'; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#78716c'; }}
            >
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 18, height: 18, borderRadius: 100,
                  fontSize: 10, fontWeight: 700,
                  backgroundColor: isActive ? '#1c1917' : '#e7e5e4',
                  color: isActive ? '#ffffff' : '#78716c',
                  padding: '0 5px',
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 4. CONTENT AREA ───────────────────────────────────────────────── */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e7e5e4', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : activeTab === "correcao" ? (
        renderCorrecaoTab()
      ) : (
        renderGroupedTable(filteredItems, activeTab)
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1 — CORREÇÃO: Enviar Nova Arte                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!correcaoItem} onOpenChange={(open) => {
        if (!open) { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoSelectedSponsorIds(new Set()); }
      }}>
        <DialogContent className="p-0 gap-0 max-h-[90vh] overflow-y-auto" style={{ maxWidth: 448, borderRadius: 12, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 16px 32px -12px rgba(28,25,23,0.1)' }}>
          <DialogTitle className="sr-only">Enviar Nova Arte</DialogTitle>
          <DialogDescription className="sr-only">Reenvio de arte para patrocinadores</DialogDescription>

          <div style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{
                  display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em',
                  fontWeight: 700, color: '#dc2626', backgroundColor: 'rgba(255,218,214,0.5)',
                  padding: '2px 8px', borderRadius: 4, width: 'fit-content'
                }}>Action Required</span>
                <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.05em', fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: 0, lineHeight: 1.15 }}>
                  Enviar Nova Arte
                </h2>
              </div>
              <button
                onClick={() => { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoSelectedSponsorIds(new Set()); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', padding: 2, borderRadius: 4, lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#1c1917')}
                onMouseLeave={e => (e.currentTarget.style.color = '#a8a29e')}
                data-testid="button-close-correcao-dialog"
              >
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>

            {correcaoItem && (
              <>
                {/* Rejection alerts — one per sponsor */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                  {correcaoItem.awaitingArteApprovals.map((approval: any) => (
                    <div key={approval.id} style={{
                      backgroundColor: 'rgba(255,218,214,0.2)', borderRadius: 8, padding: '12px 14px',
                      display: 'flex', gap: 10, borderLeft: '4px solid #dc2626'
                    }}>
                      <AlertTriangle style={{ width: 18, height: 18, color: '#dc2626', flexShrink: 0, marginTop: 1 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#93000a', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                          Motivo da Rejeição: {approval.sponsor?.name || 'Patrocinador'}
                        </p>
                        <p style={{ fontSize: 13, color: '#93000a', margin: 0 }}>
                          {approval.rejectionReason ? `"${approval.rejectionReason}"` : 'Sem motivo informado.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload zone */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8c7164', marginBottom: 8 }}>
                    Upload da Nova Versão
                  </label>
                  {correcaoThumbUrl ? (
                    <div style={{ border: '2px dashed #86efac', borderRadius: 10, backgroundColor: '#f0fdf4', padding: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                      {/\.(png|jpg|jpeg|gif|webp)/i.test(correcaoThumbUrl) ? (
                        <img src={correcaoThumbUrl} alt="Nova arte" style={{ maxHeight: 110, maxWidth: '100%', objectFit: 'contain', borderRadius: 6 }} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534' }}>
                          <FileText style={{ width: 20, height: 20 }} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>Arquivo enviado com sucesso</span>
                        </div>
                      )}
                      <button
                        onClick={() => setCorrecaoThumbUrl("")}
                        data-testid="button-remove-correcao-thumb"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 12, padding: '4px 10px', cursor: 'pointer' }}
                      >
                        <X style={{ width: 12, height: 12 }} /> Remover
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      height: 160, border: '2px dashed #e2e2e2', borderRadius: 12,
                      backgroundColor: '#f0efee', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background-color 0.15s'
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#e8e8e7'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0efee'; }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        <Upload style={{ width: 20, height: 20, color: '#9d4300' }} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#1c1917', margin: '0 0 2px' }}>Solte o arquivo aqui ou</p>
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => { setCorrecaoThumbUrl(convertGCSUrlToLocalPath(result.url)); }}
                        accept="image/*,application/pdf"
                        data-testid="uploader-correcao-thumb"
                        buttonVariant="ghost"
                        buttonClassName="h-auto py-0 px-0 text-sm font-medium underline decoration-2 underline-offset-2 text-orange-700 hover:bg-transparent"
                      >
                        procure
                      </FileUploader>
                      <p style={{ fontSize: 10, color: '#a8a29e', margin: '4px 0 0' }}>PDF, PNG ou SVG até 25MB</p>
                    </div>
                  )}
                </div>

                {/* Sponsor checkboxes */}
                <div style={{ marginBottom: 32 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8c7164', marginBottom: 10 }}>
                    Re-enviar para APROVAÇÃO:
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {correcaoItem.awaitingArteApprovals.map((approval: any) => {
                      const isSelected = correcaoSelectedSponsorIds.has(approval.sponsorId);
                      const isPendente = true;
                      return (
                        <label
                          key={approval.sponsorId}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 12px', borderRadius: 8, cursor: 'pointer', userSelect: 'none',
                            backgroundColor: '#f0efee', transition: 'background-color 0.15s'
                          }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#e8e8e7'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f0efee'; }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(correcaoSelectedSponsorIds);
                              if (e.target.checked) next.add(approval.sponsorId); else next.delete(approval.sponsorId);
                              setCorrecaoSelectedSponsorIds(next);
                            }}
                            data-testid={`checkbox-correcao-sponsor-${approval.sponsorId}`}
                            style={{ width: 18, height: 18, accentColor: '#dc2626', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                          />
                          {approval.sponsor?.color && (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917', flex: 1 }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, color: isPendente ? '#dc2626' : '#78716c', backgroundColor: '#ffffff', padding: '3px 8px', borderRadius: 4 }}>
                            {isPendente ? 'Pendente' : 'Opcional'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  disabled={!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending}
                  onClick={() => {
                    if (correcaoItem) {
                      resubmitMutation.mutate({ itemId: correcaoItem.id, newThumbUrl: correcaoThumbUrl, sponsorIds: Array.from(correcaoSelectedSponsorIds) });
                    }
                  }}
                  data-testid="button-submit-correcao"
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 8, border: 'none',
                    backgroundColor: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? '#fca5a5' : '#dc2626',
                    color: '#ffffff', fontWeight: 700, fontSize: 17,
                    fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em',
                    cursor: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? 'not-allowed' : 'pointer',
                    boxShadow: '0 4px 16px rgba(185,28,28,0.2)', transition: 'filter 0.15s, transform 0.1s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}
                  onMouseEnter={e => { if (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) return; e.currentTarget.style.filter = 'brightness(0.92)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                  onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                  onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  {resubmitMutation.isPending ? (
                    <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />Enviando...</>
                  ) : (
                    'Confirmar Re-envio'
                  )}
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2 — ITEM DETAILS DIALOG                                      */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <ItemDetailsDialog
        item={selectedItem}
        auditLogs={selectedItem ? auditLogs.filter((log: any) => log.entityType === 'item' && log.entityId === selectedItem.id) : []}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        topActions={selectedItem?.status === 'sponsor_approved' ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1c1917', margin: 0 }}>
                Finalização de Layout
              </h3>
              <span style={{ fontSize: 10, backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                FASE FINAL
              </span>
            </div>

            {/* Glass-green container */}
            <div style={{
              background: 'rgba(240,253,244,0.5)', backdropFilter: 'blur(8px)',
              border: '2px solid #bbf7d0', borderRadius: 12, padding: 20,
              display: 'flex', flexDirection: 'column', gap: 20
            }}>
              {/* Thumb aprovado preview */}
              {selectedItem.approvalThumbUrl && (() => {
                const url = selectedItem.approvalThumbUrl.toLowerCase();
                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url);
                const isPdf = !isImage;
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'rgba(255,255,255,0.6)', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isPdf
                        ? <FileText style={{ width: 20, height: 20, color: '#ef4444' }} />
                        : <img src={selectedItem.approvalThumbUrl} alt="Thumb" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} />
                      }
                    </div>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <p style={{ fontSize: 12, fontWeight: 700, color: '#14532d', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>
                        {selectedItem.approvalThumbUrl.split('/').pop() || 'THUMB_APROVADO'}
                      </p>
                      <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#16a34a', textDecoration: 'underline' }}>
                        Clique para visualizar
                      </a>
                    </div>
                  </div>
                );
              })()}

              {/* Input caminho arquivo final */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(20,83,45,0.6)', paddingLeft: 4 }}>
                  Caminho do Arquivo Final
                </label>
                <div style={{ position: 'relative' }}>
                  <FolderOpen style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#16a34a' }} />
                  <Input
                    id="finalFilePath"
                    placeholder="Cole o caminho ou link do servidor..."
                    value={finalFileUrl}
                    onChange={(e) => setFinalFileUrl(e.target.value)}
                    data-testid="input-final-file-path"
                    style={{ paddingLeft: 36, paddingRight: 16, paddingTop: 12, paddingBottom: 12, background: '#ffffff', border: 'none', boxShadow: '0 0 0 1px #bbf7d0', borderRadius: 8, fontSize: 12, fontWeight: 500 }}
                  />
                </div>
              </div>

              {/* CTA button */}
              <button
                onClick={handleSubmitFinalFile}
                disabled={submitFinalFileMutation.isPending || !finalFileUrl}
                data-testid="button-submit-final"
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 8, border: 'none',
                  backgroundColor: (submitFinalFileMutation.isPending || !finalFileUrl) ? '#fcd9b7' : '#fd761a',
                  color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 900,
                  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em',
                  cursor: (submitFinalFileMutation.isPending || !finalFileUrl) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 16px rgba(253,118,26,0.2)', transition: 'filter 0.15s, transform 0.1s'
                }}
                onMouseEnter={e => { if (submitFinalFileMutation.isPending || !finalFileUrl) return; e.currentTarget.style.filter = 'brightness(0.92)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {submitFinalFileMutation.isPending ? 'Enviando...' : 'Enviar para Revisão'}
                {!submitFinalFileMutation.isPending && <ArrowRight style={{ width: 16, height: 16 }} />}
              </button>
            </div>
          </section>
        ) : null}
        customActions={selectedItem && (
          <div>
            {selectedItem.status === 'awaiting_submission' && (
              <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1c1917', margin: 0 }}>
                    Thumb de Aprovação
                  </h3>
                  <span style={{ fontSize: 10, backgroundColor: 'rgba(159,153,150,0.2)', color: '#35322f', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                    REQUISITO A
                  </span>
                </div>

                {approvalThumbPreview && approvalThumbPreview.trim() !== "" ? (
                  /* State A2: thumb uploaded */
                  <div style={{ background: 'rgba(250,245,255,0.5)', backdropFilter: 'blur(8px)', border: '1px solid #ddd6fe', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Thumbnail row */}
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div style={{ width: 96, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid #ddd6fe', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', flexShrink: 0, backgroundColor: '#e5e7eb' }}>
                        <img
                          src={approvalThumbPreview}
                          alt="Preview do Thumb"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, gap: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: 9, fontWeight: 900, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, lineHeight: 1 }}>
                            Carregado
                          </span>
                          <span style={{ fontSize: 10, color: 'rgba(59,7,100,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110 }}>
                            {approvalThumbPreview.split('/').pop() || 'thumb_upload'}
                          </span>
                        </div>
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onComplete={(result) => {
                            const localPath = convertGCSUrlToLocalPath(result.url);
                            setApprovalThumbUrl(localPath);
                            setApprovalThumbPreview(localPath);
                            toast({ title: "Upload concluído", description: "Thumb atualizado" });
                          }}
                          onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                          onFileSelect={(file) => {
                            const reader = new FileReader();
                            reader.onload = (e) => { setApprovalThumbPreview(e.target?.result as string); };
                            reader.readAsDataURL(file);
                          }}
                          accept="image/*"
                          buttonVariant="ghost"
                          buttonClassName="h-auto p-0 text-[11px] font-bold text-purple-600 underline hover:text-purple-800 hover:bg-transparent"
                        >
                          Alterar Thumb
                        </FileUploader>
                      </div>
                    </div>

                    {/* Enviar para Aprovação */}
                    <button
                      onClick={handleSubmitForApproval}
                      disabled={submitForApprovalMutation.isPending}
                      data-testid="button-submit-approval-header"
                      style={{
                        width: '100%', padding: '14px 0', borderRadius: 8, border: 'none',
                        backgroundColor: submitForApprovalMutation.isPending ? '#c4b5fd' : '#7c3aed',
                        color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                        fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em',
                        cursor: submitForApprovalMutation.isPending ? 'not-allowed' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                        boxShadow: '0 4px 16px rgba(124,58,237,0.2)', transition: 'filter 0.15s, transform 0.1s'
                      }}
                      onMouseEnter={e => { if (submitForApprovalMutation.isPending) return; e.currentTarget.style.filter = 'brightness(0.88)'; }}
                      onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                      onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <Send style={{ width: 14, height: 14 }} />
                      {submitForApprovalMutation.isPending ? 'Enviando...' : 'Enviar para Aprovação'}
                    </button>
                  </div>
                ) : (
                  /* State A1: empty upload zone */
                  <div style={{
                    background: 'rgba(250,245,255,0.5)', backdropFilter: 'blur(8px)',
                    border: '1px dashed #ddd6fe', borderRadius: 12, padding: 32,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.15s'
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(237,233,254,0.5)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(250,245,255,0.5)'; }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <FileImage style={{ width: 24, height: 24, color: '#7c3aed' }} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#3b0764', margin: '0 0 4px' }}>Upload de Miniatura</p>
                      <p style={{ fontSize: 12, color: 'rgba(59,7,100,0.6)', margin: 0 }}>Arraste ou selecione o arquivo JPG/PNG</p>
                    </div>
                    <FileUploader
                      onGetUploadParameters={getUploadUrl}
                      onComplete={(result) => {
                        const localPath = convertGCSUrlToLocalPath(result.url);
                        setApprovalThumbUrl(localPath);
                        setApprovalThumbPreview(localPath);
                        toast({ title: "Upload concluído", description: "Thumb de aprovação enviado com sucesso" });
                      }}
                      onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                      onFileSelect={(file) => {
                        const reader = new FileReader();
                        reader.onload = (e) => { setApprovalThumbPreview(e.target?.result as string); };
                        reader.readAsDataURL(file);
                      }}
                      accept="image/*"
                      buttonVariant="ghost"
                      buttonClassName="mt-2 text-[11px] font-bold uppercase tracking-wider bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 hover:text-white transition-all"
                    >
                      Fazer Upload do Thumb
                    </FileUploader>
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 3 — BULK PDF UPLOAD                                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBulkDialog} onOpenChange={(open) => { if (!open) { setShowBulkDialog(false); setSharedPdfUrl(""); } }}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 600, borderRadius: 12, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 16px 32px -12px rgba(28,25,23,0.1)' }}>
          <DialogTitle className="sr-only">Upload PDF Compartilhado</DialogTitle>
          <DialogDescription className="sr-only">Vincular um PDF a múltiplos itens</DialogDescription>

          <div style={{ padding: 32 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.05em', fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: 0, lineHeight: 1.1 }}>
                  Upload PDF<br />Compartilhado
                </h2>
                <p style={{ fontSize: 13, color: '#78716c', margin: 0 }}>Vincular um único documento a múltiplos itens selecionados.</p>
              </div>
              <button
                onClick={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}
                style={{ padding: '6px', backgroundColor: '#f3f4f3', border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#78716c', lineHeight: 1, flexShrink: 0 }}
                onMouseEnter={e => { e.currentTarget.style.color = '#1c1917'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#78716c'; }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* 2-column grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              {/* Left: items list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9d4300', margin: 0 }}>
                  Itens Selecionados ({String(selectedItemIds.size).padStart(2, '0')})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
                  {Array.from(selectedItemIds).map((itemId, idx) => {
                    const item = allItems.find(i => i.id === itemId);
                    if (!item) return null;
                    const isFirst = idx === 0;
                    return (
                      <div key={itemId} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                        backgroundColor: '#f0efee', borderRadius: 8,
                        borderLeft: isFirst ? '2px solid #9d4300' : '2px solid transparent'
                      }}>
                        <div style={{ width: 40, height: 40, backgroundColor: '#d6d3d1', borderRadius: 6, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {item.approvalThumbUrl ? (
                            <img src={item.approvalThumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <FileImage style={{ width: 16, height: 16, color: '#a8a29e' }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.displayId} · {item.type}
                          </p>
                          <p style={{ fontSize: 10, color: '#78716c', margin: 0 }}>
                            {item.event?.name || 'Sem evento'}{item.sponsors?.[0]?.name ? ` • ${item.sponsors[0].name}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: upload zone */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#9d4300', margin: '0 0 16px' }}>
                  Arquivo Principal
                </h3>
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#f0efee', borderRadius: 12, border: '2px dashed rgba(157,67,0,0.3)',
                  padding: 24, textAlign: 'center', transition: 'border-color 0.15s', minHeight: 200
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(157,67,0,0.6)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(157,67,0,0.3)'; }}
                >
                  {sharedPdfUrl ? (
                    <>
                      <div style={{ width: 56, height: 56, backgroundColor: '#ffffff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: 12 }}>
                        <FileText style={{ width: 28, height: 28, color: '#dc2626' }} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: '0 0 4px' }}>PDF Carregado</p>
                      <a href={sharedPdfUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#9d4300', textDecoration: 'underline', display: 'block', marginBottom: 12 }}>
                        Visualizar arquivo
                      </a>
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => { setSharedPdfUrl(convertGCSUrlToLocalPath(result.url)); toast({ title: "Upload concluído", description: "PDF compartilhado enviado com sucesso" }); }}
                        onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                        accept=".pdf,application/pdf"
                        buttonVariant="ghost"
                        buttonClassName="h-8 text-xs font-bold uppercase tracking-wider bg-stone-900 text-white rounded-full px-4 hover:bg-stone-700 hover:text-white"
                      >
                        Alterar PDF
                      </FileUploader>
                    </>
                  ) : (
                    <>
                      <div style={{ width: 64, height: 64, backgroundColor: '#ffffff', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginBottom: 14, transition: 'transform 0.2s' }}>
                        <FileText style={{ width: 30, height: 30, color: '#9d4300' }} />
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: '0 0 4px' }}>Upload PDF</p>
                      <p style={{ fontSize: 11, color: '#78716c', margin: '0 0 14px', padding: '0 8px' }}>Este arquivo será aplicado a todos os itens à esquerda.</p>
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => { setSharedPdfUrl(convertGCSUrlToLocalPath(result.url)); toast({ title: "Upload concluído", description: "PDF compartilhado enviado com sucesso" }); }}
                        onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                        accept=".pdf,application/pdf"
                        buttonVariant="ghost"
                        buttonClassName="h-8 text-[10px] font-bold uppercase tracking-wider bg-stone-900 text-white rounded-full px-4 hover:bg-stone-700 hover:text-white"
                      >
                        Selecionar Arquivo
                      </FileUploader>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
              <button
                onClick={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}
                style={{
                  flex: 1, padding: '14px 0', borderRadius: 8, border: 'none',
                  backgroundColor: '#e8e8e7', color: '#1c1917', fontWeight: 700,
                  fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, cursor: 'pointer', transition: 'background-color 0.15s'
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e2e2e2'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#e8e8e7'; }}
              >
                Cancelar
              </button>
              <button
                disabled={submitBulkForApprovalMutation.isPending || !sharedPdfUrl}
                onClick={handleBulkSubmit}
                data-testid="button-submit-bulk-pdf"
                style={{
                  flex: 2, padding: '14px 0', borderRadius: 8, border: 'none',
                  backgroundColor: (submitBulkForApprovalMutation.isPending || !sharedPdfUrl) ? '#fcd9b7' : '#f97316',
                  color: '#ffffff', fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', fontSize: 16,
                  cursor: (submitBulkForApprovalMutation.isPending || !sharedPdfUrl) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 16px rgba(234,88,12,0.2)', transition: 'filter 0.15s, transform 0.1s'
                }}
                onMouseEnter={e => { if (submitBulkForApprovalMutation.isPending || !sharedPdfUrl) return; e.currentTarget.style.filter = 'brightness(0.92)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
              >
                {submitBulkForApprovalMutation.isPending ? (
                  <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #fff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />Enviando...</>
                ) : (
                  <>Processar Bulk Upload <Send style={{ width: 16, height: 16 }} /></>
                )}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
