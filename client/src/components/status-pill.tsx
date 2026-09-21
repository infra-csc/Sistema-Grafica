// Pill de status compartilhado — cores/rótulos vêm de lib/status.ts (fonte
// única). Substitui as cópias locais que existiam no Painel Geral e na Gráfica:
// mesma peça aparecia com pill diferente por tela.
//
// - size "md" (padrão): 11px com bolinha — o formato do Painel Geral.
// - size "sm": 10px uppercase compacto — para tabelas densas (Gráfica).
//
// Carrega o significado do status do mesmo jeito que o StatusBadge (ver o
// comentário lá): `title` com a frase inteira, "vez de quem" para o leitor de
// tela e o balão ao tocar quando o pill não está dentro de uma linha clicável.
import { getStatusMeta, descricaoDoStatus } from "@/lib/status";
import { useBalaoDeStatus } from "@/components/ui/balao-de-status";

interface StatusPillProps {
  status: string;
  size?: "sm" | "md";
  showDot?: boolean;
}

export function StatusPill({ status, size = "md", showDot = true }: StatusPillProps) {
  const cfg = getStatusMeta(status);
  const sm = size === "sm";
  const { guia, handlers, describedBy, balao } = useBalaoDeStatus(status);
  // A pílula só mostra o rótulo CURTO; o title devolve o nome inteiro do
  // status (e o que ele significa) a quem precisa confirmar ("Aguard." de quê?).
  return (
    <span className={sm ? "status-pill-sm" : undefined} title={descricaoDoStatus(status) ?? cfg.label} aria-describedby={describedBy} {...handlers} style={{
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
      {showDot && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: cfg.dot, flexShrink: 0 }} />}
      {/* O rótulo curto fica para os olhos; o leitor de tela ouve o nome
          inteiro — "Pronto Prod." não é palavra que se pronuncie. */}
      <span aria-hidden="true">{cfg.short}</span>
      <span className="sr-only">{cfg.label}{guia ? ` (${guia.vez})` : ""}</span>
      {balao}
    </span>
  );
}
