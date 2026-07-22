import { useState } from "react";
import {
  Palette, Clock, Send, CheckCircle, Package,
  Search, ChevronDown, Printer, Upload, FileImage,
  Zap, AlertCircle, Calendar, Truck, X,
  Image as ImageIcon, FileCheck, Sparkles,
  RotateCcw, TrendingUp, TrendingDown,
} from "lucide-react";

const TABS = [
  { id: "aprovar", label: "Mandar p/ Aprovação", count: 12, color: "#f97316", Icon: Send },
  { id: "correcao", label: "Correção", count: 3, color: "#ef4444", Icon: RotateCcw },
  { id: "finalizar", label: "Finalizar Arte", count: 7, color: "#06b6d4", Icon: FileCheck },
  { id: "finalizados", label: "Finalizados", count: 45, color: "#22c55e", Icon: CheckCircle },
];

const STATS = [
  { label: "Pendentes", sub: "para envio", value: 12, trend: +3, Icon: Clock, color: "#fb923c", glow: "rgba(251,146,60,0.35)", tab: "aprovar" },
  { label: "Aguard. Patrocinador", sub: "em análise", value: 5, trend: -2, Icon: Send, color: "#fbbf24", glow: "rgba(251,191,36,0.30)", tab: null },
  { label: "Aprovado", sub: "pelo patrocinador", value: 7, trend: +1, Icon: CheckCircle, color: "#06b6d4", glow: "rgba(6,182,212,0.35)", tab: "finalizar" },
  { label: "Pronto p/ Produção", sub: "liberado", value: 9, trend: +4, Icon: Package, color: "#4ade80", glow: "rgba(74,222,128,0.30)", tab: null },
];

const PERIOD_PILLS = ["Hoje", "7 dias", "15 dias", "30 dias", "Todos"];

const SP_COLORS: Record<string, { bg: string; text: string; dot: string; initials: string }> = {
  "Sponsor A": { bg: "#cffafe", text: "#155e75", dot: "#0891b2", initials: "SA" },
  "Sponsor B": { bg: "#fef3c7", text: "#92400e", dot: "#d97706", initials: "SB" },
  "Sponsor C": { bg: "#d1fae5", text: "#065f46", dot: "#059669", initials: "SC" },
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
    deadline: "Entrega de Layouts: 22/07 (hoje)", deadlineAlert: true,
    // orange — urgente (mantido)
    gradient: "linear-gradient(135deg, #c2410c 0%, #f97316 100%)",
    items: [ITEMS[0], ITEMS[1]],
  },
  {
    name: "COPA NORDESTE", urgent: false,
    eventDate: "10/08/2026", truck: "07/08 08:00",
    deadline: "Entrega de Layouts: 18/07 (16d)", deadlineAlert: false,
    gradient: "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
    items: [ITEMS[2]],
  },
];

const BTN_LABEL: Record<string, string> = {
  aprovar: "Enviar p/ Aprovação",
  correcao: "Enviar Correção",
  finalizar: "Finalizar Arte",
  finalizados: "Ver Detalhes",
};

const BTN_COLOR: Record<string, string> = {
  aprovar: "#f97316",
  correcao: "#ef4444",
  finalizar: "#0891b2",
  finalizados: "#64748b",
};

