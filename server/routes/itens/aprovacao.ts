// Envio para aprovação, aprovação do patrocinador, dispensa e as aprovações por patrocinador.
import type { Express } from "express";
import { storage } from "../../storage";
import { POS_APROVACAO, DISPENSAVEIS, DESTINO_DA_DISPENSA } from "@shared/fluxo-peca";
import { ehMolde } from "@shared/molde";
import { enviarMoldeParaRevisao } from "../molde";
import { requireAuth, broadcast, translateStatus, sendSensitiveError, createAuditLog } from "../shared";
// A tela de Versões guarda o quadro calculado por 30 s. Toda escrita que mude
// versão, decisão ou book derruba esse cache na hora — senão o Atendimento
// revoga uma aprovação e continua vendo o quadro velho numa tela cujo trabalho
// é justamente conferir o que está valendo agora.
import { invalidarCacheDeVersoes } from "../versoes";
// Régua do thumb (só objeto do nosso storage): ./thumb-url.ts.
import { urlDeThumbValida, ERRO_THUMB_FORA_DO_STORAGE } from "../thumb-url";
import { barraEventoFinalizado } from "../eventoFinalizado";
import { MOTIVO_MIN, lerMotivoDevolucao, lerDestinoDevolucao, revogarAprovacoesEstritas } from "./comum";
import { responderFalha } from "../../erros";

