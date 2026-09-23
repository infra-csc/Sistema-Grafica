import { memo } from "react";
import { toUTCDisplayDate } from "@/lib/utils";
import { PHASES, contarPorFaseDoEvento as contarPorFase } from "@/lib/fases";
import { T, FS, R, N, TOM, FONT } from "@/lib/theme";
import { EventCardActions } from "./acoes-do-evento";
import { SeloDePedidos } from "./selo-de-pedidos";
import { MARCO_COLOR } from "./constantes";
import { MILESTONE_TONE, milestoneDueText } from "./formatos";
import { contarRascunhos, getPriorityConfig, readEventStats } from "./regras";
import type { AcaoSobreEvento, EventoDaLista } from "./tipos";

/**
 * UMA DEFINIÇÃO DE GRADE, usada pelo cabeçalho E pelas linhas.
 *
 * Duas definições — uma no `<thead>`, outra na linha — é como colunas saem
 * de registro: elas nascem iguais e divergem no primeiro ajuste que só um
 * dos dois lados recebe. A primeira coluna é a faixa de acento, por isso os
 * 4px.
 */
/**
 * A grade da lista, do cabeçalho e das linhas — a última coluna é a das
 * AÇÕES, com a mesma largura do cartão (5 botões de 32px + gaps + folga).
 *
 * DENSIDADE NÃO PODE MUDAR O QUE DÁ PARA FAZER. A primeira versão desta lista
 * deixou as ações de fora, com o argumento de que numa linha de 52px elas
 * seriam alvos pequenos grudados na borda e o cartão está a um clique. O
 * argumento estava errado pelo mesmo motivo que valeu na tela de Vincular:
 * escolher a visão densa passaria a CUSTAR capacidade, e é assim que dois
 * modos da mesma tela divergem — não por decisão, mas porque o botão novo só
 * foi copiado para um dos lados.
 */
export const LARGURA_ACOES = 5 * 32 + 4 * 6 + 10;
export const GRADE_LISTA = `4px 1fr 132px 190px 108px 92px ${LARGURA_ACOES}px`;

// contarPorFase: ver lib/fases.ts (importado acima como contarPorFaseDoEvento).

/** Rótulo de coluna. #7a6154 sobre #fafaf9 dá 5,49. */
export const TH_LISTA: React.CSSProperties = {
  fontSize: FS.micro, fontWeight: 800, color: T.second,
  textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap',
};

/**
 * UMA LINHA DA LISTA.
 *
 * Mesmas cinco informações do cartão, na mesma ordem de leitura, sem os
 * blocos que só fazem sentido quando há espaço para eles (patrocinadores por
 * extenso, data de início). As AÇÕES estão aqui, sim — ver o comentário de
 * GRADE_LISTA: densidade não pode custar capacidade.
 */
