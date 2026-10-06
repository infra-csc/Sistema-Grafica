import { useQuery } from "@tanstack/react-query";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { getPriorityMeta, getStatusMeta, isEventoEncerrado } from "@/lib/status";
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar, Truck, Search, Flag, X, RotateCw, Check, CalendarX } from "lucide-react";
import { useState, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EstadoVazio } from "@/components/ui/estados";
import { LegendaDoCalendario } from "@/components/calendario/legenda-do-calendario";
import { EsqueletoDaGrade, EsqueletoDeLinhas } from "@/components/calendario/esqueletos";
import {
  NOMES_DOS_MESES, DIAS_DA_SEMANA, horasEMinutos, horasCurtas, horaMinuto, diaCurto, mesCurto,
  faixaDaSemana, diaPorExtenso, plural,
} from "@/components/calendario/formatos";
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
import { T, FS, R, N, H, FW, FONT, TOM, TOM_FORTE, SHADOW } from "@/lib/theme";
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

/* A legenda das cores (prioridade) mora em components/calendario/legenda —
   derivada da mesma fonte única (lib/status). */

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

/* Domingo-primeiro, como a grade. Nomes em components/calendario/formatos. */
const WEEK_DAYS = DIAS_DA_SEMANA;
const MONTH_NAMES = NOMES_DOS_MESES;

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


  const msToHM = horasEMinutos;

  /* pill background for urgent countdown.
     #c2410c (orange-700): branco sobre o #f97316 saturado ficava em ~2,8:1 —
     o aviso mais urgente da tela era o menos legível (AA pede 4,5:1). */
  function urgentBg(ev: EventoDaLista) {
    const hrs = (toUTCDisplayDate(ev.truckDepartureDate).getTime() - now) / 3_600_000;
    return hrs < 24 ? TOM.perigo.text : T.accentText;
  }

  // ── O QUE A TELA DIZ SOBRE O PERÍODO (só apresentação) ──────────────────
  // Sem busca, a barra de cima também conta: "18 marcações em outubro" ou
  // "Nada marcado em dezembro" — um mês vazio não pode parecer uma grade que
  // não carregou. Conta exatamente o que a grade desenha (mesmo `byDay`).
  const marcacoesNoMes = useMemo(() => {
    let n = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const b = byDay.get(new Date(year, month, d).toDateString());
      if (b) n += b.events.length + b.deadlines.length;
    }
    return n;
  }, [byDay, year, month, daysInMonth]);

  const casaBusca = (nome: string) => !searchTerm || nome.toLowerCase().includes(searchTerm.toLowerCase());
  const totalDaSemana = diasDaSemana.reduce((t, d) => {
    const b = byDay.get(d.toDateString());
    if (!b) return t;
    return t + b.events.filter(e => casaBusca(e.name)).length + b.deadlines.filter(x => casaBusca(x.event.name)).length;
  }, 0);

  const hojeStr = new Date(now).toDateString();
  const nomeDoMes = MONTH_NAMES[month].toLowerCase();
  // O Resumo fala de um MÊS: o "Ver mês atual" dele só aparece quando o mês
  // resumido não é o corrente (andar por semanas dentro do mês não conta).
  const noMesAtual = year === new Date(now).getFullYear() && month === new Date(now).getMonth();
  const carregado = !isLoading && !isError;

  /* O dia aberto no dialog: as duas seções, já filtradas e ordenadas. */
  const eventosDoDia = selectedDate
    ? getEventsForDate(selectedDate)
        .filter(ev => !searchTerm || ev.name.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice()
        .sort((a, b) => pesoDaUrgencia({ kind: "event", ev: a }, meiaNoiteDe(selectedDate), now)
                      - pesoDaUrgencia({ kind: "event", ev: b }, meiaNoiteDe(selectedDate), now))
    : [];
  const prazosDoDia = selectedDate
    ? getDeadlinesForDate(selectedDate).filter(d => !searchTerm || d.event.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];
  const diaAbertoEhHoje = !!selectedDate && selectedDate.toDateString() === hojeStr;

  const abrirEvento = (id: string | number) => setLocation(`/eventos/${id}`);
  const abrirDoDialog = (id: string | number) => { setDialogOpen(false); abrirEvento(id); };

  return (
    <div className="cal-pagina" style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: isMobile ? "12px 12px 32px" : "32px 32px 48px" }}>

      {/* ── Cabeçalho ──
          As abas Semana/Lista antigas eram estado morto (trocavam um
          activeView que nada lia); a Semana voltou com conteúdo próprio, no
          segmentado do cartão. O testid fica no invólucro: o
          CabecalhoDaPagina não repassa testid ao <h1>.
          O subtítulo diz o que a tela mostra e o que o clique faz; o estado
          "nada nas próximas 48h" vira um selo calmo ao lado — quando HÁ saída
          perto, quem fala é a faixa vermelha logo abaixo, e as duas não
          repetem a mesma frase. */}
      <div data-testid="title-calendario">
        <CabecalhoDaPagina
          titulo="Calendário de Eventos"
          subtitulo="Início, saída do caminhão e prazos de cada evento — clique numa marcação para abrir o evento."
          frescor={carregado && urgentEvents.length === 0 ? (
            <Selo tom="sucesso" ponto data-testid="selo-sem-saidas">Nenhuma saída do caminhão nas próximas 48h</Selo>
          ) : undefined}
          margemInferior={isMobile ? 14 : 20}
        />
      </div>

      {/* ── Faixa de urgência (saída em < 48h) ──
          <section> com rótulo, e não role="alert": o tick de 1 min reescreve
          as contagens daqui, e uma região de alerta RE-ANUNCIA a cada mudança.
          Cada urgente é um botão que leva direto ao seu evento, com o dia e a
          hora da saída — a contagem sozinha obrigava a fazer conta de cabeça. */}
      {urgentEvents.length > 0 && (
        <section aria-label="Saídas do caminhão nas próximas 48 horas" data-testid="faixa-urgentes" style={{
          marginBottom: compacto ? 14 : 20,
          backgroundColor: TOM.perigo.bg,
          border: `1px solid ${TOM.perigo.border}`,
          borderRadius: R.lg,
          padding: compacto ? "12px 12px 12px 14px" : "14px 16px 14px 18px",
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: compacto ? 10 : "10px 18px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: compacto ? "1 1 100%" : "0 0 auto" }}>
            <span aria-hidden="true" style={{ width: 30, height: 30, borderRadius: R.md, backgroundColor: TOM_FORTE.perigo.bg, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <AlertTriangle style={{ width: 16, height: 16, color: TOM.perigo.text }} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.3 }}>
              <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: TOM_FORTE.perigo.text }}>
                {urgentEvents.length === 1 ? "1 saída do caminhão" : `${urgentEvents.length} saídas do caminhão`} nas próximas 48h
              </span>
              <span style={{ fontSize: FS.meta, color: TOM.perigo.text }}>{grosso ? "Toque" : "Clique"} num evento para abrir</span>
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, flex: "1 1 0", minWidth: compacto ? "100%" : 0 }}>
            {urgentEvents.map(ev => {
              const saida = toUTCDisplayDate(ev.truckDepartureDate);
              const remaining = saida.getTime() - now;
              // Chip de navegação com desenho próprio (pílula com o relógio
              // embutido): <button> nativo, com tokens e .ds-botao.
              return (
                <button key={ev.id}
                  type="button"
                  onClick={() => abrirEvento(ev.id)}
                  data-testid={`urgent-event-${ev.id}`}
                  aria-label={`Abrir evento ${ev.name} — saída ${diaCurto(saida)} às ${horaMinuto(saida)}, em ${msToHM(remaining)}`}
                  title={ev.name}
                  className="ds-botao"
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 10,
                    minHeight: alvo(36, grosso), padding: "4px 5px 4px 12px", maxWidth: "100%",
                    flex: compacto ? "1 1 100%" : "0 1 auto",
                    backgroundColor: T.surface, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.pill,
                    boxShadow: SHADOW.sm, cursor: "pointer", font: "inherit", textAlign: "left",
                  }}>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                    <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: compacto ? undefined : 260 }}>{ev.name}</span>
                    <span style={{ fontSize: FS.small, color: T.apoio, whiteSpace: "nowrap" }}>{diaCurto(saida)} · {horaMinuto(saida)}</span>
                  </span>
                  <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: urgentBg(ev), borderRadius: R.pill, padding: "4px 9px", whiteSpace: "nowrap", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                    {msToHM(remaining)}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="cal-layout" style={isError ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
      {/* ── O cartão do calendário ── */}
      <div ref={densidade.ref} style={{ backgroundColor: P.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden", boxShadow: SHADOW.sm, minWidth: 0 }}>

        {/* ── Barra de navegação ──
            Ordem da leitura: ONDE estou (período), COMO ando (Hoje ‹ ›), O QUE
            recorto (busca, escala). No celular: período + setas na primeira
            linha, busca na segunda, Hoje + Semana|Mês na terceira. */}
        <div style={{ padding: compacto ? "12px 14px" : "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: compacto ? 10 : 12, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: compacto ? 8 : 12, minWidth: 0, flex: compacto ? "1 1 100%" : "0 1 auto" }}>
            {!compacto && (
              /* Alvo de toque: 44px com o dedo, como os demais controles. */
              <Botao
                tamanho={grosso ? "toque" : "md"}
                onClick={() => setCurrentDate(new Date())}
                data-testid="button-today"
                title={escala === "semana" ? "Voltar para a semana corrente" : "Voltar para o mês corrente"}
                style={{ padding: "0 14px", color: P.text }}
              >
                Hoje
              </Botao>
            )}
            {compacto && tituloDoPeriodo()}
            {/* O PASSO SEGUE A ESCALA: com a semana na tela, avançar um mês
                pularia quatro semanas e a pessoa perderia o lugar. */}
            <div style={{ display: "inline-flex", flexShrink: 0, border: `1px solid ${T.border}`, borderRadius: R.md, backgroundColor: T.surface, overflow: "hidden" }}>
              <NavBtn onClick={() => andar(-1)} testId="button-prev-month" big={grosso} label={escala === "semana" ? "Semana anterior" : "Mês anterior"}>
                <ChevronLeft aria-hidden="true" style={{ width: 18, height: 18 }} />
              </NavBtn>
              <span aria-hidden="true" style={{ width: 1, backgroundColor: T.border }} />
              <NavBtn onClick={() => andar(1)} testId="button-next-month" big={grosso} label={escala === "semana" ? "Próxima semana" : "Próximo mês"}>
                <ChevronRight aria-hidden="true" style={{ width: 18, height: 18 }} />
              </NavBtn>
            </div>
            {!compacto && tituloDoPeriodo()}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: compacto ? 8 : 10, flexWrap: "wrap", width: compacto ? "100%" : undefined }}>
            <div style={{ position: "relative", flex: compacto ? "1 1 100%" : undefined }}>
              <Search aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: P.muted, pointerEvents: "none" }} />
              {/* Esc limpa e o X aparece com texto: sem nenhum dos dois, apagar
                  a busca era segurar Backspace. Fonte 16 no celular: abaixo
                  disso o Safari do iPhone dá zoom na página ao focar. */}
              <input placeholder="Filtrar por evento"
                type="search"
                aria-label="Filtrar eventos do calendário"
                title="Atalho: pressione / para focar o filtro"
                ref={searchRef}
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape" && searchTerm) { e.preventDefault(); setSearchTerm(""); } }}
                className="cal-campo"
                data-testid="input-filtro-calendario"
                style={{ paddingLeft: 32, paddingRight: searchTerm ? 36 : 12, height: alvo(H.md, grosso), width: compacto ? "100%" : 240, boxSizing: "border-box", backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.md, fontSize: grosso ? FS.lead : FS.body, color: P.text, fontFamily: "inherit", WebkitAppearance: "none" }} />
              {searchTerm && (
                <button type="button" onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }}
                  aria-label="Limpar filtro de evento" title="Limpar (Esc)" data-testid="button-limpar-busca-calendario"
                  className="cal-seta-nav"
                  style={{ position: "absolute", right: grosso ? 2 : 4, top: "50%", transform: "translateY(-50%)", width: grosso ? 44 : 28, height: grosso ? 44 : 28, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", borderRadius: R.sm, color: T.apoio, cursor: "pointer" }}>
                  <X aria-hidden="true" style={{ width: 14, height: 14 }} />
                </button>
              )}
            </div>
            {compacto && (
              <Botao
                tamanho={grosso ? "toque" : "md"}
                onClick={() => setCurrentDate(new Date())}
                data-testid="button-today"
                title={escala === "semana" ? "Voltar para a semana corrente" : "Voltar para o mês corrente"}
                style={{ padding: "0 16px", color: P.text }}
              >
                Hoje
              </Botao>
            )}

            {/* SEMANA | MÊS — radiogroup próprio, e não o <Segmentado> do
                design system: aquele tem testid fixo no contêiner
                ("segmentado") e não tem tamanho de toque (44px). */}
            <div
              role="radiogroup"
              aria-label="Escala do calendário"
              data-testid="segmented-escala"
              style={{ display: "flex", backgroundColor: N.n2, border: `1px solid ${T.border}`, padding: 2, borderRadius: R.md, flexShrink: 0, flex: compacto ? "1 1 0" : undefined }}
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
                      const outra = v === "semana" ? "mes" : "semana";
                      setEscala(outra);
                      (e.currentTarget.parentElement?.querySelector(`[data-escala="${outra}"]`) as HTMLElement | null)?.focus();
                    }}
                    data-escala={v}
                    className="cal-seg"
                    style={{
                      // 38 + os 2+2 do trilho + 1+1 da borda = 44 com o dedo.
                      height: grosso ? 38 : 30, padding: "0 14px", borderRadius: 6, border: "none",
                      flex: compacto ? "1 1 0" : undefined,
                      backgroundColor: ativo ? T.surface : "transparent",
                      boxShadow: ativo ? `${SHADOW.sm}, 0 0 0 1px ${T.border}` : "none",
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

        {/* ── Barra do escopo ──
            À esquerda, o que a grade está mostrando (e o que a busca achou);
            à direita, QUAIS prazos ela desenha — com a saída "Todos os marcos"
            para quem tem o recorte da função. Antes os dois moravam no rodapé,
            abaixo de seis semanas de grade: ninguém achava o botão. */}
        {!isError && (
        <div data-testid="barra-do-escopo" style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: compacto ? "6px 12px" : "8px 20px",
          padding: compacto ? "8px 14px" : "8px 20px", minHeight: 44, boxSizing: "border-box",
          borderBottom: `1px solid ${T.border}`,
          backgroundColor: carregado && searchTerm && (escala === "mes" ? resultadoDaBusca === 0 : totalDaSemana === 0) ? TOM.alerta.bg : T.bg,
        }}>
          {statusDoPeriodo()}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: compacto ? "4px 10px" : "6px 12px" }}>
            <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.strong }}>
              {marcosDoPapel && !verTodosOsMarcos ? "Prazos da sua função" : "Prazos"}
            </span>
            {/* Só os marcos que a grade está DESENHANDO. O nome curto ("Lista
                Img") é código para quem chega: a dica diz o que a etapa é e
                quando vence — por Tooltip, que abre também no foco. */}
            {tiposVisiveis.map(dt => (
              <MarcoDaLegenda key={dt.key} marco={dt} dica={DICA_DO_MARCO[dt.key]} comDica={carregado} />
            ))}
            {marcosDoPapel && (
              <button
                type="button"
                onClick={() => setVerTodosOsMarcos(v => !v)}
                aria-pressed={verTodosOsMarcos}
                data-testid="button-marcos-da-funcao"
                data-alvo-natural
                title={verTodosOsMarcos
                  ? "Voltar a ver só os marcos da sua função"
                  : "A grade está mostrando só os marcos da sua função — clique para ver os seis"}
                className="cal-chip"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5, height: grosso ? 30 : 28, padding: "0 11px",
                  borderRadius: R.pill,
                  border: `1px solid ${verTodosOsMarcos ? TOM.laranja.border : T.bdark}`,
                  background: verTodosOsMarcos ? TOM.laranja.bg : T.surface,
                  color: verTodosOsMarcos ? T.accentText : T.apoio,
                  font: "inherit", fontSize: FS.meta, fontWeight: FW.medio, cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                {verTodosOsMarcos && <Check aria-hidden="true" style={{ width: 13, height: 13 }} />}
                {verTodosOsMarcos ? "Todos os marcos" : `Todos os marcos (${DEADLINE_TYPES.length})`}
              </button>
            )}
          </div>
        </div>
        )}

        {isLoading ? (
          <EsqueletoDaGrade escala={escala} compacto={compacto} />
        ) : isError ? (
          <div style={{ padding: compacto ? 14 : 24 }}>
            {/* O botão vai no `detalhe`, e não no `aoTentarDeNovo`: aquele
                tem testid fixo, e `button-retry-calendar` está no inventário
                de capacidades desta tela. */}
            <EstadoErro
              titulo="Não foi possível carregar o calendário"
              detalhe={(
                <>
                  Verifique sua conexão e tente novamente. Nada do que estava marcado foi perdido.
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

             A escala do meio: a faixa de alerta cobre 48h, a grade cobre o
             mês, e a operação trabalha por semana. Aqui o nome do evento cabe
             POR EXTENSO — na grade ele trunca e a pílula é quase decorativa.
             O período ("4 a 10 de outubro") está no título da barra.
          ══════════════════════════════════════════════════════════════ */
          <div key={`s-${diasDaSemana[0].toDateString()}`} className="cal-entra" data-testid="grade-semana">
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
              const fimDeSemana = date.getDay() === 0 || date.getDay() === 6;

              return (
                <div
                  key={date.toDateString()}
                  data-testid={`week-day-${date.getDate()}`}
                  aria-label={`${diaPorExtenso(date)}${hoje ? " (hoje)" : ""}`}
                  role="group"
                  style={{ display: "flex", borderBottom: `1px solid ${N.n3}`, backgroundColor: hoje ? TOM.laranja.bg : fimDeSemana ? T.bg : T.surface }}
                >
                  {/* 56px na área estreita: com mais, sobravam ~50px para o
                      nome depois do tipo e do horário. */}
                  <div style={{ width: compacto ? 56 : 84, flexShrink: 0, padding: compacto ? "12px 8px 12px 12px" : "12px 16px", borderRight: `1px solid ${hoje ? TOM.laranja.border : N.n3}`, display: "flex", flexDirection: "column", gap: 4 }}>
                    <p style={{ margin: 0, fontSize: FS.micro, fontWeight: FW.rotulo, textTransform: "uppercase", letterSpacing: "0.08em", color: hoje ? T.accentText : P.secondary }}>
                      {hoje ? "Hoje" : WEEK_DAYS[date.getDay()]}
                    </p>
                    <p style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.h2, fontWeight: FW.forte, color: hoje ? T.accentText : P.text, lineHeight: 1, letterSpacing: "-0.02em" }}>
                      {date.getDate()}
                    </p>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: itens.length === 0 ? "center" : undefined }}>
                    {itens.length === 0 ? (
                      /* T.second, e nunca o #a8a29e: a casa proíbe o segundo
                         como cor de texto. */
                      <p style={{ margin: 0, padding: compacto ? "0 12px" : "0 16px", fontSize: FS.body, color: T.second }}>Nada marcado</p>
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
                          onClick={() => abrirEvento(ev.id)}
                          aria-label={`Abrir evento ${ev.name} — ${tipo}`}
                          className="cal-realce cal-linha"
                          style={{
                            ["--realce" as string]: hoje ? TOM_FORTE.laranja.bg : N.n2,
                            display: "flex", alignItems: "center", gap: 12, width: "100%",
                            minHeight: 44, padding: compacto ? "8px 10px 8px 12px" : "9px 14px 9px 16px", textAlign: "left",
                            background: "none", border: "none",
                            borderLeft: item.kind === "deadline" ? `3px dashed ${cor}` : `3px solid ${cor}`,
                            borderTop: i > 0 ? `1px solid ${hoje ? TOM.laranja.border : N.n3}` : "none",
                            font: "inherit", cursor: "pointer",
                          }}
                        >
                          <Icone aria-hidden="true" style={{ width: 15, height: 15, color: cor, flexShrink: 0 }} />
                          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                            {/* O NOME POR EXTENSO — o motivo desta visao existir. */}
                            <span style={{ fontSize: FS.body, fontWeight: FW.forte, color: P.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{ev.name}</span>
                            <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "2px 8px", fontSize: FS.meta, color: P.secondary }}>
                              <span style={{ color: item.kind === "deadline" ? item.dtype.text : P.secondary, fontWeight: item.kind === "deadline" ? FW.medio : FW.corpo }}>{tipo.charAt(0).toUpperCase() + tipo.slice(1)}</span>
                              {saida && (
                                <span style={{ fontFamily: "monospace", fontSize: 12, color: P.secondary, whiteSpace: "nowrap", flexShrink: 0 }}>
                                  {String(saida.getHours()).padStart(2, "0")}:{String(saida.getMinutes()).padStart(2, "0")}
                                </span>
                              )}
                              {urgente && (
                                <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: restante! < 24 * 3_600_000 ? TOM.perigo.text : T.accentText, borderRadius: R.pill, padding: "1px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                                  em {msToHM(restante!)}
                                </span>
                              )}
                            </span>
                          </span>
                          <ChevronRight aria-hidden="true" className="cal-seta" style={{ width: 16, height: 16, color: T.second, flexShrink: 0 }} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div key={`m-${year}-${month}`} className="cal-entra" data-testid="grade-mes" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>

            {/* Cabeçalho dos dias */}
            {WEEK_DAYS.map((d, i) => (
              <div key={d} aria-hidden="true" style={{
                height: 34, display: "flex", alignItems: "center", justifyContent: compacto ? "center" : "flex-start",
                padding: compacto ? 0 : "0 10px", minWidth: 0,
                backgroundColor: T.bg,
                borderBottom: `1px solid ${T.border}`,
                borderRight: i !== 6 ? `1px solid ${T.border}` : undefined,
                fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second,
                textTransform: "uppercase", letterSpacing: "0.08em",
              }}>
                {compacto ? d.charAt(0) : d}
              </div>
            ))}

            {/* Células */}
            {days.map((day, idx) => {
              const col = idx % 7;
              const isOutside = day === null;
              const cellHeight = compacto ? 64 : 108;
              const fimDeSemana = col === 0 || col === 6;

              /* ── Dias do mês vizinho, para fechar a semana ── */
              if (isOutside) {
                const outsideDay = idx < startDow
                  ? new Date(year, month, 0).getDate() - (startDow - idx - 1)
                  : idx - daysInMonth - startDow + 1;
                return (
                  <div key={`out-${idx}`} aria-hidden="true" style={{
                    height: cellHeight, backgroundColor: N.n2, padding: compacto ? "6px 0" : "8px 10px",
                    minWidth: 0, textAlign: compacto ? "center" : undefined,
                    borderRight: col !== 6 ? `1px solid ${T.border}` : undefined,
                    borderBottom: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontSize: FS.meta, fontWeight: FW.corpo, color: T.second }}>{outsideDay}</span>
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
                // POR URGENCIA, antes do corte em 2: um prazo que vence HOJE
                // nunca some atras de dois inicios de evento.
                .sort((a, c) => pesoDaUrgencia(a, meiaNoiteDe(date), now) - pesoDaUrgencia(c, meiaNoiteDe(date), now));
              const isToday = date.toDateString() === new Date().toDateString();
              const hasAny  = allCellItems.length > 0;

              return (
                /* Só os dias com algo marcado viram controle — os vazios não
                   fazem nada e não devem entrar na tabulação. */
                <div
                  key={day}
                  data-testid={`calendar-day-${day}`}
                  {...(hasAny ? {
                    role: "button" as const,
                    tabIndex: 0,
                    // Com a contagem: quem ouve só tinha o número do dia.
                    "aria-label": `${diaPorExtenso(date)}${isToday ? " (hoje)" : ""} — ${allCellItems.length} ${allCellItems.length === 1 ? "marcação" : "marcações"}, ver detalhes`,
                    onKeyDown: (e: React.KeyboardEvent) => {
                      // Enter/Espaço numa pill INTERNA borbulha até aqui: sem o
                      // guard, ativar a pill abria também o dialog do dia.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault(); setSelectedDate(date); setDialogOpen(true);
                      }
                    },
                  } : {})}
                  onClick={() => { if (hasAny) { setSelectedDate(date); setDialogOpen(true); } }}
                  className={hasAny ? "cal-realce cal-celula" : undefined}
                  style={{
                    ["--realce" as string]: isToday ? TOM_FORTE.laranja.bg : N.n2,
                    // O fundo de repouso, para o CSS devolver quando o ponteiro
                    // está numa PÍLULA: o clique ali abre o evento, não o dia, e
                    // a célula acesa junto dizia o contrário.
                    ["--base" as string]: isToday ? TOM.laranja.bg : fimDeSemana ? T.bg : P.surface,
                    height: cellHeight, padding: compacto ? "6px 4px" : "7px 8px",
                    // item de grid tem min-width automático: sem zerar, a pill
                    // de nome longo estica a coluna.
                    minWidth: 0, boxSizing: "border-box",
                    borderRight: col !== 6 ? `1px solid ${T.border}` : undefined,
                    borderBottom: `1px solid ${T.border}`,
                    backgroundColor: isToday ? TOM.laranja.bg : fimDeSemana ? T.bg : P.surface,
                    boxShadow: isToday ? `inset 0 2px 0 ${T.accent}` : undefined,
                    cursor: hasAny ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 3, overflow: "hidden",
                    alignItems: compacto ? "center" : undefined,
                  }}
                >
                  {/* Número do dia — hoje em círculo #c2410c (branco sobre o
                      #f97316 saturado ficava em ~2,8:1). */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: compacto ? "center" : "space-between", height: 22, flexShrink: 0 }}>
                    {isToday ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        minWidth: 22, height: 22, padding: "0 4px", boxSizing: "border-box", borderRadius: R.pill,
                        backgroundColor: T.accentText, color: T.surface,
                        fontSize: FS.meta, fontWeight: FW.forte, fontVariantNumeric: "tabular-nums",
                      }}>{day}</span>
                    ) : (
                      <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: hasAny ? P.text : T.apoio, fontVariantNumeric: "tabular-nums", paddingLeft: compacto ? 0 : 2 }}>{day}</span>
                    )}
                    {!compacto && isToday && <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.06em", textTransform: "uppercase", color: T.accentText }}>Hoje</span>}
                  </div>

                  {/* Na área estreita a célula de 64px não comporta pílula
                      legível: cada item vira uma barra na cor da
                      prioridade/prazo e o detalhe fica no dialog do dia. */}
                  {compacto ? (
                    hasAny ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, width: "100%", padding: "0 2px", boxSizing: "border-box" }}>
                        {allCellItems.slice(0, 3).map((item, i) => (
                          <div
                            key={item.kind === "event" ? `ev-${item.ev.id}-${item.ev._type}` : `dl-${item.event.id}-${item.dtype.key}-${i}`}
                            style={{
                              height: 4, borderRadius: 2,
                              backgroundColor: item.kind === "event" ? prioMeta(item.ev).dot : item.dtype.color,
                              opacity: item.kind === "deadline" ? 0.75 : 1,
                            }}
                          />
                        ))}
                        {allCellItems.length > 3 && (
                          <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: P.secondary, textAlign: "center", lineHeight: 1.1 }}>+{allCellItems.length - 3}</span>
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
                            /* <button>: a pill navega para o evento — focável. */
                            <button
                              key={`ev-${ev.id}-${ev._type}`}
                              type="button"
                              data-testid={`event-${ev.id}-${ev._type}`}
                              onClick={e => { e.stopPropagation(); abrirEvento(ev.id); }}
                              title={`${ev.name} — ${isStart ? "início do evento" : `saída do caminhão às ${horaMinuto(depTime)}`}${isUrgent ? ` (em ${msToHM(remaining)})` : ""}`}
                              aria-label={`Abrir evento ${ev.name} — ${isStart ? "início" : "saída do caminhão"}`}
                              className="cal-pilula"
                              style={{
                                display: "flex", alignItems: "center", gap: 5, height: 22, flexShrink: 0,
                                padding: "0 4px 0 6px", width: "100%", textAlign: "left", boxSizing: "border-box",
                                backgroundColor: isCrit ? TOM.perigo.bg : T.surface,
                                border: `1px solid ${isCrit ? TOM.perigo.border : T.border}`,
                                borderLeft: `3px solid ${meta.dot}`,
                                borderRadius: R.sm,
                                boxShadow: SHADOW.sm,
                                overflow: "hidden", cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              {isStart
                                ? <Calendar aria-hidden="true" style={{ width: 11, height: 11, color: T.second, flexShrink: 0 }} />
                                : <Truck    aria-hidden="true" style={{ width: 11, height: 11, color: isCrit ? TOM.perigo.text : T.second, flexShrink: 0 }} />}
                              <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, fontWeight: FW.medio, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ev.name}
                              </span>
                              {isUrgent && (
                                <span style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: T.surface, backgroundColor: isCrit ? TOM.perigo.text : T.accentText, borderRadius: 4, padding: "1px 5px", whiteSpace: "nowrap", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                                  {horasCurtas(remaining)}
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
                              onClick={e => { e.stopPropagation(); abrirEvento(event.id); }}
                              title={`${event.name} — prazo de ${dtype.label}`}
                              aria-label={`Abrir evento ${event.name} — prazo de ${dtype.label}`}
                              className="cal-pilula"
                              style={{
                                display: "flex", alignItems: "center", gap: 5, height: 22, flexShrink: 0,
                                padding: "0 6px", width: "100%", textAlign: "left", boxSizing: "border-box",
                                backgroundColor: `${dtype.color}14`,
                                border: "1px solid transparent",
                                borderLeft: `3px dashed ${dtype.color}`,
                                borderRadius: R.sm,
                                overflow: "hidden", cursor: "pointer",
                                font: "inherit", whiteSpace: "nowrap",
                              }}
                            >
                              <Flag aria-hidden="true" style={{ width: 11, height: 11, color: dtype.color, flexShrink: 0 }} />
                              {/* O marco E o evento: só "Lista Img" na célula não
                                  dizia de quem era o prazo. */}
                              <span style={{ flex: 1, minWidth: 0, fontSize: FS.small, overflow: "hidden", textOverflow: "ellipsis" }}>
                                <span style={{ fontWeight: FW.forte, color: dtype.text }}>{dtype.short}</span>
                                <span style={{ fontWeight: FW.corpo, color: T.apoio }}> · {event.name}</span>
                              </span>
                            </button>
                          );
                        }
                      })}
                      {allCellItems.length > 2 && (
                        <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.apoio, paddingLeft: 3, lineHeight: "16px" }}>+{allCellItems.length - 2} mais</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Como ler (rodapé) ── */}
        {!isError && <LegendaDoCalendario compacto={compacto} />}
      </div>

      {/* ── Coluna de apoio: Próximos eventos + Resumo do mês ──
          Larga: ao lado da grade. Média: os dois lado a lado embaixo.
          Estreita: um embaixo do outro (classes cal-layout/cal-lateral). */}
      {!isError && (
      <div className="cal-lateral">

        {/* Próximos eventos */}
        <section aria-labelledby="cal-proximos-titulo" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, padding: compacto ? "14px 14px 6px" : "16px 18px 6px" }}>
            <h3 id="cal-proximos-titulo" style={{ margin: 0, fontSize: FS.strong, fontWeight: FW.forte, color: P.text, letterSpacing: "-0.01em", fontFamily: FONT.display }}>
              Próximos eventos
            </h3>
            <span style={{ fontSize: FS.small, color: P.secondary }}>por data de início</span>
          </div>
          <div style={{ padding: compacto ? "0 6px 8px" : "0 8px 10px" }}>
            {isLoading ? (
              <div style={{ padding: "0 10px" }}><EsqueletoDeLinhas linhas={4} comBloco /></div>
            ) : upcomingEvents.length === 0 ? (
              <div style={{ padding: "6px 8px 4px" }}>
                <EstadoVazio
                  compacto
                  icone={CalendarX}
                  titulo="Nenhum evento pela frente"
                  descricao="Eventos com início a partir de hoje aparecem aqui, do mais próximo ao mais distante."
                  testId="vazio-proximos-eventos"
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {upcomingEvents.map((ev, i) => {
                  const inicio = parseDateLocal(ev.startDate);
                  const dep = toUTCDisplayDate(ev.truckDepartureDate);
                  const meta = prioMeta(ev);
                  return (
                    <div key={ev.id}
                      data-testid={`upcoming-event-${ev.id}`}
                      role="link" tabIndex={0} aria-label={`Abrir evento ${ev.name}`}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); abrirEvento(ev.id); } }}
                      onClick={() => abrirEvento(ev.id)}
                      className="cal-realce cal-linha"
                      style={{ ["--realce" as string]: N.n2, borderRadius: R.md, padding: "10px 10px", minHeight: 44, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderTop: i > 0 ? `1px solid ${N.n3}` : "none" }}>
                      {/* O bloco de data é o INÍCIO — a ordem da lista. A saída
                          do caminhão vai na linha de baixo, com o nome dela:
                          antes a lista ordenava por início e só mostrava a
                          saída, e a ordem parecia errada. */}
                      <div aria-hidden="true" style={{ width: 42, flexShrink: 0, textAlign: "center", borderRadius: R.md, padding: "5px 0 6px", backgroundColor: T.bg, border: `1px solid ${T.border}`, boxShadow: `inset 0 3px 0 ${meta.dot}` }}>
                        <div style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.forte, color: P.text, lineHeight: 1.1, marginTop: 2 }}>{inicio.getDate()}</div>
                        <div style={{ fontSize: FS.micro, fontWeight: FW.rotulo, color: P.secondary, textTransform: "uppercase", letterSpacing: "0.06em" }}>{mesCurto(inicio)}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Até duas linhas, e não reticência. */}
                        <p style={{ margin: 0, fontSize: FS.body, fontWeight: FW.forte, color: P.text, lineHeight: 1.35, overflow: "hidden", wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{ev.name}</p>
                        {/* A prioridade desce para a linha da saída, como texto
                            com ponto: na coluna lateral (360px) o selo à direita
                            espremia o nome em três linhas. */}
                        <p style={{ margin: "3px 0 0", fontSize: FS.meta, color: P.secondary, display: "flex", alignItems: "center", gap: "2px 10px", flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                            <Truck aria-hidden="true" style={{ width: 12, height: 12, color: T.muted, flexShrink: 0 }} />
                            Saída {diaCurto(dep)} · {horaMinuto(dep)}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", color: meta === NO_PRIO ? P.secondary : meta.text, fontWeight: FW.medio }}>
                            <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: meta.dot }} />
                            {meta.label}
                          </span>
                        </p>
                      </div>
                      <ChevronRight aria-hidden="true" className="cal-seta" style={{ width: 16, height: 16, color: T.second, flexShrink: 0, marginLeft: -4 }} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Resumo do mês — claro, como o resto da tela: o bloco escuro puxava
            o olho para o dado MENOS acionável da página. */}
        <section aria-labelledby="cal-resumo-titulo" data-testid="resumo-do-mes" style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.lg, boxShadow: SHADOW.sm, padding: compacto ? 14 : 18, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div>
              <h3 id="cal-resumo-titulo" style={{ margin: 0, fontSize: FS.strong, fontWeight: FW.forte, color: P.text, letterSpacing: "-0.01em", fontFamily: FONT.display }}>
                Resumo de {nomeDoMes}
              </h3>
              {/* A REGRA, ESCRITA: a grade desenha pela SAÍDA DO CAMINHÃO e os
                  prazos saem dela — o resumo conta o mesmo conjunto. */}
              <p style={{ margin: "2px 0 0", fontSize: FS.small, color: P.secondary }}>
                Eventos que aparecem na grade
              </p>
            </div>
          </div>

          {isLoading ? (
            <div style={{ marginTop: 12 }}><EsqueletoDeLinhas linhas={3} /></div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 14 }}>
                <span data-testid="resumo-total" style={{ fontFamily: FONT.display, fontSize: 34, fontWeight: FW.forte, color: P.text, lineHeight: 1, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{monthEvents.length}</span>
                <span style={{ fontSize: FS.body, color: P.secondary }}>{monthEvents.length === 1 ? "evento no mês" : "eventos no mês"}</span>
              </div>

              {/* A proporção do mês numa barra só: em andamento, concluídos e
                  encerrados somam o total — o olho lê a fração sem conta. */}
              <div aria-hidden="true" style={{ display: "flex", height: 6, borderRadius: R.pill, overflow: "hidden", backgroundColor: N.n3, margin: "12px 0 6px", gap: monthEvents.length ? 2 : 0 }}>
                {[
                  { v: ongoingCount, c: T.accent },
                  { v: completedCount, c: TOM.sucesso.dot },
                  { v: closedCount, c: T.bdark },
                ].filter(s => s.v > 0).map((s, i) => (
                  <span key={i} style={{ flex: s.v, backgroundColor: s.c }} />
                ))}
              </div>

              {/* "Prioridade urgente", e não "Urgentes": o número conta a
                  PRIORIDADE cadastrada, não prazo vencendo — a faixa vermelha
                  do topo é que fala de urgência de tempo. Fica separada das
                  três de cima porque NÃO entra na soma. */}
              <dl style={{ margin: 0 }}>
                {[
                  { label: "Em andamento",       value: ongoingCount,   dot: T.accent },
                  { label: "Concluídos",         value: completedCount, dot: TOM.sucesso.dot },
                  { label: "Encerrados",         value: closedCount,    dot: T.bdark },
                  { label: "Prioridade urgente", value: urgentCount,    dot: TOM.perigo.dot },
                ].map(({ label, value, dot }, i) => (
                  <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "9px 0", borderTop: i === 3 ? `1px dashed ${T.border}` : i > 0 ? `1px solid ${N.n3}` : "none", marginTop: i === 3 ? 4 : 0 }}>
                    <dt style={{ display: "flex", alignItems: "center", gap: 8, fontSize: FS.body, color: T.apoio }}>
                      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: i === 3 ? 2 : "50%", backgroundColor: dot }} />
                      {label}
                    </dt>
                    <dd style={{ margin: 0, fontFamily: FONT.display, fontSize: FS.strong, fontWeight: FW.forte, color: i === 3 && value > 0 ? TOM.perigo.text : value === 0 ? T.second : P.text, fontVariantNumeric: "tabular-nums" }}>{value}</dd>
                  </div>
                ))}
              </dl>

              {/* "Ver mês atual" só quando há para onde voltar: no mês
                  corrente o botão não fazia nada (o "Hoje" da barra é o mesmo
                  gesto, sempre à mão, e vale também para a semana). */}
              {!noMesAtual && (
                <Botao
                  variante="secundario"
                  tamanho={grosso ? "toque" : "md"}
                  larguraCheia
                  onClick={() => setCurrentDate(new Date())}
                  data-testid="button-ver-mes-atual"
                  style={{ marginTop: 12 }}
                >
                  Ver mês atual
                </Botao>
              )}
            </>
          )}
        </section>
      </div>
      )}
      </div>

      {/* ── Dialog do dia ──
          Casca da casa (modal-shell): cabeçalho fixo, só a lista rola. Foco e
          fechamento do Radix: Esc, clique fora e o X chamam o mesmo
          setDialogOpen(false), e o foco volta para a célula que abriu o dia.
          Variante `confirm` (clara): é uma lista curta de consulta. As duas
          seções (eventos e prazos) têm cabeçalho próprio — antes só os prazos
          tinham, e os eventos pareciam soltos acima de um divisor. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={HIDE_NATIVE_CLOSE} style={modalSurface(520)} data-testid="dialog-dia-calendario">
          <DialogTitle className="sr-only">
            {selectedDate ? diaPorExtenso(selectedDate) : ""}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Eventos e prazos marcados neste dia. Escolha um para abrir o evento.
          </DialogDescription>
          <ModalHeader
            variant="confirm"
            icon={Calendar}
            tint={T.accentText}
            compacto={isMobile}
            title={selectedDate ? diaPorExtenso(selectedDate) : ""}
            subtitle={selectedDate
              ? `${plural(eventosDoDia.length + prazosDoDia.length, "marcação", "marcações")}${searchTerm ? ` com “${searchTerm}”` : ""}${diaAbertoEhHoje ? " · hoje" : ""}${isMobile ? "" : " — escolha uma para abrir o evento"}`
              : undefined}
            onClose={() => setDialogOpen(false)}
            testIdDoFechar="button-fechar-dia"
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: isMobile ? "14px 14px 18px" : "16px 22px 22px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
            {/* Mesmo filtro de busca da grade (a célula e o dialog contam o
                mesmo número) e a MESMA régua de urgência dentro de cada seção:
                saída em menos de 48h antes de saída normal, antes de início. */}
            {eventosDoDia.length > 0 && (
              <section aria-label="Eventos">
                <TituloDaSecao rotulo="Eventos" n={eventosDoDia.length} />
                <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                  {eventosDoDia.map((ev, i) => {
                    const meta = prioMeta(ev);
                    const isStart = ev._type === "start";
                    // MESMA conversão do agrupamento da grade.
                    const dateTime = isStart ? parseDateLocal(ev.startDate) : toUTCDisplayDate(ev.truckDepartureDate);
                    const restante = isStart ? null : dateTime.getTime() - now;
                    const urgente = restante !== null && restante > 0 && restante < 48 * 3_600_000;
                    return (
                      <div key={`${ev.id}-${ev._type}`}
                        data-testid={`dialog-event-${ev.id}-${ev._type}`}
                        role="link" tabIndex={0} aria-label={`Abrir evento ${ev.name}`}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); abrirDoDialog(ev.id); } }}
                        onClick={() => abrirDoDialog(ev.id)}
                        className="cal-realce cal-linha"
                        style={{ ["--realce" as string]: N.n2, display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "12px 12px" : "12px 14px", minHeight: 44, backgroundColor: P.surface, borderTop: i > 0 ? `1px solid ${N.n3}` : "none", borderLeft: `3px solid ${meta.dot}`, cursor: "pointer" }}
                      >
                        <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: R.md, flexShrink: 0, backgroundColor: T.bg, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {isStart ? <Calendar style={{ width: 15, height: 15, color: T.apoio }} /> : <Truck style={{ width: 15, height: 15, color: urgente ? TOM.perigo.text : T.apoio }} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: FS.read, fontWeight: FW.forte, color: P.text, margin: 0, lineHeight: 1.35, overflowWrap: "anywhere" }}>{ev.name}</p>
                          <p style={{ fontSize: FS.meta, color: P.secondary, margin: "3px 0 0", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 8px" }}>
                            <span style={{ whiteSpace: "nowrap" }}>
                              {isStart ? "Início do evento" : "Saída do caminhão"}
                              {!isStart && <> às <strong style={{ color: P.text, fontWeight: FW.forte }}>{horaMinuto(dateTime)}</strong></>}
                            </span>
                            {urgente && (
                              <span style={{ fontSize: FS.small, fontWeight: FW.forte, color: T.surface, backgroundColor: restante! < 24 * 3_600_000 ? TOM.perigo.text : T.accentText, borderRadius: R.pill, padding: "1px 8px", whiteSpace: "nowrap" }}>
                                em {msToHM(restante!)}
                              </span>
                            )}
                            {/* No celular a prioridade desce para esta linha: o
                                selo à direita espremia o nome em quatro linhas. */}
                            {isMobile && (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", color: meta === NO_PRIO ? P.secondary : meta.text, fontWeight: FW.medio }}>
                                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: meta.dot }} />
                                {meta.label}
                              </span>
                            )}
                          </p>
                        </div>
                        {!isMobile && (
                          <Selo cores={{ bg: meta.bg, text: meta.text, border: meta.border }} ponto style={{ flexShrink: 0 }}>
                            {meta.label}
                          </Selo>
                        )}
                        <ChevronRight aria-hidden="true" className="cal-seta" style={{ width: 16, height: 16, color: T.second, flexShrink: 0, marginLeft: -4 }} />
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Prazos do dia ── "Prazos", não "Prazos de Layout": a seção
                lista os seis marcos. */}
            {prazosDoDia.length > 0 && (
              <section aria-label="Prazos">
                <TituloDaSecao rotulo="Prazos" n={prazosDoDia.length} />
                <div style={{ border: `1px solid ${T.border}`, borderRadius: R.lg, overflow: "hidden" }}>
                  {prazosDoDia.map(({ event, dtype }, i) => (
                    <div key={`${event.id}-${dtype.key}`}
                      data-testid={`dialog-deadline-${event.id}-${dtype.key}`}
                      role="link"
                      tabIndex={0}
                      aria-label={`Abrir evento ${event.name}`}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); abrirDoDialog(event.id); } }}
                      onClick={() => abrirDoDialog(event.id)}
                      className="cal-realce cal-linha"
                      style={{ ["--realce" as string]: `${dtype.color}12`, display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "12px 12px" : "12px 14px", minHeight: 44, backgroundColor: P.surface, borderTop: i > 0 ? `1px solid ${N.n3}` : "none", borderLeft: `3px dashed ${dtype.color}`, cursor: "pointer" }}
                    >
                      <span aria-hidden="true" style={{ width: 34, height: 34, borderRadius: R.md, flexShrink: 0, backgroundColor: `${dtype.color}14`, border: `1px solid ${dtype.color}33`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Flag style={{ width: 15, height: 15, color: dtype.color }} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: FS.read, fontWeight: FW.forte, color: P.text, margin: 0, lineHeight: 1.35, overflowWrap: "anywhere" }}>{event.name}</p>
                        <p style={{ fontSize: FS.meta, color: P.secondary, margin: "3px 0 0" }}>
                          Prazo de <strong style={{ color: dtype.text, fontWeight: FW.forte }}>{dtype.label}</strong>
                        </p>
                      </div>
                      {/* O mesmo "hoje" da régua de urgência (vence hoje vem
                          primeiro): o dialog diz isso com palavra. */}
                      {diaAbertoEhHoje && (
                        <Selo tom="alerta" ponto style={{ flexShrink: 0 }}>Vence hoje</Selo>
                      )}
                      <ChevronRight aria-hidden="true" className="cal-seta" style={{ width: 16, height: 16, color: T.second, flexShrink: 0, marginLeft: -4 }} />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  /* ── Peças de apresentação que leem o estado da tela ── */

  /** O período na barra: "Outubro 2026" ou "4 a 10 de outubro 2026". */
  function tituloDoPeriodo() {
    const ano = escala === "semana" ? diasDaSemana[6].getFullYear() : year;
    const nome = escala === "semana" ? faixaDaSemana(diasDaSemana[0], diasDaSemana[6]) : MONTH_NAMES[month];
    return (
      // aria-live: quem navega pelas setas ouve o período novo.
      <h2 aria-live="polite" data-testid="titulo-do-periodo" style={{ margin: 0, flex: compacto ? "1 1 0" : undefined, minWidth: 0, fontSize: compacto ? FS.title : FS.h2, fontWeight: FW.forte, color: P.text, letterSpacing: "-0.02em", fontFamily: FONT.display, lineHeight: 1.2, whiteSpace: compacto ? "normal" : "nowrap" }}>
        {nome} <span style={{ color: P.secondary, fontWeight: FW.medio }}>{ano}</span>
      </h2>
    );
  }

  /** A frase do período: quantas marcações, e o que a busca achou. */
  function statusDoPeriodo() {
    if (isLoading) return <span style={{ fontSize: FS.body, color: P.secondary }}>Carregando marcações…</span>;
    if (isError) return <span />;
    const naSemana = escala === "semana";
    const onde = naSemana ? "nesta semana" : `em ${nomeDoMes}`;
    if (searchTerm) {
      const n = naSemana ? totalDaSemana : (resultadoDaBusca ?? 0);
      // O RESULTADO DA BUSCA, DITO: um termo que não casa deixava a grade
      // vazia, idêntica a um período sem evento. `aria-live` para quem usa
      // leitor de tela ouvir o resultado enquanto digita.
      return (
        <div role="status" aria-live="polite" data-testid="resultado-busca-calendario"
          style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: FS.body, color: n === 0 ? TOM.alerta.text : P.secondary }}>
          <span>
            {n === 0
              ? <>Nada com “<strong style={{ color: P.text }}>{searchTerm}</strong>” {onde}.</>
              : <>{plural(n, "marcação", "marcações")} com “<strong style={{ color: P.text }}>{searchTerm}</strong>” {onde}</>}
          </span>
          {/* Link de texto dentro da frase: fica nativo. */}
          <button
            type="button"
            onClick={() => { setSearchTerm(""); searchRef.current?.focus(); }}
            data-testid="button-limpar-filtro-status"
            style={{ background: "none", border: "none", padding: grosso ? "12px 0" : 0, font: "inherit", fontSize: FS.body, fontWeight: FW.forte, color: n === 0 ? TOM.alerta.text : T.apoio, textDecoration: "underline", textUnderlineOffset: 3, cursor: "pointer" }}
          >
            Limpar filtro
          </button>
        </div>
      );
    }
    const n = naSemana ? totalDaSemana : marcacoesNoMes;
    return (
      <span data-testid="status-do-periodo" style={{ fontSize: FS.body, color: P.secondary }}>
        {n === 0
          ? <>Nada marcado {onde}</>
          : <><strong style={{ color: P.text, fontWeight: FW.forte }}>{n}</strong> {n === 1 ? "marcação" : "marcações"} {onde}</>}
      </span>
    );
  }
}

