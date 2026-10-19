// Excluir peça (soft delete) e restaurar da lixeira.
import type { Express, Request } from "express";
import type { Event, Item } from "@shared/schema";
import { storage } from "../../storage";
import { excluirPecaTirandoDosVolumes, ehRecusaDeTubo } from "../tubos";
import { liberarReservasDasPecas } from "../estoque-reservas";
import { requireAuth, broadcast, createAuditLog, updateEventStatus } from "../shared";
import { responderFalha } from "../../erros";
import { barraEventoArquivado } from "../eventoFinalizado";

/** POST /api/items/:id/restore. */
export function registrarRestauracao(app: Express): void {
  // Restaurar peça excluída (desfaz o soft delete) — SOMENTE admin.
  // A visão "Excluídos" era um beco sem saída: dava para ver, não para voltar.
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA, não fazer andar):
  // restaurar é o desfazer de uma exclusão, e a exclusão continua liberada em
  // evento finalizado. Barrar só aqui tornaria PERMANENTE um clique errado —
  // a peça excluída por engano ficaria na lixeira para sempre, porque o
  // caminho de volta estaria fechado. Restaurar não faz ninguém trabalhar: a
  // peça volta com o MESMO status que tinha.
  app.post("/api/items/:id/restore", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem restaurar peças" });
      }
      if (await barraEventoArquivado(await storage.getItem(req.params.id), res)) return;
      const restored = await storage.restoreItem(req.params.id);
      if (!restored) {
        return res.status(404).json({ error: "Peça não encontrada ou não está excluída" });
      }
      const item = await storage.getItem(req.params.id);
      await createAuditLog(
        req,
        "restored",
        "item",
        req.params.id,
        `Peça "${item?.displayId ?? req.params.id}" restaurada da lixeira`
      );
      if (item) await updateEventStatus(item.eventId);
      broadcast({ type: "item_updated", item });
      res.json({ success: true, item });
    } catch (error) {
      res.status(500).json({ error: "Não foi possível restaurar a peça" });
    }
  });
}

/** DELETE /api/items/:id. */
export function registrarExclusao(app: Express): void {
  // Delete item (soft delete — preservado no histórico)
  //
  // SEM a guarda de evento finalizado (é ARRUMAR A CASA). Excluir não faz o
  // trabalho andar: tira a peça da frente. Barrar aqui deixaria LIXO PRESO —
  // a peça duplicada, o rascunho digitado errado e a linha que nunca deveria
  // existir ficariam para sempre num evento em que ninguém mais pode mexer,
  // poluindo o Painel Geral e a contagem do Detalhe do Evento. E o risco é
  // baixo pelos dois motivos que já valem hoje: a exclusão é SOFT (a peça vai
  // para a lixeira, com deletedAt) e RESTAURÁVEL pela rota de restauração,
  // com autor e data no audit log.
  app.delete("/api/items/:id", requireAuth, async (req, res) => {
    try {
      // Gate de PAPEL — o único gate de permissão desta rota. Gráfica, Arte e
      // Atendimento seguem recebendo 403.
      if (!["admin", "solicitacao"].includes(req.userRole ?? "")) {
        return res.status(403).json({ error: "Sem permissão para excluir peças" });
      }

      const item = await storage.getItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Peça não encontrada" });
      }
      if (await barraEventoArquivado(item, res)) return;

      // ── Alcance da exclusão: solicitação = admin (decisão do dono) ────────
      // Havia uma lista de status bloqueados só para a solicitação, e ela
      // começava em "awaiting_submission": na prática o papel dono da peça não
      // conseguia excluir nem o próprio rascunho recém-criado, e cada engano de
      // digitação virava chamado para o administrador.
      //
      // A liberação é segura porque a exclusão aqui é SOFT (grava deletedAt, a
      // peça sai das listagens e continua no banco) e RESTAURÁVEL pela rota de
      // restauração — nada é destruído, e o audit log abaixo registra quem
      // excluiu, o quê e de qual evento. O gate de PAPEL continua: quem não é
      // admin nem solicitação segue tomando 403 logo acima.
      //
      // O que NÃO é regra de papel e por isso continua valendo para todo mundo,
      // inclusive admin: a integridade do complemento, em excluirPecaParaALixeira
      // (a mesma função que o desfazer da clonagem usa).

      const feito = await excluirPecaParaALixeira(req, item);
      if (!feito.ok) return res.status(feito.recusa.status).json(feito.recusa.corpo);

      res.json({ success: true });
    } catch (error) {
      responderFalha(res, error, "DELETE /api/items/:id");
    }
  });
}

