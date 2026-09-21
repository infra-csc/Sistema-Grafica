// Central in-process short-lived cache store.
// Imported by route modules (events, notifications) and by shared.ts so that
// broadcast() can flush everything on any mutation — without creating circular
// dependencies (routes import shared; shared can safely import this file).
//
// GERAÇÃO (perf 17/09): cada invalidação incrementa um contador. Quem vai
// montar o cache anota a geração ANTES de ler o banco e só grava se ela não
// mudou. Sem isso havia uma corrida real: a leitura começa, uma escrita
// acontece e invalida o cache, a leitura (com o dado de ANTES da escrita)
// termina e grava — e esse dado velho era servido pelo TTL inteiro justamente
// para as abas que o broadcast mandou recarregar.

// ── Events cache ─────────────────────────────────────────────────────────────
export let eventsCache: { data: unknown; expiresAt: number } | null = null;
export const EVENTS_CACHE_TTL_MS = 30_000;
let eventsGeneration = 0;

/** Geração atual do cache de eventos — anote antes de ler o banco. */
export function eventsCacheGeneration(): number {
  return eventsGeneration;
}

/**
 * Grava o cache. Com `generation`, só grava se nada invalidou o cache desde
 * que ela foi anotada (ver o bloco GERAÇÃO no topo).
 */
export function setEventsCache(data: unknown, generation?: number): void {
  if (generation !== undefined && generation !== eventsGeneration) return;
  eventsCache = { data, expiresAt: Date.now() + EVENTS_CACHE_TTL_MS };
}
export function invalidateEventsCache(): void {
  eventsCache = null;
  eventsGeneration += 1;
}

// ── Notifications cache (per role) ───────────────────────────────────────────
export const notifCache = new Map<string, { data: unknown; expiresAt: number }>();
export const NOTIF_CACHE_TTL_MS = 15_000;
let notifGeneration = 0;

/** Geração atual do cache de notificações — anote antes de ler o banco. */
export function notifCacheGeneration(): number {
  return notifGeneration;
}

export function setNotifCache(role: string, data: unknown, generation?: number): void {
  if (generation !== undefined && generation !== notifGeneration) return;
  notifCache.set(role, { data, expiresAt: Date.now() + NOTIF_CACHE_TTL_MS });
}
export function invalidateNotificationsCache(): void {
  notifCache.clear();
  notifGeneration += 1;
}

// ── Flush all caches (called by broadcast) ───────────────────────────────────
export function invalidateAllCaches(): void {
  invalidateEventsCache();
  invalidateNotificationsCache();
}
