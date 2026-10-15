// ─────────────────────────────────────────────────────────────────────────────
// SUGESTÃO DE VÍNCULO NO SERVIDOR — carrega o histórico, aprende os padrões
// (com cache de processo) e serve as três operações que usam o motor puro de
// @shared/sugestao-de-vinculo:
//
//   · sugestoesDosEventos ...... o que a tela de Vincular mostra (leitura);
//   · aplicarSugestoes ......... o "Aplicar sugestões" — RECALCULA aqui e grava;
//   · vincularAutomaticamente .. a regra 1 sozinha, quando a peça entra na fase
//                                de vinculação (o envio da lista — ver events.ts).
//
// O QUE NENHUMA DAS TRÊS TOCA (as mesmas guardas da vinculação manual):
// evento finalizado ou arquivado; molde; produção interna; peça "sem
// patrocinador" (skipApproval); patrocinador arquivado (sai do elenco); peça
// que JÁ tem patrocinador — quem vinculou à mão decidiu. E o STATUS da peça
// não muda: vincular à mão (POST /api/items/:id/sponsors e o sync) também não
// muda — quem tira a peça da vinculação é o "Enviar para Arte".
// ─────────────────────────────────────────────────────────────────────────────
import { and, eq, inArray, isNull, like, gte } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  auditLogs, eventQuotaRules, eventSponsors, events, itemSponsors, items, sponsors,
  type Event,
} from "@shared/schema";
import { EM_VINCULACAO } from "@shared/maquina-de-estados";
import { ehTipoMolde } from "@shared/molde";
import {
  aprenderPadroes, sugerirCotas, sugerirVinculos, normalizarCota,
  type CotaNoTempo, type CotaSugerida, type ElencoDoHistorico, type PadroesDeVinculo,
  type PatrocinadorDoEvento, type PecaDoHistorico, type RegraManualDeCota, type Sugestao,
} from "@shared/sugestao-de-vinculo";
import { motivoEventoFechado } from "../routes/eventoFinalizado";
import { broadcast, createAuditLogsEmLote, type AuditActor } from "../routes/shared";

// ── O histórico e os padrões aprendidos (cache de processo) ─────────────────

/**
 * O que NÃO ensina: peça que ainda não passou pela vinculação (rascunho,
 * solicitada, aguardando vinculação — o vínculo dela pode estar pela metade)
 * e o que saiu do funil.
 */
export const FORA_DO_HISTORICO = ["draft", "requested", "awaiting_linking", "canceled", "deleted", "archived"] as const;

export interface HistoricoDeVinculos {
  pecas: PecaDoHistorico[];
  elencos: ElencoDoHistorico[];
  cotasNoTempo: CotaNoTempo[];
}

/** Lê o histórico do banco: peças vinculadas que contam e todos os elencos com a data do evento. */
export async function lerHistoricoDeVinculos(): Promise<HistoricoDeVinculos> {
  const [linhas, elencoRows] = await Promise.all([
    db.select({ itemId: items.id, eventId: items.eventId, tipo: items.type, sponsorId: itemSponsors.sponsorId, status: items.status })
      .from(itemSponsors)
      .innerJoin(items, eq(items.id, itemSponsors.itemId))
      .where(and(isNull(items.deletedAt), eq(items.producaoInterna, false), eq(items.skipApproval, false))),
    db.select({ eventId: eventSponsors.eventId, sponsorId: eventSponsors.sponsorId, cota: eventSponsors.quota, inicio: events.startDate, criado: eventSponsors.createdAt })
      .from(eventSponsors)
      .innerJoin(events, eq(events.id, eventSponsors.eventId)),
  ]);
  const fora = new Set<string>(FORA_DO_HISTORICO);
  const porPeca = new Map<string, PecaDoHistorico>();
  for (const l of linhas) {
    if (fora.has(l.status) || ehTipoMolde(l.tipo)) continue;
    const p = porPeca.get(l.itemId) ?? { eventId: l.eventId, tipo: l.tipo, patrocinadores: [] };
    if (!p.patrocinadores.includes(l.sponsorId)) p.patrocinadores.push(l.sponsorId);
    porPeca.set(l.itemId, p);
  }
  return {
    pecas: Array.from(porPeca.values()),
    elencos: elencoRows.map((e) => ({ eventId: e.eventId, sponsorId: e.sponsorId, cota: e.cota })),
    cotasNoTempo: elencoRows.map((e) => ({
      eventId: e.eventId, sponsorId: e.sponsorId, cota: e.cota,
      quando: new Date(e.inicio ?? e.criado ?? 0).getTime(),
    })),
  };
}

