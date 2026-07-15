import { useState } from "react";
import { Upload, CheckCircle2, FileSpreadsheet, X, Trash2, Check, AlertTriangle, Search, ChevronDown } from "lucide-react";

const C = {
  bg: "#111110",
  panel: "#1C1B19",
  card: "#252422",
  border: "#2E2C29",
  text: "#F5F4F2",
  second: "#A8A29E",
  muted: "#6B6560",
  accent: "#F97316",
  green: "#22C55E",
  greenDim: "#166534",
  surface: "#FFFFFF",
};

const SAMPLE_ITEMS = [
  { id: 1, group: "PALCO", desc: "Lona Palco Frente c/ Logo NORTE", qty: 1, w: 12, h: 6, mat: "Lona", finish: "Bastão", sponsor: "MASTER" },
  { id: 2, group: "PALCO", desc: "Lona Palco Lateral Esquerda", qty: 2, w: 4, h: 6, mat: "Lona", finish: "Bastão", sponsor: "GOLD" },
  { id: 3, group: "PALCO", desc: "Lona Palco Lateral Direita", qty: 2, w: 4, h: 6, mat: "Lona", finish: "Bastão", sponsor: "GOLD" },
  { id: 4, group: "GRADIL", desc: "Faixa Gradil Corredor Largo", qty: 80, w: 1, h: 0.7, mat: "Lona", finish: "Ilhós", sponsor: "SILVER" },
  { id: 5, group: "GRADIL", desc: "Faixa Gradil Largada Oficial", qty: 20, w: 1, h: 0.7, mat: "Lona", finish: "Ilhós", sponsor: "SILVER" },
  { id: 6, group: "ROLO", desc: "Back-drop Tenda VIP", qty: 3, w: 3, h: 2.5, mat: "Papel Fotográfico", finish: "—", sponsor: "MASTER" },
  { id: 7, group: "PÓRTICO", desc: "Mega Banner Pórtico Largada", qty: 1, w: 6, h: 5, mat: "Lona", finish: "Bastão", sponsor: "MASTER" },
  { id: 8, group: "PÓRTICO", desc: "Mega Banner Pórtico Chegada", qty: 1, w: 6, h: 5, mat: "Lona", finish: "Bastão", sponsor: "GOLD" },
];

const SPONSORS = ["MASTER", "GOLD", "SILVER", "APOIO", "MÍDIA", "—"];
const SCOLOR: Record<string, { fg: string; bg: string }> = {
  MASTER:  { fg: "#fca5a5", bg: "#450a0a" },
  GOLD:    { fg: "#93c5fd", bg: "#172554" },
  SILVER:  { fg: "#c4b5fd", bg: "#2e1065" },
  APOIO:   { fg: "#d1d5db", bg: "#1f2937" },
  MÍDIA:   { fg: "#67e8f9", bg: "#083344" },
  "—":     { fg: "#78716c", bg: "#1c1b19" },
};

