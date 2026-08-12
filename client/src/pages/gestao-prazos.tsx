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
  worstOverdueDays: number;
}

interface PrazosPayload {
  generatedAt: string;
  events: PrazoEvent[];
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

// status da peça → índice da etapa (espelho do servidor, só p/ agrupar chips)
const STATUS_STAGE: Record<string, number> = {
  draft: 0, requested: 0, awaiting_linking: 0,
  awaiting_submission: 1,
  awaiting_approval: 2, awaiting_sponsor_approval: 2,
  awaiting_finalization: 3, sponsor_approved: 3,
  awaiting_final_review: 3, awaiting_review: 3, in_review: 3, awaiting_creator_review: 3,
  ready_for_production: 4, approved: 4, inProduction: 4, produced: 4, conferred: 4,
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
function StageCell({ stage }: { stage: PrazoStage }) {
  const st = STAGE_STYLE[stage.state];
  const statusText =
    stage.state === "done" ? "concluída"
    : stage.state === "overdue" ? `vencida há ${Math.abs(stage.diffDays)}d com ${stage.pendingCount} peça${stage.pendingCount !== 1 ? "s" : ""} pendente${stage.pendingCount !== 1 ? "s" : ""}`
    : stage.state === "warning" ? `vence em ${stage.diffDays}d com ${stage.pendingCount} pendente${stage.pendingCount !== 1 ? "s" : ""}`
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
        {fmtDayMonth(stage.deadline)}
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

  if (groups.length === 0) {
    return (
      <p style={{ margin: 0, padding: "10px 0", fontSize: 13, color: TI.secondary }}>
        Nenhuma peça pendente — todas entregues ou fora do funil.
      </p>
    );
  }

  const CHIP_CAP = 12;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "4px 0 8px" }}>
      {groups.map(({ stage, items }) => {
        const sector = STAGE_SECTOR[stage.key];
        const st = STAGE_STYLE[stage.state];
        const shown = items.slice(0, CHIP_CAP);
        const hidden = items.length - shown.length;
        const sectorUrl = sector.url ?? `/eventos/${ev.id}`;
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
                {stage.state === "warning" && ` · vence em ${stage.diffDays}d`}
              </span>
              <Link
                href={sectorUrl}
                style={{ fontSize: 12, fontWeight: 600, color: "#9a3412", textDecoration: "none" }}
                data-testid={`link-setor-${ev.id}-${stage.key}`}
              >
                Resolver em {sector.sector} →
              </Link>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {shown.map((it) => (
                <Link
                  key={it.id}
                  href={`/eventos/${ev.id}?item=${it.id}`}
                  title={`${it.displayId} — ${getStatusLabel(it.status)} (${it.type})`}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 9px", borderRadius: 999,
                    backgroundColor: "#f5f5f4", border: `1px solid ${TI.border}`,
                    fontSize: 11, fontWeight: 600, color: "#57534e",
                    textDecoration: "none", lineHeight: 1.5,
                  }}
                >
                  {it.displayId}
                  <span style={{ fontWeight: 500, color: TI.label }}>{getStatusLabel(it.status)}</span>
                </Link>
              ))}
              {hidden > 0 && (
                <Link
                  href={`/eventos/${ev.id}`}
                  style={{
                    display: "inline-flex", alignItems: "center",
                    padding: "3px 9px", borderRadius: 999,
                    backgroundColor: "transparent", border: `1px dashed ${TI.idle}`,
                    fontSize: 11, fontWeight: 600, color: TI.secondary, textDecoration: "none",
                  }}
                >
                  +{hidden} no evento
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────────────
function KpiCard({
  label, value, tone, active, onClick, testId,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "neutral";
  active?: boolean;
  onClick?: () => void;
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

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      aria-pressed={clickable ? !!active : undefined}
      data-testid={testId}
      style={{
        textAlign: "left", cursor: clickable ? "pointer" : "default",
        backgroundColor: TI.card, borderRadius: 12,
        border: active ? `1.5px solid ${colors.ring}` : `1px solid ${TI.border}`,
        padding: "14px 16px", minWidth: 0,
        boxShadow: active ? "0 4px 12px rgba(28,25,23,0.07)" : "0 1px 3px rgba(28,25,23,0.04)",
        transition: "box-shadow 0.12s ease, border-color 0.12s ease",
      }}
    >
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
  useEffect(() => {
    const p = new URLSearchParams();
    if (soAtrasados) p.set("atrasados", "1");
    if (busca) p.set("q", busca);
    if (prioridade !== "all") p.set("prioridade", prioridade);
    const qs = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
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
    const pecasAtrasadas = events.reduce((acc, ev) =>
      acc + ev.stages.reduce((a, s) => a + (s.state === "overdue" ? s.directCount : 0), 0), 0);
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
                    <StageCell stage={s} />
                    <span style={{ display: "block", fontSize: 9, color: TI.label, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.label.split(" ")[0]}
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
                aria-controls={`drill-${ev.id}`}
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
                    <td style={{ padding: "12px 8px 12px 18px", verticalAlign: "middle" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        {prio && (
                          <span title={`Prioridade: ${prio.label}`} aria-hidden="true" style={{
                            width: 8, height: 8, borderRadius: 4, backgroundColor: prio.dot, flexShrink: 0,
                          }} />
                        )}
                        <Link
                          href={`/eventos/${ev.id}`}
                          data-testid={`link-evento-${ev.id}`}
                          style={{
                            fontSize: 13, fontWeight: 800, color: TI.title, textDecoration: "none",
                            fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
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
                        <StageCell stage={s} />
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
                        aria-controls={`drill-${ev.id}`}
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
            <KpiCard label="Peças em etapa vencida" value={kpis.pecasAtrasadas} tone="red" testId="kpi-pecas-atrasadas" />
            <KpiCard label="Eventos em dia" value={kpis.emDia} tone="green" testId="kpi-em-dia" />
          </div>
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
