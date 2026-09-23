import { memo } from "react";
import { Link } from "wouter";
import { Calendar, Truck, AlertCircle, AlertTriangle, CheckCircle, Lock, Package } from "lucide-react";
import type { Sponsor } from "@shared/schema";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { PHASES, contarPorFaseDoEvento as contarPorFase } from "@/lib/fases";
import { T, FS, R, SHADOW, N, TOM, FONT } from "@/lib/theme";
import { SponsorChips } from "@/components/sponsor-chips";
import { alvo, usePonteiroGrosso } from "@/hooks/use-mobile";
import { EventCardActions } from "./acoes-do-evento";
import { SeloDePedidos } from "./selo-de-pedidos";
import { MARCO_COLOR } from "./constantes";
import { MILESTONE_TONE, fmtCardDate, fmtDateBR, milestoneDueText } from "./formatos";
import { contarRascunhos, getPriorityConfig, readEventStats } from "./regras";
import type { AcaoSobreEvento, EventoDaLista, NextMilestonePayload } from "./tipos";

// ─────────────────────────────────────────────────────────────────────────────
// CARD DO EVENTO
//
// O conteúdo inteiro é uma ÂNCORA de verdade (<a href>) — antes era um
// `div role="link"`, o que tirava Ctrl/⌘+clique, clique do meio, "abrir em
// nova aba", "copiar link" e o preview do destino na barra de status. Quem
// trabalha aqui todo dia compara eventos: abrir três em abas é o gesto
// natural. Os botões de ação ficam FORA da âncora (âncora não pode conter
// botão), posicionados sobre o canto — e a primeira linha reserva a largura
// deles para o badge nunca correr por baixo.
// ─────────────────────────────────────────────────────────────────────────────
function EventCard({
  event,
  cardSponsors,
  pedidosAbertos = 0,
  isMobile,
  currentYear,
  agoraMs,
  canEdit,
  soPatrocinadores = false,
  canDelete,
  canDuplicate,
  canSetPriority,
  canClose,
  onEdit,
  onDelete,
  onDuplicate,
  onSetPriority,
  onClose,
  onReopen,
}: {
  event: EventoDaLista;
  cardSponsors: Sponsor[];
  pedidosAbertos?: number;
  isMobile: boolean;
  currentYear: number;
  /** Relógio de minuto da página (ver `agoraMs` em Eventos). */
  agoraMs: number;
  canEdit: boolean;
  soPatrocinadores?: boolean;
  canDelete: boolean;
  canDuplicate: boolean;
  canSetPriority: boolean;
  canClose: boolean;
  onEdit: AcaoSobreEvento;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onDuplicate: AcaoSobreEvento;
  onSetPriority: AcaoSobreEvento;
  onClose: AcaoSobreEvento;
  onReopen: AcaoSobreEvento;
}) {
  const stats = readEventStats(event);
  const isDone = stats.lifecycle === 'completed';
  const isRealizado = stats.lifecycle === 'realizado';
  const isClosed = stats.lifecycle === 'manually_closed';
  const priorityConfig = getPriorityConfig(event.priority);
  // Cinza no encerrado manual, de propósito: verde diria "deu tudo certo" e
  // âmbar diria "corre atrás". Encerrado é nenhum dos dois — é fora de jogo.
  const accentHex = isClosed ? T.second : isDone ? TOM.esmeralda.dot : isRealizado ? TOM.alerta.dot : priorityConfig.hex;

  // Urgência da saída pelo MESMO helper que a exibição e os filtros usam.
  // Com `new Date(...)` cru, um caminhão gravado para 08:00 virava o instante
  // 08:00Z = 05:00 em Brasília: entre 05:00 e 08:00 do dia da saída o card
  // exibia "10 mar · 08:00" E o selo vermelho "Saiu hoje" ao mesmo tempo.
  const departure = event.truckDepartureDate ? toUTCDisplayDate(event.truckDepartureDate) : null;
  // `agoraMs` (prop) e não `Date.now()`: o cartão é memoizado, e o relógio
  // lido aqui dentro parava o selo ("urgente" → "Saiu hoje") até o evento mudar.
  const hoursUntilDeparture = departure ? (departure.getTime() - agoraMs) / 3600000 : null;
  const truckUrgency = hoursUntilDeparture === null ? 'normal'
    : hoursUntilDeparture < 0 ? 'departed'
    : hoursUntilDeparture < 24 ? 'urgent'
    : hoursUntilDeparture < 48 ? 'warning'
    : 'normal';
  const daysSinceDeparture = hoursUntilDeparture === null ? 0 : Math.floor(-hoursUntilDeparture / 24);

  // Saturado só no ÍCONE; o TEXTO usa tons escuros com contraste AA.
  // `outOfPlay` = concluído ou encerrado à mão: nos dois casos a saída deixa de
  // ser urgência. Pulsar vermelho num evento que alguém fechou é o alarme falso
  // que ensina a ignorar o vermelho de verdade.
  const outOfPlay = isDone || isClosed;
  const truckIconColor = isDone ? TOM.esmeralda.dot : isClosed ? T.second : truckUrgency === 'urgent' ? TOM.perigo.dot : truckUrgency === 'warning' ? TOM.alerta.dot : T.second;
  const truckTextColor = !outOfPlay && truckUrgency === 'urgent' ? TOM.perigo.text : !outOfPlay && truckUrgency === 'warning' ? TOM.alerta.text : T.text;

  const ms: NextMilestonePayload | null = event.nextMilestone ?? null;
  const msTone = MILESTONE_TONE[ms?.state ?? 'upcoming'];

  // Espaço reservado na primeira linha para as ações sobrepostas.
  const actionCount = (canSetPriority ? 1 : 0) + (canDuplicate ? 1 : 0) + (canEdit || soPatrocinadores ? 1 : 0)
    + (canClose ? 1 : 0) + (canDelete ? 1 : 0);
  const dedo = usePonteiroGrosso() || !!isMobile;
  const btnSize = alvo(32, dedo);
  const actionsWidth = actionCount > 0 ? actionCount * btnSize + (actionCount - 1) * 6 + 10 : 0;
  const cardPad = isMobile ? 14 : 24;

  // Evento realizado SEM nenhuma peça: "0 peças em aberto" seria mentira ao
  // contrário — não há trabalho pendente, há trabalho que nunca começou.
  const realizadoVazio = isRealizado && stats.activeItemCount === 0;

  const stateLabel = isClosed
    ? (isMobile ? 'Encerrado' : 'Encerrado manualmente')
    : isDone
      ? 'Concluído'
      : isRealizado
        ? (realizadoVazio
            ? (isMobile ? 'Sem peças' : 'Realizado sem peças')
            : (isMobile ? 'Com pendências' : 'Realizado com pendências'))
        : null;

  const ariaLabel = isClosed
    ? `Abrir evento ${event.name} — encerrado manualmente${stats.openCount > 0 ? `, ${stats.openCount} ${stats.openCount === 1 ? 'peça ficou' : 'peças ficaram'} em aberto` : ''}`
    : isDone
      ? `Abrir evento ${event.name} — concluído, ${stats.deliveredCount} peças entregues`
      : realizadoVazio
        ? `Abrir evento ${event.name} — já realizado, nenhuma peça foi criada`
        : isRealizado
          ? `Abrir evento ${event.name} — já realizado com ${stats.openCount} ${stats.openCount === 1 ? 'peça em aberto' : 'peças em aberto'}`
          : `Abrir evento ${event.name}`;

  // Uma passada só sobre as peças (a grade monta até 50 cards).
  const phaseCounts = contarPorFase(event);
  const rascunhos = contarRascunhos(event);

  const emptyActive = stats.activeItemCount === 0 && stats.lifecycle === 'active';

  return (
    <div
      className="group relative bg-white rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${T.border}`,
        borderLeft: `4px solid ${accentHex}`,
        boxShadow: SHADOW.sm,
        transition: 'box-shadow 0.25s ease, transform 0.25s ease, border-color 0.25s ease',
      }}
      /* Hover contido (2px + sombra curta + borda que escurece) no lugar do
         lift de 4px com sombra de 40px: com 3 cards por linha, a elevação
         antiga fazia a grade inteira "pular" a cada passada de mouse. */
      onMouseEnter={isMobile ? undefined : (e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = SHADOW.md;
        el.style.transform = 'translateY(-2px)';
        el.style.borderColor = T.bdark;
      }}
      onMouseLeave={isMobile ? undefined : (e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.style.boxShadow = SHADOW.sm;
        el.style.transform = 'translateY(0)';
        el.style.borderColor = T.border;
      }}
      data-testid={`card-event-${event.id}`}
      data-lifecycle={stats.lifecycle}
    >
      {isDone && (
        <div style={{ position: 'absolute', right: '-16px', bottom: '-16px', opacity: 0.03, pointerEvents: 'none' }}>
          <CheckCircle style={{ width: '120px', height: '120px', color: TOM.esmeralda.dot }} />
        </div>
      )}

      <Link
        href={`/eventos/${event.id}`}
        aria-label={ariaLabel}
        data-testid={`link-event-${event.id}`}
        style={{
          display: 'flex', flexDirection: 'column', gap: '16px',
          padding: cardPad, textDecoration: 'none', color: 'inherit',
          position: 'relative', zIndex: 1, minHeight: '100%',
        }}
      >
        {/* minHeight = altura dos botões: assim a faixa de ações sobreposta
            termina DENTRO desta linha e nunca cobre o começo do nome. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingRight: actionsWidth, minHeight: actionCount > 0 ? btnSize : undefined }}>
          {stateLabel ? (
            <span
              title={isClosed
                ? `Encerrado por decisão de um administrador${stats.openCount > 0 ? ` com ${stats.openCount} ${stats.openCount === 1 ? 'peça em aberto' : 'peças em aberto'}` : ''}. Saiu da Gestão de Prazos e das filas de trabalho; pode ser reaberto.`
                : isDone
                  ? 'Todas as peças foram entregues'
                  : realizadoVazio
                    ? 'O dia do evento passou e nenhuma peça chegou a ser criada. Saiu sozinho da Gestão de Prazos e das cinco filas de trabalho — ninguém encerrou este evento, e não há como reabri-lo.'
                    : `O dia do evento passou e ${stats.openCount} ${stats.openCount === 1 ? 'peça continua' : 'peças continuam'} em aberto. Saiu sozinho da Gestão de Prazos e das cinco filas de trabalho — ninguém encerrou este evento, e não há como reabri-lo.`}
              style={{
                fontSize: FS.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.06em',
                color: isClosed ? T.strong : isDone ? TOM.esmeralda.text : TOM.alerta.text,
                backgroundColor: isClosed ? N.n2 : isDone ? TOM.esmeralda.bg : TOM.alerta.bg,
                border: `1px solid ${isClosed ? T.bdark : isDone ? TOM.esmeralda.border : TOM.alerta.border}`,
                padding: '3px 8px', borderRadius: R.sm, whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: '4px',
              }}
            >
              {isClosed
                ? <Lock style={{ width: '10px', height: '10px' }} />
                : isDone
                  ? <CheckCircle style={{ width: '10px', height: '10px' }} />
                  : <AlertTriangle style={{ width: '10px', height: '10px' }} />}
              {stateLabel}
            </span>
          ) : !event.priority ? (
            <span style={{ fontSize: FS.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: T.second, backgroundColor: T.low, padding: '4px 10px', borderRadius: R.sm, display: 'flex', alignItems: 'center', gap: '4px', whiteSpace: 'nowrap' }}>
              <AlertCircle style={{ width: '10px', height: '10px' }} />
              Sem prioridade
            </span>
          ) : (
            <span style={{ fontSize: FS.micro, fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.07em', color: priorityConfig.text, backgroundColor: accentHex + '12', padding: '4px 10px', borderRadius: R.sm, whiteSpace: 'nowrap' }}>
              {priorityConfig.label}
            </span>
          )}
        </div>

        <h3 style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: '700', color: T.dark, lineHeight: 1.25, margin: 0 }}>
          {event.name}
        </h3>
        {pedidosAbertos > 0 && (
          <div style={{ marginTop: -8 }}>
            <SeloDePedidos n={pedidosAbertos} eventId={event.id} />
          </div>
        )}

        {cardSponsors.length > 0 && (
          <SponsorChips sponsors={cardSponsors} max={3} variant="colored" size="xs" />
        )}

        <div style={{ margin: '2px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <p style={{ fontSize: FS.micro, fontWeight: '700', color: T.second, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Saída do Caminhão</p>
            <div className={!outOfPlay && truckUrgency === 'urgent' ? 'motion-safe:animate-pulse' : ''} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Truck style={{ width: '16px', height: '16px', color: truckIconColor, flexShrink: 0 }} />
              <span style={{ fontSize: FS.strong, fontWeight: '700', color: truckTextColor }}>
                {departure ? fmtCardDate(departure, currentYear) : '—'}
                {departure ? ' · ' : ''}
                {/* Sem `timeZone:'UTC'`: `departure` já veio de
                    toUTCDisplayDate e é lido em hora LOCAL — ver fmtCardDate. */}
                {departure ? departure.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
              {!outOfPlay && truckUrgency === 'departed' && (
                <span style={{ fontSize: FS.small, fontWeight: '700', color: TOM.perigo.text }}>
                  {daysSinceDeparture < 1 ? 'Saiu hoje' : `Saiu há ${daysSinceDeparture}d`}
                </span>
              )}
            </div>
          </div>

          {/* PRÓXIMO MARCO — a informação que só existia em /prazos (admin).
              Vem calculada do servidor: mesma âncora (saída do caminhão), mesmo
              ajuste de fim de semana e mesma regra de pendência acumulada de
              /api/prazos. `daysRemaining` já está no fuso do negócio. */}
          {ms && (
            <div
              title={`${ms.label} — ${milestoneDueText(ms)}. Prazo: ${fmtDateBR(ms.deadline)}.${ms.pendingItems > 0 ? ` ${ms.pendingItems} ${ms.pendingItems === 1 ? 'peça ainda não passou' : 'peças ainda não passaram'} por esta etapa.` : ''}`}
              style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}
            >
              <p style={{ fontSize: FS.micro, fontWeight: '700', color: T.second, textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Próximo marco</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: MARCO_COLOR[ms.key] || T.second, flexShrink: 0 }} />
                <span style={{ fontSize: FS.body, fontWeight: '600', color: T.text }}>{ms.label}</span>
                <span style={{
                  fontSize: FS.small, fontWeight: '700', color: msTone.text,
                  backgroundColor: msTone.bg, border: `1px solid ${msTone.border}`,
                  borderRadius: R.sm, padding: '1px 7px', whiteSpace: 'nowrap',
                }}>
                  {milestoneDueText(ms)}
                </span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: FS.small, color: T.second }}>
            <Calendar style={{ width: '11px', height: '11px', color: T.muted, flexShrink: 0 }} />
            <span>
              Início: {event.startDate
                ? parseDateLocal(event.startDate).toLocaleDateString('pt-BR', parseDateLocal(event.startDate).getFullYear() === currentYear
                    ? { day: '2-digit', month: 'short' }
                    : { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '')
                : '—'}
            </span>
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '14px', borderTop: `1px solid ${N.n3}` }}>
          {emptyActive ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: FS.body, fontWeight: '700', color: ms && ms.state !== 'upcoming' ? msTone.text : T.apoio }}>
                Nenhuma peça criada
                {ms ? ` — lista ${milestoneDueText(ms)}` : ''}
              </span>
              {/* O convite só para quem monta a lista: para os outros perfis
                  "Criar lista de imagens →" prometia um gesto que o detalhe
                  não oferece a eles. */}
              {canEdit && (
                <span style={{ fontSize: FS.small, fontWeight: '700', color: T.accentText }}>
                  Criar lista de imagens →
                </span>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: FS.small, fontWeight: '700', color: T.apoio }}>
                  {stats.activeItemCount === 0
                    ? 'Sem peças'
                    : `${stats.deliveredCount} de ${stats.activeItemCount} ${stats.activeItemCount === 1 ? 'peça' : 'peças'}`}
                  {stats.inProductionCount > 0 ? ` · ${stats.inProductionCount} em produção` : ''}
                </span>
                {/* O ESTADO JÁ ESTÁ NO SELO do topo do cartão ("Encerrado
                    manualmente", "Concluído"): repeti-lo aqui era a mesma
                    palavra duas vezes no mesmo cartão. O rodapé fica com o que
                    o selo não diz — quantas peças ficaram em aberto. */}
                {isClosed ? (
                  // O número de peças abertas continua VISÍVEL num evento
                  // encerrado: encerrar tira o evento das filas, não apaga o
                  // que ficou para trás.
                  stats.openCount > 0 ? (
                    <span style={{ fontSize: FS.small, fontWeight: '800', color: T.strong, whiteSpace: 'nowrap' }}>
                      {stats.openCount} em aberto
                    </span>
                  ) : null
                ) : isDone ? null : isRealizado ? (
                  <span style={{ fontSize: FS.small, fontWeight: '800', color: TOM.alerta.text, whiteSpace: 'nowrap' }}>
                    {realizadoVazio ? 'Nada criado' : `${stats.openCount} em aberto`}
                  </span>
                ) : (
                  <span style={{ fontSize: FS.small, fontWeight: '800', color: T.dark, whiteSpace: 'nowrap' }}>{stats.progressPct}%</span>
                )}
              </div>
              {/* Barra SEGMENTADA por fase: cada trecho é uma etapa da produção
                  (em produção → produzido → conferido → entregue). A barra
                  antiga só media `delivered` e mostrava 0% para um evento com
                  tudo produzido e conferido. */}
              <div
                style={{ width: '100%', backgroundColor: N.n3, borderRadius: R.pill, height: '8px', overflow: 'hidden', display: 'flex' }}
                role="img"
                aria-label={PHASES.map((p, i) => `${phaseCounts[i]} ${p.noun}`).join(', ')}
              >
                {PHASES.map((p, i) => (
                  phaseCounts[i] > 0 && stats.activeItemCount > 0 ? (
                    <div
                      key={p.key}
                      title={`${phaseCounts[i]} ${p.noun}`}
                      style={{ height: '100%', backgroundColor: p.color, width: `${(phaseCounts[i] / stats.activeItemCount) * 100}%`, transition: 'width 0.4s ease' }}
                    />
                  ) : null
                ))}
              </div>
              {stats.canceledCount > 0 && (
                <span style={{ fontSize: FS.micro, color: T.second, marginTop: '5px', display: 'block' }}>
                  {stats.canceledCount} {stats.canceledCount === 1 ? 'peça cancelada' : 'peças canceladas'} fora da conta
                </span>
              )}
              {/* RASCUNHO NÃO ENVIADO — o "próximo passo" que o cartão não
                  dizia. Só em evento em jogo: no arquivado e no já realizado
                  o envio está travado, e cobrar seria pedir o impossível. */}
              {rascunhos > 0 && !outOfPlay && !isRealizado && (
                <span
                  data-testid={`rascunhos-evento-${event.id}`}
                  style={{ fontSize: FS.small, fontWeight: 700, color: TOM.alerta.text, marginTop: '6px', display: 'flex', alignItems: 'center', gap: 5 }}
                >
                  <Package aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
                  {rascunhos} em rascunho — {canEdit ? 'abra e envie para a vinculação' : 'ainda não enviadas'}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>

      <div style={{ position: 'absolute', top: cardPad, right: cardPad, zIndex: 2 }}>
        <EventCardActions
          event={event}
          accentHex={accentHex}
          onEdit={onEdit}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onSetPriority={onSetPriority}
          onClose={onClose}
          onReopen={onReopen}
          canEdit={canEdit}
          soPatrocinadores={soPatrocinadores}
          canDelete={canDelete}
          canDuplicate={canDuplicate}
          // Prioridade não faz sentido no que já saiu de jogo — nem no
          // concluído, nem no encerrado à mão.
          canSetPriority={canSetPriority && !isDone && !isClosed}
          canClose={canClose}
          isClosed={isClosed}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

// CARTÃO E LINHA MEMOIZADOS (PERF-6, 17/09). Medido com 68 eventos: cada tecla
// na busca ou no nome do modal de criar re-renderizava os 50 cartões — cada um
// varrendo as peças embutidas (fases, rascunhos, contadores) —, ~250ms por
// tecla. Os handlers já são estáveis (useCallback) e a lista de patrocinadores
// de cada cartão vem de um mapa memoizado; com isso as props só mudam quando o
// evento muda, e o cartão só desenha de novo nesse caso.
export const EventCardMemo = memo(EventCard);