/**
 * Um marco na legenda de prazos. A dica (o que a etapa é e quando vence) vem
 * num Tooltip que abre também no FOCO — o `title` de antes não existia no
 * toque nem no teclado. Durante a carga vai sem o Tooltip: o Popper do Radix
 * registra a âncora num efeito, e isso é um commit a mais numa tela que deve
 * ficar PARADA enquanto espera a rota (perf-calendario).
 */
function MarcoDaLegenda({ marco, dica, comDica }: { marco: { key: string; short: string; color: string }; dica: string; comDica: boolean }) {
  const rotulo = (
    <span tabIndex={comDica ? 0 : undefined} aria-label={comDica ? dica : undefined} data-testid={`legenda-marco-${marco.key}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, fontWeight: FW.medio, color: T.apoio, cursor: comDica ? "help" : undefined, whiteSpace: "nowrap", borderRadius: R.sm, padding: "2px 0" }}>
      <span aria-hidden="true" style={{ width: 12, height: 10, borderRadius: 2, borderLeft: `3px dashed ${marco.color}`, backgroundColor: `${marco.color}1f` }} />
      {marco.short}
    </span>
  );
  if (!comDica) return rotulo;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{rotulo}</TooltipTrigger>
      <TooltipContent side="top" style={{ maxWidth: 260, fontSize: FS.body, lineHeight: 1.5 }}>{dica}</TooltipContent>
    </Tooltip>
  );
}

/** Cabeçalho de seção do dialog do dia: rótulo em caixa-alta + contagem. */
function TituloDaSecao({ rotulo, n }: { rotulo: string; n: number }) {
  return (
    <h3 style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8, fontSize: FS.micro, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: T.second }}>
      {rotulo}
      <span style={{ fontSize: FS.micro, fontWeight: FW.forte, color: T.apoio, backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: R.pill, padding: "0 7px", letterSpacing: 0 }}>{n}</span>
    </h3>
  );
}

/* ── Seta de navegação (‹ ›) — metade de uma peça só ── */
function NavBtn({ onClick, children, testId, big, label }: {
  onClick: () => void; children: React.ReactNode; testId: string; big?: boolean; label: string;
}) {
  const size = big ? 44 : 34;
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-label={label} title={label}
      className="cal-seta-nav"
      style={{ width: size, height: big ? 42 : 32, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: 0, border: "none", background: T.surface, color: T.strong, cursor: "pointer" }}>
      {children}
    </button>
  );
}
