import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Layers, Search, Check, ChevronsUpDown, Pencil, Trash2, Ruler } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
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
      toast({
        title: editingItem ? "Erro ao atualizar modelo" : "Erro ao criar modelo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteStandardItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/standard-items/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/standard-items"] });
      setDeleteConfirm(null);
      toast({
        title: "Modelo excluído",
        description: "O modelo foi excluído com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir modelo",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSubmit: any = {
      ...formData,
      material: formData.material || null,
      finish: formData.finish || null,
      area: formData.area || null,
      visual: formData.visual || null,
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

  const handleDelete = (item: any) => setDeleteConfirm(item);

  const confirmDelete = () => {
    if (deleteConfirm) deleteStandardItemMutation.mutate(deleteConfirm.id);
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

  return (
    <div style={{ backgroundColor: '#fafaf9', minHeight: '100vh', padding: '28px 28px 40px' }}>

      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1c1917', margin: 0, letterSpacing: '-0.01em' }}>
            Modelos de Itens
          </h1>
          <p style={{ fontSize: 13, color: '#78716c', margin: '3px 0 0' }}>
            Catálogo de modelos reutilizáveis de peças gráficas
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search
              style={{
                position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                width: 15, height: 15, color: '#f97316',
              }}
            />
            <input
              placeholder="Buscar modelos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-models"
              style={{
                paddingLeft: 32, paddingRight: 12, height: 36, width: 240,
                border: '1px solid #e7e5e4', borderRadius: 8, backgroundColor: '#ffffff',
                fontSize: 13, color: '#1c1917', outline: 'none',
              }}
            />
          </div>

          {/* New Model Button */}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button
                data-testid="button-new-model"
                onClick={() => { setEditingItem(null); setFormData({ ...EMPTY_FORM }); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  backgroundColor: '#1c1917', color: '#ffffff',
                  border: 'none', borderRadius: 8,
                  padding: '0 16px', height: 36,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Plus style={{ width: 15, height: 15 }} />
                Novo Modelo
              </button>
            </DialogTrigger>

            {/* ── Dialog Form ── */}
            <DialogContent className="sm:max-w-lg" style={{ backgroundColor: '#fafaf9' }}>
              <DialogHeader>
                <DialogTitle style={{ color: '#1c1917', fontWeight: 700 }}>
                  {editingItem ? "Editar Modelo" : "Criar Novo Modelo"}
                </DialogTitle>
                <DialogDescription style={{ color: '#78716c' }}>
                  {editingItem ? "Atualize as informações do modelo" : "Configure um modelo reutilizável de item gráfico"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" style={{ color: '#1c1917', fontWeight: 500, fontSize: 13 }}>Nome do Modelo</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ex: Banner 2x1 Padrão"
                    required
                    style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff' }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type" style={{ color: '#1c1917', fontWeight: 500, fontSize: 13 }}>Tipo</Label>
                  <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={typePopoverOpen}
                        className="w-full justify-between font-normal"
                        style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff', color: formData.type ? '#1c1917' : '#a8a29e' }}>
                        <span className="truncate">{formData.type || "Selecione ou digite um tipo"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar ou adicionar tipo..." value={customTypeInput} onValueChange={setCustomTypeInput} />
                        <CommandList>
                          <CommandEmpty>
                            <div className="p-2 space-y-2">
                              <p className="text-sm text-muted-foreground">Nenhum tipo encontrado.</p>
                              {customTypeInput && (
                                <Button type="button" size="sm" className="w-full"
                                  onClick={() => { setFormData({ ...formData, type: customTypeInput }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                                  <Plus className="h-3 w-3 mr-1" />Adicionar "{customTypeInput}"
                                </Button>
                              )}
                            </div>
                          </CommandEmpty>
                          <CommandGroup>
                            {itemTypes.map((type) => (
                              <CommandItem key={type} value={type}
                                onSelect={() => { setFormData({ ...formData, type }); setCustomTypeInput(""); setTypePopoverOpen(false); }}>
                                <Check className={cn("mr-2 h-4 w-4", formData.type === type ? "opacity-100" : "opacity-0")} />
                                {type}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center space-x-2 p-3 rounded-md" style={{ backgroundColor: '#f5f5f4' }}>
                  <Checkbox
                    id="hasVariableMeasurement"
                    checked={formData.hasVariableMeasurement}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, hasVariableMeasurement: checked as boolean, area: checked ? "" : formData.area, visual: checked ? "" : formData.visual })
                    }
                  />
                  <Label htmlFor="hasVariableMeasurement" className="cursor-pointer font-normal" style={{ color: '#44403c', fontSize: 13 }}>
                    Medida variável (preencher por item)
                  </Label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="area" style={{ color: '#1c1917', fontWeight: 500, fontSize: 13 }}>Área (m)</Label>
                    <Input id="area" type="number" step="0.01" value={formData.area}
                      onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                      placeholder="2.00" disabled={formData.hasVariableMeasurement}
                      style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff' }} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visual" style={{ color: '#1c1917', fontWeight: 500, fontSize: 13 }}>Visual (m)</Label>
                    <Input id="visual" type="number" step="0.01" value={formData.visual}
                      onChange={(e) => setFormData({ ...formData, visual: e.target.value })}
                      placeholder="1.00" disabled={formData.hasVariableMeasurement}
                      style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff' }} />
                  </div>
                </div>

                {/* Material */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label style={{ color: '#1c1917', fontWeight: 500, fontSize: 13 }}>Material (opcional)</Label>
                    {formData.material && (
                      <button type="button" onClick={() => setFormData({ ...formData, material: "" })}
                        style={{ fontSize: 11, color: '#78716c', cursor: 'pointer', background: 'none', border: 'none' }}>
                        Limpar
                      </button>
                    )}
                  </div>
                  <Popover open={materialPopoverOpen} onOpenChange={setMaterialPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" aria-expanded={materialPopoverOpen}
                        className="w-full justify-between font-normal"
                        style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff', color: formData.material ? '#1c1917' : '#a8a29e' }}>
                        <span className="truncate">{formData.material || "Selecione ou digite um material"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar ou adicionar material..." value={customMaterialInput} onValueChange={setCustomMaterialInput} />
                        <CommandList>
                          <CommandEmpty>
                            <div className="p-2 space-y-2">
                              <p className="text-sm text-muted-foreground">Nenhum material encontrado.</p>
                              {customMaterialInput && (
                                <Button type="button" size="sm" className="w-full"
                                  onClick={() => { setFormData({ ...formData, material: customMaterialInput }); setCustomMaterialInput(""); setMaterialPopoverOpen(false); }}>
                                  <Plus className="h-3 w-3 mr-1" />Adicionar "{customMaterialInput}"
                                </Button>
                              )}
                            </div>
                          </CommandEmpty>
                          <CommandGroup>
                            {materials.map((material) => (
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
                </div>

                {/* Acabamento */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label style={{ color: '#1c1917', fontWeight: 500, fontSize: 13 }}>Acabamento (opcional)</Label>
                    {formData.finish && (
                      <button type="button" onClick={() => setFormData({ ...formData, finish: "" })}
                        style={{ fontSize: 11, color: '#78716c', cursor: 'pointer', background: 'none', border: 'none' }}>
                        Limpar
                      </button>
                    )}
                  </div>
                  <Popover open={finishPopoverOpen} onOpenChange={setFinishPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" role="combobox" aria-expanded={finishPopoverOpen}
                        className="w-full justify-between font-normal"
                        style={{ borderColor: '#e7e5e4', backgroundColor: '#ffffff', color: formData.finish ? '#1c1917' : '#a8a29e' }}>
                        <span className="truncate">{formData.finish || "Selecione ou digite um acabamento"}</span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar ou adicionar acabamento..." value={customFinishInput} onValueChange={setCustomFinishInput} />
                        <CommandList>
                          <CommandEmpty>
                            <div className="p-2 space-y-2">
                              <p className="text-sm text-muted-foreground">Nenhum acabamento encontrado.</p>
                              {customFinishInput && (
                                <Button type="button" size="sm" className="w-full"
                                  onClick={() => { setFormData({ ...formData, finish: customFinishInput }); setCustomFinishInput(""); setFinishPopoverOpen(false); }}>
                                  <Plus className="h-3 w-3 mr-1" />Adicionar "{customFinishInput}"
                                </Button>
                              )}
                            </div>
                          </CommandEmpty>
                          <CommandGroup>
                            {finishes.map((finish) => (
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
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <Button type="button" variant="outline" onClick={handleCloseDialog}
                    style={{ borderColor: '#e7e5e4', color: '#44403c' }}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createStandardItemMutation.isPending}
                    data-testid="button-submit-model"
                    style={{ backgroundColor: '#1c1917', color: '#ffffff', border: 'none' }}>
                    {createStandardItemMutation.isPending
                      ? (editingItem ? "Atualizando..." : "Criando...")
                      : (editingItem ? "Atualizar Modelo" : "Criar Modelo")
                    }
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* ── Main Table Card ── */}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '64px 0' }}>
          <div style={{ width: 32, height: 32, border: '3px solid #e7e5e4', borderTopColor: '#f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : standardItems.length === 0 ? (
        <div style={{
          backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 10,
          padding: '64px 32px', textAlign: 'center',
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
        }}>
          <Layers style={{ width: 40, height: 40, color: '#d4d0cc', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1917', margin: '0 0 6px' }}>Nenhum modelo criado</p>
          <p style={{ fontSize: 13, color: '#78716c', margin: '0 0 20px' }}>Crie modelos para reutilizar configurações de itens</p>
          <button
            onClick={() => setOpen(true)}
            style={{
              backgroundColor: '#1c1917', color: '#ffffff', border: 'none',
              borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            Criar Primeiro Modelo
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{
          backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 10,
          padding: '64px 32px', textAlign: 'center',
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
        }}>
          <Search style={{ width: 36, height: 36, color: '#d4d0cc', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1c1917', margin: '0 0 6px' }}>Nenhum resultado</p>
          <p style={{ fontSize: 13, color: '#78716c', margin: '0 0 20px' }}>Tente buscar com outro termo</p>
          <button onClick={() => setSearchTerm("")}
            style={{
              backgroundColor: 'transparent', color: '#44403c',
              border: '1px solid #e7e5e4', borderRadius: 8,
              padding: '7px 16px', fontSize: 13, cursor: 'pointer',
            }}
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <div style={{
          backgroundColor: '#ffffff', border: '1px solid #e7e5e4', borderRadius: 10,
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)', overflow: 'hidden',
        }}>
          {/* Counter strip */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid #e7e5e4', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers style={{ width: 14, height: 14, color: '#a8a29e' }} />
            <span style={{ fontSize: 12, color: '#78716c' }}>
              {filteredItems.length} modelo{filteredItems.length !== 1 ? 's' : ''}
              {searchTerm && <span style={{ color: '#a8a29e' }}> — filtrado de {standardItems.length}</span>}
            </span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#fafaf9', borderBottom: '1px solid #e7e5e4' }}>
                {['Nome', 'Tipo', 'Medidas', 'Material', 'Acabamento', isAdmin ? 'Ações' : ''].filter(Boolean).map((col) => (
                  <th key={col} style={{
                    padding: '9px 14px',
                    textAlign: col === 'Ações' ? 'right' : 'left',
                    fontSize: 11, fontWeight: 600, color: '#71717a',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const isHovered = hoveredRow === item.id;
                return (
                  <tr
                    key={item.id}
                    data-testid={`row-model-${item.id}`}
                    onMouseEnter={() => setHoveredRow(item.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      borderBottom: '1px solid #e7e5e4',
                      backgroundColor: isHovered ? '#fafaf9' : '#ffffff',
                      transition: 'background-color 0.12s',
                    }}
                  >
                    {/* Nome */}
                    <td style={{ padding: '11px 14px', minWidth: 180 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>{item.name}</span>
                      {item.hasVariableMeasurement && (
                        <span style={{
                          display: 'inline-block', marginLeft: 8,
                          fontSize: 10, fontWeight: 600, color: '#78716c',
                          backgroundColor: '#f5f5f4', borderRadius: 4,
                          padding: '1px 6px', letterSpacing: '0.04em', textTransform: 'uppercase',
                        }}>
                          Variável
                        </span>
                      )}
                    </td>

                    {/* Tipo */}
                    <td style={{ padding: '11px 14px' }}>
                      <span style={{
                        fontSize: 12, fontWeight: 500, color: '#44403c',
                        backgroundColor: '#f5f5f4', borderRadius: 5,
                        padding: '2px 8px', display: 'inline-block',
                      }}>
                        {item.type || <span style={{ color: '#a8a29e' }}>—</span>}
                      </span>
                    </td>

                    {/* Medidas (Área × Visual) */}
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      {item.hasVariableMeasurement ? (
                        <span style={{ fontSize: 12, color: '#a8a29e', fontStyle: 'italic' }}>Variável</span>
                      ) : (item.area || item.visual) ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Ruler style={{ width: 11, height: 11, color: '#a8a29e', flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>
                            {item.area ?? '—'}
                          </span>
                          <span style={{ fontSize: 12, color: '#a8a29e', fontWeight: 400 }}>×</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1c1917' }}>
                            {item.visual ?? '—'}
                          </span>
                          <span style={{ fontSize: 11, color: '#a8a29e' }}>m</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#a8a29e' }}>—</span>
                      )}
                    </td>

                    {/* Material */}
                    <td style={{ padding: '11px 14px' }}>
                      {item.material ? (
                        <span style={{
                          fontSize: 11, fontWeight: 500, color: '#44403c',
                          backgroundColor: '#f5f5f4', borderRadius: 5,
                          padding: '2px 8px', display: 'inline-block',
                        }}>
                          {item.material}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#d4d0cc' }}>—</span>
                      )}
                    </td>

                    {/* Acabamento */}
                    <td style={{ padding: '11px 14px' }}>
                      {item.finish ? (
                        <span style={{
                          fontSize: 11, fontWeight: 500, color: '#44403c',
                          backgroundColor: '#f5f5f4', borderRadius: 5,
                          padding: '2px 8px', display: 'inline-block',
                        }}>
                          {item.finish}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#d4d0cc' }}>—</span>
                      )}
                    </td>

                    {/* Ações (admin only) */}
                    {isAdmin && (
                      <td style={{ padding: '11px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <ActionButton
                          icon={<Pencil style={{ width: 14, height: 14 }} />}
                          hoverColor="#f97316"
                          onClick={() => handleEdit(item)}
                          testId={`button-edit-model-${item.id}`}
                          title="Editar modelo"
                        />
                        <ActionButton
                          icon={<Trash2 style={{ width: 14, height: 14 }} />}
                          hoverColor="#dc2626"
                          onClick={() => handleDelete(item)}
                          testId={`button-delete-model-${item.id}`}
                          title="Excluir modelo"
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent style={{ backgroundColor: '#fafaf9' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: '#1c1917', fontWeight: 700 }}>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription style={{ color: '#78716c' }}>
              Tem certeza que deseja excluir o modelo <strong style={{ color: '#1c1917' }}>{deleteConfirm?.name}</strong>?
              <br /><br />
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ borderColor: '#e7e5e4', color: '#44403c' }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteStandardItemMutation.isPending}
              style={{ backgroundColor: '#dc2626', color: '#ffffff', border: 'none' }}
              data-testid="button-confirm-delete-model"
            >
              <Trash2 style={{ width: 15, height: 15, marginRight: 6 }} />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ── Small helper: icon action button with hover color ── */
function ActionButton({
  icon, hoverColor, onClick, testId, title,
}: {
  icon: React.ReactNode;
  hoverColor: string;
  onClick: () => void;
  testId: string;
  title: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 6, border: 'none', cursor: 'pointer',
        backgroundColor: hovered ? `${hoverColor}15` : 'transparent',
        color: hovered ? hoverColor : '#a8a29e',
        transition: 'all 0.15s',
        marginLeft: 2,
      }}
    >
      {icon}
    </button>
  );
}
