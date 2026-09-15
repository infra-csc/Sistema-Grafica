// ─────────────────────────────────────────────────────────────────────────────
// SELO DO KIT (dono, 14/09): "em todas as etapas tem que ser sinalizado que a
// peça é do Kit, e o prazo de entrega". Um componente só, usado em toda linha
// ou cartão de peça: some quando a peça é da Arena.
//
// UMA LINHA, CURTA (15/09): "KIT · 14/09". A versão longa ("KIT · entrega
// 14/09") cortava nas colunas de ID, e a de duas linhas ficou pesada. O
// detalhe completo (versão, entrega, caminhão) está no title.
// ─────────────────────────────────────────────────────────────────────────────
import { detalheDaRemessa, diaMesDoKit, type RemessaDoKit } from "@shared/kit";

export function SeloKit({ peca, style }: {
  peca: { id: string; kitRemessaId?: string | null; kitRemessa?: Partial<RemessaDoKit> | null };
  style?: React.CSSProperties;
}) {
  if (!peca.kitRemessaId) return null;
  const entrega = diaMesDoKit(peca.kitRemessa?.entregaMaterial);
  return (
    <span
      data-testid={`selo-kit-${peca.id}`}
      title={detalheDaRemessa(peca.kitRemessa)}
      aria-label={`Peça do Kit${entrega ? `, entrega ${entrega}` : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        fontSize: 10, fontWeight: 800, lineHeight: 1.3, letterSpacing: "0.04em",
        color: "#6d28d9", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe",
        borderRadius: 999, padding: "1px 7px", verticalAlign: "middle", flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      KIT{entrega ? <span style={{ fontWeight: 700, color: "#7c3aed" }}>· {entrega}</span> : null}
    </span>
  );
}
