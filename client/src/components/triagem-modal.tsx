import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  X, Trash2, Warehouse, Package2,
  Tag, Calendar, Layers, CheckCircle2,
  Archive, Truck, ClipboardCheck, Image, Wrench,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CONDITIONS, CONDITION_META, type Condition } from "@/lib/inventory-meta";
import type { EnrichedAsset } from "@/pages/triagem-retorno";

// ─── Types ────────────────────────────────────────────────────────────────────
type TriagemResult = "NO_GALPAO" | "MANUTENCAO" | "DESCARTADO";

interface SplitLine { qty: number; condition: Condition | null; result: TriagemResult; }
interface TriagemEntry { splits: SplitLine[]; notes: string; selected: boolean; mode: "all" | "split"; }

interface TriagemModalProps {
  asset: EnrichedAsset | null;
  linkedItem?: any | null;
  entry: TriagemEntry | null;
  open: boolean;
  isSaving: boolean;
  isSaved: boolean;
  user: any;
  onOpenChange: (open: boolean) => void;
  onUpdateCondition: (c: Condition) => void;
  onUpdateResult: (r: TriagemResult) => void;
  onUpdateNotes: (notes: string) => void;
  onSaveAndClose: () => Promise<void>;
}

const RESULT_META: Record<TriagemResult, {
  label: string; subLabel: string; color: string; bg: string; border: string; Icon: React.ElementType;
}> = {
  NO_GALPAO:  { label: "Galpão Central", subLabel: "Retorna ao estoque",                            color: "#1e40af", bg: "#eff6ff", border: "#93c5fd", Icon: Warehouse },
  MANUTENCAO: { label: "Manutenção",     subLabel: "Volta ao galpão como Avaria Leve para reparo",  color: "#92400e", bg: "#fffbeb", border: "#fcd34d", Icon: Wrench    },
  DESCARTADO: { label: "Descartar",      subLabel: "Remover do inventário",                         color: "#991b1b", bg: "#fef2f2", border: "#fca5a5", Icon: Trash2    },
};

