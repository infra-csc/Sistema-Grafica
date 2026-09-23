// ─────────────────────────────────────────────────────────────────────────────
// INFORMAR IMPRESSAS — a regra do PATCH /api/items/:id/start-production.
//
// A rota (server/routes/itens/impressao.ts) valida papel, máquina, evento e
// molde; aqui mora o lançamento sob a linha TRAVADA e, quando a peça fecha
// como produzida, o cadastro dos ativos no Estoque.
// ─────────────────────────────────────────────────────────────────────────────
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage, assetPrefix, assetSeqOf } from "../storage";
import { items as itemsTable, auditLogs, type Item, type Event } from "@shared/schema";
import { fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { planejarLancamentoDeImpressas, ERRO_LANCAMENTO_TRAVADA, eventoBarraImpressas } from "@shared/impressao-dividida";
import { translateStatus, createAuditLogsEmLote, resolveActor } from "../routes/shared";
import { erroEventoFechado, type MotivoBloqueioDoEvento } from "../routes/eventoFinalizado";
import { runInventoryCron } from "./inventoryLifecycle";

/** Quem lança — o mesmo par (nome, id) da trilha. */
export type AtorDoLancamento = { userName?: string | null; userId?: string | null };

/**
 * Lança as impressas sob `SELECT … FOR UPDATE`: o plano inteiro é refeito
 * sobre a linha travada e gravado por esta transação, com a trilha junto.
 * Recusa sai como erro com `httpStatus` e o `corpo` que a rota devolve.
 */
export async function lancarImpressas(
  itemId: string,
  corpo: Record<string, unknown>,
  motivoFechado: MotivoBloqueioDoEvento | null | undefined,
  ator: AtorDoLancamento,
) {
  // ── CONCORRÊNCIA (revisão adversarial, 22/09) ─────────────────────────
  // A rota lia a peça aqui fora e gravava só `where id`: dois lançamentos
  // simultâneos em impressoras diferentes da mesma peça DIVIDIDA partiam
  // da mesma foto do jsonb, e o segundo apagava as impressas do primeiro.
  // Agora: SELECT … FOR UPDATE da linha, o plano inteiro recalculado sobre
  // ela (planejarLancamentoDeImpressas, puro) e a gravação por ESTA
  // transação. O segundo lançamento espera o primeiro e soma sobre ele.
  // `quantityProduced` é ABSOLUTO; `expectedProduced` (o total que o
  // operador leu) — ou, na peça por partes, `expectedNaMaquina` (o que ele
  // leu na parte dele) — vira 409 PRODUCTION_CONFLICT quando alguém lançou
  // no meio-tempo. Campos OPCIONAIS — clientes que não enviam seguem.
  const falha = (status: number, corpo: Record<string, unknown>) => Object.assign(new Error(String(corpo.error)), { httpStatus: status, corpo });
  return await db.transaction(async (tx) => {
    const [before] = await tx.select().from(itemsTable).where(eq(itemsTable.id, itemId)).for("update");
    if (!before || before.deletedAt) throw falha(404, { error: "Peça não encontrada." });
    // O evento finalizado, de novo sobre a linha TRAVADA: a exceção do
    // realizado vale só para a peça que ESTÁ em impressão agora.
    if (motivoFechado && eventoBarraImpressas(motivoFechado, before.status)) {
      throw falha(409, { error: erroEventoFechado(motivoFechado), code: "EVENT_FINALIZED", reason: motivoFechado });
    }
    const plano = planejarLancamentoDeImpressas(before as any, corpo, new Date());
    if (!plano.ok) {
      throw plano.corpo.error === ERRO_LANCAMENTO_TRAVADA
        ? falha(409, { error: fraseDaTrava(before as any), code: CODIGO_PECA_TRAVADA })
        : falha(plano.status, plano.corpo);
    }
    const [updated] = await tx
      .update(itemsTable)
      .set(plano.set as any)
      .where(eq(itemsTable.id, before.id))
      .returning();
    if (!updated) throw falha(404, { error: "Peça não encontrada." });

    await tx.insert(auditLogs).values({
      ...resolveActor(ator),
      action: plano.novoStatus === "produced" ? "produced" : "production",
      entityType: "item",
      entityId: updated.id,
      details: `Produção: ${plano.quantityProduced}/${updated.quantity} un. (${translateStatus(before.status)} → ${translateStatus(plano.novoStatus)})`
        // O campo é ABSOLUTO e por anos foi rotulado como incremental na
        // tela: quem produzia 6 de 10, voltava e digitava "4" REGREDIA o
        // total para 4 sem nenhum vestígio. Enquanto o número absoluto for
        // o contrato, ao menos a regressão deixa de ser silenciosa.
        + (plano.quantityProduced < plano.jaProduzido ? ` — ATENÇÃO: total produzido REDUZIDO de ${plano.jaProduzido} para ${plano.quantityProduced} un.` : ""),
    });

    return { item: updated, plano };
  });
}

/**
 * A peça fechou como produzida: um ativo por unidade no Estoque (os que
 * faltam) e o ciclo de vida do evento rodado já.
 */
export async function cadastrarAtivosDaPecaProduzida(
  item: Item,
  event: Event | undefined,
  quantityProduced: number,
  ator: AtorDoLancamento,
): Promise<void> {
  // Auto-add to inventory when fully produced — N individual records
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

  const producedBy = ator.userName || 'Gráfica';
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
    // Trilha em LOTE: um INSERT para o bloco inteiro (eram N idas ao banco, uma por ativo).
    await createAuditLogsEmLote({ userName: producedBy, userId: ator.userId }, created.map((a) => ({
      action: 'cadastrado', entityType: 'inventory_asset', entityId: a.id,
      details: JSON.stringify({ evento: event?.name ?? '—', itemId: item.id }),
    })));
  }
  // O ciclo de vida já, e só do evento da peça: ativo de evento com data
  // passada vai direto a EM_USO / AGUARDANDO_TRIAGEM sem esperar o próximo tick.
  runInventoryCron(item.eventId);
}
