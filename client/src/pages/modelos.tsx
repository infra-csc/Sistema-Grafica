import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Layers, Search, Check, ChevronsUpDown, Pencil, Trash2, Ruler, Filter, MoreVertical, X, Settings } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
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

// Mantém o rótulo e o visual desta tela, mas delega o comportamento ao filtro
// padrão do app (busca, ordem alfabética, contagem). Aqui o "sem filtro" é ""
// em vez de "all", então traduzimos nas duas pontas.
function SearchableSelect({
  label, placeholder, value, options, onChange, testId, counts,
}: {
  label: string; placeholder: string; value: string;
  options: string[]; onChange: (v: string) => void; testId?: string;
  counts?: Record<string, number>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: "#a8a29e", textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</span>
      <FilterSelect
        label={label}
        allLabel={placeholder}
        showAllLabelWhenEmpty
        hideWhenEmpty={false}
        value={value === "" ? "all" : value}
        onChange={v => onChange(v === "all" ? "" : v)}
        options={options.map(o => ({ value: o, label: o, count: counts?.[o] }))}
        searchPlaceholder={`Buscar ${label.toLowerCase()}...`}
        emptyText="Nenhuma opção"
        panelWidth={220}
        testId={testId}
        triggerStyle={{
          height: 36, minWidth: 160, fontSize: 13,
          backgroundColor: "#ffffff", border: "1px solid #d6d3d1",
          justifyContent: "space-between",
        }}
      />
    </div>
  );
}

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Madeira", "Sanett", "Tecido", "Tecido Pet"];
const finishes = ["Dupla Face", "Ilhós", "Impressão UV", "Impresso", "Recorte", "Refile"];

