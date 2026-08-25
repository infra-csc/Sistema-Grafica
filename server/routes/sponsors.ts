// Sponsor, quota-rule, event-sponsor, and item-sponsor routes. Extracted from server/routes.ts.
import fs from "fs";
import path from "path";
import type { Express } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { insertSponsorSchema, insertEventSponsorSchema, insertItemSponsorSchema } from "@shared/schema";
import {
  requireAuth,
  requireAdmin,
  requireRole,
  broadcast,
  translateStatus,
  createAuditLog,
  updateEventStatus,
} from "./shared";
// A guarda de evento finalizado mora em ./items porque é lá que o predicado
// compartilhado (@shared/prazo-dates) já estava embrulhado nas frases de erro
// desta casa — duas cópias da mesma guarda divergiriam no primeiro ajuste. Só
// vale a dependência de módulo de rota para módulo de rota nesse sentido:
// items.ts não importa nada daqui.
import { barraEventoFinalizado, motivoEventoDaPeca, contadorDeBloqueio } from "./items";
import { invalidarCacheDeVersoes } from "./versoes";

// Papéis que escrevem em vinculação de patrocinadores — o mesmo conjunto que a
// rota /vincular-patrocinadores permite no client (App.tsx). Antes essas rotas
// só tinham requireAuth: qualquer sessão (grafica inclusive) podia reescrever
// vínculos ou devolver peças para a Criação por API.
const requireLinkingWrite = requireRole("arte", "solicitacao", "atendimento", "admin");

/**
 * A REGRA DO DESVINCULAR (pedido do dono, 25/08), num lugar só — vale para o
 * desvinculo peça a peça E para a cascata de quando o patrocinador sai do
 * EVENTO: aprovação APROVADA fica (é registro; para desfazê-la existe o
 * Revogar); PENDENTE é descartada e deixa de contar; e se ele era o ÚNICO que
 * faltava, a rodada fecha e a peça SEGUE — o mesmo avanço que a última
 * aprovação faria, com carimbo, trilha, aviso à Arte e broadcast.
 *
 * Pressupõe que o VÍNCULO peça↔patrocinador já foi removido pelo chamador.
 */
async function descartarPendenciaEFecharRodada(
  req: any,
  item: any,
  sponsorId: string,
  sponsorName: string | undefined,
): Promise<{ linhaAprovada: boolean; descartouPendente: boolean; itemAtualizado: any | null }> {
  const linha = await storage.getItemSponsorApproval(item.id, sponsorId);
  const linhaAprovada = linha?.status === "approved";
  let descartouPendente = false;
  if (linha && !linhaAprovada) {
    await storage.deleteItemSponsorApproval(item.id, sponsorId);
    descartouPendente = true;
    invalidarCacheDeVersoes();
  }

  let itemAtualizado: any = null;
  if (descartouPendente && (item.status === "awaiting_sponsor_approval" || item.status === "awaiting_approval")) {
    const restantes = await storage.getItemSponsorApprovals(item.id);
    // vazio = fechou: não resta ninguém a esperar
    const fechou = restantes.every((l: any) => l.status === "approved");
    if (fechou) {
      itemAtualizado = await storage.updateItem(item.id, {
        status: "sponsor_approved",
        sponsorApprovedBy: (req as any).userName ?? null,
        sponsorApprovedAt: new Date(),
        rejectedBySponsor: false,
      });
      await createAuditLog(
        req,
        'approved',
        'item',
        item.id,
        `Com a saída de "${sponsorName}", ${restantes.length === 0 ? "não resta aprovação a esperar" : "todos os patrocinadores restantes já aprovaram"}. Status alterado: ${translateStatus(item.status)} → ${translateStatus("sponsor_approved")}`
      );
      const event = await storage.getEvent(item.eventId);
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Aprovação concluída (o patrocinador pendente foi desvinculado). Finalize o layout e adicione o arquivo final: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      broadcast({ type: "item_updated", item: itemAtualizado });
      broadcast({ type: "notification_created", notification });
    }
  }

  return { linhaAprovada, descartouPendente, itemAtualizado };
}

