// ─────────────────────────────────────────────────────────────────────────────
// ABA HISTÓRICO — as peças que já passaram pela aprovação do patrocinador.
// A ordem, os filtros (do MESMO pool da lista) e as linhas, paginadas.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { Clock, Loader2, Search, X } from "lucide-react";
import { FilterSelect } from "@/components/filter-select";
import { EventFilterDropdown } from "@/components/event-filter-dropdown";
import { EsqueletoDeFila } from "@/components/esqueleto-de-fila";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio } from "@/components/ui/estados";
import { alvo } from "@/hooks/use-mobile";
import { FS, FW, R, T, N } from "@/lib/theme";
import { Segmentado } from "@/components/ui/abas";
import { letra, SUPERFICIE } from "./estilos";
import { ORDEM_HIST_REGRA, PAGE_SIZE, type OrdemHistorico } from "./regras";
import { LinhaDoHistorico } from "./linha-do-historico";
import type {
  EventoAtendimento, OpcaoContada, Patrocinador, PecaAtendimento, PecaDoHistorico, SponsorApproval, TamanhoDoBotao,
} from "./tipos";

/** As três ordens: rótulo inteiro no desktop, curto quando a área aperta. */
const ORDENS_DO_HISTORICO: readonly (readonly [OrdemHistorico, string, string])[] = [
  ['recentes', 'Mais recentes', 'Recentes'],
  ['demoradas', 'Mais demoradas', 'Demoradas'],
  ['evento', 'Nome do evento', 'Evento'],
];

