// ─── Chip de filtro ativo (removível) — linha abaixo da toolbar ─────────────
import { N, T } from "@/lib/theme";

// isMobile por PROP: como cada chip chamava useIsMobile(), 10 filtros ativos
// criavam 10 listeners de matchMedia para uma informação que o pai já tem.
export function FilterChip({ label, onRemove, isMobile }: { label: string; onRemove: () => void; isMobile: boolean }) {
  // Alvo de toque do ×: 24px no desktop, 32px no mobile. Margens negativas
  // compensam a área extra para o chip não inflar visualmente.
  const hit = isMobile ? 32 : 24;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      backgroundColor: N.n2, border: `1px solid ${T.border}`, borderRadius: 999,
      padding: "3px 6px 3px 10px", fontSize: 11, fontWeight: 600, color: T.strong,
      whiteSpace: "nowrap", maxWidth: 280, overflow: "hidden",
    }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        style={{
          background: "none", border: "none", cursor: "pointer", color: T.second,
          fontSize: 13, fontWeight: 800, padding: 0, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          minWidth: hit, minHeight: hit,
          margin: `${-(hit - 18) / 2}px ${-(hit - 18) / 2}px ${-(hit - 18) / 2}px -2px`,
        }}
      >
        ×
      </button>
    </span>
  );
}
