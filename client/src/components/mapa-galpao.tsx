// Mapa do galpão — escolher o local de uma peça do estoque (setor × corredor).
// Saiu de pages/estoque.tsx (14/09) quando a Triagem passou a exigir o local:
// as duas telas usam o MESMO mapa e o mesmo formato de texto do local.
import { useState } from "react";
import { Grid3X3, MapPin, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";

const SETORES = ["A", "B", "C", "D", "E", "F"];
const CORREDORES = [1, 2, 3, 4, 5, 6, 7, 8];

/** Todos os locais do mapa, no formato gravado ("Setor A - Corredor 3") —
 *  para sugestões de digitação (datalist). */
export const LOCAIS_DO_GALPAO = SETORES.flatMap((s) => CORREDORES.map((c) => `Setor ${s} - Corredor ${c}`));

export function MapaGalpao({ value, onSelect, onClose }: {
  value: string; onSelect: (loc: string) => void; onClose: () => void;
}) {
  const [hov, setHov] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          // ALTURA: o mapa é fixo em 6 setores × 8 corredores — 6 linhas de 40px
          // com 4 de respiro, mais cabeçalho, rodapé e a tarja da seleção. Medi
          // 495px, e como aqui só havia `display: block` sem teto de altura, o
          // Radix (que centra com `top: 50%` + translate) cortava 25px EM CIMA e
          // 25 EMBAIXO numa janela de 445 — sumiam o título e o botão Confirmar
          // ao mesmo tempo, com o `overflow: hidden` impedindo qualquer rolagem.
          //
          // A CONTA é `100vh − 48`: viewport menos 24px de respiro em cima e 24
          // embaixo (simétrico, porque o modal é centrado). Cabeçalho e rodapé
          // não rolam, então o navegador os mede sozinho e o corpo fica com o
          // que sobrar via `flex: 1 1 auto; minHeight: 0`. Mesma regra do
          // `modal-shell` e do modal da Gestão de Prazos.
          display: "flex", flexDirection: "column", maxHeight: "calc(100vh - 48px)",
          padding: 0, overflow: "hidden", borderRadius: 20,
          width: "min(480px, calc(100vw - 32px))", maxWidth: "min(480px, calc(100vw - 32px))",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Grid3X3 size={18} color="#f97316" />
            <div>
              <DialogTitle asChild>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 800, fontFamily: "Space Grotesk, sans-serif", color: "#0f172a" }}>Mapa do Galpão</p>
              </DialogTitle>
              <DialogDescription asChild>
                <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", fontFamily: "Plus Jakarta Sans, sans-serif" }}>Clique para selecionar e confirme a localização</p>
              </DialogDescription>
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar mapa" style={{ background: "#f1f5f9", border: "none", width: 30, height: 30, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
            <X size={14} />
          </button>
        </div>
        {/* O mapa é o único scrollport: em telas baixas ele rola e o botão
            Confirmar continua no lugar. */}
        <div style={{ padding: 20, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px repeat(8, 1fr)", gap: 4, marginBottom: 4 }}>
            <div />
            {CORREDORES.map(c => (
              <div key={c} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "#94a3b8", fontFamily: "DM Mono, monospace" }}>C{c}</div>
            ))}
          </div>
          {SETORES.map(s => (
            <div key={s} style={{ display: "grid", gridTemplateColumns: "28px repeat(8, 1fr)", gap: 4, marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#64748b", fontFamily: "DM Mono, monospace" }}>{s}</div>
              {CORREDORES.map(c => {
                const loc = `Setor ${s} - Corredor ${c}`;
                const isSelected = value === loc;
                const isHov = hov === loc;
                return (
                  <button key={c} onClick={() => onSelect(loc)} aria-label={loc} aria-pressed={isSelected}
                    onMouseEnter={() => setHov(loc)} onMouseLeave={() => setHov(null)}
                    style={{
                      height: 40, borderRadius: 8, border: "none",
                      background: isSelected ? "#f97316" : isHov ? "#fff7ed" : "#f8fafc",
                      color: isSelected ? "#fff" : isHov ? "#f97316" : "#64748b",
                      fontSize: 9, fontWeight: 700, cursor: "pointer",
                      fontFamily: "DM Mono, monospace",
                      transition: "all 0.12s",
                      outline: isSelected ? "2px solid rgba(249,115,22,0.4)" : "none",
                      outlineOffset: 2,
                    }}>
                    {s}{c}
                  </button>
                );
              })}
            </div>
          ))}
          {value && (
            <div style={{ marginTop: 12, padding: "8px 14px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={13} color="#ea580c" />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#ea580c", fontFamily: "Space Grotesk, sans-serif" }}>{value}</span>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#f97316", color: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
            Confirmar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
