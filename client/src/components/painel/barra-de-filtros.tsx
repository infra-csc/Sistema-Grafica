// ─── Filter toolbar ─────────────────────────────────────────────────────────
// Sticky no desktop: com 15 eventos abertos, refinar um filtro obrigava
// a rolar até o topo e voltar — exatamente o laço de quem usa a tela o
// dia inteiro. `top: 4` = logo abaixo da barra de gradiente; zIndex 8
// fica acima do header de evento (6) e do thead (5), que passam a grudar
// abaixo dela (topOffset). Nada aqui pode virar scroll-container.
import type { CSSProperties, Dispatch, MutableRefObject, SetStateAction } from "react";
import { Search, ChevronDown, ChevronUp, SlidersHorizontal, X, Pin } from "lucide-react";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { visaoEstaAtiva, type Visao, type VisaoFiltros } from "@/lib/painel-visoes";
import type { ChipOcultas } from "@/lib/painel-encerrados";
import { FS, H, T, TOM, FONT } from "@/lib/theme";
import { FOCO_OPTIONS } from "./regras";
import type { FiltrosDoPainel } from "./use-filtros-do-painel";
import type { OpcaoDeFiltro, PecaDoPainel } from "./tipos";

const inputStyle: CSSProperties = {
  width: "100%", height: 36,
  backgroundColor: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 6,
  padding: "0 12px",
  fontSize: 13, color: T.text,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export function BarraDeFiltros({
  filtros, toolbarRef, stickyToolbar, useCards, dedo, visoes, filtrosAtuais, visaoPadrao, aplicarVisao,
  fixarVisaoPadrao, mobileFiltersOpen, setMobileFiltersOpen, eventFilterOptions, typeFilterOptions,
  sponsorFilterOptions, statusOptions, dateFilterOptions, isLoading, filteredItems, chipOcultasDados,
}: {
  filtros: FiltrosDoPainel;
  /** A altura medida desta barra desloca as camadas sticky abaixo dela. */
  toolbarRef: MutableRefObject<HTMLDivElement | null>;
  stickyToolbar: boolean;
  useCards: boolean;
  dedo: boolean;
  visoes: Visao[];
  filtrosAtuais: VisaoFiltros;
  visaoPadrao: string | null;
  aplicarVisao: (v: Visao) => void;
  fixarVisaoPadrao: (v: Visao) => void;
  mobileFiltersOpen: boolean;
  setMobileFiltersOpen: Dispatch<SetStateAction<boolean>>;
  eventFilterOptions: OpcaoDeFiltro[];
  typeFilterOptions: OpcaoDeFiltro[];
  sponsorFilterOptions: OpcaoDeFiltro[];
  statusOptions: FilterOption[];
  dateFilterOptions: OpcaoDeFiltro[];
  isLoading: boolean;
  filteredItems: PecaDoPainel[];
  chipOcultasDados: ChipOcultas | null;
}) {
  const {
    searchRef, searchInput, setSearchInput, activeFilterCount, hasActiveFilters, clearAllFilters,
    eventFilter, setEventFilter, typeFilter, setTypeFilter, sponsorFilter, setSponsorFilter,
    statusFilter, setStatusFilter, dateFilter, setDateFilter, focoFilter, setFocoFilter, mostrarFinalizados,
  } = filtros;
  return (
    <div
      ref={toolbarRef}
      style={{
        ...(stickyToolbar ? { position: "sticky" as const, top: 4, zIndex: 8 } : null),
        // DUAS LINHAS DECLARADAS, e nao uma linha que quebra sozinha.
        // Com as visoes salvas aqui dentro sao ate 12 controles; deixados
        // num `wrap` livre eles se reorganizavam a cada largura e cortavam o
        // ultimo select ao meio. Agora e uma grade de duas faixas: as visoes
        // em cima (o recorte pronto), os filtros embaixo (o recorte a mao).
        display: "grid", gridTemplateColumns: "1fr", gap: 8,
        backgroundColor: T.surface,
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        padding: "10px 12px",
        boxShadow: "0 1px 3px rgba(28,25,23,0.05)",
      }}
    >
      {/* AS VISÕES MORAM AQUI, e não numa terceira fileira acima.
          A tela tinha três faixas de controle empilhadas antes da primeira
          peça — atenção, visões e filtros —, três gramáticas visuais para
          duas funções. Visão salva É um conjunto de filtros (cada uma é
          literalmente um link com os parâmetros), então ela pertence à
          barra de filtros e não a uma linha própria.
          De quebra herda o `sticky` da barra: antes, para trocar de visão
          com a lista rolada era preciso voltar ao topo. */}
            {/* ── Visões salvas ─────────────────────────────────────────────────────
                Cada usuário remontava todo dia a mesma combinação de 2-3 filtros, e a
                home era idêntica para 5 papéis com trabalhos diferentes. Como os
                filtros vivem na URL, cada visão é literalmente um link. */}
            <div aria-label="Visões salvas" role="group" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
              {visoes.map(v => {
                // 44 no toque, 36 no ponteiro — o mesmo piso do resto dos filtros.
                const alturaVisao = alvo(36, dedo);
                const ativa = visaoEstaAtiva(v, filtrosAtuais);
                const ehPadrao = visaoPadrao === v.id;
                return (
                  <span key={v.id} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${ativa ? T.accentText : T.border}`, backgroundColor: ativa ? TOM.laranja.bg : T.surface, overflow: "hidden" }}>
                    <button
                      onClick={() => aplicarVisao(v)}
                      aria-pressed={ativa}
                      title={v.hint}
                      data-testid={`visao-${v.id}`}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "0 12px", height: alturaVisao, fontSize: 12, fontWeight: 700, color: ativa ? T.accentText : T.apoio, whiteSpace: "nowrap" }}
                    >
                      {v.label}
                    </button>
                    <button
                      onClick={() => fixarVisaoPadrao(v)}
                      aria-pressed={ehPadrao}
                      title={ehPadrao ? "Deixar de abrir o Painel nesta visão" : "Abrir o Painel nesta visão por padrão"}
                      aria-label={ehPadrao ? `Deixar de usar "${v.label}" como visão padrão` : `Usar "${v.label}" como visão padrão`}
                      style={{ background: "none", border: "none", borderLeft: `1px solid ${ativa ? TOM.laranja.border : T.border}`, cursor: "pointer", padding: "0 9px", height: alturaVisao, display: "flex", alignItems: "center", color: ehPadrao ? T.accentText : T.second }}
                    >
                      {/* PIN, não CHECK. O ✓ é o glifo que o app inteiro usa para
                          "este recorte está ligado" — nos FilterSelect e na pílula de
                          atalho. Aqui ele dizia outra coisa ("abrir o Painel nesta
                          visão"), e ficava aceso nas CINCO visões ao mesmo tempo:
                          quem aprendeu ✓ = ligado lia cinco filtros ativos numa tela
                          sem filtro nenhum. Fixar é outra ideia e ganha outro glifo.
                          #a8a29e sobrevive porque é ÍCONE, não texto — e o estado
                          real vive no aria-pressed, não na cor. */}
                      <Pin style={{ width: 12, height: 12, fill: ehPadrao ? "currentColor" : "none" }} aria-hidden="true" />
                    </button>
                  </span>
                );
              })}
            </div>

      {/* FAIXA 2 — o recorte a mao. Separada da faixa das visoes para os
          controles pararem de se reorganizar a cada largura. */}
      <div style={{ display: "flex", alignItems: useCards ? "stretch" : "center", flexWrap: "wrap", gap: 8 }}>
      {/* Search — full width row on mobile */}
      <div style={{ position: "relative", flexShrink: 0, width: useCards ? "100%" : 180 }}>
        {/* #78716c (4,8:1), não #a8a29e (2,52:1): a lupa é a única marcação
            visual do campo e reprovava o mínimo de 3:1 da WCAG 1.4.11. */}
        <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: T.second, pointerEvents: "none" }} />
        <input
          ref={searchRef}
          type="text"
          placeholder="Buscar peça, evento, tipo ou patrocinador"
          title="Atalho: pressione / para focar a busca"
          aria-label="Buscar peças (atalho: /)"
          aria-keyshortcuts="/"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          data-testid="input-search"
          style={{ ...inputStyle, paddingLeft: 28, height: useCards ? 44 : 32, fontSize: 13 }}
        />
      </div>

      {useCards && (
        <Botao
          variante="secundario"
          tamanho="toque"
          larguraCheia
          icone={SlidersHorizontal}
          onClick={() => setMobileFiltersOpen(o => !o)}
          aria-expanded={mobileFiltersOpen}
          data-testid="button-toggle-filtros-mobile"
          style={{ fontSize: FS.body, color: T.text }}
        >
          Filtros{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          {mobileFiltersOpen ? <ChevronUp aria-hidden="true" style={{ width: 14, height: 14 }} /> : <ChevronDown aria-hidden="true" style={{ width: 14, height: 14 }} />}
        </Botao>
      )}

      {!useCards && <div style={{ width: 1, height: 20, backgroundColor: T.border, flexShrink: 0 }} />}

      {(!useCards || mobileFiltersOpen) && (
        <>
          {/* Evento */}
          <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
            {/* As opções saem de `eventFilterOptions` — o pool da LISTA —
                e não mais da query `events` inteira. Antes o menu oferecia
                todo evento do sistema sobre uma fila podada, e o clique num
                evento sem peça aqui devolvia lista vazia sem explicação. */}
            <EventFilterDropdown
              values={eventFilter}
              onValuesChange={setEventFilter}
              options={eventFilterOptions}
            />
          </div>

          {/* Tipo */}
          <div style={{ flexShrink: 1, minWidth: 110, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
            <FilterSelect
              label="Tipo" allLabel="Todos os tipos"
              values={typeFilter} onValuesChange={setTypeFilter}
              hideWhenEmpty={false}
              options={typeFilterOptions}
              testId="select-type-filter"
              fullWidth
            />
          </div>

          {/* Patrocinador */}
          <div style={{ flex: 1, flexShrink: 1, minWidth: 130, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
            <FilterSelect
              label="Patrocinador" allLabel="Todos os patrocinadores"
              values={sponsorFilter} onValuesChange={setSponsorFilter}
              hideWhenEmpty={false}
              options={sponsorFilterOptions}
              testId="select-sponsor-filter"
              fullWidth
            />
          </div>

          {/* Status */}
          <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
            <FilterSelect
              label="Status" allLabel="Qualquer status"
              values={statusFilter} onValuesChange={setStatusFilter}
              hideWhenEmpty={false}
              options={statusOptions}
              testId="select-status-filter"
              fullWidth
            />
          </div>

          {/* Data */}
          <div style={{ flexShrink: 1, minWidth: 110, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
            {/* O critério é a SAÍDA DO CAMINHÃO — a âncora operacional dos
                prazos (mesma dos chips e dos alertas), confirmada pelo negócio. */}
            <FilterSelect
              label="Saída do caminhão" allLabel="Saída: qualquer data"
              values={dateFilter} onValuesChange={setDateFilter}
              hideWhenEmpty={false}
              options={dateFilterOptions}
              testId="select-date-filter"
              fullWidth
            />
          </div>

          {/* Foco */}
          <div style={{ flexShrink: 1, minWidth: 120, ...(useCards && { flex: "1 1 calc(50% - 4px)", minWidth: 0 }) }}>
            <FilterSelect
              label="Foco" allLabel="Sem foco"
              values={focoFilter} onValuesChange={setFocoFilter}
              // TRÊS opções: uma caixa de busca sobre elas é ruído puro. É a
              // mesma decisão que o Histórico tomou com os seus 25/50/100.
              hideSearch
              hideWhenEmpty={false}
              options={FOCO_OPTIONS}
              testId="select-foco-filter"
              fullWidth
            />
          </div>
        </>
      )}

      {!useCards && <div style={{ width: 1, height: 20, backgroundColor: T.border, flexShrink: 0 }} />}

      {/* Counter + clear.
          role="status": mudar o filtro trocava lista e número sem nada
          anunciar — o aria-pressed do card diz que o card está pressionado,
          não quantos resultados sobraram. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, ...(useCards && { width: "100%" }) }}>
        <span
          role="status" aria-live="polite" aria-atomic="true"
          data-testid="painel-contador"
          style={{ fontFamily: FONT.display, fontSize: 13, fontWeight: 700, color: T.second, whiteSpace: "nowrap" }}
        >
          {/* ENQUANTO CARREGA, O CONTADOR NÃO PODE DIZER ZERO.
              Ele lia `filteredItems.length` sem guarda de isLoading, então
              durante a carga (3.187 peças em produção) a tela afirmava
              "0 peças encontradas" com os skeletons rodando logo abaixo —
              "não achei nada" no lugar de "estou buscando".
              E este span é role=status aria-live: o leitor de tela ANUNCIAVA
              o zero. Quem não vê o skeleton recebia a informação errada, sem
              nada que a contradissesse. */}
          {isLoading ? (
            <span style={{ color: T.text, fontWeight: 900 }}>Carregando peças…</span>
          ) : (
            <>
              <span style={{ color: T.text, fontWeight: 900 }}>{filteredItems.length}</span>
              {" "}{filteredItems.length === 1 ? "peça encontrada" : "peças encontradas"}
              {activeFilterCount > 0 && ` · ${activeFilterCount} ${activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}`}
            </>
          )}
          {/* O número desta tela conta o que está VISÍVEL. Ele só pode dizer
              isso se disser, no mesmo fôlego, quanto ficou de fora — é aqui
              que a contagem é lida (e anunciada pelo leitor de tela a cada
              mudança de filtro), então é aqui que a ressalva tem de estar.
              A porta de volta continua sendo o chip da faixa de atenção.

              É o MESMO número e a MESMA palavra do chip ("ocultas"), de
              propósito: repetir um fato em dois lugares que se leem de
              jeitos diferentes (o chip pelo olho, este pelo leitor de tela)
              é redundância; dizer 315 aqui e 469 ali era contradição. */}
          {chipOcultasDados && !mostrarFinalizados && ` · ${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "oculta" : "ocultas"}`}
        </span>
        {hasActiveFilters && (
          /* Botao secundário, não mais a pílula laranja com hover trocado
             na mão: limpar é ação de apoio da barra, e o laranja aqui
             competia com o "recorte ligado" das visões logo acima. */
          <Botao
            variante="secundario"
            tamanho="md"
            icone={X}
            onClick={clearAllFilters}
            style={{ minHeight: alvo(H.md, dedo) }}
          >
            Limpar
          </Botao>
        )}
      </div>
      </div>
    </div>
  );
}
