// ─────────────────────────────────────────────────────────────────────────────
// A FICHA DE DECISÃO: o modal onde a Revisão Final compara e decide.
//
// CINCO FAIXAS HORIZONTAIS, LARGURA CHEIA — não há divisão esquerda/direita no
// nível do modal (a coluna estreita de antes era a causa dos botões se
// sobrepondo e dos metadados cortados pela borda):
//
//   1 · cabeçalho escuro (identidade da peça + fila + X)
//   2 · comparação — dois panes lado a lado, LARGURA CHEIA  (ficha-comparacao)
//   3 · metadados numa linha                                (ficha-metadados)
//   4 · decisão — botões + observações | patrocinadores/histórico
//   5 · rodapé de atalhos
//
// Só a faixa 2 flexiona (flex: 1 1 auto, piso 200px); as outras têm
// flexShrink: 0 — numa janela de 540px de altura, a comparação e os botões
// estão visíveis sem rolar.
//
// Tudo o que está dentro do FreezeWhileClosing recebe o que mostra por props
// (nenhum filho chama hook de dado): congelado, o miolo fica exatamente como
// estava no último render aberto.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SeloKit } from "@/components/kit/selo-kit";
import { Selo } from "@/components/ui/selo";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { alvo } from "@/hooks/use-mobile";
import { T, N, FS, R, FONT } from "@/lib/theme";
import { TI } from "./regras";
import { FichaComparacao } from "./ficha-comparacao";
import { FichaMetadados } from "./ficha-metadados";
import { FichaDecisao } from "./ficha-decisao";
import type { FichaDecisaoProps } from "./ficha-decisao";
import { FichaHistorico } from "./ficha-historico";
import type { RegistroDoHistorico } from "./tipos";

type PropsDaMetadados = Parameters<typeof FichaMetadados>[0];

export type ModalDeDecisaoProps = FichaDecisaoProps & Omit<PropsDaMetadados, "selectedItem" | "isMobile" | "dedo" | "fonteDeCampo" | "seloSelecionado"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aoFechar: () => void;
  subtitulo: string | undefined;
  /** Posição da peça na lista filtrada (-1 = fora dela). */
  filaIdx: number;
  totalNaFila: number;
  temAnterior: boolean;
  temProxima: boolean;
  irParaFila: (idx: number) => void;
  historicoCarregando: boolean;
  itemAuditLogs: RegistroDoHistorico[];
};

