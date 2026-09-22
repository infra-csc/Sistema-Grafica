// Inventory backfill + lifecycle cron background jobs. Extracted from
// server/routes.ts — pure relocation, same logic, now started explicitly
// via startInventoryLifecycle() from the routes orchestrator, and
// runInventoryCron is exported so item routes (production start) can
// trigger an out-of-band run.
import { storage, assetPrefix, assetSeqOf } from "../storage";
import { broadcast } from "../routes/shared";
import { executarComoLider } from "./lideranca";

export async function backfillInventoryAssets() {
    try {
      // AUDITORIA 27/08: este backfill roda em TODO boot e era N+1 puro — três
      // queries seriais POR peça produzida (assets, evento, vínculos), ~9.000
      // queries num cold start com 3.000 produzidas, quase todas para concluir
      // "nada a fazer". Agora as quatro tabelas vêm de UMA vez e o loop só
      // toca o banco para as peças que realmente têm ativo faltando.
      const [allItems, allAssets, allEvents, allItemSponsors] = await Promise.all([
        storage.getAllItems(),
        storage.getAllInventoryAssets(),
        storage.getAllEvents(),
        storage.getAllItemSponsors(),
      ]);
      const assetsPorItem = new Map<string, typeof allAssets>();
      for (const a of allAssets) {
        if (!a.originalItemId) continue;
        const arr = assetsPorItem.get(a.originalItemId);
        if (arr) arr.push(a); else assetsPorItem.set(a.originalItemId, [a]);
      }
      const eventoPorId = new Map(allEvents.map((e) => [e.id, e]));
      const sponsorsPorItem = new Map<string, string[]>();
      for (const is of allItemSponsors) {
        const arr = sponsorsPorItem.get(is.itemId);
        if (arr) arr.push(is.sponsorId); else sponsorsPorItem.set(is.itemId, [is.sponsorId]);
      }

      const produced = allItems.filter(
        item => (item.status === 'produced' || item.status === 'delivered') &&
                item.quantityProduced && item.quantityProduced > 0
      );
      let totalCreated = 0;
      for (const item of produced) {
        const existing = assetsPorItem.get(item.id) ?? [];
        if (existing.length >= (item.quantityProduced ?? 1)) continue; // already backfilled

        const event = eventoPorId.get(item.eventId);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        const linkedSponsorIds = sponsorsPorItem.get(item.id) ?? [];
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        // assetPrefix, não replace(/[^0-9]/g,''): para "#0062" devolve "0062"
        // (byte a byte idêntico ao anterior — zero risco no acervo existente),
        // mas para o COMPLEMENTO "#0062-C1" o replace dava "00621", um código
        // ilegível que ainda colidia com o bloco da peça #0621. Mesmo helper
        // usado em start-production: os dois caminhos precisam gerar o mesmo
        // prefixo, senão a mesma peça ganha dois padrões de ativo.
        const itemNum = assetPrefix(item.displayId);

        const startIdx = existing.length;
        const qty = (item.quantityProduced ?? 1) - startIdx;
        if (qty <= 0) continue;

        // Numeração pelo MAIOR sufixo existente, nunca por contagem: com
        // contagem, um ativo excluído no meio do bloco faz o próximo lote
        // recomeçar num número que já existe e o INSERT estoura no UNIQUE.
        const maiorSeq = existing.reduce((max, a) => Math.max(max, assetSeqOf(a.displayId)), 0);

        const records = Array.from({ length: qty }, (_, i) => ({
          displayId: `#EST-${itemNum}-${maiorSeq + i + 1}`,
          name: itemName,
          quantity: 1,
          originalItemId: item.id,
          condition: "PERFEITO" as const,
          location: null,
          franchiseTags,
          sponsorIds: linkedSponsorIds,
          approvalThumbUrl,
          trackingStatus: "NO_GALPAO" as const,
          notes: `Gráfica — Evento: ${event?.name ?? '—'}`,
          autoAdded: true,
        }));

        await storage.createInventoryAssets(records);
        totalCreated += records.length;
        console.log(`[inventory-backfill] created ${records.length} asset(s) for item "${item.type}" (${item.displayId})`);
      }
      if (totalCreated > 0) {
        console.log(`[inventory-backfill] total: ${totalCreated} asset(s) backfilled`);
      } else {
        console.log(`[inventory-backfill] nothing to backfill`);
      }
    } catch (err) {
      console.error('[inventory-backfill] error:', err);
    }
  }

  // ============ INVENTORY LIFECYCLE CRON ============
  // ── Inventory lifecycle: extracted to function so it runs on startup AND every minute ──
  // Trigger 1: truckDepartureDate passed → EM_USO
  // Trigger 2: midnight of event startDate (when the event day begins) → AGUARDANDO_TRIAGEM
  // Continuous (catch-up) logic — no narrow window — missed ticks are recovered automatically.
