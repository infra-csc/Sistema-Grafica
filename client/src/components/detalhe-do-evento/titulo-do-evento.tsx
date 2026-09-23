// ─────────────────────────────────────────────────────────────────────────────
// O TÍTULO DO EVENTO — nome e status, a frase de resolução com a barra de
// fases, e os chips (total, m², um por status e o de rascunhos não enviados).
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { Package } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Selo } from "@/components/ui/selo";
import { getStatusMeta } from "@/lib/status";
import { PHASES } from "@/lib/fases";
import { T, N, TOM, FONT, FS, FW } from "@/lib/theme";
import type { EventoDoDetalhe, PecaDoEvento } from "./tipos";

export function TituloDoEvento({
  event, fraseResolucao, fases, pecasNaConta, entregues, totalDePecas, complementCount, totalM2,
  canceladasForaDaConta, statusChips, statusFilter, setStatusFilter, rascunhos, irParaRascunhos,
  canEditLists, eventoFinalizado, isMobile,
}: {
  event: EventoDoDetalhe;
  fraseResolucao: string | null;
  fases: number[];
  pecasNaConta: PecaDoEvento[];
  entregues: number;
  /** Todas as peças do evento (rascunhos inclusive): sem nenhuma, sem chips. */
  totalDePecas: number;
  complementCount: number;
  totalM2: number;
  canceladasForaDaConta: number;
  statusChips: [string, number][];
  statusFilter: string[];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  /** Quantos rascunhos esperam envio. */
  rascunhos: number;
  irParaRascunhos: () => void;
  canEditLists: boolean;
  eventoFinalizado: boolean;
  isMobile: boolean;
}) {
  return (
    <div style={{ flex: '1 1 420px', minWidth: 0 }}>
      {/* Metadado, não título: sem caixa alta, que o fazia disputar a
          primeira leitura com o nome do evento. */}
      <p style={{ color: T.second, fontSize: 12, fontWeight: 500, margin: '0 0 6px 0' }}>
        Criado em {new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Título com os MESMOS tokens do <CabecalhoDaPagina> (display,
            FS.h1, FW.rotulo), mas escrito aqui: o componente não comporta
            o selo de status ao lado do nome nem a frase/barra/chips
            abaixo. Sem caixa alta: o cartão da lista mostra o nome como
            foi digitado. overflowWrap: nome longo não estoura 390px. */}
        <h1
          data-testid="title-event-name"
          style={{ fontFamily: FONT.display, fontSize: FS.h1, fontWeight: FW.rotulo, letterSpacing: '-0.03em', color: T.text, lineHeight: 1.15, margin: 0, overflowWrap: 'anywhere' }}
        >
          {event.name}
        </h1>
        {/* Status do evento ao lado do nome — paridade com o card da
            lista (lá o badge existe; aqui o status ficava invisível). */}
        <StatusBadge status={event.status} />
      </div>
      {/* A FRASE DE RESOLUÇÃO e a BARRA DE FASES. O cartão da lista de
          Eventos tem a barra; a tela que DETÉM as peças não tinha
          leitura de progresso nenhuma — era somar os chips de cabeça. A
          barra usa a MESMA contagem do cartão (lib/fases), não um
          derivado local. */}
      {fraseResolucao && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          <p data-testid="text-resolucao" style={{ margin: 0, fontSize: 13, color: T.apoio, lineHeight: 1.5 }}>
            {fraseResolucao}
          </p>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <span
              data-testid="bar-fases"
              role="img"
              aria-label={PHASES.map((p, i) => `${fases[i]} ${p.noun}`).join(', ')}
              style={{ display: 'flex', width: 120, height: 9, borderRadius: 999, overflow: 'hidden', backgroundColor: N.n3, flexShrink: 0 }}
            >
              {pecasNaConta.length > 0 && PHASES.map((fase, i) => (
                fases[i] > 0
                  ? <span key={fase.key} title={`${fases[i]} ${fase.noun}`} style={{ width: `${(fases[i] / pecasNaConta.length) * 100}%`, backgroundColor: fase.color }} />
                  : null
              ))}
            </span>
            <span style={{ fontFamily: FONT.mono, fontSize: 12, color: T.apoio, whiteSpace: 'nowrap' }}>
              {entregues}/{pecasNaConta.length}
            </span>
          </span>
        </div>
      )}
      {/* Chips de status: "onde está minha lista" num relance — total,
          m² e um chip clicável por status presente (filtra a listagem). */}
      {totalDePecas > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
          {/* "(N complemento)" é o custo declarado do modelo: cada aumento
              pós-produção é uma peça a mais na contagem. Dizer quantas
              são complemento evita a pergunta "por que 43 se a lista tinha
              42?" — o número está certo, e agora explica a si mesmo. */}
          <Selo
            cores={{ bg: T.surface, text: T.second, border: T.border }}
            // Mesma altura e corpo dos chips de status ao lado.
            style={{ fontSize: FS.meta, padding: '4px 12px', fontVariantNumeric: 'tabular-nums', minHeight: isMobile ? 44 : undefined }}
          >
            {pecasNaConta.length} {pecasNaConta.length === 1 ? 'peça' : 'peças'}
            {complementCount > 0 && ` (${complementCount} ${complementCount === 1 ? 'complemento' : 'complementos'})`}
            {' · '}{totalM2.toFixed(2)} m²
          </Selo>
          {canceladasForaDaConta > 0 && (
            <span data-testid="text-canceladas-fora-da-conta" style={{ fontSize: 12, color: T.second, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
              {canceladasForaDaConta} {canceladasForaDaConta === 1 ? 'cancelada' : 'canceladas'} fora da conta
            </span>
          )}
          {statusChips.map(([status, count]) => {
            const m = getStatusMeta(status);
            const active = statusFilter.includes(status);
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                title={active ? `Remover filtro "${m.label}"` : `Filtrar por "${m.label}"`}
                onClick={() => setStatusFilter(f => active ? f.filter(s => s !== status) : [...f, status])}
                data-testid={`chip-status-${status}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 700, color: m.text,
                  backgroundColor: m.bg, border: `1px solid ${active ? m.text : m.border}`,
                  boxShadow: active ? `inset 0 0 0 1px ${m.text}` : 'none',
                  borderRadius: 999, padding: '4px 12px', cursor: 'pointer',
                  // Alvo de dedo no celular (44px); no ponteiro a pílula segue compacta.
                  minHeight: isMobile ? 44 : undefined, fontVariantNumeric: 'tabular-nums',
                  whiteSpace: 'nowrap', transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: m.dot, flexShrink: 0 }} />
                {m.label} · {count}
              </button>
            );
          })}
          {/* RASCUNHO NÃO ENVIADO, NO TOPO. Os rascunhos ficam fora destes
              chips (moram no card próprio, lá embaixo) — e era justamente
              o que se esquecia: a lista parecia montada e nada andava. O
              chip diz quantos esperam envio e leva até o card. */}
          {rascunhos > 0 && (
            <button
              type="button"
              onClick={irParaRascunhos}
              data-testid="chip-rascunhos-nao-enviados"
              title="Peças criadas que ainda não foram enviadas para a vinculação — clique para ir até elas"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 12, fontWeight: 700, color: TOM.alerta.text,
                backgroundColor: TOM.alerta.bg, border: `1px dashed ${TOM.alerta.text}`,
                borderRadius: 999, padding: '4px 12px', cursor: 'pointer',
                minHeight: isMobile ? 44 : undefined, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
              }}
            >
              <Package aria-hidden="true" style={{ width: 12, height: 12 }} />
              {rascunhos} em rascunho · {canEditLists && !eventoFinalizado ? 'falta enviar' : 'não enviadas'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
