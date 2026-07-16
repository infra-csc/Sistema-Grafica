import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, ChevronRight, Search, Send, FileDown, Link2,
  Calendar, Truck, Users, AlertTriangle, Clock, CheckCircle2,
  CircleDot, Pencil, Lock, Filter, SlidersHorizontal, ChevronUp,
  Package, Zap, Circle
} from "lucide-react";

// ── Mock data ──────────────────────────────────────────────────────────────────

const EVENTS = [
  {
    id: "e1", name: "BOTA PRA CORRER SP", startDate: "16 AGO 2026", truckDate: "11 AGO 21:00",
    sponsors: 13,
    counts: { PENDENTE: 82, RASCUNHO: 0, PRONTO: 36, ENVIADO: 96 },
    total: 214,
  },
  {
    id: "e2", name: "MEIA MARATONA RIO", startDate: "23 AGO 2026", truckDate: "18 AGO 09:00",
    sponsors: 7,
    counts: { PENDENTE: 45, RASCUNHO: 3, PRONTO: 12, ENVIADO: 28 },
    total: 88,
  },
  {
    id: "e3", name: "CIRCUITO DAS ESTAÇÕES – INVERNO SP", startDate: "07 SET 2026", truckDate: "02 SET 14:00",
    sponsors: 5,
    counts: { PENDENTE: 0, RASCUNHO: 0, PRONTO: 8, ENVIADO: 62 },
    total: 70,
  },
  {
    id: "e4", name: "CORRIDA DAS MULHERES BH", startDate: "14 SET 2026", truckDate: "09 SET 08:00",
    sponsors: 4,
    counts: { PENDENTE: 31, RASCUNHO: 7, PRONTO: 0, ENVIADO: 10 },
    total: 48,
  },
  {
    id: "e5", name: "MARATONA DE CURITIBA", startDate: "05 OUT 2026", truckDate: "30 SET 16:00",
    sponsors: 9,
    counts: { PENDENTE: 18, RASCUNHO: 2, PRONTO: 5, ENVIADO: 41 },
    total: 66,
  },
];

const ITEMS_E2 = [
  { id: "i1", displayId: "#0032", type: "2X1 PADRÃO", spec: "32 ITENS · 12 SEM ATRIBUIÇÃO", uiStatus: "PENDENTE", sponsors: [], isGroup: true },
  { id: "i2", displayId: "#0033", type: "FAIXA LARGO", spec: "Banco Itaú — 6m × 1,5m", uiStatus: "RASCUNHO", sponsors: ["Banco Itaú"], isGroup: false },
  { id: "i3", displayId: "#0034", type: "BACKDROP 3×2", spec: "Globo — 3m × 2m", uiStatus: "PRONTO", sponsors: ["Globo"], isGroup: false },
  { id: "i4", displayId: "#0035", type: "BANNER VERTICAL", spec: "Nike — 0,9m × 2,1m", uiStatus: "ENVIADO", sponsors: ["Nike"], isGroup: false },
  { id: "i5", displayId: "#0036", type: "TOTEM", spec: "Adidas — 0,6m × 1,8m", uiStatus: "PENDENTE", sponsors: [], isGroup: false },
];

// ── Status config ──────────────────────────────────────────────────────────────

const UI_STATUS_CONFIG: Record<string, {
  label: string; dotColor: string; badgeBg: string; badgeText: string;
  icon: React.ReactNode; eventBg: string; eventText: string;
}> = {
  PENDENTE: {
    label: "Pendente", dotColor: "#a8a29e",
    badgeBg: "#f5f5f4", badgeText: "#78716c",
    icon: <Circle size={10} className="shrink-0" />,
    eventBg: "#f5f5f4", eventText: "#44403c",
  },
  RASCUNHO: {
    label: "Rascunho", dotColor: "#f97316",
    badgeBg: "#fff7ed", badgeText: "#c2410c",
    icon: <Pencil size={10} className="shrink-0" />,
    eventBg: "#fff7ed", eventText: "#c2410c",
  },
  PRONTO: {
    label: "Pronto", dotColor: "#22c55e",
    badgeBg: "#f0fdf4", badgeText: "#15803d",
    icon: <CheckCircle2 size={10} className="shrink-0" />,
    eventBg: "#f0fdf4", eventText: "#15803d",
  },
  ENVIADO: {
    label: "Enviado", dotColor: "#1c1917",
    badgeBg: "#f5f5f4", badgeText: "#57534e",
    icon: <Lock size={10} className="shrink-0" />,
    eventBg: "#1c1917", eventText: "#f5f5f4",
  },
};

