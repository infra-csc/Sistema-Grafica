// O que a linha da tabela e o cartão do celular LEEM da página. Vai como
// prop, não como React Context: a linha é memoizada (LinhaMemo) e só redesenha
// quando muda algo do inventário `depsDaLinha` da página — um Context
// redesenharia a fila inteira a cada mudança.
import type { PecaDaFila } from "@/components/grafica/tipos";
import type { FilaDaGrafica } from "@/components/grafica/hooks/use-fila-da-grafica";
import type { TubosDaFila } from "@/components/grafica/hooks/use-tubos-da-fila";
import type { EdicaoNaLinha } from "@/components/grafica/hooks/use-edicao-na-linha";
import type { SelecaoEmLote } from "@/components/grafica/hooks/use-selecao-em-lote";
import type { ModalDaPecaEstado } from "@/components/grafica/hooks/use-modal-da-peca";
import type { TravaDaFila } from "@/components/grafica/modais/modal-travar";
import type { DevolucaoParaRevisao } from "@/components/grafica/modais/modal-devolver";
import type { GatesDaGrafica } from "./regras";

export type ContextoDaLinha = GatesDaGrafica
  & EdicaoNaLinha
  & Pick<FilaDaGrafica, "seloDoItem" | "seloDaImpressao" | "etiquetaveisPorEvento" | "tubaveisPorEvento" | "typeToGroup" | "expandirGrupo">
  & Pick<TubosDaFila, "setTubosDoEvento" | "seloDoTubo" | "tituloDoTubo" | "abrirTuboDaPeca" | "fechamentoDoTubo" | "temVolumeAberto" | "ehAvulsa" | "tirarDoTuboMutation">
  & Pick<SelecaoEmLote, "bulkOn" | "bulkConferMode" | "bulkPackMode" | "bulkSelectedIds" | "toggleBulkItem" | "abrirEmbalar">
  & Pick<ModalDaPecaEstado, "openProductionModal" | "openConferenceModal" | "tirarBloqueada" | "podeTirarBloqueada" | "mutacoesDeImpressao">
  & Pick<TravaDaFila, "travaDaLinha">
  & Pick<DevolucaoParaRevisao, "setDevolverItem" | "setDevolverMotivo">
  & {
    /** A peça-filha recém-criada: realce de 5 s. */
    novoComplementoId: string | null;
    abrirComplemento: (item: PecaDaFila) => void;
    setViewDetailsItem: (item: PecaDaFila) => void;
    /** Tabela compacta (notebook com a barra lateral aberta). */
    compacto: boolean;
    /** Número de colunas da tabela — o colSpan dos cabeçalhos e das linhas extras. */
    nColunas: number;
    /** Botão de ação dentro da LINHA da tabela: 32px no mouse, 44 no dedo. */
    tamLinha: "toque" | "sm";
    ponteiroGrosso: boolean;
  };

/** O bloco de um evento que passou do teto de linhas (ver ROW_CAP). */
export type CorteDoEvento = { chave: string; total: number; ocultas: number };
