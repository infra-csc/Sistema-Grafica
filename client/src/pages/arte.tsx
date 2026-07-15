import { useQuery, useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/status-badge";
import { SponsorChips } from "@/components/sponsor-chips";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, AlertTriangle, Eye, Calendar, Truck, Check, ChevronsUpDown, Search, Upload, FileImage, File, Clock, Package, Send, FolderOpen, FileText, RotateCcw, X, Star, ArrowRight, Paperclip, Ban, Printer, ChevronDown, LayoutList, Layers, CheckSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn, parseDateLocal } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Fragment, useState, useMemo, useEffect, useCallback } from "react";
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
  const [exportMode, setExportMode] = useState<"individual" | "grouped">("individual");
  const [exportSelectedGroupKeys, setExportSelectedGroupKeys] = useState<Set<string>>(new Set());
  type ExportGroup = { key: string; event: string; groupName: string; typeName: string; items: any[] };
  const [exportGroups, setExportGroups] = useState<ExportGroup[]>([]);

  const pdfStyles = `
    @page { size: A4 portrait; margin: 12mm 14mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #1c1917; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  `;

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
      } catch {}
    }));
    return out;
  };

  // ── Modo único: uma prova por página ────────────────────────────────────────
  const exportItemsToPDF = async (items: any[], title = "Arte — Peças") => {
    if (items.length === 0) {
      toast({ title: "Nenhum item para exportar", variant: "destructive" });
      return;
    }

    // Pre-fetch imagens como data URIs antes de abrir a janela
    const thumbCount = items.filter(i => i.approvalThumbUrl && !/\.pdf$/i.test(i.approvalThumbUrl)).length;
    if (thumbCount > 0) {
      toast({ title: `Preparando ${thumbCount} imagem${thumbCount !== 1 ? "ns" : ""}…`, description: "Aguarde um momento" });
    }
    const thumbDataUris = await prefetchThumbsAsDataUris(items);

    const win = window.open("", "_blank");
    if (!win) return;

    const now = new Date();
    const nowStr = now.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const logoUrl = `${window.location.origin}/norte-logo.jpg`;

    const pages = items.map((item, idx) => {
      const thumbUrl = item.approvalThumbUrl || "";
      // Use pre-fetched data URI when available; fall back only for truly external/PDF URLs
      const thumbDataUri = thumbDataUris[thumbUrl] || null;
      const isImg = !!thumbDataUri;
      const resolvedThumb = thumbDataUri || "";

      const visualW = parseFloat(item.visualWidth) || 0;
      const visualH = parseFloat(item.visualHeight) || 0;
      const fileW   = parseFloat(item.fileWidth)   || 0;
      const fileH   = parseFloat(item.fileHeight)  || 0;

      const dimsVisual = visualW && visualH ? `${visualW} × ${visualH} m` : (item.measurement || "—");
      const dimsSang   = fileW && fileH ? `${fileW} × ${fileH} m` : "";
      const m2Val = item.calculatedM2 ? parseFloat(item.calculatedM2).toFixed(2) : "";

      const sponsorsHtml = item.sponsors?.length
        ? item.sponsors.map((s: any) => {
            const c = s.color || "#3b82f6";
            return `<span class="sp-chip" style="border-color:${c}33;background:${c}11"><span class="sp-dot" style="background:${c}"></span>${s.name}</span>`;
          }).join("")
        : "";

      const pageNum = `${idx + 1} / ${items.length}`;
      const itemName = item.description || item.type || "Sem nome";
      const typeLabel = item.type || "—";

      return `
        <div class="page">

          <!-- HEADER -->
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

          <!-- TÍTULO DA PEÇA -->
          <div class="piece-title-bar">
            <span class="piece-name">${itemName}</span>
            <span class="type-badge">${typeLabel}</span>
          </div>

          <!-- CORPO -->
          <div class="body">

            <!-- Coluna esquerda: imagem -->
            <div class="col-img">
              <div class="img-frame">
                ${isImg
                  ? `<img src="${resolvedThumb}" alt="Referência" class="ref-img" />`
                  : thumbUrl
                    ? `<div class="no-img"><div class="no-img-icon">PDF</div><div class="no-img-sub">Arquivo PDF vinculado</div></div>`
                    : `<div class="no-img"><div class="no-img-icon">—</div><div class="no-img-sub">Sem imagem de referência</div></div>`
                }
              </div>
              <div class="img-caption">Foto de referência</div>
            </div>

            <!-- Coluna direita: ficha técnica -->
            <div class="col-info">
              <div class="info-card">

                <!-- Identificação -->
                <div class="sec-label">Identificação</div>
                ${item.description ? `
                <div class="field">
                  <div class="fld-lbl">Descrição</div>
                  <div class="fld-val">${item.description}</div>
                </div>` : ""}
                <div class="field">
                  <div class="fld-lbl">Quantidade</div>
                  <div class="fld-val qty-val">${item.quantity ? item.quantity + " un." : "—"}</div>
                </div>

                <div class="sep"></div>

                <!-- Especificação Técnica -->
                <div class="sec-label">Especificação Técnica</div>
                <div class="field">
                  <div class="fld-lbl">Medidas Visuais</div>
                  <div class="fld-val dims-val">${dimsVisual}</div>
                  ${dimsSang ? `<div class="fld-sub">Sangria: ${dimsSang}</div>` : ""}
                </div>
                ${m2Val ? `
                <div class="field">
                  <div class="fld-lbl">Área (m²)</div>
                  <div class="fld-val"><span class="m2-badge">${m2Val} m²</span></div>
                </div>` : ""}
                ${item.material ? `
                <div class="field">
                  <div class="fld-lbl">Material</div>
                  <div class="fld-val"><span class="mat-badge">${item.material}</span></div>
                </div>` : ""}
                ${item.finish ? `
                <div class="field">
                  <div class="fld-lbl">Acabamento</div>
                  <div class="fld-val"><span class="mat-badge">${item.finish}</span></div>
                </div>` : ""}

                ${item.observations ? `
                <div class="sep"></div>
                <div class="sec-label">Observações</div>
                <div class="obs-box">${item.observations}</div>
                ` : ""}

                ${sponsorsHtml ? `
                <div class="sep"></div>
                <div class="sec-label">Patrocinadores</div>
                <div class="sponsors-wrap">${sponsorsHtml}</div>
                ` : ""}

              </div>
            </div>

          </div>

          <!-- RODAPÉ -->
          <div class="doc-footer">
            <span class="ft-gen">Gerado em ${nowStr}</span>
            <span class="ft-pg">Página ${pageNum}</span>
          </div>

        </div>
      `;
    }).join("");

    win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
      <meta charset="UTF-8"/>
      <title>${title}</title>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@500;700&display=swap" rel="stylesheet"/>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #0f172a; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        /* ── Page container ── */
        .page { width: 100vw; min-height: 100vh; display: flex; flex-direction: column; break-after: page; page-break-after: always; background: #ffffff; }
        .page:last-child { break-after: avoid; page-break-after: avoid; }
        @media print { .page { width: 210mm; min-height: 297mm; } }

        /* ── HEADER ── */
        .doc-header { display: flex; align-items: center; justify-content: space-between; background: #1c1917; padding: 14px 32px; flex-shrink: 0; }
        .hdr-left { display: flex; align-items: center; gap: 12px; }
        .hdr-logo { height: 34px; width: auto; object-fit: contain; display: block; flex-shrink: 0; }
        .hdr-brand { display: flex; flex-direction: column; gap: 1px; }
        .hdr-norte { font-family: 'Space Grotesk', sans-serif; font-size: 15px; font-weight: 800; color: #ffffff; letter-spacing: 0.04em; line-height: 1; }
        .hdr-sub { font-size: 10px; font-weight: 400; color: rgba(255,255,255,0.55); line-height: 1; }
        .hdr-right { flex-shrink: 0; }
        .id-chip { font-family: 'DM Mono', 'Courier New', monospace; font-size: 16px; font-weight: 700; color: #ffffff; background: #f97316; padding: 6px 14px; border-radius: 8px; letter-spacing: 0.02em; }

        /* ── TÍTULO DA PEÇA ── */
        .piece-title-bar { padding: 16px 32px; background: #ffffff; border-bottom: 1px solid #e2e8f0; flex-shrink: 0; }
        .piece-name { display: block; font-family: 'Space Grotesk', sans-serif; font-size: 22px; font-weight: 800; color: #0f172a; line-height: 1.2; letter-spacing: -0.02em; }
        .type-badge { display: inline-block; margin-top: 6px; background: #fff7ed; border: 1px solid #fed7aa; color: #c2410c; border-radius: 100px; font-size: 11px; font-weight: 600; padding: 3px 12px; }

        /* ── CORPO ── */
        .body { display: flex; gap: 0; flex: 1; padding: 24px 32px; gap: 24px; min-height: 0; }

        /* ── Coluna imagem ── */
        .col-img { flex: 0 0 58%; display: flex; flex-direction: column; gap: 0; }
        .img-frame { flex: 1; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; background: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 320px; max-height: 420px; }
        .ref-img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .no-img { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 20px; width: 100%; }
        .no-img-icon { font-size: 28px; font-weight: 800; color: #cbd5e1; font-family: 'DM Mono', monospace; }
        .no-img-sub { font-size: 11px; color: #94a3b8; }
        .img-caption { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 7px; }

        /* ── Coluna info ── */
        .col-info { flex: 0 0 42%; display: flex; flex-direction: column; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; flex: 1; }

        .sec-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #94a3b8; margin-bottom: 10px; }
        .sep { height: 1px; background: #e2e8f0; margin: 14px 0; }

        .field { margin-bottom: 12px; }
        .field:last-child { margin-bottom: 0; }
        .fld-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #94a3b8; margin-bottom: 2px; }
        .fld-val { font-size: 14px; font-weight: 700; color: #0f172a; line-height: 1.3; }
        .fld-sub { font-size: 10px; color: #64748b; margin-top: 2px; }

        .qty-val { font-size: 16px; font-weight: 800; color: #f97316; }
        .dims-val { font-size: 16px; font-weight: 800; color: #0f172a; }

        .m2-badge { display: inline-block; background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; border-radius: 6px; padding: 3px 10px; font-weight: 700; font-size: 13px; }
        .mat-badge { display: inline-block; background: #f1f5f9; border: 1px solid #e2e8f0; color: #475569; border-radius: 6px; padding: 3px 10px; font-size: 12px; font-weight: 600; }

        .obs-box { font-size: 12px; color: #64748b; font-style: italic; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; line-height: 1.5; margin-bottom: 0; }

        .sponsors-wrap { display: flex; flex-wrap: wrap; gap: 5px; }
        .sp-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 10px; font-weight: 600; color: #1c1917; padding: 3px 8px; border-radius: 20px; border: 1px solid transparent; }
        .sp-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

        /* ── RODAPÉ ── */
        .doc-footer { flex-shrink: 0; padding: 12px 32px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; align-items: center; justify-content: space-between; }
        .ft-gen { font-size: 9px; color: #94a3b8; }
        .ft-pg { font-size: 9px; color: #94a3b8; font-family: 'DM Mono', monospace; }
      </style>
    </head><body>${pages}</body></html>`);
    win.document.close();
    // Imagens já embutidas como data URIs — pode imprimir imediatamente
    setTimeout(() => win.print(), 300);
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
      const groupName = typeToGroup[item.type] || item.type;
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

  const buildExportGroups = (items: any[]): ExportGroup[] => {
    // Sort by event name then type so same-type items are always consecutive
    const sorted = [...items].sort((a, b) => {
      const ea = a.event?.name || ""; const eb = b.event?.name || "";
      if (ea !== eb) return ea.localeCompare(eb);
      return (a.type || "").localeCompare(b.type || "");
    });
    const groups: ExportGroup[] = [];
    sorted.forEach(item => {
      const event = item.event?.name || "Sem Evento";
      const typeName = item.type;
      const groupName = typeToGroup[typeName] || "";
      const key = `${event}|||${typeName}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(item);
      } else {
        groups.push({ key, event, groupName, typeName, items: [item] });
      }
    });
    return groups;
  };

  const handleClickExportButton = () => {
    // If items are individually selected → export directly without modal
    if (selectedItemIds.size > 0) {
      const allPoolItems = [...allItems, ...correcaoItems];
      const selected = allPoolItems.filter(i => selectedItemIds.has(i.id));
      void exportItemsToPDF(selected, `Arte — ${selected.length} peça(s)`);
      return;
    }
    // Otherwise open group picker modal
    const arteStatuses = ['awaiting_submission','awaiting_sponsor_approval','sponsor_approved','awaiting_creator_review','pronto_para_producao','liberado'];
    const tabItems = filteredItems.length > 0 ? filteredItems : [
      ...allItems.filter(i => arteStatuses.includes(i.status)),
      ...correcaoItems,
    ];
    const groups = buildExportGroups(tabItems);
    setExportGroups(groups);
    setExportSelectedGroupKeys(new Set(groups.map(g => g.key)));
    setExportMode("individual");
    setShowExportModal(true);
  };

  const handleExportPDF = () => {
    setShowExportModal(false);
    // Preserve group order: keep items sorted by their group
    const selectedItems = exportGroups
      .filter(g => exportSelectedGroupKeys.has(g.key))
      .flatMap(g => g.items);
    if (selectedItems.length === 0) {
      toast({ title: "Nenhum item selecionado", variant: "destructive" });
      return;
    }
    void exportItemsToPDF(selectedItems, `Arte — ${selectedItems.length} peça(s)`);
  };

  const handleExportItemPDF = (item: any) => {
    void exportItemsToPDF([item], `Prova — ${item.displayId || item.type}`);
  };

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

  const handleBulkThumbUpload = useCallback(async () => {
    const toProcess = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending');
    if (!toProcess.length) return;
    setBulkThumbRunning(true);
    for (const entry of toProcess) {
      setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'uploading' } : e));
      try {
        const localPath = await uploadFileRaw(entry.file);
        await apiRequest("PATCH", `/api/items/${entry.matchedItemId}/submit-for-approval`, { approvalThumbUrl: localPath });
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'done' } : e));
      } catch (err: any) {
        setBulkThumbEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'error', errorMsg: err.message } : e));
      }
    }
    setBulkThumbRunning(false);
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    toast({ title: "Upload em lote concluído", description: `${toProcess.length} thumb(s) enviados para aprovação` });
  }, [bulkThumbEntries, uploadFileRaw]);

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
          matchesView = [
            'awaiting_creator_review',
            'awaiting_final_review',
            'ready_for_production',
            'pronto_para_producao',
            'liberado',
            'em_producao',
            'produzido',
            'entregue',
          ].includes(item.status);
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
                                <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" title="Ver referência visual do solicitante" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, color: '#2563eb', textDecoration: 'none', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, padding: '2px 6px' }} data-testid={`link-reference-arte-${item.id}`}>
                                  <Paperclip style={{ width: 9, height: 9 }} />
                                  Ref. visual
                                </a>
                              )}
                            </div>
                          </td>
                          {/* Patrocinadores — finalizados only */}
                          {tabId === 'finalizados' && (
                            <td style={{ padding: '12px 16px' }}>
                              <SponsorChips sponsors={item.sponsors ?? []} variant="orange" size="sm" />
                            </td>
                          )}

                          {/* Thumb aprovado — finalizados only */}
                          {tabId === 'finalizados' && (
                            <td style={{ padding: '12px 16px' }}>
                              {item.approvalThumbUrl ? (() => {
                                const isImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(item.approvalThumbUrl.toLowerCase()) || item.approvalThumbUrl.startsWith('/objects/');
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
                              {["awaiting_submission", "sponsor_approved"].includes(item.status) && (
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
                  {[...events].sort((a: any, b: any) => a.name.localeCompare(b.name, 'pt-BR')).map((event: any) => (
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

        {/* Export PDF button: with selection → export directly; without → open group modal */}
        <button
          onClick={handleClickExportButton}
          data-testid="button-export-pdf"
          style={{
            height: 36, padding: '0 14px', borderRadius: 8, marginLeft: 'auto',
            backgroundColor: selectedItemIds.size > 0 ? '#7c3aed' : '#f5f5f4',
            border: selectedItemIds.size > 0 ? '1px solid #7c3aed' : '1px solid #e7e5e4',
            color: selectedItemIds.size > 0 ? '#ffffff' : '#78716c',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.92)'; }}
          onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
        >
          <Printer style={{ width: 14, height: 14 }} />
          {selectedItemIds.size > 0 ? `Exportar ${selectedItemIds.size} sel.` : 'Exportar PDF'}
        </button>

        {/* Multi-thumb upload button (only in criar-aprovacoes) */}
        {activeTab === "criar-aprovacoes" && (
          <>
            <label
              data-testid="button-open-bulk-thumb"
              style={{
                height: 36, padding: '0 14px', borderRadius: 8,
                backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0',
                color: '#15803d', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 600, transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(0.94)'; }}
              onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
            >
              <FileImage style={{ width: 13, height: 13 }} />
              Multi-Upload Thumbs
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }}
              />
            </label>
          </>
        )}

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

      {/* ── 3b. SELECT ALL / CLEAR — only on tabs with checkboxes ─────────── */}
      {(activeTab === "criar-aprovacoes" || activeTab === "finalizados") && filteredItems.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0 2px' }}>
          <button
            onClick={() => {
              if (selectedItemIds.size === filteredItems.length) {
                setSelectedItemIds(new Set());
              } else {
                setSelectedItemIds(new Set(filteredItems.map((i: any) => i.id)));
              }
            }}
            data-testid="button-select-all"
            style={{
              height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid #e7e5e4',
              backgroundColor: '#fafaf9', color: '#78716c', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#e7e5e4'; e.currentTarget.style.color = '#1c1917'; }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#fafaf9'; e.currentTarget.style.color = '#78716c'; }}
          >
            {selectedItemIds.size === filteredItems.length && filteredItems.length > 0
              ? <><X style={{ width: 10, height: 10 }} />Limpar seleção</>
              : <><CheckSquare style={{ width: 10, height: 10 }} />Selecionar tudo</>
            }
          </button>
          {selectedItemIds.size > 0 && (
            <span style={{ fontSize: 11, color: '#78716c' }}>
              {selectedItemIds.size} de {filteredItems.length} selecionada{selectedItemIds.size !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

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
                      height: 160, border: isPasteUploading ? '2px dashed #9d4300' : '2px dashed #e2e2e2', borderRadius: 12,
                      backgroundColor: isPasteUploading ? '#fdf2e9' : '#f0efee', display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background-color 0.15s'
                    }}
                      onMouseEnter={e => { if (!isPasteUploading) (e.currentTarget as HTMLElement).style.backgroundColor = '#e8e8e7'; }}
                      onMouseLeave={e => { if (!isPasteUploading) (e.currentTarget as HTMLElement).style.backgroundColor = isPasteUploading ? '#fdf2e9' : '#f0efee'; }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: '#ffffff', boxShadow: '0 1px 4px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                        {isPasteUploading
                          ? <div style={{ width: 20, height: 20, borderRadius: '50%', border: '3px solid #fed7aa', borderTopColor: '#9d4300', animation: 'spin 0.8s linear infinite' }} />
                          : <Upload style={{ width: 20, height: 20, color: '#9d4300' }} />
                        }
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: '#1c1917', margin: '0 0 2px' }}>
                        {isPasteUploading ? 'Enviando imagem colada...' : 'Solte o arquivo aqui ou'}
                      </p>
                      {!isPasteUploading && (
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
                      )}
                      <p style={{ fontSize: 10, color: '#a8a29e', margin: '4px 0 0' }}>
                        {isPasteUploading ? 'Aguarde...' : 'PDF, PNG ou SVG · ou Ctrl+V para colar'}
                      </p>
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
                        toast({ title: "Upload concluído", description: "Thumb de aprovação enviado com sucesso" });
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
      {/* MODAL 4 — EXPORT PDF GROUP PICKER                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="p-0 gap-0" style={{ maxWidth: 700, width: '95vw', borderRadius: 14, backgroundColor: '#ffffff', border: 'none', boxShadow: '0 24px 48px -12px rgba(28,25,23,0.2)' }}>
          <DialogTitle className="sr-only">Exportar PDF</DialogTitle>
          <DialogDescription className="sr-only">Selecione os grupos e o formato de exportação</DialogDescription>

          {/* ── Dark gradient header ── */}
          <div style={{ padding: '22px 28px 18px', background: 'linear-gradient(135deg, #1c1917 0%, #292524 100%)', borderRadius: '14px 14px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Printer style={{ width: 17, height: 17, color: '#ffffff' }} />
              </div>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.04em', color: '#ffffff', margin: '0 0 3px', fontFamily: '"Space Grotesk", sans-serif' }}>
                  Exportar PDF
                </h2>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
                  Selecione os grupos para incluir no relatório
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowExportModal(false)}
              style={{ padding: 8, backgroundColor: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', lineHeight: 1, flexShrink: 0, transition: 'background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
            >
              <X style={{ width: 16, height: 16 }} />
            </button>
          </div>

          {/* ── Stats + controls bar ── */}
          <div style={{ padding: '12px 24px', borderBottom: '1px solid #f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafaf9', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Selected groups badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ padding: '3px 10px', borderRadius: 20, backgroundColor: exportSelectedGroupKeys.size > 0 ? '#f3e8ff' : '#f5f5f4', color: exportSelectedGroupKeys.size > 0 ? '#7c3aed' : '#a8a29e', fontSize: 11, fontWeight: 700 }}>
                  {exportSelectedGroupKeys.size} grupo{exportSelectedGroupKeys.size !== 1 ? 's' : ''}
                </span>
                <span style={{ padding: '3px 10px', borderRadius: 20, backgroundColor: exportSelectedGroupKeys.size > 0 ? '#ede9fe' : '#f5f5f4', color: exportSelectedGroupKeys.size > 0 ? '#6d28d9' : '#a8a29e', fontSize: 11, fontWeight: 700 }}>
                  {exportGroups.filter(g => exportSelectedGroupKeys.has(g.key)).reduce((acc, g) => acc + g.items.length, 0)} peça{exportGroups.filter(g => exportSelectedGroupKeys.has(g.key)).reduce((acc, g) => acc + g.items.length, 0) !== 1 ? 's' : ''}
                </span>
              </div>
              <span style={{ color: '#d4d4d0', fontSize: 14 }}>·</span>
              <span style={{ fontSize: 10, color: '#a8a29e' }}>{exportGroups.length} grupos no total</span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setExportSelectedGroupKeys(new Set(exportGroups.map(g => g.key)))}
                style={{ height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', color: '#7c3aed', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f3e8ff'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >Todos</button>
              <button
                onClick={() => setExportSelectedGroupKeys(new Set())}
                style={{ height: 28, padding: '0 12px', borderRadius: 6, border: '1px solid #e7e5e4', backgroundColor: '#ffffff', color: '#78716c', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f5f5f4'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; }}
              >Nenhum</button>
            </div>
          </div>

          {/* ── Group list (scrollable) ── */}
          <div style={{ overflowY: 'auto', maxHeight: 420, padding: '16px 20px' }}>
            {(() => {
              const byEvent: { event: string; groups: ExportGroup[] }[] = [];
              exportGroups.forEach(g => {
                const last = byEvent[byEvent.length - 1];
                if (last && last.event === g.event) {
                  last.groups.push(g);
                } else {
                  byEvent.push({ event: g.event, groups: [g] });
                }
              });
              return byEvent.map(ev => {
                const evGroupKeys = ev.groups.map(g => g.key);
                const allEvSelected = evGroupKeys.every(k => exportSelectedGroupKeys.has(k));
                const someEvSelected = evGroupKeys.some(k => exportSelectedGroupKeys.has(k));
                const evTotalPieces = ev.groups.reduce((acc, g) => acc + g.items.length, 0);
                const evSelectedPieces = ev.groups.filter(g => exportSelectedGroupKeys.has(g.key)).reduce((acc, g) => acc + g.items.length, 0);
                return (
                  <div key={ev.event} style={{ marginBottom: 20 }}>
                    {/* Event header */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, marginBottom: 8, backgroundColor: allEvSelected ? '#1c1917' : someEvSelected ? '#292524' : '#3c3834', cursor: 'pointer' }}
                      onClick={() => {
                        const s = new Set(exportSelectedGroupKeys);
                        if (allEvSelected) {
                          evGroupKeys.forEach(k => s.delete(k));
                        } else {
                          evGroupKeys.forEach(k => s.add(k));
                        }
                        setExportSelectedGroupKeys(s);
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Event checkbox */}
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${allEvSelected ? '#7c3aed' : 'rgba(255,255,255,0.3)'}`, backgroundColor: allEvSelected ? '#7c3aed' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                          {allEvSelected && <span style={{ color: '#fff', fontSize: 10, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                          {!allEvSelected && someEvSelected && <div style={{ width: 8, height: 2, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 1 }} />}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ffffff' }}>{ev.event}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{ev.groups.length} grupo{ev.groups.length !== 1 ? 's' : ''}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 20, backgroundColor: someEvSelected ? '#7c3aed' : 'rgba(255,255,255,0.12)', color: someEvSelected ? '#ffffff' : 'rgba(255,255,255,0.4)', fontSize: 9, fontWeight: 800 }}>
                          {someEvSelected ? evSelectedPieces : evTotalPieces} peça{evTotalPieces !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Group cards grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {ev.groups.map(g => {
                        const selected = exportSelectedGroupKeys.has(g.key);
                        // Find first item in the group that has an image thumb (not PDF)
                        const thumb = g.items.find(i => {
                          const u = i.approvalThumbUrl;
                          if (!u) return false;
                          if (/\.pdf$/i.test(u)) return false;
                          return /\.(png|jpg|jpeg|gif|webp|svg)/i.test(u) || u.startsWith('/objects/') || u.includes('/.private/');
                        })?.approvalThumbUrl;
                        const rawPath = thumb ? convertGCSUrlToLocalPath(thumb) : null;
                        // Make URL absolute so it works in all contexts
                        const thumbSrc = rawPath
                          ? (rawPath.startsWith('/') ? `${window.location.origin}${rawPath}` : rawPath)
                          : null;
                        return (
                          <button
                            key={g.key}
                            onClick={() => {
                              const s = new Set(exportSelectedGroupKeys);
                              if (s.has(g.key)) s.delete(g.key); else s.add(g.key);
                              setExportSelectedGroupKeys(s);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                              borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                              backgroundColor: selected ? '#f5f3ff' : '#fafaf9',
                              border: `1.5px solid ${selected ? '#a78bfa' : '#e7e5e4'}`,
                              transition: 'all 0.12s',
                              boxShadow: selected ? '0 0 0 3px rgba(124,58,237,0.08)' : 'none',
                            }}
                            data-testid={`export-group-${g.key}`}
                          >
                            {/* Checkbox */}
                            <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? '#7c3aed' : '#e7e5e4', border: selected ? 'none' : '1.5px solid #d4d4d0', transition: 'all 0.12s' }}>
                              {selected && <span style={{ color: '#fff', fontSize: 11, fontWeight: 900, lineHeight: 1 }}>✓</span>}
                            </div>
                            {/* Thumbnail: fallback sempre visível, imagem por cima */}
                            <div style={{ width: 44, height: 44, borderRadius: 8, position: 'relative', flexShrink: 0 }}>
                              {/* Fallback placeholder (always present behind the image) */}
                              <div style={{ position: 'absolute', inset: 0, borderRadius: 8, backgroundColor: selected ? '#ede9fe' : '#f0efee', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${selected ? '#c4b5fd' : '#e7e5e4'}` }}>
                                <FileImage style={{ width: 18, height: 18, color: selected ? '#7c3aed' : '#a8a29e' }} />
                              </div>
                              {/* Actual image on top — hidden on error */}
                              {thumbSrc && (
                                <img
                                  src={thumbSrc}
                                  alt=""
                                  loading="lazy"
                                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8, border: '1px solid #e7e5e4', display: 'block' }}
                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                                />
                              )}
                            </div>
                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 700, color: selected ? '#4c1d95' : '#1c1917', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {g.typeName}
                              </p>
                              {g.groupName && (
                                <p style={{ fontSize: 9, fontWeight: 600, color: selected ? '#7c3aed' : '#a8a29e', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {g.groupName}
                                </p>
                              )}
                              <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: 20, backgroundColor: selected ? '#7c3aed' : '#f0efee', color: selected ? '#ffffff' : '#78716c', fontSize: 9, fontWeight: 800 }}>
                                {g.items.length} {g.items.length === 1 ? 'peça' : 'peças'}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #f0ede8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fafaf9', borderRadius: '0 0 14px 14px' }}>
            <span style={{ fontSize: 11, color: '#a8a29e' }}>
              {exportSelectedGroupKeys.size === 0 ? 'Nenhum grupo selecionado' : `${exportSelectedGroupKeys.size} de ${exportGroups.length} grupos`}
            </span>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowExportModal(false)}
                style={{ height: 38, padding: '0 18px', borderRadius: 8, background: '#f5f5f4', border: '1px solid #e7e5e4', color: '#78716c', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
              >Cancelar</button>
              <button
                onClick={handleExportPDF}
                disabled={exportSelectedGroupKeys.size === 0}
                data-testid="button-export-confirm"
                style={{
                  height: 38, padding: '0 20px', borderRadius: 8, cursor: exportSelectedGroupKeys.size === 0 ? 'not-allowed' : 'pointer',
                  backgroundColor: exportSelectedGroupKeys.size === 0 ? '#e7e5e4' : '#7c3aed',
                  border: 'none', color: exportSelectedGroupKeys.size === 0 ? '#a8a29e' : '#ffffff',
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, transition: 'filter 0.15s',
                }}
                onMouseEnter={e => { if (exportSelectedGroupKeys.size > 0) e.currentTarget.style.filter = 'brightness(0.88)'; }}
                onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
              >
                <Printer style={{ width: 14, height: 14 }} />
                Exportar {exportGroups.filter(g => exportSelectedGroupKeys.has(g.key)).reduce((acc, g) => acc + g.items.length, 0)} peça(s)
              </button>
            </div>
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
          <div style={{ display: 'flex', height: 560, overflow: 'hidden' }}>

            {/* ── Left panel (controls) ── */}
            <div style={{ width: 300, flexShrink: 0, borderRight: '1px solid #f0ede8', display: 'flex', flexDirection: 'column', backgroundColor: '#fafaf9' }}>

              {/* Drop zone */}
              <div style={{ padding: '20px 20px 16px' }}>
                <div
                  style={{
                    padding: '28px 16px', borderRadius: 12,
                    background: isDragOverBulk ? '#f0fdf4' : '#ffffff',
                    border: isDragOverBulk ? '2px dashed #16a34a' : '2px dashed #d4d4d0',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: isDragOverBulk ? 'inset 0 0 0 3px rgba(22,163,74,0.08)' : 'none',
                  }}
                  onDragOver={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                  onDragEnter={e => { e.preventDefault(); setIsDragOverBulk(true); }}
                  onDragLeave={() => setIsDragOverBulk(false)}
                  onDrop={e => { e.preventDefault(); setIsDragOverBulk(false); if (e.dataTransfer.files.length) handleBulkThumbFilesAdded(e.dataTransfer.files); }}
                  onClick={() => { const inp = document.getElementById('bulk-thumb-input') as HTMLInputElement; inp?.click(); }}
                >
                  <input id="bulk-thumb-input" type="file" accept="image/*" multiple style={{ display: 'none' }}
                    onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
                  <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: isDragOverBulk ? '#dcfce7' : '#f3f4f3', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                    <Upload style={{ width: 22, height: 22, color: isDragOverBulk ? '#16a34a' : '#a8a29e' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: isDragOverBulk ? '#15803d' : '#1c1917', margin: '0 0 3px' }}>
                      {isDragOverBulk ? 'Solte as imagens aqui' : 'Arrastar ou clicar para selecionar'}
                    </p>
                    <p style={{ fontSize: 10, color: '#a8a29e', margin: 0 }}>JPG, PNG, WEBP, SVG</p>
                  </div>
                </div>
              </div>

              {/* Event filter — combobox pesquisável */}
              <div style={{ padding: '0 20px 16px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#78716c', margin: '0 0 6px' }}>Filtrar itens por evento</p>
                {(() => {
                  const sortedEvts = [...(events as any[])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
                  const selEvt = sortedEvts.find(e => e.id === bulkThumbEventFilter);
                  return (
                    <Popover open={bulkThumbEventComboOpen} onOpenChange={setBulkThumbEventComboOpen}>
                      <PopoverTrigger asChild>
                        <button style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          height: 36, borderRadius: 8, border: '1px solid #e7e5e4',
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

              {/* Stats */}
              {bulkThumbEntries.length > 0 && (
                <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#78716c', margin: 0 }}>Resumo</p>
                  {[
                    { label: 'Vinculados', count: bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length, color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0' },
                    { label: 'Sem vínculo', count: bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length, color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
                    { label: 'Enviados', count: bulkThumbEntries.filter(e => e.status === 'done').length, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
                    { label: 'Erro', count: bulkThumbEntries.filter(e => e.status === 'error').length, color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
                  ].map(s => (
                    <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 8, backgroundColor: s.count > 0 ? s.bg : '#f5f5f4', border: `1px solid ${s.count > 0 ? s.border : '#e7e5e4'}` }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: s.count > 0 ? s.color : '#a8a29e' }}>{s.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: s.count > 0 ? s.color : '#d4d4d0', fontFamily: '"Space Grotesk", sans-serif' }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* Footer actions */}
              <div style={{ padding: '16px 20px', borderTop: '1px solid #f0ede8', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {bulkThumbEntries.filter(e => e.status === 'done').length > 0 && (
                  <button
                    onClick={() => setBulkThumbEntries(prev => prev.filter(e => e.status !== 'done'))}
                    style={{ width: '100%', height: 34, borderRadius: 8, background: 'none', border: '1px solid #e7e5e4', color: '#78716c', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                  >
                    Limpar concluídos
                  </button>
                )}
                <button
                  onClick={() => { if (!bulkThumbRunning) { setShowBulkThumbModal(false); setBulkThumbEntries([]); setBulkThumbEventFilter("all"); } }}
                  style={{ width: '100%', height: 34, borderRadius: 8, background: '#f5f5f4', border: '1px solid #e7e5e4', color: '#78716c', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >Cancelar</button>
                <button
                  onClick={handleBulkThumbUpload}
                  disabled={bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0}
                  data-testid="button-bulk-thumb-confirm"
                  style={{
                    width: '100%', height: 42, borderRadius: 8,
                    backgroundColor: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? '#e7e5e4' : '#15803d',
                    border: 'none',
                    color: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? '#a8a29e' : '#ffffff',
                    fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    cursor: (bulkThumbRunning || bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length === 0) ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!bulkThumbRunning) e.currentTarget.style.filter = 'brightness(0.9)'; }}
                  onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
                >
                  {bulkThumbRunning
                    ? <><div style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />Enviando...</>
                    : <><Send style={{ width: 13, height: 13 }} />Enviar {bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length} thumb(s) para aprovação</>
                  }
                </button>
              </div>
            </div>

            {/* ── Right panel (entries grid) ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: '#f9f9f8' }}>
              {bulkThumbEntries.length === 0 ? (
                /* ── Empty state ── */
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <div style={{ width: 80, height: 80, borderRadius: 20, backgroundColor: '#f0efee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Upload style={{ width: 34, height: 34, color: '#d4d4d0' }} />
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#78716c', margin: '0 0 6px' }}>Nenhuma imagem adicionada</p>
                    <p style={{ fontSize: 12, color: '#a8a29e', margin: 0, maxWidth: 260, lineHeight: 1.5 }}>
                      Arraste imagens para a área à esquerda ou clique para selecionar
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    {['JPG', 'PNG', 'WEBP', 'SVG'].map(f => (
                      <span key={f} style={{ padding: '3px 10px', borderRadius: 20, backgroundColor: '#f0efee', fontSize: 10, fontWeight: 700, color: '#a8a29e', letterSpacing: '0.05em' }}>{f}</span>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* ── Panel header ── */}
                  <div style={{ padding: '12px 20px', borderBottom: '1px solid #ebebea', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#1c1917' }}>
                        {bulkThumbEntries.length} {bulkThumbEntries.length === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                      {/* Status chips */}
                      {(() => {
                        const linked = bulkThumbEntries.filter(e => e.matchedItemId && e.status === 'pending').length;
                        const unlinked = bulkThumbEntries.filter(e => !e.matchedItemId && e.status === 'pending').length;
                        const done = bulkThumbEntries.filter(e => e.status === 'done').length;
                        const err = bulkThumbEntries.filter(e => e.status === 'error').length;
                        return (
                          <>
                            {linked > 0 && <span style={{ padding: '2px 9px', borderRadius: 20, backgroundColor: '#dcfce7', color: '#15803d', fontSize: 10, fontWeight: 700 }}>{linked} vinculado{linked !== 1 ? 's' : ''}</span>}
                            {unlinked > 0 && <span style={{ padding: '2px 9px', borderRadius: 20, backgroundColor: '#fff7ed', color: '#c2410c', fontSize: 10, fontWeight: 700 }}>{unlinked} sem vínculo</span>}
                            {done > 0 && <span style={{ padding: '2px 9px', borderRadius: 20, backgroundColor: '#f3e8ff', color: '#7c3aed', fontSize: 10, fontWeight: 700 }}>{done} enviado{done !== 1 ? 's' : ''}</span>}
                            {err > 0 && <span style={{ padding: '2px 9px', borderRadius: 20, backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 10, fontWeight: 700 }}>{err} erro{err !== 1 ? 's' : ''}</span>}
                          </>
                        );
                      })()}
                    </div>
                    <span style={{ fontSize: 10, color: '#a8a29e' }}>Confirme o vínculo de cada imagem</span>
                  </div>

                  {/* ── 2-column card grid ── */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
                    {bulkThumbEntries.map(entry => {
                      const pendingPool = allItems.filter((i: any) => {
                        if (i.status !== 'awaiting_submission') return false;
                        if (bulkThumbEventFilter !== "all" && i.eventId !== bulkThumbEventFilter) return false;
                        return true;
                      });
                      const matchedItem = allItems.find((i: any) => i.id === entry.matchedItemId);
                      const isLinked = !!entry.matchedItemId;

                      /* Card border/bg by state */
                      const cardBorder = entry.status === 'done' ? '#bbf7d0'
                        : entry.status === 'error' ? '#fecaca'
                        : entry.status === 'uploading' ? '#ddd6fe'
                        : isLinked ? '#93c5fd' : '#fcd34d';
                      const cardBg = entry.status === 'done' ? '#f0fdf4'
                        : entry.status === 'error' ? '#fef2f2'
                        : entry.status === 'uploading' ? '#faf5ff'
                        : isLinked ? '#f0f9ff' : '#fffbeb';

                      return (
                        <div key={entry.id} style={{
                          borderRadius: 12, border: `1.5px solid ${cardBorder}`,
                          backgroundColor: '#ffffff',
                          overflow: 'hidden', position: 'relative',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          transition: 'all 0.12s',
                        }}>
                          {/* ── Thumbnail (tall) ── */}
                          <div style={{ position: 'relative', width: '100%', height: 120, backgroundColor: '#f3f4f3', overflow: 'hidden' }}>
                            <img src={entry.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            {/* Status overlay badge */}
                            <div style={{ position: 'absolute', top: 8, left: 8 }}>
                              {entry.status === 'done' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, backgroundColor: '#15803d', color: '#ffffff', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
                                  <CheckCircle style={{ width: 10, height: 10 }} /> Enviado
                                </span>
                              )}
                              {entry.status === 'uploading' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, backgroundColor: '#7c3aed', color: '#ffffff', fontSize: 9, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} /> Enviando
                                </span>
                              )}
                              {entry.status === 'error' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, backgroundColor: '#dc2626', color: '#ffffff', fontSize: 9, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
                                  Erro
                                </span>
                              )}
                              {entry.status === 'pending' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, backgroundColor: isLinked ? '#1d4ed8' : '#d97706', color: '#ffffff', fontSize: 9, fontWeight: 800, boxShadow: '0 2px 6px rgba(0,0,0,0.18)' }}>
                                  {isLinked ? 'Vinculado' : 'Sem vínculo'}
                                </span>
                              )}
                            </div>
                            {/* Remove button */}
                            {(entry.status === 'pending' || entry.status === 'error') && (
                              <button
                                onClick={() => setBulkThumbEntries(prev => prev.filter(e => e.id !== entry.id))}
                                style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', backgroundColor: 'rgba(28,25,23,0.6)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.12s' }}
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(220,38,38,0.85)'; }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(28,25,23,0.6)'; }}
                              >
                                <X style={{ width: 12, height: 12, color: '#ffffff' }} />
                              </button>
                            )}
                          </div>

                          {/* ── Card body ── */}
                          <div style={{ padding: '10px 12px 12px', borderTop: `2px solid ${cardBorder}`, backgroundColor: cardBg }}>
                            {/* File name + size */}
                            <div style={{ marginBottom: 8 }}>
                              <p style={{ fontSize: 11, fontWeight: 700, color: '#1c1917', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.file.name}>
                                {entry.file.name}
                              </p>
                              <p style={{ fontSize: 10, color: '#a8a29e', margin: 0 }}>
                                {(entry.file.size / 1024).toFixed(0)} KB
                              </p>
                            </div>

                            {/* ── State-specific content ── */}
                            {entry.status === 'done' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}>
                                <CheckCircle style={{ width: 13, height: 13, color: '#16a34a', flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                  <p style={{ fontSize: 10, fontWeight: 700, color: '#15803d', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {matchedItem?.displayId} · {matchedItem?.type?.slice(0, 22)}
                                  </p>
                                </div>
                              </div>
                            ) : entry.status === 'uploading' ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 6, backgroundColor: '#f5f3ff', border: '1px solid #ddd6fe' }}>
                                <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #ddd6fe', borderTopColor: '#7c3aed', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                                <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 600 }}>Enviando...</span>
                              </div>
                            ) : entry.status === 'error' ? (
                              <div style={{ padding: '6px 8px', borderRadius: 6, backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#dc2626', margin: '0 0 1px' }}>Falha no envio</p>
                                <p style={{ fontSize: 9, color: '#f87171', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.errorMsg}</p>
                              </div>
                            ) : isLinked && matchedItem ? (
                              /* ── Vinculado: mostra item + botão de desvincular ── */
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                                <div style={{ flex: 1, padding: '6px 8px', borderRadius: 6, backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', minWidth: 0 }}>
                                  <p style={{ fontSize: 9, fontWeight: 800, color: '#3b82f6', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{matchedItem.displayId}</p>
                                  <p style={{ fontSize: 11, fontWeight: 700, color: '#1e3a5f', margin: '0 0 1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.type}</p>
                                  {matchedItem.event?.name && (
                                    <p style={{ fontSize: 9, color: '#60a5fa', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{matchedItem.event.name}</p>
                                  )}
                                </div>
                                <button
                                  onClick={() => setBulkThumbEntries(prev => prev.map(en => en.id === entry.id ? { ...en, matchedItemId: null } : en))}
                                  title="Alterar vínculo"
                                  style={{ flexShrink: 0, background: 'none', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', color: '#93c5fd', fontSize: 9, fontWeight: 700, transition: 'all 0.12s' }}
                                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#eff6ff'; e.currentTarget.style.color = '#1d4ed8'; }}
                                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#93c5fd'; }}
                                >
                                  Trocar
                                </button>
                              </div>
                            ) : (
                              /* ── Sem vínculo: combobox pesquisável com grupos ── */
                              <div>
                                {(() => {
                                  const linked = allItems.find((i: any) => i.id === entry.matchedItemId);
                                  const isOpen = !!bulkThumbLinkOpenMap[entry.id];
                                  // Agrupar por grupo/tipo
                                  const grouped = pendingPool.reduce((acc: Record<string, any[]>, item: any) => {
                                    const g = typeToGroup[item.type] || item.type;
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
                                              <div style={{ padding: '12px 16px', fontSize: 11, color: '#f97316', fontWeight: 600 }}>
                                                Nenhuma peça aguardando{bulkThumbEventFilter !== "all" ? " neste evento" : ""}
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
  );
}
