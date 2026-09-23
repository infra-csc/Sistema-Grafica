import { useQuery } from "@tanstack/react-query";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { getPriorityMeta, getStatusMeta, isEventoEncerrado } from "@/lib/status";
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar, Truck, Search, BarChart2, Flag, X, RotateCw } from "lucide-react";
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModalHeader, modalSurface, HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { MARCOS_DO_EVENTO, OFFSET_PADRAO_DO_MARCO } from "@shared/prazo-dates";
import type { EventoDaLista } from "@shared/api";
import { useDensidadeDoConteudo, usePonteiroGrosso, alvo } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";
import { T, FS, R, N, H, FW, FONT, TOM, SHADOW } from "@/lib/theme";
import { Botao } from "@/components/ui/botao";
import { EstadoErro } from "@/components/ui/estados";
import { Selo } from "@/components/ui/selo";
import { CabecalhoDaPagina } from "@/components/ui/cabecalho-da-pagina";

/* ── Palette ── */
const P = {
  bg:       T.bg,
  surface:  T.surface,
  border:   T.border,
  text:     T.text,
  // #746e69 é o cinza que passa AA em todas as superfícies do app (ver
  // lib/theme.ts) — o antigo #78716c reprovava sobre os fundos acinzentados.
  secondary:T.second,
  // Apenas decorativo (ícones, placeholders) — nunca como cor de texto.
  muted:    T.muted,
  accent:   T.accent,
  low:      N.n3,
};

/* ── Prioridade → cores canônicas (lib/status) ──
   Antes havia um mapa hex local (PRIO_COLOR) que usava a cor saturada como
   texto — reprovava WCAG AA e divergia das outras telas. Agora: `text` (tom
   escuro) no texto, `dot` (saturada) na bolinha/barra, como no resto do app.
   "completed" reaproveita o verde do status de evento concluído; sem
   prioridade cai na família neutra. */
const NO_PRIO = { label: "Sem prioridade", bg: T.low, text: T.strong, border: T.border, dot: T.second };
function prioMeta(ev: EventoDaLista): { label: string; bg: string; text: string; border: string; dot: string } {
  // Encerrado à mão vem ANTES da prioridade: um evento que alguém fechou
  // exibindo o chip vermelho "Urgente" cobra um trabalho que já saiu de pauta.
  const chave = isEventoEncerrado(ev) ? "closed" : ev.status === "completed" ? "completed" : null;
  if (chave) {
    const m = getStatusMeta(chave);
    return { label: m.label, bg: m.bg, text: m.text, border: m.border, dot: m.dot };
  }
  return getPriorityMeta(ev.priority) ?? NO_PRIO;
}

/* Legenda de prioridades — derivada da mesma fonte única. */
const LEGEND_PRIOS: { label: string; dot: string }[] = [
  ...(["urgente", "alta", "media", "baixa"] as const).map(k => {
    const m = getPriorityMeta(k)!;
    return { label: m.label, dot: m.dot };
  }),
  { label: getStatusMeta("completed").label, dot: getStatusMeta("completed").dot },
  { label: getStatusMeta("closed").label, dot: getStatusMeta("closed").dot },
];

/* ── Deadline types (same colors as event-detail) ──
   `text` é o tom 700 da MESMA família da cor saturada (violet→#6d28d9,
   blue→#1d4ed8, amber→#b45309, emerald→#047857, orange→#c2410c): a cor
   saturada como texto a 10px reprovava AA sobre o fundo tingido. */
// OS MARCOS VÊM DE @shared/prazo-dates — e são SEIS.
//
// Esta lista era escrita à mão aqui e tinha CINCO: faltava a FINALIZAÇÃO
// (−10). Não era escolha de desenho — o servidor COBRA esse prazo (coluna
// própria em `events`, e uma das seis chaves de `nextMilestone`), e o
// calendário simplesmente não o desenhava. Um evento cuja finalização vencia
// hoje não aparecia na grade nem no dialog do dia: cobrado num lugar e
// invisível justamente naquele onde as pessoas vão para planejar.
//
// Com a lista vindo de um lugar só, o próximo marco nasce nas três telas —
// e não em duas, com a terceira descobrindo meses depois.
const DEADLINE_TYPES = MARCOS_DO_EVENTO.map(m => ({
  key: m.campo, label: m.label, short: m.curto, color: m.cor, text: m.texto,
}));

/** Frase de ajuda de cada marco (legenda): o que é e quando vence, por padrão. */
const DICA_DO_MARCO: Record<string, string> = Object.fromEntries(MARCOS_DO_EVENTO.map(m => {
  const dias = Math.abs(m.offset);
  return [m.campo, `${m.label}: ${m.descricao}. Prazo padrão: ${dias} dia${dias !== 1 ? "s" : ""} antes da saída do caminhão (o evento pode ter prazo próprio).`];
}));

// ── CADA FUNÇÃO VÊ O QUE PRECISA (dono, 27/08) ─────────────────────────────
// Seis marcos para todo mundo enchiam cada célula de "+8 mais": a Gráfica
// caçava o "Prod. Gráfica" no meio de quatro prazos que não são dela. A régua
// é QUEM AGE no marco (a `descricao` de cada um em @shared/prazo-dates):
//   · Lista de Imagens ("criação dos itens") e Revisão de Lista ("criador
//     revisa") → Solicitação;
//   · Entrega de Layouts e Finalização ("Arte anexa o arquivo") → Arte;
//   · Aprovação de Layout ("aprovação pelo patrocinador") → Atendimento, que
//     é quem cobra o patrocinador;
//   · Produção Gráfica → Gráfica.
// Admin (e papel fora do mapa) vê tudo; os demais abrem no recorte da função
// e têm o botão "Todos os marcos" para ver o quadro inteiro.
const MARCOS_POR_PAPEL: Record<string, string[]> = {
  solicitacao: ["deadlineListaImagens", "deadlineRevisaoLista"],
  arte: ["deadlineEntregaLayouts", "deadlineFinalizacao"],
  atendimento: ["deadlineAprovacaoLayout"],
  grafica: ["deadlineProducaoGrafica"],
};

const DEADLINE_DEFAULTS: Record<string, number> = OFFSET_PADRAO_DO_MARCO;

/** O prazo do marco no evento (a coluna `campo`, em dias sobre a saída) ou o padrão da casa. */
function offsetDoMarco(ev: EventoDaLista, campo: string): number {
  const proprio = (ev as Record<string, unknown>)[campo] as number | null | undefined;
  return proprio ?? DEADLINE_DEFAULTS[campo];
}

/** O evento na grade: a mesma linha da lista, marcada como início ou saída. */
type EventoNaGrade = EventoDaLista & { _type: "start" | "departure" };

