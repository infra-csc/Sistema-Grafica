import { useQuery } from "@tanstack/react-query";
import { parseDateLocal, toUTCDisplayDate } from "@/lib/utils";
import { getPriorityMeta, getStatusMeta, isEventoEncerrado } from "@/lib/status";
import { ChevronLeft, ChevronRight, AlertTriangle, Calendar, Truck, Search, BarChart2, Flag } from "lucide-react";
import { useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MARCOS_DO_EVENTO, OFFSET_PADRAO_DO_MARCO } from "@shared/prazo-dates";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/contexts/auth-context";

/* ── Palette ── */
const P = {
  bg:       "#f9f9f8",
  surface:  "#ffffff",
  border:   "#e7e5e4",
  text:     "#1c1917",
  // #746e69 é o cinza que passa AA em todas as superfícies do app (ver
  // lib/theme.ts) — o antigo #78716c reprovava sobre os fundos acinzentados.
  secondary:"#746e69",
  // Apenas decorativo (ícones, placeholders) — nunca como cor de texto.
  muted:    "#a8a29e",
  accent:   "#f97316",
  low:      "#f5f4f0",
};

/* ── Prioridade → cores canônicas (lib/status) ──
   Antes havia um mapa hex local (PRIO_COLOR) que usava a cor saturada como
   texto — reprovava WCAG AA e divergia das outras telas. Agora: `text` (tom
   escuro) no texto, `dot` (saturada) na bolinha/barra, como no resto do app.
   "completed" reaproveita o verde do status de evento concluído; sem
   prioridade cai na família neutra. */
