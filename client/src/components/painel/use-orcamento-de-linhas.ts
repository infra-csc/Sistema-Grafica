// ─── Orçamento de linhas montadas (ver LINHAS_INICIAIS em regras.ts) ────────
import { useCallback, useMemo, useRef, useState } from "react";
import { CUSTO_CABECALHO, GROUP_CAP, LINHAS_INICIAIS, LINHAS_POR_LOTE, ROW_CAP } from "./regras";
import type { GrupoDeEvento, GrupoNoPlano } from "./tipos";

export function useOrcamentoDeLinhas({ chaveDoRecorte, sortedGroupEntries, openGroups, expandedEvents }: {
  /** Identidade do recorte: mudou, o orçamento volta ao inicial. */
  chaveDoRecorte: string;
  sortedGroupEntries: Array<[string, GrupoDeEvento]>;
  openGroups: Set<string>;
  expandedEvents: Set<string>;
}) {
  // Volta ao inicial quando o RECORTE muda, pela mesma razão do efeito que
  // zera os grupos expandidos — mas derivado no próprio render (chave do
  // recorte), e não num efeito: com efeito, o primeiro render do recorte novo
  // ainda montaria o orçamento grande do anterior para desmontá-lo logo depois.
  const chaveDoRecorteRef = useRef(chaveDoRecorte);
  chaveDoRecorteRef.current = chaveDoRecorte;
  const [orcamento, setOrcamento] = useState(() => ({ chave: chaveDoRecorte, n: LINHAS_INICIAIS }));
  // Sem IntersectionObserver (navegador muito antigo) não há quem peça o
  // próximo lote: monta tudo de uma vez, como antes.
  const orcamentoLinhas = typeof IntersectionObserver === "undefined"
    ? Number.POSITIVE_INFINITY
    : orcamento.chave === chaveDoRecorte ? orcamento.n : LINHAS_INICIAIS;
  // `extra` explícito quando o usuário PEDE linhas ("Mostrar todas", "Mostrar
  // as N peças"): elas entram inteiras de uma vez, como antes, em vez de
  // esperar a sentinela — e os eventos logo abaixo não somem por um quadro.
  const crescerOrcamento = useCallback((extra: number = LINHAS_POR_LOTE) => {
    setOrcamento((prev) => {
      const chave = chaveDoRecorteRef.current;
      return { chave, n: (prev.chave === chave ? prev.n : LINHAS_INICIAIS) + extra };
    });
  }, []);
  const pedirProximoLote = useCallback(() => crescerOrcamento(), [crescerOrcamento]);

  // O plano do que vai para o DOM: grupos na ordem da lista, cada um com as
  // linhas que o orçamento ainda cobre. Os tetos de sempre (GROUP_CAP e
  // ROW_CAP, botões "Mostrar") valem igual; o orçamento só adia a montagem.
  const planoDaLista = useMemo(() => {
    const grupos: GrupoNoPlano[] = [];
    let restante = orcamentoLinhas;
    let incompleto = false;
    for (let groupIdx = 0; groupIdx < sortedGroupEntries.length; groupIdx++) {
      const [eventKey, gd] = sortedGroupEntries[groupIdx];
      const groupOpen = groupIdx < GROUP_CAP || openGroups.has(eventKey);
      const isExpanded = expandedEvents.has(eventKey);
      const nVisiveis = !groupOpen ? 0 : (isExpanded || gd.items.length <= ROW_CAP ? gd.items.length : ROW_CAP);
      // Sem espaço para o cabeçalho E ao menos uma linha, o grupo espera o
      // próximo lote — um cabeçalho com a tabela vazia embaixo pareceria erro.
      if (restante < CUSTO_CABECALHO + (nVisiveis > 0 ? 1 : 0)) { incompleto = true; break; }
      restante -= CUSTO_CABECALHO;
      const linhasPermitidas = Math.min(nVisiveis, restante);
      restante -= linhasPermitidas;
      grupos.push({ eventKey, gd, groupOpen, isExpanded, linhasPermitidas });
      if (linhasPermitidas < nVisiveis) { incompleto = true; break; }
    }
    return { grupos, incompleto };
  }, [sortedGroupEntries, openGroups, expandedEvents, orcamentoLinhas]);

  return { orcamentoLinhas, crescerOrcamento, pedirProximoLote, planoDaLista };
}
