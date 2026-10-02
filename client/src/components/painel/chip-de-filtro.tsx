// ─── Chip de filtro ativo (removível) — linha abaixo da toolbar ─────────────
import { X } from "lucide-react";
import { FS, FW, R, T } from "@/lib/theme";

// isMobile por PROP: como cada chip chamava useIsMobile(), 10 filtros ativos
// criavam 10 listeners de matchMedia para uma informação que o pai já tem.
//
// O rótulo chega como "Dimensão: valor". A dimensão é contexto (apoio, peso
// médio) e o valor é o que se lê (texto forte): "Status: Aguardando Envio"
// deixava as duas metades com o mesmo peso e a linha de chips virava um
// parágrafo.
export function FilterChip({ label, onRemove, isMobile }: { label: string; onRemove: () => void; isMobile: boolean }) {
  // Alvo de toque do ×: 24px no desktop, 32px no mobile. Margens negativas
  // compensam a área extra para o chip não inflar visualmente.
  const hit = isMobile ? 32 : 24;
  const corte = label.indexOf(": ");
  const dimensao = corte > 0 ? label.slice(0, corte) : null;
  const valor = corte > 0 ? label.slice(corte + 2) : label;
  return (
    <span className="pnl-chip-filtro" style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      backgroundColor: T.surface, border: `1px solid ${T.border}`, borderRadius: R.pill,
      padding: "3px 6px 3px 10px", fontSize: FS.small, color: T.strong,
      whiteSpace: "nowrap", maxWidth: 300, overflow: "hidden", minHeight: 26, boxSizing: "border-box",
    }}>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {dimensao && <span style={{ color: T.second, fontWeight: FW.corpo }}>{dimensao}: </span>}
        <span style={{ fontWeight: FW.medio }}>{valor}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remover filtro ${label}`}
        className="pnl-chip-x"
        style={{
          background: "none", border: "none", cursor: "pointer", color: T.second,
          padding: 0, lineHeight: 1, borderRadius: R.pill,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          minWidth: hit, minHeight: hit,
          margin: `${-(hit - 18) / 2}px ${-(hit - 18) / 2}px ${-(hit - 18) / 2}px -2px`,
        }}
      >
        <X aria-hidden="true" style={{ width: 12, height: 12 }} />
      </button>
    </span>
  );
}
