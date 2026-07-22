import { useState } from "react";
import {
  Palette, Clock, Send, CheckCircle, Package,
  Search, ChevronDown, Printer, Upload, FileImage,
  Zap, AlertCircle, Calendar, Truck, X,
  Image as ImageIcon, FileCheck, Sparkles,
} from "lucide-react";

const TABS = [
  { id: "aprovar", label: "Mandar p/ Aprovação", count: 12, color: "#f97316" },
  { id: "correcao", label: "Correção", count: 3, color: "#ef4444" },
  { id: "finalizar", label: "Finalizar Arte", count: 7, color: "#3b82f6" },
  { id: "finalizados", label: "Finalizados", count: 45, color: "#22c55e" },
];

const STATS = [
  { label: "Pendentes", sub: "para envio", value: 12, Icon: Clock, color: "#fb923c", glow: "rgba(251,146,60,0.35)", tab: "aprovar" },
  { label: "Aguard. Patrocinador", sub: "em análise", value: 5, Icon: Send, color: "#fbbf24", glow: "rgba(251,191,36,0.30)", tab: null },
  { label: "Aprovado", sub: "pelo patrocinador", value: 7, Icon: CheckCircle, color: "#60a5fa", glow: "rgba(96,165,250,0.30)", tab: "finalizar" },
  { label: "Pronto p/ Produção", sub: "liberado", value: 9, Icon: Package, color: "#4ade80", glow: "rgba(74,222,128,0.30)", tab: null },
];

const PERIOD_PILLS = ["Hoje", "7 dias", "15 dias", "30 dias", "Todos"];

const SP_COLORS: Record<string, { bg: string; text: string; initials: string }> = {
  "Sponsor A": { bg: "#dbeafe", text: "#1d4ed8", initials: "SA" },
  "Sponsor B": { bg: "#fce7f3", text: "#9d174d", initials: "SB" },
  "Sponsor C": { bg: "#d1fae5", text: "#065f46", initials: "SC" },
};

const ITEMS = [
  {
    id: "#0012", type: "Backdrop 3×2m", qty: 4,
    dims: "3,00×2,00 / 3,10×2,10", m2: "6,51", material: "Lona 440g",
    sponsors: ["Sponsor A", "Sponsor B"], urgent: true, hasThumb: false, hasFinal: false,
  },
  {
    id: "#0018", type: "Faixa Horizontal", qty: 2,
    dims: "6,00×0,80 / 6,10×0,90", m2: "5,49", material: "Lona 440g",
    sponsors: ["Sponsor A"], urgent: false, hasThumb: true, hasFinal: false,
  },
  {
    id: "#0021", type: "Banner Rollup", qty: 6,
    dims: "0,85×2,00 / 0,95×2,10", m2: "1,99", material: "Lona brilho",
    sponsors: ["Sponsor C"], urgent: false, hasThumb: false, hasFinal: false,
  },
];

const EVENTS = [
  {
    name: "MARATONA DE RESULTADOS", urgent: true,
    eventDate: "28/07/2026", truck: "25/07 06:00",
    deadline: "Layouts: 22/07 (hoje)", deadlineAlert: true,
    gradient: "linear-gradient(135deg, #c2410c 0%, #f97316 100%)",
    items: [ITEMS[0], ITEMS[1]],
  },
  {
    name: "COPA NORDESTE", urgent: false,
    eventDate: "10/08/2026", truck: "07/08 08:00",
    deadline: "Layouts: 18/07 (16d)", deadlineAlert: false,
    gradient: "linear-gradient(135deg, #1d4ed8 0%, #3b82f6 100%)",
    items: [ITEMS[2]],
  },
];

