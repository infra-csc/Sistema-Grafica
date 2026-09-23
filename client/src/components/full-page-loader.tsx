import { T, FS, FW, FONT } from "@/lib/theme";

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
        <span aria-hidden="true" className="animate-pulse" style={{ fontFamily: FONT.display, fontSize: FS.title, fontWeight: FW.rotulo, letterSpacing: "-0.05em", color: T.text }}>
          NORTE
        </span>
        <span style={{ fontSize: FS.meta, color: T.second }}>Carregando…</span>
      </div>
    </div>
  );
}
