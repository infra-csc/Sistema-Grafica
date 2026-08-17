import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { SponsorChips } from "@/components/sponsor-chips";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { CheckCircle, AlertCircle, Eye, Search, X, XCircle, Clock, Loader2, ChevronDown, ChevronRight, Zap, FileText, Download, RotateCcw, Package, Paperclip, Plus, Pencil, Trash2, Truck, Cog, Send, Link2, Unlock, Upload, ImageIcon, ArrowRightLeft, Check } from "lucide-react";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
// Prazo desta tela = marco de APROVAÇÃO DE LAYOUT. Regra pura e única, testada
// em server/__tests__/atendimento-prazo.test.ts.
import {
  filtrarAtrasadosNaAprovacao,
  inicioDoDia,
  isEventoAtrasadoNaAprovacao,
  prazoAprovacaoLayout,
} from "@/lib/atendimento-prazo";
import { FilePreview } from "@/components/file-preview";
import {
  getStatusMeta, getStatusLabel, getStatusShort, PRODUCTION_STATUSES,
  isEventoFinalizado, motivoEventoFinalizado, marcoEventoFinalizado,
  avisoPecasOcultas, todayBusinessMs,
} from "@/lib/status";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useState, useMemo, Fragment, useEffect, useRef, useDeferredValue } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { Undo2 } from "lucide-react";
import { ModalHeader, ModalFooter, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";

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

// Reutilizado nos sorts de lista: um Collator criado uma vez é bem mais rápido
// que chamar localeCompare a cada comparação. Sem locale, como era antes.
const COLLATOR = new Intl.Collator();

// ── Visual canônico do status de aprovação de UM patrocinador ──────────────
// Usado nos chips do histórico, no modal de detalhe, no modal de revisão e
// nos SponsorChips da lista. Antes eram 5 blocos de cores duplicados que já
// estavam divergindo (verde #166534 num ponto, #15803d noutro).
// `awaiting_arte` (o servidor grava este status na reprovação — nunca
// 'rejected') tem visual próprio vermelho/âmbar: houve reprovação E a Arte
// está refazendo. Tons de texto escuros (700) da lib de status, AA sobre tint.
const approvalVisual = (status?: string | null) => {
  const isApproved     = status === 'approved';
  const isRejected     = status === 'rejected';
  const isNewVersion   = status === 'new_version_pending';
  const isAwaitingArte = status === 'awaiting_arte';
  return {
    isApproved, isRejected, isNewVersion, isAwaitingArte,
    chip: (isApproved ? 'approved' : (isRejected || isAwaitingArte) ? 'rejected' : 'pending') as 'approved' | 'rejected' | 'pending',
    label:  isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isAwaitingArte ? 'Reprovado · aguardando Arte' : isNewVersion ? 'Nova versão' : 'Aguardando',
    bg:     isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : isAwaitingArte ? '#fffbeb' : isNewVersion ? '#fffbeb' : '#f5f5f4',
    border: isApproved ? '#bbf7d0' : isRejected ? '#fecaca' : isAwaitingArte ? '#fde68a' : isNewVersion ? '#fde68a' : '#e7e5e4',
    text:   isApproved ? '#15803d' : isRejected ? '#b91c1c' : isAwaitingArte ? '#b91c1c' : isNewVersion ? '#92400e' : '#6b7280',
    dot:    isApproved ? '#22c55e' : isRejected ? '#ef4444' : isAwaitingArte ? '#f59e0b' : isNewVersion ? '#f59e0b' : '#d1d5db',
  };
};

// ── Pipeline de fluxo do cartão de histórico (10 etapas) ───────────────────
// Const de módulo: antes era recriado a cada card renderizado. As etapas de
// produção/entrega derivam da lista canônica PRODUCTION_STATUSES da lib de
// status (+ aliases legados que versões antigas gravaram no banco).
const [ST_IN_PRODUCTION, ST_PRODUCED, ST_CONFERRED, ST_DELIVERED] = PRODUCTION_STATUSES;
const PIPELINE_STAGES: { key: string; label: string; color: string; statuses: string[] }[] = [
  { key: 'solicitado',   label: 'Solicitado',      color: '#f97316', statuses: ['draft', 'requested', 'solicitado'] },
  { key: 'vinculacao',   label: 'Vinculação',      color: '#746e69', statuses: ['awaiting_linking'] },
  { key: 'ag_aprovacao', label: 'Ag. Aprovação',   color: '#f97316', statuses: ['awaiting_submission', 'awaiting_approval', 'awaiting_sponsor_approval'] },
  { key: 'aprovado',     label: 'Aprovado',        color: '#22c55e', statuses: ['sponsor_approved'] },
  { key: 'finalizacao',  label: 'Finalização',     color: '#a855f7', statuses: ['awaiting_finalization', 'awaiting_creator_review'] },
  { key: 'revisao',      label: 'Revisão',         color: '#d946ef', statuses: ['awaiting_final_review'] },
  { key: 'pronto',       label: 'Pronto p/ Prod.', color: '#10b981', statuses: ['ready_for_production', 'pronto_para_producao', 'approved', 'liberado'] },
  { key: 'producao',     label: 'Em Produção',     color: '#f59e0b', statuses: [ST_IN_PRODUCTION, 'in_production', 'em_producao'] },
  { key: 'produzido',    label: 'Produzido',       color: '#ec4899', statuses: [ST_PRODUCED, 'produzido'] },
  { key: 'entregue',     label: 'Entregue',        color: '#7c3aed', statuses: [ST_CONFERRED, 'conferido', ST_DELIVERED, 'entregue'] },
];

// ── Status pós-aprovação do patrocinador ───────────────────────────────────
// Peça em qualquer um destes status JÁ passou pela aprovação do patrocinador,
// mesmo sem registro individual de approval — o atalho "Aprovar Ativo" muda o
// status do item sem criar approvals, e os predicados do Histórico e do book
// (exportPool) exigiam `approvals.some(approved)`, sumindo com a peça.
const POST_APPROVAL_STATUSES: string[] = [
  'sponsor_approved',        // aprovado pelo patrocinador
  'awaiting_finalization',   // finalização da Arte
  'awaiting_creator_review', // revisão da Solicitação
  'awaiting_final_review',   // revisão final
  'ready_for_production',    // pronto para produção
  'pronto_para_producao',    // alias legado em pt
  'approved',                // liberado
  'liberado',                // alias legado em pt
  ...PRODUCTION_STATUSES,    // inProduction, produced, conferred, delivered
];
const isPastApproval = (item: any): boolean => POST_APPROVAL_STATUSES.includes(item.status);

// ── Config das ações do log de auditoria (modal de revisão) ────────────────
// Const de módulo: antes era recriada a cada LINHA do histórico renderizada.
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

export default function Atendimento() {
  const { toast } = useToast();
  const { user } = useAuth();
  // Gate de papel: o servidor só aceita decisões de "atendimento" e "admin"
  // (403 para os demais). A UI espelha o gate em vez de deixar o clique
  // estourar erro — os outros papéis veem a tela em modo somente leitura.
  const canDecide = user?.role === "atendimento" || user?.role === "admin";
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Aba ativa: pendentes ou histórico
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending");

  // Filtros — aba Pendentes
  const [searchTerm, setSearchTerm] = useState("");
  // Adia o termo usado na filtragem (input segue responsivo, tabela não engasga).
  const deferredSearchTerm = useDeferredValue(searchTerm);
  // Persiste o filtro de evento ao abrir uma peça e voltar.
  const [eventFilter, setEventFilter] = useState<string[]>(() => { try { return JSON.parse(sessionStorage.getItem("atendimento:eventFilter") || "[]"); } catch { return []; } });
  useEffect(() => { sessionStorage.setItem("atendimento:eventFilter", JSON.stringify(eventFilter)); }, [eventFilter]);
  const [itemTypeFilter, setItemTypeFilter] = useState<string[]>([]);
  // ?patrocinador=<id> — deep-link da Gestão de Prazos ("Cobrar no
  // Atendimento"): a tela abre já filtrada no patrocinador da cobrança.
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => {
    const sp = new URLSearchParams(window.location.search).get("patrocinador");
    return sp ? [sp] : [];
  });
  // ?atrasados=1 — recorte "só o que passou do marco de Aprovação de Layout".
  const [atrasadosFilter, setAtrasadosFilter] = useState<boolean>(
    () => new URLSearchParams(window.location.search).get("atrasados") === "1",
  );

  // Âncora de "hoje" ESTÁVEL. O selo de prazo do cabeçalho de evento fazia
  // `new Date()` DENTRO do render de cada grupo: a mesma tela podia responder
  // dias diferentes na virada da meia-noite, e nenhuma memoização segurava um
  // valor que nascia novo a cada passada. Mesmo padrão de `agora` na Gráfica.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 600_000);
    return () => clearInterval(id);
  }, []);
  const hoje = useMemo(() => inicioDoDia(new Date(agora)), [agora]);

  // Filtros — aba Histórico
  const [histEventFilter, setHistEventFilter] = useState<string[]>([]);
  const [histSponsorFilter, setHistSponsorFilter] = useState<string[]>([]);
  const [histPeriodFilter, setHistPeriodFilter] = useState<string>("all");
  const [histSearchTerm, setHistSearchTerm] = useState<string>("");

  // Modal detalhe de aprovações (Histórico)
  const [histDetailItem, setHistDetailItem] = useState<any>(null);

  // Quantos cards renderizar por vez. Cada card tem timeline e chips; com
  // centenas de peças o navegador engasgava ao montar tudo de uma vez.
  const PAGE_SIZE = 25;
  const [histVisible, setHistVisible] = useState(PAGE_SIZE);
  const [pendVisible, setPendVisible] = useState(PAGE_SIZE);

  // Peça em preview no lote (clique na arte abre grande, sem mexer na seleção).
  const [batchPreviewItem, setBatchPreviewItem] = useState<any>(null);

  // Eventos recolhidos na aba Pendentes (o cabeçalho vira um card clicável).
  const [collapsedEvents, setCollapsedEvents] = useState<Set<string>>(new Set());
  const toggleEventCollapsed = (id: string) =>
    setCollapsedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Modal Exportar PDF
  const [showExportPDFModal, setShowExportPDFModal] = useState(false);

  const [approvedGroupExpanded, setApprovedGroupExpanded] = useState(false);

  // Lote por Patrocinador + Evento
  const [batchSponsorId, setBatchSponsorId]           = useState<string>("");
  const [batchEventId, setBatchEventId]               = useState<string>("");
  const [batchRejectReason, setBatchRejectReason]     = useState<string>("");
  const [batchShowRejectForm, setBatchShowRejectForm] = useState<boolean>(false);
  const [batchSelectedItemIds, setBatchSelectedItemIds] = useState<Set<string>>(new Set());
  // Painel de lote recolhido por padrão: quem entra para revisar peça a peça
  // não precisa do painel ocupando meia tela. A escolha persiste na sessão.
  const [batchPanelOpen, setBatchPanelOpen] = useState<boolean>(() => {
    try { return sessionStorage.getItem("atendimento:batchPanelOpen") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { sessionStorage.setItem("atendimento:batchPanelOpen", batchPanelOpen ? "1" : "0"); } catch {}
  }, [batchPanelOpen]);

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

  const isMobile = useIsMobile();
  const { data: items = [], isLoading: itemsLoading, isError: itemsError, refetch: refetchItems } = useQuery<any[]>({
    queryKey: ["/api/items"],
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery<any[]>({
    queryKey: ["/api/events"],
  });

  const { data: sponsors = [] } = useQuery<any[]>({
    queryKey: ["/api/sponsors"],
  });

  // Histórico DA PEÇA em revisão, com escopo no servidor. A listagem global
  // tem teto de 500 registros — peça antiga caía fora da janela e o modal
  // mostrava "sem histórico" (bug reportado pelo dono).
  const { data: auditLogs = [] } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "item", selectedItem?.id],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${selectedItem!.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: dialogOpen && !!selectedItem?.id,
    placeholderData: [],
  });
  const { data: standardItems = [] } = useQuery<any[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Memoizar awaiting items para evitar fetches desnecessários.
  //
  // Evento FINALIZADO sai da fila — duas origens, um gate só
  // (`motivoEventoFinalizado`, @shared/prazo-dates):
  //   · "encerrado" → um admin encerrou o evento; é a promessa feita em voz
  //     alta na confirmação ("sai da Gestão de Prazos e das filas de trabalho").
  //   · "realizado" → a DATA DO EVENTO (events.startDate, não a saída do
  //     caminhão) já passou. Regra do dono: cobrar aprovação de patrocinador
  //     para um evento que já aconteceu não faz sentido. Durante o DIA do
  //     evento a peça ainda conta; sai depois da virada do dia em São Paulo.
  //     Evento SEM data de início nunca sai por esta regra.
  //
  // O filtro é do CLIENTE, não de /api/items — o Detalhe do Evento e o Painel
  // Geral leem a mesma chave e a lista de peças precisa continuar aparecendo lá
  // (são telas de registro; esta é tela de ação). `item.event` vem cru do
  // storage (nunca passa por enrichEvent): traz `status` e `startDate`, que são
  // exatamente as duas colunas que o predicado lê.
  const hojeBusinessMs = todayBusinessMs();
  const awaitingItems = useMemo(() =>
    items.filter(item =>
      item.status === 'awaiting_sponsor_approval' && !item.skipApproval
      && !isEventoFinalizado(item.event, hojeBusinessMs)
    ), [items, hojeBusinessMs]
  );

  // Quantas peças a regra acima tirou de vista, POR MOTIVO. Sem este número a
  // tela diria "Nenhum item pendente" — isto é, "nada a fazer" — a quem, na
  // verdade, teve o trabalho retirado; e sem o motivo não dá para saber se há
  // volta (reabrir o evento) ou não (ele já aconteceu).
  const pecasOcultas = useMemo(() => {
    let encerrado = 0, realizado = 0;
    for (const item of items) {
      if (item.status !== 'awaiting_sponsor_approval' || item.skipApproval) continue;
      const motivo = motivoEventoFinalizado(item.event, hojeBusinessMs);
      if (motivo === 'encerrado') encerrado++;
      else if (motivo === 'realizado') realizado++;
    }
    return { encerrado, realizado };
  }, [items, hojeBusinessMs]);
  const avisoOcultas = useMemo(
    () => avisoPecasOcultas(pecasOcultas, 'desta fila'),
    [pecasOcultas],
  );

  // Chave estável do conjunto de peças em aprovação: o efeito abaixo só refaz
  // o batch quando uma peça ENTRA ou SAI do fluxo, quando o total de itens
  // muda (p.ex. no primeiro carregamento) OU quando uma peça em aprovação é
  // atualizada (fingerprint com approvalThumbUrl + updatedAt — o servidor
  // grava updatedAt em todo updateItem). Sem o fingerprint, a nova versão da
  // Arte (resubmit muda o thumb sem tirar a peça de awaiting_sponsor_approval)
  // não refazia o batch e a peça sumia da contagem até um F5.
  const awaitingKey = useMemo(
    () => `${items.length}:${awaitingItems
      .map(i => `${i.id}:${i.approvalThumbUrl ?? ''}:${i.updatedAt ?? ''}`)
      .sort()
      .join('|')}`,
    [items.length, awaitingItems]
  );

  // Carregar patrocinadores e aprovações — uma única chamada batch.
  // Carrega sempre (não só quando há itens pendentes) para alimentar também
  // a aba Histórico, que mostra itens já aprovados em qualquer status.
  useEffect(() => {
    requestIdRef.current += 1;
    const currentRequestId = requestIdRef.current;

    if (items.length === 0) {
      setItemSponsorsMap({});
      setItemApprovalsMap({});
      setLoadingSponsors(false);
      return;
    }

    setLoadingSponsors(true);

    apiRequest("GET", "/api/items/batch-approval-data")
      .then(res => res.json())
      .then(({ sponsorsByItem = {}, approvalsByItem = {} } = {}) => {
        if (currentRequestId !== requestIdRef.current) return;
        setItemSponsorsMap(sponsorsByItem);
        setItemApprovalsMap(approvalsByItem);
        setLoadingSponsors(false);
      })
      .catch(err => {
        console.error("Erro ao carregar dados de aprovação em lote:", err);
        if (currentRequestId === requestIdRef.current) setLoadingSponsors(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- awaitingKey é a chave estável de awaitingItems
  }, [awaitingKey]);

  // Carregar aprovações individuais de patrocinadores quando o dialog é aberto.
  // Guarda de corrida (cancelled): ao aprovar, o fluxo avança para a próxima
  // peça (setSelectedItem), disparando este efeito de novo. Sem a guarda, a
  // resposta lenta da peça ANTERIOR podia chegar depois e sobrescrever as
  // aprovações da peça atual — exibindo/decidindo sobre a peça errada.
  useEffect(() => {
    if (dialogOpen && selectedItem) {
      let cancelled = false;
      setLoadingSponsorApprovals(true);
      setSponsorApprovals([]);
      setRejectionReason("");
      setRejectingSponsorId(null);

      apiRequest("GET", `/api/items/${selectedItem.id}/sponsor-approvals`)
        .then(response => response.json())
        .then((approvals: SponsorApproval[]) => {
          if (cancelled) return;
          setSponsorApprovals(approvals);
          setLoadingSponsorApprovals(false);
        })
        .catch(error => {
          if (cancelled) return;
          console.error('Error loading sponsor approvals:', error);
          setLoadingSponsorApprovals(false);
        });

      return () => { cancelled = true; };
    }
  }, [dialogOpen, selectedItem]);

  /**
   * Atualiza a peça já no cache em vez de recarregar a lista inteira.
   * Recarregar /api/items (milhares de peças) + /api/audit-logs (milhares de
   * registros) a cada decisão deixava a revisão lenta. Eventos e logs são
   * marcados como desatualizados e só recarregam quando a tela precisar.
   */
  const applyItemDecisionToCache = (updatedItem?: any) => {
    if (updatedItem?.id) {
      const patch = (list?: any[]) =>
        list ? list.map(i => (i.id === updatedItem.id ? { ...i, ...updatedItem } : i)) : list;
      queryClient.setQueryData<any[]>(["/api/items"], patch);
      queryClient.setQueryData<any[]>(["/api/items/approved"], patch);
    } else {
      // Sem o item na resposta não dá para remendar com segurança: recarrega.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/events"], refetchType: "none" });
    // Só recarrega os logs se o histórico estiver aberto na tela.
    queryClient.invalidateQueries({
      queryKey: ["/api/audit-logs"],
      refetchType: dialogOpen ? "active" : "none",
    });
  };

  /**
   * Remenda UM registro de aprovação nos estados locais (mapa da lista e,
   * quando o modal mostra a mesma peça, a lista do modal) — em vez de deixar
   * o efeito refazer a chamada batch inteira a cada decisão.
   * O spread { ...a, ...approval } preserva o campo `sponsor` enriquecido
   * (as respostas de decisão devolvem o registro cru, sem `sponsor`).
   */
  const applyApprovalToCache = (itemId: string, approval?: SponsorApproval | null) => {
    if (!approval) return;
    const patch = (list: SponsorApproval[]) => {
      const exists = list.some(a => a.sponsorId === approval.sponsorId);
      return exists
        ? list.map(a => (a.sponsorId === approval.sponsorId ? { ...a, ...approval } : a))
        : [...list, approval];
    };
    setItemApprovalsMap(prev => ({ ...prev, [itemId]: patch(prev[itemId] || []) }));
    if (selectedItem?.id === itemId) setSponsorApprovals(prev => patch(prev));
  };

  const individualApproveMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/approve`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      // Remenda o registro de aprovação nos caches locais — sem refazer o batch.
      applyApprovalToCache(variables.itemId, data.approval);

      if (data.allApproved) {
        // O item mudou de status: a resposta traz o item atualizado.
        applyItemDecisionToCache(data.item);
        // Peça concluída: segue direto para a próxima da fila, sem voltar à lista.
        const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          setSelectedItem(next);
          toast({ title: "Peça aprovada", description: `Seguindo para ${next.displayId} · ${next.type}` });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: "Todos patrocinadores aprovaram", description: "Você revisou a última peça da fila." });
        }
      } else {
        // Decisão parcial: o item não mudou de status; só o log ficou defasado.
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: dialogOpen ? "active" : "none" });
        const sponsorName = itemSponsorsMap[variables.itemId]?.find((s: any) => s.id === variables.sponsorId)?.name;
        toast({ title: "Patrocinador aprovou", description: `${sponsorName || 'Patrocinador'} aprovou a peça` });
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
    onSuccess: (data, variables) => {
      // A resposta traz o registro de aprovação (status awaiting_arte) e o
      // item (flag rejectedBySponsor) — remenda os dois caches localmente.
      applyApprovalToCache(variables.itemId, data.approval);
      applyItemDecisionToCache(data.item);
      setRejectionReason("");
      setRejectingSponsorId(null);

      if (data.allDecided) {
        // Peça resolvida (volta para a Arte): segue para a próxima da fila.
        // Obs.: o endpoint atual não devolve `allDecided` — branch preservado
        // para quando o servidor passar a informar (item 21 do backlog).
        const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
        const next = idx >= 0 ? reviewQueue[idx + 1] : undefined;
        if (next) {
          setSelectedItem(next);
          toast({ title: "Peça devolvida para a Arte", description: `Seguindo para ${next.displayId} · ${next.type}` });
        } else {
          setDialogOpen(false);
          setSelectedItem(null);
          toast({ title: "Todos patrocinadores decidiram", description: "Peça retornou para Arte refazer o thumb." });
        }
      } else {
        toast({ title: "Reprovação registrada", description: "O item retorna para Arte preparar nova versão." });
      }
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reprovar", description: error.message || "Ocorreu um erro ao reprovar", variant: "destructive" });
    },
  });

  // Correção de admin: desfaz uma aprovação/reprovação feita por engano,
  // sem precisar mexer direto no banco. Só admin vê o botão (checado na UI).
  const revertApprovalMutation = useMutation({
    mutationFn: async ({ itemId, sponsorId }: { itemId: string; sponsorId: string }) => {
      const response = await apiRequest("POST", `/api/items/${itemId}/sponsor-approvals/${sponsorId}/revert`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      // A resposta traz { approval, item }: remenda os caches localmente.
      applyApprovalToCache(variables.itemId, data.approval);
      applyItemDecisionToCache(data.item);
      toast({ title: "Aprovação revertida", description: "O patrocinador volta a aguardar decisão." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reverter", description: error.message || "Não foi possível reverter a aprovação", variant: "destructive" });
    },
  });

  const sponsorApproveMutation = useMutation({
    mutationFn: async (itemId: string) => {
      // O endpoint devolve o item atualizado — dá para remendar o cache.
      const response = await apiRequest("PATCH", `/api/items/${itemId}/sponsor-approve`, {});
      return response.json();
    },
    onSuccess: (item) => {
      applyItemDecisionToCache(item);
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
      // O endpoint devolve o item atualizado — dá para remendar o cache.
      const response = await apiRequest("PATCH", `/api/items/${itemId}/sponsor-reject`, {});
      return response.json();
    },
    onSuccess: (item) => {
      applyItemDecisionToCache(item);
      setDialogOpen(false);
      setSelectedItem(null);
      toast({ title: "Peça reprovada", description: "A peça retornou para a Arte refazer." });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao reprovar peça", description: error.message || "Ocorreu um erro", variant: "destructive" });
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
        // Parseia cada resposta: { approval, item?, allApproved? } — permite
        // remendar os caches sem invalidar/refazer as listas inteiras.
        if (action === "approve") {
          return [apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/approve`, {}).then(r => r.json())];
        } else {
          return [apiRequest("POST", `/api/items/${item.id}/sponsor-approvals/${sponsorId}/reject`, { rejectionReason: reason || null }).then(r => r.json())];
        }
      });
      return await Promise.all(promises);
    },
    onSuccess: (results: any[], vars) => {
      // Nenhuma requisição saiu (todas as selecionadas já estavam decididas ou
      // sem o patrocinador): avisa em vez de anunciar um sucesso que não houve.
      if (results.length === 0) {
        toast({
          title: "Nenhuma peça elegível",
          description: "As peças selecionadas já foram decididas para este patrocinador.",
        });
        return;
      }
      let anyItemChanged = false;
      results.forEach((r: any) => {
        if (r?.approval) applyApprovalToCache(r.approval.itemId, r.approval);
        if (r?.item) { anyItemChanged = true; applyItemDecisionToCache(r.item); }
      });
      if (!anyItemChanged) {
        // Nenhum item mudou de status — ainda assim o log ficou defasado.
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: dialogOpen ? "active" : "none" });
      }
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

  /** Evento por id — o prazo da peça é o do evento dela. */
  const eventoPorId = useMemo(
    () => new Map((events as any[]).map((e: any) => [e.id, e])),
    [events],
  );

  // "Base" = todos os filtros MENOS o de atrasados. É dela que sai a contagem
  // exibida no próprio controle, que precisa continuar valendo depois do clique.
  const filteredItemsBase = useMemo(() => {
    return pendingItems.filter(item => {
      const hasSponsors = itemSponsorsMap[item.id]?.length > 0;
      if (!hasSponsors && !loadingSponsors) return false;

      const matchesSearch = deferredSearchTerm === "" ||
        item.type?.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(deferredSearchTerm.toLowerCase()) ||
        item.name?.toLowerCase().includes(deferredSearchTerm.toLowerCase());

      const matchesEvent = eventFilter.length === 0 || eventFilter.includes(item.eventId);
      const matchesType = itemTypeFilter.length === 0 || itemTypeFilter.includes(item.type);
      const matchesSponsor = sponsorFilter.length === 0 ||
        itemSponsorsMap[item.id]?.some(sponsor => sponsorFilter.includes(sponsor.id));

      return matchesSearch && matchesEvent && matchesType && matchesSponsor;
    });
  }, [pendingItems, deferredSearchTerm, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors]);

  // UMA passada, memoizada na âncora estável — nada de recalcular data por card.
  const atrasadosNaBase = useMemo(
    () => filtrarAtrasadosNaAprovacao(filteredItemsBase, eventoPorId, hoje),
    [filteredItemsBase, eventoPorId, hoje],
  );

  const filteredItems = atrasadosFilter ? atrasadosNaBase : filteredItemsBase;

  // Filtros facetados: cada filtro lista só o que existe na página, aplicando
  // os OUTROS filtros ativos (escolher um evento reduz tipos e patrocinadores).
  const facetPool = (exclude: 'event' | 'type' | 'sponsor') =>
    pendingItems.filter((item: any) => {
      if (!(itemSponsorsMap[item.id]?.length > 0) && !loadingSponsors) return false;
      // O recorte de atrasados também é faceta: sem ele aqui, o dropdown
      // ofereceria "Evento X · 12" e a lista devolveria 2.
      if (atrasadosFilter && !isEventoAtrasadoNaAprovacao(eventoPorId.get(item.eventId), hoje)) return false;
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (exclude !== 'type' && itemTypeFilter.length > 0 && !itemTypeFilter.includes(item.type)) return false;
      if (exclude !== 'sponsor' && sponsorFilter.length > 0 && !itemSponsorsMap[item.id]?.some(s => sponsorFilter.includes(s.id))) return false;
      return true;
    });

  const eventFilterOptions = useMemo(() => {
    const DOT: Record<string, string> = { urgente: '#ef4444', urgent: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const byId = new Map((events as any[]).map((e: any) => [e.id, e]));
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('event').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else {
        const ev = byId.get(i.eventId);
        map.set(i.eventId, { value: i.eventId, label: ev?.name || 'Sem evento', count: 1, dotColor: DOT[ev?.priority] });
      }
    });
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, events, atrasadosFilter, eventoPorId, hoje]);

  const typeFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool('type').forEach((i: any) => {
      if (!i.type) return;
      const cur = map.get(i.type);
      if (cur) cur.count++;
      else map.set(i.type, { value: i.type, label: i.type, count: 1 });
    });
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, atrasadosFilter, eventoPorId, hoje]);

  // Enquanto o mapa ainda carrega, mostra todos os patrocinadores da API
  // (sem contagem) para que o filtro apareça imediatamente. Assim que o mapa
  // ficar pronto, troca para as opções facetadas com contagem.
  const sponsorFilterOptions = useMemo(() => {
    if (loadingSponsors) {
      return (sponsors as any[]).map((s: any) => ({ value: s.id, label: s.name }));
    }
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('sponsor').forEach((i: any) => (itemSponsorsMap[i.id] ?? []).forEach((s: any) => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1, dotColor: s.color || '#a8a29e' });
    }));
    return Array.from(map.values());
  }, [pendingItems, eventFilter, itemTypeFilter, sponsorFilter, itemSponsorsMap, loadingSponsors, sponsors, atrasadosFilter, eventoPorId, hoje]);

  // Itens filtrados para o modal de exportação PDF (filtros independentes da página)
  // Pool para o modal de exportação compartilhado: anexa os patrocinadores
  // (que aqui vivem no itemSponsorsMap) e o evento a cada peça.
  // Pool de exportação: pendentes E já aprovadas. Órgãos como o Ministério do
  // Esporte exigem o book COMPLETO da etapa a cada nova solicitação, mesmo
  // quando só uma peça mudou — se só as pendentes entrassem, o book sairia
  // incompleto assim que as demais fossem aprovadas.
  const exportPool = useMemo(() => {
    const evById = new Map((events as any[]).map((e: any) => [e.id, e]));
    return (items as any[])
      .filter(item => {
        if ((itemSponsorsMap[item.id]?.length ?? 0) === 0) return false;
        // Entrou no fluxo de aprovação: está aguardando, já tem aprovação OU
        // está num status pós-aprovação (atalho "Aprovar Ativo" não cria approvals).
        const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
        return item.status === 'awaiting_sponsor_approval'
          || approvals.some(a => a.status === 'approved')
          || isPastApproval(item);
      })
      .map(item => ({
        ...item,
        sponsors: itemSponsorsMap[item.id] ?? [],
        event: item.event ?? evById.get(item.eventId),
      }));
  }, [items, itemSponsorsMap, itemApprovalsMap, events]);

  // Patrocinadores da peça já com o status de aprovação de cada um, para os
  // chips mostrarem a cor da marca E a decisão (aprovado / reprovado / aguardando).
  const sponsorsWithStatus = (item: any) => {
    const sps = itemSponsorsMap[item.id] || [];
    const apps: SponsorApproval[] = itemApprovalsMap[item.id] || [];
    return sps.map((s: any) => ({
      ...s,
      approvalStatus: approvalVisual(apps.find(a => a.sponsorId === s.id)?.status).chip,
    }));
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

  // ── Aba Histórico ───────────────────────────────────────────────────────
  // Itens que têm pelo menos uma aprovação de patrocinador com status 'approved',
  // independente do status atual (podem estar em produção, entregues, etc.)
  // Rótulo e cores do badge de status vêm da lib canônica (getStatusMeta) —
  // o mapa local que existia aqui divergia dos nomes usados nas outras telas.
  const historyItems = useMemo(() => {
    if (loadingSponsors) return [];
    const now = new Date();
    const cutoff = histPeriodFilter === "7d"  ? new Date(now.getTime() - 7  * 86400000)
                 : histPeriodFilter === "30d" ? new Date(now.getTime() - 30 * 86400000)
                 : histPeriodFilter === "90d" ? new Date(now.getTime() - 90 * 86400000)
                 : null;

    return (items as any[]).filter(item => {
      const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
      // Aprovação registrada OU status pós-aprovação: o atalho "Aprovar
      // Ativo" muda o status sem criar approvals e a peça sumia daqui.
      if (!approvals.some(a => a.status === 'approved') && !isPastApproval(item)) return false;

      if (histEventFilter.length > 0 && !histEventFilter.includes(item.eventId)) return false;

      if (histSponsorFilter.length > 0) {
        const itemSps = itemSponsorsMap[item.id] || [];
        if (!itemSps.some((s: any) => histSponsorFilter.includes(s.id))) return false;
      }

      if (cutoff) {
        const approvedAt = approvals
          .filter(a => a.status === 'approved' && a.approvedAt)
          .map(a => new Date(a.approvedAt!))
          .sort((a, b) => b.getTime() - a.getTime())[0];
        if (!approvedAt || approvedAt < cutoff) return false;
      }

      if (histSearchTerm.trim()) {
        const q = histSearchTerm.trim().toLowerCase();
        const matchType = item.type?.toLowerCase().includes(q);
        const matchId   = item.displayId?.toLowerCase().includes(q);
        const matchDesc = item.description?.toLowerCase().includes(q);
        if (!matchType && !matchId && !matchDesc) return false;
      }

      return true;
    }).sort((a: any, b: any) => {
      // Ordena pela aprovação mais recente
      const latestApproval = (item: any) => {
        const times = (itemApprovalsMap[item.id] || [])
          .filter((a: SponsorApproval) => a.status === 'approved' && a.approvedAt)
          .map((a: SponsorApproval) => new Date(a.approvedAt!).getTime());
        return times.length ? Math.max(...times) : 0;
      };
      return latestApproval(b) - latestApproval(a);
    });
  }, [items, itemApprovalsMap, itemSponsorsMap, loadingSponsors, histEventFilter, histSponsorFilter, histPeriodFilter, histSearchTerm]);

  // Fila de revisão: todas as peças pendentes na MESMA ordem em que aparecem
  // na tela (agrupadas por evento). É o que permite ir para a próxima peça sem
  // fechar o modal e voltar para a lista.
  const reviewQueue = useMemo(() => {
    const sorted = [...pendingGroup].sort((a, b) => {
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      return COLLATOR.compare(ga, gb) || COLLATOR.compare(a.type, b.type);
    });
    const byEvent = new Map<string, any[]>();
    sorted.forEach(item => {
      const eid = item.eventId || '__none__';
      if (!byEvent.has(eid)) byEvent.set(eid, []);
      byEvent.get(eid)!.push(item);
    });
    return Array.from(byEvent.values()).flat();
  }, [pendingGroup, typeToGroup]);

  /** Vai para a peça anterior/seguinte da fila. Sem próxima, encerra a revisão. */
  const goToAdjacentItem = (dir: 1 | -1) => {
    const idx = reviewQueue.findIndex((i: any) => i.id === selectedItem?.id);
    const next = idx >= 0 ? reviewQueue[idx + dir] : undefined;
    if (next) {
      setSelectedItem(next);
    } else {
      setDialogOpen(false);
      setSelectedItem(null);
    }
  };

  // Group pendingGroup by event - must be before any early return
  const itemsByEvent = useMemo(() => {
    const map = new Map<string, any[]>();
    const sorted = [...pendingGroup].sort((a, b) => {
      const ga = typeToGroup[a.type] || '', gb = typeToGroup[b.type] || '';
      return COLLATOR.compare(ga, gb) || COLLATOR.compare(a.type, b.type);
    });
    // Renderiza só os primeiros; o resto entra via "Carregar mais".
    sorted.slice(0, pendVisible).forEach(item => {
      const eid = item.eventId || '__none__';
      if (!map.has(eid)) map.set(eid, []);
      map.get(eid)!.push(item);
    });
    return map;
  }, [pendingGroup, typeToGroup, pendVisible]);

  // Mantém a seleção em sincronia com o conjunto elegível: se uma peça sai do
  // lote (decidida em outro lugar), ela some da seleção também. Só entram
  // sozinhas na seleção as peças NOVAS no conjunto (diff com o conjunto
  // anterior via ref) — antes, qualquer mudança no conjunto re-selecionava
  // TUDO e apagava as desmarcações manuais do usuário. Trocar de
  // patrocinador/evento recomeça com tudo selecionado (combo nova).
  const prevBatchEligibleRef = useRef<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  useEffect(() => {
    const key = `${batchSponsorId}:${batchEventId}`;
    const ids = new Set(batchEligibleItems.map(i => i.id));
    const prev = prevBatchEligibleRef.current;
    prevBatchEligibleRef.current = { key, ids };
    if (prev.key !== key) {
      setBatchSelectedItemIds(ids);
      return;
    }
    setBatchSelectedItemIds(prevSelected => {
      const next = new Set<string>();
      ids.forEach(id => {
        if (!prev.ids.has(id) || prevSelected.has(id)) next.add(id);
      });
      return next;
    });
  }, [batchSponsorId, batchEventId, batchEligibleItems]);

  // Ao trocar de aba ou mexer nos filtros, volta a listagem para o topo.
  useEffect(() => { setPendVisible(PAGE_SIZE); }, [activeTab, searchTerm, eventFilter, itemTypeFilter, sponsorFilter, atrasadosFilter]);

  // O recorte de atrasados vive na URL, como nas demais telas: é o link que se
  // manda para o colega ("olha o que já venceu"). replaceState com debounce de
  // 300ms (a regra da casa pede ≥200) e preservando os outros parâmetros — o
  // ?patrocinador= da Gestão de Prazos chega por aqui e não pode ser apagado.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      if (atrasadosFilter) p.set("atrasados", "1"); else p.delete("atrasados");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 300);
    return () => clearTimeout(timer);
  }, [atrasadosFilter]);
  useEffect(() => { setHistVisible(PAGE_SIZE); }, [activeTab, histEventFilter, histSponsorFilter, histPeriodFilter, histSearchTerm]);

  const getEventInfo = (eventId: string) => events.find((e: any) => e.id === eventId);

  const handleViewDetails = (item: any) => {
    // Limpa o motivo/patrocinador de reprovação para não vazar o texto
    // digitado numa peça anterior e reprovar a peça errada com justificativa alheia.
    setRejectionReason("");
    setRejectingSponsorId(null);
    setSelectedItem(item);
    setDialogOpen(true);
  };

  if (itemsLoading || eventsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (itemsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-base font-semibold text-red-700">Não foi possível carregar os itens</p>
        <p className="text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
        <button onClick={() => refetchItems()} className="mt-1 rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="bg-stone-50" style={{ height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px" : "32px" }}>

      {/* ─── HERO HEADER ─────────────────────────────────────────── */}
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-3">
            <span style={{
              backgroundColor: 'transparent', color: '#c2410c',
              fontSize: 11, fontWeight: 700,
              padding: '2px 8px', borderRadius: 6,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: '1px solid #fed7aa',
            }}>
              Fluxo de Verificação
            </span>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#9d4300', display: 'inline-block' }} />
            {/* Eyebrow com o nome do módulo no menu (padrão do breadcrumb de
                vincular-patrocinadores) — o texto antigo repetia o h1 logo abaixo. */}
            <span style={{ color: '#746e69', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Atendimento
            </span>
          </div>
          <h1 style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 'clamp(1.5rem, 2.5vw, 1.875rem)', fontWeight: 900,
            letterSpacing: '-0.03em', color: '#1c1917',
            lineHeight: 1.1, marginBottom: 12,
          }}>
            Aprovação do Patrocinador
          </h1>
          <p style={{ color: '#746e69', fontSize: 15, fontWeight: 500, lineHeight: 1.5 }}>
            Valide e aprove ativos de marca com cada patrocinador.
          </p>
        </div>
        <div
          data-testid="badge-pendentes-count"
          style={{
            display: activeTab === 'history' ? 'none' : 'flex', alignItems: 'center', gap: 12,
            padding: '12px 20px', borderRadius: 12,
            border: `1.5px solid ${actionableCount ? '#fed7aa' : '#e7e5e4'}`,
            backgroundColor: actionableCount ? '#fff7ed' : '#fafaf9',
            flexShrink: 0,
          }}
        >
          <span style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: 26, fontWeight: 800, lineHeight: 1,
            color: actionableCount ? '#c2410c' : '#746e69',
          }}>
            {actionableCount ?? '—'}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: actionableCount ? '#c2410c' : '#746e69' }}>
              Aguardam
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#746e69' }}>
              Aprovação
            </span>
          </div>
        </div>
      </header>

      {/* ─── ABAS ─────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Abas de aprovação" style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid #e7e5e4', paddingBottom: 0 }}>
        {([
          // Mesma conta do badge "Aguardam Aprovação" do topo (actionableCount):
          // antes a aba somava também peças bloqueadas/aprovadas e os dois
          // números divergiam na mesma tela.
          { key: 'pending', label: 'Pendentes', count: actionableCount },
          { key: 'history', label: 'Histórico', count: null },
        ] as const).map(tab => (
          <button
            key={tab.key}
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={activeTab === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '10px 20px', border: 'none', cursor: 'pointer',
              backgroundColor: 'transparent',
              borderBottom: activeTab === tab.key ? '2px solid #f97316' : '2px solid transparent',
              fontSize: 15, fontWeight: activeTab === tab.key ? 700 : 500,
              color: activeTab === tab.key ? '#c2410c' : '#746e69',
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: -1, transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.count != null && (
              <span style={{
                backgroundColor: '#f5f5f4',
                color: '#746e69',
                border: '1px solid #e7e5e4',
                fontSize: 11, fontWeight: 600, padding: '1px 7px', borderRadius: 12,
                minWidth: 20, textAlign: 'center',
              }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── PAINEL DA ABA PENDENTES ─────────────────────────────── */}
      {activeTab === "pending" && <div role="tabpanel" id="tabpanel-pending" aria-labelledby="tab-pending">

      {/* ─── FILTROS ─────────────────────────────────────────────── */}
      <section style={{
        marginBottom: 32, backgroundColor: '#f3f4f3',
        padding: 24, borderRadius: 12,
        border: '1px solid rgba(224,192,177,0.15)',
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
      }}>
        {/* Busca */}
        <div style={{ flex: '1 1 200px', minWidth: 180, position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#a8a29e' }} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ID, tipo ou descrição..."
            aria-label="Buscar por ID, tipo ou descrição"
            data-testid="input-search"
            style={{
              width: '100%', paddingLeft: 40, paddingRight: 16, paddingTop: 12, paddingBottom: 12,
              backgroundColor: '#ffffff', borderRadius: 8, border: 'none',
              fontSize: 15, fontWeight: 500, color: '#1c1917',
              boxSizing: 'border-box',
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              aria-label="Limpar busca"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#746e69' }}
            >
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={setEventFilter}
            options={eventFilterOptions}
          />

          <FilterSelect
            label="Tipo de Entrega" allLabel="Todos os tipos"
            values={itemTypeFilter} onValuesChange={setItemTypeFilter}
            options={typeFilterOptions} showAllLabelWhenEmpty
            searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
            testId="select-type-filter"
          />

          <FilterSelect
            label="Patrocinador" allLabel="Todos os Patrocinadores"
            values={sponsorFilter} onValuesChange={setSponsorFilter}
            options={sponsorFilterOptions} panelWidth={260}
            showAllLabelWhenEmpty
            searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
            testId="select-sponsor-filter"
          />

          {/* Atrasados — o recorte que o dono pediu.
              "Atrasado" aqui é medido contra o marco de APROVAÇÃO DE LAYOUT
              (deadlineAprovacaoLayout do evento, padrão −12 dias sobre a saída),
              que é o mesmo selo já exibido no cabeçalho de cada evento e no
              modal de revisão. NÃO é a saída do caminhão: ela é o prazo mais
              folgado do fluxo, semanas depois da data em que a decisão do
              patrocinador precisa existir — por ela quase nada apareceria como
              atrasado, que é justamente o alarme tarde demais.
              A contagem fica no controle: o recorte diz quantos são antes de
              ser clicado. Ver lib/atendimento-prazo. */}
          <button
            onClick={() => setAtrasadosFilter(v => !v)}
            aria-pressed={atrasadosFilter}
            data-testid="button-filter-atrasados"
            title="Só peças cujo evento já passou do prazo de Aprovação de Layout"
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              height: isMobile ? 44 : 36, padding: '0 12px',
              borderRadius: 7,
              backgroundColor: atrasadosFilter ? '#991b1b' : '#ffffff',
              border: atrasadosFilter ? '1.5px solid #991b1b' : '1px solid #e7e5e4',
              color: atrasadosFilter ? '#ffffff' : '#1c1917',
              fontSize: 13, fontWeight: atrasadosFilter ? 600 : 400,
              cursor: 'pointer', whiteSpace: 'nowrap',
              transition: 'background 0.15s, border 0.15s, color 0.15s',
            }}
          >
            <Clock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
            Atrasados
            <span
              data-testid="badge-atrasados-count"
              // Contrastes (texto ≤13px exige 4,5:1): #991b1b sobre #fef2f2 =
              // 7,60:1 ✓ · #57534e sobre #f5f5f4 = 6,99:1 ✓ · branco sobre o
              // véu claro do estado ativo (≈#af4d4d) = 5,24:1 ✓
              style={{
                padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                backgroundColor: atrasadosFilter ? 'rgba(255,255,255,0.22)' : atrasadosNaBase.length > 0 ? '#fef2f2' : '#f5f5f4',
                color: atrasadosFilter ? '#ffffff' : atrasadosNaBase.length > 0 ? '#991b1b' : '#57534e',
              }}
            >
              {atrasadosNaBase.length}
            </span>
          </button>

          {/* Limpar filtros */}
          {(searchTerm || eventFilter.length > 0 || itemTypeFilter.length > 0 || sponsorFilter.length > 0 || atrasadosFilter) && (
            <button
              onClick={() => { setSearchTerm(""); setEventFilter([]); setItemTypeFilter([]); setSponsorFilter([]); setAtrasadosFilter(false); }}
              aria-label="Limpar filtros"
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

          {/* Exportar PDF — desabilita enquanto os dados de aprovação carregam:
              o pool de exportação depende deles e sairia vazio/incompleto. */}
          <button
            onClick={() => setShowExportPDFModal(true)}
            disabled={loadingSponsors}
            data-testid="button-export-pdf"
            title={loadingSponsors ? "Aguarde: carregando os dados de aprovação das peças" : "Exportar peças em PDF"}
            style={{
              height: 46, padding: '0 16px', borderRadius: 8,
              backgroundColor: 'transparent', border: '1.5px solid #d4d0ca',
              color: '#746e69', cursor: loadingSponsors ? 'not-allowed' : 'pointer',
              opacity: loadingSponsors ? 0.5 : 1,
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 600, transition: 'all 0.15s',
              whiteSpace: 'nowrap', marginLeft: 'auto',
            }}
            onMouseEnter={e => { if (!loadingSponsors) { e.currentTarget.style.borderColor = '#a8a29e'; e.currentTarget.style.color = '#1c1917'; } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#d4d0ca'; e.currentTarget.style.color = '#746e69'; }}
          >
            <FileText style={{ width: 15, height: 15 }} />
            Exportar
          </button>
        </div>
      </section>

      {/* ─── PAINEL DE LOTE ───────────────────────────────── */}
      {/* Sem papel de decisão: o painel vira uma faixa informativa — os
          controles de lote não fariam nada além de devolver 403. */}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && !canDecide && (
        <section
          data-testid="section-batch-readonly"
          style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 12 }}
        >
          <Eye style={{ width: 16, height: 16, color: '#746e69', flexShrink: 0 }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: '#57534e', margin: 0 }}>
            Somente leitura — as decisões de aprovação são do Atendimento.
          </p>
        </section>
      )}
      {/* Colapsado por padrão: uma barra de 1 linha; expande no clique e a
          escolha persiste na sessão. */}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && !batchPanelOpen && (
        <button
          onClick={() => setBatchPanelOpen(true)}
          aria-expanded={false}
          data-testid="button-batch-panel-expand"
          style={{
            width: '100%', marginBottom: 32, display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 18px', backgroundColor: '#ffffff', border: '1px solid #e7e5e4',
            borderRadius: 12, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Zap style={{ width: 14, height: 14, color: '#ffffff' }} />
          </div>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', color: '#1c1917', whiteSpace: 'nowrap' }}>
            Aprovação em Lote
          </span>
          <span style={{ fontSize: 13, color: '#746e69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            — {batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com pendências' : 'patrocinadores com pendências'}
          </span>
          <ChevronRight style={{ width: 16, height: 16, color: '#a8a29e', marginLeft: 'auto', flexShrink: 0 }} />
        </button>
      )}
      {!loadingSponsors && batchEligibleSponsors.length > 0 && canDecide && batchPanelOpen && (
        <section
          data-testid="section-batch-sponsor"
          style={{ marginBottom: 32, backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 12 }}
        >
          {/* ── Header do painel — clique recolhe de volta para a barra ── */}
          <div
            role="button"
            tabIndex={0}
            aria-expanded={true}
            title="Recolher painel de lote"
            onClick={() => setBatchPanelOpen(false)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setBatchPanelOpen(false);
              }
            }}
            data-testid="button-batch-panel-collapse"
            style={{ background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', padding: isMobile ? '16px 16px' : '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderRadius: '12px 12px 0 0', flexWrap: isMobile ? 'wrap' : 'nowrap', cursor: 'pointer' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(249,115,22,0.35)' }}>
                <Zap style={{ width: 18, height: 18, color: '#ffffff' }} />
              </div>
              <div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: '-0.02em', margin: 0, color: '#ffffff' }}>
                  Aprovação em Lote
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, margin: 0 }}>
                  {batchEligibleSponsors.length} {batchEligibleSponsors.length === 1 ? 'patrocinador com' : 'patrocinadores com'} itens pendentes
                </p>
              </div>
            </div>
            {/* Indicador de progresso */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { n: 1, label: 'Patrocinador', done: !!batchSponsorId },
                { n: 2, label: 'Evento', done: !!batchEventId },
                { n: 3, label: 'Revisão', done: batchItemCount > 0 && !!batchEventId },
              ].map((step, idx) => {
                const active = idx === 0 ? !batchSponsorId : idx === 1 ? !!batchSponsorId && !batchEventId : !!batchSponsorId && !!batchEventId;
                return (
                  <Fragment key={step.n}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: step.done ? '#22c55e' : active ? '#f97316' : 'rgba(255,255,255,0.15)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: step.done || active ? '#fff' : 'rgba(255,255,255,0.5)',
                        flexShrink: 0, transition: 'background 0.2s',
                      }}>
                        {step.done ? <Check style={{ width: 11, height: 11 }} /> : step.n}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: step.done ? 'rgba(255,255,255,0.75)' : active ? '#fff' : 'rgba(255,255,255,0.55)' }}>
                        {step.label}
                      </span>
                    </div>
                    {idx < 2 && <div style={{ width: 20, height: 1, background: step.done ? '#22c55e' : 'rgba(255,255,255,0.15)' }} />}
                  </Fragment>
                );
              })}
              <ChevronDown style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.6)', marginLeft: 10, flexShrink: 0 }} />
            </div>
          </div>

          <div style={{ padding: isMobile ? '16px 14px' : '20px 28px', background: '#fafaf9' }}>
            {/* ── Seletores: Patrocinador + Evento — usando FilterSelect idêntico aos filtros do topo ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
              <FilterSelect
                label="Patrocinador"
                allLabel="Patrocinador..."
                value={batchSponsorId || "all"}
                onChange={v => {
                  const next = v === "all" ? "" : v;
                  setBatchSponsorId(next);
                  setBatchEventId("");
                  setBatchShowRejectForm(false);
                  setBatchRejectReason("");
                }}
                options={[...batchEligibleSponsors]
                  .sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR'))
                  .map((s: any) => ({ value: s.id, label: s.name, dotColor: s.color || '#a8a29e' }))}
                searchPlaceholder="Buscar patrocinador..."
                emptyText="Nenhum patrocinador encontrado."
                hideWhenEmpty={false}
                showAllLabelWhenEmpty
                testId="select-batch-sponsor"
                panelWidth={280}
                hideClear
              />
              <FilterSelect
                label="Evento"
                allLabel={batchSponsorId
                  ? (batchEligibleEvents.length > 0 ? `${batchEligibleEvents.length} evento${batchEligibleEvents.length !== 1 ? 's' : ''} disponível${batchEligibleEvents.length !== 1 ? 'is' : ''}` : 'Nenhum evento')
                  : 'Selecione o patrocinador antes'}
                value={batchEventId || "all"}
                onChange={v => {
                  const next = v === "all" ? "" : v;
                  setBatchEventId(next);
                  setBatchShowRejectForm(false);
                  setBatchRejectReason("");
                }}
                options={batchEligibleEvents.map((ev: any) => ({ value: ev.id, label: ev.name }))}
                searchPlaceholder="Buscar evento..."
                emptyText="Nenhum evento encontrado."
                hideWhenEmpty={false}
                showAllLabelWhenEmpty
                disabled={!batchSponsorId}
                testId="select-batch-event"
                panelWidth={300}
                hideClear
              />
            </div>

            {/* ── Área de itens ── */}
            {batchSponsorId && batchEventId ? (
              batchItemCount === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '36px 0', gap: 10, backgroundColor: '#f9f9f8', borderRadius: 12, border: '1px dashed #e7e5e4' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle style={{ width: 22, height: 22, color: '#16a34a' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', margin: '0 0 4px' }}>Tudo aprovado</p>
                    <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>Nenhuma peça pendente para esta combinação</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Barra de seleção + contadores */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '10px 14px', backgroundColor: '#fafaf9', borderRadius: 8, border: '1px solid #f0ede8' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700, color: '#1c1917', cursor: 'pointer', userSelect: 'none' }}>
                      <input
                        type="checkbox"
                        checked={batchSelectedItemIds.size === batchItemCount && batchItemCount > 0}
                        onChange={e => {
                          if (e.target.checked) setBatchSelectedItemIds(new Set(batchEligibleItems.map((i: any) => i.id)));
                          else setBatchSelectedItemIds(new Set());
                        }}
                        style={{ accentColor: '#ea580c', width: 15, height: 15, cursor: 'pointer' }}
                      />
                      Selecionar todos
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      {batchEligibleItems.filter((i: any) => !i.approvalThumbUrl).length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#b45309', fontWeight: 600, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px' }}>
                          <AlertCircle style={{ width: 11, height: 11 }} />
                          {batchEligibleItems.filter((i: any) => !i.approvalThumbUrl).length} sem arte
                        </span>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 700, color: batchSelectedItemIds.size > 0 ? '#ea580c' : '#746e69' }}>
                        {batchSelectedItemIds.size} / {batchItemCount} selecionadas
                      </span>
                    </div>
                  </div>

                  {/* Lista de itens */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 340, overflowY: 'auto', paddingRight: 2 }}>
                    {batchEligibleItems.map((item: any) => {
                      const isChecked = batchSelectedItemIds.has(item.id);
                      const hasThumb = !!item.approvalThumbUrl;
                      return (
                        <div
                          key={item.id}
                          data-testid={`batch-item-row-${item.id}`}
                          onClick={() => setBatchSelectedItemIds(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id);
                            else next.add(item.id);
                            return next;
                          })}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 12,
                            padding: '10px 14px',
                            backgroundColor: isChecked ? '#fff7ed' : '#ffffff',
                            border: `1.5px solid ${isChecked ? '#fb923c' : '#f0ede8'}`,
                            borderRadius: 12, cursor: 'pointer',
                            transition: 'border-color 0.12s, background-color 0.12s',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            data-testid={`checkbox-batch-item-${item.id}`}
                            // O clique no checkbox NÃO pode subir para o card: o card
                            // também alterna, e os dois toggles se anulavam — por isso
                            // clicar na caixinha parecia não desmarcar.
                            onClick={e => e.stopPropagation()}
                            onChange={() => setBatchSelectedItemIds(prev => {
                              const next = new Set(prev);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                            })}
                            style={{ accentColor: '#ea580c', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 }}
                          />
                          {/* Thumbnail — clique abre a arte em tamanho grande */}
                          <div
                            onClick={e => { if (hasThumb) { e.stopPropagation(); setBatchPreviewItem(item); } }}
                            data-testid={`batch-thumb-${item.id}`}
                            title={hasThumb ? 'Clique para ver a arte' : 'Sem arte enviada'}
                            className={hasThumb ? 'group' : undefined}
                            style={{ width: 52, height: 52, borderRadius: 8, backgroundColor: hasThumb ? '#f0ede8' : '#f4f4f3', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${hasThumb ? 'rgba(0,0,0,0.06)' : '#e7e5e4'}`, position: 'relative', cursor: hasThumb ? 'zoom-in' : 'default' }}
                          >
                            {hasThumb ? (
                              <>
                                <img
                                  src={item.approvalThumbUrl}
                                  alt=""
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                    if (fb?.dataset.fallback) fb.style.display = 'flex';
                                  }}
                                />
                                <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: '#f4f4f3', flexDirection: 'column', gap: 2 }}>
                                  <Package style={{ width: 16, height: 16, color: '#c4bfbb' }} />
                                  <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, letterSpacing: '0.03em' }}>SEM ARTE</span>
                                </div>
                                <span
                                  style={{ position: 'absolute', inset: 0, background: 'rgba(28,25,23,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.12s' }}
                                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0'}
                                >
                                  <Eye style={{ width: 16, height: 16, color: '#fff' }} />
                                </span>
                              </>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <Package style={{ width: 18, height: 18, color: '#c4bfbb' }} />
                                <span style={{ fontSize: 11, color: '#746e69', fontWeight: 600, letterSpacing: '0.03em' }}>SEM ARTE</span>
                              </div>
                            )}
                          </div>
                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 700, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '1px 6px', flexShrink: 0 }}>
                                {item.displayId}
                              </span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.type}
                              </span>
                            </div>
                            {item.description && (
                              <p style={{ fontSize: 11, color: '#746e69', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.description}
                              </p>
                            )}
                          </div>
                          {/* Status thumb */}
                          <div style={{ flexShrink: 0 }}>
                            {hasThumb
                              ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#15803d', fontWeight: 700, background: '#dcfce7', border: '1px solid #bbf7d0', borderRadius: 999, padding: '2px 8px' }}>
                                  <CheckCircle style={{ width: 10, height: 10 }} /> Arte OK
                                </span>
                              : <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#92400e', fontWeight: 700, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
                                  <AlertCircle style={{ width: 11, height: 11 }} /> Sem arte
                                </span>
                            }
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Ações ── */}
                  {!batchShowRejectForm ? (
                    <div style={{ display: 'flex', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', padding: '14px 16px', background: '#fafaf9', borderRadius: 12, border: '1px solid #f0ede8', gap: isMobile ? 10 : 0 }}>
                      <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>
                        {batchSelectedItemIds.size > 0
                          ? <><strong style={{ color: '#1c1917' }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</strong> prontas para decisão</>
                          : 'Selecione peças para aprovar ou recusar'}
                      </p>
                      <div style={{ display: 'flex', gap: 10, flexDirection: isMobile ? 'column' : 'row' }}>
                        <button
                          onClick={() => setBatchShowRejectForm(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-reject"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            backgroundColor: '#ffffff', color: '#dc2626',
                            border: '1.5px solid #fca5a5', borderRadius: 8,
                            padding: '10px 18px', fontSize: 13, fontWeight: 700,
                            cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                            opacity: batchSelectedItemIds.size === 0 ? 0.4 : 1,
                            transition: 'filter 0.15s',
                            minHeight: isMobile ? 44 : undefined,
                          }}
                          onMouseEnter={e => { if (batchSelectedItemIds.size > 0) e.currentTarget.style.filter = 'brightness(0.96)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                        >
                          <XCircle style={{ width: 15, height: 15 }} />
                          Recusar
                        </button>
                        <button
                          onClick={() => setConfirmApproveBatch(true)}
                          disabled={batchSponsorMutation.isPending || batchSelectedItemIds.size === 0 || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-approve"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            background: batchSelectedItemIds.size === 0 ? '#f5f5f4' : 'linear-gradient(135deg, #15803d, #166534)',
                            // O branco era fixo: sobre o fundo do estado
                            // desabilitado o rótulo simplesmente sumia.
                            color: batchSelectedItemIds.size === 0 ? '#57534e' : '#ffffff',
                            border: 'none', borderRadius: 8,
                            padding: '10px 22px', fontSize: 13, fontWeight: 800,
                            cursor: batchSelectedItemIds.size === 0 ? 'not-allowed' : 'pointer',
                            boxShadow: batchSelectedItemIds.size > 0 ? '0 4px 12px rgba(34,197,94,0.35)' : 'none',
                            letterSpacing: '-0.01em', fontFamily: "'Space Grotesk', sans-serif",
                            transition: 'filter 0.15s, box-shadow 0.15s',
                            minHeight: isMobile ? 44 : undefined,
                          }}
                          onMouseEnter={e => { if (batchSelectedItemIds.size > 0) e.currentTarget.style.filter = 'brightness(0.9)'; }}
                          onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                        >
                          {batchSponsorMutation.isPending
                            ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                            : <CheckCircle style={{ width: 14, height: 14 }} />}
                          Aprovar {batchSelectedItemIds.size > 0 ? `${batchSelectedItemIds.size} ${batchSelectedItemIds.size === 1 ? 'Peça' : 'Peças'}` : ''}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ backgroundColor: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 12, padding: '18px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <XCircle style={{ width: 16, height: 16, color: '#dc2626' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', margin: 0 }}>Recusar {batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'peça' : 'peças'}</p>
                          <p style={{ fontSize: 11, color: '#b91c1c', margin: 0 }}>O motivo será registrado no histórico e comunicado à Arte</p>
                        </div>
                      </div>
                      <textarea
                        value={batchRejectReason}
                        onChange={e => setBatchRejectReason(e.target.value)}
                        placeholder="Descreva o motivo da recusa para a equipe de Arte..."
                        data-testid="textarea-batch-reject-reason"
                        rows={3}
                        style={{
                          width: '100%', backgroundColor: '#ffffff',
                          border: `1.5px solid ${batchRejectReason.trim() === "" ? '#fca5a5' : '#e7e5e4'}`,
                          color: '#1c1917', borderRadius: 8, padding: '10px 12px',
                          fontSize: 13, resize: 'vertical',
                          boxSizing: 'border-box', lineHeight: 1.5,
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => { setBatchShowRejectForm(false); setBatchRejectReason(""); }}
                          style={{ backgroundColor: '#ffffff', color: '#746e69', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "reject", reason: batchRejectReason })}
                          disabled={batchSponsorMutation.isPending || batchRejectReason.trim() === "" || !canDecide}
                          title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                          data-testid="button-batch-confirm-reject"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            backgroundColor: batchRejectReason.trim() === "" ? '#e7e5e4' : '#dc2626',
                            color: '#ffffff', border: 'none', borderRadius: 8,
                            padding: '9px 20px', fontSize: 13, fontWeight: 800,
                            cursor: batchRejectReason.trim() === "" ? 'not-allowed' : 'pointer',
                            fontFamily: "'Space Grotesk', sans-serif",
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
              /* Estado vazio — orientação de uso */
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '20px 24px', backgroundColor: '#fff7ed', borderRadius: 12, border: '1px solid #fed7aa' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #f97316, #ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(249,115,22,0.25)' }}>
                  <Zap style={{ width: 22, height: 22, color: '#ffffff' }} />
                </div>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: '#9a3412', margin: '0 0 3px' }}>
                    {batchSponsorId ? 'Selecione o evento' : 'Selecione o patrocinador'}
                  </p>
                  <p style={{ fontSize: 13, color: '#c2410c', margin: 0, lineHeight: 1.5, opacity: 0.8 }}>
                    {batchSponsorId
                      ? `${batchEligibleEvents.length} evento${batchEligibleEvents.length !== 1 ? 's' : ''} com peças pendentes para o patrocinador selecionado.`
                      : `${batchEligibleSponsors.length} patrocinador${batchEligibleSponsors.length !== 1 ? 'es' : ''} aguardam decisão — escolha um para iniciar o lote.`}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Peça de evento finalizado — encerrado à mão OU já realizado — não entra
          nesta fila (ver `awaitingItems`). Esconder em silêncio faria a tela
          dizer "nada a fazer" para quem, na verdade, teve o trabalho retirado. */}
      {avisoOcultas && (
        <div
          role="status"
          data-testid="aviso-eventos-encerrados"
          style={{ background: '#f5f5f4', border: '1px solid #e7e5e4', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#44403c', lineHeight: 1.5 }}
        >
          <strong>{avisoOcultas.destaque}</strong>{' '}{avisoOcultas.texto}
        </div>
      )}

      {/* ─── GRID DE CARDS (bento-style) ─────────────────────────── */}
      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '64px 0' }} data-testid="empty-atendimento">
          <CheckCircle style={{ width: 48, height: 48, color: '#86efac', margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1c1917', margin: '0 0 8px' }}>
            {/* Vazio por causa do recorte de atrasados tem texto próprio: com o
                filtro ligado, "Nenhum item pendente" leria como "nada a fazer"
                enquanto a fila inteira continua ali, dentro do prazo. */}
            {atrasadosFilter
              ? "Nada atrasado neste recorte"
              : pendingItems.length === 0 ? "Nenhum item pendente" : "Nenhum resultado encontrado"}
          </h3>
          <p style={{ color: '#746e69', fontSize: 15, maxWidth: 520, margin: '0 auto' }} data-testid="empty-atendimento-motivo">
            {atrasadosFilter
              ? `A lista está vazia pelo FILTRO "Atrasados" — ${filteredItemsBase.length === 0 ? 'os demais filtros já não devolvem nenhuma peça' : `as ${filteredItemsBase.length} peças deste recorte estão todas dentro do prazo de Aprovação de Layout`}.`
              : pendingItems.length === 0
              ? "Não há itens aguardando aprovação do patrocinador no momento."
              : "Tente ajustar os filtros para ver mais resultados."}
          </p>
          {atrasadosFilter && (
            <button
              onClick={() => setAtrasadosFilter(false)}
              data-testid="button-clear-atrasados-empty"
              style={{ marginTop: 16, height: 40, padding: '0 18px', borderRadius: 8, border: 'none', background: '#0c0a09', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              Mostrar todas as peças
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* Grupo: Pendentes */}
          {pendingGroup.length > 0 && Array.from(itemsByEvent.entries()).map(([eventId, eventItems]) => {
            const ev = getEventInfo(eventId);
            return (
              <div key={eventId}>
                {/* Group Header — recolhe/expande o evento.
                    Era só onClick num <div>: recolher grupo, que é o principal
                    recurso de navegação desta tela, existia apenas para quem
                    usa mouse. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-expanded={!collapsedEvents.has(eventId)}
                  onClick={() => toggleEventCollapsed(eventId)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleEventCollapsed(eventId);
                    }
                  }}
                  data-testid={`toggle-event-${eventId}`}
                  title={collapsedEvents.has(eventId) ? 'Expandir evento' : 'Recolher evento'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    paddingBottom: 16, marginBottom: 16,
                    borderBottom: '1px solid #e7e5e4',
                    cursor: 'pointer', userSelect: 'none',
                  }}
                >
                  <ChevronDown
                    style={{
                      width: 16, height: 16, color: '#a8a29e', flexShrink: 0,
                      transform: collapsedEvents.has(eventId) ? 'rotate(-90deg)' : 'none',
                      transition: 'transform 0.15s',
                    }}
                  />
                  <div
                    title="Evento com itens aguardando aprovação"
                    style={{
                      width: 8, height: 8, borderRadius: '50%',
                      backgroundColor: '#f97316', flexShrink: 0,
                    }} />
                  <h4 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em',
                    color: '#1c1917', margin: 0,
                  }}>
                    {ev?.name || 'Sem Evento'}
                    {ev?.startDate && (
                      <span style={{ color: '#746e69', fontWeight: 500, marginLeft: 12, fontSize: 15 }}>
                        {format(parseDateLocal(ev.startDate), "MMMM yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </h4>
                  {(() => {
                    // Marco de Aprovação de Layout — regra única em
                    // lib/atendimento-prazo, a mesma do filtro "Atrasados" e do
                    // cabeçalho do modal. `hoje` é a âncora estável da tela.
                    const p = prazoAprovacaoLayout(ev, hoje);
                    if (!p) return null;
                    const diff = p.diff;
                    const ds = p.dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                    const s = diff < 0
                      ? { bg: '#FEE2E2', border: '#FECACA', text: '#B84040' }
                      : diff === 0
                      ? { bg: '#FEF3E7', border: '#FED7AA', text: '#D97A1E' }
                      : diff <= 3
                      ? { bg: '#FDF0E8', border: '#FDDBC4', text: '#C97B4B' }
                      : { bg: '#F3F2F0', border: '#E7E3DC', text: '#6F6A63' };
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.text, whiteSpace: 'nowrap' }}>
                        Aprovação de Layout · {ds}{diff >= 0 && diff <= 14 && <span title={`Prazo em ${diff} ${diff === 1 ? 'dia' : 'dias'}`} style={{ opacity: 0.7, fontWeight: 500 }}> ({diff}d)</span>}
                      </span>
                    );
                  })()}
                  <span style={{
                    marginLeft: 'auto',
                    backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4',
                    color: '#746e69', borderRadius: 999,
                    fontSize: 11, fontWeight: 600, padding: '3px 10px',
                  }}>
                    {eventItems.length} {eventItems.length === 1 ? 'peça' : 'peças'}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: collapsedEvents.has(eventId) ? 'none' : 'flex', flexDirection: 'column', gap: 12 }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 4px', marginTop: 4 }}>
                            <div style={{ width: 3, height: 16, borderRadius: 999, background: '#f97316', flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{itemGroupName}</span>
                            <div style={{ flex: 1, height: 1, background: '#f0ede8' }} />
                          </div>
                        )}
                        {showTypeHeader && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 2px' }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Tipo:</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{item.type}</span>
                            <div style={{ flex: 1, height: 1, background: '#f0ede8' }} />
                          </div>
                        )}
                      <div
                        key={`card-${item.id}`}
                        data-testid={`row-item-${item.id}`}
                        className="group"
                        style={{
                          backgroundColor: '#ffffff', borderRadius: 12,
                          boxShadow: `0 1px 3px rgba(0,0,0,0.06), inset 4px 0 0 ${isFullyApproved ? '#d6d3d1' : hasArteBlock ? '#746e69' : '#f97316'}`,
                          overflow: 'hidden',
                          opacity: isFullyApproved ? 0.75 : 1,
                          transition: 'box-shadow 0.2s',
                        }}
                        onMouseEnter={e => { if (!isFullyApproved) (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px rgba(0,0,0,0.1), inset 4px 0 0 ${hasArteBlock ? '#746e69' : '#f97316'}`; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 1px 3px rgba(0,0,0,0.06), inset 4px 0 0 ${isFullyApproved ? '#d6d3d1' : hasArteBlock ? '#746e69' : '#f97316'}`; }}
                      >
                        <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', padding: isMobile ? 14 : 20, gap: isMobile ? 12 : 24, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>

                          {/* Thumbnail */}
                          <div style={{
                            width: isMobile ? 52 : 80, height: isMobile ? 52 : 80, flexShrink: 0, borderRadius: 12,
                            overflow: 'hidden', backgroundColor: '#f5f5f4', position: 'relative',
                            border: '1px solid #ede9e4',
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
                                  onError={(e) => {
                                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                    if (fb?.dataset.fallback) fb.style.display = 'flex';
                                  }}
                                />
                                <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: '#f5f5f4' }}>
                                  <FileText style={{ width: 24, height: 24, color: '#a8a29e' }} />
                                </div>
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
                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr auto', gap: isMobile ? 10 : 16, alignItems: isMobile ? 'stretch' : 'center', minWidth: 0 }}>

                            {/* Col 1: Título e ID */}
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <h5 style={{ fontSize: 15, fontWeight: 700, color: isFullyApproved ? '#746e69' : '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {item.type}
                                </h5>
                                {item.isReuse && (
                                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', backgroundColor: '#dcfce7', color: '#166534', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>
                                    Reaproveit.
                                  </span>
                                )}
                              </div>
                              <p style={{ fontSize: 11, fontWeight: 600, color: '#746e69', textTransform: 'uppercase', margin: '3px 0 0', letterSpacing: '0.04em' }}>
                                {item.displayId}{item.description ? ` • ${item.description}` : ''}
                              </p>
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Ver referência visual do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 7px', marginTop: 4 }} data-testid={`link-reference-atendimento-${item.id}`}>
                                  <Paperclip style={{ width: 10, height: 10 }} />
                                  Ref. visual
                                </a>
                              )}
                            </div>

                            {/* Col 2: Patrocinadores */}
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              {loadingSponsors ? (
                                <span style={{ fontSize: 13, color: '#746e69' }}>...</span>
                              ) : (
                                <SponsorChips sponsors={sponsorsWithStatus(item)} variant="colored" size="sm" max={2} />
                              )}
                            </div>

                            {/* Col 3: Status Badge */}
                            <div>
                              {isFullyApproved ? (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '4px 10px', borderRadius: 6,
                                  backgroundColor: '#f5f5f4', color: '#57534e',
                                  fontSize: 11, fontWeight: 700,
                                }}>
                                  <CheckCircle style={{ width: 12, height: 12 }} />
                                  APROVADO
                                </span>
                              ) : hasArteBlock ? (
                                <span
                                  title="A arte está em correção — você será notificado quando a nova versão estiver pronta"
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                    padding: '4px 10px', borderRadius: 6,
                                    backgroundColor: '#f5f5f4', color: '#57534e',
                                    fontSize: 11, fontWeight: 700,
                                  }}>
                                  <RotateCcw style={{ width: 12, height: 12 }} />
                                  NOVA VERSÃO
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6,
                                  padding: '5px 10px', borderRadius: 6,
                                  backgroundColor: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c',
                                  fontSize: 11, fontWeight: 700,
                                }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#f97316', flexShrink: 0, animation: 'pulse 2s infinite' }} />
                                  Ag. Revisão
                                </span>
                              )}
                            </div>

                            {/* Col 4: Botão de ação */}
                            <div style={{ display: 'flex', justifyContent: isMobile ? 'stretch' : 'flex-end' }}>
                              {isFullyApproved ? (
                                <button
                                  onClick={() => handleViewDetails(item)}
                                  data-testid={`button-history-${item.id}`}
                                  style={{
                                    padding: '8px 20px', borderRadius: 8,
                                    backgroundColor: '#f5f5f4', border: 'none', color: '#57534e',
                                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                                    transition: 'background-color 0.15s',
                                    minHeight: isMobile ? 44 : undefined,
                                    width: isMobile ? '100%' : undefined,
                                    justifyContent: isMobile ? 'center' : undefined,
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e7e5e4'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; }}
                                >
                                  <Eye style={{ width: 12, height: 12 }} />
                                  Histórico
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleViewDetails(item)}
                                  data-testid={`button-view-${item.id}`}
                                  style={{
                                    padding: '8px 20px', borderRadius: 8,
                                    backgroundColor: '#f5f5f4', color: '#1c1917',
                                    border: '1px solid transparent', cursor: 'pointer',
                                    fontSize: 11, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    transition: 'all 0.2s',
                                    minHeight: isMobile ? 44 : undefined,
                                    width: isMobile ? '100%' : undefined,
                                    justifyContent: isMobile ? 'center' : undefined,
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f97316'; e.currentTarget.style.color = '#ffffff'; e.currentTarget.style.border = '1px solid #f97316'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.color = '#1c1917'; e.currentTarget.style.border = '1px solid transparent'; }}
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

          {pendingGroup.length > pendVisible && (
            <button
              onClick={() => setPendVisible(v => v + PAGE_SIZE)}
              data-testid="button-load-more-pending"
              style={{ marginTop: 4, marginBottom: 8, padding: '12px 0', width: '100%', borderRadius: 12, border: '1px solid #e7e5e4', background: '#ffffff', color: '#c2410c', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
            >
              Carregar mais ({pendingGroup.length - pendVisible} restantes)
            </button>
          )}

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
                    return (
                      <div
                        key={item.id}
                        data-testid={`row-approved-item-${item.id}`}
                        style={{
                          backgroundColor: '#ffffff', borderRadius: 12,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.04), inset 4px 0 0 #d6d3d1',
                          overflow: 'hidden', opacity: 0.7,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', gap: 20 }}>
                          <div style={{ width: 48, height: 48, flexShrink: 0, borderRadius: 6, backgroundColor: '#f5f5f4', overflow: 'hidden', filter: 'grayscale(1)', position: 'relative' }}>
                            {item.approvalThumbUrl
                              ? <>
                                  <img
                                    src={item.approvalThumbUrl}
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                      const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                      if (fb?.dataset.fallback) fb.style.display = 'flex';
                                    }}
                                  />
                                  <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: '#f5f5f4' }}>
                                    <FileText style={{ width: 18, height: 18, color: '#a8a29e' }} />
                                  </div>
                                </>
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText style={{ width: 18, height: 18, color: '#a8a29e' }} /></div>}
                          </div>
                          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 12, alignItems: 'center', minWidth: 0 }}>
                            <div>
                              <h5 style={{ fontSize: 13, fontWeight: 600, color: '#746e69', margin: 0 }}>{item.type}</h5>
                              <p style={{ fontSize: 11, color: '#746e69', margin: '2px 0 0' }}>{item.displayId}</p>
                            </div>
                            {/* Mesma linguagem dos cards pendentes: chips já com o
                                status de cada patrocinador (todos aprovados aqui). */}
                            <SponsorChips sponsors={sponsorsWithStatus(item)} variant="colored" size="sm" />
                            <span data-testid={`badge-aprovado-${item.id}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: 11, fontWeight: 700, color: '#15803d',
                              backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                              padding: '3px 10px', borderRadius: 6,
                            }}>
                              <CheckCircle style={{ width: 11, height: 11 }} /> APROVADO
                            </span>
                            <span />
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
      </div>}

      {/* ─── ABA HISTÓRICO ──────────────────────────────────────── */}
      {activeTab === "history" && (() => {
        const evById = new Map((events as any[]).map((e: any) => [e.id, e]));
        const FL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 };
        const SEL = (active: boolean): React.CSSProperties => ({
          height: 38, border: `1.5px solid ${active ? '#c2610c' : '#e7e5e4'}`,
          borderRadius: 8, fontSize: 13, fontWeight: 500, background: '#fff',
          color: active ? '#c2610c' : '#374151', cursor: 'pointer',
        });
        const periodOptions = [
          { value: '7d',  label: 'Últimos 7 dias' },
          { value: '30d', label: 'Últimos 30 dias' },
          { value: '90d', label: 'Últimos 90 dias' },
        ];
        const histSponsorOptions = (sponsors as any[]).map((s: any) => ({ value: s.id, label: s.name }));
        const histEventOptions = (() => {
          const P: Record<string,number> = { urgente:0, alta:1, media:2, baixa:3 };
          const C: Record<string,string> = { urgente:'#ef4444', alta:'#f97316', media:'#eab308', baixa:'#3b82f6' };
          return [...(events as any[])].sort((a,b) => { const pa=P[a.priority]??4,pb=P[b.priority]??4; return pa!==pb?pa-pb:a.name.localeCompare(b.name,'pt-BR'); }).map((e: any) => ({ value: e.id, label: e.name, dotColor: C[e.priority] }));
        })();
        const hasHistFilters = histEventFilter.length > 0 || histSponsorFilter.length > 0 || histPeriodFilter !== "all";

        return (
          <div role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">
            {/* ── Barra de filtros ── */}
            <div style={{
              background: '#fafaf9', borderRadius: 12,
              border: '1px solid #ece9e6',
              padding: '12px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            }}>
              {/* Busca */}
              <div style={{ flex: '1 1 180px', minWidth: 160, position: 'relative' }}>
                <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#a8a29e' }} />
                <input
                  value={histSearchTerm}
                  onChange={e => setHistSearchTerm(e.target.value)}
                  placeholder="ID, tipo ou descrição..."
                  aria-label="Buscar no histórico por ID, tipo ou descrição"
                  style={{
                    width: '100%', paddingLeft: 36, paddingRight: histSearchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9,
                    backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #e7e5e4',
                    fontSize: 13, fontWeight: 500, color: '#1c1917',
                    boxSizing: 'border-box',
                  }}
                />
                {histSearchTerm && (
                  <button onClick={() => setHistSearchTerm("")} aria-label="Limpar busca" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#746e69' }}>
                    <X style={{ width: 13, height: 13 }} />
                  </button>
                )}
              </div>
              <div style={{ width: 1, height: 24, background: '#e7e5e4', flexShrink: 0 }} />
              <EventFilterDropdown values={histEventFilter} onValuesChange={setHistEventFilter} options={histEventOptions} />
              <FilterSelect showAllLabelWhenEmpty label="Patrocinador" allLabel="Todos os patrocinadores"
                values={histSponsorFilter} onValuesChange={setHistSponsorFilter}
                options={histSponsorOptions} />
              <FilterSelect showAllLabelWhenEmpty label="Período" allLabel="Todos os períodos"
                value={histPeriodFilter} onChange={setHistPeriodFilter}
                options={periodOptions} />
              {(hasHistFilters || histSearchTerm) && (
                <button
                  onClick={() => { setHistEventFilter([]); setHistSponsorFilter([]); setHistPeriodFilter("all"); setHistSearchTerm(""); }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    height: 36, padding: '0 12px',
                    backgroundColor: '#0c0a09', color: '#fff',
                    border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  }}
                >
                  <X style={{ width: 13, height: 13 }} /> Limpar filtros
                </button>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingSponsors
                  ? <Loader2 style={{ width: 14, height: 14, color: '#a8a29e' }} className="animate-spin" />
                  : <span style={{ fontSize: 13, color: '#746e69', fontWeight: 600 }}>
                      {historyItems.length} {historyItems.length === 1 ? 'resultado' : 'resultados'}
                    </span>}
              </div>
            </div>

            {/* ── Lista ── */}
            {loadingSponsors ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
                <Loader2 style={{ width: 32, height: 32, color: '#a8a29e' }} className="animate-spin" />
              </div>
            ) : historyItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '64px 0' }}>
                <CheckCircle style={{ width: 48, height: 48, color: '#86efac', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, color: '#1c1917', margin: '0 0 8px' }}>Nenhuma peça encontrada</h3>
                <p style={{ color: '#746e69', fontSize: 15 }}>
                  {hasHistFilters ? 'Tente ajustar os filtros.' : 'Ainda não há peças aprovadas pelo patrocinador.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {historyItems.slice(0, histVisible).map((item: any) => {
                  const ev = evById.get(item.eventId);
                  const itemSps: any[] = itemSponsorsMap[item.id] || [];
                  const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
                  // Badge de status pela lib canônica: mesmo rótulo e cores das
                  // outras telas (status desconhecido cai no fallback neutro).
                  const statusCfg = getStatusMeta(item.status);

                  const sponsorApprovals = itemSps.map(sp => {
                    const appr = approvals.find(a => a.sponsorId === sp.id);
                    return { sponsor: sp, appr };
                  });
                  // ordenar: aprovados → nova versão → reprovados → aguardando
                  const sortedApprovals = [...sponsorApprovals].sort((a, b) => {
                    const order = (s?: string) => s === 'approved' ? 0 : s === 'new_version_pending' ? 1 : s === 'rejected' ? 2 : 3;
                    return order(a.appr?.status) - order(b.appr?.status);
                  });
                  const approvedOnes = sponsorApprovals.filter(x => x.appr?.status === 'approved');
                  const allApproved  = approvedOnes.length === sponsorApprovals.length && sponsorApprovals.length > 0;

                  const fmtDt = (d: string | Date | null | undefined, short = false) => {
                    if (!d) return null;
                    return format(new Date(d), short ? "dd/MM" : "dd/MM/yy 'às' HH:mm", { locale: ptBR });
                  };
                  // Mesmo cálculo do sort da lista (Math.max sobre timestamps):
                  // o sort de string anterior quebrava com formatos mistos de data.
                  const approvedTimes = approvedOnes
                    .map(x => (x.appr?.approvedAt ? new Date(x.appr.approvedAt).getTime() : 0))
                    .filter(t => t > 0);
                  const lastApprovedAt = approvedTimes.length ? new Date(Math.max(...approvedTimes)) : null;
                  const lastApprovedBy = approvedOnes.length > 0
                    ? [...approvedOnes].sort((a, b) => {
                        const ta = a.appr?.approvedAt ? new Date(a.appr.approvedAt).getTime() : 0;
                        const tb = b.appr?.approvedAt ? new Date(b.appr.approvedAt).getTime() : 0;
                        return tb - ta; // devolve 0 em empate (comparador válido)
                      })[0]?.appr?.approvedBy : null;

                  // acento lateral por status
                  const accentColor = allApproved ? '#22c55e'
                    : item.status === 'inProduction' || item.status === 'produced' ? '#7c3aed'
                    : item.status === 'ready_for_production' ? '#2563eb'
                    : '#e5e7eb';

                  // Pipeline de fluxo (10 etapas) — const de módulo PIPELINE_STAGES
                  const pipelineIdx = PIPELINE_STAGES.findIndex(s => s.statuses.includes(item.status));
                  const currentPipelineIdx = pipelineIdx === -1 ? 0 : pipelineIdx;

                  // O FIM DA HISTÓRIA — o marco que o dono pediu (14/08): a
                  // trilha ia de "Criado" a "Todos aprovaram" e parava, sem
                  // dizer que a peça saiu das filas porque o EVENTO acabou.
                  // Fonte única em lib/status: mesma regra das filas, mesmas
                  // palavras. `ev` vem enriquecido de /api/events; o fallback
                  // `item.event` é o evento cru de /api/items, que já traz as
                  // duas colunas que o predicado lê (status e startDate).
                  //
                  // É o ÚNICO lugar do cartão que fala disso de propósito: o
                  // cabeçalho já está cheio (status, contagem, patrocinadores)
                  // e a informação é de FIM, então o fim da trilha é onde ela
                  // é lida sem competir com nada.
                  const marcoEvento = marcoEventoFinalizado(ev ?? item.event, hojeBusinessMs);

                  const timelineMilestones = [
                    item.createdAt && { dot: '#93c5fd', label: 'Criado', date: fmtDt(item.createdAt) },
                    !item.sponsorApprovedAt && lastApprovedAt && { dot: '#4ade80', label: `Últ. aprovação`, sublabel: `${approvedOnes.length} de ${sponsorApprovals.length}`, date: fmtDt(lastApprovedAt), by: lastApprovedBy },
                    item.sponsorApprovedAt && { dot: '#22c55e', label: 'Todos aprovaram', date: fmtDt(item.sponsorApprovedAt) },
                    item.approvedAt && { dot: '#a78bfa', label: 'Liberado p/ produção', date: fmtDt(item.approvedAt) },
                    marcoEvento && {
                      dot: marcoEvento.dot,
                      label: marcoEvento.label,
                      // Data SÓ no "realizado", onde ela é o próprio fato (a
                      // data do evento). O encerramento manual não tem carimbo
                      // que viaje com a peça — a linha diz o que sabe.
                      date: marcoEvento.dataEventoISO
                        ? format(parseDateLocal(marcoEvento.dataEventoISO), "dd/MM/yy", { locale: ptBR })
                        : null,
                      title: marcoEvento.hint,
                      color: marcoEvento.text,
                    },
                  ].filter(Boolean) as {
                    dot: string; label: string; date: string | null;
                    by?: string | null; title?: string; color?: string;
                  }[];

                  return (
                    /* Cartão do histórico: abre o detalhe de aprovações. Era um
                       <div> com onClick, então por teclado o histórico inteiro
                       ficava sem como ser aberto. */
                    <div key={item.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Ver histórico de aprovações de ${item.displayId}`}
                      onClick={() => setHistDetailItem({ ...item, _ev: ev })}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setHistDetailItem({ ...item, _ev: ev });
                        }
                      }}
                      style={{
                        background: '#fff', borderRadius: 12,
                        border: `1px solid ${allApproved ? '#d1fae5' : '#ede9e6'}`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
                        overflow: 'hidden', display: 'flex',
                        cursor: 'pointer', transition: 'box-shadow 0.12s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)')}
                    >
                      {/* Acento lateral */}
                      <div style={{ width: 4, background: accentColor, flexShrink: 0 }} />

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* ── Cabeçalho — empilha no mobile para não estourar a largura ── */}
                        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 12, padding: '14px 16px 12px' }}>
                          {/* Thumb */}
                          <div style={{
                            width: 48, height: 48, borderRadius: 8, overflow: 'hidden',
                            background: '#f5f5f4', flexShrink: 0,
                            border: '1px solid #e7e5e4',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative',
                          }}>
                            {(item.approvalThumbUrl || item.finalPreviewUrl)
                              ? <>
                                  <img
                                    src={item.approvalThumbUrl || item.finalPreviewUrl}
                                    alt=""
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    onError={(e) => {
                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                      const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                      if (fb?.dataset.fallback) fb.style.display = 'flex';
                                    }}
                                  />
                                  <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: '#f5f5f4' }}>
                                    <FileText style={{ width: 16, height: 16, color: '#c4bfbb' }} />
                                  </div>
                                </>
                              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FileText style={{ width: 16, height: 16, color: '#c4bfbb' }} />
                                </div>}
                          </div>

                          {/* Identidade */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#1c1917', lineHeight: 1.2 }}>{item.type}</span>
                              <span style={{ fontSize: 11, color: '#746e69', fontWeight: 500 }}>{item.displayId}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 11, color: '#746e69', fontWeight: 500 }}>{ev?.name || '—'}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 700,
                                backgroundColor: statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}`,
                                padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5,
                              }}>{isMobile ? getStatusShort(item.status) : getStatusLabel(item.status)}</span>
                            </div>
                          </div>

                          {/* Resumo + detalhes — empilha no mobile */}
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: 10, flexShrink: 0 }}>
                            {/* Afordância REAL (decisão do item 24 do backlog): parecia
                                botão mas era um <div> decorativo — agora é um <button>
                                com a mesma ação do card, utilizável também por teclado
                                sem depender do card inteiro como alvo. */}
                            <button
                              onClick={e => { e.stopPropagation(); setHistDetailItem({ ...item, _ev: ev }); }}
                              data-testid={`button-hist-details-${item.id}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#f5f5f4', border: '1px solid #ebe8e4', cursor: 'pointer' }}
                            >
                              <Eye style={{ width: 11, height: 11, color: '#746e69' }} />
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#746e69', whiteSpace: 'nowrap' }}>Ver detalhes</span>
                            </button>
                            {sponsorApprovals.length > 0 && (
                              <div style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center',
                                background: allApproved ? '#f0fdf4' : '#fafaf9',
                                border: `1px solid ${allApproved ? '#bbf7d0' : '#e5e7eb'}`,
                                borderRadius: 8, padding: '4px 10px', minWidth: 48,
                              }}>
                                <span style={{ fontSize: 15, fontWeight: 800, color: allApproved ? '#15803d' : '#374151', lineHeight: 1 }}>
                                  {approvedOnes.length} <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.55 }}>de</span> {sponsorApprovals.length}
                                </span>
                                <span style={{ fontSize: 11, color: allApproved ? '#15803d' : '#6b7280', fontWeight: 700, marginTop: 2 }}>
                                  {allApproved ? 'todos' : 'aprovaram'}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Timeline ── */}
                        {timelineMilestones.length > 0 && (
                          <div style={{
                            borderTop: '1px solid #f5f5f4',
                            padding: '8px 16px',
                            display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto',
                          }}>
                            {timelineMilestones.map((m, i) => (
                              <Fragment key={i}>
                                <div title={m.title} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: m.dot, flexShrink: 0, boxShadow: `0 0 0 2px ${m.dot}33` }} />
                                  <span style={{ fontSize: 11, fontWeight: 700, color: m.color ?? '#57534e', whiteSpace: 'nowrap' }}>{m.label}{(m as any).sublabel && <span style={{ fontWeight: 500, color: '#746e69', marginLeft: 3 }}>({(m as any).sublabel})</span>}</span>
                                  {m.date && <span style={{ fontSize: 11, color: '#746e69', whiteSpace: 'nowrap' }}>{m.date}{m.by ? ` · ${m.by}` : ''}</span>}
                                </div>
                                {i < timelineMilestones.length - 1 && (
                                  <span style={{ display: 'flex', alignItems: 'center', margin: '0 8px', flexShrink: 0 }}>
                                    <span style={{ display: 'block', width: 24, height: 1, background: '#e5e7eb' }} />
                                    <span style={{ fontSize: 11, color: '#d1d5db', marginLeft: -2 }}>›</span>
                                  </span>
                                )}
                              </Fragment>
                            ))}
                          </div>
                        )}

                        {/* ── Pipeline de fluxo — só no desktop: no mobile as 10
                            etapas viravam scroll horizontal ilegível ── */}
                        {!isMobile && (
                        <div style={{ borderTop: '1px solid #f5f5f4', padding: '12px 16px 14px', overflow: 'hidden' }}>
                          {/* stepper: linha absoluta + dots + labels */}
                          <div className="pipeline-scroll"><div style={{ position: 'relative', minWidth: 500 }}>
                            {/* linha conectora de fundo */}
                            <div style={{ position: 'absolute', top: 5, left: 0, right: 0, height: 2, background: '#ede9e4', borderRadius: 999 }} />
                            {/* linha preenchida até etapa atual */}
                            <div style={{ position: 'absolute', top: 5, left: 0, height: 2, borderRadius: 999, background: '#c4bfb8', width: `${currentPipelineIdx / (PIPELINE_STAGES.length - 1) * 100}%`, transition: 'width 0.3s' }} />
                            {/* dots */}
                            <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', zIndex: 1 }}>
                              {PIPELINE_STAGES.map((stage, si) => {
                                const isDone    = si < currentPipelineIdx;
                                const isCurrent = si === currentPipelineIdx;
                                const stageColor = isCurrent ? (stage as any).color || '#78716c' : '#c4bfb8';
                                return (
                                  <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <div style={{
                                      width: isCurrent ? 12 : isDone ? 8 : 8,
                                      height: isCurrent ? 12 : isDone ? 8 : 8,
                                      borderRadius: '50%',
                                      background: isCurrent ? stageColor : isDone ? '#c4bfb8' : '#e8e4e0',
                                      border: isCurrent ? `2px solid ${stageColor}` : 'none',
                                      boxShadow: isCurrent ? `0 0 0 3px ${stageColor}30` : 'none',
                                      transition: 'all 0.15s',
                                      flexShrink: 0,
                                    }} />
                                    {isCurrent && (
                                      <span style={{
                                        fontSize: 11, fontWeight: 800,
                                        color: stageColor,
                                        whiteSpace: 'nowrap', lineHeight: 1.2, textAlign: 'center',
                                      }}>{stage.label}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div></div>
                          </div>
                        </div>
                        )}

                        {/* ── Chips de patrocinadores ── */}
                        {sortedApprovals.length > 0 && (
                          <div style={{
                            borderTop: '1px solid #f5f5f4',
                            padding: '8px 16px 12px',
                            display: 'flex', flexWrap: 'wrap', gap: 4,
                          }}>
                            {sortedApprovals.map(({ sponsor, appr }) => {
                              const v = approvalVisual(appr?.status);
                              return (
                                <div key={sponsor.id}
                                  title={v.isApproved && appr?.approvedBy ? `${appr.approvedBy} · ${fmtDt(appr.approvedAt) ?? ''}` : undefined}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                    height: 26, padding: '0 9px 0 7px',
                                    borderRadius: 12, background: v.bg, border: `1px solid ${v.border}`,
                                    flexShrink: 0, cursor: 'default',
                                  }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, fontWeight: 600, color: v.text, whiteSpace: 'nowrap', lineHeight: 1 }}>
                                    {sponsor.name}
                                  </span>
                                  {v.isApproved && appr?.approvedAt && (
                                    <span style={{ fontSize: 11, color: '#15803d', fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1 }}>
                                      {fmtDt(appr.approvedAt, true)}
                                    </span>
                                  )}
                                  {!v.isApproved && !v.isRejected && !v.isNewVersion && !v.isAwaitingArte && (
                                    <span style={{ fontSize: 11, color: '#57534e', fontWeight: 600, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Ag.</span>
                                  )}
                                  {(v.isRejected || v.isAwaitingArte) && <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, lineHeight: 1 }}>✕</span>}
                                  {v.isNewVersion && <span style={{ fontSize: 11, color: '#92400e', fontWeight: 700, lineHeight: 1 }}>↻</span>}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {historyItems.length > histVisible && (
                  <button
                    onClick={() => setHistVisible(v => v + PAGE_SIZE)}
                    data-testid="button-load-more-history"
                    style={{ marginTop: 8, padding: '12px 0', width: '100%', borderRadius: 12, border: '1px solid #e7e5e4', background: '#ffffff', color: '#c2410c', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Carregar mais ({historyItems.length - histVisible} restantes)
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── MODAL HISTÓRICO DE APROVAÇÕES ─────────────────────── */}
      <Dialog open={!!histDetailItem} onOpenChange={open => { if (!open) setHistDetailItem(null); }}>
        {/* HIDE_NATIVE_CLOSE: o modal tem botão de fechar próprio no header escuro */}
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(620)}>
          <DialogTitle className="sr-only">Histórico de aprovações</DialogTitle>
          <DialogDescription className="sr-only">Log completo de aprovações por patrocinador</DialogDescription>
          {histDetailItem && (() => {
            const di = histDetailItem;
            const diSps: any[] = itemSponsorsMap[di.id] || [];
            const diApprovals: SponsorApproval[] = itemApprovalsMap[di.id] || [];
            const ev = di._ev;
            const fmtFull = (d: any) => d ? format(new Date(d), "dd/MM/yy 'às' HH:mm", { locale: ptBR }) : null;
            const approvedCount = diApprovals.filter(a => a.status === 'approved').length;
            const allApp = diSps.length > 0 && approvedCount === diSps.length;
            return (
              <>
                {/* Header escuro */}
                <div style={{ padding: '20px 24px 16px', background: 'linear-gradient(135deg,#1c1917,#292524)', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {(di.approvalThumbUrl || di.finalPreviewUrl)
                      ? <>
                          <img
                            src={di.approvalThumbUrl || di.finalPreviewUrl}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                              const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                              if (fb?.dataset.fallback) fb.style.display = 'flex';
                            }}
                          />
                          <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.65)', letterSpacing: '-0.01em' }}>{di.type?.slice(0,2).toUpperCase()}</span>
                          </div>
                        </>
                      : <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.65)', letterSpacing: '-0.01em' }}>{di.type?.slice(0,2).toUpperCase()}</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <h2 style={{ fontSize: 15, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textTransform: 'capitalize' }}>{di.type}</h2>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 500, flexShrink: 0 }}>{di.displayId}</span>
                    </div>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>{ev?.name || '—'}</span>
                  </div>
                  <button onClick={() => setHistDetailItem(null)} aria-label="Fechar" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <X style={{ width: 16, height: 16 }} />
                  </button>
                </div>
                {/* Body: resumo + lista integrados, sem faixa separada.
                    ALTURA: cabeçalho escuro 80 + lista de até 440 = 520px, sem
                    rodapé. Numa janela de 445 o Radix cortava 61px em cima e 61
                    embaixo ao mesmo tempo. Este wrapper é o ELO da coluna (o
                    fade de rolagem depende do `position: relative` dele): sem
                    ser coluna flex e sem `minHeight: 0` o teto do `modalSurface`
                    não chegaria à lista. */}
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: '0 1 auto', minHeight: 0 }}>
                <div style={{ maxHeight: 440, overflowY: 'auto', flex: '0 1 auto', minHeight: 0 }}>
                  {/* Resumo compacto no topo do body */}
                  <div style={{ padding: '14px 24px 12px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: `1px solid ${allApp ? '#d1fae5' : '#f0ede8'}`, background: allApp ? '#f6fef9' : '#fff' }}>
                    {/* Counter pill empilhado verticalmente */}
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      width: 56, height: 56, borderRadius: 12, flexShrink: 0,
                      background: allApp ? '#f0fdf4' : '#f5f5f4',
                      border: `1.5px solid ${allApp ? '#bbf7d0' : '#e7e5e4'}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, lineHeight: 1 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: allApp ? '#15803d' : '#374151' }}>{approvedCount}</span>
                        {/* #86efac/#22c55e como texto reprovavam AA (1,33:1) — tom
                            700 da lib para texto; saturado fica só nas dots. */}
                        <span style={{ fontSize: 13, fontWeight: 500, color: allApp ? '#15803d' : '#746e69' }}>/{diSps.length}</span>
                      </div>
                      <span style={{ fontSize: 11, color: allApp ? '#15803d' : '#6b7280', fontWeight: 700, marginTop: 2, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                        {allApp ? (diSps.length === 1 ? 'aprovou' : 'todos') : 'parcial'}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        {allApp && <CheckCircle style={{ width: 14, height: 14, color: '#15803d', flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: allApp ? '#15803d' : '#1c1917' }}>
                          {allApp
                            ? (diSps.length === 1 ? 'Patrocinador aprovou' : 'Todos os patrocinadores aprovaram')
                            : `${approvedCount} de ${diSps.length} aprovaram`}
                        </span>
                      </div>
                      {di.createdAt && <div style={{ fontSize: 11, color: '#746e69' }}>Criado em {fmtFull(di.createdAt)}</div>}
                    </div>
                  </div>
                  {diSps.length === 0
                    ? <div style={{ padding: '32px 24px', textAlign: 'center', color: '#746e69', fontSize: 13 }}>Nenhum patrocinador vinculado</div>
                    : diSps.map((sp: any, si: number) => {
                        const appr = diApprovals.find(a => a.sponsorId === sp.id);
                        const v = approvalVisual(appr?.status);
                        const { isApproved, isNewVersion } = v;
                        return (
                          <div key={sp.id} style={{ padding: '12px 24px', borderBottom: si < diSps.length - 1 ? '1px solid #f5f5f4' : 'none', display: 'flex', alignItems: 'center', gap: 12, borderLeft: sp.color ? `3px solid ${sp.color}` : 'none', paddingLeft: sp.color ? '24px' : '27px' }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: v.dot, flexShrink: 0, alignSelf: 'flex-start', marginTop: 3, boxShadow: `0 0 0 3px ${v.dot}33` }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', textTransform: 'capitalize' }}>{sp.name}</span>
                                <span style={{ fontSize: 11, fontWeight: 600, color: v.text, background: v.bg, border: `1px solid ${v.border}`, borderRadius: 6, padding: '2px 8px', whiteSpace: 'nowrap' }}>{v.label}</span>
                              </div>
                              {isApproved && appr?.approvedAt && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <CheckCircle style={{ width: 12, height: 12, color: '#15803d', flexShrink: 0 }} />
                                  <span style={{ fontSize: 11, color: '#57534e' }}>
                                    Aprovado em <strong style={{ fontWeight: 700 }}>{fmtFull(appr.approvedAt)}</strong>
                                    {appr.approvedBy && <> por <strong style={{ fontWeight: 700, color: '#1c1917' }}>{appr.approvedBy}</strong></>}
                                  </span>
                                </div>
                              )}
                              {isApproved && !appr?.approvedAt && <span style={{ fontSize: 11, color: '#746e69' }}>Data não registrada</span>}
                              {/* Gate pelos DADOS da reprovação, não pelo status: o
                                  servidor grava 'awaiting_arte' na reprovação (nunca
                                  'rejected'), então isRejected jamais ligava aqui e o
                                  motivo/data da reprovação ficavam invisíveis. */}
                              {(appr?.rejectedAt || appr?.rejectionReason) && (
                                <>
                                  {appr?.rejectedAt && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: appr.rejectionReason ? 6 : 0 }}>
                                      <X style={{ width: 12, height: 12, color: '#ef4444', flexShrink: 0 }} />
                                      <span style={{ fontSize: 11, color: '#57534e' }}>
                                        Reprovado em <strong style={{ fontWeight: 700 }}>{fmtFull(appr.rejectedAt)}</strong>
                                        {appr.rejectedBy && <> por <strong style={{ fontWeight: 700, color: '#1c1917' }}>{appr.rejectedBy}</strong></>}
                                      </span>
                                    </div>
                                  )}
                                  {appr?.rejectionReason && (
                                    <div style={{ padding: '6px 10px', background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
                                      <span style={{ fontSize: 11, color: '#b91c1c', fontStyle: 'italic' }}>"{appr.rejectionReason}"</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {isNewVersion && <span style={{ fontSize: 11, color: '#92400e' }}>Nova versão de arte solicitada</span>}
                              {!appr && <span style={{ fontSize: 11, color: '#746e69' }}>Aguardando resposta do patrocinador</span>}
                            </div>
                          </div>
                        );
                      })
                  }
                  <div style={{ height: 8 }} />
                </div>
                {/* Fade de scroll: só exibe quando a lista pode ter overflow */}
                {diSps.length > 4 && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.97))', pointerEvents: 'none', borderRadius: '0 0 16px 16px' }} />}
                </div>

              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL DE REVISÃO (3 colunas) ───────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Escape fecha o modal, EXCETO com o formulário de reprovação aberto —
            para não descartar o motivo digitado com um Esc acidental. */}
        <DialogContent className={`max-w-6xl max-h-[92vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col ${HIDE_NATIVE_CLOSE}`} style={isMobile ? { maxWidth: '95vw', width: '95vw' } : undefined} onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => { if (rejectingSponsorId) e.preventDefault(); }}>
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
                    <div style={{
                      width: 40, height: 40, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                      backgroundColor: '#0c0a09', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: '1px solid #2c2a28', position: 'relative',
                    }}>
                      {thumbUrl
                        ? <>
                            <img
                              src={thumbUrl}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => {
                                // Mesmo fallback dos demais thumbs da tela: esconde a
                                // imagem quebrada e mostra o ícone ao lado.
                                (e.currentTarget as HTMLImageElement).style.display = 'none';
                                const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                                if (fb?.dataset.fallback) fb.style.display = 'flex';
                              }}
                            />
                            <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                              <FileText style={{ width: 20, height: 20, color: '#ffffff' }} />
                            </div>
                          </>
                        : <FileText style={{ width: 20, height: 20, color: '#ffffff' }} />}
                    </div>
                    <div>
                      <h2 style={{
                        fontFamily: "'Space Grotesk', sans-serif",
                        fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em',
                        color: '#1c1917', margin: 0, lineHeight: 1,
                      }}>
                        REVISÃO DE ATIVO {selectedItem.displayId}
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {ev?.name || 'Sem Evento'}
                        </span>
                        {(() => {
                          // O prazo desta tela é o marco de APROVAÇÃO DE LAYOUT,
                          // não a saída do caminhão: aqui o patrocinador decide,
                          // e cobrar pela saída dava ao atendimento semanas de
                          // folga que ele não tem. A conta era uma cópia da do
                          // card da lista — agora as duas (e o filtro
                          // "Atrasados") leem a mesma regra pura.
                          const p = prazoAprovacaoLayout(ev, hoje);
                          if (!p) return null;
                          const limite = p.limite;
                          return (
                            <>
                              <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: '#d6d3d1' }} />
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Aprovação · {format(toUTCDisplayDate(limite.toISOString()), "dd/MM HH:mm")}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  {/* Navegação da fila + fechar */}
                  {(() => {
                    const qIdx = reviewQueue.findIndex((i: any) => i.id === selectedItem.id);
                    const hasPrev = qIdx > 0;
                    const hasNext = qIdx >= 0 && qIdx < reviewQueue.length - 1;
                    const navBtn = (enabled: boolean): React.CSSProperties => ({
                      width: 40, height: 40, borderRadius: 12,
                      border: '1px solid #e7e5e4',
                      backgroundColor: '#ffffff',
                      cursor: enabled ? 'pointer' : 'not-allowed',
                      opacity: enabled ? 1 : 0.4,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#57534e',
                    });
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {qIdx >= 0 && reviewQueue.length > 1 && (
                          <>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#746e69', whiteSpace: 'nowrap' }}>
                              Peça {qIdx + 1} <span style={{ opacity: 0.5 }}>de</span> {reviewQueue.length}
                            </span>
                            <button
                              onClick={() => hasPrev && goToAdjacentItem(-1)}
                              disabled={!hasPrev}
                              data-testid="button-prev-item"
                              title="Peça anterior"
                              style={navBtn(hasPrev)}
                            >
                              <ChevronRight style={{ width: 16, height: 16, transform: 'rotate(180deg)' }} />
                            </button>
                            <button
                              onClick={() => hasNext && goToAdjacentItem(1)}
                              disabled={!hasNext}
                              data-testid="button-next-item"
                              title="Próxima peça"
                              style={navBtn(hasNext)}
                            >
                              <ChevronRight style={{ width: 16, height: 16 }} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => setDialogOpen(false)}
                          data-testid="button-close-dialog"
                          style={{
                            width: 40, height: 40, borderRadius: '50%',
                            border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#746e69', transition: 'background-color 0.15s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f0ef'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <X style={{ width: 18, height: 18 }} />
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Modal Body: 3 colunas */}
                <div className="review-modal-body">

                  {/* Coluna esquerda: Metadados técnicos */}
                  <div style={{
                    borderRight: '1px solid #f1f0ef', padding: 24,
                    backgroundColor: 'rgba(250,250,249,0.5)',
                    display: 'flex', flexDirection: 'column', gap: 28,
                    overflowY: 'auto',
                  }}>
                    <div>
                      <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                        Especificações
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
                            <p style={{ fontSize: 11, color: '#746e69', fontWeight: 700, textTransform: 'uppercase', margin: '0 0 4px' }}>{label}</p>
                            <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0 }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Links para arquivos */}
                    <div>
                      <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
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
                            <span>Arquivo para aprovação</span>
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
                          <p style={{ fontSize: 13, color: '#746e69' }}>Nenhum arquivo disponível</p>
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
                          <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>Sem thumb de aprovação</p>
                        </div>
                      )}
                    </div>

                    {/* Aprovações por Patrocinador */}
                    <div>
                      <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>
                        Decisão
                      </h4>

                      {allDecided && !allApproved && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                          backgroundColor: '#fafaf9', border: '1px solid #e7e5e4',
                        }}>
                          <RotateCcw style={{ width: 14, height: 14, color: '#746e69', flexShrink: 0 }} />
                          <p style={{ fontSize: 13, color: '#57534e', margin: 0, fontWeight: 500 }}>
                            Decisões registradas — a Arte está preparando uma nova versão.
                          </p>
                        </div>
                      )}
                      {allApproved && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                          backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                        }}>
                          <CheckCircle style={{ width: 14, height: 14, color: '#15803d', flexShrink: 0 }} />
                          <p style={{ fontSize: 13, color: '#15803d', margin: 0, fontWeight: 600 }}>
                            Todos os patrocinadores aprovaram este ativo.
                          </p>
                        </div>
                      )}

                      {loadingSponsorApprovals ? (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                          <Loader2 style={{ width: 20, height: 20, color: '#a8a29e' }} className="animate-spin" />
                        </div>
                      ) : dialogSponsors.length === 0 ? (
                        <p style={{ fontSize: 13, color: '#746e69' }}>Nenhum patrocinador vinculado</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {dialogSponsors.map((sponsor: any) => {
                            const approval = sponsorApprovals.find(a => a.sponsorId === sponsor.id);
                            const status = approval?.status || 'pending';
                            // Neste modal, awaiting_arte conta como reprovado (a Arte
                            // está refazendo por causa de uma reprovação).
                            const v = approvalVisual(status);
                            const { isApproved, isNewVersion } = v;
                            const isRejected = v.isRejected || v.isAwaitingArte;
                            const isPending = status === 'pending' || isNewVersion;
                            const isRejectingThis = rejectingSponsorId === sponsor.id;

                            return (
                              <div
                                key={sponsor.id}
                                style={{
                                  padding: '14px 16px', borderRadius: 12,
                                  border: '1.5px solid',
                                  borderColor: isApproved ? '#86efac' : isRejected ? '#fecaca' : '#e7e5e4',
                                  backgroundColor: isApproved ? '#f0fdf4' : isRejected ? '#fef2f2' : '#fafaf9',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isRejectingThis ? 12 : 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <div style={{
                                      width: 32, height: 32, borderRadius: '50%',
                                      backgroundColor: isApproved ? '#86efac' : isRejected ? '#fecaca' : '#fff7ed',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      border: isPending ? '1.5px solid #fed7aa' : 'none',
                                    }}>
                                      {isApproved
                                        ? <CheckCircle style={{ width: 14, height: 14, color: '#15803d' }} />
                                        : isRejected
                                        ? <XCircle style={{ width: 14, height: 14, color: '#dc2626' }} />
                                        : <Clock style={{ width: 14, height: 14, color: '#f97316' }} />}
                                    </div>
                                    <div>
                                      <p style={{ fontSize: 13, fontWeight: 700, color: '#1c1917', margin: 0 }}>{sponsor.name}</p>
                                      <p style={{
                                        fontSize: 11, margin: '2px 0 0', textTransform: 'uppercase', fontWeight: 700,
                                        color: isApproved ? '#15803d' : isRejected ? '#dc2626' : isNewVersion ? '#0369a1' : '#b45309',
                                      }}>
                                        {isApproved ? 'Aprovado' : isRejected ? 'Reprovado' : isNewVersion ? 'Nova versão' : 'Aguardando Decisão'}
                                      </p>
                                    </div>
                                  </div>

                                  {isPending && !isRejectingThis && (
                                    <div style={{ display: 'flex', gap: 6, flexDirection: isMobile ? 'column' : 'row' }}>
                                      <button
                                        onClick={() => setRejectingSponsorId(sponsor.id)}
                                        disabled={individualRejectMutation.isPending || !canDecide}
                                        title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                                        style={{
                                          padding: '8px 16px', borderRadius: 8,
                                          backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                                          color: '#b91c1c', fontSize: 13, fontWeight: 700,
                                          cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                          opacity: canDecide ? 1 : 0.5,
                                          minHeight: 36,
                                          width: isMobile ? '100%' : undefined,
                                        }}
                                      >
                                        Reprovar
                                      </button>
                                      <button
                                        onClick={() => setConfirmApproveIndividual({ itemId: selectedItem.id, sponsorId: sponsor.id, sponsorName: sponsor.name || 'Patrocinador' })}
                                        disabled={individualApproveMutation.isPending || !canDecide}
                                        title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                                        data-testid={`button-approve-sponsor-${sponsor.id}`}
                                        style={{
                                          padding: '8px 16px', borderRadius: 8,
                                          backgroundColor: '#f0fdf4', border: '1px solid #86efac',
                                          color: '#15803d', fontSize: 13, fontWeight: 700,
                                          cursor: canDecide ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
                                          opacity: canDecide ? 1 : 0.5,
                                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                          minHeight: 36,
                                          width: isMobile ? '100%' : undefined,
                                        }}
                                      >
                                        {individualApproveMutation.isPending
                                          ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                          : <CheckCircle style={{ width: 12, height: 12 }} />}
                                        Aprovar
                                      </button>
                                    </div>
                                  )}

                                  {/* Correção de admin: aprovou/reprovou o patrocinador errado por
                                      engano — desfaz sem precisar mexer direto no banco. */}
                                  {!isPending && !isRejectingThis && user?.role === "admin" && (
                                    <button
                                      onClick={() => revertApprovalMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id })}
                                      disabled={revertApprovalMutation.isPending}
                                      title={`Reverter para pendente (admin) — estava ${isApproved ? 'aprovado' : 'reprovado'}`}
                                      data-testid={`button-revert-approval-${sponsor.id}`}
                                      style={{
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '8px 14px', borderRadius: 8,
                                        backgroundColor: '#fff', border: '1px solid #e7e5e4',
                                        color: '#746e69', fontSize: 13, fontWeight: 700,
                                        cursor: revertApprovalMutation.isPending ? 'default' : 'pointer',
                                        opacity: revertApprovalMutation.isPending ? 0.5 : 1,
                                        minHeight: 36, transition: 'all 0.15s',
                                      }}
                                    >
                                      {revertApprovalMutation.isPending
                                        ? <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                                        : <Undo2 style={{ width: 12, height: 12 }} />}
                                      Reverter
                                    </button>
                                  )}
                                </div>

                                {/* Motivo de reprovação existente */}
                                {isRejected && approval?.rejectionReason && (
                                  <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#fff', borderRadius: 8, border: '1px solid #fecaca', borderLeft: '3px solid #dc2626' }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#b91c1c', margin: '0 0 4px' }}>Motivo</p>
                                    <p style={{ fontSize: 13, fontStyle: 'italic', color: '#57534e', margin: 0, lineHeight: 1.5 }}>
                                      "{approval.rejectionReason}"
                                    </p>
                                  </div>
                                )}

                                {/* Formulário de reprovação inline */}
                                {isRejectingThis && (
                                  <div style={{ marginTop: 12 }}>
                                    {/* Label */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                                      <div style={{ width: 2, height: 12, borderRadius: 999, backgroundColor: '#dc2626', flexShrink: 0 }} />
                                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#dc2626' }}>Motivo da reprovação</span>
                                      <span style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700, lineHeight: 1 }}>*</span>
                                    </div>

                                    {/* Textarea nativa — sem reset de className interferindo no foco */}
                                    <textarea
                                      value={rejectionReason}
                                      onChange={e => setRejectionReason(e.target.value)}
                                      placeholder="Descreva o problema para a equipe de Arte..."
                                      rows={3}
                                      data-testid={`textarea-reject-reason-${sponsor.id}`}
                                      style={{
                                        width: '100%', boxSizing: 'border-box',
                                        padding: '10px 12px', fontSize: 13,
                                        fontFamily: 'inherit', color: '#1c1917',
                                        backgroundColor: '#fff',
                                        border: `1.5px solid ${rejectionReason.trim() ? '#dc2626' : '#e7e5e4'}`,
                                        borderRadius: 8, resize: 'none', lineHeight: 1.5,
                                        transition: 'border-color 0.15s, box-shadow 0.15s',
                                      }}
                                      onFocus={e => { e.currentTarget.style.borderColor = '#dc2626'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.08)'; }}
                                      onBlur={e => { e.currentTarget.style.borderColor = rejectionReason.trim() ? '#dc2626' : '#e7e5e4'; e.currentTarget.style.boxShadow = 'none'; }}
                                    />

                                    {/* Botões */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                      <button
                                        onClick={() => { setRejectingSponsorId(null); setRejectionReason(""); }}
                                        style={{
                                          flex: 1, height: 36, borderRadius: 8,
                                          background: '#fff', border: '1px solid #e7e5e4',
                                          color: '#746e69', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                                          transition: 'background 0.12s',
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={() => individualRejectMutation.mutate({ itemId: selectedItem.id, sponsorId: sponsor.id, reason: rejectionReason })}
                                        disabled={individualRejectMutation.isPending || rejectionReason.trim() === ""}
                                        data-testid={`button-confirm-reject-${sponsor.id}`}
                                        style={{
                                          flex: 2, height: 36, borderRadius: 8, border: 'none',
                                          backgroundColor: rejectionReason.trim() === "" ? '#e7e5e4' : '#dc2626',
                                          color: rejectionReason.trim() === "" ? '#57534e' : '#fff',
                                          fontSize: 13, fontWeight: 800,
                                          cursor: rejectionReason.trim() === "" ? 'not-allowed' : 'pointer',
                                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                          transition: 'background-color 0.15s, box-shadow 0.15s',
                                          boxShadow: rejectionReason.trim() ? '0 2px 8px rgba(220,38,38,0.25)' : 'none',
                                        }}
                                        onMouseEnter={e => { if (rejectionReason.trim()) e.currentTarget.style.backgroundColor = '#b91c1c'; }}
                                        onMouseLeave={e => { if (rejectionReason.trim()) e.currentTarget.style.backgroundColor = '#dc2626'; }}
                                      >
                                        {individualRejectMutation.isPending
                                          ? <><Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />Registrando…</>
                                          : <><XCircle style={{ width: 13, height: 13 }} />Confirmar Reprovação</>
                                        }
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
                    <h4 style={{ fontSize: 11, fontWeight: 700, color: '#746e69', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 24px' }}>
                      Histórico de Alterações
                    </h4>

                    {itemLogs.length === 0 ? (
                      <p style={{ fontSize: 13, color: '#746e69' }}>Sem registros de histórico</p>
                    ) : (
                      <div style={{ position: 'relative' }}>
                        {/* Linha vertical */}
                        <div style={{
                          position: 'absolute', left: 10, top: 8, bottom: 8,
                          width: 1, backgroundColor: '#e7e5e4',
                        }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                          {itemLogs.slice(0, 10).map((log, i) => {
                            // ACTION_CONFIG é const de módulo (topo do arquivo).
                            const cfg = ACTION_CONFIG[log.action] ?? { label: log.action?.replace(/_/g, ' ') ?? 'Ação', bg: '#e7e5e4', iconColor: '#a8a29e', icon: Clock };
                            const IconComp = cfg.icon;
                            const isSystemLog = ['updated', 'status_changed', 'file_uploaded', 'thumb_uploaded'].includes(log.action);
                            return (
                              <div key={log.id} style={{ paddingLeft: 32, position: 'relative', opacity: isSystemLog ? Math.max(0.4, 0.7 - i * 0.04) : Math.max(0.6, 1 - i * 0.08) }}>
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
                                <p style={{ fontSize: 11, color: '#746e69', margin: '2px 0 0' }}>
                                  {log.userName && <><span style={{ fontWeight: 600, color: '#746e69' }}>{log.userName}</span> · </>}
                                  {format(new Date(log.createdAt), "dd MMM, yyyy 'às' HH:mm", { locale: ptBR })}
                                </p>
                                {log.details && (
                                  <p style={{
                                    fontSize: 11, margin: '6px 0 0',
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
                      padding: '10px 20px', borderRadius: 8,
                      border: '1px solid #e7e5e4',
                      backgroundColor: 'transparent', color: '#746e69',
                      fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', marginRight: 'auto',
                      transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#a8a29e'; e.currentTarget.style.color = '#1c1917'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e7e5e4'; e.currentTarget.style.color = '#746e69'; }}
                  >
                    Fechar
                  </button>
                  {/* Atalhos de peça inteira: só enquanto há decisões em aberto.
                      Antes apareciam justamente quando allApproved — e o servidor
                      devolvia 409 (o item já saiu de awaiting_sponsor_approval).
                      Com tudo aprovado/decidido, o rodapé fica só com "Fechar". */}
                  {dialogSponsors.length > 0 && !allApproved && !allDecided && (
                    <>
                      <button
                        onClick={() => sponsorRejectMutation.mutate(selectedItem.id)}
                        disabled={sponsorRejectMutation.isPending || !canDecide}
                        title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                        data-testid="button-reject-item"
                        style={{
                          padding: '10px 20px', borderRadius: 8, border: 'none',
                          backgroundColor: '#ba1a1a', color: '#ffffff',
                          fontSize: 13, fontWeight: 800,
                          cursor: canDecide ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', gap: 6,
                          opacity: sponsorRejectMutation.isPending || !canDecide ? 0.5 : 1,
                        }}
                      >
                        {sponsorRejectMutation.isPending ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : <XCircle style={{ width: 14, height: 14 }} />}
                        Reprovar Ativo
                      </button>
                      <button
                        onClick={() => sponsorApproveMutation.mutate(selectedItem.id)}
                        disabled={sponsorApproveMutation.isPending || !canDecide}
                        title={!canDecide ? "Somente Atendimento e administradores decidem aprovações" : undefined}
                        data-testid="button-approve-item"
                        style={{
                          padding: '10px 28px', borderRadius: 8, border: 'none',
                          backgroundColor: '#c2410c', color: '#ffffff',
                          fontSize: 13, fontWeight: 800,
                          cursor: canDecide ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', gap: 6,
                          boxShadow: '0 4px 14px rgba(249,115,22,0.3)',
                          opacity: sponsorApproveMutation.isPending || !canDecide ? 0.5 : 1,
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
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
          <DialogTitle className="sr-only">Confirmar aprovação</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={CheckCircle}
            tint="#15803d"
            title="Confirmar aprovação"
            onClose={() => setConfirmApproveIndividual(null)}
          />
          {/* ALTURA: cabeçalho 80 + este corpo 82 + rodapé 120 = 282px, e em 445
              de altura sobram 397 — este modal NÃO cortava em nenhuma das
              alturas conferidas. A rolagem é preventiva: com o teto e o
              `overflow: hidden` que o `modalSurface` agora traz, um nome de
              patrocinador longo (a única parte elástica) seria recortado em
              silêncio se não houvesse scrollport. */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <DialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
              Aprovar a arte para o patrocinador <strong style={{ color: '#1c1917' }}>{confirmApproveIndividual?.sponsorName}</strong>?
              Somente um administrador pode reverter.
            </DialogDescription>
          </div>
          <ModalFooter>
            <button
              onClick={() => {
                if (confirmApproveIndividual) {
                  individualApproveMutation.mutate({ itemId: confirmApproveIndividual.itemId, sponsorId: confirmApproveIndividual.sponsorId });
                  setConfirmApproveIndividual(null);
                }
              }}
              disabled={individualApproveMutation.isPending}
              data-testid="button-confirm-approve-individual"
              style={{ width: '100%', height: 44, borderRadius: 8, backgroundColor: '#15803d', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <CheckCircle style={{ width: 15, height: 15 }} />
              Aprovar
            </button>
            <button
              onClick={() => setConfirmApproveIndividual(null)}
              style={{ width: '100%', height: 36, borderRadius: 8, background: 'none', border: 'none', color: '#746e69', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      {/* ── CONFIRMAÇÃO: Aprovar em Lote ────────────────────────────────── */}
      <Dialog open={confirmApproveBatch} onOpenChange={(open) => { if (!open) setConfirmApproveBatch(false); }}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(440)}>
          <DialogTitle className="sr-only">Confirmar aprovação em lote</DialogTitle>
          <ModalHeader
            variant="confirm"
            icon={CheckCircle}
            tint="#15803d"
            title="Confirmar aprovação em lote"
            onClose={() => setConfirmApproveBatch(false)}
          />
          {/* Mesma conta do modal individual acima: 282px de modal contra 397
              disponíveis em 445 de altura — NÃO cortava. Scrollport preventivo
              pelo teto que o `modalSurface` passou a impor. */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}>
            <DialogDescription style={{ fontSize: 13, color: '#57534e', lineHeight: 1.6, margin: 0 }}>
              Aprovar <strong style={{ color: '#1c1917' }}>{batchSelectedItemIds.size} {batchSelectedItemIds.size === 1 ? 'item' : 'itens'}</strong> para o patrocinador selecionado?
              Somente um administrador pode reverter.
            </DialogDescription>
          </div>
          <ModalFooter>
            <button
              onClick={() => {
                batchSponsorMutation.mutate({ sponsorId: batchSponsorId, eventId: batchEventId, action: "approve" });
                setConfirmApproveBatch(false);
              }}
              disabled={batchSponsorMutation.isPending}
              data-testid="button-confirm-batch-approve"
              style={{ width: '100%', height: 44, borderRadius: 8, backgroundColor: '#15803d', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <CheckCircle style={{ width: 15, height: 15 }} />
              Aprovar seleção
            </button>
            <button
              onClick={() => setConfirmApproveBatch(false)}
              style={{ width: '100%', height: 36, borderRadius: 8, background: 'none', border: 'none', color: '#746e69', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Cancelar
            </button>
          </ModalFooter>
        </DialogContent>
      </Dialog>

      {/* Exportar PDF — mesmo motor e opções da Arte */}
      <ExportPdfDialog
        open={showExportPDFModal}
        onOpenChange={setShowExportPDFModal}
        items={exportPool}
        title="Aprovação"
      />

      {/* Preview da arte no lote — abre pela miniatura, sem mexer na seleção */}
      <Dialog open={!!batchPreviewItem} onOpenChange={o => !o && setBatchPreviewItem(null)}>
        <DialogContent
          className="p-0 gap-0"
          // ALTURA: cabeçalho 72 + imagem com teto de 75vh + 32 de padding.
          // Em 445 de altura isso dava 438px de modal contra 397 disponíveis, e
          // o Radix cortava 20px de cada lado — o `overflow: hidden` daqui
          // impedia rolar até eles. Os 75vh eram um desconto CHUTADO: 75% da
          // viewport para a imagem, sem relação com o cabeçalho real.
          // A CONTA certa é `100vh − 48` no Content (24px de respiro em cima e
          // 24 embaixo, simétrico porque o Radix centra), com coluna flex: o
          // cabeçalho não encolhe e a área da imagem fica com o que sobrar.
          style={{ maxWidth: 900, width: '95vw', borderRadius: 12, overflow: 'hidden', maxHeight: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}
        >
          <DialogTitle className="sr-only">Arte da peça</DialogTitle>
          <DialogDescription className="sr-only">Visualização ampliada da arte enviada</DialogDescription>
          {batchPreviewItem && (
            <>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 800, color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '2px 6px' }}>
                  {batchPreviewItem.displayId}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1c1917', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.type}</p>
                  {batchPreviewItem.description && (
                    <p style={{ margin: 0, fontSize: 13, color: '#746e69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{batchPreviewItem.description}</p>
                  )}
                </div>
              </div>
              <div style={{ background: '#f7f8fa', overflow: 'auto', flex: '1 1 auto', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, position: 'relative' }}>
                <img
                  src={batchPreviewItem.approvalThumbUrl}
                  alt={batchPreviewItem.type}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }}
                  onError={(e) => {
                    // Mesmo fallback dos demais thumbs: esconde a imagem quebrada
                    // e mostra o aviso ao lado.
                    (e.currentTarget as HTMLImageElement).style.display = 'none';
                    const fb = (e.currentTarget as HTMLImageElement).nextElementSibling as HTMLElement | null;
                    if (fb?.dataset.fallback) fb.style.display = 'flex';
                  }}
                />
                <div data-fallback="1" style={{ display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '48px 0' }}>
                  <FileText style={{ width: 32, height: 32, color: '#a8a29e' }} />
                  <p style={{ fontSize: 13, color: '#746e69', margin: 0 }}>Não foi possível carregar a arte</p>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
