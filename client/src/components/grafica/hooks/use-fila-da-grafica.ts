// ─────────────────────────────────────────────────────────────────────────────
// A FILA DA GRÁFICA — os dados e o recorte, fora do desenho.
//
// A query de /api/items/approved (com o delta do queryClient), o recorte dos
// filtros espelhado na URL, as facetas, a lista ordenada e filtrada, os
// números dos cartões e do resumo, e o orçamento de linhas desenhadas por lote.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStatusLabel, seloPecaEventoFinalizado, todayBusinessMs } from "@/lib/status";
import type { SeloPecaEventoFinalizado } from "@/lib/status";
import { ehMolde, statusParaContagem } from "@shared/molde";
import { rotuloDaMaquina, podeIrParaTubo } from "@shared/fluxo-peca";
import { eventoBarraImpressas } from "@shared/impressao-dividida";
import { pecaTravada } from "@shared/trava-da-peca";
import { isDelivered, isPosConferencia, conferredOf, qtyOf, m2ToProduce, remainingProduce, reusedTotalOf, isComplement } from "@/lib/saldo";
// Leitura/ordenação do código da peça: fonte única em lib/displayId.ts, o mesmo
// módulo que Painel Geral, Arte e Vincular usam (e espelho de server/storage.ts).
// "#0062-C1" tem de ordenar COLADO em "#0062" — com o replace(/\D/g,'')
// virava 621 e o complemento aparecia centenas de linhas longe da mãe.
import { compareDisplayId } from "@/lib/displayId";
// Recorte da fila: fonte única em lib/grafica-filtros.ts. O recorte é UM
// objeto: contagem, descrição, URL e casamento item↔filtro saem todos dele —
// uma lista de "há filtro ativo?" mantida à mão esqueceria o próximo filtro.
import {
  FILTROS_VAZIOS, filtrosDaURL, filtrosParaQuery, itemCasaFiltros,
  contarFiltrosAtivos, temFiltroAtivo, descreverFiltros, nomeDoMes, escondeEntregues,
  hojeEmUTC, normKey, SEM_IMPRESSORA, casaStatus,
  type GraficaFiltros,
} from "@/lib/grafica-filtros";
import type { ModeloDoCatalogo, PecaDaFila, RegistroDoHistorico } from "@/components/grafica/tipos";
import { FILTRO_DOS_CARTOES, LINHAS_POR_LOTE, ROW_CAP } from "@/components/grafica/fila/regras";
import { useFacetasDaFila } from "./use-facetas-da-fila";

export type FilaDaGrafica = ReturnType<typeof useFilaDaGrafica>;

