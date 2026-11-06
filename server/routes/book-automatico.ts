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

  // A TELA DOS BOOKS (dono, 06/11: "está muito escondido"): cada evento por vir com o
  // book oficial, quantas peças mudaram depois dele, o rascunho automático e o que a
  // Conferência de arte ainda pede. Por enquanto só Arte e admin.
  app.get("/api/books", requireRole("admin", "arte"), async (req, res) => {
    try {
      if (req.userKit) return res.status(403).json({ error: "Os books não fazem parte do Kit." });
      const VIVA = `i.deleted_at is null and i.kit_remessa_id is null and i.status not in ('canceled','cancelled','archived','deleted')`;
      const { rows } = await pool.query(`
        with ev as (
          select e.id, e.name as nome, to_char(e.start_date, 'YYYY-MM-DD') as inicio, to_char(e.truck_departure_date, 'YYYY-MM-DD') as saida, e.truck_departure_date as ordem
            from events e
           where e.arquivado_em is null and e.status <> 'closed' and e.start_date >= (now() at time zone 'America/Sao_Paulo')::date - 1
        ), b as (
          select distinct on (event_id) event_id, id, book_url, item_count, created_by, created_at, comment, thumbs
            from event_books order by event_id, created_at desc
        ), r as (
          select distinct on (event_id) event_id, versao, pdf_url, paginas, plano, criado_em, automatico
            from rascunhos_do_book order by event_id, versao desc
        )
        select ev.id, ev.nome, ev.inicio, ev.saida,
               (select count(*)::int from items i where i.event_id = ev.id and ${VIVA}) as pecas,
               (select count(*)::int from items i where i.event_id = ev.id and ${VIVA} and i.approval_thumb_url like '/objects/%') as "comArte",
               b.book_url as "bookUrl", b.item_count as "bookPecas", b.created_by as "bookPor", ${ISO("b.created_at")} as "bookEm", b.comment as "bookComentario",
               (select count(*)::int from event_books x where x.event_id = ev.id) as publicacoes,
               case when b.id is null then null
                    when b.thumbs is not null then (select count(*)::int from items i where i.event_id = ev.id and ${VIVA} and i.approval_thumb_url like '/objects/%'
                         and (not (b.thumbs ? i.id) or (b.thumbs ->> i.id) is distinct from i.approval_thumb_url))
                    else (select count(*)::int from items i where i.event_id = ev.id and ${VIVA} and i.approval_thumb_url like '/objects/%'
                         and (i.created_at > b.created_at or exists (select 1 from item_art_versions v where v.item_id = i.id and v.created_at > b.created_at)))
               end as "mudaram",
               r.versao as "rascunhoVersao", ${ISO("r.criado_em")} as "rascunhoEm", r.pdf_url as "rascunhoUrl", r.paginas as "rascunhoPaginas", r.plano as "rascunhoPlano",
               (select count(*)::int from conferencias_do_arquivo c join items i on i.id = c.item_id
                 where i.event_id = ev.id and i.deleted_at is null and c.arquivo = i.final_file_url and c.thumb = i.approval_thumb_url
                   and c.veredito <> 'confere' and c.resolvida_em is null) as "conferenciaPendente"
          from ev left join b on b.event_id = ev.id left join r on r.event_id = ev.id
         order by ev.ordem nulls last, ev.nome`);
      res.json(rows.map(({ rascunhoPlano, ...e }: { rascunhoPlano: Array<{ origem?: string }> | null; [k: string]: unknown }) => {
        const origens: Record<string, number> = {};
        for (const p of rascunhoPlano ?? []) { const o = p.origem ?? "regra"; origens[o] = (origens[o] ?? 0) + 1; }
        return { ...e, rascunhoOrigens: rascunhoPlano ? origens : null };
      }));
    } catch (erro) {
      console.error("[books] lista", erro);
      res.status(500).json({ error: "Não foi possível carregar os books." });
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
