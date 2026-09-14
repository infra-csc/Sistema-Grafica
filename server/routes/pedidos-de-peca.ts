// ─────────────────────────────────────────────────────────────────────────────
// PEDIDOS DE PEÇA DO ATENDIMENTO (dono, 14/09) — decisões e ciclo em
// shared/pedidos-de-peca.ts.
//
// Papéis:
//   · ler: Atendimento, Solicitação, Arte e admin (a Gráfica não usa pedidos);
//   · pedir e cancelar (só ABERTA, antes de a Solicitação agir): Atendimento e admin;
//   · editar: só o admin — o Atendimento, se errou, cancela e cria outra;
//   · pedir ajuste (ATENDIDA): Atendimento e admin; aceitar/recusar: Solicitação e admin;
//   · atender e recusar: Solicitação e admin;
//   · reabrir: quem desfaz o estado — atendido/recusado pela Solicitação,
//     cancelado pelo Atendimento (e admin nos três).
//
// Toda transição é UPDATE condicional no status de origem: duas pessoas agindo
// no mesmo pedido ao mesmo tempo — a segunda recebe 409, nunca um estado torto.
//
// Um pedido pode virar VÁRIAS peças (items.pedido_de_peca_id); cada peça atende
// no máximo um pedido. O primeiro vínculo marca o pedido como atendido.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { pedidosDePeca, events, sponsors, eventSponsors, items as itemsTable } from "@shared/schema";
import {
  MAX_REFERENCIAS_DO_PEDIDO,
  MIN_MOTIVO_DO_PEDIDO,
  ROTULO_DO_PEDIDO,
  STATUS_DO_PEDIDO,
  ehReferenciaValida,
  quantidadeDoPedido,
  podePedirAjuste,
  quemReabre,
  type StatusDoPedido,
} from "@shared/pedidos-de-peca";
import { requireRole, broadcast, createAuditLog, resolveActor } from "./shared";
import { motivoEventoDaPeca, erroEventoFechado } from "./eventoFinalizado";

const requireLerPedidos = requireRole("admin", "solicitacao", "atendimento", "arte");
const requirePedirPeca = requireRole("admin", "atendimento");
const requireEditarPedido = requireRole("admin");
const requireResolverPedido = requireRole("admin", "solicitacao");
const requireReabrirPedido = requireRole("admin", "atendimento", "solicitacao");

/** Peça que ainda não entrou no fluxo: dá para vincular patrocinador direto. */
const PECA_SEM_FLUXO = new Set(["draft", "requested"]);

const MSG_QUANTIDADE = "Informe a quantidade (mínimo 1)";
const referencia = z.string().refine(ehReferenciaValida, "Referência inválida — envie a imagem pelo formulário");
const medida = z.number().positive("A medida precisa ser maior que zero").max(1000, "Medida grande demais");
const dataDoPrazo = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do prazo inválida");

const camposDoPedido = {
  sponsorId: z.string().min(1, "Escolha o patrocinador"),
  quantidade: z.number({ required_error: MSG_QUANTIDADE, invalid_type_error: MSG_QUANTIDADE })
    .int(MSG_QUANTIDADE).min(1, "A quantidade mínima é 1").max(100000),
  observacao: z.string().trim().min(3, "Descreva o que precisa").max(2000),
  referencias: z.array(referencia).max(MAX_REFERENCIAS_DO_PEDIDO, `No máximo ${MAX_REFERENCIAS_DO_PEDIDO} referências`),
  precisaAte: dataDoPrazo.nullable(),
  tipoDePeca: z.string().trim().max(120).nullable(),
  largura: medida.nullable(),
  altura: medida.nullable(),
};

