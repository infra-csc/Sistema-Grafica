// ─────────────────────────────────────────────────────────────────────────────
// MOLDE — as rotas do fluxo curto (dono, 22/09). A regra mora em shared/molde.ts;
// aqui só os gestos que gravam:
//
//   · enviarMoldeParaRevisao — chamado pelo PATCH /submit-for-approval quando a
//     peça é molde: o thumb vai DIRETO para a Revisão Final (sem aprovação de
//     patrocinador, sem finalização, sem notificar o Atendimento);
//   · PATCH /api/items/:id/molde-produzido — a Gráfica marca o molde liberado
//     como produzido (a peça inteira, sem impressora). É o FIM do fluxo dele;
//   · PATCH /api/items/:id/molde-voltar-liberado — desfaz o "produzido"
//     enquanto ninguém mexeu (admin | grafica).
//
// Os papéis e bloqueios são os mesmos de quem imprime: grafica|admin, evento
// finalizado barra (409), peça em revisão não anda.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import type { Item } from "@shared/schema";
import { requireAuth, broadcast, createAuditLog, translateStatus, updateEventStatus } from "./shared";
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA } from "@shared/trava-da-peca";
import { barraEventoFinalizado } from "./eventoFinalizado";
import { invalidarCacheDeVersoes } from "./versoes";
import { responderFalha, PECA_NAO_ENCONTRADA } from "../erros";
import {
  ehMolde, gestoDoMolde, moldeConcluido, quantidadeProduzidaDoMolde,
  DESTINO_DO_ENVIO_DO_MOLDE, TRILHA_ENVIO_DO_MOLDE, TRILHA_MOLDE_PRODUZIDO, TRILHA_MOLDE_DESFEITO,
} from "@shared/molde";

/**
 * O envio da Arte, para o molde. A rota de envio já validou papel, status
 * (`awaiting_submission`), evento e o thumb — este é só o destino diferente.
 * Patrocinador vinculado não importa: o molde não passa por aprovação.
 */
export async function enviarMoldeParaRevisao(req: Request, res: Response, currentItem: Item, thumbNormalizado: string) {
  const item = await storage.updateItem(currentItem.id, {
    status: DESTINO_DO_ENVIO_DO_MOLDE,
    approvalThumbUrl: thumbNormalizado,
    rejectedByCreator: false,
  });
  if (!item) return res.status(404).json({ error: PECA_NAO_ENCONTRADA });

  // A versão da arte — uma linha por envio, como nas outras peças.
  await storage.createItemArtVersion({ itemId: item.id, thumbUrl: thumbNormalizado, origem: "envio", createdBy: req.userName ?? null });
  invalidarCacheDeVersoes();

  await createAuditLog(
    req, "updated", "item", item.id,
    `${TRILHA_ENVIO_DO_MOLDE} — Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus(DESTINO_DO_ENVIO_DO_MOLDE)}`,
  );

  // Quem age agora é a Revisão Final (Solicitação). Nenhum aviso ao
  // Atendimento nem ao portal do patrocinador — molde não é aprovado por ele.
  const event = await storage.getEvent(item.eventId);
  const notification = await storage.createNotification({
    type: "arteApproved",
    message: `Molde pronto para a Revisão Final: ${item.type} - Evento: ${event?.name}`,
    eventId: item.eventId,
    itemId: item.id,
    targetRoles: ["solicitacao"],
  });

  broadcast({ type: "item_updated", item });
  broadcast({ type: "notification_created", notification });
  return res.json(item);
}

// Predicado PURO de papel (função de uma linha): é a forma que o leitor da
// régua (server/permissoes-scan.ts) entende — as duas rotas abaixo aparecem
// em shared/permissoes.ts e o teste confere que dizem o mesmo.
function podeProduzir(req: Request): boolean {
  return req.userRole === "grafica" || req.userRole === "admin";
}

/**
 * Recalcula o evento e, se ESTE gesto o concluiu, avisa a Solicitação — o
 * mesmo aviso `eventCompleted` que a entrega do tubo dá (tubos.ts). Para o
 * molde, "produzido" é o fim: um evento cuja última pendência era um molde
 * termina aqui, e sem isto terminava calado (revisão 22/09).
 */
async function recalcularEventoEAvisar(eventId: string | null | undefined) {
  if (!eventId) return;
  const antes = await storage.getEvent(eventId);
  await updateEventStatus(eventId);
  const depois = await storage.getEvent(eventId);
  if (antes?.status !== "completed" && depois?.status === "completed") {
    const notification = await storage.createNotification({
      type: "eventCompleted",
      message: `Evento concluído: ${depois?.name} - Todos os itens foram entregues`,
      eventId,
      targetRoles: ["solicitacao"],
    });
    broadcast({ type: "notification_created", notification });
  }
}

