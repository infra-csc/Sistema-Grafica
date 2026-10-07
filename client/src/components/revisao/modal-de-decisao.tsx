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
// NO CELULAR (revisão de 25/09) a casca muda em três pontos, todos para a
// decisão caber na primeira dobra: o cabeçalho fica enxuto (sem o ladrilho do
// ícone, título menor); a FILA (anterior · 3 de 12 · próxima) desce para uma
// tira própria logo abaixo dele — no cabeçalho, com o X e os selos, o título
// sobrava com ~90px e quebrava em quatro linhas; e LIBERAR e DEVOLVER moram
// num RODAPÉ FIXO, com o recorte seguro embaixo — no corpo ficavam a ~700px
// de rolagem.
//
// Tudo o que está dentro do FreezeWhileClosing recebe o que mostra por props
// (nenhum filho chama hook de dado): congelado, o miolo fica exatamente como
// estava no último render aberto.
// ─────────────────────────────────────────────────────────────────────────────
import { Fragment, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Truck } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SeloKit } from "@/components/kit/selo-kit";
import { Selo } from "@/components/ui/selo";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { alvo } from "@/hooks/use-mobile";
import { T, N, FS, R, FONT } from "@/lib/theme";
import { TI, prontaParaLiberar } from "./regras";
import { FichaComparacao } from "./ficha-comparacao";
import { FichaMetadados } from "./ficha-metadados";
import { BotoesDoRodape, FichaDecisao } from "./ficha-decisao";
import type { FichaDecisaoProps } from "./ficha-decisao";
import { FichaHistorico } from "./ficha-historico";
import type { RegistroDoHistorico } from "./tipos";

type PropsDaMetadados = Parameters<typeof FichaMetadados>[0];

export type ModalDeDecisaoProps = FichaDecisaoProps & Omit<PropsDaMetadados, "selectedItem" | "isMobile" | "dedo" | "fonteDeCampo" | "seloSelecionado"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aoFechar: () => void;
  subtitulo: string | undefined;
  /** O evento com a saída do caminhão — no celular desce para a tira da fila. */
  eventoDaFicha?: string;
  /** Posição da peça na lista filtrada (-1 = fora dela). */
  filaIdx: number;
  totalNaFila: number;
  temAnterior: boolean;
  temProxima: boolean;
  irParaFila: (idx: number) => void;
  historicoCarregando: boolean;
  itemAuditLogs: RegistroDoHistorico[];
};

/**
 * ── A FILA: anterior · posição · próxima ──
 * O trabalho é uma fila: sem isto, decidir fecha o modal e é preciso achar a
 * próxima na tabela — que mudou entre uma e outra (a peça decidida saiu
 * dela). No desktop mora no cabeçalho escuro (setas `claroFantasma`, as
 * claras da casa para fundo escuro); no celular, numa tira clara logo abaixo
 * dele, com as setas de 44px.
 */
function NavDaFila({ sobreEscuro, dedo, filaIdx, totalNaFila, temAnterior, temProxima, irParaFila }: {
  sobreEscuro: boolean;
  dedo: boolean;
  filaIdx: number;
  totalNaFila: number;
  temAnterior: boolean;
  temProxima: boolean;
  irParaFila: (idx: number) => void;
}) {
  const lado = alvo(32, dedo || !sobreEscuro);
  const seta = { width: lado, minWidth: lado, height: lado, minHeight: lado, padding: 0 };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: sobreEscuro ? 2 : 6, flexShrink: 0 }}>
      <Botao
        variante={sobreEscuro ? "claroFantasma" : "secundario"}
        icone={ChevronLeft}
        tamanhoDoIcone={16}
        onClick={() => irParaFila(filaIdx - 1)}
        disabled={!temAnterior}
        title="Peça anterior (←)"
        aria-label="Peça anterior"
        data-testid="button-modal-prev"
        style={seta}
      />
      <span
        data-testid="text-queue-position"
        aria-live="polite"
        style={{ fontFamily: FONT.mono, fontSize: sobreEscuro ? FS.meta : FS.body, fontWeight: 700, color: sobreEscuro ? "rgba(255,255,255,0.85)" : T.strong, padding: "0 6px", whiteSpace: "nowrap" }}
      >
        {filaIdx + 1} / {totalNaFila}
      </span>
      <Botao
        variante={sobreEscuro ? "claroFantasma" : "secundario"}
        icone={ChevronRight}
        tamanhoDoIcone={16}
        onClick={() => irParaFila(filaIdx + 1)}
        disabled={!temProxima}
        title="Próxima peça (→)"
        aria-label="Próxima peça"
        data-testid="button-modal-next"
        style={seta}
      />
    </div>
  );
}

