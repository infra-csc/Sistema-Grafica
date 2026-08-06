// Central in-process short-lived cache store.
// Imported by route modules (events, notifications) and by shared.ts so that
// broadcast() can flush everything on any mutation — without creating circular
// dependencies (routes import shared; shared can safely import this file).

// ── Events cache ─────────────────────────────────────────────────────────────
export let eventsCache: { data: unknown; expiresAt: number } | null = null;
export const EVENTS_CACHE_TTL_MS = 30_000;

export function setEventsCache(data: unknown): void {
  eventsCache = { data, expiresAt: Date.now() + EVENTS_CACHE_TTL_MS };
}
export function invalidateEventsCache(): void {
  eventsCache = null;
}

// ── Notifications cache (per role) ───────────────────────────────────────────
export const notifCache = new Map<string, { data: unknown; expiresAt: number }>();
export const NOTIF_CACHE_TTL_MS = 15_000;

export function setNotifCache(role: string, data: unknown): void {
  notifCache.set(role, { data, expiresAt: Date.now() + NOTIF_CACHE_TTL_MS });
}
export function invalidateNotificationsCache(): void {
  notifCache.clear();
}

// ── Flush all caches (called by broadcast) ───────────────────────────────────
export function invalidateAllCaches(): void {
  invalidateEventsCache();
  invalidateNotificationsCache();
}
