// ─────────────────────────────────────────────────────────────────────────────
// A PEÇA na fila de Pendentes: identidade, situação e a ação — uma LINHA da
// folha do evento (ver grupo-do-evento).
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import { Eye, ImageIcon, RotateCcw } from "lucide-react";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { SeloKit } from "@/components/kit/selo-kit";
import { SponsorChips } from "@/components/sponsor-chips";
import { fmtRelative } from "@/components/prazos/tokens";
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import { miniatura } from "@/lib/miniatura";
import { Botao } from "@/components/ui/botao";
import { FS, FW, R, T, N, TOM, FONT } from "@/lib/theme";
import { statusDeExibicao } from "@shared/molde";
import { hrefSeguro } from "@shared/url-segura";
import { SITUACAO_META, aoFalharMiniatura, fraseDeQuemFalta, situacaoDaPeca, type PatrocinadorComStatus } from "./regras";
import { codigoDaPeca, letra } from "./estilos";
import type { PecaAtendimento, SponsorApproval, TamanhoDoBotao } from "./tipos";

export interface PropsDoCartao {
  item: PecaAtendimento;
  /** A peça anterior do grupo: decide se o rótulo de grupo/tipo aparece. */
  prevItem: PecaAtendimento | null;
  itemApprovalsMap: Record<string, SponsorApproval[]>;
  typeToGroup: Record<string, string>;
  isItemFullyApproved: (item: { id: string }) => boolean;
  sponsorsWithStatus: (item: { id: string }) => PatrocinadorComStatus[];
  quemFalta: (item: { id: string }) => string[];
  handleViewDetails: (item: PecaAtendimento) => void;
  loadingSponsors: boolean;
  cards: boolean;
  tamBotao: TamanhoDoBotao;
  agora: number;
  /** Ponteiro de dedo ou celular: piso de 12px nas letras. */
  toque?: boolean;
}

