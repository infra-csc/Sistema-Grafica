// ─────────────────────────────────────────────────────────────────────────────
// A BARRA DA LISTA — busca local, agrupar por tipo ou por status, e "Limpar
// filtros (N de M)" quando busca, chips ou marco estão filtrando.
// ─────────────────────────────────────────────────────────────────────────────
import { Search } from "lucide-react";
import { T } from "@/lib/theme";
import type { FiltrosDaLista } from "./use-lista-de-pecas";
import type { PecaDoEvento } from "./tipos";

export function BarraDaLista({ filtros, itemSearchLower, searchedItems, mainItems, isMobile }: {
  filtros: FiltrosDaLista;
  /** A busca já aparada e em minúsculas (vazia = sem busca). */
  itemSearchLower: string;
  /** As peças que passam nos filtros, e todas as da lista. */
  searchedItems: PecaDoEvento[];
  mainItems: PecaDoEvento[];
  isMobile: boolean;
}) {
  const { itemSearch, setItemSearch, agrupar, setAgrupar, statusFilter, setStatusFilter, marcoFiltro, setMarcoFiltro } = filtros;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: '-24px' }}>
      <div style={{ position: 'relative', width: isMobile ? '100%' : 280 }}>
        <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: T.second, pointerEvents: 'none' }} />
        <input
          type="text"
          aria-label="Buscar peça por ID, tipo ou status"
          placeholder="Buscar peça (ID, tipo, status)..."
          value={itemSearch}
          onChange={e => setItemSearch(e.target.value)}
          data-testid="input-search-event-items"
          style={{ width: '100%', height: isMobile ? 44 : 34, paddingLeft: 32, paddingRight: 12, border: `1px solid ${T.border}`, borderRadius: 999, backgroundColor: T.surface, fontSize: isMobile ? 16 : 13, color: T.text, fontFamily: 'inherit' }}
        />
      </div>
      {/* AGRUPAR POR TIPO OU POR STATUS. Por tipo é como a produção lê;
          por status é como se acha o que travou — com 40 peças em seis
          tipos, procurar "o que está parado" exigia varrer as seções. */}
      <div role="radiogroup" aria-label="Agrupar a lista por" style={{ display: 'inline-flex', backgroundColor: T.low, borderRadius: 8, padding: 3, gap: 2 }}>
        {([['tipo', 'Tipo'], ['status', 'Status']] as const).map(([valor, rotulo]) => {
          const ativo = agrupar === valor;
          return (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={ativo}
              data-testid={`toggle-agrupar-${valor}`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => setAgrupar(valor)}
              // Radio de verdade: setas trocam, e só o marcado entra no Tab.
              onKeyDown={(e) => {
                if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
                e.preventDefault();
                const outro = valor === 'tipo' ? 'status' : 'tipo';
                setAgrupar(outro);
                (e.currentTarget.parentElement?.querySelector(`[data-testid="toggle-agrupar-${outro}"]`) as HTMLElement | null)?.focus();
              }}
              style={{ height: isMobile ? 44 : 28, padding: '0 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, color: ativo ? T.text : T.apoio, backgroundColor: ativo ? T.surface : 'transparent', boxShadow: ativo ? '0 1px 3px rgba(0,0,0,0.10)' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 12, color: T.second }}>
        {agrupar === 'tipo' ? 'por grupo pai e tipo de peça, como a produção lê' : 'pela etapa em que cada peça está — para achar o que travou'}
      </span>
      {(itemSearchLower || statusFilter.length > 0 || marcoFiltro !== null) && (
        <button
          type="button"
          onClick={() => { setItemSearch(""); setStatusFilter([]); setMarcoFiltro(null); }}
          data-testid="button-limpar-filtros-pecas"
          style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: isMobile ? '0 4px' : 0, minHeight: isMobile ? 44 : undefined, fontSize: 12, fontWeight: 700, color: T.accentText, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
        >
          Limpar filtros ({searchedItems.length} de {mainItems.length})
        </button>
      )}
    </div>
  );
}
