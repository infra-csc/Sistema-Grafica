// Item CRUD, workflow transitions, sponsor-approval sub-endpoints, and
// XLSX import routes. Extracted from server/routes.ts (ITEMS section).
import type { Express } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage, assetPrefix, assetSeqOf, isDisplayIdConflictError } from "../storage";
import type { Item } from "@shared/schema";
import {
  insertItemSchema,
  publicInsertItemSchema,
  items as itemsTable,
  auditLogs,
  notifications,
} from "@shared/schema";
import {
  requireAuth,
  broadcast,
  translateStatus,
  createAuditLog,
  resolveActor,
  updateEventStatus,
  EVENT_CLOSED_STATUS,
} from "./shared";
import { motivoEventoFinalizado, todayBusinessMs } from "@shared/prazo-dates";
import type { EventoFinalizadoMotivo } from "@shared/prazo-dates";
import { runInventoryCron } from "../services/inventoryLifecycle";
import { handlePreviewXlsx, handleConfirmImport } from "../services/xlsxImport";
import { handleExportItemsXlsx, handleExportSelectedItemsXlsx } from "../services/xlsxExport";

// Allow-list dos campos que o PATCH genérico /api/items/:id pode alterar.
// É uma lista deliberada e restritiva: `status` e TODOS os campos de fluxo
// (aprovação, produção, entrega, timestamps, flags de rejeição, quantidades
// produzidas/conferidas/entregues, campos "previous*") ficam de fora — eles
// só mudam pelas rotas dedicadas, que validam a transição e o papel do
// usuário. Sem esta trava, qualquer usuário autenticado poderia enviar
// PATCH { "status": "delivered" } e pular toda a máquina de estados
// (aprovação de patrocinador, revisão do criador, conferência da gráfica).
const updateItemSchema = insertItemSchema
  .pick({
    type: true,
    description: true,
    quantity: true,
    area: true,
    visual: true,
    visualWidth: true,
    visualHeight: true,
    fileWidth: true,
    fileHeight: true,
    material: true,
    finish: true,
    measurement: true,
    calculatedM2: true,
    observations: true,
    skipApproval: true,
    isReuse: true,
    approvalThumbUrl: true,
    finalFileUrl: true,
    finalFileName: true,
    referenceUrl: true,
  })
  .partial();

// ─────────────────────────────────────────────────────────────────────────────
// COMPLEMENTO — aumento de quantidade depois que a peça entrou em produção.
//
// A REGRA, em uma frase: enquanto a peça NÃO entrou em produção, aumentar é
// editar a quantidade. Depois que entrou, aumentar é criar um COMPLEMENTO
// (peça-filha #0062-C1, com a diferença, ciclo próprio e a mãe intocada).
// REDUZIR é sempre edição, com piso físico (ver PATCH /api/items/:id).
//
// A assimetria é deliberada: aumentar cria trabalho novo (ordem de serviço,
// metragem, alerta para a Gráfica); reduzir só corta a meta.
//
// Espelho literal de COMPLEMENT_ALLOWED_STATUSES em client/src/lib/status.ts —
// o servidor não importa código do client (mesma disciplina dos dois mapas de
// status que já convivem). Se um mudar, o outro muda junto.
// Inclui as grafias legadas em português porque elas circulam no banco: gate
// que compara só com a grafia canônica simplesmente nunca dispara.
// ─────────────────────────────────────────────────────────────────────────────
const COMPLEMENT_ALLOWED_STATUSES: readonly string[] = [
  "inProduction", "em_producao", "produced", "produzido",
  "conferred", "delivered", "entregue",
];

// m² é grandeza de produção/custo e não pode ser fonte-de-verdade do cliente.
// Quando as dimensões do arquivo estão presentes, o servidor RECALCULA
// calculatedM2 = quantidade × largura × altura (mesma fórmula de
// client/src/lib/calculateM2.ts), ignorando o valor enviado. Quando não há
// dimensões (itens sem medida de arquivo), não há como derivar e o valor
// recebido é mantido. Retorna string com 2 casas (coluna decimal(10,2)).
function deriveCalculatedM2(data: {
  quantity?: number | null;
  fileWidth?: string | number | null;
  fileHeight?: string | number | null;
}): string | undefined {
  const w = data.fileWidth != null ? parseFloat(String(data.fileWidth)) : NaN;
  const h = data.fileHeight != null ? parseFloat(String(data.fileHeight)) : NaN;
  const q = data.quantity != null ? Number(data.quantity) : NaN;
  if (
    Number.isFinite(w) && w > 0 &&
    Number.isFinite(h) && h > 0 &&
    Number.isFinite(q) && q > 0
  ) {
    return (q * w * h).toFixed(2);
  }
  return undefined;
}

// Criação de itens: Solicitação/admin, ou o CRIADOR do evento (qualquer papel)
// — espelha o gate canEditLists do client. Sem isto, Gráfica/Arte/Atendimento
// criavam itens em eventos alheios direto pela API.
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

async function canCreateItemsFor(req: { userRole?: string; userId?: string }, eventId?: string): Promise<boolean> {
  if (req.userRole === "admin" || req.userRole === "solicitacao") return true;
  if (!eventId || !req.userId) return false;
  const ev = await storage.getEvent(eventId);
  return !!ev && ev.createdBy === req.userId;
}

/**
 * Bloqueio por encerramento À MÃO — esse tem volta, então a frase oferece.
 *
 * A frase diz "mexer nas peças" e não "adicionar peças" porque a guarda deixou
 * de ser só das cinco portas de CRIAÇÃO: ela cobre agora toda escrita que faz o
 * trabalho andar (aprovar, liberar, produzir, editar…). Dizer "para adicionar
 * peças" a quem tentou APROVAR seria devolver uma instrução que não serve.
 */
export const EVENTO_ENCERRADO_ERRO = "Evento encerrado — reabra o evento para mexer nas peças dele.";

/**
 * Bloqueio por o evento JÁ TER ACONTECIDO. Aqui não existe "reabrir": a data
 * passou. Oferecer uma ação que não existe é pior do que negar.
 */
export const EVENTO_REALIZADO_ERRO =
  "Este evento já aconteceu — não é possível mexer nas peças dele.";

/**
 * Evento ENCERRADO à mão não recebe peça nova.
 *
 * Por que BLOQUEAR e não auto-reabrir como o ramo de `completed` logo abaixo
 * faz: "completed" é um carimbo DERIVADO da produção, e reabri-lo ao receber
 * peça só devolve o evento à sua própria derivação. "closed" é uma decisão de
 * GENTE — reabrir sozinho a desfaria em silêncio, exatamente o que a guarda de
 * `updateEventStatus` (routes/shared.ts) existe para impedir.
 *
 * E o estrago não seria só de princípio: a peça nasceria fora da Gestão de
 * Prazos e fora das filas de Arte/Gráfica/Atendimento (que agora filtram o
 * evento encerrado), isto é, invisível para quem teria de fazê-la.
 */
function motivoEventoFechado(
  event: { status?: string | null; startDate?: string | Date | null; manuallyClosed?: boolean | null } | null | undefined,
): EventoFinalizadoMotivo | null {
  // Fonte ÚNICA: o mesmo predicado que a Gestão de Prazos e as cinco filas
  // usam. Antes daqui só o encerramento manual barrava, então dava para
  // cadastrar peça num evento do mês passado — e ela nascia invisível
  // exatamente como a de um evento encerrado à mão, porque as filas também
  // escondem evento já realizado.
  return motivoEventoFinalizado(event, todayBusinessMs());
}

/** Cada motivo tem a sua frase: encerrado tem volta, realizado não tem. */
function erroEventoFechado(motivo: EventoFinalizadoMotivo): string {
  return motivo === "encerrado" ? EVENTO_ENCERRADO_ERRO : EVENTO_REALIZADO_ERRO;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTO FINALIZADO × ESCRITA DE PEÇA — O CRITÉRIO. Leia isto antes de mexer.
//
// O buraco que originou esta seção, relatado pelo dono com observação em
// produção: "vi situações de encerrar eventos e conseguirem aprovar ainda".
// Só a CRIAÇÃO estava barrada. As filas de trabalho (Arte, Atendimento,
// Gráfica, Revisão, Vincular) ESCONDEM as peças de evento finalizado — mas
// esconder é filtro de CLIENTE, e o Painel Geral e o Detalhe do Evento
// continuam mostrando essas peças DE PROPÓSITO (regra do dono: registro não
// perde o passado). Era por ali que a ação seguia acontecendo.
//
// O CRITÉRIO, em uma frase:
//   BARRA o que faz o trabalho ANDAR. PERMITE o que ARRUMA A CASA.
//
// "Andar" é qualquer escrita que empurre a peça adiante no fluxo, mande alguém
// trabalhar, ou reescreva o contrato: aprovar, reprovar, liberar, dispensar,
// enviar arquivo, trocar arte, produzir, marcar reaproveitamento, editar,
// devolver, cancelar, vincular patrocinador. Nada disso pode acontecer num
// evento que já acabou — no melhor caso é trabalho invisível (a fila não mostra
// a peça, então ninguém a faz), no pior é lona impressa para um evento que já
// passou.
//
// "Arrumar a casa" é o que só encerra o que já existe, sem gerar trabalho:
//   · excluir peça e restaurar peça — limpeza reversível (soft delete). Barrar
//     deixaria lixo PRESO num evento em que ninguém mais pode mexer.
//   · cancelar complemento — é desfazer um aumento, e a rota já exige que
//     nenhuma unidade tenha sido tocada. Barrar transformaria um engano num
//     item permanente da fila da Gráfica.
//   · conferir e registrar entrega — é FECHAR A CONTA do que fisicamente já
//     saiu. Nenhuma das duas consegue produzir nada: conferir exige a peça em
//     "Produzido" e entregar exige unidades já conferidas. E o dia seguinte ao
//     evento — quando ele já é "realizado" por definição — é exatamente quando
//     a papelada da entrega chega. Barrar tornaria o registro do que aconteceu
//     de verdade impossível de completar, para sempre.
//
// EM CASO DE DÚVIDA, BARRA (decisão do dono): reabrir o evento é barato, e o
// admin faz isso em um clique. Um trabalho feito por engano num evento morto
// não tem desfazer barato.
//
// Reabrir/encerrar o evento (server/routes/events.ts) obviamente NÃO passa por
// aqui: é a válvula que destrava tudo o que esta guarda barra.
// ─────────────────────────────────────────────────────────────────────────────

/** Motivo da finalização do evento DONO da peça. `null` = evento ainda em jogo. */
export async function motivoEventoDaPeca(
  item: { eventId?: string | null } | null | undefined,
): Promise<EventoFinalizadoMotivo | null> {
  if (!item?.eventId) return null;
  return motivoEventoFechado(await storage.getEvent(item.eventId));
}

/**
 * A guarda das rotas que fazem o trabalho ANDAR. Responde 409 e devolve `true`
 * quando barrou, para o handler sair com `if (await barraEventoFinalizado(...)) return;`
 *
 * `code` e `reason` vão no corpo porque o cliente precisa distinguir as duas
 * origens sem parsear a frase: "encerrado" oferece reabrir, "realizado" não.
 */
export async function barraEventoFinalizado(
  item: { eventId?: string | null } | null | undefined,
  res: { status: (c: number) => any },
): Promise<boolean> {
  const motivo = await motivoEventoDaPeca(item);
  if (!motivo) return false;
  res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });
  return true;
}

/**
 * A mesma guarda nas rotas de LOTE, que não podem simplesmente sair no
 * primeiro item barrado — elas já têm o idioma de pular o item inválido e
 * devolver a lista de erros no fim.
 *
 * Por que não 409 no primeiro barrado: um lote misto (peças de eventos vivos e
 * de um evento finalizado) puniria as peças boas por causa da ruim. Por que
 * ainda assim existe um 409: quando NADA passou e tudo o que falhou falhou por
 * esta regra, um `{ success: 0, errors: N }` com status 200 vira "não fez nada
 * e não disse por quê" — que é o silêncio de sempre, agora em lote.
 */
export function contadorDeBloqueio() {
  let bloqueados = 0;
  let motivo: EventoFinalizadoMotivo | null = null;
  return {
    /** Registra um item barrado e devolve a frase para a lista de erros. */
    registra(m: EventoFinalizadoMotivo): string {
      bloqueados += 1;
      motivo ??= m;
      return erroEventoFechado(m);
    },
    /** `true` (já respondeu 409) quando o lote INTEIRO caiu por esta regra. */
    respondeLoteInteiro(res: { status: (c: number) => any }, processados: number, pedidos: number): boolean {
      if (!motivo || processados > 0 || bloqueados !== pedidos) return false;
      res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });
      return true;
    },
  };
}

