import { db } from "../db";
import { items, itemSponsors, eventSponsors, sponsors, events, auditLogs } from "@shared/schema";
import { isNull } from "drizzle-orm";

type DatabaseLike = {
  select: typeof db.select;
};

export type VinculoEventoPendente = {
  eventId: string;
  sponsorId: string;
  eventName: string;
  sponsorName: string;
  provas: string[];
};

type Actor = {
  userId?: string | null;
  userName?: string | null;
};

async function encontrarPendencias(database: DatabaseLike): Promise<VinculoEventoPendente[]> {
  const [vinculosDePeca, vinculosDeEvento, pecas, cadastro, eventosTodos] = await Promise.all([
    database.select().from(itemSponsors),
    database.select().from(eventSponsors),
    database.select({ id: items.id, eventId: items.eventId, displayId: items.displayId })
      .from(items)
      .where(isNull(items.deletedAt)),
    database.select({ id: sponsors.id, name: sponsors.name }).from(sponsors),
    database.select({ id: events.id, name: events.name }).from(events),
  ]);

  const pecaPorId = new Map(pecas.map((p) => [p.id, p]));
  const nomeDoSponsor = new Map(cadastro.map((s) => [s.id, s.name]));
  const nomeDoEvento = new Map(eventosTodos.map((e) => [e.id, e.name]));
  const jaNoEvento = new Set(vinculosDeEvento.map((v) => `${v.eventId}|${v.sponsorId}`));
  const faltando = new Map<string, string[]>();

  for (const v of vinculosDePeca) {
    const peca = pecaPorId.get(v.itemId);
    if (!peca?.eventId) continue;
    const chave = `${peca.eventId}|${v.sponsorId}`;
    if (jaNoEvento.has(chave)) continue;
    const provas = faltando.get(chave) ?? [];
    provas.push(peca.displayId ?? peca.id);
    faltando.set(chave, provas);
  }

  return Array.from(faltando.entries()).map(([chave, provas]) => {
    const [eventId, sponsorId] = chave.split("|");
    return {
      eventId,
      sponsorId,
      eventName: nomeDoEvento.get(eventId) ?? eventId,
      sponsorName: nomeDoSponsor.get(sponsorId) ?? sponsorId,
      provas,
    };
  });
}

export async function listarVinculosEventoPendentes(): Promise<VinculoEventoPendente[]> {
  return encontrarPendencias(db);
}

export async function aplicarVinculosEventoPendentes(actor: Actor) {
  return db.transaction(async (tx) => {
    const pendencias = await encontrarPendencias(tx);
    const userName = actor.userName?.trim() || "Administrador";
    let aplicados = 0;

    for (const pendencia of pendencias) {
      await tx.insert(eventSponsors).values({
        eventId: pendencia.eventId,
        sponsorId: pendencia.sponsorId,
      });
      await tx.insert(auditLogs).values({
        userId: actor.userId ?? null,
        userName,
        action: "added",
        entityType: "event_sponsor",
        entityId: `${pendencia.eventId}_${pendencia.sponsorId}`,
        details: `Vínculo evento↔patrocinador criado pelo reparo: "${pendencia.sponsorName}" já estava em peças do evento "${pendencia.eventName}" sem constar no evento (sem cota — defina no Vincular se precisar).`,
      } as any);
      aplicados += 1;
    }

    return {
      totalEncontrado: pendencias.length,
      aplicados,
      vinculos: pendencias,
    };
  });
}