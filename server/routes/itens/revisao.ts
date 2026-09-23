// Revisão Final: liberar para produção e as devoluções (Arte, solicitante, Gráfica).
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { type Item, items as itemsTable, auditLogs, notifications } from "@shared/schema";
// TRAVA DA SOLICITAÇÃO (21/09): o que faz a peça andar na Gráfica é barrado
// com 409 e a frase humana; ver shared/trava-da-peca.ts.
import { pecaTravada, fraseDaTrava, CODIGO_PECA_TRAVADA, colunasDoDestravar } from "@shared/trava-da-peca";
// Trocar arquivo final/thumb depois que a peça andou, e quem decide na Revisão.
import { ARTE_DECIDE_NA_REVISAO } from "@shared/troca-de-material";
import { respostaDoEstoqueParaLiberar, marcarRespostaAplicada } from "../../services/consultaDeEstoqueNaLiberacao";
import { trilhaDaLiberacaoComEstoque, SOLICITACAO_AO_ESTOQUE_ATIVA } from "@shared/consultas-de-estoque";
import { DEPOIS_DA_ARTE } from "@shared/fluxo-peca";
import { ehMolde, destinoDaDevolucao, dispensaArquivoFinal } from "@shared/molde";
import {
  requireAuth,
  broadcast,
  translateStatus,
  sendSensitiveError,
  createAuditLog,
  createAuditLogsEmLote,
  resolveActor,
} from "../shared";
import { motivoEventoFechado, barraEventoFinalizado, contadorDeBloqueio } from "../eventoFinalizado";
import { lerMotivoDevolucao, type DestinoDevolucao, lerDestinoDevolucao } from "./comum";
import { responderFalha, camposDoErro } from "../../erros";
import { vemDeOrigemValida } from "@shared/maquina-de-estados";

/**
 * Os campos que cada destino grava.
 *
 * `arte` REFAZ do zero: apaga o thumb e o arquivo final e devolve a peca para
 * "Aguardando envio", zerando a aprovacao do patrocinador — arte nova precisa
 * de aprovacao nova, e manter o "aprovado" de uma versao que nao existe mais
 * seria carimbar um sim que ninguem deu.
 *
 * `finalizacao` mantem o thumb JA APROVADO e so limpa o arquivo final.
 */
function camposDoDestino(destino: DestinoDevolucao, rodadaAprovada: boolean, peca?: { type?: string | null }) {
  // MOLDE: o thumb é o ÚNICO material dele (não há arquivo final nem
  // aprovação). Apagá-lo na devolução jogava fora o molde inteiro — ele volta
  // para o começo da Arte com o thumb, que a Arte corrige e reenvia.
  if (peca && ehMolde(peca)) {
    return {
      status: "awaiting_submission",
      finalFileUrl: null,
      sponsorApprovedBy: null,
      sponsorApprovedAt: null,
    };
  }
  if (destino === "arte") {
    return {
      status: "awaiting_submission",
      approvalThumbUrl: null,
      finalFileUrl: null,
      sponsorApprovedBy: null,
      sponsorApprovedAt: null,
    };
  }
  return {
    // A REGRA DO DONO (24/08, caso #4176): linha de patrocinador "Aguardando"
    // ⇒ a peça volta PENDENTE no Atendimento. Este destino devolvia SEMPRE a
    // `sponsor_approved` — inclusive com a rodada de aprovação aberta por
    // baixo (aprovação revogada no meio do caminho): a peça pulava a fila do
    // Atendimento e ficava "aprovada" com patrocinador pendente, sem nenhum
    // botão que a trouxesse de volta.
    status: rodadaAprovada ? "sponsor_approved" : "awaiting_sponsor_approval",
    finalFileUrl: null,
  };
}

/**
 * A rodada de aprovação desta peça está fechada? (todas as linhas aprovadas;
 * peça isenta ou sem patrocinador conta como fechada — não há quem aprovar.)
 * É o que decide se a devolução para "finalizacao" pode pousar em
 * `sponsor_approved` ou se a peça tem de voltar à fila do Atendimento.
 */
async function rodadaDeAprovacaoFechada(item: { id: string; skipApproval?: boolean | null }): Promise<boolean> {
  if (item.skipApproval) return true;
  const linhas = await storage.getItemSponsorApprovals(item.id);
  if (linhas.length === 0) return true;
  return linhas.every((l) => l.status === "approved");
}

