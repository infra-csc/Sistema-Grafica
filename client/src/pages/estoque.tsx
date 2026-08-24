import { useState, useMemo } from "react";
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
  Grid3X3, Eye, Check, Layers, ClipboardCheck,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { CONDITIONS, CONDITION_META, conditionMeta, type Condition } from "@/lib/inventory-meta";

// ─── Status meta ─────────────────────────────────────────────────────────────
// Tons 700/800 (#15803d, #9a3412): os 600 reprovavam contraste AA no texto
// pequeno em caps da coluna Status.
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  NO_GALPAO:          { label: "No Galpão",   color: "#15803d", bg: "rgba(22,163,74,0.10)"  },
  EM_USO:             { label: "Em Uso",       color: "#9a3412", bg: "rgba(234,88,12,0.10)"  },
  AGUARDANDO_TRIAGEM: { label: "Ag. Triagem",  color: "#b45309", bg: "rgba(180,83,9,0.10)"   },
  DESCARTADO:         { label: "Descartado",   color: "#6b7280", bg: "rgba(107,114,128,0.10)"},
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];
// Status que o usuário pode definir manualmente. EM_USO e AGUARDANDO_TRIAGEM
// são definidos pelo ciclo do evento (despacho/retorno) — nunca à mão.
const MANUAL_STATUSES: TrackingStatus[] = ["NO_GALPAO", "DESCARTADO"];

