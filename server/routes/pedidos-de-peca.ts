// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO DE PEÇAS DO ATENDIMENTO (dono, 14/09) — decisões e ciclo em
// shared/pedidos-de-peca.ts.
//
// Uma solicitação tem VÁRIAS peças (pedidos_de_peca_linhas), cada uma com
// evento, patrocinadores e status próprios. As ações são POR PEÇA
// (/api/pedidos-de-peca/linhas/:linhaId/...); a solicitação só é criada,
// cancelada inteira (enquanto nada foi feito) e listada.
//
// Papéis:
//   · ler: Atendimento (só as suas), Solicitação, Arte e admin;
//   · solicitar e cancelar (só ABERTA, antes de a Solicitação agir): Atendimento e admin;
//   · ninguém edita — errou, cancela e cria outra;
//   · pedir ajuste (ATENDIDA): Atendimento e admin; aceitar/recusar: Solicitação e admin;
//   · atender e recusar: Solicitação e admin;
//   · reabrir: recusada pela Solicitação, cancelada pelo Atendimento (e admin).
//     Atendida não se desfaz na mão: volta sozinha se a peça ligada for excluída.
//
// Toda transição é UPDATE condicional no status de origem: duas pessoas agindo
// na mesma peça ao mesmo tempo — a segunda recebe 409, nunca um estado torto.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { pedidosDePeca, linhasDoPedidoDePeca, events, sponsors, eventSponsors, items as itemsTable } from "@shared/schema";
import {
  MAX_PECAS_POR_SOLICITACAO,
  MAX_REFERENCIAS_DO_PEDIDO,
  MIN_MOTIVO_DO_PEDIDO,
  ROTULO_DO_PEDIDO,
  ehReferenciaValida,
  podePedirAjuste,
  quantidadeDoPedido,
  quemReabre,
  rotuloDaLinha,
  statusDaSolicitacao,
  temPecaAberta,
  type StatusDaSolicitacao,
} from "@shared/pedidos-de-peca";
import { requireRole, broadcast, createAuditLog, resolveActor } from "./shared";
import { motivoEventoDaPeca, erroEventoFechado } from "./eventoFinalizado";
import { resumosDeTuboPorIds, comTubo } from "../services/tubosDaPeca";

const requireLerPedidos = requireRole("admin", "solicitacao", "atendimento", "arte");
const requirePedirPeca = requireRole("admin", "atendimento");
const requireResolverPedido = requireRole("admin", "solicitacao");
const requireReabrirPedido = requireRole("admin", "atendimento", "solicitacao");

/** Peça que ainda não entrou no fluxo: dá para vincular patrocinador direto. */
const PECA_SEM_FLUXO = new Set(["draft", "requested"]);

const MSG_QUANTIDADE = "Informe a quantidade (mínimo 1)";
const referencia = z.string().refine(ehReferenciaValida, "Referência inválida — envie a imagem pelo formulário");
const medida = z.number().positive("A medida precisa ser maior que zero").max(1000, "Medida grande demais");
const dataDoPrazo = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data do prazo inválida");

const linhaSchema = z.object({
  eventId: z.string().min(1, "Escolha o evento de cada peça"),
  sponsorIds: z.array(z.string().min(1)).max(50).default([]),
  quantidade: z.number({ required_error: MSG_QUANTIDADE, invalid_type_error: MSG_QUANTIDADE })
    .int(MSG_QUANTIDADE).min(1, "A quantidade mínima é 1").max(100000),
  observacao: z.string().trim().min(3, "Descreva o que precisa em cada peça").max(2000),
  referencias: z.array(referencia).max(MAX_REFERENCIAS_DO_PEDIDO, `No máximo ${MAX_REFERENCIAS_DO_PEDIDO} referências por peça`).default([]),
  precisaAte: dataDoPrazo.nullable().optional(),
  tipoDePeca: z.string().trim().max(120).nullable().optional(),
  largura: medida.nullable().optional(),
  altura: medida.nullable().optional(),
});

const novaSolicitacaoSchema = z.object({
  linhas: z.array(linhaSchema)
    .min(1, "Adicione pelo menos uma peça")
    .max(MAX_PECAS_POR_SOLICITACAO, `No máximo ${MAX_PECAS_POR_SOLICITACAO} peças por solicitação`),
});

const paraData = (d: string | null | undefined): Date | null => (d ? new Date(`${d}T12:00:00Z`) : null);
const paraDecimal = (n: number | null | undefined): string | null => (n == null ? null : String(n));
const semRepetir = (lista: string[]): string[] => lista.filter((v, i) => lista.indexOf(v) === i);
const lerMotivo = (body: any): string => (typeof body?.motivo === "string" ? body.motivo.trim() : "");
const quemAgiu = (req: any) => resolveActor({ userName: req.userName, userId: req.userId ?? null });
const rotulo = (s: string) => ROTULO_DO_PEDIDO[s as StatusDaSolicitacao]?.toLowerCase() ?? s;
const nomeDaLinha = (l: { tipoDePeca: string | null; ordem: number; quantidade: number }) =>
  `${rotuloDaLinha(l)} (${quantidadeDoPedido(l.quantidade)})`;

const AJUSTE_LIMPO = {
  ajusteStatus: null, ajusteTexto: null, ajustePedidoPor: null, ajustePedidoPorId: null, ajustePedidoEm: null,
  ajusteRespondidoPor: null, ajusteRespondidoEm: null, ajusteResposta: null,
};

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

