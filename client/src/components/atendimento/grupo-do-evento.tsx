// ─────────────────────────────────────────────────────────────────────────────
// UM GRUPO DA FILA: o cabeçalho do evento (prazo de Aprovação de Layout e "N
// na sua mesa") e, com o evento aberto, os cards das peças dele.
// ─────────────────────────────────────────────────────────────────────────────
import { ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateLocal } from "@/lib/utils";
import { prazoAprovacaoLayout } from "@/lib/atendimento-prazo";
import { T, N, TOM, FONT } from "@/lib/theme";
import { situacaoDaPeca } from "./regras";
import { CartaoDaPeca, type PropsDoCartao } from "./cartao-da-peca";
import type { EventoAtendimento, PecaAtendimento } from "./tipos";

export function GrupoDoEvento({
  eventId, eventItems, getEventInfo, eventoAberto, toggleEventCollapsed, cards, hoje, ...doCartao
}: {
  eventId: string;
  eventItems: PecaAtendimento[];
  getEventInfo: (eventId: string) => EventoAtendimento | undefined;
  eventoAberto: (id: string) => boolean;
  toggleEventCollapsed: (id: string) => void;
  hoje: Date;
} & Omit<PropsDoCartao, "item" | "prevItem">) {
  const { itemApprovalsMap } = doCartao;
  const ev = getEventInfo(eventId);
  // ALTURA ESTIMADA do grupo, para o navegador reservar o espaço sem
  // desenhar o conteúdo. Sem uma estimativa próxima, a barra de
  // rolagem pula enquanto se rola — o remédio ficaria pior que a
  // doença. 128px é o cabeçalho do evento; ~104px é a altura média de
  // uma linha de peça com thumb.
  // Recolhido, o grupo é só o cabeçalho: reservar a altura das peças
  // deixaria um buraco do tamanho do evento embaixo dele.
  const alturaEstimada = eventoAberto(eventId)
    ? 128 + eventItems.length * 104
    : 128;
  // CONTENT-VISIBILITY: AUTO — o grupo fora da tela não é desenhado, mas
  // CONTINUA NO DOM. É o que permite abrir todos os eventos de uma vez sem
  // travar: o navegador pula layout e pintura do que ninguém está vendo, e o
  // Ctrl+F, o leitor de tela e os links continuam funcionando — o que uma
  // lista virtualizada quebraria.
  return (
    <div
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${alturaEstimada}px`,
      } as React.CSSProperties}
    >
      {/* Group Header — recolhe/expande o evento.
          Era só onClick num <div>: recolher grupo, que é o principal
          recurso de navegação desta tela, existia apenas para quem
          usa mouse. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={eventoAberto(eventId)}
        onClick={() => toggleEventCollapsed(eventId)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggleEventCollapsed(eventId);
          }
        }}
        data-testid={`toggle-event-${eventId}`}
        title={eventoAberto(eventId) ? 'Recolher evento' : 'Expandir evento'}
        // NO CELULAR a linha QUEBRA: nome, selo de prazo por extenso e
        // contagem numa fileira `nowrap` pediam ~600px; em 390 o nome
        // encolhia a zero e o resto vazava para a direita, com rolagem
        // lateral na página inteira.
        style={{
          display: 'flex', alignItems: 'center', gap: cards ? 8 : 16,
          flexWrap: cards ? 'wrap' : 'nowrap',
          paddingBottom: cards ? 12 : 16, marginBottom: cards ? 12 : 16,
          minHeight: 44,
          borderBottom: `1px solid ${T.border}`,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <ChevronDown
          aria-hidden="true"
          style={{
            width: 16, height: 16, color: T.second, flexShrink: 0,
            transform: eventoAberto(eventId) ? 'none' : 'rotate(-90deg)',
            transition: 'transform 0.15s',
          }}
        />
        {/* O ponto laranja "evento com itens aguardando aprovação"
            saiu: TODO grupo desta lista tem itens aguardando — é a
            definição da aba —, então ele não distinguia grupo nenhum. */}
        {/* <h2> e não <h4>: a página tem um <h1> e pulava direto para
            o nível 4, o que faz o leitor de tela anunciar dois níveis
            que não existem. O card da peça abaixo é <h3>. */}
        <h2 title={ev?.name || undefined} style={{
          fontFamily: FONT.display,
          // 16/700: o nome do evento estava em 18/800, mais pesado
          // que o próprio <h1> da tela em peso e a um ponto dele em
          // tamanho — e ele se repete a cada grupo da lista.
          fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em',
          color: T.text, margin: 0, minWidth: 0,
          flex: cards ? '1 1 calc(100% - 32px)' : '0 1 auto',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {ev?.name || 'Sem Evento'}
          {ev?.startDate && (
            <span style={{ color: T.second, fontWeight: 500, marginLeft: 10, fontSize: 12 }}>
              {format(parseDateLocal(ev.startDate), "MMMM yyyy", { locale: ptBR })}
            </span>
          )}
        </h2>
        {(() => {
          // Marco de Aprovação de Layout — regra única em
          // lib/atendimento-prazo, a mesma do filtro "Atrasados" e do
          // cabeçalho do modal. `hoje` é a âncora estável da tela.
          const p = prazoAprovacaoLayout(ev, hoje);
          if (!p) return null;
          const diff = p.diff;
          const ds = p.dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
          // A MESMA régua do semáforo de marco da Arte, que passa AA
          // nos quatro degraus. As cores daqui eram próprias e
          // reprovavam justamente nos dois estados que mais pedem
          // leitura: "vence hoje" (#D97A1E sobre #FEF3E7 ≈ 2,9:1) e
          // "vence em até 3 dias" (#C97B4B sobre #FDF0E8 ≈ 3,2:1).
          const s = diff < 0
            ? { bg: TOM.perigo.bg, border: TOM.perigo.border, text: TOM.perigo.text }
            : diff === 0
            ? { bg: TOM.alerta.bg, border: TOM.alerta.border, text: TOM.alerta.text }
            : diff <= 3
            ? { bg: TOM.laranja.bg, border: TOM.laranja.border, text: T.accentText }
            : { bg: N.n2, border: T.border, text: T.apoio };
          // POR EXTENSO. O selo dizia "Aprovação de Layout · 06/08
          // (13d)" e deixava a leitura mais importante — se já venceu
          // ou ainda falta — só no TOM DA COR. Quem não distingue o
          // vermelho do âmbar lia a mesma frase nos dois casos
          // (WCAG 1.4.1). O "(13d)" entre parênteses e com opacidade
          // 0.7 também não dizia se eram dias passados ou futuros.
          const dias = Math.abs(diff);
          const plural = dias === 1 ? 'dia' : 'dias';
          const texto = diff < 0
            ? `Aprovação de Layout venceu ${ds} · há ${dias} ${plural}`
            : diff === 0
              ? `Aprovação de Layout vence hoje · ${ds}`
              : `Aprovação de Layout vence ${ds} · em ${dias} ${plural}`;
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: '3px 10px', fontSize: 11, fontWeight: 700, color: s.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {texto}
            </span>
          );
        })()}
        {/* "3 NA SUA MESA" — o número que decide por onde começar.

            O grupo dizia só quantas peças tem, e uma pilha de 14 é
            indistinguível de outra pilha de 14 quando o que importa
            é quantas dependem de VOCÊ agora. É a mesma conta da
            primeira célula do placar, no grão do evento. */}
        <span style={{ marginLeft: cards ? 0 : 'auto', display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 12, color: T.second, fontVariantNumeric: 'tabular-nums' }}>
            {eventItems.length} {eventItems.length === 1 ? 'peça' : 'peças'}
          </span>
          {(() => {
            const naMesa = eventItems.filter((i) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao").length;
            if (naMesa === 0) return null;
            return (
              <span
                data-testid={`grupo-na-sua-mesa-${eventId}`}
                style={{ fontSize: 12, fontWeight: 700, color: TOM.alerta.text, fontVariantNumeric: 'tabular-nums' }}
              >
                · {naMesa} na sua mesa
              </span>
            );
          })()}
        </span>
      </div>

      {/* Cards — montados SÓ com o evento aberto. Antes o grupo
          recolhido escondia as peças com `display: none`, mas elas
          continuavam no DOM e em cada render: com os eventos todos
          fechados (o padrão), ~500 cards invisíveis — thumb, chips,
          selos — eram refeitos a cada tecla da busca. Escondido por
          display:none já não entrava no Ctrl+F nem no leitor de tela,
          então não montar não tira nada de quem usa. */}
      {eventoAberto(eventId) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {eventItems.map((item, idx) => (
            <CartaoDaPeca key={item.id} item={item} prevItem={idx > 0 ? eventItems[idx - 1] : null} cards={cards} {...doCartao} />
          ))}
        </div>
      )}
    </div>
  );
}
