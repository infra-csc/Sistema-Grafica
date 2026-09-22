// ─────────────────────────────────────────────────────────────────────────────
// O SELO DO PRAZO DO MOLDE (dono, 22/09) — nas telas do FLUXO do molde:
// Revisão Final, Gráfica, ficha da peça e Detalhe do evento. (Na Arte o prazo
// do molde substitui o da fase na própria coluna Prazo — ver arte.tsx.)
//
// Mesmo desenho do prazo das filas (PrazoInline: "29/07 · 3d atrasado"), com o
// rótulo "Prazo do molde" na frente. Não aparece para peça comum, nem para
// molde de evento sem prazo do molde — aí vale o prazo que sempre valeu.
// NÃO entra na Gestão de Prazos: só estas telas leem shared/prazo-molde.ts.
// ─────────────────────────────────────────────────────────────────────────────
import { PrazoInline } from "@/components/prazo-inline";
import { prazoDoMolde, ROTULO_PRAZO_MOLDE } from "@shared/prazo-molde";

export function SeloPrazoMolde({ item, evento, hoje, caixa }: {
  item: { id?: string; type?: string | null } | null | undefined;
  /** O evento da peça (o que tem `prazoMolde`). Sem ele, lê `item.event`. */
  evento?: { prazoMolde?: string | Date | null } | null;
  hoje?: Date;
  /** Sobre fundo escuro (cabeçalho da ficha): vai numa caixa clara, para as cores do prazo lerem. */
  caixa?: boolean;
}) {
  const p = prazoDoMolde(item, evento ?? (item as any)?.event ?? null, hoje ?? new Date());
  if (!p) return null;
  return (
    <span
      data-testid={`prazo-molde-${item?.id ?? ""}`}
      style={{
        display: "inline-flex", alignItems: "baseline", gap: 6, minWidth: 0, maxWidth: "100%",
        ...(caixa ? { background: "#ffffff", borderRadius: 8, padding: "4px 10px" } : null),
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 700, color: "#57534e", whiteSpace: "nowrap" }}>
        {ROTULO_PRAZO_MOLDE}
      </span>
      <PrazoInline diff={p.diff} date={p.date} label={ROTULO_PRAZO_MOLDE} />
    </span>
  );
}
