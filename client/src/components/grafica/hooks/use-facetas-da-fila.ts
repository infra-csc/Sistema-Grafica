// ─────────────────────────────────────────────────────────────────────────────
// AS FACETAS DA FILA — as opções (com contagem) de cada dropdown de filtro.
//
// Cada dropdown lista só o que existe no recorte atual, aplicando os OUTROS
// filtros ativos (com contagem por opção) — o comportamento correto, que a
// maioria dos apps erra. A regra é a MESMA da lista (`itemCasaFiltros`), só com
// o próprio filtro excluído: se o pool das facetas ignorasse busca, mês e
// próximos-10-dias, digitar na busca encolheria a lista e as contagens dos
// dropdowns continuariam prometendo o número antigo.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import { getPriorityMeta, descricaoDoStatus } from "@/lib/status";
import { rotuloDaMaquina, MAQUINAS_DE_IMPRESSAO } from "@shared/fluxo-peca";
import { recorteSoDaBusca, recorteSemABusca } from "@/components/grafica/recorte-da-busca";
import {
  itemCasaFiltros, casaEtapa, itemPercursos, nomeDoMes, ordemPercurso, itemMes, itemImpressoras, SEM_IMPRESSORA,
  type GraficaFiltros, type FacetaGrafica, type CtxFiltros,
} from "@/lib/grafica-filtros";
import type { PecaDaFila } from "@/components/grafica/tipos";

