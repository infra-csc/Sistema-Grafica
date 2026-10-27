// ─────────────────────────────────────────────────────────────────────────────
// PEÇAS SEM APROVAÇÃO — "Arte recebida" e as marcas em lote (Pedro/dono, 26/10).
//
//   POST /api/items/:id/arte-recebida        { data?: "YYYY-MM-DD" }  (RF03)
//   POST /api/items/marcas-sem-aprovacao     { itemIds, semPatrocinio?, arteDoCliente? }  (RF02)
//
// "ARTE RECEBIDA" encerra o subestado "Layout — Aguardando arte do cliente"
// (RN06). Com a peça em Aguardando Envio (na mesa da Arte) ela segue DIRETO
// para a Finalização — pula a Arte/layout e a Aprovação; a medida do arquivo
// do cliente é conferida lá (decisão validada). Antes disso (rascunho,
// solicitado, vinculação) a chegada fica registrada e a peça continua o fluxo;
// quando chegar à Arte, o mesmo botão a manda para a Finalização. Quem:
// Solicitação (recebe do cliente), Arte (confere o arquivo) e admin.
//
// O LOTE marca/desmarca as duas marcas em várias peças do MESMO evento, com a
// régua de sempre: admin e Solicitação; fora do Layout só o admin (RN07). A
// peça que não pode mudar fica de fora com o motivo — o lote não é recusado
// inteiro por causa dela. Cada peça alterada ganha a sua linha na trilha, com
// os prazos de Layout normal × ajustado daquele momento (RN10).
// ─────────────────────────────────────────────────────────────────────────────
import type { Express } from "express";
import { storage } from "../../storage";
import type { InsertItem, Item } from "@shared/schema";
import { vemDeOrigemValida } from "@shared/maquina-de-estados";
import { DESTINO_DA_DISPENSA } from "@shared/fluxo-peca";
import { problemaNaDataDoEvento, todayBusinessStr } from "@shared/prazo-dates";
import { recusaAoMarcar, recusaDaMarca, ROTULO_ARTE_DO_CLIENTE } from "@shared/prazo-sem-aprovacao";
import { ehMolde } from "@shared/molde";
import { requireAuth, broadcast, translateStatus, createAuditLog, createAuditLogsEmLote, updateEventStatus } from "../shared";
import { barraEventoFinalizado, motivoEventoDaPeca, erroEventoFechado } from "../eventoFinalizado";
import { responderErro } from "../../erros";
import { colunasDaArteDoCliente, contextoDosPrazos, frasesDasMarcas } from "../../services/marcas-de-aprovacao";

const MAXIMO_DO_LOTE = 500;
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** O dia informado (padrão hoje). `null` = inválido ou no futuro. */
function lerDiaDaChegada(v: unknown, hoje: string): string | null {
  if (v === undefined || v === null || v === "") return hoje;
  const dia = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || problemaNaDataDoEvento(dia) !== null) return null;
  return dia > hoje ? null : dia;
}

