// Inventory-asset (acervo) routes: CRUD, triage, dispatch/return, allocations.
// Extracted from server/routes.ts (INVENTORY ASSETS section).
import type { Express } from "express";
import { z } from "zod";
import { and, desc, eq, getTableColumns, inArray, like } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  insertInventoryAssetSchema, inventoryAssets, auditLogs, eventInventoryAllocations, events, items as itemsTable, sponsors, itemSponsors,
} from "@shared/schema";
import { requireAuth, requireRole, broadcast, createAuditLog } from "./shared";
import { recusaDeTriagem, recusaPorReserva, reservaEstaAtiva } from "@shared/estoque";
import { ehForaDoFunil } from "@shared/fluxo-peca";
import { barraSeArquivado } from "../services/arquivamento";

// TRIAGEM SÓ DE QUEM ESTÁ AGUARDANDO (dono, 21/09). Antes as duas rotas
// aceitavam qualquer ativo: uma peça EM USO num evento podia ser "triada" de
// volta ao galpão, e duas pessoas triando a mesma pilha gravavam uma por cima
// da outra. A conferência vai NO WHERE do UPDATE (e não num SELECT antes):
// das duas requisições simultâneas, só uma encontra a linha ainda aguardando —
// a outra atualiza zero linhas e recebe 409.
const AGUARDANDO = "AGUARDANDO_TRIAGEM";
class JaTriada extends Error {}
class Reservado extends Error {
  constructor(message: string, readonly reserva?: { eventName: string; inicio: Date | null; itemDisplayId: string | null }) { super(message); }
}

/** "Esta peça está reservada para #0062 (Evento X)." */
const recusaPorReservaCurta = (r: { eventName: string; itemDisplayId: string | null }) =>
  `Esta peça está reservada para ${r.itemDisplayId ? `${r.itemDisplayId} (${r.eventName})` : `o evento ${r.eventName}`}.`;

// Escritas no acervo: Gráfica e admin (dono, 14/09 — quem recebe o material
// na volta do caminhão faz a triagem e registra onde guardou). Excluir peça e
// disparar saída/retorno à mão seguem só do admin. Leituras seguem abertas a
// qualquer autenticado (várias telas consultam o acervo).
// 15/09: Estoque e Triagem de Retorno são só do admin.
const requireInventoryWrite = requireRole("admin");
const requireInventoryAdmin = requireRole("admin");

// EM_USO e AGUARDANDO_TRIAGEM são definidos exclusivamente pelo ciclo do
// evento (dispatch/return/triage) — o CRUD genérico não pode gravá-los.
const CYCLE_ONLY_STATUSES = ["EM_USO", "AGUARDANDO_TRIAGEM"];
const cycleStatusError =
  "Status controlado pelo ciclo do evento (despacho, retorno e triagem) — escolha NO_GALPAO ou DESCARTADO.";

// Validação da triagem simples (condição + destino).
const triageSchema = z.object({
  condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]).optional(),
  notes: z.string().nullish(),
  trackingStatus: z.enum(["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"]).optional(),
  location: z.string().max(120).nullish(),
});

// Destino da triagem (14/09): "Manutenção" virou situação própria. Antes ela
// gravava NO_GALPAO + Avaria Leve, e a peça avariada seguia aparecendo como
// disponível para reaproveitar.
const destinoDaTriagem = (s?: string | null) =>
  s === "DESCARTADO" ? "DESCARTADO" : s === "EM_MANUTENCAO" ? "EM_MANUTENCAO" : "NO_GALPAO";

// SEM LOCAL NO GALPÃO (dono, 21/09): "não vamos ter informação de ONDE ele fica
// no galpão". A regra de 14/09 (voltar ao galpão exigia o local) caiu com a
// decisão — a tela não pede mais o campo, então exigir aqui travaria toda
// triagem para o Galpão. O campo continua ACEITO e gravado se vier (nenhuma
// coluna nem dado existente muda); só não é mais obrigatório.

