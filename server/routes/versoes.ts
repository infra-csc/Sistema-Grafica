// ─────────────────────────────────────────────────────────────────────────────
// VERSÕES APROVADAS — qual versão da arte cada patrocinador aprovou, de qual
// peça, e os books de cada evento com história.
//
// Pedido do dono (21/08/2026). O que existia antes desta rota:
//   · a aprovação dizia "aprovou" e "quando", mas não O QUÊ — com a Arte
//     trocando o thumb depois, "aprovado" passava a apontar para uma arte que
//     o patrocinador nunca viu;
//   · a história das versões morava só no texto da trilha de auditoria
//     ("Thumb de aprovação atualizado … Anterior: X → Novo: Y");
//   · `items.book_url` guardava só o book ATUAL do evento.
//
// Daqui em diante três coisas são GRAVADAS (item_art_versions, event_books e
// item_sponsor_approvals.decided_thumb_url — ver routes/items.ts). Para o que
// já aconteceu, esta rota RECONSTRÓI da trilha, e marca o que é inferido: uma
// aprovação sem `decidedThumbUrl` recebe a versão vigente na data da decisão,
// com `inferido: true`. A tela diz isso em voz alta — inferência apresentada
// como registro é o erro que esta tela existe para evitar.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { db } from "../db";
import { storage } from "../storage";
import { auditLogs } from "@shared/schema";
import { requireAuth } from "./shared";
import { sql } from "drizzle-orm";

export type VersaoDaArte = {
  thumbUrl: string;
  em: string;               // ISO
  origem: "envio" | "reenvio" | "troca" | "trilha" | "atual";
  por: string | null;
  /** Reconstruída da trilha de auditoria ou do estado atual — não gravada como versão. */
  inferida: boolean;
};

export type DecisaoDoPatrocinador = {
  sponsorId: string;
  nome: string;
  cor: string | null;
  status: string;
  decididoEm: string | null;
  por: string | null;
  motivo: string | null;
  /** O thumb que o patrocinador de fato decidiu (gravado), ou o vigente na data (inferido). */
  thumbUrl: string | null;
  /** Índice da versão na lista da peça (1 = primeira), quando localizável. */
  versao: number | null;
  inferido: boolean;
};

const RE_TROCA = /Thumb de aprovação atualizado por (.+?)\. Anterior: (\S+) → Novo: (\S+)/;

