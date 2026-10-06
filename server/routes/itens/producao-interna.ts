// ─────────────────────────────────────────────────────────────────────────────
// PRODUÇÃO INTERNA — "Enviar direto para a Gráfica", por peça e em lote
// (dono, 02/10: "liberar eventualmente alguma coisa direto pra gráfica…
// coisas que não passam pela arte… da solicitação direto para a gráfica").
//
// A peça sai de rascunho / solicitada / aguardando vinculação e cai em Pronto
// para Produção, pulando Vinculação, Arte, Aprovação e Revisão Final, com a
// marca `producaoInterna` gravada. As regras (quem, de onde, sem patrocinador,
// instrução obrigatória sem arquivo) moram em shared/producao-interna.ts — as
// mesmas que o botão lê para aparecer. O envio da LISTA com peças já marcadas
// é a outra porta (POST /api/events/:id/items/submit, em events.ts), que grava
// os mesmos campos por `camposDoEnvioDireto`.
//
//   POST /api/items/:id/direto-para-grafica   { instrucoes?, finalFileUrl?, finalFileName? }
//   POST /api/items/direto-para-grafica       { itemIds: string[], instrucoes? }
//
// O lote não leva arquivo (um arquivo para N peças diferentes seria o arquivo
// errado em N−1 delas): leva instrução comum. A peça do lote que já tem
// arquivo final ou instrução própria segue com o que tem (a comum só completa
// as que não têm instrução); a que não tem nada e não recebeu instrução comum
// fica de fora, com o motivo.
// ─────────────────────────────────────────────────────────────────────────────
import type { Express, Request } from "express";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { type Item, type Event, items as itemsTable, auditLogs, notifications } from "@shared/schema";
import { vemDeOrigemValida, origemDaAcao } from "@shared/maquina-de-estados";
import {
  motivoParaNaoEnviarDireto, lerInstrucoes, faltamInstrucoes, fraseDasInstrucoesQueFaltam,
  camposDoEnvioDireto, fraseDaTrilhaDoEnvioDireto, CODIGO_SEM_INSTRUCOES,
} from "@shared/producao-interna";
import { requireAuth, broadcast, translateStatus, sendSensitiveError, resolveActor } from "../shared";
import { barraEventoFinalizado, motivoEventoFechado, contadorDeBloqueio } from "../eventoFinalizado";
import { urlDeThumbValida } from "../thumb-url";
import { camposDoErro } from "../../erros";

/** O teto do lote — o mesmo das outras rotas de lote de peça. */
const MAXIMO_DO_LOTE = 500;

/**
 * KIT (14/09): cada um envia a sua lista — o usuário do Kit só as peças do
 * Kit dele; a Solicitação da Arena só as da Arena; o admin, tudo. A mesma
 * régua do envio da lista (events.ts).
 */
function foraDaListaDeQuemPede(req: Request, peca: Item): string | null {
  if (req.userRole === "admin") return null;
  if (req.userKit === true) {
    return peca.kitRemessaId && peca.criadoPorId === req.userId ? null : "É peça de outra lista — o usuário do Kit envia só as peças do Kit que criou.";
  }
  return peca.kitRemessaId ? "É peça do Kit — quem a envia é quem a criou (ou um admin)." : null;
}

/**
 * O arquivo opcional da ação por peça: o MESMO campo que a Arte preenche na
 * Finalização (caminho de rede "…\Rolo.tif" ou um arquivo subido pelo app).
 * A forma crua do bucket vira `/objects/…`, como o uploader da tela faz.
 */
export function lerArquivoDaProducaoInterna(body: Record<string, unknown>): { ok: true; arquivo: { url: string; nome: string | null } | null } | { ok: false; erro: string } {
  const bruto = body.finalFileUrl;
  if (bruto == null || bruto === "") return { ok: true, arquivo: null };
  if (typeof bruto !== "string") return { ok: false, erro: "O arquivo veio num formato inesperado — escolha de novo." };
  const v = bruto.trim();
  if (!v) return { ok: true, arquivo: null };
  if (v.length > 1000) return { ok: false, erro: "O caminho do arquivo é longo demais — confira o que foi colado." };
  const nomeBruto = typeof body.finalFileName === "string" ? body.finalFileName.trim().slice(0, 300) : "";
  return { ok: true, arquivo: { url: urlDeThumbValida(v) ?? v, nome: nomeBruto || null } };
}

type PecaParaEnviar = { peca: Item; instrucoes: string | null; arquivo: { url: string; nome: string | null } | null };

/**
 * Grava o envio de cada peça NA MESMA transação da trilha e do aviso à
 * Gráfica. O UPDATE confere de novo a etapa e a lixeira (outra pessoa pode ter
 * mexido entre a leitura e o clique): a peça que não casar volta em
 * `mudaram`, sem trilha nem aviso.
 */
