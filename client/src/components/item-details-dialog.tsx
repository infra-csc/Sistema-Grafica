import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FilePreview, isImageUrl, isPdf } from "@/components/file-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import {
  Calendar, ClipboardList, FileText, History,
  Edit, Save, X, Link2, Palette, CheckCircle, Zap, Eye, Cog, Check,
  FileImage, FolderOpen, ExternalLink, Camera, Clock, ShieldCheck, Package, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";

interface ItemDetailsDialogProps {
  item: any | null;
  auditLogs?: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customActions?: React.ReactNode;
  topActions?: React.ReactNode;
  onEditSave?: (editedItem: any) => void;
}

const TIMELINE_STEPS = [
  { label: "Vinculação", icon: Link2,       idx: 0 },
  { label: "Arte",       icon: Palette,     idx: 1 },
  { label: "Aprovação",  icon: CheckCircle, idx: 2 },
  { label: "Finalização",icon: Zap,         idx: 3 },
  { label: "Revisão",    icon: Eye,         idx: 4 },
  { label: "Produção",   icon: Cog,         idx: 5 },
];

const STATUS_STEP: Record<string, number> = {
  requested: -1, draft: -1,
  awaiting_linking: 0,
  awaiting_submission: 1,
  awaiting_approval: 2, awaiting_sponsor_approval: 2,
  awaiting_finalization: 3, sponsor_approved: 3, awaiting_creator_review: 3,
  awaiting_final_review: 4,
  ready_for_production: 5, approved: 5, inproduction: 5, inProduction: 5,
  produced: 6, conferred: 6, delivered: 6,
};

const STATUS_LABELS: Record<string, string> = {
  requested: "Rascunho",
  awaiting_linking: "Aguard. Vinculação",
  awaiting_submission: "Aguard. Envio",
  awaiting_approval: "Aguard. Aprovação",
  awaiting_sponsor_approval: "Aguard. Aprovação",
  awaiting_finalization: "Aguard. Finalização",
  sponsor_approved: "Aguard. Finalização",
  awaiting_final_review: "Aguard. Revisão Final",
  awaiting_creator_review: "Aguard. Finalização",
  ready_for_production: "Pronto p/ Produção",
  approved: "Liberado",
  inProduction: "Em Produção",
  produced: "Produzido",
  conferred: "Conferido",
  delivered: "Entregue",
};

/**
 * Nome legível do arquivo. Os uploads ficam no storage com UUID, que não diz
 * nada a quem lê; nesse caso vale mais dizer o que é do que mostrar o hash.
 */
function friendlyFileName(url: string): string {
  const base = decodeURIComponent((url.split("?")[0].split("/").pop() || "").trim());
  const isUuidish = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(base)
    || (!base.includes(".") && base.length > 20);
  return isUuidish ? "Imagem enviada pela Arte" : (base || "Arquivo");
}

/**
 * Faixa de miniaturas; clicar abre a imagem original em nova aba. Tamanho fixo
 * por miniatura — com largura total, uma única foto virava um bloco gigante.
 */