export function registerMoldeRoutes(app: Express): void {
  // A Gráfica marca o molde como PRODUZIDO — liberado → produced, direto.
  app.patch("/api/items/:id/molde-produzido", requireAuth, async (req, res) => {
    try {
      if (!podeProduzir(req)) {
        return res.status(403).json({ error: "Apenas usuários com perfil Gráfica podem marcar o molde como produzido" });
      }
      const atual = await storage.getItem(req.params.id);
      if (!atual || atual.deletedAt) return res.status(404).json({ error: PECA_NAO_ENCONTRADA });
      if (!ehMolde(atual)) {
        return res.status(409).json({ error: "Esta peça não é um molde — a produção dela segue pela impressora (Imprimir)." });
      }
      // Clique repetido / lista desatualizada: já está produzido — não é erro.
      if (moldeConcluido(atual)) return res.json(atual);
      // ANDA: o molde fica pronto — mesma guarda de quem imprime.
      if (await barraEventoFinalizado(atual, res)) return;
      if (gestoDoMolde(atual) !== "produzir") {
        return res.status(409).json({
          error: `O molde só pode ser marcado como produzido depois de liberado pela Revisão Final. Status atual: ${translateStatus(atual.status)}`,
        });
      }
      // TRAVA DA SOLICITAÇÃO: o mesmo predicado do start-printing — travada não anda.
      if (pecaTravada(atual as any)) return res.status(409).json({ error: fraseDaTrava(atual as any), code: CODIGO_PECA_TRAVADA });

      const item = await storage.updateItem(atual.id, {
        status: "produced",
        quantityProduced: quantidadeProduzidaDoMolde(atual),
        ...(!atual.producedAt ? { producedAt: new Date() } : {}),
      });
      if (!item) return res.status(404).json({ error: PECA_NAO_ENCONTRADA });

      await createAuditLog(
        req, "produced", "item", item.id,
        `${TRILHA_MOLDE_PRODUZIDO} (${translateStatus(atual.status)} → Produzido) — ${item.quantityProduced ?? 0} un.`,
      );
      // O molde produzido é o fim do fluxo: o evento pode ter acabado agora.
      await recalcularEventoEAvisar(item.eventId);
      broadcast({ type: "item_updated", item });
      return res.json(item);
    } catch (error) {
      return responderFalha(res, error, "PATCH /api/items/:id/molde-produzido");
    }
  });

  // DESFAZER — "Voltar para liberado", enquanto ninguém mexeu.
  app.patch("/api/items/:id/molde-voltar-liberado", requireAuth, async (req, res) => {
    try {
      if (!podeProduzir(req)) {
        return res.status(403).json({ error: "Apenas a Gráfica ou um administrador pode desfazer o produzido do molde" });
      }
      const atual = await storage.getItem(req.params.id);
      if (!atual || atual.deletedAt) return res.status(404).json({ error: PECA_NAO_ENCONTRADA });
      if (!ehMolde(atual)) return res.status(409).json({ error: "Esta peça não é um molde" });
      // Já liberado: nada a desfazer (clique repetido).
      if (gestoDoMolde(atual) === "produzir") return res.json(atual);
      if (await barraEventoFinalizado(atual, res)) return;
      // TRAVA DA SOLICITAÇÃO (revisão 22/09): travada não se mexe — nem para
      // trás. (Recuar da impressora é liberado porque a peça não pode prender
      // a máquina; aqui não há máquina a liberar, só o estado a reescrever.)
      if (pecaTravada(atual)) return res.status(409).json({ error: fraseDaTrava(atual), code: CODIGO_PECA_TRAVADA });
      if (gestoDoMolde(atual) !== "desfazer") {
        return res.status(409).json({ error: `Não dá para voltar este molde para liberado. Status atual: ${translateStatus(atual.status)}` });
      }
      const item = await storage.updateItem(atual.id, {
        status: "ready_for_production",
        quantityProduced: 0,
        producedAt: null,
      });
      if (!item) return res.status(404).json({ error: PECA_NAO_ENCONTRADA });
      await createAuditLog(req, "updated", "item", item.id, `${TRILHA_MOLDE_DESFEITO} — Produzido → ${translateStatus("ready_for_production")}`);
      if (item.eventId) await updateEventStatus(item.eventId);
      broadcast({ type: "item_updated", item });
      return res.json(item);
    } catch (error) {
      return responderFalha(res, error, "PATCH /api/items/:id/molde-voltar-liberado");
    }
  });
}
