// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09) — decisões em
// shared/pedidos-de-peca.ts.
//
// Quem pede: Atendimento e admin. Quem resolve (atende ou recusa): Solicitação
// e admin. Cancelar: quem fez o pedido (ou admin), enquanto está aberto.
//
// Resolver usa UPDATE condicional (`status = 'aberto'`): duas pessoas
// atendendo o mesmo pedido no mesmo segundo — a segunda recebe 409, e o
// pedido nunca aponta para duas peças.
//
// Ao atender, o pedido LEVA para a peça o que ela ainda não tem: o
// patrocinador (só enquanto a peça não começou o fluxo — depois disso vincular
// patrocinador tem regra própria, em sponsors.ts) e as referências.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { pedidosDePeca, events, sponsors, eventSponsors, items as itemsTable } from "@shared/schema";
import { MAX_REFERENCIAS_DO_PEDIDO, ROTULO_DO_PEDIDO, STATUS_DO_PEDIDO, type StatusDoPedido } from "@shared/pedidos-de-peca";
import { requireAuth, requireRole, broadcast, createAuditLog, resolveActor } from "./shared";
import { motivoEventoDaPeca, erroEventoFechado } from "./eventoFinalizado";

const requirePedirPeca = requireRole("admin", "atendimento");
const requireResolverPedido = requireRole("admin", "solicitacao");

/** Peça que ainda não entrou no fluxo: dá para vincular patrocinador direto. */
const PECA_SEM_FLUXO = new Set(["draft", "requested"]);

const novoPedidoSchema = z.object({
  eventId: z.string().min(1, "Escolha o evento"),
  sponsorId: z.string().min(1, "Escolha o patrocinador"),
  quantidade: z.number().int().min(1, "A quantidade mínima é 1").max(100000),
  observacao: z.string().trim().min(3, "Descreva o que precisa").max(2000),
  referencias: z.array(z.string().min(1)).max(MAX_REFERENCIAS_DO_PEDIDO, `No máximo ${MAX_REFERENCIAS_DO_PEDIDO} referências`).default([]),
});

const quemAgiu = (req: any) => resolveActor({ userName: req.userName, userId: req.userId ?? null });

async function notificar(dados: { type: string; message: string; eventId: string; itemId?: string | null; targetRoles: string[] }) {
  try {
    const notification = await storage.createNotification(dados as any);
    broadcast({ type: "notification_created", notification });
  } catch (error) {
    console.error("[pedidos] falha ao notificar:", error);
  }
}

