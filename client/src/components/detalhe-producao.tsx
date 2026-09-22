// A linha discreta que acompanha o selo de status FORA da Gráfica: "Impressora
// 2 · 3 de 10 impressas", "Tubo 2 · fechado 14:32", "Recebida por Fulano".
// A regra mora em lib/detalhe-producao.ts (pura e testada); aqui é só a forma:
// texto secundário de 12px, sem fundo nem borda, para não virar um segundo selo.
import type { CSSProperties } from "react";
import { detalheDaProducao, type PecaComProducao } from "@/lib/detalhe-producao";
import { pecaTravada, fraseDaTrava, seloDaTrava } from "@shared/trava-da-peca";

export function DetalheProducao({ item, style }: { item: (PecaComProducao & { travadaEm?: string | Date | null; travadaPor?: string | null; travadaMotivo?: string | null }) | null | undefined; style?: CSSProperties }) {
  const frase = detalheDaProducao(item);
  // TRAVADA PELA SOLICITAÇÃO (21/09): uma linha discreta a mais, em vermelho-escuro.
  const trava = item && pecaTravada(item) ? (
    <div data-testid="detalhe-travada" title={fraseDaTrava(item)} style={{ fontSize: 12, lineHeight: 1.35, color: "#7f1d1d", fontWeight: 700, marginTop: 2, overflowWrap: "anywhere" }}>{seloDaTrava(item)}</div>
  ) : null;
  if (!frase) return trava;
  if (trava) return <>{trava}<DetalheProducaoLinha frase={frase} style={style} /></>;
  return <DetalheProducaoLinha frase={frase} style={style} />;
}

function DetalheProducaoLinha({ frase, style }: { frase: string; style?: CSSProperties }) {
  return (
    <div
      data-testid="detalhe-producao"
      style={{ fontSize: 12, lineHeight: 1.35, color: "#57534e", fontWeight: 500, marginTop: 2, fontVariantNumeric: "tabular-nums", ...style }}
    >
      {frase}
    </div>
  );
}