export function AbaHistorico({
  events, ordemHistorico, setOrdemHistorico, dedo, isMobile, cards, hoje, tamBotao, loadingSponsors,
  histSearchTerm, setHistSearchTerm, histEventFilter, setHistEventFilter, histEventOptions,
  histSponsorFilter, setHistSponsorFilter, histSponsorOptions, histPeriodFilter, setHistPeriodFilter,
  historyItems, histVisible, setHistVisible, itemSponsorsMap, itemApprovalsMap, setHistDetailItem,
}: {
  events: EventoAtendimento[];
  ordemHistorico: OrdemHistorico;
  setOrdemHistorico: Dispatch<SetStateAction<OrdemHistorico>>;
  dedo: boolean;
  isMobile: boolean;
  cards: boolean;
  hoje: Date;
  tamBotao: TamanhoDoBotao;
  loadingSponsors: boolean;
  histSearchTerm: string;
  setHistSearchTerm: Dispatch<SetStateAction<string>>;
  histEventFilter: string[];
  setHistEventFilter: Dispatch<SetStateAction<string[]>>;
  histEventOptions: OpcaoContada[];
  histSponsorFilter: string[];
  setHistSponsorFilter: Dispatch<SetStateAction<string[]>>;
  histSponsorOptions: OpcaoContada[];
  histPeriodFilter: string;
  setHistPeriodFilter: Dispatch<SetStateAction<string>>;
  historyItems: PecaAtendimento[];
  histVisible: number;
  setHistVisible: Dispatch<SetStateAction<number>>;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  setHistDetailItem: Dispatch<SetStateAction<PecaDoHistorico | null>>;
}) {
  const evById = new Map(events.map((e) => [e.id, e]));
  const periodOptions = [
    { value: '7d',  label: 'Últimos 7 dias' },
    { value: '30d', label: 'Últimos 30 dias' },
    { value: '90d', label: 'Últimos 90 dias' },
  ];
  // As opções dos dois menus saem do MESMO pool da lista (ver
  // `casaHistorico`, em use-historico) — aqui elas eram o sistema inteiro.
  const hasHistFilters = histEventFilter.length > 0 || histSponsorFilter.length > 0 || histPeriodFilter !== "all";
  const toque = isMobile || dedo;

  return (
    <div role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">
      {/* ── A ORDEM DO HISTÓRICO ────────────────────────────────────────
          Numa tela de auditoria a pergunta costuma ser "o que demorou", e
          a única ordem possível era por data. A regra fica escrita ao
          lado, como na aba Pendentes. */}
      {/* O seletor é o <Segmentado> da casa, como na aba Pendentes: a ordem
          troca a forma de ver a mesma lista. A regra fica escrita ao lado. */}
      <div style={{ display: 'flex', alignItems: cards ? 'stretch' : 'center', flexDirection: cards ? 'column' : 'row', gap: cards ? 6 : 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span style={{ fontSize: letra(FS.small, toque), fontWeight: FW.rotulo, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.second, flexShrink: 0 }}>Ordem</span>
          <Segmentado
            rotuloDaLista="Ordem do histórico"
            prefixoDeTestId="toggle-ordem-hist"
            testId="ordem-do-historico"
            tamanho={dedo ? "toque" : "sm"}
            larguraCheia={cards}
            ativo={ordemHistorico}
            aoTrocar={(v) => setOrdemHistorico(v as OrdemHistorico)}
            itens={ORDENS_DO_HISTORICO.map(([valor, rotulo, curto]) => ({ id: valor, rotulo: cards ? curto : rotulo, title: rotulo }))}
            style={{ flex: cards ? '1 1 0%' : undefined, minWidth: 0 }}
          />
        </div>
        <span style={{ fontSize: letra(FS.meta, toque), color: T.second }}>{ORDEM_HIST_REGRA[ordemHistorico]}</span>
      </div>

      {/* ── Barra de filtros ──
          SEM a caixa cinza com borda que só esta aba tinha: é a mesma fileira
          da aba Pendentes (busca à frente, menus, "Limpar" em texto e a
          contagem encostada à direita). */}
      <div style={{
        marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        {/* Busca */}
        <div style={{ flex: isMobile ? '1 1 100%' : '1 1 180px', maxWidth: isMobile ? undefined : 300, minWidth: isMobile ? 0 : 160, position: 'relative' }}>
          <Search aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: T.second, pointerEvents: 'none' }} />
          <input
            value={histSearchTerm}
            onChange={e => setHistSearchTerm(e.target.value)}
            placeholder="Buscar peça"
            aria-label="Buscar no histórico por ID, tipo ou descrição"
            data-testid="input-search-historico"
            style={{
              width: '100%', height: isMobile ? 44 : alvo(36, dedo), padding: '0 34px 0 34px',
              backgroundColor: T.surface, borderRadius: R.md, border: `1px solid ${T.border}`,
              fontSize: isMobile ? FS.lead : FS.body, fontWeight: FW.corpo, color: T.text, fontFamily: 'inherit',
              boxSizing: 'border-box', outlineOffset: 2,
            }}
          />
          {histSearchTerm && (
            <button type="button" onClick={() => setHistSearchTerm("")} aria-label="Limpar busca" className="ds-botao ds-botao-fantasma" style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', borderRadius: R.sm, cursor: 'pointer', color: T.second, width: toque ? 40 : 30, height: toque ? 40 : 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X aria-hidden="true" style={{ width: 14, height: 14 }} />
            </button>
          )}
        </div>
        <EventFilterDropdown values={histEventFilter} onValuesChange={setHistEventFilter} options={histEventOptions} fullWidth={isMobile} />
        <FilterSelect showAllLabelWhenEmpty label="Patrocinador" allLabel="Todos os patrocinadores"
          values={histSponsorFilter} onValuesChange={setHistSponsorFilter}
          options={histSponsorOptions} fullWidth={isMobile} />
        <FilterSelect showAllLabelWhenEmpty label="Período" allLabel="Todos os períodos"
          value={histPeriodFilter} onChange={setHistPeriodFilter}
          options={periodOptions} fullWidth={isMobile} />
        {(hasHistFilters || histSearchTerm) && (
          // "Limpar" em TEXTO, como na aba Pendentes: desfazer filtro não é
          // ação primária.
          <button
            type="button"
            onClick={() => { setHistEventFilter([]); setHistSponsorFilter([]); setHistPeriodFilter("all"); setHistSearchTerm(""); }}
            data-testid="button-clear-filters-historico"
            className="ds-botao ds-botao-fantasma"
            style={{ height: isMobile ? 44 : alvo(36, dedo), padding: '0 10px', borderRadius: R.md, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: T.accentText, fontSize: letra(FS.body, toque), fontWeight: FW.forte, whiteSpace: 'nowrap' }}
          >
            Limpar filtros
          </button>
        )}
        <div aria-live="polite" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {loadingSponsors
            ? <Loader2 aria-label="Carregando" style={{ width: 14, height: 14, color: T.muted }} className="animate-spin" />
            : <span data-testid="contador-historico" style={{ fontSize: letra(FS.meta, toque), color: T.second, fontVariantNumeric: 'tabular-nums' }}>
                <strong style={{ color: T.text, fontWeight: FW.forte }}>{historyItems.length}</strong> {historyItems.length === 1 ? 'resultado' : 'resultados'}
              </span>}
        </div>
      </div>

      {/* ── Lista ── */}
      {loadingSponsors ? (
        // Silhueta, como a fila de Pendentes e a Arte: o spinner solto de
        // 32px não dizia o que carregava nem onde o conteúdo ia aparecer.
        <EsqueletoDeFila linhas={6} comCabecalho={false} />
      ) : historyItems.length === 0 ? (
        // O vazio da casa (EstadoVazio) e o
        // ícone pelo MOTIVO: o check verde afirmava "tudo certo" também
        // quando eram os filtros escondendo o histórico. A saída mora ao
        // lado do problema, não só na barra de cima.
        <EstadoVazio
          icone={(hasHistFilters || histSearchTerm) ? Search : Clock}
          titulo={(hasHistFilters || histSearchTerm) ? 'Nenhuma peça neste recorte' : 'Ainda não há histórico'}
          descricao={(hasHistFilters || histSearchTerm)
            ? 'Nenhuma peça aprovada combina com a busca e os filtros atuais.'
            : 'As peças aparecem aqui assim que algum patrocinador aprovar.'}
          acao={(hasHistFilters || histSearchTerm) ? (
            <Botao
              variante="secundario"
              tamanho={tamBotao}
              onClick={() => { setHistEventFilter([]); setHistSponsorFilter([]); setHistPeriodFilter("all"); setHistSearchTerm(""); }}
            >
              Limpar filtros
            </Botao>
          ) : undefined}
        />
      ) : (
        // UMA superfície com linhas, no lugar de N cards soltos.
        //
        // Cada peça era um card com borda, raio 12, sombra dupla e mais
        // sombra no hover, separado por 10px de vão — cinquenta molduras
        // para cinquenta linhas de uma lista que já está ordenada e é
        // lida de cima para baixo. O que distingue uma linha da outra é
        // o TRILHO do estado, não a moldura.
        <div style={SUPERFICIE}>
          {historyItems.slice(0, histVisible).map((item, iLinha) => (
            <LinhaDoHistorico
              key={item.id}
              item={item}
              ev={evById.get(item.eventId)}
              comRegua={iLinha < historyItems.slice(0, histVisible).length - 1}
              itemSponsorsMap={itemSponsorsMap}
              itemApprovalsMap={itemApprovalsMap}
              setHistDetailItem={setHistDetailItem}
              cards={cards}
              dedo={dedo}
              hoje={hoje}
              toque={toque}
            />
          ))}
          {historyItems.length > histVisible && (
            <Botao
              variante="fantasma"
              tamanho={tamBotao}
              larguraCheia
              onClick={() => setHistVisible(v => v + PAGE_SIZE)}
              data-testid="button-load-more-history"
              style={{ borderRadius: 0, boxShadow: `inset 0 1px 0 ${N.n3}` }}
            >
              Carregar mais ({historyItems.length - histVisible} restantes)
            </Botao>
          )}
        </div>
      )}
    </div>
  );
}
