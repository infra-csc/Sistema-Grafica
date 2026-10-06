// ─────────────────────────────────────────────────────────────────────────────
// Esqueletos do Calendário — a silhueta da escala em vigor (semana ou mês) e
// dos dois cartões de apoio, no lugar do spinner central: o spinner deixava
// um vão branco e a grade "pulava" ao chegar. E os cartões de apoio, sem
// esqueleto, afirmavam "Nenhum evento futuro" e "0 eventos" enquanto a lista
// ainda nem tinha chegado — um vazio que não era verdade.
//
// `animate-pulse` já respeita prefers-reduced-motion (regra global).
// ─────────────────────────────────────────────────────────────────────────────
import { T, R, N, FS, FW } from "@/lib/theme";
import { DIAS_DA_SEMANA } from "./formatos";

const barra = (largura: number | string, altura = 10, cor: string = T.border): React.CSSProperties => ({
  width: largura, height: altura, borderRadius: R.sm, backgroundColor: cor,
});

export function EsqueletoDaGrade({ escala, compacto }: { escala: "semana" | "mes"; compacto: boolean }) {
  if (escala === "semana") {
    return (
      <div aria-busy="true" aria-label="Carregando calendário" data-testid="skeleton-calendario">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ display: "flex", borderBottom: `1px solid ${N.n3}`, minHeight: 60 }}>
            <div style={{ width: compacto ? 56 : 84, flexShrink: 0, padding: "12px 14px", borderRight: `1px solid ${N.n3}`, display: "flex", flexDirection: "column", gap: 6 }}>
              <div className="animate-pulse" style={barra(22, 8)} />
              <div className="animate-pulse" style={barra(18, 16, N.n3)} />
            </div>
            <div style={{ flex: 1, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="animate-pulse" style={barra(i % 3 === 1 ? "28%" : "52%", 11, N.n3)} />
              {i % 3 !== 1 && <div className="animate-pulse" style={barra("22%", 8)} />}
            </div>
          </div>
        ))}
      </div>
    );
  }
  const altura = compacto ? 64 : 108;
  return (
    <div aria-busy="true" aria-label="Carregando calendário" data-testid="skeleton-calendario"
      style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {/* O cabeçalho dos dias é fixo: vai de verdade, não em esqueleto. */}
      {DIAS_DA_SEMANA.map((d, i) => (
        <div key={d} aria-hidden="true" style={{ height: 34, display: "flex", alignItems: "center", justifyContent: compacto ? "center" : "flex-start", padding: compacto ? 0 : "0 10px", borderBottom: `1px solid ${T.border}`, borderRight: i !== 6 ? `1px solid ${T.border}` : undefined, backgroundColor: T.bg, fontSize: FS.micro, fontWeight: FW.rotulo, color: T.second, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {compacto ? d.charAt(0) : d}
        </div>
      ))}
      {Array.from({ length: 35 }).map((_, i) => (
        <div key={i} style={{ height: altura, padding: 8, borderRight: i % 7 !== 6 ? `1px solid ${T.border}` : undefined, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="animate-pulse" style={barra(16, 10, N.n3)} />
          {!compacto && i % 3 === 0 && <div className="animate-pulse" style={barra("82%", 16, N.n2)} />}
          {!compacto && i % 5 === 1 && <div className="animate-pulse" style={barra("64%", 16, N.n2)} />}
          {compacto && i % 3 === 0 && <div className="animate-pulse" style={barra("100%", 4)} />}
        </div>
      ))}
    </div>
  );
}

/** As linhas de um cartão de apoio (Próximos / Resumo) enquanto carrega. */
export function EsqueletoDeLinhas({ linhas = 4, comBloco = false }: { linhas?: number; comBloco?: boolean }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column" }}>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i > 0 ? `1px solid ${N.n3}` : undefined }}>
          {comBloco && <div className="animate-pulse" style={barra(40, 40, N.n2)} />}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
            <div className="animate-pulse" style={barra(`${70 - i * 9}%`, 11, N.n3)} />
            <div className="animate-pulse" style={barra("40%", 8)} />
          </div>
        </div>
      ))}
    </div>
  );
}
