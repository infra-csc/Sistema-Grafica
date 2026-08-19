import { and, eq, isNotNull, or } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, itemSponsorApprovals, items } from "@shared/schema";
import { correcaoRevisadaMotivoSemS } from "@shared/reparo-motivo";

export type ReparoMotivo = {
  recordId: string;
  displayId: string | null;
  origem: "item" | "aprovacao_patrocinador";
  campo: "rejectionReason" | "observations";
  antes: string;
  depois: string;
};

export type AtorDoReparo = {
  userId?: string | null;
  userName?: string | null;
};

/**
 * Lista apenas mensagens que têm uma correção exata já revisada. A varredura
 * não usa aproximação: texto que não faz parte do catálogo fica intacto.
 */
export async function listarReparosMotivosSemS(): Promise<ReparoMotivo[]> {
  const [linhasDeItem, linhasDeAprovacao] = await Promise.all([
    db
      .select({
        id: items.id,
        displayId: items.displayId,
        rejectionReason: items.rejectionReason,
        observations: items.observations,
      })
      .from(items)
      .where(or(isNotNull(items.rejectionReason), isNotNull(items.observations))),
    db
      .select({
        id: itemSponsorApprovals.id,
        displayId: items.displayId,
        rejectionReason: itemSponsorApprovals.rejectionReason,
      })
      .from(itemSponsorApprovals)
      .innerJoin(items, eq(itemSponsorApprovals.itemId, items.id))
      .where(isNotNull(itemSponsorApprovals.rejectionReason)),
  ]);

  const reparos: ReparoMotivo[] = [];

  for (const linha of linhasDeItem) {
    for (const campo of ["rejectionReason", "observations"] as const) {
      const antes = linha[campo];
      if (!antes) continue;
      const depois = correcaoRevisadaMotivoSemS(antes);
      if (!depois || depois === antes) continue;
      reparos.push({
        recordId: linha.id,
        displayId: linha.displayId,
        origem: "item",
        campo,
        antes,
        depois,
      });
    }
  }

  for (const linha of linhasDeAprovacao) {
    const antes = linha.rejectionReason;
    if (!antes) continue;
    const depois = correcaoRevisadaMotivoSemS(antes);
    if (!depois || depois === antes) continue;
    reparos.push({
      recordId: linha.id,
      displayId: linha.displayId,
      origem: "aprovacao_patrocinador",
      campo: "rejectionReason",
      antes,
      depois,
    });
  }

  return reparos.sort((a, b) => (a.displayId ?? "").localeCompare(b.displayId ?? "", "pt-BR"));
}

/**
 * Aplica a prévia atual. Cada UPDATE também compara o texto antigo no WHERE,
 * então uma edição feita entre a leitura e o clique não é sobrescrita.
 */
export async function aplicarReparosMotivosSemS(ator: AtorDoReparo): Promise<{
  totalEncontrado: number;
  aplicados: number;
  ignoradosPorMudanca: number;
}> {
  const reparos = await listarReparosMotivosSemS();
  const aplicados = await db.transaction(async (tx) => {
    let total = 0;
    const agora = new Date();

    for (const reparo of reparos) {
      const atualizados = reparo.origem === "aprovacao_patrocinador"
        ? await tx
          .update(itemSponsorApprovals)
          .set({ rejectionReason: reparo.depois, updatedAt: agora })
          .where(and(
            eq(itemSponsorApprovals.id, reparo.recordId),
            eq(itemSponsorApprovals.rejectionReason, reparo.antes),
          ))
          .returning({ id: itemSponsorApprovals.id })
        : reparo.campo === "observations"
          ? await tx
            .update(items)
            .set({ observations: reparo.depois, updatedAt: agora })
            .where(and(
              eq(items.id, reparo.recordId),
              eq(items.observations, reparo.antes),
            ))
            .returning({ id: items.id })
          : await tx
            .update(items)
            .set({ rejectionReason: reparo.depois, updatedAt: agora })
            .where(and(
              eq(items.id, reparo.recordId),
              eq(items.rejectionReason, reparo.antes),
            ))
            .returning({ id: items.id });

      if (atualizados.length === 0) continue;
      total++;

      await tx.insert(auditLogs).values({
        userId: ator.userId ?? null,
        userName: ator.userName?.trim() || "Sistema",
        action: "corrected_text",
        entityType: reparo.origem === "item" ? "item" : "item_sponsor_approval",
        entityId: reparo.recordId,
        details: JSON.stringify({
          source: "reparo-motivos-sem-s",
          field: reparo.campo,
          before: reparo.antes,
          after: reparo.depois,
        }),
      });
    }

    return total;
  });

  return {
    totalEncontrado: reparos.length,
    aplicados,
    ignoradosPorMudanca: reparos.length - aplicados,
  };
}