export function ModalDeDecisao(p: ModalDeDecisaoProps) {
  const { open, isMobile, dedo, selectedItem, filaIdx, totalNaFila, temAnterior, temProxima, irParaFila } = p;
  return (
    <Dialog open={open} onOpenChange={p.onOpenChange}>
      {/* Casca da casa (`modalSurface`), com a ALTURA de tela de trabalho por
          cima: a revisão ocupa ~87vh no desktop (94dvh no celular) mesmo com
          pouco conteúdo — a comparação é a faixa que cresce, e o teto de 900
          segura o monitor alto. */}
      <DialogContent
        data-testid="modal-revisao"
        className={`gap-0 ${HIDE_NATIVE_CLOSE}`}
        style={{ ...modalSurface(1152), height: isMobile ? "94dvh" : "87vh", maxHeight: 900 }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* POR QUE congelar aqui: é o pior onSuccess da tela. Liberar (ou
            devolver) invalida a lista, fecha este modal, fecha a confirmação
            E faz `setSelectedItem(null)` — tudo no mesmo commit. `selectedItem`
            é a fonte de TODO o miolo: sem congelar, o modal esvazia (thumb, ID,
            tipo, patrocinadores, histórico) no primeiro frame do fade, e cada
            render da janela de saída ainda manda desanexa+reanexa de ref para a
            subárvore em desmontagem — o laço do React #185. Mecanismo por
            extenso em components/modal-shell.tsx. */}
        <FreezeWhileClosing open={open}>
        <DialogTitle className="sr-only">Decisão de Revisão</DialogTitle>
        <DialogDescription className="sr-only">
          Compare o thumb aprovado pelo patrocinador com o arquivo final da Arte e libere ou devolva a peça
        </DialogDescription>
        {/* ── 1 · CABEÇALHO — a casca da casa (`ModalHeader` work) ──
            Identidade da peça no título, descrição e caminhão no subtítulo
            (que QUEBRA linha em vez de cortar com reticências), e a fila à
            direita. O X é o do próprio ModalHeader. */}
        <ModalHeader
          variant="work"
          icon={Eye}
          tint={T.accentText}
          title={`${selectedItem?.displayId ?? ""} · ${selectedItem?.type ?? ""}`}
          subtitle={p.subtitulo}
          onClose={p.aoFechar}
          trailing={
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {selectedItem && <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />}
              {selectedItem?.isReuse && (
                <Selo tom="sucesso" tamanho="sm" style={{ flexShrink: 0 }}>Reaproveitamento</Selo>
              )}
              {/* ── A FILA mora no cabeçalho, não no corpo ──
                  O trabalho é uma fila: sem isto, decidir fecha o modal e é
                  preciso achar a próxima na tabela — que mudou entre uma e
                  outra (a peça decidida saiu dela). */}
              {filaIdx >= 0 && totalNaFila > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => irParaFila(filaIdx - 1)}
                    disabled={!temAnterior}
                    title="Peça anterior (←)"
                    aria-label="Peça anterior"
                    data-testid="button-modal-prev"
                    style={{ width: alvo(32, dedo), height: alvo(32, dedo), borderRadius: R.md, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: temAnterior ? T.surface : "rgba(255,255,255,0.35)", cursor: temAnterior ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                  >
                    <ChevronLeft style={{ width: 15, height: 15 }} />
                  </button>
                  <span
                    data-testid="text-queue-position"
                    aria-live="polite"
                    style={{ fontFamily: FONT.mono, fontSize: FS.meta, fontWeight: 700, color: "rgba(255,255,255,0.85)", padding: "0 6px", whiteSpace: "nowrap" }}
                  >
                    {filaIdx + 1} / {totalNaFila}
                  </span>
                  <button
                    type="button"
                    onClick={() => irParaFila(filaIdx + 1)}
                    disabled={!temProxima}
                    title="Próxima peça (→)"
                    aria-label="Próxima peça"
                    data-testid="button-modal-next"
                    style={{ width: alvo(32, dedo), height: alvo(32, dedo), borderRadius: R.md, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: temProxima ? T.surface : "rgba(255,255,255,0.35)", cursor: temProxima ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                  >
                    <ChevronRight style={{ width: 15, height: 15 }} />
                  </button>
                </div>
              )}
            </div>
          }
        />

        {/* O CORPO ROLA. No desktop a conta das faixas foi feita para caber e
            a barra nem aparece; numa janela baixa, ou no celular, o excesso
            ROLA em vez de ser cortado em silêncio. O cabeçalho fica fora da
            rolagem, então a fila e o X continuam à mão. */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
          <FichaComparacao selectedItem={selectedItem} isMobile={isMobile} />

          <FichaMetadados
            selectedItem={selectedItem}
            isMobile={isMobile}
            dedo={dedo}
            fonteDeCampo={p.fonteDeCampo}
            seloSelecionado={p.seloSelecionado}
            editingQuantity={p.editingQuantity}
            setEditingQuantity={p.setEditingQuantity}
            quantityValue={p.quantityValue}
            setQuantityValue={p.setQuantityValue}
            quantityInputRef={p.quantityInputRef}
            salvandoQuantidade={p.salvandoQuantidade}
            aoSalvarQuantidade={p.aoSalvarQuantidade}
            aoCopiarCaminho={p.aoCopiarCaminho}
          />

          {/* ── 4 · DECISÃO — faixa clara, largura cheia ──
              Nada de caixa escura em volta dos botões: o escuro é do
              cabeçalho. À esquerda os botões LADO A LADO com as observações
              abaixo; à direita patrocinadores e histórico. As duas colunas com
              teto de 32vh e rolagem própria — sem o teto elas crescem até a
              altura do conteúdo e o modal inteiro passa a rolar, deixando as
              decisões fora de vista na abertura. Rótulos em caixa normal: em
              maiúsculas espaçadas eles não cabiam lado a lado. */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, padding: isMobile ? 12 : "14px 20px", display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 24 }}>
            <FichaDecisao {...p} />
            <FichaHistorico
              selectedItem={selectedItem}
              isMobile={isMobile}
              historicoCarregando={p.historicoCarregando}
              itemAuditLogs={p.itemAuditLogs}
            />
          </div>

          {/* ── 5 · RODAPÉ de atalhos: só no desktop — no mobile não há
              teclado físico e o rodapé roubava altura do modal. */}
          {!isMobile && (
            <div style={{ padding: "12px 20px", backgroundColor: T.bg, borderTop: `1px solid ${N.n3}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: FS.micro, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Atalhos:</span>
                {([
                  // A confirmação abre com o foco no "Liberar": Enter de
                  // novo confirma. Dito aqui para ninguém procurar o mouse.
                  ["Enter", "liberar (Enter de novo confirma)"],
                  ["D", "devolver"],
                  ["← →", "peça anterior / próxima"],
                  ["Esc", "fechar"],
                ] as const).map(([tecla, oque]) => (
                  <Fragment key={tecla}>
                    <kbd style={{ fontFamily: "inherit", fontSize: FS.micro, fontWeight: 900, backgroundColor: T.border, padding: "2px 6px", borderRadius: R.sm, color: TI.text, whiteSpace: "nowrap" }}>{tecla}</kbd>
                    <span style={{ fontSize: FS.micro, color: TI.secondary, whiteSpace: "nowrap" }}>{oque}</span>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
