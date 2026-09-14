// ─────────────────────────────────────────────────────────────────────────────
// SELO DO KIT (dono, 14/09): "em todas as etapas tem que ser sinalizado que a
// peça é do Kit, e o prazo de entrega". Um componente só, usado em toda linha
// ou cartão de peça: some quando a peça é da Arena.
// ─────────────────────────────────────────────────────────────────────────────
import { detalheDaRemessa, textoDoSeloKit, type RemessaDoKit } from "@shared/kit";

export function SeloKit({ peca, style }: {
  peca: { id: string; kitRemessaId?: string | null; kitRemessa?: Partial<RemessaDoKit> | null };
  style?: React.CSSProperties;
}) {
  if (!peca.kitRemessaId) return null;
  return (
    <span
      data-testid={`selo-kit-${peca.id}`}
      title={detalheDaRemessa(peca.kitRemessa)}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
        color: "#5b21b6", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe",
        borderRadius: 6, padding: "1px 6px", verticalAlign: "middle",
        ...style,
      }}
    >
      {textoDoSeloKit(peca.kitRemessa)}
    </span>
  );
}
