// ─────────────────────────────────────────────────────────────────────────────
// SELO DO KIT (dono, 14/09): "em todas as etapas tem que ser sinalizado que a
// peça é do Kit, e o prazo de entrega". Um componente só, usado em toda linha
// ou cartão de peça: some quando a peça é da Arena.
//
// COMPACTO (15/09): "KIT" em cima e "entrega 14/09" embaixo — numa linha só,
// o selo era cortado nas colunas estreitas de ID (Arte, lista do evento).
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
      style={{
        display: "inline-flex", flexDirection: "column", alignItems: "flex-start", gap: 0,
        whiteSpace: "nowrap", lineHeight: 1.15, maxWidth: "100%",
        color: "#5b21b6", backgroundColor: "#f5f3ff", border: "1px solid #ddd6fe",
        borderRadius: 6, padding: "2px 6px", verticalAlign: "middle", flexShrink: 0,
        ...style,
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em" }}>KIT</span>
      {entrega && <span style={{ fontSize: 9.5, fontWeight: 700 }}>entrega {entrega}</span>}
    </span>
  );
}
