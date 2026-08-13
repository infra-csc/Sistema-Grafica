// Gestão de Prazos — visão do diretor. Responde em uma tela: o que está
// atrasado, o quanto, e quem está travando. Todo o cálculo de marcos vive no
// servidor (GET /api/prazos); aqui só se filtra e se pinta.
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, Fragment } from "react";
import { Link } from "wouter";
import {
  Truck, ChevronDown, RotateCcw, Search, CalendarRange,
  AlertTriangle, CheckCircle2,
} from "lucide-react";
import { toUTCDisplayDate } from "@/lib/utils";
import { getStatusLabel, getPriorityMeta } from "@/lib/status";
import { useIsMobile } from "@/hooks/use-mobile";

// ─── Tipos do payload de /api/prazos ─────────────────────────────────────────
type StageState = "done" | "upcoming" | "warning" | "overdue";

interface PrazoStage {
  key: string;
  label: string;
  deadline: string; // YYYY-MM-DD
  diffDays: number;
  pendingCount: number; // travadas aqui OU em etapa anterior (gate real)
  directCount: number;  // travadas exatamente aqui
  state: StageState;
}

interface PrazoPendingItem {
  id: string;
  displayId: string;
  status: string;
  type: string;
  description: string | null;
  quantity: number;
  waitingDays: number;
  pendingSponsors?: { name: string; days: number }[];
}

interface SponsorDelay {
  sponsorId: string;
  name: string;
  pendingCount: number;
  maxDays: number;
  eventCount: number;
}

interface PrazoEvent {
  id: string;
  name: string;
  priority: string | null;
  startDate: string;
  truckDepartureDate: string;
  invalidDate: boolean;
  totalItems: number;
  deliveredItems: number;
  stages: PrazoStage[];
  pendingItems: PrazoPendingItem[];
}

interface PrazosPayload {
  generatedAt: string;
  events: PrazoEvent[];
  sponsorDelays: SponsorDelay[];
}

// ─── Paleta (Titanium, igual às demais telas) ────────────────────────────────
const TI = {
  bg: "#fafaf9", card: "#ffffff", border: "#e7e5e4",
  title: "#1c1917", secondary: "#746e69", label: "#78716c",
  red: "#b91c1c", redBg: "#fef2f2",
  amber: "#b45309", amberBg: "#fffbeb",
  green: "#15803d", greenBg: "#f0fdf4",
  idle: "#d6d3d1",
};

// Aparência de cada estado do semáforo. O texto acompanha a cor, mas o
// SÍMBOLO também muda (✓ / ! / nº) — atraso não pode depender só de cor.
const STAGE_STYLE: Record<StageState, { dot: string; bg: string; text: string }> = {
  done:     { dot: TI.green, bg: TI.greenBg, text: TI.green },
  warning:  { dot: TI.amber, bg: TI.amberBg, text: TI.amber },
  overdue:  { dot: TI.red,   bg: TI.redBg,   text: TI.red },
  upcoming: { dot: TI.idle,  bg: "transparent", text: TI.secondary },
};

// Para cada etapa, o setor que destrava e a tela onde se age.
// listaImagens aponta para o detalhe do evento (peças nascem lá).
const STAGE_SECTOR: Record<string, { sector: string; url: string | null }> = {
  listaImagens: { sector: "Solicitação", url: null }, // null = detalhe do evento
  layouts:      { sector: "Arte",        url: "/arte" },
  aprovacao:    { sector: "Atendimento", url: "/atendimento" },
  revisao:      { sector: "Revisão",     url: "/solicitacao" },
  producao:     { sector: "Gráfica",     url: "/grafica" },
};

// status da peça → índice da etapa (espelho do servidor, só p/ agrupar chips).
// Inclui as grafias LEGADAS em pt que circulam no banco — sem elas o
// drill-down descartava em silêncio peças que o servidor mandou.
const STATUS_STAGE: Record<string, number> = {
  draft: 0, requested: 0, awaiting_linking: 0,
  awaiting_submission: 1,
  awaiting_approval: 2, awaiting_sponsor_approval: 2,
  awaiting_finalization: 3, sponsor_approved: 3,
  awaiting_final_review: 3, awaiting_review: 3, in_review: 3, awaiting_creator_review: 3,
  ready_for_production: 4, approved: 4, inProduction: 4, produced: 4, conferred: 4,
  pronto_para_producao: 4, liberado: 4, em_producao: 4, produzido: 4,
};

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtDayMonth(dateOnly: string): string {
  const [, m, d] = dateOnly.split("-");
  return `${d}/${m}`;
}

