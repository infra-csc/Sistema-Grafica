// Gestão de Prazos — visão do diretor. Responde em uma tela: o que está
// atrasado, o quanto, e quem está travando. Todo o cálculo de marcos vive no
// servidor (GET /api/prazos); aqui só se filtra e se pinta.
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useMemo, useEffect, Fragment } from "react";
import { Link } from "wouter";
import {
  Truck, ChevronDown, RotateCcw, Search, CalendarRange,
  AlertTriangle, CheckCircle2, Megaphone,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { toUTCDisplayDate } from "@/lib/utils";
import { getStatusLabel, getPriorityMeta, PRIORITY } from "@/lib/status";
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
  stageIndex: number; // etapa calculada no servidor (fonte única)
  type: string;
  description: string | null;
  quantity: number;
  waitingDays: number; // dias sem movimento (updatedAt) — aproximação, ver servidor
  sponsors?: { name: string; days: number; holder: "sponsor" | "arte" }[];
}

interface SponsorDelay {
  sponsorId: string;
  name: string;
  pendingCount: number;
  maxDays: number;
  eventCount: number;
  items: { itemId: string; eventId: string; eventName: string; displayId: string; days: number }[];
}

interface PrazoKpis {
  atrasados: number;
  saidas7d: number;
  pecasAtrasadas: number;
  emDia: number;
  invalidCount: number;
}

type PrazoTrend = { atrasados: number; saidas7d: number; pecasAtrasadas: number; emDia: number } | null;

// Última cobrança registrada por alvo ("event:id" / "sponsor:id").
type CobrancaMap = Record<string, { userName: string; createdAt: string; daysAgo: number }>;

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
  riskCritical: boolean;
}