async function gravarEnviosDiretos(req: Request, envios: PecaParaEnviar[], evento: Event | undefined, emLote: boolean) {
  const origem = origemDaAcao("enviar-direto-para-a-grafica") ?? [];
  const agora = new Date();
  return db.transaction(async (tx) => {
    const enviadas: Item[] = [];
    const mudaram: Item[] = [];
    for (const e of envios) {
      const [linha] = await tx
        .update(itemsTable)
        .set(camposDoEnvioDireto(agora, { instrucoes: e.instrucoes, arquivo: e.arquivo }))
        .where(and(eq(itemsTable.id, e.peca.id), inArray(itemsTable.status, origem as string[]), isNull(itemsTable.deletedAt)))
        .returning();
      if (!linha) { mudaram.push(e.peca); continue; }
      enviadas.push(linha);
      await tx.insert(auditLogs).values({
        ...resolveActor(req),
        action: "updated",
        entityType: "item",
        entityId: linha.id,
        details: fraseDaTrilhaDoEnvioDireto(translateStatus(e.peca.status), {
          instrucoes: linha.instrucoesGrafica ?? null,
          temArquivo: !!linha.finalFileUrl,
        }) + (emLote ? " (em lote)" : ""),
      });
    }
    let notificacao: unknown = null;
    if (enviadas.length > 0) {
      const nome = evento?.name ?? "evento";
      const [n] = await tx.insert(notifications).values({
        type: "arteApproved",
        message: enviadas.length === 1
          ? `Produção interna, direto para a Gráfica (sem passar pela Arte): ${enviadas[0].displayId} ${enviadas[0].type} - Evento: ${nome}${enviadas[0].finalFileUrl ? "" : " — sem arquivo, ver instruções"}`
          : `${enviadas.length} peças de produção interna chegaram direto para a Gráfica (sem passar pela Arte) - Evento: ${nome}: ${enviadas.map((p) => p.displayId).join(", ")}`,
        eventId: enviadas[0].eventId,
        itemId: enviadas.length === 1 ? enviadas[0].id : null,
        // A Gráfica AGE agora (a peça está na fila dela); o admin acompanha o
        // atalho, que pula três etapas de conferência.
        targetRoles: ["grafica", "admin"],
      }).returning();
      notificacao = n;
    }
    return { enviadas, mudaram, notificacao };
  });
}

