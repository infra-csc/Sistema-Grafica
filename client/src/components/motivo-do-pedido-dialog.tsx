// ─────────────────────────────────────────────────────────────────────────────
// MOTIVO — cancelar (a peça ou a solicitação inteira), recusar, reabrir, pedir
// ajuste e recusar ajuste.
//
// Uma decisão isolada: a peça (ou a solicitação) identificada, o texto do que
// foi pedido citado, o motivo obrigatório (MIN_MOTIVO_DO_PEDIDO caracteres),
// quem recebe a frase e o botão travado até o motivo existir. Casca padrão do
// app (modalSurface + ModalHeader + ModalFooter).
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { BellRing, RotateCcw, Wrench, XCircle, type LucideIcon } from "lucide-react";
import {
  MIN_MOTIVO_DO_PEDIDO,
  patrocinadoresDaLinha,
  quantidadeDoPedido,
  rotuloDaLinha,
  textoDaObservacao,
  type LinhaDoPedido,
  type PedidoDePeca,
} from "@shared/pedidos-de-peca";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HIDE_NATIVE_CLOSE, ModalFooter, ModalHeader, modalSurface } from "@/components/modal-shell";
import { T, FS, R, FW, TOM } from "@/lib/theme";
import { Botao, type VarianteBotao } from "@/components/ui/botao";
import { useConfirmar } from "@/components/ui/usar-confirmar";
import { apiRequest } from "@/lib/queryClient";
import { useIsMobile } from "@/hooks/use-mobile";

export type AcaoComMotivo = "cancelar" | "recusar" | "reabrir" | "ajuste" | "recusar-ajuste";

/** Sobre o que é a ação: uma peça da solicitação, ou (cancelar) a solicitação inteira. */
export type AlvoDaAcao = { pedido: PedidoDePeca; linha: LinhaDoPedido | null; acao: AcaoComMotivo };

// `cor` pinta só o ícone do cabeçalho; o BOTÃO segue a função (`variante`):
// cancelar e recusar encerram a peça, então são perigo; reabrir e pedir
// ajuste são a ação principal do bloco, preto como no resto do app.
const ACOES: Record<AcaoComMotivo, { titulo: (inteira: boolean) => string; confirmar: (inteira: boolean) => string; cor: string; variante: VarianteBotao; icone: LucideIcon }> = {
  cancelar:         { titulo: (i) => (i ? "Cancelar solicitação" : "Cancelar peça"), confirmar: (i) => (i ? "Cancelar solicitação" : "Cancelar peça"), cor: TOM.perigo.text, variante: "perigo", icone: XCircle },
  recusar:          { titulo: () => "Recusar peça",   confirmar: () => "Recusar peça",   cor: TOM.perigo.text, variante: "perigo", icone: XCircle },
  reabrir:          { titulo: () => "Reabrir peça",   confirmar: () => "Reabrir peça",   cor: T.text, variante: "primario", icone: RotateCcw },
  ajuste:           { titulo: () => "Pedir ajuste",   confirmar: () => "Enviar ajuste",  cor: TOM.alerta.text, variante: "primario", icone: Wrench },
  "recusar-ajuste": { titulo: () => "Recusar ajuste", confirmar: () => "Recusar ajuste", cor: TOM.perigo.text, variante: "perigo", icone: XCircle },
};

/** O aviso depois de concluir. */
export function tituloDoAviso(alvo: AlvoDaAcao): string {
  if (alvo.acao === "cancelar") return alvo.linha ? "Peça cancelada" : "Solicitação cancelada";
  if (alvo.acao === "recusar") return "Peça recusada";
  if (alvo.acao === "reabrir") return "Peça reaberta";
  if (alvo.acao === "ajuste") return "Ajuste enviado";
  return "Ajuste recusado";
}

/** A segunda linha do aviso: o que aconteceu e quem ficou sabendo. Sem ela o
 *  toast dizia só "Peça cancelada" — e a pergunta seguinte era sempre "e a
 *  lista foi avisada?". */
export function descricaoDoAviso(alvo: AlvoDaAcao): string {
  const { acao, linha } = alvo;
  if (acao === "ajuste") return "Quem monta a lista vai aceitar ou recusar — você é avisado da resposta.";
  if (acao === "recusar-ajuste") return "Quem pediu o ajuste foi avisado com o motivo.";
  if (acao === "recusar") return "Quem solicitou foi avisado com o motivo.";
  if (acao === "cancelar") return "Quem monta a lista foi avisado com o motivo.";
  if (linha?.status === "recusado") return "A peça voltou a ficar aberta e quem solicitou foi avisado.";
  return "A peça voltou a ficar aberta e quem monta a lista foi avisado.";
}

