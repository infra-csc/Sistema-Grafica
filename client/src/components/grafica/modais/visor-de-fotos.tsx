// ─────────────────────────────────────────────────────────────────────────────
// VER A FOTO ANTES DE CONFIRMAR (dono, 30/10: "ver se está bom para manusear as
// fotos"). A miniatura de 72px não diz se a foto ficou nítida: tocar nela abre
// aqui, grande, com anterior/próxima e "Remover" — sem sair do formulário.
// ─────────────────────────────────────────────────────────────────────────────
import type React from "react";
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Botao } from "@/components/ui/botao";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { convertGCSUrlToLocalPath } from "@/lib/artePdfExport";
import { FS, FW, R } from "@/lib/theme";

const BOTAO: React.CSSProperties = {
  width: 44, height: 44, flexShrink: 0, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
  border: "none", borderRadius: R.pill, background: "rgba(255,255,255,0.14)", color: "#fff", cursor: "pointer",
};

export function VisorDeFotos({ fotos, indice, aoMudar, aoRemover, zIndex }: {
  fotos: string[];
  /** null = fechado. */
  indice: number | null;
  aoMudar: (i: number | null) => void;
  aoRemover?: (url: string) => void;
  /** Para abrir sobre uma tela cheia com camada própria (a fila do galpão). */
  zIndex?: number;
}) {
  const aberto = indice !== null && indice >= 0 && indice < fotos.length;
  const i = aberto ? indice! : 0;
  const passar = (d: number) => aoMudar((i + d + fotos.length) % fotos.length);
  useEffect(() => {
    if (!aberto || fotos.length < 2) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") passar(-1);
      if (e.key === "ArrowRight") passar(1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });
  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) aoMudar(null); }}>
      <DialogContent
        className={HIDE_NATIVE_CLOSE}
        data-testid="visor-de-fotos"
        style={{ zIndex, width: "min(960px, calc(100vw - 16px))", maxWidth: "none", height: "calc(100dvh - 16px)", maxHeight: "none", padding: 0, gap: 0, background: "#141210", border: "none", borderRadius: R.lg, display: "flex", flexDirection: "column", overflow: "hidden" }}
      >
        <DialogTitle className="sr-only">Foto {i + 1} de {fotos.length}</DialogTitle>
        <DialogDescription className="sr-only">Veja a foto em tamanho grande antes de confirmar</DialogDescription>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 8, color: "#fff" }}>
          <span data-testid="visor-contador" style={{ paddingLeft: 8, fontSize: FS.read, fontWeight: FW.forte, fontVariantNumeric: "tabular-nums" }}>Foto {i + 1} de {fotos.length}</span>
          <button type="button" onClick={() => aoMudar(null)} aria-label="Fechar a foto" data-testid="visor-fechar" style={BOTAO}><X aria-hidden="true" style={{ width: 20, height: 20 }} /></button>
        </div>
        <div style={{ position: "relative", flex: "1 1 auto", minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 8px" }}>
          {aberto && <img src={convertGCSUrlToLocalPath(fotos[i])} alt={`Foto ${i + 1} de ${fotos.length}`} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />}
          {fotos.length > 1 && (
            <>
              <button type="button" onClick={() => passar(-1)} aria-label="Foto anterior" data-testid="visor-anterior" style={{ ...BOTAO, position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><ChevronLeft aria-hidden="true" style={{ width: 22, height: 22 }} /></button>
              <button type="button" onClick={() => passar(1)} aria-label="Próxima foto" data-testid="visor-proxima" style={{ ...BOTAO, position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}><ChevronRight aria-hidden="true" style={{ width: 22, height: 22 }} /></button>
            </>
          )}
        </div>
        {aoRemover && aberto && (
          <div style={{ display: "flex", justifyContent: "center", padding: "10px 12px calc(10px + env(safe-area-inset-bottom))" }}>
            <Botao
              variante="secundario"
              tamanho="toque"
              icone={Trash2}
              data-testid="visor-remover"
              onClick={() => {
                const url = fotos[i];
                aoMudar(fotos.length > 1 ? Math.min(i, fotos.length - 2) : null);
                aoRemover(url);
              }}
            >
              Remover esta foto
            </Botao>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
