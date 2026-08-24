import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FilePreview, isWebUrl } from "@/components/file-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { getApprovalMeta, getStatusLabel, marcoEventoFinalizado, todayBusinessMs } from "@/lib/status";
import {
  Edit, Save, X, Check, Clock, Eye, ExternalLink, Camera, Paperclip,
  FileImage, FolderOpen, AlertTriangle, CheckCircle2, Recycle,
  ChevronDown, Undo2, Truck, Copy,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { queryClient } from "@/lib/queryClient";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";

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
  { label: "Vinculação", idx: 0 },
  { label: "Arte",       idx: 1 },
  { label: "Aprovação",  idx: 2 },
  { label: "Finalização",idx: 3 },
  { label: "Revisão",    idx: 4 },
  { label: "Produção",   idx: 5 },
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

// ─────────────────────────────────────────────────────────────────────────────
// PALETA DA FICHA — três tons, e nada além deles.
//
// Não é paleta própria: são os mesmos campos de `P` (lib/status) que os chips
// do app já usam, nomeados aqui pelo PAPEL que exercem nesta tela. O modal já
// carregou uma paleta estrangeira uma vez (60 cores, tokens de Material 3); o
// jeito de não repetir é ter um lugar só onde a cor é escolhida.
//
// Os valores de texto foram medidos contra o fundo real de cada tom — ver o
// teste `a-ficha-da-peca-e-legivel`. #8c7164 sobre #fafaf9 dá 4,31 e por isso
// não aparece em lugar nenhum: o título de seção usa #7a6154 (5,49).
// ─────────────────────────────────────────────────────────────────────────────
const TOM = {
  espera:    { bg: "#fff7ed", borda: "#fed7aa", frase: "#9a3412", detalhe: "#7c2d12", ladrilho: "#fed7aa" },
  reprovado: { bg: "#fef2f2", borda: "#fecaca", frase: "#b91c1c", detalhe: "#991b1b", ladrilho: "#fecaca" },
  ok:        { bg: "#f0fdf4", borda: "#bbf7d0", frase: "#15803d", detalhe: "#166534", ladrilho: "#bbf7d0" },
  neutro:    { bg: "#fafaf9", borda: "#e7e5e4", frase: "#44403c", detalhe: "#57534e", ladrilho: "#e7e5e4" },
} as const;
type NomeDoTom = keyof typeof TOM;

/** Título de seção — fora do card, como uma legenda do bloco que vem abaixo. */
const TITULO_SECAO: React.CSSProperties = {
  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 900, fontSize: 10,
  textTransform: "uppercase", letterSpacing: "0.12em", color: "#7a6154",
  margin: 0,
};

/** Bloco branco que recebe o conteúdo de uma seção. */
const CARTAO: React.CSSProperties = {
  backgroundColor: "#ffffff", border: "1px solid #ebe8e4", borderRadius: 12,
};

const DIA_MS = 86_400_000;

/**
 * "há 3 dias" — e não "3 dias", que não diz para que lado o tempo corre.
 * Zero vira "hoje" porque "há 0 dias" é como um relógio quebrado: tecnicamente
 * certo, ilegível.
 */
function haQuantoTempo(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

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
          color: "#ffffff", width: 40, height: 40, borderRadius: 999,
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
            color: "rgba(255,255,255,0.75)", fontSize: 13, textDecoration: "none",
            padding: "8px 14px", borderRadius: 8, backgroundColor: "rgba(255,255,255,0.12)",
            transition: "color 0.15s, background 0.15s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#fff"; (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.2)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.75)"; (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "rgba(255,255,255,0.12)"; }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} />
          Abrir original
        </a>
      </div>
    </div>
  );
}

/**
 * Fotos da Gráfica em grade de duas colunas.
 *
 * Eram quadrados FIXOS de 132px numa faixa que quebrava a linha. Na coluna
 * direita de um modal a 445px — e no mobile — 132px não é uma medida
 * proporcional a nada: duas fotos deixavam uma sobra irregular à direita, três
 * transbordavam. `aspectRatio: 1` em duas colunas fluidas acompanha a largura
 * que houver.
 */
