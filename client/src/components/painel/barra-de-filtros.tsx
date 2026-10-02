// ─── Filter toolbar ─────────────────────────────────────────────────────────
// Sticky no desktop: com 15 eventos abertos, refinar um filtro obrigava
// a rolar até o topo e voltar — exatamente o laço de quem usa a tela o
// dia inteiro. `top: 4` = logo abaixo da tampa sticky da raiz; zIndex 8
// fica acima do header de evento (6) e do thead (5), que passam a grudar
// abaixo dela (topOffset). Nada aqui pode virar scroll-container.
//
// A COMPOSIÇÃO (redesign 02/10). Eram três faixas que se reorganizavam a
// cada largura: as visões em cima, os filtros embaixo e — em 1366px — um
// terceiro andar só com "Sem foco" e o contador, porque os gatilhos
// escreviam "Todos os patrocinadores" e "Saída: qualquer data" por extenso.
// Agora são DUAS faixas com papéis fixos:
//   1. o recorte à mão — a busca larga e os seis filtros, que mostram só o
//      NOME da dimensão quando vazios (o "todos" continua dentro do menu e
//      no nome acessível). Cabe numa linha a partir de ~1000px de conteúdo.
//   2. os atalhos — as visões salvas à esquerda e o resultado (contador +
//      Limpar) à direita, na mesma linha de base.
import type { CSSProperties, Dispatch, MutableRefObject, SetStateAction } from "react";
import { Search, ChevronDown, ChevronUp, SlidersHorizontal, X, Pin } from "lucide-react";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { FilterSelect, type FilterOption } from "@/components/filter-select";
import { Botao } from "@/components/ui/botao";
import { alvo } from "@/hooks/use-mobile";
import { visaoEstaAtiva, type Visao, type VisaoFiltros } from "@/lib/painel-visoes";
import type { ChipOcultas } from "@/lib/painel-encerrados";
import { FS, FW, H, R, SHADOW, T, TOM, FONT } from "@/lib/theme";
import { FOCO_OPTIONS } from "./regras";
import type { FiltrosDoPainel } from "./use-filtros-do-painel";
import type { OpcaoDeFiltro, PecaDoPainel } from "./tipos";

const inputStyle: CSSProperties = {
  width: "100%", height: H.md,
  backgroundColor: T.surface,
  border: `1px solid ${T.border}`,
  borderRadius: 7,
  padding: "0 12px",
  fontSize: FS.body, color: T.text,
  fontFamily: "inherit",
  boxSizing: "border-box",
};

