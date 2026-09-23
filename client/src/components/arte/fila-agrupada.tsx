import { Fragment, memo, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { Clock } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Checkbox } from "@/components/ui/checkbox";
import { isAtrasadaNaFase, isUrgente } from "@/lib/arte-rules";
import { T, TOM, N } from "@/lib/theme";
import { arquivoFinalOk } from "@shared/molde";
import { ARTE_CHECKBOX_WIDTH, DICA_DA_COLUNA, colunasDaAba, tableMinWidth } from "./colunas";
import { ARTE_PAGE_SIZE, PARADA_HA_MAIS_DE, estaParada } from "./constantes";
import { CartaoDaArte } from "./cartao-da-arte";
import { FaixaDoEvento } from "./faixa-do-evento";
import { FaixaTravando } from "./faixa-travando";
import { LinhaDaArte } from "./linha-da-arte";
import { VazioDaFila } from "./vazio-da-fila";
import type { AbaDaArte, AcoesDaLinha, EventoDaPeca, PecaDaArte } from "./tipos";

export interface PropsDaFila {
  items: PecaDaArte[];
  tabId: string;
  activeTab: string;
  hoje: Date;
  dedo: boolean;
  emCartoes: boolean;
  podeEditar: boolean;
  visibleCount: number;
  setVisibleCount: Dispatch<SetStateAction<number>>;
  activeFilterCount: number;
  atrasadoFilter: boolean;
  setAtrasadoFilter: Dispatch<SetStateAction<boolean>>;
  paradasFilter: boolean;
  setParadasFilter: Dispatch<SetStateAction<boolean>>;
  urgenteFilter: boolean;
  setUrgenteFilter: Dispatch<SetStateAction<boolean>>;
  clearAllFilters: () => void;
  tabs: ReadonlyArray<AbaDaArte>;
  changeTab: (tabId: string) => void;
  paradasNaAba: number;
  atrasadasNaAba: number;
  urgentesNaAba: number;
  showAllTravando: boolean;
  setShowAllTravando: Dispatch<SetStateAction<boolean>>;
  travandoAberto: boolean;
  setTravandoAberto: Dispatch<SetStateAction<boolean>>;
  sponsorFilter: string[];
  setSponsorFilter: Dispatch<SetStateAction<string[]>>;
  finalizadosForaDaJanela: number;
  finalizadosTudo: boolean;
  setFinalizadosTudo: Dispatch<SetStateAction<boolean>>;
  groupOf: (type: string) => string;
  selectedItemIds: Set<string>;
  setSelectedItemIds: Dispatch<SetStateAction<Set<string>>>;
  sendingId: string | null;
  eventosComBook: Set<string>;
  acoes: AcoesDaLinha;
}

/**
 * A FILA agrupada por evento (e, dentro dele, pelo grupo do catálogo): a faixa
 * de atenção, "quem está travando", a janela dos Finalizados e os blocos, em
 * tabela ou em cartões.
 *
 * FRONTEIRA DE RENDER: memoizada, e a página passa só valores memoizados,
 * setters e callbacks estáveis. O motivo digitado nos modais, o arrastar de
 * arquivo, os toasts e o progresso do lote vivem na página; sem a fronteira,
 * cada tecla refazia as cem linhas e o resumo por evento, que varre a aba
 * INTEIRA.
 */
