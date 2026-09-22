// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR NO ESTOQUE E RESERVAR (dono, 14/09).
//
// Quem monta a lista cria a peça e vê se o estoque já tem uma igual: mesmo
// tipo, mesma medida, e patrocinador igual ou nenhum (as regras moram em
// shared/estoque.ts). Para cada peça do estoque a resposta diz ONDE ela está
// e SE chega a tempo — no galpão, em uso noutro evento, esperando triagem,
// separada para o evento de origem, em manutenção.
//
// A reserva é uma linha em event_inventory_allocations com a peça de destino.
// Ela SÓ SEGURA a peça física: não mexe no status da peça nova nem no
// reaproveitamento — quem decide usar é a Gráfica, na fila dela, como sempre.
// Quando o caminhão do evento sai, o ciclo já existente leva as reservadas
// junto (markAssetsInUseForEvent lê as alocações do evento).
//
// Peças do estoque cadastradas à mão, sem peça de origem, ficam de fora: sem
// origem não há tipo nem medida para comparar.
//
// Papéis: reservar e liberar são da Solicitação e do admin — 8.845 das 8.850
// peças criadas nos últimos 60 dias vieram da Solicitação. Ler é de todos.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "../db";
import {
  inventoryAssets,
  eventInventoryAllocations,
  items as itemsTable,
  events,
  itemSponsors,
} from "@shared/schema";
import {
  classificarDisponibilidade,
  compararLotes,
  mesmaMedida,
  normalizarTipo,
  podeReservar,
  relacaoDePatrocinio,
  reservaEstaAtiva,
  temMedida,
  type Disponibilidade,
  type RelacaoDePatrocinio,
} from "@shared/estoque";
import { requireAuth, requireRole, broadcast, createAuditLog, createAuditLogsEmLote } from "./shared";

// 15/09: Estoque é só do admin.
const requireReservaDeEstoque = requireRole("admin");

/** Peça cancelada ou entregue não precisa mais de estoque. */
export const STATUS_SEM_ESTOQUE = new Set(["cancelled", "canceled", "cancelado", "delivered", "entregue"]);

/** Teto de cada lista do recorte de GET /api/estoque/usos. */
export const LIMITE_DO_RECORTE_DE_USOS = 500;

/** "a,b,c" (ou ?x=a&x=b) → ids únicos, sem vazios. */
export function unicosDaQuery(v: unknown): string[] {
  const partes = (Array.isArray(v) ? v : [v]).flatMap((x) => (typeof x === "string" ? x.split(",") : []));
  return Array.from(new Set(partes.map((x) => x.trim()).filter(Boolean)));
}

const erro = (httpStatus: number, message: string) => Object.assign(new Error(message), { httpStatus });

type Exec = any;

const COLUNAS_DO_ATIVO = {
  id: inventoryAssets.id,
  displayId: inventoryAssets.displayId,
  situacao: inventoryAssets.trackingStatus,
  condicao: inventoryAssets.condition,
  quantidade: inventoryAssets.quantity,
  sponsorIds: inventoryAssets.sponsorIds,
  thumb: inventoryAssets.approvalThumbUrl,
  origemItemId: itemsTable.id,
  origemDisplayId: itemsTable.displayId,
  origemTipo: itemsTable.type,
  origemDescricao: itemsTable.description,
  origemLargura: itemsTable.visualWidth,
  origemAltura: itemsTable.visualHeight,
  origemEventId: events.id,
  origemEventName: events.name,
  origemInicio: events.startDate,
};

export type Ativo = {
  id: string; displayId: string; situacao: string; condicao: string;
  quantidade: number; sponsorIds: string[] | null; thumb: string | null;
  origemItemId: string; origemDisplayId: string | null; origemTipo: string; origemDescricao: string | null;
  origemLargura: string | null; origemAltura: string | null;
  origemEventId: string | null; origemEventName: string | null; origemInicio: Date | null;
};

export type Reserva = {
  id: string; assetId: string; itemId: string | null; eventId: string; eventName: string;
  inicio: Date | null; saida: Date | null; reservadoPor: string | null; allocatedAt: Date; quantidade: number;
};