function EventRow({
  event, sponsorCount, currentYear, agoraMs, isMobile, pedidosAbertos = 0,
  canEdit, canDelete, canDuplicate, canSetPriority, canClose, soPatrocinadores = false,
  onEdit, onDelete, onDuplicate, onSetPriority, onClose, onReopen,
}: {
  event: EventoDaLista;
  sponsorCount: number;
  pedidosAbertos?: number;
  currentYear: number;
  /** Relógio de minuto da página (ver `agoraMs` em Eventos). */
  agoraMs: number;
  isMobile: boolean;
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
  const prio = getPriorityConfig(event.priority);
  const ms = event.nextMilestone;
  // Mesma indexação do cartão (linha ~679): o `state` vem do servidor como
  // string, e o mapa cobre os três valores possíveis.
  const msTone = MILESTONE_TONE[(ms?.state ?? 'upcoming') as keyof typeof MILESTONE_TONE];
  const fases = contarPorFase(event);

  // toUTCDisplayDate: o horário do caminhão foi gravado como UTC mas É o de
  // exibição. Com `new Date()` cru, um caminhão gravado para 08:00 exibia
  // "08:00" e o selo "Saiu hoje" ao mesmo tempo.
  const saida = event.truckDepartureDate ? toUTCDisplayDate(event.truckDepartureDate) : null;
  // `agoraMs` (prop) e não `new Date()`: a linha é memoizada, e o relógio lido
  // aqui dentro congelava o selo no dia em que ela desenhou pela última vez.
  const hoje = new Date(agoraMs);
  const diasAteSaida = saida
    ? Math.ceil((new Date(saida.getFullYear(), saida.getMonth(), saida.getDate()).getTime()
        - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000)
    : null;
  const corDaSaida = diasAteSaida === null ? T.second
    : diasAteSaida < 0 ? TOM.perigo.text
    : diasAteSaida <= 7 ? T.accentText
    : T.second;

  // A MESMA frase do rodapé do cartão — não uma segunda redação do mesmo
  // estado, que divergiria no primeiro ajuste.
  const rascunhos = contarRascunhos(event);
  // A coluna Peças já diz "x/y"; aqui "x de y" era a mesma conta duas vezes.
  // Quando há rascunho não enviado, é ELE a situação — o que trava a lista.
  const situacao = stats.activeItemCount === 0
    ? 'Sem peças'
    : rascunhos > 0 && stats.lifecycle === 'active'
      ? `${rascunhos} em rascunho`
      : `${stats.deliveredCount} de ${stats.activeItemCount}`;
  const situacaoEhRascunho = stats.activeItemCount > 0 && rascunhos > 0 && stats.lifecycle === 'active';

  const isClosed = stats.lifecycle === 'manually_closed';
  const isDone = stats.lifecycle === 'completed';

  return (
    <div
      className="group"
      data-testid={`row-event-${event.id}`}
      style={{
        display: 'grid', gridTemplateColumns: GRADE_LISTA, gap: 12,
        alignItems: 'center', padding: '0 16px 0 0',
        borderBottom: `1px solid ${N.n3}`, minHeight: 52,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = T.bg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
    >
      {/* ÂNCORA DE VERDADE, com `display: contents`.

          Os filhos viram itens diretos do grid, então as colunas alinham com
          o cabeçalho por UMA definição de grade — e o conteúdo continua
          DENTRO do link, o que preserva seleção de texto e o alvo de clique
          por célula. A alternativa comum (link esticado por `position:
          absolute` + `pointer-events: none` nas células) alinharia igual e
          custaria a seleção de texto da linha inteira. */}
      <a
        href={`/eventos/${event.id}`}
        aria-label={`Abrir evento ${event.name}`}
        data-testid={`link-event-${event.id}`}
        style={{ display: 'contents', textDecoration: 'none', color: 'inherit' }}
      >
      {/* A faixa de acento — a mesma borda esquerda do cartão. */}
      <span aria-hidden="true" style={{ alignSelf: 'stretch', backgroundColor: prio.hex }} />

      {/* Evento */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingLeft: 12 }}>
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: prio.hex, flexShrink: 0 }} />
        <span style={{ fontSize: FS.body, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {event.name}
        </span>
        {sponsorCount > 0 && (
          <span style={{ fontSize: FS.small, color: T.second, whiteSpace: 'nowrap', flexShrink: 0 }}>
            {sponsorCount} patroc.
          </span>
        )}
        <SeloDePedidos n={pedidosAbertos} eventId={event.id} />
      </span>

      {/* Saída */}
      <span style={{ fontFamily: FONT.mono, fontSize: FS.small, color: corDaSaida, whiteSpace: 'nowrap' }}>
        {saida
          ? `${saida.toLocaleDateString('pt-BR', saida.getFullYear() === currentYear
              ? { day: '2-digit', month: 'short' }
              : { day: '2-digit', month: 'short', year: '2-digit' }).replace('.', '')} ${String(saida.getHours()).padStart(2, '0')}:${String(saida.getMinutes()).padStart(2, '0')}`
          : '—'}
      </span>

      {/* Próximo marco */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        {ms ? (
          <>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: MARCO_COLOR[ms.key] || T.second, flexShrink: 0 }} />
            <span style={{ fontSize: FS.small, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ms.label}</span>
            <span style={{ fontSize: FS.small, fontWeight: 700, color: msTone.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {milestoneDueText(ms)}
            </span>
          </>
        ) : (
          <span style={{ fontSize: FS.small, color: T.second }}>—</span>
        )}
      </span>

      {/* Peças — a MESMA barra segmentada por fase do cartão. A barra antiga
          media só `delivered` e mostrava 0% num evento todo conferido. */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span aria-hidden="true" style={{ display: 'flex', width: 46, height: 6, borderRadius: R.pill, overflow: 'hidden', backgroundColor: N.n3, flexShrink: 0 }}>
          {stats.activeItemCount > 0 && PHASES.map((fase, i) => (
            fases[i] > 0
              ? <span key={fase.key} title={`${fases[i]} ${fase.noun}`} style={{ width: `${(fases[i] / stats.activeItemCount) * 100}%`, backgroundColor: fase.color }} />
              : null
          ))}
        </span>
        <span style={{ fontFamily: FONT.mono, fontSize: FS.small, color: T.second, whiteSpace: 'nowrap' }}>
          {stats.activeItemCount > 0 ? `${stats.deliveredCount}/${stats.activeItemCount}` : '—'}
        </span>
      </span>

      {/* Situação */}
      <span
        title={situacaoEhRascunho ? `${rascunhos} ${rascunhos === 1 ? 'peça criada e ainda não enviada' : 'peças criadas e ainda não enviadas'} para a vinculação` : undefined}
        style={{ fontSize: FS.small, color: situacaoEhRascunho ? TOM.alerta.text : T.second, fontWeight: situacaoEhRascunho ? 700 : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {situacao}
      </span>
      </a>

      {/* AÇÕES — fora da âncora, como no cartão: <button> dentro de <a> é
          HTML inválido, e o navegador desfaz o aninhamento de um jeito que
          quebra os dois. Mesmo componente do cartão, então um botão novo
          nasce nos dois lugares. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <EventCardActions
          event={event}
          accentHex={prio.hex}
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
          // Mesma regra do cartão: prioridade não faz sentido no que já saiu
          // de jogo.
          canSetPriority={canSetPriority && !isDone && !isClosed}
          canClose={canClose}
          isClosed={isClosed}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

// Linha memoizada (PERF-6): ver o comentário do cartão.
export const EventRowMemo = memo(EventRow);
