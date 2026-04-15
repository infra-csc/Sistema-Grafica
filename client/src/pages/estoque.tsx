import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { InventoryAsset, Sponsor, Event } from "@shared/schema";
import {
  Archive, Plus, Search, Pencil, Trash2, CheckCircle2, AlertTriangle,
  XCircle, MapPin, Tag, X, Package, Warehouse, Truck, ScanSearch, Flame, CalendarDays,
  TrendingUp, Grid3X3, Eye, Check, Sparkles, Hammer, Layers, ClipboardCheck,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Status meta ─────────────────────────────────────────────────────────────
const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  NO_GALPAO:          { label: "No Galpão",   color: "#16a34a", bg: "rgba(22,163,74,0.10)"  },
  EM_USO:             { label: "Em Uso",       color: "#ea580c", bg: "rgba(234,88,12,0.10)"  },
  AGUARDANDO_TRIAGEM: { label: "Ag. Triagem",  color: "#b45309", bg: "rgba(180,83,9,0.10)"   },
  DESCARTADO:         { label: "Descartado",   color: "#6b7280", bg: "rgba(107,114,128,0.10)"},
};
const ALL_STATUSES = ["NO_GALPAO", "EM_USO", "AGUARDANDO_TRIAGEM", "DESCARTADO"] as const;
type TrackingStatus = typeof ALL_STATUSES[number];

// ─── Condition meta ───────────────────────────────────────────────────────────
const CONDITION_META: Record<string, { label: string; color: string; bg: string }> = {
  PERFEITO:    { label: "Perfeito",    color: "#16a34a", bg: "rgba(22,163,74,0.08)"  },
  AVARIA_LEVE: { label: "Avaria Leve", color: "#d97706", bg: "rgba(217,119,6,0.08)"  },
  SUCATA:      { label: "Sucata",      color: "#dc2626", bg: "rgba(220,38,38,0.08)"  },
};
const CONDITIONS = ["PERFEITO", "AVARIA_LEVE", "SUCATA"] as const;
type Condition = typeof CONDITIONS[number];

// ─── Status badge (pill + dot) ────────────────────────────────────────────────
function StatusBadge({ color, bg, label, dot }: { color: string; bg: string; label: string; dot?: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "5px 12px", borderRadius: 9999,
      fontSize: 12, fontWeight: 600,
      fontFamily: "Plus Jakarta Sans, sans-serif",
      color, background: bg,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot ?? color, flexShrink: 0 }} />
      {label}
    </span>
  );
}

// ─── Condition badge (compact) ────────────────────────────────────────────────
function ConditionBadge({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      padding: "3px 10px", borderRadius: 6,
      fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
      fontFamily: "Space Grotesk, sans-serif",
      color, background: bg,
    }}>
      {label}
    </span>
  );
}

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
        background: active ? `linear-gradient(135deg, ${color}18 0%, ${color}06 100%)` : "#fff",
        padding: 24, borderRadius: 20, position: "relative", overflow: "hidden",
        border: `1px solid ${on ? color + "50" : "#e2e8f0"}`,
        boxShadow: on ? `0 8px 24px ${color}18` : "0 1px 3px rgba(0,0,0,0.04)",
        transition: "border-color 0.2s, box-shadow 0.2s, background 0.2s",
        cursor: onClick ? "pointer" : "default",
        display: "flex", flexDirection: "column", gap: 6,
        outline: active ? `2px solid ${color}40` : "none", outlineOffset: 2,
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Top row: icon left, label right */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Icon size={22} color={on ? color : color + "bb"} style={{ transition: "color 0.2s" }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: on ? color : "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", transition: "color 0.2s", textAlign: "right" }}>
          {label}
        </span>
      </div>
      {/* Value */}
      <p style={{ margin: 0, fontSize: 30, fontWeight: 800, color: "#0f172a", fontFamily: "Space Grotesk, sans-serif", letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value.toLocaleString("pt-BR")}
      </p>
      {/* Subtext */}
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.08em", color: subColor ?? "#94a3b8" }}>
        {subtext}
      </p>
      {/* Watermark icon bottom-right */}
      <div style={{ position: "absolute", right: -8, bottom: -8, opacity: 0.05, transform: "scale(2)", pointerEvents: "none" }}>
        <Icon size={64} color={color} />
      </div>
    </div>
  );
}

