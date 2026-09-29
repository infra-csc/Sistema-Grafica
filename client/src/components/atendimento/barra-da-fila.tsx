// ─────────────────────────────────────────────────────────────────────────────
// AS ABAS DA TELA e a BARRA DE FILTROS da aba Pendentes — e o recorte ativo
// escrito logo abaixo.
//
// AS ABAS SAÍRAM DA FAIXA DOS FILTROS (revisão de UX, 29/09). Pendentes e
// Histórico trocam o CONTEÚDO da tela inteira — o placar, os filtros e a lista
// são todos da aba Pendentes —, mas moravam numa pílula cinza no meio da
// fileira de menus, abaixo do placar que elas mesmas governam. Quem abria a
// tela lia o placar como se valesse para as duas abas. Agora elas são o
// <Abas> da casa (sublinhado, "troca o conteúdo"), logo abaixo do título, e o
// que é da aba mora DENTRO do painel dela.
//
// A <section> cinza de 24px de padding que embrulhava os filtros continua
// fora: os controles são uma fileira só, sem moldura, com a busca à frente.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, type Dispatch, type SetStateAction } from "react";
import { Search, X, Clock, SlidersHorizontal, ChevronDown } from "lucide-react";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { EventFilterDropdown, type EventOption } from "@/components/event-filter-dropdown";
import { FilterChip } from "@/components/prazos/filter-chip";
import { Abas } from "@/components/ui/abas";
import { alvo } from "@/hooks/use-mobile";
import { FS, FW, R, T, N, TOM, TOM_FORTE } from "@/lib/theme";
import { letra } from "./estilos";
import type { AbaDoAtendimento } from "./tipos";

/** Um filtro ativo, escrito por extenso e removível. */
export interface ChipAtivo {
  key: string;
  label: string;
  onRemove: () => void;
}

/**
 * Pendentes | Histórico. Os botões saem como `tab-pending` / `tab-history`
 * (id e data-testid, os mesmos nomes de antes) e apontam para o painel pelo
 * `aria-controls` — sem o `ref` que recolocava os atributos por fora.
 * A contagem de Pendentes é `actionableCount`: a aba diz quantas peças pedem
 * ação; o placar, logo abaixo, diz de que TIPO é cada uma.
 */
export function AbasDoAtendimento({ activeTab, setActiveTab, actionableCount }: {
  activeTab: AbaDoAtendimento;
  setActiveTab: Dispatch<SetStateAction<AbaDoAtendimento>>;
  actionableCount: number | null;
}) {
  return (
    <Abas
      rotuloDaLista="Abas de aprovação"
      prefixoDeTestId="tab"
      testId="abas-atendimento"
      ativo={activeTab}
      aoTrocar={(id) => setActiveTab(id as AbaDoAtendimento)}
      style={{ marginBottom: 20 }}
      itens={[
        { id: 'pending', rotulo: 'Pendentes', contador: actionableCount ?? undefined, idDoElemento: 'tab-pending', ariaControls: 'tabpanel-pending' },
        { id: 'history', rotulo: 'Histórico', idDoElemento: 'tab-history', ariaControls: 'tabpanel-history' },
      ]}
    />
  );
}

