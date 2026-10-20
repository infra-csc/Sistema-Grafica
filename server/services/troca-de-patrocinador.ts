// ─────────────────────────────────────────────────────────────────────────────
// TROCAR O PATROCINADOR DO EVENTO, NUMA TRANSAÇÃO SÓ (dono, 20/10).
//
// A rota (POST /api/events/:id/sponsors/trocar, server/routes/sponsors.ts) faz
// as guardas; aqui mora a escrita. Tudo ou nada: ou as 17 peças passam para o
// novo, a cota passa, o novo entra no evento e o antigo sai — ou nada disso
// acontece. A primeira versão do desvínculo (DELETE peça a peça, sem
// transação) deixava o evento pela metade quando uma ida ao banco falhava.
//
// O QUE ACONTECE COM CADA PEÇA está em shared/troca-de-patrocinador.ts
// (faseNaTroca), com a decisão sobre as que já passaram da aprovação. Nenhuma
// peça é cancelada aqui — é o motivo de a rota existir.
//
// Tudo dentro do `tx`: o banco de teste é uma sessão só, e qualquer leitura
// por outra conexão com a transação aberta travaria (banco-pglite.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  items, itemSponsors, itemSponsorApprovals, eventSponsors, auditLogs, notifications,
  type Item, type Notification,
} from "@shared/schema";
import { ehMolde } from "@shared/molde";
import { faseNaTroca, resumoDaTroca, type ResultadoDaTroca } from "@shared/troca-de-patrocinador";

const ROTULO_DO_STATUS: Record<string, string> = {
  sponsor_approved: "Aguardando Finalização",
  awaiting_sponsor_approval: "Aguardando Aprovação",
  awaiting_approval: "Aguardando Aprovação",
};

export interface EntradaDaTroca {
  eventId: string;
  eventName: string;
  de: { id: string; name: string };
  para: { id: string; name: string };
  ator: { userId: string | null; userName: string };
}

export interface SaidaDaTroca {
  resultado: ResultadoDaTroca;
  /** Peças regravadas (vínculo, status) — para o broadcast depois do COMMIT. */
  itensAlterados: Item[];
  notificacoes: Notification[];
  /** Linha nova do vínculo evento↔novo, quando criada. */
  vinculoCriado: boolean;
}

