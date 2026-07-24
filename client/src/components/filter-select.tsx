// Filtro padrão do app: um único componente para todas as telas, no lugar da
// mistura de <select> nativo (não busca, corta texto) com comboboxes ad-hoc.
//
// Garante em todo lugar: busca, ordem alfabética (pt-BR), contagem por opção,
// texto que não corta e destaque quando o filtro está ativo. As opções devem
// ser montadas a partir dos itens visíveis na fase/aba atual, para não listar
// valores que não existem ali.
import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  /** Bolinha colorida à esquerda (ex.: prioridade do evento). */
  dotColor?: string;
  /** Mantém a opção no topo, fora da ordenação alfabética. */
  pinned?: boolean;
}

interface FilterSelectProps {
  /** Texto do botão quando nada está selecionado (ex.: "Evento"). */
  label: string;
  /** Texto da opção que limpa o filtro (ex.: "Todos os eventos"). */
  allLabel?: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Some quando não há opções (padrão: true). */
  hideWhenEmpty?: boolean;
  panelWidth?: number;
  testId?: string;
  /** Ocupa a largura do container — para uso dentro de formulários/modais. */
  fullWidth?: boolean;
  /**
   * Aparência, para respeitar o layout de cada tela:
   * - "pill": compacto com borda (barras de filtro da Arte, Gráfica, Eventos…)
   * - "bare": maior e sem borda (cabeçalho do Atendimento)
   */
  variant?: "pill" | "bare";
  /**
   * Ajuste fino da aparência do botão, para casar com o layout da tela
   * (ex.: fundo cinza da Gráfica). O comportamento continua padronizado.
   */
  triggerStyle?: React.CSSProperties;
  /** Mostra sempre o allLabel no botão em vez do label curto (modo formulário). */
  showAllLabelWhenEmpty?: boolean;
  disabled?: boolean;
}

export function FilterSelect({
  label,
  allLabel,
  value,
  options,
  onChange,
  searchPlaceholder,
  emptyText = "Nada encontrado.",
  hideWhenEmpty = true,
  panelWidth = 280,
  testId,
  fullWidth = false,
  variant = "pill",
  triggerStyle,
  showAllLabelWhenEmpty = false,
  disabled = false,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);

  const sorted = useMemo(() => {
    const pinned = options.filter(o => o.pinned);
    const rest = options
      .filter(o => !o.pinned)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    return [...pinned, ...rest];
  }, [options]);

  if (hideWhenEmpty && sorted.length === 0) return null;

  const isActive = value !== "all";
  const selected = sorted.find(o => o.value === value);
  const emptyText_ = showAllLabelWhenEmpty ? (allLabel || label) : label;
  const triggerText = isActive ? (selected?.label ?? label) : emptyText_;

  return (
    <Popover open={open} onOpenChange={o => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={testId}
          title={isActive ? `${label}: ${triggerText}` : label}
          style={{
            display: "flex", alignItems: "center",
            gap: variant === "bare" ? 8 : 5,
            borderRadius: 8,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
            outline: "none",
            ...(variant === "bare"
              ? {
                  padding: "12px 16px",
                  border: "none",
                  background: isActive ? "#fff7ed" : "#ffffff",
                  color: isActive ? "#c2410c" : "#1c1917",
                  fontSize: 14, fontWeight: 600,
                }
              : {
                  height: fullWidth ? 36 : 34,
                  paddingLeft: 10, paddingRight: 8,
                  border: `1px solid ${isActive ? "#f97316" : "#e7e5e4"}`,
                  background: isActive ? "#fff7ed" : "#ffffff",
                  color: isActive ? "#c2410c" : "#44403c",
                  fontSize: 12, fontWeight: fullWidth ? 600 : 500,
                }),
            ...(fullWidth
              ? { width: "100%", justifyContent: "space-between" }
              : { maxWidth: variant === "bare" ? 260 : 210 }),
            ...triggerStyle,
          }}
        >
          {isActive && selected?.dotColor && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: selected.dotColor, flexShrink: 0 }} />
          )}
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{triggerText}</span>
          <ChevronDown
            style={variant === "bare"
              ? { width: 14, height: 14, color: "#a8a29e", flexShrink: 0 }
              : { width: 10, height: 10, opacity: 0.5, flexShrink: 0 }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" style={{ width: panelWidth, padding: 0 }}>
        <Command>
          <CommandInput placeholder={searchPlaceholder || `Buscar ${label.toLowerCase()}...`} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__all__" onSelect={() => { onChange("all"); setOpen(false); }}>
                <Check className={cn("mr-2 h-4 w-4 flex-shrink-0", value === "all" ? "opacity-100" : "opacity-0")} />
                <span style={{ flex: 1 }}>{allLabel || `Todos — ${label.toLowerCase()}`}</span>
              </CommandItem>
              {sorted.map(opt => (
                <CommandItem
                  key={opt.value}
                  // Inclui o label na busca (o value pode ser um id).
                  value={`${opt.label} ${opt.value}`}
                  onSelect={() => { onChange(opt.value); setOpen(false); }}
                >
                  <Check className={cn("mr-2 h-4 w-4 flex-shrink-0", value === opt.value ? "opacity-100" : "opacity-0")} />
                  {opt.dotColor && (
                    <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: opt.dotColor, marginRight: 6, flexShrink: 0 }} />
                  )}
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "normal", wordBreak: "break-word" }}>{opt.label}</span>
                  {opt.count !== undefined && (
                    <span style={{ marginLeft: 8, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#78716c", backgroundColor: "#f5f4f2", borderRadius: 9999, padding: "1px 7px" }}>
                      {opt.count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
