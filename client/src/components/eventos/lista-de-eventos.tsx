// O CONTEÚDO de Eventos: esqueleto, erro, vazio (com o porquê), a grade de
// cartões ou a lista densa, e o "Mostrar todos".
import { Plus, Package, Search, X } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { T, FS, R, SHADOW, N, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoVazio, EstadoErro } from "@/components/ui/estados";
import { EventCardMemo } from "./cartao-do-evento";
import { EventRowMemo, GRADE_LISTA, TH_LISTA, larguraDasAcoes } from "./linha-do-evento";
import { alvo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { SEM_PATROCINADORES } from "./constantes";
import type { AcaoSobreEvento, DensidadeDaLista, EventoDaLista } from "./tipos";
import type { EventosFiltrados } from "./use-eventos-filtrados";

/**
 * As COLUNAS pela largura que a lista TEM, não pela da janela. As classes
 * md:/2xl: contam a janela inteira — com a barra lateral aberta num tablet de
 * 768px sobravam 448px e a grade abria duas colunas de 214px, com o marco
 * cortado em "Lista de …". Com minmax(420px) o cartão nunca fica mais estreito
 * que o seu conteúdo: 1 coluna no tablet, 2 no notebook, 3 no monitor grande.
 * (As classes continuam: o `grid`, o stretch e o gap vêm delas.)
 */
const GRADE_DE_CARTOES: React.CSSProperties = {
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))',
};

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
  // Quantas ações ESTE perfil tem na linha (a mesma conta do cartão) — é a
  // largura da última coluna da lista.
  const dedo = usePonteiroGrosso() || isMobile;
  const nAcoes = (canSetPriority ? 1 : 0) + (canCreate && !isMobile ? 1 : 0) + (canEdit || soPatrocinadores ? 1 : 0)
    + (canClose ? 1 : 0) + (canDelete ? 1 : 0);
  const {
    filteredEvents, visibleEvents, hiddenCount, setVisibleCount, hasActiveFilters,
    foraPorSituacao, incluirSituacoesOcultas, nomesDasSituacoesOcultas, activeFilterChips,
  } = recorte;
  if (isLoading) {
    // Skeleton com a silhueta dos cards reais (badge + título + datas +
    // marco + barra de progresso) no lugar do spinner central — sem
    // layout shift.
    return (
      <div role="status" className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 max-md:gap-4" style={GRADE_DE_CARTOES} aria-busy="true" aria-label="Carregando eventos">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ position: 'relative', overflow: 'hidden', backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, padding: isMobile ? 16 : 20, boxShadow: SHADOW.sm }}>
            <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: N.n3 }} />
            <div className="animate-pulse" style={{ width: 72, height: 22, borderRadius: R.sm, backgroundColor: N.n2, marginBottom: 14 }} />
            <div className="animate-pulse" style={{ width: `${58 - (i % 3) * 8}%`, height: 18, borderRadius: 4, backgroundColor: N.n3, marginBottom: 18 }} />
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr', gap: 16, marginBottom: 20 }}>
              {[0, 1].map((c) => (
                <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div className="animate-pulse" style={{ width: 84, height: 9, borderRadius: 3, backgroundColor: N.n2 }} />
                  <div className="animate-pulse" style={{ width: c === 0 ? 132 : 110, height: 14, borderRadius: 4, backgroundColor: N.n3 }} />
                  <div className="animate-pulse" style={{ width: c === 0 ? 76 : 96, height: 11, borderRadius: 4, backgroundColor: N.n2 }} />
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${N.n3}`, paddingTop: 14 }}>
              <div className="animate-pulse" style={{ width: 96, height: 10, borderRadius: 3, backgroundColor: N.n2, marginBottom: 10 }} />
              <div className="animate-pulse" style={{ width: '100%', height: 8, borderRadius: R.pill, backgroundColor: N.n3 }} />
            </div>
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
              className="evl-chip-x"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 28, padding: '0 8px 0 11px', borderRadius: R.pill, fontFamily: 'inherit', fontSize: FS.small, fontWeight: FW.forte, border: `1px solid ${T.border}`, backgroundColor: T.surface, color: T.strong, cursor: 'pointer' }}
            >
              {chip.label}
              <X aria-hidden="true" style={{ width: 12, height: 12, color: T.second }} />
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
        // Seis colunas não cabem em menos de ~980px (tablet com a barra
        // lateral aberta): a TABELA rola de lado dentro da moldura, em vez de
        // espremer o nome do evento a zero e encavalar os rótulos.
        <div
          style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflowX: 'auto', overflowY: 'hidden', backgroundColor: T.surface, boxShadow: SHADOW.sm, ['--evl-acoes' as string]: `${larguraDasAcoes(nAcoes, alvo(32, dedo))}px` } as React.CSSProperties}
        >
        <div style={{ minWidth: 980 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: GRADE_LISTA, gap: 12,
            alignItems: 'center', padding: '10px 16px 10px 0',
            backgroundColor: T.bg, borderBottom: `1px solid ${T.border}`,
          }} aria-hidden="true">
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
        </div>
      ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6 max-md:gap-4" style={GRADE_DE_CARTOES}>
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
          className="evl-mais"
          style={{ alignSelf: 'center', fontFamily: 'inherit', fontSize: FS.body, fontWeight: FW.forte, color: T.strong, background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.pill, padding: '0 22px', minHeight: alvo(38, dedo), cursor: 'pointer', boxShadow: SHADOW.sm }}
        >
          Mostrar todos os {filteredEvents.length} eventos (+{hiddenCount})
        </button>
      )}
    </>
  );
}
