import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ChevronLeft, ChevronRight, X, Download, Copy, Check } from "lucide-react";
import { T } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";

interface AuditLog {
  id: string;
  userId: string | null;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
}

/* ── Action config ── */
// Tons 700 das mesmas famílias: os 500/600 anteriores reprovavam o piso de
// contraste 4.5:1 sobre os fundos pastéis dos badges.
const ACTION_CFG: Record<string, { label: string; bg: string; color: string }> = {
  created:            { label: "Criado",         bg: "#eff6ff", color: "#1d4ed8" },
  updated:            { label: "Atualizado",      bg: "#fff7ed", color: "#c2410c" },
  deleted:            { label: "Excluído",        bg: "#fef2f2", color: "#b91c1c" },
  approved:           { label: "Aprovado",        bg: "#f0fdf4", color: "#15803d" },
  delivered:          { label: "Entregue",        bg: "#f0fdf4", color: "#047857" },
  status_changed:     { label: "Status",          bg: "#faf5ff", color: "#7e22ce" },
  sponsor_linked:     { label: "Patrocinador",    bg: "#fff7ed", color: "#c2410c" },
  sponsor_approved:   { label: "Pat. Aprovado",   bg: "#f0fdf4", color: "#15803d" },
  submitted:          { label: "Enviado",         bg: "#eff6ff", color: "#1d4ed8" },
  released:           { label: "Liberado",        bg: "#f0fdf4", color: "#047857" },
  rejected:           { label: "Reprovado",       bg: "#fef2f2", color: "#b91c1c" },
  password_changed:   { label: "Senha",           bg: "#faf5ff", color: "#7e22ce" },
  // 'login' saiu de propósito: o sistema NÃO grava log de login — manter o
  // badge sugeria um rastreamento de acessos que não existe.
};

const getActionCfg = (action: string) =>
  ACTION_CFG[action] ?? { label: action, bg: T.low, color: T.second };

/* ── Entity type labels ── */
const ENTITY_LABELS: Record<string, string> = {
  event:   "Evento",
  item:    "Item",
  user:    "Usuário",
  sponsor: "Patrocinador",
  comment: "Comentário",
};

/* ── Avatar ── */
// O payload de /api/audit-logs NÃO traz o papel do usuário (só userName), então
// colorir o avatar "por papel" era mentira: todos caíam no mesmo fallback verde
// de atendimento. Até o log carregar userRole, um neutro único é o honesto.
const AVATAR_NEUTRAL = { bg: T.low, color: T.second };

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const PAGE_SIZE = 20;

const tiInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px 9px 34px",
  backgroundColor: "#f0efee", border: "none", borderRadius: 6,
  fontSize: 13, color: T.text,
  transition: "all 0.2s",
};

const filterSel: React.CSSProperties = {
  padding: "9px 12px", backgroundColor: "#f0efee",
  border: "none", borderRadius: 6,
  fontSize: 13, fontWeight: 600, color: T.text,
  cursor: "pointer",
  appearance: "none", WebkitAppearance: "none",
  transition: "all 0.2s",
};

