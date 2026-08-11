import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilePreview, isImageUrl, isPdf } from "@/components/file-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { getStatusLabel } from "@/lib/status";
import {
  Calendar, ClipboardList, FileText, History,
  Edit, Save, X, Link2, Palette, CheckCircle, Zap, Eye, Cog, Check,
  FileImage, FolderOpen, ExternalLink, Camera, Clock, ShieldCheck, Package, Paperclip,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Undo2 } from "lucide-react";

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

// Rótulos de status vêm de lib/status.ts (fonte única).

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
 * Lightbox simples: exibe a foto em tamanho maior num overlay escuro.
 * Fechar com clique fora da imagem, botão ×, ou tecla Escape.
 */
function PhotoLightbox({
  url, alt, onClose,
}: { url: string; alt: string; onClose: () => void }) {
  // Fecha com Escape.
  //
  // stopPropagation e captura: o lightbox vive dentro do Dialog do Radix, que
  // também fecha no Escape. Sem interceptar antes, uma tecla fechava os dois —
  // a foto E a ficha da peça por baixo, obrigando a reabrir tudo.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Foto ampliada"}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      {/* Botão fechar */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer",
          color: "#ffffff", padding: 8, borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.3)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.15)"; }}
        aria-label="Fechar"
      >
        <X style={{ width: 20, height: 20 }} />
      </button>

      {/* Imagem — clique nela não propaga para o overlay */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: "relative", maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}
      >
        <img
          src={url}
          alt={alt}
          style={{ maxWidth: "90vw", maxHeight: "80vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 25px 60px rgba(0,0,0,0.6)" }}
        />
        {/* Link para abrir em nova aba */}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            color: "rgba(255,255,255,0.65)", fontSize: 13, textDecoration: "none",
            padding: "5px 12px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.1)",
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.65)"; (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.1)"; }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} />
          Abrir original
        </a>
      </div>
    </div>
  );
}

/**
 * Faixa de miniaturas; clicar abre a foto em lightbox. Tamanho fixo
 * por miniatura — com largura total, uma única foto virava um bloco gigante.
 */