const novoPedidoSchema = z.object({
  eventId: z.string().min(1, "Escolha o evento"),
  sponsorId: camposDoPedido.sponsorId,
  quantidade: camposDoPedido.quantidade,
  observacao: camposDoPedido.observacao,
  referencias: camposDoPedido.referencias.default([]),
  precisaAte: camposDoPedido.precisaAte.optional(),
  tipoDePeca: camposDoPedido.tipoDePeca.optional(),
  largura: camposDoPedido.largura.optional(),
  altura: camposDoPedido.altura.optional(),
});

const edicaoSchema = z.object(camposDoPedido).partial();

const paraData = (d: string | null | undefined): Date | null => (d ? new Date(`${d}T12:00:00Z`) : null);
const paraDecimal = (n: number | null | undefined): string | null => (n == null ? null : String(n));
const lerMotivo = (body: any): string => (typeof body?.motivo === "string" ? body.motivo.trim() : "");
const quemAgiu = (req: any) => resolveActor({ userName: req.userName, userId: req.userId ?? null });
const rotulo = (s: string) => ROTULO_DO_PEDIDO[s as StatusDoPedido]?.toLowerCase() ?? s;

async function notificar(dados: { type: string; message: string; eventId: string; itemId?: string | null; targetRoles: string[]; targetUserId?: string | null }) {
  try {
    const notification = await storage.createNotification(dados as any);
    broadcast({ type: "notification_created", notification });
  } catch (error) {
    console.error("[pedidos] falha ao notificar:", error);
  }
}

/** Aviso para QUEM PEDIU (quando se sabe quem foi); senão, para o perfil. */
const paraQuemPediu = (pedido: { pedidoPorId: string | null }) =>
  pedido.pedidoPorId
    ? { targetRoles: ["atendimento", "admin"], targetUserId: pedido.pedidoPorId }
    : { targetRoles: ["atendimento", "admin"] };

// Atendimento só enxerga e mexe nas solicitações que ele mesmo criou (dono,
// 14/09). Solicitação, Arte e admin veem todas.
const ehDeOutraPessoa = (req: any, pedido: { pedidoPorId: string | null }) =>
  req.userRole === "atendimento" && pedido.pedidoPorId !== req.userId;

async function patrocinadorDoEvento(eventId: string, sponsorId: string, eventName: string) {
  const patrocinador = await storage.getSponsor(sponsorId);
  if (!patrocinador) return { erro: "Patrocinador não encontrado", status: 404 };
  const vinculos = await db.select({ sponsorId: eventSponsors.sponsorId }).from(eventSponsors).where(eq(eventSponsors.eventId, eventId));
  if (vinculos.length > 0 && !vinculos.some((v) => v.sponsorId === patrocinador.id)) {
    return { erro: `${patrocinador.name} não é patrocinador de ${eventName}.`, status: 400 };
  }
  return { patrocinador };
}

async function listarPedidos(condicoes: any[], limite: number) {
  const linhas = await db.select({
    pedido: pedidosDePeca,
    eventName: events.name,
    eventStart: events.startDate,
    eventSaida: events.truckDepartureDate,
    sponsorName: sponsors.name,
  })
    .from(pedidosDePeca)
    .leftJoin(events, eq(events.id, pedidosDePeca.eventId))
    .leftJoin(sponsors, eq(sponsors.id, pedidosDePeca.sponsorId))
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(pedidosDePeca.createdAt))
    .limit(limite);

  const ids = linhas.map((l) => l.pedido.id);
  const pecas = ids.length
    ? await db.select({
        id: itemsTable.id,
        displayId: itemsTable.displayId,
        type: itemsTable.type,
        quantity: itemsTable.quantity,
        status: itemsTable.status,
        pedidoDePecaId: itemsTable.pedidoDePecaId,
      })
        .from(itemsTable)
        .where(and(inArray(itemsTable.pedidoDePecaId, ids), isNull(itemsTable.deletedAt)))
    : [];
  const porPedido = new Map<string, Array<Omit<(typeof pecas)[number], "pedidoDePecaId">>>();
  for (const { pedidoDePecaId, ...p } of pecas) {
    if (!pedidoDePecaId) continue;
    const lista = porPedido.get(pedidoDePecaId);
    if (lista) lista.push(p); else porPedido.set(pedidoDePecaId, [p]);
  }
  return linhas.map((l) => ({
    ...l.pedido,
    eventName: l.eventName,
    eventStart: l.eventStart,
    eventSaida: l.eventSaida,
    sponsorName: l.sponsorName,
    pecas: (porPedido.get(l.pedido.id) ?? []).sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true })),
  }));
}