// ─── Stat card with watermark icon ───────────────────────────────────────────
function StatCard({ label, value, Icon, color, subtext, subColor, onClick, active }: {
  label: string; value: number; Icon: React.ElementType;
  color: string; subtext: string; subColor?: string;
  onClick?: () => void; active?: boolean;
}) {
  const [hov, setHov] = useState(false);
  const on = active || hov;
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        padding: "20px 22px 18px",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        borderBottom: `4px solid ${color}`,
        boxShadow: on ? `0 6px 20px ${color}1a` : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.2s, transform 0.15s",
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 8,
        transform: on ? "translateY(-1px)" : "none",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Label — #64748b: o #94a3b8 anterior reprovava contraste AA */}
      <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.18em" }}>
        {label}
      </span>
      {/* Value + faded icon */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: 32, fontWeight: 900, color: on ? color : "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.04em", lineHeight: 1, transition: "color 0.2s" }}>
          {value.toLocaleString("pt-BR")}
        </p>
        <Icon size={32} color={color} style={{ opacity: 0.15 }} />
      </div>
      {/* Subtext */}
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", color: subColor ?? "#94a3b8" }}>
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
        <div style={{ background: "#ef4444", padding: "16px 20px" }}>
          <AlertDialogTitle asChild>
            <p style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Space Grotesk, sans-serif", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>
              Atenção: Ação Irreversível
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
              padding: "9px 18px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#f8fafc", color: "#1e293b", fontSize: 13,
              cursor: isPending ? "not-allowed" : "pointer", opacity: isPending ? 0.6 : 1,
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
            }}>Manter</button>
            <button onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete" style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: isPending ? "#fca5a5" : "#ef4444", color: "#fff", fontSize: 13,
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
  const step2Active = ts === "EM_USO";
  const step3Done   = ts === "NO_GALPAO" || ts === "DESCARTADO";
  const step3Active = ts === "AGUARDANDO_TRIAGEM";
  const step4Active = ts === "NO_GALPAO" || ts === "DESCARTADO";

  // Localização Técnica: where the item currently IS
  const locLabel = ts === "NO_GALPAO" ? (asset.location ?? "Galpão Central")
    : ts === "EM_USO"            ? "Em Uso (Evento)"
    : ts === "AGUARDANDO_TRIAGEM" ? "Aguardando Triagem"
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
          display: "flex", flexDirection: isMobile ? "column" : "row", padding: 0,
          width: "min(1040px, calc(100vw - 32px))", maxWidth: "min(1040px, calc(100vw - 32px))",
          maxHeight: "90vh", borderRadius: 16, overflow: isMobile ? "auto" : "hidden",
          boxShadow: "0 32px 64px -12px rgba(0,0,0,0.45)",
        }}
      >
        <DialogTitle className="sr-only">{`Detalhes do ativo ${asset.displayId} — ${asset.name}`}</DialogTitle>
        <DialogDescription className="sr-only">
          Rastreabilidade, especificações técnicas e situação atual do ativo.
        </DialogDescription>

        {/* ── Sidebar ── */}
        <aside style={{ width: isMobile ? "100%" : 264, flexShrink: 0, background: "#1c1917", display: "flex", flexDirection: "column", padding: "28px 22px" }}>
          {/* Brand */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 900, fontSize: 22, color: "#f9f9f8", letterSpacing: "-0.05em", lineHeight: 1 }}>NORTE</div>
          </div>

          {/* Rastreabilidade */}
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 18 }}>
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
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                      <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: isCurrent ? 700 : 600, fontSize: 12, color: isCurrent ? "#f97316" : "#d1d5db" }}>
                        {alloc.event?.name ?? "Evento"}
                      </div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                      <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step2Active ? 700 : 600, fontSize: 12, color: step2Active ? "#f97316" : "#d1d5db" }}>
                        {eventName}
                      </div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step3Active ? 700 : 600, fontSize: 12, color: step3Active ? "#f97316" : step3Done ? "#d1d5db" : "#6b7280" }}>
                    Triagem de Retorno
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
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
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step4Active ? 700 : 600, fontSize: 12, color: step4Active ? "#f97316" : "#6b7280" }}>
                    {ts === "DESCARTADO" ? "Descartado" : ts === "NO_GALPAO" ? "No Galpão" : "Destino Final"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "rgba(255,255,255,0.3)", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {step4Active ? "Estado atual" : "Aguardando triagem"}
                  </div>
                </div>
              </div>
            </div>

            {/* Sponsors */}
            {assetSponsors.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10 }}>Patrocinadores</div>
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
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 5 }}>
              Localização Técnica
            </div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 14, color: "#f9f9f8", letterSpacing: "-0.02em", wordBreak: "break-word", lineHeight: 1.3 }}>
              {locLabel}
            </div>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.07)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase" }}>Condição</span>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "DM Mono, monospace", color: cm.color }}>
                {cm.label.toUpperCase()}
              </span>
            </div>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, background: "#f9f9f8", maxHeight: "90vh" }}>

          {/* Dark header */}
          <header style={{ background: "#1a1c1c", padding: "20px 28px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
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
                  <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Auto-Adicionado
                  </span>
                )}
              </div>
              <h1 style={{ margin: 0, color: "#ffffff", fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 24, letterSpacing: "-0.05em", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "calc(100% - 8px)" }}>
                {asset.name.toUpperCase()}
              </h1>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: 16 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 6, background: sm.color, color: "#fff", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                <Warehouse size={13} />{sm.label}
              </span>
              <button onClick={onClose} data-testid="button-close-asset-detail"
                style={{ background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.5)", padding: 8, borderRadius: 6, display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.5)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}>
                <X size={20} />
              </button>
            </div>
          </header>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 28px 0", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* Condition + Notes read-only banner */}
            <div style={{ display: "flex", gap: 12 }}>
              {/* Condition chip */}
              <div style={{ flex: 1, background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 8, background: cm.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <cm.Icon size={18} color={cm.color} />
                </div>
                <div>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em" }}>Condição</div>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 14, color: cm.color, marginTop: 2 }}>{cm.label}</div>
                </div>
              </div>
              {/* Notes read-only */}
              {asset.notes && (
                <div style={{ flex: 2, background: "#fff", borderRadius: 10, padding: "16px 20px", border: "1px solid #e2e8f0" }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>Observações</div>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>{asset.notes}</div>
                </div>
              )}
            </div>

            {/* Info grid — same layout as triagem-modal */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Evento e Histórico — light card */}
              <div style={{ background: "#f3f4f3", borderRadius: 10, overflow: "hidden" }}>
                {/* EM USO banner */}
                {ts === "EM_USO" && (
                  <div style={{ background: "#f97316", padding: "8px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                    <Truck size={13} color="#fff" />
                    <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 10, color: "#fff", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Em Uso Agora
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
                              <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, fontWeight: 600, color: isCurrent ? "#ea580c" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {evName}
                              </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              {isCurrent && (
                                <span style={{ background: "#fed7aa", color: "#c2410c", fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 6px", borderRadius: 3 }}>
                                  Em Uso
                                </span>
                              )}
                              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#9ca3af" }}>
                                {evDate ? format(new Date(evDate), "dd MMM yy", { locale: ptBR }) : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Static info below history */}
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(0,0,0,0.06)", display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, color: "#9ca3af" }}>Qtd Total</span>
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
                          <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, color: "#9ca3af" }}>{label}</span>
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
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>{label}</span>
                      <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 500, fontSize: 10, color: "#e5e7eb", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Approval thumb reference — only when URL is an image */}
            {asset.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(asset.approvalThumbUrl) || asset.approvalThumbUrl.startsWith('/objects/')) && (
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "21/9" }}>
                <img src={asset.approvalThumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(0.25)", opacity: 0.85 }} />
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
          <footer style={{ flexShrink: 0, background: "#f3f4f3", borderTop: "1px solid #e2e8f0", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>ID do Ativo</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#374151", fontWeight: 500, marginTop: 1 }}>{asset.displayId}</div>
              </div>
              {asset.autoAdded && (
                <div style={{ lineHeight: 1.3, borderLeft: "1px solid #d1d5db", paddingLeft: 20 }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>Origem</div>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12, color: "#374151", fontWeight: 600, marginTop: 1 }}>Gráfica (Auto)</div>
                </div>
              )}
            </div>
            <button onClick={onClose}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", transition: "color 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#111827")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}>
              Fechar
            </button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mapa do Galpão ───────────────────────────────────────────────────────────
const SETORES = ["A", "B", "C", "D", "E", "F"];
const CORREDORES = [1, 2, 3, 4, 5, 6, 7, 8];
function MapaGalpao({ value, onSelect, onClose }: {
  value: string; onSelect: (loc: string) => void; onClose: () => void;
}) {
  const [hov, setHov] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          // ALTURA: o mapa é fixo em 6 setores × 8 corredores — 6 linhas de 40px
          // com 4 de respiro, mais cabeçalho, rodapé e a tarja da seleção. Medi
          // 495px, e como aqui só havia `display: block` sem teto de altura, o
          // Radix (que centra com `top: 50%` + translate) cortava 25px EM CIMA e
          // 25 EMBAIXO numa janela de 445 — sumiam o título e o botão Confirmar
          // ao mesmo tempo, com o `overflow: hidden` impedindo qualquer rolagem.
          //
          // A CONTA é `100vh − 48`: viewport menos 24px de respiro em cima e 24
          // embaixo (simétrico, porque o modal é centrado). Cabeçalho e rodapé
          // não rolam, então o navegador os mede sozinho e o corpo fica com o
          // que sobrar via `flex: 1 1 auto; minHeight: 0`. Mesma regra do
          // `modal-shell` e do modal da Gestão de Prazos.
          display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 48px)",
          padding: 0, overflow: "hidden", borderRadius: 20,
          width: "min(480px, calc(100vw - 32px))", maxWidth: "min(480px, calc(100vw - 32px))",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Grid3X3 size={18} color="#f97316" />
            <div>
              <DialogTitle asChild>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a" }}>Mapa do Galpão</p>
              </DialogTitle>
              <DialogDescription asChild>
                <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>Clique para selecionar e confirme a localização</p>
              </DialogDescription>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <X size={14} />
          </button>
        </div>
        {/* O mapa é o único scrollport: em telas baixas ele rola e o botão
            Confirmar continua no lugar. */}
        <div style={{ padding: 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "28px repeat(8, 1fr)", gap: 4, marginBottom: 4 }}>
            <div />
            {CORREDORES.map(c => (
              <div key={c} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>C{c}</div>
            ))}
          </div>
          {/* Grid */}
          {SETORES.map(s => (
            <div key={s} style={{ display: "grid", gridTemplateColumns: "28px repeat(8, 1fr)", gap: 4, marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#64748b", fontFamily: "DM Mono, monospace" }}>{s}</div>
              {CORREDORES.map(c => {
                const loc = `Setor ${s} - Corredor ${c}`;
                const isSelected = value === loc;
                const isHov = hov === loc;
                return (
                  <button key={c} onClick={() => onSelect(loc)}
                    onMouseEnter={() => setHov(loc)} onMouseLeave={() => setHov(null)}
                    style={{
                      height: 40, borderRadius: 8, border: "none",
                      background: isSelected ? "#f97316" : isHov ? "#fff7ed" : "#f8fafc",
                      color: isSelected ? "#fff" : isHov ? "#f97316" : "#64748b",
                      fontSize: 9, fontWeight: 700, cursor: "pointer",
                      fontFamily: "DM Mono, monospace",
                      transition: "all 0.12s",
                      outline: isSelected ? "2px solid rgba(249,115,22,0.4)" : "none",
                      outlineOffset: 2,
                    }}>
                    {s}{c}
                  </button>
                );
              })}
            </div>
          ))}
          {value && (
            <div style={{ marginTop: 12, padding: "8px 14px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={13} color="#ea580c" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c", fontFamily: "Space Grotesk, sans-serif" }}>{value}</span>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
            Confirmar
          </button>
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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: isEdit ? "Ativo atualizado." : "Ativo criado." }); onSaved(); },
    onError: () => toast({ title: "Erro ao salvar.", variant: "destructive" }),
  });

  const INP: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: "none",
    fontSize: 13, fontFamily: "Plus Jakarta Sans, sans-serif", background: "#f8fafc",
    color: "#0f172a", outline: "none", boxSizing: "border-box",
  };
  const LBL: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: "#64748b", fontFamily: "Space Grotesk, sans-serif",
    textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6,
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
        style={{
          display: "block", padding: 0, borderRadius: 20,
          width: "min(500px, calc(100vw - 32px))", maxWidth: "min(500px, calc(100vw - 32px))",
          maxHeight: "90vh", overflow: "auto",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
        }}
      >
        <DialogDescription className="sr-only">
          Formulário de cadastro e edição de ativo do acervo.
        </DialogDescription>
        <div style={{ background: "#f97316", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Archive size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <DialogTitle asChild>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#fff", lineHeight: 1 }}>
                {isEdit ? "Editar Ativo" : "Cadastrar Novo Ativo"}
              </h3>
            </DialogTitle>
            <p style={{ margin: "4px 0 0", fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Norte Assets
            </p>
          </div>
          <button onClick={onClose} data-testid="button-close-modal" style={{ background: "rgba(255,255,255,0.15)", border: "none", width: 32, height: 32, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <label htmlFor="asset-name" style={LBL}>Nome / Descrição *</label>
            <input id="asset-name" data-testid="input-asset-name" style={INP} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Banner 3×1m — Patrocinador A" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
                  title="Abrir mapa do galpão"
                  style={{ width: 40, height: 40, borderRadius: 10, border: "1px solid #e2e8f0", background: "#f8fafc", cursor: "pointer", color: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
            </div>
            <div>
              <label htmlFor="asset-status" style={LBL}>Status</label>
              {lockedStatus ? (
                <div>
                  <input id="asset-status" data-testid="select-asset-status" readOnly disabled
                    value={STATUS_META[form.trackingStatus]?.label ?? form.trackingStatus}
                    style={{ ...INP, color: "#64748b", cursor: "not-allowed" }} />
                  <p style={{ margin: "5px 0 0", fontSize: 10, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
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
            </div>
          </div>
          <div>
            <label id="asset-sponsors-label" style={LBL}>Patrocinadores</label>
            {allSponsors.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontStyle: "italic" }}>
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
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        padding: "5px 10px", borderRadius: 7, cursor: "pointer",
                        fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                        letterSpacing: "0.06em", textTransform: "uppercase",
                        transition: "all 0.12s",
                        background: selected ? "#0f172a" : "#f1f5f9",
                        color: selected ? "#fff" : "#64748b",
                        border: selected ? "2px solid #0f172a" : "2px solid transparent",
                      }}>
                      {selected && <CheckCircle2 size={11} />}
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
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#f1f5f9", color: "#475569", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Cancelar</button>
          <button data-testid="button-save-asset" disabled={saveDisabled}
            onClick={() => mutation.mutate(form)} style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: saveDisabled ? "#e2e8f0" : "#f97316",
              color: saveDisabled ? "#64748b" : "#fff",
              fontSize: 13, cursor: saveDisabled ? "not-allowed" : "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              boxShadow: saveDisabled ? "none" : "0 4px 14px rgba(249,115,22,0.35)",
            }}>
            {mutation.isPending ? "Salvando..." : "+ SALVAR ATIVO"}
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
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string[]>([]);
  const [filterCondition, setFilterCondition] = useState<string[]>([]);
  const [filterAutoAdded, setFilterAutoAdded] = useState("all");
  const [filterEvent, setFilterEvent] = useState<string[]>([]);
  const [filterSponsor, setFilterSponsor] = useState<string[]>([]);
  const [filterFranchise, setFilterFranchise] = useState<string[]>([]);
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false);
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);
  // Fechamento por clique-fora/Escape do popover de condição agora é do
  // Radix (ui/popover) — sem listener manual em document. Só "condition" tem
  // edição rápida; o status é definido pelo ciclo do evento.
  const [quickEdit, setQuickEdit] = useState<{ assetId: string; field: "condition" } | null>(null);
  const [viewingAsset, setViewingAsset] = useState<InventoryAsset | null>(null);

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
    const map: Record<string, { id: string; name: string }> = {};
    for (const asset of assets) {
      if (!asset.originalItemId) continue;
      const item = itemMap[asset.originalItemId];
      if (!item) continue;
      const event = eventMap[item.eventId];
      if (event) map[asset.id] = { id: event.id, name: event.name };
    }
    return map;
  }, [assets, allItems, allEvents]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Ativo excluído." }); setDeleting(null); },
    onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/inventory/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setQuickEdit(null); toast({ title: "Item atualizado" }); },
    onError: () => toast({ title: "Erro ao atualizar.", variant: "destructive" }),
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
    ({ value: a.autoAdded ? "auto" : "manual", label: a.autoAdded ? "Gráfica" : "Manual" }));
  const franchiseFilterOptions = (() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    eFacetPool('franchise').forEach(a => (a.franchiseTags ?? []).forEach(t => {
      const cur = map.get(t);
      if (cur) cur.count++;
      else map.set(t, { value: t, label: t, count: 1 });
    }));
    return Array.from(map.values());
  })();

  const TH: React.CSSProperties = {
    padding: "14px 20px", fontSize: 10, fontWeight: 800, letterSpacing: "0.14em",
    textTransform: "uppercase", color: "#fff", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "#0f172a", borderBottom: "none",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "18px 24px", verticalAlign: "middle",
    fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13, color: "#0f172a",
    borderBottom: "1px solid rgba(241,245,249,0.8)",
  };

  return (
    <div style={{ padding: isMobile ? "14px 16px" : "32px 36px", background: "#f8fafc", height: "100%", overflowY: "auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", flexWrap: "wrap", gap: isMobile ? 12 : 0, marginBottom: isMobile ? 20 : 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: "#c2610c", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 12px 32px rgba(194,97,12,0.30)" }}>
            <Archive size={22} color="#fff" strokeWidth={2.2} />
          </div>
          <div>
            <h1 style={{ margin: "0 0 3px", fontSize: 28, fontWeight: 900, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.03em", lineHeight: 1 }}>
              Estoque
            </h1>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.18em" }}>
              Gestão de ativos físicos de produção gráfica
            </p>
          </div>
        </div>
        <button data-testid="button-new-asset" onClick={() => setEditing(null)} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "12px 24px", borderRadius: 12, border: "none",
          background: "#c2610c", color: "#fff", fontSize: 13, cursor: "pointer",
          fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, letterSpacing: "0.06em",
          boxShadow: "0 8px 24px rgba(194,97,12,0.38)",
        }}>
          <span style={{ fontSize: 15, fontWeight: 900 }}>+</span>
          NOVO ATIVO
        </button>
      </div>

      {/* ── Stat cards ── */}
      {/* minmax(0, ...) pelo mesmo motivo do calendario: `1fr` e
          `minmax(AUTO, 1fr)`, e o minimo automatico e o min-content do cartao.
          Em 375px cada coluna vale ~103px, e "Disponivel no deposito" nao cabe
          — as tres trilhas estouravam e a PAGINA inteira ganhava rolagem
          lateral. Com o minimo em 0 o texto quebra e a grade fica na largura. */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, minmax(0, 1fr))" : "repeat(5, minmax(0, 1fr))", gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Total Acervo" value={total} Icon={Package} color="#2563eb"
          subtext="Ativos cadastrados"
          active={!hasFilters}
          onClick={() => { setSearch(""); setFilterStatus([]); setFilterCondition([]); setFilterAutoAdded("all"); setFilterEvent([]); setFilterSponsor([]); setFilterFranchise([]); }}
        />
        <StatCard
          label="Descartados" value={byStatus("DESCARTADO")} Icon={XCircle} color="#6b7280"
          subtext={byStatus("DESCARTADO") > 0 ? "Ver na tabela →" : "Nenhum descartado"}
          subColor={byStatus("DESCARTADO") > 0 ? "#6b7280" : "#94a3b8"}
          active={filterStatus.length === 1 && filterStatus[0] === "DESCARTADO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "DESCARTADO" ? [] : ["DESCARTADO"])}
        />
        <StatCard
          label="No Galpão" value={byStatus("NO_GALPAO")} Icon={Warehouse} color="#16a34a"
          subtext="Disponível no depósito"
          active={filterStatus.length === 1 && filterStatus[0] === "NO_GALPAO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "NO_GALPAO" ? [] : ["NO_GALPAO"])}
        />
        <StatCard
          label="Em Uso" value={byStatus("EM_USO")} Icon={Truck} color="#ea580c"
          subtext="Frota ativa"
          active={filterStatus.length === 1 && filterStatus[0] === "EM_USO"}
          onClick={() => setFilterStatus(filterStatus.length === 1 && filterStatus[0] === "EM_USO" ? [] : ["EM_USO"])}
        />
        <StatCard
          label="Ag. Triagem" value={triageCount} Icon={ScanSearch} color="#b45309"
          subtext={triageCount > 0 ? "Ir para triagem ↗" : "Abrir triagem ↗"}
          subColor={triageCount > 0 ? "#b45309" : "#94a3b8"}
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
          border: `1.5px solid ${active ? "#c2610c" : "#e2e8f0"}`,
          borderRadius: 8, fontSize: 13, fontWeight: 500,
          fontFamily: "Plus Jakarta Sans, sans-serif",
          padding: "0 12px", background: "#fff",
          color: active ? "#c2610c" : "#374151",
          cursor: "pointer", outline: "none",
          transition: "border-color 0.15s",
        });
        return (
          <div style={{
            background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0",
            padding: "16px 20px 18px", marginBottom: 20,
            display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap",
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
                <Search size={14} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input data-testid="input-search-assets" style={{
                  width: "100%", paddingLeft: 34, paddingRight: 12, height: 44,
                  border: `1.5px solid ${search ? "#c2610c" : "#e2e8f0"}`, borderRadius: 8,
                  fontSize: 13, fontWeight: 400, fontFamily: "Plus Jakarta Sans, sans-serif",
                  background: "#fff", color: "#374151", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => (e.target.style.borderColor = "#c2610c")}
                onBlur={e => (e.target.style.borderColor = search ? "#c2610c" : "#e2e8f0")}
                placeholder="Nome..." value={search} onChange={e => setSearch(e.target.value)} />
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
                  color: hasFilters ? "#ef4444" : "#cbd5e1",
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
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>
        {isLoading ? (
          <div data-testid="skeleton-estoque" aria-busy="true" style={{ padding: "8px 24px" }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="animate-pulse" style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 0", borderBottom: i < 5 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ width: 88, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />
                <div style={{ width: 40, height: 40, borderRadius: 8, background: "#e2e8f0", flexShrink: 0 }} />
                <div style={{ flex: 1, height: 12, borderRadius: 6, background: "#e2e8f0" }} />
                <div style={{ width: 130, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />
                <div style={{ width: 84, height: 22, borderRadius: 9999, background: "#e2e8f0", flexShrink: 0 }} />
                <div style={{ width: 70, height: 12, borderRadius: 6, background: "#e2e8f0", flexShrink: 0 }} />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: 72, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#b91c1c", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>Não foi possível carregar o estoque</p>
            <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 16px" }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 72, textAlign: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: 16, background: "#f8fafc", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
              <Archive size={24} color="#cbd5e1" />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 6px", fontFamily: "Space Grotesk, sans-serif" }}>Nenhum ativo encontrado</p>
            <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", margin: 0 }}>Ajuste os filtros ou adicione um novo ativo.</p>
          </div>
        ) : (
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
                  const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                  const cm = conditionMeta(asset.condition);
                  const thumbOk = asset.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(asset.approvalThumbUrl) || asset.approvalThumbUrl.startsWith('/objects/'));
                  const assetSponsors = (asset.sponsorIds ?? []).map(id => sponsors.find(s => s.id === id)).filter(Boolean);
                  return (
                    <tr key={asset.id} data-testid={`row-asset-${asset.id}`}
                      className="group"
                      /* Sem role="button" no <tr> (mantém a semântica de row);
                         o acesso por teclado é do botão Eye ("Ver detalhes"). */
                      onClick={() => setViewingAsset(asset)}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "#f8fafc"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                      style={{ transition: "background 0.12s", cursor: "pointer", borderBottom: "1px solid rgba(226,232,240,0.6)" }}
                    >
                      {/* ID — #9a3412: o #c2610c dava 4,17:1 e reprovava AA */}
                      <td style={{ ...TD, paddingLeft: 24 }}>
                        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 600, color: "#9a3412" }}>
                          {asset.displayId}
                        </span>
                      </td>

                      {/* Ativo: thumb + name + qty + sponsors */}
                      <td style={{ ...TD, maxWidth: 260 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                          {/* Thumbnail */}
                          <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", background: "#f1f5f9", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {thumbOk
                              ? <img src={asset.approvalThumbUrl!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              : <Package size={16} color="#cbd5e1" />
                            }
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
                                {asset.name}
                              </span>
                              <span style={{
                                display: "inline-flex", alignItems: "center", justifyContent: "center",
                                padding: "1px 6px", borderRadius: 4,
                                background: (asset.quantity ?? 1) > 1 ? "#c2610c" : "#f1f5f9",
                                color: (asset.quantity ?? 1) > 1 ? "#fff" : "#94a3b8",
                                fontSize: 10, fontWeight: 800, fontFamily: "DM Mono, monospace", flexShrink: 0,
                              }}>×{asset.quantity ?? 1}</span>
                            </div>
                            {assetEventMap[asset.id] && (
                              <div style={{ display: "flex", alignItems: "center", gap: 3, marginTop: 3 }}>
                                <CalendarDays size={9} color="#64748b" />
                                <span style={{ fontSize: 10, color: "#64748b", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
                                  {assetEventMap[asset.id].name}
                                </span>
                              </div>
                            )}
                            {assetSponsors.length > 0 && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                                {assetSponsors.slice(0, 2).map(sp => (
                                  <span key={sp!.id} style={{
                                    padding: "1px 5px", borderRadius: 4,
                                    background: "rgba(194,97,12,0.08)", color: "#c2610c",
                                    fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                                    letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
                                  }}>{sp!.name}</span>
                                ))}
                                {assetSponsors.length > 2 && (
                                  <span style={{ fontSize: 9, color: "#94a3b8", fontFamily: "DM Mono, monospace", alignSelf: "center" }}>+{assetSponsors.length - 2}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Localização + franquias */}
                      <td style={TD}>
                        <div>
                          {asset.location ? (
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif", display: "block" }}>
                              {asset.location}
                            </span>
                          ) : (
                            <span style={{ color: "#cbd5e1", fontSize: 12, display: "block" }}>—</span>
                          )}
                          <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {asset.autoAdded ? "Gráfica" : "Manual"}
                          </span>
                          {(asset.franchiseTags ?? []).length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                              {(asset.franchiseTags ?? []).map(t => (
                                <span key={t} style={{
                                  padding: "1px 6px", borderRadius: 4,
                                  background: "#eff6ff", color: "#1d4ed8",
                                  fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif",
                                  letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap",
                                }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Condição — edição rápida via ui/popover: portal (não é
                          cortado pela tabela), abre para cima quando falta
                          espaço, fecha por Escape/clique-fora via Radix. */}
                      <td style={TD} onClick={e => e.stopPropagation()}>
                        <Popover
                          open={quickEdit?.assetId === asset.id && quickEdit.field === "condition"}
                          onOpenChange={open => setQuickEdit(open ? { assetId: asset.id, field: "condition" } : null)}
                        >
                          <PopoverTrigger asChild>
                            <button data-testid={`button-quick-condition-${asset.id}`}
                              style={{
                                padding: "3px 10px", borderRadius: 9999, border: "none",
                                background: cm.bg, color: cm.color,
                                fontSize: 10, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif",
                                cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap",
                              }}>
                              {cm.label}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="start" sideOffset={4} className="w-auto p-1.5"
                            style={{ minWidth: 130, borderRadius: 10, display: "flex", flexDirection: "column", gap: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}
                            onClick={e => e.stopPropagation()}
                          >
                            {/* Congelado enquanto SAI: o painel fecha e a página
                                continua renderizando — ver popover-congelado.test.ts. */}
                            <FreezeWhileClosing open={quickEdit?.assetId === asset.id && quickEdit.field === "condition"}>
                            {CONDITIONS.map(c => {
                              const meta = CONDITION_META[c];
                              return (
                                <button key={c} disabled={patchMutation.isPending}
                                  onClick={e => { e.stopPropagation(); patchMutation.mutate({ id: asset.id, data: { condition: c } }); }}
                                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, border: "none", background: asset.condition === c ? meta.bg : "transparent", color: asset.condition === c ? meta.color : "#475569", fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: patchMutation.isPending ? "wait" : "pointer", opacity: patchMutation.isPending ? 0.55 : 1, textAlign: "left", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                  {asset.condition === c && <CheckCircle2 size={11} />}
                                  {meta.label}
                                </button>
                              );
                            })}
                          </FreezeWhileClosing>
                          </PopoverContent>
                        </Popover>
                      </td>

                      {/* Status — dot + label */}
                      <td style={TD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ width: 7, height: 7, borderRadius: "50%", background: sm.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: sm.color, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                            {sm.label}
                          </span>
                        </div>
                      </td>

                      {/* Actions — opacidade base 0.7 e revelação total por
                          hover/focus-within da linha via CSS (.group/.row-actions). */}
                      <td style={{ ...TD, textAlign: "right", paddingRight: 20 }}>
                        <div className="row-actions" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, transition: "opacity 0.15s" }}>

                          {/* View detail */}
                          <button data-testid={`button-view-asset-${asset.id}`}
                            title="Ver detalhes" aria-label={`Ver detalhes de ${asset.name}`}
                            onClick={e => { e.stopPropagation(); setViewingAsset(asset); }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f97316"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 7, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Eye size={14} />
                          </button>

                          {/* Edit */}
                          <button data-testid={`button-edit-asset-${asset.id}`}
                            title="Editar" aria-label="Editar"
                            onClick={e => { e.stopPropagation(); setEditing(asset); }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#2563eb"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 7, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Pencil size={14} />
                          </button>

                          {/* Delete */}
                          <button data-testid={`button-delete-asset-${asset.id}`}
                            title="Excluir" aria-label="Excluir"
                            onClick={e => { e.stopPropagation(); setDeleting(asset); }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#ef4444"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(239,68,68,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 7, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Table footer — "N de M" comparava conjuntos diferentes (o M
                excluía descartados) e produzia "12 de 8". Agora: total exibido
                + quantos registros os filtros estão ocultando. */}
            <div style={{ padding: "16px 24px", background: "rgba(248,250,252,0.8)", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {(() => {
                const baseline = acervoAssets.filter(a => filterStatus.length > 0 || a.trackingStatus !== "DESCARTADO").length;
                const ocultos = Math.max(0, baseline - filtered.length);
                return (
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8" }}>
                    Exibindo <span style={{ color: "#0f172a" }}>{filtered.length}</span> {filtered.length === 1 ? "registro" : "registros"}
                    {ocultos > 0 && <span> ({ocultos} {ocultos === 1 ? "oculto" : "ocultos"} pelos filtros)</span>}
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
