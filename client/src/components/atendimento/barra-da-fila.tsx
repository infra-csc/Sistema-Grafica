// ─────────────────────────────────────────────────────────────────────────────
// ABAS + FILTROS, numa faixa só — e o recorte ativo escrito logo abaixo.
//
// A <section> cinza de 24px de padding que embrulhava os filtros saiu. Ela era
// um bloco de fundo diferente, com sombra própria, para hospedar cinco
// controles — e empurrava a primeira peça da lista para baixo da dobra numa
// tela de notebook. Os controles moram agora na mesma linha das abas, que é
// onde já se olha para trocar de recorte.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, type Dispatch, type SetStateAction } from "react";
import { Search, X, Clock, ChevronDown } from "lucide-react";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { EventFilterDropdown, type EventOption } from "@/components/event-filter-dropdown";
import { FilterChip } from "@/components/prazos/filter-chip";
import { Segmentado } from "@/components/ui/abas";
import { alvo } from "@/hooks/use-mobile";
import { FS, R, T, N, TOM } from "@/lib/theme";
import type { AbaDoAtendimento } from "./tipos";

/** Um filtro ativo, escrito por extenso e removível. */
export interface ChipAtivo {
  key: string;
  label: string;
  onRemove: () => void;
}

export function BarraDaFila({
  activeTab, setActiveTab, actionableCount, isMobile, dedo, searchTerm, setSearchTerm, chipsAtivos,
  eventFilter, setEventFilter, eventFilterOptions, itemTypeFilter, setItemTypeFilter, typeFilterOptions,
  situacaoFilter, setSituacaoFilter, situacaoFilterOptions, sponsorFilter, setSponsorFilter, sponsorFilterOptions,
  atrasadosFilter, setAtrasadosFilter, atrasadosNaBase, limparFiltros, filteredItems, pendingItems,
}: {
  activeTab: AbaDoAtendimento;
  setActiveTab: Dispatch<SetStateAction<AbaDoAtendimento>>;
  actionableCount: number | null;
  isMobile: boolean;
  dedo: boolean;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  chipsAtivos: ChipAtivo[];
  eventFilter: string[];
  setEventFilter: Dispatch<SetStateAction<string[]>>;
  eventFilterOptions: EventOption[];
  itemTypeFilter: string[];
  setItemTypeFilter: Dispatch<SetStateAction<string[]>>;
  typeFilterOptions: FilterOption[];
  situacaoFilter: string[];
  setSituacaoFilter: Dispatch<SetStateAction<string[]>>;
  situacaoFilterOptions: FilterOption[];
  sponsorFilter: string[];
  setSponsorFilter: Dispatch<SetStateAction<string[]>>;
  sponsorFilterOptions: FilterOption[];
  atrasadosFilter: boolean;
  setAtrasadosFilter: Dispatch<SetStateAction<boolean>>;
  atrasadosNaBase: readonly unknown[];
  limparFiltros: () => void;
  filteredItems: readonly unknown[];
  pendingItems: readonly unknown[];
}) {
  // Filtros recolhidos no celular (mesma cura da Arte): quatro menus e o
  // "Atrasados" em 44px cada somavam três linhas de controles entre o placar e
  // a primeira peça. A busca fica sempre à vista; o recorte ativo continua
  // escrito nos chips logo abaixo.
  const [filtrosAbertosMobile, setFiltrosAbertosMobile] = useState(false);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {/* O segmentado da casa: setas/Home/End e roving tabindex moram no
            componente (o contrato ARIA de tablist, uma vez só). Os botões
            saem como `tab-pending` / `tab-history` — o mesmo nome que o `id`
            deles tinha. A contagem de Pendentes é a mesma de antes
            (actionableCount): a aba diz quantas peças pedem ação, o placar
            diz de que TIPO é cada uma. */}
        <div
          style={{ flexShrink: 0 }}
          // O Segmentado não aceita `id`/`aria-controls` por item: sem eles o
          // painel perde o `aria-labelledby` e a ligação aba→painel do
          // contrato ARIA. Recoloca aqui os mesmos nomes de antes.
          ref={el => {
            if (!el) return;
            for (const aba of ['pending', 'history']) {
              const b = el.querySelector(`[data-testid="tab-${aba}"]`);
              if (b) { b.id = `tab-${aba}`; b.setAttribute('aria-controls', `tabpanel-${aba}`); }
            }
          }}
        >
          <Segmentado
            rotuloDaLista="Abas de aprovação"
            prefixoDeTestId="tab"
            ativo={activeTab}
            aoTrocar={(id) => setActiveTab(id as typeof activeTab)}
            itens={[
              { id: 'pending', rotulo: 'Pendentes', contador: actionableCount ?? undefined },
              { id: 'history', rotulo: 'Histórico' },
            ]}
          />
        </div>

        {activeTab === 'pending' && (
          <>
            {/* No celular a busca divide a linha com o botão "Filtros" (mínimo
                de 160px, e o que sobrar é dela) em vez de ocupar uma linha só. */}
            <div style={{ position: 'relative', flex: isMobile ? '1 1 160px' : '0 1 240px', minWidth: isMobile ? 160 : undefined }}>
              <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, color: T.second, pointerEvents: 'none' }} />
              <input
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="ID, tipo ou descrição..."
                aria-label="Buscar por ID, tipo ou descrição"
                data-testid="input-search"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  // A busca não tinha borda: ela era um retângulo branco sobre
                  // o cinza da <section>. Sem a <section>, branco sobre branco
                  // deixaria de parecer campo.
                  height: alvo(36, dedo), padding: '0 30px 0 32px', borderRadius: R.md,
                  border: `1px solid ${T.border}`, backgroundColor: T.surface,
                  // 16px no celular: abaixo disso o iOS dá zoom no campo ao focar.
                  fontSize: isMobile ? FS.lead : FS.body, color: T.text, outlineOffset: 2,
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  aria-label="Limpar busca"
                  style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.second, width: dedo ? 40 : 28, height: dedo ? 40 : 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X aria-hidden="true" style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>

            {isMobile && (() => {
              const n = chipsAtivos.filter(c => c.key !== 'busca').length;
              return (
                <button
                  type="button"
                  onClick={() => setFiltrosAbertosMobile(v => !v)}
                  aria-expanded={filtrosAbertosMobile}
                  data-testid="button-toggle-filtros-mobile"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, padding: '0 14px', borderRadius: 9, border: `1px solid ${n > 0 ? TOM.laranja.border : T.border}`, background: n > 0 ? TOM.laranja.bg : T.surface, color: n > 0 ? T.accentText : T.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  Filtros{n > 0 ? ` · ${n}` : ''}
                  <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: filtrosAbertosMobile ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
                </button>
              );
            })()}

            {(!isMobile || filtrosAbertosMobile) && (<>
            <EventFilterDropdown
              values={eventFilter}
              onValuesChange={setEventFilter}
              options={eventFilterOptions}
            />

            <FilterSelect
              label="Tipo de Entrega" allLabel="Todos os tipos"
              values={itemTypeFilter} onValuesChange={setItemTypeFilter}
              options={typeFilterOptions} showAllLabelWhenEmpty
              searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
              testId="select-type-filter"
            />

            {/* SITUAÇÃO — a dimensão que faltava. Sem ela não havia como
                perguntar "o que já voltou corrigido e está esperando por mim?",
                que é a pergunta que atrasou a peça #1527 por semanas. O menu
                continua aqui porque o placar oferece TRÊS das cinco chaves:
                "Reprovado" e "Aprovado" só se alcançam por ele. */}
            <FilterSelect
              label="Situação" allLabel="Todas as situações"
              values={situacaoFilter} onValuesChange={setSituacaoFilter}
              options={situacaoFilterOptions} hideSearch showAllLabelWhenEmpty
              panelWidth={260}
              testId="select-situacao-filter"
            />

            <FilterSelect
              label="Patrocinador" allLabel="Todos os Patrocinadores"
              values={sponsorFilter} onValuesChange={setSponsorFilter}
              options={sponsorFilterOptions} panelWidth={260}
              showAllLabelWhenEmpty
              searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
              testId="select-sponsor-filter"
            />

            {/* "Atrasado" aqui é medido contra o marco de APROVAÇÃO DE LAYOUT,
                nunca contra a saída do caminhão — ela é o prazo mais folgado do
                fluxo, semanas depois da data em que a decisão precisa existir.
                Ver lib/atendimento-prazo. */}
            <button
              onClick={() => setAtrasadosFilter(v => !v)}
              aria-pressed={atrasadosFilter}
              data-testid="button-filter-atrasados"
              title="Só peças cujo evento já passou do prazo de Aprovação de Layout"
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                height: alvo(36, dedo), padding: '0 12px', borderRadius: R.md,
                backgroundColor: atrasadosFilter ? TOM.perigo.text : T.surface,
                border: atrasadosFilter ? `1.5px solid ${TOM.perigo.text}` : `1px solid ${T.border}`,
                color: atrasadosFilter ? T.surface : T.text,
                fontSize: 13, fontWeight: atrasadosFilter ? 600 : 400,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Clock aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
              Atrasados
              <span
                data-testid="badge-atrasados-count"
                // Contrastes (texto ≤13px exige 4,5:1): #991b1b sobre #fef2f2 =
                // 7,60:1 ✓ · #57534e sobre #f5f5f4 = 6,99:1 ✓ · branco sobre o
                // véu claro do estado ativo (≈#af4d4d) = 5,24:1 ✓
                style={{
                  padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  backgroundColor: atrasadosFilter ? 'rgba(255,255,255,0.22)' : atrasadosNaBase.length > 0 ? TOM.perigo.bg : N.n2,
                  color: atrasadosFilter ? T.surface : atrasadosNaBase.length > 0 ? TOM.perigo.text : T.apoio,
                }}
              >
                {atrasadosNaBase.length}
              </span>
            </button>
            </>)}

            {/* "Limpar" em TEXTO: era um quadrado preto com um × dentro, do
                tamanho e do peso de uma ação primária, para desfazer filtro. */}
            {chipsAtivos.length > 0 && (
              <button
                onClick={limparFiltros}
                data-testid="button-clear-filters"
                style={{
                  height: alvo(36, dedo), padding: '0 8px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: T.accentText, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                }}
              >
                Limpar
              </button>
            )}

            {/* aria-live: é a confirmação de que o filtro pegou — quem não vê
                a lista encolher ouve "12 de 40 peças". */}
            <span
              data-testid="contador-pecas"
              aria-live="polite"
              style={{
                marginLeft: 'auto', fontSize: 12, color: T.second,
                fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              {filteredItems.length} de {pendingItems.length} peças
            </span>
          </>
        )}
      </div>

      {chipsAtivos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
          {chipsAtivos.map(c => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
        </div>
      )}
    </>
  );
}
