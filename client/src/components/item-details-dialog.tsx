import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Calendar, ClipboardList, Package, Building2, FileText, History,
  Edit, Save, X, Link2, Palette, CheckCircle, Zap, Eye, Cog, Check,
  FileImage, FolderOpen, ExternalLink, Factory,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

interface ItemDetailsDialogProps {
  item: any | null;
  auditLogs?: any[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customActions?: React.ReactNode;
  topActions?: React.ReactNode;
  onEditSave?: (editedItem: any) => void;
}

// ── Timeline step config ──────────────────────────────────
const TIMELINE_STEPS = [
  { label: "Vinculação", icon: Link2,       idx: 0 },
  { label: "Arte",       icon: Palette,     idx: 1 },
  { label: "Aprovação",  icon: CheckCircle, idx: 2 },
  { label: "Finalização",icon: Zap,         idx: 3 },
  { label: "Revisão",    icon: Eye,         idx: 4 },
  { label: "Produção",   icon: Cog,         idx: 5 },
];

const STATUS_STEP: Record<string, number> = {
  requested: -1, draft: -1,
  awaiting_linking: 0,
  awaiting_submission: 1,
  awaiting_approval: 2, awaiting_sponsor_approval: 2,
  awaiting_finalization: 3, sponsor_approved: 3,
  awaiting_final_review: 4, awaiting_creator_review: 4,
  ready_for_production: 5, approved: 5, inproduction: 5, inProduction: 5,
  produced: 6, delivered: 6,
};

// ── Status badge pill (header) ────────────────────────────
const STATUS_LABELS: Record<string, string> = {
  requested: "Solicitado",
  awaiting_linking: "Aguard. Vinculação",
  awaiting_submission: "Aguard. Envio",
  awaiting_approval: "Aguard. Aprovação",
  awaiting_sponsor_approval: "Aguard. Aprovação",
  awaiting_finalization: "Aguard. Finalização",
  sponsor_approved: "Aguard. Finalização",
  awaiting_final_review: "Aguard. Revisão Final",
  awaiting_creator_review: "Aguard. Revisão Final",
  ready_for_production: "Pronto p/ Produção",
  approved: "Liberado",
  inProduction: "Em Produção",
  produced: "Produzido",
  delivered: "Entregue",
};

export function ItemDetailsDialog({
  item, auditLogs = [], open, onOpenChange,
  customActions, topActions, onEditSave,
}: ItemDetailsDialogProps) {
  const [editMode, setEditMode]     = useState(false);
  const [editedItem, setEditedItem] = useState(item);

  if (!item) return null;

  const rawStatus = (item.status || "").trim();
  const step = STATUS_STEP[rawStatus] ?? STATUS_STEP[rawStatus.toLowerCase()] ?? -1;

  const handleEditChange = (field: string, value: any) =>
    setEditedItem((p: any) => ({ ...p, [field]: value }));

  const handleSave = () => { onEditSave?.(editedItem); setEditMode(false); };

  // ── Audit log helpers ─────────────────────────────────
  const itemLogs = auditLogs
    .filter((l: any) => (l.entityId ?? l.entity_id ?? "") === item.id)
    .sort((a: any, b: any) =>
      new Date(a.createdAt ?? a.created_at).getTime() -
      new Date(b.createdAt ?? b.created_at).getTime());

  const itemLogsInclusive = auditLogs
    .filter((l: any) =>
      String(l.entityId ?? l.entity_id ?? "")
        .split(",").map((s: string) => s.trim()).includes(item.id))
    .sort((a: any, b: any) =>
      new Date(a.createdAt ?? a.created_at).getTime() -
      new Date(b.createdAt ?? b.created_at).getTime());

  const fmtShort = (d: string) => {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2,"0")}/${(dt.getMonth()+1).toString().padStart(2,"0")} ${dt.getHours().toString().padStart(2,"0")}:${dt.getMinutes().toString().padStart(2,"0")}`;
  };

  const getLog = (keywords: string[], pool = itemLogs) => {
    const l = pool.find((log: any) => {
      const d = (log.details || log.action || "").toLowerCase();
      return keywords.some(k => d.includes(k.toLowerCase()));
    });
    if (!l) return null;
    const ts   = l.createdAt ?? l.created_at;
    const name = l.userName  ?? l.user_name;
    return `${fmtShort(ts)}${name ? ` · ${name}` : ""}`;
  };

  const historyStages = [
    { label: "Vinculação iniciada",            keywords: ["patrocinadores atualizados"], pool: itemLogs },
    { label: "Enviado para Arte",               keywords: ["enviado","para arte"],       pool: itemLogsInclusive },
    { label: "Em aprovação de patrocinador",    keywords: ["aguardando aprovação"],      pool: itemLogs },
    { label: "Aprovado — Finalização",          keywords: ["todos os patrocinadores aprovaram","aguardando finaliz","aprovado pelo patrocinador"], pool: itemLogs },
    { label: "Aguardando revisão final",        keywords: ["arquivo final adicionado","aguardando revisão final"], pool: itemLogs },
  ];

  const deliveryLog = itemLogs.find((l: any) => l.action === "delivered");

  const hasActions = !!(customActions || topActions);

  // ── Approval thumb helpers ────────────────────────────
  const thumbUrl = item.approvalThumbUrl;
  const isThumbImage = thumbUrl && /\.(png|jpg|jpeg|gif|webp)/i.test(thumbUrl.toLowerCase());
  const isThumbPdf   = thumbUrl && !isThumbImage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] overflow-y-auto p-0 gap-0"
        style={{ backgroundColor: "#ffffff", borderRadius: 12, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.18)" }}
      >
        {/* ── Close button ── */}
        <button
          onClick={() => onOpenChange(false)}
          style={{
            position: "absolute", top: 24, right: 24, zIndex: 10,
            background: "none", border: "none", cursor: "pointer",
            color: "#78716c", padding: 4, borderRadius: 4,
            display: "flex", alignItems: "center",
            transition: "color 0.15s",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#f97316")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#78716c")}
        >
          <X style={{ width: 28, height: 28 }} />
        </button>

        {/* ── Header ── */}
        <header style={{ padding: "40px 32px 24px 32px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.12em" }}>
              PROJETO ATIVO
            </span>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em",
              color: "#1c1917", margin: 0, lineHeight: 1.1,
            }}>
              {item.displayId} • <span style={{ color: "#f97316" }}>{item.event?.name?.toUpperCase()}</span>
            </h1>
          </div>

          {/* Status pills */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              padding: "5px 14px", borderRadius: 999,
              backgroundColor: "#f97316", color: "#ffffff",
              fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
            }}>
              {STATUS_LABELS[rawStatus] || rawStatus}
            </span>
            {item.rejectedBySponsor && (
              <span style={{
                padding: "5px 14px", borderRadius: 999,
                border: "2px solid #dc2626", color: "#dc2626",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
              }}>Reprovado Patrocinador</span>
            )}
            {item.rejectedByCreator && (
              <span style={{
                padding: "5px 14px", borderRadius: 999,
                border: "2px solid #f97316", color: "#f97316",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
              }}>Reprovado Criador</span>
            )}
          </div>

          {/* ── Timeline ── */}
          <div style={{ marginTop: 40, overflowX: "auto", paddingBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", minWidth: 640, position: "relative", padding: "0 8px" }}>
              {/* Background line */}
              <div style={{
                position: "absolute", top: 16, left: 40, right: 40,
                height: 2, backgroundColor: "#e7e5e4", zIndex: 0,
              }} />

              {TIMELINE_STEPS.map((s) => {
                const done    = s.idx < step;
                const current = s.idx === step;
                const pending = s.idx > step;
                return (
                  <div key={s.idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, position: "relative", zIndex: 1 }}>
                    {done ? (
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        backgroundColor: "#f97316", color: "#ffffff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: "0 4px 12px rgba(249,115,22,0.35)",
                      }}>
                        <Check style={{ width: 16, height: 16, strokeWidth: 3 }} />
                      </div>
                    ) : current ? (
                      <div style={{ position: "relative", width: 32, height: 32 }}>
                        <div className="animate-ping" style={{
                          position: "absolute", inset: 0, borderRadius: "50%",
                          backgroundColor: "#f97316", opacity: 0.25,
                        }} />
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%",
                          border: "4px solid #f97316", backgroundColor: "#ffffff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          position: "relative", zIndex: 1,
                        }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "#f97316" }} />
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        backgroundColor: "#e7e5e4",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "rgba(28,25,23,0.2)" }} />
                      </div>
                    )}
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                      color: current ? "#f97316" : pending ? "rgba(28,25,23,0.3)" : "#78716c",
                      whiteSpace: "nowrap",
                    }}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </header>

        {/* ── Main body ── */}
        <main style={{ padding: "8px 32px 32px 32px", display: "flex", flexDirection: "column", gap: 40 }}>

          {/* Description */}
          {item.description && (
            <section style={{
              backgroundColor: "#f3f4f3",
              padding: 24, borderRadius: 8,
              borderLeft: "4px solid #f97316",
            }}>
              <h3 style={{ fontSize: 10, fontWeight: 700, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.09em", margin: "0 0 6px 0" }}>
                Descrição do Item
              </h3>
              <p style={{ fontSize: 18, fontWeight: 500, color: "#1c1917", margin: 0 }}>
                {item.description}
              </p>
            </section>
          )}

          {/* 2-col grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>

            {/* LEFT — Event + Sponsors */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Calendar style={{ width: 20, height: 20, color: "#f97316" }} />
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "-0.01em", color: "#1c1917", margin: 0,
                }}>Informações do Evento</h2>
              </div>

              <div style={{ backgroundColor: "#fafaf9", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e7e5e4", paddingBottom: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: "#78716c" }}>Nome</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>{item.event?.name || "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e7e5e4", paddingBottom: 12, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, color: "#78716c" }}>Início do Evento</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>
                    {item.event?.startDate ? format(new Date(item.event.startDate), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "#78716c" }}>Saída Caminhão</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: item.event?.truckDepartureDate ? "#f97316" : "#1c1917" }}>
                    {item.event?.truckDepartureDate
                      ? format(new Date(item.event.truckDepartureDate), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : "—"}
                  </span>
                </div>
              </div>

              {/* Sponsors */}
              {item.sponsors && item.sponsors.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 10, fontWeight: 700, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.09em", margin: "0 0 14px 0" }}>
                    Patrocinadores Confirmados
                  </h3>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {item.sponsors.map((s: any) => (
                      <div key={s.id} style={{
                        backgroundColor: "#e8e8e7", padding: "8px 14px",
                        borderRadius: 6, display: "flex", alignItems: "center", gap: 10,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: 4,
                          backgroundColor: s.color || "#1c1917",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <span style={{ color: "#ffffff", fontSize: 11, fontWeight: 700 }}>
                            {(s.name || "?")[0].toUpperCase()}
                          </span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>{s.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — Specs + Art Preview */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ClipboardList style={{ width: 20, height: 20, color: "#f97316" }} />
                  <h2 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: 15, fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: "-0.01em", color: "#1c1917", margin: 0,
                  }}>Especificações Técnicas</h2>
                </div>
                {!editMode && (
                  <button
                    onClick={() => { setEditedItem(item); setEditMode(true); }}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 11, fontWeight: 700, color: "#f97316", textTransform: "uppercase",
                    }}
                  >
                    <Edit style={{ width: 13, height: 13 }} /> EDITAR
                  </button>
                )}
              </div>

              {editMode ? (
                <div style={{ backgroundColor: "#fafaf9", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    { label: "Tipo",       field: "type" },
                    { label: "Material",   field: "material" },
                    { label: "Acabamento", field: "finish" },
                  ].map(({ label, field }) => (
                    <div key={field}>
                      <label style={{ fontSize: 11, color: "#a8a29e", display: "block", marginBottom: 4 }}>{label}</label>
                      <Input
                        value={editedItem?.[field] || ""}
                        onChange={(e) => handleEditChange(field, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <Button size="sm" variant="outline" onClick={() => setEditMode(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleSave}><Save className="h-3 w-3 mr-1" />Salvar</Button>
                  </div>
                </div>
              ) : (
                <div style={{ backgroundColor: "#fafaf9", borderRadius: 8, padding: 24 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {[
                      { label: "Tipo",        value: item.type },
                      { label: "Material",    value: item.material },
                      { label: "Acabamento",  value: item.finish },
                      { label: "Qtd",         value: item.quantity ? `${item.quantity} un.` : null },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <span style={{ fontSize: 11, color: "#a8a29e", display: "block", marginBottom: 3 }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917" }}>{value || "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Art Preview */}
              {thumbUrl && (
                <div style={{
                  position: "relative", borderRadius: 10, overflow: "hidden",
                  backgroundColor: "#1c1917", aspectRatio: "16/9",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {isThumbImage ? (
                    <img
                      src={thumbUrl}
                      alt="Thumb de aprovação"
                      style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.75 }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : null}
                  <div style={{
                    position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.45)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <a
                      href={thumbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        backgroundColor: "#ffffff", color: "#1c1917",
                        padding: "10px 20px", borderRadius: 6,
                        fontWeight: 700, fontSize: 12, textTransform: "uppercase",
                        display: "flex", alignItems: "center", gap: 8,
                        textDecoration: "none",
                        transition: "background-color 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#f97316"; (e.currentTarget as HTMLAnchorElement).style.color = "#ffffff"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "#ffffff"; (e.currentTarget as HTMLAnchorElement).style.color = "#1c1917"; }}
                    >
                      <FileText style={{ width: 16, height: 16 }} />
                      {isThumbPdf ? "Abrir PDF de Aprovação" : "Ver Arquivo"}
                    </a>
                  </div>
                  <div style={{ position: "absolute", bottom: 12, left: 12 }}>
                    <span style={{
                      backgroundColor: "rgba(0,0,0,0.6)", color: "#ffffff",
                      fontSize: 10, padding: "3px 8px", borderRadius: 2,
                      fontFamily: "monospace",
                    }}>
                      {thumbUrl.split("/").pop()?.toUpperCase() || "ARQUIVO"}
                    </span>
                  </div>
                </div>
              )}

              {/* Final file path */}
              {item.finalFileUrl && (
                <div>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "#78716c", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}>
                    <FolderOpen style={{ width: 13, height: 13 }} /> Arquivo Final
                  </p>
                  <div style={{
                    backgroundColor: "#fafaf9", border: "1px solid #e7e5e4",
                    borderRadius: 6, padding: "8px 12px",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#1c1917", wordBreak: "break-all", flex: 1 }}>
                      {item.finalFileUrl}
                    </span>
                    {item.finalFileUrl.startsWith("http") && (
                      <a href={item.finalFileUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#f97316", flexShrink: 0 }}>
                        <ExternalLink style={{ width: 15, height: 15 }} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Production data table ── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <Factory style={{ width: 20, height: 20, color: "#f97316" }} />
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 15, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "-0.01em", color: "#1c1917", margin: 0,
              }}>Dados de Produção</h2>
            </div>
            <div style={{ border: "1px solid #e8e8e7", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "#e8e8e7" }}>
                    {["Quantidade", "Total M²", "Dimensões Visuais", "Dimensões Arquivo", "Medida"].map((col) => (
                      <th key={col} style={{
                        padding: "12px 16px", textAlign: "left",
                        fontSize: 10, fontWeight: 900, color: "#57534e",
                        textTransform: "uppercase", letterSpacing: "0.09em",
                      }}>{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderTop: "1px solid #e8e8e7" }}>
                    <td style={{ padding: "16px", fontSize: 18, fontWeight: 700, color: "#1c1917" }}>
                      {item.quantity || 0} un.
                    </td>
                    <td style={{ padding: "16px", fontSize: 14, fontWeight: 500, color: "#57534e" }}>
                      {item.calculatedM2 ?? "—"} m²
                    </td>
                    <td style={{ padding: "16px", fontSize: 14, fontWeight: 500, color: "#57534e", fontFamily: "monospace" }}>
                      {item.visualWidth && item.visualHeight ? `${item.visualWidth} × ${item.visualHeight}` : "—"}
                    </td>
                    <td style={{ padding: "16px", fontSize: 14, fontWeight: 500, color: "#57534e", fontFamily: "monospace" }}>
                      {item.fileWidth && item.fileHeight ? `${item.fileWidth} × ${item.fileHeight}` : "—"}
                    </td>
                    <td style={{ padding: "16px", fontSize: 14, fontWeight: 500, color: "#57534e" }}>
                      {item.measurement || "—"}
                    </td>
                  </tr>
                  {(item.quantityProduced || item.receivedBy) && (
                    <tr style={{ borderTop: "1px solid #e8e8e7", backgroundColor: "#fafaf9" }}>
                      <td colSpan={5} style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", gap: 32 }}>
                          {item.quantityProduced && (
                            <div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.07em" }}>Produzido</span>
                              <p style={{ fontSize: 14, fontWeight: 700, color: "#1c1917", margin: "2px 0 0 0" }}>{item.quantityProduced}</p>
                            </div>
                          )}
                          {item.receivedBy && (
                            <div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.07em" }}>Recebido por</span>
                              <p style={{ fontSize: 14, fontWeight: 700, color: "#1c1917", margin: "2px 0 0 0" }}>{item.receivedBy}</p>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── Observations ── */}
          {item.observations && (
            <section>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <FileText style={{ width: 20, height: 20, color: "#f97316" }} />
                <h2 style={{
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: 15, fontWeight: 700, textTransform: "uppercase",
                  letterSpacing: "-0.01em", color: "#1c1917", margin: 0,
                }}>Observações</h2>
              </div>
              <p style={{ fontSize: 13, color: "#1c1917", whiteSpace: "pre-wrap", margin: 0 }}>{item.observations}</p>
            </section>
          )}

          {/* ── Custom/Top action slots ── */}
          {topActions && <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{topActions}</div>}
          {customActions && <div>{customActions}</div>}

          {/* ── History vertical timeline ── */}
          <section style={{ paddingBottom: hasActions ? 0 : 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
              <History style={{ width: 20, height: 20, color: "#f97316" }} />
              <h2 style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 15, fontWeight: 700, textTransform: "uppercase",
                letterSpacing: "-0.01em", color: "#1c1917", margin: 0,
              }}>Histórico de Alterações</h2>
            </div>

            <div style={{ position: "relative", paddingLeft: 40 }}>
              {/* Vertical line */}
              <div style={{
                position: "absolute", left: 11, top: 8, bottom: 8,
                width: 2, backgroundColor: "#e7e5e4",
              }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {historyStages.map((stage, idx) => {
                  const dateStr = getLog(stage.keywords, stage.pool);
                  return (
                    <div key={idx} style={{ position: "relative" }}>
                      {/* Dot */}
                      <div style={{
                        position: "absolute", left: -29, top: 4,
                        width: 22, height: 22, borderRadius: "50%",
                        backgroundColor: "#e8e8e7",
                        border: "4px solid #ffffff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {dateStr && (
                          <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#f97316" }} />
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", textTransform: "uppercase", margin: 0 }}>
                          {stage.label}
                        </p>
                        {dateStr && (
                          <span style={{
                            fontSize: 10, fontWeight: 500, color: "#78716c",
                            backgroundColor: "#e8e8e7", padding: "2px 8px", borderRadius: 4,
                            whiteSpace: "nowrap",
                          }}>
                            {dateStr}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {deliveryLog && (
                  <div style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute", left: -29, top: 4,
                      width: 22, height: 22, borderRadius: "50%",
                      backgroundColor: "#e8e8e7",
                      border: "4px solid #ffffff",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10b981" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", textTransform: "uppercase", margin: 0 }}>
                        {deliveryLog.details || "Entregue"}
                      </p>
                      <span style={{
                        fontSize: 10, fontWeight: 500, color: "#78716c",
                        backgroundColor: "#e8e8e7", padding: "2px 8px", borderRadius: 4,
                        whiteSpace: "nowrap",
                      }}>
                        {fmtShort(deliveryLog.createdAt ?? deliveryLog.created_at)}
                        {(deliveryLog.userName ?? deliveryLog.user_name) ? ` · ${deliveryLog.userName ?? deliveryLog.user_name}` : ""}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </main>
      </DialogContent>
    </Dialog>
  );
}
