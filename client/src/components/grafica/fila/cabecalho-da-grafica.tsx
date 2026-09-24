// O cabeçalho da Gráfica: onde estou (título) · como está (quantas peças na
// fila e a idade do dado) · o que posso fazer (ações). Sem botão "Atualizar"
// (regra do dono): a tela se atualiza sozinha (WebSocket + polling + refetch no
// foco) e o selo de frescor é a promessa de veracidade; o spinner ao lado é o
// único sinal de recarga em curso.
import type React from "react";
import { Link } from "wouter";
import { Camera, FileSpreadsheet, ListChecks, Package, Printer, RotateCcw } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { FONT, FS, FW, R, T } from "@/lib/theme";
import { alvo as alvoDeToque } from "@/hooks/use-mobile";
import { prefetchRota } from "@/lib/prefetch-de-rota";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { linkDaImpressoraEmMaquinas } from "@shared/progresso-da-impressao";
import { SEM_IMPRESSORA } from "@/lib/grafica-filtros";
// Selo "Atualizado há X" — o mesmo formatador da Gestão de Prazos e das
// Análises, para as três telas dizerem a idade do dado com as mesmas palavras.
import { fmtRelative } from "@/components/prazos/tokens";
import type { FilaDaGrafica } from "@/components/grafica/hooks/use-fila-da-grafica";
import type { SelecaoEmLote } from "@/components/grafica/hooks/use-selecao-em-lote";

