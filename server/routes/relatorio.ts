// ─────────────────────────────────────────────────────────────────────────────
// RELATÓRIO DO EVENTO — sugestão 9 da análise de evolução, aprovada 24/08.
//
// O "status report" que hoje é montado à mão com prints de quatro telas
// (Detalhe, Prazos, Atendimento, Registros), servido pronto numa resposta só:
// funil por etapa, atrasos, com quem está cada aprovação pendente, fotos de
// conferência/entrega e os totais de entrega.
//
// DECISÕES:
//  · O funil e os atrasos saem de `buildEventPrazo` — a MESMA fonte da Gestão
//    de Prazos. Um relatório que calculasse funil próprio poderia desmentir a
//    tela ao lado, e desencontro entre telas é o defeito mais caro da casa.
//  · Evento fora da gestão de prazos (tudo entregue, ou finalizado) devolve
//    `prazo: null` e o relatório diz isso com todas as letras — em vez de
//    fingir um funil vivo para um evento que é história.
//  · Leitura para qualquer logado, como o Detalhe do Evento que o alimenta.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { storage } from "../storage";
import {
  buildEventPrazo,
  todayBusinessMs,
  SPONSOR_TURN,
  OUT_OF_FUNNEL,
  DELIVERED,
} from "../services/prazo-domain";
import { requireAuth } from "./shared";

/** Quantas fotos recentes viajam — o relatório é resumo, não galeria. */
export const RELATORIO_MAX_FOTOS = 8;

export function registerRelatorioRoutes(app: Express): void {
  app.get("/api/events/:id/relatorio", requireAuth, async (req, res) => {
    try {
      const event = await storage.getEvent(req.params.id);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });

      const [itens, allSponsors, openApprovals, allUsers, todasFotos] = await Promise.all([
        storage.getItemsByEvents([event.id]),
        storage.getAllSponsors(),
        storage.getOpenItemSponsorApprovals(),
        storage.getAllUsers(),
        storage.getAllDeliveryPhotos(),
      ]);

      const sponsorNameById = new Map(allSponsors.map((s) => [s.id, s.name]));
      const userNameById = new Map(allUsers.map((u) => [u.id, u.name]));
      const idsDoEvento = new Set(itens.map((i) => i.id));

      const openApprovalsByItem = new Map<string, typeof openApprovals>();
      for (const ap of openApprovals) {
        if (!idsDoEvento.has(ap.itemId)) continue;
        const arr = openApprovalsByItem.get(ap.itemId);
        if (arr) arr.push(ap); else openApprovalsByItem.set(ap.itemId, [ap]);
      }

      // A mesma montagem da Gestão de Prazos — null quando o evento saiu dela.
      const prazo = buildEventPrazo(event as any, itens as any[], {
        today: todayBusinessMs(),
        sponsorNameById,
        openApprovalsByItem: openApprovalsByItem as any,
        userNameById,
      });

      // ── Com quem está cada aprovação pendente ──────────────────────────
      // Dois lados da mesma espera: a bola com o PATROCINADOR (pending /
      // new_version_pending) e a bola com a ARTE (reprovada, refazendo).
      const porPatrocinador = new Map<string, { nome: string; comPatrocinador: number; comArte: number }>();
      for (const ap of openApprovals) {
        if (!idsDoEvento.has(ap.itemId)) continue;
        const nome = sponsorNameById.get(ap.sponsorId) ?? "Patrocinador removido";
        const linha = porPatrocinador.get(ap.sponsorId) ?? { nome, comPatrocinador: 0, comArte: 0 };
        if (SPONSOR_TURN.has(ap.status)) linha.comPatrocinador += 1; else linha.comArte += 1;
        porPatrocinador.set(ap.sponsorId, linha);
      }
      const aprovacoes = Array.from(porPatrocinador.values())
        .sort((a, b) => (b.comPatrocinador + b.comArte) - (a.comPatrocinador + a.comArte));

      // ── Fotos do evento ────────────────────────────────────────────────
      const fotosDoEvento = todasFotos.filter((f: any) => f.eventId === event.id && (f.photoUrl || f.url));
      const conferencia = fotosDoEvento.filter((f: any) => String(f.kind).startsWith("confer")).length;
      const ultimas = fotosDoEvento
        .sort((a: any, b: any) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
        .slice(0, RELATORIO_MAX_FOTOS)
        .map((f: any) => ({ url: f.photoUrl ?? f.url, kind: f.kind, displayId: f.displayId ?? null }));

      // ── Totais que valem mesmo com `prazo: null` ───────────────────────
      const vivas = itens.filter((i: any) => !OUT_OF_FUNNEL.has(i.status));
      const entregues = vivas.filter((i: any) => DELIVERED.has(i.status)).length;

      res.json({
        gerado: { em: new Date().toISOString(), por: req.userName ?? "Sistema" },
        evento: {
          id: event.id, name: event.name,
          truckDepartureDate: event.truckDepartureDate, startDate: event.startDate,
          priority: (event as any).priority ?? null, status: event.status,
        },
        totais: {
          pecas: vivas.length,
          entregues,
          canceladas: itens.length - vivas.length,
        },
        prazo,
        aprovacoes,
        fotos: { total: fotosDoEvento.length, conferencia, entrega: fotosDoEvento.length - conferencia, ultimas },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
