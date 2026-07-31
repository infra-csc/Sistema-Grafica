import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { SponsorChips } from "@/components/sponsor-chips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, AlertTriangle, Eye, Calendar, Truck, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock, Package, Send, FolderOpen, FileText, FileCheck, RotateCcw, X, Star, ArrowRight, Paperclip, Ban, Printer, ChevronDown, LayoutList, Layers, CheckSquare, Filter, SlidersHorizontal, Palette } from "lucide-react";
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

  // Trocar de aba troca a lista inteira; manter o scroll onde estava deixava o
  // usuário no meio da tabela nova. Sempre volta ao topo da listagem.
  const changeTab = useCallback((tabId: string) => {
    setActiveTab(tabId);
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/items/pending"] });
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({
        title: "Thumb salvo",
        description: "O thumb foi salvo. Envie para aprovação quando quiser.",
      });
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
  const [bulkThumbEventComboOpen, setBulkThumbEventComboOpen] = useState(false);
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
  const bookEventPieces = useMemo(
    () => arteItemsPool
      .filter((i: any) => i.eventId === bookEventId)
      .sort((a: any, b: any) => String(a.displayId || "").localeCompare(String(b.displayId || ""), "pt-BR", { numeric: true })),
    [arteItemsPool, bookEventId],
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

  const getFilteredItemsForTab = (tab: string) => {
    return allItems
      .filter(item => {
        const matchesEvent = eventFilter.length === 0 || eventFilter.includes(item.eventId);
        let matchesView = false;
        if (tab === "criar-aprovacoes") {
          matchesView = item.status === 'awaiting_submission';
        } else if (tab === "aguardando-patrocinador") {
          matchesView = item.status === 'awaiting_sponsor_approval';
        } else if (tab === "finalizar-layouts") {
          matchesView = ['sponsor_approved', 'awaiting_creator_review'].includes(item.status);
        } else if (tab === "finalizados") {
          matchesView = [
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
          ].includes(item.status);
        }
        const matchesType = typeFilter.length === 0 || typeFilter.includes(item.type);
        const matchesMaterial = materialFilter.length === 0 || materialFilter.includes(item.material);
        const matchesFinish = finishFilter.length === 0 || finishFilter.includes(item.finish);
        let matchesNext10Days = true;
        if (next10DaysFilter && item.event?.truckDepartureDate) {
          const today = new Date(); today.setHours(0,0,0,0);
          const tenDaysFromNow = new Date(today); tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10);
          const dep = new Date(item.event.truckDepartureDate);
          matchesNext10Days = dep >= today && dep <= tenDaysFromNow;
        }
        let matchesMonth = true;
        if (monthFilter.length > 0 && item.event?.truckDepartureDate) {
          matchesMonth = monthFilter.includes((new Date(item.event.truckDepartureDate).getMonth() + 1).toString());
        }
        const matchesSearch = !deferredSearch || [item.displayId, item.type, item.description, item.event?.name].some(
          f => f && f.toLowerCase().includes(deferredSearch.toLowerCase())
        );
        const matchesSponsor = sponsorFilter.length === 0 || (item.sponsors ?? []).some((s: any) => sponsorFilter.includes(s.id));
        const matchesSemThumb = !semThumb || !item.approvalThumbUrl;
        const matchesComThumb = !comThumb || !!item.approvalThumbUrl;
        const matchesSemFinal = !semFinal || !item.finalFileUrl;
        const matchesComFinal = !comFinal || !!item.finalFileUrl;
        const matchesUrgente = !urgenteFilter || item.event?.priority === 'urgent';
        let matchesPeriod = true;
        if (periodFilter !== "Todos" && item.event?.truckDepartureDate) {
          const now = new Date(); now.setHours(0, 0, 0, 0);
          const dep = new Date(item.event.truckDepartureDate);
          if (periodFilter === "Hoje") {
            const tom = new Date(now); tom.setDate(tom.getDate() + 1);
            matchesPeriod = dep >= now && dep < tom;
          } else if (periodFilter === "7 dias") {
            const fut = new Date(now); fut.setDate(fut.getDate() + 7);
            matchesPeriod = dep <= fut;
          } else if (periodFilter === "15 dias") {
            const fut = new Date(now); fut.setDate(fut.getDate() + 15);
            matchesPeriod = dep <= fut;
          } else if (periodFilter === "30 dias") {
            const fut = new Date(now); fut.setDate(fut.getDate() + 30);
            matchesPeriod = dep <= fut;
          }
        }
        return matchesEvent && matchesView && matchesType && matchesMaterial && matchesFinish && matchesNext10Days && matchesMonth && matchesSearch && matchesSponsor && matchesSemThumb && matchesComThumb && matchesSemFinal && matchesComFinal && matchesUrgente && matchesPeriod;
      })
      .sort((a, b) => {
        const eA = a.event?.name || '', eB = b.event?.name || '';
        if (eA !== eB) return eA.localeCompare(eB, 'pt-BR');
        const gA = groupOf(a.type) || '', gB = groupOf(b.type) || '';
        if (gA !== gB) return gA.localeCompare(gB, 'pt-BR');
        const idA = parseInt(String(a.displayId || '0').replace(/\D/g, '')) || 0;
        const idB = parseInt(String(b.displayId || '0').replace(/\D/g, '')) || 0;
        return idA - idB;
      });
  };

  const filteredItems = getFilteredItemsForTab(activeTab);
  const itemsForEvent = eventFilter.length === 0 ? allItems : allItems.filter(item => eventFilter.includes(item.eventId));
  const pendingCount = getFilteredItemsForTab("criar-aprovacoes").length;
  const aguardandoCount = getFilteredItemsForTab("aguardando-patrocinador").length;
  const needsFinalFileCount = getFilteredItemsForTab("finalizar-layouts").length;
  const finalizadosCount = getFilteredItemsForTab("finalizados").length;
  const correcaoCount = correcaoItems.length;
  const pendingItems = filteredItems.filter(item => item.status === 'awaiting_submission');

  const handleViewDetails = (item: any) => {
    setSelectedItem(item);
    setApprovalThumbUrl(item.approvalThumbUrl || "");
    setApprovalThumbPreview(item.approvalThumbUrl || "");
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
    // Atualiza o item local otimisticamente para refletir o thumb salvo na lista.
    setSelectedItem((prev: any) => prev ? { ...prev, approvalThumbUrl } : prev);
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
           <Eye style={{ width: 48, height: 48, color: '#a8a29e', margin: '0 auto 16px' }} />}
          <p style={{ fontSize: 16, fontWeight: 600, color: '#1c1917', marginBottom: 4 }}>
            {tabId === "criar-aprovacoes" ? "Tudo liberado!" : tabId === "aguardando-patrocinador" ? "Nenhuma peça aguardando patrocinador" : tabId === "finalizar-layouts" ? "Nenhum item aguardando arquivo final" : "Nenhum item finalizado"}
          </p>
          <p style={{ fontSize: 13, color: '#a8a29e' }}>
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

    const groups: { event: string; type: string; group: string; eventObj: any; items: any[] }[] = [];
    items.forEach(item => {
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
            <span style={{ fontSize: 11, fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>
              {eventSummary.length} eventos
            </span>
            {eventSummary.map(ev => (
              <button
                key={ev.id || ev.name}
                onClick={() => { if (ev.id) setEventFilter([ev.id]); }}
                title={ev.id ? `Filtrar por ${ev.name}` : ev.name}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 11px', borderRadius: 9999, border: '1px solid #fdba74', backgroundColor: '#fff7ed', color: '#c2410c', fontSize: 12, fontWeight: 600, cursor: ev.id ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
              >
                {ev.name}
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 20, height: 18, padding: '0 6px', borderRadius: 9999, backgroundColor: '#ea580c', color: '#ffffff', fontSize: 11, fontWeight: 800 }}>
                  {ev.count}
                </span>
              </button>
            ))}
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
                      {[
                        { label: 'ID', w: 68 },
                        { label: 'Qtd', w: 44 },
                        { label: `${group.type}`, flex: true },
                        { label: 'Dimensões (V / A)', w: 120 },
                        { label: 'M²', w: 46 },
                        { label: 'Material', w: 92 },
                        { label: 'Arte', w: 68 },
                        { label: 'Patroc.', w: 118 },
                        { label: 'Ações', w: 96, right: true },
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
                          {(tabId === "criar-aprovacoes" || tabId === "finalizados") && (
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
                              {/* Thumb salvo mas ainda NÃO enviado para aprovação (rascunho) */}
                              {tabId === "criar-aprovacoes" && item.approvalThumbUrl && !item.rejectedBySponsor && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 4, padding: '1px 5px' }} data-testid={`badge-thumb-draft-${item.id}`}>
                                  RASCUNHO
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
                              {item.observations && (
                                <span style={{ fontSize: 11, color: '#d97706', display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <AlertCircle style={{ width: 10, height: 10 }} />{item.observations}
                                </span>
                              )}
                              {item.referenceUrl && (
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência visual do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, padding: '2px 6px' }} data-testid={`link-reference-arte-${item.id}`}>
                                  <Paperclip style={{ width: 9, height: 9 }} />
                                  Ref. visual
                                </a>
                              )}
                              {item.bookUrl && (
                                <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" title="Abrir book de aprovação (PDF) para enviar ao patrocinador" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#6d28d9', textDecoration: 'none', backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 3, padding: '2px 6px' }} data-testid={`link-book-arte-${item.id}`}>
                                  <FileText style={{ width: 9, height: 9 }} />
                                  Book
                                </a>
                              )}
                            </div>
                          </td>
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
                          {/* ARTE — indicadores thumb / arquivo final (todas as abas) */}
                          <td style={{ padding: '12px 16px' }}>
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
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, paddingLeft: 2 }}>
                              <span style={{ fontSize: 8.5, color: '#a8a29e', width: 26, textAlign: 'center' }}>thumb</span>
                              <span style={{ fontSize: 8.5, color: '#a8a29e', width: 26, textAlign: 'center' }}>final</span>
                            </div>
                          </td>
                          {/* Patrocinadores (todas as abas) */}
                          <td style={{ padding: '12px 16px' }}>
                            <SponsorChips sponsors={item.sponsors ?? []} variant="orange" size="sm" />
                          </td>
                          {/* Ações */}
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => handleExportItemPDF(item)}
                                data-testid={`button-export-item-pdf-${item.id}`}
                                title="Exportar prova em PDF"
                                style={{
                                  width: 32, height: 32, borderRadius: 8,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'none', border: '1px solid #e7e5e4', cursor: 'pointer',
                                  color: '#a8a29e', transition: 'all 0.15s',
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
                              {(tabId === "criar-aprovacoes" || tabId === "finalizar-layouts") && (() => {
                                const isSkip = tabId === "criar-aprovacoes" && item.skipApproval;
                                const bgColor = tabId === "finalizar-layouts" ? '#2563eb' : isSkip ? '#7c3aed' : '#f97316';
                                const label = tabId === "finalizar-layouts" ? "Finalizar Arte" : isSkip ? "Enviar Finalização" : "Enviar Aprovação";
                                return (
                                  <button
                                    onClick={() => handleViewDetails(item)}
                                    data-testid={`button-action-${item.id}`}
                                    title={isSkip ? "Sem aprovação de patrocinador — vai direto para revisão final" : undefined}
                                    style={{
                                      height: 32, padding: '0 12px', borderRadius: 8,
                                      backgroundColor: bgColor,
                                      color: '#ffffff', border: 'none', cursor: 'pointer',
                                      fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
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
                                    color: '#a8a29e', transition: 'all 0.15s',
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
            const isImage = item.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl) || item.approvalThumbUrl.startsWith('/objects/'));
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
                      setCorrecaoFileName("");
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
        <div style={{ padding: '20px 32px 0', maxWidth: 1600, margin: '0 auto' }}>

          {/* ── Identity + actions ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #ea580c, #f97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 0 1px rgba(249,115,22,0.4), 0 8px 24px rgba(234,88,12,0.45)' }}>
                <Palette style={{ width: 24, height: 24, color: '#fff' }} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1c1917', letterSpacing: '-0.05em', margin: 0, fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.1 }}>
                    Módulo Arte
                  </h1>
                  {(pendingCount + correcaoCount + needsFinalFileCount) > 0 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, backgroundColor: '#fef3c7', border: '1px solid #fde68a', fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                      {pendingCount + correcaoCount + needsFinalFileCount} em andamento
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 99, backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: 11, fontWeight: 700, color: '#15803d' }}>
                      Tudo em dia
                    </span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: '#78716c', margin: 0, marginTop: 3 }}>
                  Aprovações · Correções · Finalizações de layout
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                onClick={handleClickExportButton}
                data-testid="button-export-pdf"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                <Printer style={{ width: 12, height: 12 }} />
                {selectedItemIds.size > 0 ? `Exportar ${selectedItemIds.size} sel.` : 'Exportar PDF'}
              </button>
              <button
                onClick={openBookModal}
                data-testid="button-upload-book"
                title="Subir o PDF do book (layout pronto) e escolher as peças"
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#6d28d9', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <FileText style={{ width: 12, height: 12 }} />
                Subir book
              </button>
              {activeTab === "criar-aprovacoes" && (
                <label
                  data-testid="button-open-bulk-thumb"
                  style={{ height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  <FileImage style={{ width: 12, height: 12 }} />
                  Multi-Upload Thumbs
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
                </label>
              )}
              {activeTab === "criar-aprovacoes" && (
                <button
                  onClick={() => setShowBulkDialog(true)}
                  disabled={selectedItemIds.size === 0}
                  data-testid="button-open-bulk-upload"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 12px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: selectedItemIds.size > 0 ? '#44403c' : '#a8a29e', fontSize: 12, fontWeight: 600, cursor: selectedItemIds.size > 0 ? 'pointer' : 'not-allowed' }}
                >
                  <Upload style={{ width: 12, height: 12 }} />
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
                  style={{
                    flex: 1, padding: '14px 16px 12px', borderRadius: 12,
                    background: isActiveCard ? `${stat.accentColor}08` : '#fafaf9',
                    border: `1px solid ${isActiveCard ? `${stat.accentColor}30` : '#e7e5e4'}`,
                    cursor: targetTab ? 'pointer' : 'default',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    boxShadow: isActiveCard ? `inset 0 0 0 0 transparent` : 'none',
                    transition: 'all 0.15s',
                    position: 'relative', overflow: 'hidden',
                  }}
                >
                  {isActiveCard && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: stat.accentColor, borderRadius: '12px 12px 0 0' }} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isActiveCard ? stat.accentColor : '#78716c', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{stat.label}</span>
                    <span style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: isActiveCard ? `${stat.accentColor}18` : stat.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon style={{ width: 13, height: 13, color: stat.accentColor }} />
                    </span>
                  </div>
                  <span style={{ fontSize: 34, fontWeight: 800, color: isActiveCard ? stat.accentColor : '#1c1917', letterSpacing: '-0.05em', lineHeight: 1, fontFamily: '"Space Grotesk",sans-serif' }}>
                    {stat.value}
                  </span>
                  <div style={{ fontSize: 10, color: '#a8a29e' }}>{stat.sub}</div>
                  <div style={{ height: 3, borderRadius: 2, backgroundColor: '#e7e5e4', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, backgroundColor: stat.accentColor, borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Filter Row 1: search + dropdowns + period ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
              <Search style={{ width: 12, height: 12, color: '#a8a29e', position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                placeholder="Buscar arte, ID ou projeto..."
                data-testid="input-search-filter"
                style={{ width: '100%', height: 34, paddingLeft: 28, paddingRight: 10, borderRadius: 8, border: searchFilter ? '1px solid #f97316' : '1px solid #e7e5e4', backgroundColor: '#ffffff', color: '#1c1917', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '3px', borderRadius: 9, background: '#f5f5f4', border: '1px solid #e7e5e4' }}>
              {['Hoje', '7 dias', '15 dias', '30 dias', 'Todos'].map(p => (
                <button key={p} onClick={() => setPeriodFilter(p)}
                  style={{ height: 28, padding: '0 11px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: periodFilter === p ? 700 : 500, background: periodFilter === p ? '#ffffff' : 'transparent', color: periodFilter === p ? '#1c1917' : '#78716c', boxShadow: periodFilter === p ? '0 1px 3px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.12s' }}>
                  {p}
                </button>
              ))}
            </div>

            <button
              onClick={() => setNext10DaysFilter(!next10DaysFilter)}
              data-testid="button-next-10-days-filter"
              style={{ display: 'flex', alignItems: 'center', gap: 5, height: 34, padding: '0 11px', borderRadius: 8, border: next10DaysFilter ? '1px solid #f59e0b' : '1px solid #fde68a', background: next10DaysFilter ? '#fef3c7' : '#fffbeb', color: next10DaysFilter ? '#92400e' : '#b45309', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              <Truck style={{ width: 12, height: 12 }} /> Saída 10 dias
            </button>
          </div>

          {/* ── Filter Row 2: boolean toggles ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.10em', marginRight: 2 }}>Mostrar:</span>
            {([
              { key: 'urgente', label: 'Urgente', value: urgenteFilter, set: setUrgenteFilter, color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
              { key: 'semThumb', label: 'Sem thumb', value: semThumb, set: setSemThumb, color: '#b45309', bg: '#fffbeb', border: '#fcd34d' },
              { key: 'comThumb', label: 'Com thumb', value: comThumb, set: setComThumb, color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
              { key: 'semFinal', label: 'Sem arq. final', value: semFinal, set: setSemFinal, color: '#0369a1', bg: '#f0f9ff', border: '#7dd3fc' },
              { key: 'comFinal', label: 'Com arq. final', value: comFinal, set: setComFinal, color: '#15803d', bg: '#f0fdf4', border: '#86efac' },
            ] as { key: string; label: string; value: boolean; set: (v: boolean) => void; color: string; bg: string; border: string }[]).map(({ key, label, value, set, color, bg, border }) => (
              <button key={key} onClick={() => set(!value)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 26, padding: '0 10px', borderRadius: 99, cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.14s', border: value ? `1px solid ${border}` : '1px solid #e7e5e4', background: value ? bg : '#ffffff', color: value ? color : '#78716c' }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: value ? color : '#d6d3d1', flexShrink: 0 }} />
                {label}
              </button>
            ))}
          </div>

          {/* ── Active chips ── */}
          {activeChips.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.10em' }}>Ativos:</span>
              {activeChips.map(chip => (
                <span key={chip} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 11, fontWeight: 600, color: '#c2410c' }}>
                  {chip}
                  <button onClick={() => removeChipFilter(chip)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c2410c', display: 'inline-flex', alignItems: 'center', padding: 0 }}>
                    <X style={{ width: 9, height: 9 }} />
                  </button>
                </span>
              ))}
              <button onClick={clearAllFilters} data-testid="button-clear-filters" style={{ fontSize: 10, fontWeight: 600, color: '#78716c', background: 'none', border: '1px solid #e7e5e4', borderRadius: 99, cursor: 'pointer', padding: '2px 8px' }}>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 100, fontSize: 10, fontWeight: 800, padding: '0 5px', backgroundColor: isActive ? accent : '#e7e5e4', color: isActive ? '#fff' : '#78716c' }}>
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
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderRadius: 8, border: '1px solid #e7e5e4', background: '#ffffff', color: '#44403c', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                {selectedItemIds.size === filteredItems.length && filteredItems.length > 0
                  ? <><X style={{ width: 11, height: 11 }} /> Limpar seleção</>
                  : <><CheckSquare style={{ width: 11, height: 11 }} /> Selecionar tudo</>
                }
                {selectedItemIds.size > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, borderRadius: 100, fontSize: 9, fontWeight: 700, backgroundColor: '#1c1917', color: '#ffffff', padding: '0 4px' }}>
                    {selectedItemIds.size}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── 4. SCROLLABLE CONTENT AREA ────────────────────────────────────── */}
      <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', maxWidth: 1600, margin: '0 auto', width: '100%' }}>
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
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 420, borderRadius: 12, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 16px 32px -12px rgba(28,25,23,0.15)' }}>
          <DialogTitle className="sr-only">Dispensar Peça</DialogTitle>
          <DialogDescription className="sr-only">Dispensar peça da fila de arte</DialogDescription>
          <div style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <span style={{ display: 'inline-block', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700, color: '#dc2626', backgroundColor: 'rgba(255,218,214,0.5)', padding: '2px 8px', borderRadius: 4, marginBottom: 6 }}>Ação Irreversível</span>
                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', fontFamily: '"Space Grotesk", sans-serif', color: '#1c1917', margin: 0 }}>Dispensar Peça</h2>
              </div>
              <button onClick={() => { setDispenseItem(null); setDispenseReason(""); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a29e', padding: 2, borderRadius: 4 }}>
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
              <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#78716c' }}>Motivo (opcional)</label>
              <textarea
                value={dispenseReason}
                onChange={e => setDispenseReason(e.target.value)}
                placeholder="Ex: Peça sem necessidade de aprovação de patrocinador..."
                data-testid="textarea-dispense-reason"
                style={{ width: '100%', backgroundColor: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 8, padding: '10px 12px', fontSize: 12, resize: 'none', height: 72, outline: 'none', fontFamily: 'inherit', color: '#1c1917', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setDispenseItem(null); setDispenseReason(""); }} style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: '#f5f5f4', border: '1px solid #e7e5e4', color: '#78716c', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={() => dispenseItem && dispenseMutation.mutate({ itemId: dispenseItem.id, reason: dispenseReason })}
                disabled={dispenseMutation.isPending}
                data-testid="button-confirm-dispense"
                style={{ flex: 1, height: 38, borderRadius: 8, backgroundColor: '#dc2626', border: 'none', color: '#ffffff', fontSize: 13, fontWeight: 700, cursor: dispenseMutation.isPending ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: dispenseMutation.isPending ? 0.7 : 1 }}
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
        <DialogContent className="p-0 gap-0 max-h-[90vh] overflow-y-auto" style={{ maxWidth: 472, borderRadius: 16, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 24px 48px -12px rgba(28,25,23,0.22), 0 0 0 1px rgba(28,25,23,0.06)' }}>
          <DialogTitle className="sr-only">Enviar Nova Arte</DialogTitle>
          <DialogDescription className="sr-only">Reenvio de arte para patrocinadores</DialogDescription>

          {/* ── Dark header ── */}
          <div style={{ background: 'linear-gradient(135deg, #1c0a0a 0%, #2d1010 50%, #1c1917 100%)', borderRadius: '16px 16px 0 0', padding: '22px 24px 20px', position: 'relative', overflow: 'hidden' }}>
            {/* Subtle texture */}
            <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 80% 20%, rgba(220,38,38,0.12) 0%, transparent 60%)', pointerEvents: 'none' }} />
            {/* Close button */}
            <button
              onClick={() => { setCorrecaoItem(null); setCorrecaoThumbUrl(""); setCorrecaoFileName(""); setCorrecaoSelectedSponsorIds(new Set()); }}
              style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s', zIndex: 2 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              aria-label="Fechar"
            >
              <X style={{ width: 14, height: 14, color: 'rgba(255,255,255,0.75)' }} />
            </button>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, position: 'relative' }}>
              {/* Icon */}
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #dc2626, #991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(220,38,38,0.35)' }}>
                <AlertTriangle style={{ width: 20, height: 20, color: '#fff' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#fca5a5', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>Ação Necessária</div>
                <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.04em', fontFamily: '"Space Grotesk", sans-serif', color: '#fff', margin: 0, lineHeight: 1.2 }}>
                  Enviar Nova Arte
                </h2>
                {correcaoItem && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {correcaoItem.displayId && <span style={{ fontFamily: '"Space Grotesk", monospace', fontWeight: 700, color: 'rgba(252,165,165,0.7)', marginRight: 6 }}>{correcaoItem.displayId}</span>}
                    {correcaoItem.type}
                    {correcaoItem.description && correcaoItem.description !== correcaoItem.type && <span style={{ color: 'rgba(255,255,255,0.3)' }}> · {correcaoItem.description}</span>}
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
                    <div key={approval.id} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #fecaca' }}>
                      {/* Sponsor bar */}
                      <div style={{ backgroundColor: '#fff1f1', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: '1px solid #fecaca' }}>
                        {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#991b1b', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 4, padding: '1px 6px', letterSpacing: '0.04em' }}>RECUSADO</span>
                      </div>
                      {/* Reason */}
                      <div style={{ backgroundColor: '#fffafa', padding: '10px 14px' }}>
                        <p style={{ fontSize: 12, color: '#7f1d1d', margin: 0, lineHeight: 1.55, fontStyle: approval.rejectionReason ? 'italic' : 'normal' }}>
                          {approval.rejectionReason ? `"${approval.rejectionReason}"` : <span style={{ color: '#b45309', fontStyle: 'normal' }}>Sem motivo informado.</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Upload zone */}
                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: 8 }}>
                    Nova Versão
                  </label>
                  {correcaoThumbUrl ? (
                    /* Uploaded state — compact pill row */
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, backgroundColor: '#f0fdf4', border: '1.5px solid #86efac' }}>
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
                      <p style={{ fontSize: 10, color: '#b8b3ad', margin: '3px 0 0' }}>
                        {isPasteUploading ? 'Aguarde...' : 'PDF, PNG, SVG · ou Ctrl+V para colar'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Sponsor checkboxes */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', marginBottom: 8 }}>
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
                            padding: '10px 14px', borderRadius: 10, cursor: 'pointer', userSelect: 'none',
                            backgroundColor: isSelected ? '#fff5f5' : '#fafaf9',
                            border: `1.5px solid ${isSelected ? '#fecaca' : '#ebe8e3'}`,
                            transition: 'all 0.12s'
                          }}
                        >
                          {/* Custom checkbox */}
                          <div
                            style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${isSelected ? '#dc2626' : '#d4d4d0'}`, background: isSelected ? '#dc2626' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}
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
                          <span style={{ fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 4, padding: '2px 7px', letterSpacing: '0.04em' }}>
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
                width: '100%', padding: '13px 0', borderRadius: 10, border: 'none',
                background: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending)
                  ? 'linear-gradient(135deg, #fca5a5, #f87171)'
                  : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#ffffff', fontWeight: 700, fontSize: 15,
                fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.02em',
                cursor: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? 'not-allowed' : 'pointer',
                boxShadow: (!correcaoThumbUrl || correcaoSelectedSponsorIds.size === 0 || resubmitMutation.isPending) ? 'none' : '0 4px 16px rgba(185,28,28,0.28)',
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
              <span style={{ fontSize: 10, backgroundColor: ['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? '#dcfce7' : '#fef9c3', color: ['sponsor_approved', 'awaiting_creator_review'].includes(selectedItem.status) ? '#15803d' : '#a16207', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
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
                      <a href={selectedItem.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: '#16a34a', textDecoration: 'underline' }}>
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
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>⚠ Thumb substituído — versão anterior guardada</span>
                  <a href={selectedItem.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#78716c', wordBreak: 'break-all', textDecoration: 'underline' }}>
                    {selectedItem.previousApprovalThumbUrl.split('/').pop() || selectedItem.previousApprovalThumbUrl}
                  </a>
                </div>
              )}

              {/* Arquivo anterior — exibido quando Arte substitui o arquivo enviado */}
              {selectedItem.previousFinalFileUrl && (
                <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.1em' }}>⚠ Substituindo — arquivo anterior gravado</span>
                  <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: '#78716c', wordBreak: 'break-all' }}>
                    {selectedItem.previousFinalFileName || selectedItem.previousFinalFileUrl}
                  </span>
                </div>
              )}

              {/* Caminho do arquivo final (rede) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(20,83,45,0.6)', paddingLeft: 4 }}>
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

                    {/* Salvar thumb sem enviar (rascunho) */}
                    <button
                      onClick={handleSaveThumbDraft}
                      disabled={saveThumbDraftMutation.isPending || submitForApprovalMutation.isPending}
                      data-testid="button-save-thumb-draft"
                      style={{
                        width: '100%', padding: '12px 0', borderRadius: 8,
                        border: '1.5px solid #ddd6fe', background: '#ffffff',
                        color: '#7c3aed', fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700,
                        fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em',
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
                    background: (isPasteUploading || isDragOver) ? 'rgba(237,233,254,0.8)' : 'rgba(250,245,255,0.5)', backdropFilter: 'blur(8px)',
                    border: (isPasteUploading || isDragOver) ? '2px dashed #7c3aed' : '1px dashed #ddd6fe', borderRadius: 12, padding: 32,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', gap: 12, cursor: 'pointer', transition: 'background 0.15s'
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
                        {isPasteUploading ? 'Enviando imagem...' : 'Upload de Miniatura'}
                      </p>
                      <p style={{ fontSize: 12, color: 'rgba(59,7,100,0.6)', margin: 0 }}>
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
                        buttonClassName="mt-2 text-[11px] font-bold uppercase tracking-wider bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 hover:text-white transition-all"
                      >
                        Fazer Upload do Thumb
                      </FileUploader>
                    )}
                    {!isPasteUploading && (
                      <p style={{ fontSize: 10, color: '#c4b5fd', margin: '-4px 0 0', fontWeight: 600, letterSpacing: '0.05em' }}>
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

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — EXPORT PDF (componente compartilhado)                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <ExportPdfDialog open={showExportModal} onOpenChange={setShowExportModal} items={arteItemsPool} title="Arte" />

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* MODAL — SUBIR BOOK (PDF) e escolher as peças cobertas               */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showBookModal} onOpenChange={setShowBookModal}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 600, width: '95vw', borderRadius: 14, overflow: 'hidden', border: 'none', boxShadow: '0 24px 48px -12px rgba(28,25,23,0.22)' }}>
          <DialogTitle className="sr-only">Subir book de aprovação</DialogTitle>
          <DialogDescription className="sr-only">Envie o PDF do book e selecione as peças que ele cobre</DialogDescription>

          {/* ── Header escuro ── */}
          <div style={{ padding: '22px 28px 18px', background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderRadius: '14px 14px 0 0' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 10px rgba(249,115,22,0.35)' }}>
                  <FileText style={{ width: 15, height: 15, color: '#fff' }} />
                </div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#ffffff', margin: 0, fontFamily: '"Space Grotesk", sans-serif', letterSpacing: '-0.03em' }}>Subir book (PDF)</h2>
              </div>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.50)', margin: '0 0 0 42px', lineHeight: 1.4 }}>
                Envie o layout pronto e marque as peças cobertas — serão enviadas aos patrocinadores.
              </p>
            </div>
            <button
              onClick={() => setShowBookModal(false)}
              style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* ── Body ── */}
          <div style={{ padding: '22px 28px', display: 'flex', flexDirection: 'column', gap: 18, maxHeight: '62vh', overflowY: 'auto', backgroundColor: '#fafaf9' }}>

            {/* Evento */}
            <div>
              <label style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', display: 'block', marginBottom: 6 }}>Evento</label>
              <FilterSelect
                fullWidth hideWhenEmpty={false} showAllLabelWhenEmpty
                label="Evento" allLabel="Selecione um evento"
                value={bookEventId || "all"} onChange={v => setBookEventId(v === "all" ? "" : v)}
                options={bookEventOptions}
                searchPlaceholder="Buscar evento..." emptyText="Nenhum evento com peças na Arte."
              />
            </div>

            {/* Upload do PDF */}
            <div>
              <label style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', display: 'block', marginBottom: 6 }}>Arquivo do book</label>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10,
                border: `1.5px dashed ${bookFileUrl ? '#f97316' : '#d4d4d0'}`,
                background: bookFileUrl ? '#fff7ed' : '#ffffff',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { if (!bookFileUrl) { (e.currentTarget as HTMLLabelElement).style.borderColor = '#a8a29e'; (e.currentTarget as HTMLLabelElement).style.background = '#f5f5f4'; } }}
                onMouseLeave={e => { if (!bookFileUrl) { (e.currentTarget as HTMLLabelElement).style.borderColor = '#d4d4d0'; (e.currentTarget as HTMLLabelElement).style.background = '#ffffff'; } }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: bookFileUrl ? 'linear-gradient(135deg,#f97316,#ea580c)' : '#f3f4f3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', boxShadow: bookFileUrl ? '0 3px 8px rgba(249,115,22,0.28)' : 'none' }}>
                  {bookUploading
                    ? <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(249,115,22,0.3)', borderTopColor: '#f97316', animation: 'spin 0.8s linear infinite' }} />
                    : <FileText style={{ width: 16, height: 16, color: bookFileUrl ? '#fff' : '#a8a29e' }} />
                  }
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: bookFileUrl ? '#c2410c' : '#78716c', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bookUploading ? 'Enviando arquivo…' : bookFileName || 'Escolher PDF do book…'}
                  </p>
                  {!bookFileUrl && !bookUploading && (
                    <p style={{ fontSize: 10, color: '#a8a29e', margin: '1px 0 0' }}>Somente arquivos .PDF</p>
                  )}
                  {bookFileUrl && (
                    <p style={{ fontSize: 10, color: '#f97316', margin: '1px 0 0', fontWeight: 600 }}>✓ Arquivo carregado</p>
                  )}
                </div>
                {bookFileUrl && <span style={{ fontSize: 10, fontWeight: 700, color: '#f97316', flexShrink: 0 }}>Trocar</span>}
                <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                  onChange={e => { handleBookFile(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>

            {/* Peças do evento */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e' }}>Peças no book</span>
                  {bookEventPieces.length > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif' }}>
                      {bookSelectedIds.size}<span style={{ fontWeight: 500, color: '#a8a29e' }}> / {bookEventPieces.length}</span>
                    </span>
                  )}
                </div>
                {bookEventPieces.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button onClick={() => setBookSelectedIds(new Set(bookEventPieces.map((i: any) => i.id)))}
                      style={{ background: 'none', border: 'none', padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#57534e', cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f0efee'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >Todas</button>
                    <span style={{ color: '#d4d4d0' }}>·</span>
                    <button onClick={() => setBookSelectedIds(new Set())}
                      style={{ background: 'none', border: 'none', padding: '3px 8px', fontSize: 11, fontWeight: 700, color: '#57534e', cursor: 'pointer', borderRadius: 6, transition: 'background 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f0efee'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >Nenhuma</button>
                  </div>
                )}
              </div>
              <div style={{ border: '1px solid #ebe8e3', borderRadius: 10, maxHeight: 240, overflowY: 'auto', backgroundColor: '#ffffff' }}>
                {bookEventPieces.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 20px', gap: 8 }}>
                    <FileText style={{ width: 26, height: 26, color: '#d4d4d0' }} />
                    <p style={{ fontSize: 12, color: '#a8a29e', margin: 0, textAlign: 'center' }}>Selecione um evento para ver as peças disponíveis.</p>
                  </div>
                ) : bookEventPieces.map((item: any, idx: number) => {
                  const on = bookSelectedIds.has(item.id);
                  const isLast = idx === bookEventPieces.length - 1;
                  return (
                    <div key={item.id}
                      onClick={() => setBookSelectedIds(prev => { const n = new Set(prev); if (n.has(item.id)) n.delete(item.id); else n.add(item.id); return n; })}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid #f5f4f2', cursor: 'pointer', background: on ? '#fff7ed' : '#ffffff', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (!on) e.currentTarget.style.background = '#fafaf9'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = on ? '#fff7ed' : '#ffffff'; }}
                    >
                      <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, border: `2px solid ${on ? '#f97316' : '#d4d4d0'}`, background: on ? '#f97316' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                        {on && <Check style={{ width: 9, height: 9, color: '#fff' }} />}
                      </div>
                      <span style={{ fontFamily: '"Space Grotesk", monospace', fontSize: 10, fontWeight: 800, color: on ? '#c2410c' : '#a8a29e', background: on ? '#fed7aa' : '#f0efee', padding: '2px 6px', borderRadius: 4, flexShrink: 0, letterSpacing: '0.02em', transition: 'all 0.12s' }}>{item.displayId}</span>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                          {groupOf(item.type) && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: on ? '#f97316' : '#b8b3ad', background: on ? '#fff7ed' : '#f5f4f2', border: `1px solid ${on ? '#fed7aa' : '#ebe8e3'}`, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0, letterSpacing: '0.03em', transition: 'all 0.12s' }}>{groupOf(item.type)}</span>
                          )}
                          <span style={{ fontSize: 12, fontWeight: 600, color: on ? '#1c1917' : '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', transition: 'color 0.1s' }}>{item.type}</span>
                        </div>
                        {item.description && item.description !== item.type && (
                          <span style={{ fontSize: 10, color: '#a8a29e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.description}</span>
                        )}
                      </span>
                      {item.bookUrl && (
                        <span title="Já tem book" style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 9, fontWeight: 800, color: '#92400e', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.04em' }}>BOOK</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '14px 28px', borderTop: '1px solid #ebe8e3', display: 'flex', gap: 10, justifyContent: 'flex-end', backgroundColor: '#ffffff' }}>
            <button onClick={() => setShowBookModal(false)}
              style={{ height: 38, padding: '0 16px', borderRadius: 8, background: 'transparent', border: '1px solid #e7e5e4', color: '#78716c', fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >Cancelar</button>
            <button
              onClick={() => saveBookMutation.mutate()}
              disabled={!bookFileUrl || bookSelectedIds.size === 0 || saveBookMutation.isPending}
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
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 980, width: '95vw', borderRadius: 14, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 24px 48px -12px rgba(28,25,23,0.18)' }}>
          <DialogTitle className="sr-only">Multi-Upload de Thumbs</DialogTitle>
          <DialogDescription className="sr-only">Upload em lote de miniaturas de aprovação</DialogDescription>

          {/* ── Header ── */}
          <div style={{ padding: '24px 32px 18px', borderBottom: '1px solid #f0ede8', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', borderRadius: '14px 14px 0 0' }}>
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
              style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X style={{ width: 18, height: 18 }} />
            </button>
          </div>

          {/* ── Body — 2 columns ── */}
          <div style={{ display: 'flex', height: 580, overflow: 'hidden' }}>

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
                    width: 44, height: 44, borderRadius: 11,
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
                    <p style={{ fontSize: 10, color: '#a8a29e', margin: 0, letterSpacing: '0.04em' }}>JPG · PNG · WEBP · SVG</p>
                  </div>
                </div>
              </div>

              {/* ── Divider ── */}
              <div style={{ margin: '0 18px', borderTop: '1px solid #ebe8e3' }} />

              {/* ── Event filter ── */}
              <div style={{ padding: '14px 18px 0' }}>
                <p style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', margin: '0 0 6px' }}>Evento</p>
                {(() => {
                  const sortedEvts = [...(events as any[])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                  const selEvt = sortedEvts.find(e => e.id === bulkThumbEventFilter);
                  return (
                    <Popover open={bulkThumbEventComboOpen} onOpenChange={setBulkThumbEventComboOpen}>
                      <PopoverTrigger asChild>
                        <button style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          height: 34, borderRadius: 8, border: '1px solid #e7e5e4',
                          backgroundColor: '#ffffff', fontSize: 12, fontWeight: 600,
                          color: selEvt ? '#1c1917' : '#78716c', padding: '0 10px', cursor: 'pointer', outline: 'none',
                        }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {selEvt ? selEvt.name : 'Todos os eventos'}
                          </span>
                          <ChevronsUpDown style={{ width: 12, height: 12, color: '#a8a29e', flexShrink: 0 }} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="p-0" style={{ width: 260 }} align="start">
                        <Command>
                          <CommandInput placeholder="Buscar evento..." />
                          <CommandList>
                            <CommandEmpty>Nenhum evento encontrado.</CommandEmpty>
                            <CommandGroup>
                              <CommandItem value="all" onSelect={() => { setBulkThumbEventFilter("all"); setBulkThumbEventComboOpen(false); }}>
                                <Check style={{ width: 12, height: 12, opacity: bulkThumbEventFilter === "all" ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
                                Todos os eventos
                              </CommandItem>
                              {sortedEvts.map((ev: any) => (
                                <CommandItem key={ev.id} value={ev.name} onSelect={() => { setBulkThumbEventFilter(ev.id); setBulkThumbEventComboOpen(false); }}>
                                  <Check style={{ width: 12, height: 12, opacity: bulkThumbEventFilter === ev.id ? 1 : 0, marginRight: 8, flexShrink: 0 }} />
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
              </div>

              {/* ── Resumo ── */}
              <div style={{ padding: '14px 18px 0' }}>
                <p style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#a8a29e', margin: '0 0 8px' }}>Resumo</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[
                    { label: 'Vinculados',  count: bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length,  dot: '#16a34a', color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Sem vínculo', count: bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length, dot: '#f59e0b', color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Concluídos', count: bulkThumbEntries.filter(e => e.status === 'done').length,   dot: '#7c3aed', color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
                    { label: 'Erro',       count: bulkThumbEntries.filter(e => e.status === 'error').length,  dot: '#dc2626', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                  ].map(s => (
                    <div key={s.label} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '6px 10px', borderRadius: 7,
                      backgroundColor: s.count > 0 ? s.bg : 'transparent',
                      border: `1px solid ${s.count > 0 ? s.border : '#ebe8e3'}`,
                      transition: 'all 0.15s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.count > 0 ? s.dot : '#d4d4d0', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: s.count > 0 ? s.color : '#a8a29e' }}>{s.label}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color: s.count > 0 ? s.color : '#d4d4d0', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1 }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* ── Footer actions ── */}
              <div style={{ padding: '14px 18px', borderTop: '1px solid #ebe8e3', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {bulkThumbEntries.filter(e => e.status === 'done').length > 0 && (
                  <button
                    onClick={() => setBulkThumbEntries(prev => prev.filter(e => e.status !== 'done'))}
                    style={{ width: '100%', height: 32, borderRadius: 7, background: 'none', border: '1px solid #e7e5e4', color: '#78716c', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >Limpar concluídos</button>
                )}
                <button
                  onClick={() => { if (!bulkThumbRunning) { setShowBulkThumbModal(false); setBulkThumbEntries([]); setBulkThumbEventFilter("all"); } }}
                  style={{ width: '100%', height: 32, borderRadius: 7, background: 'transparent', border: '1px solid #e7e5e4', color: '#78716c', cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'background 0.12s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f4'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >Cancelar</button>
                <button
                  onClick={handleBulkThumbSaveDraft}
                  disabled={bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0}
                  data-testid="button-bulk-thumb-save-draft"
                  style={{
                    width: '100%', height: 36, borderRadius: 7,
                    backgroundColor: '#ffffff',
                    border: `1.5px solid ${(bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? '#e7e5e4' : '#ddd6fe'}`,
                    color: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? '#a8a29e' : '#7c3aed',
                    fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    cursor: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!bulkThumbRunning && bulkThumbEntries.filter(x => x.matchedItemId && x.status === 'pending').length > 0) e.currentTarget.style.backgroundColor = '#faf5ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
                >
                  <FileImage style={{ width: 12, height: 12 }} />
                  Salvar {bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length} thumb(s) sem enviar
                </button>
                <button
                  onClick={handleBulkThumbUpload}
                  disabled={bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0}
                  data-testid="button-bulk-thumb-confirm"
                  style={{
                    width: '100%', height: 42, borderRadius: 8,
                    background: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0)
                      ? '#e7e5e4' : 'linear-gradient(135deg,#16a34a,#15803d)',
                    border: 'none',
                    color: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? '#a8a29e' : '#ffffff',
                    fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    cursor: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? 'not-allowed' : 'pointer',
                    boxShadow: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? 'none' : '0 4px 12px rgba(21,128,61,0.28)',
                    transition: 'all 0.15s',
                    letterSpacing: '-0.01em',
                  }}
                  onMouseEnter={e => { if (!bulkThumbRunning) e.currentTarget.style.filter = 'brightness(1.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                >
                  {bulkThumbRunning
                    ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Enviando...</>
                    : <><Send style={{ width: 14, height: 14 }} />Enviar {bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length} thumb(s)</>
                  }
                </button>
              </div>
            </div>

            {/* ══════════════════════════════════════
                Right panel — lista de arquivos
            ══════════════════════════════════════ */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f7f6f5' }}>
              {bulkThumbEntries.length === 0 ? (
                /* ── Empty state ── */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <div style={{ width: 72, height: 72, borderRadius: 18, background: 'linear-gradient(135deg,#f97316,#ea580c)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 24px rgba(249,115,22,0.25)', opacity: 0.4 }}>
                    <Upload style={{ width: 30, height: 30, color: '#fff' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#78716c', margin: '0 0 6px' }}>Nenhuma imagem adicionada</p>
                    <p style={{ fontSize: 12, color: '#a8a29e', margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
                      Arraste para a área ao lado ou clique para selecionar
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    {['JPG', 'PNG', 'WEBP', 'SVG'].map(f => (
                      <span key={f} style={{ padding: '3px 10px', borderRadius: 20, backgroundColor: '#ebe8e3', fontSize: 9, fontWeight: 800, color: '#a8a29e', letterSpacing: '0.08em' }}>{f}</span>
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
                            {linked > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 700, border: '1px solid #bbf7d0' }}>{linked} vinculado{linked !== 1 ? 's' : ''}</span>}
                            {unlinked > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, backgroundColor: '#fff7ed', color: '#c2410c', fontSize: 10, fontWeight: 700, border: '1px solid #fed7aa' }}>{unlinked} sem vínculo</span>}
                            {done > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, backgroundColor: '#f5f3ff', color: '#7c3aed', fontSize: 10, fontWeight: 700, border: '1px solid #ddd6fe' }}>{done} enviado{done !== 1 ? 's' : ''}</span>}
                            {err > 0 && <span style={{ padding: '2px 8px', borderRadius: 20, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700, border: '1px solid #fecaca' }}>{err} erro{err !== 1 ? 's' : ''}</span>}
                          </>
                        );
                      })()}
                    </div>
                    <span style={{ fontSize: 10, color: '#b8b3ad', fontStyle: 'italic' }}>Confirme o vínculo de cada imagem</span>
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
                          borderRadius: 10, border: `1.5px solid ${cardBorderColor}`,
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
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 20, backgroundColor: '#15803d', color: '#ffffff', fontSize: 8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  <CheckCircle style={{ width: 8, height: 8 }} /> OK
                                </span>
                              )}
                              {entry.status === 'uploading' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 20, backgroundColor: '#7c3aed', color: '#ffffff', fontSize: 8, fontWeight: 800, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                                </span>
                              )}
                              {entry.status === 'error' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 20, backgroundColor: '#dc2626', color: '#ffffff', fontSize: 8, fontWeight: 800, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>
                                  Erro
                                </span>
                              )}
                              {entry.status === 'pending' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 20, backgroundColor: isLinked ? '#1d4ed8' : '#d97706', color: '#ffffff', fontSize: 8, fontWeight: 800, boxShadow: '0 1px 4px rgba(0,0,0,0.2)', whiteSpace: 'nowrap' }}>
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
                                <p style={{ fontSize: 10, color: '#a8a29e', margin: 0 }}>
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
                                  <X style={{ width: 10, height: 10, color: '#a8a29e' }} />
                                </button>
                              )}
                            </div>

                            {/* ── State-specific content ── */}
                            {entry.status === 'done' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 8px', borderRadius: 6, backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}>
                                <CheckCircle style={{ width: 11, height: 11, color: '#16a34a', flexShrink: 0 }} />
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#15803d', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', margin: '0 0 1px' }}>Falha no envio</p>
                                <p style={{ fontSize: 9, color: '#f87171', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.errorMsg}</p>
                              </div>
                            ) : isLinked && matchedItem ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, padding: '5px 8px', borderRadius: 6, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', minWidth: 0 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontSize: 9, fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{matchedItem.displayId}</span>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#1e3a5f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.type}</span>
                                  </div>
                                  {matchedItem.event?.name && (
                                    <p style={{ fontSize: 9, color: '#60a5fa', margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.event.name}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null } : en))}
                                  title="Trocar vínculo"
                                  style={{ flexShrink: 0, background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: '#3b82f6', fontSize: 9, fontWeight: 700, transition: 'all 0.12s' }}
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
                                          border: `1.5px solid ${isLinked ? '#93c5fd' : '#fbbf24'}`,
                                          backgroundColor: '#ffffff', fontSize: 10, fontWeight: 600,
                                          color: linked ? '#1c1917' : '#78716c', padding: '0 6px', cursor: 'pointer', outline: 'none',
                                        }}>
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {linked
                                              ? `${linked.displayId} · ${linked.type}`
                                              : '— Vincular manualmente —'}
                                          </span>
                                          <ChevronsUpDown style={{ width: 10, height: 10, color: '#a8a29e', flexShrink: 0 }} />
                                        </button>
                                      </PopoverTrigger>
                                      <PopoverContent className="p-0" style={{ width: 320 }} align="start">
                                        <Command>
                                          <CommandInput placeholder="Buscar por ID, tipo ou descrição..." />
                                          <CommandList style={{ maxHeight: 280 }}>
                                            <CommandEmpty>Nenhuma peça encontrada.</CommandEmpty>
                                            {pendingPool.length === 0 && (
                                              <div style={{ padding: '12px 16px', fontSize: 11, color: '#b45309', fontWeight: 600, lineHeight: 1.5 }}>
                                                Nenhuma peça pronta para receber thumb
                                                {bulkThumbEventFilter !== "all" ? " neste evento" : ""}.
                                                <span style={{ display: 'block', fontWeight: 500, color: '#78716c', marginTop: 4 }}>
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
                                                      onSelect={() => {
                                                        setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: item.id } : en));
                                                        setBulkThumbLinkOpenMap(prev => ({ ...prev, [entry.id]: false }));
                                                      }}
                                                    >
                                                      <Check style={{ width: 10, height: 10, opacity: entry.matchedItemId === item.id ? 1 : 0, marginRight: 6, flexShrink: 0 }} />
                                                      <div style={{ overflow: 'hidden' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                          <span style={{ fontSize: 11, fontWeight: 800, color: '#1c1917', fontFamily: '"Space Grotesk", sans-serif', flexShrink: 0 }}>{item.displayId}</span>
                                                          <span style={{ fontSize: 10, color: '#57534e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</span>
                                                        </div>
                                                        {(item.description || evtName) && (
                                                          <div style={{ fontSize: 10, color: '#a8a29e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                                                            {item.description ? item.description.slice(0, 40) : evtName}
                                                          </div>
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
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}