// Enriquece uma lista de itens com { event, sponsors } fazendo apenas 4 queries
// totais (eventos, patrocinadores, vínculos item↔patrocinador e aprovações em
// bloco), em vez de 1 getEvent + 1 getItemSponsors + N getSponsor POR item
// (N+1). Cada sponsor recebe approvalStatus: "approved"|"rejected"|"pending"|null
// para que SponsorChips possa colorir os chips sem requests adicionais.
async function enrichItemsWithEventsAndSponsors(list: any[]): Promise<any[]> {
  if (list.length === 0) return [];
  const [allEvents, allSponsors, allItemSponsors, allApprovals] = await Promise.all([
    storage.getAllEvents(),
    storage.getAllSponsors(),
    storage.getAllItemSponsors(),
    storage.getAllItemSponsorApprovals(),
  ]);
  const eventById = new Map(allEvents.map((e) => [e.id, e]));
  const sponsorById = new Map(allSponsors.map((s) => [s.id, s]));
  // key: `${itemId}_${sponsorId}` → approval status
  const approvalKey = (itemId: string, sponsorId: string) => `${itemId}__${sponsorId}`;
  const approvalStatus = new Map<string, string>();
  for (const a of allApprovals) {
    approvalStatus.set(approvalKey(a.itemId, a.sponsorId), a.status);
  }
  const sponsorsByItem = new Map<string, any[]>();
  for (const is of allItemSponsors) {
    const sponsor = sponsorById.get(is.sponsorId);
    if (!sponsor) continue;
    const enrichedSponsor = {
      ...sponsor,
      approvalStatus: approvalStatus.get(approvalKey(is.itemId, is.sponsorId)) ?? null,
    };
    const arr = sponsorsByItem.get(is.itemId);
    if (arr) arr.push(enrichedSponsor);
    else sponsorsByItem.set(is.itemId, [enrichedSponsor]);
  }
  const withEventsAndSponsors = list.map((item) => ({
    ...item,
    event: eventById.get(item.eventId) ?? undefined,
    sponsors: sponsorsByItem.get(item.id) ?? [],
  }));

  return await enrichItemsWithComplements(withEventsAndSponsors);
}

// Aviso de migração pendente: uma linha por processo, não uma por request.
let avisouMigracaoComplemento = false;

/**
 * Anexa o parentesco de complemento à lista já enriquecida:
 *  - na MÃE: `complements: [...]` e `contractedTotal` (quantidade + Σ dos
 *    complementos vivos). Derivado a cada leitura, nunca gravado — contador
 *    denormalizado sempre acaba divergindo da realidade.
 *  - no FILHO: `parent: { id, displayId, quantity, status }`, para a linha
 *    poder dizer "COMPLEMENTO DE #0062" sem uma segunda requisição.
 *
 * Uma query extra por request (WHERE parent_item_id = ANY(...)), sobre índice.
 *
 * Degrada em silêncio se a migração ainda não rodou: as três rotas de leitura
 * continuam respondendo o que sempre responderam, só sem o bloco de
 * complemento. (Isso NÃO substitui o `npm run db:push` — o SELECT do Drizzle
 * lista as colunas explicitamente, então a leitura estoura antes de chegar
 * aqui. O try/catch é a rede para o caso de a query nova falhar sozinha.)
 */
async function enrichItemsWithComplements(list: any[]): Promise<any[]> {
  try {
    const ids = list.map((i) => i.id);
    const complements = await storage.getComplementsByParentIds(ids);
    if (complements.length === 0) {
      // Ainda assim precisa resolver o `parent` dos filhos cuja mãe não está
      // nesta lista (ex.: recorte por status que não trouxe a mãe).
      return await attachParents(list);
    }

    const byParent = new Map<string, any[]>();
    for (const c of complements) {
      if (!c.parentItemId) continue;
      const arr = byParent.get(c.parentItemId);
      if (arr) arr.push(c);
      else byParent.set(c.parentItemId, [c]);
    }

    const comMaes = list.map((item) => {
      const filhos = byParent.get(item.id);
      if (!filhos || filhos.length === 0) return item;
      const soma = filhos.reduce((acc: number, c: any) => acc + (Number(c.quantity) || 0), 0);
      return {
        ...item,
        complements: filhos,
        contractedTotal: (Number(item.quantity) || 0) + soma,
      };
    });

    return await attachParents(comMaes);
  } catch (error: any) {
    if (error?.code === "42703") {
      if (!avisouMigracaoComplemento) {
        avisouMigracaoComplemento = true;
        console.error("[COMPLEMENTOS] Migração pendente — rode npm run db:push. Listagens seguem sem o bloco de complemento.");
      }
      return list;
    }
    throw error;
  }
}

/** Resolve `parent` nos itens que são complementos, com no máximo 1 query extra. */
async function attachParents(list: any[]): Promise<any[]> {
  const filhos = list.filter((i) => i.parentItemId);
  if (filhos.length === 0) return list;

  const naLista = new Map(list.map((i) => [i.id, i]));
  const faltando = Array.from(new Set(
    filhos.map((f) => f.parentItemId).filter((pid: string) => !naLista.has(pid)),
  ));
  const extras = faltando.length ? await storage.getItemsByIds(faltando as string[]) : [];
  const maePorId = new Map<string, any>([
    ...Array.from(naLista.entries()),
    ...extras.map((m) => [m.id, m] as [string, any]),
  ]);

  return list.map((item) => {
    if (!item.parentItemId) return item;
    const mae = maePorId.get(item.parentItemId);
    if (!mae) return item;
    return {
      ...item,
      parent: { id: mae.id, displayId: mae.displayId, quantity: mae.quantity, status: mae.status },
    };
  });
}