interface PrazosPayload {
  generatedAt: string;
  stageMeta: { key: string; label: string }[];
  events: PrazoEvent[];
  sponsorDelays: SponsorDelay[];
  kpis: PrazoKpis;
  trend: PrazoTrend;
  cobrancas: CobrancaMap;
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

// A etapa de cada peça vem do servidor (stageIndex) — o espelho local do
// mapa status→etapa foi removido de propósito: era duplicação que já furou
// uma vez (peças legadas descartadas em silêncio pelo drill).

// Cor dos dias de espera — régua ÚNICA dos três blocos: ≥7 vermelho, ≥3 âmbar.
function dayColor(days: number): string {
  return days >= 7 ? TI.red : days >= 3 ? TI.amber : "#57534e";
}

const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function fmtDayMonth(dateOnly: string): string {
  const [, m, d] = dateOnly.split("-");
  return `${d}/${m}`;
}

function fmtSaida(iso: string): string {
  const d = toUTCDisplayDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`;
}

// Countdown da saída — mesma régua (e o mesmo guard de data absurda) do
// Painel; "dias" por extenso como no event-detail (voz única entre telas).
function saidaChip(ev: PrazoEvent): { text: string; color: string; bg: string } {
  if (ev.invalidDate) {
    return { text: "Data de saída inválida — corrija o evento", color: TI.red, bg: TI.redBg };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const truckDay = toUTCDisplayDate(ev.truckDepartureDate); truckDay.setHours(0, 0, 0, 0);
  const diff = Math.round((truckDay.getTime() - today.getTime()) / 86400000);
  const dias = (n: number) => `${n} dia${n !== 1 ? "s" : ""}`;
  if (diff < 0) return { text: `Saída atrasada ${dias(Math.abs(diff))}`, color: TI.red, bg: TI.redBg };
  if (diff === 0) return { text: "Sai hoje", color: TI.amber, bg: TI.amberBg };
  return { text: `Faltam ${dias(diff)}`, color: TI.secondary, bg: "#f5f5f4" };
}

// Busca insensível a acento — "sao paulo" precisa achar "SÃO PAULO".
// Faixa de combining marks em vez de \p{M}: o target do tsconfig não aceita a flag u.
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "Atualizado há X" — hora absoluta de ontem ("18:40") é verdadeira e enganosa.
function fmtRelative(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "agora";
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 12) return `há ${hours}h`;
  const d = new Date(iso);
  return `em ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

// Setinha de tendência vs ontem. Para KPIs "ruins" (atrasados, peças), subir
// é vermelho e descer é verde; para "Eventos em dia" é o inverso.
function TrendArrow({ delta, goodWhenUp }: { delta: number | undefined; goodWhenUp?: boolean }) {
  if (delta === undefined || delta === 0) return null;
  const up = delta > 0;
  const good = goodWhenUp ? up : !up;
  return (
    <span
      title={`${up ? "+" : ""}${delta} em relação ao último registro`}
      style={{ fontSize: 12, fontWeight: 700, marginLeft: 6, color: good ? TI.green : TI.red }}
    >
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
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
        {stage.state === "done" ? "✓"
          : stage.state === "overdue" ? `${Math.abs(stage.diffDays)}d`
          : stage.state === "warning" ? stage.pendingCount
          // Futura: só as peças travadas NELA (o acumulado repetido em 5
          // células cinza era ruído); sem pendência própria, célula quieta.
          : stage.directCount > 0 ? stage.directCount : "–"}
      </span>
      <span style={{ fontSize: 10, color: stage.state === "overdue" ? TI.red : TI.label, fontWeight: stage.state === "overdue" ? 700 : 500 }}>
        {invalidDate ? "—"
          // Marco vencido: quantas peças travadas importa mais que o dd/mm
          // que já passou — o par "dias + peças" responde a cobrança na célula.
          : stage.state === "overdue" ? `${stage.pendingCount} pç`
          : fmtDayMonth(stage.deadline)}
      </span>
      <span className="sr-only">{stage.label}: {statusText}</span>
    </div>
  );
}

// ─── "Marcar como cobrado" (S2) — accountability leve, nada muda na peça ────
function CobradoControl({ targetType, targetId, cobranca }: {
  targetType: "event" | "sponsor";
  targetId: string;
  cobranca?: { userName: string; createdAt: string; daysAgo: number };
}) {
  const { toast } = useToast();
  const mutation = useMutation({
    mutationFn: async () => await apiRequest("POST", "/api/prazos/cobrancas", { targetType, targetId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prazos"] });
      toast({ title: "Cobrança registrada", description: "Ficou marcado quem cobrou e quando." });
    },
    onError: (e: Error) => {
      toast({ title: "Não foi possível registrar a cobrança", description: e.message, variant: "destructive" });
    },
  });
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {cobranca && (
        <span
          title={`Registrada em ${new Date(cobranca.createdAt).toLocaleString("pt-BR")}`}
          style={{ fontSize: 11, fontWeight: 600, color: cobranca.daysAgo >= 3 ? TI.red : TI.label }}
        >
          cobrado {cobranca.daysAgo === 0 ? "hoje" : `há ${cobranca.daysAgo}d`} por {cobranca.userName}
          {cobranca.daysAgo >= 3 && " — segue parado"}
        </span>
      )}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        data-testid={`button-cobrar-${targetType}-${targetId}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 10px", borderRadius: 999, border: `1px solid ${TI.border}`,
          backgroundColor: TI.card, fontSize: 11, fontWeight: 700,
          color: mutation.isPending ? TI.label : "#9a3412",
          cursor: mutation.isPending ? "default" : "pointer",
        }}
      >
        <Megaphone aria-hidden="true" style={{ width: 12, height: 12 }} />
        {mutation.isPending ? "Registrando..." : cobranca ? "Cobrar de novo" : "Marcar como cobrado"}
      </button>
    </span>
  );
}

// ─── Drill-down de um evento ────────────────────────────────────────────────
function EventDrilldown({ ev, cobranca }: {
  ev: PrazoEvent;
  cobranca?: { userName: string; createdAt: string; daysAgo: number };
}) {
  // Agrupa as peças pendentes por etapa; só etapas com peça travada NELA.
  const groups = useMemo(() => {
    const byStage = new Map<number, PrazoPendingItem[]>();
    for (const it of ev.pendingItems) {
      const arr = byStage.get(it.stageIndex);
      if (arr) arr.push(it); else byStage.set(it.stageIndex, [it]);
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
      <div className="gp-no-print" style={{ display: "flex", justifyContent: "flex-end" }}>
        <CobradoControl targetType="event" targetId={ev.id} cobranca={cobranca} />
      </div>
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
                    <th scope="col" style={DRILL_TH} title="Dias desde a última alteração da peça — qualquer edição atualiza este relógio">
                      Sem movimento
                    </th>
                    {isAprovacao && <th scope="col" style={{ ...DRILL_TH, textAlign: "left" }}>Aprovação com quem</th>}
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
                        color: dayColor(it.waitingDays),
                      }}>
                        {it.waitingDays === 0 ? "hoje" : `${it.waitingDays}d`}
                      </td>
                      {isAprovacao && (
                        <td style={{ padding: "6px 10px", fontSize: 12, color: "#57534e" }}>
                          {it.sponsors && it.sponsors.length > 0
                            ? it.sponsors.map((s, i) => (
                                <span key={`${it.id}-${s.name}-${i}`} style={{ whiteSpace: "nowrap" }}>
                                  {i > 0 && ", "}
                                  {s.holder === "sponsor" ? (
                                    <>
                                      <strong style={{ color: s.days >= 7 ? TI.red : TI.title }}>{s.name}</strong>
                                      <span style={{ color: dayColor(s.days) }}> ({s.days === 0 ? "hoje" : `${s.days}d`})</span>
                                    </>
                                  ) : (
                                    <span style={{ color: TI.label }} title={`${s.name} devolveu — a Arte precisa reenviar antes de nova aprovação`}>
                                      {s.name} — com a Arte
                                    </span>
                                  )}
                                </span>
                              ))
                            : <span style={{ color: TI.label }} title="Aprovações ainda não inicializadas para esta peça">—</span>}
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
  fontSize: 10, fontWeight: 700, textTransform: "uppercase",
  letterSpacing: "0.08em", color: TI.label, textAlign: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: "nowrap",
};

// ─── KPI card ───────────────────────────────────────────────────────────────
// Informativo vira <div> (button disabled sai da ordem de tab e leitores
// anunciam "indisponível" para algo que não é ação nenhuma).
function KpiCard({
  label, value, tone, active, onClick, title, testId, trend, goodWhenUp,
}: {
  label: string;
  value: number;
  tone: "red" | "amber" | "green" | "neutral";
  active?: boolean;
  onClick?: () => void;
  title?: string;
  testId: string;
  trend?: number;
  goodWhenUp?: boolean;
}) {
  const [hover, setHover] = useState(false);
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
    // Hover só no clicável: é a affordance de que o card filtra.
    boxShadow: active || (clickable && hover)
      ? "0 4px 12px rgba(28,25,23,0.09)"
      : "0 1px 3px rgba(28,25,23,0.04)",
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
        // Zero é sempre neutro — inclusive no verde: "Eventos em dia 0"
        // pintado de verde afirmaria o contrário do que o número diz.
        color: zero ? TI.label : colors.num,
      }}>
        {value}
        <TrendArrow delta={trend} goodWhenUp={goodWhenUp} />
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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
      soSaidas7d: p.get("saidas7") === "1",
      busca: p.get("q") ?? "",
      prioridade: p.get("prioridade") ?? "all",
      ordem: p.get("ordem") === "atraso" ? "atraso" : "saida",
    };
  }, []);
  const [soAtrasados, setSoAtrasados] = useState(initial.soAtrasados);
  const [soSaidas7d, setSoSaidas7d] = useState(initial.soSaidas7d);
  const [busca, setBusca] = useState(initial.busca);
  const [prioridade, setPrioridade] = useState(initial.prioridade);
  const [ordem, setOrdem] = useState<"saida" | "atraso">(initial.ordem as "saida" | "atraso");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSponsorId, setExpandedSponsorId] = useState<string | null>(null);
  const [showAllSponsors, setShowAllSponsors] = useState(false);

  // Espelha filtros na URL sem empilhar histórico (preserva o hash).
  // Debounce: replaceState a cada tecla estoura o rate-limit do Safari
  // (~100 chamadas/30s lançam SecurityError e derrubam a árvore React).
  useEffect(() => {
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (soAtrasados) p.set("atrasados", "1");
      if (soSaidas7d) p.set("saidas7", "1");
      if (busca) p.set("q", busca);
      if (prioridade !== "all") p.set("prioridade", prioridade);
      if (ordem !== "saida") p.set("ordem", ordem);
      const qs = p.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
    }, 300);
    return () => clearTimeout(timer);
  }, [soAtrasados, soSaidas7d, busca, prioridade, ordem]);

  const events = data?.events ?? [];

  // KPIs vêm do SERVIDOR (fonte única, mesma âncora de "hoje" do semáforo e
  // do snapshot de tendência) — o cliente parou de fazer conta própria.
  const kpis = data?.kpis ?? { atrasados: 0, saidas7d: 0, pecasAtrasadas: 0, emDia: 0, invalidCount: 0 };
  const trend = data?.trend ?? null;
  const cobrancas = data?.cobrancas ?? {};

  const prioridadesDisponiveis = useMemo(
    () => Array.from(new Set(events.map((e) => e.priority).filter(Boolean))) as string[],
    [events],
  );

  // Ordem/rótulos das etapas vêm do payload (fonte única) — fallback local
  // só para o primeiro render sem dado.
  const stageMeta = data?.stageMeta ?? STAGE_HEADERS.map((h) => ({ key: h.key, label: h.full }));

  // Gargalo por setor (cross-evento, sobre o conjunto completo): quantas
  // peças estão na MESA de cada setor agora. Atribuição pelo dono REAL da
  // bola, não só pela etapa: aprovação cuja(s) bola(s) estão todas com a
  // Arte conta na Arte; peça produzida/conferida não é mais "cobrança à
  // Gráfica produzir" — vira o sub-rótulo "aguardando conferência/entrega".
  const sectorSummary = useMemo(() => {
    const acc = stageMeta.map((m) => ({
      key: m.key,
      sector: STAGE_SECTOR[m.key]?.sector ?? m.label,
      stageLabel: m.label,
      url: STAGE_SECTOR[m.key]?.url ?? null,
      count: 0,
      totalDays: 0,
      maxDays: 0,
      producedCount: 0,
      eventIds: new Set<string>(),
    }));
    const arteIdx = stageMeta.findIndex((m) => m.key === "layouts");
    const PRODUCED = new Set(["produced", "conferred", "produzido"]);
    for (const ev of events) {
      for (const it of ev.pendingItems) {
        let idx = it.stageIndex;
        // Bola de volta com a Arte (reprovação aguardando reenvio).
        if (stageMeta[idx]?.key === "aprovacao" && arteIdx >= 0
            && it.sponsors && it.sponsors.length > 0
            && it.sponsors.every((s) => s.holder === "arte")) {
          idx = arteIdx;
        }
        const s = acc[idx];
        if (!s) continue;
        s.count += 1;
        s.totalDays += it.waitingDays;
        s.maxDays = Math.max(s.maxDays, it.waitingDays);
        s.eventIds.add(ev.id);
        if (stageMeta[idx]?.key === "producao" && PRODUCED.has(it.status)) s.producedCount += 1;
      }
    }
    const worst = acc.reduce((w, s) => (s.count > w ? s.count : w), 0);
    // Empate em 3+ setores = dia normal distribuído, não gargalo — o
    // destaque uniforme viraria alarme sem informação.
    const tied = acc.filter((s) => s.count === worst && worst > 0).length;
    return acc.map((s) => ({
      ...s,
      avgDays: s.count > 0 ? Math.round(s.totalDays / s.count) : 0,
      eventCount: s.eventIds.size,
      isWorst: worst > 0 && s.count === worst && tied < 3,
    }));
  }, [events, stageMeta]);

  const sponsorDelays = data?.sponsorDelays ?? [];

  const filtered = useMemo(() => {
    const q = normalize(busca.trim());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const list = events.filter((ev) => {
      if (soAtrasados && !eventHasOverdue(ev)) return false;
      if (soSaidas7d) {
        if (ev.invalidDate) return false;
        const d = toUTCDisplayDate(ev.truckDepartureDate); d.setHours(0, 0, 0, 0);
        const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
        if (diff < 0 || diff > 7) return false;
      }
      if (prioridade !== "all" && ev.priority !== prioridade) return false;
      if (q && !normalize(ev.name).includes(q)) return false;
      return true;
    });
    if (ordem === "atraso") {
      // Pior atraso primeiro (diffDays mais negativo entre etapas vencidas);
      // sem atraso, mantém o desempate por saída.
      const worstOf = (ev: PrazoEvent) =>
        ev.stages.reduce((w, s) => (s.state === "overdue" ? Math.min(w, s.diffDays) : w), 0);
      return [...list].sort((a, b) =>
        worstOf(a) - worstOf(b)
        || new Date(a.truckDepartureDate).getTime() - new Date(b.truckDepartureDate).getTime());
    }
    return list;
  }, [events, soAtrasados, soSaidas7d, prioridade, busca, ordem]);

  const hasActiveFilters = soAtrasados || soSaidas7d || busca.trim() !== "" || prioridade !== "all";
  const clearFilters = () => { setSoAtrasados(false); setSoSaidas7d(false); setBusca(""); setPrioridade("all"); };

  // ── Blocos de estado ──────────────────────────────────────────────────────
  let body: React.ReactNode;

  if (isLoading) {
    // Skeleton fiel ao layout real (KPIs + faixa de diagnóstico + linhas):
    // os KPIs NÃO aparecem zerados — zero aqui é afirmação ("tudo em dia"),
    // não placeholder.
    body = (
      <div aria-busy="true" aria-label="Carregando prazos" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse" style={{ height: 84, borderRadius: 12, backgroundColor: "#f0efee", border: `1px solid ${TI.border}` }} />
          ))}
        </div>
        <div className="animate-pulse" style={{ height: 120, borderRadius: 12, backgroundColor: "#f0efee", border: `1px solid ${TI.border}` }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-pulse" style={{ height: 64, borderRadius: 12, backgroundColor: "#f0efee", border: `1px solid ${TI.border}` }} />
          ))}
        </div>
      </div>
    );
  } else if (isError && !data) {
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
                <span style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <span style={{
                    padding: "3px 9px", borderRadius: 999,
                    backgroundColor: chip.bg, color: chip.color,
                    fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
                  }}>
                    {chip.text}
                  </span>
                  {ev.riskCritical && (
                    <span
                      title="Marco a até 2 dias de vencer com 10+ peças ainda pendentes"
                      style={{
                        padding: "2px 8px", borderRadius: 999, backgroundColor: TI.red, color: "#ffffff",
                        fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                      }}
                    >
                      risco
                    </span>
                  )}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 4, marginTop: 12 }}>
                {ev.stages.map((s) => (
                  <div key={s.key} style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                    <StageCell stage={s} invalidDate={ev.invalidDate} />
                    <span style={{ display: "block", fontSize: 10, color: TI.label, marginTop: 2, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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
                className="gp-no-print"
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
              {expanded && <div id={`drill-${ev.id}`}><EventDrilldown ev={ev} cobranca={cobrancas[`event:${ev.id}`]} /></div>}
            </div>
          );
        })}
      </div>
    );
  } else {
    // ── Tabela desktop ──────────────────────────────────────────────────────
    // maxHeight + overflow auto: o thead sticky precisa de um scrollport —
    // com 20+ eventos os cabeçalhos das 5 etapas seguem visíveis no scroll.
    body = (
      <div style={{
        backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12,
        overflow: "auto", maxHeight: "calc(100vh - 150px)",
      }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <caption className="sr-only">Eventos ativos, marcos de prazo e peças prontas</caption>
          <thead>
            <tr>
              <th scope="col" style={{ ...TH_STICKY, textAlign: "left", paddingLeft: 18, minWidth: 220 }}>Evento</th>
              <th scope="col" style={{ ...TH_STICKY, textAlign: "left", minWidth: 150 }}>Saída</th>
              {stageMeta.map((m) => (
                <th key={m.key} scope="col" style={{ ...TH_STICKY, minWidth: 78 }} title={m.label}>
                  {STAGE_SHORT[m.key] ?? m.label}
                </th>
              ))}
              <th scope="col" style={{ ...TH_STICKY, minWidth: 110 }}>Prontas</th>
              <th scope="col" style={{ ...TH_STICKY, width: 46 }}>
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
                      {ev.riskCritical && (
                        <span
                          title="Marco a até 2 dias de vencer com 10+ peças ainda pendentes — inviável sem ação imediata"
                          style={{
                            display: "inline-block", marginTop: 3, marginLeft: 5, padding: "2px 8px",
                            borderRadius: 999, backgroundColor: TI.red, color: "#ffffff",
                            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em",
                          }}
                        >
                          risco
                        </span>
                      )}
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
                        className="gp-no-print"
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
                        <EventDrilldown ev={ev} cobranca={cobrancas[`event:${ev.id}`]} />
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
      {/* Relatório de cobrança vai para reunião: a impressão esconde os
          controles (filtros, botões) e mantém placar + tabela + drill. */}
      <style>{`@media print { .gp-no-print { display: none !important; } }`}</style>
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
            <div className="gp-no-print" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: TI.label }} title={new Date(data.generatedAt).toLocaleString("pt-BR")}>
                Atualizado {fmtRelative(data.generatedAt)}
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

        {/* Dado antigo por falha de atualização: NUNCA jogar fora o cache bom —
            dashboard de 10 min atrás vale mais que tela vazia. */}
        {isError && data && (
          <div role="alert" className="gp-no-print" style={{
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            backgroundColor: TI.amberBg, border: "1px solid #fde68a", borderRadius: 10,
            padding: "10px 14px", marginBottom: 14,
          }}>
            <AlertTriangle aria-hidden="true" style={{ width: 16, height: 16, color: TI.amber, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#78350f", fontWeight: 600 }}>
              Não foi possível atualizar — mostrando dados de {fmtRelative(data.generatedAt)}.
            </span>
            <button
              type="button"
              onClick={() => refetch()}
              style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 700, color: "#9a3412", cursor: "pointer", textDecoration: "underline" }}
            >
              Tentar de novo
            </button>
          </div>
        )}

        {/* KPIs */}
        {data && (
          <div style={{ marginBottom: 16 }}>
            <div style={{
              display: "grid", gap: 10,
              gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(4, minmax(0,1fr))",
            }}>
              <KpiCard
                label="Eventos com atraso" value={kpis.atrasados} tone="red"
                active={soAtrasados} onClick={() => setSoAtrasados((v) => !v)}
                trend={trend?.atrasados} goodWhenUp={false}
                testId="kpi-atrasados"
              />
              <KpiCard
                label="Saídas em 7 dias" value={kpis.saidas7d} tone="amber"
                active={soSaidas7d} onClick={() => setSoSaidas7d((v) => !v)}
                trend={trend?.saidas7d} goodWhenUp={false}
                testId="kpi-saidas-7d"
              />
              <KpiCard
                label="Peças em etapa vencida" value={kpis.pecasAtrasadas} tone="red"
                title="Peças que ainda não passaram pela etapa vencida mais avançada de cada evento"
                trend={trend?.pecasAtrasadas} goodWhenUp={false}
                testId="kpi-pecas-atrasadas"
              />
              <KpiCard
                label="Eventos em dia" value={kpis.emDia} tone="green"
                trend={trend?.emDia} goodWhenUp
                testId="kpi-em-dia"
              />
            </div>
            {kpis.invalidCount > 0 && (
              <p style={{ margin: "8px 2px 0", fontSize: 12, fontWeight: 600, color: TI.red }}>
                {kpis.invalidCount} evento{kpis.invalidCount !== 1 ? "s" : ""} com data de saída inválida — corrija no cadastro (não contam como "em dia").
              </p>
            )}
          </div>
        )}

        {/* Faixa de diagnóstico: setores e patrocinadores lado a lado no
            desktop — empilhados, empurravam a tabela-mãe para fora da dobra
            do notebook. */}
        {data && events.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "3fr 2fr",
            gap: 14, marginBottom: 16, alignItems: "start",
          }}>
          <section aria-label="Gargalo por setor">
            <h2 style={{
              margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Onde as peças estão paradas agora
            </h2>
            <div style={{
              display: "grid", gap: 10,
              // auto-fit: sem card órfão ocupando meia linha em nenhuma largura.
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
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
                    <span
                      title="Dias desde a última alteração de cada peça"
                      style={{ display: "block", fontSize: 11, color: s.maxDays >= 3 ? dayColor(s.maxDays) : TI.secondary, marginTop: 4 }}
                    >
                      sem movimento: média {s.avgDays}d · pior {s.maxDays}d · {s.eventCount} evento{s.eventCount !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span style={{ display: "block", fontSize: 11, color: TI.label, marginTop: 4 }}>
                      mesa limpa
                    </span>
                  )}
                  {s.isWorst && (
                    <span style={{
                      display: "inline-block", marginTop: 6, padding: "1px 8px", borderRadius: 999,
                      backgroundColor: TI.redBg, color: TI.red, fontSize: 10, fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      maior gargalo
                    </span>
                  )}
                  {s.producedCount > 0 && (
                    <span style={{ display: "block", fontSize: 11, color: TI.secondary, marginTop: 4 }}>
                      {s.producedCount} já produzida{s.producedCount !== 1 ? "s" : ""} — aguardando conferência/entrega
                    </span>
                  )}
                  {s.count > 0 && (
                    <Link href={s.url ?? "/eventos"} style={{ display: "inline-block", marginTop: 6, fontSize: 11, fontWeight: 700, color: "#9a3412", textDecoration: "none" }}>
                      Abrir {s.url ? s.sector : "Eventos"} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section aria-label="Aprovações travadas por patrocinador">
            <h2 style={{
              margin: "0 0 8px", fontSize: 11, fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "0.1em", color: TI.label, fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}>
              Aprovações travadas por patrocinador
            </h2>
            {sponsorDelays.length === 0 ? (
              <div style={{
                backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12,
                padding: "16px 14px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <CheckCircle2 aria-hidden="true" style={{ width: 16, height: 16, color: TI.green, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: TI.secondary }}>
                  Nenhum patrocinador segurando aprovação.
                </span>
              </div>
            ) : (
              <div style={{ overflowX: "auto", backgroundColor: TI.card, border: `1px solid ${TI.border}`, borderRadius: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 440 }}>
                  <caption className="sr-only">Patrocinadores com aprovações pendentes, pior primeiro</caption>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${TI.border}` }}>
                      <th scope="col" style={{ ...DRILL_TH, textAlign: "left", paddingLeft: 14 }}>Patrocinador</th>
                      <th scope="col" style={DRILL_TH}>Peças</th>
                      <th scope="col" style={DRILL_TH}>Pior espera</th>
                      <th scope="col" style={DRILL_TH}><span className="sr-only">Ações</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllSponsors ? sponsorDelays : sponsorDelays.slice(0, 5)).map((sp) => {
                      const spExpanded = expandedSponsorId === sp.sponsorId;
                      const spCobranca = cobrancas[`sponsor:${sp.sponsorId}`];
                      return (
                        <Fragment key={sp.sponsorId}>
                          <tr style={{ borderBottom: spExpanded ? "none" : `1px solid #f0efee` }}>
                            <td style={{ padding: "8px 6px 8px 14px", fontSize: 13, fontWeight: 700, color: TI.title }}>
                              <button
                                type="button"
                                onClick={() => setExpandedSponsorId(spExpanded ? null : sp.sponsorId)}
                                aria-expanded={spExpanded}
                                aria-controls={spExpanded ? `sp-drill-${sp.sponsorId}` : undefined}
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: 6,
                                  background: "none", border: "none", padding: 0,
                                  fontSize: 13, fontWeight: 700, color: TI.title, cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <ChevronDown aria-hidden="true" style={{
                                  width: 13, height: 13, color: TI.label, flexShrink: 0,
                                  transform: spExpanded ? "rotate(180deg)" : "none",
                                  transition: "transform 0.15s ease",
                                }} />
                                {sp.name}
                              </button>
                              <span style={{ display: "block", fontSize: 10, color: TI.label, marginLeft: 19 }}>
                                {sp.eventCount} evento{sp.eventCount !== 1 ? "s" : ""}
                                {spCobranca && (
                                  <span style={{ color: spCobranca.daysAgo >= 3 ? TI.red : TI.label, fontWeight: 600 }}>
                                    {" · "}cobrado {spCobranca.daysAgo === 0 ? "hoje" : `há ${spCobranca.daysAgo}d`}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td style={{
                              padding: "8px 6px", textAlign: "center", fontSize: 13, fontWeight: 800,
                              fontFamily: "'Space Grotesk', sans-serif",
                              // Vermelho é GANHO por atraso real (≥7d), não pela
                              // mera existência de pendência.
                              color: sp.maxDays >= 7 ? TI.red : TI.title,
                            }}>
                              {sp.pendingCount}
                            </td>
                            <td style={{
                              padding: "8px 6px", textAlign: "center", fontSize: 12, fontWeight: 700,
                              color: dayColor(sp.maxDays),
                            }}>
                              {sp.maxDays === 0 ? "hoje" : `${sp.maxDays}d`}
                            </td>
                            <td style={{ padding: "8px 14px 8px 6px", textAlign: "right", whiteSpace: "nowrap" }}>
                              <Link
                                href={`/atendimento?patrocinador=${sp.sponsorId}`}
                                aria-label={`Cobrar ${sp.name} no Atendimento`}
                                style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textDecoration: "none" }}
                              >
                                Cobrar →
                              </Link>
                            </td>
                          </tr>
                          {spExpanded && (
                            <tr style={{ borderBottom: `1px solid #f0efee`, backgroundColor: "#fcfcfb" }}>
                              <td id={`sp-drill-${sp.sponsorId}`} colSpan={4} style={{ padding: "6px 14px 12px" }}>
                                <div className="gp-no-print" style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                                  <CobradoControl targetType="sponsor" targetId={sp.sponsorId} cobranca={spCobranca} />
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  {sp.items.map((it) => (
                                    <Link
                                      key={it.itemId}
                                      href={`/eventos/${it.eventId}?item=${it.itemId}`}
                                      title={`${it.eventName} — abrir a peça`}
                                      style={{
                                        display: "inline-flex", alignItems: "center", gap: 5,
                                        padding: "3px 9px", borderRadius: 999,
                                        backgroundColor: "#f5f5f4", border: `1px solid ${TI.border}`,
                                        fontSize: 11, fontWeight: 600, color: "#57534e",
                                        textDecoration: "none", lineHeight: 1.5,
                                      }}
                                    >
                                      {it.displayId}
                                      <span style={{ color: TI.label }}>{it.eventName}</span>
                                      <span style={{ fontWeight: 700, color: dayColor(it.days) }}>
                                        {it.days === 0 ? "hoje" : `${it.days}d`}
                                      </span>
                                    </Link>
                                  ))}
                                  {sp.pendingCount > sp.items.length && (
                                    <span style={{ fontSize: 11, color: TI.label, alignSelf: "center" }}>
                                      +{sp.pendingCount - sp.items.length} no Atendimento
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
                {sponsorDelays.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAllSponsors((v) => !v)}
                    className="gp-no-print"
                    style={{
                      display: "block", width: "100%", padding: "8px 0",
                      background: "none", border: "none", borderTop: `1px solid #f0efee`,
                      fontSize: 12, fontWeight: 700, color: "#9a3412", cursor: "pointer",
                    }}
                  >
                    {showAllSponsors ? "Mostrar só os 5 piores" : `Ver todos (${sponsorDelays.length})`}
                  </button>
                )}
              </div>
            )}
          </section>
          </div>
        )}

        {/* Filtros + legenda do semáforo */}
        {data && events.length > 0 && (
          <div className="gp-no-print" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
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
                {/* Ordem canônica (urgente→baixa), não a ordem de inserção. */}
                {Object.keys(PRIORITY).filter((p) => prioridadesDisponiveis.includes(p)).map((p) => (
                  <option key={p} value={p}>{getPriorityMeta(p)?.label ?? p}</option>
                ))}
              </select>
            )}
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as "saida" | "atraso")}
              aria-label="Ordenar eventos"
              data-testid="select-ordem-prazos"
              style={{
                padding: "8px 10px", borderRadius: 9, border: `1px solid ${TI.border}`,
                backgroundColor: TI.card, fontSize: 12, fontWeight: 600, color: "#57534e",
                cursor: "pointer",
              }}
            >
              <option value="saida">Ordenar: próxima saída</option>
              <option value="atraso">Ordenar: mais atrasado</option>
            </select>
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
            {/* Legenda do semáforo: a bolinha muda de significado por estado —
                sem isto a gramática só existia no hover, célula a célula. */}
            {!isMobile && (
              <span style={{ flexBasis: "100%", fontSize: 11, color: TI.label, paddingTop: 2 }}>
                Semáforo: <strong style={{ color: TI.green }}>✓</strong> etapa concluída ·{" "}
                <strong style={{ color: TI.amber }}>nº</strong> peças aguardando o marco ·{" "}
                <strong style={{ color: TI.red }}>Nd</strong> dias vencida (com o total de peças abaixo)
              </span>
            )}
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

// Variante sticky para a tabela-mãe (o container dela é o scrollport).
// boxShadow no lugar de borderBottom: borda de th sticky não acompanha o scroll.
const TH_STICKY: React.CSSProperties = {
  ...TH_STYLE,
  position: "sticky", top: 0, zIndex: 2,
  backgroundColor: TI.card,
  boxShadow: `inset 0 -1px 0 ${TI.border}`,
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
