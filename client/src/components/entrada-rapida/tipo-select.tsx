// TipoSelect — o seletor de tipo (modelo) da grade, agrupado por Grupo Pai.
import { useState, useRef } from "react";
import { ChevronDown, Check } from "lucide-react";
import { T, N, TOM, FONT } from "@/lib/theme";
import { fieldStyle } from "./estilos";

interface TipoSelectProps {
  value: string;
  groupedOptions: { group: string; items: string[] }[];
  onChange: (v: string) => void;
  rowIndex: number;
  onNavigateNext: () => void;
}

export function TipoSelect({ value, groupedOptions, onChange, rowIndex, onNavigateNext }: TipoSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function closeDropdown() { setOpen(false); setSearch(""); }

  const allFlat = groupedOptions.flatMap(g => g.items);
  const filtered = search.trim()
    ? allFlat.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : null; // null = show grouped

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const list = filtered ?? allFlat;
      if (open && list.length > 0) { onChange(list[0]); closeDropdown(); }
      onNavigateNext();
    }
    if (e.key === 'Escape') closeDropdown();
  }

  function renderOption(opt: string) {
    const sel = opt === value;
    return (
      <div
        key={opt}
        onMouseDown={e => { e.preventDefault(); onChange(opt); closeDropdown(); onNavigateNext(); }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', borderRadius: 6, fontSize: 13,
          fontWeight: sel ? 700 : 500,
          // #c2410c e não #f97316: o tipo escolhido é TEXTO (2,9:1 reprovava).
          color: sel ? T.accentText : T.text,
          backgroundColor: sel ? TOM.laranja.bg : 'transparent',
          cursor: 'pointer', fontFamily: FONT.corpo, gap: 6,
        }}
        onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLDivElement).style.backgroundColor = N.n2; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = sel ? TOM.laranja.bg : ''; }}
      >
        <span style={{ flex: 1 }}>{opt}</span>
        {sel && <Check size={10} color={T.accentText} aria-hidden="true" />}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      style={{ position: 'relative' }}
      onBlur={e => {
        if (!ref.current?.contains(e.relatedTarget as Node)) closeDropdown();
      }}
    >
      <div style={{ position: 'relative', display: 'flex' }}>
        <div style={{ width: '3px', flexShrink: 0, backgroundColor: T.accent, borderRadius: '6px 0 0 6px', alignSelf: 'stretch' }} />
        <input
          ref={inputRef}
          value={open ? search : value}
          onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => { setSearch(""); setOpen(true); inputRef.current!.style.borderColor = T.accent; }}
          onBlur={e => { e.currentTarget.style.borderColor = 'transparent'; }}
          onKeyDown={handleKeyDown}
          onMouseDown={() => { if (!open) { setSearch(""); setOpen(true); } }}
          placeholder={value || "Selecionar..."}
          aria-label={`Tipo da peça, linha ${rowIndex + 1}`}
          aria-expanded={open}
          data-nav-row={rowIndex}
          data-nav-field="0"
          style={{ ...fieldStyle, flex: 1, paddingRight: '24px', paddingLeft: '8px', textOverflow: 'ellipsis', cursor: 'pointer', borderRadius: '0 6px 6px 0', backgroundColor: open ? T.border : T.low }}
        />
        <ChevronDown size={10} color={T.second} aria-hidden="true" style={{ position: 'absolute', right: 7, top: '50%', transform: open ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)', transition: 'transform 0.15s', pointerEvents: 'none' }} />
      </div>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 3px)', left: 0, zIndex: 600, backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.13)', maxHeight: 260, overflowY: 'auto', minWidth: 220, padding: '4px', scrollbarWidth: 'thin', scrollbarColor: `${T.bdark} ${N.n2}` }}>
          {filtered !== null ? (
            filtered.length === 0
              ? <div style={{ padding: '10px 12px', fontSize: 13, color: T.second, textAlign: 'center', fontFamily: FONT.corpo }}>Nenhum resultado</div>
              : filtered.map(renderOption)
          ) : (
            groupedOptions.length === 0
              ? <div style={{ padding: '10px 12px', fontSize: 13, color: T.second, textAlign: 'center', fontFamily: FONT.corpo }}>Nenhum modelo cadastrado</div>
              : groupedOptions.map(({ group, items }) => (
                <div key={group || '__nogroup'}>
                  {group && (
                    <div style={{ padding: '5px 10px 3px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.12em', color: TOM.ceu.text, fontFamily: FONT.display, backgroundColor: TOM.ceu.bg, borderRadius: 6, margin: '4px 2px 2px' }}>
                      {group}
                    </div>
                  )}
                  {items.map(renderOption)}
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}
