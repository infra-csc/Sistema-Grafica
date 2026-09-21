import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset, Sponsor, Event } from "@shared/schema";
import {
  Archive, Search, Pencil, Trash2, CheckCircle2,
  XCircle, MapPin, Tag, X, Package, Warehouse, Truck, ScanSearch, Calendar, CalendarDays,
  Grid3X3, Eye, Check, Layers, ClipboardCheck, Wrench, BookmarkCheck, ChevronDown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { diaEMes, eventoJaAcabou } from "@shared/estoque";
import { miniatura } from "@/lib/miniatura";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { HIDE_NATIVE_CLOSE, FreezeWhileClosing, ModalHeader, modalSurface } from "@/components/modal-shell";
import { CONDITIONS, CONDITION_META, conditionMeta, type Condition } from "@/lib/inventory-meta";
import { MapaGalpao } from "@/components/mapa-galpao";
import { FS, R } from "@/lib/theme";

// ─── Status meta ─────────────────────────────────────────────────────────────
// Tons 700/800 (#15803d, #9a3412): os 600 reprovavam contraste AA no texto
// pequeno em caps da coluna Status.
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  NO_GALPAO:          { label: "No Galpão",   color: "#15803d", bg: "rgba(22,163,74,0.10)"  },
  EM_USO:             { label: "Em Uso",       color: "#9a3412", bg: "rgba(234,88,12,0.10)"  },
  AGUARDANDO_TRIAGEM: { label: "Ag. Triagem",  color: "#b45309", bg: "rgba(180,83,9,0.10)"   },
  EM_MANUTENCAO:      { label: "Manutenção",   color: "#92400e", bg: "rgba(146,64,14,0.10)"  },
  DESCARTADO:         { label: "Descartado",   color: "#6b7280", bg: "rgba(107,114,128,0.10)"},
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "EM_MANUTENCAO", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];
// Status que o usuário pode definir manualmente. EM_USO e AGUARDANDO_TRIAGEM
// são definidos pelo ciclo do evento (despacho/retorno) — nunca à mão.
// EM_MANUTENCAO (14/09) é manual: terminado o reparo, a Gráfica devolve a
// peça ao galpão por aqui.
const MANUAL_STATUSES: TrackingStatus[] = ["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"];

// O QUE CADA RÓTULO QUER DIZER, em uma frase. O acervo é do admin, mas quem
// cadastra ou corrige uma peça decide aqui se ela volta a ser oferecida para
// reaproveitamento — e os rótulos sozinhos não diziam isso. Texto apenas: as
// regras (quem define EM_USO/AGUARDANDO_TRIAGEM, o que é manual) seguem acima.
const SIGNIFICADO_DO_STATUS: Record<TrackingStatus, string> = {
  NO_GALPAO: "Guardada no galpão — aparece na busca do estoque para reaproveitar.",
  EM_USO: "Saiu num evento; volta para a triagem depois dele.",
  AGUARDANDO_TRIAGEM: "Voltou de um evento e espera a triagem decidir o destino.",
  EM_MANUTENCAO: "Fora do estoque disponível até o reparo terminar.",
  DESCARTADO: "Saiu do acervo; fica oculta da tabela, salvo filtrando por Descartado.",
};
const SIGNIFICADO_DA_CONDICAO: Record<Condition, string> = {
  PERFEITO: "Sem defeito — pronta para usar de novo.",
  AVARIA_LEVE: "Defeito pequeno — confira antes de reaproveitar.",
  SUCATA: "Não serve mais para evento.",
};

/** Reserva vigente (GET /api/estoque/reservas-ativas). */
type ReservaAtiva = { reservaId: string; assetId: string; itemDisplayId: string | null; eventName: string; saida: string | null };