export type Peca = {
  id: string; displayId: string | null; type: string; quantity: number; status: string; deletedAt: Date | null;
  largura: string | null; altura: string | null; eventId: string; eventName: string | null;
  inicio: Date | null; saida: Date | null; sponsorIds: string[];
};

export async function carregarAtivos(exec: Exec, ids?: string[]): Promise<Ativo[]> {
  if (ids && ids.length === 0) return [];
  return exec.select(COLUNAS_DO_ATIVO).from(inventoryAssets)
    .innerJoin(itemsTable, eq(itemsTable.id, inventoryAssets.originalItemId))
    .leftJoin(events, eq(events.id, itemsTable.eventId))
    .where(ids ? inArray(inventoryAssets.id, ids) : ne(inventoryAssets.trackingStatus, "DESCARTADO"));
}

export async function carregarReservasAtivas(
  exec: Exec,
  agora: Date,
  filtro: { assetIds?: string[]; itemId?: string } = {},
): Promise<Reserva[]> {
  const condicoes = [];
  if (filtro.assetIds) {
    if (filtro.assetIds.length === 0) return [];
    condicoes.push(inArray(eventInventoryAllocations.assetId, filtro.assetIds));
  }
  if (filtro.itemId) condicoes.push(eq(eventInventoryAllocations.itemId, filtro.itemId));
  const consulta = exec.select({
    id: eventInventoryAllocations.id,
    assetId: eventInventoryAllocations.assetId,
    itemId: eventInventoryAllocations.itemId,
    eventId: eventInventoryAllocations.eventId,
    eventName: events.name,
    inicio: events.startDate,
    saida: events.truckDepartureDate,
    reservadoPor: eventInventoryAllocations.reservadoPor,
    allocatedAt: eventInventoryAllocations.allocatedAt,
    quantidade: inventoryAssets.quantity,
  })
    .from(eventInventoryAllocations)
    .innerJoin(events, eq(events.id, eventInventoryAllocations.eventId))
    .innerJoin(inventoryAssets, eq(inventoryAssets.id, eventInventoryAllocations.assetId));
  const linhas: Reserva[] = condicoes.length ? await consulta.where(and(...condicoes)) : await consulta;
  return linhas.filter((r) => reservaEstaAtiva(r.inicio, agora));
}

export async function carregarPecas(exec: Exec, filtro: { itemId: string } | { eventId: string }): Promise<Peca[]> {
  const linhas = await exec.select({
    id: itemsTable.id,
    displayId: itemsTable.displayId,
    type: itemsTable.type,
    quantity: itemsTable.quantity,
    status: itemsTable.status,
    deletedAt: itemsTable.deletedAt,
    largura: itemsTable.visualWidth,
    altura: itemsTable.visualHeight,
    eventId: itemsTable.eventId,
    eventName: events.name,
    inicio: events.startDate,
    saida: events.truckDepartureDate,
  })
    .from(itemsTable)
    .leftJoin(events, eq(events.id, itemsTable.eventId))
    .where("itemId" in filtro ? eq(itemsTable.id, filtro.itemId) : eq(itemsTable.eventId, filtro.eventId));
  if (linhas.length === 0) return [];
  const vinculos: Array<{ itemId: string; sponsorId: string }> = await exec
    .select({ itemId: itemSponsors.itemId, sponsorId: itemSponsors.sponsorId })
    .from(itemSponsors)
    .where(inArray(itemSponsors.itemId, linhas.map((l: any) => l.id)));
  const porPeca = new Map<string, string[]>();
  for (const v of vinculos) {
    const lista = porPeca.get(v.itemId);
    if (lista) lista.push(v.sponsorId); else porPeca.set(v.itemId, [v.sponsorId]);
  }
  return linhas.map((l: any) => ({ ...l, sponsorIds: porPeca.get(l.id) ?? [] }));
}

