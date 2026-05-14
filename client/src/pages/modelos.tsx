import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Layers, Search, Check, ChevronsUpDown, Pencil, Trash2, Ruler, Filter, MoreVertical, X } from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

const EMPTY_FORM = {
  name: "",
  type: "",
  area: "",
  visual: "",
  visualWidth: "",
  visualHeight: "",
  fileWidth: "",
  fileHeight: "",
  material: "",
  finish: "",
  hasVariableMeasurement: false,
};

/* pill color by tipo */
function tipoPillStyle(type: string) {
  const orange = ["Palco", "Stand", "Arena"];
  const blue = ["Pórtico", "WindBanner", "Percurso"];
  if (orange.includes(type)) return { backgroundColor: "#fff7ed", color: "#c2410c" };
  if (blue.includes(type)) return { backgroundColor: "#eff6ff", color: "#1d4ed8" };
  return { backgroundColor: "#f5f5f4", color: "#57534e" };
}

export default function Modelos() {
  const { hasPermission } = useAuth();
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const { toast } = useToast();
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const { data: standardItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
  });

  const createStandardItemMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (editingItem) {
        return await apiRequest("PATCH", `/api/standard-items/${editingItem.id}`, data);
      }
      return await apiRequest("POST", "/api/standard-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      setOpen(false);
      setEditingItem(null);
      setFormData({ ...EMPTY_FORM });
      toast({
        title: editingItem ? "Modelo atualizado" : "Modelo criado",
        description: editingItem ? "O modelo foi atualizado com sucesso" : "O modelo foi criado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteStandardItemMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest("DELETE", `/api/standard-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      setDeleteConfirm(null);
      toast({ title: "Modelo excluído", description: "O modelo foi excluído com sucesso" });
    },
    onError: (error: Error) => {
      toast({ title: "Erro ao excluir modelo", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const toNum = (v: string) => (v === "" || v === null || v === undefined) ? null : parseFloat(v);
    const dataToSubmit: any = {
      ...formData,
      material: formData.material || null,
      finish: formData.finish || null,
      area: toNum(formData.area),
      visual: toNum(formData.visual),
      visualWidth: toNum(formData.visualWidth),
      visualHeight: toNum(formData.visualHeight),
      fileWidth: toNum(formData.fileWidth),
      fileHeight: toNum(formData.fileHeight),
    };
    createStandardItemMutation.mutate(dataToSubmit);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      area: item.area || "",
      visual: item.visual || "",
      visualWidth: item.visualWidth || "",
      visualHeight: item.visualHeight || "",
      fileWidth: item.fileWidth || "",
      fileHeight: item.fileHeight || "",
      material: item.material || "",
      finish: item.finish || "",
      hasVariableMeasurement: item.hasVariableMeasurement || false,
    });
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    setEditingItem(null);
    setFormData({ ...EMPTY_FORM });
  };

  const filteredItems = standardItems.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const isAdmin = hasPermission("admin");

  /* ── shared field style ── */
  const fieldStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", backgroundColor: "#f0efee",
    border: "none", borderRadius: 10, fontSize: 13, color: "#1c1917",
    outline: "none", fontFamily: "'Plus Jakarta Sans', sans-serif",
  };
  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: 10, fontWeight: 700, color: "#78716c",
    textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, marginLeft: 2,
  };

  return (
    <div style={{ backgroundColor: "#fafaf9", minHeight: "100vh", padding: "28px 28px 48px" }}>

      {/* ── Page Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1c1917", margin: 0, letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
            Modelos de Itens
          </h1>
          <p style={{ fontSize: 13, color: "#78716c", margin: "4px 0 0" }}>
            Catálogo de modelos reutilizáveis de peças gráficas
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "#f97316" }} />
            <input
              placeholder="Buscar modelos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-models"
              style={{ paddingLeft: 38, paddingRight: 14, height: 40, width: 280, backgroundColor: "#e8e8e7", border: "none", borderRadius: 10, fontSize: 13, color: "#1c1917", outline: "none" }}
            />
          </div>

          {/* New Model Button */}
          <button
            data-testid="button-new-model"
            onClick={() => { setEditingItem(null); setFormData({ ...EMPTY_FORM }); setOpen(true); }}
            style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "#1c1917", color: "#ffffff", border: "none", borderRadius: 10, padding: "0 18px", height: 40, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Space Grotesk', sans-serif" }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#000000")}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#1c1917")}
          >
            <Plus style={{ width: 16, height: 16 }} />
            Novo Modelo
          </button>
        </div>
      </div>

      {/* ── Table Card ── */}
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "64px 0" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #e7e5e4", borderTopColor: "#f97316", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        </div>
      ) : standardItems.length === 0 ? (
        <div style={{ backgroundColor: "#ffffff", borderRadius: 14, padding: "64px 32px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
          <Layers style={{ width: 40, height: 40, color: "#d4d0cc", margin: "0 auto 14px" }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: "#1c1917", margin: "0 0 6px" }}>Nenhum modelo criado</p>
          <p style={{ fontSize: 13, color: "#78716c", margin: "0 0 20px" }}>Crie modelos para reutilizar configurações de itens</p>
          <button onClick={() => setOpen(true)}
            style={{ backgroundColor: "#1c1917", color: "#ffffff", border: "none", borderRadius: 10, padding: "9px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Plus style={{ width: 14, height: 14 }} /> Criar Primeiro Modelo
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: "#ffffff", borderRadius: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>

          {/* Tool strip */}
          <div style={{ padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(243,244,243,0.4)", borderBottom: "1px solid #e7e5e4" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Layers style={{ width: 20, height: 20, color: "#f97316" }} />
              </div>
              <div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", display: "block" }}>
                  {filteredItems.length} modelo{filteredItems.length !== 1 ? "s" : ""}
                  {searchTerm && <span style={{ color: "#a8a29e", fontWeight: 400 }}> — filtrado de {standardItems.length}</span>}
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.08em" }}>Total no Catálogo</span>
              </div>
            </div>
            {filteredItems.length === 0 && searchTerm && (
              <button onClick={() => setSearchTerm("")}
                style={{ fontSize: 12, color: "#78716c", background: "none", border: "1px solid #e7e5e4", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
                Limpar busca
              </button>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <Search style={{ width: 32, height: 32, color: "#d4d0cc", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1c1917", margin: "0 0 4px" }}>Nenhum resultado</p>
              <p style={{ fontSize: 13, color: "#78716c" }}>Tente buscar com outro termo</p>
            </div>
          ) : (
            <div className="scrollbar-visible" style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "rgba(243,244,243,0.5)", borderBottom: "1px solid #e7e5e4" }}>
                    {["Nome", "Tipo", "Medidas", "Material", "Acabamento", isAdmin ? "Ações" : ""].filter(Boolean).map(col => (
                      <th key={col} style={{
                        padding: "14px 24px",
                        textAlign: col === "Ações" ? "right" : "left",
                        fontSize: 10, fontWeight: 700, color: "#a8a29e",
                        textTransform: "uppercase", letterSpacing: "0.1em", whiteSpace: "nowrap",
                      }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody style={{ borderTop: "none" }}>
                  {filteredItems.map((item) => {
                    const isHovered = hoveredRow === item.id;
                    const pillStyle = tipoPillStyle(item.type || "");
                    return (
                      <tr
                        key={item.id}
                        data-testid={`row-model-${item.id}`}
                        onMouseEnter={() => setHoveredRow(item.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{ borderBottom: "1px solid #f5f4f0", backgroundColor: isHovered ? "rgba(250,250,249,0.8)" : "#ffffff", transition: "background-color 0.1s" }}
                      >
                        {/* Nome */}
                        <td style={{ padding: "18px 24px", minWidth: 200 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", display: "block" }}>{item.name}</span>
                          {item.hasVariableMeasurement && (
                            <span style={{ fontSize: 10, color: "#a8a29e", marginTop: 2, display: "block" }}>Medida variável</span>
                          )}
                        </td>

                        {/* Tipo */}
                        <td style={{ padding: "18px 24px" }}>
                          {item.type ? (
                            <span style={{ ...pillStyle, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 100, padding: "3px 10px", display: "inline-block", whiteSpace: "nowrap" }}>
                              {item.type}
                            </span>
                          ) : <span style={{ color: "#d4d0cc", fontSize: 13 }}>—</span>}
                        </td>

                        {/* Medidas */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                          {item.hasVariableMeasurement ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: "#eff6ff", color: "#1d4ed8", borderRadius: 100, padding: "3px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                              <Ruler style={{ width: 10, height: 10 }} /> Variável
                            </span>
                          ) : (item.area || item.visual || item.fileWidth || item.fileHeight) ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                              {(item.area || item.visual) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#a8a29e", backgroundColor: "#f5f4f0", borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>VIS</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1c1917", fontFamily: "monospace" }}>
                                    {item.area ?? "—"} × {item.visual ?? "—"}m
                                  </span>
                                </div>
                              )}
                              {(item.fileWidth || item.fileHeight) && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 9, fontWeight: 700, color: "#D97A1E", backgroundColor: "#FDF3E7", borderRadius: 3, padding: "1px 5px", letterSpacing: "0.06em" }}>ARQ</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#57534e", fontFamily: "monospace" }}>
                                    {item.fileWidth ?? "—"} × {item.fileHeight ?? "—"}m
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ fontSize: 12, color: "#d4d0cc" }}>—</span>
                          )}
                        </td>

                        {/* Material */}
                        <td style={{ padding: "18px 24px" }}>
                          <span style={{ fontSize: 13, color: item.material ? "#57534e" : "#d4d0cc" }}>
                            {item.material || "—"}
                          </span>
                        </td>

                        {/* Acabamento */}
                        <td style={{ padding: "18px 24px" }}>
                          <span style={{ fontSize: 13, color: item.finish ? "#57534e" : "#d4d0cc" }}>
                            {item.finish || "—"}
                          </span>
                        </td>

                        {/* Ações (admin) */}
                        {isAdmin && (
                          <td style={{ padding: "18px 24px", textAlign: "right", whiteSpace: "nowrap" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                              <HoverIconBtn
                                icon={<Pencil style={{ width: 16, height: 16 }} />}
                                hoverBg="#fff7ed" hoverColor="#f97316"
                                onClick={() => handleEdit(item)}
                                testId={`button-edit-model-${item.id}`}
                                title="Editar modelo"
                              />
                              <HoverIconBtn
                                icon={<Trash2 style={{ width: 16, height: 16 }} />}
                                hoverBg="#fef2f2" hoverColor="#dc2626"
                                onClick={() => setDeleteConfirm(item)}
                                testId={`button-delete-model-${item.id}`}
                                title="Excluir modelo"
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Modal Criar / Editar ── */}
      <Dialog open={open} onOpenChange={open => { if (!open) handleCloseDialog(); }}>
        <DialogContent style={{ padding: 0, gap: 0, maxWidth: 640, borderRadius: 16, overflow: "hidden", backgroundColor: "#ffffff" }}>

          {/* Header */}
          <div style={{ padding: "24px 32px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "1px solid #f5f4f0" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1c1917", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em" }}>
                {editingItem ? "Editar Modelo de Item" : "Novo Modelo de Item"}
              </h3>
              <p style={{ margin: "5px 0 0", fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Definição Técnica do Template
              </p>
            </div>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit}>
            <div style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

              {/* Nome — col-span-2 */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={labelStyle}>Nome do Modelo</label>
                <input
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Backdrop Premium v2"
                  required
                  data-testid="input-model-name"
                  style={fieldStyle}
                />
              </div>

              {/* Toggle Medida Variável — col-span-2 */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", paddingBottom: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
                  <div
                    onClick={() => setFormData({ ...formData, hasVariableMeasurement: !formData.hasVariableMeasurement, area: !formData.hasVariableMeasurement ? "" : formData.area, visual: !formData.hasVariableMeasurement ? "" : formData.visual, fileWidth: "", fileHeight: "" })}
                    style={{ position: "relative", width: 40, height: 22, borderRadius: 100, backgroundColor: formData.hasVariableMeasurement ? "#f97316" : "#d6d3d1", transition: "background-color 0.2s", cursor: "pointer", flexShrink: 0 }}
                  >
                    <div style={{ position: "absolute", top: 3, left: formData.hasVariableMeasurement ? 21 : 3, width: 16, height: 16, borderRadius: "50%", backgroundColor: "#ffffff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#57534e", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Medida Variável
                  </span>
                </label>
              </div>

              {/* ── Medidas visuais ── */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ ...labelStyle, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  Medidas Visuais
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#a8a29e", backgroundColor: "#f5f4f0", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.06em" }}>VIS.</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ ...labelStyle, color: "#a8a29e" }}>Largura — VIS. L</label>
                    <input
                      type="number" step="0.01"
                      value={formData.area}
                      onChange={e => {
                        const v = e.target.value;
                        // auto-sync ARQ.L if it was empty or matched the old visual value
                        const autoSync = !formData.fileWidth || formData.fileWidth === formData.area;
                        setFormData(prev => ({ ...prev, area: v, fileWidth: autoSync ? v : prev.fileWidth }));
                      }}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-area"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: "#a8a29e" }}>Altura — VIS. A</label>
                    <input
                      type="number" step="0.01"
                      value={formData.visual}
                      onChange={e => {
                        const v = e.target.value;
                        const autoSync = !formData.fileHeight || formData.fileHeight === formData.visual;
                        setFormData(prev => ({ ...prev, visual: v, fileHeight: autoSync ? v : prev.fileHeight }));
                      }}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-visual"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                </div>
              </div>

              {/* ── Medidas do arquivo ── */}
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ ...labelStyle, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                  Medidas do Arquivo
                  <span style={{ fontSize: 9, fontWeight: 700, color: "#D97A1E", backgroundColor: "#FDF3E7", borderRadius: 4, padding: "2px 6px", letterSpacing: "0.06em" }}>ARQ.</span>
                  <span style={{ fontSize: 10, fontWeight: 500, color: "#a8a29e", textTransform: "none", letterSpacing: 0 }}>— pré-preenchido igual ao visual</span>
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ ...labelStyle, color: "#a8a29e" }}>Largura — ARQ. L</label>
                    <input
                      type="number" step="0.01"
                      value={formData.fileWidth}
                      onChange={e => setFormData({ ...formData, fileWidth: e.target.value })}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-fileWidth"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                  <div>
                    <label style={{ ...labelStyle, color: "#a8a29e" }}>Altura — ARQ. A</label>
                    <input
                      type="number" step="0.01"
                      value={formData.fileHeight}
                      onChange={e => setFormData({ ...formData, fileHeight: e.target.value })}
                      placeholder="0.00"
                      disabled={formData.hasVariableMeasurement}
                      data-testid="input-model-fileHeight"
                      style={{ ...fieldStyle, opacity: formData.hasVariableMeasurement ? 0.5 : 1, cursor: formData.hasVariableMeasurement ? "not-allowed" : "text" }}
                    />
                  </div>
                </div>
              </div>

              {/* Material */}
              <div>
                <label style={labelStyle}>Material Base</label>
                <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button type="button"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.material ? "#1c1917" : "#a8a29e" }}>
                      <span>{formData.material || "Ex: Lona 440g"}</span>
                      <ChevronsUpDown style={{ width: 14, height: 14, color: "#a8a29e", flexShrink: 0 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 280, padding: 0 }} align="start">
                    <Command>
                      <CommandInput placeholder="Buscar ou adicionar material..." value={customMaterialInput} onValueChange={setCustomMaterialInput} />
                      <CommandList>
                        <CommandEmpty>
                          <div style={{ padding: "8px 12px" }}>
                            <p style={{ fontSize: 12, color: "#78716c", margin: "0 0 8px" }}>Nenhum material encontrado.</p>
                            {customMaterialInput && (
                              <button type="button" onClick={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}
                                style={{ width: "100%", padding: "6px 12px", backgroundColor: "#1c1917", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                Adicionar "{customMaterialInput}"
                              </button>
                            )}
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {materials.map(material => (
                            <CommandItem key={material} value={material}
                              onSelect={() => { setFormData({ ...formData, material }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", formData.material === material ? "opacity-100" : "opacity-0")} />
                              {material}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formData.material && (
                  <button type="button" onClick={() => setFormData({ ...formData, material: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: "#a8a29e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Limpar
                  </button>
                )}
              </div>

              {/* Acabamento */}
              <div>
                <label style={labelStyle}>Acabamento</label>
                <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                  <PopoverTrigger asChild>
                    <button type="button"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.finish ? "#1c1917" : "#a8a29e" }}>
                      <span>{formData.finish || "Ex: Ilhós perimetral"}</span>
                      <ChevronsUpDown style={{ width: 14, height: 14, color: "#a8a29e", flexShrink: 0 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 280, padding: 0 }} align="start">
                    <Command>
                      <CommandInput placeholder="Buscar ou adicionar acabamento..." value={customFinishInput} onValueChange={setCustomFinishInput} />
                      <CommandList>
                        <CommandEmpty>
                          <div style={{ padding: "8px 12px" }}>
                            <p style={{ fontSize: 12, color: "#78716c", margin: "0 0 8px" }}>Nenhum acabamento encontrado.</p>
                            {customFinishInput && (
                              <button type="button" onClick={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}
                                style={{ width: "100%", padding: "6px 12px", backgroundColor: "#1c1917", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                                Adicionar "{customFinishInput}"
                              </button>
                            )}
                          </div>
                        </CommandEmpty>
                        <CommandGroup>
                          {finishes.map(finish => (
                            <CommandItem key={finish} value={finish}
                              onSelect={() => { setFormData({ ...formData, finish }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                              <Check className={cn("mr-2 h-4 w-4", formData.finish === finish ? "opacity-100" : "opacity-0")} />
                              {finish}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formData.finish && (
                  <button type="button" onClick={() => setFormData({ ...formData, finish: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: "#a8a29e", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    Limpar
                  </button>
                )}
              </div>

            </div>

            {/* Footer */}
            <div style={{ padding: "20px 32px", backgroundColor: "rgba(243,244,243,0.5)", borderTop: "1px solid #f5f4f0", display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button type="button" onClick={handleCloseDialog}
                style={{ padding: "10px 20px", backgroundColor: "transparent", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#78716c", cursor: "pointer" }}
                onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "#e7e5e4")}
                onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}
              >
                Cancelar
              </button>
              <button type="submit" disabled={createStandardItemMutation.isPending}
                data-testid="button-submit-model"
                style={{ padding: "10px 28px", backgroundColor: "#f97316", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#ffffff", cursor: createStandardItemMutation.isPending ? "not-allowed" : "pointer", opacity: createStandardItemMutation.isPending ? 0.7 : 1, transition: "background-color 0.15s" }}
                onMouseEnter={e => { if (!createStandardItemMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#ea580c"; }}
                onMouseLeave={e => { if (!createStandardItemMutation.isPending) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f97316"; }}
              >
                {createStandardItemMutation.isPending
                  ? (editingItem ? "Atualizando..." : "Criando...")
                  : (editingItem ? "Salvar Alterações" : "Salvar Modelo")}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={open => !open && setDeleteConfirm(null)}>
        <AlertDialogContent style={{ backgroundColor: "#ffffff", borderRadius: 12 }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: "#1c1917", fontWeight: 700 }}>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription style={{ color: "#78716c" }}>
              Tem certeza que deseja excluir o modelo <strong style={{ color: "#1c1917" }}>{deleteConfirm?.name}</strong>?
              <br /><br />Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ borderColor: "#e7e5e4", color: "#44403c" }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteStandardItemMutation.mutate(deleteConfirm.id)}
              disabled={deleteStandardItemMutation.isPending}
              style={{ backgroundColor: "#dc2626", color: "#ffffff", border: "none" }}
              data-testid="button-confirm-delete-model"
            >
              <Trash2 style={{ width: 14, height: 14, marginRight: 6 }} />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Icon button with hover color ── */
function HoverIconBtn({ icon, hoverBg, hoverColor, onClick, testId, title }: {
  icon: React.ReactNode; hoverBg: string; hoverColor: string;
  onClick: () => void; testId: string; title: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} data-testid={testId} title={title}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
        backgroundColor: hovered ? hoverBg : "transparent",
        color: hovered ? hoverColor : "#a8a29e",
        transition: "all 0.15s",
      }}
    >
      {icon}
    </button>
  );
}