function SponsorPill({ name, onClick }: { name: string; onClick?: () => void }) {
  const c = SCOLOR[name] ?? SCOLOR["—"];
  return (
    <button onClick={onClick} style={{ fontSize: 10, fontWeight: 800, color: c.fg, background: c.bg, border: `1px solid ${c.fg}30`, borderRadius: 4, padding: "2px 8px", letterSpacing: "0.07em", fontFamily: "'Space Grotesk', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
      {name} <ChevronDown style={{ width: 10, height: 10 }} />
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
  const linkPct = Math.round((linked / items.length) * 100);

  const filtered = search
    ? items.filter(i => i.desc.toLowerCase().includes(search.toLowerCase()) || i.group.toLowerCase().includes(search.toLowerCase()))
    : items;
  const filteredGroups = Array.from(new Set(filtered.map(i => i.group)));

  return (
    <div style={{ minHeight: "100vh", backgroundColor: C.bg, display: "flex", fontFamily: "Inter, sans-serif" }}>
      {/* ── Left: Upload + Info ── */}
      <div style={{ width: 280, minWidth: 280, backgroundColor: C.panel, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", padding: "24px 20px", gap: 20 }}>
        {/* Logo / Title */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: C.green }} />
            <span style={{ fontSize: 9, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "'Space Grotesk', sans-serif" }}>Norte · Import</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", lineHeight: 1 }}>Importar Peças</div>
        </div>

        {/* Drop zone */}
        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); setFile("EcoRun_RJ.xlsx"); }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, border: `1.5px dashed`, borderColor: file ? C.green : dragging ? C.accent : C.border, borderRadius: 10, padding: "20px 12px", cursor: "pointer", backgroundColor: file ? "#052e16" : dragging ? "#431407" : C.card, transition: "all 0.2s" }}
        >
          {file ? (
            <>
              <CheckCircle2 style={{ width: 26, height: 26, color: C.green }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.green, fontFamily: "'Space Grotesk', sans-serif" }}>{file}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>248 KB · 71 peças</div>
              </div>
              <button onClick={e => { e.preventDefault(); setFile(""); }} style={{ fontSize: 10, color: "#f87171", background: "#450a0a", border: "none", borderRadius: 4, padding: "3px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                <X style={{ width: 10, height: 10 }} /> Remover
              </button>
            </>
          ) : (
            <>
              <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Upload style={{ width: 18, height: 18, color: C.muted }} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.second }}>Arraste o .xlsx aqui</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>ou clique para selecionar</div>
              </div>
            </>
          )}
        </label>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {[
            { l: "Peças", v: items.length, color: C.text },
            { l: "Grupos", v: groups.length, color: C.text },
            { l: "M² total", v: `${totalM2.toFixed(0)}`, color: C.accent },
            { l: "Vinculados", v: `${linkPct}%`, color: linkPct === 100 ? C.green : "#fbbf24" },
          ].map(s => (
            <div key={s.l} style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Linking progress */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>Vinculação</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: linkPct === 100 ? C.green : "#fbbf24" }}>{linked}/{items.length}</span>
          </div>
          <div style={{ height: 4, backgroundColor: C.border, borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${linkPct}%`, backgroundColor: linkPct === 100 ? C.green : "#fbbf24", borderRadius: 99, transition: "width 0.4s" }} />
          </div>
        </div>

        {/* Format tip */}
        <div style={{ padding: "10px 12px", backgroundColor: "#451a03", border: "1px solid #92400e", borderRadius: 8, display: "flex", gap: 8 }}>
          <AlertTriangle style={{ width: 13, height: 13, color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 10, color: "#fde68a", lineHeight: 1.6 }}>
            <strong>Formato NORTE:</strong><br />item · qtde · material · acabamento
          </div>
        </div>

        {/* CTA */}
        <div style={{ flex: 1 }} />
        <button disabled={!file} style={{ width: "100%", padding: "12px 0", backgroundColor: file ? C.green : C.card, color: file ? "#fff" : C.muted, border: "none", borderRadius: 10, fontWeight: 800, fontSize: 14, cursor: file ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.01em", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "background 0.2s" }}>
          <Check style={{ width: 16, height: 16 }} />
          Confirmar {items.length} peças
        </button>
      </div>

      {/* ── Right: Table ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Search bar */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: C.muted }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filtrar peças ou grupos..." style={{ width: "100%", padding: "8px 12px 8px 32px", backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", fontWeight: 600 }}>{filtered.length} de {items.length}</span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
              <tr style={{ backgroundColor: C.panel }}>
                {["Descrição", "Qtd", "W×H", "M²", "Material", "Acabamento", "Patrocinador", ""].map((h, i) => (
                  <th key={i} style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border}` }}>{h}</th>
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
                      <td colSpan={8} style={{ padding: "10px 14px 9px", backgroundColor: C.card, borderTop: gi > 0 ? `1px solid ${C.border}` : undefined, borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 3, height: 14, backgroundColor: C.accent, borderRadius: 2 }} />
                            <span style={{ fontWeight: 800, fontSize: 12, color: C.text, fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{g}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, color: C.muted, backgroundColor: C.panel, borderRadius: 99, padding: "1px 8px", border: `1px solid ${C.border}` }}>{rows.length}</span>
                          </div>
                          <span style={{ fontSize: 11, fontFamily: "DM Mono, monospace", color: C.accent, fontWeight: 700 }}>{gM2.toFixed(1)} m²</span>
                        </div>
                      </td>
                    </tr>
                    {rows.map((row, ri) => (
                      <tr key={row.id} style={{ backgroundColor: ri % 2 === 0 ? C.bg : C.panel }}>
                        <td style={{ padding: "8px 12px", color: C.text, maxWidth: 200 }}>
                          <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{row.desc}</div>
                        </td>
                        <td style={{ padding: "8px 12px", fontFamily: "DM Mono, monospace", fontWeight: 700, color: C.accent }}>{row.qty}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "DM Mono, monospace", color: C.second, fontSize: 11 }}>{row.w}×{row.h}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "DM Mono, monospace", fontWeight: 600, color: C.text }}>{(row.qty * row.w * row.h).toFixed(1)}</td>
                        <td style={{ padding: "8px 12px", color: C.second }}>{row.mat}</td>
                        <td style={{ padding: "8px 12px", color: C.muted }}>{row.finish}</td>
                        <td style={{ padding: "8px 12px", position: "relative" }}>
                          <div>
                            <SponsorPill name={row.sponsor} onClick={() => setEditSponsor(editSponsor === row.id ? null : row.id)} />
                            {editSponsor === row.id && (
                              <div style={{ position: "absolute", top: "100%", left: 0, zIndex: 10, backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", minWidth: 110 }}>
                                {SPONSORS.map(s => (
                                  <button key={s} onClick={() => { setItems(prev => prev.map(i => i.id === row.id ? { ...i, sponsor: s } : i)); setEditSponsor(null); }}
                                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", background: s === row.sponsor ? C.border : "none", border: "none", cursor: "pointer", color: SCOLOR[s]?.fg ?? C.second, fontSize: 11, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", textAlign: "left" }}>
                                    {s === row.sponsor && <Check style={{ width: 10, height: 10 }} />}
                                    {s !== row.sponsor && <div style={{ width: 10 }} />}
                                    {s}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "8px 12px" }}>
                          <button onClick={() => setItems(prev => prev.filter(i => i.id !== row.id))} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 2, display: "flex", borderRadius: 4 }}>
                            <Trash2 style={{ width: 13, height: 13 }} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
