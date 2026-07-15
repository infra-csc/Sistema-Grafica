import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Save, Search, X } from "lucide-react";

/* ── Constants ── */
const QUOTAS = [
  { key: "MASTER",     label: "Master",     color: "#ef4444", bg: "#fef2f2", light: "#fee2e2" },
  { key: "GOLD",       label: "Gold",       color: "#1d4ed8", bg: "#eff6ff", light: "#dbeafe" },
  { key: "SILVER",     label: "Silver",     color: "#7c3aed", bg: "#f5f3ff", light: "#ede9fe" },
  { key: "APOIO",      label: "Apoio",      color: "#6b7280", bg: "#f9fafb", light: "#f3f4f6" },
  { key: "MIDIA",      label: "Mídia",      color: "#0891b2", bg: "#ecfeff", light: "#cffafe" },
  { key: "MINISTERIO", label: "Ministério", color: "#059669", bg: "#ecfdf5", light: "#d1fae5" },
];

const T = {
  bg: "#f9f9f8", surface: "#ffffff", border: "#e8e8e7",
  text: "#1a1c1c", second: "#78716c", muted: "#a8a29e",
  accent: "#f97316", dark: "#1c1917", low: "#f5f5f4", stripe: "#fafaf9",
};

const DEFAULT_QUOTA_RULES: Record<string, string[]> = {
  MASTER:     ["Palco", "Gradil", "Pórtico", "Rolo"],
  GOLD:       ["Palco", "Gradil", "Pórtico", "Rolo"],
  SILVER:     ["Palco", "Gradil", "Pórtico"],
  APOIO:      ["Palco", "Gradil", "Pórtico"],
  MIDIA:      ["Palco", "Gradil", "Pórtico", "Rolo"],
  MINISTERIO: [],
};

type GlobalRule = { quota: string; itemTypes: string[] };

