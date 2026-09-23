// ─── Barra de distribuição de status do evento ──────────────────────────────
// O header do grupo dizia só "N peças": para saber se o evento estava saudável
// era preciso expandir e ler linha a linha. A barra responde "onde está o
// gargalo" na unidade de decisão real — o evento — sem nenhum clique. Os NOMES
// saem de lib/status.ts; o tom é o da zona (tomDaZona), o mesmo da barra do
// fluxo no topo: escuro = perto da entrega. Um evento "quase todo escuro" está
// adiantado sem ninguém precisar decorar treze cores.
import { useMemo } from "react";
import { getStatusMeta } from "@/lib/status";
import { STATUS_GROUPS, GROUP_KEYS, computeStats } from "@/lib/painel-kpis";
import { N, T } from "@/lib/theme";
import { tomDaZona } from "./regras";

export function EventStatusBar({ items, width }: { items: Array<{ status?: string | null }>; width: number }) {
  const segments = useMemo(() => {
    const stats = computeStats(items);
    return GROUP_KEYS
      .map(k => ({ key: k, n: stats.byGroup[k], meta: getStatusMeta(STATUS_GROUPS[k][0]), tom: tomDaZona(k) }))
      .filter(s => s.n > 0);
  }, [items]);

  if (segments.length === 0) return null;
  const total = segments.reduce((a, s) => a + s.n, 0);
  const resumo = segments.map(s => `${s.meta.label}: ${s.n}`).join(" · ");

  return (
    <div
      title={resumo}
      aria-label={`Distribuição por etapa — ${resumo}`}
      role="img"
      style={{ display: "flex", width, height: 6, borderRadius: 999, overflow: "hidden", backgroundColor: N.n3, flexShrink: 0 }}
    >
      {segments.map((s, i) => (
        <div key={s.key} style={{ width: `${(s.n / total) * 100}%`, backgroundColor: s.tom, borderRight: i < segments.length - 1 ? `1px solid ${T.surface}` : "none" }} />
      ))}
    </div>
  );
}