function fmtSaida(iso: string): string {
  const d = toUTCDisplayDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

// Countdown da saída — mesma régua (e o mesmo guard de data absurda) do Painel.
function saidaChip(ev: PrazoEvent): { text: string; color: string; bg: string } {
  if (ev.invalidDate) {
    return { text: "Data de saída inválida — corrija o evento", color: TI.red, bg: TI.redBg };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const truckDay = toUTCDisplayDate(ev.truckDepartureDate); truckDay.setHours(0, 0, 0, 0);
  const diff = Math.round((truckDay.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: `Saída atrasada ${Math.abs(diff)}d`, color: TI.red, bg: TI.redBg };
  if (diff === 0) return { text: "Sai hoje", color: TI.amber, bg: TI.amberBg };
  return { text: `Faltam ${diff}d`, color: TI.secondary, bg: "#f5f5f4" };
}

function eventHasOverdue(ev: PrazoEvent): boolean {
  return ev.stages.some((s) => s.state === "overdue");
}

// ─── Célula do semáforo ──────────────────────────────────────────────────────
function StageCell({ stage, invalidDate }: { stage: PrazoStage; invalidDate?: boolean }) {
  const st = STAGE_STYLE[stage.state];
  const statusText =
    invalidDate ? "sem data confiável — corrija a saída do evento"
    : stage.state === "done" ? "concluída"
    : stage.state === "overdue" ? `vencida há ${Math.abs(stage.diffDays)}d com ${stage.pendingCount} peça${stage.pendingCount !== 1 ? "s" : ""} pendente${stage.pendingCount !== 1 ? "s" : ""}`
    : stage.state === "warning" ? (stage.diffDays === 0 ? `vence hoje com ${stage.pendingCount} pendente${stage.pendingCount !== 1 ? "s" : ""}` : `vence em ${stage.diffDays}d com ${stage.pendingCount} pendente${stage.pendingCount !== 1 ? "s" : ""}`)
    : `prevista para ${fmtDayMonth(stage.deadline)}`;

  return (
    <div
      title={`${stage.label}: ${statusText}`}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "2px 0" }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          minWidth: 22, height: 22, padding: "0 5px", borderRadius: 11,
          backgroundColor: stage.state === "upcoming" ? "#f5f5f4" : st.bg,
          border: `1.5px solid ${st.dot}`,
          fontSize: 11, fontWeight: 800, color: st.text,
          fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1,
        }}
      >
        {stage.state === "done" ? "✓" : stage.state === "overdue" ? `${Math.abs(stage.diffDays)}d` : stage.pendingCount}
      </span>
      <span style={{ fontSize: 10, color: stage.state === "overdue" ? TI.red : TI.label, fontWeight: stage.state === "overdue" ? 700 : 500 }}>
        {invalidDate ? "—" : fmtDayMonth(stage.deadline)}
      </span>
      <span className="sr-only">{stage.label}: {statusText}</span>
    </div>
  );
}

