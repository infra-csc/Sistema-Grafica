/**
 * FilterSelect — componente de filtro padrão do app.
 * Visual idêntico ao EventFilterDropdown: dropdown customizado com busca,
 * dots de cor, badges de contagem e destaque laranja quando ativo.
 *
 * Props preservadas para compatibilidade com todos os usos existentes:
 * label, allLabel, value, options, onChange, searchPlaceholder, emptyText,
 * hideWhenEmpty, panelWidth, testId, fullWidth, variant, triggerStyle,
 * triggerClassName, showAllLabelWhenEmpty, disabled, dotColor, count, group.
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  /** Bolinha colorida à esquerda (ex.: prioridade do evento). */
  dotColor?: string;
  /** Mantém a opção no topo, fora da ordenação alfabética. */
  pinned?: boolean;
  /** Agrupa a opção sob um cabeçalho. */
  group?: string;
}

interface FilterSelectProps {
  label: string;
  allLabel?: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  hideWhenEmpty?: boolean;
  panelWidth?: number;
  testId?: string;
  fullWidth?: boolean;
  /**
   * "pill" (padrão) — compacto com borda, igual a EventFilterDropdown.
   * "bare" — maior e sem borda, para cabeçalhos (ex.: Atendimento).
   */
  variant?: "pill" | "bare";
  triggerStyle?: React.CSSProperties;
  triggerClassName?: string;
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
  panelWidth,
  testId,
  fullWidth = false,
  variant = "pill",
  triggerStyle,
  triggerClassName,
  showAllLabelWhenEmpty = false,
  disabled = false,
}: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Ordenação: pinned primeiro, depois alfabético pt-BR
  const sorted = useMemo(() => {
    const pinned = options.filter(o => o.pinned);
    const rest = options
      .filter(o => !o.pinned)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    return [...pinned, ...rest];
  }, [options]);

  // Hook deve vir antes do return antecipado
  const hasGroups = sorted.some(o => o.group);
  const groupedEntries = useMemo(() => {
    if (!hasGroups) return [];
    const map = new Map<string, FilterOption[]>();
    sorted.forEach(o => {
      const g = o.group || "";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(o);
    });
    return Array.from(map.entries());
  }, [sorted, hasGroups]);

  if (hideWhenEmpty && sorted.length === 0) return null;

  const isActive = value !== "all";
  const selected = sorted.find(o => o.value === value);
  const emptyText_ = showAllLabelWhenEmpty ? (allLabel || label) : label;
  const triggerText = isActive ? (selected?.label ?? label) : emptyText_;

  // Filtragem por busca
  const searchTrimmed = search.trim().toLowerCase();
  const filteredSorted = searchTrimmed
    ? sorted.filter(o => o.label.toLowerCase().includes(searchTrimmed))
    : sorted;

  // ── Estilos do trigger ────────────────────────────────────────────────
  const pillTriggerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 6,
    height: fullWidth ? 36 : 36,
    padding: "0 10px 0 12px",
    backgroundColor: open || isActive ? "#FFF7ED" : "#ffffff",
    border: isActive ? "1.5px solid #FB923C" : open ? "1.5px solid #FB923C" : "1px solid #e2e8f0",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 13,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? "#C2410C" : "#1c1917",
    transition: "background 0.15s, border 0.15s, color 0.15s",
    outline: "none",
    whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 240 }),
    ...triggerStyle,
  };

  const bareTriggerStyle: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    border: "none",
    borderRadius: 8,
    backgroundColor: isActive ? "#FFF7ED" : "#ffffff",
    color: isActive ? "#C2410C" : "#1c1917",
    fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    outline: "none",
    whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...triggerStyle,
  };

  const resolvedTriggerStyle = triggerClassName
    ? { display: "flex", alignItems: "center", gap: 5, ...triggerStyle }
    : variant === "bare" ? bareTriggerStyle : pillTriggerStyle;

  const chevronSize = variant === "bare" ? 14 : 13;

  // ── Render de uma opção ───────────────────────────────────────────────
  const renderOption = (opt: FilterOption) => {
    const isSel = value === opt.value;
    return (
      <button
        key={opt.value}
        onClick={() => { if (!disabled) { onChange(opt.value); setSearch(""); setOpen(false); } }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", border: "none", cursor: "pointer", textAlign: "left",
          backgroundColor: isSel ? "#FFF7ED" : "transparent",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
        onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSel ? "#FFF7ED" : "transparent"; }}
      >
        {/* dot */}
        {(opt.dotColor || true) && (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            backgroundColor: opt.dotColor || (isSel ? "#F97316" : "#D1D5DB"),
          }} />
        )}
        {/* label */}
        <span style={{
          flex: 1, fontSize: 12, fontWeight: isSel ? 600 : 400,
          color: isSel ? "#C2410C" : "#374151",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {opt.label}
        </span>
        {/* count badge */}
        {opt.count !== undefined && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
            backgroundColor: isSel ? "#FB923C" : "#F3F4F6",
            color: isSel ? "#fff" : "#6B7280",
            flexShrink: 0,
          }}>
            {opt.count}
          </span>
        )}
        {/* check */}
        {isSel && <Check style={{ width: 12, height: 12, color: "#F97316", flexShrink: 0 }} />}
      </button>
    );
  };

  const allLabelText = allLabel || `Todos — ${label.toLowerCase()}`;
  const panelW = panelWidth ?? (fullWidth ? undefined : 280);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: fullWidth ? 0 : undefined, width: fullWidth ? "100%" : undefined }}>
      {/* ── Trigger ── */}
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        className={triggerClassName}
        title={isActive ? `${label}: ${triggerText}` : label}
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        style={resolvedTriggerStyle}
      >
        {isActive && selected?.dotColor && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: selected.dotColor, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: fullWidth ? 1 : undefined }}>
          {triggerText}
        </span>

        {isActive && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange("all"); setSearch(""); }}
            style={{ display: "flex", alignItems: "center", color: "#FB923C", marginLeft: 2, cursor: "pointer", flexShrink: 0 }}
            title="Limpar filtro"
          >
            <X style={{ width: 13, height: 13 }} />
          </span>
        )}

        <ChevronDown style={{
          width: chevronSize, height: chevronSize, flexShrink: 0, marginLeft: 2,
          color: isActive ? "#FB923C" : "#78716c",
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }} />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 9999,
          backgroundColor: "#fff", border: "1px solid #E5E7EB",
          borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          ...(panelW ? { width: panelW } : { minWidth: "100%" }),
          maxWidth: 360, overflow: "hidden",
        }}>
          {/* Search */}
          <div style={{ padding: "10px 10px 8px" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#9CA3AF" }} />
              <input
                autoFocus
                type="text"
                placeholder={searchPlaceholder || `Buscar ${label.toLowerCase()}...`}
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                  backgroundColor: "#F9FAFB", border: "1.5px solid #E5E7EB",
                  borderRadius: 6, fontSize: 12, color: "#111827", outline: "none",
                }}
                onFocus={e => { e.target.style.border = "1.5px solid #FB923C"; e.target.style.boxShadow = "0 0 0 3px rgba(251,146,60,0.15)"; }}
                onBlur={e => { e.target.style.border = "1.5px solid #E5E7EB"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 280, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
            {/* "Todos" row — só quando não busca */}
            {!searchTrimmed && (
              <button
                onClick={() => { onChange("all"); setSearch(""); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px", border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: value === "all" ? "#F97316" : "transparent",
                  color: value === "all" ? "#fff" : "#374151",
                  fontWeight: 700, fontSize: 12,
                  transition: "background 0.1s",
                  borderBottom: "1px solid #F3F4F6",
                }}
                onMouseEnter={e => { if (value !== "all") (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
                onMouseLeave={e => { if (value !== "all") (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <span style={{ flex: 1 }}>{allLabelText}</span>
                {value === "all" && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
              </button>
            )}

            {/* Opções */}
            {filteredSorted.length === 0 ? (
              <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>
                {emptyText}
              </div>
            ) : hasGroups ? (
              groupedEntries.map(([groupName, opts]) => (
                <div key={groupName || "__sem__"}>
                  {groupName && (
                    <div style={{ padding: "6px 12px 2px", fontSize: 10, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      {groupName}
                    </div>
                  )}
                  {opts.map(renderOption)}
                </div>
              ))
            ) : (
              filteredSorted.map(renderOption)
            )}
          </div>
        </div>
      )}
    </div>
  );
}
