import { useState } from "react";
import { Upload, CheckCircle2, FileSpreadsheet, ChevronRight, ChevronLeft, AlertTriangle, X, Trash2, Check, FileCheck } from "lucide-react";

const NORTE = {
  bg: "#F7F6F3",
  surface: "#FFFFFF",
  border: "#E7E5E4",
  text: "#1A1C1C",
  second: "#78716C",
  muted: "#A8A29E",
  accent: "#D97A1E",
  green: "#16A34A",
  greenBg: "#F0FDF4",
  greenBorder: "#BBF7D0",
  amber: "#D97706",
  amberBg: "#FFFBEB",
  amberBorder: "#FDE68A",
};

const SAMPLE_ITEMS = [
  { id: 1, group: "PALCO", desc: "Lona Palco Frente c/ Logo NORTE", qty: 1, w: 12, h: 6, mat: "Lona", finish: "Bastão", sponsor: "MASTER" },
  { id: 2, group: "PALCO", desc: "Lona Palco Lateral Esq.", qty: 2, w: 4, h: 6, mat: "Lona", finish: "Bastão", sponsor: "GOLD" },
  { id: 3, group: "PALCO", desc: "Lona Palco Lateral Dir.", qty: 2, w: 4, h: 6, mat: "Lona", finish: "Bastão", sponsor: "GOLD" },
  { id: 4, group: "GRADIL", desc: "Faixa Gradil Corredor", qty: 80, w: 1, h: 0.7, mat: "Lona", finish: "Ilhós", sponsor: "SILVER" },
  { id: 5, group: "GRADIL", desc: "Faixa Gradil Largada", qty: 20, w: 1, h: 0.7, mat: "Lona", finish: "Ilhós", sponsor: "SILVER" },
  { id: 6, group: "ROLO", desc: "Back-drop Tenda VIP", qty: 3, w: 3, h: 2.5, mat: "Papel Fotográfico", finish: "—", sponsor: "MASTER" },
  { id: 7, group: "PÓRTICO", desc: "Mega Banner Pórtico Largada", qty: 1, w: 6, h: 5, mat: "Lona", finish: "Bastão", sponsor: "MASTER" },
  { id: 8, group: "PÓRTICO", desc: "Mega Banner Pórtico Chegada", qty: 1, w: 6, h: 5, mat: "Lona", finish: "Bastão", sponsor: "GOLD" },
];

const SPONSORS = ["MASTER", "GOLD", "SILVER", "APOIO", "MÍDIA", "—"];
const SPONSOR_COLORS: Record<string, string> = {
  MASTER: "#ef4444", GOLD: "#1d4ed8", SILVER: "#7c3aed", APOIO: "#6b7280", MÍDIA: "#0891b2", "—": "#a8a29e",
};

const steps = [
  { id: 1, label: "Selecionar arquivo" },
  { id: 2, label: "Revisar peças" },
  { id: 3, label: "Confirmar" },
];

function SponsorBadge({ name }: { name: string }) {
  const c = SPONSOR_COLORS[name] ?? "#a8a29e";
  return (
    <span style={{ fontSize: 10, fontWeight: 800, color: c, background: c + "18", border: `1px solid ${c}30`, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.06em", fontFamily: "'Space Grotesk', sans-serif", whiteSpace: "nowrap" }}>
      {name}
    </span>
  );
}

function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }) {
  return (
    <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", transition: "all 0.2s", backgroundColor: done ? NORTE.green : active ? NORTE.accent : NORTE.border, color: (done || active) ? "#fff" : NORTE.muted }}>
      {done ? <Check style={{ width: 14, height: 14 }} /> : n}
    </div>
  );
}

