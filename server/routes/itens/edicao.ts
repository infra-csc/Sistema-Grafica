// O PATCH genérico da peça — edição de dados, nunca de status.
import type { Express } from "express";
import { storage } from "../../storage";
import { trocaDeMoldeProibida, ERRO_TROCA_DE_MOLDE, tipoCanonico } from "@shared/molde";
import { requireAuth, broadcast, createAuditLog, updateEventStatus } from "../shared";
import { responderErro } from "../../erros";
// Régua do thumb (só objeto do nosso storage): ./thumb-url.ts.
import { urlDeThumbValida, ERRO_THUMB_FORA_DO_STORAGE } from "../thumb-url";
import { barraEventoFinalizado } from "../eventoFinalizado";
import {
  updateItemSchema, normalizarReferencias, planejarEdicao, descreverEdicao, avisarDepoisDaEdicao,
} from "../../services/edicao-da-peca";

/**
 * Quem muda o CAMINHO da peça pelo PATCH genérico — dispensar a aprovação do
 * patrocinador e marcar reaproveitamento. Decisão do dono: os mesmos que
 * decidem prioridade (quem gerencia a lista); Arte e Atendimento não.
 */
const PAPEIS_DO_CAMINHO_DA_PECA: readonly string[] = ["admin", "solicitacao"];