export default function LogsSistema() {
  const isMobile = useIsMobile();
  const [search, setSearch]           = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage]               = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // ?withTotal=1: além da lista (truncada nos 500 mais recentes pelo teto do
  // storage), a rota devolve o count REAL da tabela — sem ele o KPI "Total de
  // registros" apresentava o teto como se fosse o total do sistema.
  const { data, isLoading, isError, refetch } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ["/api/audit-logs?withTotal=1"],
  });
  const logs = data?.logs ?? [];
  const total = data?.total ?? logs.length;
  const isTruncated = total > logs.length;

  const copyEntityId = (logId: string, entityId: string) => {
    navigator.clipboard?.writeText(entityId).then(() => {
      setCopiedId(logId);
      window.setTimeout(() => setCopiedId(current => (current === logId ? null : current)), 1500);
    });
  };

  /* ── Derived filter options ── */
  const allActions = useMemo(() =>
    Array.from(new Set(logs.map(l => l.action))).sort(), [logs]);
  const allEntities = useMemo(() =>
    Array.from(new Set(logs.map(l => l.entityType))).sort(), [logs]);

  /* ── Filtered + paginated ── */
  const filtered = useMemo(() => {
    return logs.filter(l => {
      const q = search.toLowerCase();
      const matchQ = !q || l.userName.toLowerCase().includes(q) || (l.details ?? "").toLowerCase().includes(q) || l.entityType.toLowerCase().includes(q);
      const matchA = actionFilter === "all" || l.action === actionFilter;
      const matchE = entityFilter === "all" || l.entityType === entityFilter;
      return matchQ && matchA && matchE;
    });
  }, [logs, search, actionFilter, entityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Apertar um filtro com a paginação avançada pode deixar `page` além do
  // total — clampa em vez de renderizar uma página vazia.
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const activeFilters = [search, actionFilter !== "all", entityFilter !== "all"].filter(Boolean).length;

  const clearFilters = () => { setSearch(""); setActionFilter("all"); setEntityFilter("all"); setPage(1); };

  /* ── CSV export (client-side, from the already-loaded/filtered logs) ── */
  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const handleExport = () => {
    // Exportação parcial precisa se anunciar: sem o aviso, o CSV com 500
    // linhas passava por "histórico completo" em qualquer análise posterior.
    const avisoTruncado = isTruncated
      ? [[`AVISO: exportação parcial — apenas os últimos ${logs.length} registros de ${total} no sistema`]]
      : [];
    const header = ["Data/Hora", "Usuário", "Ação", "Descrição", "Entidade", "ID da Entidade"];
    const rows = filtered.map(l => [
      format(new Date(l.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      l.userName,
      getActionCfg(l.action).label,
      l.details ?? `${getActionCfg(l.action).label} em ${ENTITY_LABELS[l.entityType] ?? l.entityType}`,
      ENTITY_LABELS[l.entityType] ?? l.entityType,
      l.entityId,
    ]);
    const csv = [...avisoTruncado, header, ...rows]
      .map(row => row.map(cell => csvEscape(String(cell))).join(";"))
      .join("\r\n");
    // UTF-8 BOM so Excel opens accented characters correctly
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `logs-sistema-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /* ── Stats ── */
  const todayCount  = logs.filter(l => new Date(l.createdAt).toDateString() === new Date().toDateString()).length;
  const errorCount  = logs.filter(l => ["deleted", "rejected"].includes(l.action)).length;

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: isMobile ? "14px 16px 48px" : "28px 32px 64px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1 }}>
            Logs do Sistema
          </h1>
          <p style={{ fontSize: 15, color: T.second, margin: 0 }}>
            Rastreamento das operações do sistema
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          data-testid="button-export-logs"
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", backgroundColor: T.surface, color: filtered.length === 0 ? T.muted : T.second, border: `1px solid ${T.border}`, borderRadius: 6, cursor: filtered.length === 0 ? "not-allowed" : "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", opacity: filtered.length === 0 ? 0.6 : 1 }}
          onMouseEnter={e => { if (filtered.length > 0) e.currentTarget.style.backgroundColor = T.low; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = T.surface; }}
        >
          <Download style={{ width: 13, height: 13 }} />
          Exportar
        </button>
      </div>

      {/* ── KPI chips ── */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { label: "Total de registros", value: total, color: T.text, bg: T.surface },
          { label: "Hoje",               value: todayCount,  color: "#1d4ed8", bg: "#eff6ff" },
          { label: "Exclusões e reprovações", value: errorCount, color: "#b91c1c", bg: "#fef2f2" },
          { label: "Filtrados",          value: filtered.length, color: "#c2410c", bg: "#fff7ed" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ padding: "8px 16px", backgroundColor: bg, border: `1px solid ${T.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 10, color: T.second, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
          </div>
        ))}
        {isTruncated && (
          <span style={{ fontSize: 11, color: T.second, fontWeight: 600 }}>
            Exibindo os últimos {logs.length} de {total} registros
          </span>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
          <Search style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 13, height: 13, color: T.muted }} />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por usuário, ação ou entidade..."
            data-testid="input-search-logs"
            style={tiInput}
            onFocus={e => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "0 0 0 2px rgba(249,115,22,0.2)"; }}
            onBlur={e =>  { e.currentTarget.style.backgroundColor = "#f0efee"; e.currentTarget.style.boxShadow = "none"; }}
          />
        </div>

        {/* Action filter */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <FilterSelect
            label="Tipo de ação" allLabel="Todos os tipos de ação"
            value={actionFilter}
            onChange={v => { setActionFilter(v); setPage(1); }}
            options={allActions.map(a => ({ value: a, label: getActionCfg(a).label }))}
            searchPlaceholder="Buscar ação..." emptyText="Nenhuma ação encontrada."
            hideWhenEmpty={false} testId="select-action-filter"
            triggerStyle={{ ...filterSel, minWidth: 160 }}
          />
        </div>

        {/* Entity filter */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <FilterSelect
            label="Entidade" allLabel="Todas as entidades"
            value={entityFilter}
            onChange={v => { setEntityFilter(v); setPage(1); }}
            options={allEntities.map(e => ({ value: e, label: ENTITY_LABELS[e] ?? e }))}
            searchPlaceholder="Buscar entidade..." emptyText="Nenhuma entidade encontrada."
            hideWhenEmpty={false} testId="select-entity-filter"
            triggerStyle={{ ...filterSel, minWidth: 140 }}
          />
        </div>

        {activeFilters > 0 && (
          <button
            onClick={clearFilters}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}
          >
            <X style={{ width: 10, height: 10 }} />
            Limpar ({activeFilters})
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 11, color: T.second, fontWeight: 600, flexShrink: 0 }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <section style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "64px 0", textAlign: "center", fontSize: 13, color: T.second }}>
            Carregando logs...
          </div>
        ) : isError ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 13, color: T.text, fontWeight: 700, margin: "0 0 4px" }}>
              Não foi possível carregar os logs
            </p>
            <p style={{ fontSize: 12, color: T.second, margin: "0 0 16px" }}>
              Verifique sua conexão e tente novamente.
            </p>
            <button
              onClick={() => refetch()}
              style={{ padding: "8px 18px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              Tentar novamente
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            {logs.length === 0 ? (
              <p style={{ fontSize: 13, color: T.second, margin: 0 }}>
                Nenhuma atividade registrada ainda — os logs aparecem aqui conforme o sistema é usado.
              </p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: T.second, margin: "0 0 14px" }}>
                  Nenhum registro corresponde à busca e aos filtros aplicados.
                </p>
                <button
                  onClick={clearFilters}
                  style={{ padding: "8px 16px", backgroundColor: T.surface, border: `1px solid ${T.bdark}`, borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: "0.06em" }}
                >
                  Limpar filtros
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: T.low, borderBottom: `1px solid ${T.border}` }}>
                    {[
                      { label: "Data e Hora",   w: 160 },
                      { label: "Usuário",       w: undefined },
                      { label: "Tipo de Ação",  w: 130 },
                      { label: "Descrição",     w: undefined },
                      { label: "Entidade",      w: 120 },
                    ].map(col => (
                      <th key={col.label} scope="col" style={{ padding: "11px 18px", fontSize: 10, fontWeight: 900, color: T.second, textTransform: "uppercase", letterSpacing: "0.16em", whiteSpace: "nowrap", width: col.w }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(log => {
                    const aCfg = getActionCfg(log.action);
                    const init = initials(log.userName);
                    const avatarCfg = AVATAR_NEUTRAL;
                    const description = log.details ?? `${aCfg.label} em ${ENTITY_LABELS[log.entityType] ?? log.entityType}`;

                    return (
                      <tr
                        key={log.id}
                        data-testid={`row-log-${log.id}`}
                        style={{ borderBottom: `1px solid ${T.low}`, transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#fafaf9")}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {/* Data e Hora */}
                        <td style={{ padding: "13px 18px", whiteSpace: "nowrap" }}>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: T.text, fontWeight: 500 }}>
                            {format(new Date(log.createdAt), "dd/MM/yyyy", { locale: ptBR })}
                          </div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.second, marginTop: 2 }}>
                            {format(new Date(log.createdAt), "HH:mm:ss", { locale: ptBR })}
                          </div>
                        </td>

                        {/* Usuário */}
                        <td style={{ padding: "13px 18px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%",
                              backgroundColor: avatarCfg.bg, color: avatarCfg.color,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 10, fontWeight: 800, flexShrink: 0,
                            }}>
                              {init}
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>
                              {log.userName}
                            </span>
                          </div>
                        </td>

                        {/* Tipo de Ação */}
                        <td style={{ padding: "13px 18px" }}>
                          <span style={{
                            padding: "3px 9px", borderRadius: 999,
                            backgroundColor: aCfg.bg, color: aCfg.color,
                            fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                            whiteSpace: "nowrap",
                          }}>
                            {aCfg.label}
                          </span>
                        </td>

                        {/* Descrição */}
                        <td style={{ padding: "13px 18px", fontSize: 13, color: T.second, maxWidth: 380 }}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {description}
                          </span>
                        </td>

                        {/* Entidade */}
                        <td style={{ padding: "13px 18px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.second, textTransform: "capitalize" }}>
                            {ENTITY_LABELS[log.entityType] ?? log.entityType}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                            <span title={log.entityId} style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.second }}>
                              {log.entityId.slice(0, 8)}…
                            </span>
                            <button
                              onClick={() => copyEntityId(log.id, log.entityId)}
                              aria-label={`Copiar ID completo ${log.entityId}`}
                              title="Copiar ID completo"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: 2, display: "flex", color: copiedId === log.id ? "#15803d" : T.second }}
                            >
                              {copiedId === log.id
                                ? <Check style={{ width: 11, height: 11 }} />
                                : <Copy style={{ width: 11, height: 11 }} />
                              }
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Pagination footer ── */}
            <div style={{ padding: "12px 18px", borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "rgba(243,244,243,0.5)" }}>
              <p style={{ fontSize: 11, color: T.second, fontWeight: 500, margin: 0 }}>
                Exibindo {Math.min((safePage - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de{" "}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: T.second }}>{filtered.length}</span> registros
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => setPage(Math.max(1, safePage - 1))}
                  disabled={safePage === 1}
                  aria-label="Página anterior"
                  style={{ padding: 4, color: safePage === 1 ? T.muted : T.second, background: "none", border: "none", cursor: safePage === 1 ? "not-allowed" : "pointer", opacity: safePage === 1 ? 0.35 : 1, display: "flex" }}
                >
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, safePage - 3), Math.min(totalPages, safePage + 2))
                  .map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      aria-label={`Página ${p}`}
                      aria-current={p === safePage ? "page" : undefined}
                      style={{
                        width: 28, height: 28, borderRadius: 6,
                        border: p === safePage ? `1px solid ${T.border}` : "1px solid transparent",
                        backgroundColor: p === safePage ? T.surface : "transparent",
                        fontSize: 11, fontWeight: p === safePage ? 900 : 600,
                        color: p === safePage ? T.text : T.second, cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  ))}

                <button
                  onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                  disabled={safePage === totalPages}
                  aria-label="Próxima página"
                  style={{ padding: 4, color: safePage === totalPages ? T.muted : T.second, background: "none", border: "none", cursor: safePage === totalPages ? "not-allowed" : "pointer", opacity: safePage === totalPages ? 0.35 : 1, display: "flex" }}
                >
                  <ChevronRight style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
