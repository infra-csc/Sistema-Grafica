// ─────────────────────────────────────────────────────────────────────────────
// SELO DO KIT (dono, 14/09): "em todas as etapas tem que ser sinalizado que a
// peça é do Kit, e o prazo de entrega". Um componente só, usado em toda linha
// ou cartão de peça: some quando a peça é da Arena.
//
// SÓ "KIT" (dono, 23/10): o Kit deixou de ter datas próprias — segue os
// prazos do evento a partir da Aprovação de layout, que é o que o title diz.
// ─────────────────────────────────────────────────────────────────────────────
import { DETALHE_DO_SELO_KIT, TEXTO_DO_SELO_KIT } from "@shared/kit";
import { ehMolde } from "@shared/molde";

import { T, N, TOM, FS, FW } from "@/lib/theme";
import { Selo } from "@/components/ui/selo";

// A forma é o <Selo> do design system; a medida continua a do selo de linha
// (10px, 1px×7px): ele divide a célula do ID com o código da peça, e o Selo
// padrão (3px×10px) empurraria a linha. Caixa-alta já vem no texto.
const MEDIDA_DO_SELO: React.CSSProperties = {
  fontSize: FS.micro, fontWeight: FW.rotulo, lineHeight: 1.3, letterSpacing: "0.04em",
  padding: "1px 7px", verticalAlign: "middle", flexShrink: 0,
};
/**
 * SELO DO MOLDE (dono, 22/09) — o molde tem fluxo curto (Arte → Revisão →
 * Produzido) e precisa se declarar em toda linha, como o Kit. Mora AQUI porque
 * o SeloKit já está em todas as linhas e cartões de peça: o molde aparece em
 * todas elas sem tocar em cada tela.
 */
export function SeloMolde({ peca, style }: { peca: { id: string; type?: string | null }; style?: React.CSSProperties }) {
  if (!ehMolde(peca)) return null;
  return (
    <Selo
      data-testid={`selo-molde-${peca.id}`}
      title="Molde — fluxo curto: Arte (thumb) → Revisão Final → Produzido. Sem patrocinador, arquivo final, impressora, conferência ou entrega."
      aria-label="Molde"
      cores={{ text: T.strong, bg: N.n2, border: T.bdark }}
      style={{ ...MEDIDA_DO_SELO, ...style }}
    >
      MOLDE
    </Selo>
  );
}

export function SeloKit({ peca, style }: {
  peca: { id: string; type?: string | null; kitRemessaId?: string | null };
  style?: React.CSSProperties;
}) {
  // O molde se declara junto (ver SeloMolde): peça do Kit que é molde mostra os dois.
  if (!peca.kitRemessaId) return <SeloMolde peca={peca} style={style} />;
  if (ehMolde(peca)) return <><SeloKitSo peca={peca} style={style} /><SeloMolde peca={peca} style={style} /></>;
  return <SeloKitSo peca={peca} style={style} />;
}

function SeloKitSo({ peca, style }: {
  peca: { id: string };
  style?: React.CSSProperties;
}) {
  return (
    <Selo
      data-testid={`selo-kit-${peca.id}`}
      className="selo-kit"
      title={DETALHE_DO_SELO_KIT}
      aria-label="Peça do Kit"
      cores={TOM.roxo}
      style={{ ...MEDIDA_DO_SELO, ...style }}
    >
      {TEXTO_DO_SELO_KIT}
    </Selo>
  );
}
