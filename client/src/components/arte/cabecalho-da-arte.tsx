import { FileImage, FileText, HelpCircle, Lock, MoreHorizontal, Palette, Printer, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Botao } from "@/components/ui/botao";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { alvo } from "@/hooks/use-mobile";
import { T, TOM, N, R, FS } from "@/lib/theme";
import { GUIA_DA_FASE } from "./constantes";

/** O topo da Arte: título, o estado numa linha, as ações e o aviso de modo consulta. */
export function CabecalhoDaArte({
  isMobile, dedo, podeEditar, activeTab, pendingCount, correcaoCount, needsFinalFileCount, selectedItemIds,
  handleBulkThumbFilesAdded, handleClickExportButton, openBookModal, setShowBulkDialog,
}: {
  isMobile: boolean;
  dedo: boolean;
  podeEditar: boolean;
  activeTab: string;
  pendingCount: number;
  correcaoCount: number;
  needsFinalFileCount: number;
  selectedItemIds: Set<string>;
  handleBulkThumbFilesAdded: (files: FileList | File[]) => void;
  handleClickExportButton: () => void;
  openBookModal: () => void;
  setShowBulkDialog: (aberto: boolean) => void;
}) {
  return (
    <>
      {/* ── Identidade + ações ──
          MENOS É MAIS (dono, 22/09: "apenas o que eles REALMENTE usam").
          Medido na trilha de 30 dias: a Arte vive de três gestos — subir/
          enviar thumb (2.582), enviar arquivo final (1.555) e reenviar
          correção (~320). Nenhum deles mora no topo: estão na linha. Por
          isso o topo ficou com o título, UMA linha de contexto e só a ação
          de lote que passa pela mesma rota de envio ("Envio de thumbs em
          lote", na aba de criar aprovações). Exportar PDF, Subir book e
          PDF compartilhado — que não aparecem na trilha — foram para
          "Mais ações", com as MESMAS cores (dono, 17/09: "seria bom cor
          também"). O "como funciona" virou o "?" ao lado do título.
          NO CELULAR identidade e ações EMPILHAM: lado a lado, a fileira
          passava da largura e a tela é overflow:hidden — o excesso era
          CORTADO, não rolável. */}
      {/* O cabeçalho da casa (<CabecalhoDaPagina>): título, o ESTADO numa
          linha ("N peças esperando a Arte") e as ações — que no celular
          caem para baixo em vez de espremer o título. O "?" do como
          funciona mora na linha do estado. A margem de 20 do componente
          volta a 16/12 aqui (margens negativas somam com a dele): este
          topo é flexShrink:0 e cada pixel dele sai da área da lista —
          foi assim que o "conteúdo cortado" já apareceu. */}
      <div style={{ marginBottom: isMobile ? -8 : -4 }}>
        <CabecalhoDaPagina
          titulo="Arte"
          icone={Palette}
          subtitulo={
            // A soma é das três fases em que a peça espera a Arte — o
            // `title` conta (rodada 4).
            <span
              data-testid="contexto-arte"
              title="Soma de Aguardando envio, Correção e Finalizar arte — as fases em que a peça depende da Arte"
            >
              {(pendingCount + correcaoCount + needsFinalFileCount) > 0
                ? <><b style={{ fontWeight: 700, color: T.text }}>{pendingCount + correcaoCount + needsFinalFileCount}</b> {(pendingCount + correcaoCount + needsFinalFileCount) === 1 ? 'peça esperando' : 'peças esperando'} a Arte</>
                : 'Tudo em dia — nenhuma peça esperando a Arte'}
            </span>
          }
          frescor={
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Como funciona a Arte e o que se faz nesta fase"
                  data-testid="button-como-funciona"
                  style={{ width: alvo(28, dedo), height: alvo(28, dedo), borderRadius: R.pill, border: 'none', background: 'transparent', color: T.apoio, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, margin: '-4px 0' }}
                >
                  <HelpCircle aria-hidden="true" style={{ width: 16, height: 16 }} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" style={{ width: 300, padding: 14 }}>
                {/* O fluxo em ordem, com verbo (rodada 4), e o guia da fase
                    aberta. */}
                <p style={{ margin: 0, fontSize: FS.body, fontWeight: 700, color: T.text }}>
                  Suba o thumb, envie para aprovação, corrija o que voltar e finalize o arquivo
                </p>
                {GUIA_DA_FASE[activeTab] && (
                  <p data-testid="guia-da-fase" style={{ margin: '8px 0 0', fontSize: 12.5, color: T.strong, lineHeight: 1.5 }}>
                    {GUIA_DA_FASE[activeTab]}
                  </p>
                )}
              </PopoverContent>
            </Popover>
          }
          acoes={<>
            {podeEditar && activeTab === "criar-aprovacoes" && (
              // <label> com o input dentro (e não <Botao>): é o clique no
              // rótulo que abre o seletor de arquivos.
              <label
                data-testid="button-open-bulk-thumb"
                style={{ height: alvo(36, dedo), padding: '0 14px', borderRadius: R.md, border: `1px solid ${TOM.ciano.border}`, background: TOM.ciano.bg, color: TOM.ciano.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: FS.body, fontWeight: 600, whiteSpace: 'nowrap', transition: 'border-color 0.12s', flex: isMobile ? '1 1 auto' : undefined, justifyContent: 'center' }}
              >
                <FileImage aria-hidden="true" style={{ width: 12, height: 12, color: TOM.ciano.text }} />
                Envio de thumbs em lote
                {/* sr-only e não display:none — um input display:none não entra
                    na ordem de foco, e nem <label> nem <div> são focáveis por
                    si: o Tab pulava direto por cima desta ação. */}
                <input type="file" accept="image/*" multiple className="sr-only" onChange={e => { if (e.target.files) handleBulkThumbFilesAdded(e.target.files); e.target.value = ''; }} />
              </label>
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Botao
                  variante="secundario"
                  tamanho={dedo ? "toque" : "md"}
                  icone={MoreHorizontal}
                  data-testid="button-mais-acoes"
                  aria-label="Mais ações da Arte"
                  style={{ fontSize: FS.body, fontWeight: 600 }}
                >
                  Mais ações
                </Botao>
              </PopoverTrigger>
              <PopoverContent align="end" className="p-1" style={{ width: 260 }} data-testid="menu-mais-acoes">
                {/* As cores de 17/09 continuam DENTRO do menu — cada ação com
                    o seu tom (fundo 50, borda 200, texto 700 = AA) — para a
                    pessoa achar a ação pela cor sem ler a lista inteira.
                    Exportar é LEITURA: aparece também em modo consulta.
                    São ITENS DE MENU, não <Botao>. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <button
                    onClick={handleClickExportButton}
                    data-testid="button-export-pdf"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: alvo(36, dedo), padding: '0 12px', borderRadius: R.sm, border: `1px solid ${TOM.info.border}`, background: TOM.info.bg, color: TOM.info.text, fontSize: FS.body, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <Printer aria-hidden="true" style={{ width: 13, height: 13, color: TOM.info.text }} />
                    {selectedItemIds.size > 0 ? `Exportar ${selectedItemIds.size} selecionadas` : 'Exportar PDF'}
                  </button>
                  {podeEditar && (
                    <button
                      onClick={openBookModal}
                      data-testid="button-upload-book"
                      title="Subir o PDF do book (layout pronto) e escolher as peças"
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', minHeight: alvo(36, dedo), padding: '0 12px', borderRadius: R.sm, border: `1px solid ${TOM.roxo.border}`, background: TOM.roxo.bg, color: TOM.roxo.text, fontSize: FS.body, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}
                    >
                      <FileText aria-hidden="true" style={{ width: 13, height: 13, color: TOM.roxo.text }} />
                      Subir book
                    </button>
                  )}
                  {podeEditar && activeTab === "criar-aprovacoes" && (
                    <button
                      onClick={() => setShowBulkDialog(true)}
                      disabled={selectedItemIds.size === 0}
                      data-testid="button-open-bulk-upload"
                      // Desabilitado sem dizer por quê parece quebrado: a
                      // linha de baixo explica o que o libera.
                      title={selectedItemIds.size > 0
                        ? `Usar UM PDF como thumb das ${selectedItemIds.size === 1 ? 'peça selecionada' : `${selectedItemIds.size} peças selecionadas`} e enviar para aprovação`
                        : 'Marque as peças na tabela (caixinhas à esquerda) para enviar todas com um mesmo PDF'}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1, width: '100%', minHeight: alvo(36, dedo), padding: '4px 12px', borderRadius: R.sm, border: `1px solid ${selectedItemIds.size > 0 ? TOM.laranja.border : T.border}`, background: selectedItemIds.size > 0 ? TOM.laranja.bg : T.surface, color: selectedItemIds.size > 0 ? T.accentText : T.apoio, fontSize: FS.body, fontWeight: 600, cursor: selectedItemIds.size > 0 ? 'pointer' : 'not-allowed', textAlign: 'left' }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Upload aria-hidden="true" style={{ width: 13, height: 13 }} />
                        {selectedItemIds.size > 0 ? `PDF compartilhado (${selectedItemIds.size})` : 'PDF compartilhado'}
                      </span>
                      {selectedItemIds.size === 0 && (
                        <span style={{ fontSize: FS.small, fontWeight: 500, color: T.apoio }}>Marque as peças na lista para liberar</span>
                      )}
                    </button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </>}
        />
      </div>

      {/* ── Modo consulta ──
          O papel `atendimento` entra nesta rota (App.tsx) mas as sete rotas
          de escrita da Arte só aceitam `arte`/`admin`. Dizer isso de uma vez
          é melhor que deixar descobrir ação por ação — e o comportamento
          parcialmente permitido (salvar rascunho funciona, enviar devolve
          403) era o pior dos dois mundos. */}
      {!podeEditar && (
        <div data-testid="banner-modo-consulta" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px', marginBottom: 14, borderRadius: 10, background: N.n2, border: `1px solid ${T.border}` }}>
          <Lock style={{ width: 14, height: 14, color: T.apoio, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.strong }}>
            <b style={{ fontWeight: 700 }}>Modo consulta.</b> Você vê a fila da Arte e pode exportar PDFs, mas enviar, corrigir, finalizar e pular a aprovação é da equipe de Arte.
          </span>
        </div>
      )}
    </>
  );
}