/** Quem é avisado — dito antes de confirmar. */
export function avisoDaAcao(alvo: AlvoDaAcao): string {
  const { acao, linha } = alvo;
  if (acao === "ajuste") return "Quem monta a lista recebe o ajuste e aceita ou recusa — você é avisado da resposta.";
  if (acao === "recusar-ajuste") return "Quem pediu o ajuste é avisado com este motivo.";
  if (acao === "recusar") return "Quem solicitou é avisado com este motivo. As outras peças da solicitação seguem como estão.";
  if (acao === "cancelar") {
    return linha
      ? "Só esta peça é cancelada. Quem monta a lista é avisado com este motivo."
      : "Todas as peças da solicitação são canceladas. Quem monta a lista é avisado com este motivo.";
  }
  if (linha?.status === "recusado") return "A peça volta a ficar aberta e quem solicitou é avisado.";
  return "A peça volta a ficar aberta e quem monta a lista é avisado.";
}

/** Cada ação vai para a sua rota, com o corpo que ela espera. */
export function enviarAcaoComMotivo(alvo: AlvoDaAcao, texto: string) {
  if (!alvo.linha) return apiRequest("PATCH", `/api/pedidos-de-peca/${alvo.pedido.id}/cancelar`, { motivo: texto });
  const base = `/api/pedidos-de-peca/linhas/${alvo.linha.id}`;
  if (alvo.acao === "ajuste") return apiRequest("PATCH", `${base}/ajuste`, { texto });
  if (alvo.acao === "recusar-ajuste") return apiRequest("PATCH", `${base}/ajuste/responder`, { aceitar: false, motivo: texto });
  return apiRequest("PATCH", `${base}/${alvo.acao}`, { motivo: texto });
}