export function CabecalhoDaGrafica({ fila, lote, podeConferir, isMobile, ponteiroGrosso, isExporting, handleExportXlsx, setGalpao }: {
  fila: FilaDaGrafica;
  lote: SelecaoEmLote;
  podeConferir: boolean;
  isMobile: boolean;
  ponteiroGrosso: boolean;
  isExporting: boolean;
  handleExportXlsx: () => void;
  setGalpao: (modo: "confer") => void;
}) {
  const { stats, isLoading, isError, isFetching, dataUpdatedAt, agora, filtros, filteredItems } = fila;
  const { bulkOn, conferableInFilter, packableInFilter, setBulkConferMode, setBulkPackMode, setBulkSelectedIds } = lote;
  // ── Botões do topo ────────────────────────────────────────────────────────
  // UMA ação primária por contexto. No celular a primária é a FILA (uma foto
  // por peça, dois toques). O lote, Máquinas e o Excel são secundários. No
  // desktop não há primária no topo: o trabalho primário mora na LINHA (um
  // botão sólido por peça), e os lotes são modos, não o gesto do dia inteiro.
  // Tamanho pelo PONTEIRO, não pela largura: o tablet do galpão é dedo.
  const tamanhoDoTopo = isMobile || ponteiroGrosso ? "toque" : "md";

  // O wrapper leva o testid antigo do título (os testes medem a ordem da
  // primeira dobra a partir dele) e devolve a margem que o gap já dá.
  return (
    <div data-testid="title-grafica" style={{ marginBottom: -20 }}>
      <CabecalhoDaPagina
        titulo="Gráfica"
        subtitulo={isLoading || isError ? undefined
          : `${stats.total} peça${stats.total !== 1 ? "s" : ""} na fila${isMobile ? "" : " · a ordem segue a saída do caminhão"}`}
        frescor={!isLoading && !isError ? (
          <span
            data-testid="selo-atualizado"
            title={new Date(dataUpdatedAt).toLocaleString("pt-BR")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: FS.meta, color: T.second, whiteSpace: "nowrap" }}
          >
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado {fmtRelative(new Date(dataUpdatedAt).toISOString(), agora)}
          </span>
        ) : undefined}
        acoes={bulkOn ? undefined : (
          // Some inteira no modo lote: a barra fixa de baixo passa a ser o
          // único lugar de ação.
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap", width: isMobile ? "100%" : undefined }}>
            {/* CONFERIR EM FILA — o caminho do celular, e por isso a
                primária dele: uma foto POR peça. A entrega é do volume. */}
            {isMobile && podeConferir && conferableInFilter.length > 0 && (
              <Botao
                variante="primario"
                tamanho="toque"
                icone={Camera}
                larguraCheia
                onClick={() => setGalpao("confer")}
                data-testid="button-fila-conferir"
                aria-label={`Conferir em fila, uma peça por vez com foto — ${conferableInFilter.length} peças`}
              >
                Conferir <span style={{ fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>({conferableInFilter.length})</span>
              </Botao>
            )}
            {/* Dois "Conferir" lado a lado sem dizer a diferença era a
                primeira dúvida de quem chega: uma linha curta resolve. */}
            {isMobile && podeConferir && conferableInFilter.length > 0 && (
              <p data-testid="dica-fila-lote" style={{ margin: 0, width: "100%", fontSize: FS.meta, color: T.second, lineHeight: 1.35 }}>
                <strong style={{ color: T.strong }}>Fila:</strong> uma foto por peça · <strong style={{ color: T.strong }}>Lote:</strong> uma foto só
              </p>
            )}
            {/* Conferência em lote — só para quem pode conferir (gate do servidor). */}
            {podeConferir && conferableInFilter.length > 0 && (
              <Botao
                tamanho={tamanhoDoTopo}
                icone={isMobile ? undefined : ListChecks}
                onClick={() => { setBulkConferMode(true); setBulkSelectedIds(new Set()); }}
                data-testid="button-bulk-confer"
                title="Selecionar várias peças e conferir com uma foto só"
                style={{ flex: isMobile ? "1 1 0%" : undefined }}
              >
                Conferir em lote
                {/* No celular a contagem já está na fila logo acima. */}
                {!isMobile && <span style={{ color: T.second, fontVariantNumeric: "tabular-nums" }}>{conferableInFilter.length}</span>}
              </Botao>
            )}
            {/* Embalar em lote (dono, 21/09) — várias conferidas num tubo. */}
            {podeConferir && packableInFilter.length > 0 && (
              <Botao
                tamanho={tamanhoDoTopo}
                icone={isMobile ? undefined : Package}
                onClick={() => { setBulkPackMode(true); setBulkSelectedIds(new Set()); }}
                data-testid="button-bulk-pack"
                title="Marcar várias peças conferidas e pôr todas num tubo"
                style={{ flex: isMobile ? "1 1 0%" : undefined }}
              >
                Embalar em lote
                {!isMobile && <span style={{ color: T.second, fontVariantNumeric: "tabular-nums" }}>{packableInFilter.length}</span>}
              </Botao>
            )}
            {!isMobile && <AtalhosDaGrafica fila={fila} isMobile={false} ponteiroGrosso={ponteiroGrosso} isExporting={isExporting} handleExportXlsx={handleExportXlsx} />}
          </div>
        )}
      />
    </div>
  );
}

/**
 * MÁQUINAS + EXCEL — os dois atalhos do topo. No desktop moram no cabeçalho,
 * ao lado dos lotes; no CELULAR sobem para a linha das abas (Fila | Tubos), à
 * direita (revisão de celular, 24/09): a linha deles no cabeçalho custava 52px
 * antes da primeira peça, e a das abas tinha 200px livres. Continuam antes dos
 * cartões de etapa na ordem do documento (a primeira dobra do teste).
 */
export function AtalhosDaGrafica({ fila, isMobile, ponteiroGrosso, isExporting, handleExportXlsx }: {
  fila: FilaDaGrafica;
  isMobile: boolean;
  ponteiroGrosso: boolean;
  isExporting: boolean;
  handleExportXlsx: () => void;
}) {
  const { filtros, filteredItems } = fila;
  const tamanhoDoTopo = isMobile || ponteiroGrosso ? "toque" : "md";
  const exportDesabilitado = isExporting || filteredItems.length === 0;
  // Máquinas é um <Link> (navegação), não um <button>: veste a MESMA pele do
  // Botao secundário pela classe .ds-botao, que dá hover e foco sem handlers.
  const linkSecundario: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    minHeight: alvoDeToque(36, isMobile || ponteiroGrosso), padding: "0 14px",
    backgroundColor: T.surface, color: T.strong, border: `1px solid ${T.border}`, borderRadius: R.md,
    fontFamily: FONT.corpo, fontSize: FS.body, fontWeight: FW.forte, whiteSpace: "nowrap", textDecoration: "none",
  };
  return (
    <>
    {/* A aba MÁQUINAS (dono, 14/09). Recortada numa impressora só,
        a ida leva ao CARTÃO dela em Máquinas. No celular vira só o
        ícone; o chunk começa a descer no hover/foco/toque. */}
    <Link
      href={filtros.impressora.length === 1 && filtros.impressora[0] !== SEM_IMPRESSORA ? linkDaImpressoraEmMaquinas(filtros.impressora[0]) : "/grafica/maquinas"}
      data-testid="link-maquinas"
      className="ds-botao"
      aria-label={isMobile ? "Máquinas: o que cada impressora imprime agora e o histórico do dia" : undefined}
      title={filtros.impressora.length === 1 && filtros.impressora[0] !== SEM_IMPRESSORA ? `Ver a ${rotuloDaMaquina(filtros.impressora[0])} em Máquinas` : "O que cada impressora imprime agora e o histórico do dia"}
      onMouseEnter={() => prefetchRota("/grafica/maquinas")}
      onFocus={() => prefetchRota("/grafica/maquinas")}
      onTouchStart={() => prefetchRota("/grafica/maquinas")}
      style={{ ...linkSecundario, ...(isMobile ? { width: 44, padding: 0, flex: "0 0 44px" } : null) }}
    >
      <Printer aria-hidden="true" style={{ width: 14, height: 14, flexShrink: 0 }} />
      {!isMobile && "Máquinas"}
    </Link>
    {/* Exportar Excel — só um download; no celular vira só o ícone
        (o rótulo vai no aria-label). O motivo do desabilitado fica
        VISÍVEL no desktop; no celular o botão de 44px não tem onde
        pôr a frase e ela vai no aria-label. */}
    <Botao
      tamanho={tamanhoDoTopo}
      icone={FileSpreadsheet}
      carregando={isExporting}
      disabled={exportDesabilitado}
      motivo={!isMobile && !isExporting && filteredItems.length === 0 ? "Nada para exportar" : undefined}
      alinharMotivo="end"
      onClick={handleExportXlsx}
      data-testid="button-export-xlsx"
      aria-label={isMobile ? (filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar") : undefined}
      title={filteredItems.length ? `Exportar ${filteredItems.length} peça(s) em Excel` : "Nada para exportar"}
      style={isMobile ? { width: 44, padding: 0, flex: "0 0 44px" } : undefined}
    >
      {!isMobile && (isExporting ? "Gerando…" : "Exportar Excel")}
    </Botao>
    </>
  );
}