// ─── Stat card with watermark icon ───────────────────────────────────────────
function StatCard({ label, value, Icon, color, subtext, subColor, onClick, active, compacto }: {
  label: string; value: number; Icon: React.ElementType;
  color: string; subtext: string; subColor?: string;
  onClick?: () => void; active?: boolean;
  /** Celular: três cartões por linha em ~110px — padding e número menores,
   *  sem o ícone d'água (que empurrava o número para fora do cartão). */
  compacto?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const on = active || hov;
  return (
    <div
      onClick={onClick}
      // O cartão FILTRA a tabela — era uma <div> com clique e nada mais, então
      // quem navega por teclado não chegava a nenhum dos seis atalhos.
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick && active !== undefined ? !!active : undefined}
      onKeyDown={onClick ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }) : undefined}
      style={{
        background: "#fff",
        padding: compacto ? "12px 12px 10px" : "18px 20px 16px",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        borderBottom: `3px solid ${color}`,
        boxShadow: on ? "0 4px 14px rgba(15,23,42,0.08)" : "0 1px 2px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.15s, transform 0.15s",
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: compacto ? 4 : 8,
        transform: on && !compacto ? "translateY(-1px)" : "none",
        minWidth: 0,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Label — #64748b: o #94a3b8 anterior reprovava contraste AA. Caixa
          alta com 0.18em de espaçamento gritava em seis cartões seguidos. */}
      <span style={{ fontSize: compacto ? 11 : 12, fontWeight: 600, color: "#64748b", fontFamily: "Space Grotesk, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {label}
      </span>
      {/* Value + faded icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: compacto ? 22 : 30, fontWeight: 800, color: on ? color : "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.03em", lineHeight: 1, transition: "color 0.15s", fontVariantNumeric: "tabular-nums" }}>
          {value.toLocaleString("pt-BR")}
        </p>
        {!compacto && <Icon size={28} color={color} aria-hidden="true" style={{ opacity: 0.15 }} />}
      </div>
      {/* Subtext */}
      <p style={{ margin: 0, fontSize: compacto ? 10 : 11, fontWeight: 500, fontFamily: "Plus Jakarta Sans, sans-serif", color: subColor ?? "#64748b", lineHeight: 1.3 }}>
        {subtext}
      </p>
    </div>
  );
}

// ─── Delete Modal (ui/alert-dialog — Escape, foco e backdrop pelo Radix) ─────
function DeleteModal({ asset, onClose, onConfirm, isPending }: {
  asset: InventoryAsset; onClose: () => void; onConfirm: () => void; isPending: boolean;
}) {
  return (
    <AlertDialog open onOpenChange={open => { if (!open && !isPending) onClose(); }}>
      <AlertDialogContent
        className="p-0 gap-0 border-0"
        style={{
          display: "block", padding: 0, overflow: "hidden", borderRadius: 20,
          width: "min(420px, calc(100vw - 32px))", maxWidth: "min(420px, calc(100vw - 32px))",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* #b91c1c: branco sobre #ef4444 dava 3,8:1 no título em 13px. */}
        <div style={{ background: "#b91c1c", padding: "16px 20px" }}>
          <AlertDialogTitle asChild>
            <p style={{ color: "#fff", fontWeight: 700, fontSize: 15, fontFamily: "Space Grotesk, sans-serif", margin: 0, letterSpacing: "-0.01em" }}>
              Atenção: ação irreversível
            </p>
          </AlertDialogTitle>
        </div>
        <div style={{ padding: 24 }}>
          <AlertDialogDescription asChild>
            <p style={{ fontSize: 14, color: "#1e293b", margin: "0 0 8px", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Tem certeza que deseja excluir este ativo permanentemente?
            </p>
          </AlertDialogDescription>
          <p style={{ fontSize: 12, color: "#64748b", fontFamily: "DM Mono, monospace", margin: "0 0 24px" }}>
            {asset.displayId} — {asset.name}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} disabled={isPending} data-testid="button-cancel-delete" style={{
              minHeight: 44, padding: "0 18px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#f8fafc", color: "#1e293b", fontSize: 13,
              cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.6 : 1,
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
            }}>Manter</button>
            <button onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete" style={{
              minHeight: 44, padding: "0 18px", borderRadius: 10, border: "none",
              background: isPending ? "#fca5a5" : "#b91c1c", color: "#fff", fontSize: 13,
              cursor: isPending ? "not-allowed" : "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            }}>{isPending ? "Excluindo..." : "Sim, Excluir"}</button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Asset Detail Modal (Eye button) ─────────────────────────────────────────
function AssetDetailModal({ asset, linkedItem, sponsors, onClose }: {
  asset: InventoryAsset;
  linkedItem?: any;
  sponsors: Sponsor[];
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const assetSponsors = (asset.sponsorIds ?? []).map(id => sponsors.find(s => s.id === id)).filter(Boolean) as Sponsor[];
  const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
  const cm = conditionMeta(asset.condition);
  const ts = asset.trackingStatus ?? "NO_GALPAO";

  const eventName = linkedItem?.event?.name ?? null;
  const eventDate = linkedItem?.event?.startDate ?? null;

  // Sem queryFn inline: o default do queryClient junta a queryKey com "/",
  // inclui credenciais e lança em !res.ok — o fetch().json() anterior engolia
  // erros HTTP e derrubava a tela com JSON inválido.
  const { data: allocations = [] } = useQuery<any[]>({
    queryKey: ["/api/inventory", asset.id, "allocations"],
  });
  const currentAlloc = ts === "EM_USO" ? allocations[allocations.length - 1] : null;

  const { data: assetLogs = [] } = useQuery<any[]>({
    queryKey: [`/api/audit-logs?entityType=inventory_asset&entityId=${asset.id}`],
  });
  const productionLog = assetLogs.find((l: any) => l.action === 'cadastrado');
  const triageLog = assetLogs.find((l: any) => l.action === 'triagem');

  // Timeline logic — 4 steps
  // 1. Entrada no Estoque: always done
  // 2. Em Uso no Evento: done once dispatched (todo ativo listado já passou por despacho)
  // 3. Aguardando Triagem: done when triage passed
  // 4. Situação Atual: active when on final state
  // Manutenção é destino de triagem (a triagem passou) e é a situação atual —
  // sem ela aqui a linha do tempo dizia "Triagem: Pendente · Aguardando
  // triagem" para uma peça que já foi triada e está no reparo.
  const step2Active = ts === "EM_USO";
  const step3Done   = ts === "NO_GALPAO" || ts === "DESCARTADO" || ts === "EM_MANUTENCAO";
  const step3Active = ts === "AGUARDANDO_TRIAGEM";
  const step4Active = ts === "NO_GALPAO" || ts === "DESCARTADO" || ts === "EM_MANUTENCAO";

  // Localização Técnica: where the item currently IS
  // EM_MANUTENCAO (14/09) caía no `else` e a peça em reparo aparecia como
  // "Descartado" — a pior leitura possível para quem procura a peça para usar.
  const locLabel = ts === "NO_GALPAO" ? (asset.location ?? "Galpão Central")
    : ts === "EM_USO"            ? "Em Uso (Evento)"
    : ts === "AGUARDANDO_TRIAGEM" ? "Aguardando Triagem"
    : ts === "EM_MANUTENCAO"     ? `Em manutenção${asset.location ? ` · ${asset.location}` : ""}`
    : "Descartado";

  const sidebarDot = (done: boolean, active: boolean, icon: React.ReactElement) => {
    const isFinal = done && !active;
    return (
      <div style={{
        position: "absolute", left: -21, top: 1,
        width: 20, height: 20, borderRadius: "50%",
        background: isFinal ? "#f97316" : active ? "rgba(249,115,22,0.15)" : "#1f2937",
        border: active ? "1.5px solid #f97316" : isFinal ? "none" : "1px solid #374151",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: active ? "0 0 0 4px rgba(249,115,22,0.10)" : "none",
        flexShrink: 0,
      }}>
        {isFinal ? <Check size={10} color="#fff" strokeWidth={3} /> : icon}
      </div>
    );
  };

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          // Teto de altura da casca (dvh: a barra recolhível do navegador do
          // celular não cobre o rodapé). O 90vh fixo de antes deixava o Fechar
          // atrás da barra do Safari.
          ...modalSurface(1040),
          flexDirection: isMobile ? "column" : "row",
          overflow: isMobile ? "auto" : "hidden",
          backgroundColor: "#f9f9f8",
        }}
      >
        <DialogTitle className="sr-only">{`Detalhes do ativo ${asset.displayId} — ${asset.name}`}</DialogTitle>
        <DialogDescription className="sr-only">
          Rastreabilidade, especificações técnicas e situação atual do ativo.
        </DialogDescription>

        {/* ── Sidebar ── No celular vai para DEPOIS do conteúdo (order): antes a
            linha do tempo inteira vinha primeiro e o nome da peça, a condição
            e o botão de fechar só apareciam depois de uma tela de rolagem. */}
        <aside style={{ width: isMobile ? "100%" : 264, flexShrink: 0, background: "#1c1917", display: "flex", flexDirection: "column", padding: isMobile ? "20px 16px" : "28px 22px", order: isMobile ? 2 : 0 }}>
          {/* Marca só no desktop: no celular é uma faixa a mais sem informação. */}
          {!isMobile && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 900, fontSize: 22, color: "#f9f9f8", letterSpacing: "-0.05em", lineHeight: 1 }}>NORTE</div>
            </div>
          )}

          {/* Rastreabilidade */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {/* Regra da casa: #f97316 nunca como cor de texto. Na barra escura
                a família laranja entra em #fdba74 (orange-300, ~10:1 sobre
                #1c1917) — mesmo matiz, sem o hex proibido. */}
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "#fdba74", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 18 }}>
              Rastreabilidade
            </div>
            <div style={{ position: "relative", paddingLeft: 30 }}>
              <div style={{ position: "absolute", left: 9, top: 12, bottom: 12, width: 1, background: "rgba(255,255,255,0.08)" }} />

              {/* Step 1 — Produção & Cadastro */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                {sidebarDot(true, false, <Package size={10} color="#9ca3af" />)}
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#f9f9f8" }}>
                    {linkedItem?.type ? `Produção · ${linkedItem.type}` : "Produção Gráfica"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 3, letterSpacing: "0.02em" }}>
                    {productionLog
                      ? `${productionLog.userName} · ${format(new Date(productionLog.createdAt), "dd MMM yyyy", { locale: ptBR })}`
                      : `Auto-cadastrado · ${asset.autoAdded ? "Gráfica" : "Manual"}`}
                  </div>
                </div>
              </div>

              {/* Step 2 — Entrada no Estoque */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                {sidebarDot(true, false, <Archive size={10} color="#9ca3af" />)}
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#f9f9f8" }}>Entrada no Estoque</div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 3, letterSpacing: "0.02em" }}>
                    {eventDate ? format(new Date(eventDate), "dd MMM yyyy", { locale: ptBR }) : "Cadastrado"}
                  </div>
                </div>
              </div>

              {/* Dynamic allocation steps — one per event */}
              {allocations.length > 0 ? allocations.map((alloc: any, i: number) => {
                const isLast = i === allocations.length - 1;
                const isCurrent = ts === "EM_USO" && isLast;
                const isDone = !isCurrent;
                const evDate = alloc.event?.startDate;
                return (
                  <div key={alloc.id} style={{ position: "relative", marginBottom: 28 }}>
                    {sidebarDot(isDone, isCurrent, <Truck size={10} color={isCurrent ? "#f97316" : "#9ca3af"} />)}
                    <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                      <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: isCurrent ? 700 : 600, fontSize: 12, color: isCurrent ? "#fdba74" : "#d1d5db" }}>
                        {alloc.event?.name ?? "Evento"}
                      </div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 3, letterSpacing: "0.02em" }}>
                        {evDate ? format(new Date(evDate), "dd MMM yyyy", { locale: ptBR }) : "—"} · {isCurrent ? "Em uso" : "Concluído"}
                      </div>
                    </div>
                  </div>
                );
              }) : (
                /* No allocations yet — show generic step */
                eventName && (
                  <div style={{ position: "relative", marginBottom: 28 }}>
                    {sidebarDot(!step2Active, step2Active, <Truck size={10} color={step2Active ? "#f97316" : "#9ca3af"} />)}
                    <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                      <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step2Active ? 700 : 600, fontSize: 12, color: step2Active ? "#fdba74" : "#d1d5db" }}>
                        {eventName}
                      </div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 3, letterSpacing: "0.02em" }}>
                        {eventDate ? format(new Date(eventDate), "dd MMM yyyy", { locale: ptBR }) : "—"} · {step2Active ? "Em uso" : "Concluído"}
                      </div>
                    </div>
                  </div>
                )
              )}

              {/* Triagem de Retorno */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                {sidebarDot(step3Done, step3Active, <ClipboardCheck size={10} color={step3Active ? "#f97316" : "#9ca3af"} />)}
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step3Active ? 700 : 600, fontSize: 12, color: step3Active ? "#fdba74" : step3Done ? "#d1d5db" : "#9ca3af" }}>
                    Triagem de Retorno
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 3, letterSpacing: "0.02em" }}>
                    {step3Active
                      ? "Em análise"
                      : step3Done && triageLog
                        ? `${triageLog.userName} · ${format(new Date(triageLog.createdAt), "dd MMM yyyy", { locale: ptBR })}`
                        : step3Done ? "Concluído" : "Pendente"}
                  </div>
                </div>
              </div>

              {/* Situação Atual */}
              <div style={{ position: "relative" }}>
                {sidebarDot(false, step4Active, ts === "DESCARTADO"
                  ? <Trash2 size={10} color={step4Active ? "#ef4444" : "#6b7280"} />
                  : <Warehouse size={10} color={step4Active ? "#f97316" : "#6b7280"} />
                )}
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step4Active ? 700 : 600, fontSize: 12, color: step4Active ? "#fdba74" : "#9ca3af" }}>
                    {ts === "DESCARTADO" ? "Descartado" : ts === "NO_GALPAO" ? "No Galpão" : ts === "EM_MANUTENCAO" ? "Em manutenção" : "Destino Final"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 3, letterSpacing: "0.02em" }}>
                    {step4Active ? "Estado atual" : "Aguardando triagem"}
                  </div>
                </div>
              </div>
            </div>

            {/* Sponsors */}
            {assetSponsors.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.62)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Patrocinadores</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {assetSponsors.map(s => (
                    <div key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 7px", background: "#292524", borderRadius: 4, border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Tag size={8} color="#6b7280" />
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#d1d5db", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer card — Localização Técnica */}
          <div style={{ background: "rgba(255,255,255,0.04)", padding: 14, borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", marginTop: 18, flexShrink: 0 }}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "rgba(255,255,255,0.62)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
              Localização Técnica
            </div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 14, color: "#f9f9f8", letterSpacing: "-0.02em", wordBreak: "break-word", lineHeight: 1.3 }}>
              {locLabel}
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.62)", fontFamily: "Space Grotesk, sans-serif" }}>Condição</span>
              {/* cm.border (tom 300) sobre o escuro: cm.color é o tom 700,
                  pensado para fundo CLARO — aqui dava ~3:1. */}
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: cm.border }}>
                {cm.label}
              </span>
            </div>
          </div>
          {isMobile && (
            <button type="button" onClick={onClose}
              style={{ marginTop: 16, minHeight: 44, borderRadius: 10, border: "1px solid rgba(255,255,255,0.16)", background: "rgba(255,255,255,0.06)", color: "#f9f9f8", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Fechar
            </button>
          )}
        </aside>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "#f9f9f8", maxHeight: isMobile ? undefined : "calc(100vh - 48px)", order: isMobile ? 1 : 0 }}>

          {/* Dark header */}
          <header style={{ background: "#1a1c1c", padding: isMobile ? "16px 16px 16px 20px" : "20px 28px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <span style={{ background: "#f97316", color: "#1a1c1c", fontFamily: "Space Grotesk, sans-serif", fontWeight: 900, fontSize: 9, letterSpacing: "-0.02em", padding: "3px 8px", borderRadius: 4 }}>
                  {asset.displayId}
                </span>
                {eventName && (
                  <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.07)", padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {eventName}
                  </span>
                )}
                {asset.autoAdded && (
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.62)", background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Auto-Adicionado
                  </span>
                )}
              </div>
              {/* Nome no caso original: em CAIXA ALTA com -0.05em as letras
                  encostavam e o nome da peça (que já vem em maiúsculas às
                  vezes) virava um bloco ilegível. No celular quebra linha em
                  vez de cortar — o nome é a informação principal do modal. */}
              <h1 style={{ margin: 0, color: "#ffffff", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: isMobile ? 20 : 24, letterSpacing: "-0.03em", lineHeight: 1.15, ...(isMobile ? { overflowWrap: "anywhere" as const } : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "calc(100% - 8px)" }) }}>
                {asset.name}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexDirection: isMobile ? "column-reverse" : "row", ...(isMobile ? { alignItems: "flex-end" } : {}) }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 6, background: sm.color, color: "#fff", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                <Warehouse size={13} aria-hidden="true" />{sm.label}
              </span>
              <button onClick={onClose} data-testid="button-close-asset-detail" aria-label="Fechar detalhes do ativo"
                style={{ background: "rgba(255,255,255,0.08)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.72)", width: isMobile ? 44 : 40, height: isMobile ? 44 : 40, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.15s, background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.72)"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}>
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Scrollable body */}
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: isMobile ? "visible" : "auto", padding: isMobile ? "16px 16px 0" : "28px 28px 0", display: "flex", flexDirection: "column", gap: isMobile ? 16 : 24 }}>

            {/* Condition + Notes read-only banner — quebra linha no celular:
                lado a lado a observação ficava com ~120px de largura. */}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {/* Condition chip */}
              <div style={{ flex: "1 1 180px", background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: cm.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <cm.Icon size={18} color={cm.color} />
                </div>
                <div>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, color: "#64748b" }}>Condição</div>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 14, color: cm.color, marginTop: 2 }}>{cm.label}</div>
                </div>
              </div>
              {/* Notes read-only */}
              {asset.notes && (
                <div style={{ flex: "2 1 240px", background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, color: "#64748b", marginBottom: 6 }}>Observações</div>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{asset.notes}</div>
                </div>
              )}
            </div>

            {/* Info grid — same layout as triagem-modal. Uma coluna no celular:
                as duas lado a lado em 343px espremiam "PATROCINADORES" contra
                o valor. */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>

              {/* Evento e Histórico — light card */}
              <div style={{ background: "#f3f4f3", borderRadius: 10, overflow: "hidden" }}>
                {/* EM USO banner */}
                {ts === "EM_USO" && (
                  <div style={{ background: "#c2410c", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {/* #c2410c: branco em 10px sobre #f97316 dava 2,8:1. */}
                    <Truck size={13} color="#fff" aria-hidden="true" />
                    <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, color: "#fff" }}>
                      Em uso agora
                    </span>
                    {currentAlloc?.event?.name && (
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 10, color: "rgba(255,255,255,0.85)", marginLeft: 4 }}>
                        — {currentAlloc.event.name}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ padding: "18px 22px" }}>
                  <h3 style={{ margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 13, color: "#374151" }}>
                    <Calendar size={15} color="#6b7280" />
                    {allocations.length > 0 ? "Histórico de Participações" : "Informações do Evento"}
                  </h3>

                  {/* Allocation history */}
                  {allocations.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                      {allocations.map((alloc: any, i: number) => {
                        const isCurrent = ts === "EM_USO" && i === allocations.length - 1;
                        const evName = alloc.event?.name ?? "Evento";
                        const evDate = alloc.event?.startDate;
                        return (
                          <div key={alloc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: i < allocations.length - 1 ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: isCurrent ? "#f97316" : "#9ca3af", flexShrink: 0 }} />
                              <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, fontWeight: 600, color: isCurrent ? "#c2410c" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {evName}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              {isCurrent && (
                                <span style={{ background: "#fed7aa", color: "#9a3412", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, padding: "2px 6px", borderRadius: 3 }}>
                                  Em Uso
                                </span>
                              )}
                              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#746e69" }}>
                                {evDate ? format(new Date(evDate), "dd MMM yy", { locale: ptBR }) : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Static info below history */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, color: "#746e69" }}>Qtd Total</span>
                        <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 11, color: "#1f2937" }}>{asset.quantity ?? 1} un.</span>
                      </div>
                    </div>
                  ) : (
                    /* No allocations — show static info */
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        { label: "Evento",      value: eventName ?? "—" },
                        { label: "Data",        value: eventDate ? format(new Date(eventDate), "dd MMM yyyy", { locale: ptBR }) : "—" },
                        { label: "Qtd Total",   value: `${asset.quantity ?? 1} un.` },
                        { label: "Localização", value: asset.location ?? "—" },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, color: "#746e69" }}>{label}</span>
                          <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 11, color: "#1f2937", textAlign: "right" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Especificações Técnicas — dark card */}
              <div style={{ background: "#111827", borderRadius: 10, padding: "20px 22px" }}>
                <h3 style={{ margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 13, color: "#f9fafb" }}>
                  <Layers size={15} color="#f97316" />
                  Especificações Técnicas
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "TIPO",        value: linkedItem?.type ?? "—" },
                    { label: "MATERIAL",    value: linkedItem?.material ?? "—" },
                    { label: "ACABAMENTO",  value: linkedItem?.finish ?? "—" },
                    { label: "MEDIDA",      value: linkedItem?.measurement ?? "—" },
                    { label: "DIMENSÕES",   value: linkedItem?.visualWidth && linkedItem?.visualHeight ? `${linkedItem.visualWidth} × ${linkedItem.visualHeight} m` : "—" },
                    { label: "M² TOTAL",    value: linkedItem?.calculatedM2 ? `${linkedItem.calculatedM2} m²` : "—" },
                    { label: "QUANTIDADE",  value: linkedItem?.quantity ? `${linkedItem.quantity} un.` : `${asset.quantity ?? 1} un.` },
                    { label: "PATROCINADORES", value: assetSponsors.length > 0 ? assetSponsors.map(s => s.name).join(", ") : "—" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>{label}</span>
                      <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 500, fontSize: 10, color: "#e5e7eb", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Approval thumb reference — only when URL is an image */}
            {asset.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(asset.approvalThumbUrl) || asset.approvalThumbUrl.startsWith('/objects/')) && (
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "21/9" }}>
                <img loading="lazy" decoding="async" src={miniatura(asset.approvalThumbUrl)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(0.25)", opacity: 0.85 }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(28,25,23,0.8) 0%, transparent 55%)", display: "flex", alignItems: "flex-end", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(28,25,23,0.7)", border: "2px solid #f97316", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Eye size={16} color="#f97316" />
                    </div>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, color: "#f9f9f8" }}>Arte de Referência</div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#9ca3af", marginTop: 2 }}>Arte aprovada · Montagem original</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ height: 8 }} />
          </div>

          {/* Footer */}
          {/* No celular o rodapé some: ID e origem já estão nos selos do
              cabeçalho, e com a linha do tempo DEPOIS do conteúdo o Fechar
              ficaria no meio da rolagem — ele vai para o fim do aside. */}
          {!isMobile && <footer style={{ flexShrink: 0, background: "#f3f4f3", borderTop: "1px solid #e2e8f0", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.06em" }}>ID do Ativo</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#374151", fontWeight: 500, marginTop: 1 }}>{asset.displayId}</div>
              </div>
              {asset.autoAdded && (
                <div style={{ lineHeight: 1.3, borderLeft: "1px solid #d1d5db", paddingLeft: 20 }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: "#746e69", textTransform: "uppercase", letterSpacing: "0.06em" }}>Origem</div>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12, color: "#374151", fontWeight: 600, marginTop: 1 }}>Gráfica (Auto)</div>
                </div>
              )}
            </div>
            <button onClick={onClose}
              style={{ minHeight: 40, padding: "0 16px", borderRadius: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 13, color: "#57534e", transition: "color 0.15s, background 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.color = "#111827"; e.currentTarget.style.background = "#e7e5e4"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "#57534e"; e.currentTarget.style.background = "none"; }}>
              Fechar
            </button>
          </footer>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Asset Modal ──────────────────────────────────────────────────────────────
function AssetModal({ asset, onClose, onSaved }: {
  asset: InventoryAsset | null; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const isEdit = !!asset;
  const [form, setForm] = useState(asset ? {
    name: asset.name, quantity: asset.quantity ?? 1, location: asset.location ?? "",
    condition: (asset.condition as Condition) ?? "PERFEITO",
    sponsorIds: asset.sponsorIds ?? [] as string[],
    trackingStatus: (asset.trackingStatus as TrackingStatus) ?? "NO_GALPAO",
    notes: asset.notes ?? "",
  } : { name: "", quantity: 1, location: "", condition: "PERFEITO" as Condition, sponsorIds: [] as string[], trackingStatus: "NO_GALPAO" as TrackingStatus, notes: "" });
  const [showMapa, setShowMapa] = useState(false);

  const { data: allSponsors = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });

  const toggleSponsor = (id: string) =>
    setForm(f => ({
      ...f,
      sponsorIds: f.sponsorIds.includes(id)
        ? f.sponsorIds.filter(s => s !== id)
        : [...f.sponsorIds, id],
    }));

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      isEdit ? apiRequest("PATCH", `/api/inventory/${asset!.id}`, data) : apiRequest("POST", "/api/inventory", data),
    // Toast com o NOME do ativo e erro com o motivo do servidor — "Erro ao
    // salvar." sem porquê não dizia se era campo, permissão ou conexão.
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: isEdit ? "Ativo atualizado" : "Ativo cadastrado", description: form.name.trim() }); onSaved(); },
    onError: (e: Error) => toast({ title: "Não foi possível salvar o ativo", description: e.message, variant: "destructive" }),
  });

  // Borda visível e SEM `outline: none`: o campo era um retângulo #f8fafc
  // sobre branco (1,05:1 — ninguém via onde clicar) e o outline inline anulava
  // o anel de foco global do index.css, então o teclado não mostrava onde
  // estava. 16px no celular: abaixo disso o Safari dá zoom ao focar.
  const INP: React.CSSProperties = {
    width: "100%", minHeight: 44, padding: "10px 12px", borderRadius: 8, border: "1px solid #d6d3d1",
    fontSize: isMobile ? 16 : 13, fontFamily: "Plus Jakarta Sans, sans-serif", background: "#fff",
    color: "#0f172a", boxSizing: "border-box",
  };
  const LBL: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "Space Grotesk, sans-serif",
    display: "block", marginBottom: 6,
  };

  // Status automático (EM_USO / AGUARDANDO_TRIAGEM) não pode ser trocado à
  // mão — quem o define é o ciclo do evento. Só NO_GALPAO/DESCARTADO são
  // escolhas manuais válidas.
  const lockedStatus = isEdit && !MANUAL_STATUSES.includes(form.trackingStatus);
  const saveDisabled = !form.name.trim() || mutation.isPending;

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        // Casca padrão: teto de altura com corpo rolando e rodapé fixo. Antes
        // o modal inteiro rolava (display block + overflow auto) e o botão
        // Salvar sumia embaixo junto com o formulário.
        style={modalSurface(500)}
      >
        <DialogTitle className="sr-only">{isEdit ? "Editar ativo" : "Cadastrar novo ativo"}</DialogTitle>
        <DialogDescription className="sr-only">
          Formulário de cadastro e edição de ativo do acervo.
        </DialogDescription>
        {/* Fechar vai no `trailing` (e não no onClose do ModalHeader) só para
            manter o data-testid que os testes de ponta a ponta usam. O
            subtítulo "NORTE ASSETS" em caixa alta saiu: não dizia nada. */}
        <ModalHeader
          icon={Archive}
          tint="#c2410c"
          title={isEdit ? "Editar ativo" : "Cadastrar novo ativo"}
          subtitle={isEdit ? `${asset!.displayId} · acervo do galpão` : "Entra no acervo do galpão"}
          trailing={
            <button type="button" onClick={onClose} data-testid="button-close-modal" aria-label="Fechar" title="Fechar (Esc)"
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.16)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; }}
              style={{ width: isMobile ? 44 : 40, height: isMobile ? 44 : 40, borderRadius: R.pill, flexShrink: 0, border: "1px solid rgba(255,255,255,0.12)", backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.72)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background-color 0.12s ease" }}>
              <X size={16} aria-hidden="true" />
            </button>
          }
        />
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: isMobile ? 16 : 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label htmlFor="asset-name" style={LBL}>Nome / Descrição *</label>
            <input id="asset-name" data-testid="input-asset-name" style={INP} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Banner 3×1m — Patrocinador A" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="asset-quantity" style={LBL}>Quantidade</label>
              <input id="asset-quantity" data-testid="input-asset-quantity" type="number" min={1} style={INP}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))} />
            </div>
            <div>
              <label htmlFor="asset-location" style={LBL}>Localização</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input id="asset-location" data-testid="input-asset-location" style={{ ...INP, flex: 1 }} value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder="Ex: Setor A - Corredor 3" />
                <button type="button" onClick={() => setShowMapa(true)}
                  title="Abrir mapa do galpão" aria-label="Abrir mapa do galpão"
                  style={{ width: 44, height: 44, borderRadius: 8, border: "1px solid #d6d3d1", background: "#fff", cursor: "pointer", color: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Grid3X3 size={15} />
                </button>
              </div>
            </div>
          </div>
          {showMapa && (
            <MapaGalpao
              value={form.location}
              /* onSelect só grava — o modal fecha no Confirmar, permitindo
                 trocar de célula antes de decidir. */
              onSelect={loc => setForm(f => ({ ...f, location: loc }))}
              onClose={() => setShowMapa(false)}
            />
          )}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <div>
              <label htmlFor="asset-condition" style={LBL}>Condição</label>
              {/* kind="field" — campo de formulário, não filtro (vocabulário em
                  components/filter-select.tsx). Era `<select>` NATIVO num modal
                  onde os seis filtros da tela atrás já eram FilterSelect: o
                  mesmo gesto abria dois menus diferentes conforme o lado do
                  modal. `hideSearch` porque a lista é curta e fixa. */}
              <FilterSelect
                kind="field" hideSearch fullWidth hideWhenEmpty={false}
                label="Condição"
                value={form.condition}
                onChange={v => setForm(f => ({ ...f, condition: v as Condition }))}
                options={CONDITIONS.map(c => ({ value: c, label: CONDITION_META[c].label }))}
                testId="select-asset-condition"
                triggerProps={{ id: "asset-condition" }}
                triggerStyle={{ ...INP, height: "auto" }}
              />
              {/* O que a condição escolhida QUER DIZER — sem manual, "Avaria
                  leve" não dizia se a peça ainda serve. */}
              <p style={{ margin: "5px 0 0", fontSize: 11, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", lineHeight: 1.4 }}>
                {SIGNIFICADO_DA_CONDICAO[form.condition]}
              </p>
            </div>
            <div>
              <label htmlFor="asset-status" style={LBL}>Status</label>
              {lockedStatus ? (
                <div>
                  <input id="asset-status" data-testid="select-asset-status" readOnly disabled
                    value={STATUS_META[form.trackingStatus]?.label ?? form.trackingStatus}
                    style={{ ...INP, color: "#64748b", cursor: "not-allowed" }} />
                  <p style={{ margin: "5px 0 0", fontSize: 11, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                    Status definido pelo ciclo do evento.
                  </p>
                </div>
              ) : (
                <FilterSelect
                  kind="field" hideSearch fullWidth hideWhenEmpty={false}
                  label="Status"
                  value={form.trackingStatus}
                  onChange={v => setForm(f => ({ ...f, trackingStatus: v as TrackingStatus }))}
                  options={MANUAL_STATUSES.map(s => ({ value: s, label: STATUS_META[s].label }))}
                  testId="select-asset-status"
                  triggerProps={{ id: "asset-status" }}
                  triggerStyle={{ ...INP, height: "auto" }}
                />
              )}
              {!lockedStatus && (
                <p style={{ margin: "5px 0 0", fontSize: 11, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", lineHeight: 1.4 }}>
                  {SIGNIFICADO_DO_STATUS[form.trackingStatus]}
                </p>
              )}
            </div>
          </div>
          <div>
            <label id="asset-sponsors-label" style={LBL}>Patrocinadores</label>
            {allSponsors.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", fontStyle: "italic" }}>
                Nenhum patrocinador cadastrado no sistema.
              </p>
            ) : (
              <div role="group" aria-labelledby="asset-sponsors-label" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allSponsors.map(sp => {
                  const selected = form.sponsorIds.includes(sp.id);
                  return (
                    <button key={sp.id} type="button"
                      data-testid={`toggle-sponsor-${sp.id}`}
                      onClick={() => toggleSponsor(sp.id)}
                      // aria-pressed: o estado só existia na cor do botão.
                      aria-pressed={selected}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        minHeight: isMobile ? 44 : 32, padding: "0 12px", borderRadius: 8, cursor: "pointer",
                        fontSize: 12, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif",
                        transition: "background-color 0.12s, color 0.12s, border-color 0.12s",
                        background: selected ? "#0f172a" : "#f1f5f9",
                        color: selected ? "#fff" : "#475569",
                        border: selected ? "1px solid #0f172a" : "1px solid #e2e8f0",
                      }}>
                      {selected && <CheckCircle2 size={12} aria-hidden="true" />}
                      {sp.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div>
            <label htmlFor="asset-notes" style={LBL}>Observações</label>
            <textarea id="asset-notes" data-testid="input-asset-notes" style={{ ...INP, minHeight: 72, resize: "vertical" as const }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informações adicionais..." />
          </div>
        </div>
        <div style={{ flexShrink: 0, padding: isMobile ? "12px 16px" : "16px 24px", borderTop: "1px solid #ebe8e4", display: "flex", justifyContent: "flex-end", gap: 8, background: "#fff" }}>
          <button onClick={onClose} style={{ minHeight: 44, padding: "0 20px", borderRadius: 10, border: "none", background: "#f1f5f9", color: "#475569", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Cancelar</button>
          <button data-testid="button-save-asset" disabled={saveDisabled}
            onClick={() => mutation.mutate(form)} style={{
              minHeight: 44, padding: "0 24px", borderRadius: 10, border: "none",
              background: saveDisabled ? "#e2e8f0" : "#c2410c",
              color: saveDisabled ? "#64748b" : "#fff",
              fontSize: 13, cursor: saveDisabled ? "not-allowed" : "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              boxShadow: saveDisabled ? "none" : "0 4px 14px rgba(194,65,12,0.30)",
            }}>
            {/* "+ SALVAR ATIVO" também na edição, onde o "+" prometia criar
                outro. O rótulo agora segue o modo do formulário. */}
            {mutation.isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Cadastrar ativo"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Estoque() {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  // FILTROS NA URL (regra da casa): F5 não perde o recorte e dá para mandar o
  // link de "descartados da franquia X". Lidos uma vez na montagem; escritos
  // com replaceState (não polui o histórico) e o mesmo debounce de 200 ms das
  // outras telas, para digitar na busca não gravar uma entrada por tecla.
  // Só as chaves daqui são tocadas — qualquer outro parâmetro sobrevive.
  const urlInicial = useMemo(() => new URLSearchParams(window.location.search), []);
  const listaDaUrl = (k: string) => (urlInicial.get(k) ?? "").split(",").filter(Boolean);
  const [search, setSearch] = useState(() => urlInicial.get("q") ?? "");
  const [filterStatus, setFilterStatus] = useState<string[]>(() => listaDaUrl("status"));
  const [filterCondition, setFilterCondition] = useState<string[]>(() => listaDaUrl("condicao"));
  const [filterAutoAdded, setFilterAutoAdded] = useState(() => urlInicial.get("origem") ?? "all");
  const [filterEvent, setFilterEvent] = useState<string[]>(() => listaDaUrl("evento"));
  const [filterSponsor, setFilterSponsor] = useState<string[]>(() => listaDaUrl("patrocinador"));
  const [filterFranchise, setFilterFranchise] = useState<string[]>(() => listaDaUrl("franquia"));
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams(window.location.search);
      const grava = (k: string, v: string) => { if (v) p.set(k, v); else p.delete(k); };
      grava("q", search.trim());
      grava("status", filterStatus.join(","));
      grava("condicao", filterCondition.join(","));
      grava("origem", filterAutoAdded === "all" ? "" : filterAutoAdded);
      grava("evento", filterEvent.join(","));
      grava("patrocinador", filterSponsor.join(","));
      grava("franquia", filterFranchise.join(","));
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 200);
    return () => clearTimeout(t);
  }, [search, filterStatus, filterCondition, filterAutoAdded, filterEvent, filterSponsor, filterFranchise]);
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false);
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);
  // Fechamento por clique-fora/Escape do popover de condição agora é do
  // Radix (ui/popover) — sem listener manual em document. Só "condition" tem
  // edição rápida; o status é definido pelo ciclo do evento.
  const [quickEdit, setQuickEdit] = useState<{ assetId: string; field: "condition" } | null>(null);
  const [viewingAsset, setViewingAsset] = useState<InventoryAsset | null>(null);

  // Quem mexe no acervo (dono, 14/09): Gráfica e admin editam; excluir segue
  // só do admin; a Solicitação consulta o que tem para reservar.
  const { user } = useAuth();
  const podeEditar = user?.role === "grafica" || user?.role === "admin";
  const podeExcluir = user?.role === "admin";
  const { data: reservasAtivas = [] } = useQuery<ReservaAtiva[]>({ queryKey: ["/api/estoque/reservas-ativas"] });
  const reservaPorAtivo = useMemo(() => new Map(reservasAtivas.map(r => [r.assetId, r])), [reservasAtivas]);

  const { data: assets = [], isLoading, isError, refetch } = useQuery<InventoryAsset[]>({ queryKey: ["/api/inventory"] });
  const { data: sponsors = [] } = useQuery<Sponsor[]>({ queryKey: ["/api/sponsors"] });
  const { data: allItems = [] } = useQuery<any[]>({ queryKey: ["/api/items"] });
  const { data: allEvents = [] } = useQuery<Event[]>({ queryKey: ["/api/events"] });

  const getLinkedItem = (asset: InventoryAsset) => {
    if (!asset.originalItemId) return undefined;
    return allItems.find((i: any) => i.id === asset.originalItemId);
  };

  // Map assetId → eventName via originalItemId → item → event
  const assetEventMap = useMemo(() => {
    const itemMap = Object.fromEntries(allItems.map(i => [i.id, i]));
    const eventMap = Object.fromEntries(allEvents.map(e => [e.id, e]));
    const map: Record<string, { id: string; name: string; startDate: Date | string | null }> = {};
    for (const asset of assets) {
      if (!asset.originalItemId) continue;
      const item = itemMap[asset.originalItemId];
      if (!item) continue;
      const event = eventMap[item.eventId];
      if (event) map[asset.id] = { id: event.id, name: event.name, startDate: event.startDate ?? null };
    }
    return map;
  }, [assets, allItems, allEvents]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Ativo excluído", description: deleting ? `${deleting.displayId} — ${deleting.name}` : undefined }); setDeleting(null); },
    onError: (e: Error) => toast({ title: "Não foi possível excluir", description: e.message, variant: "destructive" }),
  });

  // O toast diz QUAL ativo mudou e para QUAL condição — "Item atualizado" era
  // igual para qualquer linha da tabela.
  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object; rotulo?: string }) => apiRequest("PATCH", `/api/inventory/${id}`, data),
    onSuccess: (_r, vars) => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setQuickEdit(null); toast({ title: "Condição atualizada", description: vars.rotulo }); },
    onError: (e: Error) => toast({ title: "Não foi possível mudar a condição", description: e.message, variant: "destructive" }),
  });

  // Exclude AGUARDANDO_TRIAGEM — those belong to the triage screen only
  const acervoAssets = assets.filter(a => a.trackingStatus !== "AGUARDANDO_TRIAGEM");
  const triageCount = assets.filter(a => a.trackingStatus === "AGUARDANDO_TRIAGEM").length;

  const total = acervoAssets.filter(a => a.trackingStatus !== "DESCARTADO").length;
  const byStatus = (s: string) => assets.filter(a => a.trackingStatus === s).length;

  const filtered = acervoAssets.filter(a => {
    // Hide DESCARTADO by default — only show when explicitly filtered
    if (filterStatus.length === 0 && a.trackingStatus === "DESCARTADO") return false;
    const q = search.toLowerCase();
    const ms = !q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q));
    const mst = filterStatus.length === 0 || filterStatus.includes(a.trackingStatus);
    const mc = filterCondition.length === 0 || filterCondition.includes(a.condition);
    const ma = filterAutoAdded === "all" || (filterAutoAdded === "auto" ? a.autoAdded : !a.autoAdded);
    const me = filterEvent.length === 0 || filterEvent.includes(assetEventMap[a.id]?.id);
    const msp = filterSponsor.length === 0 || (a.sponsorIds ?? []).some(sid => filterSponsor.includes(sid));
    const mf = filterFranchise.length === 0 || (a.franchiseTags ?? []).some(t => filterFranchise.includes(t));
    return ms && mst && mc && ma && me && msp && mf;
  });

  const hasFilters = !!(search || filterStatus.length > 0 || filterCondition.length > 0 || filterAutoAdded !== "all" || filterEvent.length > 0 || filterSponsor.length > 0 || filterFranchise.length > 0);

  // Filtros facetados: cada filtro lista só o que existe no acervo já recortado
  // pelos OUTROS filtros ativos, com a contagem de ativos por opção.
  const eFacetPool = (exclude: 'status' | 'condition' | 'auto' | 'event' | 'sponsor' | 'franchise') =>
    acervoAssets.filter(a => {
      if (exclude !== 'status') {
        if (filterStatus.length === 0 && a.trackingStatus === "DESCARTADO") return false;
        if (filterStatus.length > 0 && !filterStatus.includes(a.trackingStatus)) return false;
      }
      if (exclude !== 'condition' && filterCondition.length > 0 && !filterCondition.includes(a.condition)) return false;
      if (exclude !== 'auto' && filterAutoAdded !== "all" && (filterAutoAdded === "auto" ? !a.autoAdded : a.autoAdded)) return false;
      if (exclude !== 'event' && filterEvent.length > 0 && !filterEvent.includes(assetEventMap[a.id]?.id)) return false;
      if (exclude !== 'sponsor' && filterSponsor.length > 0 && !(a.sponsorIds ?? []).some(sid => filterSponsor.includes(sid))) return false;
      if (exclude !== 'franchise' && filterFranchise.length > 0 && !(a.franchiseTags ?? []).some(t => filterFranchise.includes(t))) return false;
      return true;
    });

  const tally = <T,>(rows: T[], key: (r: T) => { value: string; label: string } | null) => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    rows.forEach(r => {
      const k = key(r);
      if (!k) return;
      const cur = map.get(k.value);
      if (cur) cur.count++;
      else map.set(k.value, { ...k, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventFilterOptions = tally(eFacetPool('event'), a => {
    const ev = assetEventMap[a.id];
    return ev ? { value: ev.id, label: ev.name } : null;
  });
  const sponsorFilterOptions = (() => {
    const byId = new Map(sponsors.map(s => [s.id, s.name]));
    const map = new Map<string, { value: string; label: string; count: number }>();
    eFacetPool('sponsor').forEach(a => (a.sponsorIds ?? []).forEach(id => {
      const cur = map.get(id);
      if (cur) cur.count++;
      else map.set(id, { value: id, label: byId.get(id) || id, count: 1 });
    }));
    return Array.from(map.values());
  })();
  const statusFilterOptions = tally(eFacetPool('status'), a =>
    a.trackingStatus === "AGUARDANDO_TRIAGEM" ? null : { value: a.trackingStatus, label: STATUS_META[a.trackingStatus]?.label ?? a.trackingStatus });
  const conditionFilterOptions = tally(eFacetPool('condition'), a =>
    ({ value: a.condition, label: conditionMeta(a.condition).label }));
  const originFilterOptions = tally(eFacetPool('auto'), a =>
    ({ value: a.autoAdded ? "auto" : "manual", label: a.autoAdded ? "Gráfica (automático)" : "Manual" }));
  const franchiseFilterOptions = (() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    eFacetPool('franchise').forEach(a => (a.franchiseTags ?? []).forEach(t => {
      const cur = map.get(t);
      if (cur) cur.count++;
      else map.set(t, { value: t, label: t, count: 1 });
    }));
    return Array.from(map.values());
  })();

  // Cabeçalho e célula com o MESMO recuo lateral (24px): eram 20 no th e 24 no
  // td, e todo rótulo de coluna ficava 4px à esquerda do seu conteúdo.
  const TH: React.CSSProperties = {
    padding: "12px 24px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
    textTransform: "uppercase", color: "#fff", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "#0f172a", borderBottom: "none",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "14px 24px", verticalAlign: "middle",
    fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13, color: "#0f172a",
    borderBottom: "1px solid #f1f5f9",
  };

  return (
    <div style={{ padding: isMobile ? "14px 16px" : "32px 36px", background: "#f8fafc", height: "100%", overflowY: "auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: isMobile ? 20 : 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 12 : 16 }}>
          <div style={{ width: isMobile ? 44 : 48, height: isMobile ? 44 : 48, borderRadius: 12, background: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 12px rgba(194,65,12,0.22)" }}>
            <Archive size={22} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: "0 0 3px", fontSize: FS.h1, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "#1c1917", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              Estoque
            </h1>
            {/* Subtítulo em texto corrido: 10px em caixa alta com 0.18em era
                o elemento mais "alto" do cabeçalho e o menos importante. */}
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#746e69", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
              Peças guardadas para reaproveitar: onde estão, em que condição e se já têm reserva
            </p>
          </div>
        </div>
        {podeEditar && <button data-testid="button-new-asset" onClick={() => setEditing(null)} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          minHeight: 44, padding: "0 20px", borderRadius: 10, border: "none",
          width: isMobile ? "100%" : undefined,
          background: "#c2410c", color: "#fff", fontSize: 14, cursor: "pointer",
          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
          boxShadow: "0 4px 14px rgba(194,65,12,0.28)",
          transition: "background-color 0.15s, box-shadow 0.15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#9a3412"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#c2410c"; }}>
          <span aria-hidden="true" style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>+</span>
          Novo ativo
        </button>}
      </div>

      {/* ── Stat cards ── */}
      {/* minmax(0, ...) pelo mesmo motivo do calendario: `1fr` e
          `minmax(AUTO, 1fr)`, e o minimo automatico e o min-content do cartao.
          Em 375px cada coluna vale ~103px, e "Disponivel no deposito" nao cabe
          — as tres trilhas estouravam e a PAGINA inteira ganhava rolagem
          lateral. Com o minimo em 0 o texto quebra e a grade fica na largura. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fit, minmax(160px, 1fr))", gap: isMobile ? 8 : 14, marginBottom: isMobile ? 16 : 24 }}>
        <StatCard compacto={isMobile}
          label="Total Acervo" value={total} Icon={Package} color="#2563eb"
          // O cartão LIMPA os filtros ao ser tocado — e nada dizia isso: com
          // filtro ativo, o subtexto vira o convite.
          subtext={hasFilters ? "Toque para ver tudo (limpa filtros)" : "Ativos no acervo"}
          active={!hasFilters}
          onClick={() => { setSearch(""); setFilterStatus([]); setFilterCondition([]); setFilterAutoAdded("all"); setFilterEvent([]); setFilterSponsor([]); setFilterFranchise([]); }}
        />
        <StatCard compacto={isMobile}
          label="Descartados" value={byStatus("DESCARTADO")} Icon={XCircle} color="#6b7280"
          subtext={byStatus("DESCARTADO") > 0 ? "Ocultos na tabela · ver →" : "Nenhum descartado"}
          subColor={byStatus("DESCARTADO") > 0 ? "#6b7280" : "#64748b"}
          active={filterStatus.length === 1 && filterStatus[0] === "DESCARTADO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "DESCARTADO" ? [] : ["DESCARTADO"])}
        />
        <StatCard compacto={isMobile}
          label="No Galpão" value={byStatus("NO_GALPAO")} Icon={Warehouse} color="#16a34a"
          subtext="Disponível no depósito"
          active={filterStatus.length === 1 && filterStatus[0] === "NO_GALPAO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "NO_GALPAO" ? [] : ["NO_GALPAO"])}
        />
        <StatCard compacto={isMobile}
          label="Em Uso" value={byStatus("EM_USO")} Icon={Truck} color="#ea580c"
          subtext="Num evento agora"
          active={filterStatus.length === 1 && filterStatus[0] === "EM_USO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "EM_USO" ? [] : ["EM_USO"])}
        />
        <StatCard compacto={isMobile}
          label="Manutenção" value={byStatus("EM_MANUTENCAO")} Icon={Wrench} color="#92400e"
          subtext="Fora do estoque até o reparo"
          active={filterStatus.length === 1 && filterStatus[0] === "EM_MANUTENCAO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "EM_MANUTENCAO" ? [] : ["EM_MANUTENCAO"])}
        />
        <StatCard compacto={isMobile}
          label="Ag. Triagem" value={triageCount} Icon={ScanSearch} color="#b45309"
          subtext={triageCount > 0 ? "Ir para triagem ↗" : "Abrir triagem ↗"}
          subColor={triageCount > 0 ? "#b45309" : "#64748b"}
          onClick={() => navigate("/triagem-retorno")}
        />
      </div>

      {/* ── Filter bar ── */}
      {(() => {
        const FL: React.CSSProperties = {
          fontSize: 11, fontWeight: 500, color: "#64748b",
          fontFamily: "Plus Jakarta Sans, sans-serif", marginBottom: 6, display: "block",
        };
        const SEL = (active: boolean): React.CSSProperties => ({
          height: 44, width: "100%",
          border: `1.5px solid ${active ? "#c2410c" : "#e2e8f0"}`,
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: "0 12px", background: "#fff",
          color: active ? "#9a3412" : "#374151",
          cursor: "pointer",
          transition: "border-color 0.15s",
        });
        return (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            padding: isMobile ? "12px 14px 14px" : "16px 20px 18px", marginBottom: isMobile ? 16 : 20,
            display: "flex", alignItems: "flex-end", gap: isMobile ? 10 : 14, flexWrap: "wrap",
          }}>
            {/* Evento — wrapper .event-filter-44 iguala a altura do trigger (44px)
                aos demais filtros; o componente é compartilhado e não expõe
                triggerStyle. */}
            <div className="event-filter-44" style={{ display: "flex", flexDirection: "column", flex: "1 1 160px" }}>
              <label style={FL}>Evento</label>
              <EventFilterDropdown
                values={filterEvent}
                onValuesChange={setFilterEvent}
                options={eventFilterOptions}
              />
            </div>

            {/* Patrocinador */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 180px" }}>
              <label style={FL}>Patrocinador</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Patrocinador" allLabel="Todos os patrocinadores"
                values={filterSponsor} onValuesChange={setFilterSponsor}
                options={sponsorFilterOptions}
                searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
                testId="select-filter-sponsor" triggerStyle={SEL(filterSponsor.length > 0)}
              />
            </div>

            {/* Franquia */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 140px" }}>
              <label style={FL}>Franquia</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Franquia" allLabel="Todas as franquias"
                values={filterFranchise} onValuesChange={setFilterFranchise}
                options={franchiseFilterOptions}
                searchPlaceholder="Buscar franquia..." emptyText="Nenhuma franquia encontrada."
                testId="select-filter-franchise" triggerStyle={SEL(filterFranchise.length > 0)}
              />
            </div>

            {/* Status */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 140px" }}>
              <label style={FL}>Status</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Status" allLabel="Qualquer status"
                values={filterStatus} onValuesChange={setFilterStatus}
                options={statusFilterOptions}
                searchPlaceholder="Buscar status..." emptyText="Nenhum status encontrado."
                testId="select-filter-status" triggerStyle={SEL(filterStatus.length > 0)}
              />
            </div>

            {/* Condição */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 130px" }}>
              <label style={FL}>Condição</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Condição" allLabel="Todas as condições"
                values={filterCondition} onValuesChange={setFilterCondition}
                options={conditionFilterOptions}
                searchPlaceholder="Buscar condição..." emptyText="Nenhuma condição encontrada."
                testId="select-filter-condition" triggerStyle={SEL(filterCondition.length > 0)}
              />
            </div>

            {/* Origem */}
            <div style={{ display: "flex", flexDirection: "column", flex: "0 1 110px" }}>
              <label style={FL}>Origem</label>
              <FilterSelect
                fullWidth showAllLabelWhenEmpty hideWhenEmpty={false}
                label="Origem" allLabel="Todas"
                value={filterAutoAdded} onChange={setFilterAutoAdded}
                options={originFilterOptions}
                searchPlaceholder="Buscar origem..." emptyText="Nenhuma origem encontrada."
                testId="select-filter-origin" triggerStyle={SEL(filterAutoAdded !== "all")}
              />
            </div>

            {/* Busca */}
            <div style={{ display: "flex", flexDirection: "column", flex: "1 1 160px" }}>
              <label style={FL}>Buscar</label>
              <div style={{ position: "relative" }}>
                <Search size={14} color="#64748b" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input data-testid="input-search-assets" style={{
                  width: "100%", paddingLeft: 34, paddingRight: 12, height: 44,
                  border: `1.5px solid ${search ? "#c2610c" : "#e2e8f0"}`, borderRadius: 8,
                  fontSize: isMobile ? 16 : 13, fontWeight: 400, fontFamily: "Plus Jakarta Sans, sans-serif",
                  background: "#fff", color: "#374151", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => (e.target.style.borderColor = "#c2610c")}
                onBlur={e => (e.target.style.borderColor = search ? "#c2610c" : "#e2e8f0")}
                aria-label="Buscar ativos"
                /* A busca sempre casou nome, ID, local e franquia — o
                   placeholder "Nome..." escondia três quartos dela. */
                placeholder="Nome, ID, local ou franquia..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            {/* Limpar */}
            <div style={{ display: "flex", flexDirection: "column", flex: "0 0 auto" }}>
              <label style={{ ...FL, visibility: "hidden" }}>·</label>
              <button
                data-testid="button-clear-filters"
                disabled={!hasFilters}
                onClick={() => { setSearch(""); setFilterStatus([]); setFilterCondition([]); setFilterAutoAdded("all"); setFilterEvent([]); setFilterSponsor([]); setFilterFranchise([]); }}
                style={{
                  height: 44, display: "flex", alignItems: "center", gap: 5, padding: "0 14px",
                  borderRadius: 8,
                  border: `1.5px solid ${hasFilters ? "#fecaca" : "#e2e8f0"}`,
                  background: hasFilters ? "#fef2f2" : "#f8fafc",
                  color: hasFilters ? "#b91c1c" : "#94a3b8",
                  fontSize: 12, cursor: hasFilters ? "pointer" : "not-allowed",
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  transition: "all 0.15s",
                }}>
                <X size={12} /> Limpar filtros
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: isMobile ? 12 : 16, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
        {isLoading ? (
          <div data-testid="skeleton-estoque" aria-busy="true" aria-label="Carregando o estoque" style={{ padding: isMobile ? "4px 14px" : "8px 24px" }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse" style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 0", borderBottom: i < 5 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ width: 88, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "#e2e8f0", flexShrink: 0 }} />
                <div style={{ flex: 1, height: 12, borderRadius: 6, background: "#e2e8f0" }} />
                {!isMobile && <div style={{ width: 130, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />}
                <div style={{ width: 84, height: 22, borderRadius: 9999, background: "#e2e8f0", flexShrink: 0 }} />
                {!isMobile && <div style={{ width: 70, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: isMobile ? "40px 20px" : 72, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>Não foi possível carregar o estoque</p>
            <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} style={{ minHeight: 44, background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: isMobile ? "40px 20px" : 72, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Archive size={24} color="#cbd5e1" />
            </div>
            {/* Vazio com saída: com filtro ativo, o botão que resolve fica
                aqui, e não lá em cima na barra (que já rolou para fora). */}
            <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>
              {hasFilters ? "Nenhum ativo neste recorte" : "Nenhum ativo no acervo ainda"}
            </p>
            <p style={{ fontSize: 12, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", margin: 0 }}>
              {hasFilters ? "Os filtros atuais escondem todo o acervo." : podeEditar ? "Cadastre o primeiro ativo pelo botão Novo ativo." : "As peças entram aqui depois de produzidas e triadas."}
            </p>
            {hasFilters && (
              <button type="button" data-testid="button-clear-filters-vazio"
                onClick={() => { setSearch(""); setFilterStatus([]); setFilterCondition([]); setFilterAutoAdded("all"); setFilterEvent([]); setFilterSponsor([]); setFilterFranchise([]); }}
                style={{ marginTop: 16, minHeight: 44, background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "0 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Limpar filtros
              </button>
            )}
          </div>
        ) : (
          <div>
            {(() => {
              // As peças de cada ativo são montadas UMA vez e servem às duas
              // vistas: tabela no desktop, lista no celular. Antes o celular
              // recebia a tabela de 860px com rolagem lateral — o status e as
              // ações ficavam fora da tela e ninguém sabia que dava para rolar.
              const alvoAcao = isMobile ? 44 : 32;
              const botaoAcao: React.CSSProperties = { width: alvoAcao, height: alvoAcao, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", transition: "color 0.15s, background 0.15s" };
              const pecasDe = (asset: InventoryAsset) => {
                const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                const cm = conditionMeta(asset.condition);
                const thumbOk = asset.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(asset.approvalThumbUrl) || asset.approvalThumbUrl.startsWith('/objects/'));
                const assetSponsors = (asset.sponsorIds ?? []).map(id => sponsors.find(s => s.id === id)).filter(Boolean);
                const lado = isMobile ? 48 : 40;

                const miniaturaEl = (
                  <div style={{ width: lado, height: lado, borderRadius: 8, overflow: "hidden", background: "#f1f5f9", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {thumbOk
                      ? <img loading="lazy" decoding="async" src={miniatura(asset.approvalThumbUrl!)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <Package size={16} color="#94a3b8" aria-hidden="true" />
                    }
                  </div>
                );

                const quantidadeEl = (
                  <span style={{
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    padding: "1px 6px", borderRadius: 4,
                    background: (asset.quantity ?? 1) > 1 ? "#c2410c" : "#f1f5f9",
                    color: (asset.quantity ?? 1) > 1 ? "#fff" : "#64748b",
                    fontSize: 11, fontWeight: 700, fontFamily: "DM Mono, monospace", flexShrink: 0,
                  }}>×{asset.quantity ?? 1}</span>
                );

                const eventoEl = assetEventMap[asset.id] ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, minWidth: 0 }}>
                    <CalendarDays size={11} color="#64748b" aria-hidden="true" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: isMobile ? "100%" : 180 }}>
                      {assetEventMap[asset.id].name}
                    </span>
                  </div>
                ) : null;

                // Patrocinador em #9a3412: o #c2610c anterior dava 4,17:1 sobre
                // o fundo do chip. Caixa alta em 9px saiu — o nome da marca já
                // é o que se lê, não precisa gritar.
                const patrocinadoresEl = assetSponsors.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {assetSponsors.slice(0, 2).map(sp => (
                      <span key={sp!.id} style={{
                        padding: "1px 6px", borderRadius: 4,
                        background: "rgba(194,65,12,0.08)", color: "#9a3412",
                        fontSize: 11, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif",
                        whiteSpace: "nowrap",
                      }}>{sp!.name}</span>
                    ))}
                    {assetSponsors.length > 2 && (
                      <span style={{ fontSize: 11, color: "#64748b", fontFamily: "DM Mono, monospace", alignSelf: "center" }}>+{assetSponsors.length - 2}</span>
                    )}
                  </div>
                ) : null;

                const franquiasEl = (asset.franchiseTags ?? []).length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                    {(asset.franchiseTags ?? []).map(t => (
                      <span key={t} style={{
                        padding: "1px 6px", borderRadius: 4,
                        background: "#eff6ff", color: "#1d4ed8",
                        fontSize: 11, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif",
                        whiteSpace: "nowrap",
                      }}>{t}</span>
                    ))}
                  </div>
                ) : null;

                // Condição — edição rápida via ui/popover: portal (não é
                // cortado pela tabela), abre para cima quando falta espaço,
                // fecha por Escape/clique-fora via Radix. O chevron diz que o
                // chip é editável; sem ele parecia só um rótulo.
                const condicaoEl = (
                  <Popover
                    open={quickEdit?.assetId === asset.id && quickEdit.field === "condition"}
                    onOpenChange={open => setQuickEdit(open ? { assetId: asset.id, field: "condition" } : null)}
                  >
                    <PopoverTrigger asChild>
                      <button data-testid={`button-quick-condition-${asset.id}`}
                        disabled={!podeEditar}
                        title={podeEditar ? "Mudar a condição" : "Mudar a condição é da Gráfica e do admin"}
                        aria-label={`Condição: ${cm.label}${podeEditar ? " — mudar" : ""}`}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          minHeight: isMobile ? 36 : 26, padding: "0 10px", borderRadius: 9999, border: "none",
                          background: cm.bg, color: cm.color,
                          fontSize: 12, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                          cursor: podeEditar ? "pointer" : "default", whiteSpace: "nowrap",
                          transition: "box-shadow 0.12s",
                        }}
                        onMouseEnter={e => { if (podeEditar) e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${cm.border}`; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}>
                        {cm.label}
                        {podeEditar && <ChevronDown size={12} aria-hidden="true" />}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={4} className="w-auto p-1.5"
                      style={{ minWidth: 150, borderRadius: 10, display: "flex", flexDirection: "column", gap: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                      onClick={e => e.stopPropagation()}
                    >
                      {/* Congelado enquanto SAI: o painel fecha e a página
                          continua renderizando — ver popover-congelado.test.ts. */}
                      <FreezeWhileClosing open={quickEdit?.assetId === asset.id && quickEdit.field === "condition"}>
                      {CONDITIONS.map(c => {
                        const meta = CONDITION_META[c];
                        return (
                          <button key={c} disabled={patchMutation.isPending}
                            onClick={e => { e.stopPropagation(); patchMutation.mutate({ id: asset.id, data: { condition: c }, rotulo: `${asset.displayId} → ${meta.label}` }); }}
                            style={{ display: "flex", alignItems: "center", gap: 6, minHeight: isMobile ? 44 : 32, padding: "0 10px", borderRadius: 7, border: "none", background: asset.condition === c ? meta.bg : "transparent", color: asset.condition === c ? meta.color : "#475569", fontSize: 13, fontWeight: 600, fontFamily: "Space Grotesk, sans-serif", cursor: patchMutation.isPending ? "wait" : "pointer", opacity: patchMutation.isPending ? 0.55 : 1, textAlign: "left" }}>
                            {asset.condition === c ? <CheckCircle2 size={13} aria-hidden="true" /> : <span style={{ width: 13 }} />}
                            {meta.label}
                          </button>
                        );
                      })}
                    </FreezeWhileClosing>
                    </PopoverContent>
                  </Popover>
                );

                // "No galpão" não quer dizer livre (14/09): a peça pode estar
                // reservada para outro evento, ou ter sido impressa para um
                // evento que ainda não aconteceu.
                const reservaEl = (() => {
                  const reserva = reservaPorAtivo.get(asset.id);
                  const chip: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, marginTop: 5, padding: "2px 7px", borderRadius: 6, fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", whiteSpace: "nowrap", maxWidth: isMobile ? "100%" : 220, overflow: "hidden", textOverflow: "ellipsis" };
                  if (reserva) {
                    return (
                      <div data-testid={`chip-reservada-${asset.id}`} title={`Reservada para ${reserva.itemDisplayId ?? "uma peça"} de ${reserva.eventName}`}
                        style={{ ...chip, background: "#eff6ff", color: "#1d4ed8" }}>
                        <BookmarkCheck size={11} aria-hidden="true" style={{ flexShrink: 0 }} /> Reservada · {reserva.eventName}{reserva.saida ? ` · saída ${diaEMes(reserva.saida)}` : ""}
                      </div>
                    );
                  }
                  const origem = assetEventMap[asset.id];
                  if (asset.trackingStatus === "NO_GALPAO" && origem && !eventoJaAcabou(origem.startDate, new Date())) {
                    return (
                      <div data-testid={`chip-separada-${asset.id}`} title={`Impressa para ${origem.name}, que ainda não aconteceu`}
                        style={{ ...chip, background: "#f5f5f4", color: "#57534e" }}>
                        Separada · aguarda {origem.name}
                      </div>
                    );
                  }
                  return null;
                })();

                const statusEl = (
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: sm.color, fontFamily: "Space Grotesk, sans-serif", whiteSpace: "nowrap" }}>
                      {sm.label}
                    </span>
                  </div>
                );

                // Hover dos ícones: fundo tingido com a cor da ação. Excluir em
                // #b91c1c (o #ef4444 dava 3,8:1 no ícone sobre o tinte).
                const tingir = (cor: string, fundo: string) => ({
                  onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = cor; e.currentTarget.style.background = fundo; },
                  onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = "#64748b"; e.currentTarget.style.background = "transparent"; },
                });
                const acoesEl = (
                  <div className="row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, transition: "opacity 0.15s" }}>
                    <button data-testid={`button-view-asset-${asset.id}`}
                      title="Ver detalhes" aria-label={`Ver detalhes de ${asset.name}`}
                      onClick={e => { e.stopPropagation(); setViewingAsset(asset); }}
                      {...tingir("#c2410c", "rgba(194,65,12,0.08)")}
                      style={botaoAcao}>
                      <Eye size={isMobile ? 18 : 15} aria-hidden="true" />
                    </button>
                    {podeEditar && <button data-testid={`button-edit-asset-${asset.id}`}
                      title="Editar" aria-label={`Editar ${asset.name}`}
                      onClick={e => { e.stopPropagation(); setEditing(asset); }}
                      {...tingir("#1d4ed8", "rgba(37,99,235,0.08)")}
                      style={botaoAcao}>
                      <Pencil size={isMobile ? 18 : 15} aria-hidden="true" />
                    </button>}
                    {podeExcluir && <button data-testid={`button-delete-asset-${asset.id}`}
                      title="Excluir" aria-label={`Excluir ${asset.name}`}
                      onClick={e => { e.stopPropagation(); setDeleting(asset); }}
                      {...tingir("#b91c1c", "rgba(239,68,68,0.08)")}
                      style={botaoAcao}>
                      <Trash2 size={isMobile ? 18 : 15} aria-hidden="true" />
                    </button>}
                  </div>
                );

                return { miniaturaEl, quantidadeEl, eventoEl, patrocinadoresEl, franquiasEl, condicaoEl, reservaEl, statusEl, acoesEl };
              };

              if (isMobile) {
                return (
                  <ul aria-label="Ativos do acervo" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {filtered.map((asset, i) => {
                      const p = pecasDe(asset);
                      return (
                        <li key={asset.id} data-testid={`row-asset-${asset.id}`}
                          onClick={() => setViewingAsset(asset)}
                          style={{ padding: "14px 14px 10px", borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10 }}>
                          <div style={{ display: "flex", gap: 12, minWidth: 0 }}>
                            {p.miniaturaEl}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 600, color: "#9a3412" }}>{asset.displayId}</span>
                                {p.quantidadeEl}
                              </div>
                              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif", lineHeight: 1.3, marginTop: 2, overflowWrap: "anywhere" }}>
                                {asset.name}
                              </div>
                              {p.eventoEl}
                              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 12, color: "#475569", minWidth: 0 }}>
                                <MapPin size={11} aria-hidden="true" style={{ flexShrink: 0 }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {asset.location || "Sem local"} · {asset.autoAdded ? "Gráfica" : "Manual"}
                                </span>
                              </div>
                              {p.patrocinadoresEl}
                              {p.franquiasEl}
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }} onClick={e => e.stopPropagation()}>
                                {p.condicaoEl}
                                {p.statusEl}
                              </div>
                              {p.reservaEl}
                            </div>
                            <div onClick={e => e.stopPropagation()}>{p.acoesEl}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                );
              }

              return (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {[
                          { label: "Identificador", align: "left" },
                          { label: "Ativo", align: "left" },
                          { label: "Localização", align: "left" },
                          { label: "Condição", align: "left" },
                          { label: "Status", align: "left" },
                          { label: "Ações", align: "right" },
                        ].map(({ label, align }) => (
                          <th key={label} style={{ ...TH, textAlign: align as any }}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(asset => {
                        const p = pecasDe(asset);
                        return (
                          <tr key={asset.id} data-testid={`row-asset-${asset.id}`}
                            className="group"
                            /* Sem role="button" no <tr> (mantém a semântica de row);
                               o acesso por teclado é do botão Eye ("Ver detalhes"). */
                            onClick={() => setViewingAsset(asset)}
                            onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"}
                            onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                            style={{ transition: "background 0.12s", cursor: "pointer" }}
                          >
                            {/* ID — #9a3412: o #c2610c dava 4,17:1 e reprovava AA */}
                            <td style={TD}>
                              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 600, color: "#9a3412" }}>
                                {asset.displayId}
                              </span>
                            </td>

                            {/* Ativo: thumb + nome + qtd + evento + patrocinadores */}
                            <td style={{ ...TD, maxWidth: 280 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                                {p.miniaturaEl}
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span title={asset.name} style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
                                      {asset.name}
                                    </span>
                                    {p.quantidadeEl}
                                  </div>
                                  {p.eventoEl}
                                  {p.patrocinadoresEl}
                                </div>
                              </div>
                            </td>

                            {/* Localização + origem + franquias */}
                            <td style={TD}>
                              <div>
                                {asset.location ? (
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif", display: "block" }}>
                                    {asset.location}
                                  </span>
                                ) : (
                                  <span style={{ color: "#746e69", fontSize: 12, display: "block" }}>Sem local</span>
                                )}
                                <span style={{ fontSize: 12, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                                  {asset.autoAdded ? "Gráfica" : "Manual"}
                                </span>
                                {p.franquiasEl}
                              </div>
                            </td>

                            <td style={TD} onClick={e => e.stopPropagation()}>
                              {p.condicaoEl}
                            </td>

                            <td style={TD}>
                              {p.statusEl}
                              {p.reservaEl}
                            </td>

                            {/* Ações — opacidade base 0.7 e revelação total por
                                hover/focus-within da linha via CSS (.group/.row-actions). */}
                            <td style={{ ...TD, textAlign: "right", paddingRight: 20 }}>
                              {p.acoesEl}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Rodapé — "N de M" comparava conjuntos diferentes (o M excluía
                descartados) e produzia "12 de 8". Agora: total exibido +
                quantos registros os filtros estão ocultando. */}
            <div style={{ padding: isMobile ? "12px 14px" : "14px 24px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {(() => {
                const baseline = acervoAssets.filter(a => filterStatus.length > 0 || a.trackingStatus !== "DESCARTADO").length;
                const ocultos = Math.max(0, baseline - filtered.length);
                // eFacetPool não aplica a busca — ela entra aqui com o MESMO
                // casamento da lista (nome, ID, local, franquia).
                const q = search.toLowerCase();
                const descartadosNoRecorte = filterStatus.length === 0
                  ? eFacetPool("status").filter(a => a.trackingStatus === "DESCARTADO"
                      && (!q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q)))).length
                  : 0;
                return (
                  <p role="status" style={{ margin: 0, fontSize: 12, fontWeight: 500, fontFamily: "Plus Jakarta Sans, sans-serif", color: "#64748b" }}>
                    Exibindo <span style={{ color: "#0f172a", fontWeight: 700 }}>{filtered.length}</span> {filtered.length === 1 ? "registro" : "registros"}
                    {ocultos > 0 && <span> ({ocultos} {ocultos === 1 ? "oculto" : "ocultos"} pelos filtros)</span>}
                    {/* "Cadê a peça descartada?" — ela some por padrão e só
                        voltava para quem adivinhasse o filtro. */}
                    {/* Conta o que o CLIQUE traz (os outros filtros continuam
                        valendo), não o total de descartados do acervo. */}
                    {filterStatus.length === 0 && descartadosNoRecorte > 0 && (
                      <>
                        {" · "}
                        <button type="button" data-testid="button-ver-descartados-rodape" onClick={() => setFilterStatus(["DESCARTADO"])}
                          style={{ background: "none", border: "none", padding: 0, minHeight: isMobile ? 32 : undefined, font: "inherit", fontWeight: 700, color: "#0f172a", textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}>
                          {descartadosNoRecorte} {descartadosNoRecorte === 1 ? "descartado oculto" : "descartados ocultos"} · ver
                        </button>
                      </>
                    )}
                  </p>
                );
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Ícones de ação: base 0.7, revelação por hover OU foco de teclado na
          linha (.group é a classe realmente aplicada no <tr>). O wrapper
          .event-filter-44 iguala o trigger do EventFilterDropdown aos demais
          filtros (44px de altura e largura total). */}
      <style>{`
        tr.group .row-actions { opacity: 0.7; }
        tr.group:hover .row-actions, tr.group:focus-within .row-actions { opacity: 1; }
        .event-filter-44 > div { width: 100%; }
        .event-filter-44 > div > button { height: 44px !important; width: 100%; }
      `}</style>

      {editing !== false && (
        <AssetModal asset={editing} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {deleting && (
        <DeleteModal asset={deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMutation.mutate(deleting.id)} isPending={deleteMutation.isPending} />
      )}
      {viewingAsset && (
        <AssetDetailModal
          asset={viewingAsset}
          linkedItem={getLinkedItem(viewingAsset)}
          sponsors={sponsors}
          onClose={() => setViewingAsset(null)}
        />
      )}
    </div>
  );
}
