// O cabeçalho de Eventos: título, os atalhos de foco que também filtram e as
// ações (Arquivados, Novo Evento).
import { Plus } from "lucide-react";
import { T, FS, R, TOM, FW, FONT } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EventosArquivados } from "./eventos-arquivados";
import type { FiltrosDeEventos } from "./use-filtros-de-eventos";
import type { EventosFiltrados } from "./use-eventos-filtrados";

export function CabecalhoDeEventos({ filtros, focoCounts, canCreate, canDelete, isMobile, carregado = true, semEventos = false, onNovoEvento }: {
  filtros: FiltrosDeEventos;
  focoCounts: EventosFiltrados["focoCounts"];
  canCreate: boolean;
  canDelete: boolean;
  isMobile: boolean;
  /** Lista carregada sem erro: antes disso as contagens seriam um "0" falso. */
  carregado?: boolean;
  /** Nenhum evento existe: os atalhos não têm o que recortar e saem de cena. */
  semEventos?: boolean;
  onNovoEvento: () => void;
}) {
  const { foco, setFoco, selectedPriorities, setSelectedPriorities } = filtros;

  // No lugar do subtítulo genérico ("Gerencie todos os eventos de produção
  // gráfica", que não informava nada): atalhos que também filtram, com
  // contagem calculada sobre os demais filtros. "Saem esta semana" ficou de
  // fora de propósito — duplicaria o toggle "Próximos 10 dias" da barra.
  const chips = [
    { key: 'atrasado', label: 'Marco atrasado', count: focoCounts.atrasado, tone: { text: TOM.perigo.text, bg: TOM.perigo.bg, border: TOM.perigo.border, dot: TOM.perigo.dot }, active: foco === 'atrasado', toggle: () => setFoco(foco === 'atrasado' ? '' : 'atrasado') },
    { key: 'sem_prioridade', label: 'Sem prioridade', count: focoCounts.semPrioridade, tone: { text: T.strong, bg: T.low, border: T.border, dot: T.muted }, active: selectedPriorities.length === 1 && selectedPriorities[0] === 'sem_prioridade', toggle: () => setSelectedPriorities((prev) => (prev.length === 1 && prev[0] === 'sem_prioridade') ? [] : ['sem_prioridade']) },
    { key: 'sem_pecas', label: 'Sem peças', count: focoCounts.semPecas, tone: { text: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border, dot: TOM.alerta.dot }, active: foco === 'sem_pecas', toggle: () => setFoco(foco === 'sem_pecas' ? '' : 'sem_pecas') },
    { key: 'pedidos', label: 'Solicitações de peças', count: focoCounts.pedidos, tone: { text: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border, dot: TOM.alerta.dot }, active: foco === 'pedidos', toggle: () => setFoco(foco === 'pedidos' ? '' : 'pedidos') },
  ];

  const atalhos = semEventos ? null : (
    <span
      role="group"
      aria-label="Atalhos de foco"
      className={isMobile ? 'evl-rolagem' : undefined}
      style={{
        display: 'flex', gap: 6, marginTop: isMobile ? 0 : 6,
        // No celular, UMA fileira que rola de lado — quatro atalhos em duas
        // linhas empurravam a lista para baixo antes de qualquer filtro.
        flexWrap: isMobile ? 'nowrap' : 'wrap',
        overflowX: isMobile ? 'auto' : undefined,
        margin: isMobile ? '0 -12px' : undefined,
        padding: isMobile ? '0 12px' : undefined,
      }}
    >
      {chips.map((chip) => {
        // ZERO não é "desligado": é uma informação ("nada atrasado"). Neutro e
        // legível, em vez da pílula colorida a 45% de opacidade que reprovava
        // contraste e parecia defeito.
        const vazio = carregado && chip.count === 0 && !chip.active;
        const travado = !carregado || vazio;
        return (
          <button
            key={chip.key}
            type="button"
            onClick={chip.toggle}
            aria-pressed={chip.active}
            disabled={travado}
            data-testid={`chip-foco-${chip.key}`}
            className="evl-chip"
            title={vazio ? `${chip.label}: nenhum evento agora` : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              height: 26, padding: '0 10px', borderRadius: R.pill,
              fontFamily: 'inherit', fontSize: FS.small, fontWeight: FW.forte, whiteSpace: 'nowrap',
              cursor: travado ? 'default' : 'pointer',
              border: `1px solid ${chip.active ? T.dark : vazio || !carregado ? T.border : chip.tone.border}`,
              backgroundColor: chip.active ? T.dark : vazio || !carregado ? T.surface : chip.tone.bg,
              color: chip.active ? T.surface : vazio || !carregado ? T.second : chip.tone.text,
            }}
          >
            {!chip.active && (
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, backgroundColor: vazio || !carregado ? T.border : chip.tone.dot }} />
            )}
            {chip.label}
            {carregado && (
              <span style={{ fontFamily: FONT.mono, fontWeight: FW.rotulo, fontVariantNumeric: 'tabular-nums' }}>{chip.count}</span>
            )}
          </button>
        );
      })}
    </span>
  );

  const acoes = canCreate || canDelete ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {canDelete && <EventosArquivados />}
      {canCreate && (
        <Botao
          variante="primario"
          icone={Plus}
          tamanho={isMobile ? 'toque' : 'md'}
          data-testid="button-create-event"
          onClick={onNovoEvento}
          style={{ flexShrink: 0 }}
        >
          Novo Evento
        </Botao>
      )}
    </div>
  ) : null;

  // As ações ficam NA LINHA DO TÍTULO em todas as larguras. O cabeçalho da
  // casa as derruba para baixo no celular (o título tem base de 260px), e o
  // "Novo Evento" ia parar sozinho numa fileira, entre os atalhos e a busca.
  return (
    <div data-testid="title-eventos" style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'center' : 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CabecalhoDaPagina titulo="Eventos" subtitulo={isMobile ? undefined : atalhos ?? undefined} semMargem />
        </div>
        {acoes}
      </div>
      {isMobile && atalhos}
    </div>
  );
}