// ─── Conversão do formato antigo (uma peça por solicitação) ──────────────────
// Solicitação criada antes das várias peças guarda a peça no próprio
// cabeçalho. Na primeira leitura de cada processo ela ganha a sua linha, e a
// peça criada a partir dela passa a apontar para a linha. Idempotente.
let conversao: Promise<void> | null = null;
function converterFormatoAntigo(): Promise<void> {
  conversao ??= (async () => {
    await db.execute(sql`
      INSERT INTO pedidos_de_peca_linhas (
        pedido_id, ordem, event_id, sponsor_ids, quantidade, observacao, referencias, status,
        precisa_ate, tipo_de_peca, largura, altura, resolvido_por, resolvido_por_id, resolvido_em,
        motivo_recusa, motivo_cancelamento, ajuste_status, ajuste_texto, ajuste_pedido_por,
        ajuste_pedido_por_id, ajuste_pedido_em, ajuste_respondido_por, ajuste_respondido_em,
        ajuste_resposta, created_at, updated_at)
      SELECT p.id, 0, p.event_id,
        CASE WHEN p.sponsor_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[p.sponsor_id] END,
        COALESCE(p.quantidade, 1), COALESCE(p.observacao, ''), p.referencias, p.status,
        p.precisa_ate, p.tipo_de_peca, p.largura, p.altura, p.resolvido_por, p.resolvido_por_id, p.resolvido_em,
        p.motivo_recusa, p.motivo_cancelamento, p.ajuste_status, p.ajuste_texto, p.ajuste_pedido_por,
        p.ajuste_pedido_por_id, p.ajuste_pedido_em, p.ajuste_respondido_por, p.ajuste_respondido_em,
        p.ajuste_resposta, p.created_at, p.updated_at
      FROM pedidos_de_peca p
      WHERE p.event_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM pedidos_de_peca_linhas l WHERE l.pedido_id = p.id)`);
    await db.execute(sql`
      UPDATE items SET pedido_de_peca_linha_id = l.id
      FROM pedidos_de_peca_linhas l
      WHERE items.pedido_de_peca_id = l.pedido_id AND items.pedido_de_peca_linha_id IS NULL`);
  })().catch((error) => {
    conversao = null;
    console.error("[pedidos] conversão do formato antigo falhou:", error);
  });
  return conversao;
}

async function listarSolicitacoes(filtro: { eventId?: string; pedidoPorId?: string; limite: number }) {
  await converterFormatoAntigo();
  const condicoes: any[] = [];
  if (filtro.pedidoPorId !== undefined) condicoes.push(eq(pedidosDePeca.pedidoPorId, filtro.pedidoPorId));
  if (filtro.eventId) {
    const doEvento = await db.selectDistinct({ id: linhasDoPedidoDePeca.pedidoId })
      .from(linhasDoPedidoDePeca).where(eq(linhasDoPedidoDePeca.eventId, filtro.eventId));
    if (doEvento.length === 0) return [];
    condicoes.push(inArray(pedidosDePeca.id, doEvento.map((x) => x.id)));
  }
  const cabecalhos = await db.select({
    id: pedidosDePeca.id,
    pedidoPor: pedidosDePeca.pedidoPor,
    pedidoPorId: pedidosDePeca.pedidoPorId,
    createdAt: pedidosDePeca.createdAt,
  })
    .from(pedidosDePeca)
    .where(condicoes.length ? and(...condicoes) : undefined)
    .orderBy(desc(pedidosDePeca.createdAt))
    .limit(filtro.limite);
  if (cabecalhos.length === 0) return [];

  const linhas = await db.select({
    linha: linhasDoPedidoDePeca,
    eventName: events.name,
    eventStart: events.startDate,
    eventSaida: events.truckDepartureDate,
  })
    .from(linhasDoPedidoDePeca)
    .leftJoin(events, eq(events.id, linhasDoPedidoDePeca.eventId))
    .where(inArray(linhasDoPedidoDePeca.pedidoId, cabecalhos.map((c) => c.id)))
    .orderBy(asc(linhasDoPedidoDePeca.ordem), asc(linhasDoPedidoDePeca.createdAt));

  const idsDePatrocinador = Array.from(new Set(linhas.flatMap((l) => l.linha.sponsorIds ?? [])));
  const nomes = idsDePatrocinador.length
    ? await db.select({ id: sponsors.id, name: sponsors.name }).from(sponsors).where(inArray(sponsors.id, idsDePatrocinador))
    : [];
  const nomePorId = new Map(nomes.map((s) => [s.id, s.name]));

  const idsDeLinha = linhas.map((l) => l.linha.id);
  const pecas = idsDeLinha.length
    ? await db.select({
        id: itemsTable.id,
        displayId: itemsTable.displayId,
        type: itemsTable.type,
        quantity: itemsTable.quantity,
        status: itemsTable.status,
        // O que a frase de produção lê (lib/detalhe-producao, 21/09): "Impressora
        // 2 · 3 de 10", "Tubo 2". Só leitura; nada aqui muda regra nenhuma.
        reuseQty: itemsTable.reuseQty,
        isReuse: itemsTable.isReuse,
        quantityProduced: itemsTable.quantityProduced,
        conferredQty: itemsTable.conferredQty,
        printMachine: itemsTable.printMachine,
        impressaoPorMaquina: itemsTable.impressaoPorMaquina,
        maquinaPrevista: itemsTable.maquinaPrevista,
        reservaPorMaquina: itemsTable.reservaPorMaquina,
        tuboId: itemsTable.tuboId,
        receivedBy: itemsTable.receivedBy,
        linhaId: itemsTable.pedidoDePecaLinhaId,
      })
        .from(itemsTable)
        .where(and(inArray(itemsTable.pedidoDePecaLinhaId, idsDeLinha), isNull(itemsTable.deletedAt)))
    : [];
  const pecasPorLinha = new Map<string, Array<Omit<(typeof pecas)[number], "linhaId">>>();
  const tuboPorId = await resumosDeTuboPorIds(pecas.map((p) => p.tuboId));
  for (const { linhaId, ...crua } of pecas) {
    if (!linhaId) continue;
    const p = comTubo(crua, tuboPorId);
    const lista = pecasPorLinha.get(linhaId);
    if (lista) lista.push(p); else pecasPorLinha.set(linhaId, [p]);
  }

  const linhasPorPedido = new Map<string, any[]>();
  for (const l of linhas) {
    const montada = {
      ...l.linha,
      eventName: l.eventName,
      eventStart: l.eventStart,
      eventSaida: l.eventSaida,
      sponsors: (l.linha.sponsorIds ?? [])
        .filter((id) => nomePorId.has(id))
        .map((id) => ({ id, name: nomePorId.get(id)! })),
      pecas: (pecasPorLinha.get(l.linha.id) ?? [])
        .sort((a, b) => String(a.displayId ?? "").localeCompare(String(b.displayId ?? ""), "pt-BR", { numeric: true })),
    };
    const lista = linhasPorPedido.get(l.linha.pedidoId);
    if (lista) lista.push(montada); else linhasPorPedido.set(l.linha.pedidoId, [montada]);
  }

  return cabecalhos
    .map((c) => {
      const ls = linhasPorPedido.get(c.id) ?? [];
      return { ...c, status: statusDaSolicitacao(ls), linhas: ls };
    })
    .filter((c) => c.linhas.length > 0);
}