export interface Aprendido {
  padroes: PadroesDeVinculo;
  cotas: Record<string, CotaSugerida>;
  cotasNoTempo: CotaNoTempo[];
  geradoEm: number;
}

/** Uma hora: os padrões mudam devagar (são milhares de peças); o vínculo em massa invalida antes. */
export const VALIDADE_DOS_PADROES_MS = 60 * 60 * 1000;
let cache: { em: number; valor: Promise<Aprendido> } | null = null;

/** Joga fora os padrões aprendidos — o próximo uso relê o histórico. */
export function invalidarPadroesDeVinculo(): void {
  cache = null;
}

export async function carregarAprendido(): Promise<Aprendido> {
  const agora = Date.now();
  if (cache && agora - cache.em < VALIDADE_DOS_PADROES_MS) return cache.valor;
  const valor = (async () => {
    const h = await lerHistoricoDeVinculos();
    return {
      padroes: aprenderPadroes(h.pecas, h.elencos),
      cotas: sugerirCotas(h.cotasNoTempo),
      cotasNoTempo: h.cotasNoTempo,
      geradoEm: Date.now(),
    };
  })();
  cache = { em: agora, valor };
  // Falha na leitura não fica guardada: a próxima chamada tenta de novo.
  valor.catch(() => { if (cache?.valor === valor) cache = null; });
  return valor;
}

// ── O cálculo por evento ────────────────────────────────────────────────────

interface PecaEmVinculacao {
  id: string;
  displayId: string;
  eventId: string;
  tipo: string;
  descricao: string | null;
  createdAt: Date;
  salvos: string[];
}

export interface CalculoDoEvento {
  evento: Event;
  patrocinadores: PatrocinadorDoEvento[];
  /** Só as peças SEM patrocinador salvo, com o que o motor sugere (pode ser vazio). */
  sugestoes: Map<string, { peca: PecaEmVinculacao; sugestoes: Sugestao[] }>;
  /** Peças da fase que JÁ têm patrocinador (para o selo "Automático"). */
  comVinculo: PecaEmVinculacao[];
}

/**
 * As sugestões das peças EM VINCULAÇÃO dos eventos pedidos. Evento fechado ou
 * arquivado não entra (nada a sugerir onde não se pode vincular). `itemIds`
 * recorta as peças — mas quem decide O QUÊ sugerir é sempre este cálculo.
 */
