// ─────────────────────────────────────────────────────────────────────────────
// PRIORIDADE NA IMPRESSÃO — a Solicitação pede (ou retira) que a peça saia na
// frente na Gráfica (dono, 08/10: "faz um botão que a Solicitação consegue
// pedir prioridade na impressão quando estiver na revisão ou na gráfica").
//
//   POST /api/items/:id/prioridade-na-impressao   { prioritaria: boolean }
//
// Grava a MESMA marca `isPriority` do formulário da peça (sem coluna nova): na
// Gráfica a peça vem primeiro de toda a fila (grupo "Prioritárias"), em Máquinas
// também, e ganha o selo
// "Prioritária". A regra (quem, de que etapa, que peça) mora em
// shared/prioridade-na-impressao.ts — a mesma que o botão lê para aparecer.
//
// PEDIR: só da Revisão Final até a impressão terminar, com o evento aberto.
// Trilha + aviso à Gráfica (e ao admin) na mesma transação.
// RETIRAR: recuar — vale em qualquer etapa e com o evento fechado; trilha sem
// aviso (a Gráfica vê o selo sumir; um alarme para "não precisa mais correr"
// seria ruído no grupo "Precisa de ação" do sino).
//
// O UPDATE confere de novo a etapa, a lixeira e a marca (outra pessoa pode ter
// mexido entre a leitura e o clique): sem linha, a rota relê a peça e responde
// a verdade — já estava como pedido (200, sem trilha) ou mudou (409).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { items as itemsTable, auditLogs, notifications } from "@shared/schema";
import {
  ETAPAS_DA_PRIORIDADE_NA_IMPRESSAO, motivoParaNaoPedirPrioridade, motivoParaNaoRetirarPrioridade,
  lerPedidoDePrioridade, fraseDaTrilhaDaPrioridade, mensagemDoAvisoDePrioridade,
} from "@shared/prioridade-na-impressao";
import { requireAuth, broadcast, translateStatus, sendSensitiveError, resolveActor } from "../shared";
import { barraEventoFinalizado } from "../eventoFinalizado";
import { camposDoErro } from "../../erros";

export function registrarPrioridadeNaImpressao(app: Express): void {
  app.post("/api/items/:id/prioridade-na-impressao", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Só a Solicitação e o admin pedem prioridade na impressão." });
      }
      const lido = lerPedidoDePrioridade(req.body);
      if (!lido.ok) return res.status(400).json({ error: lido.erro });
      const { prioritaria } = lido;

      const peca = await storage.getItem(req.params.id);
      if (!peca) return res.status(404).json({ error: "Peça não encontrada." });
      const quem = { papel: req.userRole, kit: req.userKit === true, userId: req.userId ?? null };
      const motivo = prioritaria ? motivoParaNaoPedirPrioridade(peca, quem) : motivoParaNaoRetirarPrioridade(peca, quem);
      if (motivo) return res.status(motivo.http).json({ error: motivo.frase, code: motivo.codigo });
      // ANDA: pedir faz a peça passar na frente na impressora — evento
      // encerrado ou já realizado não recebe. Retirar é recuar e passa.
      if (prioritaria && await barraEventoFinalizado(peca, res)) return;

      // Já está como pedido: responde a peça como está, sem trilha nem aviso
      // (clique duplo, lista desatualizada).
      if (!!peca.isPriority === prioritaria) return res.json(peca);

      const nome = resolveActor(req).userName;
      const etapa = translateStatus(peca.status);
      const evento = prioritaria ? await storage.getEvent(peca.eventId) : undefined;
      const agora = new Date();
      const { linha, notificacao } = await db.transaction(async (tx) => {
        const condicoes = [
          eq(itemsTable.id, peca.id),
          isNull(itemsTable.deletedAt),
          eq(itemsTable.isPriority, !prioritaria),
          ...(prioritaria ? [inArray(itemsTable.status, ETAPAS_DA_PRIORIDADE_NA_IMPRESSAO as string[])] : []),
        ];
        const [linha] = await tx
          .update(itemsTable)
          .set({ isPriority: prioritaria, updatedAt: agora })
          .where(and(...condicoes))
          .returning();
        if (!linha) return { linha: null, notificacao: null };
        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "updated",
          entityType: "item",
          entityId: linha.id,
          details: fraseDaTrilhaDaPrioridade(prioritaria, nome, etapa),
        });
        if (!prioritaria) return { linha, notificacao: null };
        // "itemPriority": o tipo que o sino já desenha como "Prioridade", no
        // grupo "Precisa de ação"; para a Gráfica ele abre a fila na peça.
        const [n] = await tx.insert(notifications).values({
          type: "itemPriority",
          message: mensagemDoAvisoDePrioridade(linha, evento?.name ?? "evento", nome),
          eventId: linha.eventId,
          itemId: linha.id,
          targetRoles: ["grafica", "admin"],
        }).returning();
        return { linha, notificacao: n ?? null };
      });

      if (!linha) {
        // Outra pessoa mexeu entre a leitura e o clique: diga o que achou.
        const agoraNoBanco = await storage.getItem(peca.id);
        if (!agoraNoBanco || agoraNoBanco.deletedAt) return res.status(404).json({ error: "A peça foi excluída enquanto você pedia." });
        if (!!agoraNoBanco.isPriority === prioritaria) return res.json(agoraNoBanco);
        return res.status(409).json({ error: "A peça mudou de etapa enquanto você pedia (outra pessoa mexeu nela) — atualize a tela." });
      }
      // "item_updated" já alcança a fila da Gráfica e Máquinas (lib/tempo-real-grafica).
      broadcast({ type: "item_updated", item: linha });
      if (notificacao) broadcast({ type: "notification_created", notification: notificacao as never });
      res.json(linha);
    } catch (error) {
      const erro = camposDoErro(error);
      if (erro.httpStatus) return res.status(erro.httpStatus).json({ error: erro.message });
      sendSensitiveError(res, error, "Prioridade na impressão", 500);
    }
  });
}