export function ArteRedesignV2() {
  const [activeTab, setActiveTab] = useState("aprovar");
  const [period, setPeriod] = useState("15 dias");
  const [activeFilters, setActiveFilters] = useState<string[]>(["Maratona de Resultados"]);
  const total = STATS.reduce((s, c) => s + c.value, 0);
  const removeFilter = (f: string) => setActiveFilters(prev => prev.filter(x => x !== f));

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',Arial,sans-serif", minHeight: "100vh", backgroundColor: "#f1f0ef", display: "flex", flexDirection: "column" }}>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HERO HEADER — dark gradient                                   */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div style={{ background: "linear-gradient(150deg, #1e1035 0%, #2d1b69 45%, #1a1040 100%)", flexShrink: 0 }}>
        <div style={{ padding: "20px 32px 0", maxWidth: 1400, margin: "0 auto" }}>

          {/* ── Identity + actions row ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: "0 0 0 1px rgba(168,85,247,0.4), 0 8px 24px rgba(124,58,237,0.5)",
              }}>
                <Palette style={{ width: 24, height: 24, color: "#fff" }} />
              </div>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.05em", margin: 0, fontFamily: '"Space Grotesk",sans-serif', lineHeight: 1.1 }}>
                  Módulo Arte
                </h1>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0, marginTop: 3 }}>
                  Aprovações · Correções · Finalizações de layout
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 99, backgroundColor: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.30)", fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fbbf24", display: "inline-block" }} />
                22 em andamento
              </span>
              <div style={{ width: 1, height: 20, backgroundColor: "rgba(255,255,255,0.12)" }} />
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.75)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Printer style={{ width: 12, height: 12 }} /> Exportar PDF
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.30)", background: "rgba(74,222,128,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <FileImage style={{ width: 12, height: 12 }} /> Multi-Upload Thumbs
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Upload style={{ width: 12, height: 12 }} /> PDF Compartilhado
              </button>
            </div>
          </div>

          {/* ── STAT CARDS — dark glass ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {STATS.map((s, i) => {
              const Icon = s.Icon;
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              const isActive = s.tab && activeTab === s.tab;
              return (
                <div
                  key={i}
                  onClick={() => s.tab && setActiveTab(s.tab as string)}
                  style={{
                    flex: 1, padding: "14px 16px 12px", borderRadius: 12,
                    background: isActive
                      ? "linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)"
                      : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isActive ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)"}`,
                    cursor: s.tab ? "pointer" : "default",
                    backdropFilter: "blur(12px)",
                    display: "flex", flexDirection: "column", gap: 6,
                    boxShadow: isActive ? `0 0 28px ${s.glow}` : "none",
                    transition: "all 0.15s",
                    position: "relative", overflow: "hidden",
                  }}
                >
                  {isActive && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${s.color}, transparent)`, borderRadius: "12px 12px 0 0" }} />
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? s.color : "rgba(255,255,255,0.40)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {s.label}
                    </span>
                    <span style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: `${s.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon style={{ width: 13, height: 13, color: s.color }} />
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: isActive ? s.color : "#fff", letterSpacing: "-0.05em", lineHeight: 1, fontFamily: '"Space Grotesk",sans-serif', textShadow: isActive ? `0 0 20px ${s.glow}` : "none" }}>
                      {s.value}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.32)" }}>{s.sub}</span>
                  </div>
                  <div style={{ height: 2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 2 }}>
                    <div style={{ height: "100%", width: `${pct}%`, backgroundColor: s.color, borderRadius: 2, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── FILTER BAR — two rows inside hero ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {/* search */}
            <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
              <Search style={{ width: 12, height: 12, color: "rgba(255,255,255,0.32)", position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                placeholder="Buscar arte, ID ou projeto..."
                style={{ width: "100%", height: 34, paddingLeft: 28, paddingRight: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", backgroundColor: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {["Evento", "Patrocinador", "Tipo de Peça", "Material"].map((label) => (
              <button key={label} style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 11px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                {label} <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,0.30)" }} />
              </button>
            ))}

            {/* period pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "3px", borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {PERIOD_PILLS.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  style={{ height: 28, padding: "0 11px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: period === p ? 700 : 500, background: period === p ? "rgba(255,255,255,0.16)" : "transparent", color: period === p ? "#fff" : "rgba(255,255,255,0.40)", transition: "all 0.12s" }}
                >
                  {p}
                </button>
              ))}
            </div>

            <button style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 11px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.10)", color: "#fbbf24", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Truck style={{ width: 12, height: 12 }} /> Saída do caminhão
            </button>
          </div>

          {/* ── ACTIVE FILTER CHIPS ── */}
          {activeFilters.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Filtros:</span>
              {activeFilters.map(f => (
                <span key={f} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "rgba(168,85,247,0.20)", border: "1px solid rgba(168,85,247,0.35)", fontSize: 11, fontWeight: 600, color: "#c084fc" }}>
                  {f}
                  <button onClick={() => removeFilter(f)} style={{ background: "none", border: "none", cursor: "pointer", color: "#c084fc", display: "flex", alignItems: "center", padding: 0 }}>
                    <X style={{ width: 9, height: 9 }} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* ── TABS — bottom of hero ── */}
          <div style={{ display: "flex", alignItems: "flex-end", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 7,
                    padding: "10px 18px", border: "none", cursor: "pointer",
                    borderBottom: isActive ? `2px solid ${tab.color}` : "2px solid transparent",
                    marginBottom: -1,
                    background: isActive ? `${tab.color}14` : "transparent",
                    color: isActive ? tab.color : "rgba(255,255,255,0.42)",
                    fontWeight: isActive ? 700 : 500, fontSize: 13,
                    whiteSpace: "nowrap", borderRadius: "6px 6px 0 0",
                    transition: "all 0.14s",
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 100, fontSize: 10, fontWeight: 800, padding: "0 5px", backgroundColor: isActive ? tab.color : "rgba(255,255,255,0.12)", color: isActive ? "#fff" : "rgba(255,255,255,0.45)" }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* CONTENT                                                       */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, padding: "20px 32px 32px", maxWidth: 1400, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        {activeTab !== "finalizados" ? EVENTS.map((ev, ei) => (
          <div key={ei} style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e2e0de", backgroundColor: "#fff", marginBottom: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>

            {/* Event header */}
            <div style={{ background: ev.gradient, padding: "11px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {ev.urgent && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 5, backgroundColor: "rgba(0,0,0,0.22)", fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: "0.08em" }}>
                    <Zap style={{ width: 8, height: 8 }} /> URGENTE
                  </span>
                )}
                <span style={{ color: "#fff", fontFamily: '"Space Grotesk",sans-serif', fontWeight: 800, fontSize: 13, letterSpacing: "0.04em" }}>
                  {ev.name}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.80)", fontSize: 11, fontWeight: 600 }}>
                  <Calendar style={{ width: 10, height: 10 }} /> {ev.eventDate}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.80)", fontSize: 11, fontWeight: 600 }}>
                  <Truck style={{ width: 10, height: 10 }} /> Saída {ev.truck}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 99, backgroundColor: ev.deadlineAlert ? "rgba(239,68,68,0.28)" : "rgba(255,255,255,0.12)", border: ev.deadlineAlert ? "1px solid rgba(239,68,68,0.50)" : "1px solid rgba(255,255,255,0.18)", fontSize: 9, fontWeight: 800, color: ev.deadlineAlert ? "#fca5a5" : "rgba(255,255,255,0.70)", letterSpacing: "0.04em" }}>
                  <AlertCircle style={{ width: 8, height: 8 }} /> {ev.deadline}
                </span>
                <span style={{ color: "rgba(255,255,255,0.50)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  {ev.items.length} {ev.items.length === 1 ? "item" : "itens"}
                </span>
              </div>
            </div>

            {/* Table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #f0ede8" }}>
                  {["", "ID", "Qtd", "Peça", "Dimensões (V / A)", "M²", "Material", "Arte", "Patrocinadores", ""].map((col, i) => (
                    <th key={i} style={{ padding: "8px 14px", fontSize: 9, fontWeight: 700, color: "#b5b3b0", textTransform: "uppercase", letterSpacing: "0.10em", textAlign: i === 9 ? "right" : "left", whiteSpace: "nowrap" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ev.items.map((item, idx) => (
                  <tr key={idx} style={{ backgroundColor: idx % 2 === 1 ? "#fafaf9" : "#fff", borderBottom: "1px solid #f5f4f3" }}>
                    <td style={{ padding: "12px 8px 12px 16px", width: 32 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid #d4d0cc" }} />
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: "#78716c", fontWeight: 600 }}>{item.id}</div>
                      {item.urgent && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, marginTop: 3, padding: "1px 5px", borderRadius: 3, backgroundColor: "#fef2f2", fontSize: 8, fontWeight: 800, color: "#dc2626", letterSpacing: "0.06em" }}>
                          <Zap style={{ width: 7, height: 7 }} /> URGENTE
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: '"Space Grotesk",sans-serif', fontSize: 20, fontWeight: 800, color: "#1c1917", letterSpacing: "-0.04em" }}>{item.qty}</span>
                    </td>
                    <td style={{ padding: "12px 14px", minWidth: 160 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>{item.type}</div>
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: "#78716c" }}>{item.dims}</span>
                    </td>
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700, color: "#1c1917" }}>{item.m2}</span>
                      <span style={{ fontSize: 9, color: "#a8a29e", marginLeft: 2 }}>m²</span>
                    </td>
                    <td style={{ padding: "12px 14px", fontSize: 11, color: "#78716c", whiteSpace: "nowrap" }}>{item.material}</td>

                    {/* Arte status icons */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <div title="Thumbnail" style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: item.hasThumb ? "#f0fdf4" : "#f5f5f4", border: `1px solid ${item.hasThumb ? "#bbf7d0" : "#e7e5e4"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <ImageIcon style={{ width: 13, height: 13, color: item.hasThumb ? "#16a34a" : "#d4d0cc" }} />
                        </div>
                        <div title="Arquivo Final" style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: item.hasFinal ? "#f0fdf4" : "#f5f5f4", border: `1px solid ${item.hasFinal ? "#bbf7d0" : "#e7e5e4"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <FileCheck style={{ width: 13, height: 13, color: item.hasFinal ? "#16a34a" : "#d4d0cc" }} />
                        </div>
                      </div>
                    </td>

                    {/* Sponsors */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {item.sponsors.map((sp, si) => {
                          const c = SP_COLORS[sp] || { bg: "#f5f5f4", text: "#57534e", initials: sp.slice(0, 2).toUpperCase() };
                          return (
                            <span key={si} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 4px", borderRadius: 99, backgroundColor: c.bg, fontSize: 10, fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>
                              <span style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: c.text, color: "#fff", fontSize: 7, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                                {c.initials}
                              </span>
                              {sp}
                            </span>
                          );
                        })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: "12px 16px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 5 }}>
                        <button style={{ height: 30, padding: "0 10px", borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", fontSize: 11, fontWeight: 600, color: "#57534e", cursor: "pointer" }}>
                          Ver
                        </button>
                        <button style={{ height: 30, padding: "0 14px", borderRadius: 6, border: "none", background: activeTab === "correcao" ? "#ef4444" : activeTab === "finalizar" ? "#3b82f6" : "#f97316", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                          {activeTab === "aprovar" ? "Enviar" : activeTab === "correcao" ? "Enviar correção" : "Finalizar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : (
          /* ── Empty state for Finalizados ── */
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 32px", textAlign: "center" }}>
            <div style={{ width: 72, height: 72, borderRadius: 22, background: "linear-gradient(135deg, #16a34a, #22c55e)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 10px 30px rgba(34,197,94,0.28)" }}>
              <Sparkles style={{ width: 32, height: 32, color: "#fff" }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1c1917", letterSpacing: "-0.04em", fontFamily: '"Space Grotesk",sans-serif' }}>
              45 artes finalizadas
            </div>
            <div style={{ fontSize: 13, color: "#a8a29e", marginTop: 8 }}>Nenhum item pendente neste período.</div>
          </div>
        )}
      </div>
    </div>
  );
}
