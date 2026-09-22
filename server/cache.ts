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
//
// VÁRIAS CÓPIAS: o deploy é autoscale, e cada cópia tem o seu cache. A
// escrita feita numa cópia invalida o cache DELA; as outras só ficam sabendo
// pelo canal do tempo real (server/tempo-real.ts), que repassa o sinal e
// chama invalidarCachesDaMensagem / invalidarCacheLocal do lado de lá.

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

// ── Flush all caches ─────────────────────────────────────────────────────────
export function invalidateAllCaches(): void {
  invalidateEventsCache();
  invalidateNotificationsCache();
  cachesRegistrados.forEach((limpar) => limpar());
}

/**
 * O que cada mensagem do tempo real derruba NESTA cópia. Seletivo: mensagem
 * de notificação só invalida o cache de notificações; o resto (peça, evento,
 * produção…) invalida o de eventos, que deriva contadores das peças. Antes
 * QUALQUER mensagem derrubava o de eventos, e com mutações contínuas o TTL de
 * 30s era efetivamente zero.
 */
export function invalidarCachesDaMensagem(tipo: string): void {
  if (tipo === "connected" || tipo === "resync") return;
  if (tipo.startsWith("notification")) invalidateNotificationsCache();
  else invalidateEventsCache();
}

// ── Caches de outros módulos, invalidados em todas as cópias ────────────────
// Um módulo com cache próprio (ex.: routes/versoes.ts) registra aqui o seu
// "limpar" com um nome; quem escreve chama invalidarCacheNoCluster(nome), que
// limpa aqui e manda o nome pelo canal para as outras cópias limparem lá.
const cachesRegistrados = new Map<string, () => void>();
let publicarInvalidacao: (nome: string) => void = () => {};

export function registrarCache(nome: string, limpar: () => void): void {
  cachesRegistrados.set(nome, limpar);
}

/** Só o tempo real chama: é como a invalidação chega às outras cópias. */
export function definirPublicadorDeInvalidacao(fn: (nome: string) => void): void {
  publicarInvalidacao = fn;
}

/** Limpa só nesta cópia (quem chama é o canal, ao receber de outra cópia). */
export function invalidarCacheLocal(nome: string): void {
  if (nome === "eventos") invalidateEventsCache();
  else if (nome === "notificacoes") invalidateNotificationsCache();
  else cachesRegistrados.get(nome)?.();
}

/** Limpa aqui e avisa as outras cópias. */
export function invalidarCacheNoCluster(nome: string): void {
  invalidarCacheLocal(nome);
  publicarInvalidacao(nome);
}
