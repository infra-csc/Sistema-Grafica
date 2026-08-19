// Barra de progresso de peças ENTREGUES.
//
// PORQUÊ: a mesma barra existia inline em três lugares da tela com DUAS
// geometrias (5px/raio 3 no mobile, 4px/raio 2 no quadro e na tabela) — a
// mesma informação com dois pesos visuais. Aqui é uma só, em 5px/R.sm.
//
// VOCABULÁRIO: "prontas" virou "entregues". O número é `deliveredItems`, que
// no servidor conta só `delivered`/`entregue` — `produced` e `conferred` NÃO
// entram. Um evento com 40 peças produzidas e conferidas, faltando só carregar
// o caminhão, aparecia como "0/40 prontas": o diretor lia catástrofe onde
// estava tudo certo e cobrava a Gráfica por trabalho já feito. `lib/status.ts`
// já registra "Entregue" como rótulo canônico.
import { R, TI } from "./tokens";

interface ProgressoPecasProps {
  delivered: number;
  total: number;
  /**
   * `linha`   — barra e fração lado a lado (card do quadro).
   * `empilhado` — rótulo + fração em cima, barra embaixo (card mobile).
   * `coluna`  — fração grande em cima, barra fina embaixo (tabela).
   */
  variant?: "linha" | "empilhado" | "coluna";
}

export function ProgressoPecas({ delivered, total, variant = "linha" }: ProgressoPecasProps) {
  const pct = total > 0 ? Math.round((delivered / total) * 100) : 0;
  const cheia = pct === 100 && total > 0;

  const barra = (
    <span
      aria-hidden="true"
      style={{
        display: "block", height: 5, borderRadius: R.sm,
        backgroundColor: TI.track, overflow: "hidden",
      }}
    >
      <span style={{
        display: "block", width: `${pct}%`, height: "100%", borderRadius: R.sm,
        backgroundColor: cheia ? TI.green : TI.strong,
      }} />
    </span>
  );

  if (variant === "empilhado") {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TI.secondary, marginBottom: 4 }}>
          <span>Peças entregues</span>
          <span style={{ fontWeight: 700, color: TI.title, fontVariantNumeric: "tabular-nums" }}>{delivered}/{total}</span>
        </div>
        {barra}
      </div>
    );
  }

  if (variant === "coluna") {
    return (
      <>
        <span
          style={{
            fontSize: 13, fontWeight: 800, color: TI.title,
            fontFamily: "'Space Grotesk', sans-serif",
            // A mesma fração aparece em três superfícies; largura de dígito
            // fixa nas três, senão a coluna da tabela treme a cada linha.
            fontVariantNumeric: "tabular-nums",
          }}
          aria-label={`${delivered} de ${total} peças entregues`}
        >
          {delivered}/{total}
        </span>
        <div style={{ marginTop: 5 }}>{barra}</div>
      </>
    );
  }

  // `linha`: a fração vem ROTULADA. O "12/40" nu convivia, sete pixels acima,
  // com outro número de peças de semântica diferente ("· 8 peças" do gate).
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{barra}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: TI.secondary, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        {delivered} de {total} entregues
      </span>
    </span>
  );
}
