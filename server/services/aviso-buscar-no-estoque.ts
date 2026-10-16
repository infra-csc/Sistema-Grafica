// ─────────────────────────────────────────────────────────────────────────────
// "BUSCAR NO ESTOQUE" — o aviso no sino da Gráfica (dono, 16/10: "quando eu
// marcar 'reaproveitar do estoque' os meninos já ficam espertos que eles têm
// que procurar essa peça lá no estoque").
//
// Dispara quando a peça com reaproveitamento DO ESTOQUE está (ou acaba de
// chegar) na fila da Gráfica — liberada, em impressão ou produzida. Marcada
// antes disso (no rascunho, na Revisão), o aviso sai na LIBERAÇÃO, que é
// quando a Gráfica passa a enxergar a peça. Quem marcou sendo a própria
// Gráfica não recebe aviso de si mesma.
//
// Tipo `itemAdded` ("Chegou à sua fila"), que o sino já desenha. O nome do
// evento vai no fim ("— Evento: X"), que é o que o sino usa para agrupar.
// ─────────────────────────────────────────────────────────────────────────────
import type { Item } from "@shared/schema";
import { doEstoqueDe, origemDe } from "@shared/origem-do-reaproveitamento";
import { statusDasEtapas } from "@shared/fluxo-peca";
import { storage } from "../storage";
import { broadcast } from "../routes/shared";

/** Onde a peça já está na mesa da Gráfica com unidades a separar. */
const NA_FILA_DA_GRAFICA: ReadonlySet<string> = new Set(statusDasEtapas("ready_for_production", "approved", "inProduction", "produced"));

/** A frase do sino: "Buscar no estoque: #6033 Placa 2x1 (4 un.) · obs — Evento: X". */
export function fraseDoAvisoBuscarNoEstoque(peca: Pick<Item, "displayId" | "type" | "description" | "quantity" | "reuseQty" | "isReuse" | "origemReaproveitamento" | "obsReaproveitamento">, nomeDoEvento: string | null | undefined): string {
  const un = doEstoqueDe(peca);
  const nome = [peca.displayId, peca.type, peca.description?.trim()].filter(Boolean).join(" ");
  const obs = peca.obsReaproveitamento?.trim();
  return `Buscar no estoque: ${nome} (${un} un.)${obs ? ` · ${obs}` : ""}${nomeDoEvento ? ` — Evento: ${nomeDoEvento}` : ""}`;
}

/**
 * Avisa a Gráfica se `depois` pede busca no estoque e `antes` não pedia (ou a
 * peça acabou de chegar à fila). Nunca lança: o aviso é cortesia — a marca já
 * foi gravada e a peça já mostra "Buscar no estoque" na fila.
 */
export async function avisarBuscarNoEstoque(
  antes: Pick<Item, "status" | "origemReaproveitamento" | "reuseQty" | "isReuse" | "quantity"> | null,
  depois: Item,
  papelDeQuemFez: string | null | undefined,
): Promise<void> {
  try {
    if (papelDeQuemFez === "grafica") return;
    if (origemDe(depois) !== "estoque" || doEstoqueDe(depois) === 0) return;
    if (!NA_FILA_DA_GRAFICA.has(depois.status)) return;
    const jaPedia = !!antes && origemDe(antes) === "estoque" && doEstoqueDe(antes) > 0 && NA_FILA_DA_GRAFICA.has(antes.status);
    if (jaPedia) return;
    const evento = await storage.getEvent(depois.eventId);
    const notification = await storage.createNotification({
      type: "itemAdded",
      message: fraseDoAvisoBuscarNoEstoque(depois, evento?.name),
      eventId: depois.eventId,
      itemId: depois.id,
      targetRoles: ["grafica"],
    });
    broadcast({ type: "notification_created", notification });
  } catch (erro) {
    console.warn("[aviso buscar no estoque] não foi possível avisar a Gráfica:", erro);
  }
}
