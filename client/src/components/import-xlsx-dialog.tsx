// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR PEÇAS — o diálogo de planilha (upload + preview editável).
//
// Este arquivo é a COMPOSIÇÃO: o estado da triagem, as contas que a barra
// lateral e a tabela compartilham e o esqueleto do modal. A barra lateral, a
// tabela, a linha editável, as regras puras e os tipos moram em
// components/importar-planilha/. Os exports antigos continuam saindo daqui.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import type { CabecalhoDoKit, RemessaDoKit } from "@shared/kit";
import { DestinoDaImportacaoDialog, type DestinoDaImportacao } from "@/components/kit/destino-da-importacao";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { BarraLateralDaImportacao } from "@/components/importar-planilha/barra-lateral";
import { TabelaDaPrevia } from "@/components/importar-planilha/tabela-da-previa";
import {
  chaveDaPeca, colunasDaImportacao, defeitosDaLinha, quantidadeValida, repetidasNaPlanilha, type DefeitoImport,
} from "@/components/importar-planilha/regras";
import type { LinhaDaImportacao, PatrocinadorDoEvento } from "@/components/importar-planilha/tipos";

export {
  tipoDoGrupo, colunasDaImportacao, quantidadeValida, chaveNaPlanilha, repetidasNaPlanilha,
  chaveDaPeca, defeitosDaLinha, DEFEITO_LABEL, type DefeitoImport,
} from "@/components/importar-planilha/regras";
export { ImportPreviewRow } from "@/components/importar-planilha/linha-da-previa";
export type { LinhaDaImportacao, PatrocinadorDoEvento } from "@/components/importar-planilha/tipos";

interface ImportXlsxDialogProps {
  open: boolean;
  onOpenChangeClose: () => void;
  importFile: File | null;
  setImportFile: (f: File | null) => void;
  setImportPreview: (p: { total: number; groups: string[] } | null) => void;
  importPreviewItems: LinhaDaImportacao[] | null;
  setImportPreviewItems: React.Dispatch<React.SetStateAction<LinhaDaImportacao[] | null>>;
  importFileName: string;
  importSearch: string;
  setImportSearch: (s: string) => void;
  eventSponsorsList: PatrocinadorDoEvento[];
  previewXlsxPending: boolean;
  onPreview: (file: File) => void;
  confirmImportPending: boolean;
  /** O destino (Arena ou Kit) é escolhido no modal que abre antes de importar. */
  onConfirmImport: (items: LinhaDaImportacao[], fileName: string, destino: DestinoDaImportacao) => void;
  /** As peças que o evento JÁ tem — é contra elas que a repetição é medida. */
  itensDoEvento?: { type?: string | null; description?: string | null }[];
  /** Linhas da planilha que o servidor deixou de fora no preview, e por quê. */
  ignoradas?: { linha: number; motivo: string }[];
  /** KIT (14/09): remessas do evento, cabeçalho lido da planilha do Kit e se só Kit vale. */
  kitRemessas?: RemessaDoKit[];
  kitCabecalho?: CabecalhoDoKit | null;
  somenteKit?: boolean;
}