/**
 * A JANELA NÃO COMPORTA A FAIXA DE DECISÃO EM DUAS COLUNAS? Abaixo de 1200px o
 * modal tem menos de ~1100 de largura, e a metade esquerda da faixa (onde
 * moram "Liberar para produção", "Devolver para Arte" e "Reaproveitar", ~510px
 * lado a lado) cortava os rótulos com reticência — a 768 e a 1024 (tablet,
 * notebook) o Liberar saía "Liberar para pro…". Aí a faixa empilha: decisão
 * em largura cheia, patrocinadores e histórico embaixo.
 */
const LARGURA_PARA_DUAS_COLUNAS = 1200;
/** Monitor largo: a ficha cresce (1680) e as artes crescem com ela. */
const LARGURA_DE_MONITOR_LARGO = 1600;
function useLarguraDaJanela() {
  const medir = () => (typeof window === "undefined" ? 1280 : window.innerWidth);
  const [largura, setLargura] = useState(medir);
  useEffect(() => {
    const aoMudar = () => setLargura(medir());
    window.addEventListener("resize", aoMudar);
    return () => window.removeEventListener("resize", aoMudar);
  }, []);
  return largura;
}

export function ModalDeDecisao(p: ModalDeDecisaoProps) {
  const { open, isMobile, dedo, selectedItem, filaIdx, totalNaFila, temAnterior, temProxima, irParaFila } = p;
  const largura = useLarguraDaJanela();
  const colunaDaDecisao = useRef<HTMLElement>(null);
  const empilhada = largura < LARGURA_PARA_DUAS_COLUNAS || isMobile;
  /**
   * AS ARTES SÃO O HERÓI (02/10, pedido do dono). A ficha empilhava cinco
   * faixas, e na conta para a decisão caber sem rolar a comparação ficava no
   * piso — ~140px de arte a 1366×768, numa tela que existe para COMPARAR.
   *   · LADO A LADO (≥1200): as duas artes à esquerda, ocupando toda a altura
   *     útil; a decisão numa COLUNA à direita, com rolagem própria — sempre à
   *     vista, sem disputar altura com a comparação.
   *   · EMPILHADA (tablet, notebook estreito, celular): o corpo rola com as
   *     artes grandes no topo, e Liberar/Devolver moram num RODAPÉ FIXO.
   */
  const lado = !empilhada;
  const largo = largura >= LARGURA_DE_MONITOR_LARGO;
  const larguraDaColuna = largo ? 420 : 380;
  const temFila = filaIdx >= 0 && totalNaFila > 1;
  const nav = temFila ? (
    <NavDaFila
      sobreEscuro={!isMobile}
      dedo={dedo}
      filaIdx={filaIdx}
      totalNaFila={totalNaFila}
      temAnterior={temAnterior}
      temProxima={temProxima}
      irParaFila={irParaFila}
    />
  ) : null;
  return (
    <Dialog open={open} onOpenChange={p.onOpenChange}>
      {/* Casca da casa (`modalSurface`), com a ALTURA de tela de trabalho por
          cima: a revisão ocupa ~87vh no desktop (94dvh no celular) mesmo com
          pouco conteúdo — a comparação é a faixa que cresce, e o teto de 900
          segura o monitor alto. */}
      <DialogContent
        data-testid="modal-revisao"
        className={`gap-0 ${HIDE_NATIVE_CLOSE}`}
        style={{ ...modalSurface(largo ? 1680 : 1280), height: isMobile ? "94dvh" : "90vh", maxHeight: largo ? 1040 : 900 }}
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
          icon={isMobile ? undefined : Eye}
          tint={T.accentText}
          compacto={isMobile}
          title={`${selectedItem?.displayId ?? ""} · ${selectedItem?.type ?? ""}`}
          // No celular só a descrição: com o evento junto, o subtítulo
          // ocupava quatro linhas do cabeçalho escuro. O evento desce para a
          // tira logo abaixo, ao lado da fila.
          subtitle={isMobile ? (selectedItem?.description || undefined) : p.subtitulo}
          onClose={p.aoFechar}
          trailing={
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {selectedItem && <SeloKit peca={selectedItem} style={{ flexShrink: 0 }} />}
              {/* No celular o selo sai: o aviso verde do corpo diz o mesmo, e
                  aqui ele roubava a largura do título. */}
              {selectedItem?.isReuse && !isMobile && (
                <Selo tom="sucesso" tamanho="sm" style={{ flexShrink: 0 }}>Reaproveitamento</Selo>
              )}
              {!isMobile && nav}
            </div>
          }
        />

        {/* A FILA NO CELULAR: uma tira clara, fora da rolagem — com o
            EVENTO e o caminhão à esquerda (era "Peça da fila", um rótulo que
            não dizia nada que as setas já não dissessem). */}
        {isMobile && (nav || p.eventoDaFicha) && (
          <div data-testid="fila-da-ficha-celular" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 56, padding: "6px 12px", backgroundColor: T.surface, borderBottom: `1px solid ${T.border}` }}>
            <span style={{ display: "flex", alignItems: "flex-start", gap: 6, minWidth: 0, fontSize: FS.meta, lineHeight: 1.35, fontWeight: 600, color: T.apoio }}>
              {p.eventoDaFicha ? (
                <>
                  <Truck aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
                  {/* Nome numa linha, a saída do caminhão noutra: corrido,
                      o texto quebrava em três linhas ao lado das setas. */}
                  <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                    {(() => {
                      const [nome, ...resto] = p.eventoDaFicha.split(" · caminhão ");
                      return (
                        <>
                          <span style={{ display: "block", fontWeight: 700, color: T.strong }}>{nome}</span>
                          {resto.length > 0 && <span style={{ display: "block", fontWeight: 500 }}>caminhão {resto.join(" · caminhão ")}</span>}
                        </>
                      );
                    })()}
                  </span>
                </>
              ) : "Peça da fila"}
            </span>
            {nav}
          </div>
        )}

        {(() => {
          const comparacao = (
            <FichaComparacao selectedItem={selectedItem} isMobile={isMobile} dedo={dedo} modo={isMobile ? "celular" : lado ? "lado" : "empilhada"} />
          );
          const metadados = (
            <FichaMetadados
              selectedItem={selectedItem}
              isMobile={isMobile}
              estreita={!isMobile && !largo}
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
          );
          const historico = (
            <FichaHistorico
              selectedItem={selectedItem}
              isMobile={isMobile}
              empilhado
              historicoCarregando={p.historicoCarregando}
              itemAuditLogs={p.itemAuditLogs}
            />
          );
          return lado ? (
            // ── LADO A LADO: as artes à esquerda, a decisão à direita ──
            // Nada rola no conjunto: a esquerda dá às artes toda a altura que
            // sobra dos metadados; a coluna da decisão rola sozinha, com
            // Liberar/Devolver/Reaproveitar no topo dela — sempre à vista.
            <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex" }}>
              {/* A RODA DO MOUSE em cima das artes rola a coluna da decisão
                  (dono, 07/10: "não consigo descer a tela nessa parte do
                  meio — a barra de rolagem só aparece no cantinho direito").
                  A esquerda não rola (as artes ocupam a altura), então a
                  roda ali não fazia nada e o campo de observação, lá embaixo
                  na coluna da direita, parecia inalcançável. */}
              <div
                data-testid="coluna-das-artes"
                onWheel={(e) => { if (!e.ctrlKey && colunaDaDecisao.current) colunaDaDecisao.current.scrollBy({ top: e.deltaY }); }}
                style={{ flex: "1 1 auto", minWidth: 0, display: "flex", flexDirection: "column" }}
              >
                {comparacao}
                {metadados}
              </div>
              {/* ── 4 · DECISÃO — coluna clara à direita, rolagem própria ── */}
              <aside
                ref={colunaDaDecisao}
                data-testid="coluna-da-decisao"
                aria-label="Decisão"
                style={{ flex: `0 0 ${larguraDaColuna}px`, minWidth: 0, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", borderLeft: `1px solid ${T.border}`, backgroundColor: T.bg, padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 20 }}
              >
                <FichaDecisao {...p} emColuna />
                {historico}
              </aside>
            </div>
          ) : (
            // ── EMPILHADA: o corpo rola, as artes grandes no topo ──
            // Liberar e Devolver no rodapé fixo, logo abaixo.
            <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column" }}>
              {comparacao}
              {metadados}
              <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, padding: isMobile ? 12 : "16px 20px", display: "flex", flexDirection: "column", gap: isMobile ? 16 : 20 }}>
                <FichaDecisao {...p} botoesNoRodape empilhado />
                {historico}
              </div>
            </div>
          );
        })()}

        {/* ── ATALHOS: só no lado a lado (mouse e teclado) — no celular e no
            tablet não há teclado físico, e a faixa roubava altura das artes. */}
        {lado && (
          <div style={{ padding: "10px 20px", backgroundColor: T.bg, borderTop: `1px solid ${N.n3}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: FS.micro, fontWeight: 700, color: TI.secondary, textTransform: "uppercase", letterSpacing: "0.08em" }}>Atalhos:</span>
              {([
                // A confirmação abre com o foco no "Liberar": Enter de
                // novo confirma. Dito aqui para ninguém procurar o mouse.
                // SÓ O QUE FUNCIONA NESTA PEÇA: o atalho se cala sem arquivo
                // final e em evento finalizado (a mesma checagem do handler,
                // na página) — anunciar "Enter liberar" com o Liberar
                // apagado era prometer o que a tecla não faz.
                ...(!p.seloSelecionado && selectedItem && prontaParaLiberar(selectedItem) ? [["Enter", "liberar (Enter de novo confirma)"] as const] : []),
                ...(!p.seloSelecionado ? [["D", "devolver"] as const] : []),
                ...(temFila ? [["← →", "peça anterior / próxima"] as const] : []),
                ["Esc", "fechar"] as const,
              ] as Array<readonly [string, string]>).map(([tecla, oque]) => (
                <Fragment key={tecla}>
                  <kbd style={{ fontFamily: "inherit", fontSize: FS.micro, fontWeight: 900, backgroundColor: T.border, padding: "2px 6px", borderRadius: R.sm, color: TI.text, whiteSpace: "nowrap" }}>{tecla}</kbd>
                  <span style={{ fontSize: FS.micro, color: TI.secondary, whiteSpace: "nowrap" }}>{oque}</span>
                </Fragment>
              ))}
            </div>
          </div>
        )}

        {/* ── RODAPÉ FIXO DA DECISÃO (celular e tablet) ──
            Liberar e Devolver sempre à vista, na zona do polegar, com o recorte
            seguro embaixo. LONGOS: o atalho com env() some no parser do jsdom. */}
        {!lado && (
          <div
            data-testid="rodape-da-decisao"
            style={{ flexShrink: 0, paddingTop: 10, paddingLeft: isMobile ? 12 : 20, paddingRight: isMobile ? 12 : 20, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface, boxShadow: "0 -4px 16px rgba(28,25,23,0.06)" }}
          >
            <BotoesDoRodape {...p} rotulosLongos={!isMobile} />
          </div>
        )}
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
