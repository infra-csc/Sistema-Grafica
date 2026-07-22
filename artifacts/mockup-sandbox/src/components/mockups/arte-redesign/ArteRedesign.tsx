import { useState } from "react";
import {
  Palette, Clock, Send, CheckCircle, Package,
  Search, ChevronDown, Printer, Upload, FileImage,
  ArrowRight, Zap, AlertCircle, Calendar, Truck,
  Filter, SlidersHorizontal, X,
} from "lucide-react";

const TABS = [
  { id: "aprovar", label: "Mandar para Aprovação", count: 12, color: "#f97316", bg: "#fff7ed" },
  { id: "correcao", label: "Correção", count: 3, color: "#dc2626", bg: "#fef2f2" },
  { id: "finalizar", label: "Finalizar Arte", count: 7, color: "#2563eb", bg: "#eff6ff" },
  { id: "finalizados", label: "Finalizados", count: 45, color: "#16a34a", bg: "#f0fdf4" },
];

const STATS = [
  {
    label: "Pendentes",
    sub: "para envio",
    value: 12,
    icon: Clock,
    color: "#f97316",
    lightBg: "#fff7ed",
    tab: "aprovar",
  },
  {
    label: "Aguard. Patrocinador",
    sub: "em análise",
    value: 5,
    icon: Send,
    color: "#d97706",
    lightBg: "#fffbeb",
    tab: null,
  },
  {
    label: "Aprovado",
    sub: "pelo patrocinador",
    value: 7,
    icon: CheckCircle,
    color: "#2563eb",
    lightBg: "#eff6ff",
    tab: "finalizar",
  },
  {
    label: "Prontos p/ Produção",
    sub: "liberado",
    value: 9,
    icon: Package,
    color: "#16a34a",
    lightBg: "#f0fdf4",
    tab: null,
  },
];

const ITEMS = [
  { id: "#0012", type: "Backdrop 3x2m", event: "Maratona de Resultados", qty: 4, dims: "3,00 × 2,00 / 3,10 × 2,10", m2: "6,51", material: "Lona 440g", sponsors: ["Sponsor A", "Sponsor B"], urgent: true },
  { id: "#0018", type: "Faixa Horizontal", event: "Maratona de Resultados", qty: 2, dims: "6,00 × 0,80 / 6,10 × 0,90", m2: "5,49", material: "Lona 440g", sponsors: ["Sponsor A"], urgent: false },
  { id: "#0021", type: "Banner Rollup", event: "Copa Nordeste", qty: 6, dims: "0,85 × 2,00 / 0,95 × 2,10", m2: "1,99", material: "Lona brilho", sponsors: ["Sponsor C"], urgent: false },
];