export async function calcularSugestoes(eventIds: string[], opcoes: { itemIds?: string[]; semPecasDoKit?: boolean } = {}): Promise<Map<string, CalculoDoEvento>> {
  const saida = new Map<string, CalculoDoEvento>();
  const ids = Array.from(new Set(eventIds.filter((x) => typeof x === "string" && x)));
  if (ids.length === 0) return saida;

  const eventosRows = await db.select().from(events).where(inArray(events.id, ids));
  const abertos = eventosRows.filter((e) => !motivoEventoFechado(e));
  if (abertos.length === 0) return saida;
  const idsAbertos = abertos.map((e) => e.id);

  const condicoesDaPeca = [
    inArray(items.eventId, idsAbertos),
    inArray(items.status, [...EM_VINCULACAO]),
    isNull(items.deletedAt),
    eq(items.producaoInterna, false),
    eq(items.skipApproval, false),
  ];
  // A Solicitação da Arena só VISUALIZA peça do Kit (a trava de server/routes.ts).
  if (opcoes.semPecasDoKit) condicoesDaPeca.push(isNull(items.kitRemessaId));
  if (opcoes.itemIds) {
    if (opcoes.itemIds.length === 0) return saida;
    condicoesDaPeca.push(inArray(items.id, opcoes.itemIds));
  }
  const [pecasRows, elencoRows, regrasRows] = await Promise.all([
    db.select({ id: items.id, displayId: items.displayId, eventId: items.eventId, tipo: items.type, descricao: items.description, createdAt: items.createdAt })
      .from(items).where(and(...condicoesDaPeca)),
    db.select({ eventId: eventSponsors.eventId, id: sponsors.id, nome: sponsors.name, cota: eventSponsors.quota })
      .from(eventSponsors)
      .innerJoin(sponsors, eq(sponsors.id, eventSponsors.sponsorId))
      // Patrocinador arquivado sai do elenco: não ganha vínculo novo, nem sugerido.
      .where(and(inArray(eventSponsors.eventId, idsAbertos), isNull(sponsors.arquivadoEm))),
    db.select().from(eventQuotaRules).where(inArray(eventQuotaRules.eventId, idsAbertos)),
  ]);
  const pecas = pecasRows.filter((p) => !ehTipoMolde(p.tipo));
  const vinculos = pecas.length > 0 ? await storage.getItemSponsorsByItemIds(pecas.map((p) => p.id)) : [];
  const salvosDe = new Map<string, string[]>();
  for (const v of vinculos) {
    if (!salvosDe.has(v.itemId)) salvosDe.set(v.itemId, []);
    salvosDe.get(v.itemId)!.push(v.sponsorId);
  }

  const aprendido = await carregarAprendido();
  // As regras manuais: as do evento; sem nenhuma, as globais (a mesma
  // precedência da vinculação por cota, storage.previewAutoLink).
  const precisaGlobais = idsAbertos.some((id) => !regrasRows.some((r) => r.eventId === id));
  const globais: RegraManualDeCota[] = precisaGlobais
    ? (await storage.getGlobalQuotaRules())
      .filter((r) => (r.itemTypes ?? []).length > 0)
      .map((r) => ({ cota: r.quota, tipos: r.itemTypes, origem: "geral" as const }))
    : [];

  for (const evento of abertos) {
    const doEvento = regrasRows.filter((r) => r.eventId === evento.id && (r.itemTypes ?? []).length > 0)
      .map((r) => ({ cota: r.quota, tipos: r.itemTypes, origem: "evento" as const }));
    const temRegraPropria = regrasRows.some((r) => r.eventId === evento.id);
    const regras = temRegraPropria ? doEvento : globais;
    const patrocinadores: PatrocinadorDoEvento[] = elencoRows
      .filter((e) => e.eventId === evento.id)
      .map((e) => {
        const cota = normalizarCota(e.cota);
        if (cota) return { id: e.id, nome: e.nome, cota };
        const doHistorico = aprendido.cotas[e.id];
        return doHistorico ? { id: e.id, nome: e.nome, cota: doHistorico.cota, cotaDoHistorico: true } : { id: e.id, nome: e.nome, cota: null };
      });
    const calculo: CalculoDoEvento = { evento, patrocinadores, sugestoes: new Map(), comVinculo: [] };
    for (const p of pecas) {
      if (p.eventId !== evento.id) continue;
      const peca: PecaEmVinculacao = { ...p, salvos: salvosDe.get(p.id) ?? [] };
      if (peca.salvos.length > 0) { calculo.comVinculo.push(peca); continue; }
      calculo.sugestoes.set(p.id, { peca, sugestoes: sugerirVinculos({ tipo: p.tipo, descricao: p.descricao }, patrocinadores, aprendido.padroes, regras) });
    }
    saida.set(evento.id, calculo);
  }
  return saida;
}

// ── Leitura para a tela ─────────────────────────────────────────────────────

/** A frase da trilha do vínculo automático — o selo "Automático" da tela a procura. */
export const PREFIXO_DA_TRILHA_AUTOMATICA = "vinculado automaticamente";
export const fraseDaTrilhaAutomatica = (nome: string, motivo: string) =>
  `Patrocinador "${nome}" ${PREFIXO_DA_TRILHA_AUTOMATICA} — ${motivo.charAt(0).toLowerCase()}${motivo.slice(1)}`;

