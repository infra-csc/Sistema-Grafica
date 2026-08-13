import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import {
  Calendar, Package, FileCheck, Plus, Activity, Search, Truck, Clock,
  ChevronLeft, ChevronRight, Link2, FileText, RefreshCw,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { getStatusMeta } from "@/lib/status";

/* ── Palette ── */
const P = {
  bg:      "#fafaf9",
  surface: "#ffffff",
  border:  "#e7e5e4",
  text:    "#1c1917",
  // #746e69: o antigo #78716c reprovava AA sobre os fundos acinzentados da
  // tela (#f3f4f3) — é o mesmo cinza AA de lib/theme.
  second:  "#746e69",
  // Apenas decorativo (ícones, bolinhas) — como texto reprova AA; rótulos e
  // cabeçalhos usam #746e69 (o cinza AA de lib/theme).
  muted:   "#a8a29e",
  label:   "#746e69",
  accent:  "#f97316",
};

/* Deriva as cores da pill do STATUS de peça correspondente (lib/status.ts,
   fonte única): o mesmo estado aparecia aqui com cor diferente das outras
   telas (ex.: "Entregue" era roxo no histórico e esmeralda no resto do app).
   Rótulo e ícone continuam locais — são específicos do histórico. */
function fromStatus(status: string, label: string, icon: any) {
  const m = getStatusMeta(status);
  return { label, dot: m.dot, bg: m.bg, border: m.border, color: m.text, icon };
}

/* ── Type pill config ── */
const TYPE_CONFIG: Record<string, {
  label: string; dot: string; bg: string; border: string; color: string;
  icon: any;
}> = {
  event_created: {
    label: "Evento Criado", dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Calendar,
  },
  item_created: {
    // #c2410c (orange-700): o #f97316 saturado como texto reprovava AA.
    label: "Peça Adicionada", dot: "#f97316", bg: "#fff7ed", border: "#fed7aa", color: "#c2410c",
    icon: Plus,
  },
  sponsor_linked: {
    label: "Vinculação", dot: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe", color: "#7c3aed",
    icon: Link2,
  },
  thumb_uploaded: {
    label: "Thumb Enviado", dot: "#f59e0b", bg: "#fffbeb", border: "#fde68a", color: "#b45309",
    icon: FileCheck,
  },
  thumb_replaced: {
    label: "Thumb Trocado", dot: "#d97706", bg: "#fffbeb", border: "#fcd34d", color: "#92400e",
    icon: RefreshCw,
  },
  final_file_added: {
    // #0e7490 (cyan-700): #0891b2 como texto a 10px não passava AA.
    label: "Arq. Final", dot: "#06b6d4", bg: "#ecfeff", border: "#a5f3fc", color: "#0e7490",
    icon: FileCheck,
  },
  final_file_replaced: {
    label: "Arq. Final Trocado", dot: "#0e7490", bg: "#ecfeff", border: "#67e8f9", color: "#155e75",
    icon: RefreshCw,
  },
  item_sent:          fromStatus("awaiting_approval", "Enviado p/ Aprov.", Clock),
  sponsor_approved: {
    label: "Pat. Aprovou", dot: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d",
    icon: FileCheck,
  },
  sponsor_rejected: {
    label: "Pat. Reprovou", dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Activity,
  },
  item_approved:      fromStatus("approved", "Peça Liberada", FileCheck),
  item_released:      fromStatus("approved", "Lib. p/ Produção", Package),
  item_dispensed: {
    label: "Dispensado", dot: "#6b7280", bg: "#f3f4f6", border: "#e5e7eb", color: "#374151",
    icon: Activity,
  },
  item_deleted:       fromStatus("deleted", "Excluído", Activity),
  production_started: fromStatus("inProduction", "Em Produção", Package),
  item_produced:      fromStatus("produced", "Produzido", Package),
  item_delivered:     fromStatus("delivered", "Peça Entregue", Truck),
  book_sent: {
    label: "Envio de Book", dot: "#7c3aed", bg: "#f5f3ff", border: "#ddd6fe", color: "#6d28d9",
    icon: FileText,
  },
  item_conferred:     fromStatus("conferred", "Conferência", FileCheck),
  item_reused: {
    label: "Reaproveitamento", dot: "#059669", bg: "#f0fdf4", border: "#bbf7d0", color: "#047857",
    icon: RefreshCw,
  },
  item_reused_partial: {
    // #047857 (emerald-700): o #059669 reprovava AA sobre o tint claro.
    label: "Reaprov. Parcial", dot: "#10b981", bg: "#f0fdf4", border: "#a7f3d0", color: "#047857",
    icon: RefreshCw,
  },
  item_reuse_corrected: {
    label: "Reaprov. Corrigido", dot: "#d97706", bg: "#fffbeb", border: "#fde68a", color: "#92400e",
    icon: RefreshCw,
  },
  item_canceled:      fromStatus("canceled", "Cancelada", Activity),
  item_returned: {
    label: "Devolvida p/ Arte", dot: "#d97706", bg: "#fffbeb", border: "#fde68a", color: "#b45309",
    icon: Activity,
  },
  // COMPLEMENTO — aumento de quantidade pedido DEPOIS que a peça entrou em
  // produção (a peça original nunca muda; nasce a peça-filha #0062-C1). Sem
  // estas duas entradas o registro do aumento SUMIA do histórico: buildTimeline
  // termina sem push quando nada casa, e "isso fica nos logs" era metade do
  // pedido. Texto em #c2410c (4.96:1 sobre o tint) — #f97316 só como bolinha,
  // nunca como cor de texto.
  item_complement_created: {
    label: "Complemento", dot: "#f97316", bg: "#fff7ed", border: "#fed7aa", color: "#c2410c",
    icon: Plus,
  },
  item_complement_canceled: {
    label: "Compl. Cancelado", dot: "#dc2626", bg: "#fef2f2", border: "#fecaca", color: "#b91c1c",
    icon: Activity,
  },
};

const DEFAULT_CFG = {
  label: "atividade", dot: P.muted, bg: "#f5f5f4", border: P.border, color: P.second,
  icon: Clock,
};

const PAGE_SIZE = 25;

/* ── Initials helper ── */
function getInitials(name: string) {
  return (name || "Sistema")
    .split(" ").filter(Boolean).slice(0, 2)
    .map(n => n[0].toUpperCase()).join("");
}

/* ── User avatar ── */
function UserAvatar({ name }: { name?: string }) {
  // Sem autor registrado não dá para afirmar que foi o "Sistema": são ações
  // feitas antes de o app passar a gravar quem executou. Mostrar "—" é honesto.
  const unknown = !name || name === "Sistema";
  const display = unknown ? "—" : name!;
  const initials = unknown ? "—" : getInitials(display);
  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 10 }}
      title={unknown ? "Autor não registrado (ação anterior ao registro de autoria)" : display}
    >
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        backgroundColor: "#e8e8e7",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 10, fontWeight: 800, color: unknown ? P.label : P.text,
        flexShrink: 0, letterSpacing: "0.02em",
      }}>
        {initials}
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: unknown ? P.label : P.text, whiteSpace: "nowrap" }}>
        {display}
      </span>
    </div>
  );
}

