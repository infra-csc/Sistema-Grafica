// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DE AÇÕES DA TABELA — `sticky right` com sombra à esquerda marcando
// a borda. `background: inherit` copia a cor da <tr>, inclusive quando o hover
// a troca por JS (por isso rowBg devolve branco explícito e nunca "").
// Na tabela COMPACTA as ações secundárias moram no menu "⋯".
// ─────────────────────────────────────────────────────────────────────────────
import { Check, CheckCircle, Eye, MoreHorizontal, Package, Play, Recycle, RotateCcw, Trash2, Truck, Undo2, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { Selo } from "@/components/ui/selo";
import { P, motivoAcaoBloqueada } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { FS, FW, N, R, SHADOW, T, TOM } from "@/lib/theme";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import { ehMolde } from "@shared/molde";
import { pecaTravada } from "@shared/trava-da-peca";
import {
  isDelivered, isPosConferencia, isProduced, isInProd,
  qtyOf, conferredOf, deliveredOf, reusedTotalOf, remainingConfer, remainingReuse,
} from "@/lib/saldo";
import { AcoesDoMolde } from "@/components/grafica/acoes-do-molde";
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { ContextoDaLinha } from "./contexto-da-linha";
import { corDaAcao, corTintada } from "./aparencia";
import { complementUntouched, podeDevolverParaRevisao, rotuloAcaoImpressao, rotuloDoConferir, tituloAcaoImpressao } from "./regras";
import { TirarDaImpressoraBloqueada, bloqueioDaTrava } from "./trava-da-peca";

export function AcoesDaLinha({ ctx, item, selo, emRevisao, isSelected, bulkEligible, ehComplemento, podeEmbalarPeca }: {
  ctx: ContextoDaLinha;
  item: PecaDaFila;
  /** Selo de evento finalizado (null = evento em jogo). */
  selo: SeloPecaEventoFinalizado | null;
  emRevisao: boolean;
  isSelected: boolean;
  bulkEligible: boolean;
  ehComplemento: boolean;
  podeEmbalarPeca: boolean;
}) {
  const {
    isAdmin, canProduce, podeConferir, soVisualizaKit, canConfer, rotuloEmbalar, podeMexerQtd, tetoReaproveitar,
    bulkOn, bulkConferMode, toggleBulkItem, seloDaImpressao,
    openProductionModal, openConferenceModal, tirarBloqueada, podeTirarBloqueada, mutacoesDeImpressao,
    reuseConfirmItemId, setReuseConfirmItemId, reuseQty, setReuseQty, markReuseMutation,
    correctReuseItemId, setCorrectReuseItemId, correctReuseQty, setCorrectReuseQty, correctReuseMutation,
    cancelComplementId, setCancelComplementId, cancelComplementMutation,
    menuAcoesId, setMenuAcoesId, menuParaCima, setMenuParaCima, idMenuAberto, fecharMenuAcoes,
    setDevolverItem, setDevolverMotivo, abrirEmbalar, setViewDetailsItem,
    setTubosDoEvento, temVolumeAberto, ehAvulsa, tirarDoTuboMutation,
    compacto, tamLinha, ponteiroGrosso,
  } = ctx;
  return (
    <td
      style={{
        // Compacta: 10px de respiro (ver padCelula na linha).
        padding: compacto ? "13px 10px" : "13px 16px", textAlign: "right",
        // zIndex 3 com o menu aberto: a célula sticky da linha
        // de baixo (z 1, depois no DOM) pintaria por cima dele.
        position: "sticky", right: 0, zIndex: idMenuAberto === item.id ? 3 : 1,
        background: "inherit",
        boxShadow: "-8px 0 8px -8px rgba(28,25,23,0.28)",
      }}
      onClick={e => e.stopPropagation()}
    >
      {/* Em modo lote sobram só conteúdo e checkbox, como no
          card mobile já fazia. Na tabela a correção nunca foi
          propagada: numa "conferência em lote", cada linha
          elegível exibia um botão Conferir ciano cheio colado
          no checkbox, disputando o clique com a seleção. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
        {/* Ver detalhes */}
        {!bulkOn && (
        <Botao
          variante="fantasma"
          tamanho={tamLinha}
          icone={Eye}
          onClick={() => setViewDetailsItem(item)}
          title="Ver detalhes"
          aria-label={`Ver detalhes de ${item.displayId}`}
          data-testid={`button-view-${item.id}`}
          style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
        />
        )}

        {/* MOLDE (22/09): o trilho inteiro vira UMA ação — "Marcar como
            produzido" (ou desfazer). Nada de impressora, conferir,
            embalar, tubo ou entregar: o fluxo dele morre no Produzido. */}
        {ehMolde(item) ? (!bulkOn && <AcoesDoMolde item={item} podeProduzir={canProduce} selo={selo} />) : (<>
        {/* ── MENU "⋯" DAS SECUNDÁRIAS (tabela COMPACTA) ──
            Na faixa compacta (notebook, sidebar aberta) a
            coluna de Ações é sticky: cada px dela sai das
            colunas de baixo, e com Reaproveitar + Corrigir
            reaprov. + Devolver ao lado do botão principal ela
            cobria o Status. Ali as SECUNDÁRIAS moram num menu
            e a principal (Produzir/Conferir/Entregar) fica à
            vista. Os blocos abaixo são os MESMOS, com os
            mesmos gates (paridade com o cartão); só o
            invólucro muda: `display: contents` na tabela
            cheia (nada muda) e caixa flutuante na compacta.
            O menu fica aberto enquanto uma edição em linha
            dele estiver aberta. */}
        {(() => {
          const temSecundaria = !bulkOn && (
            (podeMexerQtd && !soVisualizaKit(item) && ehComplemento && complementUntouched(item))
            || (!emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0))
            || (!emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0 && conferredOf(item) === 0 && deliveredOf(item) === 0)
            || (canProduce && podeDevolverParaRevisao(item)));
          if (!compacto || !temSecundaria) return null;
          const aberto = menuAcoesId === item.id || reuseConfirmItemId === item.id || correctReuseItemId === item.id || cancelComplementId === item.id;
          return (
            <button
              type="button"
              data-menu-acoes={item.id}
              onClick={e => {
                if (aberto) { fecharMenuAcoes(); return; }
                // Um menu por vez: abrir outro fecha as edições do anterior.
                const r = e.currentTarget.getBoundingClientRect();
                setMenuParaCima(window.innerHeight - r.bottom < 240);
                fecharMenuAcoes();
                setMenuAcoesId(item.id);
              }}
              aria-haspopup="true"
              aria-expanded={aberto}
              aria-label={`Mais ações de ${item.displayId}`}
              title="Mais ações"
              data-testid={`button-mais-acoes-${item.id}`}
              className="ds-botao"
              style={{ width: alvoDeToque(32, ponteiroGrosso), height: alvoDeToque(32, ponteiroGrosso), padding: 0, borderRadius: R.md, border: `1px solid ${aberto ? T.text : T.border}`, background: aberto ? N.n2 : T.surface, color: T.text, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
            >
              <MoreHorizontal aria-hidden="true" style={{ width: 16, height: 16 }} />
            </button>
          );
        })()}
        <div
          data-menu-acoes={item.id}
          data-testid={compacto ? `menu-acoes-${item.id}` : undefined}
          role={compacto ? "group" : undefined}
          aria-label={compacto ? `Mais ações de ${item.displayId}` : undefined}
          style={!compacto
            ? { display: "contents" }
            : (menuAcoesId === item.id || reuseConfirmItemId === item.id || correctReuseItemId === item.id || cancelComplementId === item.id)
              ? { position: "absolute", right: 16, ...(menuParaCima ? { bottom: "calc(100% - 6px)" } : { top: "calc(100% - 6px)" }), zIndex: 5, minWidth: 220, display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, padding: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, boxShadow: SHADOW.lg, textAlign: "left" }
              : { display: "none" }}
        >
        {/* Cancelar complemento — a janela de arrependimento.
            Mesmo papel de quem CRIA o complemento (admin |
            solicitacao), espelho de `podeMudarQuantidade` no
            DELETE /api/items/:id/complement. Estava com
            `canProduce`: a Gráfica via um convite falso que
            virava 403, e quem realmente pode cancelar (a
            Solicitação) não via botão nenhum.
            Só enquanto NADA foi produzido, reaproveitado,
            conferido ou entregue: uma única unidade já é
            material no galpão. Confirmação em dois passos, no
            mesmo idioma dos botões de reaproveitamento. */}
        {!bulkOn && podeMexerQtd && !soVisualizaKit(item) && ehComplemento && complementUntouched(item) && (
          cancelComplementId === item.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.perigo.text, whiteSpace: "nowrap" }}>Cancelar {item.displayId}?</span>
              <Botao
                variante="perigo"
                tamanho={tamLinha}
                carregando={cancelComplementMutation.isPending}
                onClick={() => cancelComplementMutation.mutate({ itemId: item.id, displayId: item.displayId })}
                data-testid={`button-cancel-complement-confirm-${item.id}`}
              >
                {cancelComplementMutation.isPending ? "Cancelando…" : "Sim, remover"}
              </Botao>
              <Botao
                tamanho={tamLinha}
                icone={X}
                onClick={() => setCancelComplementId(null)}
                title="Manter o complemento"
                aria-label="Manter o complemento"
                style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
              />
            </div>
          ) : (
            <Botao
              onClick={e => { e.stopPropagation(); setCancelComplementId(item.id); }}
              title={`Cancelar ${item.displayId} — só enquanto nada foi produzido`}
              aria-label={`Cancelar o complemento ${item.displayId}`}
              data-testid={`button-cancel-complement-${item.id}`}
              variante="fantasma"
              tamanho={tamLinha}
              icone={Trash2}
              style={{ color: TOM.perigo.text, border: `1px solid ${T.border}` }}
            >
              Cancelar compl.
            </Botao>
          )
        )}


        {/* Reaproveitar — total ou parcial, enquanto ainda há
            unidades sem produzir nem reaproveitar.
            APÓS PRODUZIDO (dono, 27/08): a ação continua, mas
            só para admin|solicitacao (podeMexerQtd) — e vira
            CONVERSÃO de produzidas em reaproveitadas; a peça
            segue "Produzido". Conferida/entregue, acabou.
            Em evento finalizado o gatilho vem DESABILITADO
            (POST /api/items/:id/mark-reuse é barrado): marcar
            reaproveitamento é decidir o que entra na fila de
            produção, ou seja, faz o trabalho andar. */}
        {!bulkOn && !emRevisao && !pecaTravada(item) && !soVisualizaKit(item) && !isDelivered(item) && !isPosConferencia(item) && (!isProduced(item) ? tetoReaproveitar(item) > 0 : podeMexerQtd && qtyOf(item) > 0) && (
          reuseConfirmItemId === item.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              {/* Rótulo, como no "Corrigir": sem ele o campo
                  aberto era um número solto com "OK" — nada
                  dizia que ali se marcava reaproveitamento. */}
              <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.esmeralda.text, whiteSpace: "nowrap" }}>{isProduced(item) ? "Reaprov. total:" : "Reaproveitar:"}</span>
              <input
                type="number"
                min={isProduced(item) ? 0 : 1}
                max={isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}
                value={reuseQty}
                onChange={e => setReuseQty(Math.max(isProduced(item) ? 0 : 1, Math.min(isProduced(item) ? qtyOf(item) : tetoReaproveitar(item), parseInt(e.target.value) || 0)))}
                title={isProduced(item)
                  ? `Total reaproveitado desta peça (0 a ${qtyOf(item)}) — o resto conta como produzido`
                  : `Quantas unidades reaproveitar (até ${tetoReaproveitar(item)})`}
                data-testid={`input-reuse-qty-${item.id}`}
                style={{ width: 56, height: alvoDeToque(32, ponteiroGrosso), padding: "0 6px", borderRadius: R.sm, border: `1px solid ${T.border}`, fontSize: FS.body, fontWeight: FW.forte, color: T.text, textAlign: "center" }}
              />
              <span style={{ fontSize: FS.small, color: T.second, whiteSpace: "nowrap" }}>de {isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}</span>
              <Botao
                variante="primario"
                tamanho={tamLinha}
                carregando={markReuseMutation.isPending}
                onClick={() => markReuseMutation.mutate(isProduced(item)
                  ? { itemId: item.id, reuseTotal: reuseQty }
                  : { itemId: item.id, qty: reuseQty })}
                title="Confirmar reaproveitamento"
                data-testid={`button-reuse-confirm-${item.id}`}
                style={corDaAcao(TOM.esmeralda.text)}
              >
                OK
              </Botao>
              <Botao
                tamanho={tamLinha}
                icone={X}
                onClick={() => setReuseConfirmItemId(null)}
                title="Cancelar"
                aria-label="Cancelar reaproveitamento"
                style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
              />
            </div>
          ) : (
            <Botao
              variante="fantasma"
              tamanho={tamLinha}
              icone={Recycle}
              onClick={e => { e.stopPropagation(); if (selo) return; setReuseConfirmItemId(item.id); setReuseQty(isProduced(item) ? reusedTotalOf(item) : tetoReaproveitar(item)); }}
              disabled={!!selo}
              aria-label={`Reaproveitar ${item.displayId}`}
              title={selo
                ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
                : isProduced(item)
                  ? `Ajustar reaproveitamento (0 a ${qtyOf(item)}) — converte entre produzidas e reaproveitadas, nas duas direções`
                  : `Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
              data-testid={`button-reuse-${item.id}`}
              // ♻ e não a seta circular: ao lado de "Produzir" a
              // seta se lia como "desfazer". No menu "⋯" o ícone
              // sozinho não diz o que faz, então ganha rótulo.
              style={{ color: TOM.esmeralda.text, width: compacto ? "auto" : alvoDeToque(32, ponteiroGrosso), padding: compacto ? "0 8px" : 0, justifyContent: compacto ? "flex-start" : "center" }}
            >
              {compacto && (isProduced(item) ? "Ajustar reaproveitamento" : "Reaproveitar")}
            </Botao>
          )
        )}

        {/* Corrigir reaproveitamento — para quando a marcação foi
            feita errada, total ou parcial, e a peça ainda não
            começou a ser conferida nem entregue.
            O `isProduced` sozinho escondia o caso mais comum:
            a quantidade sai errada e o erro é notado antes de
            produzir, com a peça em "Pronto p/ Produção". O
            admin corrige em qualquer etapa anterior à
            conferência; para a Gráfica segue como estava. */}
        {!bulkOn && !emRevisao && !soVisualizaKit(item) && (isProduced(item) || isAdmin) && reusedTotalOf(item) > 0
          && conferredOf(item) === 0 && deliveredOf(item) === 0 && (
          correctReuseItemId === item.id ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={e => e.stopPropagation()}>
              {/* Rótulo explícito: sem ele este campo fica ao
                  lado do de "Produzir", que também é um
                  número seguido de "de N" — dava para digitar
                  no lugar errado sem perceber. */}
              <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.alerta.text, whiteSpace: "nowrap" }}>Reaprov.:</span>
              {/* O teto era quantidade-1, então quem marcou
                  parcial por engano não conseguia voltar para
                  reaproveitamento total. O admin alcança o
                  total; para a Gráfica o limite continua
                  sendo o parcial. */}
              <input
                type="number"
                min={0}
                max={isAdmin ? qtyOf(item) : qtyOf(item) - 1}
                value={correctReuseQty}
                autoFocus
                onFocus={e => e.currentTarget.select()}
                onChange={e => setCorrectReuseQty(Math.max(0, Math.min(isAdmin ? qtyOf(item) : qtyOf(item) - 1, parseInt(e.target.value) || 0)))}
                aria-label="Quantidade reaproveitada corrigida"
                title={`Quantas unidades reaproveitadas (0 a ${isAdmin ? qtyOf(item) : qtyOf(item) - 1})`}
                style={{ width: 56, height: alvoDeToque(32, ponteiroGrosso), padding: "0 6px", borderRadius: R.sm, border: `1px solid ${TOM.alerta.dot}`, fontSize: FS.body, fontWeight: FW.forte, color: T.text, textAlign: "center" }}
              />
              <span style={{ fontSize: FS.small, color: T.second, whiteSpace: "nowrap" }}>de {qtyOf(item)}</span>
              <Botao
                variante="primario"
                tamanho={tamLinha}
                carregando={correctReuseMutation.isPending}
                onClick={() => correctReuseMutation.mutate({ itemId: item.id, correctedReuseQty: correctReuseQty })}
                title="Confirmar correção"
                style={corDaAcao(TOM.alerta.text)}
              >
                OK
              </Botao>
              <Botao
                tamanho={tamLinha}
                icone={X}
                onClick={() => setCorrectReuseItemId(null)}
                title="Cancelar"
                aria-label="Cancelar correção do reaproveitamento"
                style={{ width: alvoDeToque(32, ponteiroGrosso), padding: 0 }}
              />
            </div>
          ) : (
            /* Era um ícone solto com o texto só no `title`:
               ninguém achava o caminho para corrigir. Com
               rótulo, a ação fica óbvia ao lado do número
               errado. E o campo abre com a quantidade ATUAL,
               não com quantidade-1 — quem corrige parte do
               valor que está lá, não de um chute. */
            <Botao
              tamanho={tamLinha}
              icone={RotateCcw}
              onClick={e => { e.stopPropagation(); if (selo) return; setCorrectReuseItemId(item.id); setCorrectReuseQty(reusedTotalOf(item)); }}
              disabled={!!selo}
              title={selo
                ? motivoAcaoBloqueada(selo.motivo, "corrigir o reaproveitamento")
                : "Corrigir a quantidade reaproveitada desta peça"}
              aria-label={`Corrigir reaproveitamento de ${item.displayId}`}
              data-testid={`button-correct-reuse-${item.id}`}
              style={corTintada(TOM.alerta)}
            >
              Corrigir reaprov.
            </Botao>
          )
        )}

        {/* Conferir — etapa entre Produzido e Entregue (com foto);
            gate igual ao do servidor (grafica/admin) */}
        {/* DEVOLVER — contorno, não preenchido: é a saída de
            exceção ao lado de "Produzir", que é o caminho
            normal. Só antes de produzir; depois disso o botão
            some, porque não há estorno do que já foi impresso.

            SÓ O ÍCONE, e por um motivo mecânico além do peso
            visual: a coluna de Ações é `sticky right`, então
            tudo o que ela ganha de largura ela TIRA das colunas
            de baixo — com o rótulo escrito, o selo de status da
            linha aparecia cortado ao meio ("PRONTO PROD…").
            Um botão de exceção não paga esse preço.

            O que o rótulo dizia está no `title` e no
            `aria-label`, que já eram a fonte do leitor de tela. */}
        {!bulkOn && canProduce && podeDevolverParaRevisao(item) && (
          <Botao
            tamanho={tamLinha}
            icone={Undo2}
            onClick={() => { setDevolverItem(item); setDevolverMotivo(""); }}
            title="Devolver para a Revisão Final — a peça sai da fila da Gráfica"
            aria-label={`Devolver ${item.displayId} para a Revisão Final`}
            data-testid={`button-devolver-revisao-${item.id}`}
            style={{ color: TOM.perigo.text, borderColor: TOM.perigo.border, width: compacto ? "auto" : alvoDeToque(32, ponteiroGrosso), padding: compacto ? "0 8px" : 0, flexShrink: 0, justifyContent: compacto ? "flex-start" : "center" }}
          >
            {compacto && "Devolver para a Revisão"}
          </Botao>
        )}
        </div>

        {/* Iniciar / Continuar Produção — oculto para reaproveitamento
            e para quem o servidor recusa (só grafica/admin produzem).
            Depois de conferida, a peça só tem a entrega pela frente.
            Vem DEPOIS das secundárias: a ação principal de cada
            etapa (Produzir, Conferir, Entregar) fica sempre na
            ponta direita, onde o olho já procura. */}
        {!bulkOn && !emRevisao && canProduce && !isDelivered(item) && !isProduced(item) && !isPosConferencia(item) && !item.isReuse && (
          <Botao
            variante="primario"
            tamanho={tamLinha}
            icone={Play}
            onClick={() => { if (!seloDaImpressao(item, selo)) openProductionModal(item); }}
            disabled={!!seloDaImpressao(item, selo)}
            /* PATCH /api/items/:id/start-production tem a
               guarda de evento finalizado: clicar aqui só
               renderia 409. */
            title={seloDaImpressao(item, selo)
              ? motivoAcaoBloqueada(seloDaImpressao(item, selo)!.motivo, "produzir")
              : isInProd(item) ? tituloAcaoImpressao(item) : "Escolher a máquina e iniciar a impressão"}
            data-testid={`button-production-${item.id}`}
            {...bloqueioDaTrava(item)}
          >
            {isInProd(item) ? rotuloAcaoImpressao(item) : "Imprimir"}
          </Botao>
        )}
        {!bulkOn && podeTirarBloqueada(item, selo) && (
          <TirarDaImpressoraBloqueada item={item} fonte={12} alvo={32} pendente={mutacoesDeImpressao.mexerNaImpressoraMutation.isPending} onTirar={(m) => tirarBloqueada(item, m)} />
        )}

        {emRevisao && (
          <Selo cores={P.fuchsia} icone={Eye} data-testid={`selo-revisao-${item.id}`} title="Esta peça ainda está na Revisão Final — aparece aqui para a Gráfica ver o que está chegando. As ações liberam quando a Revisão Final aprovar." style={{ padding: '4px 9px' }}>
            Em revisão
          </Selo>
        )}
        {!bulkOn && !emRevisao && podeConferir && canConfer(item) && (
          <Botao
            variante="primario"
            tamanho={tamLinha}
            icone={CheckCircle}
            onClick={() => openConferenceModal(item)}
            title={`Conferir (faltam ${remainingConfer(item)} de ${qtyOf(item)})`}
            data-testid={`button-confer-${item.id}`}
            {...bloqueioDaTrava(item)}
            style={corDaAcao(TOM.ciano.text)}
          >
            {rotuloDoConferir(item)}
          </Botao>
        )}

        {/* Checkbox seleção em lote — nos DOIS modos (a
            conferência em lote não tinha checkbox na tabela) */}
        {bulkOn && bulkEligible && (
          <div
            role="checkbox"
            tabIndex={0}
            aria-checked={isSelected}
            aria-label={`Selecionar ${item.displayId} para ${bulkConferMode ? 'conferência' : 'entrega'}`}
            onClick={e => { e.stopPropagation(); toggleBulkItem(item.id); }}
            // Mesmo suporte a teclado do card mobile: sem isto
            // o role="checkbox" nem recebia foco.
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); toggleBulkItem(item.id); }
            }}
            style={{ width: 26, height: 26, borderRadius: 6, flexShrink: 0, border: `2px solid ${isSelected ? T.accent : T.bdark}`, background: isSelected ? T.accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s' }}
          >
            {isSelected && <Check style={{ width: 13, height: 13, color: T.surface }} />}
          </div>
        )}
        {/* EMBALAR (dono, 21/09): a principal da peça CONFERIDA — abre
            o painel de tubos do evento já com a peça marcada, focado em
            escolher o tubo. Azul do Embalado (#1d4ed8, 6,3:1 com branco). */}
        {!bulkOn && podeEmbalarPeca && (
          <Botao
            variante="primario"
            tamanho={tamLinha}
            icone={Package}
            onClick={() => abrirEmbalar([item])}
            title="Pôr no tubo — escolhe o tubo no painel do evento"
            data-testid={`button-embalar-${item.id}`}
            {...bloqueioDaTrava(item)}
            style={corDaAcao(TOM.info.text)}
          >
            {rotuloEmbalar(item)}
          </Botao>
        )}

        {/* Embalada: entregar o TUBO inteiro — abre o painel já no
            formulário daquele tubo (quem recebeu). Principal da
            embalada, antes do "Tirar" (paridade com o cartão). */}
        {!bulkOn && podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && item.eventId && (
          <Botao
            variante="primario"
            tamanho={tamLinha}
            icone={Truck}
            onClick={() => setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento", entregarTubo: item.tuboId })}
            data-testid={`button-entregar-tubo-${item.id}`}
            title="Entregar o tubo inteiro — a peça embalada só sai com o tubo"
            {...bloqueioDaTrava(item)}
            style={corDaAcao(TOM.info.text)}
          >
            {ehAvulsa(item) ? "Entregar" : "Entregar tubo"}
          </Botao>
        )}
        {/* Embalado: tirar do tubo devolve a Conferido — secundária. Na
            COMPACTA vira só o ícone (o rótulo vai no aria-label e no title):
            ao lado de "Entregar tubo" os dois rótulos passavam de 250px e
            empurravam a tabela para os cartões no notebook. */}
        {!bulkOn && podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && (
          <Botao
            tamanho={tamLinha}
            icone={Undo2}
            onClick={() => tirarDoTuboMutation.mutate({ itemId: item.id, tuboId: item.tuboId, displayId: item.displayId })}
            carregando={tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id}
            data-testid={`button-tirar-do-tubo-${item.id}`}
            aria-label={compacto ? `${ehAvulsa(item) ? "Desfazer embalagem" : "Tirar do tubo"}: ${item.displayId}` : undefined}
            title="Tira a peça do tubo — ela volta a Conferido"
            style={compacto ? { width: alvoDeToque(32, ponteiroGrosso), padding: 0, flexShrink: 0 } : undefined}
          >
            {!compacto && (ehAvulsa(item) ? "Desfazer embalagem" : "Tirar do tubo")}
          </Botao>
        )}

        {/* Entregue */}
        {!bulkOn && isDelivered(item) && (
          <span style={{ fontSize: FS.body, color: TOM.sucesso.text, display: "inline-flex", alignItems: "center", gap: 4, fontWeight: FW.medio }}>
            <Check style={{ width: 13, height: 13 }} /> Entregue
          </span>
        )}
        </>)}
      </div>
    </td>
  );
}