export interface SugestoesDoEvento {
  porPeca: Record<string, Sugestao[]>;
  /** Vínculos JÁ gravados pelo vínculo automático, por peça (o selo "Automático"). */
  automaticos: Record<string, Array<{ sponsorId: string; motivo: string }>>;
}

/** O vínculo automático gravado de cada peça — lido da trilha (sem coluna nova). */
async function automaticosDasPecas(pecas: PecaEmVinculacao[], nomes: Map<string, string>): Promise<SugestoesDoEvento["automaticos"]> {
  const saida: SugestoesDoEvento["automaticos"] = {};
  if (pecas.length === 0) return saida;
  const desde = new Date(Math.min(...pecas.map((p) => new Date(p.createdAt).getTime())));
  const linhas = await db.select({ itemId: auditLogs.entityId, detalhe: auditLogs.details })
    .from(auditLogs)
    .where(and(
      eq(auditLogs.entityType, "item"),
      eq(auditLogs.action, "added"),
      // O índice (entity_type, created_at) anda só na janela das peças desta fase.
      gte(auditLogs.createdAt, desde),
      inArray(auditLogs.entityId, pecas.map((p) => p.id)),
      like(auditLogs.details, `Patrocinador "%" ${PREFIXO_DA_TRILHA_AUTOMATICA}%`),
    ));
  const porNome = new Map<string, string>();
  nomes.forEach((nome, id) => porNome.set(nome, id));
  const salvosDe = new Map(pecas.map((p) => [p.id, new Set(p.salvos)]));
  for (const l of linhas) {
    const m = /^Patrocinador "(.*)" vinculado automaticamente — (.*)$/.exec(l.detalhe ?? "");
    if (!m) continue;
    const sponsorId = porNome.get(m[1]);
    // Só o que CONTINUA na peça: desvinculado depois, o selo some.
    if (!sponsorId || !salvosDe.get(l.itemId)?.has(sponsorId)) continue;
    const lista = (saida[l.itemId] ??= []);
    if (!lista.some((x) => x.sponsorId === sponsorId)) {
      lista.push({ sponsorId, motivo: m[2].charAt(0).toUpperCase() + m[2].slice(1) });
    }
  }
  return saida;
}

/** O que a tela de Vincular lê, por evento. */
export async function sugestoesDosEventos(eventIds: string[]): Promise<Record<string, SugestoesDoEvento>> {
  const calculos = await calcularSugestoes(eventIds);
  const saida: Record<string, SugestoesDoEvento> = {};
  for (const [eventId, c] of Array.from(calculos.entries())) {
    const porPeca: SugestoesDoEvento["porPeca"] = {};
    c.sugestoes.forEach(({ sugestoes }, itemId) => { if (sugestoes.length > 0) porPeca[itemId] = sugestoes; });
    const nomes = new Map(c.patrocinadores.map((p) => [p.id, p.nome]));
    saida[eventId] = { porPeca, automaticos: await automaticosDasPecas(c.comVinculo, nomes) };
  }
  return saida;
}

// ── Gravação ────────────────────────────────────────────────────────────────

export interface PecaAplicada { itemId: string; displayId: string; sponsorIds: string[] }

async function gravarVinculos(pares: Array<{ itemId: string; sponsorId: string }>): Promise<void> {
  if (pares.length === 0) return;
  await db.insert(itemSponsors).values(pares).onConflictDoNothing();
  // O carimbo do delta (/api/items?since=), como o touchItem do storage.
  const ids = Array.from(new Set(pares.map((p) => p.itemId)));
  try {
    await db.update(items).set({ updatedAt: new Date() }).where(inArray(items.id, ids));
  } catch (e) {
    console.error("[sugestao-de-vinculo] falha ao carimbar updated_at", ids.length, e);
  }
}

/**
 * "APLICAR SUGESTÕES" — recalcula no servidor (a lista do cliente só recorta
 * QUAIS peças) e grava tudo o que o motor sugere para as peças sem
 * patrocinador. Trilha por peça, um broadcast, padrões invalidados.
 */
