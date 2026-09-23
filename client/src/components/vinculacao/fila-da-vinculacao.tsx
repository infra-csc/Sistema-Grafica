// ─────────────────────────────────────────────────────────────────────────────
// A FILA — uma tabela só, agrupada por evento ou por patrocinador.
//
// Eram duas árvores de JSX, com a mesma informação e conjuntos de ação
// DIFERENTES — cada uma com a sua seleção em lote e ações que a outra não
// tinha. Trocar de aba mudava o que dava para fazer.
//
// Agora a linha é uma função só (`renderLinhaDaPeca`, que a página passa). O
// que o agrupamento muda é o cabeçalho do grupo e o ESCOPO DOS CHIPS — todos os
// patrocinadores do evento, ou só aquele — e nada mais.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Building2, Calendar, ChevronDown, Plus, Search, Truck, Zap } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { alvo } from "@/hooks/use-mobile";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { TOM, T, N, R, FS, FW, FONT, onColor } from "@/lib/theme";
import { ITEM_RENDER_CAP, THC } from "./constantes";
import { secaoDaPeca } from "./regras";
import type {
  Agrupamento, EventoDaVinculacao, GrupoDaLista, PatrocinadorDaVinculacao, PecaDaVinculacao, UIStatus,
} from "./tipos";

type Props = {
  gruposDaLista: GrupoDaLista[];
  getEventSponsors: (eventId: string) => PatrocinadorDaVinculacao[];
  getItemEditability: (item: PecaDaVinculacao) => boolean;
  itemUIStates: Record<string, UIStatus>;
  itemSponsorsMap: Record<string, string[]>;
  selectedItemIds: Set<string>;
  showAllRows: Set<string>;
  setShowAllRows: Dispatch<SetStateAction<Set<string>>>;
  tiposColapsados: Set<string>;
  setTiposColapsados: Dispatch<SetStateAction<Set<string>>>;
  toggleAllItemsInEvent: (eventItems: PecaDaVinculacao[]) => void;
  toggleTypeGroup: (typeItems: PecaDaVinculacao[]) => void;
  vincularRestantes: (sponsorId: string, alvos: PecaDaVinculacao[]) => void;
  abrirAutoVinculo: (eventId: string) => void;
  handleOpenSponsorDialog: (event: EventoDaVinculacao) => void;
  renderLinhaDaPeca: (item: PecaDaVinculacao, chips: PatrocinadorDaVinculacao[], eventSponsors: PatrocinadorDaVinculacao[]) => ReactNode;
  temFiltroAtivo: boolean;
  limparFiltros: () => void;
  agrupamento: Agrupamento;
  setAgrupamento: (a: Agrupamento) => void;
  emCartoes: boolean;
  dedo: boolean;
};