// Validação de cada lote da triagem por quantidade.
const triageSplitSchema = z.object({
  splits: z
    .array(
      z.object({
        qty: z.number().int().min(1),
        condition: z.enum(["PERFEITO", "AVARIA_LEVE", "SUCATA"]),
        trackingStatus: z.enum(["NO_GALPAO", "EM_MANUTENCAO", "DESCARTADO"]),
        notes: z.string().nullish(),
        location: z.string().max(120).nullish(),
      }),
    )
    .min(1),
  // Local comum a todos os lotes (cada lote pode trazer o seu).
  location: z.string().max(120).nullish(),
});

/** `inArray` em fatias: a fila da triagem passa de 4 mil peças e o Postgres
 *  tem teto de parâmetros por consulta. */
async function emFatias<T>(ids: string[], ler: (fatia: string[]) => Promise<T[]>): Promise<T[]> {
  const saida: T[] = [];
  for (let i = 0; i < ids.length; i += 2000) saida.push(...(await ler(ids.slice(i, i + 2000))));
  return saida;
}
const unicos = (xs: (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x)));

/** RESERVA NÃO SOBREVIVE À TRIAGEM (revisão 22/09): a alocação vigente do
 *  ativo (evento que ainda não acabou — a mesma régua de reservaEstaAtiva).
 *  Chamada com a linha do ativo JÁ travada (FOR UPDATE): a rota de reservar
 *  trava a mesma linha, então as duas não se cruzam. */
export async function reservaVigenteDoAtivo(exec: any, assetId: string, agora = new Date()) {
  const linhas: {
    eventName: string; inicio: Date | null; itemDisplayId: string | null;
    itemId?: string | null; pecaStatus?: string | null; pecaExcluidaEm?: Date | null; eventoArquivadoEm?: Date | null;
  }[] = await exec
    .select({
      eventName: events.name, inicio: events.startDate, itemDisplayId: itemsTable.displayId,
      itemId: eventInventoryAllocations.itemId, pecaStatus: itemsTable.status, pecaExcluidaEm: itemsTable.deletedAt,
      eventoArquivadoEm: events.arquivadoEm,
    })
    .from(eventInventoryAllocations)
    .innerJoin(events, eq(events.id, eventInventoryAllocations.eventId))
    .leftJoin(itemsTable, eq(itemsTable.id, eventInventoryAllocations.itemId))
    .where(eq(eventInventoryAllocations.assetId, assetId));
  // Reserva de peça cancelada/excluída não segura nada (a mesma régua de
  // carregarReservasAtivas).
  // Evento arquivado também não segura.
  const r = linhas.find((l) => reservaEstaAtiva(l.inicio, agora) && !l.eventoArquivadoEm
    && (!l.itemId || (!l.pecaExcluidaEm && !ehForaDoFunil(l.pecaStatus))));
  return r ? { eventName: r.eventName, inicio: r.inicio, itemDisplayId: r.itemDisplayId } : null;
}

/** Aviso em tempo real de mudança no acervo (o cliente invalida as telas do estoque). */
const avisarAcervo = (assetId: string, acao: "criado" | "atualizado" | "excluido") =>
  broadcast({ type: "inventory_changed", assetId, acao });

/** Trava a linha do ativo até o fim da transação e diz a situação atual. */
async function travarAtivo(tx: any, id: string): Promise<string | null> {
  const [linha] = await tx.select({ situacao: inventoryAssets.trackingStatus }).from(inventoryAssets)
    .where(eq(inventoryAssets.id, id)).for("update");
  return linha?.situacao ?? null;
}

