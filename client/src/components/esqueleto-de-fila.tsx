// ─────────────────────────────────────────────────────────────────────────────
// ESQUELETO DE FILA (UX, 27/08). Silhueta genérica de lista: cabeçalho +
// linhas fantasma. Substitui os SPINNERS CENTRAIS das telas de fila — o
// spinner colapsa a altura e, quando os dados chegam, o conteúdo EMPURRA a
// tela (layout shift); a silhueta reserva o espaço e a chegada vira uma troca
// suave. O Painel Geral tem o retrato fino dele (medidas reais da própria
// tabela, ver painel-geral.tsx) — este é o genérico das demais filas.
// ─────────────────────────────────────────────────────────────────────────────
export function EsqueletoDeFila({ linhas = 7, comCabecalho = true }: { linhas?: number; comCabecalho?: boolean }) {
  return (
    <div
      aria-busy="true"
      aria-label="Carregando a lista"
      data-testid="esqueleto-de-fila"
      style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 10, overflow: "hidden" }}
    >
      {comCabecalho && <div style={{ height: 44, backgroundColor: "#fafaf9", borderBottom: "1px solid #e7e5e4" }} />}
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 18, height: 58, boxSizing: "border-box", padding: "0 16px", borderBottom: "1px solid #f5f4f2" }}>
          <div className="animate-pulse" style={{ width: 52, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
          {/* larguras variadas: silhueta de texto real, não uma régua uniforme */}
          <div className="animate-pulse" style={{ width: `${36 - (i % 4) * 5}%`, height: 12, borderRadius: 4, backgroundColor: "#e7e5e4" }} />
          <div className="animate-pulse" style={{ width: 64, height: 12, borderRadius: 4, backgroundColor: "#f0efee", marginLeft: "auto" }} />
          <div className="animate-pulse" style={{ width: 88, height: 22, borderRadius: 999, backgroundColor: "#f0efee" }} />
        </div>
      ))}
    </div>
  );
}
