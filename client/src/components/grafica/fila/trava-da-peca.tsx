// A TRAVA DA SOLICITAÇÃO na linha e no cartão: a regra (quem trava, o que
// bloqueia, as frases) mora em shared/trava-da-peca.ts; aqui só o botão, o selo
// e o "Tirar da impressora" da peça que o modal não abre.
import { useState } from "react";
import type React from "react";
import { Lock, Unlock, Undo2 } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { partesDaPeca, partesAtivas } from "@shared/impressao-dividida";
import { pecaTravada, fraseDaTrava, seloDaTrava } from "@shared/trava-da-peca";
import { isDelivered } from "@/lib/saldo";
import type { PecaDaFila } from "@/components/grafica/tipos";

/**
 * O vinho da TRAVA (red-900) — o mesmo selo de Máquinas. Fica hex: é um degrau
 * ABAIXO de TOM.perigo de propósito (a trava não é erro, é parada decidida) e a
 * paleta ainda não tem esse tom. Branco sobre ele: 10,4:1.
 */
export const VINHO_DA_TRAVA = "#7f1d1d";

/**
 * A TRAVA DA SOLICITAÇÃO na linha e no cartão: travada, a faixa vermelho-escura
 * "Travada: <motivo> · por Fulano, há 2h" (+ "Destravar" para quem pode); livre,
 * o botão "Travar" (cadeado) só para a Solicitação/admin.
 */
export function TravaDaPeca({ item, podeMexer, fonte, alvo, onTravar, onDestravar, destravando }: {
  item: PecaDaFila; podeMexer: boolean; fonte: number; alvo: number;
  onTravar: () => void; onDestravar: () => void; destravando?: boolean;
}) {
  const travada = pecaTravada(item);
  if (!travada && !podeMexer) return null;
  if (!travada) {
    if (isDelivered(item)) return null;
    return (
      <Botao tamanho="sm" icone={Lock} onClick={(e) => { e.stopPropagation(); onTravar(); }} data-testid={`button-travar-${item.id}`} title="Travar a peça: a Gráfica não consegue fazê-la andar até alguém da Solicitação destravar"
        style={{ minHeight: alvo, marginTop: 4, color: TOM.perigo.text, fontSize: Math.max(fonte, FS.meta) }}>
        Travar
      </Botao>
    );
  }
  return (
    <div role="status" data-testid={`selo-travada-${item.id}`} title={fraseDaTrava(item)} style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", padding: "4px 8px", borderRadius: R.sm, background: VINHO_DA_TRAVA, color: T.surface, fontSize: fonte, fontWeight: FW.forte, lineHeight: 1.35, whiteSpace: "normal", overflowWrap: "anywhere" }}>
      <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
      <span style={{ flex: "1 1 140px", minWidth: 0 }}>{seloDaTrava(item)}</span>
      {podeMexer && (
        <Botao tamanho="sm" icone={Unlock} carregando={destravando} onClick={(e) => { e.stopPropagation(); onDestravar(); }} data-testid={`button-destravar-${item.id}`}
          style={{ minHeight: alvo, color: TOM.perigo.text, borderColor: TOM.perigo.border, fontSize: Math.max(fonte, FS.meta) }}>
          {destravando ? "Destravando…" : "Destravar"}
        </Botao>
      )}
    </div>
  );
}

/**
 * TIRAR DA IMPRESSORA quando o modal não abre (revisão adversarial, 22/09): a
 * peça TRAVADA ou de EVENTO FINALIZADO em impressão tinha o único "Tirar" dentro
 * do modal — que essas peças não abrem — e prendia a impressora. Recuar nunca
 * é barrado (o servidor também não barra quem SAI): um botão por impressora
 * com parte ativa, com confirmação leve ali mesmo.
 */
export function TirarDaImpressoraBloqueada({ item, fonte, alvo, pendente, onTirar }: { item: PecaDaFila; fonte: number; alvo: number; pendente: boolean; onTirar: (maquina: string) => void }) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const partes = partesDaPeca(item);
  const maquinas = Object.keys(partesAtivas(partes));
  if (!maquinas.length) return null;
  const estilo: React.CSSProperties = { minHeight: alvo, fontSize: Math.max(fonte, FS.meta) };
  return (
    <span data-testid={`tirar-bloqueada-${item.id}`} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }} onClick={(e) => e.stopPropagation()}>
      {maquinas.map((m) => {
        const x = partes[m];
        const falta = Math.max(0, x.atrib - x.impressas);
        return confirmando === m ? (
          <span key={m} role="alertdialog" aria-label="Tirar da impressora" data-testid={`confirmar-tirar-bloqueada-${item.id}-${m}`} style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: fonte, fontWeight: 700, color: TOM.alerta.text }}>
            <span>Tirar da {rotuloDaMaquina(m)}? {x.impressas} de {x.atrib} ficam anotadas; {falta} {falta === 1 ? "volta" : "voltam"} para a fila dela.</span>
            <Botao variante="primario" tamanho="sm" carregando={pendente} onClick={() => { setConfirmando(null); onTirar(m); }} data-testid={`button-confirmar-tirar-bloqueada-${item.id}-${m}`} style={estilo}>{pendente ? "Tirando…" : "Tirar"}</Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmando(null)} style={estilo}>Cancelar</Botao>
          </span>
        ) : (
          <Botao key={m} tamanho="sm" icone={Undo2} disabled={pendente} onClick={() => setConfirmando(m)} data-testid={`button-tirar-bloqueada-${item.id}-${m}`} title={`Tirar da ${rotuloDaMaquina(m)}: o que já saiu fica anotado e o resto volta para a fila dela — a impressora fica livre`} style={estilo}>
            {maquinas.length > 1 ? `Tirar da ${rotuloDaMaquina(m)}` : "Tirar da impressora"}
          </Botao>
        );
      })}
    </span>
  );
}

/** Os atributos que DESABILITAM um botão de ação da peça travada (com o motivo no title). */
export const bloqueioDaTrava = (item: PecaDaFila): Record<string, unknown> =>
  pecaTravada(item) ? { disabled: true, title: fraseDaTrava(item), "data-travada": "true", "aria-disabled": true } : {};
/** O botão desabilitado pela trava fica apagado mesmo com o estilo inline da linha. */
export const CSS_DA_TRAVA = "button[data-travada]{opacity:.45!important;cursor:not-allowed!important}";
