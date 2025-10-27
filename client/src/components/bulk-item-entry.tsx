import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Copy, Trash2, Save, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculateM2FromStrings } from "@/lib/calculateM2";

const itemTypes = ["2x1", "Arena", "Halter", "Palco", "Painel Rosto", "Percurso", "Pórtico", "Prismas", "Qd Fotos", "Rolo", "Stand", "Testeiras", "WindBanner"];
const materials = ["Adesivo", "Lona", "Sanett", "Tecido"];
const finishes = ["Dupla Face", "Ilhós", "Impresso", "Recorte", "Refile"];

interface BulkItemRow {
  id: string;
  type: string;
  description: string;
  quantity: string;
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
  visualWidth?: number | null;
  visualHeight?: number | null;
  fileWidth?: number | null;
  fileHeight?: number | null;
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

  function updateRow(id: string, field: keyof BulkItemRow, value: string) {
    setRows(prevRows => 
      prevRows.map(row => {
        if (row.id !== id) return row;
        
        const updated = { ...row, [field]: value };
        
        // Se mudou o tipo, verificar se é um modelo padrão
        if (field === 'type') {
          const standardItem = standardItems.find(s => s.name === value || s.type === value);
          if (standardItem) {
            // Preencher com dados do modelo (com fallback para area/visual)
            updated.type = value;
            const vw = standardItem.visualWidth 
              ? String(standardItem.visualWidth) 
              : (standardItem.area ? String(standardItem.area) : "");
            const vh = standardItem.visualHeight 
              ? String(standardItem.visualHeight) 
              : (standardItem.visual ? String(standardItem.visual) : "");
            const fw = standardItem.fileWidth ? String(standardItem.fileWidth) : "";
            const fh = standardItem.fileHeight ? String(standardItem.fileHeight) : "";
            updated.visualWidth = vw;
            updated.visualHeight = vh;
            updated.fileWidth = fw;
            updated.fileHeight = fh;
            updated.material = standardItem.material || "";
            updated.finish = standardItem.finish || "";
            updated.measurement = fw && fh ? `${fw} × ${fh}` : "";
            updated.calculatedM2 = calculateM2FromStrings(updated.quantity, fw, fh);
          }
        }
        
        // Recalcular m² se alterou quantidade, fileWidth ou fileHeight
        if (field === 'quantity' || field === 'fileWidth' || field === 'fileHeight') {
          updated.calculatedM2 = calculateM2FromStrings(updated.quantity, updated.fileWidth, updated.fileHeight);
          if (!updated.measurement || updated.measurement === `${row.fileWidth} × ${row.fileHeight}`) {
            updated.measurement = `${updated.fileWidth} × ${updated.fileHeight}`;
          }
        }
        
        return updated;
      })
    );
  }

  function addRow() {
    setRows(prev => [...prev, createEmptyRow()]);
  }

  function removeRow(id: string) {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(row => row.id !== id));
  }

  function duplicateRow(id: string) {
    const rowToDuplicate = rows.find(r => r.id === id);
    if (!rowToDuplicate) return;
    
    const newRow = {
      ...rowToDuplicate,
      id: Math.random().toString(36).substring(7),
    };
    
    setRows(prev => {
      const index = prev.findIndex(r => r.id === id);
      const newRows = [...prev];
      newRows.splice(index + 1, 0, newRow);
      return newRows;
    });
  }

  function handleSubmit() {
    const validItems = rows
      .filter(row => 
        row.type && 
        parseFloat(row.quantity) > 0 && 
        parseFloat(row.visualWidth) > 0 && 
        parseFloat(row.visualHeight) > 0 && 
        parseFloat(row.fileWidth) > 0 && 
        parseFloat(row.fileHeight) > 0 && 
        row.material && 
        row.finish
      )
      .map(row => ({
        eventId,
        type: row.type,
        description: row.description || "",
        quantity: parseInt(row.quantity),
        area: parseFloat(row.visualWidth),  // Usar visualWidth como area para compatibilidade com backend
        visual: parseFloat(row.visualHeight),  // Usar visualHeight como visual para compatibilidade com backend
        visualWidth: parseFloat(row.visualWidth),
        visualHeight: parseFloat(row.visualHeight),
        fileWidth: parseFloat(row.fileWidth),
        fileHeight: parseFloat(row.fileHeight),
        material: row.material,
        finish: row.finish,
        measurement: row.measurement || `${row.fileWidth} × ${row.fileHeight}`,
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
    row.type && parseFloat(row.quantity) > 0 && parseFloat(row.visualWidth) > 0 && parseFloat(row.visualHeight) > 0 && parseFloat(row.fileWidth) > 0 && parseFloat(row.fileHeight) > 0 && row.material && row.finish
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
          <colgroup>
            <col style={{ width: '35px' }} />
            <col style={{ width: '120px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '55px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '85px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '110px' }} />
            <col style={{ width: '80px' }} />
            <col style={{ width: '150px' }} />
            <col style={{ width: '75px' }} />
          </colgroup>
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="p-2 text-left font-medium whitespace-nowrap">#</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">Tipo*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">Descrição</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">Qtd*</th>
              <th className="p-2 text-center font-medium whitespace-nowrap" colSpan={2}>Área Visual (m)*</th>
              <th className="p-2 text-center font-medium whitespace-nowrap" colSpan={2}>Medida do arquivo (m)*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">Material*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">Acabamento*</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">m² (auto)</th>
              <th className="p-2 text-left font-medium whitespace-nowrap">Observações</th>
              <th className="p-2 text-center font-medium whitespace-nowrap">Ações</th>
            </tr>
            <tr>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2"></th>
              <th className="p-2 text-left text-xs font-normal text-muted-foreground">Largura</th>
              <th className="p-2 text-left text-xs font-normal text-muted-foreground">Altura</th>
              <th className="p-2 text-left text-xs font-normal text-muted-foreground">Largura</th>
              <th className="p-2 text-left text-xs font-normal text-muted-foreground">Altura</th>
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
                    className="h-8 w-20"
                    placeholder="1"
                    data-testid={`input-quantity-${index}`}
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
                    className="h-8 w-24"
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
                    className="h-8 w-24"
                    placeholder="0.00"
                    data-testid={`input-visual-height-${index}`}
                  />
                </td>

                {/* Medida do arquivo - Largura */}
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.fileWidth}
                    onChange={(e) => updateRow(row.id, 'fileWidth', e.target.value)}
                    className="h-8 w-24"
                    placeholder="0.00"
                    data-testid={`input-file-width-${index}`}
                  />
                </td>

                {/* Medida do arquivo - Altura */}
                <td className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.fileHeight}
                    onChange={(e) => updateRow(row.id, 'fileHeight', e.target.value)}
                    className="h-8 w-24"
                    placeholder="0.00"
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

      {/* Rodapé com botões de ação */}
      <div className="flex items-center justify-between pt-2 border-t">
        <Button
          variant="outline"
          size="sm"
          onClick={addRow}
          data-testid="button-add-row"
        >
          <Plus className="mr-2 h-4 w-4" />
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
            <Save className="mr-2 h-4 w-4" />
            Salvar Todos ({validRowsCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
