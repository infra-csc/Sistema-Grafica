// ─────────────────────────────────────────────────────────────────────────────
// BARRA DE FILTROS — uma linha: busca, evento, patrocinador, peça e o
// agrupamento. Sem rótulo maiúsculo em cima de cada filtro: o gatilho fechado
// ("Todos os eventos") já nomeia o filtro sozinho.
// ─────────────────────────────────────────────────────────────────────────────
import type { RefObject } from "react";
import { Building2, Calendar, Search, X } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { alvo } from "@/hooks/use-mobile";
import { T, R, FS, FW, SHADOW } from "@/lib/theme";
import type { Agrupamento, OpcaoDeFiltro } from "./tipos";

type Props = {
  searchInputRef: RefObject<HTMLInputElement>;
  buscaDigitada: string;
  setSearchQuery: (q: string) => void;
  eventFilter: string[];
  setEventFilter: (v: string[]) => void;
  eventFilterOptions: OpcaoDeFiltro[];
  sponsorFilter: string[];
  setSponsorFilter: (v: string[]) => void;
  sponsorFilterOptions: OpcaoDeFiltro[];
  itemFilter: string[];
  setItemFilter: (v: string[]) => void;
  itemFilterOptions: OpcaoDeFiltro[];
  agrupamento: Agrupamento;
  setAgrupamento: (a: Agrupamento) => void;
  emCartoes: boolean;
  isMobile: boolean;
  dedo: boolean;
};

export function BarraDeFiltros({
  searchInputRef, buscaDigitada, setSearchQuery, eventFilter, setEventFilter, eventFilterOptions,
  sponsorFilter, setSponsorFilter, sponsorFilterOptions, itemFilter, setItemFilter, itemFilterOptions,
  agrupamento, setAgrupamento, emCartoes, isMobile, dedo,
}: Props) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      marginBottom: 16,
    }}>
      {/* Busca */}
      <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: emCartoes ? 'none' : 320, minWidth: 180 }}>
        <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: T.second, pointerEvents: 'none' }} />
        <input
          ref={searchInputRef}
          value={buscaDigitada}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Peça, descrição ou evento   /"
          aria-label="Buscar por peça, descrição ou evento"
          data-testid="input-search-events"
          style={{
            // 44 no toque (alvo da casa) e fonte 16 no toque ou no celular:
            // abaixo de 16px o Safari do iPhone/iPad dá zoom ao focar a busca.
            // Sem `outline: none` inline: ele vencia o :focus-visible global
            // e quem chegava por teclado (Tab ou "/") não via o anel.
            width: '100%', height: alvo(36, dedo), padding: dedo ? '0 44px 0 34px' : '0 30px 0 34px',
            borderRadius: R.md, border: `1px solid ${T.border}`, backgroundColor: T.surface,
            font: 'inherit', fontSize: dedo || isMobile ? FS.lead : FS.body, color: T.text,
          }}
        />
        {buscaDigitada && (
          <button
            type="button"
            onClick={() => { setSearchQuery(''); searchInputRef.current?.focus(); }}
            aria-label="Limpar a busca"
            style={{ position: 'absolute', right: dedo ? 0 : 6, top: '50%', transform: 'translateY(-50%)', width: alvo(24, dedo), height: alvo(24, dedo), borderRadius: R.pill, border: 'none', background: 'none', color: T.second, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        )}
      </div>

      {/* Filtros */}
      <EventFilterDropdown values={eventFilter} onValuesChange={setEventFilter} options={eventFilterOptions} />
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Patrocinador" allLabel="Todos os patrocinadores"
        values={sponsorFilter} onValuesChange={setSponsorFilter}
        options={sponsorFilterOptions}
        searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
        panelWidth={256} testId="select-sponsor-filter"
      />
      <FilterSelect
        label="Peça" allLabel="Todas as peças"
        values={itemFilter} onValuesChange={setItemFilter}
        hideWhenEmpty={false} showAllLabelWhenEmpty
        options={itemFilterOptions}
        testId="select-item-filter"
      />
      {/* O menu de Status SAIU: os quatro chips da barra acima fazem o mesmo
          recorte, com a contagem à vista e um clique em vez de três. Manter
          os dois seria dar dois lugares para o mesmo estado — e eles
          discordariam na primeira vez que alguém mexesse num só. */}

      {/* Agrupamento */}
      <div
        role="radiogroup"
        aria-label="Agrupar a lista por"
        data-testid="segmented-group-by"
        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}
      >
        <span style={{ fontSize: FS.meta, color: T.apoio, whiteSpace: 'nowrap' }}>Agrupar</span>
        <div style={{ display: 'flex', backgroundColor: T.low, padding: 2, borderRadius: R.md }}>
          {([
            ['evento',       'Evento',       Calendar],
            ['patrocinador', 'Patrocinador', Building2],
          ] as const).map(([valor, rotulo, Icone]) => {
            const ativo = agrupamento === valor;
            return (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={ativo}
                tabIndex={ativo ? 0 : -1}
                onClick={() => setAgrupamento(valor)}
                onKeyDown={e => {
                  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                  e.preventDefault();
                  setAgrupamento(valor === 'evento' ? 'patrocinador' : 'evento');
                }}
                data-testid={`group-by-${valor}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: alvo(32, dedo), padding: '0 12px', borderRadius: R.sm, border: 'none',
                  backgroundColor: ativo ? T.surface : 'transparent',
                  boxShadow: ativo ? SHADOW.sm : 'none',
                  color: ativo ? T.text : T.apoio,
                  cursor: 'pointer', font: 'inherit', fontSize: FS.body, fontWeight: ativo ? FW.forte : FW.medio,
                  whiteSpace: 'nowrap', transition: 'background 0.15s, color 0.15s',
                }}
              >
                <Icone aria-hidden="true" style={{ width: 13, height: 13 }} />
                {rotulo}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
