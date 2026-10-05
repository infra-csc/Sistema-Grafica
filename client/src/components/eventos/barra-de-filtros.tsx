// A faixa de filtros de Eventos: busca, prioridade, patrocinador, mês,
// próximos 10 dias, os três alternadores de situação, a ordem, a densidade —
// e a legenda da lista (quantos, e por que nesta ordem).
import { Search, Truck, LayoutGrid, List as ListIcon, X } from "lucide-react";
import { T, FS, R, TOM, FONT, FW, SHADOW } from "@/lib/theme";
import { alvo } from "@/hooks/use-mobile";
import { FilterSelect, ShortcutPill } from "@/components/filter-select";
import { REGRA_DA_ORDEM } from "./regras";
import type { FiltrosDeEventos } from "./use-filtros-de-eventos";
import type { EventosFiltrados } from "./use-eventos-filtrados";

export function BarraDeFiltros({ filtros, recorte, totalDeEventos, carregado, isMobile, dedo, ordem: controleDeOrdem }: {
  filtros: FiltrosDeEventos;
  recorte: EventosFiltrados;
  totalDeEventos: number;
  /** Lista carregada sem erro: só então há o que contar. */
  carregado: boolean;
  isMobile: boolean;
  dedo: boolean;
  /** O controle de ordem (BarraDeOrdem) — mora na fileira da situação. */
  ordem?: React.ReactNode;
}) {
  const {
    searchRef, searchInput, setSearchInput, searchTerm, selectedPriorities, setSelectedPriorities,
    selectedSponsorFilter, setSelectedSponsorFilter, monthFilter, setMonthFilter,
    next10DaysFilter, setNext10DaysFilter, situacoes, alternarSituacao, densidade, setDensidade,
    clearAllEventFilters, ordem,
  } = filtros;
  const {
    priorityFilterOptions, sponsorFilterOptions, monthOptions, contagemPorSituacao, hasActiveFilters,
    filteredEvents, foraPorSituacao, incluirSituacoesOcultas, nomesDasSituacoesOcultas,
  } = recorte;

  // No celular cada fileira vira UMA linha que rola de lado (sangrando até a
  // borda da tela), em vez de empilhar cinco andares antes do primeiro evento.
  const fileiraQueRola: React.CSSProperties = isMobile
    ? { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', overflowX: 'auto', margin: '0 -12px', padding: '0 12px' }
    : { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 10 : 12 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: isMobile ? 12 : 14, borderBottom: `1px solid ${T.border}` }}>

      {/* ── FILEIRA 1: o que RECORTA a lista ── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flexWrap: isMobile ? undefined : 'wrap', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 8 }}>
      <div style={{ position: 'relative', flexShrink: 0, width: isMobile ? '100%' : 260 }}>
        <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: T.muted, width: 14, height: 14, pointerEvents: 'none' }} />
        <input
          ref={searchRef}
          type="search"
          placeholder="Buscar evento ou patrocinador"
          aria-label="Buscar eventos por nome ou patrocinador"
          title="Atalho: pressione / para focar a busca"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          data-testid="input-search-events"
          className="evl-campo"
          style={{
            // A MESMA altura e o mesmo raio dos menus ao lado (FilterSelect:
            // 36 / 7px) — a busca era uma pílula de 32 numa fileira de 36.
            paddingLeft: 32, paddingRight: searchInput ? 34 : 12, height: alvo(36, dedo), width: '100%',
            border: `1px solid ${T.border}`, borderRadius: 7, backgroundColor: T.surface,
            // 16px no toque: abaixo disso o iOS dá zoom ao focar.
            fontSize: dedo ? FS.lead : FS.body, color: T.dark, fontFamily: 'inherit',
            WebkitAppearance: 'none',
          }}
        />
        {searchInput && (
          <button
            type="button"
            onClick={() => { setSearchInput(""); searchRef.current?.focus(); }}
            aria-label="Limpar a busca"
            data-testid="button-limpar-busca-eventos"
            className="evl-acao"
            data-alvo-natural
            style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: R.sm, background: 'transparent', color: T.second, cursor: 'pointer' }}
          >
            <X aria-hidden="true" style={{ width: 14, height: 14 }} />
          </button>
        )}
      </div>

      {/* Sem o traço divisor entre a busca e os menus: quando a fileira
          quebrava (tablet, janela estreita) ele ficava órfão no fim da linha. */}

      <div className={isMobile ? 'evl-rolagem' : undefined} style={isMobile ? fileiraQueRola : { ...fileiraQueRola, flex: '1 1 0', minWidth: 280 }}>
      {/* VOLTOU A SER SÓ PRIORIDADE. O rótulo prometia "situação" porque o
          menu misturava PRIORITY com LIFECYCLE_FILTERS; com a situação num
          controle próprio, a promessa deixaria de ser cumprida. `hideSearch`
          porque a lista é curta e FIXA. */}
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

      {/* O MESMO atalho existe aqui, na Arte e na Gráfica — mesma pergunta
          ("o caminhão sai nos próximos 10 dias?"), mesma resposta visual:
          job 4 do vocabulário (components/filter-select.tsx). */}
      <ShortcutPill
        label="Próximos 10 dias"
        icon={Truck}
        active={next10DaysFilter}
        onClick={() => setNext10DaysFilter(!next10DaysFilter)}
        testId="button-next-10-days-filter"
        title="Só eventos cujo caminhão sai nos próximos 10 dias"
      />

      {hasActiveFilters && (
        <button type="button" onClick={clearAllEventFilters} data-testid="button-clear-filters"
          title="Limpar busca, prioridade, patrocinador, mês e atalhos (a situação fica)"
          className="evl-chip-x"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 10px', height: alvo(30, dedo), borderRadius: R.pill, fontFamily: 'inherit', fontSize: FS.small, fontWeight: FW.forte, cursor: 'pointer', border: '1px solid transparent', backgroundColor: 'transparent', color: T.accentText, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <X aria-hidden="true" style={{ width: 12, height: 12 }} />
          Limpar filtros
        </button>
      )}
      </div>
      </div>

      {/* ── FILEIRA 2: o que se VÊ — situação (soma), ordem e densidade (escolha) ── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flexWrap: isMobile ? undefined : 'wrap', alignItems: isMobile ? 'stretch' : 'center', gap: isMobile ? 10 : 12, rowGap: 10 }}>

      {/* ── SITUAÇÃO, UM CONTROLE SÓ ──

          Alternadores e não radios: radios prometem exclusão mútua, e aqui
          a pessoa combina baldes. `aria-pressed` diz isso ao leitor de tela.

          Os baldes PARTICIONAM — a soma das três contagens fecha com o
          total —, e é o que permite ler a barra como um mapa do acervo, não
          como três filtros que se sobrepõem em alguma parte que ninguém
          consegue apontar. */}
      <div role="group" aria-label="Situação dos eventos" className={isMobile ? 'evl-rolagem' : undefined} style={{ ...fileiraQueRola, gap: 6, flexWrap: 'nowrap' }}>
        {/* `significado`: o que cada balde É. "Pendências" sozinho não dizia
            que se trata de evento que já aconteceu com peça em aberto, e
            "Encerrados" (era "Arquivados") junta o concluído e o encerrado à mão;
            "Arquivados" agora é só o que foi excluído (e pode ser restaurado). */}
        {([
          { chave: 'ativos', rotulo: 'Ativos', cor: TOM.sucesso.dot, significado: 'em andamento — o dia do evento ainda não passou' },
          { chave: 'pendencias', rotulo: 'Pendências', cor: TOM.alerta.dot, significado: 'o dia do evento passou e ainda há peça em aberto' },
          { chave: 'arquivados', rotulo: 'Encerrados', cor: T.second, significado: 'concluídos (tudo entregue) e encerrados manualmente' },
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
              className="evl-chip"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0,
                height: alvo(32, dedo), padding: '0 12px', borderRadius: R.pill,
                border: `1px solid ${ligado ? T.dark : T.border}`,
                backgroundColor: ligado ? T.dark : T.surface,
                color: ligado ? T.surface : T.strong,
                font: 'inherit', fontSize: FS.body, fontWeight: FW.medio,
                cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: ligado ? T.surface : cor, flexShrink: 0 }} />
              {rotulo}
              {/* Sem número antes de carregar: "0" seria uma afirmação falsa. */}
              {carregado && (
                <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, fontVariantNumeric: 'tabular-nums', opacity: ligado ? 1 : 0.8 }}>
                  {contagemPorSituacao[chave]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ordem e densidade: ESCOLHAS (uma entre várias), por isso segmentadas
          — e juntas à direita, longe dos recortes. */}
      {(controleDeOrdem || !isMobile) && (
        <div style={{ marginLeft: isMobile ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
          {controleDeOrdem}

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
              style={{ display: 'flex', gap: 2, backgroundColor: T.low, padding: 2, borderRadius: R.md, border: `1px solid ${T.border}` }}
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
                      const outro = valor === 'cartoes' ? 'lista' : 'cartoes';
                      setDensidade(outro);
                      (e.currentTarget.parentElement?.querySelector(`[data-testid="toggle-densidade-${outro}"]`) as HTMLElement | null)?.focus();
                    }}
                    data-testid={`toggle-densidade-${valor}`}
                    className="evl-seg"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      height: alvo(26, dedo), padding: '0 11px', borderRadius: R.sm, border: 'none',
                      backgroundColor: ativo ? T.surface : 'transparent',
                      boxShadow: ativo ? `${SHADOW.sm}, 0 0 0 1px ${T.border}` : 'none',
                      color: ativo ? T.text : T.second,
                      font: 'inherit', fontSize: FS.body, fontWeight: ativo ? FW.forte : FW.medio,
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
    </div>

    {/* ── LEGENDA DA LISTA: quantos, e por que nesta ordem ──
        A contagem e a regra da ordem moram JUNTAS, coladas na lista: são as
        duas respostas que se procura olhando para ela ("quantos são?",
        "por que este está em cima?"). Plural correto ("1 de 1 eventos" era o
        texto antigo). */}
    {carregado && (
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8, rowGap: 2, fontSize: FS.small, color: T.second, lineHeight: 1.45 }}>
        <span aria-live="polite" style={{ fontWeight: FW.forte, color: T.strong, fontVariantNumeric: 'tabular-nums' }}>
          {filteredEvents.length === totalDeEventos
            ? `${totalDeEventos} ${totalDeEventos === 1 ? 'evento' : 'eventos'}`
            : `${filteredEvents.length} de ${totalDeEventos} ${totalDeEventos === 1 ? 'evento' : 'eventos'}`}
        </span>
        {filteredEvents.length > 1 && (
          <>
            <span aria-hidden="true" style={{ color: T.border }}>·</span>
            <span>{REGRA_DA_ORDEM[ordem]}</span>
          </>
        )}
        {/* Buscando por nome, o evento procurado pode estar encerrado: a
            lista mostra outros resultados e ele "não existe". Com a lista
            vazia quem avisa é o estado vazio; aqui só com resultados. */}
        {searchTerm && filteredEvents.length > 0 && foraPorSituacao.total > 0 && (
          <button
            type="button"
            onClick={incluirSituacoesOcultas}
            data-testid="button-busca-inclui-ocultos"
            title={`A busca também encontrou eventos em ${nomesDasSituacoesOcultas}`}
            style={{ fontFamily: 'inherit', fontSize: FS.small, fontWeight: FW.forte, color: T.accentText, background: 'none', border: 'none', padding: '0 2px', minHeight: alvo(24, dedo), cursor: 'pointer', whiteSpace: 'nowrap', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            +{foraPorSituacao.total} em {nomesDasSituacoesOcultas}
          </button>
        )}
      </div>
    )}
    </div>
  );
}
