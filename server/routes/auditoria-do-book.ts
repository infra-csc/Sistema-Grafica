// ─────────────────────────────────────────────────────────────────────────────
// AUDITORIA DO BOOK COM IA (dono, 19/10) — as rotas.
//
//   GET  /api/auditorias-do-book                  a auditoria vigente de cada
//                                                  evento em andamento
//   POST /api/auditorias-do-book/:id/resolver      "Já cadastrei" / "Não precisa"
//                                                  / "Já conferi" (ou desfazer)
//   POST /api/events/:eventId/book/auditar         admin: auditar o book
//                                                  atual (a automática só
//                                                  roda no 1º book)
//
// Quem vê e resolve: Solicitação (menos o usuário do Kit) e admin — os mesmos
// que veem a faixa de solicitações de peças em Eventos. A auditoria em si
// nasce sozinha no 1º book publicado de cada evento (routes/itens/book.ts →
// fila); reenvio não audita de novo (dono, 19/10 — custo).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import {
  MOTIVOS_DE_RESOLUCAO, canceladasDe, motivoServeParaChave, podeVerAuditoriaDoBook,
  type AuditoriaDoBookVista, type MotivoDaResolucao, type RespostaDasAuditorias,
} from "@shared/auditoria-do-book";
import { requireAuth, broadcast, createAuditLog } from "./shared";
import { motivoEventoFechado } from "./eventoFinalizado";
import { responderFalha } from "../erros";
import * as repo from "../services/auditoria-do-book/repo";
import { filaDoBook } from "../services/auditoria-do-book/fila";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export function paraVista(a: repo.AuditoriaDoBook & { evento?: { name: string }; bookPublicadoEm?: Date | null; bookMaisNovoEm?: Date | null }): AuditoriaDoBookVista {
  return {
    id: a.id,
    eventId: a.eventId,
    eventName: a.evento?.name ?? "",
    bookUrl: a.bookUrl,
    bookPublicadoEm: iso(a.bookPublicadoEm),
    bookMaisNovoEm: iso(a.bookMaisNovoEm),
    status: a.status as AuditoriaDoBookVista["status"],
    modelo: a.modelo,
    achados: a.achados ?? null,
    resolvidos: a.resolvidos ?? {},
    pecasNoBook: a.pecasNoBook,
    encontradasNoApp: a.encontradasNoApp,
    erro: a.erro,
    criadoEm: iso(a.criadoEm)!,
    concluidoEm: iso(a.concluidoEm),
  };
}

/** Para a Solicitação, só o que ela usa: auditoria pronta ou a caminho. Erro e falta de chave são assunto do admin. */
const VISIVEL_PARA_SOLICITACAO = new Set(["concluida", "pendente", "processando"]);

