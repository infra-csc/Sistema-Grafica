import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterSelect } from "@/components/filter-select";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Search, ChevronLeft, ChevronRight, X, Download } from "lucide-react";
import { T } from "@/lib/theme";

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
const ACTION_CFG: Record<string, { label: string; bg: string; color: string }> = {
  created:            { label: "Criado",         bg: "#eff6ff", color: "#2563eb" },
  updated:            { label: "Atualizado",      bg: "#fff7ed", color: "#ea580c" },
  deleted:            { label: "Excluído",        bg: "#fef2f2", color: "#dc2626" },
  approved:           { label: "Aprovado",        bg: "#f0fdf4", color: "#16a34a" },
  delivered:          { label: "Entregue",        bg: "#f0fdf4", color: "#059669" },
  status_changed:     { label: "Status",          bg: "#faf5ff", color: "#9333ea" },
  sponsor_linked:     { label: "Patrocinador",    bg: "#fff7ed", color: "#ea580c" },
  sponsor_approved:   { label: "Pat. Aprovado",   bg: "#f0fdf4", color: "#16a34a" },
  submitted:          { label: "Enviado",         bg: "#eff6ff", color: "#2563eb" },
  released:           { label: "Liberado",        bg: "#f0fdf4", color: "#059669" },
  rejected:           { label: "Reprovado",       bg: "#fef2f2", color: "#dc2626" },
  login:              { label: "Login",           bg: "#f5f3ff", color: "#7c3aed" },
  password_changed:   { label: "Senha",           bg: "#faf5ff", color: "#9333ea" },
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

/* ── Role colors (for avatar) ── */
const ROLE_AVATAR: Record<string, { bg: string; color: string }> = {
  admin:       { bg: "#fee2e2", color: "#b91c1c" },
  solicitacao: { bg: "#dbeafe", color: "#1d4ed8" },
  arte:        { bg: "#ede9fe", color: "#7c3aed" },
  grafica:     { bg: "#ffedd5", color: "#c2410c" },
  atendimento: { bg: "#dcfce7", color: "#15803d" },
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
}

const PAGE_SIZE = 20;

const tiInput: React.CSSProperties = {
  width: "100%", padding: "9px 12px 9px 34px",
  backgroundColor: "#f0efee", border: "none", borderRadius: 6,
  fontSize: 12, color: T.text, outline: "none",
  transition: "all 0.2s",
};

const filterSel: React.CSSProperties = {
  padding: "9px 12px", backgroundColor: "#f0efee",
  border: "none", borderRadius: 6,
  fontSize: 12, fontWeight: 600, color: T.text,
  cursor: "pointer", outline: "none",
  appearance: "none", WebkitAppearance: "none",
  transition: "all 0.2s",
};

export default function LogsSistema() {
  const [search, setSearch]           = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [page, setPage]               = useState(1);

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

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
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilters = [search, actionFilter !== "all", entityFilter !== "all"].filter(Boolean).length;

  const clearFilters = () => { setSearch(""); setActionFilter("all"); setEntityFilter("all"); setPage(1); };

  /* ── CSV export (client-side, from the already-loaded/filtered logs) ── */
  const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const handleExport = () => {
    const header = ["Data/Hora", "Usuário", "Ação", "Descrição", "Entidade", "ID da Entidade"];
    const rows = filtered.map(l => [
      format(new Date(l.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR }),
      l.userName,
      getActionCfg(l.action).label,
      l.details ?? `${l.action} em ${l.entityType}`,
      ENTITY_LABELS[l.entityType] ?? l.entityType,
      l.entityId,
    ]);
    const csv = [header, ...rows]
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
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: "28px 32px 64px" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: T.text, margin: "0 0 6px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", textTransform: "uppercase", lineHeight: 1 }}>
            Logs do Sistema
          </h1>
          <p style={{ fontSize: 14, color: T.second, margin: 0 }}>
            Rastreamento completo de acessos e atividades administrativas
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
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total de registros", value: logs.length, color: T.text, bg: T.surface },
          { label: "Hoje",               value: todayCount,  color: "#2563eb", bg: "#eff6ff" },
          { label: "Ações críticas",     value: errorCount,  color: "#dc2626", bg: "#fef2f2" },
          { label: "Filtrados",          value: filtered.length, color: T.accent, bg: "#fff7ed" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} style={{ padding: "8px 16px", backgroundColor: bg, border: `1px solid ${T.border}`, borderRadius: 8, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Filter bar ── */}
      <div style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}
          >
            <X style={{ width: 10, height: 10 }} />
            Limpar ({activeFilters})
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted, fontWeight: 600, flexShrink: 0 }}>
          {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <section style={{ backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
        {isLoading ? (
          <div style={{ padding: "64px 0", textAlign: "center", fontSize: 13, color: T.muted }}>
            Carregando logs...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center", fontSize: 13, color: T.muted }}>
            Nenhum registro encontrado
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
                      <th key={col.label} style={{ padding: "11px 18px", fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", whiteSpace: "nowrap", width: col.w }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.map(log => {
                    const aCfg = getActionCfg(log.action);
                    const init = initials(log.userName);
                    const avatarCfg = ROLE_AVATAR.atendimento; // fallback neutral
                    let description = log.details ?? `${log.action} em ${log.entityType}`;

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
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: T.muted, marginTop: 2 }}>
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
                              fontSize: 9, fontWeight: 800, flexShrink: 0,
                            }}>
                              {init}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>
                              {log.userName}
                            </span>
                          </div>
                        </td>

                        {/* Tipo de Ação */}
                        <td style={{ padding: "13px 18px" }}>
                          <span style={{
                            padding: "3px 9px", borderRadius: 100,
                            backgroundColor: aCfg.bg, color: aCfg.color,
                            fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em",
                            whiteSpace: "nowrap",
                          }}>
                            {aCfg.label}
                          </span>
                        </td>

                        {/* Descrição */}
                        <td style={{ padding: "13px 18px", fontSize: 12, color: T.second, maxWidth: 380 }}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {description}
                          </span>
                        </td>

                        {/* Entidade */}
                        <td style={{ padding: "13px 18px" }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.second, textTransform: "capitalize" }}>
                            {ENTITY_LABELS[log.entityType] ?? log.entityType}
                          </div>
                          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: T.muted, marginTop: 1 }}>
                            {log.entityId.slice(0, 8)}…
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
              <p style={{ fontSize: 11, color: T.muted, fontWeight: 500, margin: 0 }}>
                Exibindo {Math.min((page - 1) * PAGE_SIZE + 1, filtered.length)}–{Math.min(page * PAGE_SIZE, filtered.length)} de{" "}
                <span style={{ fontFamily: "'DM Mono', monospace", fontWeight: 700, color: T.second }}>{filtered.length}</span> registros
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={{ padding: 4, color: page === 1 ? T.muted : T.second, background: "none", border: "none", cursor: page === 1 ? "not-allowed" : "pointer", opacity: page === 1 ? 0.35 : 1, display: "flex" }}
                >
                  <ChevronLeft style={{ width: 16, height: 16 }} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, page - 3), Math.min(totalPages, page + 2))
                  .map(p => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      style={{
                        width: 28, height: 28, borderRadius: 5,
                        border: p === page ? `1px solid ${T.border}` : "1px solid transparent",
                        backgroundColor: p === page ? T.surface : "transparent",
                        fontSize: 11, fontWeight: p === page ? 900 : 600,
                        color: p === page ? T.text : T.muted, cursor: "pointer",
                      }}
                    >
                      {p}
                    </button>
                  ))}

                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  style={{ padding: 4, color: page === totalPages ? T.muted : T.second, background: "none", border: "none", cursor: page === totalPages ? "not-allowed" : "pointer", opacity: page === totalPages ? 0.35 : 1, display: "flex" }}
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
