import { Undo2 } from "lucide-react";

/**
 * QUEM RECEBEU, LEMBRADO — em um toque, nunca preenchido sozinho.
 *
 * O campo é livre de propósito (quem recebe muda a cada entrega, e uma lista
 * de nomes antigos atrapalhava). Mas o caminhão do dia costuma ter UM
 * recebedor: redigitar o mesmo nome em cada peça era o esforço mais repetido
 * da entrega. O meio-termo é oferecer o último nome desta sessão como atalho
 * visível — quem entrega para outra pessoa simplesmente ignora.
 *
 * Mora aqui (e não em pages/grafica.tsx) porque os modais da Gráfica E a fila
 * do celular (galpao-fila) precisam do MESMO atalho: pré-preencher o campo
 * gravava um nome que ninguém digitou — a fila tinha voltado a fazer isso.
 */
export function SugestaoRecebedor({ nome, atual, onUsar }: { nome: string; atual: string; onUsar: (v: string) => void }) {
  if (!nome.trim() || atual.trim()) return null;
  return (
    <button
      type="button"
      onClick={() => onUsar(nome)}
      data-testid="button-usar-ultimo-recebedor"
      style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px", borderRadius: 999, border: "1px solid #d6d3d1", background: "#ffffff", color: "#44403c", fontSize: 12, fontWeight: 700, cursor: "pointer", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      <Undo2 aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
      Usar “{nome}” (última entrega)
    </button>
  );
}