// ─── Sponsor avatar stack ─────────────────────────────────────────────────────
function SponsorStack({ sponsorIds, sponsors }: { sponsorIds: string[]; sponsors: Sponsor[] }) {
  if (!sponsorIds || sponsorIds.length === 0)
    return <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
  const matched = sponsorIds.map(id => sponsors.find(s => s.id === id)).filter(Boolean) as Sponsor[];
  const shown = matched.slice(0, 4);
  const extra = matched.length - shown.length;
  const COLORS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4"];
  return (
    <div style={{ display: "flex" }}>
      {shown.map((sp, i) => {
        const initials = sp.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
        const fg = COLORS[i % COLORS.length];
        return (
          <div key={sp.id} title={sp.name} style={{
            width: 28, height: 28, borderRadius: "50%",
            border: "2px solid #fff", background: fg + "18",
            marginLeft: i === 0 ? 0 : -10,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 8, fontWeight: 700, color: fg,
            fontFamily: "Space Grotesk, sans-serif",
            boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            zIndex: shown.length - i, position: "relative",
          }}>
            {initials}
          </div>
        );
      })}
      {extra > 0 && (
        <div style={{
          width: 28, height: 28, borderRadius: "50%", border: "2px solid #fff",
          background: "#f1f5f9", marginLeft: -10, position: "relative",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 700, color: "#64748b", fontFamily: "Space Grotesk, sans-serif",
          boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        }}>
          +{extra}
        </div>
      )}
    </div>
  );
}