// ── Event summary card ─────────────────────────────────────────────────────────

function EventSummaryCard({ event, isSelected, onClick }: {
  event: typeof EVENTS[0]; isSelected: boolean; onClick: () => void;
}) {
  const needsAttention = event.counts.PENDENTE > 0 || event.counts.RASCUNHO > 0;
  const hasRascunho = event.counts.RASCUNHO > 0;
  const hasPendente = event.counts.PENDENTE > 0;
  const sentPct = Math.round((event.counts.ENVIADO / event.total) * 100);

  return (
    <button
      onClick={onClick}
      style={{
        minWidth: 220, maxWidth: 260,
        background: isSelected ? "#1c1917" : "#ffffff",
        border: isSelected ? "1.5px solid #1c1917" : "1.5px solid #e7e5e4",
        borderRadius: 10,
        padding: "14px 16px",
        textAlign: "left",
        cursor: "pointer",
        position: "relative",
        transition: "all 0.15s ease",
        flexShrink: 0,
      }}
    >
      {/* Urgency dot */}
      {hasRascunho && !isSelected && (
        <span style={{
          position: "absolute", top: 10, right: 10,
          width: 7, height: 7, borderRadius: "50%",
          background: "#f97316",
        }} />
      )}
      {hasPendente && !hasRascunho && !isSelected && (
        <span style={{
          position: "absolute", top: 10, right: 10,
          width: 7, height: 7, borderRadius: "50%",
          background: "#a8a29e",
        }} />
      )}

      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: "0.04em",
        color: isSelected ? "#f5f5f4" : "#1c1917",
        marginBottom: 4,
        textTransform: "uppercase",
        lineHeight: 1.3,
      }}>
        {event.name}
      </div>

      <div style={{
        fontSize: 10, color: isSelected ? "#a8a29e" : "#78716c",
        marginBottom: 12, display: "flex", gap: 8,
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Calendar size={9} /> {event.startDate}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Truck size={9} /> {event.truckDate}
        </span>
      </div>

      {/* Status counts */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
        {(["PENDENTE", "RASCUNHO", "PRONTO", "ENVIADO"] as const).map(s => {
          const cfg = UI_STATUS_CONFIG[s];
          const count = event.counts[s];
          if (count === 0) return null;
          return (
            <span
              key={s}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                padding: "2px 7px",
                borderRadius: 99,
                fontSize: 10, fontWeight: 600,
                background: isSelected ? "rgba(255,255,255,0.12)" : cfg.badgeBg,
                color: isSelected ? "#f5f5f4" : cfg.badgeText,
              }}
            >
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: isSelected ? "#f5f5f4" : cfg.dotColor,
                flexShrink: 0,
              }} />
              {count}
            </span>
          );
        })}
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: isSelected ? "rgba(255,255,255,0.15)" : "#f5f5f4", borderRadius: 99 }}>
        <div style={{
          height: "100%", width: `${sentPct}%`,
          background: isSelected ? "#f97316" : "#1c1917",
          borderRadius: 99, transition: "width 0.3s ease",
        }} />
      </div>
      <div style={{
        fontSize: 9, color: isSelected ? "#a8a29e" : "#a8a29e",
        marginTop: 4,
      }}>
        {event.counts.ENVIADO}/{event.total} enviados · {event.sponsors} pat.
      </div>
    </button>
  );
}

