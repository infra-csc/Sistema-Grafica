// ─────────────────────────────────────────────────────────────────────────────
// REPARO: patrocinador que está NA PEÇA mas não está NO EVENTO.
//
// O caso do dono (25/08, Primavera São Paulo): o Atendimento mostra "falta
// Livelo" nas peças, e o Vincular Patrocinadores diz "Sem patrocinadores no
// evento" — porque as duas telas leem tabelas diferentes. item_sponsors tem a
// marca; event_sponsors não. Peça não deveria carregar marca que o evento não
// conhece: o caminho que criava isso pelo modal foi fechado em 25/08 (o
// Adicionar vincula ao EVENTO primeiro), mas o estoque antigo continua torto.
//
// O QUE ELE FAZ: para cada vínculo peça↔patrocinador de peça viva, garante o
// vínculo evento↔patrocinador correspondente (INSERT só do que falta).
//
// O QUE ELE NÃO FAZ: não mexe em cota (o vínculo nasce sem cota — alguém
// define depois no Vincular), não remove nada, não toca peça nem aprovação.
//
// Idempotente: depois de rodar, nada mais casa o critério.
//
//   npx tsx scripts/reparar-vinculos-de-evento.ts           (lista)
//   npx tsx scripts/reparar-vinculos-de-evento.ts --aplicar (grava)
// ─────────────────────────────────────────────────────────────────────────────
import { db } from "../server/db";
import { items, itemSponsors, eventSponsors, sponsors, events, auditLogs } from "../shared/schema";
import { isNull, eq } from "drizzle-orm";

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const [vinculosDePeca, vinculosDeEvento, pecas, cadastro, eventosTodos] = await Promise.all([
    db.select().from(itemSponsors),
    db.select().from(eventSponsors),
    db.select({ id: items.id, eventId: items.eventId, displayId: items.displayId }).from(items).where(isNull(items.deletedAt)),
    db.select({ id: sponsors.id, name: sponsors.name }).from(sponsors),
    db.select({ id: events.id, name: events.name }).from(events),
  ]);

  const pecaPorId = new Map(pecas.map((p) => [p.id, p]));
  const nomeDoSponsor = new Map(cadastro.map((s) => [s.id, s.name]));
  const nomeDoEvento = new Map(eventosTodos.map((e) => [e.id, e.name]));
  const jaNoEvento = new Set(vinculosDeEvento.map((v) => `${v.eventId}|${v.sponsorId}`));

  // eventId|sponsorId → displayIds das peças que provam o vínculo
  const faltando = new Map<string, string[]>();
  for (const v of vinculosDePeca) {
    const peca = pecaPorId.get(v.itemId);
    if (!peca?.eventId) continue; // peça excluída ou órfã não cria vínculo
    const chave = `${peca.eventId}|${v.sponsorId}`;
    if (jaNoEvento.has(chave)) continue;
    const l = faltando.get(chave) ?? [];
    l.push(peca.displayId ?? peca.id);
    faltando.set(chave, l);
  }

  if (faltando.size === 0) {
    console.log("Nada a reparar: todo patrocinador de peça está vinculado ao seu evento.");
    return;
  }

  console.log(`${faltando.size} vínculo(s) de evento faltando:\n`);
  for (const [chave, provas] of Array.from(faltando.entries())) {
    const [eventId, sponsorId] = chave.split("|");
    console.log(
      `  · ${nomeDoEvento.get(eventId) ?? eventId} ← "${nomeDoSponsor.get(sponsorId) ?? sponsorId}"` +
      ` (está em ${provas.length} peça${provas.length !== 1 ? "s" : ""}: ${provas.slice(0, 5).join(", ")}${provas.length > 5 ? "…" : ""})`
    );
  }

  if (!aplicar) {
    console.log("\nDry-run: nada gravado. Rode com --aplicar para criar os vínculos.");
    return;
  }

  for (const chave of Array.from(faltando.keys())) {
    const [eventId, sponsorId] = chave.split("|");
    await db.insert(eventSponsors).values({ eventId, sponsorId } as any);
    await db.insert(auditLogs).values({
      userId: null,
      userName: "Script de reparo",
      action: "added",
      entityType: "event_sponsor",
      entityId: `${eventId}_${sponsorId}`,
      details: `Vínculo evento↔patrocinador criado pelo reparo: "${nomeDoSponsor.get(sponsorId) ?? sponsorId}" já estava em peças do evento "${nomeDoEvento.get(eventId) ?? eventId}" sem constar no evento (sem cota — defina no Vincular se precisar).`,
    } as any);
  }
  console.log(`\n${faltando.size} vínculo(s) criado(s). O Vincular Patrocinadores volta a bater com as peças.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