function PhotoGrid({ urls, alt }: { urls: string[]; alt: string }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {urls.map(url => (
          <button
            key={url}
            onClick={() => setLightboxUrl(url)}
            title="Ampliar foto"
            style={{
              display: "block", position: "relative", width: "100%", aspectRatio: "1",
              borderRadius: 8, overflow: "hidden", border: "1px solid #ebe8e4",
              backgroundColor: "#f5f4f1", cursor: "zoom-in", padding: 0, appearance: "none",
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
                  // #78716c sobre #f5f4f1 dá 4,36 — abaixo da régua. Sobre o
                  // branco do fallback, 4,80.
                  span.style.cssText = "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:11px;background:#ffffff;color:#78716c";
                  parent.appendChild(span);
                }
              }} />
            <span style={{ position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(0,0,0,0.6)", color: "#ffffff", padding: 5, borderRadius: 999, display: "flex" }}>
              <Eye style={{ width: 11, height: 11 }} />
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
  const isMobile = useIsMobile();
  const [revertingSponsorId, setRevertingSponsorId] = useState<string | null>(null);
  // O percurso abre com os 4 mais recentes. Uma peça que foi e voltou três
  // vezes tem trinta registros, e a ficha inteira virava a trilha dela.
  const [percursoAberto, setPercursoAberto] = useState(false);


  // Aprovação por patrocinador não vem no payload de /api/items — sem buscar
  // aqui, peças com várias marcas apareciam sempre como "Aguardando" no Painel
  // Geral e no detalhe do evento, mesmo já aprovadas.
  // useQuery (não fetch cru em useEffect): cache/deduplicação/cancelamento de
  // graça. staleTime 0 preserva o comportamento antigo de buscar a cada abertura.
  const approvalsQuery = useQuery<any[]>({
    queryKey: ["/api/items", item?.id, "sponsor-approvals"],
    enabled: !!item?.id && open && !item?.sponsorApprovals,
    staleTime: 0,
  });
  const fetchedApprovals: any[] = Array.isArray(approvalsQuery.data) ? approvalsQuery.data : [];
  // Sobrepõe a lista assim que o admin reverte uma aprovação — sem isso o chip
  // ficaria com o status antigo até o diálogo reabrir.
  const [approvalsOverride, setApprovalsOverride] = useState<any[] | null>(null);
  const refetchApprovals = async () => {
    if (!item?.id) return;
    // refetch() ignora `enabled` — funciona mesmo quando o payload já trazia
    // sponsorApprovals e a query ficou desligada.
    const res = await approvalsQuery.refetch();
    const list = Array.isArray(res.data) ? res.data : [];
    setApprovalsOverride(list);
    return list;
  };
  useEffect(() => {
    setApprovalsOverride(null);
    // Sem este reset, editMode/editedItem sobreviviam entre aberturas: o
    // Salvar da ficha usava o id da peça ANTERIOR.
    setEditMode(false);
    setEditedItem(item);
    setPercursoAberto(false);
  }, [open, item?.id]);

  // Fotos que a Gráfica anexou na conferência e na entrega, para que o registro
  // acompanhe a peça ao longo do fluxo e não fique só na tela da Gráfica.
  const { data: flowPhotosData } = useQuery<any[]>({
    queryKey: ["/api/items", item?.id, "photos"],
    enabled: !!item?.id && open,
    staleTime: 0,
  });
  const flowPhotos: any[] = Array.isArray(flowPhotosData) ? flowPhotosData : [];

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

  // FIM DA HISTÓRIA — o evento desta peça saiu de circulação (encerrado por
  // alguém, ou realizado porque a data passou). Pedido do dono (14/08): a
  // trilha não dizia isso em lugar nenhum, embora seja o que explica a peça ter
  // parado onde parou. Esta ficha abre em cinco telas (Arte, Gráfica,
  // Solicitação, Vincular, Painel Geral), então o marco chega às cinco de uma
  // vez. `item.event` é o evento cru do enrich de /api/items: traz `status` e
  // `startDate`, as duas colunas do predicado.
  const marcoEvento = marcoEventoFinalizado(item.event, todayBusinessMs());

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

  // Ações que NÃO são etapas do fluxo: acontecem em paralelo a ele e trazem
  // TEXTO LIVRE escrito por uma pessoa (o motivo do complemento, por exemplo).
  //
  // Por que isto precisa existir: `resolveStages` casa cada etapa por PALAVRA
  // dentro da mensagem. Um motivo como "o cliente pediu mais 4 para a
  // conferência de sábado" contém "conferência" e ROUBARIA a etapa "Conferido"
  // de uma peça que nunca foi conferida — carimbando uma data falsa na trilha
  // que o fechamento lê. Tirar estas ações do pool das etapas resolve para
  // sempre, e elas voltam logo abaixo, renderizadas como evento próprio.
  const EXTRA_ACTIONS = ["complement_created", "complement_canceled"];
  const isExtraAction = (l: any) => EXTRA_ACTIONS.includes(String(l.action ?? ""));
  const itemLogsFlow = itemLogs.filter((l: any) => !isExtraAction(l));
  const itemLogsInclusiveFlow = itemLogsInclusive.filter((l: any) => !isExtraAction(l));

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
    { label: "Criado / Solicitado",            keywords: ["criado"],                    pool: itemLogsFlow,          actionType: "created" },
    { label: "Vinculação de patrocinador",      keywords: ["patrocinadores atualizados"], pool: itemLogsFlow },
    // Aqui a pista é o texto livre no início da mensagem, não o status.
    { label: "Enviado para Arte",               keywords: [], pool: itemLogsInclusiveFlow,
      match: d => (d.includes("enviad") && d.includes("arte")) || d.includes("aguard. envio →") || d.includes("aguard envio →") },
    // Daqui em diante, o destino é o que identifica a etapa.
    { label: "Em aprovação de patrocinador",    keywords: ["aguardando aprovação"],      pool: itemLogsFlow },
    { label: "Aprovado — Finalização",          keywords: ["aguardando finaliz"], pool: itemLogsFlow,
      match: (d, t) => t.includes("aguardando finaliz")
                    || d.includes("todos os patrocinadores aprovaram")
                    || d.includes("aprovado pelo patrocinador") },
    { label: "Aguardando revisão final",        keywords: ["aguardando revisão final"], pool: itemLogsFlow,
      match: (d, t) => t.includes("aguardando revisão final") || d.includes("arquivo final adicionado") },
    { label: "Liberado para Produção",          keywords: ["pronto p/ produção", "pronto para produção", "liberado para produção"], pool: itemLogsFlow,
      match: (d, t) => t.includes("pronto p/ produção") || t.includes("pronto para produção")
                    || d.includes("liberado para produção") || d.includes("aprovado para produção") },
    { label: "Em Produção",                     keywords: ["em produção"], pool: itemLogsFlow, actionType: "production" },
    { label: "Produzido",                       keywords: ["produzido"], pool: itemLogsFlow, actionType: "produced" },
    // As etapas da Gráfica faltavam por completo: a trilha terminava em
    // "Produzido" mesmo em peças já conferidas e entregues.
    { label: "Conferido",                       keywords: [], pool: itemLogsFlow,
      match: d => d.includes("conferência") },
    { label: "Entregue",                        keywords: [], pool: itemLogsFlow, actionType: "delivered",
      match: d => d.includes("entrega concluída") || d.includes("entrega parcial") },
  ];

  const stageLogs = resolveStages(historyStages);
  const logTs = (l: any) => l?.ts ?? null;
  const logBy = (l: any) => l?.user ?? null;
  const conferLog = stageLogs.get("Conferido");

  const CORES_ACAO: Record<string, string> = {
    created: "#3b82f6",
    rejected: "#dc2626",
    deleted: "#dc2626",
    approved: "#16a34a",
    delivered: "#10b981",
    produced: "#a855f7",
    production: "#eab308",
    restored: "#0ea5e9",
    complement_created: "#f97316",
    complement_canceled: "#f97316",
  };
  // Cinza para o que não tem família própria — `updated` é a maioria. #78716c e
  // não o #a8a29e de antes: o ponto é o único código de cor da linha, então vale
  // por ele o mínimo de 3:1 de elemento gráfico, e 2,52 não chegava lá.
  const corDaAcao = (a: string) => CORES_ACAO[a] ?? "#78716c";

  /** Fallback de texto: log antigo sem `details` ainda precisa dizer algo. */
  const textoDoLog = (l: any) =>
    String(l.details ?? "").trim() || getStatusLabel(String(l.action ?? "")) || String(l.action ?? "registro");

  const thumbUrl = item.approvalThumbUrl;

  const createdBy = createdLog?.userName ?? createdLog?.user_name ?? null;

  // ═══════════════════════════════════════════════════════════════════════════
  // O PERCURSO — uma lista só.
  //
  // A ficha trazia DUAS trilhas dos mesmos acontecimentos, lado a lado:
  // "Rastreabilidade Temporal" (tabela de etapas, vinda dos carimbos do item e
  // de etapas resolvidas contra os logs) e "Histórico" (a lista de logs). Quem
  // lia via cada evento duas vezes, em dois formatos, e tinha de descobrir
  // sozinho que eram a mesma coisa.
  //
  // A ESPINHA é a lista de logs: é o registro completo, tem o texto que uma
  // pessoa escreveu e tem autor. Dos carimbos do item entra apenas o que NÃO
  // tem log correspondente — uma peça migrada, por exemplo, tem `producedAt`
  // sem nenhum log de produção. Etapas que já vinham resolvidas CONTRA os logs
  // não entram nunca: seriam o mesmo registro, com outro rótulo.
  //
  // A janela de 90s existe porque as duas fontes são gravadas na mesma
  // transação, mas não no mesmo instante.
  // ═══════════════════════════════════════════════════════════════════════════
  const JANELA_MESMO_EVENTO_MS = 90_000;

  type EventoDoPercurso = { chave: string; ts: number; texto: string; autor: string | null; cor: string };

  const eventosDeLog: EventoDoPercurso[] = itemLogs.map((l: any, i: number) => ({
    chave: String(l.id ?? `${l.action}-${l.createdAt ?? l.created_at}-${i}`),
    ts: new Date(l.createdAt ?? l.created_at).getTime(),
    texto: textoDoLog(l),
    autor: l.userName ?? l.user_name ?? null,
    cor: corDaAcao(String(l.action ?? "")),
  })).filter((e: EventoDoPercurso) => Number.isFinite(e.ts));

  // Só carimbos do PRÓPRIO item: colunas de data que existem no registro.
  const carimbosDoItem = [
    { label: "Solicitada",                 valor: item.createdAt,            por: createdBy,             cor: "#3b82f6" },
    { label: "Aprovada pelo patrocinador", valor: item.sponsorApprovedAt,    por: item.sponsorApprovedBy, cor: "#16a34a" },
    { label: "Revisada pela Solicitação",  valor: item.creatorReviewedAt,    por: null,                  cor: "#d946ef" },
    { label: "Liberada para produção",     valor: item.approvedAt,           por: null,                  cor: "#f97316" },
    { label: "Produção iniciada",          valor: item.productionStartedAt,  por: null,                  cor: "#eab308" },
    { label: "Produzida",                  valor: item.producedAt,           por: null,                  cor: "#a855f7" },
    { label: "Conferida",                  valor: item.conferredAt,          por: logBy(conferLog),      cor: "#06b6d4" },
    { label: "Entregue",                   valor: item.deliveredAt,          por: item.receivedBy,       cor: "#10b981" },
  ].filter(c => !!c.valor);

  const eventosPercurso: EventoDoPercurso[] = [...eventosDeLog];
  for (const c of carimbosDoItem) {
    const ts = new Date(c.valor).getTime();
    if (!Number.isFinite(ts)) continue;
    const jaTemLog = eventosDeLog.some(e => Math.abs(e.ts - ts) < JANELA_MESMO_EVENTO_MS);
    if (jaTemLog) continue;
    eventosPercurso.push({ chave: `carimbo-${c.label}`, ts, texto: c.label, autor: c.por ?? null, cor: c.cor });
  }
  // Mais recente primeiro: a pergunta que traz alguém aqui é "o que aconteceu
  // por último", não "como tudo começou".
  eventosPercurso.sort((a, b) => b.ts - a.ts);

  const PERCURSO_VISIVEL = 4;
  const percursoVisivel = percursoAberto ? eventosPercurso : eventosPercurso.slice(0, PERCURSO_VISIVEL);
  const percursoEscondidos = eventosPercurso.length - percursoVisivel.length;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATROCINADORES, EM ORDEM DE URGÊNCIA.
  //
  // A ordem era a do banco. Numa peça com cinco marcas, a única que trava tudo
  // podia estar na quarta linha, abaixo de quatro aprovações que não pedem nada
  // de ninguém. Pendente primeiro, reprovado depois, aprovado por último: a
  // lista passa a ser lida de cima para baixo como fila de trabalho.
  // ═══════════════════════════════════════════════════════════════════════════
  const linhasPatrocinador = ((item.sponsors ?? []) as any[]).map((s: any) => {
    const approval = approvalsList.find((a: any) => a.sponsorId === s.id);
    // O chip tinha TRÊS ramos para os CINCO estados do vocabulário. Os dois que
    // sobravam — `awaiting_arte` e `new_version_pending` — caíam no "senão" e
    // apareciam como AGUARDANDO, que se lê "esperando o patrocinador". Nos dois
    // a bola está com a CASA: o patrocinador já respondeu.
    const meta = getApprovalMeta(
      approval?.status
        ?? (approval?.approved === true ? "approved"
          : approval?.approved === false ? "rejected" : "pending"),
    ) ?? getApprovalMeta("pending")!;
    return { sponsor: s, approval, meta };
  });

  const PESO_DO_TOM: Record<string, number> = { waiting: 0, rejected: 1, rework: 1, unknown: 2, approved: 3 };
  const patrocinadoresOrdenados = [...linhasPatrocinador]
    .sort((a, b) => (PESO_DO_TOM[a.meta.tone] ?? 2) - (PESO_DO_TOM[b.meta.tone] ?? 2));

  const pendentes  = linhasPatrocinador.filter(l => l.meta.tone === "waiting");
  const reprovados = linhasPatrocinador.filter(l => l.meta.isRejection);
  const aprovados  = linhasPatrocinador.filter(l => l.meta.tone === "approved");

  // ═══════════════════════════════════════════════════════════════════════════
  // A FAIXA DE RESOLUÇÃO.
  //
  // A pergunta que traz alguém a esta ficha é "onde está esta peça e o que
  // falta". A resposta não estava em lugar nenhum: era preciso ler a lista de
  // patrocinadores, cruzar com o histórico e calcular de cabeça há quanto tempo
  // aquilo não anda. Aqui ela vira uma frase, no alto, sem rolar.
  //
  // Tudo sai do que a ficha JÁ tem: status, aprovações com data e observação, e
  // a data do último registro. Nenhuma coluna nova no banco.
  // ═══════════════════════════════════════════════════════════════════════════
  const ultimoMovimentoMs = eventosPercurso.length
    ? eventosPercurso[0].ts
    : (item.updatedAt ? new Date(item.updatedAt).getTime() : NaN);
  const diasParado = Number.isFinite(ultimoMovimentoMs)
    ? Math.max(0, Math.floor((Date.now() - ultimoMovimentoMs) / DIA_MS))
    : null;
  const desdeQuando = diasParado === null ? "" : ` ${haQuantoTempo(diasParado)}`;

  const nomes = (lista: typeof linhasPatrocinador) => lista.map(l => l.sponsor?.name).filter(Boolean).join(", ");

  const bloqueio: { tom: NomeDoTom; frase: string; detalhe: string | null } = (() => {
    // 1. Alguém reprovou. É o estado mais grave e o único que traz texto escrito
    //    por uma pessoa — o pedido de ajuste é a informação mais útil da tela.
    if (reprovados.length > 0) {
      const primeiro = reprovados[0];
      const quando = primeiro.approval?.rejectedAt
        ? ` em ${format(new Date(primeiro.approval.rejectedAt), "dd/MM 'às' HH:mm", { locale: ptBR })}`
        : "";
      const motivo = primeiro.approval?.rejectionReason
        ? ` — "${String(primeiro.approval.rejectionReason).trim()}"`
        : "";
      return {
        tom: "reprovado",
        frase: reprovados.length === 1
          ? `Reprovada por ${primeiro.sponsor?.name ?? "um patrocinador"}${desdeQuando}`
          : `Reprovada por ${reprovados.length} patrocinadores${desdeQuando}`,
        detalhe: `${primeiro.sponsor?.name ?? "Patrocinador"} reprovou${quando}${motivo}`
          + (aprovados.length ? ` · ${aprovados.length} de ${linhasPatrocinador.length} já aprovaram` : ""),
      };
    }
    // 2. A bola está com o patrocinador.
    if (["awaiting_approval", "awaiting_sponsor_approval"].includes(rawStatus) || pendentes.length > 0) {
      return {
        tom: "espera",
        frase: pendentes.length === 1
          ? `Parada em aprovação${desdeQuando} — falta ${pendentes[0].sponsor?.name ?? "um patrocinador"}`
          : pendentes.length > 1
            ? `Parada em aprovação${desdeQuando} — faltam ${pendentes.length} patrocinadores`
            : `Parada em aprovação${desdeQuando}`,
        detalhe: aprovados.length
          ? `${aprovados.length} de ${linhasPatrocinador.length} já aprovaram: ${nomes(aprovados)}`
          : (pendentes.length > 1 ? `Aguardando: ${nomes(pendentes)}` : "Nenhum patrocinador respondeu até agora"),
      };
    }
    if (rawStatus === "awaiting_linking") {
      return { tom: "espera", frase: `Sem patrocinador vinculado${desdeQuando}`, detalhe: "A peça só entra em aprovação depois de vincular as marcas que aparecem nela." };
    }
    if (rawStatus === "awaiting_submission") {
      return { tom: "espera", frase: `Aguardando a Arte enviar para aprovação${desdeQuando}`, detalhe: "A arte precisa subir o layout para os patrocinadores decidirem." };
    }
    if (["awaiting_finalization", "sponsor_approved", "awaiting_creator_review"].includes(rawStatus)) {
      return {
        tom: "ok",
        frase: linhasPatrocinador.length
          ? `Aprovada por todos os ${linhasPatrocinador.length} patrocinadores — falta finalizar a arte`
          : "Aprovada — falta finalizar a arte",
        detalhe: `A Arte precisa subir o arquivo final${desdeQuando ? ` · sem movimento${desdeQuando}` : ""}`,
      };
    }
    if (["awaiting_final_review", "awaiting_review"].includes(rawStatus)) {
      return { tom: "espera", frase: `Aguardando a revisão final${desdeQuando}`, detalhe: "O arquivo final está pronto e espera a conferência da Solicitação antes de ir para a gráfica." };
    }
    if (["ready_for_production", "pronto_para_producao", "approved", "liberado"].includes(rawStatus)) {
      return { tom: "ok", frase: "Liberada para produção", detalhe: `A gráfica pode imprimir${desdeQuando ? ` · liberada${desdeQuando}` : ""}` };
    }
    if (["inproduction", "inProduction", "em_producao"].includes(rawStatus)) {
      return { tom: "espera", frase: `Em produção na gráfica${desdeQuando}`, detalhe: null };
    }
    if (["produced", "produzido"].includes(rawStatus)) {
      return { tom: "espera", frase: `Produzida — falta conferir${desdeQuando}`, detalhe: item.conferredQty > 0 ? `${item.conferredQty} de ${item.quantity} já conferidas` : null };
    }
    if (["conferred", "conferido"].includes(rawStatus)) {
      return { tom: "espera", frase: `Conferida — falta entregar${desdeQuando}`, detalhe: item.deliveredQty > 0 ? `${item.deliveredQty} de ${item.quantity} já entregues` : null };
    }
    if (["delivered", "entregue"].includes(rawStatus)) {
      return { tom: "ok", frase: "Entregue — nada pendente", detalhe: item.receivedBy ? `Recebida por ${item.receivedBy}` : null };
    }
    // Estado fora do fluxo (rascunho, cancelada, ou um status que esta versão
    // não conhece): dizer o rótulo do status é mais honesto que inventar uma
    // frase de bloqueio.
    return { tom: "neutro", frase: getStatusLabel(rawStatus) || "Sem etapa definida", detalhe: diasParado === null ? null : `Sem movimento ${haQuantoTempo(diasParado)}` };
  })();

  const tom = TOM[bloqueio.tom];
  const IconeDoBloqueio = bloqueio.tom === "ok" ? CheckCircle2 : bloqueio.tom === "reprovado" ? AlertTriangle : Clock;

  // ── ESTA FICHA NÃO AGE, SÓ CONTA ──────────────────────────────────────────
  //
  // Decisão do dono (20/08): nada de atalhos aqui — só os dados. A ficha abre
  // em cinco telas, cada uma com o seu próprio conjunto de permissões e de
  // ações; um botão que resolve na Arte é um botão que dá 403 na Gráfica. A
  // faixa de resolução continua dizendo O QUE falta e QUEM precisa agir, que é
  // dado, não ação — quem age vai à tela onde a ação vive.
  //
  // O que sobrou de clicável é leitura ou correção do próprio dado: abrir um
  // arquivo, ampliar uma foto, editar a especificação e reverter uma aprovação
  // lançada por engano (admin).
  // ── Prazo ─────────────────────────────────────────────────────────────────
  const saida = item.event?.truckDepartureDate ? toUTCDisplayDate(item.event.truckDepartureDate) : null;
  const diasAteSaida = saida ? Math.ceil((saida.getTime() - todayBusinessMs()) / DIA_MS) : null;
  const prazoApertado = diasAteSaida !== null && diasAteSaida <= 7;
  const textoDoPrazo = diasAteSaida === null ? null
    : diasAteSaida < 0 ? `${haQuantoTempo(-diasAteSaida)}`
    : diasAteSaida === 0 ? "é hoje"
    : diasAteSaida === 1 ? "falta 1 dia"
    : `faltam ${diasAteSaida} dias`;

  // ── Especificações: a grade sem linha dupla ───────────────────────────────
  //
  // A grade é feita com `gap: 1px` sobre um fundo — as bordas são as FRESTAS
  // entre as células, então não existe borda dupla por construção (era o risco
  // do desenho com borderRight/borderBottom em cada célula). O que sobra é a
  // última linha incompleta: com 5 dados em 3 colunas, a sexta vaga mostraria a
  // cor do fundo como um retângulo tingido. Células vazias brancas fecham a
  // grade.
  const colunasEspec = isMobile ? 2 : 3;
  const dadosEspec = [
    { label: "Tipo",       value: item.type },
    { label: "Material",   value: item.material },
    { label: "Acabamento", value: item.finish },
    { label: "Quantidade", value: item.quantity ? `${item.quantity} un.` : null },
    { label: "M²",         value: item.calculatedM2 ? `${item.calculatedM2} m²` : null },
    // "Medida" (o texto) saiu da ficha: desde que o servidor a deriva das
    // dimensões de arquivo, ela era a MESMA linha que "Arquivo" com outro
    // nome — e quando divergia (peça #2472), era a linha errada. Três nomes
    // para dois pares é exatamente a confusão que esta ficha não deve criar.
    { label: "Arquivo (ARQ.)", value: item.fileWidth && item.fileHeight ? `${item.fileWidth} × ${item.fileHeight}` : (item.measurement || null) },
    { label: "Visual (VIS.)",  value: item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : null },
  ].filter(x => x.value);
  const vagasVazias = (colunasEspec - (dadosEspec.length % colunasEspec)) % colunasEspec;

  // ── Andamento na gráfica ──────────────────────────────────────────────────
  const andamentoGrafica = ([
    ["Reaproveitado", item.reuseQty,        "#047857"],
    ["Produzido",     item.quantityProduced,"#7e22ce"],
    ["Conferido",     item.conferredQty,    "#0e7490"],
    ["Entregue",      item.deliveredQty,    "#047857"],
  ] as const).filter(([, v]) => v > 0);

  const isDeliveredItem  = ["delivered", "entregue"].includes(rawStatus);
  const missingDeliveryProof = isDeliveredItem && deliveryPhotos.length === 0;
  const temRegistrosGrafica = conferencePhotos.length > 0 || deliveryPhotos.length > 0
    || !!item.conferenceNotes || !!item.deliveryNotes
    || missingDeliveryProof || andamentoGrafica.length > 0 || !!item.receivedBy;

  const PAD = isMobile ? "16px" : "32px";
  const ALVO = isMobile ? 44 : 36;   // alvo de toque / de ponteiro

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`max-w-6xl p-0 gap-0 ${HIDE_NATIVE_CLOSE}`}
        /* O TETO E O SCROLL.
           Antes o DialogContent inteiro era o scroller (`max-h-[90vh]
           overflow-y-auto`): rolar a ficha levava embora o cabeçalho, o status
           e o prazo — exatamente o que se quer manter à vista enquanto se lê o
           resto. Agora ele é coluna flex e SÓ o miolo rola; cabeçalho, faixa e
           rodapé são `flexShrink: 0`.
           `dvh` no mobile: `vh` conta a barra do navegador que se esconde, e o
           rodapé ficava embaixo dela. */
        style={{
          backgroundColor: "#f9f9f8", borderRadius: 16,
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.3)",
          maxHeight: isMobile ? "calc(100dvh - 24px)" : "calc(100vh - 48px)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        {/* Sem DialogTitle o Radix anuncia um diálogo sem nome (e reclama no
            console). O cabeçalho visual já mostra a peça, então o título fica
            só para leitor de tela — e é ele que o Radix aponta em
            aria-labelledby. Este componente abre em cinco telas, então a falta
            valia por cinco. */}
        <DialogTitle className="sr-only">
          {item?.displayId ? `Peça ${item.displayId} — ${item.description || item.type || ""}` : "Detalhes da peça"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {bloqueio.frase}
        </DialogDescription>

        {/* ══════════════════════════════════════════════════════════════════
            CABEÇALHO
        ══════════════════════════════════════════════════════════════════ */}
        <header
          style={{
            flexShrink: 0,
            background: "linear-gradient(135deg, #1c1917 0%, #2d2926 100%)",
            color: "#ffffff",
            padding: isMobile ? "16px 16px 0" : "22px 32px 0",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              {/* Linha de identificação */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>
                  {item.displayId}
                </span>
                <span aria-hidden="true" style={{ width: 1, height: 12, backgroundColor: "rgba(255,255,255,0.18)" }} />
                {/* O EVENTO DESCE DE TÍTULO PARA LINHA DE CONTEXTO. Ele nomeia
                    dezenas de peças ao mesmo tempo; quem abre a ficha já sabe em
                    que evento está e precisa saber QUAL peça é esta. */}
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320 }}>
                  {item.event?.name || "Sem evento"}
                </span>
                {(item.isReuse || item.reuseQty > 0) && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 999, backgroundColor: "rgba(22,101,52,0.28)", color: "#4ade80", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                    <Recycle aria-hidden="true" style={{ width: 11, height: 11 }} />
                    {item.isReuse ? "Reaproveitamento" : `${item.reuseQty}ª de ${item.quantity} usos`}
                  </span>
                )}
              </div>

              {/* O TÍTULO É A DESCRIÇÃO DA PEÇA. */}
              <h1 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: isMobile ? 22 : 30, fontWeight: 800,
                letterSpacing: "-0.03em", color: "#ffffff", margin: 0, lineHeight: 1.12,
              }}>
                {item.description || item.type || item.displayId}
              </h1>
              {item.description && item.type && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: "6px 0 0", maxWidth: 620, lineHeight: 1.5 }}>
                  {item.type}{item.material ? ` · ${item.material}` : ""}{item.measurement ? ` · ${item.measurement}` : ""}
                </p>
              )}
            </div>

            {/* Prazo + fechar */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexShrink: 0 }}>
              {saida && !isMobile && (
                <div style={{ textAlign: "right" }}>
                  <p style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)", margin: "0 0 3px" }}>
                    <Truck aria-hidden="true" style={{ width: 11, height: 11 }} />
                    Saída do caminhão
                  </p>
                  <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 17, fontWeight: 700, color: "#fdba74", margin: 0, whiteSpace: "nowrap" }}>
                    {format(saida, "dd/MM 'às' HH:mm", { locale: ptBR })}
                  </p>
                  {textoDoPrazo && (
                    <p style={{ fontSize: 11, fontWeight: 600, color: prazoApertado ? "#fca5a5" : "rgba(255,255,255,0.6)", margin: "2px 0 0", whiteSpace: "nowrap" }}>
                      {textoDoPrazo}
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={() => onOpenChange(false)}
                aria-label="Fechar"
                data-testid="button-fechar-ficha"
                style={{
                  width: 36, height: 36, borderRadius: 999, flexShrink: 0,
                  backgroundColor: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer",
                  color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.18)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
          </div>

          {/* Prazo no mobile: sob o título, onde há largura para ele. */}
          {saida && isMobile && (
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.5)" }}>Saída</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: "#fdba74" }}>
                {format(saida, "dd/MM 'às' HH:mm", { locale: ptBR })}
              </span>
              {textoDoPrazo && (
                <span style={{ fontSize: 11, fontWeight: 600, color: prazoApertado ? "#fca5a5" : "rgba(255,255,255,0.6)" }}>{textoDoPrazo}</span>
              )}
            </div>
          )}

          {/* ── TRILHA DE ETAPAS ──
              Decorativa: o estado que importa está escrito na faixa logo
              abaixo, em texto. Anunciar seis etapas com "concluída/atual/
              futura" antes da frase que resolve seria ler o índice antes do
              capítulo.

              Círculos ligados por linha viraram COLUNAS com barra: a linha de
              1px entre bolinhas dava um fio que sumia no gradiente, e os
              rótulos de 10px em coluna forçavam rolagem horizontal. Agora cada
              etapa ocupa a mesma fração da largura e a barra de 3px abaixo dela
              é o que se lê de longe. */}
          <div aria-hidden="true" style={{ display: "flex", gap: 6, margin: isMobile ? "16px 0 0" : "20px 0 0" }}>
            {TIMELINE_STEPS.map(s => {
              const done    = s.idx < step;
              const current = s.idx === step;
              return (
                <div key={s.idx} style={{ flex: "1 1 0", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7, minWidth: 0 }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: (done || current) ? "#c2410c" : "rgba(255,255,255,0.09)",
                      boxShadow: current ? "0 0 0 3px rgba(251,146,60,0.25)" : "none",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: (done || current) ? "#ffffff" : "rgba(255,255,255,0.55)",
                      fontSize: 9, fontWeight: 800,
                    }}>
                      {done ? <Check style={{ width: 10, height: 10, strokeWidth: 3 }} /> : s.idx + 1}
                    </span>
                    {/* Nenhum alfa abaixo de 0.55 sobre este gradiente: 0.35 dá
                        3,11 e reprova em texto pequeno. */}
                    <span style={{
                      fontSize: 11, fontWeight: current ? 700 : 500,
                      color: current ? "#ffffff" : "rgba(255,255,255,0.55)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                    }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ height: 3, borderRadius: 999, backgroundColor: (done || current) ? "#c2410c" : "rgba(255,255,255,0.09)" }} />
                </div>
              );
            })}
          </div>
          <div style={{ height: isMobile ? 16 : 20 }} />
        </header>

        {/* ══════════════════════════════════════════════════════════════════
            FAIXA DE RESOLUÇÃO — o que trava, desde quando, e quem precisa agir.
        ══════════════════════════════════════════════════════════════════ */}
        <div
          data-testid="banner-blocker"
          style={{
            flexShrink: 0, padding: isMobile ? "12px 16px" : "14px 32px",
            backgroundColor: tom.bg, borderBottom: `1px solid ${tom.borda}`,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}
        >
          <span aria-hidden="true" style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            backgroundColor: tom.ladrilho, color: tom.detalhe,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <IconeDoBloqueio style={{ width: 17, height: 17 }} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: tom.frase, margin: 0, lineHeight: 1.35 }}>
              {bloqueio.frase}
            </p>
            {bloqueio.detalhe && (
              <p style={{ fontSize: 12, color: tom.detalhe, margin: "3px 0 0", lineHeight: 1.45 }}>
                {bloqueio.detalhe}
              </p>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            MIOLO — a única parte que rola.
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", backgroundColor: "#f9f9f8" }}>

          {/* O bloco de trabalho que a tela hospedeira mandou (a finalização de
              layout, na Arte) abre o miolo: é a tarefa por que a ficha foi
              aberta, e ficava depois de tudo. */}
          {topActions && (
            <div style={{ padding: isMobile ? "16px 16px 0" : "20px 32px 0" }}>{topActions}</div>
          )}

          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "6fr 4fr",
            gap: isMobile ? 20 : 24,
            padding: isMobile ? "16px" : "20px 32px",
            alignItems: "start",
          }}>

            {/* ═══ COLUNA ESQUERDA ═══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>

              {/* ── Especificação ── */}
              <section>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <h3 style={TITULO_SECAO}>Especificação</h3>
                  {!editMode && onEditSave && (
                    <button
                      onClick={() => { setEditedItem(item); setEditMode(true); }}
                      data-testid="button-editar-especificacao"
                      style={{
                        background: "none", border: "none", cursor: "pointer", padding: 0,
                        display: "flex", alignItems: "center", gap: 5,
                        font: "inherit", fontSize: 11, fontWeight: 700, color: "#c2410c",
                        textTransform: "uppercase", letterSpacing: "0.06em",
                      }}
                    >
                      <Edit aria-hidden="true" style={{ width: 11, height: 11 }} /> Editar
                    </button>
                  )}
                </div>

                <div style={{ ...CARTAO, overflow: "hidden" }}>
                  {editMode ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 16 }}>
                      {[
                        { label: "Tipo",       field: "type" },
                        { label: "Material",   field: "material" },
                        { label: "Acabamento", field: "finish" },
                      ].map(({ label, field }) => (
                        <div key={field}>
                          <label htmlFor={`detail-edit-${field}`} style={{ fontSize: 11, color: "#57534e", display: "block", marginBottom: 4 }}>{label}</label>
                          <Input id={`detail-edit-${field}`} value={editedItem?.[field] || ""} onChange={(e) => handleEditChange(field, e.target.value)} className="h-9 text-sm" />
                        </div>
                      ))}
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                        <Button size="sm" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Salvar</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Grade por FRESTA (gap 1px sobre o fundo): não existe
                          borda dupla nas beiradas porque não existe borda nas
                          células. As vagas vazias fecham a última linha. */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: `repeat(${colunasEspec}, minmax(0,1fr))`,
                        gap: 1, backgroundColor: "#ebe8e4",
                      }}>
                        {dadosEspec.map(({ label, value }) => (
                          <div key={label} style={{ backgroundColor: "#ffffff", padding: "11px 14px", minWidth: 0 }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#7a6154", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 3px" }}>{label}</p>
                            <p title={String(value)} style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: "#1c1917", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>
                          </div>
                        ))}
                        {Array.from({ length: vagasVazias }).map((_, i) => (
                          <div key={`vaga-${i}`} aria-hidden="true" style={{ backgroundColor: "#ffffff" }} />
                        ))}
                      </div>
                      {/* A data que importa — a saída do caminhão — já está no
                          cabeçalho. Aqui fica o contexto, numa linha só, onde
                          antes havia dois blocos de 32px de respiro. */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", padding: "10px 14px", borderTop: "1px solid #ebe8e4", fontSize: 12, color: "#57534e" }}>
                        <span>
                          Evento em{" "}
                          <strong style={{ color: "#1c1917", fontWeight: 700 }}>
                            {item.event?.startDate ? format(parseDateLocal(item.event.startDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                          </strong>
                        </span>
                        {item.printShop && <span>Gráfica: <strong style={{ color: "#1c1917", fontWeight: 700 }}>{item.printShop}</strong></span>}
                        {createdBy && <span>Solicitada por <strong style={{ color: "#1c1917", fontWeight: 700 }}>{createdBy}</strong></span>}
                      </div>
                    </>
                  )}
                </div>

                {item.observations && (
                  <div style={{ ...CARTAO, marginTop: 10, padding: "12px 14px" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "#7a6154", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Observações</p>
                    <p style={{ fontSize: 13, color: "#57534e", fontStyle: "italic", lineHeight: 1.55, margin: 0 }}>"{item.observations}"</p>
                  </div>
                )}
              </section>

              {/* ── Patrocinadores ── */}
              {linhasPatrocinador.length > 0 && (
                <section data-testid="section-patrocinadores">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                    <h3 style={TITULO_SECAO}>Patrocinadores</h3>
                    <span style={{ fontSize: 12, fontWeight: 700, color: aprovados.length === linhasPatrocinador.length ? "#15803d" : "#c2410c" }}>
                      {aprovados.length} de {linhasPatrocinador.length} aprovaram
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {patrocinadoresOrdenados.map(({ sponsor: s, approval, meta }) => {
                      const pendente = meta.tone === "waiting";
                      // O detalhe em 12px #57534e (7,63 sobre branco), e não no
                      // monospace de 10px de antes: é frase, não carimbo — e a
                      // observação da reprovação, que é a informação mais útil
                      // da tela, era a menos legível dela.
                      const detalhe = approval?.approvedAt
                        ? `Aprovou em ${format(new Date(approval.approvedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}${approval.approvedBy ? ` · ${approval.approvedBy}` : ""}`
                        : approval?.rejectedAt
                          ? `Reprovou em ${format(new Date(approval.rejectedAt), "dd/MM/yy 'às' HH:mm", { locale: ptBR })}${approval.rejectedBy ? ` · ${approval.rejectedBy}` : ""}`
                          : null;
                      return (
                        <div
                          key={s.id}
                          data-testid={`linha-patrocinador-${s.id}`}
                          style={{
                            ...CARTAO,
                            border: `1px solid ${pendente || meta.isRejection ? meta.border : "#ebe8e4"}`,
                            padding: 12,
                            display: "flex", alignItems: "flex-start", gap: 12,
                          }}
                        >
                          <span aria-hidden="true" style={{
                            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                            backgroundColor: "#f5f4f1",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 15, fontWeight: 700, color: s.color || "#1c1917",
                          }}>
                            {(s.name || "?")[0].toUpperCase()}
                          </span>

                          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 700, fontSize: 15, color: "#1c1917" }}>{s.name}</span>
                              <span
                                title={meta.hint}
                                data-testid={`chip-aprovacao-${s.id}`}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  padding: "3px 10px", borderRadius: 999,
                                  backgroundColor: meta.bg, color: meta.text,
                                  border: `1px solid ${meta.border}`,
                                  fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                                }}
                              >
                                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: meta.dot, flexShrink: 0 }} />
                                {meta.short}
                              </span>
                            </div>
                            {detalhe && (
                              <p style={{ fontSize: 12, color: "#57534e", margin: "4px 0 0", lineHeight: 1.45 }}>{detalhe}</p>
                            )}
                            {/* O pedido de ajuste, entre aspas e por extenso. */}
                            {approval?.rejectionReason && (
                              <p style={{ fontSize: 12, color: "#991b1b", margin: "4px 0 0", lineHeight: 1.5, fontStyle: "italic" }}>
                                "{String(approval.rejectionReason).trim()}"
                              </p>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                            {/* Revogar a aprovação / reverter a reprovação. Admin
                                sempre; Atendimento enquanto a peça está em aprovação
                                ou na finalização da Arte (pedido do dono, 21/08).

                                LINHA PENDENTE também mostra o botão quando a peça
                                JÁ AVANÇOU (caso #4176, 24/08): é o estado incoerente
                                herdado do atalho antigo — "Aguardando" com a peça em
                                Finalização — e o servidor sabe REABRIR a partir dele.
                                Sem o botão aqui, o conserto existia e não havia onde
                                clicar: a peça seguia presa fora da fila do
                                Atendimento. Pendente com a peça ainda em aprovação
                                continua sem botão — aí não há mesmo o que fazer. */}
                            {(() => {
                              const pecaAvancada = ["sponsor_approved", "awaiting_finalization", "awaiting_final_review", "awaiting_review", "in_review"].includes(rawStatus);
                              const reabrirIncoerente = approval?.status === "pending" && pecaAvancada;
                              const podeAgir = user?.role === "admin" || (user?.role === "atendimento" && (rawStatus === "awaiting_sponsor_approval" || rawStatus === "sponsor_approved"));
                              return podeAgir && approval && (approval.status !== "pending" || reabrirIncoerente);
                            })() && (
                              <button
                                type="button"
                                onClick={() => handleRevertApproval(s.id, s.name)}
                                disabled={revertingSponsorId === s.id}
                                title={approval.status === "pending"
                                  ? "Reabrir a aprovação — a peça avançou com este patrocinador ainda aguardando; ela volta pendente na fila do Atendimento"
                                  : `${approval.status === "approved" ? "Revogar a aprovação" : "Reverter a decisão"} — volta a aguardar (estava ${meta.label.toLowerCase()})`}
                                aria-label={`Reverter a decisão de ${s.name}`}
                                data-testid={`button-revert-approval-${s.id}`}
                                style={{
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  width: ALVO, height: ALVO, borderRadius: 8, border: "1px solid #e7e5e4",
                                  backgroundColor: "#ffffff", color: "#57534e",
                                  cursor: revertingSponsorId === s.id ? "default" : "pointer",
                                  opacity: revertingSponsorId === s.id ? 0.5 : 1, flexShrink: 0,
                                }}
                              >
                                <Undo2 style={{ width: 14, height: 14 }} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Percurso ── */}
              <section data-testid="section-percurso">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <h3 style={TITULO_SECAO}>Percurso</h3>
                  <span style={{ fontSize: 12, color: "#57534e" }}>{eventosPercurso.length} registro{eventosPercurso.length === 1 ? "" : "s"}</span>
                </div>

                <div style={{ ...CARTAO, padding: "4px 14px" }}>
                  {marcoEvento && (
                    <div title={marcoEvento.hint} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: eventosPercurso.length ? "1px solid #f5f4f1" : "none" }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: marcoEvento.dot, marginTop: 6, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: marcoEvento.text, margin: 0, lineHeight: 1.4 }}>{marcoEvento.label}</p>
                        <p style={{ fontSize: 11, color: "#78716c", margin: "2px 0 0" }}>
                          {marcoEvento.dataEventoISO
                            ? format(parseDateLocal(marcoEvento.dataEventoISO), "dd/MM/yy", { locale: ptBR })
                            : "Data e autor no Histórico geral"}
                        </p>
                      </div>
                    </div>
                  )}

                  {eventosPercurso.length === 0 && !marcoEvento && (
                    <p style={{ fontSize: 13, color: "#57534e", margin: 0, padding: "12px 0" }}>Sem registros para esta peça.</p>
                  )}

                  {percursoVisivel.map((e, i) => (
                    <div key={e.chave} style={{
                      display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0",
                      borderBottom: i < percursoVisivel.length - 1 ? "1px solid #f5f4f1" : "none",
                    }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: e.cor, marginTop: 6, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                        <p style={{ fontSize: 13, fontWeight: 600, color: "#1c1917", margin: 0, lineHeight: 1.45 }}>{e.texto}</p>
                        {e.autor && <p style={{ fontSize: 11, color: "#78716c", margin: "2px 0 0" }}>{e.autor}</p>}
                      </div>
                      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#78716c", flexShrink: 0, marginTop: 2 }}>
                        {fmtShort(new Date(e.ts).toISOString())}
                      </span>
                    </div>
                  ))}

                  {(percursoEscondidos > 0 || percursoAberto) && (
                    <button
                      type="button"
                      onClick={() => setPercursoAberto(v => !v)}
                      data-testid="button-percurso-expand"
                      style={{
                        width: "100%", height: ALVO, marginBottom: 4,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        border: "none", borderTop: "1px solid #f5f4f1", background: "none",
                        cursor: "pointer", font: "inherit", fontSize: 12, fontWeight: 700, color: "#c2410c",
                      }}
                    >
                      <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, transform: percursoAberto ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                      {percursoAberto ? "Ver menos" : `Ver os ${percursoEscondidos} registros anteriores`}
                    </button>
                  )}
                </div>
              </section>
            </div>

            {/* ═══ COLUNA DIREITA ═══ */}
            <div style={{ display: "flex", flexDirection: "column", gap: 22, minWidth: 0 }}>

              {/* ── Arte: referência e arte enviada, lado a lado ── */}
              <section>
                <h3 style={{ ...TITULO_SECAO, marginBottom: 10 }}>Arte</h3>
                {/* A COMPARAÇÃO É O QUE SE QUER FAZER AQUI. A referência do
                    solicitante vinha num banner de largura inteira no topo da
                    ficha e a arte enviada num card no fim da coluna direita —
                    uma tela de rolagem entre as duas imagens que existem para
                    ser comparadas. */}
                {/* ── A COMPARAÇÃO, com quantos panes houver ──

                    Antes esta faixa mostrava ARTE APROVADA × FOTO DA
                    CONFERÊNCIA — "o que o patrocinador aprovou" contra "o que
                    saiu da impressora". A revisão trocou por REFERÊNCIA ×
                    ARTE, que responde outra pergunta igualmente válida ("a
                    Arte fez o que foi pedido?"), e ao trocar levou a primeira
                    junto — sem que ninguém decidisse abrir mão dela.

                    As duas cabem: são três momentos da mesma peça, na ordem em
                    que acontecem. O terceiro pane só existe quando há foto de
                    conferência, então na maior parte do fluxo a faixa continua
                    com dois. */}
                {(() => {
                  const panes = [!!item.referenceUrl, !!thumbUrl, conferencePhotos.length > 0].filter(Boolean).length;
                  return (
                <div style={{ display: "grid", gridTemplateColumns: panes >= 3 ? "1fr 1fr 1fr" : panes === 2 ? "1fr 1fr" : "1fr", gap: 10 }}>
                  {item.referenceUrl && (
                    <div>
                      <a
                        href={item.referenceUrl} target="_blank" rel="noopener noreferrer"
                        title="Abrir a referência do solicitante"
                        data-testid="link-referencia"
                        style={{ display: "block", position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "2px solid #fed7aa", backgroundColor: "#fff7ed" }}
                      >
                        <img
                          src={item.referenceUrl} alt="Referência do solicitante"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                      </a>
                      <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#9a3412", margin: "6px 0 0" }}>
                        <Paperclip aria-hidden="true" style={{ width: 11, height: 11 }} />
                        Referência do solicitante
                      </p>
                    </div>
                  )}

                  {thumbUrl ? (
                    <div>
                      <div style={{ position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid #ebe8e4", backgroundColor: "#f5f4f1" }}>
                        <FilePreview url={thumbUrl} linkUrl={thumbUrl} objectFit="cover" />
                      </div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: "#57534e", margin: "6px 0 0" }}>
                        Arte enviada{item.approvalThumbUpdatedAt ? ` · ${fmtShort(item.approvalThumbUpdatedAt)}` : ""}
                      </p>
                    </div>
                  ) : (
                    <div style={{ aspectRatio: "16/9", borderRadius: 10, border: "1px dashed #d6d3d1", backgroundColor: "#ffffff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <FileImage aria-hidden="true" style={{ width: 24, height: 24, color: "#a8a29e" }} />
                      <p style={{ fontSize: 12, color: "#57534e", margin: 0 }}>A Arte ainda não enviou</p>
                    </div>
                  )}

                  {/* O QUE SAIU DA IMPRESSORA. Comparar isto com a arte
                      aprovada ao lado é a conferência inteira — e era o que
                      esta faixa fazia antes da revisão. */}
                  {conferencePhotos.length > 0 && (
                    <div>
                      <a
                        href={conferencePhotos[0]} target="_blank" rel="noopener noreferrer"
                        title="Abrir a foto da conferência"
                        data-testid="link-conferencia"
                        style={{ display: "block", position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid #a5f3fc", backgroundColor: "#ecfeff" }}
                      >
                        <img
                          src={conferencePhotos[0]} alt="Foto da conferência da gráfica"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                        />
                        {conferencePhotos.length > 1 && (
                          <span style={{ position: "absolute", bottom: 6, right: 6, backgroundColor: "rgba(14,116,144,0.92)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 999 }}>
                            +{conferencePhotos.length - 1}
                          </span>
                        )}
                      </a>
                      <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#0e7490", margin: "6px 0 0" }}>
                        <Camera aria-hidden="true" style={{ width: 11, height: 11 }} />
                        Conferido pela gráfica
                      </p>
                    </div>
                  )}
                </div>
                  );
                })()}

                {thumbUrl && (
                  <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                    <a href={thumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "#c2410c" }}>
                      <ExternalLink style={{ width: 11, height: 11 }} /> {friendlyFileName(thumbUrl)}
                    </a>
                    {item.previousApprovalThumbUrl && (
                      <a href={item.previousApprovalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "#57534e" }}>
                        <ExternalLink style={{ width: 11, height: 11 }} /> Versão anterior
                      </a>
                    )}
                  </div>
                )}
              </section>

              {/* ── Arquivos ── */}
              <section>
                <h3 style={{ ...TITULO_SECAO, marginBottom: 10 }}>Arquivos</h3>
                <div style={{ ...CARTAO, overflow: "hidden" }}>
                  {/* Arquivo final. A AUSÊNCIA É UM ESTADO NORMAL do fluxo, não
                      um card vazio de 100px: até a arte ser aprovada não existe
                      arquivo final, e a ficha dizia isso com uma caixa
                      tracejada do tamanho de um erro. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, borderBottom: "1px solid #f5f4f1" }}>
                    <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, backgroundColor: item.finalFileUrl ? "#ecfeff" : "#f5f4f1", color: item.finalFileUrl ? "#0e7490" : "#78716c", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FolderOpen style={{ width: 15, height: 15 }} />
                    </span>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      {/* O caminho completo no title: a linha corta em elipse,
                          e \\10.100.1.7\TTKGrafica\PROVAS 2026\… é longo por
                          natureza. */}
                      <p title={item.finalFileUrl || undefined} style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.finalFileUrl ? (item.finalFileName || item.finalFileUrl) : "Arquivo final"}
                      </p>
                      <p style={{ fontSize: 12, color: "#57534e", margin: "2px 0 0" }}>
                        {item.finalFileUrl
                          ? `Pronto para impressão${item.finalFileUpdatedAt ? ` · ${fmtShort(item.finalFileUpdatedAt)}` : ""}`
                          : "Fica pronto quando a Arte finalizar o layout aprovado"}
                      </p>
                    </div>
                    {item.finalFileUrl ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        {/* COPIAR é o gesto que faltava. O arquivo da gráfica
                            é um caminho de rede (\\10.100.1.7\…): o navegador
                            não abre, e a linha cortada em elipse não deixava
                            nem selecionar o texto. Sem este botão, o caminho
                            estava na tela e fora do alcance. */}
                        <button
                          type="button"
                          data-testid="button-copiar-caminho-final"
                          title={`Copiar caminho: ${item.finalFileUrl}`}
                          aria-label="Copiar caminho do arquivo final"
                          onClick={() => {
                            navigator.clipboard.writeText(item.finalFileUrl!)
                              .then(() => toast({ title: "Caminho copiado", description: isWebUrl(item.finalFileUrl!) ? "Cole no navegador para abrir." : "Cole no Explorer para abrir o arquivo." }))
                              .catch(() => toast({ title: "Não foi possível copiar", description: "Selecione o caminho e copie manualmente.", variant: "destructive" }));
                          }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 6, height: ALVO, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#ffffff", color: "#1c1917", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        >
                          <Copy aria-hidden="true" style={{ width: 13, height: 13 }} />
                          Copiar
                        </button>
                        {/* "Abrir" só quando o navegador consegue abrir. */}
                        {isWebUrl(item.finalFileUrl) && (
                          <a
                            href={item.finalFileUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", height: ALVO, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#ffffff", color: "#1c1917", fontSize: 12, fontWeight: 700, textDecoration: "none" }}
                          >
                            Abrir
                          </a>
                        )}
                      </div>
                    ) : (
                      <span style={{ padding: "4px 10px", borderRadius: 999, backgroundColor: "#f5f4f1", border: "1px solid #e7e5e4", color: "#44403c", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        Pendente
                      </span>
                    )}
                  </div>

                  {/* Book do evento */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12 }}>
                    <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, backgroundColor: item.bookUrl ? "#faf5ff" : "#f5f4f1", color: item.bookUrl ? "#7e22ce" : "#78716c", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FileImage style={{ width: 15, height: 15 }} />
                    </span>
                    <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", margin: 0 }}>Book de aprovação</p>
                      <p style={{ fontSize: 12, color: "#57534e", margin: "2px 0 0" }}>
                        {item.bookUrl
                          ? (item.bookPage ? `Esta peça está na página ${item.bookPage}` : "Cobre esta peça")
                          : "A peça não entrou em nenhum book"}
                      </p>
                    </div>
                    {item.bookUrl && (
                      <a
                        href={item.bookUrl} target="_blank" rel="noopener noreferrer"
                        style={{ display: "inline-flex", alignItems: "center", height: ALVO, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#ffffff", color: "#1c1917", fontSize: 12, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}
                      >
                        Abrir
                      </a>
                    )}
                  </div>

                  {item.previousFinalFileUrl && (
                    <div style={{ padding: "10px 12px", borderTop: "1px solid #f5f4f1", backgroundColor: "#fffbeb" }}>
                      <p style={{ fontSize: 12, color: "#92400e", margin: 0, lineHeight: 1.45 }}>
                        Substituiu <strong>{item.previousFinalFileName || "a versão anterior"}</strong> —{" "}
                        <a href={item.previousFinalFileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#92400e", fontWeight: 700 }}>ver anterior</a>
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* ── Registros da gráfica ── */}
              {temRegistrosGrafica && (
                <section data-testid="section-registros-grafica">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                    <h3 style={TITULO_SECAO}>Registros da gráfica</h3>
                    {item.deliveredQty > 0 && item.quantity > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: item.deliveredQty < item.quantity ? "#c2410c" : "#15803d" }}>
                        {item.deliveredQty} de {item.quantity} entregues
                      </span>
                    )}
                  </div>

                  <div style={{ ...CARTAO, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
                    {andamentoGrafica.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 22px" }}>
                        {andamentoGrafica.map(([label, valor, cor]) => (
                          <div key={label}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#7a6154", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>{label}</p>
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 15, fontWeight: 700, color: cor, margin: "2px 0 0" }}>
                              {valor}<span style={{ color: "#78716c", fontWeight: 400 }}>/{item.quantity}</span>
                            </p>
                          </div>
                        ))}
                        {item.receivedBy && (
                          <div>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "#7a6154", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>Recebido por</p>
                            <p style={{ fontSize: 15, fontWeight: 700, color: "#1c1917", margin: "2px 0 0" }}>{item.receivedBy}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* A FOTO DA CONFERÊNCIA MORA AO LADO DA ARTE — e só lá.
                        Ela já aparece na faixa de comparação (é a conferência
                        inteira: o que saiu da impressora contra o que foi
                        aprovado), e aparecia DE NOVO aqui embaixo, a mesma
                        imagem duas vezes na mesma ficha. Aqui ficam só o
                        que NÃO está lá em cima: as fotos EXTRAS (a segunda em
                        diante, que a faixa resume como "+N") e a observação. */}
                    {(conferencePhotos.length > 1 || item.conferenceNotes) && (
                      <div>
                        <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#0e7490", margin: "0 0 8px" }}>
                          <Camera aria-hidden="true" style={{ width: 12, height: 12 }} />
                          Conferência{conferencePhotos.length > 1 ? ` · mais ${conferencePhotos.length - 1} ${conferencePhotos.length - 1 === 1 ? "foto" : "fotos"}` : ""}
                        </p>
                        {conferencePhotos.length > 1 && <PhotoGrid urls={conferencePhotos.slice(1)} alt="Foto da conferência" />}
                        {item.conferenceNotes && (
                          <p style={{ fontSize: 12, color: "#57534e", fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0" }}>"{item.conferenceNotes}"</p>
                        )}
                      </div>
                    )}

                    {(deliveryPhotos.length > 0 || item.deliveryNotes) && (
                      <div>
                        <p style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 700, color: "#047857", margin: "0 0 8px" }}>
                          <Camera aria-hidden="true" style={{ width: 12, height: 12 }} />
                          Entrega{deliveryPhotos.length > 1 ? ` · ${deliveryPhotos.length} fotos` : ""}
                        </p>
                        {deliveryPhotos.length > 0 && <PhotoGrid urls={deliveryPhotos} alt="Foto da entrega" />}
                        {item.deliveryNotes && (
                          <p style={{ fontSize: 12, color: "#57534e", fontStyle: "italic", lineHeight: 1.5, margin: "8px 0 0" }}>"{item.deliveryNotes}"</p>
                        )}
                      </div>
                    )}

                    {missingDeliveryProof && (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 12px" }}>
                        <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, color: "#92400e", flexShrink: 0, marginTop: 1 }} />
                        <div>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", margin: 0 }}>Entregue sem comprovante fotográfico</p>
                          <p style={{ fontSize: 12, color: "#92400e", margin: "2px 0 0", lineHeight: 1.45 }}>
                            A foto da entrega é opcional{item.receivedBy ? ` — consta apenas o recebimento por ${item.receivedBy}` : ""}.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          </div>

          {customActions && (
            <div style={{ padding: isMobile ? "0 16px 16px" : "0 32px 20px" }}>{customActions}</div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            RODAPÉ
        ══════════════════════════════════════════════════════════════════ */}
        <footer style={{
          flexShrink: 0, padding: isMobile ? "12px 16px" : "14px 32px",
          borderTop: "1px solid #ebe8e4",
          /* Branco, e não o #f5f4f1 de antes: sobre ele o #78716c da linha
             "Atualizado" dá 4,36 e reprova em 11px. Sobre branco, 4,80. */
          backgroundColor: "#ffffff",
          display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#78716c" }}>
            {item.updatedAt
              ? `Atualizado ${format(new Date(item.updatedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
              : item.displayId}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              data-testid="button-fechar-rodape"
              style={{
                height: 44, padding: "0 24px", borderRadius: 8, border: "none",
                backgroundColor: "#1c1917", color: "#ffffff", cursor: "pointer",
                font: "inherit", fontSize: 13, fontWeight: 700,
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#292524"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#1c1917"; }}
            >
              Fechar
            </button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
