import { useRef } from "react";
import { Calendar, ChevronDown, Filter, Search, Truck, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { FilterSelect, ShortcutPill } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { useAcompanharAreaVisivel } from "@/components/grafica/area-visivel";
import { alvo, ALVO_TOQUE } from "@/hooks/use-mobile";
import type { ArteSortMode, PeriodFilter, TriState } from "@/lib/arte-rules";
import { T, TOM, N, R, FS } from "@/lib/theme";
import { ARTE_SORT_OPTIONS, fsToque } from "./constantes";
import type { OpcaoDeFiltro } from "./tipos";
import type { FiltrosDaArte } from "./use-filtros-da-arte";

/**
 * O ORDENAR da Arte — um só, em dois lugares: na barra da busca (desktop e
 * tablet, com rótulo) e, no celular, como o ícone ⇅ de 44px ao lado do seletor
 * de fase (`somenteIcone`: o critério escolhido vai no aria-label e no title).
 * Mesmo estado e mesma URL (?ordem=).
 */
export function OrdenarDaArte({ filtros, somenteIcone = false }: { filtros: FiltrosDaArte; somenteIcone?: boolean }) {
  return (
    <FilterSelect
      kind="sort" hideSearch hideWhenEmpty={false}
      label="Ordenar"
      value={filtros.sortMode}
      onChange={v => filtros.setSortMode(v as ArteSortMode)}
      options={ARTE_SORT_OPTIONS}
      panelWidth={190}
      dropdownAlign="right"
      somenteIcone={somenteIcone}
      testId="select-ordenar"
    />
  );
}

// À vista: a busca (o gesto mais usado), o Evento, o "Saída 10 dias" e o
// Ordenar. O resto — os mesmos controles, estado e URL — mora atrás de "Mais
// filtros": no desktop uma faixa que se expande logo abaixo (não modal: a
// lista continua viva por baixo), no celular a folha de tela cheia da Gráfica.
export function BarraDeFiltros({
  filtros, isMobile, dedo, activeTab, atrasadasNaAba, faseAtualCount, saida10Count, nFiltrosEscondidos,
  eventFilterOptions, sponsorFilterOptions, typeFilterOptions, materialFilterOptions, monthFilterOptions, periodFilterOptions, semOrdenar = false,
}: {
  filtros: FiltrosDaArte;
  isMobile: boolean;
  dedo: boolean;
  activeTab: string;
  atrasadasNaAba: number;
  faseAtualCount: number;
  saida10Count: number;
  nFiltrosEscondidos: number;
  eventFilterOptions: OpcaoDeFiltro[];
  sponsorFilterOptions: OpcaoDeFiltro[];
  typeFilterOptions: OpcaoDeFiltro[];
  materialFilterOptions: OpcaoDeFiltro[];
  monthFilterOptions: OpcaoDeFiltro[];
  periodFilterOptions: OpcaoDeFiltro[];
  /** O Ordenar mora ao lado do seletor de fase (celular e área estreita). */
  semOrdenar?: boolean;
}) {
  const {
    searchFilter, setSearchFilter, eventFilter, setEventFilter, sponsorFilter, setSponsorFilter,
    typeFilter, setTypeFilter, materialFilter, setMaterialFilter, monthFilter, setMonthFilter,
    periodFilter, setPeriodFilter, next10DaysFilter, setNext10DaysFilter, atrasadoFilter, setAtrasadoFilter,
    urgenteFilter, setUrgenteFilter, thumbFilter, setThumbFilter, finalFilter, setFinalFilter,
    maisFiltrosAberto, alternarMaisFiltros, limparFiltrosEscondidos,
    filtrosAbertosMobile, setFiltrosAbertosMobile,
  } = filtros;
  const folhaFiltrosRef = useRef<HTMLDivElement>(null);
  // Teclado virtual aberto numa busca de dentro da folha: o rodapé sobe junto.
  useAcompanharAreaVisivel(folhaFiltrosRef, "tela-cheia", isMobile && filtrosAbertosMobile);

  const campoBusca = (
    // Base de 260px (era 180): quando a faixa quebra (notebook/tablet), a
    // quebra leva "Mais filtros" JUNTO com o Ordenar — com 180 o Ordenar
    // caía sozinho numa segunda linha, órfão, em 1024px.
    <div style={{ position: 'relative', flex: isMobile ? '1 1 180px' : '1 1 260px', minWidth: isMobile ? 0 : 160 }}>
      <Search style={{ width: 14, height: 14, color: T.apoio, position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      <input
        type="text"
        value={searchFilter}
        onChange={e => setSearchFilter(e.target.value)}
        placeholder="Buscar por ID, peça, descrição ou evento..."
        aria-label="Buscar por ID, peça, descrição ou evento"
        data-testid="input-search-filter"
        // 16px no toque: abaixo disso o Safari dá zoom na página ao focar.
        style={{ width: '100%', height: alvo(36, dedo), paddingLeft: 30, paddingRight: 10, borderRadius: R.md, border: searchFilter ? `1px solid ${T.accent}` : `1px solid ${T.border}`, backgroundColor: T.surface, color: T.text, fontSize: dedo ? FS.lead : FS.body, boxSizing: 'border-box' }}
      />
    </div>
  );

  // Os gatilhos escondidos. `cheio` = empilhados na folha do celular,
  // cada um na largura toda (o mesmo que a Gráfica faz na dela).
  const gatilhos = (cheio: boolean) => (<>
  <FilterSelect
    fullWidth={cheio}
    label="Patrocinador" allLabel="Todos os patrocinadores"
    values={sponsorFilter} onValuesChange={setSponsorFilter}
    options={sponsorFilterOptions}
    searchPlaceholder="Buscar patrocinador..." emptyText="Nenhum patrocinador encontrado."
    testId="select-sponsor-filter"
  />

  <FilterSelect
    fullWidth={cheio}
    label="Tipo de Peça" allLabel="Todos os tipos"
    values={typeFilter} onValuesChange={setTypeFilter}
    options={typeFilterOptions}
    searchPlaceholder="Buscar tipo..." emptyText="Nenhum tipo encontrado."
    testId="select-type-filter"
  />

  <FilterSelect
    fullWidth={cheio}
    label="Material" allLabel="Todos os materiais"
    values={materialFilter} onValuesChange={setMaterialFilter}
    options={materialFilterOptions}
    searchPlaceholder="Buscar material..." emptyText="Nenhum material encontrado."
    testId="select-material-filter"
  />

  {/* Mês da saída — `?mes=` era o único recorte da tela SEM controle:
      chegava por link, aparecia no chip "Mês: Agosto" e não tinha
      onde ser escolhido nem reescolhido. A Gráfica já oferece a mesma
      dimensão sobre a mesma data; tirá-la daqui quebraria a paridade
      entre as duas telas e apagaria em silêncio os links já
      compartilhados que carregam `?mes=`. */}
  <FilterSelect
    fullWidth={cheio}
    hideSearch hideWhenEmpty={false}
    label="Mês" allLabel="Todos os meses"
    values={monthFilter} onValuesChange={setMonthFilter}
    options={monthFilterOptions}
    emptyText="Nenhuma saída de caminhão nesta fila."
    unitLabel={{ one: "mês", many: "meses" }}
    panelWidth={210}
    testId="select-month-filter"
  />

  {/* Período — job 5 do vocabulário (components/filter-select.tsx).
      Eram cinco botões de uma dimensão só, mutuamente exclusivos,
      gastando a largura de três gatilhos ao lado dos menus que fazem
      a mesma pergunta. Como faixa não tinha contagem nenhuma; como
      gatilho, cada janela diz quantas peças entrega. Mesmo desenho do
      Período dos Registros. */}
  <FilterSelect
    fullWidth={cheio}
    hideSearch hideWhenEmpty={false} showAllLabelWhenEmpty
    label="Período" allLabel="Todos os períodos"
    icon={Calendar}
    value={periodFilter === "Todos" ? "all" : periodFilter}
    onChange={v => setPeriodFilter(v === "all" ? "Todos" : (v as PeriodFilter))}
    options={periodFilterOptions}
    panelWidth={190}
    testId="select-period-filter"
  />
  </>);

  // "SAÍDA 10 DIAS" SEMPRE À VISTA (dono, 22/09: "não deixe no Mais
  // filtros, deixe fora, na tela da Arte"). É o recorte do dia a dia
  // — o caminhão que sai já —, e a pílula diz o próprio estado (✓ e
  // contagem), por isso não conta em "Mais filtros (N)". Mesmo
  // estado e mesma URL (?saida10=) de antes.
  const saida10 = (
    <ShortcutPill
      label="Saída 10 dias"
      icon={Truck}
      count={saida10Count}
      active={next10DaysFilter}
      onClick={() => setNext10DaysFilter(!next10DaysFilter)}
      testId="button-next-10-days-filter"
      title="Só peças de evento cujo caminhão sai nos próximos 10 dias"
    />
  );

  // ALVO DE 44px NO CELULAR (revisão 22/09): os quatro segmentados
  // tinham a faixa com 44px mas cada botão com 38px (margem de 3px).
  // No celular a faixa acompanha o botão, que tem 44×44 no mínimo.
  const segmentos = (<>
  {/* SEGMENTADOS, e nao menus: decisao do dono (17/08) depois de ver
      os quatro como FilterSelect. O resto do vocabulario continua
      valendo na tela — ORDENAR POR, a faixa de periodo e o seletor
      de fase do celular seguem padronizados; sao ESTES quatro que
      ficam segmentados, porque aqui a opcao visivel sem abrir menu
      vale mais que a uniformidade.
      Por isso nao ha contagem por opcao: um segmentado mostra os
      estados, nao quantas linhas cada um entrega. */}
  {/* Prazo — o recorte que o dono pediu. "Atrasada" é medida contra o
      marco da FASE (Entrega de Layouts −20 / Aprovação de Layout −12 /
      Finalização −10, os mesmos do funil da Gestão de Prazos),
      nunca contra a saída do caminhão: a saída é o prazo mais folgado
      do fluxo e por ela quase nada apareceria. Mesma `phaseDeadline`
      da coluna Prazo — o filtro entrega o conjunto dos selos "Nd
      atrasado" que já estão na tela. Ver lib/arte-rules.
      Em Finalizados o marco É a saída, que numa peça pronta já passou
      por definição: lá o recorte não existe em vez de mentir. */}
  <div role="group" aria-label="Prazo da fase" data-testid="segment-atrasado"
    style={{ display: 'flex', alignItems: 'center', gap: 2, height: isMobile ? 'auto' : 36, padding: isMobile ? 0 : '0 3px', borderRadius: 9, background: N.n2, border: `1px solid ${T.border}`, boxSizing: 'border-box', flexShrink: 0 }}>
    <span style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: T.apoio, padding: '0 6px 0 8px' }}>Prazo</span>
    {([
      { on: false, label: 'todos' },
      { on: true, label: 'atrasados' },
    ] as { on: boolean; label: string }[]).map(({ on, label }) => {
      const bloqueado = on && activeTab === "finalizados";
      const ativo = atrasadoFilter === on;
      return (
        <button key={label} onClick={() => { if (!bloqueado) setAtrasadoFilter(on); }}
          aria-pressed={ativo} disabled={bloqueado}
          data-testid={`button-atrasado-${on ? 'sim' : 'nao'}`}
          title={bloqueado
            ? "Em Finalizados o marco é a própria saída do caminhão, que numa peça pronta já passou — não há atraso a apontar"
            : on ? "Só peças que já passaram do marco desta fase" : undefined}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'stretch', margin: isMobile ? 0 : '3px 0', minHeight: dedo ? ALVO_TOQUE : undefined, minWidth: dedo ? ALVO_TOQUE : undefined, justifyContent: 'center', padding: '0 10px', borderRadius: 6, border: 'none', cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? 0.5 : 1, fontSize: fsToque(11, dedo), fontWeight: ativo ? 700 : 600, background: ativo ? T.surface : T.bg, color: ativo ? T.text : T.apoio, boxShadow: ativo ? `inset 0 -2px 0 ${T.text}` : 'none', transition: 'all 0.12s' }}>
          {label}
          {on && !bloqueado && (
            // A contagem vive no controle: o recorte diz QUANTOS são
            // antes de ser clicado, como as abas e os dropdowns fazem.
            <span data-testid="badge-atrasadas-count"
              // Contrastes (texto ≤13px exige 4,5:1):
              // #991b1b sobre #fef2f2 = 7,60:1 ✓ · #57534e sobre
              // #e7e5e4 = 6,00:1 ✓
              style={{ padding: '0 6px', borderRadius: 999, fontSize: fsToque(11, dedo), fontWeight: 700, lineHeight: '16px', background: atrasadasNaAba > 0 ? TOM.perigo.bg : T.border, color: atrasadasNaAba > 0 ? TOM.perigo.text : T.apoio }}>
              {atrasadasNaAba}
            </span>
          )}
        </button>
      );
    })}
  </div>

  <div role="group" aria-label="Prioridade" data-testid="segment-urgente"
    style={{ display: 'flex', alignItems: 'center', gap: 2, height: isMobile ? 'auto' : 36, padding: isMobile ? 0 : '0 3px', borderRadius: 9, background: N.n2, border: `1px solid ${T.border}`, boxSizing: 'border-box', flexShrink: 0 }}>
    <span style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: T.apoio, padding: '0 6px 0 8px' }}>Prioridade</span>
    {([
      { on: false, label: 'todas' },
      { on: true, label: 'urgentes' },
    ] as { on: boolean; label: string }[]).map(({ on, label }) => (
      <button key={label} onClick={() => setUrgenteFilter(on)} aria-pressed={urgenteFilter === on}
        data-testid={`button-urgente-${on ? 'sim' : 'nao'}`}
        style={{ alignSelf: 'stretch', margin: isMobile ? 0 : '3px 0', minHeight: dedo ? ALVO_TOQUE : undefined, minWidth: dedo ? ALVO_TOQUE : undefined, justifyContent: 'center', padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: fsToque(11, dedo), fontWeight: urgenteFilter === on ? 700 : 600, background: urgenteFilter === on ? T.surface : T.bg, color: urgenteFilter === on ? T.text : T.apoio, boxShadow: urgenteFilter === on ? `inset 0 -2px 0 ${T.text}` : 'none', transition: 'all 0.12s' }}>
        {label}
      </button>
    ))}
  </div>

  {/* "Sem thumb" e "Com thumb" eram dois booleanos independentes:
      ligados juntos descartavam TUDO por construção e a lista ficava
      vazia com o texto genérico de "2 filtros ativos". */}
  {([
    { rotulo: 'Thumb', value: thumbFilter, set: setThumbFilter, testId: 'segment-thumb' },
    { rotulo: 'Arquivo final', value: finalFilter, set: setFinalFilter, testId: 'segment-final' },
  ] as { rotulo: string; value: TriState; set: (v: TriState) => void; testId: string }[]).map(({ rotulo, value, set, testId }) => (
    <div key={testId} role="group" aria-label={rotulo} data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', gap: 2, height: isMobile ? 'auto' : 36, padding: isMobile ? 0 : '0 3px', borderRadius: 9, background: N.n2, border: `1px solid ${T.border}`, boxSizing: 'border-box', flexShrink: 0 }}>
      <span style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: T.apoio, padding: '0 6px 0 8px' }}>{rotulo}</span>
      {([
        { v: 'todos', label: 'todos' },
        { v: 'com', label: 'com' },
        { v: 'sem', label: 'sem' },
      ] as { v: TriState; label: string }[]).map(({ v, label }) => (
        <button key={v} onClick={() => set(v)} aria-pressed={value === v}
          style={{ alignSelf: 'stretch', margin: isMobile ? 0 : '3px 0', minHeight: dedo ? ALVO_TOQUE : undefined, minWidth: dedo ? ALVO_TOQUE : undefined, justifyContent: 'center', padding: '0 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: fsToque(11, dedo), fontWeight: value === v ? 700 : 600, background: value === v ? T.surface : T.bg, color: value === v ? T.text : T.apoio, boxShadow: value === v ? `inset 0 -2px 0 ${T.text}` : 'none', transition: 'all 0.12s' }}>
          {label}
        </button>
      ))}
    </div>
  ))}
  </>);

  // Ordenação — a regra de negócio inteira é ancorada na saída do
  // caminhão e a lista só sabia ordenar por nome de evento. Não é
  // filtro (não conta no "Mais filtros (N)" nem vira chip) e fica
  // SEMPRE À VISTA, na barra da busca e do Evento: o dono respondeu
  // (22/09) que a Arte usa muito — escondido, custava dois cliques.
  // No celular o divisor vertical ficaria sozinho numa linha,
  // separando nada de nada.
  // No celular o Ordenar NÃO mora aqui: vira o ícone ⇅ ao lado do seletor de
  // fase (OrdenarDaArte em FasesESelecao) — a linha própria dele custava 52px
  // antes da primeira peça.
  const ordenar = (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
    <span aria-hidden="true" style={{ width: 1, height: 20, background: T.border }} />
    <OrdenarDaArte filtros={filtros} />
  </div>
  );

  const botaoLimparEscondidos = nFiltrosEscondidos > 0 && (
    <Botao variante="secundario" tamanho={dedo ? "toque" : "sm"} icone={X} onClick={limparFiltrosEscondidos} data-testid="button-limpar-mais-filtros"
      // #b91c1c sobre branco = 6,47:1 ✓ — o vermelho de "desfazer" da casa.
      style={{ borderColor: TOM.perigo.border, color: TOM.perigo.text }}>
      Limpar estes filtros
    </Botao>
  );

  if (isMobile) return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {campoBusca}
          <button
            type="button"
            onClick={() => setFiltrosAbertosMobile(true)}
            aria-haspopup="dialog"
            aria-expanded={filtrosAbertosMobile}
            aria-controls="arte-folha-filtros"
            data-testid="button-abrir-filtros-mobile"
            style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 12px', borderRadius: 8, border: `1px solid ${nFiltrosEscondidos > 0 ? TOM.laranja.border : T.border}`, background: nFiltrosEscondidos > 0 ? TOM.laranja.bg : T.surface, color: nFiltrosEscondidos > 0 ? T.accentText : T.strong, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            <Filter aria-hidden="true" style={{ width: 15, height: 15 }} />
            Filtros{nFiltrosEscondidos > 0 ? ` (${nFiltrosEscondidos})` : ''}
          </button>
        </div>
        {/* O Evento à vista e, NA MESMA LINHA, o "Saída 10 dias" (revisão
            de celular, 24/09): em 336px úteis o Evento fica com ≥ 130px
            mesmo com o X de limpar, e a linha própria do "Saída" e do
            Ordenar (52px) sai da frente da primeira peça. O X limpa só o
            evento. */}
        <div data-testid="filtro-evento-mobile" style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%' }}>
          <div style={{ flex: '1 1 0', minWidth: 0 }}>
            <EventFilterDropdown values={eventFilter} onValuesChange={setEventFilter} options={eventFilterOptions} fullWidth />
          </div>
          {eventFilter.length > 0 && (
            <button type="button" onClick={() => setEventFilter([])} data-testid="button-limpar-evento-mobile"
              aria-label="Limpar o filtro de evento" title="Limpar o filtro de evento"
              style={{ flex: '0 0 44px', width: 44, height: 44, borderRadius: 8, border: `1px solid ${T.bdark}`, background: T.surface, color: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X aria-hidden="true" style={{ width: 16, height: 16 }} />
            </button>
          )}
          <div style={{ flex: '0 0 auto' }}>{saida10}</div>
        </div>
      </div>

      {filtrosAbertosMobile && (
        <div
          ref={folhaFiltrosRef}
          id="arte-folha-filtros"
          role="dialog"
          aria-modal="true"
          aria-label="Mais filtros da Arte"
          data-testid="folha-filtros-mobile"
          onKeyDown={e => { if (e.key === 'Escape') setFiltrosAbertosMobile(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 90, height: '100dvh', backgroundColor: T.bg, display: 'flex', flexDirection: 'column', overscrollBehavior: 'contain' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 'calc(6px + env(safe-area-inset-top))', paddingBottom: 6, paddingLeft: 14, paddingRight: 6, borderBottom: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            <Filter aria-hidden="true" style={{ width: 16, height: 16, color: T.apoio }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
              Filtros{nFiltrosEscondidos > 0 ? ` · ${nFiltrosEscondidos} ativo${nFiltrosEscondidos !== 1 ? 's' : ''}` : ''}
            </span>
            <span style={{ flex: 1 }} />
            <button type="button" autoFocus onClick={() => setFiltrosAbertosMobile(false)} aria-label="Fechar filtros" data-testid="button-fechar-filtros-mobile"
              style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', color: T.apoio, cursor: 'pointer' }}>
              <X aria-hidden="true" style={{ width: 20, height: 20 }} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gatilhos(true)}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
              {segmentos}
            </div>
          </div>
          {/* Rodapé fixo com o recorte seguro embaixo (home indicator),
              nos LONGOS — o atalho com env() some no parser do jsdom. */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 10, paddingLeft: 14, paddingRight: 14, paddingBottom: 'calc(10px + env(safe-area-inset-bottom))', borderTop: `1px solid ${T.border}`, backgroundColor: T.surface }}>
            {nFiltrosEscondidos > 0 && (
              <Botao variante="secundario" tamanho="toque" onClick={limparFiltrosEscondidos} data-testid="button-limpar-mais-filtros"
                style={{ minHeight: 48, color: TOM.perigo.text, borderColor: TOM.perigo.border, fontSize: FS.body }}>
                Limpar ({nFiltrosEscondidos})
              </Botao>
            )}
            <Botao variante="primario" tamanho="toque" onClick={() => setFiltrosAbertosMobile(false)} data-testid="button-aplicar-filtros-mobile"
              style={{ flex: 1, minHeight: 48 }}>
              Ver {faseAtualCount} {faseAtualCount === 1 ? 'peça' : 'peças'}
            </Botao>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {campoBusca}
        <EventFilterDropdown values={eventFilter} onValuesChange={setEventFilter} options={eventFilterOptions} />
        {saida10}
        <button
          type="button"
          onClick={alternarMaisFiltros}
          aria-expanded={maisFiltrosAberto}
          aria-controls="arte-mais-filtros"
          data-testid="button-mais-filtros"
          // Ativo = laranja claro com texto #9a3412 (7,3:1 sobre #fff7ed ✓);
          // aberto sem nada ligado = grafite, para ler "está aberto".
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: alvo(36, dedo), padding: '0 12px', borderRadius: R.md, border: `1px solid ${nFiltrosEscondidos > 0 ? TOM.laranja.border : maisFiltrosAberto ? T.text : T.border}`, background: nFiltrosEscondidos > 0 ? TOM.laranja.bg : T.surface, color: nFiltrosEscondidos > 0 ? T.accentText : T.strong, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          <Filter aria-hidden="true" style={{ width: 14, height: 14 }} />
          Mais filtros{nFiltrosEscondidos > 0 ? ` (${nFiltrosEscondidos})` : ''}
          <ChevronDown aria-hidden="true" style={{ width: 14, height: 14, transform: maisFiltrosAberto ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
        </button>
        {!semOrdenar && ordenar}
      </div>

      {/* ── Filter Row 2 ── */}
      {/* UM idioma para filtro, OUTRO para ordenação.
          A faixa falava QUATRO: chip ligado/desligado, segmentado de dois
          estados, segmentado de três estados e um <select> NATIVO — que
          abria o menu do Windows, com a fonte e o azul do sistema, no meio
          de uma faixa inteiramente desenhada pela casa. Quatro formas para
          duas funções, e a única diferença que importa (filtrar × ordenar)
          era a que não aparecia.
          Agora os quatro recortes são o mesmo gatilho do job 1 do
          vocabulário (components/filter-select.tsx) — o segmentado com
          rótulo à esquerda gastava a largura de três gatilhos para caber
          um, não tinha contagem por opção e não escalava quando a terceira
          opção aparecia. E a ordenação é o job 6: mesma peça, paleta
          GRAFITE, prefixo "Ordenar:" e sem × — quem bate o olho lê "os
          laranjas recortam, o cinza reordena" sem ler uma palavra. */}
      {maisFiltrosAberto && (
        <div id="arte-mais-filtros" data-testid="faixa-mais-filtros" style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8, padding: 10, borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {gatilhos(false)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${N.n3}`, paddingTop: 8 }}>
            <span style={{ fontSize: fsToque(11, dedo), fontWeight: 700, color: T.apoio, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Mostrar:</span>
            {segmentos}
          </div>
          {botaoLimparEscondidos && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{botaoLimparEscondidos}</div>
          )}
        </div>
      )}
    </>
  );
}
