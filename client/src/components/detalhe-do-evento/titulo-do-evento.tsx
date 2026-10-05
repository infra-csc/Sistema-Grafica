// ─────────────────────────────────────────────────────────────────────────────
// O TÍTULO DO EVENTO e o RESUMO DA LISTA.
//
// · TituloDoEvento — a linha de contexto (franquia e criação), o nome com o
//   status, e a frase de resolução. Divide a linha com as ações (à direita).
// · ResumoDoEvento — a faixa inteira logo abaixo: o progresso (barra de fases
//   + "N de M entregues"), o total (peças e m²) e um chip por status presente
//   (filtra a lista), mais o de rascunhos não enviados.
//
// POR QUE DUAS PEÇAS. Os chips moravam dentro do bloco do título, que divide a
// linha com as ações: com onze status a coluna crescia três linhas e empurrava
// os botões para baixo dela, soltos no meio da página. Agora o título e as
// ações ficam numa linha só e o resumo ganha a largura inteira.
//
// POR QUE OS CHIPS SÃO NEUTROS. Onze pílulas, cada uma na tinta do seu status,
// eram um arco-íris que disputava a primeira leitura com o nome do evento. A
// cor ficou só na bolinha (o código de cor das outras telas continua
// valendo); a tinta inteira aparece só no chip ATIVO — que é o que filtra.
// ─────────────────────────────────────────────────────────────────────────────
import type { Dispatch, SetStateAction } from "react";
import { Package, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { getStatusMeta } from "@/lib/status";
import { PHASES } from "@/lib/fases";
import { T, N, TOM, FONT, FS, FW, R } from "@/lib/theme";
import { formatarM2, plural } from "./regras";
import type { EventoDoDetalhe, PecaDoEvento } from "./tipos";

export function TituloDoEvento({ event, fraseResolucao, isMobile }: {
  event: EventoDoDetalhe;
  fraseResolucao: string | null;
  isMobile: boolean;
}) {
  const criadoEm = new Date(event.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <div style={{ flex: '1 1 380px', minWidth: 0 }}>
      {/* Contexto, não título: franquia e data de criação numa linha só,
          em cinza de apoio — sem caixa alta, que disputava com o nome. */}
      <p data-testid="text-contexto-evento" style={{ color: T.second, fontSize: FS.meta, fontWeight: FW.corpo, margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {event.franchise && (
          <>
            <span style={{ color: T.apoio, fontWeight: FW.medio }}>{event.franchise}</span>
            <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', backgroundColor: T.bdark }} />
          </>
        )}
        <span>Criado em {criadoEm}</span>
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px 12px', flexWrap: 'wrap' }}>
        {/* Os MESMOS tokens do <CabecalhoDaPagina> (display, FS.h1). Sem
            caixa alta: o cartão da lista mostra o nome como foi digitado.
            overflowWrap: nome longo não estoura 390px. */}
        <h1
          data-testid="title-event-name"
          style={{ fontFamily: FONT.display, fontSize: isMobile ? 22 : FS.h1 + 2, fontWeight: FW.forte, letterSpacing: '-0.035em', color: T.text, lineHeight: 1.12, margin: 0, overflowWrap: 'anywhere' }}
        >
          {event.name}
        </h1>
        {/* Status do evento ao lado do nome — paridade com o card da lista. */}
        <StatusBadge status={event.status} />
      </div>
      {/* A FRASE DE RESOLUÇÃO: onde o evento está, em uma linha derivada dos
          dados. A barra de fases que a acompanhava mora no resumo, abaixo. */}
      {fraseResolucao && (
        <p data-testid="text-resolucao" style={{ margin: '10px 0 0', fontSize: isMobile ? FS.body : FS.read, color: T.apoio, lineHeight: 1.5, maxWidth: 720 }}>
          {fraseResolucao}
        </p>
      )}
    </div>
  );
}

/** Chip do resumo: um por RÓTULO (dois status com o mesmo nome viram um só). */
type ChipDoResumo = { chave: string; statuses: string[]; count: number };

/**
 * DOIS STATUS, UM RÓTULO. awaiting_finalization e awaiting_creator_review têm
 * o mesmo nome e a mesma cor de propósito (lib/status) — e apareciam como dois
 * chips "Aguardando Finalização" lado a lado, parecendo erro. Agrupar pelo
 * rótulo junta os dois num chip só, que filtra os dois status juntos.
 */
function agruparPorRotulo(statusChips: [string, number][]): ChipDoResumo[] {
  const porRotulo = new Map<string, ChipDoResumo>();
  for (const [status, count] of statusChips) {
    const rotulo = getStatusMeta(status).label;
    const atual = porRotulo.get(rotulo);
    if (atual) { atual.statuses.push(status); atual.count += count; }
    else porRotulo.set(rotulo, { chave: status, statuses: [status], count });
  }
  return Array.from(porRotulo.values());
}

export function ResumoDoEvento({
  fases, pecasNaConta, entregues, totalDePecas, complementCount, totalM2,
  canceladasForaDaConta, statusChips, statusFilter, setStatusFilter, rascunhos, irParaRascunhos,
  canEditLists, eventoFinalizado, isMobile, children,
}: {
  fases: number[];
  pecasNaConta: PecaDoEvento[];
  entregues: number;
  /** Todas as peças do evento (rascunhos inclusive): sem nenhuma, sem resumo. */
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
  /** Avisos discretos do evento (ex.: molde sem prazo), no fim da faixa. */
  children?: React.ReactNode;
}) {
  if (totalDePecas === 0) return children ? <div style={{ marginTop: 16 }}>{children}</div> : null;
  const chips = agruparPorRotulo(statusChips);
  const alvo = isMobile ? 44 : 32;
  const divisor = <span aria-hidden="true" className="evd-resumo-divisor" style={{ width: 1, alignSelf: 'stretch', minHeight: 24, backgroundColor: T.border }} />;

  return (
    <div data-testid="resumo-do-evento" style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px 12px' : '10px 16px', flexWrap: 'wrap', marginTop: isMobile ? 18 : 22, paddingTop: isMobile ? 16 : 18, borderTop: `1px solid ${T.border}` }}>
      {/* PROGRESSO — a barra usa a MESMA contagem do cartão de Eventos
          (lib/fases), não um derivado local. */}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
        <span
          data-testid="bar-fases"
          role="img"
          aria-label={PHASES.map((p, i) => `${fases[i]} ${p.noun}`).join(', ')}
          style={{ display: 'flex', width: isMobile ? 96 : 132, height: 8, borderRadius: R.pill, overflow: 'hidden', backgroundColor: N.n3, flexShrink: 0, gap: 1 }}
        >
          {pecasNaConta.length > 0 && PHASES.map((fase, i) => (
            fases[i] > 0
              ? <span key={fase.key} title={`${fases[i]} ${fase.noun}`} style={{ width: `${(fases[i] / pecasNaConta.length) * 100}%`, backgroundColor: fase.color }} />
              : null
          ))}
        </span>
        <span style={{ fontSize: FS.body, color: T.apoio, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
          <strong style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: T.text }}>{entregues}/{pecasNaConta.length}</strong>
          {' '}{plural(pecasNaConta.length, 'entregue', 'entregues')}
        </span>
      </div>

      {divisor}

      {/* TOTAL — "(N complemento)" é o custo declarado do modelo: cada
          aumento pós-produção é uma peça a mais na contagem. */}
      <span data-testid="text-total-do-evento" style={{ fontSize: FS.body, color: T.apoio, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        <strong style={{ color: T.text, fontWeight: FW.forte }}>{pecasNaConta.length}</strong> {plural(pecasNaConta.length, 'peça', 'peças')}
        {complementCount > 0 && <span style={{ color: T.second }}> ({complementCount} {plural(complementCount, 'complemento', 'complementos')})</span>}
        <span aria-hidden="true" style={{ color: T.bdark, margin: '0 6px' }}>·</span>
        <strong style={{ color: T.text, fontWeight: FW.forte }}>{formatarM2(totalM2)}</strong> m²
        {canceladasForaDaConta > 0 && (
          <span data-testid="text-canceladas-fora-da-conta" style={{ color: T.second }}>
            <span aria-hidden="true" style={{ color: T.bdark, margin: '0 6px' }}>·</span>
            {canceladasForaDaConta} {canceladasForaDaConta === 1 ? 'cancelada' : 'canceladas'} fora da conta
          </span>
        )}
      </span>

      {/* RASCUNHO NÃO ENVIADO, NO TOPO. Os rascunhos ficam fora dos chips
          (moram no card próprio, lá embaixo) — e era justamente o que se
          esquecia. O chip diz quantos esperam envio e leva até o card. */}
      {rascunhos > 0 && (
        <button
          type="button"
          onClick={irParaRascunhos}
          data-testid="chip-rascunhos-nao-enviados"
          title="Peças criadas que ainda não foram enviadas para a vinculação — clique para ir até elas"
          className="evd-chip evd-chip-rascunho"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: FS.meta, fontWeight: FW.forte, color: TOM.alerta.text,
            backgroundColor: TOM.alerta.bg, border: `1px dashed ${TOM.alerta.border}`,
            borderRadius: R.pill, padding: '0 8px 0 11px', minHeight: alvo, cursor: 'pointer',
            fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
          }}
        >
          <Package aria-hidden="true" style={{ width: 13, height: 13 }} />
          {rascunhos} em rascunho · {canEditLists && !eventoFinalizado ? 'falta enviar' : 'não enviadas'}
          <ChevronRight aria-hidden="true" style={{ width: 13, height: 13 }} />
        </button>
      )}

      {/* Chips de status: "onde está minha lista" num relance — um por
          status presente, e o clique filtra a listagem. */}
      {chips.length > 0 && (
        <div role="group" aria-label="Filtrar a lista por status" style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {chips.map(({ chave, statuses, count }) => {
            const m = getStatusMeta(chave);
            const active = statuses.some((s) => statusFilter.includes(s));
            return (
              <button
                key={chave}
                type="button"
                aria-pressed={active}
                title={active ? `Remover filtro "${m.label}"` : `Filtrar por "${m.label}"`}
                onClick={() => setStatusFilter(f => active ? f.filter(s => !statuses.includes(s)) : [...f, ...statuses])}
                data-testid={`chip-status-${chave}`}
                className="evd-chip"
                style={{
                  ['--evd-chip-tinta' as string]: m.bg,
                  ['--evd-chip-borda' as string]: m.border,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  fontSize: FS.meta, fontWeight: FW.medio, color: active ? m.text : T.strong,
                  backgroundColor: active ? m.bg : T.surface,
                  border: `1px solid ${active ? m.text : T.border}`,
                  borderRadius: R.pill, padding: '0 11px', minHeight: alvo, cursor: 'pointer',
                  fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}
              >
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: m.dot, flexShrink: 0 }} />
                {m.label}
                <span style={{ fontFamily: FONT.mono, fontWeight: FW.forte, color: active ? m.text : T.second }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {children && <div style={{ flexBasis: '100%' }}>{children}</div>}
    </div>
  );
}