export default function ConfigurarCotas() {
  const { toast } = useToast();
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const { data: groups = [], isLoading: groupsLoading } = useQuery<string[]>({
    queryKey: ["/api/quota-rules/groups"],
  });

  const { data: rules = [], isLoading: rulesLoading } = useQuery<GlobalRule[]>({
    queryKey: ["/api/quota-rules/global"],
  });

  const isLoading = groupsLoading || rulesLoading;

  useEffect(() => {
    if (isLoading) return;
    const m: Record<string, Set<string>> = {};
    for (const q of QUOTAS) m[q.key] = new Set();
    if (rules.length > 0) {
      for (const rule of rules) m[rule.quota] = new Set(rule.itemTypes);
      setDirty(new Set());
    } else {
      for (const q of QUOTAS) {
        const defaults = DEFAULT_QUOTA_RULES[q.key] ?? [];
        m[q.key] = new Set(groups.length > 0 ? defaults.filter(t => groups.includes(t)) : defaults);
      }
      setDirty(new Set(QUOTAS.map(q => q.key)));
    }
    setMatrix(m);
  }, [rules, groups, isLoading]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups.filter(g => g.toLowerCase().includes(q));
  }, [groups, search]);

  const saveMutation = useMutation({
    mutationFn: async ({ quota, itemTypes }: { quota: string; itemTypes: string[] }) => {
      const res = await apiRequest("PUT", `/api/quota-rules/global`, { quota, itemTypes });
      return res.json();
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quota-rules/global"] });
      setDirty(prev => { const n = new Set(prev); n.delete(vars.quota); return n; });
      toast({ title: `Regras para ${vars.quota} salvas` });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Erro ao salvar", description: e.message }),
  });

  const toggleCell = (quota: string, type: string) => {
    setMatrix(prev => {
      const cur = new Set(prev[quota] ?? []);
      if (cur.has(type)) cur.delete(type); else cur.add(type);
      return { ...prev, [quota]: cur };
    });
    setDirty(prev => new Set(prev).add(quota));
  };

  const selectAll = (quota: string) => {
    setMatrix(prev => ({ ...prev, [quota]: new Set(groups) }));
    setDirty(prev => new Set(prev).add(quota));
  };

  const clearAll = (quota: string) => {
    setMatrix(prev => ({ ...prev, [quota]: new Set() }));
    setDirty(prev => new Set(prev).add(quota));
  };

  const saveQuota = (quota: string) => {
    saveMutation.mutate({ quota, itemTypes: Array.from(matrix[quota] ?? []) });
  };

  const saveAll = async () => {
    for (const q of Array.from(dirty)) {
      await saveMutation.mutateAsync({ quota: q, itemTypes: Array.from(matrix[q] ?? []) });
    }
  };

  const COLS = `200px repeat(${QUOTAS.length}, 1fr)`;

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: "32px 36px 80px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 900, color: T.accent, textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "'Space Grotesk', sans-serif" }}>
            Automação de Vinculação
          </span>
          <h1 style={{ fontSize: 36, fontWeight: 900, color: T.text, margin: "6px 0 0", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.03em", lineHeight: 1 }}>
            Configurar Cotas
          </h1>
          <p style={{ fontSize: 12, color: T.second, margin: "8px 0 0", maxWidth: 520 }}>
            Defina quais grupos de peças cada cota de patrocinador recebe. Configuração global usada no Auto-vincular.
          </p>
        </div>
        {dirty.size > 0 && (
          <button
            onClick={saveAll}
            disabled={saveMutation.isPending}
            data-testid="save-all-button"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", flexShrink: 0, opacity: saveMutation.isPending ? 0.7 : 1 }}
          >
            <Save style={{ width: 13, height: 13 }} />
            Salvar Tudo ({dirty.size})
          </button>
        )}
      </div>

      {/* ── Matrix card ── */}
      <div style={{ backgroundColor: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>

        {/* ── Sticky header ── */}
        <div style={{
          position: "sticky", top: 0, zIndex: 10,
          display: "grid", gridTemplateColumns: COLS,
          borderBottom: `2px solid ${T.border}`,
          backgroundColor: T.surface,
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}>
          {/* Left corner: search */}
          <div style={{ padding: "14px 16px", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "'Space Grotesk', sans-serif" }}>
              Grupo de Peça
            </span>
            {groups.length > 6 && (
              <div style={{ position: "relative" }}>
                <Search style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", width: 12, height: 12, color: T.muted }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Filtrar grupos..."
                  data-testid="input-search-groups"
                  style={{ width: "100%", padding: "5px 24px 5px 24px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 6, background: T.low, color: T.text, outline: "none", boxSizing: "border-box" }}
                />
                {search && (
                  <button onClick={() => setSearch("")} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                    <X style={{ width: 11, height: 11, color: T.muted }} />
                  </button>
                )}
              </div>
            )}
            {!isLoading && (
              <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>
                {search ? `${filteredGroups.length} de ${groups.length}` : `${groups.length} grupos`}
              </span>
            )}
          </div>

          {/* Quota columns */}
          {QUOTAS.map(q => {
            const count = matrix[q.key]?.size ?? 0;
            const isDirtyQ = dirty.has(q.key);
            return (
              <div key={q.key} style={{
                padding: "14px 10px 12px",
                borderLeft: `1px solid ${T.border}`,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                backgroundColor: isDirtyQ ? q.bg : T.surface,
                transition: "background 0.15s",
              }}>
                {/* Label + count */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: q.color, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {q.label}
                  </div>
                  <div style={{
                    marginTop: 3,
                    display: "inline-block",
                    padding: "1px 8px",
                    borderRadius: 99,
                    backgroundColor: count > 0 ? q.light : T.low,
                    fontSize: 10, fontWeight: 700,
                    color: count > 0 ? q.color : T.muted,
                  }}>
                    {count} grupo{count !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Actions row */}
                <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <button
                    onClick={() => selectAll(q.key)}
                    data-testid={`btn-all-${q.key}`}
                    style={{ fontSize: 9, fontWeight: 700, color: q.color, background: q.bg, border: `1px solid ${q.light}`, borderRadius: 4, padding: "2px 7px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => clearAll(q.key)}
                    data-testid={`btn-clear-${q.key}`}
                    style={{ fontSize: 9, fontWeight: 700, color: T.muted, background: T.low, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 7px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}
                  >
                    Limpar
                  </button>
                  {isDirtyQ && (
                    <button
                      onClick={() => saveQuota(q.key)}
                      disabled={saveMutation.isPending}
                      data-testid={`save-quota-${q.key}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, backgroundColor: T.dark, border: "none", borderRadius: 4, cursor: "pointer", opacity: saveMutation.isPending ? 0.6 : 1, flexShrink: 0 }}
                      title={`Salvar ${q.label}`}
                    >
                      <Save style={{ width: 11, height: 11, color: "#fff" }} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Rows ── */}
        {isLoading ? (
          <div style={{ padding: "56px 0", textAlign: "center" }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ height: 40, margin: "2px 0", background: T.low, borderRadius: 4, animation: "pulse 1.5s infinite", opacity: 0.5 }} />
            ))}
          </div>
        ) : filteredGroups.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            {search ? (
              <>
                <p style={{ fontSize: 13, fontWeight: 700, color: T.second, margin: "0 0 4px" }}>Nenhum grupo encontrado para "{search}"</p>
                <button onClick={() => setSearch("")} style={{ fontSize: 12, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Limpar filtro</button>
              </>
            ) : (
              <>
                <p style={{ fontSize: 14, fontWeight: 700, color: T.second, margin: "0 0 6px" }}>Nenhum grupo de peça encontrado</p>
                <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Importe eventos com itens para que os grupos apareçam aqui</p>
              </>
            )}
          </div>
        ) : (
          filteredGroups.map((group, idx) => {
            const isEven = idx % 2 === 0;
            return (
              <div
                key={group}
                style={{
                  display: "grid", gridTemplateColumns: COLS,
                  borderBottom: idx < filteredGroups.length - 1 ? `1px solid ${T.border}` : "none",
                  backgroundColor: isEven ? T.surface : T.stripe,
                }}
              >
                {/* Group name */}
                <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", borderRight: `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>
                    {group}
                  </span>
                </div>

                {/* Quota cells */}
                {QUOTAS.map(q => {
                  const checked = matrix[q.key]?.has(group) ?? false;
                  return (
                    <div
                      key={q.key}
                      onClick={() => toggleCell(q.key, group)}
                      data-testid={`cell-${q.key}-${group}`}
                      style={{
                        borderLeft: `1px solid ${T.border}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer",
                        backgroundColor: checked ? q.bg : "transparent",
                        transition: "background 0.1s",
                        minHeight: 40,
                      }}
                    >
                      <div style={{
                        width: 18, height: 18, borderRadius: 4,
                        border: checked ? `2px solid ${q.color}` : `2px solid ${T.border}`,
                        backgroundColor: checked ? q.color : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.12s",
                        flexShrink: 0,
                      }}>
                        {checked && <Check style={{ width: 11, height: 11, color: "#fff" }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        {/* ── Footer ── */}
        {!isLoading && groups.length > 0 && (
          <div style={{ padding: "10px 16px", backgroundColor: T.low, borderTop: `2px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
              {filteredGroups.length} de {groups.length} grupo{groups.length !== 1 ? "s" : ""} · clique nas células para marcar
            </span>
            {dirty.size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>
                {dirty.size} cota{dirty.size !== 1 ? "s" : ""} com alterações — lembre de salvar
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