export function CartaoDaPeca({
  item, prevItem, itemApprovalsMap, typeToGroup, isItemFullyApproved, sponsorsWithStatus, quemFalta,
  handleViewDetails, loadingSponsors, cards, tamBotao, agora, toque = false,
}: PropsDoCartao) {
  const approvals: SponsorApproval[] = itemApprovalsMap[item.id] || [];
  const isFullyApproved = isItemFullyApproved(item);
  const hasArteBlock = approvals.some(a => a.status === 'awaiting_arte');
  // A Arte JÁ devolveu e o arquivo espera reenvio — o oposto
  // de `hasArteBlock`, e o único estado em que a bola é daqui.
  const temNovaVersao = approvals.some(a => a.status === 'new_version_pending');
  const hasThumb = !!item.approvalThumbUrl;
  const showTypeHeader = !prevItem || prevItem.type !== item.type;
  const itemGroupName = typeToGroup[item.type] || '';
  const prevItemGroupName = prevItem ? (typeToGroup[prevItem.type] || '') : '';
  const showGroupHeader = showTypeHeader && itemGroupName !== '' && itemGroupName !== prevItemGroupName;
  // O TRILHO da linha, na cor da SITUAÇÃO: o mesmo vocabulário do cartão da
  // Gestão de Prazos e da linha do Histórico.
  const trilho = isFullyApproved ? T.bdark : hasArteBlock ? T.muted : temNovaVersao ? TOM.alerta.dot : T.accent;
  const tamMiniatura = cards ? 52 : 60;

  return (
    <Fragment>
      {/* GRUPO e TIPO num rótulo só — uma faixa fina da folha, não duas
          réguas empilhadas. `showGroupHeader` implica `showTypeHeader`. */}
      {showTypeHeader && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: cards ? '7px 14px' : '7px 18px',
          backgroundColor: T.bg,
          borderTop: prevItem ? `1px solid ${N.n3}` : undefined,
          borderBottom: `1px solid ${N.n3}`,
        }}>
          <span style={{ fontSize: letra(FS.micro, toque), fontWeight: FW.rotulo, color: T.second, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {[itemGroupName, item.type].filter(Boolean).join(" · ")}
          </span>
        </div>
      )}
    {/* A LINHA. Sem moldura própria (a folha do evento é a moldura): o que a
        distingue da vizinha é a hairline e o TRILHO de 3px na cor da
        situação — desenhado por sombra interna, para não empurrar o
        conteúdo. `opacity` não é usada para "resolvido": quem está
        resolvido perde a COR, não a legibilidade. */}
    <div
      key={`card-${item.id}`}
      data-testid={`row-item-${item.id}`}
      className="atd-linha"
      style={{
        backgroundColor: hasArteBlock ? T.bg : T.surface,
        borderTop: showTypeHeader ? undefined : `1px solid ${N.n3}`,
        boxShadow: `inset 3px 0 0 ${trilho}`,
      }}
    >
      {/* NO CELULAR a linha é uma GRADE: miniatura e identidade lado a lado
          em cima; patrocinadores, situação e ação em largura cheia embaixo.
          Antes tudo vinha recuado ao lado da miniatura, num corredor de
          ~270px onde cada patrocinador ocupava uma linha. */}
      <div style={cards ? {
        display: 'grid', gridTemplateColumns: `${tamMiniatura}px minmax(0,1fr)`,
        gridTemplateAreas: '"mini id" "chips chips" "sit sit" "acao acao"',
        columnGap: 12, rowGap: 12, alignItems: 'start', padding: '14px 14px 14px 17px',
      } : { display: 'flex', alignItems: 'center', padding: '14px 18px 14px 21px', gap: 18 }}>

        {/* A miniatura ABRE a revisão (o olho no hover promete o clique). O
            botão "Revisar" continua sendo a porta por teclado — por isso
            aria-hidden aqui: não é um segundo alvo de Tab para a mesma ação. */}
        <div
          aria-hidden="true"
          onClick={() => handleViewDetails(item)}
          className={hasThumb ? 'atd-miniatura' : undefined}
          style={{
          gridArea: cards ? 'mini' : undefined,
          width: tamMiniatura, height: tamMiniatura, flexShrink: 0, borderRadius: R.md + 2,
          overflow: 'hidden', backgroundColor: N.n2, position: 'relative',
          border: `1px solid ${T.border}`, cursor: 'pointer',
        }}>
          {hasThumb ? (
            <>
              <img
                src={miniatura(item.approvalThumbUrl)}
                alt=""
                loading="lazy"
                decoding="async"
                style={{
                  width: '100%', height: '100%', objectFit: 'cover',
                  filter: isFullyApproved ? 'grayscale(1)' : 'grayscale(0)',
                }}
                onError={aoFalharMiniatura}
              />
              <div data-fallback="1" style={{ display: 'none', position: 'absolute', inset: 0, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, background: N.n2 }}>
                <ImageIcon aria-hidden="true" style={{ width: 18, height: 18, color: T.muted }} />
                <span style={{ fontSize: letra(9, toque), fontWeight: FW.forte, letterSpacing: '0.06em', color: T.second }}>SEM ARTE</span>
              </div>
              {!isFullyApproved && (
                <div className="atd-olho" style={{
                  position: 'absolute', inset: 0,
                  backgroundColor: 'rgba(28,25,23,0.38)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Eye style={{ width: 18, height: 18, color: T.surface }} />
                </div>
              )}
            </>
          ) : (
            // O vazio diz que a arte não existe — não é imagem que falhou.
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <ImageIcon aria-hidden="true" style={{ width: 18, height: 18, color: T.muted }} />
              <span style={{ fontSize: letra(9, toque), fontWeight: FW.forte, letterSpacing: '0.06em', color: T.second }}>SEM ARTE</span>
            </div>
          )}
        </div>

        <div style={cards ? { display: 'contents' } : {
          flex: '1 1 0%', display: 'grid', minWidth: 0,
          gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.4fr) auto',
          gridTemplateAreas: '"id sit acao" "chips sit acao"',
          columnGap: 20, rowGap: 8, alignItems: 'center',
        }}>

          {/* IDENTIDADE em três linhas: o que é, o que diz o pedido, e quem
              tem de aprovar. */}
          <div style={{ gridArea: 'id', minWidth: 0, alignSelf: cards ? 'center' : 'end' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', columnGap: 8, rowGap: 4, flexWrap: 'wrap' }}>
              <span style={codigoDaPeca(toque)}>
                {item.displayId}
              </span>
              <SeloKit peca={item} style={{ flexShrink: 0, alignSelf: 'center' }} />
              <h3 title={item.type} style={{ fontSize: letra(FS.read, toque), fontWeight: FW.forte, color: T.text, margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.005em' }}>
                {item.type}
              </h3>
              {item.isReuse && (
                <span title="Peça de reaproveitamento" style={{ fontSize: letra(FS.small, toque), fontWeight: FW.medio, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text, borderRadius: R.pill, padding: '1px 8px', flexShrink: 0, alignSelf: 'center' }}>
                  Reaproveitamento
                </span>
              )}
              {/* ONDE A PEÇA ESTÁ. É ele que diz se a decisão que falta ainda
                  cabe no prazo ou se a peça já seguiu sem ela. */}
              {(() => {
                const meta = getStatusMeta(statusDeExibicao(item));
                if (!meta) return null;
                return (
                  <span data-testid={`selo-status-${item.id}`} title={`A peça está em "${meta.label}" — é daqui que ela sai quando a decisão que falta chegar${descricaoDoStatus(item.status) ? `\n${descricaoDoStatus(item.status)}` : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, alignSelf: 'center', fontSize: letra(FS.small, toque), fontWeight: FW.medio, color: meta.text, backgroundColor: meta.bg, border: `1px solid ${meta.border}`, borderRadius: R.sm - 2, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: meta.dot, flexShrink: 0 }} />
                    {meta.short}
                  </span>
                );
              })()}
              {/* IDADE NA FASE (UX 27/08): a MESMA régua 7/14 da Arte e da
                  Gráfica — quem cobra patrocinador precisa ver há quanto
                  tempo a decisão espera. */}
              {(() => {
                const d = diasNaFase(item, new Date());
                if (d === null || d < 1) return null;
                const tom = tomDaIdade(d);
                return <span title={`Está neste status há ${d} dia(s)`} style={{ flexShrink: 0, fontSize: letra(10.5, toque), fontFamily: FONT.mono, fontWeight: tom.peso, color: tom.cor }}>há {d}d</span>;
              })()}
            </div>
            <p title={item.description || undefined} style={{ fontSize: letra(FS.meta, toque), color: T.second, margin: '4px 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.description || 'Sem descrição'}
              {item.quantity != null && (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{' · '}{item.quantity} un.</span>
              )}
              {item.referenceUrl && (
                // Link INLINE: não é status, não pode ter cara de selo.
                <>
                  {' · '}
                  <a
                    href={hrefSeguro(item.referenceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Ver referência visual do solicitante"
                    data-testid={`link-reference-atendimento-${item.id}`}
                    style={{ color: T.accentText, fontWeight: FW.medio, textDecoration: 'underline', textUnderlineOffset: 2 }}
                  >
                    ref. visual
                  </a>
                </>
              )}
            </p>
          </div>
          <div style={{ gridArea: 'chips', minWidth: 0, overflow: 'hidden', alignSelf: 'start' }}>
              {loadingSponsors ? (
                <span style={{ fontSize: letra(FS.meta, toque), color: T.second }}>carregando patrocinadores…</span>
              ) : (
                <SponsorChips sponsors={sponsorsWithStatus(item)} variant="colored" size={toque ? "md" : "sm"} max={2} />
              )}
          </div>

          {/* SITUAÇÃO em duas linhas: o rótulo e o RELÓGIO.

              A idade vem de `approvalThumbUpdatedAt`, que o schema define
              como "quando o thumb foi trocado pela Arte": no primeiro envio é
              quando a peça ficou disponível para o patrocinador; num reenvio
              é quando a Arte devolveu corrigida. */}
          <div style={{ gridArea: 'sit', minWidth: 0 }}>
            {(() => {
              const sit = situacaoDaPeca(approvals);
              const tom = isFullyApproved ? T.apoio
                : sit === "nova_versao" ? TOM.alerta.text
                : sit === "aguardando_arte" ? T.apoio
                : sit === "reprovado" ? TOM.perigo.text
                : T.accentText;
              const desde = item.approvalThumbUpdatedAt
                ? fmtRelative(new Date(item.approvalThumbUpdatedAt).toISOString(), agora)
                : null;
              const responderam = approvals.filter(a => a.status !== "pending").length;
              const quemFaltaAqui = quemFalta(item);
              const relogio = isFullyApproved
                ? "todos os patrocinadores aprovaram"
                : sit === "nova_versao"
                  ? (desde ? `a Arte corrigiu ${desde} — a peça espera sua decisão` : "a Arte corrigiu — a peça espera sua decisão")
                : sit === "aguardando_arte"
                  // Comunicado afinado (dono, 31/08): "nada a fazer"
                  // era mentira quando OUTROS patrocinadores ainda
                  // podiam ser decididos — só quem reprovou espera.
                  ? (quemFaltaAqui.length > 0
                      ? `quem reprovou espera a nova arte — ${fraseDeQuemFalta(quemFaltaAqui)} e pode(m) ser decidido(s) agora`
                      : "quem reprovou espera a nova arte — você é avisado quando ela chegar")
                : `${desde ? `enviada ${desde} · ` : ""}${quemFaltaAqui.length > 0 ? fraseDeQuemFalta(quemFaltaAqui) : `${responderam} de ${approvals.length} responderam`}`;
              return (
                <>
                  <span
                    data-testid={`situacao-${item.id}`}
                    style={{ display: "flex", alignItems: "center", gap: 6, fontSize: letra(FS.meta + 0.5, toque), fontWeight: FW.forte, color: tom, lineHeight: 1.3 }}
                  >
                    {/* VERSÃO NOVA tem ícone: é o estado que chega em lote
                        (a Arte devolve eventos inteiros) e o único em que a
                        bola é sua — o olho precisa achá-lo descendo a lista
                        sem ler cada rótulo. */}
                    {!isFullyApproved && sit === "nova_versao" && <RotateCcw aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />}
                    {isFullyApproved ? "Aprovado" : SITUACAO_META[sit].label}
                  </span>
                  <span style={{ display: "block", marginTop: 4, fontSize: letra(FS.meta, toque), color: T.second, lineHeight: 1.45 }}>
                    {relogio}
                  </span>
                </>
              );
            })()}
          </div>

          {/* A AÇÃO. Tinta sólida SÓ quando a bola é sua — a peça que espera
              você e a que não depende de você não convidam com a mesma força. */}
          <div style={{ gridArea: 'acao', display: 'flex', justifyContent: cards ? 'stretch' : 'flex-end' }}>
            {(() => {
              const primaria = temNovaVersao && !isFullyApproved;
              // Com a Arte também é 'Revisar' (31/08): lá dentro
              // existe ação agora — aprovar mesmo assim a versão antiga.
              const rotulo = isFullyApproved ? "Ver histórico"
                : primaria ? "Revisar agora" : "Revisar";
              return (
                <Botao
                  variante={primaria ? "primario" : "secundario"}
                  tamanho={tamBotao}
                  icone={Eye}
                  larguraCheia={cards}
                  onClick={() => handleViewDetails(item)}
                  data-testid={isFullyApproved ? `button-history-${item.id}` : `button-view-${item.id}`}
                  style={{ minWidth: cards ? undefined : 124 }}
                >
                  {rotulo}
                </Botao>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
    </Fragment>
  );
}
