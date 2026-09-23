// ─────────────────────────────────────────────────────────────────────────────
// SOLICITAÇÃO AO ESTOQUE A PARTIR DA REVISÃO FINAL (dono, 21/09) — decisões em
// shared/consultas-de-estoque.ts; banco em services/consultasDeEstoque.ts. Por
// dentro o nome é "consulta de estoque"; na interface, "Solicitação ao estoque".
//
// Papéis:
//   · pedir e cancelar: Solicitação e admin (cancela quem pediu, ou admin);
//   · responder (atender, atender em parte, não conseguir): Gráfica e admin —
//     é quem faz estoque e triagem;
//   · ler: os três. A Solicitação vê só as DELA na caixa.
//
// A solicitação NÃO trava a peça: enquanto a Gráfica não responde, a Revisão
// Final libera normalmente (com aviso). A resposta NUNCA libera a peça: com a
// peça na Revisão Final ela só fica registrada, e o reaproveitamento entra
// quando a Revisão Final liberar (PATCH /api/items/:id/creator-review). Só se a
// peça já tinha sido liberada é que a resposta aplica o reaproveitamento na
// hora — foi a Solicitação quem pediu.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, NextFunction, Request, Response } from "express";
import { storage } from "../storage";
import type { InsertNotification } from "@shared/schema";
import { pecaVisivelPara } from "@shared/kit";
import {
  MAX_OBSERVACAO_DA_CONSULTA,
  STATUS_DA_CONSULTA,
  STATUS_QUE_CONSULTA,
  avisoParaAGrafica,
  avisoParaQuemPediu,
  ehFotoValida,
  validarAtendimento,
  validarPedido,
  SOLICITACAO_AO_ESTOQUE_ATIVA,
} from "@shared/consultas-de-estoque";
import { requireRole, broadcast, createAuditLog, resolveActor } from "./shared";
import { motivoEventoDaPeca, erroEventoFechado } from "./eventoFinalizado";
import * as repo from "../services/consultasDeEstoque";
import { camposDoErro } from "../erros";

const requireConsultar = requireRole("admin", "solicitacao");
const requireResponder = requireRole("admin", "grafica");
const requireLerConsultas = requireRole("admin", "grafica", "solicitacao");

const quemAgiu = (req: Pick<Request, "userName" | "userId">) => resolveActor({ userName: req.userName, userId: req.userId ?? null });

const lerTexto = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t : null;
};

async function notificar(dados: { type: string; message: string; eventId: string; itemId: string; targetRoles: InsertNotification["targetRoles"]; targetUserId?: string | null }) {
  try {
    const notification = await storage.createNotification(dados);
    broadcast({ type: "notification_created", notification });
  } catch (error) {
    console.error("[solicitacao-ao-estoque] falha ao notificar:", error);
  }
}

/**
 * O filtro do Kit, o mesmo da Revisão Final: o usuário do Kit só mexe nas
 * peças do Kit que ELE criou, e a Solicitação sem Kit não revisa peça do Kit
 * ("Peças do Kit são revisadas pela equipe do Kit").
 */
function foraDoAlcance(req: Pick<Request, "userKit" | "userId" | "userRole">, peca: { kitRemessaId: string | null; criadoPorId: string | null }): boolean {
  if (!pecaVisivelPara({ kit: req.userKit === true, userId: req.userId ?? null }, peca)) return true;
  return req.userRole === "solicitacao" && req.userKit !== true && !!peca.kitRemessaId;
}

// A CHAVE (dono, 21/09 — segurar): desligada, as rotas continuam registradas
// (a régua de papéis compara tabela × código), mas não tocam no banco. Vêm
// DEPOIS da guarda de papel: quem não podia continua recebendo 403.
// Escrita → 404 "Recurso desativado"; leitura → vazio, no formato de sempre.
const desativadaParaEscrita = (_req: Request, res: Response, next: NextFunction) =>
  SOLICITACAO_AO_ESTOQUE_ATIVA ? next() : res.status(404).json({ error: "Recurso desativado" });
const vazioSeDesativada = (vazio: unknown) => (_req: Request, res: Response, next: NextFunction) =>
  SOLICITACAO_AO_ESTOQUE_ATIVA ? next() : res.json(vazio);

