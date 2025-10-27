import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Copy, Trash2, Save, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

interface BulkItemRow {
  id: string;
  type: string;
  description: string;
  quantity: string;
  area: string;
  visual: string;
  visualWidth: string;
  visualHeight: string;
  fileWidth: string;
  fileHeight: string;
  material: string;
  finish: string;
  measurement: string;
  observations: string;
  calculatedM2: number;
}

interface StandardItem {
  id: string;
  name: string;
  type: string;
  area: number;
  visual: number;
  material?: string | null;
  finish?: string | null;
}

interface BulkItemEntryProps {
  eventId: string;
  standardItems?: StandardItem[];
  onSubmit: (items: any[]) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function BulkItemEntry({ eventId, standardItems = [], onSubmit, onCancel, isPending }: BulkItemEntryProps) {
  const [rows, setRows] = useState<BulkItemRow[]>([createEmptyRow()]);
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});

  function createEmptyRow(): BulkItemRow {
    return {
      id: Math.random().toString(36).substring(7),
      type: "",
      description: "",
      quantity: "1",
      area: "",
      visual: "",
      visualWidth: "",
      visualHeight: "",
      fileWidth: "",
      fileHeight: "",
      material: "",
      finish: "",
      measurement: "",
      observations: "",
      calculatedM2: 0,
    };
  }

  function calculateM2(quantity: string, area: string, visual: string): number {
    const q = parseFloat(quantity) || 0;
    const a = parseFloat(area) || 0;
    const v = parseFloat(visual) || 0;
    return q * a * v;
  }

  function updateRow(id: string, field: keyof BulkItemRow, value: string) {
    setRows(prevRows => 
      prevRows.map(row => {
        if (row.id !== id) return row;
        
        const updated = { ...row, [field]: value };
        
        // Se mudou o tipo, verificar se é um modelo padrão
        if (field === 'type') {
          const standardItem = standardItems.find(s => s.name === value || s.type === value);
          if (standardItem) {
            // Preencher com dados do modelo
            updated.type = value; // Manter o nome do modelo como tipo
            // Converter Decimal para string
            const area = standardItem.area ? String(standardItem.area) : "";
            const visual = standardItem.visual ? String(standardItem.visual) : "";
            updated.area = area;
            updated.visual = visual;
            // Usar material e acabamento do modelo (se existir)
            updated.material = standardItem.material || "";
            updated.finish = standardItem.finish || "";
            updated.measurement = area && visual ? `${area} × ${visual}` : "";
            updated.calculatedM2 = calculateM2(updated.quantity, area, visual);
          }
        }
        
        // Recalcular m² se alterou quantidade, área ou visual
        if (field === 'quantity' || field === 'area' || field === 'visual') {
          updated.calculatedM2 = calculateM2(updated.quantity, updated.area, updated.visual);
          // Atualizar medida automaticamente se não foi editada manualmente
          if (!updated.measurement || updated.measurement === `${row.area} × ${row.visual}`) {
            updated.measurement = `${updated.area} × ${updated.visual}`;
          }
        }
        
        return updated;
      })
    );
  }

  function addRow() {
    setRows(prev => [...prev, createEmptyRow()]);
  }

  function duplicateRow(id: string) {
    const rowToDuplicate = rows.find(r => r.id === id);
    if (rowToDuplicate) {
      setRows(prev => [
        ...prev,
        { ...rowToDuplicate, id: Math.random().toString(36).substring(7) }
      ]);
    }
  }

  function removeRow(id: string) {
    if (rows.length === 1) return; // Manter pelo menos uma linha
    setRows(prev => prev.filter(r => r.id !== id));
  }

  function handleSubmit() {
    // Validar e preparar dados
    const validItems = rows
      .filter(row => 
        row.type && 
        parseFloat(row.quantity) > 0 && 
        parseFloat(row.area) > 0 && 
        parseFloat(row.visual) > 0 && 
        row.material && 
        row.finish
      )
      .map(row => ({
        eventId,
        type: row.type,
        description: row.description || "",
        quantity: parseInt(row.quantity),
        area: parseFloat(row.area),
        visual: parseFloat(row.visual),
        material: row.material,
        finish: row.finish,
        measurement: row.measurement || `${row.area} × ${row.visual}`,
        observations: row.observations || "",
        calculatedM2: row.calculatedM2,
        status: "requested",
      }));

    if (validItems.length === 0) {
      alert("Preencha pelo menos um item completo antes de salvar.");
      return;
    }

    onSubmit(validItems);
  }

  const totalM2 = rows.reduce((sum, row) => sum + row.calculatedM2, 0);
  const validRowsCount = rows.filter(row => 
    row.type && parseFloat(row.quantity) > 0 && parseFloat(row.area) > 0 && parseFloat(row.visual) > 0 && row.material && row.finish
  ).length;

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Entrada Rápida de Itens</h3>
          <p className="text-sm text-muted-foreground">
            Adicione múltiplos itens de uma vez. Preencha a tabela e clique em "Salvar Todos".
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-muted-foreground">Total Geral</div>
          <div className="text-2xl font-bold text-primary">{totalM2.toFixed(2)} m²</div>
          <div className="text-xs text-muted-foreground">{validRowsCount} item{validRowsCount !== 1 ? 's' : ''} válido{validRowsCount !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[40px]">#</th>
              <th className="p-2 text-left font-medium whitespace-nowrap min-w-[120px]">Tipo*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap min-w-[150px]">Descrição</th>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[80px]">Qtd*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[80px]">Área*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[80px]">Visual*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[90px]" colSpan={2}>Área Visual</th>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[100px]" colSpan={2}>Medida do arquivo</th>
              <th className="p-2 text-left font-medium whitespace-nowrap min-w-[120px]">Material*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap min-w-[120px]">Acabamento*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap w-[100px]">m² (auto)</th>
              <th className="p-2 text-left font-medium whitespace-nowrap min-w-[150px]">Observações</th>
              <th className="p-2 text-center font-medium whitespace-nowrap w-[100px]">Ações</th>
            </tr>
            <tr>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2 text-left text-xs font-normal">Largura</th>
              <th className="p-2 text-left text-xs font-normal">Altura</th>
              <th className="p-2 text-left text-xs font-normal">Largura</th>
              <th className="p-2 text-left text-xs font-normal">Altura</th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className={cn("border-t", index % 2 === 0 ? "bg-card" : "bg-muted/20")}>
                <td className="p-2 text-center text-muted-foreground font-medium">{index + 1}</td>
                
                {/* Tipo */}
                <td className="p-2">
                  <Popover 
                    open={openPopovers[row.id]} 
                    onOpenChange={(open) => setOpenPopovers(prev => ({ ...prev, [row.id]: open }))}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openPopovers[row.id]}
                        className="h-8 w-full justify-between font-normal"
                        data-testid={`select-type-${index}`}
                      >
                        <span className="truncate">
                          {row.type || "Selecione"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar tipo..." />
                        <CommandList>
                          <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                          {standardItems.length > 0 && (
                            <CommandGroup heading="Modelos">
                              {standardItems.map(item => (
                                <CommandItem
                                  key={item.id}
                                  value={item.name}
                                  onSelect={() => {
                                    updateRow(row.id, 'type', item.name);
                                    setOpenPopovers(prev => ({ ...prev, [row.id]: false }));
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      row.type === item.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {item.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          <CommandGroup heading="Outros Tipos">
                            {itemTypes.map(type => (
                              <CommandItem
                                key={type}
                                value={type}
                                onSelect={() => {
                                  updateRow(row.id, 'type', type);
                                  setOpenPopovers(prev => ({ ...prev, [row.id]: false }));
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    row.type === type ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {type}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </td>

                {/* Descrição */}
                <td className="p-2">
                  <Input
                    type="text"
                    value={row.description}
                    onChange={(e) => updateRow(row.id, 'description', e.target.value)}
                    className="h-8"
                    placeholder="Opcional"
                    data-testid={`input-description-${index}`}
                  />
                </td>

                {/* Quantidade */}
                <td className="p-2">
                  <Input
                    type="number"
                    min="1"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, 'quantity', e.target.value)}
                    className="h-8"
                    data-testid={`input-quantity-${index}`}
                  />
                </td>

                {/* Área */}
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.area}
                    onChange={(e) => updateRow(row.id, 'area', e.target.value)}
                    className="h-8"
                    placeholder="0.00"
                    data-testid={`input-area-${index}`}
                  />
                </td>

                {/* Visual */}
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.visual}
                    onChange={(e) => updateRow(row.id, 'visual', e.target.value)}
                    className="h-8"
                    placeholder="0.00"
                    data-testid={`input-visual-${index}`}
                  />
                </td>

                {/* Área Visual - Largura */}
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.visualWidth}
                    onChange={(e) => updateRow(row.id, 'visualWidth', e.target.value)}
                    className="h-8"
                    placeholder="0.00"
                    data-testid={`input-visual-width-${index}`}
                  />
                </td>

                {/* Área Visual - Altura */}
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.visualHeight}
                    onChange={(e) => updateRow(row.id, 'visualHeight', e.target.value)}
                    className="h-8"
                    placeholder="0.00"
                    data-testid={`input-visual-height-${index}`}
                  />
                </td>

                {/* Medida do arquivo - Largura */}
                <td className="p-2">
                  <Input
                    type="number"
                    min="0"
                    value={row.fileWidth}
                    onChange={(e) => updateRow(row.id, 'fileWidth', e.target.value)}
                    className="h-8"
                    placeholder="px"
                    data-testid={`input-file-width-${index}`}
                  />
                </td>

                {/* Medida do arquivo - Altura */}
                <td className="p-2">
                  <Input
                    type="number"
                    min="0"
                    value={row.fileHeight}
                    onChange={(e) => updateRow(row.id, 'fileHeight', e.target.value)}
                    className="h-8"
                    placeholder="px"
                    data-testid={`input-file-height-${index}`}
                  />
                </td>

                {/* Material */}
                <td className="p-2">
                  <Select 
                    value={row.material} 
                    onValueChange={(value) => updateRow(row.id, 'material', value)}
                  >
                    <SelectTrigger className="h-8" data-testid={`select-material-${index}`}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map(material => (
                        <SelectItem key={material} value={material}>{material}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* Acabamento */}
                <td className="p-2">
                  <Select 
                    value={row.finish} 
                    onValueChange={(value) => updateRow(row.id, 'finish', value)}
                  >
                    <SelectTrigger className="h-8" data-testid={`select-finish-${index}`}>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {finishes.map(finish => (
                        <SelectItem key={finish} value={finish}>{finish}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>

                {/* m² calculado */}
                <td className="p-2 text-center font-semibold text-primary">
                  {row.calculatedM2.toFixed(2)}
                </td>

                {/* Observações */}
                <td className="p-2">
                  <Input
                    type="text"
                    value={row.observations}
                    onChange={(e) => updateRow(row.id, 'observations', e.target.value)}
                    className="h-8"
                    placeholder="Opcional"
                    data-testid={`input-observations-${index}`}
                  />
                </td>

                {/* Ações */}
                <td className="p-2">
                  <div className="flex items-center justify-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => duplicateRow(row.id)}
                      title="Duplicar linha"
                      className="h-7 w-7"
                      data-testid={`button-duplicate-${index}`}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      title="Remover linha"
                      className="h-7 w-7"
                      data-testid={`button-remove-${index}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Botões de ação */}
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={addRow}
          data-testid="button-add-row"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Linha
        </Button>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || validRowsCount === 0}
            data-testid="button-save-all"
          >
            <Save className="h-4 w-4 mr-2" />
            {isPending ? "Salvando..." : `Salvar Todos (${validRowsCount})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