export const FilaAgrupada = memo(function FilaAgrupada({
  items, tabId, activeTab, hoje, dedo, emCartoes, podeEditar,
  visibleCount, setVisibleCount, activeFilterCount,
  atrasadoFilter, setAtrasadoFilter, paradasFilter, setParadasFilter, urgenteFilter, setUrgenteFilter,
  clearAllFilters, tabs, changeTab, paradasNaAba, atrasadasNaAba, urgentesNaAba,
  showAllTravando, setShowAllTravando, travandoAberto, setTravandoAberto, sponsorFilter, setSponsorFilter,
  finalizadosForaDaJanela, finalizadosTudo, setFinalizadosTudo, groupOf,
  selectedItemIds, setSelectedItemIds, sendingId, eventosComBook, acoes,
}: PropsDaFila) {
  // A coluna de seleção só existe nestas duas abas — nas outras a tabela não
  // deve pagar os 44px dela.
  const comSelecao = tabId === "criar-aprovacoes" || tabId === "finalizados";
  // Um conjunto de colunas por aba: só Finalizados desenha o selo de status
  // na célula de ID e só ela fica sem botão de ação primária. As outras
  // quatro continuam com ARTE_COLS, letra por letra (ver ARTE_COLS_FINALIZADOS).
  const cols = colunasDaAba(tabId);
  const minW = tableMinWidth(comSelecao, cols);
  const totalColunas = cols.length + (comSelecao ? 1 : 0);

  if (items.length === 0) {
    return (
      <VazioDaFila
        tabId={tabId}
        activeFilterCount={activeFilterCount}
        atrasadoFilter={atrasadoFilter}
        setAtrasadoFilter={setAtrasadoFilter}
        clearAllFilters={clearAllFilters}
        tabs={tabs}
        changeTab={changeTab}
        dedo={dedo}
      />
    );
  }

  // Quantas peças desta aba cada evento tem — o total da faixa do evento.
  const evSumMap = new Map<string, { id: string | null; name: string; count: number }>();
  // Contadores de "o que falta" por evento — os dados já estavam aqui, só não
  // eram compostos. Aparecem na faixa do evento, onde o olho já está.
  const evProgresso = new Map<string, { semThumb: number; semFinal: number }>();
  items.forEach(item => {
    const name = item.event?.name || 'Sem Evento';
    const id = item.eventId || null;
    const key = id || name;
    const cur = evSumMap.get(key);
    if (cur) cur.count++;
    else { const rec = { id, name, count: 1 }; evSumMap.set(key, rec); }
    const p = evProgresso.get(key) ?? { semThumb: 0, semFinal: 0 };
    if (!item.approvalThumbUrl) p.semThumb++;
    // Molde dispensa o arquivo final (shared/molde.ts) — não é "sem arquivo final".
    if (!arquivoFinalOk(item)) p.semFinal++;
    evProgresso.set(key, p);
  });

  // Diagnóstico da fase — o que as abas NÃO dizem.
  //
  // PORQUÊ ESTA FAIXA EXISTE (e onde ela mora). Os cinco stat cards do
  // cabeçalho repetiam rótulo por rótulo e número por número as cinco abas
  // 40px abaixo, e cobravam ~140px de altura fixa por isso. O que faltava era
  // o oposto: dentro da fase escolhida, o que está ATRASADO contra o marco da
  // fase e o que é de evento urgente. Fica na área rolável, junto da tabela
  // que descreve, e não no cabeçalho fixo — assim custa zero de primeira
  // dobra quando não há nada a dizer.
  //
  // A regra de atraso é UMA (`isAtrasadaNaFase`), compartilhada com o filtro
  // "Prazo: atrasados" e com a coluna Prazo — a exceção de Finalizados mora
  // lá dentro, não em cada chamador.
  const atrasadas = items.filter(i => isAtrasadaNaFase(i, tabId, hoje)).length;
  const urgentes = items.filter(i => isUrgente(i.event?.priority)).length;
  // Paradas há mais de 7d: a contagem vem da camada SEM o próprio recorte
  // (paradasNaAba), para o número do chip ser o de linhas que o clique
  // entrega — ligado ou desligado.
  const paradas = tabId === activeTab ? paradasNaAba : items.filter(i => estaParada(i, hoje)).length;

  // Só as primeiras linhas entram no DOM. Com quase mil peças numa aba, montar
  // a tabela inteira era o que travava a troca de aba e a digitação na busca.
  const shownItems = items.slice(0, visibleCount);

  // Um bloco por EVENTO (não mais por evento × tipo), com um <tbody> por grupo
  // do catálogo. Antes cada par (evento, tipo) montava uma <table> própria com
  // o cabeçalho de 9 colunas inteiro: um evento com 6 tipos reimprimia
  // "ID · QTD · PEÇA · …" seis vezes, e para leitor de tela cada uma era
  // anunciada como uma tabela nova.
  type Bloco = { key: string; chave: string; eventName: string; eventKey: string; eventObj: EventoDaPeca | null; grupos: { nome: string; items: PecaDaArte[] }[] };
  const blocos: Bloco[] = [];
  shownItems.forEach(item => {
    // KIT (14/09): as peças de uma remessa do Kit formam bloco próprio —
    // o cabeçalho mostra as datas e os marcos do Kit, não os da Arena.
    const eventName = (item.event?.name || 'Sem Evento') + (item.kitRemessaId ? ' · KIT' : '');
    const eventKey = item.eventId || eventName;
    const chave = item.kitRemessaId ? `${eventKey}#kit-${item.kitRemessaId}` : eventKey;
    const grupoNome = groupOf(item.type) || '';
    let bloco = blocos[blocos.length - 1];
    if (!bloco || bloco.chave !== chave) {
      bloco = { key: `${chave}-${blocos.length}`, chave, eventName, eventKey, eventObj: item.event, grupos: [] };
      blocos.push(bloco);
    }
    let grupo = bloco.grupos[bloco.grupos.length - 1];
    if (!grupo || grupo.nome !== grupoNome) {
      grupo = { nome: grupoNome, items: [] };
      bloco.grupos.push(grupo);
    }
    grupo.items.push(item);
  });

  // `sep` desenha o mesmo filete de 1px que a célula de M² usa: sem ele no
  // cabeçalho, "M²" ficava alinhado à direita mas a fronteira entre as duas
  // colunas só existia meia tabela abaixo.
  const thStyle = (col: { right?: boolean; sep?: boolean }): CSSProperties => ({
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.apoio,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    textAlign: col.right ? 'right' : 'left',
    borderLeft: col.sep ? `1px solid ${N.n3}` : undefined,
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* A FAIXA DE ATENÇÃO — terceira forma (dono, 09/09: "está péssimo").
          O que estava errado não era a cor: era a faixa dizer três coisas com
          três aparências diferentes e UM comportamento só no meio delas.
          "Paradas" era botão e filtrava; "passaram do marco" e "urgentes"
          eram texto morto — mesma pílula, mesmo peso, e o clique só
          funcionava num dos três. Pior: os dois mudos repetiam, com outro
          desenho, recortes que a barra "Mostrar" logo acima já oferece
          (Prazo: atrasados · Prioridade: urgentes).
          Agora os três são ATALHOS para os filtros que já existem, com a
          mesma anatomia — ponto de cor, número, rótulo curto — e o mesmo
          estado ligado/desligado. A cor saiu do fundo e virou só o ponto: o
          fundo colorido em três tons quentes fazia os três gritarem juntos,
          e o olho não tinha onde pousar primeiro. A ordem é a gravidade:
          passou do marco (o prazo já venceu) antes de parada (está devagar)
          antes de urgente (o evento é que corre). */}
      {(atrasadas > 0 || urgentes > 0 || paradas > 0) && (
        <div data-testid="faixa-diagnostico" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '7px 10px', borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.09em', textTransform: 'uppercase', color: T.second, paddingLeft: 2, flexShrink: 0 }}>
            Atenção
          </span>
          {([
            atrasadas > 0 && {
              chave: 'atrasadas' as const,
              testid: 'chip-atrasadas',
              ponto: TOM.perigo.text,
              n: tabId === activeTab ? atrasadasNaAba : atrasadas,
              rotulo: 'passaram do marco',
              ligado: atrasadoFilter,
              alternar: () => setAtrasadoFilter(!atrasadoFilter),
              titulo: atrasadoFilter
                ? 'Mostrar de novo todas as peças desta fase'
                : 'Ver só as peças que já passaram do marco desta fase',
            },
            paradas > 0 && {
              chave: 'paradas' as const,
              testid: 'chip-paradas',
              ponto: T.accentText,
              n: paradas,
              rotulo: `sem andar há ${PARADA_HA_MAIS_DE}d+`,
              ligado: paradasFilter,
              alternar: () => setParadasFilter(v => !v),
              titulo: paradasFilter
                ? 'Mostrar de novo todas as peças desta fase'
                : `Ver só as peças paradas há mais de ${PARADA_HA_MAIS_DE} dias nesta fase`,
            },
            urgentes > 0 && {
              chave: 'urgentes' as const,
              testid: 'chip-urgentes',
              ponto: TOM.alerta.text,
              n: tabId === activeTab ? urgentesNaAba : urgentes,
              rotulo: 'de eventos urgentes',
              ligado: urgenteFilter,
              alternar: () => setUrgenteFilter(!urgenteFilter),
              titulo: urgenteFilter
                ? 'Mostrar de novo as peças de todos os eventos'
                : 'Ver só as peças de eventos urgentes',
            },
          ].filter(Boolean) as Array<{ chave: string; testid: string; ponto: string; n: number; rotulo: string; ligado: boolean; alternar: () => void; titulo: string }>)
            .map(({ chave, testid, ponto, n, rotulo, ligado, alternar, titulo }) => (
              <button
                key={chave}
                type="button"
                onClick={alternar}
                aria-pressed={ligado}
                data-testid={testid}
                title={titulo}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '4px 11px', borderRadius: 999, cursor: 'pointer', font: 'inherit',
                  background: ligado ? T.text : T.surface,
                  border: `1px solid ${ligado ? T.text : T.border}`,
                  transition: 'background 0.12s, border-color 0.12s',
                }}
              >
                {/* O ponto carrega a gravidade. Ligado, ele vira branco: o
                    fundo escuro já é o sinal, e dois sinais competindo no
                    mesmo chip é o que deixava a faixa confusa. */}
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: ligado ? T.surface : ponto, flexShrink: 0 }} />
                <span style={{ fontSize: 12.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: ligado ? T.surface : T.text }}>{n}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: ligado ? T.border : T.apoio }}>{rotulo}</span>
              </button>
            ))}
        </div>
      )}

      <FaixaTravando
        items={items}
        tabId={tabId}
        hoje={hoje}
        emCartoes={emCartoes}
        dedo={dedo}
        showAllTravando={showAllTravando}
        setShowAllTravando={setShowAllTravando}
        travandoAberto={travandoAberto}
        setTravandoAberto={setTravandoAberto}
        sponsorFilter={sponsorFilter}
        setSponsorFilter={setSponsorFilter}
      />

      {/* Recorte padrão da aba Finalizados — ver dentroDaJanelaFinalizados. */}
      {tabId === "finalizados" && (finalizadosForaDaJanela > 0 || finalizadosTudo) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 14px', borderRadius: 10, background: T.bg, border: `1px solid ${T.border}` }}>
          <Clock style={{ width: 13, height: 13, color: T.apoio, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.strong }}>
            {finalizadosTudo
              ? 'Mostrando todo o histórico de peças finalizadas.'
              : `Mostrando os últimos 90 dias por saída do caminhão — ${finalizadosForaDaJanela} peça(s) mais antiga(s) estão fora deste recorte.`}
          </span>
          {/* Este botão troca o RECORTE inteiro da aba — mostra ou esconde
              tudo o que passou de 90 dias. */}
          <Botao
            variante="secundario"
            tamanho={dedo ? "toque" : "md"}
            onClick={() => setFinalizadosTudo(v => !v)}
            data-testid="button-finalizados-janela"
            style={{ marginLeft: 'auto', flexShrink: 0 }}
          >
            {finalizadosTudo ? 'Voltar aos 90 dias' : 'Ver tudo'}
          </Botao>
        </div>
      )}

      {/* A FAIXA "N EVENTOS" (chips com contagem por evento) SAIU (dono,
          22/09). Ela repetia o seletor de Evento da barra — que já lista os
          eventos com a contagem de cada um e filtra no mesmo clique — e
          ocupava de uma a três linhas acima da lista. */}

      {/* UM contêiner de rolagem horizontal para a aba inteira. Antes cada
          bloco tinha o próprio overflowX: rolar o primeiro não movia o
          segundo, e todo o alinhamento do colgroup se perdia na horizontal.
          (Sticky no <thead> continua fora: quem rolaria seria este contêiner,
          e position:sticky não atravessa o contexto de rolagem do pai — o
          cabeçalho por evento, e não mais por tipo, já resolve a repetição.) */}
      {/* SEM className="scrollbar-visible" aqui. Aquela utilitária declara
          `overflow: auto` (o atalho dos DOIS eixos, index.css), e o style
          inline só sobrescrevia overflow-x — sobrava um `overflow-y: auto`
          que ninguém pediu. Duas consequências, e a segunda é o corte que o
          dono viu: (1) no celular o `overflowX: 'visible'` era letra morta,
          porque com um dos eixos em `auto` o outro nunca fica `visible`;
          (2) contêiner de rolagem RECORTA, então a prévia do thumb — que
          abre para cima — era cortada pela borda superior deste bloco em
          toda linha do começo da tabela. A prévia virou position:fixed (ver
          ThumbPreview) e aqui ficou só o eixo que precisa rolar. */}
      <div style={{
        overflowX: emCartoes ? 'visible' : 'auto',
        scrollbarWidth: 'thin', scrollbarColor: `${T.bdark} ${N.n2}`,
      }}>
        <div style={{ minWidth: emCartoes ? undefined : minW, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {blocos.map(bloco => {
            return (
              <div key={bloco.key} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: T.surface, border: `1px solid ${T.border}` }}>
                <FaixaDoEvento
                  bloco={bloco}
                  prog={evProgresso.get(bloco.eventKey)}
                  evTotal={evSumMap.get(bloco.eventKey)?.count ?? 0}
                  tabId={tabId}
                  hoje={hoje}
                  emCartoes={emCartoes}
                  dedo={dedo}
                />

                {emCartoes ? (
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {bloco.grupos.map((grupo, gi) => (
                      <Fragment key={gi}>
                        {grupo.nome && (
                          <div style={{ padding: '6px 2px 2px', borderBottom: `1px solid ${N.n3}` }}>
                            <span style={{ fontSize: 10, fontWeight: 800, color: T.second, textTransform: 'uppercase', letterSpacing: '0.12em' }}>{grupo.nome}</span>
                          </div>
                        )}
                        {grupo.items.map((item) => (
                          <CartaoDaArte
                            key={item.id}
                            item={item}
                            tabId={tabId}
                            hoje={hoje}
                            enviando={sendingId === item.id}
                            algumEnviando={!!sendingId}
                            podeEditar={podeEditar}
                            dedo={dedo}
                            eventoTemBook={eventosComBook.has(item.eventId)}
                            acoes={acoes}
                          />
                        ))}
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <colgroup>
                      {comSelecao && <col style={{ width: ARTE_CHECKBOX_WIDTH }} />}
                      {cols.map((c, i) => <col key={i} style={{ width: c.w }} />)}
                    </colgroup>
                    <thead>
                      <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`, boxShadow: `0 1px 0 ${T.border}` }}>
                        {comSelecao && <th style={{ padding: '10px 12px' }}><span className="sr-only">Selecionar</span></th>}
                        {cols.map((col, ci) => <th key={ci} style={thStyle(col)}><span title={DICA_DA_COLUNA[col.label]} style={{ cursor: DICA_DA_COLUNA[col.label] ? 'help' : undefined }}>{col.label}</span></th>)}
                      </tr>
                    </thead>
                    {bloco.grupos.map((grupo, gi) => {
                      // Peças do grupo que podem entrar na seleção em lote.
                      const selecionaveis = tabId === "finalizados"
                        ? grupo.items
                        : grupo.items.filter((i) => i.status === 'awaiting_submission');
                      const marcadas = selecionaveis.filter((i) => selectedItemIds.has(i.id)).length;
                      // 3 de 5 marcadas devolvia o checkbox DESMARCADO, dizendo
                      // "nada selecionado aqui" num controle que alimenta ações
                      // em lote. O Radix suporta o estado indeterminado.
                      const estadoGrupo: boolean | "indeterminate" =
                        selecionaveis.length > 0 && marcadas === selecionaveis.length ? true
                        : marcadas > 0 ? "indeterminate" : false;
                      return (
                        <tbody key={gi}>
                          {/* O chip do grupo era suprimido no PRIMEIRO bloco de
                              cada evento (`!showEventHeader`), justamente o
                              maior: o usuário via o conjunto principal sem
                              saber a que grupo pertencia. Agora aparece sempre
                              que o grupo existir. */}
                          {grupo.nome && (
                            <tr>
                              {/* O AZUL SAIU. Era a única cor fria da tela,
                                  numa faixa cheia, para nomear um grupo — e
                                  disputava atenção com o dado das linhas logo
                                  abaixo. Um rótulo entre dois hairlines separa
                                  igual e não pinta nada. */}
                              <td colSpan={totalColunas} style={{ padding: '7px 12px', background: T.bg, borderTop: `1px solid ${N.n3}`, borderBottom: `1px solid ${N.n3}` }}>
                                <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, color: T.second, textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                                  {grupo.nome}
                                </span>
                              </td>
                            </tr>
                          )}
                          {/* Com UMA peça selecionável o controle de grupo não
                              se justifica: gastava uma linha inteira da
                              tabela para oferecer o mesmo que o checkbox da
                              própria linha, e ainda escrevia "Selecionar as 1
                              peças deste grupo". A partir de duas ele volta,
                              e aí o plural está sempre correto. */}
                          {comSelecao && selecionaveis.length > 1 && (
                            <tr>
                              <td style={{ padding: '4px 12px', borderBottom: `1px solid ${N.n2}` }}>
                                <Checkbox
                                  checked={estadoGrupo}
                                  aria-label={`Selecionar as ${selecionaveis.length} peças de ${grupo.nome || bloco.eventName}`}
                                  onCheckedChange={() => {
                                    const s = new Set(selectedItemIds);
                                    if (marcadas === selecionaveis.length) selecionaveis.forEach((i) => s.delete(i.id));
                                    else selecionaveis.forEach((i) => s.add(i.id));
                                    setSelectedItemIds(s);
                                  }}
                                  data-testid={`checkbox-group-${bloco.key}-${gi}`}
                                />
                              </td>
                              <td colSpan={totalColunas - 1} style={{ padding: '4px 12px', borderBottom: `1px solid ${N.n2}`, fontSize: 11, color: T.apoio }}>
                                {marcadas > 0 ? `${marcadas} de ${selecionaveis.length} selecionadas` : `Selecionar as ${selecionaveis.length} peças deste grupo`}
                              </td>
                            </tr>
                          )}
                          {grupo.items.map((item) => (
                            <LinhaDaArte
                              key={item.id}
                              item={item}
                              tabId={tabId}
                              comSelecao={comSelecao}
                              hoje={hoje}
                              selecionada={selectedItemIds.has(item.id)}
                              enviando={sendingId === item.id}
                              algumEnviando={!!sendingId}
                              podeEditar={podeEditar}
                              dedo={dedo}
                              eventoTemBook={eventosComBook.has(item.eventId)}
                              acoes={acoes}
                            />
                          ))}
                        </tbody>
                      );
                    })}
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {items.length > shownItems.length && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 4px' }}>
          <Botao
            variante="secundario"
            tamanho={dedo ? "toque" : "md"}
            onClick={() => setVisibleCount(v => v + ARTE_PAGE_SIZE)}
            data-testid="button-load-more-arte"
          >
            Carregar mais ({items.length - shownItems.length} restantes)
          </Botao>
          <span style={{ fontSize: 11, color: T.apoio }}>
            Exibindo {shownItems.length} de {items.length} peças
          </span>
        </div>
      )}
    </div>
  );
});