export async function trocarPatrocinadorDoEvento(e: EntradaDaTroca): Promise<SaidaDaTroca> {
  const { eventId, de, para, ator } = e;
  const agora = new Date();

  return db.transaction(async (tx) => {
    // As peças vivas do evento que têm o antigo — TRAVADAS: um segundo clique
    // (ou outra aba) espera esta troca terminar e então não acha mais nada.
    const linhas = await tx
      .select({ item: items })
      .from(itemSponsors)
      .innerJoin(items, eq(items.id, itemSponsors.itemId))
      .where(and(eq(itemSponsors.sponsorId, de.id), eq(items.eventId, eventId), isNull(items.deletedAt)))
      .for("update", { of: items });
    const pecas = linhas.map((l) => l.item);
    const ids = pecas.map((p) => p.id);

    const jaComONovo = new Set<string>();
    const aprovacoes = new Map<string, { id: string; status: string }>(); // `${itemId}:${sponsorId}`
    if (ids.length > 0) {
      const vinc = await tx.select({ itemId: itemSponsors.itemId }).from(itemSponsors)
        .where(and(eq(itemSponsors.sponsorId, para.id), inArray(itemSponsors.itemId, ids)));
      vinc.forEach((v) => jaComONovo.add(v.itemId));
      const aps = await tx.select({ id: itemSponsorApprovals.id, itemId: itemSponsorApprovals.itemId, sponsorId: itemSponsorApprovals.sponsorId, status: itemSponsorApprovals.status })
        .from(itemSponsorApprovals)
        .where(and(inArray(itemSponsorApprovals.itemId, ids), inArray(itemSponsorApprovals.sponsorId, [de.id, para.id])));
      aps.forEach((a) => aprovacoes.set(`${a.itemId}:${a.sponsorId}`, a));
    }

    const c = {
      pecas: pecas.length, passaram: 0, jaTinhamONovo: 0, pendenciasAbertas: 0, pendenciasDescartadas: 0,
      aprovacoesMantidas: 0, semReabrir: 0, rodadasFechadas: 0, soTiradas: 0,
    };
    const itensAlterados: Item[] = [];
    const notificacoes: Notification[] = [];
    const trilha: { action: string; entityType: string; entityId: string; details: string }[] = [];

    for (const peca of pecas) {
      const rotulo = peca.displayId || peca.type || peca.id;
      const fase = faseNaTroca(peca.status);
      // Molde e produção interna não levam patrocinador (shared/molde,
      // shared/producao-interna): o antigo sai, o novo não entra.
      const semPatrocinadorPorRegra = ehMolde(peca) || !!peca.producaoInterna;

      // 1. O vínculo: entra o novo, sai o antigo.
      const jaTinha = jaComONovo.has(peca.id);
      if (!semPatrocinadorPorRegra) {
        if (jaTinha) c.jaTinhamONovo++;
        else await tx.insert(itemSponsors).values({ itemId: peca.id, sponsorId: para.id }).onConflictDoNothing();
        c.passaram++;
      } else {
        c.soTiradas++;
      }
      await tx.delete(itemSponsors).where(and(eq(itemSponsors.itemId, peca.id), eq(itemSponsors.sponsorId, de.id)));

      // 2. A linha do antigo: APROVADA fica (é registro); o resto é descartado.
      const linhaDe = aprovacoes.get(`${peca.id}:${de.id}`);
      let descartou = false;
      if (linhaDe && linhaDe.status === "approved") {
        c.aprovacoesMantidas++;
      } else if (linhaDe) {
        await tx.delete(itemSponsorApprovals).where(eq(itemSponsorApprovals.id, linhaDe.id));
        c.pendenciasDescartadas++;
        descartou = true;
      }

      // 3. A linha do novo: só com a rodada ABERTA (a mesma regra do POST
      //    /api/items/:id/sponsors). Antes dela, a rodada nasce dos vínculos;
      //    depois dela, não se reabre (ver faseNaTroca).
      let abriu = false;
      if (fase === "em_aprovacao" && !semPatrocinadorPorRegra && !aprovacoes.has(`${peca.id}:${para.id}`)) {
        await tx.insert(itemSponsorApprovals).values({ itemId: peca.id, sponsorId: para.id, status: "pending" }).onConflictDoNothing();
        c.pendenciasAbertas++;
        abriu = true;
      }
      if (fase === "depois_da_aprovacao") c.semReabrir++;

      // 4. Fechou a rodada? Só quando o novo JÁ tinha aprovado e o antigo era
      //    o único que faltava — o mesmo avanço da última aprovação.
      let novoStatus: string | null = null;
      if (fase === "em_aprovacao" && descartou && !abriu) {
        const restantes = await tx.select({ status: itemSponsorApprovals.status }).from(itemSponsorApprovals)
          .where(eq(itemSponsorApprovals.itemId, peca.id));
        if (restantes.length > 0 && restantes.every((l) => l.status === "approved")) novoStatus = "sponsor_approved";
      }

      const [gravada] = await tx.update(items)
        .set(novoStatus
          ? { status: novoStatus, sponsorApprovedBy: ator.userName, sponsorApprovedAt: agora, rejectedBySponsor: false, updatedAt: agora }
          : { updatedAt: agora })
        .where(eq(items.id, peca.id))
        .returning();
      if (gravada) itensAlterados.push(gravada);

      trilha.push({
        action: "updated", entityType: "item", entityId: peca.id,
        details: (semPatrocinadorPorRegra
          ? `Patrocinador "${de.name}" tirado da peça ${rotulo} na troca por "${para.name}" — a peça não leva patrocinador (molde ou produção interna), então o novo não entrou`
          : `Patrocinador "${de.name}" trocado por "${para.name}" na peça ${rotulo} (troca no evento; a peça NÃO foi cancelada)`)
          + (jaTinha && !semPatrocinadorPorRegra ? ` — "${para.name}" já estava na peça` : "")
          + (abriu ? ` — aprovação pendente aberta para "${para.name}"` : "")
          + (linhaDe?.status === "approved" ? ` — a aprovação que "${de.name}" já deu fica no histórico` : descartou ? ` — a aprovação pendente de "${de.name}" foi descartada` : "")
          + (fase === "depois_da_aprovacao" ? ` — a peça já tinha passado da aprovação (${ROTULO_DO_STATUS[peca.status] ?? peca.status}); a aprovação NÃO foi reaberta` : ""),
      });

      if (novoStatus) {
        c.rodadasFechadas++;
        trilha.push({
          action: "approved", entityType: "item", entityId: peca.id,
          details: `Com a troca de "${de.name}" por "${para.name}", todos os patrocinadores já aprovaram. Status alterado: ${ROTULO_DO_STATUS[peca.status] ?? peca.status} → ${ROTULO_DO_STATUS.sponsor_approved}`,
        });
        const [n] = await tx.insert(notifications).values({
          type: "arteApproved",
          message: `Aprovação concluída (o novo patrocinador já tinha aprovado). Finalize o layout e adicione o arquivo final: ${peca.type} - Evento: ${e.eventName}`,
          eventId, itemId: peca.id, targetRoles: ["arte"],
        }).returning();
        if (n) notificacoes.push(n);
      }
    }

    // 5. O EVENTO: o novo entra (com a cota do antigo, se ele não tiver uma) e
    //    o antigo sai. A regra de cota do evento (event_quota_rules) é por NOME
    //    de cota, não por patrocinador — não há o que copiar ali; o que passa é
    //    a cota do vínculo.
    const vinculos = await tx.select().from(eventSponsors)
      .where(and(eq(eventSponsors.eventId, eventId), inArray(eventSponsors.sponsorId, [de.id, para.id])));
    const vDe = vinculos.find((v) => v.sponsorId === de.id);
    const vPara = vinculos.find((v) => v.sponsorId === para.id);
    const cotaDoAntigo = vDe?.quota || null;
    let cotaHerdada: string | null = null;
    let vinculoCriado = false;
    if (!vPara) {
      const criado = await tx.insert(eventSponsors).values({ eventId, sponsorId: para.id, quota: cotaDoAntigo }).onConflictDoNothing().returning();
      vinculoCriado = criado.length > 0;
      if (vinculoCriado) cotaHerdada = cotaDoAntigo;
    } else if (!vPara.quota && cotaDoAntigo) {
      await tx.update(eventSponsors).set({ quota: cotaDoAntigo }).where(eq(eventSponsors.id, vPara.id));
      cotaHerdada = cotaDoAntigo;
    }
    if (vDe) await tx.delete(eventSponsors).where(eq(eventSponsors.id, vDe.id));

    const parcial = { ...c, canceladas: 0 as const, vinculoDoNovo: (vPara ? "ja_existia" : "criado") as "criado" | "ja_existia", cotaHerdada };
    // Repetição de uma troca já feita (clique duplo, nova tentativa): o antigo
    // não está mais em lugar nenhum e o novo já estava no evento.
    const nadaATrocar = pecas.length === 0 && !vDe && !!vPara && !cotaHerdada;
    const resumo = nadaATrocar
      ? `Nada a trocar: "${de.name}" já não está no evento nem nas peças, e "${para.name}" já está no evento`
      : resumoDaTroca(de.name, para.name, parcial);
    if (!nadaATrocar) trilha.push({ action: "updated", entityType: "event", entityId: eventId, details: resumo });

    // 6. O Atendimento fica sabendo das aprovações novas — um aviso só, pelo
    //    evento (17 avisos iguais afogariam o sino).
    if (c.pendenciasAbertas > 0) {
      const [n] = await tx.insert(notifications).values({
        type: "itemAdded",
        message: `"${para.name}" entrou no lugar de "${de.name}" no evento ${e.eventName}: ${plural(c.pendenciasAbertas, "peça aguarda", "peças aguardam")} a aprovação do novo patrocinador.`,
        eventId, targetRoles: ["atendimento"],
      }).returning();
      if (n) notificacoes.push(n);
    }

    if (trilha.length > 0) await tx.insert(auditLogs).values(trilha.map((t) => ({ ...ator, ...t })));

    return {
      resultado: { de: de.id, para: para.id, ...parcial, nadaATrocar, resumo },
      itensAlterados,
      notificacoes,
      vinculoCriado,
    };
  });
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
