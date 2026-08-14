import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import {
  Calendar, Package, FileCheck, Plus, Activity, Search, Truck, Clock,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Link2, FileText,
  RefreshCw, RotateCcw, Download, X, Copy, Check, Trash2, Undo2, Pencil,
  ShieldAlert, Flag, CalendarClock, CopyPlus, ArrowUpToLine,
  Users, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import { useLocation } from "wouter";
import { format, formatDistanceToNow, subDays, startOfDay, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, modalSurface, ModalHeader, ModalFooter } from "@/components/modal-shell";
import { buildTimeline, type TimelineEvent } from "@/lib/timeline";

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
};

/* ── Cor por FASE, não por tipo ────────────────────────────────────────────
   Antes cada tipo tinha hex próprio e 16 dos 24 colidiam byte a byte: "Evento
   Criado" tinha exatamente a cor de erro de "Pat. Reprovou", "Peça Adicionada"
   era indistinguível de "Em Produção". A cor não carregava informação nenhuma
   e o olho passava a ler o texto de 10px em caixa alta.

   Agora são CINCO fases (as mesmas cinco que o filtro de Ação já agrupava) mais
   um tom de exceção. O vermelho fica reservado ao excepcional — reprovação,
   devolução, cancelamento e exclusão —, e o ÍCONE (que já existia no config e
   nunca era desenhado) distingue tipos dentro da mesma fase.

   Por que não `getStatusMeta`: estas pills são de AÇÃO, não de ESTADO. Derivá-las
   de lib/status.ts criava um acoplamento invisível — mudar a cor de `approved`
   na fonte única repintava duas pills de ação daqui. Os tons são os mesmos 50 /
   200 / 700 da paleta base do app, então não há dialeto novo.

   Contraste do texto sobre o fundo da pill (10px, exige 4,5:1), calculado:
     #1d4ed8 / #eff6ff = 6,16:1   #b45309 / #fffbeb = 4,86:1
     #7e22ce / #faf5ff = 6,51:1   #c2410c / #fff7ed = 4,96:1
     #047857 / #ecfdf5 = 5,21:1   #b91c1c / #fef2f2 = 5,91:1
     #44403c / #f5f5f4 = 9,42:1
   Todos passam AA. Nenhum #f97316 ou #a8a29e entra como cor de texto. */
type Phase = "criacao" | "arte" | "aprovacao" | "producao" | "encerramento" | "outros";

const PHASE_STYLE: Record<Phase | "excecao", { bg: string; border: string; color: string }> = {
  criacao:      { bg: "#eff6ff", border: "#bfdbfe", color: "#1d4ed8" },
  arte:         { bg: "#fffbeb", border: "#fde68a", color: "#b45309" },
  aprovacao:    { bg: "#faf5ff", border: "#e9d5ff", color: "#7e22ce" },
  producao:     { bg: "#fff7ed", border: "#fed7aa", color: "#c2410c" },
  encerramento: { bg: "#ecfdf5", border: "#a7f3d0", color: "#047857" },
  outros:       { bg: "#f5f5f4", border: "#e7e5e4", color: "#44403c" },
  excecao:      { bg: "#fef2f2", border: "#fecaca", color: "#b91c1c" },
};

const PHASE_LABEL: Record<Phase, string> = {
  criacao: "Criação",
  arte: "Arte",
  aprovacao: "Aprovação",
  producao: "Produção",
  encerramento: "Encerramento",
  outros: "Outros",
};

const PHASE_ORDER: Phase[] = ["criacao", "arte", "aprovacao", "producao", "encerramento", "outros"];

interface TypeCfg {
  label: string;
  /** Rótulo do filtro (plural, como o usuário procura). */
  filterLabel: string;
  phase: Phase;
  /** Excepcional: reprovação, devolução, cancelamento, exclusão. */
  excecao?: boolean;
  icon: any;
}

const TYPE_CONFIG: Record<string, TypeCfg> = {
  /* ── Criação ── */
  event_created:            { label: "Evento Criado",     filterLabel: "Eventos criados",           phase: "criacao", icon: Calendar },
  event_updated:            { label: "Evento Alterado",   filterLabel: "Eventos alterados",         phase: "criacao", icon: CalendarClock },
  event_priority:           { label: "Prioridade",        filterLabel: "Prioridade de evento",      phase: "criacao", icon: Flag },
  item_created:             { label: "Peça Adicionada",   filterLabel: "Peças adicionadas",         phase: "criacao", icon: Plus },
  item_edited:              { label: "Peça Editada",      filterLabel: "Peças editadas",            phase: "criacao", icon: Pencil },
  item_restored:            { label: "Restaurada",        filterLabel: "Restaurações da lixeira",   phase: "criacao", icon: Undo2 },
  items_cloned:             { label: "Peças Clonadas",    filterLabel: "Clonagens de peças",        phase: "criacao", icon: CopyPlus },
  items_submitted:          { label: "Envio em Lote",     filterLabel: "Envios em lote",            phase: "criacao", icon: Package },
  items_batch:              { label: "Lote de Peças",     filterLabel: "Lotes de peças",            phase: "criacao", icon: Package },
  item_complement_created:  { label: "Complemento",       filterLabel: "Complementos criados",      phase: "criacao", icon: Plus },

  /* ── Arte ── */
  sponsor_linked:           { label: "Vinculação",        filterLabel: "Vinculações",               phase: "arte", icon: Link2 },
  thumb_uploaded:           { label: "Thumb Enviado",     filterLabel: "Thumbs enviados",           phase: "arte", icon: FileCheck },
  thumb_replaced:           { label: "Thumb Trocado",     filterLabel: "Thumbs trocados",           phase: "arte", icon: RefreshCw },
  thumb_new_version:        { label: "Nova Versão",       filterLabel: "Novas versões de thumb",    phase: "arte", icon: RefreshCw },
  final_file_added:         { label: "Arq. Final",        filterLabel: "Arq. finais adicionados",   phase: "arte", icon: FileCheck },
  final_file_replaced:      { label: "Arq. Final Trocado", filterLabel: "Arq. finais trocados",     phase: "arte", icon: RefreshCw },
  item_sent:                { label: "Enviada p/ Aprov.", filterLabel: "Enviadas p/ aprovação",     phase: "arte", icon: Clock },
  item_sent_no_approval:    { label: "Envio s/ Aprov.",   filterLabel: "Envios sem aprovação",      phase: "arte", icon: Clock },
  book_sent:                { label: "Envio de Book",     filterLabel: "Envios de book",            phase: "arte", icon: FileText },
  item_dispensed:           { label: "Dispensada",        filterLabel: "Dispensadas",               phase: "arte", icon: Activity },

  /* ── Aprovação ── */
  sponsor_approved:         { label: "Pat. Aprovou",      filterLabel: "Pat. aprovou",              phase: "aprovacao", icon: FileCheck },
  sponsor_rejected:         { label: "Pat. Reprovou",     filterLabel: "Pat. reprovou",             phase: "aprovacao", excecao: true, icon: Activity },
  item_rejected_creator:    { label: "Reprov. Interna",   filterLabel: "Reprovações internas",      phase: "aprovacao", excecao: true, icon: Activity },
  item_returned:            { label: "Devolvida p/ Arte", filterLabel: "Devolvidas p/ Arte",        phase: "aprovacao", excecao: true, icon: Undo2 },
  approval_reverted:        { label: "Aprov. Revertida",  filterLabel: "Aprovações revertidas",     phase: "aprovacao", icon: ShieldAlert },
  item_released:            { label: "Lib. p/ Produção",  filterLabel: "Liberadas para produção",   phase: "aprovacao", icon: Package },

  /* ── Produção ── */
  production_started:       { label: "Em Produção",       filterLabel: "Em produção",               phase: "producao", icon: Package },
  item_produced:            { label: "Produzida",         filterLabel: "Produzidas",                phase: "producao", icon: Package },
  item_conferred:           { label: "Conferência",       filterLabel: "Conferências",              phase: "producao", icon: FileCheck },
  item_reused:              { label: "Reaproveitamento",  filterLabel: "Reaproveitamentos",         phase: "producao", icon: RefreshCw },
  item_reused_partial:      { label: "Reaprov. Parcial",  filterLabel: "Reaprov. parciais",         phase: "producao", icon: RefreshCw },
  item_reuse_corrected:     { label: "Reaprov. Corrigido", filterLabel: "Reaprov. corrigidos",      phase: "producao", icon: RefreshCw },

  /* ── Encerramento ── */
  item_delivered:           { label: "Peça Entregue",     filterLabel: "Entregas",                  phase: "encerramento", icon: Truck },
  item_canceled:            { label: "Cancelada",         filterLabel: "Canceladas",                phase: "encerramento", excecao: true, icon: Activity },
  item_complement_canceled: { label: "Compl. Cancelado",  filterLabel: "Complementos cancelados",   phase: "encerramento", excecao: true, icon: Activity },
  item_deleted:             { label: "Peça Excluída",     filterLabel: "Peças excluídas",           phase: "encerramento", excecao: true, icon: Trash2 },
  event_deleted:            { label: "Evento Excluído",   filterLabel: "Eventos excluídos",         phase: "encerramento", excecao: true, icon: Trash2 },
};

// Alcançável de verdade agora: o motor não descarta mais nenhum log, e o que
// não casa com padrão nenhum chega aqui com o `details` cru em vez de sumir.
const DEFAULT_CFG: TypeCfg = {
  label: "Atividade", filterLabel: "Outras atividades", phase: "outros", icon: Clock,
};

function cfgFor(type: string): TypeCfg & { bg: string; border: string; color: string } {
  const cfg = TYPE_CONFIG[type] ?? DEFAULT_CFG;
  return { ...cfg, ...PHASE_STYLE[cfg.excecao ? "excecao" : cfg.phase] };
}