/** A peça do estoque serve para esta peça? null = não é parecida. */
export function avaliar(peca: Peca, a: Ativo, reserva: Reserva | null, agora: Date, exigirSemelhanca = true) {
  if (a.origemItemId === peca.id) return null;
  const relacao = relacaoDePatrocinio(peca.sponsorIds, a.sponsorIds ?? []);
  // `exigirSemelhanca = false` (consulta de estoque, 21/09): a Gráfica achou a
  // peça com os próprios olhos na busca manual — o tipo digitado diferente não
  // pode barrar. A disponibilidade continua valendo igual.
  if (exigirSemelhanca) {
    if (normalizarTipo(a.origemTipo) !== normalizarTipo(peca.type)) return null;
    if (!mesmaMedida({ largura: peca.largura, altura: peca.altura }, { largura: a.origemLargura, altura: a.origemAltura })) return null;
    if (relacao === "diferente") return null;
  }
  return {
    relacao,
    ...classificarDisponibilidade({
      situacao: a.situacao,
      condicao: a.condicao,
      origem: { eventId: a.origemEventId, inicio: a.origemInicio },
      reserva: reserva ? { itemId: reserva.itemId, eventId: reserva.eventId, eventName: reserva.eventName } : null,
      destino: { itemId: peca.id, eventId: peca.eventId, saida: peca.saida, inicio: peca.inicio },
      agora,
    }),
  };
}

export const caminhaoJaSaiu = (peca: { saida: Date | null }, agora: Date) =>
  !!peca.saida && agora.getTime() >= new Date(peca.saida).getTime();

type Lote = {
  chave: string;
  disponibilidade: Disponibilidade;
  motivo: string;
  aviso: string | null;
  relacao: RelacaoDePatrocinio;
  condicao: string;
  situacao: string;
  voltaEm: Date | null;
  thumb: string | null;
  sponsorIds: string[];
  origem: { itemId: string; displayId: string | null; tipo: string; descricao: string | null; eventName: string | null; eventInicio: Date | null };
  ativos: Array<{ id: string; displayId: string; quantidade: number }>;
  quantidade: number;
};

/**
 * A RESERVA, dentro de uma transação de quem chama. É o único lugar que grava
 * reserva de peça: a rota de reservar (Estoque) e a resposta "temos" da
 * consulta de estoque (21/09) passam por aqui — mesmas travas, mesmas recusas.
 * Lança erro com `httpStatus`; quem chama traduz para a resposta.
 */
export async function reservarAtivosParaPeca(
  tx: Exec,
  e: { itemId: string; assetIds: string[]; quem: { userName?: string | null; userId?: string | null }; agora: Date; exigirSemelhanca?: boolean },
): Promise<{ peca: Peca; ativos: Ativo[] }> {
  const pedidos = e.assetIds;
  const { quem, agora } = e;
  const [peca] = await carregarPecas(tx, { itemId: e.itemId });
  if (!peca || peca.deletedAt) throw erro(404, "Peça não encontrada");
  if (STATUS_SEM_ESTOQUE.has(peca.status)) throw erro(409, "Peça cancelada ou já entregue não reserva estoque.");
  if (caminhaoJaSaiu(peca, agora)) {
    throw erro(409, "O caminhão deste evento já saiu — não dá mais para reservar peça do estoque para ele.");
  }

  // Trava as peças do estoque até o fim da transação: duas pessoas
  // reservando a mesma peça no mesmo segundo — a segunda espera e
  // encontra a reserva da primeira.
  await tx.select({ id: inventoryAssets.id }).from(inventoryAssets)
    .where(inArray(inventoryAssets.id, pedidos))
    .for("update");

  const ativos = await carregarAtivos(tx, pedidos);
  if (ativos.length !== pedidos.length) {
    throw erro(404, "Alguma peça escolhida não está mais no estoque — atualize a lista.");
  }
  const reservas = await carregarReservasAtivas(tx, agora, { assetIds: pedidos });
  const jaDaPeca = await carregarReservasAtivas(tx, agora, { itemId: peca.id });
  const unidadesJa = jaDaPeca.reduce((s, r) => s + r.quantidade, 0);
  const unidadesNovas = ativos.reduce((s, a) => s + a.quantidade, 0);
  if (unidadesJa + unidadesNovas > peca.quantity) {
    const cabe = Math.max(0, peca.quantity - unidadesJa);
    throw erro(409, `A peça tem ${peca.quantity} un. e já há ${unidadesJa} reservada(s) — dá para reservar mais ${cabe}.`);
  }

  const reservaPorAtivo = new Map(reservas.map((r) => [r.assetId, r]));
  const recusas: string[] = [];
  for (const a of ativos) {
    const s = avaliar(peca, a, reservaPorAtivo.get(a.id) ?? null, agora, e.exigirSemelhanca !== false);
    if (!s) recusas.push(`${a.displayId} não é do mesmo tipo e medida, ou tem outro patrocinador`);
    else if (s.reservadaAqui) recusas.push(`${a.displayId} já está reservada para esta peça`);
    else if (!podeReservar(s.disponibilidade)) recusas.push(`${a.displayId}: ${s.motivo}`);
  }
  if (recusas.length > 0) throw erro(409, `Não deu para reservar — ${recusas.join("; ")}.`);

  await tx.insert(eventInventoryAllocations).values(ativos.map((a) => ({
    eventId: peca.eventId,
    assetId: a.id,
    itemId: peca.id,
    reservadoPor: quem.userName ?? null,
    reservadoPorId: quem.userId ?? null,
  })));
  return { peca, ativos };
}