/** envio para aprovação, aprovação, dispensa e aprovações por patrocinador. */
export function registrarAprovacao(app: Express): void {
  // Submit item for sponsor approval (Arte module)
  app.patch("/api/items/:id/submit-for-approval", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar para aprovação" });
      }
      
      const { approvalThumbUrl } = req.body;
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      
      // ANDA: empurra a peça para a fila do Atendimento (ou da Revisão).
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Only items that passed through vincular-patrocinadores (awaiting_submission) can be worked on
      if (currentItem.status !== "awaiting_submission") {
        return res.status(409).json({ 
          error: `A peça não pode ser enviada para aprovação na etapa atual (${translateStatus(currentItem.status)}). Ela precisa passar pela Vinculação de patrocinadores antes.`
        });
      }

      if (!approvalThumbUrl) {
        return res.status(400).json({ error: "Envie o thumb da arte antes de mandar para aprovação." });
      }
      // Só objeto do nosso storage (ver urlDeThumbValida). Depois da guarda de
      // evento finalizado: o 409 daquela decisão vem antes do formato do campo.
      const thumbNormalizado = urlDeThumbValida(approvalThumbUrl);
      if (!thumbNormalizado) {
        return res.status(400).json({ error: ERRO_THUMB_FORA_DO_STORAGE });
      }

      // MOLDE (22/09): sem aprovação de patrocinador e sem finalização — o
      // thumb vai direto para a Revisão Final (server/routes/molde.ts).
      if (ehMolde(currentItem)) return await enviarMoldeParaRevisao(req, res, currentItem, thumbNormalizado);

      // Check if item has sponsors linked
      const itemSponsors = await storage.getItemSponsors(req.params.id);
      const hasSponsors = itemSponsors.length > 0;
      
      // Determine next status:
      // 1. If skipApproval is true → awaiting_creator_review
      // 2. If has sponsors → awaiting_sponsor_approval
      // 3. If no sponsors → awaiting_creator_review (skip sponsor approval)
      const shouldSkipApproval = currentItem.skipApproval === true || !hasSponsors;
      const nextStatus = shouldSkipApproval ? "awaiting_creator_review" : "awaiting_sponsor_approval";
      
      // If resubmitting after rejection (awaiting_submission) and going to sponsor approval,
      // reset all sponsor approval records back to 'pending' so Atendimento can re-review
      if (currentItem.status === "awaiting_submission" && nextStatus === "awaiting_sponsor_approval") {
        const existingApprovals = await storage.getItemSponsorApprovals(req.params.id);
        for (const approval of existingApprovals) {
          // Reset any non-approved status back to pending — e o desaprovador
          // aprovado também: o item inteiro está voltando com versão nova.
          const estritoAprovado = approval.status === 'approved' && !!(await storage.getSponsor(approval.sponsorId))?.strictApproval;
          if (['awaiting_arte', 'new_version_pending', 'rejected'].includes(approval.status) || estritoAprovado) {
            await storage.updateItemSponsorApproval(approval.id, {
              status: 'pending',
              approvedBy: null,
              approvedAt: null,
              rejectedBy: null,
              rejectedAt: null,
              rejectionReason: null,
            });
          }
        }
      }

      const itemUpdates: any = { 
        status: nextStatus,
        // Limpa flag de reprovação pelo criador quando item é reenviado
        // rejectedBySponsor permanece até ser aprovado pelo patrocinador novamente
        rejectedByCreator: false,
      };
      if (approvalThumbUrl) {
        itemUpdates.approvalThumbUrl = thumbNormalizado;
      }
      
      const item = await storage.updateItem(req.params.id, itemUpdates);
      
      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      // A versão da arte que foi para aprovação — uma linha por envio. É o
      // que deixa a tela de Versões dizer QUAL thumb cada patrocinador viu.
      if (approvalThumbUrl) {
        await storage.createItemArtVersion({ itemId: item.id, thumbUrl: thumbNormalizado, origem: "envio", createdBy: req.userName ?? null });
        invalidarCacheDeVersoes();
      }
      
      const event = await storage.getEvent(item.eventId);
      
      if (shouldSkipApproval) {
        // Pula aprovação do patrocinador e vai direto para revisão da Solicitação
        await createAuditLog(
          req,
          'updated',
          'item',
          item.id,
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)} (sem aprovação de patrocinador)`
        );
        
        // Notifica Solicitação para revisar
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando revisão da Solicitação: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["solicitacao"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      } else {
        // Fluxo padrão: vai para aprovação do patrocinador
        
        // Inicializar registros de aprovação para cada patrocinador
        await storage.initializeItemSponsorApprovals(
          req.params.id, 
          itemSponsors.map(s => s.sponsorId)
        );
        
        await createAuditLog(
          req,
          'updated',
          'item',
          item.id,
          `Enviado para Arte — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(nextStatus)}`
        );
        
        // Notifica Atendimento para aprovar com patrocinador
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Novo item aguardando aprovação do patrocinador: ${item.type} - Evento: ${event?.name}`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["atendimento"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
      }
      
      res.json(item);
    } catch (error: any) {
      sendSensitiveError(res, error, "Enviar para aprovação", 500);
    }
  });

  // Sponsor approves item (Atendimento module)
  app.patch("/api/items/:id/sponsor-approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }
      
      // ANDA — e é LITERALMENTE o caso que o dono viu em produção ("encerrar
      // eventos e conseguirem aprovar ainda"). A tela do Atendimento já esconde
      // a peça; a ficha do Painel Geral, não.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `A peça não pode ser aprovada pelo patrocinador: está em "${translateStatus(currentItem.status)}", e a aprovação é em "Aguardando Aprovação".`
        });
      }

      const item = await storage.updateItem(req.params.id, {
        status: "sponsor_approved",
        sponsorApprovedBy: req.userName,
        sponsorApprovedAt: new Date(),
        // Limpa flag de reprovação pelo patrocinador quando aprovado
        rejectedBySponsor: false,
      });

      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      // O ATALHO APROVA A PEÇA INTEIRA — então as LINHAS acompanham (24/08,
      // caso #4176). Este caminho mudava só o STATUS: o patrocinador ficava
      // "Aguardando" numa peça já em Finalização, o modal mostrava "0 de 1
      // aprovaram" numa peça aprovada, e a revogação seguinte respondia "já
      // está pendente" — a peça ficava presa fora da fila do Atendimento,
      // sem nenhum botão que a trouxesse de volta.
      const linhasDaPeca = await storage.getItemSponsorApprovals(req.params.id);
      for (const linha of linhasDaPeca) {
        if (linha.status === "approved") continue;
        await storage.updateItemSponsorApproval(linha.id, {
          status: "approved",
          approvedBy: req.userName ?? "Atendimento",
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
        });
      }
      invalidarCacheDeVersoes();
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'approved',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")} (aprovado pelo patrocinador)`
      );
      
      // Notifica Arte para finalizar o layout e adicionar arquivo final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Patrocinador aprovou o item. Finalize o layout e adicione o arquivo final: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error: any) {
      responderFalha(res, error, "PATCH /api/items/:id/sponsor-approve", 400);
    }
  });

  // Arte dispenses item (bypasses remaining approval steps → ready_for_production)
  app.patch("/api/items/:id/dispense", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem dispensar itens" });
      }
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Peça não encontrada." });
      // ANDA: a peça pula a aprovação do Atendimento e vai para a
      // finalização da Arte.
      if (await barraEventoFinalizado(currentItem, res)) return;
      if (!DISPENSAVEIS.includes(currentItem.status)) {
        return res.status(409).json({ error: `A peça não pode pular a aprovação na etapa atual (${translateStatus(currentItem.status)}).` });
      }
      // MOLDE (22/09) não tem aprovação nem finalização: o envio dele já vai
      // direto para a Revisão Final.
      if (ehMolde(currentItem)) {
        return res.status(409).json({ error: "Molde não passa por aprovação nem finalização — use \"Enviar para a Revisão Final\"." });
      }
      // O MOTIVO É OBRIGATÓRIO: pular a aprovação some com a peça da mesa do
      // Atendimento e ela chega à Revisão sem o "sim" do patrocinador — quem
      // olhar depois precisa saber por quê. Mesma régua das devoluções.
      const lidoMotivo = lerMotivoDevolucao({ body: { notes: req.body?.reason ?? req.body?.notes } });
      if (!lidoMotivo.ok) {
        return res.status(400).json({ error: `Explique em pelo menos ${MOTIVO_MIN} caracteres por que a peça pula a aprovação — o Atendimento e a Revisão precisam saber.` });
      }
      const reason = lidoMotivo.motivo;
      // SAIU DA FILA DE QUEM? Só quem estava esperando patrocinador some da
      // mesa do Atendimento — e é a única situação em que avisá-lo tem
      // conteúdo. Peça em "aguardando envio" nunca chegou lá.
      const saiuDoAtendimento = currentItem.status === "awaiting_sponsor_approval";
      // O DESTINO MUDOU EM 09/09 (decisão do dono). Era
      // `ready_for_production`: a peça saltava para a fila da Gráfica pulando
      // aprovação, finalização E revisão — e chegava lá SEM arquivo final,
      // porque nenhum dos status de origem tem um. As sete peças do "Bota pra
      // Correr SP" que passaram por aqui foram impressas e entregues assim.
      // Agora ela para na FINALIZAÇÃO: a Arte sobe o arquivo final e a Revisão
      // ainda confere. O que se pula é só a aprovação do Atendimento.
      //
      // `skipApproval` registra a isenção na própria peça: sem isso a peça
      // seguiria com linhas de patrocinador em "pending" e a saúde dos dados a
      // acusaria como "avançou com patrocinador pendente" — que aqui é
      // deliberado, não acidente. As linhas ficam como estão: ninguém decidiu,
      // e apagar isso seria reescrever o histórico.
      await storage.updateItem(req.params.id, { status: DESTINO_DA_DISPENSA, skipApproval: true });
      await createAuditLog(
        req,
        "dispensed",
        "item",
        req.params.id,
        `Peça dispensada pela Arte. Status anterior: ${currentItem.status}. Foi direto para a finalização, sem aprovação do Atendimento${reason ? `. Motivo: ${reason}` : ''}`
      );

      // A dispensa PULA a aprovação e joga a peça direto na fila da Gráfica —
      // era a única transição do fluxo que fazia isso em silêncio: nenhum
      // broadcast, nenhuma notificação e um `{success:true}` que não deixava o
      // cliente atualizar nada. A peça aparecia na Gráfica só no próximo F5, e
      // ninguém do chão de fábrica sabia que ela tinha entrado.
      // Espelha o que /submit-for-approval faz logo acima.
      const item = await storage.getItem(req.params.id);
      if (!item) return res.status(404).json({ error: "Peça não encontrada." });
      const event = await storage.getEvent(item.eventId);

      // Avisar a GRÁFICA aqui virou mentira quando o destino mudou: a peça
      // não entra mais na fila dela — vai para a finalização da Arte. Quem
      // perde a peça de vista é o ATENDIMENTO, e só quando ela já estava
      // esperando patrocinador.
      if (saiuDoAtendimento) {
        const notification = await storage.createNotification({
          type: "itemAdded",
          message: `Saiu da sua fila sem aprovação: ${item.type}${event ? ` — ${event.name}` : ""} (a Arte mandou direto para a finalização)`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["atendimento"],
        });
        broadcast({ type: "notification_created", notification });
      }

      broadcast({ type: "item_updated", item });

      // Devolve O ITEM (não `{success:true}`): é o contrato das rotas irmãs, e
      // é o que permite ao cliente ler o novo status sem outro round-trip.
      res.json(item);
    } catch (error: any) {
      sendSensitiveError(res, error, "Dispensar aprovação", 500);
    }
  });

  // A rota PATCH /api/items/:id/sponsor-reject FOI REMOVIDA (decisao do dono,
  // 17/08). Ela reprovava a peca INTEIRA e a mandava para awaiting_submission,
  // enquanto a reprovacao POR PATROCINADOR (logo abaixo) deixa a peca em
  // awaiting_sponsor_approval com a linha do patrocinador em awaiting_arte —
  // que e o par que alimenta a aba Correcao da Arte. Duas portas para o MESMO
  // fato, com destinos diferentes: a peca reprovada caia no meio de 1.120
  // pecas que nunca foram enviadas e a Arte perdia a diferenca entre
  // retrabalho e trabalho novo. Ficou uma porta so.

  // ========== Individual Sponsor Approval Endpoints ==========

  // Get sponsor approvals for an item
  app.get("/api/items/:id/sponsor-approvals", requireAuth, async (req, res) => {
    try {
      const approvals = await storage.getItemSponsorApprovals(req.params.id);
      
      // Enrich with sponsor names
      const sponsors = await storage.getAllSponsors();
      const sponsorMap = new Map(sponsors.map(s => [s.id, s]));
      
      const enrichedApprovals = approvals.map(approval => ({
        ...approval,
        sponsor: sponsorMap.get(approval.sponsorId) || null
      }));
      
      res.json(enrichedApprovals);
    } catch (error: any) {
      responderFalha(res, error, "GET /api/items/:id/sponsor-approvals", 400);
    }
  });

  // Individual sponsor approves item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/approve", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem aprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // ANDA: aprovação por patrocinador — o mesmo buraco do /sponsor-approve,
      // por outra porta (é esta que a tela de Atendimento usa hoje).
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `A peça não está aguardando aprovação do patrocinador: está em "${translateStatus(currentItem.status)}".`
        });
      }

      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }

      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      // A REGRA (afinada pelo dono, 31/08): quem REPROVOU não aprova enquanto
      // a Arte não devolver a nova versão — a linha dele fica travada aqui.
      // Os DEMAIS patrocinadores seguem aprovando normalmente (as linhas deles
      // continuam 'pending' e nunca passam por esta trava); a tela agora avisa
      // que a Arte está refazendo, por quem e por quê.
      if (approval && approval.status === 'awaiting_arte') {
        return res.status(409).json({ error: "Aguardando nova versão da Arte para este patrocinador. Não é possível aprovar agora." });
      }

      if (approval) {
        // Update existing approval — com O QUE foi aprovado (o thumb de agora).
        approval = await storage.updateItemSponsorApproval(approval.id, {
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
          rejectedBy: null,
          rejectedAt: null,
          rejectionReason: null,
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          itemId,
          sponsorId,
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
          status: 'approved',
          approvedBy: req.userName,
          approvedAt: new Date(),
        });
      }
      
      // Get sponsor name for audit log
      const sponsor = await storage.getSponsor(sponsorId);
      
      await createAuditLog(
        req,
        'approved',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" aprovou o item`
      );

      // Check if ALL sponsors have approved
      const allApprovals = await storage.getItemSponsorApprovals(itemId);
      invalidarCacheDeVersoes();
      const allApproved = itemSponsors.every(is => {
        const sponsorApproval = allApprovals.find(a => a.sponsorId === is.sponsorId);
        return sponsorApproval && sponsorApproval.status === 'approved';
      });
      
      if (allApproved) {
        // All sponsors approved - advance item status
        const item = await storage.updateItem(itemId, {
          status: "sponsor_approved",
          sponsorApprovedBy: req.userName,
          sponsorApprovedAt: new Date(),
          rejectedBySponsor: false,
        });
        
        const event = await storage.getEvent(currentItem.eventId);
        
        await createAuditLog(
          req,
          'approved',
          'item',
          itemId,
          `Todos os patrocinadores aprovaram. Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("sponsor_approved")}`
        );
        
        // Notify Arte to add final file
        const notification = await storage.createNotification({
          type: "arteApproved",
          message: `Todos os patrocinadores aprovaram. Finalize o layout e adicione o arquivo final: ${currentItem.type} - Evento: ${event?.name}`,
          eventId: currentItem.eventId,
          itemId: itemId,
          targetRoles: ["arte"],
        });
        
        broadcast({ type: "item_updated", item });
        broadcast({ type: "notification_created", notification });
        
        res.json({ approval, item, allApproved: true });
      } else {
        // Not all sponsors approved yet
        broadcast({ type: "sponsor_approval_updated", itemId, approval });
        res.json({ approval, allApproved: false });
      }
    } catch (error: any) {
      responderFalha(res, error, "POST /api/items/:id/sponsor-approvals/:sponsorId/approve", 400);
    }
  });

  // Individual sponsor rejects item
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/reject", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "atendimento" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Atendimento podem reprovar pelo patrocinador" });
      }
      
      const { id: itemId, sponsorId } = req.params;
      // Era `rejectionReason || null`: o Atendimento podia reprovar em nome do
      // patrocinador sem dizer nada, e a Arte recebia a peça de volta sem
      // instrução. Agora vale a mesma régua das outras portas.
      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);
      const rejectionReason = motivo.motivo;
      
      // Validate item exists and status
      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      
      // ANDA: reprovar por patrocinador manda a Arte fazer uma versão nova.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({
          error: `A peça não está aguardando aprovação do patrocinador: está em "${translateStatus(currentItem.status)}".`
        });
      }

      // Validate sponsor is linked to item
      const itemSponsors = await storage.getItemSponsors(itemId);
      if (!itemSponsors.find(s => s.sponsorId === sponsorId)) {
        return res.status(404).json({ error: "Patrocinador não está vinculado a este item" });
      }

      // Get or create approval record
      let approval = await storage.getItemSponsorApproval(itemId, sponsorId);

      if (approval) {
        // Update existing approval
        approval = await storage.updateItemSponsorApproval(approval.id, {
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
          approvedBy: null,
          approvedAt: null,
        });
      } else {
        // Create new approval
        approval = await storage.createItemSponsorApproval({
          decidedThumbUrl: currentItem.approvalThumbUrl ?? null,
          itemId,
          sponsorId,
          status: 'awaiting_arte',
          rejectedBy: req.userName,
          rejectedAt: new Date(),
          rejectionReason: rejectionReason || null,
        });
      }
      
      // Get sponsor name for audit log and notification
      const sponsor = await storage.getSponsor(sponsorId);
      const event = await storage.getEvent(currentItem.eventId);
      invalidarCacheDeVersoes();
      // Quem desaprova junto perde a aprovação agora — a peça vai ser refeita.
      await revogarAprovacoesEstritas(req, currentItem, { tipo: "reprovacao", sponsorId, nome: sponsor?.name ?? sponsorId });
      
      // Item stays in awaiting_sponsor_approval — only leaves when ALL sponsors approve
      const item = (await storage.updateItem(itemId, {
        rejectedBySponsor: true,
      }))!;
      
      await createAuditLog(
        req,
        'rejected',
        'item',
        itemId,
        `Patrocinador "${sponsor?.name || sponsorId}" reprovou o item. Item aguarda nova versão da Arte${rejectionReason ? `. Motivo: ${rejectionReason}` : ''}`
      );
      
      // Notify Arte to prepare a new version for this sponsor
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Patrocinador "${sponsor?.name}" reprovou. Envie nova arte para: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["arte"],
      });
      
      broadcast({ type: "notification_created", notification });
      
      res.json({ 
        approval, 
        item, 
        message: `Reprovação registrada. Item aguarda nova arte para o patrocinador.`
      });
    } catch (error: any) {
      responderFalha(res, error, "POST /api/items/:id/sponsor-approvals/:sponsorId/reject", 400);
    }
  });

  // REVOGAR uma aprovação (ou reverter uma reprovação) de UM patrocinador,
  // de volta a "pending". Reabre o item para aprovação se ele já havia
  // avançado por essa aprovação.
  //
  // Nasceu como correção de admin ("aprovou o patrocinador errado"). Pedido
  // do dono (21/08/2026): o ATENDIMENTO também revoga — enquanto a peça está
  // em aprovação ou na finalização da Arte (sponsor_approved). Depois disso
  // (arquivo final, produção) continua sendo coisa de admin: revogar uma
  // aprovação com a peça já na gráfica é desfazer trabalho, não decisão.
  const STATUS_REVOGAVEL = ["awaiting_sponsor_approval", "sponsor_approved"];
  app.post("/api/items/:id/sponsor-approvals/:sponsorId/revert", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin" && req.userRole !== "atendimento") {
        return res.status(403).json({ error: "Apenas Atendimento e administradores podem revogar uma aprovação" });
      }

      const { id: itemId, sponsorId } = req.params;

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }

      // ANDA (e aqui foi uma DECISÃO, não um automatismo): "reverter" soa como
      // arrumar a casa, mas o efeito é REABRIR a rodada — devolve o item de
      // "sponsor_approved" para "awaiting_sponsor_approval", ou seja, recria
      // uma pendência de aprovação numa fila que não mostra mais essa peça.
      // Num evento vivo é correção; num evento morto é trabalho fantasma.
      // Vale a regra do dono para os casos duvidosos: barra — o admin que
      // precisar mesmo corrigir reabre o evento, que é barato.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (req.userRole !== "admin" && !STATUS_REVOGAVEL.includes(currentItem.status)) {
        return res.status(409).json({
          error: `Só dá para revogar enquanto a peça está em aprovação ou na finalização da Arte. Status atual: ${translateStatus(currentItem.status)}`,
        });
      }
      const motivo = typeof req.body?.motivo === "string" ? req.body.motivo.trim().slice(0, 500) : "";

      const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
      if (!approval) {
        return res.status(404).json({ error: "Aprovação não encontrada para este patrocinador" });
      }
      // TODA a família pós-aprovação, não só sponsor_approved: a peça
      // incoerente ANDA (arquivo final → revisão → devolvida) sem fechar a
      // rodada por baixo — o caso #4176 estava em Finalização de novo quando
      // o dono tentou revogar pela segunda vez.
      // A lista mora em @shared/fluxo-peca: o "acrescentar patrocinador
      // depois que a peça passou" (routes/sponsors.ts) reabre pela MESMA régua,
      // e duas cópias divergiriam no primeiro status novo.
      // Linha já pendente COM a peça já avançada é o estado incoerente que o
      // atalho de aprovação deixava antes de 24/08 (caso #4176): não há o que
      // revogar NA LINHA, mas há o que REABRIR — e é para isso que quem
      // clicou veio aqui. Pendente com a peça ainda em aprovação continua 409:
      // aí não há mesmo nada a fazer.
      const reabrirIncoerente = approval.status === "pending" && POS_APROVACAO.includes(currentItem.status);
      if (approval.status === "pending" && !reabrirIncoerente) {
        return res.status(409).json({ error: "Esta aprovação já está pendente" });
      }

      const previousStatus = approval.status;
      const updatedApproval = reabrirIncoerente ? approval : await storage.updateItemSponsorApproval(approval.id, {
        status: "pending",
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      });

      invalidarCacheDeVersoes();
      // Se o item já havia avançado por conta desta aprovação (todos aprovados),
      // reabre para aprovação do patrocinador — senão o item ficaria "aprovado"
      // com um patrocinador pendente por baixo. A REGRA DO DONO (24/08): linha
      // "Aguardando" ⇒ a peça volta pendente no Atendimento — de qualquer
      // status pós-aprovação, não só do primeiro degrau. O arquivo final que a
      // Arte já subiu FICA: revogar reabre a decisão, não apaga trabalho.
      let item = currentItem;
      if (POS_APROVACAO.includes(currentItem.status)) {
        item = (await storage.updateItem(itemId, {
          status: "awaiting_sponsor_approval",
          sponsorApprovedBy: null,
          sponsorApprovedAt: null,
          rejectedBySponsor: false,
        }))!;
      }

      const sponsor = await storage.getSponsor(sponsorId);

      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        reabrirIncoerente
          ? `${req.userRole === "admin" ? "Administrador" : "Atendimento"} reabriu a aprovação de "${sponsor?.name || sponsorId}" — a linha já estava pendente com a peça avançada (estado herdado do atalho de aprovação)${motivo ? `. Motivo: ${motivo}` : ''}. Item reaberto: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}`
          : `${req.userRole === "admin" ? "Administrador" : "Atendimento"} revogou a ${previousStatus === "approved" ? "aprovação" : "decisão"} de "${sponsor?.name || sponsorId}" — volta a pendente (estava: ${previousStatus})${motivo ? `. Motivo: ${motivo}` : ''}${item.status !== currentItem.status ? `. Item reaberto: ${translateStatus(currentItem.status)} → ${translateStatus(item.status)}` : ''}`
      );

      broadcast({ type: "sponsor_approval_updated", itemId, approval: updatedApproval });
      if (item.status !== currentItem.status) {
        // A Arte estava finalizando uma peça "aprovada por todos": precisa
        // saber que a aprovação caiu antes de mandar o arquivo final.
        const event = await storage.getEvent(currentItem.eventId);
        const notification = await storage.createNotification({
          type: "itemRejected",
          message: `Aprovação de "${sponsor?.name || sponsorId}" revogada — segure a finalização: ${currentItem.type} - Evento: ${event?.name}`,
          eventId: currentItem.eventId,
          itemId,
          targetRoles: ["arte"],
        });
        broadcast({ type: "notification_created", notification });
        broadcast({ type: "item_updated", item });
      }

      res.json({ approval: updatedApproval, item });
    } catch (error: any) {
      responderFalha(res, error, "POST /api/items/:id/sponsor-approvals/:sponsorId/revert", 400);
    }
  });

  // Arte submits new version for specific sponsors (correção)
  app.post("/api/items/:id/sponsor-approvals/resubmit", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar nova versão" });
      }

      const { id: itemId } = req.params;
      const { newThumbUrl, sponsorIds: pedidos } = req.body as { newThumbUrl: string; sponsorIds?: string[] };

      if (!newThumbUrl) {
        return res.status(400).json({ error: "newThumbUrl é obrigatório" });
      }

      const currentItem = await storage.getItem(itemId);
      if (!currentItem) {
        return res.status(404).json({ error: "Item não encontrado" });
      }
      // ANDA: nova versão de arte volta a cobrar revisão do Atendimento.
      if (await barraEventoFinalizado(currentItem, res)) return;

      if (currentItem.status !== "awaiting_sponsor_approval") {
        return res.status(409).json({ error: "Item não está aguardando aprovação do patrocinador" });
      }
      // Só objeto do nosso storage (ver urlDeThumbValida), depois das guardas
      // de evento e de status: a decisão de negócio fala antes do formato.
      const thumbNormalizado = urlDeThumbValida(newThumbUrl);
      if (!thumbNormalizado) {
        return res.status(400).json({ error: ERRO_THUMB_FORA_DO_STORAGE });
      }

      // O REENVIO É DERIVADO, NÃO ESCOLHIDO (regra do dono): vai para quem
      // ainda não aprovou — quem reprovou e quem está aguardando. Quem já
      // aprovou mantém a aprovação e não recebe de novo. O cliente não
      // manda mais seleção; se mandar (API antiga, script), só passa se for
      // exatamente o conjunto derivado — o cliente derivar e o servidor
      // aceitar qualquer subconjunto deixava a porta aberta para publicar a
      // arte corrigida sem que a marca que a recusou voltasse a ver.
      const aprovacoes = await storage.getItemSponsorApprovals(itemId);
      const sponsorIds = aprovacoes.filter((a) => a.status !== "approved").map((a) => a.sponsorId);
      if (sponsorIds.length === 0) {
        return res.status(409).json({ error: "Nenhum patrocinador pendente para receber o reenvio — todos já aprovaram." });
      }
      if (Array.isArray(pedidos) && pedidos.length > 0) {
        const a = new Set(pedidos), b = new Set(sponsorIds);
        const igual = a.size === b.size && Array.from(a).every((x) => b.has(x));
        if (!igual) {
          return res.status(409).json({
            error: "O reenvio vai sempre para quem ainda não aprovou — o servidor não aceita outro conjunto.",
            esperado: sponsorIds,
          });
        }
      }

      // Cada aprovação reprovada volta para a fila do Atendimento: awaiting_arte → new_version_pending
      for (const sponsorId of sponsorIds) {
        const approval = await storage.getItemSponsorApproval(itemId, sponsorId);
        if (approval && approval.status === "awaiting_arte") {
          await storage.updateItemSponsorApproval(approval.id, {
            status: "new_version_pending",
          });
        }
      }

      // Update item thumb with the new version
      const item = await storage.updateItem(itemId, {
        approvalThumbUrl: thumbNormalizado,
        rejectedBySponsor: false,
      });
      await storage.createItemArtVersion({ itemId, thumbUrl: thumbNormalizado, origem: "reenvio", createdBy: req.userName ?? null });
      invalidarCacheDeVersoes();
      // Versão nova: o desaprovador que já tinha aprovado volta para a fila.
      await revogarAprovacoesEstritas(req, currentItem, { tipo: "nova_versao" });

      const event = await storage.getEvent(currentItem.eventId);

      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Arte enviou nova versão do thumb para ${sponsorIds.length} patrocinador(es). Aguarda revisão do Atendimento.`
      );

      // Notify Atendimento
      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Nova versão de arte enviada. Revise o thumb: ${currentItem.type} - Evento: ${event?.name}`,
        eventId: currentItem.eventId,
        itemId: itemId,
        targetRoles: ["atendimento"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      res.json({ item, message: "Nova versão enviada. Atendimento notificado." });
    } catch (error: any) {
      responderFalha(res, error, "POST /api/items/:id/sponsor-approvals/resubmit", 400);
    }
  });

  // Initialize sponsor approvals when sending item for approval
  app.post("/api/items/:id/initialize-sponsor-approvals", requireAuth, async (req, res) => {
    // Irmã de resubmit (arte+admin); estava sem gate — e sem caller no client.
    if (!["arte", "admin"].includes(req.userRole ?? "")) {
      return res.status(403).json({ error: "Sem permissão" });
    }
    try {
      const itemId = req.params.id;

      // ANDA: (re)inicializar zera as aprovações e abre uma rodada NOVA de
      // cobrança de patrocinador. Precisa do item só para chegar ao evento.
      const alvo = await storage.getItem(itemId);
      if (!alvo) return res.status(404).json({ error: "Item não encontrado" });
      if (await barraEventoFinalizado(alvo, res)) return;

      // Get item sponsors
      const itemSponsors = await storage.getItemSponsors(itemId);

      if (itemSponsors.length === 0) {
        return res.status(400).json({ error: "Item não possui patrocinadores vinculados" });
      }
      
      // Initialize approval records for all sponsors
      await storage.initializeItemSponsorApprovals(
        itemId, 
        itemSponsors.map(s => s.sponsorId)
      );
      
      const approvals = await storage.getItemSponsorApprovals(itemId);

      // Zera as aprovações de patrocinador da peça e não deixava rastro nenhum:
      // quem consultasse a ficha via um "Pat. Aprovou" desaparecer sem que nada
      // dissesse quem reabriu a rodada.
      await createAuditLog(
        req,
        'updated',
        'item',
        itemId,
        `Aprovações de patrocinador (re)inicializadas para ${itemSponsors.length} patrocinador(es)`
      );

      res.json(approvals);
    } catch (error: any) {
      responderFalha(res, error, "POST /api/items/:id/initialize-sponsor-approvals", 400);
    }
  });

  // ========== End Individual Sponsor Approval Endpoints ==========
}