export function TriagemModal({
  asset, linkedItem, entry, open, isSaving, isSaved, user,
  onOpenChange, onUpdateCondition, onUpdateResult, onUpdateNotes, onSaveAndClose,
}: TriagemModalProps) {
  if (!asset || !entry) return null;

  const condition: Condition | null = entry.splits[0]?.condition ?? "PERFEITO";
  const result    = entry.splits[0]?.result    ?? "NO_GALPAO";
  const notes     = entry.notes;
  const qty       = asset.quantity ?? 1;

  const thumbUrl = asset.approvalThumbUrl;
  const isImg    = thumbUrl && (
    /\.(png|jpg|jpeg|gif|webp)/i.test(thumbUrl) ||
    thumbUrl.startsWith('/objects/')
  );
  const [thumbImgFailed, setThumbImgFailed] = useState(false);

  async function handleSave() {
    await onSaveAndClose();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden border-0"
        style={{
          maxWidth: 1040, width: "calc(100vw - 48px)",
          maxHeight: "90vh", borderRadius: 12,
          boxShadow: "0 32px 64px -12px rgba(0,0,0,0.45)",
          display: "flex", flexDirection: "row",
        }}
      >
        {/* ══════════════════════════════════════════
            LEFT SIDEBAR — Dark
        ══════════════════════════════════════════ */}
        <aside style={{
          width: 264, flexShrink: 0, background: "#111827",
          display: "flex", flexDirection: "column",
          borderRadius: "12px 0 0 12px",
        }}>
          {/* Logo */}
          <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 900,
              fontSize: 22, color: "#f9f9f8", letterSpacing: "-0.05em", lineHeight: 1,
            }}>
              NORTE
            </div>
          </div>

          {/* Rastreabilidade */}
          <div style={{ padding: "24px 24px 0", flex: 1 }}>
            <div style={{
              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
              fontSize: 9, color: "#6b7280", textTransform: "uppercase",
              letterSpacing: "0.16em", marginBottom: 20,
            }}>
              Rastreabilidade
            </div>

            {/* Timeline */}
            <div style={{ position: "relative", paddingLeft: 32 }}>
              {/* Vertical pipe */}
              <div style={{
                position: "absolute", left: 11, top: 12, bottom: 24,
                width: 1, background: "rgba(255,255,255,0.08)",
              }} />

              {/* Step 1 — Produção / Origem */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Package2 size={11} color="#fff" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
                    {linkedItem?.type ? `Produção · ${linkedItem.type}` : "Produção Gráfica"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6b7280", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Auto-cadastrado · {asset.autoAdded ? "Gráfica" : "Manual"}
                  </div>
                </div>
              </div>

              {/* Step 2 — Saída do Estoque */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Archive size={11} color="#fff" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
                    Saída do Estoque
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6b7280", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {asset.eventDate
                      ? format(new Date(asset.eventDate), "dd MMM yyyy · HH:mm", { locale: ptBR })
                      : "Data não registrada"}
                  </div>
                </div>
              </div>

              {/* Step 3 — Em Uso no Evento */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Truck size={11} color="#fff" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#e5e7eb" }}>
                    {asset.eventName || "Em Uso no Evento"}
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6b7280", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {asset.eventDate ? format(new Date(asset.eventDate), "dd MMM yyyy", { locale: ptBR }) : "—"} · Concluído
                  </div>
                </div>
              </div>

              {/* Step 4 — Aguardando Triagem (active) */}
              <div style={{ position: "relative", marginBottom: 28 }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "rgba(249,115,22,0.15)", border: "1.5px solid #f97316",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 0 0 4px rgba(249,115,22,0.08)",
                }}>
                  <ClipboardCheck size={11} color="#f97316" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 12, color: "#f97316" }}>
                    Aguardando Triagem
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6b7280", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Agora · Em análise
                  </div>
                </div>
              </div>

              {/* Step 5 — Destino Final (pending) */}
              <div style={{ position: "relative" }}>
                <div style={{
                  position: "absolute", left: -21, top: 2,
                  width: 22, height: 22, borderRadius: "50%",
                  background: "#1f2937", border: "1px solid #374151",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Warehouse size={11} color="#6b7280" />
                </div>
                <div style={{ paddingTop: 3, paddingLeft: 8 }}>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 600, fontSize: 12, color: "#4b5563" }}>
                    Destino Final
                  </div>
                  <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#4b5563", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Aguardando decisão
                  </div>
                </div>
              </div>
            </div>

            {/* Patrocinadores */}
            {asset.sponsors && asset.sponsors.length > 0 && (
              <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  fontSize: 9, color: "#6b7280", textTransform: "uppercase",
                  letterSpacing: "0.16em", marginBottom: 12,
                }}>
                  Patrocinadores
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {asset.sponsors.map(s => (
                    <div key={s.id} style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      padding: "4px 8px", background: "#1f2937",
                      borderRadius: 4, border: "1px solid rgba(255,255,255,0.07)",
                    }}>
                      <Tag size={8} color="#6b7280" />
                      <span style={{
                        fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                        fontSize: 9, color: "#d1d5db", textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}>
                        {s.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </aside>

        {/* ══════════════════════════════════════════
            RIGHT MAIN AREA
        ══════════════════════════════════════════ */}
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          minWidth: 0, maxHeight: "90vh", overflow: "hidden",
          borderRadius: "0 12px 12px 0",
        }}>
          {/* ── Sticky Header ── */}
          <header style={{
            background: "#030712", padding: "20px 28px",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            flexShrink: 0, position: "sticky", top: 0, zIndex: 10,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <span style={{
                  background: "#f97316", color: "#0c0a09",
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 900,
                  fontSize: 9, letterSpacing: "-0.02em",
                  padding: "3px 8px", borderRadius: 4,
                }}>
                  {asset.displayId}
                </span>
                <span style={{
                  fontFamily: "DM Mono, monospace", fontSize: 10, color: "#6b7280",
                }}>
                  Qtd: {qty} un.
                  {asset.location ? ` · ${asset.location}` : ""}
                </span>
              </div>
              <h1 style={{
                margin: 0, color: "#f9fafb",
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 800,
                fontSize: 26, letterSpacing: "-0.05em", lineHeight: 1.1,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                maxWidth: "calc(100% - 20px)",
              }}>
                {asset.name}
              </h1>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              style={{
                marginLeft: 12, flexShrink: 0,
                background: "rgba(255,255,255,0.06)", border: "none",
                cursor: "pointer", color: "rgba(255,255,255,0.45)",
                padding: 8, borderRadius: 6,
                display: "flex", alignItems: "center",
                transition: "color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            >
              <X size={20} />
            </button>
          </header>

          {/* ── Scrollable Body ── */}
          <div style={{
            flex: 1, overflowY: "auto", background: "#f9f9f8",
            display: "flex", flexDirection: "column", gap: 28,
            padding: "28px 28px 0 28px",
          }}>

            {/* ── Painel de Classificação Obrigatória ── */}
            <section style={{ position: "relative" }}>
              {/* Floating label */}
              <div style={{
                position: "absolute", top: -10, left: 20, zIndex: 2,
                background: "#9d4300", color: "#fff",
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em",
                padding: "3px 10px", borderRadius: 4,
              }}>
                Classificação Obrigatória
              </div>
              <div style={{
                background: "#fff", border: "2px solid #9d4300",
                borderRadius: 10, padding: "28px 24px 24px",
                boxShadow: "0 4px 24px rgba(157,67,0,0.08)",
              }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>

                  {/* Condição */}
                  <div>
                    <label style={{
                      display: "block", fontFamily: "Space Grotesk, sans-serif",
                      fontWeight: 700, fontSize: 9, color: "#94a3b8",
                      textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10,
                    }}>
                      Condição do Item
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {CONDITIONS.map(c => {
                        const m = CONDITION_META[c];
                        const active = condition === c;
                        return (
                          <button
                            key={c}
                            onClick={() => onUpdateCondition(c)}
                            style={{
                              flex: 1, display: "flex", flexDirection: "column",
                              alignItems: "center", justifyContent: "center", gap: 6,
                              padding: "12px 6px", borderRadius: 8,
                              border: active ? `2px solid ${m.border}` : "1.5px solid #e2e8f0",
                              background: active ? m.activeBg : "#f8fafc",
                              cursor: "pointer", transition: "all 0.15s",
                            }}
                          >
                            <m.Icon size={18} color={active ? m.color : "#94a3b8"} />
                            <span style={{
                              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                              fontSize: 10, color: active ? m.color : "#64748b",
                            }}>
                              {m.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Destino */}
                  <div>
                    <label style={{
                      display: "block", fontFamily: "Space Grotesk, sans-serif",
                      fontWeight: 700, fontSize: 9, color: "#94a3b8",
                      textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10,
                    }}>
                      Destino do Fluxo
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["NO_GALPAO", "MANUTENCAO", "DESCARTADO"] as TriagemResult[]).map(r => {
                        const m = RESULT_META[r];
                        const active = result === r;
                        return (
                          <button
                            key={r}
                            onClick={() => onUpdateResult(r)}
                            title={m.subLabel}
                            style={{
                              flex: 1, display: "flex", alignItems: "center",
                              justifyContent: "center", gap: 8, padding: "12px 10px",
                              borderRadius: 8,
                              border: active ? `2px solid ${m.border}` : "1.5px solid #e2e8f0",
                              background: active ? m.bg : "#f8fafc",
                              cursor: "pointer", transition: "all 0.15s",
                            }}
                          >
                            <m.Icon size={16} color={active ? m.color : "#94a3b8"} />
                            <span style={{
                              fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                              fontSize: 11, color: active ? m.color : "#64748b",
                            }}>
                              {m.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Observação */}
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{
                      display: "block", fontFamily: "Space Grotesk, sans-serif",
                      fontWeight: 700, fontSize: 9, color: "#94a3b8",
                      textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8,
                    }}>
                      Observação da Triagem
                    </label>
                    <textarea
                      value={notes}
                      onChange={e => onUpdateNotes(e.target.value)}
                      placeholder="Ex: Riscos superficiais na base, necessita polimento..."
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "12px 14px", borderRadius: 8,
                        border: "1.5px solid #e2e8f0", background: "#f8fafc",
                        fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 13,
                        color: "#1e293b", resize: "vertical", minHeight: 72,
                        outline: "none", lineHeight: 1.5,
                      }}
                      onFocus={e => { e.currentTarget.style.borderColor = "#f97316"; e.currentTarget.style.background = "#fff"; }}
                      onBlur={e => { e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.background = "#f8fafc"; }}
                    />
                  </div>
                </div>

                {/* Save row */}
                <div style={{
                  marginTop: 20, paddingTop: 20,
                  borderTop: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12,
                }}>
                  {isSaved && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <CheckCircle2 size={14} color="#16a34a" />
                      <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 11, color: "#16a34a" }}>
                        Triagem salva
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={isSaving || isSaved || condition === null}
                    data-testid="button-triage-modal-save"
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 28px", borderRadius: 8, border: "none",
                      background: (isSaved || condition === null) ? "#f1f5f9" : "#9d4300",
                      color: (isSaved || condition === null) ? "#94a3b8" : "#fff",
                      fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                      fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em",
                      cursor: (isSaved || condition === null) ? "default" : "pointer",
                      boxShadow: (isSaved || condition === null) ? "none" : "0 4px 16px rgba(157,67,0,0.28)",
                      transition: "all 0.15s",
                      opacity: isSaving ? 0.6 : 1,
                    }}
                  >
                    {isSaving ? "Salvando..." : isSaved ? "Salvo" : condition === null ? "Selecione a Condição" : "Salvar e Fechar"}
                  </button>
                </div>
              </div>
            </section>

            {/* ── Read-only grid (Evento + Specs) ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Evento e Datas */}
              <div style={{ background: "#f3f4f3", borderRadius: 10, padding: "20px 22px" }}>
                <h3 style={{
                  margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  fontSize: 13, color: "#374151",
                }}>
                  <Calendar size={15} color="#6b7280" />
                  Informações do Evento
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { label: "Evento",    value: asset.eventName || "—" },
                    { label: "Data",      value: asset.eventDate ? format(new Date(asset.eventDate), "dd MMM yyyy", { locale: ptBR }) : "—" },
                    { label: "Qtd Total", value: `${qty} un.` },
                    { label: "Localização", value: asset.location || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 11, color: "#9ca3af" }}>{label}</span>
                      <span style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontWeight: 700, fontSize: 11, color: "#1f2937", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Especificações Técnicas */}
              <div style={{ background: "#111827", borderRadius: 10, padding: "20px 22px" }}>
                <h3 style={{
                  margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8,
                  fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                  fontSize: 13, color: "#f9fafb",
                }}>
                  <Layers size={15} color="#f97316" />
                  Especificações Técnicas
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {[
                    { label: "TIPO",        value: linkedItem?.type || "—" },
                    { label: "MATERIAL",    value: linkedItem?.material || "—" },
                    { label: "ACABAMENTO",  value: linkedItem?.finish || "—" },
                    { label: "MEDIDA",      value: linkedItem?.measurement || "—" },
                    {
                      label: "DIMENSÕES",
                      value: linkedItem?.visualWidth && linkedItem?.visualHeight
                        ? `${linkedItem.visualWidth} × ${linkedItem.visualHeight} m`
                        : "—",
                    },
                    {
                      label: "M² TOTAL",
                      value: linkedItem?.calculatedM2 ? `${linkedItem.calculatedM2} m²` : "—",
                    },
                    { label: "QUANTIDADE",    value: linkedItem?.quantity ? `${linkedItem.quantity} un.` : `${asset.quantity ?? 1} un.` },
                    { label: "PATROCINADORES", value: (asset.sponsors ?? []).length > 0 ? (asset.sponsors ?? []).map(s => s.name).join(", ") : "—" },
                  ].map(({ label, value }, i, arr) => (
                    <div key={label} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                      gap: 8, padding: "9px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                    }}>
                      <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.1em", flexShrink: 0 }}>{label}</span>
                      <span style={{ fontFamily: "DM Mono, monospace", fontWeight: 500, fontSize: 10, color: "#e5e7eb", textAlign: "right" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Imagem de Referência (approval thumb) ── */}
            {thumbUrl && (
              <div style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "21/9" }}>
                {isImg && !thumbImgFailed ? (
                  <img
                    src={thumbUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    onError={() => setThumbImgFailed(true)}
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", background: "#1f2937", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Package2 size={48} color="#374151" />
                  </div>
                )}
                <div style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(to top, rgba(3,7,18,0.75) 0%, transparent 55%)",
                  display: "flex", alignItems: "flex-end", padding: "20px 24px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: "rgba(3,7,18,0.7)", border: "2px solid #f97316",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Image size={16} color="#f97316" />
                    </div>
                    <div>
                      <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 12, color: "#f9fafb" }}>
                        Foto de Referência para Triagem
                      </div>
                      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: "#9ca3af", marginTop: 2 }}>
                        Arte aprovada · Montagem original
                      </div>
                    </div>
                  </div>
                  <a
                    href={thumbUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      marginLeft: "auto",
                      fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                      fontSize: 10, color: "#f97316", textDecoration: "none",
                      background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)",
                      padding: "5px 12px", borderRadius: 6,
                    }}
                  >
                    Abrir original ↗
                  </a>
                </div>
              </div>
            )}

            {/* spacer so footer doesn't clip last section */}
            <div style={{ height: 8 }} />
          </div>

          {/* ── Footer ── */}
          <footer style={{
            flexShrink: 0,
            background: "#f3f4f3", borderTop: "1px solid #e2e8f0",
            padding: "14px 28px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
              {user && (
                <div style={{ lineHeight: 1.3 }}>
                  <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>Operador Atual</div>
                  <div style={{ fontFamily: "Plus Jakarta Sans, sans-serif", fontSize: 12, color: "#374151", fontWeight: 600, marginTop: 1 }}>{user.name || user.username}</div>
                </div>
              )}
              <div style={{ lineHeight: 1.3, borderLeft: "1px solid #d1d5db", paddingLeft: 24 }}>
                <div style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 9, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.12em" }}>ID do Item</div>
                <div style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: "#374151", fontWeight: 500, marginTop: 1 }}>{asset.displayId}</div>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "Space Grotesk, sans-serif", fontWeight: 700,
                fontSize: 11, color: "#6b7280", textTransform: "uppercase",
                letterSpacing: "0.1em", transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#111827")}
              onMouseLeave={e => (e.currentTarget.style.color = "#6b7280")}
            >
              Cancelar Operação
            </button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
