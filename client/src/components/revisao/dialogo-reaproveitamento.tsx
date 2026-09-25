// O diálogo de REAPROVEITAMENTO de uma peça: tudo (pula a produção) ou parte
// das unidades (o resto segue para produção). Com a solicitação ao estoque
// ligada, confirmar vira um pedido à Gráfica, e o "aplicar agora" fica só
// para o admin.
//
// É um Dialog do Radix (e não um overlay montado à mão): Esc, armadilha de
// foco, foco devolvido ao fechar e página travada por baixo.
import { Recycle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { AplicarAgoraNoModal, PedirAoEstoque } from "@/components/consulta-de-estoque/na-revisao";
import { alvo } from "@/hooks/use-mobile";
import { letra, rodapeDaConfirmacao } from "./estilos";
import { arquivoFinalOk } from "@shared/molde";
import { SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
import { T, TOM, FS, R } from "@/lib/theme";
import type { PecaDaRevisao } from "./tipos";

export function DialogoReaproveitamento({
  itemId, pendingItems, dedo, isMobile, admin, partialReuseQty, setPartialReuseQty,
  ocupado, salvandoParte, aoFechar, aoReaproveitarTudo, aoReaproveitarParte,
}: {
  itemId: string | null;
  pendingItems: PecaDaRevisao[];
  dedo: boolean;
  isMobile: boolean;
  admin: boolean;
  partialReuseQty: number;
  setPartialReuseQty: (n: number) => void;
  /** Uma das duas mutações de reaproveitamento em curso. */
  ocupado: boolean;
  salvandoParte: boolean;
  aoFechar: () => void;
  aoReaproveitarTudo: (item: PecaDaRevisao) => void;
  aoReaproveitarParte: (item: PecaDaRevisao) => void;
}) {
  return (
    <Dialog open={!!itemId} onOpenChange={o => { if (!o) aoFechar(); }}>
      <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(420)}>
        {/* POR QUE congelar aqui: o corpo inteiro é derivado do id (e a peça
            vem de `pendingItems`, que as invalidações do onSuccess recarregam).
            Ao confirmar, o id vira null, a busca não acha nada e o modal ficaria
            LITERALMENTE VAZIO durante toda a animação de saída. */}
        <FreezeWhileClosing open={!!itemId}>
        {(() => {
          const dialogItem = pendingItems.find(i => i.id === itemId);
          if (!dialogItem) return null;
          const qty = Number(dialogItem.quantity) || 1;
          return (
            <>
              <DialogTitle className="sr-only">Reaproveitamento</DialogTitle>
              <DialogDescription className="sr-only">
                Escolha reaproveitar todas as unidades ou apenas parte delas
              </DialogDescription>
              <ModalHeader
                variant="confirm"
                compacto={isMobile}
                icon={Recycle}
                tint={TOM.sucesso.text}
                title="Reaproveitamento"
                subtitle={`${dialogItem.displayId} · ${dialogItem.type} · ${qty} un.`}
                onClose={aoFechar}
              />
              {/* O corpo rola: o `modalSurface` traz teto COM `overflow:
                  hidden`, e a segunda opção só aparece quando a quantidade é
                  maior que 1 — o corpo é elástico. */}
              <div style={{ padding: isMobile ? "14px 16px 16px" : "20px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>

                {/* PEDIR AO ESTOQUE: com a chave LIGADA, confirmar aqui não
                    aplica o reaproveitamento na hora — vira uma solicitação para
                    a Gráfica, que atende, atende em parte ou não consegue. A
                    resposta volta para a ficha desta peça. Chave DESLIGADA:
                    nada disto aparece. */}
                {SOLICITACAO_AO_ESTOQUE_ATIVA && (
                  <PedirAoEstoque key={dialogItem.id} item={dialogItem} onPedido={aoFechar} />
                )}

                {/* APLICAR AGORA — o fluxo NORMAL de reaproveitar. Chave
                    desligada: as duas opções de sempre, direto no modal. Ligada:
                    só o admin, atrás de "Já conferi no estoque — aplicar agora". */}
                <AplicarAgoraNoModal admin={admin}>

                  {/* Opção: reaproveitar tudo — a ação principal deste modal. */}
                  <Botao
                    variante="primario"
                    tamanho={dedo || isMobile ? "toque" : "md"}
                    larguraCheia
                    icone={Recycle}
                    onClick={() => aoReaproveitarTudo(dialogItem)}
                    disabled={ocupado}
                    style={{ marginBottom: 10, height: 44 }}
                  >
                    Reaproveitar tudo ({qty} un.) — pula produção
                  </Botao>

                  {/* Opção: reaproveitar parcialmente (só aparece se qty > 1) */}
                  {qty > 1 && (
                    <div style={{ border: `1px solid ${T.border}`, borderRadius: R.md, padding: "14px 16px" }}>
                      <p style={{ margin: "0 0 10px", fontSize: letra(FS.small, isMobile), fontWeight: 700, color: T.apoio, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Reaproveitar parcialmente
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <input
                          type="number"
                          min={1}
                          max={qty - 1}
                          value={partialReuseQty}
                          onChange={e => setPartialReuseQty(Math.max(1, Math.min(qty - 1, parseInt(e.target.value) || 1)))}
                          aria-label="Unidades reaproveitadas"
                          data-testid="input-partial-reuse-qty"
                          style={{ width: 64, height: alvo(34, dedo || isMobile), padding: "0 8px", borderRadius: R.sm, border: `1px solid ${T.bdark}`, fontSize: dedo || isMobile ? FS.lead : FS.strong, fontWeight: 700, textAlign: "center" }}
                        />
                        <span style={{ fontSize: FS.body, color: T.second }}>de {qty} un. reaproveitadas</span>
                      </div>
                      <p style={{ margin: "0 0 10px", fontSize: letra(FS.small, isMobile), color: T.apoio }}>
                        As outras <strong>{qty - partialReuseQty}</strong> un. seguirão para produção normal.
                      </p>
                      {/* O parcial LIBERA o restante para produção — e produção
                          pede arquivo final. Dito aqui, antes do 409 do
                          servidor; é também o motivo visível do botão apagado. */}
                      {!arquivoFinalOk(dialogItem) && (
                        <p role="status" data-testid="aviso-parcial-sem-arquivo" style={{ margin: "0 0 10px", fontSize: FS.meta, lineHeight: 1.45, color: TOM.alerta.text, backgroundColor: TOM.alerta.bg, border: `1px solid ${TOM.alerta.border}`, borderRadius: R.sm, padding: "6px 10px" }}>
                          Sem arquivo final da Arte: o parcial manda o restante para a Gráfica, que precisa do arquivo. Espere a Arte enviar, ou reaproveite tudo.
                        </p>
                      )}
                      <Botao
                        variante="secundario"
                        tamanho={dedo || isMobile ? "toque" : "md"}
                        larguraCheia
                        carregando={salvandoParte}
                        onClick={() => {
                          if (!arquivoFinalOk(dialogItem)) return;
                          aoReaproveitarParte(dialogItem);
                        }}
                        disabled={ocupado || !arquivoFinalOk(dialogItem)}
                      >
                        {salvandoParte ? "Salvando..." : `Confirmar ${partialReuseQty} un. reaproveitadas`}
                      </Botao>
                    </div>
                  )}
                </AplicarAgoraNoModal>

              </div>
              {/* Cancelar no rodapé, como nas outras confirmações da tela (e
                  com o recorte seguro no celular) — no fim do corpo ele rolava
                  junto e, com o parcial aberto, sumia abaixo da dobra. */}
              <div style={rodapeDaConfirmacao(isMobile)}>
                <Botao
                  variante="fantasma"
                  tamanho={dedo || isMobile ? "toque" : "md"}
                  onClick={aoFechar}
                  data-testid="button-reuse-dialog-cancel"
                >
                  Cancelar
                </Botao>
              </div>
            </>
          );
        })()}
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
