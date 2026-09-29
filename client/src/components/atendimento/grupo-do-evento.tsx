// ─────────────────────────────────────────────────────────────────────────────
// UM GRUPO DA FILA: o cabeçalho do evento (prazo de Aprovação de Layout e "N
// na sua mesa") e, com o evento aberto, as linhas das peças dele.
//
// UMA SUPERFÍCIE POR EVENTO (29/09). O cabeçalho era texto solto com uma régua
// embaixo, a 32px do grupo seguinte, e cada peça um card próprio com borda,
// raio e 12px de vão — com os eventos recolhidos (o padrão), a tela era uma
// coluna de títulos boiando no cinza; abertos, uma pilha de molduras. Agora o
// evento é UMA folha: o cabeçalho é a faixa de cima (o alvo do clique inteiro)
// e as peças são linhas dela, separadas por hairline — o mesmo desenho do
// Histórico, logo ao lado.
// ─────────────────────────────────────────────────────────────────────────────
import { ChevronDown, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateLocal } from "@/lib/utils";
import { prazoAprovacaoLayout } from "@/lib/atendimento-prazo";
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { situacaoDaPeca } from "./regras";
import { letra, SUPERFICIE } from "./estilos";
import { CartaoDaPeca, type PropsDoCartao } from "./cartao-da-peca";
import type { EventoAtendimento, PecaAtendimento } from "./tipos";

