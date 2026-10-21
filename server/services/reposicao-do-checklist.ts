// ─────────────────────────────────────────────────────────────────────────────
// REPOSIÇÃO PEDIDA PELO CHECKLIST DE ARENA
//
// Na montagem do evento, o Checklist confere peça a peça o que a Gráfica
// entregou. Peça que chegou faltando, avariada ou não foi encontrada vira, por
// um botão lá, um pedido de reposição aqui: um COMPLEMENTO da peça entregue
// (mesmos dados, mesma arte e arquivo final; código #0062-C1, -C2…) que nasce
// na REVISÃO FINAL — a Solicitação confere e libera para produção, como
// qualquer peça. A peça entregue não muda (o modelo do complemento).
//
// Evento já REALIZADO (a data passou): a falta costuma ser descoberta no
// próprio evento, então o pedido reabre o evento — o mesmo gesto do admin em
// POST /api/events/:id/reopen, com a trilha dizendo que foi o Checklist. Sem
// isso a peça nasceria fora das filas e travada na liberação.
// Evento ENCERRADO À MÃO ou ARQUIVADO: foi decisão de uma pessoa — recusa com
// a explicação, não desfaz em silêncio.
// ─────────────────────────────────────────────────────────────────────────────
import { storage } from "../storage";
import { broadcast, createAuditLog, updateEventStatus } from "../routes/shared";
import { motivoEventoFechado } from "../routes/eventoFinalizado";
import { corpoEventoFechado } from "../erros";
import { vemDeOrigemValida } from "@shared/maquina-de-estados";
import { criarComplemento } from "./complemento-da-peca";

/** Etapa em que a reposição nasce: a Revisão Final (a Solicitação libera). */
export const ETAPA_DA_REPOSICAO = "awaiting_final_review";

export interface PedidoDeReposicao {
  /** Id da peça ENTREGUE (o mesmo que a integração lista em /entregues). */
  itemId: string;
  quantidade: number;
  motivo: string;
  /** Quem pediu no Checklist (vai na trilha e no aviso). */
  solicitante: string;
}

export type RespostaDaReposicao =
  | { status: 200 | 201; corpo: { id: string; codigo: string; status: string; quantidade: number; pecaOriginal: string; eventoReaberto: boolean } }
  | { status: 404 | 409; corpo: Record<string, unknown> };

export async function pedirReposicaoDoChecklist(p: PedidoDeReposicao): Promise<RespostaDaReposicao> {
  const item = await storage.getItem(p.itemId);
  if (!item || item.deletedAt) return { status: 404, corpo: { error: "Peça não encontrada na Gráfica." } };
  // Reposição de um complemento se pede na peça ORIGINAL (complemento de
  // complemento não existe: #0062-C1-C1 tornaria a soma recursiva).
  const parent = item.parentItemId ? await storage.getItem(item.parentItemId) : item;
  if (!parent || parent.deletedAt) return { status: 404, corpo: { error: "Peça original não encontrada na Gráfica." } };
  if (!vemDeOrigemValida(parent.status, "criar-complemento")) {
    return {
      status: 409,
      corpo: { error: `A peça ${parent.displayId} ainda não foi produzida — não há o que repor.`, code: "NOT_IN_PRODUCTION", status: parent.status },
    };
  }

  let event = await storage.getEvent(parent.eventId);
  if (!event) return { status: 404, corpo: { error: "Evento não encontrado na Gráfica." } };
  const fechado = motivoEventoFechado(event);
  let eventoReaberto = false;
  if (fechado === "arquivado" || fechado === "encerrado") return { status: 409, corpo: corpoEventoFechado(fechado) };
  if (fechado === "realizado") {
    const reaberto = await storage.updateEvent(event.id, { status: "created", reopenedAt: new Date() } as any);
    if (!reaberto) return { status: 404, corpo: { error: "Evento não encontrado na Gráfica." } };
    event = reaberto;
    eventoReaberto = true;
    await createAuditLog(
      `Checklist de Arena · ${p.solicitante}`,
      "updated",
      "event",
      event.id,
      `Evento "${event.name}" REABERTO pelo Checklist de Arena (a data já tinha passado) para a reposição de ${parent.displayId}.`,
    );
    broadcast({ type: "event_reopened", eventId: event.id, event });
  }

  const reason = `Reposição pedida pelo Checklist de Arena (${p.solicitante}): ${p.motivo}`;
  // Duplo clique / retentativa de rede: devolve a que já existe.
  const dup = await storage.findRecentComplement(parent.id, p.quantidade, reason, 60);
  if (dup) return { status: 200, corpo: resposta(dup, parent.displayId, eventoReaberto) };

  const { child, notification } = await criarComplemento(
    parent,
    event,
    { quantity: p.quantidade, reason },
    `Checklist de Arena · ${p.solicitante}`,
    {
      status: ETAPA_DA_REPOSICAO,
      notificacao: {
        type: "reposicaoChecklist",
        targetRoles: ["solicitacao", "admin"],
        message: `Reposição pedida no evento: +${p.quantidade} un. de ${parent.displayId} (${parent.type}) — ${event.name}. Está na Revisão Final. Motivo: ${p.motivo} (${p.solicitante})`,
      },
    },
  );
  await updateEventStatus(parent.eventId);
  broadcast({
    type: "item_complement_created", item: child, parentId: parent.id,
    parentDisplayId: parent.displayId, eventId: parent.eventId, quantity: p.quantidade,
  });
  broadcast({ type: "notification_created", notification });
  return { status: 201, corpo: resposta(child, parent.displayId, eventoReaberto) };
}

function resposta(peca: { id: string; displayId: string; status: string; quantity: number }, original: string, eventoReaberto: boolean) {
  return { id: peca.id, codigo: peca.displayId, status: peca.status, quantidade: peca.quantity, pecaOriginal: original, eventoReaberto };
}
