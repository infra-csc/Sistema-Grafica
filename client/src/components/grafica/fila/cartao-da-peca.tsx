// ─────────────────────────────────────────────────────────────────────────────
// O CARTÃO DA PEÇA — a fila no celular E no tablet (conteúdo < 820px, ver a
// densidade na página): cabeçalho do evento, arte, código, selos, quantidades
// e, no pé, as ações (acoes-do-cartao.tsx). É memoizado pela LinhaMemo da
// lista: tudo o que ele lê vem de `ctx` e está no inventário `depsDaLinha`.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import type React from "react";
import { Link } from "wouter";
import { AlertCircle, Camera, Check, Package, PlusCircle, Tag, Truck } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { StatusPill } from "@/components/status-pill";
import { SeloMolde } from "@/components/kit/selo-kit";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { diasNaFase, tomDaIdade } from "@/lib/idade-na-fase";
import { splitDisplayId } from "@/lib/displayId";
import { P } from "@/lib/status";
import { FONT, FS, FW, N, T, TOM } from "@/lib/theme";
import { statusDeExibicao } from "@shared/molde";
import { EM_REVISAO } from "@shared/fluxo-peca";
import { pecaTravada } from "@shared/trava-da-peca";
import {
  isDelivered, isPacked, isPosConferencia, isProduced, isInProd,
  qtyOf, producedOf, conferredOf, deliveredOf, reusedTotalOf, remainingProduce,
  isComplement, complementsQtyOf, contractedTotalOf,
} from "@/lib/saldo";
import { podeAumentarQuantidade } from "@/components/aumentar-quantidade-dialog";
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { ContextoDaLinha, CorteDoEvento } from "./contexto-da-linha";
import { CO, qtyChip } from "./aparencia";
import { complementOpen, complementUntouched, fmtDataHora, parentDisplayIdOf, podeDevolverParaRevisao } from "./regras";
import { ProgressoImpressao } from "./progresso-impressao";
import { DeadlineChip, SeloFilaDaImpressora } from "./selos";
import { AcoesDoCartao } from "./acoes-do-cartao";