export function useFilaDaGrafica() {
  // ── RECORTE (os doze filtros) ─────────────────────────────────────────────
  // UM objeto, inicializado da URL: F5 não perde o trabalho de filtrar e dá
  // para mandar no WhatsApp o link de "peças do evento de sábado que faltam
  // entregar". Mesmo padrão de outras nove telas do app.
  //
  // Dentro dele: busca, status, evento, GRUPO ("Placa km") e PERCURSO (5k, 10k)
  // — pedido da Gráfica, o único jeito de montar o lote certo com dezenas de
  // placas quase idênticas na fila —, tipo, material, acabamento, mês,
  // próximos 10 dias, o chip de complementos e o "mostrar entregues".
  //
  // O chip de complementos recorta a fila para os aumentos pedidos depois que a
  // peça já estava em produção. Os complementos NÃO são pinados no topo da lista
  // (arrancá-los do bloco do evento duplicaria cabeçalhos, e a Gráfica trabalha
  // POR EVENTO com o caminhão marcado) — o acesso rápido vem deste filtro.
  const [filtros, setFiltros] = useState<GraficaFiltros>(() => filtrosDaURL(window.location.search));
  const patchFiltros = (p: Partial<GraficaFiltros>) => setFiltros(f => ({ ...f, ...p }));
  // Busca com debounce: o input responde a cada tecla, o RECORTE só 200ms
  // depois. Sem isto, cada tecla refiltrava, reordenava e reagrupava a base
  // inteira — que inclui todo o histórico de entregues — e recalculava as seis
  // listas de faceta.
  const [buscaInput, setBuscaInput] = useState(() => filtrosDaURL(window.location.search).busca);
  // Grupos por evento já expandidos além do ROW_CAP.
  const [gruposExpandidos, setGruposExpandidos] = useState<Set<string>>(new Set());

  const { data: pecasDoServidor = [], isLoading, isError, error, refetch, isFetching, dataUpdatedAt } = useQuery<PecaDaFila[]>({
    queryKey: ["/api/items/approved"],
    // Override LOCAL do default global (staleTime: Infinity, sem refetch em
    // foco). Esta é a única tela do app em que DUAS PESSOAS trabalham a mesma
    // fila ao mesmo tempo — o operador no computador ao lado da impressora e o
    // conferente com o celular ao lado do material — e a aba fica aberta o dia
    // inteiro. O WebSocket agora invalida esta chave em conferência,
    // reaproveitamento e entrega (ver use-websocket.ts); este polling é a rede
    // de segurança para o socket morrer em silêncio.
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 300_000, // 5min (auditoria 27/08): o WebSocket cobre o tempo real; isto é só a rede de segurança de socket morto
  });
  // ── Evento FINALIZADO CONTINUA NA FILA ────────────────────────────────────
  // Regra do dono (17/08): "os eventos finalizados devem aparecer ainda na
  // Revisão e Gráfica". Esta tela filtrava as peças de evento encerrado à mão
  // ou já realizado; não filtra mais.
  //
  // POR QUE AQUI VOLTA E EM ARTE/ATENDIMENTO/VINCULAR CONTINUA ESCONDIDO — é a
  // pergunta óbvia de quem olhar as cinco filas. A guarda do servidor
  // (server/routes/eventoFinalizado.ts) barra o que faz o trabalho ANDAR e
  // permite o que ARRUMA A CASA; das ações que ela permite, CONFERIR e
  // REGISTRAR ENTREGA são desta tela. E não são caso raro: a papelada da
  // entrega chega no dia seguinte ao evento, exatamente quando ele vira
  // "realizado". Esconder a peça tornava impossível executar o que o servidor
  // autoriza — o material saiu, o canhoto chegou, e não havia linha onde
  // clicar. Nas outras três filas nada de permitido sobrou, então lá esconder
  // continua certo: a peça visível só ofereceria 409.
  //
  // A contrapartida está logo abaixo e é obrigatória: `seloDoItem` declara a
  // peça na linha e no card, e os botões barrados (produzir, reaproveitar,
  // corrigir reaproveitamento, aumentar quantidade) vêm DESABILITADOS com o
  // motivo no `title`. Peça de evento morto sem sinal, com botão que só
  // devolve 409, seria pior do que escondê-la.
  //
  // `item.event` vem CRU do storage (nunca passa por enrichEvent): traz
  // `status` ("closed") e `startDate` — as duas colunas que o predicado lê.
  const hojeBusinessMs = todayBusinessMs();
  const items = pecasDoServidor;
  // Um selo por peça, calculado uma vez. `null` = evento em jogo, linha normal.
  const selosPorItem = useMemo(() => {
    const m = new Map<string, SeloPecaEventoFinalizado>();
    for (const i of items) {
      const s = seloPecaEventoFinalizado(i.event, hojeBusinessMs);
      if (s) m.set(i.id, s);
    }
    return m;
  }, [items, hojeBusinessMs]);
  const seloDoItem = (item: PecaDaFila): SeloPecaEventoFinalizado | null => selosPorItem.get(item.id) ?? null;
  // INFORMAR IMPRESSAS no evento realizado (decisão IMPRESSAS_EM_EVENTO_REALIZADO):
  // a peça que já estava na impressora segue podendo dizer o que saiu — o selo
  // só barra o botão de impressão quando o servidor também barraria.
  const seloDaImpressao = (item: PecaDaFila, selo: SeloPecaEventoFinalizado | null): SeloPecaEventoFinalizado | null =>
    selo && eventoBarraImpressas(selo.motivo, item?.status) ? selo : null;

  // Sem botão "Atualizar" (regra do dono): a tela se atualiza sozinha. O selo
  // "Atualizado há X" é a promessa de veracidade e o spinner ao lado é o único
  // sinal de recarga em curso. O "Tentar novamente" do estado de ERRO fica: lá
  // a recarga automática falhou e o clique é recuperação, não rotina.
  //
  // Tick de 1 min: "há 12 min" calculado no render congelaria no primeiro paint.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Debounce da busca (200ms) — ver o comentário do estado `buscaInput`.
  // Busca igual à do recorte devolve o MESMO objeto: um objeto novo com o mesmo
  // conteúdo (o disparo da montagem, por exemplo) refazia a filtragem, as oito
  // facetas e os contadores sobre a base inteira sem mudar nada na tela.
  useEffect(() => {
    const t = setTimeout(() => setFiltros(f => (f.busca === buscaInput ? f : { ...f, busca: buscaInput })), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaInput]);

  // URL espelhando o recorte (replaceState: não polui o histórico). Com o mesmo
  // debounce de 200ms da busca, para digitar não escrever uma entrada por tecla.
  // `filtrosParaQuery` parte da query ATUAL e sobrescreve só as chaves
  // gerenciadas — o `?item=` do deep link do sino sobrevive até o efeito dele
  // limpá-lo, e qualquer param alheio também.
  useEffect(() => {
    const t = setTimeout(() => {
      const qs = filtrosParaQuery(window.location.search, filtros);
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    }, 200);
    return () => clearTimeout(t);
  }, [filtros]);

  // Voltar/avançar do navegador: reidrata o recorte a partir da URL. Sem isto o
  // back trocava a URL e a tela continuava com os filtros novos.
  useEffect(() => {
    const onPop = () => {
      const f = filtrosDaURL(window.location.search);
      setFiltros(f);
      setBuscaInput(f.busca);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Enquanto o `npm run db:push` das colunas de complemento não roda, o SELECT
  // do Drizzle pede colunas que não existem e a leitura inteira falha (não só
  // o recurso). Sem esta detecção a tela diria "verifique sua conexão" e o
  // operador ligaria para o suporte errado.
  const migracaoPendente = /parent_item_id|complement_|migra[çc][ãa]o pendente|42703/i
    .test(String((error as Error | null)?.message ?? ""));

  const { data: standardItems = [] } = useQuery<ModeloDoCatalogo[]>({ queryKey: ['/api/standard-items'] });
  const typeToGroup = useMemo(() => {
    const map: Record<string, string> = {};
    standardItems.forEach((s) => { if (s.group) map[s.name] = s.group; });
    return map;
  }, [standardItems]);

  // Resolve o GRUPO da peça (catálogo de Modelos) tolerando maiúscula, acento
  // e espaço — mesma regra da Arte: o type casa com o NOME de um modelo
  // (name → group) ou direto com um NOME DE GRUPO, para itens vindos da
  // planilha caírem no grupo certo. É o que a Gráfica usa para separar, por
  // exemplo, as placas de 5km das de 10km.
  const groupMaps = useMemo(() => {
    const byName: Record<string, string> = {};
    const byGroup: Record<string, string> = {};
    standardItems.forEach((s) => {
      if (s.group) {
        byName[normKey(s.name)] = s.group;
        byGroup[normKey(s.group)] = s.group;
      }
    });
    return { byName, byGroup };
  }, [standardItems]);
  // Memoizado com as deps reais: `groupOf` entra no ctx de TODA avaliação de
  // filtro (a lista, o pool dos KPIs e as seis facetas). Como identidade nova a
  // cada render, ele invalidava todos os useMemo derivados de uma vez.
  const groupOf = useMemo(() => {
    const cache = new Map<string, string>();
    return (type: string): string => {
      const achado = cache.get(type);
      if (achado !== undefined) return achado;
      const k = normKey(type);
      // normalize("NFD") + duas regex por chamada, várias vezes por render e
      // sobre a base inteira: o cache por `type` (dezenas de valores distintos,
      // não milhares) tira a conta do caminho quente da digitação.
      const g = groupMaps.byName[k] || groupMaps.byGroup[k] || "";
      cache.set(type, g);
      return g;
    };
  }, [groupMaps]);

  // Âncora temporal dos filtros de data, em UTC (o mesmo fuso da Saída exibida).
  // Presa ao tick de 1 min para a virada de meia-noite não exigir F5.
  // A dependência é o DIA (número), não o tick: com `agora` nas deps o contexto
  // mudava a cada minuto e toda a filtragem, as facetas e os contadores eram
  // refeitos sobre a base inteira uma vez por minuto, sem nada ter mudado.
  const hojeUTC = hojeEmUTC(new Date(agora));
  const ctxFiltros = useMemo(() => ({ groupOf, hojeUTC }), [groupOf, hojeUTC]);

  // As facetas (as opções de cada dropdown) — ver use-facetas-da-fila.ts.
  const facetas = useFacetasDaFila({ items, filtros, ctxFiltros, groupOf });
  const { poolDaBusca, recorteDasPassadas, eventFilterOptions } = facetas;

  // O casamento item↔recorte mora em lib/grafica-filtros.ts. A lista e o pool
  // dos KPIs usam a MESMA função; a única diferença é `ignorarStatus`, que
  // desliga os três recortes com forma de status (o filtro de status, o chip de
  // complementos e a ocultação das entregues) para cada card poder mostrar a
  // contagem do seu próprio status dentro do recorte atual.
  //
  // ORDENAR UMA VEZ, FILTRAR MUITAS. A ordem da fila não depende do recorte,
  // mas era refeita (4 mil peças, dois `new Date` por comparação) a cada tecla
  // da busca e a cada clique de aba. Agora a base ordenada fica guardada por
  // versão de `items` e o recorte só filtra — `filter` preserva a ordem e o
  // `sort` é estável, então o resultado é idêntico ao de filtrar e depois
  // ordenar. A data de saída é lida uma vez por peça, não por comparação.
  const filaOrdenadaRef = useRef<{ base: PecaDaFila[]; ordenada: PecaDaFila[] } | null>(null);
  const filteredItems = useMemo(() => {
    if (filaOrdenadaRef.current?.base !== items) {
      const saidaMs = new Map<PecaDaFila, number>();
      for (const i of items) {
        saidaMs.set(i, i.event?.truckDepartureDate ? new Date(i.event.truckDepartureDate).getTime() : Infinity);
      }
      filaOrdenadaRef.current = { base: items, ordenada: [...items].sort((a, b) => {
        // Urgência primeiro: evento com saída do caminhão mais próxima no topo;
        // sem data vai para o fim. Nome desempata (e mantém os grupos estáveis).
        const da = saidaMs.get(a)!;
        const db = saidaMs.get(b)!;
        if (da !== db) return da - db;
        const ea = a.event?.name || ""; const eb = b.event?.name || "";
        if (ea !== eb) return ea.localeCompare(eb);
        // PRIORITÁRIA sobe DENTRO do bloco do evento (dono, 27/08): o macro é
        // do caminhão (a Gráfica trabalha por evento e data de saída), mas
        // dentro do evento a peça marcada sai na frente.
        const prio = Number(!!b.isPriority) - Number(!!a.isPriority);
        if (prio !== 0) return prio;
        if (a.type !== b.type) return a.type.localeCompare(b.type);
        // 4º critério: o complemento COLA na peça original. #0062 → #0062-C1 →
        // #0062-C2 → #0063. O filho herda eventId e type, então os três
        // critérios anteriores sempre empatam e ele cai logo abaixo da mãe —
        // sem isso "#0062-C1" ordenaria como 621 e apareceria a centenas de
        // linhas dela, criando exatamente a duplicidade confusa que o modelo
        // de complemento existe para evitar. Os cabeçalhos de evento/grupo/tipo
        // (derivados por comparação com a linha anterior) seguem corretos.
        return compareDisplayId(a.displayId, b.displayId);
      }) };
    }
    // Com busca, só entra quem passou por ela (`poolDaBusca`, uma passada só).
    const naBusca = poolDaBusca === items ? null : new Set(poolDaBusca);
    return filaOrdenadaRef.current.ordenada.filter((item) =>
      (naBusca === null || naBusca.has(item)) && itemCasaFiltros(item, recorteDasPassadas, ctxFiltros));
  }, [items, poolDaBusca, recorteDasPassadas, ctxFiltros]);

  // statsPool: todos os filtros ativos EXCETO os de forma de status — os cards
  // mostram a contagem de cada status dentro do recorte atual. É também de onde
  // sai o "Entregues ocultas (N)": o KPI Entregues não pode ler 0 justamente
  // porque as entregues estão ocultas.
  const statsPool = useMemo(() =>
    poolDaBusca.filter((item) => itemCasaFiltros(item, recorteDasPassadas, ctxFiltros, { ignorarStatus: true })),
    [poolDaBusca, recorteDasPassadas, ctxFiltros]);
  // A REGRA DOS NÚMEROS DESTA TELA, uma só: TODO contador conta o que a tela
  // MOSTRA. Com as peças de evento finalizado de volta à fila, elas entram nos
  // seis cards, no "N peças" do recorte e no rodapé de m² — pelo mesmo motivo
  // que o Painel Geral adotou ao revelar as dele: número que não bate com a
  // lista logo abaixo é o defeito mais caro de todos, porque não dá para
  // perceber. Quem quiser o recorte "só trabalho vivo" tem os filtros; o que
  // não pode existir é um KPI dizendo 12 sobre uma lista de 15.
  //
  // O QUE ESSA REGRA DEVE, e o chip abaixo paga: sozinho, "18 A PRODUZIR"
  // esconde que 6 são de evento que já aconteceu. O número segue a lista, e o
  // chip diz quanto dele é trabalho morto.
  // Memoizado: eram seis varreduras do pool a CADA render da página (cada tecla,
  // cada modal aberto, cada peça marcada no lote), sem o recorte ter mudado.
  // Mesmas seis perguntas, mesmas contagens.
  // CONTA E FILTRO COM A MESMA LISTA: cada cartão conta com `casaStatus` — a
  // mesma régua que o filtro aplica ao clicar (lib/grafica-filtros). Antes a
  // conta era escrita à parte ("Em Revisão" contava 3 status e filtrava 1;
  // "Liberados" contava a grafia legada e não a filtrava) e o número do cartão
  // não batia com a lista que o clique abria. MOLDE: statusParaContagem manda
  // o produzido para Entregues.
  const stats = useMemo(() => {
    const conta = (vals: readonly string[]) => statsPool.filter((i) => vals.some((v) => casaStatus(statusParaContagem(i), v))).length;
    return {
      revisao:    conta(FILTRO_DOS_CARTOES.revisao),
      liberados:  conta(FILTRO_DOS_CARTOES.liberados),
      emProducao: conta(FILTRO_DOS_CARTOES.emProducao),
      produzidos: conta(FILTRO_DOS_CARTOES.produzidos),
      conferidos: conta(FILTRO_DOS_CARTOES.conferidos),
      embalados:  conta(FILTRO_DOS_CARTOES.embalados),
      entregues:  conta(FILTRO_DOS_CARTOES.entregues),
      total:      statsPool.length,
    };
  }, [statsPool]);

  // Quanto do recorte é peça de evento finalizado — o contrapeso do parágrafo
  // acima. Sai do MESMO `statsPool` dos cards, senão o chip contaria uma
  // população e os KPIs outra.
  const finalizadasNoRecorte = useMemo(() => {
    let encerrado = 0, realizado = 0;
    for (const i of statsPool) {
      const s = selosPorItem.get(i.id);
      if (s?.motivo === "encerrado") encerrado++;
      else if (s?.motivo === "realizado") realizado++;
    }
    return { encerrado, realizado, total: encerrado + realizado };
  }, [statsPool, selosPorItem]);

  // ── Complementos no recorte atual (alimenta o chip do cabeçalho) ──
  // Em ABERTO = ainda não entregues: é o trabalho que apareceu depois e ainda
  // não terminou. O chip aparece também quando o filtro está ligado e o recorte
  // esvaziou — senão o botão sumiria com o filtro preso e sem caminho de volta.
  const complementosAbertos = useMemo(
    () => statsPool.filter((i) => isComplement(i) && !isDelivered(i)),
    [statsPool],
  );
  const complementosNaLista = useMemo(
    () => statsPool.filter((i) => isComplement(i)),
    [statsPool],
  );
  const complementoUn = complementosAbertos.reduce((s: number, i) => s + qtyOf(i), 0);
  const complementoAProduzir = complementosAbertos.reduce((s: number, i) => s + remainingProduce(i), 0);
  /**
   * Peças com reaproveitamento no recorte atual (total ou parcial) — a mesma
   * régua dos chips verdes da linha. Conta SEM a própria dimensão (o pool que
   * alimenta os cards), senão ligar o chip zeraria o número dele.
   */
  const comReusoNaLista = useMemo(
    () => statsPool.filter((i) => i.isReuse || reusedTotalOf(i) > 0).length,
    [statsPool],
  );

  const complementoChipLabel = complementosAbertos.length > 0
    // "a produzir" só quando ainda há impressão pela frente; se já produziu
    // tudo e falta conferir/entregar, o texto seria mentira.
    ? `+${complementoUn} un. em ${complementosAbertos.length} complemento${complementosAbertos.length !== 1 ? "s" : ""} ${complementoAProduzir > 0 ? "a produzir" : "em aberto"}`
    : `${complementosNaLista.length} complemento${complementosNaLista.length !== 1 ? "s" : ""} na lista`;

  // ── Entregues ocultas ─────────────────────────────────────────────────────
  // A tela abre na FILA DO QUE FALTA, não no arquivo de tudo que já foi
  // liberado. Esconder dado sem dizer que está escondido, porém, é pior que o
  // problema: este número alimenta o chip de reversão do rodapé e o atalho do
  // empty state, que são parte da feature e não um extra.
  //
  // O número é O QUE O CLIQUE TRAZ, não o que está escondido — a mesma régua dos
  // menus de filtro (lib/grafica-filtros), aplicada a um chip. Contando "as
  // entregues do statsPool", com o status "Em produção" escolhido o chip
  // prometia "5 entregues ocultas · mostrar" e o clique não trazia nenhuma: o
  // filtro de status continua excluindo as entregues depois de revelá-las.
  // Simular o recorte pós-clique é a única conta que não pode mentir.
  const entreguesOcultas = useMemo(() => {
    if (!escondeEntregues(filtros)) return 0;
    const aoMostrar = items
      .filter((i) => itemCasaFiltros(i, { ...filtros, entregues: true }, ctxFiltros)).length;
    return Math.max(0, aoMostrar - filteredItems.length);
  }, [items, filtros, ctxFiltros, filteredItems]);

  // Contagem e descrição do recorte — derivadas da tabela de campos da lib, não
  // de uma lista escrita à mão que o próximo filtro esqueceria de atualizar.
  const nFiltros = contarFiltrosAtivos(filtros);
  // No celular o EVENTO fica à vista na barra (dono, 21/09) — o "Filtros (N)"
  // da folha conta só o que está DENTRO dela.
  const nFiltrosNaFolha = nFiltros - (filtros.evento.length > 0 ? 1 : 0);
  const haFiltro = temFiltroAtivo(filtros);
  const limparFiltros = () => {
    setFiltros({ ...FILTROS_VAZIOS, entregues: filtros.entregues });
    setBuscaInput("");
  };
  // Rótulos bonitos para o empty state: status e evento são chaves/ids na URL.
  const descricaoFiltros = descreverFiltros(filtros, {
    status: (v) => v.map(getStatusLabel).join(", "),
    evento: (v) => v.map(id => eventFilterOptions.find(o => o.value === id)?.label ?? id).join(", "),
    mes: (v) => v.map(nomeDoMes).join(", "),
    impressora: (v) => v.map(m => m === SEM_IMPRESSORA ? "Sem impressora" : rotuloDaMaquina(m)).join(", "),
  });

  // ── Renderização incremental ──────────────────────────────────────────────
  // Cada bloco de evento desenha até ROW_CAP linhas; o resto entra por "Mostrar
  // todas". A fila inclui as entregues de todo o histórico e o endpoint não tem
  // recorte de período, então sem teto a tela pintava milhares de linhas
  // concluídas (miniatura, badges e handlers de hover em cada uma) a cada
  // entrada na rota. `filteredItems` já vem ordenado por evento, então as peças
  // de um mesmo evento são contíguas e o Map preserva a ordem.
  // (Mora ANTES dos efeitos de rolagem até a peça recém-criada, que precisam
  // saber se a linha dela já está desenhada.)
  const { linhasVisiveis, cortePorItem } = useMemo(() => {
    const porEvento = new Map<string, PecaDaFila[]>();
    for (const i of filteredItems) {
      const chave = String(i.eventId ?? i.event?.name ?? "sem-evento");
      const arr = porEvento.get(chave);
      if (arr) arr.push(i); else porEvento.set(chave, [i]);
    }
    const linhas: PecaDaFila[] = [];
    const corte = new Map<string, { chave: string; total: number; ocultas: number }>();
    porEvento.forEach((arr, chave) => {
      const aberto = gruposExpandidos.has(chave) || arr.length <= ROW_CAP;
      const visiveis = aberto ? arr : arr.slice(0, ROW_CAP);
      linhas.push(...visiveis);
      if (!aberto) {
        // Marca a ÚLTIMA linha visível do bloco: é depois dela que entra o
        // "Mostrar todas", dentro do bloco a que o número pertence.
        corte.set(visiveis[visiveis.length - 1].id, { chave, total: arr.length, ocultas: arr.length - visiveis.length });
      }
    });
    return { linhasVisiveis: linhas, cortePorItem: corte };
  }, [filteredItems, gruposExpandidos]);

  const expandirGrupo = (chave: string) =>
    setGruposExpandidos(prev => { const n = new Set(prev); n.add(chave); return n; });

  // ── Lotes de linhas no DOM (LINHAS_POR_LOTE) ──
  // O orçamento vale para UM recorte: guardado junto do objeto `filtros` em que
  // nasceu, ele volta ao primeiro lote sozinho quando o recorte muda (lista
  // nova começa do topo) e sobrevive às revalidações — quem rolou até a linha
  // 400 não é devolvido à 60 quando o polling ou o WebSocket trazem dado novo.
  const [orcamentoLinhas, setOrcamentoLinhas] = useState<{ recorte: GraficaFiltros; n: number }>(
    () => ({ recorte: filtros, n: LINHAS_POR_LOTE }),
  );
  const limiteLinhas = orcamentoLinhas.recorte === filtros ? orcamentoLinhas.n : LINHAS_POR_LOTE;
  const linhasRenderizadas = useMemo(
    () => (linhasVisiveis.length > limiteLinhas ? linhasVisiveis.slice(0, limiteLinhas) : linhasVisiveis),
    [linhasVisiveis, limiteLinhas],
  );
  // Números do resumo do recorte ("N peças · M eventos · X m² a produzir…").
  // Eram cinco varreduras de `filteredItems` (duas delas criando um Set) a CADA
  // render da página — cada tecla, cada modal, cada peça marcada. Uma passada,
  // na mesma ordem e com as mesmas regras: entregue fica fora das somas de m² e
  // de reaproveitamento; evento sem id não conta.
  const resumoDaLista = useMemo(() => {
    let complementos = 0, entreguesNaLista = 0, totalM2 = 0, printM2 = 0, reusedUn = 0;
    const eventos = new Set<unknown>();
    for (const i of filteredItems) {
      if (isComplement(i)) complementos++;
      if (i.eventId) eventos.add(i.eventId);
      if (isDelivered(i)) { entreguesNaLista++; continue; }
      totalM2 += Number(i.calculatedM2) || 0;
      printM2 += m2ToProduce(i);
      reusedUn += reusedTotalOf(i);
    }
    return { complementos, eventos: eventos.size, entreguesNaLista, totalM2, printM2, reusedUn };
  }, [filteredItems]);

  /** Garante ao menos `minimo` linhas no DOM (padrão: mais um lote). */
  const desenharMaisLinhas = (minimo = limiteLinhas + LINHAS_POR_LOTE) =>
    // Transição: o lote novo entra sem travar a rolagem nem o que se digita.
    startTransition(() => setOrcamentoLinhas(o => {
      const atual = o.recorte === filtros ? o.n : LINHAS_POR_LOTE;
      return minimo <= atual ? o : { recorte: filtros, n: minimo };
    }));

  // Deep link do sino: /grafica?item=<id> cai aqui vindo da notificação de
  // complemento. Joga o displayId no campo de busca (que já procura por ele) e
  // limpa a URL, para um F5 não reaplicar o recorte — mesmo padrão do
  // event-detail. Espera a lista chegar: com o cache vazio o uuid não
  // resolveria para displayId e a busca cairia em "nenhuma peça encontrada".
  useEffect(() => {
    if (isLoading) return;
    const alvoId = new URLSearchParams(window.location.search).get("item");
    if (!alvoId) return;
    const alvo = items.find((i) => i.id === alvoId);
    const busca = alvo?.displayId ?? alvoId;
    setBuscaInput(busca);
    patchFiltros({ busca });
    // Remove só o `item=`: o recorte do operador (que agora vive na URL) tem de
    // sobreviver ao deep link. Antes o replaceState apagava a query inteira.
    const p = new URLSearchParams(window.location.search);
    p.delete("item");
    const qs = p.toString();
    window.history.replaceState({}, "", qs ? `?${qs}` : window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, isLoading]);

  const nTravadas = useMemo(() => pecasDoServidor.filter((i) => pecaTravada(i) && !isDelivered(i)).length, [pecasDoServidor]);

  /**
   * ETIQUETAS NO CAMINHO DE QUEM CONFERE (pedido do dono, 25/08): depois de
   * conferir, a etiqueta se imprime — e a porta ficava só no Detalhe do
   * Evento, fora do fluxo da Gráfica. Conta as peças já conferidas de cada
   * evento NO RECORTE ATUAL; o cabeçalho do evento ganha o atalho quando
   * há alguma.
   */
  const etiquetaveisPorEvento = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filteredItems) {
      if (ehMolde(i) || !(conferredOf(i) > 0 || isPosConferencia(i) || isDelivered(i))) continue; // molde não tem etiqueta
      const id = String(i.eventId ?? "");
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [filteredItems]);

  // TUBOS (dono, 14/09): peças que já saíram da impressão ou estão num tubo —
  // o cabeçalho do evento ganha o botão "Tubos" quando há alguma.
  const tubaveisPorEvento = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of filteredItems) {
      if (ehMolde(i) || !(podeIrParaTubo(i.status) || i.tuboId)) continue; // molde não vai para tubo
      const id = String(i.eventId ?? "");
      if (!id) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
    return m;
  }, [filteredItems]);

  // Índice por id da lista COMPLETA. Resolver o lote com `find` era O(lote ×
  // fila): "Todas (2.000)" numa fila de 4 mil davam 4 milhões de comparações a
  // cada peça marcada — e de novo ao confirmar.
  const itemPorId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  return {
    pecasDoServidor, items, isLoading, isError, error, refetch, isFetching, dataUpdatedAt, migracaoPendente,
    hojeBusinessMs, selosPorItem, seloDoItem, seloDaImpressao, agora, hojeUTC,
    filtros, setFiltros, patchFiltros, buscaInput, setBuscaInput, limparFiltros,
    typeToGroup, groupOf, ctxFiltros,
    ...facetas,
    filteredItems, statsPool, stats, finalizadasNoRecorte,
    complementosAbertos, complementosNaLista, complementoChipLabel, comReusoNaLista, entreguesOcultas,
    nFiltros, nFiltrosNaFolha, haFiltro, descricaoFiltros,
    gruposExpandidos, setGruposExpandidos, expandirGrupo, linhasVisiveis, cortePorItem,
    setOrcamentoLinhas, limiteLinhas, linhasRenderizadas, desenharMaisLinhas, resumoDaLista,
    nTravadas, etiquetaveisPorEvento, tubaveisPorEvento, itemPorId,
  };
}

/**
 * Histórico DA PEÇA aberta, com escopo no servidor. A listagem global tem teto
 * de 500 registros — peça antiga cairia fora da janela e a ficha mostraria
 * "sem histórico".
 */
export function useHistoricoDaPeca(itemId: string | undefined) {
  const { data: auditLogs = [] } = useQuery<RegistroDoHistorico[]>({
    queryKey: ["/api/audit-logs", "item", itemId],
    queryFn: () =>
      fetch(`/api/audit-logs?entityType=item&entityId=${itemId}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Falha ao carregar o histórico (HTTP ${r.status})`))),
    select: d => (Array.isArray(d) ? d : []),
    enabled: !!itemId,
    placeholderData: [],
  });
  return auditLogs;
}