/** POST /api/items/:id/direto-para-grafica e o lote. */
export function registrarProducaoInterna(app: Express): void {
  app.post("/api/items/:id/direto-para-grafica", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Só a Solicitação e o admin enviam peça direto para a Gráfica." });
      }
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const lidas = lerInstrucoes(corpo.instrucoes);
      if (!lidas.ok) return res.status(400).json({ error: lidas.erro });
      const lido = lerArquivoDaProducaoInterna(corpo);
      if (!lido.ok) return res.status(400).json({ error: lido.erro });

      const peca = await storage.getItem(req.params.id);
      if (!peca) return res.status(404).json({ error: "Peça não encontrada." });
      // ANDA: é o atalho que mais faz a peça andar — direto para a impressora.
      if (await barraEventoFinalizado(peca, res)) return;
      const daLista = foraDaListaDeQuemPede(req, peca);
      if (daLista) return res.status(403).json({ error: daLista });

      const patrocinadores = await storage.getItemSponsors(peca.id);
      const motivo = motivoParaNaoEnviarDireto(peca, { papel: req.userRole, temPatrocinador: patrocinadores.length > 0 });
      if (motivo) return res.status(motivo.http).json({ error: motivo.frase, code: motivo.codigo });
      // O gate de status lido da máquina de estados, como as outras rotas
      // (a regra acima já o cobre; este é o que o teste de conformidade amarra).
      if (!vemDeOrigemValida(peca.status, "enviar-direto-para-a-grafica")) {
        return res.status(409).json({ error: `A peça não pode ir direto para a Gráfica na etapa atual (${translateStatus(peca.status)}).` });
      }

      // Instrução nova manda; sem ela, vale a que a peça já tinha (escrita na lista).
      const instrucoes = lidas.instrucoes ?? peca.instrucoesGrafica ?? null;
      if (faltamInstrucoes(instrucoes, !!lido.arquivo || !!peca.finalFileUrl)) {
        return res.status(400).json({ error: fraseDasInstrucoesQueFaltam(), code: CODIGO_SEM_INSTRUCOES });
      }

      const evento = await storage.getEvent(peca.eventId);
      const { enviadas, notificacao } = await gravarEnviosDiretos(req, [{ peca, instrucoes, arquivo: lido.arquivo }], evento, false);
      if (enviadas.length === 0) {
        return res.status(409).json({ error: "A peça mudou de etapa enquanto você enviava (outra pessoa mexeu nela) — atualize a tela." });
      }
      broadcast({ type: "item_updated", item: enviadas[0] });
      if (notificacao) broadcast({ type: "notification_created", notification: notificacao as never });
      res.json(enviadas[0]);
    } catch (error) {
      const erro = camposDoErro(error);
      if (erro.httpStatus) return res.status(erro.httpStatus).json({ error: erro.message });
      sendSensitiveError(res, error, "Enviar direto para a Gráfica", 500);
    }
  });

  app.post("/api/items/direto-para-grafica", requireAuth, async (req, res) => {
    try {
      if (req.userRole !== "solicitacao" && req.userRole !== "admin") {
        return res.status(403).json({ error: "Só a Solicitação e o admin enviam peça direto para a Gráfica." });
      }
      const corpo = (req.body ?? {}) as Record<string, unknown>;
      const ids = Array.isArray(corpo.itemIds)
        ? Array.from(new Set(corpo.itemIds.filter((x): x is string => typeof x === "string" && x.trim() !== "")))
        : [];
      if (ids.length === 0 || ids.length > MAXIMO_DO_LOTE) {
        return res.status(400).json({ error: `Escolha de 1 a ${MAXIMO_DO_LOTE} peças para enviar direto para a Gráfica.` });
      }
      const lidas = lerInstrucoes(corpo.instrucoes);
      if (!lidas.ok) return res.status(400).json({ error: lidas.erro });

      const pecas = await storage.getItemsByIds(ids);
      const porId = new Map(pecas.map((p) => [p.id, p]));
      const vinculos = await storage.getItemSponsorsByItemIds(ids);
      const comPatrocinador = new Set(vinculos.map((v) => v.itemId));

      const eventoMemo = new Map<string, Promise<Event | undefined>>();
      const eventoDe = (id: string) => {
        if (!eventoMemo.has(id)) eventoMemo.set(id, storage.getEvent(id));
        return eventoMemo.get(id)!;
      };
      const bloqueio = contadorDeBloqueio();
      const ficaramDeFora: Array<{ id: string; displayId: string; motivo: string }> = [];
      const envios: PecaParaEnviar[] = [];
      for (const id of ids) {
        const peca = porId.get(id);
        if (!peca) { ficaramDeFora.push({ id, displayId: id, motivo: "Peça não encontrada." }); continue; }
        const rotulo = peca.displayId;
        const fechado = motivoEventoFechado(await eventoDe(peca.eventId));
        if (fechado) { ficaramDeFora.push({ id, displayId: rotulo, motivo: bloqueio.registra(fechado) }); continue; }
        const daLista = foraDaListaDeQuemPede(req, peca);
        if (daLista) { ficaramDeFora.push({ id, displayId: rotulo, motivo: daLista }); continue; }
        const motivo = motivoParaNaoEnviarDireto(peca, { papel: req.userRole, temPatrocinador: comPatrocinador.has(id) });
        if (motivo) { ficaramDeFora.push({ id, displayId: rotulo, motivo: motivo.frase }); continue; }
        // A instrução COMUM completa as peças que não têm a sua — a que a
        // Solicitação já escreveu na lista é mais específica e fica.
        const instrucoes = peca.instrucoesGrafica?.trim() ? peca.instrucoesGrafica : (lidas.instrucoes ?? null);
        if (faltamInstrucoes(instrucoes, !!peca.finalFileUrl)) {
          ficaramDeFora.push({ id, displayId: rotulo, motivo: "Sem arquivo e sem instruções para a Gráfica." });
          continue;
        }
        envios.push({ peca, instrucoes, arquivo: null });
      }

      if (bloqueio.respondeLoteInteiro(res, envios.length, ids.length)) return;
      if (envios.length === 0) {
        // Nada passou: 409 com a lista, para a tela dizer o porquê de cada uma.
        return res.status(409).json({
          error: ficaramDeFora.length === 1 ? `${ficaramDeFora[0].displayId}: ${ficaramDeFora[0].motivo}` : "Nenhuma das peças pode ir direto para a Gráfica — veja o motivo de cada uma.",
          enviadas: [],
          ficaramDeFora,
        });
      }

      const evento = await eventoDe(envios[0].peca.eventId);
      const { enviadas, mudaram, notificacao } = await gravarEnviosDiretos(req, envios, evento, true);
      for (const p of mudaram) ficaramDeFora.push({ id: p.id, displayId: p.displayId, motivo: "Mudou de etapa durante o envio (outra pessoa mexeu) — atualize a tela." });

      if (enviadas.length > 0) {
        broadcast({ type: "items_bulk_updated", itemIds: enviadas.map((p) => p.id), eventId: enviadas[0].eventId });
        if (notificacao) broadcast({ type: "notification_created", notification: notificacao as never });
      }
      res.json({
        enviadas: enviadas.map((p) => ({ id: p.id, displayId: p.displayId })),
        items: enviadas,
        ficaramDeFora,
      });
    } catch (error) {
      const erro = camposDoErro(error);
      if (erro.httpStatus) return res.status(erro.httpStatus).json({ error: erro.message });
      sendSensitiveError(res, error, "Enviar direto para a Gráfica (lote)", 500);
    }
  });
}
