// ─────────────────────────────────────────────────────────────────────────────
// MOTIVO DO PEDIDO — cancelar, recusar e reabrir.
//
// Uma decisão isolada: o pedido identificado, a observação citada, o motivo
// obrigatório (MIN_MOTIVO_DO_PEDIDO caracteres), quem recebe a frase e o botão
// travado até o motivo existir. Casca padrão do app (modalSurface +
// ModalHeader + ModalFooter). Um componente só serve as três ações.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { BellRing, RotateCcw, XCircle, type LucideIcon } from "lucide-react";
import {
  MIN_MOTIVO_DO_PEDIDO,
  quantidadeDoPedido,
  textoDaObservacao,
  type PedidoDePeca,
} from "@shared/pedidos-de-peca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { T, FS, R } from "@/lib/theme";
import { useIsMobile } from "@/hooks/use-mobile";

export type AcaoComMotivo = "cancelar" | "recusar" | "reabrir";

const ACOES: Record<AcaoComMotivo, { titulo: string; confirmar: string; cor: string; icone: LucideIcon }> = {
  cancelar: { titulo: "Cancelar solicitação", confirmar: "Cancelar solicitação", cor: "#b91c1c", icone: XCircle },
  recusar:  { titulo: "Recusar solicitação",  confirmar: "Recusar solicitação",  cor: "#b91c1c", icone: XCircle },
  reabrir:  { titulo: "Reabrir solicitação",  confirmar: "Reabrir solicitação",  cor: "#1c1917", icone: RotateCcw },
};

export function MotivoDoPedidoDialog({ pedido, acao, aviso, pendente, onConfirmar, onFechar }: {
  pedido: PedidoDePeca | null;
  acao: AcaoComMotivo;
  /** Quem é avisado com o motivo — dito antes de confirmar. */
  aviso: string;
  pendente: boolean;
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const [motivo, setMotivo] = useState("");
  // Zera o motivo ao trocar de pedido ou de ação.
  const chave = pedido ? `${pedido.id}:${acao}` : null;
  const [vista, setVista] = useState<string | null>(null);
  if (chave !== vista) { setVista(chave); setMotivo(""); }
  // Durante o fade de saída o pedido já é null: mantém o último na tela.
  const ultimo = useRef<PedidoDePeca | null>(pedido);
  if (pedido) ultimo.current = pedido;
  const p = pedido ?? ultimo.current;

  const meta = ACOES[acao];
  const falta = Math.max(0, MIN_MOTIVO_DO_PEDIDO - motivo.trim().length);
  const travado = falta > 0 || pendente;
  const alvo = isMobile ? 44 : 40;
  const observacao = p ? textoDaObservacao(p.observacao) : "";
  const subtitulo = p ? `${quantidadeDoPedido(p.quantidade)} · ${p.sponsorName ?? "sem patrocinador"} · ${p.eventName ?? "evento"}${p.pedidoPor ? ` · solicitada por ${p.pedidoPor}` : ""}` : "";

  return (
    <Dialog open={!!pedido} onOpenChange={(aberto) => { if (!aberto && !pendente) onFechar(); }}>
      <DialogContent data-testid="dialog-motivo-do-pedido" className={HIDE_NATIVE_CLOSE} style={modalSurface(520)}>
        <DialogTitle className="sr-only">{meta.titulo}</DialogTitle>
        <DialogDescription className="sr-only">{subtitulo}</DialogDescription>
        <ModalHeader icon={meta.icone} variant="confirm" tint={meta.cor} title={meta.titulo} subtitle={subtitulo} onClose={pendente ? undefined : onFechar} />

        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
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
              aria-describedby="motivo-do-pedido-contador"
              placeholder="Explique em uma frase — quem recebe precisa entender o porquê."
              style={{ width: "100%", boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${falta > 0 && motivo ? "#fcd34d" : "#d6d3d1"}`, padding: "10px 12px", fontSize: 14, fontFamily: "inherit", lineHeight: 1.45, resize: "vertical", color: T.text }}
            />
            <p id="motivo-do-pedido-contador" aria-live="polite" style={{ margin: "4px 0 0", fontSize: FS.small, color: falta > 0 ? "#92400e" : "#065f46" }}>
              {falta > 0 ? `Faltam ${falta} ${falta === 1 ? "caractere" : "caracteres"}` : "Motivo pronto"}
            </p>
          </div>
          <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: FS.body, color: "#44403c", lineHeight: 1.45 }}>
            <BellRing size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "#57534e" }} />
            {aviso}
          </p>
        </div>

        <ModalFooter>
          <button type="button" data-testid="button-confirmar-motivo" disabled={travado}
            onClick={() => onConfirmar(motivo.trim())}
            title={falta > 0 ? `O motivo precisa de pelo menos ${MIN_MOTIVO_DO_PEDIDO} caracteres` : undefined}
            style={{ height: alvo + 4, borderRadius: R.md, border: "none", background: travado ? "#e7e5e4" : meta.cor, color: travado ? "#78716c" : "#ffffff", fontSize: 14, fontWeight: 800, cursor: travado ? "not-allowed" : "pointer" }}>
            {pendente ? "Salvando…" : meta.confirmar}
          </button>
          <button type="button" onClick={onFechar} disabled={pendente}
            style={{ height: alvo, borderRadius: R.md, border: "none", background: "transparent", color: "#57534e", fontSize: FS.body, fontWeight: 700, cursor: "pointer" }}>
            Voltar
          </button>
        </ModalFooter>
      </DialogContent>
    </Dialog>
  );
}
