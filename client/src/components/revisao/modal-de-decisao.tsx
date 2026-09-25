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
import { Fragment, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SeloKit } from "@/components/kit/selo-kit";
import { Selo } from "@/components/ui/selo";
import { Botao } from "@/components/ui/botao";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE, FreezeWhileClosing } from "@/components/modal-shell";
import { alvo } from "@/hooks/use-mobile";
import { T, N, FS, R, FONT } from "@/lib/theme";
import { TI } from "./regras";
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
function useFaixaEmpilhada() {
  const medir = () => typeof window !== "undefined" && window.innerWidth < LARGURA_PARA_DUAS_COLUNAS;
  const [empilhada, setEmpilhada] = useState(medir);
  useEffect(() => {
    const aoMudar = () => setEmpilhada(medir());
    window.addEventListener("resize", aoMudar);
    return () => window.removeEventListener("resize", aoMudar);
  }, []);
  return empilhada;
}

export function ModalDeDecisao(p: ModalDeDecisaoProps) {
  const { open, isMobile, dedo, selectedItem, filaIdx, totalNaFila, temAnterior, temProxima, irParaFila } = p;
  const empilhada = useFaixaEmpilhada() || isMobile;
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
          icon={isMobile ? undefined : Eye}
          tint={T.accentText}
          compacto={isMobile}
          title={`${selectedItem?.displayId ?? ""} · ${selectedItem?.type ?? ""}`}
          subtitle={p.subtitulo}
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

        {/* A FILA NO CELULAR: uma tira clara, fora da rolagem. */}
        {isMobile && nav && (
          <div data-testid="fila-da-ficha-celular" style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 12px", backgroundColor: T.surface, borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: FS.meta, fontWeight: 700, color: T.apoio }}>Peça da fila</span>
            {nav}
          </div>
        )}

        {/* O CORPO ROLA. No desktop a conta das faixas foi feita para caber e
            a barra nem aparece; numa janela baixa, ou no celular, o excesso
            ROLA em vez de ser cortado em silêncio. O cabeçalho fica fora da
            rolagem, então a fila e o X continuam à mão. */}
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column" }}>
          <FichaComparacao selectedItem={selectedItem} isMobile={isMobile} dedo={dedo} />

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
              decisões fora de vista na abertura. No celular os botões estão
              no rodapé fixo e as colunas empilham sem teto (o corpo rola). */}
          <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, padding: isMobile ? 12 : "14px 20px", display: "flex", flexDirection: empilhada ? "column" : "row", gap: isMobile ? 16 : empilhada ? 18 : 24 }}>
            <FichaDecisao {...p} botoesNoRodape={isMobile} empilhado={empilhada} />
            <FichaHistorico
              selectedItem={selectedItem}
              isMobile={isMobile}
              empilhado={empilhada}
              historicoCarregando={p.historicoCarregando}
              itemAuditLogs={p.itemAuditLogs}
            />
          </div>

          {/* ── 5 · RODAPÉ de atalhos: só no desktop — no mobile não há
              teclado físico e o rodapé roubava altura do modal. */}
          {!isMobile && (
            <div style={{ padding: "12px 20px", backgroundColor: T.bg, borderTop: `1px solid ${N.n3}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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

        {/* ── RODAPÉ FIXO DA DECISÃO (celular) ──
            Liberar e Devolver sempre à vista, na zona do polegar, com o recorte
            seguro embaixo. LONGOS: o atalho com env() some no parser do jsdom. */}
        {isMobile && (
          <div
            data-testid="rodape-da-decisao"
            style={{ flexShrink: 0, paddingTop: 10, paddingLeft: 12, paddingRight: 12, paddingBottom: "calc(10px + env(safe-area-inset-bottom))", borderTop: `1px solid ${T.border}`, backgroundColor: T.surface, boxShadow: "0 -4px 16px rgba(28,25,23,0.06)" }}
          >
            <BotoesDoRodape {...p} />
          </div>
        )}
        </FreezeWhileClosing>
      </DialogContent>
    </Dialog>
  );
}
