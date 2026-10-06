// ─────────────────────────────────────────────────────────────────────────────
// Como LER a grade: a cor da barra (prioridade do evento) e os três tipos de
// marcação (início, saída do caminhão, prazo). Fica no rodapé do cartão.
//
// Os prazos NÃO estão aqui: eles moram na barra de cima, junto do botão
// "Todos os marcos" — o que a grade está desenhando é escopo, e escopo se
// escolhe em cima, não no rodapé.
//
// No celular a legenda recolhe num <details> ("Como ler o calendário"):
// aberta, ela empilhava quatro linhas entre a grade e os próximos eventos.
// ─────────────────────────────────────────────────────────────────────────────
import { Calendar, Truck, Flag, ChevronDown } from "lucide-react";
import { getPriorityMeta, getStatusMeta } from "@/lib/status";
import { T, FS, FW, R } from "@/lib/theme";

/* A mesma fonte única da cor das marcações (lib/status). */
const CORES_DO_EVENTO: { label: string; dot: string }[] = [
  ...(["urgente", "alta", "media", "baixa"] as const).map((k) => {
    const m = getPriorityMeta(k)!;
    return { label: m.label, dot: m.dot };
  }),
  { label: getStatusMeta("completed").label, dot: getStatusMeta("completed").dot },
  { label: getStatusMeta("closed").label, dot: getStatusMeta("closed").dot },
];

const rotulo: React.CSSProperties = { fontSize: FS.small, fontWeight: FW.forte, color: T.strong };
const item: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: FS.small, fontWeight: FW.medio, color: T.second, whiteSpace: "nowrap" };

function Conteudo({ compacto }: { compacto: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: compacto ? "10px 14px" : "8px 16px" }}>
      {/* A LEGENDA DIZ DE QUE É A COR: seis bolinhas soltas não diziam se a
          cor era prioridade, setor ou atraso. */}
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: compacto ? "8px 12px" : "6px 14px", flexBasis: compacto ? "100%" : undefined }}>
        <span style={rotulo}>Cor da barra = prioridade</span>
        {CORES_DO_EVENTO.map(({ label, dot }) => (
          <span key={label} style={item}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: dot }} />
            {label}
          </span>
        ))}
      </span>
      {!compacto && <span aria-hidden="true" style={{ width: 1, height: 14, backgroundColor: T.border }} />}
      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: compacto ? "8px 12px" : "6px 14px", marginLeft: compacto ? 0 : "auto" }}>
        <span style={item}><Calendar aria-hidden="true" style={{ width: 12, height: 12, color: T.muted }} />Início do evento</span>
        <span style={item}><Truck aria-hidden="true" style={{ width: 12, height: 12, color: T.muted }} />Saída do caminhão</span>
        {/* A bandeira e a borda TRACEJADA são de todo prazo. */}
        <span style={item}>
          <span aria-hidden="true" style={{ width: 12, height: 10, borderLeft: `3px dashed ${T.bdark}`, backgroundColor: T.low, borderRadius: 2 }} />
          <Flag aria-hidden="true" style={{ width: 12, height: 12, color: T.muted }} />
          Prazo
        </span>
      </span>
    </div>
  );
}

export function LegendaDoCalendario({ compacto }: { compacto: boolean }) {
  const caixa: React.CSSProperties = {
    padding: compacto ? "0 16px" : "12px 24px",
    borderTop: `1px solid ${T.border}`,
    backgroundColor: T.bg,
  };
  if (!compacto) {
    return <div data-testid="legenda-calendario" style={caixa}><Conteudo compacto={false} /></div>;
  }
  return (
    <details className="cal-legenda" data-testid="legenda-calendario" style={caixa}>
      <summary
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          minHeight: 44, fontSize: FS.body, fontWeight: FW.medio, color: T.apoio, borderRadius: R.sm,
        }}
      >
        Como ler o calendário
        <ChevronDown aria-hidden="true" className="cal-legenda-seta" style={{ width: 16, height: 16, color: T.second }} />
      </summary>
      <div style={{ paddingBottom: 14 }}>
        <Conteudo compacto />
      </div>
    </details>
  );
}