// AUDITORIA 27/08: janela de retroação do catch-up. O cron reprocessava TODOS
// os eventos passados, para sempre — com 500 eventos históricos eram ~1.000
// UPDATEs/hora afetando 0 linhas, crescendo com o histórico e segurando o
// scale-to-zero do Neon. 45 dias cobrem qualquer downtime realista de deploy;
// evento mais velho que isso já transicionou (ou nunca vai — e reprocessá-lo
// de hora em hora não mudaria nada).
const JANELA_DE_CATCHUP_MS = 45 * 24 * 60 * 60 * 1000;

/**
 * Meia-noite (em São Paulo) do dia seguinte ao do evento. O dia do evento é a
 * data-calendário gravada (convenção do app: datas de evento em UTC); a virada
 * é a do NEGÓCIO. Antes usava o fuso do servidor (UTC no deploy): a triagem
 * abria às 21h do próprio dia do evento, com o material ainda na rua.
 */
export function meiaNoiteDoDiaSeguinteEmSaoPaulo(inicioDoEvento: Date): Date {
  const palpite = Date.UTC(inicioDoEvento.getUTCFullYear(), inicioDoEvento.getUTCMonth(), inicioDoEvento.getUTCDate() + 1);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(palpite)).map((x) => [x.type, x.value]));
  const comoLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  // comoLocal - palpite = deslocamento de SP naquele instante (−3h hoje).
  return new Date(palpite - (comoLocal - palpite));
}

// Um evento só: as duas transições (caminhão saiu → EM_USO; dia seguinte ao
// evento → AGUARDANDO_TRIAGEM) para os ativos dele.
async function transicionarAtivosDoEvento(event: Awaited<ReturnType<typeof storage.getAllEvents>>[number], now: Date) {
  if (!event.truckDepartureDate) return;

  // ── Departure: truck left → mark assets EM_USO ──────────────────────
  const departure = new Date(event.truckDepartureDate);
  if (now >= departure && now.getTime() - departure.getTime() <= JANELA_DE_CATCHUP_MS) {
    const count = await storage.markAssetsInUseForEvent(event.id, departure);
    if (count > 0) {
      broadcast({ type: 'inventory_in_use', eventId: event.id, eventName: event.name, count });
      console.log(`[inventory-cron] ${count} asset(s) → EM_USO for event "${event.name}"`);
    }
  }

  // ── Triage: midnight of the day AFTER the event's startDate → AGUARDANDO_TRIAGEM ─
  // Only assets currently EM_USO transition — assets not in use are never pulled into triage.
  if (event.startDate) {
    const dayAfterEvent = meiaNoiteDoDiaSeguinteEmSaoPaulo(new Date(event.startDate));

    if (now >= dayAfterEvent && now.getTime() - dayAfterEvent.getTime() <= JANELA_DE_CATCHUP_MS) {
      const count = await storage.markAssetsAwaitingTriageForEvent(event.id);
      if (count > 0) {
        broadcast({
          type: 'inventory_awaiting_triage',
          eventId: event.id,
          eventName: event.name,
          count,
          message: `Os materiais do evento "${event.name}" retornaram e aguardam triagem.`,
        });
        console.log(`[inventory-cron] ${count} asset(s) → AGUARDANDO_TRIAGEM for event "${event.name}"`);
      }
    }
  }
}

/**
 * Com `eventId`, só aquele evento — o que a peça recém-impressa precisa
 * (start-production); rodar o ciclo inteiro ali varria todos os eventos a cada
 * peça fechada. Sem argumento (boot e setInterval), todos.
 */
export async function runInventoryCron(eventId?: string | null) {
    try {
      const now = new Date();
      if (eventId) {
        const event = await storage.getEvent(eventId);
        if (event) await transicionarAtivosDoEvento(event as any, now);
        return;
      }
      const allEvents = await storage.getAllEvents();
      for (const event of allEvents) await transicionarAtivosDoEvento(event, now);
    } catch (err) {
      console.error('[inventory-cron] error:', err);
    }
  }

const UMA_HORA = 60 * 60 * 1000;

/**
 * O ciclo do inventário: na partida e de hora em hora, em UMA cópia por hora
 * (services/lideranca.ts). O backfill de ativos saiu da partida — lia o
 * acervo inteiro a cada boot de cada cópia; agora é
 * `npx tsx scripts/backfill-inventario.ts`, rodado à mão quando preciso.
 */
export function startInventoryLifecycle(): void {
  const tick = () => void executarComoLider("ciclo-do-inventario", runInventoryCron, { janelaMs: UMA_HORA })
    .catch((err) => console.error("[inventory-cron] error:", err));
  tick();
  // Catch-up logic inside runInventoryCron handles missed ticks, so 60 min is sufficient.
  setInterval(tick, UMA_HORA);
}