export function FilaDaVinculacao({
  gruposDaLista, getEventSponsors, getItemEditability, itemUIStates, itemSponsorsMap, selectedItemIds,
  showAllRows, setShowAllRows, tiposColapsados, setTiposColapsados, toggleAllItemsInEvent, toggleTypeGroup,
  vincularRestantes, abrirAutoVinculo, handleOpenSponsorDialog, renderLinhaDaPeca, temFiltroAtivo,
  limparFiltros, agrupamento, setAgrupamento, emCartoes, dedo,
}: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {gruposDaLista.map(grupo => {
        const { chave, event, sponsor, itens, vinculadas, total } = grupo;
        const eventSponsors = getEventSponsors(event.id);
        const chipsDoEscopo = sponsor ? [sponsor] : eventSponsors;
        const pct = total > 0 ? Math.round((vinculadas / total) * 100) : 0;
        const mostrarTodas = showAllRows.has(chave);
        const renderizadas = mostrarTodas ? itens : itens.slice(0, ITEM_RENDER_CAP);
        const selecionaveis = itens.filter(i => {
          const s = itemUIStates[i.id] || 'PENDENTE';
          return s === 'PENDENTE' || s === 'RASCUNHO';
        });
        const marcadas = selecionaveis.filter(i => selectedItemIds.has(i.id)).length;
        // Peças do grupo que ainda não têm ESTE patrocinador — o alvo do
        // "Vincular restantes".
        const faltando = sponsor
          ? itens.filter(i => getItemEditability(i) && !(itemSponsorsMap[i.id] ?? []).includes(sponsor.id))
          : [];
        const corDoPatrocinador = sponsor ? (sponsor.color || TOM.info.dot) : T.accentText;

        return (
          <section key={chave} data-testid={`grupo-${chave}`} style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: 'hidden' }}>

            {/* ── Cabeçalho do grupo ──
                CLARO, como o resto do sistema. Era um gradiente escuro com
                verde/âmbar "de fundo escuro" (#4ade80, #fdba74) que não
                existem na paleta — e cada grupo virava um bloco preto
                disputando com o cabeçalho da página. O que separa um grupo
                do outro é a caixa com borda e esta faixa em tom rebaixado. */}
            <header style={{
              backgroundColor: T.low,
              borderBottom: `1px solid ${T.border}`,
              padding: emCartoes ? '12px 14px' : '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto' }}>
                {/* Ladrilho: calendário no evento, inicial na cor da marca no
                    patrocinador. */}
                <span aria-hidden="true" style={{
                  width: 38, height: 38, borderRadius: R.md, flexShrink: 0,
                  backgroundColor: sponsor ? corDoPatrocinador : T.surface,
                  border: sponsor ? 'none' : `1px solid ${T.border}`,
                  color: sponsor ? onColor(corDoPatrocinador) : T.accentText,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: FS.lead, fontWeight: FW.forte, fontFamily: FONT.display,
                }}>
                  {sponsor ? (sponsor.name || '?')[0].toUpperCase() : <Calendar style={{ width: 18, height: 18 }} />}
                </span>

                <div style={{ minWidth: 0 }}>
                  {/* Nome em até DUAS linhas: com reticência e sem title, o
                      fim do nome do evento simplesmente sumia. */}
                  <h2 style={{
                    fontFamily: FONT.display, color: T.text,
                    fontSize: FS.title, fontWeight: FW.forte, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2,
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                  }}>
                    {sponsor ? sponsor.name : event.name}
                  </h2>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                    {/* Barra de vinculação: trilho n3, e o preenchimento é
                        decoração (a contagem ao lado carrega a leitura). */}
                    <span aria-hidden="true" style={{ width: 84, height: 5, backgroundColor: N.n3, borderRadius: R.pill, overflow: 'hidden', display: 'inline-block', flexShrink: 0 }}>
                      <span style={{ display: 'block', height: '100%', width: `${pct}%`, backgroundColor: pct === 100 ? TOM.sucesso.dot : T.accent, transition: 'width 0.4s ease' }} />
                    </span>
                    <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: pct === 100 ? FW.forte : FW.corpo, color: pct === 100 ? TOM.sucesso.text : T.apoio, whiteSpace: 'nowrap' }}>
                      {vinculadas}/{total} {sponsor ? 'com esta marca' : 'vinculadas'}
                    </span>
                    {!sponsor && event.startDate && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: FS.meta, color: T.apoio, whiteSpace: 'nowrap' }}>
                        <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
                        {event.truckDepartureDate
                          ? format(toUTCDisplayDate(event.truckDepartureDate), "dd/MM 'às' HH:mm", { locale: ptBR })
                          : format(parseDateLocal(event.startDate), 'dd/MM/yyyy', { locale: ptBR })}
                      </span>
                    )}
                    {sponsor && (
                      <span style={{ fontSize: FS.meta, color: T.apoio, maxWidth: 320, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {event.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* A ação do cabeçalho depende do agrupamento — é o único lugar
                  onde ele muda o que dá para fazer, e de propósito: são ações
                  SOBRE O GRUPO, não sobre a peça. */}
              {sponsor ? (
                <Botao
                  variante="secundario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={Plus}
                  onClick={() => vincularRestantes(sponsor.id, faltando)}
                  disabled={faltando.length === 0}
                  title={faltando.length === 0
                    ? `Todas as peças deste evento já têm ${sponsor.name}`
                    : `Vincular ${sponsor.name} às ${faltando.length} peças que ainda não têm — entra como rascunho`}
                  data-testid={`button-link-remaining-${sponsor.id}`}
                  style={{ flexShrink: 0 }}
                >
                  {/* Desabilitado, o próprio rótulo é o motivo. */}
                  {faltando.length === 0 ? 'Todas vinculadas' : `Vincular restantes (${faltando.length})`}
                </Botao>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                {/* AUTO-VINCULAR NO PRÓPRIO EVENTO. O do topo exige filtrar
                    exatamente um evento antes; aqui o evento já está
                    escolhido pelo grupo. Mesmo diálogo, mesma pré-visualização
                    e mesma confirmação — só sem o passo escondido. Só aparece
                    com patrocinador no evento: sem eles não há cota. */}
                {eventSponsors.length > 0 && (
                  <Botao
                    variante="fantasma"
                    tamanho={dedo ? "toque" : "md"}
                    icone={Zap}
                    onClick={() => abrirAutoVinculo(event.id)}
                    data-testid={`button-auto-vincular-evento-${event.id}`}
                    title="Pré-visualiza os vínculos pelas regras de cota deste evento — nada é gravado antes de confirmar"
                  >
                    Auto-vincular por cota
                  </Botao>
                )}
                <Botao
                  variante="secundario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={Building2}
                  onClick={() => handleOpenSponsorDialog(event)}
                  data-testid={`button-manage-event-sponsors-${event.id}`}
                  title={eventSponsors.length === 0 ? 'Adicionar patrocinadores a este evento' : 'Escolher quem participa deste evento'}
                >
                  {eventSponsors.length === 0
                    ? 'Adicionar patrocinadores'
                    : `${eventSponsors.length} ${eventSponsors.length === 1 ? 'patrocinador' : 'patrocinadores'}`}
                </Botao>
                </div>
              )}
            </header>

            {/* ── A tabela ── */}
            <div style={{ backgroundColor: T.surface }}>
              <div className="overflow-x-auto scrollbar-visible">
                <table style={{ width: '100%', borderCollapse: 'collapse', ...(emCartoes ? { display: 'block', padding: 12 } : {}) }}>
                  <thead style={{ display: emCartoes ? 'none' : 'table-header-group' }}>
                    <tr style={{ backgroundColor: T.bg, borderBottom: `1px solid ${T.border}` }}>
                      <th style={{ ...THC, width: 46, textAlign: 'center', padding: '9px 0' }}>
                        <Checkbox
                          /* "indeterminate" em seleção parcial: sem isto o
                             checkbox aparecia vazio mesmo com metade das
                             linhas marcadas. */
                          checked={selecionaveis.length === 0 ? false : marcadas === selecionaveis.length ? true : marcadas > 0 ? 'indeterminate' : false}
                          onCheckedChange={() => toggleAllItemsInEvent(selecionaveis)}
                          disabled={selecionaveis.length === 0}
                          aria-label={`Selecionar todas as peças de ${sponsor ? sponsor.name : event.name}`}
                          data-testid={`checkbox-select-all-${chave}`}
                        />
                      </th>
                      <th style={THC}>Peça</th>
                      <th style={{ ...THC, whiteSpace: 'nowrap' }}>Qtd · m²</th>
                      <th style={THC}>{sponsor ? 'Vínculo' : 'Patrocinadores'}</th>
                      <th style={{ ...THC, textAlign: 'right', paddingRight: 16 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody style={{ display: emCartoes ? 'block' : 'table-row-group' }}>
                    {renderizadas.map((item, idx) => {
                      const anterior = idx > 0 ? renderizadas[idx - 1] : null;
                      // Só agrupa porque `itens` chega ordenada por tipo
                      // (ordenarParaLeitura) — sem isso, este "abre ao
                      // mudar" repete o cabeçalho a cada linha.
                      const abreTipo = !anterior || secaoDaPeca(anterior) !== secaoDaPeca(item);
                      const chaveTipo = `${chave}:${secaoDaPeca(item)}`;
                      const tipoFechado = tiposColapsados.has(chaveTipo);
                      const linhas: ReactNode[] = [];

                      if (abreTipo) {
                        const doTipo = itens.filter(i => secaoDaPeca(i) === secaoDaPeca(item));
                        const semPatrocinador = doTipo.filter(i => {
                          const s = itemUIStates[i.id] || 'PENDENTE';
                          return s === 'PENDENTE';
                        }).length;
                        const enviadas = doTipo.filter(i => (itemUIStates[i.id] || 'PENDENTE') === 'ENVIADO').length;
                        // Calculado uma vez por cabeçalho: repetido inline no Checkbox
                        // (checked e disabled), numa fila de mil peças eram
                        // varreduras repetidas por cabeçalho de tipo, a cada render.
                        const selecionaveisDoTipo = doTipo.filter(i => { const st = itemUIStates[i.id] || 'PENDENTE'; return st === 'PENDENTE' || st === 'RASCUNHO'; });
                        const tudoEnviado = enviadas === doTipo.length;
                        const tudoVinculado = semPatrocinador === 0;
                        const corDoLote = tudoEnviado ? T.text : tudoVinculado ? TOM.sucesso.text : T.accentText;
                        const textoDoLote = tudoEnviado ? 'tudo enviado'
                          : tudoVinculado ? 'tudo vinculado'
                          : `${semPatrocinador} sem patrocinador`;

                        linhas.push(
                          /* CABEÇALHO DE TIPO, colapsável.
                             O agrupador de GRUPO PAI (a faixa #dbeafe com
                             "PLACA KM") saiu: dentro de um evento já
                             agrupado, um segundo nível de agrupador é um
                             nível a mais do que a informação pede.

                             KEY PELA IDENTIDADE, NÃO PELO CONTEÚDO. A key
                             trazia `item.type` — o campo que o usuário
                             RENOMEIA. Renomear mudava a key, e mudar a key
                             não é re-render: é desmontar a linha e montar
                             outra. Esta linha carrega um Checkbox do Radix,
                             que compõe refs; a remontagem forçada realimenta
                             o ciclo e derrubava a tela com "Maximum update
                             depth exceeded". */
                          <tr key={`tipo-${item.id}`} style={{ borderLeft: `3px solid ${corDoLote}`, ...(emCartoes ? { display: 'block', marginBottom: 8 } : {}) }}>
                            <td colSpan={5} style={{ padding: 0, backgroundColor: T.bg, borderBottom: `1px solid ${N.n3}`, ...(emCartoes ? { display: 'block' } : {}) }}>
                              <div style={{ display: 'flex', alignItems: 'center' }}>
                              {/* O CHECKBOX DO TIPO. Numa fila de 1.120 peças,
                                  marcar 14 "Placa KM" uma a uma é o gargalo
                                  que a seleção em lote existe para tirar. Fora
                                  do <button> de colapsar: um dentro do outro
                                  é HTML inválido, e clicar no checkbox
                                  fecharia o grupo junto. */}
                              <span onClick={e => e.stopPropagation()} style={{ width: 46, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                                <Checkbox
                                  checked={(() => {
                                    const sel = selecionaveisDoTipo;
                                    if (sel.length === 0) return false;
                                    const m = sel.filter(i => selectedItemIds.has(i.id)).length;
                                    return m === sel.length ? true : m > 0 ? 'indeterminate' : false;
                                  })()}
                                  onCheckedChange={() => toggleTypeGroup(doTipo)}
                                  disabled={selecionaveisDoTipo.length === 0}
                                  aria-label={`Selecionar as peças do tipo ${item.type}`}
                                  data-testid={`checkbox-group-${item.type}`}
                                />
                              </span>
                              <button
                                type="button"
                                onClick={() => setTiposColapsados(prev => {
                                  const n = new Set(prev);
                                  if (n.has(chaveTipo)) n.delete(chaveTipo); else n.add(chaveTipo);
                                  return n;
                                })}
                                aria-expanded={!tipoFechado}
                                data-testid={`toggle-tipo-${chaveTipo}`}
                                style={{
                                  flex: 1, minWidth: 0, minHeight: alvo(34, dedo), padding: '6px 16px 6px 0',
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left',
                                }}
                              >
                                <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, color: T.apoio, flexShrink: 0, transform: tipoFechado ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />
                                <span data-testid={item.kitRemessaId ? `secao-kit-${chaveTipo}` : undefined} style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: item.kitRemessaId ? TOM.roxo.text : T.strong, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {secaoDaPeca(item)}
                                </span>
                                <span style={{ fontFamily: FONT.mono, fontSize: FS.meta, color: T.apoio, flexShrink: 0 }}>
                                  {doTipo.length}
                                </span>
                                <span style={{ marginLeft: 'auto', fontSize: FS.meta, fontWeight: FW.medio, color: corDoLote, whiteSpace: 'nowrap', flexShrink: 0 }}>
                                  {textoDoLote}
                                </span>
                              </button>
                              </div>
                            </td>
                          </tr>,
                        );
                      }

                      if (!tipoFechado) linhas.push(renderLinhaDaPeca(item, chipsDoEscopo, eventSponsors));
                      return linhas;
                    })}
                  </tbody>
                </table>
              </div>

              {itens.length > ITEM_RENDER_CAP && (
                <button
                  type="button"
                  onClick={() => setShowAllRows(prev => {
                    const n = new Set(prev);
                    if (mostrarTodas) n.delete(chave); else n.add(chave);
                    return n;
                  })}
                  data-testid={`button-show-all-${chave}`}
                  style={{ width: '100%', minHeight: alvo(38, dedo), background: T.bg, border: 'none', borderTop: `1px solid ${T.border}`, color: T.accentText, font: 'inherit', fontSize: FS.meta, fontWeight: FW.forte, cursor: 'pointer' }}
                >
                  {mostrarTodas ? 'Mostrar menos' : `Mostrar todas as ${itens.length} peças (+${itens.length - ITEM_RENDER_CAP})`}
                </button>
              )}
            </div>
          </section>
        );
      })}

      {/* Filtros zeraram tudo: sem isto a área principal ficava em branco
          absoluto, sem explicação e sem saída. */}
      {gruposDaLista.length === 0 && (
        <EstadoVazio
          icone={Search}
          titulo={temFiltroAtivo ? 'Nenhuma peça com os filtros atuais' : agrupamento === 'patrocinador' ? 'Nenhum evento com patrocinadores' : 'Nada a vincular'}
          // Com filtro: "por que a peça que eu procuro não aparece?" — além
          // do filtro, as duas regras de entrada da tela.
          descricao={temFiltroAtivo
            ? 'Ajuste a busca ou os filtros acima. Se procura uma peça específica: as que ainda são rascunho no evento (não enviadas para vinculação) e as de evento finalizado não entram nesta tela.'
            : agrupamento === 'patrocinador'
              ? 'Nenhum evento desta fila tem patrocinador definido. Agrupe por evento e use o botão de patrocinadores no cabeçalho de cada um.'
              : 'Toda peça em fila já foi vinculada e enviada à Arte.'}
          acao={temFiltroAtivo ? (
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              onClick={limparFiltros}
              data-testid="button-clear-filters"
            >
              Limpar filtros
            </Botao>
          ) : agrupamento === 'patrocinador' ? (
            <Botao
              variante="secundario"
              tamanho={dedo ? "toque" : "md"}
              onClick={() => setAgrupamento('evento')}
              data-testid="button-agrupar-por-evento-vazio"
            >
              Agrupar por evento
            </Botao>
          ) : undefined}
        />
      )}
    </div>
  );
}