// ── Status pill (for items table) ─────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg = UI_STATUS_CONFIG[status];
  if (!cfg) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "3px 8px", borderRadius: 99,
      fontSize: 10, fontWeight: 600,
      background: cfg.badgeBg, color: cfg.badgeText,
      whiteSpace: "nowrap",
    }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function VincularPatPage() {
  const [selectedEvent, setSelectedEvent] = useState<string | null>("e2");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["i1"]));
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"item" | "sponsor">("item");

  const toggleGroup = (id: string) =>
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // Counts for global header
  const globalCounts = EVENTS.reduce(
    (acc, e) => {
      acc.PENDENTE += e.counts.PENDENTE;
      acc.RASCUNHO += e.counts.RASCUNHO;
      acc.PRONTO += e.counts.PRONTO;
      acc.ENVIADO += e.counts.ENVIADO;
      return acc;
    },
    { PENDENTE: 0, RASCUNHO: 0, PRONTO: 0, ENVIADO: 0 }
  );

  const selectedEventData = EVENTS.find(e => e.id === selectedEvent);

  const filteredItems = activeStatusFilter
    ? ITEMS_E2.filter(i => i.uiStatus === activeStatusFilter)
    : ITEMS_E2;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#fafaf9",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
    }}>

      {/* ── Top header ── */}
      <div style={{
        padding: "24px 32px 0",
        background: "#ffffff",
        borderBottom: "1px solid #e7e5e4",
      }}>
        {/* Title row */}
        <div style={{
          display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 16,
          marginBottom: 20,
          flexWrap: "wrap",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Link2 size={18} style={{ color: "#1c1917" }} />
              <h1 style={{
                fontSize: 20, fontWeight: 700, color: "#1c1917",
                letterSpacing: "-0.02em", margin: 0,
              }}>
                Vincular Patrocinadores
              </h1>
            </div>
            {/* Global counts pill row */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["PENDENTE","RASCUNHO","PRONTO","ENVIADO"] as const).map(s => {
                const cfg = UI_STATUS_CONFIG[s];
                const count = globalCounts[s];
                return (
                  <span key={s} style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 99,
                    fontSize: 11, fontWeight: 600,
                    background: cfg.badgeBg, color: cfg.badgeText,
                    border: `1px solid ${cfg.badgeBg}`,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: "50%",
                      background: cfg.dotColor,
                    }} />
                    {count} {cfg.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 14px", height: 36, borderRadius: 8,
              border: "1.5px solid #e7e5e4", background: "#ffffff",
              fontSize: 12, fontWeight: 500, color: "#57534e",
              cursor: "pointer",
            }}>
              <Zap size={13} /> Auto-vincular por Cota
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 14px", height: 36, borderRadius: 8,
              border: "1.5px solid #e7e5e4", background: "#ffffff",
              fontSize: 12, fontWeight: 500, color: "#57534e",
              cursor: "pointer",
            }}>
              <FileDown size={13} /> Exportar PDF
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "0 14px", height: 36, borderRadius: 8,
              border: "1.5px solid #1c1917", background: "#1c1917",
              fontSize: 12, fontWeight: 600, color: "#ffffff",
              cursor: "pointer",
            }}>
              <Send size={13} /> Enviar para Arte
            </button>
          </div>
        </div>

        {/* View mode tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "item", label: "Por Item" },
            { key: "sponsor", label: "Por Patrocinador" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setViewMode(tab.key as any)}
              style={{
                padding: "8px 16px",
                fontSize: 12, fontWeight: 600,
                color: viewMode === tab.key ? "#1c1917" : "#78716c",
                background: "none", border: "none", cursor: "pointer",
                borderBottom: viewMode === tab.key ? "2px solid #1c1917" : "2px solid transparent",
                marginBottom: -1,
                transition: "all 0.15s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 32px", gap: 20 }}>

        {/* ── Event summary strip ── */}
        <div>
          <div style={{
            fontSize: 11, fontWeight: 600, color: "#78716c",
            letterSpacing: "0.06em", textTransform: "uppercase",
            marginBottom: 10,
          }}>
            Pendências por evento
          </div>
          <div style={{
            display: "flex", gap: 10, overflowX: "auto",
            paddingBottom: 4,
          }}>
            {/* "Todos" card */}
            <button
              onClick={() => setSelectedEvent(null)}
              style={{
                minWidth: 130, flexShrink: 0,
                background: selectedEvent === null ? "#1c1917" : "#ffffff",
                border: `1.5px solid ${selectedEvent === null ? "#1c1917" : "#e7e5e4"}`,
                borderRadius: 10, padding: "14px 16px",
                textAlign: "left", cursor: "pointer",
              }}
            >
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.04em",
                color: selectedEvent === null ? "#f5f5f4" : "#78716c",
                textTransform: "uppercase", marginBottom: 4,
              }}>
                Todos os eventos
              </div>
              <div style={{
                fontSize: 22, fontWeight: 700,
                color: selectedEvent === null ? "#ffffff" : "#1c1917",
                letterSpacing: "-0.03em",
              }}>
                {EVENTS.length}
              </div>
              <div style={{
                fontSize: 9,
                color: selectedEvent === null ? "#a8a29e" : "#a8a29e",
                marginTop: 2,
              }}>
                eventos ativos
              </div>
            </button>

            {EVENTS.map(e => (
              <EventSummaryCard
                key={e.id}
                event={e}
                isSelected={selectedEvent === e.id}
                onClick={() => setSelectedEvent(selectedEvent === e.id ? null : e.id)}
              />
            ))}
          </div>
        </div>

        {/* ── Filters + table area ── */}
        <div style={{
          background: "#ffffff",
          border: "1px solid #e7e5e4",
          borderRadius: 12,
          overflow: "hidden",
          flex: 1,
        }}>
          {/* Filter bar */}
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            padding: "14px 20px",
            borderBottom: "1px solid #f5f5f4",
            flexWrap: "wrap",
          }}>
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              border: "1px solid #e7e5e4", borderRadius: 7,
              padding: "0 10px", height: 34, flex: 1, minWidth: 180,
            }}>
              <Search size={13} style={{ color: "#a8a29e", flexShrink: 0 }} />
              <input
                placeholder="Buscar peça ou tipo..."
                style={{
                  border: "none", outline: "none",
                  fontSize: 12, color: "#1c1917", background: "transparent",
                  width: "100%",
                }}
              />
            </div>

            {/* Patrocinador filter */}
            <button style={{
              display: "flex", alignItems: "center", gap: 5,
              height: 34, padding: "0 12px", borderRadius: 7,
              border: "1px solid #e7e5e4", background: "#ffffff",
              fontSize: 12, color: "#57534e", cursor: "pointer", flexShrink: 0,
            }}>
              <Users size={12} /> Patrocinador <ChevronDown size={11} />
            </button>

            {/* Tipo filter */}
            <button style={{
              display: "flex", alignItems: "center", gap: 5,
              height: 34, padding: "0 12px", borderRadius: 7,
              border: "1px solid #e7e5e4", background: "#ffffff",
              fontSize: 12, color: "#57534e", cursor: "pointer", flexShrink: 0,
            }}>
              <Package size={12} /> Tipo de peça <ChevronDown size={11} />
            </button>

            {/* Status filter pills */}
            <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
              {(["PENDENTE","RASCUNHO","PRONTO","ENVIADO"] as const).map(s => {
                const cfg = UI_STATUS_CONFIG[s];
                const isActive = activeStatusFilter === s;
                const count = selectedEventData ? selectedEventData.counts[s] : globalCounts[s];
                return (
                  <button
                    key={s}
                    onClick={() => setActiveStatusFilter(isActive ? null : s)}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      height: 28, padding: "0 10px", borderRadius: 99,
                      border: isActive ? `1.5px solid ${cfg.dotColor}` : "1.5px solid #e7e5e4",
                      background: isActive ? cfg.badgeBg : "#ffffff",
                      fontSize: 10, fontWeight: 600,
                      color: isActive ? cfg.badgeText : "#78716c",
                      cursor: "pointer", transition: "all 0.12s",
                    }}
                  >
                    <span style={{
                      width: 5, height: 5, borderRadius: "50%",
                      background: isActive ? cfg.dotColor : "#d6d3d1",
                    }} />
                    {count} {s[0] + s.slice(1).toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event group header (when one event selected) */}
          {selectedEventData && (
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 20px",
              background: "#1c1917",
              borderBottom: "1px solid #292524",
            }}>
              <span style={{
                fontSize: 12, fontWeight: 700, color: "#ffffff",
                letterSpacing: "0.02em", textTransform: "uppercase",
              }}>
                {selectedEventData.name}
              </span>
              <span style={{
                fontSize: 10, background: "rgba(255,255,255,0.1)",
                color: "#d6d3d1", padding: "2px 8px", borderRadius: 99,
                fontWeight: 500,
              }}>
                {selectedEventData.counts.ENVIADO}/{selectedEventData.total} enviados
              </span>
              <span style={{
                fontSize: 10, color: "#78716c",
                display: "flex", alignItems: "center", gap: 4, marginLeft: "auto",
              }}>
                <Calendar size={10} /> {selectedEventData.startDate}
                <span style={{ marginLeft: 8, display: "flex", alignItems: "center", gap: 4 }}>
                  <Truck size={10} /> {selectedEventData.truckDate}
                </span>
                <span style={{
                  marginLeft: 8, background: "rgba(255,255,255,0.08)",
                  color: "#a8a29e", padding: "2px 8px", borderRadius: 99,
                  fontSize: 10, display: "flex", alignItems: "center", gap: 4,
                }}>
                  <Users size={9} /> {selectedEventData.sponsors} pat.
                </span>
              </span>
            </div>
          )}

          {/* Table header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "32px 72px 1fr 180px 160px 120px",
            gap: 8, padding: "8px 20px",
            borderBottom: "1px solid #f5f5f4",
            background: "#fafaf9",
          }}>
            {["", "ID", "PEÇA / ESPECIFICAÇÃO", "VÍNCULOS ATIVOS", "DETALHES", "STATUS / AÇÕES"].map((h, i) => (
              <span key={i} style={{
                fontSize: 9, fontWeight: 700, letterSpacing: "0.07em",
                color: "#a8a29e", textTransform: "uppercase",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{h}</span>
            ))}
          </div>

          {/* Table rows */}
          {filteredItems.map((item, idx) => {
            const cfg = UI_STATUS_CONFIG[item.uiStatus];
            const isExpanded = expandedGroups.has(item.id);
            return (
              <div key={item.id}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "32px 72px 1fr 180px 160px 120px",
                    gap: 8,
                    padding: "10px 20px",
                    borderBottom: "1px solid #f5f5f4",
                    background: item.uiStatus === "RASCUNHO"
                      ? "#fffbf5"
                      : idx % 2 === 0 ? "#ffffff" : "#fafaf9",
                    alignItems: "center",
                    cursor: item.isGroup ? "pointer" : "default",
                  }}
                  onClick={() => item.isGroup && toggleGroup(item.id)}
                >
                  {/* Checkbox */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {item.uiStatus !== "ENVIADO" ? (
                      <div style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: "1.5px solid #d6d3d1", background: "#ffffff",
                      }} />
                    ) : (
                      <Lock size={11} style={{ color: "#d6d3d1" }} />
                    )}
                  </div>

                  {/* ID */}
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {item.isGroup && (
                      isExpanded
                        ? <ChevronDown size={11} style={{ color: "#a8a29e" }} />
                        : <ChevronRight size={11} style={{ color: "#a8a29e" }} />
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: "#57534e",
                      fontFamily: "monospace",
                    }}>
                      {item.displayId}
                    </span>
                  </div>

                  {/* Peça / spec */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1c1917" }}>
                      {item.type}
                    </div>
                    <div style={{ fontSize: 10, color: "#a8a29e" }}>{item.spec}</div>
                  </div>

                  {/* Vínculos */}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {item.sponsors.length === 0 ? (
                      <span style={{
                        fontSize: 10, color: "#a8a29e", fontStyle: "italic",
                      }}>— sem vínculo</span>
                    ) : (
                      item.sponsors.map(s => (
                        <span key={s} style={{
                          fontSize: 10, background: "#f5f5f4",
                          color: "#57534e", padding: "2px 6px",
                          borderRadius: 4, fontWeight: 500,
                        }}>{s}</span>
                      ))
                    )}
                  </div>

                  {/* Detalhes */}
                  <button style={{
                    fontSize: 10, color: "#78716c", background: "none",
                    border: "none", cursor: "pointer", textAlign: "left",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <SlidersHorizontal size={11} /> Ver detalhes
                  </button>

                  {/* Status / ações */}
                  <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
                    <StatusPill status={item.uiStatus} />
                    {item.uiStatus === "PRONTO" && (
                      <button style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "3px 8px", height: 24, borderRadius: 6,
                        border: "1px solid #1c1917", background: "#1c1917",
                        fontSize: 10, fontWeight: 600, color: "#ffffff",
                        cursor: "pointer",
                      }}>
                        <Send size={9} /> Enviar
                      </button>
                    )}
                    {(item.uiStatus === "PENDENTE") && (
                      <button style={{
                        display: "flex", alignItems: "center", gap: 4,
                        padding: "3px 8px", height: 24, borderRadius: 6,
                        border: "1px solid #e7e5e4", background: "#ffffff",
                        fontSize: 10, fontWeight: 500, color: "#57534e",
                        cursor: "pointer",
                      }}>
                        <Link2 size={9} /> Vincular
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded sub-items (for groups) */}
                {item.isGroup && isExpanded && (
                  <div style={{
                    background: "#f9f9f8",
                    borderBottom: "1px solid #f5f5f4",
                  }}>
                    {[1, 2, 3].map(n => (
                      <div key={n} style={{
                        display: "grid",
                        gridTemplateColumns: "32px 72px 1fr 180px 160px 120px",
                        gap: 8, padding: "8px 20px 8px 36px",
                        borderBottom: "1px solid #f0f0ef",
                        alignItems: "center",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 14, height: 14, borderRadius: 3, border: "1.5px solid #e7e5e4" }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#a8a29e", fontFamily: "monospace" }}>
                          #{String(30 + n).padStart(4, "0")}
                        </span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "#44403c" }}>2X1 PADRÃO</div>
                          <div style={{ fontSize: 10, color: "#a8a29e" }}>Sem especificação</div>
                        </div>
                        <span style={{ fontSize: 10, color: "#a8a29e", fontStyle: "italic" }}>— sem vínculo</span>
                        <span />
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <StatusPill status="PENDENTE" />
                        </div>
                      </div>
                    ))}
                    <div style={{
                      padding: "6px 20px 6px 36px",
                      fontSize: 10, color: "#a8a29e",
                    }}>
                      + 29 itens restantes
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