interface TimelineEvent {
  id: string;
  type: string;
  timestamp: Date;
  eventName: string;
  eventId: string;
  itemType?: string;
  itemId?: string;
  itemDisplayId?: string;
  quantity?: number;
  quantityProduced?: number;
  receivedBy?: string;
  userName?: string;
  sponsorCount?: number;
  logDetails?: string;
}

/* ── Micro-componentes da descrição ──
   <B> (negrito no texto principal) e <Id> (código da peça) se repetiam
   inline dezenas de vezes em buildDescription — extraídos, a descrição fica
   legível e o estilo muda num lugar só. */
function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: P.text }}>{children}</strong>;
}
function Id({ id }: { id?: string }) {
  if (!id) return null;
  return <code style={{ fontFamily: "monospace", fontWeight: 700, color: P.second, fontSize: 13 }}>{id}</code>;
}

/* ── Description builder ── */
function buildDescription(e: TimelineEvent) {
  const ID = <Id id={e.itemDisplayId} />;

  switch (e.type) {
    case "event_created":
      return <span>Evento <B>{e.eventName}</B> foi criado</span>;
    case "item_created":
      return <span>{ID} <B>{e.itemType}</B> ({e.quantity} un.) adicionado ao evento <B>{e.eventName}</B></span>;
    case "sponsor_linked":
      return (
        <span>
          {ID} <B>{e.itemType}</B> —{" "}
          {e.sponsorCount != null
            ? <>{e.sponsorCount} {e.sponsorCount === 1 ? "patrocinador vinculado" : "patrocinadores vinculados"}</>
            : "patrocinadores atualizados"
          }{" "}
          no evento <B>{e.eventName}</B>
        </span>
      );
    case "thumb_uploaded":
      return <span>{ID} <B>{e.itemType}</B> — thumb de aprovação enviado · evento <B>{e.eventName}</B></span>;
    case "thumb_replaced":
      return <span>{ID} <B>{e.itemType}</B> — thumb trocado (versão anterior guardada) · evento <B>{e.eventName}</B></span>;
    case "final_file_added":
      return <span>{ID} <B>{e.itemType}</B> — arquivo final adicionado · evento <B>{e.eventName}</B></span>;
    case "final_file_replaced":
      return <span>{ID} <B>{e.itemType}</B> — arquivo final substituído · evento <B>{e.eventName}</B></span>;
    case "item_sent":
      return <span>{ID} <B>{e.itemType}</B> enviado para aprovação de patrocinador · evento <B>{e.eventName}</B></span>;
    case "sponsor_approved":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "patrocinador aprovou"} · evento <B>{e.eventName}</B></span>;
    case "sponsor_rejected":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "patrocinador reprovou"} · evento <B>{e.eventName}</B></span>;
    case "item_approved":
      return <span>{ID} <B>{e.itemType}</B> de <B>{e.eventName}</B> liberado para produção</span>;
    case "item_released":
      return <span>{ID} <B>{e.itemType}</B> revisado e liberado para produção · evento <B>{e.eventName}</B></span>;
    case "item_dispensed":
      return <span>{ID} <B>{e.itemType}</B> dispensado (aprovação ignorada) · evento <B>{e.eventName}</B></span>;
    case "item_deleted":
      return <span>Peça <B>{e.itemType}</B> excluída do evento <B>{e.eventName}</B></span>;
    case "production_started":
      return <span>Produção de {ID} <B>{e.itemType}</B> — {e.quantityProduced}/{e.quantity} un. · evento <B>{e.eventName}</B></span>;
    case "item_produced":
      return <span>{ID} <B>{e.itemType}</B> produzida — {e.quantityProduced ?? e.quantity}/{e.quantity} un. · evento <B>{e.eventName}</B></span>;
    case "item_delivered":
      return (
        <span>
          {ID} <B>{e.itemType}</B> de <B>{e.eventName}</B> entregue
          {e.receivedBy && <> para <B>{e.receivedBy}</B></>}
        </span>
      );
    case "item_reused":
      return <span>{ID} <B>{e.itemType}</B> marcada como reaproveitamento — não vai para produção · evento <B>{e.eventName}</B></span>;
    case "item_reused_partial": {
      // Dois formatos gravam o parcial: o da Gráfica ("6/10 reaproveitadas") e o
      // da Revisão ("6 un. de 10"). O número que interessa é o mesmo.
      const d = e.logDetails ?? "";
      const m = d.match(/(\d+)\/(\d+)\s*reaproveitad/i) ?? d.match(/(\d+)\s*un\.\s*de\s*(\d+)/i);
      const toProduce = d.match(/(\d+)\s*a produzir/i)?.[1];
      return (
        <span>
          {ID} <B>{e.itemType}</B> — reaproveitamento parcial
          {m ? <> ({m[1]} de {m[2]} un.{toProduce ? `, ${toProduce} a produzir` : ""})</> : null}
          {" · evento "}<B>{e.eventName}</B>
        </span>
      );
    }
    case "item_reuse_corrected":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "reaproveitamento corrigido"} · evento <B>{e.eventName}</B></span>;
    case "item_conferred":
      return <span>{ID} <B>{e.itemType}</B> conferida{e.logDetails?.match(/\((\d+\/\d+)\)/) ? <> — {e.logDetails.match(/\((\d+\/\d+)\)/)![1]} un.</> : null} · evento <B>{e.eventName}</B></span>;
    case "item_canceled":
      return <span>{ID} <B>{e.itemType}</B> cancelada · evento <B>{e.eventName}</B></span>;
    case "item_returned":
      return <span>{ID} <B>{e.itemType}</B> devolvida para a Arte · evento <B>{e.eventName}</B></span>;
    // O texto do próprio audit log já conta a história inteira (quantas
    // unidades, contratado antes → depois, motivo, e em que status a peça
    // original permaneceu). Reescrevê-lo aqui só perderia informação; o que
    // falta é a moldura — o código da peça e o nome do evento.
    case "item_complement_created":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "complemento criado"} · evento <B>{e.eventName}</B></span>;
    case "item_complement_canceled":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "complemento cancelado"} · evento <B>{e.eventName}</B></span>;
    case "book_sent": {
      const removido = (e.logDetails || "").toLowerCase().includes("removido");
      return (
        <span>
          Book de aprovação {removido ? "removido de" : "enviado com"}{" "}
          {e.quantity ? <B>{e.quantity} peça{e.quantity === 1 ? "" : "s"}</B> : "peças"}
          {" "}· evento <B>{e.eventName}</B>
        </span>
      );
    }
    default:
      return <span>Atividade registrada</span>;
  }
}

