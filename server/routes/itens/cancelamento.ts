// Cancelar, descancelar e cancelar em lote.
import type { Express, Request } from "express";
import { storage } from "../../storage";
import type { Item } from "@shared/schema";
import { liberarReservasDasPecas } from "../estoque-reservas";
import { devolverTudoAFila, colunasDaReserva } from "@shared/reserva-de-impressora";
import {
  requireAuth,
  broadcast,
  translateStatus,
  createAuditLog,
  createAuditLogsEmLote,
  updateEventStatus,
} from "../shared";
import { responderErro, PECA_NAO_ENCONTRADA } from "../../erros";
import { motivoEventoFechado, barraEventoFinalizado, contadorDeBloqueio } from "../eventoFinalizado";
import { registrarSaidaDaImpressora } from "./comum";
import { vemDeOrigemValida } from "@shared/maquina-de-estados";

// ─── CANCELAR A PEÇA ────────────────────────────────────────────────────────
//
// Decisão do dono (padrão): cancelar a mãe cancela junto os complementos que
// ainda não viraram material; os que já tiveram unidade impressa, conferida,
// embalada ou entregue ficam como estão — cancelar não desfaz lona impressa —
// e a resposta avisa quais ficaram.
export const CANCELAR_MAE_CANCELA_COMPLEMENTOS_NAO_PRODUZIDOS = true;

/** Complemento que ainda não virou material (nada impresso/conferido/embalado/entregue). */
export function complementoSemMaterial(c: { quantityProduced?: number | null; reuseQty?: number | null; conferredQty?: number | null; embaladaQty?: number | null; deliveredQty?: number | null }): boolean {
  return !(c.quantityProduced ?? 0) && !(c.reuseQty ?? 0) && !(c.conferredQty ?? 0) && !((c as any).embaladaQty ?? 0) && !(c.deliveredQty ?? 0);
}

/**
 * Cancela UMA peça: status, de onde ela saiu (para o descancelar) e o MOTIVO
 * na coluna própria — as observações da peça ficam intactas (antes o motivo
 * era gravado por cima delas, e descancelar devolvia a peça sem a instrução
 * de produção). Não grava trilha nem avisa ninguém: quem chama decide.
 */
async function gravarCancelamento(req: Request, atual: Item, motivo: string | null): Promise<Item | undefined> {
  const item = await storage.updateItem(atual.id, {
    status: "canceled",
    // De onde a peça saiu — é o que o descancelar do admin restaura
    // (dono, 01/09). Cancelar de novo uma já cancelada não sobrescreve.
    statusBeforeCancel: atual.status === "canceled" ? atual.statusBeforeCancel : atual.status,
    motivoCancelamento: motivo,
  } as any);
  if (!item) return undefined;
  // Cancelada em impressão: sai da impressora — "pausa" no diário.
  await registrarSaidaDaImpressora(req, atual);
  // Peça que atendia uma solicitação do Atendimento: se era a última, a peça
  // solicitada volta a ficar aberta — o mesmo da exclusão.
  if ((atual as any).pedidoDePecaLinhaId) {
    const { aoExcluirPeca } = await import("../pedidos-de-peca");
    await aoExcluirPeca(req, atual as any, "cancelada");
  }
  return item;
}

/**
 * Os complementos vivos da mãe que está sendo cancelada: cancela os sem
 * material (se a decisão estiver ligada) e devolve os que ficaram.
 * `pular` = ids que o próprio lote já cancela (não cancelar duas vezes).
 */
async function cancelarComplementosDaMae(req: Request, mae: Item, motivo: string | null, pular: Set<string> = new Set()) {
  const vivos = (await storage.getLiveComplements(mae.id)).filter((c) => c.status !== "canceled" && !pular.has(c.id));
  const cancelados: Item[] = [];
  const mantidos: Item[] = [];
  for (const c of vivos) {
    if (CANCELAR_MAE_CANCELA_COMPLEMENTOS_NAO_PRODUZIDOS && complementoSemMaterial(c)) {
      const feito = await gravarCancelamento(req, c, motivo ? `${motivo} (junto com a peça ${mae.displayId})` : `Cancelado junto com a peça ${mae.displayId}`);
      if (feito) cancelados.push(feito);
    } else {
      mantidos.push(c);
    }
  }
  return { cancelados, mantidos };
}