export function StepWizard() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<string | null>(null);
  const [items, setItems] = useState(SAMPLE_ITEMS.map(i => ({ ...i })));
  const [dragging, setDragging] = useState(false);

  const groups = Array.from(new Set(items.map(i => i.group)));
  const totalM2 = items.reduce((s, i) => s + i.qty * i.w * i.h, 0);
  const linked = items.filter(i => i.sponsor !== "—").length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: NORTE.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, fontFamily: "Inter, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 760, backgroundColor: NORTE.surface, borderRadius: 16, border: `1px solid ${NORTE.border}`, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>

        {/* ── Header ── */}
        <div style={{ padding: "20px 28px 0", backgroundColor: NORTE.bg, borderBottom: `1px solid ${NORTE.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: NORTE.greenBg, border: `1px solid ${NORTE.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet style={{ width: 17, height: 17, color: NORTE.green }} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: NORTE.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>Importar Lista de Peças</div>
              <div style={{ fontSize: 11, color: NORTE.muted, marginTop: 1 }}>EcoRun RJ 2025 — Formato padrão NORTE</div>
            </div>
          </div>

          {/* Steps */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, paddingBottom: 0 }}>
            {steps.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: s.id <= step ? "pointer" : "default", paddingBottom: 16 }} onClick={() => s.id <= step && setStep(s.id)}>
                  <StepDot n={s.id} active={step === s.id} done={step > s.id} />
                  <span style={{ fontSize: 12, fontWeight: step === s.id ? 700 : 500, color: step >= s.id ? NORTE.text : NORTE.muted, whiteSpace: "nowrap" }}>{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ flex: 1, height: 1, backgroundColor: step > s.id ? NORTE.green : NORTE.border, margin: "0 12px 16px", transition: "background 0.3s" }} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Step 1: Upload ── */}
        {step === 1 && (
          <div style={{ padding: "28px 28px 24px" }}>
            <label
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => { e.preventDefault(); setDragging(false); setFile("EcoRun_RJ.xlsx"); }}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, border: `2px dashed`, borderColor: file ? NORTE.green : dragging ? NORTE.accent : NORTE.border, borderRadius: 12, padding: "40px 24px", cursor: "pointer", backgroundColor: file ? NORTE.greenBg : dragging ? "#FFF7ED" : "#FAFAF9", transition: "all 0.2s", minHeight: 200 }}
            >
              {file ? (
                <>
                  <div style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: NORTE.greenBg, border: `1px solid ${NORTE.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 style={{ width: 28, height: 28, color: NORTE.green }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: NORTE.green, fontFamily: "'Space Grotesk', sans-serif" }}>{file}</div>
                    <div style={{ fontSize: 12, color: NORTE.muted, marginTop: 3 }}>248 KB · Pronto para processar</div>
                  </div>
                  <button onClick={e => { e.preventDefault(); setFile(null); }} style={{ fontSize: 11, color: "#ef4444", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <X style={{ width: 12, height: 12 }} /> Remover
                  </button>
                </>
              ) : (
                <>
                  <div style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: dragging ? "#FFF7ED" : "#F5F4F2", border: `1px solid ${dragging ? "#fed7aa" : NORTE.border}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                    <Upload style={{ width: 24, height: 24, color: dragging ? NORTE.accent : NORTE.muted }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: NORTE.text }}>Arraste o arquivo aqui</div>
                    <div style={{ fontSize: 12, color: NORTE.muted, marginTop: 3 }}>ou clique para selecionar · .xlsx</div>
                  </div>
                </>
              )}
            </label>

            <div style={{ marginTop: 16, padding: "12px 14px", backgroundColor: NORTE.amberBg, border: `1px solid ${NORTE.amberBorder}`, borderRadius: 8, display: "flex", gap: 10 }}>
              <AlertTriangle style={{ width: 14, height: 14, color: NORTE.amber, flexShrink: 0, marginTop: 1 }} />
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#92400e", marginBottom: 2 }}>Colunas obrigatórias</div>
                <div style={{ fontSize: 11, color: "#78350f", lineHeight: 1.6 }}>item · qtde · material · acabamento · área · visual</div>
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => file && setStep(2)} disabled={!file} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 22px", backgroundColor: file ? NORTE.accent : NORTE.border, color: file ? "#fff" : NORTE.muted, border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: file ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk', sans-serif", transition: "background 0.15s" }}>
                Processar arquivo <ChevronRight style={{ width: 15, height: 15 }} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Review table ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {/* Stats bar */}
            <div style={{ padding: "14px 28px", backgroundColor: "#FAFAF9", borderBottom: `1px solid ${NORTE.border}`, display: "flex", gap: 20, flexWrap: "wrap" }}>
              {[
                { label: "Peças", value: items.length, mono: false, color: NORTE.text },
                { label: "Grupos", value: groups.length, mono: false, color: NORTE.text },
                { label: "M² total", value: totalM2.toFixed(0), mono: true, color: NORTE.accent },
                { label: "Vinculados", value: `${linked}/${items.length}`, mono: false, color: linked === items.length ? NORTE.green : NORTE.amber },
              ].map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: s.mono ? "DM Mono, monospace" : "'Space Grotesk', sans-serif", lineHeight: 1 }}>{s.value}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: NORTE.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 2 }}>
                  <tr style={{ backgroundColor: "#F5F4F2" }}>
                    {["Descrição", "Qtd", "W×H (m)", "M²", "Material", "Patrocinador", ""].map((h, i) => (
                      <th key={i} style={{ padding: "9px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: NORTE.second, textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", borderBottom: `1px solid ${NORTE.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g, gi) => {
                    const rows = items.filter(i => i.group === g);
                    return (
                      <>
                        <tr key={`g-${g}`}>
                          <td colSpan={7} style={{ padding: "8px 12px 7px", background: "linear-gradient(90deg, #F0EEEC 0%, #F5F4F2 100%)", borderTop: gi > 0 ? `2px solid #E2DEDA` : undefined, borderBottom: `1px solid ${NORTE.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ width: 3, height: 16, backgroundColor: NORTE.accent, borderRadius: 2 }} />
                              <span style={{ fontWeight: 800, fontSize: 13, color: NORTE.text, fontFamily: "'Space Grotesk', sans-serif" }}>{g}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: NORTE.muted, backgroundColor: "#E8E6E3", borderRadius: 99, padding: "1px 8px" }}>{rows.length} peças</span>
                            </div>
                          </td>
                        </tr>
                        {rows.map((row, ri) => (
                          <tr key={row.id} style={{ backgroundColor: ri % 2 === 0 ? "#fff" : "#FAFAF9" }}>
                            <td style={{ padding: "7px 10px", color: NORTE.text, maxWidth: 220 }}>
                              <div style={{ fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.desc}</div>
                            </td>
                            <td style={{ padding: "7px 10px", fontFamily: "DM Mono, monospace", fontWeight: 700, color: NORTE.accent }}>{row.qty}</td>
                            <td style={{ padding: "7px 10px", fontFamily: "DM Mono, monospace", color: NORTE.second }}>{row.w}×{row.h}</td>
                            <td style={{ padding: "7px 10px", fontFamily: "DM Mono, monospace", fontWeight: 600, color: NORTE.text }}>{(row.qty * row.w * row.h).toFixed(1)}</td>
                            <td style={{ padding: "7px 10px", color: NORTE.second }}>{row.mat}</td>
                            <td style={{ padding: "7px 10px" }}>
                              <select value={row.sponsor} onChange={e => setItems(prev => prev.map(i => i.id === row.id ? { ...i, sponsor: e.target.value } : i))} style={{ border: `1px solid ${NORTE.border}`, borderRadius: 5, padding: "3px 6px", fontSize: 10, fontWeight: 800, color: SPONSOR_COLORS[row.sponsor] ?? NORTE.muted, background: "#fff", cursor: "pointer" }}>
                                {SPONSORS.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td style={{ padding: "7px 10px" }}>
                              <button onClick={() => setItems(prev => prev.filter(i => i.id !== row.id))} style={{ background: "none", border: "none", cursor: "pointer", color: NORTE.muted, padding: 2, display: "flex" }}>
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

            {/* Nav */}
            <div style={{ padding: "14px 28px 20px", borderTop: `1px solid ${NORTE.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FAFAF9" }}>
              <button onClick={() => setStep(1)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", backgroundColor: "#fff", color: NORTE.second, border: `1px solid ${NORTE.border}`, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                <ChevronLeft style={{ width: 14, height: 14 }} /> Voltar
              </button>
              <button onClick={() => setStep(3)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 22px", backgroundColor: NORTE.accent, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                Confirmar importação <ChevronRight style={{ width: 14, height: 14 }} />
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Confirm ── */}
        {step === 3 && (
          <div style={{ padding: "36px 28px 28px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: NORTE.greenBg, border: `2px solid ${NORTE.greenBorder}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <FileCheck style={{ width: 32, height: 32, color: NORTE.green }} />
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: NORTE.text, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", marginBottom: 8 }}>Tudo certo para importar</div>
            <div style={{ fontSize: 13, color: NORTE.second, marginBottom: 28, maxWidth: 400, margin: "8px auto 28px" }}>
              <strong style={{ color: NORTE.text }}>{items.length} peças</strong> em {groups.length} grupos serão adicionadas ao evento.
            </div>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 28 }}>
              {[
                { label: "Peças", val: items.length, color: NORTE.text },
                { label: "M² total", val: `${totalM2.toFixed(0)} m²`, color: NORTE.accent },
                { label: "Vinculados", val: `${Math.round((linked / items.length) * 100)}%`, color: NORTE.green },
              ].map(s => (
                <div key={s.label} style={{ padding: "12px 20px", backgroundColor: "#FAFAF9", border: `1px solid ${NORTE.border}`, borderRadius: 10, minWidth: 80 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: NORTE.muted, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button onClick={() => setStep(2)} style={{ padding: "10px 20px", backgroundColor: "#fff", color: NORTE.second, border: `1px solid ${NORTE.border}`, borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Revisar
              </button>
              <button onClick={() => setStep(1)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 28px", backgroundColor: NORTE.green, color: "#fff", border: "none", borderRadius: 9, fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}>
                <Check style={{ width: 15, height: 15 }} /> Importar {items.length} peças
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