export function registerPedidosDePecaRoutes(app: Express): void {
  app.get("/api/pedidos-de-peca", requireAuth, async (req, res) => {
    try {
      const condicoes = [];
      if (typeof req.query.eventId === "string" && req.query.eventId) {
        condicoes.push(eq(pedidosDePeca.eventId, req.query.eventId));
      }
      if (typeof req.query.status === "string" && req.query.status) {
        const lista = req.query.status.split(",").filter((s): s is StatusDoPedido => (STATUS_DO_PEDIDO as readonly string[]).includes(s));
        if (lista.length > 0) condicoes.push(inArray(pedidosDePeca.status, lista));
      }
      const linhas = await db.select({
        pedido: pedidosDePeca,
        eventName: events.name,
        eventStart: events.startDate,
        sponsorName: sponsors.name,
        itemDisplayId: itemsTable.displayId,
        itemType: itemsTable.type,
      })
        .from(pedidosDePeca)
        .leftJoin(events, eq(events.id, pedidosDePeca.eventId))
        .leftJoin(sponsors, eq(sponsors.id, pedidosDePeca.sponsorId))
        .leftJoin(itemsTable, eq(itemsTable.id, pedidosDePeca.itemId))
        .where(condicoes.length ? and(...condicoes) : undefined)
        .orderBy(desc(pedidosDePeca.createdAt))
        .limit(500);
      res.json(linhas.map((l) => ({
        ...l.pedido,
        eventName: l.eventName,
        eventStart: l.eventStart,
        sponsorName: l.sponsorName,
        itemDisplayId: l.itemDisplayId,
        itemType: l.itemType,
      })));
    } catch (error) {
      console.error("[pedidos] erro ao listar:", error);
      res.status(500).json({ error: "Erro ao listar pedidos de peça" });
    }
  });

  app.post("/api/pedidos-de-peca", requirePedirPeca, async (req, res) => {
    try {
      const dados = novoPedidoSchema.parse(req.body);
      const evento = await storage.getEvent(dados.eventId);
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });
      const motivo = await motivoEventoDaPeca({ eventId: evento.id });
      if (motivo) return res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });

      const patrocinador = await storage.getSponsor(dados.sponsorId);
      if (!patrocinador) return res.status(404).json({ error: "Patrocinador não encontrado" });
      const vinculos = await db.select({ sponsorId: eventSponsors.sponsorId }).from(eventSponsors).where(eq(eventSponsors.eventId, evento.id));
      if (vinculos.length > 0 && !vinculos.some((v) => v.sponsorId === patrocinador.id)) {
        return res.status(400).json({ error: `${patrocinador.name} não é patrocinador de ${evento.name}.` });
      }

      const quem = quemAgiu(req);
      const [pedido] = await db.insert(pedidosDePeca).values({
        eventId: evento.id,
        sponsorId: patrocinador.id,
        quantidade: dados.quantidade,
        observacao: dados.observacao,
        referencias: dados.referencias,
        pedidoPor: quem.userName,
        pedidoPorId: quem.userId,
      }).returning();

      await createAuditLog(req, "created", "pedido_de_peca", pedido.id,
        `Pedido do Atendimento: ${dados.quantidade} un. para ${patrocinador.name} — ${evento.name}. ${dados.observacao}`);
      await notificar({
        type: "pedidoDePeca",
        message: `Pedido do Atendimento: ${dados.quantidade} un. para ${patrocinador.name} — Evento: ${evento.name}`,
        eventId: evento.id,
        targetRoles: ["solicitacao", "admin"],
      });
      broadcast({ type: "pedidos_de_peca", eventId: evento.id });
      res.status(201).json(pedido);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      console.error("[pedidos] erro ao criar:", error);
      res.status(500).json({ error: "Erro ao enviar o pedido" });
    }
  });

  app.patch("/api/pedidos-de-peca/:id/atender", requireResolverPedido, async (req, res) => {
    try {
      const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
      if (!itemId) return res.status(400).json({ error: "Escolha a peça que atende este pedido." });
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });
      if (pedido.status !== "aberto") {
        return res.status(409).json({ error: `Este pedido já está ${ROTULO_DO_PEDIDO[pedido.status as StatusDoPedido]?.toLowerCase() ?? pedido.status}.` });
      }
      const peca = await storage.getItem(itemId);
      if (!peca || (peca as any).deletedAt) return res.status(404).json({ error: "Peça não encontrada" });
      if (peca.eventId !== pedido.eventId) return res.status(400).json({ error: "A peça escolhida é de outro evento." });

      const quem = quemAgiu(req);
      const [atendido] = await db.update(pedidosDePeca)
        .set({ status: "atendido", itemId, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
        .returning();
      if (!atendido) return res.status(409).json({ error: "Este pedido acabou de ser resolvido por outra pessoa." });

      // O que o pedido leva para a peça — sem sobrescrever o que ela já tem.
      let patrocinadorVinculado = false;
      if (pedido.sponsorId && PECA_SEM_FLUXO.has(peca.status)) {
        const jaTem = await storage.getItemSponsors(itemId);
        if (jaTem.length === 0) {
          await storage.addSponsorToItem({ itemId, sponsorId: pedido.sponsorId } as any);
          broadcast({ type: "item_sponsor_added", itemSponsor: { itemId, sponsorId: pedido.sponsorId } });
          patrocinadorVinculado = true;
        }
      }
      let referenciasCopiadas = false;
      if ((pedido.referencias ?? []).length > 0 && ((peca as any).referenceUrls ?? []).length === 0) {
        const atualizada = await storage.updateItem(itemId, { referenceUrls: pedido.referencias } as any);
        if (atualizada) broadcast({ type: "item_updated", item: atualizada });
        referenciasCopiadas = true;
      }

      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Pedido atendido com a peça ${peca.displayId} (${peca.type})`);
      await createAuditLog(req, "updated", "item", itemId,
        `Peça criada a partir do pedido do Atendimento (${pedido.pedidoPor ?? "—"}): ${pedido.observacao}`);
      await notificar({
        type: "pedidoAtendido",
        message: `Pedido atendido: ${peca.displayId} ${peca.type} — Evento: ${evento?.name ?? "—"}`,
        eventId: pedido.eventId,
        itemId,
        targetRoles: ["atendimento", "admin"],
      });
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json({ ...atendido, patrocinadorVinculado, referenciasCopiadas });
    } catch (error) {
      console.error("[pedidos] erro ao atender:", error);
      res.status(500).json({ error: "Erro ao atender o pedido" });
    }
  });

  app.patch("/api/pedidos-de-peca/:id/recusar", requireResolverPedido, async (req, res) => {
    try {
      const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
      if (motivo.length < 3) return res.status(400).json({ error: "Diga ao Atendimento por que o pedido foi recusado." });
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });

      const quem = quemAgiu(req);
      const [recusado] = await db.update(pedidosDePeca)
        .set({ status: "recusado", motivoRecusa: motivo, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
        .returning();
      if (!recusado) return res.status(409).json({ error: "Este pedido não está mais aberto." });

      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Pedido recusado: ${motivo}`);
      await notificar({
        type: "pedidoRecusado",
        message: `Pedido recusado (${pedido.quantidade} un. — ${evento?.name ?? "—"}): ${motivo}`,
        eventId: pedido.eventId,
        targetRoles: ["atendimento", "admin"],
      });
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(recusado);
    } catch (error) {
      console.error("[pedidos] erro ao recusar:", error);
      res.status(500).json({ error: "Erro ao recusar o pedido" });
    }
  });

  app.patch("/api/pedidos-de-peca/:id/cancelar", requirePedirPeca, async (req, res) => {
    try {
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido) return res.status(404).json({ error: "Pedido não encontrado" });
      if ((req as any).userRole !== "admin" && pedido.pedidoPorId && pedido.pedidoPorId !== (req as any).userId) {
        return res.status(403).json({ error: "Só quem fez o pedido pode cancelá-lo." });
      }
      const quem = quemAgiu(req);
      const [cancelado] = await db.update(pedidosDePeca)
        .set({ status: "cancelado", resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
        .returning();
      if (!cancelado) return res.status(409).json({ error: "Este pedido não está mais aberto — já foi resolvido." });
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, "Pedido cancelado por quem pediu");
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(cancelado);
    } catch (error) {
      console.error("[pedidos] erro ao cancelar:", error);
      res.status(500).json({ error: "Erro ao cancelar o pedido" });
    }
  });
}