export function registerConsultasDeEstoqueRoutes(app: Express): void {
  // A solicitação que vale para a peça (a mais recente não cancelada) — o que
  // a ficha da Revisão Final mostra. null = nunca pediu.
  app.get("/api/items/:id/consulta-de-estoque", requireLerConsultas, vazioSeDesativada({ consulta: null }), async (req, res) => {
    try {
      const peca = await repo.pecaDaConsulta(req.params.id);
      if (!peca || peca.deletedAt || foraDoAlcance(req, peca)) return res.status(404).json({ error: "Peça não encontrada" });
      res.json({ consulta: await repo.consultaAtualDaPeca(peca.id) });
    } catch (error) {
      console.error("[solicitacao-ao-estoque] erro ao ler a solicitação da peça:", error);
      res.status(500).json({ error: "Erro ao ler a solicitação ao estoque" });
    }
  });

  // Pedir N un. ao estoque — o que o modal Reaproveitamento da Revisão Final
  // faz no lugar de aplicar o reaproveitamento na hora.
  app.post("/api/items/:id/consulta-de-estoque", requireConsultar, desativadaParaEscrita, async (req, res) => {
    try {
      const observacao = lerTexto(req.body?.observacao);
      if (observacao && observacao.length > MAX_OBSERVACAO_DA_CONSULTA) {
        return res.status(400).json({ error: `A observação passou de ${MAX_OBSERVACAO_DA_CONSULTA} caracteres.` });
      }
      const peca = await repo.pecaDaConsulta(req.params.id);
      if (!peca || peca.deletedAt || foraDoAlcance(req, peca)) return res.status(404).json({ error: "Peça não encontrada" });
      if (peca.status !== STATUS_QUE_CONSULTA) {
        return res.status(409).json({ error: "Só dá para pedir ao estoque peça que está na Revisão Final." });
      }
      const motivoFim = await motivoEventoDaPeca({ eventId: peca.eventId });
      if (motivoFim) return res.status(409).json({ error: erroEventoFechado(motivoFim), code: "EVENT_FINALIZED", reason: motivoFim });
      const pedido = validarPedido({ quantidade: req.body?.quantidade, quantidadeDaPeca: peca.quantity, jaReaproveitadas: peca.reuseQty ?? 0 });
      if (!pedido.ok) return res.status(400).json({ error: pedido.erro });

      const quem = quemAgiu(req);
      const consulta = await repo.criarConsulta({ itemId: peca.id, eventId: peca.eventId, quantidadePedida: pedido.quantidade, observacao, quem });

      await createAuditLog(req, "updated", "item", peca.id,
        `Pedido ao estoque: ${pedido.quantidade} de ${peca.quantity} un. para reaproveitar${observacao ? ` — ${observacao}` : ""}`);
      await notificar({
        type: "consultaDeEstoque",
        message: avisoParaAGrafica(peca.displayId, pedido.quantidade, peca.eventName),
        eventId: peca.eventId,
        itemId: peca.id,
        targetRoles: ["grafica", "admin"],
      });
      broadcast({ type: "consultas_de_estoque", itemId: peca.id, eventId: peca.eventId });
      res.status(201).json(consulta);
    } catch (error: unknown) {
      const { httpStatus, message } = camposDoErro(error);
      if (httpStatus) return res.status(httpStatus).json({ error: message });
      console.error("[solicitacao-ao-estoque] erro ao pedir:", error);
      res.status(500).json({ error: "Erro ao pedir ao estoque" });
    }
  });

  app.get("/api/consultas-de-estoque", requireLerConsultas, vazioSeDesativada([]), async (req, res) => {
    try {
      const pedidos = typeof req.query.status === "string" && req.query.status
        ? req.query.status.split(",").filter((s) => (STATUS_DA_CONSULTA as readonly string[]).includes(s))
        : [];
      const limite = Math.max(1, Math.min(500, parseInt(String(req.query.limite ?? "200"), 10) || 200));
      // A Solicitação vê as DELA; Gráfica e admin, todas.
      const soAsMinhas = req.userRole === "solicitacao";
      res.json(await repo.listarConsultas({
        status: pedidos.length ? pedidos : undefined,
        pedidoPorId: soAsMinhas ? (req.userId ?? "") : undefined,
        limite,
      }));
    } catch (error) {
      console.error("[solicitacao-ao-estoque] erro ao listar:", error);
      res.status(500).json({ error: "Erro ao listar as solicitações ao estoque" });
    }
  });

  // O número do menu: solicitações esperando a Gráfica responder.
  app.get("/api/consultas-de-estoque/abertas", requireResponder, vazioSeDesativada({ total: 0 }), async (_req, res) => {
    try {
      res.json({ total: await repo.contarAbertas() });
    } catch (error) {
      console.error("[solicitacao-ao-estoque] erro ao contar abertas:", error);
      res.status(500).json({ error: "Erro ao contar as solicitações abertas" });
    }
  });

  // "5 un. aguardando resposta do estoque" na fila da Gráfica: as abertas, por
  // peça. A fila lê uma vez só.
  app.get("/api/consultas-de-estoque/abertas-por-peca", requireLerConsultas, vazioSeDesativada([]), async (_req, res) => {
    try {
      res.json(await repo.abertasPorPeca());
    } catch (error) {
      console.error("[solicitacao-ao-estoque] erro ao ler abertas por peça:", error);
      res.status(500).json({ error: "Erro ao ler as solicitações abertas" });
    }
  });

  // A lista da Revisão Final: o que vale para cada peça em revisão (selo na
  // linha, "Aguardando estoque", "Estoque respondeu", sugestão do lote).
  app.get("/api/consultas-de-estoque/da-revisao", requireConsultar, vazioSeDesativada([]), async (req, res) => {
    try {
      // O mesmo filtro do Kit das peças: ninguém recebe linha de peça que não
      // enxerga na fila.
      const todas = await repo.consultasDaRevisao();
      res.json(todas
        .filter((c) => !foraDoAlcance(req, { kitRemessaId: c.kitRemessaId ?? null, criadoPorId: c.criadoPorId ?? null }))
        .map(({ kitRemessaId: _k, criadoPorId: _c, ...resto }) => resto));
    } catch (error) {
      console.error("[solicitacao-ao-estoque] erro ao ler as da revisão:", error);
      res.status(500).json({ error: "Erro ao ler as respostas do estoque" });
    }
  });

  app.get("/api/consultas-de-estoque/:id/sugestoes", requireLerConsultas, vazioSeDesativada({ semMedida: false, sugestoes: [] }), async (req, res) => {
    try {
      const consulta = await repo.consultaPorId(req.params.id);
      if (!consulta) return res.status(404).json({ error: "Solicitação não encontrada" });
      if (req.userRole === "solicitacao" && consulta.pedidoPorId !== req.userId) {
        return res.status(404).json({ error: "Solicitação não encontrada" });
      }
      const busca = typeof req.query.busca === "string" ? req.query.busca.slice(0, 120) : "";
      res.json(await repo.sugestoesParaPeca(consulta.itemId, busca));
    } catch (error: unknown) {
      const { httpStatus, message } = camposDoErro(error);
      if (httpStatus) return res.status(httpStatus).json({ error: message });
      console.error("[solicitacao-ao-estoque] erro ao sugerir:", error);
      res.status(500).json({ error: "Erro ao procurar no acervo" });
    }
  });

  // { resposta: "atender" | "nao_atender", quantidade?, ativosIds?, observacao?, fotoUrl? }
  // "atender" com a quantidade pedida = atendida; com menos = atendida em parte.
  app.post("/api/consultas-de-estoque/:id/responder", requireResponder, desativadaParaEscrita, async (req, res) => {
    try {
      const observacao = lerTexto(req.body?.observacao);
      if (observacao && observacao.length > MAX_OBSERVACAO_DA_CONSULTA) {
        return res.status(400).json({ error: `A observação passou de ${MAX_OBSERVACAO_DA_CONSULTA} caracteres.` });
      }
      const fotoUrl = req.body?.fotoUrl == null || req.body.fotoUrl === "" ? null : req.body.fotoUrl;
      if (fotoUrl !== null && !ehFotoValida(fotoUrl)) {
        return res.status(400).json({ error: "Foto inválida — envie a imagem pelo formulário." });
      }
      const atende = req.body?.resposta === "atender";
      const ativosIds: string[] = atende && Array.isArray(req.body?.ativosIds)
        ? Array.from(new Set<string>(req.body.ativosIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)))
        : [];
      if (ativosIds.length > 500) return res.status(400).json({ error: "No máximo 500 peças do acervo por resposta." });

      const consulta = await repo.consultaPorId(req.params.id);
      if (!consulta) return res.status(404).json({ error: "Solicitação não encontrada" });
      if (consulta.status !== "aberta") return res.status(409).json({ error: "Esta solicitação não está mais aberta — atualize a tela." });
      const peca = await repo.pecaDaConsulta(consulta.itemId);
      if (!peca || peca.deletedAt) return res.status(404).json({ error: "A peça desta solicitação não existe mais." });

      const unidades = ativosIds.length ? await repo.unidadesDosAtivos(ativosIds) : 0;
      const v = validarAtendimento({ resposta: req.body?.resposta, quantidade: req.body?.quantidade, quantidadePedida: consulta.quantidadePedida, unidadesDosAtivos: unidades });
      if (!v.ok) return res.status(400).json({ error: v.erro });

      const quem = quemAgiu(req);
      const { consulta: respondida, codigos, pecaAtualizada, aplicado } = await repo.responderConsulta({
        id: consulta.id, status: v.status, atendida: v.atendida, ativosIds, observacao, fotoUrl, quem,
      });

      const semVinculo = v.atendida > 0 && codigos.length === 0 ? " — sem vínculo com o acervo" : "";
      await createAuditLog(req, "updated", "item", peca.id,
        v.atendida > 0
          ? `Estoque respondeu: atende ${v.atendida} de ${consulta.quantidadePedida} un. pedidas${codigos.length ? ` — reservadas ${codigos.join(", ")}` : semVinculo}${observacao ? ` (${observacao})` : ""}${aplicado ? "" : " · a Revisão Final confirma ao liberar"}`
          : `Estoque respondeu: não consegue atender as ${consulta.quantidadePedida} un. pedidas${observacao ? ` (${observacao})` : ""}`);
      // Dois tipos de aviso porque levam a lugares diferentes: a peça ainda na
      // Revisão Final abre a FICHA (é lá que ela confirma e libera); a já
      // liberada abre a caixa, na aba Respondidas.
      await notificar({
        type: aplicado || peca.status !== STATUS_QUE_CONSULTA ? "consultaDeEstoqueAplicada" : "consultaDeEstoqueRespondida",
        message: avisoParaQuemPediu(v.atendida, consulta.quantidadePedida, peca.displayId)
          + (aplicado ? " — já entrou como reaproveitamento na peça liberada" : ""),
        eventId: peca.eventId,
        itemId: peca.id,
        targetRoles: ["solicitacao", "admin"],
        ...(consulta.pedidoPorId ? { targetUserId: consulta.pedidoPorId } : {}),
      });
      broadcast({ type: "consultas_de_estoque", itemId: peca.id, eventId: peca.eventId });
      if (codigos.length) broadcast({ type: "estoque_reservas", itemId: peca.id, eventId: peca.eventId });
      if (pecaAtualizada) broadcast({ type: "item_updated", item: pecaAtualizada });
      res.json(respondida);
    } catch (error: unknown) {
      const { httpStatus, message } = camposDoErro(error);
      if (httpStatus) return res.status(httpStatus).json({ error: message });
      console.error("[solicitacao-ao-estoque] erro ao responder:", error);
      res.status(500).json({ error: "Erro ao responder a solicitação" });
    }
  });

  app.post("/api/consultas-de-estoque/:id/cancelar", requireConsultar, desativadaParaEscrita, async (req, res) => {
    try {
      const consulta = await repo.consultaPorId(req.params.id);
      if (!consulta) return res.status(404).json({ error: "Solicitação não encontrada" });
      // Cancela quem pediu, ou o admin.
      if (req.userRole !== "admin" && consulta.pedidoPorId !== req.userId) {
        return res.status(403).json({ error: "Só quem pediu ao estoque (ou o admin) pode cancelar a solicitação." });
      }
      const cancelada = await repo.cancelarConsulta(consulta.id);
      if (!cancelada) return res.status(409).json({ error: "A Gráfica já respondeu esta solicitação — não dá mais para cancelar." });
      await createAuditLog(req, "updated", "item", consulta.itemId, `Pedido ao estoque cancelado (${consulta.quantidadePedida} un.)`);
      broadcast({ type: "consultas_de_estoque", itemId: consulta.itemId, eventId: consulta.eventId });
      res.json(cancelada);
    } catch (error) {
      console.error("[solicitacao-ao-estoque] erro ao cancelar:", error);
      res.status(500).json({ error: "Erro ao cancelar a solicitação" });
    }
  });
}