function PhotoStrip({ urls, alt }: { urls: string[]; alt: string }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {urls.map(url => (
          <button
            key={url}
            onClick={() => setLightboxUrl(url)}
            title="Ampliar foto"
            style={{
              display: "block", position: "relative", width: 132, height: 132,
              borderRadius: 8, overflow: "hidden", border: "1px solid #e8e8e7",
              backgroundColor: "#f3f4f3", flexShrink: 0,
              cursor: "zoom-in", padding: 0, appearance: "none",
            }}
          >
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
            <span style={{ position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(0,0,0,0.55)", color: "#ffffff", padding: 4, borderRadius: 6, display: "flex" }}>
              <Eye style={{ width: 10, height: 10 }} />
            </span>
          </button>
        ))}
      </div>

      {lightboxUrl && (
        <PhotoLightbox url={lightboxUrl} alt={alt} onClose={() => setLightboxUrl(null)} />
      )}
    </>
  );
}

export function ItemDetailsDialog({
  item, auditLogs = [], open, onOpenChange,
  customActions, topActions, onEditSave,
}: ItemDetailsDialogProps) {
  const [editMode, setEditMode]     = useState(false);
  const [editedItem, setEditedItem] = useState(item);
  const { user } = useAuth();
  const { toast } = useToast();
  const [revertingSponsorId, setRevertingSponsorId] = useState<string | null>(null);

  // Aprovação por patrocinador não vem no payload de /api/items — sem buscar
  // aqui, peças com várias marcas apareciam sempre como "Aguardando" no Painel
  // Geral e no detalhe do evento, mesmo já aprovadas.
  const [fetchedApprovals, setFetchedApprovals] = useState<any[]>([]);
  // Sobrepõe a lista assim que o admin reverte uma aprovação — sem isso o chip
  // ficaria com o status antigo até o diálogo reabrir.
  const [approvalsOverride, setApprovalsOverride] = useState<any[] | null>(null);
  const refetchApprovals = () => {
    if (!item?.id) return;
    return fetch(`/api/items/${item.id}/sponsor-approvals`, { credentials: "include" })
      .then(r => (r.ok ? r.json() : []))
      .then(data => { const list = Array.isArray(data) ? data : []; setFetchedApprovals(list); setApprovalsOverride(list); return list; });
  };
  useEffect(() => {
    setApprovalsOverride(null);
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

  const approvalsList: any[] = approvalsOverride ?? item.sponsorApprovals ?? fetchedApprovals;

  const handleRevertApproval = async (sponsorId: string, sponsorName: string) => {
    if (!item?.id) return;
    setRevertingSponsorId(sponsorId);
    try {
      const res = await fetch(`/api/items/${item.id}/sponsor-approvals/${sponsorId}/revert`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Não foi possível reverter a aprovação");
      await refetchApprovals();
      // O item pode ter voltado de "sponsor_approved" para aguardando aprovação —
      // as listas que dependem de /api/items (Painel Geral, Atendimento etc.)
      // precisam refletir isso sem exigir um refresh manual da página.
      queryClient.invalidateQueries({ queryKey: ["/api/items"] });
      toast({ title: "Aprovação revertida", description: `"${sponsorName}" volta a aguardar aprovação.` });
    } catch (error: any) {
      toast({ title: "Erro ao reverter", description: error.message, variant: "destructive" });
    } finally {
      setRevertingSponsorId(null);
    }
  };

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

  /**
   * Resolve as etapas do fluxo contra os audit logs.
   *
   * O ponto delicado é que as mensagens têm o formato
   * "Status alterado: <origem> → <destino>", ou seja, carregam também o nome do
   * status ANTERIOR. Procurando no texto inteiro, cada etapa casava com a
   * transição SEGUINTE: "Em aprovação de patrocinador" pegava o log que SAI de
   * "Aguardando Aprovação", que na verdade é a aprovação. Por isso o casamento
   * de status olha só o trecho depois da seta.
   *
   * Com o destino certo, cada etapa encontra exatamente o seu log e não é
   * preciso "consumir" logs para evitar colisão — o que inclusive seria errado,
   * já que um mesmo log representa duas etapas de propósito: enviar para a Arte
   * É entrar em aprovação de patrocinador.
   */
  const resolveStages = (stages: typeof historyStages) => {
    const out = new Map<string, { date: string; user?: string; ts?: any } | null>();

    for (const stage of stages) {
      const log = (stage.pool as any[]).find((log: any) => {
        if (stage.actionType && log.action === stage.actionType) return true;
        const d = (log.details || log.action || "").toLowerCase();
        const arrow = d.lastIndexOf("→");
        const target = arrow >= 0 ? d.slice(arrow + 1) : d;
        if (stage.match?.(d, target)) return true;
        return stage.keywords.some(k => target.includes(k.toLowerCase()));
      });

      out.set(stage.label, log ? {
        date: fmtShort(log.createdAt ?? log.created_at),
        user: log.userName ?? log.user_name,
        ts: log.createdAt ?? log.created_at,
      } : null);
    }
    return out;
  };

  const createdLog = itemLogs.find((l: any) => l.action === "created");

  // `match` recebe a mensagem inteira e o trecho após a seta (o status de
  // destino). Use `target` para status; `d` só quando o texto livre é a pista.
  const historyStages: { label: string; keywords: string[]; pool: any[]; actionType?: string; match?: (d: string, target: string) => boolean }[] = [
    { label: "Criado / Solicitado",            keywords: ["criado"],                    pool: itemLogs,          actionType: "created" },
    { label: "Vinculação de patrocinador",      keywords: ["patrocinadores atualizados"], pool: itemLogs },
    // Aqui a pista é o texto livre no início da mensagem, não o status.
    { label: "Enviado para Arte",               keywords: [], pool: itemLogsInclusive,
      match: d => (d.includes("enviad") && d.includes("arte")) || d.includes("aguard. envio →") || d.includes("aguard envio →") },
    // Daqui em diante, o destino é o que identifica a etapa.
    { label: "Em aprovação de patrocinador",    keywords: ["aguardando aprovação"],      pool: itemLogs },
    { label: "Aprovado — Finalização",          keywords: ["aguardando finaliz"], pool: itemLogs,
      match: (d, t) => t.includes("aguardando finaliz")
                    || d.includes("todos os patrocinadores aprovaram")
                    || d.includes("aprovado pelo patrocinador") },
    { label: "Aguardando revisão final",        keywords: ["aguardando revisão final"], pool: itemLogs,
      match: (d, t) => t.includes("aguardando revisão final") || d.includes("arquivo final adicionado") },
    { label: "Liberado para Produção",          keywords: ["pronto p/ produção", "pronto para produção", "liberado para produção"], pool: itemLogs,
      match: (d, t) => t.includes("pronto p/ produção") || t.includes("pronto para produção")
                    || d.includes("liberado para produção") || d.includes("aprovado para produção") },
    { label: "Em Produção",                     keywords: ["em produção"], pool: itemLogs, actionType: "production" },
    { label: "Produzido",                       keywords: ["produzido"], pool: itemLogs, actionType: "produced" },
    // As etapas da Gráfica faltavam por completo: a trilha terminava em
    // "Produzido" mesmo em peças já conferidas e entregues.
    { label: "Conferido",                       keywords: [], pool: itemLogs,
      match: d => d.includes("conferência") },
    { label: "Entregue",                        keywords: [], pool: itemLogs, actionType: "delivered",
      match: d => d.includes("entrega concluída") || d.includes("entrega parcial") },
  ];

  // Resolvido uma vez e compartilhado pelas duas colunas — ver resolveStages.
  const stageLogs = resolveStages(historyStages);

  const deliveryLog = itemLogs.find((l: any) => l.action === "delivered");

  const thumbUrl = item.approvalThumbUrl;
  const isThumbImage = thumbUrl && (isImageUrl(thumbUrl) && !isPdf(thumbUrl));

  // Com uma foto só, ela já está no topo ao lado da arte — repetir aqui embaixo
  // seria a mesma imagem duas vezes no mesmo card.
  const showConferenceStrip = conferencePhotos.length > (thumbUrl ? 1 : 0);
  // Peça entregue sem comprovante: a foto da entrega é opcional, então dá para
  // concluir sem anexar nada. Mostrar isso explicitamente evita a leitura de que
  // o registro existe e não está carregando.
  const isDeliveredItem  = ["delivered", "entregue"].includes(rawStatus);
  const missingDeliveryProof = isDeliveredItem && deliveryPhotos.length === 0;
  // A seção só existe se sobrar algo para mostrar. Sem esta checagem, quando a
  // única foto subia para o topo o título "Registros da Gráfica" ficava sozinho,
  // anunciando um bloco vazio.
  const hasFlowPhotos    = showConferenceStrip || deliveryPhotos.length > 0
                        || !!item.conferenceNotes || !!item.deliveryNotes
                        || missingDeliveryProof;
  const hasObservations  = !!item.observations;
  const hasTimestamps    = !!(item.createdAt || item.sponsorApprovedAt || item.creatorReviewedAt || item.approvedAt || item.productionStartedAt || item.producedAt || item.conferredAt || item.deliveredAt);

  const createdBy = createdLog?.userName ?? createdLog?.user_name ?? null;

  // Etapas intermediárias não têm campo de timestamp dedicado no item — vêm dos
  // audit logs. Reaproveitam a resolução sequencial do HISTÓRICO em vez de cada
  // uma varrer a lista por conta própria: com buscas independentes, duas etapas
  // acabavam no mesmo log e a trilha aparecia fora de ordem.
  const sponsorLinkLog = stageLogs.get("Vinculação de patrocinador");
  const sentToArteLog = stageLogs.get("Enviado para Arte");
  const awaitingSponsorLog = stageLogs.get("Em aprovação de patrocinador");
  const conferLog = stageLogs.get("Conferido");
  const logTs = (l: any) => l?.ts ?? null;
  const logBy = (l: any) => l?.user ?? null;

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
    // A conferência entrou no fluxo depois e ficou de fora desta trilha.
    { label: "Conferido",                  value: item.conferredAt,                                        by: logBy(conferLog),                                          dot: "#0891b2" },
    { label: "Entregue",                   value: item.deliveredAt,                                        by: item.receivedBy,                                           dot: "#10b981" },
  ]
    .filter((r): r is { label: string; value: any; by: any; dot: string } => !!r && !!r.value)
    // A ordem das etapas é a do fluxo, mas as datas vêm de fontes diferentes
    // (campos do item e audit logs). Ordenar por data garante que a trilha seja
    // lida de cima para baixo sem saltos para trás.
    .sort((a, b) => new Date(a.value).getTime() - new Date(b.value).getTime());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 gap-0"
        /* raio 16: era 6, o único modal do app fora do degrau de modal. */
        style={{ backgroundColor: "#f9f9f8", borderRadius: 16, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)" }}
      >
        {/* Sem DialogTitle o Radix anuncia um diálogo sem nome (e reclama no
            console). Como o cabeçalho visual já mostra a peça, o título fica
            só para leitor de tela. Este componente abre em cinco telas, então
            a falta valia por cinco. */}
        <DialogTitle className="sr-only">
          {item?.displayId ? `Peça ${item.displayId}` : "Detalhes da peça"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Especificações, arte, patrocinadores e histórico da peça
        </DialogDescription>
        {/* ── Close button ── */}
        <button
          onClick={() => onOpenChange(false)}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 50,
            background: "rgba(255,255,255,0.1)", border: "none", cursor: "pointer",
            color: "rgba(255,255,255,0.6)", padding: 6, borderRadius: 6,
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
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.06em" }}>
                {item.displayId}
              </span>
              {/* Status + tag pills inline */}
              <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(253,118,26,0.2)", color: "#fd761a", border: "1px solid rgba(253,118,26,0.3)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {getStatusLabel(rawStatus)}
              </span>
              {(item.isReuse || item.reuseQty > 0) && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(22,101,52,0.3)", color: "#4ade80", border: "1px solid rgba(22,101,52,0.4)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {item.isReuse ? "Reaproveitamento" : `↩ ${item.reuseQty}/${item.quantity}`}
                </span>
              )}
              {item.rejectedBySponsor && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(186,26,26,0.25)", color: "#ff5449", border: "1px solid rgba(186,26,26,0.35)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reprov. Patrocinador</span>
              )}
              {item.rejectedByCreator && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(186,26,26,0.25)", color: "#ff5449", border: "1px solid rgba(186,26,26,0.35)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Reprov. Criador</span>
              )}
              {item.skipApproval && (
                <span style={{ padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em" }}>Aprov. Ignorada</span>
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
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
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
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 700, color: "#f97316", textDecoration: "none", padding: "5px 12px", backgroundColor: "rgba(249,115,22,0.08)", borderRadius: 6, border: "1px solid rgba(249,115,22,0.2)" }}
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
            <section style={{ backgroundColor: "#ffffff", padding: "20px 24px", borderRadius: 12 }}>
              <h3 style={{
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10,
                textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 18px 0",
                display: "flex", alignItems: "center", gap: 6, color: "#746e69",
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
                        <label style={{ fontSize: 11, color: "#746e69", display: "block", marginBottom: 4 }}>{label}</label>
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
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#8c7164", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px 0" }}>{label}</p>
                        <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: "#1a1c1c", margin: 0 }}>{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Sponsors */}
            {item.sponsors && item.sponsors.length > 0 && (
              <section style={{ backgroundColor: "#ffffff", padding: 24, borderRadius: 12 }}>
                <h3 style={{
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10,
                  textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 16px 0",
                  display: "flex", alignItems: "center", gap: 6, color: "#746e69",
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
                            <span style={{ fontSize: 15, fontWeight: 700, color: s.color || "#1c1917" }}>
                              {(s.name || "?")[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: 15, color: "#1a1c1c", display: "block" }}>{s.name}</span>
                            {approval?.approvedAt ? (
                              <span style={{ fontSize: 10, color: "#746e69", fontFamily: "'DM Mono', monospace" }}>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {isApproved ? (
                            <span style={{ padding: "4px 12px", borderRadius: 999, backgroundColor: "rgba(0,99,152,0.1)", color: "#006398", fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Aprovado</span>
                          ) : isRejected ? (
                            <span style={{ padding: "4px 12px", borderRadius: 999, backgroundColor: "rgba(186,26,26,0.1)", color: "#ba1a1a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Reprovado</span>
                          ) : (
                            <span style={{ padding: "4px 12px", borderRadius: 999, backgroundColor: "#e2e2e2", color: "#584237", fontSize: 10, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap" }}>Aguardando</span>
                          )}
                          {/* Correção de admin: desfaz uma aprovação/reprovação feita por
                              engano, sem precisar mexer direto no banco. */}
                          {user?.role === "admin" && approval && approval.status !== "pending" && (
                            <button
                              type="button"
                              onClick={() => handleRevertApproval(s.id, s.name)}
                              disabled={revertingSponsorId === s.id}
                              title={`Reverter para pendente (admin) — estava ${isApproved ? "aprovado" : "reprovado"}`}
                              data-testid={`button-revert-approval-${s.id}`}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "center",
                                width: 26, height: 26, borderRadius: 999, border: "1px solid #e7e5e4",
                                backgroundColor: "#ffffff", color: "#746e69", cursor: revertingSponsorId === s.id ? "default" : "pointer",
                                opacity: revertingSponsorId === s.id ? 0.5 : 1, flexShrink: 0,
                              }}
                            >
                              <Undo2 style={{ width: 13, height: 13 }} />
                            </button>
                          )}
                        </div>
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
              padding: 24, borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", margin: 0 }}>
                  Aprovação de Arte
                </h3>
                <FileImage style={{ width: 20, height: 20, color: "#9d4300" }} />
              </div>

              {thumbUrl ? (
                <>
                  {/* Arte aprovada e peça conferida lado a lado: comparar o que
                      foi aprovado com o que saiu da impressora é justamente o
                      que se quer olhar aqui, sem rolar até o fim do card. */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: conferencePhotos.length > 0 ? "1fr 1fr" : "1fr",
                    gap: 10, marginBottom: 16,
                  }}>
                    <div>
                      <div style={{ position: "relative", aspectRatio: "16/9", backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 6, overflow: "hidden" }}>
                        <FilePreview url={thumbUrl} linkUrl={thumbUrl} objectFit="cover" />
                      </div>
                      {conferencePhotos.length > 0 && (
                        <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9d4300", margin: "6px 0 0", textAlign: "center" }}>
                          Arte aprovada
                        </p>
                      )}
                    </div>

                    {conferencePhotos.length > 0 && (
                      <div>
                        <a href={conferencePhotos[0]} target="_blank" rel="noopener noreferrer"
                          title="Abrir foto da conferência"
                          style={{ display: "block", position: "relative", aspectRatio: "16/9", backgroundColor: "rgba(255,255,255,0.4)", borderRadius: 6, overflow: "hidden", border: "1px solid #a5f3fc" }}>
                          <img src={conferencePhotos[0]} alt="Foto da conferência"
                            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                          {conferencePhotos.length > 1 && (
                            <span style={{ position: "absolute", bottom: 4, right: 4, backgroundColor: "rgba(14,116,144,0.9)", color: "#fff", fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 6 }}>
                              +{conferencePhotos.length - 1}
                            </span>
                          )}
                        </a>
                        <p style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: "#0e7490", margin: "6px 0 0", textAlign: "center" }}>
                          Conferido pela Gráfica
                        </p>
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: "rgba(88,66,55,0.6)", margin: 0 }}>Arquivo de Aprovação</p>
                    {/* O nome do arquivo no storage é um UUID; mostrá-lo cru não
                        informa nada. Só exibe quando for um nome de verdade. */}
                    <p style={{ fontSize: 13, fontWeight: 500, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                <div style={{ aspectRatio: "16/9", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, border: "1px dashed rgba(157,67,0,0.2)" }}>
                  <FileImage style={{ width: 32, height: 32, color: "rgba(157,67,0,0.3)" }} />
                  <p style={{ fontSize: 13, color: "rgba(157,67,0,0.5)", margin: 0 }}>Nenhum arquivo enviado</p>
                </div>
              )}
            </section>

            {/* Arquivo Final — glass-green/blue */}
            <section style={{
              background: "#ffffff",
              border: "1px solid #e8f4fb", borderTop: "3px solid #006398",
              padding: 24, borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "#746e69", margin: 0 }}>
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
                          fontSize: 10, fontWeight: 700, backgroundColor: "#006398", color: "#ffffff",
                          padding: "2px 8px", borderRadius: 6, display: "inline-block",
                          marginBottom: 8, textTransform: "uppercase", letterSpacing: "-0.04em",
                        }}>
                          PRONTO PARA IMPRESSÃO
                        </p>
                        {/* O nome original do arquivo é o que identifica a peça
                            para a Gráfica; a URL é um UUID e não diz nada. */}
                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, wordBreak: "break-all", color: "#003554", margin: 0, fontWeight: 700 }}>
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
                      onMouseEnter={e => (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#004f7a"}
                      onMouseLeave={e => (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#006398"}
                    >
                      <ExternalLink style={{ width: 14, height: 14, marginRight: 8 }} />
                      Abrir Arquivo Final
                    </a>
                  )}
                </>
              ) : (
                <div style={{ padding: 24, backgroundColor: "#f5f9fc", borderRadius: 8, border: "1px dashed rgba(0,99,152,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontSize: 13, color: "rgba(0,99,152,0.45)", margin: 0 }}>Arquivo final não informado</p>
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
            <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 6, color: "#746e69" }}>
              <Package style={{ width: 13, height: 13, color: "#fd761a" }} />
              Dados de Produção
            </h3>
            <div style={{ overflow: "hidden", borderRadius: 12, border: "1px solid #f0ede9", backgroundColor: "#ffffff" }}>
              <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #f0ede9" }}>
                    {["Quantidade", "Total M²", "Dimensões Visuais", "Dimensões Arquivo", "Medida"].map(col => (
                      <th key={col} style={{ padding: "11px 16px", fontSize: 10, fontWeight: 900, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.1em" }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: "1px solid #eeeeed" }}>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#1a1c1c" }}>{item.quantity || 0} un.</td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#57534e" }}>{item.calculatedM2 ?? "—"} m²</td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#57534e" }}>
                      {item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : "—"}
                    </td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#57534e" }}>
                      {item.fileWidth && item.fileHeight ? `${item.fileWidth} × ${item.fileHeight}` : "—"}
                    </td>
                    <td style={{ padding: 16, fontFamily: "'DM Mono', monospace", fontSize: 15, color: "#57534e" }}>{item.measurement || "—"}</td>
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
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
                              <p style={{ fontSize: 15, fontWeight: 700, color, margin: "2px 0 0 0", fontFamily: "'DM Mono', monospace" }}>
                                {value}<span style={{ color: "#746e69", fontWeight: 400 }}>/{item.quantity}</span>
                              </p>
                            </div>
                          ))}
                          {item.receivedBy && (
                            <div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.07em" }}>Recebido por</span>
                              <p style={{ fontSize: 15, fontWeight: 700, color: "#1a1c1c", margin: "2px 0 0 0" }}>{item.receivedBy}</p>
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
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 6, color: "#746e69" }}>
                    <Camera style={{ width: 13, height: 13, color: "#fd761a" }} />
                    Registros da Gráfica
                  </h3>

                  {/* A primeira foto da conferência já aparece ao lado da arte,
                      no topo. Aqui só entra o que não coube lá: as demais fotos
                      e a observação. */}
                  {(showConferenceStrip || item.conferenceNotes) && (
                    <div style={{ marginBottom: (deliveryPhotos.length || item.deliveryNotes) ? 20 : 0 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0e7490", margin: "0 0 8px 0" }}>
                        Conferência {conferencePhotos.length > 1 && `· ${conferencePhotos.length} fotos`}
                      </p>
                      {showConferenceStrip && <PhotoStrip urls={conferencePhotos} alt="Foto da conferência" />}
                      {item.conferenceNotes && (
                        <p style={{ fontSize: 13, color: "#584237", fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0 0" }}>"{item.conferenceNotes}"</p>
                      )}
                    </div>
                  )}

                  {(deliveryPhotos.length > 0 || item.deliveryNotes) && (
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7e22ce", margin: "0 0 8px 0" }}>
                        Entrega {deliveryPhotos.length > 1 && `· ${deliveryPhotos.length} fotos`}
                        {item.receivedBy && <span style={{ color: "#84756c", letterSpacing: 0, textTransform: "none", fontWeight: 400 }}> — recebido por {item.receivedBy}</span>}
                      </p>
                      <PhotoStrip urls={deliveryPhotos} alt="Foto da entrega" />
                      {item.deliveryNotes && (
                        <p style={{ fontSize: 13, color: "#584237", fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0 0" }}>"{item.deliveryNotes}"</p>
                      )}
                    </div>
                  )}

                  {missingDeliveryProof && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                      <span style={{ fontSize: 13, lineHeight: 1 }}>⚠</span>
                      <div>
                        <p style={{ fontSize: 11, fontWeight: 700, color: "#92400e", margin: 0 }}>Entregue sem comprovante fotográfico</p>
                        <p style={{ fontSize: 11, color: "#a16207", margin: "2px 0 0", lineHeight: 1.4 }}>
                          A foto da entrega é opcional{item.receivedBy ? ` — consta apenas o recebimento por ${item.receivedBy}` : ""}.
                        </p>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {hasObservations && (
                <section>
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 14px 0", display: "flex", alignItems: "center", gap: 6, color: "#746e69" }}>
                    <FileText style={{ width: 13, height: 13, color: "#fd761a" }} />
                    Observações
                  </h3>
                  <div style={{ backgroundColor: "#fafaf9", padding: "14px 16px", borderRadius: 12, border: "1px solid #f0ede9" }}>
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
                  <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 6, color: "#746e69" }}>
                    <Clock style={{ width: 13, height: 13, color: "#fd761a" }} />
                    Rastreabilidade Temporal
                  </h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #eeeeed" }}>
                          {["Etapa", "Data / Hora", "Responsável"].map(col => (
                            <th key={col} style={{ paddingBottom: 12, fontSize: 10, fontWeight: 900, textTransform: "uppercase", color: "#8c7164", letterSpacing: "0.08em" }}>{col}</th>
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
                            <td style={{ padding: "12px 16px", fontFamily: "'DM Mono', monospace", fontSize: 13, color: "#57534e" }}>
                              {format(new Date(row.value!), "dd MMM yy HH:mm", { locale: ptBR }).toUpperCase()}
                            </td>
                            <td style={{ padding: "12px 0", fontSize: 13, color: "#8c7164" }}>
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
                <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", margin: "0 0 16px 0", display: "flex", alignItems: "center", gap: 6, color: "#746e69" }}>
                  <History style={{ width: 13, height: 13, color: "#fd761a" }} />
                  Histórico
                </h3>
                <div style={{ position: "relative", paddingLeft: 28 }}>
                  <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 1, backgroundColor: "#e8e8e7" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {historyStages.map((stage, idx) => {
                      const logEntry = stageLogs.get(stage.label) ?? null;
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
                        <p style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.04em", color: "#1a1c1c", margin: "0 0 2px 0" }}>
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
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, fontWeight: 700, color: "#746e69", letterSpacing: "0.04em" }}>
              {item.displayId}
            </span>
            {item.updatedAt && (
              <>
                <div style={{ width: 1, height: 12, backgroundColor: "#e7e5e4" }} />
                <span style={{ fontSize: 10, color: "#746e69" }}>
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
