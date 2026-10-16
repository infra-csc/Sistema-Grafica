import { T, FS, FW, FONT, R, N } from "@/lib/theme";

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
 * O desenho (02/10): o mesmo selo da barra lateral e da tela de entrada
 * (desde 16/10, o "N" da NORTE na cor da Produção), o nome, e uma faixa fina que ANDA —
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
        {/* Identidade do app (16/10): o selo da NORTE (quadrado branco com o N da Produção). */}
        <img src="/selo-app.svg" alt="" aria-hidden="true" width={44} height={44} style={{ width: 44, height: 44, display: "block" }} />
        <span aria-hidden="true" style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.rotulo, letterSpacing: "-0.04em", color: T.text, lineHeight: 1 }}>
          NORTE
        </span>
        <span aria-hidden="true" style={{ position: "relative", width: 120, height: 3, borderRadius: R.pill, backgroundColor: N.n3, overflow: "hidden" }}>
          <span className="csc-faixa" style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "40%", borderRadius: R.pill, backgroundColor: T.accent }} />
        </span>
        <span style={{ fontSize: FS.meta, fontWeight: FW.corpo, color: T.second }}>Carregando…</span>
      </div>
    </div>
  );
}