// ─── Drill-down de um evento ────────────────────────────────────────────────
function EventDrilldown({ ev }: { ev: PrazoEvent }) {
  // Agrupa as peças pendentes por etapa; só etapas com peça travada NELA.
  const groups = useMemo(() => {
    const byStage = new Map<number, PrazoPendingItem[]>();
    for (const it of ev.pendingItems) {
      const rank = STATUS_STAGE[it.status];
      if (rank === undefined) continue;
      const arr = byStage.get(rank);
      if (arr) arr.push(it); else byStage.set(rank, [it]);
    }
    return ev.stages
      .map((stage, i) => ({ stage, items: byStage.get(i) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [ev]);

  if (ev.totalItems === 0) {
    return (
      <p style={{ margin: 0, padding: "10px 0", fontSize: 13, color: TI.secondary }}>
        Nenhuma peça cadastrada ainda —{" "}
        <Link href={`/eventos/${ev.id}`} style={{ color: "#9a3412", fontWeight: 600 }}>
          cadastre as peças no evento
        </Link>{" "}
        para o funil começar a contar.
      </p>
    );
  }

  if (groups.length === 0) {
    return (
      <p style={{ margin: 0, padding: "10px 0", fontSize: 13, color: TI.secondary }}>
        Nenhuma peça pendente — todas entregues ou fora do funil.
      </p>
    );
  }

  const ROW_CAP = 15;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0 8px" }}>
      {groups.map(({ stage, items }) => {
        const sector = STAGE_SECTOR[stage.key];
        const st = STAGE_STYLE[stage.state];
        // Pior primeiro: a lista é de cobrança, quem espera há mais tempo abre.
        const sorted = [...items].sort((a, b) => b.waitingDays - a.waitingDays);
        const shown = sorted.slice(0, ROW_CAP);
        const hidden = sorted.length - shown.length;
        const sectorUrl = sector.url ?? `/eventos/${ev.id}`;
        const isAprovacao = stage.key === "aprovacao";
        return (
          <div key={stage.key}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: st.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: TI.title }}>
                {stage.label}
              </span>
              <span style={{ fontSize: 12, color: stage.state === "overdue" ? TI.red : TI.secondary, fontWeight: stage.state === "overdue" ? 700 : 500 }}>
                {items.length} peça{items.length !== 1 ? "s" : ""}
                {stage.state === "overdue" && ` · vencida há ${Math.abs(stage.diffDays)}d`}
                {stage.state === "warning" && (stage.diffDays === 0 ? " · vence hoje" : ` · vence em ${stage.diffDays}d`)}
              </span>
              <Link
                href={sectorUrl}
                style={{ fontSize: 12, fontWeight: 600, color: "#9a3412", textDecoration: "none" }}
                data-testid={`link-setor-${ev.id}-${stage.key}`}
              >
                Resolver em {sector.sector} →
              </Link>
            </div>
            <div style={{ overflowX: "auto", border: `1px solid ${TI.border}`, borderRadius: 8, backgroundColor: TI.card }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isAprovacao ? 560 : 420 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
                    <th scope="col" style={DRILL_TH}>Peça</th>
                    <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Descrição</th>
                    <th scope="col" style={DRILL_TH}>Qtd</th>
                    <th scope="col" style={DRILL_TH}>Parada há</th>
                    {isAprovacao && <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Aguardando patrocinador</th>}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((it) => (
                    <tr key={it.id} style={{ borderBottom: `1px solid #f0efee` }}>
                      <td style={{ padding: "6px 10px", whiteSpace: "nowrap" }}>
                        <Link
                          href={`/eventos/${ev.id}?item=${it.id}`}
                          title={`Abrir ${it.displayId} no evento`}
                          style={{ fontSize: 12, fontWeight: 700, color: "#9a3412", textDecoration: "none" }}
                        >
                          {it.displayId}
                        </Link>
                        <span style={{ display: "block", fontSize: 10, color: TI.label }}>
                          {getStatusLabel(it.status)}
                        </span>
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: "#57534e", maxWidth: 240 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.description ?? it.type}>
                          {it.type}{it.description ? ` — ${it.description}` : ""}
                        </span>
                      </td>
                      <td style={{ padding: "6px 10px", fontSize: 12, color: "#57534e", textAlign: "center" }}>
                        {it.quantity}
                      </td>
                      <td style={{
                        padding: "6px 10px", textAlign: "center", whiteSpace: "nowrap",
                        fontSize: 12, fontWeight: 700,
                        color: it.waitingDays >= 7 ? TI.red : it.waitingDays >= 3 ? TI.amber : "#57534e",
                      }}>
                        {it.waitingDays === 0 ? "hoje" : `${it.waitingDays}d`}
                      </td>
                      {isAprovacao && (
                        <td style={{ padding: "6px 10px", fontSize: 12, color: "#57534e" }}>
                          {it.pendingSponsors && it.pendingSponsors.length > 0
                            ? it.pendingSponsors.map((s, i) => (
                                <span key={`${it.id}-${s.name}`} style={{ whiteSpace: "nowrap" }}>
                                  {i > 0 && ", "}
                                  <strong style={{ color: s.days >= 7 ? TI.red : TI.title }}>{s.name}</strong>
                                  <span style={{ color: TI.label }}> ({s.days === 0 ? "hoje" : `${s.days}d`})</span>
                                </span>
                              ))
                            : <span style={{ color: TI.label }}>—</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hidden > 0 && (
              <Link
                href={`/eventos/${ev.id}`}
                style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 600, color: TI.secondary, textDecoration: "none" }}
              >
                +{hidden} peça{hidden !== 1 ? "s" : ""} nesta etapa — ver todas no evento →
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DRILL_TH: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 9, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: TI.label, textAlign: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
};

// ─── KPI card ───────────────────────────────────────────────────────────────
// Informativo vira <div> (button disabled sai da ordem de tab e leitores
// anunciam "indisponível" para algo que não é ação nenhuma).
function KpiCard({
  label, value, tone, active, onClick, title, testId,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "neutral";
  active?: boolean;
  onClick?: () => void;
  title?: string;
  testId: string;
}) {
  const colors = {
    red: { num: TI.red, ring: TI.red },
    amber: { num: TI.amber, ring: TI.amber },
    green: { num: TI.green, ring: TI.green },
    neutral: { num: TI.title, ring: "#a8a29e" },
  }[tone];
  const clickable = !!onClick;
  const zero = value === 0;

  const cardStyle: React.CSSProperties = {
    textAlign: "left", cursor: clickable ? "pointer" : "default",
    backgroundColor: TI.card, borderRadius: 12,
    border: active ? `1.5px solid ${colors.ring}` : `1px solid ${TI.border}`,
    padding: "14px 16px", minWidth: 0,
    boxShadow: active ? "0 4px 12px rgba(28,25,23,0.07)" : "0 1px 3px rgba(28,25,23,0.04)",
    transition: "box-shadow 0.12s ease, border-color 0.12s ease",
  };

  const content = (
    <>
      <span style={{
        display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "0.1em", color: TI.label, marginBottom: 6,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 30, fontWeight: 800, lineHeight: 1,
        fontFamily: "'Space Grotesk', sans-serif",
        color: zero && tone !== "green" ? TI.label : colors.num,
      }}>
        {value}
      </span>
    </>
  );

  if (!clickable) {
    return <div title={title} data-testid={testId} style={cardStyle}>{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!active}
      title={title}
      data-testid={testId}
      style={cardStyle}
    >
      {content}
    </button>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────
export default function GestaoPrazos() {
  const isMobile = useIsMobile();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<PrazosPayload>({
    queryKey: ["/api/prazos"],
  });

  // Filtros com estado inicial vindo da URL (padrão das outras telas).
  const initial = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return {
      soAtrasados: p.get("atrasados") === "1",
      busca: p.get("q") ?? "",
      prioridade: p.get("prioridade") ?? "all",
    };
  }, []);
  const [soAtrasados, setSoAtrasados] = useState(initial.soAtrasados);
  const [busca, setBusca] = useState(initial.busca);
  const [prioridade, setPrioridade] = useState(initial.prioridade);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Espelha filtros na URL sem empilhar histórico (preserva o hash).
  // Debounce: replaceState a cada tecla estoura o rate-limit do Safari
  // (~100 chamadas/30s lançam SecurityError e derrubam a árvore React).
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (soAtrasados) p.set("atrasados", "1");
      if (busca) p.set("q", busca);
      if (prioridade !== "all") p.set("prioridade", prioridade);
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [soAtrasados, busca, prioridade]);

  const events = data?.events ?? [];

  // KPIs sobre o conjunto COMPLETO (filtro não muda o placar).
  const kpis = useMemo(() => {
    const atrasados = events.filter(eventHasOverdue);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const saidas7d = events.filter((ev) => {
      if (ev.invalidDate) return false;
      const d = toUTCDisplayDate(ev.truckDepartureDate); d.setHours(0, 0, 0, 0);
      const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
      return diff >= 0 && diff <= 7;
    });
    // Por evento: a etapa vencida MAIS AVANÇADA, com sua pendência acumulada
    // (peça presa em etapa anterior também está atrasada para esse marco).
    // Somar directCount daria "0 peças" com N eventos atrasados quando o
    // gargalo está todo em etapas anteriores à vencida.
    const pecasAtrasadas = events.reduce((acc, ev) => {
      const overdueStages = ev.stages.filter((s) => s.state === "overdue");
      const worst = overdueStages[overdueStages.length - 1];
      return acc + (worst ? worst.pendingCount : 0);
    }, 0);
    return {
      atrasados: atrasados.length,
      saidas7d: saidas7d.length,
      pecasAtrasadas,
      emDia: events.length - atrasados.length,
    };
  }, [events]);

  const prioridadesDisponiveis = useMemo(
    () => Array.from(new Set(events.map((e) => e.priority).filter(Boolean))) as string[],
    [events],
  );

  // Gargalo por setor (cross-evento, sobre o conjunto completo): quantas
  // peças estão paradas na mesa de cada setor agora e há quanto tempo.
  const sectorSummary = useMemo(() => {
    const acc = STAGE_HEADERS.map((h) => ({
      key: h.key,
      sector: STAGE_SECTOR[h.key].sector,
      stageLabel: h.full,
      url: STAGE_SECTOR[h.key].url,
      count: 0,
      totalDays: 0,
      maxDays: 0,
      eventIds: new Set<string>(),
    }));
    for (const ev of events) {
      for (const it of ev.pendingItems) {
        const rank = STATUS_STAGE[it.status];
        if (rank === undefined) continue;
        const s = acc[rank];
        s.count += 1;
        s.totalDays += it.waitingDays;
        s.maxDays = Math.max(s.maxDays, it.waitingDays);
        s.eventIds.add(ev.id);
      }
    }
    const worst = acc.reduce((w, s) => (s.count > w ? s.count : w), 0);
    return acc.map((s) => ({
      ...s,
      avgDays: s.count > 0 ? Math.round(s.totalDays / s.count) : 0,
      eventCount: s.eventIds.size,
      isWorst: worst > 0 && s.count === worst,
    }));
  }, [events]);

  const sponsorDelays = data?.sponsorDelays ?? [];

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return events.filter((ev) => {
      if (soAtrasados && !eventHasOverdue(ev)) return false;
      if (prioridade !== "all" && ev.priority !== prioridade) return false;
      if (q && !ev.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, soAtrasados, prioridade, busca]);

  const hasActiveFilters = soAtrasados || busca.trim() !== "" || prioridade !== "all";
  const clearFilters = () => { setSoAtrasados(false); setBusca(""); setPrioridade("all"); };

  // ── Blocos de estado ──────────────────────────────────────────────────────
  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div aria-busy="true" aria-label="Carregando prazos" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="animate-pulse" style={{
            height: 64, borderRadius: 12, backgroundColor: "#f0efee",
            border: `1px solid ${TI.border}`,
          }} />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <div role="alert" style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12,
        padding: "36px 24px", textAlign: "center",
      }}>
        <AlertTriangle aria-hidden="true" style={{ width: 28, height: 28, color: TI.amber, margin: "0 auto 10px" }} />
        <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: TI.title }}>
          Não foi possível carregar os prazos
        </p>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: TI.secondary }}>
          {error instanceof Error && error.message
            ? error.message
            : "Verifique a conexão e tente novamente."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          data-testid="button-retry-prazos"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 18px", borderRadius: 9, border: "none",
            backgroundColor: "#1c1917", color: "#ffffff",
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
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12,
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
            display: "inline-flex", padding: "9px 18px", borderRadius: 9,
            backgroundColor: "#1c1917", color: "#ffffff",
            fontSize: 13, fontWeight: 700, textDecoration: "none",
          }}
        >
          Ver eventos
        </Link>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12,
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
            <p style={{ margin: "0 0 16px", fontSize: 13, color: TI.secondary }}>
              {events.length} evento{events.length !== 1 ? "s" : ""} ativo{events.length !== 1 ? "s" : ""} no total.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={clearFilters}
          data-testid="button-limpar-filtros"
          style={{
            padding: "9px 18px", borderRadius: 9, border: `1px solid ${TI.border}`,
            backgroundColor: TI.card, color: TI.title,
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}
        >
          Limpar filtros
        </button>
      </div>
    );
  } else if (isMobile) {
    // ── Cards mobile ────────────────────────────────────────────────────────
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((ev) => {
          const chip = saidaChip(ev);
          const expanded = expandedId === ev.id;
          const pct = ev.totalItems > 0 ? Math.round((ev.deliveredItems / ev.totalItems) * 100) : 0;
          return (
            <div key={ev.id} style={{
              backgroundColor: TI.card, border: `1px solid ${eventHasOverdue(ev) ? "#fecaca" : TI.border}`,
              borderRadius: 12, padding: 14,
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{
                    margin: 0, fontSize: 14, fontWeight: 800, color: TI.title,
                    fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {getPriorityMeta(ev.priority) && (
                      <span aria-hidden="true" style={{
                        display: "inline-block", width: 8, height: 8, borderRadius: 4,
                        backgroundColor: getPriorityMeta(ev.priority)!.dot, marginRight: 6,
                      }} />
                    )}
                    {ev.name}
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: TI.secondary, display: "flex", alignItems: "center", gap: 5 }}>
                    <Truck aria-hidden="true" style={{ width: 13, height: 13, flexShrink: 0 }} />
                    Saída: {fmtSaida(ev.truckDepartureDate)}
                  </p>
                </div>
                <span style={{
                  flexShrink: 0, padding: "3px 9px", borderRadius: 999,
                  backgroundColor: chip.bg, color: chip.color,
                  fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                }}>
                  {chip.text}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginTop: 12 }}>
                {ev.stages.map((s) => (
                  <div key={s.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                    <StageCell stage={s} invalidDate={ev.invalidDate} />
                    <span style={{ display: "block", fontSize: 9, color: TI.label, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {STAGE_SHORT[s.key] ?? s.label}
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TI.secondary, marginBottom: 4 }}>
                  <span>Peças prontas</span>
                  <span style={{ fontWeight: 700, color: TI.title }}>{ev.deliveredItems}/{ev.totalItems}</span>
                </div>
                <div aria-hidden="true" style={{ height: 5, borderRadius: 3, backgroundColor: "#f0efee", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, backgroundColor: pct === 100 ? TI.green : "#57534e" }} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : ev.id)}
                aria-expanded={expanded}
                // aria-controls só quando o alvo existe no DOM (o drill é
                // renderizado condicionalmente) — referência pendurada é erro de AT.
                aria-controls={expanded ? `drill-${ev.id}` : undefined}
                data-testid={`button-expandir-${ev.id}`}
                style={{
                  display: "flex", alignItems: "center", gap: 6, marginTop: 12,
                  padding: "7px 0", width: "100%", justifyContent: "center",
                  background: "none", border: "none", borderTop: `1px solid ${TI.border}`,
                  fontSize: 12, fontWeight: 700, color: "#57534e", cursor: "pointer",
                }}
              >
                <ChevronDown aria-hidden="true" style={{
                  width: 15, height: 15,
                  transform: expanded ? "rotate(180deg)" : "none",
                  transition: "transform 0.15s ease",
                }} />
                {expanded ? "Esconder pendências" : "Ver o que está travando"}
              </button>
              {expanded && <div id={`drill-${ev.id}`}><EventDrilldown ev={ev} /></div>}
            </div>
          );
        })}
      </div>
    );
  } else {
    // ── Tabela desktop ──────────────────────────────────────────────────────
    body = (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12,
        overflowX: "auto",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
              <th scope="col" style={{ ...TH_STYLE, textAlign: "left", paddingLeft: 18, minWidth: 220 }}>Evento</th>
              <th scope="col" style={{ ...TH_STYLE, textAlign: "left", minWidth: 150 }}>Saída</th>
              {STAGE_HEADERS.map((h) => (
                <th key={h.key} scope="col" style={{ ...TH_STYLE, minWidth: 78 }} title={h.full}>{h.short}</th>
              ))}
              <th scope="col" style={{ ...TH_STYLE, minWidth: 110 }}>Prontas</th>
              <th scope="col" style={{ ...TH_STYLE, width: 46 }}>
                <span className="sr-only">Detalhes</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev) => {
              const chip = saidaChip(ev);
              const expanded = expandedId === ev.id;
              const overdue = eventHasOverdue(ev);
              const pct = ev.totalItems > 0 ? Math.round((ev.deliveredItems / ev.totalItems) * 100) : 0;
              const prio = getPriorityMeta(ev.priority);
              return (
                <Fragment key={ev.id}>
                  <tr
                    style={{
                      borderBottom: expanded ? "none" : `1px solid #f0efee`,
                      backgroundColor: overdue ? "#fffafa" : "transparent",
                    }}
                  >
                    <td style={{ padding: "12px 8px 12px 18px", verticalAlign: "middle", maxWidth: 320 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        {prio && (
                          <span title={`Prioridade: ${prio.label}`} aria-hidden="true" style={{
                            width: 8, height: 8, borderRadius: 4, backgroundColor: prio.dot, flexShrink: 0,
                          }} />
                        )}
                        {/* minWidth 0 no flex item: sem ele o ellipsis nunca
                            dispara e um nome gigante alarga a coluna toda. */}
                        <Link
                          href={`/eventos/${ev.id}`}
                          data-testid={`link-evento-${ev.id}`}
                          title={ev.name}
                          style={{
                            fontSize: 13, fontWeight: 800, color: TI.title, textDecoration: "none",
                            fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            minWidth: 0, flex: "0 1 auto",
                          }}
                        >
                          {ev.name}
                        </Link>
                      </div>
                      <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 2 }}>
                        Início: {fmtSaida(ev.startDate)}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", verticalAlign: "middle" }}>
                      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#57534e" }}>
                        {fmtSaida(ev.truckDepartureDate)}
                      </span>
                      <span style={{
                        display: "inline-block", marginTop: 3, padding: "2px 8px", borderRadius: 999,
                        backgroundColor: chip.bg, color: chip.color, fontSize: 11, fontWeight: 700,
                      }}>
                        {chip.text}
                      </span>
                    </td>
                    {ev.stages.map((s) => (
                      <td key={s.key} style={{ padding: "10px 4px", verticalAlign: "middle", textAlign: "center" }}>
                        <StageCell stage={s} invalidDate={ev.invalidDate} />
                      </td>
                    ))}
                    <td style={{ padding: "12px 8px", verticalAlign: "middle", textAlign: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: TI.title, fontFamily: "'Space Grotesk', sans-serif" }}>
                        {ev.deliveredItems}/{ev.totalItems}
                      </span>
                      <div aria-hidden="true" style={{ height: 4, borderRadius: 2, backgroundColor: "#f0efee", overflow: "hidden", marginTop: 5 }}>
                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, backgroundColor: pct === 100 ? TI.green : "#57534e" }} />
                      </div>
                    </td>
                    <td style={{ padding: "12px 12px 12px 4px", verticalAlign: "middle", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : ev.id)}
                        aria-expanded={expanded}
                        aria-controls={expanded ? `drill-${ev.id}` : undefined}
                        aria-label={expanded ? `Esconder pendências de ${ev.name}` : `Ver pendências de ${ev.name}`}
                        data-testid={`button-expandir-${ev.id}`}
                        style={{
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          width: 30, height: 30, borderRadius: 8,
                          border: `1px solid ${TI.border}`, backgroundColor: TI.card, cursor: "pointer",
                        }}
                      >
                        <ChevronDown aria-hidden="true" style={{
                          width: 15, height: 15, color: "#57534e",
                          transform: expanded ? "rotate(180deg)" : "none",
                          transition: "transform 0.15s ease",
                        }} />
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr style={{ borderBottom: `1px solid #f0efee`, backgroundColor: "#fcfcfb" }}>
                      <td id={`drill-${ev.id}`} colSpan={9} style={{ padding: "4px 18px 12px" }}>
                        <EventDrilldown ev={ev} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: TI.bg, minHeight: "100%", padding: isMobile ? "16px 12px 32px" : "24px 24px 48px" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: TI.label }}>
                Atualizado às {new Date(data.generatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                data-testid="button-atualizar-prazos"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "8px 14px", borderRadius: 9, border: `1px solid ${TI.border}`,
                  backgroundColor: TI.card, color: isFetching ? TI.label : "#57534e",
                  fontSize: 12, fontWeight: 700, cursor: isFetching ? "default" : "pointer",
                }}
              >
                <RotateCcw aria-hidden="true" className={isFetching ? "animate-spin" : undefined} style={{ width: 14, height: 14 }} />
                {isFetching ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          )}
        </div>

        {/* KPIs */}
        {!isError && (
          <div style={{
            display: "grid", gap: 10, marginBottom: 16,
            gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))",
          }}>
            <KpiCard
              label="Eventos com atraso" value={kpis.atrasados} tone="red"
              active={soAtrasados} onClick={() => setSoAtrasados((v) => !v)}
              testId="kpi-atrasados"
            />
            <KpiCard label="Saídas em 7 dias" value={kpis.saidas7d} tone="amber" testId="kpi-saidas-7d" />
            <KpiCard
              label="Peças em etapa vencida" value={kpis.pecasAtrasadas} tone="red"
              title="Peças que ainda não passaram pela etapa vencida mais avançada de cada evento"
              testId="kpi-pecas-atrasadas"
            />
            <KpiCard label="Eventos em dia" value={kpis.emDia} tone="green" testId="kpi-em-dia" />
          </div>
        )}

        {/* Gargalo por setor */}
        {!isError && !isLoading && events.length > 0 && (
          <section aria-label="Gargalo por setor" style={{ marginBottom: 16 }}>
            <h2 style={{
              margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Onde as peças estão paradas agora
            </h2>
            <div style={{
              display: "grid", gap: 10,
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(5, minmax(0,1fr))",
            }}>
              {sectorSummary.map((s) => (
                <div
                  key={s.key}
                  data-testid={`setor-${s.key}`}
                  style={{
                    backgroundColor: TI.card, borderRadius: 12, padding: "12px 14px", minWidth: 0,
                    border: s.isWorst ? "1.5px solid #fca5a5" : `1px solid ${TI.border}`,
                  }}
                >
                  <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: TI.title, fontFamily: "'Space Grotesk', sans-serif" }}>
                    {s.sector}
                  </span>
                  <span style={{ display: "block", fontSize: 10, color: TI.label, marginBottom: 8 }}>
                    {s.stageLabel}
                  </span>
                  <span style={{
                    fontSize: 24, fontWeight: 800, lineHeight: 1,
                    fontFamily: "'Space Grotesk', sans-serif",
                    color: s.count === 0 ? TI.label : s.isWorst ? TI.red : TI.title,
                  }}>
                    {s.count}
                  </span>
                  <span style={{ fontSize: 11, color: TI.secondary, marginLeft: 5 }}>
                    peça{s.count !== 1 ? "s" : ""}
                  </span>
                  {s.count > 0 ? (
                    <span style={{ display: "block", fontSize: 11, color: s.maxDays >= 7 ? TI.red : TI.secondary, marginTop: 4 }}>
                      espera média {s.avgDays}d · pior {s.maxDays}d · {s.eventCount} evento{s.eventCount !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 4 }}>
                      mesa limpa
                    </span>
                  )}
                  {s.count > 0 && s.url && (
                    <Link href={s.url} style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 700, color: "#9a3412", textDecoration: "none" }}>
                      Abrir {s.sector} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Aprovações travadas por patrocinador */}
        {!isError && !isLoading && sponsorDelays.length > 0 && (
          <section aria-label="Aprovações travadas por patrocinador" style={{ marginBottom: 16 }}>
            <h2 style={{
              margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Aprovações travadas por patrocinador
            </h2>
            <div style={{ overflowX: "auto", backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
                    <th scope="col" style={{ ...DRILL_TH, textAlign: "left", paddingLeft: 14 }}>Patrocinador</th>
                    <th scope="col" style={DRILL_TH}>Peças aguardando</th>
                    <th scope="col" style={DRILL_TH}>Esperando há até</th>
                    <th scope="col" style={DRILL_TH}>Eventos</th>
                    <th scope="col" style={DRILL_TH}><span className="sr-only">Ação</span></th>
                  </tr>
                </thead>
                <tbody>
                  {sponsorDelays.map((sp) => (
                    <tr key={sp.sponsorId} style={{ borderBottom: `1px solid #f0efee` }}>
                      <td style={{ padding: "8px 10px 8px 14px", fontSize: 13, fontWeight: 700, color: TI.title }}>
                        {sp.name}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 13, fontWeight: 800, color: TI.red, fontFamily: "'Space Grotesk', sans-serif" }}>
                        {sp.pendingCount}
                      </td>
                      <td style={{
                        padding: "8px 10px", textAlign: "center", fontSize: 12, fontWeight: 700,
                        color: sp.maxDays >= 7 ? TI.red : sp.maxDays >= 3 ? TI.amber : "#57534e",
                      }}>
                        {sp.maxDays === 0 ? "hoje" : `${sp.maxDays}d`}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 12, color: TI.secondary }}>
                        {sp.eventCount}
                      </td>
                      <td style={{ padding: "8px 14px 8px 10px", textAlign: "right", whiteSpace: "nowrap" }}>
                        <Link href="/atendimento" style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textDecoration: "none" }}>
                          Cobrar no Atendimento →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Filtros */}
        {!isError && events.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ position: "relative", flex: isMobile ? "1 1 100%" : "0 1 280px" }}>
              <Search aria-hidden="true" style={{
                position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
                width: 14, height: 14, color: TI.label, pointerEvents: "none",
              }} />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar evento..."
                aria-label="Buscar evento pelo nome"
                data-testid="input-busca-prazos"
                style={{
                  width: "100%", padding: "8px 12px 8px 32px", borderRadius: 9,
                  border: `1px solid ${TI.border}`, backgroundColor: TI.card,
                  fontSize: 13, color: TI.title, outlineOffset: 2,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setSoAtrasados((v) => !v)}
              aria-pressed={soAtrasados}
              data-testid="toggle-so-atrasados"
              style={{
                padding: "8px 14px", borderRadius: 999,
                border: soAtrasados ? `1.5px solid ${TI.red}` : `1px solid ${TI.border}`,
                backgroundColor: soAtrasados ? TI.redBg : TI.card,
                color: soAtrasados ? TI.red : "#57534e",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
              }}
            >
              Só com atraso
            </button>
            {prioridadesDisponiveis.length > 0 && (
              <select
                value={prioridade}
                onChange={(e) => setPrioridade(e.target.value)}
                aria-label="Filtrar por prioridade"
                data-testid="select-prioridade-prazos"
                style={{
                  padding: "8px 10px", borderRadius: 9, border: `1px solid ${TI.border}`,
                  backgroundColor: TI.card, fontSize: 12, fontWeight: 600, color: "#57534e",
                  cursor: "pointer",
                }}
              >
                <option value="all">Todas as prioridades</option>
                {prioridadesDisponiveis.map((p) => (
                  <option key={p} value={p}>{getPriorityMeta(p)?.label ?? p}</option>
                ))}
              </select>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                data-testid="button-limpar-filtros-topo"
                style={{
                  padding: "8px 12px", borderRadius: 9, border: "none",
                  background: "none", color: "#9a3412", fontSize: 12, fontWeight: 700, cursor: "pointer",
                }}
              >
                Limpar
              </button>
            )}
            <span aria-live="polite" style={{ marginLeft: "auto", fontSize: 12, color: TI.secondary }}>
              {filtered.length} de {events.length} evento{events.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

        {body}
      </div>
    </div>
  );
}

// ─── Estilos e cabeçalhos da tabela (módulo: não realocar por render) ────────
const TH_STYLE: React.CSSProperties = {
  padding: "10px 8px",
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: TI.label, textAlign: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
};

const STAGE_HEADERS = [
  { key: "listaImagens", short: "Lista", full: "Lista de Imagens" },
  { key: "layouts", short: "Layouts", full: "Entrega de Layouts" },
  { key: "aprovacao", short: "Aprovação", full: "Aprovação de Layout" },
  { key: "revisao", short: "Revisão", full: "Revisão de Lista" },
  { key: "producao", short: "Produção", full: "Produção Gráfica" },
];

// Rótulo curto por etapa — o mobile usava label.split(" ")[0], que produzia
// "Entrega" para Entrega de Layouts (ambíguo com entrega de peças).
const STAGE_SHORT: Record<string, string> = Object.fromEntries(
  STAGE_HEADERS.map((h) => [h.key, h.short]),
);