/**
 * O que a devolução da REVISÃO FINAL grava — uma função só para a individual
 * e o lote, que já tinham divergido (o lote não marcava `hasModifiedData` e
 * a Arte não via o aviso de dados modificados). O destino pedido passa por
 * `destinoDaDevolucao`: molde volta sempre para o começo da Arte.
 */
async function camposDaDevolucaoDaRevisao(peca: Item, destino: DestinoDevolucao, notes: string) {
  const destinoEfetivo = destinoDaDevolucao(destino, peca);
  const campos = {
    ...camposDoDestino(destinoEfetivo, await rodadaDeAprovacaoFechada(peca), peca),
    creatorReviewedAt: null,
    rejectedByCreator: true,
    // O motivo SUBSTITUI a observação: motivo novo não convive com o
    // feedback de uma devolução anterior.
    observations: notes,
    rejectionReason: notes,
    hasModifiedData: true, // a Arte precisa revisar os dados da peça
  };
  return { destinoEfetivo, campos };
}

/** A frase da auditoria — o destino escolhido precisa ficar no registro. */
function textoDoDestino(destino: DestinoDevolucao): string {
  return destino === "arte"
    ? "volta para o comeco da Arte (refazer a arte)"
    : "volta para a finalizacao (trocar o arquivo final)";
}