export function registerItemRoutes(app: Express): void {
  // ============ ITEMS ============

  // Get all items with event data and sponsors.
  // Sem cap: um slice silencioso aqui fez peças "sumirem" do Painel quando o
  // banco passou de 1000. Se o payload virar problema, a saída é paginação
  // real (cursor) — nunca truncar sem avisar o cliente.
  app.get("/api/items", requireAuth, async (req, res) => {
    try {
      const allItems = await storage.getAllItems();
      if (allItems.length > 5000) {
        console.warn(`[items] GET /api/items retornando ${allItems.length} itens — priorizar paginação`);
      }
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(allItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get deleted (soft-deleted) items — admin e solicitacao only
  app.get("/api/items/deleted", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "solicitacao") {
        return res.status(403).json({ error: "Sem permissão para ver peças excluídas" });
      }
      const deletedItems = await storage.getDeletedItems();
      const enriched = await enrichItemsWithEventsAndSponsors(deletedItems);
      res.json(enriched);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Restaurar peça excluída (desfaz o soft delete) — SOMENTE admin.
  // A visão "Excluídos" era um beco sem saída: dava para ver, não para voltar.
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA, não fazer andar):
  // restaurar é o desfazer de uma exclusão, e a exclusão continua liberada em
  // evento finalizado. Barrar só aqui tornaria PERMANENTE um clique errado —
  // a peça excluída por engano ficaria na lixeira para sempre, porque o
  // caminho de volta estaria fechado. Restaurar não faz ninguém trabalhar: a
  // peça volta com o MESMO status que tinha.
  app.post("/api/items/:id/restore", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem restaurar peças" });
      }
      const restored = await storage.restoreItem(req.params.id);
      if (!restored) {
        return res.status(404).json({ error: "Peça não encontrada ou não está excluída" });
      }
      const item = await storage.getItem(req.params.id);
      await createAuditLog(
        req,
        "restored",
        "item",
        req.params.id,
        `Peça "${item?.displayId ?? req.params.id}" restaurada da lixeira`
      );
      if (item) await updateEventStatus(item.eventId);
      broadcast({ type: "item_updated", item });
      res.json({ success: true, item });
    } catch (error: any) {
      res.status(500).json({ error: "Não foi possível restaurar a peça" });
    }
  });

  // Get pending items with event and sponsors (for Arte module) - MUST come BEFORE /:eventId route
  app.get("/api/items/pending", requireAuth, async (req, res) => {
    try {
      const pendingItems = await storage.getPendingItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(pendingItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items that have at least one awaiting_arte sponsor approval (for Arte correção) - MUST come BEFORE /:eventId
  app.get("/api/items/resubmission-needed", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }

      // Batch: carrega tudo em paralelo (poucas queries totais) em vez de
      // fazer N+1 round trips (approvals/sponsors/evento por item), que
      // deixava a aba de Correção lenta para abrir com muitos itens.
      const [allItems, allEvents, allSponsors, allItemSponsorApprovals] = await Promise.all([
        storage.getAllItems(),
        storage.getAllEvents(),
        storage.getAllSponsors(),
        storage.getAllItemSponsorApprovals(),
      ]);

      const awaitingItems = allItems.filter(i => i.status === "awaiting_sponsor_approval");
      const eventById = new Map(allEvents.map(e => [e.id, e]));
      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      const approvalsByItem = new Map<string, any[]>();
      for (const a of allItemSponsorApprovals) {
        if (a.status !== "awaiting_arte") continue;
        const list = approvalsByItem.get(a.itemId);
        if (list) list.push(a);
        else approvalsByItem.set(a.itemId, [a]);
      }

      const result = [];
      for (const item of awaitingItems) {
        const awaitingArte = approvalsByItem.get(item.id);
        if (!awaitingArte || awaitingArte.length === 0) continue;

        result.push({
          ...item,
          event: eventById.get(item.eventId) || null,
          awaitingArteApprovals: awaitingArte.map((a: any) => ({
            ...a,
            sponsor: sponsorById.get(a.sponsorId) || null,
          })),
        });
      }

      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get approved items with event and sponsors (for Gráfica module) - MUST come BEFORE /:eventId route
  app.get("/api/items/approved", requireAuth, async (req, res) => {
    try {
      const approvedItems = await storage.getApprovedItems();
      const itemsWithEventsAndSponsors = await enrichItemsWithEventsAndSponsors(approvedItems);
      res.json(itemsWithEventsAndSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get items by event with sponsors - MUST come AFTER specific routes like /pending and /approved
  // Batch: retorna sponsors + approvals de todos os itens aguardando aprovação
  // em 3 queries totais, evitando o N*2 de chamadas individuais da página de atendimento.
  // DEVE ficar ANTES de /:eventId — senão Express captura "batch-approval-data" como eventId.
  app.get("/api/items/batch-approval-data", requireAuth, async (req, res) => {
    try {
      // Devolve TODOS os vínculos e aprovações do sistema — restrito aos
      // papéis que veem a tela de Atendimento (era aberto a qualquer sessão).
      if (!["atendimento", "arte", "admin"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Acesso não autorizado" });
      }
      const [allSponsors, allItemSponsors, allApprovals] = await Promise.all([
        storage.getAllSponsors(),
        storage.getAllItemSponsors(),
        storage.getAllItemSponsorApprovals(),
      ]);

      const sponsorById = new Map(allSponsors.map(s => [s.id, s]));

      // agrupa vínculos por item
      const sponsorsByItem: Record<string, any[]> = {};
      for (const is of allItemSponsors) {
        const sponsor = sponsorById.get(is.sponsorId);
        if (!sponsor) continue;
        (sponsorsByItem[is.itemId] ??= []).push(sponsor);
      }

      // agrupa approvals por item, enriquecendo com sponsor
      const approvalsByItem: Record<string, any[]> = {};
      for (const a of allApprovals) {
        const enriched = { ...a, sponsor: sponsorById.get(a.sponsorId) || null };
        (approvalsByItem[a.itemId] ??= []).push(enriched);
      }

      res.json({ sponsorsByItem, approvalsByItem });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/items/:eventId", requireAuth, async (req, res) => {
    try {
      const items = await storage.getItemsByEvent(req.params.eventId);
      const itemsWithSponsors = await enrichItemsWithEventsAndSponsors(items);
      res.json(itemsWithSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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
      // Não confiar no m² do cliente — recalcular no servidor quando derivável.
      const derivedM2 = deriveCalculatedM2(validatedData);
      if (derivedM2 !== undefined) validatedData.calculatedM2 = derivedM2;

      const event = await storage.getEvent(validatedData.eventId);
      if (!event) {
        return res.status(404).json({ error: "Evento não encontrado" });
      }
      
      // Evento fechado (à mão OU já realizado) vem ANTES do ramo de
      // "completed": ver motivoEventoFechado.
      const fechadoAvulsa = motivoEventoFechado(event);
      if (fechadoAvulsa) {
        return res.status(409).json({ error: erroEventoFechado(fechadoAvulsa) });
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
      );
      
      // Novo item adicionado - notifica Arte + Gráfica
      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `Novo item adicionado: ${item.type} - Evento: ${event.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
      });
      
      // Update event status
      await updateEventStatus(item.eventId);
      
      broadcast({ type: "item_created", item });
      broadcast({ type: "notification_created", notification });
      
      res.status(201).json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create multiple items at once (bulk)
  app.post("/api/items/bulk", requireAuth, async (req, res) => {
    try {
      const { items: itemsData } = req.body;
      
      if (!Array.isArray(itemsData) || itemsData.length === 0) {
        return res.status(400).json({ error: "Items array is required and cannot be empty" });
      }
      if (!(await canCreateItemsFor(req, itemsData[0]?.eventId))) {
        return res.status(403).json({ error: "Sem permissão para criar itens neste evento" });
      }
      // Mesma trava do POST unitário — sem ela o lote era o caminho aberto para
      // pendurar peça num evento encerrado.
      const fechadoLote = motivoEventoFechado(await storage.getEvent(itemsData[0]?.eventId));
      if (fechadoLote) {
        return res.status(409).json({ error: erroEventoFechado(fechadoLote) });
      }

      // Validate all items
      const validatedItems = itemsData.map((item, index) => {
        try {
          // publicInsertItemSchema: mesma blindagem do POST unitário — o body
          // do lote não cria parentesco de complemento (ver acima).
          const parsed = publicInsertItemSchema.parse(item);
          // Recalcular m² no servidor quando derivável (não confiar no cliente).
          const derivedM2 = deriveCalculatedM2(parsed);
          if (derivedM2 !== undefined) parsed.calculatedM2 = derivedM2;
          return parsed;
        } catch (error: any) {
          throw new Error(`Validation error at item ${index + 1}: ${error.message}`);
        }
      });
      
      // Create all items in bulk
      const createdItems = await storage.createBulkItems(validatedItems);
      
      // Create audit log for each item created
      for (const item of createdItems) {
        await createAuditLog(
          req,
          'created',
          'item',
          item.id,
          `Item "${item.type}" criado - Qtd: ${item.quantity}, ${item.calculatedM2}m²`
        );
      }
      
      // Get event for notification
      const firstItem = createdItems[0];
      const event = firstItem ? await storage.getEvent(firstItem.eventId) : null;
      
      // Primeira lista de itens - notificação única para Arte + Gráfica
      if (event) {
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `${createdItems.length} itens adicionados - Evento: ${event.name}`,
          eventId: event.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        });
        broadcast({ type: "notification_created", notification });
      }
      
      // Broadcast update
      broadcast({ type: "items_bulk_created", items: createdItems, eventId: firstItem?.eventId });
      
      res.status(201).json(createdItems);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });


  // ── Export items to Excel (.xlsx) ────────────────────────────────────────
  app.get("/api/events/:id/export-items", requireAuth, handleExportItemsXlsx);
  // Exportação da Gráfica: recebe os ids já filtrados pela tela.
  app.post("/api/items/export-xlsx", requireAuth, handleExportSelectedItemsXlsx);


  // Import de Excel usa o fluxo preview → confirm (abaixo). O endpoint direto
  // /import-xlsx (parser legado) foi removido: importava a aba errada em
  // planilhas cujo cabeçalho usa "cód peça" em vez de "item" e não vinculava
  // patrocinadores.

  // ── Preview Excel items (parse without saving) ───────────────────────────
  app.post("/api/events/:id/preview-xlsx", requireAuth, handlePreviewXlsx);

  // ── Confirm import (save pre-reviewed items) ─────────────────────────────
  app.post("/api/events/:id/confirm-import", requireAuth, async (req, res) => {
    if (!(await canCreateItemsFor(req, req.params.id))) {
      return res.status(403).json({ error: "Sem permissão para importar itens neste evento" });
    }
    // A planilha é a porta que entra mais peça de uma vez — bloquear aqui, no
    // wrapper que já faz o gate de papel, evita 200 peças invisíveis.
    const fechadoImport = motivoEventoFechado(await storage.getEvent(req.params.id));
    if (fechadoImport) {
      return res.status(409).json({ error: erroEventoFechado(fechadoImport) });
    }
    return handleConfirmImport(req, res);
  });


  // ── Clone items from another event ───────────────────────────────────────
  app.post("/api/events/:id/clone-items", requireAuth, async (req, res) => {
    if (!(await canCreateItemsFor(req, req.params.id))) {
      return res.status(403).json({ error: "Sem permissão para clonar itens para este evento" });
    }
    try {
      const targetEvent = await storage.getEvent(req.params.id);
      if (!targetEvent) return res.status(404).json({ error: "Evento destino não encontrado" });
      // Clonar é criar peça — a quarta porta, e a que traz a lista inteira.
      const fechadoClone = motivoEventoFechado(targetEvent);
      if (fechadoClone) {
        return res.status(409).json({ error: erroEventoFechado(fechadoClone) });
      }

      const { sourceEventId } = req.body as { sourceEventId: string };
      if (!sourceEventId) return res.status(400).json({ error: "sourceEventId é obrigatório" });

      const sourceEvent = await storage.getEvent(sourceEventId);
      if (!sourceEvent) return res.status(404).json({ error: "Evento origem não encontrado" });

      const sourceItems = await storage.getItemsByEvent(sourceEventId);
      if (sourceItems.length === 0) {
        return res.status(400).json({ error: "O evento de origem não tem itens para clonar" });
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
        isReuse: item.isReuse || false,
      }));

      const validated = cloned.map((item, i) => {
        try {
          return insertItemSchema.parse(item);
        } catch (e: any) {
          throw new Error(`Item ${i + 1} (${item.type}): ${e.message}`);
        }
      });

      const created = await storage.createBulkItems(validated);

      await createAuditLog(
        req,
        'created',
        'item',
        targetEvent.id,
        `${created.length} itens clonados do evento "${sourceEvent.name}"`
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

      res.status(201).json({ cloned: created.length, items: created });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update item
  app.patch("/api/items/:id", requireAuth, async (req, res, next) => {
    try {
      // As rotas de lote (/api/items/bulk-return-to-arte, bulk-cancel,
      // bulk-creator-reject) são registradas DEPOIS desta — sem este desvio o
      // Express casava :id = "bulk-..." e as três ficavam INALCANÇÁVEIS
      // ("Devolver Selecionadas" nunca chegou ao handler certo).
      if (req.params.id.startsWith("bulk-")) return next();

      // Gate de papel: quem edita peça é quem gerencia a lista (admin,
      // solicitação, criador do evento) ou os papéis com edições pontuais no
      // fluxo (arte: thumbs/refs; atendimento: vinculação). Gráfica usa as
      // rotas dedicadas de conferir/entregar — estava tudo aberto via PATCH.
      const role = req.userRole ?? "";
      if (!["admin", "solicitacao", "arte", "atendimento"].includes(role)) {
        const existing = await storage.getItem(req.params.id);
        if (!existing) return res.status(404).json({ error: "Item not found" });
        const parentEvent = await storage.getEvent(existing.eventId);
        if (!parentEvent || parentEvent.createdBy !== req.userId) {
          return res.status(403).json({ error: "Sem permissão para editar esta peça" });
        }
      }

      // Allow-list explícita: barra `status` e campos de fluxo (ver
      // updateItemSchema). Transições de status só pelas rotas dedicadas.
      const validatedData = updateItemSchema.parse(req.body);

      // O arquivo final tem rotas próprias com gate de status (submit/update-
      // final-file). Pelo PATCH genérico, arte/atendimento não trocam o
      // arquivo que a Gráfica imprime — admin/solicitação (gestores da lista)
      // seguem podendo para correções administrativas.
      if (["arte", "atendimento"].includes(role) &&
          ("finalFileUrl" in validatedData || "finalFileName" in validatedData)) {
        return res.status(403).json({
          error: "Arquivo final só pode ser alterado pela rota de envio da Arte (com validação de status)."
        });
      }

      // Normalize referenceUrl from raw GCS URL to /objects/ proxy path and
      // record an ACL policy so the object is attributed to its uploader.
      // Reference photos/art files are treated as "public" to any
      // authenticated user, matching the pre-existing behavior where objects
      // with no ACL policy were freely accessible to anyone logged in.
      if (validatedData.referenceUrl) {
        const { ObjectStorageService } = await import("../objectStorage");
        const objectStorageService = new ObjectStorageService();
        try {
          validatedData.referenceUrl = await objectStorageService.trySetObjectEntityAclPolicy(
            validatedData.referenceUrl,
            { owner: req.userId!, visibility: "public" }
          );
        } catch {
          // Object may not exist in storage yet (e.g. legacy/external URL) —
          // fall back to just normalizing the path without setting an ACL.
          validatedData.referenceUrl = objectStorageService.normalizeObjectEntityPath(validatedData.referenceUrl);
        }
      }

      // Pegar item atual antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      // ANDA: este PATCH mexe em quantidade, material, dimensões e m² — o
      // contrato da peça. Num evento que já acabou, mudar o contrato só
      // reescreve o que foi fechado.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const updatePayload: Record<string, any> = { ...validatedData };

      // ── QUANTIDADE: a bifurcação aumentar/reduzir mora aqui ────────────────
      // Este era o caminho silencioso do sistema: dava para digitar 15 numa
      // peça ENTREGUE com 10 unidades e o servidor aceitava. A peça continuava
      // "Entregue" (nenhum status muda no PATCH), ganhava 5 unidades que
      // ninguém imprimiu e passava a convidar a Gráfica a conferir material
      // inexistente. Sem este gate, o modelo de complemento conviveria com o
      // modelo antigo — dois modelos concorrentes para o mesmo problema.
      const novaQtd = validatedData.quantity;
      const mudouQtd = novaQtd != null && Number(novaQtd) !== currentItem.quantity;
      let promoveuParaProduzido = false;

      if (mudouQtd) {
        const nova = Number(novaQtd);
        const emProducao = COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status);

        if (emProducao && nova > currentItem.quantity) {
          return res.status(409).json({
            error: `A peça ${currentItem.displayId} já está em produção. Para aumentar, use "Aumentar quantidade" (cria um complemento).`,
            code: "USE_COMPLEMENT",
            itemId: currentItem.id,
            displayId: currentItem.displayId,
            currentQuantity: currentItem.quantity,
            suggestedComplement: nova - currentItem.quantity,
          });
        }

        // PISO FÍSICO da redução: não dá para reduzir abaixo do que já existe
        // no mundo real. Sem ele, uma peça com 10 produzidas e quantidade 8
        // ficaria com inventário órfão e com tetos NEGATIVOS em confer/deliver.
        // Espelhado em client/src/lib/saldo.ts → reductionFloorOf().
        const produzidas = (currentItem.quantityProduced ?? 0) + (currentItem.reuseQty ?? 0);
        const piso = Math.max(produzidas, currentItem.conferredQty ?? 0, currentItem.deliveredQty ?? 0);
        if (nova < piso) {
          return res.status(409).json({
            error: `Não é possível reduzir para ${nova}: já há ${piso} un. produzidas/conferidas/entregues. Mínimo: ${piso}.`,
            code: "QUANTITY_FLOOR",
            minimum: piso,
          });
        }

        // Promoção SÓ PARA CIMA: se a redução zera o saldo a produzir e a peça
        // está em produção, ela virou "Produzido" de fato. Cobre o caso real
        // "produzi 10 das 15 e o cliente desistiu das outras 5" — sem isto a
        // peça ficaria eternamente Em Produção com saldo fantasma. Nunca
        // rebaixa: peça entregue continua entregue.
        if (nova <= produzidas && (currentItem.status === "inProduction" || currentItem.status === "em_producao")) {
          updatePayload.status = "produced";
          promoveuParaProduzido = true;
        }
      }

      // m² é derivado, não recebido: quando a quantidade ou as dimensões do
      // arquivo mudam, o valor enviado pelo cliente é ignorado e recalculado
      // com o estado MESCLADO (o que veio no PATCH + o que já estava na peça).
      // Sem isto, editar só a quantidade deixava o m² congelado no valor antigo
      // — e o m² é o número que vira custo e fechamento com patrocinador.
      if ("quantity" in validatedData || "fileWidth" in validatedData || "fileHeight" in validatedData) {
        const derivado = deriveCalculatedM2({
          quantity: novaQtd ?? currentItem.quantity,
          fileWidth: "fileWidth" in validatedData ? validatedData.fileWidth : currentItem.fileWidth,
          fileHeight: "fileHeight" in validatedData ? validatedData.fileHeight : currentItem.fileHeight,
        });
        if (derivado !== undefined) updatePayload.calculatedM2 = derivado;
      }

      const item = await storage.updateItem(req.params.id, updatePayload);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // Create audit log - build descriptive diff of changed fields
      const changedParts: string[] = [];

      if (item.status !== currentItem.status) {
        changedParts.push(`Status: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`);
      }
      if ('isReuse' in validatedData && item.isReuse !== currentItem.isReuse) {
        changedParts.push(item.isReuse ? "Marcado para reaproveitamento" : "Reaproveitamento removido");
      }
      if ('quantity' in validatedData && item.quantity !== currentItem.quantity) {
        // Numa peça já em produção, "15 → 10" sozinho não explica nada seis
        // meses depois. O contexto físico (o que já existe impresso) e o m²
        // resultante vão junto — é o que responde "por que o fechamento mudou".
        const contexto = COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status)
          ? ` Já produzidas ${(currentItem.quantityProduced ?? 0) + (currentItem.reuseQty ?? 0)},`
            + ` conferidas ${currentItem.conferredQty ?? 0}, entregues ${currentItem.deliveredQty ?? 0}.`
            + (item.calculatedM2 !== currentItem.calculatedM2 ? ` m²: ${currentItem.calculatedM2} → ${item.calculatedM2}` : "")
          : "";
        changedParts.push(`Quantidade: ${currentItem.quantity ?? '—'} → ${item.quantity ?? '—'} un.${contexto}`);
      }
      if (promoveuParaProduzido) {
        changedParts.push("Saldo zerado pela redução — peça promovida para Produzido");
      }
      if ('type' in validatedData && item.type !== currentItem.type) {
        changedParts.push(`Tipo: ${currentItem.type ?? '—'} → ${item.type ?? '—'}`);
      }
      if ('material' in validatedData && item.material !== currentItem.material) {
        changedParts.push(`Material: ${currentItem.material ?? '—'} → ${item.material ?? '—'}`);
      }
      if ('finish' in validatedData && item.finish !== currentItem.finish) {
        changedParts.push(`Acabamento: ${currentItem.finish ?? '—'} → ${item.finish ?? '—'}`);
      }
      if ('fileWidth' in validatedData || 'fileHeight' in validatedData) {
        if (item.fileWidth !== currentItem.fileWidth || item.fileHeight !== currentItem.fileHeight) {
          changedParts.push(`Dimensões: ${currentItem.fileWidth ?? '?'}×${currentItem.fileHeight ?? '?'} → ${item.fileWidth ?? '?'}×${item.fileHeight ?? '?'}`);
        }
      }
      if ('observations' in validatedData && item.observations !== currentItem.observations) {
        changedParts.push("Observações atualizadas");
      }
      if ('approvalThumbUrl' in validatedData && item.approvalThumbUrl !== currentItem.approvalThumbUrl) {
        changedParts.push("Thumb de aprovação atualizado");
      }
      if ('finalFileUrl' in validatedData && item.finalFileUrl !== currentItem.finalFileUrl) {
        changedParts.push("Arquivo final atualizado");
      }
      if ('referenceUrl' in validatedData && item.referenceUrl !== currentItem.referenceUrl) {
        changedParts.push("Referência de arte atualizada");
      }
      if ('skipApproval' in validatedData && item.skipApproval !== currentItem.skipApproval) {
        changedParts.push(item.skipApproval ? "Aprovação de patrocinador dispensada" : "Aprovação de patrocinador reativada");
      }

      const auditDetails = changedParts.length > 0
        ? changedParts.join(" | ")
        : `Item "${item.type}" atualizado`;
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        auditDetails
      );
      
      // Recalculate event status if item status changed
      await updateEventStatus(item.eventId);

      broadcast({ type: "item_updated", item });

      // Redução de quantidade numa peça que a Gráfica já está produzindo: ela
      // precisa saber ANTES de imprimir a mais. (Aumento não cai aqui — em
      // produção ele é barrado acima com USE_COMPLEMENT.)
      //
      // NÃO acende destaque persistente na linha: reduzir não cria trabalho,
      // só corta meta. Um aviso no sino e a lista atualizada bastam.
      //
      // O broadcast extra usa "production_updated" de propósito: é o tipo que
      // já invalida '/api/items/approved' (a fila da Gráfica), que roda com
      // staleTime: Infinity — "item_updated" sozinho não a alcança.
      if (mudouQtd && COMPLEMENT_ALLOWED_STATUSES.includes(currentItem.status)) {
        const ev = await storage.getEvent(item.eventId);
        const notif = await storage.createNotification({
          type: "quantityReduced",
          message: `Quantidade reduzida: ${item.displayId} (${item.type}) — ${currentItem.quantity} → ${item.quantity} un.${ev ? ` — ${ev.name}` : ""}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["grafica"],
        });
        broadcast({ type: "production_updated", item });
        broadcast({ type: "notification_created", notification: notif });
      }

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete item (soft delete — preservado no histórico)
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA). Excluir não faz o
  // trabalho andar: tira a peça da frente. Barrar aqui deixaria LIXO PRESO —
  // a peça duplicada, o rascunho digitado errado e a linha que nunca deveria
  // existir ficariam para sempre num evento em que ninguém mais pode mexer,
  // poluindo o Painel Geral e a contagem do Detalhe do Evento. E o risco é
  // baixo pelos dois motivos que já valem hoje: a exclusão é SOFT (a peça vai
  // para a lixeira, com deletedAt) e RESTAURÁVEL pela rota de restauração,
  // com autor e data no audit log.
  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      // Gate de PAPEL — o único gate de permissão desta rota. Gráfica, Arte e
      // Atendimento seguem recebendo 403.
      if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Sem permissão para excluir peças" });
      }

      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      // ── Alcance da exclusão: solicitação = admin (decisão do dono) ────────
      // Havia uma lista de status bloqueados só para a solicitação, e ela
      // começava em "awaiting_submission": na prática o papel dono da peça não
      // conseguia excluir nem o próprio rascunho recém-criado, e cada engano de
      // digitação virava chamado para o administrador.
      //
      // A liberação é segura porque a exclusão aqui é SOFT (grava deletedAt, a
      // peça sai das listagens e continua no banco) e RESTAURÁVEL pela rota de
      // restauração — nada é destruído, e o audit log abaixo registra quem
      // excluiu, o quê e de qual evento. O gate de PAPEL continua: quem não é
      // admin nem solicitação segue tomando 403 logo acima.
      //
      // O que NÃO é regra de papel e por isso continua valendo para todo mundo,
      // inclusive admin: a integridade do complemento, logo abaixo.

      // Mãe com complemento vivo não some. O `ON DELETE SET NULL` da FK só
      // dispara em DELETE físico — aqui a exclusão é SOFT (deletedAt), então o
      // banco não limpa nada e o filho ficaria órfão, apontando para uma peça
      // invisível: a linha da Gráfica diria "COMPLEMENTO DE #0062" com #0062
      // fora de todas as listagens. Cancelar o complemento primeiro é a ordem
      // correta e é reversível.
      const complementosVivos = await storage.getLiveComplements(req.params.id).catch(() => []);
      if (complementosVivos.length > 0) {
        return res.status(409).json({
          error: `Esta peça tem ${complementosVivos.length} complemento(s) ativo(s) (${complementosVivos.map(c => c.displayId).join(", ")}). Cancele o complemento antes de excluir.`,
          code: "HAS_COMPLEMENTS",
          complements: complementosVivos.map(c => ({ id: c.id, displayId: c.displayId })),
        });
      }

      const success = await storage.deleteItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Create audit log
      //
      // O nome do evento entra no texto porque a exclusão é SOFT: a peça sai de
      // /api/items e o Histórico perde a única forma de saber a que evento ela
      // pertencia — a linha mais sensível da auditoria era a única que
      // renderizava "Evento desconhecido", sem ID e sem link.
      const eventoDaPeca = await storage.getEvent(item.eventId).catch(() => undefined);
      await createAuditLog(
        req,
        'deleted',
        'item',
        req.params.id,
        `Item "${item.type}" (${item.displayId})${eventoDaPeca ? ` do evento "${eventoDaPeca.name}"` : ""} excluído por ${req.userRole}`
      );

      broadcast({ type: "item_deleted", itemId: req.params.id, eventId: item.eventId });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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
        return res.status(409).json({ error: erroEventoFechado(fechadoComplemento) });
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
        return res.status(400).json({ error: error.errors?.[0]?.message ?? "Dados inválidos" });
      }
      console.error("[COMPLEMENTOS] falha ao criar complemento:", error);
      res.status(error?.httpStatus ?? 500).json({ error: error?.message ?? "Não foi possível criar o complemento" });
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
      res.status(error?.httpStatus ?? 500).json({ error: error?.message ?? "Não foi possível cancelar o complemento" });
    }
  });

  // Submit item for sponsor approval (Arte module)
  app.patch("/api/items/:id/submit-for-approval", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar para aprovação" });
      }
      
      const { approvalThumbUrl } = req.body;
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: empurra a peça para a fila do Atendimento (ou da Revisão).
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Only items that passed through vincular-patrocinadores (awaiting_submission) can be worked on
      if (currentItem.status !== "awaiting_submission") {
        return res.status(409).json({ 
          error: `Item não pode ser enviado para aprovação. Status atual: ${currentItem.status}. O item precisa passar pelo fluxo de Vincular Patrocinadores antes.`
        });
      }
      
      if (!approvalThumbUrl) {
        return res.status(400).json({ error: "approvalThumbUrl is required" });
      }
      
      // Check if item has sponsors linked
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      const hasSponsors = itemSponsors.length > 0;
      
      // Determine next status:
      // 1. If skipApproval is true → awaiting_creator_review
      // 2. If has sponsors → awaiting_sponsor_approval
      // 3. If no sponsors → awaiting_creator_review (skip sponsor approval)
      const shouldSkipApproval = currentItem.skipApproval === true || !hasSponsors;
      const nextStatus = shouldSkipApproval ? "awaiting_creator_review" : "awaiting_sponsor_approval";
      
      // If resubmitting after rejection (awaiting_submission) and going to sponsor approval,
      // reset all sponsor approval records back to 'pending' so Atendimento can re-review
      if (currentItem.status === "awaiting_submission" && nextStatus === "awaiting_sponsor_approval") {
        const existingApprovals = await storage.getItemSponsorApprovals(req.params.id);
        for (const approval of existingApprovals) {
          // Reset any non-approved status back to pending
          if (['awaiting_arte', 'new_version_pending', 'rejected'].includes(approval.status)) {
            await storage.updateItemSponsorApproval(approval.id, {
              status: 'pending',
              approvedBy: null,
              approvedAt: null,
              rejectedBy: null,
              rejectedAt: null,
              rejectionReason: null,
            });
          }
        }
      }

      const itemUpdates: any = { 
        status: nextStatus,
        // Limpa flag de reprovação pelo criador quando item é reenviado
        // rejectedBySponsor permanece até ser aprovado pelo patrocinador novamente
        rejectedByCreator: false,
      };
      if (approvalThumbUrl) {
        itemUpdates.approvalThumbUrl = approvalThumbUrl;
      }
      
      const item = await storage.updateItem(req.params.id, itemUpdates);
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      if (shouldSkipApproval) {
        // Pula aprovação do patrocinador e vai direto para revisão da Solicitação
        await createAuditLog(
          req,
          'updated',
          'item',
          item.id,
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)} (sem aprovação de patrocinador)`
        );
        
        // Notifica Solicitação para revisar
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando revisão da Solicitação: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["solicitacao"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      } else {
        // Fluxo padrão: vai para aprovação do patrocinador
        
        // Inicializar registros de aprovação para cada patrocinador
        await storage.initializeItemSponsorApprovals(
          req.params.id, 
          itemSponsors.map(s => s.sponsorId)
        );
        
        await createAuditLog(
          req,
          'updated',
          'item',
          item.id,
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)}`
        );
        
        // Notifica Atendimento para aprovar com patrocinador
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando aprovação do patrocinador: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["atendimento"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Sponsor approves item (Atendimento module)
  app.patch("/api/items/:id/sponsor-approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA — e é LITERALMENTE o caso que o dono viu em produção ("encerrar
      // eventos e conseguirem aprovar ainda"). A tela do Atendimento já esconde
      // a peça; a ficha do Painel Geral, não.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não pode ser aprovado pelo patrocinador. Status atual: ${currentItem.status}, esperado: awaiting_sponsor_approval`
        });
      }

      const item = await storage.updateItem(req.params.id, {
        status: "sponsor_approved",
        sponsorApprovedBy: req.userName,
        sponsorApprovedAt: new Date(),
        // Limpa flag de reprovação pelo patrocinador quando aprovado
        rejectedBySponsor: false,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'approved',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")} (aprovado pelo patrocinador)`
      );
      
      // Notifica Arte para finalizar o layout e adicionar arquivo final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Patrocinador aprovou o item. Finalize o layout e adicione o arquivo final: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte dispenses item (bypasses remaining approval steps → ready_for_production)
  app.patch("/api/items/:id/dispense", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem dispensar itens" });
      }
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Item not found" });
      // ANDA: a dispensa PULA a aprovação e joga a peça direto na fila da
      // Gráfica — o gesto que mais rápido vira lona impressa.
      if (await barraEventoFinalizado(currentItem, res)) return;
      const dispensableStatuses = ["awaiting_submission", "awaiting_sponsor_approval", "sponsor_approved", "awaiting_creator_review"];
      if (!dispensableStatuses.includes(currentItem.status)) {
        return res.status(409).json({ error: `Item não pode ser dispensado no status atual: ${currentItem.status}` });
      }
      const { reason } = req.body;
      await storage.updateItem(req.params.id, { status: "ready_for_production" });
      await createAuditLog(
        req,
        "dispensed",
        "item",
        req.params.id,
        `Peça dispensada pela Arte. Status anterior: ${currentItem.status}${reason ? `. Motivo: ${reason}` : ''}`
      );

      // A dispensa PULA a aprovação e joga a peça direto na fila da Gráfica —
      // era a única transição do fluxo que fazia isso em silêncio: nenhum
      // broadcast, nenhuma notificação e um `{success:true}` que não deixava o
      // cliente atualizar nada. A peça aparecia na Gráfica só no próximo F5, e
      // ninguém do chão de fábrica sabia que ela tinha entrado.
      // Espelha o que /submit-for-approval faz logo acima.
      const item = await storage.getItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item not found" });
      const event = await storage.getEvent(item.eventId);

      const notification = await storage.createNotification({
        type: "itemAdded",
        message: `Peça liberada sem aprovação: ${item.type}${event ? ` — ${event.name}` : ""}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      // Devolve O ITEM (não `{success:true}`): é o contrato das rotas irmãs, e
      // é o que permite ao cliente ler o novo status sem outro round-trip.
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Sponsor rejects item (Atendimento module)
  app.patch("/api/items/:id/sponsor-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem reprovar pelo patrocinador" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: reprovar devolve a peça para a Arte refazer — trabalho novo,
      // numa fila que não mostra mais essa peça.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não pode ser reprovado pelo patrocinador. Status atual: ${currentItem.status}, esperado: awaiting_sponsor_approval`
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_submission",
        sponsorApprovedBy: null,
        sponsorApprovedAt: null,
        rejectedBySponsor: true, // Flag indicando que foi reprovado pelo patrocinador
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_submission")} (reprovado pelo patrocinador)`
      );
      
      // Notifica Arte para refazer o trabalho
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Patrocinador reprovou o item. Refaça o thumb de aprovação: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== Individual Sponsor Approval Endpoints ==========

  // Get sponsor approvals for an item
  app.get("/api/items/:id/sponsor-approvals", requireAuth, async (req, res) => {
    try {
      const approvals = await storage.getItemSponsorApprovals(req.params.id);
      
      // Enrich with sponsor names
      const sponsors = await storage.getAllSponsors();
      const sponsorMap = new Map(sponsors.map(s => [s.id, s]));
      
      const enrichedApprovals = approvals.map(approval => ({
        ...approval,
        sponsor: sponsorMap.get(approval.sponsorId) || null
      }));
      
      res.json(enrichedApprovals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Individual sponsor approves item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // ANDA: aprovação por patrocinador — o mesmo buraco do /sponsor-approve,
      // por outra porta (é esta que a tela de Atendimento usa hoje).
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não está aguardando aprovação do patrocinador. Status atual: ${currentItem.status}`
        });
      }

      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }

      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      // Prevent approving a sponsor that is waiting for Arte to resubmit
      if (approval && approval.status === 'awaiting_arte') {
        return res.status(409).json({ error: "Aguardando nova versão da Arte para este patrocinador. Não é possível aprovar agora." });
      }
      
      if (approval) {
        // Update existing approval
        approval = await storage.updateItemSponsorApproval(approval.id, {
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          itemId,
          sponsorId,
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
        });
      }
      
      // Get sponsor name for audit log
      const sponsor = await storage.getSponsor(sponsorId);
      
      await createAuditLog(
        req,
        'approved',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" aprovou o item`
      );
      
      // Check if ALL sponsors have approved
      const allApprovals = await storage.getItemSponsorApprovals(itemId);
      const allApproved = itemSponsors.every(is => {
        const sponsorApproval = allApprovals.find(a => a.sponsorId === is.sponsorId);
        return sponsorApproval && sponsorApproval.status === 'approved';
      });
      
      if (allApproved) {
        // All sponsors approved - advance item status
        const item = await storage.updateItem(itemId, {
          status: "sponsor_approved",
          sponsorApprovedBy: req.userName,
          sponsorApprovedAt: new Date(),
          rejectedBySponsor: false,
        });
        
        const event = await storage.getEvent(currentItem.eventId);
        
        await createAuditLog(
          req,
          'approved',
          'item',
          itemId,
          `Todos os patrocinadores aprovaram. Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")}`
        );
        
        // Notify Arte to add final file
        const notification = await storage.createNotification({
          type: "arteApproved",
          message: `Todos os patrocinadores aprovaram. Finalize o layout e adicione o arquivo final: ${currentItem.type} - Evento: ${event?.name}`,
          eventId: currentItem.eventId,
          itemId: itemId,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
        
        res.json({ approval, item, allApproved: true });
      } else {
        // Not all sponsors approved yet
        broadcast({ type: "sponsor_approval_updated", itemId, approval });
        res.json({ approval, allApproved: false });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Individual sponsor rejects item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem reprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      const { rejectionReason } = req.body;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // ANDA: reprovar por patrocinador manda a Arte fazer uma versão nova.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `Item não está aguardando aprovação do patrocinador. Status atual: ${currentItem.status}`
        });
      }

      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }

      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      if (approval) {
        // Update existing approval
        approval = await storage.updateItemSponsorApproval(approval.id, {
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
          approvedBy: null,
          approvedAt: null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          itemId,
          sponsorId,
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
        });
      }
      
      // Get sponsor name for audit log and notification
      const sponsor = await storage.getSponsor(sponsorId);
      const event = await storage.getEvent(currentItem.eventId);
      
      // Item stays in awaiting_sponsor_approval — only leaves when ALL sponsors approve
      const item = (await storage.updateItem(itemId, {
        rejectedBySponsor: true,
      }))!;
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" reprovou o item. Item aguarda nova versão da Arte${rejectionReason ? `. Motivo: ${rejectionReason}` : ''}`
      );
      
      // Notify Arte to prepare a new version for this sponsor
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Patrocinador "${sponsor?.name}" reprovou. Envie nova arte para: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "notification_created", notification });
      
      res.json({ 
        approval, 
        item, 
        message: `Reprovação registrada. Item aguarda nova arte para o patrocinador.`
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin reverts an individual sponsor approval back to "pending" — for when
  // atendimento aprovou/reprovou o patrocinador errado por engano. Reabre o
  // item para aprovação se ele já havia avançado por essa aprovação.
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/revert", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem reverter uma aprovação" });
      }

      const { id: itemId, sponsorId } = req.params;

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }

      // ANDA (e aqui foi uma DECISÃO, não um automatismo): "reverter" soa como
      // arrumar a casa, mas o efeito é REABRIR a rodada — devolve o item de
      // "sponsor_approved" para "awaiting_sponsor_approval", ou seja, recria
      // uma pendência de aprovação numa fila que não mostra mais essa peça.
      // Num evento vivo é correção; num evento morto é trabalho fantasma.
      // Vale a regra do dono para os casos duvidosos: barra — o admin que
      // precisar mesmo corrigir reabre o evento, que é barato.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
      if (!approval) {
        return res.status(404).json({ error: "Aprovação não encontrada para este patrocinador" });
      }
      if (approval.status === "pending") {
        return res.status(409).json({ error: "Esta aprovação já está pendente" });
      }

      const previousStatus = approval.status;
      const updatedApproval = await storage.updateItemSponsorApproval(approval.id, {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      });

      // Se o item já havia avançado por conta desta aprovação (todos aprovados),
      // reabre para aprovação do patrocinador — senão o item ficaria "aprovado"
      // com um patrocinador pendente por baixo.
      let item = currentItem;
      if (currentItem.status === "sponsor_approved") {
        item = (await storage.updateItem(itemId, {
          status: "awaiting_sponsor_approval",
          sponsorApprovedBy: null,
          sponsorApprovedAt: null,
          rejectedBySponsor: false,
        }))!;
      }

      const sponsor = await storage.getSponsor(sponsorId);

      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Administrador reverteu a aprovação de "${sponsor?.name || sponsorId}" para pendente (estava: ${previousStatus})${item.status !== currentItem.status ? `. Item reaberto: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}` : ''}`
      );

      broadcast({ type: "sponsor_approval_updated", itemId, approval: updatedApproval });
      if (item.status !== currentItem.status) {
        broadcast({ type: "item_updated", item });
      }

      res.json({ approval: updatedApproval, item });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte submits new version for specific sponsors (correção)
  app.post("/api/items/:id/sponsor-approvals/resubmit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar nova versão" });
      }

      const { id: itemId } = req.params;
      const { newThumbUrl, sponsorIds } = req.body as { newThumbUrl: string; sponsorIds: string[] };

      if (!newThumbUrl) {
        return res.status(400).json({ error: "newThumbUrl é obrigatório" });
      }
      if (!sponsorIds || sponsorIds.length === 0) {
        return res.status(400).json({ error: "Selecione pelo menos um patrocinador" });
      }

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      // ANDA: nova versão de arte volta a cobrar revisão do Atendimento.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ error: "Item não está aguardando aprovação do patrocinador" });
      }

      // Update each selected sponsor approval: awaiting_arte → new_version_pending
      for (const sponsorId of sponsorIds) {
        const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
        if (approval && approval.status === "awaiting_arte") {
          await storage.updateItemSponsorApproval(approval.id, {
            status: "new_version_pending",
          });
        }
      }

      // Update item thumb with the new version
      const item = await storage.updateItem(itemId, {
        approvalThumbUrl: newThumbUrl,
        rejectedBySponsor: false,
      });

      const event = await storage.getEvent(currentItem.eventId);

      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Arte enviou nova versão do thumb para ${sponsorIds.length} patrocinador(es). Aguarda revisão do Atendimento.`
      );

      // Notify Atendimento
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Nova versão de arte enviada. Revise o thumb: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["atendimento"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      res.json({ item, message: "Nova versão enviada. Atendimento notificado." });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Initialize sponsor approvals when sending item for approval
  app.post("/api/items/:id/initialize-sponsor-approvals", requireAuth, async (req, res) => {
    // Irmã de resubmit (arte+admin); estava sem gate — e sem caller no client.
    if (!["arte", "admin"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão" });
    }
    try {
      const itemId = req.params.id;

      // ANDA: (re)inicializar zera as aprovações e abre uma rodada NOVA de
      // cobrança de patrocinador. Precisa do item só para chegar ao evento.
      const alvo = await storage.getItem(itemId);
      if (!alvo) return res.status(404).json({ error: "Item não encontrado" });
      if (await barraEventoFinalizado(alvo, res)) return;

      // Get item sponsors
      const itemSponsors = await storage.getItemSponsors(itemId);

      if (itemSponsors.length === 0) {
        return res.status(400).json({ error: "Item não possui patrocinadores vinculados" });
      }
      
      // Initialize approval records for all sponsors
      await storage.initializeItemSponsorApprovals(
        itemId, 
        itemSponsors.map(s => s.sponsorId)
      );
      
      const approvals = await storage.getItemSponsorApprovals(itemId);

      // Zera as aprovações de patrocinador da peça e não deixava rastro nenhum:
      // quem consultasse a ficha via um "Pat. Aprovou" desaparecer sem que nada
      // dissesse quem reabriu a rodada.
      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Aprovações de patrocinador (re)inicializadas para ${itemSponsors.length} patrocinador(es)`
      );

      res.json(approvals);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ========== End Individual Sponsor Approval Endpoints ==========

  // Arte submits final file after sponsor approval
  app.patch("/api/items/:id/submit-final-file", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar arquivo final" });
      }
      
      // Validate request body with Zod
      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio"),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      
      const validatedData = finalFileSchema.parse(req.body);
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: o arquivo final leva a peça para a Revisão Final e, dali, para a
      // Gráfica.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // sponsor_approved: normal flow after sponsor approval
      // awaiting_creator_review: skipApproval / no-sponsor flow (sponsor approval skipped)
      if (currentItem.status !== "sponsor_approved" && currentItem.status !== "awaiting_creator_review") {
        return res.status(409).json({ 
          error: `Item não pode receber arquivo final. Status atual: ${currentItem.status}, esperado: sponsor_approved ou awaiting_creator_review` 
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_final_review")} (arquivo final adicionado)`
      );
      
      // Notifica Solicitação para revisão final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Arquivo final pronto para revisão: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Arte atualiza o caminho do arquivo final já enviado (sem mudar o status do item)
  // Troca o thumb de aprovação já existente, preservando o anterior. Serve para
  // corrigir o material de referência sem reabrir a aprovação dos patrocinadores
  // (para isso existe a rota de reenvio, que muda o status).
  app.patch("/api/items/:id/update-thumb", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o thumb" });
      }

      const { approvalThumbUrl } = z
        .object({ approvalThumbUrl: z.string().min(1, "approvalThumbUrl não pode estar vazio") })
        .parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      // ANDA: trocar o thumb é refazer o material que os patrocinadores olham.
      if (await barraEventoFinalizado(currentItem, res)) return;
      if (!currentItem.approvalThumbUrl) {
        return res.status(409).json({ error: "Este item ainda não possui um thumb enviado" });
      }
      if (currentItem.approvalThumbUrl === approvalThumbUrl) {
        return res.status(409).json({ error: "O thumb enviado é igual ao atual" });
      }

      const prevUrl = currentItem.approvalThumbUrl;

      const item = await storage.updateItem(req.params.id, {
        approvalThumbUrl,
        previousApprovalThumbUrl: prevUrl,
        approvalThumbUpdatedAt: new Date(),
      });
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Thumb de aprovação atualizado por ${req.userName}. Anterior: ${prevUrl} → Novo: ${approvalThumbUrl}`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/items/:id/update-final-file", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o arquivo final" });
      }

      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "finalFileUrl não pode estar vazio"),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      const validatedData = finalFileSchema.parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      // ANDA: substituir o arquivo final notifica a Gráfica para RE-VERIFICAR
      // antes de produzir e ainda propaga a arte nova para os complementos —
      // é um pedido de reimpressão disfarçado de correção de arquivo.
      if (await barraEventoFinalizado(currentItem, res)) return;
      if (!currentItem.finalFileUrl) {
        return res.status(409).json({ error: "Este item ainda não possui um arquivo final enviado" });
      }

      const prevUrl  = currentItem.finalFileUrl;
      const prevName = currentItem.finalFileName || null;

      const item = await storage.updateItem(req.params.id, {
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
        previousFinalFileUrl:  prevUrl,
        previousFinalFileName: prevName,
      });
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Arquivo final substituído por ${req.userName}. Anterior: ${prevUrl} → Novo: ${validatedData.finalFileUrl}`
      );

      // Notifica gráfica que o arquivo foi trocado e precisa ser re-verificado
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `⚠ Arquivo final atualizado: ${item.type}${event ? ` — ${event.name}` : ""} (verifique antes de produzir)`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      // ── Propaga a arte nova para os COMPLEMENTOS vivos ────────────────────
      // O complemento é a MESMA peça, com a mesma arte — só a quantidade é
      // nova. Sem propagar, #0062-C1 continuaria carregando o arquivo antigo e
      // a Gráfica imprimiria a versão errada: refugo real, dinheiro perdido,
      // e o pior tipo de erro (nada na tela indica que está errado).
      // Só alcança complementos que ainda NÃO foram produzidos — reescrever a
      // arte de um lote já impresso seria mentir sobre o que está no galpão.
      try {
        const complementos = await storage.getLiveComplements(item.id);
        const aindaNaoImpressos = complementos.filter(
          (c) => (c.quantityProduced ?? 0) === 0 && (c.reuseQty ?? 0) === 0,
        );
        for (const c of aindaNaoImpressos) {
          await storage.updateItem(c.id, {
            finalFileUrl: item.finalFileUrl,
            finalFileName: item.finalFileName,
            finalPreviewUrl: item.finalPreviewUrl,
            finalFileUpdatedAt: item.finalFileUpdatedAt,
            previousFinalFileUrl: prevUrl,
            previousFinalFileName: prevName,
          });
          await createAuditLog(
            req,
            'updated', 'item', c.id,
            `Arquivo final propagado da peça original ${item.displayId} (arte substituída pela Arte)`,
          );
        }
        if (aindaNaoImpressos.length > 0) {
          const notifCompl = await storage.createNotification({
            type: "arteApproved",
            message: `⚠ Arquivo final atualizado também no(s) complemento(s) ${aindaNaoImpressos.map(c => c.displayId).join(", ")} — verifique antes de produzir`,
            eventId: item.eventId,
            itemId: aindaNaoImpressos[0].id,
            targetRoles: ["grafica"],
          });
          broadcast({ type: "production_updated", item: aindaNaoImpressos[0] });
          broadcast({ type: "notification_created", notification: notifCompl });
        }
      } catch (e: any) {
        // Migração pendente (42703) ou falha na propagação não pode derrubar a
        // troca de arquivo da peça principal, que já foi commitada.
        console.error("[COMPLEMENTOS] falha ao propagar arquivo final:", e?.message ?? e);
      }

      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator reviews and releases item for production (Solicitação module)
  app.patch("/api/items/:id/creator-review", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem revisar como criador do evento" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: liberar para produção é o gesto que autoriza imprimir. Vem ANTES
      // do atalho idempotente logo abaixo de propósito — num evento finalizado
      // a resposta certa é 409, e não um 200 silencioso.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Idempotente: se a peça JÁ foi liberada (ou já avançou na produção), não
      // é erro clicar "Liberar" de novo (lista desatualizada / clique duplo) —
      // só devolve a peça como sucesso, sem reprocessar.
      const alreadyReleased = [
        "ready_for_production", "approved", "pronto_para_producao", "liberado",
        "inProduction", "em_producao", "produced", "produzido", "conferred", "delivered", "entregue",
      ].includes(currentItem.status);
      if (alreadyReleased) {
        return res.json(currentItem);
      }
      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({
          error: `Item não pode ser revisado pelo criador. Status atual: ${translateStatus(currentItem.status)}, esperado: Aguardando Revisão Final`
        });
      }

      // Reaproveitamento parcial: body pode trazer { reuseQty } quando a Solicitação
      // quer reaproveitar só algumas unidades, enviando o restante para produção.
      const rawReuseQty = req.body?.reuseQty != null ? Number(req.body.reuseQty) : undefined;
      const askedReuse = rawReuseQty != null && !isNaN(rawReuseQty) && rawReuseQty > 0;
      // Pedir a quantidade inteira pelo campo do parcial é reaproveitamento
      // total. Antes esse caso caía fora das duas condições e a peça seguia para
      // produção como se nada tivesse sido pedido, sem aviso nenhum.
      const isFullReuse = currentItem.isReuse || (askedReuse && rawReuseQty! >= currentItem.quantity);
      const isPartialReuse = askedReuse && !isFullReuse;

      // O botão do client já exige arquivo final, mas a liberação em lote e o
      // atalho de teclado chegavam aqui sem ele — e uma peça sem arquivo
      // liberada para produção trava a Gráfica. Reaproveitamento TOTAL
      // dispensa (não produz nada); parcial produz o restante e precisa.
      if (!currentItem.finalFileUrl && !isFullReuse) {
        return res.status(409).json({
          error: "A peça ainda não tem arquivo final — a Arte precisa enviá-lo antes da liberação."
        });
      }

      // Peças de reaproveitamento total não passam pela produção: já entram como produzidas.
      // Reaproveitamento parcial vai para ready_for_production (as demais unidades precisam produzir).
      const nextStatus = isFullReuse ? "produced" : "ready_for_production";

      // Pre-fetch event for notification message (read outside tx — no lock needed)
      const event = await storage.getEvent(currentItem.eventId);

      const auditDetails = isFullReuse
        ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("produced")} (reaproveitamento — não precisa produzir)`
        : isPartialReuse
          ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (reaproveitamento parcial: ${rawReuseQty} un. de ${currentItem.quantity}, ${currentItem.quantity - rawReuseQty!} a produzir)`
          : `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (liberado para produção)`;

      // Atomic: item update + audit log + notification.
      const { item, notification } = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({
            status: nextStatus,
            creatorReviewedAt: new Date(),
            hasModifiedData: false,
            updatedAt: new Date(),
            ...(isPartialReuse ? { reuseQty: rawReuseQty!, isReuse: false } : {}),
            ...(isFullReuse ? { reuseQty: currentItem.quantity, isReuse: true } : {}),
          })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "approved",
          entityType: "item",
          entityId: updated.id,
          details: auditDetails,
        });

        const [notif] = await tx.insert(notifications).values({
          type: "arteApproved",
          message: `Criador do evento liberou item para produção: ${updated.type} - Evento: ${event?.name}`,
          eventId: updated.eventId,
          itemId: updated.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        }).returning();

        return { item: updated, notification: notif };
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 400).json({ error: error.message });
    }
  });

  // Creator rejects item and sends back to Arte (Solicitação module)
  app.patch("/api/items/:id/creator-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem reprovar itens" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: reprovar APAGA o arquivo final e o thumb e devolve a peça para a
      // Arte refazer — destrói material e cria trabalho de uma vez só.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({
          error: `Item não pode ser reprovado pelo criador. Status atual: ${currentItem.status}, esperado: awaiting_final_review`
        });
      }

      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_submission",
        creatorReviewedAt: null,
        finalFileUrl: null,
        approvalThumbUrl: null,
        // Mantém sponsorApprovedBy/sponsorApprovedAt para preservar o contexto da aprovação anterior
        rejectedByCreator: true, // Flag indicando que foi reprovado pelo criador
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_submission")} (reprovado pelo criador)`
      );
      
      // Notifica Arte para refazer o trabalho
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador do evento reprovou o item. Refaça o thumb de aprovação: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Creator returns item to Arte with modification notes (Solicitação module)
  app.patch("/api/items/:id/return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem devolver itens" });
      }
      
      const { notes } = req.body;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: devolver para a Arte com observações é pedir retrabalho.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_final_review") {
        return res.status(409).json({ error: `Item não pode ser devolvido. Status atual: ${currentItem.status}` });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_submission",
        creatorReviewedAt: null,
        finalFileUrl: null,
        approvalThumbUrl: null,
        rejectedByCreator: true,
        // O motivo da devolução SUBSTITUI a observação: motivo vazio não pode
        // herdar a observação antiga como se fosse o feedback desta devolução.
        observations: notes ?? "",
        hasModifiedData: true, // Flag: Arte precisa revisar dados modificados
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const event = await storage.getEvent(item.eventId);
      const detailMsg = notes ? ` Observações: ${notes}` : "";
      const modifiedDataMsg = currentItem.hasModifiedData ? " ⚠️ DADOS MODIFICADOS: Verifique Quantidade, m² Total e Medida!" : "";
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Item devolvido para Arte para modificações.${detailMsg}${modifiedDataMsg}`
      );
      
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador devolveu item para modificações: ${item.type} - Evento: ${event?.name}${detailMsg}${modifiedDataMsg}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk return to Arte with notes
  app.patch("/api/items/bulk-return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem devolver itens" });
      }
      
      const { itemIds, notes } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results = [];
      const errors = [];
      // ANDA: mesma devolução do individual, multiplicada.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Item não encontrado" });
          continue;
        }

        const motivoEvento = await motivoEventoDaPeca(currentItem);
        if (motivoEvento) {
          errors.push({ itemId, error: bloqueio.registra(motivoEvento) });
          continue;
        }

        if (currentItem.status !== "awaiting_final_review") {
          errors.push({ itemId, error: `Status inválido: ${currentItem.status}` });
          continue;
        }

        const item = await storage.updateItem(itemId, {
          status: "awaiting_submission",
          creatorReviewedAt: null,
          finalFileUrl: null,
          approvalThumbUrl: null,
          rejectedByCreator: true,
          // `?? ""` (e não `|| currentItem.observations`): o return individual
          // substitui a observação — o lote herdava a antiga silenciosamente.
          observations: notes ?? "",
        });

        if (item) {
          results.push(item);
          await createAuditLog(
            req,
            'rejected',
            'item',
            item.id,
            `Item devolvido para Arte para modificações (em lote).`
          );
          broadcast({ type: "item_updated", item });
        }
      }

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      if (results.length > 0) {
        const detailMsg = notes ? ` Observações: ${notes}` : "";
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Criador devolveu ${results.length} item(ns) para modificações.${detailMsg}`,
          eventId: results[0].eventId,
          itemId: null,
          targetRoles: ["arte"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json({ success: results.length, errors: errors.length, items: results, failedItemIds: errors.map(e => e.itemId) });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Cancel item (item disappears from workflow but stays in events)
  app.patch("/api/items/:id/cancel", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem cancelar itens" });
      }
      
      const { notes } = req.body;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
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

      const item = await storage.updateItem(req.params.id, {
        status: "canceled",
        observations: notes || currentItem.observations,
      });

      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }

      const detailMsg = notes ? ` Motivo: ${notes}` : "";
      await createAuditLog(
        req,
        'canceled',
        'item',
        item.id,
        `Item cancelado${detailMsg}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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
      
      const results = [];
      // Mesma decisão (e mesma dúvida) do cancelamento individual acima.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) continue;

        const motivoEvento = await motivoEventoDaPeca(currentItem);
        if (motivoEvento) {
          bloqueio.registra(motivoEvento);
          continue;
        }

        const item = await storage.updateItem(itemId, {
          status: "canceled",
          observations: notes || currentItem.observations,
        });
        if (item) {
          results.push(item);
          const detailMsg = notes ? ` Motivo: ${notes}` : "";
          await createAuditLog(
            req,
            'canceled', 'item', item.id, `Item cancelado (em lote)${detailMsg}`);
          broadcast({ type: "item_updated", item });
        }
      }

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      res.json({ canceled: results.length, items: results });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update item fields (Solicitação module - can edit)
  app.patch("/api/items/:id/edit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem editar itens" });
      }
      
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // ANDA: é a irmã do PATCH genérico — muda quantidade, material, medidas e
      // m². Mesmo motivo, mesma guarda.
      if (await barraEventoFinalizado(currentItem, res)) return;

      const { type, quantity, description, fileWidth, fileHeight, material, finish, calculatedM2, measurement } = req.body;

      // Valores efetivos após o merge (novo valor ou o atual).
      const effQuantity = quantity !== undefined ? quantity : currentItem.quantity;
      const effFileWidth = fileWidth !== undefined ? fileWidth : currentItem.fileWidth;
      const effFileHeight = fileHeight !== undefined ? fileHeight : currentItem.fileHeight;
      // m² recalculado no servidor quando derivável; senão mantém o recebido/atual.
      const derivedM2 = deriveCalculatedM2({
        quantity: effQuantity,
        fileWidth: effFileWidth,
        fileHeight: effFileHeight,
      });
      const effCalculatedM2 =
        derivedM2 ?? (calculatedM2 !== undefined ? calculatedM2 : currentItem.calculatedM2);

      const item = await storage.updateItem(req.params.id, {
        type: type || currentItem.type,
        quantity: effQuantity,
        description: description !== undefined ? description : currentItem.description,
        fileWidth: effFileWidth,
        fileHeight: effFileHeight,
        material: material || currentItem.material,
        finish: finish || currentItem.finish,
        calculatedM2: effCalculatedM2,
        measurement: measurement !== undefined ? measurement : currentItem.measurement,
      });
      
      if (!item) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      const editDetails = [];
      if (type && type !== currentItem.type) editDetails.push(`Tipo: ${currentItem.type} → ${type}`);
      if (material && material !== currentItem.material) editDetails.push(`Material: ${currentItem.material} → ${material}`);
      if (finish && finish !== currentItem.finish) editDetails.push(`Acabamento: ${currentItem.finish} → ${finish}`);
      if (quantity !== undefined && quantity !== currentItem.quantity) editDetails.push(`Quantidade: ${currentItem.quantity} → ${quantity}`);
      if (effCalculatedM2 !== currentItem.calculatedM2) editDetails.push(`m² Total: ${currentItem.calculatedM2} → ${effCalculatedM2}`);
      if (measurement !== undefined && measurement !== currentItem.measurement) editDetails.push(`Medida: ${currentItem.measurement} → ${measurement}`);
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Item editado${editDetails.length > 0 ? ': ' + editDetails.join(', ') : ''}`
      );
      
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk creator reject (Solicitação module)
  app.patch("/api/items/bulk-creator-reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "solicitacao" && req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem reprovar itens" });
      }
      
      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array não vazio" });
      }
      
      const results = [];
      const errors = [];
      // ANDA: mesma reprovação do individual, multiplicada.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Item não encontrado" });
          continue;
        }

        const motivoEvento = await motivoEventoDaPeca(currentItem);
        if (motivoEvento) {
          errors.push({ itemId, error: bloqueio.registra(motivoEvento) });
          continue;
        }

        if (currentItem.status !== "awaiting_final_review") {
          errors.push({ itemId, error: `Status inválido: ${currentItem.status}` });
          continue;
        }

        const item = await storage.updateItem(itemId, {
          status: "awaiting_submission",
          creatorReviewedAt: null,
          finalFileUrl: null,
          approvalThumbUrl: null,
          // Mantém sponsorApprovedBy/sponsorApprovedAt para preservar o contexto da aprovação anterior
          rejectedByCreator: true,
        });
        
        if (item) {
          results.push(item);
          
          const event = await storage.getEvent(item.eventId);
          
          await createAuditLog(
            req,
            'rejected',
            'item',
            item.id,
            `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_submission")} (reprovado pelo criador em lote)`
          );
          
          broadcast({ type: "item_updated", item });
        }
      }
      
      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      // Notifica Arte uma vez para todos os itens
      if (results.length > 0) {
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Criador reprovou ${results.length} item(ns). Refaça os thumbs de aprovação.`,
          eventId: results[0].eventId,
          itemId: null,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "notification_created", notification });
      }
      
      // Extrair apenas os IDs dos itens com erro
      const failedItemIds = errors.map(e => e.itemId);
      
      res.json({ 
        success: results.length, 
        errors: errors.length,
        items: results,
        failedItemIds,
        errorDetails: errors
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Approve item (Arte module) - DEPRECATED: Use new approval workflow
  app.patch("/api/items/:id/approve", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Solicitação podem liberar itens para produção" });
      }
      // Pre-fetch event for notification message (read outside tx — no row lock needed)
      const preItem = await storage.getItem(req.params.id);
      if (!preItem) return res.status(404).json({ error: "Item not found" });
      // ANDA: caminho antigo do "liberar para produção". Depreciado, mas
      // registrado — e uma rota registrada é uma rota chamável.
      if (await barraEventoFinalizado(preItem, res)) return;
      const event = await storage.getEvent(preItem.eventId);

      // Atomic: item status update + audit log + notification in one transaction.
      // If any step fails the entire operation rolls back — no partial state in the DB.
      const { item, notification } = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({ status: "approved", approvedAt: new Date(), updatedAt: new Date() })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "approved",
          entityType: "item",
          entityId: updated.id,
          // "liberado para produção" e não "aprovado": é a MESMA frase que
          // /creator-review grava, e é por ela que o Histórico reconhece que a
          // liberação já tem registro próprio. Com a redação antiga o cliente
          // não achava o log e emitia POR CIMA uma linha "Lib. p/ Produção"
          // sintetizada do carimbo da peça — sem autor, duplicando o evento.
          details: `Item "${updated.type}" liberado para produção`,
        });

        const [notif] = await tx.insert(notifications).values({
          type: "arteApproved",
          message: `Item liberado para produção: ${updated.type} - Evento: ${event?.name}`,
          eventId: updated.eventId,
          itemId: updated.id,
          targetRoles: ["grafica"],
        }).returning();

        return { item: updated, notification: notif };
      });

      // Broadcasts happen after commit — no point notifying if the TX rolled back.
      broadcast({ type: "item_approved", item });
      broadcast({ type: "notification_created", notification });

      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 500).json({ error: error.message });
    }
  });

  // Start production (Gráfica module)
  app.patch("/api/items/:id/start-production", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "grafica" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Gráfica podem iniciar produção" });
      }
      const { quantityProduced, expectedProduced } = req.body;

      if (!quantityProduced || quantityProduced <= 0) {
        return res.status(400).json({ error: "quantityProduced is required and must be greater than 0" });
      }

      // Read current state before the transaction (for audit log description and
      // to compute the new status — replicating startProduction logic inside tx).
      const before = await storage.getItem(req.params.id);
      if (!before) return res.status(404).json({ error: "Item not found" });
      // ANDA — e é o mais caro de todos: aqui a peça vira LONA IMPRESSA e ainda
      // gera ativos no Estoque. Imprimir para um evento que já aconteceu é
      // dinheiro queimado que nenhum estorno recupera.
      if (await barraEventoFinalizado(before, res)) return;

      // ── Concorrência: `quantityProduced` é ABSOLUTO (total produzido até
      // agora), não incremental. Quando o cliente informa `expectedProduced`
      // (o total que ele leu na tela ao abrir o modal), o servidor confere que
      // ninguém lançou produção nesse meio-tempo. Sem isto, dois operadores no
      // galpão com a mesma peça aberta sobrescrevem um ao outro em silêncio:
      // o último a salvar apaga o lançamento do primeiro.
      // Campo OPCIONAL — clientes que não enviam seguem funcionando.
      const jaProduzido = before.quantityProduced ?? 0;
      if (expectedProduced != null && Number(expectedProduced) !== jaProduzido) {
        return res.status(409).json({
          error: `Outra pessoa lançou produção nesta peça: agora são ${jaProduzido} un. produzidas (você viu ${Number(expectedProduced)}). Confira o número e lance de novo.`,
          code: "PRODUCTION_CONFLICT",
          actualProduced: jaProduzido,
        });
      }

      // Teto: produzido + reaproveitado não pode passar da quantidade da peça —
      // sem isto qualquer número era aceito e virava esse total de ativos no
      // inventário quando a peça fechava como "produced".
      const itemQty = parseInt(before.quantity.toString());
      if (quantityProduced + (before.reuseQty || 0) > itemQty) {
        return res.status(400).json({
          error: `Quantidade inválida: ${quantityProduced} produzida(s) + ${before.reuseQty || 0} reaproveitada(s) excede as ${itemQty} un. da peça`,
        });
      }

      // Determine new status (same logic as storage.startProduction)
      const newProdStatus =
        quantityProduced + (before.reuseQty || 0) >= parseInt(before.quantity.toString())
          ? "produced"
          : "inProduction";
      const prodUpdateData: Record<string, unknown> = {
        status: newProdStatus,
        quantityProduced,
        updatedAt: new Date(),
        ...(!before.productionStartedAt ? { productionStartedAt: new Date() } : {}),
        // produced_at era coluna morta desde sempre: a peça fechava como
        // "Produzido" e a trilha temporal da ficha pulava direto de "Produção
        // iniciada" para "Conferido". Uma linha devolve a etapa.
        ...(newProdStatus === "produced" && !before.producedAt ? { producedAt: new Date() } : {}),
      };

      // Atomic: item status update + audit log in one transaction.
      const item = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set(prodUpdateData)
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: newProdStatus === "produced" ? "produced" : "production",
          entityType: "item",
          entityId: updated.id,
          details: `Produção: ${quantityProduced}/${updated.quantity} un. (${translateStatus(before.status)} → ${translateStatus(newProdStatus)})`
            // O campo é ABSOLUTO e por anos foi rotulado como incremental na
            // tela: quem produzia 6 de 10, voltava e digitava "4" REGREDIA o
            // total para 4 sem nenhum vestígio. Enquanto o número absoluto for
            // o contrato, ao menos a regressão deixa de ser silenciosa.
            + (quantityProduced < jaProduzido ? ` — ATENÇÃO: total produzido REDUZIDO de ${jaProduzido} para ${quantityProduced} un.` : ""),
        });

        return updated;
      });

      const event = await storage.getEvent(item.eventId);

      // Auto-add to inventory when fully produced — N individual records
      if (item.status === 'produced') {
        const existingAssets = await storage.getAssetsByOriginalItemId(item.id);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        // Get sponsors linked to this item
        const itemSponsorLinks = await storage.getItemSponsors(item.id);
        const linkedSponsorIds = itemSponsorLinks.map(s => s.sponsorId);
        // Get approvalThumbUrl from item
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        // Prefixo do ativo a partir do displayId da peça.
        // ANTES: displayId.replace(/[^0-9]/g,'') — que para "#0062" dava "0062"
        // (certo) mas para o complemento "#0062-C1" dava "00621", um código
        // ilegível que ainda por cima colide com a peça #0621. assetPrefix
        // devolve "0062" para a mãe (byte a byte idêntico ao anterior: zero
        // risco no acervo existente) e "0062C1" para o complemento.
        const itemNum = assetPrefix(item.displayId);
        // Complemento ganha rastro no próprio ativo — quem abre o Estoque seis
        // meses depois entende por que existem dois blocos da "mesma" peça.
        const assetNotes = item.parentItemId
          ? `Gráfica — Evento: ${event?.name ?? '—'} · Complemento de ${(await storage.getItem(item.parentItemId))?.displayId ?? '—'}`
          : `Gráfica — Evento: ${event?.name ?? '—'}`;

        const producedBy = (req as any).userName || 'Gráfica';
        const novoAtivo = (seq: number) => ({
          displayId: `#EST-${itemNum}-${seq}`,
          name: itemName,
          quantity: 1,
          originalItemId: item.id,
          condition: "PERFEITO" as const,
          location: null,
          franchiseTags,
          sponsorIds: linkedSponsorIds,
          approvalThumbUrl,
          trackingStatus: "NO_GALPAO" as const,
          notes: assetNotes,
          autoAdded: true,
        });

        if (existingAssets.length < quantityProduced) {
          // Numeração pelo MAIOR sufixo existente, nunca por contagem.
          // Com contagem, excluir o ativo #EST-0062-3 de um bloco de 5 fazia o
          // próximo lote recomeçar em -5 (que já existe) e o INSERT estourar
          // 23505 — um 500 lançado DEPOIS de a peça já ter sido marcada como
          // produzida, ou seja, com o item num estado que ninguém reproduz.
          const maiorSeq = existingAssets.reduce((max, a) => Math.max(max, assetSeqOf(a.displayId)), 0);
          const faltam = quantityProduced - existingAssets.length;
          const records = Array.from({ length: faltam }, (_, i) => novoAtivo(maiorSeq + i + 1));
          const created = await storage.createInventoryAssets(records);
          for (const a of created) {
            await createAuditLog({ userName: producedBy, userId: req.userId }, 'cadastrado', 'inventory_asset', a.id,
              JSON.stringify({ evento: event?.name ?? '—', itemId: item.id }));
          }
        }
        // Run lifecycle cron immediately so assets with past event dates
        // transition straight to EM_USO / AGUARDANDO_TRIAGEM without waiting for the next tick.
        runInventoryCron();
      }
      
      // Não notificar sobre início de produção
      
      broadcast({ type: "production_started", item });
      
      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 500).json({ error: error.message });
    }
  });

  // Gráfica marca unidades como reaproveitamento — total ou parcial. As unidades
  // reaproveitadas dispensam produção, mas continuam passando pela conferência
  // junto com as produzidas.
  app.post("/api/items/:id/mark-reuse", requireAuth, async (req, res) => {
    try {
      if ((req as any).userRole !== "grafica" && (req as any).userRole !== "admin" && (req as any).userRole !== "solicitacao") {
        return res.status(403).json({ error: "Apenas a Gráfica ou Solicitação pode marcar reaproveitamento" });
      }
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      // ANDA: marcar reaproveitamento move a peça no fluxo (pode fechá-la como
      // "Produzido") e, por tabela, cria ativo de inventário. É decisão de
      // produção, não registro do passado.
      if (await barraEventoFinalizado(current, res)) return;
      if (current.status === "delivered" || current.status === "entregue") {
        return res.status(409).json({ error: "Não é possível reaproveitar uma peça já entregue" });
      }
      // Permite marcar como reaproveitamento enquanto a peça ainda está no fluxo de produção
      const allowedStatuses = [
        "ready_for_production", "pronto_para_producao", "approved",
        "inProduction", "em_producao",
      ];
      if (!allowedStatuses.includes(current.status)) {
        return res.status(409).json({ error: `Status atual não permite reaproveitamento: ${translateStatus(current.status)}` });
      }

      const alreadyReused = current.reuseQty || 0;
      const produced = current.quantityProduced || 0;
      // O reuso não pode invadir o que já foi produzido.
      const room = current.quantity - alreadyReused - produced;
      if (room <= 0) {
        return res.status(409).json({ error: `Nada a reaproveitar: ${alreadyReused} reaproveitada(s) e ${produced} produzida(s) de ${current.quantity}.` });
      }

      // Sem quantidade no corpo, reaproveita tudo o que resta (comportamento antigo).
      const n = Math.min(room, Math.max(1, Number(req.body?.qty) || room));
      const newReuse = alreadyReused + n;
      const isFullReuse = newReuse >= current.quantity;
      // Fecha em "Produzido" quando reuso + produção cobrem a quantidade toda.
      const isReady = newReuse + produced >= current.quantity;

      const item = await storage.updateItem(req.params.id, {
        reuseQty: newReuse,
        isReuse: isFullReuse,
        ...(isReady ? { status: "produced" as const } : {}),
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        isFullReuse
          ? `Reaproveitamento total pela Gráfica: ${newReuse}/${current.quantity} un.`
          : `Reaproveitamento parcial pela Gráfica: ${n} un. (${newReuse}/${current.quantity} reaproveitadas, ${current.quantity - newReuse} a produzir)`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Corrige reaproveitamento total que foi marcado por engano na Solicitação.
  // Só disponível enquanto a peça ainda não foi conferida (status = produced, conferredQty = 0).
  app.post("/api/items/:id/correct-reuse", requireAuth, async (req, res) => {
    try {
      if (
        (req as any).userRole !== "grafica" &&
        (req as any).userRole !== "admin" &&
        (req as any).userRole !== "solicitacao"
      ) {
        return res.status(403).json({ error: "Apenas a Gráfica, Solicitação ou Admin pode corrigir reaproveitamento" });
      }

      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });

      // ANDA, apesar do nome. "Corrigir reaproveitamento" devolve a peça para
      // "Pronto p/ Produção" e ZERA quantityProduced — ou seja, recoloca a peça
      // na fila da Gráfica pedindo impressão. Num evento finalizado é
      // exatamente o trabalho fantasma que esta guarda existe para impedir.
      if (await barraEventoFinalizado(current, res)) return;

      // O que realmente impede a correção é a peça já ter sido conferida ou
      // entregue — é aí que o número vira contagem física. O status por si só
      // não impedia nada, mas travava o caso mais comum: a quantidade foi
      // digitada errada e o erro só é notado antes de produzir, com a peça em
      // "Pronto p/ Produção". O admin passa a corrigir em qualquer etapa
      // anterior à conferência; Gráfica e Solicitação seguem restritas a
      // "Produzido", que é o momento em que elas encostam na peça.
      const isAdmin = (req as any).userRole === "admin";
      if (!isAdmin && current.status !== "produced" && current.status !== "produzido") {
        return res.status(409).json({ error: "Correção disponível apenas para peças com status Produzido" });
      }
      if ((current.conferredQty || 0) > 0) {
        return res.status(409).json({ error: "Não é possível corrigir: a peça já foi parcialmente conferida" });
      }
      // Reuso antigo vai direto para a entrega sem conferir: sem esta checagem,
      // uma peça com unidades já entregues voltaria para "Pronto p/ Produção"
      // carregando deliveredQty, e a contagem de entrega ficaria inconsistente.
      if ((current.deliveredQty || 0) > 0) {
        return res.status(409).json({ error: `Não é possível corrigir: ${current.deliveredQty} un. já foram entregues` });
      }
      if ((current.reuseQty || 0) === 0 && !current.isReuse) {
        return res.status(409).json({ error: "Peça não tem reaproveitamento para corrigir" });
      }

      // O intervalo ia até quantidade-1, o que impedia justamente o caminho
      // inverso: quem marcou parcial por engano não conseguia voltar para
      // reaproveitamento total. O admin alcança o total; para os demais o
      // limite continua sendo o parcial, que é o que a operação deles cobre.
      const maximo = isAdmin ? current.quantity : current.quantity - 1;
      const correctedReuseQty = Number(req.body?.correctedReuseQty);
      if (isNaN(correctedReuseQty) || correctedReuseQty < 0 || correctedReuseQty > maximo) {
        return res.status(400).json({
          error: `Quantidade corrigida inválida (deve ser entre 0 e ${maximo})`,
        });
      }

      // Reaproveitar tudo pula a produção; qualquer valor menor deixa sobra e
      // manda a peça de volta para a fila.
      const reaproveitaTudo = correctedReuseQty === current.quantity;

      const item = await storage.updateItem(req.params.id, {
        reuseQty: correctedReuseQty,
        isReuse: reaproveitaTudo,
        status: reaproveitaTudo ? ("produced" as const) : ("ready_for_production" as const),
        // A produção lançada antes da marcação errada não vale mais para a
        // quantidade que agora precisa ser impressa.
        quantityProduced: reaproveitaTudo ? current.quantity : null,
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      await createAuditLog(
        req,
        "updated",
        "item",
        item.id,
        correctedReuseQty === 0
          ? `Reaproveitamento removido por correção — peça voltou para Pronto para Produção (${current.quantity} un. a produzir)`
          : reaproveitaTudo
          ? `Reaproveitamento corrigido para total: ${current.quantity}/${current.quantity} un. — peça pula a produção`
          : `Reaproveitamento corrigido de ${current.reuseQty || (current.isReuse ? current.quantity : 0)} para ${correctedReuseQty}/${current.quantity} un. reaproveitadas, ${current.quantity - correctedReuseQty} a produzir`
      );

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Gráfica confere a peça produzida (com foto). Suporta conferência parcial.
  //
  // SEM a guarda de evento finalizado (é FECHAR A CONTA do que já existe).
  // Conferir não produz nada: a rota exige `status === "produced"`, isto é, a
  // impressão já aconteceu e a peça está fisicamente no galpão. O que se
  // registra aqui é a contagem do material — e a contagem costuma acontecer
  // depois do evento, que é justamente quando ele já conta como "realizado".
  // Barrar deixaria a peça eternamente "Produzida" e travaria a entrega, que
  // só aceita unidades conferidas.
  app.post("/api/items/:id/confer", requireAuth, async (req, res) => {
    try {
      if ((req as any).userRole !== "grafica" && (req as any).userRole !== "admin") {
        return res.status(403).json({ error: "Apenas a Gráfica pode conferir" });
      }
      const { conferencePhotoUrl, qty, notes } = req.body ?? {};
      const current = await storage.getItem(req.params.id);
      if (!current) return res.status(404).json({ error: "Item not found" });
      if (!conferencePhotoUrl && !current.conferencePhotoUrl) {
        return res.status(400).json({ error: "Foto da conferência é obrigatória" });
      }
      // Conferência acontece a partir de Produzido (e continua enquanto parcial).
      const alreadyConferred = current.conferredQty || 0;
      const remaining = current.quantity - alreadyConferred;
      if (current.status !== "produced" || remaining <= 0) {
        return res.status(409).json({ error: `Nada a conferir. Status: ${translateStatus(current.status)} (${alreadyConferred}/${current.quantity})` });
      }
      // Quantidade desta conferência (padrão: o que falta). Limita ao restante.
      const n = Math.min(remaining, Math.max(1, Number(qty) || remaining));
      const newConferred = alreadyConferred + n;
      const isFull = newConferred >= current.quantity;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      const item = await storage.updateItem(req.params.id, {
        conferredQty: newConferred,
        conferencePhotoUrl: conferencePhotoUrl || current.conferencePhotoUrl || null,
        conferredAt: isFull ? new Date() : current.conferredAt,
        ...(trimmedNotes ? { conferenceNotes: trimmedNotes } : {}),
        // Status só vira "conferred" quando conferiu tudo; parcial continua "produced".
        ...(isFull ? { status: "conferred" as const } : {}),
      });
      await createAuditLog(
        req,
        'updated', 'item', req.params.id,
        (isFull ? `Conferência concluída (${newConferred}/${current.quantity})` : `Conferência parcial: ${n} un. (${newConferred}/${current.quantity})`)
        + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : ""));
      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark item as delivered (Gráfica module)
  //
  // SEM a guarda de evento finalizado — é O exemplo de FECHAR A CONTA: registrar
  // a entrega de algo que fisicamente já saiu. A rota não consegue inventar
  // trabalho: o teto de entrega é `conferredQty` (unidades já produzidas E já
  // conferidas), e produzir está barrado. E a entrega quase sempre é lançada
  // DEPOIS do evento — todo evento vira "realizado" no dia seguinte, então
  // barrar aqui impediria, para sempre, fechar o registro do que aconteceu de
  // verdade. É exatamente o oposto do que a regra quer.
  app.patch("/api/items/:id/deliver", requireAuth, async (req, res) => {
    // Entrega é etapa da Gráfica (solicitacao entra pelo fluxo de reuso) — era
    // a ÚNICA transição do fluxo de produção sem gate de papel.
    if (!["grafica", "solicitacao", "admin"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para registrar entrega" });
    }
    try {
      const { receivedBy, photoUrl, notes } = req.body;
      const trimmedNotes = typeof notes === "string" ? notes.trim() : "";

      if (!receivedBy) {
        return res.status(400).json({ error: "receivedBy is required" });
      }
      
      // Pegar status anterior antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Item not found" });
      }
      
      // Entrega parcial: acumula deliveredQty; só vira "delivered" quando entrega
      // tudo. Só se entrega o que já foi conferido — inclusive o reaproveitamento,
      // que também passa pela conferência.
      //
      // Exceção para o legado: peças marcadas como reuso ANTES de reuse_qty
      // existir têm reuseQty = 0 e nunca passaram por conferência, porque a regra
      // antiga as mandava direto para a entrega. Exigir conferência delas agora
      // travaria entregas já em andamento, então seguem pela regra antiga.
      const legacyReuse = currentItem.isReuse && (currentItem.reuseQty || 0) === 0;
      const alreadyDelivered = currentItem.deliveredQty || 0;
      const maxDeliverable = legacyReuse ? currentItem.quantity : (currentItem.conferredQty || 0);
      const remaining = maxDeliverable - alreadyDelivered;
      if (remaining <= 0) {
        return res.status(409).json({ error: `Nada a entregar. Entregue ${alreadyDelivered}/${currentItem.quantity}${legacyReuse ? "" : ` (conferido ${currentItem.conferredQty || 0})`}.` });
      }
      const n = Math.min(remaining, Math.max(1, Number(req.body.qty) || remaining));
      const newDelivered = alreadyDelivered + n;
      const isFullDelivery = newDelivered >= currentItem.quantity;

      // Atomic: item update + audit log in one transaction.
      const item = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({
            deliveredQty: newDelivered,
            receivedBy,
            deliveryPhotoUrl: photoUrl || currentItem.deliveryPhotoUrl || null,
            updatedAt: new Date(),
            ...(trimmedNotes ? { deliveryNotes: trimmedNotes } : {}),
            ...(isFullDelivery ? { status: "delivered" as const, deliveredAt: new Date() } : {}),
          })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Item not found"), { httpStatus: 404 });

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "delivered",
          entityType: "item",
          entityId: updated.id,
          details:
            (isFullDelivery
              ? `Entrega concluída (${newDelivered}/${currentItem.quantity}, recebido por: ${receivedBy})`
              : `Entrega parcial: ${n} un. (${newDelivered}/${currentItem.quantity}, recebido por: ${receivedBy})`)
            + (trimmedNotes ? ` — Obs.: ${trimmedNotes}` : ""),
        });

        return updated;
      });
      if (!item) return res.status(404).json({ error: "Item not found" });

      const event = await storage.getEvent(item.eventId);
      
      // Recalculate event status - might become "completed"
      const previousStatus = event?.status;
      await updateEventStatus(item.eventId);
      
      // Verificar se evento foi concluído agora - notificar Solicitação
      const updatedEvent = await storage.getEvent(item.eventId);
      if (previousStatus !== "completed" && updatedEvent?.status === "completed") {
        const notification = await storage.createNotification({
          type: "eventCompleted",
          message: `Evento concluído: ${event?.name} - Todos os itens foram entregues`,
          eventId: item.eventId,
          targetRoles: ["solicitacao"],
        });
        broadcast({ type: "notification_created", notification });
      }
      
      broadcast({ type: "item_delivered", item });
      
      res.json(item);
    } catch (error: any) {
      res.status((error as any).httpStatus ?? 500).json({ error: error.message });
    }
  });

  // Update production (Gráfica module)
  // Vincula um PDF de book (layout pronto) às peças selecionadas de um evento.
  // Usado pela Arte para enviar o book aos patrocinadores enquanto a exportação
  // automática não está 100%. Aceita { bookUrl, itemIds }.
  app.post("/api/events/:eventId/book", requireAuth, async (req, res) => {
    try {
      // Gate de papel: era a ÚNICA rota da Arte sem — e como ela limpa o
      // bookUrl do evento antes de gravar, qualquer sessão podia APAGAR o
      // book inteiro. Mesmos papéis das 6 rotas irmãs.
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Sem permissão para gerenciar books" });
      }
      const { bookUrl, itemIds } = req.body ?? {};
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma peça" });
      }
      if (bookUrl !== null && (typeof bookUrl !== "string" || !bookUrl.trim())) {
        return res.status(400).json({ error: "bookUrl inválido" });
      }
      // ANDA (caso duvidoso, barrado): o book é o material que a Arte manda aos
      // patrocinadores para aprovarem — vincular um é abrir rodada de
      // aprovação. E a rota LIMPA o bookUrl de todas as peças do evento antes
      // de gravar, então em evento finalizado ela também apagaria o book
      // arquivado. Na dúvida entre "arquivo" e "trabalho", barra.
      const fechadoBook = motivoEventoFechado(await storage.getEvent(req.params.eventId));
      if (fechadoBook) {
        return res.status(409).json({
          error: erroEventoFechado(fechadoBook), code: "EVENT_FINALIZED", reason: fechadoBook,
        });
      }
      // Limpa o bookUrl antigo de TODOS os itens do evento antes de setar o novo.
      // Isso garante que itens não selecionados não fiquem com URL obsoleta,
      // evitando que a exportação abra a versão antiga do book.
      await storage.clearEventBookUrl(req.params.eventId);
      const count = await storage.setItemsBookUrl(itemIds, bookUrl || null);
      await createAuditLog(
        req,
        'updated',
        'event',
        req.params.eventId,
        bookUrl ? `Book de aprovação vinculado a ${count} peça(s)` : `Book removido de ${count} peça(s)`
      );
      broadcast({ type: "items_book_updated", eventId: req.params.eventId, count });
      res.json({ updated: count });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── ROTA APOSENTADA — 410 Gone ────────────────────────────────────────────
  // Era um SEGUNDO caminho de produção, paralelo a /start-production e sem
  // nenhuma das travas dele: marcava "produced" SEM teto (aceitava 999 numa
  // peça de 10), sem somar reuseQty, sem gravar quantityProduced (o número
  // ficava só na tabela production_updates, invisível para a Gráfica) e sem
  // criar os ativos de inventário. Zero callers no client — foi verificado.
  // Continua registrada, respondendo 410, para que qualquer script ou aba
  // antiga receba uma explicação em vez de um 404 mudo. Não remover sem antes
  // conferir os logs de acesso.
  app.post("/api/items/:id/production", requireAuth, async (_req, res) => {
    res.status(410).json({
      error: 'Rota descontinuada. Use PATCH /api/items/:id/start-production, que valida o teto de produção, soma o reaproveitamento e cria os ativos de inventário.',
      code: "ROUTE_GONE",
    });
  });

}
