// Material da Arte: arquivo final e troca de thumb.
import type { Express } from "express";
import { z } from "zod";
import { storage } from "../../storage";
// TRAVA DA SOLICITAÇÃO (21/09): o que faz a peça andar na Gráfica é barrado
// com 409 e a frase humana; ver shared/trava-da-peca.ts.
import { CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
// Trocar arquivo final/thumb depois que a peça andou, e quem decide na Revisão.
import {
  regraDaTrocaDeArquivoFinal,
  regraDaTrocaDeThumb,
  lerMotivoDaTroca,
  MARCA_TROCA_APOS_APROVACAO,
} from "@shared/troca-de-material";
import { requireAuth, broadcast, translateStatus, sendSensitiveError, createAuditLog } from "../shared";
// A tela de Versões guarda o quadro calculado por 30 s. Toda escrita que mude
// versão, decisão ou book derruba esse cache na hora — senão o Atendimento
// revoga uma aprovação e continua vendo o quadro velho numa tela cujo trabalho
// é justamente conferir o que está valendo agora.
import { invalidarCacheDeVersoes } from "../versoes";
// Régua do thumb (só objeto do nosso storage): ./thumb-url.ts.
import { urlDeThumbValida, ERRO_THUMB_FORA_DO_STORAGE } from "../thumb-url";
import { barraEventoFinalizado } from "../eventoFinalizado";
import { registrarSaidaDaImpressora, revogarAprovacoesEstritas } from "./comum";
import { vemDeOrigemValida } from "@shared/maquina-de-estados";
import { mensagemDoErro } from "../../erros";

/** arquivo final e troca de thumb. */
export function registrarArte(app: Express): void {
  // Arte submits final file after sponsor approval
  app.patch("/api/items/:id/submit-final-file", requireAuth, async (req, res) => {
    try {
      // Validate role
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem enviar arquivo final" });
      }
      
      // Validate request body with Zod
      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "Envie o arquivo final antes de salvar."),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      
      const validatedData = finalFileSchema.parse(req.body);
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      
      // ANDA: o arquivo final leva a peça para a Revisão Final e, dali, para a
      // Gráfica.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // sponsor_approved: normal flow after sponsor approval
      // awaiting_creator_review: skipApproval / no-sponsor flow (sponsor approval skipped)
      // (a lista mora em shared/maquina-de-estados.ts, "enviar-arquivo-final")
      if (!vemDeOrigemValida(currentItem.status, "enviar-arquivo-final")) {
        return res.status(409).json({ 
          error: `A peça não pode receber o arquivo final na etapa atual (${translateStatus(currentItem.status)}) — só depois da aprovação do patrocinador, na Finalização.`
        });
      }
      
      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
      });
      
      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      
      const event = await storage.getEvent(item.eventId);
      
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_final_review")} (arquivo final adicionado)`
      );
      
      // Notifica Solicitação para revisão final
      const notification = await storage.createNotification({
        type: "arteApproved",
        message: `Arquivo final pronto para revisão: ${item.type} - Evento: ${event?.name}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });
      
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error) {
      sendSensitiveError(res, error, "Enviar arquivo final", 500);
    }
  });

  // Troca o thumb de aprovação já existente, preservando o anterior. A regra
  // de QUANDO pode (shared/troca-de-material.ts, a mesma que a tela lê):
  //   · em aprovação do patrocinador: não — mudaria o que ele está avaliando;
  //   · aprovada (Finalização/Revisão): com motivo, marcada "trocada após
  //     aprovação" na trilha e na versão;
  //   · liberada em diante: não — a peça já é da Gráfica.
  app.patch("/api/items/:id/update-thumb", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o thumb" });
      }

      const { approvalThumbUrl } = z
        .object({ approvalThumbUrl: z.string().min(1, "Envie o thumb novo antes de salvar.") })
        .parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      // ANDA: trocar o thumb é refazer o material que os patrocinadores olham.
      if (await barraEventoFinalizado(currentItem, res)) return;
      const regra = regraDaTrocaDeThumb(currentItem);
      if (!regra.pode) {
        return res.status(409).json({ error: regra.motivo });
      }
      let motivoDaTroca: string | null = null;
      if (regra.exigeMotivo) {
        const lido = lerMotivoDaTroca(req.body?.motivo);
        if (!lido.ok) return res.status(400).json({ error: lido.erro });
        motivoDaTroca = lido.motivo;
      }
      // Só objeto do nosso storage (ver urlDeThumbValida). A comparação com o
      // atual usa a forma normalizada: a URL crua do bucket e a `/objects/`
      // são o mesmo arquivo.
      const thumbNormalizado = urlDeThumbValida(approvalThumbUrl);
      if (!thumbNormalizado) {
        return res.status(400).json({ error: ERRO_THUMB_FORA_DO_STORAGE });
      }
      if (currentItem.approvalThumbUrl === thumbNormalizado) {
        return res.status(409).json({ error: "O thumb enviado é igual ao atual." });
      }

      const prevUrl = currentItem.approvalThumbUrl;

      const item = await storage.updateItem(req.params.id, {
        approvalThumbUrl: thumbNormalizado,
        previousApprovalThumbUrl: prevUrl,
        approvalThumbUpdatedAt: new Date(),
      });
      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      // A versão leva a marca no "por" — é o que a tela de Versões mostra ao
      // lado de cada thumb, sem pedir coluna nova.
      const porDaVersao = motivoDaTroca
        ? `${req.userName ?? "Arte"} (${MARCA_TROCA_APOS_APROVACAO})`
        : (req.userName ?? null);
      await storage.createItemArtVersion({ itemId: item.id, thumbUrl: thumbNormalizado, origem: "troca", createdBy: porDaVersao });
      invalidarCacheDeVersoes();

      // A frase da troca fica INTACTA (a tela de Versões a lê por regex); a
      // marca e o motivo vão numa linha própria logo depois.
      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Thumb de aprovação atualizado por ${req.userName}. Anterior: ${prevUrl} → Novo: ${thumbNormalizado}`
      );
      if (motivoDaTroca) {
        await createAuditLog(req, 'updated', 'item', item.id, `Thumb ${MARCA_TROCA_APOS_APROVACAO} (${translateStatus(currentItem.status)}). Motivo: ${motivoDaTroca}`);
      }

      // Aprovada e ainda na Finalização: o desaprovador estrito perde a
      // aprovação — e a peça volta para o Atendimento para ele ver a versão nova.
      if (currentItem.status === "sponsor_approved") {
        const revogados = await revogarAprovacoesEstritas(req, currentItem, { tipo: "nova_versao" });
        if (revogados.length > 0) {
          const devolvido = await storage.updateItem(item.id, { status: "awaiting_sponsor_approval", rejectedBySponsor: false });
          await createAuditLog(req, 'updated', 'item', item.id, `Status alterado: ${translateStatus("sponsor_approved")} → ${translateStatus("awaiting_sponsor_approval")} — ${revogados.join(", ")} precisa aprovar a nova versão`);
          const event = await storage.getEvent(currentItem.eventId);
          const notification = await storage.createNotification({
            type: "itemRejected",
            message: `Thumb trocado: ${revogados.join(", ")} precisa aprovar a nova versão. ${currentItem.type} - Evento: ${event?.name}`,
            eventId: currentItem.eventId,
            itemId: item.id,
            targetRoles: ["atendimento"],
          });
          broadcast({ type: "notification_created", notification });
          broadcast({ type: "item_updated", item: devolvido });
          return res.json(devolvido);
        }
      }

      broadcast({ type: "item_updated", item });
      res.json(item);
    } catch (error) {
      sendSensitiveError(res, error, "Trocar thumb", 500);
    }
  });

  app.patch("/api/items/:id/update-final-file", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem atualizar o arquivo final" });
      }

      const finalFileSchema = z.object({
        finalFileUrl: z.string().min(1, "Envie o arquivo final antes de salvar."),
        finalFileName: z.string().optional(),
        finalPreviewUrl: z.string().optional(),
      });
      const validatedData = finalFileSchema.parse(req.body);

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      // ANDA: substituir o arquivo final notifica a Gráfica para RE-VERIFICAR
      // antes de produzir e ainda propaga a arte nova para os complementos —
      // é um pedido de reimpressão disfarçado de correção de arquivo.
      if (await barraEventoFinalizado(currentItem, res)) return;
      // QUANDO a troca vale (shared/troca-de-material.ts, a mesma regra da
      // tela): travada não; com material produzido não (o que está no galpão
      // é do arquivo antigo — é caso de complemento/reimpressão); liberada ou
      // em impressão sem nenhuma impressa, a troca DEVOLVE a peça para a
      // Revisão Final, porque a liberação valia para o arquivo anterior.
      const regra = regraDaTrocaDeArquivoFinal(currentItem);
      if (!regra.pode) {
        return res.status(409).json(regra.travada
          ? { error: regra.motivo, code: CODIGO_PECA_TRAVADA }
          : { error: regra.motivo });
      }
      const voltaParaRevisao = regra.voltaParaRevisao;

      const prevUrl  = currentItem.finalFileUrl;
      const prevName = currentItem.finalFileName || null;

      const item = await storage.updateItem(req.params.id, {
        finalFileUrl: validatedData.finalFileUrl,
        finalFileName: validatedData.finalFileName || null,
        finalPreviewUrl: validatedData.finalPreviewUrl || null,
        finalFileUpdatedAt: new Date(),
        previousFinalFileUrl:  prevUrl,
        previousFinalFileName: prevName,
        ...(voltaParaRevisao ? {
          status: "awaiting_final_review",
          // A revisão anterior deixa de valer — sem zerar, a peça voltaria
          // marcada como já revisada.
          creatorReviewedAt: null,
          // Sai da fila/impressora da Gráfica sem deixar reserva "Pausada".
          reservaPorMaquina: null, maquinaPrevista: null,
          ...(currentItem.status === "inProduction" || currentItem.status === "em_producao"
            ? { printMachine: null, impressaoPorMaquina: null }
            : {}),
        } : {}),
      });
      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        `Arquivo final substituído por ${req.userName}. Anterior: ${prevUrl} → Novo: ${validatedData.finalFileUrl}`
      );

      if (voltaParaRevisao) {
        await createAuditLog(
          req, 'updated', 'item', item.id,
          `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("awaiting_final_review")} (arquivo final trocado depois da liberação — volta para a Revisão Final)`,
        );
        // Estava na impressora sem nenhuma impressa: o diário registra a saída.
        await registrarSaidaDaImpressora(req, currentItem);
        // Quem AGE agora é a Revisão; a Gráfica é avisada de que a peça saiu
        // da fila dela.
        const paraRevisao = await storage.createNotification({
          type: "arteApproved",
          message: `Arquivo final trocado depois da liberação: ${item.displayId ?? item.type}${event ? ` — ${event.name}` : ""} voltou para a Revisão Final`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["solicitacao"],
        });
        broadcast({ type: "notification_created", notification: paraRevisao });
      }

      // A Gráfica só é avisada quando a peça estava na fila dela.
      const notification = voltaParaRevisao || currentItem.status === "awaiting_final_review" ? null : await storage.createNotification({
        type: "arteApproved",
        message: `⚠ Arquivo final atualizado: ${item.type}${event ? ` — ${event.name}` : ""} (verifique antes de produzir)`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["grafica"],
      });
      if (voltaParaRevisao) {
        const saiuDaFila = await storage.createNotification({
          type: "itemRejected",
          message: `${item.displayId ?? item.type} saiu da fila: a Arte trocou o arquivo final e a peça voltou para a Revisão Final`,
          eventId: item.eventId,
          itemId: item.id,
          targetRoles: ["grafica"],
        });
        broadcast({ type: "notification_created", notification: saiuDaFila });
      }

      broadcast({ type: "item_updated", item });
      if (notification) broadcast({ type: "notification_created", notification });

      // ── Propaga a arte nova para os COMPLEMENTOS vivos ────────────────────
      // O complemento é a MESMA peça, com a mesma arte — só a quantidade é
      // nova. Sem propagar, #0062-C1 continuaria carregando o arquivo antigo e
      // a Gráfica imprimiria a versão errada: refugo real, dinheiro perdido,
      // e o pior tipo de erro (nada na tela indica que está errado).
      // Só alcança complementos que ainda NÃO foram produzidos — reescrever a
      // arte de um lote já impresso seria mentir sobre o que está no galpão.
      try {
        const complementos = await storage.getLiveComplements(item.id);
        const aindaNaoImpressos = complementos.filter(
          (c) => (c.quantityProduced ?? 0) === 0 && (c.reuseQty ?? 0) === 0,
        );
        for (const c of aindaNaoImpressos) {
          await storage.updateItem(c.id, {
            finalFileUrl: item.finalFileUrl,
            finalFileName: item.finalFileName,
            finalPreviewUrl: item.finalPreviewUrl,
            finalFileUpdatedAt: item.finalFileUpdatedAt,
            previousFinalFileUrl: prevUrl,
            previousFinalFileName: prevName,
          });
          await createAuditLog(
            req,
            'updated', 'item', c.id,
            `Arquivo final propagado da peça original ${item.displayId} (arte substituída pela Arte)`,
          );
        }
        if (aindaNaoImpressos.length > 0) {
          const notifCompl = await storage.createNotification({
            type: "arteApproved",
            message: `⚠ Arquivo final atualizado também no(s) complemento(s) ${aindaNaoImpressos.map(c => c.displayId).join(", ")} — verifique antes de produzir`,
            eventId: item.eventId,
            itemId: aindaNaoImpressos[0].id,
            targetRoles: ["grafica"],
          });
          broadcast({ type: "production_updated", item: aindaNaoImpressos[0] });
          broadcast({ type: "notification_created", notification: notifCompl });
        }
      } catch (e) {
        // Migração pendente (42703) ou falha na propagação não pode derrubar a
        // troca de arquivo da peça principal, que já foi commitada.
        console.error("[COMPLEMENTOS] falha ao propagar arquivo final:", mensagemDoErro(e));
      }

      // `voltouParaRevisao`: a tela diz no aviso que a peça saiu da Gráfica.
      res.json({ ...item, voltouParaRevisao: voltaParaRevisao });
    } catch (error) {
      sendSensitiveError(res, error, "Trocar arquivo final", 500);
    }
  });
}
