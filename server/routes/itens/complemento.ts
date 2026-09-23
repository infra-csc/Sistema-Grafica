// Complemento: aumento de quantidade depois que a peça entrou em produção.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAuth, broadcast, updateEventStatus } from "../shared";
import { corpoEventoFechado, fraseDoZod } from "../../erros";
import { motivoEventoFechado } from "../eventoFinalizado";
import { COMPLEMENT_ALLOWED_STATUSES } from "./comum";
import { criarComplemento, desfazerComplemento } from "../../services/complemento-da-peca";

/**
 * Quem pode MUDAR A QUANTIDADE de uma peça que já entrou em produção —
 * criar complemento, cancelar complemento e reduzir até o piso físico.
 *
 * Regra do dono: só solicitacao e admin. Deliberadamente mais estrito que
 * `canCreateItemsFor`: criar peça no evento que você mesmo criou é uma coisa;
 * alterar o contrato de uma peça que já virou lona impressa no galpão é outra.
 * A Gráfica também não entra — ela produz o que pedem.
 */
function podeMudarQuantidade(req: { userRole?: string }): boolean {
  return req.userRole === "admin" || req.userRole === "solicitacao";
}

/** POST e DELETE /api/items/:id/complement. */
export function registrarComplemento(app: Express): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // COMPLEMENTO — aumento de quantidade depois que a peça entrou em produção
  // ═══════════════════════════════════════════════════════════════════════════

  // Cria a peça-filha #0062-C1 com a DIFERENÇA pedida. A peça original não
  // recebe um único UPDATE — nenhum. É o ponto inteiro do modelo: um pórtico
  // entregue continua entregue, o KPI "Entregues" não cai retroativamente e o
  // fechamento com o patrocinador não é reescrito. O trabalho novo é uma linha
  // nova, porque no mundo físico foi exatamente isso: nova ordem de serviço,
  // nova impressão, novo setup.
  //
  // Gate INLINE (não requireRole) porque o predicado inclui "criador do evento
  // de qualquer papel" — mesmo estilo das outras rotas de escrita de peça. A
  // Gráfica NÃO cria complemento: ela produz o que pedem.
  app.post("/api/items/:id/complement", requireAuth, async (req, res) => {
    try {
      const body = z.object({
        quantity: z.number().int().min(1, "Informe ao menos 1 unidade").max(9999),
        reason: z.string().trim()
          .min(10, "Explique o motivo (mín. 10 caracteres)")
          .max(500, "Motivo muito longo (máx. 500 caracteres)"),
      }).parse(req.body);

      const parent = await storage.getItem(req.params.id);
      if (!parent || parent.deletedAt) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }
      // Gate ESTRITO, decisão do dono: mudar quantidade de peça já produzida é
      // exclusivo de solicitacao e admin. NÃO usa canCreateItemsFor porque
      // aquele predicado inclui "criador do evento de qualquer papel" — regra
      // legítima para CRIAR peça, larga demais para mexer em contrato de peça
      // que já virou material físico.
      if (!podeMudarQuantidade(req)) {
        return res.status(403).json({ error: "Sem permissão para aumentar a quantidade neste evento" });
      }
      // Complemento de complemento vira #0062-C1-C1 e torna contractedTotal
      // recursivo. O segundo aumento se pede NA MÃE — vira #0062-C2.
      if (parent.parentItemId) {
        return res.status(409).json({
          error: `${parent.displayId} já é um complemento. Peça o aumento na peça original.`,
          code: "IS_COMPLEMENT",
          parentItemId: parent.parentItemId,
        });
      }
      if (!COMPLEMENT_ALLOWED_STATUSES.includes(parent.status)) {
        return res.status(409).json({
          error: `A peça ${parent.displayId} ainda não entrou em produção — edite a quantidade normalmente.`,
          code: "NOT_IN_PRODUCTION",
          status: parent.status,
        });
      }

      const event = await storage.getEvent(parent.eventId);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });
      // Complemento é peça NOVA na fila da Gráfica. Num evento encerrado ela
      // nasceria invisível — a fila não a mostraria e ninguém a produziria.
      const fechadoComplemento = motivoEventoFechado(event);
      if (fechadoComplemento) {
        return res.status(409).json(corpoEventoFechado(fechadoComplemento));
      }

      // Dedupe de 60 s (duplo clique / retry de rede): devolve 200 com o
      // complemento que já existe, não erro. Duas linhas idênticas na fila da
      // Gráfica valem mais confusão do que um retry silencioso.
      const dup = await storage.findRecentComplement(parent.id, body.quantity, body.reason, 60);
      if (dup) {
        return res.status(200).set("X-Complement-Deduped", "1").json(dup);
      }

      // O que criar grava (peça-filha, trilha, aviso, patrocinadores):
      // services/complemento-da-peca.ts.
      const { child, notification } = await criarComplemento(parent, event, body, req);

      // SÓ updateEventStatus. O POST /api/items normal, quando o evento está
      // "completed", RESETA a prioridade do evento e notifica o admin — aqui
      // isso apagaria a prioridade de um evento em andamento por causa de 4
      // unidades. O evento voltar de "concluído" para "criado" é correto (há
      // trabalho pendente); perder a prioridade não é.
      await updateEventStatus(parent.eventId);

      // Broadcast semântico (para quem quiser tratar o caso especificamente)…
      broadcast({
        type: "item_complement_created", item: child, parentId: parent.id,
        parentDisplayId: parent.displayId, eventId: parent.eventId, quantity: body.quantity,
      });
      // …e um tipo JÁ TRATADO no client. Sem este segundo broadcast a Gráfica
      // fica CEGA até um F5: '/api/items/approved' (a fila dela) roda com
      // staleTime: Infinity e refetchOnWindowFocus: false, e nenhum tipo
      // genérico a invalida — só 'item_approved' e 'production_*'.
      // "item_approved" é semanticamente honesto aqui: o complemento nasce
      // liberado para produção. Pode ser removido no dia em que
      // use-websocket.ts ganhar o case de 'item_complement_created'.
      broadcast({ type: "item_approved", item: child });
      broadcast({ type: "notification_created", notification });

      res.status(201).json(child);
    } catch (error: any) {
      if (error?.code === "42703") {
        return res.status(503).json({
          error: "Migração pendente: peça ao administrador rodar npm run db:push.",
          code: "MIGRATION_PENDING",
        });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: fraseDoZod(error) });
      }
      console.error("[COMPLEMENTOS] falha ao criar complemento:", error);
      // Erro lançado por nós (com httpStatus) já traz a frase; o resto não vaza
      // o texto do banco para a tela.
      if (error?.httpStatus) return res.status(error.httpStatus).json({ error: error.message });
      res.status(500).json({ error: "Não foi possível criar o complemento agora. Tente de novo em instantes." });
    }
  });

  // Cancela um complemento criado por engano — a janela de arrependimento.
  // Sem esta rota, um complemento errado vira lixo PERMANENTE na fila da
  // Gráfica: o DELETE genérico bloqueia 'ready_for_production' para o perfil
  // Solicitação (LOCKED_STATUSES), e só o admin conseguiria remover.
  //
  // A Gráfica pode cancelar de propósito: quem percebe o engano é quem está
  // com a peça na mão, e obrigá-la a caçar o solicitante para desfazer algo
  // que ainda não foi impresso é como se perde a confiança na ferramenta.
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA). Cancelar complemento
  // é DESFAZER um aumento, nunca avançar: a rota já exige que nenhuma unidade
  // tenha sido produzida, reaproveitada, conferida ou entregue. Barrar aqui
  // transformaria um complemento criado por engano em item PERMANENTE da fila
  // da Gráfica — um convite a imprimir, que é justamente o que esta guarda
  // existe para evitar.
  app.delete("/api/items/:id/complement", requireAuth, async (req, res) => {
    try {
      const item = await storage.getItem(req.params.id);
      if (!item || item.deletedAt) {
        return res.status(404).json({ error: "Complemento não encontrado" });
      }
      if (!item.parentItemId) {
        return res.status(409).json({
          error: `${item.displayId} não é um complemento. Use a exclusão normal de peças.`,
          code: "NOT_A_COMPLEMENT",
        });
      }

      // Mesmo gate estrito da criação (decisão do dono): cancelar um
      // complemento é desfazer um aumento de quantidade. A spec original dava
      // este escape à Gráfica — quem vê o "40 pórticos" absurdo primeiro — mas
      // a regra passou a ser "só solicitacao e admin mexem na quantidade".
      // Reverter é trocar esta linha por `|| req.userRole === "grafica"`.
      if (!podeMudarQuantidade(req)) {
        return res.status(403).json({ error: "Sem permissão para cancelar este complemento" });
      }

      // Nada tocado = nada perdido. Uma única unidade produzida, reaproveitada,
      // conferida ou entregue já é material físico no galpão; cancelar deixaria
      // ativos de inventário órfãos apontando para uma peça invisível.
      const produzidas = item.quantityProduced ?? 0;
      const reaproveitadas = item.reuseQty ?? 0;
      const conferidas = item.conferredQty ?? 0;
      const entregues = item.deliveredQty ?? 0;
      if (produzidas > 0 || reaproveitadas > 0 || conferidas > 0 || entregues > 0) {
        const detalhe = [
          produzidas > 0 ? `${produzidas} produzida(s)` : null,
          reaproveitadas > 0 ? `${reaproveitadas} reaproveitada(s)` : null,
          conferidas > 0 ? `${conferidas} conferida(s)` : null,
          entregues > 0 ? `${entregues} entregue(s)` : null,
        ].filter(Boolean).join(", ");
        return res.status(409).json({
          error: `Não é possível cancelar ${item.displayId}: já há ${detalhe}.`,
          code: "COMPLEMENT_TOUCHED",
          produced: produzidas, reused: reaproveitadas, conferred: conferidas, delivered: entregues,
        });
      }

      const parent = await storage.getItem(item.parentItemId);
      const event = await storage.getEvent(item.eventId);
      const parentLabel = parent?.displayId ?? "peça original";

      // Soft delete + trilha + aviso, numa transação: services/complemento-da-peca.ts.
      const { notification } = await desfazerComplemento(item, parent, event, req);

      await updateEventStatus(item.eventId);

      broadcast({
        type: "item_complement_canceled", itemId: item.id, displayId: item.displayId,
        parentId: item.parentItemId, eventId: item.eventId,
      });
      // Tipos já tratados no client (ver comentário gêmeo na rota de criação):
      // 'item_deleted' tira a linha das listagens gerais e da lixeira;
      // 'production_updated' é o único que invalida '/api/items/approved',
      // a fila da Gráfica — sem ele o complemento cancelado ficaria na tela
      // dela, convidando a imprimir algo que foi desfeito.
      broadcast({ type: "item_deleted", itemId: item.id, eventId: item.eventId });
      broadcast({ type: "production_updated", item: { ...item, deletedAt: new Date() } });
      broadcast({ type: "notification_created", notification });

      res.json({ success: true, itemId: item.id, displayId: item.displayId, parentDisplayId: parentLabel });
    } catch (error: any) {
      if (error?.code === "42703") {
        return res.status(503).json({
          error: "Migração pendente: peça ao administrador rodar npm run db:push.",
          code: "MIGRATION_PENDING",
        });
      }
      console.error("[COMPLEMENTOS] falha ao cancelar complemento:", error);
      // Erro lançado por nós (com httpStatus) já traz a frase; o resto não vaza
      // o texto do banco para a tela.
      if (error?.httpStatus) return res.status(error.httpStatus).json({ error: error.message });
      res.status(500).json({ error: "Não foi possível cancelar o complemento agora. Tente de novo em instantes." });
    }
  });
}
