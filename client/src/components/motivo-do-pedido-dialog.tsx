// ─────────────────────────────────────────────────────────────────────────────
// MOTIVO DO PEDIDO — cancelar (quem pediu) e recusar (quem monta a lista).
//
// É a ação destrutiva dos pedidos, e merece uma decisão isolada: o pedido
// identificado, o motivo obrigatório (MIN_MOTIVO_DO_PEDIDO caracteres), o
// aviso de quem recebe a frase e o botão vermelho travado até o motivo
// existir. Antes o recusar abria um campo DENTRO da linha, empurrando a lista.
// Um componente só serve as duas telas — o formulário não se duplica.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { BellRing, X } from "lucide-react";
import {
  MIN_MOTIVO_DO_PEDIDO,
  quantidadeDoPedido,
  textoDaObservacao,
  type PedidoDePeca,
} from "@shared/pedidos-de-peca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE } from "@/components/modal-shell";
import { T, FS, R } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";

export function MotivoDoPedidoDialog({ pedido, titulo, aviso, rotuloConfirmar, pendente, onConfirmar, onFechar }: {
  pedido: PedidoDePeca | null;
  titulo: string;
  /** Quem é avisado com o motivo — dito antes de confirmar. */
  aviso: string;
  rotuloConfirmar: string;
  pendente: boolean;
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const [motivo, setMotivo] = useState("");
  // Zera o motivo quando troca de pedido (inclusive ao reabrir o mesmo).
  const [pedidoVisto, setPedidoVisto] = useState<string | null>(null);
  if ((pedido?.id ?? null) !== pedidoVisto) {
    setPedidoVisto(pedido?.id ?? null);
    setMotivo("");
  }
  // Durante o fade de saída o pedido já é null: mantém o último na tela.
  const ultimo = useRef<PedidoDePeca | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = pedido ?? ultimo.current;

  const falta = Math.max(0, MIN_MOTIVO_DO_PEDIDO - motivo.trim().length);
  const alvo = isMobile ? 44 : 38;
  const observacao = p ? textoDaObservacao(p.observacao) : "";

  return (
    <Dialog open={!!pedido} onOpenChange={(aberto) => { if (!aberto && !pendente) onFechar(); }}>
      <DialogContent
        data-testid="dialog-cancelar-pedido"
        className={`p-0 gap-0 border-0 ${HIDE_NATIVE_CLOSE}`}
        style={{
          display: "flex", flexDirection: "column", padding: 0, overflow: "hidden",
          width: "min(520px, calc(100vw - 24px))", maxWidth: "min(520px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 48px)", borderRadius: R.xl, background: "#ffffff",
          boxShadow: "0 25px 60px rgba(0,0,0,0.22)",
        }}
      >
        <header style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px 14px", borderBottom: "1px solid #e7e5e4" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <DialogTitle asChild>
              <h2 style={{ margin: 0, fontSize: FS.title, fontWeight: 800, color: T.text, fontFamily: "'Space Grotesk', sans-serif" }}>{titulo}</h2>
            </DialogTitle>
            <DialogDescription asChild>
              <p style={{ margin: "4px 0 0", fontSize: FS.body, color: "#57534e", lineHeight: 1.45 }}>
                {p ? `${quantidadeDoPedido(p.quantidade)} · ${p.sponsorName ?? "sem patrocinador"} · ${p.eventName ?? "evento"}` : ""}
                {p?.pedidoPor ? ` · pedido por ${p.pedidoPor}` : ""}
              </p>
            </DialogDescription>
          </div>
          <button type="button" onClick={onFechar} disabled={pendente} aria-label="Fechar"
            style={{ width: alvo, height: alvo, borderRadius: R.md, border: "none", background: "#f5f5f4", color: "#57534e", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <X size={15} />
          </button>
        </header>

        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          {observacao && (
            <blockquote style={{ margin: 0, padding: "8px 12px", borderLeft: "3px solid #d6d3d1", background: "#fafaf9", borderRadius: R.sm, fontSize: FS.body, color: "#44403c", lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              “{observacao}”
            </blockquote>
          )}
          <div>
            <label htmlFor="motivo-do-pedido" style={{ display: "block", fontSize: FS.small, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#57534e", marginBottom: 6 }}>
              Motivo
            </label>
            <textarea
              id="motivo-do-pedido"
              data-testid="input-motivo-do-pedido"
              autoFocus
              rows={4}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Explique em uma frase — quem recebe precisa entender o porquê."
              style={{ width: "100%", boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${falta > 0 && motivo ? "#fde68a" : "#d6d3d1"}`, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", lineHeight: 1.45, resize: "vertical", color: T.text }}
            />
            <p aria-live="polite" style={{ margin: "4px 0 0", fontSize: FS.small, color: falta > 0 ? "#92400e" : "#065f46" }}>
              {falta > 0 ? `Faltam ${falta} ${falta === 1 ? "caractere" : "caracteres"}` : "Motivo pronto"}
            </p>
          </div>
          <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: FS.body, color: "#44403c", lineHeight: 1.45 }}>
            <BellRing size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "#57534e" }} />
            {aviso}
          </p>
        </div>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 20px", borderTop: "1px solid #e7e5e4", background: "#fafaf9", flexWrap: "wrap" }}>
          <button type="button" onClick={onFechar} disabled={pendente}
            style={{ height: alvo, padding: "0 16px", borderRadius: R.md, border: "1px solid #d6d3d1", background: "#ffffff", color: T.text, fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
            Voltar
          </button>
          <button type="button" data-testid="button-confirmar-motivo" disabled={falta > 0 || pendente}
            onClick={() => onConfirmar(motivo.trim())}
            title={falta > 0 ? `O motivo precisa de pelo menos ${MIN_MOTIVO_DO_PEDIDO} caracteres` : undefined}
            style={{ height: alvo, padding: "0 16px", borderRadius: R.md, border: "none", background: falta > 0 || pendente ? "#e7e5e4" : "#b91c1c", color: falta > 0 || pendente ? "#78716c" : "#ffffff", fontSize: FS.body, fontWeight: 800, cursor: falta > 0 || pendente ? "not-allowed" : "pointer" }}>
            {pendente ? "Salvando…" : rotuloConfirmar}
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