export function GrupoDoEvento({
  eventId, eventItems, getEventInfo, eventoAberto, toggleEventCollapsed, cards, hoje, isMobile, dedo, ...doCartao
}: {
  eventId: string;
  eventItems: PecaAtendimento[];
  getEventInfo: (eventId: string) => EventoAtendimento | undefined;
  eventoAberto: (id: string) => boolean;
  toggleEventCollapsed: (id: string) => void;
  hoje: Date;
  isMobile: boolean;
  dedo: boolean;
} & Omit<PropsDoCartao, "item" | "prevItem" | "toque">) {
  const { itemApprovalsMap } = doCartao;
  const ev = getEventInfo(eventId);
  const aberto = eventoAberto(eventId);
  const toque = isMobile || dedo;
  // ALTURA ESTIMADA do grupo, para o navegador reservar o espaço sem
  // desenhar o conteúdo. Sem uma estimativa próxima, a barra de
  // rolagem pula enquanto se rola — o remédio ficaria pior que a
  // doença. MEDIDO em 1366 (29/09): o cabeçalho tem 56px (+2 de borda) e
  // cada peça ~100px, mais a faixa de tipo (~31px) quando o tipo muda — 120
  // por peça cobre os dois. Recolhido, o grupo é só o cabeçalho: reservar a
  // altura das peças deixaria um buraco do tamanho do evento embaixo dele.
  const alturaEstimada = eventoAberto(eventId)
    ? 58 + eventItems.length * 120
    : 58;
  const naMesa = eventItems.filter((i) => situacaoDaPeca(itemApprovalsMap[i.id]) === "nova_versao").length;
  // CONTENT-VISIBILITY: AUTO — o grupo fora da tela não é desenhado, mas
  // CONTINUA NO DOM. É o que permite abrir todos os eventos de uma vez sem
  // travar: o navegador pula layout e pintura do que ninguém está vendo, e o
  // Ctrl+F, o leitor de tela e os links continuam funcionando — o que uma
  // lista virtualizada quebraria.
  return (
    <section
      style={{
        ...SUPERFICIE,
        contentVisibility: "auto",
        containIntrinsicSize: `auto ${alturaEstimada}px`,
      } as React.CSSProperties}
    >
      {/* Cabeçalho do evento — recolhe/expande. Era só onClick num <div>:
          recolher grupo, que é o principal recurso de navegação desta tela,
          existia apenas para quem usa mouse. */}
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
        title={aberto ? 'Recolher evento' : 'Expandir evento'}
        className="atd-cabeca-do-grupo"
        // NO CELULAR a linha QUEBRA: nome, selo de prazo por extenso e
        // contagem numa fileira `nowrap` pediam ~600px; em 390 o nome
        // encolhia a zero e o resto vazava para a direita.
        style={{
          display: 'flex', alignItems: 'center', gap: cards ? 8 : 14,
          flexWrap: cards ? 'wrap' : 'nowrap',
          padding: cards ? '12px 14px' : '14px 18px',
          minHeight: 56,
          borderBottom: aberto ? `1px solid ${T.border}` : undefined,
          backgroundColor: aberto ? T.bg : undefined,
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <ChevronDown
          aria-hidden="true"
          style={{
            width: 16, height: 16, color: T.second, flexShrink: 0,
            transform: aberto ? 'none' : 'rotate(-90deg)',
            transition: 'transform var(--dur-media) var(--ease-saida)',
          }}
        />
        {/* <h2> e não <h4>: a página tem um <h1> e pulava direto para
            o nível 4. A peça abaixo é <h3>. 16/700: o nome se repete a
            cada grupo e não pode pesar mais que o título da tela. */}
        <h2 title={ev?.name || undefined} style={{
          fontFamily: FONT.display,
          fontSize: 16, fontWeight: FW.forte, letterSpacing: '-0.02em',
          color: T.text, margin: 0, minWidth: 0, lineHeight: 1.3,
          flex: cards ? '1 1 calc(100% - 32px)' : '0 1 auto',
          // No celular o nome QUEBRA em vez de cortar: a linha é só dele.
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: cards ? 'normal' : 'nowrap',
        }}>
          {ev?.name || 'Sem Evento'}
          {ev?.startDate && (
            <span style={{ fontFamily: FONT.corpo, color: T.second, fontWeight: FW.corpo, marginLeft: 10, fontSize: letra(FS.meta, toque), letterSpacing: 0 }}>
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
          // nos quatro degraus.
          const s = diff < 0
            ? { bg: TOM.perigo.bg, border: TOM.perigo.border, text: TOM.perigo.text, dot: TOM.perigo.dot }
            : diff === 0
            ? { bg: TOM.alerta.bg, border: TOM.alerta.border, text: TOM.alerta.text, dot: TOM.alerta.dot }
            : diff <= 3
            ? { bg: TOM.laranja.bg, border: TOM.laranja.border, text: T.accentText, dot: T.accent }
            : { bg: N.n2, border: T.border, text: T.apoio, dot: T.bdark };
          // POR EXTENSO: se já venceu ou ainda falta não pode morar só no
          // TOM DA COR (WCAG 1.4.1).
          const dias = Math.abs(diff);
          const plural = dias === 1 ? 'dia' : 'dias';
          const texto = diff < 0
            ? `Aprovação de Layout venceu ${ds} · há ${dias} ${plural}`
            : diff === 0
              ? `Aprovação de Layout vence hoje · ${ds}`
              : `Aprovação de Layout vence ${ds} · em ${dias} ${plural}`;
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, maxWidth: '100%', backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: R.pill, padding: '3px 10px', fontSize: letra(FS.small, toque), fontWeight: FW.forte, color: s.text, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.dot, flexShrink: 0 }} />
              {texto}
            </span>
          );
        })()}
        {/* "3 NA SUA MESA" — o número que decide por onde começar. Uma
            pilha de 14 é indistinguível de outra pilha de 14 quando o que
            importa é quantas dependem de VOCÊ agora. É a mesma conta da
            primeira célula do placar, no grão do evento — e ganhou a forma
            de selo (âmbar, com o ícone de versão nova) para o olho achá-lo
            descendo a lista de eventos recolhidos. */}
        <span style={{ marginLeft: cards ? 0 : 'auto', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, whiteSpace: 'nowrap' }}>
          {naMesa > 0 && (
            <span
              data-testid={`grupo-na-sua-mesa-${eventId}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 9px', borderRadius: R.pill,
                backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`,
                fontSize: letra(FS.small, toque), fontWeight: FW.forte, color: TOM.alerta.text, fontVariantNumeric: 'tabular-nums',
              }}
            >
              <RotateCcw aria-hidden="true" style={{ width: 11, height: 11 }} />
              {naMesa} na sua mesa
            </span>
          )}
          <span style={{ fontSize: letra(FS.meta, toque), color: T.second, fontVariantNumeric: 'tabular-nums' }}>
            {eventItems.length} {eventItems.length === 1 ? 'peça' : 'peças'}
          </span>
        </span>
      </div>

      {/* Linhas — montadas SÓ com o evento aberto. Com os eventos todos
          fechados (o padrão), ~500 cards invisíveis eram refeitos a cada
          tecla da busca. Escondido por display:none já não entrava no Ctrl+F
          nem no leitor de tela, então não montar não tira nada de quem usa. */}
      {aberto && (
        <div className="atd-entrar">
          {eventItems.map((item, idx) => (
            <CartaoDaPeca key={item.id} item={item} prevItem={idx > 0 ? eventItems[idx - 1] : null} cards={cards} toque={toque} {...doCartao} />
          ))}
        </div>
      )}
    </section>
  );
}
