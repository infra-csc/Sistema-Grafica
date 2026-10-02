// ─────────────────────────────────────────────────────────────────────────────
// ANÁLISES — o painel de STATUS da operação inteira, por abas (dono, 01–02/10:
// "algo bem mais completo, focado em status, com abas, de todas as fases…
// onde o gestor da empresa abra e consiga ver tudo").
//
// O QUE A PÁGINA FAZ, E SÓ ISSO:
//   1. busca UMA vez (/api/items, /api/events, /api/sponsors — as mesmas
//      chaves do resto do app, então o cache é compartilhado — e os agregados
//      de /api/analises/operacao, que podem falhar sem derrubar nada);
//   2. aplica os filtros do TOPO (evento, patrocinador, tipo, atalhos), que
//      valem para todas as abas e moram na URL — o recorte sobrevive ao F5,
//      ao Voltar e a um link colado no WhatsApp;
//   3. lê cada peça uma vez (lib/analises-estado) e entrega o MESMO contexto a
//      todas as abas: nenhum número é calculado duas vezes;
//   4. monta a gaveta de drill-down que todo número clicável abre.
//
// É SÓ LEITURA: nada aqui muda dado. O máximo que um clique faz é abrir a
// gaveta, trocar de aba ou levar à peça.
//
// Acesso: só admin (App.tsx e app-sidebar.tsx) — é a tela do gestor.
// ─────────────────────────────────────────────────────────────────────────────
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, Calendar, ChevronDown, Flag, Lock, RotateCcw, Shapes, SlidersHorizontal, X } from "lucide-react";
import { ehBookCompleto } from "@shared/fluxo-peca";
import type { OperacaoDaAnalise } from "@shared/analises-operacao-contract";
import { FilterSelect } from "@/components/filter-select";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";
import { Abas } from "@/components/ui/abas";
import { Botao } from "@/components/ui/botao";
import { EstadoErro, Esqueleto } from "@/components/ui/estados";
import { fmtRelative } from "@/components/prazos/tokens";
import { useIsMobile } from "@/hooks/use-mobile";
import { T, TOM, FS, FW, R, FONT } from "@/lib/theme";
import { businessDayMs } from "@/lib/analises-metrics";
import type { AnaliseSponsor } from "@/lib/analises-metrics";
import { criarLeitor, filtrarPecas, opcoesDeTipo, resumirEstado, type FiltrosDoEstado } from "@/lib/analises-estado";
import { ABAS_DA_ANALISE, type ContextoDaAnalise, type EventoDaAnalise, type IdDaAba, type PecaDaAnalise } from "./contexto";
import { GavetaDePecas, fmtInt, plural } from "./componentes";

// ─── As abas, sob demanda ────────────────────────────────────────────────────
// Cada aba é um pedaço próprio do bundle: quem abre a Visão geral não baixa o
// recharts do Desempenho.
type ComponenteDeAba = React.ComponentType<{ ctx: ContextoDaAnalise }>;
const ABAS: Record<IdDaAba, React.LazyExoticComponent<ComponenteDeAba>> = {
  geral: React.lazy(() => import("./abas/geral")),
  solicitacao: React.lazy(() => import("./abas/solicitacao")),
  arte: React.lazy(() => import("./abas/arte")),
  aprovacao: React.lazy(() => import("./abas/aprovacao")),
  revisao: React.lazy(() => import("./abas/revisao")),
  grafica: React.lazy(() => import("./abas/grafica")),
  eventos: React.lazy(() => import("./abas/eventos")),
  pessoas: React.lazy(() => import("./abas/pessoas")),
  estoque: React.lazy(() => import("./abas/estoque")),
  desempenho: React.lazy(() => import("./abas/desempenho")),
};

/** As abas que leem a fase do fluxo — o contador delas é o de atrasadas. */
const FASE_DA_ABA: Partial<Record<IdDaAba, "solicitacao" | "arte" | "aprovacao" | "revisao" | "grafica">> = {
  solicitacao: "solicitacao", arte: "arte", aprovacao: "aprovacao", revisao: "revisao", grafica: "grafica",
};

// ─── O recorte na URL ────────────────────────────────────────────────────────
// `evento` e `patrocinador` são os MESMOS nomes que o Painel Geral e a aba
// Desempenho já entendem — o link pode ir e voltar entre as telas.
const CHAVES = {
  aba: "aba", evento: "evento", patrocinador: "patrocinador", tipo: "tipo",
  atrasadas: "atrasadas", travadas: "travadas", prioritarias: "prioritarias",
} as const;