export function registerInventoryRoutes(app: Express): void {
  // ============ INVENTORY ASSETS (ACERVO) ============

  // `origemEventId` (revisão 22/09): o evento da peça de origem vem JUNTO. O
  // Estoque baixava /api/items inteiro (MBs) só para ligar ativo a evento — e,
  // enquanto não chegava, a chave dos grupos mudava e as linhas abertas
  // fechavam sozinhas.
  app.get("/api/inventory", requireAuth, async (req, res) => {
    try {
      const assets = await db
        .select({ ...getTableColumns(inventoryAssets), origemEventId: itemsTable.eventId })
        .from(inventoryAssets)
        .leftJoin(itemsTable, eq(itemsTable.id, inventoryAssets.originalItemId))
        .orderBy(desc(inventoryAssets.createdAt));
      res.json(assets);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: "Erro ao buscar acervo" });
    }
  });

  app.get("/api/inventory/available/:franchise", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getAvailableAssetsByFranchise(req.params.franchise);
      res.json(assets);
    } catch (error) {
      console.error("Error fetching available assets:", error);
      res.status(500).json({ error: "Erro ao buscar peças disponíveis" });
    }
  });

  // Must be before /:id to avoid being swallowed by that route
  // SÓ AS PEÇAS DE ORIGEM (revisão 22/09): lia getAllItems() inteiro — e
  // cada peça triada, em qualquer aba, disparava esta leitura de novo. Agora
  // lê só as colunas que o enriquecimento usa, só das peças/eventos/
  // patrocinadores que a fila cita.
  app.get("/api/inventory/awaiting-triage", requireAuth, async (req, res) => {
    try {
      const assets = await storage.getAssetsAwaitingTriage();
      const origens = await emFatias(unicos(assets.map((a) => a.originalItemId)), (ids) =>
        db.select({ id: itemsTable.id, eventId: itemsTable.eventId }).from(itemsTable).where(inArray(itemsTable.id, ids)));
      const itemMap = new Map(origens.map((i) => [i.id, i]));
      const eventos = await emFatias(unicos(origens.map((i) => i.eventId)), (ids) =>
        db.select({ id: events.id, name: events.name, startDate: events.startDate }).from(events).where(inArray(events.id, ids)));
      const eventMap = new Map(eventos.map((e) => [e.id, e]));
      const patrocinadores = await emFatias(unicos(assets.flatMap((a) => a.sponsorIds ?? [])), (ids) =>
        db.select({ id: sponsors.id, name: sponsors.name }).from(sponsors).where(inArray(sponsors.id, ids)));
      const sponsorMap = Object.fromEntries(patrocinadores.map((s) => [s.id, s]));
      const enriched = assets.map(asset => {
        const item = asset.originalItemId ? itemMap.get(asset.originalItemId) : null;
        const event = item ? eventMap.get(item.eventId) : null;
        const sponsors = (asset.sponsorIds ?? [])
          .map(sid => sponsorMap[sid])
          .filter(Boolean)
          .map(s => ({ id: s.id, name: s.name }));
        return {
          ...asset,
          eventId: event?.id ?? null,
          eventName: event?.name ?? null,
          eventDate: event?.startDate ?? null,
          sponsors,
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("[triagem] erro ao listar a fila:", error);
      res.status(500).json({ error: "Não foi possível carregar a fila da triagem agora. Tente de novo em instantes." });
    }
  });

  app.get("/api/inventory/:id/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getAssetAllocations(req.params.id);
      res.json(allocations);
    } catch (error) {
      console.error("Error fetching asset allocations:", error);
      res.status(500).json({ error: "Erro ao buscar histórico de eventos" });
    }
  });

  // A peça de ORIGEM de um ativo, para o detalhe do Estoque (tipo, material,
  // medida, patrocinadores). Uma peça só, pedida quando o detalhe abre — no
  // lugar de /api/items inteiro. A Triagem usa a mesma rota.
  app.get("/api/inventory/:id/origem", requireAuth, async (req, res) => {
    try {
      const [peca] = await db
        .select({
          id: itemsTable.id, displayId: itemsTable.displayId, eventId: itemsTable.eventId, type: itemsTable.type,
          material: itemsTable.material, finish: itemsTable.finish, measurement: itemsTable.measurement,
          visualWidth: itemsTable.visualWidth, visualHeight: itemsTable.visualHeight, quantity: itemsTable.quantity,
          calculatedM2: itemsTable.calculatedM2,
        })
        .from(inventoryAssets)
        .innerJoin(itemsTable, eq(itemsTable.id, inventoryAssets.originalItemId))
        .where(eq(inventoryAssets.id, req.params.id));
      if (!peca) return res.json(null);
      const patrocinadores = await db.select({ id: sponsors.id, name: sponsors.name })
        .from(itemSponsors).innerJoin(sponsors, eq(sponsors.id, itemSponsors.sponsorId))
        .where(eq(itemSponsors.itemId, peca.id));
      res.json({ ...peca, sponsors: patrocinadores });
    } catch (error) {
      console.error("Error fetching asset origin:", error);
      res.status(500).json({ error: "Erro ao buscar a peça de origem" });
    }
  });

  app.get("/api/inventory/:id", requireAuth, async (req, res) => {
    try {
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Peça não encontrada" });
      res.json(asset);
    } catch (error) {
      console.error("[estoque] erro ao buscar ativo:", error);
      res.status(500).json({ error: "Não foi possível carregar a peça do estoque agora." });
    }
  });

  app.post("/api/inventory", requireInventoryWrite, async (req, res) => {
    try {
      // Valida contra o schema para impedir mass-assignment de colunas
      // arbitrárias (displayId, trackingStatus fora do enum, etc.).
      const data = insertInventoryAssetSchema.parse(req.body);
      if (data.trackingStatus && CYCLE_ONLY_STATUSES.includes(data.trackingStatus)) {
        return res.status(400).json({ error: cycleStatusError });
      }
      const asset = await storage.createInventoryAsset(data as any);
      avisarAcervo(asset.id, "criado");
      res.status(201).json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      console.error("Error creating inventory asset:", error);
      res.status(500).json({ error: "Erro ao criar peça no acervo" });
    }
  });

  app.patch("/api/inventory/:id", requireInventoryWrite, async (req, res) => {
    try {
      const data = insertInventoryAssetSchema.partial().parse(req.body);
      if (data.trackingStatus && CYCLE_ONLY_STATUSES.includes(data.trackingStatus)) {
        return res.status(400).json({ error: cycleStatusError });
      }
      // Manutenção/descarte de peça RESERVADA: recusa. A reserva ficaria
      // valendo sobre material indisponível — e a peça iria no caminhão do
      // evento que a reservou. Libere a reserva antes.
      const saiDoGalpao = !!data.trackingStatus && data.trackingStatus !== "NO_GALPAO";
      const asset = await db.transaction(async (tx) => {
        if (saiDoGalpao) {
          const atual = await travarAtivo(tx, req.params.id);
          if (atual === null) return undefined;
          const reserva = await reservaVigenteDoAtivo(tx, req.params.id);
          if (reserva) throw new Reservado(`${recusaPorReservaCurta(reserva)} Libere a reserva antes de mandar para manutenção ou descarte.`, reserva);
        }
        const [linha] = await tx.update(inventoryAssets)
          .set({ ...data, updatedAt: new Date() } as any)
          .where(eq(inventoryAssets.id, req.params.id))
          .returning();
        return linha;
      });
      if (!asset) return res.status(404).json({ error: "Peça não encontrada" });
      avisarAcervo(asset.id, "atualizado");
      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      if (error instanceof Reservado) return res.status(409).json({ error: error.message, code: "ATIVO_RESERVADO", reserva: error.reserva });
      console.error("Error updating inventory asset:", error);
      res.status(500).json({ error: "Erro ao atualizar peça" });
    }
  });

  app.delete("/api/inventory/:id", requireInventoryAdmin, async (req, res) => {
    try {
      // Excluir peça reservada apagaria a reserva em cascata sem ninguém
      // saber: a peça de destino ficaria sem o material que contava ter.
      const reserva = await reservaVigenteDoAtivo(db, req.params.id);
      if (reserva) {
        return res.status(409).json({
          error: `${recusaPorReservaCurta(reserva)} Libere a reserva antes de excluir.`,
          code: "ATIVO_RESERVADO", reserva,
        });
      }
      const success = await storage.deleteInventoryAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Peça não encontrada" });
      avisarAcervo(req.params.id, "excluido");
      res.json({ success: true });
    } catch (error) {
      console.error("[estoque] erro ao excluir ativo:", error);
      res.status(500).json({ error: "Não foi possível excluir a peça do estoque agora. Tente de novo em instantes." });
    }
  });

  // Triage endpoint: update condition + set back to NO_GALPAO (or DESCARTADO)
  app.patch("/api/inventory/:id/triage", requireInventoryWrite, async (req, res) => {
    try {
      const { condition, notes, trackingStatus, location } = triageSchema.parse(req.body);
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });
      const newStatus = destinoDaTriagem(trackingStatus);
      const local = (location ?? "").trim() || asset.location || null;
      const updated = await db.transaction(async (tx) => {
        // Descartar/Manutenção de peça RESERVADA: recusa (a reserva ficaria
        // valendo sobre estoque que não existe). Galpão mantém a reserva
        // verdadeira, então não consulta nada.
        if (newStatus !== "NO_GALPAO" && (await travarAtivo(tx, req.params.id)) === AGUARDANDO) {
          const reserva = await reservaVigenteDoAtivo(tx, req.params.id);
          if (reserva) throw new Reservado(recusaPorReserva(asset.displayId, reserva));
        }
        const [linha] = await tx.update(inventoryAssets)
          .set({
            condition: condition ?? asset.condition,
            notes: notes ?? asset.notes,
            trackingStatus: newStatus,
            location: local,
            updatedAt: new Date(),
          } as any)
          .where(and(eq(inventoryAssets.id, req.params.id), eq(inventoryAssets.trackingStatus, AGUARDANDO)))
          .returning();
        return linha;
      });
      if (!updated) {
        const atual = await storage.getInventoryAsset(req.params.id);
        return res.status(409).json({ error: recusaDeTriagem(atual?.trackingStatus ?? asset.trackingStatus) });
      }
      const triagedBy = (req as any).userName || 'Sistema';
      await createAuditLog(triagedBy, 'triagem', 'inventory_asset', req.params.id,
        JSON.stringify({ destino: newStatus, condicao: condition ?? asset.condition, local }));
      broadcast({ type: 'inventory_triaged', assetId: req.params.id, trackingStatus: newStatus });
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      if (error instanceof Reservado) return res.status(409).json({ error: error.message });
      console.error("[triagem] erro ao registrar triagem:", error);
      res.status(500).json({ error: "Não foi possível registrar a triagem agora. Tente de novo em instantes." });
    }
  });

  // Triage with quantity split: splits the asset into multiple records by qty
  app.post("/api/inventory/:id/triage-split", requireInventoryWrite, async (req, res) => {
    try {
      const asset = await storage.getInventoryAsset(req.params.id);
      if (!asset) return res.status(404).json({ error: "Ativo não encontrado" });

      const { splits, location } = triageSplitSchema.parse(req.body);

      const totalQty = splits.reduce((s, sp) => s + (sp.qty ?? 0), 0);
      if (totalQty !== (asset.quantity ?? 1))
        return res.status(400).json({ error: `Soma das quantidades (${totalQty}) não bate com o total do ativo (${asset.quantity})` });

      const localDoLote = (sp: { location?: string | null }) =>
        (sp.location ?? "").trim() || (location ?? "").trim() || asset.location || null;

      const triagedBy = (req as any).userName || 'Sistema';
      const firstStatus = destinoDaTriagem(splits[0].trackingStatus);

      // Atômico: redução do original + clones + auditoria na MESMA transação
      // (padrão de routes/items.ts). Antes, uma falha no meio dos clones
      // deixava o original já reduzido e unidades sumiam do acervo. O storage
      // não aceita `tx`, então as operações usam as tabelas do drizzle aqui.
      await db.transaction(async (tx) => {
        // Peça RESERVADA só sai da triagem INTEIRA para o Galpão: dividir
        // encolheria a reserva (ela vale a quantidade do registro) e mandar o
        // 1º lote para outro destino a deixaria valendo sobre o que não existe.
        if ((splits.length > 1 || firstStatus !== "NO_GALPAO") && (await travarAtivo(tx, req.params.id)) === AGUARDANDO) {
          const reserva = await reservaVigenteDoAtivo(tx, req.params.id);
          if (reserva) throw new Reservado(recusaPorReserva(asset.displayId, reserva, true));
        }
        // Original fica com o primeiro lote — e só se AINDA estiver aguardando:
        // zero linhas = outra pessoa triou primeiro; a transação inteira volta.
        const [travado] = await tx.update(inventoryAssets)
          .set({
            condition: splits[0].condition,
            notes: splits[0].notes ?? asset.notes,
            trackingStatus: firstStatus,
            location: localDoLote(splits[0]),
            quantity: splits[0].qty,
            updatedAt: new Date(),
          })
          .where(and(eq(inventoryAssets.id, req.params.id), eq(inventoryAssets.trackingStatus, AGUARDANDO)))
          .returning({ id: inventoryAssets.id });
        if (!travado) throw new JaTriada();

        await tx.insert(auditLogs).values({
          userName: triagedBy,
          action: 'triagem',
          entityType: 'inventory_asset',
          entityId: req.params.id,
          details: JSON.stringify({ destino: firstStatus, condicao: splits[0].condition, lotes: splits.length }),
        });

        // displayId dos lotes: o código da peça dividida + "-L2", "-L3"… — o
        // lote continua dizendo de que peça saiu. Antes virava "#EST-0063", um
        // número solto fora do padrão #EST-<peça>-<seq> do resto do acervo.
        // O maior -L já usado é lido dentro da transação: dividir a mesma peça
        // de novo, meses depois, não repete código. Uma colisão com escrita
        // concorrente viola o unique e reverte a transação INTEIRA.
        const lotesAnteriores = await tx
          .select({ displayId: inventoryAssets.displayId })
          .from(inventoryAssets)
          .where(like(inventoryAssets.displayId, `${asset.displayId}-L%`));
        let ultimoLote = lotesAnteriores.reduce((max, r) => {
          const m = r.displayId.match(/-L(\d+)$/);
          return m ? Math.max(max, Number(m[1])) : max;
        }, 1);

        for (let i = 1; i < splits.length; i++) {
          const sp = splits[i];
          const spStatus = destinoDaTriagem(sp.trackingStatus);
          ultimoLote += 1;
          const [clone] = await tx.insert(inventoryAssets).values({
            displayId: `${asset.displayId}-L${ultimoLote}`,
            name: asset.name,
            condition: sp.condition,
            trackingStatus: spStatus,
            quantity: sp.qty,
            notes: sp.notes ?? null,
            location: localDoLote(sp),
            franchiseTags: asset.franchiseTags,
            sponsorIds: asset.sponsorIds,
            approvalThumbUrl: asset.approvalThumbUrl,
            autoAdded: asset.autoAdded,
            originalItemId: asset.originalItemId,
          }).returning();

          // Auditoria por clone criado no split — rastreia origem e lote.
          await tx.insert(auditLogs).values({
            userName: triagedBy,
            action: 'triagem',
            entityType: 'inventory_asset',
            entityId: clone.id,
            details: JSON.stringify({ destino: spStatus, condicao: sp.condition, origem: req.params.id, lote: `${i + 1}/${splits.length}` }),
          });
        }
      });

      broadcast({ type: 'inventory_triaged', assetId: req.params.id, trackingStatus: firstStatus });
      res.json({ ok: true, splits: splits.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors?.[0]?.message || "Dados inválidos" });
      }
      if (error instanceof Reservado) return res.status(409).json({ error: error.message });
      if (error instanceof JaTriada) {
        const atual = await storage.getInventoryAsset(req.params.id).catch(() => undefined);
        return res.status(409).json({ error: recusaDeTriagem(atual?.trackingStatus) });
      }
      console.error("Error in triage-split:", error);
      res.status(500).json({ error: "Erro ao registrar triagem por quantidade" });
    }
  });

  // Manual trigger: mark event assets EM_USO
  app.post("/api/events/:id/dispatch-inventory", requireInventoryAdmin, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });
      if (barraSeArquivado(event, res)) return;
      const departure = event.truckDepartureDate ? new Date(event.truckDepartureDate) : new Date();
      const count = await storage.markAssetsInUseForEvent(req.params.id, departure);
      if (count > 0) broadcast({ type: "inventory_in_use", eventId: req.params.id, count });
      res.json({ count });
    } catch (error) {
      console.error("[estoque] erro no despacho manual:", error);
      res.status(500).json({ error: "Não foi possível registrar a saída dos materiais agora. Tente de novo em instantes." });
    }
  });

  // Manual trigger: mark event assets AGUARDANDO_TRIAGEM
  app.post("/api/events/:id/return-inventory", requireInventoryAdmin, async (req, res) => {
    try {
      if (barraSeArquivado(await storage.getEvent(req.params.id), res)) return;
      const count = await storage.markAssetsAwaitingTriageForEvent(req.params.id);
      if (count > 0) {
        const event = await storage.getEvent(req.params.id);
        broadcast({
          type: 'inventory_awaiting_triage',
          eventId: req.params.id,
          eventName: event?.name ?? '—',
          count,
          message: `Os materiais do evento "${event?.name ?? '—'}" retornaram e aguardam triagem.`,
        });
      }
      res.json({ count });
    } catch (error) {
      console.error("[estoque] erro no retorno manual:", error);
      res.status(500).json({ error: "Não foi possível registrar o retorno dos materiais agora. Tente de novo em instantes." });
    }
  });

  // Event Allocations
  app.get("/api/events/:id/allocations", requireAuth, async (req, res) => {
    try {
      const allocations = await storage.getEventAllocations(req.params.id);
      res.json(allocations);
    } catch (error) {
      console.error("[estoque] erro ao buscar alocações:", error);
      res.status(500).json({ error: "Não foi possível carregar as alocações do evento agora." });
    }
  });

  app.post("/api/events/:id/allocations", requireInventoryAdmin, async (req, res) => {
    try {
      const { assetId } = req.body;
      if (!assetId || typeof assetId !== "string") return res.status(400).json({ error: "assetId é obrigatório" });
      if (barraSeArquivado(await storage.getEvent(req.params.id), res)) return;
      const alloc = await storage.allocateAssetToEvent(req.params.id, assetId);
      broadcast({ type: "estoque_reservas", eventId: req.params.id });
      res.status(201).json(alloc);
    } catch (error) {
      console.error("Error allocating asset:", error);
      res.status(500).json({ error: "Erro ao alocar peça" });
    }
  });

  app.delete("/api/allocations/:id", requireInventoryAdmin, async (req, res) => {
    try {
      const success = await storage.deallocateAsset(req.params.id);
      if (!success) return res.status(404).json({ error: "Alocação não encontrada" });
      broadcast({ type: "estoque_reservas" });
      res.json({ success: true });
    } catch (error) {
      console.error("[estoque] erro ao desalocar:", error);
      res.status(500).json({ error: "Não foi possível desfazer a alocação agora. Tente de novo em instantes." });
    }
  });

}
