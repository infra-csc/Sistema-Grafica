import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { SponsorChips } from "@/components/sponsor-chips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, AlertTriangle, Eye, Calendar, Truck, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock, Package, Send, FolderOpen, FileText, FileCheck, RotateCcw, X, Star, ArrowRight, Paperclip, Ban, Printer, ChevronDown, LayoutList, Layers, CheckSquare, Filter, SlidersHorizontal, Palette, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, parseDateLocal, runInBatches, fileNameFromPath, folderFromPath } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Fragment, useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploader } from "@/components/FileUploader";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { ExportPdfDialog } from "@/components/export-pdf-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ItemDetailsDialog } from "@/components/item-details-dialog";
import { useIsMobile } from "@/hooks/use-mobile";

// Quantas linhas a tabela monta por vez. O resto entra por "Carregar mais".
const ARTE_PAGE_SIZE = 100;

// Elevação única dos modais. Havia quatro sombras diferentes entre os cinco
// diálogos da tela: a mesma camada da interface flutuava a alturas distintas
// dependendo de qual botão tinha sido apertado.
const MODAL_SHADOW = "0 24px 48px -12px rgba(28,25,23,0.22), 0 0 0 1px rgba(28,25,23,0.06)";

// Quantos eventos aparecem no resumo antes do "mais N". Oito costuma caber em
// uma linha em telas de trabalho; o resto entra por expansão.
const EVENT_CHIPS_VISIBLE = 8;

/**
 * Colunas da lista. As larguras saíram de medir o conteúdo real renderizado, e
 * não de estimativa: a coluna de ID, por exemplo, chega a 208 px quando traz o
 * selo de status abaixo do número. Ficam aqui fora para que o colgroup e o
 * cabeçalho usem exatamente os mesmos valores — é isso que mantém as colunas
 * alinhadas entre grupos, inclusive nos que não repetem o cabeçalho.
 */
const ARTE_COLS: { label: string; w: number | string; right?: boolean }[] = [
  { label: 'ID',                w: 150 },
  { label: 'Qtd',               w: 56 },
  { label: 'Peça',              w: 'auto' },
  { label: 'Dimensões (V / A)', w: 150 },
  { label: 'M²',                w: 68 },
  { label: 'Material',          w: 104 },
  { label: 'Thumb / Final',     w: 96 },
  { label: 'Patroc.',           w: 124 },
  // 112px cabia só com 2 botões-ícone; com "Enviar Aprovação"/"Enviar
  // Finalização" (texto) + dispensar, o botão vazava por cima da coluna de
  // Patrocinadores. 200px acomoda os 4 botões numa linha só.
  { label: 'Ações',             w: 200, right: true },
];

// Status que alimentam cada aba. Antes ficavam embutidos no filtro, que era
// reexecutado uma vez por aba só para contar.
const TAB_STATUSES: Record<string, string[]> = {
  "criar-aprovacoes": ['awaiting_submission'],
  "aguardando-patrocinador": ['awaiting_sponsor_approval'],
  "finalizar-layouts": ['sponsor_approved', 'awaiting_creator_review'],
  "finalizados": [
    'awaiting_final_review',
    'ready_for_production',
    'pronto_para_producao',
    'liberado',
    'inProduction',
    'em_producao',
    'produced',
    'produzido',
    'conferred',
    'delivered',
    'entregue',
  ],
};

