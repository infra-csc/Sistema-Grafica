// ─── Barra de ações em lote ─────────────────────────────────────────────────
// O ExportPdfDialog já tinha seleção interna, mas ela não conversava com
// a lista: o usuário filtrava fora e re-selecionava dentro.
import { Copy, FileSpreadsheet, Printer, X } from "lucide-react";
import { Botao } from "@/components/ui/botao";
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
      className="pnl-lote"
      style={{ position: "fixed", left: "50%", bottom: dedo ? 16 : 24, transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 14, padding: "8px 8px 8px 20px", borderRadius: dedo ? R.xl : R.pill, backgroundColor: T.text, boxShadow: "0 12px 32px -8px rgba(28,25,23,.45), 0 0 0 1px rgba(255,255,255,0.06) inset", flexWrap: "wrap", width: dedo ? "calc(100vw - 24px)" : undefined, maxWidth: "94vw", boxSizing: "border-box" }}
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
      {/* As ações do lote: os botões do sistema para fundo ESCURO
          (claroFantasma), e não quatro pílulas desenhadas à mão — mesmo foco,
          mesmo hover e mesma altura do resto do app. Limpar fica por último,
          separado por um filete: ele desfaz a seleção, não age sobre ela. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Botao variante="claroFantasma" tamanho={dedo ? "toque" : "md"} icone={Printer} onClick={onPdf} data-testid="button-lote-pdf">PDF</Botao>
        <Botao variante="claroFantasma" tamanho={dedo ? "toque" : "md"} icone={FileSpreadsheet} onClick={onXlsx} carregando={isExportingXlsx} data-testid="button-lote-xlsx">Excel</Botao>
        <Botao variante="claroFantasma" tamanho={dedo ? "toque" : "md"} icone={Copy} onClick={onCopiarIds} data-testid="button-lote-copiar-ids">Copiar IDs</Botao>
        <span aria-hidden="true" style={{ width: 1, height: 22, backgroundColor: "rgba(255,255,255,0.18)", margin: "0 4px" }} />
        <button
          type="button"
          onClick={onLimpar}
          aria-label="Limpar seleção"
          title="Limpar seleção"
          className="pnl-lote-fechar"
          data-testid="button-lote-limpar"
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "rgba(255,255,255,0.78)", fontSize: FS.meta, fontWeight: FW.forte, padding: "0 10px", minHeight: alvo(H.md, dedo), borderRadius: R.pill, cursor: "pointer", fontFamily: "inherit" }}
        >
          <X aria-hidden="true" style={{ width: 14, height: 14 }} />
          {!dedo && "Limpar"}
        </button>
      </div>
    </div>
  );
}
