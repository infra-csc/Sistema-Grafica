// ─────────────────────────────────────────────────────────────────────────────
// UMA LINHA DO HISTÓRICO: a peça, o status, a jornada numa faixa só e os
// patrocinadores com a decisão de cada um. O clique abre o detalhe.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, type Dispatch, type SetStateAction } from "react";
import { Eye, FileText, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DetalheProducao } from "@/components/detalhe-producao";
import { SeloKit } from "@/components/kit/selo-kit";
import { alvo } from "@/hooks/use-mobile";
import { getStatusMeta, getStatusLabel, getStatusShort, PRODUCTION_STATUSES, descricaoDoStatus } from "@/lib/status";
import { miniatura } from "@/lib/miniatura";
import { T, N, TOM } from "@/lib/theme";
import { statusDeExibicao } from "@shared/molde";
import { SITUACAO_META, aoFalharMiniatura, approvalVisual, jornadaDaPeca, situacaoDaPeca, tomDoIntervalo } from "./regras";
import type { EventoAtendimento, Patrocinador, PecaAtendimento, PecaDoHistorico, SponsorApproval } from "./tipos";

export function LinhaDoHistorico({
  item, ev, comRegua, itemSponsorsMap, itemApprovalsMap, setHistDetailItem, cards, dedo, hoje,
}: {
  item: PecaAtendimento;
  ev: EventoAtendimento | undefined;
  /** A régua entre linhas some na última: a borda da superfície já fecha embaixo. */
  comRegua: boolean;
  itemSponsorsMap: Record<string, Patrocinador[]>;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  setHistDetailItem: Dispatch<SetStateAction<PecaDoHistorico | null>>;
  cards: boolean;
  dedo: boolean;
  hoje: Date;
}) {
  const itemSps = itemSponsorsMap[item.id] || [];
  const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
  // Badge de status pela lib canônica: mesmo rótulo e cores das
  // outras telas (status desconhecido cai no fallback neutro).
  // Molde produzido: "Produzido (molde)", não o "Impresso/Acabamento" da peça comum.
  const statusCfg = getStatusMeta(statusDeExibicao(item));

  const sponsorApprovals = itemSps.map(sp => {
    const appr = approvals.find(a => a.sponsorId === sp.id);
    return { sponsor: sp, appr };
  });
  // ordenar: aprovados → nova versão → reprovados → aguardando
  const sortedApprovals = [...sponsorApprovals].sort((a, b) => {
    const order = (s?: string) => s === 'approved' ? 0 : s === 'new_version_pending' ? 1 : s === 'rejected' ? 2 : 3;
    return order(a.appr?.status) - order(b.appr?.status);
  });
  const approvedOnes = sponsorApprovals.filter(x => x.appr?.status === 'approved');
  const allApproved  = approvedOnes.length === sponsorApprovals.length && sponsorApprovals.length > 0;

  const fmtDt = (d: string | Date | null | undefined, short = false) => {
    if (!d) return null;
    return format(new Date(d), short ? "dd/MM" : "dd/MM/yy 'às' HH:mm", { locale: ptBR });
  };
  // acento lateral por status
  const accentColor = allApproved ? TOM.sucesso.dot
    : (PRODUCTION_STATUSES as readonly string[]).includes(item.status) ? statusCfg.dot
    : item.status === 'ready_for_production' ? TOM.info.text
    : T.border;

  // Cartão do histórico: abre o detalhe de aprovações. Era um <div> com
  // onClick, então por teclado o histórico inteiro ficava sem como ser aberto.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Ver histórico de aprovações de ${item.displayId}`}
      onClick={() => setHistDetailItem({ ...item, _ev: ev })}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setHistDetailItem({ ...item, _ev: ev });
        }
      }}
      style={{
        backgroundColor: T.surface,
        // A régua entre linhas some na última: a borda da
        // superfície já fecha embaixo.
        borderBottom: comRegua
          ? `1px solid ${N.n3}` : undefined,
        display: 'flex', cursor: 'pointer',
        // Herdado por toda a linha: a trilha de datas, o
        // contador 2/2 e o codigo da peca. Uma declaracao no
        // pai em vez de seis espalhadas — e a setima nao
        // aparece sem ela.
        fontVariantNumeric: 'tabular-nums',
        transition: 'background-color 0.12s',
      }}
      onMouseEnter={e => (e.currentTarget.style.backgroundColor = T.bg)}
      onMouseLeave={e => (e.currentTarget.style.backgroundColor = T.surface)}
    >
      {/* Trilho do estado — 3px, o mesmo vocabulário do card do
          quadro da Gestão de Prazos e do card da peça aqui em
          cima. Sem moldura em volta, ele é o único sinal de
          estado da linha, e é onde o olho cai ao varrer. */}
      <div style={{ width: 3, background: accentColor, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* ── Cabeçalho — empilha no mobile para não estourar a largura ── */}
        <div style={{ display: 'flex', flexDirection: cards ? 'column' : 'row', alignItems: cards ? 'stretch' : 'center', gap: 12, padding: '14px 16px 12px' }}>
          {/* Thumb */}
          <div style={{
            width: 44, height: 44, borderRadius: 8, overflow: 'hidden',
            background: N.n2, flexShrink: 0,
            border: `1px solid ${T.border}`,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative',
          }}>
            {(item.approvalThumbUrl || item.finalPreviewUrl)
              ? <>
                  <img
                    src={miniatura(item.approvalThumbUrl || item.finalPreviewUrl)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={aoFalharMiniatura}
                  />
                  <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', background: N.n2 }}>
                    <FileText style={{ width: 16, height: 16, color: T.bdark }} />
                  </div>
                </>
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText style={{ width: 16, height: 16, color: T.bdark }} />
                </div>}
          </div>

          {/* Identidade */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{item.type}</span>
              <span style={{ fontSize: 11, color: T.second, fontWeight: 500 }}>{item.displayId}</span>
              <SeloKit peca={item} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: T.second, fontWeight: 500 }}>{ev?.name || '—'}</span>
              {/* `title` com o significado: o selo traz só o rótulo, e
                  no histórico a pergunta é o que quer dizer a peça
                  estar ali e quem age agora. */}
              <span title={descricaoDoStatus(item.status) ?? undefined} style={{
                fontSize: 11, fontWeight: 700,
                backgroundColor: statusCfg.bg, color: statusCfg.text, border: `1px solid ${statusCfg.border}`,
                padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5,
              }}>{cards ? getStatusShort(item.status) : getStatusLabel(item.status)}</span>
              <DetalheProducao item={item} style={{ marginTop: 0 }} />
              {/* ARQUIVO CORRIGIDO. O estado "nova versão" é o único
                  em que a bola está com o ATENDIMENTO: a Arte já
                  refez e o arquivo está parado esperando ser
                  reenviado ao patrocinador. Vinha escrito só dentro
                  da linha de cada patrocinador, e do lado de fora o
                  cartão era idêntico ao de uma peça que nunca tinha
                  saído — foi assim que a #1527 ficou semanas parada.
                  Vem em ÂMBAR e não em vermelho: não é alarme, é
                  trabalho pronto para sair.
                  #92400e sobre #fffbeb = 7,4:1 ✓ nos 11px. */}
              {situacaoDaPeca(itemApprovalsMap[item.id]) === 'nova_versao' && (
                <span
                  data-testid={`selo-nova-versao-${item.id}`}
                  title={SITUACAO_META.nova_versao.hint}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, fontWeight: 700,
                    backgroundColor: TOM.alerta.bg, color: TOM.alerta.text, border: `1px solid ${TOM.alerta.border}`,
                    padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap', lineHeight: 1.5,
                  }}
                >
                  <RotateCcw aria-hidden="true" style={{ width: 11, height: 11 }} />
                  Arte corrigida · aprovar
                </span>
              )}
            </div>
          </div>

          {/* Resumo + detalhes — empilha no mobile */}
          <div style={{ display: 'flex', flexDirection: cards ? 'column' : 'row', alignItems: cards ? 'flex-start' : 'center', gap: 10, flexShrink: 0 }}>
            {/* Afordância REAL (decisão do item 24 do backlog): parecia
                botão mas era um <div> decorativo — agora é um <button>
                com a mesma ação do card, utilizável também por teclado
                sem depender do card inteiro como alvo. */}
            <button
              onClick={e => { e.stopPropagation(); setHistDetailItem({ ...item, _ev: ev }); }}
              data-testid={`button-hist-details-${item.id}`}
              // 32px de alvo (44 no celular): com padding de 4px o
              // botão tinha ~22 — o menor controle da aba, e é a
              // única porta do cartão que não depende do card todo.
              style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: alvo(32, dedo), padding: '0 12px', borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, cursor: 'pointer' }}
            >
              <Eye aria-hidden="true" style={{ width: 12, height: 12, color: T.apoio }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: T.strong, whiteSpace: 'nowrap' }}>Ver detalhes</span>
            </button>
            {sponsorApprovals.length > 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                background: allApproved ? TOM.sucesso.bg : T.bg,
                border: `1px solid ${allApproved ? TOM.sucesso.border : T.border}`,
                borderRadius: 8, padding: '4px 10px', minWidth: 48,
              }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: allApproved ? TOM.sucesso.text : T.strong, lineHeight: 1 }}>
                  {approvedOnes.length} <span style={{ fontSize: 11, fontWeight: 500 }}>de</span> {sponsorApprovals.length}
                </span>
                <span style={{ fontSize: 11, color: allApproved ? TOM.sucesso.text : T.apoio, fontWeight: 700, marginTop: 2 }}>
                  {allApproved ? 'todos' : 'aprovaram'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── A JORNADA, UMA VEZ SÓ ───────────────────────────────────────
            Eram duas faixas: a trilha de marcos (datas) e o pipeline de 10
            etapas (posição), contando a mesma história em desenhos
            diferentes. Agora é uma: onde a peça está, quando passou por
            cada ponto, e quanto tempo levou entre eles — que é a pergunta
            de uma tela de auditoria. */}
        {(() => {
          const j = jornadaDaPeca(item, hoje instanceof Date ? hoje.getTime() : Number(hoje));
          if (j.atual < 0) return null;
          return (
            <div data-testid={`faixa-jornada-${item.id}`} style={{ borderTop: `1px solid ${N.n2}`, padding: '10px 16px 12px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div className="pipeline-scroll" style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: cards ? 620 : 0 }}>
                  {j.etapas.map((e, i) => (
                    <Fragment key={e.key}>
                      {i > 0 && (
                        <span style={{ flex: 1, minWidth: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 3 }}>
                          <span style={{ display: 'block', width: '100%', height: 2, borderRadius: 999, background: e.cumprida || e.ehAtual || e.pulada ? T.accentText : T.border }} />
                          {/* O TEMPO DO TRECHO. "Criado 04/08 → Todos aprovaram
                              13/08" obrigava a contar nove dias de cabeça. */}
                          {e.desdeAnterior !== null && (
                            <span style={{ marginTop: 3, fontSize: 10, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tomDoIntervalo(e.desdeAnterior), whiteSpace: 'nowrap' }}>
                              +{e.desdeAnterior}d
                            </span>
                          )}
                        </span>
                      )}
                      <span title={e.pulada ? `${e.label} · não se aplica: a peça foi entregue sem tubo` : `${e.label}${e.ms ? ` · ${fmtDt(new Date(e.ms))}` : ' · sem carimbo de data'}${descricaoDoStatus(e.statusDaEtapa) ? `\n${descricaoDoStatus(e.statusDaEtapa)}` : ''}`}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, maxWidth: 78 }}>
                        <span aria-hidden="true" style={{
                          width: e.ehAtual ? 11 : 8, height: e.ehAtual ? 11 : 8, borderRadius: '50%', flexShrink: 0,
                          background: e.cumprida || e.ehAtual ? T.accentText : T.border,
                          // Embalado que NÃO SE APLICA (entregue sem tubo): oco e tracejado.
                          ...(e.pulada ? { background: T.surface, border: `1.5px dashed ${T.bdark}`, boxSizing: 'border-box' as const } : null),
                          boxShadow: e.ehAtual ? '0 0 0 3px rgba(251,146,60,0.25)' : 'none',
                        }} />
                        {(e.ehAtual || e.ms) && (
                          <span style={{ fontSize: 10, fontWeight: e.ehAtual ? 800 : 600, color: e.ehAtual ? T.accentText : T.apoio, lineHeight: 1.2, textAlign: 'center', whiteSpace: 'nowrap' }}>
                            {e.label}
                          </span>
                        )}
                        {e.ms && (
                          <span style={{ fontSize: 10, color: T.second, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
                            {fmtDt(new Date(e.ms), true)}
                          </span>
                        )}
                      </span>
                    </Fragment>
                  ))}
                </div>
              </div>

              {/* O NÚMERO ACIONÁVEL: quanto tempo a peça está parada aqui
                  (em curso) ou quanto a jornada inteira levou (concluída). */}
              {j.duracao !== null && (
                <span data-testid={`text-duracao-${item.id}`}
                  title={j.concluida ? 'Da solicitação ao último carimbo' : 'Tempo desde o último carimbo desta peça'}
                  style={{ flexShrink: 0, textAlign: 'right', lineHeight: 1.25 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: j.concluida ? T.apoio : tomDoIntervalo(j.duracao) }}>
                    {j.duracao}d
                  </span>
                  <span style={{ display: 'block', fontSize: 10, color: T.second, whiteSpace: 'nowrap' }}>
                    {j.concluida ? 'no total' : 'nesta etapa'}
                  </span>
                </span>
              )}
            </div>
          );
        })()}

        {/* ── Chips de patrocinadores ── */}
        {sortedApprovals.length > 0 && (
          <div style={{
            borderTop: `1px solid ${N.n2}`,
            padding: '8px 16px 12px',
            display: 'flex', flexWrap: 'wrap', gap: 4,
          }}>
            {sortedApprovals.map(({ sponsor, appr }) => {
              const v = approvalVisual(appr?.status);
              return (
                <div key={sponsor.id}
                  title={v.isApproved && appr?.approvedBy ? `${appr.approvedBy} · ${fmtDt(appr.approvedAt) ?? ''}` : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    height: 26, padding: '0 9px 0 7px',
                    borderRadius: 12, background: v.bg, border: `1px solid ${v.border}`,
                    flexShrink: 0, cursor: 'default',
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: v.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: v.text, whiteSpace: 'nowrap', lineHeight: 1 }}>
                    {sponsor.name}
                  </span>
                  {v.isApproved && appr?.approvedAt && (
                    <span style={{ fontSize: 11, color: TOM.sucesso.text, fontWeight: 500, whiteSpace: 'nowrap', lineHeight: 1 }}>
                      {fmtDt(appr.approvedAt, true)}
                    </span>
                  )}
                  {!v.isApproved && !v.isRejected && !v.isNewVersion && !v.isAwaitingArte && (
                    <span style={{ fontSize: 11, color: T.apoio, fontWeight: 600, lineHeight: 1, textTransform: 'uppercase', letterSpacing: '0.03em' }}>Ag.</span>
                  )}
                  {(v.isRejected || v.isAwaitingArte) && <span style={{ fontSize: 11, color: TOM.perigo.text, fontWeight: 700, lineHeight: 1 }}>✕</span>}
                  {v.isNewVersion && <span style={{ fontSize: 11, color: TOM.alerta.text, fontWeight: 700, lineHeight: 1 }}>↻</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