interface EstadoDaUrl extends FiltrosDoEstado { aba: IdDaAba }

function lerDaUrl(): EstadoDaUrl {
  const p = new URLSearchParams(window.location.search);
  const aba = p.get(CHAVES.aba);
  return {
    aba: ABAS_DA_ANALISE.some((a) => a.id === aba) ? (aba as IdDaAba) : "geral",
    evento: p.get(CHAVES.evento) || "all",
    patrocinador: p.get(CHAVES.patrocinador) || "all",
    tipo: p.get(CHAVES.tipo) || "all",
    soAtrasadas: p.get(CHAVES.atrasadas) === "1",
    soTravadas: p.get(CHAVES.travadas) === "1",
    soPrioritarias: p.get(CHAVES.prioritarias) === "1",
  };
}

const SEM_ITENS: PecaDaAnalise[] = [];
const SEM_EVENTOS: EventoDaAnalise[] = [];
const SEM_PATROCINADORES: AnaliseSponsor[] = [];

// O "atualizado" é da casa: polling de 5 min como rede de segurança do socket,
// revalidação ao voltar para a aba (mesmo acordo da tela de Desempenho).
const FRESCOR = {
  staleTime: 60_000,
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchInterval: 300_000,
} as const;

const PADDING = (isMobile: boolean) => (isMobile ? "14px 14px 40px" : "24px 28px 56px");

// ─── Uma aba que quebra não derruba a página ─────────────────────────────────
class LimiteDaAba extends React.Component<{ rotulo: string; children: React.ReactNode }, { erro: boolean }> {
  state = { erro: false };
  static getDerivedStateFromError() { return { erro: true }; }
  componentDidCatch(e: unknown) { console.error("[analises] aba quebrou:", e); }
  render() {
    if (!this.state.erro) return this.props.children;
    return (
      <EstadoErro
        testId="aba-erro"
        titulo={`A aba ${this.props.rotulo} não abriu`}
        detalhe="As outras abas continuam funcionando. Tente abrir esta de novo; se persistir, avise o suporte."
        aoTentarDeNovo={() => this.setState({ erro: false })}
      />
    );
  }
}

/**
 * A PISTA DE QUE HÁ MAIS ABAS. No celular o trilho rola de lado, e sem pista a
 * última aba visível parece a última que existe. Um degradê na cor do fundo
 * aparece na borda que ainda tem aba escondida — e some quando se chega nela.
 * Mede o próprio trilho (o <Abas> da casa não traz isso).
 */