/* Sunday-first week (matches mockup) */
const WEEK_DAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function Calendario() {
  // A RÉGUA É A ÁREA ÚTIL do cartão do calendário, não a janela: com a sidebar
  // aberta num tablet, a janela diz "desktop" e sobram ~600px para sete
  // colunas — pílulas de 10px cortadas em quatro letras. `compacto` decide a
  // forma da grade (barrinhas × pílulas, alturas, colunas); `isMobile` (celular
  // de fato) fica para o respiro da página, a fonte 16 do campo e o modal; o
  // alvo de 44px vem do ponteiro grosso, que vale também no tablet.
  const densidade = useDensidadeDoConteudo<HTMLDivElement>();
  const { isMobile } = densidade;
  const compacto = densidade.cards;
  const grosso = usePonteiroGrosso() || isMobile;
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  // Recorte por função (ver MARCOS_POR_PAPEL). `verTodosOsMarcos` é a saída:
  // o recorte é o padrão, nunca uma prisão.
  const [verTodosOsMarcos, setVerTodosOsMarcos] = useState(false);
  const marcosDoPapel = MARCOS_POR_PAPEL[user?.role ?? ""] ?? null;
  const tiposVisiveis = useMemo(
    () => (!marcosDoPapel || verTodosOsMarcos)
      ? DEADLINE_TYPES
      : DEADLINE_TYPES.filter(dt => marcosDoPapel.includes(dt.key)),
    [marcosDoPapel, verTodosOsMarcos],
  );

  // ── A ESCALA ────────────────────────────────────────────────────────────
  //
  // Faltava a escala do meio: a faixa de alerta cobre 48h, a grade cobre o mês,
  // e a operação trabalha por semana. E na grade de 90px o nome do evento em
  // 10px trunca em ~80px — a pílula é quase decorativa.
  //
  // As abas Semana/Lista tinham sido removidas por serem ESTADO MORTO:
  // trocavam um `activeView` que nada na tela lia. Semana volta porque agora
  // tem conteúdo próprio, que era exatamente a condição registrada ali.
  // "Lista" não volta — continua sem conteúdo que a grade já não dê.
  //
  // No celular a semana é a MELHOR das duas: a grade de 62px só mostra
  // barrinhas de 4px, sem nome de evento nenhum.
  const [escala, setEscala] = useState<"semana" | "mes">(() => {
    const v = new URLSearchParams(window.location.search).get("escala");
    if (v === "semana" || v === "mes") return v;
    return typeof window !== "undefined" && window.innerWidth < 768 ? "semana" : "mes";
  });
  // A janela acima é só a SEMENTE do primeiro quadro (ainda não há medida).
  // Na primeira medida da área útil a escala padrão é refeita pela régua —
  // antes da pintura (layout effect), então não pisca. Uma vez só: depois
  // disso, e sempre que a escala veio da URL, quem manda é a pessoa.
  const escalaDecididaRef = useRef(new URLSearchParams(window.location.search).get("escala") !== null);
  useLayoutEffect(() => {
    if (escalaDecididaRef.current || densidade.largura === 0) return;
    escalaDecididaRef.current = true;
    setEscala(compacto ? "semana" : "mes");
  }, [densidade.largura, compacto]);
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Busca inicializa da URL e é espelhada nela (mesmo padrão de eventos.tsx):
  // F5 não perde o filtro e o link filtrado é compartilhável.
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [searchTerm, setSearchTerm] = useState(() => urlParams.get("busca") ?? "");

  useEffect(() => {
    const p = new URLSearchParams();
    if (searchTerm) p.set("busca", searchTerm);
    if (escala === "semana") p.set("escala", "semana");
    const qs = p.toString();
    // + hash: replaceState com URL sem #... apagava o fragmento da barra.
    window.history.replaceState(null, "", (qs ? `?${qs}` : window.location.pathname) + window.location.hash);
  }, [searchTerm, escala]);

  // Atalho "/" foca a busca (paridade com eventos.tsx e Painel Geral).
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const { data: events = [], isLoading, isError, refetch } = useQuery<EventoDaLista[]>({ queryKey: ["/api/events"] });

  // Tick de 1 min: as contagens regressivas usam "agora", e a tela fica aberta
  // por horas (TV do galpão). Sem o tick, os valores congelavam no instante do
  // primeiro render — um "2h 10min" podia estar exibido com o caminhão já na rua.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const year  = currentDate.getFullYear();
  const month = currentDate.getMonth();

  /* Sunday-first offset */
  const firstDay    = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDow    = firstDay.getDay(); // 0=Sunday

  const days: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  /* pad to complete last row */
  while (days.length % 7 !== 0) days.push(null);

  /* ── Índice por dia ──
     Antes cada célula varria a lista inteira de eventos (O(células×eventos))
     a cada render — e a busca re-renderiza a cada tecla. O índice é montado
     uma vez por mudança de dados e cada célula vira um lookup.

     Fuso: a saída do caminhão usa toUTCDisplayDate (lib/utils) — o valor foi
     gravado como UTC mas o horário digitado É o de exibição. Com new Date()
     cru, em UTC-3 uma saída "00:30" caía na grade um dia antes do que o
     dialog e os chips de prazo mostravam. Prazos são ancorados na SAÍDA DO
     CAMINHÃO (não no início do evento) — mesma âncora dos chips de prazo
     (event-detail/arte/atendimento) e dos alertas do servidor. */
  const byDay = useMemo(() => {
    const map = new Map<string, {
      events: EventoNaGrade[];
      deadlines: Array<{ event: EventoDaLista; dtype: typeof DEADLINE_TYPES[number] }>;
    }>();
    const bucket = (ds: string) => {
      let b = map.get(ds);
      if (!b) { b = { events: [], deadlines: [] }; map.set(ds, b); }
      return b;
    };
    for (const ev of events) {
      if (ev.startDate) {
        bucket(parseDateLocal(ev.startDate).toDateString()).events.push({ ...ev, _type: "start" as const });
      }
      if (!ev.truckDepartureDate) continue;
      bucket(toUTCDisplayDate(ev.truckDepartureDate).toDateString()).events.push({ ...ev, _type: "departure" as const });
      const base = toUTCDisplayDate(ev.truckDepartureDate);
      base.setHours(0, 0, 0, 0);
      for (const dt of tiposVisiveis) {
        const offset = offsetDoMarco(ev, dt.key);
        const d = new Date(base);
        d.setDate(d.getDate() + offset);
        bucket(d.toDateString()).deadlines.push({ event: ev, dtype: dt });
      }
    }
    // Dentro da célula, inícios antes de saídas (ordem que a varredura
    // antiga produzia) — sort estável preserva a ordem dos eventos.
    map.forEach(b => b.events.sort((a, c) => (a._type === c._type ? 0 : a._type === "start" ? -1 : 1)));
    return map;
  }, [events, tiposVisiveis]);

  // ═══════════════════════════════════════════════════════════════════════
  // A ORDEM DE URGÊNCIA DA CÉLULA
  //
  // A célula mostra 2 itens e o resto vira "+N mais". A ordem era a de
  // INSERÇÃO: eventos primeiro (início antes de saída), prazos depois. Com 5
  // prazos por evento mais início e saída, as células estouram com frequência
  // — e o que ficava escondido era arbitrário. Um "Prod. Gráfica" que vence
  // HOJE desaparecia atrás de duas pílulas de início de evento, que é a
  // marcação que menos pede ação de alguém.
  //
  // A mesma ordem vale nas três leituras (grade, barrinhas do celular e
  // dialog do dia): elas contam a mesma história ou não contam nenhuma.
  // ═══════════════════════════════════════════════════════════════════════
  const MS_DIA = 86_400_000;

  /** Menor número = mais urgente = aparece primeiro e nunca é o cortado. */
  function pesoDaUrgencia(item: { kind: string; ev?: EventoNaGrade }, diaMs: number, agoraMs: number): number {
    if (item.kind === "deadline") {
      const hoje = new Date(agoraMs); hoje.setHours(0, 0, 0, 0);
      if (diaMs === hoje.getTime()) return 0;   // vence hoje
      if (diaMs < hoje.getTime()) return 1;     // já passou
      return 4;                                  // prazo futuro
    }
    if (item.ev?._type === "departure") {
      const horas = (toUTCDisplayDate(item.ev.truckDepartureDate).getTime() - agoraMs) / 3_600_000;
      return horas > 0 && horas < 48 ? 2 : 3;   // saída em menos de 48h, ou normal
    }
    return 5;                                    // início de evento
  }

  /** Meia-noite do dia da célula, para comparar "vence hoje" contra ele. */
  const meiaNoiteDe = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  /** Domingo da semana que contém `d` — domingo-primeiro, como a grade. */
  const domingoDa = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - x.getDay());
    return x;
  };

  /** Uma semana ou um mês, conforme a escala em vigor. */
  const andar = (passo: number) => {
    if (escala === "semana") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + passo * 7);
      setCurrentDate(d);
      return;
    }
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + passo, 1));
  };

  const diasDaSemana = useMemo(() => {
    const dom = domingoDa(currentDate);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(dom);
      d.setDate(d.getDate() + i);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  const getEventsForDate    = (date: Date) => byDay.get(date.toDateString())?.events ?? [];
  const getDeadlinesForDate = (date: Date) => byDay.get(date.toDateString())?.deadlines ?? [];

  /* Urgent: departure < 48h away.
     toUTCDisplayDate: o horário de saída foi gravado como UTC mas É o de
     exibição — com new Date() cru, em UTC-3 a contagem ganhava 3h de folga
     fantasma (grade, dialog e chips já usam a mesma conversão). */
  const urgentEvents = useMemo(() =>
    events.filter(ev => {
      const hrs = (toUTCDisplayDate(ev.truckDepartureDate).getTime() - now) / 3_600_000;
      return hrs > 0 && hrs < 48;
    }).sort((a, b) => toUTCDisplayDate(a.truckDepartureDate).getTime() - toUTCDisplayDate(b.truckDepartureDate).getTime()),
  [events, now]);

  /* Next 5 events for sidebar */
  const upcomingEvents = useMemo(() =>
    events
      // Encerrado à mão sai dos "próximos eventos" pelo mesmo motivo que o
      // concluído: a lista é a fila do que ainda vai acontecer, e o evento que
      // um admin fechou não é mais trabalho de ninguém.
      .filter(ev => parseDateLocal(ev.startDate).getTime() >= now
        && ev.status !== "completed" && !isEventoEncerrado(ev))
      .sort((a, b) => parseDateLocal(a.startDate).getTime() - parseDateLocal(b.startDate).getTime())
      .slice(0, 5),
  [events, now]);

  /* Month stats — useMemo: era refiltrado a cada render (inclusive a cada
     tecla da busca), para um resultado que só muda com dados ou mês. */
  //
  // O RESUMO CONTAVA UM MÊS E A GRADE DESENHAVA OUTRO.
  //
  // O filtro era pela DATA DE INÍCIO; a grade desenha marcadores ancorados na
  // SAÍDA DO CAMINHÃO, e os cinco prazos saem dela. Um evento que começa em 12
  // de setembro com caminhão em 9 de setembro tem três prazos em agosto:
  // aparecia na grade de agosto e NÃO entrava no Resumo de agosto. Os dois
  // números da mesma tela contavam meses diferentes.
  //
  // Agora entra todo evento com QUALQUER marcador no mês exibido — o mesmo
  // conjunto que `byDay` desenhou. Isso muda completedCount, closedCount,
  // urgentCount e ongoingCount junto, e esse é o ponto: as cinco linhas passam
  // a descrever o que a pessoa está vendo.
  const monthEvents = useMemo(() => {
    const noMes = (d: Date | null) => !!d && d.getFullYear() === year && d.getMonth() === month;
    return events.filter(ev => {
      if (ev.startDate && noMes(parseDateLocal(ev.startDate))) return true;
      if (!ev.truckDepartureDate) return false;
      const saida = toUTCDisplayDate(ev.truckDepartureDate);
      if (noMes(saida)) return true;
      // Os cinco prazos, pela mesma âncora e pelos mesmos offsets que a grade
      // usa — se um deles cai no mês, o evento está desenhado ali.
      const base = toUTCDisplayDate(ev.truckDepartureDate);
      base.setHours(0, 0, 0, 0);
      return tiposVisiveis.some(dt => {
        const offset = offsetDoMarco(ev, dt.key);
        const d = new Date(base);
        d.setDate(d.getDate() + offset);
        return noMes(d);
      });
    });
  }, [events, year, month, tiposVisiveis]);
  const completedCount = monthEvents.filter(e => e.status === "completed").length;
  // Encerrado à mão precisa de linha PRÓPRIA. Somado a "Concluídos" ele diria
  // "deu tudo certo" num evento fechado com peça em aberto; sem linha nenhuma
  // ele engordava "Em andamento", que é justamente o número lido como fila.
  const closedCount    = monthEvents.filter(e => isEventoEncerrado(e)).length;
  const urgentCount    = monthEvents.filter(e => e.priority === "urgente").length;
  const ongoingCount   = monthEvents.length - completedCount - closedCount;

  // ── QUANTO A BUSCA ACHOU NO MÊS ──
  // A busca filtra a grade em silêncio: um termo que não casa com nada deixava
  // a grade VAZIA, idêntica a um mês sem evento — a pessoa não sabia se errou a
  // digitação ou se não havia nada marcado. Aqui só se CONTA o que a grade já
  // desenha, com o mesmo `casa` por nome: a busca em si não muda.
  const resultadoDaBusca = useMemo(() => {
    if (!searchTerm) return null;
    const termo = searchTerm.toLowerCase();
    let marcacoes = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const b = byDay.get(new Date(year, month, d).toDateString());
      if (!b) continue;
      marcacoes += b.events.filter(e => e.name.toLowerCase().includes(termo)).length
                 + b.deadlines.filter(x => x.event.name.toLowerCase().includes(termo)).length;
    }
    return marcacoes;
  }, [searchTerm, byDay, year, month, daysInMonth]);

  function msToHM(ms: number) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}min`;
  }

  /* pill background for urgent countdown.
     #c2410c (orange-700): branco sobre o #f97316 saturado ficava em ~2,8:1 —
     o aviso mais urgente da tela era o menos legível (AA pede 4,5:1). */
  function urgentBg(ev: EventoDaLista) {
    const hrs = (toUTCDisplayDate(ev.truckDepartureDate).getTime() - now) / 3_600_000;
    return hrs < 24 ? TOM.perigo.text : T.accentText;
  }

  return (
    <div style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 14px 32px" : "28px 28px 48px" }}>
      <style>{`
        /* Realce de hover das marcações clicáveis. Eram pares onMouseEnter/
           Leave escrevendo no style; a cor de cada uma vem na var --realce
           (a dos prazos é a cor do próprio marco). */
        .cal-realce { transition: background-color 0.12s ease; }
        .cal-realce:hover { background-color: var(--realce) !important; }
      `}</style>

      {/* ── Header ──
          As abas Semana/Lista saíram: eram estado morto — trocavam um
          activeView que nada na tela lia, então "Semana" e "Lista" mostravam
          exatamente a mesma grade de mês. Melhor não oferecer visões que não
          existem; se um dia existirem, voltam com conteúdo próprio.
          O testid fica no invólucro: o CabecalhoDaPagina não repassa testid
          ao <h1>, e o texto do título continua dentro dele. */}
      <div data-testid="title-calendario">
        <CabecalhoDaPagina
          titulo="Calendário de Eventos"
          subtitulo={isLoading || isError ? undefined : (
            urgentEvents.length > 0
              ? `${urgentEvents.length} ${urgentEvents.length === 1 ? "saída" : "saídas"} do caminhão nas próximas 48h`
              : "Nenhuma saída do caminhão nas próximas 48h"
          )}
        />
      </div>
      {/* Como ler a tela: de onde os prazos saem e o que o clique faz. Fica
          fora do cabeçalho porque é instrução, não estado. */}
      <p style={{ fontSize: FS.body, color: P.secondary, margin: "-12px 0 24px", fontWeight: FW.corpo }}>
        Início, saída do caminhão e prazos de cada evento — clique numa marcação para abrir o evento.
      </p>

      {/* ── Alert strip (urgent < 48h) ──
          role="alert": leitor de tela anuncia a urgência ao chegar na tela.
          O antigo "Ver Detalhes" abria só o dia do PRIMEIRO urgente; agora
          cada urgente é um botão que leva direto ao seu evento. */}
      {/* <section> com rótulo, e não role="alert": o tick de 1 min reescreve
          as contagens daqui, e uma região de alerta RE-ANUNCIA a cada mudança
          — o leitor de tela interrompia a pessoa a cada minuto com a mesma
          faixa. A seção continua achável pela navegação por regiões.
          `border` ANTES de `borderLeft`: na ordem inversa o shorthand zerava a
          barra de 6px e a faixa mais urgente da tela perdia o acento. */}
      {urgentEvents.length > 0 && (
        <section aria-label="Saídas do caminhão nas próximas 48 horas" data-testid="faixa-urgentes" style={{
          marginBottom: 20,
          backgroundColor: TOM.perigo.bg,
          border: `1px solid ${TOM.perigo.border}`,
          borderLeft: `6px solid ${TOM.perigo.text}`,
          borderRadius: R.lg,
          padding: "14px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle aria-hidden="true" style={{ width: 18, height: 18, color: TOM.perigo.text, flexShrink: 0 }} />
              <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: TOM.perigo.text }}>
                {urgentEvents.length} evento{urgentEvents.length > 1 ? "s" : ""} com saída do caminhão nas próximas 48h
              </span>
            </div>
            {/* Selo de fundo cheio: branco sobre TOM.perigo.text (6,5:1). */}
            <Selo cores={{ bg: TOM.perigo.text, text: T.surface, border: TOM.perigo.text }} tamanho="sm">
              Crítico
            </Selo>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {urgentEvents.map(ev => {
              const remaining = toUTCDisplayDate(ev.truckDepartureDate).getTime() - now;
              // Chip de navegação com desenho próprio (pílula com o relógio
              // embutido): fica <button> nativo, com tokens e .ds-botao.
              return (
                <button key={ev.id}
                  type="button"
                  onClick={() => setLocation(`/eventos/${ev.id}`)}
                  data-testid={`urgent-event-${ev.id}`}
                  aria-label={`Abrir evento ${ev.name} — saída em ${msToHM(remaining)}`}
                  className="ds-botao"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    minHeight: alvo(32, grosso), padding: "4px 6px 4px 12px",
                    backgroundColor: T.surface, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.pill,
                    fontSize: FS.meta, fontWeight: FW.forte, color: TOM.perigo.text, cursor: "pointer",
                  }}>
                  <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name}</span>
                  <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.surface, backgroundColor: urgentBg(ev), borderRadius: R.pill, padding: "2px 8px", whiteSpace: "nowrap" }}>
                    {msToHM(remaining)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Main Calendar Card ── */}
      <div ref={densidade.ref} style={{ backgroundColor: P.surface, borderRadius: R.lg, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)", marginBottom: 28 }}>

        {/* Navigation bar */}
        <div style={{ padding: compacto ? "14px 16px" : "20px 32px", backgroundColor: T.bg, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: compacto ? 20 : FS.h2, fontWeight: FW.forte, color: P.text, letterSpacing: "-0.02em", fontFamily: FONT.display }}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <div style={{ display: "flex", gap: 4 }}>
              {/* O PASSO SEGUE A ESCALA. As setas so sabiam `month ± 1`: com a
                  semana na tela, avancar um mes pula quatro semanas e a pessoa
                  perde o lugar. */}
              <NavBtn onClick={() => andar(-1)} testId="button-prev-month" big={grosso} label={escala === "semana" ? "Semana anterior" : "Mês anterior"}>
                <ChevronLeft aria-hidden="true" style={{ width: 18, height: 18 }} />
              </NavBtn>
              <NavBtn onClick={() => andar(1)} testId="button-next-month" big={grosso} label={escala === "semana" ? "Próxima semana" : "Próximo mês"}>
                <ChevronRight aria-hidden="true" style={{ width: 18, height: 18 }} />
              </NavBtn>
            </div>
          </div>

          {/* flexWrap + busca em linha própria quando a área aperta: em 390px
              a busca (160) + Hoje + Semana|Mês somavam ~390px dentro de 330
              úteis, e o segmented vazava para fora do cartão. */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", width: compacto ? "100%" : undefined }}>
            <div style={{ position: "relative", flex: compacto ? "1 1 100%" : undefined }}>
              <Search aria-hidden="true" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: P.muted }} />
              {/* Esc limpa e o X aparece com texto: sem nenhum dos dois, apagar
                  a busca era segurar Backspace — e a grade filtrada sem saída
                  visível parece um mês vazio. Fonte 16 no celular: abaixo
                  disso o Safari do iPhone dá zoom na página ao focar. */}
              <input placeholder="Filtrar evento..."
                aria-label="Filtrar eventos do calendário"
                ref={searchRef}
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape" && searchTerm) { e.preventDefault(); setSearchTerm(""); } }}
                style={{ paddingLeft: 32, paddingRight: searchTerm ? 34 : 12, height: alvo(H.md, grosso), width: compacto ? "100%" : 200, boxSizing: "border-box", backgroundColor: T.border, border: "none", borderRadius: R.md, fontSize: isMobile ? FS.lead : FS.body, color: P.text }} />
              {/* Nativo: é o × DENTRO do campo, não um botão da barra. T.apoio
                  e não T.second: o fundo do campo é o cinza da borda (n4). */}
              {searchTerm && (
                <button type="button" onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }}
                  aria-label="Limpar filtro de evento" title="Limpar (Esc)" data-testid="button-limpar-busca-calendario"
                  style={{ position: "absolute", right: 2, top: "50%", transform: "translateY(-50%)", width: grosso ? 40 : 30, height: grosso ? 40 : 30, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: R.sm, color: T.apoio, cursor: "pointer" }}>
                  <X aria-hidden="true" style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
            {/* Alvo de toque: 44px com o dedo, como os demais controles de navegação. */}
            <Botao
              tamanho={grosso ? "toque" : "md"}
              onClick={() => setCurrentDate(new Date())}
              data-testid="button-today"
              title={escala === "semana" ? "Voltar para a semana corrente" : "Voltar para o mês corrente"}
              style={{ padding: "0 20px", color: P.text }}
            >
              Hoje
            </Botao>

            {/* SEMANA | MÊS — radiogroup próprio, e não o <Segmentado> do
                design system: aquele tem testid fixo no contêiner
                ("segmentado") e não tem tamanho de toque (44px). */}
            <div
              role="radiogroup"
              aria-label="Escala do calendário"
              data-testid="segmented-escala"
              style={{ display: "flex", backgroundColor: T.border, padding: 2, borderRadius: R.md, flexShrink: 0 }}
            >
              {(["semana", "mes"] as const).map(v => {
                const ativo = escala === v;
                return (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={ativo}
                    tabIndex={ativo ? 0 : -1}
                    onClick={() => setEscala(v)}
                    onKeyDown={e => {
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                      e.preventDefault();
                      setEscala(v === "semana" ? "mes" : "semana");
                    }}
                    className="ds-botao"
                    style={{
                      // 40 + os 2+2 do trilho = 44 de alvo com o dedo.
                      height: grosso ? 40 : 32, padding: "0 14px", borderRadius: R.sm, border: "none",
                      backgroundColor: ativo ? T.surface : "transparent",
                      boxShadow: ativo ? SHADOW.sm : "none",
                      color: ativo ? P.text : T.apoio,
                      font: "inherit", fontSize: FS.body, fontWeight: ativo ? FW.forte : FW.medio,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {v === "semana" ? "Semana" : "Mês"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* O RESULTADO DA BUSCA, DITO. Só no mês: na semana o cabeçalho da
            faixa já conta as marcações. `aria-live` para quem usa leitor de
            tela ouvir o resultado enquanto digita, sem sair do campo. */}
        {escala === "mes" && resultadoDaBusca !== null && !isLoading && !isError && (
          <div
            role="status"
            aria-live="polite"
            data-testid="resultado-busca-calendario"
            style={{
              display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
              padding: compacto ? "8px 16px" : "8px 32px",
              borderTop: `1px solid ${T.border}`,
              backgroundColor: resultadoDaBusca === 0 ? TOM.alerta.bg : T.bg,
              fontSize: FS.body, color: resultadoDaBusca === 0 ? TOM.alerta.text : P.secondary,
            }}
          >
            <span>
              {resultadoDaBusca === 0
                ? <>Nada com “<strong style={{ color: P.text }}>{searchTerm}</strong>” em {MONTH_NAMES[month].toLowerCase()}.</>
                : <>{resultadoDaBusca} {resultadoDaBusca === 1 ? "marcação" : "marcações"} com “<strong style={{ color: P.text }}>{searchTerm}</strong>” em {MONTH_NAMES[month].toLowerCase()}</>}
            </span>
            {/* Link de texto dentro da frase: fica nativo (o Botao traria
                caixa e borda para o meio de uma linha corrida). */}
            {resultadoDaBusca === 0 && (
              <button
                type="button"
                onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }}
                style={{ background: "none", border: "none", padding: grosso ? "10px 0" : 0, font: "inherit", fontSize: FS.body, fontWeight: FW.forte, color: TOM.alerta.text, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}
              >
                Limpar filtro
              </button>
            )}
          </div>
        )}

        {isLoading ? (
          // Skeleton com a silhueta da escala em vigor, no lugar do spinner
          // central: o spinner deixava um vão branco e a grade "pulava" ao
          // chegar. aria-busy + rótulo dizem ao leitor de tela que é carga, não
          // mês vazio. `animate-pulse` já respeita prefers-reduced-motion
          // (regra global do index.css).
          <div aria-busy="true" aria-label="Carregando calendário" data-testid="skeleton-calendario"
            style={escala === "semana"
              ? { display: "flex", flexDirection: "column" }
              : { display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {Array.from({ length: escala === "semana" ? 7 : 35 }).map((_, i) => (
              <div key={i} style={escala === "semana"
                ? { display: "flex", gap: 14, alignItems: "center", padding: "14px", borderBottom: `1px solid ${N.n3}`, minHeight: 56 }
                : { height: compacto ? 62 : 90, padding: 8, borderRight: i % 7 !== 6 ? `1px solid ${T.border}` : undefined, borderBottom: `1px solid ${T.border}` }}>
                <div className="animate-pulse" style={{ width: escala === "semana" ? 48 : 18, height: escala === "semana" ? 28 : 12, borderRadius: R.sm, backgroundColor: P.low }} />
                {(escala === "semana" || i % 3 === 0) && (
                  <div className="animate-pulse" style={{ width: escala === "semana" ? "45%" : "80%", height: 10, borderRadius: R.sm, backgroundColor: T.border, marginTop: escala === "semana" ? 0 : 8 }} />
                )}
              </div>
            ))}
          </div>
        ) : isError ? (
          <div style={{ padding: compacto ? 16 : 24 }}>
            {/* O botão vai no `detalhe`, e não no `aoTentarDeNovo`: aquele
                tem testid fixo, e `button-retry-calendar` está no inventário
                de capacidades desta tela. */}
            <EstadoErro
              titulo="Não foi possível carregar o calendário"
              detalhe={(
                <>
                  Verifique sua conexão e tente novamente.
                  <span style={{ display: "block", marginTop: 12 }}>
                    <Botao
                      variante="secundario"
                      tamanho={grosso ? "toque" : "md"}
                      icone={RotateCw}
                      onClick={() => refetch()}
                      data-testid="button-retry-calendar"
                    >
                      Tentar novamente
                    </Botao>
                  </span>
                </>
              )}
            />
          </div>
        ) : escala === "semana" ? (
          /* ══════════════════════════════════════════════════════════════
             A SEMANA — sete linhas, domingo-primeiro.

             A escala do meio que faltava: a faixa de alerta cobre 48h, a
             grade cobre o mês, e a operação trabalha por semana. E aqui o
             nome do evento cabe POR EXTENSO — na grade de 90px ele trunca em
             ~80px e a pílula é quase decorativa.
          ══════════════════════════════════════════════════════════════ */
          <div>
            {(() => {
              const d1 = diasDaSemana[0], d7 = diasDaSemana[6];
              const total = diasDaSemana.reduce((t, d) => {
                const b = byDay.get(d.toDateString());
                if (!b) return t;
                const casa = (nome: string) => !searchTerm || nome.toLowerCase().includes(searchTerm.toLowerCase());
                return t + b.events.filter(e => casa(e.name)).length
                       + b.deadlines.filter(x => casa(x.event.name)).length;
              }, 0);
              const mesmoMes = d1.getMonth() === d7.getMonth();
              const faixa = mesmoMes
                ? `${d1.getDate()} a ${d7.getDate()} de ${MONTH_NAMES[d1.getMonth()]}`
                : `${d1.getDate()} de ${MONTH_NAMES[d1.getMonth()]} a ${d7.getDate()} de ${MONTH_NAMES[d7.getMonth()]}`;
              return (
                <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, backgroundColor: T.bg, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.rotulo, color: P.text }}>{faixa}</span>
                  {/* Com busca ativa a contagem diz COM O QUÊ contou — "0
                      marcações" sozinho não separa semana vazia de termo
                      que não casou. */}
                  <span role={searchTerm ? "status" : undefined} aria-live={searchTerm ? "polite" : undefined} style={{ fontSize: FS.meta, color: searchTerm && total === 0 ? TOM.alerta.text : P.secondary }}>
                    {searchTerm && total === 0
                      ? <>Nada com “{searchTerm}” nesta semana</>
                      : <>{total} {total === 1 ? "marcação" : "marcações"}{searchTerm ? <> com “{searchTerm}”</> : null}</>}
                  </span>
                </div>
              );
            })()}

            {diasDaSemana.map(date => {
              const hoje = date.toDateString() === new Date().toDateString();
              const casa = (nome: string) => !searchTerm || nome.toLowerCase().includes(searchTerm.toLowerCase());
              const b = byDay.get(date.toDateString());
              const itens = [
                ...(b?.events ?? []).filter(e => casa(e.name)).map(ev => ({ kind: "event" as const, ev })),
                ...(b?.deadlines ?? []).filter(x => casa(x.event.name)).map(d => ({ kind: "deadline" as const, event: d.event, dtype: d.dtype })),
              ]
                // MESMA ORDEM da célula: as três leituras contam a mesma
                // história ou não contam nenhuma.
                .sort((a, c) => pesoDaUrgencia(a, meiaNoiteDe(date), now) - pesoDaUrgencia(c, meiaNoiteDe(date), now));

              return (
                <div
                  key={date.toDateString()}
                  data-testid={`week-day-${date.getDate()}`}
                  style={{ display: "flex", gap: 0, borderBottom: `1px solid ${N.n3}`, backgroundColor: hoje ? TOM.laranja.bg : T.surface }}
                >
                  {/* 56px na área estreita: com 92 sobravam ~50px para o nome depois
                      do tipo e do horário — justo o nome, razão desta visão. */}
                  <div style={{ width: compacto ? 56 : 92, flexShrink: 0, padding: compacto ? "12px 10px" : "12px 14px", borderRight: `1px solid ${N.n3}` }}>
                    <p style={{ margin: 0, fontSize: FS.micro, fontWeight: FW.rotulo, textTransform: "uppercase", letterSpacing: "0.08em", color: hoje ? T.accentText : P.secondary }}>
                      {WEEK_DAYS[date.getDay()]}
                    </p>
                    <p style={{ margin: "2px 0 0", fontFamily: FONT.display, fontSize: 20, fontWeight: FW.rotulo, color: hoje ? T.accentText : P.text, lineHeight: 1 }}>
                      {date.getDate()}
                    </p>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    {itens.length === 0 ? (
                      /* #78716c e nao #a8a29e: a casa proibe o segundo como
                         cor de texto (2,52 sobre branco). */
                      <p style={{ margin: 0, padding: "14px", fontSize: FS.body, color: T.second }}>Nada marcado</p>
                    ) : itens.map((item, i) => {
                      const ev = item.kind === "event" ? item.ev : item.event;
                      const meta = prioMeta(ev);
                      const cor = item.kind === "deadline" ? item.dtype.color : meta.dot;
                      const isStart = item.kind === "event" && item.ev._type === "start";
                      const Icone = item.kind === "deadline" ? Flag : isStart ? Calendar : Truck;
                      const tipo = item.kind === "deadline"
                        ? `prazo · ${item.dtype.label}`
                        : isStart ? "início do evento" : "saída do caminhão";
                      const saida = item.kind === "event" && !isStart ? toUTCDisplayDate(ev.truckDepartureDate) : null;
                      const restante = saida ? saida.getTime() - now : null;
                      const urgente = restante !== null && restante > 0 && restante < 48 * 3_600_000;
                      return (
                        <button
                          key={`${ev.id}-${item.kind}-${i}`}
                          type="button"
                          data-testid={`week-item-${ev.id}`}
                          onClick={() => setLocation(`/eventos/${ev.id}`)}
                          aria-label={`Abrir evento ${ev.name} — ${tipo}`}
                          className="cal-realce"
                          style={{
                            ["--realce" as string]: P.bg,
                            display: "flex", alignItems: "center", gap: 10, width: "100%",
                            minHeight: 44, padding: compacto ? "8px 12px" : "8px 14px", textAlign: "left",
                            // Na área estreita o nome ocupa a primeira linha
                            // inteira e tipo/horário/contagem descem para a segunda.
                            flexWrap: compacto ? "wrap" : "nowrap", rowGap: 2,
                            background: "none", border: "none",
                            borderLeft: item.kind === "deadline" ? `3px dashed ${cor}` : `3px solid ${cor}`,
                            borderTop: i > 0 ? `1px solid ${T.bg}` : "none",
                            font: "inherit", cursor: "pointer",
                          }}
                        >
                          <Icone aria-hidden="true" style={{ width: 14, height: 14, color: cor, flexShrink: 0 }} />
                          {/* O NOME POR EXTENSO — o motivo desta visao existir. */}
                          <span style={{ flex: 1, minWidth: 0, flexBasis: compacto ? "calc(100% - 24px)" : undefined, fontSize: FS.body, fontWeight: FW.medio, color: P.text }}>{ev.name}</span>
                          <span style={{ fontSize: FS.meta, color: P.secondary, whiteSpace: "nowrap", flexShrink: 0, marginLeft: compacto ? 24 : 0 }}>{tipo}</span>
                          {saida && (
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: P.secondary, whiteSpace: "nowrap", flexShrink: 0 }}>
                              {String(saida.getHours()).padStart(2, "0")}:{String(saida.getMinutes()).padStart(2, "0")}
                            </span>
                          )}
                          {urgente && (
                            <span style={{ fontSize: FS.small, fontWeight: FW.rotulo, color: TOM.perigo.text, whiteSpace: "nowrap", flexShrink: 0 }}>
                              {msToHM(restante!)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>

            {/* Day headers */}
            {WEEK_DAYS.map(d => (
              <div key={d} style={{
                padding: "12px 0", textAlign: "center", minWidth: 0,
                backgroundColor: T.bg,
                borderBottom: `1px solid ${T.border}`,
                borderRight: d !== "SÁB" ? `1px solid ${T.border}` : undefined,
                fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second,
                textTransform: "uppercase", letterSpacing: "0.18em",
              }}>
                {d}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day, idx) => {
              const col = idx % 7;
              const isOutside = day === null;
              const cellHeight = compacto ? 62 : 90;

              /* ── Previous month days to fill the gap ── */
              if (isOutside) {
                /* compute which day-of-month it represents (before or after) */
                const outsideDay = idx < startDow
                  ? new Date(year, month, 0).getDate() - (startDow - idx - 1)
                  : idx - daysInMonth - startDow + 1;
                return (
                  <div key={`out-${idx}`} style={{
                    height: cellHeight, backgroundColor: "rgba(250,250,249,0.6)", padding: "8px 8px",
                    minWidth: 0,
                    borderRight: col !== 6 ? `1px solid ${T.border}` : undefined,
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: T.bdark }}>{String(outsideDay).padStart(2,"0")}</span>
                  </div>
                );
              }

              const date         = new Date(year, month, day);
              const dayEvs       = getEventsForDate(date).filter(ev =>
                !searchTerm || ev.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
              const dayDeadlines = getDeadlinesForDate(date).filter(d =>
                !searchTerm || d.event.name.toLowerCase().includes(searchTerm.toLowerCase())
              );
              const allCellItems: Array<
                | { kind: "event"; ev: (typeof dayEvs)[number] }
                | { kind: "deadline"; event: EventoDaLista; dtype: typeof DEADLINE_TYPES[number] }
              > = [
                ...dayEvs.map(ev => ({ kind: "event" as const, ev })),
                ...dayDeadlines.map(d => ({ kind: "deadline" as const, event: d.event, dtype: d.dtype })),
              ]
                // POR URGENCIA, antes do corte em 2. Sem isto o que fica
                // escondido no "+N mais" e arbitrario — e um prazo que vence
                // HOJE desaparece atras de dois inicios de evento, que sao a
                // marcacao que menos pede acao de alguem.
                .sort((a, c) => pesoDaUrgencia(a, meiaNoiteDe(date), now) - pesoDaUrgencia(c, meiaNoiteDe(date), now));
              const isToday = date.toDateString() === new Date().toDateString();
              const hasAny  = allCellItems.length > 0;

              return (
                /* Abrir o dia era só no clique: por teclado o calendário não
                   abria nada. Só os dias com algo marcado viram controle — os
                   vazios não fazem nada e não devem entrar na tabulação. */
                <div
                  key={day}
                  data-testid={`calendar-day-${day}`}
                  {...(hasAny ? {
                    role: "button" as const,
                    tabIndex: 0,
                    // Com a contagem: "ver eventos" em toda célula não dizia ao
                    // leitor de tela ONDE vale a pena parar — quem enxerga vê as
                    // pílulas e o "+N mais"; quem ouve só tinha o número do dia.
                    "aria-label": `Dia ${day} — ${allCellItems.length} ${allCellItems.length === 1 ? "marcação" : "marcações"}, ver detalhes`,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      // Enter/Espaço numa pill INTERNA borbulha até aqui: sem o
                      // guard, ativar a pill abria também o dialog do dia por
                      // cima da navegação que a pill disparou.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); setSelectedDate(date); setDialogOpen(true);
                      }
                    },
                  } : {})}
                  onClick={() => { if (hasAny) { setSelectedDate(date); setDialogOpen(true); } }}
                  className={hasAny ? "cal-realce" : undefined}
                  style={{
                    ["--realce" as string]: T.bg,
                    height: cellHeight, padding: compacto ? "5px 5px" : "7px 7px",
                    // Ver o comentario da trilha: item de grid tambem tem
                    // min-width automatico, e sem zera-lo a pill de nome longo
                    // volta a esticar a coluna.
                    minWidth: 0,
                    borderRight: col !== 6 ? `1px solid ${T.border}` : undefined,
                    borderBottom: `1px solid ${T.border}`,
                    backgroundColor: P.surface,
                    cursor: hasAny ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 3,
                    outline: isToday ? "2px solid rgba(249,115,22,0.2)" : undefined,
                    outlineOffset: "-2px",
                    position: "relative",
                  }}
                >
                  {/* Day number — #c2410c: branco sobre o #f97316 saturado
                      ficava em ~2,8:1, abaixo do AA. */}
                  <div style={{ marginBottom: 2 }}>
                    {isToday ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%",
                        backgroundColor: T.accentText, color: T.surface,
                        fontSize: FS.small, fontWeight: FW.rotulo,
                      }}>{day}</span>
                    ) : (
                      <span style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: P.text }}>{String(day).padStart(2,"0")}</span>
                    )}
                  </div>

                  {/* Na área estreita a célula de 62px não comporta pill
                      legível: cada item vira uma barra na cor da
                      prioridade/prazo e o detalhe fica no dialog do dia. */}
                  {compacto ? (
                    hasAny ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        {allCellItems.slice(0, 3).map((item, i) => (
                          <div
                            key={item.kind === "event" ? `ev-${item.ev.id}-${item.ev._type}` : `dl-${item.event.id}-${item.dtype.key}-${i}`}
                            style={{
                              height: 4, borderRadius: 2,
                              backgroundColor: item.kind === "event" ? prioMeta(item.ev).dot : item.dtype.color,
                            }}
                          />
                        ))}
                        {allCellItems.length > 3 && (
                          <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: P.secondary }}>+{allCellItems.length - 3}</span>
                        )}
                      </div>
                    ) : null
                  ) : (
                    <>
                      {allCellItems.slice(0, 2).map((item, i) => {
                        if (item.kind === "event") {
                          const ev        = item.ev;
                          const isStart   = ev._type === "start";
                          const meta      = prioMeta(ev);
                          const depTime   = toUTCDisplayDate(ev.truckDepartureDate);
                          const remaining = depTime.getTime() - now;
                          const isUrgent  = !isStart && remaining > 0 && remaining < 48 * 3_600_000;
                          const isCrit    = !isStart && remaining > 0 && remaining < 24 * 3_600_000;
                          return (
                            /* <button>: a pill navega para o evento, mas era um
                               div sem foco — invisível para o teclado. */
                            <button
                              key={`ev-${ev.id}-${ev._type}`}
                              type="button"
                              data-testid={`event-${ev.id}-${ev._type}`}
                              onClick={e => { e.stopPropagation(); setLocation(`/eventos/${ev.id}`); }}
                              title={ev.name}
                              aria-label={`Abrir evento ${ev.name}`}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                gap: 4, padding: "2px 6px", width: "100%", textAlign: "left",
                                backgroundColor: isCrit ? TOM.perigo.bg : T.surface,
                                border: "none",
                                borderLeft: `3px solid ${meta.dot}`,
                                borderRadius: R.sm,
                                boxShadow: SHADOW.sm,
                                overflow: "hidden", cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", flex: 1 }}>
                                {isStart
                                  ? <Calendar aria-hidden="true" style={{ width: 9, height: 9, color: P.muted, flexShrink: 0 }} />
                                  : <Truck    aria-hidden="true" style={{ width: 9, height: 9, color: P.muted, flexShrink: 0 }} />}
                                <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ev.name}
                                </span>
                              </span>
                              {isUrgent && (
                                <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.surface, backgroundColor: isCrit ? TOM.perigo.text : T.accentText, borderRadius: R.sm, padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0 }}>
                                  {msToHM(remaining)}
                                </span>
                              )}
                            </button>
                          );
                        } else {
                          const { event, dtype } = item;
                          return (
                            <button
                              key={`dl-${event.id}-${dtype.key}-${i}`}
                              type="button"
                              onClick={e => { e.stopPropagation(); setLocation(`/eventos/${event.id}`); }}
                              title={`${event.name} — ${dtype.label}`}
                              aria-label={`Abrir evento ${event.name} — prazo de ${dtype.label}`}
                              style={{
                                display: "flex", alignItems: "center", gap: 4, padding: "2px 6px",
                                width: "100%", textAlign: "left",
                                backgroundColor: `${dtype.color}12`,
                                border: "none",
                                borderLeft: `3px dashed ${dtype.color}`,
                                borderRadius: R.sm,
                                overflow: "hidden", cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              <Flag aria-hidden="true" style={{ width: 9, height: 9, color: dtype.color, flexShrink: 0 }} />
                              <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: dtype.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {dtype.short}
                              </span>
                            </button>
                          );
                        }
                      })}
                      {allCellItems.length > 2 && (
                        <span style={{ fontSize: FS.micro, color: P.secondary, paddingLeft: 2 }}>+{allCellItems.length - 2} mais</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Legend footer ── */}
        <div style={{ padding: compacto ? "12px 16px" : "14px 32px", borderTop: `1px solid ${T.border}`, backgroundColor: T.bg, display: "flex", flexWrap: "wrap", alignItems: "center", gap: compacto ? "8px 14px" : 16 }}>
          {/* Priority legend.
              A LEGENDA DIZ DE QUE É A COR. Seis bolinhas soltas ao lado de
              marcações tracejadas não diziam se a cor era prioridade, setor ou
              atraso — e "Urgente" em vermelho lia como "prazo estourando". Um
              rótulo curto por grupo fecha a dúvida sem virar manual. */}
          <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: P.text }}>Cor do evento:</span>
          {LEGEND_PRIOS.map(({ label, dot }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: dot }} />
              <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: P.secondary }}>{label}</span>
            </div>
          ))}

          {/* Divider */}
          <div style={{ width: 1, height: 16, backgroundColor: T.border, margin: "0 4px" }} />

          {/* Deadline legend — só os marcos que a grade está DESENHANDO. Uma
              legenda com seis entradas sobre uma grade com dois seria mentira. */}
          <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: P.text }}>Prazos:</span>
          {tiposVisiveis.map(dt => (
            /* O nome curto ("Lista Img", "Aprov. Layout") é código para quem
               chega; o `title` diz o que a etapa é e quando vence, com a mesma
               frase e o mesmo prazo padrão do cadastro do evento. */
            <div key={dt.key} title={DICA_DO_MARCO[dt.key]} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "help" }}>
              <div style={{ width: 14, height: 9, borderRadius: R.sm, borderLeft: `3px dashed ${dt.color}`, backgroundColor: `${dt.color}15` }} />
              <span style={{ fontSize: FS.small, fontWeight: FW.medio, color: P.secondary }}>{dt.short}</span>
            </div>
          ))}
          {marcosDoPapel && (
            <button
              type="button"
              onClick={() => setVerTodosOsMarcos(v => !v)}
              aria-pressed={verTodosOsMarcos}
              data-testid="button-marcos-da-funcao"
              title={verTodosOsMarcos
                ? "Voltar a ver só os marcos da sua função"
                : "A grade está mostrando só os marcos da sua função — clique para ver os seis"}
              className="ds-botao"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: alvo(28, grosso), padding: "0 12px", borderRadius: R.pill, border: `1px dashed ${verTodosOsMarcos ? T.accentText : T.bdark}`, background: verTodosOsMarcos ? TOM.laranja.bg : "transparent", color: verTodosOsMarcos ? T.accentText : P.secondary, font: "inherit", fontSize: FS.meta, fontWeight: FW.medio, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {verTodosOsMarcos ? "Só os da minha função" : `Todos os marcos (${DEADLINE_TYPES.length})`}
            </button>
          )}

          <div style={{ marginLeft: compacto ? 0 : "auto", display: "flex", alignItems: "center", gap: compacto ? 14 : 18, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar aria-hidden="true" style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: FS.small, color: P.secondary }}>Início</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Truck aria-hidden="true" style={{ width: 12, height: 12, color: P.muted }} />
              {/* Vocabulário da tela inteira ("saída do caminhão"), e a bandeira
                  é de TODO prazo — "Prazo de Layout" ensinava errado a ler as
                  outras cinco marcações tracejadas. */}
              <span style={{ fontSize: FS.small, color: P.secondary }}>Saída do caminhão</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Flag aria-hidden="true" style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: FS.small, color: P.secondary }}>Prazo</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Secondary grid: Próximos Eventos + Resumo do Mês ── */}
      <div style={{ display: "grid", gridTemplateColumns: compacto ? "1fr" : "1fr minmax(220px, 300px)", gap: 20, alignItems: "start" }}>

        {/* Próximos Eventos */}
        <div style={{ backgroundColor: N.n3, borderRadius: R.lg, padding: compacto ? 16 : 24, position: "relative", overflow: "hidden" }}>
          {/* watermark icon */}
          <div style={{ position: "absolute", right: -20, bottom: -20, opacity: 0.05, pointerEvents: "none" }}>
            <Truck aria-hidden="true" style={{ width: 160, height: 160, color: T.text }} />
          </div>
          <div style={{ position: "relative" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: FS.title, fontWeight: FW.forte, color: P.text, letterSpacing: "-0.02em", fontFamily: FONT.display }}>
              Próximos eventos
            </h3>
            {upcomingEvents.length === 0 ? (
              <p style={{ fontSize: FS.body, color: T.apoio /* sobre o N.n3 deste bloco o T.second fica em 4,38:1 */ }}>Nenhum evento futuro no momento.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {upcomingEvents.map(ev => {
                  const dep = toUTCDisplayDate(ev.truckDepartureDate);
                  const meta = prioMeta(ev);
                  return (
                    <div key={ev.id}
                      data-testid={`upcoming-event-${ev.id}`}
                      role="link" tabIndex={0} aria-label={`Abrir evento ${ev.name}`} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setLocation(`/eventos/${ev.id}`); } }} onClick={() => setLocation(`/eventos/${ev.id}`)}
                      className="cal-realce"
                      style={{ ["--realce" as string]: P.bg, backgroundColor: T.surface, borderRadius: R.md, padding: "12px 14px", minHeight: 44, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderLeft: `4px solid ${meta.dot}`, cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Até duas linhas, e não reticência: o nome inteiro só
                            existia no aria-label — quem vê lia "Maratona Int…". */}
                        <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: P.text, lineHeight: 1.35, overflow: "hidden", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ev.name}</p>
                        <p style={{ margin: "3px 0 0", fontSize: FS.small, color: P.secondary }}>
                          Saída: {dep.toLocaleDateString("pt-BR")} às {dep.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <Selo cores={{ bg: meta.bg, text: meta.text, border: meta.border }} style={{ flexShrink: 0 }}>
                        {meta.label}
                      </Selo>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Resumo do Mês */}
        <div style={{ backgroundColor: T.text, borderRadius: R.lg, padding: compacto ? 16 : 24, color: T.surface }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: FS.strong, fontWeight: FW.forte, color: T.surface, letterSpacing: "-0.01em", fontFamily: FONT.display }}>
                Resumo do mês
              </h3>
              {/* A REGRA, ESCRITA. O filtro era pela data de INICIO e a grade
                  desenha pela SAIDA DO CAMINHAO: um evento que comeca em 12/09
                  com caminhao em 09/09 tem tres prazos em agosto — aparecia na
                  grade de agosto e nao entrava no Resumo de agosto. Agora os
                  dois contam o mesmo conjunto, e a linha diz qual e. */}
              <p style={{ margin: "2px 0 0", fontSize: FS.small, color: "rgba(255,255,255,0.5)" }}>
                Eventos que aparecem na grade
              </p>
            </div>
            <BarChart2 aria-hidden="true" style={{ width: 18, height: 18, color: P.accent }} />
          </div>
          {/* "Prioridade urgente", e não "Urgentes": o número conta a
              PRIORIDADE cadastrada no evento, não prazo vencendo — a faixa
              vermelha do topo é que fala de urgência de tempo, e os dois
              rótulos iguais sugeriam que contavam a mesma coisa.
              Cores dos números em tons claros (orange-300, red-400): o
              #f97316 é proibido como texto, e o #dc2626 sobre este fundo
              escuro dava ~3,6:1, abaixo do AA para 15px. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Total de eventos", value: monthEvents.length, color: TOM.laranja.border },
              { label: "Concluídos",       value: completedCount,     color: TOM.sucesso.dot },
              { label: "Encerrados",       value: closedCount,        color: T.bdark },
              { label: "Prioridade urgente", value: urgentCount,      color: TOM.perigo.border },
              { label: "Em andamento",     value: ongoingCount,       color: T.surface },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <span style={{ fontSize: FS.body, color: "rgba(255,255,255,0.55)" }}>{label}</span>
                <span style={{ fontSize: FS.strong, fontWeight: FW.rotulo, color }}>{value}</span>
              </div>
            ))}
          </div>
          {/* Botao sobre a superfície escura: o Botao não tem variante para
              fundo escuro, então o véu branco translúcido vem por `style` e o
              clareamento do hover pela --realce da .cal-realce. */}
          <Botao
            tamanho="toque"
            larguraCheia
            onClick={() => setCurrentDate(new Date())}
            className="cal-realce"
            style={{ ["--realce" as string]: "rgba(255,255,255,0.12)", marginTop: 20, backgroundColor: "rgba(255,255,255,0.07)", border: "1px solid transparent", color: T.surface, fontSize: FS.body }}
          >
            Ver mês atual
          </Botao>
        </div>
      </div>

      {/* ── Day detail dialog ── */}
      {/* Casca da casa (modal-shell): o DialogContent cru tinha teto de 80vh
          com rolagem no Content inteiro — o título rolava junto e sumia, e o
          raio/sombra/X eram os do ui/dialog, diferentes de todos os outros
          modais. Aqui o cabeçalho fica fixo e só a lista rola.
          Foco e fechamento continuam do Radix: Esc, clique fora e o X do
          ModalHeader chamam o mesmo setDialogOpen(false), e o foco volta
          para a célula que abriu o dia. Variante `confirm` (clara): é uma
          lista curta de consulta, não um modal de trabalho denso. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(480)} data-testid="dialog-dia-calendario">
          <DialogTitle className="sr-only">
            {selectedDate?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Eventos e prazos marcados neste dia. Escolha um para abrir o evento.
          </DialogDescription>
          <ModalHeader
            variant="confirm"
            icon={Calendar}
            tint={T.accentText}
            title={selectedDate
              ? (() => {
                  const t = selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
                  return t.charAt(0).toUpperCase() + t.slice(1);
                })()
              : ""}
            subtitle={selectedDate
              ? (() => {
                  const n = getEventsForDate(selectedDate).filter(ev => !searchTerm || ev.name.toLowerCase().includes(searchTerm.toLowerCase())).length
                    + getDeadlinesForDate(selectedDate).filter(d => !searchTerm || d.event.name.toLowerCase().includes(searchTerm.toLowerCase())).length;
                  return `${n} ${n === 1 ? "marcação" : "marcações"}${searchTerm ? ` com “${searchTerm}”` : ""} · ${selectedDate.getFullYear()}`;
                })()
              : undefined}
            onClose={() => setDialogOpen(false)}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: isMobile ? "14px 16px 20px" : "16px 24px 24px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            {/* Mesmo filtro de busca da grade: a célula anunciava "2 itens"
                (filtrados) e o dialog abria com todos — números que não batiam. */}
            {/* MESMA REGUA DA CELULA, dentro da secao. O dialog separa eventos
                de prazos em blocos proprios — essa divisao e do dialog e fica —,
                entao a ordem de urgencia se aplica DENTRO de cada bloco: saida
                em menos de 48h antes de saida normal, antes de inicio de
                evento. As tres leituras contam a mesma historia ou nao contam
                nenhuma. */}
            {selectedDate && getEventsForDate(selectedDate)
              .filter(ev => !searchTerm || ev.name.toLowerCase().includes(searchTerm.toLowerCase()))
              .slice()
              .sort((a, b) => pesoDaUrgencia({ kind: "event", ev: a }, meiaNoiteDe(selectedDate), now)
                            - pesoDaUrgencia({ kind: "event", ev: b }, meiaNoiteDe(selectedDate), now))
              .map(ev => {
              const meta = prioMeta(ev);
              const isStart = ev._type === "start";
              // toUTCDisplayDate: MESMA conversão usada no agrupamento da
              // grade — grade e dialog exibem a saída no mesmo dia/horário.
              const dateTime = isStart ? parseDateLocal(ev.startDate) : toUTCDisplayDate(ev.truckDepartureDate);

              return (
                <div key={`${ev.id}-${ev._type}`}
                  data-testid={`dialog-event-${ev.id}-${ev._type}`}
                  role="link" tabIndex={0} aria-label={`Abrir evento ${ev.name}`} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setDialogOpen(false); setLocation(`/eventos/${ev.id}`); } }} onClick={() => { setDialogOpen(false); setLocation(`/eventos/${ev.id}`); }}
                  className="cal-realce"
                  style={{ ["--realce" as string]: P.bg, display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", backgroundColor: P.surface, border: `1px solid ${P.border}`, borderLeft: `4px solid ${meta.dot}`, borderRadius: R.md, cursor: "pointer" }}
                >
                  <div style={{ width: 32, height: 32, borderRadius: R.md, flexShrink: 0, backgroundColor: P.bg, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isStart ? <Calendar aria-hidden="true" style={{ width: 14, height: 14, color: P.secondary }} /> : <Truck aria-hidden="true" style={{ width: 14, height: 14, color: P.secondary }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <p style={{ fontSize: FS.strong, fontWeight: FW.medio, color: P.text, margin: 0 }}>{ev.name}</p>
                      <Selo forma="retangulo" cores={{ bg: meta.bg, text: meta.text, border: meta.border }} style={{ flexShrink: 0 }}>
                        {meta.label}
                      </Selo>
                    </div>
                    <p style={{ fontSize: FS.body, color: P.secondary, margin: "4px 0 0" }}>
                      {isStart ? "Início: " : "Saída do caminhão: "}
                      <strong style={{ color: P.text }}>
                        {dateTime.toLocaleDateString("pt-BR")}
                        {!isStart && ` às ${dateTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                      </strong>
                    </p>
                  </div>
                </div>
              );
            })}

            {/* ── Deadline entries in dialog ── */}
            {selectedDate && (() => {
              // Busca aplicada também aqui — mesma regra dos prazos na grade.
              const deadlines = getDeadlinesForDate(selectedDate)
                .filter(d => !searchTerm || d.event.name.toLowerCase().includes(searchTerm.toLowerCase()));
              if (!deadlines.length) return null;
              return (
                <>
                  <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 6, paddingBottom: 2 }}>
                    {/* "Prazos", não "Prazos de Layout": a seção lista os seis
                        marcos (lista, revisão, produção...), e a legenda da
                        grade já tinha abandonado esse rótulo pelo mesmo motivo.
                        O selo abaixo usa o tom 700 do marco sobre o tom claro:
                        branco sobre âmbar/verde/laranja saturado reprovava AA. */}
                    <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: P.secondary }}>
                      Prazos
                    </span>
                  </div>
                  {deadlines.map(({ event, dtype }) => (
                    <div key={`${event.id}-${dtype.key}`}
                      data-testid={`dialog-deadline-${event.id}-${dtype.key}`}
                      role="link"
                      tabIndex={0}
                      aria-label={`Abrir evento ${event.name}`}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setDialogOpen(false); setLocation(`/eventos/${event.id}`); } }}
                      onClick={() => { setDialogOpen(false); setLocation(`/eventos/${event.id}`); }}
                      className="cal-realce"
                      style={{ ["--realce" as string]: `${dtype.color}14`, display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", backgroundColor: `${dtype.color}08`, border: `1px solid ${P.border}`, borderLeft: `4px solid ${dtype.color}`, borderRadius: R.md, cursor: "pointer" }}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: R.md, flexShrink: 0, backgroundColor: `${dtype.color}15`, border: `1px solid ${dtype.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Flag aria-hidden="true" style={{ width: 14, height: 14, color: dtype.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <p style={{ fontSize: FS.strong, fontWeight: FW.medio, color: P.text, margin: 0 }}>{event.name}</p>
                          <Selo forma="retangulo" cores={{ bg: `${dtype.color}1f`, text: dtype.text, border: "transparent" }} style={{ flexShrink: 0 }}>
                            {dtype.short}
                          </Selo>
                        </div>
                        <p style={{ fontSize: FS.body, color: P.secondary, margin: "4px 0 0" }}>
                          Prazo: <strong style={{ color: P.text }}>{dtype.label}</strong>
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Nav arrow button ── */
function NavBtn({ onClick, children, testId, big, label }: {
  onClick: () => void; children: React.ReactNode; testId: string; big?: boolean; label: string;
}) {
  // Botao fantasma redondo: o realce de hover/foco vem da classe, não de um
  // estado de hover na mão (que não cobria o teclado).
  const size = big ? 44 : 34;
  return (
    <Botao variante="fantasma" onClick={onClick} data-testid={testId} aria-label={label}
      style={{ width: size, height: size, minHeight: size, padding: 0, borderRadius: R.pill, color: T.text }}>
      {children}
    </Botao>
  );
}