export async function aplicarSugestoes(
  req: AuditActor,
  eventId: string,
  itemIds?: string[],
  opcoes: { semPecasDoKit?: boolean } = {},
): Promise<{ aplicadas: PecaAplicada[]; vinculos: number }> {
  const calculos = await calcularSugestoes([eventId], { ...(itemIds ? { itemIds } : {}), semPecasDoKit: opcoes.semPecasDoKit });
  const c = calculos.get(eventId);
  if (!c) return { aplicadas: [], vinculos: 0 };
  const nomes = new Map(c.patrocinadores.map((p) => [p.id, p.nome]));
  const aplicadas: PecaAplicada[] = [];
  const pares: Array<{ itemId: string; sponsorId: string }> = [];
  const trilha: Array<{ action: string; entityType: string; entityId: string; details: string }> = [];
  c.sugestoes.forEach(({ peca, sugestoes }) => {
    if (sugestoes.length === 0) return;
    const sponsorIds = sugestoes.map((s) => s.sponsorId);
    sponsorIds.forEach((sponsorId) => pares.push({ itemId: peca.id, sponsorId }));
    aplicadas.push({ itemId: peca.id, displayId: peca.displayId, sponsorIds });
    trilha.push({
      action: "added", entityType: "item", entityId: peca.id,
      details: `Sugestão de vínculo aplicada na peça ${peca.displayId}: ${sugestoes.map((s) => `"${nomes.get(s.sponsorId) ?? s.sponsorId}" (${s.motivo})`).join("; ")}`,
    });
  });
  if (pares.length === 0) return { aplicadas: [], vinculos: 0 };
  await gravarVinculos(pares);
  await createAuditLogsEmLote(req, trilha);
  invalidarPadroesDeVinculo();
  broadcast({ type: "item_updated", eventId });
  return { aplicadas, vinculos: pares.length };
}

/**
 * O VÍNCULO AUTOMÁTICO (só a regra 1): chamado quando as peças ENTRAM na fase
 * de vinculação. Grava só o que o motor marca `automatica` — um patrocinador
 * cujo nome está na descrição, sem nada mais pedindo outro. Falhar aqui não
 * desfaz quem chamou: a peça segue sem patrocinador, como antes.
 */
export async function vincularAutomaticamente(
  req: AuditActor,
  pecas: Array<{ id: string; eventId: string; status: string }>,
): Promise<{ vinculos: number; pecas: string[] }> {
  try {
    const naFase = pecas.filter((p) => (EM_VINCULACAO as readonly string[]).includes(p.status));
    if (naFase.length === 0) return { vinculos: 0, pecas: [] };
    const calculos = await calcularSugestoes(naFase.map((p) => p.eventId), { itemIds: naFase.map((p) => p.id) });
    const pares: Array<{ itemId: string; sponsorId: string }> = [];
    const trilha: Array<{ action: string; entityType: string; entityId: string; details: string }> = [];
    calculos.forEach((c) => {
      const nomes = new Map(c.patrocinadores.map((p) => [p.id, p.nome]));
      c.sugestoes.forEach(({ peca, sugestoes }) => {
        for (const s of sugestoes) {
          if (!s.automatica) continue;
          pares.push({ itemId: peca.id, sponsorId: s.sponsorId });
          trilha.push({ action: "added", entityType: "item", entityId: peca.id, details: fraseDaTrilhaAutomatica(nomes.get(s.sponsorId) ?? s.sponsorId, s.motivo) });
        }
      });
    });
    if (pares.length === 0) return { vinculos: 0, pecas: [] };
    await gravarVinculos(pares);
    await createAuditLogsEmLote(req, trilha);
    for (const p of pares) broadcast({ type: "item_sponsor_added", itemSponsor: p });
    return { vinculos: pares.length, pecas: Array.from(new Set(pares.map((p) => p.itemId))) };
  } catch (e) {
    console.error("[vinculo-automatico] falhou — as peças seguem sem patrocinador:", e);
    return { vinculos: 0, pecas: [] };
  }
}

// ── Cota sugerida ───────────────────────────────────────────────────────────

/** A cota mais recente de cada patrocinador em OUTROS eventos. */
export async function cotasSugeridas(excetoEvento?: string | null): Promise<Record<string, CotaSugerida>> {
  const a = await carregarAprendido();
  return excetoEvento ? sugerirCotas(a.cotasNoTempo, excetoEvento) : a.cotas;
}
