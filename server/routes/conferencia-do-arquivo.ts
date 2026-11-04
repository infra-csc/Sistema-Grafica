// Rotas da conferência do arquivo final × thumb aprovado.
// /api/conferidor/*: o programa da rede (token, sem sessão).
// /api/conferencia-do-arquivo/*: as telas (sessão).
import type { Express, NextFunction, Request, Response } from "express";
import { createRequire } from "module";
import { pool } from "../db";
import { requireAuth, requireRole, createAuditLog, broadcast } from "./shared";
import { conferirTokenDaIntegracao } from "./integracao-checklist";
import { ObjectStorageService } from "../objectStorage";
import { compararCandidatas, compararComIA, MODELO_DA_CONFERENCIA, type CandidataDoArquivo, type Veredito } from "../services/conferencia-do-arquivo";
import { storage } from "../storage";
import { avisoNaPeca, lerResolucao } from "@shared/conferencia-do-arquivo";

const require = createRequire(import.meta.url);
const carregarSharp = () => require("sharp") as typeof import("sharp")["default"];

// O banco grava em UTC e o processo roda em horário de Brasília: lido cru pelo driver,
// o horário sairia 3 horas adiantado. Por isso a data já sai escrita, com o fuso.
const ISO_UTC = (coluna: string) => `to_char(${coluna}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
const DADOS_DA_PECA = `
         i.id as "itemId", i.display_id as "displayId", i.type as "tipo", i.description as "descricao", i.status, i.quantity as "quantidade",
         i.material, i.finish as "acabamento", i.file_width as "arqL", i.file_height as "arqA", i.visual_width as "visL", i.visual_height as "visA",
         i.calculated_m2 as "m2", i.event_id as "eventId", e.name as "evento", i.aviso_da_conferencia as "avisoNaGrafica",
         to_char(e.start_date, 'YYYY-MM-DD') as "inicio", to_char(e.truck_departure_date, 'YYYY-MM-DD') as "saida"`;

const CONDICAO_DA_FILA = `
    from items i join events e on e.id = i.event_id
    left join conferencias_do_arquivo c on c.item_id = i.id and c.arquivo = i.final_file_url and c.thumb = i.approval_thumb_url
   where (c.id is null or (c.veredito = 'nao_deu' and c.resolvida_em is null and c.criada_em < now() - interval '1 day')
          or (c.veredito = 'confere' and c.modelo is distinct from '${MODELO_DA_CONFERENCIA}')
          or c.reconferir)
     and i.deleted_at is null and e.arquivado_em is null and e.status <> 'closed'
     and e.start_date >= (now() at time zone 'America/Sao_Paulo')::date
     and i.approval_thumb_url like '/objects/%' and coalesce(i.final_file_url, '') <> ''
     and coalesce(i.is_reuse, false) = false and coalesce(i.reuse_qty, 0) = 0 and coalesce(i.quantity_produced, 0) = 0
     and i.status in ('awaiting_creator_review', 'awaiting_final_review', 'ready_for_production', 'approved', 'pronto_para_producao', 'liberado', 'inProduction', 'em_producao')`;

/**
 * Só o que ainda dá para mudar: nada impresso e evento por vir.
 * "Não deu" volta para a fila depois de um dia: o arquivo pode ter sido colocado na
 * pasta. Gravar de novo renova a data, então uma peça não fica girando sem parar.
 * "Confere" dado por outro modelo volta também: trocar de modelo é para valer em tudo.
 */
export const SQL_PENDENTES = `
  select i.id, i.display_id as "displayId", i.final_file_url as "arquivo", i.approval_thumb_url as "thumb"${CONDICAO_DA_FILA}
   order by e.truck_departure_date, i.display_id limit $1`;

/** A mesma fila, com o que a tela mostra de cada peça. */
const SQL_FILA_DA_TELA = `
  select i.final_file_url as "arquivo", i.approval_thumb_url as "thumb",${DADOS_DA_PECA}${CONDICAO_DA_FILA}
   order by e.truck_departure_date, e.name, i.display_id limit 2000`;

const COLUNAS_DA_LISTA = `
  select c.id, c.veredito, c.motivo, c.pagina, c.thumb, c.arquivo, c.preview_url as "previewUrl", c.nota, c.resolucao, c.reconferir,
         ${ISO_UTC("c.criada_em")} as "criadaEm", ${ISO_UTC("c.resolvida_em")} as "resolvidaEm", c.resolvida_por as "resolvidaPor",${DADOS_DA_PECA}
    from conferencias_do_arquivo c join items i on i.id = c.item_id join events e on e.id = i.event_id
   where i.deleted_at is null and e.arquivado_em is null
     and c.arquivo = i.final_file_url and c.thumb = i.approval_thumb_url`;

function exigirTokenDoConferidor(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  const r = conferirTokenDaIntegracao(req.headers.authorization, process.env.CONFERENCIA_TOKEN);
  if (r === "ok") return next();
  if (r === "desativada") return res.status(503).json({ error: "Conferência desativada neste servidor." });
  return res.status(401).json({ error: "Token do conferidor inválido." });
}

async function jpegDoThumb(thumb: string): Promise<Buffer> {
  const svc = new ObjectStorageService();
  const arquivo = await svc.getObjectEntityFile(svc.normalizeObjectEntityPath(thumb.split("?")[0]));
  const [bytes] = await arquivo.download();
  return carregarSharp()(bytes, { failOn: "none" }).rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" }).jpeg({ quality: 82 }).toBuffer();
}

async function gravar(itemId: string, arquivo: string, thumb: string, v: { veredito: Veredito; motivo: string | null; pagina?: string | null; previewUrl?: string | null; modelo?: string | null; tokensEntrada?: number | null; tokensSaida?: number | null }) {
  const { rows } = await pool.query(
    `insert into conferencias_do_arquivo (item_id, arquivo, thumb, veredito, motivo, pagina, preview_url, modelo, tokens_entrada, tokens_saida)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (item_id, arquivo, thumb) do update set veredito = excluded.veredito, motivo = excluded.motivo, pagina = excluded.pagina,
       preview_url = excluded.preview_url, modelo = excluded.modelo, tokens_entrada = excluded.tokens_entrada, tokens_saida = excluded.tokens_saida, criada_em = now(),
       resolvida_em = null, resolvida_por = null, nota = null, resolucao = null, reconferir = false
     returning id`,
    [itemId, arquivo, thumb, v.veredito, v.motivo, v.pagina ?? null, v.previewUrl ?? null, v.modelo ?? null, v.tokensEntrada ?? null, v.tokensSaida ?? null],
  );
  return rows[0]?.id as string | undefined;
}

const PAPEIS_DA_CONFERENCIA = ["admin", "solicitacao", "arte", "grafica"];

export function registerConferenciaDoArquivoRoutes(app: Express): void {
  // ── O programa da rede ───────────────────────────────────────────────────
  app.get("/api/conferidor/pendentes", exigirTokenDoConferidor, async (req, res) => {
    try {
      const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 200);
      const { rows } = await pool.query(SQL_PENDENTES, [limite]);
      res.json(rows);
    } catch (erro) {
      console.error("[conferidor] pendentes", erro);
      res.status(500).json({ error: "Não foi possível listar as peças." });
    }
  });

  app.get("/api/conferidor/:id/thumb", exigirTokenDoConferidor, async (req, res) => {
    try {
      const peca = await storage.getItem(req.params.id);
      if (!peca?.approvalThumbUrl) return res.status(404).json({ error: "Peça sem thumb." });
      res.setHeader("Content-Type", "image/jpeg");
      res.end(await jpegDoThumb(peca.approvalThumbUrl));
    } catch (erro) {
      console.error("[conferidor] thumb", erro);
      res.status(500).json({ error: "Não foi possível ler o thumb." });
    }
  });

  // O corpo traz a imagem reduzida do arquivo final, ou o motivo de não ter dado.
  app.post("/api/conferidor/:id", exigirTokenDoConferidor, async (req, res) => {
    try {
      const peca = await storage.getItem(req.params.id);
      if (!peca || peca.deletedAt) return res.status(404).json({ error: "Peça não encontrada." });
      const { arquivo, thumb } = { arquivo: peca.finalFileUrl, thumb: peca.approvalThumbUrl };
      if (!arquivo || !thumb) return res.status(409).json({ error: "A peça não tem thumb e arquivo final." });
      if (typeof req.body?.arquivo === "string" && req.body.arquivo !== arquivo) return res.status(409).json({ error: "O arquivo da peça mudou: confira de novo." });

      if (typeof req.body?.naoDeu === "string") {
        await gravar(peca.id, arquivo, thumb, { veredito: "nao_deu", motivo: req.body.naoDeu.slice(0, 200) });
        broadcast({ type: "conferencia_do_arquivo" });
        return res.json({ veredito: "nao_deu" });
      }
      const final = req.body?.final;
      if (typeof final !== "string" || final.length < 100) return res.status(400).json({ error: "Falta a imagem do arquivo final." });
      const chave = process.env.ANTHROPIC_API_KEY;
      if (!chave) return res.status(503).json({ error: "Chave da IA ausente neste servidor." });

      const extras: unknown[] = Array.isArray(req.body?.extras) ? req.body.extras.slice(0, 2) : [];
      const candidatas: CandidataDoArquivo[] = [
        { final, pagina: typeof req.body?.pagina === "string" ? req.body.pagina.slice(0, 20) : null },
        ...extras.flatMap((x) => {
          const e = x as { final?: unknown; pagina?: unknown };
          return typeof e?.final === "string" && e.final.length >= 100 ? [{ final: e.final, pagina: typeof e.pagina === "string" ? e.pagina.slice(0, 20) : null }] : [];
        }),
      ];
      for (const c of candidatas) {
        const meta = await carregarSharp()(Buffer.from(c.final, "base64")).metadata().catch(() => null);
        if (meta?.format !== "jpeg") return res.status(400).json({ error: "A imagem do arquivo final precisa ser JPEG." });
      }

      const thumbJpeg = (await jpegDoThumb(thumb)).toString("base64");
      const resultado = await compararCandidatas(candidatas, (f) => compararComIA(thumbJpeg, f, chave));
      const finalJpeg = Buffer.from(resultado.candidata.final, "base64");
      // Quem revisa vê o arquivo sem abrir a pasta: o navegador não abre caminho de rede.
      const svc = new ObjectStorageService();
      const previewUrl = resultado.veredito === "vale_olhar"
        ? svc.normalizeObjectEntityPath(await svc.uploadObjectEntityFromBuffer(finalJpeg, "image/jpeg"))
        : null;
      await gravar(peca.id, arquivo, thumb, { veredito: resultado.veredito, motivo: resultado.motivo, modelo: resultado.modelo, tokensEntrada: resultado.tokensEntrada, tokensSaida: resultado.tokensSaida, pagina: resultado.candidata.pagina, previewUrl });
      if (resultado.veredito === "vale_olhar") {
        const evento = await storage.getEvent(peca.eventId).catch(() => null);
        const notification = await storage.createNotification({
          type: "conferenciaDoArquivo",
          message: `${peca.displayId ?? peca.type}${evento ? ` — ${evento.name}` : ""}: o arquivo final parece diferente do thumb`,
          eventId: peca.eventId,
          itemId: peca.id,
          targetRoles: ["arte", "solicitacao", "admin"],
        });
        broadcast({ type: "notification_created", notification });
      }
      broadcast({ type: "conferencia_do_arquivo" });
      res.json({ veredito: resultado.veredito });
    } catch (erro) {
      console.error("[conferidor] comparar", erro);
      res.status(500).json({ error: "Não foi possível comparar agora." });
    }
  });

  // ── As telas ─────────────────────────────────────────────────────────────
  app.get("/api/conferencia-do-arquivo", requireRole("admin", "solicitacao", "arte", "grafica"), async (req, res) => {
    try {
      if (req.userKit) return res.status(403).json({ error: "A conferência não faz parte do Kit." });
      const [{ rows: linhas }, { rows: fila }, { rows: ultima }] = await Promise.all([
        pool.query(`${COLUNAS_DA_LISTA} order by e.truck_departure_date, e.name, i.display_id limit 3000`),
        pool.query(SQL_FILA_DA_TELA),
        pool.query(`select ${ISO_UTC("max(criada_em)")} as "em" from conferencias_do_arquivo`),
      ]);
      res.json({ linhas, fila, ultimaConferencia: ultima[0]?.em ?? null });
    } catch (erro) {
      console.error("[conferencia] lista", erro);
      res.status(500).json({ error: "Não foi possível carregar a conferência." });
    }
  });

  // O número do menu (dono, 04/11): "Vale olhar" e "Não deu para conferir" sem ação.
  // Só sai quando alguém resolve.
  app.get("/api/conferencia-do-arquivo/contagem", requireAuth, async (req, res) => {
    try {
      if (req.userKit || !PAPEIS_DA_CONFERENCIA.includes(req.userRole ?? "")) return res.json({ total: 0 });
      const { rows } = await pool.query(`select count(*)::int as total from (${COLUNAS_DA_LISTA} and c.veredito <> 'confere' and c.resolvida_em is null) x`);
      res.json({ total: rows[0]?.total ?? 0 });
    } catch (erro) {
      console.error("[conferencia] contagem", erro);
      res.status(500).json({ error: "Não foi possível contar os avisos." });
    }
  });

  // A ficha da Revisão Final: a conferência do arquivo e do thumb de agora.
  app.get("/api/items/:id/conferencia-do-arquivo", requireAuth, async (req, res) => {
    try {
      if (req.userKit) return res.json(null);
      const { rows } = await pool.query(`${COLUNAS_DA_LISTA} and c.item_id = $1 limit 1`, [req.params.id]);
      res.json(rows[0] ?? null);
    } catch (erro) {
      console.error("[conferencia] da peça", erro);
      res.status(500).json({ error: "Não foi possível carregar a conferência da peça." });
    }
  });

  // O aviso na peça não pode ficar preso: "só imprima depois de falar com a Arte"
  // deixa de valer quando a conversa acontece.
  app.post("/api/conferencia-do-arquivo/:id/tirar-aviso", requireRole("admin", "solicitacao", "arte", "grafica"), async (req, res) => {
    try {
      if (req.userKit) return res.status(403).json({ error: "A conferência não faz parte do Kit." });
      const { rows } = await pool.query(`select item_id as "itemId" from conferencias_do_arquivo where id = $1`, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ error: "Este aviso não existe." });
      const itemId: string = rows[0].itemId;
      await pool.query("update items set aviso_da_conferencia = null where id = $1", [itemId]);
      await createAuditLog(req, "updated", "item", itemId, "Conferência do arquivo: aviso tirado da Gráfica");
      const peca = await storage.getItem(itemId);
      if (peca) broadcast({ type: "item_updated", item: peca, eventId: peca.eventId });
      broadcast({ type: "conferencia_do_arquivo" });
      res.json({ ok: true });
    } catch (erro) {
      console.error("[conferencia] tirar aviso", erro);
      res.status(500).json({ error: "Não foi possível tirar o aviso agora." });
    }
  });

  app.post("/api/conferencia-do-arquivo/:id/resolver", requireRole("admin", "solicitacao", "arte", "grafica"), async (req, res) => {
    try {
      if (req.userKit) return res.status(403).json({ error: "A conferência não faz parte do Kit." });
      const lida = lerResolucao(req.body);
      if (!lida.ok) return res.status(400).json({ error: lida.erro });
      const quem = req.userName ?? "Sistema";
      const { rows } = await pool.query(
        `update conferencias_do_arquivo set resolvida_em = now(), resolvida_por = $2, nota = $3, resolucao = $4, reconferir = $5
          where id = $1 and resolvida_em is null returning item_id as "itemId", motivo`,
        [req.params.id, quem, lida.aviso, lida.acao, lida.acao === "corrigido"],
      );
      if (!rows[0]) return res.status(404).json({ error: "Este aviso não existe ou já foi resolvido." });
      const itemId: string = rows[0].itemId;
      const frase = lida.acao === "corrigido" ? "arquivo corrigido" : "arquivo estava certo";
      await createAuditLog(req, "updated", "item", itemId, `Conferência do arquivo: ${frase}${lida.aviso ? `. Aviso à Gráfica: ${lida.aviso}` : ""}. Motivo do alerta: ${rows[0].motivo ?? "sem motivo"}`);
      // O texto fica na peça, na tela da Gráfica, e chega também no sino dela.
      if (lida.aviso) {
        await pool.query("update items set aviso_da_conferencia = $2 where id = $1", [itemId, avisoNaPeca(lida.aviso, quem)]);
        const peca = await storage.getItem(itemId);
        if (peca) {
          const notification = await storage.createNotification({
            type: "arteApproved",
            message: `${peca.displayId ?? peca.type}: ${lida.aviso}`,
            eventId: peca.eventId,
            itemId,
            targetRoles: ["grafica"],
          });
          broadcast({ type: "notification_created", notification });
          broadcast({ type: "item_updated", item: peca, eventId: peca.eventId });
        }
      }
      broadcast({ type: "conferencia_do_arquivo" });
      res.json({ ok: true });
    } catch (erro) {
      console.error("[conferencia] resolver", erro);
      res.status(500).json({ error: "Não foi possível registrar agora." });
    }
  });
}
