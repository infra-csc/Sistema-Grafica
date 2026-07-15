import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, Save } from "lucide-react";

/* ── Constants ── */
const QUOTAS = [
  { key: "MASTER",     label: "Master",     color: "#ef4444", bg: "#fef2f2" },
  { key: "GOLD",       label: "Gold",       color: "#1d4ed8", bg: "#eff6ff" },
  { key: "SILVER",     label: "Silver",     color: "#7c3aed", bg: "#f5f3ff" },
  { key: "APOIO",      label: "Apoio",      color: "#6b7280", bg: "#f9fafb" },
  { key: "MIDIA",      label: "Mídia",      color: "#0891b2", bg: "#ecfeff" },
  { key: "MINISTERIO", label: "Ministério", color: "#059669", bg: "#ecfdf5" },
];

const T = {
  bg: "#f9f9f8", surface: "#ffffff", border: "#e8e8e7",
  text: "#1a1c1c", second: "#78716c", muted: "#a8a29e",
  accent: "#f97316", dark: "#1c1917", low: "#f3f4f3",
};

// Regras padrão (usadas quando ainda não há configuração salva)
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

  // Local matrix state: quota → Set<itemType>
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());

  /* ── Queries ── */
  // All distinct item types (parent groups) across all events
  const { data: groups = [], isLoading: groupsLoading } = useQuery<string[]>({
    queryKey: ["/api/quota-rules/groups"],
  });

  // Global quota rules
  const { data: rules = [], isLoading: rulesLoading } = useQuery<GlobalRule[]>({
    queryKey: ["/api/quota-rules/global"],
  });

  const isLoading = groupsLoading || rulesLoading;

  // Sync matrix when rules or groups load
  useEffect(() => {
    if (isLoading) return;
    const m: Record<string, Set<string>> = {};
    for (const q of QUOTAS) m[q.key] = new Set();

    if (rules.length > 0) {
      for (const rule of rules) {
        m[rule.quota] = new Set(rule.itemTypes);
      }
      setDirty(new Set());
    } else {
      // Pre-fill with defaults, intersected against known groups if any exist
      for (const q of QUOTAS) {
        const defaults = DEFAULT_QUOTA_RULES[q.key] ?? [];
        m[q.key] = new Set(
          groups.length > 0
            ? defaults.filter(t => groups.includes(t))
            : defaults
        );
      }
      setDirty(new Set(QUOTAS.map(q => q.key)));
    }

    setMatrix(m);
  }, [rules, groups, isLoading]);

  /* ── Save mutation ── */
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

  return (
    <div style={{ backgroundColor: T.bg, height: "100%", overflowY: "auto", padding: "36px 40px 80px" }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 36, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 900, color: T.accent, textTransform: "uppercase", letterSpacing: "0.2em", fontFamily: "'Space Grotesk', sans-serif" }}>
            Automação de Vinculação
          </span>
          <h1 style={{ fontSize: 42, fontWeight: 900, color: T.text, margin: "6px 0 0", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "-0.04em", lineHeight: 1 }}>
            Configurar Cotas
          </h1>
          <p style={{ fontSize: 13, color: T.second, margin: "10px 0 0", maxWidth: 560 }}>
            Defina quais grupos de peças cada cota de patrocinador recebe. Esta é uma configuração global usada no Auto-vincular.
          </p>
        </div>
        {dirty.size > 0 && (
          <button
            onClick={saveAll}
            disabled={saveMutation.isPending}
            data-testid="save-all-button"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", backgroundColor: T.dark, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.12em", flexShrink: 0, opacity: saveMutation.isPending ? 0.7 : 1 }}
          >
            <Save style={{ width: 14, height: 14 }} />
            Salvar Todas ({dirty.size})
          </button>
        )}
      </div>

      {/* ── Matrix ── */}
      <div style={{ backgroundColor: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: "hidden" }}>

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: `220px repeat(${QUOTAS.length}, 1fr)`, borderBottom: `1px solid ${T.border}`, backgroundColor: T.low }}>
          <div style={{ padding: "14px 20px", fontSize: 10, fontWeight: 900, color: T.muted, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "'Space Grotesk', sans-serif" }}>
            Grupo de Peça
          </div>
          {QUOTAS.map(q => {
            const count = matrix[q.key]?.size ?? 0;
            const isDirtyQ = dirty.has(q.key);
            return (
              <div key={q.key} style={{ padding: "12px 10px", borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: q.color, textTransform: "uppercase", letterSpacing: "0.12em", fontFamily: "'Space Grotesk', sans-serif" }}>
                    {q.label}
                  </span>
                  <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>{count} grupo{count !== 1 ? "s" : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => selectAll(q.key)} title="Selecionar todos" style={{ fontSize: 9, fontWeight: 700, color: q.color, background: q.bg, border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>Todos</button>
                  <button onClick={() => clearAll(q.key)} title="Limpar todos" style={{ fontSize: 9, fontWeight: 700, color: T.muted, background: T.low, border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>Limpar</button>
                </div>
                {isDirtyQ && (
                  <button
                    onClick={() => saveQuota(q.key)}
                    disabled={saveMutation.isPending}
                    data-testid={`save-quota-${q.key}`}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, fontWeight: 900, color: "#fff", background: T.dark, border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}
                  >
                    <Save style={{ width: 9, height: 9 }} />
                    Salvar
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Rows: parent groups */}
        {isLoading ? (
          <div style={{ padding: "48px 0", textAlign: "center", fontSize: 13, color: T.muted }}>Carregando...</div>
        ) : groups.length === 0 ? (
          <div style={{ padding: "60px 0", textAlign: "center" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: T.second, margin: "0 0 6px" }}>Nenhum grupo de peça encontrado</p>
            <p style={{ fontSize: 12, color: T.muted, margin: 0 }}>Importe eventos com itens para que os grupos apareçam aqui</p>
          </div>
        ) : (
          groups.map((group, idx) => (
            <div
              key={group}
              style={{ display: "grid", gridTemplateColumns: `220px repeat(${QUOTAS.length}, 1fr)`, borderBottom: idx < groups.length - 1 ? `1px solid ${T.low}` : "none" }}
            >
              <div style={{ padding: "12px 20px", display: "flex", alignItems: "center" }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>{group}</span>
              </div>
              {QUOTAS.map(q => {
                const checked = matrix[q.key]?.has(group) ?? false;
                return (
                  <div
                    key={q.key}
                    onClick={() => toggleCell(q.key, group)}
                    data-testid={`cell-${q.key}-${group}`}
                    style={{ borderLeft: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backgroundColor: checked ? q.bg : "transparent", transition: "background 0.1s" }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5,
                      border: checked ? `2px solid ${q.color}` : `2px solid ${T.border}`,
                      backgroundColor: checked ? q.color : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.12s", flexShrink: 0,
                    }}>
                      {checked && <Check style={{ width: 12, height: 12, color: "#fff" }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* Footer */}
        {!isLoading && groups.length > 0 && (
          <div style={{ padding: "12px 20px", backgroundColor: T.low, borderTop: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>
              {groups.length} grupo{groups.length !== 1 ? "s" : ""} de peça · Clique nas células para ativar/desativar
            </span>
            {dirty.size > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>
                {dirty.size} cota{dirty.size !== 1 ? "s" : ""} com alterações não salvas
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