/** Tipos que respondem "o que deu errado" — atalho do chip de métrica. */
const EXCECAO_TYPES = Object.entries(TYPE_CONFIG)
  .filter(([, c]) => c.excecao)
  .map(([t]) => t);

/* ── Período ── */
const PERIODS = [
  { value: "hoje", label: "Hoje" },
  { value: "7d",   label: "Últimos 7 dias" },
  { value: "30d",  label: "Últimos 30 dias" },
  { value: "all",  label: "Todo o período" },
];

function cutoff(p: string): Date | null {
  if (p === "hoje") return startOfDay(new Date());
  if (p === "7d")  return subDays(new Date(), 7);
  if (p === "30d") return subDays(new Date(), 30);
  return null;
}

const PAGE_SIZES = [25, 50, 100];
const SEM_AUTOR = "__sem_autor__";
const VAZIO: any[] = [];

/* ── Atalho de filtro ───────────────────────────────────────────────────────
   Antes três atalhos e um totalizador usavam o MESMO ladrilho grande: mesma
   caixa, mesmo número gigante, mesma legenda em caixa alta — só que três
   mudavam a consulta e o quarto era só o resultado dela. Aqui as três naturezas
   da faixa ganham três formas distintas e não intercambiáveis:

     atalho   → pílula (raio 999), tom semântico, aria-pressed
     filtro   → caixa (raio 7) com ícone da dimensão
     resultado→ texto puro, sem moldura nenhuma

   O atalho é um INTERRUPTOR: clicar de novo desfaz o recorte que ele aplicou —
   antes só havia caminho de ida, e desfazer exigia caçar o filtro certo.

   Contraste calculado do rótulo (11px, exige 4,5:1):
     inativo  #1d4ed8 / #eff6ff = 6,16:1   ativo  #ffffff / #1d4ed8 = 6,70:1
              #7e22ce / #faf5ff = 6,51:1          #ffffff / #7e22ce = 6,98:1
              #b91c1c / #fef2f2 = 5,91:1          #ffffff / #b91c1c = 6,47:1
   Todos passam AA. */
