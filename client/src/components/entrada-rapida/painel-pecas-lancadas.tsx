// PEÇAS JÁ LANÇADAS — o painel só de leitura acima da grade, agrupado por Grupo Pai e tipo.
import { useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { T, N, TOM, FONT } from "@/lib/theme";
import type { ExistingItem, StandardItem } from "./tipos";

interface ExistingItemsPanelProps {
  items: ExistingItem[];
  standardItems?: StandardItem[];
}

// A exclusão de peças já lançadas vive na tabela da página (com o diálogo de
// confirmação) — o painel aqui é só leitura, sem botão de lixeira morto.
export function ExistingItemsPanel({ items, standardItems = [] }: ExistingItemsPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      it =>
        it.displayId.toLowerCase().includes(q) ||
        it.type.toLowerCase().includes(q) ||
        (it.description ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);


  function ItemRow({ item }: { item: ExistingItem }) {
    const [hovered, setHovered] = useState(false);
    return (
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '5px 8px',
          borderBottom: `1px solid ${N.n2}`,
          backgroundColor: hovered ? TOM.laranja.bg : 'transparent',
          transition: 'background-color 0.1s',
          minWidth: 0,
        }}
      >
        {/* ID */}
        <span style={{
          // #c2410c sobre branco = 5,18:1 e sobre o #fff7ed do hover = 4,88:1 ✓
          // (#f97316 dava 2,94:1 — reprovado, e num ID de 10px que se lê para
          // digitar em outra tela.)
          fontSize: '10px', fontWeight: '700', color: T.accentText,
          fontFamily: FONT.mono,
          minWidth: '52px', flexShrink: 0,
        }}>
          {item.displayId}
        </span>
        {/* Tipo */}
        <span style={{
          fontSize: '11px', fontWeight: '700', color: T.strong,
          fontFamily: FONT.corpo,
          minWidth: '110px', flexShrink: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.type}
          {item.quantity > 1 && (
            <span style={{ fontWeight: '500', color: T.second, marginLeft: '3px' }}>×{item.quantity}</span>
          )}
        </span>
        {/* Descrição */}
        <span style={{
          fontSize: '11px', color: T.second,
          fontFamily: FONT.corpo,
          flex: 1, minWidth: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {item.description || item.material || '—'}
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '24px', border: `1px solid ${T.border}`, borderRadius: '12px', overflow: 'hidden' }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '7px 12px',
        backgroundColor: N.n2, borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{
          fontSize: '10px', fontWeight: '800', textTransform: 'uppercase',
          letterSpacing: '0.14em', color: T.second,
          fontFamily: FONT.display, whiteSpace: 'nowrap',
        }}>
          Peças já lançadas
        </span>
        <span style={{
          fontSize: '10px', fontWeight: '800',
          backgroundColor: T.text, color: T.surface,
          borderRadius: '999px', padding: '1px 7px',
          fontFamily: FONT.display, flexShrink: 0,
        }}>
          {items.length}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Quick search */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search size={11} color={T.second} aria-hidden="true" style={{ position: 'absolute', left: 7, pointerEvents: 'none' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Filtrar..."
            aria-label="Filtrar as peças já lançadas"
            style={{
              fontSize: '11px', fontFamily: FONT.corpo,
              backgroundColor: T.border, border: 'none',
              borderRadius: '6px', padding: '4px 24px 4px 24px',
              color: T.text, width: '140px',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar o filtro"
              style={{ position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0, padding: 0, color: T.second }}
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      {/* ── Grouped by type list ── */}
      <div
        className="scrollbar-visible"
        style={{ maxHeight: '176px', overflowY: 'auto', backgroundColor: T.bg }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '12px 16px', fontSize: '11px', color: T.second, textAlign: 'center', fontFamily: FONT.corpo }}>
            {query ? 'Nenhum item encontrado para esta busca.' : 'Nenhuma peça lançada ainda.'}
          </div>
        ) : (() => {
          // Build type → group map
          const typeToGroup: Record<string, string> = {};
          for (const s of standardItems) {
            if (s.group) typeToGroup[s.name] = s.group;
          }
          // Group by Grupo Pai first, then by type
          const groupMap: Record<string, Record<string, ExistingItem[]>> = {};
          for (const item of filtered) {
            const g = typeToGroup[item.type] || '';
            if (!groupMap[g]) groupMap[g] = {};
            if (!groupMap[g][item.type]) groupMap[g][item.type] = [];
            groupMap[g][item.type].push(item);
          }
          const sortedGroups = Object.keys(groupMap).sort((a, b) => {
            if (a === '') return 1; if (b === '') return -1;
            return a.localeCompare(b, 'pt-BR');
          });
          return sortedGroups.map(group => (
            <div key={group || '__nogroup'}>
              {/* Grupo Pai header */}
              {group && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 8px', backgroundColor: TOM.ceu.border, borderTop: `1px solid ${TOM.ceu.border}`, borderBottom: `1px solid ${TOM.ceu.border}` }}>
                  <span style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.12em', color: TOM.ceu.text, fontFamily: FONT.display }}>
                    {group}
                  </span>
                </div>
              )}
              {Object.entries(groupMap[group]).map(([type, typeItems]) => (
                <div key={type}>
                  {/* Type sub-header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 8px', backgroundColor: N.n3, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
                    <span style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.12em', color: T.second, fontFamily: FONT.display, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {type}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: '700', color: T.apoio, backgroundColor: T.border, borderRadius: 999, padding: '1px 6px', fontFamily: FONT.display, flexShrink: 0 }}>
                      {typeItems.length}
                    </span>
                  </div>
                  <div>
                    {typeItems.map(item => <ItemRow key={item.id} item={item} />)}
                  </div>
                </div>
              ))}
            </div>
          ));
        })()}
      </div>

      {/* Column headers (after scroll area to stay in context) */}
    </div>
  );
}