export function registerSponsorRoutes(app: Express): void {
  // ============ SPONSORS ============
  
  // Get all sponsors
  app.get("/api/sponsors", requireAuth, async (req, res) => {
    try {
      const sponsors = await storage.getAllSponsors();
      res.json(sponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get single sponsor
  // Uso de cada patrocinador (nº de eventos e de peças) — precisa vir ANTES de
  // /api/sponsors/:id, senão o Express trata "usage" como um id.
  app.get("/api/sponsors/usage", requireAuth, async (req, res) => {
    try {
      res.json(await storage.getSponsorUsage());
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sponsors/:id", requireAuth, async (req, res) => {
    try {
      const sponsor = await storage.getSponsor(req.params.id);
      if (!sponsor) {
        return res.status(404).json({ error: "Patrocinador não encontrado" });
      }
      res.json(sponsor);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create sponsor
  app.post("/api/sponsors", requireAuth, async (req, res) => {
    // Mesmos papéis da irmã PATCH e da página /patrocinadores.
    if (!["admin", "atendimento", "solicitacao"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para criar patrocinadores" });
    }
    try {
      const validatedData = insertSponsorSchema.parse(req.body);
      const sponsor = await storage.createSponsor(validatedData);
      
      await createAuditLog(
        req,
        'created',
        'sponsor',
        sponsor.id,
        `Patrocinador "${sponsor.name}" criado`
      );
      
      broadcast({ type: "sponsor_created", sponsor });
      res.status(201).json(sponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update sponsor — Atendimento e Solicitação também mantêm o cadastro
  // (mesmos perfis que já enxergam a tela de Patrocinadores).
  app.patch("/api/sponsors/:id", requireAuth, async (req, res) => {
    try {
      const role = (req as any).userRole;
      if (!["admin", "atendimento", "solicitacao"].includes(role)) {
        return res.status(403).json({ error: "Sem permissão para editar patrocinadores" });
      }
      const validatedData = insertSponsorSchema.partial().parse(req.body);
      const sponsor = await storage.updateSponsor(req.params.id, validatedData);
      if (!sponsor) {
        return res.status(404).json({ error: "Patrocinador não encontrado" });
      }
      
      await createAuditLog(
        req,
        'updated',
        'sponsor',
        sponsor.id,
        `Patrocinador "${sponsor.name}" atualizado`
      );
      
      broadcast({ type: "sponsor_updated", sponsor });
      res.json(sponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete sponsor
  app.delete("/api/sponsors/:id", requireAdmin, async (req, res) => {
    try {
      const sponsor = await storage.getSponsor(req.params.id);
      if (!sponsor) {
        return res.status(404).json({ error: "Patrocinador não encontrado" });
      }

      await storage.deleteSponsor(req.params.id);
      
      await createAuditLog(
        req,
        'deleted',
        'sponsor',
        sponsor.id,
        `Patrocinador "${sponsor.name}" excluído`
      );
      
      broadcast({ type: "sponsor_deleted", sponsorId: req.params.id });
      res.json({ message: "Patrocinador excluído com sucesso" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ QUOTA RULES ============

  app.get("/api/events/:id/quota-rules", requireAuth, async (req, res) => {
    try {
      const rules = await storage.getEventQuotaRules(req.params.id);
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/events/:id/quota-rules", requireAuth, async (req, res) => {
    if (!["admin", "atendimento"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para editar cotas" });
    }
    try {
      // Body: { quota: string, itemTypes: string[] }
      const { quota, itemTypes } = req.body as { quota: string; itemTypes: string[] };
      if (!quota) return res.status(400).json({ error: "quota é obrigatório" });
      const rule = await storage.upsertEventQuotaRule(req.params.id, quota, itemTypes ?? []);
      // A cota decide quais peças cada patrocinador recebe na vinculação
      // automática. Mudá-la remaneja arte de cliente e não deixava rastro.
      await createAuditLog(
        req,
        'updated',
        'event',
        req.params.id,
        `Cota "${quota}" definida com ${(itemTypes ?? []).length} tipo(s) de peça`
      );
      res.json(rule);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/events/:id/quota-rules/:quota", requireAuth, async (req, res) => {
    if (!["admin", "atendimento"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão para editar cotas" });
    }
    try {
      await storage.deleteEventQuotaRule(req.params.id, req.params.quota);
      await createAuditLog(
        req,
        'updated',
        'event',
        req.params.id,
        `Cota "${req.params.quota}" removida do evento`
      );
      res.json({ ok: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Global quota rules (JSON-file backed, no schema change needed) ──
  const GLOBAL_QUOTA_FILE = path.join(process.cwd(), "global-quota-rules.json");

  function readGlobalQuotaRules(): { quota: string; itemTypes: string[] }[] {
    try {
      if (fs.existsSync(GLOBAL_QUOTA_FILE)) {
        return JSON.parse(fs.readFileSync(GLOBAL_QUOTA_FILE, "utf8"));
      }
    } catch { /* ignore */ }
    return [];
  }

  function writeGlobalQuotaRules(rules: { quota: string; itemTypes: string[] }[]): void {
    fs.writeFileSync(GLOBAL_QUOTA_FILE, JSON.stringify(rules, null, 2), "utf8");
  }

  app.get("/api/quota-rules/global", requireAuth, (_req, res) => {
    res.json(readGlobalQuotaRules());
  });

  app.put("/api/quota-rules/global", requireAuth, async (req, res) => {
    if (req.userRole !== "admin" && req.userRole !== "atendimento") {
      return res.status(403).json({ error: "Acesso negado" });
    }
    try {
      const { quota, itemTypes } = req.body as { quota: string; itemTypes: string[] };
      if (!quota) return res.status(400).json({ error: "quota é obrigatório" });
      const rules = readGlobalQuotaRules().filter(r => r.quota !== quota);
      rules.push({ quota, itemTypes: itemTypes ?? [] });
      writeGlobalQuotaRules(rules);
      // Regra GLOBAL: vale para todos os eventos futuros e mora num arquivo
      // fora do banco. Sem esta linha, a única escrita do sistema que muda o
      // comportamento de todos os eventos de uma vez não tinha dono.
      await createAuditLog(
        req,
        'updated',
        'quota_rules',
        'global',
        `Cota global "${quota}" definida com ${(itemTypes ?? []).length} tipo(s) de peça`
      );
      res.json({ quota, itemTypes: itemTypes ?? [] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Returns distinct parent group types from standard_items (canonical group names)
  app.get("/api/quota-rules/groups", requireAuth, async (_req, res) => {
    try {
      // Always merge distinct types from standard_items AND items tables
      const result = await pool.query(
        `SELECT DISTINCT type FROM (
           SELECT type FROM standard_items WHERE type IS NOT NULL AND type <> ''
           UNION
           SELECT type FROM items WHERE type IS NOT NULL AND type <> ''
         ) combined
         ORDER BY type`
      );
      const groups = result.rows.map((r: any) => r.type as string);
      res.json(groups);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/events/:id/auto-link-preview", requireAuth, async (req, res) => {
    try {
      const preview = await storage.previewAutoLink(req.params.id);
      res.json(preview);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/events/:id/auto-link-sponsors", requireLinkingWrite, async (req, res) => {
    try {
      // ANDA: a vinculação automática cria vínculos peça↔patrocinador em massa,
      // que é a etapa que faz a peça seguir para a Arte. Recebe o eventId
      // direto — a guarda só precisa saber a que evento a escrita pertence.
      if (await barraEventoFinalizado({ eventId: req.params.id }, res)) return;
      const linked = await storage.autoLinkByQuota(req.params.id);
      // Era a única escrita da tela de vinculação invisível no histórico e
      // sem broadcast — outros clientes ficavam com /api/items stale.
      const event = await storage.getEvent(req.params.id);
      await createAuditLog(
        req,
        'updated',
        'event',
        req.params.id,
        `Vinculação automática por cota no evento "${event?.name ?? req.params.id}" — ${linked} ${linked === 1 ? 'vínculo criado' : 'vínculos criados'}`
      );
      broadcast({ type: "item_updated", eventId: req.params.id });
      res.json({ linked });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ EVENT SPONSORS ============
  
  // Get sponsors for an event
  app.get("/api/events/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const eventSponsors = await storage.getEventSponsors(req.params.id);
      res.json(eventSponsors);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update sponsor quota on event.
  // Era o ÚNICO write de vínculo de patrocinador sem rastro: sem audit log
  // (ninguém respondia "quem mudou a cota do X nesse evento e quando"), sem
  // broadcast — e, por consequência, sem flush do cache de processo de 30s de
  // /api/events, então a cota antiga sobrevivia para os outros usuários MESMO
  // com F5. O POST e o DELETE irmãos já faziam as três coisas.
  app.patch("/api/events/:eventId/sponsors/:sponsorId", requireLinkingWrite, async (req, res) => {
    try {
      const { eventId, sponsorId } = req.params;
      const quota = req.body.quota || null;
      await storage.updateEventSponsorQuota(eventId, sponsorId, quota);

      const [event, sponsor] = await Promise.all([
        storage.getEvent(eventId),
        storage.getSponsor(sponsorId),
      ]);

      await createAuditLog(
        req,
        'updated',
        'event_sponsor',
        `${eventId}_${sponsorId}`,
        quota
          ? `Cota do patrocinador "${sponsor?.name ?? sponsorId}" no evento "${event?.name ?? eventId}" definida como "${quota}"`
          : `Cota do patrocinador "${sponsor?.name ?? sponsorId}" no evento "${event?.name ?? eventId}" removida`
      );

      broadcast({ type: "event_sponsor_updated", eventId, sponsorId, quota });
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Add sponsor to event
  app.post("/api/events/:id/sponsors", requireLinkingWrite, async (req, res) => {
    try {
      const validatedData = insertEventSponsorSchema.parse({
        eventId: req.params.id,
        sponsorId: req.body.sponsorId,
        quota: req.body.quota || null,
      });

      const eventSponsor = await storage.addSponsorToEvent(validatedData);
      
      const event = await storage.getEvent(req.params.id);
      const sponsor = await storage.getSponsor(validatedData.sponsorId);
      
      await createAuditLog(
        req,
        'added',
        'event_sponsor',
        eventSponsor.id,
        `Patrocinador "${sponsor?.name}" vinculado ao evento "${event?.name}"`
      );
      
      // eventId/sponsorId no topo: os três broadcasts de vínculo passam a ter
      // a MESMA forma, e o handler do cliente invalida ['/api/events', eventId]
      // sem precisar cavar dentro do objeto.
      broadcast({
        type: "event_sponsor_added",
        eventId: req.params.id,
        sponsorId: validatedData.sponsorId,
        eventSponsor,
      });
      res.status(201).json(eventSponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Remove sponsor from event — e CASCATEIA para as peças (caso QCY, 25/08):
  // tirar do evento tirava só o vínculo de EVENTO, e as peças continuavam
  // carregando a marca com aprovação pendente — o Atendimento seguia cobrando
  // um patrocinador que já não estava no evento. Peça não pode carregar marca
  // que o evento não conhece (o mesmo invariante do Adicionar, que vincula o
  // evento primeiro). Cada peça segue a regra do desvincular: aprovada fica,
  // pendente descarta, e se só faltava ele a peça segue.
  app.delete("/api/events/:eventId/sponsors/:sponsorId", requireLinkingWrite, async (req, res) => {
    try {
      const { eventId, sponsorId } = req.params;

      // A cascata mexe em PEÇA (descarta pendência, pode avançar status) —
      // então a rota ganhou a guarda de evento finalizado que antes não
      // precisava ter, quando só tocava o vínculo de evento.
      const event = await storage.getEvent(eventId);
      if (!event) return res.status(404).json({ error: "Evento não encontrado" });
      if (await barraEventoFinalizado({ eventId }, res)) return;

      const success = await storage.removeSponsorFromEvent(eventId, sponsorId);

      if (!success) {
        return res.status(404).json({ error: "Vinculação não encontrada" });
      }

      const sponsor = await storage.getSponsor(sponsorId);

      const doEvento = await storage.getItemsByEvent(eventId);
      // Em PARALELO (25/08): a primeira versão era um for..await peça a peça —
      // 24 peças × várias idas ao banco seguraram o "Salvando…" do modal por
      // segundos. As peças são independentes entre si.
      const resultados = await Promise.all(
        doEvento
          .filter((item) => !(item as any).deletedAt)
          .map(async (item) => {
            const tirou = await storage.removeSponsorFromItem(item.id, sponsorId);
            if (!tirou) return null;
            const r = await descartarPendenciaEFecharRodada(req, item, sponsorId, sponsor?.name);
            // Na trilha DA PEÇA (entityType 'item'): é lá que alguém vai
            // perguntar "cadê o Fulano que estava aqui?".
            await createAuditLog(
              req,
              'removed',
              'item',
              item.id,
              `Patrocinador "${sponsor?.name}" desvinculado da peça ${item.displayId || item.type || ''} junto com a remoção do evento`
                + (r.linhaAprovada ? " — a aprovação que ele já deu permanece no histórico"
                  : r.descartouPendente ? " — a aprovação pendente dele foi descartada e deixa de contar" : "")
            );
            broadcast({ type: "item_sponsor_removed", itemId: item.id, sponsorId });
            return r;
          })
      );
      const efetivos = resultados.filter((r): r is NonNullable<typeof r> => r !== null);
      const pecasDesvinculadas = efetivos.length;
      const rodadasFechadas = efetivos.filter((r) => r.itemAtualizado).length;

      await createAuditLog(
        req,
        'removed',
        'event_sponsor',
        `${eventId}_${sponsorId}`,
        `Patrocinador "${sponsor?.name}" removido do evento "${event?.name}"`
          + (pecasDesvinculadas > 0
            ? ` — desvinculado também de ${pecasDesvinculadas} peça${pecasDesvinculadas !== 1 ? "s" : ""}${rodadasFechadas > 0 ? `; ${rodadasFechadas} rodada${rodadasFechadas !== 1 ? "s" : ""} de aprovação fechou e a peça seguiu` : ""}`
            : "")
      );

      broadcast({ type: "event_sponsor_removed", eventId, sponsorId });
      res.json({
        message: "Patrocinador removido do evento com sucesso",
        pecasDesvinculadas,
        rodadasFechadas,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ ITEM SPONSORS ============

  // Get sponsors for specific item (with full sponsor data including name)
  app.get("/api/items/:id/sponsors", requireAuth, async (req, res) => {
    try {
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      
      // Fetch full sponsor data for each item sponsor relationship
      const sponsorsWithDetails = await Promise.all(
        itemSponsors.map(async (is) => {
          const sponsor = await storage.getSponsor(is.sponsorId);
          return sponsor ? {
            id: sponsor.id,
            name: sponsor.name,
            color: sponsor.color || '#3b82f6',
            itemSponsorId: is.id,
            createdAt: is.createdAt
          } : null;
        })
      );
      
      res.json(sponsorsWithDetails.filter(Boolean));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk sync item sponsors (replaces all sponsors for an item)
  app.post("/api/items/:id/sponsors/sync", requireLinkingWrite, async (req, res) => {
    try {
      const itemId = req.params.id;
      const { sponsorIds, skipApproval } = req.body;

      if (!Array.isArray(sponsorIds)) {
        return res.status(400).json({ error: "sponsorIds deve ser um array" });
      }

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      // ANDA: reescrever os patrocinadores (e o "sem aprovação") é a etapa de
      // vinculação do fluxo — o que decide quem terá de aprovar a peça.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Vínculo só faz sentido enquanto a peça está na fase de vinculação —
      // sem isto dava para reescrever patrocinadores de peça já em produção
      // ou entregue (a tela esconde, mas era gate só de UI).
      const linkableStatuses = ['requested', 'awaiting_linking'];
      if (!linkableStatuses.includes(currentItem.status)) {
        return res.status(409).json({ error: `Peça não está em fase de vinculação (status atual: ${translateStatus(currentItem.status)})` });
      }

      // Filtrar IDs nulos ou vazios antes de inserir no banco
      const validSponsorIds = sponsorIds.filter((id: any) => id && typeof id === 'string' && id.trim() !== '');
      await storage.bulkSyncItemSponsors(itemId, validSponsorIds);

      // Update item with skipApproval only (status NOT changed here - user must click "Enviar para Arte").
      // skipApproval só muda se veio no body — antes `skipApproval || false`
      // zerava a flag "sem aprovação" em qualquer sync que não a mencionasse.
      let item = currentItem;
      if ('skipApproval' in req.body) {
        item = (await storage.updateItem(itemId, { skipApproval: !!skipApproval })) ?? currentItem;
      }
      
      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Patrocinadores atualizados - ${sponsorIds.length} ${sponsorIds.length === 1 ? 'patrocinador vinculado' : 'patrocinadores vinculados'}${skipApproval ? ' (sem aprovação)' : ''}`
      );
      
      broadcast({ type: "item_updated", item });
      
      // Return updated item with sponsors
      const itemSponsorsData = await storage.getItemSponsors(itemId);
      res.json({ 
        message: "Patrocinadores atualizados com sucesso",
        item,
        sponsors: itemSponsorsData
      });
    } catch (error: any) {
      console.error("[sponsors/sync] error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Return item to creation (Solicitação) team
  app.post("/api/items/:id/return-to-creation", requireLinkingWrite, async (req, res) => {
    try {
      const { id } = req.params;
      const item = await storage.getItem(id);
      if (!item) return res.status(404).json({ error: "Item não encontrado" });
      // ANDA (caso duvidoso, barrado): "devolver para a Criação" soa como
      // desfazer, mas o efeito é jogar a peça de volta na mesa da Solicitação
      // com os vínculos APAGADOS — trabalho novo, e perda de informação, numa
      // fila que já não mostra esta peça.
      if (await barraEventoFinalizado(item, res)) return;

      const allowedStatuses = ['draft', 'requested', 'awaiting_linking', 'awaiting_submission'];
      if (!allowedStatuses.includes(item.status)) {
        return res.status(409).json({ error: `Item não pode ser devolvido. Status atual: ${item.status}` });
      }

      const prevStatus = item.status;
      await storage.updateItem(id, { status: 'draft', skipApproval: false });
      await storage.bulkSyncItemSponsors(id, []);

      await createAuditLog(
        req,
        'updated',
        'item',
        id,
        `Item devolvido para Criação (status anterior: ${translateStatus(prevStatus)})`
      );

      const updated = await storage.getItem(id);

      // A peça volta para a Solicitação — é ela quem AGE agora.
      const notification = await storage.createNotification({
        type: 'itemReturnedToCreation',
        message: `Peça "${item.displayId}" devolvida para a Criação (vínculos removidos)`,
        targetRoles: ['solicitacao'],
      });
      broadcast({ type: "notification_created", notification });
      broadcast({ type: "item_updated", item: updated });

      res.json({ message: "Item devolvido para Criação com sucesso", item: updated });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Send items to Arte (bulk) - changes status from 'awaiting_linking' to 'awaiting_submission'
  app.post("/api/items/send-to-arte", requireLinkingWrite, async (req, res) => {
    try {
      const { itemIds } = req.body;
      
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "itemIds deve ser um array com pelo menos um item" });
      }
      
      const results: any[] = [];
      const errors: string[] = [];
      // ANDA: "enviar para a Arte" é literalmente empurrar trabalho para a fila
      // de outra equipe. Em lote, o item barrado entra na lista de erros (para
      // não punir as peças boas do mesmo envio) e o 409 só sai quando o lote
      // inteiro caiu por esta regra.
      const bloqueio = contadorDeBloqueio();

      for (const itemId of itemIds) {
        try {
          const item = await storage.getItem(itemId);
          if (!item) {
            errors.push(`Item ${itemId} não encontrado`);
            continue;
          }

          const motivoEvento = await motivoEventoDaPeca(item);
          if (motivoEvento) {
            errors.push(`Item ${item.displayId}: ${bloqueio.registra(motivoEvento)}`);
            continue;
          }

          // Só peça em vinculação ('awaiting_linking') vai para a Arte. A
          // mensagem distingue os dois lados, porque pedem ações opostas:
          // "já foi enviada" (por outro envio ou outra pessoa — é o caso
          // do clique repetido) não tem o que fazer; "ainda não chegou"
          // pede voltar à Solicitação. "Status incorreto" não dizia nenhum.
          if (item.status !== 'awaiting_linking') {
            const aindaNaoChegou = ['draft', 'requested'].includes(item.status);
            errors.push(aindaNaoChegou
              ? `Item ${item.displayId} ainda não chegou à vinculação (está em "${translateStatus(item.status)}")`
              : `Item ${item.displayId} já foi enviado (está em "${translateStatus(item.status)}")`);
            continue;
          }
          
          // Check if item has sponsors, skipApproval, or isReuse
          const itemSponsors = await storage.getItemSponsors(itemId);
          if (itemSponsors.length === 0 && !item.skipApproval && !item.isReuse) {
            errors.push(`Item ${item.displayId} precisa ter patrocinadores vinculados ou "Sem aprovação" marcado`);
            continue;
          }
          
          // Update status to awaiting_submission
          const updatedItem = await storage.updateItem(itemId, { status: 'awaiting_submission' });
          results.push(updatedItem);
        } catch (error: any) {
          errors.push(`Erro ao processar item ${itemId}: ${error.message}`);
        }
      }

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      if (results.length > 0) {
        await createAuditLog(
          req,
          'updated',
          'item',
          results.map(i => i.id).join(','),
          `${results.length} ${results.length === 1 ? 'item enviado' : 'itens enviados'} para Arte`
        );
        
        // Notify Arte profile
        const notification = await storage.createNotification({
          type: 'itemsSentToArte',
          message: `${results.length} ${results.length === 1 ? 'item' : 'itens'} aguardando criação de thumb de aprovação`,
          targetRoles: ['arte'], // só quem AGE: a Arte cria o thumb; admin não tem ação aqui
        });
        broadcast({ type: "notification_created", notification });

        results.forEach(item => {
          broadcast({ type: "item_updated", item });
        });
      }
      
      res.json({ 
        success: true,
        sent: results.length,
        errors: errors.length > 0 ? errors : undefined,
        items: results
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add single sponsor to item
  app.post("/api/items/:id/sponsors", requireLinkingWrite, async (req, res) => {
    try {
      const validatedData = insertItemSponsorSchema.parse({
        itemId: req.params.id,
        sponsorId: req.body.sponsorId,
      });

      // ANDA: vincular um patrocinador cria uma aprovação a cobrar. A leitura
      // do item subiu para ANTES da escrita — sem ela a guarda chegaria tarde,
      // com o vínculo já gravado.
      const item = await storage.getItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Item não encontrado" });
      if (await barraEventoFinalizado(item, res)) return;

      const itemSponsor = await storage.addSponsorToItem(validatedData);

      // PEÇA JÁ EM APROVAÇÃO (caso #2801, 25/08): a arte carrega a marca mas
      // o patrocinador não estava vinculado — o admin o adiciona do próprio
      // modal de decisão. A linha pendente nasce JUNTO com o vínculo: sem
      // ela, o reenvio da Arte (que deriva o conjunto das LINHAS) não
      // incluiria o recém-chegado, e a peça poderia fechar a rodada sem ele.
      if (item.status === "awaiting_sponsor_approval" || item.status === "awaiting_approval") {
        const linha = await storage.getItemSponsorApproval(req.params.id, validatedData.sponsorId);
        if (!linha) {
          await storage.createItemSponsorApproval({
            itemId: req.params.id,
            sponsorId: validatedData.sponsorId,
            status: "pending",
          });
        }
      }

      const sponsor = await storage.getSponsor(validatedData.sponsorId);

      await createAuditLog(
        req,
        'added',
        'item_sponsor',
        itemSponsor.id,
        `Patrocinador "${sponsor?.name}" vinculado ao item ${item?.type || 'N/A'}`
      );
      
      broadcast({ type: "item_sponsor_added", itemSponsor });
      res.status(201).json(itemSponsor);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Remove sponsor from item
  app.delete("/api/items/:itemId/sponsors/:sponsorId", requireLinkingWrite, async (req, res) => {
    try {
      const { itemId, sponsorId } = req.params;

      // ANDA (caso duvidoso, barrado): remover um patrocinador parece limpeza,
      // mas é o mesmo gesto de vincular ao contrário — muda quem aprova a peça
      // e some com o registro de quem estava na arte de um evento já fechado.
      // Leitura ANTES da remoção, senão a guarda chegaria depois do estrago.
      const item = await storage.getItem(itemId);
      if (!item) return res.status(404).json({ error: "Item não encontrado" });
      if (await barraEventoFinalizado(item, res)) return;

      const success = await storage.removeSponsorFromItem(itemId, sponsorId);

      if (!success) {
        return res.status(404).json({ error: "Vinculação não encontrada" });
      }

      const sponsor = await storage.getSponsor(sponsorId);

      // A regra do dono (25/08) mora em descartarPendenciaEFecharRodada, a
      // mesma da cascata de evento: aprovada fica, pendente descarta, e se só
      // faltava ele a peça segue.
      const { linhaAprovada, descartouPendente, itemAtualizado } =
        await descartarPendenciaEFecharRodada(req, item, sponsorId, sponsor?.name);

      // entityType 'item' de propósito (25/08): a trilha da peça (e o
      // Histórico) consulta por item — gravar como 'item_sponsor' escondia a
      // desvinculação exatamente de quem vai perguntar "cadê o Fulano?".
      await createAuditLog(
        req,
        'removed',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name}" desvinculado da peça ${item?.displayId || item?.type || 'N/A'}`
          + (linhaAprovada ? " — a aprovação que ele já deu permanece no histórico"
            : descartouPendente ? " — a aprovação pendente dele foi descartada e deixa de contar" : "")
      );

      broadcast({ type: "item_sponsor_removed", itemId, sponsorId });
      res.json({
        message: "Patrocinador desvinculado do item com sucesso",
        aprovacaoPendenteDescartada: descartouPendente,
        rodadaFechou: !!itemAtualizado,
        item: itemAtualizado ?? undefined,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

}