/* ── Pipeline: sintetiza a linha do tempo a partir de 3 tabelas ──
   Fica FORA do componente e roda dentro de um useMemo: antes ele
   reconstruía a timeline inteira (e refazia um events.find O(n) por item) a
   CADA render — inclusive a cada tecla digitada na busca. */
function buildTimeline(events: any[], items: any[], auditLogs: any[]): TimelineEvent[] {
  /* ── Build lookup maps ── */
  // Keep FIRST log per entity+action for userName lookups (created/delivered fire once)
  const auditLogMap = new Map<string, any>();
  auditLogs.forEach(log => {
    const key = `${log.entityId}-${log.action}`;
    if (!auditLogMap.has(key)) auditLogMap.set(key, log);
  });

  const itemMap = new Map<string, any>();
  items.forEach(item => itemMap.set(item.id, item));

  // events.find(...) por item era O(n×m); o Map torna cada lookup O(1).
  const eventMap = new Map<string, any>();
  events.forEach(event => eventMap.set(event.id, event));

  const timeline: TimelineEvent[] = [];

  // Pre-scan audit logs so the items loop can skip synthetic fallbacks
  // when a proper audit-log entry already covers that step.
  const itemsWithRelease = new Set<string>();    // covered by item_released from audit log
  const itemsWithProduction = new Set<string>(); // covered by production/produced logs
  auditLogs.forEach((log: any) => {
    const action = (log.action || "").toLowerCase();
    const details = (log.details || "");
    const itemId = log.entityId ?? log.entity_id;
    if (action === "approved" && details.toLowerCase().includes("liberado para produção")) {
      if (itemId) itemsWithRelease.add(itemId);
    }
    if (action === "production" || action === "produced") {
      if (itemId) itemsWithProduction.add(itemId);
    }
  });

  /* ── Synthetic events from items / events tables ── */
  events.forEach(event => {
    const log = auditLogMap.get(`${event.id}-created`);
    timeline.push({
      id: `event-${event.id}`, type: "event_created",
      timestamp: new Date(event.createdAt),
      eventName: event.name, eventId: event.id,
      userName: log?.userName,
    });
  });

  items.forEach(item => {
    const event = eventMap.get(item.eventId);
    const eventName = event?.name || "Evento desconhecido";
    // Peças importadas via Excel antigas só têm o log agregado no evento —
    // usa-o como fallback para não exibir "Sistema" como autor.
    const createdLog = auditLogMap.get(`${item.id}-created`)
      ?? auditLogMap.get(`${item.eventId}-created`);

    timeline.push({
      id: `item-created-${item.id}`, type: "item_created",
      timestamp: new Date(item.createdAt),
      eventName, eventId: item.eventId,
      itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
      quantity: item.quantity, userName: createdLog?.userName,
    });

    // Synthetic "Peça Liberada" only as fallback for legacy items without an audit log
    if (
      ["approved", "inProduction", "produced", "delivered"].includes(item.status) &&
      !itemsWithRelease.has(item.id)
    ) {
      const log = auditLogMap.get(`${item.id}-approved`);
      timeline.push({
        id: `item-approved-${item.id}`, type: "item_approved",
        timestamp: new Date(item.approvedAt || item.updatedAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        quantity: item.quantity, userName: log?.userName,
      });
    }

    // Fallback para itens antigos: quando não há log de produção, o evento é
    // derivado do próprio item (sem autor). Com log, quem manda é o loop abaixo.
    if (item.quantityProduced && item.quantityProduced > 0 && !itemsWithProduction.has(item.id)) {
      const prodLog = auditLogMap.get(`${item.id}-produced`) ?? auditLogMap.get(`${item.id}-production`);
      timeline.push({
        id: `production-${item.id}`, type: "production_started",
        timestamp: new Date(item.productionStartedAt || item.updatedAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        quantity: item.quantity, quantityProduced: item.quantityProduced,
        userName: prodLog?.userName ?? prodLog?.user_name,
      });
    }

    if (item.status === "delivered" && item.deliveredAt) {
      const log = auditLogMap.get(`${item.id}-delivered`);
      timeline.push({
        id: `delivered-${item.id}`, type: "item_delivered",
        timestamp: new Date(item.deliveredAt),
        eventName, eventId: item.eventId,
        itemType: item.type, itemId: item.id, itemDisplayId: item.displayId,
        receivedBy: item.receivedBy, userName: log?.userName,
      });
    }
  });

  // Parse audit logs for all relevant action types
  auditLogs.forEach((log: any) => {
    const action = (log.action || "").toLowerCase();
    const details = (log.details || "");
    const detailsLower = details.toLowerCase();
    const itemId = log.entityId ?? log.entity_id;
    const entityType = (log.entityType ?? log.entity_type ?? "").toLowerCase();
    const ts = log.createdAt ?? log.created_at;
    const userName = log.userName ?? log.user_name;

    // Logs de EVENTO: hoje só o envio/remoção do book de aprovação interessa
    // aqui (os demais viram entradas próprias a partir da tabela de eventos).
    if (entityType === "event") {
      if (detailsLower.includes("book")) {
        const ev = eventMap.get(itemId);
        const qtd = details.match(/(\d+)\s+pe/i)?.[1];
        timeline.push({
          id: `book-${log.id ?? itemId + ts}`,
          type: "book_sent",
          timestamp: new Date(ts),
          eventName: ev?.name || "Evento desconhecido",
          eventId: itemId,
          itemId,
          quantity: qtd ? parseInt(qtd, 10) : undefined,
          userName,
          logDetails: details,
        });
      }
      return;
    }

    // Only process item-related logs
    if (entityType !== "item") {
      return;
    }

    const item = itemMap.get(itemId);
    const event = item ? eventMap.get(item.eventId) : null;

    // Extrai nome do evento e tipo da peça dos detalhes do log quando o item foi deletado
    const eventNameFromDetails = details.match(/(?:do|no) evento "(.+?)"/i)?.[1];
    const itemTypeFromDetails  = details.match(/(?:Peça|Item|peça) "(.+?)"/i)?.[1]
                               || details.match(/^"(.+?)"/)?.[1];
    const displayIdFromDetails = details.match(/#(\d+)/)?.[1];

    const eventName    = event?.name || eventNameFromDetails || "Evento desconhecido";
    const resolvedType = item?.type  || itemTypeFromDetails;
    const resolvedId   = item?.displayId || (displayIdFromDetails ? `#${displayIdFromDetails}` : undefined);

    const base = {
      timestamp: new Date(ts),
      eventName,
      eventId: item?.eventId || "",
      itemType: resolvedType,
      itemId: itemId,
      itemDisplayId: resolvedId,
      quantity: item?.quantity,
      userName,
      logDetails: details,
    };

    // COMPLEMENTO — no TOPO do encadeamento, de propósito. O motivo do aumento
    // é TEXTO LIVRE escrito por uma pessoa: um motivo que contenha
    // "reaproveitamento" ou "conferência" cairia num dos casamentos por palavra
    // logo abaixo e o aumento apareceria no histórico disfarçado de outra coisa.
    // Casando por AÇÃO exata antes de todos eles, isso não tem como acontecer.
    // São dois logs por complemento (um na mãe, um na filha) e os dois
    // interessam: um responde "esta peça ganhou quantidade?", o outro "de onde
    // este lote novo veio?".
    if (action === "complement_created" || action === "complement_canceled") {
      timeline.push({
        id: `complement-${log.id ?? itemId + ts}`,
        type: action === "complement_created" ? "item_complement_created" : "item_complement_canceled",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    // Produção da Gráfica. Cada lançamento vira uma entrada — produções parciais
    // aparecem uma a uma, e a que fecha a quantidade entra como "Produzido".
    if (action === "production" || action === "produced") {
      const produced = Number(details.match(/Produção:\s*(\d+)/)?.[1]) || undefined;
      timeline.push({
        id: `production-${log.id ?? itemId + ts}`,
        type: action === "produced" ? "item_produced" : "production_started",
        ...base,
        quantityProduced: produced,
      });
      return;
    }

    // Reaproveitamento marcado pela Gráfica (total ou parcial). O log existia
    // mas nenhum padrão o reconhecia, então sumia do histórico.
    if (detailsLower.includes("reaproveitamento")) {
      // Correção de marcação errada precisa ser rastreável: é uma peça que
      // voltou para a produção depois de ter sido dada como reaproveitada.
      const corrected = detailsLower.includes("corrigido") || detailsLower.includes("removido por correção");
      timeline.push({
        id: `reuse-${log.id ?? itemId + ts}`,
        type: corrected
          ? "item_reuse_corrected"
          : detailsLower.includes("parcial") ? "item_reused_partial" : "item_reused",
        ...base,
      });
      return;
    }

    // Conferência da Gráfica (parcial ou concluída)
    if (detailsLower.includes("conferência")) {
      timeline.push({ id: `conferred-${log.id ?? itemId + ts}`, type: "item_conferred", ...base });
      return;
    }

    // Peça cancelada
    if (detailsLower.includes("item cancelado")) {
      timeline.push({ id: `canceled-${log.id ?? itemId + ts}`, type: "item_canceled", ...base });
      return;
    }

    // Devolvida para a Arte
    if (detailsLower.includes("devolvido para arte") || detailsLower.includes("devolvida para arte")
      || detailsLower.includes("devolvido para criação")) {
      timeline.push({ id: `returned-${log.id ?? itemId + ts}`, type: "item_returned", ...base });
      return;
    }

    // Sponsor linking
    if (action === "updated" && detailsLower.includes("patrocinadores atualizados")) {
      if (!item) return; // só exibe se item ainda existe (sponsor linking sem item é raro/irrelevante)
      const match = details.match(/(\d+)\s+patrocinador/i);
      const sponsorCount = match ? parseInt(match[1], 10) : undefined;
      timeline.push({ id: `sponsor-linked-${log.id ?? itemId + ts}`, type: "sponsor_linked", ...base, sponsorCount });
      return;
    }

    // Thumb enviado ou trocado pela Arte. A troca preserva a versão anterior,
    // por isso ganha um tipo próprio.
    if (action === "updated" && detailsLower.includes("thumb de aprovação atualizado")) {
      if (!item) return;
      const isReplacement = /anterior:/i.test(details);
      timeline.push({
        id: `thumb-${log.id ?? itemId + ts}`,
        type: isReplacement ? "thumb_replaced" : "thumb_uploaded",
        ...base,
      });
      return;
    }

    // Arquivo final adicionado ou substituído (a substituição usa "substituído",
    // que antes não casava com nenhum padrão e sumia do histórico).
    if (action === "updated" && detailsLower.includes("arquivo final")
        && /adicionad|atualizad|substituíd|substituid/i.test(detailsLower)) {
      if (!item) return;
      const isReplacement = /substitu|atualizad/i.test(detailsLower);
      timeline.push({
        id: `final-${log.id ?? itemId + ts}`,
        type: isReplacement ? "final_file_replaced" : "final_file_added",
        ...base,
      });
      return;
    }

    // Item sent for sponsor approval
    if (action === "updated" && detailsLower.includes("status alterado") && details.includes("→ Aguardando Aprovação")) {
      timeline.push({ id: `sent-${log.id ?? itemId + ts}`, type: "item_sent", ...base });
      return;
    }

    // Sponsor approved (individual or all)
    if (action === "approved" && (detailsLower.includes("patrocinador") || detailsLower.includes("aprovou"))) {
      // Skip "liberado para produção" — that's item_released
      if (detailsLower.includes("liberado para produção")) return;
      timeline.push({ id: `sp-approved-${log.id ?? itemId + ts}`, type: "sponsor_approved", ...base });
      return;
    }

    // Sponsor rejected
    if (action === "rejected") {
      timeline.push({ id: `sp-rejected-${log.id ?? itemId + ts}`, type: "sponsor_rejected", ...base });
      return;
    }

    // Item released for production (creator review)
    if (action === "approved" && detailsLower.includes("liberado para produção")) {
      timeline.push({ id: `released-${log.id ?? itemId + ts}`, type: "item_released", ...base });
      return;
    }

    // Item dispensed
    if (action === "dispensed") {
      timeline.push({ id: `dispensed-${log.id ?? itemId + ts}`, type: "item_dispensed", ...base });
      return;
    }

    // Item deleted — sempre exibe, mesmo sem o item na tabela
    if (action === "deleted") {
      timeline.push({
        id: `deleted-${log.id ?? itemId + ts}`,
        type: "item_deleted",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }

    // Item criado (log de auditoria, sem item na tabela = item foi criado e deletado)
    if (action === "created" && !item) {
      // Resumos de importação antigos foram gravados como 'item' mas com o id do
      // EVENTO — não são peças, e renderizavam "Peça ( un.) — Evento desconhecido".
      if (eventMap.has(itemId)) return;
      timeline.push({
        id: `item-created-log-${log.id ?? itemId + ts}`,
        type: "item_created",
        ...base,
        itemType: resolvedType || "Peça",
      });
      return;
    }
  });

  // Cópia antes do sort: não muta o array que acabou de ser montado à toa,
  // e deixa explícito que a ordenação é responsabilidade de quem consome.
  return [...timeline].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export default function Historico() {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();
  // Filtros inicializam da URL e são espelhados nela (mesmo padrão de
  // eventos.tsx): F5 não perde o estado e o link filtrado é compartilhável.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [eventFilter, setEventFilter] = useState<string[]>(
    () => urlParams.get("evento")?.split(",").filter(Boolean) ?? [],
  );
  const [actionFilter, setActionFilter] = useState<string[]>(
    () => urlParams.get("acao")?.split(",").filter(Boolean) ?? [],
  );
  const [searchFilter, setSearchFilter] = useState(() => urlParams.get("busca") ?? "");
  // Página também vem da URL: F5 na página 7 voltava para a 1.
  const [page, setPage] = useState(() => {
    const n = parseInt(urlParams.get("pagina") ?? "", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });

  // Atalho "/" foca a busca (paridade com eventos.tsx e Painel Geral).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: events = [], isError: eventsError, refetch: refetchEvents } = useQuery<any[]>({ queryKey: ["/api/events"] });
  const { data: items = [], isError: itemsError, refetch: refetchItems }  = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: auditLogs = [], isLoading: logsLoading, isError: logsError, refetch: refetchLogs } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  // Qualquer uma das 3 fontes falhando deixa a timeline incompleta de um jeito
  // silencioso (ex.: tudo vira "Evento desconhecido") — melhor avisar e
  // oferecer nova tentativa do que exibir um histórico pela metade.
  const isError = eventsError || itemsError || logsError;
  const retryAll = () => { refetchEvents(); refetchItems(); refetchLogs(); };

  const sorted = useMemo(
    () => buildTimeline(events, items, auditLogs),
    [events, items, auditLogs],
  );

  /* ── Filters — memoizados à parte: mudar filtro não reconstrói a timeline ── */
  const filtered = useMemo(() => {
    let list = eventFilter.length === 0 ? sorted : sorted.filter(e => eventFilter.includes(e.eventId));
    if (actionFilter.length > 0) list = list.filter(e => actionFilter.includes(e.type));
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(e =>
        e.eventName.toLowerCase().includes(q) ||
        e.userName?.toLowerCase().includes(q) ||
        e.itemType?.toLowerCase().includes(q) ||
        e.itemDisplayId?.toLowerCase().includes(q) ||
        e.receivedBy?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [sorted, eventFilter, actionFilter, searchFilter]);

  const hasActiveFilters = eventFilter.length > 0 || actionFilter.length > 0 || !!searchFilter.trim();
  const clearFilters = () => { setEventFilter([]); setActionFilter([]); setSearchFilter(""); setPage(1); };

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Sincroniza o estado com o total: quando um filtro encolhe a lista, `page`
  // ficava além de totalPages e o "próxima" parecia quebrado (o disabled era
  // calculado sobre safePage, mas o clique somava sobre o page inflado).
  // O guard de logsLoading protege o ?pagina= da URL: durante o carregamento
  // totalPages ainda é 1 e o clamp descartaria a página restaurada.
  useEffect(() => {
    if (logsLoading) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, logsLoading]);
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Filtros e página espelhados na URL (o efeito vive aqui embaixo porque
  // depende de safePage). + hash: replaceState sem #... apagava o fragmento.
  useEffect(() => {
    const p = new URLSearchParams();
    if (searchFilter) p.set("busca", searchFilter);
    if (actionFilter.length) p.set("acao", actionFilter.join(","));
    if (eventFilter.length) p.set("evento", eventFilter.join(","));
    if (safePage > 1) p.set("pagina", String(safePage));
    const qs = p.toString();
    window.history.replaceState(null, "", (qs ? `?${qs}` : window.location.pathname) + window.location.hash);
  }, [searchFilter, actionFilter, eventFilter, safePage]);

  const handleFilterChange = (setter: (v: string[]) => void) => (v: string[]) => {
    setter(v);
    setPage(1);
  };

  /* page buttons: show at most 5 — a janela desliza para manter a página
     atual centrada; perto do fim, ancora nas 5 últimas (antes o fim da lista
     mostrava a atual encostada na borda com botões "vazios" à direita). */
  const pageWindow: number[] = [];
  const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const end   = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pageWindow.push(i);

  /* ── Select style helper ── */
  const selectStyle: React.CSSProperties = {
    backgroundColor: "#ffffff", border: "none", borderRadius: 8,
    padding: "9px 14px", fontSize: 13, fontWeight: 600,
    color: P.text, cursor: "pointer",
    appearance: "none", WebkitAppearance: "none", minWidth: 168,
  };

  return (
    <div style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 14px 32px" : "28px 28px 48px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20, marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, flexShrink: 0,
          backgroundColor: "#fff7ed",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 1px 4px rgba(249,115,22,0.18)",
        }}>
          <Activity style={{ width: 28, height: 28, color: P.accent }} />
        </div>
        <div>
          <h1 style={{
            fontSize: 26, fontWeight: 700, color: P.text, margin: 0,
            letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.1,
          }}>
            Histórico de Atividades
          </h1>
          <p style={{ fontSize: 13, color: P.second, margin: "6px 0 0", fontWeight: 500 }}>
            Audit log completo de todas as ações do sistema
          </p>
        </div>
      </div>

      {/* ── Card ── */}
      <div style={{ backgroundColor: P.surface, border: `1px solid ${P.border}`, borderRadius: 12, overflow: "hidden" }}>

        {/* Filter strip */}
        <div style={{
          padding: isMobile ? "14px 16px" : "20px 24px",
          borderBottom: `1px solid ${P.border}`,
          backgroundColor: "#f3f4f3",
          display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
        }}>

          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
              width: 14, height: 14, color: P.muted, pointerEvents: "none",
            }} />
            <input
              placeholder="Buscar por ID, evento ou usuário..."
              ref={searchRef}
              value={searchFilter}
              onChange={e => { setSearchFilter(e.target.value); setPage(1); }}
              data-testid="input-search-filter"
              style={{
                width: "100%", paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
                backgroundColor: "#ffffff", border: "none", borderRadius: 8,
                fontSize: 13, color: P.text,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Action type select */}
          <FilterSelect
            showAllLabelWhenEmpty hideWhenEmpty={false}
            label="Ação" allLabel="Todas as ações"
            values={actionFilter} onValuesChange={handleFilterChange(setActionFilter)}
            options={[
              { value: "event_created", label: "Eventos criados", group: "Criação", pinned: true },
              { value: "item_created", label: "Itens adicionados", group: "Criação", pinned: true },
              { value: "item_deleted", label: "Itens excluídos", group: "Criação", pinned: true },
              { value: "sponsor_linked", label: "Vinculações", group: "Arte", pinned: true },
              { value: "thumb_uploaded", label: "Thumbs enviados", group: "Arte", pinned: true },
              { value: "thumb_replaced", label: "Thumbs trocados", group: "Arte", pinned: true },
              { value: "item_sent", label: "Enviados p/ aprovação", group: "Arte", pinned: true },
              { value: "book_sent", label: "Envio de book", group: "Arte", pinned: true },
              { value: "final_file_added", label: "Arq. finais adicionados", group: "Arte", pinned: true },
              { value: "final_file_replaced", label: "Arq. finais trocados", group: "Arte", pinned: true },
              { value: "item_dispensed", label: "Dispensados", group: "Arte", pinned: true },
              { value: "sponsor_approved", label: "Pat. aprovou", group: "Aprovação", pinned: true },
              { value: "sponsor_rejected", label: "Pat. reprovou", group: "Aprovação", pinned: true },
              { value: "item_released", label: "Lib. p/ produção", group: "Aprovação", pinned: true },
              { value: "item_approved", label: "Itens liberados", group: "Produção", pinned: true },
              { value: "production_started", label: "Em produção", group: "Produção", pinned: true },
              { value: "item_produced", label: "Produzido", group: "Produção", pinned: true },
              { value: "item_conferred", label: "Conferências", group: "Produção", pinned: true },
              { value: "item_reused", label: "Reaproveitamentos", group: "Produção", pinned: true },
              { value: "item_reused_partial", label: "Reaprov. parciais", group: "Produção", pinned: true },
              { value: "item_reuse_corrected", label: "Reaprov. corrigidos", group: "Produção", pinned: true },
              { value: "item_delivered", label: "Entregas", group: "Produção", pinned: true },
              { value: "item_returned", label: "Devolvidas p/ Arte", group: "Aprovação", pinned: true },
              { value: "item_canceled", label: "Canceladas", group: "Criação", pinned: true },
              { value: "item_complement_created", label: "Complementos criados", group: "Produção", pinned: true },
              { value: "item_complement_canceled", label: "Complementos cancelados", group: "Produção", pinned: true },
            ]}
            searchPlaceholder="Buscar ação..." emptyText="Nenhuma ação encontrada."
            testId="select-action-filter" triggerStyle={selectStyle}
          />

          {/* Event select */}
          <EventFilterDropdown
            values={eventFilter}
            onValuesChange={handleFilterChange(setEventFilter)}
            options={events.map((ev: any) => ({ value: ev.id, label: ev.name }))}
          />

          {/* Counter chip — aria-live anuncia o novo total a cada filtro.
              Sobre o #e8e8e7 do chip, #c2410c e o cinza de rótulo perdiam
              contraste: número em #9a3412 e rótulo em #57534e passam AA. */}
          <div aria-live="polite" style={{
            display: "flex", alignItems: "center", gap: 8,
            backgroundColor: "#e8e8e7", borderRadius: 8, padding: "9px 14px",
            marginLeft: "auto",
          }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 900, color: "#9a3412" }}>{filtered.length}</span>
          </div>
        </div>

        {/* Table header — no celular as linhas viram cards empilhados, então
            o cabeçalho de colunas deixa de fazer sentido. */}
        {!isMobile && (
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 5fr 2fr 3fr",
            padding: "14px 32px",
            backgroundColor: "#f3f4f3",
            borderBottom: `1px solid ${P.border}`,
          }}>
            {["Tipo", "Ação", "Data / Hora", "Realizado Por"].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 900, color: P.label, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                {h}
              </div>
            ))}
          </div>
        )}

        {/* Rows */}
        {logsLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "80px 24px" }}>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : isError ? (
          <div role="alert" style={{ padding: "72px 24px", textAlign: "center" }}>
            <h3 style={{ color: "#b91c1c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar o histórico</h3>
            <p style={{ color: P.label, fontSize: 13, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={retryAll} data-testid="button-retry-historico"
              style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          sorted.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "#e8e8e7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, opacity: 0.5 }}>
                <Activity style={{ width: 32, height: 32, color: P.muted }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>
                Nenhuma atividade ainda
              </h3>
              <p style={{ fontSize: 13, color: P.second, margin: 0 }}>As ações da equipe aparecem aqui conforme acontecem</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "#e8e8e7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, opacity: 0.5 }}>
                <Search style={{ width: 32, height: 32, color: P.muted }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>
                Nenhuma atividade encontrada
              </h3>
              <p style={{ fontSize: 13, color: P.second, margin: "0 0 20px" }}>Nenhum registro corresponde aos filtros ativos</p>
              {hasActiveFilters && (
                <button onClick={clearFilters} data-testid="button-clear-filters"
                  style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
                  Limpar filtros
                </button>
              )}
            </div>
          )
        ) : (
          <div style={{ borderBottom: `1px solid ${P.border}` }}>
            {pageItems.map((entry, idx) => {
              const cfg = TYPE_CONFIG[entry.type] ?? DEFAULT_CFG;
              const isLast = idx === pageItems.length - 1;

              /* A linha do histórico leva ao evento no clique, mas era um
                 div sem foco: por teclado o histórico não navegava para
                 lugar nenhum. role="link" porque a ação é navegar, e só
                 quando existe evento para onde ir. O aria-label diz PARA
                 QUAL evento — "abrir evento deste registro" repetido 25
                 vezes não distinguia nada. Só Enter ativa: num link nativo
                 o Espaço rola a página, e role="link" deve imitá-lo. */
              const linkProps = entry.eventId ? {
                role: "link" as const,
                tabIndex: 0,
                "aria-label": `Abrir evento ${entry.eventName}`,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter") { e.preventDefault(); setLocation(`/eventos/${entry.eventId}`); }
                },
              } : {};

              if (isMobile) {
                return (
                  <div
                    key={entry.id}
                    data-testid={`timeline-event-${idx}`}
                    {...linkProps}
                    onClick={entry.eventId ? () => setLocation(`/eventos/${entry.eventId}`) : undefined}
                    style={{
                      display: "flex", flexDirection: "column", gap: 8,
                      padding: "14px 16px",
                      borderBottom: isLast ? "none" : `1px solid #f0efee`,
                      cursor: entry.eventId ? "pointer" : "default",
                    }}
                  >
                    <div>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "4px 10px", borderRadius: 999,
                        backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
                        fontSize: 10, fontWeight: 800, color: cfg.color,
                        textTransform: "uppercase", letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />
                        {cfg.label}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: P.second, lineHeight: 1.45 }}>
                      {buildDescription(entry)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: P.text }}>
                        {format(entry.timestamp, "dd MMM yyyy, HH:mm", { locale: ptBR })}
                      </span>
                      <UserAvatar name={entry.userName} />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={entry.id}
                  data-testid={`timeline-event-${idx}`}
                  {...linkProps}
                  onClick={entry.eventId ? () => setLocation(`/eventos/${entry.eventId}`) : undefined}
                  style={{
                    display: "grid", gridTemplateColumns: "2fr 5fr 2fr 3fr",
                    padding: "18px 32px", alignItems: "center",
                    borderBottom: isLast ? "none" : `1px solid #f0efee`,
                    cursor: entry.eventId ? "pointer" : "default", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (entry.eventId) e.currentTarget.style.backgroundColor = "#f9f9f8"; }}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {/* Tipo pill */}
                  <div>
                    <span style={{
                      display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "4px 10px", borderRadius: 999,
                      backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
                      fontSize: 10, fontWeight: 800, color: cfg.color,
                      textTransform: "uppercase", letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />
                      {cfg.label}
                    </span>
                  </div>

                  {/* Ação */}
                  <div style={{ fontSize: 13, color: P.second, paddingRight: 16, lineHeight: 1.45 }}>
                    {buildDescription(entry)}
                  </div>

                  {/* Data / Hora */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: P.text }}>
                      {format(entry.timestamp, "dd MMM, HH:mm", { locale: ptBR })}
                    </div>
                    <div style={{ fontSize: 10, color: P.label, marginTop: 2 }}>
                      {format(entry.timestamp, "yyyy", { locale: ptBR })}
                    </div>
                  </div>

                  {/* Realizado por */}
                  <div>
                    <UserAvatar name={entry.userName} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer pagination */}
        {!isError && filtered.length > 0 && (
          <div style={{
            padding: isMobile ? "14px 16px" : "14px 32px",
            backgroundColor: "#f3f4f3",
            borderTop: `1px solid ${P.border}`,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13, color: P.second }}>
              Exibindo <strong style={{ color: P.text }}>{Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)}</strong> de <strong style={{ color: P.text }}>{filtered.length}</strong> registros
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {/* Prev/Next sobre safePage (não o functional p): `page` pode
                  estar inflado após um filtro encolher a lista — somar sobre
                  ele pulava páginas em relação ao que a tela exibia. */}
              <PageBtn
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                testId="button-prev-page"
                label="Página anterior"
              >
                <ChevronLeft style={{ width: 14, height: 14 }} />
              </PageBtn>

              {/* Page numbers */}
              {pageWindow.map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  data-testid={`button-page-${p}`}
                  aria-current={p === safePage ? "page" : undefined}
                  style={{
                    padding: "4px 10px", borderRadius: 6, border: "none",
                    fontSize: 13, fontWeight: p === safePage ? 900 : 700,
                    cursor: "pointer",
                    // #c2410c: o branco sobre #f97316 ficava em 2.8:1 — a
                    // página ativa era justamente a menos legível do grupo.
                    backgroundColor: p === safePage ? "#c2410c" : "transparent",
                    color: p === safePage ? "#ffffff" : P.second,
                    transition: "all 0.12s",
                    minWidth: 32,
                  }}
                  onMouseEnter={e => { if (p !== safePage) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e8e8e7"; }}
                  onMouseLeave={e => { if (p !== safePage) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                >
                  {p}
                </button>
              ))}

              {/* Next */}
              <PageBtn
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                testId="button-next-page"
                label="Próxima página"
              >
                <ChevronRight style={{ width: 14, height: 14 }} />
              </PageBtn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Pagination arrow button ── */
function PageBtn({ onClick, disabled, children, testId, label }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode; testId: string; label: string;
}) {
  const [h, setH] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-label={label}
      data-testid={testId}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        padding: 6, borderRadius: 6, border: "none", cursor: disabled ? "default" : "pointer",
        backgroundColor: h && !disabled ? "#e8e8e7" : "transparent",
        // Desabilitada fica em #a8a29e SEM opacity por cima: opacity 0.35
        // sobre um cinza claro sumia com a seta em vez de só recuá-la.
        color: disabled ? "#a8a29e" : "#57534e",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s",
      }}
    >
      {children}
    </button>
  );
}
