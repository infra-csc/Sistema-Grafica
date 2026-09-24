// ─────────────────────────────────────────────────────────────────────────────
// AS AÇÕES DO CARTÃO — faixa no PÉ do card, não um trilho à direita (o trilho
// roubava um terço da largura em 390px e espremia tipo e descrição em
// reticências justamente na tela de quem confere com a peça na mão); no pé,
// cada botão ganha largura de dedo (≥ 112px, 44 de altura). Some em QUALQUER
// modo de lote (senão os botões disputariam o toque com a seleção).
//
// ORDEM VISUAL (CSS order, o DOM segue o da tabela): cada ação PRINCIPAL da
// etapa — Produzir/Continuar, Conferir, Embalar, Entregar — ocupa a linha
// inteira; as secundárias (Reaproveitar, Corrigir, Devolver, Tirar do tubo)
// dividem a última linha com o contrato (Aumentar, Cancelar). 8px entre botões:
// com 6 o dedo de luva pegava o vizinho.
// ─────────────────────────────────────────────────────────────────────────────
import type React from "react";
import { Check, CheckCircle, Package, Play, PlusCircle, Recycle, RotateCcw, Trash2, Truck, Undo2, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { motivoAcaoBloqueada } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { FS, FW, T, TOM } from "@/lib/theme";
import { ehMolde } from "@shared/molde";
import { isDelivered, isProduced, isInProd, qtyOf, reusedTotalOf, remainingProduce, remainingReuse } from "@/lib/saldo";
import { AcoesDoMolde } from "@/components/grafica/acoes-do-molde";
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { ContextoDaLinha } from "./contexto-da-linha";
import { CO, corDaAcao, corTintada } from "./aparencia";
import { rotuloAcaoImpressao, rotuloDoConferir, tituloAcaoImpressao } from "./regras";
import { TirarDaImpressoraBloqueada, bloqueioDaTrava } from "./trava-da-peca";

/** Os gates da peça que o cartão já calculou (os mesmos da coluna de Ações da tabela). */
export type GatesDoCartao = {
  emRevisao: boolean; canConferItem: boolean; podeEmbalarPeca: boolean; ehComplemento: boolean;
  mostraAumentar: boolean; podeProduzirAqui: boolean; podeCancelarCompl: boolean; podeProduzirPeca: boolean;
  podeReaproveitarPeca: boolean; podeCorrigirReaprov: boolean; podeDevolverPeca: boolean;
  temGrupoFluxo: boolean; temGrupoContrato: boolean;
};

export function AcoesDoCartao({ ctx, item, selo, gates }: {
  ctx: ContextoDaLinha;
  item: PecaDaFila;
  /** Selo de evento finalizado (null = evento em jogo). */
  selo: SeloPecaEventoFinalizado | null;
  gates: GatesDoCartao;
}) {
  const {
    isAdmin, canProduce, podeConferir, soVisualizaKit, rotuloEmbalar, tetoReaproveitar,
    bulkOn, seloDaImpressao, openProductionModal, openConferenceModal, tirarBloqueada, podeTirarBloqueada, mutacoesDeImpressao,
    reuseConfirmItemId, setReuseConfirmItemId, reuseQty, setReuseQty, markReuseMutation,
    correctReuseItemId, setCorrectReuseItemId, correctReuseQty, setCorrectReuseQty, correctReuseMutation,
    cancelComplementId, setCancelComplementId, cancelComplementMutation,
    setDevolverItem, setDevolverMotivo, abrirEmbalar, abrirComplemento,
    setTubosDoEvento, temVolumeAberto, ehAvulsa, tirarDoTuboMutation,
  } = ctx;
  const {
    canConferItem, podeEmbalarPeca, mostraAumentar, podeProduzirAqui, podeCancelarCompl, podeProduzirPeca,
    podeReaproveitarPeca, podeCorrigirReaprov, podeDevolverPeca, temGrupoFluxo, temGrupoContrato,
  } = gates;
  // LINHAS PREVISÍVEIS (revisão de celular, 24/09). Antes cada botão tinha uma
  // base (150/100/130px) e o flex-wrap decidia a quebra: o mesmo card saía em
  // três arranjos, e o "+" do Aumentar caía SOZINHO numa linha, com o divisor
  // solto. Agora: cada PRINCIPAL ocupa a linha inteira (o dedo acha sempre no
  // mesmo lugar); as SECUNDÁRIAS dividem a última linha com o "+", que nunca
  // fica órfão. Sem secundária, a última principal divide a linha com o "+".
  const entregaTubo = podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && !!item.eventId;
  const principais = [
    podeProduzirAqui && "produzirAqui",
    podeProduzirPeca && !podeProduzirAqui && "produzir",
    podeConferir && canConferItem && "conferir",
    podeEmbalarPeca && "embalar",
    entregaTubo && "entregar",
  ].filter(Boolean) as string[];
  const temSecundaria = (podeReaproveitarPeca && reuseConfirmItemId !== item.id)
    || (podeCorrigirReaprov && correctReuseItemId !== item.id)
    || podeDevolverPeca || podeCancelarCompl
    || (podeConferir && !soVisualizaKit(item) && temVolumeAberto(item));
  const dividePeloContrato = (qual: string) => !temSecundaria && mostraAumentar && qual === principais[principais.length - 1];
  const flexPrincipal = (qual: string): React.CSSProperties =>
    ({ order: 0, flex: dividePeloContrato(qual) ? "1 1 0%" : "1 1 100%", minWidth: 0 });
  // Secundária: base zero e quebra de linha no rótulo — dividem a linha por igual.
  const flexSecundaria: React.CSSProperties = { order: 1, flex: "1 1 0%", minWidth: 0, whiteSpace: "normal", lineHeight: 1.15, textAlign: "center" };
  return (
    <>
      {/* MOLDE (22/09): uma ação só — "Marcar como produzido" (ou desfazer). */}
      {!bulkOn && ehMolde(item) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 8, padding: '0 12px 12px' }}>
          <AcoesDoMolde item={item} podeProduzir={canProduce} selo={selo} cartao />
        </div>
      )}
      {!bulkOn && !ehMolde(item) && (temGrupoFluxo || temGrupoContrato) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 8, padding: '0 12px 12px' }}>
          {/* PRODUZIR — o celular só tinha Entregar e Conferir.
              Num complemento isso é o pior buraco possível: a
              Gráfica em campo vê o alerta laranja e não tem o que
              fazer com ele. Este é o "Produzir N" do complemento
              aberto; a peça comum usa o Produzir/Continuar logo
              abaixo. Mesmo gate de papel do desktop, que o
              servidor também valida. */}
          {podeProduzirAqui && (
            <Botao
              variante="primario"
              tamanho="toque"
              icone={Play}
              onClick={e => { e.stopPropagation(); if (!seloDaImpressao(item, selo)) openProductionModal(item); }}
              disabled={!!seloDaImpressao(item, selo)}
              title={seloDaImpressao(item, selo) ? motivoAcaoBloqueada(seloDaImpressao(item, selo)!.motivo, "produzir") : undefined}
              data-testid={`button-production-mobile-${item.id}`}
              {...bloqueioDaTrava(item)}
              // Laranja sólido do complemento: é trabalho NOVO. A
              // quebra de linha é permitida (o rótulo com a
              // impressora não cabe numa linha em 360px).
              style={{ ...corDaAcao(CO.solidBg), ...flexPrincipal("produzirAqui"), minHeight: 48, padding: '0 12px', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.15 }}
            >
              {isInProd(item) ? rotuloAcaoImpressao(item) : `Imprimir ${remainingProduce(item)}`}
            </Botao>
          )}
          {/* PRODUZIR / CONTINUAR da peça comum — o mesmo botão
              da tabela (mesmo gate, mesmo modal, mesmo bloqueio
              de evento finalizado). O complemento aberto já tem
              o "Produzir N" logo acima; não repete. */}
          {podeProduzirPeca && !podeProduzirAqui && (
            <Botao
              variante="primario"
              tamanho="toque"
              icone={Play}
              onClick={e => { e.stopPropagation(); if (!seloDaImpressao(item, selo)) openProductionModal(item); }}
              disabled={!!seloDaImpressao(item, selo)}
              title={seloDaImpressao(item, selo)
                ? motivoAcaoBloqueada(seloDaImpressao(item, selo)!.motivo, "produzir")
                : isInProd(item) ? tituloAcaoImpressao(item) : "Escolher a máquina e iniciar a impressão"}
              data-testid={`button-production-card-${item.id}`}
              {...bloqueioDaTrava(item)}
              style={{ ...flexPrincipal("produzir"), minHeight: 48, padding: '0 12px', whiteSpace: 'normal', textAlign: 'center', lineHeight: 1.15 }}
            >
              {isInProd(item) ? rotuloAcaoImpressao(item) : 'Imprimir'}
            </Botao>
          )}
          {podeTirarBloqueada(item, selo) && (
            <span style={{ order: 0, flex: '1 1 100%' }}>
              <TirarDaImpressoraBloqueada item={item} fonte={13} alvo={44} pendente={mutacoesDeImpressao.mexerNaImpressoraMutation.isPending} onTirar={(m) => tirarBloqueada(item, m)} />
            </span>
          )}
          {/* REAPROVEITAR / AJUSTAR — mesma edição em linha da
              tabela (mesmo estado, mesma mutação), só que com
              alvos de 44px e ocupando a largura do card: o
              campo numérico ao lado de outros botões é onde o
              dedo erra. */}
          {podeReaproveitarPeca && (
            reuseConfirmItemId === item.id ? (
              <div style={{ order: 1, flex: '1 1 100%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }} onClick={e => e.stopPropagation()}>
                <span style={{ fontSize: 13, fontWeight: 700, color: TOM.esmeralda.text, whiteSpace: 'nowrap' }}>
                  {isProduced(item) ? 'Reaprov. total:' : 'Reaproveitar:'}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={isProduced(item) ? 0 : 1}
                  max={isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}
                  value={reuseQty}
                  onChange={e => setReuseQty(Math.max(isProduced(item) ? 0 : 1, Math.min(isProduced(item) ? qtyOf(item) : tetoReaproveitar(item), parseInt(e.target.value) || 0)))}
                  aria-label={isProduced(item) ? `Total reaproveitado de ${item.displayId}` : `Quantas unidades de ${item.displayId} reaproveitar`}
                  data-testid={`input-reuse-qty-card-${item.id}`}
                  // 16px: abaixo disso o iOS dá zoom na página ao focar o campo.
                  style={{ width: 72, minHeight: 44, padding: '0 6px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 16, fontWeight: 700, color: T.text, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: T.second, whiteSpace: 'nowrap' }}>de {isProduced(item) ? qtyOf(item) : tetoReaproveitar(item)}</span>
                <Botao
                  variante="primario"
                  tamanho="toque"
                  carregando={markReuseMutation.isPending}
                  onClick={() => markReuseMutation.mutate(isProduced(item)
                    ? { itemId: item.id, reuseTotal: reuseQty }
                    : { itemId: item.id, qty: reuseQty })}
                  data-testid={`button-reuse-confirm-card-${item.id}`}
                  style={{ ...corDaAcao(TOM.esmeralda.text), flex: '1 1 auto' }}
                >
                  Confirmar
                </Botao>
                <Botao
                  tamanho="toque"
                  icone={X}
                  onClick={() => setReuseConfirmItemId(null)}
                  aria-label="Cancelar reaproveitamento"
                  style={{ width: 44, padding: 0, flexShrink: 0 }}
                />
              </div>
            ) : (
              <Botao
                tamanho="toque"
                icone={Recycle}
                onClick={e => { e.stopPropagation(); if (selo) return; setReuseConfirmItemId(item.id); setReuseQty(isProduced(item) ? reusedTotalOf(item) : tetoReaproveitar(item)); }}
                disabled={!!selo}
                title={selo
                  ? motivoAcaoBloqueada(selo.motivo, "marcar reaproveitamento")
                  : isProduced(item)
                    ? `Ajustar reaproveitamento (0 a ${qtyOf(item)}) — converte entre produzidas e reaproveitadas, nas duas direções`
                    : `Reaproveitar (pula produção) — até ${remainingReuse(item)} un.`}
                data-testid={`button-reuse-card-${item.id}`}
                style={{ ...corTintada(TOM.esmeralda), ...flexSecundaria, padding: '0 10px', fontSize: FS.body }}
              >
                {isProduced(item) ? 'Ajustar reaprov.' : 'Reaproveitar'}
              </Botao>
            )
          )}
          {/* CORRIGIR REAPROVEITAMENTO — idem, espelho da tabela. */}
          {podeCorrigirReaprov && (
            correctReuseItemId === item.id ? (
              <div style={{ order: 1, flex: '1 1 100%', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }} onClick={e => e.stopPropagation()}>
                <span style={{ fontSize: 13, fontWeight: 700, color: TOM.alerta.text, whiteSpace: 'nowrap' }}>Reaprov.:</span>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min={0}
                  max={isAdmin ? qtyOf(item) : qtyOf(item) - 1}
                  value={correctReuseQty}
                  autoFocus
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => setCorrectReuseQty(Math.max(0, Math.min(isAdmin ? qtyOf(item) : qtyOf(item) - 1, parseInt(e.target.value) || 0)))}
                  aria-label="Quantidade reaproveitada corrigida"
                  data-testid={`input-correct-reuse-card-${item.id}`}
                  style={{ width: 72, minHeight: 44, padding: '0 6px', borderRadius: 8, border: `1px solid ${TOM.alerta.dot}`, fontSize: 16, fontWeight: 700, color: T.text, textAlign: 'center' }}
                />
                <span style={{ fontSize: 13, color: T.second, whiteSpace: 'nowrap' }}>de {qtyOf(item)}</span>
                <Botao
                  variante="primario"
                  tamanho="toque"
                  carregando={correctReuseMutation.isPending}
                  onClick={() => correctReuseMutation.mutate({ itemId: item.id, correctedReuseQty: correctReuseQty })}
                  data-testid={`button-correct-reuse-confirm-card-${item.id}`}
                  style={{ ...corDaAcao(TOM.alerta.text), flex: '1 1 auto' }}
                >
                  Confirmar
                </Botao>
                <Botao
                  tamanho="toque"
                  icone={X}
                  onClick={() => setCorrectReuseItemId(null)}
                  aria-label="Cancelar correção do reaproveitamento"
                  style={{ width: 44, padding: 0, flexShrink: 0 }}
                />
              </div>
            ) : (
              <Botao
                tamanho="toque"
                icone={RotateCcw}
                onClick={e => { e.stopPropagation(); if (selo) return; setCorrectReuseItemId(item.id); setCorrectReuseQty(reusedTotalOf(item)); }}
                disabled={!!selo}
                title={selo
                  ? motivoAcaoBloqueada(selo.motivo, "corrigir o reaproveitamento")
                  : "Corrigir a quantidade reaproveitada desta peça"}
                data-testid={`button-correct-reuse-card-${item.id}`}
                style={{ ...corTintada(TOM.alerta), ...flexSecundaria, padding: '0 10px', fontSize: FS.body }}
              >
                Corrigir reaprov.
              </Botao>
            )
          )}
          {/* DEVOLVER PARA A REVISÃO — contorno, saída de exceção.
              No card cabe o rótulo (não há coluna sticky
              roubando largura, que era o motivo do só-ícone na
              tabela). Sem bloqueio de evento finalizado, como lá. */}
          {podeDevolverPeca && (
            <Botao
              tamanho="toque"
              icone={Undo2}
              onClick={e => { e.stopPropagation(); setDevolverItem(item); setDevolverMotivo(""); }}
              title="Devolver para a Revisão Final — a peça sai da fila da Gráfica"
              aria-label={`Devolver ${item.displayId} para a Revisão Final`}
              data-testid={`button-devolver-revisao-card-${item.id}`}
              style={{ ...flexSecundaria, padding: '0 10px', fontSize: FS.body, color: TOM.perigo.text, borderColor: TOM.perigo.border }}
            >
              Devolver
            </Botao>
          )}
          {podeConferir && canConferItem && (
            <Botao
              variante="primario"
              tamanho="toque"
              icone={CheckCircle}
              onClick={e => { e.stopPropagation(); openConferenceModal(item); }}
              data-testid={`button-conferir-card-${item.id}`}
              {...bloqueioDaTrava(item)}
              // Ciano da etapa (TOM.ciano.text, 5,36:1 com branco) —
              // o mesmo do desktop, do lote e do modal.
              style={{ ...corDaAcao(TOM.ciano.text), ...flexPrincipal("conferir"), minHeight: 48, padding: '0 12px' }}
            >
                            {rotuloDoConferir(item)}
            </Botao>
          )}
          {/* EMBALAR (dono, 21/09): a principal da peça CONFERIDA — abre
              o painel de tubos já com a peça marcada. Azul do Embalado
              (#1d4ed8, 6,3:1 com branco). É a ÚNICA ação da conferida:
              o Entregar abaixo só existe para a entrega PARCIAL da
              peça ainda em acabamento. */}
          {podeEmbalarPeca && (
            <Botao
              variante="primario"
              tamanho="toque"
              icone={Package}
              onClick={e => { e.stopPropagation(); abrirEmbalar([item]); }}
              data-testid={`button-embalar-card-${item.id}`}
              {...bloqueioDaTrava(item)}
              style={{ ...corDaAcao(TOM.info.text), ...flexPrincipal("embalar"), minHeight: 48, padding: '0 12px' }}
            >
              {rotuloEmbalar(item)}
            </Botao>
          )}
          {/* Embalada: entregar o TUBO inteiro — o painel abre já no
              formulário daquele tubo (quem recebeu). É a PRINCIPAL da
              embalada (sólida, azul do Embalado, primeira no DOM e na
              tela — Tab e dedo chegam nela antes do "Tirar"). */}
          {entregaTubo && (
            <Botao
              variante="primario"
              tamanho="toque"
              icone={Truck}
              onClick={e => { e.stopPropagation(); setTubosDoEvento({ id: String(item.eventId), name: item.event?.name ?? "Evento", entregarTubo: item.tuboId }); }}
              data-testid={`button-entregar-tubo-card-${item.id}`}
              {...bloqueioDaTrava(item)}
              style={{ ...corDaAcao(TOM.info.text), ...flexPrincipal("entregar"), minHeight: 48, padding: '0 12px' }}
            >
              {ehAvulsa(item) ? "Entregar" : "Entregar tubo"}
            </Botao>
          )}
          {/* Embalado: tirar do tubo devolve a Conferido (21/09) — a
              secundária, de contorno, depois da principal. */}
          {podeConferir && !soVisualizaKit(item) && temVolumeAberto(item) && (
            <Botao
              tamanho="toque"
              icone={Undo2}
              onClick={e => { e.stopPropagation(); tirarDoTuboMutation.mutate({ itemId: item.id, tuboId: item.tuboId, displayId: item.displayId }); }}
              carregando={tirarDoTuboMutation.isPending && tirarDoTuboMutation.variables?.itemId === item.id}
              data-testid={`button-tirar-do-tubo-card-${item.id}`}
              style={{ ...flexSecundaria, minHeight: 48, padding: '0 12px' }}
            >
              {ehAvulsa(item) ? "Desfazer embalagem" : "Tirar do tubo"}
            </Botao>
          )}
          {isDelivered(item) && (
            <span style={{ order: 0, flex: '1 1 auto', minHeight: 32, fontSize: FS.read, color: TOM.sucesso.text, display: 'flex', alignItems: 'center', gap: 4, fontWeight: FW.forte }}>
              <Check aria-hidden="true" style={{ width: 13, height: 13 }} /> Entregue
            </span>
          )}

          {/* Divisor entre FLUXO e CONTRATO. Só existe quando há
              botão dos dois lados — para a Solicitação o grupo de
              fluxo costuma estar vazio e "Aumentar" fica sozinho
              no trilho inteiro, com salência máxima e sem truque. */}
          {temGrupoFluxo && temGrupoContrato && (
            <div aria-hidden="true" style={{ order: 2, width: 1, alignSelf: 'stretch', background: T.border, margin: '2px 0' }} />
          )}

          {/* AUMENTAR — o gatilho primário do celular. Tintado (não
              sólido): não é etapa do fluxo de produção, é mudança
              de contrato. Papel admin|solicitacao. */}
          {mostraAumentar && (
            <Botao
              tamanho="toque"
              icone={PlusCircle}
              onClick={e => { e.stopPropagation(); if (!selo) abrirComplemento(item); }}
              disabled={!!selo}
              // Só o ícone (decisão do dono); o aria-label carrega o
              // significado e o alvo continua com 44px.
              aria-label={`Aumentar a quantidade de ${item.displayId} — cria uma peça complementar`}
              data-testid={`button-aumentar-quantidade-mobile-${item.id}`}
              title={selo ? motivoAcaoBloqueada(selo.motivo, "aumentar a quantidade") : "Aumentar quantidade"}
              style={{ ...corTintada(TOM.laranja), order: 3, width: 44, padding: 0, flexShrink: 0 }}
            />
          )}
          {/* Cancelar complemento criado por engano — dois toques
              (o segundo confirma), nunca destrutivo de primeira.
              Alvo de 44px: os 36 de antes reprovavam a régua da
              casa justo num botão destrutivo. */}
          {podeCancelarCompl && (
            <Botao
              // Segundo toque = destrutivo de verdade (apaga o
              // complemento): só então vira `perigo`.
              variante={cancelComplementId === item.id ? "perigo" : "secundario"}
              tamanho="toque"
              icone={Trash2}
              carregando={cancelComplementMutation.isPending}
              onClick={e => {
                e.stopPropagation();
                if (cancelComplementId === item.id) cancelComplementMutation.mutate({ itemId: item.id, displayId: item.displayId });
                else setCancelComplementId(item.id);
              }}
              title={`Cancelar ${item.displayId} — só enquanto nada foi produzido`}
              data-testid={`button-cancel-complement-mobile-${item.id}`}
              style={{ ...flexSecundaria, order: 3, padding: '0 10px', fontSize: FS.body, ...(cancelComplementId === item.id ? null : { color: TOM.perigo.text }) }}
            >
              {cancelComplementMutation.isPending ? 'Cancelando…' : cancelComplementId === item.id ? 'Confirmar?' : 'Cancelar'}
            </Botao>
          )}
          {/* POR QUE O BOTÃO ESTÁ CINZA — no toque. O motivo
              morava no `title` dos botões desabilitados, e no
              celular/tablet o `title` não existe: tocar num botão
              cinza não fazia nada e não dizia nada. A frase sai
              do mesmo selo (lib/status) e só aparece quando há
              botão barrado neste card. */}
          {selo && (podeProduzirAqui || podeProduzirPeca || podeReaproveitarPeca || podeCorrigirReaprov || mostraAumentar) && (
            <p data-testid={`motivo-bloqueio-card-${item.id}`} style={{ order: 4, flex: '1 1 100%', margin: 0, fontSize: 12, color: T.apoio, lineHeight: 1.4 }}>
              {selo.motivo === 'encerrado'
                ? 'Evento encerrado por um administrador: aqui só conferir e entregar. Reabrir o evento libera o resto.'
                : 'Evento já realizado: aqui só conferir e entregar — produzir, reaproveitar e aumentar ficam bloqueados.'}
            </p>
          )}
        </div>
      )}
    </>
  );
}
