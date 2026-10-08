// ─────────────────────────────────────────────────────────────────────────────
// O GRUPO "PRIORITÁRIAS" NO TOPO DA FILA DA GRÁFICA (dono, 08/10: "na Gráfica
// também" — as peças com prioridade pedida vêm PRIMEIRO de toda a fila, à
// frente de qualquer evento; ver ordem-da-fila.ts).
//
// POR QUE UM GRUPO PRÓPRIO, e não as prioritárias dentro dos blocos de evento
// do topo: a fila é desenhada em blocos por evento (o cabeçalho escuro com
// saída do caminhão, Etiquetas e Tubos). Com as prioritárias de vários eventos
// subindo juntas, cada uma abriria o seu cabeçalho e o MESMO evento apareceria
// duas vezes na tela (em cima, com a prioritária; embaixo, com o resto). Um
// cabeçalho "Prioritárias" no tom de perigo — o mesmo do selo — diz de uma vez
// por que elas estão ali; o evento de cada uma desce para a própria peça.
// ─────────────────────────────────────────────────────────────────────────────
import { AlertTriangle, Truck } from "lucide-react";
import { FS, FW, R, T, TOM } from "@/lib/theme";
import type { PecaDaFila } from "@/components/grafica/tipos";

/** A peça abre o grupo das prioritárias (`abre`) e quantas há no recorte. `null` = fora do grupo. */
export type PosicaoNasPrioritarias = { abre: boolean; total: number } | null;

/**
 * Os cabeçalhos que a peça desta posição abre. A fila chega ORDENADA
 * (prioritárias primeiro): o grupo é o trecho contíguo do topo. Dentro dele
 * não há cabeçalho de evento nem de tipo; a primeira peça fora dele reabre o
 * bloco do seu evento.
 */
export function cabecalhosDaPosicao(item: PecaDaFila, prev: PecaDaFila | null, nPrioritarias: number): {
  showEvHeader: boolean;
  showTypeHeader: boolean;
  prioritarias: PosicaoNasPrioritarias;
} {
  if (item.isPriority) {
    return { showEvHeader: false, showTypeHeader: false, prioritarias: { abre: !prev || !prev.isPriority, total: nPrioritarias } };
  }
  const outroBloco = !prev || !!prev.isPriority || prev.event?.name !== item.event?.name;
  return { showEvHeader: outroBloco, showTypeHeader: outroBloco || prev?.type !== item.type, prioritarias: null };
}

const frase = (total: number) => (total === 1 ? "1 peça" : `${total} peças`);
const EXPLICACAO = "Prioridade na impressão pedida pela Solicitação — imprimir antes dos eventos abaixo.";

/** A faixa do grupo na TABELA (desktop). */
export function CabecalhoDasPrioritariasNaTabela({ nColunas, total }: { nColunas: number; total: number }) {
  return (
    <tr data-testid="cabecalho-prioritarias" style={{ backgroundColor: TOM.perigo.bg }}>
      <td colSpan={nColunas} style={{ padding: "10px 16px", borderTop: `1px solid ${TOM.perigo.border}`, borderBottom: `1px solid ${TOM.perigo.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px 10px", flexWrap: "wrap" }}>
          <AlertTriangle aria-hidden="true" style={{ width: 15, height: 15, color: TOM.perigo.text, flexShrink: 0 }} />
          <span style={{ fontSize: FS.strong, fontWeight: FW.rotulo, color: TOM.perigo.text }}>Prioritárias</span>
          <span style={{ fontSize: FS.meta, fontWeight: FW.forte, color: TOM.perigo.text, fontVariantNumeric: "tabular-nums" }}>{frase(total)}</span>
          <span style={{ fontSize: FS.meta, color: T.apoio }}>{EXPLICACAO}</span>
        </div>
      </td>
    </tr>
  );
}

/** A faixa do grupo nos CARTÕES (celular e tablet). */
export function CabecalhoDasPrioritariasNoCartao({ total, primeiro }: { total: number; primeiro: boolean }) {
  return (
    <div data-testid="cabecalho-prioritarias" style={{ marginTop: primeiro ? 0 : 8, padding: "8px 10px", background: TOM.perigo.bg, border: `1px solid ${TOM.perigo.border}`, borderRadius: R.md, display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <AlertTriangle aria-hidden="true" style={{ width: 14, height: 14, color: TOM.perigo.text, flexShrink: 0 }} />
        <span style={{ fontSize: FS.read, fontWeight: FW.rotulo, color: TOM.perigo.text }}>Prioritárias</span>
        <span style={{ marginLeft: "auto", fontSize: FS.meta, fontWeight: FW.forte, color: TOM.perigo.text, fontVariantNumeric: "tabular-nums" }}>{frase(total)}</span>
      </span>
      <span style={{ fontSize: FS.meta, color: T.apoio, lineHeight: 1.4 }}>{EXPLICACAO}</span>
    </div>
  );
}

/**
 * O EVENTO da prioritária, na própria peça — no grupo do topo não há o
 * cabeçalho escuro do evento. Nome e saída do caminhão, que é o que ordena a
 * Gráfica.
 */
export function EventoDaPrioritaria({ item, fonte = FS.small }: { item: PecaDaFila; fonte?: number }) {
  const saida = item.event?.truckDepartureDate
    ? new Date(item.event.truckDepartureDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })
    : null;
  return (
    <div data-testid={`evento-da-prioritaria-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5, fontSize: fonte, color: T.apoio, lineHeight: 1.35 }}>
      <span style={{ fontWeight: FW.forte, color: T.text, overflowWrap: "anywhere", minWidth: 0 }}>{item.event?.name || "Sem evento"}</span>
      {saida && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
          <Truck aria-hidden="true" style={{ width: 12, height: 12 }} />
          Saída {saida}
        </span>
      )}
    </div>
  );
}
