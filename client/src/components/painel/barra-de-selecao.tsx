// ─── Barra de ações em lote ─────────────────────────────────────────────────
// O ExportPdfDialog já tinha seleção interna, mas ela não conversava com
// a lista: o usuário filtrava fora e re-selecionava dentro.
import { Copy, FileSpreadsheet, Printer } from "lucide-react";
import { alvo } from "@/hooks/use-mobile";
import { getStatusMeta } from "@/lib/status";
import { FS, FW, R, H, T } from "@/lib/theme";
import type { PecaDoPainel } from "./tipos";

export function BarraDeSelecao({ selecionadas, dedo, isExportingXlsx, onPdf, onXlsx, onCopiarIds, onLimpar }: {
  selecionadas: PecaDoPainel[];
  dedo: boolean;
  isExportingXlsx: boolean;
  onPdf: () => void;
  onXlsx: () => void;
  onCopiarIds: () => void;
  onLimpar: () => void;
}) {
  return (
    <div
      role="region" aria-label="Ações para as peças selecionadas"
      style={{ position: "fixed", left: "50%", bottom: 20, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 999, backgroundColor: T.text, boxShadow: "0 8px 24px rgba(28,25,23,.28)", flexWrap: "wrap", maxWidth: "94vw" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: FS.body, fontWeight: FW.rotulo, color: T.surface, whiteSpace: "nowrap" }}>
          {selecionadas.length} {selecionadas.length === 1 ? "peça selecionada" : "peças selecionadas"}
        </span>
        {/* DO QUE A SELECAO E FEITA. "12 selecionadas" nao diz se sao doze
            aguardando aprovacao ou onze entregues e uma reprovada — e a
            acao que faz sentido depende inteiramente disso. Marcar em lote
            e facil; lembrar o que se marcou, nao. */}
        {(() => {
          const porStatus = new Map<string, number>();
          for (const i of selecionadas) {
            const m = getStatusMeta(i.status);
            const rotulo = m.short || m.label;
            porStatus.set(rotulo, (porStatus.get(rotulo) ?? 0) + 1);
          }
          if (porStatus.size === 0) return null;
          const partes = Array.from(porStatus.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([rotulo, n]) => `${n} ${rotulo.toLowerCase()}`);
          // Acima de tres situacoes a frase vira lista de compras: o resto
          // some num "+N", que ainda diz que ha mais.
          const visiveis = partes.slice(0, 3);
          const resto = partes.length - visiveis.length;
          return (
            <span data-testid="text-selecao-composicao" style={{ fontSize: FS.small, color: "rgba(255,255,255,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {visiveis.join(" · ")}{resto > 0 ? ` · +${resto}` : ""}
            </span>
          );
        })()}
      </div>
      <button onClick={onPdf} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: R.pill, color: T.surface, fontSize: FS.meta, fontWeight: FW.forte, padding: "6px 12px", minHeight: alvo(H.md, dedo), cursor: "pointer" }}>
        <Printer style={{ width: 13, height: 13 }} /> PDF
      </button>
      <button onClick={onXlsx} disabled={isExportingXlsx} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: R.pill, color: T.surface, fontSize: FS.meta, fontWeight: FW.forte, padding: "6px 12px", minHeight: alvo(H.md, dedo), cursor: "pointer" }}>
        <FileSpreadsheet style={{ width: 13, height: 13 }} /> Excel
      </button>
      <button onClick={onCopiarIds} style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: R.pill, color: T.surface, fontSize: FS.meta, fontWeight: FW.forte, padding: "6px 12px", minHeight: alvo(H.md, dedo), cursor: "pointer" }}>
        <Copy style={{ width: 13, height: 13 }} /> Copiar IDs
      </button>
      <button onClick={onLimpar} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", fontSize: FS.meta, fontWeight: FW.forte, padding: "6px 8px", minHeight: alvo(H.md, dedo), cursor: "pointer", textDecoration: "underline" }}>
        Limpar seleção
      </button>
    </div>
  );
}
