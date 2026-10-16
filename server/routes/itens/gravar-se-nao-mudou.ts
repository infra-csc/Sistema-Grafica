// ─────────────────────────────────────────────────────────────────────────────
// GRAVAR A PEÇA SÓ SE A CONTA DELA NÃO MUDOU DESDE A LEITURA.
//
// Reaproveitar e corrigir o reaproveitamento decidem a partir de uma leitura da
// peça (impressas, reaproveitadas, conferidas, embaladas, entregues, origem,
// status) e gravam números ABSOLUTOS calculados dela. Sem trava, uma
// conferência, um embalar ou outra pessoa reaproveitando no meio ficavam
// por baixo: a gravação sobrescrevia o que mudou (revisão adversarial, 16/10).
//
// Aqui a escrita roda numa transação com a peça TRAVADA (SELECT … FOR UPDATE,
// o mesmo padrão da conferência e da troca de origem): se qualquer coluna da
// conta mudou desde a leitura, nada é gravado e quem chamou responde 409 —
// "a peça mudou, atualize". Mesmo carimbo de status do storage.updateItem.
// ─────────────────────────────────────────────────────────────────────────────
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { items as itemsTable, type Item } from "@shared/schema";

/** As colunas que as decisões de reaproveitar e corrigir leem. */
const COLUNAS_DA_CONTA = [
  "status", "quantity", "quantityProduced", "reuseQty", "isReuse", "conferredQty", "embaladaQty", "deliveredQty",
  "origemReaproveitamento", "obsReaproveitamento", "travadaEm", "deletedAt", "printMachine", "impressaoPorMaquina", "reservaPorMaquina",
] as const;

const igual = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v instanceof Date ? v.getTime() : v === undefined ? null : v);
  const x = norm(a), y = norm(b);
  if (x === y) return true;
  if (x !== null && y !== null && typeof x === "object" && typeof y === "object") return JSON.stringify(x) === JSON.stringify(y);
  // datas que chegam como texto de um lado e Date do outro
  if ((typeof x === "number" && typeof y === "string") || (typeof x === "string" && typeof y === "number")) {
    return new Date(x as never).getTime() === new Date(y as never).getTime();
  }
  return false;
};

/** O que mudou na conta da peça entre a leitura e agora (vazio = nada). */
export function mudancasNaConta(lida: Partial<Item>, agora: Partial<Item>): string[] {
  return COLUNAS_DA_CONTA.filter((c) => !igual(lida[c], agora[c]));
}

export const FRASE_PECA_MUDOU = "A peça mudou enquanto você decidia (outra pessoa conferiu, embalou ou mexeu no reaproveitamento) — atualize a tela e tente de novo.";

/**
 * Grava `dados` na peça se a conta dela é a mesma da `lida`. Devolve a peça
 * gravada, `"mudou"` (nada gravado) ou `null` (a peça sumiu).
 */
export async function gravarSeNaoMudou(lida: Item, dados: Partial<Item>): Promise<Item | "mudou" | null> {
  return db.transaction(async (tx) => {
    const [agora] = await tx.select().from(itemsTable).where(eq(itemsTable.id, lida.id)).for("update");
    if (!agora || agora.deletedAt) return null;
    if (mudancasNaConta(lida, agora).length > 0) return "mudou" as const;
    const instante = new Date();
    const [item] = await tx.update(itemsTable).set({
      ...dados,
      updatedAt: instante,
      ...(dados.status !== undefined && dados.status !== agora.status ? { statusChangedAt: instante } : {}),
    }).where(eq(itemsTable.id, lida.id)).returning();
    return item ?? null;
  });
}
