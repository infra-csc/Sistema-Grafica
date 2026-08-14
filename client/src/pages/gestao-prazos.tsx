// Gestão de Prazos — visão do diretor. Responde em uma tela: o que está
// atrasado, o quanto, e quem está travando. Todo o cálculo de marcos vive no
// servidor (GET /api/prazos); aqui só se filtra e se pinta.
//
// O CONTRATO do payload é `@shared/prazos-contract`, o MESMO arquivo que o
// servidor importa — antes era datilografado dos dois lados e um campo
// renomeado virava `undefined` na tela, sem erro de compilação e sem log.
//
// NENHUM `new Date()` decide regra aqui. O dia do negócio (`payload.today`),
// os dias até a saída (`diasParaSaida`), o pior atraso e a validade da
// promessa vêm prontos, ancorados em America/Sao_Paulo. O relógio do
// navegador só formata: numa VM em UTC ou com o diretor viajando, entre 21h e
// 00h os dois relógios discordam em um dia e o KPI passava a se contradizer
// com o resultado do próprio clique.
//
// Estado, filtros e composição moram nesta página; os blocos visuais moram em
// `@/components/prazos/*`.
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback, Fragment } from "react";
import { Link } from "wouter";
import {
  Truck, ChevronDown, RotateCcw, Search, CalendarRange,
  AlertTriangle, CheckCircle2, Printer, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { FilterSelect } from "@/components/filter-select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { getPriorityMeta, PRIORITY } from "@/lib/status";
import { useIsMobile } from "@/hooks/use-mobile";
import { onPrazosInvalidated } from "@/hooks/use-websocket";
import type {
  CobrancaEntry, PrazoEvent, PrazosPayload,
} from "@shared/prazos-contract";
import {
  addDaysStr, apiErrorMessage, currentStageIdx, diasTexto, eventHasOverdue,
  fmtDayMonth, fmtRelative, fmtSaida, normalize, pecasTexto, saidaChip,
  weekdayOfDay, LEGENDA_TRILHA, R, SHADOW,
  STAGE_HEADERS, STAGE_SECTOR, STAGE_SHORT, TI,
} from "@/components/prazos/tokens";
import { StageCell } from "@/components/prazos/stage-cell";
import { KpiCard } from "@/components/prazos/kpi-card";
import { CobradoControl } from "@/components/prazos/cobrado-control";
import { EventDrilldown } from "@/components/prazos/event-drilldown";
import { QuadroCard } from "@/components/prazos/quadro-card";
import { QuadroColuna } from "@/components/prazos/quadro-coluna";
import { FilterChip } from "@/components/prazos/filter-chip";
import { AnaliseBand } from "@/components/prazos/analise-band";
import { CardMobilePrazos } from "@/components/prazos/card-mobile";
import { TabelaPrazos } from "@/components/prazos/tabela-prazos";
import { PecasAtrasadas } from "@/components/prazos/pecas-atrasadas";
import { computePecasAtrasadas, filtrarPecasAtrasadas } from "@/components/prazos/atrasadas";
import { computeEventosPorEtapa, computeSectorSummary } from "@/components/prazos/gargalos";

/**
 * As três visões do MESMO conjunto filtrado.
 *
 * `quadro` e `tabela` são orientadas a EVENTO (o funil visto de cima e a
 * versão densa dele). `atrasadas` é orientada a PEÇA: uma linha por peça
 * atrasada, de todos os eventos juntos — a resposta direta a "o que está
 * atrasado agora", que era a pergunta que a tela obrigava a montar à mão,
 * abrindo o drill de um evento por vez.
 */
type Visao = "quadro" | "tabela" | "atrasadas";

const VISAO_LABEL: Record<Visao, string> = {
  quadro: "Quadro",
  tabela: "Tabela",
  atrasadas: "Peças atrasadas",
};

/** Atalho de teclado de cada visão (paridade com o Q/T que já existia). */
const VISAO_TECLA: Record<Visao, string> = { quadro: "Q", tabela: "T", atrasadas: "A" };

function parseVisao(raw: string | null): Visao {
  return raw === "tabela" || raw === "atrasadas" ? raw : "quadro";
}

export default function GestaoPrazos() {
  const isMobile = useIsMobile();
  const { toast } = useToast();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PrazosPayload>({
    queryKey: ["/api/prazos"],
    // Override LOCAL (o default global é staleTime: Infinity + sem refetch em
    // foco). O selo "Atualizado há X" é uma promessa explícita de veracidade e
    // era a parte que mais mentia: numa sexta à noite sem mutações não há
    // mensagem de WebSocket; na segunda de manhã o notebook acordava, a tela
    // servia o agregado de sexta e escrevia "Atualizado há 2h".
    //
    // 60s é deliberado: o GET reagrega o app inteiro, e por isso ele passou a
    // buscar só as peças dos eventos candidatos (índice por evento) na MESMA
    // leva desta mudança — sem aquilo, a tela ficaria mais fresca e mais lenta.
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    // A tela não tem botão "Atualizar": ela se atualiza sozinha (WebSocket
    // invalida a cada mutação de evento/peça) e este polling é a rede de
    // segurança para o socket morrer em silêncio — sem ele, "sem botão"
    // viraria "congelada até o próximo foco de janela".
    refetchInterval: 60_000,
  });

  // Tick de 1 min: "há 12 min" era calculado no render e congelava no instante
  // do primeiro paint. Mesmo padrão (e mesmo motivo) do calendário.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // "N mudanças desde que você abriu": o WebSocket invalida com debounce de
  // 500ms e isso era completamente invisível. A pílula não promete dado novo
  // (a query já revalidou) — promete CONTINUIDADE DE LEITURA: diz que o chão
  // se moveu enquanto o diretor lia, e o clique só zera o contador.
  const [novidades, setNovidades] = useState(0);
  useEffect(() => onPrazosInvalidated(() => setNovidades((n) => n + 1)), []);

  // ── Filtros: estado inicial vindo da URL (regra da casa) ──────────────────
  const initial = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      soAtrasados: p.get("atrasados") === "1",
      soSaidas7d: p.get("saidas7") === "1",
      soSemPecas: p.get("sempecas") === "1",
      soInvalidos: p.get("invalidos") === "1",
      busca: p.get("q") ?? "",
      prioridade: p.get("prioridade") ?? "all",
      etapa: p.get("etapa") ?? "all",
      dia: p.get("dia") ?? "",
      // "Mais atrasado" é o padrão: a tela existe para cobrar atraso — o
      // pior evento tem que ser a primeira linha, não estar no meio da lista.
      ordem: p.get("ordem") === "saida" ? "saida" : "atraso",
      // Quadro é a visão principal (o funil visto de cima); tabela é a densa;
      // `atrasadas` é a lista plana de peças.
      visao: parseVisao(p.get("visao")),
      evento: p.get("evento"),
    };
  }, []);
  const [soAtrasados, setSoAtrasados] = useState(initial.soAtrasados);
  const [soSaidas7d, setSoSaidas7d] = useState(initial.soSaidas7d);
  const [soSemPecas, setSoSemPecas] = useState(initial.soSemPecas);
  const [soInvalidos, setSoInvalidos] = useState(initial.soInvalidos);
  const [busca, setBusca] = useState(initial.busca);
  const [prioridade, setPrioridade] = useState(initial.prioridade);
  const [etapaFoco, setEtapaFoco] = useState(initial.etapa);
  const [diaFoco, setDiaFoco] = useState(initial.dia);
  const [ordem, setOrdem] = useState<"saida" | "atraso">(initial.ordem as "saida" | "atraso");
  const [visao, setVisao] = useState<Visao>(initial.visao);
  // Card do quadro abre o drill num modal (o detalhe "por cima") — a tabela
  // continua expandindo inline. `detailId` entra na URL como ?evento=<id>:
  // F5 e link colado no grupo preservam a pendência exata.
  const [detailId, setDetailId] = useState<string | null>(initial.evento);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showDesdeOntem, setShowDesdeOntem] = useState(false);
  const [printMode, setPrintMode] = useState(false);

  // Última visão de EVENTO usada. O placar "Peças em etapa vencida" leva para
  // a lista de peças e traz de volta — e "de volta" tem que ser de onde a
  // pessoa veio, não um quadro que ela talvez nunca tenha aberto.
  const visaoAntesDaListaRef = useRef<Visao>("quadro");
  useEffect(() => {
    if (visao !== "atrasadas") visaoAntesDaListaRef.current = visao;
  }, [visao]);
  const alternarListaDePecas = useCallback(() => {
    setVisao((atual) => (atual === "atrasadas" ? visaoAntesDaListaRef.current : "atrasadas"));
  }, []);

  // Espelha filtros na URL sem empilhar histórico (preserva o hash).
  // Debounce: replaceState a cada tecla estoura o rate-limit do Safari
  // (~100 chamadas/30s lançam SecurityError e derrubam a árvore React).
  //
  // Continua replaceState, INCLUSIVE para ?evento=: misturar push e replace
  // com este debounce é exatamente a armadilha acima. O que se ganha é F5 e
  // link compartilhável; o que não se ganha é o botão Voltar fechar o modal.
  // Não "consertar" trocando por pushState.
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (soAtrasados) p.set("atrasados", "1");
      if (soSaidas7d) p.set("saidas7", "1");
      if (soSemPecas) p.set("sempecas", "1");
      if (soInvalidos) p.set("invalidos", "1");
      if (busca) p.set("q", busca);
      if (prioridade !== "all") p.set("prioridade", prioridade);
      if (etapaFoco !== "all") p.set("etapa", etapaFoco);
      if (diaFoco) p.set("dia", diaFoco);
      if (ordem !== "atraso") p.set("ordem", ordem);
      if (visao !== "quadro") p.set("visao", visao);
      if (detailId) p.set("evento", detailId);
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [soAtrasados, soSaidas7d, soSemPecas, soInvalidos, busca, prioridade, etapaFoco, diaFoco, ordem, visao, detailId]);

  // Navegação do histórico (voltar/avançar entre telas) sincroniza o estado —
  // sem isto a URL e a tela discordavam depois de um Voltar.
  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search);
      setSoAtrasados(p.get("atrasados") === "1");
      setSoSaidas7d(p.get("saidas7") === "1");
      setSoSemPecas(p.get("sempecas") === "1");
      setSoInvalidos(p.get("invalidos") === "1");
      setBusca(p.get("q") ?? "");
      setPrioridade(p.get("prioridade") ?? "all");
      setEtapaFoco(p.get("etapa") ?? "all");
      setDiaFoco(p.get("dia") ?? "");
      setOrdem(p.get("ordem") === "saida" ? "saida" : "atraso");
      setVisao(parseVisao(p.get("visao")));
      setDetailId(p.get("evento"));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const events = data?.events ?? [];
  const today = data?.today;

  // KPIs vêm do SERVIDOR (fonte única, mesma âncora de "hoje" do semáforo e
  // do snapshot de tendência). Fallback calculado NO CLIENTE para o cenário
  // git-pull-sem-Stop/Run: o Express velho responde sem `kpis` e mostrar
  // zeros com eventos na tela seria o pior dos mundos.
  //
  // O fallback respeita a MESMA precedência de categoria do servidor
  // (semPecas > dataInvalida > atrasado > emDia). Antes ele fazia
  // `emDia = total - atrasados` e contava como "em dia" tanto o evento sem
  // nenhuma peça quanto o de data quebrada.
  const kpis = useMemo(() => {
    if (data?.kpis) return data.kpis;
    const semPecas = events.filter((ev) => ev.totalItems === 0).length;
    const invalidCount = events.filter((ev) => ev.totalItems > 0 && ev.invalidDate).length;
    const atrasados = events.filter((ev) => ev.totalItems > 0 && !ev.invalidDate && eventHasOverdue(ev)).length;
    return {
      atrasados,
      // Sem `kpis` no payload não existe `today` do negócio, e o cliente não
      // refaz essa conta com o relógio local — o KPI fica em 0 e PERDE o
      // clique (ver `onClick` condicional abaixo), em vez de oferecer um
      // filtro que contradiz o número.
      saidas7d: 0,
      pecasAtrasadas: events.reduce((acc, ev) => {
        const overdue = ev.stages.filter((s) => s.state === "overdue");
        return acc + (overdue.length ? overdue[overdue.length - 1].pendingCount : 0);
      }, 0),
      emDia: Math.max(0, events.length - atrasados - invalidCount - semPecas),
      invalidCount,
      semPecas,
    };
  }, [data, events]);
  const kpisDoServidor = !!data?.kpis;
  // O KPI "Saídas em 7 dias" só pode ser CLICÁVEL quando o payload traz o que
  // o FILTRO dele consome, e não basta existir `kpis`: um Express antigo (git
  // pull sem Stop/Run) responde com `kpis` completo e SEM `today`/
  // `diasParaSaida`. O card mostrava um "5" verdadeiro, o clique filtrava por
  // `ev.diasParaSaida == null` e devolvia ZERO evento. Um número clicável que
  // se contradiz com o resultado do próprio clique destrói a credibilidade do
  // placar inteiro — melhor perder o clique e manter o número.
  const podeFiltrarSaidas = kpisDoServidor && !!data?.today;
  const trend = data?.trend ?? null;
  const cobrancas = data?.cobrancas ?? {};
  const desdeOntem = data?.desdeOntem ?? null;

  // `Partial<Record<...>>` de propósito no contrato: enquanto o db:push não
  // rodar o mapa vem VAZIO, e um `cobrancas[key].historico.map(...)` sem
  // guarda derrubaria a tela inteira do diretor.
  const cobrancaEvento = (id: string): CobrancaEntry | undefined => cobrancas[`event:${id}`];

  const prioridadesDisponiveis = useMemo(
    () => Array.from(new Set(events.map((e) => e.priority).filter(Boolean))) as string[],
    [events],
  );

  // Ordem/rótulos das etapas vêm do payload (fonte única) — fallback local
  // só para o primeiro render sem dado.
  const stageMeta = data?.stageMeta ?? STAGE_HEADERS.map((h) => ({ key: h.key, label: h.full }));

  // Gargalo por setor e eventos por etapa: regra de negócio em
  // `components/prazos/gargalos.ts` (funções puras, testadas em
  // server/__tests__/prazo-gargalos.test.ts) — a página só memoiza.
  const sectorSummary = useMemo(
    () => computeSectorSummary(events, stageMeta),
    [events, stageMeta],
  );

  const sponsorDelays = data?.sponsorDelays ?? [];

  const eventosPorEtapa = useMemo(
    () => computeEventosPorEtapa(events, stageMeta),
    [events, stageMeta],
  );

  /**
   * Peneira de EVENTO comum às três visões: os filtros que falam do evento e
   * só dele.
   *
   * Está separada do resto porque etapa, dia e busca mudam de GRÃO na visão de
   * peças — lá "etapa" é a etapa da PEÇA e a busca também procura no código e
   * na descrição dela (ver `components/prazos/atrasadas.ts`). Sem esta divisão
   * a lista plana teria que reescrever os filtros de evento, que é exatamente
   * como nascem dois critérios que discordam.
   */
  const passaFiltroDeEvento = useCallback((ev: PrazoEvent) => {
    if (soAtrasados && !eventHasOverdue(ev)) return false;
    if (soSaidas7d) {
      // `diasParaSaida` já vem do servidor com a âncora do negócio.
      if (ev.diasParaSaida == null) return false;
      if (ev.diasParaSaida < 0 || ev.diasParaSaida > 7) return false;
    }
    // Filtro pela CATEGORIA (exclusiva), não por `invalidDate` solto: é o
    // mesmo critério das contagens do placar, então o filtro nunca devolve
    // um número diferente do que o botão prometeu.
    if (soSemPecas && ev.categoria !== "semPecas") return false;
    if (soInvalidos && ev.categoria !== "dataInvalida") return false;
    if (prioridade !== "all" && ev.priority !== prioridade) return false;
    return true;
  }, [soAtrasados, soSaidas7d, soSemPecas, soInvalidos, prioridade]);

  const filtered = useMemo(() => {
    const q = normalize(busca.trim());
    const list = events.filter((ev) => {
      if (!passaFiltroDeEvento(ev)) return false;
      if (etapaFoco !== "all" && stageMeta[currentStageIdx(ev)]?.key !== etapaFoco) return false;
      // Mesmo predicado da barra "Próximos dias úteis" que gerou o clique,
      // INCLUSIVE o descarte de data inválida: a barra conta sobre
      // `!ev.invalidDate`, e um filtro com critério mais largo que a contagem
      // é exatamente o "clique que devolve um número diferente do que o botão
      // prometeu". Hoje um prazo derivado de ano-lixo (0206) nunca cairia num
      // dos próximos 15 dias, então a linha não muda resultado nenhum — ela
      // impede que a divergência nasça na próxima mexida na barra.
      if (diaFoco && (ev.invalidDate || !ev.stages.some((s) => s.deadline === diaFoco && s.state !== "done"))) return false;
      if (q && !normalize(ev.name).includes(q)) return false;
      return true;
    });
    if (ordem === "atraso") {
      // Pior atraso primeiro. `piorAtrasoDias` vem PRONTO do servidor (mesma
      // âncora do semáforo); sem atraso, desempata por saída.
      return [...list].sort((a, b) =>
        b.piorAtrasoDias - a.piorAtrasoDias
        || new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());
    }
    // "Próxima saída" ordena de verdade. Antes fazia `return list` e dependia
    // em silêncio do .sort() do servidor: acertava por coincidência e
    // quebraria sem sintoma na primeira paginação.
    return [...list].sort((a, b) =>
      new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());
  }, [events, passaFiltroDeEvento, etapaFoco, diaFoco, busca, ordem, stageMeta]);

  // ── Visão de peças: a lista plana ────────────────────────────────────────
  // Duas listas de propósito. A COMPLETA (sem filtro nenhum) é o denominador
  // honesto — é ela que sustenta o "de 437 no total" e, principalmente, a
  // diferença entre "não há peça atrasada" e "os seus filtros escondem todas".
  // A FILTRADA é o que a tela desenha.
  const pecasAtrasadasTodas = useMemo(() => computePecasAtrasadas(events), [events]);
  const pecasAtrasadas = useMemo(
    () => filtrarPecasAtrasadas(
      computePecasAtrasadas(events.filter(passaFiltroDeEvento)),
      { busca, etapaKey: etapaFoco, dia: diaFoco },
    ),
    [events, passaFiltroDeEvento, busca, etapaFoco, diaFoco],
  );
  // Assinatura dos filtros: a paginação da lista volta ao começo quando ELA
  // muda, e não a cada revalidação de 60s (que troca a identidade do array).
  const filtroKey = `${soAtrasados}|${soSaidas7d}|${soSemPecas}|${soInvalidos}|${prioridade}|${etapaFoco}|${diaFoco}|${busca}`;

  // "Primeiro focar no evento com peças em atraso": na primeira carga, o
  // pior evento atrasado já chega expandido — o caminho evento→peça começa
  // aberto, sem clique. Só uma vez; depois o controle é do usuário.
  //
  // A marcação da flag mora DENTRO do ramo que expande. Antes queimava na
  // primeira carga (o quadro é o padrão, e no quadro o detalhe é modal), e o
  // recurso ficava inerte em 100% das entradas normais.
  const autoExpandedRef = useRef(false);
  useEffect(() => {
    if (autoExpandedRef.current || !data) return;
    // A visão de peças não tem linha para expandir — e queimar a flag aqui
    // roubaria o auto-expandir de quem trocar para a tabela em seguida.
    if (visao === "atrasadas") return;
    // Só onde o drill abre INLINE: no quadro o detalhe é modal, e modal não
    // se auto-abre.
    if (!isMobile && visao !== "tabela") return;
    const worst = filtered.find(eventHasOverdue);
    if (!worst) return;
    autoExpandedRef.current = true;
    setExpandedId(worst.id);
  }, [data, filtered, visao, isMobile]);

  const hasActiveFilters = soAtrasados || soSaidas7d || soSemPecas || soInvalidos
    || busca.trim() !== "" || prioridade !== "all" || etapaFoco !== "all" || diaFoco !== "";
  const clearFilters = useCallback(() => {
    setSoAtrasados(false); setSoSaidas7d(false); setSoSemPecas(false); setSoInvalidos(false);
    setBusca(""); setPrioridade("all"); setEtapaFoco("all"); setDiaFoco("");
  }, []);

  // Esc "no vazio" limpa tudo — mas uma combinação de 3-4 filtros é trabalho
  // montado à mão, e um Esc distraído jogava tudo fora sem volta. O toast com
  // "Desfazer" devolve a combinação EXATA anterior.
  const limparComDesfazer = useCallback(() => {
    const anterior = {
      soAtrasados, soSaidas7d, soSemPecas, soInvalidos,
      busca, prioridade, etapaFoco, diaFoco,
    };
    clearFilters();
    toast({
      title: "Filtros limpos",
      action: (
        <ToastAction
          altText="Desfazer a limpeza e restaurar os filtros anteriores"
          onClick={() => {
            setSoAtrasados(anterior.soAtrasados);
            setSoSaidas7d(anterior.soSaidas7d);
            setSoSemPecas(anterior.soSemPecas);
            setSoInvalidos(anterior.soInvalidos);
            setBusca(anterior.busca);
            setPrioridade(anterior.prioridade);
            setEtapaFoco(anterior.etapaFoco);
            setDiaFoco(anterior.diaFoco);
          }}
        >
          Desfazer
        </ToastAction>
      ),
    });
  }, [soAtrasados, soSaidas7d, soSemPecas, soInvalidos, busca, prioridade,
    etapaFoco, diaFoco, clearFilters, toast]);

  // Um chip por filtro ativo, removível — inclusive o "Saídas em 7 dias", que
  // só existia como um anel de 1,5px num KPI fora da barra de filtros.
  const chipsAtivos: { key: string; label: string; onRemove: () => void }[] = [];
  if (soAtrasados) chipsAtivos.push({ key: "atrasados", label: "Só com atraso", onRemove: () => setSoAtrasados(false) });
  if (soSaidas7d) chipsAtivos.push({ key: "saidas7", label: "Saídas em 7 dias", onRemove: () => setSoSaidas7d(false) });
  if (soSemPecas) chipsAtivos.push({ key: "sempecas", label: "Sem nenhuma peça", onRemove: () => setSoSemPecas(false) });
  if (soInvalidos) chipsAtivos.push({ key: "invalidos", label: "Data de saída inválida", onRemove: () => setSoInvalidos(false) });
  if (etapaFoco !== "all") {
    const nome = stageMeta.find((m) => m.key === etapaFoco)?.label ?? etapaFoco;
    chipsAtivos.push({ key: "etapa", label: `Etapa: ${nome}`, onRemove: () => setEtapaFoco("all") });
  }
  if (diaFoco) chipsAtivos.push({ key: "dia", label: `Vencem em ${fmtDayMonth(diaFoco)}`, onRemove: () => setDiaFoco("") });
  if (prioridade !== "all") {
    chipsAtivos.push({
      key: "prioridade",
      label: `Prioridade: ${getPriorityMeta(prioridade)?.label ?? prioridade}`,
      onRemove: () => setPrioridade("all"),
    });
  }
  if (busca.trim() !== "") chipsAtivos.push({ key: "q", label: `Busca: ${busca.trim()}`, onRemove: () => setBusca("") });

  // ── Foco preservado entre colunas (quadro) ────────────────────────────────
  // Quando `currentStageIdx` muda, o React desmonta o card de um pai e monta
  // outro no vizinho: quem estava com o card focado perdia o foco para o
  // <body> sem aviso. E o único momento em que um evento anda de coluna — a
  // boa notícia — acontecia como salto instantâneo e anônimo.
  const focoCardRef = useRef<string | null>(null);
  const etapaAnteriorRef = useRef<Map<string, number>>(new Map());
  const [movidos, setMovidos] = useState<Set<string>>(new Set());
  useLayoutEffect(() => {
    if (isMobile || visao !== "quadro") return;
    const anterior = etapaAnteriorRef.current;
    const proximo = new Map<string, number>();
    const mudaram: string[] = [];
    for (const ev of filtered) {
      const idx = currentStageIdx(ev);
      proximo.set(ev.id, idx);
      const antes = anterior.get(ev.id);
      if (antes !== undefined && antes !== idx) mudaram.push(ev.id);
    }
    etapaAnteriorRef.current = proximo;

    const id = focoCardRef.current;
    if (id && document.activeElement === document.body) {
      document.querySelector<HTMLElement>(`[data-card-id="${id}"]`)?.focus();
    }
    if (mudaram.length === 0) {
      // Apaga um realce PENDENTE. Sem isto o card ficava âmbar para sempre:
      // se `filtered` mudasse (o diretor digitando na busca) dentro dos 1,2s,
      // o cleanup abaixo matava o timer e esta passada saía sem agendar outro
      // — e "acabou de mudar de coluna" virava um selo permanente.
      setMovidos((prev) => (prev.size ? new Set() : prev));
      return;
    }
    setMovidos(new Set(mudaram));
    const t = setTimeout(() => setMovidos(new Set()), 1200);
    return () => clearTimeout(t);
  }, [filtered, isMobile, visao]);

  // ── Modal de detalhe ──────────────────────────────────────────────────────
  const detailEv = detailId ? events.find((e) => e.id === detailId) ?? null : null;
  // Último snapshot: fechar o modal piscava uma caixa branca vazia, porque o
  // conteúdo sumia enquanto o Radix ainda animava a saída por ~200ms.
  const ultimoDetalheRef = useRef<PrazoEvent | null>(null);
  useEffect(() => { if (detailEv) ultimoDetalheRef.current = detailEv; }, [detailEv]);
  const ultimoDetalhe = ultimoDetalheRef.current;
  // O snapshot só serve em dois casos: durante o fechamento (`detailId` já é
  // null e o Radix ainda anima) e quando o evento ABERTO some do payload.
  // Sem a checagem de id, um link colado para um evento inexistente exibiria
  // o conteúdo do evento anterior — pior que a caixa branca que se queria
  // evitar.
  const podeUsarUltimo = !!ultimoDetalhe && (detailId === null || ultimoDetalhe.id === detailId);
  const modalEv = detailEv ?? (podeUsarUltimo ? ultimoDetalhe : null);
  const modalAberto = !!detailId && !!modalEv;
  // O evento saiu do payload com o modal aberto — normalmente uma BOA notícia
  // (outro usuário entregou a última peça). Some sem uma palavra é o
  // comportamento que mais rápido faz alguém chamar o app de instável.
  const saiuDoPayload = !!detailId && !detailEv && !!modalEv;
  useEffect(() => {
    // Link colado apontando para um evento que não existe mais e do qual nem
    // temos snapshot: não abre diálogo vazio, limpa o id — que de quebra
    // impede o modal de REABRIR sozinho caso o evento volte num refetch (o
    // Radix não chama `onOpenChange` quando é o conteúdo que some) — e DIZ o
    // que houve. Antes era silêncio: quem clicou no link do grupo via a tela
    // abrir sem modal nenhum e concluía que o link estava quebrado.
    if (data && detailId && !modalEv) {
      setDetailId(null);
      toast({
        title: "Este evento não está mais na gestão de prazos",
        description: "Ele foi concluído, teve tudo entregue ou já começou.",
      });
    }
  }, [data, detailId, modalEv, toast]);

  const tituloModalRef = useRef<HTMLHeadingElement>(null);

  // ── Atalhos de teclado (paridade com calendário/eventos/painel) ───────────
  const buscaRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const emCampo = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Com o modal aberto TODOS os atalhos da página se calam: o Esc é do
      // Radix (fechar), e o "/" mandaria o foco para a busca ATRÁS do
      // diálogo — o FocusScope do Radix puxaria de volta na hora, produzindo
      // só um pisca-pisca de foco. Limpar filtros por baixo do diálogo
      // também seria uma ação invisível.
      if (modalAberto) return;
      // Esc em DEGRAUS, do menor gesto para o maior: com um campo focado, o
      // primeiro Esc só desfoca (dropdowns do Radix já consomem o Esc deles
      // antes de chegar aqui). Limpar TODOS os filtros — a ação destrutiva —
      // fica para o Esc "no vazio", e mesmo esse ganha um "Desfazer": uma
      // combinação de 3-4 filtros é trabalho montado à mão.
      if (e.key === "Escape") {
        if (emCampo) { t.blur(); return; }
        if (hasActiveFilters) limparComDesfazer();
        return;
      }
      if (emCampo) return;
      if (e.key === "/") { e.preventDefault(); buscaRef.current?.focus(); return; }
      // "A" existe no celular também: lá o quadro e a tabela não são
      // oferecidos, mas a lista de peças é — ela funciona em qualquer largura.
      if (e.key === "a" || e.key === "A") { setVisao("atrasadas"); return; }
      if (isMobile) return;
      if (e.key === "q" || e.key === "Q") setVisao("quadro");
      if (e.key === "t" || e.key === "T") setVisao("tabela");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalAberto, hasActiveFilters, limparComDesfazer, isMobile]);

  // ── Imprimir pauta ────────────────────────────────────────────────────────
  // O CSS de print existia e o recurso falhava em silêncio: com o quadro como
  // padrão, Ctrl+P imprimia 5 colunas de cards e NENHUMA peça (o drill vive
  // dentro do Dialog, que não existe no papel).
  const restaurarPrintRef = useRef<{ visao: Visao } | null>(null);
  const imprimirPauta = () => {
    restaurarPrintRef.current = { visao };
    setDetailId(null);
    setVisao("tabela");
    setPrintMode(true);
  };
  useEffect(() => {
    if (!printMode) return;
    const restaurar = () => {
      const r = restaurarPrintRef.current;
      restaurarPrintRef.current = null;
      setPrintMode(false);
      if (r) setVisao(r.visao);
    };
    // Um respiro para o React pintar a tabela expandida antes do diálogo do SO.
    const id = window.setTimeout(() => {
      window.addEventListener("afterprint", restaurar, { once: true });
      window.print();
      // Safari não dispara `afterprint` de forma confiável — rede de segurança
      // para a tela não ficar presa no modo de impressão.
      window.setTimeout(restaurar, 1200);
    }, 80);
    return () => window.clearTimeout(id);
  }, [printMode]);

  // ── Blocos de estado ──────────────────────────────────────────────────────
  let body: React.ReactNode;

  if (isLoading) {
    // Skeleton RAMIFICADO por visão: o antigo desenhava uma faixa de 120px
    // onde hoje há um botão de ~44px e linhas empilhadas onde o padrão é um
    // grid de uma coluna por etapa — salto de layout em toda carga. A
    // contagem vem de `stageMeta`, nunca escrita à mão: o esqueleto precisa
    // desenhar o MESMO número de colunas que o quadro, e a entrada da
    // Finalização (a sexta etapa) mostrou o custo de ter um literal aqui.
    const bloco = (altura: number, chave: React.Key) => (
      <div key={chave} className="animate-pulse" style={{
        height: altura, borderRadius: R.lg, backgroundColor: TI.track, border: `1px solid ${TI.border}`,
      }} />
    );
    body = (
      <div role="status" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Texto de verdade, não `aria-label`: um `<div>` genérico não expõe
            nome acessível por atributo — o rótulo simplesmente não era lido.
            Com `role="status"` + conteúdo, o leitor anuncia a carga, e o
            contraponto ("Prazos atualizados…") vive na região viva do topo. */}
        <span className="sr-only">Carregando prazos…</span>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))" }}>
          {[0, 1, 2, 3].map((i) => bloco(84, i))}
        </div>
        {bloco(44, "toolbar")}
        {visao === "atrasadas" ? (
          // Silhueta REAL desta visão: uma linha de contagem e uma pilha de
          // linhas de altura única — não o grid de colunas do quadro nem os
          // cartões altos do celular, que dariam salto de layout na chegada
          // do dado (é a lista que a maioria dos acessos vai abrir).
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bloco(20, "contagem")}
            {isMobile
              ? [0, 1, 2, 3, 4].map((i) => bloco(150, `pc${i}`))
              : [0, 1, 2, 3, 4, 5, 6, 7].map((i) => bloco(52, `pl${i}`))}
          </div>
        ) : isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[0, 1, 2].map((i) => bloco(190, `m${i}`))}
          </div>
        ) : visao === "quadro" ? (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: `repeat(${stageMeta.length}, minmax(190px, 1fr))` }}>
            {stageMeta.map((m) => (
              <div key={m.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {bloco(30, `${m.key}-h`)}
                {bloco(160, `${m.key}-a`)}
                {bloco(160, `${m.key}-b`)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {bloco(38, "thead")}
            {[0, 1, 2, 3, 4, 5].map((i) => bloco(58, `r${i}`))}
          </div>
        )}
      </div>
    );
  } else if (isError && !data) {
    // "Sem permissão" NÃO é falha transitória: a rota é admin-only (403
    // responde "Acesso negado"; o 401 nem chega aqui — o queryClient já
    // redireciona para o login). Oferecer "Tentar novamente" a um operador
    // era um botão que falha para sempre — retry eterno de um erro
    // determinístico. A mensagem do erro chega traduzida do corpo JSON, então
    // a detecção é pela frase (com o status ausente do Error, é o que há).
    const msgErro = apiErrorMessage(error);
    const semPermissao = /acesso negado|não autenticado/i.test(msgErro);
    body = semPermissao ? (
      <div role="alert" style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
        padding: "36px 24px", textAlign: "center",
      }}>
        <AlertTriangle aria-hidden="true" style={{ width: 28, height: 28, color: TI.amber, margin: "0 auto 10px" }} />
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
          Esta tela é do diretor
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: TI.secondary }}>
          Seu usuário não tem acesso à Gestão de Prazos.
        </p>
        <Link
          href="/"
          data-testid="link-voltar-painel"
          style={{
            display: "inline-flex", padding: "9px 18px", borderRadius: R.md,
            backgroundColor: TI.ink, color: "#ffffff",
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}
        >
          Ir para o Painel
        </Link>
      </div>
    ) : (
      <div role="alert" style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
        padding: "36px 24px", textAlign: "center",
      }}>
        <AlertTriangle aria-hidden="true" style={{ width: 28, height: 28, color: TI.amber, margin: "0 auto 10px" }} />
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
          Não foi possível carregar os prazos
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: TI.secondary }}>
          {msgErro}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          data-testid="button-retry-prazos"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 18px", borderRadius: R.md, border: "none",
            backgroundColor: TI.ink, color: "#ffffff",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          <RotateCcw aria-hidden="true" style={{ width: 15, height: 15 }} />
          Tentar novamente
        </button>
      </div>
    );
  } else if (events.length === 0) {
    body = (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
        padding: "40px 24px", textAlign: "center",
      }}>
        <CalendarRange aria-hidden="true" style={{ width: 28, height: 28, color: TI.label, margin: "0 auto 10px" }} />
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
          Nenhum evento ativo para acompanhar
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: TI.secondary }}>
          Eventos concluídos ou já iniciados não entram na gestão de prazos.
        </p>
        <Link
          href="/eventos"
          style={{
            display: "inline-flex", padding: "9px 18px", borderRadius: R.md,
            backgroundColor: TI.ink, color: "#ffffff",
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}
        >
          Ver eventos
        </Link>
      </div>
    );
  } else if (visao === "atrasadas") {
    // Antes do "nenhum evento com esses filtros": aqui quem responde vazio é a
    // própria lista de peças, que separa o vazio REAL (não há peça atrasada no
    // app) do vazio POR FILTRO. Cair no branch de eventos diria "nenhum evento
    // com esses filtros" numa tela que está listando peças — e diria isso até
    // quando o certo é a boa notícia.
    body = (
      <PecasAtrasadas
        pecas={pecasAtrasadas}
        totalNoApp={pecasAtrasadasTodas.length}
        kpiPecasAtrasadas={kpis.pecasAtrasadas}
        filtroKey={filtroKey}
        chips={chipsAtivos}
        onLimparFiltros={clearFilters}
        onAbrirEvento={setDetailId}
      />
    );
  } else if (filtered.length === 0) {
    body = (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: R.lg,
        padding: "40px 24px", textAlign: "center",
      }}>
        {soAtrasados && kpis.atrasados === 0 ? (
          <>
            <CheckCircle2 aria-hidden="true" style={{ width: 28, height: 28, color: TI.green, margin: "0 auto 10px" }} />
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
              Nenhum atraso — tudo em dia
            </p>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: TI.secondary }}>
              Nenhuma etapa vencida nos {events.length} evento{events.length !== 1 ? "s" : ""} ativo{events.length !== 1 ? "s" : ""}.
            </p>
          </>
        ) : (
          <>
            <Search aria-hidden="true" style={{ width: 28, height: 28, color: TI.label, margin: "0 auto 10px" }} />
            <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
              Nenhum evento com esses filtros
            </p>
            <p style={{ margin: "0 0 10px", fontSize: 13, color: TI.secondary }}>
              {events.length} evento{events.length !== 1 ? "s" : ""} ativo{events.length !== 1 ? "s" : ""} no total.
            </p>
            {/* Dizer QUAIS filtros: "Nenhum evento com esses filtros" sem a
                lista obrigava o diretor a caçar o estado ativo na toolbar. */}
            {chipsAtivos.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 14 }}>
                {chipsAtivos.map((c) => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
              </div>
            )}
          </>
        )}
        <button
          type="button"
          onClick={clearFilters}
          data-testid="button-limpar-filtros"
          style={{
            padding: "9px 18px", borderRadius: R.md, border: `1px solid ${TI.border}`,
            backgroundColor: TI.card, color: TI.title,
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          Limpar filtros
        </button>
      </div>
    );
  } else if (isMobile) {
    // ── Cards mobile (markup em components/prazos/card-mobile.tsx) ──────────
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((ev) => (
          <CardMobilePrazos
            key={ev.id}
            ev={ev}
            expanded={expandedId === ev.id}
            onToggle={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
            cobranca={cobrancaEvento(ev.id)}
            today={today}
          />
        ))}
      </div>
    );
  } else if (visao === "quadro") {
    // ── Quadro (visão principal): uma coluna por etapa, o evento é um card
    // na coluna onde o funil dele está travado. Clique abre o drill em modal.
    //
    // `minmax(190px, 1fr)` + scroll horizontal: um kanban tem uma largura
    // mínima abaixo da qual deixa de ser kanban e vira um punhado de tarjas
    // ilegíveis. Em 1024px (iPad em paisagem) as colunas fluidas ficavam em
    // ~136px e a etapa virava "Apro…". Rolar de lado é preferível a coluna
    // ilegível — e o número de colunas vem de `stageMeta`, não mais do "5"
    // literal que era o último espelho local da quantidade de etapas.
    body = (
      <div className="gp-scroll" style={{
        display: "grid",
        gridTemplateColumns: `repeat(${stageMeta.length}, minmax(190px, 1fr))`,
        gap: 10, alignItems: "start", overflowX: "auto", paddingBottom: 4,
      }}>
        {stageMeta.map((m, i) => {
          const colEvents = filtered.filter((ev) => currentStageIdx(ev) === i);
          return (
            <QuadroColuna
              key={m.key}
              stageKey={m.key}
              label={m.label}
              stageIdx={i}
              eventos={colEvents}
              temFiltro={hasActiveFilters}
              renderCard={(ev) => (
                <QuadroCard
                  ev={ev}
                  stage={ev.stages[i]}
                  cobranca={cobrancaEvento(ev.id)}
                  onOpen={() => setDetailId(ev.id)}
                  onFocusCard={() => { focoCardRef.current = ev.id; }}
                  realce={movidos.has(ev.id)}
                />
              )}
            />
          );
        })}
      </div>
    );
  } else {
    // ── Tabela desktop (markup em components/prazos/tabela-prazos.tsx) ──────
    body = (
      <TabelaPrazos
        eventos={filtered}
        stageMeta={stageMeta}
        expandedId={expandedId}
        onToggleExpand={setExpandedId}
        printMode={printMode}
        cobrancaDe={cobrancaEvento}
        today={today}
      />
    );
  }

  // ── Faixa de triagem: os dois casos degenerados ganham lugar próprio ──────
  // O evento SEM NENHUMA PEÇA era pintado de verde no placar, aterrissava na
  // última coluna do funil e sumia do filtro de atraso. O de data quebrada
  // tinha uma frase que pedia ação e não oferecia nenhuma — a única mensagem
  // da tela sem CTA.
  const triagemBotao = (ativo: boolean, texto: string, onClick: () => void, testId: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      data-testid={testId}
      className="gp-no-print"
      style={{
        padding: "5px 12px", borderRadius: R.pill,
        border: ativo ? `1.5px solid ${TI.red}` : `1px solid ${TI.border}`,
        backgroundColor: ativo ? TI.redBg : TI.card,
        color: ativo ? TI.red : TI.strong,
        // 36/44 como todo controle da tela: 30px no desktop era o único alvo
        // fora da régua da casa, e estes dois botões são filtros de verdade.
        fontSize: 12, fontWeight: 700, cursor: "pointer", minHeight: isMobile ? 44 : 36,
      }}
    >
      {texto}
    </button>
  );
  const faixaTriagem = data && (kpis.semPecas > 0 || kpis.invalidCount > 0) ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: TI.red, flexShrink: 0 }} />
      {kpis.semPecas > 0 && triagemBotao(
        soSemPecas,
        `${kpis.semPecas} evento${kpis.semPecas !== 1 ? "s" : ""} sem nenhuma peça`,
        () => setSoSemPecas((v) => !v),
        "filtro-sem-pecas",
      )}
      {kpis.invalidCount > 0 && triagemBotao(
        soInvalidos,
        `${kpis.invalidCount} com data de saída inválida`,
        () => setSoInvalidos((v) => !v),
        "filtro-data-invalida",
      )}
      <span style={{ fontSize: 12, color: TI.secondary }}>
        — o funil nem começou a contar; corrija no cadastro do evento.
      </span>
    </div>
  ) : null;

  // ── "Comece por aqui": os três piores, com setor e cobrança ───────────────
  // A tela já sabia ordenar por pior atraso e já sabia qual setor destrava
  // cada etapa; faltava compor isso numa fila curta. Fica ACIMA da barra de
  // filtros, mesma posição do placar — que é a posição que o usuário já lê
  // como "visão geral", e não como resultado filtrado.
  const piores = useMemo(
    () => [...events]
      .filter((ev) => ev.piorAtrasoDias > 0)
      .sort((a, b) => b.piorAtrasoDias - a.piorAtrasoDias || b.pecasEmAtraso - a.pecasEmAtraso)
      .slice(0, 3),
    [events],
  );
  const faixaComecePorAqui = data && piores.length > 0 ? (
    <section aria-labelledby="gp-comece" style={{
      marginTop: 14, backgroundColor: TI.card, border: `1px solid ${TI.border}`,
      borderRadius: R.lg, padding: "12px 14px", boxShadow: SHADOW.sm,
    }}>
      <h2 id="gp-comece" style={{
        margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        Comece por aqui
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {piores.map((ev, i) => {
          const idx = currentStageIdx(ev);
          const setor = STAGE_SECTOR[stageMeta[idx]?.key ?? ""]?.sector;
          return (
            <div key={ev.id} style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              paddingTop: i > 0 ? 8 : 0, borderTop: i > 0 ? `1px solid ${TI.border}` : "none",
            }}>
              <span aria-hidden="true" style={{
                width: 20, height: 20, borderRadius: R.sm, flexShrink: 0,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                backgroundColor: TI.redBg, color: TI.red, fontSize: 11, fontWeight: 800,
              }}>
                {i + 1}
              </span>
              <button
                type="button"
                onClick={() => setDetailId(ev.id)}
                aria-haspopup="dialog"
                data-testid={`comece-${ev.id}`}
                style={{
                  background: "none", border: "none", padding: 0, cursor: "pointer",
                  fontSize: 13, fontWeight: 800, color: TI.title, textAlign: "left",
                  fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
                  minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 320,
                }}
                title={`${ev.name} — abrir detalhes`}
              >
                {ev.name}
              </button>
              <span style={{ fontSize: 12, color: TI.secondary, minWidth: 0 }}>
                {setor ? `${setor} · ` : ""}
                <strong style={{ color: TI.red, fontWeight: 700 }}>
                  prazo vencido há {diasTexto(ev.piorAtrasoDias)}
                </strong>
                {ev.pecasEmAtraso > 0 && ` · ${pecasTexto(ev.pecasEmAtraso)} parada${ev.pecasEmAtraso !== 1 ? "s" : ""}`}
              </span>
              <div className="gp-no-print" style={{ marginLeft: "auto" }}>
                {/* Contorno, não sólido: a ação primária SÓLIDA é a do bloco
                    de cobrança do modal. Três botões pretos aqui em cima
                    virariam mais um bloco competindo com o vermelho do
                    diagnóstico. `showForm` (disclosure fechado por padrão)
                    porque a fila é onde a ligação acontece: quem acabou de
                    ouvir "te entrego quinta" registrava a promessa só abrindo
                    o modal — dois cliques a mais bem no momento do combinado. */}
                <CobradoControl
                  targetType="event"
                  targetId={ev.id}
                  cobranca={cobrancaEvento(ev.id)}
                  today={today}
                  variant="secondary"
                  showForm
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  ) : null;

  // ── "O que mudou desde ontem" ────────────────────────────────────────────
  // A seta do placar diz que os atrasados subiram de 4 para 6; esta faixa diz
  // QUAIS dois entraram — a primeira pergunta das 8h da manhã. Some inteira
  // enquanto `prazo_event_snapshots` não existir (db:push pendente).
  const faixaDesdeOntem = desdeOntem ? (
    <section aria-label="O que mudou desde o último fechamento" className="gp-no-print" style={{ marginTop: 14 }}>
      <button
        type="button"
        onClick={() => setShowDesdeOntem((v) => !v)}
        aria-expanded={showDesdeOntem}
        aria-controls={showDesdeOntem ? "gp-desde-ontem" : undefined}
        data-testid="toggle-desde-ontem"
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          padding: "10px 14px", borderRadius: R.lg,
          border: `1px solid ${TI.border}`, backgroundColor: TI.card,
          fontSize: 13, fontWeight: 700, color: TI.title, cursor: "pointer", textAlign: "left",
        }}
      >
        <ChevronDown aria-hidden="true" style={{
          width: 15, height: 15, color: TI.label, flexShrink: 0,
          transform: showDesdeOntem ? "rotate(180deg)" : "none",
          transition: "transform 0.15s ease",
        }} />
        Desde {fmtDayMonth(desdeOntem.baseDay)}
        <span style={{ fontSize: 12, fontWeight: 500, color: TI.secondary, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {desdeOntem.entraramEmAtraso.length === 0 && desdeOntem.sairamDoAtraso.length === 0 && desdeOntem.pecasDestravadas === 0
            ? "· nada mudou no vermelho"
            : `· ${desdeOntem.entraramEmAtraso.length} entraram em atraso · ${desdeOntem.sairamDoAtraso.length} saíram do vermelho · ${desdeOntem.pecasDestravadas} peças destravadas`}
        </span>
      </button>
      {showDesdeOntem && (
        <div id="gp-desde-ontem" style={{
          marginTop: 8, padding: "12px 14px", borderRadius: R.lg,
          border: `1px solid ${TI.border}`, backgroundColor: TI.card,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          {desdeOntem.entraramEmAtraso.length > 0 && (
            <p style={{ margin: 0, fontSize: 13, color: TI.red, fontWeight: 600 }}>
              Entraram em atraso:{" "}
              {desdeOntem.entraramEmAtraso.map((e, i) => (
                <Fragment key={e.id}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => setDetailId(e.id)}
                    aria-haspopup="dialog"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: TI.red, textDecoration: "underline" }}
                  >
                    {e.name}
                  </button>
                </Fragment>
              ))}
            </p>
          )}
          {desdeOntem.sairamDoAtraso.length > 0 && (
            <p style={{ margin: 0, fontSize: 13, color: TI.green, fontWeight: 600 }}>
              Saíram do vermelho:{" "}
              {desdeOntem.sairamDoAtraso.map((e, i) => (
                <Fragment key={e.id}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => setDetailId(e.id)}
                    aria-haspopup="dialog"
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 700, color: TI.green, textDecoration: "underline" }}
                  >
                    {e.name}
                  </button>
                </Fragment>
              ))}
            </p>
          )}
          <p style={{ margin: 0, fontSize: 13, color: TI.secondary }}>
            {desdeOntem.pecasDestravadas > 0
              ? `${pecasTexto(desdeOntem.pecasDestravadas)} ${desdeOntem.pecasDestravadas !== 1 ? "saíram" : "saiu"} de etapa vencida.`
              : "Nenhuma peça saiu de etapa vencida no período."}
          </p>
        </div>
      )}
    </section>
  ) : null;

  // ── Próximos dias úteis: a tela era ótima no passado e cega no futuro ─────
  const proximosDias = useMemo(() => {
    if (!today) return [];
    const out: { dia: string; total: number }[] = [];
    for (let i = 0; i < 15 && out.length < 10; i++) {
      const dia = addDaysStr(today, i);
      const dow = weekdayOfDay(dia);
      // O servidor já empurra marco de sábado para sexta e de domingo para
      // segunda — coluna de fim de semana seria sempre zero.
      if (dow === 0 || dow === 6) continue;
      let total = 0;
      for (const ev of events) {
        if (ev.invalidDate) continue;
        for (const s of ev.stages) {
          if (s.deadline === dia && s.state !== "done") total += 1;
        }
      }
      out.push({ dia, total });
    }
    return out;
  }, [events, today]);

  // ── Diagnóstico (setores + patrocinadores + agenda) ───────────────────────
  // O bloco inteiro vive em `components/prazos/analise-band.tsx`, junto com o
  // estado que só ele usa (aberto/fechado, patrocinador expandido, ver todos).

  // ── Selo de frescor ───────────────────────────────────────────────────────
  const idadeMin = data ? Math.max(0, Math.round((agora - new Date(data.generatedAt).getTime()) / 60000)) : 0;
  const dadoVelho = idadeMin >= 10;

  // ── Fim de carga, falado ─────────────────────────────────────────────────
  // O skeleton anuncia "Carregando prazos…" e não havia contraponto: para quem
  // usa leitor de tela, a chegada do dado era silêncio. O texto DERIVA dos
  // números, então uma revalidação que não muda nada não dispara anúncio
  // algum — a região só fala quando há notícia.
  const anuncioCarga = isLoading || !data
    ? ""
    : `Prazos atualizados: ${events.length} evento${events.length !== 1 ? "s" : ""} ativo${events.length !== 1 ? "s" : ""}, ${kpis.atrasados} com atraso.`;

  const modalChip = modalEv ? saidaChip(modalEv) : null;

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: isMobile ? "16px 12px 32px" : "24px 24px 48px" }}>
      {/* Relatório de cobrança vai para reunião: a impressão esconde os
          controles (filtros, botões), solta os scrollports (senão o Chromium
          recorta tudo o que passa da primeira dobra) e evita quebrar linha de
          tabela ao meio. O hover de linha da tabela vive aqui pelo mesmo
          motivo do resto da casa: :hover não existe em style inline. */}
      <style>{`
        @media print {
          .gp-no-print { display: none !important; }
          .gp-scroll { max-height: none !important; overflow: visible !important; }
          tr { break-inside: avoid; }
        }
        .gp-row:hover > td, .gp-row:hover > th { background-color: rgba(28,25,23,0.04); }
      `}</style>
      <div style={{
        // O 1280 servia à tabela e estrangulava o quadro: num monitor de 1920
        // sobravam ~600px inutilizados justamente na visão que mais quer
        // largura.
        maxWidth: !isMobile && visao === "quadro" ? 1600 : 1280,
        margin: "0 auto",
      }}>
        {/* Contraponto do "Carregando prazos…" do skeleton. Fora do corpo de
            propósito: o skeleton é desmontado quando o dado chega, e uma
            região viva que some junto nunca chega a anunciar. */}
        <p role="status" className="sr-only">{anuncioCarga}</p>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          <div>
            <h1 style={{
              margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 800, color: TI.title,
              fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.02em",
            }}>
              Gestão de Prazos
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: TI.secondary }}>
              Etapas de cada evento contra a saída do caminhão — o que venceu, o que vence e quem destrava.
            </p>
          </div>
          {data && (
            <div className="gp-no-print" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              {novidades > 0 && (
                <button
                  type="button"
                  onClick={() => setNovidades(0)}
                  data-testid="button-novidades"
                  title="A tela já recarregou sozinha — este contador diz que o chão se moveu enquanto você lia. Clique para zerar."
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "0 12px", height: isMobile ? 44 : 36, borderRadius: R.pill,
                    border: `1px solid ${TI.amber}`, backgroundColor: TI.amberBg,
                    color: TI.amber, fontSize: 11, fontWeight: 700, cursor: "pointer",
                  }}
                >
                  <Sparkles aria-hidden="true" style={{ width: 12, height: 12 }} />
                  {novidades} mudança{novidades !== 1 ? "s" : ""} desde que você abriu
                </button>
              )}
              {/* Sem botão "Atualizar" (pedido do dono): a tela se atualiza
                  sozinha — WebSocket + polling de 60s + refetch no foco. O selo
                  continua sendo a promessa de veracidade, e o spinner ao lado é
                  o único sinal de que uma recarga está em curso. Os botões de
                  "Tentar de novo" dos estados de ERRO ficam: lá a recarga
                  automática falhou e o clique é recuperação, não rotina. */}
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: dadoVelho ? TI.amber : TI.label, fontWeight: dadoVelho ? 700 : 400 }}
                title={new Date(data.generatedAt).toLocaleString("pt-BR")}
              >
                {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
                Atualizado {fmtRelative(data.generatedAt, agora)}
              </span>
              {!isMobile && (
                <button
                  type="button"
                  onClick={imprimirPauta}
                  disabled={printMode}
                  data-testid="button-imprimir-pauta"
                  title="Troca para a tabela, abre as pendências dos eventos atrasados e manda para a impressora."
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    padding: "0 14px", height: 36, borderRadius: R.md,
                    border: `1px solid ${TI.border}`,
                    backgroundColor: TI.card, color: printMode ? TI.label : TI.strong,
                    fontSize: 12, fontWeight: 700, cursor: printMode ? "default" : "pointer",
                  }}
                >
                  <Printer aria-hidden="true" style={{ width: 14, height: 14 }} />
                  {printMode ? "Preparando..." : "Imprimir pauta"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Dado antigo por falha de atualização: NUNCA jogar fora o cache bom —
            dashboard de 10 min atrás vale mais que tela vazia. */}
        {isError && data && (
          <div role="alert" className="gp-no-print" style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            backgroundColor: TI.amberBg, border: `1px solid ${TI.amberEdge}`, borderRadius: R.md,
            padding: "10px 14px", marginBottom: 14,
          }}>
            <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: TI.amber, flexShrink: 0 }} />
            {/* `TI.amber` e não o #78350f que estava aqui: é o mesmo âmbar do
                ícone ao lado e do selo de frescor, e mede 4,89:1 sobre
                `amberBg` — o tom escuro solto era o último dialeto da faixa. */}
            <span style={{ fontSize: 13, color: TI.amber, fontWeight: 600 }}>
              Não foi possível atualizar — mostrando dados de {fmtRelative(data.generatedAt, agora)}. {apiErrorMessage(error)}
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: TI.accentText, cursor: "pointer", textDecoration: "underline" }}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {/* Placar */}
        {data && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: "grid", gap: 10,
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))",
            }}>
              {/* O `hint` é a explicação em VOZ DE NEGÓCIO, e é texto visível
                  — não `title`. Antes só o card não-clicável tinha explicação,
                  ela descrevia o algoritmo ("etapa vencida mais avançada") e
                  morava num `<div>` que o teclado nunca alcança: a legenda
                  existia apenas para quem tem mouse e já entendia o cálculo.
                  Os quatro recebem uma linha para o placar não ficar com um
                  card explicado e três mudos. */}
              <KpiCard
                label="Eventos com atraso" value={kpis.atrasados} tone="red"
                active={soAtrasados} onClick={() => setSoAtrasados((v) => !v)}
                hint="com pelo menos uma etapa já vencida"
                title="Clique para ver só os eventos com alguma etapa vencida."
                trend={trend?.atrasados} goodWhenUp={false}
                testId="kpi-atrasados"
              />
              <KpiCard
                label="Saídas em 7 dias" value={kpis.saidas7d} tone="amber"
                active={soSaidas7d}
                // Sem o que o filtro consome, o card vira informativo em vez
                // de mentir no clique (ver `podeFiltrarSaidas`).
                onClick={podeFiltrarSaidas ? () => setSoSaidas7d((v) => !v) : undefined}
                hint={kpisDoServidor
                  ? "o caminhão sai de hoje até daqui a 7 dias"
                  : "indisponível nesta versão do servidor"}
                title={podeFiltrarSaidas
                  ? "Clique para ver só os eventos com saída entre hoje e os próximos 7 dias."
                  : "Filtro indisponível nesta versão do servidor — reinicie o app no Replit (Stop e Run)."}
                trend={trend?.saidas7d} goodWhenUp={false}
                testId="kpi-saidas-7d"
              />
              {/* Era o único KPI sem clique — mostrava "437" e deixava o
                  diretor sem caminho para as 437. Agora ele é a porta da lista
                  plana de peças, que é o conjunto que este número conta. */}
              <KpiCard
                label="Peças em etapa vencida" value={kpis.pecasAtrasadas} tone="red"
                active={visao === "atrasadas"}
                onClick={alternarListaDePecas}
                hint="já deveriam ter passado pela etapa mais atrasada do evento"
                title="Clique para ver TODAS as peças atrasadas numa lista só, de todos os eventos."
                trend={trend?.pecasAtrasadas} goodWhenUp={false}
                testId="kpi-pecas-atrasadas"
              />
              <KpiCard
                label="Eventos em dia" value={kpis.emDia} tone="green"
                hint="com peças cadastradas, data válida e nada vencido"
                title="Eventos com peças cadastradas, data de saída válida e nenhuma etapa vencida."
                trend={trend?.emDia} goodWhenUp
                testId="kpi-em-dia"
              />
            </div>
            {faixaTriagem}
          </div>
        )}

        {faixaComecePorAqui}
        {faixaDesdeOntem}

        {/* Toolbar */}
        {data && events.length > 0 && (
          <div className="gp-no-print" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 14, marginBottom: 10 }}>
            {/* A lista de peças entra AQUI, como terceira visão, e não como um
                bloco à parte: é o mesmo conjunto filtrado visto por outro
                grão (evento → peça), e é isso que o seletor de visão já
                significa. Um bloco próprio abaixo do quadro seria uma segunda
                lista longa competindo com a primeira, e a pergunta mais
                direta do diretor ("o que está atrasado agora") aterrissaria
                sob duas dobras de rolagem.
                No CELULAR o seletor também aparece — com dois botões, porque
                lá quadro e tabela não são oferecidos (o corpo é sempre
                cartão), mas a lista de peças funciona em qualquer largura e
                sem o seletor não haveria caminho de volta. */}
            <div role="group" aria-label="Modo de visualização" style={{
              display: "inline-flex", borderRadius: R.md, border: `1px solid ${TI.border}`,
              overflow: "hidden", flexShrink: 0, height: isMobile ? 44 : 36,
            }}>
              {(isMobile ? (["quadro", "atrasadas"] as const) : (["quadro", "tabela", "atrasadas"] as const)).map((v) => {
                // No celular "Quadro" é o botão de VOLTAR para os eventos: a
                // visão de evento lá é sempre o cartão, venha `visao` como
                // quadro ou tabela.
                const ativo = isMobile && v === "quadro" ? visao !== "atrasadas" : visao === v;
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setVisao(v)}
                    aria-pressed={ativo}
                    data-testid={`visao-${v}`}
                    title={`Atalho: ${VISAO_TECLA[v]}`}
                    style={{
                      padding: "0 14px", border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 700,
                      backgroundColor: ativo ? TI.ink : TI.card,
                      color: ativo ? "#ffffff" : TI.strong,
                    }}
                  >
                    {isMobile && v === "quadro" ? "Eventos" : VISAO_LABEL[v]}
                  </button>
                );
              })}
            </div>
            <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 280px" }}>
              <Search aria-hidden="true" style={{
                position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                width: 14, height: 14, color: TI.label, pointerEvents: "none",
              }} />
              <input
                ref={buscaRef}
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                // O rótulo acompanha o que a busca REALMENTE procura em cada
                // visão: na lista de peças ela também varre código, tipo e
                // descrição, e prometer só "evento" faria o diretor digitar o
                // número da peça, receber a lista certa e achar que foi sorte.
                placeholder={visao === "atrasadas" ? "Buscar peça ou evento...  (/)" : "Buscar evento...  (/)"}
                aria-label={visao === "atrasadas"
                  ? "Buscar por código, descrição da peça ou nome do evento"
                  : "Buscar evento pelo nome"}
                data-testid="input-busca-prazos"
                style={{
                  width: "100%", boxSizing: "border-box",
                  height: isMobile ? 44 : 36, padding: "0 12px 0 32px", borderRadius: R.md,
                  border: `1px solid ${TI.border}`, backgroundColor: TI.card,
                  fontSize: 13, color: TI.title, outlineOffset: 2,
                }}
              />
            </div>
            {/* Some na visão de peças: lá TODA linha está atrasada por
                definição, então o botão seria um clique que não muda nada — e
                controle que não faz nada é o começo da desconfiança no resto
                da barra. O chip continua removível se o filtro veio da URL. */}
            {visao !== "atrasadas" && (
              <button
                type="button"
                onClick={() => setSoAtrasados((v) => !v)}
                aria-pressed={soAtrasados}
                data-testid="toggle-so-atrasados"
                style={{
                  padding: "0 14px", height: isMobile ? 44 : 36, borderRadius: R.pill,
                  border: soAtrasados ? `1.5px solid ${TI.red}` : `1px solid ${TI.border}`,
                  backgroundColor: soAtrasados ? TI.redBg : TI.card,
                  color: soAtrasados ? TI.red : TI.strong,
                  fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Só com atraso
              </button>
            )}
            {/* FilterSelect no lugar dos <select> nativos: é o controle usado
                em 15 telas e traz a altura padrão (36 no desktop, 44 no toque).
                Aqui nenhum controle declarava `height` e no mobile os alvos
                ficavam em ~33px. */}
            <FilterSelect
              label="Prioridade"
              allLabel="Todas as prioridades"
              value={prioridade}
              onChange={setPrioridade}
              testId="select-prioridade-prazos"
              options={Object.keys(PRIORITY)
                // Ordem canônica (urgente→baixa), não a ordem de inserção.
                .filter((p) => prioridadesDisponiveis.includes(p))
                .map((p) => ({ value: p, label: getPriorityMeta(p)?.label ?? p, dotColor: getPriorityMeta(p)?.dot }))}
            />
            {/* Mesma razão do "Só com atraso": a lista de peças tem uma ordem
                só (pior atraso primeiro) e ordenar por "próxima saída" um
                conjunto de peças de eventos diferentes não é uma pergunta que
                alguém faça. O critério fica escrito na legenda. */}
            {visao !== "atrasadas" && (
            <FilterSelect
              label="Ordenar"
              allLabel="Ordenar: mais atrasado"
              value={ordem}
              // A linha "Todos" do painel devolve "all"; aqui isso significa
              // voltar à ordenação padrão da tela, que é por pior atraso.
              onChange={(v) => setOrdem(v === "saida" ? "saida" : "atraso")}
              hideClear
              // Ordenação SEMPRE tem valor, então o realce de "filtro ativo"
              // do FilterSelect ficaria aceso o tempo todo e competiria com os
              // filtros que de fato estão ligados. Aqui o controle fica neutro.
              triggerStyle={{
                backgroundColor: TI.card, border: `1px solid ${TI.border}`,
                color: TI.title, fontWeight: 600,
              }}
              testId="select-ordem-prazos"
              options={[
                { value: "atraso", label: "Ordenar: mais atrasado" },
                { value: "saida", label: "Ordenar: próxima saída" },
              ]}
            />
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                data-testid="button-limpar-filtros-topo"
                title="Atalho: Esc"
                style={{
                  padding: "0 12px", height: isMobile ? 44 : 36, borderRadius: R.md, border: "none",
                  background: "none", color: TI.accentText, fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Limpar
              </button>
            )}
            {/* O contador fala da UNIDADE que a visão desenha. Dizer "12 de 40
                eventos" sobre uma lista de peças é o mesmo tipo de número
                deslocado que a tela passou a revisão inteira caçando. */}
            <span aria-live="polite" style={{ marginLeft: "auto", fontSize: 12, color: TI.secondary }}>
              {visao === "atrasadas"
                ? `${pecasAtrasadas.length} de ${pecasAtrasadasTodas.length} peça${pecasAtrasadasTodas.length !== 1 ? "s" : ""} atrasada${pecasAtrasadasTodas.length !== 1 ? "s" : ""}`
                : `${filtered.length} de ${events.length} evento${events.length !== 1 ? "s" : ""}`}
            </span>
            {visao === "atrasadas" && (
              <span style={{ flexBasis: "100%", fontSize: 11, color: TI.label, paddingTop: 2 }}>
                Uma linha por peça, de todos os eventos. <strong style={{ color: TI.strong }}>Atrasada</strong>{" "}
                = o prazo da etapa que cobra a peça já venceu. Da mais atrasada para a menos atrasada.
              </span>
            )}
            {/* Legenda: a gramática do semáforo só existia no hover, célula a
                célula — e só na TABELA, apesar de a mini-trilha de 5 pontos do
                card do quadro usar exatamente as mesmas quatro cores. Cada
                visão recebe a legenda do artefato que ela realmente desenha. */}
            {!isMobile && visao === "tabela" && (
              <span style={{ flexBasis: "100%", fontSize: 11, color: TI.label, paddingTop: 2 }}>
                Semáforo: <strong style={{ color: TI.green }}>✓</strong> etapa concluída ·{" "}
                <strong style={{ color: TI.amber }}>nº</strong> peças aguardando o prazo ·{" "}
                <strong style={{ color: TI.red }}>Nd</strong> dias vencida (com o total de peças abaixo)
              </span>
            )}
            {!isMobile && visao === "quadro" && (
              <span style={{
                // Pontos de 8px e columnGap 10: com 6px e gap 5 a legenda era
                // um borrão de pontinhos colados — o espaçamento maior separa
                // cada par cor+palavra sem crescer a linha.
                flexBasis: "100%", fontSize: 11, color: TI.label, paddingTop: 2,
                display: "flex", alignItems: "center", rowGap: 5, columnGap: 10, flexWrap: "wrap",
              }}>
                Trilha do card:
                {LEGENDA_TRILHA.map((l) => (
                  <span key={l.texto} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <span aria-hidden="true" style={{
                      width: 8, height: 8, borderRadius: R.pill, backgroundColor: l.cor, flexShrink: 0,
                    }} />
                    {l.texto}
                  </span>
                ))}
                <span>· o ponto com anel é a etapa atual do evento</span>
              </span>
            )}
          </div>
        )}

        {/* Chips de filtro ativo */}
        {data && chipsAtivos.length > 0 && (
          <div className="gp-no-print" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {chipsAtivos.map((c) => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
          </div>
        )}

        {body}

        {/* Detalhe do evento: o drill de cobrança na casca da casa. */}
        <Dialog open={modalAberto} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
          <DialogContent
            // `p-0 gap-0` além do HIDE_NATIVE_CLOSE: o DialogContent base é um
            // grid com `gap-4` e `p-6` — sem zerar, sobravam faixas brancas de
            // 16px entre cabeçalho, corpo e rodapé. É o mesmo par usado nos
            // outros modais da casa.
            className={`p-0 gap-0 ${HIDE_NATIVE_CLOSE}`}
            // 1120 e não os 760 de antes. Este modal não é um diálogo de
            // confirmação: ele carrega até quatro tabelas de quinze linhas com
            // uma coluna ("Aprovação com quem") de largura imprevisível. Em
            // 760 sobravam 712px de corpo e a coluna que importa era a que
            // ficava fora — o dono do app relatou a rolagem lateral por isso.
            // Em 1120 o corpo dá 1072px e as cinco colunas cabem folgadas até
            // com oito patrocinadores resumidos.
            // O teto existe para a linha não virar faixa: `modalSurface` já
            // mantém `width: 96vw`, então em 1366 e 1536 o modal para em 1120,
            // e no celular continua acompanhando a viewport (96vw = 360 em
            // 375). Acima de 1120 o ganho seria só percurso de olho.
            //
            // ALTURA: coluna flex com teto de `100vh − 48px` (24px de respiro
            // acima e abaixo — o Radix centra com `top: 50%` e translate). O
            // corpo é o único item que cresce e o único que rola; cabeçalho e
            // rodapé param no tamanho do conteúdo deles, porque o tamanho
            // mínimo automático de um bloco que NÃO rola é o próprio conteúdo.
            // Isto substituiu o desconto fixo que o corpo carregava — ver o
            // comentário do corpo para o porquê da troca.
            style={{
              ...modalSurface(1120),
              display: "flex", flexDirection: "column",
              maxHeight: "calc(100vh - 48px)",
            }}
            // Sem isto o Radix focava o PRIMEIRO tabulável do conteúdo, que era
            // o botão de registrar cobrança: a primeira barra de espaço (gesto
            // natural de quem abriu e quer rolar) gravava um POST em nome do
            // diretor. O destino é obrigatório — `preventDefault` sem mover o
            // foco joga tudo no <body>.
            onOpenAutoFocus={(e) => { e.preventDefault(); tituloModalRef.current?.focus(); }}
          >
            {modalEv && modalChip && (
              <>
                <ModalHeader
                  variant="work"
                  icon={Truck}
                  title={modalEv.name}
                  subtitle={`Saída ${fmtSaida(modalEv.truckDepartureDate)} · ${modalChip.full} · ${modalEv.deliveredItems} de ${modalEv.totalItems} entregues`}
                  onClose={() => setDetailId(null)}
                />
                {/* O CORPO é o scrollport ÚNICO do modal, não o Content: com
                    o overflow no Content o X do cabeçalho rolava junto com o
                    conteúdo e sumia num evento com quatro grupos de quinze
                    linhas. `position: relative` para o título sr-only abaixo
                    pertencer a ESTE scrollport — é o que faz a barra de
                    espaço rolar.

                    TUDO que tem altura variável (drill + bloco de cobrança
                    com o form de promessa) mora AQUI DENTRO. O bloco de
                    cobrança já viveu no ModalFooter: rodapé não rola, e com
                    o form aberto num drill grande ele crescia para fora da
                    viewport — o botão de confirmar sumia atrás da barra do
                    Windows e o link do rodapé era desenhado fora do modal.
                    No rodapé fixo fica só o que tem UMA linha (o link). */}
                <div style={{
                  position: "relative", overflowY: "auto", padding: "18px 24px",
                  // O TETO SAIU DAQUI e virou layout — e a troca tem conta.
                  //
                  // Era `min(70vh, calc(100vh - 240px))`. Os 240 eram um
                  // desconto CHUTADO: cabeçalho ~84 + rodapé ~50 + folga. Refiz
                  // a conta com os valores reais do `modal-shell` — cabeçalho
                  // 93 (22+22 de padding + max(ladrilho 40; título 20×1,25=25
                  // + 3 + subtítulo 13×1,5≈19,5) ≈ 47,5 + 1 de borda), rodapé
                  // 51 (16+16 + link de 12px ≈18 + 1), respiro 48 (24+24) —
                  // e deu 192. Medi: em 1366×768 sobravam 51px de folga, certo;
                  // em 375×667, só 12px. O erro é estrutural, não aritmético —
                  // no celular o subtítulo ("Saída … · Saída atrasada … · 72 de
                  // 149 entregues") quebra em três linhas e o cabeçalho vai de
                  // 93 para ~130. Nenhum número fixo acerta os dois.
                  //
                  // Então o teto virou `maxHeight` no DialogContent (100vh−48)
                  // com coluna flex: `flex: 1 1 auto` + `minHeight: 0` faz este
                  // corpo receber EXATAMENTE o que sobrar depois do cabeçalho e
                  // do rodapé medidos pelo próprio navegador, em qualquer
                  // viewport. `minHeight: 0` é obrigatório: sem ele o tamanho
                  // mínimo automático do item flex é o conteúdo, o corpo se
                  // recusa a encolher e volta a empurrar o rodapé para fora da
                  // tela — que é o bug de origem desta estrutura.
                  //
                  // O que NÃO mudou: este corpo segue o ÚNICO scrollport do
                  // modal, e tudo de altura variável (drill + bloco de
                  // cobrança com o form de promessa) segue morando aqui dentro.
                  flex: "1 1 auto", minHeight: 0,
                }}>
                  {/* Título só para leitor de tela (o cabeçalho visual já
                      mostra o nome) e alvo do foco inicial. */}
                  <DialogTitle ref={tituloModalRef} tabIndex={-1} className="sr-only">
                    {modalEv.name}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    Prazos de cada etapa, peças pendentes e registro de cobrança do evento.
                  </DialogDescription>

                  {saiuDoPayload && (
                    <div role="status" style={{
                      display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 14,
                      backgroundColor: TI.greenBg, border: `1px solid ${TI.green}`, borderRadius: R.md,
                      padding: "10px 12px",
                    }}>
                      <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, color: TI.green, flexShrink: 0, marginTop: 1 }} />
                      <span style={{ fontSize: 13, color: TI.title, fontWeight: 600 }}>
                        Este evento saiu da gestão de prazos — todas as peças foram entregues ou o evento começou.
                        O que está abaixo é a última foto que a tela tinha.
                      </span>
                    </div>
                  )}

                  {modalEv.solicitante && (
                    <p style={{ margin: "0 0 12px", fontSize: 12, color: TI.secondary }}>
                      Solicitante: <strong style={{ color: TI.title, fontWeight: 700 }}>{modalEv.solicitante}</strong>
                    </p>
                  )}

                  {/* Um prazo com DATA por etapa, no topo — a lista vem de
                      `modalEv.stages`, então a trilha acompanha o funil sozinha
                      (foi assim que a Finalização entrou aqui sem tocar em
                      nada). O modal era o caminho principal do quadro e não
                      trazia um dd/mm em lugar nenhum: o melhor artefato da
                      tela ficava invisível justamente ali. */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginBottom: 16 }}>
                    {modalEv.stages.map((s) => (
                      <div key={s.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                        <StageCell stage={s} invalidDate={modalEv.invalidDate} />
                        <span style={{ display: "block", fontSize: 10, color: TI.label, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {STAGE_SHORT[s.key] ?? s.label}
                        </span>
                      </div>
                    ))}
                  </div>

                  <EventDrilldown
                    ev={modalEv}
                    cobranca={cobrancaEvento(modalEv.id)}
                    today={today}
                    showCobranca={false}
                  />

                  {/* Bloco de cobrança — a ação primária do modal — no FIM do
                      scrollport, nunca no rodapé: o form "Combinar um prazo"
                      expande e conteúdo de altura variável fora do scrollport
                      é exatamente o que estourava o modal. */}
                  <div className="gp-no-print" style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${TI.border}` }}>
                    {/* O bloco de cobrança tem teto próprio: com o modal em
                        1120 o layout "bloco" estica os campos, e uma caixa de
                        data e um campo de nota com 1072px de largura são um
                        alvo enorme para dois dados curtos. As tabelas usam a
                        largura toda; o formulário, não. */}
                    <div style={{ maxWidth: 640 }}>
                      <CobradoControl
                        targetType="event"
                        targetId={modalEv.id}
                        cobranca={cobrancaEvento(modalEv.id)}
                        today={today}
                        variant="primary"
                        layout="bloco"
                        showForm
                        showHistorico
                      />
                    </div>
                  </div>
                </div>
                <ModalFooter>
                  <div style={{ display: "flex", justifyContent: "flex-start" }}>
                    {/* Envolto num flex item: como filho DIRETO do rodapé o
                        link era blocado a 100% da largura e clicar no vazio à
                        direita navegava para fora do modal sem aviso. */}
                    <Link
                      href={`/eventos/${modalEv.id}`}
                      style={{ fontSize: 12, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}
                    >
                      Abrir o evento completo →
                    </Link>
                  </div>
                </ModalFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {data && events.length > 0 && (
          <AnaliseBand
            totalEventos={events.length}
            setores={sectorSummary}
            sponsorDelays={sponsorDelays}
            eventosPorEtapa={eventosPorEtapa}
            proximosDias={proximosDias}
            cobrancas={cobrancas}
            today={today}
            etapaFoco={etapaFoco}
            // Filtrar por etapa/dia acontece bem abaixo da dobra: sem o
            // scroll o clique parecia não fazer nada (os dois botões — o de
            // etapa e o da barra de dias — precisam do mesmo gesto).
            //
            // O clique de etapa LIMPA os demais filtros de propósito: o botão
            // promete "os N eventos parados nesta etapa" contando o CONJUNTO
            // COMPLETO (a faixa de análise carimba esse escopo). Aplicar o
            // foco por cima de "Só com atraso" + busca devolvia menos que N —
            // o clique que se contradiz com o número prometido.
            onEtapaFoco={(k) => {
              setSoAtrasados(false); setSoSaidas7d(false); setSoSemPecas(false);
              setSoInvalidos(false); setBusca(""); setPrioridade("all"); setDiaFoco("");
              setEtapaFoco(k);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            diaFoco={diaFoco}
            onDiaFoco={(d) => { setDiaFoco(d); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        )}
      </div>
    </div>
  );
}