export function BarraDeFiltros({
  filtros, toolbarRef, stickyToolbar, useCards, dedo, visoes, filtrosAtuais, visaoPadrao, aplicarVisao,
  fixarVisaoPadrao, mobileFiltersOpen, setMobileFiltersOpen, eventFilterOptions, typeFilterOptions,
  sponsorFilterOptions, statusOptions, dateFilterOptions, isLoading, filteredItems, chipOcultasDados, semDados = false,
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
  /** A carga falhou sem dado nenhum: o contador não pode afirmar "0 peças". */
  semDados?: boolean;
}) {
  const {
    searchRef, searchInput, setSearchInput, activeFilterCount, hasActiveFilters, clearAllFilters,
    eventFilter, setEventFilter, typeFilter, setTypeFilter, sponsorFilter, setSponsorFilter,
    statusFilter, setStatusFilter, dateFilter, setDateFilter, focoFilter, setFocoFilter, mostrarFinalizados,
  } = filtros;
  // Cada filtro: no desktop, a largura do próprio rótulo; no celular, meia
  // linha (grade de duas colunas dentro do "Filtros").
  const celulaDoFiltro: CSSProperties = useCards
    ? { flex: "1 1 calc(50% - 4px)", minWidth: 0 }
    // Desktop: o filtro NUNCA encolhe (gatilho espremido corta o próprio
    // nome); se a linha não couber — filtros ligados mostram o valor, que é
    // mais largo —, ela quebra e o resultado desce alinhado à direita.
    : { flex: "0 0 auto" };
  // O RESULTADO (contador + Limpar): no desktop fecha a faixa dos filtros —
  // lê-se "filtrei → sobrou isto" na mesma linha; no celular, embaixo de tudo.
  const resultado = (
    <>{/* Counter + clear.
        role="status": mudar o filtro trocava lista e número sem nada
        anunciar — o aria-pressed do card diz que o card está pressionado,
        não quantos resultados sobraram. */}
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, marginLeft: "auto", ...(useCards ? { width: "100%", justifyContent: "space-between" } : { paddingLeft: 6 }) }}>
      <span
        role="status" aria-live="polite" aria-atomic="true"
        data-testid="painel-contador"
        style={{ fontSize: FS.meta, fontWeight: FW.medio, color: T.second, whiteSpace: "nowrap" }}
      >
        {/* ENQUANTO CARREGA, O CONTADOR NÃO PODE DIZER ZERO.
            Ele lia `filteredItems.length` sem guarda de isLoading, então
            durante a carga a tela afirmava "0 peças encontradas" com os
            skeletons rodando logo abaixo — e este span é role=status
            aria-live: o leitor de tela ANUNCIAVA o zero. */}
        {isLoading ? (
          <span style={{ color: T.text, fontWeight: FW.forte }}>Carregando peças…</span>
        ) : semDados ? (
          /* O mesmo zero falso da carga, agora na falha: a lista não veio,
             não "veio vazia". */
          <span style={{ color: T.apoio, fontWeight: FW.medio }}>Lista indisponível</span>
        ) : (
          <>
            <span style={{ fontFamily: FONT.display, fontSize: FS.read, color: T.text, fontWeight: FW.forte, fontVariantNumeric: "tabular-nums" }}>{filteredItems.length}</span>
            {" "}{filteredItems.length === 1 ? "peça encontrada" : "peças encontradas"}
            {activeFilterCount > 0 && ` · ${activeFilterCount} ${activeFilterCount === 1 ? "filtro ativo" : "filtros ativos"}`}
          </>
        )}
        {/* O número desta tela conta o que está VISÍVEL — e diz, no mesmo
            fôlego, quanto ficou de fora. É o MESMO número e a MESMA palavra
            do chip da faixa ("ocultas"): dizer 315 aqui e 469 ali seria
            contradição. */}
        {chipOcultasDados && !mostrarFinalizados && ` · ${chipOcultasDados.total} ${chipOcultasDados.total === 1 ? "oculta" : "ocultas"}`}
      </span>
      {hasActiveFilters && (
        /* Fantasma: limpar é ação de apoio da barra, e borda aqui
           competiria com o "recorte ligado" das visões ao lado. */
        <Botao
          variante="fantasma"
          tamanho={dedo ? "toque" : "md"}
          icone={X}
          onClick={clearAllFilters}
          data-testid="button-limpar-filtros"
          style={{ minHeight: alvo(H.md, dedo), color: T.accentText }}
        >
          Limpar
        </Botao>
      )}
    </div>
    </>
  );
  return (
    <div
      ref={toolbarRef}
      className="pnl-barra"
      style={{
        ...(stickyToolbar ? { position: "sticky" as const, top: 4, zIndex: 8 } : null),
        display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10,
        backgroundColor: T.surface,
        borderRadius: R.lg,
        border: `1px solid ${T.border}`,
        padding: useCards ? 12 : "12px 14px",
        boxShadow: SHADOW.sm,
      }}
    >
      {/* ── FAIXA 1: o recorte à mão ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: useCards ? "stretch" : "center", flexWrap: "wrap", gap: 8, minWidth: 0 }}>
        <div style={{ position: "relative", minWidth: 0, ...(useCards ? { width: "100%" } : { flex: "1 1 220px", minWidth: 200 }) }}>
          {/* #746e69 (5,03:1), não #a8a29e (2,52:1): a lupa é a única marcação
              visual do campo e reprovava o mínimo de 3:1 da WCAG 1.4.11. */}
          <Search aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: T.second, pointerEvents: "none" }} />
          <input
            ref={searchRef}
            type="text"
            className="pnl-busca"
            placeholder="Buscar peça, evento ou patrocinador…"
            title="Atalho: pressione / para focar a busca"
            aria-label="Buscar peças (atalho: /)"
            aria-keyshortcuts="/"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            data-testid="input-search"
            style={{ ...inputStyle, paddingLeft: 32, paddingRight: useCards || searchInput ? 12 : 34, height: useCards ? H.toque : H.md, fontSize: useCards ? FS.lead : FS.body }}
          />
          {/* O atalho dito na própria caixa — no desktop, enquanto ela está
              vazia. Decorativo: o atalho já está no nome acessível. */}
          {!useCards && !searchInput && (
            <kbd aria-hidden="true" className="pnl-kbd" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }}>/</kbd>
          )}
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

        {(!useCards || mobileFiltersOpen) && (
          <>
            {/* Evento — as opções saem de `eventFilterOptions` (o pool da
                LISTA), e não da query `events` inteira: um evento sem peça
                aqui devolveria lista vazia sem explicação. */}
            <div style={celulaDoFiltro}>
              <EventFilterDropdown
                values={eventFilter}
                onValuesChange={setEventFilter}
                options={eventFilterOptions}
                rotuloQuandoVazio="Evento"
                fullWidth={useCards}
              />
            </div>
            <div style={celulaDoFiltro}>
              <FilterSelect
                label="Tipo" allLabel="Todos os tipos" rotuloQuandoVazio="Tipo" unitLabel={{ one: "tipo", many: "tipos" }}
                values={typeFilter} onValuesChange={setTypeFilter}
                hideWhenEmpty={false}
                options={typeFilterOptions}
                testId="select-type-filter"
                fullWidth={useCards}
              />
            </div>
            <div style={celulaDoFiltro}>
              <FilterSelect
                label="Patrocinador" allLabel="Todos os patrocinadores" rotuloQuandoVazio="Patrocinador" unitLabel={{ one: "patrocinador", many: "patrocinadores" }}
                values={sponsorFilter} onValuesChange={setSponsorFilter}
                hideWhenEmpty={false}
                options={sponsorFilterOptions}
                testId="select-sponsor-filter"
                fullWidth={useCards}
              />
            </div>
            <div style={celulaDoFiltro}>
              <FilterSelect
                label="Status" allLabel="Qualquer status" rotuloQuandoVazio="Status" unitLabel={{ one: "status", many: "status" }}
                values={statusFilter} onValuesChange={setStatusFilter}
                hideWhenEmpty={false}
                options={statusOptions}
                testId="select-status-filter"
                fullWidth={useCards}
              />
            </div>
            <div style={celulaDoFiltro}>
              {/* O critério é a SAÍDA DO CAMINHÃO — a âncora operacional dos
                  prazos (mesma dos chips e dos alertas), confirmada pelo negócio. */}
              <FilterSelect
                label="Saída do caminhão" allLabel="Saída: qualquer data" rotuloQuandoVazio="Saída" unitLabel={{ one: "janela de saída", many: "janelas de saída" }}
                values={dateFilter} onValuesChange={setDateFilter}
                hideWhenEmpty={false}
                options={dateFilterOptions}
                testId="select-date-filter"
                fullWidth={useCards}
              />
            </div>
            <div style={celulaDoFiltro}>
              <FilterSelect
                label="Foco" allLabel="Sem foco" rotuloQuandoVazio="Foco" unitLabel={{ one: "foco", many: "focos" }}
                values={focoFilter} onValuesChange={setFocoFilter}
                // TRÊS opções: uma caixa de busca sobre elas é ruído puro. É a
                // mesma decisão que o Histórico tomou com os seus 25/50/100.
                hideSearch
                hideWhenEmpty={false}
                options={FOCO_OPTIONS}
                testId="select-foco-filter"
                fullWidth={useCards}
              />
            </div>
          </>
        )}
        {!useCards && resultado}
      </div>

      {/* ── FAIXA 2: os atalhos e o resultado ───────────────────────────────
          AS VISÕES MORAM AQUI, e não numa fileira própria acima: visão salva
          É um conjunto de filtros (cada uma é literalmente um link com os
          parâmetros), então pertence à barra de filtros — e herda o sticky.
          No celular elas DESLIZAM numa linha (com a borda direita esmaecida
          dizendo que há mais), em vez de empilhar quatro andares de pílulas
          antes da primeira peça. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: useCards ? "wrap" : "nowrap", minWidth: 0, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <div
          aria-label="Visões salvas" role="group"
          className={useCards ? "pnl-visoes pnl-visoes-rolam" : "pnl-visoes"}
          style={{ display: "flex", flexWrap: useCards ? "nowrap" : "wrap", gap: 6, alignItems: "center", minWidth: 0, flex: "1 1 auto", ...(useCards ? { width: "100%", overflowX: "auto", paddingBottom: 2 } : null) }}
        >
          {!useCards && (
            <span aria-hidden="true" style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", color: T.second, marginRight: 4, whiteSpace: "nowrap" }}>Visões</span>
          )}
          {visoes.map(v => {
            // 44 no toque, 36 no ponteiro — o piso de alvo da casa.
            const alturaVisao = alvo(36, dedo);
            const ativa = visaoEstaAtiva(v, filtrosAtuais);
            const ehPadrao = visaoPadrao === v.id;
            return (
              <span
                key={v.id}
                className="pnl-visao"
                data-ativa={ativa ? "1" : "0"}
                style={{ display: "inline-flex", alignItems: "center", flexShrink: 0, borderRadius: R.pill, border: `1px solid ${ativa ? T.accentText : T.border}`, backgroundColor: ativa ? TOM.laranja.bg : T.surface, overflow: "hidden" }}
              >
                <button
                  onClick={() => aplicarVisao(v)}
                  aria-pressed={ativa}
                  title={v.hint}
                  data-testid={`visao-${v.id}`}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 6px 0 12px", height: alturaVisao, fontSize: FS.meta, fontWeight: ativa ? FW.forte : FW.medio, color: ativa ? T.accentText : T.strong, whiteSpace: "nowrap", fontFamily: "inherit" }}
                >
                  {v.label}
                </button>
                <button
                  onClick={() => fixarVisaoPadrao(v)}
                  aria-pressed={ehPadrao}
                  className="pnl-pino"
                  data-fixa={ehPadrao ? "1" : "0"}
                  title={ehPadrao ? "Deixar de abrir o Painel nesta visão" : "Abrir o Painel nesta visão por padrão"}
                  aria-label={ehPadrao ? `Deixar de usar "${v.label}" como visão padrão` : `Usar "${v.label}" como visão padrão`}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 10px 0 6px", height: alturaVisao, minWidth: dedo ? 36 : 28, display: "flex", alignItems: "center", justifyContent: "center", color: ehPadrao ? T.accentText : T.second }}
                >
                  {/* PIN, não CHECK. O ✓ é o glifo que o app inteiro usa para
                      "este recorte está ligado"; fixar é outra ideia e ganha
                      outro glifo. O estado real vive no aria-pressed. */}
                  <Pin style={{ width: 12, height: 12, fill: ehPadrao ? "currentColor" : "none" }} aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>

        {useCards && resultado}
      </div>
    </div>
  );
}
