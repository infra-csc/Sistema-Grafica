// ─────────────────────────────────────────────────────────────────────────────
// O CARD DA PEÇA na fila de Pendentes: identidade, situação e a ação.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import { Eye, ImageIcon } from "lucide-react";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { SeloKit } from "@/components/kit/selo-kit";
import { SponsorChips } from "@/components/sponsor-chips";
import { fmtRelative } from "@/components/prazos/tokens";
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import { miniatura } from "@/lib/miniatura";
import { Botao } from "@/components/ui/botao";
import { T, N, TOM, FONT } from "@/lib/theme";
import { statusDeExibicao } from "@shared/molde";
import { hrefSeguro } from "@shared/url-segura";
import { SITUACAO_META, aoFalharMiniatura, fraseDeQuemFalta, situacaoDaPeca, type PatrocinadorComStatus } from "./regras";
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
}

export function CartaoDaPeca({
  item, prevItem, itemApprovalsMap, typeToGroup, isItemFullyApproved, sponsorsWithStatus, quemFalta,
  handleViewDetails, loadingSponsors, cards, tamBotao, agora,
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

  return (
    <Fragment>
      {/* GRUPO e TIPO num rótulo só.

          Eram duas linhas com régua, uma com barrinha laranja
          e outra prefixada por "Tipo:", empilhadas — quatro
          elementos gráficos e 30px de altura para dizer
          "COMUNICAÇÃO VISUAL · BACKDROP". Numa lista de 40
          peças isso se repete dezenas de vezes.

          `showGroupHeader` implica `showTypeHeader`, então a
          condição do tipo cobre as duas. */}
      {showTypeHeader && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0 2px' }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: T.second, textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
            {[itemGroupName, item.type].filter(Boolean).join(" · ")}
          </span>
          <div style={{ flex: 1, height: 1, background: N.n3 }} />
        </div>
      )}
    {/* O CARD.

        Fora: `inset 4px 0 0` fazia o trilho de estado, e a
        sombra dupla no hover redesenhava o trilho junto —
        duas declarações da mesma coisa em três lugares. Aqui
        o card tem borda de 1px e um `borderLeft` de 3px no
        tom da SITUAÇÃO, o mesmo vocabulário do card da
        Gestão de Prazos.

        `opacity: 0.75` saiu dos aprovados: quem está
        resolvido perde a COR, não a legibilidade — o texto
        cinza sobre branco a 75% reprovava contraste. */}
    <div
      key={`card-${item.id}`}
      data-testid={`row-item-${item.id}`}
      className="group"
      style={{
        backgroundColor: hasArteBlock ? T.bg : T.surface,
        borderRadius: 12,
        border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${isFullyApproved ? T.bdark : hasArteBlock ? T.muted : temNovaVersao ? TOM.alerta.text : T.accent}`,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: cards ? 'flex-start' : 'center', padding: cards ? 14 : 18, gap: cards ? 12 : 20, flexWrap: cards ? 'wrap' : 'nowrap' }}>

        {/* Thumb 72 e não 80: o card ganhou uma terceira
            linha de texto e a miniatura passou a ser o
            elemento mais alto dele. */}
        {/* A miniatura ABRE a revisão. Ela já acendia um olho
            no hover — prometia o clique e não o entregava. O
            botão "Revisar" continua sendo a porta por teclado
            (por isso aria-hidden aqui: não é um segundo alvo
            de Tab para a mesma ação). */}
        <div
          aria-hidden="true"
          onClick={() => handleViewDetails(item)}
          style={{
          width: cards ? 52 : 72, height: cards ? 52 : 72, flexShrink: 0, borderRadius: 10,
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
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: T.second }}>SEM ARTE</span>
              </div>
              {!isFullyApproved && (
                <div style={{
                  position: 'absolute', inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.2s',
                }}
                  className="group-hover:opacity-100"
                >
                  <Eye style={{ width: 18, height: 18, color: T.surface }} />
                </div>
              )}
            </>
          ) : (
            // O vazio era um ícone de documento e mais nada:
            // não dava para saber se a arte não existe ou se
            // a imagem falhou ao carregar. Agora ele diz.
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <ImageIcon aria-hidden="true" style={{ width: 18, height: 18, color: T.muted }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: T.second }}>SEM ARTE</span>
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: cards ? '1fr' : 'minmax(0,2fr) minmax(0,1.4fr) auto', gap: cards ? 10 : 18, alignItems: cards ? 'stretch' : 'center', minWidth: 0 }}>

          {/* IDENTIDADE em três linhas: o que é, o que diz o
              pedido, e quem tem de aprovar. Antes o código e
              a descrição dividiam UMA linha de 11px em caixa
              alta — "#3524 • BACKDROP FUNDO PALCO" lido como
              um rótulo só. */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: FONT.mono,
                fontSize: 12, fontWeight: 700, color: T.second,
                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>
                {item.displayId}
              </span>
              <SeloKit peca={item} style={{ flexShrink: 0, alignSelf: 'center' }} />
              <h3 title={item.type} style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.type}
              </h3>
              {item.isReuse && (
                <span title="Peça de reaproveitamento" style={{ fontSize: 11, fontWeight: 600, backgroundColor: TOM.sucesso.bg, color: TOM.sucesso.text, borderRadius: 999, padding: '1px 8px', flexShrink: 0 }}>
                  Reaproveitamento
                </span>
              )}
              {/* ONDE A PEÇA ESTÁ. O tipo já carregava o status e o card não o
                  mostrava: é ele que diz se a decisão que falta ainda cabe no
                  prazo ou se a peça já seguiu sem ela. */}
              {(() => {
                const meta = getStatusMeta(statusDeExibicao(item));
                if (!meta) return null;
                return (
                  // Caixa normal em 11px (era versalete de 10px
                  // com espaçamento): numa lista de dezenas de
                  // cards, era a terceira coisa em maiúsculas
                  // da mesma linha, ao lado do código e do tipo.
                  <span data-testid={`selo-status-${item.id}`} title={`A peça está em "${meta.label}" — é daqui que ela sai quando a decisão que falta chegar${descricaoDoStatus(item.status) ? `\n${descricaoDoStatus(item.status)}` : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11, fontWeight: 600, color: meta.text, backgroundColor: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 4, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                    <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: meta.dot, flexShrink: 0 }} />
                    {meta.short}
                  </span>
                );
              })()}
              {/* IDADE NA FASE (UX 27/08): a MESMA régua 7/14
                  da Arte e da Gráfica — quem cobra patrocinador
                  precisa ver há quanto tempo a decisão espera. */}
              {(() => {
                const d = diasNaFase(item, new Date());
                if (d === null || d < 1) return null;
                const tom = tomDaIdade(d);
                return <span title={`Está neste status há ${d} dia(s)`} style={{ flexShrink: 0, fontSize: 10.5, fontFamily: FONT.mono, fontWeight: tom.peso, color: tom.cor }}>há {d}d</span>;
              })()}
            </div>
            <p title={item.description || undefined} style={{ fontSize: 12, color: T.second, margin: '3px 0 0', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.description || 'Sem descrição'}
              {item.quantity != null && (
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{' · '}{item.quantity} un.</span>
              )}
              {item.referenceUrl && (
                // Link INLINE: era um chip azul com moldura,
                // a única coisa azul da tela inteira, do
                // tamanho de um selo de status ao lado de
                // selos de status — e não é status nenhum.
                <>
                  {' · '}
                  <a
                    href={hrefSeguro(item.referenceUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Ver referência visual do solicitante"
                    data-testid={`link-reference-atendimento-${item.id}`}
                    style={{ color: T.accentText, fontWeight: 600, textDecoration: 'underline' }}
                  >
                    ref. visual
                  </a>
                </>
              )}
            </p>
            <div style={{ marginTop: 6, minWidth: 0, overflow: 'hidden' }}>
              {loadingSponsors ? (
                <span style={{ fontSize: 12, color: T.second }}>carregando patrocinadores…</span>
              ) : (
                <SponsorChips sponsors={sponsorsWithStatus(item)} variant="colored" size="sm" max={2} />
              )}
            </div>
          </div>

          {/* SITUAÇÃO em duas linhas: o rótulo e o RELÓGIO.

              O selo sozinho dizia o estado e escondia a idade
              dele — "Ag. Revisão" com uma bolinha pulsando é
              igual no dia 1 e no dia 40. A segunda linha diz
              há quanto tempo e quem falta.

              A idade vem de `approvalThumbUpdatedAt`, que o
              schema define como "quando o thumb foi trocado
              pela Arte": no primeiro envio é quando a peça
              ficou disponível para o patrocinador; num
              reenvio é quando a Arte devolveu corrigida. As
              duas leituras são o mesmo campo, cada uma no seu
              contexto — e nenhuma delas é inventada. */}
          <div style={{ minWidth: 0 }}>
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
                    style={{ display: "block", fontSize: 12, fontWeight: 700, color: tom, lineHeight: 1.3 }}
                  >
                    {isFullyApproved ? "Aprovado" : SITUACAO_META[sit].label}
                  </span>
                  <span style={{ display: "block", marginTop: 3, fontSize: 12, color: T.second, lineHeight: 1.4 }}>
                    {relogio}
                  </span>
                </>
              );
            })()}
          </div>

          {/* A AÇÃO. Tinta sólida SÓ quando a bola é sua.

              Todos os cards traziam o mesmo botão cinza que
              virava LARANJA INTEIRO no hover — a peça que
              espera você e a peça que não depende de você
              convidavam com a mesma força, e a força era a de
              uma ação primária. */}
          <div style={{ display: 'flex', justifyContent: cards ? 'stretch' : 'flex-end' }}>
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
