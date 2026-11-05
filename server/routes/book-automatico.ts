// O rascunho do book automático. Só leitura e geração: nada aqui publica, avisa ou muda peça.
import type { Express } from "express";
import { pool } from "../db";
import { requireAuth, requireRole, createAuditLog, broadcast } from "./shared";
import { gerarRascunhoDoBook, iniciarAtualizacaoDosRascunhos, pecasDaVersao, pecasDoEvento } from "../services/book-automatico";
import { compararVersoes } from "@shared/book-automatico";

const PAPEIS = ["admin", "arte", "solicitacao"];
const ISO = (c: string) => `to_char(${c}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;

export function registerBookAutomaticoRoutes(app: Express): void {
  iniciarAtualizacaoDosRascunhos((eventId) => broadcast({ type: "book_automatico", eventId }));

  app.get("/api/book-automatico/:eventId", requireAuth, async (req, res) => {
    try {
      if (req.userKit || !PAPEIS.includes(req.userRole ?? "")) return res.status(403).json({ error: "O rascunho do book é da Arte, da Solicitação e do admin." });
      const eventId = req.params.eventId;
      const [ev, versoes, oficial] = await Promise.all([
        pool.query(`select id, name as nome from events where id = $1`, [eventId]),
        pool.query(`select id, versao, pdf_url as "pdfUrl", paginas, pecas_no_book as "pecasNoBook", plano, fora, mudancas, modelo_evento as "modeloEvento", base_oficial as "baseOficial", gerado_por as "geradoPor", automatico, tamanho, pecas_da_versao as "pecasDaVersao", ${ISO("criado_em")} as "criadoEm" from rascunhos_do_book where event_id = $1 order by versao desc limit 20`, [eventId]),
        pool.query(`select book_url as "url", item_count as "pecas", created_by as "por", ${ISO("created_at")} as "em", (select count(*)::int from event_books x where x.event_id = $1) as "publicacoes" from event_books where event_id = $1 order by created_at desc limit 1`, [eventId]),
      ]);
      if (!ev.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });
      const ultima = versoes.rows[0];
      const pendente = ultima ? compararVersoes(ultima.pecasDaVersao ?? {}, pecasDaVersao(await pecasDoEvento(eventId))) : null;
      res.json({
        evento: ev.rows[0],
        versoes: versoes.rows.map(({ pecasDaVersao: _p, ...v }) => v),
        pendente,
        oficial: oficial.rows[0] ?? null,
      });
    } catch (erro) {
      console.error("[book-automatico] leitura", erro);
      res.status(500).json({ error: "Não foi possível carregar o rascunho do book." });
    }
  });

  app.post("/api/book-automatico/:eventId/gerar", requireRole("admin", "arte", "solicitacao"), async (req, res) => {
    try {
      if (req.userKit) return res.status(403).json({ error: "O rascunho do book não faz parte do Kit." });
      const existe = await pool.query("select 1 from events where id = $1", [req.params.eventId]);
      if (!existe.rows[0]) return res.status(404).json({ error: "Evento não encontrado." });
      const quem = req.userName ?? "Sistema";
      const r = await gerarRascunhoDoBook(req.params.eventId, quem);
      await createAuditLog(req, "updated", "event", req.params.eventId, `Rascunho do book gerado (versão ${r.versao}). Não foi enviado a ninguém.`);
      broadcast({ type: "book_automatico", eventId: req.params.eventId });
      res.json(r);
    } catch (erro) {
      console.error("[book-automatico] gerar", erro);
      res.status(500).json({ error: "Não foi possível gerar o rascunho agora." });
    }
  });
}
