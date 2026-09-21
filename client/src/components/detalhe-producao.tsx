// A linha discreta que acompanha o selo de status FORA da Gráfica: "Impressora
// 2 · 3 de 10 impressas", "Tubo 2 · fechado 14:32", "Recebida por Fulano".
// A regra mora em lib/detalhe-producao.ts (pura e testada); aqui é só a forma:
// texto secundário de 12px, sem fundo nem borda, para não virar um segundo selo.
import type { CSSProperties } from "react";
import { detalheDaProducao, type PecaComProducao } from "@/lib/detalhe-producao";

export function DetalheProducao({ item, style }: { item: PecaComProducao | null | undefined; style?: CSSProperties }) {
  const frase = detalheDaProducao(item);
  if (!frase) return null;
  return (
    <div
      data-testid="detalhe-producao"
      style={{ fontSize: 12, lineHeight: 1.35, color: "#57534e", fontWeight: 500, marginTop: 2, fontVariantNumeric: "tabular-nums", ...style }}
    >
      {frase}
    </div>
  );
}