/**
 * Liga uma peça a um pedido. Usada pela rota "atender" e pela criação de peça
 * (POST /api/items com pedidoDePecaId) — que assim liga NA MESMA requisição.
 */
export async function vincularPecaAoPedido(req: any, pedidoId: string, itemId: string): Promise<{ status: number; erro?: string; pedido?: any }> {
  if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
    return { status: 403, erro: "Atender solicitação de peça é do perfil Solicitação e do admin." };
  }
  const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, pedidoId));
  if (!pedido) return { status: 404, erro: "Solicitação não encontrada" };
  if (pedido.status !== "aberto" && pedido.status !== "atendido") {
    return { status: 409, erro: `Esta solicitação está ${rotulo(pedido.status)} — reabra antes de ligar uma peça.` };
  }
  const peca = await storage.getItem(itemId);
  if (!peca || (peca as any).deletedAt) return { status: 404, erro: "Peça não encontrada" };
  if (peca.eventId !== pedido.eventId) return { status: 400, erro: "A peça escolhida é de outro evento." };
  const motivoFim = await motivoEventoDaPeca({ eventId: pedido.eventId });
  if (motivoFim) return { status: 409, erro: erroEventoFechado(motivoFim) };
  const jaLigada = (peca as any).pedidoDePecaId as string | null;
  if (jaLigada === pedido.id) return { status: 200, pedido };
  if (jaLigada) return { status: 409, erro: `A peça ${peca.displayId} já atende outra solicitação.` };

  // A peça primeiro, só se ainda estiver livre (duas pessoas ligando a mesma).
  const marcadas = await db.update(itemsTable)
    .set({ pedidoDePecaId: pedido.id, updatedAt: new Date() } as any)
    .where(and(eq(itemsTable.id, itemId), isNull(itemsTable.pedidoDePecaId)))
    .returning({ id: itemsTable.id });
  if (marcadas.length === 0) return { status: 409, erro: `A peça ${peca.displayId} acabou de ser ligada a outra solicitação.` };

  const quem = quemAgiu(req);
  const primeiraPeca = pedido.status === "aberto";
  let atualizado: any = pedido;
  if (primeiraPeca) {
    const [a] = await db.update(pedidosDePeca)
      .set({ status: "atendido", itemId, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
      .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
      .returning();
    if (a) {
      atualizado = a;
    } else {
      const [agora] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, pedido.id));
      if (agora?.status !== "atendido") {
        await db.update(itemsTable).set({ pedidoDePecaId: null, updatedAt: new Date() } as any).where(eq(itemsTable.id, itemId));
        return { status: 409, erro: "Esta solicitação acabou de mudar de estado — atualize a tela." };
      }
      atualizado = agora;
    }
  }

  // O que o pedido leva para a peça — sem sobrescrever o que ela já tem.
  if (pedido.sponsorId && PECA_SEM_FLUXO.has(peca.status)) {
    const jaTem = await storage.getItemSponsors(itemId);
    if (jaTem.length === 0) {
      await storage.addSponsorToItem({ itemId, sponsorId: pedido.sponsorId } as any);
      broadcast({ type: "item_sponsor_added", itemSponsor: { itemId, sponsorId: pedido.sponsorId } });
    }
  }
  if ((pedido.referencias ?? []).length > 0 && ((peca as any).referenceUrls ?? []).length === 0) {
    await storage.updateItem(itemId, { referenceUrls: pedido.referencias } as any);
  }
  const pecaAtual = await storage.getItem(itemId);
  if (pecaAtual) broadcast({ type: "item_updated", item: pecaAtual });

  const evento = await storage.getEvent(pedido.eventId);
  await createAuditLog(req, "updated", "pedido_de_peca", pedido.id,
    `${primeiraPeca ? "Solicitação atendida" : "Mais uma peça para a solicitação"}: ${peca.displayId} (${peca.type}, ${peca.quantity} un.)`);
  await createAuditLog(req, "updated", "item", itemId,
    `Peça ligada à solicitação do Atendimento (${pedido.pedidoPor ?? "—"}): ${pedido.observacao}`);
  await notificar({
    type: "pedidoAtendido",
    message: primeiraPeca
      ? `Sua solicitação foi atendida: ${peca.displayId} ${peca.type} — Evento: ${evento?.name ?? "—"}`
      : `Mais uma peça para a sua solicitação: ${peca.displayId} ${peca.type} — Evento: ${evento?.name ?? "—"}`,
    eventId: pedido.eventId,
    itemId,
    ...paraQuemPediu(pedido),
  });
  broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
  return { status: 200, pedido: atualizado };
}