/** PATCH /api/items/:id (desvia bulk-* com next). */
export function registrarEdicao(app: Express): void {
  // Update item
  app.patch("/api/items/:id", requireAuth, async (req, res, next) => {
    try {
      // As rotas de lote (/api/items/bulk-return-to-arte, bulk-cancel,
      // bulk-creator-reject) são registradas DEPOIS desta — sem este desvio o
      // Express casava :id = "bulk-..." e as três ficavam INALCANÇÁVEIS
      // ("Devolver Selecionadas" nunca chegou ao handler certo).
      if (req.params.id.startsWith("bulk-")) return next();

      // Gate de papel: quem edita peça é quem gerencia a lista (admin,
      // solicitação, criador do evento) ou os papéis com edições pontuais no
      // fluxo (arte: thumbs/refs; atendimento: vinculação). Gráfica usa as
      // rotas dedicadas de conferir/entregar — estava tudo aberto via PATCH.
      const role = req.userRole ?? "";
      if (!["admin", "solicitacao", "arte", "atendimento"].includes(role)) {
        const existing = await storage.getItem(req.params.id);
        if (!existing) return res.status(404).json({ error: "Peça não encontrada" });
        const parentEvent = await storage.getEvent(existing.eventId);
        if (!parentEvent || parentEvent.createdBy !== req.userId) {
          return res.status(403).json({ error: "Sem permissão para editar esta peça" });
        }
      }

      // Allow-list explícita: barra `status` e campos de fluxo (ver
      // updateItemSchema). Transições de status só pelas rotas dedicadas.
      const validatedData = updateItemSchema.parse(req.body);

      // O arquivo final tem rotas próprias com gate de status (submit/update-
      // final-file). Pelo PATCH genérico, arte/atendimento não trocam o
      // arquivo que a Gráfica imprime — admin/solicitação (gestores da lista)
      // seguem podendo para correções administrativas.
      if (["arte", "atendimento"].includes(role) &&
          ("finalFileUrl" in validatedData || "finalFileName" in validatedData)) {
        return res.status(403).json({
          error: "Arquivo final só pode ser alterado pela rota de envio da Arte (com validação de status)."
        });
      }

      // Referências normalizadas para /objects/, com ACL de quem enviou.
      await normalizarReferencias(validatedData, req.userId!);

      // Pegar item atual antes de atualizar
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }
      // PRIORIDADE DA PEÇA (dono, 27/08): quem decide o que fura a fila da
      // Arte é quem gerencia a lista — admin e Solicitação. O gate dispara só
      // quando o valor MUDA: o formulário manda o form inteiro no spread, e
      // arte/atendimento editando thumb não podem quebrar por um campo que
      // não tocaram.
      if (validatedData.isPriority !== undefined
          && !!validatedData.isPriority !== !!currentItem.isPriority
          && !["admin", "solicitacao"].includes(role)) {
        return res.status(403).json({ error: "Marcar peça como prioritária é do admin e da Solicitação." });
      }
      // DISPENSAR APROVAÇÃO e REAPROVEITAR mudam o caminho da peça (pula o
      // patrocinador; pula a impressão) — decisão de quem gerencia a lista,
      // como a prioridade. Arte e Atendimento editam thumb/referência por
      // aqui e mandam o form inteiro: o gate só dispara quando o valor MUDA.
      const mudaDispensa = validatedData.skipApproval !== undefined && !!validatedData.skipApproval !== !!currentItem.skipApproval;
      const mudaReuso = validatedData.isReuse !== undefined && !!validatedData.isReuse !== !!currentItem.isReuse;
      if ((mudaDispensa || mudaReuso) && !PAPEIS_DO_CAMINHO_DA_PECA.includes(role)) {
        return res.status(403).json({
          error: mudaDispensa
            ? "Dispensar a aprovação do patrocinador é do admin e da Solicitação."
            : "Marcar reaproveitamento é do admin e da Solicitação.",
        });
      }
      // ANDA: este PATCH mexe em quantidade, material, dimensões e m² — o
      // contrato da peça. Num evento que já acabou, mudar o contrato só
      // reescreve o que foi fechado.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // MOLDE (revisão 22/09): o tipo não cruza a fronteira do molde fora do
      // rascunho — o fluxo curto e o comum não se conhecem (shared/molde.ts).
      if (trocaDeMoldeProibida(currentItem, validatedData.type)) {
        return res.status(409).json({ error: ERRO_TROCA_DE_MOLDE, code: "TROCA_DE_MOLDE" });
      }
      // "MOLDE", "moldes" → "Molde" (o nome que a lista e a importação gravam).
      if (typeof validatedData.type === "string" && validatedData.type) validatedData.type = tipoCanonico(validatedData.type);

      // THUMB pelo PATCH genérico: a mesma régua das rotas de envio — só
      // objeto do nosso storage (thumb-url.ts). Vazio/null = limpar, passa; o
      // MESMO valor que já está gravado também passa (o formulário manda o
      // form inteiro, e um thumb legado não pode travar a edição de outro campo).
      if (validatedData.approvalThumbUrl && validatedData.approvalThumbUrl !== currentItem.approvalThumbUrl) {
        const thumb = urlDeThumbValida(validatedData.approvalThumbUrl);
        if (!thumb) return res.status(400).json({ error: ERRO_THUMB_FORA_DO_STORAGE });
        validatedData.approvalThumbUrl = thumb;
      }

      // A regra da edição (quantidade, reaproveitamento, campos derivados):
      // services/edicao-da-peca.ts. Recusa volta com o status e o corpo prontos.
      const plano = planejarEdicao(currentItem, validatedData, req.body, mudaReuso);
      if ("recusa" in plano) return res.status(plano.recusa.status).json(plano.recusa.corpo);
      const { updatePayload, mudouQtd, promoveuParaProduzido } = plano;

      const item = await storage.updateItem(req.params.id, updatePayload);
      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      const auditDetails = descreverEdicao(currentItem, item, validatedData, { mudaReuso, mudouQtd, promoveuParaProduzido });

      await createAuditLog(
        req,
        'updated',
        'item',
        item.id,
        auditDetails
      );
      
      // Recalculate event status if item status changed
      await updateEventStatus(item.eventId);

      broadcast({ type: "item_updated", item });

      await avisarDepoisDaEdicao(currentItem, item, validatedData, mudouQtd);

      res.json(item);
    } catch (error: any) {
      responderErro(res, error, "editar peça");
    }
  });
}
