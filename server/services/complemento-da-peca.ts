// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — a regra de POST e DELETE /api/items/:id/complement.
//
// A rota (server/routes/itens/complemento.ts) valida corpo, papel, status e
// evento; aqui mora o que criar e desfazer um complemento gravam: a peça-filha
// com m² derivado, as duas linhas de trilha, o aviso à Gráfica — numa
// transação só — e a cópia dos patrocinadores depois dela.
// ─────────────────────────────────────────────────────────────────────────────
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage, isDisplayIdConflictError } from "../storage";
import { type Item, type Event, type Notification, items as itemsTable, auditLogs, notifications } from "@shared/schema";
import { translateStatus, resolveActor, type AuditActor } from "../routes/shared";
import { deriveCalculatedM2 } from "../routes/itens/comum";
import { mensagemDoErro } from "../erros";

/** Cria o complemento (a peça-filha com a diferença) — a mãe não recebe UPDATE nenhum. */
export async function criarComplemento(
  parent: Item,
  event: Event,
  pedido: { quantity: number; reason: string },
  ator: AuditActor,
): Promise<{ child: Item; notification: Notification }> {
  // m² do filho SEMPRE derivado no servidor, nesta ordem:
  // 1) fórmula normal (quantidade × largura × altura do arquivo);
  // 2) rateio do m² da mãe (acervo antigo não tem dimensões de arquivo);
  // 3) "0.00" — a coluna é NOT NULL — com a ressalva no audit log.
  // Ganho não óbvio: o m² do EVENTO fica correto sozinho, porque as duas
  // linhas somam. Nenhuma agregação precisa saber o que é complemento.
  const derivado = deriveCalculatedM2({
    quantity: pedido.quantity, fileWidth: parent.fileWidth, fileHeight: parent.fileHeight,
  });
  const rateado = Number(parent.calculatedM2) > 0 && parent.quantity > 0
    ? ((Number(parent.calculatedM2) / parent.quantity) * pedido.quantity).toFixed(2)
    : null;
  const m2 = derivado ?? rateado ?? "0.00";
  const m2NaoDerivavel = derivado === undefined && rateado === null;

  const autor = resolveActor(ator);
  const userName = autor.userName;
  const posSaida = !!event.truckDepartureDate && new Date(event.truckDepartureDate) < new Date();
  const marcaSaida = posSaida ? " [pós-saída do caminhão]" : "";
  const marcaM2 = m2NaoDerivavel ? " (m² não derivável)" : "";

  // Uma transação: peça-filha + os DOIS audit logs + a notificação. Se
  // qualquer passo falhar, nada fica meio criado — e o pior meio-caminho
  // possível aqui é um complemento na fila da Gráfica sem o motivo
  // registrado em lugar nenhum.
  //
  // A retentativa é da transação INTEIRA (não do INSERT): no Postgres, uma
  // transação que tomou erro está abortada e não aceita mais comandos. O
  // 23505 acontece quando duas pessoas pedem o aumento da mesma peça no
  // mesmo instante e ambas calculam o mesmo -C1; na segunda volta o MAX já
  // enxerga o -C1 e sai o -C2.
  const criar = () => db.transaction(async (tx) => {
    const child = await storage.createComplementItemTx(tx, parent, {
      quantity: pedido.quantity,
      calculatedM2: m2,
      status: "ready_for_production",
      complementReason: pedido.reason,
      complementRequestedBy: userName,
      complementRequestedAt: new Date(),
    });

    // LOG NA FILHA — a história do lote novo.
    await tx.insert(auditLogs).values({
      ...autor, action: "complement_created", entityType: "item", entityId: child.id,
      details: `Complemento de ${parent.displayId}: +${pedido.quantity} un. (${m2} m²)${marcaM2}. `
             + `Peça original permanece ${translateStatus(parent.status)} com ${parent.quantity} un. `
             + `Motivo: ${pedido.reason}${marcaSaida}`,
    });
    // LOG NA MÃE — OBRIGATÓRIO. A ficha da peça filtra o audit log por
    // entityId === item.id; sem esta linha, abrir #0062 não mostraria
    // absolutamente nada sobre o aumento, e é justamente em #0062 que quem
    // presta contas vai procurar.
    await tx.insert(auditLogs).values({
      ...autor, action: "complement_created", entityType: "item", entityId: parent.id,
      details: `Complemento ${child.displayId} criado: +${pedido.quantity} un. `
             + `(contratado ${parent.quantity} → ${parent.quantity + pedido.quantity}). `
             + `Motivo: ${pedido.reason}${marcaSaida}`,
    });

    const [notification] = await tx.insert(notifications).values({
      type: "complementCreated",
      message: `+${pedido.quantity} un. em ${parent.displayId} (${parent.type}) — ${event.name}. Motivo: ${pedido.reason}`,
      eventId: parent.eventId,
      itemId: child.id,
      targetRoles: ["grafica"],
    }).returning();

    return { child, notification };
  });

  let child: Item;
  let notification: any;
  try {
    ({ child, notification } = await criar());
  } catch (e) {
    if (!isDisplayIdConflictError(e)) throw e;
    ({ child, notification } = await criar());
  }

  // ── Pós-commit ────────────────────────────────────────────────────────
  // Patrocinadores e aprovações são copiados FORA da transação de
  // propósito: são dados de apresentação e uma falha aqui não pode
  // desfazer o complemento (que é o trabalho de verdade). Se falhar, a
  // peça existe e os chips podem ser recolocados pela tela de vinculação.
  try {
    const sponsorIds = (await storage.getItemSponsors(parent.id)).map(s => s.sponsorId);
    if (sponsorIds.length) await storage.bulkSyncItemSponsors(child.id, sponsorIds);
    // Copia PRESERVANDO status/aprovador/data. Nunca
    // initializeItemSponsorApprovals: ela criaria linhas 'pending' que
    // viram cobrança falsa na Gestão de Prazos, numa peça que já está
    // aprovada e liberada.
    await storage.copyItemSponsorApprovals(parent.id, child.id);
  } catch (e) {
    console.error("[COMPLEMENTOS] falha ao copiar patrocinadores/aprovações:", mensagemDoErro(e));
  }

  return { child, notification };
}