export function registerPedidosDePecaRoutes(app: Express): void {
  app.get("/api/pedidos-de-peca", requireLerPedidos, async (req, res) => {
    try {
      const condicoes = [];
      if (typeof req.query.eventId === "string" && req.query.eventId) {
        condicoes.push(eq(pedidosDePeca.eventId, req.query.eventId));
      }
      if (typeof req.query.status === "string" && req.query.status) {
        const lista = req.query.status.split(",").filter((s): s is StatusDoPedido => (STATUS_DO_PEDIDO as readonly string[]).includes(s));
        if (lista.length > 0) condicoes.push(inArray(pedidosDePeca.status, lista));
      }
      if ((req as any).userRole === "atendimento") {
        condicoes.push(eq(pedidosDePeca.pedidoPorId, (req as any).userId ?? ""));
      } else if (req.query.meus === "1" && (req as any).userId) {
        condicoes.push(eq(pedidosDePeca.pedidoPorId, (req as any).userId));
      }
      const limite = Math.max(1, Math.min(1000, parseInt(String(req.query.limite ?? "300"), 10) || 300));
      res.json(await listarPedidos(condicoes, limite));
    } catch (error) {
      console.error("[pedidos] erro ao listar:", error);
      res.status(500).json({ error: "Erro ao listar as solicitações de peça" });
    }
  });

  app.post("/api/pedidos-de-peca", requirePedirPeca, async (req, res) => {
    try {
      const dados = novoPedidoSchema.parse(req.body);
      const evento = await storage.getEvent(dados.eventId);
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });
      const motivo = await motivoEventoDaPeca({ eventId: evento.id });
      if (motivo) return res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });
      const checagem = await patrocinadorDoEvento(evento.id, dados.sponsorId, evento.name);
      if (!checagem.patrocinador) return res.status(checagem.status!).json({ error: checagem.erro });

      const quem = quemAgiu(req);
      const [pedido] = await db.insert(pedidosDePeca).values({
        eventId: evento.id,
        sponsorId: checagem.patrocinador.id,
        quantidade: dados.quantidade,
        observacao: dados.observacao,
        referencias: dados.referencias,
        // Sem prazo informado, vale a saída do caminhão — é quando a peça
        // precisa estar pronta.
        precisaAte: dados.precisaAte ? paraData(dados.precisaAte) : (evento.truckDepartureDate ?? null),
        tipoDePeca: dados.tipoDePeca || null,
        largura: paraDecimal(dados.largura),
        altura: paraDecimal(dados.altura),
        pedidoPor: quem.userName,
        pedidoPorId: quem.userId,
      }).returning();

      const qtd = quantidadeDoPedido(pedido.quantidade);
      await createAuditLog(req, "created", "pedido_de_peca", pedido.id,
        `Solicitação do Atendimento: ${qtd} para ${checagem.patrocinador.name} — ${evento.name}. ${dados.observacao}`);
      await notificar({
        type: "pedidoDePeca",
        message: `Solicitação do Atendimento: ${qtd} para ${checagem.patrocinador.name} — Evento: ${evento.name}`,
        eventId: evento.id,
        targetRoles: ["solicitacao", "admin"],
      });
      broadcast({ type: "pedidos_de_peca", eventId: evento.id });
      res.status(201).json(pedido);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      console.error("[pedidos] erro ao criar:", error);
      res.status(500).json({ error: "Erro ao enviar a solicitação" });
    }
  });

  // Editar enquanto ABERTA — só o admin. O Atendimento não edita (dono, 14/09):
  // se errou, cancela e cria outra.
  app.patch("/api/pedidos-de-peca/:id", requireEditarPedido, async (req, res) => {
    try {
      const dados = edicaoSchema.parse(req.body);
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido || ehDeOutraPessoa(req, pedido)) return res.status(404).json({ error: "Solicitação não encontrada" });
      if (pedido.status !== "aberto") {
        return res.status(409).json({ error: `Só dá para editar solicitação aberta — esta está ${rotulo(pedido.status)}.` });
      }
      const evento = await storage.getEvent(pedido.eventId);
      if (!evento) return res.status(404).json({ error: "Evento não encontrado" });

      const mudancas: Record<string, any> = {};
      const descricao: string[] = [];
      if (dados.sponsorId !== undefined && dados.sponsorId !== pedido.sponsorId) {
        const checagem = await patrocinadorDoEvento(evento.id, dados.sponsorId, evento.name);
        if (!checagem.patrocinador) return res.status(checagem.status!).json({ error: checagem.erro });
        mudancas.sponsorId = checagem.patrocinador.id;
        descricao.push(`patrocinador → ${checagem.patrocinador.name}`);
      }
      if (dados.quantidade !== undefined && dados.quantidade !== pedido.quantidade) {
        mudancas.quantidade = dados.quantidade;
        descricao.push(`quantidade ${pedido.quantidade} → ${dados.quantidade}`);
      }
      if (dados.observacao !== undefined && dados.observacao !== pedido.observacao) {
        mudancas.observacao = dados.observacao;
        descricao.push("observação alterada");
      }
      if (dados.referencias !== undefined && JSON.stringify(dados.referencias) !== JSON.stringify(pedido.referencias ?? [])) {
        mudancas.referencias = dados.referencias;
        descricao.push(`referências: ${dados.referencias.length}`);
      }
      if (dados.precisaAte !== undefined) {
        const novo = paraData(dados.precisaAte);
        if ((novo?.toISOString().slice(0, 10) ?? null) !== (pedido.precisaAte?.toISOString().slice(0, 10) ?? null)) {
          mudancas.precisaAte = novo;
          descricao.push(`prazo → ${dados.precisaAte ?? "sem prazo"}`);
        }
      }
      if (dados.tipoDePeca !== undefined && (dados.tipoDePeca || null) !== pedido.tipoDePeca) {
        mudancas.tipoDePeca = dados.tipoDePeca || null;
        descricao.push("tipo de peça alterado");
      }
      for (const campo of ["largura", "altura"] as const) {
        if (dados[campo] !== undefined && paraDecimal(dados[campo]) !== (pedido[campo] == null ? null : String(Number(pedido[campo])))) {
          mudancas[campo] = paraDecimal(dados[campo]);
          descricao.push(`${campo} alterada`);
        }
      }
      if (descricao.length === 0) return res.json(pedido);

      const quem = quemAgiu(req);
      const [editado] = await db.update(pedidosDePeca)
        .set({ ...mudancas, editadoPor: quem.userName, editadoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
        .returning();
      if (!editado) return res.status(409).json({ error: "Esta solicitação acabou de ser resolvida — atualize a tela." });

      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Solicitação editada: ${descricao.join("; ")}`);
      await notificar({
        type: "pedidoEditado",
        message: `Solicitação do Atendimento editada (${evento.name}): ${descricao.join("; ")}`,
        eventId: pedido.eventId,
        targetRoles: ["solicitacao", "admin"],
      });
      if (pedido.pedidoPorId && pedido.pedidoPorId !== quem.userId) {
        await notificar({
          type: "pedidoEditado",
          message: `${quem.userName} editou a sua solicitação (${evento.name}): ${descricao.join("; ")}`,
          eventId: pedido.eventId,
          ...paraQuemPediu(pedido),
        });
      }
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(editado);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      console.error("[pedidos] erro ao editar:", error);
      res.status(500).json({ error: "Erro ao editar a solicitação" });
    }
  });

  app.patch("/api/pedidos-de-peca/:id/atender", requireResolverPedido, async (req, res) => {
    try {
      const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
      if (!itemId) return res.status(400).json({ error: "Escolha a peça que atende esta solicitação." });
      const r = await vincularPecaAoPedido(req, req.params.id, itemId);
      if (r.erro) return res.status(r.status).json({ error: r.erro });
      res.json(r.pedido);
    } catch (error) {
      console.error("[pedidos] erro ao atender:", error);
      res.status(500).json({ error: "Erro ao atender a solicitação" });
    }
  });

  app.patch("/api/pedidos-de-peca/:id/recusar", requireResolverPedido, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga ao Atendimento por que a solicitação foi recusada (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido) return res.status(404).json({ error: "Solicitação não encontrada" });

      const quem = quemAgiu(req);
      const [recusado] = await db.update(pedidosDePeca)
        .set({ status: "recusado", motivoRecusa: motivo, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
        .returning();
      if (!recusado) return res.status(409).json({ error: "Esta solicitação não está mais aberta." });

      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Solicitação recusada: ${motivo}`);
      await notificar({
        type: "pedidoRecusado",
        message: `Sua solicitação foi recusada (${quantidadeDoPedido(pedido.quantidade)} — ${evento?.name ?? "—"}): ${motivo}`,
        eventId: pedido.eventId,
        ...paraQuemPediu(pedido),
      });
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(recusado);
    } catch (error) {
      console.error("[pedidos] erro ao recusar:", error);
      res.status(500).json({ error: "Erro ao recusar a solicitação" });
    }
  });

  // Atendimento cancela só as próprias; o admin cancela qualquer uma, e aí
  // quem pediu é avisado.
  app.patch("/api/pedidos-de-peca/:id/cancelar", requirePedirPeca, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga por que a solicitação está sendo cancelada (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido || ehDeOutraPessoa(req, pedido)) return res.status(404).json({ error: "Solicitação não encontrada" });
      const quem = quemAgiu(req);
      const [cancelado] = await db.update(pedidosDePeca)
        .set({ status: "cancelado", motivoCancelamento: motivo, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "aberto")))
        .returning();
      if (!cancelado) return res.status(409).json({ error: "Esta solicitação não está mais aberta — já foi resolvida." });

      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Solicitação cancelada por ${quem.userName}: ${motivo}`);
      await notificar({
        type: "pedidoCancelado",
        message: `Solicitação cancelada pelo Atendimento (${quantidadeDoPedido(pedido.quantidade)} — ${evento?.name ?? "—"}): ${motivo}`,
        eventId: pedido.eventId,
        targetRoles: ["solicitacao", "admin"],
      });
      if (pedido.pedidoPorId && pedido.pedidoPorId !== quem.userId) {
        await notificar({
          type: "pedidoCancelado",
          message: `${quem.userName} cancelou a sua solicitação (${evento?.name ?? "—"}): ${motivo}`,
          eventId: pedido.eventId,
          ...paraQuemPediu(pedido),
        });
      }
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(cancelado);
    } catch (error) {
      console.error("[pedidos] erro ao cancelar:", error);
      res.status(500).json({ error: "Erro ao cancelar a solicitação" });
    }
  });

  // AJUSTE (dono, 14/09): depois que a Solicitação agiu, o Atendimento não
  // edita nem cancela — pede um ajuste por escrito, e quem monta a lista aceita
  // ou recusa. Um ajuste esperando resposta por vez.
  app.patch("/api/pedidos-de-peca/:id/ajuste", requirePedirPeca, async (req, res) => {
    try {
      const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
      if (texto.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Descreva o ajuste (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      if (texto.length > 2000) return res.status(400).json({ error: "O ajuste passou de 2000 caracteres." });
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido || ehDeOutraPessoa(req, pedido)) return res.status(404).json({ error: "Solicitação não encontrada" });
      if (!podePedirAjuste(pedido)) {
        return res.status(409).json({
          error: pedido.ajusteStatus === "pendente"
            ? "Já existe um ajuste esperando resposta de quem monta a lista."
            : pedido.status === "aberto"
              ? "A solicitação ainda está aberta — se algo está errado, cancele e crie outra."
              : `Só dá para pedir ajuste em solicitação atendida — esta está ${rotulo(pedido.status)}.`,
        });
      }
      const quem = quemAgiu(req);
      const [atualizado] = await db.update(pedidosDePeca)
        .set({
          ajusteStatus: "pendente", ajusteTexto: texto, ajustePedidoPor: quem.userName, ajustePedidoPorId: quem.userId, ajustePedidoEm: new Date(),
          ajusteRespondidoPor: null, ajusteRespondidoEm: null, ajusteResposta: null, updatedAt: new Date(),
        })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, "atendido"), or(isNull(pedidosDePeca.ajusteStatus), ne(pedidosDePeca.ajusteStatus, "pendente"))))
        .returning();
      if (!atualizado) return res.status(409).json({ error: "Esta solicitação acabou de mudar — atualize a tela." });

      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Ajuste solicitado por ${quem.userName}: ${texto}`);
      await notificar({
        type: "pedidoAjuste",
        message: `Ajuste solicitado pelo Atendimento (${quantidadeDoPedido(pedido.quantidade)} — ${evento?.name ?? "—"}): ${texto}`,
        eventId: pedido.eventId,
        targetRoles: ["solicitacao", "admin"],
      });
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(atualizado);
    } catch (error) {
      console.error("[pedidos] erro ao pedir ajuste:", error);
      res.status(500).json({ error: "Erro ao pedir o ajuste" });
    }
  });

  app.patch("/api/pedidos-de-peca/:id/ajuste/responder", requireResolverPedido, async (req, res) => {
    try {
      const aceitar = req.body?.aceitar === true;
      const resposta = lerMotivo(req.body);
      if (!aceitar && resposta.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga ao Atendimento por que o ajuste foi recusado (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido) return res.status(404).json({ error: "Solicitação não encontrada" });
      const quem = quemAgiu(req);
      const [respondido] = await db.update(pedidosDePeca)
        .set({ ajusteStatus: aceitar ? "aceito" : "recusado", ajusteRespondidoPor: quem.userName, ajusteRespondidoEm: new Date(), ajusteResposta: resposta || null, updatedAt: new Date() })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.ajusteStatus, "pendente")))
        .returning();
      if (!respondido) return res.status(409).json({ error: "Não há ajuste esperando resposta nesta solicitação." });

      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id,
        aceitar ? `Ajuste aceito por ${quem.userName}${resposta ? `: ${resposta}` : ""}` : `Ajuste recusado por ${quem.userName}: ${resposta}`);
      await notificar({
        type: aceitar ? "pedidoAjusteAceito" : "pedidoAjusteRecusado",
        message: aceitar
          ? `Seu ajuste foi aceito (${evento?.name ?? "—"}) — quem monta a lista vai ajustar a peça.`
          : `Seu ajuste foi recusado (${evento?.name ?? "—"}): ${resposta}`,
        eventId: pedido.eventId,
        ...(pedido.ajustePedidoPorId
          ? { targetRoles: ["atendimento", "admin"], targetUserId: pedido.ajustePedidoPorId }
          : paraQuemPediu(pedido)),
      });
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(respondido);
    } catch (error) {
      console.error("[pedidos] erro ao responder ajuste:", error);
      res.status(500).json({ error: "Erro ao responder o ajuste" });
    }
  });

  // Desfazer: atendido com a peça errada, recusado ou cancelado por engano.
  // As peças ligadas continuam existindo — só deixam de atender o pedido.
  app.patch("/api/pedidos-de-peca/:id/reabrir", requireReabrirPedido, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga por que a solicitação está sendo reaberta (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido || ehDeOutraPessoa(req, pedido)) return res.status(404).json({ error: "Solicitação não encontrada" });
      const papeis = quemReabre(pedido.status);
      if (papeis.length === 0) return res.status(409).json({ error: "Esta solicitação já está aberta." });
      if (!papeis.includes((req as any).userRole)) {
        return res.status(403).json({
          error: pedido.status === "cancelado"
            ? "Reabrir solicitação cancelada é do Atendimento e do admin."
            : "Reabrir solicitação atendida ou recusada é do perfil Solicitação e do admin.",
        });
      }
      const motivoFim = await motivoEventoDaPeca({ eventId: pedido.eventId });
      if (motivoFim) return res.status(409).json({ error: erroEventoFechado(motivoFim) });

      const [reaberto] = await db.update(pedidosDePeca)
        .set({
          status: "aberto", itemId: null, resolvidoPor: null, resolvidoPorId: null, resolvidoEm: null, motivoRecusa: null, motivoCancelamento: null,
          // Voltou a aberta: um ajuste da versão atendida não vale mais (fica na auditoria).
          ajusteStatus: null, ajusteTexto: null, ajustePedidoPor: null, ajustePedidoPorId: null, ajustePedidoEm: null,
          ajusteRespondidoPor: null, ajusteRespondidoEm: null, ajusteResposta: null,
          updatedAt: new Date(),
        })
        .where(and(eq(pedidosDePeca.id, pedido.id), eq(pedidosDePeca.status, pedido.status)))
        .returning();
      if (!reaberto) return res.status(409).json({ error: "Esta solicitação acabou de mudar de estado — atualize a tela." });
      if (pedido.status === "atendido") {
        await db.update(itemsTable).set({ pedidoDePecaId: null, updatedAt: new Date() } as any).where(eq(itemsTable.pedidoDePecaId, pedido.id));
        broadcast({ type: "items_bulk_updated" });
      }

      const quem = quemAgiu(req);
      const evento = await storage.getEvent(pedido.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Solicitação reaberta (estava ${rotulo(pedido.status)}): ${motivo}`);
      if (pedido.status === "cancelado") {
        await notificar({
          type: "pedidoReaberto",
          message: `Solicitação reaberta pelo Atendimento (${evento?.name ?? "—"}): ${motivo}`,
          eventId: pedido.eventId,
          targetRoles: ["solicitacao", "admin"],
        });
      } else {
        await notificar({
          type: "pedidoReaberto",
          message: `${quem.userName} reabriu a sua solicitação (${evento?.name ?? "—"}): ${motivo}`,
          eventId: pedido.eventId,
          ...paraQuemPediu(pedido),
        });
      }
      broadcast({ type: "pedidos_de_peca", eventId: pedido.eventId });
      res.json(reaberto);
    } catch (error) {
      console.error("[pedidos] erro ao reabrir:", error);
      res.status(500).json({ error: "Erro ao reabrir a solicitação" });
    }
  });
}
