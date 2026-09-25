import { Clock, Eye, FileImage, FileText, Send } from "lucide-react";
import { Link } from "wouter";
import { SeloKit } from "@/components/kit/selo-kit";
import { TextoComLinks } from "@/components/texto-com-links";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { phaseDeadline } from "@/lib/arte-rules";
import { miniatura } from "@/lib/miniatura";
import { toUTCDisplayDate } from "@/lib/utils";
import { T, TOM, N, R, FS, FONT } from "@/lib/theme";
import { fsToque } from "./constantes";
import type { PecaDaCorrecao } from "./tipos";

/** Um cartão da aba Correção: o que foi recusado, por quem, e a saída. */
export function CartaoDaCorrecao({ item, correcaoSponsorFilter, emCartoes, hoje, groupOf, podeEditar, abrirCorrecao }: {
  item: PecaDaCorrecao;
  correcaoSponsorFilter: string;
  emCartoes: boolean;
  hoje: Date;
  groupOf: (type: string) => string;
  podeEditar: boolean;
  abrirCorrecao: (item: PecaDaCorrecao) => void;
}) {
  const approvalsToShow = correcaoSponsorFilter === "all"
    ? item.awaitingArteApprovals
    : item.awaitingArteApprovals.filter((a) => a.sponsorId === correcaoSponsorFilter);
  const isImage = item.approvalThumbUrl && (/\.(png|jpg|jpeg|gif|webp)/i.test(item.approvalThumbUrl) || item.approvalThumbUrl.startsWith('/objects/'));
  const groupLabel = groupOf(item.type);
  return (
    <div
      data-testid={`card-correcao-${item.id}`}
      style={{
        backgroundColor: T.surface,
        // Borda neutra e SEM sombra: a sombra era vermelha e dupla
        // (16px difusos + um anel de 1px), e numa grade de cards
        // todos vermelhos ela não distinguia nenhum deles.
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Cabeçalho: faixa branca com hairline ──

          Era uma faixa quase preta com gradiente diagonal MAIS um
          brilho radial vermelho por cima — dois gradientes empilhados
          para hospedar quatro pedaços de texto. Todo o conteúdo vinha
          em branco ou vermelho translúcido: `rgba(252,165,165,0.6)`
          no grupo e `rgba(255,255,255,0.2)` no chevron, que é como se
          apaga texto sem admitir que ele ficou ilegível. */}
      {/* O selo "RECUSADO" em versalete vermelho saiu do começo da
          faixa: TODO card desta aba é uma recusa (o título da aba já
          diz), então ele não distinguia um card do outro — só
          empurrava o nome da peça para a direita. Quem recusou e o
          motivo continuam no corpo, que é o que se vem ler. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '12px 16px', borderBottom: `1px solid ${N.n3}`, flexWrap: emCartoes ? 'wrap' : 'nowrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* QUEM ENCOLHE PRIMEIRO — a ordem estava invertida.

              O GRUPO era o único com `flexShrink: 0`, ou seja, o único
              protegido; o TIPO e a descrição encolhiam juntos. Numa
              linha apertada o resultado era

                "PLACAS DIVERSAS › P… — Cheque Premiação R…"

              com o nome da peça reduzido a uma letra enquanto o rótulo
              do grupo aparecia inteiro. O tipo é o que a pessoa
              procura; o grupo é contexto e a descrição é detalhe.

              A ordem vira peso de encolhimento: descrição cede
              primeiro (999), grupo cede depois (1) e dentro de um
              teto, tipo não cede (0). Todos mantêm o `title`.

              E NENHUM DOS DOIS VIRA RETICÊNCIA NUMA LINHA SÓ: o nome
              da peça e a descrição quebram em até duas linhas (o
              texto inteiro no `title` não existe para quem toca). O
              grupo, rótulo curto de contexto, sobe para cima. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            {groupLabel && <span title={groupLabel} style={{ fontSize: fsToque(FS.small, emCartoes), color: T.second, fontWeight: 600, minWidth: 0, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupLabel}</span>}
            <span title={item.type} style={{ fontSize: FS.body, fontWeight: 700, color: T.text, letterSpacing: '-0.02em', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere', fontFamily: FONT.display }}>{item.type}</span>
            {item.description && item.description !== item.type && (
              <span title={item.description} style={{ fontSize: FS.meta, color: T.apoio, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', overflowWrap: 'anywhere' }}>{item.description}</span>
            )}
          </div>
        </div>
        <span style={{ fontFamily: FONT.display, fontSize: fsToque(FS.small, emCartoes), fontWeight: 800, color: T.apoio, background: T.bg, border: `1px solid ${T.border}`, borderRadius: R.sm, padding: '3px 7px', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{item.displayId}</span>
        <SeloKit peca={item} style={{ flexShrink: 0 }} />
      </div>

      {/* ── Contexto: de qual evento é a peça, e quando ela sai ──

          O card dizia o que foi recusado e por quem, e não dizia de
          qual evento é nem quando sai — que é justamente o que decide
          a ORDEM do trabalho numa fila de correções. O prazo vem do
          mesmo `phaseDeadline` da coluna Prazo e do filtro
          "atrasados"; nada de conta nova. */}
      {(() => {
        const pr = phaseDeadline(item.event, "correcao", hoje);
        const saida = item.event?.truckDepartureDate ? toUTCDisplayDate(item.event.truckDepartureDate) : null;
        const urgente = pr != null && pr.diff <= 3;
        if (!item.event?.name && !saida && !pr) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: `1px solid ${N.n3}`, background: T.bg }}>
            {item.event?.name && (
              <span title={item.event.name} style={{ fontSize: fsToque(11, emCartoes), fontWeight: 600, color: T.apoio, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.event.name}</span>
            )}
            {item.event?.name && saida && <span aria-hidden="true" style={{ width: 1, height: 11, background: T.border, flexShrink: 0 }} />}
            {saida && (
              <span style={{ fontSize: fsToque(11, emCartoes), fontWeight: 600, color: T.apoio, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {String(saida.getDate()).padStart(2, '0')}/{String(saida.getMonth() + 1).padStart(2, '0')}
              </span>
            )}
            <span style={{ flex: 1 }} />
            {pr && (() => {
              const texto = pr.diff < 0
                ? `${Math.abs(pr.diff)}d atrasado`
                : pr.diff === 0 ? 'vence hoje' : `${pr.diff}d`;
              // Selo só quando aperta (≤3d): folga é texto, não cor.
              return urgente
                ? <Selo tom="alerta" style={{ flexShrink: 0, padding: '2px 8px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontSize: fsToque(11, emCartoes) }}>{texto}</Selo>
                : <span style={{ fontSize: fsToque(FS.small, emCartoes), fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: T.second, padding: '2px 8px' }}>{texto}</span>;
            })()}
          </div>
        );
      })()}

      {/* ── Body ── */}
      {/* `flex: 1` no corpo (e nos blocos de motivo abaixo): sem ele,
          cards de alturas diferentes na mesma linha da grade ficavam
          com uma faixa branca antes do rodapé, e os rodapés não se
          alinhavam. A sobra passa a ser absorvida pelo conteúdo. */}
      <div style={{ flex: 1, padding: '16px 18px', display: 'flex', flexDirection: emCartoes ? 'column' : 'row', gap: emCartoes ? 12 : 14 }}>
        {/* Thumb */}
        <div style={{ width: emCartoes ? '100%' : 80, height: emCartoes ? 120 : 80, borderRadius: R.md, backgroundColor: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {isImage ? (
            <img loading="lazy" decoding="async" src={miniatura(item.approvalThumbUrl)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : item.approvalThumbUrl ? (
            <a href={item.approvalThumbUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, textDecoration: 'none', color: TOM.perigo.text }}>
              <FileText style={{ width: 22, height: 22 }} />
              <span style={{ fontSize: fsToque(11, emCartoes), fontWeight: 600 }}>PDF</span>
            </a>
          ) : (
            <FileImage style={{ width: 22, height: 22, color: TOM.perigo.border }} />
          )}
        </div>

        {/* Rejection reasons */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Peça devolvida SEM patrocinador identificado: veio pelo
              antigo "Reprovar Ativo" (removido em 17/08), que baixava
              a peça inteira sem marcar quem pediu a mudança. Sem este
              bloco o cartão apareceria mudo — na fila de correção e
              sem uma linha dizendo por quê.
              Diz o que se sabe e para onde ir buscar o resto, em vez
              de inventar um patrocinador para preencher a coluna. */}
          {approvalsToShow.length === 0 && (
            <div
              data-testid={`correcao-sem-patrocinador-${item.id}`}
              style={{ flex: 1, borderRadius: 12, border: `1px solid ${TOM.perigo.border}`, background: TOM.perigo.bg, padding: '10px 12px' }}
            >
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: TOM.perigo.text }}>
                Reprovada por um patrocinador
              </p>
              <p style={{ margin: '3px 0 0', fontSize: fsToque(11, emCartoes), color: TOM.perigo.text, lineHeight: 1.45 }}>
                Devolvida sem patrocinador nem motivo informados. Veja quem devolveu e quando no Histórico da peça.
              </p>
              <Link
                href={`/historico?busca=${item.displayId?.replace('#','')}`}
                style={{ display: 'inline-block', marginTop: 6, fontSize: fsToque(11, emCartoes), fontWeight: 700, color: TOM.perigo.text, textDecoration: 'underline', textUnderlineOffset: 2 }}
              >
                Ver no Histórico →
              </Link>
            </div>
          )}
          {approvalsToShow.map((approval) => (
            <div key={approval.id} style={{ flex: 1, borderRadius: 12, overflow: 'hidden', border: `1px solid ${TOM.perigo.border}` }}>
              {/* Sponsor bar */}
              <div style={{ background: TOM.perigo.bg, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: approval.rejectionReason ? `1px solid ${TOM.perigo.border}` : 'none' }}>
                {approval.sponsor?.color && <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: approval.sponsor.color, flexShrink: 0 }} />}
                <span style={{ fontSize: 12, fontWeight: 700, color: TOM.perigo.text, flex: 1 }}>{approval.sponsor?.name || 'Patrocinador'}</span>
                {/* Log: quem + quando */}
                {(approval.rejectedBy || approval.rejectedAt) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 3, minWidth: 0 }}>
                    {approval.rejectedBy && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0, fontSize: fsToque(11, emCartoes), fontWeight: 600, color: T.apoio, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={approval.rejectedBy}>
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                        {/* Nome INTEIRO. O `split(' ')[0]` cortava no
                            primeiro nome — numa empresa com dois
                            "Felipe" isso não identifica ninguém, e a
                            reticência já resolvia o espaço. */}
                        {approval.rejectedBy}
                      </span>
                    )}
                    {approval.rejectedBy && approval.rejectedAt && <span aria-hidden="true" style={{ color: T.bdark, fontSize: fsToque(11, emCartoes) }}>·</span>}
                    {approval.rejectedAt && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: fsToque(11, emCartoes), fontWeight: 600, color: T.apoio, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        <Clock style={{ width: 9, height: 9, flexShrink: 0 }} />
                        {(() => { const d = new Date(approval.rejectedAt); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {/* Reason */}
              {approval.rejectionReason && (
                <div style={{ background: T.surface, padding: '8px 12px' }}>
                  {/* Sem itálico: as aspas já marcam a citação, e
                      itálico em 12px pesa a leitura do texto que a
                      pessoa veio ler. */}
                  <p style={{ fontSize: 12, color: T.strong, margin: 0, lineHeight: 1.5 }}>"<TextoComLinks texto={approval.rejectionReason} />"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '12px 18px', borderTop: `1px solid ${N.n3}`, display: 'flex', alignItems: 'center', gap: 10, background: T.bg, flexWrap: 'wrap' }}>
        {/* TINTA (primário do DS), não vermelho: vermelho é a cor do
            PROBLEMA (a recusa); a ação que resolve não veste a cor
            do problema. 44px: o card se repete na grade e é tocado. */}
        {podeEditar && (
          <Botao
            variante="primario"
            tamanho="toque"
            icone={Send}
            onClick={() => abrirCorrecao(item)}
            data-testid={`button-open-correcao-${item.id}`}
            style={{ flex: 1, minWidth: 180, fontSize: FS.body }}
          >
            Enviar nova arte
          </Botao>
        )}
        {item.approvalThumbUrl && (
          <a
            href={item.approvalThumbUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 12, fontWeight: 700, color: T.strong,
              textDecoration: 'none', transition: 'color 0.15s',
              padding: '0 14px', minHeight: 44, height: 44, borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface,
              whiteSpace: 'nowrap',
            }}
            // O mouseleave devolvia OUTRA cor e OUTRA borda que as do
            // estado inicial: depois do primeiro hover o botão ficava
            // diferente dos vizinhos que ninguém tinha tocado.
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.bdark; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border; }}
          >
            <Eye aria-hidden="true" style={{ width: 12, height: 12 }} />
            Ver versão
          </a>
        )}
      </div>
    </div>
  );
}
