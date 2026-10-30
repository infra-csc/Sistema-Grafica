import { T, FS, FW, R, N } from "@/lib/theme";
import { MarcaMiro } from "@/components/marca-miro";

/**
 * O loader de página inteira (antes vivia dentro do App.tsx).
 *
 * A marca no lugar do "Carregando..." solto: é a primeira coisa que se vê a
 * cada F5, e texto cinza no meio do vazio tinha cara de página quebrada.
 *
 * `w-full` (passada visual de 23/09): sem ele, quando o pai é um flex em LINHA
 * (a casca com a sidebar), a div encolhia até o conteúdo e "NORTE /
 * Carregando…" aparecia encostado na borda ESQUERDA — o `justify-center` só
 * centraliza dentro da largura que a própria div tem.
 *
 * O desenho (02/10): a mesma marca da barra lateral e da tela de entrada
 * (desde 30/10, a assinatura da Miró), e uma faixa fina que ANDA —
 * o "piscar" do texto inteiro (animate-pulse) parecia falha de tela, não
 * trabalho em curso. Com movimento reduzido a faixa fica parada (index.css,
 * .csc-faixa) e o texto continua dizendo o que acontece.
 */
export function FullPageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="full-page-loader"
      className="flex items-center justify-center h-dvh w-full"
      style={{ backgroundColor: T.bg }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        {/* Marca Miró (30/10): o mesmo desenho do menu e da entrada. */}
        <MarcaMiro altura={36} decorativa />
        <span aria-hidden="true" style={{ position: "relative", width: 120, height: 3, borderRadius: R.pill, backgroundColor: N.n3, overflow: "hidden" }}>
          <span className="csc-faixa" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", borderRadius: R.pill, backgroundColor: T.accent }} />
        </span>
        <span style={{ fontSize: FS.meta, fontWeight: FW.corpo, color: T.second }}>Carregando…</span>
      </div>
    </div>
  );
}
