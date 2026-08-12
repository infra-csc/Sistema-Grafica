// Pill de status compartilhado — cores/rótulos vêm de lib/status.ts (fonte
// única). Substitui as cópias locais que existiam no Painel Geral e na Gráfica:
// mesma peça aparecia com pill diferente por tela.
//
// - size "md" (padrão): 11px com bolinha — o formato do Painel Geral.
// - size "sm": 10px uppercase compacto — para tabelas densas (Gráfica).
import { getStatusMeta } from "@/lib/status";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function StatusPill({ status, size = "md", showDot = true }: StatusPillProps) {
  const cfg = getStatusMeta(status);
  const sm = size === "sm";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: showDot ? 6 : 0,
      padding: "3px 10px",
      backgroundColor: cfg.bg,
      color: cfg.text,
      border: `1px solid ${cfg.border}`,
      borderRadius: 999,
      fontSize: sm ? 10 : 11,
      fontWeight: sm ? 800 : 700,
      ...(sm ? { textTransform: "uppercase" as const, letterSpacing: "0.05em" } : {}),
      whiteSpace: "nowrap",
    }}>
      {showDot && <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />}
      {cfg.short}
    </span>
  );
}