/** Desfaz o complemento sem material: soft delete, trilha nas duas peças e o aviso à Gráfica. */
export async function desfazerComplemento(
  item: Item,
  parent: Item | undefined,
  event: Event | undefined,
  ator: AuditActor,
): Promise<{ notification: Notification }> {
  const autor = resolveActor(ator);
  return await db.transaction(async (tx) => {
    // Soft delete, igual a toda exclusão do sistema: o complemento some das
    // listagens e continua no histórico. O número -C1 NÃO é reciclado — o
    // próximo aumento vira -C2, e quem ler o log entende a sequência.
    const [removido] = await tx
      .update(itemsTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(itemsTable.id, item.id))
      .returning();
    if (!removido) throw Object.assign(new Error("Complemento não encontrado"), { httpStatus: 404 });

    await tx.insert(auditLogs).values({
      ...autor, action: "complement_canceled", entityType: "item", entityId: item.id,
      details: `Complemento ${item.displayId} cancelado (nenhuma unidade produzida). `
             + `Contratado volta a ${parent?.quantity ?? "—"} un.`,
    });
    // Também na mãe: é lá que se pergunta "afinal, aumentou ou não?".
    if (parent) {
      await tx.insert(auditLogs).values({
        ...autor, action: "complement_canceled", entityType: "item", entityId: parent.id,
        details: `Complemento ${item.displayId} cancelado (+${item.quantity} un. desfeitas, nada produzido). `
               + `Contratado volta a ${parent.quantity} un.`,
      });
    }

    const [notif] = await tx.insert(notifications).values({
      type: "complementCanceled",
      message: `Complemento ${item.displayId} cancelado — não produzir.${event ? ` (${event.name})` : ""}`,
      eventId: item.eventId,
      itemId: parent?.id ?? null,
      targetRoles: ["grafica"],
    }).returning();

    return { notification: notif };
  });
}
