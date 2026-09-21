// ─────────────────────────────────────────────────────────────────────────────
// A RESPOSTA DO ESTOQUE NA LIBERAÇÃO DA REVISÃO FINAL (dono, 21/09).
//
// "As respostas do reaproveitar têm que aparecer na REVISÃO, e é ELA que segue
// com o item." Enquanto a peça está na Revisão Final a resposta da Gráfica só
// fica registrada; o reaproveitamento entra quando a Revisão Final LIBERA, na
// mesma transação da liberação (PATCH /api/items/:id/creator-review). "Tem que
// vir SUGERIDO de acordo com a resposta do estoque e ela só CONFIRMAR": sem
// nada no corpo, vale o que o estoque atendeu; ela pode usar MENOS, nunca mais.
//
// Arquivo à parte, e sem importar rota nenhuma, de propósito: routes/items.ts
// é carregado por dezenas de testes com `../routes/shared` de mentira — este
// módulo só conhece o banco e o schema.
// ─────────────────────────────────────────────────────────────────────────────
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import { consultasDeEstoque } from "@shared/schema";

export type RespostaParaLiberar = { id: string; pedida: number; atendida: number; respondidoPor: string | null };

/**
 * A resposta (atendida / atendida em parte) ainda não aplicada desta peça.
 * NUNCA derruba a liberação: se a leitura falhar (tabela ainda não criada em
 * produção, banco fora), a peça é liberada como sempre e o erro vai para o log.
 */
export async function respostaDoEstoqueParaLiberar(itemId: string): Promise<RespostaParaLiberar | null> {
  try {
    const [c] = await db.select({
      id: consultasDeEstoque.id,
      pedida: consultasDeEstoque.quantidadePedida,
      atendida: consultasDeEstoque.quantidadeAtendida,
      respondidoPor: consultasDeEstoque.respondidoPor,
    })
      .from(consultasDeEstoque)
      .where(and(
        eq(consultasDeEstoque.itemId, itemId),
        inArray(consultasDeEstoque.status, ["atendida", "atendida_parcial"]),
        isNull(consultasDeEstoque.aplicadoEm),
      ))
      .orderBy(desc(consultasDeEstoque.respondidoEm))
      .limit(1);
    return c && (c.atendida ?? 0) > 0 ? { id: c.id, pedida: c.pedida, atendida: c.atendida!, respondidoPor: c.respondidoPor } : null;
  } catch (error) {
    console.error("[solicitacao-ao-estoque] não deu para ler a resposta do estoque na liberação — a peça segue sem ela:", error);
    return null;
  }
}

/** Dentro da transação da liberação: a resposta virou reaproveitamento. */
export async function marcarRespostaAplicada(tx: any, consultaId: string): Promise<void> {
  await tx.update(consultasDeEstoque)
    .set({ aplicadoEm: new Date() })
    .where(and(eq(consultasDeEstoque.id, consultaId), isNull(consultasDeEstoque.aplicadoEm)));
}