export function CartaoDaPeca({ ctx, item, index, showEvHeader, corte }: {
  ctx: ContextoDaLinha;
  item: PecaDaFila;
  index: number;
  /** Primeira peça do evento: o cartão abre com o cabeçalho escuro dele. */
  showEvHeader: boolean;
  corte: CorteDoEvento | undefined;
}) {
  const {
    isAdmin, canProduce, podeConferir, soVisualizaKit, canConfer, podeEmbalar, podeMexerQtd, tetoReaproveitar, podeMexerNaTrava,
    bulkOn, bulkConferMode, bulkPackMode, bulkSelectedIds, toggleBulkItem,
    novoComplementoId, seloDoItem, etiquetaveisPorEvento, tubaveisPorEvento, expandirGrupo,
    setTubosDoEvento, seloDoTubo, tituloDoTubo, abrirTuboDaPeca, fechamentoDoTubo,
    setViewDetailsItem, openProductionModal, travaDaLinha,
  } = ctx;
  const isSelected = bulkSelectedIds.has(item.id);
  // Em revisão = só leitura: o trabalho está CHEGANDO, não chegou.
  const emRevisao = EM_REVISAO.has(item.status);
  const canConferItem = canConfer(item) && !emRevisao;
  const podeEmbalarPeca = podeEmbalar(item);
  const bulkEligible = bulkConferMode ? canConferItem : bulkPackMode ? podeEmbalarPeca : false;
  // ── Complemento: os mesmos três números do desktop ──
  const ehComplemento = isComplement(item);
  const coAberto = complementOpen(item);
  const maeDisplayId = ehComplemento ? parentDisplayIdOf(item) : "";
  const complQty = complementsQtyOf(item); // > 0 → esta é a MÃE
  const isNovo = item.id === novoComplementoId;
  // Trilho de ações: dois grupos separados por um divisor. FLUXO
  // (sólidos, o que a Gráfica faz com a peça) e CONTRATO (tintados,
  // o que muda o pedido — papel admin|solicitacao).
  // !emRevisao em TODAS: em Revisão a Gráfica só OLHA (regra do
  // dono, 25/08) — a peça é trabalho chegando, não chegou.
  const mostraAumentar = !bulkOn && !emRevisao && !soVisualizaKit(item) && podeAumentarQuantidade(item, podeMexerQtd);
  const podeProduzirAqui = !emRevisao && canProduce && coAberto && !isProduced(item) && !isPosConferencia(item) && !item.isReuse && remainingProduce(item) > 0;
  const podeCancelarCompl = podeMexerQtd && !soVisualizaKit(item) && ehComplemento && complementUntouched(item);
  // Evento finalizado: o botão continua na tela, DESABILITADO com o
  // motivo — sumir devolveria o buraco que esconder a peça criava
  // (nada explica por que aquela linha não faz o que as vizinhas
  // fazem). Espelha as rotas: produzir e aumentar quantidade são
  // 409; conferir, entregar e cancelar complemento passam.
  const selo = seloDoItem(item);
  // AS AÇÕES DA TABELA, NO CARD. Desde que o card passou a valer
  // também para o tablet (conteúdo < 820px), ele virou o ÚNICO
  // layout dessa faixa — e sem estes quatro, Produzir/Continuar da
  // peça comum, Reaproveitar, Ajustar e Corrigir reaproveitamento e
  // Devolver para a Revisão ficavam inalcançáveis ali (a ficha de
  // detalhe não os tem). As condições são CÓPIA LITERAL dos gates da
  // coluna de Ações da tabela (acoes-da-linha.tsx): se mudar um, mude o
  // outro — `grafica-mobile.test.ts` confere que as duas batem.
  // O `!bulkOn` já vem do trilho, que só existe fora do lote.
  const podeProduzirPeca = !emRevisao && canProduce && !isDelivered(item) && !isProduced(item) && !isPosConferencia(item) && !item.isReuse;
  const podeReaproveitarPeca = !emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0);
  const podeCorrigirReaprov = !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0
    && conferredOf(item) === 0 && deliveredOf(item) === 0;
  const podeDevolverPeca = canProduce && podeDevolverParaRevisao(item);
  const temGrupoFluxo = podeProduzirAqui || podeProduzirPeca || podeReaproveitarPeca || podeCorrigirReaprov || podeDevolverPeca || podeEmbalarPeca || isPacked(item) || (podeConferir && canConferItem) || isDelivered(item);
  const temGrupoContrato = mostraAumentar || podeCancelarCompl;

  return (
    <Fragment>
      {showEvHeader && (
        <div style={{ padding: '8px 10px 8px', marginTop: index > 0 ? 8 : 0, background: T.text, borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package aria-hidden="true" style={{ width: 14, height: 14, color: T.accent, flexShrink: 0 }} />
            {/* 13px (era 11): é o nome que o operador procura com o
                caminhão parado na porta. Quebra linha, nunca corta. */}
            <span style={{ fontSize: FS.read, fontWeight: FW.rotulo, color: T.surface, fontFamily: FONT.display, minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.25 }}>
              {item.event?.name || 'Sem Evento'}
            </span>
            {/* A data aqui era o INÍCIO do evento — para a Gráfica o
                que manda é a SAÍDA do caminhão, a mesma que ordena
                a lista e o cabeçalho do desktop. */}
            {item.event?.truckDepartureDate && (
              <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
                Saída {new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: 'UTC' })}
              </span>
            )}
          </div>
          {/* Prazo, Etiquetas e Tubos NA MESMA linha. Com "Produção Gráfica ·
              29/09" (208px) + "Etiquetas (5)" + "Tubos" eram 339px numa linha
              de 298 (360px de tela): a faixa quebrava em três e custava 135px
              antes de cada peça. Agora "Prazo 29/09" (a tela JÁ é a Gráfica) e
              Etiquetas como ícone + número — o nome vai no aria-label e no
              title. O link segue com alvo de 44px e a pílula visível dentro. */}
          {(item.event || (etiquetaveisPorEvento.get(String(item.eventId)) || 0) > 0 || (tubaveisPorEvento.get(String(item.eventId)) || 0) > 0) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {item.event && <DeadlineChip event={item.event} fonte={12} curto />}
              {(etiquetaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                <Link
                  href={`/eventos/${item.eventId}/etiquetas?de=grafica`}
                  data-testid={`link-etiquetas-mobile-${item.eventId}`}
                  title="Imprimir as etiquetas das peças já conferidas deste evento"
                  aria-label={`Etiquetas (${etiquetaveisPorEvento.get(String(item.eventId))}) — imprimir as etiquetas das peças conferidas`}
                  style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44, textDecoration: 'none' }}
                >
                  <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', color: T.surface, fontSize: FS.meta, fontWeight: FW.rotulo, fontVariantNumeric: 'tabular-nums' }}>
                    <Tag style={{ width: 13, height: 13 }} />
                    {etiquetaveisPorEvento.get(String(item.eventId))}
                  </span>
                </Link>
              )}
              {/* TUBOS (dono, 14/09): o painel de agrupar e entregar
                  por tubo, na mesma linha e no mesmo desenho das
                  Etiquetas — alvo de 44px com a pílula dentro. */}
              {(tubaveisPorEvento.get(String(item.eventId)) ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento" }); }}
                  data-testid={`button-tubos-mobile-${item.eventId}`}
                  title="Agrupar as peças em tubos e entregar por tubo"
                  style={{ marginLeft: (etiquetaveisPorEvento.get(String(item.eventId)) || 0) > 0 ? 0 : 'auto', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.28)', color: T.surface, fontSize: FS.meta, fontWeight: FW.rotulo }}>
                    <Package aria-hidden="true" style={{ width: 12, height: 12 }} />
                    Tubos
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          // Altura acompanha a arte: com a peça na mão, é pelo
          // desenho que se reconhece o item na lista.
          display: 'flex', alignItems: 'stretch', minHeight: 74,
          // Complemento em aberto tinge o card inteiro — no celular
          // não há coluna nenhuma para carregar o sinal, e é no
          // celular que a Gráfica trabalha com a peça na mão.
          background: isNovo ? CO.hoverBg : isSelected ? CO.hoverBg : coAberto ? CO.bg : T.surface,
          border: `1.5px solid ${isSelected ? T.accent : (isNovo || coAberto) ? CO.border : T.border}`,
          // Realce de 5 s da peça recém-criada: no card o anel é
          // caminho livre (a tabela é que não pinta boxShadow).
          boxShadow: isNovo ? '0 0 0 3px rgba(249,115,22,0.45)' : undefined,
          borderRadius: showEvHeader ? '0 0 12px 12px' : 12,
          overflow: 'hidden',
          cursor: bulkOn ? (bulkEligible ? 'pointer' : undefined) : 'pointer',
          transition: 'border-color 0.12s, background 0.12s',
        }}
        data-item-row={item.id}
        /* O "checkbox" da esquerda é um <div> desenhado, não um
           campo: em modo de entrega em lote não havia como marcar
           peça alguma sem mouse. role/aria-checked dão ao card o
           papel que a caixinha só aparenta ter. */
        {...(bulkOn && bulkEligible ? {
          role: 'checkbox' as const,
          tabIndex: 0,
          'aria-checked': isSelected,
          'aria-label': `Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleBulkItem(item.id); }
          },
        } : {})}
        // Fora do modo lote o toque no corpo do card abre o detalhe
        // — o ramo mobile não tinha NENHUM caminho até ele (a arte
        // e os botões de ação já fazem stopPropagation).
        onClick={bulkOn
          ? (bulkEligible ? () => toggleBulkItem(item.id) : undefined)
          : () => setViewDetailsItem(item)}
      >
        {/* Left stripe / checkbox */}
        {bulkOn ? (
          bulkEligible ? (
            <div style={{ width: 52, flexShrink: 0, background: isSelected ? T.accent : N.n2, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.15s' }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isSelected ? T.surface : T.bdark}`, background: isSelected ? 'rgba(255,255,255,0.25)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isSelected && <Check style={{ width: 14, height: 14, color: T.surface }} />}
              </div>
            </div>
          ) : (
            <div style={{ width: 4, flexShrink: 0, background: coAberto ? CO.stripe : T.border }} />
          )
        ) : (
          // A tarja do complemento vem ANTES do verde/laranja/cinza:
          // enquanto ele não é entregue, é o sinal mais forte do card.
          <div style={{ width: 4, flexShrink: 0, background: coAberto ? CO.stripe : isDelivered(item) ? TOM.esmeralda.border : T.border }} />
        )}

        {/* COLUNA: [arte + texto] em cima, AÇÕES embaixo na largura
            inteira do cartão. As ações moravam DENTRO da coluna de
            texto, ao lado da arte de 88px: em 360px sobravam ~205px
            e cada botão caía sozinho numa linha (Produzir /
            Reaproveitar / Devolver empilhados, 150px de botões). */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', minHeight: item.approvalThumbUrl ? 104 : 74 }}>
        {/* Arte aprovada — no celular é ela que identifica a peça
            de relance, na hora de conferir com o material na mão.
            Some no modo lote era o pior momento possível para
            escondê-la: é exatamente aí que o operador está com a
            peça na mão marcando o que já conferiu. No lote ela
            fica mais estreita para conviver com a caixa de seleção,
            e vira <div> (não link) para o toque continuar
            selecionando o card em vez de abrir outra aba. */}
        {item.approvalThumbUrl && (() => {
          const thumbW = bulkOn ? 64 : 88;
          const thumbImg = (
            <img src={convertGCSUrlToLocalPath(item.approvalThumbUrl)} alt={`Arte da peça ${item.displayId}`}
              loading="lazy" decoding="async"
              style={{ maxWidth: '100%', maxHeight: 104, objectFit: 'contain', display: 'block' }}
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          );
          const boxStyle: React.CSSProperties = {
            width: thumbW, minHeight: 44, flexShrink: 0, alignSelf: 'stretch', backgroundColor: T.bg,
            borderRight: `1px solid ${T.border}`, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 5,
          };
          if (bulkOn) {
            return (
              <div style={boxStyle} data-testid={`thumb-art-mobile-${item.id}`}>{thumbImg}</div>
            );
          }
          return (
            <a
              href={convertGCSUrlToLocalPath(item.approvalThumbUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              title="Abrir a arte aprovada"
              data-testid={`thumb-art-mobile-${item.id}`}
              style={boxStyle}
            >
              {thumbImg}
            </a>
          );
        })()}

        {/* Content */}
        <div style={{ flex: 1, padding: '11px 12px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            {/* #047857 (5,48:1) e não #059669 (3,77:1): 13px/700
                precisa passar AA. Ver lib/status.ts P.emerald. */}
            {/* 15px (era 13): o código é o que se confere contra a
                etiqueta do material, de relance. */}
            <span style={{ fontFamily: FONT.mono, fontSize: 15, fontWeight: 700, color: item.isReuse ? TOM.esmeralda.text : T.accentText }}>
              {(() => { const { base, suffix } = splitDisplayId(item.displayId); return (<>{base}{suffix && <span style={{ color: CO.suffix }}>{suffix}</span>}</>); })()}
            </span>
            <StatusPill status={statusDeExibicao(item)} size="sm" showDot={false} />
            <SeloMolde peca={item} />
            {(() => {
              const d = diasNaFase(item, new Date());
              if (d === null || d < 1) return null;
              const tom = tomDaIdade(d);
              return <span title={`Está neste status há ${d} dia(s)`} style={{ fontSize: 12, fontFamily: FONT.mono, fontWeight: tom.peso, color: tom.cor, whiteSpace: 'nowrap' }}>há {d}d</span>;
            })()}
            {/* Paridade com a tabela: o progresso da impressão
                ocupa a linha inteira do cartão (flexBasis 100%). */}
            {isInProd(item) && <span style={{ flexBasis: '100%' }}><ProgressoImpressao item={item} fonte={12} onIniciarResto={podeProduzirPeca && !selo ? () => openProductionModal(item, true) : undefined} /></span>}
            {(pecaTravada(item) || podeMexerNaTrava(item)) && <span style={{ flexBasis: '100%' }}>{travaDaLinha(item, 12, 44)}</span>}
            {(isInProd(item) || item.maquinaPrevista) && <SeloFilaDaImpressora item={item} fonte={12} />}
            {item.isReuse && <Selo forma="retangulo" tom="esmeralda" style={{ fontSize: FS.meta, padding: '1px 6px' }}>Reaprov.</Selo>}
            {/* Selo do complemento: sólido enquanto o lote está em
                aberto (trabalho novo), outline depois de entregue —
                a identidade fica, o alarme não. */}
            {ehComplemento && (
              <Selo
                forma="retangulo"
                cores={coAberto ? { bg: CO.solidBg, text: CO.solidText, border: CO.solidBg } : TOM.laranja}
                data-testid={`badge-complemento-mobile-${item.id}`}
                title={item.complementReason ? `Motivo: ${item.complementReason}` : `Complemento de ${maeDisplayId}`}
                style={{ fontSize: FS.meta, padding: '1px 6px' }}
              >
                {coAberto ? `+${qtyOf(item)} compl.` : 'Compl.'}
              </Selo>
            )}
            {/* Mãe: selo espelho. Sem ele ninguém entende por que
                uma peça entregue "ganhou parente" logo abaixo. */}
            {complQty > 0 && (
              <Selo
                forma="retangulo"
                tom="laranja"
                title={`Contratado total: ${contractedTotalOf(item)} un. (${qtyOf(item)} + ${complQty})`}
                style={{ fontSize: FS.meta, padding: '1px 6px' }}
              >
                Tem +{complQty}
              </Selo>
            )}
            {/* EVENTO FINALIZADO — o selo que paga a volta destas
                peças à fila. Sem ele o operador não tem como saber
                que o evento acabou, e é essa informação que muda a
                decisão dele: nesta linha só conferência e entrega
                funcionam. Fica na MESMA faixa do status, porque é
                do mesmo tipo de fato. */}
            {selo && (
              <Selo
                forma="retangulo"
                ponto
                cores={selo}
                data-testid={`badge-evento-finalizado-mobile-${item.id}`}
                title={selo.hint}
                style={{ fontSize: FS.meta, padding: '1px 6px' }}
              >
                {selo.label}
              </Selo>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.type}</div>
          {/* Identidade permanente: de quem este lote é complemento,
              quem pediu e quando. Não some depois da entrega. */}
          {ehComplemento && (
            <div style={{ fontSize: 12, fontWeight: 600, color: CO.textStrong, lineHeight: 1.3 }}>
              Complemento de {maeDisplayId}
              {item.complementRequestedBy ? ` · ${item.complementRequestedBy}` : ''}
              {item.complementRequestedAt ? `, ${fmtDataHora(item.complementRequestedAt)}` : ''}
            </div>
          )}
          {/* A DESCRIÇÃO é o que distingue duas peças do mesmo tipo
              ("Banner" x "Banner"): o desktop sempre mostrou, o
              celular não — e é no celular que se confere com a
              peça na mão. Duas linhas: nome de peça costuma ser
              longo e uma linha só virava reticência inútil. */}
          {item.description && item.description !== item.type && (
            <div style={{
              fontSize: 13, color: item.isReuse ? TOM.esmeralda.text : T.second,
              fontWeight: item.isReuse ? 600 : 400, lineHeight: 1.35,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {item.description}
            </div>
          )}
          {/* QUANTIDADES — o desktop tem as colunas QTD, REAPROV. e
              PROD; o celular não mostrava número nenhum, e é nele
              que se produz e confere com a peça na mão. Cada etapa
              só aparece depois de existir, para a linha não virar
              uma fileira de zeros. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: FONT.display, lineHeight: 1 }}>
              {qtyOf(item)}
              <span style={{ fontSize: 12, fontWeight: 600, color: T.second, marginLeft: 3 }}>un.</span>
            </span>
            {item.isPriority && (
              <span data-testid={`chip-prioritaria-${item.id}`} style={qtyChip(TOM.perigo.text, TOM.perigo.bg)} title="Peça prioritária — marcada pela Solicitação para sair na frente">
                Prioritária
              </span>
            )}
            {emRevisao && (
              <span data-testid={`chip-revisao-${item.id}`} style={qtyChip(P.fuchsia.text, P.fuchsia.bg)} title="Esta peça ainda está na Revisão Final — aparece aqui para a Gráfica ver o que está chegando. As ações liberam quando a Revisão Final aprovar.">
                Em revisão
              </span>
            )}
            {reusedTotalOf(item) > 0 && (
              <span style={qtyChip(TOM.esmeralda.text, TOM.esmeralda.bg)} title={item.isReuse ? 'Peça inteira reaproveitada' : `${reusedTotalOf(item)} de ${qtyOf(item)} un. reaproveitadas`}>
                Reaprov. {reusedTotalOf(item)}
              </span>
            )}
            {producedOf(item) > 0 && (
              <span style={qtyChip(T.accentText, TOM.laranja.bg)} title={`${producedOf(item)} de ${qtyOf(item)} un. produzidas`}>
                Prod. {producedOf(item)}
              </span>
            )}
            {conferredOf(item) > 0 && (
              <span style={qtyChip(TOM.ciano.text, TOM.ciano.bg)} title={`${conferredOf(item)} de ${qtyOf(item)} un. conferidas`}>
                Conf. {conferredOf(item)}
              </span>
            )}
            {deliveredOf(item) > 0 && (
              <span style={qtyChip(TOM.sucesso.text, TOM.sucesso.bg)} title={`${deliveredOf(item)} de ${qtyOf(item)} un. entregues`}>
                Entreg. {deliveredOf(item)}
              </span>
            )}
            {/* Paridade com a tabela: o tubo em que a peça vai. */}
            {seloDoTubo(item) && (
              <button type="button" data-testid={`chip-tubo-card-${item.id}`} title={tituloDoTubo(item)}
                aria-label={`${seloDoTubo(item)} — ver o que está no tubo`}
                onClick={e => { if (bulkOn) return; e.stopPropagation(); abrirTuboDaPeca(item); }}
                /* Alvo de 44px no dedo; o desenho do selo fica no span de dentro. */
                style={{ minHeight: 44, flexBasis: '100%', padding: 0, border: 'none', background: 'none', display: 'flex', alignItems: 'center', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
                <span style={{ ...qtyChip(T.accentText, TOM.laranja.bg), border: `1px solid ${TOM.laranja.border}`, whiteSpace: 'normal' }}>
                  {fechamentoDoTubo.has(item.tuboId) && <Camera aria-hidden="true" style={{ width: 10, height: 10, marginRight: 3, verticalAlign: -1 }} />}
                  {seloDoTubo(item) ?? ""}
                </span>
              </button>
            )}
          </div>
          {/* MOTIVO do aumento — a informação principal deste card,
              por extenso (duas linhas): é o "e claro isso ficar nos
              logs" resolvido sem abrir ficha nenhuma. */}
          {coAberto && item.complementReason && (
            <div style={{ fontSize: 12, color: CO.textStrong, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 2, lineHeight: 1.35 }}>
              <PlusCircle style={{ width: 11, height: 11, color: CO.text, flexShrink: 0, marginTop: 1 }} />
              <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {item.complementReason}
              </span>
            </div>
          )}
          {item.observations && (
            <div style={{ fontSize: 12, color: TOM.alerta.text, display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 1, lineHeight: 1.35 }}>
              <AlertCircle aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />{item.observations}
            </div>
          )}
        </div>
        </div>

          <AcoesDoCartao
            ctx={ctx} item={item} selo={selo}
            gates={{ emRevisao, canConferItem, podeEmbalarPeca, ehComplemento, mostraAumentar, podeProduzirAqui, podeCancelarCompl, podeProduzirPeca, podeReaproveitarPeca, podeCorrigirReaprov, podeDevolverPeca, temGrupoFluxo, temGrupoContrato }}
          />
        </div>
      </div>
      {/* Renderização incremental: o bloco deste evento tem mais
          peças do que o teto. O botão fica DENTRO do bloco, com o
          número, para não parecer fim de lista. */}
      {corte && (
        <Botao
          tamanho="toque"
          larguraCheia
          onClick={() => expandirGrupo(corte.chave)}
          data-testid={`button-mostrar-todas-${corte.chave}`}
          style={{ marginTop: 2, background: N.n2, borderStyle: 'dashed', fontSize: FS.body }}
        >
          Mostrar todas as {corte.total} peças (+{corte.ocultas})
        </Botao>
      )}
    </Fragment>
  );
}