export function registerAuditoriaDoBookRoutes(app: Express): void {
  app.get("/api/auditorias-do-book", requireAuth, async (req, res) => {
    try {
      if (!podeVerAuditoriaDoBook(req.userRole, req.userKit)) {
        return res.status(403).json({ error: "A auditoria do book é da Solicitação e do admin." });
      }
      const admin = req.userRole === "admin";
      const atuais = await repo.auditoriasAtuais();
      const auditorias = atuais
        // Só evento em andamento: book de evento encerrado, realizado ou
        // arquivado não vira mais peça.
        .filter((a) => motivoEventoFechado(a.evento) === null)
        .filter((a) => admin || VISIVEL_PARA_SOLICITACAO.has(a.status))
        .map(paraVista)
        .sort((a, b) => a.eventName.localeCompare(b.eventName, "pt-BR"));
      const corpo: RespostaDasAuditorias = { auditorias };
      if (admin) corpo.semChave = !process.env.ANTHROPIC_API_KEY?.trim();
      res.json(corpo);
    } catch (error) {
      responderFalha(res, error, "GET /api/auditorias-do-book");
    }
  });

  app.post("/api/auditorias-do-book/:id/resolver", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Só a Solicitação e o admin marcam os achados do book." });
      }
      // O usuário do Kit é Solicitação, mas só enxerga as peças dele.
      if (req.userKit) return res.status(403).json({ error: "A auditoria do book não está disponível para o usuário do Kit." });

      const { chave, motivo } = (req.body ?? {}) as { chave?: unknown; motivo?: unknown };
      if (typeof chave !== "string" || !/^[fdc]\d{1,4}$/.test(chave)) {
        return res.status(400).json({ error: "Achado inválido." });
      }
      if (motivo !== null && !(typeof motivo === "string" && (MOTIVOS_DE_RESOLUCAO as readonly string[]).includes(motivo))) {
        return res.status(400).json({ error: "Motivo inválido." });
      }
      if (motivo && !motivoServeParaChave(chave, motivo as MotivoDaResolucao)) {
        return res.status(400).json({ error: "Este motivo não serve para este tipo de achado." });
      }
      const auditoria = await repo.buscarAuditoria(req.params.id);
      if (!auditoria) return res.status(404).json({ error: "Auditoria não encontrada." });
      if (auditoria.status !== "concluida") return res.status(409).json({ error: "Esta auditoria ainda não terminou." });
      const achados = auditoria.achados;
      const faltando = achados?.faltando.find((f) => f.chave === chave);
      const divergencia = achados?.divergencias.find((d) => d.chave === chave);
      const cancelada = canceladasDe(achados).find((c) => c.chave === chave);
      if (!faltando && !divergencia && !cancelada) return res.status(404).json({ error: "Achado não encontrado nesta auditoria." });

      const atualizada = await repo.gravarResolucao(auditoria.id, chave, motivo
        ? { motivo: motivo as MotivoDaResolucao, por: req.userName ?? null, porId: req.userId ?? null, em: new Date().toISOString() }
        : null);
      if (!atualizada) return res.status(404).json({ error: "Auditoria não encontrada." });

      const oQue = faltando ? `"${faltando.pecaNoBook}"`
        : cancelada ? `"${cancelada.pecaNoBook}" (cancelada no app: ${cancelada.rotulos.join(", ")})`
        : `a divergência ${divergencia!.displayIds.join(", ")}`;
      const comoFicou = !motivo ? "voltou a ficar em aberto"
        : motivo === "cadastrada" ? (cancelada ? "marcada como resolvida" : "marcada como já cadastrada")
        : motivo === "nao_precisa" && cancelada ? "marcada como cancelada de propósito"
        : motivo === "conferida" ? "marcada como conferida"
        : "marcada como não precisa";
      try {
        await createAuditLog(req, "updated", "event", auditoria.eventId, `Auditoria do book: ${oQue} ${comoFicou}`);
      } catch (erro) {
        console.error("[auditoria do book] falha ao registrar na trilha", erro);
      }
      broadcast({ type: "auditorias_do_book", eventId: auditoria.eventId });
      res.json({ id: atualizada.id, resolvidos: atualizada.resolvidos ?? {} });
    } catch (error) {
      responderFalha(res, error, "POST /api/auditorias-do-book/:id/resolver");
    }
  });

  // Auditar de novo (admin): depois de configurar a chave, de um erro da API,
  // ou para conferir o book ATUAL (a automática só lê o 1º). A auditoria
  // anterior do evento deixa de valer — inclusive as marcações de "Já cadastrei".
  app.post("/api/events/:eventId/book/auditar", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "admin") {
        return res.status(403).json({ error: "Apenas administradores podem auditar o book de novo." });
      }
      const book = await repo.bookAtualDoEvento(req.params.eventId);
      if (!book) return res.status(409).json({ error: "Este evento não tem book publicado para auditar." });
      const id = await filaDoBook().disparar(req.params.eventId, book.bookUrl);
      if (!id) return res.status(500).json({ error: "Não foi possível criar a auditoria agora. Tente de novo em instantes." });
      try {
        await createAuditLog(req, "updated", "event", req.params.eventId, "Auditoria do book pedida de novo");
      } catch (erro) {
        console.error("[auditoria do book] falha ao registrar na trilha", erro);
      }
      res.status(202).json({ id, semChave: !process.env.ANTHROPIC_API_KEY?.trim() });
    } catch (error) {
      responderFalha(res, error, "POST /api/events/:eventId/book/auditar");
    }
  });
}