const EMPTY_FORM = {
  name: "",
  type: "",
  group: "",
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
  const [filterGroup, setFilterGroup] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterMaterial, setFilterMaterial] = useState("");
  const [filterFinish, setFilterFinish] = useState("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [materialPopoverOpen, setMaterialPopoverOpen] = useState(false);
  const [finishPopoverOpen, setFinishPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [customMaterialInput, setCustomMaterialInput] = useState("");
  const [customFinishInput, setCustomFinishInput] = useState("");
  const [customGroupInput, setCustomGroupInput] = useState("");
  const { toast } = useToast();
  const [editingItem, setEditingItem] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  // Manage modal
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<"group"|"material"|"finish">("group");
  const [mgEditingGroup, setMgEditingGroup] = useState<string | null>(null);
  const [mgEditGroupValue, setMgEditGroupValue] = useState("");
  const [mgEditingFinish, setMgEditingFinish] = useState<string | null>(null);
  const [mgEditFinishValue, setMgEditFinishValue] = useState("");
  const [mgEditingMaterial, setMgEditingMaterial] = useState<string | null>(null);
  const [mgEditMaterialValue, setMgEditMaterialValue] = useState("");
  const [mgDeleteGroupConfirm, setMgDeleteGroupConfirm] = useState<string | null>(null);
  const [mgDeleteFinishConfirm, setMgDeleteFinishConfirm] = useState<string | null>(null);
  const [mgDeleteMaterialConfirm, setMgDeleteMaterialConfirm] = useState<string | null>(null);

  const { data: standardItems = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/standard-items"],
  });

  const { data: catalogOptions = [] } = useQuery<{ kind: string; value: string }[]>({
    queryKey: ["/api/catalog-options"],
  });

  const createCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("POST", "/api/catalog-options", { kind, value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] });
      toast({ title: "Adicionado", description: "Opção cadastrada com sucesso" });
    },
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const deleteCatalogOptionMutation = useMutation({
    mutationFn: async ({ kind, value }: { kind: string; value: string }) =>
      await apiRequest("DELETE", "/api/catalog-options", { kind, value }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/catalog-options"] }),
    onError: (error: Error) => toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  const [newCatValue, setNewCatValue] = useState("");

  const renameGroupMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) =>
      await apiRequest("PATCH", "/api/standard-items/rename-group", { oldName, newName }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterGroup === vars.oldName) setFilterGroup(vars.newName);
      setMgEditingGroup(null);
      setMgEditGroupValue("");
      toast({ title: "Grupo renomeado", description: `"${vars.oldName}" → "${vars.newName}"` });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (name: string) =>
      await apiRequest("DELETE", "/api/standard-items/clear-group", { name }),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterGroup === name) setFilterGroup("");
      setMgDeleteGroupConfirm(null);
      toast({ title: "Grupo removido", description: `"${name}" foi removido de todos os modelos` });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const renameFinishMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) =>
      await apiRequest("PATCH", "/api/standard-items/rename-finish", { oldName, newName }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterFinish === vars.oldName) setFilterFinish(vars.newName);
      setMgEditingFinish(null);
      setMgEditFinishValue("");
      toast({ title: "Acabamento renomeado", description: `"${vars.oldName}" → "${vars.newName}"` });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteFinishMutation = useMutation({
    mutationFn: async (name: string) =>
      await apiRequest("DELETE", "/api/standard-items/clear-finish", { name }),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterFinish === name) setFilterFinish("");
      setMgDeleteFinishConfirm(null);
      toast({ title: "Acabamento removido", description: `"${name}" foi removido de todos os modelos` });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const renameMaterialMutation = useMutation({
    mutationFn: async ({ oldName, newName }: { oldName: string; newName: string }) =>
      await apiRequest("PATCH", "/api/standard-items/rename-material", { oldName, newName }),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterMaterial === vars.oldName) setFilterMaterial(vars.newName);
      setMgEditingMaterial(null);
      setMgEditMaterialValue("");
      toast({ title: "Material renomeado", description: `"${vars.oldName}" → "${vars.newName}"` });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
  });

  const deleteMaterialMutation = useMutation({
    mutationFn: async (name: string) =>
      await apiRequest("DELETE", "/api/standard-items/clear-material", { name }),
    onSuccess: (_data, name) => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      if (filterMaterial === name) setFilterMaterial("");
      setMgDeleteMaterialConfirm(null);
      toast({ title: "Material removido", description: `"${name}" foi removido de todos os modelos` });
    },
    onError: (error: Error) => {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    },
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
    const toStr = (v: string) => (v === "" || v === null || v === undefined) ? null : String(v);
    const dataToSubmit: any = {
      ...formData,
      group: formData.group || null,
      material: formData.material || null,
      finish: formData.finish || null,
      area: toStr(formData.area),
      visual: toStr(formData.visual),
      visualWidth: toStr(formData.visualWidth),
      visualHeight: toStr(formData.visualHeight),
      fileWidth: toStr(formData.fileWidth),
      fileHeight: toStr(formData.fileHeight),
    };
    createStandardItemMutation.mutate(dataToSubmit);
  };

  const handleEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      type: item.type,
      group: item.group || "",
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

  // Opções de catálogo cadastradas avulsas (material/acabamento/grupo)
  const catMats = catalogOptions.filter(o => o.kind === "material").map(o => o.value);
  const catFinishes = catalogOptions.filter(o => o.kind === "finish").map(o => o.value);
  const catGroups = catalogOptions.filter(o => o.kind === "group").map(o => o.value);

  // Unique values for filter chips
  const allGroups = [...new Set([...catGroups, ...standardItems.map((s: any) => s.group).filter(Boolean)])].sort() as string[];
  const allTypes  = [...new Set(standardItems.map((s: any) => s.type).filter(Boolean))].sort() as string[];
  const allMats     = [...new Set([...materials,  ...catMats,     ...standardItems.map((s: any) => s.material).filter(Boolean)])].sort() as string[];
  const allFinishes = [...new Set([...finishes,   ...catFinishes, ...standardItems.map((s: any) => s.finish).filter(Boolean)])].sort() as string[];

  const filteredItems = standardItems.filter((item) => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q || item.name.toLowerCase().includes(q) || item.type?.toLowerCase().includes(q) || (item.group || "").toLowerCase().includes(q);
    const matchGroup  = !filterGroup   || item.group    === filterGroup;
    const matchType   = !filterType    || item.type     === filterType;
    const matchMat    = !filterMaterial || item.material === filterMaterial;
    const matchFinish = !filterFinish   || item.finish   === filterFinish;
    return matchSearch && matchGroup && matchType && matchMat && matchFinish;
  }).sort((a, b) => {
    const ga = (a.group || "").localeCompare(b.group || "", "pt-BR");
    if (ga !== 0) return ga;
    return a.name.localeCompare(b.name, "pt-BR");
  });

  const activeFilters = [filterGroup, filterType, filterMaterial, filterFinish].filter(Boolean).length;

  // Contagens facetadas: cada filtro conta aplicando os OUTROS filtros ativos.
  const mFacetCounts = (field: 'group' | 'type' | 'material' | 'finish') => {
    const out: Record<string, number> = {};
    standardItems.forEach((item: any) => {
      if (field !== 'group' && filterGroup && item.group !== filterGroup) return;
      if (field !== 'type' && filterType && item.type !== filterType) return;
      if (field !== 'material' && filterMaterial && item.material !== filterMaterial) return;
      if (field !== 'finish' && filterFinish && item.finish !== filterFinish) return;
      const v = item[field];
      if (!v) return;
      out[v] = (out[v] || 0) + 1;
    });
    return out;
  };
  const groupCounts = mFacetCounts('group');
  const typeCounts = mFacetCounts('type');
  const materialCounts = mFacetCounts('material');
  const finishCounts = mFacetCounts('finish');

  const isAdmin = true; // all roles with page access can manage models

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
    <div style={{ backgroundColor: "#fafaf9", height: "100%", overflowY: "auto", padding: "24px 28px 20px" }}>

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

          {/* Manage Categories Button */}
          <button
            data-testid="button-manage-categories"
            onClick={() => setManageOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, backgroundColor: "transparent", color: "#57534e", border: "1.5px solid #d6d3d1", borderRadius: 10, padding: "0 16px", height: 40, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#f5f4f0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
          >
            <Settings style={{ width: 15, height: 15 }} />
            Gerenciar
          </button>

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

      {/* ── Filter Bar ── */}
      {!isLoading && standardItems.length > 0 && (
        <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>

          {allGroups.length > 0 && (
            <SearchableSelect label="Grupo" placeholder="Todos os grupos" value={filterGroup} options={allGroups} counts={groupCounts} onChange={setFilterGroup} testId="filter-group-select" />
          )}
          {allTypes.length > 0 && (
            <SearchableSelect label="Tipo" placeholder="Todos os tipos" value={filterType} options={allTypes} counts={typeCounts} onChange={setFilterType} testId="filter-type-select" />
          )}
          {allMats.length > 0 && (
            <SearchableSelect label="Material" placeholder="Todos os materiais" value={filterMaterial} options={allMats} counts={materialCounts} onChange={setFilterMaterial} testId="filter-material-select" />
          )}
          {allFinishes.length > 0 && (
            <SearchableSelect label="Acabamento" placeholder="Todos os acabamentos" value={filterFinish} options={allFinishes} counts={finishCounts} onChange={setFilterFinish} testId="filter-finish-select" />
          )}

          {/* Limpar filtros */}
          {activeFilters > 0 && (
            <button
              onClick={() => { setFilterGroup(""); setFilterType(""); setFilterMaterial(""); setFilterFinish(""); }}
              style={{ height: 36, paddingLeft: 12, paddingRight: 12, fontSize: 12, fontWeight: 600, color: "#78716c", background: "none", border: "1px solid #e7e5e4", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-end" }}
            >
              <X style={{ width: 11, height: 11 }} />
              Limpar ({activeFilters})
            </button>
          )}
        </div>
      )}

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
              <p style={{ fontSize: 14, fontWeight: 600, color: "#1c1917", margin: "0 0 4px" }}>Nenhum modelo encontrado</p>
              <p style={{ fontSize: 13, color: "#78716c", margin: "0 0 16px" }}>
                {searchTerm && activeFilters > 0
                  ? "Nenhum modelo corresponde à busca e aos filtros atuais"
                  : searchTerm
                  ? "Tente buscar com outro termo"
                  : "Nenhum modelo encontrado com os filtros atuais"}
              </p>
              {activeFilters > 0 && (
                <button
                  onClick={() => { setFilterGroup(""); setFilterType(""); setFilterMaterial(""); setFilterFinish(""); }}
                  style={{ fontSize: 12, fontWeight: 600, color: "#78716c", background: "none", border: "1px solid #e7e5e4", borderRadius: 8, padding: "6px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <X style={{ width: 11, height: 11 }} /> Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="scrollbar-visible" style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ backgroundColor: "rgba(243,244,243,0.5)", borderBottom: "1px solid #e7e5e4" }}>
                    {["Nome", "Grupo", "Tipo", "Medidas", "Material", "Acabamento", isAdmin ? "Ações" : ""].filter(Boolean).map(col => (
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

                        {/* Grupo */}
                        <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                          {item.group ? (
                            <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 100, padding: "3px 10px", display: "inline-block", backgroundColor: "#f0f9ff", color: "#0369a1", whiteSpace: "nowrap" }}>
                              {item.group}
                            </span>
                          ) : <span style={{ color: "#d4d0cc", fontSize: 13 }}>—</span>}
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
        <DialogContent style={{ padding: 0, gap: 0, maxWidth: 640, borderRadius: 16, overflow: "hidden", backgroundColor: "#ffffff", display: "flex", flexDirection: "column", maxHeight: "90vh" }}>

          {/* Header */}
          <div style={{ padding: "24px 32px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", borderBottom: "1px solid #f5f4f0", flexShrink: 0 }}>
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
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <div style={{ padding: "28px 32px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, overflowY: "auto", flex: 1 }}>

              {/* Nome */}
              <div>
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

              {/* Tipo */}
              <div>
                <label style={labelStyle}>
                  Tipo{" "}
                  <span style={{ fontWeight: 400, color: "#a8a29e", textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <input
                  value={formData.type}
                  onChange={e => setFormData({ ...formData, type: e.target.value })}
                  placeholder="Ex: Palco, Stand, WindBanner..."
                  data-testid="input-model-type"
                  style={fieldStyle}
                />
              </div>

              {/* Grupo Pai */}
              <div>
                <label style={labelStyle}>
                  Grupo Pai{" "}
                  <span style={{ fontWeight: 400, color: "#a8a29e", textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
                </label>
                <Popover open={groupPopoverOpen} onOpenChange={open => { setGroupPopoverOpen(open); if (!open) setCustomGroupInput(""); }}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-testid="input-model-group"
                      style={{
                        ...fieldStyle,
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        cursor: "pointer",
                        color: formData.group ? "#1c1917" : "#a8a29e",
                      }}
                    >
                      {formData.group ? (
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 6,
                          backgroundColor: "#dbeafe", color: "#1d4ed8",
                          borderRadius: 6, padding: "2px 10px 2px 8px",
                          fontSize: 12, fontWeight: 700,
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#3b82f6", flexShrink: 0 }} />
                          {formData.group}
                        </span>
                      ) : (
                        <span>Selecionar ou criar grupo...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: "#a8a29e", flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    <Command>
                      <CommandInput
                        placeholder="Buscar ou criar grupo..."
                        value={customGroupInput}
                        onValueChange={setCustomGroupInput}
                      />
                      <CommandList>
                        <CommandEmpty>
                          {customGroupInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <button
                                type="button"
                                onClick={() => { setFormData({ ...formData, group: customGroupInput }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: "#1d4ed8", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}
                              >
                                + Criar grupo "{customGroupInput}"
                              </button>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 12, color: "#a8a29e", margin: 0 }}>Nenhum grupo cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allGroups.length > 0 && (
                          <CommandGroup heading="Grupos existentes">
                            {allGroups.map(g => (
                              <CommandItem
                                key={g}
                                value={g}
                                onSelect={() => { setFormData({ ...formData, group: g }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}
                              >
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  backgroundColor: formData.group === g ? "#dbeafe" : "#f0f9ff",
                                  color: "#1d4ed8", borderRadius: 6,
                                  padding: "2px 10px 2px 8px", fontSize: 12, fontWeight: 600,
                                  marginRight: 8,
                                }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#3b82f6", flexShrink: 0 }} />
                                  {g}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.group === g ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customGroupInput && allGroups.some(g => g.toLowerCase() === customGroupInput.toLowerCase()) === false && (
                          <CommandGroup heading="Novo">
                            <CommandItem
                              value={`__new__${customGroupInput}`}
                              onSelect={() => { setFormData({ ...formData, group: customGroupInput }); setCustomGroupInput(""); setGroupPopoverOpen(false); }}
                            >
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: "#1d4ed8" }} />
                              <span style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>Criar "{customGroupInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {formData.group && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, group: "" })}
                    style={{ marginTop: 4, fontSize: 11, color: "#a8a29e", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Toggle Medida Variável — col-span-2 */}
              <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", paddingBottom: 4 }}>
                <label
                  onClick={() => setFormData({ ...formData, hasVariableMeasurement: !formData.hasVariableMeasurement, area: !formData.hasVariableMeasurement ? "" : formData.area, visual: !formData.hasVariableMeasurement ? "" : formData.visual, fileWidth: "", fileHeight: "" })}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                >
                  <div
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
                <Popover open={materialPopoverOpen} onOpenChange={open => { setMaterialPopoverOpen(open); if (!open) setCustomMaterialInput(""); }}>
                  <PopoverTrigger asChild>
                    <button type="button" data-testid="input-model-material"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.material ? "#1c1917" : "#a8a29e" }}>
                      {formData.material ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#fff7ed", color: "#c2410c", borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 12, fontWeight: 600 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#f97316", flexShrink: 0 }} />
                          {formData.material}
                        </span>
                      ) : (
                        <span>Selecionar ou criar material...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: "#a8a29e", flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    <Command>
                      <CommandInput placeholder="Buscar ou criar material..." value={customMaterialInput} onValueChange={setCustomMaterialInput} />
                      <CommandList>
                        <CommandEmpty>
                          {customMaterialInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <button type="button"
                                onClick={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: "#ea580c", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                                <Plus style={{ width: 13, height: 13, display: "inline", marginRight: 6 }} />
                                Criar "{customMaterialInput}"
                              </button>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 12, color: "#a8a29e", margin: 0 }}>Nenhum material cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allMats.length > 0 && (
                          <CommandGroup heading="Materiais existentes">
                            {allMats.map(m => (
                              <CommandItem key={m} value={m}
                                onSelect={() => { setFormData({ ...formData, material: m }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: formData.material === m ? "#fed7aa" : "#fff7ed", color: "#c2410c", borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 12, fontWeight: 600, marginRight: 8 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#f97316", flexShrink: 0 }} />
                                  {m}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.material === m ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customMaterialInput && !allMats.some(m => m.toLowerCase() === customMaterialInput.toLowerCase()) && (
                          <CommandGroup heading="Novo">
                            <CommandItem value={`__new__${customMaterialInput}`}
                              onSelect={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: "#ea580c" }} />
                              <span style={{ fontSize: 12, color: "#ea580c", fontWeight: 600 }}>Criar "{customMaterialInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
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
                <Popover open={finishPopoverOpen} onOpenChange={open => { setFinishPopoverOpen(open); if (!open) setCustomFinishInput(""); }}>
                  <PopoverTrigger asChild>
                    <button type="button" data-testid="input-model-finish"
                      style={{ ...fieldStyle, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: formData.finish ? "#1c1917" : "#a8a29e" }}>
                      {formData.finish ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: "#f5f4f0", color: "#57534e", borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 12, fontWeight: 600 }}>
                          <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#a8a29e", flexShrink: 0 }} />
                          {formData.finish}
                        </span>
                      ) : (
                        <span>Selecionar ou criar acabamento...</span>
                      )}
                      <ChevronsUpDown style={{ width: 14, height: 14, color: "#a8a29e", flexShrink: 0, marginLeft: 4 }} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent style={{ width: 300, padding: 0 }} align="start">
                    <Command>
                      <CommandInput placeholder="Buscar ou criar acabamento..." value={customFinishInput} onValueChange={setCustomFinishInput} />
                      <CommandList>
                        <CommandEmpty>
                          {customFinishInput ? (
                            <div style={{ padding: "8px 12px" }}>
                              <button type="button"
                                onClick={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}
                                style={{ width: "100%", padding: "8px 12px", backgroundColor: "#57534e", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>
                                <Plus style={{ width: 13, height: 13, display: "inline", marginRight: 6 }} />
                                Criar "{customFinishInput}"
                              </button>
                            </div>
                          ) : (
                            <p style={{ padding: "12px 16px", fontSize: 12, color: "#a8a29e", margin: 0 }}>Nenhum acabamento cadastrado</p>
                          )}
                        </CommandEmpty>
                        {allFinishes.length > 0 && (
                          <CommandGroup heading="Acabamentos existentes">
                            {allFinishes.map(f => (
                              <CommandItem key={f} value={f}
                                onSelect={() => { setFormData({ ...formData, finish: f }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: formData.finish === f ? "#e7e5e4" : "#f5f4f0", color: "#57534e", borderRadius: 6, padding: "2px 10px 2px 8px", fontSize: 12, fontWeight: 600, marginRight: 8 }}>
                                  <span style={{ width: 5, height: 5, borderRadius: "50%", backgroundColor: "#a8a29e", flexShrink: 0 }} />
                                  {f}
                                </span>
                                <Check className={cn("ml-auto h-4 w-4", formData.finish === f ? "opacity-100" : "opacity-0")} />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        )}
                        {customFinishInput && !allFinishes.some(f => f.toLowerCase() === customFinishInput.toLowerCase()) && (
                          <CommandGroup heading="Novo">
                            <CommandItem value={`__new__${customFinishInput}`}
                              onSelect={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                              <Plus style={{ width: 14, height: 14, marginRight: 8, color: "#78716c" }} />
                              <span style={{ fontSize: 12, color: "#78716c", fontWeight: 600 }}>Criar "{customFinishInput}"</span>
                            </CommandItem>
                          </CommandGroup>
                        )}
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

      {/* ── Manage Categories Modal ── */}
      {manageOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}
          onClick={e => { if (e.target === e.currentTarget) { setManageOpen(false); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); setMgDeleteGroupConfirm(null); setMgDeleteFinishConfirm(null); setMgDeleteMaterialConfirm(null); } }}>
          {/* ── Modal card ── */}
          <div style={{ backgroundColor: "#ffffff", borderRadius: 20, width: 580, maxWidth: "95vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06)" }}>

            {/* Header */}
            <div style={{ padding: "24px 28px 0" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#1c1917", letterSpacing: "-0.03em" }}>Gerenciar Categorias</h2>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a8a29e" }}>Renomeie ou remova categorias dos modelos em lote</p>
                </div>
                <button onClick={() => { setManageOpen(false); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); setMgDeleteGroupConfirm(null); setMgDeleteFinishConfirm(null); setMgDeleteMaterialConfirm(null); }}
                  style={{ width: 34, height: 34, borderRadius: 10, border: "1px solid #e7e5e4", background: "#fafaf9", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#78716c", flexShrink: 0, marginTop: 2 }}>
                  <X style={{ width: 15, height: 15 }} />
                </button>
              </div>

              {/* Tabs */}
              {(() => {
                const tabs: { key: "group"|"material"|"finish"; label: string; color: string; bg: string; count: number }[] = [
                  { key: "group",    label: "Grupos Pai", color: "#0369a1", bg: "#e0f2fe", count: allGroups.length },
                  { key: "material", label: "Material",   color: "#b45309", bg: "#fef3c7", count: allMats.length },
                  { key: "finish",   label: "Acabamento", color: "#065f46", bg: "#d1fae5", count: allFinishes.length },
                ];
                return (
                  <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #f0efec" }}>
                    {tabs.map(t => (
                      <button key={t.key} onClick={() => { setManageTab(t.key); setMgEditingGroup(null); setMgEditingFinish(null); setMgEditingMaterial(null); setMgDeleteGroupConfirm(null); setMgDeleteFinishConfirm(null); setMgDeleteMaterialConfirm(null); }}
                        style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 16px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontSize: 13, fontWeight: manageTab === t.key ? 700 : 500, transition: "all 0.15s",
                          backgroundColor: manageTab === t.key ? "#ffffff" : "transparent",
                          color: manageTab === t.key ? t.color : "#a8a29e",
                          borderBottom: manageTab === t.key ? `2px solid ${t.color}` : "2px solid transparent",
                          marginBottom: -1,
                        }}>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: 6, backgroundColor: manageTab === t.key ? t.bg : "#f5f4f0", fontSize: 11, fontWeight: 800, color: manageTab === t.key ? t.color : "#a8a29e", flexShrink: 0 }}>
                          {t.count}
                        </span>
                        {t.label}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Body — scrollable list */}
            <div style={{ overflowY: "auto", padding: "16px 28px 24px", flex: 1 }}>
              {(() => {
                // Shared row renderer
                function CatRow({ name, count, accentColor, accentBg,
                  isEditing, editValue, onEditChange, onEditConfirm, onEditCancel, isPendingRename,
                  isDeleting, onDeleteConfirm, onDeleteCancel, isPendingDelete,
                  onStartEdit, onStartDelete,
                }: {
                  name: string; count: number; accentColor: string; accentBg: string;
                  isEditing: boolean; editValue: string; onEditChange: (v: string) => void;
                  onEditConfirm: () => void; onEditCancel: () => void; isPendingRename: boolean;
                  isDeleting: boolean; onDeleteConfirm: () => void; onDeleteCancel: () => void; isPendingDelete: boolean;
                  onStartEdit: () => void; onStartDelete: () => void;
                }) {
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 10, backgroundColor: isDeleting ? "#fff5f5" : "#fafaf9", border: `1px solid ${isDeleting ? "#fecaca" : "#f0efec"}`, transition: "all 0.15s" }}>
                      {/* Dot */}
                      <div style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: accentColor, flexShrink: 0, opacity: isDeleting ? 0.4 : 1 }} />

                      {isEditing ? (
                        <>
                          <input autoFocus value={editValue} onChange={e => onEditChange(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") onEditConfirm(); if (e.key === "Escape") onEditCancel(); }}
                            style={{ flex: 1, fontSize: 13, fontWeight: 600, borderRadius: 8, padding: "5px 10px", border: `1.5px solid ${accentColor}`, outline: "none", color: "#1c1917", background: accentBg }}
                          />
                          <button onClick={onEditConfirm} disabled={isPendingRename}
                            style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer", backgroundColor: accentColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Check style={{ width: 13, height: 13 }} />
                          </button>
                          <button onClick={onEditCancel}
                            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #e7e5e4", cursor: "pointer", backgroundColor: "#ffffff", color: "#78716c", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <X style={{ width: 13, height: 13 }} />
                          </button>
                        </>
                      ) : isDeleting ? (
                        <>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#dc2626" }}>Remover </span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "#dc2626" }}>"{name}"</span>
                            <span style={{ fontSize: 12, color: "#ef4444" }}> de {count} {count === 1 ? "modelo" : "modelos"}?</span>
                          </div>
                          <button onClick={onDeleteConfirm} disabled={isPendingDelete}
                            style={{ padding: "5px 14px", borderRadius: 8, border: "none", cursor: "pointer", backgroundColor: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                            Remover
                          </button>
                          <button onClick={onDeleteCancel}
                            style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid #e7e5e4", cursor: "pointer", backgroundColor: "#fff", color: "#78716c", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1c1917" }}>{name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: "#a8a29e", backgroundColor: "#f5f4f0", borderRadius: 6, padding: "2px 8px", marginRight: 2 }}>
                            {count} {count === 1 ? "modelo" : "modelos"}
                          </span>
                          <button onClick={onStartEdit} title={`Renomear "${name}"`}
                            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", backgroundColor: "transparent", color: "#c4bfbb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = accentBg; (e.currentTarget as HTMLButtonElement).style.color = accentColor; (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor + "40"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#c4bfbb"; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; }}>
                            <Pencil style={{ width: 12, height: 12 }} />
                          </button>
                          <button onClick={onStartDelete} title={`Remover "${name}"`}
                            style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid transparent", cursor: "pointer", backgroundColor: "transparent", color: "#c4bfbb", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fee2e2"; (e.currentTarget as HTMLButtonElement).style.color = "#dc2626"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#fca5a540"; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = "#c4bfbb"; (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent"; }}>
                            <Trash2 style={{ width: 12, height: 12 }} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                }

                const tabCfg = {
                  group:    { items: allGroups,   color: "#0369a1", bg: "#e0f2fe", empty: "Nenhum grupo cadastrado." },
                  material: { items: allMats,      color: "#b45309", bg: "#fef3c7", empty: "Nenhum material cadastrado." },
                  finish:   { items: allFinishes,  color: "#065f46", bg: "#d1fae5", empty: "Nenhum acabamento cadastrado." },
                }[manageTab];

                const addLabel = manageTab === "group" ? "grupo" : manageTab === "material" ? "material" : "acabamento";
                const submitNew = () => {
                  const v = newCatValue.trim();
                  if (!v) return;
                  if (tabCfg.items.some(i => i.toLowerCase() === v.toLowerCase())) { setNewCatValue(""); return; }
                  createCatalogOptionMutation.mutate({ kind: manageTab, value: v });
                  setNewCatValue("");
                };

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
                    {/* Adicionar nova opção */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                      <input
                        value={newCatValue}
                        onChange={e => setNewCatValue(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submitNew(); } }}
                        placeholder={`Adicionar ${addLabel}...`}
                        data-testid="input-new-catalog-option"
                        style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#faf9f8", fontSize: 13, color: "#1c1917", outline: "none" }}
                      />
                      <button type="button" onClick={submitNew} disabled={createCatalogOptionMutation.isPending || !newCatValue.trim()}
                        data-testid="button-add-catalog-option"
                        style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 14px", borderRadius: 8, border: "none", cursor: newCatValue.trim() ? "pointer" : "not-allowed", backgroundColor: newCatValue.trim() ? tabCfg.color : "#e7e5e4", color: "#fff", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                        <Plus style={{ width: 14, height: 14 }} /> Adicionar
                      </button>
                    </div>

                    {tabCfg.items.length === 0 && (
                      <p style={{ fontSize: 13, color: "#a8a29e", margin: "12px 0", textAlign: "center" }}>{tabCfg.empty}</p>
                    )}
                    {tabCfg.items.map(name => {
                      const count = manageTab === "group"
                        ? (standardItems as any[]).filter(s => s.group === name).length
                        : manageTab === "material"
                        ? (standardItems as any[]).filter(s => s.material === name).length
                        : (standardItems as any[]).filter(s => s.finish === name).length;

                      if (manageTab === "group") return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg}
                          isEditing={mgEditingGroup === name} editValue={mgEditGroupValue} onEditChange={setMgEditGroupValue}
                          onEditConfirm={() => { const t = mgEditGroupValue.trim(); if (t && t !== name) renameGroupMutation.mutate({ oldName: name, newName: t }); else setMgEditingGroup(null); }}
                          onEditCancel={() => setMgEditingGroup(null)} isPendingRename={renameGroupMutation.isPending}
                          isDeleting={mgDeleteGroupConfirm === name}
                          onDeleteConfirm={() => { deleteGroupMutation.mutate(name); deleteCatalogOptionMutation.mutate({ kind: "group", value: name }); }} onDeleteCancel={() => setMgDeleteGroupConfirm(null)} isPendingDelete={deleteGroupMutation.isPending}
                          onStartEdit={() => { setMgEditingGroup(name); setMgEditGroupValue(name); setMgDeleteGroupConfirm(null); }}
                          onStartDelete={() => { setMgDeleteGroupConfirm(name); setMgEditingGroup(null); }}
                        />
                      );
                      if (manageTab === "material") return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg}
                          isEditing={mgEditingMaterial === name} editValue={mgEditMaterialValue} onEditChange={setMgEditMaterialValue}
                          onEditConfirm={() => { const t = mgEditMaterialValue.trim(); if (t && t !== name) renameMaterialMutation.mutate({ oldName: name, newName: t }); else setMgEditingMaterial(null); }}
                          onEditCancel={() => setMgEditingMaterial(null)} isPendingRename={renameMaterialMutation.isPending}
                          isDeleting={mgDeleteMaterialConfirm === name}
                          onDeleteConfirm={() => { deleteMaterialMutation.mutate(name); deleteCatalogOptionMutation.mutate({ kind: "material", value: name }); }} onDeleteCancel={() => setMgDeleteMaterialConfirm(null)} isPendingDelete={deleteMaterialMutation.isPending}
                          onStartEdit={() => { setMgEditingMaterial(name); setMgEditMaterialValue(name); setMgDeleteMaterialConfirm(null); }}
                          onStartDelete={() => { setMgDeleteMaterialConfirm(name); setMgEditingMaterial(null); }}
                        />
                      );
                      return (
                        <CatRow key={name} name={name} count={count} accentColor={tabCfg.color} accentBg={tabCfg.bg}
                          isEditing={mgEditingFinish === name} editValue={mgEditFinishValue} onEditChange={setMgEditFinishValue}
                          onEditConfirm={() => { const t = mgEditFinishValue.trim(); if (t && t !== name) renameFinishMutation.mutate({ oldName: name, newName: t }); else setMgEditingFinish(null); }}
                          onEditCancel={() => setMgEditingFinish(null)} isPendingRename={renameFinishMutation.isPending}
                          isDeleting={mgDeleteFinishConfirm === name}
                          onDeleteConfirm={() => { deleteFinishMutation.mutate(name); deleteCatalogOptionMutation.mutate({ kind: "finish", value: name }); }} onDeleteCancel={() => setMgDeleteFinishConfirm(null)} isPendingDelete={deleteFinishMutation.isPending}
                          onStartEdit={() => { setMgEditingFinish(name); setMgEditFinishValue(name); setMgDeleteFinishConfirm(null); }}
                          onStartDelete={() => { setMgDeleteFinishConfirm(name); setMgEditingFinish(null); }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

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