/** O status gravado da solicitação acompanha as peças (a lista calcula de novo). */
async function sincronizarStatus(pedidoId: string) {
  const ls = await db.select({ status: linhasDoPedidoDePeca.status }).from(linhasDoPedidoDePeca).where(eq(linhasDoPedidoDePeca.pedidoId, pedidoId));
  if (ls.length) await db.update(pedidosDePeca).set({ status: statusDaSolicitacao(ls), updatedAt: new Date() }).where(eq(pedidosDePeca.id, pedidoId));
}

async function carregarLinha(linhaId: string) {
  const [linha] = await db.select().from(linhasDoPedidoDePeca).where(eq(linhasDoPedidoDePeca.id, linhaId));
  if (!linha) return null;
  const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, linha.pedidoId));
  return pedido ? { linha, pedido } : null;
}

const NAO_ENCONTRADA = "Peça da solicitação não encontrada";

/**
 * Liga uma peça da lista a uma peça solicitada. Usada pela rota "atender" e
 * pela criação de peça (POST /api/items com pedidoDePecaLinhaId) — que assim
 * liga NA MESMA requisição.
 */
export async function vincularPecaALinha(req: any, linhaId: string, itemId: string): Promise<{ status: number; erro?: string; linha?: any }> {
  if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
    return { status: 403, erro: "Atender solicitação de peça é do perfil Solicitação e do admin." };
  }
  const carregada = await carregarLinha(linhaId);
  if (!carregada) return { status: 404, erro: NAO_ENCONTRADA };
  const { linha, pedido } = carregada;
  if (linha.status !== "aberto" && linha.status !== "atendido") {
    return { status: 409, erro: `Esta peça solicitada está ${rotulo(linha.status)} — reabra antes de ligar uma peça.` };
  }
  const peca = await storage.getItem(itemId);
  if (!peca || (peca as any).deletedAt) return { status: 404, erro: "Peça não encontrada" };
  if (peca.eventId !== linha.eventId) return { status: 400, erro: "A peça escolhida é de outro evento." };
  const motivoFim = await motivoEventoDaPeca({ eventId: linha.eventId });
  if (motivoFim) return { status: 409, erro: erroEventoFechado(motivoFim) };
  const jaLigada = ((peca as any).pedidoDePecaLinhaId ?? null) as string | null;
  if (jaLigada === linha.id) return { status: 200, linha };
  if (jaLigada || (peca as any).pedidoDePecaId) return { status: 409, erro: `A peça ${peca.displayId} já atende outra solicitação.` };

  // A peça primeiro, só se ainda estiver livre (duas pessoas ligando a mesma).
  const marcadas = await db.update(itemsTable)
    .set({ pedidoDePecaId: pedido.id, pedidoDePecaLinhaId: linha.id, updatedAt: new Date() } as any)
    .where(and(eq(itemsTable.id, itemId), isNull(itemsTable.pedidoDePecaLinhaId), isNull(itemsTable.pedidoDePecaId)))
    .returning({ id: itemsTable.id });
  if (marcadas.length === 0) return { status: 409, erro: `A peça ${peca.displayId} acabou de ser ligada a outra solicitação.` };

  const quem = quemAgiu(req);
  const primeiraPeca = linha.status === "aberto";
  let atualizada: any = linha;
  if (primeiraPeca) {
    const [a] = await db.update(linhasDoPedidoDePeca)
      .set({ status: "atendido", resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
      .where(and(eq(linhasDoPedidoDePeca.id, linha.id), eq(linhasDoPedidoDePeca.status, "aberto")))
      .returning();
    if (a) {
      atualizada = a;
    } else {
      const [agora] = await db.select().from(linhasDoPedidoDePeca).where(eq(linhasDoPedidoDePeca.id, linha.id));
      if (agora?.status !== "atendido") {
        await db.update(itemsTable).set({ pedidoDePecaId: null, pedidoDePecaLinhaId: null, updatedAt: new Date() } as any).where(eq(itemsTable.id, itemId));
        return { status: 409, erro: "Esta peça solicitada acabou de mudar de estado — atualize a tela." };
      }
      atualizada = agora;
    }
    await sincronizarStatus(pedido.id);
  }

  // O que a solicitação leva para a peça — sem sobrescrever o que ela já tem.
  if ((linha.sponsorIds ?? []).length > 0 && PECA_SEM_FLUXO.has(peca.status)) {
    const jaTem = await storage.getItemSponsors(itemId);
    if (jaTem.length === 0) {
      for (const sponsorId of linha.sponsorIds) {
        await storage.addSponsorToItem({ itemId, sponsorId } as any);
        broadcast({ type: "item_sponsor_added", itemSponsor: { itemId, sponsorId } });
      }
    }
  }
  if ((linha.referencias ?? []).length > 0 && ((peca as any).referenceUrls ?? []).length === 0) {
    await storage.updateItem(itemId, { referenceUrls: linha.referencias } as any);
  }
  const pecaAtual = await storage.getItem(itemId);
  if (pecaAtual) broadcast({ type: "item_updated", item: pecaAtual });

  const evento = await storage.getEvent(linha.eventId);
  await createAuditLog(req, "updated", "pedido_de_peca", pedido.id,
    `${nomeDaLinha(linha)}: ${primeiraPeca ? "atendida com" : "mais uma peça"} ${peca.displayId} (${peca.type}, ${peca.quantity} un.)`);
  await createAuditLog(req, "updated", "item", itemId,
    `Peça ligada à solicitação do Atendimento (${pedido.pedidoPor ?? "—"}): ${linha.observacao}`);
  await notificar({
    type: "pedidoAtendido",
    message: primeiraPeca
      ? `Sua solicitação foi atendida: ${nomeDaLinha(linha)} virou ${peca.displayId} — Evento: ${evento?.name ?? "—"}`
      : `Mais uma peça para a sua solicitação: ${peca.displayId} ${peca.type} — Evento: ${evento?.name ?? "—"}`,
    eventId: linha.eventId,
    itemId,
    ...paraQuemPediu(pedido),
  });
  broadcast({ type: "pedidos_de_peca", eventId: linha.eventId });
  return { status: 200, linha: atualizada };
}

/**
 * A peça ligada foi excluída (dono, 14/09): se era a última peça viva daquela
 * peça solicitada, ela volta para ABERTA sozinha — "atendida sem peça" não
 * existe. Nunca derruba a exclusão: erro aqui só vai para o log.
 */
export async function aoExcluirPeca(req: any, item: { id: string; displayId?: string | null; pedidoDePecaLinhaId?: string | null }) {
  try {
    const linhaId = item.pedidoDePecaLinhaId;
    if (!linhaId) return;
    await db.update(itemsTable).set({ pedidoDePecaId: null, pedidoDePecaLinhaId: null } as any).where(eq(itemsTable.id, item.id));
    const vivas = await db.select({ id: itemsTable.id }).from(itemsTable)
      .where(and(eq(itemsTable.pedidoDePecaLinhaId, linhaId), isNull(itemsTable.deletedAt)));
    if (vivas.length > 0) return;
    const [voltou] = await db.update(linhasDoPedidoDePeca)
      .set({ status: "aberto", resolvidoPor: null, resolvidoPorId: null, resolvidoEm: null, ...AJUSTE_LIMPO, updatedAt: new Date() })
      .where(and(eq(linhasDoPedidoDePeca.id, linhaId), eq(linhasDoPedidoDePeca.status, "atendido")))
      .returning();
    if (!voltou) return;
    await sincronizarStatus(voltou.pedidoId);
    const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, voltou.pedidoId));
    const evento = await storage.getEvent(voltou.eventId);
    const codigo = item.displayId ?? "ligada";
    await createAuditLog(req, "updated", "pedido_de_peca", voltou.pedidoId,
      `${nomeDaLinha(voltou)}: a peça ${codigo} foi excluída — voltou para aberta`);
    await notificar({
      type: "pedidoReaberto",
      message: `Peça solicitada voltou para aberta (${evento?.name ?? "—"}): ${nomeDaLinha(voltou)} — a peça ${codigo} foi excluída`,
      eventId: voltou.eventId,
      targetRoles: ["solicitacao", "admin"],
    });
    if (pedido) {
      await notificar({
        type: "pedidoReaberto",
        message: `A peça ${codigo} da sua solicitação foi excluída — ${nomeDaLinha(voltou)} voltou para aberta (${evento?.name ?? "—"})`,
        eventId: voltou.eventId,
        ...paraQuemPediu(pedido),
      });
    }
    broadcast({ type: "pedidos_de_peca", eventId: voltou.eventId });
  } catch (error) {
    console.error("[pedidos] falha ao reabrir peça solicitada após exclusão:", error);
  }
}