/** A frase do aviso sobre complementos que ficaram (já têm material). */
function avisoDosComplementosMantidos(mantidos: { displayId?: string | null }[]): string | null {
  if (mantidos.length === 0) return null;
  const codigos = mantidos.map((c) => c.displayId).join(", ");
  return mantidos.length === 1
    ? `O complemento ${codigos} já tem material produzido e continua ativo — cancele à parte, se for o caso.`
    : `Os complementos ${codigos} já têm material produzido e continuam ativos — cancele à parte, se for o caso.`;
}

/** cancelar, descancelar e cancelar em lote. */
export function registrarCancelamento(app: Express): void {
  // Cancel item (item disappears from workflow but stays in events)
  app.patch("/api/items/:id/cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { notes } = req.body;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }
      
      // CASO DUVIDOSO — barrado, e o porquê da dúvida fica aqui.
      // A favor de permitir: cancelar não faz ninguém trabalhar; parece a
      // faxina natural das peças que ficaram penduradas quando o evento acabou.
      // Contra (e foi o que decidiu): esta rota NÃO tem gate de status nenhum —
      // ela aceita cancelar uma peça ENTREGUE, e isso reescreveria o registro
      // de um evento fechado ("entregue" vira "cancelado"), justamente o número
      // que fecha a conta com o patrocinador. Na dúvida, barra: quem precisa
      // mesmo cancelar pede para reabrir o evento, e para a faxina de peça que
      // nunca existiu já existe a exclusão, que segue liberada e é reversível.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const motivo = typeof notes === "string" && notes.trim() ? notes.trim() : null;
      const item = await gravarCancelamento(req, currentItem, motivo);
      if (!item) {
        return res.status(404).json({ error: PECA_NAO_ENCONTRADA });
      }
      const { cancelados, mantidos } = await cancelarComplementosDaMae(req, currentItem, motivo);

      const detailMsg = motivo ? ` Motivo: ${motivo}` : "";
      await createAuditLog(
        req,
        'canceled',
        'item',
        item.id,
        `Item cancelado${detailMsg}`
        + (cancelados.length ? ` — complementos cancelados junto: ${cancelados.map((c) => c.displayId).join(", ")}` : "")
        + (mantidos.length ? ` — complementos mantidos (já têm material): ${mantidos.map((c) => c.displayId).join(", ")}` : ""),
      );
      if (cancelados.length) {
        await createAuditLogsEmLote(req, cancelados.map((c) => ({
          action: 'canceled', entityType: 'item', entityId: c.id,
          details: `Complemento cancelado junto com a peça ${currentItem.displayId}${detailMsg}`,
        })));
      }
      // Cancelada em impressão: sai da impressora — "pausa" no diário.
      await registrarSaidaDaImpressora(req, currentItem);
      // Reserva de peça morta não segura estoque — nem a dos complementos que caíram junto.
      await liberarReservasDasPecas(req, [item.id, ...cancelados.map((c) => c.id)], "cancelada");

      broadcast({ type: "item_updated", item });
      for (const c of cancelados) broadcast({ type: "item_updated", item: c });
      // Cancelada sai da conta do evento: ele pode ter acabado de fechar.
      await updateEventStatus(item.eventId).catch((e) => console.error("[cancelar] updateEventStatus", e));
      const aviso = avisoDosComplementosMantidos(mantidos);
      res.json({
        ...item,
        complementosCancelados: cancelados.map((c) => c.displayId),
        complementosMantidos: mantidos.map((c) => c.displayId),
        ...(aviso ? { aviso } : {}),
      });
    } catch (error) {
      responderErro(res, error, "cancelar peça");
    }
  });

  // ── Descancelar (dono, 01/09: "botão para adm descancelar item e ele
  // voltar no fluxo onde estava") ────────────────────────────────────────────
  // SÓ ADMIN: descancelar recoloca trabalho na fila de alguém — é decisão de
  // gestão, não de operação. Para onde volta, em ordem de confiança:
  //   1. statusBeforeCancel — gravado pelo cancelamento desde 01/09;
  //   2. a trilha de auditoria — a última linha "Status alterado: X → Y"
  //      anterior ao cancelamento diz onde a peça estava (cobre as canceladas
  //      antes da coluna existir);
  //   3. "requested" — sem pista nenhuma, volta ao início do fluxo, e a
  //      trilha DIZ que foi esse o palpite.
  app.patch("/api/items/:id/uncancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem descancelar itens" });
      }
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Peça não encontrada" });
      // De onde a ação pode partir: shared/maquina-de-estados.ts.
      if (!vemDeOrigemValida(currentItem.status, "descancelar")) {
        return res.status(409).json({ error: "A peça não está cancelada — nada a descancelar" });
      }
      // Mesma guarda do cancelamento: mexer em peça de evento finalizado
      // reescreve número fechado.
      if (await barraEventoFinalizado(currentItem, res)) return;

      let alvo: string | null = currentItem.statusBeforeCancel ?? null;
      let origem = "registrado no cancelamento";
      if (!alvo) {
        // O mapa reverso do translateStatus (routes/shared.ts). Três rótulos
        // são ambíguos porque status legados compartilham o texto — aqui vale
        // a chave VIVA, a que o servidor escreve hoje.
        const rotuloParaStatus: Record<string, string> = {
          "Rascunho": "draft",
          "Solicitado": "requested",
          "Aguardando Vinculação": "awaiting_linking",
          "Aguardando Envio": "awaiting_submission",
          "Aguardando Aprovação": "awaiting_sponsor_approval",
          "Aguardando Finalização": "sponsor_approved",
          "Aguardando Revisão Final": "awaiting_final_review",
          "Aguardando Revisão": "awaiting_review",
          "Em Revisão": "in_review",
          "Pronto para Produção": "ready_for_production",
          "Liberado": "approved",
          // Nomes de 14/09 em diante; os antigos logo abaixo seguem valendo
          // para a trilha escrita antes da renomeação.
          "Em Impressão": "inProduction",
          "Impresso / Acabamento": "produced",
          "Em Acabamento / Conferência": "produced",
          "Em Produção": "inProduction",
          "Produzido": "produced",
          "Conferido": "conferred",
          "Embalado": "packed",
          "Entregue": "delivered",
        };
        const trilha = await storage.getAuditLogs("item", currentItem.id);
        for (const linha of trilha) {
          const m = /Status alterado: .+? → ([^(→]+?)(?: \(|$)/m.exec(linha.details ?? "");
          const chave = m ? rotuloParaStatus[m[1].trim()] : undefined;
          if (chave && chave !== "canceled") { alvo = chave; origem = "inferido pela trilha de auditoria"; break; }
        }
      }
      if (!alvo) { alvo = "requested"; origem = "sem registro do status anterior — voltou ao início do fluxo"; }

      // A peça que estava EM IMPRESSÃO não volta ocupando a impressora (outra
      // pode ter entrado nela enquanto esta esteve cancelada): volta LIBERADA,
      // com o que faltava reservado — no topo da fila — da impressora onde
      // estava, e as impressas preservadas em quantityProduced.
      const estavaImprimindo = alvo === "inProduction" || alvo === "em_producao";
      const devolvida = estavaImprimindo ? devolverTudoAFila(currentItem, new Date().toISOString()) : null;
      if (estavaImprimindo) { alvo = "ready_for_production"; origem = `${origem}; estava em impressão — voltou para o topo da fila da impressora`; }
      const item = await storage.updateItem(req.params.id, {
        status: alvo,
        statusBeforeCancel: null,
        // A peça voltou ao fluxo: o motivo do cancelamento fica só na trilha.
        motivoCancelamento: null,
        ...(devolvida ? { impressaoPorMaquina: null, printMachine: null, ...colunasDaReserva(devolvida.reserva, currentItem.reservaPorMaquina, devolvida.pausas) } : {}),
      } as any);
      if (!item) return res.status(404).json({ error: "Peça não encontrada" });

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Item descancelado — voltou para ${translateStatus(alvo)} (${origem})`
      );

      broadcast({ type: "item_updated", item });
      await updateEventStatus(item.eventId);
      res.json(item);
    } catch (error) {
      responderErro(res, error, "descancelar peça");
    }
  });

  // Bulk cancel items
  app.patch("/api/items/bulk-cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { itemIds, notes } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results: any[] = [];
      const motivo = typeof notes === "string" && notes.trim() ? notes.trim() : null;
      const selecionadas = new Set<string>(itemIds);
      const junto: Item[] = [];
      const maeDe = new Map<string, string | null>();
      const mantidosNoLote: Item[] = [];
      // Mesma decisão (e mesma dúvida) do cancelamento individual acima.
      const bloqueio = contadorDeBloqueio();

      // AUDITORIA 27/08: era um for..await com getItem + getEvent + update +
      // INSERT de trilha + broadcast POR PEÇA — 200 peças ≈ 800 round-trips
      // seriais no Neon e 200 rajadas de refetch nas abas. Agora: peças em
      // paralelo (o pool limita a concorrência), evento lido UMA vez por
      // evento, trilha em UM INSERT e UM broadcast agregado no fim.
      const eventoMemo = new Map<string, Promise<any>>();
      const eventoDe = (eventId: string) => {
        if (!eventoMemo.has(eventId)) eventoMemo.set(eventId, storage.getEvent(eventId));
        return eventoMemo.get(eventId)!;
      };
      await Promise.all(itemIds.map(async (itemId: string) => {
        try {
          const currentItem = await storage.getItem(itemId);
          if (!currentItem) return;

          const motivoEvento = motivoEventoFechado(await eventoDe(currentItem.eventId));
          if (motivoEvento) {
            bloqueio.registra(motivoEvento);
            return;
          }

          // Mesmo registro do cancelamento individual — motivo na coluna
          // própria, observações intactas; o descancelar lê daqui.
          const item = await gravarCancelamento(req, currentItem, motivo);
          if (!item) return;
          results.push(item);
          // Complementos da mãe: os que o próprio lote já cancela ficam de fora.
          const { cancelados, mantidos } = await cancelarComplementosDaMae(req, currentItem, motivo, selecionadas);
          for (const c of cancelados) { junto.push(c); maeDe.set(c.id, currentItem.displayId); }
          mantidosNoLote.push(...mantidos);
        } catch (e) {
          console.error("[bulk-cancel] falha na peça", itemId, e);
        }
      }));

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      if (results.length > 0) {
        const detailMsg = motivo ? ` Motivo: ${motivo}` : "";
        await createAuditLogsEmLote(req, [
          ...results.map((r) => ({
            action: 'canceled', entityType: 'item', entityId: r.id,
            details: `Item cancelado (em lote)${detailMsg}`,
          })),
          ...junto.map((c) => ({
            action: 'canceled', entityType: 'item', entityId: c.id,
            details: `Complemento cancelado junto com a peça ${maeDe.get(c.id) ?? "mãe"} (em lote)${detailMsg}`,
          })),
        ]);
        const todas = [...results, ...junto];
        await liberarReservasDasPecas(req, todas.map((r) => r.id), "cancelada"); // reserva de peça morta não segura estoque
        broadcast({ type: "items_bulk_updated", itemIds: todas.map((r) => r.id), eventId: results[0].eventId });
        // Canceladas saem da conta de cada evento tocado.
        const eventos = Array.from(new Set(todas.map((r) => r.eventId)));
        await Promise.all(eventos.map((id) => updateEventStatus(id).catch((e) => console.error("[bulk-cancel] updateEventStatus", id, e))));
      }

      const aviso = avisoDosComplementosMantidos(mantidosNoLote);
      res.json({
        canceled: results.length,
        items: results,
        complementosCancelados: junto.map((c) => c.displayId),
        complementosMantidos: mantidosNoLote.map((c) => c.displayId),
        ...(aviso ? { aviso } : {}),
      });
    } catch (error) {
      responderErro(res, error, "cancelar peças em lote");
    }
  });
}
