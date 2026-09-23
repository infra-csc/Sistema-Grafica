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
import { FS, FW, R, T, N, TOM } from "@/lib/theme";
import { ORDEM_HIST_REGRA, PAGE_SIZE, type OrdemHistorico } from "./regras";
import { LinhaDoHistorico } from "./linha-do-historico";
import type {
  EventoAtendimento, OpcaoContada, Patrocinador, PecaAtendimento, PecaDoHistorico, SponsorApproval, TamanhoDoBotao,
} from "./tipos";

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

  return (
    <div role="tabpanel" id="tabpanel-history" aria-labelledby="tab-history">
      {/* ── A ORDEM DO HISTÓRICO ────────────────────────────────────────
          Numa tela de auditoria a pergunta costuma ser "o que demorou", e
          a única ordem possível era por data. A regra fica escrita ao
          lado, como na aba Pendentes. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: T.second, flexShrink: 0 }}>Ordem</span>
        <div role="group" aria-label="Ordem do histórico" style={{ display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '100%', paddingBottom: 2 }}>
          {([['recentes', 'Mais recentes'], ['demoradas', 'Mais demoradas'], ['evento', 'Nome do evento']] as const).map(([valor, rotulo]) => {
            const ativo = ordemHistorico === valor;
            return (
              <button key={valor} type="button" aria-pressed={ativo} data-testid={`toggle-ordem-hist-${valor}`}
                onClick={() => setOrdemHistorico(valor)}
                style={{
                  height: alvo(30, dedo), padding: '0 12px', borderRadius: R.md, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
                  border: `1px solid ${ativo ? TOM.laranja.border : T.border}`,
                  backgroundColor: ativo ? TOM.laranja.bg : T.surface,
                  color: ativo ? T.accentText : T.apoio,
                }}>
                {rotulo}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12, color: T.apoio }}>{ORDEM_HIST_REGRA[ordemHistorico]}</span>
      </div>

      {/* ── Barra de filtros ── */}
      <div style={{
        background: T.bg, borderRadius: 12,
        border: `1px solid ${T.border}`,
        padding: '12px 16px', marginBottom: 20,
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        {/* Busca */}
        <div style={{ flex: '1 1 180px', minWidth: 160, position: 'relative' }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: T.muted }} />
          <input
            value={histSearchTerm}
            onChange={e => setHistSearchTerm(e.target.value)}
            placeholder="ID, tipo ou descrição..."
            aria-label="Buscar no histórico por ID, tipo ou descrição"
            style={{
              width: '100%', paddingLeft: 36, paddingRight: histSearchTerm ? 32 : 12, paddingTop: 9, paddingBottom: 9,
              backgroundColor: T.surface, borderRadius: 8, border: `1px solid ${T.border}`,
              fontSize: isMobile ? FS.lead : FS.body, fontWeight: FW.corpo, color: T.text,
              boxSizing: 'border-box',
            }}
          />
          {histSearchTerm && (
            <button onClick={() => setHistSearchTerm("")} aria-label="Limpar busca" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: T.second }}>
              <X style={{ width: 13, height: 13 }} />
            </button>
          )}
        </div>
        <div style={{ width: 1, height: 24, background: T.border, flexShrink: 0 }} />
        <EventFilterDropdown values={histEventFilter} onValuesChange={setHistEventFilter} options={histEventOptions} />
        <FilterSelect showAllLabelWhenEmpty label="Patrocinador" allLabel="Todos os patrocinadores"
          values={histSponsorFilter} onValuesChange={setHistSponsorFilter}
          options={histSponsorOptions} />
        <FilterSelect showAllLabelWhenEmpty label="Período" allLabel="Todos os períodos"
          value={histPeriodFilter} onChange={setHistPeriodFilter}
          options={periodOptions} />
        {(hasHistFilters || histSearchTerm) && (
          // Contorno, não bloco preto: é a mesma regra do "Limpar" da aba
          // Pendentes — desfazer filtro não é ação primária, e o bloco
          // cheio era o objeto mais escuro da aba de auditoria.
          <Botao
            variante="secundario"
            tamanho={tamBotao}
            icone={X}
            onClick={() => { setHistEventFilter([]); setHistSponsorFilter([]); setHistPeriodFilter("all"); setHistSearchTerm(""); }}
          >
            Limpar filtros
          </Botao>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {loadingSponsors
            ? <Loader2 style={{ width: 14, height: 14, color: T.muted }} className="animate-spin" />
            : <span style={{ fontSize: 13, color: T.second, fontWeight: 600 }}>
                {historyItems.length} {historyItems.length === 1 ? 'resultado' : 'resultados'}
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
        <div style={{
          backgroundColor: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 12, overflow: 'hidden',
        }}>
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
