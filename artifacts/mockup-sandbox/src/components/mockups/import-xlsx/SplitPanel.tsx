import { useState } from "react";
import { Upload, CheckCircle2, X, Trash2, Check, AlertTriangle, Search, ChevronDown, FileSpreadsheet } from "lucide-react";

const N = {
  bg: "#F7F6F3",
  surface: "#FFFFFF",
  card: "#FAFAF9",
  border: "#E7E5E4",
  text: "#1A1C1C",
  second: "#78716C",
  muted: "#A8A29E",
  low: "#F5F4F2",
  accent: "#D97A1E",
  green: "#16A34A",
  greenBg: "#F0FDF4",
  greenBorder: "#BBF7D0",
  amber: "#D97706",
  amberBg: "#FFFBEB",
  amberBorder: "#FDE68A",
};

const SAMPLE_ITEMS = [
  { id: 1, group: "PALCO",   desc: "Lona Palco Frente c/ Logo NORTE",  qty: 1,  w: 12, h: 6,   mat: "Lona",             finish: "Bastão", sponsor: "MASTER" },
  { id: 2, group: "PALCO",   desc: "Lona Palco Lateral Esquerda",       qty: 2,  w: 4,  h: 6,   mat: "Lona",             finish: "Bastão", sponsor: "GOLD"   },
  { id: 3, group: "PALCO",   desc: "Lona Palco Lateral Direita",        qty: 2,  w: 4,  h: 6,   mat: "Lona",             finish: "Bastão", sponsor: "GOLD"   },
  { id: 4, group: "GRADIL",  desc: "Faixa Gradil Corredor Largo",       qty: 80, w: 1,  h: 0.7, mat: "Lona",             finish: "Ilhós",  sponsor: "SILVER" },
  { id: 5, group: "GRADIL",  desc: "Faixa Gradil Largada Oficial",      qty: 20, w: 1,  h: 0.7, mat: "Lona",             finish: "Ilhós",  sponsor: "SILVER" },
  { id: 6, group: "ROLO",    desc: "Back-drop Tenda VIP",               qty: 3,  w: 3,  h: 2.5, mat: "Papel Fotográfico",finish: "—",      sponsor: "MASTER" },
  { id: 7, group: "PÓRTICO", desc: "Mega Banner Pórtico Largada",       qty: 1,  w: 6,  h: 5,   mat: "Lona",             finish: "Bastão", sponsor: "MASTER" },
  { id: 8, group: "PÓRTICO", desc: "Mega Banner Pórtico Chegada",       qty: 1,  w: 6,  h: 5,   mat: "Lona",             finish: "Bastão", sponsor: "GOLD"   },
];

const SPONSORS = ["MASTER", "GOLD", "SILVER", "APOIO", "MÍDIA", "—"];
const SCOLOR: Record<string, { fg: string; bg: string; border: string }> = {
  MASTER:  { fg: "#ef4444", bg: "#fef2f2", border: "#fee2e2" },
  GOLD:    { fg: "#1d4ed8", bg: "#eff6ff", border: "#dbeafe" },
  SILVER:  { fg: "#7c3aed", bg: "#f5f3ff", border: "#ede9fe" },
  APOIO:   { fg: "#6b7280", bg: "#f9fafb", border: "#f3f4f6" },
  MÍDIA:   { fg: "#0891b2", bg: "#ecfeff", border: "#cffafe" },
  "—":     { fg: "#a8a29e", bg: "#fafaf9", border: "#e7e5e4" },
};