/** Por que a exclusão não aconteceu (vira a resposta HTTP de quem chamou). */
export interface RecusaDaExclusao { status: number; corpo: { error: string } & Record<string, unknown> }

/**
 * EXCLUIR UMA PEÇA PARA A LIXEIRA — o miolo do DELETE /api/items/:id, para
 * quem exclui por outro caminho (o desfazer da clonagem, 19/10) fazer
 * EXATAMENTE o mesmo: barra a mãe com complemento vivo, tira dos volumes e
 * marca deletedAt numa transação, devolve a solicitação de peça, grava a
 * trilha, solta as reservas do estoque e avisa as telas.
 *
 * O gate de papel e a guarda de evento arquivado ficam com quem chama — cada
 * porta tem a sua regra de quem pode.
 *
 * `opcoes.evento`: o evento já lido (o desfazer exclui dezenas de peças do
 * mesmo evento; reler a cada peça era uma ida ao banco por nada).
 * `opcoes.porque`: o complemento da frase da trilha ("ao desfazer a clonagem").
 */
export async function excluirPecaParaALixeira(
  req: Request,
  item: Item,
  opcoes: { evento?: Event | null; porque?: string } = {},
): Promise<{ ok: true } | { ok: false; recusa: RecusaDaExclusao }> {
  // Mãe com complemento vivo não some. O `ON DELETE SET NULL` da FK só
  // dispara em DELETE físico — aqui a exclusão é SOFT (deletedAt), então o
  // banco não limpa nada e o filho ficaria órfão, apontando para uma peça
  // invisível: a linha da Gráfica diria "COMPLEMENTO DE #0062" com #0062
  // fora de todas as listagens. Cancelar o complemento primeiro é a ordem
  // correta e é reversível.
  const complementosVivos = await storage.getLiveComplements(item.id).catch(() => []);
  if (complementosVivos.length > 0) {
    return { ok: false, recusa: { status: 409, corpo: {
      error: `Esta peça tem ${complementosVivos.length} complemento(s) ativo(s) (${complementosVivos.map(c => c.displayId).join(", ")}). Cancele o complemento antes de excluir.`,
      code: "HAS_COMPLEMENTS",
      complements: complementosVivos.map(c => ({ id: c.id, displayId: c.displayId })),
    } } };
  }

  // Sai dos volumes ABERTOS e vai para a lixeira NUMA TRANSAÇÃO SÓ, com a
  // peça travada (revisão de 22/09): antes eram dois passos, e um embalar
  // ou uma entrega entre eles deixava linha "fantasma" num tubo — ou a peça
  // fora do tubo sem ter sido excluída. Se falhar, nada muda (500).
  let excluida: { tiradas: number } | null;
  try {
    excluida = await excluirPecaTirandoDosVolumes(req, item.id);
  } catch (e) {
    if (ehRecusaDeTubo(e)) return { ok: false, recusa: { status: e.http, corpo: { error: e.message } } };
    throw e;
  }
  if (!excluida) {
    return { ok: false, recusa: { status: 404, corpo: { error: "Peça não encontrada" } } };
  }
  // Peça que atendia uma solicitação: se era a última, a peça solicitada
  // volta para aberta sozinha (dono, 14/09 — sem "desfazer atendimento").
  if (item.pedidoDePecaLinhaId) {
    const { aoExcluirPeca } = await import("../pedidos-de-peca");
    await aoExcluirPeca(req, item);
  }

  // Create audit log
  //
  // O nome do evento entra no texto porque a exclusão é SOFT: a peça sai de
  // /api/items e o Histórico perde a única forma de saber a que evento ela
  // pertencia — a linha mais sensível da auditoria era a única que
  // renderizava "Evento desconhecido", sem ID e sem link.
  const eventoDaPeca = opcoes.evento !== undefined ? opcoes.evento : await storage.getEvent(item.eventId).catch(() => undefined);
  await createAuditLog(
    req,
    'deleted',
    'item',
    item.id,
    `Item "${item.type}" (${item.displayId})${eventoDaPeca ? ` do evento "${eventoDaPeca.name}"` : ""} excluído${opcoes.porque ? ` ${opcoes.porque}` : ""} por ${req.userRole}`
  );
  await liberarReservasDasPecas(req, [item.id], "excluída"); // reserva de peça morta não segura estoque

  broadcast({ type: "item_deleted", itemId: item.id, eventId: item.eventId });

  return { ok: true };
}