export function ArteRedesign() {
  const [activeTab, setActiveTab] = useState("aprovar");
  const total = STATS.reduce((s, c) => s + c.value, 0);

  return (
    <div style={{ fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif", minHeight: "100vh", backgroundColor: "#f8f7f6", display: "flex", flexDirection: "column" }}>

      {/* ── STICKY HEADER ─────────────────────────────────────────────── */}
      <div style={{ position: "sticky", top: 0, zIndex: 40, backgroundColor: "#ffffff", borderBottom: "1px solid #e7e5e4" }}>
        <div style={{ padding: "0 32px", maxWidth: 1400, margin: "0 auto" }}>

          {/* ── TOP BAND ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 0 12px", borderBottom: "1px solid #f0ede8", gap: 16,
          }}>
            {/* Left: identity */}
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "linear-gradient(135deg, #6d28d9 0%, #a855f7 100%)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: "0 6px 16px rgba(109,40,217,0.30)",
              }}>
                <Palette style={{ width: 22, height: 22, color: "#fff" }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h1 style={{ fontSize: 18, fontWeight: 800, color: "#0f0e0e", letterSpacing: "-0.04em", margin: 0, fontFamily: '"Space Grotesk", sans-serif' }}>
                    Módulo Arte
                  </h1>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 10px", borderRadius: 99, backgroundColor: "#fef3c7", border: "1px solid #fde68a", fontSize: 11, fontWeight: 700, color: "#92400e" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f59e0b", display: "inline-block" }} />
                    {12 + 3 + 7} ativos
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "#a8a29e", margin: 0, marginTop: 1 }}>
                  Aprovações · Correções · Finalizações
                </p>
              </div>
            </div>

            {/* Right: actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#57534e", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                <Printer style={{ width: 13, height: 13 }} />
                Exportar PDF
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#15803d", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                <FileImage style={{ width: 13, height: 13 }} />
                Multi-Upload Thumbs
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 8, border: "1px solid #e7e5e4", background: "#fff", color: "#57534e", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", opacity: 0.6 }}>
                <Upload style={{ width: 13, height: 13 }} />
                PDF Compartilhado
              </button>
            </div>
          </div>

          {/* ── STAT CARDS STRIP ── */}
          <div style={{ display: "flex", gap: 12, padding: "14px 0 12px" }}>
            {STATS.map((s, i) => {
              const Icon = s.icon;
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              const isActive = TABS.find(t => t.id === activeTab)?.id === s.tab;
              return (
                <div
                  key={i}
                  onClick={() => s.tab && setActiveTab(s.tab)}
                  style={{
                    flex: 1, padding: "12px 16px 10px",
                    borderRadius: 10,
                    border: `1px solid ${isActive ? s.color + "50" : "#ebe9e7"}`,
                    backgroundColor: isActive ? s.lightBg : "#ffffff",
                    cursor: s.tab ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 5,
                    boxShadow: isActive ? `0 0 0 1px ${s.color}30, inset 0 3px 0 0 ${s.color}` : "none",
                    transition: "all 0.14s",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? s.color : "#a8a29e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {s.label}
                    </span>
                    <span style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: isActive ? s.color + "22" : s.lightBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon style={{ width: 13, height: 13, color: s.color }} />
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: isActive ? s.color : "#1c1917", letterSpacing: "-0.04em", lineHeight: 1, fontFamily: '"Space Grotesk", sans-serif' }}>
                      {s.value}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: "#a8a29e" }}>{s.sub}</span>
                  </div>
                  {/* Progress bar */}
                  <div style={{ height: 3, borderRadius: 2, backgroundColor: "#f0ede8", overflow: "hidden", marginTop: 3 }}>
                    <div style={{ height: "100%", width: `${pct}%`, backgroundColor: s.color, borderRadius: 2 }} />
                  </div>
                  {i < STATS.length - 1 && (
                    <div style={{ position: "absolute", right: -8, top: "50%", transform: "translateY(-50%)", zIndex: 2, backgroundColor: "#f5f4f3", border: "1px solid #e7e5e4", borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ArrowRight style={{ width: 8, height: 8, color: "#c8c5c2" }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── FILTER BAR ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 0, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
              <Search style={{ width: 13, height: 13, color: "#a8a29e", position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
              <input
                placeholder="Buscar arte, ID ou projeto..."
                style={{ width: "100%", height: 36, paddingLeft: 30, paddingRight: 10, borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#fafaf9", fontSize: 12, color: "#1c1917", outline: "none", boxSizing: "border-box" }}
              />
            </div>
            {["Evento: Todos", "Patrocinador: Todos", "Tipo de Peça: Todos", "Material: Todos", "Mês: Todos"].map((label, i) => (
              <button key={i} style={{ display: "flex", alignItems: "center", gap: 5, height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#fafaf9", fontSize: 12, color: "#57534e", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
                {label}
                <ChevronDown style={{ width: 11, height: 11, color: "#a8a29e" }} />
              </button>
            ))}
            <button style={{ display: "flex", alignItems: "center", gap: 5, height: 36, padding: "0 12px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#fafaf9", fontSize: 12, color: "#57534e", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Truck style={{ width: 12, height: 12 }} />
              Próximos 10 dias
            </button>
          </div>

          {/* ── TABS ── */}
          <div style={{ display: "flex", alignItems: "flex-end", borderBottom: "2px solid #e7e5e4", marginTop: 8 }}>
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
                    marginBottom: -2,
                    backgroundColor: isActive ? tab.color + "0d" : "transparent",
                    color: isActive ? tab.color : "#78716c",
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 13, whiteSpace: "nowrap",
                    borderRadius: "6px 6px 0 0",
                    transition: "all 0.14s",
                  }}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      minWidth: 18, height: 18, borderRadius: 100, fontSize: 10, fontWeight: 800,
                      backgroundColor: isActive ? tab.color : "#e7e5e4",
                      color: isActive ? "#fff" : "#78716c", padding: "0 5px",
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── CONTENT AREA ── */}
      <div style={{ flex: 1, padding: "24px 32px", maxWidth: 1400, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        {/* Event group */}
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e7e5e4", backgroundColor: "#fff", marginBottom: 16 }}>
          {/* Event header */}
          <div style={{ padding: "13px 20px", background: "linear-gradient(to right, #ea580c, #f97316)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#fff", opacity: 0.9 }} />
              <span style={{ color: "#fff", fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Maratona de Resultados
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, backgroundColor: "rgba(255,255,255,0.18)", fontSize: 10, fontWeight: 700, color: "#fff" }}>
                <AlertCircle style={{ width: 9, height: 9 }} /> URGENTE
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600 }}>
                <Calendar style={{ width: 11, height: 11 }} /> 28/07/2026
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600 }}>
                <Truck style={{ width: 11, height: 11 }} /> Saída: 25/07 às 06:00
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: "rgba(255,80,80,0.22)", border: "1px solid rgba(255,80,80,0.38)", borderRadius: 99, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "#ffb3b3" }}>
                Entrega de Layouts · 22/07 <span style={{ opacity: 0.65 }}>(hoje)</span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                2 itens
              </span>
            </div>
          </div>

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #f0ede8" }}>
                {["", "ID", "Qtd", "Backdrop", "Dimensões (V / A)", "M²", "Material", "Patrocinadores", "Ações"].map((col, i) => (
                  <th key={i} style={{ padding: "9px 16px", fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 8 ? "right" : "left", whiteSpace: "nowrap" }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ITEMS.slice(0, 2).map((item, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #f5f5f4", backgroundColor: "#fff" }}>
                  <td style={{ padding: "12px 8px 12px 16px", width: 36 }}>
                    <div style={{ width: 15, height: 15, borderRadius: 4, border: "1.5px solid #d4d4d0" }} />
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: "#78716c", fontWeight: 600 }}>{item.id}</div>
                    {item.urgent && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3, padding: "2px 6px", borderRadius: 4, backgroundColor: "#fef2f2", fontSize: 9, fontWeight: 700, color: "#dc2626" }}>
                        <Zap style={{ width: 8, height: 8 }} /> URGENTE
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: "#1c1917" }}>{item.qty}</span>
                  </td>
                  <td style={{ padding: "12px 16px", minWidth: 180 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{item.type}</div>
                    <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2 }}>sem thumb · sem arquivo final</div>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap", fontSize: 12, color: "#57534e" }}>{item.dims}</td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                    <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: "#57534e", fontWeight: 600 }}>{item.m2}</span>
                  </td>
                  <td style={{ padding: "12px 16px", whiteSpace: "nowrap", fontSize: 12, color: "#57534e" }}>{item.material}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {item.sponsors.map((sp, si) => (
                        <span key={si} style={{ padding: "2px 8px", borderRadius: 4, backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", fontSize: 10, fontWeight: 700, color: "#0369a1" }}>{sp}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                      <button style={{ height: 30, padding: "0 10px", borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", fontSize: 11, fontWeight: 600, color: "#57534e", cursor: "pointer" }}>
                        Detalhes
                      </button>
                      <button style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "none", background: "#f97316", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                        Enviar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Second event group */}
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e7e5e4", backgroundColor: "#fff" }}>
          <div style={{ padding: "13px 20px", background: "linear-gradient(to right, #0369a1, #0284c7)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#fff", opacity: 0.9 }} />
              <span style={{ color: "#fff", fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, fontSize: 14, letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                Copa Nordeste
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600 }}>
                <Calendar style={{ width: 11, height: 11 }} /> 10/08/2026
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 600 }}>
                <Truck style={{ width: 11, height: 11 }} /> Saída: 07/08 às 08:00
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 99, padding: "3px 9px", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.72)" }}>
                Entrega de Layouts · 18/07 <span style={{ opacity: 0.65 }}>(16d)</span>
              </span>
              <span style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                1 item
              </span>
            </div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#fafaf9", borderBottom: "1px solid #f0ede8" }}>
                {["", "ID", "Qtd", "Banner Rollup", "Dimensões (V / A)", "M²", "Material", "Patrocinadores", "Ações"].map((col, i) => (
                  <th key={i} style={{ padding: "9px 16px", fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: i === 8 ? "right" : "left", whiteSpace: "nowrap" }}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ backgroundColor: "#fff" }}>
                <td style={{ padding: "12px 8px 12px 16px", width: 36 }}>
                  <div style={{ width: 15, height: 15, borderRadius: 4, border: "1.5px solid #d4d4d0" }} />
                </td>
                <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                  <div style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: "#78716c", fontWeight: 600 }}>#0021</div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ fontFamily: '"Space Grotesk", sans-serif', fontSize: 15, fontWeight: 700, color: "#1c1917" }}>6</span>
                </td>
                <td style={{ padding: "12px 16px", minWidth: 180 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1c1917" }}>Banner Rollup</div>
                  <div style={{ fontSize: 11, color: "#a8a29e", marginTop: 2 }}>sem thumb · sem arquivo final</div>
                </td>
                <td style={{ padding: "12px 16px", whiteSpace: "nowrap", fontSize: 12, color: "#57534e" }}>0,85 × 2,00 / 0,95 × 2,10</td>
                <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                  <span style={{ fontFamily: '"DM Mono", monospace', fontSize: 12, color: "#57534e", fontWeight: 600 }}>1,99</span>
                </td>
                <td style={{ padding: "12px 16px", whiteSpace: "nowrap", fontSize: 12, color: "#57534e" }}>Lona brilho</td>
                <td style={{ padding: "12px 16px" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 4, backgroundColor: "#f0f9ff", border: "1px solid #bae6fd", fontSize: 10, fontWeight: 700, color: "#0369a1" }}>Sponsor C</span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                    <button style={{ height: 30, padding: "0 10px", borderRadius: 6, border: "1px solid #e7e5e4", background: "#fff", fontSize: 11, fontWeight: 600, color: "#57534e", cursor: "pointer" }}>Detalhes</button>
                    <button style={{ height: 30, padding: "0 12px", borderRadius: 6, border: "none", background: "#f97316", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Enviar</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
