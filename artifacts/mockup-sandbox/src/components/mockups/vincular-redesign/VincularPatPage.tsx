import { useState } from "react";
import {
  ChevronDown, ChevronRight, Search, Send, FileDown, Link2,
  Calendar, Truck, Users, CheckCircle2, Pencil, Lock,
  SlidersHorizontal, Package, Zap, Circle, ChevronUp, X
} from "lucide-react";

// ── Mock data ──────────────────────────────────────────────────────────────────

const EVENTS = [
  { id: "e1", name: "BOTA PRA CORRER SP", startDate: "16 AGO", truckDate: "11 AGO 21:00", sponsors: 13,
    counts: { PENDENTE: 82, RASCUNHO: 0, PRONTO: 36, ENVIADO: 96 }, total: 214 },
  { id: "e2", name: "MEIA MARATONA RIO", startDate: "23 AGO", truckDate: "18 AGO 09:00", sponsors: 7,
    counts: { PENDENTE: 45, RASCUNHO: 3, PRONTO: 12, ENVIADO: 28 }, total: 88 },
  { id: "e3", name: "CIRCUITO DAS ESTAÇÕES – INVERNO SP", startDate: "07 SET", truckDate: "02 SET 14:00", sponsors: 5,
    counts: { PENDENTE: 0, RASCUNHO: 0, PRONTO: 8, ENVIADO: 62 }, total: 70 },
  { id: "e4", name: "CORRIDA DAS MULHERES BH", startDate: "14 SET", truckDate: "09 SET 08:00", sponsors: 4,
    counts: { PENDENTE: 31, RASCUNHO: 7, PRONTO: 0, ENVIADO: 10 }, total: 48 },
  { id: "e5", name: "MARATONA DE CURITIBA", startDate: "05 OUT", truckDate: "30 SET 16:00", sponsors: 9,
    counts: { PENDENTE: 18, RASCUNHO: 2, PRONTO: 5, ENVIADO: 41 }, total: 66 },
  { id: "e6", name: "RUN EXPERIENCE BRASÍLIA", startDate: "12 OUT", truckDate: "07 OUT 10:00", sponsors: 6,
    counts: { PENDENTE: 27, RASCUNHO: 0, PRONTO: 3, ENVIADO: 14 }, total: 44 },
  { id: "e7", name: "CORRIDA CIDADE DE SÃO PAULO", startDate: "25 OUT", truckDate: "20 OUT 08:00", sponsors: 11,
    counts: { PENDENTE: 9, RASCUNHO: 1, PRONTO: 0, ENVIADO: 5 }, total: 15 },
];

const ITEMS_TABLE = [
  { id: "i1", displayId: "#0032", type: "2X1 PADRÃO", spec: "32 ITENS · 12 SEM ATRIBUIÇÃO", uiStatus: "PENDENTE", sponsors: [], isGroup: true, eventId: "e2" },
  { id: "i2", displayId: "#0033", type: "FAIXA LARGO", spec: "Banco Itaú — 6m × 1,5m", uiStatus: "RASCUNHO", sponsors: ["Banco Itaú"], isGroup: false, eventId: "e2" },
  { id: "i3", displayId: "#0034", type: "BACKDROP 3×2", spec: "Globo — 3m × 2m", uiStatus: "PRONTO", sponsors: ["Globo"], isGroup: false, eventId: "e2" },
  { id: "i4", displayId: "#0035", type: "BANNER VERTICAL", spec: "Nike — 0,9m × 2,1m", uiStatus: "ENVIADO", sponsors: ["Nike"], isGroup: false, eventId: "e2" },
  { id: "i5", displayId: "#0036", type: "TOTEM", spec: "Adidas — 0,6m × 1,8m", uiStatus: "PENDENTE", sponsors: [], isGroup: false, eventId: "e2" },
];

