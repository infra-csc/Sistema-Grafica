// Inventory backfill + lifecycle cron background jobs. Extracted from
// server/routes.ts — pure relocation, same logic, now started explicitly
// via startInventoryLifecycle() from the routes orchestrator, and
// runInventoryCron is exported so item routes (production start) can
// trigger an out-of-band run.
import { storage } from "../storage";
import { broadcast } from "../routes/shared";

export async function backfillInventoryAssets() {
    try {
      const allItems = await storage.getAllItems();
      const produced = allItems.filter(
        item => (item.status === 'produced' || item.status === 'delivered') &&
                item.quantityProduced && item.quantityProduced > 0
      );
      let totalCreated = 0;
      for (const item of produced) {
        const existing = await storage.getAssetsByOriginalItemId(item.id);
        if (existing.length >= (item.quantityProduced ?? 1)) continue; // already backfilled

        const event = await storage.getEvent(item.eventId);
        const itemName = item.description
          ? `${item.type} — ${item.description}`
          : item.type;
        const franchiseTags = event?.franchise
          ? [event.franchise.toLowerCase().replace(/\s+/g, '_')]
          : [];
        const itemSponsorLinks = await storage.getItemSponsors(item.id);
        const linkedSponsorIds = itemSponsorLinks.map(s => s.sponsorId);
        const approvalThumbUrl = item.approvalThumbUrl ?? null;
        const itemNum = item.displayId.replace(/[^0-9]/g, '').padStart(4, '0');

        const startIdx = existing.length;
        const qty = (item.quantityProduced ?? 1) - startIdx;
        if (qty <= 0) continue;

        const records = Array.from({ length: qty }, (_, i) => ({
          displayId: `#EST-${itemNum}-${startIdx + i + 1}`,
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
export async function runInventoryCron() {
    try {
      const now = new Date();
      const allEvents = await storage.getAllEvents();
      for (const event of allEvents) {
        if (!event.truckDepartureDate) continue;

        // ── Departure: truck left → mark assets EM_USO ──────────────────────
        const departure = new Date(event.truckDepartureDate);
        if (now >= departure) {
          const count = await storage.markAssetsInUseForEvent(event.id, departure);
          if (count > 0) {
            broadcast({ type: 'inventory_in_use', eventId: event.id, eventName: event.name, count });
            console.log(`[inventory-cron] ${count} asset(s) → EM_USO for event "${event.name}"`);
          }
        }

        // ── Triage: midnight of the day AFTER the event's startDate → AGUARDANDO_TRIAGEM ─
        // Only assets currently EM_USO transition — assets not in use are never pulled into triage.
        if (event.startDate) {
          const dayAfterEvent = new Date(event.startDate);
          dayAfterEvent.setDate(dayAfterEvent.getDate() + 1);
          dayAfterEvent.setHours(0, 0, 0, 0);

          if (now >= dayAfterEvent) {
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
    } catch (err) {
      console.error('[inventory-cron] error:', err);
    }
  }

export function startInventoryLifecycle(): void {
  // On startup: backfill missing assets first, then immediately run lifecycle transitions,
  // then schedule every-10-minute checks. Sequential so backfilled assets are ready for the cron.
  backfillInventoryAssets().then(() => runInventoryCron());
  // Catch-up logic inside runInventoryCron handles missed ticks, so 60 min is sufficient.
  setInterval(runInventoryCron, 60 * 60 * 1000);
}
