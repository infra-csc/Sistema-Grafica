import { useState } from "react";

interface Sponsor {
  id: string;
  name: string;
  color?: string | null;
  /** Status da aprovação deste patrocinador para a peça, quando disponível. */
  approvalStatus?: "approved" | "rejected" | "pending" | null;
}

interface SponsorChipsProps {
  sponsors: Sponsor[];
  max?: number;
  variant?: "orange" | "gray" | "plain" | "dark" | "colored";
  size?: "xs" | "sm" | "md";
  emptyText?: string;
}

const VARIANT_STYLES = {
  orange: {
    bg: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: 4,
  },
  gray: {
    bg: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", borderRadius: 4,
  },
  plain: {
    bg: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6,
  },
  dark: {
    bg: "#292524", color: "#e7e5e4", border: "1px solid #44403c", borderRadius: 4,
  },
  colored: {
    bg: "#f5f5f4", color: "#57534e", border: "1px solid #e7e5e4", borderRadius: 4,
  },
};

const SIZE_STYLES = {
  xs: { fontSize: 9,  fontWeight: 700, padding: "1px 5px" },
  sm: { fontSize: 10, fontWeight: 700, padding: "2px 6px" },
  md: { fontSize: 12, fontWeight: 600, padding: "3px 8px" },
};

const OVERFLOW_STYLES = {
  orange:  { bg: "#fed7aa", color: "#92400e" },
  gray:    { bg: "#e7e5e4", color: "#78716c" },
  plain:   { bg: "#e2e8f0", color: "#64748b" },
  dark:    { bg: "#44403c", color: "#a8a29e" },
  colored: { bg: "#e7e5e4", color: "#78716c" },
};

/** Convert a hex color to rgba with given alpha */
function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function SponsorChips({
  sponsors,
  max = 2,
  variant = "gray",
  size = "sm",
  emptyText = "—",
}: SponsorChipsProps) {
  const [showAll, setShowAll] = useState(false);

  if (!sponsors || sponsors.length === 0) {
    return (
      <span style={{ fontSize: 12, color: "#a8a29e", fontStyle: "italic" }}>
        {emptyText}
      </span>
    );
  }

  const chip = VARIANT_STYLES[variant];
  const sz   = SIZE_STYLES[size];
  const ovf  = OVERFLOW_STYLES[variant];

  const visible  = showAll ? sponsors : sponsors.slice(0, max);
  const overflow = sponsors.length - max;

  const allNames = sponsors.map(s => s.name).join(", ");

  return (
    <div
      style={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "center" }}
      title={allNames}
    >
      {visible.map(s => {
        const c = s.color && s.color.startsWith("#") ? s.color : null;
        const useColor = variant === "colored" && c;
        const bg     = useColor ? hexToRgba(c!, 0.10) : chip.bg;
        const color  = useColor ? c! : chip.color;
        const border = useColor ? `1px solid ${hexToRgba(c!, 0.30)}` : chip.border;
        // Status da aprovação: mantém a identidade visual (cor do patrocinador)
        // e sinaliza a decisão — aprovado some com a dúvida, reprovado salta aos olhos.
        const st = s.approvalStatus;
        const statusTitle = st === "approved" ? "Aprovado"
          : st === "rejected" ? "Reprovado"
          : st === "pending" ? "Aguardando aprovação" : undefined;
        return (
          <span
            key={s.id}
            title={statusTitle ? `${s.name} — ${statusTitle}` : s.name}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              backgroundColor: st === "rejected" ? "#fef2f2" : st === "approved" ? "#f0fdf4" : bg,
              color: st === "rejected" ? "#b91c1c" : st === "approved" ? "#15803d" : color,
              border: st === "rejected" ? "1px solid #fecaca" : st === "approved" ? "1px solid #bbf7d0" : border,
              borderRadius: chip.borderRadius,
              whiteSpace: "nowrap",
              ...sz,
            }}
          >
            {useColor && (
              <span style={{
                width: 5, height: 5, borderRadius: "50%",
                background: c!, flexShrink: 0, display: "inline-block",
              }} />
            )}
            {s.name}
            {st === "approved" && <span style={{ fontWeight: 900, lineHeight: 1 }}>✓</span>}
            {st === "rejected" && <span style={{ fontWeight: 900, lineHeight: 1 }}>✕</span>}
            {st === "pending" && <span style={{ opacity: 0.55, lineHeight: 1 }}>•</span>}
          </span>
        );
      })}
      {!showAll && overflow > 0 && (
        <button
          onClick={e => { e.stopPropagation(); setShowAll(true); }}
          title={`Ver todos: ${allNames}`}
          style={{
            display: "inline-flex", alignItems: "center",
            backgroundColor: ovf.bg, color: ovf.color,
            border: "none", borderRadius: chip.borderRadius,
            cursor: "pointer", whiteSpace: "nowrap",
            ...sz,
          }}
        >
          +{overflow}
        </button>
      )}
      {showAll && sponsors.length > max && (
        <button
          onClick={e => { e.stopPropagation(); setShowAll(false); }}
          style={{
            display: "inline-flex", alignItems: "center",
            backgroundColor: "transparent", color: "#a8a29e",
            border: "none", borderRadius: chip.borderRadius,
            cursor: "pointer", fontSize: sz.fontSize, fontWeight: 700,
            padding: sz.padding,
          }}
        >
          ↑
        </button>
      )}
    </div>
  );
}