export function BarraDaFila({
  isMobile, cards = false, dedo, searchTerm, setSearchTerm, chipsAtivos,
  eventFilter, setEventFilter, eventFilterOptions, itemTypeFilter, setItemTypeFilter, typeFilterOptions,
  situacaoFilter, setSituacaoFilter, situacaoFilterOptions, sponsorFilter, setSponsorFilter, sponsorFilterOptions,
  atrasadosFilter, setAtrasadosFilter, atrasadosNaBase, limparFiltros, filteredItems, pendingItems,
}: {
  isMobile: boolean;
  /** Área útil estreita (tablet com a barra lateral aberta): filtros recolhidos também. */
  cards?: boolean;
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
  const toque = isMobile || dedo;
  // RECOLHE pelos filtros da ÁREA ÚTIL, não só pela janela: um tablet de 768
  // com a barra lateral aberta deixa ~450px de conteúdo, e os cinco controles
  // viravam três fileiras entre o placar e a lista.
  const recolhe = isMobile || cards;
  const altura = alvo(36, dedo);
  const nFiltros = chipsAtivos.filter(c => c.key !== 'busca').length;

  // "Atrasado" aqui é medido contra o marco de APROVAÇÃO DE LAYOUT, nunca
  // contra a saída do caminhão — ela é o prazo mais folgado do fluxo, semanas
  // depois da data em que a decisão precisa existir. Ver lib/atendimento-prazo.
  // LIGADO em tinta forte clara (TOM_FORTE), não num bloco vermelho sólido: o
  // bloco era o objeto mais pesado da barra para um filtro que só recorta.
  const botaoAtrasados = (
    <button
      type="button"
      onClick={() => setAtrasadosFilter(v => !v)}
      aria-pressed={atrasadosFilter}
      data-testid="button-filter-atrasados"
      title="Só peças cujo evento já passou do prazo de Aprovação de Layout"
      className="ds-botao"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: recolhe ? 'space-between' : 'center', gap: 7,
        height: isMobile ? 44 : altura, padding: '0 12px', borderRadius: R.md,
        width: recolhe ? '100%' : undefined,
        backgroundColor: atrasadosFilter ? TOM_FORTE.perigo.bg : T.surface,
        border: `1px solid ${atrasadosFilter ? TOM_FORTE.perigo.border : T.border}`,
        color: atrasadosFilter ? TOM_FORTE.perigo.text : T.strong,
        fontFamily: 'inherit', fontSize: letra(FS.body, toque), fontWeight: atrasadosFilter ? FW.forte : FW.medio,
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
        <Clock aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
        Atrasados
      </span>
      <span
        data-testid="badge-atrasados-count"
        // Contrastes: #991b1b sobre #fef2f2 = 7,60:1 · #57534e sobre #f5f5f4 =
        // 6,99:1 · ligado, o 800 sobre branco passa de 9:1.
        style={{
          minWidth: 20, textAlign: 'center',
          padding: '1px 7px', borderRadius: R.pill, fontSize: letra(FS.small, toque), fontWeight: FW.forte,
          fontVariantNumeric: 'tabular-nums',
          backgroundColor: atrasadosFilter ? T.surface : atrasadosNaBase.length > 0 ? TOM.perigo.bg : N.n2,
          color: atrasadosFilter ? TOM_FORTE.perigo.text : atrasadosNaBase.length > 0 ? TOM.perigo.text : T.apoio,
        }}
      >
        {atrasadosNaBase.length}
      </span>
    </button>
  );

  const menus = (
    <>
      <EventFilterDropdown
        values={eventFilter}
        onValuesChange={setEventFilter}
        options={eventFilterOptions}
        fullWidth={recolhe}
      />

      <FilterSelect
        label="Tipo de Entrega" allLabel="Todos os tipos"
        values={itemTypeFilter} onValuesChange={setItemTypeFilter}
        options={typeFilterOptions} showAllLabelWhenEmpty
        searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
        testId="select-type-filter"
        fullWidth={recolhe}
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
        fullWidth={recolhe}
      />

      <FilterSelect
        label="Patrocinador" allLabel="Todos os Patrocinadores"
        values={sponsorFilter} onValuesChange={setSponsorFilter}
        options={sponsorFilterOptions} panelWidth={260}
        showAllLabelWhenEmpty
        searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
        testId="select-sponsor-filter"
        fullWidth={recolhe}
      />
    </>
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {/* A BUSCA ABRE A FILEIRA: é o controle que mais se usa ("a #2801?").
            No celular ela divide a linha com o botão "Filtros". */}
        <div style={{ position: 'relative', flex: recolhe ? '1 1 0%' : '1 1 180px', maxWidth: recolhe ? undefined : 300, minWidth: recolhe ? 0 : 160 }}>
          <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: T.second, pointerEvents: 'none' }} />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar ID, tipo ou descrição"
            aria-label="Buscar por ID, tipo ou descrição"
            data-testid="input-search"
            style={{
              width: '100%', boxSizing: 'border-box',
              height: isMobile ? 44 : altura, padding: '0 34px 0 34px', borderRadius: R.md,
              border: `1px solid ${T.border}`, backgroundColor: T.surface,
              // 16px no celular: abaixo disso o iOS dá zoom no campo ao focar.
              fontSize: isMobile ? FS.lead : FS.body, color: T.text, outlineOffset: 2,
              fontFamily: 'inherit',
            }}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              aria-label="Limpar busca"
              className="ds-botao ds-botao-fantasma"
              style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', borderRadius: R.sm, cursor: 'pointer', color: T.second, width: toque ? 40 : 30, height: toque ? 40 : 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X aria-hidden="true" style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>

        {recolhe && (
          <button
            type="button"
            onClick={() => setFiltrosAbertosMobile(v => !v)}
            aria-expanded={filtrosAbertosMobile}
            aria-controls="filtros-do-atendimento"
            data-testid="button-toggle-filtros-mobile"
            className="ds-botao"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7, height: isMobile ? 44 : altura, padding: '0 14px', borderRadius: R.md,
              border: `1px solid ${nFiltros > 0 ? TOM_FORTE.laranja.border : T.border}`,
              background: nFiltros > 0 ? TOM.laranja.bg : T.surface,
              color: nFiltros > 0 ? T.accentText : T.text,
              fontFamily: 'inherit', fontSize: isMobile ? FS.read : FS.body, fontWeight: FW.forte, cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <SlidersHorizontal aria-hidden="true" style={{ width: 15, height: 15 }} />
            Filtros{nFiltros > 0 ? ` · ${nFiltros}` : ''}
            <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: filtrosAbertosMobile ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
          </button>
        )}

        {!recolhe && (<>{menus}{botaoAtrasados}</>)}

        {/* "Limpar" em TEXTO: desfazer filtro não é ação primária. */}
        {!recolhe && chipsAtivos.length > 0 && (
          <button
            type="button"
            onClick={limparFiltros}
            data-testid="button-clear-filters"
            className="ds-botao ds-botao-fantasma"
            style={{
              height: altura, padding: '0 10px', borderRadius: R.md,
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: T.accentText, fontSize: FS.body, fontWeight: FW.forte, whiteSpace: 'nowrap',
            }}
          >
            Limpar filtros
          </button>
        )}

        {/* aria-live: é a confirmação de que o filtro pegou — quem não vê
            a lista encolher ouve "12 de 40 peças". A região fica SEMPRE no
            DOM (para anunciar), só para leitor de tela; a contagem VISÍVEL
            mora na linha dos chips, e só quando há recorte — sem filtro,
            "17 de 17 peças" era uma linha a mais dizendo nada (e caía
            sozinha numa segunda fileira no notebook). */}
        <span data-testid="contador-pecas" aria-live="polite" className="sr-only">
          {filteredItems.length} de {pendingItems.length} peças
        </span>
      </div>

      {/* A FOLHA DE FILTROS DO CELULAR: os menus em linha cheia, um embaixo
          do outro — em vez de quatro gatilhos de larguras diferentes
          quebrando do jeito que desse. */}
      {recolhe && filtrosAbertosMobile && (
        <div
          id="filtros-do-atendimento"
          className="atd-entrar"
          style={{
            display: 'grid', gridTemplateColumns: '1fr', gap: 8, marginBottom: 12,
            padding: 12, borderRadius: R.lg, backgroundColor: T.surface, border: `1px solid ${T.border}`,
          }}
        >
          {menus}
          {botaoAtrasados}
          {chipsAtivos.length > 0 && (
            <button
              type="button"
              onClick={limparFiltros}
              data-testid="button-clear-filters"
              className="ds-botao ds-botao-fantasma"
              style={{
                height: isMobile ? 44 : altura, borderRadius: R.md, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                color: T.accentText, fontSize: FS.read, fontWeight: FW.forte,
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {chipsAtivos.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <span aria-hidden="true" data-testid="contador-visivel" style={{ fontSize: letra(FS.meta, toque), color: T.second, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', marginRight: 4 }}>
            <strong style={{ color: T.text, fontWeight: FW.forte }}>{filteredItems.length}</strong> de {pendingItems.length} peças
          </span>
          {chipsAtivos.map(c => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
        </div>
      )}
    </>
  );
}
