/**
 * EventFilterDropdown — dropdown de filtro por evento com multi-seleção.
 * Modo simples: value/onChange. Modo múltiplo: values/onValuesChange.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface EventOption {
  value: string;
  label: string;
  count?: number;
  dotColor?: string;
}

interface Props {
  // Modo simples
  value?: string;
  onChange?: (v: string) => void;
  // Modo múltiplo
  values?: string[];
  onValuesChange?: (v: string[]) => void;
  options: EventOption[];
  allLabel?: string;
}

export function EventFilterDropdown({
  value,
  onChange,
  values,
  onValuesChange,
  options,
  allLabel = "Todos os Eventos",
}: Props) {
  const multiple = values !== undefined && onValuesChange !== undefined;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Ordenação alfabética pt-BR
  const sortedOptions = useMemo(() =>
    [...options].sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" })),
    [options]
  );

  const filtered = search.trim()
    ? sortedOptions.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : sortedOptions;

  // ── Estado ativo ──────────────────────────────────────────────────────
  const isActive = multiple ? values!.length > 0 : (value !== undefined && value !== "all");

  // ── Label do trigger ──────────────────────────────────────────────────
  let triggerLabel: string;
  if (multiple) {
    if (values!.length === 0) triggerLabel = allLabel;
    else if (values!.length === 1) triggerLabel = sortedOptions.find(o => o.value === values![0])?.label ?? values![0];
    else triggerLabel = `${values!.length} eventos`;
  } else {
    const selected = sortedOptions.find(o => o.value === value);
    triggerLabel = selected ? selected.label : allLabel;
  }

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleSelectSingle = (v: string) => { onChange?.(v); setSearch(""); setOpen(false); };
  const handleToggleMultiple = (v: string) => {
    const cur = values!;
    onValuesChange!(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
  };
  const handleClear = () => {
    if (multiple) onValuesChange!([]);
    else onChange?.("all");
    setSearch("");
  };

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* ── Trigger ── */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 36, padding: "0 10px 0 12px",
          backgroundColor: open || isActive ? "#FFF7ED" : "#ffffff",
          border: isActive ? "1.5px solid #FB923C" : open ? "1.5px solid #FB923C" : "1px solid #e7e5e4",
          borderRadius: 7, cursor: "pointer",
          fontSize: 13, fontWeight: isActive ? 600 : 400,
          color: isActive ? "#C2410C" : "#1c1917",
          transition: "background 0.15s, border 0.15s, color 0.15s",
          maxWidth: 260, outline: "none", whiteSpace: "nowrap",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 }}>
          {triggerLabel}
        </span>

        {/* Badge de contagem (2+) */}
        {multiple && values!.length > 1 && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, backgroundColor: "#c2410c", color: "#fff", flexShrink: 0 }}>
            {values!.length}
          </span>
        )}

        {isActive && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); handleClear(); }}
            style={{ display: "flex", alignItems: "center", color: "#FB923C", marginLeft: 2, cursor: "pointer", flexShrink: 0 }}
            title="Limpar filtro"
          >
            <X style={{ width: 13, height: 13 }} />
          </span>
        )}

        <ChevronDown style={{
          width: 14, height: 14, flexShrink: 0, marginLeft: 2,
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
          minWidth: 260, maxWidth: 340, overflow: "hidden",
        }}>
          {/* Search */}
          <div style={{ padding: "10px 10px 8px" }}>
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: "#9CA3AF" }} />
              <input
                autoFocus type="text" placeholder="Buscar evento..."
                value={search} onChange={e => setSearch(e.target.value)}
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
            {/* "Todos" row */}
            {!search.trim() && (
              <button
                onClick={() => { if (multiple) { onValuesChange!([]); } else { handleSelectSingle("all"); } }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px", border: "none", cursor: "pointer", textAlign: "left",
                  backgroundColor: !isActive ? "#F97316" : "transparent",
                  color: !isActive ? "#fff" : "#374151",
                  fontWeight: 700, fontSize: 12, transition: "background 0.1s",
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
                    {!isActive && <Check style={{ width: 10, height: 10, color: "#F97316" }} />}
                  </span>
                )}
                <span style={{ flex: 1 }}>{allLabel}</span>
                {!multiple && !isActive && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
              </button>
            )}

            {/* Event rows */}
            {filtered.length === 0 ? (
              <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>
                Nenhum evento encontrado
              </div>
            ) : filtered.map(opt => {
              const isSel = multiple ? values!.includes(opt.value) : value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { if (multiple) handleToggleMultiple(opt.value); else handleSelectSingle(opt.value); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 12px", border: "none", cursor: "pointer", textAlign: "left",
                    backgroundColor: isSel ? "#FFF7ED" : "transparent", transition: "background 0.1s",
                  }}
                  onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSel ? "#FFF7ED" : "transparent"; }}
                >
                  {multiple ? (
                    <span style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      border: isSel ? "none" : "1.5px solid #D1D5DB",
                      backgroundColor: isSel ? "#F97316" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isSel && <Check style={{ width: 10, height: 10, color: "#fff" }} />}
                    </span>
                  ) : (
                    <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: opt.dotColor || (isSel ? "#F97316" : "#D1D5DB") }} />
                  )}

                  <span style={{ flex: 1, fontSize: 12, fontWeight: isSel ? 600 : 400, color: isSel ? "#C2410C" : "#374151", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>

                  {opt.count !== undefined && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, backgroundColor: isSel ? "#FB923C" : "#F3F4F6", color: isSel ? "#fff" : "#6B7280", flexShrink: 0 }}>
                      {opt.count}
                    </span>
                  )}

                  {!multiple && isSel && <Check style={{ width: 12, height: 12, color: "#F97316", flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Footer multi-select */}
          {multiple && values!.length > 0 && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid #F3F4F6", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "#746e69" }}>
                {values!.length} {values!.length === 1 ? "evento" : "eventos"} selecionados
              </span>
              <button onClick={() => onValuesChange!([])} style={{ fontSize: 11, fontWeight: 700, color: "#F97316", background: "none", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                Limpar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