function PhotoStrip({ urls, alt }: { urls: string[]; alt: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {urls.map(url => (
        <a key={url} href={url} target="_blank" rel="noopener noreferrer" title="Abrir original"
          style={{ display: "block", position: "relative", width: 132, height: 132, borderRadius: 8, overflow: "hidden", border: "1px solid #e8e8e7", backgroundColor: "#f3f4f3", flexShrink: 0 }}>
          <img src={url} alt={alt}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={e => {
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = "none";
              const parent = img.parentElement;
              if (parent && !parent.querySelector("[data-broken]")) {
                const span = document.createElement("span");
                span.setAttribute("data-broken", "1");
                span.textContent = "Imagem indisponível";
                span.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:10px;color:#a8a29e";
                parent.appendChild(span);
              }
            }} />
          <span style={{ position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.55)", color: "#ffffff", padding: 4, borderRadius: 4, display: "flex" }}>
            <ExternalLink style={{ width: 10, height: 10 }} />
          </span>
        </a>
      ))}
    </div>
  );
}

export function ItemDetailsDialog({
  item, auditLogs = [], open, onOpenChange,
  customActions, topActions, onEditSave,
}: ItemDetailsDialogProps) {
  const [editMode, setEditMode]     = useState(false);
  const [editedItem, setEditedItem] = useState(item);

  // Aprovação por patrocinador não vem no payload de /api/items — sem buscar
  // aqui, peças com várias marcas apareciam sempre como "Aguardando" no Painel
  // Geral e no detalhe do evento, mesmo já aprovadas.
  const [fetchedApprovals, setFetchedApprovals] = useState<any[]>([]);
  useEffect(() => {
    if (!open || !item?.id || item?.sponsorApprovals) { setFetchedApprovals([]); return; }
    let cancelled = false;
    fetch(`/api/items/${item.id}/sponsor-approvals`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled) setFetchedApprovals(Array.isArray(data) ? data : []); })
      .catch(() => { /* silencioso: sem as aprovações os chips ficam como estavam */ });
    return () => { cancelled = true; };
  }, [open, item?.id]);

  // Fotos que a Gráfica anexou na conferência e na entrega, para que o registro
  // acompanhe a peça ao longo do fluxo e não fique só na tela da Gráfica.
  const [flowPhotos, setFlowPhotos] = useState<any[]>([]);
  useEffect(() => {
    if (!open || !item?.id) { setFlowPhotos([]); return; }
    let cancelled = false;
    fetch(`/api/items/${item.id}/photos`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled) setFlowPhotos(Array.isArray(data) ? data : []); })
      .catch(() => { /* silencioso: sem as fotos o restante do card segue igual */ });
    return () => { cancelled = true; };
  }, [open, item?.id]);

  if (!item) return null;

  const approvalsList: any[] = item.sponsorApprovals ?? fetchedApprovals;

  // Junta as fotos da galeria com os campos antigos do item (uma foto só), sem
  // repetir a mesma URL duas vezes.
  // Registros antigos guardaram a URL assinada do GCS, que não abre depois de o
  // token expirar; converter para /objects/... resolve os dois casos.
  const photosOfKind = (kind: string, legacyUrl?: string) => {
    const urls = flowPhotos
      .filter(p => (p.kind ?? "delivery") === kind)
      .map(p => convertGCSUrlToLocalPath(p.photoUrl));
    if (legacyUrl) {
      const converted = convertGCSUrlToLocalPath(legacyUrl);
      if (!urls.includes(converted)) urls.unshift(converted);
    }
    return urls;
  };
  const conferencePhotos = photosOfKind("conference", item.conferencePhotoUrl);
  const deliveryPhotos   = photosOfKind("delivery", item.deliveryPhotoUrl);

  const rawStatus = (item.status || "").trim();
  const step = STATUS_STEP[rawStatus] ?? STATUS_STEP[rawStatus.toLowerCase()] ?? -1;

  const handleEditChange = (field: string, value: any) =>
    setEditedItem((p: any) => ({ ...p, [field]: value }));
  const handleSave = () => { onEditSave?.(editedItem); setEditMode(false); };

  const itemLogs = auditLogs
    .filter((l: any) => (l.entityId ?? l.entity_id ?? "") === item.id)
    .sort((a: any, b: any) =>
      new Date(a.createdAt ?? a.created_at).getTime() -
      new Date(b.createdAt ?? b.created_at).getTime());

  const itemLogsInclusive = auditLogs
    .filter((l: any) =>
      String(l.entityId ?? l.entity_id ?? "")
        .split(",").map((s: string) => s.trim()).includes(item.id))
    .sort((a: any, b: any) =>
      new Date(a.createdAt ?? a.created_at).getTime() -
      new Date(b.createdAt ?? b.created_at).getTime());

  const fmtShort = (d: string) => {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
  };

  const getLog = (keywords: string[], pool = itemLogs, actionType?: string) => {
    const l = pool.find((log: any) => {
      if (actionType && log.action === actionType) return true;
      const d = (log.details || log.action || "").toLowerCase();
      return keywords.some(k => d.includes(k.toLowerCase()));
    });
    if (!l) return null;
    const ts   = l.createdAt ?? l.created_at;
    const name = l.userName  ?? l.user_name;
    return { date: fmtShort(ts), user: name };
  };

  const createdLog = itemLogs.find((l: any) => l.action === "created");

  const historyStages = [
    { label: "Criado / Solicitado",            keywords: ["criado"],                    pool: itemLogs,          actionType: "created" },
    { label: "Vinculação de patrocinador",      keywords: ["patrocinadores atualizados"], pool: itemLogs },
    { label: "Enviado para Arte",               keywords: ["enviado para arte","aguard. envio →","aguard envio →"], pool: itemLogsInclusive },
    { label: "Em aprovação de patrocinador",    keywords: ["aguardando aprovação"],      pool: itemLogs },
    { label: "Aprovado — Finalização",          keywords: ["todos os patrocinadores aprovaram","aguardando finaliz","aprovado pelo patrocinador"], pool: itemLogs },
    { label: "Aguardando revisão final",        keywords: ["arquivo final adicionado","aguardando revisão final"], pool: itemLogs },
    { label: "Liberado para Produção",          keywords: ["liberado para produção","pronto_para_producao","liberado"],      pool: itemLogs },
    { label: "Em Produção",                     keywords: ["em_producao","em produção","produção iniciada","iniciada"],      pool: itemLogs },
    { label: "Produzido",                       keywords: ["produzido"],                pool: itemLogs },
  ];

  const deliveryLog = itemLogs.find((l: any) => l.action === "delivered");

  const thumbUrl = item.approvalThumbUrl;
  const isThumbImage = thumbUrl && (isImageUrl(thumbUrl) && !isPdf(thumbUrl));

  // A seção também aparece quando só há observação, sem foto anexada.
  const hasFlowPhotos    = conferencePhotos.length > 0 || deliveryPhotos.length > 0
                        || !!item.conferenceNotes || !!item.deliveryNotes;
  const hasObservations  = !!item.observations;
  const hasTimestamps    = !!(item.createdAt || item.sponsorApprovedAt || item.creatorReviewedAt || item.approvedAt || item.productionStartedAt || item.producedAt || item.deliveredAt);

  const createdBy = createdLog?.userName ?? createdLog?.user_name ?? null;

  // Etapas intermediárias não têm campo de timestamp dedicado no item — vêm dos
  // audit logs, igual ao HISTÓRICO, para a rastreabilidade não ficar incompleta.
  const sponsorLinkLog = itemLogs.find((l: any) => {
    const d = (l.details || l.action || "").toLowerCase();
    return d.includes("patrocinadores atualizados") || d.includes("patrocinadores vinculados") || d.includes("sponsor");
  });
  const sentToArteLog = itemLogsInclusive.find((l: any) => {
    const d = (l.details || l.action || "").toLowerCase();
    return (d.includes("enviado") && d.includes("arte")) ||
           d.includes("aguard. envio →") ||
           d.includes("aguard envio →");
  });
  const awaitingSponsorLog = itemLogs.find((l: any) => {
    const d = (l.details || l.action || "").toLowerCase();
    return d.includes("aguardando aprovação") || d.includes("em aprovação");
  });
  const logTs = (l: any) => l?.createdAt ?? l?.created_at ?? null;
  const logBy = (l: any) => l?.userName ?? l?.user_name ?? null;

  const traceRows = [
    { label: "Solicitado / Criado",        value: item.createdAt,                                         by: createdBy,                                                 dot: "#2563eb" },
    sponsorLinkLog ? { label: "Vinculação de Patrocinador", value: logTs(sponsorLinkLog), by: logBy(sponsorLinkLog), dot: "#8b5cf6" } : null,
    sentToArteLog ? { label: "Enviado para Arte", value: logTs(sentToArteLog), by: logBy(sentToArteLog), dot: "#0ea5e9" } : null,
    awaitingSponsorLog ? { label: "Em Aprovação de Patrocinador", value: logTs(awaitingSponsorLog), by: logBy(awaitingSponsorLog), dot: "#f97316" } : null,
    { label: "Aprovado pelo Patrocinador", value: item.sponsorApprovedAt,                                  by: item.sponsorApprovedBy,                                    dot: "#7c3aed" },
    { label: "Revisado pelo Criador",      value: item.creatorReviewedAt,                                  by: null,                                                      dot: "#d946ef" },
    { label: "Liberado para Produção",     value: item.approvedAt,                                         by: null,                                                      dot: "#f97316" },
    { label: "Produção Iniciada",          value: item.productionStartedAt,                                by: null,                                                      dot: "#f59e0b" },
    { label: "Produzido",                  value: item.producedAt,                                         by: null,                                                      dot: "#ec4899" },
    { label: "Entregue",                   value: item.deliveredAt,                                        by: item.receivedBy,                                           dot: "#10b981" },
  ].filter((r): r is { label: string; value: any; by: any; dot: string } => !!r && !!r.value);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 gap-0"
        style={{ backgroundColor: "#f9f9f8", borderRadius: 6, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}
      >
        {/* ── Close button ── */}
        <button
          onClick={() => onOpenChange(false)}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 50,
            background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.6)", padding: 6, borderRadius: 4,
            display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "#ffffff"; e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.6)"; e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
        >
          <X style={{ width: 24, height: 24 }} />
        </button>

        {/* ══════════════════════════════════════════════════════
            HEADER — Dark
        ══════════════════════════════════════════════════════ */}
        <header style={{ backgroundColor: "#1c1917", color: "#ffffff" }}>
          {/* Title + pills row */}
          <div style={{ padding: "24px 32px 20px" }}>
            {/* ID chip inline */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em" }}>
                {item.displayId}
              </span>
              {/* Status + tag pills inline */}
              <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(253,118,26,0.2)", color: "#fd761a", border: "1px solid rgba(253,118,26,0.3)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {STATUS_LABELS[rawStatus] || rawStatus}
              </span>
              {(item.isReuse || item.reuseQty > 0) && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(22,101,52,0.3)", color: "#4ade80", border: "1px solid rgba(22,101,52,0.4)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {item.isReuse ? "Reaproveitamento" : `↩ ${item.reuseQty}/${item.quantity}`}
                </span>
              )}
              {item.rejectedBySponsor && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(186,26,26,0.25)", color: "#ff5449", border: "1px solid rgba(186,26,26,0.35)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reprov. Patrocinador</span>
              )}
              {item.rejectedByCreator && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(186,26,26,0.25)", color: "#ff5449", border: "1px solid rgba(186,26,26,0.35)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reprov. Criador</span>
              )}
              {item.skipApproval && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Aprov. Ignorada</span>
              )}
            </div>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "clamp(22px, 3.2vw, 34px)", fontWeight: 800,
              letterSpacing: "-0.03em", color: "#ffffff", margin: 0, lineHeight: 1.1,
            }}>
              {item.event?.name?.toUpperCase() || "—"}
            </h1>
          </div>

          {/* Progress tracker — full-width strip */}
          <div style={{ padding: "14px 32px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 0, overflowX: "auto" }}>
            {TIMELINE_STEPS.map((s, i) => {
              const done    = s.idx < step;
              const current = s.idx === step;
              return (
                <div key={s.idx} style={{ display: "flex", alignItems: "center", flex: i < TIMELINE_STEPS.length - 1 ? "1 1 0" : "0 0 auto" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%",
                      backgroundColor: done ? "#fd761a" : current ? "rgba(253,118,26,0.25)" : "rgba(255,255,255,0.08)",
                      border: current ? "2px solid #fd761a" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: done ? "#fff" : current ? "#fd761a" : "rgba(255,255,255,0.3)",
                      fontWeight: 800, fontSize: 10,
                      transition: "all 0.2s",
                      flexShrink: 0,
                    }}>
                      {done ? <Check style={{ width: 11, height: 11, strokeWidth: 3 }} /> : <span>{s.idx + 1}</span>}
                    </div>
                    <span style={{
                      fontSize: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: (done || current) ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.25)",
                      whiteSpace: "nowrap",
                    }}>
                      {s.label}
                    </span>
                  </div>
                  {i < TIMELINE_STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 1, backgroundColor: done ? "rgba(253,118,26,0.4)" : "rgba(255,255,255,0.08)", marginBottom: 14, minWidth: 12 }} />
                  )}
                </div>
              );
            })}
          </div>
        </header>

        {/* ══════════════════════════════════════════════════════
            BANNER DESCRIPTION
        ══════════════════════════════════════════════════════ */}
        {item.description && (
          <div style={{ padding: "14px 32px", backgroundColor: "#fdf8f5", borderLeft: "3px solid #fd761a", borderBottom: "1px solid #f0ede9" }}>
            <p style={{ color: "#57534e", lineHeight: 1.6, maxWidth: 800, margin: 0, fontSize: 13, fontWeight: 500 }}>
              {item.description}
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            REFERÊNCIA DO SOLICITANTE
        ══════════════════════════════════════════════════════ */}
        {item.referenceUrl && (
          <div style={{ padding: "20px 32px", backgroundColor: "#fff7ed", borderLeft: "8px solid #f97316", display: "flex", alignItems: "center", gap: 20 }}>
            <a href={item.referenceUrl} target="_blank" rel="noopener noreferrer" style={{ flexShrink: 0, display: "block", borderRadius: 8, overflow: "hidden", border: "2px solid #fed7aa", boxShadow: "0 4px 12px rgba(249,115,22,0.15)" }}>
              <img
                src={item.referenceUrl}
                alt="Referência"
                style={{ width: 100, height: 72, objectFit: "cover", display: "block" }}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            </a>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#c2410c", margin: "0 0 6px 0", display: "flex", alignItems: "center", gap: 5 }}>
                <Paperclip style={{ width: 11, height: 11 }} />
                Referência do Solicitante
              </p>
              <p style={{ fontSize: 13, color: "#7c2d12", margin: "0 0 8px 0", lineHeight: 1.4 }}>
                Imagem de demonstração fornecida pelo solicitante para orientar a produção da peça.
              </p>
              <a
                href={item.referenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 700, color: "#f97316", textDecoration: "none", padding: "5px 12px", backgroundColor: "rgba(249,115,22,0.08)", borderRadius: 4, border: "1px solid rgba(249,115,22,0.2)" }}
              >
                <ExternalLink style={{ width: 12, height: 12 }} />
                Ver imagem completa
              </a>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
            TWO-COLUMN GRID
        ══════════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: "6fr 4fr", gap: 16, padding: "20px 32px 20px", backgroundColor: "#e8e4de" }}>

          {/* ── LEFT COLUMN (60%) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Event info + Specs */}
            <section style={{ backgroundColor: "#ffffff", padding: "20px 24px", borderRadius: 10 }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10,
                textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 18px 0",
                display: "flex", alignItems: "center", gap: 6, color: "#78716c",
              }}>
                <Calendar style={{ width: 13, height: 13, color: "#fd761a" }} />
                Informações do Evento
              </h3>

              {/* Dates */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8c7164", display: "block", marginBottom: 4 }}>
                    Data de Início
                  </label>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: "#1a1c1c", fontWeight: 500, margin: 0 }}>
                    {item.event?.startDate
                      ? format(parseDateLocal(item.event.startDate), "dd MMM yyyy", { locale: ptBR }).toUpperCase()
                      : "—"}
                  </p>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#8c7164", display: "block", marginBottom: 4 }}>
                    Saída do Caminhão
                  </label>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, color: "#fd761a", fontWeight: 700, margin: 0 }}>
                    {item.event?.truckDepartureDate
                      ? format(toUTCDisplayDate(item.event.truckDepartureDate), "dd MMM yyyy 'às' HH:mm", { locale: ptBR }).toUpperCase()
                      : "—"}
                  </p>
                </div>
              </div>

              {/* Specs */}
              <div style={{ marginTop: 32, paddingTop: 32, borderTop: "1px solid #eeeeed" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h4 style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8c7164", margin: 0 }}>
                    Especificações Técnicas
                  </h4>
                  {!editMode && onEditSave && (
                    <button
                      onClick={() => { setEditedItem(item); setEditMode(true); }}
                      style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 700, color: "#fd761a", textTransform: "uppercase", padding: 0 }}
                    >
                      <Edit style={{ width: 11, height: 11 }} /> EDITAR
                    </button>
                  )}
                </div>

                {editMode ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { label: "Tipo",       field: "type" },
                      { label: "Material",   field: "material" },
                      { label: "Acabamento", field: "finish" },
                    ].map(({ label, field }) => (
                      <div key={field}>
                        <label style={{ fontSize: 11, color: "#a8a29e", display: "block", marginBottom: 4 }}>{label}</label>
                        <Input value={editedItem?.[field] || ""} onChange={(e) => handleEditChange(field, e.target.value)} className="h-8 text-sm" />
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                      <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                      <Button size="sm" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Salvar</Button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                    {[
                      { label: "Tipo",       value: item.type },
                      { label: "Material",   value: item.material },
                      { label: "Acabamento", value: item.finish },
                      { label: "Quantidade", value: item.quantity ? `${item.quantity} un.` : null },
                      { label: "M²",         value: item.calculatedM2 ? `${item.calculatedM2} m²` : null },
                      { label: "Medida",     value: item.measurement },
                    ].filter(x => x.value).map(({ label, value }) => (
                      <div key={label} style={{ backgroundColor: "#fafaf9", padding: "12px 14px", borderRadius: 8, border: "1px solid #f0ede9" }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "#8c7164", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px 0" }}>{label}</p>
                        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 14, color: "#1a1c1c", margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Sponsors */}
            {item.sponsors && item.sponsors.length > 0 && (
              <section style={{ backgroundColor: "#ffffff", padding: 24, borderRadius: 10 }}>
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10,
                  textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 16px 0",
                  display: "flex", alignItems: "center", gap: 6, color: "#78716c",
                }}>
                  <ShieldCheck style={{ width: 13, height: 13, color: "#fd761a" }} />
                  Patrocinadores Vinculados
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {item.sponsors.map((s: any) => {
                    const approval = approvalsList.find((a: any) => a.sponsorId === s.id);
                    // A tabela usa status ('pending' | 'approved' | 'rejected').
                    // O booleano `approved` nunca existiu — por isso tudo ficava "Aguardando".
                    const isApproved = approval?.status === "approved" || approval?.approved === true;
                    const isRejected = approval?.status === "rejected" || approval?.approved === false;
                    return (
                      <div
                        key={s.id}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, backgroundColor: "#fafaf9", borderRadius: 8, border: "1px solid #f0ede9", transition: "background 0.15s" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#e8e8e7"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#f3f4f3"}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{
                            width: 36, height: 36, backgroundColor: "#f5f4f1", borderRadius: 8,
                            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          }}>
                            <span style={{ fontSize: 16, fontWeight: 700, color: s.color || "#1c1917" }}>
                              {(s.name || "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "#1a1c1c", display: "block" }}>{s.name}</span>
                            {approval?.approvedAt ? (
                              <span style={{ fontSize: 10, color: "#78716c", fontFamily: "'DM Mono', monospace" }}>
                                {format(new Date(approval.approvedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                                {approval.approvedBy ? ` · ${approval.approvedBy}` : ""}
                              </span>
                            ) : approval?.rejectedAt ? (
                              <span style={{ fontSize: 10, color: "#ba1a1a", fontFamily: "'DM Mono', monospace" }}>
                                {format(new Date(approval.rejectedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}
                                {approval.rejectedBy ? ` · ${approval.rejectedBy}` : ""}
                                {approval.rejectionReason ? ` — ${approval.rejectionReason}` : ""}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {isApproved ? (
                          <span style={{ padding: "4px 12px", borderRadius: 999, backgroundColor: "rgba(0,99,152,0.1)", color: "#006398", fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Aprovado</span>
                        ) : isRejected ? (
                          <span style={{ padding: "4px 12px", borderRadius: 999, backgroundColor: "rgba(186,26,26,0.1)", color: "#ba1a1a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Reprovado</span>
                        ) : (
                          <span style={{ padding: "4px 12px", borderRadius: 999, backgroundColor: "#e2e2e2", color: "#584237", fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Aguardando</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {item.sponsorApprovedBy && item.sponsorApprovedAt && (
                  <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(0,99,152,0.05)", border: "1px solid rgba(0,99,152,0.15)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}>
                    <CheckCircle style={{ width: 14, height: 14, color: "#006398", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: "#003554", fontWeight: 600 }}>
                      Aprovado por <strong>{item.sponsorApprovedBy}</strong> em {format(new Date(item.sponsorApprovedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                )}
              </section>
            )}
          </div>

          {/* ── RIGHT COLUMN (40%) ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Aprovação de Arte — glass-purple/orange */}
            <section style={{
              background: "#ffffff",
              border: "1px solid #f0ede9", borderTop: "3px solid #fd761a",
              padding: 24, borderRadius: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#78716c", margin: 0 }}>
                  Aprovação de Arte
                </h3>
                <FileImage style={{ width: 20, height: 20, color: "#9d4300" }} />
              </div>

              {thumbUrl ? (
                <>
                  <div style={{ position: "relative", aspectRatio: "16/9", backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 4, overflow: "hidden", marginBottom: 16 }}>
                    <FilePreview url={thumbUrl} linkUrl={thumbUrl} objectFit="cover" />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", color: "rgba(88,66,55,0.6)", margin: 0 }}>Arquivo de Aprovação</p>
                    {/* O nome do arquivo no storage é um UUID; mostrá-lo cru não
                        informa nada. Só exibe quando for um nome de verdade. */}
                    <p style={{ fontSize: 12, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {friendlyFileName(thumbUrl)}
                    </p>
                    {item.approvalThumbUpdatedAt && (
                      <p style={{ fontSize: 10, color: "rgba(88,66,55,0.6)", margin: "2px 0 0" }}>
                        Atualizado em {fmtShort(item.approvalThumbUpdatedAt)}
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                      <a href={thumbUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: "#9d4300", textDecoration: "underline", display: "flex", alignItems: "center", gap: 4 }}>
                        <ExternalLink style={{ width: 10, height: 10 }} /> Abrir original
                      </a>
                      {item.previousApprovalThumbUrl && (
                        <a href={item.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer" title="Versão anterior do thumb"
                          style={{ fontSize: 10, color: "#92400e", textDecoration: "underline", display: "flex", alignItems: "center", gap: 4 }}>
                          <ExternalLink style={{ width: 10, height: 10 }} /> Ver versão anterior
                        </a>
                      )}
                      {item.bookUrl && (
                        <a href={item.bookUrl} target="_blank" rel="noopener noreferrer" title="Book de aprovação que cobre esta peça"
                          style={{ fontSize: 10, color: "#6d28d9", textDecoration: "underline", display: "flex", alignItems: "center", gap: 4 }}>
                          <ExternalLink style={{ width: 10, height: 10 }} /> Book de aprovação
                        </a>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ aspectRatio: "16/9", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, border: "1px dashed rgba(157,67,0,0.2)" }}>
                  <FileImage style={{ width: 32, height: 32, color: "rgba(157,67,0,0.3)" }} />
                  <p style={{ fontSize: 12, color: "rgba(157,67,0,0.5)", margin: 0 }}>Nenhum arquivo enviado</p>
                </div>
              )}
            </section>

            {/* Arquivo Final — glass-green/blue */}
            <section style={{
              background: "#ffffff",
              border: "1px solid #e8f4fb", borderTop: "3px solid #006398",
              padding: 24, borderRadius: 10,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#78716c", margin: 0 }}>
                  Arquivo Final
                </h3>
                <FolderOpen style={{ width: 20, height: 20, color: "#006398" }} />
              </div>

              {item.finalFileUrl ? (
                <>
                  <div style={{ padding: 16, backgroundColor: "#f5f9fc", borderRadius: 8, border: "1px solid #d4eaf5" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <FolderOpen style={{ width: 20, height: 20, color: "#006398", marginTop: 2, flexShrink: 0 }} />
                      <div style={{ overflow: "hidden" }}>
                        <p style={{
                          fontSize: 9, fontWeight: 700, backgroundColor: "#006398", color: "#ffffff",
                          padding: "2px 8px", borderRadius: 4, display: "inline-block",
                          marginBottom: 8, textTransform: "uppercase", letterSpacing: "-0.04em",
                        }}>
                          PRONTO PARA IMPRESSÃO
                        </p>
                        {/* O nome original do arquivo é o que identifica a peça
                            para a Gráfica; a URL é um UUID e não diz nada. */}
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, wordBreak: "break-all", color: "#003554", margin: 0, fontWeight: 700 }}>
                          {item.finalFileName || item.finalFileUrl}
                        </p>
                        {item.finalFileUpdatedAt && (
                          <p style={{ fontSize: 10, color: "rgba(0,53,84,0.6)", margin: "4px 0 0" }}>
                            Enviado em {fmtShort(item.finalFileUpdatedAt)}
                          </p>
                        )}
                        {item.previousFinalFileUrl && (
                          <p style={{ fontSize: 10, color: "#92400e", margin: "6px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                            ⚠ Substituiu <strong>{item.previousFinalFileName || "versão anterior"}</strong>
                            {" — "}
                            <a href={item.previousFinalFileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#92400e" }}>ver anterior</a>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  {item.finalFileUrl.startsWith("http") && (
                    <a
                      href={item.finalFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center",
                        width: "100%", marginTop: 12, padding: "12px 0",
                        backgroundColor: "#006398", color: "#ffffff", borderRadius: 6,
                        fontWeight: 700, fontSize: 11, textTransform: "uppercase",
                        letterSpacing: "0.1em", textDecoration: "none",
                        transition: "filter 0.15s",
                      }}
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1.1)"}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.filter = "brightness(1)"}
                    >
                      <ExternalLink style={{ width: 14, height: 14, marginRight: 8 }} />
                      Abrir Arquivo Final
                    </a>
                  )}
                </>
              ) : (
                <div style={{ padding: 24, backgroundColor: "#f5f9fc", borderRadius: 8, border: "1px dashed rgba(0,99,152,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontSize: 12, color: "rgba(0,99,152,0.45)", margin: 0 }}>Arquivo final não informado</p>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            FULL-WIDTH SECTIONS
        ══════════════════════════════════════════════════════ */}
        <div style={{ padding: "20px 32px 32px 32px", display: "flex", flexDirection: "column", gap: 36 }}>

          {/* ── Dados de Produção ── */}
          <section>
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 6, color: "#78716c" }}>
              <Package style={{ width: 13, height: 13, color: "#fd761a" }} />
              Dados de Produção
            </h3>
            <div style={{ overflow: "hidden", borderRadius: 10, border: "1px solid #f0ede9", backgroundColor: "#ffffff" }}>
              <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #f0ede9" }}>
                    {["Quantidade", "Total M²", "Dimensões Visuais", "Dimensões Arquivo", "Medida"].map(col => (
                      <th key={col} style={{ padding: "11px 16px", fontSize: 9, fontWeight: 900, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.1em" }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: "1px solid #eeeeed" }}>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 14, fontWeight: 700, color: "#1a1c1c" }}>{item.quantity || 0} un.</td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#57534e" }}>{item.calculatedM2 ?? "—"} m²</td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#57534e" }}>
                      {item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : "—"}
                    </td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#57534e" }}>
                      {item.fileWidth && item.fileHeight ? `${item.fileWidth} × ${item.fileHeight}` : "—"}
                    </td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 14, color: "#57534e" }}>{item.measurement || "—"}</td>
                  </tr>
                  {/* Andamento na Gráfica. Sem estas quantidades não dava para
                      saber quanto de uma peça já foi conferido ou entregue —
                      justamente o que as etapas parciais criaram. */}
                  {(item.quantityProduced || item.receivedBy || item.reuseQty > 0
                    || item.conferredQty > 0 || item.deliveredQty > 0) && (
                    <tr style={{ borderTop: "1px solid #eeeeed", backgroundColor: "#fafaf9" }}>
                      <td colSpan={5} style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
                          {([
                            ["Reaproveitado", item.reuseQty, "#059669"],
                            ["Produzido", item.quantityProduced, "#1a1c1c"],
                            ["Conferido", item.conferredQty, "#0e7490"],
                            ["Entregue", item.deliveredQty, "#7e22ce"],
                          ] as const).filter(([, v]) => v > 0).map(([label, value, color]) => (
                            <div key={label}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
                              <p style={{ fontSize: 14, fontWeight: 700, color, margin: "2px 0 0 0", fontFamily: "'DM Mono', monospace" }}>
                                {value}<span style={{ color: "#a8a29e", fontWeight: 400 }}>/{item.quantity}</span>
                              </p>
                            </div>
                          ))}
                          {item.receivedBy && (
                            <div>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.07em" }}>Recebido por</span>
                              <p style={{ fontSize: 14, fontWeight: 700, color: "#1a1c1c", margin: "2px 0 0 0" }}>{item.receivedBy}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Action slots ── */}
          {topActions && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{topActions}</div>}
          {customActions && <div>{customActions}</div>}

          {/* ── Fotos da conferência/entrega + Observações ── */}
          {(hasFlowPhotos || hasObservations) && (
            <div style={{ display: "grid", gridTemplateColumns: hasFlowPhotos && hasObservations ? "1fr 1fr" : "1fr", gap: 32 }}>
              {hasFlowPhotos && (
                <section>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 6, color: "#78716c" }}>
                    <Camera style={{ width: 13, height: 13, color: "#fd761a" }} />
                    Registros da Gráfica
                  </h3>

                  {(conferencePhotos.length > 0 || item.conferenceNotes) && (
                    <div style={{ marginBottom: (deliveryPhotos.length || item.deliveryNotes) ? 20 : 0 }}>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0e7490", margin: "0 0 8px 0" }}>
                        Conferência {conferencePhotos.length > 1 && `· ${conferencePhotos.length} fotos`}
                      </p>
                      <PhotoStrip urls={conferencePhotos} alt="Foto da conferência" />
                      {item.conferenceNotes && (
                        <p style={{ fontSize: 12, color: "#584237", fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0 0" }}>"{item.conferenceNotes}"</p>
                      )}
                    </div>
                  )}

                  {(deliveryPhotos.length > 0 || item.deliveryNotes) && (
                    <div>
                      <p style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7e22ce", margin: "0 0 8px 0" }}>
                        Entrega {deliveryPhotos.length > 1 && `· ${deliveryPhotos.length} fotos`}
                        {item.receivedBy && <span style={{ color: "#84756c", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}> — recebido por {item.receivedBy}</span>}
                      </p>
                      <PhotoStrip urls={deliveryPhotos} alt="Foto da entrega" />
                      {item.deliveryNotes && (
                        <p style={{ fontSize: 12, color: "#584237", fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0 0" }}>"{item.deliveryNotes}"</p>
                      )}
                    </div>
                  )}
                </section>
              )}
              {hasObservations && (
                <section>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 6, color: "#78716c" }}>
                    <FileText style={{ width: 13, height: 13, color: "#fd761a" }} />
                    Observações
                  </h3>
                  <div style={{ backgroundColor: "#fafaf9", padding: "14px 16px", borderRadius: 10, border: "1px solid #f0ede9" }}>
                    <p style={{ color: "#584237", fontStyle: "italic", lineHeight: 1.6, fontSize: 13, margin: 0 }}>
                      "{item.observations}"
                    </p>
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── Rastreabilidade + Histórico ── */}
          {(hasTimestamps || historyStages.length > 0 || deliveryLog) && (
            <div style={{ display: "grid", gridTemplateColumns: hasTimestamps ? "2fr 1fr" : "1fr", gap: 32 }}>

              {/* Rastreabilidade Temporal */}
              {hasTimestamps && (
                <div>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 6, color: "#78716c" }}>
                    <Clock style={{ width: 13, height: 13, color: "#fd761a" }} />
                    Rastreabilidade Temporal
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #eeeeed" }}>
                          {["Etapa", "Data / Hora", "Responsável"].map(col => (
                            <th key={col} style={{ paddingBottom: 12, fontSize: 9, fontWeight: 900, textTransform: "uppercase", color: "#8c7164", letterSpacing: "0.08em" }}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody style={{ borderCollapse: "collapse" }}>
                        {traceRows.map((row, i) => (
                          <tr key={row.label} style={{ borderBottom: i < traceRows.length - 1 ? "1px solid rgba(238,238,237,0.6)" : "none" }}>
                            <td style={{ padding: "12px 0", fontSize: 13, fontWeight: 700, color: "#1a1c1c", display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: row.dot, display: "inline-block", flexShrink: 0 }} />
                              {row.label}
                            </td>
                            <td style={{ padding: "12px 16px", fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#57534e" }}>
                              {format(new Date(row.value!), "dd MMM yy HH:mm", { locale: ptBR }).toUpperCase()}
                            </td>
                            <td style={{ padding: "12px 0", fontSize: 12, color: "#8c7164" }}>
                              {row.by || <span style={{ opacity: 0.4 }}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Histórico / Audit */}
              <div>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 6, color: "#78716c" }}>
                  <History style={{ width: 13, height: 13, color: "#fd761a" }} />
                  Histórico
                </h3>
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 1, backgroundColor: "#e8e8e7" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {historyStages.map((stage, idx) => {
                      const logEntry = getLog(stage.keywords, stage.pool, (stage as any).actionType);
                      return (
                        <div key={idx} style={{ position: "relative" }}>
                          <div style={{
                            position: "absolute", left: -23, top: 4,
                            width: 12, height: 12, borderRadius: "50%",
                            backgroundColor: logEntry ? "#fd761a" : "#e2e2e2",
                            boxShadow: logEntry ? "0 0 0 4px rgba(253,118,26,0.1)" : "none",
                          }} />
                          <p style={{ fontSize: logEntry ? 12 : 11, fontWeight: logEntry ? 700 : 400, textTransform: "uppercase", letterSpacing: logEntry ? "-0.04em" : "0.01em", color: logEntry ? "#1a1c1c" : "#c2b9b3", margin: "0 0 2px 0" }}>
                            {stage.label}
                          </p>
                          {logEntry && (
                            <p style={{ fontSize: 10, color: "#8c7164", margin: 0, fontFamily: "'DM Mono', monospace" }}>
                              {logEntry.date}{logEntry.user ? ` · @${logEntry.user}` : ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {deliveryLog && (
                      <div style={{ position: "relative" }}>
                        <div style={{
                          position: "absolute", left: -23, top: 4,
                          width: 12, height: 12, borderRadius: "50%",
                          backgroundColor: "#10b981",
                          boxShadow: "0 0 0 4px rgba(16,185,129,0.15)",
                        }} />
                        <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.04em", color: "#1a1c1c", margin: "0 0 2px 0" }}>
                          {deliveryLog.details || "Entregue"}
                        </p>
                        <p style={{ fontSize: 10, color: "#8c7164", margin: 0, fontFamily: "'DM Mono', monospace" }}>
                          {fmtShort(deliveryLog.createdAt ?? deliveryLog.created_at)}
                          {(deliveryLog.userName ?? deliveryLog.user_name) ? ` · @${deliveryLog.userName ?? deliveryLog.user_name}` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            FOOTER ACTION BAR
        ══════════════════════════════════════════════════════ */}
        <footer style={{
          padding: "16px 32px", borderTop: "1px solid #e7e5e4", backgroundColor: "#f5f4f1",
          display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#a8a29e", letterSpacing: "0.04em" }}>
              {item.displayId}
            </span>
            {item.updatedAt && (
              <>
                <div style={{ width: 1, height: 12, backgroundColor: "#e7e5e4" }} />
                <span style={{ fontSize: 10, color: "#a8a29e" }}>
                  Atualizado {format(new Date(item.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </>
            )}
          </div>
          <button
            onClick={() => onOpenChange(false)}
            style={{
              padding: "8px 20px", backgroundColor: "#1c1917",
              border: "none",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em",
              color: "#ffffff", cursor: "pointer", borderRadius: 6, transition: "background 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#292524"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.backgroundColor = "#1c1917"}
          >
            Fechar
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