export function registerEstoqueReservasRoutes(app: Express): void {
  // Quantas peças parecidas cada peça do evento tem no estoque — o selo da
  // lista do evento. Uma leitura do acervo para o evento inteiro, não uma por
  // peça.
  app.get("/api/events/:eventId/estoque-resumo", requireAuth, async (req, res) => {
    try {
      const agora = new Date();
      const pecas = (await carregarPecas(db, { eventId: req.params.eventId }))
        .filter((p) => !p.deletedAt && !STATUS_SEM_ESTOQUE.has(p.status));
      if (pecas.length === 0) return res.json({});
      const [ativos, reservas] = await Promise.all([carregarAtivos(db), carregarReservasAtivas(db, agora)]);
      const reservaPorAtivo = new Map(reservas.map((r) => [r.assetId, r]));
      const porTipo = new Map<string, Ativo[]>();
      for (const a of ativos) {
        const tipo = normalizarTipo(a.origemTipo);
        const lista = porTipo.get(tipo);
        if (lista) lista.push(a); else porTipo.set(tipo, [a]);
      }

      const resumo: Record<string, { disponiveis: number; chegamATempo: number; faltaTriagem: number; reservadas: number }> = {};
      for (const p of pecas) {
        const conta = { disponiveis: 0, chegamATempo: 0, faltaTriagem: 0, reservadas: 0 };
        for (const r of reservas) if (r.itemId === p.id) conta.reservadas += r.quantidade;
        if (temMedida(p)) {
          for (const a of porTipo.get(normalizarTipo(p.type)) ?? []) {
            const s = avaliar(p, a, reservaPorAtivo.get(a.id) ?? null, agora);
            if (!s || s.reservadaAqui) continue;
            if (s.disponibilidade === "disponivel") conta.disponiveis += a.quantidade;
            else if (s.disponibilidade === "chega_a_tempo") conta.chegamATempo += a.quantidade;
            else if (s.disponibilidade === "falta_triagem") conta.faltaTriagem += a.quantidade;
          }
        }
        if (conta.disponiveis + conta.chegamATempo + conta.faltaTriagem + conta.reservadas > 0) resumo[p.id] = conta;
      }
      res.json(resumo);
    } catch (error) {
      console.error("[estoque] erro no resumo do evento:", error);
      res.status(500).json({ error: "Erro ao consultar o estoque" });
    }
  });

  // O que o estoque tem para UMA peça, agrupado em lotes (mesma peça de
  // origem, mesma situação e condição) — e o que já está reservado.
  app.get("/api/items/:id/estoque-semelhantes", requireAuth, async (req, res) => {
    try {
      const agora = new Date();
      const [peca] = await carregarPecas(db, { itemId: req.params.id });
      if (!peca || peca.deletedAt) return res.status(404).json({ error: "Peça não encontrada" });

      const [ativos, reservas] = await Promise.all([carregarAtivos(db), carregarReservasAtivas(db, agora)]);
      const reservaPorAtivo = new Map(reservas.map((r) => [r.assetId, r]));
      const ativoPorId = new Map(ativos.map((a) => [a.id, a]));

      const daPeca = reservas.filter((r) => r.itemId === peca.id);
      const foraDaLista = daPeca.filter((r) => !ativoPorId.has(r.assetId)).map((r) => r.assetId);
      for (const a of await carregarAtivos(db, foraDaLista)) ativoPorId.set(a.id, a);
      const saiu = caminhaoJaSaiu(peca, agora);

      const reservadas = daPeca.map((r) => {
        const a = ativoPorId.get(r.assetId);
        return {
          reservaId: r.id,
          assetId: r.assetId,
          displayId: a?.displayId ?? "—",
          situacao: a?.situacao ?? null,
          condicao: a?.condicao ?? null,
          quantidade: r.quantidade,
          thumb: a?.thumb ?? null,
          origem: a ? { displayId: a.origemDisplayId, eventName: a.origemEventName } : null,
          reservadoPor: r.reservadoPor,
          reservadoEm: r.allocatedAt,
          // Depois que o caminhão saiu com ela, a reserva virou uso.
          podeLiberar: !(saiu && a?.situacao === "EM_USO"),
        };
      });

      const lotes = new Map<string, Lote>();
      if (temMedida(peca)) {
        for (const a of ativos) {
          const s = avaliar(peca, a, reservaPorAtivo.get(a.id) ?? null, agora);
          if (!s || s.reservadaAqui) continue;
          // Sem o local na chave (dono, 21/09: o sistema não guarda ONDE a peça
          // fica no galpão) — peças iguais com locais antigos diferentes
          // ficavam em lotes separados.
          const chave = [a.origemItemId, s.disponibilidade, s.motivo, a.condicao, a.situacao, s.relacao].join("|");
          let lote = lotes.get(chave);
          if (!lote) {
            lote = {
              chave,
              disponibilidade: s.disponibilidade,
              motivo: s.motivo,
              aviso: s.aviso,
              relacao: s.relacao,
              condicao: a.condicao,
              situacao: a.situacao,
              voltaEm: s.voltaEm,
              thumb: a.thumb,
              sponsorIds: a.sponsorIds ?? [],
              origem: {
                itemId: a.origemItemId, displayId: a.origemDisplayId, tipo: a.origemTipo,
                descricao: a.origemDescricao, eventName: a.origemEventName, eventInicio: a.origemInicio,
              },
              ativos: [],
              quantidade: 0,
            };
            lotes.set(chave, lote);
          }
          lote.ativos.push({ id: a.id, displayId: a.displayId, quantidade: a.quantidade });
          lote.quantidade += a.quantidade;
        }
      }
      const lista = Array.from(lotes.values()).sort(compararLotes);
      for (const l of lista) l.ativos.sort((x, y) => x.displayId.localeCompare(y.displayId, "pt-BR", { numeric: true }));

      res.json({
        peca: {
          id: peca.id, displayId: peca.displayId, type: peca.type, largura: peca.largura, altura: peca.altura,
          quantity: peca.quantity, sponsorIds: peca.sponsorIds, eventId: peca.eventId, eventName: peca.eventName,
          saida: peca.saida,
        },
        semMedida: !temMedida(peca),
        caminhaoJaSaiu: saiu,
        podeReservar: !STATUS_SEM_ESTOQUE.has(peca.status) && !saiu,
        unidadesReservadas: reservadas.reduce((s, r) => s + r.quantidade, 0),
        reservadas,
        lotes: lista,
      });
    } catch (error) {
      console.error("[estoque] erro ao buscar semelhantes:", error);
      res.status(500).json({ error: "Erro ao consultar o estoque" });
    }
  });

  app.post("/api/items/:id/reservas", requireReservaDeEstoque, async (req, res) => {
    try {
      const pedidos: string[] = Array.isArray(req.body?.assetIds)
        ? Array.from(new Set<string>(req.body.assetIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)))
        : [];
      if (pedidos.length === 0) return res.status(400).json({ error: "Escolha ao menos uma peça do estoque." });
      if (pedidos.length > 500) return res.status(400).json({ error: "No máximo 500 peças por reserva." });

      const agora = new Date();
      const quem = { userName: (req as any).userName, userId: (req as any).userId ?? null };
      const { peca, ativos } = await db.transaction((tx) =>
        reservarAtivosParaPeca(tx, { itemId: req.params.id, assetIds: pedidos, quem, agora }));

      const codigos = ativos.map((a) => a.displayId).join(", ");
      const unidades = ativos.reduce((s, a) => s + a.quantidade, 0);
      await createAuditLog(req, "updated", "item", peca.id, `Reservou ${unidades} un. do estoque para esta peça: ${codigos}`);
      await createAuditLogsEmLote(req, ativos.map((a) => ({
        action: "reservado",
        entityType: "inventory_asset",
        entityId: a.id,
        details: JSON.stringify({ itemId: peca.id, peca: peca.displayId, evento: peca.eventName }),
      })));
      broadcast({ type: "estoque_reservas", itemId: peca.id, eventId: peca.eventId });
      res.status(201).json({ reservadas: unidades });
    } catch (error: any) {
      if (error?.httpStatus) return res.status(error.httpStatus).json({ error: error.message });
      console.error("[estoque] erro ao reservar:", error);
      res.status(500).json({ error: "Erro ao reservar peças do estoque" });
    }
  });

  app.delete("/api/items/:id/reservas/:reservaId", requireReservaDeEstoque, async (req, res) => {
    try {
      const [reserva] = await db.select({
        id: eventInventoryAllocations.id,
        itemId: eventInventoryAllocations.itemId,
        eventId: eventInventoryAllocations.eventId,
        assetId: eventInventoryAllocations.assetId,
        saida: events.truckDepartureDate,
        displayId: inventoryAssets.displayId,
        situacao: inventoryAssets.trackingStatus,
      })
        .from(eventInventoryAllocations)
        .innerJoin(events, eq(events.id, eventInventoryAllocations.eventId))
        .innerJoin(inventoryAssets, eq(inventoryAssets.id, eventInventoryAllocations.assetId))
        .where(eq(eventInventoryAllocations.id, req.params.reservaId));
      if (!reserva || reserva.itemId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada" });
      if (reserva.situacao === "EM_USO" && caminhaoJaSaiu(reserva, new Date())) {
        return res.status(409).json({ error: "Esta peça já saiu no caminhão deste evento — a reserva virou uso e não pode ser desfeita." });
      }
      await db.delete(eventInventoryAllocations).where(eq(eventInventoryAllocations.id, reserva.id));
      await createAuditLog(req, "updated", "item", req.params.id, `Liberou a reserva do estoque: ${reserva.displayId}`);
      await createAuditLog(req, "reserva_liberada", "inventory_asset", reserva.assetId, JSON.stringify({ itemId: req.params.id }));
      broadcast({ type: "estoque_reservas", itemId: req.params.id, eventId: reserva.eventId });
      res.json({ ok: true });
    } catch (error) {
      console.error("[estoque] erro ao liberar reserva:", error);
      res.status(500).json({ error: "Erro ao liberar a reserva" });
    }
  });

  // ONDE JÁ FOI USADO (dono, 21/09): "aparecer agrupados em quais eventos foi
  // usado / em quais itens já foi usado". LEITURA do acervo inteiro numa
  // consulta só (dois LEFT JOIN) — a tela agrupa por material e não pode pedir
  // o histórico peça por peça (seriam 5 mil chamadas). Fora de
  // /api/inventory/* para não cair na rota /api/inventory/:id. Mesmos papéis
  // das outras leituras do acervo. A peça de ORIGEM não vem daqui: a tela já
  // a conhece (originalItemId) e junta com isto em usosDoAtivo().
  //
  // RECORTE E PAPEL (revisão 22/09): só o Estoque chama esta rota, e o
  // Estoque é só do admin — então só o admin lê. E não devolve mais o acervo
  // inteiro: a tela pede os usos dos MATERIAIS que está mostrando —
  // `?itens=` (peças de origem; cobre todos os registros de cada material) e
  // `?ativos=` (registros sem peça de origem, cadastrados à mão). Sem recorte
  // nenhum = 400; cada lista tem teto.
  app.get("/api/estoque/usos", requireRole("admin"), async (req, res) => {
    try {
      const lista = (v: unknown) => unicosDaQuery(v);
      const itens = lista(req.query.itens);
      const ativos = lista(req.query.ativos);
      if (itens.length === 0 && ativos.length === 0) {
        return res.status(400).json({ error: "Diga de quais materiais (itens=) ou registros (ativos=) quer os usos." });
      }
      if (itens.length > LIMITE_DO_RECORTE_DE_USOS || ativos.length > LIMITE_DO_RECORTE_DE_USOS) {
        return res.status(400).json({ error: `No máximo ${LIMITE_DO_RECORTE_DE_USOS} materiais e ${LIMITE_DO_RECORTE_DE_USOS} registros por consulta.` });
      }
      const recorte = [
        ...(itens.length ? [inArray(inventoryAssets.originalItemId, itens)] : []),
        ...(ativos.length ? [inArray(eventInventoryAllocations.assetId, ativos)] : []),
      ];
      const linhas = await db
        .select({
          id: eventInventoryAllocations.id,
          assetId: eventInventoryAllocations.assetId,
          eventId: eventInventoryAllocations.eventId,
          eventName: events.name,
          inicio: events.startDate,
          itemId: eventInventoryAllocations.itemId,
          itemDisplayId: itemsTable.displayId,
          em: eventInventoryAllocations.allocatedAt,
        })
        .from(eventInventoryAllocations)
        .innerJoin(events, eq(events.id, eventInventoryAllocations.eventId))
        .innerJoin(inventoryAssets, eq(inventoryAssets.id, eventInventoryAllocations.assetId))
        .leftJoin(itemsTable, eq(itemsTable.id, eventInventoryAllocations.itemId))
        .where(recorte.length === 1 ? recorte[0] : or(...recorte));
      res.json(linhas);
    } catch (error) {
      console.error("[estoque] erro ao listar usos:", error);
      res.status(500).json({ error: "Erro ao listar onde as peças foram usadas" });
    }
  });

  // Reservas vigentes do acervo inteiro — o Estoque e a Triagem mostram
  // "reservada para o evento X, saída dd/mm". Fora de /api/inventory/* para
  // não cair na rota /api/inventory/:id.
  app.get("/api/estoque/reservas-ativas", requireAuth, async (_req, res) => {
    try {
      const reservas = await carregarReservasAtivas(db, new Date());
      const idsDePeca = Array.from(new Set(reservas.map((r) => r.itemId).filter((x): x is string => !!x)));
      const pecas = idsDePeca.length
        ? await db.select({ id: itemsTable.id, displayId: itemsTable.displayId }).from(itemsTable).where(inArray(itemsTable.id, idsDePeca))
        : [];
      const codigoDaPeca = new Map(pecas.map((p) => [p.id, p.displayId]));
      res.json(reservas.map((r) => ({
        reservaId: r.id,
        assetId: r.assetId,
        itemId: r.itemId,
        itemDisplayId: r.itemId ? codigoDaPeca.get(r.itemId) ?? null : null,
        eventId: r.eventId,
        eventName: r.eventName,
        saida: r.saida,
        inicio: r.inicio,
        reservadoPor: r.reservadoPor,
      })));
    } catch (error) {
      console.error("[estoque] erro ao listar reservas:", error);
      res.status(500).json({ error: "Erro ao listar reservas do estoque" });
    }
  });
}
