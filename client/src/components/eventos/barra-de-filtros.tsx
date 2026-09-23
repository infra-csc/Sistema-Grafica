// A faixa de filtros de Eventos: busca, prioridade, patrocinador, mês,
// próximos 10 dias, os três alternadores de situação, o contador e a densidade.
import { Search, Truck, LayoutGrid, List as ListIcon } from "lucide-react";
import { T, FS, R, TOM, FONT } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
import { FilterSelect, ShortcutPill } from "@/components/filter-select";
import type { FiltrosDeEventos } from "./use-filtros-de-eventos";
import type { EventosFiltrados } from "./use-eventos-filtrados";

export function BarraDeFiltros({ filtros, recorte, totalDeEventos, carregado, isMobile, dedo }: {
  filtros: FiltrosDeEventos;
  recorte: EventosFiltrados;
  totalDeEventos: number;
  /** Lista carregada sem erro: só então há o que contar. */
  carregado: boolean;
  isMobile: boolean;
  dedo: boolean;
}) {
  const {
    searchRef, searchInput, setSearchInput, searchTerm, selectedPriorities, setSelectedPriorities,
    selectedSponsorFilter, setSelectedSponsorFilter, monthFilter, setMonthFilter,
    next10DaysFilter, setNext10DaysFilter, situacoes, alternarSituacao, densidade, setDensidade,
    clearAllEventFilters,
  } = filtros;
  const {
    priorityFilterOptions, sponsorFilterOptions, monthOptions, contagemPorSituacao, hasActiveFilters,
    filteredEvents, foraPorSituacao, incluirSituacoesOcultas, nomesDasSituacoesOcultas,
  } = recorte;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', paddingBottom: isMobile ? '10px' : '16px', borderBottom: `1px solid ${T.border}` }}>

      <div style={{ position: 'relative', flexShrink: 0, width: isMobile ? '100%' : undefined }}>
        <Search style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: T.muted, width: '13px', height: '13px', pointerEvents: 'none' }} />
        <input
          ref={searchRef}
          placeholder="Buscar evento ou patrocinador..."
          aria-label="Buscar eventos por nome ou patrocinador"
          title="Atalho: pressione / para focar a busca"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          data-testid="input-search-events"
          style={{ paddingLeft: '32px', paddingRight: '12px', height: alvo(32, dedo), width: isMobile ? '100%' : '230px', border: `1px solid ${T.border}`, borderRadius: R.pill, backgroundColor: T.surface, fontSize: FS.body, color: T.dark, fontFamily: 'inherit' }}
          onFocus={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(253,118,26,0.12)'; }}
          onBlur={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = 'none'; }}
        />
      </div>

      {/* Divisor — só no desktop; no mobile a busca ocupa a linha inteira e o traço ficava órfão */}
      {!isMobile && (
        <div style={{ width: '1px', height: '20px', backgroundColor: T.border, flexShrink: 0 }} />
      )}

      {/* O rótulo diz as DUAS dimensões que o menu recorta. "Todas as
          prioridades" era uma promessa que o menu já não cumpria: metade das
          opções nunca foi prioridade. `hideSearch` porque a lista é curta e
          FIXA (8 opções) — e porque a busca do FilterSelect não atravessa
          opções agrupadas, então um campo aqui seria um campo que não faz
          nada. */}
      {/* VOLTOU A SER SÓ PRIORIDADE. O rótulo prometia "situação" porque o
          menu misturava PRIORITY com LIFECYCLE_FILTERS; com a situação num
          controle próprio, a promessa deixaria de ser cumprida. */}
      <FilterSelect
        label="Todas as prioridades"
        allLabel="Todas as prioridades"
        values={selectedPriorities}
        onValuesChange={(v) => setSelectedPriorities(v)}
        options={priorityFilterOptions}
        hideSearch
        testId="filter-priority"
      />

      <FilterSelect
        label="Patrocinador"
        allLabel="Todos os patrocinadores"
        values={selectedSponsorFilter}
        onValuesChange={setSelectedSponsorFilter}
        options={sponsorFilterOptions}
        searchPlaceholder="Buscar patrocinador..."
        testId="filter-sponsor"
      />

      <FilterSelect
        label="Mês"
        allLabel="Todos os meses"
        value={monthFilter}
        onChange={setMonthFilter}
        options={monthOptions}
        showAllLabelWhenEmpty
        testId="select-month-filter"
      />

      {/* O MESMO atalho existe aqui, na Arte e na Gráfica — e aqui ele
          acendia PRETO enquanto os outros dois acendem laranja. Mesma
          pergunta ("o caminhão sai nos próximos 10 dias?"), mesma resposta
          visual: job 4 do vocabulário (components/filter-select.tsx). */}
      <ShortcutPill
        label="Próximos 10 dias"
        icon={Truck}
        active={next10DaysFilter}
        onClick={() => setNext10DaysFilter(!next10DaysFilter)}
        testId="button-next-10-days-filter"
        title="Só eventos cujo caminhão sai nos próximos 10 dias"
      />

      {/* ── SITUAÇÃO, UM CONTROLE SÓ ──

          Alternadores e não radios: radios prometem exclusão mútua, e aqui
          a pessoa combina baldes. `aria-pressed` diz isso ao leitor de tela.

          Os baldes PARTICIONAM — a soma das três contagens fecha com o
          total —, e é o que permite ler a barra como um mapa do acervo, não
          como três filtros que se sobrepõem em alguma parte que ninguém
          consegue apontar. */}
      <div role="group" aria-label="Situação dos eventos" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* `significado`: o que cada balde É. "Pendências" sozinho não dizia
            que se trata de evento que já aconteceu com peça em aberto, e
            "Arquivados" escondia que ali mora o encerrado à mão. */}
        {([
          { chave: 'ativos', rotulo: 'Ativos', cor: TOM.sucesso.dot, significado: 'em andamento — o dia do evento ainda não passou' },
          { chave: 'pendencias', rotulo: 'Pendências', cor: TOM.alerta.dot, significado: 'o dia do evento passou e ainda há peça em aberto' },
          { chave: 'arquivados', rotulo: 'Arquivados', cor: T.second, significado: 'concluídos (tudo entregue) e encerrados manualmente' },
        ] as const).map(({ chave, rotulo, cor, significado }) => {
          const ligado = situacoes.has(chave);
          return (
            <button
              key={chave}
              type="button"
              onClick={() => alternarSituacao(chave)}
              aria-pressed={ligado}
              data-testid={`toggle-situacao-${chave}`}
              title={`${rotulo}: ${significado}. ${ligado ? 'Clique para tirar da lista.' : 'Clique para trazer para a lista.'}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                height: alvo(30, dedo), padding: '0 12px', borderRadius: R.pill,
                border: `1px solid ${ligado ? T.dark : T.border}`,
                backgroundColor: ligado ? T.dark : T.surface,
                color: ligado ? T.surface : T.strong,
                font: 'inherit', fontSize: FS.body, fontWeight: 600,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: ligado ? T.surface : cor, flexShrink: 0 }} />
              {rotulo}
              <span style={{ fontFamily: FONT.mono, fontWeight: 700, opacity: ligado ? 1 : 0.75 }}>
                {contagemPorSituacao[chave]}
              </span>
            </button>
          );
        })}
      </div>
      {hasActiveFilters && (
        <button type="button" onClick={clearAllEventFilters} data-testid="button-clear-filters"
          title="Limpar busca, prioridade, patrocinador, mês e atalhos (a situação fica)"
          style={{ padding: '5px 10px', minHeight: alvo(30, dedo), borderRadius: R.pill, fontSize: FS.small, fontWeight: 600, cursor: 'pointer', border: 'none', backgroundColor: 'transparent', color: T.accentText }}>
          Limpar filtros
        </button>
      )}

      {/* Contador de resultados — plural correto ("1 de 1 eventos" era o texto antigo). */}
      {carregado && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span aria-live="polite" style={{ fontSize: FS.small, color: T.second }}>
            {filteredEvents.length === totalDeEventos
              ? `${totalDeEventos} ${totalDeEventos === 1 ? 'evento' : 'eventos'}`
              : `${filteredEvents.length} de ${totalDeEventos} ${totalDeEventos === 1 ? 'evento' : 'eventos'}`}
          </span>
          {/* Buscando por nome, o evento procurado pode estar arquivado: a
              lista mostra outros resultados e ele "não existe". Com a lista
              vazia quem avisa é o estado vazio; aqui só com resultados. */}
          {searchTerm && filteredEvents.length > 0 && foraPorSituacao.total > 0 && (
            <button
              type="button"
              onClick={incluirSituacoesOcultas}
              data-testid="button-busca-inclui-ocultos"
              title={`A busca também encontrou eventos em ${nomesDasSituacoesOcultas}`}
              style={{ fontSize: FS.small, fontWeight: 700, color: T.accentText, background: 'none', border: 'none', padding: '0 4px', minHeight: alvo(30, dedo), cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              +{foraPorSituacao.total} em {nomesDasSituacoesOcultas}
            </button>
          )}

          {/* ── CARTÕES | LISTA ──
              O cartão tem sete blocos e ~440px de altura; com 50 eventos a
              varredura é longa. A lista não substitui o cartão — responde
              outra pergunta: "onde está o evento X" em vez de "como está o
              evento X". No celular só existe cartão: a tabela de seis
              colunas não cabe em 390px, e virar cartão é o que ela faria. */}
          {!isMobile && (
            <div
              role="radiogroup"
              aria-label="Densidade da lista"
              style={{ display: 'flex', backgroundColor: T.low, padding: 2, borderRadius: R.md }}
            >
              {([
                ['cartoes', 'Cartões', LayoutGrid],
                ['lista', 'Lista', ListIcon],
              ] as const).map(([valor, rotulo, Icone]) => {
                const ativo = densidade === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    tabIndex={ativo ? 0 : -1}
                    onClick={() => setDensidade(valor)}
                    onKeyDown={(e) => {
                      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
                      e.preventDefault();
                      setDensidade(valor === 'cartoes' ? 'lista' : 'cartoes');
                    }}
                    data-testid={`toggle-densidade-${valor}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: alvo(30, dedo), padding: '0 12px', borderRadius: 6, border: 'none',
                      backgroundColor: ativo ? T.surface : 'transparent',
                      boxShadow: ativo ? '0 1px 3px rgba(0,0,0,0.10)' : 'none',
                      color: ativo ? T.text : T.second,
                      font: 'inherit', fontSize: FS.body, fontWeight: ativo ? 700 : 600,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    <Icone aria-hidden="true" style={{ width: 13, height: 13 }} />
                    {rotulo}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