function TrilhoComDegrade({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [bordas, setBordas] = React.useState({ esq: false, dir: false });
  React.useEffect(() => {
    const trilho = ref.current?.querySelector<HTMLElement>("[role=tablist]");
    if (!trilho) return;
    const medir = () => {
      const max = trilho.scrollWidth - trilho.clientWidth;
      const esq = trilho.scrollLeft > 2;
      const dir = max > 2 && trilho.scrollLeft < max - 2;
      setBordas((b) => (b.esq === esq && b.dir === dir ? b : { esq, dir }));
    };
    medir();
    trilho.addEventListener("scroll", medir, { passive: true });
    window.addEventListener("resize", medir);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(medir) : null;
    ro?.observe(trilho);
    return () => { trilho.removeEventListener("scroll", medir); window.removeEventListener("resize", medir); ro?.disconnect(); };
  }, []);
  const veu = (lado: "left" | "right"): React.CSSProperties => ({
    position: "absolute", top: 0, bottom: 1, [lado]: 0, width: 32, pointerEvents: "none",
    background: `linear-gradient(to ${lado === "left" ? "right" : "left"}, ${T.bg}, transparent)`,
  });
  return (
    <div ref={ref} style={{ position: "relative", marginBottom: 20 }}>
      {children}
      {bordas.esq && <span aria-hidden="true" data-testid="abas-degrade-esq" style={veu("left")} />}
      {bordas.dir && <span aria-hidden="true" data-testid="abas-degrade-dir" style={veu("right")} />}
    </div>
  );
}

export default function Analises() {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const inicial = React.useMemo(lerDaUrl, []);
  const [aba, setAba] = React.useState<IdDaAba>(inicial.aba);
  const [evento, setEvento] = React.useState(inicial.evento);
  const [patrocinador, setPatrocinador] = React.useState(inicial.patrocinador);
  const [tipo, setTipo] = React.useState(inicial.tipo);
  const [soAtrasadas, setSoAtrasadas] = React.useState(inicial.soAtrasadas);
  const [soTravadas, setSoTravadas] = React.useState(inicial.soTravadas);
  const [soPrioritarias, setSoPrioritarias] = React.useState(inicial.soPrioritarias);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  // ── Dados ──────────────────────────────────────────────────────────────────
  const itQ = useQuery<PecaDaAnalise[]>({ queryKey: ["/api/items"], ...FRESCOR });
  const evQ = useQuery<EventoDaAnalise[]>({ queryKey: ["/api/events"], ...FRESCOR });
  const spQ = useQuery<AnaliseSponsor[]>({ queryKey: ["/api/sponsors"], ...FRESCOR });
  // Sem `de`/`ate`: o servidor usa os últimos 30 dias — e a chave fica
  // estável (um carimbo de hora nela refaria a busca a cada minuto).
  const qsOperacao = new URLSearchParams();
  if (evento !== "all") qsOperacao.set("evento", evento);
  if (patrocinador !== "all") qsOperacao.set("patrocinador", patrocinador);
  const opQ = useQuery<OperacaoDaAnalise>({
    queryKey: [`/api/analises/operacao${qsOperacao.toString() ? `?${qsOperacao}` : ""}`],
    ...FRESCOR,
    retry: 1,
  });

  // BOOK COMPLETO não é peça: é o trâmite de aprovação do Atendimento e some
  // de toda contagem (shared/fluxo-peca).
  const todasAsPecas = React.useMemo(
    () => (itQ.data ? itQ.data.filter((i) => !ehBookCompleto(i)) : SEM_ITENS), [itQ.data]);
  const eventos = evQ.data ?? SEM_EVENTOS;
  const patrocinadores = spQ.data ?? SEM_PATROCINADORES;
  const eventoPorId = React.useMemo(() => new Map(eventos.map((e) => [e.id, e])), [eventos]);

  // ── O relógio ──────────────────────────────────────────────────────────────
  // Um tique por minuto alimenta o "Atualizado há X"; as contas só refazem na
  // VIRADA DO DIA do negócio — idade e prazo são em dias.
  const [agora, setAgora] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const diaDoNegocio = businessDayMs(agora);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hoje = React.useMemo(() => new Date(agora), [diaDoNegocio]);

  const leitura = React.useMemo(() => criarLeitor<PecaDaAnalise>(eventoPorId, hoje), [eventoPorId, hoje]);

  const filtros: FiltrosDoEstado = React.useMemo(
    () => ({ evento, patrocinador, tipo, soAtrasadas, soTravadas, soPrioritarias }),
    [evento, patrocinador, tipo, soAtrasadas, soTravadas, soPrioritarias]);
  const pecas = React.useMemo(() => filtrarPecas(todasAsPecas, filtros, leitura), [todasAsPecas, filtros, leitura]);
  // A base dos atalhos: o recorte de evento/patrocinador/tipo SEM os atalhos —
  // o número ao lado de "Atrasadas" promete o que o clique entrega.
  const semAtalhos = React.useMemo(
    () => filtrarPecas(todasAsPecas, { ...filtros, soAtrasadas: false, soTravadas: false, soPrioritarias: false }, leitura),
    [todasAsPecas, filtros, leitura]);
  const estado = React.useMemo(() => resumirEstado(pecas, leitura, hoje), [pecas, leitura, hoje]);
  const estadoDoTodo = React.useMemo(() => resumirEstado(todasAsPecas, leitura, hoje), [todasAsPecas, leitura, hoje]);
  const atalhos = React.useMemo(() => {
    let atrasadas = 0, travadas = 0, prioritarias = 0;
    for (const p of semAtalhos) {
      const l = leitura(p);
      if (l.atrasada) atrasadas++;
      if (l.travada) travadas++;
      if (l.prioritaria) prioritarias++;
    }
    return { atrasadas, travadas, prioritarias };
  }, [semAtalhos, leitura]);

  // As opções dos filtros com a contagem ao lado: UMA passada pelas peças (e
  // memoizada — o tique de 1 min não refaz). Sem o número, escolher um evento
  // era apostar entre "tem peça" e "zero".
  const { opcoesEvento, opcoesPatrocinador, opcoesTipo } = React.useMemo(() => {
    const porEvento = new Map<string, number>();
    const porPatrocinador = new Map<string, number>();
    for (const p of todasAsPecas) {
      porEvento.set(p.eventId, (porEvento.get(p.eventId) ?? 0) + 1);
      for (const sp of p.sponsors ?? []) if (sp?.id) porPatrocinador.set(sp.id, (porPatrocinador.get(sp.id) ?? 0) + 1);
    }
    return {
      opcoesEvento: eventos.map((e) => ({ value: e.id, label: e.name, count: porEvento.get(e.id) ?? 0 })),
      opcoesPatrocinador: patrocinadores.map((sp) => ({ value: sp.id, label: sp.name, count: porPatrocinador.get(sp.id) ?? 0 })),
      opcoesTipo: opcoesDeTipo(todasAsPecas),
    };
  }, [todasAsPecas, eventos, patrocinadores]);

  // ── URL ────────────────────────────────────────────────────────────────────
  React.useEffect(() => {
    const t = setTimeout(() => {
      // Lê a URL NA HORA: a aba Desempenho escreve as chaves dela (período,
      // dimensão, ordem) no mesmo endereço, e nenhuma das duas apaga a outra.
      const p = new URLSearchParams(window.location.search);
      const por = (k: string, v: string, padrao: string) => { if (v === padrao) p.delete(k); else p.set(k, v); };
      por(CHAVES.aba, aba, "geral");
      por(CHAVES.evento, evento, "all");
      por(CHAVES.patrocinador, patrocinador, "all");
      por(CHAVES.tipo, tipo, "all");
      por(CHAVES.atrasadas, soAtrasadas ? "1" : "", "");
      por(CHAVES.travadas, soTravadas ? "1" : "", "");
      por(CHAVES.prioritarias, soPrioritarias ? "1" : "", "");
      const qs = p.toString();
      window.history.replaceState(window.history.state, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
    }, 150);
    return () => clearTimeout(t);
  }, [aba, evento, patrocinador, tipo, soAtrasadas, soTravadas, soPrioritarias]);

  React.useEffect(() => {
    const onPop = () => {
      const f = lerDaUrl();
      setAba(f.aba); setEvento(f.evento); setPatrocinador(f.patrocinador); setTipo(f.tipo);
      setSoAtrasadas(f.soAtrasadas); setSoTravadas(f.soTravadas); setSoPrioritarias(f.soPrioritarias);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const filtrosAtivos = [evento !== "all", patrocinador !== "all", tipo !== "all", soAtrasadas, soTravadas, soPrioritarias].filter(Boolean).length;
  const limparFiltros = React.useCallback(() => {
    setEvento("all"); setPatrocinador("all"); setTipo("all");
    setSoAtrasadas(false); setSoTravadas(false); setSoPrioritarias(false);
  }, []);

  // ── Gaveta ─────────────────────────────────────────────────────────────────
  const [gaveta, setGaveta] = React.useState<{ aberta: boolean; titulo: string; subtitulo?: string; pecas: PecaDaAnalise[] }>(
    { aberta: false, titulo: "", pecas: SEM_ITENS });
  const abrirPecas = React.useCallback((titulo: string, lista: PecaDaAnalise[], subtitulo?: string) => {
    setGaveta({ aberta: true, titulo, subtitulo, pecas: lista });
  }, []);
  // Fechar mantém o conteúdo: a gaveta sai animada com a lista que tinha.
  const fecharGaveta = React.useCallback(() => setGaveta((g) => ({ ...g, aberta: false })), []);
  const irParaAba = React.useCallback((id: IdDaAba) => {
    setAba(id);
    // A aba nova começa do topo dela, não no meio da rolagem da anterior.
    raizRef.current?.scrollTo?.({ top: 0 });
  }, []);
  const raizRef = React.useRef<HTMLDivElement>(null);

  const ctx: ContextoDaAnalise = React.useMemo(() => ({
    pecas,
    todasAsPecas,
    eventos,
    eventoPorId,
    patrocinadores,
    filtros,
    operacao: opQ.data ?? null,
    operacaoCarregando: opQ.isLoading,
    operacaoErro: opQ.isError,
    leitura,
    estado,
    estadoDoTodo,
    hoje,
    isMobile,
    abrirPecas,
    irParaAba,
    limparFiltros,
  }), [pecas, todasAsPecas, eventos, eventoPorId, patrocinadores, filtros, opQ.data, opQ.isLoading, opQ.isError,
    leitura, estado, estadoDoTodo, hoje, isMobile, abrirPecas, irParaAba, limparFiltros]);

  // ── As abas, com o contador que importa ────────────────────────────────────
  const eventosComAtraso = estado.porEvento.filter((e) => e.atrasadas.length > 0).length;
  const itensDasAbas = ABAS_DA_ANALISE.map((a) => {
    const fase = FASE_DA_ABA[a.id];
    const atrasadas = fase ? estado.porFase[fase].atrasadas.length : a.id === "eventos" ? eventosComAtraso : 0;
    return {
      id: a.id,
      rotulo: a.rotulo,
      // O nome completo fica na dica (o rótulo é curto para as dez caberem).
      title: a.titulo,
      idDoElemento: `aba-analises-${a.id}`,
      ariaControls: "painel-analises",
      // Um "3" vermelho ao lado de "Arte" é a notícia antes da palavra: o
      // contador só aparece quando há atraso — contagem sem problema não é notícia.
      ...(atrasadas > 0 ? {
        contador: atrasadas,
        tom: "perigo" as const,
        title: a.id === "eventos"
          ? `${a.titulo} — ${atrasadas} ${plural(atrasadas, "evento com peça atrasada", "eventos com peça atrasada")}`
          : `${a.titulo} — ${atrasadas} ${plural(atrasadas, "peça atrasada", "peças atrasadas")} na etapa`,
      } : {}),
    };
  });
  const rotuloDaAba = ABAS_DA_ANALISE.find((a) => a.id === aba)?.titulo ?? "";
  const AbaAtiva = ABAS[aba];

  // ── Estados de carga ───────────────────────────────────────────────────────
  const isLoading = itQ.isLoading || evQ.isLoading || spQ.isLoading;
  // Sem uma das três fontes todo número muda de significado (sem eventos não
  // há prazo; sem patrocinadores o filtro mente) — erro da página inteira.
  const isError = itQ.isError || evQ.isError || spQ.isError;
  const isFetching = itQ.isFetching || evQ.isFetching || spQ.isFetching;
  const tentarDeNovo = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sponsors"] });
  };
  const atualizadoEmMs = Math.min(itQ.dataUpdatedAt || agora, evQ.dataUpdatedAt || agora, spQ.dataUpdatedAt || agora);
  const dadoVelho = agora - atualizadoEmMs >= 10 * 60_000;

  if (isError) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 480, width: "100%" }}>
          <EstadoErro
            titulo="Não foi possível carregar as análises"
            detalhe={isFetching
              ? "Tentando de novo…"
              : "Sem uma das três fontes (peças, eventos, patrocinadores) os números mudariam de significado — por isso nada é exibido pela metade."}
            carregando={isFetching}
            aoTentarDeNovo={tentarDeNovo}
            testIdDoBotao="analises-tentar-de-novo"
          />
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING(isMobile) }}>
        <div className="animate-pulse" style={{ width: 200, height: 26, borderRadius: R.sm, backgroundColor: T.border, marginBottom: 10 }} />
        <div className="animate-pulse" style={{ width: 360, maxWidth: "90%", height: 12, borderRadius: R.sm, backgroundColor: T.low, marginBottom: 20 }} />
        <div className="animate-pulse" style={{ height: 56, borderRadius: R.lg, backgroundColor: T.low, border: `1px solid ${T.border}`, marginBottom: 16 }} />
        <div className="animate-pulse" style={{ height: 40, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }} />
        <Esqueleto variante="cartoes" linhas={6} rotulo="Carregando análises" />
      </div>
    );
  }

  // ── Faixa de filtros ───────────────────────────────────────────────────────
  const gatilho = isMobile ? undefined : { minWidth: 170 };

  const selects = (
    <>
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Evento" allLabel="Todos os eventos" icon={Calendar} activeAppearance="solid"
        value={evento} onChange={setEvento} options={opcoesEvento}
        searchPlaceholder="Buscar evento…" emptyText="Nenhum evento encontrado."
        testId="analises-filtro-evento" fullWidth={isMobile} panelWidth={isMobile ? undefined : 330} triggerStyle={gatilho}
      />
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Patrocinador" allLabel="Todos os patrocinadores" icon={Building2} activeAppearance="solid"
        value={patrocinador} onChange={setPatrocinador} options={opcoesPatrocinador}
        searchPlaceholder="Buscar patrocinador…" emptyText="Nenhum patrocinador encontrado."
        testId="analises-filtro-patrocinador" fullWidth={isMobile} panelWidth={isMobile ? undefined : 300} triggerStyle={gatilho}
      />
      <FilterSelect
        showAllLabelWhenEmpty hideWhenEmpty={false}
        label="Tipo de peça" allLabel="Todos os tipos" icon={Shapes} activeAppearance="solid"
        value={tipo} onChange={setTipo} options={opcoesTipo}
        searchPlaceholder="Buscar tipo…" emptyText="Nenhum tipo encontrado."
        testId="analises-filtro-tipo" fullWidth={isMobile} panelWidth={isMobile ? undefined : 260} triggerStyle={gatilho}
        dropdownAlign={isMobile ? undefined : "right"}
      />
    </>
  );

  const atalho = (ligado: boolean, alternar: () => void, rotulo: string, n: number, tom: "perigo" | "roxo" | "laranja", Icone: typeof AlertTriangle, testId: string) => (
    <Botao
      tamanho={isMobile ? "toque" : "sm"}
      variante={ligado ? "primario" : "secundario"}
      tom={tom}
      icone={Icone}
      aria-pressed={ligado}
      onClick={alternar}
      data-testid={testId}
      title={ligado ? `Mostrando só ${rotulo.toLowerCase()} — clique para ver todas` : `Recortar todas as abas para ${rotulo.toLowerCase()}`}
      style={isMobile ? { width: "100%", justifyContent: "center", whiteSpace: "nowrap", paddingLeft: 8, paddingRight: 8 } : { flexShrink: 0, whiteSpace: "nowrap" }}
    >
      {/* No celular o "Só" sai: é o que fazia cada atalho ocupar uma linha. O
          estado ligado continua dito pela cor e pelo aria-pressed. */}
      {isMobile ? rotulo : `Só ${rotulo.toLowerCase()}`}
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(n)}</span>
    </Botao>
  );
  const linhaDeAtalhos = (
    <div
      role="group"
      aria-label="Atalhos de recorte"
      // QUEBRA LINHA em toda largura: rolando de lado, no celular o 2º atalho
      // ficava pela metade e o 3º sumia — atalho escondido é atalho que não existe.
      // No celular, grade de duas colunas: um por linha ocupava 160px da dobra.
      style={isMobile
        ? { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }
        : { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}
    >
      {atalho(soAtrasadas, () => setSoAtrasadas((v) => !v), "Atrasadas", atalhos.atrasadas, "perigo", AlertTriangle, "atalho-atrasadas")}
      {atalho(soTravadas, () => setSoTravadas((v) => !v), "Travadas", atalhos.travadas, "roxo", Lock, "atalho-travadas")}
      {atalho(soPrioritarias, () => setSoPrioritarias((v) => !v), "Prioritárias", atalhos.prioritarias, "laranja", Flag, "atalho-prioritarias")}
    </div>
  );
  const resumo = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: isMobile ? 0 : "auto", flexShrink: 0, width: isMobile ? "100%" : undefined }}>
      <span role="status" aria-live="polite" data-testid="recorte-status" style={{ fontSize: FS.body, color: T.second, fontWeight: FW.medio, whiteSpace: isMobile ? "normal" : "nowrap" }}>
        {filtrosAtivos > 0 && <>{filtrosAtivos} {plural(filtrosAtivos, "filtro ativo", "filtros ativos")} · </>}
        <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtInt(pecas.length)}</strong>
        {" de "}
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtInt(todasAsPecas.length)}</span>
        {" peças"}
      </span>
      {/* Sem filtro, não há o que limpar: o botão apagado com "Nenhum filtro
          aplicado" embaixo era uma linha inteira dizendo nada. */}
      {filtrosAtivos > 0 && (
        <Botao
          tamanho={isMobile ? "toque" : "sm"} icone={X} onClick={limparFiltros}
          data-testid="analises-limpar" style={{ marginLeft: isMobile ? "auto" : 0, flexShrink: 0 }}
        >
          Limpar tudo
        </Botao>
      )}
    </div>
  );
  const nSelects = [evento !== "all", patrocinador !== "all", tipo !== "all"].filter(Boolean).length;

  const ativas = estado.ativas.pecas.length;
  const atrasadas = estado.ativas.atrasadas.length;

  return (
    <div ref={raizRef} data-testid="pagina-analises" style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: PADDING(isMobile) }}>
      <CabecalhoDaPagina
        titulo="Análises"
        testId="title-analises"
        subtitulo={
          <span data-testid="analises-subtitulo">
            <strong style={{ color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtInt(ativas)}</strong> {plural(ativas, "peça em andamento", "peças em andamento")}
            {" · "}
            <strong style={{ color: atrasadas > 0 ? TOM.perigo.text : T.text, fontVariantNumeric: "tabular-nums" }}>{fmtInt(atrasadas)}</strong> {plural(atrasadas, "atrasada", "atrasadas")} na etapa
            {filtrosAtivos > 0 && " no recorte"}
          </span>
        }
        frescor={
          <span
            data-testid="analises-frescor"
            title={`Dados de ${new Date(atualizadoEmMs).toLocaleString("pt-BR")}. A tela se atualiza sozinha quando alguém muda uma peça, ao voltar para a aba e, por segurança, a cada 5 minutos.`}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, color: dadoVelho ? TOM.alerta.text : T.second, fontWeight: dadoVelho ? FW.forte : FW.corpo }}
          >
            {isFetching && <RotateCcw aria-hidden="true" className="animate-spin" style={{ width: 11, height: 11 }} />}
            Atualizado {fmtRelative(new Date(atualizadoEmMs).toISOString(), agora)}
          </span>
        }
        margemInferior={16}
      />

      {/* A faixa em T.low separa CONTROLE de RESULTADO: daqui para baixo, o
          que é branco é número. Os filtros valem para TODAS as abas. */}
      <div
        data-testid="faixa-filtros-analises"
        style={{
          backgroundColor: T.low, border: `1px solid ${T.border}`, borderRadius: R.lg,
          padding: isMobile ? "10px 12px" : "12px 16px", marginBottom: 16,
          display: "flex", flexDirection: "column", gap: 10,
        }}
      >
        {isMobile ? (
          <>
            <Botao
              tamanho="toque" icone={SlidersHorizontal} onClick={() => setFiltrosAbertos((v) => !v)}
              aria-expanded={filtrosAbertos} aria-controls="analises-filtros-celular" data-testid="analises-abrir-filtros"
              variante={nSelects > 0 ? "primario" : "secundario"} tom={nSelects > 0 ? "laranja" : undefined}
              style={{ alignSelf: "flex-start" }}
            >
              Evento, patrocinador e tipo{nSelects > 0 ? ` · ${nSelects}` : ""}
              <ChevronDown aria-hidden="true" style={{ width: 13, height: 13, transform: filtrosAbertos ? "rotate(180deg)" : "none" }} />
            </Botao>
            {filtrosAbertos && <div id="analises-filtros-celular" style={{ display: "flex", flexDirection: "column", gap: 8 }}>{selects}</div>}
            {linhaDeAtalhos}
            {resumo}
          </>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            {selects}
            <span aria-hidden="true" style={{ width: 1, alignSelf: "stretch", backgroundColor: T.border, margin: "2px 2px" }} />
            {linhaDeAtalhos}
            {resumo}
          </div>
        )}
      </div>

      <TrilhoComDegrade>
        <Abas
          itens={itensDasAbas}
          ativo={aba}
          aoTrocar={(id) => irParaAba(id as IdDaAba)}
          rotuloDaLista="Seções da Análises"
          prefixoDeTestId="aba-analises"
          testId="abas-analises"
          rolarAteAtiva
        />
      </TrilhoComDegrade>

      <div role="tabpanel" id="painel-analises" aria-labelledby={`aba-analises-${aba}`} data-testid={`painel-analises-${aba}`}>
        <LimiteDaAba key={aba} rotulo={rotuloDaAba}>
          <React.Suspense fallback={<Esqueleto variante="cartoes" linhas={4} rotulo={`Abrindo ${rotuloDaAba}`} />}>
            <AbaAtiva ctx={ctx} />
          </React.Suspense>
        </LimiteDaAba>
      </div>

      <GavetaDePecas
        aberta={gaveta.aberta}
        titulo={gaveta.titulo}
        subtitulo={gaveta.subtitulo}
        pecas={gaveta.pecas}
        leitura={leitura}
        aoFechar={fecharGaveta}
      />
    </div>
  );
}