export function ArteRedesignV2() {
  const [activeTab, setActiveTab] = useState("aprovar");
  const [period, setPeriod] = useState("15 dias");
  const [eventoFilter, setEventoFilter] = useState("all");
  const [patrocinadorFilter, setPatrocinadorFilter] = useState("all");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [materialFilter, setMaterialFilter] = useState("all");
  const [urgente, setUrgente] = useState(false);
  const [semThumb, setSemThumb] = useState(false);
  const [semFinal, setSemFinal] = useState(false);

  const total = STATS.reduce((s, c) => s + c.value, 0);

  const activeChips = [
    eventoFilter !== "all" && `Evento: ${eventoFilter}`,
    patrocinadorFilter !== "all" && `Patrocinador: ${patrocinadorFilter}`,
    tipoFilter !== "all" && `Tipo: ${tipoFilter}`,
    materialFilter !== "all" && `Material: ${materialFilter}`,
    urgente && "Urgente",
    semThumb && "Sem thumb",
    semFinal && "Sem arq. final",
  ].filter(Boolean) as string[];

  const removeChip = (chip: string) => {
    if (chip.startsWith("Evento:")) setEventoFilter("all");
    else if (chip.startsWith("Patrocinador:")) setPatrocinadorFilter("all");
    else if (chip.startsWith("Tipo:")) setTipoFilter("all");
    else if (chip.startsWith("Material:")) setMaterialFilter("all");
    else if (chip === "Urgente") setUrgente(false);
    else if (chip === "Sem thumb") setSemThumb(false);
    else if (chip === "Sem arq. final") setSemFinal(false);
  };

  return (
    <div style={{ fontFamily: "'DM Sans','Helvetica Neue',Arial,sans-serif", minHeight: "100vh", backgroundColor: "#f1f0ef", display: "flex", flexDirection: "column" }}>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* HERO HEADER — dark purple gradient (paleta NORTE)             */}
      {/* ══════════════════════════════════════════════════════════════ */}
      <div style={{ background: "linear-gradient(160deg, #1c1917 0%, #28211e 55%, #1c1917 100%)", flexShrink: 0 }}>
        <div style={{ padding: "20px 32px 0", maxWidth: 1400, margin: "0 auto" }}>

          {/* ── Identity + actions ── */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14,
                background: "linear-gradient(135deg, #ea580c, #f97316)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                boxShadow: "0 0 0 1px rgba(249,115,22,0.4), 0 8px 24px rgba(234,88,12,0.45)",
              }}>
                <Palette style={{ width: 24, height: 24, color: "#fff" }} />
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.05em", margin: 0, fontFamily: '"Space Grotesk",sans-serif', lineHeight: 1.1 }}>
                    Módulo Arte
                  </h1>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, backgroundColor: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.28)", fontSize: 11, fontWeight: 700, color: "#fbbf24" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#fbbf24", display: "inline-block" }} />
                    22 em andamento
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.40)", margin: 0, marginTop: 3 }}>
                  Aprovações · Correções · Finalizações de layout
                </p>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.70)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Printer style={{ width: 12, height: 12 }} /> Exportar PDF
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(74,222,128,0.30)", background: "rgba(74,222,128,0.12)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                <FileImage style={{ width: 12, height: 12 }} /> Multi-Upload Thumbs
              </button>
              <button style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.32)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <Upload style={{ width: 12, height: 12 }} /> PDF Compartilhado
              </button>
            </div>
          </div>

          {/* ── STAT CARDS — dark glass ── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            {STATS.map((s, i) => {
              const Icon = s.Icon;
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              const isActive = !!(s.tab && activeTab === s.tab);
              const trendUp = s.trend > 0;
              return (
                <div
                  key={i}
                  onClick={() => s.tab && setActiveTab(s.tab as string)}
                  style={{
                    flex: 1, padding: "14px 16px 12px", borderRadius: 12,
                    background: isActive
                      ? "linear-gradient(145deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.06) 100%)"
                      : "rgba(255,255,255,0.06)",
                    border: `1px solid ${isActive ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.09)"}`,
                    cursor: s.tab ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 6,
                    boxShadow: isActive ? `0 0 28px ${s.glow}` : "none",
                    transition: "all 0.15s",
                    position: "relative", overflow: "hidden",
                  }}
                >
                  {/* active top stripe */}
                  {isActive && (
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${s.color}, transparent)` }} />
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? s.color : "rgba(255,255,255,0.38)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {s.label}
                    </span>
                    <span style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: `${s.color}20`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icon style={{ width: 13, height: 13, color: s.color }} />
                    </span>
                  </div>

                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 34, fontWeight: 800, color: isActive ? s.color : "#fff", letterSpacing: "-0.05em", lineHeight: 1, fontFamily: '"Space Grotesk",sans-serif', textShadow: isActive ? `0 0 20px ${s.glow}` : "none" }}>
                      {s.value}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      {trendUp
                        ? <TrendingUp style={{ width: 10, height: 10, color: "#fb923c" }} />
                        : <TrendingDown style={{ width: 10, height: 10, color: "#4ade80" }} />
                      }
                      <span style={{ fontSize: 10, fontWeight: 700, color: trendUp ? "#fb923c" : "#4ade80" }}>
                        {trendUp ? "+" : ""}{s.trend}
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: -2 }}>{s.sub}</div>

                  <div style={{ height: 2, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, backgroundColor: s.color, borderRadius: 2, opacity: 0.65 }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── FILTERS ROW 1: search + dropdowns + period ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>

            {/* Search */}
            <div style={{ position: "relative", flex: "1 1 180px", minWidth: 160 }}>
              <Search style={{ width: 12, height: 12, color: "rgba(255,255,255,0.30)", position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                placeholder="Buscar arte, ID ou projeto..."
                style={{ width: "100%", height: 34, paddingLeft: 28, paddingRight: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", backgroundColor: "rgba(255,255,255,0.08)", color: "#fff", fontSize: 12, outline: "none", boxSizing: "border-box" }}
              />
            </div>

            {/* Evento dropdown */}
            <div style={{ position: "relative" }}>
              <select
                value={eventoFilter}
                onChange={e => setEventoFilter(e.target.value)}
                style={{ height: 34, paddingLeft: 10, paddingRight: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", background: eventoFilter !== "all" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.08)", color: eventoFilter !== "all" ? "#fed7aa" : "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 500, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none" }}
              >
                <option value="all" style={{ background: "#1c1917", color: "#fff" }}>Evento</option>
                <option value="Maratona de Resultados" style={{ background: "#1c1917", color: "#fff" }}>Maratona de Resultados</option>
                <option value="Copa Nordeste" style={{ background: "#1c1917", color: "#fff" }}>Copa Nordeste</option>
                <option value="Summit Esportivo" style={{ background: "#1c1917", color: "#fff" }}>Summit Esportivo</option>
              </select>
              <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,0.35)", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>

            {/* Patrocinador dropdown */}
            <div style={{ position: "relative" }}>
              <select
                value={patrocinadorFilter}
                onChange={e => setPatrocinadorFilter(e.target.value)}
                style={{ height: 34, paddingLeft: 10, paddingRight: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", background: patrocinadorFilter !== "all" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.08)", color: patrocinadorFilter !== "all" ? "#fed7aa" : "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 500, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none" }}
              >
                <option value="all" style={{ background: "#1c1917", color: "#fff" }}>Patrocinador</option>
                <option value="Sponsor A" style={{ background: "#1c1917", color: "#fff" }}>Sponsor A</option>
                <option value="Sponsor B" style={{ background: "#1c1917", color: "#fff" }}>Sponsor B</option>
                <option value="Sponsor C" style={{ background: "#1c1917", color: "#fff" }}>Sponsor C</option>
              </select>
              <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,0.35)", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>

            {/* Tipo dropdown */}
            <div style={{ position: "relative" }}>
              <select
                value={tipoFilter}
                onChange={e => setTipoFilter(e.target.value)}
                style={{ height: 34, paddingLeft: 10, paddingRight: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", background: tipoFilter !== "all" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.08)", color: tipoFilter !== "all" ? "#fed7aa" : "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 500, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none" }}
              >
                <option value="all" style={{ background: "#1c1917", color: "#fff" }}>Tipo de Peça</option>
                <option value="Backdrop" style={{ background: "#1c1917", color: "#fff" }}>Backdrop</option>
                <option value="Faixa" style={{ background: "#1c1917", color: "#fff" }}>Faixa</option>
                <option value="Banner" style={{ background: "#1c1917", color: "#fff" }}>Banner</option>
                <option value="Adesivo" style={{ background: "#1c1917", color: "#fff" }}>Adesivo</option>
                <option value="Painel" style={{ background: "#1c1917", color: "#fff" }}>Painel</option>
              </select>
              <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,0.35)", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>

            {/* Material dropdown */}
            <div style={{ position: "relative" }}>
              <select
                value={materialFilter}
                onChange={e => setMaterialFilter(e.target.value)}
                style={{ height: 34, paddingLeft: 10, paddingRight: 26, borderRadius: 8, border: "1px solid rgba(255,255,255,0.13)", background: materialFilter !== "all" ? "rgba(249,115,22,0.15)" : "rgba(255,255,255,0.08)", color: materialFilter !== "all" ? "#fed7aa" : "rgba(255,255,255,0.65)", fontSize: 12, fontWeight: 500, cursor: "pointer", outline: "none", appearance: "none", WebkitAppearance: "none" }}
              >
                <option value="all" style={{ background: "#1c1917", color: "#fff" }}>Material</option>
                <option value="Lona 440g" style={{ background: "#1c1917", color: "#fff" }}>Lona 440g</option>
                <option value="Lona 280g" style={{ background: "#1c1917", color: "#fff" }}>Lona 280g</option>
                <option value="Tecido" style={{ background: "#1c1917", color: "#fff" }}>Tecido</option>
                <option value="Adesivo Vinil" style={{ background: "#1c1917", color: "#fff" }}>Adesivo Vinil</option>
                <option value="Papel" style={{ background: "#1c1917", color: "#fff" }}>Papel</option>
              </select>
              <ChevronDown style={{ width: 10, height: 10, color: "rgba(255,255,255,0.35)", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            </div>

            {/* Period pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "3px", borderRadius: 9, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {PERIOD_PILLS.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  style={{ height: 28, padding: "0 11px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: period === p ? 700 : 500, background: period === p ? "rgba(255,255,255,0.16)" : "transparent", color: period === p ? "#fff" : "rgba(255,255,255,0.38)", transition: "all 0.12s" }}>
                  {p}
                </button>
              ))}
            </div>

            <button style={{ display: "flex", alignItems: "center", gap: 5, height: 34, padding: "0 11px", borderRadius: 8, border: "1px solid rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.10)", color: "#fbbf24", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              <Truck style={{ width: 12, height: 12 }} /> Saída do caminhão
            </button>
          </div>

          {/* ── FILTERS ROW 2: boolean toggles ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.10em", marginRight: 2 }}>Mostrar apenas:</span>

            {[
              { key: "urgente", label: "Urgente", value: urgente, set: setUrgente, color: "#ef4444", glow: "rgba(239,68,68,0.25)" },
              { key: "semThumb", label: "Sem thumb", value: semThumb, set: setSemThumb, color: "#fbbf24", glow: "rgba(251,191,36,0.22)" },
              { key: "semFinal", label: "Sem arq. final", value: semFinal, set: setSemFinal, color: "#06b6d4", glow: "rgba(6,182,212,0.22)" },
            ].map(({ key, label, value, set, color, glow }) => (
              <button
                key={key}
                onClick={() => set(!value)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  height: 26, padding: "0 10px", borderRadius: 99, cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "all 0.14s",
                  border: value ? `1px solid ${color}` : "1px solid rgba(255,255,255,0.13)",
                  background: value ? glow : "rgba(255,255,255,0.06)",
                  color: value ? color : "rgba(255,255,255,0.45)",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: value ? color : "rgba(255,255,255,0.25)", flexShrink: 0 }} />
                {label}
              </button>
            ))}
          </div>

          {/* Active filter chips */}
          {activeChips.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.10em" }}>Filtros ativos:</span>
              {activeChips.map(chip => (
                <span key={chip} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: "rgba(249,115,22,0.18)", border: "1px solid rgba(249,115,22,0.35)", fontSize: 11, fontWeight: 600, color: "#fed7aa" }}>
                  {chip}
                  <button onClick={() => removeChip(chip)} style={{ background: "none", border: "none", cursor: "pointer", color: "#fed7aa", display: "flex", alignItems: "center", padding: 0 }}>
                    <X style={{ width: 9, height: 9 }} />
                  </button>
                </span>
              ))}
              <button onClick={() => { setEventoFilter("all"); setPatrocinadorFilter("all"); setTipoFilter("all"); setUrgente(false); setSemThumb(false); setSemFinal(false); }}
                style={{ fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.35)", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>
                Limpar tudo
              </button>
            </div>
          )}

          {/* ── TABS with icons ── */}
          <div style={{ display: "flex", alignItems: "flex-end", borderBottom: "1px solid rgba(255,255,255,0.10)" }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              const TabIcon = tab.Icon;
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
                    color: isActive ? tab.color : "rgba(255,255,255,0.40)",
                    fontWeight: isActive ? 700 : 500, fontSize: 13,
                    whiteSpace: "nowrap", borderRadius: "6px 6px 0 0",
                    transition: "all 0.14s",
                  }}
                >
                  <TabIcon style={{ width: 13, height: 13, flexShrink: 0 }} />
                  {tab.label}
                  {tab.count > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 100, fontSize: 10, fontWeight: 800, padding: "0 5px", backgroundColor: isActive ? tab.color : "rgba(255,255,255,0.12)", color: isActive ? "#fff" : "rgba(255,255,255,0.42)" }}>
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
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
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

                    {/* checkbox */}
                    <td style={{ padding: "12px 8px 12px 16px", width: 32 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, border: "1.5px solid #d4d0cc" }} />
                    </td>

                    {/* ID */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <div style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: "#78716c", fontWeight: 600 }}>{item.id}</div>
                      {item.urgent && (
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 2, marginTop: 3, padding: "1px 5px", borderRadius: 3, backgroundColor: "#fef2f2", fontSize: 8, fontWeight: 800, color: "#dc2626", letterSpacing: "0.06em" }}>
                          <Zap style={{ width: 7, height: 7 }} /> URGENTE
                        </div>
                      )}
                    </td>

                    {/* qty */}
                    <td style={{ padding: "12px 14px" }}>
                      <span style={{ fontFamily: '"Space Grotesk",sans-serif', fontSize: 20, fontWeight: 800, color: "#1c1917", letterSpacing: "-0.04em" }}>{item.qty}</span>
                    </td>

                    {/* type */}
                    <td style={{ padding: "12px 14px", minWidth: 150 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>{item.type}</div>
                    </td>

                    {/* dims */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 11, color: "#78716c" }}>{item.dims}</span>
                    </td>

                    {/* m2 */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: '"DM Mono",monospace', fontSize: 12, fontWeight: 700, color: "#1c1917" }}>{item.m2}</span>
                      <span style={{ fontSize: 9, color: "#a8a29e", marginLeft: 2 }}>m²</span>
                    </td>

                    {/* material */}
                    <td style={{ padding: "12px 14px", fontSize: 11, color: "#78716c", whiteSpace: "nowrap" }}>{item.material}</td>

                    {/* Arte status */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: item.hasThumb ? "#f0fdf4" : "#f5f5f4", border: `1px solid ${item.hasThumb ? "#bbf7d0" : "#e2e0de"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <ImageIcon style={{ width: 12, height: 12, color: item.hasThumb ? "#16a34a" : "#c8c5c2" }} />
                          </div>
                          <span style={{ fontSize: 8, color: item.hasThumb ? "#16a34a" : "#c8c5c2", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>thumb</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: item.hasFinal ? "#f0fdf4" : "#f5f5f4", border: `1px solid ${item.hasFinal ? "#bbf7d0" : "#e2e0de"}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <FileCheck style={{ width: 12, height: 12, color: item.hasFinal ? "#16a34a" : "#c8c5c2" }} />
                          </div>
                          <span style={{ fontSize: 8, color: item.hasFinal ? "#16a34a" : "#c8c5c2", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>final</span>
                        </div>
                      </div>
                    </td>

                    {/* Sponsors */}
                    <td style={{ padding: "12px 14px" }}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {item.sponsors.map((sp, si) => {
                          const c = SP_COLORS[sp] || { bg: "#f5f5f4", text: "#57534e", dot: "#a8a29e", initials: sp.slice(0, 2).toUpperCase() };
                          return (
                            <span key={si} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px 3px 4px", borderRadius: 99, backgroundColor: c.bg, fontSize: 10, fontWeight: 700, color: c.text, whiteSpace: "nowrap" }}>
                              <span style={{ width: 17, height: 17, borderRadius: "50%", backgroundColor: c.dot, color: "#fff", fontSize: 7, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", letterSpacing: "0.02em" }}>
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
                        <button style={{ height: 30, padding: "0 14px", borderRadius: 6, border: "none", background: BTN_COLOR[activeTab], fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                          {BTN_LABEL[activeTab]}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : (
          /* Finalizados empty state */
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
