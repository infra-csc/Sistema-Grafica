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
import { ehMolde } from "@shared/molde";

import { T, N, TOM } from "@/lib/theme";
/**
 * SELO DO MOLDE (dono, 22/09) — o molde tem fluxo curto (Arte → Revisão →
 * Produzido) e precisa se declarar em toda linha, como o Kit. Mora AQUI porque
 * o SeloKit já está em todas as linhas e cartões de peça: o molde aparece em
 * todas elas sem tocar em cada tela.
 */
export function SeloMolde({ peca, style }: { peca: { id: string; type?: string | null }; style?: React.CSSProperties }) {
  if (!ehMolde(peca)) return null;
  return (
    <span
      data-testid={`selo-molde-${peca.id}`}
      title="Molde — fluxo curto: Arte (thumb) → Revisão Final → Produzido. Sem patrocinador, arquivo final, impressora, conferência ou entrega."
      aria-label="Molde"
      style={{
        display: "inline-flex", alignItems: "center", whiteSpace: "nowrap",
        fontSize: 10, fontWeight: 800, lineHeight: 1.3, letterSpacing: "0.04em",
        color: T.strong, backgroundColor: N.n2, border: `1px solid ${T.bdark}`,
        borderRadius: 999, padding: "1px 7px", verticalAlign: "middle", flexShrink: 0,
        ...style,
      }}
    >
      MOLDE
    </span>
  );
}

export function SeloKit({ peca, style }: {
  peca: { id: string; type?: string | null; kitRemessaId?: string | null; kitRemessa?: Partial<RemessaDoKit> | null };
  style?: React.CSSProperties;
}) {
  // O molde se declara junto (ver SeloMolde): peça do Kit que é molde mostra os dois.
  if (!peca.kitRemessaId) return <SeloMolde peca={peca} style={style} />;
  if (ehMolde(peca)) return <><SeloKitSo peca={peca} style={style} /><SeloMolde peca={peca} style={style} /></>;
  return <SeloKitSo peca={peca} style={style} />;
}

function SeloKitSo({ peca, style }: {
  peca: { id: string; kitRemessaId?: string | null; kitRemessa?: Partial<RemessaDoKit> | null };
  style?: React.CSSProperties;
}) {
  const entrega = diaMesDoKit(peca.kitRemessa?.entregaMaterial);
  return (
    <span
      data-testid={`selo-kit-${peca.id}`}
      className="selo-kit"
      title={detalheDaRemessa(peca.kitRemessa)}
      aria-label={`Peça do Kit${entrega ? `, entrega ${entrega}` : ""}`}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
        fontSize: 10, fontWeight: 800, lineHeight: 1.3, letterSpacing: "0.04em",
        color: TOM.roxo.text, backgroundColor: TOM.roxo.bg, border: `1px solid ${TOM.roxo.border}`,
        borderRadius: 999, padding: "1px 7px", verticalAlign: "middle", flexShrink: 0,
        fontVariantNumeric: "tabular-nums",
        ...style,
      }}
    >
      KIT{entrega ? <span style={{ fontWeight: 700, color: TOM.roxo.text }}>· {entrega}</span> : null}
    </span>
  );
}
