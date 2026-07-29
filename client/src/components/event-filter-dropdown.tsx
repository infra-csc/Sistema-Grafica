/**
 * EventFilterDropdown — dropdown redesenhado de filtro por evento.
 * Usado em todas as páginas que têm filtro "Todos os Eventos".
 */
import { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface EventOption {
  value: string;
  label: string;
  count?: number;      // contagem de itens (opcional)
  dotColor?: string;   // cor do dot de prioridade
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  options: EventOption[];
  allLabel?: string;   // padrão: "Todos os Eventos"
}

export function EventFilterDropdown({
  value,
  onChange,
  options,
  allLabel = "Todos os Eventos",
}: Props) {
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

  const selected = options.find(o => o.value === value);
  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const triggerLabel = selected ? selected.label : allLabel;
  const isFiltered = value !== "all";

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          height: 36, padding: "0 10px 0 12px",
          backgroundColor: open || isFiltered ? "#FFF7ED" : "#ffffff",
          border: isFiltered ? "1.5px solid #FB923C" : open ? "1.5px solid #FB923C" : "1px solid #e2e8f0",
          borderRadius: 7, cursor: "pointer",
          fontSize: 13, fontWeight: isFiltered ? 600 : 400,
          color: isFiltered ? "#C2410C" : "#1c1917",
          transition: "background 0.15s, border 0.15s, color 0.15s",
          maxWidth: 240, outline: "none",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
          {triggerLabel}
        </span>

        {isFiltered && (
          <span
            role="button"
            onClick={e => { e.stopPropagation(); onChange("all"); setSearch(""); }}
            style={{ display: "flex", alignItems: "center", color: "#FB923C", marginLeft: 2, cursor: "pointer", flexShrink: 0 }}
            title="Limpar filtro"
          >
            <X style={{ width: 13, height: 13 }} />
          </span>
        )}

        <ChevronDown
          style={{
            width: 14, height: 14, flexShrink: 0, marginLeft: 2,
            color: isFiltered ? "#FB923C" : "#78716c",
            transition: "transform 0.2s",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Dropdown panel */}
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
                autoFocus
                type="text"
                placeholder="Buscar evento..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: "100%", boxSizing: "border-box",
                  paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7,
                  backgroundColor: "#F9FAFB", border: "1.5px solid #E5E7EB",
                  borderRadius: 6, fontSize: 12, color: "#111827", outline: "none",
                  transition: "border 0.15s, box-shadow 0.15s",
                }}
                onFocus={e => { e.target.style.border = "1.5px solid #FB923C"; e.target.style.boxShadow = "0 0 0 3px rgba(251,146,60,0.15)"; }}
                onBlur={e => { e.target.style.border = "1.5px solid #E5E7EB"; e.target.style.boxShadow = "none"; }}
              />
            </div>
          </div>

          {/* List */}
          <div style={{
            maxHeight: 280, overflowY: "auto",
            scrollbarWidth: "thin", scrollbarColor: "#E5E7EB transparent",
          }}>
            {/* "Todos os Eventos" row */}
            {!search.trim() && (
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
                <span style={{ flex: 1 }}>{allLabel}</span>
                {value === "all" && <Check style={{ width: 13, height: 13, flexShrink: 0 }} />}
              </button>
            )}

            {/* Event rows */}
            {filtered.length === 0 ? (
              <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#9CA3AF" }}>
                Nenhum evento encontrado
              </div>
            ) : (
              filtered.map(opt => {
                const isSelected = value === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { onChange(opt.value); setSearch(""); setOpen(false); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 8,
                      padding: "8px 12px", border: "none", cursor: "pointer", textAlign: "left",
                      backgroundColor: isSelected ? "#FFF7ED" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F9FAFB"; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                  >
                    {/* dot */}
                    <span style={{
                      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                      backgroundColor: opt.dotColor || (isSelected ? "#F97316" : "#D1D5DB"),
                    }} />

                    {/* name */}
                    <span style={{
                      flex: 1, fontSize: 12, fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? "#C2410C" : "#374151",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {opt.label}
                    </span>

                    {/* badge — só mostra se count fornecido */}
                    {opt.count !== undefined && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                        backgroundColor: isSelected ? "#FB923C" : "#F3F4F6",
                        color: isSelected ? "#fff" : "#6B7280",
                        flexShrink: 0,
                      }}>
                        {opt.count}
                      </span>
                    )}

                    {/* check */}
                    {isSelected && <Check style={{ width: 12, height: 12, color: "#F97316", flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
