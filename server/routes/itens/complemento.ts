// Complemento: aumento de quantidade depois que a peça entrou em produção.
import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { storage, isDisplayIdConflictError } from "../../storage";
import { type Item, items as itemsTable, auditLogs, notifications } from "@shared/schema";
import { requireAuth, broadcast, translateStatus, resolveActor, updateEventStatus } from "../shared";
import { corpoEventoFechado, fraseDoZod } from "../../erros";
import { motivoEventoFechado } from "../eventoFinalizado";
import { COMPLEMENT_ALLOWED_STATUSES, deriveCalculatedM2 } from "./comum";

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

      // m² do filho SEMPRE derivado no servidor, nesta ordem:
      // 1) fórmula normal (quantidade × largura × altura do arquivo);
      // 2) rateio do m² da mãe (acervo antigo não tem dimensões de arquivo);
      // 3) "0.00" — a coluna é NOT NULL — com a ressalva no audit log.
      // Ganho não óbvio: o m² do EVENTO fica correto sozinho, porque as duas
      // linhas somam. Nenhuma agregação precisa saber o que é complemento.
      const derivado = deriveCalculatedM2({
        quantity: body.quantity, fileWidth: parent.fileWidth, fileHeight: parent.fileHeight,
      });
      const rateado = Number(parent.calculatedM2) > 0 && parent.quantity > 0
        ? ((Number(parent.calculatedM2) / parent.quantity) * body.quantity).toFixed(2)
        : null;
      const m2 = derivado ?? rateado ?? "0.00";
      const m2NaoDerivavel = derivado === undefined && rateado === null;

      const autor = resolveActor(req);
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
          quantity: body.quantity,
          calculatedM2: m2,
          status: "ready_for_production",
          complementReason: body.reason,
          complementRequestedBy: userName,
          complementRequestedAt: new Date(),
        });

        // LOG NA FILHA — a história do lote novo.
        await tx.insert(auditLogs).values({
          ...autor, action: "complement_created", entityType: "item", entityId: child.id,
          details: `Complemento de ${parent.displayId}: +${body.quantity} un. (${m2} m²)${marcaM2}. `
                 + `Peça original permanece ${translateStatus(parent.status)} com ${parent.quantity} un. `
                 + `Motivo: ${body.reason}${marcaSaida}`,
        });
        // LOG NA MÃE — OBRIGATÓRIO. A ficha da peça filtra o audit log por
        // entityId === item.id; sem esta linha, abrir #0062 não mostraria
        // absolutamente nada sobre o aumento, e é justamente em #0062 que quem
        // presta contas vai procurar.
        await tx.insert(auditLogs).values({
          ...autor, action: "complement_created", entityType: "item", entityId: parent.id,
          details: `Complemento ${child.displayId} criado: +${body.quantity} un. `
                 + `(contratado ${parent.quantity} → ${parent.quantity + body.quantity}). `
                 + `Motivo: ${body.reason}${marcaSaida}`,
        });

        const [notification] = await tx.insert(notifications).values({
          type: "complementCreated",
          message: `+${body.quantity} un. em ${parent.displayId} (${parent.type}) — ${event.name}. Motivo: ${body.reason}`,
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
      } catch (e: any) {
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
      } catch (e: any) {
        console.error("[COMPLEMENTOS] falha ao copiar patrocinadores/aprovações:", e?.message ?? e);
      }

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
      const autor = resolveActor(req);
      const userName = autor.userName;
      const parentLabel = parent?.displayId ?? "peça original";

      const { notification } = await db.transaction(async (tx) => {
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