export function registerVersoesRoutes(app: Express): void {
  app.get("/api/versoes", requireAuth, async (_req, res) => {
    try {
      const [itens, eventos, sponsors, aprovacoes, versoesGravadas, booksGravados, logsDeTroca] = await Promise.all([
        storage.getAllItems(),
        storage.getAllEvents(),
        storage.getAllSponsors(),
        storage.getAllItemSponsorApprovals(),
        storage.getAllItemArtVersions(),
        storage.getAllEventBooks(),
        db.select().from(auditLogs)
          .where(sql`${auditLogs.entityType} = 'item' and ${auditLogs.details} like 'Thumb de aprovação atualizado%'`)
          .orderBy(auditLogs.createdAt),
      ]);

      const eventoPorId = new Map(eventos.map((e) => [e.id, e]));
      const sponsorPorId = new Map(sponsors.map((s) => [s.id, s]));

      // ── versões por peça ──
      const versoesPorItem = new Map<string, VersaoDaArte[]>();
      const push = (itemId: string, v: VersaoDaArte) => {
        const l = versoesPorItem.get(itemId) ?? [];
        l.push(v);
        versoesPorItem.set(itemId, l);
      };
      for (const v of versoesGravadas) {
        push(v.itemId, { thumbUrl: v.thumbUrl, em: new Date(v.createdAt).toISOString(), origem: v.origem as VersaoDaArte["origem"], por: v.createdBy ?? null, inferida: false });
      }
      // Legado: cada troca na trilha dá DUAS pistas — o anterior existia antes
      // da data do log, o novo passou a valer na data do log.
      for (const log of logsDeTroca) {
        const m = RE_TROCA.exec(log.details ?? "");
        if (!m) continue;
        const [, por, anterior, novo] = m;
        const em = new Date(log.createdAt).toISOString();
        const lista = versoesPorItem.get(log.entityId) ?? [];
        if (!lista.some((x) => x.thumbUrl === anterior)) {
          push(log.entityId, { thumbUrl: anterior, em: new Date(new Date(log.createdAt).getTime() - 1).toISOString(), origem: "trilha", por: null, inferida: true });
        }
        if (!(versoesPorItem.get(log.entityId) ?? []).some((x) => x.thumbUrl === novo)) {
          push(log.entityId, { thumbUrl: novo, em, origem: "trilha", por, inferida: true });
        }
      }

      // ── decisões por peça ──
      const aprovPorItem = new Map<string, typeof aprovacoes>();
      for (const a of aprovacoes) {
        const l = aprovPorItem.get(a.itemId) ?? [];
        l.push(a);
        aprovPorItem.set(a.itemId, l);
      }

      const saida = [];
      for (const item of itens) {
        if ((item as any).deletedAt) continue;
        const decisoes = aprovPorItem.get(item.id) ?? [];
        let versoes = versoesPorItem.get(item.id) ?? [];
        // O thumb atual entra como versão quando nada o registrou (peça anterior
        // às tabelas, ou enviada por um caminho que não grava).
        if (item.approvalThumbUrl && !versoes.some((v) => v.thumbUrl === item.approvalThumbUrl)) {
          const em = item.approvalThumbUpdatedAt ?? item.updatedAt ?? item.createdAt;
          versoes = [...versoes, { thumbUrl: item.approvalThumbUrl, em: new Date(em as any).toISOString(), origem: "atual", por: null, inferida: true }];
        }
        if (decisoes.length === 0 && versoes.length === 0) continue;
        versoes.sort((a, b) => a.em.localeCompare(b.em));
        const indice = (url: string | null) => {
          if (!url) return null;
          const i = versoes.findIndex((v) => v.thumbUrl === url);
          return i >= 0 ? i + 1 : null;
        };
        const vigenteEm = (iso: string | null): string | null => {
          if (!iso) return null;
          let atual: string | null = null;
          for (const v of versoes) { if (v.em <= iso) atual = v.thumbUrl; else break; }
          return atual ?? (versoes[0]?.thumbUrl ?? null);
        };
        const decisoesSaida: DecisaoDoPatrocinador[] = decisoes.map((a) => {
          const sp = sponsorPorId.get(a.sponsorId);
          const decididoEm = (a.approvedAt ?? a.rejectedAt) ? new Date((a.approvedAt ?? a.rejectedAt) as any).toISOString() : null;
          const gravado = (a as any).decidedThumbUrl as string | null | undefined;
          const thumbUrl = gravado ?? (decididoEm ? vigenteEm(decididoEm) : null);
          return {
            sponsorId: a.sponsorId,
            nome: sp?.name ?? "Patrocinador",
            cor: sp?.color ?? null,
            status: a.status,
            decididoEm,
            por: a.approvedBy ?? a.rejectedBy ?? null,
            motivo: a.rejectionReason ?? null,
            thumbUrl,
            versao: indice(thumbUrl),
            inferido: !gravado && thumbUrl !== null,
          };
        });
        const ev = eventoPorId.get(item.eventId);
        saida.push({
          id: item.id,
          displayId: item.displayId,
          type: item.type,
          description: item.description,
          status: item.status,
          eventId: item.eventId,
          eventName: ev?.name ?? "Evento desconhecido",
          truckDepartureDate: ev?.truckDepartureDate ?? null,
          approvalThumbUrl: item.approvalThumbUrl ?? null,
          bookUrl: item.bookUrl ?? null,
          versoes,
          decisoes: decisoesSaida,
        });
      }

      // ── books por evento: os gravados, mais o atual quando não registrado ──
      const booksPorEvento = new Map<string, { bookUrl: string; em: string; por: string | null; itemCount: number; inferido: boolean }[]>();
      for (const b of booksGravados) {
        const l = booksPorEvento.get(b.eventId) ?? [];
        l.push({ bookUrl: b.bookUrl, em: new Date(b.createdAt).toISOString(), por: b.createdBy ?? null, itemCount: b.itemCount, inferido: false });
        booksPorEvento.set(b.eventId, l);
      }
      const atualPorEvento = new Map<string, { bookUrl: string; n: number }>();
      for (const item of itens) {
        if (!item.bookUrl || (item as any).deletedAt) continue;
        const cur = atualPorEvento.get(item.eventId);
        if (cur && cur.bookUrl === item.bookUrl) cur.n += 1;
        else if (!cur) atualPorEvento.set(item.eventId, { bookUrl: item.bookUrl, n: 1 });
      }
      for (const [eventId, cur] of Array.from(atualPorEvento.entries())) {
        const l = booksPorEvento.get(eventId) ?? [];
        if (!l.some((b) => b.bookUrl === cur.bookUrl)) {
          l.unshift({ bookUrl: cur.bookUrl, em: "", por: null, itemCount: cur.n, inferido: true });
          booksPorEvento.set(eventId, l);
        }
      }
      const books = Array.from(booksPorEvento.entries()).map(([eventId, lista]) => ({
        eventId,
        eventName: eventoPorId.get(eventId)?.name ?? "Evento desconhecido",
        truckDepartureDate: eventoPorId.get(eventId)?.truckDepartureDate ?? null,
        books: lista.sort((a, b) => b.em.localeCompare(a.em)),
      }));

      res.json({ itens: saida, books });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