export function registerPedidosDePecaRoutes(app: Express): void {
  app.get("/api/pedidos-de-peca", requireLerPedidos, async (req, res) => {
    try {
      const doAtendimento = (req as any).userRole === "atendimento";
      const limite = Math.max(1, Math.min(1000, parseInt(String(req.query.limite ?? "300"), 10) || 300));
      let lista = await listarSolicitacoes({
        eventId: typeof req.query.eventId === "string" && req.query.eventId ? req.query.eventId : undefined,
        pedidoPorId: doAtendimento ? ((req as any).userId ?? "") : undefined,
        limite,
      });
      if (typeof req.query.status === "string" && req.query.status) {
        const pedidos = req.query.status.split(",");
        // "aberto" = tem peça esperando a lista (aberta ou parcial).
        lista = lista.filter((p) => pedidos.some((s) => (s === "aberto" ? temPecaAberta(p) : p.status === s)));
      }
      res.json(lista);
    } catch (error) {
      console.error("[pedidos] erro ao listar:", error);
      res.status(500).json({ error: "Erro ao listar as solicitações de peça" });
    }
  });

  // O número do menu (dono, 15/09): solicitações que esperam a Solicitação
  // agir — alguma peça aberta ou um ajuste esperando resposta.
  app.get("/api/pedidos-de-peca/pendentes", requireResolverPedido, async (_req, res) => {
    try {
      await converterFormatoAntigo();
      const [{ total }] = await db.select({ total: sql<number>`count(distinct ${linhasDoPedidoDePeca.pedidoId})::int` })
        .from(linhasDoPedidoDePeca)
        .where(or(
          eq(linhasDoPedidoDePeca.status, "aberto"),
          and(eq(linhasDoPedidoDePeca.status, "atendido"), eq(linhasDoPedidoDePeca.ajusteStatus, "pendente")),
        ));
      res.json({ total: Number(total) || 0 });
    } catch (error) {
      console.error("[pedidos] erro ao contar pendentes:", error);
      res.status(500).json({ error: "Erro ao contar as solicitações pendentes" });
    }
  });

  app.post("/api/pedidos-de-peca", requirePedirPeca, async (req, res) => {
    try {
      const dados = novaSolicitacaoSchema.parse(req.body);
      const eventosPorId = new Map<string, any>();
      for (let i = 0; i < dados.linhas.length; i++) {
        const l = dados.linhas[i];
        const n = i + 1;
        let evento = eventosPorId.get(l.eventId);
        if (!evento) {
          evento = await storage.getEvent(l.eventId);
          if (!evento) return res.status(404).json({ error: `Peça ${n}: evento não encontrado` });
          const motivo = await motivoEventoDaPeca({ eventId: evento.id });
          if (motivo) return res.status(409).json({ error: `Peça ${n}: ${erroEventoFechado(motivo)}`, code: "EVENT_FINALIZED", reason: motivo });
          eventosPorId.set(l.eventId, evento);
        }
        const ids = semRepetir(l.sponsorIds);
        if (ids.length > 0) {
          const existentes = await db.select({ id: sponsors.id }).from(sponsors).where(inArray(sponsors.id, ids));
          if (existentes.length !== ids.length) return res.status(404).json({ error: `Peça ${n}: patrocinador não encontrado` });
          const vinculos = await db.select({ sponsorId: eventSponsors.sponsorId }).from(eventSponsors).where(eq(eventSponsors.eventId, evento.id));
          const doEvento = new Set(vinculos.map((v) => v.sponsorId));
          if (vinculos.length > 0 && ids.some((id) => !doEvento.has(id))) {
            return res.status(400).json({ error: `Peça ${n}: há patrocinador que não é de ${evento.name}.` });
          }
        }
      }

      const quem = quemAgiu(req);
      const pedido = await db.transaction(async (tx) => {
        const [cabecalho] = await tx.insert(pedidosDePeca).values({
          status: "aberto",
          pedidoPor: quem.userName,
          pedidoPorId: quem.userId,
        }).returning();
        await tx.insert(linhasDoPedidoDePeca).values(dados.linhas.map((l, ordem) => ({
          pedidoId: cabecalho.id,
          ordem,
          eventId: l.eventId,
          sponsorIds: semRepetir(l.sponsorIds),
          quantidade: l.quantidade,
          observacao: l.observacao,
          referencias: l.referencias,
          // Sem prazo informado, vale a saída do caminhão — é quando a peça
          // precisa estar pronta.
          precisaAte: l.precisaAte ? paraData(l.precisaAte) : (eventosPorId.get(l.eventId)?.truckDepartureDate ?? null),
          tipoDePeca: l.tipoDePeca || null,
          largura: paraDecimal(l.largura),
          altura: paraDecimal(l.altura),
        })));
        return cabecalho;
      });

      const resumo = dados.linhas.map((l, ordem) => nomeDaLinha({ tipoDePeca: l.tipoDePeca ?? null, ordem, quantidade: l.quantidade })).join("; ");
      await createAuditLog(req, "created", "pedido_de_peca", pedido.id,
        `Solicitação do Atendimento com ${dados.linhas.length} ${dados.linhas.length === 1 ? "peça" : "peças"}: ${resumo}`);
      const porEvento = new Map<string, number>();
      for (const l of dados.linhas) porEvento.set(l.eventId, (porEvento.get(l.eventId) ?? 0) + 1);
      for (const [eventId, qtd] of Array.from(porEvento.entries())) {
        await notificar({
          type: "pedidoDePeca",
          message: `Solicitação do Atendimento: ${qtd} ${qtd === 1 ? "peça" : "peças"} — Evento: ${eventosPorId.get(eventId)?.name ?? "—"}`,
          eventId,
          targetRoles: ["solicitacao", "admin"],
        });
        broadcast({ type: "pedidos_de_peca", eventId });
      }
      res.status(201).json(pedido);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      console.error("[pedidos] erro ao criar:", error);
      res.status(500).json({ error: "Erro ao enviar a solicitação" });
    }
  });

  // Cancelar a solicitação INTEIRA: só enquanto nenhuma peça foi resolvida.
  // Depois disso, cancela peça a peça (as abertas) ou pede ajuste.
  app.patch("/api/pedidos-de-peca/:id/cancelar", requirePedirPeca, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga por que a solicitação está sendo cancelada (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const [pedido] = await db.select().from(pedidosDePeca).where(eq(pedidosDePeca.id, req.params.id));
      if (!pedido || ehDeOutraPessoa(req, pedido)) return res.status(404).json({ error: "Solicitação não encontrada" });
      const linhas = await db.select().from(linhasDoPedidoDePeca).where(eq(linhasDoPedidoDePeca.pedidoId, pedido.id));
      if (statusDaSolicitacao(linhas) !== "aberto") {
        return res.status(409).json({ error: "Quem monta a lista já agiu nesta solicitação — cancele só as peças que ainda estão abertas." });
      }
      const quem = quemAgiu(req);
      const canceladas = await db.update(linhasDoPedidoDePeca)
        .set({ status: "cancelado", motivoCancelamento: motivo, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(linhasDoPedidoDePeca.pedidoId, pedido.id), eq(linhasDoPedidoDePeca.status, "aberto")))
        .returning();
      await sincronizarStatus(pedido.id);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `Solicitação cancelada por ${quem.userName}: ${motivo}`);
      const eventos = Array.from(new Set(canceladas.map((l) => l.eventId)));
      for (const eventId of eventos) {
        const evento = await storage.getEvent(eventId);
        await notificar({
          type: "pedidoCancelado",
          message: `Solicitação cancelada pelo Atendimento (${evento?.name ?? "—"}): ${motivo}`,
          eventId,
          targetRoles: ["solicitacao", "admin"],
        });
        broadcast({ type: "pedidos_de_peca", eventId });
      }
      if (pedido.pedidoPorId && pedido.pedidoPorId !== quem.userId && eventos[0]) {
        await notificar({ type: "pedidoCancelado", message: `${quem.userName} cancelou a sua solicitação: ${motivo}`, eventId: eventos[0], ...paraQuemPediu(pedido) });
      }
      res.json({ ok: true, canceladas: canceladas.length });
    } catch (error) {
      console.error("[pedidos] erro ao cancelar solicitação:", error);
      res.status(500).json({ error: "Erro ao cancelar a solicitação" });
    }
  });

  // ─── Ações por peça solicitada ─────────────────────────────────────────────

  app.patch("/api/pedidos-de-peca/linhas/:linhaId/atender", requireResolverPedido, async (req, res) => {
    try {
      const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
      if (!itemId) return res.status(400).json({ error: "Escolha a peça que atende esta solicitação." });
      const r = await vincularPecaALinha(req, req.params.linhaId, itemId);
      if (r.erro) return res.status(r.status).json({ error: r.erro });
      res.json(r.linha);
    } catch (error) {
      console.error("[pedidos] erro ao atender:", error);
      res.status(500).json({ error: "Erro ao atender a solicitação" });
    }
  });

  app.patch("/api/pedidos-de-peca/linhas/:linhaId/recusar", requireResolverPedido, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga ao Atendimento por que a peça foi recusada (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const carregada = await carregarLinha(req.params.linhaId);
      if (!carregada) return res.status(404).json({ error: NAO_ENCONTRADA });
      const { linha, pedido } = carregada;
      const quem = quemAgiu(req);
      const [recusada] = await db.update(linhasDoPedidoDePeca)
        .set({ status: "recusado", motivoRecusa: motivo, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(linhasDoPedidoDePeca.id, linha.id), eq(linhasDoPedidoDePeca.status, "aberto")))
        .returning();
      if (!recusada) return res.status(409).json({ error: "Esta peça solicitada não está mais aberta." });
      await sincronizarStatus(pedido.id);

      const evento = await storage.getEvent(linha.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `${nomeDaLinha(linha)}: recusada — ${motivo}`);
      await notificar({
        type: "pedidoRecusado",
        message: `Uma peça da sua solicitação foi recusada (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${motivo}`,
        eventId: linha.eventId,
        ...paraQuemPediu(pedido),
      });
      broadcast({ type: "pedidos_de_peca", eventId: linha.eventId });
      res.json(recusada);
    } catch (error) {
      console.error("[pedidos] erro ao recusar:", error);
      res.status(500).json({ error: "Erro ao recusar a peça" });
    }
  });

  // Atendimento cancela só as próprias e só enquanto a peça está aberta; o
  // admin cancela qualquer uma, e aí quem pediu é avisado.
  app.patch("/api/pedidos-de-peca/linhas/:linhaId/cancelar", requirePedirPeca, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga por que a peça está sendo cancelada (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const carregada = await carregarLinha(req.params.linhaId);
      if (!carregada || ehDeOutraPessoa(req, carregada.pedido)) return res.status(404).json({ error: NAO_ENCONTRADA });
      const { linha, pedido } = carregada;
      const quem = quemAgiu(req);
      const [cancelada] = await db.update(linhasDoPedidoDePeca)
        .set({ status: "cancelado", motivoCancelamento: motivo, resolvidoPor: quem.userName, resolvidoPorId: quem.userId, resolvidoEm: new Date(), updatedAt: new Date() })
        .where(and(eq(linhasDoPedidoDePeca.id, linha.id), eq(linhasDoPedidoDePeca.status, "aberto")))
        .returning();
      if (!cancelada) return res.status(409).json({ error: "Quem monta a lista já agiu nesta peça — não dá mais para cancelar. Se precisa mudar algo, peça um ajuste." });
      await sincronizarStatus(pedido.id);

      const evento = await storage.getEvent(linha.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `${nomeDaLinha(linha)}: cancelada por ${quem.userName} — ${motivo}`);
      await notificar({
        type: "pedidoCancelado",
        message: `Peça solicitada cancelada pelo Atendimento (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${motivo}`,
        eventId: linha.eventId,
        targetRoles: ["solicitacao", "admin"],
      });
      if (pedido.pedidoPorId && pedido.pedidoPorId !== quem.userId) {
        await notificar({
          type: "pedidoCancelado",
          message: `${quem.userName} cancelou uma peça da sua solicitação (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${motivo}`,
          eventId: linha.eventId,
          ...paraQuemPediu(pedido),
        });
      }
      broadcast({ type: "pedidos_de_peca", eventId: linha.eventId });
      res.json(cancelada);
    } catch (error) {
      console.error("[pedidos] erro ao cancelar:", error);
      res.status(500).json({ error: "Erro ao cancelar a peça" });
    }
  });

  app.patch("/api/pedidos-de-peca/linhas/:linhaId/reabrir", requireReabrirPedido, async (req, res) => {
    try {
      const motivo = lerMotivo(req.body);
      if (motivo.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga por que a peça está sendo reaberta (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const carregada = await carregarLinha(req.params.linhaId);
      if (!carregada || ehDeOutraPessoa(req, carregada.pedido)) return res.status(404).json({ error: NAO_ENCONTRADA });
      const { linha, pedido } = carregada;
      const papeis = quemReabre(linha.status);
      if (papeis.length === 0) {
        return res.status(409).json({ error: linha.status === "aberto" ? "Esta peça já está aberta." : "Peça atendida não se reabre na mão — se a peça criada estiver errada, exclua-a e a solicitação volta a ficar aberta." });
      }
      if (!papeis.includes((req as any).userRole)) {
        return res.status(403).json({
          error: linha.status === "cancelado"
            ? "Reabrir peça cancelada é do Atendimento e do admin."
            : "Reabrir peça recusada é do perfil Solicitação e do admin.",
        });
      }
      const motivoFim = await motivoEventoDaPeca({ eventId: linha.eventId });
      if (motivoFim) return res.status(409).json({ error: erroEventoFechado(motivoFim) });

      const [reaberta] = await db.update(linhasDoPedidoDePeca)
        .set({ status: "aberto", resolvidoPor: null, resolvidoPorId: null, resolvidoEm: null, motivoRecusa: null, motivoCancelamento: null, ...AJUSTE_LIMPO, updatedAt: new Date() })
        .where(and(eq(linhasDoPedidoDePeca.id, linha.id), eq(linhasDoPedidoDePeca.status, linha.status)))
        .returning();
      if (!reaberta) return res.status(409).json({ error: "Esta peça acabou de mudar de estado — atualize a tela." });
      await sincronizarStatus(pedido.id);

      const quem = quemAgiu(req);
      const evento = await storage.getEvent(linha.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `${nomeDaLinha(linha)}: reaberta (estava ${rotulo(linha.status)}) — ${motivo}`);
      if (linha.status === "cancelado") {
        await notificar({
          type: "pedidoReaberto",
          message: `Peça solicitada reaberta pelo Atendimento (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${motivo}`,
          eventId: linha.eventId,
          targetRoles: ["solicitacao", "admin"],
        });
      } else {
        await notificar({
          type: "pedidoReaberto",
          message: `${quem.userName} reabriu uma peça da sua solicitação (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${motivo}`,
          eventId: linha.eventId,
          ...paraQuemPediu(pedido),
        });
      }
      broadcast({ type: "pedidos_de_peca", eventId: linha.eventId });
      res.json(reaberta);
    } catch (error) {
      console.error("[pedidos] erro ao reabrir:", error);
      res.status(500).json({ error: "Erro ao reabrir a peça" });
    }
  });

  // AJUSTE (dono, 14/09): depois que a Solicitação agiu, o Atendimento não
  // edita nem cancela — pede um ajuste por escrito, e quem monta a lista aceita
  // ou recusa. Um ajuste esperando resposta por peça.
  app.patch("/api/pedidos-de-peca/linhas/:linhaId/ajuste", requirePedirPeca, async (req, res) => {
    try {
      const texto = typeof req.body?.texto === "string" ? req.body.texto.trim() : "";
      if (texto.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Descreva o ajuste (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      if (texto.length > 2000) return res.status(400).json({ error: "O ajuste passou de 2000 caracteres." });
      const carregada = await carregarLinha(req.params.linhaId);
      if (!carregada || ehDeOutraPessoa(req, carregada.pedido)) return res.status(404).json({ error: NAO_ENCONTRADA });
      const { linha, pedido } = carregada;
      if (!podePedirAjuste(linha)) {
        return res.status(409).json({
          error: linha.ajusteStatus === "pendente"
            ? "Já existe um ajuste esperando resposta de quem monta a lista."
            : linha.status === "aberto"
              ? "A peça ainda está aberta — se algo está errado, cancele e crie outra."
              : `Só dá para pedir ajuste em peça atendida — esta está ${rotulo(linha.status)}.`,
        });
      }
      const quem = quemAgiu(req);
      const [atualizada] = await db.update(linhasDoPedidoDePeca)
        .set({
          ...AJUSTE_LIMPO,
          ajusteStatus: "pendente", ajusteTexto: texto, ajustePedidoPor: quem.userName, ajustePedidoPorId: quem.userId, ajustePedidoEm: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(linhasDoPedidoDePeca.id, linha.id), eq(linhasDoPedidoDePeca.status, "atendido"), or(isNull(linhasDoPedidoDePeca.ajusteStatus), ne(linhasDoPedidoDePeca.ajusteStatus, "pendente"))))
        .returning();
      if (!atualizada) return res.status(409).json({ error: "Esta peça acabou de mudar — atualize a tela." });

      const evento = await storage.getEvent(linha.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id, `${nomeDaLinha(linha)}: ajuste solicitado por ${quem.userName} — ${texto}`);
      await notificar({
        type: "pedidoAjuste",
        message: `Ajuste solicitado pelo Atendimento (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${texto}`,
        eventId: linha.eventId,
        targetRoles: ["solicitacao", "admin"],
      });
      broadcast({ type: "pedidos_de_peca", eventId: linha.eventId });
      res.json(atualizada);
    } catch (error) {
      console.error("[pedidos] erro ao pedir ajuste:", error);
      res.status(500).json({ error: "Erro ao pedir o ajuste" });
    }
  });

  app.patch("/api/pedidos-de-peca/linhas/:linhaId/ajuste/responder", requireResolverPedido, async (req, res) => {
    try {
      const aceitar = req.body?.aceitar === true;
      const resposta = lerMotivo(req.body);
      if (!aceitar && resposta.length < MIN_MOTIVO_DO_PEDIDO) {
        return res.status(400).json({ error: `Diga ao Atendimento por que o ajuste foi recusado (mínimo ${MIN_MOTIVO_DO_PEDIDO} caracteres).` });
      }
      const carregada = await carregarLinha(req.params.linhaId);
      if (!carregada) return res.status(404).json({ error: NAO_ENCONTRADA });
      const { linha, pedido } = carregada;
      const quem = quemAgiu(req);
      const [respondida] = await db.update(linhasDoPedidoDePeca)
        .set({ ajusteStatus: aceitar ? "aceito" : "recusado", ajusteRespondidoPor: quem.userName, ajusteRespondidoEm: new Date(), ajusteResposta: resposta || null, updatedAt: new Date() })
        .where(and(eq(linhasDoPedidoDePeca.id, linha.id), eq(linhasDoPedidoDePeca.ajusteStatus, "pendente")))
        .returning();
      if (!respondida) return res.status(409).json({ error: "Não há ajuste esperando resposta nesta peça." });

      const evento = await storage.getEvent(linha.eventId);
      await createAuditLog(req, "updated", "pedido_de_peca", pedido.id,
        aceitar
          ? `${nomeDaLinha(linha)}: ajuste aceito por ${quem.userName}${resposta ? ` — ${resposta}` : ""}`
          : `${nomeDaLinha(linha)}: ajuste recusado por ${quem.userName} — ${resposta}`);
      await notificar({
        type: aceitar ? "pedidoAjusteAceito" : "pedidoAjusteRecusado",
        message: aceitar
          ? `Seu ajuste foi aceito (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}) — quem monta a lista vai ajustar a peça.`
          : `Seu ajuste foi recusado (${nomeDaLinha(linha)} — ${evento?.name ?? "—"}): ${resposta}`,
        eventId: linha.eventId,
        ...(linha.ajustePedidoPorId
          ? { targetRoles: ["atendimento", "admin"], targetUserId: linha.ajustePedidoPorId }
          : paraQuemPediu(pedido)),
      });
      broadcast({ type: "pedidos_de_peca", eventId: linha.eventId });
      res.json(respondida);
    } catch (error) {
      console.error("[pedidos] erro ao responder ajuste:", error);
      res.status(500).json({ error: "Erro ao responder o ajuste" });
    }
  });
}
