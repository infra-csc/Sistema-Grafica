// Selos da fila da Gráfica: a reserva na fila de uma impressora, o prazo de
// Produção Gráfica no cabeçalho escuro do evento e o m² a produzir da linha.
import type React from "react";
import { Printer } from "lucide-react";
import { FS, FW, N, T, TOM } from "@/lib/theme";
import { rotuloDaMaquina } from "@shared/fluxo-peca";
import { fraseDaFila } from "@shared/progresso-da-impressao";
import { isInProd, m2ToProduce, reusedTotalOf } from "@/lib/saldo";
import type { EventoDaPeca, PecaDaFila } from "@/components/grafica/tipos";

/**
 * "Fila: Impressora 2" — a peça liberada já tem impressora RESERVADA na aba
 * Máquinas (dono, 21/09: "isso refletir na tela da Gráfica"). Só leitura:
 * a reserva se faz lá; aqui nada muda de status.
 */
export function SeloFilaDaImpressora({ item, fonte }: { item: PecaDaFila; fonte: number }) {
  // A frase é a de fraseDaFila (shared): "Fila: Impressora 2", "Fila:
  // Impressora 2 (20) · 14 sem impressora", "Pausada · Fila: …" — a mesma
  // conta das filas dos cartões de Máquinas.
  // Peça JÁ em impressão com parte reservada a uma impressora (revisão
  // adversarial, 22/09): o selo mostra a reserva com o número ("Fila:
  // Impressora 1 (8)") — a linha de progresso só conta o que está NA impressora.
  const frase = fraseDaFila(item, { emImpressao: isInProd(item) });
  if (!frase) return null;
  const maquina = String(item.maquinaPrevista ?? "");
  const dividida = frase.length > 26;
  return (
    <span data-testid="selo-fila-impressora" title={`Reservada na fila da ${maquina ? rotuloDaMaquina(maquina) : "impressora"} (Máquinas) — a etapa não muda até iniciar a impressão`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: fonte, fontWeight: 700, color: T.apoio, background: N.n2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "1px 6px", whiteSpace: dividida ? "normal" : "nowrap" }}>
      <Printer aria-hidden="true" style={{ width: 11, height: 11, flexShrink: 0 }} />
      {frase}
    </span>
  );
}

// Chip de prazo da Produção Gráfica — o mesmo visual sobre o cabeçalho escuro
// do evento, tanto na tabela desktop quanto no card mobile.
export function DeadlineChip({ event, fonte = FS.small }: { event: EventoDaPeca; /** Celular: 12 (informação ≥ 12px). */ fonte?: number }) {
  if (!event?.truckDepartureDate) return null;
  const days = event.deadlineProducaoGrafica ?? -1;
  // Conta e formata em UTC — a mesma convenção da "Saída" exibida ao lado.
  // Em fuso local o chip podia mostrar um dia a menos que a data do cabeçalho.
  const base = new Date(event.truckDepartureDate);
  const dUTC = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dUTC - todayUTC) / 86400000);
  const ds = new Date(dUTC).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  // Tons CLAROS para o cabeçalho ESCURO do evento: a paleta TOM é de texto
  // escuro sobre fundo claro e não serve aqui; estes três hexes ficam.
  const s = diff < 0
    ? { bg: "rgba(255,80,80,0.22)", border: "rgba(255,80,80,0.38)", text: "#ffb3b3" }
    : diff === 0
    ? { bg: "rgba(255,200,80,0.28)", border: "rgba(255,200,80,0.45)", text: "#ffe59c" }
    : diff <= 3
    ? { bg: "rgba(255,160,50,0.22)", border: "rgba(255,160,50,0.38)", text: "#ffc78a" }
    : { bg: "rgba(255,255,255,0.12)", border: "rgba(255,255,255,0.2)", text: "rgba(255,255,255,0.72)" };
  // O sufixo só aparecia entre 0 e 14 dias: com o prazo VENCIDO o chip ficava
  // "Produção Gráfica · 09/08" em vermelho, sem número — exatamente o caso em
  // que a magnitude decide a ordem do galpão. Há diferença operacional enorme
  // entre "venceu ontem" e "venceu há duas semanas".
  const sufixo = diff < 0 ? `atrasado ${Math.abs(diff)}d`
    : diff === 0 ? "hoje"
    : diff <= 14 ? `${diff}d`
    : "";
  return (
    <span
      title={`Marco de Produção Gráfica em ${ds}${sufixo ? ` — ${sufixo}` : ""}`}
      aria-label={`Prazo de produção gráfica: ${ds}${sufixo ? `, ${sufixo}` : ""}`}
      // flexWrap + maxWidth: o selo vivia em `nowrap` e, com a tabela mais
      // larga que a tela (sidebar aberta), saía pela direita cortado ao meio
      // ("Produção Gráfica · 10/09 · atras…"). Agora quebra dentro da pílula.
      style={{ display: "inline-flex", alignItems: "center", flexWrap: "wrap", maxWidth: "100%", gap: 5, backgroundColor: s.bg, border: `1px solid ${s.border}`, borderRadius: 999, padding: "3px 9px", fontSize: fonte, fontWeight: 700, color: s.text, letterSpacing: "0.04em", alignSelf: "flex-start" }}
    >
      <span style={{ whiteSpace: "nowrap" }}>Produção Gráfica · {ds}</span>{sufixo && <span style={{ whiteSpace: "nowrap", opacity: diff < 0 ? 0.95 : 0.8, fontWeight: diff < 0 ? 700 : 500 }}>· {sufixo}</span>}
    </span>
  );
}

/** m² a produzir de uma linha — a coluna cheia e a versão compacta leem daqui. */
export const m2DaLinha = (item: PecaDaFila): React.ReactNode => {
  const total = Number(item.calculatedM2) || 0;
  if (!total) return "—";
  const toPrint = m2ToProduce(item);
  if (reusedTotalOf(item) === 0) return total.toFixed(2);
  return (
    <span title={`Total da peça: ${total.toFixed(2)} m² · reaproveitado não é impresso`}>
      <span style={{ color: toPrint === 0 ? TOM.esmeralda.text : T.text }}>{toPrint.toFixed(2)}</span>
      <span style={{ display: "block", fontSize: FS.small, fontWeight: FW.corpo, color: T.second, textDecoration: "line-through" }}>
        {total.toFixed(2)}
      </span>
    </span>
  );
};
