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
          // dvh onde existe: no celular o 100vh inclui a barra recolhível do
          // navegador e o "Usar A3" ficava atrás dela (mesma regra do modalSurface).
          display: "flex", flexDirection: "column", maxHeight: typeof CSS !== "undefined" && CSS.supports?.("height: 100dvh") ? "calc(100dvh - 24px)" : "calc(100vh - 48px)",
          padding: 0, overflow: "hidden", borderRadius: 20,
          width: "min(480px, calc(100vw - 32px))", maxWidth: "min(480px, calc(100vw - 32px))",
          boxShadow: "0 25px 60px rgba(0,0,0,0.2)",
        }}
      >
        {/* PALETA: o mapa era o único canto do app em azul-ardósia (#0f172a,
            #64748b, #f1f5f9, #f8fafc) — veio de outro projeto junto com o
            componente. Agora usa a família "stone" do resto do app, com os
            mesmos pares de contraste (#746e69 passa AA em todas as superfícies). */}
        <div style={{ padding: "12px 12px 12px 20px", borderBottom: "1px solid #f1f0ef", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Grid3X3 size={18} color="#c2410c" />
            <div>
              <DialogTitle asChild>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, fontFamily: "Space Grotesk, sans-serif", color: "#1c1917" }}>Mapa do Galpão</p>
              </DialogTitle>
              {/* #746e69 (≥4,56:1 em qualquer superfície): o #94a3b8 de antes
                  reprovava AA nos 11px. "Toque" antes de "clique": o mapa é
                  usado no tablet do galpão. */}
              <DialogDescription asChild>
                <p style={{ margin: 0, fontSize: 12, color: "#746e69" }}>Linha = setor (A–F), coluna = corredor (1–8). O toque já marca o local.</p>
              </DialogDescription>
            </div>
          </div>
          {/* 44px: é o X que se procura com o dedo, em pé, no tablet. */}
          {/* O toque numa célula JÁ grava (onSelect); o X não desfaz. O rótulo
              diz isso, para ninguém fechar achando que cancelou a escolha. */}
          <button type="button" onClick={onClose} aria-label={value ? `Fechar mapa — mantém ${value}` : "Fechar mapa"} title={value ? "Fechar — o local escolhido fica" : "Fechar mapa"} style={{ background: "transparent", border: "none", width: 44, height: 44, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#57534e", flexShrink: 0 }}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {/* O mapa é o único scrollport: em telas baixas ele rola e o botão
            Confirmar continua no lugar. */}
        {/* 12px de lado (eram 20): em 360px cada uma das 8 colunas ganha ~4px de
            largura de toque — é a medida que falta ao dedo neste grid. */}
        <div style={{ padding: "16px 12px 20px", overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px repeat(8, 1fr)", gap: 4, marginBottom: 4 }}>
            <div />
            {CORREDORES.map(c => (
              <div key={c} style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "#746e69", fontFamily: "DM Mono, monospace" }}>C{c}</div>
            ))}
          </div>
          {SETORES.map(s => (
            <div key={s} style={{ display: "grid", gridTemplateColumns: "28px repeat(8, 1fr)", gap: 4, marginBottom: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#57534e", fontFamily: "DM Mono, monospace" }}>{s}</div>
              {CORREDORES.map(c => {
                const loc = `Setor ${s} - Corredor ${c}`;
                const isSelected = value === loc;
                const isHov = hov === loc;
                return (
                  <button key={c} type="button" onClick={() => onSelect(loc)} aria-label={loc} aria-pressed={isSelected}
                    onMouseEnter={() => setHov(loc)} onMouseLeave={() => setHov(null)}
                    /* Regra da casa: #f97316 nunca como texto. O selecionado era
                       branco sobre #f97316 (2,8:1) e o hover pintava o próprio
                       texto de #f97316 — os dois viram #c2410c (5,18:1). O anel
                       de foco deixa de ser suprimido: sem ele o mapa não era
                       navegável por teclado. */
                    /* 44 de altura (eram 40): a largura é a do grid, que em
                       390px dá ~32 por célula — a altura é o que sobra para
                       acertar o dedo. Célula com borda leve para ler como
                       alvo, e não como texto solto num fundo quase branco. */
                    style={{
                      height: 44, borderRadius: 8, border: `1px solid ${isSelected ? "#c2410c" : isHov ? "#fed7aa" : "#e7e5e4"}`,
                      background: isSelected ? "#c2410c" : isHov ? "#fff7ed" : "#fafaf9",
                      color: isSelected ? "#fff" : isHov ? "#c2410c" : "#44403c",
                      fontSize: 12, fontWeight: 700, cursor: "pointer", padding: 0,
                      fontFamily: "DM Mono, monospace",
                      transition: "background-color 0.12s, color 0.12s, border-color 0.12s",
                      boxShadow: isSelected ? "0 0 0 2px #ffffff, 0 0 0 4px rgba(194,65,12,0.45)" : "none",
                    }}>
                    {s}{c}
                  </button>
                );
              })}
            </div>
          ))}
          {value && (
            <div style={{ marginTop: 12, minHeight: 36, boxSizing: "border-box", padding: "8px 14px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", display: "flex", alignItems: "center", gap: 8 }}>
              <MapPin size={13} color="#c2410c" />
              <span role="status" style={{ fontSize: 13, fontWeight: 700, color: "#c2410c", fontFamily: "Space Grotesk, sans-serif" }}>{value}</span>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px calc(12px + env(safe-area-inset-bottom))", borderTop: "1px solid #f1f0ef", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          {/* #c2410c: branco sobre #f97316 dava 2,8:1. 44px: é o botão que o
              operador procura com o dedo depois de escolher a célula. */}
          <button type="button" onClick={onClose} style={{ minHeight: 48, padding: "0 22px", borderRadius: 10, border: "none", background: "#c2410c", color: "#fff", fontSize: 14, cursor: "pointer", fontFamily: "Space Grotesk, sans-serif", fontWeight: 700 }}>
            {/* O CTA nomeia a célula ("Usar A3", o mesmo texto do botão do
                mapa); local digitado à mão fora do formato vira "este local". */}
            {value
              ? (/^Setor \w - Corredor \d+$/.test(value) ? `Usar ${value.replace(/^Setor (\w) - Corredor (\d+)$/, "$1$2")}` : "Usar este local")
              : "Fechar sem escolher"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