const ATALHO_TOM = {
  azul:     { tint: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  roxo:     { tint: "#faf5ff", border: "#e9d5ff", text: "#7e22ce" },
  vermelho: { tint: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
} as const;

function Atalho({ label, count, tom, ativo, alto, onClick, testId }: {
  label: string; count: number; tom: keyof typeof ATALHO_TOM;
  ativo: boolean; alto: boolean; onClick: () => void; testId: string;
}) {
  const t = ATALHO_TOM[tom];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      data-testid={testId}
      title={ativo ? `Desfazer o atalho "${label}"` : `Filtrar por ${label.toLowerCase()}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        height: alto ? 40 : 30, padding: "0 12px", borderRadius: 999,
        backgroundColor: ativo ? t.text : t.tint,
        border: `1px solid ${ativo ? t.text : t.border}`,
        color: ativo ? "#ffffff" : t.text,
        fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        transition: "background 0.12s, color 0.12s",
      }}
    >
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 700, letterSpacing: 0 }}>
        {count}
      </span>
      {label}
      {ativo && <X aria-hidden="true" style={{ width: 11, height: 11 }} />}
    </button>
  );
}

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
      style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}
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
      <span style={{
        fontSize: 13, fontWeight: 700, color: unknown ? P.label : P.text,
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {display}
      </span>
    </div>
  );
}

interface Nav {
  goEvent: (eventId: string) => void;
  goItem: (eventId: string, itemId: string) => void;
}

/* ── Micro-componentes da descrição ──
   O nome do evento e o código da peça são LINKS de verdade dentro da descrição
   (que é onde o olho já está), em vez de a linha inteira navegar: antes,
   qualquer tentativa de selecionar o código para colar num chat disparava a
   navegação ao soltar o botão. */
const linkStyle: React.CSSProperties = {
  background: "none", border: "none", padding: 0, margin: 0,
  font: "inherit", color: P.text, fontWeight: 700,
  cursor: "pointer", textDecoration: "underline",
  textDecorationColor: "rgba(28,25,23,0.25)", textUnderlineOffset: 2,
};

// role="link" + Espaço bloqueado: a ação é NAVEGAR, e num link nativo o Espaço
// rola a página em vez de ativar. É a mesma disciplina que a linha inteira já
// seguia antes de o clique virar painel de detalhe.
const asLink = {
  role: "link" as const,
  onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === " ") ev.preventDefault(); },
};

function B({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: P.text }}>{children}</strong>;
}

function Ev({ e, nav }: { e: TimelineEvent; nav: Nav }) {
  if (!e.eventId) return <B>{e.eventName}</B>;
  return (
    <button
      type="button"
      {...asLink}
      style={linkStyle}
      title={`Abrir o evento ${e.eventName}`}
      onClick={ev => { ev.stopPropagation(); nav.goEvent(e.eventId); }}
    >
      {e.eventName}
    </button>
  );
}

function Id({ e, nav }: { e: TimelineEvent; nav: Nav }) {
  if (!e.itemDisplayId) return null;
  const mono: React.CSSProperties = {
    fontFamily: "'DM Mono', monospace", fontWeight: 700, color: P.second, fontSize: 13,
  };
  if (!e.eventId || !e.itemId || e.itemMissing) {
    return <code style={mono}>{e.itemDisplayId}</code>;
  }
  return (
    <button
      type="button"
      {...asLink}
      style={{ ...linkStyle, ...mono, color: P.second }}
      title={`Abrir a peça ${e.itemDisplayId} dentro do evento`}
      onClick={ev => { ev.stopPropagation(); nav.goItem(e.eventId, e.itemId!); }}
    >
      {e.itemDisplayId}
    </button>
  );
}

/** "(peça excluída)" — os logs intermediários da peça deixaram de sumir. */
function Excluida({ e }: { e: TimelineEvent }) {
  if (!e.itemMissing || e.type === "item_deleted") return null;
  return <span style={{ color: P.label, fontStyle: "italic" }}> (peça excluída)</span>;
}

/** Trecho útil do details, sem repetir o que a moldura da linha já diz. */
function tail(details: string | undefined, prefix: RegExp): string {
  const d = (details ?? "").trim();
  const m = d.match(prefix);
  return m ? d.slice(m[0].length).trim() : d;
}

/* ── Description builder ── */
function buildDescription(e: TimelineEvent, nav: Nav) {
  const ID = <Id e={e} nav={nav} />;
  const EV = <Ev e={e} nav={nav} />;

  switch (e.type) {
    case "event_created":
      return <span>Evento {EV} foi criado</span>;
    case "event_updated": {
      const diff = tail(e.logDetails, /^Evento ".*?" atualizado\s*(—|-)?\s*/);
      return <span>Evento {EV} alterado{diff ? <> — {diff}</> : null}</span>;
    }
    case "event_priority":
      return <span>Evento {EV} — {tail(e.logDetails, /^Prioridade do evento ".*?"\s*/) || "prioridade alterada"}</span>;
    case "event_deleted":
      return <span>Evento <B>{e.eventName}</B> excluído — {tail(e.logDetails, /^Evento ".*?" excluído\s*(—|-)?\s*/) || "sem detalhes registrados"}</span>;
    case "items_cloned":
      return <span><B>{e.batchCount ?? "?"}</B> peças clonadas para o evento {EV}</span>;
    case "items_submitted":
      return <span><B>{e.batchCount ?? "?"}</B> peças enviadas para vinculação de patrocinadores · evento {EV}</span>;
    case "items_batch":
      return <span>{e.logDetails || "Operação em lote"} · evento {EV}</span>;

    case "item_created":
      return <span>{ID} <B>{e.itemType}</B>{e.quantity != null ? <> ({e.quantity} un.)</> : null} adicionada ao evento {EV}<Excluida e={e} /></span>;
    case "item_edited":
      return <span>{ID} <B>{e.itemType}</B> editada — {tail(e.logDetails, /^Item editado:?\s*/) || "sem campos alterados"} · evento {EV}<Excluida e={e} /></span>;
    case "item_restored":
      return <span>{ID} <B>{e.itemType}</B> restaurada da lixeira · evento {EV}</span>;
    case "sponsor_linked":
      return (
        <span>
          {ID} <B>{e.itemType}</B> —{" "}
          {e.sponsorCount != null
            ? <>{e.sponsorCount} {e.sponsorCount === 1 ? "patrocinador vinculado" : "patrocinadores vinculados"}</>
            : "patrocinadores atualizados"
          }{" "}
          no evento {EV}<Excluida e={e} />
        </span>
      );
    case "thumb_uploaded":
      return <span>{ID} <B>{e.itemType}</B> — thumb de aprovação enviado · evento {EV}<Excluida e={e} /></span>;
    case "thumb_replaced":
      return <span>{ID} <B>{e.itemType}</B> — thumb trocado (versão anterior guardada) · evento {EV}<Excluida e={e} /></span>;
    case "thumb_new_version":
      return (
        <span>
          {ID} <B>{e.itemType}</B> — a Arte enviou nova versão do thumb
          {e.sponsorCount != null ? <> para <B>{e.sponsorCount}</B> patrocinador(es)</> : null}
          {" · evento "}{EV}<Excluida e={e} />
        </span>
      );
    case "final_file_added":
      return <span>{ID} <B>{e.itemType}</B> — arquivo final adicionado · evento {EV}<Excluida e={e} /></span>;
    case "final_file_replaced":
      return <span>{ID} <B>{e.itemType}</B> — arquivo final substituído · evento {EV}<Excluida e={e} /></span>;
    case "item_sent":
      return <span>{ID} <B>{e.itemType}</B> enviada para aprovação de patrocinador · evento {EV}<Excluida e={e} /></span>;
    case "item_sent_no_approval":
      return <span>{ID} <B>{e.itemType}</B> enviada direto para revisão final — sem aprovação de patrocinador · evento {EV}<Excluida e={e} /></span>;
    case "sponsor_approved":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "patrocinador aprovou"} · evento {EV}<Excluida e={e} /></span>;
    case "sponsor_rejected":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "patrocinador reprovou"} · evento {EV}<Excluida e={e} /></span>;
    case "item_rejected_creator":
      return <span>{ID} <B>{e.itemType}</B> — reprovada internamente (pelo criador do evento) · evento {EV}<Excluida e={e} /></span>;
    case "approval_reverted":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "aprovação revertida por administrador"} · evento {EV}<Excluida e={e} /></span>;
    case "item_released":
      return <span>{ID} <B>{e.itemType}</B> revisada e liberada para produção · evento {EV}<Excluida e={e} /></span>;
    case "item_dispensed":
      return <span>{ID} <B>{e.itemType}</B> dispensada (aprovação ignorada) · evento {EV}<Excluida e={e} /></span>;
    case "item_deleted":
      return <span>Peça {ID} <B>{e.itemType}</B> excluída do evento {EV}</span>;
    case "production_started":
      return <span>Produção de {ID} <B>{e.itemType}</B> — {e.quantityProduced ?? "?"}/{e.quantity ?? "?"} un. · evento {EV}<Excluida e={e} /></span>;
    case "item_produced":
      return <span>{ID} <B>{e.itemType}</B> produzida — {e.quantityProduced ?? e.quantity}/{e.quantity} un. · evento {EV}<Excluida e={e} /></span>;
    case "item_delivered":
      return (
        <span>
          {ID} <B>{e.itemType}</B> de {EV} entregue
          {e.receivedBy && <> para <B>{e.receivedBy}</B></>}
        </span>
      );
    case "item_reused":
      return <span>{ID} <B>{e.itemType}</B> marcada como reaproveitamento — não vai para produção · evento {EV}<Excluida e={e} /></span>;
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
          {" · evento "}{EV}<Excluida e={e} />
        </span>
      );
    }
    case "item_reuse_corrected":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "reaproveitamento corrigido"} · evento {EV}<Excluida e={e} /></span>;
    case "item_conferred":
      return <span>{ID} <B>{e.itemType}</B> conferida{e.logDetails?.match(/\((\d+\/\d+)\)/) ? <> — {e.logDetails.match(/\((\d+\/\d+)\)/)![1]} un.</> : null} · evento {EV}<Excluida e={e} /></span>;
    case "item_canceled":
      return <span>{ID} <B>{e.itemType}</B> cancelada · evento {EV}<Excluida e={e} /></span>;
    case "item_returned":
      return <span>{ID} <B>{e.itemType}</B> devolvida para a Arte · evento {EV}<Excluida e={e} /></span>;
    // O texto do próprio audit log já conta a história inteira (quantas
    // unidades, contratado antes → depois, motivo, e em que status a peça
    // original permaneceu). Reescrevê-lo aqui só perderia informação; o que
    // falta é a moldura — o código da peça e o nome do evento.
    case "item_complement_created":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "complemento criado"} · evento {EV}<Excluida e={e} /></span>;
    case "item_complement_canceled":
      return <span>{ID} <B>{e.itemType}</B> — {e.logDetails || "complemento cancelado"} · evento {EV}<Excluida e={e} /></span>;
    case "book_sent": {
      const removido = (e.logDetails || "").toLowerCase().includes("removido");
      return (
        <span>
          Book de aprovação {removido ? "removido de" : "enviado com"}{" "}
          {e.quantity ? <B>{e.quantity} peça{e.quantity === 1 ? "" : "s"}</B> : "peças"}
          {" "}· evento {EV}
        </span>
      );
    }
    default:
      // Melhor uma linha feia do que um buraco silencioso numa auditoria.
      return <span>{e.logDetails || "Atividade registrada"}{e.eventName !== "Evento desconhecido" ? <> · evento {EV}</> : null}</span>;
  }
}

/* ── Viewport ──
   O corte de card empilhado sobe de 768 para 1024 nesta tela: entre 768 e
   ~1100px o grid de 4 colunas vazava — pill e nome do autor com `nowrap`, sem
   `minWidth: 0` e sem barra de rolagem, então o texto era simplesmente cortado. */
function useViewport() {
  const [w, setW] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return { isMobile: w < 768, isCompact: w < 1024 };
}

const GRID = "minmax(150px,180px) minmax(0,1fr) 110px minmax(0,200px) 40px";

export default function Historico() {
  const { isMobile, isCompact } = useViewport();
  const [, setLocation] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyH, setStickyH] = useState(0);

  // Filtros inicializam da URL e são espelhados nela (mesmo padrão de
  // eventos.tsx): F5 não perde o estado e o link filtrado é compartilhável.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [eventFilter, setEventFilter] = useState<string[]>(
    () => urlParams.get("evento")?.split(",").filter(Boolean) ?? [],
  );
  const [actionFilter, setActionFilter] = useState<string[]>(
    // `item_approved` foi fundido em `item_released` (eram o mesmo conceito em
    // grupos diferentes) — links antigos continuam valendo.
    () => (urlParams.get("acao")?.split(",").filter(Boolean) ?? [])
      .map(v => (v === "item_approved" ? "item_released" : v)),
  );
  const [authorFilter, setAuthorFilter] = useState<string[]>(
    () => urlParams.get("autor")?.split(",").filter(Boolean) ?? [],
  );
  const [period, setPeriod] = useState<string>(() => {
    const p = urlParams.get("periodo") ?? "all";
    return PERIODS.some(x => x.value === p) ? p : "all";
  });
  const [searchFilter, setSearchFilter] = useState(() => urlParams.get("busca") ?? "");
  const [pageSize, setPageSize] = useState(() => {
    const n = parseInt(urlParams.get("tam") ?? "", 10);
    return PAGE_SIZES.includes(n) ? n : 25;
  });
  // Página também vem da URL: F5 na página 7 voltava para a 1.
  const [page, setPage] = useState(() => {
    const n = parseInt(urlParams.get("pagina") ?? "", 10);
    return Number.isFinite(n) && n >= 1 ? n : 1;
  });

  const [detail, setDetail] = useState<TimelineEvent | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // Gaveta de filtros do celular. Fechada por padrão: em 375px, quatro caixas
  // permanentes empurrariam a primeira linha da trilha para fora da tela — e a
  // faixa fixa (sticky) levaria essa altura junto durante toda a rolagem.
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [buscaFocada, setBuscaFocada] = useState(false);

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

  const eventsQ = useQuery<any[]>({ queryKey: ["/api/events"] });
  const itemsQ  = useQuery<any[]>({ queryKey: ["/api/items"] });
  // Chave em DUAS partes (mesmo padrão de solicitacao.tsx): o payload precisa
  // do ?withTotal=1 para a tela saber que a trilha está truncada nos 500 mais
  // recentes, mas `invalidateQueries(["/api/audit-logs"])` casa por ELEMENTO do
  // array — com a querystring colada na primeira posição, nenhuma das
  // invalidações do app (nem a do WebSocket) alcançaria este cache.
  const logsQ = useQuery<{ logs: any[]; total: number }>({
    queryKey: ["/api/audit-logs", "?withTotal=1"],
  });

  // VAZIO (constante de módulo) e não `?? []`: um literal novo a cada render
  // trocaria a identidade das dependências do useMemo, `sorted` seria
  // recalculado sempre e o ajuste de estado feito no render abaixo entraria em
  // laço infinito ("Too many re-renders").
  const events = eventsQ.data ?? VAZIO;
  const items = itemsQ.data ?? VAZIO;
  const auditLogs = logsQ.data?.logs ?? VAZIO;
  const logsTotal = logsQ.data?.total ?? auditLogs.length;
  const isTruncated = logsTotal > auditLogs.length;

  // Gate sobre as TRÊS queries. /api/items é a mais pesada e costuma terminar
  // por último: quando só os logs chegavam, a timeline era montada com
  // `items=[]` e a tela exibia uma trilha visivelmente errada por um instante
  // ("Evento desconhecido" em tudo, sem ID, sem navegação, total dançando).
  const isLoading = eventsQ.isLoading || itemsQ.isLoading || logsQ.isLoading;
  const isFetching = eventsQ.isFetching || itemsQ.isFetching || logsQ.isFetching;

  // Qualquer uma das 3 fontes falhando deixa a timeline incompleta de um jeito
  // silencioso (ex.: tudo vira "Evento desconhecido") — melhor avisar e
  // oferecer nova tentativa do que exibir um histórico pela metade.
  const isError = eventsQ.isError || itemsQ.isError || logsQ.isError;

  const sorted = useMemo(
    () => buildTimeline(events, items, auditLogs),
    [events, items, auditLogs],
  );

  /* ── Atualização em segundo plano sem reordenar sob o dedo ──────────────
     A lista é cronológica desc: agora que o WebSocket invalida a trilha, ela se
     reconstruiria sozinha e o conteúdo escorregaria enquanto o usuário lê. A
     lista EXIBIDA fica no último estado adotado e a novidade vira uma pill — o
     usuário decide quando incorporar.

     O ajuste é feito durante o RENDER (padrão "derivar estado de props"), não
     num efeito: num efeito, a lista nova chegaria a ser pintada por um frame
     antes de o congelamento reverter para a antiga — um pisca-pisca pior que o
     problema que se quer resolver.

     Quando nada NOVO entrou (só saiu registro, ou só mudou texto), adota em
     silêncio: sem linha nova no topo não há reordenação sob o dedo. */
  const [displayed, setDisplayed] = useState<TimelineEvent[]>(sorted);
  const [lastSorted, setLastSorted] = useState(sorted);
  const adoptNextRef = useRef(false);
  // As três fontes chegam em tempos diferentes, e a mais pesada (/api/items,
  // que traz os logs) costuma ser a última. Sem esta trava o congelamento
  // valia JÁ NA ABERTURA: a tela adotava as poucas linhas sintéticas dos
  // eventos, os 445 registros de verdade chegavam depois e viravam "novidade"
  // — o usuário abria o Histórico com a trilha quase vazia e uma pílula
  // pedindo para atualizar o que ele nem tinha visto ainda. Congelar só faz
  // sentido depois que existe uma leitura em curso para proteger.
  const primeiraCargaCompletaRef = useRef(false);
  if (sorted !== lastSorted) {
    setLastSorted(sorted);
    const shown = new Set(displayed.map(e => e.id));
    const aindaMontando = !primeiraCargaCompletaRef.current;
    if (adoptNextRef.current || aindaMontando || displayed.length === 0 || !sorted.some(e => !shown.has(e.id))) {
      adoptNextRef.current = false;
      setDisplayed(sorted);
    }
  }
  if (!isLoading) primeiraCargaCompletaRef.current = true;

  const pendingCount = useMemo(() => {
    if (displayed === sorted) return 0;
    const shown = new Set(displayed.map(e => e.id));
    return sorted.filter(e => !shown.has(e.id)).length;
  }, [displayed, sorted]);

  const adotarNovidades = useCallback(() => {
    setDisplayed(sorted);
    setPage(1);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [sorted]);

  const atualizar = useCallback(() => {
    adoptNextRef.current = true;
    setDisplayed(sorted);
    eventsQ.refetch(); itemsQ.refetch(); logsQ.refetch();
  }, [sorted, eventsQ, itemsQ, logsQ]);

  // "Atualizado há X" precisa reescrever sozinho; sem o tick ele congelava em
  // "há menos de um minuto" pelo resto da sessão.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick(n => n + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  /* ── Filtros — memoizados à parte: mudar filtro não reconstrói a timeline ── */
  const filtered = useMemo(() => {
    let list = displayed;
    const cut = cutoff(period);
    if (cut) list = list.filter(e => e.timestamp >= cut);
    if (eventFilter.length > 0) list = list.filter(e => eventFilter.includes(e.eventId));
    if (actionFilter.length > 0) list = list.filter(e => actionFilter.includes(e.type));
    if (authorFilter.length > 0) {
      list = list.filter(e => authorFilter.includes(e.userName || SEM_AUTOR));
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      // searchBlob cobre também o `logDetails` — que é o texto RENDERIZADO nas
      // linhas de aprovação/reprovação. O usuário lia "Patrocinador Ambev
      // reprovou…", digitava "Ambev" e recebia "Nenhuma atividade encontrada".
      list = list.filter(e => e.searchBlob.includes(q));
    }
    return list;
  }, [displayed, period, eventFilter, actionFilter, authorFilter, searchFilter]);

  // Dois contadores, de propósito. `recorteCount` conta só as quatro dimensões
  // que vivem nos dropdowns — é o número do botão "Filtros" do celular, que
  // abre exatamente esses quatro. `activeFilterCount` soma também a busca, que
  // fica fora da gaveta: é o número de "Limpar tudo", e limpar tudo tem de
  // limpar a busca também.
  const recorteCount =
    (eventFilter.length > 0 ? 1 : 0) +
    (actionFilter.length > 0 ? 1 : 0) +
    (authorFilter.length > 0 ? 1 : 0) +
    (period !== "all" ? 1 : 0);
  const activeFilterCount = recorteCount + (searchFilter.trim() ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;
  const clearFilters = () => {
    setEventFilter([]); setActionFilter([]); setAuthorFilter([]);
    setPeriod("all"); setSearchFilter(""); setPage(1);
  };

  /* ── Opções de filtro derivadas dos DADOS (com contagem) ──
     A lista de 24 ações era literal: "Reaprov. corrigido" aparecia mesmo que
     nunca tivesse existido e levava a zero resultados. */
  const actionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    displayed.forEach(e => counts.set(e.type, (counts.get(e.type) ?? 0) + 1));
    const opts = Array.from(counts.entries()).map(([type, count]) => {
      const cfg = TYPE_CONFIG[type] ?? DEFAULT_CFG;
      return {
        value: type, label: cfg.filterLabel, count,
        group: PHASE_LABEL[cfg.phase], pinned: true,
        _order: PHASE_ORDER.indexOf(cfg.phase),
      };
    });
    // Ordena por fase para o agrupamento do FilterSelect sair na ordem do fluxo.
    opts.sort((a, b) => a._order - b._order || b.count - a.count);
    return opts.map(({ _order, ...o }) => o);
  }, [displayed]);

  const eventOptions = useMemo(() => {
    const counts = new Map<string, number>();
    displayed.forEach(e => {
      if (e.eventId) counts.set(e.eventId, (counts.get(e.eventId) ?? 0) + 1);
    });
    return events.map((ev: any) => ({ value: ev.id, label: ev.name, count: counts.get(ev.id) ?? 0 }));
  }, [events, displayed]);

  const authorOptions = useMemo(() => {
    const counts = new Map<string, number>();
    displayed.forEach(e => {
      const k = e.userName || SEM_AUTOR;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value, count,
        label: value === SEM_AUTOR ? "Sem autor registrado" : value,
      }))
      .sort((a, b) => b.count - a.count);
  }, [displayed]);

  /* ── Métricas-atalho ── */
  const metrics = useMemo(() => {
    const hoje = startOfDay(new Date());
    const sete = subDays(new Date(), 7);
    return {
      hoje: displayed.filter(e => e.timestamp >= hoje).length,
      sete: displayed.filter(e => e.timestamp >= sete).length,
      excecoes: displayed.filter(e => EXCECAO_TYPES.includes(e.type)).length,
    };
  }, [displayed]);

  // O atalho de exceções só se declara ativo quando o filtro de Ação é
  // EXATAMENTE o conjunto que ele aplica: comparar por tamanho + pertinência
  // evita acender a pílula quando o usuário montou à mão uma seleção parecida.
  const excecoesAtivas =
    actionFilter.length === EXCECAO_TYPES.length &&
    EXCECAO_TYPES.every(t => actionFilter.includes(t));

  const atalhos = [
    { key: "hoje", testId: "chip-hoje", label: "Hoje", count: metrics.hoje, tom: "azul" as const,
      ativo: period === "hoje",
      onClick: () => { setPeriod(period === "hoje" ? "all" : "hoje"); setPage(1); } },
    { key: "7d", testId: "chip-7d", label: "Últimos 7 dias", count: metrics.sete, tom: "roxo" as const,
      ativo: period === "7d",
      onClick: () => { setPeriod(period === "7d" ? "all" : "7d"); setPage(1); } },
    { key: "exc", testId: "chip-exc", label: "Exclusões e reprovações", count: metrics.excecoes, tom: "vermelho" as const,
      ativo: excecoesAtivas,
      onClick: () => { setActionFilter(excecoesAtivas ? [] : EXCECAO_TYPES); setPage(1); } },
  ];

  /** Registro mais antigo carregado — é até onde o usuário pode confiar. */
  const oldestLoaded = useMemo(() => {
    let min: number | null = null;
    auditLogs.forEach((l: any) => {
      const t = new Date(l.createdAt ?? l.created_at).getTime();
      if (Number.isFinite(t) && (min === null || t < min)) min = t;
    });
    return min === null ? null : new Date(min);
  }, [auditLogs]);

  /* ── Pagination ── */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Sincroniza o estado com o total: quando um filtro encolhe a lista, `page`
  // ficava além de totalPages e o "próxima" parecia quebrado (o disabled era
  // calculado sobre safePage, mas o clique somava sobre o page inflado).
  // O guard de isLoading protege o ?pagina= da URL: durante o carregamento
  // totalPages ainda é 1 e o clamp descartaria a página restaurada.
  useEffect(() => {
    if (isLoading) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, isLoading]);
  const safePage  = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const goToPage = (p: number) => {
    setPage(p);
    // Trocar de página mantinha a rolagem no rodapé: o usuário avançava e
    // continuava vendo o FIM da lista nova.
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filtros e página espelhados na URL. replaceState (nunca pushState: no
  // Safari o histórico do navegador enche e o "voltar" deixa de sair da tela)
  // + debounce de 250ms, porque digitar na busca escrevia uma entrada por
  // tecla. E o guard de isLoading, que existia só no efeito do clamp: sem ele
  // um F5 durante o carregamento apagava o ?pagina= (safePage vale 1 até os
  // dados chegarem). + hash: replaceState sem #... apagava o fragmento.
  useEffect(() => {
    if (isLoading) return;
    const t = window.setTimeout(() => {
      const p = new URLSearchParams();
      if (searchFilter) p.set("busca", searchFilter);
      if (actionFilter.length) p.set("acao", actionFilter.join(","));
      if (eventFilter.length) p.set("evento", eventFilter.join(","));
      if (authorFilter.length) p.set("autor", authorFilter.join(","));
      if (period !== "all") p.set("periodo", period);
      if (pageSize !== 25) p.set("tam", String(pageSize));
      if (safePage > 1) p.set("pagina", String(safePage));
      const qs = p.toString();
      window.history.replaceState(null, "", (qs ? `?${qs}` : window.location.pathname) + window.location.hash);
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchFilter, actionFilter, eventFilter, authorFilter, period, pageSize, safePage, isLoading]);

  const handleFilterChange = (setter: (v: string[]) => void) => (v: string[]) => {
    setter(v);
    setPage(1);
  };

  /* Janela de 5 páginas, com salto para primeira/última nas pontas. */
  const pageWindow: number[] = [];
  const start = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const end   = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i++) pageWindow.push(i);

  const nav: Nav = useMemo(() => ({
    goEvent: (eventId: string) => setLocation(`/eventos/${eventId}`),
    // O registro fala de uma PEÇA e a tela tem o itemId em mãos; o
    // event-detail já suporta deep-link ?item= (o sino usa). Antes o usuário
    // caía na lista do evento e caçava a peça entre dezenas.
    goItem: (eventId: string, itemId: string) => setLocation(`/eventos/${eventId}?item=${itemId}`),
  }), [setLocation]);

  const copiar = (texto: string, chave: string) => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopied(chave);
      window.setTimeout(() => setCopied(cur => (cur === chave ? null : cur)), 1500);
    });
  };

  /* ── Exportar CSV do resultado filtrado ──
     A tela irmã (/logs-sistema) já exporta, mas é admin-only — justamente os
     perfis que mais precisam prestar contas não tinham como levar a trilha
     para uma reunião. O aviso de truncamento vai DENTRO do arquivo: sem ele um
     CSV parcial passa por completo em qualquer análise posterior. */
  const exportarCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const aviso = isTruncated
      ? [[`AVISO: trilha parcial — esta consulta carregou os ${auditLogs.length} registros mais recentes de ${logsTotal} no sistema${oldestLoaded ? ` (a partir de ${format(oldestLoaded, "dd/MM/yyyy HH:mm", { locale: ptBR })})` : ""}`]]
      : [];
    const header = ["Data/Hora", "Tipo", "Descrição", "Peça", "Evento", "Realizado por"];
    const rows = filtered.map(e => [
      format(e.timestamp, "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      cfgFor(e.type).label,
      e.logDetails ?? cfgFor(e.type).label,
      e.itemDisplayId ?? "",
      e.eventName,
      e.userName ?? "—",
    ]);
    const csv = [...aviso, header, ...rows]
      .map(r => r.map(c => esc(String(c))).join(";"))
      .join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `historico-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* ── Separadores de dia ──
     A coluna de data gastava uma linha inteira com o ano, idêntico em 25 linhas
     seguidas, e não havia âncora temporal ao rolar. O ano passa a viver no
     separador e a célula fica só com a hora. */
  const grupos = useMemo(() => {
    // `offset` mantém o data-testid `timeline-event-N` contínuo na página
    // inteira — reiniciar a contagem a cada dia criaria ids repetidos.
    const out: { chave: string; rotulo: string; offset: number; itens: TimelineEvent[] }[] = [];
    pageItems.forEach((e, i) => {
      const chave = format(e.timestamp, "yyyy-MM-dd");
      const ultimo = out[out.length - 1];
      if (ultimo && ultimo.chave === chave) { ultimo.itens.push(e); return; }
      const rotulo = isToday(e.timestamp)
        ? "Hoje"
        : isYesterday(e.timestamp)
          ? "Ontem"
          : format(e.timestamp, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
      out.push({ chave, rotulo, offset: i, itens: [e] });
    });
    return out;
  }, [pageItems]);

  // Altura da faixa fixa medida em tempo real: é o `top` dos separadores de dia,
  // que precisam parar logo abaixo dela em vez de sumir por trás.
  useEffect(() => {
    const el = stickyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setStickyH(el.offsetHeight));
    ro.observe(el);
    setStickyH(el.offsetHeight);
    return () => ro.disconnect();
  }, [isMobile, isCompact]);

  /* ── Estilos compartilhados ── */
  // Só minWidth: o FilterSelect faz `...triggerStyle` na ÚLTIMA linha do
  // pillTrigger, então passar backgroundColor/border/color/fontWeight aqui
  // sobrescrevia exatamente os quatro valores que ele calcula em função de
  // `isActive` — com um filtro aplicado, a faixa não mostrava nada de ativo e
  // o usuário lia "não tem registro" causado por um filtro esquecido.
  //
  // E o minWidth some no celular: com 168px fixos, dois gatilhos não cabiam
  // lado a lado em 375px e a faixa virava uma coluna de caixas gigantes. Sem
  // ele, cada gatilho ocupa só o seu texto.
  const selectStyle: React.CSSProperties | undefined = isMobile ? undefined : { minWidth: 168 };

  const headerBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 7,
    height: 38, padding: "0 16px",
    backgroundColor: P.surface, color: P.second,
    border: `1px solid ${P.border}`, borderRadius: 8,
    fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
    cursor: "pointer",
  };

  const subtitulo = oldestLoaded
    ? `Ações registradas em eventos e peças · trilha a partir de ${format(oldestLoaded, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}`
    : "Ações registradas em eventos e peças";

  /* ── Peças da faixa de filtros ─────────────────────────────────────────────
     Montadas aqui em vez de dentro do JSX porque desktop e celular as arrumam
     em ordens diferentes: duplicar os quatro <FilterSelect> nos dois ramos era
     garantir que um dia só um dos dois receberia a próxima correção. */

  // A busca deixa de mandar na faixa: 320px de teto no desktop (era ~760, quase
  // metade dela) e vai para o FIM da linha, depois do recorte.
  const campoBusca = (
    <div style={{
      position: "relative",
      ...(isMobile
        ? { flex: "1 1 auto", minWidth: 0 }
        : { flex: "1 1 240px", minWidth: 200, maxWidth: 320, marginLeft: "auto" }),
    }}>
      <Search aria-hidden="true" style={{
        position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
        width: 14, height: 14, color: P.label, pointerEvents: "none",
      }} />
      <input
        placeholder="Buscar por peça, evento, pessoa ou descrição…"
        aria-label="Buscar no histórico"
        ref={searchRef}
        value={searchFilter}
        onChange={e => { setSearchFilter(e.target.value); setPage(1); }}
        onFocus={() => setBuscaFocada(true)}
        onBlur={() => setBuscaFocada(false)}
        data-testid="input-search-filter"
        style={{
          width: "100%", height: isMobile ? 44 : 36,
          paddingLeft: 34, paddingRight: searchFilter ? 34 : 12,
          backgroundColor: "#ffffff",
          // O foco tinha de ser visível também aqui, e não era: só a borda
          // cinza padrão, idêntica ao estado normal.
          border: `1px solid ${buscaFocada ? "#c2410c" : P.border}`,
          boxShadow: buscaFocada ? "0 0 0 3px rgba(194,65,12,0.14)" : "none",
          borderRadius: 8, outline: "none",
          fontSize: 13, color: P.text, boxSizing: "border-box",
        }}
      />
      {searchFilter && (
        <button
          type="button"
          onClick={() => { setSearchFilter(""); setPage(1); searchRef.current?.focus(); }}
          aria-label="Limpar a busca"
          title="Limpar a busca"
          data-testid="button-clear-search"
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            width: 24, height: 24, borderRadius: 6, border: "none", background: "none",
            cursor: "pointer", color: P.second,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <X aria-hidden="true" style={{ width: 13, height: 13 }} />
        </button>
      )}
    </div>
  );

  // Cada filtro leva o ícone da sua DIMENSÃO: quando o rótulo vira "3 ações" ou
  // "Últimos 7 dias", é o ícone que continua dizendo de que campo se trata.
  // Rótulos de "todos" padronizados em minúscula — "Todos os Eventos" era o
  // único com maiúscula no meio da frase, contra "todas as ações" e
  // "todas as pessoas". Por isso o filtro de evento também virou FilterSelect:
  // o componente antigo trazia a maiúscula embutida e não recebe o selo de
  // ativo nem o ícone, e seria a única caixa fora do idioma da faixa.
  const camposDeRecorte = (
    <>
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Período" allLabel="Todo o período"
        icon={Clock} activeAppearance="solid"
        value={period}
        onChange={v => { setPeriod(v === "all" ? "all" : v); setPage(1); }}
        options={PERIODS.filter(p => p.value !== "all").map(p => ({ value: p.value, label: p.label, pinned: true }))}
        emptyText="Nenhum período."
        // Três opções fixas: buscar entre elas não é uma tarefa que exista.
        hideSearch
        testId="select-period-filter"
        fullWidth={isMobile}
        panelWidth={isMobile ? undefined : 230}
        triggerStyle={isMobile ? undefined : { minWidth: 158 }}
      />

      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Ação" allLabel="Todas as ações"
        icon={Activity} activeAppearance="solid"
        unitLabel={{ one: "ação", many: "ações" }}
        values={actionFilter} onValuesChange={handleFilterChange(setActionFilter)}
        options={actionOptions}
        searchPlaceholder="Buscar ação…" emptyText="Nenhuma ação encontrada."
        testId="select-action-filter"
        fullWidth={isMobile}
        // 24 ações agrupadas por fase, cada uma com contagem: em 280px o rótulo
        // longo ("Reaprov. corrigidos") batia no selo do número.
        panelWidth={isMobile ? undefined : 320}
        triggerStyle={selectStyle}
      />

      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Evento" allLabel="Todos os eventos"
        icon={Calendar} activeAppearance="solid"
        unitLabel={{ one: "evento", many: "eventos" }}
        values={eventFilter} onValuesChange={handleFilterChange(setEventFilter)}
        options={eventOptions}
        searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
        testId="select-event-filter"
        fullWidth={isMobile}
        panelWidth={isMobile ? undefined : 320}
        triggerStyle={selectStyle}
      />

      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Pessoa" allLabel="Todas as pessoas"
        icon={Users} activeAppearance="solid"
        unitLabel={{ one: "pessoa", many: "pessoas" }}
        values={authorFilter} onValuesChange={handleFilterChange(setAuthorFilter)}
        options={authorOptions}
        searchPlaceholder="Buscar pessoa…" emptyText="Nenhuma pessoa encontrada."
        testId="select-author-filter"
        fullWidth={isMobile}
        panelWidth={isMobile ? undefined : 300}
        triggerStyle={selectStyle}
        // Último filtro da faixa: ancorado à esquerda, o menu nascia além da
        // borda direita da janela e ficava cortado.
        dropdownAlign="right"
      />
    </>
  );

  // Gaveta do celular. O contador vai no próprio botão para que o estado
  // "tenho filtro ligado" sobreviva com a gaveta fechada — sem ele, um recorte
  // esquecido explicaria uma lista vazia sem nada na tela dizendo isso.
  const botaoFiltros = (
    <button
      type="button"
      onClick={() => setFiltrosAbertos(v => !v)}
      aria-expanded={filtrosAbertos}
      aria-label={recorteCount > 0 ? `Filtros — ${recorteCount} ativo${recorteCount === 1 ? "" : "s"}` : "Filtros"}
      data-testid="button-toggle-filtros"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        height: 44, padding: "0 12px", borderRadius: 8, flexShrink: 0,
        backgroundColor: recorteCount > 0 ? "#c2410c" : "#ffffff",
        border: `1px solid ${recorteCount > 0 ? "#c2410c" : P.border}`,
        color: recorteCount > 0 ? "#ffffff" : P.text,
        fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
      }}
    >
      <SlidersHorizontal aria-hidden="true" style={{ width: 14, height: 14 }} />
      Filtros
      {recorteCount > 0 && (
        <span style={{
          fontSize: 11, fontWeight: 800, padding: "1px 7px", borderRadius: 99,
          backgroundColor: "#ffffff", color: "#c2410c",
        }}>
          {recorteCount}
        </span>
      )}
      <ChevronDown aria-hidden="true" style={{
        width: 13, height: 13, transition: "transform 0.2s",
        transform: filtrosAbertos ? "rotate(180deg)" : "rotate(0deg)",
      }} />
    </button>
  );

  // O resultado é TEXTO, sem moldura: é a resposta da consulta, não um controle.
  // Diz de uma vez as três coisas que o usuário precisa saber sem clicar em
  // nada — quantos filtros estão ativos, quanto eles cortaram, e como desfazer.
  // "Limpar tudo" fica sempre desenhado (desabilitado quando não há o que
  // limpar): antes só existia dentro do estado vazio, ou seja, aparecia
  // exatamente quando já não havia mais nada para ver.
  //
  // Contrastes (12px/10px, exigem 4,5:1), sobre a faixa #f3f4f3:
  //   #746e69 / #f3f4f3 = 4,57:1 ✓   #1c1917 / #f3f4f3 = 15,29:1 ✓
  //   "Limpar tudo" ligado  #b91c1c / #fef2f2 = 5,91:1 ✓
  //   "Limpar tudo" apagado #57534e / #f3f4f3 = 6,92:1 ✓
  const linhaDeResumo = (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      ...(isMobile ? { width: "100%" } : { marginLeft: "auto" }), flexShrink: 0,
    }}>
      <span
        aria-live="polite"
        data-testid="text-resumo-filtros"
        style={{ fontSize: 12, color: P.second, fontWeight: 600, whiteSpace: "nowrap" }}
      >
        {hasActiveFilters ? (
          <>
            {activeFilterCount} filtro{activeFilterCount === 1 ? "" : "s"} ativo{activeFilterCount === 1 ? "" : "s"}
            {" · "}
            <strong style={{ color: P.text, fontFamily: "'DM Mono', monospace" }}>{filtered.length}</strong>
            {" de "}
            <span style={{ fontFamily: "'DM Mono', monospace" }}>{displayed.length}</span>
          </>
        ) : (
          <>
            <strong style={{ color: P.text, fontFamily: "'DM Mono', monospace" }}>{filtered.length}</strong>
            {" resultado"}{filtered.length === 1 ? "" : "s"}
          </>
        )}
      </span>

      <button
        type="button"
        onClick={clearFilters}
        disabled={!hasActiveFilters}
        data-testid="button-clear-filters-bar"
        title={hasActiveFilters ? "Remover todos os filtros e a busca" : "Não há filtro aplicado"}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          height: isMobile ? 34 : 28, padding: "0 10px", borderRadius: 7,
          marginLeft: isMobile ? "auto" : 0,
          backgroundColor: hasActiveFilters ? "#fef2f2" : "transparent",
          border: `1px solid ${hasActiveFilters ? "#fecaca" : P.border}`,
          color: hasActiveFilters ? "#b91c1c" : "#57534e",
          fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
          cursor: hasActiveFilters ? "pointer" : "default",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        <X aria-hidden="true" style={{ width: 11, height: 11 }} />
        Limpar tudo
      </button>
    </div>
  );

  return (
    <div
      ref={scrollRef}
      style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 14px 32px" : "28px 28px 48px" }}
    >

      {/* ── Header ── */}
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        gap: 16, flexWrap: "wrap", marginBottom: 20,
      }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{
            fontSize: 26, fontWeight: 900, color: P.text, margin: "0 0 6px",
            letterSpacing: "-0.04em", textTransform: "uppercase",
            fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1,
          }}>
            Histórico de Atividades
          </h1>
          <p style={{ fontSize: 13, color: P.second, margin: 0, fontWeight: 500 }}>
            {subtitulo}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {logsQ.dataUpdatedAt > 0 && (
            <span style={{ fontSize: 11, color: P.second, fontWeight: 600 }}>
              Atualizado {formatDistanceToNow(new Date(logsQ.dataUpdatedAt), { locale: ptBR, addSuffix: true })}
            </span>
          )}
          <button onClick={atualizar} disabled={isFetching} data-testid="button-refresh-historico"
            aria-label="Atualizar o histórico"
            style={{ ...headerBtn, cursor: isFetching ? "default" : "pointer", opacity: isFetching ? 0.7 : 1 }}>
            <RotateCcw aria-hidden="true" className={isFetching ? "animate-spin" : undefined} style={{ width: 13, height: 13 }} />
            {isFetching ? "Atualizando…" : "Atualizar"}
          </button>
          <button onClick={exportarCsv} disabled={filtered.length === 0} data-testid="button-export-historico"
            style={{ ...headerBtn, cursor: filtered.length === 0 ? "not-allowed" : "pointer", opacity: filtered.length === 0 ? 0.6 : 1 }}>
            <Download aria-hidden="true" style={{ width: 13, height: 13 }} />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* ── Faixa de confiança da trilha ──
          O teto de 500 do servidor era invisível e o rodapé chamava tudo de
          "registros": paginando para trás sobravam só criações e entregas, sem
          que nada na tela dissesse que o resto simplesmente não foi consultado. */}
      {isTruncated && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "10px 14px", marginBottom: 16,
          backgroundColor: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8,
          fontSize: 12, color: "#b45309", fontWeight: 600, lineHeight: 1.5,
        }}>
          <Clock aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} />
          <span>
            Trilha completa a partir de{" "}
            {oldestLoaded ? format(oldestLoaded, "d 'de' MMMM 'de' yyyy", { locale: ptBR }) : "—"}.
            {" "}Registros anteriores não estão nesta consulta ({logsTotal.toLocaleString("pt-BR")} no total).
          </span>
        </div>
      )}

      {/* ── Card ──
          Sem `overflow: hidden`: ele criava um scrollport próprio e desligava o
          `position: sticky` da faixa de filtros e do cabeçalho de colunas. Os
          cantos arredondados passam a ser dos filhos das pontas. */}
      <div style={{ backgroundColor: P.surface, border: `1px solid ${P.border}`, borderRadius: 12 }}>

        <div ref={stickyRef} style={{ position: "sticky", top: 0, zIndex: 6, borderRadius: "12px 12px 0 0" }}>
          {/* ── Faixa de filtros ──────────────────────────────────────────────
              Três coisas de naturezas diferentes dividiam a mesma roupa: atalho,
              filtro e resultado. Agora cada uma tem a sua, e a ordem de leitura
              conta a história certa.

              LINHA 1 — o RECORTE primeiro, a busca depois. O campo de texto
              ocupava quase metade da faixa (uns 760px) sendo o controle mais
              genérico que existe, enquanto os quatro filtros — que são o recorte
              de verdade — se espremiam na direita. Invertido: os quatro abrem a
              linha, a busca fecha, presa a 320px. A folga entre os dois grupos
              não é sobra, é o que os separa em "recorte" e "procura".

              LINHA 2 — atalhos (pílulas) à esquerda, resultado (texto puro) à
              direita. Some a antiga fileira de quatro ladrilhos coloridos acima
              do card: ela empatava três atalhos de filtro com um totalizador, e
              empilhava uma segunda faixa colorida na primeira dobra.

              O gatilho de cada filtro passa a dizer o RECORTE ("3 ações",
              "Últimos 7 dias") em vez do rótulo genérico, com selo de fundo
              cheio quando ativo — e o ícone da dimensão segura a identidade do
              campo mesmo depois de o texto trocar. */}
          <div style={{
            padding: isMobile ? "12px 14px" : "14px 24px",
            borderBottom: `1px solid ${P.border}`,
            backgroundColor: "#f3f4f3",
            borderRadius: "11px 11px 0 0",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {isMobile ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {campoBusca}
                {botaoFiltros}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                {camposDeRecorte}
                {campoBusca}
              </div>
            )}

            {isMobile && filtrosAbertos && (
              <div
                data-testid="painel-filtros-mobile"
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {camposDeRecorte}
              </div>
            )}

            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              ...(isMobile
                // Trilho rolável só aqui: os atalhos são botões simples, sem
                // menu suspenso. Fazer o mesmo com os quatro filtros criaria um
                // contexto de rolagem que RECORTARIA os menus deles.
                ? { overflowX: "auto" as const, paddingBottom: 2 }
                : { flexWrap: "wrap" as const, gap: 10 }),
            }}>
              {atalhos.map(a => (
                <Atalho
                  key={a.key}
                  testId={a.testId}
                  label={a.label}
                  count={a.count}
                  tom={a.tom}
                  ativo={a.ativo}
                  alto={isMobile}
                  onClick={a.onClick}
                />
              ))}
              {!isMobile && linhaDeResumo}
            </div>

            {isMobile && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {linhaDeResumo}
              </div>
            )}
          </div>

          {/* Table header — no celular/tablet as linhas viram cards empilhados,
              então o cabeçalho de colunas deixa de fazer sentido. */}
          {!isCompact && (
            <div style={{
              display: "grid", gridTemplateColumns: GRID, gap: 12,
              padding: "12px 32px",
              backgroundColor: "#f3f4f3",
              borderBottom: `1px solid ${P.border}`,
            }}>
              {["Tipo", "Ação", "Hora", "Realizado Por", ""].map((h, i) => (
                <div key={h || `col-${i}`} style={{ fontSize: 10, fontWeight: 900, color: P.label, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  {h}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rows */}
        {isLoading ? (
          <div data-testid="skeleton-historico">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                display: isCompact ? "flex" : "grid",
                flexDirection: "column", gap: 12,
                gridTemplateColumns: GRID,
                padding: isCompact ? "14px 16px" : "18px 32px", alignItems: "center",
                borderBottom: `1px solid #f0efee`,
              }}>
                <Sk w={120} h={20} r={999} />
                <Sk w="80%" h={14} />
                {!isCompact && <Sk w={58} h={14} />}
                {!isCompact && <Sk w={140} h={22} r={999} />}
                {!isCompact && <span />}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div role="alert" style={{ padding: "72px 24px", textAlign: "center" }}>
            <h3 style={{ color: "#b91c1c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar o histórico</h3>
            <p style={{ color: P.label, fontSize: 13, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={atualizar} disabled={isFetching} data-testid="button-retry-historico"
              style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: isFetching ? "default" : "pointer", opacity: isFetching ? 0.7 : 1 }}>
              {isFetching ? "Tentando…" : "Tentar novamente"}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          displayed.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "#e8e8e7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, opacity: 0.5 }}>
                <Activity aria-hidden="true" style={{ width: 32, height: 32, color: P.muted }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>
                Nenhuma atividade ainda
              </h3>
              <p style={{ fontSize: 13, color: P.second, margin: 0 }}>As ações da equipe aparecem aqui conforme acontecem</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", backgroundColor: "#e8e8e7", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, opacity: 0.5 }}>
                <Search aria-hidden="true" style={{ width: 32, height: 32, color: P.muted }} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: P.text, margin: "0 0 8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em" }}>
                Nenhuma atividade encontrada
              </h3>
              <p style={{ fontSize: 13, color: P.second, margin: "0 0 8px" }}>Nenhum registro corresponde aos filtros ativos</p>
              <p style={{ fontSize: 12, color: P.label, margin: "0 0 20px" }}>
                Ativos: {[
                  searchFilter.trim() && `busca "${searchFilter.trim()}"`,
                  period !== "all" && PERIODS.find(p => p.value === period)?.label,
                  actionFilter.length > 0 && `${actionFilter.length} ${actionFilter.length === 1 ? "ação" : "ações"}`,
                  eventFilter.length > 0 && `${eventFilter.length} ${eventFilter.length === 1 ? "evento" : "eventos"}`,
                  authorFilter.length > 0 && `${authorFilter.length} ${authorFilter.length === 1 ? "pessoa" : "pessoas"}`,
                ].filter(Boolean).join(" · ")}
              </p>
              <button onClick={clearFilters} data-testid="button-clear-filters"
                style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
                Limpar filtros
              </button>
            </div>
          )
        ) : (
          <div>
            {grupos.map(grupo => (
              <div key={grupo.chave}>
                <div style={{
                  position: "sticky", top: stickyH, zIndex: 4,
                  padding: isCompact ? "8px 16px" : "8px 32px",
                  backgroundColor: "#f9f9f8", borderBottom: `1px solid ${P.border}`,
                  borderTop: `1px solid ${P.border}`,
                  fontSize: 10, fontWeight: 900, color: P.label,
                  textTransform: "uppercase", letterSpacing: "0.12em",
                }}>
                  {grupo.rotulo}
                  <span style={{ fontWeight: 700, letterSpacing: "0.04em", marginLeft: 8, textTransform: "none" }}>
                    · {grupo.itens.length} registro{grupo.itens.length === 1 ? "" : "s"}
                  </span>
                </div>

                {grupo.itens.map((entry, idx) => (
                  <Row
                    key={entry.id}
                    entry={entry}
                    idx={grupo.offset + idx}
                    isCompact={isCompact}
                    nav={nav}
                    onOpen={() => setDetail(entry)}
                    onCopy={copiar}
                    copied={copied}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Footer pagination */}
        {!isError && !isLoading && filtered.length > 0 && (
          <div style={{
            padding: isCompact ? "14px 16px" : "14px 32px",
            backgroundColor: "#f3f4f3",
            borderTop: `1px solid ${P.border}`,
            borderRadius: "0 0 11px 11px",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 13, color: P.second }}>
              Exibindo <strong style={{ color: P.text }}>{Math.min((safePage - 1) * pageSize + 1, filtered.length)}–{Math.min(safePage * pageSize, filtered.length)}</strong> de <strong style={{ color: P.text }}>{filtered.length}</strong> resultado{filtered.length === 1 ? "" : "s"}
            </span>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <label style={{ fontSize: 12, color: P.second, display: "flex", alignItems: "center", gap: 6 }}>
                Por página
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  data-testid="select-page-size"
                  style={{
                    height: isMobile ? 44 : 30, borderRadius: 6, border: `1px solid ${P.border}`,
                    backgroundColor: "#fff", fontSize: 12, fontWeight: 700, color: P.text, padding: "0 6px",
                  }}
                >
                  {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>

              {/* Com uma página só, dois botões desabilitados e um "1" inútil
                  não informam nada — some tudo e fica só a contagem. */}
              {totalPages > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <PageBtn onClick={() => goToPage(1)} disabled={safePage === 1} testId="button-first-page" label="Primeira página" big={isMobile}>
                    <ChevronsLeft aria-hidden="true" style={{ width: 14, height: 14 }} />
                  </PageBtn>
                  {/* Prev/Next sobre safePage (não o functional p): `page` pode
                      estar inflado após um filtro encolher a lista — somar sobre
                      ele pulava páginas em relação ao que a tela exibia. */}
                  <PageBtn onClick={() => goToPage(Math.max(1, safePage - 1))} disabled={safePage === 1} testId="button-prev-page" label="Página anterior" big={isMobile}>
                    <ChevronLeft aria-hidden="true" style={{ width: 14, height: 14 }} />
                  </PageBtn>

                  {pageWindow.map(p => (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      data-testid={`button-page-${p}`}
                      aria-label={`Página ${p}`}
                      aria-current={p === safePage ? "page" : undefined}
                      style={{
                        minWidth: isMobile ? 44 : 32, height: isMobile ? 44 : 30,
                        borderRadius: 6, border: "none",
                        fontSize: 13, fontWeight: p === safePage ? 900 : 700,
                        cursor: "pointer",
                        // #c2410c: o branco sobre #f97316 ficava em 2.8:1 — a
                        // página ativa era justamente a menos legível do grupo.
                        backgroundColor: p === safePage ? "#c2410c" : "transparent",
                        color: p === safePage ? "#ffffff" : P.second,
                        transition: "all 0.12s",
                      }}
                      onMouseEnter={e => { if (p !== safePage) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e8e8e7"; }}
                      onMouseLeave={e => { if (p !== safePage) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                    >
                      {p}
                    </button>
                  ))}

                  <PageBtn onClick={() => goToPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} testId="button-next-page" label="Próxima página" big={isMobile}>
                    <ChevronRight aria-hidden="true" style={{ width: 14, height: 14 }} />
                  </PageBtn>
                  <PageBtn onClick={() => goToPage(totalPages)} disabled={safePage === totalPages} testId="button-last-page" label="Última página" big={isMobile}>
                    <ChevronsRight aria-hidden="true" style={{ width: 14, height: 14 }} />
                  </PageBtn>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Pill de novidades ──
          Sinal de que o sistema está vivo SEM mover o conteúdo: a lista só se
          reordena quando o usuário mandar. */}
      {pendingCount > 0 && (
        <button
          onClick={adotarNovidades}
          data-testid="button-novas-atividades"
          style={{
            position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
            zIndex: 40, display: "flex", alignItems: "center", gap: 8,
            height: 40, padding: "0 18px", borderRadius: 999, border: "none",
            backgroundColor: "#1c1917", color: "#ffffff",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.24)",
          }}
        >
          <ArrowUpToLine aria-hidden="true" style={{ width: 14, height: 14 }} />
          {pendingCount} nova{pendingCount === 1 ? "" : "s"} atividade{pendingCount === 1 ? "" : "s"} — atualizar
        </button>
      )}

      <DetailDialog
        entry={detail}
        onClose={() => setDetail(null)}
        nav={nav}
        onCopy={copiar}
        copied={copied}
      />
    </div>
  );
}

/* ── Skeleton block ── */
function Sk({ w, h, r = 6 }: { w: number | string; h: number; r?: number }) {
  return <div style={{ width: w, height: h, borderRadius: r, backgroundColor: "#f0efee" }} />;
}

/* ── Linha ── */
function Row({ entry, idx, isCompact, nav, onOpen, onCopy, copied }: {
  entry: TimelineEvent; idx: number; isCompact: boolean; nav: Nav;
  onOpen: () => void; onCopy: (t: string, k: string) => void; copied: string | null;
}) {
  const cfg = cfgFor(entry.type);
  const Icon = cfg.icon;
  const downRef = useRef<{ x: number; y: number } | null>(null);

  // A linha inteira abre o painel de detalhe (não navega): antes, qualquer
  // tentativa de SELECIONAR o código da peça para colar num chat disparava a
  // navegação ao soltar o botão — numa tela de auditoria, copiar um
  // identificador é a segunda ação mais frequente depois de ler.
  const onMouseDown = (e: React.MouseEvent) => { downRef.current = { x: e.clientX, y: e.clientY }; };
  const onClick = (e: React.MouseEvent) => {
    const d = downRef.current;
    downRef.current = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    if ((window.getSelection()?.toString() ?? "").length > 0) return;
    onOpen();
  };

  const pill = (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      maxWidth: "100%", padding: "4px 10px", borderRadius: 999,
      backgroundColor: cfg.bg, border: `1px solid ${cfg.border}`,
      fontSize: 10, fontWeight: 800, color: cfg.color,
      textTransform: "uppercase", letterSpacing: "0.04em",
      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    }}>
      <Icon aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );

  const detalhesBtn = (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onOpen(); }}
      aria-label={`Ver detalhes: ${cfg.label} — ${format(entry.timestamp, "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}`}
      data-testid={`button-detail-${idx}`}
      title="Ver detalhes do registro"
      style={{
        width: 30, height: 30, borderRadius: 6, border: "none", background: "none",
        cursor: "pointer", color: P.second, display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <FileText aria-hidden="true" style={{ width: 14, height: 14 }} />
    </button>
  );

  const copiarBtn = entry.itemDisplayId ? (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onCopy(entry.itemDisplayId!, entry.id); }}
      aria-label={`Copiar o código ${entry.itemDisplayId}`}
      title="Copiar o código da peça"
      style={{
        width: 26, height: 26, borderRadius: 6, border: "none", background: "none",
        cursor: "pointer", color: copied === entry.id ? "#15803d" : P.second,
        display: "inline-flex", alignItems: "center", justifyContent: "center", verticalAlign: "middle",
      }}
    >
      {copied === entry.id
        ? <Check aria-hidden="true" style={{ width: 12, height: 12 }} />
        : <Copy aria-hidden="true" style={{ width: 12, height: 12 }} />}
    </button>
  ) : null;

  if (isCompact) {
    return (
      <div
        data-testid={`timeline-event-${idx}`}
        onMouseDown={onMouseDown}
        onClick={onClick}
        style={{
          display: "flex", flexDirection: "column", gap: 8,
          padding: "14px 16px", borderBottom: `1px solid #f0efee`, cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {pill}
          {detalhesBtn}
        </div>
        <div style={{ fontSize: 13, color: P.second, lineHeight: 1.45 }}>
          {buildDescription(entry, nav)}{copiarBtn}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <TimeCell ts={entry.timestamp} inline />
          <UserAvatar name={entry.userName} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid={`timeline-event-${idx}`}
      onMouseDown={onMouseDown}
      onClick={onClick}
      style={{
        display: "grid", gridTemplateColumns: GRID, gap: 12,
        padding: "16px 32px", alignItems: "center",
        borderBottom: `1px solid #f0efee`,
        cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#f9f9f8"; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      <div style={{ minWidth: 0, overflow: "hidden" }}>{pill}</div>
      <div style={{ fontSize: 13, color: P.second, lineHeight: 1.45, minWidth: 0 }}>
        {buildDescription(entry, nav)}{copiarBtn}
      </div>
      <TimeCell ts={entry.timestamp} />
      <div style={{ minWidth: 0 }}><UserAvatar name={entry.userName} /></div>
      <div>{detalhesBtn}</div>
    </div>
  );
}

/* ── Célula de hora ──
   Sem segundos, duas ações do mesmo minuto não desempatavam — numa trilha de
   auditoria a ordem É a informação. E nas últimas 24h o que a pessoa quer saber
   é "há quanto tempo", não o horário absoluto. O ano vive no separador de dia. */
function TimeCell({ ts, inline = false }: { ts: Date; inline?: boolean }) {
  const recente = Date.now() - ts.getTime() < 24 * 60 * 60 * 1000;
  const completo = format(ts, "dd/MM/yyyy HH:mm:ss", { locale: ptBR });
  return (
    <div title={completo} style={inline ? { display: "flex", alignItems: "center", gap: 8 } : undefined}>
      <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: P.text }}>
        {format(ts, "HH:mm:ss", { locale: ptBR })}
      </div>
      {recente && (
        <div style={{ fontSize: 10, color: P.label, marginTop: inline ? 0 : 2 }}>
          {formatDistanceToNow(ts, { locale: ptBR, addSuffix: true })}
        </div>
      )}
    </div>
  );
}

/* ── Painel de detalhe do registro ──
   Clicar na linha NÃO ejeta mais o usuário: filtros, página e rolagem ficam
   onde estavam, o `details` cru fica disponível (é o que a auditoria às vezes
   exige) e a navegação vira decisão explícita, com "Abrir peça" via ?item=. */
function DetailDialog({ entry, onClose, nav, onCopy, copied }: {
  entry: TimelineEvent | null; onClose: () => void; nav: Nav;
  onCopy: (t: string, k: string) => void; copied: string | null;
}) {
  const cfg = entry ? cfgFor(entry.type) : null;
  const linha: React.CSSProperties = { display: "flex", gap: 12, fontSize: 13, lineHeight: 1.55 };
  const rotulo: React.CSSProperties = {
    width: 116, flexShrink: 0, fontSize: 10, fontWeight: 900, color: P.label,
    textTransform: "uppercase", letterSpacing: "0.1em", paddingTop: 3,
  };
  const acaoBtn: React.CSSProperties = {
    flex: 1, height: 42, borderRadius: 8, border: `1px solid ${P.border}`,
    backgroundColor: "#fff", color: P.text, fontSize: 13, fontWeight: 700, cursor: "pointer",
  };

  return (
    <Dialog open={!!entry} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(560)}>
        <DialogTitle className="sr-only">Detalhe do registro do histórico</DialogTitle>
        <DialogDescription className="sr-only">
          Tipo, descrição completa, texto bruto do registro, autor e data. Permite abrir o evento ou a peça.
        </DialogDescription>

        {entry && cfg && (
          <>
            <ModalHeader
              variant="work"
              icon={cfg.icon}
              tint={cfg.color}
              title={cfg.label}
              subtitle={format(entry.timestamp, "dd/MM/yyyy 'às' HH:mm:ss", { locale: ptBR })}
              onClose={onClose}
            />

            <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "56vh", overflowY: "auto" }}>
              <div style={linha}>
                <span style={rotulo}>O que houve</span>
                <span style={{ color: P.second, minWidth: 0 }}>{buildDescription(entry, nav)}</span>
              </div>

              {entry.itemDisplayId && (
                <div style={linha}>
                  <span style={rotulo}>Peça</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <code style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: P.text }}>
                      {entry.itemDisplayId}
                    </code>
                    <button
                      type="button"
                      onClick={() => onCopy(entry.itemDisplayId!, `dlg-${entry.id}`)}
                      aria-label={`Copiar o código ${entry.itemDisplayId}`}
                      style={{ border: "none", background: "none", cursor: "pointer", padding: 2, display: "flex", color: copied === `dlg-${entry.id}` ? "#15803d" : P.second }}
                    >
                      {copied === `dlg-${entry.id}`
                        ? <Check aria-hidden="true" style={{ width: 13, height: 13 }} />
                        : <Copy aria-hidden="true" style={{ width: 13, height: 13 }} />}
                    </button>
                    {entry.itemMissing && <span style={{ fontSize: 12, color: P.label, fontStyle: "italic" }}>(peça excluída)</span>}
                  </span>
                </div>
              )}

              <div style={linha}>
                <span style={rotulo}>Evento</span>
                <span style={{ color: P.text, fontWeight: 700, minWidth: 0 }}>{entry.eventName}</span>
              </div>

              <div style={linha}>
                <span style={rotulo}>Realizado por</span>
                <span style={{ color: entry.userName ? P.text : P.label, fontWeight: 700 }}>
                  {entry.userName || "— (autor não registrado)"}
                </span>
              </div>

              {entry.logDetails && (
                <div style={{ ...linha, flexDirection: "column", gap: 6 }}>
                  <span style={{ ...rotulo, width: "auto", paddingTop: 0 }}>Registro bruto</span>
                  <pre style={{
                    margin: 0, padding: "10px 12px", backgroundColor: "#f5f5f4",
                    border: `1px solid ${P.border}`, borderRadius: 8,
                    fontFamily: "'DM Mono', monospace", fontSize: 12, color: "#44403c",
                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {entry.logDetails}
                  </pre>
                </div>
              )}
            </div>

            <ModalFooter>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  disabled={!entry.eventId}
                  onClick={() => { nav.goEvent(entry.eventId); onClose(); }}
                  data-testid="button-abrir-evento"
                  style={{ ...acaoBtn, opacity: entry.eventId ? 1 : 0.5, cursor: entry.eventId ? "pointer" : "not-allowed" }}
                >
                  Abrir evento
                </button>
                <button
                  type="button"
                  disabled={!entry.eventId || !entry.itemId || entry.itemMissing}
                  onClick={() => { nav.goItem(entry.eventId, entry.itemId!); onClose(); }}
                  data-testid="button-abrir-peca"
                  style={{
                    ...acaoBtn,
                    backgroundColor: "#1c1917", color: "#fff", border: "none",
                    opacity: entry.eventId && entry.itemId && !entry.itemMissing ? 1 : 0.5,
                    cursor: entry.eventId && entry.itemId && !entry.itemMissing ? "pointer" : "not-allowed",
                  }}
                >
                  Abrir peça
                </button>
              </div>
            </ModalFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Pagination arrow button ── */
function PageBtn({ onClick, disabled, children, testId, label, big }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode;
  testId: string; label: string; big?: boolean;
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
        width: big ? 44 : 30, height: big ? 44 : 30,
        borderRadius: 6, border: "none", cursor: disabled ? "default" : "pointer",
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