/** Revisão Final: liberar e devolver (inclusive em lote). */
export function registrarRevisao(app: Express): void {
  // Creator reviews and releases item for production (Solicitação module)
  app.patch("/api/items/:id/creator-review", requireAuth, async (req, res) => {
    try {
      // Quem decide na Revisão Final é a Solicitação (e o admin) — a Arte não
      // libera o próprio trabalho (ARTE_DECIDE_NA_REVISAO, decisão do dono).
      if (req.userRole !== "solicitacao" && req.userRole !== "admin" && !(ARTE_DECIDE_NA_REVISAO && req.userRole === "arte")) {
        return res.status(403).json({ error: "Só a Solicitação libera peça na Revisão Final." });
      }
      
      // Validate current status
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      
      // ANDA: liberar para produção é o gesto que autoriza imprimir. Vem ANTES
      // do atalho idempotente logo abaixo de propósito — num evento finalizado
      // a resposta certa é 409, e não um 200 silencioso.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // Idempotente: se a peça JÁ foi liberada (ou já avançou na produção), não
      // é erro clicar "Liberar" de novo (lista desatualizada / clique duplo) —
      // só devolve a peça como sucesso, sem reprocessar.
      const alreadyReleased = vemDeOrigemValida(currentItem.status, "liberar-o-que-ja-foi-liberado");
      if (alreadyReleased) {
        return res.json(currentItem);
      }
      if (!vemDeOrigemValida(currentItem.status, "liberar-para-producao")) {
        return res.status(409).json({
          error: `A peça não está na Revisão Final (etapa atual: ${translateStatus(currentItem.status)}) — atualize a tela.`
        });
      }

      // PEÇA TRAVADA PELA SOLICITAÇÃO: liberar é fazê-la andar, então quem
      // libera tem de dizer o que faz com a trava — { destravar: true } libera
      // e destrava na mesma gravação; { manterTrava: true } libera e ela chega
      // à Gráfica ainda travada (lá ela não anda até alguém destravar). Sem
      // nenhum dos dois é 409 com o código da trava: a tela pergunta.
      const travada = pecaTravada(currentItem as any);
      const destravar = travada && req.body?.destravar === true;
      if (travada && !destravar && req.body?.manterTrava !== true) {
        return res.status(409).json({ error: `${fraseDaTrava(currentItem as any)}. Escolha liberar destravando ou liberar mantendo a trava.`, code: CODIGO_PECA_TRAVADA });
      }

      // Reaproveitamento parcial: body pode trazer { reuseQty } quando a Solicitação
      // quer reaproveitar só algumas unidades, enviando o restante para produção.
      const pedidoNoCorpo = req.body?.reuseQty != null ? Number(req.body.reuseQty) : undefined;
      // SOLICITAÇÃO AO ESTOQUE (dono, 21/09): "as respostas do reaproveitar têm
      // que aparecer na REVISÃO, e é ELA que segue com o item… tem que vir
      // SUGERIDO de acordo com a resposta do estoque e ela só CONFIRMAR". Se a
      // Gráfica atendeu N un. e a resposta ainda não foi aplicada, liberar SEM
      // nada no corpo (um clique, o lote, a linha) leva as N como
      // reaproveitamento. { reuseQty, peloEstoque: true } é o "usar menos do
      // que o estoque atendeu": de 0 até N, nunca mais. Corpo com reuseQty SEM
      // a marca é o caminho antigo ("já conferi — aplicar agora"), que manda.
      // CHAVE DESLIGADA (dono, 21/09 — segurar): nem lê a tabela; `doEstoque`
      // fica null e a liberação é exatamente a de antes da solicitação ao
      // estoque — nada dela roda dentro da transação abaixo.
      const doEstoque = SOLICITACAO_AO_ESTOQUE_ATIVA && !currentItem.isReuse ? await respostaDoEstoqueParaLiberar(currentItem.id) : null;
      let usadasDoEstoque: number | null = null;
      // A tela mandou "usar N do estoque" mas a resposta não existe mais (já
      // aplicada, cancelada): não vira reaproveitamento sem lastro.
      if (SOLICITACAO_AO_ESTOQUE_ATIVA && req.body?.peloEstoque === true && !doEstoque) {
        return res.status(409).json({ error: "A resposta do estoque desta peça não está mais disponível — atualize a tela antes de liberar." });
      }
      if (doEstoque && req.body?.peloEstoque === true && pedidoNoCorpo != null) {
        if (!Number.isInteger(pedidoNoCorpo) || pedidoNoCorpo < 0 || pedidoNoCorpo > doEstoque.atendida) {
          return res.status(409).json({ error: `O estoque atendeu ${doEstoque.atendida} un. — dá para usar de 0 a ${doEstoque.atendida}, nunca mais.` });
        }
        usadasDoEstoque = pedidoNoCorpo;
      } else if (doEstoque && pedidoNoCorpo == null) {
        usadasDoEstoque = Math.min(doEstoque.atendida, currentItem.quantity);
      }
      const rawReuseQty = usadasDoEstoque != null ? usadasDoEstoque : pedidoNoCorpo;
      const askedReuse = rawReuseQty != null && !isNaN(rawReuseQty) && rawReuseQty > 0;
      // Pedir a quantidade inteira pelo campo do parcial é reaproveitamento
      // total. Antes esse caso caía fora das duas condições e a peça seguia para
      // produção como se nada tivesse sido pedido, sem aviso nenhum.
      const isFullReuse = currentItem.isReuse || (askedReuse && rawReuseQty! >= currentItem.quantity);
      const isPartialReuse = askedReuse && !isFullReuse;

      // O botão do client já exige arquivo final, mas a liberação em lote e o
      // atalho de teclado chegavam aqui sem ele — e uma peça sem arquivo
      // liberada para produção trava a Gráfica. Reaproveitamento TOTAL
      // dispensa (não produz nada); parcial produz o restante e precisa.
      // MOLDE (22/09) não tem arquivo final: é liberado só com o thumb.
      if (!currentItem.finalFileUrl && !isFullReuse && !dispensaArquivoFinal(currentItem)) {
        return res.status(409).json({
          error: "A peça ainda não tem arquivo final — a Arte precisa enviá-lo antes da liberação."
        });
      }

      // Peças de reaproveitamento total não passam pela produção: já entram como produzidas.
      // Reaproveitamento parcial vai para ready_for_production (as demais unidades precisam produzir).
      const nextStatus = isFullReuse ? "produced" : "ready_for_production";

      // Pre-fetch event for notification message (read outside tx — no lock needed)
      const event = await storage.getEvent(currentItem.eventId);

      const auditDetails = isFullReuse
        ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("produced")} (reaproveitamento — não precisa produzir)`
        : isPartialReuse
          ? `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (reaproveitamento parcial: ${rawReuseQty} un. de ${currentItem.quantity}, ${currentItem.quantity - rawReuseQty!} a produzir)`
          : `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("ready_for_production")} (liberado para produção)`;

      // Atomic: item update + audit log + notification.
      const { item, notification } = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(itemsTable)
          .set({
            status: nextStatus,
            creatorReviewedAt: new Date(),
            hasModifiedData: false,
            updatedAt: new Date(),
            ...(isPartialReuse ? { reuseQty: rawReuseQty!, isReuse: false } : {}),
            ...(isFullReuse ? { reuseQty: currentItem.quantity, isReuse: true } : {}),
            ...(destravar ? colunasDoDestravar() : {}),
          })
          .where(eq(itemsTable.id, req.params.id))
          .returning();
        if (!updated) throw Object.assign(new Error("Peça não encontrada."), { httpStatus: 404 });

        if (destravar) {
          await tx.insert(auditLogs).values({
            ...resolveActor(req),
            action: "updated",
            entityType: "item",
            entityId: updated.id,
            details: `Destravada na liberação da Revisão Final (${resolveActor(req).userName})`,
          });
        }

        await tx.insert(auditLogs).values({
          ...resolveActor(req),
          action: "approved",
          entityType: "item",
          entityId: updated.id,
          details: auditDetails,
        });

        // A resposta do estoque vira reaproveitamento NA MESMA transação da
        // liberação: ou as duas coisas valem, ou nenhuma.
        if (doEstoque) {
          await marcarRespostaAplicada(tx, doEstoque.id);
          if (usadasDoEstoque != null) {
            await tx.insert(auditLogs).values({
              ...resolveActor(req),
              action: "updated",
              entityType: "item",
              entityId: updated.id,
              details: trilhaDaLiberacaoComEstoque(usadasDoEstoque, doEstoque.atendida, doEstoque.pedida, doEstoque.respondidoPor),
            });
          }
        }

        const [notif] = await tx.insert(notifications).values({
          type: "arteApproved",
          message: `Criador do evento liberou item para produção: ${updated.type} - Evento: ${event?.name}`,
          eventId: updated.eventId,
          itemId: updated.id,
          targetRoles: ["arte"], // só quem AGE agora: a Gráfica entra bem depois, quando liberam p/ produção
        }).returning();

        return { item: updated, notification: notif };
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      
      res.json(item);
    } catch (error) {
      // Erro nosso (404 de dentro da transação) tem frase pronta; o resto não
      // vaza texto do banco para a tela.
      const erro = camposDoErro(error);
      if (erro.httpStatus) return res.status(erro.httpStatus).json({ error: erro.message });
      sendSensitiveError(res, error, "Liberar na Revisão Final", 500);
    }
  });

  // As rotas PATCH /api/items/:id/creator-reject e /api/items/bulk-creator-reject
  // FORAM REMOVIDAS: nenhuma tela as chamava, e eram uma segunda porta para a
  // mesma devolução da Revisão (return-to-arte / bulk-return-to-arte) com
  // regras que já tinham divergido. Ficou uma porta só.

  // ─── Arte devolve a peça para o COMEÇO do fluxo ──────────────────────────
  //
  // As outras cinco portas devolvem a peça para "Aguardando Envio", ou seja,
  // para a própria Arte refazer. Esta é a única que devolve para QUEM PEDIU.
  // Regra do dono: "ela entra como rascunho e a pessoa que cria a peça decide
  // se continua ou descarta o item" — por isso `draft` e não `requested`:
  // rascunho é o único estado em que o solicitante pode mexer em tudo e do
  // qual pode simplesmente desistir.
  //
  // O thumb e o arquivo final NÃO são apagados. A peça pode voltar igual, e
  // jogar fora o trabalho da Arte por precaução obrigaria a refazê-lo à toa;
  // se o solicitante mudar tipo ou medida, o fluxo normal já pede arte nova.
  app.patch("/api/items/:id/arte-reject", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "arte" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas usuários com perfil Arte podem devolver a peça para o solicitante" });
      }

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      // ANDA: devolver para o começo do fluxo é criar trabalho novo para o
      // solicitante, numa fila que não mostra mais essa peça.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // DE QUALQUER ESTADO (decisão do dono, 24/08).
      //
      // A trava anterior era de cinco status pré-produção: depois que a Gráfica
      // encostava na peça, a Arte não conseguia mais mandá-la de volta. A
      // objeção que a sustentava continua verdadeira — uma peça em produção
      // existe no mundo, e voltar para rascunho tira da fila da Gráfica um
      // trabalho que talvez já esteja impresso — mas quem opera decidiu que
      // errar o arquivo depois da produção é justamente quando devolver mais
      // importa, e a trava obrigava a pedir para um admin.
      //
      // O que NÃO é apagado: nada de produção. O status volta, o histórico
      // fica, e a trilha nomeia de onde a peça veio — é o que permite entender
      // depois por que a Gráfica perdeu uma linha da fila.
      //
      // O único estado recusado é o próprio rascunho: devolver o que já está na
      // criação não muda nada e ainda zeraria os campos de aprovação abaixo.
      // (shared/maquina-de-estados.ts: "devolver-ao-solicitante" parte de todo status menos o rascunho)
      if (!vemDeOrigemValida(currentItem.status, "devolver-ao-solicitante")) {
        return res.status(409).json({
          error: "Esta peça já está na criação (Rascunho) — não há para onde devolver.",
        });
      }

      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);

      const item = await storage.updateItem(req.params.id, {
        status: "draft",
        rejectionReason: motivo.motivo,
        // Zera o estado de aprovação/revisão: se a peça voltar a andar, ela
        // recomeça o trâmite em vez de herdar um "aprovado" de outra versão.
        sponsorApprovedBy: null,
        sponsorApprovedAt: null,
        creatorReviewedAt: null,
        rejectedBySponsor: false,
        rejectedByCreator: false,
      });

      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Status alterado: ${translateStatus(currentItem.status)} → ${translateStatus("draft")} (devolvida pela Arte ao solicitante${DEPOIS_DA_ARTE.has(currentItem.status) ? ", JÁ FORA DA ARTE" : ""}). Motivo: ${motivo.motivo}`
      );

      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `A Arte devolveu a peça para rascunho: ${item.type} — Evento: ${event?.name}. Motivo: ${motivo.motivo}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });

      res.json(item);
    } catch (error) {
      responderFalha(res, error, "PATCH /api/items/:id/arte-reject", 400);
    }
  });

  // A Revisão Final devolve a peça para a Arte, com o motivo e o destino.
  app.patch("/api/items/:id/return-to-arte", requireAuth, async (req, res) => {
    try {
      // Quem decide na Revisão Final é a Solicitação (e o admin) — ver
      // ARTE_DECIDE_NA_REVISAO (decisão do dono).
      if (req.userRole !== "solicitacao" && req.userRole !== "admin" && !(ARTE_DECIDE_NA_REVISAO && req.userRole === "arte")) {
        return res.status(403).json({ error: "Só a Solicitação devolve peça na Revisão Final." });
      }

      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const destino = lerDestinoDevolucao(req);
      const notes = motivo.motivo;
      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }

      // ANDA: devolver para a Arte com observações é pedir retrabalho.
      if (await barraEventoFinalizado(currentItem, res)) return;

      // De onde a ação pode partir: shared/maquina-de-estados.ts.
      if (!vemDeOrigemValida(currentItem.status, "devolver-para-a-arte")) {
        return res.status(409).json({ error: `A peça não está mais na Revisão Final (etapa atual: ${translateStatus(currentItem.status)}) — atualize a tela.` });
      }

      const { destinoEfetivo, campos } = await camposDaDevolucaoDaRevisao(currentItem, destino, notes);
      const item = await storage.updateItem(req.params.id, campos);

      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }

      const event = await storage.getEvent(item.eventId);
      const detailMsg = notes ? ` Observações: ${notes}` : "";
      const modifiedDataMsg = currentItem.hasModifiedData ? " ⚠️ DADOS MODIFICADOS: Verifique Quantidade, m² Total e Medida!" : "";

      await createAuditLog(
        req,
        'rejected',
        'item',
        item.id,
        `Item devolvido para Arte para modificações (${textoDoDestino(destinoEfetivo)}).${detailMsg}${modifiedDataMsg}`
      );

      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Criador devolveu item para modificações: ${item.type} - Evento: ${event?.name}${detailMsg}${modifiedDataMsg}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["arte"],
      });

      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      // `destinoDevolvido`: para onde a peça FOI de fato (molde volta sempre
      // para o começo da Arte, seja qual for o pedido) — é o que o aviso diz.
      res.json({ ...item, destinoDevolvido: destinoEfetivo });
    } catch (error) {
      sendSensitiveError(res, error, "Devolver para a Arte", 500);
    }
  });

  /**
   * DEVOLVER PARA A REVISÃO — a saída que faltava na Gráfica.
   *
   * O operador abre o arquivo na hora de imprimir e vê que está errado. Até
   * aqui ele tinha duas opções ruins: imprimir mesmo assim, ou deixar a peça
   * parada na fila sem que ninguém soubesse por quê — a peça continuava
   * contando como "Pronto para Produção" para o resto do app, inclusive para
   * a Gestão de Prazos, que a cobrava da Gráfica.
   *
   * SÓ ANTES DE PRODUZIR (decisão do dono). A partir do momento em que a
   * produção começa existe material físico, `quantityProduced` contado e
   * ativos de inventário criados; devolver para uma fila que assume que nada
   * foi feito exigiria um caminho de estorno que não existe. Depois de
   * produzida, o caminho continua sendo o de sempre.
   *
   * O motivo é obrigatório pela mesma régua das outras devoluções: quem
   * recebe a peça de volta precisa saber o que refazer.
   */
  // Os status de antes de produzir: LIBERADA, em shared/maquina-de-estados.ts ("devolver-para-a-revisao").

  app.patch("/api/items/:id/return-to-review", requireAuth, async (req, res) => {
    try {
      // Quem decide NÃO imprimir é quem tem a impressora — mesmo gate de
      // `start-production`, e não o de conferir/entregar: devolver é recusar
      // o trabalho, não executá-lo.
      if (req.userRole !== "grafica" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas a Gráfica pode devolver para a Revisão" });
      }

      const motivo = lerMotivoDevolucao(req);
      if (!motivo.ok) return res.status(400).json({ error: motivo.erro });
      const notes = motivo.motivo;

      const currentItem = await storage.getItem(req.params.id);
      if (!currentItem) return res.status(404).json({ error: "Item não encontrado" });

      if (await barraEventoFinalizado(currentItem, res)) return;

      if (!vemDeOrigemValida(currentItem.status, "devolver-para-a-revisao")) {
        return res.status(409).json({
          error: `A peça já saiu da fila de produção (${translateStatus(currentItem.status)}) e não pode voltar para a Revisão — há material produzido para desfazer.`,
        });
      }

      // A peça tirada da impressora volta a "liberada" COM impressas: o status
      // sozinho não diz mais que não há material produzido.
      if ((currentItem.quantityProduced ?? 0) > 0) {
        return res.status(409).json({
          error: `A peça já tem ${currentItem.quantityProduced} un. impressas e não pode voltar para a Revisão — há material produzido para desfazer.`,
        });
      }

      const item = await storage.updateItem(req.params.id, {
        status: "awaiting_final_review",
        // A revisão anterior deixa de valer: foi ela que liberou a peça para
        // uma produção que a Gráfica está recusando. Sem zerar isto, a peça
        // reapareceria na Revisão marcada como já revisada.
        creatorReviewedAt: null,
        // O motivo SUBSTITUI a observação, como no `return-to-arte`: motivo
        // novo não convive com o feedback de uma devolução anterior.
        observations: notes,
        rejectionReason: notes,
        reservaPorMaquina: null, maquinaPrevista: null, // sem "Pausada" ao liberar
      });
      if (!item) return res.status(404).json({ error: "Item não encontrado" });

      const event = await storage.getEvent(item.eventId);

      await createAuditLog(
        req,
        "rejected",
        "item",
        item.id,
        `Gráfica devolveu a peça para a Revisão antes de produzir. Motivo: ${notes}`,
      );

      const notification = await storage.createNotification({
        type: "itemRejected",
        message: `Gráfica devolveu ${item.displayId} para a Revisão: ${notes}`,
        eventId: item.eventId,
        itemId: item.id,
        targetRoles: ["solicitacao"],
      });

      // `item_updated` é o que invalida `/api/items/approved` (a fila da
      // Gráfica, que roda com staleTime: Infinity) — ver use-websocket.
      broadcast({ type: "item_updated", item });
      broadcast({ type: "notification_created", notification });
      res.json(item);
    } catch (error) {
      responderFalha(res, error, "PATCH /api/items/:id/return-to-review", 400);
    }
  });

  // Devolução EM LOTE da Revisão Final — grava exatamente o que a individual
  // grava (camposDaDevolucaoDaRevisao), peça a peça.
  app.patch("/api/items/bulk-return-to-arte", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin" && !(ARTE_DECIDE_NA_REVISAO && req.userRole === "arte")) {
        return res.status(403).json({ error: "Só a Solicitação devolve peça na Revisão Final." });
      }

      const { itemIds } = req.body;
      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: "Selecione ao menos uma peça para devolver." });
      }

      const motivoLote = lerMotivoDevolucao(req);
      if (!motivoLote.ok) return res.status(400).json({ error: motivoLote.erro });
      const destino = lerDestinoDevolucao(req);
      const notes = motivoLote.motivo;

      const results: any[] = [];
      const errors: Array<{ itemId: string; error: string }> = [];
      const destinos: Record<string, DestinoDevolucao> = {};
      const trilha: Array<{ action: string; entityType: string; entityId: string; details?: string }> = [];
      // ANDA: mesma devolução do individual, multiplicada.
      const bloqueio = contadorDeBloqueio();

      // Peças em paralelo, evento lido uma vez por evento, trilha em UM
      // INSERT e um broadcast por evento.
      const eventoMemo = new Map<string, Promise<any>>();
      const eventoDe = (eventId: string) => {
        if (!eventoMemo.has(eventId)) eventoMemo.set(eventId, storage.getEvent(eventId));
        return eventoMemo.get(eventId)!;
      };
      await Promise.all(itemIds.map(async (itemId: string) => {
        try {
        const currentItem = await storage.getItem(itemId);
        if (!currentItem) {
          errors.push({ itemId, error: "Peça não encontrada." });
          return;
        }

        const motivoEvento = motivoEventoFechado(await eventoDe(currentItem.eventId));
        if (motivoEvento) {
          errors.push({ itemId, error: bloqueio.registra(motivoEvento) });
          return;
        }

        if (!vemDeOrigemValida(currentItem.status, "devolver-para-a-arte")) {
          errors.push({ itemId, error: `Não está mais na Revisão Final (etapa atual: ${translateStatus(currentItem.status)}).` });
          return;
        }

        const { destinoEfetivo, campos } = await camposDaDevolucaoDaRevisao(currentItem, destino, notes);
        const item = await storage.updateItem(itemId, campos);

        if (item) {
          results.push(item);
          destinos[item.id] = destinoEfetivo;
          const modifiedDataMsg = currentItem.hasModifiedData ? " ⚠️ DADOS MODIFICADOS: Verifique Quantidade, m² Total e Medida!" : "";
          trilha.push({
            action: 'rejected', entityType: 'item', entityId: item.id,
            details: `Item devolvido para Arte para modificações (em lote — ${textoDoDestino(destinoEfetivo)}). Observações: ${notes}${modifiedDataMsg}`,
          });
        } else {
          errors.push({ itemId, error: "Peça não encontrada." });
        }
        } catch (e) {
          errors.push({ itemId, error: "Falha interna ao devolver esta peça — tente de novo." });
          console.error("[bulk-return-to-arte] falha na peça", itemId, e);
        }
      }));

      if (bloqueio.respondeLoteInteiro(res, results.length, itemIds.length)) return;

      if (results.length > 0) {
        await createAuditLogsEmLote(req, trilha);
        // Uma notificação e um broadcast POR EVENTO: o lote pode misturar
        // eventos, e o aviso de um não pode apontar para o outro.
        const porEvento = new Map<string, any[]>();
        for (const r of results) porEvento.set(r.eventId, [...(porEvento.get(r.eventId) ?? []), r]);
        for (const [eventId, doEvento] of Array.from(porEvento.entries())) {
          broadcast({ type: "items_bulk_updated", itemIds: doEvento.map((r) => r.id), eventId });
          const event = await eventoDe(eventId);
          const notification = await storage.createNotification({
            type: "itemRejected",
            message: `Criador devolveu ${doEvento.length} item(ns) para modificações${event?.name ? ` — Evento: ${event.name}` : ""}. Observações: ${notes}`,
            eventId,
            itemId: doEvento.length === 1 ? doEvento[0].id : null,
            targetRoles: ["arte"],
          });
          broadcast({ type: "notification_created", notification });
        }
      }

      // `errors` traz o MOTIVO de cada recusa (a tela o mostra na linha);
      // `destinos` diz para onde cada peça foi de fato (molde: sempre "arte").
      res.json({ success: results.length, errors, items: results, failedItemIds: errors.map(e => e.itemId), destinos });
    } catch (error) {
      sendSensitiveError(res, error, "Devolver em lote para a Arte", 500);
    }
  });
}