export default function Arte() {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [eventFilter, setEventFilter] = useState<string[]>([]);
  // Persiste a aba ativa para não voltar ao padrão ao abrir uma peça e retornar.
  const [activeTab, setActiveTab] = useState<string>(() => sessionStorage.getItem("arte:activeTab") || "criar-aprovacoes");
  useEffect(() => { sessionStorage.setItem("arte:activeTab", activeTab); }, [activeTab]);

  // Quem rola nesta tela é a área de conteúdo (o <main> do app é overflow:hidden),
  // por isso o scroll precisa ser feito nela e não na window.
  const contentRef = useRef<HTMLDivElement>(null);

  // Paginação da tabela — ver comentário em renderGroupedTable.
  const [visibleCount, setVisibleCount] = useState(ARTE_PAGE_SIZE);
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Trocar de aba troca a lista inteira; manter o scroll onde estava deixava o
  // usuário no meio da tabela nova. Sempre volta ao topo da listagem.
  const changeTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
    setVisibleCount(ARTE_PAGE_SIZE);
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);
  const [finalFileUrl, setFinalFileUrl] = useState<string>("");
  const [finalPreviewUrl] = useState<string>(""); // reservado para uso futuro (sem upload por ora)
  const [finalFileName, setFinalFileName] = useState<string>("");
  // true quando a Arte trocou o caminho nesta sessão (evita "atualizar" sem mudar).
  const [finalDirty, setFinalDirty] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [materialFilter, setMaterialFilter] = useState<string[]>([]);
  const [finishFilter, setFinishFilter] = useState<string[]>([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [openEventCombobox, setOpenEventCombobox] = useState(false);
  const [next10DaysFilter, setNext10DaysFilter] = useState(false);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [approvalThumbUrl, setApprovalThumbUrl] = useState<string>("");
  const [approvalThumbPreview, setApprovalThumbPreview] = useState<string>("");
  const [savedApprovalThumbUrl, setSavedApprovalThumbUrl] = useState<string>("");
  const [thumbJustSaved, setThumbJustSaved] = useState(false);
  const [searchFilter, setSearchFilter] = useState<string>("");
  // Adia o valor usado na filtragem: o input segue responsivo, mas a tabela
  // (grande) não re-renderiza a cada tecla — evita engasgo com muitas peças.
  const deferredSearch = useDeferredValue(searchFilter);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [sharedPdfUrl, setSharedPdfUrl] = useState<string>("");

  const [correcaoItem, setCorrecaoItem] = useState<any>(null);
  const [correcaoThumbUrl, setCorrecaoThumbUrl] = useState<string>("");
  const [correcaoFileName, setCorrecaoFileName] = useState<string>("");
  const [correcaoSelectedSponsorIds, setCorrecaoSelectedSponsorIds] = useState<Set<string>>(new Set());
  const [correcaoSponsorFilter, setCorrecaoSponsorFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string[]>([]);
  const [semThumb, setSemThumb] = useState(false);
  const [comThumb, setComThumb] = useState(false);
  const [semFinal, setSemFinal] = useState(false);
  const [comFinal, setComFinal] = useState(false);
  const [urgenteFilter, setUrgenteFilter] = useState(false);
  const [periodFilter, setPeriodFilter] = useState("Todos");
  const isMobile = useIsMobile();
  const [dispenseItem, setDispenseItem] = useState<any>(null);
  const [dispenseReason, setDispenseReason] = useState<string>("");

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
  // Resolve o grupo pai (do catálogo de Modelos) para um item, tolerante a
  // maiúscula/acento/espaço. Casa o type do item tanto com o NOME de um modelo
  // (name → group) quanto diretamente com um NOME DE GRUPO do catálogo — assim
  // itens importados da planilha (ex.: type "Rolo") caem no grupo "ROLO".
  const normKey = (s: string) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const groupMaps = useMemo(() => {
    const byName: Record<string, string> = {};
    const byGroup: Record<string, string> = {};
    (standardItems as any[]).forEach((s: any) => {
      if (s.group) {
        byName[normKey(s.name)] = s.group;
        byGroup[normKey(s.group)] = s.group; // recupera a grafia canônica do grupo
      }
    });
    return { byName, byGroup };
  }, [standardItems]);
  const groupOf = (type: string): string => {
    const k = normKey(type);
    return groupMaps.byName[k] || groupMaps.byGroup[k] || "";
  };

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

  // Salva o thumb no item SEM mudar o status (rascunho). O item continua na aba
  // "Mandar para Aprovação" (filtrada por status awaiting_submission) — só grava
  // o approvalThumbUrl para enviar depois.
  const saveThumbDraftMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}`, { approvalThumbUrl });
    },
    onSuccess: (updated: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setSavedApprovalThumbUrl(variables.approvalThumbUrl);
      setThumbJustSaved(true);
      setTimeout(() => setThumbJustSaved(false), 2500);
      if (updated?.id) {
        setSelectedItem((prev: any) => prev?.id === updated.id ? { ...prev, ...updated } : prev);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao salvar thumb", description: error.message, variant: "destructive" });
    },
  });

  const submitBulkForApprovalMutation = useMutation({
    mutationFn: async ({ itemIds, pdfUrl }: { itemIds: string[]; pdfUrl: string }) => {
      // Em lotes com concorrência limitada — evita esgotar o pool do banco
      // ao enviar muitos itens (ex: 50) de uma vez.
      await runInBatches(itemIds, itemId =>
        apiRequest("PATCH", `/api/items/${itemId}/submit-for-approval`, { approvalThumbUrl: pdfUrl })
      );
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

  const resetFinalFileState = () => {
    setFinalFileUrl(""); setFinalFileName(""); setFinalDirty(false);
  };

  const submitFinalFileMutation = useMutation({
    mutationFn: async ({ itemId, finalFileUrl, finalPreviewUrl, finalFileName, isUpdate }: { itemId: string; finalFileUrl: string; finalPreviewUrl?: string; finalFileName?: string; isUpdate?: boolean }) => {
      return isUpdate
        ? await apiRequest("PATCH", `/api/items/${itemId}/update-final-file`, { finalFileUrl, finalPreviewUrl, finalFileName })
        : await apiRequest("PATCH", `/api/items/${itemId}/submit-final-file`, { finalFileUrl, finalPreviewUrl, finalFileName });
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

  // Troca do thumb já aprovado (Finalizar Arte / Finalizados). Não reabre a
  // aprovação — o thumb anterior fica guardado no item e no histórico.
  const updateThumbMutation = useMutation({
    mutationFn: async ({ itemId, approvalThumbUrl }: { itemId: string; approvalThumbUrl: string }) =>
      await apiRequest("PATCH", `/api/items/${itemId}/update-thumb`, { approvalThumbUrl }),
    onSuccess: (updated: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items/approved"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"], refetchType: "none" });
      if (updated?.id) setSelectedItem((prev: any) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      toast({ title: "Thumb atualizado", description: "O thumb anterior ficou guardado no histórico da peça." });
    },
    onError: (error: Error) =>
      toast({ title: "Erro ao atualizar thumb", description: error.message, variant: "destructive" }),
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
      setCorrecaoFileName("");
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

  const dispenseMutation = useMutation({
    mutationFn: async ({ itemId, reason }: { itemId: string; reason: string }) => {
      return await apiRequest("PATCH", `/api/items/${itemId}/dispense`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setDispenseItem(null);
      setDispenseReason("");
      toast({ title: "Peça dispensada", description: "A peça foi liberada para produção diretamente." });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao dispensar", description: error.message, variant: "destructive" });
    },
  });

  const getUploadUrl = async () => {
    const response = await apiRequest("POST", "/api/objects/upload", {});
    const data = await response.json();
    return { method: "PUT" as const, url: data.uploadURL };
  };

  const [isPasteUploading, setIsPasteUploading] = useState(false);

  const uploadFileDirect = useCallback(async (
    file: File,
    onComplete: (localPath: string) => void,
  ) => {
    setIsPasteUploading(true);
    try {
      const { url } = await getUploadUrl();
      const res = await fetch(url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "image/png" },
      });
      if (!res.ok) throw new Error("Falha no upload");
      const objectUrl = url.split("?")[0];
      const localPath = convertGCSUrlToLocalPath(objectUrl);
      onComplete(localPath);
      toast({ title: "Imagem colada!", description: "Upload via Ctrl+V concluído." });
    } catch (e: any) {
      toast({ title: "Erro ao colar imagem", description: e.message, variant: "destructive" });
    } finally {
      setIsPasteUploading(false);
    }
  }, [toast]);

  // Ctrl+V: colar thumb no modal de aprovação (selectedItem)
  useEffect(() => {
    if (!selectedItem) return;
    const handler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = (ev) => setApprovalThumbPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
      uploadFileDirect(file, (localPath) => {
        setApprovalThumbUrl(localPath);
        setApprovalThumbPreview(localPath);
      });
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [selectedItem, uploadFileDirect]);

  // Ctrl+V: colar thumb no modal de correção (correcaoItem)
  useEffect(() => {
    if (!correcaoItem) return;
    const handler = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items || []);
      const imageItem = items.find(i => i.type.startsWith("image/"));
      if (!imageItem) return;
      const file = imageItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      uploadFileDirect(file, (localPath) => {
        setCorrecaoThumbUrl(localPath);
        setCorrecaoFileName(file.name || "Imagem colada");
      });
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [correcaoItem, uploadFileDirect]);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isDragOverBulk, setIsDragOverBulk] = useState(false);
  const [showBulkThumbModal, setShowBulkThumbModal] = useState(false);
  type BulkThumbEntry = { id: string; file: File; preview: string; matchedItemId: string | null; status: 'pending' | 'uploading' | 'done' | 'error'; errorMsg?: string };
  const [bulkThumbEntries, setBulkThumbEntries] = useState<BulkThumbEntry[]>([]);
  const [bulkThumbRunning, setBulkThumbRunning] = useState(false);
  const [bulkThumbEventFilter, setBulkThumbEventFilter] = useState<string>("all");
  const [bulkThumbLinkOpenMap, setBulkThumbLinkOpenMap] = useState<Record<string, boolean>>({});
  const [showExportModal, setShowExportModal] = useState(false);
  // Book pronto (PDF) subido pela Arte: escolhe o evento e as peças cobertas.
  const [showBookModal, setShowBookModal] = useState(false);
  const [bookEventId, setBookEventId] = useState<string>("");
  const [bookFileUrl, setBookFileUrl] = useState<string>("");
  const [bookFileName, setBookFileName] = useState<string>("");
  const [bookUploading, setBookUploading] = useState(false);
  const [bookSelectedIds, setBookSelectedIds] = useState<Set<string>>(new Set());

  const pdfStyles = `
    @page { size: A4 portrait; margin: 12mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1c1917; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;

  // Texto livre (descrição, observações, nomes) precisa ser escapado antes de
  // ser interpolado no HTML do documento de impressão
  const escapeHtml = (v: unknown): string =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
    );

  // ── Pré-busca imagens como data URIs (resolve GCS 403 + timing) ─────────────
  const prefetchThumbsAsDataUris = async (items: any[]): Promise<Record<string, string>> => {
    const rawUrls = [...new Set(items.map((i: any) => i.approvalThumbUrl).filter(Boolean) as string[])];
    const out: Record<string, string> = {};
    await Promise.allSettled(rawUrls.map(async (rawUrl) => {
      if (/\.pdf$/i.test(rawUrl)) return;
      const localPath = convertGCSUrlToLocalPath(rawUrl);
      const fetchUrl = localPath.startsWith("/") ? `${window.location.origin}${localPath}` : localPath;
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
        if (dataUri) out[rawUrl] = dataUri;
      } catch (error) {
        console.warn("Failed to fetch/convert thumbnail image for print", rawUrl, error);
      }
    }));
    return out;
  };

  // ── Modo único: uma prova por página ────────────────────────────────────────

  // Chave de grupo de uma peça (ex.: "Pórtico (Frontal)" → "Pórtico").
  // Mesma regra usada pelos filtros de exportação (expUniqueGroups/expGroupFilter).
  const groupKeyOf = (item: any): string => (item.type ?? "").split(/[\s(]/)[0] || "Sem grupo";

  // ── Modo combinado: peças agrupadas juntas na mesma página ──────────────────
  // As peças de um mesmo grupo aparecem lado a lado (galeria de imagens) com a
  // lista/ficha de itens abaixo. Se um grupo tiver muitas peças, pagina o grupo
  // em blocos preservando o cabeçalho.
  const MAX_ITEMS_PER_COMBINED_PAGE = 6;

  /** Uma peça por página: arte grande + nome embaixo. Sem cabeçalho/rodapé. */
  const buildItemPage = (item: any, thumbDataUris: Record<string, string>) => {
    const thumbUrl = item.approvalThumbUrl || "";
    const thumbDataUri = thumbDataUris[thumbUrl] || null;
    const isImg = !!thumbDataUri;
    const title = escapeHtml(item.type || item.description || "Sem nome");
    const art = isImg
      ? `<img src="${thumbDataUri}" alt="Arte" class="ap-img" />`
      : thumbUrl
        ? `<div class="ap-noimg"><div class="ap-noimg-ic">PDF</div><div class="ap-noimg-sub">Arquivo PDF vinculado</div></div>`
        : `<div class="ap-noimg"><div class="ap-noimg-ic">—</div><div class="ap-noimg-sub">Sem arte enviada</div></div>`;
    return `
        <div class="page ap-page">
          <div class="ap-stage">${art}</div>
          <div class="ap-caption">${title}</div>
        </div>`;
  };

  /** Várias artes do mesmo grupo na mesma página. Título em cima, sem rodapé. */
  const buildGroupPage = (
    chunk: { group: string; items: any[]; part: number; parts: number },
    thumbDataUris: Record<string, string>,
  ) => {
    // Grade adaptativa: até 2 → 1 col, até 6 → 2 col, senão 3 col.
    const cols = chunk.items.length <= 2 ? chunk.items.length : chunk.items.length <= 6 ? 2 : 3;
    const cards = chunk.items.map(item => {
      const thumbUrl = item.approvalThumbUrl || "";
      const thumbDataUri = thumbDataUris[thumbUrl] || null;
      const inner = thumbDataUri
        ? `<img src="${thumbDataUri}" alt="Arte" class="ap-g-img" />`
        : thumbUrl
          ? `<div class="ap-g-noimg">PDF</div>`
          : `<div class="ap-g-noimg">—</div>`;
      return `
          <div class="ap-g-card">
            <div class="ap-g-frame">${inner}</div>
            <div class="ap-g-cap">${escapeHtml(item.description || item.type || "Sem nome")}</div>
          </div>`;
    }).join("");

    const partLabel = chunk.parts > 1 ? ` (${chunk.part}/${chunk.parts})` : "";
    return `
        <div class="page ap-page">
          <div class="ap-grouptitle">${escapeHtml(chunk.group)}${partLabel}</div>
          <div class="ap-grid" style="grid-template-columns: repeat(${cols}, 1fr)">${cards}</div>
        </div>`;
  };

  /** Capa: apenas o nome do evento, com layout cuidado. Sem marca. */
  const buildCoverPage = (name: string) => `
        <div class="page ap-cover">
          <div class="ap-cover-inner">
            <span class="ap-cover-rule"></span>
            <span class="ap-cover-event">${escapeHtml(name)}</span>
          </div>
        </div>`;

  /** Quebra um grupo em blocos que cabem numa página. */
  const chunkGroup = (group: string, groupItems: any[]) => {
    const parts = Math.ceil(groupItems.length / MAX_ITEMS_PER_COMBINED_PAGE);
    return Array.from({ length: parts }, (_, p) => ({
      group,
      items: groupItems.slice(p * MAX_ITEMS_PER_COMBINED_PAGE, (p + 1) * MAX_ITEMS_PER_COMBINED_PAGE),
      part: p + 1,
      parts,
    }));
  };

  /** CSS único, cobrindo páginas individuais e páginas de grupo. */
  // Estilo "book de aprovação": A4 paisagem, arte grande centralizada e legenda
  // discreta — inspirado nos PDFs de aprovação enviados por e-mail hoje.
  const PDF_STYLES = `
        @page { size: A4 landscape; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .page { width: 100vw; min-height: 100vh; display: flex; flex-direction: column; break-after: page; page-break-after: always; background: #ffffff; overflow: hidden; }
        .page:last-child { break-after: avoid; page-break-after: avoid; }
        @media print { .page { width: 297mm; height: 210mm; min-height: 210mm; } }

        /* ── Página de arte (uma peça): arte grande + nome centralizado ── */
        .ap-page { padding: 26px 34px; }
        .ap-stage { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ap-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
        .ap-noimg { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
        .ap-noimg-ic { font-size: 34px; font-weight: 800; color: #cbd5e1; font-family: 'DM Mono', monospace; }
        .ap-noimg-sub { font-size: 12px; color: #94a3b8; }
        .ap-caption { flex-shrink: 0; text-align: center; padding-top: 14px; font-family: 'DM Sans', Arial, sans-serif; font-size: 13pt; font-weight: 600; color: #1c1917; }

        /* ── Página de grupo (várias artes) ── */
        .ap-grouptitle { flex-shrink: 0; text-align: center; font-family: 'Space Grotesk', sans-serif; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; color: #1c1917; padding: 2px 4px 16px; }
        .ap-grid { flex: 1; min-height: 0; display: grid; gap: 18px; grid-auto-rows: 1fr; }
        .ap-g-card { min-height: 0; display: flex; flex-direction: column; }
        .ap-g-frame { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .ap-g-img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
        .ap-g-noimg { font-size: 22px; font-weight: 800; color: #cbd5e1; font-family: 'DM Mono', monospace; }
        .ap-g-cap { flex-shrink: 0; text-align: center; padding-top: 8px; font-size: 13px; font-weight: 600; color: #1c1917; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── Capa: apenas o nome do evento, layout centrado e elegante ── */
        .ap-cover { align-items: center; justify-content: center; padding: 64px; background: #1c1917; }
        .ap-cover-inner { display: flex; flex-direction: column; align-items: center; gap: 26px; max-width: 82%; }
        .ap-cover-rule { width: 56px; height: 4px; border-radius: 4px; background: #f97316; }
        .ap-cover-event { font-family: 'Space Grotesk', sans-serif; font-size: 58px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.06; color: #ffffff; text-align: center; }`;

  const writePdfDoc = (win: Window, title: string, pages: string) => {
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>${escapeHtml(title)}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet"/>
      <style>${PDF_STYLES}</style>
    </head><body>${pages}<script>
      window.addEventListener("load", function () {
        var fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        fontsReady.then(function () { setTimeout(function () { window.print(); }, 100); });
      });
    </scr` + `ipt></body></html>`);
    win.document.close();
  };

  /**
   * Exportação mista: no MESMO arquivo, os grupos escolhidos saem agrupados
   * (galeria + lista numa página) e o restante sai uma peça por página.
   */
  const exportMixedToPDF = async (
    items: any[],
    combinedGroups: Set<string>,
    title = "Arte — Peças",
    groupByEvent = false,
  ) => {
    if (items.length === 0) {
      toast({ title: "Nenhum item para exportar", variant: "destructive" });
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      toast({ title: "Pop-up bloqueado", description: "Permita pop-ups para este site e tente novamente", variant: "destructive" });
      return;
    }
    win.document.write(`<p style="font-family:sans-serif;color:#64748b;padding:24px">Preparando exportação…</p>`);

    const thumbCount = items.filter(i => i.approvalThumbUrl && !/\.pdf$/i.test(i.approvalThumbUrl)).length;
    if (thumbCount > 0) {
      toast({ title: `Preparando ${thumbCount} imagem${thumbCount !== 1 ? "ns" : ""}…`, description: "Aguarde um momento" });
    }
    const thumbDataUris = await prefetchThumbsAsDataUris(items);
    win.document.open();

    // Separa por evento primeiro (ordem de aparição). Sem isso, peças de eventos
    // diferentes com o mesmo grupo (ex.: "Pórtico") cairiam na mesma página.
    const eventsMap = new Map<string, { name: string; items: any[] }>();
    items.forEach(item => {
      const key = item.eventId || "__sem_evento__";
      if (!eventsMap.has(key)) eventsMap.set(key, { name: item.event?.name || "Sem evento", items: [] });
      eventsMap.get(key)!.items.push(item);
    });
    const eventEntries = Array.from(eventsMap.values());

    // Monta a sequência de páginas. Grupo marcado vira 1+ páginas de galeria;
    // o restante, uma peça por página.
    type Page =
      | { kind: 'cover'; name: string }
      | { kind: 'group'; chunk: ReturnType<typeof chunkGroup>[number] }
      | { kind: 'item'; item: any };
    const sequence: Page[] = [];

    const multiEvent = eventEntries.length > 1;
    // Capa no início. Com vários eventos e sem divisória por evento, usa o
    // título do book; senão, o nome do (único) evento.
    if (!(multiEvent && groupByEvent)) {
      sequence.push({ kind: 'cover', name: multiEvent ? title : eventEntries[0].name });
    }

    eventEntries.forEach(ev => {
      if (multiEvent && groupByEvent) {
        sequence.push({ kind: 'cover', name: ev.name });
      }
      const groupsMap = new Map<string, any[]>();
      ev.items.forEach(item => {
        const key = groupKeyOf(item);
        if (!groupsMap.has(key)) groupsMap.set(key, []);
        groupsMap.get(key)!.push(item);
      });
      Array.from(groupsMap.entries()).forEach(([group, groupItems]) => {
        if (combinedGroups.has(group)) {
          chunkGroup(group, groupItems).forEach(chunk => sequence.push({ kind: 'group', chunk }));
        } else {
          groupItems.forEach(item => sequence.push({ kind: 'item', item }));
        }
      });
    });

    const pages = sequence.map(p => {
      if (p.kind === 'cover') return buildCoverPage(p.name);
      return p.kind === 'group'
        ? buildGroupPage(p.chunk, thumbDataUris)
        : buildItemPage(p.item, thumbDataUris);
    }).join("");

    writePdfDoc(win, title, pages);
  };

  // ── Modo 2: tabela resumo agrupada por Evento › Grupo ───────────────────────
  const exportGroupedPDF = (items: any[], title = "Arte — Resumo por Grupo") => {
    if (items.length === 0) {
      toast({ title: "Nenhum item para exportar", variant: "destructive" });
      return;
    }
    // Build groups: event → group → type → items
    type GroupEntry = { event: string; groupName: string; typeName: string; items: any[] };
    const groups: GroupEntry[] = [];
    items.forEach(item => {
      const event = item.event?.name || "Sem Evento";
      const groupName = groupOf(item.type) || item.type;
      const typeName = item.type;
      const last = groups[groups.length - 1];
      if (last && last.event === event && last.typeName === typeName) {
        last.items.push(item);
      } else {
        groups.push({ event, groupName, typeName, items: [item] });
      }
    });

    let lastEvent = "";
    const sections = groups.map(g => {
      const eventHeader = g.event !== lastEvent
        ? `<div class="event-header"><span>${g.event}</span></div>`
        : "";
      lastEvent = g.event;
      const rows = g.items.map(item => {
        const thumbUrl = item.approvalThumbUrl || "";
        const isImg = thumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(thumbUrl) || thumbUrl.startsWith("/objects/"));
        const resolvedThumb = thumbUrl.startsWith("/objects/") ? `${window.location.origin}${thumbUrl}` : thumbUrl;
        const dims = item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : "—";
        return `
          <tr>
            <td class="td-thumb">${isImg ? `<img src="${resolvedThumb}" class="row-thumb" />` : `<div class="no-thumb-sm">${thumbUrl ? "PDF" : "—"}</div>`}</td>
            <td class="td-mono">${item.displayId || "—"}</td>
            <td class="td-qty">${item.quantity || "—"}</td>
            <td class="td-desc">${item.description || item.type || "—"}</td>
            <td class="td">${dims}</td>
            <td class="td">${item.calculatedM2 || "—"}</td>
            <td class="td">${item.material || "—"}</td>
            <td class="td">${item.finish || "—"}</td>
          </tr>`;
      }).join("");
      return `
        ${eventHeader}
        <div class="group-block">
          <div class="group-header">
            <span class="group-name">${g.groupName ? g.groupName + " — " : ""}${g.typeName}</span>
            <span class="group-count">${g.items.length} ${g.items.length === 1 ? "item" : "itens"}</span>
          </div>
          <table class="items-table">
            <thead>
              <tr>
                <th class="th-thumb">Thumb</th>
                <th>ID</th>
                <th>Qtd</th>
                <th class="th-desc">Descrição</th>
                <th>Medidas (V × A)</th>
                <th>M²</th>
                <th>Material</th>
                <th>Acabamento</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join("");

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
      <title>${title}</title>
      <style>
        ${pdfStyles}
        body { font-size: 11px; }
        .event-header { margin: 18px 0 8px; padding: 8px 12px; background: #1c1917; color: #fff; border-radius: 4px; font-size: 13px; font-weight: 800; letter-spacing: 0.04em; break-before: auto; }
        .event-header:first-child { margin-top: 0; }
        .group-block { margin-bottom: 20px; break-inside: avoid; }
        .group-header { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; background: #fff7ed; border-left: 3px solid #f97316; margin-bottom: 0; }
        .group-name { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #9a3412; }
        .group-count { font-size: 9px; font-weight: 700; color: #a8a29e; }
        .items-table { width: 100%; border-collapse: collapse; }
        .items-table thead tr { background: #f5f5f4; }
        .items-table th { padding: 5px 8px; font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #a8a29e; text-align: left; border-bottom: 1px solid #e7e5e4; white-space: nowrap; }
        .th-thumb { width: 44px; }
        .th-desc { width: 30%; }
        .items-table td { padding: 6px 8px; border-bottom: 1px solid #f5f5f4; vertical-align: middle; }
        .td-thumb { width: 44px; }
        .td-mono { font-family: monospace; font-size: 10px; font-weight: 700; color: #f97316; white-space: nowrap; }
        .td-qty { font-weight: 700; font-size: 12px; text-align: center; }
        .td-desc { font-weight: 600; }
        .td { font-size: 10px; color: #78716c; white-space: nowrap; }
        .row-thumb { width: 40px; height: 28px; object-fit: cover; border-radius: 3px; border: 1px solid #e7e5e4; display: block; }
        .no-thumb-sm { width: 40px; height: 28px; background: #f5f5f4; border-radius: 3px; border: 1px dashed #d4d4d0; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #a8a29e; }
      </style>
    </head><body>${sections}</body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 600);
  };

  // ── Pool de itens para exportação ────────────────────────────────────────
  const arteStatuses = ['awaiting_submission','awaiting_sponsor_approval','sponsor_approved','awaiting_creator_review','ready_for_production','pronto_para_producao','liberado'];
  const arteItemsPool = useMemo(() =>
    [...allItems.filter((i: any) => arteStatuses.includes(i.status)), ...correcaoItems],
    [allItems, correcaoItems]
  );

  const handleClickExportButton = () => {
    if (selectedItemIds.size > 0) {
      const allPoolItems = [...allItems, ...correcaoItems];
      const selected = allPoolItems.filter(i => selectedItemIds.has(i.id));
      const groups = new Set(selected.map(groupKeyOf));
      void exportMixedToPDF(selected, groups, `Arte — ${selected.length} peça(s)`);
      return;
    }
    setShowExportModal(true);
  };

  const handleExportItemPDF = (item: any) => {
    void exportMixedToPDF([item], new Set(), `Prova — ${item.displayId || item.type}`);
  };

  // ── Book pronto (PDF) enviado pela Arte para os patrocinadores ─────────────
  const bookEventPieces = useMemo(() => {
    const seen = new Set<string>();
    return arteItemsPool
      .filter((i: any) => {
        if (i.eventId !== bookEventId) return false;
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      })
      .sort((a: any, b: any) => String(a.displayId || "").localeCompare(String(b.displayId || ""), "pt-BR", { numeric: true }));
  }, [arteItemsPool, bookEventId]);
  // URL do book já existente para o evento selecionado (primeiro encontrado), se houver.
  const existingBookUrl = useMemo(
    () => bookEventPieces.find((i: any) => i.bookUrl)?.bookUrl ?? null,
    [bookEventPieces],
  );
  const bookEventOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    arteItemsPool.forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || "Sem evento", count: 1 });
    });
    return Array.from(map.values());
  }, [arteItemsPool]);

  const openBookModal = () => {
    const ev = eventFilter.length > 0 ? eventFilter[0] : (bookEventOptions[0]?.value || "");
    setBookEventId(ev);
    setBookFileUrl(""); setBookFileName("");
    setShowBookModal(true);
  };

  // Ao abrir ou trocar o evento, pré-marca todas as peças daquele evento.
  useEffect(() => {
    if (!showBookModal) return;
    setBookSelectedIds(new Set(arteItemsPool.filter((i: any) => i.eventId === bookEventId).map((i: any) => i.id)));
  }, [bookEventId, showBookModal]);

  const handleBookFile = async (file?: File | null) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
      toast({ title: "Envie um PDF", description: "O book precisa ser um arquivo .pdf", variant: "destructive" });
      return;
    }
    setBookUploading(true);
    try {
      const url = await uploadFileRaw(file);
      setBookFileUrl(url);
      setBookFileName(file.name);
      toast({ title: "Book anexado", description: file.name });
    } catch (e: any) {
      toast({ title: "Erro no upload", description: e.message, variant: "destructive" });
    } finally {
      setBookUploading(false);
    }
  };

  const saveBookMutation = useMutation({
    mutationFn: async () =>
      await apiRequest("POST", `/api/events/${bookEventId}/book`, {
        bookUrl: bookFileUrl,
        itemIds: Array.from(bookSelectedIds),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      setShowBookModal(false);
      toast({ title: "Book salvo", description: `${bookSelectedIds.size} peça(s) vinculada(s) ao book.` });
    },
    onError: (e: any) => toast({ title: "Erro ao salvar book", description: e.message, variant: "destructive" }),
  });

  // Upload sem alterar isPasteUploading (usado no bulk)
  const uploadFileRaw = useCallback(async (file: File): Promise<string> => {
    const { url } = await getUploadUrl();
    const res = await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "image/jpeg" } });
    if (!res.ok) throw new Error("Falha no upload do arquivo");
    return convertGCSUrlToLocalPath(url.split("?")[0]);
  }, []);

  const handleBulkThumbFilesAdded = useCallback((files: FileList | File[]) => {
    // Accept by MIME type OR by extension (some browsers return empty type)
    const isImage = (f: File) =>
      f.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(f.name);
    const arr = Array.from(files).filter(isImage);
    if (!arr.length) return;
    const pool = [...allItems.filter((i: any) => i.status === 'awaiting_submission')];
    const newEntries: BulkThumbEntry[] = arr.map(file => {
      // Extract numbers with ≥3 digits from filename to avoid false matches from "3×3", "01" etc.
      // e.g. "0277_aplique.jpg" → ["0277"], "tenda_3x3_0122.png" → ["0122"]
      const nums = (file.name.replace(/\.[^.]+$/, '').replace(/\D/g, ' '))
        .trim().split(/\s+/).filter(n => n.length >= 3);
      const matched = pool.find(item => {
        const rawId = (item.displayId || '').replace(/\D/g, '').padStart(4, '0');
        return nums.some(n => n.padStart(4, '0') === rawId);
      });
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        matchedItemId: matched?.id ?? null,
        status: 'pending' as const,
      };
    });
    setBulkThumbEntries(prev => [...prev, ...newEntries]);
    setShowBulkThumbModal(true);
  }, [allItems]);

  // Núcleo do upload em lote de thumbs. Se send=true, envia para aprovação
  // (/submit-for-approval, muda status). Se send=false, só salva o thumb no
  // item (PATCH /api/items/:id, mantém status awaiting_submission = rascunho).
  const runBulkThumb = useCallback(async (send: boolean) => {
    const toProcess = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending');
    if (!toProcess.length) return;
    setBulkThumbRunning(true);
    let enviados = 0, salvos = 0;
    for (const entry of toProcess) {
      setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'uploading' } : e));
      try {
        const localPath = await uploadFileRaw(entry.file);
        // "Enviar para aprovação" só vale para peças aguardando envio. Para as
        // demais (ex.: em correção) o thumb é apenas salvo — antes a tela tentava
        // enviar mesmo assim e o servidor recusava com erro de status.
        const alvo = [...allItems, ...correcaoItems].find((i: any) => i.id === entry.matchedItemId);
        const podeEnviar = send && alvo?.status === 'awaiting_submission';
        if (podeEnviar) {
          await apiRequest("PATCH", `/api/items/${entry.matchedItemId}/submit-for-approval`, { approvalThumbUrl: localPath });
          enviados++;
        } else {
          await apiRequest("PATCH", `/api/items/${entry.matchedItemId}`, { approvalThumbUrl: localPath });
          salvos++;
        }
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      } catch (err: any) {
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', errorMsg: err.message } : e));
      }
    }
    setBulkThumbRunning(false);
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
    queryClient.invalidateQueries({ queryKey: ["/api/items/resubmission-needed"] });
    const partes = [
      enviados ? `${enviados} enviado(s) para aprovação` : "",
      salvos ? `${salvos} thumb(s) salvo(s)` : "",
    ].filter(Boolean).join(" · ");
    toast({ title: "Upload em lote concluído", description: partes || "Nada a processar" });
  }, [bulkThumbEntries, uploadFileRaw, allItems, correcaoItems]);

  const handleBulkThumbUpload = useCallback(() => runBulkThumb(true), [runBulkThumb]);
  const handleBulkThumbSaveDraft = useCallback(() => runBulkThumb(false), [runBulkThumb]);

  const convertGCSUrlToLocalPath = (gcsUrl: string): string => {
    if (gcsUrl.startsWith('/')) return gcsUrl;
    const match = gcsUrl.match(/\/\.private\/(.+?)(?:\?|$)/);
    if (match) return `/objects/${match[1]}`;
    return gcsUrl;
  };

  const uniqueTypes = Array.from(new Set(allItems.map(item => item.type))).sort();
  const uniqueMaterials = Array.from(new Set(allItems.map(item => item.material).filter(Boolean))).sort();
  const uniqueFinishes = Array.from(new Set(allItems.map(item => item.finish).filter(Boolean))).sort();

  const uniqueSponsors = useMemo(() => {
    const map = new Map<string, any>();
    allItems.forEach((item: any) => (item.sponsors ?? []).forEach((s: any) => { if (!map.has(s.id)) map.set(s.id, s); }));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [allItems]);

  // Itens da fase/aba atual, sem aplicar os filtros de dropdown. É a base das
  // opções de filtro: assim cada filtro lista só o que existe naquela fase, e
  // escolher um filtro não esvazia as opções dos outros.
  const tabPoolItems = useMemo(() => {
    if (activeTab === "correcao") return correcaoItems as any[];
    const byTab: Record<string, string[]> = {
      "criar-aprovacoes": ['awaiting_submission'],
      "aguardando-patrocinador": ['awaiting_sponsor_approval'],
      "finalizar-layouts": ['sponsor_approved', 'awaiting_creator_review'],
      "finalizados": ['awaiting_final_review', 'ready_for_production', 'pronto_para_producao', 'liberado', 'inProduction', 'em_producao', 'produced', 'produzido', 'conferred', 'delivered', 'entregue'],
    };
    const allowed = byTab[activeTab];
    return allowed ? allItems.filter((i: any) => allowed.includes(i.status)) : allItems;
  }, [allItems, correcaoItems, activeTab]);

  // Filtros facetados: as opções de cada filtro são calculadas aplicando os
  // OUTROS filtros ativos. Assim escolher um evento reduz os patrocinadores,
  // tipos e materiais àquele evento (e as contagens acompanham a página), sem
  // que um filtro esvazie a si mesmo.
  const facetPool = (exclude: 'event' | 'sponsor' | 'type' | 'material') =>
    tabPoolItems.filter((i: any) => {
      if (exclude !== 'event' && eventFilter.length > 0 && !eventFilter.includes(i.eventId)) return false;
      if (exclude !== 'sponsor' && sponsorFilter.length > 0 && !(i.sponsors ?? []).some((s: any) => sponsorFilter.includes(s.id))) return false;
      if (exclude !== 'type' && typeFilter.length > 0 && !typeFilter.includes(i.type)) return false;
      if (exclude !== 'material' && materialFilter.length > 0 && !materialFilter.includes(i.material)) return false;
      return true;
    });

  const facetDeps = [tabPoolItems, eventFilter, sponsorFilter, typeFilter, materialFilter];

  const eventFilterOptions = useMemo(() => {
    const C: Record<string, string> = { urgent: '#ef4444', urgente: '#ef4444', alta: '#f97316', media: '#eab308', baixa: '#3b82f6' };
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    facetPool('event').forEach((i: any) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: C[i.event?.priority] });
    });
    return Array.from(map.values());
  }, facetDeps);

  const sponsorFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool('sponsor').forEach((i: any) => (i.sponsors ?? []).forEach((s: any) => {
      const cur = map.get(s.id);
      if (cur) cur.count++;
      else map.set(s.id, { value: s.id, label: s.name, count: 1 });
    }));
    return Array.from(map.values());
  }, facetDeps);

  const countBy = (key: 'type' | 'material') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    facetPool(key).forEach((i: any) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };
  const typeFilterOptions = useMemo(() => countBy('type'), facetDeps);
  const materialFilterOptions = useMemo(() => countBy('material'), facetDeps);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchFilter) count++;
    if (eventFilter.length > 0) count += eventFilter.length;
    if (sponsorFilter.length > 0) count += sponsorFilter.length;
    if (monthFilter.length > 0) count++;
    if (next10DaysFilter) count++;
    if (typeFilter.length > 0) count += typeFilter.length;
    if (materialFilter.length > 0) count += materialFilter.length;
    if (semThumb) count++;
    if (comThumb) count++;
    if (semFinal) count++;
    if (comFinal) count++;
    if (urgenteFilter) count++;
    if (periodFilter !== "Todos") count++;
    return count;
  }, [searchFilter, eventFilter, sponsorFilter, monthFilter, next10DaysFilter, typeFilter, materialFilter, semThumb, comThumb, semFinal, comFinal, urgenteFilter, periodFilter]);

  const clearAllFilters = () => {
    setSearchFilter("");
    setEventFilter([]);
    setSponsorFilter([]);
    setMonthFilter([]);
    setNext10DaysFilter(false);
    setTypeFilter([]);
    setMaterialFilter([]);
    setFinishFilter([]);
    setSemThumb(false);
    setComThumb(false);
    setSemFinal(false);
    setComFinal(false);
    setUrgenteFilter(false);
    setPeriodFilter("Todos");
  };

  const months = [
    { value: "all", label: "Todos os meses" },
    { value: "1", label: "Janeiro" }, { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" }, { value: "4", label: "Abril" },
    { value: "5", label: "Maio" }, { value: "6", label: "Junho" },
    { value: "7", label: "Julho" }, { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" }, { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" }, { value: "12", label: "Dezembro" },
  ];

  // Aplica os filtros uma única vez e separa por aba. As contagens saem do
  // .length de cada balde; só a aba aberta paga o custo da ordenação.
  const itemsByTab = useMemo(() => {
    const search = deferredSearch.toLowerCase();

    // Limites de data calculados uma vez, não por item.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tenDays = new Date(today); tenDays.setDate(tenDays.getDate() + 10);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const in15 = new Date(today); in15.setDate(in15.getDate() + 15);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

    const buckets: Record<string, any[]> = {
      "criar-aprovacoes": [], "aguardando-patrocinador": [],
      "finalizar-layouts": [], "finalizados": [],
    };

    for (const item of allItems) {
      const matchesEvent = eventFilter.length === 0 || eventFilter.includes(item.eventId);
      if (!matchesEvent) continue;
      if (typeFilter.length && !typeFilter.includes(item.type)) continue;
      if (materialFilter.length && !materialFilter.includes(item.material)) continue;
      if (finishFilter.length && !finishFilter.includes(item.finish)) continue;

      const depRaw = item.event?.truckDepartureDate;
      if (next10DaysFilter && depRaw) {
        const dep = new Date(depRaw);
        if (!(dep >= today && dep <= tenDays)) continue;
      }
      if (monthFilter.length > 0 && depRaw) {
        if (!monthFilter.includes((new Date(depRaw).getMonth() + 1).toString())) continue;
      }
      if (search) {
        const hit = [item.displayId, item.type, item.description, item.event?.name]
          .some(f => f && f.toLowerCase().includes(search));
        if (!hit) continue;
      }
      if (sponsorFilter.length && !(item.sponsors ?? []).some((s: any) => sponsorFilter.includes(s.id))) continue;
      if (semThumb && item.approvalThumbUrl) continue;
      if (comThumb && !item.approvalThumbUrl) continue;
      if (semFinal && item.finalFileUrl) continue;
      if (comFinal && !item.finalFileUrl) continue;
      if (urgenteFilter && item.event?.priority !== 'urgent') continue;

      if (periodFilter !== "Todos" && depRaw) {
        const dep = new Date(depRaw);
        if (periodFilter === "Hoje") { if (!(dep >= today && dep < tomorrow)) continue; }
        else if (periodFilter === "7 dias")  { if (!(dep <= in7))  continue; }
        else if (periodFilter === "15 dias") { if (!(dep <= in15)) continue; }
        else if (periodFilter === "30 dias") { if (!(dep <= in30)) continue; }
      }

      for (const tab in buckets) {
        if (TAB_STATUSES[tab].includes(item.status)) { buckets[tab].push(item); break; }
      }
    }
    return buckets;
  }, [
    allItems, eventFilter, typeFilter, materialFilter, finishFilter,
    next10DaysFilter, monthFilter, deferredSearch, sponsorFilter,
    semThumb, comThumb, semFinal, comFinal, urgenteFilter, periodFilter,
  ]);

  // Qualquer mudança de recorte recomeça a paginação — senão o usuário filtra e
  // continua vendo "carregar mais" de uma lista que já cabe inteira.
  useEffect(() => { setVisibleCount(ARTE_PAGE_SIZE); }, [itemsByTab]);

  // Re-sincroniza o preview do thumb caso a query de items refaça o estado
  // após salvar rascunho (dupla invalidação: onSuccess + WebSocket item_updated).
  useEffect(() => {
    if (selectedItem?.approvalThumbUrl && !approvalThumbPreview) {
      setApprovalThumbUrl(selectedItem.approvalThumbUrl);
      setApprovalThumbPreview(selectedItem.approvalThumbUrl);
    }
    if (selectedItem?.approvalThumbUrl && !savedApprovalThumbUrl) {
      setSavedApprovalThumbUrl(selectedItem.approvalThumbUrl);
    }
  }, [selectedItem?.approvalThumbUrl, savedApprovalThumbUrl]);

  const filteredItems = useMemo(() => {
    const list = itemsByTab[activeTab] ?? [];
    // Um Collator reutilizado é bem mais rápido que localeCompare por comparação.
    const cmp = new Intl.Collator('pt-BR');
    return [...list].sort((a, b) => {
      const eA = a.event?.name || '', eB = b.event?.name || '';
      if (eA !== eB) return cmp.compare(eA, eB);
      const gA = groupOf(a.type) || '', gB = groupOf(b.type) || '';
      if (gA !== gB) return cmp.compare(gA, gB);
      const idA = parseInt(String(a.displayId || '0').replace(/\D/g, '')) || 0;
      const idB = parseInt(String(b.displayId || '0').replace(/\D/g, '')) || 0;
      return idA - idB;
    });
  }, [itemsByTab, activeTab, groupMaps]);

  const itemsForEvent = eventFilter.length === 0 ? allItems : allItems.filter(item => eventFilter.includes(item.eventId));
  const pendingCount = itemsByTab["criar-aprovacoes"].length;
  const aguardandoCount = itemsByTab["aguardando-patrocinador"].length;
  const needsFinalFileCount = itemsByTab["finalizar-layouts"].length;
  const finalizadosCount = itemsByTab["finalizados"].length;
  const correcaoCount = useMemo(() => {
    if (eventFilter.length === 0 && typeFilter.length === 0 && materialFilter.length === 0 && sponsorFilter.length === 0 && !deferredSearch) {
      return correcaoItems.length;
    }
    const s = deferredSearch.toLowerCase();
    return correcaoItems.filter((item: any) => {
      if (eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
      if (materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
      if (sponsorFilter.length > 0 && !(item.sponsors ?? []).some((sp: any) => sponsorFilter.includes(sp.id))) return false;
      if (s) {
        const hit = [item.displayId, item.type, item.description, item.event?.name]
          .some((f: any) => f && f.toLowerCase().includes(s));
        if (!hit) return false;
      }
      return true;
    }).length;
  }, [correcaoItems, eventFilter, typeFilter, materialFilter, sponsorFilter, deferredSearch]);
  const pendingItems = filteredItems.filter(item => item.status === 'awaiting_submission');

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setApprovalThumbUrl(item.approvalThumbUrl || "");
    setApprovalThumbPreview(item.approvalThumbUrl || "");
    setSavedApprovalThumbUrl(item.approvalThumbUrl || "");
    setThumbJustSaved(false);
    setFinalFileUrl(item.finalFileUrl || "");
    setFinalFileName(item.finalFileName || fileNameFromPath(item.finalFileUrl) || (item.finalFileUrl ? "arquivo enviado" : ""));
    setFinalDirty(false);
  };

  const handleSubmitForApproval = () => {
    if (!selectedItem || !approvalThumbUrl) {
      toast({ title: "Erro", description: "É necessário fazer upload do thumb de aprovação", variant: "destructive" });
      return;
    }
    submitForApprovalMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  // Salva o thumb sem enviar para aprovação (rascunho).
  const handleSaveThumbDraft = () => {
    if (!selectedItem || !approvalThumbUrl) {
      toast({ title: "Erro", description: "Faça o upload do thumb antes de salvar", variant: "destructive" });
      return;
    }
    saveThumbDraftMutation.mutate({ itemId: selectedItem.id, approvalThumbUrl });
  };

  // Envia (ou atualiza) o caminho do arquivo final.
  const handleSubmitFinalFile = () => {
    if (!selectedItem || !finalFileUrl) {
      toast({ title: "Erro", description: "É necessário informar o caminho do arquivo final", variant: "destructive" });
      return;
    }
    const isUpdate = !!selectedItem.finalFileUrl; // já tinha arquivo → é atualização
    submitFinalFileMutation.mutate({ itemId: selectedItem.id, finalFileUrl, finalPreviewUrl: "", finalFileName: fileNameFromPath(finalFileUrl) || "", isUpdate });
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

  // ─── ACTIVE CHIPS ──────────────────────────────────────────────────────────
  const activeChips = useMemo(() => {
    const chips: string[] = [];
    if (eventFilter.length === 1) {
      const ev = (events as any[]).find((e: any) => e.id === eventFilter[0]);
      chips.push(`Evento: ${ev?.name || 'Selecionado'}`);
    }
    if (sponsorFilter.length === 1) {
      const sp = (uniqueSponsors as any[]).find((s: any) => s.id === sponsorFilter[0]);
      chips.push(`Patrocinador: ${sp?.name || 'Selecionado'}`);
    }
    if (typeFilter.length > 0) typeFilter.forEach(t => chips.push(`Tipo: ${t}`));
    if (materialFilter.length > 0) materialFilter.forEach(m => chips.push(`Material: ${m}`));
    if (monthFilter.length > 0) {
      const m = months.find(x => x.value === monthFilter[0]);
      chips.push(`Mês: ${m?.label || monthFilter}`);
    }
    if (next10DaysFilter) chips.push("Próximos 10 dias");
    if (periodFilter !== "Todos") chips.push(`Período: ${periodFilter}`);
    if (urgenteFilter) chips.push("Urgente");
    if (semThumb) chips.push("Sem thumb");
    if (comThumb) chips.push("Com thumb");
    if (semFinal) chips.push("Sem arq. final");
    if (comFinal) chips.push("Com arq. final");
    if (searchFilter) chips.push(`Busca: "${searchFilter}"`);
    return chips;
  }, [eventFilter, sponsorFilter, typeFilter, materialFilter, monthFilter, next10DaysFilter, periodFilter, urgenteFilter, semThumb, comThumb, semFinal, comFinal, searchFilter, events, uniqueSponsors, months]);

  const removeChipFilter = (chip: string) => {
    if (chip.startsWith("Evento:")) { const name = chip.replace("Evento: ", ""); setEventFilter(prev => prev.filter(v => { const ev = (window as any).__evList?.find((e: any) => e.name === name); return ev ? v !== ev.id : true; })); }
    else if (chip.startsWith("Patrocinador:")) setSponsorFilter([]);
    else if (chip.startsWith("Tipo:")) { const t = chip.replace("Tipo: ", ""); setTypeFilter(prev => prev.filter(v => v !== t)); }
    else if (chip.startsWith("Material:")) { const m = chip.replace("Material: ", ""); setMaterialFilter(prev => prev.filter(v => v !== m)); }
    else if (chip.startsWith("Mês:")) setMonthFilter([]);
    else if (chip === "Próximos 10 dias") setNext10DaysFilter(false);
    else if (chip.startsWith("Período:")) setPeriodFilter("Todos");
    else if (chip === "Urgente") setUrgenteFilter(false);
    else if (chip === "Sem thumb") setSemThumb(false);
    else if (chip === "Com thumb") setComThumb(false);
    else if (chip === "Sem arq. final") setSemFinal(false);
    else if (chip === "Com arq. final") setComFinal(false);
    else if (chip.startsWith("Busca:")) setSearchFilter("");
  };

  // ─── RENDER ────────────────────────────────────────────────────────────────
  const tabs = [
    { id: "criar-aprovacoes", label: "Mandar para Aprovação", count: pendingCount, testId: "tab-criar-aprovacoes" },
    { id: "aguardando-patrocinador", label: "Aguardando Patrocinador", count: aguardandoCount, testId: "tab-aguardando-patrocinador" },
    { id: "correcao", label: "Correção", count: correcaoCount, testId: "tab-correcao" },
    { id: "finalizar-layouts", label: "Finalizar Arte", count: needsFinalFileCount, testId: "tab-finalizar-layouts" },
    { id: "finalizados", label: "Finalizados", count: finalizadosCount, testId: "tab-finalizados" },
  ];

  const statCards = [
    {
      label: "Pendentes",
      value: pendingCount,
      sub: "para envio",
      subColor: "#f97316",
      iconBg: "#fff7ed",
      iconColor: "#f97316",
      accentColor: "#f97316",
      Icon: Clock,
      testId: "stat-pending",
    },
    {
      label: "Aguard. Patrocin.",
      value: itemsForEvent.filter(i => i.status === 'awaiting_sponsor_approval').length,
      sub: "em análise",
      subColor: "#d97706",
      iconBg: "#fffbeb",
      iconColor: "#d97706",
      accentColor: "#d97706",
      Icon: Clock,
      testId: "stat-awaiting-sponsor",
    },
    {
      label: "Patrocin. Aprovou",
      value: itemsForEvent.filter(i => ['sponsor_approved', 'awaiting_creator_review'].includes(i.status)).length,
      sub: "verificado",
      subColor: "#2563eb",
      iconBg: "#eff6ff",
      iconColor: "#2563eb",
      accentColor: "#2563eb",
      Icon: CheckCircle,
      testId: "stat-sponsor-approved",
    },
    {
      label: "Prontos p/ Prod.",
      value: itemsForEvent.filter(i => ['awaiting_final_review', 'ready_for_production', 'pronto_para_producao', 'liberado', 'approved', 'inProduction', 'em_producao', 'produced', 'produzido', 'conferred', 'delivered', 'entregue'].includes(i.status)).length,
      sub: "liberado",
      subColor: "#16a34a",
      iconBg: "#f0fdf4",
      iconColor: "#16a34a",
      accentColor: "#16a34a",
      Icon: Package,
      testId: "stat-ready-production",
    },
  ];

  const renderGroupedTable = (items: any[], tabId: string) => {
    if (items.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          {tabId === "criar-aprovacoes" ? <CheckCircle style={{ width: 48, height: 48, color: '#16a34a', margin: '0 auto 16px' }} /> :
           tabId === "finalizar-layouts" ? <Upload style={{ width: 48, height: 48, color: '#2563eb', margin: '0 auto 16px' }} /> :
           <Eye style={{ width: 48, height: 48, color: '#57534e', margin: '0 auto 16px' }} />}
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', marginBottom: 4 }}>
            {tabId === "criar-aprovacoes" ? "Tudo liberado!" : tabId === "aguardando-patrocinador" ? "Nenhuma peça aguardando patrocinador" : tabId === "finalizar-layouts" ? "Nenhum item aguardando arquivo final" : "Nenhum item finalizado"}
          </p>
          <p style={{ fontSize: 13, color: '#57534e' }}>
            {tabId === "criar-aprovacoes" ? "Não há itens pendentes no momento" : tabId === "aguardando-patrocinador" ? "Nenhuma peça em aprovação pelo patrocinador" : "Histórico vazio"}
          </p>
        </div>
      );
    }

    // Resumo por evento: quantos itens desta aba cada evento tem, para saber
    // rapidamente onde estão sem precisar rolar a lista toda.
    const eventSummary: { id: string | null; name: string; count: number }[] = [];
    const evSumMap = new Map<string, { id: string | null; name: string; count: number }>();
    items.forEach(item => {
      const name = item.event?.name || 'Sem Evento';
      const id = item.eventId || null;
      const key = id || name;
      const cur = evSumMap.get(key);
      if (cur) cur.count++;
      else { const rec = { id, name, count: 1 }; evSumMap.set(key, rec); eventSummary.push(rec); }
    });
    eventSummary.sort((a, b) => b.count - a.count);

    // Só as primeiras linhas entram no DOM. Com quase mil peças numa aba, montar
    // a tabela inteira era o que travava a troca de aba e a digitação na busca.
    const shownItems = items.slice(0, visibleCount);

    const groups: { event: string; type: string; group: string; eventObj: any; items: any[] }[] = [];
    shownItems.forEach(item => {
      const eventName = item.event?.name || 'Sem Evento';
      const typeName = item.type;
      const groupName = groupOf(typeName) || '';
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
        {/* Resumo por evento — chips clicáveis para filtrar/pular */}
        {eventFilter.length === 0 && eventSummary.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 14px', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>
              {eventSummary.length} eventos
            </span>
            {/* Só os maiores ficam à vista. Com os 19 eventos abertos, três
                linhas de chips idênticos disputavam a atenção e o olho não tinha
                onde pousar — "Rio S21K · 95" pesava o mesmo que um evento de uma
                peça só. Os pequenos continuam a um clique. */}
            {(showAllEvents ? eventSummary : eventSummary.slice(0, EVENT_CHIPS_VISIBLE)).map(ev => (
              <button
                key={ev.id || ev.name}
                onClick={() => { if (ev.id) setEventFilter([ev.id]); }}
                title={ev.id ? `Filtrar por ${ev.name}` : ev.name}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 11px', borderRadius: 999, border: '1px solid #fdba74', backgroundColor: '#fff7ed', color: '#c2410c', fontSize: 12, fontWeight: 600, cursor: ev.id ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
              >
                {ev.name}
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, padding: '0 6px', borderRadius: 999, backgroundColor: '#c2410c', color: '#ffffff', fontSize: 11, fontWeight: 800 }}>
                  {ev.count}
                </span>
              </button>
            ))}
            {eventSummary.length > EVENT_CHIPS_VISIBLE && (
              <button
                onClick={() => setShowAllEvents(v => !v)}
                data-testid="button-toggle-events"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 11px', borderRadius: 999, border: '1px dashed #d6d3d1', background: 'none', color: '#57534e', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {showAllEvents
                  ? 'Mostrar menos'
                  : `mais ${eventSummary.length - EVENT_CHIPS_VISIBLE} evento${eventSummary.length - EVENT_CHIPS_VISIBLE !== 1 ? 's' : ''}`}
                <ChevronDown style={{ width: 12, height: 12, transform: showAllEvents ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
              </button>
            )}
          </div>
        )}
        {groups.map((group, gIdx) => {
          const showEventHeader = group.event !== lastEventName;
          if (showEventHeader) lastGroupName = '';
          const showGroupHeader = !showEventHeader && group.group !== '' && group.group !== lastGroupName;
          lastEventName = group.event;
          lastGroupName = group.group;
          const allPendingInGroup = tabId === "finalizados"
            ? group.items
            : group.items.filter(i => i.status === 'awaiting_submission');
          return (
            <Fragment key={`${group.event}-${group.type}-${gIdx}`}>
              {showGroupHeader && (
                <div style={{ backgroundColor: '#dbeafe', borderRadius: 8, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, marginTop: -8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{group.group}</span>
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
                        {parseDateLocal(group.eventObj.startDate).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                    {group.eventObj?.truckDepartureDate && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: 600 }}>
                        <Truck style={{ width: 12, height: 12 }} />
                        Saída: {new Date(group.eventObj.truckDepartureDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' })} às {new Date(group.eventObj.truckDepartureDate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}
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
                        // Estes chips são o aviso de prazo — o que mais precisa ser
                        // lido no cabeçalho. Em tom claro sobre translúcido sobre o
                        // laranja, ficavam em 1.34:1 (medido no navegador): o dado
                        // mais urgente era o menos legível. Fundo sólido claro com
                        // texto escuro resolve o contraste e ainda faz o atrasado
                        // saltar do cabeçalho.
                        const s = diff < 0
                          ? { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' }
                          : diff === 0
                          ? { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' }
                          : diff <= 3
                          ? { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' }
                          : { bg: 'rgba(255,255,255,0.92)', border: 'rgba(255,255,255,0.6)', text: '#7c2d12' };
                        return (
                          <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: '3px 9px', fontSize: 11, fontWeight: 700, color: s.text, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
                            {label} · {ds}{diff >= 0 && diff <= 14 && <span style={{ opacity: 0.65, fontWeight: 500 }}> ({diff}d)</span>}
                          </span>
                        );
                      });
                    })()}
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 999, padding: '2px 9px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.92)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                      {group.items.length} {group.items.length === 1 ? 'Item' : 'Itens'}
                    </span>
                  </div>
                </div>
              )}
              {isMobile ? (
                <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.items.map((item: any) => (
                    <div key={item.id}
                      style={{ backgroundColor: '#fff', border: '1px solid #e7e5e4', borderRadius: 8, padding: '12px', marginBottom: 8, cursor: 'pointer' }}
                      onClick={() => setSelectedItem(item)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#f97316', fontSize: 13 }}>{item.displayId}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#1c1917' }}>{item.type}</div>
                      {item.description && <div style={{ fontSize: 12, color: '#57534e', marginTop: 2 }}>{item.description}</div>}
                      {item.approvalThumbUrl && <div style={{ marginTop: 6 }}>
                        <img src={item.approvalThumbUrl} alt="thumb" style={{ maxWidth: 80, maxHeight: 60, borderRadius: 6, objectFit: 'cover' }} />
                      </div>}
                      <SponsorChips sponsors={item.sponsors ?? []} variant="colored" size="sm" max={3} />
                    </div>
                  ))}
                </div>
              ) : (
              <div style={{ overflowX: 'auto' }} className="scrollbar-visible">
                {/* Cada grupo é uma tabela independente. No layout automático cada
                    uma se dimensionava pelo próprio conteúdo, então as colunas não
                    batiam entre um bloco e outro (a de ID ia de 124 a 173 px) e o
                    olho perdia o alinhamento vertical ao rolar.
                    A primeira tentativa de usar 'fixed' quebrou porque as larguras
                    declaradas eram menores que o conteúdo real — medindo na tela,
                    a coluna de ID precisa de 208 px e tinha 68 declarados. As
                    larguras de ARTE_COLS vieram dessa medição, e o colgroup as
                    aplica mesmo nas tabelas que não repetem o cabeçalho. */}
                <table style={{ width: '100%', minWidth: 1100, tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <colgroup>
                    {(tabId === "criar-aprovacoes" || tabId === "finalizados") && <col style={{ width: 44 }} />}
                    {ARTE_COLS.map((c, i) => <col key={i} style={{ width: c.w }} />)}
                  </colgroup>
                  {/* sticky: com ~71 px por linha cabem 11 na tela, e dentro de um
                      grupo grande o cabeçalho saía de vista — restavam números
                      soltos sem saber a que coluna pertenciam. Agora ele
                      acompanha a rolagem até o próximo grupo empurrá-lo. */}
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4', boxShadow: '0 1px 0 #e7e5e4' }}>
                      {(tabId === "criar-aprovacoes" || tabId === "finalizados") && (
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
                      {/* Mesma lista usada pelo colgroup — ver ARTE_COLS. */}
                      {ARTE_COLS.map((col, ci) => (
                        <th
                          key={ci}
                          style={{
                            padding: '10px 16px',
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#57534e',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            textAlign: col.right ? 'right' : 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
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
                          {(tabId === "criar-aprovacoes" || tabId === "finalizados") && (
                            <td style={{ padding: '9px 16px', width: 40 }}>
                              <Checkbox
                                checked={selectedItemIds.has(item.id)}
                                onCheckedChange={() => toggleItemSelection(item.id)}
                                data-testid={`checkbox-item-${item.id}`}
                              />
                            </td>
                          )}
                          {/* ID — whiteSpace normal e alignItems flex-start: com
                              tableLayout fixed o selo de status precisa poder
                              quebrar dentro da coluna em vez de vazar sobre a
                              vizinha. */}
                          <td style={{ padding: '9px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start' }}>
                              <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: '#57534e', fontWeight: 600 }} data-testid={`text-display-id-${item.id}`}>
                                {item.displayId}
                              </span>
                              {tabId === "finalizados" && <StatusBadge status={item.status} />}
                              {tabId === "criar-aprovacoes" && item.rejectedBySponsor && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 7px' }} data-testid={`badge-rejected-sponsor-${item.id}`}>
                                  REPROV.
                                </span>
                              )}
                              {/* Thumb salvo mas ainda NÃO enviado para aprovação (rascunho) */}
                              {tabId === "criar-aprovacoes" && item.approvalThumbUrl && !item.rejectedBySponsor && (
                                <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 7px' }} data-testid={`badge-thumb-draft-${item.id}`}>
                                  RASCUNHO
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Qtd */}
                          <td style={{ padding: '9px 16px', fontWeight: 700, color: '#1c1917', fontSize: 14 }}>
                            {String(item.quantity || '—').padStart(2, '0')}
                          </td>
                          {/* Descrição */}
                          <td style={{ padding: '9px 16px' }}>
                            {/* alignItems flex-start: num flex column o padrão é
                                stretch, e as tags "Book" e "Ref. visual" eram
                                esticadas na largura inteira da célula, parecendo
                                um campo vazio em vez de uma etiqueta. */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-start', minWidth: 0 }}>
                              {/* Com tableLayout fixed a célula não cresce com o
                                  texto: descrição longa precisa quebrar em vez de
                                  vazar por cima da coluna vizinha. */}
                              <span style={{ fontWeight: 600, color: '#1c1917', fontSize: 13, wordBreak: 'break-word' }}>{item.description || item.type}</span>
                              {item.observations && (
                                <span style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <AlertCircle style={{ width: 10, height: 10 }} />{item.observations}
                                </span>
                              )}
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência visual do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 7px' }} data-testid={`link-reference-arte-${item.id}`}>
                                  <Paperclip style={{ width: 9, height: 9 }} />
                                  Ref. visual
                                </a>
                              )}
                              {item.bookUrl && (
                                <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" title="Abrir book de aprovação (PDF) para enviar ao patrocinador" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#6d28d9', textDecoration: 'none', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 7px' }} data-testid={`link-book-arte-${item.id}`}>
                                  <FileText style={{ width: 9, height: 9 }} />
                                  Book
                                </a>
                              )}
                            </div>
                          </td>
                          {/* Dimensões */}
                          <td style={{ padding: '9px 16px', whiteSpace: 'nowrap' }}>
                            {item.visualWidth && item.visualHeight ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: '#1c1917' }}>{item.visualWidth} × {item.visualHeight}</span>
                                {item.fileWidth && item.fileHeight && (
                                  <span style={{ fontSize: 11, color: '#57534e' }}>{item.fileWidth} × {item.fileHeight} <span style={{ fontSize: 11, color: '#57534e' }}>(sangria)</span></span>
                                )}
                              </div>
                            ) : (
                              <span style={{ color: '#57534e', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          {/* m² */}
                          <td style={{ padding: '9px 16px', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 600, fontSize: 13, color: '#1c1917' }}>
                            {item.calculatedM2 || '—'}
                          </td>
                          {/* Material */}
                          <td style={{ padding: '9px 16px' }}>
                            {item.material ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{
                                  display: 'inline-block',
                                  padding: '2px 8px',
                                  backgroundColor: '#f5f5f4',
                                  color: '#57534e',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.04em',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {item.material}
                                </span>
                                {item.finish && (
                                  <span style={{ fontSize: 11, color: '#57534e' }}>{item.finish}</span>
                                )}
                              </div>
                            ) : <span style={{ color: '#57534e', fontSize: 12 }}>—</span>}
                          </td>
                          {/* ARTE — indicadores thumb / arquivo final (todas as abas) */}
                          <td style={{ padding: '9px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              {item.approvalThumbUrl ? (
                                <a href={item.approvalThumbUrl} target="_blank" rel="noopener noreferrer" title="Ver thumb" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                  <FileImage style={{ width: 13, height: 13 }} />
                                </a>
                              ) : (
                                <span title="Sem thumb" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f4', color: '#c7c3c0' }}>
                                  <FileImage style={{ width: 13, height: 13 }} />
                                </span>
                              )}
                              {item.finalFileUrl ? (
                                <a href={item.finalFileUrl} target="_blank" rel="noopener noreferrer" title="Ver arquivo final" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>
                                  <FileText style={{ width: 13, height: 13 }} />
                                </a>
                              ) : (
                                <span title="Sem arquivo final" style={{ width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f4', color: '#c7c3c0' }}>
                                  <FileText style={{ width: 13, height: 13 }} />
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Patrocinadores (todas as abas) */}
                          <td style={{ padding: '9px 16px' }}>
                            <SponsorChips sponsors={item.sponsors ?? []} variant="orange" size="sm" />
                          </td>
                          {/* Ações */}
                          <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                            {/* flexWrap: se algum dia a coluna ficar estreita de
                                novo, os botões quebram linha em vez de vazar por
                                cima do Patroc. — ver ARTE_COLS['Ações']. */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6, rowGap: 6 }}>
                              <button
                                onClick={() => handleExportItemPDF(item)}
                                data-testid={`button-export-item-pdf-${item.id}`}
                                title="Exportar prova em PDF"
                                style={{
                                  width: 34, height: 34, borderRadius: 8,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'none', border: '1px solid #e7e5e4', cursor: 'pointer',
                                  color: '#57534e', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#7c3aed'; e.currentTarget.style.borderColor = '#7c3aed'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
                              >
                                <Printer style={{ width: 14, height: 14 }} />
                              </button>
                              <button
                                onClick={() => handleViewDetails(item)}
                                data-testid={`button-view-${item.id}`}
                                title="Ver detalhes"
                                style={{
                                  width: 34, height: 34, borderRadius: 8,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'none', border: '1px solid #e7e5e4', cursor: 'pointer',
                                  color: '#57534e', transition: 'all 0.15s',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#f97316'; e.currentTarget.style.borderColor = '#f97316'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
                              >
                                <Eye style={{ width: 14, height: 14 }} />
                              </button>
                              {(tabId === "criar-aprovacoes" || tabId === "finalizar-layouts") && (() => {
                                const isSkip = tabId === "criar-aprovacoes" && item.skipApproval;
                                const bgColor = tabId === "finalizar-layouts" ? '#2563eb' : isSkip ? '#7c3aed' : '#c2410c'; // laranja da marca da 2.80:1 com texto branco e reprova AA; este da 5.18
                                const label = tabId === "finalizar-layouts" ? "Finalizar Arte" : isSkip ? "Enviar Finalização" : "Enviar Aprovação";
                                return (
                                  <button
                                    onClick={() => handleViewDetails(item)}
                                    data-testid={`button-action-${item.id}`}
                                    title={isSkip ? "Sem aprovação de patrocinador — vai direto para revisão final" : undefined}
                                    style={{
                                      height: 36, padding: '0 14px', borderRadius: 8,
                                      backgroundColor: bgColor,
                                      color: '#ffffff', border: 'none', cursor: 'pointer',
                                      fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                                      transition: 'filter 0.15s',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.08)')}
                                    onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                                  >
                                    {label}
                                  </button>
                                );
                              })()}
                              {["awaiting_submission", "sponsor_approved", "awaiting_creator_review"].includes(item.status) && (
                                <button
                                  onClick={() => { setDispenseItem(item); setDispenseReason(""); }}
                                  data-testid={`button-dispense-${item.id}`}
                                  title="Dispensar peça (liberar para produção sem aprovação)"
                                  style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'none', border: '1px solid #e7e5e4', cursor: 'pointer',
                                    color: '#57534e', transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#dc2626'; }}
                                  onMouseLeave={e => { e.currentTarget.style.color = '#a8a29e'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
                                >
                                  <Ban style={{ width: 14, height: 14 }} />
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
              )}
            </div>
            </Fragment>
          );
        })}

        {items.length > shownItems.length && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
            <button
              onClick={() => setVisibleCount(v => v + ARTE_PAGE_SIZE)}
              data-testid="button-load-more-arte"
              style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', fontSize: 12, fontWeight: 700, color: '#1c1917', cursor: 'pointer' }}
            >
              Carregar mais ({items.length - shownItems.length} restantes)
            </button>
            <span style={{ fontSize: 11, color: '#57534e' }}>
              Exibindo {shownItems.length} de {items.length} peças
            </span>
          </div>
        )}
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
          <p style={{ fontSize: 13, color: '#57534e' }}>Nenhum item aguarda nova versão de arte</p>
        </div>
      );
    }

    // Aplica os mesmos filtros globais que as outras abas usam
    const search = deferredSearch.toLowerCase();
    const baseItems = correcaoItems.filter((item: any) => {
      if (eventFilter.length > 0 && !eventFilter.includes(item.eventId)) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(item.type)) return false;
      if (materialFilter.length > 0 && !materialFilter.includes(item.material)) return false;
      if (sponsorFilter.length > 0 && !(item.sponsors ?? []).some((s: any) => sponsorFilter.includes(s.id))) return false;
      if (search) {
        const hit = [item.displayId, item.type, item.description, item.event?.name]
          .some((f: any) => f && f.toLowerCase().includes(search));
        if (!hit) return false;
      }
      return true;
    });

    if (baseItems.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <Search style={{ width: 40, height: 40, color: '#d6d3d1', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', marginBottom: 4 }}>Nenhuma correção neste filtro</p>
          <p style={{ fontSize: 13, color: '#57534e' }}>Há {correcaoItems.length} {correcaoItems.length === 1 ? 'item aguardando correção' : 'itens aguardando correção'} em outros eventos ou tipos</p>
        </div>
      );
    }

    const correcaoSponsors: { id: string; name: string; color: string }[] = [];
    const seenSponsorIds = new Set<string>();
    baseItems.forEach((item: any) => {
      (item.awaitingArteApprovals || []).forEach((a: any) => {
        if (a.sponsor && !seenSponsorIds.has(a.sponsorId)) {
          seenSponsorIds.add(a.sponsorId);
          correcaoSponsors.push({ id: a.sponsorId, name: a.sponsor.name, color: a.sponsor.color });
        }
      });
    });

    const filteredCorrecaoItems = correcaoSponsorFilter === "all"
      ? baseItems
      : baseItems.filter((item: any) => (item.awaitingArteApprovals || []).some((a: any) => a.sponsorId === correcaoSponsorFilter));

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
              <span style={{ fontSize: 11, fontWeight: 600, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filtrar:</span>
              {[{ id: "all", name: "Todos", color: "#78716c" }, ...correcaoSponsors].map(sp => {
                const isActive = correcaoSponsorFilter === sp.id;
                return (
                  <button
                    key={sp.id}
                    onClick={() => setCorrecaoSponsorFilter(sp.id)}
                    data-testid={`filter-correcao-sponsor-${sp.id}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      height: 32, padding: '0 13px', borderRadius: 999,
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

        {/* Correction cards */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(460px, 1fr))', gap: 16 }}>
          {filteredCorrecaoItems.map((item: any) => {
            const approvalsToShow = correcaoSponsorFilter === "all"
              ? item.awaitingArteApprovals
              : item.awaitingArteApprovals.filter((a: any) => a.sponsorId === correcaoSponsorFilter);
            const isImage = item.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl) || item.approvalThumbUrl.startsWith('/objects/'));
            const groupLabel = groupOf(item.type);
            return (
              <div
                key={item.id}
                data-testid={`card-correcao-${item.id}`}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #fecaca',
                  borderRadius: 12,
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: '0 2px 16px rgba(186,26,26,0.07), 0 0 0 1px rgba(186,26,26,0.06)',
                }}
              >
                {/* ── Dark header strip ── */}
                <div style={{ background: 'linear-gradient(135deg, #1c0a0a 0%, #2d1010 60%, #1e1410 100%)', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 8, position: 'relative', overflow: 'hidden', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 90% 50%, rgba(220,38,38,0.1) 0%, transparent 60%)', pointerEvents: 'none' }} />
                  {/* Status badge */}
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5', background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(252,165,165,0.25)', borderRadius: 6, padding: '2px 8px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0, zIndex: 1 }}>
                    Recusado
                  </span>
                  {/* Divider */}
                  <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0, zIndex: 1 }} />
                  {/* Group + type */}
                  <div style={{ flex: 1, minWidth: 0, zIndex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                      {groupLabel && <span style={{ fontSize: 11, color: 'rgba(252,165,165,0.6)', fontWeight: 600, flexShrink: 0 }}>{groupLabel}</span>}
                      {groupLabel && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>›</span>}
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: '"Space Grotesk", sans-serif' }}>{item.type}</span>
                      {item.description && item.description !== item.type && (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>— {item.description}</span>
                      )}
                    </div>
                  </div>
                  {/* ID chip */}
                  <span style={{ fontFamily: '"Space Grotesk", monospace', fontSize: 11, fontWeight: 800, color: 'rgba(252,165,165,0.8)', background: 'rgba(220,38,38,0.15)', border: '1px solid rgba(252,165,165,0.2)', borderRadius: 6, padding: '2px 8px', flexShrink: 0, zIndex: 1 }}>{item.displayId}</span>
                </div>

                {/* ── Body ── */}
                <div style={{ padding: '16px 18px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 14 }}>
                  {/* Thumb */}
                  <div style={{ width: isMobile ? '100%' : 80, height: isMobile ? 120 : 80, borderRadius: 8, backgroundColor: '#fef2f2', border: '1px solid #fecaca', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isImage ? (
                      <img src={item.approvalThumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : item.approvalThumbUrl ? (
                      <a href={item.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#ba1a1a' }}>
                        <FileText style={{ width: 22, height: 22 }} />
                        <span style={{ fontSize: 11, fontWeight: 600 }}>PDF</span>
                      </a>
                    ) : (
                      <FileImage style={{ width: 22, height: 22, color: '#fca5a5' }} />
                    )}
                  </div>

                  {/* Rejection reasons */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {approvalsToShow.map((approval: any) => (
                      <div key={approval.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #fecaca' }}>
                        {/* Sponsor bar */}
                        <div style={{ background: '#fff1f1', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: approval.rejectionReason ? '1px solid #fecaca' : 'none' }}>
                          {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b', flex: 1 }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                          {/* Log: quem + quando */}
                          {(approval.rejectedBy || approval.rejectedAt) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                              {approval.rejectedBy && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: '#6b7280', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={approval.rejectedBy}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                                  {approval.rejectedBy.split(' ')[0]}
                                </span>
                              )}
                              {approval.rejectedBy && approval.rejectedAt && <span style={{ color: '#d1ccc8', fontSize: 11 }}>·</span>}
                              {approval.rejectedAt && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 11, fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap' }}>
                                  <Clock style={{ width: 9, height: 9, flexShrink: 0 }} />
                                  {(() => { const d = new Date(approval.rejectedAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {/* Reason */}
                        {approval.rejectionReason && (
                          <div style={{ background: '#fffafa', padding: '8px 12px' }}>
                            <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>"{approval.rejectionReason}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Footer ── */}
                <div style={{ padding: '12px 18px', borderTop: '1px solid #fef2f2', display: 'flex', alignItems: 'center', gap: 10, background: '#fffafa', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => {
                      setCorrecaoItem(item);
                      setCorrecaoThumbUrl("");
                      setCorrecaoFileName("");
                      setCorrecaoSelectedSponsorIds(new Set(item.awaitingArteApprovals.map((a: any) => a.sponsorId)));
                    }}
                    data-testid={`button-open-correcao-${item.id}`}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                      color: '#ffffff', border: 'none',
                      borderRadius: 8, minHeight: 44, height: 44, padding: '0 18px',
                      fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      fontFamily: '"Space Grotesk", sans-serif',
                      letterSpacing: '-0.01em',
                      transition: 'filter 0.15s, transform 0.1s',
                      boxShadow: '0 2px 8px rgba(185,28,28,0.25)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.93)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                    onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
                    onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <Send style={{ width: 13, height: 13 }} />
                    Enviar Nova Arte
                  </button>
                  {item.approvalThumbUrl && (
                    <a
                      href={item.approvalThumbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        fontSize: 11, fontWeight: 600, color: '#57534e',
                        textDecoration: 'none', transition: 'color 0.15s',
                        padding: '0 12px', minHeight: 44, height: 44, borderRadius: 8,
                        border: '1px solid #ebe8e3', background: '#ffffff',
                        whiteSpace: 'nowrap',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#44403c'; (e.currentTarget as HTMLElement).style.borderColor = '#c7c3be'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#a8a29e'; (e.currentTarget as HTMLElement).style.borderColor = '#ebe8e3'; }}
                    >
                      <Eye style={{ width: 12, height: 12 }} />
                      Ver versão
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

  const statCardTabMap: Record<string, string> = {
    "stat-pending": "criar-aprovacoes",
    "stat-awaiting-sponsor": "aguardando-patrocinador",
    "stat-sponsor-approved": "finalizar-layouts",
    "stat-ready-production": "finalizados",
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── STICKY HEADER ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 40,
        background: '#ffffff',
        borderBottom: '1px solid #e7e5e4',
        flexShrink: 0,
      }}>
        <div style={{ padding: isMobile ? '12px 12px 0' : '20px 32px 0', maxWidth: 1600, margin: '0 auto' }}>

          {/* ── Identity + actions ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #ea580c, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 1px rgba(249,115,22,0.4), 0 8px 24px rgba(234,88,12,0.45)' }}>
                <Palette style={{ width: 24, height: 24, color: '#fff' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1c1917', letterSpacing: '-0.05em', margin: 0, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.1 }}>
                    Módulo Arte
                  </h1>
                  {(pendingCount + correcaoCount + needsFinalFileCount) > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, backgroundColor: '#fff7ed', border: '1px solid #fed7aa', fontSize: 11, fontWeight: 700, color: '#c2410c' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f97316', display: 'inline-block' }} />
                      {pendingCount + correcaoCount + needsFinalFileCount} em andamento
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 11, fontWeight: 700, color: '#15803d' }}>
                      Tudo em dia
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#57534e', margin: 0, marginTop: 3 }}>
                  Aprovações · Correções · Finalizações de layout
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              {/* divider */}
              <div style={{ width: 1, height: 20, background: '#e7e5e4', margin: '0 2px' }} />
              <button
                onClick={handleClickExportButton}
                data-testid="button-export-pdf"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'border-color 0.12s' }}
              >
                <Printer style={{ width: 12, height: 12, color: '#57534e' }} />
                {selectedItemIds.size > 0 ? `Exportar ${selectedItemIds.size} sel.` : 'Exportar PDF'}
              </button>
              <button
                onClick={openBookModal}
                data-testid="button-upload-book"
                title="Subir o PDF do book (layout pronto) e escolher as peças"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'border-color 0.12s' }}
              >
                <FileText style={{ width: 12, height: 12, color: '#7c3aed' }} />
                Subir book
              </button>
              {activeTab === "criar-aprovacoes" && (
                <label
                  data-testid="button-open-bulk-thumb"
                  style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', transition: 'border-color 0.12s' }}
                >
                  <FileImage style={{ width: 12, height: 12, color: '#16a34a' }} />
                  Multi-Upload Thumbs
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
                </label>
              )}
              {activeTab === "criar-aprovacoes" && (
                <button
                  onClick={() => setShowBulkDialog(true)}
                  disabled={selectedItemIds.size === 0}
                  data-testid="button-open-bulk-upload"
                  // Botão desabilitado sem dizer por quê deixa o usuário achando
                  // que está quebrado; o título explica a condição que o libera.
                  title={selectedItemIds.size > 0
                    ? `Vincular um PDF a ${selectedItemIds.size} peça(s) selecionada(s)`
                    : 'Selecione ao menos uma peça para vincular um PDF compartilhado'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: selectedItemIds.size > 0 ? '#44403c' : '#c4bfbb', fontSize: 13, fontWeight: 600, cursor: selectedItemIds.size > 0 ? 'pointer' : 'not-allowed', transition: 'border-color 0.12s', opacity: selectedItemIds.size > 0 ? 1 : 0.6 }}
                >
                  <Upload style={{ width: 12, height: 12, color: selectedItemIds.size > 0 ? '#2563eb' : '#c4bfbb' }} />
                  {selectedItemIds.size > 0 ? `PDF Compartilhado (${selectedItemIds.size})` : 'PDF Compartilhado'}
                </button>
              )}
            </div>
          </div>

          {/* ── Stat cards — light ── */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
            {statCards.map(stat => {
              const Icon = stat.Icon;
              const targetTab = statCardTabMap[stat.testId];
              const isActiveCard = !!(targetTab && activeTab === targetTab);
              const totalAll = pendingCount + correcaoCount + needsFinalFileCount + finalizadosCount;
              const pct = totalAll > 0 ? (stat.value / totalAll) * 100 : 0;
              return (
                <div
                  key={stat.testId}
                  onClick={() => targetTab && changeTab(targetTab)}
                  data-testid={stat.testId}
                  onMouseEnter={e => { if (targetTab && !isActiveCard) { (e.currentTarget as HTMLElement).style.background = `${stat.accentColor}0d`; (e.currentTarget as HTMLElement).style.borderColor = `${stat.accentColor}40`; } }}
                  onMouseLeave={e => { if (targetTab && !isActiveCard) { (e.currentTarget as HTMLElement).style.background = '#fafaf9'; (e.currentTarget as HTMLElement).style.borderColor = '#e7e5e4'; } }}
                  style={{
                    flex: 1, padding: '14px 16px 12px', borderRadius: 12,
                    background: isActiveCard ? `${stat.accentColor}08` : '#fafaf9',
                    border: `1px solid ${isActiveCard ? `${stat.accentColor}30` : '#e7e5e4'}`,
                    cursor: targetTab ? 'pointer' : 'default',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: 'none',
                    transition: 'background 0.12s, border-color 0.12s',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {/* top accent — always visible, brighter when tab is active */}
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stat.accentColor, opacity: isActiveCard ? 1 : stat.value > 0 ? 0.45 : 0.18, borderRadius: '12px 12px 0 0' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: isActiveCard ? stat.accentColor : stat.value > 0 ? '#44403c' : '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stat.label}</span>
                    <span style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: stat.value > 0 ? `${stat.accentColor}18` : stat.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon style={{ width: 13, height: 13, color: stat.value > 0 ? stat.accentColor : '#c4bfbb' }} />
                    </span>
                  </div>
                  <span style={{ fontSize: 34, fontWeight: 800, color: isActiveCard ? stat.accentColor : stat.value > 0 ? '#1c1917' : '#b8b4b0', letterSpacing: '-0.05em', lineHeight: 1, fontFamily: '"Space Grotesk",sans-serif' }}>
                    {stat.value}
                  </span>
                  <div style={{ fontSize: 11, color: stat.value > 0 ? '#78716c' : '#b8b4b0' }}>{stat.sub}</div>
                  <div style={{ height: 3, borderRadius: 6, backgroundColor: '#e7e5e4', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: stat.accentColor, borderRadius: 6 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Filter Row 1: search + dropdowns + period ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
              <Search style={{ width: 14, height: 14, color: '#57534e', position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Buscar arte, ID ou projeto..."
                data-testid="input-search-filter"
                style={{ width: '100%', height: 36, paddingLeft: 30, paddingRight: 10, borderRadius: 8, border: searchFilter ? '1px solid #f97316' : '1px solid #e7e5e4', backgroundColor: '#ffffff', color: '#1c1917', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <EventFilterDropdown
              values={eventFilter}
              onValuesChange={setEventFilter}
              options={eventFilterOptions}
            />

            <FilterSelect
              label="Patrocinador" allLabel="Todos os patrocinadores"
              values={sponsorFilter} onValuesChange={setSponsorFilter}
              options={sponsorFilterOptions}
              searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
              testId="select-sponsor-filter"
            />

            <FilterSelect
              label="Tipo de Peça" allLabel="Todos os tipos"
              values={typeFilter} onValuesChange={setTypeFilter}
              options={typeFilterOptions}
              searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
              testId="select-type-filter"
            />

            <FilterSelect
              label="Material" allLabel="Todos os materiais"
              values={materialFilter} onValuesChange={setMaterialFilter}
              options={materialFilterOptions}
              searchPlaceholder="Buscar material..." emptyText="Nenhum material encontrado."
              testId="select-material-filter"
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px', borderRadius: 8, background: '#f5f5f4', border: '1px solid #e7e5e4' }}>
              {['Hoje', '7 dias', '15 dias', '30 dias', 'Todos'].map(p => (
                <button key={p} onClick={() => setPeriodFilter(p)}
                  style={{ height: 30, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: periodFilter === p ? 700 : 500, background: periodFilter === p ? '#ffffff' : 'transparent', color: periodFilter === p ? '#1c1917' : '#78716c', boxShadow: periodFilter === p ? '0 1px 3px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.12s' }}>
                  {p}
                </button>
              ))}
            </div>

            <button
              onClick={() => setNext10DaysFilter(!next10DaysFilter)}
              data-testid="button-next-10-days-filter"
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 36, padding: '0 12px', borderRadius: 999, border: next10DaysFilter ? 'none' : '1px solid #d6d3d1', background: next10DaysFilter ? '#1c1917' : 'transparent', color: next10DaysFilter ? '#ffffff' : '#57534e', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
            >
              <Truck style={{ width: 12, height: 12 }} /> Saída 10 dias
            </button>
          </div>

          {/* ── Filter Row 2: boolean toggles ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap', borderTop: '1px solid #f0efee', paddingTop: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Mostrar:</span>
            {([
              { key: 'urgente', label: 'Urgente', value: urgenteFilter, set: setUrgenteFilter, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
              { key: 'semThumb', label: 'Sem thumb', value: semThumb, set: setSemThumb, color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
              { key: 'comThumb', label: 'Com thumb', value: comThumb, set: setComThumb, color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
              { key: 'semFinal', label: 'Sem arq. final', value: semFinal, set: setSemFinal, color: '#0369a1', bg: '#f0f9ff', border: '#7dd3fc' },
              { key: 'comFinal', label: 'Com arq. final', value: comFinal, set: setComFinal, color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
            ] as { key: string; label: string; value: boolean; set: (v: boolean) => void; color: string; bg: string; border: string }[]).map(({ key, label, value, set, color, bg, border }) => (
              <button key={key} onClick={() => set(!value)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.14s', border: value ? `1px solid ${border}` : '1px solid transparent', background: value ? bg : '#ede9e4', color: value ? color : '#78716c' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: value ? color : '#d6d3d1', flexShrink: 0 }} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Active chips ── */}
          {activeChips.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#57534e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ativos:</span>
              {activeChips.map(chip => (
                <span key={chip} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 11, fontWeight: 600, color: '#c2410c' }}>
                  {chip}
                  <button onClick={() => removeChipFilter(chip)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c2410c', display: 'inline-flex', alignItems: 'center', padding: 0 }}>
                    <X style={{ width: 9, height: 9 }} />
                  </button>
                </span>
              ))}
              <button onClick={clearAllFilters} data-testid="button-clear-filters" style={{ fontSize: 11, fontWeight: 600, color: '#57534e', background: 'none', border: '1px solid #e7e5e4', borderRadius: 999, cursor: 'pointer', padding: '3px 10px' }}>
                Limpar tudo
              </button>
            </div>
          )}

          {/* ── Tabs + select all ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              {tabs.map(tab => {
                const isActive = activeTab === tab.id;
                const tabColors: Record<string, string> = {
                  "criar-aprovacoes": "#f97316",
                  "correcao": "#ef4444",
                  "finalizar-layouts": "#06b6d4",
                  "finalizados": "#22c55e",
                };
                const accent = tabColors[tab.id] || '#f97316';
                const tabIcons: Record<string, any> = {
                  "criar-aprovacoes": Send,
                  "correcao": RotateCcw,
                  "finalizar-layouts": FileCheck,
                  "finalizados": CheckCircle,
                };
                const TabIcon = tabIcons[tab.id];
                return (
                  <button
                    key={tab.id}
                    onClick={() => changeTab(tab.id)}
                    data-testid={tab.testId}
                    style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', border: 'none', cursor: 'pointer', borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent', marginBottom: -1, background: isActive ? `${accent}0d` : 'transparent', color: isActive ? accent : '#78716c', fontWeight: isActive ? 700 : 500, fontSize: 13, whiteSpace: 'nowrap', borderRadius: '6px 6px 0 0', transition: 'all 0.14s' }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = '#1c1917'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = '#78716c'; }}
                  >
                    {TabIcon && <TabIcon style={{ width: 13, height: 13, flexShrink: 0 }} />}
                    {tab.label}
                    {tab.count > 0 && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 999, fontSize: 11, fontWeight: 700, padding: '0 5px', backgroundColor: isActive ? accent : '#e7e5e4', color: isActive ? '#fff' : '#78716c' }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {(activeTab === "criar-aprovacoes" || activeTab === "finalizados") && filteredItems.length > 0 && (
              <button
                onClick={() => {
                  if (selectedItemIds.size === filteredItems.length) setSelectedItemIds(new Set());
                  else setSelectedItemIds(new Set(filteredItems.map((i: any) => i.id)));
                }}
                data-testid="button-select-all"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 13px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {selectedItemIds.size === filteredItems.length && filteredItems.length > 0
                  ? <><X style={{ width: 11, height: 11 }} /> Limpar seleção</>
                  : <><CheckSquare style={{ width: 11, height: 11 }} /> Selecionar tudo</>
                }
                {selectedItemIds.size > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 999, fontSize: 10, fontWeight: 700, backgroundColor: '#1c1917', color: '#ffffff', padding: '0 5px' }}>
                    {selectedItemIds.size}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. SCROLLABLE CONTENT AREA ────────────────────────────────────── */}
      <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 12px' : '24px 32px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
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
      {/* MODAL 0 — DISPENSAR PEÇA                                           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!dispenseItem} onOpenChange={(open) => { if (!open) { setDispenseItem(null); setDispenseReason(""); } }}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 420, width: '95vw', borderRadius: 16, backgroundColor: '#ffffff', border: 'none', boxShadow: MODAL_SHADOW }}>
          <DialogTitle className="sr-only">Dispensar Peça</DialogTitle>
          <DialogDescription className="sr-only">Dispensar peça da fila de arte</DialogDescription>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ display: 'inline-block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: '#dc2626', backgroundColor: 'rgba(255,218,214,0.5)', padding: '2px 9px', borderRadius: 6, marginBottom: 6 }}>Ação Irreversível</span>
                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: 0 }}>Dispensar Peça</h2>
              </div>
              <button onClick={() => { setDispenseItem(null); setDispenseReason(""); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#57534e', padding: 2, borderRadius: 6 }}>
                <X style={{ width: 20, height: 20 }} />
              </button>
            </div>
            {dispenseItem && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10 }}>
                <Ban style={{ width: 16, height: 16, color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#7f1d1d', margin: '0 0 2px' }}>{dispenseItem.displayId} — {dispenseItem.type}</p>
                  <p style={{ fontSize: 11, color: '#991b1b', margin: 0 }}>A peça será liberada diretamente para produção, pulando as etapas de aprovação de patrocinador e revisão.</p>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e' }}>Motivo (opcional)</label>
              <textarea
                value={dispenseReason}
                onChange={e => setDispenseReason(e.target.value)}
                placeholder="Ex: Peça sem necessidade de aprovação de patrocinador..."
                data-testid="textarea-dispense-reason"
                style={{ width: '100%', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 12px', fontSize: 12, resize: 'none', height: 72, fontFamily: 'inherit', color: '#1c1917', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setDispenseItem(null); setDispenseReason(""); }} style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', color: '#57534e', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => dispenseItem && dispenseMutation.mutate({ itemId: dispenseItem.id, reason: dispenseReason })}
                disabled={dispenseMutation.isPending}
                data-testid="button-confirm-dispense"
                style={{ flex: 1, height: 40, borderRadius: 8, backgroundColor: '#dc2626', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: dispenseMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: dispenseMutation.isPending ? 0.7 : 1 }}
              >
                {dispenseMutation.isPending ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Dispensando...</> : <><Ban style={{ width: 14, height: 14 }} />Dispensar Peça</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1 — CORREÇÃO: Enviar Nova Arte                               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!correcaoItem} onOpenChange={(open) => {
        if (!open) { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoFileName(""); setCorrecaoSelectedSponsorIds(new Set()); }
      }}>
        <DialogContent className="p-0 gap-0 max-h-[90vh] overflow-y-auto" style={{ maxWidth: 472, width: '95vw', borderRadius: 16, backgroundColor: '#ffffff', border: 'none', boxShadow: MODAL_SHADOW }}>
          <DialogTitle className="sr-only">Enviar Nova Arte</DialogTitle>
          <DialogDescription className="sr-only">Reenvio de arte para patrocinadores</DialogDescription>

          {/* ── Dark header ── */}
          <div style={{ background: 'linear-gradient(135deg, #1c0a0a 0%, #2d1010 50%, #1c1917 100%)', borderRadius: '16px 16px 0 0', padding: '22px 28px 20px', position: 'relative', overflow: 'hidden' }}>
            {/* Subtle texture */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 20%, rgba(220,38,38,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
            {/* Close button */}
            <button
              onClick={() => { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoFileName(""); setCorrecaoSelectedSponsorIds(new Set()); }}
              style={{ position: 'absolute', top: 14, right: 14, width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s', zIndex: 2 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              aria-label="Fechar"
            >
              <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.75)' }} />
            </button>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative' }}>
              {/* Icon */}
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #dc2626, #991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(220,38,38,0.35)' }}>
                <AlertTriangle style={{ width: 20, height: 20, color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#fca5a5', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 3 }}>Ação Necessária</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.04em', fontFamily: '"Space Grotesk", sans-serif', color: '#fff', margin: 0, lineHeight: 1.2 }}>
                  Enviar Nova Arte
                </h2>
                {correcaoItem && (
                  <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {correcaoItem.displayId && <span style={{ fontFamily: '"Space Grotesk", monospace', fontWeight: 700, color: 'rgba(252,165,165,0.75)', marginRight: 6 }}>{correcaoItem.displayId}</span>}
                      <span style={{ fontWeight: 600 }}>{correcaoItem.type}</span>
                      {correcaoItem.description && correcaoItem.description !== correcaoItem.type && <span style={{ color: 'rgba(255,255,255,0.3)' }}> · {correcaoItem.description}</span>}
                    </div>
                    {correcaoItem.event?.name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.38)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <span>{correcaoItem.event.name}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: '20px 24px 0' }}>
            {correcaoItem && (
              <>
                {/* Rejection cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {correcaoItem.awaitingArteApprovals.map((approval: any) => (
                    <div key={approval.id} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid #fecaca' }}>
                      {/* Sponsor bar */}
                      <div style={{ backgroundColor: '#fff1f1', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #fecaca' }}>
                        {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 7px', letterSpacing: '0.04em' }}>RECUSADO</span>
                      </div>
                      {/* Reason */}
                      <div style={{ backgroundColor: '#fffafa', padding: '10px 14px 8px' }}>
                        <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0, lineHeight: 1.55, fontStyle: approval.rejectionReason ? 'italic' : 'normal' }}>
                          {approval.rejectionReason ? `"${approval.rejectionReason}"` : <span style={{ color: '#b45309', fontStyle: 'normal' }}>Sem motivo informado.</span>}
                        </p>
                        {(approval.rejectedBy || approval.rejectedAt) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                            {approval.rejectedBy && (
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#dc2626', background: 'rgba(220,38,38,0.08)', borderRadius: 6, padding: '2px 7px' }}>
                                {approval.rejectedBy}
                              </span>
                            )}
                            {approval.rejectedAt && (
                              <span style={{ fontSize: 11, color: '#b45309' }}>
                                {new Date(approval.rejectedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload zone */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#57534e', marginBottom: 8 }}>
                    Nova Versão
                  </label>
                  {correcaoThumbUrl ? (
                    /* Uploaded state — compact pill row */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, backgroundColor: '#f0fdf4', border: '1.5px solid #86efac' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #16a34a, #15803d)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {/\.(png|jpg|jpeg|gif|webp)/i.test(correcaoThumbUrl)
                          ? <img src={correcaoThumbUrl} alt="" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 8 }} />
                          : <FileText style={{ width: 15, height: 15, color: '#fff' }} />
                        }
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>Arquivo enviado</div>
                        {correcaoFileName && (
                          <div style={{ fontSize: 11, color: '#4ade80', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={correcaoFileName}>{correcaoFileName}</div>
                        )}
                      </div>
                      <button
                        onClick={() => { setCorrecaoThumbUrl(""); setCorrecaoFileName(""); }}
                        data-testid="button-remove-correcao-thumb"
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 6, color: '#166534', fontSize: 11, fontWeight: 600, padding: '4px 10px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
                      >
                        <X style={{ width: 11, height: 11 }} /> Trocar
                      </button>
                    </div>
                  ) : (
                    /* Empty state */
                    <div style={{
                      height: 130, border: isPasteUploading ? '2px dashed #dc2626' : '2px dashed #e2e0dd', borderRadius: 12,
                      backgroundColor: isPasteUploading ? '#fff5f5' : '#fafaf9', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 2, transition: 'all 0.15s', cursor: 'default'
                    }}
                      onMouseEnter={e => { if (!isPasteUploading) { (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f5f4'; (e.currentTarget as HTMLElement).style.borderColor = '#c7c3be'; } }}
                      onMouseLeave={e => { if (!isPasteUploading) { (e.currentTarget as HTMLElement).style.backgroundColor = '#fafaf9'; (e.currentTarget as HTMLElement).style.borderColor = '#e2e0dd'; } }}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                        {isPasteUploading
                          ? <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2.5px solid #fecaca', borderTopColor: '#dc2626', animation: 'spin 0.8s linear infinite' }} />
                          : <Upload style={{ width: 18, height: 18, color: '#dc2626' }} />
                        }
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: '#44403c', margin: 0 }}>
                        {isPasteUploading ? 'Enviando...' : 'Arraste ou'}
                      </p>
                      {!isPasteUploading && (
                        <FileUploader
                          onGetUploadParameters={getUploadUrl}
                          onFileSelect={(file) => { setCorrecaoFileName(file.name); }}
                          onComplete={(result) => { setCorrecaoThumbUrl(convertGCSUrlToLocalPath(result.url)); }}
                          accept="image/*,application/pdf"
                          data-testid="uploader-correcao-thumb"
                          buttonVariant="ghost"
                          buttonClassName="h-auto py-0 px-0 text-[12px] font-semibold underline decoration-2 underline-offset-2 text-red-700 hover:bg-transparent"
                        >
                          escolha um arquivo
                        </FileUploader>
                      )}
                      <p style={{ fontSize: 11, color: '#b8b3ad', margin: '3px 0 0' }}>
                        {isPasteUploading ? 'Aguarde...' : 'PDF, PNG, SVG · ou Ctrl+V para colar'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sponsor checkboxes */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#57534e', marginBottom: 8 }}>
                    Re-enviar para aprovação
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {correcaoItem.awaitingArteApprovals.map((approval: any) => {
                      const isSelected = correcaoSelectedSponsorIds.has(approval.sponsorId);
                      return (
                        <label
                          key={approval.sponsorId}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 12, cursor: 'pointer', userSelect: 'none',
                            backgroundColor: isSelected ? '#fff5f5' : '#fafaf9',
                            border: `1.5px solid ${isSelected ? '#fecaca' : '#ebe8e3'}`,
                            transition: 'all 0.12s'
                          }}
                        >
                          {/* Custom checkbox */}
                          <div
                            style={{ width: 18, height: 18, borderRadius: 6, flexShrink: 0, border: `2px solid ${isSelected ? '#dc2626' : '#d4d4d0'}`, background: isSelected ? '#dc2626' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                            onClick={() => {
                              const next = new Set(correcaoSelectedSponsorIds);
                              if (isSelected) next.delete(approval.sponsorId); else next.add(approval.sponsorId);
                              setCorrecaoSelectedSponsorIds(next);
                            }}
                          >
                            {isSelected && <Check style={{ width: 10, height: 10, color: '#fff' }} />}
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const next = new Set(correcaoSelectedSponsorIds);
                              if (e.target.checked) next.add(approval.sponsorId); else next.delete(approval.sponsorId);
                              setCorrecaoSelectedSponsorIds(next);
                            }}
                            data-testid={`checkbox-correcao-sponsor-${approval.sponsorId}`}
                            style={{ display: 'none' }}
                          />
                          {approval.sponsor?.color && (
                            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? '#7f1d1d' : '#44403c', flex: 1, transition: 'color 0.12s' }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 8px', letterSpacing: '0.04em' }}>
                            Pendente
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #f0eeec' }}>
            <button
              disabled={!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending}
              onClick={() => {
                if (correcaoItem) {
                  resubmitMutation.mutate({ itemId: correcaoItem.id, newThumbUrl: correcaoThumbUrl, sponsorIds: Array.from(correcaoSelectedSponsorIds) });
                }
              }}
              data-testid="button-submit-correcao"
              style={{
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                // Vermelho é a cor do problema (a recusa), não da solução. Enviar
                // a arte corrigida é a ação construtiva do modal e usa o laranja
                // de ação do app — o mesmo dos outros botões primários da tela.
                // Desabilitado em rosa claro com texto branco dava ~2:1; agora usa
                // o cinza padrão, legível.
                background: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending)
                  ? '#e7e5e4'
                  : 'linear-gradient(135deg, #ea580c, #c2410c)',
                color: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? '#57534e' : '#ffffff',
                fontWeight: 700, fontSize: 15,
                fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em',
                cursor: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? 'not-allowed' : 'pointer',
                boxShadow: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? 'none' : '0 4px 16px rgba(194,65,12,0.28)',
                transition: 'filter 0.15s, transform 0.1s, box-shadow 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
              }}
              onMouseEnter={e => { if (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) return; e.currentTarget.style.filter = 'brightness(0.93)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.985)'; }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {resubmitMutation.isPending ? (
                <><div style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Enviando...</>
              ) : (
                <><Send style={{ width: 15, height: 15 }} />Confirmar Re-envio</>
              )}
            </button>
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
        topActions={selectedItem && (['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) || (selectedItem.finalFileUrl && ['awaiting_final_review', 'ready_for_production', 'inProduction', 'produced', 'conferred', 'delivered'].includes(selectedItem.status))) ? (
          <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Section header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 18, letterSpacing: '-0.02em', textTransform: 'uppercase', color: '#1c1917', margin: 0 }}>
                {['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'Finalização de Layout' : 'Substituir Arquivo Final'}
              </h3>
              <span style={{ fontSize: 11, backgroundColor: ['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? '#dcfce7' : '#fef9c3', color: ['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? '#15803d' : '#a16207', padding: '2px 9px', borderRadius: 6, fontWeight: 700 }}>
                {['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? 'FASE FINAL' : 'CORREÇÃO'}
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
                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(url) || selectedItem.approvalThumbUrl.startsWith('/objects/');
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
                      <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: '#16a34a', textDecoration: 'underline' }}>
                        Clique para visualizar
                      </a>
                    </div>

                    {/* Trocar o thumb sem reabrir a aprovação */}
                    <FileUploader
                      onGetUploadParameters={getUploadUrl}
                      onComplete={(result) => updateThumbMutation.mutate({
                        itemId: selectedItem.id,
                        approvalThumbUrl: convertGCSUrlToLocalPath(result.url),
                      })}
                      accept="image/*,application/pdf"
                      data-testid="uploader-update-thumb"
                      buttonVariant="ghost"
                      buttonClassName="h-auto py-1 px-2 text-[10px] font-bold uppercase tracking-wider text-green-800 underline decoration-2 underline-offset-2 hover:bg-transparent shrink-0"
                    >
                      {updateThumbMutation.isPending ? 'Enviando…' : 'Trocar thumb'}
                    </FileUploader>
                  </div>
                );
              })()}

              {/* Thumb anterior — gravado quando a Arte troca o thumb aprovado */}
              {selectedItem.previousApprovalThumbUrl && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em' }}>⚠ Thumb substituído — versão anterior guardada</span>
                  <a href={selectedItem.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#57534e', wordBreak: 'break-all', textDecoration: 'underline' }}>
                    {selectedItem.previousApprovalThumbUrl.split('/').pop() || selectedItem.previousApprovalThumbUrl}
                  </a>
                </div>
              )}

              {/* Arquivo anterior — exibido quando Arte substitui o arquivo enviado */}
              {selectedItem.previousFinalFileUrl && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.07em' }}>⚠ Substituindo — arquivo anterior gravado</span>
                  <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#57534e', wordBreak: 'break-all' }}>
                    {selectedItem.previousFinalFileName || selectedItem.previousFinalFileUrl}
                  </span>
                </div>
              )}

              {/* Caminho do arquivo final (rede) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgba(20,83,45,0.6)', paddingLeft: 4 }}>
                  Caminho do Arquivo Final
                </label>
                <div style={{ position: 'relative' }}>
                  <FolderOpen style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#16a34a' }} />
                  <Input
                    id="finalFilePath"
                    placeholder="Cole o caminho do ARQUIVO (com nome e extensão)…"
                    value={finalFileUrl}
                    onChange={(e) => { setFinalFileUrl(e.target.value); setFinalDirty(true); }}
                    data-testid="input-final-file-path"
                    style={{ paddingLeft: 36, paddingRight: 16, paddingTop: 12, paddingBottom: 12, background: '#ffffff', border: 'none', boxShadow: '0 0 0 1px #bbf7d0', borderRadius: 8, fontSize: 12, fontWeight: 500 }}
                  />
                </div>
                {finalFileUrl.trim() && (
                  fileNameFromPath(finalFileUrl)
                    ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: '#15803d', paddingLeft: 4 }}>
                        <FileCheck style={{ width: 13, height: 13, flexShrink: 0 }} />
                        Arquivo: <span style={{ fontFamily: "'DM Mono', monospace" }}>{fileNameFromPath(finalFileUrl)}</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, fontWeight: 600, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '7px 10px' }}>
                        <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
                        <span>Isto parece uma <b>pasta</b>. Cole o caminho do <b>arquivo específico</b> (com nome e extensão, ex.: …\Rolo_Ministerio.tif) para a gráfica não pegar o arquivo errado.</span>
                      </div>
                    )
                )}
              </div>

              {/* CTA button */}
              <button
                onClick={handleSubmitFinalFile}
                disabled={submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)}
                data-testid="button-submit-final"
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 8, border: 'none',
                  backgroundColor: (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? '#fcd9b7' : '#fd761a',
                  color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 900,
                  fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.15em',
                  cursor: (submitFinalFileMutation.isPending || !finalFileUrl || (!!selectedItem.finalFileUrl && !finalDirty)) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: '0 4px 16px rgba(253,118,26,0.2)', transition: 'filter 0.15s, transform 0.1s'
                }}
                onMouseEnter={e => { if (submitFinalFileMutation.isPending || !finalFileUrl) return; e.currentTarget.style.filter = 'brightness(0.92)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
              >
                {submitFinalFileMutation.isPending ? 'Enviando...' : (selectedItem.finalFileUrl ? 'Atualizar arquivo' : 'Enviar para Revisão')}
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
                  <span title="Obrigatório para enviar à aprovação" style={{ fontSize: 11, backgroundColor: 'rgba(220,38,38,0.08)', color: '#b91c1c', padding: '2px 9px', borderRadius: 6, fontWeight: 700, letterSpacing: '0.03em' }}>
                    OBRIGATÓRIO
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
                          <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6, lineHeight: 1 }}>
                            Carregado
                          </span>
                          <span style={{ fontSize: 11, color: 'rgba(59,7,100,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
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

                    {/* Salvar thumb sem enviar (rascunho) */}
                    {savedApprovalThumbUrl && savedApprovalThumbUrl === approvalThumbUrl ? (
                      <div
                        data-testid="thumb-saved-confirmation"
                        style={{
                          width: '100%', padding: '12px 0', borderRadius: 8,
                          border: thumbJustSaved ? '1px solid #86efac' : '1px solid #bbf7d0',
                          background: thumbJustSaved ? '#dcfce7' : '#f0fdf4',
                          color: '#15803d', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                          fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          marginBottom: 8,
                          transition: 'background 0.4s ease, border-color 0.4s ease',
                          animation: thumbJustSaved ? 'thumb-saved-pop 0.25s ease' : 'none',
                        }}
                      >
                        <CheckCircle style={{ width: 15, height: 15 }} />
                        {thumbJustSaved ? '✓ Thumb salvo como rascunho' : 'Thumb salvo como rascunho'}
                      </div>
                    ) : (
                      <button
                        onClick={handleSaveThumbDraft}
                        disabled={saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending}
                        data-testid="button-save-thumb-draft"
                        style={{
                          width: '100%', padding: '12px 0', borderRadius: 8,
                          border: '1.5px solid #ddd6fe', background: '#ffffff',
                          color: '#7c3aed', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                          fontSize: 13,
                          cursor: (saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending) ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          marginBottom: 8, transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => { if (saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending) return; e.currentTarget.style.background = '#faf5ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; }}
                      >
                        <FileImage style={{ width: 14, height: 14 }} />
                        {saveThumbDraftMutation.isPending ? 'Salvando...' : 'Salvar thumb (sem enviar)'}
                      </button>
                    )}

                    {/* Enviar para Aprovação */}
                    <button
                      onClick={handleSubmitForApproval}
                      disabled={submitForApprovalMutation.isPending}
                      data-testid="button-submit-approval-header"
                      style={{
                        width: '100%', padding: '14px 0', borderRadius: 8, border: 'none',
                        backgroundColor: submitForApprovalMutation.isPending ? '#c4b5fd' : '#7c3aed',
                        color: '#ffffff', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                        fontSize: 13,
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
                    background: (isPasteUploading || isDragOver) ? 'rgba(237,233,254,0.8)' : 'rgba(250,245,255,0.5)', backdropFilter: 'blur(8px)',
                    border: (isPasteUploading || isDragOver) ? '2px dashed #7c3aed' : '1px dashed #ddd6fe', borderRadius: 12, padding: '24px 32px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', gap: 10, cursor: 'pointer', transition: 'background 0.15s'
                  }}
                    onMouseEnter={e => { if (!isPasteUploading && !isDragOver) (e.currentTarget as HTMLElement).style.background = 'rgba(237,233,254,0.5)'; }}
                    onMouseLeave={e => { if (!isPasteUploading && !isDragOver) (e.currentTarget as HTMLElement).style.background = 'rgba(250,245,255,0.5)'; }}
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragEnter={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={e => { e.preventDefault(); setIsDragOver(false); }}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragOver(false);
                      const file = e.dataTransfer.files[0];
                      if (!file || !file.type.startsWith('image/')) {
                        toast({ title: "Arquivo inválido", description: "Apenas imagens são aceitas", variant: "destructive" });
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (ev) => setApprovalThumbPreview(ev.target?.result as string);
                      reader.readAsDataURL(file);
                      uploadFileDirect(file, (localPath) => {
                        setApprovalThumbUrl(localPath);
                        setApprovalThumbPreview(localPath);
                        toast({ title: "Thumb carregado", description: "Agora clique em Salvar (rascunho) ou Enviar para Aprovação." });
                      });
                    }}
                  >
                    <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isPasteUploading
                        ? <div style={{ width: 22, height: 22, borderRadius: '50%', border: '3px solid #ddd6fe', borderTopColor: '#7c3aed', animation: 'spin 0.8s linear infinite' }} />
                        : <FileImage style={{ width: 24, height: 24, color: '#7c3aed' }} />
                      }
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#3b0764', margin: '0 0 4px' }}>
                        {isPasteUploading ? 'Enviando imagem...' : 'Upload do Thumb'}
                      </p>
                      <p style={{ fontSize: 12, color: 'rgba(59,7,100,0.55)', margin: 0 }}>
                        {isPasteUploading ? 'Aguarde o upload concluir' : 'Arraste, selecione ou cole com Ctrl+V'}
                      </p>
                    </div>
                    {!isPasteUploading && (
                      <FileUploader
                        onGetUploadParameters={getUploadUrl}
                        onComplete={(result) => {
                          const localPath = convertGCSUrlToLocalPath(result.url);
                          setApprovalThumbUrl(localPath);
                          setApprovalThumbPreview(localPath);
                          toast({ title: "Thumb carregado", description: "Agora clique em Salvar (rascunho) ou Enviar para Aprovação." });
                        }}
                        onError={(error) => { toast({ title: "Erro no upload", description: error.message, variant: "destructive" }); }}
                        onFileSelect={(file) => {
                          const reader = new FileReader();
                          reader.onload = (e) => { setApprovalThumbPreview(e.target?.result as string); };
                          reader.readAsDataURL(file);
                        }}
                        accept="image/*"
                        buttonVariant="ghost"
                        buttonClassName="mt-2 text-[12px] font-bold bg-purple-600 text-white px-5 py-2 rounded-lg hover:bg-purple-700 hover:text-white transition-all"
                      >
                        Fazer upload do thumb
                      </FileUploader>
                    )}
                    {!isPasteUploading && (
                      <p style={{ fontSize: 11, color: '#8b5cf6', margin: '-2px 0 0', fontWeight: 600 }}>
                        ou Ctrl+V para colar direto
                      </p>
                    )}
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
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 600, width: '95vw', borderRadius: 16, backgroundColor: '#ffffff', border: 'none', boxShadow: MODAL_SHADOW }}>
          <DialogTitle className="sr-only">Upload PDF Compartilhado</DialogTitle>
          <DialogDescription className="sr-only">Vincular um PDF a múltiplos itens</DialogDescription>

          <div style={{ padding: 32 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.05em', fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: 0, lineHeight: 1.1 }}>
                  Upload PDF<br />Compartilhado
                </h2>
                <p style={{ fontSize: 13, color: '#57534e', margin: 0 }}>Vincular um único documento a múltiplos itens selecionados.</p>
              </div>
              <button
                onClick={() => { setShowBulkDialog(false); setSharedPdfUrl(""); }}
                style={{ padding: '6px', backgroundColor: '#f3f4f3', border: 'none', borderRadius: '50%', cursor: 'pointer', color: '#57534e', lineHeight: 1, flexShrink: 0 }}
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
                            <FileImage style={{ width: 16, height: 16, color: '#57534e' }} />
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.displayId} · {item.type}
                          </p>
                          <p style={{ fontSize: 11, color: '#57534e', margin: 0 }}>
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
                      <p style={{ fontSize: 11, color: '#57534e', margin: '0 0 14px', padding: '0 8px' }}>Este arquivo será aplicado a todos os itens à esquerda.</p>
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — EXPORT PDF (componente compartilhado)                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <ExportPdfDialog open={showExportModal} onOpenChange={setShowExportModal} items={arteItemsPool} title="Arte" />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — SUBIR BOOK (PDF) e escolher as peças cobertas               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBookModal} onOpenChange={setShowBookModal}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 600, width: '95vw', borderRadius: 16, overflow: 'hidden', border: 'none', boxShadow: MODAL_SHADOW }}>
          <DialogTitle className="sr-only">Subir book de aprovação</DialogTitle>
          <DialogDescription className="sr-only">Envie o PDF do book e selecione as peças que ele cobre</DialogDescription>

          {/* ── Header escuro ── */}
          <div style={{ padding: '22px 28px 20px', background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: '16px 16px 0 0' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(249,115,22,0.35)' }}>
                  <FileText style={{ width: 15, height: 15, color: '#fff' }} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', margin: 0, fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.03em' }}>
                  {existingBookUrl ? 'Atualizar book (PDF)' : 'Subir book (PDF)'}
                </h2>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', margin: '0 0 0 42px', lineHeight: 1.4 }}>
                {existingBookUrl
                  ? 'Substitua o PDF atual e confirme as peças cobertas.'
                  : 'Envie o layout pronto e marque as peças cobertas — serão enviadas aos patrocinadores.'}
              </p>
            </div>
            <button
              onClick={() => setShowBookModal(false)}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 22, maxHeight: '62vh', overflowY: 'auto', backgroundColor: '#fafaf9' }}>

            {/* Evento */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', display: 'block', marginBottom: 6 }}>Evento</label>
              <FilterSelect
                fullWidth hideWhenEmpty={false} showAllLabelWhenEmpty
                label="Evento" allLabel="Selecione um evento"
                value={bookEventId || "all"} onChange={v => setBookEventId(v === "all" ? "" : v)}
                options={bookEventOptions}
                searchPlaceholder="Buscar evento..." emptyText="Nenhum evento com peças na Arte."
              />
            </div>

            {/* Book atual — só aparece quando já existe um book para o evento */}
            {existingBookUrl && !bookFileUrl && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', display: 'block', marginBottom: 6 }}>Book atual</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: '1.5px solid #fed7aa', background: '#fff7ed' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 3px 8px rgba(249,115,22,0.25)' }}>
                    <FileText style={{ width: 14, height: 14, color: '#fff' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#c2410c', margin: 0 }}>Book já enviado</p>
                    <p style={{ fontSize: 11, color: '#57534e', margin: '1px 0 0' }}>Envie um novo PDF abaixo para substituí-lo</p>
                  </div>
                  <a
                    href={existingBookUrl} target="_blank" rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#f97316', textDecoration: 'none', background: '#fff', border: '1px solid #fed7aa', borderRadius: 6, padding: '5px 10px', flexShrink: 0, whiteSpace: 'nowrap' }}
                  >
                    <ExternalLink style={{ width: 11, height: 11 }} /> Ver book
                  </a>
                </div>
              </div>
            )}

            {/* Upload do PDF */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', display: 'block', marginBottom: 6 }}>
                {existingBookUrl ? 'Novo PDF (substituição)' : 'Arquivo do book'}
              </label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12,
                border: `2px dashed ${bookFileUrl ? '#f97316' : '#e2d9cf'}`,
                background: bookFileUrl ? '#fff7ed' : 'linear-gradient(135deg,#fdfcfb,#f9f7f5)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!bookFileUrl) { (e.currentTarget as HTMLLabelElement).style.borderColor = '#f97316'; (e.currentTarget as HTMLLabelElement).style.background = '#fff7ed'; } }}
                onMouseLeave={e => { if (!bookFileUrl) { (e.currentTarget as HTMLLabelElement).style.borderColor = '#e2d9cf'; (e.currentTarget as HTMLLabelElement).style.background = 'linear-gradient(135deg,#fdfcfb,#f9f7f5)'; } }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: bookFileUrl ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'linear-gradient(135deg,#fff0e6,#ffe4cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', boxShadow: bookFileUrl ? '0 4px 10px rgba(249,115,22,0.28)' : 'none' }}>
                  {bookUploading
                    ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(249,115,22,0.3)', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
                    : bookFileUrl
                      ? <FileText style={{ width: 18, height: 18, color: '#fff' }} />
                      : existingBookUrl
                        ? <RefreshCw style={{ width: 16, height: 16, color: '#ea580c' }} />
                        : <FileText style={{ width: 18, height: 18, color: '#ea580c' }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: bookFileUrl ? '#c2410c' : '#1c1917', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bookUploading ? 'Enviando arquivo…' : bookFileName || (existingBookUrl ? 'Escolher novo PDF…' : 'Arrastar ou clicar para adicionar PDF')}
                  </p>
                  {!bookFileUrl && !bookUploading && (
                    <p style={{ fontSize: 11, color: '#57534e', margin: '2px 0 0' }}>Somente arquivos .PDF · Qualquer tamanho</p>
                  )}
                  {bookFileUrl && (
                    <p style={{ fontSize: 11, color: '#f97316', margin: '2px 0 0', fontWeight: 600 }}>✓ Arquivo carregado — pronto para salvar</p>
                  )}
                </div>
                {bookFileUrl && <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', flexShrink: 0, padding: '4px 10px', border: '1px solid #fed7aa', borderRadius: 6, background: '#fff' }}>Trocar</span>}
                <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={e => { handleBookFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>

            {/* Peças do evento */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e' }}>Peças no book</span>
                  {bookEventPieces.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif' }}>
                      {bookSelectedIds.size}<span style={{ fontWeight: 500, color: '#57534e' }}> / {bookEventPieces.length}</span>
                    </span>
                  )}
                </div>
                {bookEventPieces.length > 0 && (
                  <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <button onClick={() => setBookSelectedIds(new Set(bookEventPieces.map((i: any) => i.id)))}
                      style={{ background: 'none', border: 'none', padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#f97316', cursor: 'pointer', borderRadius: 6, transition: 'color 0.1s', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '2px' }}
                      onMouseEnter={e => { e.currentTarget.style.textDecorationColor = '#f97316'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                    >Todas</button>
                    <span style={{ color: '#d4d4d0', userSelect: 'none' }}>·</span>
                    <button onClick={() => setBookSelectedIds(new Set())}
                      style={{ background: 'none', border: 'none', padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#57534e', cursor: 'pointer', borderRadius: 6, transition: 'color 0.1s', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '2px' }}
                      onMouseEnter={e => { e.currentTarget.style.textDecorationColor = '#a8a29e'; }}
                      onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent'; }}
                    >Nenhuma</button>
                  </div>
                )}
              </div>
              <div style={{ border: '1px solid #ebe8e3', borderRadius: 12, maxHeight: 240, overflowY: 'auto', backgroundColor: '#ffffff' }}>
                {bookEventPieces.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 20px', gap: 8 }}>
                    <FileText style={{ width: 26, height: 26, color: '#d4d4d0' }} />
                    <p style={{ fontSize: 12, color: '#57534e', margin: 0, textAlign: 'center' }}>Selecione um evento para ver as peças disponíveis.</p>
                  </div>
                ) : bookEventPieces.map((item: any, idx: number) => {
                  const on = bookSelectedIds.has(item.id);
                  const isLast = idx === bookEventPieces.length - 1;
                  return (
                    <div key={item.id}
                      onClick={() => setBookSelectedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: isLast ? 'none' : '1px solid #f5f4f2', cursor: 'pointer', background: on ? '#fff7ed' : '#ffffff', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#fafaf9'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = on ? '#fff7ed' : '#ffffff'; }}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: 6, flexShrink: 0, border: `2px solid ${on ? '#f97316' : '#d4d4d0'}`, background: on ? '#f97316' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                        {on && <Check style={{ width: 9, height: 9, color: '#fff' }} />}
                      </div>
                      <span style={{ fontFamily: '"Space Grotesk", monospace', fontSize: 11, fontWeight: 700, color: on ? '#c2410c' : '#a8a29e', background: on ? '#fed7aa' : '#f0efee', padding: '2px 7px', borderRadius: 6, flexShrink: 0, letterSpacing: '0.01em', transition: 'all 0.12s' }}>{item.displayId}</span>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                          {groupOf(item.type) && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: on ? '#f97316' : '#b8b3ad', background: on ? '#fff7ed' : '#f5f4f2', border: `1px solid ${on ? '#fed7aa' : '#ebe8e3'}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.02em', transition: 'all 0.12s' }}>{groupOf(item.type)}</span>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: on ? '#1c1917' : '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.1s' }}>{item.type}</span>
                        </div>
                        {item.description && item.description !== item.type && (
                          <span style={{ fontSize: 11, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>
                        )}
                      </span>
                      {item.bookUrl && (
                        <span title="Já tem book" style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '2px 8px', letterSpacing: '0.04em' }}>BOOK</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '14px 28px', borderTop: '1px solid #ebe8e3', display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
            {/* Ghost — Cancelar fica à esquerda, longe do CTA primário */}
            <button onClick={() => setShowBookModal(false)}
              style={{ height: 40, padding: '0 16px', borderRadius: 8, background: 'transparent', border: 'none', color: '#57534e', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'color 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#1c1917'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#78716c'; }}
            >Cancelar</button>
            {/* Filled — Salvar book */}
            <button
              onClick={() => saveBookMutation.mutate()}
              disabled={!bookFileUrl || bookSelectedIds.size === 0 || saveBookMutation.isPending}
              title={!bookFileUrl ? 'Adicione o arquivo PDF antes de salvar' : bookSelectedIds.size === 0 ? 'Selecione ao menos uma peça' : undefined}
              style={{
                height: 38, padding: '0 20px', borderRadius: 8, border: 'none',
                background: (!bookFileUrl || bookSelectedIds.size === 0 || saveBookMutation.isPending) ? '#e7e5e4' : 'linear-gradient(135deg,#1c1917,#292524)',
                color: (!bookFileUrl || bookSelectedIds.size === 0 || saveBookMutation.isPending) ? '#a8a29e' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: (!bookFileUrl || bookSelectedIds.size === 0) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 7, transition: 'filter 0.12s',
                boxShadow: (!bookFileUrl || bookSelectedIds.size === 0) ? 'none' : '0 2px 8px rgba(28,25,23,0.2)',
              }}
              onMouseEnter={e => { if (bookFileUrl && bookSelectedIds.size > 0) e.currentTarget.style.filter = 'brightness(1.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
            >
              {saveBookMutation.isPending
                ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Salvando…</>
                : existingBookUrl
                  ? <><RefreshCw style={{ width: 13, height: 13 }} />{`Atualizar book — ${bookSelectedIds.size} peça${bookSelectedIds.size !== 1 ? 's' : ''}`}</>
                  : <><FileText style={{ width: 13, height: 13 }} />{`Salvar book — ${bookSelectedIds.size} peça${bookSelectedIds.size !== 1 ? 's' : ''}`}</>
              }
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL 5 — MULTI-UPLOAD THUMBS (redesenhado)                        */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBulkThumbModal} onOpenChange={(open) => { if (!open && !bulkThumbRunning) { setShowBulkThumbModal(false); setBulkThumbEntries([]); setBulkThumbEventFilter("all"); } }}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 980, width: '95vw', borderRadius: 16, backgroundColor: '#ffffff', border: 'none', boxShadow: MODAL_SHADOW }}>
          <DialogTitle className="sr-only">Multi-Upload de Thumbs</DialogTitle>
          <DialogDescription className="sr-only">Upload em lote de miniaturas de aprovação</DialogDescription>

          {/* ── Header ── */}
          <div style={{ padding: '22px 28px 20px', borderBottom: '1px solid #f0ede8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', borderRadius: '16px 16px 0 0' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Upload style={{ width: 16, height: 16, color: '#fff' }} />
                </div>
                <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.04em', color: '#ffffff', margin: 0, fontFamily: '"Space Grotesk", sans-serif' }}>
                  Multi-Upload de Thumbs
                </h2>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', margin: 0, paddingLeft: 42 }}>
                O sistema vincula automaticamente pelo número no nome do arquivo · ex: <strong style={{ color: 'rgba(255,255,255,0.75)' }}>0277_aplique.jpg</strong>
              </p>
            </div>
            <button
              onClick={() => { if (!bulkThumbRunning) { setShowBulkThumbModal(false); setBulkThumbEntries([]); setBulkThumbEventFilter("all"); } }}
              style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '50%', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* ── Body — 2 columns ── */}
          <div style={{ display: 'flex', height: 520, overflow: 'visible' }}>

            {/* ══════════════════════════════════════
                Left panel — upload + controles
            ══════════════════════════════════════ */}
            <div style={{ width: 264, flexShrink: 0, borderRight: '1px solid #ebe8e3', display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf9' }}>

              {/* ── Drop zone ── */}
              <div style={{ padding: '18px 18px 14px' }}>
                <input id="bulk-thumb-input" type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
                <div
                  style={{
                    padding: '20px 12px 18px', borderRadius: 12,
                    background: isDragOverBulk ? 'linear-gradient(135deg,#f0fdf4,#dcfce7)' : '#ffffff',
                    border: isDragOverBulk ? '2px dashed #16a34a' : '2px dashed #d4d4d0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isDragOverBulk ? '0 0 0 4px rgba(22,163,74,0.08)' : 'none',
                  }}
                  onDragOver={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                  onDragEnter={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                  onDragLeave={() => setIsDragOverBulk(false)}
                  onDrop={e => { e.preventDefault(); setIsDragOverBulk(false); if (e.dataTransfer.files.length) handleBulkThumbFilesAdded(e.dataTransfer.files); }}
                  onClick={() => { const inp = document.getElementById('bulk-thumb-input') as HTMLInputElement; inp?.click(); }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 8,
                    background: isDragOverBulk ? 'linear-gradient(135deg,#16a34a,#15803d)' : 'linear-gradient(135deg,#f97316,#ea580c)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: isDragOverBulk ? '0 4px 12px rgba(22,163,74,0.3)' : '0 4px 12px rgba(249,115,22,0.3)',
                    transition: 'all 0.15s',
                  }}>
                    <Upload style={{ width: 20, height: 20, color: '#fff' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: isDragOverBulk ? '#15803d' : '#1c1917', margin: '0 0 2px' }}>
                      {isDragOverBulk ? 'Solte aqui' : 'Arrastar ou clicar'}
                    </p>
                    <p style={{ fontSize: 11, color: '#57534e', margin: 0, letterSpacing: '0.03em' }}>JPG · PNG · WEBP · SVG</p>
                  </div>
                </div>
              </div>

              {/* ── Divider ── */}
              <div style={{ margin: '0 18px', borderTop: '1px solid #ebe8e3' }} />

              {/* ── Event filter ── */}
              <div style={{ padding: '14px 18px 0' }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', margin: '0 0 6px' }}>Evento</p>
                <div style={{ width: '100%' }}>
                  <EventFilterDropdown
                    value={bulkThumbEventFilter}
                    onChange={setBulkThumbEventFilter}
                    allLabel="Todos os eventos"
                    options={(events as any[]).map((ev: any) => ({ value: ev.id, label: ev.name }))}
                  />
                </div>
              </div>

              {/* ── Resumo — só aparece quando há arquivos com count > 0 ── */}
              {bulkThumbEntries.length > 0 && (() => {
                const rows = [
                  { label: 'Vinculados',  count: bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length,  dot: '#16a34a', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                  { label: 'Sem vínculo', count: bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length, dot: '#f59e0b', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
                  { label: 'Concluídos',  count: bulkThumbEntries.filter(e => e.status === 'done').length,                        dot: '#7c3aed', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
                  { label: 'Erro',        count: bulkThumbEntries.filter(e => e.status === 'error').length,                       dot: '#dc2626', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                ].filter(s => s.count > 0);
                if (rows.length === 0) return null;
                return (
                  <div style={{ padding: '14px 18px 0' }}>
                    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#57534e', margin: '0 0 8px' }}>Resumo</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {rows.map(s => (
                        <div key={s.label} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '6px 10px', borderRadius: 6,
                          backgroundColor: s.bg, border: `1px solid ${s.border}`,
                          transition: 'all 0.15s',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.dot, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{s.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Spacer */}
              <div style={{ flex: 1 }} />
            </div>

            {/* ══════════════════════════════════════
                Right panel — lista de arquivos
            ══════════════════════════════════════ */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f7f6f5' }}>
              {bulkThumbEntries.length === 0 ? (
                /* ── Empty state ── */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 16, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(249,115,22,0.25)', opacity: 0.4 }}>
                    <Upload style={{ width: 30, height: 30, color: '#fff' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#57534e', margin: '0 0 6px' }}>Nenhuma imagem adicionada</p>
                    <p style={{ fontSize: 12, color: '#57534e', margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
                      Arraste para a área ao lado ou clique para selecionar
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {['JPG', 'PNG', 'WEBP', 'SVG'].map(f => (
                      <span key={f} style={{ padding: '3px 10px', borderRadius: 999, backgroundColor: '#ebe8e3', fontSize: 11, fontWeight: 700, color: '#57534e', letterSpacing: '0.06em' }}>{f}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Panel header ── */}
                  <div style={{ padding: '11px 18px', borderBottom: '1px solid #ebe8e3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif' }}>
                        {bulkThumbEntries.length} {bulkThumbEntries.length === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                      {(() => {
                        const linked = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length;
                        const unlinked = bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length;
                        const done = bulkThumbEntries.filter(e => e.status === 'done').length;
                        const err = bulkThumbEntries.filter(e => e.status === 'error').length;
                        return (
                          <>
                            {linked > 0 && <span style={{ padding: '2px 8px', borderRadius: 999, backgroundColor: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, border: '1px solid #bbf7d0' }}>{linked} vinculado{linked !== 1 ? 's' : ''}</span>}
                            {unlinked > 0 && <span style={{ padding: '2px 8px', borderRadius: 999, backgroundColor: '#fff7ed', color: '#c2410c', fontSize: 11, fontWeight: 700, border: '1px solid #fed7aa' }}>{unlinked} sem vínculo</span>}
                            {done > 0 && <span style={{ padding: '2px 8px', borderRadius: 999, backgroundColor: '#f5f3ff', color: '#7c3aed', fontSize: 11, fontWeight: 700, border: '1px solid #ddd6fe' }}>{done} enviado{done !== 1 ? 's' : ''}</span>}
                            {err > 0 && <span style={{ padding: '2px 8px', borderRadius: 999, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700, border: '1px solid #fecaca' }}>{err} erro{err !== 1 ? 's' : ''}</span>}
                          </>
                        );
                      })()}
                    </div>
                    <span style={{ fontSize: 11, color: '#57534e', fontWeight: 600 }}>Confirme o vínculo de cada imagem</span>
                  </div>

                  {/* ── Lista de cards (horizontal) ── */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bulkThumbEntries.map(entry => {
                      const pendingPool = [...allItems, ...correcaoItems].filter((i: any, idx: number, arr: any[]) => {
                        if (arr.findIndex((x: any) => x.id === i.id) !== idx) return false;
                        const podeReceberThumb = i.status === 'awaiting_submission'
                          || (correcaoItems as any[]).some((c: any) => c.id === i.id);
                        if (!podeReceberThumb) return false;
                        if (bulkThumbEventFilter !== "all" && i.eventId !== bulkThumbEventFilter) return false;
                        return true;
                      });
                      const matchedItem = allItems.find((i: any) => i.id === entry.matchedItemId);
                      const isLinked = !!entry.matchedItemId;

                      const cardBorderColor = entry.status === 'done' ? '#bbf7d0'
                        : entry.status === 'error' ? '#fecaca'
                        : entry.status === 'uploading' ? '#ddd6fe'
                        : isLinked ? '#bfdbfe' : '#fcd34d';
                      const cardAccentBg = entry.status === 'done' ? '#f0fdf4'
                        : entry.status === 'error' ? '#fef2f2'
                        : entry.status === 'uploading' ? '#faf5ff'
                        : isLinked ? '#eff6ff' : '#fffbeb';

                      return (
                        <div key={entry.id} style={{
                          display: 'flex', alignItems: 'stretch', gap: 0,
                          borderRadius: 12, border: `1.5px solid ${cardBorderColor}`,
                          backgroundColor: '#ffffff',
                          overflow: 'hidden', position: 'relative',
                          boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                          transition: 'box-shadow 0.12s',
                        }}>
                          {/* ── Thumbnail quadrado ── */}
                          <div style={{ position: 'relative', width: 80, flexShrink: 0, backgroundColor: '#f3f4f3' }}>
                            <img src={entry.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', minHeight: 80 }} />
                            {/* Status pill */}
                            <div style={{ position: 'absolute', bottom: 4, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
                              {entry.status === 'done' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: '#15803d', color: '#ffffff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  <CheckCircle style={{ width: 8, height: 8 }} /> OK
                                </span>
                              )}
                              {entry.status === 'uploading' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: '#7c3aed', color: '#ffffff', fontSize: 10, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                                </span>
                              )}
                              {entry.status === 'error' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: '#dc2626', color: '#ffffff', fontSize: 10, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  Erro
                                </span>
                              )}
                              {entry.status === 'pending' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 999, backgroundColor: isLinked ? '#1d4ed8' : '#d97706', color: '#ffffff', fontSize: 10, fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
                                  {isLinked ? '✓' : '?'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ── Card info ── */}
                          <div style={{ flex: 1, padding: '10px 12px', borderLeft: `3px solid ${cardBorderColor}`, backgroundColor: cardAccentBg, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minWidth: 0 }}>
                            {/* Top row: filename + remove */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 700, color: '#1c1917', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.file.name}>
                                  {entry.file.name}
                                </p>
                                <p style={{ fontSize: 11, color: '#57534e', margin: 0 }}>
                                  {(entry.file.size / 1024).toFixed(0)} KB
                                </p>
                              </div>
                              {(entry.status === 'pending' || entry.status === 'error') && (
                                <button
                                  onClick={() => setBulkThumbEntries(prev => prev.filter(e => e.id !== entry.id))}
                                  style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; e.currentTarget.style.borderColor = '#e7e5e4'; }}
                                >
                                  <X style={{ width: 10, height: 10, color: '#57534e' }} />
                                </button>
                              )}
                            </div>

                            {/* ── State-specific content ── */}
                            {entry.status === 'done' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 6, backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}>
                                <CheckCircle style={{ width: 11, height: 11, color: '#16a34a', flexShrink: 0 }} />
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#15803d', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {matchedItem?.displayId} · {matchedItem?.type?.slice(0, 28)}
                                </p>
                              </div>
                            ) : entry.status === 'uploading' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                                <div style={{ width: 11, height: 11, borderRadius: '50%', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Enviando...</span>
                              </div>
                            ) : entry.status === 'error' ? (
                              <div style={{ padding: '5px 8px', borderRadius: 6, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#dc2626', margin: '0 0 1px' }}>Falha no envio</p>
                                <p style={{ fontSize: 11, color: '#f87171', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.errorMsg}</p>
                              </div>
                            ) : isLinked && matchedItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontSize: 11, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>{matchedItem.displayId}</span>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.type}</span>
                                  </div>
                                  {matchedItem.event?.name && (
                                    <p style={{ fontSize: 11, color: '#60a5fa', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.event.name}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null } : en))}
                                  title="Trocar vínculo"
                                  style={{ flexShrink: 0, background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#3b82f6', fontSize: 11, fontWeight: 700, transition: 'all 0.12s' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                                >Trocar</button>
                              </div>
                            ) : (
                              /* ── Sem vínculo: combobox pesquisável com grupos ── */
                              <div>
                                {(() => {
                                  const linked = allItems.find((i: any) => i.id === entry.matchedItemId);
                                  const isOpen = !!bulkThumbLinkOpenMap[entry.id];
                                  // Agrupar por grupo/tipo
                                  const grouped = pendingPool.reduce((acc: Record<string, any[]>, item: any) => {
                                    const g = groupOf(item.type) || item.type;
                                    if (!acc[g]) acc[g] = [];
                                    acc[g].push(item);
                                    return acc;
                                  }, {});
                                  const groupKeys = Object.keys(grouped).sort();
                                  return (
                                    <Popover
                                      open={isOpen}
                                      onOpenChange={open => setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: open }))}
                                    >
                                      <PopoverTrigger asChild>
                                        <button style={{
                                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
                                          height: 32, borderRadius: 6,
                                          border: `1px solid ${isLinked ? '#93c5fd' : '#e7e5e4'}`,
                                          backgroundColor: '#ffffff', fontSize: 11, fontWeight: 600,
                                          color: linked ? '#1c1917' : '#78716c', padding: '0 8px', cursor: 'pointer',
                                        }}>
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {linked
                                              ? `${linked.displayId} · ${linked.type}`
                                              : 'Selecionar peça...'}
                                          </span>
                                          <ChevronsUpDown style={{ width: 10, height: 10, color: '#57534e', flexShrink: 0 }} />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="p-0" style={{ width: isMobile ? '90vw' : 320 }} align="start">
                                        <Command>
                                          <CommandInput placeholder="Buscar por ID, tipo ou descrição..." />
                                          <CommandList style={{ maxHeight: 280 }}>
                                            <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
                                            {pendingPool.length === 0 && (
                                              <div style={{ padding: '9px 16px', fontSize: 11, color: '#b45309', fontWeight: 600, lineHeight: 1.5 }}>
                                                Nenhuma peça pronta para receber thumb
                                                {bulkThumbEventFilter !== "all" ? " neste evento" : ""}.
                                                <span style={{ display: 'block', fontWeight: 500, color: '#57534e', marginTop: 4 }}>
                                                  Só aparecem peças aguardando envio ou em correção. Se a peça é nova,
                                                  ela precisa passar antes por <b>Vincular Patrocinadores</b>.
                                                  {bulkThumbEventFilter !== "all" && " Você também pode trocar o filtro de evento para 'Todos'."}
                                                </span>
                                              </div>
                                            )}
                                            {entry.matchedItemId && (
                                              <CommandGroup heading="Selecionado">
                                                <CommandItem
                                                  value="clear"
                                                  onSelect={() => {
                                                    setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null } : en));
                                                    setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                                                  }}
                                                >
                                                  <X style={{ width: 10, height: 10, marginRight: 6, flexShrink: 0, color: '#dc2626' }} />
                                                  <span style={{ color: '#dc2626', fontSize: 11 }}>Remover vínculo</span>
                                                </CommandItem>
                                              </CommandGroup>
                                            )}
                                            {groupKeys.map(groupKey => (
                                              <CommandGroup key={groupKey} heading={groupKey}>
                                                {grouped[groupKey].map((item: any) => {
                                                  const evtName = (events as any[]).find(e => e.id === item.eventId)?.name || '';
                                                  const searchVal = `${item.displayId} ${item.type} ${item.description || ''} ${evtName}`;
                                                  return (
                                                    <CommandItem
                                                      key={item.id}
                                                      value={searchVal}
                                                      className="data-[selected=true]:bg-stone-100 data-[selected=true]:text-stone-900"
                                                      onSelect={() => {
                                                        setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: item.id } : en));
                                                        setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                                                      }}
                                                    >
                                                      <Check style={{ width: 10, height: 10, color: '#16a34a', opacity: entry.matchedItemId === item.id ? 1 : 0, marginRight: 4, flexShrink: 0 }} />
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', minWidth: 0 }}>
                                                        {/* displayId — destaque */}
                                                        <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif', flexShrink: 0 }}>{item.displayId}</span>
                                                        {/* descrição ou evento — o tipo já aparece no cabeçalho do grupo */}
                                                        {(item.description || evtName) && (
                                                          <span style={{ fontSize: 11, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {item.description ? item.description.slice(0, 48) : evtName}
                                                          </span>
                                                        )}
                                                      </div>
                                                    </CommandItem>
                                                  );
                                                })}
                                              </CommandGroup>
                                            ))}
                                          </CommandList>
                                        </Command>
                                      </PopoverContent>
                                    </Popover>
                                  );
                                })()}
                              </div>
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

          {/* ── Rodapé unificado — ocupa toda a largura do modal ── */}
          {(() => {
            const readyCount = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length;
            const doneCount  = bulkThumbEntries.filter(e => e.status === 'done').length;
            const isDisabled = bulkThumbRunning || readyCount === 0;
            return (
              <div style={{
                borderTop: '1px solid #ebe8e3', padding: '12px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                backgroundColor: '#ffffff', borderRadius: '0 0 16px 16px', flexShrink: 0,
              }}>
                {/* Esquerda: limpar concluídos */}
                <div>
                  {doneCount > 0 && (
                    <button
                      onClick={() => setBulkThumbEntries(prev => prev.filter(e => e.status !== 'done'))}
                      style={{ height: 36, padding: '0 14px', borderRadius: 6, background: 'none', border: '1px solid #e7e5e4', color: '#57534e', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'background 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >Limpar {doneCount} enviado{doneCount !== 1 ? 's' : ''}</button>
                  )}
                </div>

                {/* Direita: Cancelar → Salvar rascunho → Enviar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Ghost — Cancelar */}
                  <button
                    onClick={() => { if (!bulkThumbRunning) { setShowBulkThumbModal(false); setBulkThumbEntries([]); setBulkThumbEventFilter("all"); } }}
                    style={{ height: 38, padding: '0 16px', borderRadius: 6, background: 'transparent', border: 'none', color: '#57534e', cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'color 0.12s' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#1c1917'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#78716c'; }}
                  >Cancelar</button>

                  {/* Outline — Salvar como rascunho (secundário) */}
                  <button
                    onClick={handleBulkThumbSaveDraft}
                    disabled={isDisabled}
                    data-testid="button-bulk-thumb-save-draft"
                    title="Salva o thumb na peça sem enviá-la para aprovação. A peça continua como rascunho na fila de Arte."
                    style={{
                      height: 36, padding: '0 16px', borderRadius: 6,
                      backgroundColor: '#ffffff',
                      border: `1.5px solid ${isDisabled ? '#e7e5e4' : '#ddd6fe'}`,
                      color: isDisabled ? '#a8a29e' : '#7c3aed',
                      fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                      cursor: isDisabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.backgroundColor = '#faf5ff'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                  >
                    <FileImage style={{ width: 12, height: 12 }} />
                    {/* Sem nada vinculado o botão dizia "Salvar 0 thumbs": o zero
                        não informa, só ocupa espaço. O rótulo limpo já basta,
                        porque o botão está desabilitado de qualquer forma. */}
                    {readyCount > 0
                      ? `Salvar ${readyCount} ${readyCount === 1 ? 'thumb' : 'thumbs'} como rascunho`
                      : 'Salvar como rascunho'}
                  </button>

                  {/* Filled primary — Enviar */}
                  <button
                    onClick={handleBulkThumbUpload}
                    disabled={isDisabled}
                    data-testid="button-bulk-thumb-confirm"
                    style={{
                      height: 40, padding: '0 20px', borderRadius: 8,
                      background: isDisabled ? '#e7e5e4' : 'linear-gradient(135deg,#16a34a,#15803d)',
                      border: 'none',
                      color: isDisabled ? '#a8a29e' : '#ffffff',
                      fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                      boxShadow: isDisabled ? 'none' : '0 4px 12px rgba(21,128,61,0.28)',
                      transition: 'all 0.15s', letterSpacing: '-0.01em',
                    }}
                    onMouseEnter={e => { if (!isDisabled) e.currentTarget.style.filter = 'brightness(1.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                  >
                    {bulkThumbRunning
                      ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Enviando...</>
                      : <><Send style={{ width: 14, height: 14 }} />{readyCount > 0 ? `Enviar ${readyCount} ${readyCount === 1 ? 'thumb' : 'thumbs'}` : 'Enviar thumbs'}</>
                    }
                  </button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}