export function registrarSemAprovacao(app: Express): void {
  // ── Arte recebida ──────────────────────────────────────────────────────────
  app.post("/api/items/:id/arte-recebida", requireAuth, async (req, res) => {
    try {
      // Os mesmos de PAPEIS_DA_ARTE_RECEBIDA (@shared/prazo-sem-aprovacao), na
      // forma que a régua de permissões (shared/permissoes.ts) enxerga.
      if (req.userRole !== "admin" && req.userRole !== "solicitacao" && req.userRole !== "arte") {
        return res.status(403).json({ error: "Registrar a chegada da arte do cliente é da Solicitação, da Arte e do admin." });
      }
      const item = await storage.getItem(req.params.id);
      if (!item || item.deletedAt) return res.status(404).json({ error: "Peça não encontrada." });
      if (await barraEventoFinalizado(item, res)) return;
      if (!item.arteDoCliente) {
        return res.status(409).json({ error: `A peça não está marcada como “${ROTULO_ARTE_DO_CLIENTE}”.` });
      }
      // Molde não passa por Finalização (vai do thumb para a Revisão Final).
      if (ehMolde(item)) {
        return res.status(409).json({ error: "Molde não passa pela Finalização — use “Enviar para a Revisão Final”." });
      }
      const vaiParaFinalizacao = vemDeOrigemValida(item.status, "receber-arte-do-cliente");
      if (!vaiParaFinalizacao && !vemDeOrigemValida(item.status, "registrar-arte-do-cliente-recebida")) {
        return res.status(409).json({
          error: `A peça já saiu do Layout (${translateStatus(item.status)}) — a chegada da arte só se registra enquanto ela está em Layout.`,
        });
      }
      const hoje = todayBusinessStr();
      const dia = lerDiaDaChegada(req.body?.data, hoje);
      if (!dia) return res.status(400).json({ error: "Data inválida — informe o dia em que a arte chegou (hoje ou antes)." });

      const updates: Partial<InsertItem> = {};
      const jaTinha = item.arteRecebidaEm ? String(item.arteRecebidaEm).slice(0, 10) : null;
      if (jaTinha !== dia) {
        updates.arteRecebidaEm = dia;
        updates.arteRecebidaPor = req.userName ?? null;
      }
      if (vaiParaFinalizacao) {
        updates.status = DESTINO_DA_DISPENSA; // a fila de finalização da Arte
        updates.rejectedByCreator = false;
      }
      if (Object.keys(updates).length === 0) return res.json(item);

      const atualizada = await storage.updateItem(item.id, updates);
      if (!atualizada) return res.status(404).json({ error: "Peça não encontrada." });
      const partes = [
        jaTinha && jaTinha !== dia
          ? `Arte do cliente: chegada corrigida de ${br(jaTinha)} para ${br(dia)}`
          : jaTinha ? null : `Arte do cliente recebida em ${br(dia)} — fim do “Aguardando arte do cliente”`,
        vaiParaFinalizacao
          ? `Status alterado: ${translateStatus(item.status)} → ${translateStatus(DESTINO_DA_DISPENSA)} (arte do cliente: pula a Arte/layout e a Aprovação; a medida do arquivo é conferida na Finalização)`
          : null,
      ].filter(Boolean);
      await createAuditLog(req, "updated", "item", item.id, partes.join(" · "));
      if (vaiParaFinalizacao) await updateEventStatus(item.eventId);
      broadcast({ type: "item_updated", item: atualizada });
      res.json(atualizada);
    } catch (error) {
      responderErro(res, error, "registrar a chegada da arte do cliente");
    }
  });

  // ── Marcas em lote ─────────────────────────────────────────────────────────
  app.post("/api/items/marcas-sem-aprovacao", requireAuth, async (req, res) => {
    try {
      const corpo = (req.body ?? {}) as { itemIds?: unknown; semPatrocinio?: unknown; arteDoCliente?: unknown };
      const ids = Array.isArray(corpo.itemIds) ? Array.from(new Set(corpo.itemIds.filter((x): x is string => typeof x === "string" && x.length > 0))) : [];
      if (ids.length === 0) return res.status(400).json({ error: "Escolha ao menos uma peça." });
      if (ids.length > MAXIMO_DO_LOTE) return res.status(400).json({ error: `No máximo ${MAXIMO_DO_LOTE} peças por vez.` });
      const semPatrocinio = typeof corpo.semPatrocinio === "boolean" ? corpo.semPatrocinio : undefined;
      const arte = typeof corpo.arteDoCliente === "boolean" ? corpo.arteDoCliente : undefined;
      if (semPatrocinio === undefined && arte === undefined) {
        return res.status(400).json({ error: "Diga o que marcar: “Sem patrocínio” e/ou “Arte do cliente”." });
      }
      // Papel antes de tudo (PAPEIS_QUE_MARCAM; a régua da marca — RN07 — é por peça, abaixo).
      if (req.userRole !== "admin" && req.userRole !== "solicitacao") {
        return res.status(403).json({ error: recusaDaMarca("requested", req.userRole) });
      }

      const pecas = (await storage.getItemsByIds(ids)).filter((p) => !p.deletedAt);
      if (pecas.length === 0) return res.status(404).json({ error: "Peças não encontradas." });
      const eventos = Array.from(new Set(pecas.map((p) => p.eventId)));
      if (eventos.length > 1) return res.status(400).json({ error: "O lote é de um evento só — escolha peças do mesmo evento." });
      const motivo = await motivoEventoDaPeca(pecas[0]);
      if (motivo) return res.status(409).json({ error: erroEventoFechado(motivo), code: "EVENT_FINALIZED", reason: motivo });

      const ctx = await contextoDosPrazos(eventos[0]);
      // Quem tem patrocinador vinculado (a marca e o vínculo não convivem).
      const comPatrocinador = new Set((await storage.getItemSponsorsByItemIds(pecas.map((p) => p.id))).map((v) => v.itemId));
      const ficaramDeFora: Array<{ id: string; displayId: string; motivo: string }> = [];
      const alteradas: Item[] = [];
      const trilha: Array<{ action: string; entityType: string; entityId: string; details?: string }> = [];
      for (const p of pecas) {
        const updates: Partial<InsertItem> = {};
        if (semPatrocinio !== undefined && !!p.skipApproval !== semPatrocinio) updates.skipApproval = semPatrocinio;
        if (arte !== undefined && !!p.arteDoCliente !== arte) Object.assign(updates, colunasDaArteDoCliente(arte, req.userName ?? null));
        if (Object.keys(updates).length === 0) continue; // já estava assim
        const marcando = updates.skipApproval === true || updates.arteDoCliente === true;
        const recusa = recusaAoMarcar(
          { status: p.status, temPatrocinador: comPatrocinador.has(p.id), producaoInterna: p.producaoInterna, molde: ehMolde(p) },
          req.userRole, marcando,
        );
        if (recusa) { ficaramDeFora.push({ id: p.id, displayId: p.displayId, motivo: recusa }); continue; }
        const nova = await storage.updateItem(p.id, updates);
        if (!nova) continue;
        alteradas.push(nova);
        const frases = frasesDasMarcas(p, nova, ctx, "em lote");
        if (frases.length) trilha.push({ action: "updated", entityType: "item", entityId: p.id, details: frases.join(" · ") });
      }
      for (const id of ids) if (!pecas.some((p) => p.id === id)) ficaramDeFora.push({ id, displayId: "", motivo: "Peça não encontrada (excluída?)." });

      if (alteradas.length > 0) {
        await createAuditLogsEmLote(req, trilha);
        broadcast({ type: "items_bulk_updated", itemIds: alteradas.map((p) => p.id), eventId: eventos[0] });
      }
      res.json({ alteradas: alteradas.length, itens: alteradas, ficaramDeFora });
    } catch (error) {
      responderErro(res, error, "marcar as peças em lote");
    }
  });
}
