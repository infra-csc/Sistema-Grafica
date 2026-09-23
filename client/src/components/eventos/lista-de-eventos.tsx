// O CONTEÚDO de Eventos: esqueleto, erro, vazio (com o porquê), a grade de
// cartões ou a lista densa, e o "Mostrar todos".
import { Plus, Package, Search, X } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { T, FS, R, SHADOW, N, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { EventCardMemo } from "./cartao-do-evento";
import { EventRowMemo, GRADE_LISTA, TH_LISTA } from "./linha-do-evento";
import { SEM_PATROCINADORES } from "./constantes";
import type { AcaoSobreEvento, DensidadeDaLista, EventoDaLista } from "./tipos";
import type { EventosFiltrados } from "./use-eventos-filtrados";

export interface PermissoesDaLista {
  canCreate: boolean;
  canEdit: boolean;
  soPatrocinadores: boolean;
  canDelete: boolean;
  canSetPriority: boolean;
  canClose: boolean;
}

export interface AcoesDaLista {
  onEdit: AcaoSobreEvento;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: AcaoSobreEvento;
  onSetPriority: AcaoSobreEvento;
  onClose: AcaoSobreEvento;
  onReopen: AcaoSobreEvento;
}

export function ListaDeEventos({
  events, isLoading, isError, refetch, recorte, densidade, patrocinadoresDoCartao, pedidosPorEvento,
  currentYear, relogioMs: agoraMs, isMobile, permissoes, acoes, onNovoEvento, clearAllEventFilters,
}: {
  events: EventoDaLista[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
  recorte: EventosFiltrados;
  densidade: DensidadeDaLista;
  patrocinadoresDoCartao: Map<string, Sponsor[]>;
  pedidosPorEvento: Map<string, number>;
  currentYear: number;
  /** Relógio de minuto da página: é o que faz o cartão e a linha memoizados andarem. */
  relogioMs: number;
  isMobile: boolean;
  permissoes: PermissoesDaLista;
  acoes: AcoesDaLista;
  onNovoEvento: () => void;
  clearAllEventFilters: () => void;
}) {
  const { canCreate, canEdit, soPatrocinadores, canDelete, canSetPriority, canClose } = permissoes;
  const {
    onEdit: handleEdit, onDelete: handleDelete, onDuplicate: handleDuplicate,
    onSetPriority: handleSetPriority, onClose: handleClose, onReopen: handleReopen,
  } = acoes;
  const {
    filteredEvents, visibleEvents, hiddenCount, setVisibleCount, hasActiveFilters,
    foraPorSituacao, incluirSituacoesOcultas, nomesDasSituacoesOcultas, activeFilterChips,
  } = recorte;
  if (isLoading) {
    // Skeleton com a silhueta dos cards reais (badge + título + datas +
    // marco + barra de progresso) no lugar do spinner central — sem
    // layout shift.
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6" aria-busy="true" aria-label="Carregando eventos">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderLeft: `4px solid ${T.border}`, borderRadius: R.lg, padding: '20px 22px' }}>
            <div className="animate-pulse" style={{ width: 110, height: 22, borderRadius: R.pill, backgroundColor: N.n2, marginBottom: 14 }} />
            <div className="animate-pulse" style={{ width: '55%', height: 18, borderRadius: 4, backgroundColor: T.border, marginBottom: 18 }} />
            <div style={{ display: 'flex', gap: 32, marginBottom: 14 }}>
              <div className="animate-pulse" style={{ width: 90, height: 12, borderRadius: 4, backgroundColor: N.n3 }} />
              <div className="animate-pulse" style={{ width: 110, height: 12, borderRadius: 4, backgroundColor: N.n3 }} />
            </div>
            <div className="animate-pulse" style={{ width: '65%', height: 12, borderRadius: 4, backgroundColor: N.n3, marginBottom: 18 }} />
            <div className="animate-pulse" style={{ width: '100%', height: 8, borderRadius: R.pill, backgroundColor: N.n3 }} />
          </div>
        ))}
      </div>
    );
  }
  if (isError) {
    // Sem este ramo, uma falha da API caía no "Nenhum evento criado" com
    // botão de criar — mensagem enganosa que podia induzir a recriar
    // eventos que já existem.
    return (
      <EstadoErro
        titulo="Não foi possível carregar os eventos"
        detalhe="Verifique sua conexão e tente novamente."
        aoTentarDeNovo={() => refetch()}
      />
    );
  }
  if (events.length === 0) {
    return (
      <EstadoVazio
        icone={Package}
        titulo="Nenhum evento criado"
        descricao={canCreate
          ? 'Comece criando seu primeiro evento de produção'
          : 'Os eventos criados pela equipe aparecerão aqui'}
        acao={canCreate ? (
            <Botao
              variante="primario"
              icone={Plus}
              tamanho={isMobile ? 'toque' : 'md'}
              onClick={onNovoEvento}
            >
              Criar Primeiro Evento
            </Botao>
        ) : undefined}
      />
    );
  }
  if (filteredEvents.length === 0) {
    return (
      <EstadoVazio
        icone={Search}
        titulo="Nenhum evento encontrado"
        descricao={hasActiveFilters ? 'Nenhum evento corresponde aos filtros ativos.' : 'Nenhum evento na situação escolhida.'}
        acao={<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* A resposta ao "cadê o evento?": estão fora pela SITUAÇÃO, que o
            "Limpar filtros" não toca. Um clique os traz para a lista. */}
        {foraPorSituacao.total > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: '18px' }}>
            <p style={{ color: T.strong, fontSize: FS.body, fontWeight: FW.medio, margin: 0 }}>
              {foraPorSituacao.total} {foraPorSituacao.total === 1 ? 'evento está' : 'eventos estão'} em {nomesDasSituacoesOcultas}, fora da lista.
            </p>
            <Botao
              variante="secundario"
              tamanho={isMobile ? 'toque' : 'md'}
              onClick={incluirSituacoesOcultas}
              data-testid="button-incluir-situacoes-ocultas"
            >
              Mostrar {nomesDasSituacoesOcultas}
            </Botao>
          </div>
        )}
        {/* Chips removíveis: "Limpar filtros" era tudo-ou-nada, e com
            prioridade + mês + próximos 10 dias combinados não dava para saber
            qual deles esvaziou a lista. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '20px' }}>
          {/* O chip "Arquivados fora da lista" repetiria o aviso logo acima. */}
          {activeFilterChips.filter((chip) => !(chip.key === 'arquivados' && foraPorSituacao.total > 0)).map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.clear}
              aria-label={`Remover o filtro ${chip.label}`}
              data-testid={`chip-remove-${chip.key}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: R.pill, fontSize: FS.small, fontWeight: '700', border: `1px solid ${T.border}`, backgroundColor: N.n2, color: T.strong, cursor: 'pointer' }}
            >
              {chip.label}
              <X style={{ width: 11, height: 11 }} />
            </button>
          ))}
        </div>
        {/* Só quando há filtro a limpar: sem nenhum, o botão não fazia nada
            visível — a lista seguia vazia e a pessoa clicava de novo. */}
        {hasActiveFilters && (
          <Botao
            variante="primario"
            tamanho={isMobile ? 'toque' : 'md'}
            onClick={clearAllEventFilters}
            data-testid="button-clear-filters-empty"
          >
            Limpar filtros
          </Botao>
        )}
        </div>}
      />
    );
  }
  return (
    <>
      {densidade === 'lista' && !isMobile ? (
        /* ══════════════════════════════════════════════════════════════
           MODO LISTA — uma linha por evento.

           O cartão tem sete blocos e ~440px de altura: com 50 eventos a
           varredura é longa. A lista responde outra pergunta — "onde está
           o evento X" em vez de "como está o evento X" — e por isso não
           substitui o cartão, convive com ele.

           A linha inteira continua sendo ÂNCORA de verdade (`<a href>`),
           como o cartão: Ctrl+clique, clique do meio e "abrir em nova aba"
           são o jeito de comparar dois eventos, e um `div role="link"`
           tira os três de uma vez.
        ══════════════════════════════════════════════════════════════ */
        <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: 'hidden', backgroundColor: T.surface }}>
          <div style={{
            display: 'grid', gridTemplateColumns: GRADE_LISTA, gap: 12,
            alignItems: 'center', padding: '10px 16px 10px 0',
            backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`,
          }}>
            <span aria-hidden="true" />
            <span style={TH_LISTA}>Evento</span>
            <span style={TH_LISTA}>Saída</span>
            <span style={TH_LISTA}>Próximo marco</span>
            <span style={TH_LISTA}>Peças</span>
            <span style={TH_LISTA}>Situação</span>
            <span aria-hidden="true" />
          </div>

          {visibleEvents.map((event) => {
            const cardSponsors = patrocinadoresDoCartao.get(event.id) ?? SEM_PATROCINADORES;
            return (
              <EventRowMemo
                key={event.id}
                event={event}
                sponsorCount={cardSponsors.length}
                pedidosAbertos={pedidosPorEvento.get(event.id) ?? 0}
                currentYear={currentYear}
                agoraMs={agoraMs}
                isMobile={isMobile}
                canEdit={canEdit}
                soPatrocinadores={soPatrocinadores}
                canDelete={canDelete}
                canDuplicate={canCreate && !isMobile}
                canSetPriority={canSetPriority}
                canClose={canClose}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onSetPriority={handleSetPriority}
                onClose={handleClose}
                onReopen={handleReopen}
              />
            );
          })}
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
        {visibleEvents.map((event) => {
          // O payload de eventos traz só o vínculo (sponsorId/quota) —
          // nome/cor vêm da lista global de patrocinadores (mapa memoizado:
          // a MESMA lista a cada render é o que deixa o cartão pular o render).
          const cardSponsors = patrocinadoresDoCartao.get(event.id) ?? SEM_PATROCINADORES;
          return (
            <EventCardMemo
              key={event.id}
              event={event}
              cardSponsors={cardSponsors}
              pedidosAbertos={pedidosPorEvento.get(event.id) ?? 0}
              isMobile={isMobile}
              currentYear={currentYear}
              agoraMs={agoraMs}
              canEdit={canEdit}
              soPatrocinadores={soPatrocinadores}
              canDelete={canDelete}
              canDuplicate={canCreate && !isMobile}
              canSetPriority={canSetPriority}
              canClose={canClose}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onSetPriority={handleSetPriority}
              onClose={handleClose}
              onReopen={handleReopen}
            />
          );
        })}
      </div>
      )}
      {hiddenCount > 0 && (
        <button
          onClick={() => setVisibleCount(filteredEvents.length)}
          data-testid="button-show-all-events"
          style={{ alignSelf: 'center', fontSize: FS.body, fontWeight: 700, color: T.strong, background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.pill, padding: '9px 22px', cursor: 'pointer', boxShadow: SHADOW.sm }}
        >
          Mostrar todos os {filteredEvents.length} eventos (+{hiddenCount})
        </button>
      )}
    </>
  );
}
