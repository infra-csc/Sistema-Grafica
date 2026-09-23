// Criar peça (unitária e em lote) e clonar peças de outro evento.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { insertItemSchema, publicInsertItemSchema } from "@shared/schema";
import { remessaUtilizavelPor } from "@shared/kit";
import { carregarRemessa } from "../../services/kitRemessas";
import { requireAuth, broadcast, createAuditLog, createAuditLogsEmLote, updateEventStatus } from "../shared";
import { responderErro, fraseDoZod, erroPublico, corpoEventoFechado, EVENTO_NAO_ENCONTRADO } from "../../erros";
import { motivoEventoFechado } from "../eventoFinalizado";
import { deriveCalculatedM2, deriveMeasurement, quemVe, canCreateItemsFor } from "./comum";

/** POST /api/items, POST /api/items/bulk. */
export function registrarCriacao(app: Express): void {
  // Create item
  app.post("/api/items", requireAuth, async (req, res) => {
    try {
      // publicInsertItemSchema (e não insertItemSchema): o parentesco de
      // complemento NÃO é criável pela API pública. Sem este recorte, qualquer
      // usuário autenticado forjaria parentItemId no body e penduraria uma peça
      // como "complemento" de outra — inclusive de outro evento —, contaminando
      // contractedTotal, a ordenação e a fila da Gráfica. Parentesco só nasce
      // em POST /api/items/:id/complement, que valida papel, status e
      // ancestralidade.
      const validatedData = publicInsertItemSchema.parse(req.body);
      if (!(await canCreateItemsFor(req, validatedData.eventId))) {
        return res.status(403).json({ error: "Sem permissão para criar itens neste evento" });
      }
      // PEÇA DO KIT (dono, 14/09): pertence a uma remessa do MESMO evento; o
      // usuário do Kit só cria peça do Kit, numa remessa dele.
      const kitRemessaId = typeof req.body?.kitRemessaId === "string" && req.body.kitRemessaId ? req.body.kitRemessaId : null;
      if (req.userKit && !kitRemessaId) {
        return res.status(400).json({ error: "Usuário do Kit cria só peça do Kit — escolha a remessa do Kit." });
      }
      if (kitRemessaId) {
        const remessa = await carregarRemessa(kitRemessaId);
        if (!remessa || remessa.eventId !== validatedData.eventId) {
          return res.status(400).json({ error: "Remessa do Kit inválida para este evento." });
        }
        if (!remessaUtilizavelPor(quemVe(req), remessa)) {
          return res.status(403).json({ error: "Esta remessa do Kit é de outra pessoa." });
        }
      }
      (validatedData as any).kitRemessaId = kitRemessaId;
      (validatedData as any).criadoPorId = req.userId ?? null;
      // Nascer PRIORITÁRIA é decisão de quem gerencia a lista (dono, 27/08) —
      // mesmo gate do PATCH. Criador de evento sem papel cria a peça normal.
      if (validatedData.isPriority && !["admin", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Marcar peça como prioritária é do admin e da Solicitação." });
      }
      // Não confiar no m² do cliente — recalcular no servidor quando derivável.
      const derivedM2 = deriveCalculatedM2(validatedData);
      if (derivedM2 !== undefined) validatedData.calculatedM2 = derivedM2;
      // Medida vazia nasce derivada — uma peça sem medida legível na planilha
      // da gráfica é uma peça que volta como pergunta.
      if (!String(validatedData.measurement ?? "").trim()) {
        const medida = deriveMeasurement(validatedData.fileWidth, validatedData.fileHeight);
        if (medida !== undefined) validatedData.measurement = medida;
      }

      const event = await storage.getEvent(validatedData.eventId);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Evento fechado (à mão OU já realizado) vem ANTES do ramo de
      // "completed": ver motivoEventoFechado.
      const fechadoAvulsa = motivoEventoFechado(event);
      if (fechadoAvulsa) {
        return res.status(409).json(corpoEventoFechado(fechadoAvulsa));
      }

      // Check if event was completed - if so, reset priority and require re-definition
      if (event.status === "completed") {
        await storage.updateEvent(event.id, { 
          status: "created",
          priority: undefined // Reset priority - must be redefined
        });
        
        // Notificação sobre reset de prioridade (apenas admin)
        const notification = await storage.createNotification({
          type: "eventCreated",
          message: `Item adicionado ao evento "${event.name}" que estava concluído. Prioridade precisa ser redefinida.`,
          eventId: event.id,
          targetRoles: ["admin"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      const item = await storage.createItem(validatedData);
      
      // Create audit log
      await createAuditLog(
        req,
        'created',
        'item',
        item.id,
        `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
        + (item.isPriority ? " — PRIORITÁRIA" : "")
        + (item.kitRemessaId ? " — KIT" : "")
      );

      // Novo item adicionado - notifica Arte + Gráfica
      const notification = await storage.createNotification({
        type: item.isPriority ? "itemPriority" : "itemAdded",
        message: item.isPriority
          ? `PEÇA PRIORITÁRIA: ${item.displayId} ${item.type} - Evento: ${event.name} — fura a fila da Arte`
          : `Novo item adicionado: ${item.type} - Evento: ${event.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
      });
      
      // Update event status
      await updateEventStatus(item.eventId);
      
      broadcast({ type: "item_created", item });
      broadcast({ type: "notification_created", notification });
      
      // SOLICITAÇÃO DO ATENDIMENTO (14/09): "Criar peça" a partir de uma peça
      // solicitada liga a peça a ela NA MESMA requisição. Antes eram duas
      // chamadas do cliente, e uma falha na segunda deixava peça criada e
      // solicitação aberta.
      const pedidoDePecaLinhaId = typeof req.body?.pedidoDePecaLinhaId === "string" ? req.body.pedidoDePecaLinhaId : "";
      if (pedidoDePecaLinhaId) {
        const { vincularPecaALinha } = await import("../pedidos-de-peca");
        const vinculo = await vincularPecaALinha(req, pedidoDePecaLinhaId, item.id);
        return res.status(201).json({ ...item, vinculoDoPedido: vinculo.erro ? { ok: false, erro: vinculo.erro } : { ok: true } });
      }
      res.status(201).json(item);
    } catch (error) {
      responderErro(res, error, "criar peça");
    }
  });

  // Create multiple items at once (bulk)
  app.post("/api/items/bulk", requireAuth, async (req, res) => {
    try {
      const { items: itemsData } = req.body;

      if (!Array.isArray(itemsData) || itemsData.length === 0) {
        return res.status(400).json({ error: "Nenhuma peça enviada — preencha pelo menos uma linha." });
      }
      // UM evento por lote: a permissão e a trava de evento fechado são
      // conferidas uma vez só, no evento do lote. Com eventos misturados, a
      // 2ª linha em diante escapava das duas (bastava a 1ª ser de um evento
      // permitido e aberto).
      const eventoDoLote = itemsData[0]?.eventId;
      if (typeof eventoDoLote !== "string" || !eventoDoLote) {
        return res.status(400).json({ error: "Linha 1: informe o evento da peça." });
      }
      const outroEvento = itemsData.findIndex((i: any) => i?.eventId !== eventoDoLote);
      if (outroEvento >= 0) {
        return res.status(400).json({ error: `Linha ${outroEvento + 1}: todas as peças do lote precisam ser do mesmo evento.` });
      }
      if (!(await canCreateItemsFor(req, eventoDoLote))) {
        return res.status(403).json({ error: "Sem permissão para criar itens neste evento" });
      }
      // Entrada Rápida cria peça da Arena: o usuário do Kit usa o formulário
      // ou a importação, que pedem a remessa (14/09).
      if (req.userKit) {
        return res.status(403).json({ error: "A Entrada Rápida não cria peça do Kit — use o formulário ou a importação." });
      }
      // Mesma trava do POST unitário — sem ela o lote era o caminho aberto para
      // pendurar peça num evento encerrado.
      const eventoLote = await storage.getEvent(eventoDoLote);
      if (!eventoLote) return res.status(404).json({ error: EVENTO_NAO_ENCONTRADO });
      const fechadoLote = motivoEventoFechado(eventoLote);
      if (fechadoLote) {
        return res.status(409).json(corpoEventoFechado(fechadoLote));
      }

      // Validate all items
      const validatedItems = itemsData.map((item, index) => {
        try {
          // publicInsertItemSchema: mesma blindagem do POST unitário — o body
          // do lote não cria parentesco de complemento (ver acima). Sem a
          // remessa do Kit: a Entrada Rápida só cria peça da Arena, e a
          // remessa sem a conferência do POST unitário penduraria a peça numa
          // remessa de outro evento ou de outra pessoa.
          const parsed = publicInsertItemSchema.omit({ kitRemessaId: true }).parse(item);
          // Recalcular m² no servidor quando derivável (não confiar no cliente).
          const derivedM2 = deriveCalculatedM2(parsed);
          if (derivedM2 !== undefined) parsed.calculatedM2 = derivedM2;
          if (!String(parsed.measurement ?? "").trim()) {
            const medida = deriveMeasurement(parsed.fileWidth, parsed.fileHeight);
            if (medida !== undefined) parsed.measurement = medida;
          }
          return parsed;
        } catch (error) {
          if (error instanceof z.ZodError) throw erroPublico(400, `Linha ${index + 1}: ${fraseDoZod(error)}`);
          throw error;
        }
      });
      
      // Nascer PRIORITÁRIA é decisão de quem gerencia a lista — o MESMO gate
      // do POST unitário; sem ele o lote seria a porta dos fundos.
      if (validatedItems.some((i) => i.isPriority) && !["admin", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Marcar peça como prioritária é do admin e da Solicitação." });
      }

      // Create all items in bulk
      const createdItems = await storage.createBulkItems(validatedItems);

      // AUDITORIA 27/08: a trilha do lote sai em UM INSERT — era um por peça,
      // em série, logo depois de createBulkItems ter inserido tudo de uma vez.
      await createAuditLogsEmLote(req, createdItems.map((item) => ({
        action: 'created', entityType: 'item', entityId: item.id,
        details: `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
          + (item.isPriority ? " — PRIORITÁRIA" : ""),
      })));
      
      // Get event for notification
      const firstItem = createdItems[0];
      const event = firstItem ? await storage.getEvent(firstItem.eventId) : null;
      
      // Primeira lista de itens - notificação única para Arte + Gráfica
      if (event) {
        // Lote com prioritárias: a notificação NOMEIA quais furam a fila —
        // "3 prioritárias" sem os códigos obrigaria a Arte a caçar na lista.
        const prioritarias = createdItems.filter((i) => i.isPriority);
        const notification = await storage.createNotification({
          type: prioritarias.length > 0 ? "itemPriority" : "itemAdded",
          message: prioritarias.length > 0
            ? `${createdItems.length} itens adicionados - Evento: ${event.name} — PRIORITÁRIAS (furam a fila): ${prioritarias.map((i) => i.displayId).join(", ")}`
            : `${createdItems.length} itens adicionados - Evento: ${event.name}`,
          eventId: event.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        });
        broadcast({ type: "notification_created", notification });
      }
      
      // Broadcast update
      broadcast({ type: "items_bulk_created", items: createdItems, eventId: firstItem?.eventId });
      // Como no POST unitário: peça nova pode tirar o evento de "concluído".
      await updateEventStatus(eventoDoLote).catch((e) => console.error("[lote] updateEventStatus", e));

      res.status(201).json(createdItems);
    } catch (error) {
      responderErro(res, error, "criar peças em lote");
    }
  });
}

/** POST /api/events/:id/clone-items. */
export function registrarClonagem(app: Express): void {
  // ── Clone items from another event ───────────────────────────────────────
  app.post("/api/events/:id/clone-items", requireAuth, async (req, res) => {
    if (!(await canCreateItemsFor(req, req.params.id))) {
      return res.status(403).json({ error: "Sem permissão para clonar itens para este evento" });
    }
    // O usuário do Kit cria peça só numa remessa dele (formulário ou
    // importação); o clone traria peças da Arena, sem remessa.
    if (req.userKit) {
      return res.status(403).json({ error: "Usuário do Kit não clona peças — crie pelo formulário ou pela importação, escolhendo a remessa." });
    }
    try {
      const targetEvent = await storage.getEvent(req.params.id);
      if (!targetEvent) return res.status(404).json({ error: "Evento destino não encontrado" });
      // Clonar é criar peça — a quarta porta, e a que traz a lista inteira.
      const fechadoClone = motivoEventoFechado(targetEvent);
      if (fechadoClone) {
        return res.status(409).json(corpoEventoFechado(fechadoClone));
      }

      const { sourceEventId, itemIds } = req.body as { sourceEventId: string; itemIds?: string[] };
      if (!sourceEventId) return res.status(400).json({ error: "sourceEventId é obrigatório" });

      const sourceEvent = await storage.getEvent(sourceEventId);
      if (!sourceEvent) return res.status(404).json({ error: "Evento origem não encontrado" });

      const todasDaOrigem = await storage.getItemsByEvent(sourceEventId);
      if (todasDaOrigem.length === 0) {
        return res.status(400).json({ error: "O evento de origem não tem itens para clonar" });
      }

      // SELEÇÃO (dono, 01/09: "similar ao clonar evento mas poder selecionar
      // os itens"). `itemIds` ausente = clona tudo, como sempre foi — os
      // fluxos existentes (criar evento clonando) não mudam. Presente, cada
      // id precisa SER do evento de origem: aceitar id alheio deixaria
      // qualquer um clonar peça de evento que não pode ver.
      let sourceItems = todasDaOrigem;
      if (itemIds !== undefined) {
        if (!Array.isArray(itemIds) || itemIds.some((id) => typeof id !== "string")) {
          return res.status(400).json({ error: "itemIds deve ser uma lista de ids de peças" });
        }
        if (itemIds.length === 0) {
          return res.status(400).json({ error: "Nenhuma peça selecionada para clonar" });
        }
        const daOrigem = new Set(todasDaOrigem.map((i) => i.id));
        const estranhos = itemIds.filter((id) => !daOrigem.has(id));
        if (estranhos.length > 0) {
          return res.status(400).json({ error: `${estranhos.length} das peças selecionadas não pertencem ao evento de origem — recarregue e tente de novo` });
        }
        const escolhidas = new Set(itemIds);
        sourceItems = todasDaOrigem.filter((i) => escolhidas.has(i.id));
      }

      // O QUE NÃO SE CLONA. Complemento é um AUMENTO pós-produção da peça-mãe
      // (a diferença de quantidade, com ciclo próprio): clonado, viraria uma
      // peça avulsa com a quantidade do aumento. Quem precisa do aumento no
      // evento novo ajusta a quantidade da mãe clonada.
      // Cancelada fica fora quando ninguém a escolheu (clonar tudo): o evento
      // novo não deve renascer com o que o anterior desistiu. Escolhida à mão
      // no diálogo, vai — a pessoa viu que era cancelada.
      const antesDoFiltro = sourceItems.length;
      sourceItems = sourceItems.filter((i) => !i.parentItemId && (itemIds !== undefined || i.status !== "canceled"));
      const deixadasDeFora = antesDoFiltro - sourceItems.length;
      if (sourceItems.length === 0) {
        return res.status(400).json({ error: "Nada para clonar: as peças escolhidas são complementos ou canceladas. Complemento vai junto com a peça-mãe." });
      }

      const cloned = sourceItems.map(item => ({
        eventId: targetEvent.id,
        type: item.type,
        description: item.description || "",
        quantity: item.quantity,
        area: item.area,
        visual: item.visual,
        visualWidth: item.visualWidth,
        visualHeight: item.visualHeight,
        fileWidth: item.fileWidth,
        fileHeight: item.fileHeight,
        material: item.material,
        finish: item.finish,
        measurement: item.measurement,
        observations: item.observations || "",
        calculatedM2: item.calculatedM2,
        status: "draft" as const,
        // Reaproveitamento é do estoque DAQUELE evento (a lona que sobrou
        // dele): no evento novo a peça nasce para produzir, e quem reaproveita
        // marca de novo, com a quantidade de agora.
        isReuse: false,
        reuseQty: 0,
      }));

      const validated = cloned.map((item, i) => {
        try {
          return insertItemSchema.parse(item);
        } catch (e) {
          if (e instanceof z.ZodError) throw erroPublico(400, `Peça ${sourceItems[i]?.displayId ?? i + 1} (${item.type}): ${fraseDoZod(e)}`);
          throw e;
        }
      });

      const created = await storage.createBulkItems(validated);

      await createAuditLog(
        req,
        'created',
        'item',
        targetEvent.id,
        `${created.length} itens clonados do evento "${sourceEvent.name}"${itemIds !== undefined && created.length < todasDaOrigem.length ? ` (seleção: ${created.length} de ${todasDaOrigem.length})` : ""}`
      );

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `${created.length} itens clonados de "${sourceEvent.name}" → "${targetEvent.name}"`,
        eventId: targetEvent.id,
        targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "items_bulk_created", items: created, eventId: targetEvent.id });
      await updateEventStatus(targetEvent.id);

      res.status(201).json({ cloned: created.length, items: created, deixadasDeFora });
    } catch (error) {
      responderErro(res, error, "clonar peças");
    }
  });
}