function SponsorPill({ name, onClick }: { name: string; onClick?: () => void }) {
  const c = SCOLOR[name] ?? SCOLOR["—"];
  return (
    <button
      onClick={onClick}
      style={{ fontSize: 10, fontWeight: 800, color: c.fg, background: c.bg, border: `1px solid ${c.border}`, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.07em", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}
    >
      {name} <ChevronDown style={{ width: 9, height: 9 }} />
    </button>
  );
}

export function SplitPanel() {
  const [file, setFile] = useState<string>("EcoRun_RJ.xlsx");
  const [items, setItems] = useState(SAMPLE_ITEMS.map(i => ({ ...i })));
  const [search, setSearch] = useState("");
  const [dragging, setDragging] = useState(false);
  const [editSponsor, setEditSponsor] = useState<number | null>(null);

  const groups = Array.from(new Set(items.map(i => i.group)));
  const totalM2 = items.reduce((s, i) => s + i.qty * i.w * i.h, 0);
  const linked = items.filter(i => i.sponsor !== "—").length;
  const linkPct = items.length > 0 ? Math.round((linked / items.length) * 100) : 0;

  const filtered = search
    ? items.filter(i => i.desc.toLowerCase().includes(search.toLowerCase()) || i.group.toLowerCase().includes(search.toLowerCase()))
    : items;
  const filteredGroups = Array.from(new Set(filtered.map(i => i.group)));

  return (
    <div style={{ height: "100vh", backgroundColor: N.bg, display: "flex", fontFamily: "Inter, sans-serif", overflow: "hidden" }}>

      {/* ── Left sidebar ── */}
      <div style={{ width: 260, minWidth: 260, backgroundColor: N.surface, borderRight: `1px solid ${N.border}`, display: "flex", flexDirection: "column", padding: "22px 18px", gap: 18, overflowY: "auto" }}>

        {/* Title */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: N.greenBg, border: `1px solid ${N.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet style={{ width: 15, height: 15, color: N.green }} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: N.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>Importar Peças</div>
              <div style={{ fontSize: 10, color: N.muted, marginTop: 1 }}>EcoRun RJ 2025</div>
            </div>
          </div>
        </div>

        {/* Drop zone */}
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); setFile("EcoRun_RJ.xlsx"); }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, border: `2px dashed`, borderColor: file ? N.green : dragging ? N.accent : N.border, borderRadius: 10, padding: "18px 12px", cursor: "pointer", backgroundColor: file ? N.greenBg : dragging ? "#FFF7ED" : N.low, transition: "all 0.2s" }}
        >
          {file ? (
            <>
              <CheckCircle2 style={{ width: 24, height: 24, color: N.green }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: N.green, fontFamily: "'Space Grotesk', sans-serif" }}>{file}</div>
                <div style={{ fontSize: 11, color: N.muted, marginTop: 2 }}>248 KB · Pronto</div>
              </div>
              <button onClick={e => { e.preventDefault(); setFile(""); }} style={{ fontSize: 10, color: "#ef4444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}>
                <X style={{ width: 10, height: 10 }} /> Remover
              </button>
            </>
          ) : (
            <>
              <Upload style={{ width: 20, height: 20, color: dragging ? N.accent : N.muted }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: N.text }}>Arraste o .xlsx</div>
                <div style={{ fontSize: 11, color: N.muted, marginTop: 2 }}>ou clique para selecionar</div>
              </div>
            </>
          )}
        </label>

        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { l: "Peças",     v: items.length,            color: N.text,   mono: false },
            { l: "Grupos",    v: groups.length,           color: N.text,   mono: false },
            { l: "M² total",  v: `${totalM2.toFixed(0)}`, color: N.accent, mono: true  },
            { l: "Vinculados",v: `${linkPct}%`,           color: linkPct === 100 ? N.green : N.amber, mono: false },
          ].map(s => (
            <div key={s.l} style={{ backgroundColor: N.low, border: `1px solid ${N.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: s.mono ? "DM Mono, monospace" : "'Space Grotesk', sans-serif", lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 9, color: N.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 11, color: N.second, fontWeight: 600 }}>Vinculação</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: linkPct === 100 ? N.green : N.amber }}>{linked}/{items.length}</span>
          </div>
          <div style={{ height: 5, backgroundColor: N.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${linkPct}%`, backgroundColor: linkPct === 100 ? N.green : N.amber, borderRadius: 99, transition: "width 0.4s" }} />
          </div>
        </div>

        {/* Format tip */}
        <div style={{ padding: "10px 12px", backgroundColor: N.amberBg, border: `1px solid ${N.amberBorder}`, borderRadius: 8, display: "flex", gap: 8 }}>
          <AlertTriangle style={{ width: 13, height: 13, color: N.amber, flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 10, color: "#78350f", lineHeight: 1.6 }}>
            <strong style={{ color: "#92400e" }}>Formato NORTE:</strong><br />
            item · qtde · material · acabamento
          </div>
        </div>

        {/* Spacer + CTA */}
        <div style={{ flex: 1 }} />
        <button
          disabled={!file}
          style={{ width: "100%", padding: "11px 0", backgroundColor: file ? N.green : N.border, color: file ? "#fff" : N.muted, border: "none", borderRadius: 9, fontWeight: 800, fontSize: 13, cursor: file ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background 0.2s" }}
        >
          <Check style={{ width: 15, height: 15 }} />
          Importar {items.length} peças
        </button>
      </div>

      {/* ── Right: Table ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* Search bar */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${N.border}`, backgroundColor: N.surface, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: N.muted }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filtrar peças ou grupos..."
              style={{ width: "100%", padding: "7px 12px 7px 28px", backgroundColor: N.low, border: `1px solid ${N.border}`, borderRadius: 7, color: N.text, fontSize: 12, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <span style={{ fontSize: 11, color: N.muted, whiteSpace: "nowrap", fontWeight: 600 }}>{filtered.length} de {items.length}</span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ backgroundColor: N.low, boxShadow: `0 1px 0 ${N.border}` }}>
                {["Descrição", "Qtd", "W×H (m)", "M²", "Material", "Acabamento", "Patrocinador", ""].map((h, i) => (
                  <th key={i} style={{ padding: "9px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: N.second, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredGroups.map((g, gi) => {
                const rows = filtered.filter(i => i.group === g);
                const gM2 = rows.reduce((s, i) => s + i.qty * i.w * i.h, 0);
                return (
                  <>
                    <tr key={`g-${g}`}>
                      <td colSpan={8} style={{ padding: "9px 12px 8px", background: "linear-gradient(90deg, #F0EEEC 0%, #F5F4F2 100%)", borderTop: gi > 0 ? `2px solid #E2DEDA` : undefined, borderBottom: `1px solid ${N.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: N.accent, borderRadius: 2 }} />
                            <span style={{ fontWeight: 800, fontSize: 12, color: N.text, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>{g}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: N.muted, backgroundColor: "#E8E6E3", borderRadius: 99, padding: "1px 8px" }}>{rows.length}</span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: N.accent, fontWeight: 700 }}>{gM2.toFixed(1)} m²</span>
                        </div>
                      </td>
                    </tr>
                    {rows.map((row, ri) => (
                      <tr key={row.id} style={{ backgroundColor: ri % 2 === 0 ? N.surface : N.card }}>
                        <td style={{ padding: "7px 10px", color: N.text, maxWidth: 220 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{row.desc}</div>
                        </td>
                        <td style={{ padding: "7px 10px", fontFamily: "DM Mono, monospace", fontWeight: 700, color: N.accent }}>{row.qty}</td>
                        <td style={{ padding: "7px 10px", fontFamily: "DM Mono, monospace", color: N.second, fontSize: 11 }}>{row.w}×{row.h}</td>
                        <td style={{ padding: "7px 10px", fontFamily: "DM Mono, monospace", fontWeight: 600, color: N.text }}>{(row.qty * row.w * row.h).toFixed(1)}</td>
                        <td style={{ padding: "7px 10px", color: N.second }}>{row.mat}</td>
                        <td style={{ padding: "7px 10px", color: N.muted }}>{row.finish}</td>
                        <td style={{ padding: "7px 10px", position: "relative" }}>
                          <SponsorPill name={row.sponsor} onClick={() => setEditSponsor(editSponsor === row.id ? null : row.id)} />
                          {editSponsor === row.id && (
                            <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, backgroundColor: N.surface, border: `1px solid ${N.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 110 }}>
                              {SPONSORS.map(s => {
                                const sc = SCOLOR[s] ?? SCOLOR["—"];
                                return (
                                  <button
                                    key={s}
                                    onClick={() => { setItems(prev => prev.map(i => i.id === row.id ? { ...i, sponsor: s } : i)); setEditSponsor(null); }}
                                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", background: s === row.sponsor ? N.low : "none", border: "none", cursor: "pointer", color: sc.fg, fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", textAlign: "left" }}
                                  >
                                    {s === row.sponsor ? <Check style={{ width: 10, height: 10 }} /> : <div style={{ width: 10 }} />}
                                    {s}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "7px 10px" }}>
                          <button onClick={() => setItems(prev => prev.filter(i => i.id !== row.id))} style={{ background: "none", border: "none", cursor: "pointer", color: N.muted, padding: 2, display: "flex", borderRadius: 4 }}>
                            <Trash2 style={{ width: 12, height: 12 }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: N.muted }}>
              <Search style={{ width: 28, height: 28, color: N.border, margin: "0 auto 10px" }} />
              <div style={{ fontSize: 13, fontWeight: 600 }}>Nenhuma peça encontrada</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