// Extracted from event-detail.tsx: the "Importar Peças" split-panel dialog
// (upload/drop-zone + preview table). All state is still owned by the
// parent EventDetail page and passed down via props — no behavior changed,
// only relocated for readability.
export function ImportXlsxDialog({
  open,
  onOpenChangeClose,
  importFile,
  setImportFile,
  setImportPreview,
  importPreviewItems,
  setImportPreviewItems,
  importFileName,
  importSearch,
  setImportSearch,
  eventSponsorsList,
  previewXlsxPending,
  onPreview,
  confirmImportPending,
  onConfirmImport,
  itensDoEvento = [],
  ignoradas = [],
  kitRemessas = [],
  kitCabecalho = null,
  somenteKit = false,
}: ImportXlsxDialogProps) {
  const isMobile = useIsMobile();

  // ARENA OU KIT (14/09): "Importar N peças" abre o modal de destino; a
  // importação só acontece depois da escolha. Fecha sozinho quando a
  // importação dá certo (o preview é limpo pelo pai).
  const [escolhendoDestino, setEscolhendoDestino] = useState(false);
  useEffect(() => { if (!importPreviewItems) setEscolhendoDestino(false); }, [importPreviewItems]);

  // Confirmação de descarte no padrão visual da casa — o window.confirm
  // nativo destoava do produto (flagrado em produção). Agora é a mesma
  // pergunta de todas as telas (useConfirmar), com o verbo no botão.
  const { confirmar, dialogo } = useConfirmar();

  // ── TRIAGEM ──────────────────────────────────────────────────────────────
  //
  // A barra lateral dizia "42% vinculados" e mais nada. Saber QUAIS linhas
  // exigem atenção obrigava a ler as 10 colunas, linha por linha — e numa
  // planilha de 60 peças isso não acontece: a pessoa importa e descobre
  // depois, com a peça já no evento e o orçamento já errado.
  const [triagem, setTriagem] = useState<DefeitoImport | null>(null);

  // ── A REIMPORTAÇÃO, DETECTADA NO PREVIEW ─────────────────────────────
  //
  // Havia aqui um aviso de reimportação que NUNCA aparecia: o cliente
  // esperava um 409 `duplicate_detected` do servidor, e o servidor não
  // manda nem nunca mandou — `confirm-import` lê só `{ items, fileName }`,
  // e o `force` viajava e era ignorado. Reimportar a mesma planilha
  // duplicava o evento inteiro em silêncio.
  //
  // O aviso mudou de MOMENTO e de CONTEÚDO. De momento porque só serve
  // antes de importar: descobrir depois é descobrir com a peça já dentro.
  // De conteúdo porque um "12 de 40 já existem" não diz QUAIS — e sem os
  // nomes restam duas saídas ruins, importar tudo ou desistir de tudo.
  const chavesDoEvento = useMemo(
    () => new Set(itensDoEvento.map(chaveDaPeca)),
    [itensDoEvento],
  );
  const repetidas = (importPreviewItems ?? []).filter(i => chavesDoEvento.has(chaveDaPeca(i)));
  // Repetidas DENTRO da planilha (linha copiada duas vezes) — recalculadas a
  // cada edição, porque corrigir a medida desfaz a repetição.
  const repetidasDaPlanilha = useMemo(() => repetidasNaPlanilha(importPreviewItems ?? []), [importPreviewItems]);
  // Linhas que o servidor recusaria: enquanto houver, o botão de importar
  // fica travado e o motivo aparece embaixo dele, com a linha.
  const comQtdInvalida = (importPreviewItems ?? []).filter(i => !quantidadeValida(i.quantity));
  const [verIgnoradas, setVerIgnoradas] = useState(false);

  // A coluna VISUAL só existe quando alguma linha trouxe medida visual. Numa
  // planilha NORTE sem visual ela era 145 linhas de "— × —" ocupando
  // 110px de uma tabela que já não cabia.
  const mostrarVisual = (importPreviewItems ?? []).some(r => r.visualWidth || r.visualHeight);
  const colunas = colunasDaImportacao(mostrarVisual);
  const larguraDaTabela = colunas.reduce((s, c) => s + c.w, 0);

  // Predicado único da busca do preview — usado na contagem, no "+ Todos" e
  // no empty-state de filtro sem resultado.
  const importQ = importSearch.toLowerCase();
  const matchesImportSearch = (i: LinhaDaImportacao) =>
    !importSearch || i.description?.toLowerCase().includes(importQ) || i.type?.toLowerCase().includes(importQ);

  // O RECORTE, uma função só: a busca E a triagem. A contagem de cada balde
  // sai do MESMO predicado que a tabela aplica — com a própria dimensão de
  // fora —, então o número do balde é exatamente o de linhas que o clique
  // entrega.
  const passaNaTriagem = (i: LinhaDaImportacao) => !triagem || defeitosDaLinha(i, chavesDoEvento, repetidasDaPlanilha).includes(triagem);
  const matchesImportFiltros = (i: LinhaDaImportacao) => matchesImportSearch(i) && passaNaTriagem(i);

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) {
        // Preview carregado = trabalho de edição/vinculação em andamento.
        // Fechar (X/Esc/clique-fora) descartava tudo sem perguntar; a
        // confirmação é o useConfirmar da casa (o confirm() nativo destoava).
        if (importPreviewItems && importPreviewItems.length > 0) {
          void confirmar({
            titulo: "Descartar importação?",
            descricao: "As edições e vinculações feitas no preview serão perdidas.",
            confirmar: "Descartar",
            cancelar: "Continuar editando",
            perigo: true,
          }).then((ok) => { if (ok) onOpenChangeClose(); });
          return;
        }
        onOpenChangeClose();
      }
    }}>
      <DialogContent
        className="[&>button:last-child]:right-4 [&>button:last-child]:top-4 [&>button:last-child]:z-50"
        /* Altura TRAVADA na janela: o modal era mais alto que a viewport e
           o cartão do arquivo saía cortado pelo topo, com a barra lateral
           rolando dentro do próprio recorte. Agora só a barra lateral e o
           painel da tabela rolam; o cartão do arquivo e o botão de importar
           — o começo e o fim da tarefa — ficam fixos. */
        style={{ maxWidth: '98vw', width: importPreviewItems ? 1320 : 540, height: importPreviewItems ? 'calc(100vh - 48px)' : undefined, maxHeight: 'calc(100vh - 48px)', padding: 0, gap: 0, borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', transition: 'width 0.3s' }}
      >
        {/* Abaixo de 768px a sidebar empilha ACIMA da tabela (largura total) —
            lado a lado, os 260px fixos esmagavam o preview no celular. */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: 12 }}>
        {/* ── Left sidebar ── */}
        <BarraLateralDaImportacao
          isMobile={isMobile}
          importFile={importFile}
          setImportFile={setImportFile}
          setImportPreview={setImportPreview}
          importPreviewItems={importPreviewItems}
          setImportPreviewItems={setImportPreviewItems}
          importFileName={importFileName}
          setImportSearch={setImportSearch}
          previewXlsxPending={previewXlsxPending}
          onPreview={onPreview}
          confirmImportPending={confirmImportPending}
          ignoradas={ignoradas}
          verIgnoradas={verIgnoradas}
          setVerIgnoradas={setVerIgnoradas}
          repetidas={repetidas}
          comQtdInvalida={comQtdInvalida}
          chavesDoEvento={chavesDoEvento}
          repetidasDaPlanilha={repetidasDaPlanilha}
          triagem={triagem}
          setTriagem={setTriagem}
          matchesImportSearch={matchesImportSearch}
          setEscolhendoDestino={setEscolhendoDestino}
        />

        {/* ── Right panel: table ── */}
        {importPreviewItems && (
          <TabelaDaPrevia
            importPreviewItems={importPreviewItems}
            setImportPreviewItems={setImportPreviewItems}
            importSearch={importSearch}
            setImportSearch={setImportSearch}
            triagem={triagem}
            setTriagem={setTriagem}
            eventSponsorsList={eventSponsorsList}
            matchesImportFiltros={matchesImportFiltros}
            colunas={colunas}
            larguraDaTabela={larguraDaTabela}
            chavesDoEvento={chavesDoEvento}
            repetidasDaPlanilha={repetidasDaPlanilha}
            mostrarVisual={mostrarVisual}
          />
        )}
        </div>{/* wrapper flex row */}
      </DialogContent>

      {/* Arena ou Kit — antes de importar (14/09) */}
      <DestinoDaImportacaoDialog
        aberto={escolhendoDestino && !!importPreviewItems}
        quantidade={importPreviewItems?.length ?? 0}
        arquivo={importFileName}
        remessas={kitRemessas}
        cabecalho={kitCabecalho}
        somenteKit={somenteKit}
        pendente={confirmImportPending}
        onConfirmar={(destino) => { if (importPreviewItems?.length) onConfirmImport(importPreviewItems, importFileName, destino); }}
        onFechar={() => setEscolhendoDestino(false)}
      />

      {/* Confirmação de descarte da importação — padrão da casa */}
      {dialogo}
    </Dialog>
  );
}
