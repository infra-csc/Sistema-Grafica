/**
 * FilterSelect — componente de filtro padrão do app.
 * Suporta seleção simples (value/onChange) e múltipla (values/onValuesChange).
 * accent="orange" (padrão) ou "violet" para contextos com tema violeta.
 */
import { useMemo, useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
  dotColor?: string;
  pinned?: boolean;
  group?: string;
}

interface FilterSelectProps {
  label: string;
  allLabel?: string;
  // ── Modo simples ─────────────────────────────────────────────────────
  value?: string;
  onChange?: (value: string) => void;
  // ── Modo múltiplo ────────────────────────────────────────────────────
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  // ─────────────────────────────────────────────────────────────────────
  options: FilterOption[];
  searchPlaceholder?: string;
  emptyText?: string;
  hideWhenEmpty?: boolean;
  panelWidth?: number;
  testId?: string;
  fullWidth?: boolean;
  variant?: "pill" | "bare";
  triggerStyle?: React.CSSProperties;
  triggerClassName?: string;
  showAllLabelWhenEmpty?: boolean;
  disabled?: boolean;
  dropdownAlign?: "left" | "right";
  hideClear?: boolean;
  accent?: "orange" | "violet";
}

export function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  values,
  onValuesChange,
  options,
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
  dropdownAlign = "left",
  hideClear = false,
  accent = "orange",
}: FilterSelectProps) {
  const multiple = values !== undefined && onValuesChange !== undefined;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  // Só a ALTURA muda no mobile (alvo de toque 44px) — componente compartilhado
  // por várias telas, qualquer outra mudança aqui vaza para todas elas.
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // ── Paleta de cor baseada no accent ───────────────────────────────────
  const C = accent === "violet" ? {
    bg50:    "#F5F3FF",
    border:  "#A78BFA",
    main:    "#7C3AED",
    badge:   "#7C3AED",
    text:    "#5B21B6",
    focus:   "rgba(124,58,237,0.15)",
  } : {
    bg50:    "#FFF7ED",
    border:  "#FB923C",
    main:    "#F97316",
    badge:   "#FB923C",
    text:    "#C2410C",
    focus:   "rgba(251,146,60,0.15)",
  };

  const sorted = useMemo(() => {
    const pinned = options.filter(o => o.pinned);
    const rest = options
      .filter(o => !o.pinned)
      .slice()
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
    return [...pinned, ...rest];
  }, [options]);

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

  // ── Estado activo ─────────────────────────────────────────────────────
  const isActive = multiple
    ? (values!.length > 0)
    : (value !== undefined && value !== "all");

  // ── Label do trigger ──────────────────────────────────────────────────
  const allLabelText = allLabel || `Todos — ${label.toLowerCase()}`;
  let triggerText: string;
  if (multiple) {
    if (values!.length === 0) {
      triggerText = allLabelText;
    } else if (values!.length === 1) {
      triggerText = sorted.find(o => o.value === values![0])?.label ?? values![0];
    } else {
      triggerText = `${values!.length} selecionados`;
    }
  } else {
    const selected = sorted.find(o => o.value === value);
    const emptyText_ = showAllLabelWhenEmpty ? allLabelText : label;
    triggerText = isActive ? (selected?.label ?? label) : emptyText_;
  }

  // ── dotColor do trigger (modo simples com 1 selecionado) ──────────────
  const triggerDot = !multiple && isActive
    ? sorted.find(o => o.value === value)?.dotColor
    : undefined;

  // ── Busca ─────────────────────────────────────────────────────────────
  const searchTrimmed = search.trim().toLowerCase();
  const filteredSorted = searchTrimmed
    ? sorted.filter(o => o.label.toLowerCase().includes(searchTrimmed))
    : sorted;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleSelectSingle = (v: string) => {
    onChange?.(v);
    setSearch("");
    setOpen(false);
  };

  const handleToggleMultiple = (v: string) => {
    const cur = values!;
    const next = cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v];
    onValuesChange!(next);
  };

  const handleClearMultiple = () => {
    onValuesChange!([]);
  };

  // ── Estilos ───────────────────────────────────────────────────────────
  const pillTrigger: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 6, height: isMobile ? 44 : 36,
    padding: "0 10px 0 12px",
    backgroundColor: open || isActive ? C.bg50 : "#ffffff",
    border: isActive ? `1.5px solid ${C.border}` : open ? `1.5px solid ${C.border}` : "1px solid #e7e5e4",
    borderRadius: 7,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 13, fontWeight: isActive ? 600 : 400,
    color: isActive ? C.text : "#1c1917",
    transition: "background 0.15s, border 0.15s, color 0.15s",
    outline: "none", whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...triggerStyle,
  };

  const bareTrigger: React.CSSProperties = {
    display: "flex", alignItems: "center",
    gap: 8, padding: "12px 16px",
    border: "none", borderRadius: 8,
    backgroundColor: isActive ? C.bg50 : "#ffffff",
    color: isActive ? C.text : "#1c1917",
    fontSize: 14, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    outline: "none", whiteSpace: "nowrap",
    ...(fullWidth ? { width: "100%", justifyContent: "space-between" } : { maxWidth: 260 }),
    ...triggerStyle,
  };

  const resolvedTrigger = triggerClassName
    ? { display: "flex", alignItems: "center", gap: 5, ...triggerStyle }
    : variant === "bare" ? bareTrigger : pillTrigger;

  // ── Render opção ──────────────────────────────────────────────────────
  const renderOption = (opt: FilterOption) => {
    const isSel = multiple ? values!.includes(opt.value) : value === opt.value;
    return (
      <button
        key={opt.value}
        onClick={() => {
          if (disabled) return;
          if (multiple) {
            handleToggleMultiple(opt.value);
          } else {
            handleSelectSingle(opt.value);
          }
        }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", border: "none", cursor: "pointer", textAlign: "left",
          backgroundColor: isSel ? C.bg50 : "transparent",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSel ? C.bg50 : "transparent"; }}
      >
        {/* Checkbox (multi) ou dot (single) */}
        {multiple ? (
          <span style={{
            width: 16, height: 16, borderRadius: 4, flexShrink: 0,
            border: isSel ? "none" : "1.5px solid #D1D5DB",
            backgroundColor: isSel ? C.main : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isSel && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
          </span>
        ) : (
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            backgroundColor: opt.dotColor || (isSel ? C.main : "#D1D5DB"),
          }} />
        )}

        {/* Label */}
        <span style={{
          flex: 1, fontSize: 12, fontWeight: isSel ? 600 : 400,
          color: isSel ? C.text : "#374151",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {opt.label}
        </span>

        {/* Count badge */}
        {opt.count !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
            backgroundColor: isSel ? C.badge : "#F3F4F6",
            color: isSel ? "#fff" : "#6B7280", flexShrink: 0,
          }}>
            {opt.count}
          </span>
        )}

        {/* Check mark (modo simples) */}
        {!multiple && isSel && <Check style={{ width: 12, height: 12, color: C.main, flexShrink: 0 }} />}
      </button>
    );
  };

  const panelW = panelWidth ?? (fullWidth ? undefined : 280);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: fullWidth ? 0 : undefined, width: fullWidth ? "100%" : undefined }}>
      {/* ── Trigger ── */}
      <button
        type="button"
        disabled={disabled}
        data-testid={testId}
        className={triggerClassName}
        title={isActive ? triggerText : label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => { if (!disabled) setOpen(v => !v); }}
        style={resolvedTrigger}
      >
        {triggerDot && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: triggerDot, flexShrink: 0 }} />
        )}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: fullWidth ? 1 : undefined }}>
          {triggerText}
        </span>

        {/* Badge de contagem (multi, 2+) */}
        {multiple && values!.length > 1 && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99,
            backgroundColor: C.badge, color: "#fff", flexShrink: 0, marginLeft: 2,
          }}>
            {values!.length}
          </span>
        )}

        {/* Botão X — limpar */}
        {isActive && !hideClear && (
          <span
            role="button"
            // tabIndex + Enter/Espaço: o × fica dentro do <button> do trigger
            // (aninhado), então sem isto era inoperável por teclado.
            tabIndex={0}
            aria-label="Limpar filtro"
            onClick={e => {
              e.stopPropagation();
              if (multiple) handleClearMultiple();
              else onChange?.("all");
              setSearch("");
            }}
            onKeyDown={e => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault(); e.stopPropagation();
                if (multiple) handleClearMultiple();
                else onChange?.("all");
                setSearch("");
              }
            }}
            style={{ display: "flex", alignItems: "center", color: C.border, marginLeft: 2, cursor: "pointer", flexShrink: 0 }}
            title="Limpar filtro"
          >
            <X style={{ width: 13, height: 13 }} />
          </span>
        )}

        <ChevronDown style={{
          width: variant === "bare" ? 14 : 13, height: variant === "bare" ? 14 : 13,
          flexShrink: 0, marginLeft: 2,
          color: isActive ? C.border : "#78716c",
          transition: "transform 0.2s",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
        }} />
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", ...(dropdownAlign === "right" ? { right: 0 } : { left: 0 }), zIndex: 9999,
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
                onFocus={e => { e.target.style.border = `1.5px solid ${C.border}`; e.target.style.boxShadow = `0 0 0 3px ${C.focus}`; }}
                onBlur={e => { e.target.style.border = "1.5px solid #E5E7EB"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{ maxHeight: 280, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent" }}>
            {/* "Todos" row */}
            {!searchTrimmed && (
              <button
                onClick={() => {
                  if (multiple) {
                    handleClearMultiple();
                  } else {
                    handleSelectSingle("all");
                  }
                }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px", border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: !isActive ? C.main : "transparent",
                  color: !isActive ? "#fff" : "#374151",
                  fontWeight: 700, fontSize: 12,
                  transition: "background 0.1s",
                  borderBottom: "1px solid #F3F4F6",
                }}
                onMouseEnter={e => { if (isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
                onMouseLeave={e => { if (isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                {multiple && (
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: !isActive ? "none" : "1.5px solid #D1D5DB",
                    backgroundColor: !isActive ? "#fff" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {!isActive && <Check style={{ width: 10, height: 10, color: C.main }} />}
                  </span>
                )}
                <span style={{ flex: 1 }}>{allLabelText}</span>
                {!multiple && !isActive && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
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
                    <div style={{ padding: "6px 12px 2px", fontSize: 11, fontWeight: 700, color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.05em" }}>
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

          {/* Footer — modo múltiplo com seleção ativa */}
          {multiple && values!.length > 0 && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#746e69" }}>
                {values!.length} {values!.length === 1 ? "selecionado" : "selecionados"}
              </span>
              <button
                onClick={handleClearMultiple}
                style={{ fontSize: 11, fontWeight: 700, color: C.main, background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}
              >
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
