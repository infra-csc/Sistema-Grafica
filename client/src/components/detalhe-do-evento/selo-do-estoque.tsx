// ─────────────────────────────────────────────────────────────────────────────
// O SELO DO ESTOQUE NA PEÇA — quantas iguais (mesmo tipo e medida) o estoque
// tem, e o clique abre a busca. Só existe com o resumo (admin).
// ─────────────────────────────────────────────────────────────────────────────
import { Warehouse } from "lucide-react";
import { T, TOM } from "@/lib/theme";
import type { EstoqueDaPeca, PecaDoEvento } from "./tipos";

export function SeloDoEstoque({ item, est, onAbrir }: {
  item: PecaDoEvento;
  /** O resumo desta peça; sem ele, nada. */
  est: EstoqueDaPeca | undefined;
  onAbrir: (peca: { id: string; eventId: string }) => void;
}) {
  if (!est) return null;
  const achadas = est.disponiveis + est.chegamATempo + est.faltaTriagem;
  const tom = est.reservadas > 0
    ? { fundo: TOM.esmeralda.bg, borda: TOM.esmeralda.border, cor: TOM.esmeralda.text }
    : est.disponiveis > 0
      ? { fundo: T.text, borda: T.text, cor: T.surface }
      : { fundo: TOM.info.bg, borda: TOM.info.border, cor: TOM.info.text };
  const detalhe = [
    est.disponiveis ? `${est.disponiveis} livre(s) no galpão` : null,
    est.chegamATempo ? `${est.chegamATempo} em uso que volta(m) a tempo` : null,
    est.faltaTriagem ? `${est.faltaTriagem} esperando triagem` : null,
    est.reservadas ? `${est.reservadas} já reservada(s) para esta peça` : null,
  ].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      data-testid={`badge-estoque-${item.id}`}
      onClick={e => { e.stopPropagation(); onAbrir({ id: item.id, eventId: item.eventId }); }}
      title={`Buscar no estoque — ${detalhe}`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, backgroundColor: tom.fundo, border: `1px solid ${tom.borda}`, color: tom.cor, borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, marginRight: 4, cursor: "pointer" }}
    >
      <Warehouse style={{ width: 10, height: 10 }} />
      {est.reservadas > 0 ? `Estoque: ${est.reservadas}/${item.quantity} reserv.` : `No estoque: ${achadas}`}
    </button>
  );
}