// ── Status config ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, {
  label: string; dot: string; bg: string; text: string;
}> = {
  PENDENTE: { label: "Pendente", dot: "#a8a29e", bg: "#f5f5f4", text: "#78716c" },
  RASCUNHO: { label: "Rascunho", dot: "#f97316", bg: "#fff7ed", text: "#c2410c" },
  PRONTO:   { label: "Pronto",   dot: "#22c55e", bg: "#f0fdf4", text: "#15803d" },
  ENVIADO:  { label: "Enviado",  dot: "#57534e", bg: "#f5f5f4", text: "#57534e" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const c = STATUS_CFG[status];
  if (!c) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 7px", borderRadius: 99,
      fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.text,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot }} />
      {c.label}
    </span>
  );
}

function CountChip({ count, status }: { count: number; status: string }) {
  const c = STATUS_CFG[status];
  if (count === 0) return <span style={{ color: "#d6d3d1", fontSize: 11, fontWeight: 500 }}>—</span>;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 3,
      padding: "2px 8px", borderRadius: 6,
      fontSize: 11, fontWeight: 700,
      background: c.bg, color: c.text,
    }}>
      {count}
    </span>
  );
}

// ── Event overview panel ───────────────────────────────────────────────────────

function EventOverviewPanel({ selected, onSelect }: {
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const needsAttention = EVENTS.filter(e => e.counts.RASCUNHO > 0 || e.counts.PENDENTE > 0).length;

  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e7e5e4",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      {/* Panel header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: collapsed ? "none" : "1px solid #f0f0ef",
          cursor: "pointer",
          background: "#fafaf9",
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#1c1917", letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Pendências por evento
          </span>
          {needsAttention > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              background: "#fff7ed", color: "#c2410c",
              padding: "1px 7px", borderRadius: 99,
            }}>
              {needsAttention} com ação pendente
            </span>
          )}
          {selected && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 10, color: "#78716c", background: "#f5f5f4",
                border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer",
              }}
            >
              <X size={9} /> Limpar filtro
            </button>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Legend */}
          {!collapsed && (
            <div style={{ display: "flex", gap: 10 }}>
              {(["PENDENTE","RASCUNHO","PRONTO","ENVIADO"] as const).map(s => (
                <span key={s} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 9, color: "#a8a29e", fontWeight: 500, letterSpacing: "0.04em",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: STATUS_CFG[s].dot }} />
                  {s[0] + s.slice(1).toLowerCase()}
                </span>
              ))}
            </div>
          )}
          {collapsed ? <ChevronDown size={13} style={{ color: "#a8a29e" }} /> : <ChevronUp size={13} style={{ color: "#a8a29e" }} />}
        </div>
      </div>

      {/* Event rows */}
      {!collapsed && (
        <div style={{ maxHeight: 260, overflowY: "auto" }}>
          {/* Column header */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 80px 80px 64px 64px 64px 64px 52px",
            gap: 4, padding: "6px 16px",
            background: "#f9f9f8",
            borderBottom: "1px solid #f0f0ef",
          }}>
            {["EVENTO", "CAMINHÃO", "PEND.", "RASC.", "PRONTO", "ENV.", "TOTAL", ""].map((h) => (
              <span key={h} style={{
                fontSize: 8.5, fontWeight: 700, letterSpacing: "0.07em",
                color: "#b7b0aa", textTransform: "uppercase",
              }}>{h}</span>
            ))}
          </div>

          {EVENTS.map(e => {
            const isSelected = selected === e.id;
            const hasUrgent = e.counts.RASCUNHO > 0;
            const hasPending = e.counts.PENDENTE > 0;
            const allDone = e.counts.ENVIADO === e.total;
            const sentPct = Math.round((e.counts.ENVIADO / e.total) * 100);

            return (
              <div
                key={e.id}
                onClick={() => onSelect(isSelected ? null : e.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px 64px 64px 64px 64px 52px",
                  gap: 4,
                  padding: "9px 16px",
                  borderBottom: "1px solid #f5f5f4",
                  background: isSelected ? "#1c1917" : "transparent",
                  cursor: "pointer",
                  alignItems: "center",
                  transition: "background 0.12s",
                }}
              >
                {/* Event name */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                  {/* Urgency indicator */}
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                    background: hasUrgent ? "#f97316" : hasPending ? "#a8a29e" : allDone ? "#22c55e" : "#d6d3d1",
                  }} />
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: isSelected ? "#ffffff" : "#1c1917",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {e.name}
                  </span>
                  {/* Mini progress bar */}
                  <div style={{
                    flex: 1, height: 3, background: isSelected ? "rgba(255,255,255,0.15)" : "#f0f0ef",
                    borderRadius: 99, minWidth: 30, maxWidth: 80,
                  }}>
                    <div style={{
                      height: "100%", width: `${sentPct}%`,
                      background: isSelected ? "#f97316" : (allDone ? "#22c55e" : "#1c1917"),
                      borderRadius: 99,
                    }} />
                  </div>
                </div>

                {/* Truck date */}
                <span style={{
                  fontSize: 10, color: isSelected ? "#a8a29e" : "#78716c",
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <Truck size={9} /> {e.truckDate.split(" ")[0] + " " + e.truckDate.split(" ")[1]}
                </span>

                {/* Sponsors */}
                <span style={{
                  fontSize: 10, color: isSelected ? "#a8a29e" : "#78716c",
                  display: "flex", alignItems: "center", gap: 3,
                }}>
                  <Users size={9} /> {e.sponsors} pat.
                </span>

                {/* Counts */}
                {(["PENDENTE","RASCUNHO","PRONTO","ENVIADO"] as const).map(s => {
                  const c = STATUS_CFG[s];
                  const count = e.counts[s];
                  return (
                    <span key={s} style={{
                      fontSize: 11, fontWeight: count > 0 ? 700 : 400,
                      color: isSelected
                        ? (count > 0 ? "#f5f5f4" : "#57534e")
                        : (count > 0 ? c.text : "#d6d3d1"),
                    }}>
                      {count > 0 ? count : "—"}
                    </span>
                  );
                })}

                {/* Total */}
                <span style={{
                  fontSize: 10, color: isSelected ? "#78716c" : "#a8a29e",
                }}>
                  {e.total}
                </span>

                {/* Action CTA */}
                <span>
                  {hasPending || hasUrgent ? (
                    <span style={{
                      fontSize: 9, fontWeight: 600,
                      color: isSelected ? "#f97316" : "#c2410c",
                      background: isSelected ? "rgba(249,115,22,0.15)" : "#fff7ed",
                      padding: "2px 6px", borderRadius: 4,
                    }}>
                      {hasUrgent ? "SALVAR" : "VINCULAR"}
                    </span>
                  ) : allDone ? (
                    <span style={{ fontSize: 9, color: isSelected ? "#22c55e" : "#15803d" }}>✓ Completo</span>
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function VincularPatPage() {
  const [selectedEvent, setSelectedEvent] = useState<string | null>("e2");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"item" | "sponsor">("item");

  const toggleGroup = (id: string) =>
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const globalCounts = EVENTS.reduce(
    (acc, e) => { acc.PENDENTE += e.counts.PENDENTE; acc.RASCUNHO += e.counts.RASCUNHO; acc.PRONTO += e.counts.PRONTO; acc.ENVIADO += e.counts.ENVIADO; return acc; },
    { PENDENTE: 0, RASCUNHO: 0, PRONTO: 0, ENVIADO: 0 }
  );

  const selectedEventData = EVENTS.find(e => e.id === selectedEvent);
  const displayCounts = selectedEventData ? selectedEventData.counts : globalCounts;

  const filteredItems = ITEMS_TABLE.filter(item => {
    if (selectedEvent && item.eventId !== selectedEvent) return false;
    if (activeStatusFilter && item.uiStatus !== activeStatusFilter) return false;
    return true;
  });

  return (
    <div style={{
      minHeight: "100vh", height: "100vh",
      background: "#fafaf9",
      fontFamily: "'Inter', system-ui, sans-serif",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>

      {/* ── Top header ────────────────────────────────────────────────────── */}
      <div style={{
        padding: "20px 28px 0",
        background: "#ffffff",
        borderBottom: "1px solid #e7e5e4",
        flexShrink: 0,
      }}>
        <div style={{
          display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 16,
          marginBottom: 16, flexWrap: "wrap",
        }}>
          {/* Left: title + counters */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Link2 size={16} style={{ color: "#1c1917" }} />
              <h1 style={{ fontSize: 18, fontWeight: 700, color: "#1c1917", letterSpacing: "-0.02em", margin: 0 }}>
                Vincular Patrocinadores
              </h1>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {(["PENDENTE","RASCUNHO","PRONTO","ENVIADO"] as const).map(s => {
                const c = STATUS_CFG[s];
                const count = globalCounts[s];
                return (
                  <span key={s} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "2px 9px", borderRadius: 99,
                    fontSize: 11, fontWeight: 600, background: c.bg, color: c.text,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.dot }} />
                    {count} {c.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Right: actions */}
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0 12px", height: 34, borderRadius: 7,
              border: "1.5px solid #e7e5e4", background: "#ffffff",
              fontSize: 12, fontWeight: 500, color: "#57534e", cursor: "pointer",
            }}>
              <Zap size={12} /> Auto-vincular por Cota
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0 12px", height: 34, borderRadius: 7,
              border: "1.5px solid #e7e5e4", background: "#ffffff",
              fontSize: 12, fontWeight: 500, color: "#57534e", cursor: "pointer",
            }}>
              <FileDown size={12} /> Exportar PDF
            </button>
            <button style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "0 12px", height: 34, borderRadius: 7,
              border: "1.5px solid #1c1917", background: "#1c1917",
              fontSize: 12, fontWeight: 600, color: "#ffffff", cursor: "pointer",
            }}>
              <Send size={12} /> Enviar para Arte
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {[{ key: "item", label: "Por Item" }, { key: "sponsor", label: "Por Patrocinador" }].map(tab => (
            <button key={tab.key} onClick={() => setViewMode(tab.key as any)} style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 600,
              color: viewMode === tab.key ? "#1c1917" : "#78716c",
              background: "none", border: "none", cursor: "pointer",
              borderBottom: viewMode === tab.key ? "2px solid #1c1917" : "2px solid transparent",
              marginBottom: -1, transition: "all 0.12s",
            }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 28px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* ── Event overview panel ── */}
        <EventOverviewPanel selected={selectedEvent} onSelect={setSelectedEvent} />

        {/* ── Item table ── */}
        <div style={{
          background: "#ffffff", border: "1px solid #e7e5e4",
          borderRadius: 12, overflow: "hidden",
        }}>
          {/* Filter bar */}
          <div style={{
            display: "flex", gap: 8, alignItems: "center",
            padding: "12px 16px", borderBottom: "1px solid #f5f5f4",
            flexWrap: "wrap",
          }}>
            {/* Search */}
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              border: "1px solid #e7e5e4", borderRadius: 7,
              padding: "0 10px", height: 32, flex: 1, minWidth: 160,
            }}>
              <Search size={12} style={{ color: "#a8a29e", flexShrink: 0 }} />
              <input placeholder="Buscar peça..." style={{
                border: "none", outline: "none", fontSize: 12, color: "#1c1917", background: "transparent", width: "100%",
              }} />
            </div>

            {/* Filters */}
            {[
              { icon: <Users size={11} />, label: "Patrocinador" },
              { icon: <Package size={11} />, label: "Tipo de peça" },
            ].map(f => (
              <button key={f.label} style={{
                display: "flex", alignItems: "center", gap: 5,
                height: 32, padding: "0 11px", borderRadius: 7,
                border: "1px solid #e7e5e4", background: "#ffffff",
                fontSize: 11, color: "#57534e", cursor: "pointer", flexShrink: 0,
              }}>
                {f.icon} {f.label} <ChevronDown size={10} />
              </button>
            ))}

            {/* Separator */}
            <div style={{ width: 1, height: 20, background: "#e7e5e4" }} />

            {/* Status pills */}
            {(["PENDENTE","RASCUNHO","PRONTO","ENVIADO"] as const).map(s => {
              const c = STATUS_CFG[s];
              const isActive = activeStatusFilter === s;
              const count = displayCounts[s];
              return (
                <button key={s} onClick={() => setActiveStatusFilter(isActive ? null : s)} style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  height: 28, padding: "0 10px", borderRadius: 99,
                  border: isActive ? `1.5px solid ${c.dot}` : "1.5px solid #e7e5e4",
                  background: isActive ? c.bg : "#ffffff",
                  fontSize: 10, fontWeight: 600,
                  color: isActive ? c.text : "#78716c",
                  cursor: "pointer", transition: "all 0.1s",
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: isActive ? c.dot : "#d6d3d1" }} />
                  {count} {c.label.toLowerCase()}
                </button>
              );
            })}
          </div>

          {/* Event group header (when filtered) */}
          {selectedEventData && (
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px",
              background: "#1c1917",
              borderBottom: "1px solid #292524",
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ffffff", textTransform: "uppercase", letterSpacing: "0.02em" }}>
                {selectedEventData.name}
              </span>
              <span style={{ fontSize: 10, background: "rgba(255,255,255,0.1)", color: "#d6d3d1", padding: "1px 7px", borderRadius: 99 }}>
                {selectedEventData.counts.ENVIADO}/{selectedEventData.total}
              </span>
              <div style={{ display: "flex", gap: 5, marginLeft: 4 }}>
                {(["PENDENTE","RASCUNHO","PRONTO"] as const).filter(s => selectedEventData.counts[s] > 0).map(s => (
                  <span key={s} style={{
                    fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 99,
                    background: STATUS_CFG[s].bg, color: STATUS_CFG[s].text,
                  }}>
                    {selectedEventData.counts[s]} {STATUS_CFG[s].label.toLowerCase()}
                  </span>
                ))}
              </div>
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 10, color: "#57534e" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Calendar size={9} /> {selectedEventData.startDate}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Truck size={9} /> {selectedEventData.truckDate}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Users size={9} /> {selectedEventData.sponsors} pat.</span>
              </span>
            </div>
          )}

          {/* Table col headers */}
          <div style={{
            display: "grid", gridTemplateColumns: "32px 72px 1fr 200px 130px 130px",
            gap: 8, padding: "7px 16px", background: "#f9f9f8", borderBottom: "1px solid #f0f0ef",
          }}>
            {["", "ID", "PEÇA / ESPECIFICAÇÃO", "VÍNCULOS ATIVOS", "DETALHES", "STATUS / AÇÕES"].map(h => (
              <span key={h} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: "0.07em", color: "#b7b0aa", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>

          {/* Rows */}
          {filteredItems.length === 0 ? (
            <div style={{ padding: "40px 16px", textAlign: "center", color: "#a8a29e", fontSize: 12 }}>
              Nenhum item encontrado para esse filtro.
            </div>
          ) : filteredItems.map((item, idx) => {
            const isExpanded = expandedGroups.has(item.id);
            return (
              <div key={item.id}>
                <div
                  style={{
                    display: "grid", gridTemplateColumns: "32px 72px 1fr 200px 130px 130px",
                    gap: 8, padding: "9px 16px",
                    borderBottom: "1px solid #f5f5f4",
                    background: item.uiStatus === "RASCUNHO" ? "#fffcf9" : idx % 2 === 0 ? "#fff" : "#fafaf9",
                    alignItems: "center", cursor: item.isGroup ? "pointer" : "default",
                    borderLeft: item.uiStatus === "RASCUNHO" ? "3px solid #f97316" : "3px solid transparent",
                  }}
                  onClick={() => item.isGroup && toggleGroup(item.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {item.uiStatus !== "ENVIADO"
                      ? <div style={{ width: 13, height: 13, borderRadius: 3, border: "1.5px solid #d6d3d1", background: "#fff" }} />
                      : <Lock size={10} style={{ color: "#d6d3d1" }} />}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {item.isGroup && (isExpanded ? <ChevronDown size={10} style={{ color: "#a8a29e" }} /> : <ChevronRight size={10} style={{ color: "#a8a29e" }} />)}
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#57534e", fontFamily: "monospace" }}>{item.displayId}</span>
                  </div>

                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1c1917" }}>{item.type}</div>
                    <div style={{ fontSize: 10, color: "#a8a29e" }}>{item.spec}</div>
                  </div>

                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {item.sponsors.length === 0
                      ? <span style={{ fontSize: 10, color: "#a8a29e", fontStyle: "italic" }}>— sem vínculo</span>
                      : item.sponsors.map(s => (
                          <span key={s} style={{ fontSize: 10, background: "#f5f5f4", color: "#57534e", padding: "2px 6px", borderRadius: 4, fontWeight: 500 }}>{s}</span>
                        ))}
                  </div>

                  <button style={{ fontSize: 10, color: "#78716c", background: "none", border: "none", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 4 }}>
                    <SlidersHorizontal size={10} /> Ver detalhes
                  </button>

                  <div style={{ display: "flex", gap: 5, alignItems: "center", justifyContent: "flex-end" }}>
                    <StatusPill status={item.uiStatus} />
                    {item.uiStatus === "PRONTO" && (
                      <button style={{
                        display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", height: 22, borderRadius: 5,
                        border: "1px solid #1c1917", background: "#1c1917", fontSize: 10, fontWeight: 600, color: "#fff", cursor: "pointer",
                      }}>
                        <Send size={8} /> Enviar
                      </button>
                    )}
                    {item.uiStatus === "PENDENTE" && (
                      <button style={{
                        display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", height: 22, borderRadius: 5,
                        border: "1px solid #e7e5e4", background: "#fff", fontSize: 10, fontWeight: 500, color: "#57534e", cursor: "pointer",
                      }}>
                        <Link2 size={8} /> Vincular
                      </button>
                    )}
                    {item.uiStatus === "RASCUNHO" && (
                      <button style={{
                        display: "flex", alignItems: "center", gap: 3, padding: "2px 7px", height: 22, borderRadius: 5,
                        border: "1px solid #f97316", background: "#fff7ed", fontSize: 10, fontWeight: 600, color: "#c2410c", cursor: "pointer",
                      }}>
                        Salvar
                      </button>
                    )}
                  </div>
                </div>

                {item.isGroup && isExpanded && (
                  <div style={{ background: "#f9f9f8", borderBottom: "1px solid #f0f0ef" }}>
                    {[1, 2, 3].map(n => (
                      <div key={n} style={{
                        display: "grid", gridTemplateColumns: "32px 72px 1fr 200px 130px 130px",
                        gap: 8, padding: "7px 16px 7px 32px",
                        borderBottom: "1px solid #f0f0ef", alignItems: "center",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <div style={{ width: 13, height: 13, borderRadius: 3, border: "1.5px solid #e7e5e4" }} />
                        </div>
                        <span style={{ fontSize: 10, color: "#a8a29e", fontFamily: "monospace" }}>#{String(29 + n).padStart(4, "0")}</span>
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 500, color: "#44403c" }}>2X1 PADRÃO</div>
                          <div style={{ fontSize: 10, color: "#a8a29e" }}>Sem especificação</div>
                        </div>
                        <span style={{ fontSize: 10, color: "#a8a29e", fontStyle: "italic" }}>— sem vínculo</span>
                        <span />
                        <div style={{ display: "flex", justifyContent: "flex-end" }}><StatusPill status="PENDENTE" /></div>
                      </div>
                    ))}
                    <div style={{ padding: "5px 32px", fontSize: 10, color: "#a8a29e" }}>+ 29 itens restantes</div>
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