export function MotivoDoPedidoDialog({ alvo, pendente, onConfirmar, onFechar }: {
  alvo: AlvoDaAcao | null;
  pendente: boolean;
  onConfirmar: (motivo: string) => void;
  onFechar: () => void;
}) {
  const isMobile = useIsMobile();
  const { confirmar, dialogo } = useConfirmar();
  const [motivo, setMotivo] = useState("");
  // Zera o motivo ao trocar de alvo ou de ação.
  const chave = alvo ? `${alvo.pedido.id}:${alvo.linha?.id ?? "toda"}:${alvo.acao}` : null;
  const [vista, setVista] = useState<string | null>(null);
  if (chave !== vista) { setVista(chave); setMotivo(""); }
  // Durante o fade de saída o alvo já é null: mantém o último na tela.
  const ultimo = useRef<AlvoDaAcao | null>(alvo);
  if (alvo) ultimo.current = alvo;
  const a = alvo ?? ultimo.current;

  const inteira = !!a && !a.linha;
  const meta = ACOES[a?.acao ?? "cancelar"];
  const titulo = meta.titulo(inteira);
  const falta = Math.max(0, MIN_MOTIVO_DO_PEDIDO - motivo.trim().length);
  const travado = falta > 0 || pendente;
  const alvoDoToque = isMobile ? 44 : 40;
  const ehAjuste = a?.acao === "ajuste";
  const subtitulo = !a ? "" : a.linha
    ? `${quantidadeDoPedido(a.linha.quantidade)} · ${rotuloDaLinha(a.linha)} · ${patrocinadoresDaLinha(a.linha)} · ${a.linha.eventName ?? "evento"}`
    : `${a.pedido.linhas.length} ${a.pedido.linhas.length === 1 ? "peça" : "peças"}${a.pedido.pedidoPor ? ` · solicitada por ${a.pedido.pedidoPor}` : ""}`;
  // Mesma guarda de descarte do formulário da solicitação (e de Usuários,
  // Patrocinadores, Modelos): Esc, clique fora, X e Voltar só perguntam se já
  // há texto — o motivo é obrigatório e um Esc acidental o apagava calado.
  // A pergunta é a do app (useConfirmar), não o window.confirm: a caixa do
  // sistema travava o modal atrás dela e dizia "OK" onde o verbo é Descartar.
  // `perguntando` evita duas perguntas empilhadas (Esc e clique fora juntos).
  const perguntando = useRef(false);
  const sair = async () => {
    if (pendente || perguntando.current) return;
    if (motivo.trim()) {
      perguntando.current = true;
      const ok = await confirmar({
        titulo: ehAjuste ? "Descartar o ajuste escrito?" : "Descartar o motivo escrito?",
        descricao: "O texto que você escreveu se perde.",
        confirmar: "Descartar",
        cancelar: "Continuar escrevendo",
        perigo: true,
      });
      perguntando.current = false;
      if (!ok) return;
    }
    onFechar();
  };
  const citacao = a?.linha ? textoDaObservacao(a.linha.observacao) : a ? a.pedido.linhas.map((l) => `${rotuloDaLinha(l)} (${quantidadeDoPedido(l.quantidade)})`).join(" · ") : "";

  return (
    <Dialog open={!!alvo} onOpenChange={(aberto) => { if (!aberto) sair(); }}>
      <DialogContent data-testid="dialog-motivo-do-pedido" className={HIDE_NATIVE_CLOSE} style={modalSurface(520)}>
        <DialogTitle className="sr-only">{titulo}</DialogTitle>
        <DialogDescription className="sr-only">{subtitulo}</DialogDescription>
        <ModalHeader icon={meta.icone} variant="confirm" tint={meta.cor} title={titulo} subtitle={subtitulo} onClose={pendente ? undefined : sair} />

        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
          {citacao && (
            <blockquote style={{ margin: 0, padding: "8px 12px", borderLeft: `3px solid ${T.bdark}`, background: T.bg, borderRadius: R.sm, fontSize: FS.body, color: T.strong, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {a?.linha ? `“${citacao}”` : citacao}
            </blockquote>
          )}
          <div>
            <label htmlFor="motivo-do-pedido" style={{ display: "block", fontSize: FS.small, fontWeight: FW.rotulo, letterSpacing: "0.08em", textTransform: "uppercase", color: T.apoio, marginBottom: 6 }}>
              {ehAjuste ? "O que precisa ajustar" : "Motivo"}
            </label>
            <textarea
              id="motivo-do-pedido"
              data-testid="input-motivo-do-pedido"
              autoFocus
              rows={4}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              // Ctrl/⌘+Enter confirma: Enter sozinho é quebra de linha num
              // campo de várias linhas, e ir até o botão com o mouse é o
              // clique a mais que quem já escreveu não precisa dar.
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !travado) { e.preventDefault(); onConfirmar(motivo.trim()); }
              }}
              aria-describedby="motivo-do-pedido-contador"
              placeholder={ehAjuste ? "Diga exatamente o que mudar na peça — quem monta a lista decide se aceita." : "Explique em uma frase — quem recebe precisa entender o porquê."}
              style={{ width: "100%", boxSizing: "border-box", borderRadius: R.md, border: `1px solid ${falta > 0 && motivo ? TOM.alerta.border : T.bdark}`, padding: "10px 12px", fontSize: isMobile ? FS.lead : FS.read, fontFamily: "inherit", lineHeight: 1.45, resize: "vertical", color: T.text }}
            />
            {/* O contador visível NÃO é região viva: anunciava "faltam 9",
                "faltam 8"… a cada tecla. Ele segue ligado ao campo pelo
                aria-describedby; quem ouve só é avisado quando fica pronto. */}
            <span className="sr-only" aria-live="polite">{falta === 0 ? (ehAjuste ? "Texto pronto para enviar." : "Motivo pronto para confirmar.") : ""}</span>
            <p id="motivo-do-pedido-contador" style={{ margin: "4px 0 0", fontSize: FS.small, color: falta > 0 ? TOM.alerta.text : TOM.esmeralda.text }}>
              {falta > 0 ? `Faltam ${falta} ${falta === 1 ? "caractere" : "caracteres"}` : ehAjuste ? "Texto pronto" : "Motivo pronto"}
              {falta === 0 && !isMobile && <span style={{ color: T.apoio }}> · Ctrl+Enter confirma</span>}
            </p>
          </div>
          <p style={{ margin: 0, display: "flex", gap: 8, alignItems: "flex-start", fontSize: FS.body, color: T.strong, lineHeight: 1.45 }}>
            <BellRing size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: T.apoio }} />
            {a ? avisoDaAcao(a) : ""}
          </p>
        </div>

        <ModalFooter>
          <Botao variante={meta.variante} data-testid="button-confirmar-motivo" disabled={falta > 0}
            carregando={pendente}
            onClick={() => onConfirmar(motivo.trim())}
            title={falta > 0 ? `O texto precisa de pelo menos ${MIN_MOTIVO_DO_PEDIDO} caracteres` : undefined}
            motivo={falta > 0 ? `Escreva pelo menos ${MIN_MOTIVO_DO_PEDIDO} caracteres.` : undefined}
            style={{ minHeight: alvoDoToque + 4, fontSize: FS.read }}>
            {pendente ? "Salvando…" : meta.confirmar(inteira)}
          </Botao>
          <Botao variante="fantasma" onClick={sair} disabled={pendente}
            style={{ minHeight: alvoDoToque }}>
            Voltar
          </Botao>
        </ModalFooter>
      </DialogContent>
      {dialogo}
    </Dialog>
  );
}