export function useFacetasDaFila({ items, filtros, ctxFiltros, groupOf }: {
  items: PecaDaFila[];
  filtros: GraficaFiltros;
  ctxFiltros: CtxFiltros;
  groupOf: (type: string) => string;
}) {
  //
  // A REGRA QUE VALE PARA AS OITO FACETAS, e que alguém quebra ao acrescentar a
  // nona (o texto por extenso e o porquê estão em lib/grafica-filtros, em
  // FacetaGrafica): o pool de um dropdown é o recorte QUE O CLIQUE PRODUZ, não o
  // de agora. Onde os dois diferem é na ocultação das entregues — se clicar
  // naquela opção REVELA as entregues, a faceta as conta e oferece a opção com
  // esse número; se não revela, não conta. Hoje revelam STATUS ("Entregues" é o
  // par do KPI) e EVENTO (o relato do dono do NORTE: "Primavera Manaus", com as
  // 77 peças entregues, sumia deste menu e só aparecia pela busca livre).
  //
  // useMemo obrigatório: eram SEIS varreduras da base a cada tecla digitada,
  // sem memo nenhum, cada uma chamando `groupOf` (normalize + duas regex) e
  // `itemPercursos` (exec em laço) sobre todo o histórico.
  //
  // A BUSCA UMA VEZ SÓ. Com texto na busca, cada uma das ONZE varreduras do
  // recorte (lista, pool dos cards, oito facetas, entregues ocultas) normalizava
  // quatro campos de cada peça (NFD + regex): ~500 ms de CPU a cada clique de
  // aba ou pausa na digitação, com 4 mil peças. Agora o texto é casado UMA vez
  // (`poolDaBusca`, que só depende do texto — trocar de aba não a refaz) e as
  // passadas rodam sobre o que sobrou com `recorteDasPassadas`: o mesmo
  // recorte sem o texto e com o efeito dele em `escondeEntregues` preservado.
  // A identidade e o porquê estão em components/grafica/recorte-da-busca.ts,
  // com teste peça a peça — a regra continua inteira em `itemCasaFiltros`.
  const poolDaBusca = useMemo(
    () => {
      if (!filtros.busca.trim()) return items;
      const soBusca = recorteSoDaBusca(filtros.busca);
      return items.filter((i) => itemCasaFiltros(i, soBusca, ctxFiltros, { ignorarStatus: true }));
    },
    [items, filtros.busca, ctxFiltros],
  );
  const recorteDasPassadas = useMemo(() => recorteSemABusca(filtros), [filtros]);
  const gFacetPool = useMemo(() => {
    const cache = new Map<FacetaGrafica, PecaDaFila[]>();
    return (excluir: FacetaGrafica): PecaDaFila[] => {
      const pronto = cache.get(excluir);
      if (pronto) return pronto;
      const pool = poolDaBusca.filter((i) => itemCasaFiltros(i, recorteDasPassadas, ctxFiltros, { excluir }));
      cache.set(excluir, pool);
      return pool;
    };
  }, [poolDaBusca, recorteDasPassadas, ctxFiltros]);

  const countField = (excluir: FacetaGrafica, key: 'type' | 'material' | 'finish') => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool(excluir).forEach((i) => {
      const v = i[key];
      if (!v) return;
      const cur = map.get(v);
      if (cur) cur.count++;
      else map.set(v, { value: v, label: v, count: 1 });
    });
    return Array.from(map.values());
  };

  const eventFilterOptions = useMemo(() => {
    // Cores de prioridade vêm da fonte única (lib/status) — o mapa hex local
    // divergia dela ("alta" laranja aqui, âmbar no resto do app).
    // 'urgent' é grafia legada de 'urgente' que ainda existe em eventos antigos.
    const dotFor = (priority: string | null | undefined) =>
      getPriorityMeta(priority === 'urgent' ? 'urgente' : priority)?.dot;
    const map = new Map<string, { value: string; label: string; count: number; dotColor?: string }>();
    gFacetPool('evento').forEach((i) => {
      if (!i.eventId) return;
      const cur = map.get(i.eventId);
      if (cur) cur.count++;
      else map.set(i.eventId, { value: i.eventId, label: i.event?.name || 'Sem evento', count: 1, dotColor: dotFor(i.event?.priority) });
    });
    return Array.from(map.values());
  }, [gFacetPool]);
  const typeFilterOptions = useMemo(() => countField('tipo', 'type'), [gFacetPool]);
  const materialFilterOptions = useMemo(() => countField('material', 'material'), [gFacetPool]);
  const finishFilterOptions = useMemo(() => countField('acabamento', 'finish'), [gFacetPool]);

  // Grupos presentes no recorte atual (ex.: 5KM, 10KM, PÓRTICO). Derivado do
  // catálogo de Modelos, então o filtro só aparece quando há grupo cadastrado
  // e nunca oferece uma opção que não bate em nada.
  const groupFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number }>();
    gFacetPool('grupo').forEach((i) => {
      const g = groupOf(i.type);
      if (!g) return;
      const cur = map.get(g);
      if (cur) cur.count++;
      else map.set(g, { value: g, label: g, count: 1 });
    });
    // Ordem natural: "5KM" antes de "10KM" (alfabética inverteria os dois).
    return Array.from(map.values())
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true }))
      .map((o) => ({ ...o, pinned: true }));
  }, [gFacetPool, groupOf]);

  // Percursos presentes no recorte (5k, 10k...). Uma placa "5k/10k" conta nos
  // dois — é peça compartilhada e tem de aparecer em qualquer um dos filtros.
  const percursoFilterOptions = useMemo(() => {
    const map = new Map<string, { value: string; label: string; count: number; sort: number }>();
    gFacetPool('percurso').forEach((i) => {
      itemPercursos(i).forEach((p) => {
        const cur = map.get(p);
        if (cur) cur.count++;
        else map.set(p, { value: p, label: p, count: 1, sort: ordemPercurso(p) });
      });
    });
    return Array.from(map.values())
      .sort((a, b) => a.sort - b.sort)
      .map(({ value, label, count }) => ({ value, label, count, pinned: true }));
  }, [gFacetPool]);

  // ── STATUS e MÊS: as duas facetas que eram lista FIXA ─────────────────────
  // Eram os dois únicos dropdowns da barra escritos à mão — seis etapas e doze
  // meses, sempre todos, sem contagem. Ou seja, uma SEGUNDA fonte de verdade
  // sobre o mesmo recorte: a fila só tem peça de Agosto e o menu oferecia
  // Janeiro; ninguém entregou nada hoje e "Entregues" continuava lá. O clique
  // devolvia lista vazia, e um menu que oferece o que não existe é
  // indistinguível de uma tela quebrada.
  //
  // Agora saem do MESMO `gFacetPool` das outras cinco (ver a invariante em
  // lib/grafica-filtros: faceta e lista saem do mesmo pool), com a contagem que
  // o clique vai entregar.

  // "pronto_para_producao" é grafia legada da MESMA etapa de
  // "ready_for_production" — a faceta tem de somá-las numa opção só, senão a
  // contagem mentiria por baixo (é o que `casaStatus` faz do outro lado).
  const STATUS_DA_FILA = [
    { value: "awaiting_final_review", label: "Em Revisão" },
    { value: "ready_for_production", label: "Pronto p/ Produção" },
    { value: "approved",             label: "Liberados" },
    { value: "inProduction",         label: "Em Impressão" },
    { value: "produced",             label: "Impresso / Acabamento" },
    { value: "conferred",            label: "Conferidos" },
    { value: "packed",               label: "Embalados" },
    { value: "delivered",            label: "Entregues" },
  ] as const;
  const statusFilterOptions = useMemo(() => {
    // `casaEtapa` é a régua do clique (lib/grafica-filtros): junta as grafias
    // legadas, manda o molde produzido para Entregues e conta a peça PARCIAL
    // também na etapa em que parte dela espera (impressas a conferir etc.).
    const pool = gFacetPool('status');
    const conta = new Map<string, number>(
      STATUS_DA_FILA.map((s) => [s.value, pool.filter((i) => casaEtapa(i, s.value)).length] as const),
    );
    // O status ESCOLHIDO fica na lista mesmo com zero peças: fora dela, o chip
    // do filtro mostrava a chave crua ("inProduction") em vez de "Em Impressão".
    return STATUS_DA_FILA
      .filter(s => (conta.get(s.value) ?? 0) > 0 || filtros.status.includes(s.value))
      // `title` com o significado do status (lib/status): "Liberados" e "Pronto
      // p/ Produção" lado a lado no menu eram dúvida de quem filtrava.
      .map(s => ({ value: s.value, label: s.label, count: conta.get(s.value) ?? 0, pinned: true, title: descricaoDoStatus(s.value) ?? undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gFacetPool, filtros.status]);

  const mesFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    gFacetPool('mes').forEach((i) => {
      const m = itemMes(i);
      if (!m) return;
      conta.set(m, (conta.get(m) ?? 0) + 1);
    });
    return Array.from(conta.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([m, count]) => ({ value: m, label: nomeDoMes(m), count, pinned: true }));
  }, [gFacetPool]);

  // Impressoras presentes no recorte (dono, 21/09). A ordem é fixa — as quatro
  // máquinas de shared/fluxo-peca e depois "Sem impressora" (peça em impressão
  // sem máquina, legado de antes do controle de máquinas). Como no Status, a
  // opção ESCOLHIDA fica na lista mesmo com zero peças: fora dela o chip do
  // filtro mostrava a chave crua ("3") em vez do nome da máquina.
  const impressoraFilterOptions = useMemo(() => {
    const conta = new Map<string, number>();
    gFacetPool('impressora').forEach((i) => {
      // Uma peça conta em CADA impressora dela (a dividida é da 1 e da 2) —
      // a mesma régua do cartão de Máquinas.
      for (const m of itemImpressoras(i)) conta.set(m, (conta.get(m) ?? 0) + 1);
    });
    const ordem = [...MAQUINAS_DE_IMPRESSAO, SEM_IMPRESSORA];
    return ordem
      .filter(m => (conta.get(m) ?? 0) > 0 || filtros.impressora.includes(m))
      .map(m => ({
        value: m,
        label: m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m),
        count: conta.get(m) ?? 0,
        pinned: true,
        title: m === SEM_IMPRESSORA
          ? "Em impressão sem a máquina informada (peças de antes do controle de máquinas)."
          : "Peças desta impressora — imprimindo, reservadas na fila dela ou já impressas nela (o mesmo cartão de Máquinas).",
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gFacetPool, filtros.impressora]);


  return {
    poolDaBusca, recorteDasPassadas, gFacetPool,
    eventFilterOptions, typeFilterOptions, materialFilterOptions, finishFilterOptions,
    groupFilterOptions, percursoFilterOptions, statusFilterOptions, mesFilterOptions, impressoraFilterOptions,
  };
}