// ─── Art thumbnail with hover popover ────────────────────────────────────────
function ArtThumb({ url }: { url: string }) {
  const [show, setShow] = useState(false);
  const [failed, setFailed] = useState(false);
  const handleError = () => setFailed(true);
  return (
    <div style={{ position: "relative", display: "inline-block", cursor: failed ? "default" : "zoom-in" }}
      onMouseEnter={() => !failed && setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 8, overflow: "hidden",
        border: `2px solid ${show ? "rgba(37,99,235,0.3)" : "#e2e8f0"}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        transition: "border-color 0.15s",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#f1f5f9",
      }}>
        {failed
          ? <Package size={15} color="#94a3b8" />
          : <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={handleError} />
        }
      </div>
      {show && !failed && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 10px)", left: 0,
          background: "#fff", borderRadius: 12, padding: 6,
          boxShadow: "0 20px 60px rgba(0,0,0,0.18)", zIndex: 9999,
          border: "1px solid #e2e8f0",
          transform: "scale(1)", opacity: 1,
          transformOrigin: "bottom left",
        }}>
          <img src={url} alt="" style={{ width: 192, height: 192, borderRadius: 8, objectFit: "cover", display: "block" }} onError={handleError} />
          <p style={{ textAlign: "center", fontSize: 10, color: "#94a3b8", margin: "5px 0 0", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Arte aprovada
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────────────────
function DeleteModal({ asset, onClose, onConfirm }: {
  asset: InventoryAsset; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: 420, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ background: "#ef4444", padding: "16px 20px" }}>
          <p style={{ color: "#fff", fontWeight: 800, fontSize: 13, fontFamily: "Space Grotesk, sans-serif", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Atenção: Ação Irreversível
          </p>
        </div>
        <div style={{ padding: 24 }}>
          <p style={{ fontSize: 14, color: "#1e293b", margin: "0 0 8px", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
            Tem certeza que deseja excluir este ativo permanentemente?
          </p>
          <p style={{ fontSize: 12, color: "#64748b", fontFamily: "DM Mono, monospace", margin: "0 0 24px" }}>
            {asset.displayId} — {asset.name}
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onClose} data-testid="button-cancel-delete" style={{
              padding: "9px 18px", borderRadius: 10, border: "1px solid #e2e8f0",
              background: "#f8fafc", color: "#1e293b", fontSize: 13, cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 600,
            }}>Manter</button>
            <button onClick={onConfirm} data-testid="button-confirm-delete" style={{
              padding: "9px 18px", borderRadius: 10, border: "none",
              background: "#ef4444", color: "#fff", fontSize: 13, cursor: "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
            }}>Sim, Excluir</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Asset Detail Modal (Eye button) ─────────────────────────────────────────
function AssetDetailModal({ asset, linkedItem, sponsors, onClose, onSaved }: {
  asset: InventoryAsset;
  linkedItem?: any;
  sponsors: Sponsor[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [condition, setCondition] = useState<Condition>((asset.condition as Condition) ?? "PERFEITO");
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>((asset.trackingStatus as TrackingStatus) ?? "NO_GALPAO");
  const [notes, setNotes] = useState(asset.notes ?? "");
  const [saved, setSaved] = useState(false);

  const assetSponsors = (asset.sponsorIds ?? []).map(id => sponsors.find(s => s.id === id)).filter(Boolean) as Sponsor[];
  const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
  const ts = asset.trackingStatus;

  const step2Done = ts === "EM_USO" || ts === "AGUARDANDO_TRIAGEM" || ts === "DESCARTADO" || ts === "NO_GALPAO";
  const step2Active = ts === "EM_USO";
  const step3Active = ts === "AGUARDANDO_TRIAGEM";
  const step3Done = ts === "DESCARTADO" || ts === "NO_GALPAO";

  const eventName = linkedItem?.event?.name ?? null;
  const eventDate = linkedItem?.event?.startDate ?? null;

  const mutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/inventory/${asset.id}`, { condition, trackingStatus, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setSaved(true);
      toast({ title: "Ativo atualizado com sucesso." });
      setTimeout(() => onSaved(), 800);
    },
    onError: () => toast({ title: "Erro ao salvar.", variant: "destructive" }),
  });

  const conditionBtns: { key: Condition; label: string; Icon: React.ElementType; color: string; bg: string; border: string }[] = [
    { key: "PERFEITO",    label: "Perfeito",    Icon: Sparkles, color: "#16a34a", bg: "#dcfce7", border: "#86efac" },
    { key: "AVARIA_LEVE", label: "Avaria Leve", Icon: Hammer,   color: "#d97706", bg: "#fef3c7", border: "#fcd34d" },
    { key: "SUCATA",      label: "Sucata",      Icon: Trash2,   color: "#dc2626", bg: "#fee2e2", border: "#fca5a5" },
  ];

  const destBtns: { key: TrackingStatus; label: string; Icon: React.ElementType; color: string; bg: string; border: string }[] = [
    { key: "NO_GALPAO",  label: "Galpão Central", Icon: Warehouse, color: "#1e40af", bg: "#eff6ff", border: "#93c5fd" },
    { key: "EM_USO",     label: "Em Uso",         Icon: Truck,     color: "#ea580c", bg: "#fff7ed", border: "#fdba74" },
    { key: "DESCARTADO", label: "Descartar",      Icon: Trash2,    color: "#991b1b", bg: "#fef2f2", border: "#fca5a5" },
  ];

  const sidebarDot = (done: boolean, active: boolean, icon: React.ReactElement) => (
    <div style={{
      position: "absolute", left: -21, top: 0,
      width: 22, height: 22, borderRadius: "50%",
      background: done ? "#f97316" : active ? "rgba(249,115,22,0.15)" : "#1f2937",
      border: active ? "1.5px solid #f97316" : done ? "none" : "1px solid #374151",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: active ? "0 0 0 4px rgba(249,115,22,0.08)" : "none",
    }}>
      {done ? <Check size={11} color="#fff" strokeWidth={3} /> : icon}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "row", width: "min(1040px, calc(100vw - 48px))", maxHeight: "90vh", borderRadius: 16, overflow: "hidden", boxShadow: "0 32px 64px -12px rgba(0,0,0,0.45)" }}>

        {/* ── Sidebar ── */}
        <aside style={{ width: 280, flexShrink: 0, background: "#1c1917", display: "flex", flexDirection: "column", padding: "28px 24px" }}>
          {/* Brand */}
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 900, fontSize: 24, color: "#f9f9f8", letterSpacing: "-0.05em", lineHeight: 1 }}>NORTE</div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.2em", marginTop: 3 }}>LOGISTICS APEX</div>
          </div>

          {/* Rastreabilidade */}
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 20 }}>
              Rastreabilidade
            </div>
            <div style={{ position: "relative", paddingLeft: 32 }}>
              <div style={{ position: "absolute", left: 11, top: 12, bottom: 24, width: 1, background: "rgba(255,255,255,0.1)" }} />

              {/* Saída do Estoque */}
              <div style={{ position: "relative", marginBottom: 24 }}>
                {sidebarDot(true, false, <Archive size={11} color="#9ca3af" />)}
                <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 13, color: "#f9f9f8" }}>Saída do Estoque</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textTransform: "uppercase" }}>
                  {eventDate ? format(new Date(eventDate), "dd MMM yyyy", { locale: ptBR }) : "—"}
                </div>
              </div>

              {/* Em Uso no Evento */}
              <div style={{ position: "relative", marginBottom: 24 }}>
                {sidebarDot(step2Done, step2Active, <Truck size={11} color="#9ca3af" />)}
                <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step2Active ? 700 : 600, fontSize: 13, color: step2Active ? "#f97316" : "#e5e7eb" }}>
                  {eventName ?? "Em Uso no Evento"}
                </div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textTransform: "uppercase" }}>
                  {eventDate ? format(new Date(eventDate), "dd MMM yyyy", { locale: ptBR }) : "—"}
                </div>
              </div>

              {/* Aguardando Triagem */}
              <div style={{ position: "relative" }}>
                {sidebarDot(step3Done, step3Active, <ClipboardCheck size={11} color={step3Active ? "#f97316" : "#9ca3af"} />)}
                <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: step3Active ? 700 : 600, fontSize: 13, color: step3Active ? "#f97316" : "#e5e7eb" }}>
                  Aguardando Triagem
                </div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2, textTransform: "uppercase" }}>
                  {step3Active ? "Agora · Em análise" : step3Done ? "Concluído" : "Pendente"}
                </div>
              </div>
            </div>

            {/* Sponsors */}
            {assetSponsors.length > 0 && (
              <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 12 }}>Patrocinadores</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {assetSponsors.map(s => (
                    <div key={s.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 8px", background: "#292524", borderRadius: 4, border: "1px solid rgba(255,255,255,0.07)" }}>
                      <Tag size={8} color="#6b7280" />
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#d1d5db", textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer card — Localização Técnica */}
          <div style={{ background: "rgba(255,255,255,0.05)", padding: 16, borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", marginTop: 20, flexShrink: 0 }}>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 6 }}>
              Localização Técnica
            </div>
            <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 800, fontSize: 15, color: "#f9f9f8", letterSpacing: "-0.03em", wordBreak: "break-word" }}>
              {asset.location ?? "—"}
            </div>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase" }}>Condição</span>
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "DM Mono, monospace", color: CONDITION_META[asset.condition ?? "PERFEITO"].color }}>
                {CONDITION_META[asset.condition ?? "PERFEITO"].label.toUpperCase()}
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

            {/* Classification section */}
            <section style={{ position: "relative" }}>
              <div style={{ position: "absolute", top: -10, left: 20, zIndex: 2, background: "#9d4300", color: "#fff", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", padding: "3px 10px", borderRadius: 4 }}>
                Classificação do Ativo
              </div>
              <div style={{ background: "#fff", border: "2px solid #9d4300", borderRadius: 10, padding: "28px 24px 24px", boxShadow: "0 4px 24px rgba(157,67,0,0.08)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

                  {/* Condição */}
                  <div>
                    <label style={{ display: "block", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>
                      Condição do Item
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {conditionBtns.map(btn => {
                        const active = condition === btn.key;
                        return (
                          <button key={btn.key} onClick={() => setCondition(btn.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 6px", borderRadius: 8, border: active ? `2px solid ${btn.border}` : "1.5px solid #e2e8f0", background: active ? btn.bg : "#f8fafc", cursor: "pointer", transition: "all 0.15s" }}>
                            <btn.Icon size={18} color={active ? btn.color : "#94a3b8"} />
                            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: active ? btn.color : "#64748b" }}>{btn.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Destino / Status */}
                  <div>
                    <label style={{ display: "block", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>
                      Status / Destino
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {destBtns.map(btn => {
                        const active = trackingStatus === btn.key;
                        return (
                          <button key={btn.key} onClick={() => setTrackingStatus(btn.key)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "12px 8px", borderRadius: 8, border: active ? `2px solid ${btn.border}` : "1.5px solid #e2e8f0", background: active ? btn.bg : "#f8fafc", cursor: "pointer", transition: "all 0.15s", flexDirection: "column" }}>
                            <btn.Icon size={16} color={active ? btn.color : "#94a3b8"} />
                            <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 10, color: active ? btn.color : "#64748b", whiteSpace: "nowrap", textAlign: "center" }}>{btn.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Observações */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
                      Observações
                    </label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)}
                      placeholder="Informações adicionais sobre o estado do ativo..."
                      style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 8, border: "1.5px solid #e2e8f0", background: "#f8fafc", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13, color: "#1e293b", resize: "vertical", minHeight: 72, outline: "none", lineHeight: 1.5 }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#f97316"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#f8fafc"; }}
                    />
                  </div>
                </div>

                {/* Save row */}
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
                  {saved && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={14} color="#16a34a" />
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, color: "#16a34a" }}>Salvo!</span>
                    </div>
                  )}
                  <button onClick={() => mutation.mutate()} disabled={mutation.isPending || saved}
                    data-testid="button-save-asset-detail"
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 28px", borderRadius: 8, border: "none", background: saved ? "#f1f5f9" : "#9d4300", color: saved ? "#94a3b8" : "#fff", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: (mutation.isPending || saved) ? "default" : "pointer", boxShadow: saved ? "none" : "0 4px 16px rgba(157,67,0,0.28)", transition: "all 0.15s", opacity: mutation.isPending ? 0.7 : 1 }}>
                    {mutation.isPending ? "Salvando..." : saved ? "Salvo" : "Salvar Alterações"}
                  </button>
                </div>
              </div>
            </section>

            {/* Info grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Event info */}
              <div style={{ background: "#fff", borderRadius: 10, padding: "20px 22px", border: "1px solid rgba(226,226,226,0.8)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h4 style={{ margin: 0, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em" }}>Informações do Evento</h4>
                  <CalendarDays size={15} color="#94a3b8" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "Evento",      value: eventName ?? "—" },
                    { label: "Data",        value: eventDate ? format(new Date(eventDate), "dd MMM yyyy", { locale: ptBR }) : "—" },
                    { label: "Qtd. Total",  value: `${asset.quantity ?? 1} un.` },
                    { label: "Localização", value: asset.location ?? "—" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 11, color: "#1f2937", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Specs */}
              <div style={{ background: "#fff", borderRadius: 10, padding: "20px 22px", border: "1px solid rgba(226,226,226,0.8)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <h4 style={{ margin: 0, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, color: "#374151", textTransform: "uppercase", letterSpacing: "0.08em" }}>Especificações Técnicas</h4>
                  <Layers size={15} color="#94a3b8" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "Tipo",       value: linkedItem?.type ?? "—" },
                    { label: "Material",   value: linkedItem?.material ?? "—" },
                    { label: "Medida",     value: linkedItem?.measurement ?? "—" },
                    { label: "Dimensões",  value: linkedItem?.visualWidth && linkedItem?.visualHeight ? `${linkedItem.visualWidth} × ${linkedItem.visualHeight}` : "—" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, padding: "9px 0", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 11, color: "#1f2937", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Approval thumb reference */}
            {asset.approvalThumbUrl && (
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "21/9" }}>
                <img src={asset.approvalThumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "grayscale(0.25)", opacity: 0.85 }}
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
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
      </div>
    </div>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: 480, overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Grid3X3 size={18} color="#f97316" />
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a" }}>Mapa do Galpão</p>
              <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>Clique para selecionar a localização</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <X size={14} />
          </button>
        </div>
        <div style={{ padding: 20 }}>
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
                      color: isSelected ? "#fff" : isHov ? "#f97316" : "#94a3b8",
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
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
            Confirmar
          </button>
        </div>
      </div>
    </div>
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
    fontSize: 10, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
    textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 6,
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 20, width: 500, maxHeight: "90vh", overflow: "auto", boxShadow: "0 25px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ background: "#f97316", padding: "20px 24px", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Archive size={22} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#fff", lineHeight: 1 }}>
              {isEdit ? "Editar Ativo" : "Cadastrar Novo Ativo"}
            </h3>
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
            <label style={LBL}>Nome / Descrição *</label>
            <input data-testid="input-asset-name" style={INP} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Banner 3×1m — Patrocinador A" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Quantidade</label>
              <input data-testid="input-asset-quantity" type="number" min={1} style={INP}
                value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: Math.max(1, parseInt(e.target.value) || 1) }))} />
            </div>
            <div>
              <label style={LBL}>Localização</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input data-testid="input-asset-location" style={{ ...INP, flex: 1 }} value={form.location}
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
              onSelect={loc => { setForm(f => ({ ...f, location: loc })); setShowMapa(false); }}
              onClose={() => setShowMapa(false)}
            />
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={LBL}>Condição</label>
              <select data-testid="select-asset-condition" style={{ ...INP, cursor: "pointer" }}
                value={form.condition} onChange={e => setForm(f => ({ ...f, condition: e.target.value as Condition }))}>
                {CONDITIONS.map(c => <option key={c} value={c}>{CONDITION_META[c].label}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Status</label>
              <select data-testid="select-asset-status" style={{ ...INP, cursor: "pointer" }}
                value={form.trackingStatus} onChange={e => setForm(f => ({ ...f, trackingStatus: e.target.value as TrackingStatus }))}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={LBL}>Patrocinadores</label>
            {allSponsors.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontStyle: "italic" }}>
                Nenhum patrocinador cadastrado no sistema.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
            <label style={LBL}>Observações</label>
            <textarea data-testid="input-asset-notes" style={{ ...INP, minHeight: 72, resize: "vertical" as const }}
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Informações adicionais..." />
          </div>
        </div>
        <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#f1f5f9", color: "#475569", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>Cancelar</button>
          <button data-testid="button-save-asset" disabled={!form.name.trim() || mutation.isPending}
            onClick={() => mutation.mutate(form)} style={{
              padding: "10px 24px", borderRadius: 10, border: "none",
              background: !form.name.trim() ? "#e2e8f0" : "#f97316",
              color: !form.name.trim() ? "#94a3b8" : "#fff",
              fontSize: 13, cursor: !form.name.trim() ? "not-allowed" : "pointer",
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              boxShadow: form.name.trim() ? "0 4px 14px rgba(249,115,22,0.35)" : "none",
            }}>
            {mutation.isPending ? "Salvando..." : "+ SALVAR ATIVO"}
          </button>
        </div>
      </div>
    </div>
  );
}



// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Estoque() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCondition, setFilterCondition] = useState("all");
  const [filterAutoAdded, setFilterAutoAdded] = useState("all");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterSponsor, setFilterSponsor] = useState("all");
  const [editing, setEditing] = useState<InventoryAsset | null | false>(false);
  const [deleting, setDeleting] = useState<InventoryAsset | null>(null);
  const [quickEdit, setQuickEdit] = useState<{ assetId: string; field: "condition" | "status" } | null>(null);
  const [viewingAsset, setViewingAsset] = useState<InventoryAsset | null>(null);

  useEffect(() => {
    if (!quickEdit) return;
    const close = () => setQuickEdit(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [quickEdit]);

  const { data: assets = [], isLoading } = useQuery<InventoryAsset[]>({ queryKey: ["/api/inventory"] });
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

  // Unique events that appear in the current asset list
  const eventOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of Object.values(assetEventMap)) seen.set(v.id, v.name);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [assetEventMap]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inventory/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); toast({ title: "Ativo excluído." }); setDeleting(null); },
    onError: () => toast({ title: "Erro ao excluir.", variant: "destructive" }),
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => apiRequest("PATCH", `/api/inventory/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/inventory"] }); setQuickEdit(null); },
    onError: () => toast({ title: "Erro ao atualizar.", variant: "destructive" }),
  });

  // Exclude AGUARDANDO_TRIAGEM — those belong to the triage screen only
  const acervoAssets = assets.filter(a => a.trackingStatus !== "AGUARDANDO_TRIAGEM");
  const triageCount = assets.filter(a => a.trackingStatus === "AGUARDANDO_TRIAGEM").length;

  const total = acervoAssets.filter(a => a.trackingStatus !== "DESCARTADO").length;
  const byStatus = (s: string) => assets.filter(a => a.trackingStatus === s).length;
  const sucata = acervoAssets.filter(a => a.condition === "SUCATA").length;
  const autoCount = acervoAssets.filter(a => a.autoAdded).length;

  const filtered = acervoAssets.filter(a => {
    // Hide DESCARTADO by default — only show when explicitly filtered
    if (filterStatus === "all" && a.trackingStatus === "DESCARTADO") return false;
    const q = search.toLowerCase();
    const ms = !q || a.name.toLowerCase().includes(q) || a.displayId.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q) || a.franchiseTags.some(t => t.toLowerCase().includes(q));
    const mst = filterStatus === "all" || a.trackingStatus === filterStatus;
    const mc = filterCondition === "all" || a.condition === filterCondition;
    const ma = filterAutoAdded === "all" || (filterAutoAdded === "auto" ? a.autoAdded : !a.autoAdded);
    const me = filterEvent === "all" || assetEventMap[a.id]?.id === filterEvent;
    const msp = filterSponsor === "all" || (a.sponsorIds ?? []).includes(filterSponsor);
    return ms && mst && mc && ma && me && msp;
  });

  const hasFilters = !!(search || filterStatus !== "all" || filterCondition !== "all" || filterAutoAdded !== "all" || filterEvent !== "all" || filterSponsor !== "all");

  const TH: React.CSSProperties = {
    padding: "18px 24px", fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
    textTransform: "uppercase", color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif",
    textAlign: "left", background: "rgba(248,250,252,0.8)", borderBottom: "1px solid #e2e8f0",
    whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "18px 24px", verticalAlign: "middle",
    fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13, color: "#0f172a",
    borderBottom: "1px solid rgba(241,245,249,0.8)",
  };

  return (
    <div style={{ padding: "32px 36px", background: "#f8fafc", minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "#f97316", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 16px 40px rgba(249,115,22,0.28)" }}>
            <Archive size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ margin: "0 0 4px", fontSize: 30, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a", letterSpacing: "-0.02em", lineHeight: 1 }}>
              Estoque
            </h1>
            <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em" }}>
              Gestão de ativos físicos de produção gráfica
            </p>
          </div>
        </div>
        <button data-testid="button-new-asset" onClick={() => setEditing(null)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "14px 28px", borderRadius: 16, border: "none",
          background: "#f97316", color: "#fff", fontSize: 13, cursor: "pointer",
          fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, letterSpacing: "0.08em",
          boxShadow: "0 8px 24px rgba(249,115,22,0.35)",
        }}>
          <Plus size={16} />
          + NOVO ATIVO
        </button>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
        <StatCard
          label="Total Acervo" value={total} Icon={Package} color="#2563eb"
          subtext="Ativos cadastrados"
          active={filterStatus === "all" && filterCondition === "all" && filterAutoAdded === "all"}
          onClick={() => { setFilterStatus("all"); setFilterCondition("all"); setFilterAutoAdded("all"); }}
        />
        <StatCard
          label="Descartados" value={byStatus("DESCARTADO")} Icon={XCircle} color="#6b7280"
          subtext={byStatus("DESCARTADO") > 0 ? "Ver na tabela →" : "Nenhum descartado"}
          subColor={byStatus("DESCARTADO") > 0 ? "#6b7280" : "#94a3b8"}
          active={filterStatus === "DESCARTADO"}
          onClick={() => setFilterStatus(filterStatus === "DESCARTADO" ? "all" : "DESCARTADO")}
        />
        <StatCard
          label="No Galpão" value={byStatus("NO_GALPAO")} Icon={Warehouse} color="#0369a1"
          subtext={total ? `${Math.round(byStatus("NO_GALPAO")/total*100)}% disponível` : "0% disponível"} subColor="#0369a1"
          active={filterStatus === "NO_GALPAO"}
          onClick={() => setFilterStatus(filterStatus === "NO_GALPAO" ? "all" : "NO_GALPAO")}
        />
        <StatCard
          label="Em Uso" value={byStatus("EM_USO")} Icon={Truck} color="#ea580c"
          subtext="Frota ativa"
          active={filterStatus === "EM_USO"}
          onClick={() => setFilterStatus(filterStatus === "EM_USO" ? "all" : "EM_USO")}
        />
        <StatCard
          label="Ag. Triagem" value={triageCount} Icon={ScanSearch} color="#b45309"
          subtext={triageCount > 0 ? "Ir para triagem →" : "Nenhum pendente"}
          subColor={triageCount > 0 ? "#b45309" : "#94a3b8"}
          onClick={() => navigate("/triagem-retorno")}
        />
      </div>

      {/* ── Filter bar ── */}
      <div style={{
        background: "#fff", padding: "12px 16px", borderRadius: 20,
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 20px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04)",
        marginBottom: 20, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
      }}>
        <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
          <Search size={16} color="#94a3b8" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
          <input data-testid="input-search-assets" style={{
            width: "100%", paddingLeft: 40, paddingRight: 14, height: 42,
            border: "none", borderRadius: 12, fontSize: 13, fontWeight: 500,
            background: "#f8fafc", color: "#0f172a", outline: "none", boxSizing: "border-box",
            fontFamily: "Plus Jakarta Sans, sans-serif",
          }} placeholder="Buscar por ID, nome, local ou tag..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ width: 1, height: 32, background: "#f1f5f9" }} />

        {[
          { val: filterStatus,    fn: setFilterStatus,    opts: [["all","STATUS: TODOS"], ...ALL_STATUSES.filter(s => s !== "AGUARDANDO_TRIAGEM").map(s => [s, STATUS_META[s].label])] },
          { val: filterCondition, fn: setFilterCondition, opts: [["all","CONDIÇÃO: TODA"], ...CONDITIONS.map(c => [c, CONDITION_META[c].label])] },
          { val: filterAutoAdded, fn: setFilterAutoAdded, opts: [["all","ORIGEM: TODAS"],["auto","Gráfica (Auto)"],["manual","Manual"]] },
        ].map(({ val, fn, opts }, i) => (
          <select key={i} value={val} onChange={e => fn(e.target.value)} style={{
            border: "none", borderRadius: 12, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em",
            padding: "10px 14px", background: "#f8fafc", color: "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}>
            {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}

        {/* Filtro por Evento */}
        <select
          data-testid="select-filter-event"
          value={filterEvent}
          onChange={e => setFilterEvent(e.target.value)}
          style={{
            border: "none", borderRadius: 12, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em",
            padding: "10px 14px",
            background: filterEvent !== "all" ? "#f0f4ff" : "#f8fafc",
            color: filterEvent !== "all" ? "#4338ca" : "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}
        >
          <option value="all">EVENTO: TODOS</option>
          {eventOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        {/* Filtro por Patrocinador */}
        <select
          data-testid="select-filter-sponsor"
          value={filterSponsor}
          onChange={e => setFilterSponsor(e.target.value)}
          style={{
            border: "none", borderRadius: 12, fontSize: 11, fontWeight: 700,
            fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.08em",
            padding: "10px 14px",
            background: filterSponsor !== "all" ? "#faf5ff" : "#f8fafc",
            color: filterSponsor !== "all" ? "#7c3aed" : "#475569",
            cursor: "pointer", outline: "none", textTransform: "uppercase",
          }}
        >
          <option value="all">PATROCINADOR: TODOS</option>
          {sponsors.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <div style={{ width: 1, height: 32, background: "#f1f5f9" }} />

        {hasFilters && (
          <button data-testid="button-clear-filters" onClick={() => { setSearch(""); setFilterStatus("all"); setFilterCondition("all"); setFilterAutoAdded("all"); setFilterEvent("all"); setFilterSponsor("all"); }} style={{
            display: "flex", alignItems: "center", gap: 4, padding: "9px 12px", borderRadius: 10,
            border: "none", background: "#fef2f2", color: "#ef4444", fontSize: 11, cursor: "pointer",
            fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
          }}>
            <X size={11} /> Limpar
          </button>
        )}

        <span style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, marginLeft: "auto", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {filtered.length} / {total} registros
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)" }}>
        {isLoading ? (
          <div style={{ padding: 60, textAlign: "center", color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 14 }}>
            Carregando estoque...
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead>
                <tr>
                  {["Identificador","Equipamento / Ativo","Status","Condição","Patrocinadores","Ações"].map((h, i) => (
                    <th key={h} style={{ ...TH, textAlign: i === 5 ? "right" : "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(asset => {
                  const sm = STATUS_META[asset.trackingStatus ?? "NO_GALPAO"];
                  const cm = CONDITION_META[asset.condition ?? "PERFEITO"];
                  return (
                    <tr key={asset.id} data-testid={`row-asset-${asset.id}`}
                      className="group"
                      onClick={() => setViewingAsset(asset)}
                      onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = "rgba(248,250,252,0.6)"}
                      onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = ""}
                      style={{ transition: "background 0.1s", cursor: "pointer" }}
                    >
                      {/* ID pill */}
                      <td style={TD}>
                        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, fontWeight: 700, color: "#64748b", background: "rgba(241,245,249,0.7)", padding: "3px 8px", borderRadius: 6, display: "inline-block" }}>
                          {asset.displayId}
                        </span>
                      </td>

                      {/* Name + qtd + evento */}
                      <td style={TD}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a", fontFamily: "Plus Jakarta Sans, sans-serif" }}>
                            {asset.name}
                          </p>
                          <span style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            minWidth: 24, height: 18, borderRadius: 5,
                            background: (asset.quantity ?? 1) > 1 ? "#0f172a" : "#f1f5f9",
                            color: (asset.quantity ?? 1) > 1 ? "#fff" : "#94a3b8",
                            fontSize: 10, fontWeight: 800, fontFamily: "DM Mono, monospace", padding: "0 5px",
                          }}>×{asset.quantity ?? 1}</span>
                        </div>
                        {assetEventMap[asset.id] && (
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3 }}>
                            <CalendarDays size={10} color="#2563eb" />
                            <span style={{ fontSize: 10, color: "#2563eb", fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600 }}>
                              {assetEventMap[asset.id].name}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td style={TD}>
                        <StatusBadge color={sm.color} bg={sm.bg} label={sm.label} />
                      </td>

                      {/* Condition — clicável para edição rápida */}
                      <td style={{ ...TD, position: "relative" }}>
                        <button data-testid={`button-quick-condition-${asset.id}`}
                          onClick={e => { e.stopPropagation(); setQuickEdit(quickEdit?.assetId === asset.id && quickEdit.field === "condition" ? null : { assetId: asset.id, field: "condition" }); }}
                          style={{ padding: "3px 8px", borderRadius: 5, border: "none", background: cm.bg, color: cm.color, fontSize: 10, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                          {cm.label}
                        </button>
                        {quickEdit?.assetId === asset.id && quickEdit.field === "condition" && (
                          <div style={{ position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 50, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 6, display: "flex", flexDirection: "column", gap: 2, minWidth: 130 }}>
                            {CONDITIONS.map(c => {
                              const meta = CONDITION_META[c];
                              return (
                                <button key={c} onClick={e => { e.stopPropagation(); patchMutation.mutate({ id: asset.id, data: { condition: c } }); }}
                                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 7, border: "none", background: asset.condition === c ? meta.bg : "transparent", color: asset.condition === c ? meta.color : "#475569", fontSize: 11, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", cursor: "pointer", textAlign: "left", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                                  {asset.condition === c && <CheckCircle2 size={11} />}
                                  {meta.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </td>

                      {/* Patrocinadores */}
                      <td style={{ ...TD, maxWidth: 180 }}>
                        {(() => {
                          const matched = (asset.sponsorIds ?? []).map(id => sponsors.find(s => s.id === id)).filter(Boolean);
                          return matched.length > 0 ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                              {matched.map(sp => (
                                <span key={sp!.id} style={{
                                  display: "inline-flex", alignItems: "center", gap: 3,
                                  padding: "2px 7px", borderRadius: 5,
                                  background: "#f1f5f9", border: "1px solid #e2e8f0",
                                  fontSize: 9, fontWeight: 700, color: "#475569",
                                  fontFamily: "Space Grotesk, sans-serif", letterSpacing: "0.06em",
                                  textTransform: "uppercase", whiteSpace: "nowrap",
                                }}>
                                  <Tag size={8} />{sp!.name}
                                </span>
                              ))}
                            </div>
                          ) : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>;
                        })()}
                      </td>

                      {/* Actions */}
                      <td style={{ ...TD, textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>

                          {/* View detail */}
                          <button data-testid={`button-view-asset-${asset.id}`}
                            onClick={e => { e.stopPropagation(); setViewingAsset(asset); }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#f97316"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(249,115,22,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 7, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Eye size={14} />
                          </button>

                          {/* Edit */}
                          <button data-testid={`button-edit-asset-${asset.id}`}
                            onClick={e => { e.stopPropagation(); setEditing(asset); }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#2563eb"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(37,99,235,0.08)"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                            style={{ padding: 7, borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", display: "flex", alignItems: "center", transition: "color 0.15s, background 0.15s" }}>
                            <Pencil size={14} />
                          </button>

                          {/* Delete */}
                          <button data-testid={`button-delete-asset-${asset.id}`}
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

            {/* Table footer */}
            <div style={{ padding: "16px 24px", background: "rgba(248,250,252,0.8)", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", textTransform: "uppercase", letterSpacing: "0.15em", color: "#94a3b8" }}>
                Exibindo <span style={{ color: "#0f172a" }}>{filtered.length}</span> de <span style={{ color: "#0f172a" }}>{total}</span> registros
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Hover-show actions via CSS injection */}
      <style>{`tr:hover .group-row-actions { opacity: 1 !important; }`}</style>

      {editing !== false && (
        <AssetModal asset={editing} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />
      )}
      {deleting && (
        <DeleteModal asset={deleting} onClose={() => setDeleting(null)} onConfirm={() => deleteMutation.mutate(deleting.id)} />
      )}
      {viewingAsset && (
        <AssetDetailModal
          asset={viewingAsset}
          linkedItem={getLinkedItem(viewingAsset)}
          sponsors={sponsors}
          onClose={() => setViewingAsset(null)}
          onSaved={() => setViewingAsset(null)}
        />
      )}
    </div>
  );
}
