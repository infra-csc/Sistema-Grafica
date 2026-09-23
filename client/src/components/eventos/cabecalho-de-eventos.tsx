// O cabeçalho de Eventos: título, os atalhos de foco que também filtram e as
// ações (Arquivados, Novo Evento).
import { Plus } from "lucide-react";
import { T, FS, R, TOM, FW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { EventosArquivados } from "./eventos-arquivados";
import type { FiltrosDeEventos } from "./use-filtros-de-eventos";
import type { EventosFiltrados } from "./use-eventos-filtrados";

export function CabecalhoDeEventos({ filtros, focoCounts, canCreate, canDelete, isMobile, onNovoEvento }: {
  filtros: FiltrosDeEventos;
  focoCounts: EventosFiltrados["focoCounts"];
  canCreate: boolean;
  canDelete: boolean;
  isMobile: boolean;
  onNovoEvento: () => void;
}) {
  const { foco, setFoco, selectedPriorities, setSelectedPriorities } = filtros;
  // A margem de baixo do cabeçalho (20) anula-se com esta (-20): a coluna da
  // página já dá o respiro pelo `gap`, e somar os dois dobrava o espaço antes
  // dos filtros.
  return (
    <div data-testid="title-eventos" style={{ marginBottom: -20 }}>
      <CabecalhoDaPagina
        titulo="Eventos"
        // No lugar do subtítulo genérico ("Gerencie todos os eventos de
        // produção gráfica", que não informava nada): atalhos que também
        // filtram, com contagem calculada sobre os demais filtros. "Saem
        // esta semana" ficou de fora de propósito — duplicaria o toggle
        // "Próximos 10 dias" que já existe na barra.
        subtitulo={
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 4 }}>
          {[
            { key: 'atrasado', label: 'Marco atrasado', count: focoCounts.atrasado, tone: { text: TOM.perigo.text, bg: TOM.perigo.bg, border: TOM.perigo.border }, active: foco === 'atrasado', toggle: () => setFoco(foco === 'atrasado' ? '' : 'atrasado') },
            { key: 'sem_prioridade', label: 'Sem prioridade', count: focoCounts.semPrioridade, tone: { text: T.apoio, bg: T.low, border: T.border }, active: selectedPriorities.length === 1 && selectedPriorities[0] === 'sem_prioridade', toggle: () => setSelectedPriorities((prev) => (prev.length === 1 && prev[0] === 'sem_prioridade') ? [] : ['sem_prioridade']) },
            { key: 'sem_pecas', label: 'Sem peças', count: focoCounts.semPecas, tone: { text: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border }, active: foco === 'sem_pecas', toggle: () => setFoco(foco === 'sem_pecas' ? '' : 'sem_pecas') },
            { key: 'pedidos', label: 'Solicitações de peças', count: focoCounts.pedidos, tone: { text: TOM.alerta.text, bg: TOM.alerta.bg, border: TOM.alerta.border }, active: foco === 'pedidos', toggle: () => setFoco(foco === 'pedidos' ? '' : 'pedidos') },
          ].map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.toggle}
              aria-pressed={chip.active}
              disabled={chip.count === 0 && !chip.active}
              data-testid={`chip-foco-${chip.key}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '4px 11px', borderRadius: R.pill,
                // Alvo de dedo no celular; no desktop a pílula segue compacta.
                minHeight: isMobile ? 44 : undefined,
                fontSize: FS.small, fontWeight: '700',
                cursor: chip.count === 0 && !chip.active ? 'default' : 'pointer',
                opacity: chip.count === 0 && !chip.active ? 0.45 : 1,
                border: `1px solid ${chip.active ? T.text : chip.tone.border}`,
                backgroundColor: chip.active ? T.dark : chip.tone.bg,
                color: chip.active ? T.surface : chip.tone.text,
                transition: 'all 0.15s',
              }}
            >
              {chip.label}
              <span style={{ fontWeight: FW.rotulo }}>{chip.count}</span>
            </button>
          ))}
        </span>
        }
        acoes={canCreate || canDelete ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
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
        ) : undefined}
      />
    </div>
  );
}
