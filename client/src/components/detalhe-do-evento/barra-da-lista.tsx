// ─────────────────────────────────────────────────────────────────────────────
// A BARRA DA LISTA — busca local, agrupar por tipo ou por status, e "Limpar
// filtros (N de M)" quando busca, chips ou marco estão filtrando.
// ─────────────────────────────────────────────────────────────────────────────
import { Search, X, FilterX } from "lucide-react";
import { T, N, FS, FW, R } from "@/lib/theme";
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
    <div data-testid="barra-da-lista" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: isMobile ? '100%' : 300 }}>
        <Search aria-hidden="true" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.second, pointerEvents: 'none' }} />
        <input
          type="text"
          aria-label="Buscar peça por ID, tipo ou status"
          placeholder="Buscar peça (ID, tipo, status)..."
          value={itemSearch}
          onChange={e => setItemSearch(e.target.value)}
          data-testid="input-search-event-items"
          className="evd-busca"
          style={{ width: '100%', height: isMobile ? 44 : 36, paddingLeft: 34, paddingRight: itemSearch ? 36 : 12, border: `1px solid ${T.border}`, borderRadius: R.md, backgroundColor: T.surface, fontSize: isMobile ? 16 : 13, color: T.text, fontFamily: 'inherit' }}
        />
        {/* Limpar SÓ a busca, ali mesmo — o "Limpar filtros" da direita
            limpa tudo (busca, chips e marco). */}
        {itemSearch && (
          <button
            type="button"
            onClick={() => setItemSearch("")}
            aria-label="Limpar a busca"
            title="Limpar a busca"
            className="evd-acao"
            style={{ position: 'absolute', right: isMobile ? 0 : 2, top: '50%', transform: 'translateY(-50%)', width: isMobile ? 44 : 32, height: isMobile ? 44 : 32 }}
          >
            <X aria-hidden="true" style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>
      {/* AGRUPAR POR TIPO OU POR STATUS. Por tipo é como a produção lê;
          por status é como se acha o que travou — com 40 peças em seis
          tipos, procurar "o que está parado" exigia varrer as seções. */}
      <div role="radiogroup" aria-label="Agrupar a lista por" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span aria-hidden="true" style={{ fontSize: FS.meta, color: T.second, fontWeight: FW.medio }}>Agrupar por</span>
      <div style={{ display: 'inline-flex', backgroundColor: N.n3, borderRadius: R.md, padding: 3, gap: 2 }}>
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
              className="evd-segmento"
              style={{ height: isMobile ? 38 : 30, padding: '0 14px', borderRadius: R.sm, border: 'none', fontSize: FS.meta, fontWeight: FW.forte, color: ativo ? T.text : T.apoio, backgroundColor: ativo ? T.surface : 'transparent', boxShadow: ativo ? '0 1px 3px rgba(0,0,0,0.10)' : 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {rotulo}
            </button>
          );
        })}
      </div>
      </div>
      <span className="evd-dica-agrupar" style={{ fontSize: FS.meta, color: T.second }}>
        {agrupar === 'tipo' ? 'por grupo pai e tipo de peça, como a produção lê' : 'pela etapa em que cada peça está — para achar o que travou'}
      </span>
      {(itemSearchLower || statusFilter.length > 0 || marcoFiltro !== null) && (
        <button
          type="button"
          onClick={() => { setItemSearch(""); setStatusFilter([]); setMarcoFiltro(null); }}
          data-testid="button-limpar-filtros-pecas"
          className="evd-limpar"
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '0 8px', borderRadius: R.md, minHeight: isMobile ? 44 : 32, fontSize: FS.meta, fontWeight: FW.forte, color: T.accentText, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}
        >
          <FilterX aria-hidden="true" style={{ width: 14, height: 14 }} />
          Limpar filtros ({searchedItems.length} de {mainItems.length})
        </button>
      )}
      {!(itemSearchLower || statusFilter.length > 0 || marcoFiltro !== null) && !isMobile && (
        <span style={{ marginLeft: 'auto', fontSize: FS.meta, color: T.second, fontVariantNumeric: 'tabular-nums' }}>
          {mainItems.length} {mainItems.length === 1 ? 'peça na lista' : 'peças na lista'}
        </span>
      )}
    </div>
  );
}