const NO_PRIO = { label: "Sem prioridade", bg: "#f5f5f4", text: "#44403c", border: "#e7e5e4", dot: "#78716c" };
function prioMeta(ev: any): { label: string; bg: string; text: string; border: string; dot: string } {
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

/* Sunday-first week (matches mockup) */
const WEEK_DAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function Calendario() {
  const isMobile = useIsMobile();
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

  const { data: events = [], isLoading, isError, refetch } = useQuery<any[]>({ queryKey: ["/api/events"] });

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
      events: any[];
      deadlines: Array<{ event: any; dtype: typeof DEADLINE_TYPES[number] }>;
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
        const offset: number = (ev as any)[dt.key] ?? DEADLINE_DEFAULTS[dt.key];
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
  function pesoDaUrgencia(item: { kind: string; ev?: any }, diaMs: number, agoraMs: number): number {
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
        const offset: number = (ev as any)[dt.key] ?? DEADLINE_DEFAULTS[dt.key];
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

  function msToHM(ms: number) {
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    return `${h}h ${m}min`;
  }

  /* pill background for urgent countdown.
     #c2410c (orange-700): branco sobre o #f97316 saturado ficava em ~2,8:1 —
     o aviso mais urgente da tela era o menos legível (AA pede 4,5:1). */
  function urgentBg(ev: any) {
    const hrs = (toUTCDisplayDate(ev.truckDepartureDate).getTime() - now) / 3_600_000;
    return hrs < 24 ? "#dc2626" : "#c2410c";
  }

  return (
    <div style={{ backgroundColor: P.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 14px 32px" : "28px 28px 48px" }}>

      {/* ── Header ──
          As abas Semana/Lista saíram: eram estado morto — trocavam um
          activeView que nada na tela lia, então "Semana" e "Lista" mostravam
          exatamente a mesma grade de mês. Melhor não oferecer visões que não
          existem; se um dia existirem, voltam com conteúdo próprio. */}
      <div style={{ marginBottom: 28 }}>
        <h1 data-testid="title-calendario" style={{
          fontSize: 26, fontWeight: 800, color: P.text, margin: 0,
          textTransform: "uppercase", letterSpacing: "-0.03em",
          fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1,
        }}>
          Calendário de Eventos
        </h1>
        <p style={{ fontSize: 13, color: P.secondary, margin: "6px 0 0", fontWeight: 500 }}>
          Gestão tática e logística — {MONTH_NAMES[month]} {year}
        </p>
      </div>

      {/* ── Alert strip (urgent < 48h) ──
          role="alert": leitor de tela anuncia a urgência ao chegar na tela.
          O antigo "Ver Detalhes" abria só o dia do PRIMEIRO urgente; agora
          cada urgente é um botão que leva direto ao seu evento. */}
      {urgentEvents.length > 0 && (
        <div role="alert" style={{
          marginBottom: 20,
          backgroundColor: "#fef2f2",
          borderLeft: "6px solid #dc2626",
          borderRadius: 12,
          border: "1px solid #fca5a5",
          padding: "14px 20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle style={{ width: 18, height: 18, color: "#dc2626", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#7f1d1d" }}>
                {urgentEvents.length} evento{urgentEvents.length > 1 ? "s" : ""} com saída do caminhão nas próximas 48h
              </span>
            </div>
            <span style={{ fontSize: 10, fontWeight: 900, color: "#ffffff", backgroundColor: "#dc2626", borderRadius: 999, padding: "2px 10px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Crítico
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {urgentEvents.map(ev => {
              const remaining = toUTCDisplayDate(ev.truckDepartureDate).getTime() - now;
              return (
                <button key={ev.id}
                  onClick={() => setLocation(`/eventos/${ev.id}`)}
                  data-testid={`urgent-event-${ev.id}`}
                  aria-label={`Abrir evento ${ev.name} — saída em ${msToHM(remaining)}`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    minHeight: isMobile ? 44 : 32, padding: "4px 6px 4px 12px",
                    backgroundColor: "#ffffff", border: "1px solid #fca5a5", borderRadius: 999,
                    fontSize: 12, fontWeight: 700, color: "#7f1d1d", cursor: "pointer",
                  }}>
                  <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 900, color: "#ffffff", backgroundColor: urgentBg(ev), borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                    {msToHM(remaining)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Calendar Card ── */}
      <div style={{ backgroundColor: P.surface, borderRadius: 12, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.06)", marginBottom: 28 }}>

        {/* Navigation bar */}
        <div style={{ padding: isMobile ? "14px 16px" : "20px 32px", backgroundColor: "#f9f9f8", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h2 style={{ margin: 0, fontSize: isMobile ? 20 : 26, fontWeight: 800, color: P.text, textTransform: "uppercase", letterSpacing: "-0.03em", fontFamily: "'Space Grotesk', sans-serif" }}>
              {MONTH_NAMES[month]} {year}
            </h2>
            <div style={{ display: "flex", gap: 4 }}>
              {/* O PASSO SEGUE A ESCALA. As setas so sabiam `month ± 1`: com a
                  semana na tela, avancar um mes pula quatro semanas e a pessoa
                  perde o lugar. */}
              <NavBtn onClick={() => andar(-1)} testId="button-prev-month" big={isMobile} label={escala === "semana" ? "Semana anterior" : "Mês anterior"}>
                <ChevronLeft style={{ width: 18, height: 18 }} />
              </NavBtn>
              <NavBtn onClick={() => andar(1)} testId="button-next-month" big={isMobile} label={escala === "semana" ? "Próxima semana" : "Próximo mês"}>
                <ChevronRight style={{ width: 18, height: 18 }} />
              </NavBtn>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: P.muted }} />
              <input placeholder="Filtrar evento..."
                aria-label="Filtrar eventos do calendário"
                ref={searchRef}
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                style={{ paddingLeft: 32, paddingRight: 12, height: isMobile ? 44 : 36, width: isMobile ? 160 : 200, backgroundColor: "#eeeeed", border: "none", borderRadius: 8, fontSize: 13, color: P.text }} />
            </div>
            {/* Alvo de toque: 44px no celular, como os demais controles de navegação. */}
            <button onClick={() => setCurrentDate(new Date())} data-testid="button-today"
              title={escala === "semana" ? "Voltar para a semana corrente" : "Voltar para o mês corrente"}
              style={{ padding: "0 20px", height: isMobile ? 44 : 36, borderRadius: 8, border: "1px solid #e7e5e4", backgroundColor: "#ffffff", color: P.text, fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}>
              Hoje
            </button>

            {/* SEMANA | MÊS — mesmo desenho dos outros segmented do app. */}
            <div
              role="radiogroup"
              aria-label="Escala do calendário"
              data-testid="segmented-escala"
              style={{ display: "flex", backgroundColor: "#eeeeed", padding: 2, borderRadius: 8, flexShrink: 0 }}
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
                    style={{
                      height: isMobile ? 40 : 32, padding: "0 14px", borderRadius: 6, border: "none",
                      backgroundColor: ativo ? "#ffffff" : "transparent",
                      boxShadow: ativo ? "0 1px 3px rgba(0,0,0,0.10)" : "none",
                      color: ativo ? P.text : P.secondary,
                      font: "inherit", fontSize: 13, fontWeight: ativo ? 700 : 600,
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

        {isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 64 }}>
            <div style={{ width: 32, height: 32, border: "3px solid #e7e5e4", borderTopColor: P.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : isError ? (
          <div role="alert" style={{ padding: "56px 24px", textAlign: "center" }}>
            <h3 style={{ color: "#b91c1c", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar o calendário</h3>
            <p style={{ color: "#746e69", fontSize: 13, marginBottom: 20 }}>Verifique sua conexão e tente novamente.</p>
            <button onClick={() => refetch()} data-testid="button-retry-calendar"
              style={{ fontSize: 13, fontWeight: 700, color: "#fff", background: "#1c1917", border: "none", borderRadius: 8, padding: "9px 20px", cursor: "pointer" }}>
              Tentar novamente
            </button>
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
                <div style={{ padding: "12px 20px", borderBottom: "1px solid #eeeeed", backgroundColor: "#f9f9f8", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: 15, fontWeight: 800, color: P.text }}>{faixa}</span>
                  <span style={{ fontSize: 12, color: P.secondary }}>
                    {total} {total === 1 ? "marcação" : "marcações"}
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
                  style={{ display: "flex", gap: 0, borderBottom: "1px solid #f5f4f2", backgroundColor: hoje ? "#fffbf7" : "#ffffff" }}
                >
                  <div style={{ width: 92, flexShrink: 0, padding: "12px 14px", borderRight: "1px solid #f5f4f2" }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: hoje ? "#c2410c" : P.secondary }}>
                      {WEEK_DAYS[date.getDay()]}
                    </p>
                    <p style={{ margin: "2px 0 0", fontFamily: "'Space Grotesk', sans-serif", fontSize: 20, fontWeight: 800, color: hoje ? "#c2410c" : P.text, lineHeight: 1 }}>
                      {date.getDate()}
                    </p>
                  </div>

                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    {itens.length === 0 ? (
                      /* #78716c e nao #a8a29e: a casa proibe o segundo como
                         cor de texto (2,52 sobre branco). */
                      <p style={{ margin: 0, padding: "14px", fontSize: 13, color: "#78716c" }}>Nada marcado</p>
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
                          style={{
                            display: "flex", alignItems: "center", gap: 10, width: "100%",
                            minHeight: 44, padding: "8px 14px", textAlign: "left",
                            background: "none", border: "none",
                            borderLeft: item.kind === "deadline" ? `3px dashed ${cor}` : `3px solid ${cor}`,
                            borderTop: i > 0 ? "1px solid #f9f9f8" : "none",
                            font: "inherit", cursor: "pointer",
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                        >
                          <Icone aria-hidden="true" style={{ width: 14, height: 14, color: cor, flexShrink: 0 }} />
                          {/* O NOME POR EXTENSO — o motivo desta visao existir. */}
                          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: P.text }}>{ev.name}</span>
                          <span style={{ fontSize: 12, color: P.secondary, whiteSpace: "nowrap", flexShrink: 0 }}>{tipo}</span>
                          {saida && (
                            <span style={{ fontFamily: "monospace", fontSize: 12, color: P.secondary, whiteSpace: "nowrap", flexShrink: 0 }}>
                              {String(saida.getHours()).padStart(2, "0")}:{String(saida.getMinutes()).padStart(2, "0")}
                            </span>
                          )}
                          {urgente && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", whiteSpace: "nowrap", flexShrink: 0 }}>
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
                backgroundColor: "#f9f9f8",
                borderBottom: "1px solid #eeeeed",
                borderRight: d !== "SÁB" ? "1px solid #eeeeed" : undefined,
                fontSize: 10, fontWeight: 900, color: "#746e69",
                textTransform: "uppercase", letterSpacing: "0.18em",
              }}>
                {d}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day, idx) => {
              const col = idx % 7;
              const isOutside = day === null;
              const cellHeight = isMobile ? 62 : 90;

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
                    borderRight: col !== 6 ? "1px solid #eeeeed" : undefined,
                    borderBottom: "1px solid #eeeeed",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#d1cdc9" }}>{String(outsideDay).padStart(2,"0")}</span>
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
                | { kind: "deadline"; event: any; dtype: typeof DEADLINE_TYPES[number] }
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
                    "aria-label": `Dia ${day} — ver eventos`,
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
                  style={{
                    height: cellHeight, padding: isMobile ? "5px 5px" : "7px 7px",
                    // Ver o comentario da trilha: item de grid tambem tem
                    // min-width automatico, e sem zera-lo a pill de nome longo
                    // volta a esticar a coluna.
                    minWidth: 0,
                    borderRight: col !== 6 ? "1px solid #eeeeed" : undefined,
                    borderBottom: "1px solid #eeeeed",
                    backgroundColor: P.surface,
                    cursor: hasAny ? "pointer" : "default",
                    display: "flex", flexDirection: "column", gap: 3,
                    outline: isToday ? "2px solid rgba(249,115,22,0.2)" : undefined,
                    outlineOffset: "-2px",
                    transition: "background 0.1s",
                    position: "relative",
                  }}
                  onMouseEnter={e => { if (hasAny) (e.currentTarget.style.backgroundColor = "#f9f9f8"); }}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = P.surface)}
                >
                  {/* Day number — #c2410c: branco sobre o #f97316 saturado
                      ficava em ~2,8:1, abaixo do AA. */}
                  <div style={{ marginBottom: 2 }}>
                    {isToday ? (
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%",
                        backgroundColor: "#c2410c", color: "#ffffff",
                        fontSize: 11, fontWeight: 900,
                      }}>{day}</span>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 800, color: P.text }}>{String(day).padStart(2,"0")}</span>
                    )}
                  </div>

                  {/* No celular a célula de 62px não comporta pill legível:
                      cada item vira uma barra na cor da prioridade/prazo e o
                      detalhe fica no dialog do dia (que já existe). */}
                  {isMobile ? (
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
                          <span style={{ fontSize: 10, fontWeight: 700, color: P.secondary }}>+{allCellItems.length - 3}</span>
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
                                backgroundColor: isCrit ? "#fef2f2" : "#ffffff",
                                border: "none",
                                borderLeft: `3px solid ${meta.dot}`,
                                borderRadius: 6,
                                boxShadow: "0 1px 3px rgba(0,0,0,0.07)",
                                overflow: "hidden", cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              <span style={{ display: "flex", alignItems: "center", gap: 4, overflow: "hidden", flex: 1 }}>
                                {isStart
                                  ? <Calendar style={{ width: 9, height: 9, color: P.muted, flexShrink: 0 }} />
                                  : <Truck    style={{ width: 9, height: 9, color: P.muted, flexShrink: 0 }} />}
                                <span style={{ fontSize: 10, fontWeight: 700, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {ev.name}
                                </span>
                              </span>
                              {isUrgent && (
                                <span style={{ fontSize: 10, fontWeight: 900, color: "#ffffff", backgroundColor: isCrit ? "#dc2626" : "#c2410c", borderRadius: 6, padding: "1px 4px", whiteSpace: "nowrap", flexShrink: 0 }}>
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
                                borderRadius: 6,
                                overflow: "hidden", cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              <Flag style={{ width: 9, height: 9, color: dtype.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 10, fontWeight: 700, color: dtype.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {dtype.short}
                              </span>
                            </button>
                          );
                        }
                      })}
                      {allCellItems.length > 2 && (
                        <span style={{ fontSize: 10, color: P.secondary, paddingLeft: 2 }}>+{allCellItems.length - 2} mais</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Legend footer ── */}
        <div style={{ padding: "14px 32px", borderTop: "1px solid #eeeeed", backgroundColor: "#f9f9f8", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 }}>
          {/* Priority legend */}
          {LEGEND_PRIOS.map(({ label, dot }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", backgroundColor: dot }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: P.secondary, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
            </div>
          ))}

          {/* Divider */}
          <div style={{ width: 1, height: 16, backgroundColor: "#e7e5e4", margin: "0 4px" }} />

          {/* Deadline legend — só os marcos que a grade está DESENHANDO. Uma
              legenda com seis entradas sobre uma grade com dois seria mentira. */}
          {tiposVisiveis.map(dt => (
            <div key={dt.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 14, height: 9, borderRadius: 6, borderLeft: `3px dashed ${dt.color}`, backgroundColor: `${dt.color}15` }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: P.secondary, textTransform: "uppercase", letterSpacing: "0.07em" }}>{dt.short}</span>
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
              style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 24, padding: "0 9px", borderRadius: 999, border: `1px dashed ${verTodosOsMarcos ? "#c2410c" : "#d6d3d1"}`, background: verTodosOsMarcos ? "#fff7ed" : "transparent", color: verTodosOsMarcos ? "#c2410c" : P.secondary, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", cursor: "pointer", font: "inherit", whiteSpace: "nowrap" }}
            >
              {verTodosOsMarcos ? "Só os da minha função" : `Todos os marcos (${DEADLINE_TYPES.length})`}
            </button>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: 11, color: P.secondary }}>Início</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Truck style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: 11, color: P.secondary }}>Saída Logística</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <Flag style={{ width: 12, height: 12, color: P.muted }} />
              <span style={{ fontSize: 11, color: P.secondary }}>Prazo de Layout</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Secondary grid: Próximos Eventos + Resumo do Mês ── */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr minmax(220px, 300px)", gap: 20, alignItems: "start" }}>

        {/* Próximos Eventos */}
        <div style={{ backgroundColor: "#f0efee", borderRadius: 12, padding: 24, position: "relative", overflow: "hidden" }}>
          {/* watermark icon */}
          <div style={{ position: "absolute", right: -20, bottom: -20, opacity: 0.05, pointerEvents: "none" }}>
            <Truck style={{ width: 160, height: 160, color: "#1c1917" }} />
          </div>
          <div style={{ position: "relative" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800, color: P.text, textTransform: "uppercase", letterSpacing: "-0.02em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Próximos Eventos
            </h3>
            {upcomingEvents.length === 0 ? (
              <p style={{ fontSize: 13, color: P.secondary }}>Nenhum evento futuro no momento.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {upcomingEvents.map(ev => {
                  const dep = toUTCDisplayDate(ev.truckDepartureDate);
                  const meta = prioMeta(ev);
                  return (
                    <div key={ev.id}
                      data-testid={`upcoming-event-${ev.id}`}
                      role="link" tabIndex={0} aria-label={`Abrir evento ${ev.name}`} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); setLocation(`/eventos/${ev.id}`); } }} onClick={() => setLocation(`/eventos/${ev.id}`)}
                      style={{ backgroundColor: "#ffffff", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderLeft: `4px solid ${meta.dot}`, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#ffffff")}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: P.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.name}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 11, color: P.secondary }}>
                          Saída: {dep.toLocaleDateString("pt-BR")} às {dep.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: meta.text, backgroundColor: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Resumo do Mês */}
        <div style={{ backgroundColor: "#1c1917", borderRadius: 12, padding: 24, color: "#ffffff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#ffffff", textTransform: "uppercase", letterSpacing: "-0.01em", fontFamily: "'Space Grotesk', sans-serif" }}>
                Resumo do Mês
              </h3>
              {/* A REGRA, ESCRITA. O filtro era pela data de INICIO e a grade
                  desenha pela SAIDA DO CAMINHAO: um evento que comeca em 12/09
                  com caminhao em 09/09 tem tres prazos em agosto — aparecia na
                  grade de agosto e nao entrava no Resumo de agosto. Agora os
                  dois contam o mesmo conjunto, e a linha diz qual e. */}
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                Eventos que aparecem na grade
              </p>
            </div>
            <BarChart2 style={{ width: 18, height: 18, color: P.accent }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[
              { label: "Total de Eventos", value: monthEvents.length, color: P.accent },
              { label: "Concluídos",       value: completedCount,     color: "#22c55e" },
              { label: "Encerrados",       value: closedCount,        color: "#d6d3d1" },
              { label: "Urgentes",         value: urgentCount,        color: "#dc2626" },
              { label: "Em andamento",     value: ongoingCount,       color: "#ffffff" },
            ].map(({ label, value, color }, i, arr) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none" }}>
                <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{label}</span>
                <span style={{ fontSize: 15, fontWeight: 800, color }}>{value}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            style={{ marginTop: 20, width: "100%", padding: "11px 0", backgroundColor: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: "#ffffff", fontSize: 11, fontWeight: 900, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em" }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.12)")}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.07)")}>
            Ver Mês Atual
          </button>
        </div>
      </div>

      {/* ── Day detail dialog ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 480, maxHeight: "80vh", overflowY: "auto" }}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 15, fontWeight: 700, color: P.text, display: "flex", alignItems: "center", gap: 8 }}>
              <Calendar style={{ width: 16, height: 16, color: P.accent }} />
              {selectedDate?.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </DialogTitle>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
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
                  style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", backgroundColor: P.surface, border: `1px solid ${P.border}`, borderLeft: `4px solid ${meta.dot}`, borderRadius: 8, cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = P.bg)}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = P.surface)}
                >
                  <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, backgroundColor: P.bg, border: `1px solid ${P.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {isStart ? <Calendar style={{ width: 14, height: 14, color: P.secondary }} /> : <Truck style={{ width: 14, height: 14, color: P.secondary }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: P.text, margin: 0 }}>{ev.name}</p>
                      <span style={{ fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", color: meta.text, backgroundColor: meta.bg, border: `1px solid ${meta.border}`, borderRadius: 6, padding: "2px 6px" }}>
                        {meta.label}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, color: P.secondary, margin: "4px 0 0" }}>
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
                  <div style={{ borderTop: "1px solid #eeeeed", paddingTop: 6, paddingBottom: 2 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, color: P.secondary, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                      Prazos de Layout
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
                      style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", backgroundColor: `${dtype.color}08`, border: `1px solid ${P.border}`, borderLeft: `4px solid ${dtype.color}`, borderRadius: 8, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${dtype.color}14`)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = `${dtype.color}08`)}
                    >
                      <div style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, backgroundColor: `${dtype.color}15`, border: `1px solid ${dtype.color}30`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Flag style={{ width: 14, height: 14, color: dtype.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <p style={{ fontSize: 15, fontWeight: 600, color: P.text, margin: 0 }}>{event.name}</p>
                          <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: "nowrap", color: "#ffffff", backgroundColor: dtype.color, borderRadius: 6, padding: "2px 8px" }}>
                            {dtype.short}
                          </span>
                        </div>
                        <p style={{ fontSize: 13, color: P.secondary, margin: "4px 0 0" }}>
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
  const [h, setH] = useState(false);
  const size = big ? 44 : 34;
  return (
    <button onClick={onClick} data-testid={testId} aria-label={label}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ width: size, height: size, borderRadius: "50%", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: h ? "#eeeeed" : "transparent", color: "#1c1917", transition: "background 0.12s" }}>
      {children}
    </button>
  );
}
